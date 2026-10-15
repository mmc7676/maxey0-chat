# maxey0 plugin (v3.0.1)

Install in Claude Code:

```
/plugin install maxey0 --marketplace mmc7676/maxey0-chat
```

In the Claude app, upload `dist/maxey0-plugin-v3.0.1.zip` from this repository (Customize > Plugins > Add plugin).

Set up **SCWs** (Structured Context Worlds: named containers for work), **agents** and **workflows**, then run them from the chat.

- **Dashboard:** say **Maxey0**. You get worlds, agents and steps in the conversation. Drag an agent onto a step, or tap the agent and then the step. Add worlds, steps and files, set what each step waits for, and turn on a checker loop. Press **Run**.
- **Text:** paste a workflow such as `Launch SCW 5 in scw0`, `In scw5: ...`, `$pp`, `1) ...` and press **Visualize**, or send it in chat. `skills/maxey0/syntax.md` lists what is understood.
- **Monitoring:** during a run, each step shows waiting, running, done or failed with a one-line result, and the run order updates.

Two skills: `maxey0` draws the dashboard and runs workflows, using subagents where the surface supports them; `scw` explains SCWs. In chat (web, desktop, mobile) there is no slash command: type **Maxey0**. In Claude Code they are `/maxey0:maxey0` and `/maxey0:scw`.

The dashboard is drawn with Claude's built-in inline renderer: no connector, server or sign-in. Nothing is sent anywhere except back into your chat as a message when you press Run.

Files: `skills/maxey0/dashboard.html` is generated from `src/dashboard.src.html`, `src/parser.js` and `src/logo48.webp` by `tests/build-template.py`; `skills/maxey0/parser.js` is a copy of `src/parser.js`. Run `cd tests && npm install && npm test` to verify.
