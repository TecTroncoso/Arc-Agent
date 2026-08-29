<p align="center">
  <h1 align="center">Arc Agent</h1>
  <p align="center">
    Interactive, self-extensible coding agent CLI. Forked and maintained by
    <a href="https://github.com/TecTroncoso">@TecTroncoso</a>.
  </p>
</p>
<p align="center">
  <a href="https://github.com/TecTroncoso/Arc-Agent/issues"><img alt="Issues" src="https://img.shields.io/github/issues/TecTroncoso/Arc-Agent?style=flat-square" /></a>
  <a href="https://github.com/TecTroncoso/Arc-Agent/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/TecTroncoso/Arc-Agent?style=flat-square" /></a>
  <a href="https://github.com/TecTroncoso/Arc-Agent/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/TecTroncoso/Arc-Agent?style=flat-square" /></a>
</p>

# Arc Agent

Arc Agent is an interactive coding agent CLI for the terminal. It is a fork of the Pi Agent Harness maintained by [@TecTroncoso](https://github.com/TecTroncoso), focused on a clean configuration and a zero-noise contribution workflow.

* Run an LLM-driven coding agent in your terminal with read/edit/write/bash tools.
* Plug any OpenAI-compatible endpoint (local servers, OpenRouter, gateways, custom providers) with a single slash command.
* Ship a CLI and a standalone binary straight from this repository.

## Packages

| Package | Description |
|---------|-------------|
| **[@earendil-works/pi-coding-agent](packages/coding-agent)** | Interactive coding agent CLI |
| **[@earendil-works/pi-agent-core](packages/agent)** | Agent runtime with tool calling and state management |
| **[@earendil-works/pi-ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) |
| **[@earendil-works/pi-tui](packages/tui)** | Terminal UI library with differential rendering |
| **[@earendil-works/pi-telemetry](packages/telemetry)** | Vendor-neutral telemetry contracts and reference adapter |

## Adding OpenAI-compatible providers without editing code

The repository ships with an extension in `.pi/extensions/add-provider.ts` that exposes two slash commands in the interactive CLI:

* **`/add-provider [url]`** — interactively prompts for `baseUrl`, `apiKey`, and an internal id; queries `{baseUrl}/models`; lets you pick all models or a subset; and persists the configuration to `~/.pi/agent/models.json`. The new provider is registered live, so it is selectable from `/model` immediately.
* **`/remove-provider`** — lists configured providers and removes the chosen one from both `models.json` and the live registry.

Both commands keep the `enabledModels` filter in `~/.pi/agent/settings.json` in sync, so `/model` only shows the providers you have actually added.

## Model Context Protocol (MCP) client

Arc Agent ships with a built-in MCP client extension at `.pi/extensions/mcp-client.ts`. The extension reads `~/.pi/agent/mcp.json`, spawns each configured server, performs the JSON-RPC handshake over stdio, and re-exports the server's tools through the same tool registry the LLM uses for native tools. No extra runtime dependencies are required.

Drop servers into `~/.pi/agent/mcp.json` in the standard Anthropic format:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:\\path\\to\\root"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "ghp_..." }
    }
  }
}
```

Tools from MCP servers are registered with a qualified name of the form `mcp__<server>__<tool>` so they never collide with built-in tools or with tools from other servers. The LLM sees them like any other tool, and you can call them with the same tool-use flow.

What works:

* `stdio` transport (the most common one for local servers).
* `initialize` / `notifications/initialized` handshake.
* `tools/list` discovery and `tools/call` invocation.
* Per-server startup timeout (10s) and per-request timeout (30s).
* Graceful shutdown of all spawned servers on `session_shutdown`.
* Servers that fail to start are logged and skipped, so one bad server does not take the others down.

What is not implemented yet:

* `http` and `sse` transports (only `stdio` is supported today; servers with `"type": "http"` or `"url": "..."` are skipped with a warning).
* `prompts`, `resources`, `sampling`, `roots`, `elicitation` (only `tools/*` methods are wired up).

If a server entry uses `http`/`sse`, the extension logs a warning and skips it. Servers that start successfully are added to the tool registry; a slow startup (more than 10s) is also treated as a failure and skipped.

## Profiles

The repository ships an extension in `.pi/extensions/profile-switcher.ts` that exposes the `/profile` slash command. Profiles bundle a persona, thinking level, and `enabledModels` filter into named presets stored in `~/.pi/agent/profiles/<name>.json`. The first time `/profile` runs, it seeds three built-in profiles:

* **`pi`** *(default)* — vanilla Pi. The system prompt is left untouched; the model behaves exactly as the upstream Pi agent. No persona is prepended.
* **`arc`** — Arc Agent senior-architect mode. The system prompt is **replaced** with the body of `.pi/skills/arc-orchestrator/SKILL.md` for every turn, so the model runs with the full discipline (Identity Rule, Compact Rules, Work Routing, Hard delegation triggers). Also applies `setThinkingLevel(medium)` and `setEnabledModels([openrouter/*, emperoorg/*, opencodezen/*])`.
* **`minimal`** — no persona, `thinking=off`, no scoped defaults. Useful for fast one-shot prompts where you want zero ceremony.

Switching is one command and reversible at any time:

```
/profile            # show the picker
/profile arc        # activate the arc profile
/profile pi         # go back to vanilla Pi
/profile current    # show the active profile
```

The persona switch is enforced via the `before_agent_start` hook, so the change takes effect on the very next turn — no restart required. Custom profiles can be added by dropping additional JSON files into `~/.pi/agent/profiles/`.

## Development

```bash
npm install --ignore-scripts  # Install all dependencies without running lifecycle scripts
npm run hydrate:model-data    # Fetch provider model catalogs (required before the first check/build)
npm run build                 # Build all packages
npm run build:offline         # Rebuild using cached model data without network access
npm run check                 # Lint, format, and type check
./test.sh                     # Run the test suite (skips tests that need live API keys)
./pi-test.bat                 # Run the CLI from sources on Windows
./pi-test.sh                  # Run the CLI from sources on Unix
```

## Skills

The repository ships a curated set of reusable skills under `.pi/skills/`. Skills auto-load when their trigger description matches the user's request, and all are renamed to Arc Agent branding.

* **`arc-orchestrator`** — senior-architect discipline for non-trivial work. Auto-loads on complex tasks, refactors, architecture decisions, multi-file changes, OpenSpec, TDD, and risky changes; skips trivial edits.
* **`branch-pr`** / **`chained-pr`** — open, link, and chain pull requests across dependent branches.
* **`cognitive-doc-design`** — design documents that match how the model reasons about code.
* **`comment-writer`** — write code review comments in a consistent house style.
* **`issue-creation`** — file issues with enough context to be actionable.
* **`release`** — orchestrate a release: changelog, version bump, tag, publish.
* **`work-unit-commits`** — break a change into a series of logically-named commits.
* **`skill-creator`** / **`skill-improver`** / **`skill-registry`** — create, refine, and list skills.
* **`judgment-day`** — multi-perspective review of a focused change. Falls back to a single self-review pass when the external review binary is not installed; explicitly notes when that happens.
* **`rdd-defect-workflow`** — discover, fix, and re-verify a defect through the review pipeline. Collapses to a single discover+fix pass without the external review binary.

A reusable prompt at `.pi/prompts/skill-creation.md` is available for guided skill authoring. The shared review contract used by the review-related skills lives in [`docs/upstream-review-contract.md`](docs/upstream-review-contract.md).

## Project initialization

The `/sdd-init` slash command (extension at `.pi/extensions/sdd-init.ts`) scaffolds the SDD/OpenSpec layout that the `arc-orchestrator` and review skills expect. Run it inside the project you want to initialize and it will create `.arc/`, `.arc/agents/`, `.arc/chains/`, `.arc/support/`, and `.arc/migrations/` from the bundled templates in `.pi/extensions/arc-agents/`. Run it again on an already-initialized project and it will detect the existing layout and offer to migrate or refresh. No external binaries required.

## Building standalone binaries

The release pipeline produces a standalone Bun-based executable and the npm package from a single source archive. Use `npm run release:local -- --out <dir>` to produce a non-published local build, or trigger `.github/workflows/build-binaries.yml` by pushing a `v*` tag.

## Permissions & Containerization

Arc Agent does not include a built-in permission system for restricting filesystem, process, network, or credential access. By default, it runs with the permissions of the user and process that launched it. If you need stronger boundaries, containerize or sandbox the process. See [packages/coding-agent/docs/containerization.md](packages/coding-agent/docs/containerization.md) for three patterns (Gondolin, plain Docker, OpenShell).

## Contributing

Issues and pull requests are welcome. Before opening a pull request, run `npm run check` and make sure the test suite passes with `./test.sh`.

## Maintainer

* [@TecTroncoso](https://github.com/TecTroncoso)

## License

MIT. See [LICENSE](LICENSE) for the full text. Arc Agent is a fork of [earendil-works/pi](https://github.com/earendil-works/pi); the original copyright is preserved in the license file.
