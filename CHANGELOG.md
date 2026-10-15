# Changelog

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
