// Real-export audit for Maxey0 SCWs for ChatGPT Ads, version 3.1. Prints aggregate counts only.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { classifyText, evaluateTurn, PRESETS, privacyScore } from "./app";
const dir = process.argv[2];
const files = readdirSync(dir).filter((n) => /^conversations(-\d+)?\.json$/i.test(n)).sort();
const t0 = Date.now();
const chats: string[] = [];
let userMessages = 0;
for (const f of files) for (const c of JSON.parse(readFileSync(join(dir, f), "utf8")) as any[]) {
  let text = "";
  for (const node of Object.values(c.mapping ?? {}) as any[]) {
    const m = node?.message; if (!m || m.author?.role !== "user") continue;
    const ps = (m.content?.parts ?? []).filter((x: unknown) => typeof x === "string" && x.trim());
    if (ps.length) { userMessages++; if (text.length < 200000) text += "\n" + ps.join("\n"); }
  }
  chats.push(text.slice(0, 200000));
}
const nonEmpty = chats.filter((t) => t.trim());
const sens: Record<string, number> = {}, pers: Record<string, number> = {};
let withLabel = 0;
nonEmpty.forEach((t) => { const c = classifyText(t); if (c.labels.length) withLabel++; if (c.sensitive) sens[c.sensitive] = (sens[c.sensitive] ?? 0) + 1; new Set(c.personal.map((p) => p.label)).forEach((l) => (pers[l] = (pers[l] ?? 0) + 1)); });
const out: any = { files: files.length, chats: chats.length, nonEmpty: nonEmpty.length, userMessages, classifyMs: Date.now() - t0, chatsWithCategoryLabel: withLabel, sensitive: sens, sensitiveTotal: Object.values(sens).reduce((a, b) => a + b, 0), personalByLabel: pers };
const SYNTH = ["rust", "trail running", "therapy", "sam@example.com rust"];
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const has = (text: string, term: string) => term.includes(" ") ? text.toLowerCase().includes(term) : new RegExp(`(^|[^a-z0-9])${esc(term)}([^a-z0-9]|$)`).test(text.toLowerCase());
for (const k of ["strict", "balanced", "minimal"] as const) for (const withInterests of [false, true]) {
  const p = { ...PRESETS[k].build(), interests: withInterests ? SYNTH : [] };
  out[`${k}${withInterests ? "+interests" : ""}`] = { score: privacyScore(p), gates: p.scwGates.map((g) => {
    const o: Record<string, number> = {}; let released = 0, fromSemantic = 0, breaches = 0;
    nonEmpty.forEach((t) => {
      const r = evaluateTurn(p, g, t); o[r.outcome] = (o[r.outcome] ?? 0) + 1; released += r.released.length; fromSemantic += r.released.filter((x) => x.tier === "Semantic").length;
      const bad = r.released.some((x) => (x.tier as string) === "Persistent" || (x.tier as string) === "Procedural" || x.label === "therapy" || /@|\d{3}[\s.-]\d{4}/.test(x.label) || classifyText(x.label).personal.length > 0 || classifyText(x.label).sensitive || g.blockedTopics.some((b) => has(x.label, b))) || (r.cls.sensitive && r.released.length > 0);
      if (bad) breaches++;
    });
    return { name: g.name, mode: g.gateType, outcomes: o, released, fromSemantic, breaches };
  }) };
}
out.totalMs = Date.now() - t0;
console.log(JSON.stringify(out, null, 1));
