# Changelog

## 0.4.0 (2026-10-16)
- **Run monitor.** Tick **Monitor the next Run here** before **Run**: the app records the run on your server, sends its id with the run, and replaces the Artifacts section with a live dashboard (`server/ui/run-monitor.html`, the default monitor template, with the Maxey0 logo):
  - SCW0 as the top-level object, every SCW drawn inside its parent, each step in its SCW with agent, status, effort class, skills and result;
  - progress bar, counts and a timeline;
  - controls: **Pause/Resume**, **Skip** a waiting step, **Note** on a step or the whole run.
  Claude reports progress with the new tool `maxey0_run_update`, whose every response returns your controls; the skill obeys them between steps (a running step finishes first). The app refreshes the monitor every 3 seconds. **Back to artifact tiles** returns to the tiles without restarting them.
- **Close Maxey0** folds the app to one line and stops its tiles; **Reopen** brings them back. Saved tiles are unchanged.
- **Fix:** reloading a chat showed the tiles from the moment Maxey0 was opened, not the ones saved since (Claude replays the original tool result). The app now takes the tiles from the server.
- **Attach files to an SCW:** the skill finds the file you name with Claude's tools, says which it picked, and adds it to that SCW in the builder.
- **Fix for pulls on Windows:** a `.gitattributes` keeps LF line endings and the UI builds normalize them, so `npm test` no longer leaves rebuilt files that block `git pull`.
- Tests: connector 30; app in a browser 17 (monitor, close, reload); artifacts board 10; plugin 27.

## 0.3.1 (2026-10-16)
Fixes from the first run on a phone.
- **Import tray:** search results are listed in full in the page, 12 at a time, with a **Show N more** button that also fetches the next page from the server. Before, results sat in a 132-pixel box with its own scrollbar, which phones don't scroll inside the chat, so only the first 3 could be picked.
- **Handshake:** both views (the app and the artifacts board) now open with the exact `ui/initialize` fields the MCP Apps spec requires (`appInfo`, `appCapabilities`, `protocolVersion`). They sent `clientInfo` and an extra `capabilities`, which a strict host rejects, leaving the view blank; the test hosts are now strict and fail on the old form. Both views also report their size right after the handshake.
- **Tiles on phones:** 420 px tall (640 px expanded) on screens up to 600 px wide, up from 300.
- Unchanged: Expand (wider and taller inside the app), Full screen (the tile fills the app in Claude's full-screen mode), Open outside ↗ (the artifact alone in a browser window).
- **One version everywhere:** the connector, both views, the builder, the skill, the plugin, the marketplace entry and both READMEs carry the same number; the views read it from `server/package.json` at build time, and a test fails if any part differs.
- Tests: connector 29; app in a browser 11 with a strict host; artifacts board 10 with a strict host; plugin 27.

## 0.3.0 (2026-10-16)
One version for the plugin, the connector and the app, restarting at 0.3.0. Everything below this entry (1.0.0 to 3.3.1) is earlier work under the old numbering and is included here.
- **Maxey0 app with artifact tiles (connector).** `/maxey0` now opens one view, served by the connector (`maxey0_open_app`, `ui://maxey0/app.html`), holding the workflow builder and an **Artifacts** section:
  - an import tray of your stored artifacts with search;
  - up to 4 tiles; place an artifact by dragging it onto a tile or by tapping it and then the tile, the same way agents go on steps;
  - each tile can Expand, go Full screen inside Claude (the host's fullscreen mode, that tile only), Open outside ↗ (a 10-minute link that runs that one artifact version in a sandboxed page on the Worker), or be removed;
  - the section collapses and expands without restarting tiles; placed tiles are saved and come back next time.
  - Run sends `Maxey0: run …` to the chat (`ui/message`), as the widget did.
- **Fallback:** without the connector, `/maxey0` draws the builder alone from `cdn.jsdelivr.net`, as before.
- **Skill:** opens Maxey0 through the connector when it's there; places artifacts by id and says which it couldn't find instead of padding with guesses; says "opened", never "rendered", because a tool call can't see the screen.
- **Connector:** new tools `maxey0_open_app` and app-only `maxey0_app_action` (`slots.set`, `artifact.link`); new route `GET /a/<ticket>` serves one artifact version with CSP `sandbox` (opaque origin), `connect-src 'none'`, `no-store`, and expires after 10 minutes or when the artifact changes.
- **Includes 3.3.1's fix:** React tiles run without `unsafe-eval`, so they render under the MCP Apps CSP.
- **Packaging:** one plugin (`dist/maxey0-plugin-v0.3.0.zip`, or Add marketplace `mmc7676/maxey0-chat`); the separate skill zip is no longer published.
- **Fix:** a skill written at the end of a sentence (`/deep-research.`) kept the period in its name; the parser drops it now.
- Tests: connector 28; app in a browser under the spec CSP 11; artifacts board in a browser 10; plugin 27.

## 3.3.1 (2026-10-16), server only
- **Fix: React artifacts did not render in Claude.** Tiles ran compiled code with `new Function`, which needs CSP `unsafe-eval`. MCP Apps hosts apply a CSP with `unsafe-inline` and without `unsafe-eval`, and a tile (a srcdoc frame) inherits it, so every React tile failed. Tiles now run the compiled code as an inline script. HTML, SVG and Mermaid tiles were not affected.
- **Tests:** the browser test now serves the board with the CSP the MCP Apps spec tells hosts to build from `_meta.ui.csp` (`HOST_CSP=none` turns it off). Under that policy the 3.3.0 tile code passes 3 of 10 checks and this release passes 10 of 10. Rendering all 104 imported artifacts under the same policy gives 72 rendered, the same 72 as without a CSP, and no CSP-related errors; the other 32 fail on their own code (compile, syntax or export errors in versions rebuilt from chat history).
- The plugin is unchanged (still 3.3.0); only the server needs redeploying.

## 3.3.0 (2026-10-16)
- **Effort on every input:** the skill applies an effort rule (new section 0) to every input it handles: `/maxey0`, typed workflows, dashboard **Run**, edits typed in chat, artifact requests. Each step is classed **mechanical** (a test, parse, count or tool check settles it: one pass) or **judgment** (nothing mechanical does: effort follows the cost of a wrong answer, with a checker that did not make the work). An explicit effort instruction wins. Runs show each step's class and report what checked it. Built in, so it works without the separate `/effort-optimizer` skill.
- **Server:** the same rule is in the connector's instructions and is step 0 of every plan from `maxey0_get_plan`, so connector-only clients get it too. JSON responses now declare `charset=utf-8` (Windows PowerShell 5.1 showed `·` as `Â·`). The server reports version 3.3.0 instead of 1.0.0.
- Not in this release: `/maxey0` still draws the in-chat dashboard when the connector is connected; which dashboard it should open is undecided.
- Tests: server 25; plugin 26.

## 3.2.0 (2026-10-16)
- **Artifacts in the server:** artifact objects with mechanical checks (non-empty, size, loadable imports and a default export for React, allowed hosts for HTML), a tiles board as a second MCP Apps view (`ui://maxey0/artifacts.html`), and the tools `maxey0_open_artifacts`, `artifact_list`, `artifact_upsert`, plus app-only `artifact_get` and `artifact_report_render`. Tiles run side by side; opening one never restarts another.
- **Import:** `server/scripts/import-index.mjs` loads an artifact index made from a claude.ai data export; re-runs update in place. Fixed: it did nothing on Windows, and `--dry-run` was read as the server URL.
- **Skill:** a section that sends "open, show or search my artifacts" to the board when the connector is connected, and stores built artifacts with `artifact_upsert`.
- **Versioning:** 3.1.0 was rebuilt on 2026-10-15 with only its dashboard URL re-pinned from the `v3.1.0` tag to commit `4551647`, under the same version number. 3.2.0 replaces both 3.1.0 builds. The in-chat dashboard app (`app/maxey0.js`) is unchanged and still reports 3.1.0.
- Tests: server 23 and 10 browser checks; plugin 26.

## 3.1.0 (2026-10-14)
- **`/maxey0` slash command:** shipped as a standalone skill named `maxey0` (`dist/maxey0-skill-v3.1.0.zip`), installed under Customize > Skills like other skills. The separate `scw` skill is folded into it, so there is one trigger.
- **Fast:** each render is one 443-byte widget that loads the dashboard from cdn.jsdelivr.net pinned to commit `4551647`, instead of Claude re-typing a 17 KB file. If the CDN cannot be reached the widget says so after 12 seconds.
- **No detours:** the skill forbids shell commands, file reads, tests and memory summaries when drawing the dashboard. On mobile, 3.0.1 ran `node`, guessed a wrong path, installed jsdom and took about 3 minutes.
- Removed `dashboard.html`, the skill's `parser.js` copy and `standalone-shell.html` from the skill.
- Tests: 26 (11 parser, 15 browser), including the CDN-failure message and that SKILL.md carries the widget template verbatim.

## 3.0.1 (2026-10-14)
- The `maxey0` skill now says to draw the dashboard when the message is just "Maxey0", instead of summarizing remembered project facts (seen on mobile).
- Plugin README: chat has no slash command; type Maxey0.

## 3.0.0 (2026-10-14)

### Plugin `maxey0` 3.0.0
- Rebuilt around three things only: SCWs, agents and workflows. Memory tiers, regions, gates and the ledger are removed from the dashboard and the skills.
- Type or paste a workflow (`Launch SCW 5 in scw0`, `In scw5: ...`, `$pp`, `1) ...`, `/skills`, `save to SCW5`, `when scw30 is complete`) and press **Visualize** to see it as nested worlds, steps and a run order. The same parser ships as `skills/maxey0/parser.js`; `syntax.md` documents it.
- Place agents on steps by dragging (desktop) or by tapping the agent and then the step (phones). Add worlds, steps and files; choose when a step starts; turn on a checker loop.
- **Run** sends the workflow to Maxey0, which runs ready steps at the same time with subagents where the surface has them, and redraws the dashboard with each step's status (waiting, running, done, failed) and result.
- Tests: 12 parser tests (including Human0's own workflow text) and 12 headless-browser tests at 380 px.

## 2.0.0 (2026-10-14)

### Plugin `maxey0` 2.0.0
- The dashboard now renders inline in the chat through Claude's built-in renderer. The plugin no longer requires the Maxey0 connector, so it works in chat on web, desktop and mobile without a server or sign-in.
- Dashboard: SCWs, agents and loops, gates, five typed memory tiers with per-SCW tier access, scope ledger, plan runner. Edits are staged in the dashboard and sent back with `Maxey0: apply`.
- State is one JSON object (`maxey0.state/2`) carried in the conversation; `Maxey0: save` writes it to `.maxey0/state.json` (Claude Code) or the Project doc `maxey0/state.json` (claude.ai Projects with the Projects tool).
- Terminal fallback: `standalone-shell.html` wraps the same widget as a local page.
- Memory model corrected to five typed tiers (working, episodic, semantic, persistent, procedural) with an evidence-gated promotion gate. No L1-L4 levels.
- When the optional server's `maxey0_*` tools are present, the skills use them.
- Tests: 9 headless-browser tests at 380 px, light and dark, including input validation, command payloads and an injection check.

### Server `maxey0-mcp` 1.0.0 (recovered)
- `server/src` recovered byte-for-byte from the deployed Worker's source map (`sourcesContent`). `src/ui-html.ts` is the generated dashboard bundle; the dashboard's UI source and the original 47-test suite were not in the deployed bundle and are not included.
- Added `package.json`, `tsconfig.json`, `wrangler.toml.example`, a Node dev host and 5 regression tests (protocol, auth, app-only tool, scope enforcement, explicit errors).

### App `scw-privacy-chatgpt` 3.2 (2026-10-12)
- Included unchanged (SHA-256 `7cae76d5…`) with its test scripts. Its README describes 3.1; the 3.2 changes are the labels that follow ChatGPT's own names, quick setup, and the embedded Maxey0 logo.

## 1.0.2 (2026-10-14)
- Plugin with `maxey0` and `scw` skills that required the Maxey0 connector, plus the remote server. The connector could not be added in the Claude app (sign-in registration error).
