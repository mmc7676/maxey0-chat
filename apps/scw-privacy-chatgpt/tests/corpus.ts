import { evaluateTurn, PRESETS, CORPUS, privacyScore } from "./target";
for (const k of ["strict", "balanced", "minimal"] as const) {
  const p = PRESETS[k].build(); const oc: Record<string, number> = {}; let rel = 0, wh = 0, whMsg = 0, breaches = 0;
  for (const g of p.scwGates) for (const c of CORPUS) { const r = evaluateTurn(p, g, c.text); oc[r.outcome] = (oc[r.outcome] ?? 0) + 1; rel += r.released.length; wh += r.withheld.length; whMsg += r.withheld.filter((w) => w.rule !== "INV-4").length; }
  const withInterests = { ...p, interests: ["rust", "trail running", "therapy", "sam@example.com rust"] };
  for (const g of p.scwGates) for (const c of CORPUS) { const r = evaluateTurn(withInterests, g, c.text); if (r.released.some((x) => /@|therapy/.test(x.label)) || (r.cls.sensitive && r.released.length)) breaches++; }
  console.log(k, privacyScore(p), JSON.stringify(oc), "released", rel, "withheld", wh, "msgWithheld", whMsg, "breaches", breaches);
}
