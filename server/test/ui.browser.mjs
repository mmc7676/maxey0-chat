// Browser run of the artifacts board (step 2). A test page plays Claude's role as the MCP Apps host:
// it frames the board, answers ui/initialize, and forwards the board's tools/call requests to the
// real server code. Chromium then opens real tiles.
// Run: CDN_CACHE=<dir with npm/<pkg>@<ver>/...> PLAYWRIGHT=<path to playwright> [HOST_CSP=none] node test/ui.browser.mjs
// CDN requests are answered from CDN_CACHE, which holds the same npm package files jsDelivr serves.
// cdn.tailwindcss.com is answered with an empty script, so Tailwind styling is not covered here.
import http from "node:http"; import { readFileSync, existsSync } from "node:fs"; import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { handleRequest, KVStore, MemoryKV } from "../build/node.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const CDN = process.env.CDN_CACHE; if (!CDN) throw new Error("set CDN_CACHE");
const KEY = "browser-test-key-0123456789";
const store = new KVStore(new MemoryKV());
let rid = 0;
const rpc = async (method, params) => (await (await handleRequest(new Request(`http://t/mcp/${KEY}`, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: ++rid, method, params }) }), store, { workspaceKey: KEY })).json()).result;
const call = (name, args) => rpc("tools/call", { name, arguments: args });

// ---- fixtures: one per outcome the board must show
const fixtures = [
  { id: "counter", title: "Counter app", kind: "react", code: "import React, { useState } from 'react';\nimport { Activity } from 'lucide-react';\nexport default function App(){ const [n,setN]=useState(0); return <div><Activity size={16}/><button id='inc' onClick={()=>setN(n+1)}>count {n}</button></div> }" },
  { id: "chart", title: "Recharts chart", kind: "react", code: "import React from 'react';\nimport { LineChart, Line, XAxis } from 'recharts';\nconst d=[{x:1,y:2},{x:2,y:5},{x:3,y:3}];\nexport default function App(){ return <LineChart width={260} height={160} data={d}><XAxis dataKey='x'/><Line dataKey='y'/></LineChart> }" },
  { id: "page", title: "Plain HTML page", kind: "html", code: "<!doctype html><html><head><title>p</title></head><body><h1 id='h'>Hello tiles</h1></body></html>" },
  { id: "crash", title: "Crashes on render", kind: "react", code: "import React from 'react';\nexport default function App(){ throw new Error('boom from artifact'); }" },
  { id: "badimport", title: "Uses framer-motion", kind: "react", code: "import { motion } from 'framer-motion';\nexport default function App(){ return null }" },
  { id: "flow", title: "Mermaid flow", kind: "mermaid", code: "graph TD; A-->B" },
];
for (const f of fixtures) await call("artifact_upsert", f);
const boardRes = (await rpc("resources/read", { uri: "ui://maxey0/artifacts.html" })).contents[0];
const boardHtml = boardRes.text;
// By default the board is served with the CSP the MCP Apps spec tells hosts to build from the resource's _meta.ui.csp
// (omitted fields are the spec's secure defaults: connect-src 'none', frame-src 'none'). Claude's exact
// policy is not published; this is the spec's, so a pass here is necessary, not sufficient.
const specCsp = (csp = {}) => { const r = (csp.resourceDomains || []).join(" "), f = (csp.frameDomains || []).join(" ") || "'none'", c = (csp.connectDomains || []).join(" ") || "'none'";
  return `default-src 'none'; script-src 'self' 'unsafe-inline' ${r}; style-src 'self' 'unsafe-inline' ${r}; img-src 'self' data: blob: ${r}; font-src 'self' data: ${r}; media-src 'self' data: blob: ${r}; connect-src ${c}; frame-src ${f}; base-uri 'self'`; };
const HOST_CSP = process.env.HOST_CSP === "none" ? "" : specCsp(boardRes._meta?.ui?.csp);
if (HOST_CSP) console.log("host CSP: " + HOST_CSP);

// ---- host page: the MCP Apps host side, minimal and faithful to the spec's message shapes
const hostHtml = `<!doctype html><html><body style="margin:0"><iframe id="app" src="/board.html" style="width:1200px;height:2400px;border:0"></iframe>
<script>
window.__log=[];const app=document.getElementById("app");
window.addEventListener("message",async(e)=>{if(e.source!==app.contentWindow)return;const m=e.data;if(!m||m.jsonrpc!=="2.0")return;window.__log.push(m.method||"response");
 const reply=(result)=>app.contentWindow.postMessage({jsonrpc:"2.0",id:m.id,result},"*");
 // A strict host: MCP Apps 2026-01-26 requires exactly {appInfo, appCapabilities, protocolVersion}.
 if(m.method==="ui/initialize"){const k=Object.keys(m.params||{}).sort().join();if(k!=="appCapabilities,appInfo,protocolVersion"||!(m.params.appInfo&&m.params.appInfo.name&&m.params.appInfo.version)){window.__badInit=k;return app.contentWindow.postMessage({jsonrpc:"2.0",id:m.id,error:{code:-32602,message:"invalid ui/initialize params: "+k}},"*")}}
 if(m.method==="ui/initialize")return reply({protocolVersion:"2026-01-26",hostCapabilities:{},hostInfo:{name:"test-host",version:"1"},hostContext:{displayMode:"inline",availableDisplayModes:["inline","fullscreen"]}});
 if(m.method==="ui/request-display-mode")return reply({mode:m.params.mode});
 if(m.method==="tools/call"){const r=await fetch("/rpc",{method:"POST",body:JSON.stringify(m.params)});return reply(await r.json())}
});
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  if (req.url === "/host.html") return res.writeHead(200, { "content-type": "text/html" }).end(hostHtml);
  if (req.url === "/board.html") return res.writeHead(200, { "content-type": "text/html", ...(HOST_CSP ? { "content-security-policy": HOST_CSP } : {}) }).end(boardHtml);
  if (req.url === "/rpc") { let b = ""; for await (const c of req) b += c; const p = JSON.parse(b); return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(await call(p.name, p.arguments))); }
  res.writeHead(404).end();
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const served = new Set(), missing = [];
await page.route(/^https:\/\/cdn\.jsdelivr\.net\/npm\//, async (route) => {
  const rel = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
  const file = `${CDN}/${rel}`;
  if (!existsSync(file)) { missing.push(rel); return route.fulfill({ status: 404, body: "" }); }
  served.add(rel); return route.fulfill({ status: 200, contentType: "application/javascript", body: readFileSync(file) });
});
await page.route(/^https:\/\/cdn\.tailwindcss\.com\//, (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
const errors = []; page.on("pageerror", (e) => errors.push(e.message));

const results = [];
const step = async (name, fn) => { try { await fn(); results.push(["ok", name]); } catch (e) { results.push(["FAIL", name, e.message.split("\n")[0]]); } };
await page.goto(`http://127.0.0.1:${port}/host.html`);
const board = page.frameLocator("#app");
const tile = (id) => board.locator(`article[data-id="${id}"]`);
const chip = (id) => tile(id).locator(".chip").first();

await step("handshake: ui/initialize then initialized, and the list loads by tools/call", async () => {
  await tile("counter").waitFor({ timeout: 15000 });
  const log = await page.evaluate(() => window.__log);
  assert.equal(await page.evaluate(() => window.__badInit ?? null), null, "ui/initialize matches the spec"); assert.equal(log[0], "ui/initialize"); assert.ok(log.includes("ui/notifications/initialized")); assert.ok(log.includes("tools/call"));
  assert.equal(await board.locator("article.tile").count(), fixtures.length);
  assert.match(await board.locator("#count").textContent(), /6 shown of 6/);
});
await step("logo is shown", async () => { assert.match(await board.locator("header img").getAttribute("src"), /^data:image\/webp;base64,/); });
await step("failed checks are shown before running, with the reason", async () => {
  assert.equal(await chip("badimport").textContent(), "checks failed");
  assert.match(await tile("badimport").locator(".fails").textContent(), /framer-motion/);
  assert.equal(await tile("badimport").locator("button.primary").textContent(), "Open anyway");
});
await step("React tile: compiles, runs, and is interactive", async () => {
  await tile("counter").locator("button.primary").click();
  await board.locator('article[data-id="counter"] .chip.st-rendered').waitFor({ timeout: 30000 });
  const f = board.frameLocator('article[data-id="counter"] iframe');
  await f.locator("#inc").click(); await f.locator("#inc").click();
  assert.equal(await f.locator("#inc").textContent(), "count 2");
  assert.ok(await f.locator("svg").count() >= 1, "lucide icon drawn");
});
await step("several tiles run at once, and opening more does not restart a running one", async () => {
  await tile("chart").locator("button.primary").click();
  await tile("page").locator("button.primary").click();
  await tile("flow").locator("button.primary").click();
  for (const id of ["chart", "page", "flow"]) await board.locator(`article[data-id="${id}"] .chip.st-rendered`).waitFor({ timeout: 30000 });
  assert.equal(await board.frameLocator('article[data-id="counter"] iframe').locator("#inc").textContent(), "count 2", "counter kept its state");
  assert.ok(await board.frameLocator('article[data-id="chart"] iframe').locator(".recharts-line").count() >= 1, "chart drawn");
  assert.equal(await board.frameLocator('article[data-id="page"] iframe').locator("#h").textContent(), "Hello tiles");
  assert.ok(await board.frameLocator('article[data-id="flow"] iframe').locator("svg").count() >= 1, "diagram drawn");
});
await step("a crashing artifact shows an error, and only in its own tile", async () => {
  await tile("crash").locator("button.primary").click();
  await board.locator('article[data-id="crash"] .chip.st-error').waitFor({ timeout: 30000 });
  assert.match(await tile("crash").locator(".err").textContent(), /boom from artifact/);
  assert.equal(await board.frameLocator('article[data-id="counter"] iframe').locator("#inc").textContent(), "count 2");
});
await step("expand widens a tile without restarting it", async () => {
  await tile("counter").getByRole("button", { name: "Expand" }).click();
  assert.match(await tile("counter").getAttribute("class"), /\bwide\b/);
  assert.equal(await board.frameLocator('article[data-id="counter"] iframe').locator("#inc").textContent(), "count 2");
});
await step("filters hide tiles without closing running ones", async () => {
  await board.locator("#kind").selectOption("html");
  assert.match(await board.locator("#count").textContent(), /1 shown of 6/);
  await board.locator("#kind").selectOption("");
  assert.equal(await board.frameLocator('article[data-id="counter"] iframe').locator("#inc").textContent(), "count 2");
});
await step("render results are recorded on the server", async () => {
  await page.waitForTimeout(500);
  const arts = Object.fromEntries((await call("artifact_list", {})).structuredContent.artifacts.map((a) => [a.id, a]));
  assert.equal(arts.counter.render?.ok, true); assert.equal(arts.chart.render?.ok, true); assert.equal(arts.page.render?.ok, true);
  assert.equal(arts.crash.render?.ok, false); assert.match(arts.crash.render.detail, /boom from artifact/);
  assert.equal(arts.badimport.render, null, "never opened, so nothing recorded");
});
await step("close stops a tile", async () => {
  await tile("chart").getByRole("button", { name: "Close" }).click();
  assert.equal(await tile("chart").locator("iframe").count(), 0);
  assert.equal(await chip("chart").textContent(), "ran ok", "closed tile shows its recorded result");
});
await page.screenshot({ path: process.env.SHOT || "artifacts-board.png", fullPage: false });

await browser.close(); server.close();
for (const r of results) console.log(r.join("  "));
console.log(`CDN files served from the npm cache: ${served.size}; missing: ${missing.length ? missing.join(", ") : "none"}`);
console.log(`board page errors: ${errors.length ? errors.join(" | ") : "none"}`);
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`${results.length - failed} of ${results.length} browser checks passed`);
process.exit(failed || missing.length ? 1 : 0);
