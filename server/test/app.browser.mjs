// Browser run of the Maxey0 app view (builder + artifact tiles). A test page plays Claude's role as the
// MCP Apps host: it frames the view under the MCP Apps spec CSP, answers ui/initialize, forwards tools/call
// to the real server code, delivers the tool result, and records ui/message, ui/open-link and display-mode
// requests. Chromium then places, runs, expands, collapses and full-screens real tiles.
// Run: CDN_CACHE=<dir with npm/<pkg>@<ver>/...> PLAYWRIGHT=<path to playwright> node test/app.browser.mjs
import http from "node:http"; import { readFileSync, existsSync } from "node:fs"; import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { handleRequest, KVStore, MemoryKV } from "../build/node.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const CDN = process.env.CDN_CACHE; if (!CDN) throw new Error("set CDN_CACHE");
const KEY = "app-browser-key-0123456789";
const store = new KVStore(new MemoryKV());
let rid = 0, port = 0;
const serve = (path, init) => handleRequest(new Request(`http://127.0.0.1:${port}${path}`, init), store, { workspaceKey: KEY });
const rpc = async (method, params) => (await (await serve(`/mcp/${KEY}`, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: ++rid, method, params }) })).json()).result;
const call = (name, args) => rpc("tools/call", { name, arguments: args });

const fixtures = [
  { id: "counter", title: "Counter app", kind: "react", code: "import React, { useState } from 'react';\nexport default function App(){ const [n,setN]=useState(0); return <button id='inc' onClick={()=>setN(n+1)}>count {n}</button> }" },
  { id: "page", title: "Plain HTML page", kind: "html", code: "<h1 id='h'>Hello tiles</h1>" },
  { id: "flow", title: "Mermaid flow", kind: "mermaid", code: "graph TD; A-->B" },
  { id: "chart", title: "Recharts chart", kind: "react", code: "import React from 'react';\nimport { LineChart, Line, XAxis } from 'recharts';\nconst d=[{x:1,y:2},{x:2,y:5}];\nexport default function App(){ return <LineChart width={240} height={140} data={d}><XAxis dataKey='x'/><Line dataKey='y'/></LineChart> }" },
  { id: "extra", title: "Fifth artifact", kind: "html", code: "<p>five</p>" },
];
const WORKFLOW = "Launch SCW 5 in scw0\nIn scw5: research tiles /deep-research. Save to SCW5.";

const server = http.createServer(async (req, res) => {
  if (req.url === "/host.html") return res.writeHead(200, { "content-type": "text/html" }).end(hostHtml);
  if (req.url === "/app.html") return res.writeHead(200, { "content-type": "text/html", "content-security-policy": appCsp }).end(appHtml);
  if (req.url === "/rpc") { let b = ""; for await (const c of req) b += c; const p = JSON.parse(b); return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(await call(p.name, p.arguments))); }
  if (req.url.startsWith("/a/")) { const r = await serve(req.url, { method: "GET" }); return res.writeHead(r.status, Object.fromEntries(r.headers)).end(await r.text()); }
  res.writeHead(404).end();
}).listen(0);
port = server.address().port;

for (const f of fixtures) await call("artifact_upsert", f);
const appRes = (await rpc("resources/read", { uri: "ui://maxey0/app.html" })).contents[0];
const appHtml = appRes.text;
const R = appRes._meta.ui.csp.resourceDomains.join(" ");
const appCsp = `default-src 'none'; script-src 'self' 'unsafe-inline' ${R}; style-src 'self' 'unsafe-inline' ${R}; img-src 'self' data: blob: ${R}; font-src 'self' data: ${R}; media-src 'self' data: blob: ${R}; connect-src 'none'; frame-src 'none'; base-uri 'self'`;
// The tool call Claude would make for "/maxey0" with a workflow and one artifact in the first tile.
const openResult = await call("maxey0_open_app", { state: { input: WORKFLOW }, slots: ["page"] });

const hostHtml = `<!doctype html><html><body style="margin:0"><iframe id="app" src="/app.html" style="width:1200px;height:2600px;border:0"></iframe>
<script>
window.__log=[];window.__msgs=[];window.__links=[];window.__modes=[];const app=document.getElementById("app");const RESULT=${JSON.stringify(openResult)};
window.addEventListener("message",async(e)=>{if(e.source!==app.contentWindow)return;const m=e.data;if(!m||m.jsonrpc!=="2.0")return;window.__log.push(m.method||"response");
 const reply=(result)=>app.contentWindow.postMessage({jsonrpc:"2.0",id:m.id,result},"*");
 if(m.method==="ui/initialize")return reply({protocolVersion:"2026-01-26",hostCapabilities:{openLinks:{},message:{text:{}}},hostInfo:{name:"test-host",version:"1"},hostContext:{displayMode:"inline",availableDisplayModes:["inline","fullscreen"]}});
 if(m.method==="ui/notifications/initialized")return app.contentWindow.postMessage({jsonrpc:"2.0",method:"ui/notifications/tool-result",params:RESULT},"*");
 if(m.method==="ui/request-display-mode"){window.__modes.push(m.params.mode);return reply({mode:m.params.mode})}
 if(m.method==="ui/message"){window.__msgs.push(m.params.content[0].text);return reply({})}
 if(m.method==="ui/open-link"){window.__links.push(m.params.url);return reply({})}
 if(m.method==="tools/call"){const r=await fetch("/rpc",{method:"POST",body:JSON.stringify(m.params)});return reply(await r.json())}
});
</script></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const missing = [];
await page.route(/^https:\/\/cdn\.jsdelivr\.net\/npm\//, async (route) => {
  const rel = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
  const file = `${CDN}/${rel}`;
  if (!existsSync(file)) { missing.push(rel); return route.fulfill({ status: 404, body: "" }); }
  return route.fulfill({ status: 200, contentType: "application/javascript", body: readFileSync(file) });
});
await page.route(/^https:\/\/cdn\.tailwindcss\.com\//, (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
const errors = []; page.on("pageerror", (e) => errors.push(e.message));

const results = [];
const step = async (name, fn) => { try { await fn(); results.push(["ok", name]); } catch (e) { results.push(["FAIL", name, e.message.split("\n")[0]]); } };
await page.goto(`http://127.0.0.1:${port}/host.html`);
const app = page.frameLocator("#app");
const slot = (i) => app.locator(`article.tslot[data-slot="${i}"]`);
const chip = (i) => slot(i).locator(".chip").first();
const frame = (i) => app.frameLocator(`article.tslot[data-slot="${i}"] iframe`);
const savedSlots = async () => (await call("maxey0_open_app", {})).structuredContent.slots.map((a) => a.id);
const rendered = (i) => app.locator(`article.tslot[data-slot="${i}"] .chip.st-rendered`).waitFor({ timeout: 30000 });

await step("opens with the builder drawn from the workflow and the saved tile running", async () => {
  await app.locator("#m0 #viz").waitFor({ timeout: 15000 });
  assert.match(await app.locator("#m0 #err").textContent(), /Drew \d+ worlds and \d+ steps\./);
  assert.equal(await app.locator("#m0 #txt").inputValue(), WORKFLOW);
  await rendered(0);
  assert.equal(await frame(0).locator("#h").textContent(), "Hello tiles");
  assert.match(await app.locator("#arts-toggle").textContent(), /Artifacts · 1 of 4/);
  assert.equal(await app.locator("article.tslot").count(), 4, "exactly 4 tiles");
});
await step("import tray lists the artifacts; tap an artifact then tap a tile places it", async () => {
  assert.equal(await app.locator("#tray .chip.art").count(), 5);
  await app.locator('#tray .chip.art[data-id="counter"]').click();
  await slot(1).locator("button.drop").click();
  await rendered(1);
  await frame(1).locator("#inc").click(); await frame(1).locator("#inc").click();
  assert.equal(await frame(1).locator("#inc").textContent(), "count 2");
});
await step("drag an artifact from the tray onto a tile places it", async () => {
  await app.locator('#tray .chip.art[data-id="flow"]').dragTo(slot(2));
  await rendered(2);
  assert.ok(await frame(2).locator("svg").count() >= 1, "diagram drawn");
});
await step("four tiles at most: the fourth fills the grid and a fifth can only replace one", async () => {
  await app.locator('#tray .chip.art[data-id="chart"]').click();
  await slot(3).locator("button.drop").click();
  await rendered(3);
  assert.match(await app.locator("#arts-toggle").textContent(), /4 of 4/);
  assert.equal(await app.locator("button.drop").count(), 0, "no empty tile left");
  await app.locator('#tray .chip.art[data-id="extra"]').click();
  assert.equal(await app.locator("button", { hasText: "Replace with selected" }).count(), 4);
  await app.locator('#tray .chip.art[data-id="extra"]').click(); // deselect
  assert.deepEqual(await savedSlots(), ["page", "counter", "flow", "chart"], "tiles saved in order");
  assert.equal(await frame(1).locator("#inc").textContent(), "count 2", "placing more tiles did not restart a running one");
});
await step("collapsing the Artifacts section hides it without restarting tiles", async () => {
  await app.locator("#arts-toggle").click();
  assert.equal(await app.locator("#arts-body").isVisible(), false);
  await app.locator("#arts-toggle").click();
  assert.equal(await frame(1).locator("#inc").textContent(), "count 2");
});
await step("expand widens one tile without restarting it", async () => {
  await slot(1).getByRole("button", { name: "Expand" }).click();
  assert.match(await slot(1).getAttribute("class"), /\bwide\b/);
  assert.equal(await frame(1).locator("#inc").textContent(), "count 2");
  await slot(1).getByRole("button", { name: "Shrink" }).click();
});
await step("full screen asks Claude for fullscreen and shows only that tile; exit restores it", async () => {
  await slot(1).getByRole("button", { name: "Full screen" }).click();
  assert.equal(await slot(1).isVisible(), true); assert.equal(await slot(0).isVisible(), false); assert.equal(await app.locator("#m0").isVisible(), false);
  const box = await slot(1).boundingBox(); assert.ok(box.width > 1000, "tile fills the view");
  await slot(1).getByRole("button", { name: "Exit full screen" }).click();
  await page.waitForFunction(() => window.__modes.length >= 2, null, { timeout: 5000 }).catch(() => {});
  assert.deepEqual(await page.evaluate(() => window.__modes), ["fullscreen", "inline"]);
  assert.equal(await slot(0).isVisible(), true);
  assert.equal(await frame(1).locator("#inc").textContent(), "count 2", "full screen did not restart the tile");
});
await step("open outside makes a link Claude opens in the browser; the page runs the artifact alone", async () => {
  await slot(0).getByRole("button", { name: "Open outside ↗" }).click();
  await page.waitForFunction(() => window.__links.length === 1);
  const url = await page.evaluate(() => window.__links[0]);
  assert.match(new URL(url).pathname, /^\/a\/[0-9a-f]{32}$/);
  const p2 = await browser.newPage();
  const resp = await p2.goto(url);
  assert.equal(resp.status(), 200);
  assert.equal(await p2.locator("#h").textContent(), "Hello tiles");
  await p2.close();
});
await step("Run sends the workflow to the chat as the user's message", async () => {
  await app.locator("#m0 #run").click();
  await page.waitForFunction(() => window.__msgs.length === 1);
  const m = await page.evaluate(() => window.__msgs[0]);
  assert.match(m, /^Maxey0: run \{/); assert.ok(JSON.parse(m.slice("Maxey0: run ".length)).steps.length >= 1);
});
await step("remove empties a tile and saves the change", async () => {
  await slot(2).getByRole("button", { name: "Remove" }).click();
  assert.equal(await slot(2).locator("iframe").count(), 0);
  await page.waitForTimeout(300);
  assert.deepEqual(await savedSlots(), ["page", "counter", "chart"]);
  assert.equal(await frame(1).locator("#inc").textContent(), "count 2");
});
await step("render results are recorded on the server", async () => {
  const arts = Object.fromEntries((await call("artifact_list", {})).structuredContent.artifacts.map((a) => [a.id, a]));
  for (const id of ["page", "counter", "flow", "chart"]) assert.equal(arts[id].render?.ok, true, id);
});
await page.screenshot({ path: process.env.SHOT || "maxey0-app.png", fullPage: false });

await browser.close(); server.close();
for (const r of results) console.log(r.join("  "));
console.log(`CDN files missing: ${missing.length ? missing.join(", ") : "none"}`);
console.log(`app page errors: ${errors.length ? errors.join(" | ") : "none"}`);
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`${results.length - failed} of ${results.length} app browser checks passed`);
process.exit(failed || missing.length || errors.length ? 1 : 0);
