/**
 * Interactive wizard for OpenAI-compatible endpoints.
 *
 * /add-provider [baseUrl]
 *   Prompts for a base URL and API key, probes {baseUrl}/models to discover
 *   models, lets you pick which ones to expose, registers the provider
 *   immediately (no restart needed), and persists it to ~/.pi/agent/models.json
 *   so it loads on every startup. When the endpoint reports per-model metadata
 *   (OpenRouter-style context_length / max_completion_tokens / pricing), the
 *   real values are stored; otherwise conservative defaults are used.
 *
 * /remove-provider
 *   Lists providers stored in models.json and deletes the selected one.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Model } from "@earendil-works/pi-ai";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

interface ModelsJson {
	providers?: Record<string, unknown>;
	[key: string]: unknown;
}

interface ProviderModel {
	id: string;
	name: string;
	reasoning: boolean;
	input: ("text" | "image")[];
	cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
	contextWindow: number;
	maxTokens: number;
}

interface ProviderConfig {
	baseUrl: string;
	api: "openai-completions";
	apiKey?: string;
	models: ProviderModel[];
}

/** Model entry as discovered from GET {baseUrl}/models. Metadata is optional. */
interface DiscoveredModel {
	id: string;
	contextWindow?: number;
	maxTokens?: number;
	input: ("text" | "image")[];
	cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

const MODELS_TIMEOUT_MS = 15_000;

function modelsJsonPath(): string {
	return join(getAgentDir(), "models.json");
}

/** No-op if the command was already invoked from an interactive TUI session. */
function requireTui(ctx: ExtensionCommandContext): boolean {
	if (ctx.mode !== "tui") {
		ctx.ui.notify("/add-provider is available in interactive mode", "warning");
		return false;
	}
	return true;
}

/** Read models.json and bail with a notify if it is missing or malformed. */
function loadModelsJsonOrNotify(
	path: string,
	ctx: ExtensionCommandContext,
): ModelsJson | undefined {
	try {
		return loadModelsJson(path);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx.ui.notify(`Cannot parse ${path}: ${message}. Fix or remove the file first.`, "error");
		return undefined;
	}
}

/**
 * Push the just-added provider into the live runtime so /model and
 * /scoped-models pick it up without a session reload. Returns true when
 * the on-disk `enabledModels` filter was updated successfully; the
 * in-vivo setters are best-effort and degrade silently on older pi
 * versions that do not expose them.
 */
function refreshRuntimeProviderVisibility(
	ctx: ExtensionCommandContext,
	providerId: string,
	modelIds: string[],
): boolean {
	if (!updateEnabledModels(getAgentDir(), providerId, true)) {
		ctx.ui.notify(
			`Could not update enabledModels in settings.json; add "${providerId}/*" manually.`,
			"warning",
		);
		return false;
	}
	if (typeof ctx.setEnabledModels === "function") {
		const current = ctx.scopedModels;
		const snapshot = readEnabledModels(getAgentDir());
		if (snapshot && !snapshot.includes(`${providerId}/*`)) {
			ctx.setEnabledModels([...snapshot, `${providerId}/*`]);
		}
		if (typeof ctx.setScopedModels === "function") {
			const newModels = modelIds
				.map((id) => ctx.modelRegistry.getModel(providerId, id))
				.filter((m): m is Model<any> => m !== undefined)
				.map((model) => ({ model }));
			const known = new Set(current.map((s) => `${s.model.provider}/${s.model.id}`));
			const additions = newModels.filter((s) => !known.has(`${s.model.provider}/${s.model.id}`));
			if (additions.length > 0) {
				ctx.setScopedModels([...current, ...additions]);
			}
		}
	}
	return true;
}

export function normalizeBaseUrl(raw: string): string | undefined {
	const trimmed = raw.trim();
	if (!trimmed) return undefined;
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		return undefined;
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
	let base = trimmed.replace(/\/+$/, "");
	if (!/\/v\d+$/.test(base)) base += "/v1";
	return base;
}

export function providerIdFromUrl(baseUrl: string): string {
	try {
		const host = new URL(baseUrl).hostname.replace(/^www\./, "").toLowerCase();
		const label =
			host
				.split(".")
				.filter((part) => !["com", "org", "net", "ai", "dev", "io", "api", "www"].includes(part))
				.join("-") || host.replace(/\./g, "-");
		const id = label.replace(/[^a-z0-9_-]/g, "-").replace(/^-+|-+$/g, "");
		return id || "custom-provider";
	} catch {
		return "custom-provider";
	}
}

function pickPositiveNumber(raw: unknown): number | undefined {
	if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
	if (typeof raw === "string") {
		const value = Number.parseFloat(raw);
		if (Number.isFinite(value) && value > 0) return value;
	}
	return undefined;
}

/**
 * Convert an OpenRouter-style $/token price string to $/million tokens,
 * mirroring packages/ai/scripts/generate-models.ts. Returns undefined when the
 * value is absent or unparseable so callers can fall back to defaults.
 */
function parseCostPerMillion(raw: unknown): number | undefined {
	if (typeof raw !== "string" && typeof raw !== "number") return undefined;
	const perToken = typeof raw === "string" ? Number.parseFloat(raw) : raw;
	if (!Number.isFinite(perToken) || perToken < 0) return undefined;
	return Math.round(perToken * 1_000_000 * 1e6) / 1e6;
}

/**
 * Parse a GET /models payload. Standard OpenAI-compatible servers only return
 * ids; richer endpoints (OpenRouter) also expose context_length,
 * top_provider.max_completion_tokens, architecture.modality and pricing, which
 * are extracted when present.
 */
export function parseDiscoveredModels(payload: unknown): DiscoveredModel[] {
	const data = (payload as { data?: unknown } | null | undefined)?.data;
	if (!Array.isArray(data)) throw new Error("response has no data[] array");
	const models = new Map<string, DiscoveredModel>();
	for (const entry of data) {
		const raw = entry as {
			id?: unknown;
			context_length?: unknown;
			top_provider?: { context_length?: unknown; max_completion_tokens?: unknown };
			architecture?: { modality?: unknown };
			pricing?: Record<string, unknown>;
		} | null | undefined;
		const id = String(raw?.id ?? "");
		if (!id) continue;
		const contextWindow =
			pickPositiveNumber(raw?.top_provider?.context_length) ?? pickPositiveNumber(raw?.context_length);
		const maxTokens = pickPositiveNumber(raw?.top_provider?.max_completion_tokens);
		const input: ("text" | "image")[] = ["text"];
		if (typeof raw?.architecture?.modality === "string" && raw.architecture.modality.includes("image")) {
			input.push("image");
		}
		const pricing = raw?.pricing;
		const inputCost = parseCostPerMillion(pricing?.prompt);
		const outputCost = parseCostPerMillion(pricing?.completion);
		const cost =
			inputCost !== undefined || outputCost !== undefined
				? {
						input: inputCost ?? 0,
						output: outputCost ?? 0,
						cacheRead: parseCostPerMillion(pricing?.input_cache_read) ?? 0,
						cacheWrite: parseCostPerMillion(pricing?.input_cache_write) ?? 0,
					}
				: undefined;
		// Merge on duplicate ids (routers often list the same model in several
		// categories): keep metadata already seen, fill in only what is missing.
		const existing = models.get(id);
		if (existing) {
			const hasImage = existing.input.includes("image") || input.includes("image");
			models.set(id, {
				id,
				contextWindow: existing.contextWindow ?? contextWindow,
				maxTokens: existing.maxTokens ?? maxTokens,
				input: hasImage ? ["text", "image"] : ["text"],
				cost: existing.cost ?? cost,
			});
		} else {
			models.set(id, {
				id,
				...(contextWindow !== undefined && { contextWindow }),
				...(maxTokens !== undefined && { maxTokens }),
				input,
				...(cost !== undefined && { cost }),
			});
		}
	}
	if (models.size === 0) throw new Error("data[] contains no model ids");
	return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function fetchDiscoveredModels(baseUrl: string, apiKey: string): Promise<DiscoveredModel[]> {
	const headers: Record<string, string> = { Accept: "application/json" };
	if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
	const response = await fetch(`${baseUrl}/models`, { headers, signal: AbortSignal.timeout(MODELS_TIMEOUT_MS) });
	if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
	return parseDiscoveredModels(await response.json());
}

export function loadModelsJson(path: string): ModelsJson {
	if (!existsSync(path)) return {};
	const raw = readFileSync(path, "utf-8");
	if (!raw.trim()) return {};
	const parsed: unknown = JSON.parse(raw);
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error("models.json root must be a JSON object");
	}
	return parsed as ModelsJson;
}

export function saveModelsJson(path: string, config: ModelsJson): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
}

/**
 * Keep settings.json enabledModels in sync so /model only lists providers the
 * user explicitly added. Adds "<id>/*" when a provider is registered, removes
 * it on removal; drops the key entirely when the list becomes empty.
 */
export function updateEnabledModels(agentDir: string, providerId: string, add: boolean): boolean {
	const path = join(agentDir, "settings.json");
	let settings: Record<string, unknown> = {};
	if (existsSync(path)) {
		try {
			const parsed: unknown = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
			if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
				settings = parsed as Record<string, unknown>;
			}
		} catch {
			return false;
		}
	}
	const glob = `${providerId}/*`;
	const current = Array.isArray(settings.enabledModels)
		? (settings.enabledModels as unknown[]).filter((entry): entry is string => typeof entry === "string")
		: [];
	if (add) {
		if (!current.includes(glob)) current.push(glob);
	} else {
		const index = current.indexOf(glob);
		if (index >= 0) current.splice(index, 1);
	}
	if (current.length === 0) delete settings.enabledModels;
	else settings.enabledModels = current;
	writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
	return true;
}

/**
 * Read the `enabledModels` list from settings.json. Returns the list when
 * present and well-formed, otherwise undefined (so the caller can fall back to
 * "no filter" semantics).
 */
export function readEnabledModels(agentDir: string): string[] | undefined {
	const path = join(agentDir, "settings.json");
	if (!existsSync(path)) return undefined;
	let settings: Record<string, unknown> = {};
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
		if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
			settings = parsed as Record<string, unknown>;
		}
	} catch {
		return undefined;
	}
	if (!Array.isArray(settings.enabledModels)) return undefined;
	return (settings.enabledModels as unknown[]).filter((entry): entry is string => typeof entry === "string");
}

export function buildProviderConfig(baseUrl: string, apiKey: string, selected: DiscoveredModel[], reasoning: boolean): ProviderConfig {
	return {
		baseUrl,
		api: "openai-completions",
		apiKey: apiKey || "EMPTY",
		models: selected.map((m) => ({
			id: m.id,
			name: m.id,
			reasoning,
			input: m.input,
			cost: m.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: m.contextWindow ?? 128_000,
			maxTokens: m.maxTokens ?? 8192,
		})),
	};
}

async function promptBaseUrl(ctx: ExtensionCommandContext, preset: string): Promise<string | undefined> {
	while (true) {
		const raw = await ctx.ui.input("Base URL of the OpenAI-compatible endpoint", preset || "http://localhost:11434/v1");
		if (raw === undefined) return undefined;
		const base = normalizeBaseUrl(raw);
		if (base) return base;
		ctx.ui.notify(`Invalid URL: ${raw.trim() || "(empty)"}`, "error");
	}
}

async function selectModelIds(ctx: ExtensionCommandContext, discovered: string[]): Promise<string[] | undefined> {
	if (discovered.length === 1) return discovered;
	const choice = await ctx.ui.select(`Found ${discovered.length} models`, ["Add all", "Choose individually"]);
	if (choice === undefined) return undefined;
	if (choice === "Add all") return discovered;

	const selected = new Set<string>();
	while (true) {
		const options = discovered.map((id) => `${selected.has(id) ? "[x]" : "[ ]"} ${id}`);
		const picked = await ctx.ui.select(`Toggle models (${selected.size}/${discovered.length}), then Done`, [
			...options,
			"Done",
		]);
		if (picked === undefined) return undefined;
		if (picked === "Done") break;
		const id = picked.replace(/^\[[ x]\] /, "");
		if (selected.has(id)) selected.delete(id);
		else selected.add(id);
	}
	return [...selected].sort();
}

export default function addProviderExtension(pi: ExtensionAPI): void {
	pi.registerCommand("add-provider", {
		description: "Add an OpenAI-compatible provider (prompts for base URL and API key)",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			if (!requireTui(ctx)) return;

			const baseUrl = await promptBaseUrl(ctx, args.trim());
			if (!baseUrl) return;

			const apiKey = (await ctx.ui.input("API key (leave empty for local servers)", "$MY_API_KEY")) ?? "";
			const defaultId = providerIdFromUrl(baseUrl);

			let providerId = "";
			while (true) {
				const raw = await ctx.ui.input("Provider id", defaultId);
				if (raw === undefined) return;
				const trimmed = raw.trim() || defaultId;
				if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
					providerId = trimmed;
					break;
				}
				ctx.ui.notify("Provider id may only contain letters, digits, dashes, and underscores", "error");
			}

			let discovered: DiscoveredModel[];
			try {
				discovered = await fetchDiscoveredModels(baseUrl, apiKey.trim());
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Could not list models from ${baseUrl}/models: ${message}`, "error");
				return;
			}

			const discoveredById = new Map(discovered.map((m) => [m.id, m]));
			const modelIds = await selectModelIds(ctx, discovered.map((m) => m.id));
			if (!modelIds || modelIds.length === 0) return;

			const reasoning = await ctx.ui.confirm(
				"Reasoning support",
				"Do these models support extended thinking (reasoning)? Change it later per model in models.json.",
			);

			const path = modelsJsonPath();
			const config = loadModelsJsonOrNotify(path, ctx);
			if (!config) return;
			config.providers ??= {};
			if (config.providers[providerId] !== undefined) {
				const overwrite = await ctx.ui.confirm(
					`Provider "${providerId}" already exists`,
					"Replace its configuration in models.json?",
				);
				if (!overwrite) return;
			}

			const selected = modelIds.flatMap((id) => {
				const found = discoveredById.get(id);
				return found ? [found] : [];
			});
			const providerConfig = buildProviderConfig(baseUrl, apiKey.trim(), selected, reasoning);
			config.providers[providerId] = providerConfig;
			saveModelsJson(path, config);

			// Register immediately so /model picks it up without a restart.
			pi.registerProvider(providerId, providerConfig);

			// Scope /model to explicitly added providers only and push the new
			// provider's models into the live runtime.
			refreshRuntimeProviderVisibility(ctx, providerId, modelIds);

			const enriched = selected.filter((m) => m.contextWindow !== undefined || m.cost !== undefined).length;
			const metadataNote = enriched > 0 ? ` Endpoint metadata (context/cost) applied to ${enriched} model${enriched === 1 ? "" : "s"}.` : "";
			ctx.ui.notify(
				`Added ${providerId} (${modelIds.length} model${modelIds.length === 1 ? "" : "s"}) at ${baseUrl}.${metadataNote} Available now in /model and /scoped-models.`,
			);
		},
	});

	pi.registerCommand("remove-provider", {
		description: "Remove a custom provider from models.json",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			if (!requireTui(ctx)) return;

			const path = modelsJsonPath();
			const config = loadModelsJsonOrNotify(path, ctx);
			if (!config) return;
			const ids = Object.keys(config.providers ?? {}).sort();
			if (ids.length === 0) {
				ctx.ui.notify("No providers configured in models.json");
				return;
			}

			const picked = await ctx.ui.select("Provider to remove", ids);
			if (picked === undefined) return;
			const removed = await ctx.ui.confirm(`Remove "${picked}"`, "Delete this provider from models.json?");
			if (!removed) return;

			delete config.providers?.[picked];
			saveModelsJson(path, config);
			pi.unregisterProvider(picked);
			updateEnabledModels(getAgentDir(), picked, false);
			// Refresh the runtime in vivo so the change is visible without a
			// session reload. Falls through silently on older pi versions.
			if (typeof ctx.setEnabledModels === "function") {
				const snapshot = readEnabledModels(getAgentDir()) ?? [];
				const filtered = snapshot.filter((pattern) => pattern !== `${picked}/*`);
				ctx.setEnabledModels(filtered.length === 0 ? undefined : filtered);
			}
			if (typeof ctx.setScopedModels === "function") {
				const remaining = ctx.scopedModels.filter(
					(s) => s.model.provider !== picked,
				);
				ctx.setScopedModels(remaining.length === 0 ? undefined : remaining);
			}
			ctx.ui.notify(`Removed ${picked} from models.json.`);
		},
	});
}

