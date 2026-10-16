// Step 4: importing an artifact index into artifact objects. Counts must match the index.
import { test } from "node:test"; import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
import { handleRequest, KVStore, MemoryKV } from "../build/node.mjs";
import { plan, runImport, stableId, kindOfRecord } from "../scripts/import-index.mjs";

const KEY = "import-key-0123456789abcdef";
const server = () => { const store = new KVStore(new MemoryKV()); let id = 0;
  return async (name, args) => (await (await handleRequest(new Request(`https://x/mcp/${KEY}`, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }) }), store, { workspaceKey: KEY })).json()).result; };

const rec = (o) => ({ artifact_id: "a", conversation_uuid: "c1", chat_title: "Chat", chat_url: "https://claude.ai/chat/c1", title: "T", kind: "react", source: "artifact", errors: "", description: "", ...o });
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "idx-")); mkdirSync(join(dir, "artifacts"));
  const rows = [
    rec({ artifact_id: "hub", title: "Agent Hub", file: "artifacts/c1_hub.jsx" }),
    rec({ artifact_id: "/out/dash.html", title: "dash.html", kind: "html", source: "file", file: "artifacts/c1_dash.html" }),
    rec({ artifact_id: "/home/App.tsx", title: "App.tsx", kind: "application/vnd.ant.react", source: "file", file: "artifacts/c1_App.tsx" }),
    rec({ artifact_id: "pub1", conversation_uuid: "", chat_title: "(published)", chat_url: "", title: "Repo Tree", kind: "html", source: "published", description: "tree view", file: "artifacts/published_pub1.html" }),
    rec({ artifact_id: "notes", title: "Notes", kind: "markdown", file: "artifacts/c1_notes.md" }),
    rec({ artifact_id: "broken", title: "Broken edit", errors: "update 3: text to replace not found", file: "artifacts/c1_broken.jsx" }),
  ];
  const code = { "c1_hub.jsx": "import React from 'react';\nexport default () => <p>hub</p>", "c1_dash.html": "<p>dash</p>", "c1_App.tsx": "import { motion } from 'framer-motion';\nexport default () => null",
    "published_pub1.html": "<h1>tree</h1>", "c1_notes.md": "# notes", "c1_broken.jsx": "export default () => <p>v2</p>" };
  for (const [f, c] of Object.entries(code)) writeFileSync(join(dir, "artifacts", f), c);
  writeFileSync(join(dir, "index.json"), JSON.stringify({ schema: "artifact-index/v1", artifacts: rows }));
  return dir;
}

test("plan: apps only by default, everything with all; kinds and sources mapped", async () => {
  const dir = fixture();
  const p = plan(dir); assert.equal(p.total, 6); assert.equal(p.chosen.length, 5);
  assert.equal(plan(dir, { all: true }).chosen.length, 6);
  const by = Object.fromEntries(p.chosen.map((x) => [x.source.originId, x]));
  assert.equal(by["/home/App.tsx"].kind, "react", "a .tsx file with a MIME kind imports as react");
  assert.deepEqual(by.pub1.source, { type: "published", originId: "pub1" });
  assert.equal(by.pub1.description, "tree view");
  assert.deepEqual(by.hub.source, { type: "chat", chatUrl: "https://claude.ai/chat/c1", chatTitle: "Chat", originId: "hub" });
  assert.match(by.broken.description, /may be incomplete: update 3/);
});

test("ids are stable, valid, and distinct for the same id in different chats", async () => {
  const a = stableId(rec({ artifact_id: "x" })), b = stableId(rec({ artifact_id: "x" })), c = stableId(rec({ artifact_id: "x", conversation_uuid: "c2" }));
  assert.equal(a, b); assert.notEqual(a, c); assert.match(a, /^[A-Za-z0-9._-]{1,80}$/);
  assert.equal(kindOfRecord(rec({ kind: "unknown", file: "x.svg" })), "svg");
});

test("import: counts match the index, failed checks are kept and marked, a second run changes nothing", async () => {
  const dir = fixture(); const call = server(); const p = plan(dir);
  const r1 = await runImport(p.chosen, call);
  assert.deepEqual(r1, { created: 5, updated: 0, unchanged: 0, checksFailed: 1, rejected: [] });
  assert.equal((await call("artifact_list", {})).structuredContent.total, 5);
  const r2 = await runImport(p.chosen, call);
  assert.deepEqual(r2, { created: 0, updated: 0, unchanged: 5, checksFailed: 1, rejected: [] });
  assert.equal((await call("artifact_list", {})).structuredContent.total, 5);
});
