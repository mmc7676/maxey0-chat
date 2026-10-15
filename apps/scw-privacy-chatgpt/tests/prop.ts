// Property test for Maxey0 SCWs for ChatGPT Ads, version 3.1. Imports the module under test from ./target.
import { evaluateTurn, PRESETS, CORPUS, classifyText, normalizeMemoryTiers } from "./target";
let s = +(process.env.SEED ?? 0x5c3a);
const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const sub = <T,>(a: T[]) => a.filter(() => rnd() < 0.5);
const CATS = ["technology", "business", "education", "lifestyle"] as any[];
const TIERS = ["Working", "Episodic", "Semantic", "Persistent", "Procedural", "Scratchpad (L1)", "Persistent (L3)", "Permanent (L4)"];
const MSGS = [...CORPUS.map((c) => c.text), "call me at 555-123-4567 about kubernetes", "I am 34 years old and love hiking", "my salary is low, need a budget app", "pray at church then learn python", "we should vote on the roadmap", "help me with my python script", "a laptop for coding and coffee recipes", "my medical appointment is before my python course"];
const INTERESTS = ["running with my sister every sunday in the park before work", "rust", "trail running", "therapy", "election", "coffee", "sam@example.com", "sam@example.com rust", "555-123-4567 python", "age 34 hiking", "budget", "gift ideas", "anxiety", "python"];
const BLOCKS = [[], [], ["salary"], ["python"], ["salary", "coffee"]];
const N = +(process.env.N ?? 20000);
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const has = (text: string, term: string) => term.includes(" ") ? text.toLowerCase().includes(term) : new RegExp(`(^|[^a-z0-9])${esc(term)}([^a-z0-9]|$)`).test(text.toLowerCase());
let released = 0, withheld = 0, suppressed = 0, blocked = 0, capped = 0, ads = 0; const fails: Record<string, number> = {};
const bad = (k: string) => (fails[k] = (fails[k] ?? 0) + 1);
for (let i = 0; i < N; i++) {
  const p: any = PRESETS[pick(["strict", "balanced", "minimal"] as const)].build();
  p.allowedCategories = sub(CATS); p.interests = sub(INTERESTS); p.blockedBrands = rnd() < 0.2 ? ["Lumen"] : [];
  p.dataControls = { shareConversationTopics: rnd() < .5, shareSearchHistory: rnd() < .5, shareInteractionPatterns: rnd() < .5, allowPersonalization: rnd() < .5 };
  p.sessionLimits.minRelevanceThreshold = Math.floor(rnd() * 50) + 50; p.sessionLimits.maxAdsPerHour = Math.floor(rnd() * 5);
  const g: any = { ...pick(p.scwGates), gateType: pick(["allow", "block", "review", "contextual"]), allowedCategories: sub(CATS), memoryTierAccess: normalizeMemoryTiers(sub(TIERS)), maxAdsPerSession: Math.floor(rnd() * 4), requireRelevanceScore: Math.floor(rnd() * 50) + 50, blockedTopics: pick(BLOCKS),
    dataSharing: { conversationContext: rnd() < .5, userPreferences: rnd() < .5, behavioralData: false, demographicData: false } };
  const msg = pick(MSGS), hist = Array.from({ length: Math.floor(rnd() * 4) }, () => pick(MSGS)), shown = Math.floor(rnd() * 3);
  const r = evaluateTurn(p, g, msg, hist, shown);
  released += r.released.length; withheld += r.withheld.length; ads += r.outcome === "ad" ? 1 : 0;
  suppressed += r.outcome === "suppressed" ? 1 : 0; blocked += r.outcome === "blocked" ? 1 : 0; capped += r.outcome === "capped" ? 1 : 0;
  const allowed = new Set(g.allowedCategories.filter((c: string) => p.allowedCategories.includes(c)));
  const cap = Math.min(g.maxAdsPerSession, p.sessionLimits.maxAdsPerHour);
  if (g.memoryTierAccess.some((t: string) => t === "Persistent" || t === "Procedural")) bad("normalize grants a sealed tier");
  for (const x of r.released) {
    if (x.tier !== "Working" && x.tier !== "Episodic" && x.tier !== "Semantic") bad("INV-4 sealed tier released");
    if (!g.memoryTierAccess.includes(x.tier)) bad("released from ungranted tier");
    if (!allowed.has(x.category)) bad("released outside allowed categories");
    if (/@|\d{3}[\s.-]\d{4}/.test(x.label) || classifyText(x.label).personal.length) bad("INV-1 identity-shaped label");
    if (classifyText(x.label).sensitive) bad("INV-3 sensitive label released");
    if (g.blockedTopics.some((t: string) => has(x.label, t))) bad("blocked topic released");
    if (x.label.length > 40 || x.label.split(" ").length > 4) bad("free text released");
    if (x.tier === "Working" && (!msg.toLowerCase().includes(x.label) || !(g.dataSharing.conversationContext && p.dataControls.shareConversationTopics))) bad("Working label not from message or without sharing");
    if (x.tier === "Episodic") {
      if (!(g.dataSharing.conversationContext && p.dataControls.shareInteractionPatterns)) bad("Episodic without sharing");
      if (!hist.some((h) => !classifyText(h).sensitive && !g.blockedTopics.some((t: string) => has(h, t)) && classifyText(h).labels.some((l) => l.label === x.label))) bad("Episodic label from a sensitive or blocked turn");
    }
    if (x.tier === "Semantic") {
      if (!(g.dataSharing.userPreferences && p.dataControls.allowPersonalization)) bad("Semantic without personalization");
      if (g.gateType === "contextual") bad("contextual read Semantic");
    }
  }
  if (r.cls.sensitive && (r.released.length || r.ad)) bad("INV-3 sensitive turn released");
  if (g.blockedTopics.some((t: string) => has(msg, t)) && !r.cls.sensitive && (r.released.length || r.outcome !== "blocked")) bad("blocked message not suppressed");
  if (g.gateType === "block" && (r.released.length || r.ad)) bad("sealed released");
  if (g.gateType === "review" && r.outcome === "ad") bad("review showed ad without approval");
  if (shown >= cap && (r.released.length || r.ad)) bad("released or served over budget");
  if (r.ad && (!allowed.has(r.ad.cand.category) || r.ad.relevance < Math.max(g.requireRelevanceScore, p.sessionLimits.minRelevanceThreshold))) bad("ad violates category or relevance");
  if (r.ad && p.blockedBrands.some((b: string) => r.ad!.cand.advertiser.includes(b))) bad("blocked brand served");
  if (r.cls.personal.length && !r.withheld.some((w) => w.rule === "INV-1")) bad("identity cue not ledgered");
  // Explainability: every label in the current message is either released or ledgered with a rule.
  if (!r.cls.sensitive) for (const l of r.cls.labels) if (!r.released.some((x) => x.label === l.label) && !r.withheld.some((w) => w.label === l.label && w.rule)) bad("message label neither released nor ledgered");
  const det = evaluateTurn(p, g, msg, hist, shown);
  if (JSON.stringify(det.released) !== JSON.stringify(r.released) || JSON.stringify(det.withheld) !== JSON.stringify(r.withheld) || det.outcome !== r.outcome) bad("nondeterministic");
}
console.log(JSON.stringify({ seed: process.env.SEED ?? "0x5c3a", cases: N, released, withheld, suppressed, blocked, capped, ads, violations: fails }));
