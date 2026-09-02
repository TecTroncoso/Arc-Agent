/**
 * Tests for the .pi/extensions/mcp-commands.ts slash command extension.
 *
 * The commands manage ~/.pi/agent/mcp.json interactively from the TUI.
 * The test uses PI_CODING_AGENT_DIR to redirect the file path to a temp
 * directory, then exercises the mcp-add / mcp-list / mcp-remove flow
 * with a stub ui that captures inputs and confirmations.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");
const EXTENSION_PATH = join(REPO_ROOT, ".pi", "extensions", "mcp-commands.ts");

interface FakeUI {
    inputCalls: string[];
    confirmCalls: string[];
    notifications: Array<{ message: string; level: string }>;
    inputResponse: (prompt: string) => string;
    confirmResponse: (message: string, defaultValue: boolean) => boolean;
}

function makeFakeUI(opts: {
    inputResponses?: string[];
    confirmResponses?: boolean[];
} = {}) {
    const inputQueue = [...(opts.inputResponses ?? [])];
    const confirmQueue = [...(opts.confirmResponses ?? [])];
    const inputCalls: string[] = [];
    const confirmCalls: string[] = [];
    const notifications: Array<{ message: string; level: string }> = [];
    return {
        // Pass-through ui shape expected by the extension
        input: (prompt: string) => {
            inputCalls.push(prompt);
            return Promise.resolve(inputQueue.shift() ?? "");
        },
        confirm: (message: string, defaultValue: boolean) => {
            confirmCalls.push(message);
            return Promise.resolve(confirmQueue.shift() ?? defaultValue);
        },
        notify: (message: string, level: string) => {
            notifications.push({ message, level });
        },
        // Inspectable state for assertions
        inputCalls,
        confirmCalls,
        notifications,
    };
}

async function loadExtension() {
    const mod = await import(EXTENSION_PATH);
    return mod.default as (pi: any) => void;
}

describe("MCP commands extension", () => {
    let tempDir: string;
    let originalDir: string | undefined;

    beforeEach(() => {
        originalDir = process.env.PI_CODING_AGENT_DIR;
        tempDir = mkdtempSync(join(tmpdir(), "arc-mcp-cmds-"));
        process.env.PI_CODING_AGENT_DIR = tempDir;
    });

    afterEach(() => {
        if (tempDir) rmSync(tempDir, { recursive: true, force: true });
        if (originalDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
        else process.env.PI_CODING_AGENT_DIR = originalDir;
    });

    it("registers the three expected commands", async () => {
        const registerMcpCommands = await loadExtension();
        const registered: string[] = [];
        registerMcpCommands({
            registerCommand: (name: string) => registered.push(name),
            ui: makeFakeUI(),
        });
        expect(registered.sort()).toEqual(["mcp-add", "mcp-list", "mcp-remove"]);
    });

    it("mcp-list notifies when no servers are configured", async () => {
        const registerMcpCommands = await loadExtension();
        const ui = makeFakeUI();
        const handlers: Record<string, (args: string, ctx: any) => Promise<void>> = {};
        registerMcpCommands({
            registerCommand: (name: string, def: any) => { handlers[name] = def.handler; },
            ui: ui as any,
        });
        await handlers["mcp-list"]("", { ui: { ...ui, notify: (m: string, l: string) => ui.notifications.push({ message: m, level: l }) } });
        expect(ui.notifications).toHaveLength(1);
        expect(ui.notifications[0].message).toContain("no servers configured");
    });

    it("mcp-add writes a new server to mcp.json with parsed env", async () => {
        const registerMcpCommands = await loadExtension();
        const ui = makeFakeUI({
            inputResponses: ["my-server", "npx", "-y my-mcp", "API_KEY=secret,DEBUG=1"],
        });
        const handlers: Record<string, (args: string, ctx: any) => Promise<void>> = {};
        registerMcpCommands({
            registerCommand: (name: string, def: any) => { handlers[name] = def.handler; },
            ui: ui as any,
        });
        await handlers["mcp-add"]("", {
            ui: {
                ...ui,
                notify: (m: string, l: string) => ui.notifications.push({ message: m, level: l }),
            },
        });
        const written = JSON.parse(readFileSync(join(tempDir, "mcp.json"), "utf8"));
        expect(written.mcpServers["my-server"]).toEqual({
            command: "npx",
            args: ["-y", "my-mcp"],
            env: { API_KEY: "secret", DEBUG: "1" },
            type: "stdio",
        });
    });

    it("mcp-add prompts for overwrite when name exists and respects cancel", async () => {
        writeFileSync(join(tempDir, "mcp.json"), JSON.stringify({
            mcpServers: { existing: { command: "old", type: "stdio" } },
        }));
        const registerMcpCommands = await loadExtension();
        const ui = makeFakeUI({
            inputResponses: ["existing", "new", ""],
            confirmResponses: [false],
        });
        const handlers: Record<string, (args: string, ctx: any) => Promise<void>> = {};
        registerMcpCommands({
            registerCommand: (name: string, def: any) => { handlers[name] = def.handler; },
            ui: ui as any,
        });
        await handlers["mcp-add"]("", {
            ui: {
                ...ui,
                notify: (m: string, l: string) => ui.notifications.push({ message: m, level: l }),
            },
        });
        const written = JSON.parse(readFileSync(join(tempDir, "mcp.json"), "utf8"));
        expect(written.mcpServers["existing"].command).toBe("old");
        expect(ui.notifications.some(n => n.message === "Cancelled.")).toBe(true);
    });

    it("mcp-remove deletes the named server and notifies", async () => {
        writeFileSync(join(tempDir, "mcp.json"), JSON.stringify({
            mcpServers: { keep: { command: "k", type: "stdio" }, drop: { command: "d", type: "stdio" } },
        }));
        const registerMcpCommands = await loadExtension();
        const ui = makeFakeUI({ confirmResponses: [true] });
        const handlers: Record<string, (args: string, ctx: any) => Promise<void>> = {};
        registerMcpCommands({
            registerCommand: (name: string, def: any) => { handlers[name] = def.handler; },
            ui: ui as any,
        });
        await handlers["mcp-remove"]("drop", {
            ui: {
                ...ui,
                notify: (m: string, l: string) => ui.notifications.push({ message: m, level: l }),
            },
        });
        const written = JSON.parse(readFileSync(join(tempDir, "mcp.json"), "utf8"));
        expect(Object.keys(written.mcpServers)).toEqual(["keep"]);
        expect(ui.notifications.some(n => n.message.includes("removed"))).toBe(true);
    });

    it("mcp-remove warns when the named server does not exist", async () => {
        const registerMcpCommands = await loadExtension();
        const ui = makeFakeUI();
        const handlers: Record<string, (args: string, ctx: any) => Promise<void>> = {};
        registerMcpCommands({
            registerCommand: (name: string, def: any) => { handlers[name] = def.handler; },
            ui: ui as any,
        });
        await handlers["mcp-remove"]("nonexistent", {
            ui: {
                ...ui,
                notify: (m: string, l: string) => ui.notifications.push({ message: m, level: l }),
            },
        });
        expect(ui.notifications.some(n => n.message.includes("not found"))).toBe(true);
    });
});


