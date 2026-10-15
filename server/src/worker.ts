// Cloudflare Workers entry point.
import { handleRequest } from "./core";
import { KVStore, KVLike } from "./store";

export interface Env { MAXEY0_KV: KVLike; WORKSPACE_KEY: string }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, new KVStore(env.MAXEY0_KV), { workspaceKey: env.WORKSPACE_KEY });
  },
};
