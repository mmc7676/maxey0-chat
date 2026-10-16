# Maxey0 · Structured Context Worlds

Maxey0 and its Structured Context Worlds (SCWs), packaged for Claude. Version 0.3.0, 2026-10-16.

An SCW (Structured Context World) is a named container for a piece of work: a description, files, and the steps that run in it. SCWs can sit inside other SCWs. Maxey0 is the orchestrator: you set up SCWs, agents and workflows in the Maxey0 app drawn in the chat, or by typing, and Maxey0 runs them with agents and shows their progress. With the Maxey0 connector, the same app also holds up to 4 of your stored artifacts as live tiles side by side.

| Folder | What it is | Status |
|---|---|---|
| `plugins/maxey0` | The `maxey0` plugin: one skill that opens Maxey0, runs workflows, and applies the effort rule to every input. | Install in Claude |
| `server` | The Maxey0 connector (Cloudflare Worker): the full Maxey0 app (workflow builder plus up to 4 artifact tiles) as an MCP Apps view, stored artifacts, server-held SCWs with scope enforced at the tool layer. | Deploy, then add as a connector |
| `apps/scw-privacy-chatgpt` | *Maxey0 SCWs for ChatGPT Ads* v3.2: a privacy-first ad boundary for ChatGPT Free and Go users, one application of logical SCWs. | App + tests |
| `research` | Sources for the paper *Logical Structured Context Worlds* (v3.1) and the in-chat dashboard write-up. | Research |

## Install

Maxey0 has two parts, installed separately for now:

1. **The `maxey0` plugin** (this repo's `plugins/maxey0`): tells Claude how to open and run Maxey0.
2. **The Maxey0 connector** (this repo's `server`, deployed to your Cloudflare account): serves the app with artifact tiles and stores your artifacts and SCWs. Without it, `/maxey0` falls back to the builder alone, drawn from `cdn.jsdelivr.net`, with no artifact tiles.

The plugin does not include the connector yet (no `.mcp.json`). A plugin's files reach everyone who installs it, and this server's only credential is the key in its URL, so the URL can't go in the plugin. Once the server supports OAuth, the plugin will carry the connector and install in one step.

### The plugin, in the Claude app (web, desktop, mobile)

Either:

- **Add marketplace (updates itself):** Customize > Plugins > **Add** > **Add marketplace** > `mmc7676/maxey0-chat`, then add **maxey0** from it. New versions on `main` reach your account without reinstalling.
- **Upload the zip:** download [`dist/maxey0-plugin-v0.3.0.zip`](https://github.com/mmc7676/maxey0-chat/raw/main/dist/maxey0-plugin-v0.3.0.zip) (not GitHub's green **Code > Download ZIP**), then Customize > Plugins > **Add** > **Upload plugin**.

Remove any other Maxey0 plugin or `maxey0` skill first, so only one is installed. Then type `/` in a chat and pick **maxey0**.

### The plugin, in Claude Code

```
/plugin install maxey0 --marketplace mmc7676/maxey0-chat
```

### The connector

```
cd server && npm install
cp wrangler.toml.example wrangler.toml     # then add your KV namespace id
npx wrangler kv namespace create MAXEY0_KV
npx wrangler secret put WORKSPACE_KEY      # 16+ random characters
npm test && npx wrangler deploy
```

- **Claude app:** Customize > Connectors > **Add custom connector**, URL `https://<your-worker>.workers.dev/mcp/<WORKSPACE_KEY>`, no sign-in. The key in the URL is the only protection, so treat the URL as a password.
- **Claude Code:** `claude mcp add --transport http maxey0 https://<your-worker>.workers.dev/mcp/<WORKSPACE_KEY>`.
- **Your existing artifacts:** `node scripts/import-index.mjs <index-dir> <connector-url>` loads an index built from a claude.ai data export by `artifact_index.py`.

`dist/` holds only the current version; checksums are in `dist/SHA256SUMS`.

## Versions

One version number covers the plugin, the connector and the app, starting at **0.3.0**. Releases numbered 1.0.0 to 3.3.1 in `CHANGELOG.md` came before that and are superseded; their changes are all in 0.3.0.

## What is enforced, and where

- **Plugin (logical SCWs):** the boundary is what Maxey0 puts into each agent's context: its own SCW's description and files, and the results it waits for. Isolation inside the model's own reasoning in plain chat is not claimed.
- **Server:** for calls that name an agent (`asAgent`), out-of-scope reads and writes are refused with `isolation_violation` and logged.
- **ChatGPT app:** its own evaluator enforces your policy inside the app; in ChatGPT only ChatGPT's settings are enforced and the exported profile is advisory. See its README.

## Verify

| Component | Command |
|---|---|
| Plugin and builder | `cd plugins/maxey0/tests && npm install && npm test` (needs a Chromium; set `CHROME`) |
| Connector | `cd server && npm install && npm run typecheck && npm test` |
| App and tiles in a browser | `cd server && CDN_CACHE=<npm package cache> PLAYWRIGHT=<playwright path> npm run test:browser` |
| ChatGPT app | see `apps/scw-privacy-chatgpt/README.md`, section *Reproducing the results* |

## Credits

Concept, architecture and direction: Mike Cohan (Human0), Maxey0 · human@maxey0.com. Built with Maxey0-Claude.

License: to be chosen by the author before public release.

ChatGPT is a trademark of OpenAI. This project is independent and not affiliated with or endorsed by OpenAI.
