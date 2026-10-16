# Maxey0 (v3.2.0)

Set up **SCWs** (Structured Context Worlds: named containers for work), **agents** and **workflows** in a dashboard drawn in the chat, or by typing, then run them and watch their progress.

## Install

- **Claude app, web and mobile (recommended):** upload [`dist/maxey0-skill-v3.2.0.zip`](https://github.com/mmc7676/maxey0-chat/raw/main/dist/maxey0-skill-v3.2.0.zip) in claude.ai under Customize > Skills. You then type **`/maxey0`** in any chat. Remove any older Maxey0 plugin first, so only one Maxey0 is installed.
- **Claude Code:** `/plugin install maxey0 --marketplace mmc7676/maxey0-chat`, then `/maxey0:maxey0`.

## Use

- **`/maxey0`** opens the dashboard.
- **Type or paste a workflow** and press **Visualize**, for example `Launch SCW 5 in scw0`, `In scw5: research X /deep-research. Save to SCW5.` `syntax.md` in the skill lists what is understood.
- **Place agents** by dragging (computer) or by tapping the agent and then the step (phone). Add worlds, steps and files, choose when a step starts, and turn on a checker loop.
- **Run** sends the workflow to Maxey0, which runs ready steps at once (with subagents where available) and redraws the dashboard with each step's status and result.

## How it is built

Claude sends a 443-byte widget that loads the dashboard from `cdn.jsdelivr.net`, pinned to commit `4551647e4939fbea2e5e993a825a45159354ae32` of this repository (`app/maxey0.js`). That keeps each render to one short tool call. The dashboard sends nothing anywhere except your **Run** message back into the chat.

`app/maxey0.js` is generated from `src/dashboard.src.html`, `src/parser.js` and `src/logo48.webp` by `tests/build-app.py`. Run `cd tests && npm install && npm test` to verify.
