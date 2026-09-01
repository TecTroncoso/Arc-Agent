# Changelog

All notable changes to **Arc Agent** are documented here. Arc Agent is
a fork of [earendil-works/pi](https://github.com/earendil-works/pi) with
custom extensions, skills, and SDD scaffolding on top of the upstream
pi releases. The fork identity is preserved as the `0.84.x-arc.N`
versioning scheme on `@earendil-works/pi-coding-agent`.

For per-package changes inherited from upstream pi, see
`packages/*/CHANGELOG.md`. The entries below cover only the changes
that distinguish this fork from upstream.

## [0.85.0-arc.1] - 2026-08-28

### Changed

- **Version bump from 0.84.4-arc.1 to 0.85.0-arc.1.** The version is
  bumped to clear a false-positive "Update Available" banner raised by
  the upstream SemVer comparison (see the `0.85.0-arc.1` entry in
  `packages/coding-agent/CHANGELOG.md` for the full rationale). No code
  change; the runtime is still on top of upstream v0.84.4.

## [0.84.4-arc.1] - 2026-08-28

First Arc Agent release on top of upstream pi v0.84.4. The base was
upgraded from upstream v0.84.3 to v0.84.4 by resetting the branch
to `b79e4cc` and re-applying the fork's customizations; no conflicts
arose because the only API-surface change between releases
(`ccfe79e` ui_prompt_start / ui_prompt_end extension events) is
additive. The previous 0.84.3 state is preserved as the tag
`backup/pre-0.84.4-mcp`.

### Added

- **Arc Agent branding** under the `@earendil-works` scope, with the
  Arc Agent identity carried through the README, CHANGELOGs, and
  default profile descriptions.
- **`/add-provider` slash command** at `.pi/extensions/add-provider.ts`
  for interactively adding any OpenAI-compatible endpoint
  (Ollama, OpenRouter, gateways, custom servers) with auto-discovery
  of the server's `/v1/models` list and live metadata extraction
  (context window, max tokens, pricing) when the endpoint exposes
  it.
- **`/remove-provider` slash command** that lists and removes
  providers added through `/add-provider` and keeps
  `enabledModels` in sync.
- **`/profile` slash command** at `.pi/extensions/profile-switcher.ts`
  for switching between named persona/runtime presets
  (`pi`, `arc`, `minimal`). The `arc` profile replaces the system
  prompt with the body of `.pi/skills/arc-orchestrator/SKILL.md`
  for every turn. Profiles live in
  `~/.pi/agent/profiles/<name>.json`.
- **MCP client** at `.pi/extensions/mcp-client.ts` that turns Arc
  Agent into a Model Context Protocol client. Reads
  `~/.pi/agent/mcp.json` (Anthropic format), spawns each configured
  stdio server, performs the JSON-RPC 2.0 handshake, and re-exposes
  the server's tools through `pi.registerTool` as
  `mcp__<server>__<tool>`. Supports `tools/list` and `tools/call`
  with timeouts and graceful shutdown.
- **SDD/OpenSpec scaffolding** at `.pi/extensions/sdd-init.ts` and
  `.pi/extensions/arc-agents/` (38 assets). `/sdd-init` installs
  the `.arc/` directory layout (agents, chains, support,
  migrations) from the bundled assets.
- **13 curated skills** in `.pi/skills/`, covering orchestration
  (`arc-orchestrator`), PR/release workflows (`arc-branch-pr`,
  `arc-chained-pr`, `release`, `work-unit-commits`), documentation
  (`cognitive-doc-design`, `comment-writer`), issue/decision flows
  (`arc-issue-creation`, `arc-judgment-day`,
  `arc-rdd-defect-workflow`), and skill meta (`arc-skill-creator`,
  `arc-skill-improver`, `arc-skill-registry`).
- **`pi-pretty` integration shim** that wraps
  `@heyhuynhgiabuu/pi-pretty` as a no-op when the optional
  dependency is not installed.

### Changed

- **Base upgraded from upstream v0.84.3 to v0.84.4.** The fork's
  customizations were re-applied on top of upstream v0.84.4
  (commit `b79e4cc`) without any conflict against the extension
  API surface.

### Tests

- **Hermetic tests for the MCP client** at
  `packages/coding-agent/test/extensions/mcp-client.test.ts`. Spawns
  a small Node script as the fake server so the test runs offline
  and exercises the real JSON-RPC handshake, tool registration,
  and tool-call forwarding.
