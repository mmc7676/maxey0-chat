// Artifact objects (step 1), the mechanical checker fed broken artifacts (step 3), and tile documents.
import { test } from "node:test"; import assert from "node:assert/strict";
import { handleRequest, KVStore, MemoryKV, checkArtifact, importsOf, tileDocument, kindOf } from "../build/node.mjs";
const KEY = "test-key-0123456789abcdef";
const mk = () => { const store = new KVStore(new MemoryKV()); let id = 0;
  const rpc = async (method, params = {}) => { const r = await handleRequest(new Request(`https://x.test/mcp/${KEY}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) }), store, { workspaceKey: KEY }); assert.equal(r.status, 200); return r.json(); };
  const call = async (name, args = {}) => (await rpc("tools/call", { name, arguments: args })).result;
  return { rpc, call }; };
const APP = "import React, { useState } from 'react';\nimport { LineChart, Line } from 'recharts';\nexport default function App(){ const [n,setN]=useState(0); return <button onClick={()=>setN(n+1)}>{n}</button> }";

// ---------------------------------------------------------------- step 1: server objects and tools
test("tools: artifact tools listed; get and report are app-only; open links the artifacts UI", async () => {
  const { rpc } = mk(); const by = Object.fromEntries((await rpc("tools/list")).result.tools.map((t) => [t.name, t]));
  for (const n of ["maxey0_open_artifacts", "artifact_list", "artifact_upsert", "artifact_get", "artifact_report_render"]) assert.ok(by[n], n);
  assert.equal(by.maxey0_open_artifacts._meta.ui.resourceUri, "ui://maxey0/artifacts.html");
  assert.deepEqual(by.artifact_get._meta.ui.visibility, ["app"]);
  assert.deepEqual(by.artifact_report_render._meta.ui.visibility, ["app"]);
  assert.equal(by.artifact_list._meta, undefined); assert.equal(by.artifact_upsert._meta, undefined);
});

test("resources: artifacts UI is listed, declares its CSP, embeds the logo and speaks ui/initialize", async () => {
  const { rpc } = mk();
  assert.deepEqual((await rpc("resources/list")).result.resources.map((r) => r.uri), ["ui://maxey0/dashboard.html", "ui://maxey0/artifacts.html"]);
  const c = (await rpc("resources/read", { uri: "ui://maxey0/artifacts.html" })).result.contents[0];
  assert.equal(c.mimeType, "text/html;profile=mcp-app");
  assert.deepEqual(c._meta.ui.csp.resourceDomains, ["https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://unpkg.com", "https://cdn.tailwindcss.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com"]);
  assert.ok(c.text.includes("data:image/webp;base64,")); assert.ok(c.text.includes("ui/initialize")); assert.ok(c.text.includes("artifact_get"));
  const old = (await rpc("resources/read", { uri: "ui://maxey0/dashboard.html" })).result.contents[0];
  assert.equal(old._meta.ui.csp, undefined, "existing dashboard resource unchanged");
});

test("upsert: create, unchanged code keeps the version, new code adds one; list never returns code", async () => {
  const { call } = mk();
  const a = await call("artifact_upsert", { id: "hub", title: "Agent Hub", kind: "application/vnd.ant.react", code: APP, description: "agents", source: { type: "chat", chatUrl: "https://claude.ai/chat/abc", chatTitle: "Hub chat" } });
  assert.equal(a.isError, undefined); const m = a.structuredContent.artifact;
  assert.deepEqual([m.kind, m.version, m.status, m.source.type, m.source.chatTitle], ["react", 1, "checked", "chat", "Hub chat"]);
  assert.equal(m.sha256.length, 64);
  const same = await call("artifact_upsert", { id: "hub", title: "Agent Hub 2", kind: "react", code: APP });
  assert.equal(same.structuredContent.changed, false); assert.equal(same.structuredContent.artifact.version, 1); assert.equal(same.structuredContent.artifact.title, "Agent Hub 2");
  const v2 = await call("artifact_upsert", { id: "hub", title: "Agent Hub", kind: "react", code: APP + "\n// v2" });
  assert.equal(v2.structuredContent.artifact.version, 2);
  await call("artifact_upsert", { id: "wx", title: "Weather radar", kind: "html", code: "<h1>radar</h1>" });
  const l = await call("artifact_list", {});
  assert.equal(l.structuredContent.total, 2); assert.ok(!JSON.stringify(l).includes("useState"), "no code in list");
  assert.deepEqual((await call("artifact_list", { query: "radar" })).structuredContent.artifacts.map((x) => x.id), ["wx"]);
  assert.deepEqual((await call("artifact_list", { kind: "react" })).structuredContent.artifacts.map((x) => x.id), ["hub"]);
  assert.deepEqual((await call("maxey0_open_artifacts", { ids: ["wx", "hub", "nope"] })).structuredContent.artifacts.map((x) => x.id), ["wx", "hub"]);
  assert.match((await call("maxey0_get_workspace")).content[0].text, /Artifacts: 2 stored \(0 failing checks\)/);
});

test("get: long code comes back in chunks that reassemble exactly", async () => {
  const { call } = mk(); const code = "<p>" + "x".repeat(250000) + "</p>";
  await call("artifact_upsert", { id: "big", title: "Big", kind: "html", code });
  let got = "", off = 0, n = 0, r;
  do { r = (await call("artifact_get", { id: "big", offset: off })).structuredContent; got += r.code; off += r.code.length; n++; } while (!r.done);
  assert.equal(got, code); assert.equal(n, 3); assert.equal(r.total, code.length);
  assert.equal((await call("artifact_get", { id: "missing" })).isError, true);
});

test("render reports: recorded for the current version only", async () => {
  const { call } = mk(); await call("artifact_upsert", { id: "a1", title: "A", kind: "html", code: "<p>a</p>" });
  assert.match((await call("artifact_report_render", { id: "a1", version: 9, ok: false, detail: "x" })).content[0].text, /Ignored/);
  await call("artifact_report_render", { id: "a1", version: 1, ok: false, detail: "runtime error: boom" });
  const m = (await call("artifact_list", {})).structuredContent.artifacts[0];
  assert.deepEqual([m.render.ok, m.render.detail], [false, "runtime error: boom"]);
  await call("artifact_upsert", { id: "a1", title: "A", kind: "html", code: "<p>fixed</p>" });
  assert.equal((await call("artifact_list", {})).structuredContent.artifacts[0].render, null, "a new version clears the old render result");
});

test("validation: bad id, oversized code, and SCW scope enforced for agents", async () => {
  const { call } = mk();
  assert.match((await call("artifact_upsert", { id: "bad id!", title: "x", kind: "html", code: "<p/>" })).content[0].text, /Invalid artifact id/);
  assert.match((await call("artifact_upsert", { title: "x", kind: "text", code: "a".repeat(4 * 1024 * 1024 + 1) })).content[0].text, /too large/);
  await call("scw_create", { name: "Builds" }); await call("scw_create", { name: "Other" });
  const ws = (await call("maxey0_get_workspace")).structuredContent.workspace;
  await call("maxey0_ui_action", { action: "agent.upsert", payload: { name: "Maxey1", scwIds: [ws.scws[0].id] } });
  const denied = await call("artifact_upsert", { title: "x", kind: "html", code: "<p/>", scwId: "Other", asAgent: "Maxey1" });
  assert.equal(denied.isError, true); assert.match(denied.content[0].text, /isolation_violation/);
  const ok = await call("artifact_upsert", { title: "x", kind: "html", code: "<p/>", scwId: "Builds", asAgent: "Maxey1" });
  assert.equal(ok.structuredContent.artifact.scwId, ws.scws[0].id);
  assert.deepEqual((await call("artifact_list", { scwId: "Builds" })).structuredContent.artifacts.length, 1);
});

// ---------------------------------------------------------------- step 3: the checker, fed broken artifacts
const failing = (kind, code) => checkArtifact(kind, code).filter((c) => !c.ok).map((c) => c.name);

test("checker: broken React artifacts fail on the right check, with the reason named", async () => {
  assert.deepEqual(failing("react", APP), []);
  const shadcn = checkArtifact("react", "import { Button } from '@/components/ui/button';\nimport { motion } from 'framer-motion';\nexport default () => <Button/>");
  const imp = shadcn.find((c) => c.name === "imports_resolvable");
  assert.equal(imp.ok, false); assert.match(imp.detail, /@\/components\/ui\/button, framer-motion/);
  assert.deepEqual(failing("react", "import React from 'react'; function App(){return <p/>}"), ["default_export"]);
  assert.deepEqual(failing("react", "function A(){return <p/>}\nexport { A as default }"), []);
  assert.deepEqual(failing("react", "   \n"), ["not_empty", "default_export"]);
});

test("checker: HTML from blocked hosts, non-HTML and empty SVG fail; allowed CDNs pass", async () => {
  assert.deepEqual(failing("html", '<script src="https://evil.example/x.js"></script><p>hi</p>'), ["external_hosts_allowed"]);
  assert.deepEqual(failing("html", '<script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script><link href="https://cdn.tailwindcss.com/x.css"><p>hi</p>'), []);
  assert.deepEqual(failing("html", '<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet"><p>x</p>'), [], "Google Fonts allowed");
  assert.deepEqual(failing("html", "just words"), ["is_html"]);
  assert.deepEqual(failing("svg", "<g></g>"), ["is_svg"]);
  assert.deepEqual(failing("markdown", "# fine"), []);
});

test("store: a failing artifact is stored with status failed and the reasons", async () => {
  const { call } = mk();
  const r = await call("artifact_upsert", { id: "bad", title: "Bad", kind: "react", code: "import x from 'framer-motion'; export default x" });
  assert.equal(r.structuredContent.artifact.status, "failed"); assert.match(r.content[0].text, /1 check\(s\) failed: imports_resolvable/);
  assert.match((await call("maxey0_get_workspace")).content[0].text, /1 failing checks/);
});

test("importsOf: every import form, with no false positives from strings in code", async () => {
  const src = `import React from "react";\nimport { a, b as c } from 'recharts';\nimport * as d3 from "d3";\nimport "./side.css";\nimport type { T } from "three";\nexport { x } from "lodash";\nexport * from "papaparse";\nconst m = require("mathjs");\nconst l = await import("tone");\nconst s = "import fake from 'nope'";`;
  assert.deepEqual(importsOf(src).sort(), ["./side.css", "d3", "lodash", "mathjs", "papaparse", "react", "recharts", "three", "tone"].sort());
});

test("kindOf: MIME types, extensions and names", async () => {
  assert.deepEqual(["application/vnd.ant.react", "tsx", "text/html", "image/svg+xml", "mmd", "md", "application/vnd.ant.code", "weird"].map(kindOf), ["react", "react", "html", "svg", "mermaid", "markdown", "code", "text"]);
});

// ---------------------------------------------------------------- tile documents
test("tile document: React loads only the libraries it imports, and code cannot break out of its script", async () => {
  const doc = tileDocument("react", APP + "\n// </script><script>alert(1)</script>", "hub#1");
  assert.ok(doc.includes("recharts@2.12.7/umd/Recharts.js")); assert.ok(doc.includes("prop-types@15.8.1"));
  assert.ok(!doc.includes("d3@7.9.0")); assert.ok(doc.includes("@babel/standalone@7.24.0"));
  assert.equal(doc.split("</script><script>alert(1)").length, 1, "embedded code is escaped");
  assert.ok(doc.includes('"hub#1"'));
});

test("tile document: lucide-react gets the lowercase react global it needs, right after React loads", async () => {
  const doc = tileDocument("react", "import { Activity } from 'lucide-react';\nexport default () => null", "l#1");
  const iReact = doc.indexOf("react@18.3.1/umd/react.production.min.js"), iAlias = doc.indexOf("window.react=window.React"), iLucide = doc.indexOf("lucide-react@0.383.0");
  assert.ok(iReact > 0 && iReact < iAlias && iAlias < iLucide, "React, then alias, then lucide");
  assert.equal(tileDocument("react", APP, "x#1").includes("window.react="), false, "no alias when nothing needs it");
});

test("tile document: HTML with a head gets the reporter injected; text kinds are escaped", async () => {
  const doc = tileDocument("html", "<html><head><title>t</title></head><body>x</body></html>", "w#1");
  assert.ok(doc.indexOf("__tileReport") < doc.indexOf("<title>"));
  const txt = tileDocument("code", "<script>alert(1)</script>", "c#1");
  assert.ok(txt.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(tileDocument("mermaid", "graph TD; A-->B", "m#1").includes("mermaid@10.9.1"));
});
