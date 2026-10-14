// Regression tests for the recovered Maxey0 MCP server (src/ recovered byte-exact from the deployed bundle's source map).
// The original 47-test suite was not deployed and is not in this repository.
import { test } from "node:test"; import assert from "node:assert/strict";
import { handleRequest, KVStore, MemoryKV } from "../build/node.mjs";
const KEY = "test-key-0123456789abcdef";
const mk = () => { const store = new KVStore(new MemoryKV()); let id = 0;
  const raw = (path, init) => handleRequest(new Request("https://x.test" + path, init), store, { workspaceKey: KEY });
  const rpc = async (method, params = {}) => { const r = await raw(`/mcp/${KEY}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) }); assert.equal(r.status, 200); return (await r.json()); };
  const call = async (name, args = {}) => (await rpc("tools/call", { name, arguments: args })).result;
  return { raw, rpc, call }; };

test("initialize negotiates a supported version and advertises the MCP Apps extension", async () => {
  const { rpc } = mk();
  const r = (await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } })).result;
  assert.equal(r.protocolVersion, "2025-06-18"); assert.equal(r.serverInfo.name, "maxey0");
  assert.ok(r.capabilities.extensions["io.modelcontextprotocol/ui"]);
  const r2 = (await rpc("initialize", { protocolVersion: "1999-01-01" })).result; assert.equal(r2.protocolVersion, "2025-06-18");
});
test("auth: wrong key 404, missing key config 500, GET 405, no OAuth endpoints", async () => {
  const { raw } = mk();
  assert.equal((await raw("/mcp/wrong-key", { method: "POST", body: "{}" })).status, 404);
  assert.equal((await raw(`/mcp/${KEY}`, { method: "GET" })).status, 405);
  for (const p of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-authorization-server", "/register"]) assert.equal((await raw(p, { method: "GET" })).status, 404);
  const r = await handleRequest(new Request("https://x.test/mcp/abc", { method: "POST", body: "{}" }), new KVStore(new MemoryKV()), { workspaceKey: "" });
  assert.equal(r.status, 500);
});
test("tools/list: dashboard tool links a ui:// resource; ui_action is app-only", async () => {
  const { rpc } = mk(); const tools = (await rpc("tools/list")).result.tools; const by = Object.fromEntries(tools.map((t) => [t.name, t]));
  for (const n of ["maxey0_open_dashboard", "maxey0_get_workspace", "maxey0_get_plan", "scw_read_file", "scw_create", "scw_add_file", "maxey0_record_run", "maxey0_ui_action"]) assert.ok(by[n], n);
  assert.match(by.maxey0_open_dashboard._meta.ui.resourceUri, /^ui:\/\//);
  assert.deepEqual(by.maxey0_ui_action._meta.ui.visibility, ["app"]);
  const res = (await rpc("resources/read", { uri: by.maxey0_open_dashboard._meta.ui.resourceUri })).result.contents[0];
  assert.equal(res.mimeType, "text/html;profile=mcp-app"); assert.ok(res.text.length > 100000);
});
test("scope: an agent outside an SCW is refused with isolation_violation; a bound agent succeeds", async () => {
  const { call } = mk();
  await call("scw_create", { name: "Maker", description: "m" }); await call("scw_create", { name: "Checker", description: "c" });
  const ws = (await call("maxey0_get_workspace")).structuredContent.workspace; const [maker, checker] = ws.scws;
  await call("maxey0_ui_action", { action: "agent.upsert", payload: { name: "Maxey1", scwIds: [maker.id] } });
  const ok = await call("scw_add_file", { scwId: "Maker", name: "draft.md", content: "hello", asAgent: "Maxey1" });
  assert.ok(!ok.isError, JSON.stringify(ok));
  const denied = await call("scw_add_file", { scwId: "Checker", name: "x.md", content: "leak", asAgent: "Maxey1" });
  assert.equal(denied.isError, true); assert.match(denied.content[0].text, /^isolation_violation/);
  const after = (await call("maxey0_get_workspace")).structuredContent.workspace;
  assert.equal(after.scws.find((s) => s.id === checker.id).files.length, 0);
  assert.ok((after.events || []).some((e) => e.kind === "denied"));
});
test("unknown tool and unknown method fail explicitly", async () => {
  const { rpc, call } = mk();
  assert.equal((await call("nope")).isError, true);
  assert.equal((await rpc("nope/method")).error.code, -32601);
});
