# Maxey0 (v0.3.0)

Set up **SCWs** (Structured Context Worlds: named containers for work), **agents** and **workflows** in the Maxey0 app drawn in the chat, or by typing, then run them and watch their progress. With the Maxey0 connector, the app also holds up to 4 of your stored artifacts as live tiles.

## Install

- **Claude app (web, desktop, mobile):** Customize > Plugins > Add > **Add marketplace** > `mmc7676/maxey0-chat` (updates itself), or upload [`dist/maxey0-plugin-v0.3.0.zip`](https://github.com/mmc7676/maxey0-chat/raw/main/dist/maxey0-plugin-v0.3.0.zip) with Add > **Upload plugin**. Remove any other Maxey0 plugin or skill first.
- **Claude Code:** `/plugin install maxey0 --marketplace mmc7676/maxey0-chat`, then `/maxey0:maxey0`.
- **Connector (for artifact tiles):** deploy `server/` and add it under Customize > Connectors; see the repository README.

## Use

- **`/maxey0`** opens Maxey0: the builder, and with the connector the **Artifacts** section below it.
- **Type or paste a workflow** and press **Visualize**, for example `Launch SCW 5 in scw0`, `In scw5: research X /deep-research. Save to SCW5.` `syntax.md` in the skill lists what is understood.
- **Place agents** on steps by dragging, or by tapping the agent and then the step. Add worlds, steps and files, choose when a step starts, and turn on a checker loop.
- **Place artifacts** in up to 4 tiles the same way: drag one from the import tray onto a tile, or tap it and then tap the tile. Each tile can **Expand**, go **Full screen** inside Claude, or **Open outside ↗** in the browser (a link valid for 10 minutes). The Artifacts header collapses and expands the section; tiles keep running.
- **Run** sends the workflow to Maxey0, which runs ready steps at once (with subagents where available) and redraws the app with each step's status and result.
- Every input goes through the effort rule in section 0 of the skill.

## How it is built

With the connector, `/maxey0` is one `maxey0_open_app` call; the server serves the app (`server/ui/app.ts` plus this folder's `app/maxey0.js`) as an MCP Apps view. Without it, Claude sends a 443-byte widget that loads `app/maxey0.js` from `cdn.jsdelivr.net`, pinned to commit `8629e4211fe64b29afab9619ab3df41736000d56` of this repository.

`app/maxey0.js` is generated from `src/dashboard.src.html`, `src/parser.js` and `src/logo48.webp` by `tests/build-app.py`. Run `cd tests && npm install && npm test` to verify.
