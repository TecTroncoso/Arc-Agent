/**
 * Interactive wizard for OpenAI-compatible endpoints.
 *
 * /add-provider [baseUrl]
 *   Prompts for a base URL and API key, probes {baseUrl}/models to discover
 *   model ids, lets you pick which models to expose, registers the provider
 *   immediately (no restart needed), and persists it to ~/.pi/agent/models.json
 *   so it loads on every startup.
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

const MODELS_TIMEOUT_MS = 15_000;

function modelsJsonPath(): string {
	return join(getAgentDir(), "models.json");
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

export async function fetchModelIds(baseUrl: string, apiKey: string): Promise<string[]> {
	const headers: Record<string, string> = { Accept: "application/json" };
	if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
	const response = await fetch(`${baseUrl}/models`, { headers, signal: AbortSignal.timeout(MODELS_TIMEOUT_MS) });
	if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
	const payload = (await response.json()) as { data?: Array<{ id?: unknown }> };
	if (!Array.isArray(payload.data)) throw new Error("response has no data[] array");
	const ids = payload.data.map((entry) => String(entry?.id ?? "")).filter((id) => id.length > 0);
	if (ids.length === 0) throw new Error("data[] contains no model ids");
	return [...new Set(ids)].sort();
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

/**
 * Highest thinking level exposed by a model, or an empty string when the model
 * does not support reasoning. Mirrors the helper in the coding-agent TUI so
 * the model-context command prints the same label the /model selector shows.
 * Null entries in `thinkingLevelMap` are treated as unsupported.
 */
function maxThinkingLevelLabelInline(model: Model<any>): string {
	if (!model.reasoning) return "";
	const map = (model.thinkingLevelMap ?? {}) as Record<string, unknown>;
	const supported = (level: string): boolean => level in map && map[level] !== null;
	if (supported("max")) return "max";
	if (supported("xhigh")) return "xhigh";
	if (supported("high")) return "high";
	if (supported("medium")) return "medium";
	if (supported("low")) return "low";
	if (supported("minimal")) return "minimal";
	return "yes";
}


export function buildProviderConfig(
	baseUrl: string,
	apiKey: string,
	modelIds: string[],
	reasoning: boolean,
): ProviderConfig {
	return {
		baseUrl,
		api: "openai-completions",
		apiKey: apiKey || "EMPTY",
		models: modelIds.map((id) => ({
			id,
			name: id,
			reasoning,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 128_000,
			maxTokens: 8192,
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
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/add-provider is available in interactive mode", "warning");
				return;
			}

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

			let discovered: string[];
			try {
				discovered = await fetchModelIds(baseUrl, apiKey.trim());
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Could not list models from ${baseUrl}/models: ${message}`, "error");
				return;
			}

			const modelIds = await selectModelIds(ctx, discovered);
			if (!modelIds || modelIds.length === 0) return;

			const reasoning = await ctx.ui.confirm(
				"Reasoning support",
				"Do these models support extended thinking (reasoning)? Change it later per model in models.json.",
			);

			const path = modelsJsonPath();
			let config: ModelsJson;
			try {
				config = loadModelsJson(path);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Cannot parse ${path}: ${message}. Fix or remove the file first.`, "error");
				return;
			}
			config.providers ??= {};
			if (config.providers[providerId] !== undefined) {
				const overwrite = await ctx.ui.confirm(
					`Provider "${providerId}" already exists`,
					"Replace its configuration in models.json?",
				);
				if (!overwrite) return;
			}

			const providerConfig = buildProviderConfig(baseUrl, apiKey.trim(), modelIds, reasoning);
			config.providers[providerId] = providerConfig;
			saveModelsJson(path, config);

			// Register immediately so /model picks it up without a restart.
			pi.registerProvider(providerId, providerConfig);

			// Scope /model to explicitly added providers only.
			if (!updateEnabledModels(getAgentDir(), providerId, true)) {
				ctx.ui.notify(`Could not update enabledModels in settings.json; add "${providerId}/*" manually.`, "warning");
			} else {
				// Refresh the runtime's view of enabledModels so the new glob takes
				// effect without a session reload. Older pi versions without these
				// setters keep the old on-disk-only behaviour.
				if (typeof ctx.setEnabledModels === "function") {
					const current = ctx.scopedModels;
					const snapshot = readEnabledModels(getAgentDir());
					if (snapshot && !snapshot.includes(`${providerId}/*`)) {
						ctx.setEnabledModels([...snapshot, `${providerId}/*`]);
					}
					// setScopedModels so /scoped-models and Ctrl+P cycling pick up the
					// new provider's models right away.
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
			}

			ctx.ui.notify(
				`Added ${providerId} (${modelIds.length} model${modelIds.length === 1 ? "" : "s"}) at ${baseUrl}. Available now in /model and /scoped-models.`,
			);
		},
	});

	pi.registerCommand("remove-provider", {
		description: "Remove a custom provider from models.json",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/remove-provider is available in interactive mode", "warning");
				return;
			}

			const path = modelsJsonPath();
			let config: ModelsJson;
			try {
				config = loadModelsJson(path);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Cannot parse ${path}: ${message}`, "error");
				return;
			}
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

	pi.registerCommand("model-context", {
		description: "Dump full model context (api, baseUrl, compat, thinking map, cost) for one provider or all",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const target = (args ?? "").trim();
			const all = ctx.modelRuntime.getAvailableSnapshot();
			const providers = new Set(all.map((m) => m.provider));
			if (target) {
				if (!providers.has(target)) {
					ctx.ui.notify(
						`Provider "${target}" not found. Available: ${[...providers].sort().join(", ")}`,
						"error",
					);
					return;
				}
			}
			const header = target
				? `Model context for "${target}" (${all.filter((m) => m.provider === target).length} model${all.filter((m) => m.provider === target).length === 1 ? "" : "s"})`
				: `Model context for all providers (${providers.size} provider${providers.size === 1 ? "" : "s"}, ${all.length} model${all.length === 1 ? "" : "s"})`;
			ctx.ui.notify(header, "info");
			const grouped = new Map<string, typeof all>();
			for (const m of all) {
				if (target && m.provider !== target) continue;
				const list = grouped.get(m.provider) ?? [];
				list.push(m);
				grouped.set(m.provider, list);
			}
			const lines: string[] = [];
			for (const [provider, models] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
				lines.push(`\n[${provider}]`);
				const hasAuth = ctx.modelRuntime.hasConfiguredAuth(provider);
				lines.push(`  auth: ${hasAuth ? "configured" : "missing"}`);
				const anyCompat = models.some((m) => m.compat);
				if (anyCompat) lines.push("  compat:");
				for (const m of models) {
					const compatKeys = m.compat
						? Object.keys(m.compat).filter((k) => (m.compat as Record<string, unknown>)[k] !== undefined)
						: [];
					if (m.compat && compatKeys.length > 0) {
						for (const key of compatKeys) {
							const value = (m.compat as Record<string, unknown>)[key];
							lines.push(`    ${m.id}.${key} = ${JSON.stringify(value)}`);
						}
					}
				}
				if (models[0]?.baseUrl) {
					const firstBase = models[0].baseUrl;
					const sameBase = models.every((m) => m.baseUrl === firstBase);
					lines.push(`  baseUrl: ${sameBase ? firstBase : "(varies per model)"}`);
				}
				lines.push("  models:");
				for (const m of models.sort((a, b) => a.id.localeCompare(b.id))) {
					const thinking = maxThinkingLevelLabelInline(m);
					const reasoningTag = m.reasoning
						? thinking
							? `thinking=${thinking}`
							: "thinking=yes"
						: "thinking=no";
					const cost = `in=${m.cost.input}/out=${m.cost.output}/cr=${m.cost.cacheRead}/cw=${m.cost.cacheWrite}`;
					const input = m.input.join("+");
					lines.push(
						`    ${m.id}  api=${m.api}  ctx=${m.contextWindow}  out=${m.maxTokens}  input=${input}  ${reasoningTag}  ${cost}`,
					);
				}
			}
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}

