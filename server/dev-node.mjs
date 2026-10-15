// Local Node host for the Maxey0 MCP server (tests / Claude Code smoke). Not used in production.
import http from "node:http";
import { handleRequest, KVStore, MemoryKV } from "./build/node.mjs";
const store = new KVStore(new MemoryKV());
const key = process.env.WORKSPACE_KEY || "local-test-key-0123456789";
const port = Number(process.env.PORT || 8787);
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const r = await handleRequest(new Request(`http://127.0.0.1:${port}${req.url}`, { method: req.method, headers: req.headers, body: ["GET","HEAD"].includes(req.method) ? undefined : body }), store, { workspaceKey: key });
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(port, "127.0.0.1", () => console.log("listening", port));
