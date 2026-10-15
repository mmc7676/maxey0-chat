# Workflow text syntax

What the dashboard's parser (`parser.js`) understands. Case does not matter.
`#scw0` and LinkedIn-style `[#scw0](https://...)` links both count as `scw0`.

| You write | It means |
|---|---|
| `Launch SCW 5 in scw0` (also `Launch logical SCW 5 in scw0`) | Create SCW5 inside SCW0. Without `in ...`, inside the current SCW. |
| `In scw5 launch SCW 30` | Create SCW30 inside SCW5. |
| `In scw30:` / `In SCW30` | The lines that follow are steps in SCW30. `In SCW` alone means SCW0. |
| `1) ...` `2) ...` | Separate steps in the current SCW, run in that order. |
| `/deep-research` and other `/name` | Skills the step must use. A line of only skills applies to the next step. |
| `save to SCW5` / `save in scw30` | Where the step's result is saved. |
| `when scw30 is complete` / `when scw30 loop complete` | The step waits for every step in SCW30 and the SCWs inside it. |
| `$pp` / `Process in parallel ($pp)` | The steps in this block run at the same time. |
| A line of `---` (or a new `$pp` line) | Starts a new block. Blocks run at the same time. |

Without `$pp`, the steps of a block run one after another. Text that is not a
command becomes the task of the current step.

Example:

```
$pp
Launch SCW 5 in scw0
In scw5 launch SCW 30. In scw30:
/deep-research How should Maxey0 use inline dashboards? Save in SCW30.
In SCW5 /research-paper-pdf when scw30 is complete. Save to SCW5.
```
