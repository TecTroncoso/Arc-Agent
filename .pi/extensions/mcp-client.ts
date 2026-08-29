/**
 * Arc Agent - Model Context Protocol (MCP) client
 *
 * Reads `~/.pi/agent/mcp.json` (Anthropic format), spawns each
 * configured server, negotiates the MCP handshake over stdio using
 * JSON-RPC 2.0, and re-exports the server's tools through
 * `pi.registerTool` so the LLM can call them as if they were native
 * Arc Agent tools.
 *
 * Spec: https://modelcontextprotocol.io/specification
 * Format: https://docs.anthropic.com/en/docs/agents-and-tools/mcp
 *
 * Implements just enough of the spec to be useful:
 *   - initialize / notifications/initialized handshake
 *   - tools/list, tools/call
 *   - ping (for liveness)
 *   - graceful shutdown on session_shutdown
 *
 * Does NOT implement: prompts, resources, sampling, roots,
 * elicitation. Add later as needed.
 *
 * No external dependencies. JSON-RPC is hand-rolled and the stdio
 * transport is `child_process.spawn` plus line-buffered reads from
 * stdout.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";

const MCP_PROTOCOL_VERSION = "2024-11-05";
const MCP_CLIENT_INFO = { name: "arc-agent", version: "0.84.3" };
const REQUEST_TIMEOUT_MS = 30_000;
const STARTUP_TIMEOUT_MS = 10_000;
const MAX_LOG_BYTES = 4096;

interface McpStdioServerConfig {
	command: string;
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
}

interface McpJsonServerConfig {
	command?: string;
	url?: string;
	type?: "stdio" | "http" | "sse";
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
	headers?: Record<string, string>;
}

interface McpJson {
	mcpServers?: Record<string, McpJsonServerConfig>;
}

interface McpToolDescriptor {
	name: string;
	description?: string;
	inputSchema?: unknown;
}

interface McpToolCallResult {
	content: Array<
		| { type: "text"; text: string }
		| { type: "image"; data: string; mimeType: string }
	>;
	isError?: boolean;
}

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (reason: Error) => void;
	timer: NodeJS.Timeout;
}

/**
 * One MCP server over stdio.
 *
 * Spawns a child process, drives the JSON-RPC 2.0 transport on its
 * stdin/stdout, runs the `initialize` handshake + `notifications/initialized`
 * acknowledgement, and pulls the initial tool list. Once `ready` resolves,
 * `getTools()` returns the discovered tools and `callTool` forwards
 * `tools/call` requests to the server.
 *
 * Error and lifecycle handling: a request that fails on the server side
 * rejects with an `Error("MCP error <code>: <message>")`. A request that
 * exceeds `REQUEST_TIMEOUT_MS` rejects with a timeout error. If the
 * child process exits, all in-flight requests reject with an exit error.
 * Callers should `await ensureReady()` before interacting and call `close()`
 * on shutdown to send `shutdown` and kill the process.
 */
class McpStdioClient {
	private proc: ChildProcessWithoutNullStreams;
	private buffer = "";
	private nextId = 1;
	private pending = new Map<number, PendingRequest>();
	private serverName: string;
	private capabilities: Record<string, unknown> = {};
	private tools: McpToolDescriptor[] = [];
	private ready: Promise<void>;

	constructor(
		serverName: string,
		command: string,
		args: string[],
		env: Record<string, string>,
		cwd?: string,
	) {
		this.serverName = serverName;
		this.proc = spawn(command, args, {
			env: { ...process.env, ...env },
			cwd,
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
		});

		this.proc.stdout.setEncoding("utf8");
		this.proc.stdout.on("data", (chunk: string) => this.onStdout(chunk));
		this.proc.stderr.setEncoding("utf8");
		this.proc.stderr.on("data", (chunk: string) => {
			const trimmed = chunk.length > MAX_LOG_BYTES ? chunk.slice(0, MAX_LOG_BYTES) + "..." : chunk;
			console.warn(`[mcp:${serverName}] stderr: ${trimmed.trim()}`);
		});
		this.proc.on("exit", (code, signal) => this.onExit(code, signal));
		this.proc.on("error", (err) => this.onProcessError(err));

		this.ready = this.initialize();
	}

	private onStdout(chunk: string): void {
		this.buffer += chunk;
		let idx: number;
		while ((idx = this.buffer.indexOf("\n")) !== -1) {
			const line = this.buffer.slice(0, idx).trim();
			this.buffer = this.buffer.slice(idx + 1);
			if (line.length === 0) continue;
			this.handleFrame(line);
		}
	}

	private handleFrame(line: string): void {
		let msg: {
			id?: number;
			result?: unknown;
			error?: { code: number; message: string; data?: unknown };
		};
		try {
			msg = JSON.parse(line);
		} catch {
			console.warn(`[mcp:${this.serverName}] non-JSON frame ignored: ${line.slice(0, 200)}`);
			return;
		}
		if (msg.id === undefined) {
			// Notification from server; no action required for the methods we implement.
			return;
		}
		const pending = this.pending.get(msg.id);
		if (!pending) {
			console.warn(`[mcp:${this.serverName}] response for unknown id ${msg.id}`);
			return;
		}
		this.pending.delete(msg.id);
		clearTimeout(pending.timer);
		if (msg.error) {
			pending.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
		} else {
			pending.resolve(msg.result);
		}
	}

	private send(method: string, params?: unknown): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const id = this.nextId++;
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`MCP request ${method} timed out after ${REQUEST_TIMEOUT_MS}ms`));
			}, REQUEST_TIMEOUT_MS);
			this.pending.set(id, { resolve, reject, timer });
			const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
			this.proc.stdin.write(payload, (err) => {
				if (err) {
					clearTimeout(timer);
					this.pending.delete(id);
					reject(err instanceof Error ? err : new Error(String(err)));
				}
			});
		});
	}

	private async initialize(): Promise<void> {
		const result = (await this.send("initialize", {
			protocolVersion: MCP_PROTOCOL_VERSION,
			capabilities: {},
			clientInfo: MCP_CLIENT_INFO,
		})) as {
			capabilities?: Record<string, unknown>;
			serverInfo?: { name?: string; version?: string };
		};
		this.capabilities = result.capabilities ?? {};
		// Acknowledge the handshake so the server starts accepting requests.
		const ack = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n";
		this.proc.stdin.write(ack);
		const toolsResult = (await this.send("tools/list", {})) as { tools?: McpToolDescriptor[] };
		this.tools = toolsResult.tools ?? [];
	}

	async ensureReady(): Promise<void> {
		await Promise.race([
			this.ready,
			new Promise<void>((_, reject) =>
				setTimeout(
					() => reject(new Error(`MCP server ${this.serverName} did not become ready`)),
					STARTUP_TIMEOUT_MS,
				),
			),
		]);
	}

	getTools(): McpToolDescriptor[] {
		return this.tools;
	}

	async callTool(name: string, args: unknown): Promise<McpToolCallResult> {
		return (await this.send("tools/call", { name, arguments: args ?? {} })) as McpToolCallResult;
	}

	async ping(): Promise<boolean> {
		try {
			await this.send("ping", {});
			return true;
		} catch {
			return false;
		}
	}

	async close(): Promise<void> {
		try {
			await this.send("shutdown", {});
		} catch {
			// server may already be gone
		}
		try {
			this.proc.stdin.end();
		} catch {
			// ignore
		}
		if (!this.proc.killed) {
			this.proc.kill();
		}
	}

	private onExit(code: number | null, signal: NodeJS.Signals | null): void {
		for (const [id, pending] of this.pending) {
			clearTimeout(pending.timer);
			pending.reject(new Error(`MCP server ${this.serverName} exited (code=${code}, signal=${signal})`));
			this.pending.delete(id);
		}
	}

	private onProcessError(err: Error): void {
		for (const [id, pending] of this.pending) {
			clearTimeout(pending.timer);
			pending.reject(err);
			this.pending.delete(id);
		}
	}
}

function mcpJsonPath(): string {
	const override = process.env.PI_CODING_AGENT_DIR?.trim();
	const base = override || join(homedir(), ".pi", "agent");
	return join(base, "mcp.json");
}

function loadMcpJson(path: string): McpJson {
	if (!existsSync(path)) return {};
	try {
		return JSON.parse(readFileSync(path, "utf8")) as McpJson;
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		console.warn(`[mcp] cannot parse ${path}: ${message}`);
		return {};
	}
}

/**
 * Build a TypeBox schema from an MCP `inputSchema` (a JSON Schema
 * object). Supports the common subset: type, properties, required,
 * enum, description. Unknown shapes fall back to a permissive object.
 */
function inputSchemaToTypeBox(schema: unknown): ReturnType<typeof Type.Object> {
	const s = (schema ?? {}) as {
		type?: string;
		properties?: Record<string, unknown>;
		required?: string[];
	};
	if (s.type !== "object" || !s.properties) {
		return Type.Object({}, { additionalProperties: true });
	}
	const shape: Record<string, unknown> = {};
	for (const [key, propSchema] of Object.entries(s.properties)) {
		const ps = propSchema as {
			type?: string;
			description?: string;
			enum?: unknown[];
		};
		const opts: { description?: string; enum?: unknown[] } = {};
		if (ps.description) opts.description = ps.description;
		if (Array.isArray(ps.enum)) opts.enum = ps.enum;
		switch (ps.type) {
			case "string":
				shape[key] = Type.String(opts);
				break;
			case "number":
			case "integer":
				shape[key] = Type.Number(opts);
				break;
			case "boolean":
				shape[key] = Type.Boolean(opts);
				break;
			case "array":
				shape[key] = Type.Array(Type.String(), opts);
				break;
			default:
				shape[key] = Type.String(opts);
		}
	}
	return Type.Object(shape, { additionalProperties: true });
}

/**
 * Arc Agent extension entry point. Wires the JSON-RPC transport (one
 * `McpStdioClient` per configured server) into pi's tool registry, so
 * the LLM can call any MCP server tool as if it were a native pi tool.
 *
 * Lifecycle:
 *   1. Read `~/.pi/agent/mcp.json`.
 *   2. For each server, spawn the process and run the handshake.
 *   3. As each server's `tools/list` returns, register every tool as
 *      `mcp__<server>__<tool>` via `pi.registerTool`.
 *   4. On `session_shutdown`, send `shutdown` to each server and kill
 *      the process.
 */
export default function mcpClientExtension(pi: {
	registerTool: (tool: {
		name: string;
		label: string;
		description: string;
		parameters: unknown;
		execute: (
			toolCallId: string,
			params: unknown,
			signal: AbortSignal | undefined,
			onUpdate: ((details: unknown) => void) | undefined,
			ctx: { mode: string; ui: { notify: (msg: string, kind?: string) => void } },
		) => Promise<{ content: Array<{ type: "text"; text: string }> }>;
	}) => void;
	on: (event: string, handler: () => void | Promise<void>) => void;
}): void {
	const configPath = mcpJsonPath();
	const config = loadMcpJson(configPath);
	const servers = config.mcpServers ?? {};

	if (Object.keys(servers).length === 0) {
		return;
	}

	const clients: McpStdioClient[] = [];
	const failedServers: string[] = [];

	for (const [name, serverCfg] of Object.entries(servers)) {
		if (serverCfg.url || serverCfg.type === "http" || serverCfg.type === "sse") {
			console.warn(`[mcp:${name}] non-stdio transports (http/sse) not yet supported; skipping`);
			continue;
		}
		if (!serverCfg.command) {
			console.warn(`[mcp:${name}] no "command" field; skipping`);
			continue;
		}
		const cfg = serverCfg as McpStdioServerConfig;
		let client: McpStdioClient;
		try {
			client = new McpStdioClient(name, cfg.command, cfg.args ?? [], cfg.env ?? {}, cfg.cwd);
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			console.warn(`[mcp:${name}] spawn failed: ${message}`);
			failedServers.push(name);
			continue;
		}
		clients.push(client);
		client
			.ensureReady()
			.then(() => {
				for (const tool of client.getTools()) {
					const toolName = tool.name;
					const serverLabel = name;
					const qualifiedName = `mcp__${name}__${toolName}`;
					const description = tool.description ?? `MCP tool ${toolName} from server ${name}`;
					const parameters = inputSchemaToTypeBox(tool.inputSchema);
					pi.registerTool({
						name: qualifiedName,
						label: `${serverLabel}: ${toolName}`,
						description,
						parameters,
						async execute(_toolCallId, params, signal, _onUpdate, ctx) {
							if (signal?.aborted) {
								throw new Error("MCP tool call aborted");
							}
							let result: McpToolCallResult;
							try {
								result = await client.callTool(toolName, params);
							} catch (e) {
								const message = e instanceof Error ? e.message : String(e);
								ctx.ui.notify(`MCP tool ${toolName} failed: ${message}`, "error");
								throw e;
							}
							const text = result.content
								.filter((c) => c.type === "text")
								.map((c) => (c.type === "text" ? c.text : ""))
								.join("\n");
							return {
								content: [{ type: "text" as const, text: text || "(no text content returned)" }],
							};
						},
					});
				}
			})
			.catch((e) => {
				const message = e instanceof Error ? e.message : String(e);
				console.warn(`[mcp:${name}] startup failed: ${message}`);
				failedServers.push(name);
			});
	}

	if (failedServers.length > 0) {
		console.warn(`[mcp] ${failedServers.length} server(s) failed to start: ${failedServers.join(", ")}`);
	}

	pi.on("session_shutdown", async () => {
		await Promise.all(
			clients.map(async (c) => {
				try {
					await c.close();
				} catch {
					// best effort
				}
			}),
		);
	});
}
