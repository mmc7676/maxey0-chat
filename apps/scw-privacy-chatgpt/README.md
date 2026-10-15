# Maxey0 SCWs for ChatGPT Ads

**A privacy-first ad boundary for ChatGPT Free and Go users, built on Maxey0 logical Structured Context Worlds (SCWs).**

A Structured Context World (SCW) is a bounded, addressable context space with explicit rules for what may enter and leave it. A *logical* SCW draws that boundary as a declarative policy object rather than a process or sandbox, so it works even where you do not control the runtime. ChatGPT advertising is one application of logical SCWs, and this app is that application.

You split your ChatGPT use into context worlds (Work, Learning, Everyday, or your own). For each world you decide which kinds of memory an ad system may read, which ad categories are acceptable, and how many ads you will tolerate. The app then shows you exactly what would cross each boundary, and what never can.

It is one React file written in TypeScript (`Maxey0-SCWs_For_ChatGPT_Ads.tsx`, version 3.1, released 2026-10-01). It runs entirely in the page: there is no server, no storage and no network request. Every advertiser in it is fictional.

> **What this app can and cannot do**
>
> Inside the app, every release decision is made by one evaluator, which drives the simulator, the replay grid, the Studio previews and the Advertiser Lens. The privacy score, the exposure flow and the Latent Map read the evaluator's own per-tier rule, so they cannot show a channel open that the evaluator keeps closed.
>
> In ChatGPT, only ChatGPT's own settings are enforced. The instruction and profile you export are **advisory**: ChatGPT may follow them, but it is not bound by them. The app says this wherever it matters.

---

## Contents

1. [Quick start](#quick-start)
2. [Core ideas](#core-ideas)
3. [User guide, page by page](#user-guide-page-by-page)
4. [Applying your boundary to ChatGPT](#applying-your-boundary-to-chatgpt)
5. [Profile file format](#profile-file-format)
6. [How decisions are made](#how-decisions-are-made)
7. [Privacy](#privacy)
8. [Limitations](#limitations)
9. [Publishing and running it](#publishing-and-running-it)
10. [Verification](#verification)
11. [Reproducing the results](#reproducing-the-results)
12. [Research and citation](#research-and-citation)
13. [Credits and license](#credits-and-license)

---

## Quick start

1. Open the app. It starts on the **Balanced** preset: Work is sealed, and Learning and Everyday allow contextual ads from the current chat only.
2. On **Overview**, pick **Strict**, **Balanced** or **Open**, and watch the privacy score, the exposure flow and the replay grid update.
3. Open **Latent Map** and click a world to edit it live.
4. In the **Simulator**, tap the quick prompts *My doctor changed my medication* and *My name is Sam, email sam@example.com*, and read the trace for each.
5. On **Apply to ChatGPT**, work through ChatGPT's own settings, then copy the instruction and export your profile.

Every change to your settings can be undone with **Undo** (the last 40 changes are kept; typing in one field or dragging one slider counts as one change). Applying a preset or importing a profile also clears the simulator's chat sessions; Undo restores the settings but not the sessions.

---

## Core ideas

### Logical SCW

An SCW in this app is a named boundary around one kind of conversation. It is written as a declarative object, one pure function (the evaluator) decides what leaves it, and a fixed set of invariants overrides every setting. Each SCW declares:

| Field | Meaning |
|---|---|
| Mode | **Sealed** (nothing leaves), **Contextual** (topic labels from this chat only; your interests are never read), **Review** (like Open, but a matched ad is held until you approve it) or **Open** (every tier you grant may be used, including your interests) |
| Memory tiers | Which of Working, Episodic and Semantic the ad system may read in this world |
| Ad categories | Technology, Business, Education, Lifestyle; a category is usable only if it is also allowed in the global list on **Apply to ChatGPT** |
| Sharing | Whether this chat's topics, and your stated interests, may be used here |
| Limits | Max ads per session and a minimum relevance score |
| Blocked topics | Words or phrases that suppress the whole turn when mentioned; earlier turns and interests that mention them are never reused |

Chats in different SCWs cannot see each other: each world keeps its own session history.

### Five typed memory tiers (Maxey0)

Memory is typed by **kind**, not by how long it lasts.

| Tier | Holds | In ChatGPT | Ad-readable? |
|---|---|---|---|
| **Working** | Volatile in-flight state | The message you are writing now | If granted, with "Share this chat's topics" on for the world and "Share current-message topics" on globally |
| **Episodic** | Turn chains, session summaries | Earlier turns in the current chat | If granted, with "Share this chat's topics" on for the world and "Share this-session topics" on globally |
| **Semantic** | Concept graph: concepts, interests | Saved memory, what ChatGPT draws from past chats, and the interests the ad system inferred | If granted, in an Open or Review world, with "Use my interests" on for the world and globally |
| **Persistent** | Durable facts, versioned preferences | Account identity, profile, settings | **Never** |
| **Procedural** | Skills and instructions | Custom instructions and this profile | **Never** |

In Maxey0, items move between tiers only through the evidence-gated **promotion gate**, which checks relevance, evidence, consistency, reuse and policy; items that fail go to quarantine to be repaired or forgotten. The Memory page illustrates the gate. The app does not run it: it never moves anything between tiers on its own, and every interest is one you entered.

### The five invariants

These hold in every SCW, whatever you set:

| ID | Rule |
|---|---|
| INV-1 | Identity cues (email, phone, name) and age, occupation, income and location cues are never released from a message or an interest, in any SCW. |
| INV-2 | Demographic and behavioral data are never released; the flags are fixed to off. |
| INV-3 | A sensitive topic (health, mental health, politics, religion, sexuality, financial hardship) suppresses the whole turn: nothing is released and no ad is shown. Sensitive earlier turns and interests are never reused. |
| INV-4 | Persistent and Procedural memory can never be granted to an SCW. |
| INV-5 | The ad system receives topic labels and their categories only (vocabulary words or your bounded interests): never message text, the text of earlier turns, or identity. |

---

## User guide, page by page

### Overview
- **Start here.** Three steps: pick a preset, try a message, copy it to ChatGPT.
- **Privacy score dial.** `score = 100 × (1 − mean world exposure)`. A world's exposure is its mode weight (Sealed 0, Review 0.6, Contextual 0.8, Open 1) × the sum of the weights of its open channels (Working 0.2, Episodic 0.3, Semantic 0.5). A channel is open when the world may read that tier (see [How decisions are made](#how-decisions-are-made)), shares at least one allowed category with the global list, and has an ad limit above zero. The presets score 95 (Strict), 73 (Balanced) and 23 (Open).
- **Preset switch.** Applying a preset keeps your interests and blocked brands. Editing anything afterwards marks the profile *Custom*.
- **Exposure flow.** Every memory tier and identity cue is linked to every world, and each world to *Advertiser* or *Withheld*. Each band is one channel: solid bands into a world are open, dashed ones closed, and a world's band to *Advertiser* is as wide as its open channels (labels only). Hover a tier or a world, or focus a world with the keyboard, to highlight its paths; select a world to edit it.
- **Replay grid.** 18 synthetic test prompts × every world. Each cell is a full evaluator run, marked by color and by a short code: AD (ad served), HOLD (held for review), TAG (labels only), CAP (ad budget reached), SEAL (sealed), OFF (suppressed, sensitive), BLK (suppressed, blocked topic) or a dash (nothing to release). The *Invariant breaches* chip should always read 0. Select any cell to open it in the Simulator.

### Latent Map
An animated canvas of your whole boundary:
- **Center:** you, with your privacy score.
- **Sealed core:** Persistent and Procedural, locked.
- **Three rings:** Semantic, Episodic and Working. Each is labeled with how many worlds it is granted to, and grows brighter as that number grows.
- **Orbiting worlds:** your SCWs, colored by mode, with small markers showing which tiers each is granted. Colored channels run to the tiers it is granted: solid with moving particles when the channel is open, dashed when it is granted but closed.
- **Outer diamonds:** nine fictional advertisers, colored by category. They continuously fire *probes* at your worlds. A probe asks whether an ad of its category could be served from a world's current message: it is admitted (green burst) only if that world's Working channel is open, the category is allowed there and globally, and the brand is not blocked. Otherwise it deflects at the membrane (red). Live counters sit above the map. The map does not model Episodic, Semantic, relevance, budget or the review hold.

Hover anything for details. Click a world, or choose it in the world selector, to open its editor. **Pause** stops the animation; if your system asks for reduced motion, the map stays still.

### SCW Studio
- **Tier grants grid:** every tier × every world as a switch. Persistent and Procedural show as *locked*. A granted tier that cannot flow is marked *inactive*, with the reason.
- **One card per world:** name, mode, tiers, categories, sharing switches, ad limit, relevance floor and blocked topics. Each card has a live preview of a fixed test message (*Help me learn Python for a data science course and plan a trail running trip*) and an *Open in simulator* button. A world left without a name becomes *Untitled SCW*.
- **New SCW** adds a world (up to 12). The bin icon deletes one; at least one must remain.

### Simulator
Choose a world, then type as you would in ChatGPT, or tap a quick prompt. For each turn you see:
- the outcome and its reason, plus a fictional ad card when one is served (Review mode offers *Show ad* or *Dismiss*)
- **Pipeline trace:** each rule with its result (→ readable, ■ withheld, ✓ passed, ✕ failed) and a legend of rule codes
- **Released:** the labels, each tagged with the tier it came from
- **Withheld:** every signal, with its tier and the rule code that withheld it
- **Isolation at a glance:** the same message evaluated in every world

Earlier turns in the same world become that world's Episodic tier, and ads already shown count against the session budget. **Reset** clears the world's session.

### Advertiser Lens
Choose a world and one of the 18 sample prompts (for example *Help me debug this Rust API server on Linux*). On the left is the sample prompt, with the words that would be released to the ad system highlighted, and its trace. On the right is the complete payload the ad system would receive under that world, with `user_id`, `message_text`, `history`, `demographics` and `location` always `null`. When a turn makes no ad request (sealed, suppressed, blocked, capped or nothing to release), the Lens says *No ad request is made for this message* instead. The payload format is this app's illustration; ChatGPT's real ad request format is not public.

### Memory
The promotion gate (illustrated, not executed), a card for each of the five tiers, and your **stated interests**, which make up the Semantic tier. Add several at once by separating them with commas. Each interest can be at most 40 characters and four words, because it may be released as a label, and is refused if it contains an email address, a phone number, an age, or a phrase such as “my name is”, “I work as” or “I live in”. Detection is pattern-based: a bare name or place (for example “Denver hiking”) is not recognized, so do not put personal details in interests. Interests are colored by the category the classifier assigns. Sensitive or unclassified interests are never released.

### Learn SCWs
Five short lessons on logical SCWs, each linking to the page that shows it working, plus the five invariants and an *Honest limits* panel.

### Apply to ChatGPT
Global controls, three steps, and an import panel. [Applying your boundary to ChatGPT](#applying-your-boundary-to-chatgpt) explains each step.

| Control | What it does in this app |
|---|---|
| Ad categories allowed anywhere | Intersected with each world's categories |
| Blocked brands | Matching fictional advertisers are never served |
| Share current-message topics | Required for the Working tier |
| Share this-session topics | Required for the Episodic tier |
| Use my interests | Required for the Semantic tier |
| Allow search history | **Advisory only**: written into the ChatGPT instruction; the simulator does not model search |
| Max ads per hour | The simulator has no clock, so it applies this as a per-session cap, together with each world's own limit |
| Max ads per day | **Advisory only**: written into the instruction |
| Minimum relevance % | Combined with each world's floor (the higher one applies) |

---

## Applying your boundary to ChatGPT

The app gives you three channels, and they carry different force.

1. **ChatGPT's own settings (enforced by ChatGPT).** Only these change what ChatGPT's systems actually do. Menu names change, so look under Settings for personalization, memory, data controls and ads. Consider:
   - memory and chat-history reference, if you do not want the Semantic tier used at all
   - ad personalization controls where your account shows them, and clearing ad-interest data you do not want used
   - Temporary Chat for anything you would put in a sealed world
   - exporting your data from time to time to see what has been stored
2. **The instruction (advisory).** Copy it into custom instructions or the start of a chat. It states each world's rule, the invariants, categories, blocked brands and limits. Start each chat with `World: <name>` (for example `World: Work`) so ChatGPT knows which rules apply; the instruction asks ChatGPT to use the strictest world when none is named. ChatGPT may take it into account in conversation, but it cannot change how ads are selected.
3. **The profile file (portable).** Your whole configuration as JSON, for backup, sharing or a future platform that enforces SCWs. The **Import profile** panel restores one.

---

## Profile file format

Export writes profile format `2.0.0`. The format version is separate from the app version (3.1), which is recorded in `appVersion`. An abbreviated example, with one of the three worlds shown:

```json
{
  "version": "2.0.0",
  "app": "Maxey0 SCWs for ChatGPT Ads",
  "appVersion": "3.1",
  "exportedAt": "2026-10-01",
  "memoryModel": "Maxey0 five typed tiers: Working, Episodic, Semantic, Persistent, Procedural. ...",
  "invariants": ["INV-1: ...", "INV-2: ...", "INV-3: ...", "INV-4: ...", "INV-5: ..."],
  "profile": {
    "privacyLevel": "balanced",
    "interests": [],
    "blockedBrands": [],
    "allowedCategories": ["technology", "education", "lifestyle"],
    "scwGates": [
      {
        "id": "scw-…",
        "name": "Learning",
        "gateType": "contextual",
        "allowedCategories": ["education", "technology"],
        "blockedTopics": [],
        "maxAdsPerSession": 2,
        "requireRelevanceScore": 80,
        "memoryTierAccess": ["Working", "Episodic"],
        "dataSharing": { "conversationContext": true, "userPreferences": false, "behavioralData": false, "demographicData": false }
      }
    ],
    "sessionLimits": { "maxAdsPerHour": 4, "maxAdsPerDay": 15, "minRelevanceThreshold": 75 },
    "dataControls": { "shareConversationTopics": true, "shareSearchHistory": false, "shareInteractionPatterns": true, "allowPersonalization": false }
  },
  "chatgptInstruction": "Maxey0 SCW privacy profile (advisory). ..."
}
```

`gateType` values map to modes: `block` = Sealed, `contextual` = Contextual, `review` = Review, `allow` = Open.

**Import** accepts only profiles exported by this app: a JSON object with `version` 1.x or 2.x and a `profile` containing at least one SCW in `scwGates`, plus `sessionLimits` and `dataControls`. Anything else is rejected with an *Invalid profile format* message.

On import:
- **Legacy tier names are converted:** `Scratchpad (L1)` → Working, `Episodic (L2)` → Episodic, `Persistent (L3)` → Semantic. `Permanent (L4)`, Persistent, Procedural and unknown names are dropped, and the message tells you how many were removed.
- **Behavioral and demographic flags are forced to `false`.**
- **Values are cleaned up:** limits are clamped to the ranges the interface allows (ads per hour 0–20, per day 0–100, relevance floors 50–100, ads per session 0–10); unknown categories are dropped; interests longer than 40 characters or four words, or containing an identity, age, job, income or location cue, are dropped; names are trimmed to 40 characters; at most 12 SCWs are kept; and duplicate SCW ids are re-issued.

---

## How decisions are made

For one message in one world, the evaluator runs these steps in order and stops at the first one that ends the turn:

1. **INV-1:** identity, demographic and location cues go into the withheld ledger.
2. **INV-3:** a sensitive topic ends the turn as *suppressed*.
3. **Blocked topic:** a match in the current message ends the turn as *blocked*.
4. **Mode:** a sealed world ends the turn as *sealed*.
5. **Tiers:**
   - **Working:** labels from the current message
   - **Episodic:** labels from earlier turns in this world, skipping any turn that was sensitive or mentions a blocked topic
   - **Semantic:** your interests, in Open and Review worlds only; each is checked in turn for an identity cue, a sensitive topic, a blocked topic, its length and its category

   Each tier needs its grant and its sharing switches, and each label's category must be allowed by both the world and the global list.
6. **Nothing released:** the outcome is *none*.
7. **Budget:** the lower of the world's per-session limit and the hourly limit. If it is already spent, no ad request is made, the labels are withheld and the outcome is *capped*.
8. **Relevance:** the best fictional ad scores `55 + 20 × matched labels (+10 if matched from the current message)`, capped at 100, and must reach the higher of the two relevance floors; otherwise the outcome is *labels*.
9. **Review mode** holds the matched ad until you approve it (*held*); otherwise it is served (*ad*).

Every withheld signal carries one rule code: `INV-1`, `INV-3` or `INV-4` (invariants; INV-2 and INV-5 hold by construction, because the behavioral and demographic flags are never read and no text is ever released), `BLOCK` (blocked topic), `SEALED` (sealed world), `NO-GRANT` (tier not granted), `SHARE-CTX`, `SHARE-SESSION` or `SHARE-PREFS` (a sharing switch is off), `CONTEXTUAL` (contextual mode never reads interests), `CATEGORY` (category not allowed), `UNCLASSIFIED` (no ad category), `LENGTH` (an interest over 40 characters or four words) or `BUDGET` (ad budget reached).

The classifier is a deterministic keyword list over four ad categories and six sensitive classes, with a small list of neutral compounds such as "technical debt" and "upvote", and pattern checks for email addresses, phone numbers (grouped 3-3-4 or international formats), name phrases ("my name is", "call me"), age, occupation or income, and location. It is inspectable, but it misses paraphrase.

---

## Privacy

- **Nothing leaves the page unless you copy or download it.** No server, no analytics, no storage. Everything you type lives in memory and is gone when you close the page.
- **No personal data is built in.** The app contains no user data. The test prompts are synthetic, and the advertisers are fictional; their names were invented for this app, and any match with a real company is coincidental.
- **Clipboard and download only when you ask.** Copy puts the instruction or profile on your clipboard, and Download saves the profile as a JSON file. Both happen only when you click them.

---

## Limitations

- **Not binding on ChatGPT.** It cannot make ChatGPT, or its ad system, honor your SCWs. Only ChatGPT's own settings bind ChatGPT.
- **A model, not the real ad system.** It shows what your policy would let an ad system read, not what OpenAI's system actually reads. OpenAI also uses signals, such as general location and language, that no user-side policy can withhold.
- **Keyword classifier.** It misses paraphrase and can misfire on words used out of context. A sensitive topic it misses is not suppressed.
- **Pattern-based identity detection.** Email addresses, phone numbers, ages and phrases such as “my name is” or “I live in” are caught; a bare name or place is not. Only vocabulary labels ever leave a message, but an interest is released as you typed it, so a name or place written into an interest could be released under Open. (The app's own interest hint, which says names, jobs and locations are refused, is broader than the detection.)
- **Illustrative scoring.** The privacy score is this app's own formula, shown on the page, not an industry standard.
- **Not everything is simulated.** Search history and the daily ad cap are written into the instruction but not simulated, and the hourly cap acts as a per-session cap.
- **No export reader or memory editor in the page.** This version does not read your ChatGPT data export, edit saved memories or keep a profile on your device. The research replay of a real export was run offline with the same evaluator; see [Verification](#verification).

---

## Publishing and running it

**As a claude.ai artifact.** Paste the file into a React artifact, or ask Claude to publish it. It imports only `react` and `lucide-react`, both available in the artifact runtime, and carries its own CSS. It does not use Tailwind, shadcn/ui or browser storage.

**In your own React project** (React 18+, with a TypeScript-aware bundler such as Vite or esbuild):

```bash
npm install react react-dom lucide-react
```

```tsx
import App from "./Maxey0-SCWs_For_ChatGPT_Ads";
export default function Page() { return <App />; }
```

**Using the engine without the UI.** These are named exports: `classifyText`, `evaluateTurn`, `importProfile`, `exportProfile`, `privacyScore`, `gateExposure`, `normalizeMemoryTiers`, `PRESETS`, `CORPUS` and `INVENTORY`.

```ts
import { PRESETS, evaluateTurn } from "./Maxey0-SCWs_For_ChatGPT_Ads";
const p = PRESETS.balanced.build();
const r = evaluateTurn(p, p.scwGates[1], "Explain Bayesian statistics with a worked example");
console.log(r.outcome, r.released, r.withheld);
```

---

## Verification

Evidence for version 3.1 (file SHA-256 `1fb101c72b34cc5a164794dd747da4648e8b0ae0bb79beff8b764d767ce6ca2c`). Every version 3.1 result below was produced on this exact file on 2026-10-01; the version 3 comparison figure comes from the same test run against the version 3 build.

| Check | Result |
|---|---|
| TypeScript, strict mode with `noUnusedLocals` | 0 errors |
| Engine checks in the browser build | 15 of 15 pass (presets score 95, 73 and 23; 0 breaches) |
| Browser checks (headless Chromium, 1440 px; all eight pages again at 400 px) | 19 of 19 pass (every page, map and probes, selection from the map, score, locked tiers, undo, simulator, Lens, Memory, Learn, export, import); 0 script errors; no horizontal overflow at 400 px |
| Seeded property test (20,000 random profiles, worlds, messages, histories and interests, at seeds 0x5c3a and 0x1234) | 0 violations of 23 per-case checks: invariants, blocked topics, tier grants, sharing switches, modes, categories, relevance, budget, blocked brands, ledgering, determinism |
| Mutation check (13 injected faults, 5,000 cases each) | All 13 caught |
| Synthetic prompts, with interests including *therapy* and *sam@example.com rust* | 0 breaches under every preset (version 3 had 28 under Open) |
| Replay of one real ChatGPT export (602 chats, 9,295 user messages), run on the owner's computer on 2026-10-01, aggregate counts only | 0 invariant breaches in all 18 runs (3 presets × 3 worlds, with and without interests); all 43 chats flagged sensitive suppressed in every world |

An independent review of version 3 found eight defects, all fixed here: identity-shaped interests could be released, blocked topics could be released from earlier turns or interests, contextual and open worlds behaved alike, a spent budget still released labels, a blocked topic was reported as a sensitive suppression, the map used its own copy of the per-tier rule, the Lens showed a request for turns that make none, and a profile with no SCWs crashed the Lens.

**Not yet verified:** rendering inside the claude.ai artifact viewer itself.

---

## Reproducing the results

The scripts are in `tests/`. Each imports the app from a copy in the same folder, so first copy the app there under both names it uses:

```bash
cp Maxey0-SCWs_For_ChatGPT_Ads.tsx tests/app.tsx
cp Maxey0-SCWs_For_ChatGPT_Ads.tsx tests/target.tsx
cd tests
npm install esbuild@0.24.2 typescript react react-dom lucide-react playwright
```

| What | Command | Expected |
|---|---|---|
| Type check | `npx tsc -p tsconfig.json` | 0 errors |
| Property test | `npx esbuild prop.ts --bundle --platform=node --outfile=prop.cjs && SEED=0x5c3a N=20000 node prop.cjs` | 750 released, 168,781 withheld, 5,356 suppressed, 1,251 blocked, 684 capped, 134 ads, no violations |
| Mutation check | `python3 mutate.py` (rewrites `target.tsx` for each fault and restores it at the end) | caught 13 of 13 |
| Synthetic prompts | `npx esbuild corpus.ts --bundle --platform=node --alias:react=./stub.js --alias:lucide-react=./stub.js --tsconfig-raw={} --outfile=corpus.cjs && node corpus.cjs` | scores 95, 73, 23; released 6, 39, 61; breaches 0 |
| Real-export driver | `npx esbuild audit.ts --bundle --platform=node --alias:react=./stub.js --alias:lucide-react=./stub.js --tsconfig-raw={} --outfile=audit.cjs && node audit.cjs <your unzipped export folder>` | aggregate counts only; with esbuild 0.24.2 the bundle's SHA-256 is `2dadeb8a04028a249b1327869a3506f945f3e1e17b02af88a58f6720fac31029` |
| Engine and browser checks | `npx esbuild main.tsx --bundle --outfile=out/app.js --define:process.env.NODE_ENV='"production"' && node t.mjs` | JSON in which every check is `true` except these expected values: `eduAd: "ad"`, `normalize` (a string listing `Working` and `Semantic`), `invariantBreaches: 0`, `scores: [95, 73, 23]`, `studioCards: 3`; and `"errors": []` |

`t.mjs` launches Chromium from `/opt/pw-browsers/chromium`; change `executablePath` to your own Chromium, and note that it writes screenshots into the folder. `mutate.py` runs `node` with a fixed `PATH` of `/usr/bin:/bin:/usr/local/bin`. The two Node bundles that alias React to `stub.js` pass `--tsconfig-raw={}` so that the folder's `tsconfig.json` (used only by the type check and the browser build) does not switch them to the automatic JSX runtime. The real-export driver reads only `conversations*.json` files and prints counts; run it on your own export only.

---

## Research and citation

This app accompanies the paper *Logical Structured Context Worlds: Exact Context Boundaries Without a Runtime* (version 3.1, 2026-10-01), which defines logical SCWs, uses ChatGPT advertising privacy as their first application, and reports the tests above.

```
Cohan, M., and Maxey0-Claude. "Logical Structured Context Worlds: Exact Context Boundaries
Without a Runtime," version 3.1. Maxey0, 1 October 2026.

Cohan, M., and Maxey0-Claude. "Maxey0 SCWs for ChatGPT Ads," version 3.1. Software,
Maxey0-SCWs_For_ChatGPT_Ads.tsx. Maxey0, 1 October 2026.
```

---

## Credits and license

- **Concept, architecture and direction:** Mike Cohan (Human0), Maxey0.
- **Version 1:** Maxey1 (Claude Sonnet 4.6).
- **Versions 2 through 3.1:** Maxey0-Claude (Claude Opus 5.5), the orchestrating agent of the Maxey0 project.
- **Contact:** human@maxey0.com.

License: *to be chosen by the author before public release.*

ChatGPT is a trademark of OpenAI. This project is independent and not affiliated with or endorsed by OpenAI.
