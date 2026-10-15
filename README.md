# Maxey0 · Structured Context Worlds

Maxey0 and its Structured Context Worlds (SCWs), packaged for Claude. Version 3.0.0, 2026-10-14.

An SCW (Structured Context World) is a named container for a piece of work: a description, files, and the steps that run in it. SCWs can sit inside other SCWs. Maxey0 is the orchestrator: you set up SCWs, agents and workflows in an inline dashboard or by typing, and Maxey0 runs them with agents and shows their progress.

| Folder | What it is | Status |
|---|---|---|
| `plugins/maxey0` | The plugin: `maxey0` and `scw` skills with an **inline dashboard** drawn in the chat for SCWs, agents and workflows. No connector, server or sign-in. | Primary install |
| `server` | Optional remote MCP server (Cloudflare Worker) that holds SCWs server-side and enforces agent scope at the tool layer, with an MCP Apps dashboard. | Optional |
| `apps/scw-privacy-chatgpt` | *Maxey0 SCWs for ChatGPT Ads* v3.2: a privacy-first ad boundary for ChatGPT Free and Go users, one application of logical SCWs. | App + tests |
| `research` | Sources for the paper *Logical Structured Context Worlds* (v3.1) and the in-chat dashboard write-up. | Research |

## Install

### Claude app (web, desktop, iPhone, Android)

1. Download [`dist/maxey0-plugin-v3.0.0.zip`](https://github.com/mmc7676/maxey0-chat/raw/main/dist/maxey0-plugin-v3.0.0.zip). Use this file, not GitHub's green **Code > Download ZIP**: that archive is the whole repository, and Claude rejects it because the plugin is not at its top level.
2. On claude.ai in a browser, go to Customize > Plugins > Add plugin and upload it. Uploads sync to the mobile apps.
3. In any chat, say **Maxey0** or **show my SCWs**. The dashboard appears in the conversation.

`dist/` holds only the current version; its checksum is in `dist/SHA256SUMS`.

**Known issue (2026-10-14):** after uploading on claude.ai in a browser, the plugin did not appear in the Claude Android app. Not yet resolved. On the web it installs and the dashboard works.

### Claude Code (terminal, web or mobile)

Claude Code 2.1.275 or later (older: `/plugin marketplace add mmc7676/maxey0-chat`, then `/plugin install maxey0@maxey0`).

```
/plugin install maxey0 --marketplace mmc7676/maxey0-chat
```

In a terminal without the inline renderer, the dashboard is written to `.maxey0/dashboard.html`; its buttons copy commands for you to paste back.

### Optional: the remote server

Gives SCWs that persist across chats and scope enforced by the server rather than by the model.

```
cd server && npm install
cp wrangler.toml.example wrangler.toml     # then add your KV namespace id
npx wrangler kv namespace create MAXEY0_KV
npx wrangler secret put WORKSPACE_KEY      # 16+ random characters
npm test && npm run deploy
```

- **Claude Code:** `claude mcp add --transport http maxey0 https://<your-worker>.workers.dev/mcp/<WORKSPACE_KEY>`. Tested against a local copy of this server with the real Claude Code client, with no sign-in step.
- **Claude app connector:** adding the same URL as a custom connector failed once at Claude's sign-in registration step, because this server has key-in-URL auth and no OAuth. Not yet resolved; use the plugin instead.

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
