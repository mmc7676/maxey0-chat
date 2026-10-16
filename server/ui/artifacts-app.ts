// Maxey0 artifacts board: an MCP Apps view that shows stored artifacts as tiles and runs each one
// in its own sandboxed frame. Speaks the MCP Apps postMessage protocol (spec 2026-01-26) directly.
// Built by build-ui-artifacts.mjs into src/artifacts-ui-html.ts.
import { ArtifactMeta, ArtifactKind, RENDERED_KINDS, tileDocument } from "../src/artifacts";

declare const __LOGO__: string;

type Json = Record<string, any>;
interface Tile { meta: ArtifactMeta; open: boolean; expanded: boolean; state: "idle" | "loading" | "running" | "rendered" | "error"; detail: string; frame?: HTMLIFrameElement; reported?: number; el?: { root: HTMLElement; head: HTMLElement; slot: HTMLElement; actions: HTMLElement } }

const PROTOCOL = "2026-01-26";
const AUTO_OPEN_MAX = 4;
const tiles = new Map<string, Tile>();
let order: string[] = [];
let total = 0;
let filterText = "";
let filterKind: ArtifactKind | "" = "";
let hostReady = false;

// ---------------------------------------------------------------- host bridge
let nextId = 1;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
function request(method: string, params: Json = {}): Promise<any> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
    setTimeout(() => { if (pending.delete(id)) reject(new Error(`${method} timed out`)); }, 30000);
  });
}
function notify(method: string, params: Json = {}) { window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*"); }

async function callTool(name: string, args: Json): Promise<Json> {
  const r = await request("tools/call", { name, arguments: args });
  if (r?.isError) throw new Error(r.content?.map((c: Json) => c.text).join(" ") || `${name} failed`);
  return r?.structuredContent ?? {};
}

function acceptList(sc: Json) {
  if (!Array.isArray(sc?.artifacts)) return;
  total = typeof sc.total === "number" ? sc.total : sc.artifacts.length;
  order = [];
  for (const meta of sc.artifacts as ArtifactMeta[]) {
    const t = tiles.get(meta.id);
    if (t && t.meta.version !== meta.version) { t.meta = meta; if (t.open) { t.open = false; t.state = "idle"; } }
    else if (t) t.meta = meta;
    else tiles.set(meta.id, { meta, open: false, expanded: false, state: "idle", detail: "" });
    order.push(meta.id);
  }
  draw();
  if (Array.isArray(sc.ids)) for (const id of order.slice(0, AUTO_OPEN_MAX)) openTile(id);
}

window.addEventListener("message", (e: MessageEvent) => {
  const d = e.data;
  if (d && typeof d === "object" && "maxey0Tile" in d) return onTileMessage(e);
  if (e.source !== window.parent || !d || d.jsonrpc !== "2.0") return;
  if (d.id !== undefined && pending.has(d.id)) {
    const p = pending.get(d.id)!; pending.delete(d.id);
    return d.error ? p.reject(new Error(d.error.message || "host error")) : p.resolve(d.result);
  }
  if (d.method === "ui/notifications/tool-result") acceptList(d.params?.structuredContent ?? {});
  if (d.method === "ui/notifications/tool-input" && d.params?.arguments) {
    const a = d.params.arguments; filterText = typeof a.query === "string" ? a.query : filterText; filterKind = a.kind || filterKind; syncControls();
  }
  if (d.method === "ui/resource-teardown" && d.id !== undefined) window.parent.postMessage({ jsonrpc: "2.0", id: d.id, result: {} }, "*");
});

// ---------------------------------------------------------------- tiles
function onTileMessage(e: MessageEvent) {
  const d = e.data as { maxey0Tile: string; type: string; detail: string };
  const t = tiles.get(String(d.maxey0Tile).split("#")[0]);
  if (!t || !t.frame || e.source !== t.frame.contentWindow) return;
  if (d.type === "rendered" && t.state !== "error") { t.state = "rendered"; t.detail = d.detail; }
  if (d.type === "error") { t.state = "error"; t.detail = d.detail; }
  drawTileStatus(t);
  if (hostReady && t.reported !== t.meta.version && (t.state === "rendered" || t.state === "error")) {
    t.reported = t.meta.version;
    callTool("artifact_report_render", { id: t.meta.id, version: t.meta.version, ok: t.state === "rendered", detail: t.detail })
      .then((r) => { if (r.artifact && r.artifact.version === t.meta.version) { t.meta = r.artifact; renderCard(t); } }).catch(() => {});
  }
}

async function loadCode(id: string): Promise<string> {
  let code = "", offset = 0;
  for (let i = 0; i < 100; i++) {
    const r = await callTool("artifact_get", { id, offset });
    code += String(r.code ?? "");
    if (r.done || !r.code) return code;
    offset = Number(r.offset) + String(r.code).length;
  }
  throw new Error("artifact too long to load");
}

async function openTile(id: string) {
  const t = tiles.get(id); if (!t || t.state === "loading") return;
  t.open = true; t.state = "loading"; t.detail = "loading code"; draw();
  try {
    const code = await loadCode(id);
    t.state = "running"; t.detail = RENDERED_KINDS.includes(t.meta.kind) ? "starting" : "text";
    draw();
    const f = document.createElement("iframe");
    f.setAttribute("sandbox", "allow-scripts allow-popups allow-forms");
    f.setAttribute("title", t.meta.title);
    f.className = "frame";
    f.srcdoc = tileDocument(t.meta.kind, code, `${id}#${t.meta.version}`);
    t.frame = f;
    t.el?.slot.replaceChildren(f);
    setTimeout(() => { if (t.state === "running") { t.state = "error"; t.detail = "no response from the artifact after 20 s"; drawTileStatus(t); } }, 20000);
  } catch (err) { t.state = "error"; t.detail = (err as Error).message; draw(); }
}

function closeTile(id: string) { const t = tiles.get(id); if (!t) return; t.open = false; t.expanded = false; t.frame = undefined; t.state = "idle"; t.detail = ""; t.el?.slot.replaceChildren(); draw(); }

// ---------------------------------------------------------------- view
/** Drop empty slots: DOM replaceChildren would turn null into the text "null". */
const present = (...xs: (Node | null | false | undefined)[]) => xs.filter((x): x is Node => !!x);
const cssId = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_");
function h(tag: string, attrs: Json = {}, ...kids: (Node | string | null | false | undefined)[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "on") for (const [ev, fn] of Object.entries(v as Json)) el.addEventListener(ev, fn as EventListener);
    else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

function statusChip(t: Tile) {
  const m = t.meta;
  if (t.open) return h("span", { class: `chip st-${t.state}` }, ({ idle: "", loading: "loading", running: "starting", rendered: "running", error: "error" } as Json)[t.state]);
  if (m.status === "failed") return h("span", { class: "chip st-error" }, "checks failed");
  if (m.render && !m.render.ok) return h("span", { class: "chip st-error" }, "failed last run");
  if (m.render?.ok) return h("span", { class: "chip st-rendered" }, "ran ok");
  return h("span", { class: "chip" }, "not run yet");
}

/** A tile's card is created once and updated in place. Its frame is never moved or re-parented,
 *  because moving an iframe in the DOM reloads it and would restart a running artifact. */
function ensureCard(t: Tile) {
  if (!t.el) {
    const head = h("div", {}), slot = h("div", { class: "slot" }), actions = h("div", { class: "row actions" });
    t.el = { root: h("article", { class: "tile", "data-id": t.meta.id }, head, slot, actions), head, slot, actions };
  }
  return t.el;
}

function drawTileStatus(t: Tile) { if (t.el) renderCard(t); }

function renderCard(t: Tile) {
  const el = ensureCard(t), m = t.meta;
  const failed = m.checks.filter((c) => !c.ok);
  const err = t.state === "error" ? t.detail : (!t.open && m.render && !m.render.ok ? m.render.detail : "");
  el.root.className = `tile${t.expanded ? " wide" : ""}`;
  el.head.replaceChildren(...present(
    h("div", { class: "row" },
      h("div", { class: "grow" }, h("div", { class: "title" }, m.title), h("div", { class: "meta" }, `${m.kind} · v${m.version} · ${(m.size / 1024).toFixed(1)} KB${m.source.chatTitle ? ` · ${m.source.chatTitle}` : ""}`)),
      statusChip(t)),
    m.description ? h("p", { class: "desc" }, m.description) : null,
    failed.length ? h("ul", { class: "fails" }, ...failed.map((c) => h("li", {}, `${c.name}: ${c.detail}`))) : null,
    err ? h("div", { class: "err", role: "status" }, err) : null));
  el.slot.className = `slot${t.open ? "" : " off"}${t.expanded ? " tall" : ""}`;
  if (t.open && !t.frame && !el.slot.firstChild) el.slot.replaceChildren(h("div", { class: "meta pad" }, t.detail));
  if (t.open && !t.frame && el.slot.firstChild && !(el.slot.firstChild instanceof HTMLIFrameElement)) (el.slot.firstChild as HTMLElement).textContent = t.detail;
  el.actions.replaceChildren(...present(
    t.open ? h("button", { type: "button", on: { click: () => closeTile(m.id) } }, "Close") : h("button", { type: "button", class: "primary", on: { click: () => openTile(m.id) } }, failed.length ? "Open anyway" : "Open"),
    t.open ? h("button", { type: "button", "aria-pressed": String(t.expanded), on: { click: () => { t.expanded = !t.expanded; renderCard(t); } } }, t.expanded ? "Shrink" : "Expand") : null,
    m.source.chatUrl ? h("a", { href: m.source.chatUrl, target: "_blank", rel: "noopener" }, "Source chat") : null));
}

function visible() {
  const terms = filterText.toLowerCase().split(/\s+/).filter(Boolean);
  return order.map((id) => tiles.get(id)!).filter((t) => (!filterKind || t.meta.kind === filterKind) &&
    terms.every((x) => `${t.meta.title} ${t.meta.description} ${t.meta.source.chatTitle ?? ""} ${t.meta.kind}`.toLowerCase().includes(x)));
}

let drawnOrder = "";
function draw() {
  const grid = document.getElementById("grid")!;
  const key = order.join("\n");
  if (key !== drawnOrder) {
    // Membership changed (a refresh). Append only cards not yet in the grid and drop removed ones;
    // existing cards, and their running frames, stay where they are.
    const keep = new Set(order);
    for (const [id, t] of tiles) if (!keep.has(id) && t.el) { t.el.root.remove(); tiles.delete(id); }
    for (const id of order) { const el = ensureCard(tiles.get(id)!); if (!el.root.isConnected) grid.append(el.root); }
    drawnOrder = key;
  }
  const shown = new Set(visible().map((t) => t.meta.id));
  for (const id of order) { const t = tiles.get(id)!; renderCard(t); t.el!.root.hidden = !shown.has(id); }
  document.getElementById("count")!.textContent = total ? `${shown.size} shown of ${total}` : "";
  document.getElementById("empty")!.hidden = order.length > 0;
}

function syncControls() {
  (document.getElementById("q") as HTMLInputElement).value = filterText;
  (document.getElementById("kind") as HTMLSelectElement).value = filterKind;
  draw();
}

async function refresh() {
  try { acceptList(await callTool("artifact_list", { limit: 200, ...(filterKind ? { kind: filterKind } : {}) })); }
  catch (err) { const e = document.getElementById("top-err")!; e.textContent = `Couldn't load artifacts: ${(err as Error).message}`; }
}

function mount() {
  document.body.append(
    h("header", { class: "row" }, h("img", { src: __LOGO__, width: "32", height: "32", alt: "Maxey0 logo" }),
      h("div", { class: "grow" }, h("div", { class: "title" }, "Maxey0 artifacts"), h("div", { class: "meta", id: "count" }, "")),
      h("button", { type: "button", on: { click: refresh } }, "Refresh"),
      h("button", { type: "button", on: { click: () => request("ui/request-display-mode", { mode: "fullscreen" }).catch(() => {}) } }, "Full screen")),
    h("div", { class: "row filters" },
      h("input", { id: "q", type: "search", placeholder: "Search titles and chats", "aria-label": "Search artifacts", on: { input: (e: Event) => { filterText = (e.target as HTMLInputElement).value; draw(); } } }),
      h("select", { id: "kind", "aria-label": "Kind", on: { change: (e: Event) => { filterKind = (e.target as HTMLSelectElement).value as ArtifactKind; draw(); } } },
        ...["", "react", "html", "svg", "mermaid", "markdown", "code", "text"].map((k) => h("option", { value: k }, k || "All kinds")))),
    h("div", { class: "err", id: "top-err", role: "status" }),
    h("p", { class: "meta", id: "empty" }, "No artifacts yet. Ask Claude to build one, or import your export index."),
    h("section", { id: "grid", class: "grid" }));
  new ResizeObserver(() => notify("ui/notifications/size-changed", { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })).observe(document.body);
}

async function start() {
  mount();
  draw();
  try {
    await request("ui/initialize", { protocolVersion: PROTOCOL, clientInfo: { name: "maxey0-artifacts", version: "1.0.0" }, capabilities: {}, appCapabilities: { availableDisplayModes: ["inline", "fullscreen"] } });
    hostReady = true;
    notify("ui/notifications/initialized", {});
    if (!order.length) await refresh();
  } catch (err) {
    document.getElementById("top-err")!.textContent = `Couldn't connect to Claude: ${(err as Error).message}`;
  }
}

start();
