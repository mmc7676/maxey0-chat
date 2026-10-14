# Running Maxey0 and SCWs From the Chat: An In-Chat MCP App Dashboard for Claude

*Mike Cohan (Human0) and Maxey0-Claude (Opus 5.5) · human@maxey0.com · 14 October 2026 · Maxey0 project*

## Abstract

As of October 2026, Claude renders interactive MCP Apps on the web, the desktop app, the iOS and Android apps, and Cowork. That makes it possible, for the first time, to run Maxey0 and its Structured Context Worlds (SCWs) from inside a chat on a phone. This paper does two things. It reports what current sources say about MCP Apps in Claude, and it describes a working implementation built on those findings.

The design is one remote, stateless MCP server that keeps every SCW, file, agent, loop, gate and plan on the server. The model sees a small set of tools. The dashboard sees one app-only tool. When the user submits the dashboard, the plan is saved and a short trigger message is handed to Claude, which then fetches the plan and orchestrates the agents.

The server enforces SCW scope at the tool layer and records every scoped read, write and refusal. We tested it with 47 server tests, an end-to-end dashboard test in a host built on the official AppBridge (desktop and phone widths), and a run under the local Workers runtime. It has not yet been run inside the real Claude apps.

## 1. The opportunity

Until now, a Maxey0 dashboard has been a separate page. The user configures something there and carries the result back to the model by hand. MCP Apps remove that gap. A tool can declare a user interface, the host renders it inside the conversation, and the interface can call the server's tools through the host. The dashboard and the chat become one surface. For Maxey0 this means:

- the architect designs work visually;
- the model carries it out;
- both stay inside one conversation, including on a phone.

## 2. What current sources establish

The MCP Apps extension (SEP-1865, identifier `io.modelcontextprotocol/ui`) has been stable since 26 January 2026. The essential mechanics are:

- **Linking a tool to a view.** A tool declares `_meta.ui.resourceUri` pointing at a `ui://` resource. The older flat key `_meta["ui/resourceUri"]` is deprecated.
- **The resource.** It is served with MIME type `text/html;profile=mcp-app`.
- **Visibility.** `_meta.ui.visibility` set to `["app"]` hides a tool from the model while the view can still call it.
- **Default security policy.** The default CSP allows inline scripts and `data:` images and blocks network access. A fully bundled view with an inlined logo therefore needs no CSP configuration.
- **The bridge.** The view and host exchange JSON-RPC over `postMessage`. The official `App` class wraps this as `connect`, `callServerTool`, `sendMessage`, `updateModelContext`, `openLink` and `requestDisplayMode`.

Anthropic documents MCP Apps on Free, Pro, Max, Team and Enterprise plans across web, desktop and mobile, and in Cowork. On mobile, apps render in a native WebView with no camera, microphone or location. The host also caps inline height, so a full dashboard should request fullscreen. A custom connector is added on web or desktop and then appears on mobile.

Three practical constraints shape the design:

1. **`ui/message` only fills the composer.** In Claude it puts the text in the message box, under a caution banner, so the user taps send.
2. **`updateModelContext` is read lazily.** The model fetches it on demand.
3. **Large tool results break the app.** Results above roughly 150,000 characters prevent the app from loading on claude.ai and Desktop, and tool calls time out after 240 seconds.

On subagents: Cowork coordinates sub-agents and Claude Code supports them, but plain chat should be assumed to run agents one after another.

## 3. Design

### 3.1 Server-held state, a tiny hand-off

Neither of the view-to-model channels can carry a plan reliably on its own. Instead:

1. Submitting saves the plan on the server through the app-only tool.
2. The view pushes a short summary with `updateModelContext`.
3. The view sends the trigger `Maxey0: execute plan P-…` with `sendMessage`.

When the user taps send, Claude calls `maxey0_get_plan` and receives the plan expanded with SCW file manifests, agents, loops, gates and numbered execution instructions. File contents never cross the tool-result limit: only manifests and identifiers do, and `scw_read_file` pages text at 100,000 characters.

### 3.2 Tools

| Tool | Visible to | Purpose |
|---|---|---|
| `maxey0_open_dashboard` | model | opens the dashboard; returns a text summary as fallback |
| `maxey0_get_workspace` | model | SCWs with manifests, agents, loops, gates, plans, scope ledger |
| `maxey0_get_plan` | model | expanded plan with orchestration instructions |
| `scw_create`, `scw_add_file`, `scw_read_file` | model | SCW creation, text storage, paged reading with `asAgent` scope checks |
| `maxey0_record_run` | model | plan status and summary |
| `maxey0_ui_action` | dashboard only | every dashboard mutation, upload tickets, plan submission |

### 3.3 SCW semantics carried over from Maxey0

This edition carries three ideas from the Maxey0 SCW skill: region types as policies, a gate, and the rule that a refusal is a result.

- **Regions.** Uploaded files form a read-only reference region; agent outputs go to a durable region.
- **Agent scope.** Each agent is bound to the SCWs it may use. When a read or write names an agent through `asAgent`, the server refuses anything outside that agent's SCWs with `isolation_violation`, and records the refusal in a scope ledger shown in the dashboard.
- **Gates.** Gates carry Deny, Ask and Allow rules. The orchestration instructions bind the model to them.

The server enforces access only for calls that name an agent. It makes no claim about isolation inside the model's own context.

### 3.4 Uploads

In-iframe file pickers are unverified in Claude's sandbox and mobile WebViews, so the dashboard offers two paths:

- **In-view upload.** The file is read in the view and sent through `callServerTool`, which needs no network permission.
- **Upload link.** A fifteen-minute ticket opens an HTTPS page in the browser through `openLink`, which works anywhere.

Chat attachments can also be stored by the model with `scw_add_file`.

## 4. Implementation

| Component | Contents |
|---|---|
| Server | TypeScript, about 400 lines, runtime-neutral; deployed as a Cloudflare Worker with one KV namespace |
| Transport | stateless JSON-RPC over HTTP; accepts protocol versions 2025-03-26 through 2026-07-28; no `initialize` round trip needed |
| Authentication | a secret key in the URL path; OAuth is future work |
| Dashboard | one self-contained HTML document of 472 KB: the official ext-apps `App` class, the Maxey0 logo inlined as a `data:` image, host theming applied from host context, fullscreen requested on mobile |
| Skills | `maxey0` (orchestrator) and `scw` (SCW rules), uploaded to Claude; also packaged as a plugin for Claude Code and Cowork |

## 5. Verification

All results below come from runs on 14 October 2026.

| Check | Result |
|---|---|
| Type check (strict) | 0 errors |
| Server tests: protocol, routing, every tool, scope enforcement, regions, plan expansion, upload link, size limits, cascading deletes | 47 of 47 pass |
| Dashboard end-to-end in an AppBridge host at 1000 px: create SCW, in-view upload, upload link, agent, loop, gate, submit; message and context hand-off; plan round trip; only the app-only tool called | all pass, no script errors |
| Same host at 390 px (mobile platform) | renders, logo loads, fullscreen requested, no horizontal overflow on any tab |
| Local Workers runtime (wrangler dev) | tool calls, ticketed multipart upload of text and binary files |

**Not yet verified:** rendering and hand-off inside claude.ai, the desktop app and the mobile apps. That requires the deployed URL.

## 6. Limitations and next steps

The hand-off depends on the user tapping send, because of Claude's current behavior. Gates are instructions to the model, not server-executed policy. Binary files are stored but not text-extracted. Authentication is a path secret.

Next steps, in order:

1. Run the dashboard in Claude's apps and record what each surface does with `ui/message` and `updateModelContext`.
2. Add OAuth.
3. Add PDF and Office text extraction into the reference region.
4. Connect this server's SCWs to the runtime SCW gates of Maxey0-SuperSpace, so that one policy object governs both.

## References

1. Anthropic. "Interactive tools in Claude." claude.com blog, 26 January 2026. https://claude.com/blog/interactive-tools-in-claude
2. MCP Apps specification (SEP-1865), 2026-01-26. https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx
3. Anthropic. MCP Apps design guidelines. https://claude.com/docs/connectors/building/mcp-apps/design-guidelines
4. Anthropic. Troubleshoot MCP Apps. https://claude.com/docs/connectors/building/mcp-apps/troubleshooting
5. Anthropic. MCP Apps quickstart. https://claude.com/docs/connectors/building/mcp-apps/quickstart
6. Anthropic Help Center. Use interactive connectors in Claude. https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude
7. Anthropic Help Center. Get started with custom connectors using remote MCP. https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
8. GitHub issue anthropics/claude-ai-mcp #1111 (ui/message fills the composer). https://github.com/anthropics/claude-ai-mcp/issues/1111
9. GitHub issue anthropics/claude-ai-mcp #102 (model context read on demand). https://github.com/anthropics/claude-ai-mcp/issues/102
10. Cloudflare. Build a remote MCP server. https://developers.cloudflare.com/agents/guides/remote-mcp-server/
11. Anthropic Help Center. Use skills in Claude. https://support.claude.com/en/articles/12512180-use-skills-in-claude
12. Anthropic Help Center. Get started with Claude Cowork. https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork
