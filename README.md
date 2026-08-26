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
