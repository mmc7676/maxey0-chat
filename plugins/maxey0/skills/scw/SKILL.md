---
name: scw
description: Structured Context Worlds (SCWs) for Maxey0. Use whenever the user mentions SCWs, Structured Context Worlds, partitions, isolation, regions, gates, memory tiers or promotion, or wants named context containers that keep one agent's material away from another's. Shows them in the inline Maxey0 dashboard.
---

# Structured Context Worlds (SCWs)

SCW always expands to **Structured Context World**, never "Window". An SCW is a
named, bounded context world with explicit rules for what may enter and leave
it. SCW0 is the root world around Maxey0; numbered worlds hold agents' work.

| part | meaning |
|---|---|
| `name`, `purpose` | what belongs in this world |
| `region` | `volatile` (scratch, may be discarded), `durable` (agent outputs), `reference` (read-only source material) |
| `tiers` | which of the five memory tiers agents in this world may use |
| `files` | material held in the world |
| gates | `deny` (never), `ask` (ask the user first), `allow` (explicitly permitted) |
| bound agents | only agents listing the SCW in their `scws` may read or write it |

## Memory: five typed tiers

`working`, `episodic`, `semantic`, `persistent`, `procedural`. They are typed
tiers, not a duration ladder: there are no L1-L4 levels. Items enter `working`
and move to another tier only through the **evidence-gated promotion gate**:
cited evidence plus any `ask` gate on the world, recorded in the ledger.

## What to do

- To see or change SCWs, render the dashboard as the `maxey0` skill describes.
- Create SCWs from chat when asked: add them to the state and re-render.
- Files attached in chat: put their text in the chosen SCW's `files` as
  `{name, chars, summary}`, keeping full text in the conversation, not the
  state, so the dashboard stays small.

## Rules that carry

1. A refusal is a result. Report it in the ledger and in your reply; do not
   retry under another agent or paste the refused material elsewhere.
2. Never carry content between SCWs unless a declared loop passes it.
3. Gates bind you.
4. Say what is enforced and what is not. In this edition SCWs are logical:
   they decide what goes into each agent's context and every scoped action is
   logged. With the optional Maxey0 server connector, scope is also enforced at
   the tool layer for calls that name an agent.
