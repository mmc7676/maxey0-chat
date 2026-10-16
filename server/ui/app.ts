// Maxey0 app: one MCP Apps view holding the workflow builder (plugins/maxey0/app/maxey0.js, unchanged)
// and an Artifacts section with up to 4 live artifact tiles. Artifacts are placed into tiles the same way
// agents are placed onto steps: drag one from the import tray onto a tile, or tap it and then tap a tile.
// Built by build-ui-app.mjs into src/app-ui-html.ts. Speaks the MCP Apps postMessage protocol (2026-01-26).
import { ArtifactMeta, RENDERED_KINDS, tileDocument } from "../src/artifacts";

declare const __LOGO__: string;
declare const __VERSION__: string;
type Json = Record<string, any>;

const PROTOCOL = "2026-01-26";
const SLOT_MAX = 4;

interface Slot {
  meta: ArtifactMeta | null;
  state: "empty" | "loading" | "running" | "rendered" | "error";
  detail: string;
  expanded: boolean;
  frame?: HTMLIFrameElement;
  reported?: number;
  link?: string;
  el: { root: HTMLElement; head: HTMLElement; body: HTMLElement; actions: HTMLElement; note: HTMLElement };
}

const slots: Slot[] = [];
let tray: ArtifactMeta[] = [];
let trayTotal = 0;
const TRAY_PAGE = 12;
let trayShown = TRAY_PAGE;
let pick: string | null = null;
let focused = -1;
let collapsed = false;
let hostReady = false;
let gotResult = false;

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

// The builder's Run button calls sendPrompt(text). In the inline widget that is the chat's own function;
// here it becomes an MCP Apps ui/message, which the host sends as the user's next message.
(window as any).sendPrompt = (text: string) =>
  request("ui/message", { role: "user", content: [{ type: "text", text }] })
    .then((r) => { if (r?.isError) throw new Error("the chat did not accept the message"); })
    .catch((e: Error) => setNote(`Couldn't send the run to the chat: ${e.message}. Copy it instead: ${text.slice(0, 200)}…`));

window.addEventListener("message", (e: MessageEvent) => {
  const d = e.data;
  if (d && typeof d === "object" && "maxey0Tile" in d) return onTileMessage(e);
  if (e.source !== window.parent || !d || d.jsonrpc !== "2.0") return;
  if (d.id !== undefined && pending.has(d.id)) {
    const p = pending.get(d.id)!; pending.delete(d.id);
    return d.error ? p.reject(new Error(d.error.message || "host error")) : p.resolve(d.result);
  }
  if (d.method === "ui/notifications/tool-result") { gotResult = true; accept(d.params?.structuredContent ?? {}); }
  if (d.method === "ui/resource-teardown" && d.id !== undefined) window.parent.postMessage({ jsonrpc: "2.0", id: d.id, result: {} }, "*");
});

// ---------------------------------------------------------------- state from the tool result
function accept(sc: Json) {
  if (sc.builder !== undefined) mountBuilder(sc.builder || {});
  if (Array.isArray(sc.tray)) { tray = sc.tray; trayTotal = Number(sc.trayTotal) || tray.length; trayShown = TRAY_PAGE; }
  if (typeof sc.query === "string") (document.getElementById("tray-q") as HTMLInputElement).value = sc.query;
  if (Array.isArray(sc.slots)) {
    const want: ArtifactMeta[] = sc.slots.slice(0, SLOT_MAX);
    want.forEach((m, i) => { if (slots[i].meta?.id !== m.id || slots[i].meta?.version !== m.version) place(i, m, false); });
    for (let i = want.length; i < SLOT_MAX; i++) if (slots[i].meta) clearSlot(i, false);
  }
  drawTray(); drawHeader();
}

function mountBuilder(state: Json) {
  const host = document.getElementById("builder")!;
  host.replaceChildren(h("div", { id: "m0" }));
  const M = (window as any).Maxey0;
  if (M?.mount) M.mount(state); else host.textContent = "The workflow builder did not load.";
}

// ---------------------------------------------------------------- tiles
function onTileMessage(e: MessageEvent) {
  const d = e.data as { maxey0Tile: string; type: string; detail: string };
  const s = slots.find((x) => x.frame && e.source === x.frame.contentWindow);
  if (!s || !s.meta || String(d.maxey0Tile) !== `${s.meta.id}#${s.meta.version}`) return;
  if (d.type === "rendered" && s.state !== "error") { s.state = "rendered"; s.detail = d.detail; }
  if (d.type === "error") { s.state = "error"; s.detail = d.detail; }
  drawSlot(slots.indexOf(s));
  if (hostReady && s.reported !== s.meta.version && (s.state === "rendered" || s.state === "error")) {
    s.reported = s.meta.version;
    callTool("artifact_report_render", { id: s.meta.id, version: s.meta.version, ok: s.state === "rendered", detail: s.detail }).catch(() => {});
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

/** Put an artifact in tile i and start it. A frame is created once per placement and never moved:
 *  moving an iframe in the DOM reloads it, which would restart the artifact. */
async function place(i: number, meta: ArtifactMeta, save = true) {
  const other = slots.findIndex((x, j) => j !== i && x.meta?.id === meta.id);
  if (other >= 0) { setNote(`${meta.title} is already in tile ${other + 1}.`); return; }
  const s = slots[i];
  s.meta = meta; s.state = "loading"; s.detail = "loading code"; s.frame = undefined; s.reported = undefined; s.link = undefined;
  s.el.body.replaceChildren(h("div", { class: "meta pad" }, "Loading…"));
  drawSlot(i); drawHeader(); drawTray();
  if (save) persist();
  try {
    const code = await loadCode(meta.id);
    if (s.meta !== meta) return;
    s.state = "running"; s.detail = RENDERED_KINDS.includes(meta.kind) ? "starting" : "text";
    const f = document.createElement("iframe");
    f.setAttribute("sandbox", "allow-scripts allow-popups allow-forms");
    f.setAttribute("title", meta.title);
    f.className = "frame";
    f.srcdoc = tileDocument(meta.kind, code, `${meta.id}#${meta.version}`);
    s.frame = f;
    s.el.body.replaceChildren(f);
    drawSlot(i);
    setTimeout(() => { if (s.meta === meta && s.state === "running") { s.state = "error"; s.detail = "no response from the artifact after 20 s"; drawSlot(i); } }, 20000);
  } catch (err) { if (s.meta === meta) { s.state = "error"; s.detail = (err as Error).message; drawSlot(i); } }
}

function clearSlot(i: number, save = true) {
  if (focused === i) setFocus(-1);
  const s = slots[i];
  s.meta = null; s.state = "empty"; s.detail = ""; s.frame = undefined; s.expanded = false; s.link = undefined;
  s.el.body.replaceChildren();
  drawSlot(i); drawHeader(); drawTray();
  if (save) persist();
}

function persist() {
  if (!hostReady) return;
  callTool("maxey0_app_action", { action: "slots.set", ids: slots.map((s) => s.meta?.id).filter(Boolean) })
    .catch((e: Error) => setNote(`Couldn't save the tiles: ${e.message}`));
}

/** Full screen inside Claude: the host's fullscreen display mode, with this one tile filling the view. */
function setFocus(i: number) {
  focused = i;
  document.body.classList.toggle("focus", i >= 0);
  slots.forEach((s, j) => s.el.root.classList.toggle("focused", j === i));
  request("ui/request-display-mode", { mode: i >= 0 ? "fullscreen" : "inline" }).catch(() => {});
  slots.forEach((_, j) => drawSlot(j));
}

/** Full screen outside Claude: a 10-minute link to this artifact alone, opened in the browser. */
async function openOutside(i: number) {
  const s = slots[i]; if (!s.meta) return;
  try {
    const r = await callTool("maxey0_app_action", { action: "artifact.link", id: s.meta.id });
    s.link = String(r.url);
    drawSlot(i);
    const o = await request("ui/open-link", { url: s.link }).catch(() => ({ isError: true }));
    if (o?.isError) setNote("Claude didn't open the link. Use the link shown on the tile.");
  } catch (err) { setNote(`Couldn't create a link: ${(err as Error).message}`); }
}

// ---------------------------------------------------------------- view
const present = (...xs: (Node | null | false | undefined)[]) => xs.filter((x): x is Node => !!x);
function h(tag: string, attrs: Json = {}, ...kids: (Node | string | null | false | undefined)[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "on") for (const [ev, fn] of Object.entries(v as Json)) el.addEventListener(ev, fn as EventListener);
    else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}
function setNote(m: string, info = false) { const e = document.getElementById("arts-note")!; e.textContent = m; e.className = info ? "meta" : "err"; }

const LABEL: Json = { empty: "", loading: "loading", running: "starting", rendered: "running", error: "error" };

function drawSlot(i: number) {
  const s = slots[i], el = s.el, m = s.meta;
  el.root.className = `tslot${m ? "" : " empty"}${s.expanded ? " wide" : ""}${focused === i ? " focused" : ""}`;
  el.root.setAttribute("aria-label", m ? `Tile ${i + 1}: ${m.title}` : `Tile ${i + 1}: empty`);
  if (!m) {
    el.head.replaceChildren(h("div", { class: "meta" }, `Tile ${i + 1}`));
    el.body.className = "tbody";
    el.note.replaceChildren();
    el.actions.replaceChildren(h("button", { type: "button", class: "drop", on: { click: () => onSlotTap(i) } },
      pick ? `Place here` : "Drop an artifact here, or tap one above and then tap here"));
    return;
  }
  el.head.replaceChildren(h("div", { class: "row" },
    h("div", { class: "grow" }, h("div", { class: "title" }, m.title), h("div", { class: "meta" }, `${m.kind} · v${m.version}${m.source.chatTitle ? ` · ${m.source.chatTitle}` : ""}`)),
    h("span", { class: `chip st-${s.state}` }, LABEL[s.state])));
  el.body.className = `tbody${s.expanded ? " tall" : ""}`;
  el.note.replaceChildren(...present(
    s.state === "error" ? h("div", { class: "err", role: "status" }, s.detail) : null,
    s.link ? h("div", { class: "meta" }, "Full-screen link (10 minutes): ", h("a", { href: s.link, target: "_blank", rel: "noopener noreferrer" }, "open")) : null));
  el.actions.replaceChildren(...present(
    focused === i
      ? h("button", { type: "button", class: "primary", on: { click: () => setFocus(-1) } }, "Exit full screen")
      : h("button", { type: "button", "aria-pressed": String(s.expanded), on: { click: () => { s.expanded = !s.expanded; drawSlot(i); } } }, s.expanded ? "Shrink" : "Expand"),
    focused === i ? null : h("button", { type: "button", on: { click: () => setFocus(i) } }, "Full screen"),
    h("button", { type: "button", on: { click: () => openOutside(i) } }, "Open outside ↗"),
    focused === i ? null : h("button", { type: "button", on: { click: () => clearSlot(i) } }, "Remove"),
    pick && focused !== i ? h("button", { type: "button", class: "primary", on: { click: () => onSlotTap(i) } }, "Replace with selected") : null));
}

function onSlotTap(i: number) {
  if (!pick) { setNote("Tap an artifact in the tray first, then tap a tile.", true); return; }
  setNote("", true);
  const meta = tray.find((a) => a.id === pick) ?? slots.find((s) => s.meta?.id === pick)?.meta;
  pick = null;
  if (meta) place(i, meta); else drawTray();
  slots.forEach((_, j) => drawSlot(j));
}

function onDrop(i: number, e: DragEvent) {
  e.preventDefault(); slots[i].el.root.classList.remove("hot");
  const id = e.dataTransfer?.getData("text/x-maxey0-artifact"); if (!id) return;
  const meta = tray.find((a) => a.id === id); if (meta) { pick = null; place(i, meta); slots.forEach((_, j) => drawSlot(j)); }
}

function drawTray() {
  const placed = new Set(slots.map((s) => s.meta?.id).filter(Boolean));
  const list = document.getElementById("tray")!;
  const more = Math.min(TRAY_PAGE, Math.max(tray.length, trayTotal) - trayShown);
  list.replaceChildren(...(tray.length ? [...tray.slice(0, trayShown).map((a) => h("span", {
    class: `chip art${pick === a.id ? " pick" : ""}${placed.has(a.id) ? " placed" : ""}`, role: "button", tabindex: "0", draggable: "true",
    "aria-pressed": String(pick === a.id), "data-id": a.id, title: `${a.kind}${a.source.chatTitle ? ` · ${a.source.chatTitle}` : ""}`,
    on: {
      dragstart: (e: DragEvent) => { e.dataTransfer!.setData("text/x-maxey0-artifact", a.id); e.dataTransfer!.effectAllowed = "copy"; },
      click: () => { pick = pick === a.id ? null : a.id; drawTray(); slots.forEach((_, j) => drawSlot(j)); setNote(pick ? `${a.title} selected. Tap a tile to place it.` : "", true); },
      keydown: (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (e.target as HTMLElement).click(); } },
    } }, a.title, h("span", { class: "kind" }, ` ${a.kind}`))),
    ...(more > 0 ? [h("button", { type: "button", id: "tray-more", on: { click: showMore } }, `Show ${more} more`)] : [])] : [h("span", { class: "meta" }, "No artifacts match.")]));
  const total = Math.max(trayTotal, tray.length);
  document.getElementById("tray-count")!.textContent = `${Math.min(trayShown, tray.length)} of ${total} artifact(s) shown`;
}

/** Results are listed in full in the page (no inner scroll box, which phones don't scroll inside the
 *  chat), 12 at a time. Past the loaded results, the next page is fetched from the server. */
async function showMore() {
  trayShown += TRAY_PAGE;
  if (trayShown > tray.length && tray.length < trayTotal) {
    const q = (document.getElementById("tray-q") as HTMLInputElement).value;
    try { const r = await callTool("artifact_list", { query: q, limit: 50, offset: tray.length }); tray = tray.concat(r.artifacts ?? []); trayTotal = Number(r.total) || trayTotal; }
    catch (err) { setNote(`Couldn't load more artifacts: ${(err as Error).message}`); }
  }
  drawTray();
}

function drawHeader() {
  const n = slots.filter((s) => s.meta).length;
  const t = document.getElementById("arts-toggle")!;
  t.textContent = `${collapsed ? "▸" : "▾"} Artifacts · ${n} of ${SLOT_MAX}`;
  t.setAttribute("aria-expanded", String(!collapsed));
  document.getElementById("arts-body")!.classList.toggle("collapsed", collapsed);
}

let searchTimer: number | undefined;
function onSearch() {
  clearTimeout(searchTimer);
  searchTimer = window.setTimeout(async () => {
    const q = (document.getElementById("tray-q") as HTMLInputElement).value;
    try { const r = await callTool("artifact_list", { query: q, limit: 50 }); tray = r.artifacts ?? []; trayTotal = Number(r.total) || tray.length; trayShown = TRAY_PAGE; drawTray(); }
    catch (err) { setNote(`Couldn't search artifacts: ${(err as Error).message}`); }
  }, 250);
}

function mount() {
  document.body.append(
    h("div", { id: "builder" }, h("p", { class: "meta" }, "Loading Maxey0…")),
    h("section", { id: "arts" },
      h("div", { class: "row arts-head" },
        h("button", { type: "button", id: "arts-toggle", class: "toggle", on: { click: () => { collapsed = !collapsed; drawHeader(); } } }, ""),
        h("span", { class: "meta grow" }, `Maxey0 ${__VERSION__}`)),
      h("div", { id: "arts-body" },
        h("div", { class: "lbl" }, "Import"),
        h("div", { class: "meta" }, "Drag an artifact onto a tile, or tap an artifact and then tap a tile."),
        h("div", { class: "row" }, h("input", { id: "tray-q", type: "search", placeholder: "Search your artifacts", "aria-label": "Search artifacts", on: { input: onSearch } })),
        h("div", { class: "meta", id: "tray-count" }, ""),
        h("div", { class: "row tray", id: "tray" }),
        h("div", { class: "err", id: "arts-note", role: "status" }),
        h("div", { class: "tgrid", id: "slots" }))));
  const grid = document.getElementById("slots")!;
  for (let i = 0; i < SLOT_MAX; i++) {
    const head = h("div", {}), body = h("div", { class: "tbody" }), note = h("div", {}), actions = h("div", { class: "row actions" });
    const root = h("article", { class: "tslot empty", "data-slot": String(i), on: {
      dragover: (e: DragEvent) => { e.preventDefault(); root.classList.add("hot"); },
      dragleave: () => root.classList.remove("hot"),
      drop: (e: DragEvent) => onDrop(i, e),
    } }, head, body, note, actions);
    grid.append(root);
    slots.push({ meta: null, state: "empty", detail: "", expanded: false, el: { root, head, body, actions, note } });
    drawSlot(i);
  }
  drawHeader(); drawTray();
  new ResizeObserver(() => notify("ui/notifications/size-changed", { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })).observe(document.body);
}

async function start() {
  mount();
  try {
    await request("ui/initialize", { protocolVersion: PROTOCOL, appInfo: { name: "maxey0", version: __VERSION__ }, appCapabilities: { availableDisplayModes: ["inline", "fullscreen"] } });
    hostReady = true;
    notify("ui/notifications/initialized", {});
    // Report the size now: the host may ignore size changes sent before initialization completed.
    notify("ui/notifications/size-changed", { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight });
    // If the host doesn't deliver the tool result (or the view was opened another way), load the saved state.
    setTimeout(async () => { if (!gotResult) { try { accept(await callTool("maxey0_open_app", {})); } catch (err) { setNote(`Couldn't load Maxey0: ${(err as Error).message}`); } } }, 1500);
  } catch (err) {
    setNote(`Couldn't connect to Claude: ${(err as Error).message}`);
    mountBuilder({});
  }
}

start();
