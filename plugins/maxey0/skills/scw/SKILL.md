---
name: scw
description: Structured Context Worlds (SCWs) for Maxey0. Use whenever the user mentions SCWs, Structured Context Worlds, scw0, scw5 and similar, or wants named containers that keep one agent's work and files away from another's. Shows and edits them in the inline Maxey0 dashboard.
---

# Structured Context Worlds (SCWs)

SCW always expands to **Structured Context World**, never "Window".

An SCW is a named container for a piece of work. It has:

- a **name** and a **description** of what belongs in it
- **files**: material the user adds, and results agents save into it
- **steps**: tasks that run in it, each optionally done by a named agent
- **SCWs inside it**: SCW0 is the root; any SCW can hold others

The one rule: an agent working in an SCW sees that SCW's description, files
and the results it waits for, and nothing from other SCWs. Never paste one
SCW's content into another SCW's agent.

To show, create or edit SCWs, use the `maxey0` skill: it renders the dashboard
and runs the steps. The user can also type SCWs as text (see `syntax.md` in
the `maxey0` skill), for example `Launch SCW 5 in scw0` then `In scw5: ...`.

Files the user attaches in chat: when they say which SCW, add the file's name
and text to that SCW's `files` and show the dashboard again.

Be honest about what this is: SCW boundaries here are kept by what Maxey0
puts in each agent's context, not by a separate runtime.
