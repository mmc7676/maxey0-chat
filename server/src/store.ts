// Storage for Maxey0 workspaces. One workspace = one JSON document plus one record per file.
// Cloudflare: KVStore over a KV namespace. Local/tests: MemoryStore (optionally persisted to disk by the Node runner).
import type { ArtifactMeta } from "./artifacts";

export interface ScwFile { id: string; name: string; mime: string; size: number; encoding: "text" | "base64"; region: "reference" | "durable"; addedBy: "dashboard" | "upload-link" | "claude" | "agent"; addedAt: string }
export interface Scw { id: string; name: string; description: string; files: ScwFile[]; createdAt: string }
export interface Agent { id: string; name: string; role: string; instructions: string; scwIds: string[] }
export interface Loop { id: string; name: string; agentIds: string[]; maxIterations: number; until: string }
export interface Gate { id: string; scwId: string; rule: string; mode: "allow" | "deny" | "ask" }
export interface Plan { id: string; goal: string; scwIds: string[]; agentIds: string[]; loopIds: string[]; gateIds: string[]; status: "submitted" | "running" | "done" | "failed"; createdAt: string; runLog: { at: string; status: string; summary: string }[] }
export interface ScwEvent { at: string; kind: "read" | "write" | "denied"; agent: string | null; scw: string; detail: string }
export interface Workspace { id: string; scws: Scw[]; agents: Agent[]; loops: Loop[]; gates: Gate[]; plans: Plan[]; events?: ScwEvent[]; artifacts?: ArtifactMeta[]; updatedAt: string }

export interface Store {
  getWorkspace(ws: string): Promise<Workspace>;
  putWorkspace(w: Workspace): Promise<void>;
  getFile(ws: string, fileId: string): Promise<string | null>;
  putFile(ws: string, fileId: string, data: string): Promise<void>;
  deleteFile(ws: string, fileId: string): Promise<void>;
  putTicket(ticket: string, value: { ws: string; scwId: string }, ttlSeconds: number): Promise<void>;
  getTicket(ticket: string): Promise<{ ws: string; scwId: string } | null>;
}

export const emptyWorkspace = (id: string): Workspace => ({ id, scws: [], agents: [], loops: [], gates: [], plans: [], events: [], updatedAt: new Date().toISOString() });

/** Minimal KV interface (matches Cloudflare's KVNamespace). */
export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export class KVStore implements Store {
  constructor(private kv: KVLike) {}
  async getWorkspace(ws: string) { const v = await this.kv.get(`ws:${ws}`); return v ? (JSON.parse(v) as Workspace) : emptyWorkspace(ws); }
  async putWorkspace(w: Workspace) { w.updatedAt = new Date().toISOString(); await this.kv.put(`ws:${w.id}`, JSON.stringify(w)); }
  getFile(ws: string, id: string) { return this.kv.get(`file:${ws}:${id}`); }
  putFile(ws: string, id: string, data: string) { return this.kv.put(`file:${ws}:${id}`, data); }
  deleteFile(ws: string, id: string) { return this.kv.delete(`file:${ws}:${id}`); }
  putTicket(t: string, v: { ws: string; scwId: string }, ttl: number) { return this.kv.put(`ticket:${t}`, JSON.stringify(v), { expirationTtl: Math.max(60, ttl) }); }
  async getTicket(t: string) { const v = await this.kv.get(`ticket:${t}`); return v ? JSON.parse(v) : null; }
}

/** In-memory KV with TTL, used by tests and the local Node runner. */
export class MemoryKV implements KVLike {
  data = new Map<string, { v: string; exp?: number }>();
  async get(k: string) { const e = this.data.get(k); if (!e) return null; if (e.exp && Date.now() > e.exp) { this.data.delete(k); return null; } return e.v; }
  async put(k: string, v: string, o?: { expirationTtl?: number }) { this.data.set(k, { v, exp: o?.expirationTtl ? Date.now() + o.expirationTtl * 1000 : undefined }); }
  async delete(k: string) { this.data.delete(k); }
}
