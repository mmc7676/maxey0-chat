# maxey0 plugin (v2.0.0)

Install in Claude Code:

```
/plugin install maxey0 --marketplace mmc7676/maxey0-chat
```

Two skills:

- `maxey0` (shows as `/maxey0:maxey0`): the orchestrator. Renders the Maxey0 dashboard inside the chat and runs plans across SCWs.
- `scw` (shows as `/maxey0:scw`): what a Structured Context World is, its five typed memory tiers, regions and gates.

Say "Maxey0" or "show my SCWs" to open the dashboard. Buttons send `Maxey0: apply`, `Maxey0: run`, `Maxey0: save` or `Maxey0: export` back to the chat.

The dashboard is drawn with Claude's built-in inline renderer, so it needs no connector, server or sign-in. In a terminal session without that renderer, the skill writes `.maxey0/dashboard.html` instead.

Files: `skills/maxey0/dashboard.html` is generated from `src/dashboard.src.html` and `src/logo48.webp` by `tests/build-template.py`; run `cd tests && npm i && npm test` to verify.
