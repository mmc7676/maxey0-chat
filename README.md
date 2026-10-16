# Maxey0 · Structured Context Worlds

Maxey0 and its Structured Context Worlds (SCWs), packaged for Claude. Version 3.2.0, 2026-10-16.

An SCW (Structured Context World) is a named container for a piece of work: a description, files, and the steps that run in it. SCWs can sit inside other SCWs. Maxey0 is the orchestrator: you set up SCWs, agents and workflows in an inline dashboard or by typing, and Maxey0 runs them with agents and shows their progress.

| Folder | What it is | Status |
|---|---|---|
| `plugins/maxey0` | The `maxey0` skill (also packaged as a plugin) with an **inline dashboard** drawn in the chat for SCWs, agents and workflows. No connector, server or sign-in. | Primary install |
| `server` | Optional remote MCP server (Cloudflare Worker) that holds SCWs server-side and enforces agent scope at the tool layer, with an MCP Apps dashboard. | Optional |
| `apps/scw-privacy-chatgpt` | *Maxey0 SCWs for ChatGPT Ads* v3.2: a privacy-first ad boundary for ChatGPT Free and Go users, one application of logical SCWs. | App + tests |
| `research` | Sources for the paper *Logical Structured Context Worlds* (v3.1) and the in-chat dashboard write-up. | Research |

## Install

### Claude app (web, desktop and mobile): the `maxey0` plugin

1. Download [`dist/maxey0-plugin-v3.2.0.zip`](https://github.com/mmc7676/maxey0-chat/raw/main/dist/maxey0-plugin-v3.2.0.zip). Not GitHub's green **Code > Download ZIP**, which is the whole repository.
2. On claude.ai, remove any older Maxey0 plugin (Customize > Plugins > open it > menu > **Remove**) and any standalone `maxey0` skill (Customize > Skills).
3. Customize > Plugins > **Add** > **Upload plugin**, and select the zip.
4. In any chat, on web or mobile, type `/` and pick **maxey0**.
5. Optional, for artifacts and server-held SCWs: add the remote server below as a custom connector. The plugin does not bundle it yet (no `.mcp.json`), because the server's only credential is the key in its URL and plugin files must not carry secrets. It will be bundled once the server has OAuth.

`dist/maxey0-skill-v3.2.0.zip` holds the same skill on its own, for accounts that use skills without plugins.

### Claude Code

```
/plugin install maxey0 --marketplace mmc7676/maxey0-chat
```

Then `/maxey0:maxey0`. The same skill is also in `dist/maxey0-plugin-v3.2.0.zip` for plugin uploads.

`dist/` holds only the current version; checksums are in `dist/SHA256SUMS`.

### Optional: the remote server

Gives SCWs that persist across chats and scope enforced by the server rather than by the model, and stores artifacts as objects shown as live tiles (`maxey0_open_artifacts`). `scripts/import-index.mjs` loads an artifact index made from a claude.ai data export.

```
cd server && npm install
cp wrangler.toml.example wrangler.toml     # then add your KV namespace id
npx wrangler kv namespace create MAXEY0_KV
npx wrangler secret put WORKSPACE_KEY      # 16+ random characters
npm test && npm run deploy
```

- **Claude Code:** `claude mcp add --transport http maxey0 https://<your-worker>.workers.dev/mcp/<WORKSPACE_KEY>`. Tested against a local copy of this server with the real Claude Code client, with no sign-in step.
- **Claude app connector:** add the same URL under Customize > Connectors > Add custom connector, with no OAuth fields. Claude documents authless servers as supported; an earlier attempt failed at a sign-in step and is being re-tested. The key in the URL is the only protection, so treat the URL as a password.

When the server's tools are present, the skills use them; otherwise they use the inline dashboard.

## What is enforced, and where

- **Plugin (logical SCWs):** the boundary is what Maxey0 puts into each agent's context: its own SCW's description and files, and the results it waits for. Isolation inside the model's own reasoning in plain chat is not claimed.
- **Server:** for calls that name an agent (`asAgent`), out-of-scope reads and writes are refused with `isolation_violation` and logged.
- **ChatGPT app:** its own evaluator enforces your policy inside the app; in ChatGPT only ChatGPT's settings are enforced and the exported profile is advisory. See its README.

## Verify

| Component | Command |
|---|---|
| Plugin dashboard | `cd plugins/maxey0/tests && npm install && npm test` (needs a Chromium; set `CHROME`) |
| Server | `cd server && npm install && npm run typecheck && npm test` |
| ChatGPT app | see `apps/scw-privacy-chatgpt/README.md`, section *Reproducing the results* |

## Credits

Concept, architecture and direction: Mike Cohan (Human0), Maxey0 · human@maxey0.com. Built with Maxey0-Claude.

License: to be chosen by the author before public release.

ChatGPT is a trademark of OpenAI. This project is independent and not affiliated with or endorsed by OpenAI.
