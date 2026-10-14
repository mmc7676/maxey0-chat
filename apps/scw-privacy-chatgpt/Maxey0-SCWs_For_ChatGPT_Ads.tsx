/**
 * Maxey0 · SCWs for ChatGPT Ads
 * A privacy-first, user-controlled ad boundary for ChatGPT Free and Go users, built on Maxey0 logical
 * Structured Context Worlds (SCWs). ChatGPT advertising is one application of logical SCWs.
 *
 * What is enforced where:
 *  - Inside this app, every release decision is made by one evaluator (evaluateTurn), which drives the
 *    simulator, the replay grid, the Studio previews and the Advertiser Lens. The score, the exposure flow
 *    and the latent map read the same per-tier rule (channelOpen), so they cannot disagree with it.
 *  - In ChatGPT, only ChatGPT's own settings are enforced. The exported profile and instruction are
 *    advisory: ChatGPT may follow them but is not bound by them.
 *
 * Version 3.2 (2026-10-12). Labels follow ChatGPT's own names (Ad controls: Personalize ads, Past chats and memory,
 * Delete ads data; Personalization > Memory: Reference saved memories, Reference chat history; Temporary Chat). Concept and architecture: Mike Cohan (Human0), Maxey0. Built by Maxey0-Claude.
 *
 * Memory model: five typed tiers, not a duration stack (Working, Episodic, Semantic, Persistent,
 * Procedural). Items move between tiers only through the evidence-gated promotion gate. Persistent
 * and Procedural are never ad-readable in any SCW. All advertisers shown are fictional.
 */
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  Shield, Lock, Eye, Map as MapIcon, Send, Download, Upload, Copy, Check,
  Plus, Trash2, BookOpen, Zap, Play, Pause, RotateCcw, Undo2, Megaphone, Brain, LayoutGrid,
  SlidersHorizontal, ArrowRight, Info,
} from "lucide-react";

// ============================================================================
// 1. MODEL
// ============================================================================

type MemoryTier = "Working" | "Episodic" | "Semantic" | "Persistent" | "Procedural";
type PrivacyLevel = "minimal" | "balanced" | "strict" | "custom";
type AdCategory = "technology" | "business" | "education" | "lifestyle" | "none";
type SCWGateType = "allow" | "block" | "review" | "contextual";
type SensitiveClass = "health" | "mental_health" | "politics" | "religion" | "sexuality" | "financial_hardship";

interface SCWPrivacyGate {
  id: string;
  name: string;
  gateType: SCWGateType;
  allowedCategories: AdCategory[];
  blockedTopics: string[];
  maxAdsPerSession: number;
  requireRelevanceScore: number;
  memoryTierAccess: MemoryTier[];
  dataSharing: { conversationContext: boolean; userPreferences: boolean; behavioralData: boolean; demographicData: boolean };
}

interface UserAdProfile {
  privacyLevel: PrivacyLevel;
  interests: string[];
  blockedBrands: string[];
  allowedCategories: AdCategory[];
  scwGates: SCWPrivacyGate[];
  sessionLimits: { maxAdsPerHour: number; maxAdsPerDay: number; minRelevanceThreshold: number };
  dataControls: { shareConversationTopics: boolean; shareSearchHistory: boolean; shareInteractionPatterns: boolean; allowPersonalization: boolean };
}

interface TierInfo {
  id: MemoryTier; short: string; holds: string; lifecycle: string; chatgpt: string;
  adGrantable: boolean; color: string; weight: number;
}

const TIERS: TierInfo[] = [
  { id: "Working", short: "W", holds: "Volatile in-flight state (scratchpad)", lifecycle: "TTL-enforced; purged at session close", chatgpt: "The message you are writing now", adGrantable: true, color: "#34d399", weight: 0.2 },
  { id: "Episodic", short: "E", holds: "Turn chains, session summaries, handoff state", lifecycle: "Time-stamped; summarized at session close", chatgpt: "Earlier turns in the current chat", adGrantable: true, color: "#60a5fa", weight: 0.3 },
  { id: "Semantic", short: "S", holds: "Concept graph: extracted concepts, aliases, interests", lifecycle: "Admitted from Episodic only through the promotion gate", chatgpt: "Saved memory, chat history and interests the ad system inferred", adGrantable: true, color: "#fbbf24", weight: 0.5 },
  { id: "Persistent", short: "P", holds: "Durable facts and versioned preferences", lifecycle: "Written rarely, always with a promotion evidence chain", chatgpt: "Account identity, profile and settings", adGrantable: false, color: "#f87171", weight: 0 },
  { id: "Procedural", short: "R", holds: "Skills and instructions: how the assistant behaves", lifecycle: "Creation = memorization, revision = consolidation, deprecation = forgetting", chatgpt: "Custom instructions and this privacy profile", adGrantable: false, color: "#a78bfa", weight: 0 },
];
const TIER: Record<MemoryTier, TierInfo> = Object.fromEntries(TIERS.map((t) => [t.id, t])) as Record<MemoryTier, TierInfo>;
const AD_GRANTABLE = new Set<MemoryTier>(TIERS.filter((t) => t.adGrantable).map((t) => t.id));
const LEGACY_TIER_NAMES: Record<string, MemoryTier> = { "Scratchpad (L1)": "Working", "Episodic (L2)": "Episodic", "Persistent (L3)": "Semantic" };
const MEMORY_MODEL = "Maxey0 five typed tiers: Working, Episodic, Semantic, Persistent, Procedural. Promotion is evidence-gated. Persistent and Procedural are never ad-readable.";

const normalizeMemoryTiers = (tiers: unknown): MemoryTier[] => {
  const out: MemoryTier[] = [];
  (Array.isArray(tiers) ? tiers : []).forEach((t) => {
    if (typeof t !== "string") return;
    const tier = (LEGACY_TIER_NAMES[t] ?? t) as MemoryTier;
    if (AD_GRANTABLE.has(tier) && !out.includes(tier)) out.push(tier);
  });
  return TIERS.map((t) => t.id).filter((id) => out.includes(id));
};

const CATEGORIES: { id: Exclude<AdCategory, "none">; label: string; color: string }[] = [
  { id: "technology", label: "Technology", color: "#22d3ee" },
  { id: "business", label: "Business", color: "#fbbf24" },
  { id: "education", label: "Education", color: "#a78bfa" },
  { id: "lifestyle", label: "Lifestyle", color: "#f472b6" },
];
const CAT_COLOR: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.color]));

const MODES: { id: SCWGateType; label: string; blurb: string; color: string; weight: number }[] = [
  { id: "block", label: "No ads", blurb: "No ads, and nothing in this world informs ads. Like a Temporary Chat.", color: "#34d399", weight: 0 },
  { id: "contextual", label: "This chat only", blurb: "Ads may use topics from this chat only. Your memory and ad topics are never used.", color: "#60a5fa", weight: 0.8 },
  { id: "review", label: "Ask me first", blurb: "Like Personalized, but every matched ad waits for your OK.", color: "#fbbf24", weight: 0.6 },
  { id: "allow", label: "Personalized", blurb: "Ads may use this chat and, if Personalize ads is on, your memory and ad topics.", color: "#f87171", weight: 1 },
];
const MODE: Record<SCWGateType, (typeof MODES)[number]> = Object.fromEntries(MODES.map((m) => [m.id, m])) as Record<SCWGateType, (typeof MODES)[number]>;

const INVARIANTS = [
  { id: "INV-1", text: "Identity cues (email, phone, name) and age, occupation, income and location cues are never released from a message or an interest, in any SCW." },
  { id: "INV-2", text: "Demographic and behavioral data are never released; the flags are fixed to off." },
  { id: "INV-3", text: "A sensitive topic (health, mental health, politics, religion, sexuality, financial hardship) suppresses the whole turn: nothing is released and no ad is shown. Sensitive earlier messages and ad topics are never reused." },
  { id: "INV-4", text: "Persistent and Procedural memory can never be granted to an SCW." },
  { id: "INV-5", text: "The ad system receives topic labels and their categories only (vocabulary words or your short ad topics): never message text, the text of earlier turns, or identity." },
];

interface AdCandidate { id: string; advertiser: string; category: Exclude<AdCategory, "none">; keywords: string[]; headline: string }
/** Sample ad inventory. Every advertiser is fictional; the names were invented for this app and any match with a real company is coincidental. */
const INVENTORY: AdCandidate[] = [
  { id: "ad-northwind", advertiser: "Northwind Cloud", category: "technology", keywords: ["cloud", "kubernetes", "devops", "infrastructure", "server", "linux"], headline: "Migration credits for container workloads" },
  { id: "ad-lumen", advertiser: "Lumen IDE", category: "technology", keywords: ["code", "coding", "rust", "python", "software", "api", "typescript", "javascript"], headline: "An editor that reads your whole repo" },
  { id: "ad-ledgerly", advertiser: "Ledgerly", category: "business", keywords: ["invoice", "startup", "budget", "sales", "revenue", "client"], headline: "Invoices that chase themselves" },
  { id: "ad-stratum", advertiser: "Stratum Planning", category: "business", keywords: ["roadmap", "strategy", "planning", "okr", "quarterly", "marketing"], headline: "Roadmaps your team actually updates" },
  { id: "ad-cortex", advertiser: "Cortex Courses", category: "education", keywords: ["statistics", "bayesian", "math", "course", "learn", "learning", "study", "exam", "physics"], headline: "Probability, taught with worked examples" },
  { id: "ad-tidewater", advertiser: "Tidewater Trail Co.", category: "lifestyle", keywords: ["running", "shoes", "trail", "hiking", "camping", "fitness"], headline: "Trail shoes tested on 400 km of mud" },
  { id: "ad-kettle", advertiser: "Kettle & Crumb", category: "lifestyle", keywords: ["recipe", "cooking", "coffee", "baking"], headline: "Weeknight recipes in 25 minutes" },
  { id: "ad-everwell", advertiser: "Everwell Pharmacy", category: "lifestyle", keywords: ["medication", "blood pressure", "prescription"], headline: "Refill reminders for your prescriptions" },
  { id: "ad-pulse", advertiser: "Crowd Pulse", category: "business", keywords: ["election", "vote", "campaign"], headline: "Poll your district in 48 hours" },
];

// ---- local keyword classifier (deterministic, inspectable, not ML) ----
const CATEGORY_TERMS: Record<Exclude<AdCategory, "none">, string[]> = {
  technology: ["software", "code", "coding", "kubernetes", "cloud", "rust", "python", "ai", "laptop", "gpu", "api", "database", "devops", "infrastructure", "javascript", "typescript", "server", "linux"],
  business: ["roadmap", "strategy", "planning", "marketing", "sales", "startup", "invoice", "budget", "okr", "quarterly", "revenue", "client"],
  education: ["learn", "learning", "explain", "course", "study", "exam", "tutorial", "bayesian", "statistics", "math", "physics", "history", "homework", "lecture"],
  lifestyle: ["shoes", "running", "trail", "travel", "recipe", "cooking", "fitness", "hiking", "coffee", "garden", "baking", "camping", "music"],
};
const SENSITIVE_TERMS: Record<SensitiveClass, string[]> = {
  health: ["doctor", "medical", "hospital", "clinic", "medication", "diagnosis", "diagnosed", "symptom", "blood pressure", "prescription", "surgery", "cancer", "diabetes", "pregnant", "pregnancy", "illness"],
  mental_health: ["anxiety", "depression", "therapist", "therapy", "panic attack", "adhd", "bipolar", "burnout", "psychiatrist"],
  politics: ["election", "vote", "voting", "senator", "republican", "democrat", "political", "ballot", "congress"],
  religion: ["church", "mosque", "synagogue", "temple", "prayer", "faith", "religion", "religious", "bible", "quran"],
  sexuality: ["sexual orientation", "gay", "lesbian", "bisexual", "transgender", "queer", "dating app"],
  financial_hardship: ["debt", "bankrupt", "bankruptcy", "eviction", "overdue", "collection agency", "debt collector", "payday loan", "foreclosure", "can't afford"],
};
const NEUTRAL_PHRASES = ["technical debt", "tech debt", "design debt", "debt ratio", "debt-to-equity", "vote of confidence", "upvote", "downvote", "in good faith", "good-faith", "bad faith", "docker doctor", "flutter doctor", "brew doctor"];
const IDENTITY_PATTERNS: { kind: "identity" | "demographic" | "location"; re: RegExp; label: string }[] = [
  { kind: "identity", re: /[\w.+-]+@[\w-]+\.[\w.]+/, label: "email address" },
  { kind: "identity", re: /(?<![\w.:/-])(?:(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}|\+\d{1,3}(?:[\s.-]\d{2,4}){2,4})(?![\w.:/-])/, label: "phone number" },
  { kind: "identity", re: /\b(my name is|i am called|call me|goes by)\b/i, label: "personal name" },
  { kind: "demographic", re: /\b(\d{1,2}\s*(years old|yo)|born in \d{4}|aged? \d{1,2}\b)/i, label: "age" },
  { kind: "demographic", re: /\b(i work as|works at|my job is|my salary|i earn)\b/i, label: "occupation or income" },
  { kind: "location", re: /\b(i live in|i'm based in|my address|zip code|postcode)\b/i, label: "location" },
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasTerm = (text: string, term: string) => {
  const t = term.toLowerCase().trim();
  if (!t) return false;
  if (t.includes(" ")) return text.includes(t);
  return new RegExp(`(^|[^a-z0-9])${escapeRe(t)}([^a-z0-9]|$)`).test(text);
};

interface Classification {
  categories: Exclude<AdCategory, "none">[];
  labels: { label: string; category: Exclude<AdCategory, "none"> }[];
  sensitive: SensitiveClass | null;
  personal: { kind: "identity" | "demographic" | "location"; label: string }[];
}

function classifyText(raw: string): Classification {
  const text = raw.toLowerCase();
  const categories: Classification["categories"] = [];
  const labels: Classification["labels"] = [];
  (Object.keys(CATEGORY_TERMS) as Exclude<AdCategory, "none">[]).forEach((cat) => {
    const hits = CATEGORY_TERMS[cat].filter((t) => hasTerm(text, t));
    if (hits.length) {
      categories.push(cat);
      hits.forEach((h) => labels.some((l) => l.label === h) || labels.push({ label: h, category: cat }));
    }
  });
  const neutral = NEUTRAL_PHRASES.reduce((acc, ph) => acc.split(ph).join(" "), text);
  let sensitive: SensitiveClass | null = null;
  for (const cls of Object.keys(SENSITIVE_TERMS) as SensitiveClass[]) {
    if (SENSITIVE_TERMS[cls].some((t) => hasTerm(neutral, t))) { sensitive = cls; break; }
  }
  const personal = IDENTITY_PATTERNS.filter((p) => p.re.test(raw)).map((p) => ({ kind: p.kind, label: p.label }));
  return { categories, labels, sensitive, personal };
}

// ============================================================================
// 2. DEFAULTS, PRESETS, IMPORT / EXPORT
// ============================================================================

let _id = 0;
const newId = (p: string) => `${p}-${Date.now().toString(36)}${(++_id).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const clamp = (n: unknown, lo: number, hi: number, dflt: number) => {
  const v = typeof n === "number" && Number.isFinite(n) ? n : dflt;
  return Math.min(hi, Math.max(lo, Math.round(v)));
};
const today = () => new Date().toISOString().slice(0, 10);
/** Interests are released as labels, so they are bounded like labels: at most 40 characters and four words. */
const interestBounded = (s: string) => { const t = s.trim(); return !!t && t.length <= 40 && t.split(/\s+/).length <= 4; };
/** An interest is accepted only if it is bounded and carries no identity, demographic or location cue (INV-1). */
const interestOk = (s: string) => interestBounded(s) && classifyText(s).personal.length === 0;
const INTEREST_RULE = "An ad topic can be at most 40 characters and four words, and is refused if it contains an email, a phone number, an age, or a phrase like “my name is”, “I work as” or “I live in”. Do not add names or places.";

const gate = (name: string, gateType: SCWGateType, cats: AdCategory[], tiers: MemoryTier[], ctx: boolean, prefs: boolean, max: number, rel: number, blocked: string[] = []): SCWPrivacyGate => ({
  id: newId("scw"), name, gateType, allowedCategories: cats, blockedTopics: blocked, maxAdsPerSession: max, requireRelevanceScore: rel,
  memoryTierAccess: tiers, dataSharing: { conversationContext: ctx, userPreferences: prefs, behavioralData: false, demographicData: false },
});

const PRESETS: Record<Exclude<PrivacyLevel, "custom">, { label: string; blurb: string; build: () => UserAdProfile }> = {
  strict: {
    label: "Private", blurb: "No ads in Work or Everyday; in Learning, only the current message may inform an education ad.",
    build: () => ({
      privacyLevel: "strict", interests: [], blockedBrands: [], allowedCategories: ["education"],
      scwGates: [
        gate("Work", "block", [], [], false, false, 0, 95, ["salary", "client names"]),
        gate("Learning", "contextual", ["education"], ["Working"], true, false, 1, 90),
        gate("Everyday", "block", [], [], false, false, 0, 95),
      ],
      sessionLimits: { maxAdsPerHour: 1, maxAdsPerDay: 3, minRelevanceThreshold: 90 },
      dataControls: { shareConversationTopics: true, shareSearchHistory: false, shareInteractionPatterns: false, allowPersonalization: false },
    }),
  },
  balanced: {
    label: "Balanced", blurb: "Ads from this chat only. Personalize ads stays off.",
    build: () => ({
      privacyLevel: "balanced", interests: [], blockedBrands: [], allowedCategories: ["technology", "education", "lifestyle"],
      scwGates: [
        gate("Work", "block", ["business", "technology"], ["Working"], false, false, 1, 90, ["salary", "client names"]),
        gate("Learning", "contextual", ["education", "technology"], ["Working", "Episodic"], true, false, 2, 80),
        gate("Everyday", "contextual", ["technology", "education", "lifestyle"], ["Working", "Episodic"], true, false, 3, 75),
      ],
      sessionLimits: { maxAdsPerHour: 4, maxAdsPerDay: 15, minRelevanceThreshold: 75 },
      dataControls: { shareConversationTopics: true, shareSearchHistory: false, shareInteractionPatterns: true, allowPersonalization: false },
    }),
  },
  minimal: {
    label: "Personalized", blurb: "Most relevant: Personalize ads is on. Sensitive topics and identity still never reach ads.",
    build: () => ({
      privacyLevel: "minimal", interests: [], blockedBrands: [], allowedCategories: ["technology", "business", "education", "lifestyle"],
      scwGates: [
        gate("Work", "review", ["business", "technology"], ["Working", "Episodic"], true, true, 2, 75),
        gate("Learning", "allow", ["education", "technology"], ["Working", "Episodic", "Semantic"], true, true, 3, 65),
        gate("Everyday", "allow", ["technology", "business", "education", "lifestyle"], ["Working", "Episodic", "Semantic"], true, true, 4, 60),
      ],
      sessionLimits: { maxAdsPerHour: 8, maxAdsPerDay: 30, minRelevanceThreshold: 60 },
      dataControls: { shareConversationTopics: true, shareSearchHistory: true, shareInteractionPatterns: true, allowPersonalization: true },
    }),
  },
};

/** The Maxey0 logo, embedded (112 px JPEG) so the file stays self-contained with no network request. */
const MAXEY0_LOGO = "data:image/jpeg;base64,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";
const EXPORT_VERSION = "2.0.0";
const APP_VERSION = "3.2";

function normalizeGate(g: any, k: number): SCWPrivacyGate {
  const cats = Array.isArray(g?.allowedCategories) ? g.allowedCategories.filter((c: unknown) => typeof c === "string" && (CATEGORY_TERMS as any)[c as string]) : [];
  const mode: SCWGateType = ["allow", "block", "review", "contextual"].includes(g?.gateType) ? g.gateType : "block";
  return {
    id: typeof g?.id === "string" && g.id ? g.id : newId("scw"),
    name: typeof g?.name === "string" && g.name.trim() ? g.name.trim().slice(0, 40) : `SCW ${k + 1}`,
    gateType: mode,
    allowedCategories: Array.from(new Set(cats)) as AdCategory[],
    blockedTopics: Array.isArray(g?.blockedTopics) ? g.blockedTopics.filter((t: unknown) => typeof t === "string" && t.trim()).map((t: string) => t.trim().toLowerCase()).slice(0, 30) : [],
    maxAdsPerSession: clamp(g?.maxAdsPerSession, 0, 10, 1),
    requireRelevanceScore: clamp(g?.requireRelevanceScore, 50, 100, 85),
    memoryTierAccess: normalizeMemoryTiers(g?.memoryTierAccess),
    dataSharing: { conversationContext: !!g?.dataSharing?.conversationContext, userPreferences: !!g?.dataSharing?.userPreferences, behavioralData: false, demographicData: false },
  };
}

function importProfile(json: string): { ok: true; profile: UserAdProfile; note: string } | { ok: false; error: string } {
  let data: any;
  try { data = JSON.parse(json); } catch { return { ok: false, error: "Invalid profile format: this is not valid JSON." }; }
  if (!data || typeof data !== "object" || typeof data.version !== "string" || !/^[12]\./.test(data.version)) {
    return { ok: false, error: "Invalid profile format: expected a profile exported by this app (a JSON with \"version\" 1.x or 2.x and a \"profile\")." };
  }
  const p = data.profile;
  if (!p || typeof p !== "object" || !Array.isArray(p.scwGates) || !p.sessionLimits || !p.dataControls) {
    return { ok: false, error: "Invalid profile format: \"profile\" must contain scwGates, sessionLimits and dataControls." };
  }
  if (!p.scwGates.length) return { ok: false, error: "Invalid profile format: a profile needs at least one SCW." };
  const strArr = (a: unknown) => (Array.isArray(a) ? a.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()).slice(0, 50) : []);
  let dropped = 0;
  p.scwGates.forEach((g: any) => (Array.isArray(g?.memoryTierAccess) ? g.memoryTierAccess : []).forEach((t: unknown) => {
    const m = typeof t === "string" ? LEGACY_TIER_NAMES[t] ?? t : null;
    if (!m || !AD_GRANTABLE.has(m as MemoryTier)) dropped++;
  }));
  const profile: UserAdProfile = {
    privacyLevel: ["minimal", "balanced", "strict", "custom"].includes(p.privacyLevel) ? p.privacyLevel : "custom",
    interests: strArr(p.interests).filter(interestOk),
    blockedBrands: strArr(p.blockedBrands),
    allowedCategories: Array.from(new Set(strArr(p.allowedCategories).filter((c) => (CATEGORY_TERMS as any)[c] || c === "none"))) as AdCategory[],
    scwGates: p.scwGates.slice(0, 12).map(normalizeGate).map((g: SCWPrivacyGate, i: number, a: SCWPrivacyGate[]) => (a.findIndex((x) => x.id === g.id) < i ? { ...g, id: newId("scw") } : g)),
    sessionLimits: {
      maxAdsPerHour: clamp(p.sessionLimits.maxAdsPerHour, 0, 20, 4),
      maxAdsPerDay: clamp(p.sessionLimits.maxAdsPerDay, 0, 100, 15),
      minRelevanceThreshold: clamp(p.sessionLimits.minRelevanceThreshold, 50, 100, 75),
    },
    dataControls: {
      shareConversationTopics: !!p.dataControls.shareConversationTopics, shareSearchHistory: !!p.dataControls.shareSearchHistory,
      shareInteractionPatterns: !!p.dataControls.shareInteractionPatterns, allowPersonalization: !!p.dataControls.allowPersonalization,
    },
  };
  return { ok: true, profile, note: `Imported ${profile.scwGates.length} SCWs from version ${data.version}.${dropped ? ` ${dropped} tier grant${dropped === 1 ? "" : "s"} removed (unknown, legacy L4, or never grantable).` : ""}` };
}

const WORLD_RULE: Record<SCWGateType, string> = {
  block: "no ads: show no ads, and use nothing from this world for ads",
  contextual: "this chat only: ads may use topics from this chat, never my memory, past chats or ad topics",
  review: "ask me first: ask before showing any ad",
  allow: "personalized: ads may use this chat and, if allowed below, my memory and ad topics",
};

function chatgptInstruction(p: UserAdProfile): string {
  const lines = [
    "Maxey0 SCW privacy profile (advisory). Please follow these preferences when anything in this chat relates to ads or personalization.",
    "- I split my conversations into separate context worlds. I will start a chat with \"World: <name>\"; apply that world's rules, and do not carry details from one world into another. If no world is named, use the strictest one.",
    ...p.scwGates.map((g) => {
      const cats = sharedCats(p, g);
      const extra = g.gateType === "block" ? "" : `; ad categories: ${cats.join(", ") || "none"}; at most ${adCap(p, g)} ad${adCap(p, g) === 1 ? "" : "s"} per session`;
      return `- World "${g.name}" is ${WORLD_RULE[g.gateType]}${extra}${g.blockedTopics.length ? `; no ads when I mention ${g.blockedTopics.join(", ")}` : ""}.`;
    }),
    "- Never use my identity, contact details, age, location, occupation or income for ads.",
    "- Never use health, mental health, politics, religion, sexuality or financial hardship topics for ads.",
    `- Only these ad categories are acceptable: ${p.allowedCategories.filter((c) => c !== "none").join(", ") || "none"}.`,
    p.blockedBrands.length ? `- Never show ads from: ${p.blockedBrands.join(", ")}.` : "",
    p.dataControls.allowPersonalization ? "- You may use my ad topics for relevance." : "- Do not use my past chats, memory or ad topics for ads (Personalize ads off).",
    p.dataControls.shareSearchHistory ? "" : "- Do not use my search history for ads.",
    `- At most ${p.sessionLimits.maxAdsPerHour} ads per hour and ${p.sessionLimits.maxAdsPerDay} per day, only above ${p.sessionLimits.minRelevanceThreshold}% relevance.`,
  ];
  return lines.filter(Boolean).join("\n");
}

function exportProfile(p: UserAdProfile): string {
  return JSON.stringify({
    version: EXPORT_VERSION, app: "Maxey0 SCWs for ChatGPT Ads", appVersion: APP_VERSION, exportedAt: today(), memoryModel: MEMORY_MODEL,
    invariants: INVARIANTS.map((i) => `${i.id}: ${i.text}`), profile: p, chatgptInstruction: chatgptInstruction(p),
  }, null, 2);
}

// ============================================================================
// 3. EVALUATOR: one turn through one SCW
// ============================================================================

type Outcome = "ad" | "held" | "labels" | "capped" | "sealed" | "suppressed" | "blocked" | "none";
interface Released { label: string; category: Exclude<AdCategory, "none">; tier: MemoryTier }
interface Withheld { label: string; tier: MemoryTier | "Identity"; rule: string }
interface Step { id: string; label: string; pass: boolean; detail: string }
interface TurnResult {
  gateId: string; outcome: Outcome; released: Released[]; withheld: Withheld[]; steps: Step[];
  ad: { cand: AdCandidate; relevance: number; matched: string[] } | null; reason: string; cls: Classification;
}

/** Short text inside replay cells, so outcomes never depend on color alone. */
const OUTCOME_GLYPH: Record<Outcome, string> = { ad: "AD", held: "HOLD", labels: "TAG", capped: "CAP", sealed: "SEAL", suppressed: "OFF", blocked: "BLK", none: "–" };
const OUTCOME_META: Record<Outcome, { label: string; color: string }> = {
  ad: { label: "Ad served", color: "#fbbf24" },
  held: { label: "Ad held for review", color: "#fb923c" },
  labels: { label: "Labels only, no ad", color: "#60a5fa" },
  capped: { label: "Ad budget reached", color: "#94a3b8" },
  sealed: { label: "No ads (sealed)", color: "#34d399" },
  suppressed: { label: "Suppressed (sensitive)", color: "#c084fc" },
  blocked: { label: "Suppressed (blocked topic)", color: "#e879f9" },
  none: { label: "Nothing to release", color: "#64748b" },
};

/** Categories an SCW may serve: allowed by both the SCW and the global list. */
const sharedCats = (p: UserAdProfile, g: SCWPrivacyGate) => g.allowedCategories.filter((c): c is Exclude<AdCategory, "none"> => c !== "none" && p.allowedCategories.includes(c));
/** Ads one session in this SCW may show: the lower of its own limit and the hourly limit (the evaluator has no clock). */
const adCap = (p: UserAdProfile, g: SCWPrivacyGate) => Math.min(g.maxAdsPerSession, p.sessionLimits.maxAdsPerHour);
/** The single per-tier rule: may this SCW read tier t for ads? Contextual mode never reads Semantic. */
function tierReadable(p: UserAdProfile, g: SCWPrivacyGate, t: MemoryTier): boolean {
  if (g.gateType === "block" || !AD_GRANTABLE.has(t) || !g.memoryTierAccess.includes(t)) return false;
  if (t === "Working") return g.dataSharing.conversationContext && p.dataControls.shareConversationTopics;
  if (t === "Episodic") return g.dataSharing.conversationContext && p.dataControls.shareInteractionPatterns;
  return g.gateType !== "contextual" && g.dataSharing.userPreferences && p.dataControls.allowPersonalization;
}
/** Why a tier is not readable, as a rule code (only meaningful when tierReadable is false and the SCW is not sealed). */
function tierRule(p: UserAdProfile, g: SCWPrivacyGate, t: MemoryTier): string {
  if (!g.memoryTierAccess.includes(t)) return "NO-GRANT";
  if (t === "Working") return "SHARE-CTX";
  if (t === "Episodic") return "SHARE-SESSION";
  return g.gateType === "contextual" ? "CONTEXTUAL" : "SHARE-PREFS";
}
const TIER_REASON: Record<string, string> = { "NO-GRANT": "Not granted to this SCW", "SHARE-CTX": "Sharing of this chat's topics is off", "SHARE-SESSION": "Session sharing is off", "SHARE-PREFS": "Personalize ads is off", CONTEXTUAL: "This-chat-only worlds never use memory or ad topics" };
/** Plain-language reason a granted tier still does not flow, or null if it flows. */
function inactiveWhy(p: UserAdProfile, g: SCWPrivacyGate, t: MemoryTier): string | null {
  if (!g.memoryTierAccess.includes(t) || channelOpen(p, g, t)) return null;
  if (g.gateType === "block") return "This world shows no ads.";
  if (t === "Semantic" && g.gateType === "contextual") return "This-chat-only worlds never use memory or ad topics.";
  if (t !== "Semantic" && !g.dataSharing.conversationContext) return `"Use this chat" is off for ${g.name}.`;
  if (t === "Working" && !p.dataControls.shareConversationTopics) return `"Use this message" is off in ChatGPT settings.`;
  if (t === "Episodic" && !p.dataControls.shareInteractionPatterns) return `"Use earlier messages in this chat" is off in ChatGPT settings.`;
  if (t === "Semantic" && !g.dataSharing.userPreferences) return `"Personalize ads" is off for ${g.name}.`;
  if (t === "Semantic" && !p.dataControls.allowPersonalization) return `"Personalize ads" is off in ChatGPT settings.`;
  if (!sharedCats(p, g).length) return "No ad category is allowed both here and globally.";
  if (!adCap(p, g)) return "The ad limit is 0.";
  return null;
}
/** A channel is open when the tier is readable and the SCW can release anything at all (a shared category and a non-zero ad cap). */
const channelOpen = (p: UserAdProfile, g: SCWPrivacyGate, t: MemoryTier) => tierReadable(p, g, t) && sharedCats(p, g).length > 0 && adCap(p, g) > 0;

function evaluateTurn(p: UserAdProfile, g: SCWPrivacyGate, message: string, history: string[] = [], adsShown = 0): TurnResult {
  const cls = classifyText(message);
  const steps: Step[] = [];
  const released: Released[] = [];
  const withheld: Withheld[] = [];
  const done = (outcome: Outcome, reason: string, ad: TurnResult["ad"] = null): TurnResult => ({ gateId: g.id, outcome, released, withheld, steps, ad, reason, cls });

  cls.personal.forEach((x) => withheld.push({ label: x.label, tier: "Identity", rule: "INV-1" }));
  steps.push({ id: "INV-1", label: "Identity", pass: true, detail: cls.personal.length ? `${cls.personal.length} identity cue${cls.personal.length === 1 ? "" : "s"} withheld` : "No identity cues" });
  withheld.push({ label: "account & profile", tier: "Persistent", rule: "INV-4" }, { label: "instructions", tier: "Procedural", rule: "INV-4" });

  if (cls.sensitive) {
    steps.push({ id: "INV-3", label: "Sensitive topic", pass: false, detail: `${cls.sensitive.replace("_", " ")} detected: ads suppressed for this turn` });
    cls.labels.forEach((l) => withheld.push({ label: l.label, tier: "Working", rule: "INV-3" }));
    return done("suppressed", `Sensitive topic (${cls.sensitive.replace("_", " ")}): the world is suppressed.`);
  }
  steps.push({ id: "INV-3", label: "Sensitive topic", pass: true, detail: "None detected" });

  const low = message.toLowerCase();
  const hitBlocked = g.blockedTopics.find((t) => hasTerm(low, t));
  if (hitBlocked) {
    steps.push({ id: "BLOCK", label: "Blocked topic", pass: false, detail: `“${hitBlocked}” is blocked in ${g.name}` });
    cls.labels.forEach((l) => withheld.push({ label: l.label, tier: "Working", rule: "BLOCK" }));
    return done("blocked", `Blocked topic “${hitBlocked}” in this SCW.`);
  }

  if (g.gateType === "block") {
    steps.push({ id: "MODE", label: "SCW mode", pass: false, detail: `${g.name} is sealed` });
    cls.labels.forEach((l) => withheld.push({ label: l.label, tier: "Working", rule: "SEALED" }));
    return done("sealed", `${g.name} is sealed: nothing leaves this world.`);
  }
  steps.push({ id: "MODE", label: "SCW mode", pass: true, detail: MODE[g.gateType].label });

  const allowedCats = new Set(sharedCats(p, g));
  const isBlocked = (text: string) => g.blockedTopics.some((t) => hasTerm(text.toLowerCase(), t));
  const consider = (label: string, category: Exclude<AdCategory, "none">, tier: MemoryTier, readable: boolean, rule: string) => {
    if (released.some((r) => r.label === label) || withheld.some((w) => w.label === label && w.tier === tier)) return;
    if (!readable) return withheld.push({ label, tier, rule });
    if (!allowedCats.has(category)) return withheld.push({ label, tier, rule: "CATEGORY" });
    released.push({ label, category, tier });
  };

  // Working: the message being written now.
  const wRead = tierReadable(p, g, "Working");
  cls.labels.forEach((l) => consider(l.label, l.category, "Working", wRead, tierRule(p, g, "Working")));
  steps.push({ id: "W", label: "Working tier", pass: wRead, detail: wRead ? "Current message readable as labels" : TIER_REASON[tierRule(p, g, "Working")] });

  // Episodic: earlier turns in this SCW's session. Sensitive or blocked turns are never reused.
  const eRead = tierReadable(p, g, "Episodic");
  let histUsed = 0;
  history.forEach((h) => {
    const c = classifyText(h);
    if (c.sensitive || isBlocked(h)) return c.labels.forEach((l) => consider(l.label, l.category, "Episodic", false, c.sensitive ? "INV-3" : "BLOCK"));
    histUsed += c.labels.length;
    c.labels.forEach((l) => consider(l.label, l.category, "Episodic", eRead, tierRule(p, g, "Episodic")));
  });
  steps.push({ id: "E", label: "Episodic tier", pass: eRead, detail: eRead ? `${histUsed} label${histUsed === 1 ? "" : "s"} from earlier turns readable` : TIER_REASON[tierRule(p, g, "Episodic")] });

  // Semantic: stated interests (the profile's concept graph). Invariants first, then blocked topics, bounds and category.
  const sRead = tierReadable(p, g, "Semantic");
  p.interests.forEach((i) => {
    const c = classifyText(i);
    const cat = c.categories[0];
    if (c.personal.length) return withheld.push({ label: "interest with an identity cue", tier: "Semantic", rule: "INV-1" });
    if (c.sensitive) return withheld.push({ label: i.toLowerCase(), tier: "Semantic", rule: "INV-3" });
    if (isBlocked(i)) return withheld.push({ label: i.toLowerCase(), tier: "Semantic", rule: "BLOCK" });
    if (!interestBounded(i)) return withheld.push({ label: i.trim().slice(0, 40).toLowerCase(), tier: "Semantic", rule: "LENGTH" });
    if (!cat) return withheld.push({ label: i.toLowerCase(), tier: "Semantic", rule: "UNCLASSIFIED" });
    consider(i.toLowerCase(), cat, "Semantic", sRead, tierRule(p, g, "Semantic"));
  });
  steps.push({ id: "S", label: "Semantic tier", pass: sRead, detail: sRead ? `${p.interests.length} interest${p.interests.length === 1 ? "" : "s"} readable` : TIER_REASON[tierRule(p, g, "Semantic")] });
  steps.push({ id: "INV-4", label: "Persistent + Procedural", pass: true, detail: "Never readable (locked)" });

  if (!released.length) return done("none", "Nothing in a granted tier matched an allowed category.");

  const cap = adCap(p, g);
  if (adsShown >= cap) {
    steps.push({ id: "BUDGET", label: "Ad budget", pass: false, detail: `${adsShown} of ${cap} ads already shown this session: no ad request is made` });
    released.splice(0).forEach((r) => withheld.push({ label: r.label, tier: r.tier, rule: "BUDGET" }));
    return done("capped", "Session ad budget reached: no ad request is made, so nothing is released.");
  }
  steps.push({ id: "BUDGET", label: "Ad budget", pass: true, detail: `${adsShown} of ${cap} used` });

  const threshold = Math.max(g.requireRelevanceScore, p.sessionLimits.minRelevanceThreshold);
  const blocked = p.blockedBrands.map((b) => b.toLowerCase());
  let best: TurnResult["ad"] = null;
  INVENTORY.forEach((cand) => {
    if (!allowedCats.has(cand.category) || blocked.some((b) => cand.advertiser.toLowerCase().includes(b))) return;
    const matched = released.filter((r) => cand.keywords.some((k) => k === r.label || hasTerm(r.label, k) || hasTerm(k, r.label))).map((r) => r.label);
    if (!matched.length) return;
    const fromWorking = released.some((r) => matched.includes(r.label) && r.tier === "Working");
    const relevance = Math.min(100, 55 + 20 * matched.length + (fromWorking ? 10 : 0));
    if (!best || relevance > best.relevance) best = { cand, relevance, matched };
  });
  const b = best as TurnResult["ad"];
  if (!b || b.relevance < threshold) {
    steps.push({ id: "REL", label: "Relevance", pass: false, detail: b ? `Best match ${b.relevance}% < ${threshold}% required` : "No ad in inventory matched" });
    return done("labels", b ? `Best ad was ${b.relevance}% relevant; this SCW requires ${threshold}%.` : "No ad matched the released labels.");
  }
  steps.push({ id: "REL", label: "Relevance", pass: true, detail: `${b.cand.advertiser} ${b.relevance}% ≥ ${threshold}%` });
  if (g.gateType === "review") return done("held", "Matched ad held until you approve it.", b);
  return done("ad", `Contextual ad from ${b.cand.advertiser}.`, b);
}

// ---- profile-level metrics ----
function gateExposure(p: UserAdProfile, g: SCWPrivacyGate): number {
  const tiers = (["Working", "Episodic", "Semantic"] as MemoryTier[]).filter((t) => channelOpen(p, g, t)).reduce((s, t) => s + TIER[t].weight, 0);
  return MODE[g.gateType].weight * tiers;
}
function exposureOf(p: UserAdProfile): number {
  if (!p.scwGates.length) return 0;
  return p.scwGates.reduce((s, g) => s + gateExposure(p, g), 0) / p.scwGates.length;
}
const privacyScore = (p: UserAdProfile) => Math.round(100 * (1 - exposureOf(p)));

// ---- replay corpus (synthetic prompts, written for this app) ----
const CORPUS: { text: string; tag: string }[] = [
  { text: "Explain Bayesian statistics with a worked example", tag: "education" },
  { text: "Help me debug this Rust API server on Linux", tag: "technology" },
  { text: "Draft a Q3 roadmap and OKR plan for my startup", tag: "business" },
  { text: "Best trail running shoes for hiking in mud?", tag: "lifestyle" },
  { text: "Kubernetes vs plain cloud VMs for a small devops team", tag: "technology" },
  { text: "A 25 minute weeknight recipe with coffee rub", tag: "lifestyle" },
  { text: "Study plan for my physics exam next week", tag: "education" },
  { text: "Write an invoice reminder email to a client", tag: "business" },
  { text: "My doctor changed my blood pressure medication", tag: "sensitive" },
  { text: "Who should I vote for in the senator election?", tag: "sensitive" },
  { text: "I have so much debt, I can't afford rent", tag: "sensitive" },
  { text: "My therapist says my anxiety is burnout", tag: "sensitive" },
  { text: "My name is Sam, email sam@example.com, fix my Python code", tag: "identity" },
  { text: "I live in Denver, suggest camping trips", tag: "identity" },
  { text: "How do we pay down technical debt in the codebase?", tag: "precision" },
  { text: "Upgrade to TypeScript 5.6 from version 4.9.5", tag: "precision" },
  { text: "Summarize this salary negotiation for client names", tag: "blocked" },
  { text: "What's a good gift for my sister?", tag: "unclassified" },
];

// ============================================================================
// 4. STATE
// ============================================================================

interface Turn { id: string; text: string; result: TurnResult; approved?: boolean }
interface State {
  profile: UserAdProfile; past: UserAdProfile[]; selected: string | null;
  sessions: Record<string, Turn[]>; toast: string | null;
  /** Key of the last coalescable edit (typing in one field, dragging one slider), so Undo reverts the whole gesture. */
  lastKey: string | null;
}
type Action =
  | { type: "edit"; note?: string; key?: string; fn: (p: UserAdProfile) => UserAdProfile }
  | { type: "replace"; profile: UserAdProfile; note: string }
  | { type: "undo" } | { type: "select"; id: string | null }
  | { type: "turn"; gateId: string; turn: Turn } | { type: "approve"; gateId: string; turnId: string; ok: boolean }
  | { type: "clearSession"; gateId: string } | { type: "toast"; msg: string | null };

const initialState = (): State => {
  const profile = PRESETS.balanced.build();
  return { profile, past: [], selected: profile.scwGates[1]?.id ?? null, sessions: {}, toast: null, lastKey: null };
};

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "edit": {
      const next = a.fn(s.profile);
      if (next === s.profile) return s;
      const fixed = { ...next, scwGates: next.scwGates.map((g) => ({ ...g, memoryTierAccess: normalizeMemoryTiers(g.memoryTierAccess), dataSharing: { ...g.dataSharing, behavioralData: false, demographicData: false } })) };
      const coalesce = !!a.key && a.key === s.lastKey;
      return { ...s, profile: fixed, past: coalesce ? s.past : [...s.past, s.profile].slice(-40), toast: a.note ?? s.toast, lastKey: a.key ?? null };
    }
    case "replace":
      return { ...s, profile: a.profile, past: [...s.past, s.profile].slice(-40), sessions: {}, selected: a.profile.scwGates[0]?.id ?? null, toast: a.note, lastKey: null };
    case "undo":
      if (!s.past.length) return s;
      return { ...s, profile: s.past[s.past.length - 1], past: s.past.slice(0, -1), toast: "Undid the last change.", lastKey: null };
    case "select": return { ...s, selected: a.id };
    case "turn": return { ...s, sessions: { ...s.sessions, [a.gateId]: [...(s.sessions[a.gateId] ?? []), a.turn].slice(-30) } };
    case "approve": return { ...s, sessions: { ...s.sessions, [a.gateId]: (s.sessions[a.gateId] ?? []).map((t) => (t.id === a.turnId ? { ...t, approved: a.ok } : t)) } };
    case "clearSession": return { ...s, sessions: { ...s.sessions, [a.gateId]: [] } };
    case "toast": return { ...s, toast: a.msg };
  }
}

const custom = (p: UserAdProfile): UserAdProfile => ({ ...p, privacyLevel: "custom" });
const updGate = (id: string, fn: (g: SCWPrivacyGate) => SCWPrivacyGate) => (p: UserAdProfile) => custom({ ...p, scwGates: p.scwGates.map((g) => (g.id === id ? fn(g) : g)) });

// ============================================================================
// 5. STYLE + UI PRIMITIVES
// ============================================================================

const CSS = `
.mx{--bg:#05060d;--bg2:#0b0e1c;--panel:rgba(18,22,42,.72);--line:rgba(148,163,255,.14);--line2:rgba(148,163,255,.28);--ink:#e8ebff;--mute:#8e97c2;--dim:#7a82ad;--acc:#7c8cff;--acc2:#22d3ee;--good:#34d399;--warn:#fbbf24;--bad:#f87171;--vio:#c084fc;
 font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Inter,Roboto,sans-serif;color:var(--ink);background:radial-gradient(1200px 700px at 12% -10%,#1b1f4b 0%,transparent 60%),radial-gradient(900px 600px at 110% 10%,#1f0f3d 0%,transparent 55%),var(--bg);min-height:100vh;font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased}
.mx *{box-sizing:border-box}.mx button{font:inherit;color:inherit}
.mx .shell{display:grid;grid-template-columns:232px 1fr;min-height:100vh}
.mx .side{position:sticky;top:0;height:100vh;padding:18px 14px;border-right:1px solid var(--line);background:linear-gradient(180deg,rgba(10,12,26,.9),rgba(6,7,16,.9));display:flex;flex-direction:column;gap:14px}
.mx .brand{display:flex;gap:10px;align-items:center;padding:4px 6px 10px}
.mx .logo{width:40px;height:40px;border-radius:50%;display:block;object-fit:cover;box-shadow:0 0 20px rgba(80,140,255,.55);flex:none}
.mx .brand b{display:block;font-size:14px;letter-spacing:.2px}.mx .brand span{font-size:11px;color:var(--mute)}
.mx .nav{display:flex;flex-direction:column;gap:2px}
.mx .nav button{display:flex;gap:10px;align-items:center;padding:9px 10px;border-radius:10px;border:1px solid transparent;background:none;cursor:pointer;color:var(--mute);text-align:left}
.mx .nav button:hover{color:var(--ink);background:rgba(124,140,255,.07)}
.mx .nav button[aria-current=page]{color:var(--ink);background:linear-gradient(90deg,rgba(124,140,255,.18),rgba(124,140,255,.03));border-color:var(--line2)}
.mx .nav small{margin-left:auto;font-size:10px;color:var(--dim)}
.mx .sidefoot{margin-top:auto;font-size:11px;color:var(--dim);padding:8px}
.mx main{min-width:0;padding:22px 26px 60px}
.mx .top{display:flex;align-items:center;gap:14px;margin-bottom:18px;flex-wrap:wrap}
.mx .top h1{font-size:22px;margin:0;letter-spacing:-.3px}.mx .top p{margin:2px 0 0;color:var(--mute);font-size:13px}
.mx .top .grow{flex:1;min-width:200px}
.mx .pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;border:1px solid var(--line2);background:rgba(10,12,28,.6);font-size:12px;color:var(--mute);white-space:nowrap}
.mx .grid{display:grid;gap:16px}.mx .g2{grid-template-columns:repeat(2,minmax(0,1fr))}.mx .g3{grid-template-columns:repeat(3,minmax(0,1fr))}.mx .g4{grid-template-columns:repeat(4,minmax(0,1fr))}
.mx .g-map{grid-template-columns:minmax(0,1fr) 340px}
.mx .span2{grid-column:span 2}
.mx .panel{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px;backdrop-filter:blur(8px);box-shadow:0 1px 0 rgba(255,255,255,.03) inset,0 20px 50px -30px rgba(0,0,0,.8);min-width:0}
.mx .ph{display:flex;align-items:flex-start;gap:10px;margin-bottom:12px}.mx .ph h2{font-size:15px;margin:0;letter-spacing:.1px}.mx .ph p{margin:2px 0 0;font-size:12px;color:var(--mute)}.mx .ph .r{margin-left:auto;display:flex;gap:6px;align-items:center}
.mx .kick{font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:var(--acc2);font-weight:600}
.mx .btn{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:10px;border:1px solid var(--line2);background:rgba(124,140,255,.12);cursor:pointer;font-size:13px;transition:.15s}
.mx .btn:hover{background:rgba(124,140,255,.22);border-color:rgba(148,163,255,.45)}.mx .btn:disabled{opacity:.45;cursor:not-allowed}
.mx .btn.pri{background:linear-gradient(135deg,#4c56e6,#7c3aed);color:#fff;border-color:transparent;box-shadow:0 8px 24px -10px rgba(124,92,255,.8)}
.mx .btn.ghost{background:none}.mx .btn.sm{padding:4px 9px;font-size:12px;border-radius:8px}.mx .btn.danger:hover{border-color:var(--bad);color:var(--bad)}
.mx .seg{display:inline-flex;padding:3px;border-radius:11px;border:1px solid var(--line);background:rgba(5,6,14,.6);gap:2px;flex-wrap:wrap}
.mx .seg button{border:0;background:none;padding:5px 10px;border-radius:8px;cursor:pointer;color:var(--mute);font-size:12px}
.mx .seg button[aria-pressed=true]{background:var(--c,rgba(124,140,255,.25));color:#050611;font-weight:600}
.mx .chip{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:999px;font-size:12px;border:1px solid var(--line2);background:rgba(255,255,255,.03);white-space:nowrap}
.mx .chip.x{cursor:pointer;color:inherit}.mx .chip.x:hover,.mx .chip.x:focus-visible{border-color:var(--bad)}
.mx button.chip{font:inherit;font-size:12px;cursor:pointer}
.mx .chips{display:flex;flex-wrap:wrap;gap:6px}
.mx .tog::before{content:"";position:absolute;inset:-11px -4px}
.mx .tog{position:relative;width:38px;height:22px;border-radius:999px;border:1px solid var(--line2);background:#161a33;cursor:pointer;flex:none;transition:.2s}
.mx .tog::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#8e97c2;transition:.2s}
.mx .tog[aria-checked=true]{background:linear-gradient(135deg,#22d3ee,#7c8cff);border-color:transparent}.mx .tog[aria-checked=true]::after{left:18px;background:#fff}
.mx .tog:disabled{opacity:.4;cursor:not-allowed}
.mx .row{display:flex;align-items:center;gap:10px}.mx .row.wrap{flex-wrap:wrap}.mx .between{justify-content:space-between}
.mx .field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}.mx .lbl{font-size:12px;color:var(--mute);font-weight:500}
.mx input[type=text],.mx textarea{width:100%;background:rgba(3,4,12,.7);border:1px solid var(--line2);border-radius:10px;color:var(--ink);padding:8px 10px;font:inherit;outline:none}
.mx input[type=text]:focus,.mx textarea:focus{border-color:var(--acc);box-shadow:0 0 0 3px rgba(124,140,255,.18)}
.mx textarea{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;resize:vertical}
.mx input[type=range]{width:100%;accent-color:#7c8cff}
.mx .muted{color:var(--mute)}.mx .dim{color:var(--dim)}.mx .small{font-size:12px}.mx .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.mx .num{font-variant-numeric:tabular-nums}
.mx .big{font-size:30px;font-weight:700;letter-spacing:-.8px}
.mx .stat{padding:14px;border-radius:14px;border:1px solid var(--line);background:linear-gradient(160deg,rgba(124,140,255,.08),rgba(0,0,0,0))}
.mx .stat .k{font-size:11px;color:var(--mute);text-transform:uppercase;letter-spacing:1px}
.mx .toast{position:fixed;right:18px;bottom:18px;z-index:50;max-width:380px;padding:10px 14px;border-radius:12px;background:#12163a;border:1px solid var(--line2);box-shadow:0 20px 40px -10px rgba(0,0,0,.7);font-size:13px;display:flex;gap:10px;align-items:center;animation:mxin .25s ease}
@keyframes mxin{from{transform:translateY(8px);opacity:0}to{transform:none;opacity:1}}
@keyframes mxdash{to{stroke-dashoffset:-24}}
@keyframes mxpulse{0%,100%{opacity:.55}50%{opacity:1}}
.mx .flow{animation:mxdash 1.6s linear infinite}
.mx table{width:100%;border-collapse:collapse;font-size:12px}.mx th{text-align:left;font-weight:600;color:var(--mute);padding:6px 8px;border-bottom:1px solid var(--line)}.mx td{padding:6px 8px;border-bottom:1px solid rgba(148,163,255,.07);vertical-align:top}
.mx .scrollx{overflow-x:auto}
.mx .canvaswrap{position:relative;width:100%;aspect-ratio:1/1;max-height:760px;border-radius:16px;overflow:hidden;border:1px solid var(--line);background:radial-gradient(circle at 50% 50%,#0d1030 0%,#05060d 70%)}
.mx .canvaswrap canvas{position:absolute;inset:0;width:100%;height:100%}
.mx .tip{position:absolute;pointer-events:none;z-index:5;max-width:260px;padding:9px 11px;border-radius:10px;background:rgba(8,10,26,.94);border:1px solid var(--line2);font-size:12px;box-shadow:0 10px 30px rgba(0,0,0,.6)}
.mx .overlay{position:absolute;display:flex;gap:6px;flex-wrap:wrap}
.mx .legend{position:absolute;left:12px;bottom:12px;padding:10px 12px;border-radius:12px;background:rgba(5,6,14,.78);border:1px solid var(--line);font-size:11px;display:grid;gap:4px}
.mx .dot{width:9px;height:9px;border-radius:50%;display:inline-block;flex:none}
.mx .step{display:flex;gap:10px;align-items:flex-start;padding:7px 0}
.mx .step .ic{width:22px;height:22px;border-radius:7px;display:grid;place-items:center;flex:none;font-size:11px;font-weight:700}
.mx .adcard{border-radius:14px;padding:14px;border:1px solid rgba(251,191,36,.4);background:linear-gradient(135deg,rgba(251,191,36,.12),rgba(244,114,182,.06))}
.mx .bubble{padding:10px 12px;border-radius:14px 14px 4px 14px;background:linear-gradient(135deg,#2c3380,#3b2a7a);max-width:92%;margin-left:auto}
.mx .cell{width:100%;height:26px;border-radius:6px;border:1px solid rgba(255,255,255,.06);cursor:pointer;transition:transform .12s;font-size:9px;font-weight:700;letter-spacing:.3px;color:#050611;padding:0}
.mx .cell.none{border:1px dashed #8e97c2;color:#c7ceff}
.mx .cell:hover{transform:scale(1.12);outline:2px solid #fff}
.mx .redact{background:repeating-linear-gradient(45deg,#1a1d38 0 6px,#23274a 6px 12px);color:transparent;border-radius:4px;user-select:none}
.mx .lesson{display:grid;grid-template-columns:36px 1fr;gap:12px;padding:12px;border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.015)}
.mx .lesson.open{border-color:var(--acc);background:rgba(124,140,255,.07)}
.mx .lesson>button.lt{all:unset;cursor:pointer;font-weight:700;display:block}.mx .lesson>button.lt:focus-visible{outline:2px solid var(--acc);outline-offset:3px;border-radius:4px}
.mx .lesson .n{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;font-weight:700;background:rgba(124,140,255,.15);color:var(--acc)}
.mx .mobnav{display:none}
.mx .mobscore{display:none}.mx .scrollhint{display:none;font-size:11px;color:var(--dim);margin-bottom:4px}
@media (max-width:1100px){.mx .g-map{grid-template-columns:1fr}.mx .g4{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:900px){.mx .shell{grid-template-columns:1fr}.mx .side{display:none}.mx main{padding:14px 16px 70px}
 .mx .mobnav{display:flex;position:sticky;top:0;z-index:20;gap:4px;overflow-x:auto;padding:8px 16px;background:rgba(5,6,13,.92);border-bottom:1px solid var(--line);backdrop-filter:blur(8px)}
 .mx .mobnav button{flex:none;border:1px solid var(--line);background:none;border-radius:999px;padding:10px 14px;font-size:12px;color:var(--mute);cursor:pointer}
 .mx .mobnav button[aria-current=page]{color:#050611;background:var(--ink)}
 .mx .g2,.mx .g3{grid-template-columns:1fr}.mx .span2{grid-column:auto}.mx .g4>.span2{grid-column:1/-1}.mx .mobscore{display:inline-flex}}
.mx .mlegend{display:none}
@media (max-width:600px){.mx .canvaswrap .legend{display:none}.mx .mlegend{display:grid;position:static;margin-top:8px;grid-template-columns:1fr 1fr}.mx .mtable{min-width:0!important}.mx .mtable th,.mx .mtable td{padding:6px 4px}.mx .scrollhint{display:block}}
@media (max-width:520px){.mx .g4{grid-template-columns:1fr 1fr}.mx .big{font-size:24px}}
@media (prefers-reduced-motion:reduce){.mx .flow{animation:none}.mx .toast{animation:none}.mx .pill .dot{animation:none!important}}
@media (max-width:1280px) and (min-width:901px){.mx .g3{grid-template-columns:repeat(2,minmax(0,1fr))}}
.mx .panel.sel{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc) inset,0 20px 50px -30px rgba(0,0,0,.8)}
.mx .mtable{min-width:520px}
.mx .starthere{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.mx .starthere button{all:unset;cursor:pointer;display:flex;gap:10px;align-items:flex-start;padding:12px;border-radius:12px;border:1px solid var(--line2);background:rgba(124,140,255,.06)}.mx .starthere button:hover,.mx .starthere button:focus-visible{border-color:var(--acc);background:rgba(124,140,255,.14)}.mx .starthere .n{width:24px;height:24px;border-radius:7px;display:grid;place-items:center;font-weight:700;font-size:12px;background:rgba(34,211,238,.15);color:var(--acc2);flex:none}
@media (max-width:700px){.mx .starthere{grid-template-columns:1fr}}
.mx h1:focus{outline:none}
`;

const Panel: React.FC<{ title?: React.ReactNode; sub?: React.ReactNode; kicker?: string; right?: React.ReactNode; className?: string; children?: React.ReactNode; id?: string }> = ({ title, sub, kicker, right, className, children, id }) => (
  <section className={`panel ${className ?? ""}`} id={id} aria-label={typeof title === "string" ? title : undefined}>
    {(title || right) && (
      <div className="ph">
        <div>{kicker && <div className="kick">{kicker}</div>}{title && <h2>{title}</h2>}{sub && <p>{sub}</p>}</div>
        {right && <div className="r">{right}</div>}
      </div>
    )}
    {children}
  </section>
);
const Toggle: React.FC<{ on: boolean; onChange?: (v: boolean) => void; label: string; disabled?: boolean }> = ({ on, onChange, label, disabled }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} className="tog" disabled={disabled} onClick={() => onChange?.(!on)} />
);
function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; color?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} style={{ ["--c" as any]: o.color ?? "#c7ceff" }} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}
const Chip: React.FC<{ color?: string; children: React.ReactNode; onRemove?: () => void; title?: string }> = ({ color, children, onRemove, title }) => {
  const style = color ? { borderColor: color + "88", color } : undefined;
  return onRemove
    ? <button type="button" className="chip x" title={title} style={style} onClick={onRemove} aria-label={`Remove ${String(children)}`}>{children}<span aria-hidden>×</span></button>
    : <span className="chip" title={title} style={style}>{children}</span>;
};
const RuleChip: React.FC<{ rule: string }> = ({ rule }) => {
  const c = rule.startsWith("INV") ? "#c084fc" : rule === "SEALED" ? "#34d399" : rule === "CATEGORY" ? "#fbbf24" : rule === "BLOCK" ? "#e879f9" : "#8e97c2";
  return <span className="chip mono" style={{ fontSize: 10, borderColor: c + "77", color: c }}>{rule}</span>;
};

const TagInput: React.FC<{ placeholder: string; onAdd: (v: string) => void; label: string }> = ({ placeholder, onAdd, label }) => {
  const [v, setV] = useState("");
  const go = () => { const t = v.trim(); if (t) { onAdd(t); setV(""); } };
  return (
    <div className="row">
      <input type="text" aria-label={label} placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
      <button type="button" className="btn sm" onClick={go}><Plus size={14} />Add</button>
    </div>
  );
};

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    if (!m) return;
    setR(m.matches);
    const f = () => setR(m.matches);
    m.addEventListener?.("change", f);
    return () => m.removeEventListener?.("change", f);
  }, []);
  return r;
}

// ============================================================================
// 6. VISUALIZATIONS
// ============================================================================

/** Score dial: 270° arc, gradient, ticks. */
const ScoreDial: React.FC<{ score: number; size?: number }> = ({ score, size = 168 }) => {
  const r = size / 2 - 14, cx = size / 2, cy = size / 2, sweep = 270, start = 135;
  const pt = (deg: number, rr = r) => [cx + rr * Math.cos((deg * Math.PI) / 180), cy + rr * Math.sin((deg * Math.PI) / 180)];
  const arc = (a0: number, a1: number) => { const [x0, y0] = pt(a0), [x1, y1] = pt(a1); return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`; };
  const end = start + (sweep * Math.max(0.5, score)) / 100;
  const col = score >= 80 ? "#34d399" : score >= 60 ? "#60a5fa" : score >= 40 ? "#fbbf24" : "#f87171";
  const label = score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Moderate" : "Exposed";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Privacy score ${score} of 100, ${label}`}>
      <defs><linearGradient id="dialg" x1="0" x2="1"><stop offset="0" stopColor="#22d3ee" /><stop offset="1" stopColor={col} /></linearGradient>
        <filter id="dglow"><feGaussianBlur stdDeviation="3" /></filter></defs>
      {Array.from({ length: 28 }, (_, i) => { const d = start + (sweep * i) / 27; const [a, b] = pt(d, r + 9), [c, e] = pt(d, r + (i % 3 === 0 ? 4 : 6)); return <line key={i} x1={a} y1={b} x2={c} y2={e} stroke="#3a4170" strokeWidth={1.2} />; })}
      <path d={arc(start, start + sweep)} stroke="#1a1f42" strokeWidth={11} fill="none" strokeLinecap="round" />
      <path d={arc(start, end)} stroke="url(#dialg)" strokeWidth={11} fill="none" strokeLinecap="round" filter="url(#dglow)" opacity={0.6} />
      <path d={arc(start, end)} stroke="url(#dialg)" strokeWidth={11} fill="none" strokeLinecap="round" />
      <text x={cx} y={cy + 4} textAnchor="middle" fill="#fff" fontSize={size * 0.26} fontWeight={700} className="num">{score}</text>
      <text x={cx} y={cy + size * 0.2} textAnchor="middle" fill={col} fontSize={12} fontWeight={600}>{label}</text>
    </svg>
  );
};

/** Latent Field: animated canvas of the whole privacy boundary. */
interface Probe { cand: AdCandidate; gi: number; t: number; speed: number; admit: boolean; x0: number; y0: number; done: boolean; bounce: number }
interface Burst { x: number; y: number; t: number; color: string }

const LatentField: React.FC<{ profile: UserAdProfile; selected: string | null; onSelect: (id: string | null) => void; paused: boolean; onCounts?: (c: { admitted: number; blocked: number }) => void }> = ({ profile, selected, onSelect, paused, onCounts }) => {
  const wrap = useRef<HTMLDivElement>(null);
  const cvs = useRef<HTMLCanvasElement>(null);
  const live = useRef({ profile, selected, paused });
  live.current = { profile, selected, paused };
  const hover = useRef<{ x: number; y: number } | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; html: React.ReactNode } | null>(null);
  const hits = useRef<{ kind: string; id: string; x: number; y: number; r: number; info: React.ReactNode }[]>([]);
  const reduced = useReducedMotion();

  useEffect(() => {
    const c = cvs.current!, w = wrap.current!;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let W = 0, H = 0, raf = 0, last = performance.now(), T = 0, emit = 0, admitted = 0, blocked = 0, lastReport = 0;
    const probes: Probe[] = [];
    const bursts: Burst[] = [];
    const stars = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + 0.2, p: Math.random() * 6 }));
    const resize = () => {
      const r = w.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height; c.width = Math.max(1, W * d); c.height = Math.max(1, H * d); ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    resize();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro?.observe(w);

    // A probe asks: could an ad of this category be served from this world's current message? Same rule as the evaluator's Working tier.
    const admits = (p: UserAdProfile, g: SCWPrivacyGate, cand: AdCandidate) =>
      channelOpen(p, g, "Working") && sharedCats(p, g).includes(cand.category) &&
      !p.blockedBrands.some((b) => cand.advertiser.toLowerCase().includes(b.toLowerCase()));

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const { profile: p, selected: sel, paused: ps } = live.current;
      const speed = ps || reduced ? 0 : 1;
      T += dt * speed;
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 18;
      const gates = p.scwGates;
      const score = privacyScore(p);
      const H2: typeof hits.current = [];

      ctx.clearRect(0, 0, W, H);
      // stars + polar grid
      stars.forEach((s) => { ctx.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(T * 1.3 + s.p)); ctx.fillStyle = "#c7d2ff"; ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2); ctx.fill(); });
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(124,140,255,0.06)"; ctx.lineWidth = 1;
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke(); }

      // advertiser membrane
      const memR = R * 0.86;
      const mg = ctx.createRadialGradient(cx, cy, memR * 0.96, cx, cy, memR * 1.05);
      mg.addColorStop(0, "rgba(124,140,255,0)"); mg.addColorStop(0.5, `rgba(124,140,255,${0.08 + (score / 100) * 0.18})`); mg.addColorStop(1, "rgba(124,140,255,0)");
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(cx, cy, memR * 1.05, 0, Math.PI * 2); ctx.moveTo(cx + memR * 0.96, cy); ctx.arc(cx, cy, memR * 0.96, 0, Math.PI * 2, true); ctx.fill();
      ctx.setLineDash([2, 8]); ctx.strokeStyle = "rgba(160,170,255,.35)"; ctx.lineDashOffset = -T * 12;
      ctx.beginPath(); ctx.arc(cx, cy, memR, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);

      // world positions first, so ring labels can avoid them
      const gR = R * 0.76;
      const gpos = gates.map((g, i) => {
        const a = (i / Math.max(1, gates.length)) * Math.PI * 2 - Math.PI / 2 + T * 0.035;
        const shown = g.name.length > 14 ? g.name.slice(0, 13) + "…" : g.name;
        ctx.font = "600 9px ui-sans-serif,system-ui"; const mw = ctx.measureText(MODE[g.gateType].label.toUpperCase()).width;
        ctx.font = "600 11px ui-sans-serif,system-ui"; const nw = ctx.measureText(shown).width;
        return { g, a, x: cx + Math.cos(a) * gR, y: cy + Math.sin(a) * gR, shown, ww: Math.max(76, Math.min(128, Math.max(mw, nw) + 34)), hh: 38 };
      });
      // ring labels share one angle, chosen near vertical so the three never overlap each other, and clear of every world node
      const ringR0: Record<string, number> = { Working: R * 0.6, Episodic: R * 0.47, Semantic: R * 0.34 };
      ctx.font = "600 11px ui-sans-serif,system-ui";
      const labelBox = (t: MemoryTier, ang: number) => {
        const txt = `${t} · ${gates.filter((g) => g.memoryTierAccess.includes(t)).length}/${gates.length}`, w = ctx.measureText(txt).width;
        const lx = cx + Math.cos(ang) * ringR0[t], ly = cy + Math.sin(ang) * ringR0[t] - 6;
        return { txt, lx, ly, x0: lx - w / 2 - 4, x1: lx + w / 2 + 4, y0: ly - 11, y1: ly + 4 };
      };
      const clear = (ang: number) => (["Working", "Episodic", "Semantic"] as MemoryTier[]).every((t) => {
        const b = labelBox(t, ang);
        return gpos.every((q) => b.x1 < q.x - q.ww / 2 - 3 || b.x0 > q.x + q.ww / 2 + 3 || b.y1 < q.y - q.hh / 2 - 3 || b.y0 > q.y + q.hh / 2 + 3);
      });
      const cand: number[] = []; for (let d = 0; d <= 60; d += 5) cand.push(-90 - d, -90 + d, 90 - d, 90 + d);
      // If no angle is clear (very small canvas), labels are skipped rather than drawn over a world; the legend and side panel still name the tiers.
      const labelAngle = cand.map((d) => (d * Math.PI) / 180).find(clear);
      // tier rings
      const ringR = ringR0;
      (["Working", "Episodic", "Semantic"] as MemoryTier[]).forEach((t, k) => {
        const n = gates.filter((g) => g.memoryTierAccess.includes(t)).length;
        const frac = gates.length ? n / gates.length : 0;
        const col = TIER[t].color;
        ctx.strokeStyle = col; ctx.globalAlpha = 0.15 + 0.55 * frac; ctx.lineWidth = 1.5 + frac * 2.5;
        ctx.setLineDash([6 + k * 3, 6]); ctx.lineDashOffset = (k % 2 ? 1 : -1) * T * (10 + k * 4);
        ctx.beginPath(); ctx.arc(cx, cy, ringR[t], 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        ctx.font = "600 11px ui-sans-serif,system-ui"; ctx.textAlign = "center";
        if (labelAngle !== undefined) {
          const lb = labelBox(t, labelAngle);
          ctx.fillStyle = "rgba(5,6,13,.78)"; ctx.fillRect(lb.x0, lb.y0, lb.x1 - lb.x0, lb.y1 - lb.y0);
          ctx.fillStyle = col; ctx.fillText(lb.txt, lb.lx, lb.ly);
        }
        H2.push({ kind: "ring", id: t, x: cx, y: cy, r: ringR[t], info: <><b style={{ color: col }}>{t}</b><div className="muted">{TIER[t].holds}</div><div>In ChatGPT: {TIER[t].chatgpt}</div><div className="small">Granted to {n} of {gates.length} SCWs</div></> });
      });

      // sealed core: Persistent + Procedural
      const coreR = R * 0.2;
      (["Persistent", "Procedural"] as MemoryTier[]).forEach((t, k) => {
        const a0 = -Math.PI / 2 + k * Math.PI + 0.08, a1 = a0 + Math.PI - 0.16;
        ctx.strokeStyle = TIER[t].color; ctx.lineWidth = 7; ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.arc(cx, cy, coreR, a0, a1); ctx.stroke(); ctx.globalAlpha = 1;
        const lx = cx + (k === 0 ? 1 : -1) * (coreR + 12);
        ctx.font = "600 10px ui-sans-serif,system-ui";
        const tw = ctx.measureText(`🔒 ${t}`).width, bx0 = k === 0 ? lx : lx - tw, bx1 = k === 0 ? lx + tw : lx;
        // skip the text when a world node currently sits on it (small canvases); the legend still names the sealed core
        if (gpos.every((q) => bx1 < q.x - q.ww / 2 - 2 || bx0 > q.x + q.ww / 2 + 2 || cy + 5 < q.y - q.hh / 2 - 2 || cy - 9 > q.y + q.hh / 2 + 2)) {
          ctx.fillStyle = TIER[t].color; ctx.textAlign = k === 0 ? "left" : "right";
          ctx.fillText(`🔒 ${t}`, lx, cy + 3);
        }
        ctx.textAlign = "center";
      });
      H2.push({ kind: "core", id: "sealed", x: cx, y: cy, r: coreR + 6, info: <><b>Sealed core</b><div className="muted">Persistent (account, profile) and Procedural (instructions, this profile).</div><div>INV-4: never grantable to any SCW.</div></> });
      // you
      const pulse = 1 + 0.06 * Math.sin(T * 2.2);
      const yg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 0.75 * pulse);
      yg.addColorStop(0, "#ffffff"); yg.addColorStop(0.35, "#a5b4fc"); yg.addColorStop(1, "rgba(124,140,255,0)");
      ctx.fillStyle = yg; ctx.beginPath(); ctx.arc(cx, cy, coreR * 0.75 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#070817"; ctx.font = "700 12px ui-sans-serif,system-ui"; ctx.fillText("YOU", cx, cy - 2);
      ctx.font = "600 10px ui-sans-serif,system-ui"; ctx.fillText(`${score}`, cx, cy + 11);

      // gates
      gpos.forEach(({ g, a, x, y, shown, ww, hh }) => {
        const m = MODE[g.gateType], isSel = sel === g.id;
        // channels from granted tiers
        g.memoryTierAccess.forEach((t, k) => {
          const rr = ringR[t]; if (!rr) return;
          const flowing = channelOpen(p, g, t);
          const sx = cx + Math.cos(a) * rr, sy = cy + Math.sin(a) * rr;
          const off = (k - 1) * 5;
          const nx = -Math.sin(a) * off, ny = Math.cos(a) * off;
          ctx.strokeStyle = TIER[t].color; ctx.globalAlpha = flowing ? 0.55 : 0.18; ctx.lineWidth = isSel ? 2 : 1.2;
          if (!flowing) ctx.setLineDash([3, 4]);
          ctx.beginPath(); ctx.moveTo(sx + nx, sy + ny); ctx.lineTo(x + nx - Math.cos(a) * 20, y + ny - Math.sin(a) * 20); ctx.stroke(); ctx.setLineDash([]);
          if (flowing && speed > 0) for (let q = 0; q < 3; q++) {
            const f = (T * 0.6 + q / 3 + k * 0.17) % 1;
            const px = sx + (x - Math.cos(a) * 20 - sx) * f + nx, py = sy + (y - Math.sin(a) * 20 - sy) * f + ny;
            ctx.globalAlpha = 0.9 * Math.sin(f * Math.PI); ctx.fillStyle = TIER[t].color; ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
          }
          ctx.globalAlpha = 1;
        });
        // world node
        if (isSel) { ctx.shadowColor = m.color; ctx.shadowBlur = 24; }
        ctx.fillStyle = "rgba(10,12,30,.92)"; ctx.strokeStyle = m.color; ctx.lineWidth = isSel ? 2.4 : 1.4;
        const rx = x - ww / 2, ry = y - hh / 2, rad = 9;
        ctx.beginPath(); ctx.moveTo(rx + rad, ry); ctx.arcTo(rx + ww, ry, rx + ww, ry + hh, rad); ctx.arcTo(rx + ww, ry + hh, rx, ry + hh, rad); ctx.arcTo(rx, ry + hh, rx, ry, rad); ctx.arcTo(rx, ry, rx + ww, ry, rad); ctx.closePath();
        ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
        ctx.fillStyle = m.color; ctx.beginPath(); ctx.arc(rx + 9, ry + 9, 3, 0, Math.PI * 2); ctx.fill();
        // tier pips: top-right, one per grantable tier
        (["Working", "Episodic", "Semantic"] as MemoryTier[]).forEach((t, k) => {
          ctx.fillStyle = g.memoryTierAccess.includes(t) ? TIER[t].color : "#262b50";
          ctx.fillRect(rx + ww - 25 + k * 7, ry + 7, 5, 3);
        });
        ctx.fillStyle = "#e8ebff"; ctx.font = "600 11px ui-sans-serif,system-ui"; ctx.textAlign = "center";
        ctx.fillText(shown, x, y + 1);
        ctx.fillStyle = m.color; ctx.font = "600 9px ui-sans-serif,system-ui"; ctx.fillText(m.label.toUpperCase(), x, y + 13);
        const exp = gateExposure(p, g);
        H2.push({ kind: "gate", id: g.id, x, y, r: 46, info: <><b>{g.name}</b> <span style={{ color: m.color }}>· {m.label}</span><div className="muted">{m.blurb}</div><div>Tiers: {g.memoryTierAccess.join(", ") || "none"}</div><div>Categories: {g.allowedCategories.join(", ") || "none"}</div><div>Exposure {Math.round(exp * 100)}% · click to edit</div></> });
      });

      // campaigns
      const aR = R * 0.97;
      const apos = INVENTORY.map((cand, i) => {
        const a = (i / INVENTORY.length) * Math.PI * 2 + T * -0.02 + 0.2;
        return { cand, x: cx + Math.cos(a) * aR, y: cy + Math.sin(a) * aR };
      });
      apos.forEach(({ cand, x, y }) => {
        const col = CAT_COLOR[cand.category];
        const brandBlocked = p.blockedBrands.some((b) => cand.advertiser.toLowerCase().includes(b.toLowerCase()));
        ctx.globalAlpha = brandBlocked ? 0.25 : 0.9;
        ctx.fillStyle = col; ctx.beginPath();
        ctx.moveTo(x, y - 6); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 6, y); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
        H2.push({ kind: "ad", id: cand.id, x, y, r: 12, info: <><b style={{ color: col }}>{cand.advertiser}</b> <span className="dim">(fictional)</span><div className="muted">{cand.category} · “{cand.headline}”</div><div>Targets: {cand.keywords.slice(0, 5).join(", ")}</div>{brandBlocked && <div style={{ color: "#f87171" }}>You blocked this brand</div>}</> });
      });

      // probes
      if (speed > 0 && gates.length) {
        emit -= dt * speed;
        if (emit <= 0) {
          emit = 0.45 + Math.random() * 0.4;
          const ai = Math.floor(Math.random() * apos.length), gi = Math.floor(Math.random() * gates.length);
          probes.push({ cand: apos[ai].cand, gi, t: 0, speed: 0.55 + Math.random() * 0.3, admit: admits(p, gates[gi], apos[ai].cand), x0: apos[ai].x, y0: apos[ai].y, done: false, bounce: 0 });
        }
      }
      for (let i = probes.length - 1; i >= 0; i--) {
        const pr = probes[i];
        const gp = gpos[pr.gi];
        if (!gp) { probes.splice(i, 1); continue; }
        pr.t += dt * pr.speed * speed;
        const col = CAT_COLOR[pr.cand.category];
        const stop = pr.admit ? 1 : 0.72;
        if (!pr.done) {
          const f = Math.min(pr.t, stop);
          const e = f * f * (3 - 2 * f);
          const px = pr.x0 + (gp.x - pr.x0) * e, py = pr.y0 + (gp.y - pr.y0) * e;
          ctx.strokeStyle = col; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(pr.x0 + (gp.x - pr.x0) * Math.max(0, e - 0.15), pr.y0 + (gp.y - pr.y0) * Math.max(0, e - 0.15)); ctx.lineTo(px, py); ctx.stroke();
          ctx.globalAlpha = 1; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, 2.6, 0, Math.PI * 2); ctx.fill();
          if (pr.t >= stop) {
            pr.done = true;
            bursts.push({ x: px, y: py, t: 0, color: pr.admit ? "#34d399" : "#f87171" });
            pr.admit ? admitted++ : blocked++;
            pr.x0 = px; pr.y0 = py;
          }
        } else {
          pr.bounce += dt * speed;
          if (!pr.admit) {
            const ox = pr.x0 - cx, oy = pr.y0 - cy, len = Math.hypot(ox, oy) || 1;
            const bx = pr.x0 + (ox / len) * pr.bounce * 60, by = pr.y0 + (oy / len) * pr.bounce * 60;
            ctx.globalAlpha = Math.max(0, 1 - pr.bounce * 1.6); ctx.fillStyle = "#f87171"; ctx.beginPath(); ctx.arc(bx, by, 2.2, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
          }
          if (pr.bounce > 0.7) probes.splice(i, 1);
        }
      }
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i]; b.t += dt * speed * 1.6;
        ctx.strokeStyle = b.color; ctx.globalAlpha = Math.max(0, 1 - b.t); ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(b.x, b.y, 4 + b.t * 18, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
        if (b.t >= 1) bursts.splice(i, 1);
      }

      hits.current = H2;
      if (onCounts && now - lastReport > 400) { lastReport = now; onCounts({ admitted, blocked }); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro?.disconnect(); };
  }, [reduced, onCounts]);

  const find = (e: React.MouseEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const order = ["gate", "ad", "core", "ring"];
    for (const k of order) {
      for (const h of hits.current.filter((q) => q.kind === k)) {
        const d = Math.hypot(x - h.x, y - h.y);
        if (k === "ring" ? Math.abs(d - h.r) < 8 : d < h.r) return { h, x, y, w: r.width, hgt: r.height };
      }
    }
    return { h: null, x, y, w: r.width, hgt: r.height };
  };
  const legend = (cls: string) => (
    <div className={cls} aria-hidden="true">
      <div className="row"><span className="dot" style={{ background: "#fff" }} />You · privacy score</div>
      <div className="row"><span className="dot" style={{ background: "#f87171" }} /><span className="dot" style={{ background: "#a78bfa" }} />Sealed core (INV-4)</div>
      <div className="row">{(["Working", "Episodic", "Semantic"] as MemoryTier[]).map((t) => <span key={t} className="dot" style={{ background: TIER[t].color }} />)}Grantable tiers</div>
      <div className="row"><span className="dot" style={{ background: "#7c8cff", borderRadius: 3 }} />Worlds (SCWs) · click to edit</div>
      <div className="row">{CATEGORIES.map((c) => <span key={c.id} className="dot" style={{ background: c.color, borderRadius: 1, transform: "rotate(45deg)" }} />)}Fictional advertisers</div>
    </div>
  );
  return (
    <div>
    <div className="canvaswrap" ref={wrap}
      onMouseMove={(e) => { const f = find(e); hover.current = { x: f.x, y: f.y }; setTip(f.h ? { x: Math.max(4, Math.min(f.x + 14, f.w - 270)), y: f.y > f.hgt - 150 ? Math.max(4, f.y - 140) : f.y + 14, html: f.h.info } : null); (e.currentTarget as HTMLDivElement).style.cursor = f.h?.kind === "gate" ? "pointer" : "default"; }}
      onMouseLeave={() => setTip(null)}
      onClick={(e) => { const f = find(e); if (f.h?.kind === "gate") onSelect(f.h.id); }}>
      <canvas ref={cvs} role="img" aria-label="Latent map: your sealed core, three grantable memory tiers, your SCWs orbiting them, and fictional advertisers probing from outside. Green bursts are admitted probes; red bursts are blocked." />
      {tip && <div className="tip" style={{ left: tip.x, top: tip.y }}>{tip.html}</div>}
      {legend("legend")}
    </div>
    {legend("legend mlegend")}
    </div>
  );
};

/** Exposure flow: memory tiers → SCWs → advertiser / withheld. Band width = units of data. */
const ExposureFlow: React.FC<{ profile: UserAdProfile; onSelect: (id: string) => void; selected: string | null }> = ({ profile, onSelect, selected }) => {
  const [hov, setHov] = useState<string | null>(null);
  const W = 760, gates = profile.scwGates, rows = Math.max(gates.length, 5), H = Math.max(300, rows * 58 + 30);
  const srcs = [...TIERS.map((t) => ({ id: t.id, label: t.id, color: t.color })), { id: "Identity", label: "Identity cues", color: "#e879f9" }];
  const unit = 5;
  type L = { id: string; from: string; to: string; flows: boolean; color: string; w: number };
  const l1: L[] = [], l2: L[] = [];
  const flowsFor = (g: SCWPrivacyGate, t: string) => AD_GRANTABLE.has(t as MemoryTier) && channelOpen(profile, g, t as MemoryTier);
  gates.forEach((g) => {
    let rel = 0, wh = 0;
    srcs.forEach((s) => { const f = flowsFor(g, s.id); f ? rel++ : wh++; l1.push({ id: `${s.id}>${g.id}`, from: s.id, to: g.id, flows: f, color: s.color, w: unit }); });
    if (rel) l2.push({ id: `${g.id}>adv`, from: g.id, to: "adv", flows: true, color: MODE[g.gateType].color, w: rel * unit });
    l2.push({ id: `${g.id}>held`, from: g.id, to: "held", flows: false, color: "#475080", w: wh * unit });
  });
  const x0 = 120, x1 = 380, x2 = W - 150, nodeW = 12;
  const sy = (i: number, n: number) => 20 + ((H - 40) / n) * (i + 0.5);
  const srcH = gates.length * unit;
  const gH = (g: SCWPrivacyGate) => srcs.length * unit;
  const totalRel = l2.filter((l) => l.to === "adv").reduce((s, l) => s + l.w, 0), totalHeld = l2.filter((l) => l.to === "held").reduce((s, l) => s + l.w, 0);
  const tgt = { adv: { y: H * 0.3, h: Math.max(4, totalRel) }, held: { y: H * 0.72, h: Math.max(4, totalHeld) } };
  const srcOff: Record<string, number> = {}, gInOff: Record<string, number> = {}, gOutOff: Record<string, number> = {}, tOff: Record<string, number> = { adv: 0, held: 0 };
  const path = (xa: number, ya: number, xb: number, yb: number) => { const m = (xa + xb) / 2; return `M${xa},${ya} C${m},${ya} ${m},${yb} ${xb},${yb}`; };
  const hovGate = hov?.split(">")[1] ?? hov?.split(">")[0];
  return (
    <div className="scrollx">
      <div className="scrollhint">{totalRel / unit} channels reach the advertiser · {totalHeld / unit} withheld · scroll →</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 560, display: "block" }} role="img" aria-label={`Exposure flow: ${totalRel / unit} tier-to-SCW channels reach the advertiser as labels, ${totalHeld / unit} are withheld.`}>
        <defs>{[...l1, ...l2].map((l) => <linearGradient key={l.id} id={`g-${l.id.replace(/[^\w]/g, "")}`} x1="0" x2="1"><stop offset="0" stopColor={l.color} stopOpacity={0.75} /><stop offset="1" stopColor={l.to === "held" ? "#475080" : l.to === "adv" ? "#fbbf24" : MODE[gates.find((g) => g.id === l.to)?.gateType ?? "block"].color} stopOpacity={0.55} /></linearGradient>)}</defs>
        {l1.map((l) => {
          const si = srcs.findIndex((s) => s.id === l.from), gi = gates.findIndex((g) => g.id === l.to);
          const ya = sy(si, srcs.length) - srcH / 2 + (srcOff[l.from] = (srcOff[l.from] ?? 0) + l.w) - l.w / 2;
          const yb = sy(gi, gates.length) - gH(gates[gi]) / 2 + (gInOff[l.to] = (gInOff[l.to] ?? 0) + l.w) - l.w / 2;
          const on = !hov || hov === l.id || hovGate === l.to || hov === l.from;
          return <path key={l.id} d={path(x0 + nodeW, ya, x1, yb)} stroke={l.flows ? `url(#g-${l.id.replace(/[^\w]/g, "")})` : "#2a2f58"} strokeWidth={l.w} fill="none" opacity={on ? (l.flows ? 0.95 : 0.5) : 0.12} strokeDasharray={l.flows ? undefined : "2 3"} onMouseEnter={() => setHov(l.id)} onMouseLeave={() => setHov(null)}><title>{`${l.from} → ${gates[gi].name}: ${l.flows ? "reaches the advertiser as labels" : "withheld"}`}</title></path>;
        })}
        {l2.map((l) => {
          const gi = gates.findIndex((g) => g.id === l.from);
          const ya = sy(gi, gates.length) - gH(gates[gi]) / 2 + (gOutOff[l.from] = (gOutOff[l.from] ?? 0) + l.w) - l.w / 2;
          const t = tgt[l.to as "adv" | "held"];
          const yb = t.y - t.h / 2 + (tOff[l.to] = tOff[l.to] + l.w) - l.w / 2;
          const on = !hov || hovGate === l.from || hov === l.to;
          return <path key={l.id} d={path(x1 + nodeW, ya, x2, yb)} className={l.flows ? "flow" : undefined} stroke={`url(#g-${l.id.replace(/[^\w]/g, "")})`} strokeWidth={l.w} fill="none" opacity={on ? 0.9 : 0.12} strokeDasharray={l.flows ? "10 2" : undefined} />;
        })}
        {srcs.map((s, i) => (
          <g key={s.id} onMouseEnter={() => setHov(s.id)} onMouseLeave={() => setHov(null)}>
            <rect x={x0} y={sy(i, srcs.length) - srcH / 2} width={nodeW} height={srcH} rx={3} fill={s.color} />
            <text x={x0 - 8} y={sy(i, srcs.length) + 4} textAnchor="end" fill="#c7ceff" fontSize={12}>{s.label}{!AD_GRANTABLE.has(s.id as MemoryTier) ? " 🔒" : ""}</text>
          </g>
        ))}
        {gates.map((g, i) => (
          <g key={g.id} style={{ cursor: "pointer" }} tabIndex={0} role="button" aria-label={`Edit ${g.name}`} onClick={() => onSelect(g.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(g.id))} onMouseEnter={() => setHov(g.id)} onMouseLeave={() => setHov(null)} onFocus={() => setHov(g.id)} onBlur={() => setHov(null)}>
            <rect x={x1} y={sy(i, gates.length) - gH(g) / 2 - 3} width={nodeW} height={gH(g) + 6} rx={3} fill={MODE[g.gateType].color} stroke={selected === g.id ? "#fff" : "none"} strokeWidth={2} />
            <text x={x1 + nodeW / 2} y={sy(i, gates.length) - gH(g) / 2 - 9} textAnchor="middle" fill="#fff" fontSize={12} fontWeight={600}>{g.name}</text>
          </g>
        ))}
        {(["adv", "held"] as const).map((k) => (
          <g key={k} onMouseEnter={() => setHov(k)} onMouseLeave={() => setHov(null)}>
            <rect x={x2} y={tgt[k].y - tgt[k].h / 2} width={nodeW} height={tgt[k].h} rx={3} fill={k === "adv" ? "#fbbf24" : "#475080"} />
            <text x={x2 + 20} y={tgt[k].y - 2} fill="#fff" fontSize={12} fontWeight={600}>{k === "adv" ? "Advertiser" : "Withheld"}</text>
            <text x={x2 + 20} y={tgt[k].y + 13} fill="#8e97c2" fontSize={11}>{k === "adv" ? `${totalRel / unit} channels · labels only` : `${totalHeld / unit} channels`}</text>
          </g>
        ))}
      </svg>
    </div>
  );
};

/** Replay matrix: synthetic prompts × SCWs, each cell a full evaluator run. */
const ReplayMatrix: React.FC<{ profile: UserAdProfile; onPick: (prompt: string, gateId: string) => void }> = ({ profile, onPick }) => {
  const res = useMemo(() => CORPUS.map((c) => profile.scwGates.map((g) => evaluateTurn(profile, g, c.text))), [profile]);
  const counts = useMemo(() => {
    const m = Object.fromEntries(Object.keys(OUTCOME_META).map((k) => [k, 0])) as Record<Outcome, number>;
    res.flat().forEach((r) => m[r.outcome]++);
    return m;
  }, [res]);
  // Invariant check on every cell: no sealed-tier release, nothing from a sensitive turn, no identity-shaped label, nothing blocked.
  const leaks = res.flatMap((row) => row.map((r, j) => ({ r, g: profile.scwGates[j] }))).filter(({ r, g }) =>
    r.released.some((x) => x.tier === "Persistent" || x.tier === "Procedural" || classifyText(x.label).personal.length > 0 || g.blockedTopics.some((t) => hasTerm(x.label, t))) || (r.cls.sensitive && r.released.length)).length;
  return (
    <div>
      <div className="row wrap" style={{ marginBottom: 10 }}>
        {(Object.keys(OUTCOME_META) as Outcome[]).filter((o) => counts[o] > 0 || ["ad", "labels", "sealed", "suppressed", "none"].includes(o)).map((o) => <span key={o} className="chip"><span className="dot" style={{ background: OUTCOME_META[o].color }} /><span className="mono" style={{ fontSize: 10 }}>{OUTCOME_GLYPH[o]}</span> {OUTCOME_META[o].label} <b className="num">{counts[o]}</b></span>)}
        <span className="chip" style={{ borderColor: leaks ? "#f87171" : "#34d39988", color: leaks ? "#f87171" : "#34d399" }}>Invariant breaches <b className="num">{leaks}</b></span>
      </div>
      <div className="scrollx">
        <table className="mtable">
          <thead><tr><th>Synthetic prompt</th>{profile.scwGates.map((g) => <th key={g.id} style={{ textAlign: "center" }}>{g.name}</th>)}</tr></thead>
          <tbody>
            {CORPUS.map((c, i) => (
              <tr key={i}>
                <td><span className="small">{c.text}</span> <span className="dim small">· {c.tag}</span></td>
                {res[i].map((r, j) => (
                  <td key={j} style={{ width: 64 }}>
                    <button type="button" className={`cell ${r.outcome === "none" ? "none" : ""}`} aria-label={`${c.text} in ${profile.scwGates[j].name}: ${OUTCOME_META[r.outcome].label}`} title={`${OUTCOME_META[r.outcome].label}: ${r.reason}`} style={{ background: r.outcome === "none" ? "transparent" : OUTCOME_META[r.outcome].color + "dd" }} onClick={() => onPick(c.text, profile.scwGates[j].id)}>{OUTCOME_GLYPH[r.outcome]}</button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/** Promotion gate: animated items moving through Maxey0's evidence-gated memory. */
const PromotionFlow: React.FC = () => {
  const reduced = useReducedMotion();
  const [t, setT] = useState(0);
  const [run, setRun] = useState(true);
  useEffect(() => {
    if (!run || reduced) return;
    let raf = 0, last = performance.now();
    const f = (n: number) => { setT((x) => x + (n - last) / 1000); last = n; raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [run, reduced]);
  const W = 760, H = 250;
  const X = { W: 70, E: 230, G: 400, S: 590, Q: 400 };
  const checks = ["relevance", "evidence", "consistency", "reuse", "policy"];
  const items = [
    { label: "“uses Rust”", pass: true, off: 0 },
    { label: "“likes trail running”", pass: true, off: 1.7 },
    { label: "“phone 555…”", pass: false, off: 3.4, why: "policy: identity" },
    { label: "“one-off gift idea”", pass: false, off: 5.1, why: "reuse: seen once" },
  ];
  const period = 6.8;
  return (
    <div>
      <div className="scrollx">
        <div className="scrollhint">Working → Episodic → gate → Semantic or quarantine · scroll →</div>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 560, display: "block" }} role="img" aria-label="Promotion gate: every move between tiers passes the evidence gate. Items that pass five checks enter Semantic memory; failures go to quarantine for repair.">
          {[["W", "Working", TIER.Working.color], ["E", "Episodic", TIER.Episodic.color], ["S", "Semantic", TIER.Semantic.color]].map(([k, n, c]) => (
            <g key={k}><rect x={(X as any)[k] - 58} y={50} width={116} height={70} rx={14} fill={c + "18"} stroke={c} /><text x={(X as any)[k]} y={44} textAnchor="middle" fill={c} fontSize={12} fontWeight={700}>{n}</text></g>
          ))}
          <g><polygon points={`${X.G - 40},85 ${X.G},45 ${X.G + 40},85 ${X.G},125`} fill="#7c8cff22" stroke="#7c8cff" /><text x={X.G} y={89} textAnchor="middle" fill="#c7ceff" fontSize={11} fontWeight={700}>GATE</text>
            <text x={X.G} y={22} textAnchor="middle" fill="#8e97c2" fontSize={10}>checks: {checks.join(" · ")}</text></g>
          <rect x={X.Q - 70} y={175} width={140} height={54} rx={12} fill="#f8717118" stroke="#f87171" strokeDasharray="4 3" />
          <text x={X.Q} y={197} textAnchor="middle" fill="#f87171" fontSize={12} fontWeight={700}>Quarantine</text>
          <text x={X.Q} y={214} textAnchor="middle" fill="#8e97c2" fontSize={10}>repair or forget</text>
          <g opacity={0.8}><rect x={W - 110} y={150} width={100} height={36} rx={10} fill="#f8717112" stroke="#f87171" /><text x={W - 60} y={172} textAnchor="middle" fill="#f87171" fontSize={11}>🔒 Persistent</text>
            <rect x={W - 110} y={194} width={100} height={36} rx={10} fill="#a78bfa12" stroke="#a78bfa" /><text x={W - 60} y={216} textAnchor="middle" fill="#a78bfa" fontSize={11}>🔒 Procedural</text>
            <text x={W - 60} y={142} textAnchor="middle" fill="#7a82ad" fontSize={10}>never ad-readable</text></g>
          <path d={`M${X.W + 58},85 L${X.E - 58},85 M${X.E + 58},85 L${X.G - 40},85 M${X.G + 40},85 L${X.S - 58},85 M${X.G},125 L${X.Q},175`} stroke="#3a4170" strokeWidth={2} strokeDasharray="4 4" />
          {(() => { const m = (X.W + X.E) / 2; return <g><polygon points={`${m - 9},85 ${m},76 ${m + 9},85 ${m},94`} fill="#7c8cff33" stroke="#7c8cff" /><text x={m} y={110} textAnchor="middle" fill="#7a82ad" fontSize={10}>gate</text></g>; })()}
          {items.map((it, i) => {
            const tt = reduced ? 5.6 : t;
            const f = (((tt + it.off) % period) + period) % period / period;
            let x = X.W, y = 85, op = 1;
            if (f < 0.25) x = X.W + (X.E - X.W) * (f / 0.25);
            else if (f < 0.5) x = X.E + (X.G - X.E) * ((f - 0.25) / 0.25);
            else if (it.pass) x = X.G + (X.S - X.G) * Math.min(1, (f - 0.5) / 0.3);
            else { x = X.G; y = 85 + (160 - 85) * Math.min(1, (f - 0.5) / 0.3); }
            if (f > 0.9) op = (1 - f) / 0.1;
            const col = f < 0.5 ? "#e8ebff" : it.pass ? TIER.Semantic.color : "#f87171";
            const failing = f > 0.5 && !it.pass, crossing = f > 0.46 && f < 0.62;
            return <g key={i} opacity={op} transform={`translate(${x},${y + (i % 2 ? -12 : 12) * (f < 0.5 ? 1 : 0)})`}><circle r={5} fill={col} />{crossing ? null : failing
              ? <text x={10} y={4} textAnchor="start" fill={col} fontSize={10}>{it.label} · {it.why}</text>
              : <text y={-9} textAnchor="middle" fill={col} fontSize={10}>{it.label}</text>}</g>;
          })}
        </svg>
      </div>
      <div className="row between small muted"><span>Every move between tiers passes the gate; this animation shows the move into Semantic. An item is admitted only when all five checks pass, and failures go to quarantine. In this app the gate is illustrated, not executed: the Semantic tier is the interests you type.</span>
        {!reduced && <button type="button" className="btn sm ghost" onClick={() => setRun((r) => !r)}>{run ? <Pause size={13} /> : <Play size={13} />}{run ? "Pause" : "Play"}</button>}</div>
    </div>
  );
};

/** Tier × SCW grant matrix with locked sealed tiers. */
const GrantMatrix: React.FC<{ profile: UserAdProfile; dispatch: React.Dispatch<Action> }> = ({ profile, dispatch }) => (
  <div className="scrollx">
    <div className="scrollhint">Scroll → for every world</div>
    <table className="mtable">
      <thead><tr><th>Tier</th>{profile.scwGates.map((g) => <th key={g.id} style={{ textAlign: "center" }}>{g.name}</th>)}</tr></thead>
      <tbody>
        {TIERS.map((t) => (
          <tr key={t.id}>
            <td><span className="row"><span className="dot" style={{ background: t.color }} /><b>{t.id}</b>{!t.adGrantable && <Lock size={12} />}</span><div className="dim small">{t.chatgpt}</div></td>
            {profile.scwGates.map((g) => {
              const on = g.memoryTierAccess.includes(t.id);
              const why = t.adGrantable ? inactiveWhy(profile, g, t.id) : null;
              return (
                <td key={g.id} style={{ textAlign: "center", verticalAlign: "middle" }}>
                  {t.adGrantable
                    ? <><Toggle on={on} label={`${t.id} readable in ${g.name}`} onChange={(v) => dispatch({ type: "edit", note: `${t.id} ${v ? "granted to" : "revoked from"} ${g.name}.${v && inactiveWhy(profile, { ...g, memoryTierAccess: [...g.memoryTierAccess, t.id] }, t.id) ? ` Inactive: ${inactiveWhy(profile, { ...g, memoryTierAccess: [...g.memoryTierAccess, t.id] }, t.id)}` : ""}`, fn: updGate(g.id, (x) => ({ ...x, memoryTierAccess: v ? [...x.memoryTierAccess, t.id] : x.memoryTierAccess.filter((y) => y !== t.id) })) })} />
                      {why && <div className="dim" style={{ fontSize: 10, marginTop: 2 }} title={why}>inactive</div>}</>
                    : <span className="chip" style={{ color: t.color, borderColor: t.color + "66" }} title="INV-4: never grantable">locked</span>}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ============================================================================
// 7. PAGES
// ============================================================================

type PageId = "overview" | "map" | "studio" | "simulate" | "lens" | "memory" | "learn" | "apply";
interface PageProps { s: State; dispatch: React.Dispatch<Action>; go: (p: PageId) => void; simPrefill: (text: string, gateId: string) => void }


/** Quick setup: three plain questions build a profile from the Balanced preset. Uses only the existing profile model; the evaluator is unchanged. */
type QWork = "none" | "ask"; type QChats = "none" | "chat" | "personal";
function quickProfile(base: UserAdProfile, work: QWork, chats: QChats, personalize: boolean): UserAdProfile {
  const b = PRESETS.balanced.build();
  const [w, ...rest] = b.scwGates;
  const work2: SCWPrivacyGate = work === "ask"
    ? { ...w, gateType: "review", memoryTierAccess: ["Working", "Episodic"], dataSharing: { ...w.dataSharing, conversationContext: true } }
    : w;
  const others = rest.map((g): SCWPrivacyGate => chats === "none" ? { ...g, gateType: "block" }
    : chats === "chat" ? g
    : { ...g, gateType: "allow", memoryTierAccess: ["Working", "Episodic", "Semantic"], dataSharing: { ...g.dataSharing, userPreferences: personalize } });
  const cats = work === "ask" ? Array.from(new Set([...b.allowedCategories, "business" as AdCategory])) : b.allowedCategories;
  return { ...b, privacyLevel: "custom", interests: base.interests, blockedBrands: base.blockedBrands, allowedCategories: cats, scwGates: [work2, ...others],
    dataControls: { ...b.dataControls, allowPersonalization: chats === "personal" && personalize } };
}
const QuickSetup: React.FC<{ s: State; dispatch: React.Dispatch<Action> }> = ({ s, dispatch }) => {
  const [work, setWork] = useState<QWork>("none");
  const [chats, setChats] = useState<QChats>("chat");
  const [pers, setPers] = useState<"off" | "on">("off");
  return (
    <Panel kicker="Quick setup · three questions" title="Set up your ad privacy in 30 seconds" sub="Answer in plain terms; the app builds your worlds. You can fine-tune everything later, and Undo reverses it.">
      <div className="grid g3">
        <div><span className="lbl">1. Ads in work chats?</span><Seg label="Ads in work chats" value={work} onChange={setWork} options={[{ id: "none", label: "No ads", color: "#34d399" }, { id: "ask", label: "Ask me first", color: "#fbbf24" }]} /></div>
        <div><span className="lbl">2. Ads in study and everyday chats?</span><Seg label="Ads in study and everyday chats" value={chats} onChange={setChats} options={[{ id: "none", label: "No ads", color: "#34d399" }, { id: "chat", label: "This chat only", color: "#60a5fa" }, { id: "personal", label: "Personalized", color: "#f87171" }]} /></div>
        <div><span className="lbl">3. Personalize ads (memory, past chats, ad topics)?</span><Seg label="Personalize ads" value={pers} onChange={setPers} options={[{ id: "off", label: "Off", color: "#34d399" }, { id: "on", label: "On", color: "#f87171" }]} />
          {pers === "on" && chats !== "personal" && <div className="small dim" style={{ marginTop: 4 }}>Only applies when study and everyday chats are Personalized.</div>}</div>
      </div>
      <div className="row" style={{ marginTop: 10 }}><button className="btn pri" onClick={() => dispatch({ type: "replace", profile: quickProfile(s.profile, work, chats, pers === "on"), note: "Quick setup applied. Simulator sessions were cleared; Undo reverses it." })}><Check size={14} />Apply my answers</button></div>
    </Panel>
  );
};

const Overview: React.FC<PageProps> = ({ s, dispatch, go, simPrefill }) => {
  const p = s.profile;
  const score = privacyScore(p);
  const replay = useMemo(() => CORPUS.flatMap((c) => p.scwGates.map((g) => evaluateTurn(p, g, c.text))), [p]);
  const ads = replay.filter((r) => r.outcome === "ad" || r.outcome === "held").length;
  const released = replay.reduce((n, r) => n + r.released.length, 0);
  const withheld = replay.reduce((n, r) => n + r.withheld.filter((w) => w.rule !== "INV-4").length, 0);
  return (
    <div className="grid">
      <QuickSetup s={s} dispatch={dispatch} />
      <section className="panel" aria-label="Start here">
        <div className="kick" style={{ marginBottom: 8 }}>Start here · three steps</div>
        <div className="starthere">
          <button type="button" onClick={() => document.getElementById("preset-tile")?.scrollIntoView?.({ block: "center" })}><span className="n">1</span><span><b>Pick a preset</b><span className="small muted" style={{ display: "block" }}>Private, Balanced or Personalized — or answer the three questions above.</span></span></button>
          <button type="button" onClick={() => go("simulate")}><span className="n">2</span><span><b>Try a message</b><span className="small muted" style={{ display: "block" }}>Type as you would in ChatGPT and see exactly what an advertiser would get.</span></span></button>
          <button type="button" onClick={() => go("apply")}><span className="n">3</span><span><b>Copy it to ChatGPT</b><span className="small muted" style={{ display: "block" }}>Change ChatGPT's own settings, then paste your instruction.</span></span></button>
        </div>
      </section>
      <div className="grid g4">
        <div className="stat row" style={{ gridRow: "span 2", justifyContent: "center", flexDirection: "column" }}><ScoreDial score={score} /><div className="small muted" style={{ textAlign: "center" }} title="Score = 100 × (1 − mean SCW exposure). Exposure = mode weight × the weights of the tiers each world can actually release.">Higher means less of your data can reach advertisers</div></div>
        <div className="stat"><div className="k">SCWs</div><div className="big num">{p.scwGates.length}</div><div className="small muted">{p.scwGates.filter((g) => g.gateType === "block").length} with no ads</div></div>
        <div className="stat"><div className="k">Ads in replay</div><div className="big num">{ads}<span className="muted" style={{ fontSize: 14 }}> / {replay.length}</span></div><div className="small muted">{CORPUS.length} prompts × {p.scwGates.length} SCWs</div></div>
        <div className="stat"><div className="k">Labels released</div><div className="big num" style={{ color: "#fbbf24" }}>{released}</div><div className="small muted">never text, never identity</div></div>
        <div className="stat"><div className="k">Withheld</div><div className="big num" style={{ color: "#34d399" }}>{withheld}</div><div className="small muted">message signals withheld, each with a rule</div></div>
        <div className="stat span2" id="preset-tile"><div className="k">Preset</div>
          <div style={{ marginTop: 6 }}><Seg label="Privacy preset" value={p.privacyLevel} onChange={(v) => v !== "custom" && dispatch({ type: "replace", profile: { ...PRESETS[v].build(), interests: p.interests, blockedBrands: p.blockedBrands }, note: `Applied the ${PRESETS[v].label} preset. Simulator sessions were cleared.` })}
            options={[{ id: "strict", label: "Private", color: "#34d399" }, { id: "balanced", label: "Balanced", color: "#60a5fa" }, { id: "minimal", label: "Personalized", color: "#f87171" }, ...(p.privacyLevel === "custom" ? [{ id: "custom" as const, label: "Custom", color: "#c7ceff" }] : [])]} /></div>
          <div className="small muted" style={{ marginTop: 6 }}>{p.privacyLevel === "custom" ? "You have edited the preset. Every change is undoable." : PRESETS[p.privacyLevel].blurb}</div>
        </div>
      </div>
      <Panel kicker="Where your data can go" title="Exposure flow" sub="Every memory tier and identity cue → every world → advertiser or withheld. Solid bands into a world are open channels; dashed ones are closed. Open channels go on to the advertiser as topic labels only. Select a world to edit it." right={<button className="btn sm" onClick={() => go("map")}><MapIcon size={14} />Latent map</button>}>
        <ExposureFlow profile={p} selected={s.selected} onSelect={(id) => { dispatch({ type: "select", id }); go("studio"); }} />
      </Panel>
      <Panel kicker="Stress test" title="Replay: 18 test prompts through every world" sub="Each cell is a full run of the evaluator. Select one to open it in the simulator." right={<button className="btn sm" onClick={() => go("simulate")}><Zap size={14} />Simulator</button>}>
        <ReplayMatrix profile={p} onPick={(text, g) => simPrefill(text, g)} />
      </Panel>
    </div>
  );
};

const GateEditor: React.FC<{ g: SCWPrivacyGate; p: UserAdProfile; dispatch: React.Dispatch<Action>; compact?: boolean }> = ({ g, p, dispatch, compact }) => {
  const up = (note: string, fn: (g: SCWPrivacyGate) => SCWPrivacyGate) => dispatch({ type: "edit", note, fn: updGate(g.id, fn) });
  const exp = gateExposure(p, g);
  return (
    <div>
      <div className="field"><label className="lbl" htmlFor={`n-${g.id}`}>Name</label>
        <input id={`n-${g.id}`} type="text" value={g.name} onChange={(e) => { const v = e.target.value.slice(0, 40); dispatch({ type: "edit", key: `name-${g.id}`, fn: updGate(g.id, (x) => ({ ...x, name: v })) }); }}
          onBlur={() => { if (!g.name.trim()) dispatch({ type: "edit", fn: updGate(g.id, (x) => ({ ...x, name: "Untitled SCW" })) }); }} /></div>
      <div className="field"><span className="lbl">Mode</span>
        <Seg label={`${g.name} mode`} value={g.gateType} onChange={(v) => up(`${g.name} is now ${MODE[v].label}.`, (x) => ({ ...x, gateType: v }))} options={MODES.map((m) => ({ id: m.id, label: m.label, color: m.color }))} />
        <span className="small muted">{MODE[g.gateType].blurb}</span></div>
      <div className="field"><span className="lbl">Memory tiers this SCW may read</span>
        <div className="chips">{TIERS.map((t) => {
          const on = g.memoryTierAccess.includes(t.id);
          const why = t.adGrantable ? inactiveWhy(p, g, t.id) : null;
          return <button key={t.id} type="button" className="chip" disabled={!t.adGrantable} aria-pressed={on} title={!t.adGrantable ? "INV-4: never grantable" : why ? `${t.chatgpt}. Inactive: ${why}` : t.chatgpt}
            style={{ cursor: t.adGrantable ? "pointer" : "not-allowed", borderColor: on ? t.color : undefined, background: on ? t.color + "26" : undefined, color: on ? t.color : t.adGrantable ? undefined : "#7a82ad" }}
            onClick={() => up(`${t.id} ${on ? "revoked from" : "granted to"} ${g.name}.`, (x) => ({ ...x, memoryTierAccess: on ? x.memoryTierAccess.filter((y) => y !== t.id) : [...x.memoryTierAccess, t.id] }))}>
            {!t.adGrantable && <Lock size={11} />}{t.id}{why && <span aria-hidden style={{ opacity: 0.7 }}>·off</span>}</button>;
        })}</div></div>
      <div className="field"><span className="lbl">Ad categories</span>
        <div className="chips">{CATEGORIES.map((c) => {
          const on = g.allowedCategories.includes(c.id), global = p.allowedCategories.includes(c.id);
          return <button key={c.id} type="button" className="chip" aria-pressed={on} title={global ? c.label : `${c.label} is off globally (ChatGPT settings → categories), so it has no effect here`}
            style={{ cursor: "pointer", borderColor: on ? c.color : undefined, background: on ? c.color + "22" : undefined, color: on ? c.color : undefined, opacity: global ? 1 : 0.5 }}
            onClick={() => up(`${c.label} ${on ? "removed from" : "added to"} ${g.name}.`, (x) => ({ ...x, allowedCategories: on ? x.allowedCategories.filter((y) => y !== c.id) : [...x.allowedCategories, c.id] }))}>{c.label}</button>;
        })}</div></div>
      <div className="row between" style={{ marginBottom: 8 }}><span className="small">Use this chat (Working, Episodic)</span><Toggle label={`Use this chat in ${g.name}`} on={g.dataSharing.conversationContext} onChange={(v) => up(`Conversation sharing ${v ? "on" : "off"} in ${g.name}.`, (x) => ({ ...x, dataSharing: { ...x.dataSharing, conversationContext: v } }))} /></div>
      <div className="row between" style={{ marginBottom: 8 }}><span className="small">Personalize ads (Semantic)</span><Toggle label={`Personalize ads in ${g.name}`} on={g.dataSharing.userPreferences} onChange={(v) => up(`Interests ${v ? "usable" : "not usable"} in ${g.name}.`, (x) => ({ ...x, dataSharing: { ...x.dataSharing, userPreferences: v } }))} /></div>
      <div className="row between wrap" style={{ marginBottom: 12, rowGap: 4 }}><span className="small dim">Behavioral & demographic data</span><span className="chip" style={{ color: "#c084fc", borderColor: "#c084fc66" }}><Lock size={11} />INV-2 · always off</span></div>
      {!compact && <>
        <div className="field"><label className="lbl">Max ads per session: <b className="num">{g.maxAdsPerSession}</b></label>
          <input type="range" min={0} max={10} value={g.maxAdsPerSession} aria-label={`Max ads per session in ${g.name}`} onChange={(e) => { const v = +e.target.value; dispatch({ type: "edit", key: `max-${g.id}`, fn: updGate(g.id, (x) => ({ ...x, maxAdsPerSession: v })) }); }} /></div>
        <div className="field"><label className="lbl">Minimum relevance: <b className="num">{g.requireRelevanceScore}%</b></label>
          <input type="range" min={50} max={100} value={g.requireRelevanceScore} aria-label={`Minimum relevance in ${g.name}`} onChange={(e) => { const v = +e.target.value; dispatch({ type: "edit", key: `rel-${g.id}`, fn: updGate(g.id, (x) => ({ ...x, requireRelevanceScore: v })) }); }} /></div>
        <div className="field"><span className="lbl">Blocked topics (suppress the turn when mentioned; never reused from earlier messages or ad topics)</span>
          <TagInput label={`Block a topic in ${g.name}`} placeholder="e.g. salary" onAdd={(v) => up(`Blocked “${v}” in ${g.name}.`, (x) => ({ ...x, blockedTopics: Array.from(new Set([...x.blockedTopics, v.toLowerCase()])) }))} />
          <div className="chips">{g.blockedTopics.map((t) => <Chip key={t} onRemove={() => up(`Unblocked “${t}”.`, (x) => ({ ...x, blockedTopics: x.blockedTopics.filter((y) => y !== t) }))}>{t}</Chip>)}</div></div>
      </>}
      <div className="small">Exposure <b className="num" style={{ color: exp > 0.5 ? "#f87171" : exp > 0.2 ? "#fbbf24" : "#34d399" }}>{Math.round(exp * 100)}%</b>
        <span className="dim"> = mode weight {MODE[g.gateType].weight} × granted, shared tier weights (W 0.2 · E 0.3 · S 0.5)</span></div>
    </div>
  );
};

const LatentPage: React.FC<PageProps> = ({ s, dispatch }) => {
  const [paused, setPaused] = useState(false);
  const [counts, setCounts] = useState({ admitted: 0, blocked: 0 });
  const onCounts = useCallback((c: { admitted: number; blocked: number }) => setCounts(c), []);
  const g = s.profile.scwGates.find((x) => x.id === s.selected) ?? null;
  const rate = counts.admitted + counts.blocked ? Math.round((100 * counts.blocked) / (counts.admitted + counts.blocked)) : 0;
  return (
    <div className="grid g-map">
      <div className="grid" style={{ alignContent: "start" }}>
        <div className="row wrap">
          <span className="pill"><span className="dot" style={{ background: "#34d399", animation: "mxpulse 1.4s infinite" }} />Probes admitted <b className="num">{counts.admitted}</b></span>
          <span className="pill"><span className="dot" style={{ background: "#f87171" }} />Probes blocked <b className="num">{counts.blocked}</b> · {rate}% blocked</span>
          <span className="grow" style={{ flex: 1 }} />
          <button className="btn sm" onClick={() => setPaused((x) => !x)}>{paused ? <Play size={13} /> : <Pause size={13} />}{paused ? "Resume" : "Pause"}</button>
        </div>
        <LatentField profile={s.profile} selected={s.selected} onSelect={(id) => dispatch({ type: "select", id })} paused={paused} onCounts={onCounts} />
        <p className="small muted" style={{ margin: 0 }}>Each probe asks whether an ad of its category could be served from a world's current message. It is admitted only if that world's Working channel is open (the same rule the evaluator uses), the category is allowed there and globally, and the brand is not blocked. Everything else deflects at the membrane. Change a control and the map responds immediately.</p>
      </div>
      <div className="grid" style={{ alignContent: "start" }}>
        <Panel kicker="Selected world" title={g ? g.name : "Choose a world"} right={g && <button className="btn sm ghost" onClick={() => dispatch({ type: "select", id: null })}>Close</button>}>
          <div style={{ marginBottom: 12 }}><Seg label="Select a world" value={g?.id ?? ""} onChange={(id) => dispatch({ type: "select", id })} options={s.profile.scwGates.map((x) => ({ id: x.id, label: x.name, color: MODE[x.gateType].color }))} /></div>
          {g ? <GateEditor g={g} p={s.profile} dispatch={dispatch} compact /> : <p className="small muted">Each rounded world orbiting the core is a logical SCW. Its colored channels show which memory tiers it reads; a dashed channel is granted but closed. Choose a world above, or click one on the map, to edit it here.</p>}
        </Panel>
        <Panel kicker="Five typed tiers" title="Memory in this map" sub="Not a duration stack.">
          {TIERS.map((t) => {
            const n = s.profile.scwGates.filter((g) => g.memoryTierAccess.includes(t.id)).length;
            return <div key={t.id} className="step"><span className="ic" style={{ background: t.color + "22", color: t.color }}>{t.short}</span><div><b>{t.id}</b> <span className="dim small">· {t.adGrantable ? `granted to ${n} of ${s.profile.scwGates.length}` : "locked: cannot be granted"}</span><div className="small muted">{t.chatgpt}</div></div></div>;
          })}
        </Panel>
      </div>
    </div>
  );
};

const StudioPage: React.FC<PageProps> = ({ s, dispatch, simPrefill }) => {
  const p = s.profile;
  const add = () => {
    const g0 = gate(`SCW ${p.scwGates.length + 1}`, "contextual", ["technology"], ["Working"], true, false, 1, 85);
    dispatch({ type: "edit", note: `Created ${g0.name}.`, fn: (x) => custom({ ...x, scwGates: [...x.scwGates, g0] }) });
    dispatch({ type: "select", id: g0.id });
  };
  return (
    <div className="grid">
      <Panel kicker="Control plane" title="Tier grants" sub="Which memory each SCW may read for ads. Persistent and Procedural are locked by INV-4.">
        <GrantMatrix profile={p} dispatch={dispatch} />
      </Panel>
      <div className="row between"><h2 style={{ margin: 0, fontSize: 15 }}>Your context worlds</h2>
        <button className="btn pri" onClick={add} disabled={p.scwGates.length >= 12}><Plus size={14} />New SCW</button></div>
      <div className="grid g3">
        {p.scwGates.map((g) => {
          const preview = evaluateTurn(p, g, "Help me learn Python for a data science course and plan a trail running trip");
          return (
            <Panel key={g.id} kicker={MODE[g.gateType].label} title={g.name} className={s.selected === g.id ? "sel" : ""}
              right={<button className="btn sm ghost danger" aria-label={`Delete ${g.name}`} disabled={p.scwGates.length <= 1} onClick={() => dispatch({ type: "edit", note: `Deleted ${g.name}. Undo is available.`, fn: (x) => custom({ ...x, scwGates: x.scwGates.filter((y) => y.id !== g.id) }) })}><Trash2 size={13} /></button>}>
              <div style={{ height: 3, borderRadius: 3, background: MODE[g.gateType].color, marginTop: -6, marginBottom: 12, boxShadow: s.selected === g.id ? `0 0 16px ${MODE[g.gateType].color}` : undefined }} />
              <GateEditor g={g} p={p} dispatch={dispatch} />
              <div style={{ marginTop: 12, padding: 10, borderRadius: 10, border: "1px dashed rgba(148,163,255,.25)" }}>
                <div className="small muted">Live preview · “Help me learn Python for a data science course…”</div>
                <div className="row wrap" style={{ marginTop: 6 }}><span className="chip" style={{ color: OUTCOME_META[preview.outcome].color, borderColor: OUTCOME_META[preview.outcome].color + "88" }}>{OUTCOME_META[preview.outcome].label}</span>
                  {preview.released.map((r) => <Chip key={r.label} color={CAT_COLOR[r.category]}>{r.label}</Chip>)}</div>
                <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => simPrefill("Help me learn Python for a data science course and plan a trail running trip", g.id)}>Open in simulator <ArrowRight size={12} /></button>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
};

const QUICK = ["Explain Bayesian statistics with a worked example", "Help me debug this Rust API server", "Best trail running shoes for mud?", "My doctor changed my medication", "My name is Sam, email sam@example.com", "How do we pay down technical debt?"];

/** Tier rows show data flow (amber arrow = readable, green square = withheld); rule rows show pass/fail. */
const TraceView: React.FC<{ r: TurnResult }> = ({ r }) => (
  <div>
    {r.steps.map((st, i) => {
      const tierRow = st.id === "W" || st.id === "E" || st.id === "S";
      const [sym, col] = tierRow ? (st.pass ? ["→", "#fbbf24"] : ["■", "#34d399"]) : st.pass ? ["✓", "#34d399"] : ["✕", "#f87171"];
      return (
      <div key={i} className="step"><span className="ic" aria-label={tierRow ? (st.pass ? "readable" : "withheld") : st.pass ? "passed" : "stopped"} style={{ background: col + "22", color: col }}>{sym}</span>
        <div><b className="small">{st.label}</b> <span className="dim mono" style={{ fontSize: 10 }}>{st.id}</span><div className="small muted">{st.detail}</div></div></div>
      );
    })}
  </div>
);
const RULE_HELP = "Rule codes: INV-1, INV-3, INV-4 invariants · BLOCK blocked topic · SEALED no-ads world · NO-GRANT tier not granted · SHARE-CTX / SHARE-SESSION / SHARE-PREFS a sharing switch is off · CONTEXTUAL this-chat-only world never uses memory or ad topics · CATEGORY category not allowed · UNCLASSIFIED no ad category · LENGTH ad topic too long · BUDGET ad budget reached.";

const SimulatePage: React.FC<PageProps & { draft: { text: string; gateId: string | null }; setDraft: (d: { text: string; gateId: string | null }) => void }> = ({ s, dispatch, draft, setDraft }) => {
  const p = s.profile;
  const gid = draft.gateId && p.scwGates.some((g) => g.id === draft.gateId) ? draft.gateId : p.scwGates.some((g) => g.id === s.selected) ? s.selected! : p.scwGates[0]?.id;
  const g = p.scwGates.find((x) => x.id === gid)!;
  const turns = s.sessions[gid] ?? [];
  const last = turns[turns.length - 1];
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: "nearest" }); }, [turns.length]);
  const send = (text: string) => {
    const t = text.trim(); if (!t || !g) return;
    const adsShown = turns.filter((x) => x.result.outcome === "ad" || (x.result.outcome === "held" && x.approved)).length;
    const result = evaluateTurn(p, g, t, turns.map((x) => x.text), adsShown);
    dispatch({ type: "turn", gateId: g.id, turn: { id: newId("turn"), text: t, result } });
    setDraft({ text: "", gateId: g.id });
    if (typeof window !== "undefined" && window.innerWidth <= 900) setTimeout(() => document.getElementById("trace")?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 60);
  };
  const compare = useMemo(() => (last ? p.scwGates.map((x) => ({ g: x, r: evaluateTurn(p, x, last.text) })) : []), [p, last]);
  if (!g) return <Panel title="No SCWs">Create one in the Studio.</Panel>;
  return (
    <div className="grid g2">
      <Panel kicker="Simulated ChatGPT session" title="Type as you would in ChatGPT" sub="Evaluated on this device by the same evaluator as the replay and the Advertiser Lens. Nothing is sent anywhere."
        right={<button className="btn sm ghost" onClick={() => dispatch({ type: "clearSession", gateId: g.id })}><RotateCcw size={13} />Reset</button>}>
        <div style={{ marginBottom: 10 }}><Seg label="Active SCW" value={g.id} onChange={(v) => setDraft({ ...draft, gateId: v })} options={p.scwGates.map((x) => ({ id: x.id, label: x.name, color: MODE[x.gateType].color }))} /></div>
        <div style={{ maxHeight: 420, overflowY: "auto", display: "grid", gap: 10, padding: "4px 2px" }}>
          {!turns.length && <p className="small muted">No turns yet in {g.name}. Earlier turns become the Episodic tier for later ones.</p>}
          {turns.map((t) => {
            const r = t.result, m = OUTCOME_META[r.outcome];
            return (
              <div key={t.id} style={{ display: "grid", gap: 6 }}>
                <div className="bubble small">{t.text}</div>
                <div className="row wrap small"><span className="chip" style={{ color: m.color, borderColor: m.color + "88" }}>{m.label}</span><span className="muted">{r.reason}</span></div>
                {r.ad && (r.outcome === "ad" || t.approved) && <div className="adcard"><div className="row between"><span className="kick" style={{ color: "#fbbf24" }}>Sponsored · contextual</span><span className="dim small">{r.ad.relevance}% relevant</span></div>
                  <b>{r.ad.cand.headline}</b><div className="small muted">{r.ad.cand.advertiser} (fictional) · matched on {r.ad.matched.join(", ")}</div></div>}
                {r.outcome === "held" && t.approved === undefined && <div className="row"><button className="btn sm" onClick={() => dispatch({ type: "approve", gateId: g.id, turnId: t.id, ok: true })}><Check size={13} />Show ad</button><button className="btn sm ghost" onClick={() => dispatch({ type: "approve", gateId: g.id, turnId: t.id, ok: false })}>Hide ad</button></div>}
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <input type="text" aria-label="Message" placeholder={`Message in ${g.name}…`} value={draft.text} onChange={(e) => setDraft({ ...draft, gateId: g.id, text: e.target.value })} onKeyDown={(e) => e.key === "Enter" && send(draft.text)} />
          <button className="btn pri" onClick={() => send(draft.text)} aria-label="Send"><Send size={14} /></button>
        </div>
        <div className="chips" style={{ marginTop: 8 }}>{QUICK.map((q) => <button key={q} type="button" className="chip" style={{ cursor: "pointer" }} onClick={() => send(q)}>{q}</button>)}</div>
      </Panel>
      <div className="grid" style={{ alignContent: "start" }}>
        <Panel id="trace" kicker="Pipeline trace" title={last ? "Last turn, rule by rule" : "Send a message to see its trace"}>
          {last && <>
            <TraceView r={last.result} />
            <div className="field" style={{ marginTop: 8 }}><span className="lbl">Released to the ad system (labels only)</span>
              <div className="chips">{last.result.released.length ? last.result.released.map((r) => <Chip key={r.label + r.tier} color={CAT_COLOR[r.category]} title={`${r.tier} tier`}>{r.label} · {r.tier[0]}</Chip>) : <span className="small dim">nothing</span>}</div></div>
            <div className="field"><span className="lbl">Withheld, each with the rule that withheld it</span>
              <div className="chips">{last.result.withheld.map((w, i) => <span key={i} className="chip small">{w.label} <span className="dim">· {w.tier}</span> <RuleChip rule={w.rule} /></span>)}</div>
              <div className="dim" style={{ fontSize: 11 }}>{RULE_HELP}</div></div>
          </>}
        </Panel>
        {last && <Panel kicker="Same message, every SCW" title="Isolation at a glance">
          <table><tbody>{compare.map(({ g: x, r }) => <tr key={x.id}><td><b>{x.name}</b></td><td><span className="chip" style={{ color: OUTCOME_META[r.outcome].color, borderColor: OUTCOME_META[r.outcome].color + "88" }}>{OUTCOME_META[r.outcome].label}</span></td><td className="small muted">{r.released.map((q) => q.label).join(", ") || "—"}</td></tr>)}</tbody></table>
        </Panel>}
      </div>
    </div>
  );
};

const LensPage: React.FC<PageProps> = ({ s }) => {
  const p = s.profile;
  const [idx, setIdx] = useState(0);
  const [gid, setGid] = useState(s.selected ?? p.scwGates[0]?.id ?? "");
  const g = p.scwGates.find((x) => x.id === gid) ?? p.scwGates[0];
  if (!g) return <Panel title="No SCWs">Create one in the Studio.</Panel>;
  const prompt = CORPUS[idx].text;
  const r = evaluateTurn(p, g, prompt);
  const bid = {
    request_id: "<random, per impression>", slot: "chat_inline", scw_mode: MODE[g.gateType].label.toLowerCase(),
    categories: Array.from(new Set(r.released.map((x) => x.category))), topic_labels: r.released.map((x) => x.label),
    relevance_floor: Math.max(g.requireRelevanceScore, p.sessionLimits.minRelevanceThreshold),
    user_id: null, message_text: null, history: null, demographics: null, location: null,
  };
  const words = prompt.split(/(\s+)/);
  const releasedSet = new Set(r.released.map((x) => x.label));
  return (
    <div className="grid">
      <div className="row wrap">
        <Seg label="SCW" value={g.id} onChange={setGid} options={p.scwGates.map((x) => ({ id: x.id, label: x.name, color: MODE[x.gateType].color }))} />
        <select aria-label="Sample prompt" value={idx} onChange={(e) => setIdx(+e.target.value)} style={{ background: "#0b0e1c", color: "#e8ebff", border: "1px solid rgba(148,163,255,.28)", borderRadius: 10, padding: "7px 10px", flex: "1 1 240px", minWidth: 0, width: "100%" }}>
          {CORPUS.map((c, i) => <option key={i} value={i}>{c.text}</option>)}
        </select>
      </div>
      <div className="grid g2">
        <Panel kicker="Inside your SCW" title="What ChatGPT sees" sub="The sample prompt in full, with the words released to the ad system highlighted.">
          <p style={{ fontSize: 16, lineHeight: 1.8 }}>{words.map((w, i) => { const k = w.toLowerCase().replace(/[^a-z0-9]/g, ""); return releasedSet.has(k) ? <mark key={i} style={{ background: "#fbbf2433", color: "#fbbf24", borderRadius: 4, padding: "0 3px" }}>{w}</mark> : <span key={i}>{w}</span>; })}</p>
          <div className="row wrap small"><span className="chip" style={{ color: OUTCOME_META[r.outcome].color }}>{OUTCOME_META[r.outcome].label}</span><span className="muted">{r.reason}</span></div>
          <TraceView r={r} />
        </Panel>
        <Panel kicker="Across the boundary" title="What the ad system receives" sub="The complete payload under this SCW. Nulls are fields that never cross.">
          {["ad", "held", "labels"].includes(r.outcome)
            ? <pre className="mono small" style={{ margin: 0, whiteSpace: "pre-wrap", padding: 12, borderRadius: 12, background: "#03040c", border: "1px solid rgba(148,163,255,.14)" }}>
                {JSON.stringify(bid, null, 2).split("\n").map((line, i) => <div key={i} style={{ color: /null/.test(line) ? "#7a82ad" : /topic_labels|categories/.test(line) ? "#fbbf24" : "#c7ceff" }}>{line}</div>)}
              </pre>
            : <div style={{ padding: 14, borderRadius: 12, background: "#03040c", border: "1px solid rgba(52,211,153,.35)" }}><b style={{ color: "#34d399" }}>No ad request is made for this message.</b><div className="small muted" style={{ marginTop: 4 }}>{r.reason} Nothing crosses the boundary, not even the fact that a message was sent.</div></div>}
          <div className="small muted" style={{ marginTop: 8 }}>Never sent, in any world: identity cues, message text, the text of earlier turns, your account.</div>
          <p className="small dim">This is the payload this app's evaluator would release. It is not ChatGPT's real ad request format, which is not public.</p>
        </Panel>
      </div>
    </div>
  );
};

const MemoryPage: React.FC<PageProps> = ({ s, dispatch }) => (
  <div className="grid">
    <Panel kicker="Maxey0 memory" title="Five typed tiers, one promotion gate" sub="Tiers are kinds of memory, not durations. Items move between them only through the evidence-gated gate.">
      <PromotionFlow />
    </Panel>
    <div className="grid g3">
      {TIERS.map((t) => (
        <Panel key={t.id} kicker={t.adGrantable ? "Grantable" : "Locked · INV-4"} title={<span className="row"><span className="dot" style={{ background: t.color }} />{t.id}</span>}>
          <div className="small"><b>Holds</b> <span className="muted">{t.holds}</span></div>
          <div className="small"><b>Lifecycle</b> <span className="muted">{t.lifecycle}</span></div>
          <div className="small"><b>In ChatGPT</b> <span className="muted">{t.chatgpt}</span></div>
          <div className="small" style={{ marginTop: 6 }}>{t.adGrantable ? <>Exposure weight <b>{t.weight}</b> · granted in <b>{s.profile.scwGates.filter((g) => g.memoryTierAccess.includes(t.id)).length}</b> SCWs</> : <span style={{ color: t.color }}>Never readable for ads, in any SCW.</span>}</div>
        </Panel>
      ))}
      <Panel kicker="Semantic tier" title="Your ad topics" sub="Used only in Personalized or Ask-me-first worlds that grant Semantic, with “Personalize ads” on there and in ChatGPT settings. Separate several with commas.">
        <TagInput label="Add ad topic" placeholder="e.g. rust, trail running" onAdd={(v) => {
          const parts = v.split(",").map((x) => x.trim()).filter(Boolean);
          const ok = parts.filter(interestOk), bad = parts.length - ok.length;
          if (ok.length) dispatch({ type: "edit", note: `Added ${ok.map((x) => `“${x}”`).join(", ")}.${bad ? ` ${bad} skipped. ${INTEREST_RULE}` : ""}`, fn: (x) => custom({ ...x, interests: Array.from(new Set([...x.interests, ...ok])).slice(0, 50) }) });
          else dispatch({ type: "toast", msg: INTEREST_RULE });
        }} />
        <div className="chips" style={{ marginTop: 8 }}>{s.profile.interests.map((i) => { const c = classifyText(i); return <Chip key={i} color={c.sensitive ? "#c084fc" : c.categories[0] ? CAT_COLOR[c.categories[0]] : "#8e97c2"} title={c.sensitive ? "Sensitive: never released" : c.categories[0] ?? "Unclassified: never released"} onRemove={() => dispatch({ type: "edit", note: `Removed “${i}”.`, fn: (x) => custom({ ...x, interests: x.interests.filter((y) => y !== i) }) })}>{i}</Chip>; })}</div>
        {!s.profile.interests.length && <p className="small dim">No ad topics yet.</p>}
      </Panel>
    </div>
  </div>
);

const LESSONS: { title: string; body: string; page: PageId; cta: string }[] = [
  { title: "A context world is a boundary, not a chat.", body: "A logical SCW is a named boundary around a kind of conversation: Work, Learning, Everyday. It declares what memory it may read, what may leave it, and under which rules. Two chats in different SCWs cannot see each other's context.", page: "map", cta: "See the boundaries" },
  { title: "Memory is typed.", body: "Working is what you are typing now. Episodic is this conversation so far. Semantic is what has been learned about you. Persistent is your account; Procedural is how the assistant is told to behave. An SCW is granted tiers by kind, and two kinds are never grantable.", page: "memory", cta: "Explore the tiers" },
  { title: "Invariants beat settings.", body: "Some rules hold in every SCW no matter what you toggle: identity never crosses, sensitive topics suppress ads, the sealed core stays sealed. Settings choose between safe options; invariants remove unsafe ones.", page: "lens", cta: "See what crosses" },
  { title: "Every decision has a trace.", body: "When an ad is shown or withheld, you should be able to see which rule decided it. The simulator shows each step, the labels released and the labels withheld, with the rule that withheld them.", page: "simulate", cta: "Trace a message" },
  { title: "Advisory until a platform enforces it.", body: "This app enforces your SCWs in its own evaluator. ChatGPT enforces only its own settings. The profile you export is a clear, portable statement of your boundary that ChatGPT may follow and that any platform could adopt.", page: "apply", cta: "ChatGPT settings" },
];

const LearnPage: React.FC<PageProps> = ({ go }) => {
  const [open, setOpen] = useState(0);
  return (
    <div className="grid g2">
      <Panel kicker="Maxey0 · logical SCWs" title="Structured Context Worlds in five ideas" sub="Open an idea to read it; each links to the part of the app that shows it working. ChatGPT ads are one application of logical SCWs.">
        <div style={{ display: "grid", gap: 8 }}>
          {LESSONS.map((l, i) => (
            <div key={i} className={`lesson ${open === i ? "open" : ""}`}>
              <span className="n" aria-hidden>{i + 1}</span>
              <div>
                <button type="button" className="lt" aria-expanded={open === i} aria-controls={`lesson-${i}`} onClick={() => setOpen(i)}>{l.title}</button>
                {open === i && <div id={`lesson-${i}`}><span className="small muted" style={{ display: "block", marginTop: 6 }}>{l.body}</span>
                  <button type="button" className="btn sm" style={{ marginTop: 10 }} onClick={() => go(l.page)}>{l.cta} <ArrowRight size={12} /></button></div>}
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <div className="grid" style={{ alignContent: "start" }}>
        <Panel kicker="The five invariants" title="Rules no setting can override">
          {INVARIANTS.map((v) => <div key={v.id} className="step"><span className="ic" style={{ background: "#c084fc22", color: "#c084fc" }}><Shield size={12} /></span><div><b className="mono small">{v.id}</b><div className="small muted">{v.text}</div></div></div>)}
        </Panel>
        <Panel kicker="Honest limits" title="What this app is and is not">
          <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
            <li>The classifier is a keyword list: inspectable, but it misses paraphrase. A sensitive topic it does not recognize is not suppressed.</li>
            <li>All advertisers and the ad payload format are fictional illustrations.</li>
            <li>Nothing you type leaves this page; there is no server and no storage.</li>
            <li>ChatGPT is not bound by the exported profile.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
};

const ApplyPage: React.FC<PageProps> = ({ s, dispatch }) => {
  const p = s.profile;
  const json = useMemo(() => exportProfile(p), [p]);
  const instr = useMemo(() => chatgptInstruction(p), [p]);
  const [copied, setCopied] = useState<string | null>(null);
  const [imp, setImp] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const copy = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1600); }
    catch { setCopied(`${key}-fail`); }
  };
  const download = () => {
    try {
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = `maxey0-scw-privacy-profile-${today()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setMsg({ ok: false, text: "Download is blocked here. Use Copy instead." }); }
  };
  const doImport = () => {
    const r = importProfile(imp);
    if (r.ok) { dispatch({ type: "replace", profile: r.profile, note: r.note }); setMsg({ ok: true, text: `${r.note} Profile imported successfully.` }); setImp(""); }
    else setMsg({ ok: false, text: r.error });
  };
  return (
    <div className="grid g2">
      <Panel kicker="Global controls" title="Categories, brands and limits" className="span2">
        <div className="grid g3">
          <div>
            <span className="lbl">Ad categories allowed anywhere</span>
            <div className="chips" style={{ marginTop: 6 }}>{CATEGORIES.map((c) => { const on = p.allowedCategories.includes(c.id); return <button key={c.id} type="button" className="chip" aria-pressed={on} style={{ cursor: "pointer", borderColor: on ? c.color : undefined, background: on ? c.color + "22" : undefined, color: on ? c.color : undefined }} onClick={() => dispatch({ type: "edit", note: `${c.label} ${on ? "blocked" : "allowed"} globally.`, fn: (x) => custom({ ...x, allowedCategories: on ? x.allowedCategories.filter((y) => y !== c.id) : [...x.allowedCategories.filter((y) => y !== "none"), c.id] }) })}>{c.label}</button>; })}</div>
            <div style={{ marginTop: 12 }}><span className="lbl">Blocked brands</span>
              <TagInput label="Block a brand" placeholder="e.g. Crowd Pulse" onAdd={(v) => dispatch({ type: "edit", note: `Blocked brand “${v}”.`, fn: (x) => custom({ ...x, blockedBrands: Array.from(new Set([...x.blockedBrands, v])) }) })} />
              <div className="chips" style={{ marginTop: 6 }}>{p.blockedBrands.map((b) => <Chip key={b} onRemove={() => dispatch({ type: "edit", fn: (x) => custom({ ...x, blockedBrands: x.blockedBrands.filter((y) => y !== b) }) })}>{b}</Chip>)}</div></div>
          </div>
          <div>
            {([["shareConversationTopics", "Use this message", "Working tier, in SCWs that grant it"], ["shareInteractionPatterns", "Use earlier messages in this chat", "Episodic tier, in SCWs that grant it"], ["allowPersonalization", "Personalize ads", "Semantic tier, in SCWs that grant it"], ["shareSearchHistory", "Search history", "Advisory only: written into the ChatGPT instruction"]] as const).map(([k, l, d]) => (
              <div key={k} className="row between" style={{ marginBottom: 10 }}><div><div className="small">{l}</div><div className="dim" style={{ fontSize: 11 }}>{d}</div></div>
                <Toggle label={l} on={p.dataControls[k]} onChange={(v) => dispatch({ type: "edit", note: `${l}: ${v ? "on" : "off"}.`, fn: (x) => custom({ ...x, dataControls: { ...x.dataControls, [k]: v } }) })} /></div>
            ))}
          </div>
          <div>
            {([["maxAdsPerHour", "Max ads per hour", 0, 20], ["maxAdsPerDay", "Max ads per day", 0, 100], ["minRelevanceThreshold", "Minimum relevance %", 50, 100]] as const).map(([k, l, lo, hi]) => (
              <div key={k} className="field"><label className="lbl">{l}: <b className="num">{p.sessionLimits[k]}</b></label>
                <input type="range" min={lo} max={hi} value={p.sessionLimits[k]} aria-label={l} onChange={(e) => { const v = +e.target.value; dispatch({ type: "edit", key: `lim-${k}`, fn: (x) => custom({ ...x, sessionLimits: { ...x.sessionLimits, [k]: v } }) }); }} /></div>
            ))}
            <div className="dim" style={{ fontSize: 11 }}>The simulator has no clock: it applies the hourly limit as a per-session cap, together with each world's own limit. The daily cap is written into the ChatGPT instruction only.</div>
          </div>
        </div>
      </Panel>
      <Panel kicker="Step 1 · enforced by ChatGPT" title="Check ChatGPT's own settings" sub="Only these are enforced by ChatGPT. Names as of 12 October 2026; ChatGPT may rename them.">
        {["Settings › Ad controls: set “Personalize ads” to match this app's Personalize ads switch, and turn off “Past chats and memory” if no world here uses memory.", "Settings › Ad controls › “View History and Topics”: review the topics ChatGPT inferred, and use “Delete ads data” to clear what you do not want used.", "Settings › Personalization › Memory: turn off “Reference saved memories” and “Reference chat history” if you want no memory used at all.", "Use a Temporary Chat for anything you would put in a No-ads world: Temporary Chats show no ads.", "On any ad, the ••• menu offers “Hide ad”, “Report ad” and “About this ad”.", "Settings › Data controls › Export data, from time to time, to see what is stored about you."].map((t, i) => <div key={i} className="step"><span className="ic" style={{ background: "#34d39922", color: "#34d399" }}>{i + 1}</span><div className="small">{t}</div></div>)}
      </Panel>
      <Panel kicker="Step 2 · advisory" title="Paste this instruction into ChatGPT" sub="For custom instructions or the start of a chat. ChatGPT may follow it; it is not bound by it."
        right={<button className="btn sm" onClick={() => copy("instr", instr)}>{copied === "instr" ? <Check size={13} /> : <Copy size={13} />}{copied === "instr" ? "Copied" : copied === "instr-fail" ? "Select & copy" : "Copy"}</button>}>
        <textarea readOnly value={instr} rows={12} aria-label="ChatGPT instruction" onFocus={(e) => e.currentTarget.select()} />
        <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>Start each chat with “World: name” (for example “World: Work”) so ChatGPT knows which rules apply.</div>
      </Panel>
      <Panel kicker="Step 3 · portable" title="Export profile" sub={`Version ${EXPORT_VERSION} · includes the memory model, the invariants and the instruction.`}
        right={<><button className="btn sm" onClick={() => copy("json", json)}>{copied === "json" ? <Check size={13} /> : <Copy size={13} />}{copied === "json" ? "Copied" : "Copy"}</button><button className="btn sm ghost" onClick={download}><Download size={13} />Download</button></>}>
        <textarea readOnly value={json} rows={12} aria-label="Exported profile JSON" onFocus={(e) => e.currentTarget.select()} />
      </Panel>
      <Panel kicker="Restore" title="Import profile" sub="Only profiles exported by this app (version 1.x or 2.x). Older tier names are converted; legacy L4 grants are dropped.">
        <textarea value={imp} rows={8} aria-label="Profile JSON to import" placeholder='{"version":"2.0.0","profile":{…}}' onChange={(e) => setImp(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}><button className="btn pri" disabled={!imp.trim()} onClick={doImport}><Upload size={14} />Import configuration</button></div>
        {msg && <p className="small" role={msg.ok ? "status" : "alert"} style={{ color: msg.ok ? "#34d399" : "#f87171" }}>{msg.text}</p>}
      </Panel>
    </div>
  );
};

// ============================================================================
// 8. APP SHELL
// ============================================================================

const NAV: { id: PageId; label: string; icon: React.ReactNode; title: string; sub: string }[] = [
  { id: "overview", label: "Overview", icon: <LayoutGrid size={16} />, title: "Your ad privacy boundary", sub: "Split your ChatGPT use into Structured Context Worlds (SCWs) and decide what each one may let advertisers see." },
  { id: "map", label: "Latent Map", icon: <MapIcon size={16} />, title: "Latent map", sub: "Your sealed core, memory tiers and SCWs, with fictional advertisers probing the boundary in real time." },
  { id: "studio", label: "SCW Studio", icon: <SlidersHorizontal size={16} />, title: "SCW Studio", sub: "Design each context world: mode, tiers, categories, limits and blocked topics." },
  { id: "simulate", label: "Simulator", icon: <Zap size={16} />, title: "Simulator", sub: "Chat as you would in ChatGPT and watch each rule decide." },
  { id: "lens", label: "Advertiser Lens", icon: <Eye size={16} />, title: "Advertiser lens", sub: "Your message on one side, the exact payload that crosses the boundary on the other." },
  { id: "memory", label: "Memory", icon: <Brain size={16} />, title: "Memory tiers", sub: "Maxey0's five typed tiers and the evidence-gated promotion gate." },
  { id: "learn", label: "Learn SCWs", icon: <BookOpen size={16} />, title: "Learn logical SCWs", sub: "A five-minute introduction to Structured Context Worlds." },
  { id: "apply", label: "ChatGPT settings", icon: <Megaphone size={16} />, title: "ChatGPT settings", sub: "Global controls, the settings ChatGPT enforces, and your portable profile." },
];

export default function Maxey0SCWsForChatGPTAds() {
  const [s, dispatch] = useReducer(reducer, undefined, initialState);
  const [page, setPage] = useState<PageId>("overview");
  const [draft, setDraft] = useState<{ text: string; gateId: string | null }>({ text: "", gateId: null });
  const score = privacyScore(s.profile);
  const topRef = useRef<HTMLDivElement>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  const go = useCallback((p: PageId) => { setPage(p); topRef.current?.scrollIntoView?.({ block: "start" }); }, []);
  useEffect(() => { if (first.current) { first.current = false; return; } h1Ref.current?.focus({ preventScroll: true }); }, [page]);
  const simPrefill = useCallback((text: string, gateId: string) => { setDraft({ text, gateId }); go("simulate"); }, [go]);
  useEffect(() => { if (!s.toast) return; const t = setTimeout(() => dispatch({ type: "toast", msg: null }), 2600); return () => clearTimeout(t); }, [s.toast]);
  const meta = NAV.find((n) => n.id === page)!;
  const props: PageProps = { s, dispatch, go, simPrefill };
  return (
    <div className="mx" ref={topRef}>
      <style>{CSS}</style>
      <nav className="mobnav" aria-label="Sections">{NAV.map((n) => <button key={n.id} aria-current={page === n.id ? "page" : undefined} onClick={() => go(n.id)}>{n.label}</button>)}</nav>
      <div className="shell">
        <aside className="side">
          <div className="brand"><img className="logo" src={MAXEY0_LOGO} alt="Maxey0 logo" width={40} height={40} /><div><b>Maxey0 SCW Privacy</b><span>for ChatGPT ads</span></div></div>
          <nav className="nav" aria-label="Sections">{NAV.map((n) => <button key={n.id} aria-current={page === n.id ? "page" : undefined} onClick={() => go(n.id)}>{n.icon}{n.label}{n.id === "map" && <small>live</small>}</button>)}</nav>
          <div className="stat" style={{ marginTop: 8 }}><div className="k">Privacy score</div><div className="row" style={{ gap: 8 }}><span className="big num">{score}</span><div style={{ flex: 1, height: 6, borderRadius: 6, background: "#1a1f42", overflow: "hidden" }}><div style={{ width: `${score}%`, height: "100%", background: "linear-gradient(90deg,#22d3ee,#7c8cff)", transition: "width .5s" }} /></div></div></div>
          <div className="sidefoot">Runs entirely on this page. No server, no storage. Advertisers are fictional. App version {APP_VERSION} · profile format {EXPORT_VERSION}.</div>
        </aside>
        <main>
          <div className="top">
            <div className="grow"><h1 ref={h1Ref} tabIndex={-1}>{meta.title}</h1><p>{meta.sub}</p></div>
            <span className="pill mobscore" title="Privacy score">Score <b className="num" style={{ color: "#e8ebff" }}>{score}</b></span>
            <span className="pill"><Shield size={13} />{MODES.map((m) => { const n = s.profile.scwGates.filter((g) => g.gateType === m.id).length; return n ? <span key={m.id} style={{ color: m.color }}>{n} {m.label.toLowerCase()}</span> : null; })}</span>
            <button className="btn sm" onClick={() => dispatch({ type: "undo" })} disabled={!s.past.length}><Undo2 size={13} />Undo</button>
          </div>
          {page === "overview" && <Overview {...props} />}
          {page === "map" && <LatentPage {...props} />}
          {page === "studio" && <StudioPage {...props} />}
          {page === "simulate" && <SimulatePage {...props} draft={draft} setDraft={setDraft} />}
          {page === "lens" && <LensPage {...props} />}
          {page === "memory" && <MemoryPage {...props} />}
          {page === "learn" && <LearnPage {...props} />}
          {page === "apply" && <ApplyPage {...props} />}
        </main>
      </div>
      {s.toast && <div className="toast" role="status"><Info size={15} color="#a5b4fc" />{s.toast}</div>}
    </div>
  );
}

// Exported for tests.
export { classifyText, evaluateTurn, importProfile, exportProfile, privacyScore, gateExposure, normalizeMemoryTiers, PRESETS, CORPUS, INVENTORY };
