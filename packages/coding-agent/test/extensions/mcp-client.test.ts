/**
 * Tests for the .pi/extensions/mcp-client.ts MCP client extension.
 *
 * The extension lives in the user's workspace (not in the packages/
 * tree), so this test imports it via a relative path. The extension's
 * default export is a `(pi) => void` factory; we feed it a minimal stub
 * pi and assert the registered tool calls behave as expected.
 *
 * The test does NOT spawn a real MCP server: the protocol surface
 * is small enough (initialize + tools/list + tools/call over JSON-RPC
 * 2.0 stdio) that we run a small Node script as the "server" with a
 * deterministic set of replies. This keeps the test hermetic and fast.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Resolve the extension path relative to this test file (which is at
// packages/coding-agent/test/extensions/mcp-client.test.ts), so the
// resolved path is <repo>/.pi/extensions/mcp-client.ts regardless of the
// vitest invocation cwd.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");
const EXTENSION_PATH = join(REPO_ROOT, ".pi", "extensions", "mcp-client.ts");

function makeFakeServerScript(tools: Array<{ name: string; description: string }>): string {
	const toolsJson = JSON.stringify(tools);
	return `#!/usr/bin/env node
const TOOLS = ${toolsJson};
let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf("\\n")) !== -1) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.method === "initialize") {
      process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:msg.id,result:{protocolVersion:"2024-11-05",capabilities:{tools:{}},serverInfo:{name:"fake",version:"0.0.1"}}}) + "\\n");
    } else if (msg.method === "tools/list") {
      process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:msg.id,result:{tools:TOOLS}}) + "\\n");
    } else if (msg.method === "tools/call") {
      const text = "echo: " + (msg.params && msg.params.arguments ? (msg.params.arguments.message || "") : "");
      process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:msg.id,result:{content:[{type:"text",text}]}}) + "\\n");
    } else if (msg.method === "shutdown") {
      process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:msg.id,result:{}}) + "\\n");
    }
  }
});`;
}

describe("MCP client extension", () => {
	let tempDir: string;
	let serverScript: string;
	let registeredTools: Array<{ name: string; label: string; execute: (...args: unknown[]) => Promise<unknown> }>;
	let shutdownHandler: (() => Promise<void>) | undefined;

	beforeAll(async () => {
		tempDir = mkdtempSync(join(tmpdir(), "arc-mcp-test-"));
		process.env.PI_CODING_AGENT_DIR = tempDir;

		serverScript = join(tempDir, "fake-mcp.mjs");
		writeFileSync(serverScript, makeFakeServerScript([
			{ name: "echo", description: "Echoes its input" },
			{ name: "reverse", description: "Reverses a string" },
		]), "utf8");
		writeFileSync(join(tempDir, "mcp.json"), JSON.stringify({
			mcpServers: { fake: { command: process.execPath, args: [serverScript] } },
		}), "utf8");

		registeredTools = [];
		shutdownHandler = undefined;
		const stub = {
			registerTool(tool: typeof registeredTools[0]) { registeredTools.push(tool); },
			on(_e: string, h: () => Promise<void>) { shutdownHandler = h; },
		};
		const mod = await import(pathToFileURL(EXTENSION_PATH).href);
		(mod as { default: (pi: unknown) => void }).default(stub);
		await new Promise((r) => setTimeout(r, 500));
	});

	afterAll(async () => {
		if (shutdownHandler) {
			try { await shutdownHandler(); } catch { /* best effort */ }
		}
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
		delete process.env.PI_CODING_AGENT_DIR;
	});

	it("registers one tool per MCP server tool with the mcp__<server>__<tool> naming", () => {
		expect(registeredTools).toHaveLength(2);
		const names = registeredTools.map((t) => t.name).sort();
		expect(names).toEqual(["mcp__fake__echo", "mcp__fake__reverse"]);
	});

	it("uses the server label in the tool label", () => {
		const echo = registeredTools.find((t) => t.name === "mcp__fake__echo");
		expect(echo?.label).toBe("fake: echo");
	});

	it("forwards a tool call to the server and returns the text content", async () => {
		const echo = registeredTools.find((t) => t.name === "mcp__fake__echo");
		expect(echo).toBeDefined();
		const result = (await echo!.execute("call-1", { message: "hello" }, undefined, undefined, {
			mode: "tui",
			ui: { notify: vi.fn() },
		})) as { content: Array<{ type: string; text: string }> };
		expect(result.content[0]?.text).toBe("echo: hello");
	});
});
