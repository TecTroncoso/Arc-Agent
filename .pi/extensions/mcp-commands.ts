/**
 * Arc Agent - MCP slash commands
 *
 * Adds `/mcp-add`, `/mcp-list`, and `/mcp-remove` slash commands for
 * managing `~/.pi/agent/mcp.json` interactively from the TUI.
 *
 * Reads and writes use the same helpers as the main `mcp-client.ts`
 * extension so the JSON shape is guaranteed identical.
 */

import { loadMcpJson, mcpJsonPath, saveMcpJson } from "./mcp-client.js";

interface CommandUI {
    input(prompt: string, defaultValue?: string): Promise<string>;
    confirm(message: string, defaultValue?: boolean): Promise<boolean>;
    select<T>(prompt: string, options: readonly T[]): Promise<T>;
    notify(message: string, level?: "info" | "warn" | "error"): void;
}

interface CommandContext {
    ui: CommandUI;
}

interface CommandDefinition {
    description?: string;
    handler: (args: string, ctx: CommandContext) => void | Promise<void>;
}

interface McpCommandsAPI {
    registerCommand(name: string, def: CommandDefinition): void;
}

async function promptName(ui: CommandUI, args: string, label: string): Promise<string> {
    return (args.trim() || await ui.input(label, "")).trim();
}

function parseEnvLine(line: string): Record<string, string> {
    const out: Record<string, string> = {};
    if (!line.trim()) return out;
    for (const pair of line.split(",")) {
        const idx = pair.indexOf("=");
        if (idx > 0) {
            const key = pair.slice(0, idx).trim();
            const value = pair.slice(idx + 1).trim();
            if (key) out[key] = value;
        }
    }
    return out;
}
function registerMcpCommands(pi: McpCommandsAPI): void {
    const path = mcpJsonPath();

    pi.registerCommand("mcp-list", {
        description: "List MCP servers configured in ~/.pi/agent/mcp.json",
        handler: async (_args, ctx) => {
            const cfg = loadMcpJson(path);
            const names = Object.keys(cfg.mcpServers ?? {});
            if (names.length === 0) {
                ctx.ui.notify("MCP: no servers configured.", "info");
                return;
            }
            const lines = names.map((n) => {
                const c = cfg.mcpServers?.[n];
                const transport = c?.type ?? (c?.url ? "http" : "stdio");
                const target = c?.command ?? c?.url ?? "(missing)";
                return ` - ${n} [${transport}] ${target}`;
            });
            ctx.ui.notify(`MCP servers (${names.length}):\n${lines.join("\n")}`, "info");
        },
    });

    pi.registerCommand("mcp-add", {
        description: "Add an MCP server to ~/.pi/agent/mcp.json",
        handler: async (args, ctx) => {
            const ui = ctx.ui;
            const name = await promptName(ui, args, "MCP server name:");
            if (!name) {
                ui.notify("MCP server name is required.", "warn");
                return;
            }
            const cfg = loadMcpJson(path);
            if (cfg.mcpServers?.[name]) {
                const overwrite = await ui.confirm(`Server "${name}" already exists. Overwrite?`, false);
                if (!overwrite) {
                    ui.notify("Cancelled.", "info");
                    return;
                }
            }
            const command = (await ui.input(`Command for "${name}" (e.g. npx):`, "npx")).trim();
            if (!command) {
                ui.notify("MCP command is required.", "warn");
                return;
            }
            const argsLine = await ui.input(`Args for "${name}" (space-separated, empty for none):`, "");
            const argsList = argsLine.trim() ? argsLine.trim().split(/\s+/) : [];
            const envLine = await ui.input(`Env vars (KEY=VALUE, comma-separated, optional):`, "");
            const env = parseEnvLine(envLine);
            if (!cfg.mcpServers) cfg.mcpServers = {};
            cfg.mcpServers[name] = { command, args: argsList, env, type: "stdio" };
            saveMcpJson(path, cfg);
            ui.notify(`MCP: server "${name}" saved. Restart the session to load it.`, "info");
        },
    });

    pi.registerCommand("mcp-remove", {
        description: "Remove an MCP server from ~/.pi/agent/mcp.json",
        handler: async (args, ctx) => {
            const ui = ctx.ui;
            const name = await promptName(ui, args, "Server name to remove:");
            if (!name) {
                ui.notify("MCP server name is required.", "warn");
                return;
            }
            const cfg = loadMcpJson(path);
            if (!cfg.mcpServers?.[name]) {
                ui.notify(`MCP server "${name}" not found.`, "warn");
                return;
            }
            const confirm = await ui.confirm(`Remove MCP server "${name}"?`, false);
            if (!confirm) {
                ui.notify("Cancelled.", "info");
                return;
            }
            delete cfg.mcpServers[name];
            saveMcpJson(path, cfg);
            ui.notify(`MCP: server "${name}" removed. Restart the session to apply.`, "info");
        },
    });
}

export default registerMcpCommands;


