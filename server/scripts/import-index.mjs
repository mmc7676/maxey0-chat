// Import an artifact index (made by artifact_index.py) into a Maxey0 server as artifact objects.
//
//   node scripts/import-index.mjs <index-dir> <mcp-url> [--all] [--dry-run]
//
//   <index-dir>  folder holding index.json and artifacts/ (artifact_index.py build --out)
//   <mcp-url>    the server's MCP endpoint, https://<worker>/mcp/<WORKSPACE_KEY>
//   --all        also import documents and code (default: apps only: react, html, svg, mermaid)
//   --dry-run    report what would be imported without calling the server
//
// Ids are derived from the source chat and the item, so running it again updates the same
// artifacts instead of adding copies. Unchanged code keeps its version.
import { readFileSync } from "node:fs"; import { join } from "node:path"; import { createHash } from "node:crypto";

export const APP_KINDS = ["react", "html", "svg", "mermaid"];
const KIND_BY_EXT = { tsx: "react", jsx: "react", html: "html", htm: "html", svg: "svg", mmd: "mermaid", md: "markdown" };
const SOURCE = { artifact: "chat", legacy: "chat", file: "file", published: "published" };

export function stableId(r) {
  const h = createHash("sha256").update(`${r.conversation_uuid}\n${r.source}\n${r.artifact_id}`).digest("hex").slice(0, 12);
  const slug = String(r.title || r.artifact_id).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "item";
  return `imp-${h}-${slug}`;
}

export function kindOfRecord(r) {
  if (APP_KINDS.includes(r.kind) || ["markdown", "code", "text"].includes(r.kind)) return r.kind;
  const ext = String(r.file).split(".").pop().toLowerCase();
  return KIND_BY_EXT[ext] ?? "text";
}

export function plan(indexDir, { all = false } = {}) {
  const idx = JSON.parse(readFileSync(join(indexDir, "index.json"), "utf8"));
  if (idx.schema !== "artifact-index/v1") throw new Error(`Not an artifact index: schema ${idx.schema}`);
  const rows = idx.artifacts.map((r) => ({ r, kind: kindOfRecord(r) }));
  const chosen = rows.filter(({ kind }) => all || APP_KINDS.includes(kind));
  return { total: rows.length, chosen: chosen.map(({ r, kind }) => ({
    id: stableId(r), title: r.title || r.artifact_id.split("/").pop(), kind,
    code: readFileSync(join(indexDir, r.file), "utf8"),
    description: [r.description, r.errors ? `Rebuilt from chat history; may be incomplete: ${r.errors}` : ""].filter(Boolean).join(" "),
    source: { type: SOURCE[r.source] ?? "chat", ...(r.chat_url ? { chatUrl: r.chat_url } : {}), ...(r.chat_title && r.chat_title !== "(published)" ? { chatTitle: r.chat_title } : {}), originId: r.artifact_id },
  })) };
}

/** Run the import with a caller-supplied tools/call function (HTTP for real servers, in-process for tests). */
export async function runImport(items, callTool, log = () => {}) {
  const out = { created: 0, updated: 0, unchanged: 0, checksFailed: 0, rejected: [] };
  for (const it of items) {
    const r = await callTool("artifact_upsert", it);
    if (r.isError) { out.rejected.push(`${it.title}: ${r.content?.[0]?.text}`); continue; }
    const a = r.structuredContent.artifact;
    if (!r.structuredContent.changed) out.unchanged++; else if (a.version === 1) out.created++; else out.updated++;
    if (a.status === "failed") out.checksFailed++;
    log(`${a.status === "failed" ? "FAILED CHECKS" : "ok"}  ${a.kind}  ${a.title}`);
  }
  return out;
}

export function httpCaller(url) {
  let id = 0;
  return async (name, args) => {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }) });
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${await res.text()}`);
    const body = await res.json();
    if (body.error) throw new Error(`${name}: ${body.error.message}`);
    return body.result;
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dir, url, ...flags] = process.argv.slice(2);
  if (!dir || (!url && !flags.includes("--dry-run"))) { console.error("usage: node scripts/import-index.mjs <index-dir> <mcp-url> [--all] [--dry-run]"); process.exit(2); }
  const p = plan(dir, { all: flags.includes("--all") });
  console.log(`${p.chosen.length} of ${p.total} index items selected (${flags.includes("--all") ? "all kinds" : "apps only"}).`);
  if (flags.includes("--dry-run") || !url) process.exit(0);
  const caller = httpCaller(url);
  const r = await runImport(p.chosen, caller, console.log);
  const listed = (await caller("artifact_list", { limit: 1 })).structuredContent.total;
  console.log(`created ${r.created}, updated ${r.updated}, unchanged ${r.unchanged}, rejected ${r.rejected.length}; ${r.checksFailed} stored with failed checks.`);
  for (const x of r.rejected) console.log(`  rejected: ${x}`);
  console.log(`server now lists ${listed} artifact(s).`);
  process.exit(r.rejected.length ? 1 : 0);
}
