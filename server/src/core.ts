// Maxey0 MCP server core: a stateless Streamable-HTTP MCP endpoint with an MCP Apps dashboard.
// Runtime-neutral: takes a Request and a Store, returns a Response (Cloudflare Workers, Node 18+, tests).
import { Store, Workspace, Scw, Agent, Loop, Gate, Plan, ScwFile, ScwEvent } from "./store";
import { DASHBOARD_HTML } from "./ui-html";
import { ARTIFACTS_HTML } from "./artifacts-ui-html";
import { APP_HTML } from "./app-ui-html";
import { ArtifactMeta, ArtifactKind, ARTIFACT_KINDS, RESOURCE_DOMAINS, checkArtifact, kindOf, sha256Hex, tileDocument } from "./artifacts";

export const EFFORT_RULE = "Effort on every input: classify each step by what would catch a wrong answer. Mechanical (a test, parse, count, exit code or tool check settles it): one pass, no second opinion. Judgment (nothing mechanical settles it): effort rises with the cost of a wrong answer; verify what is cheap to verify, and have a checker that did not make the work review it. An explicit effort instruction from the user wins. Report what was checked, and by what, separately from what was not.";
export const SERVER_INFO = { name: "maxey0", title: "Maxey0 · SCWs", version: "0.3.0" };
export const UI_URI = "ui://maxey0/dashboard.html";
export const UI_MIME = "text/html;profile=mcp-app";
export const ARTIFACTS_UI_URI = "ui://maxey0/artifacts.html";
export const APP_UI_URI = "ui://maxey0/app.html";
export const SLOT_MAX = 4;
const LINK_TTL_SECONDS = 600;
const SUPPORTED_VERSIONS = ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"];
const MAX_FILE_BYTES = 4 * 1024 * 1024;     // per file (KV allows 25 MB; kept small for tool payloads)
const MAX_READ_CHARS = 100_000;             // keeps tool results well under Claude's ~150k-char hydration limit
const LIMITS = { scws: 50, filesPerScw: 100, agents: 50, loops: 50, gates: 100, plans: 200, artifacts: 1000 };

type Json = Record<string, any>;
const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const now = () => new Date().toISOString();
const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").map((x) => x.slice(0, 80)) : []);

export class ToolError extends Error {}

// ---------------------------------------------------------------- tool catalogue
const uiMeta = { ui: { resourceUri: UI_URI }, "ui/resourceUri": UI_URI };
const appOnly = { ui: { resourceUri: UI_URI, visibility: ["app"] } };
const artifactsUi = { ui: { resourceUri: ARTIFACTS_UI_URI }, "ui/resourceUri": ARTIFACTS_UI_URI };
const artifactsAppOnly = { ui: { resourceUri: ARTIFACTS_UI_URI, visibility: ["app"] } };
const appUi = { ui: { resourceUri: APP_UI_URI }, "ui/resourceUri": APP_UI_URI };
const appUiOnly = { ui: { resourceUri: APP_UI_URI, visibility: ["app"] } };
const ARTIFACT_ID = /^[A-Za-z0-9._-]{1,80}$/;

export const TOOLS: Json[] = [
  {
    name: "maxey0_open_app",
    title: "Open Maxey0",
    description: `Opens Maxey0 in the chat: the workflow builder (SCWs, agents, steps, Run) with an Artifacts section of up to ${SLOT_MAX} live artifact tiles and an import tray. Use for /maxey0, "open Maxey0", a workflow to visualize, or a request to put specific artifacts side by side. Pass state.input with the user's workflow text exactly as written; pass slots with up to ${SLOT_MAX} artifact ids (from artifact_list) to place them in the tiles. Omitted slots keep the saved ones.`,
    inputSchema: { type: "object", properties: {
      state: { type: "object", description: "Builder state: {input} for a typed workflow, or the latest {scws, agents, steps, run} to redraw a run." },
      slots: { type: "array", items: { type: "string" }, maxItems: SLOT_MAX, description: "Artifact ids to place in the tiles, in order." },
      query: { type: "string", description: "Pre-fill the import tray's search." } } },
    _meta: appUi,
  },
  {
    name: "maxey0_app_action",
    title: "Maxey0 app action (app)",
    description: "App-only: save the artifact tile slots, or create a short-lived link that opens one artifact full screen outside the chat.",
    inputSchema: { type: "object", properties: { action: { type: "string", enum: ["slots.set", "artifact.link"] }, ids: { type: "array", items: { type: "string" } }, id: { type: "string" } }, required: ["action"] },
    _meta: appUiOnly,
  },
  {
    name: "maxey0_open_dashboard",
    title: "Open the Maxey0 SCW dashboard",
    description: "Opens the interactive Maxey0 dashboard (with the Maxey0 logo) inside the chat. Use it whenever the user says Maxey0, SCW, Structured Context World, or wants to create SCWs, upload files into SCWs, declare agents, loops or gates, or submit a plan. Returns the workspace summary as text.",
    inputSchema: { type: "object", properties: { focus: { type: "string", description: "Optional SCW name to highlight." } } },
    annotations: { readOnlyHint: true },
    _meta: uiMeta,
  },
  {
    name: "maxey0_get_workspace",
    title: "Read the Maxey0 workspace",
    description: "Returns all SCWs (with file manifests, not file contents), agents, loops, gates and recent plans.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "maxey0_get_plan",
    title: "Fetch a submitted Maxey0 plan",
    description: "Fetch a plan submitted from the dashboard, expanded with its SCWs (file manifests), agents, loops and gates, plus execution instructions for Maxey0 as orchestrator. Call this when the user says 'Maxey0: execute plan <id>'.",
    inputSchema: { type: "object", properties: { planId: { type: "string" } }, required: ["planId"] },
    annotations: { readOnlyHint: true },
  },
  {
    name: "scw_read_file",
    title: "Read a file from an SCW",
    description: "Read one file from an SCW's semantic data plane. When acting as a declared agent, always pass asAgent so the server enforces that agent's SCW scope. Text files return their text (truncated at 100,000 characters; use offset to page). Binary files return metadata only.",
    inputSchema: { type: "object", properties: { scwId: { type: "string" }, fileId: { type: "string" }, offset: { type: "integer", minimum: 0 }, asAgent: { type: "string", description: "Agent id or name making the read. When set, the server refuses reads outside that agent's SCWs." } }, required: ["scwId", "fileId"] },
    annotations: { readOnlyHint: true },
  },
  {
    name: "scw_create",
    title: "Create an SCW",
    description: "Create a named Structured Context World (SCW) with a description. Returns its id.",
    inputSchema: { type: "object", properties: { name: { type: "string" }, description: { type: "string" } }, required: ["name"] },
  },
  {
    name: "scw_add_file",
    title: "Add a text file to an SCW",
    description: "Store text content as a file in a named SCW (for example a document the user attached in chat, or an agent's result). Text only, up to 4 MB.",
    inputSchema: { type: "object", properties: { scwId: { type: "string", description: "SCW id or exact SCW name" }, name: { type: "string" }, content: { type: "string" }, addedBy: { type: "string", enum: ["claude", "agent"] }, asAgent: { type: "string", description: "Agent id or name writing its output. Scope-checked; stored in the durable region." } }, required: ["scwId", "name", "content"] },
  },
  {
    name: "maxey0_record_run",
    title: "Record progress on a plan",
    description: "Record the status of a Maxey0 plan run (running, done or failed) with a short summary, so the dashboard shows it.",
    inputSchema: { type: "object", properties: { planId: { type: "string" }, status: { type: "string", enum: ["running", "done", "failed"] }, summary: { type: "string" } }, required: ["planId", "status", "summary"] },
  },
  {
    name: "maxey0_ui_action",
    title: "Dashboard action",
    description: "Dashboard-only mutations (create, update or delete SCWs, files, agents, loops, gates; upload tickets; plan submission).",
    inputSchema: { type: "object", properties: { action: { type: "string" }, payload: { type: "object" } }, required: ["action"] },
    _meta: appOnly,
  },
  {
    name: "maxey0_open_artifacts",
    title: "Open Maxey0 artifacts as tiles",
    description: "Opens the Maxey0 artifacts board in the chat: every stored artifact (apps, dashboards, diagrams, documents) as a live tile that can be expanded. Use when the user wants to see, open, run or browse their artifacts. Optional query and kind narrow what is shown.",
    inputSchema: { type: "object", properties: { query: { type: "string" }, kind: { type: "string", enum: ARTIFACT_KINDS }, ids: { type: "array", items: { type: "string" }, description: "Show only these artifact ids, in this order." } } },
    annotations: { readOnlyHint: true },
    _meta: artifactsUi,
  },
  {
    name: "artifact_list",
    title: "List stored artifacts",
    description: "Search the stored artifacts by words in their title, description or source chat, optionally filtered by kind or SCW. Returns metadata and check results, never the code.",
    inputSchema: { type: "object", properties: { query: { type: "string" }, kind: { type: "string", enum: ARTIFACT_KINDS }, scwId: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 200 }, offset: { type: "integer", minimum: 0 } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: "artifact_upsert",
    title: "Store or update an artifact",
    description: "Store an artifact's full code as a versioned object (a new id creates it, an existing id adds a version). Runs the mechanical checks (not empty, size, loadable imports and default export for React, allowed hosts for HTML) and returns the result; status is failed if any check fails. To show it, call maxey0_open_artifacts with its id.",
    inputSchema: { type: "object", properties: {
      id: { type: "string", description: "Letters, digits, dot, dash, underscore; up to 80. Omit to create a new artifact." },
      title: { type: "string" }, kind: { type: "string", description: "html, react, svg, mermaid, markdown, code or text (MIME types such as application/vnd.ant.react also accepted)" },
      code: { type: "string" }, description: { type: "string" }, scwId: { type: "string", description: "SCW id or name that owns this artifact" },
      source: { type: "object", properties: { type: { type: "string", enum: ["chat", "file", "published", "built"] }, chatUrl: { type: "string" }, chatTitle: { type: "string" }, originId: { type: "string" } } },
      asAgent: { type: "string", description: "Agent writing it. Scope-checked against scwId." } }, required: ["title", "kind", "code"] },
  },
  {
    name: "artifact_get",
    title: "Load an artifact's code (dashboard)",
    description: "Dashboard-only: returns one artifact's code in chunks for its tile.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, offset: { type: "integer", minimum: 0 } }, required: ["id"] },
    annotations: { readOnlyHint: true },
    _meta: artifactsAppOnly,
  },
  {
    name: "artifact_report_render",
    title: "Record a tile's render result (dashboard)",
    description: "Dashboard-only: records whether an artifact's tile rendered or failed, with the error.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, version: { type: "integer" }, ok: { type: "boolean" }, detail: { type: "string" } }, required: ["id", "version", "ok"] },
    _meta: artifactsAppOnly,
  },
];

// ---------------------------------------------------------------- helpers
function findScw(w: Workspace, idOrName: string): Scw {
  const s = w.scws.find((x) => x.id === idOrName) ?? w.scws.find((x) => x.name.toLowerCase() === String(idOrName).toLowerCase());
  if (!s) throw new ToolError(`No SCW with id or name "${idOrName}". Existing: ${w.scws.map((x) => `${x.name} (${x.id})`).join(", ") || "none"}.`);
  return s;
}
function summary(w: Workspace): string {
  const lines = [`Maxey0 workspace: ${w.scws.length} SCWs, ${w.agents.length} agents, ${w.loops.length} loops, ${w.gates.length} gates, ${w.plans.length} plans.`];
  for (const s of w.scws) lines.push(`- SCW "${s.name}" (${s.id}): ${s.description || "no description"}; ${s.files.length} file(s)${s.files.length ? ": " + s.files.map((f) => `${f.name} [${f.id}]`).join(", ") : ""}`);
  for (const a of w.agents) lines.push(`- Agent "${a.name}" (${a.id}) role: ${a.role || "-"}; SCWs: ${a.scwIds.join(", ") || "none"}`);
  for (const l of w.loops) lines.push(`- Loop "${l.name}" (${l.id}): agents ${l.agentIds.join(" → ")}; max ${l.maxIterations} iterations; until: ${l.until || "-"}`);
  for (const g of w.gates) lines.push(`- Gate (${g.id}) on SCW ${g.scwId}: ${g.mode.toUpperCase()} ${g.rule}`);
  if (w.artifacts?.length) lines.push(`- Artifacts: ${w.artifacts.length} stored (${w.artifacts.filter((a) => a.status === "failed").length} failing checks). Use artifact_list to search them.`);
  const recent = w.plans.slice(-5);
  for (const p of recent) lines.push(`- Plan ${p.id}: ${p.status} — ${p.goal.slice(0, 120)}`);
  return lines.join("\n");
}
function logEvent(w: Workspace, e: Omit<ScwEvent, "at">) { (w.events ??= []).push({ at: now(), ...e }); if (w.events.length > 200) w.events.splice(0, w.events.length - 200); }
/** Tool-layer scope check: when a call names an agent, that agent may only touch SCWs it is bound to. A refusal is a result. */
async function scopeCheck(store: Store, w: Workspace, asAgent: unknown, scw: Scw, op: "read" | "write") {
  if (asAgent === undefined || asAgent === null || asAgent === "") return null;
  const a = w.agents.find((x) => x.id === asAgent || x.name.toLowerCase() === String(asAgent).toLowerCase());
  if (!a) throw new ToolError(`Unknown agent "${asAgent}".`);
  if (!a.scwIds.includes(scw.id)) {
    logEvent(w, { kind: "denied", agent: a.name, scw: scw.name, detail: `${op} refused: not bound` });
    await store.putWorkspace(w);
    throw new ToolError(`isolation_violation: agent "${a.name}" is not bound to SCW "${scw.name}", so this ${op} is refused. Bound SCWs: ${a.scwIds.map((id) => w.scws.find((s) => s.id === id)?.name).join(", ") || "none"}. Do not route around this; report it.`);
  }
  return a;
}
function publicState(w: Workspace) { return { workspace: w }; }
function decodeSize(data: string, encoding: "text" | "base64") { return encoding === "base64" ? Math.floor((data.length * 3) / 4) : new TextEncoder().encode(data).length; }

async function addFile(store: Store, w: Workspace, scw: Scw, name: string, mime: string, data: string, encoding: "text" | "base64", addedBy: ScwFile["addedBy"]): Promise<ScwFile> {
  if (scw.files.length >= LIMITS.filesPerScw) throw new ToolError(`SCW "${scw.name}" already holds ${LIMITS.filesPerScw} files.`);
  const size = decodeSize(data, encoding);
  if (size > MAX_FILE_BYTES) throw new ToolError(`File too large (${size} bytes; limit ${MAX_FILE_BYTES}).`);
  const f: ScwFile = { id: uid("file"), name: str(name, 200) || "untitled", mime: str(mime, 100) || "application/octet-stream", size, encoding, region: addedBy === "agent" ? "durable" : "reference", addedBy, addedAt: now() };
  await store.putFile(w.id, f.id, data);
  scw.files.push(f);
  return f;
}

export function expandPlan(w: Workspace, p: Plan) {
  const scws = w.scws.filter((s) => p.scwIds.includes(s.id));
  const agents = w.agents.filter((a) => p.agentIds.includes(a.id));
  const loops = w.loops.filter((l) => p.loopIds.includes(l.id));
  const gates = w.gates.filter((g) => p.gateIds.includes(g.id) || p.scwIds.includes(g.scwId));
  const instructions = [
    `You are Maxey0, the orchestrator. Execute plan ${p.id}. Goal: ${p.goal || "(none given)"}.`,
    `0. ${EFFORT_RULE} Pass this rule and each agent's effort class into its prompt.`,
    "1. For each declared agent, run a subagent (in Cowork or Claude Code, launch real subagents in parallel; in plain chat, run them one after another and label each section with the agent's name).",
    "2. Each agent may only use the SCWs in its scwIds. Every scw_read_file and scw_add_file made for an agent MUST pass asAgent=<agent name>; the server enforces scope and refuses anything else. A refusal is a result: report it, never route around it, and never paste one SCW's content into another agent's prompt.",
    "Regions: uploaded files are the read-only reference region; agent outputs go to the durable region. A checker agent must not grade its own output (maker/checker separation).",
    "3. Gates: DENY rules must never be violated; ASK rules require asking the user before acting; ALLOW rules state what is permitted.",
    "4. Loops: run the listed agents in order, repeat until the 'until' condition holds or maxIterations is reached.",
    "5. Save each agent's output into its first SCW with scw_add_file (asAgent: the agent), then call maxey0_record_run with status done (or failed) and a short summary.",
  ];
  return { plan: p, scws, agents, loops, gates, instructions };
}

// ---------------------------------------------------------------- tool execution
export async function callTool(store: Store, wsId: string, baseUrl: string, name: string, args: Json): Promise<Json> {
  const w = await store.getWorkspace(wsId);
  const text = (t: string, sc?: Json) => ({ content: [{ type: "text", text: t }], ...(sc ? { structuredContent: sc } : {}) });

  switch (name) {
    case "maxey0_open_dashboard":
      return text(`Opened the Maxey0 dashboard.\n${summary(w)}`, { ...publicState(w), focus: str(args.focus, 80) || null });
    case "maxey0_get_workspace":
      return text(summary(w), publicState(w));
    case "maxey0_get_plan": {
      const p = w.plans.find((x) => x.id === args.planId);
      if (!p) throw new ToolError(`No plan ${args.planId}. Recent plans: ${w.plans.slice(-5).map((x) => x.id).join(", ") || "none"}.`);
      const e = expandPlan(w, p);
      return text(JSON.stringify(e, null, 2), e);
    }
    case "scw_read_file": {
      const s = findScw(w, String(args.scwId));
      const ag = await scopeCheck(store, w, args.asAgent, s, "read");
      const f = s.files.find((x) => x.id === args.fileId || x.name === args.fileId);
      if (!f) throw new ToolError(`No file ${args.fileId} in SCW "${s.name}".`);
      if (ag) { logEvent(w, { kind: "read", agent: ag.name, scw: s.name, detail: f.name }); await store.putWorkspace(w); }
      const data = await store.getFile(w.id, f.id);
      if (data == null) throw new ToolError("File content is missing from storage.");
      if (f.encoding === "base64") return text(`"${f.name}" is a binary file (${f.mime}, ${f.size} bytes). Its bytes are stored but cannot be returned as text.`, { file: f });
      const off = Math.max(0, Number(args.offset) || 0);
      const chunk = data.slice(off, off + MAX_READ_CHARS);
      const more = off + chunk.length < data.length;
      return text(`${chunk}${more ? `\n\n[truncated: ${data.length - off - chunk.length} more characters; call again with offset ${off + chunk.length}]` : ""}`);
    }
    case "scw_create": {
      if (w.scws.length >= LIMITS.scws) throw new ToolError("SCW limit reached.");
      const s: Scw = { id: uid("scw"), name: str(args.name, 80) || "Untitled SCW", description: str(args.description), files: [], createdAt: now() };
      w.scws.push(s); await store.putWorkspace(w);
      return text(`Created SCW "${s.name}" (${s.id}).`, { scw: s });
    }
    case "scw_add_file": {
      const s = findScw(w, String(args.scwId));
      const ag = await scopeCheck(store, w, args.asAgent, s, "write");
      const f = await addFile(store, w, s, String(args.name), "text/plain", String(args.content ?? ""), "text", ag || args.addedBy === "agent" ? "agent" : "claude");
      if (ag) logEvent(w, { kind: "write", agent: ag.name, scw: s.name, detail: f.name });
      await store.putWorkspace(w);
      return text(`Stored "${f.name}" (${f.id}, ${f.size} bytes) in SCW "${s.name}".`, { file: f });
    }
    case "maxey0_record_run": {
      const p = w.plans.find((x) => x.id === args.planId);
      if (!p) throw new ToolError(`No plan ${args.planId}.`);
      const st = ["running", "done", "failed"].includes(args.status) ? args.status : "running";
      p.status = st; p.runLog.push({ at: now(), status: st, summary: str(args.summary, 4000) });
      await store.putWorkspace(w);
      return text(`Plan ${p.id} marked ${st}.`);
    }
    case "maxey0_ui_action":
      return uiAction(store, w, baseUrl, String(args.action), (args.payload ?? {}) as Json);
    case "maxey0_open_app": {
      if (Array.isArray(args.slots)) {
        const ids = strArr(args.slots);
        const missing = ids.filter((id) => !(w.artifacts ?? []).some((a) => a.id === id));
        if (missing.length) throw new ToolError(`No artifact with id ${missing.join(", ")}. Use artifact_list to find ids.`);
        if (ids.length > SLOT_MAX) throw new ToolError(`At most ${SLOT_MAX} tiles; got ${ids.length}.`);
        w.slots = [...new Set(ids)];
        await store.putWorkspace(w);
      }
      const slots = slotMetas(w);
      const tray = listArtifacts(w, { query: args.query }, 50);
      const st = args.state && typeof args.state === "object" ? args.state : null;
      return text(`Opened Maxey0: builder${st?.input ? " with the workflow" : ""}, ${slots.length} of ${SLOT_MAX} artifact tile(s)${slots.length ? `: ${slots.map((a) => a.title).join("; ")}` : ""}. ${tray.total} artifact(s) available to import.`,
        { builder: st, slots, tray: tray.items, trayTotal: tray.total, query: str(args.query, 200) || null, slotMax: SLOT_MAX });
    }
    case "maxey0_app_action": {
      if (args.action === "slots.set") {
        const ids = [...new Set(strArr(args.ids))].filter((id) => (w.artifacts ?? []).some((a) => a.id === id));
        if (ids.length > SLOT_MAX) throw new ToolError(`At most ${SLOT_MAX} tiles.`);
        w.slots = ids; await store.putWorkspace(w);
        return text(`Saved ${ids.length} tile(s).`, { slots: slotMetas(w) });
      }
      if (args.action === "artifact.link") {
        const a = (w.artifacts ?? []).find((x) => x.id === args.id);
        if (!a) throw new ToolError(`No artifact ${args.id}.`);
        const t = crypto.randomUUID().replace(/-/g, "");
        await store.putTicket(t, { ws: w.id, scwId: "", artifactId: a.id, version: a.version }, LINK_TTL_SECONDS);
        return text(`Link for ${a.title}, valid ${LINK_TTL_SECONDS / 60} minutes.`, { url: `${baseUrl}/a/${t}`, expiresInSeconds: LINK_TTL_SECONDS });
      }
      throw new ToolError(`Unknown app action: ${args.action}`);
    }
    case "maxey0_open_artifacts": {
      const shown = listArtifacts(w, args, 200);
      return text(`Opened the Maxey0 artifacts board: ${shown.total} artifact(s)${args.query ? ` matching "${str(args.query, 80)}"` : ""}.`, { artifacts: shown.items, total: shown.total, query: str(args.query, 200) || null, kind: args.kind ?? null, ids: Array.isArray(args.ids) ? strArr(args.ids) : null });
    }
    case "artifact_list": {
      const { items, total } = listArtifacts(w, args, Math.max(1, Math.min(200, Number(args.limit) || 50)), Math.max(0, Number(args.offset) || 0));
      const lines = items.map((a) => `- ${a.title} [${a.kind}] id=${a.id} v${a.version} ${a.status}${a.render ? (a.render.ok ? ", rendered" : `, render failed: ${a.render.detail}`) : ""}${a.source.chatUrl ? ` from ${a.source.chatUrl}` : ""}`);
      return text(`${total} artifact(s) match; showing ${items.length}.\n${lines.join("\n")}`, { artifacts: items, total });
    }
    case "artifact_upsert": return upsertArtifact(store, w, args, text);
    case "artifact_get": {
      const a = (w.artifacts ?? []).find((x) => x.id === args.id);
      if (!a) throw new ToolError(`No artifact ${args.id}.`);
      const code = await store.getFile(w.id, artifactKey(a.id));
      if (code == null) throw new ToolError("Artifact content is missing from storage.");
      const off = Math.max(0, Number(args.offset) || 0);
      const chunk = code.slice(off, off + MAX_READ_CHARS);
      return text(`${a.title}: characters ${off}-${off + chunk.length} of ${code.length}.`, { artifact: a, code: chunk, offset: off, total: code.length, done: off + chunk.length >= code.length });
    }
    case "artifact_report_render": {
      const a = (w.artifacts ?? []).find((x) => x.id === args.id);
      if (!a) throw new ToolError(`No artifact ${args.id}.`);
      if (Number(args.version) !== a.version) return text(`Ignored: report for version ${args.version}, current is ${a.version}.`);
      a.render = { ok: !!args.ok, detail: str(args.detail, 500), at: now() };
      await store.putWorkspace(w);
      return text(`Recorded: ${a.title} ${a.render.ok ? "rendered" : "failed to render"}.`, { artifact: a });
    }
  }
  throw new ToolError(`Unknown tool: ${name}`);
}

async function uiAction(store: Store, w: Workspace, baseUrl: string, action: string, p: Json): Promise<Json> {
  const done = async (msg: string, extra: Json = {}) => { await store.putWorkspace(w); return { content: [{ type: "text", text: msg }], structuredContent: { ...publicState(w), ...extra } }; };
  const remove = <T extends { id: string }>(arr: T[], id: string) => { const i = arr.findIndex((x) => x.id === id); if (i < 0) throw new ToolError(`Not found: ${id}`); return arr.splice(i, 1)[0]; };
  switch (action) {
    case "refresh": return { content: [{ type: "text", text: "ok" }], structuredContent: publicState(w) };
    case "scw.upsert": {
      const ex = p.id ? w.scws.find((s) => s.id === p.id) : undefined;
      if (ex) { ex.name = str(p.name, 80) || ex.name; ex.description = str(p.description); return done(`Updated SCW ${ex.name}.`); }
      if (w.scws.length >= LIMITS.scws) throw new ToolError("SCW limit reached.");
      const s: Scw = { id: uid("scw"), name: str(p.name, 80) || "Untitled SCW", description: str(p.description), files: [], createdAt: now() };
      w.scws.push(s); return done(`Created SCW ${s.name}.`, { createdId: s.id });
    }
    case "scw.delete": {
      const s = remove(w.scws, String(p.id));
      for (const f of s.files) await store.deleteFile(w.id, f.id);
      w.agents.forEach((a) => (a.scwIds = a.scwIds.filter((x) => x !== s.id)));
      w.gates = w.gates.filter((g) => g.scwId !== s.id);
      return done(`Deleted SCW ${s.name}.`);
    }
    case "file.add": {
      const s = findScw(w, String(p.scwId));
      const f = await addFile(store, w, s, String(p.name), String(p.mime), String(p.data ?? ""), p.encoding === "base64" ? "base64" : "text", "dashboard");
      return done(`Added ${f.name} to ${s.name}.`);
    }
    case "file.delete": {
      const s = findScw(w, String(p.scwId));
      const f = remove(s.files, String(p.fileId)); await store.deleteFile(w.id, f.id);
      return done(`Removed ${f.name}.`);
    }
    case "upload.ticket": {
      const s = findScw(w, String(p.scwId));
      const t = `${crypto.randomUUID().replace(/-/g, "")}`;
      await store.putTicket(t, { ws: w.id, scwId: s.id }, 900);
      return { content: [{ type: "text", text: "ticket" }], structuredContent: { ...publicState(w), uploadUrl: `${baseUrl}/u/${t}` } };
    }
    case "agent.upsert": {
      const fields = { name: str(p.name, 80) || "Agent", role: str(p.role, 200), instructions: str(p.instructions, 4000), scwIds: strArr(p.scwIds).filter((id) => w.scws.some((s) => s.id === id)) };
      const ex = p.id ? w.agents.find((a) => a.id === p.id) : undefined;
      if (ex) { Object.assign(ex, fields); return done(`Updated agent ${ex.name}.`); }
      if (w.agents.length >= LIMITS.agents) throw new ToolError("Agent limit reached.");
      const a: Agent = { id: uid("agent"), ...fields }; w.agents.push(a); return done(`Declared agent ${a.name}.`, { createdId: a.id });
    }
    case "agent.delete": { const a = remove(w.agents, String(p.id)); w.loops.forEach((l) => (l.agentIds = l.agentIds.filter((x) => x !== a.id))); return done(`Removed agent ${a.name}.`); }
    case "loop.upsert": {
      const fields = { name: str(p.name, 80) || "Loop", agentIds: strArr(p.agentIds).filter((id) => w.agents.some((a) => a.id === id)), maxIterations: Math.max(1, Math.min(20, Math.round(Number(p.maxIterations) || 3))), until: str(p.until, 500) };
      const ex = p.id ? w.loops.find((l) => l.id === p.id) : undefined;
      if (ex) { Object.assign(ex, fields); return done(`Updated loop ${ex.name}.`); }
      if (w.loops.length >= LIMITS.loops) throw new ToolError("Loop limit reached.");
      const l: Loop = { id: uid("loop"), ...fields }; w.loops.push(l); return done(`Declared loop ${l.name}.`, { createdId: l.id });
    }
    case "loop.delete": { const l = remove(w.loops, String(p.id)); return done(`Removed loop ${l.name}.`); }
    case "gate.upsert": {
      const s = findScw(w, String(p.scwId));
      const mode = (["allow", "deny", "ask"].includes(p.mode) ? p.mode : "ask") as Gate["mode"];
      if (!str(p.rule, 500)) throw new ToolError("A gate needs a rule.");
      if (w.gates.length >= LIMITS.gates) throw new ToolError("Gate limit reached.");
      const g: Gate = { id: uid("gate"), scwId: s.id, rule: str(p.rule, 500), mode }; w.gates.push(g); return done(`Added gate on ${s.name}.`);
    }
    case "gate.delete": { remove(w.gates, String(p.id)); return done("Removed gate."); }
    case "plan.submit": {
      const scwIds = strArr(p.scwIds).filter((id) => w.scws.some((s) => s.id === id));
      const agentIds = strArr(p.agentIds).filter((id) => w.agents.some((a) => a.id === id));
      if (!agentIds.length) throw new ToolError("Select at least one agent to run.");
      const plan: Plan = { id: `P-${Date.now().toString(36).toUpperCase()}`, goal: str(p.goal, 4000), scwIds, agentIds, loopIds: strArr(p.loopIds).filter((id) => w.loops.some((l) => l.id === id)), gateIds: w.gates.filter((g) => scwIds.includes(g.scwId)).map((g) => g.id), status: "submitted", createdAt: now(), runLog: [] };
      w.plans.push(plan); if (w.plans.length > LIMITS.plans) w.plans.splice(0, w.plans.length - LIMITS.plans);
      return done(`Submitted plan ${plan.id}.`, { planId: plan.id });
    }
  }
  throw new ToolError(`Unknown dashboard action: ${action}`);
}

// ---------------------------------------------------------------- artifacts
const artifactKey = (id: string) => `art-${id}`;

function slotMetas(w: Workspace): ArtifactMeta[] {
  return (w.slots ?? []).map((id) => (w.artifacts ?? []).find((a) => a.id === id)).filter((a): a is ArtifactMeta => !!a).slice(0, SLOT_MAX);
}

function listArtifacts(w: Workspace, args: Json, limit: number, offset = 0) {
  let all = [...(w.artifacts ?? [])];
  const ids = Array.isArray(args.ids) ? strArr(args.ids) : null;
  if (ids) all = ids.map((id) => all.find((a) => a.id === id)).filter((a): a is ArtifactMeta => !!a);
  if (args.kind) all = all.filter((a) => a.kind === args.kind);
  if (args.scwId) { const s = findScw(w, String(args.scwId)); all = all.filter((a) => a.scwId === s.id); }
  const terms = str(args.query, 200).toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length) all = all.filter((a) => { const hay = `${a.title} ${a.description} ${a.source.chatTitle ?? ""} ${a.kind}`.toLowerCase(); return terms.every((t) => hay.includes(t)); });
  if (!ids) all.sort((x, y) => (y.updatedAt > x.updatedAt ? 1 : y.updatedAt < x.updatedAt ? -1 : 0));
  return { total: all.length, items: all.slice(offset, offset + limit) };
}

async function upsertArtifact(store: Store, w: Workspace, args: Json, text: (t: string, sc?: Json) => Json): Promise<Json> {
  const code = typeof args.code === "string" ? args.code : "";
  const kind: ArtifactKind = kindOf(String(args.kind ?? ""));
  const title = str(args.title, 200) || "Untitled artifact";
  const id = args.id === undefined || args.id === null || args.id === "" ? uid("art") : String(args.id);
  if (!ARTIFACT_ID.test(id)) throw new ToolError(`Invalid artifact id "${id}": use letters, digits, dot, dash or underscore, up to 80.`);
  const arts = (w.artifacts ??= []);
  let scwId: string | null = null;
  if (args.scwId) { const s = findScw(w, String(args.scwId)); scwId = s.id; await scopeCheck(store, w, args.asAgent, s, "write"); }
  const checks = checkArtifact(kind, code);
  const failed = checks.filter((c) => !c.ok);
  if (failed.some((c) => c.name === "size")) throw new ToolError(`Artifact too large: ${failed.find((c) => c.name === "size")!.detail}.`);
  const sha256 = await sha256Hex(code);
  const ex = arts.find((a) => a.id === id);
  if (!ex && arts.length >= LIMITS.artifacts) throw new ToolError(`Artifact limit reached (${LIMITS.artifacts}).`);
  const src = (args.source ?? {}) as Json;
  const source = { type: (["chat", "file", "published", "built"].includes(src.type) ? src.type : "built") as ArtifactMeta["source"]["type"],
    ...(str(src.chatUrl, 300) ? { chatUrl: str(src.chatUrl, 300) } : {}), ...(str(src.chatTitle, 200) ? { chatTitle: str(src.chatTitle, 200) } : {}), ...(str(src.originId, 300) ? { originId: str(src.originId, 300) } : {}) };
  const t = now();
  if (ex && ex.sha256 === sha256 && ex.kind === kind) {
    ex.title = title; ex.description = str(args.description, 2000) || ex.description; ex.scwId = scwId ?? ex.scwId; ex.source = { ...ex.source, ...source };
    await store.putWorkspace(w);
    return text(`Unchanged code: ${ex.title} stays at version ${ex.version} (${ex.status}).`, { artifact: ex, changed: false });
  }
  await store.putFile(w.id, artifactKey(id), code);
  const meta: ArtifactMeta = { id, title, kind, description: str(args.description, 2000), scwId, version: (ex?.version ?? 0) + 1,
    size: new TextEncoder().encode(code).length, sha256, status: failed.length ? "failed" : "checked", checks, render: null, source,
    createdAt: ex?.createdAt ?? t, updatedAt: t };
  if (ex) Object.assign(ex, meta); else arts.push(meta);
  await store.putWorkspace(w);
  const msg = failed.length ? `Stored ${title} (${id}) v${meta.version}, but ${failed.length} check(s) failed: ${failed.map((c) => `${c.name}: ${c.detail}`).join("; ")}.` : `Stored ${title} (${id}) v${meta.version}; all ${checks.length} checks passed. Open it with maxey0_open_artifacts.`;
  return text(msg, { artifact: ex ?? meta, changed: true });
}

// ---------------------------------------------------------------- JSON-RPC over HTTP
const rpcResult = (id: unknown, result: Json) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

export async function handleRpc(store: Store, wsId: string, baseUrl: string, msg: Json): Promise<Json | null> {
  const { id, method, params = {} } = msg ?? {};
  const isNotification = id === undefined || id === null;
  try {
    switch (method) {
      case "initialize": {
        const req = String(params.protocolVersion ?? "");
        return rpcResult(id, {
          protocolVersion: SUPPORTED_VERSIONS.includes(req) ? req : "2025-06-18",
          capabilities: { tools: { listChanged: false }, resources: { listChanged: false }, extensions: { "io.modelcontextprotocol/ui": {} } },
          serverInfo: SERVER_INFO,
          instructions: "Maxey0 manages Structured Context Worlds (SCWs) and stored artifacts. Call maxey0_open_app to open Maxey0 (workflow builder plus up to 4 artifact tiles); maxey0_open_artifacts shows every stored artifact as a board. When the user says 'Maxey0: execute plan <id>', call maxey0_get_plan and follow its instructions as the orchestrator. " + EFFORT_RULE,
        });
      }
      case "ping": return rpcResult(id, {});
      case "tools/list": return rpcResult(id, { tools: TOOLS });
      case "resources/list": return rpcResult(id, { resources: [{ uri: UI_URI, name: "Maxey0 dashboard", mimeType: UI_MIME, description: "Interactive Maxey0 SCW dashboard" }, { uri: ARTIFACTS_UI_URI, name: "Maxey0 artifacts", mimeType: UI_MIME, description: "Stored artifacts as live tiles" }, { uri: APP_UI_URI, name: "Maxey0", mimeType: UI_MIME, description: "Workflow builder with up to 4 artifact tiles" }] });
      case "resources/templates/list": return rpcResult(id, { resourceTemplates: [] });
      case "prompts/list": return rpcResult(id, { prompts: [] });
      case "resources/read": {
        if (params.uri === APP_UI_URI) return rpcResult(id, { contents: [{ uri: APP_UI_URI, mimeType: UI_MIME, text: APP_HTML, _meta: { ui: { prefersBorder: false, csp: { resourceDomains: RESOURCE_DOMAINS } } } }] });
        if (params.uri === ARTIFACTS_UI_URI) return rpcResult(id, { contents: [{ uri: ARTIFACTS_UI_URI, mimeType: UI_MIME, text: ARTIFACTS_HTML, _meta: { ui: { prefersBorder: false, csp: { resourceDomains: RESOURCE_DOMAINS } } } }] });
        if (params.uri !== UI_URI) return rpcError(id, -32002, `Resource not found: ${params.uri}`);
        return rpcResult(id, { contents: [{ uri: UI_URI, mimeType: UI_MIME, text: DASHBOARD_HTML, _meta: { ui: { prefersBorder: false } } }] });
      }
      case "tools/call": {
        try { return rpcResult(id, await callTool(store, wsId, baseUrl, String(params.name), params.arguments ?? {})); }
        catch (e) { if (e instanceof ToolError) return rpcResult(id, { content: [{ type: "text", text: e.message }], isError: true }); throw e; }
      }
      default:
        if (typeof method === "string" && method.startsWith("notifications/")) return null;
        return isNotification ? null : rpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (e) {
    return isNotification ? null : rpcError(id, -32603, `Internal error: ${(e as Error).message}`);
  }
}

// A full-screen artifact page runs untrusted artifact code on this server's host. "sandbox" gives it an
// opaque origin (no access to this origin's storage or cookies); the rest mirrors the in-chat tile policy.
const R = RESOURCE_DOMAINS.join(" ");
const ARTIFACT_PAGE_CSP = `sandbox allow-scripts allow-popups allow-forms; default-src 'none'; script-src 'unsafe-inline' ${R}; style-src 'unsafe-inline' ${R}; img-src data: blob: ${R}; font-src data: ${R}; media-src data: blob: ${R}; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`;
const JSON_UTF8 = { "Content-Type": "application/json; charset=utf-8" };
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "content-type, mcp-protocol-version, mcp-session-id, authorization, accept", "Access-Control-Expose-Headers": "mcp-session-id" };

/** Entry point. Routes: POST /mcp/<WORKSPACE_KEY> (MCP), GET|POST /u/<ticket> (upload page), GET /a/<ticket> (one artifact, full screen), GET / (health). */
export async function handleRequest(req: Request, store: Store, opts: { workspaceKey: string }): Promise<Response> {
  const url = new URL(req.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const parts = url.pathname.split("/").filter(Boolean);

  if (parts[0] === "mcp") {
    if (!opts.workspaceKey || opts.workspaceKey.length < 16) return new Response("Server not configured: set WORKSPACE_KEY (at least 16 characters).", { status: 500 });
    if (parts[1] !== opts.workspaceKey) return new Response("Not found", { status: 404 });
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST", ...CORS } });
    let body: any;
    try { body = await req.json(); } catch { return Response.json(rpcError(null, -32700, "Parse error"), { status: 400, headers: CORS }); }
    const wsId = `ws-${opts.workspaceKey.slice(0, 8)}`;
    const msgs = Array.isArray(body) ? body : [body];
    const out = (await Promise.all(msgs.map((m) => handleRpc(store, wsId, baseUrl, m)))).filter((x): x is Json => x !== null);
    if (!out.length) return new Response(null, { status: 202, headers: CORS });
    return Response.json(Array.isArray(body) ? out : out[0], { headers: { ...CORS, ...JSON_UTF8 } });
  }

  if (parts[0] === "u" && parts[1]) {
    const ticket = await store.getTicket(parts[1]);
    if (!ticket || ticket.artifactId) return new Response(uploadPage("This upload link has expired. Open a new one from the Maxey0 dashboard.", null), { status: 410, headers: { "Content-Type": "text/html; charset=utf-8" } });
    const w = await store.getWorkspace(ticket.ws);
    const scw = w.scws.find((s) => s.id === ticket.scwId);
    if (!scw) return new Response(uploadPage("That SCW no longer exists.", null), { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
    if (req.method === "POST") {
      const form = await req.formData();
      const added: string[] = [];
      for (const v of form.getAll("files")) {
        if (typeof v === "string") continue;
        const file = v as unknown as File;
        const buf = new Uint8Array(await file.arrayBuffer());
        const isText = /^text\/|json|xml|csv|markdown|javascript|typescript|yaml/.test(file.type) || /\.(md|txt|csv|json|ya?ml|ts|tsx|js|py|html|css|xml|log)$/i.test(file.name);
        const data = isText ? new TextDecoder().decode(buf) : btoa(Array.from(buf, (b) => String.fromCharCode(b)).join(""));
        try { await addFile(store, w, scw, file.name, file.type, data, isText ? "text" : "base64", "upload-link"); added.push(file.name); }
        catch (e) { added.push(`${file.name} (skipped: ${(e as Error).message})`); }
      }
      await store.putWorkspace(w);
      return new Response(uploadPage(`Added to “${scw.name}”: ${added.join(", ") || "nothing"}. Return to Claude and tap Refresh in the dashboard.`, scw.name), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    return new Response(uploadPage(null, scw.name), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  if (parts[0] === "a" && parts[1] && req.method === "GET") {
    const t = await store.getTicket(parts[1]);
    const page = (status: number, body: string) => new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": ARTIFACT_PAGE_CSP, "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" } });
    if (!t || !t.artifactId) return page(410, "<!doctype html><title>Link expired</title><p>This link has expired. Open the artifact again from Maxey0 in Claude.</p>");
    const w = await store.getWorkspace(t.ws);
    const a = (w.artifacts ?? []).find((x) => x.id === t.artifactId);
    if (!a || a.version !== t.version) return page(410, "<!doctype html><title>Link expired</title><p>This artifact changed or was removed. Open it again from Maxey0 in Claude.</p>");
    const code = await store.getFile(w.id, artifactKey(a.id));
    if (code == null) return page(404, "<!doctype html><p>Artifact content is missing.</p>");
    return page(200, tileDocument(a.kind, code, `${a.id}#${a.version}`).replace("<head>", `<head><title>${esc(a.title)}</title>`));
  }

  if (url.pathname === "/" || url.pathname === "/health") return Response.json({ ok: true, server: SERVER_INFO }, { headers: JSON_UTF8 });
  return new Response("Not found", { status: 404 });
}

function esc(s: string) { return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!); }
function uploadPage(message: string | null, scwName: string | null) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Maxey0 · Upload</title>
<style>body{font-family:system-ui,sans-serif;background:#070a1a;color:#e8ebff;margin:0;padding:24px;display:flex;justify-content:center}main{max-width:480px;width:100%}h1{font-size:20px}.card{background:#11163a;border:1px solid #2a3170;border-radius:14px;padding:18px}input[type=file]{width:100%;margin:12px 0;color:#c7ceff}button{width:100%;padding:14px;border:0;border-radius:10px;background:#4f6cff;color:white;font-size:16px}p{color:#b8c0f0}</style></head>
<body><main><h1>Maxey0 · Upload into SCW${scwName ? ` “${esc(scwName)}”` : ""}</h1><div class="card">${message ? `<p>${esc(message)}</p>` : ""}${scwName && !message ? `<form method="post" enctype="multipart/form-data"><input type="file" name="files" multiple required><button type="submit">Upload</button></form><p>Up to 4 MB per file. Text files can be read by agents; other files are stored as bytes.</p>` : ""}</div></main></body></html>`;
}
