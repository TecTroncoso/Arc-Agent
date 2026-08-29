/**
 * Arc Agent - profile switcher
 *
 * Implements `/profile` to switch between named profiles that bundle:
 *   - persona (system prompt prefix injected via `before_agent_start`)
 *   - model preference (with interactive picker if not currently active)
 *   - thinking level
 *   - enabled models (providers shown in /scoped-models)
 *   - scoped models (defaults)
 *   - theme
 *
 * Built-in profiles (created on first run, user-editable):
 *   - pi      : vanilla pi, no persona, no model override
 *   - arc     : Arc Agent senior-architect persona (Identity Rule + Compact Rules)
 *   - minimal : no persona, thinking off
 *
 * Custom profiles are loaded from `~/.pi/agent/profiles/<name>.json` and
 * override the matching field of the active built-in profile.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { ARC_PERSONA_FALLBACK } from "./lib/personas.ts";
import { pickFromList, type UI } from "./lib/ui-helpers.ts";

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

interface Profile {
	name: string;
	description?: string;
	persona?: "none" | "arc";
	model?: { provider: string; modelId: string };
	thinking?: ThinkingLevel;
	enabledModels?: string[];
	scopedModels?: Array<{ provider: string; modelId: string; thinkingLevel?: ThinkingLevel }>;
	theme?: string;
}

function readArcOrchestratorSkill(cwd: string): string | undefined {
	const skillPath = join(cwd, ".pi", "skills", "arc-orchestrator", "SKILL.md");
	if (!existsSync(skillPath)) return undefined;
	const raw = readFileSync(skillPath, "utf8");
	const m = raw.match(/^---[\s\S]*?---\s*([\s\S]+)$/);
	return m ? m[1].trim() : raw.trim();
}

const BUILTIN_PROFILES: Record<string, Profile> = {
	pi: {
		name: "pi",
		description: "Vanilla pi, no persona prefix, no model override.",
		persona: "none",
		thinking: "medium",
	},
	arc: {
		name: "arc",
		description: "Arc Agent senior-architect persona, with arc-orchestrator discipline.",
		persona: "arc",
		thinking: "medium",
		enabledModels: ["openrouter/*", "emperoorg/*", "opencodezen/*"],
	},
	minimal: {
		name: "minimal",
		description: "No persona, thinking off, no scoped defaults.",
		persona: "none",
		thinking: "off",
	},
};

function agentDir(): string {
	return process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
}

function readJson(path: string, fallback: unknown): unknown {
	if (!existsSync(path)) return fallback;
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return fallback;
	}
}

function ensureBuiltinProfiles(): void {
	const profilesDir = join(agentDir(), "profiles");
	mkdirSync(profilesDir, { recursive: true });
	for (const [name, profile] of Object.entries(BUILTIN_PROFILES)) {
		const p = join(profilesDir, `${name}.json`);
		if (!existsSync(p)) {
			writeFileSync(p, JSON.stringify(profile, null, 2), "utf8");
		}
	}
}

function readProfile(name: string): Profile | undefined {
	return readJson(join(agentDir(), "profiles", `${name}.json`), undefined) as Profile | undefined;
}

function readActiveProfileName(): string {
	const j = readJson(join(agentDir(), "active-profile.json"), {}) as { name?: string };
	return j.name && BUILTIN_PROFILES[j.name] ? j.name : "pi";
}

function writeActiveProfileName(name: string): void {
	const path = join(agentDir(), "active-profile.json");
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify({ name }, null, 2), "utf8");
}

function listProfileNames(): string[] {
	ensureBuiltinProfiles();
	return Object.keys(BUILTIN_PROFILES);
}

type ExtensionAPI = {
	registerCommand(
		name: string,
		options: {
			description: string;
			handler: (args: string, ctx: Record<string, unknown>) => Promise<void> | void;
		},
	): void;
	on(
		event: "before_agent_start",
		handler: (event: { systemPrompt: string }) => { systemPrompt?: string } | undefined | void,
	): void;
	ui: UI;
	setThinkingLevel?: (level: ThinkingLevel) => void;
	setEnabledModels?: (patterns: string[] | undefined) => void;
	setScopedModels?: (
		models: Array<{ model: { provider: string; id: string }; thinkingLevel?: ThinkingLevel }> | undefined,
	) => void;
	modelRuntime?: {
		getAvailableSnapshot(): ReadonlyArray<{ model: { provider: string; id: string } }>;
	};
	hasUI: boolean;
};

export default function (pi: ExtensionAPI): void {
	ensureBuiltinProfiles();

	pi.on("before_agent_start", (event) => {
		const activeName = readActiveProfileName();
		const profile = readProfile(activeName);
		if (!profile || profile.persona !== "arc") return;
		const cwd = event.systemPromptOptions?.cwd ?? process.cwd();
		const skillContent = readArcOrchestratorSkill(cwd);
		if (skillContent) {
			return { systemPrompt: skillContent };
		}
		return { systemPrompt: ARC_PERSONA_FALLBACK };
	});

	pi.registerCommand("profile", {
		description: "Switch between Arc Agent profiles (pi, arc, minimal).",
		handler: async (rawArgs, ctx) => {
			const ui = (ctx as { ui: ExtensionAPI["ui"] }).ui;
			const runtime = (ctx as { modelRuntime?: ExtensionAPI["modelRuntime"] }).modelRuntime;
			const setter = ctx as {
				setThinkingLevel?: ExtensionAPI["setThinkingLevel"];
				setEnabledModels?: ExtensionAPI["setEnabledModels"];
				setScopedModels?: ExtensionAPI["setScopedModels"];
			};
			const hasUI = (ctx as { hasUI?: boolean }).hasUI === true;

			const args = rawArgs.trim();
			const names = listProfileNames();
			const current = readActiveProfileName();

			if (args === "" || args === "list") {
				if (hasUI) {
					const choice = await pickFromList(ui, `Active profile: ${current}`, names, "(no change)");
					if (!choice) {
						ui.notify(`Profile unchanged: ${current}`, "info");
						return;
					}
					await applyProfile(choice, ui, runtime, setter);
				} else {
					ui.notify(`Profiles: ${names.join(", ")}. Active: ${current}.`, "info");
				}
				return;
			}

			if (args === "current" || args === "show") {
				const profile = readProfile(current);
				ui.notify(`Active: ${current} - ${profile?.description ?? "(no description)"}`, "info");
				return;
			}

			if (!names.includes(args)) {
				ui.notify(`Unknown profile: ${args}. Available: ${names.join(", ")}`, "error");
				return;
			}

			await applyProfile(args, ui, runtime, setter);
		},
	});

	async function applyProfile(
		name: string,
		ui: ExtensionAPI["ui"],
		runtime: ExtensionAPI["modelRuntime"] | undefined,
		setter: {
			setThinkingLevel?: ExtensionAPI["setThinkingLevel"];
			setEnabledModels?: ExtensionAPI["setEnabledModels"];
			setScopedModels?: ExtensionAPI["setScopedModels"];
		},
	): Promise<void> {
		const profile = readProfile(name);
		if (!profile) {
			ui.notify(`Profile ${name} not found on disk`, "error");
			return;
		}

		writeActiveProfileName(name);
		const changes: string[] = [`profile=${name}`];

		if (profile.thinking && setter.setThinkingLevel) {
			try {
				setter.setThinkingLevel(profile.thinking);
				changes.push(`thinking=${profile.thinking}`);
			} catch (e) {
				ui.notify(
					`Could not set thinking level: ${e instanceof Error ? e.message : String(e)}`,
					"warning",
				);
			}
		}

		if (profile.enabledModels && setter.setEnabledModels) {
			setter.setEnabledModels(profile.enabledModels);
			changes.push(`enabledModels=[${profile.enabledModels.join(", ")}]`);
		}

		if (profile.scopedModels && setter.setScopedModels && runtime) {
			const snapshot = runtime.getAvailableSnapshot();
			const resolved: Array<{ model: { provider: string; id: string }; thinkingLevel?: ThinkingLevel }> = [];
			for (const s of profile.scopedModels) {
				const hit = snapshot.find((x) => x.model.provider === s.provider && x.model.id === s.modelId);
				if (hit) {
					resolved.push({ model: hit.model, thinkingLevel: s.thinkingLevel });
				}
			}
			setter.setScopedModels(resolved);
			changes.push(`scopedModels=${resolved.length}`);
		}

		if (profile.model) {
			changes.push(
				`model=${profile.model.provider}/${profile.model.modelId} (apply manually via /model if needed)`,
			);
		}

		if (profile.theme) {
			changes.push(`theme=${profile.theme} (apply via /theme)`);
		}

		ui.notify(`Profile applied: ${changes.join(", ")}${profile.persona === "arc" ? " (system prompt replaced with arc-orchestrator skill)" : ""}`, "info");
	}
}
