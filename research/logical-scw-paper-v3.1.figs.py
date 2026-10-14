"""Figures for the v3.1 paper. Writes fig31/f1_object.png, f2_evaluator.png, f3_tiers.png, f6_real.png.
f4_map.png and f5_flow.png are screenshots of the application (new/figshots.mjs)."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Patch
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 9})
ACC = "#7c3a12"; SL = "#3f5566"; INK = "#20242b"; BG = "#f4ecdf"; BD = "#c9b99f"; BG2 = "#e9eef1"; BD2 = "#9fb0bd"
RED = "#f7e1dc"; REDB = "#c98a7c"; REDT = "#8a2a1a"
OUT = "/home/claude/paper/fig31/"


def box(ax, x, y, w, h, title, body="", fc=BG, ec=BD, tc=ACC, fs=9, bfs=7.6, lw=1, gap=0.045, mono=False):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.008,rounding_size=0.012", fc=fc, ec=ec, lw=lw))
    ax.text(x + 0.012, y + h - 0.018, title, ha="left", va="top", fontsize=fs, fontweight="bold", color=tc)
    if body:
        ax.text(x + 0.012, y + h - 0.018 - gap, body, ha="left", va="top", fontsize=bfs, color=INK, linespacing=1.35,
                family="DejaVu Sans Mono" if mono else "DejaVu Sans")


def arrow(ax, a, b, c=SL, style="-|>"):
    ax.add_patch(FancyArrowPatch(a, b, arrowstyle=style, mutation_scale=10, color=c, lw=1.1))


def canvas(w=10, h=4.2):
    f = plt.figure(figsize=(w, h), dpi=200); ax = f.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis("off"); return f, ax


def title(ax, t, y=0.965):
    ax.text(0.5, y, t, ha="center", va="top", fontsize=10.5, fontweight="bold", color=ACC)


# ---------- Figure 1: the object ----------
f, ax = canvas(10, 3.7); title(ax, "A logical SCW: declarative fields under a global invariant set")
box(ax, 0.04, 0.70, 0.92, 0.195, "Global invariants  INV-1 … INV-5   (apply to every SCW; no field can weaken them)",
    "INV-1  identity, age, occupation, income and location cues are never released    ·    INV-2  behavioral and demographic flags fixed off\n"
    "INV-3  a sensitive topic suppresses the turn; sensitive earlier turns and interests are never reused    ·    INV-4  Persistent and Procedural never grantable\n"
    "INV-5  the ad system receives topic labels and categories only: never message text, the text of earlier turns, or identity",
    fc=RED, ec=REDB, tc=REDT, bfs=6.9)
fields = [("mode", "sealed · contextual ·\nreview · open"), ("T  tier grants", "any of Working,\nEpisodic, Semantic"),
          ("σ  sharing", "this chat’s topics ·\nmy interests"), ("C  categories", "∩ the global\nallowed categories"),
          ("B  blocked topics", "block the turn; earlier\nturns and interests that\nmention them are not\nreused"),
          ("λ  limits", "ads per session (at\nmost the hourly limit);\nrelevance floor")]
w = 0.145
for i, (t, b) in enumerate(fields):
    x = 0.04 + i * (w + 0.009)
    box(ax, x, 0.30, w, 0.28, t, b, fc=BG2, ec=BD2, tc=SL, bfs=7.2, gap=0.06)
    arrow(ax, (x + w / 2, 0.70), (x + w / 2, 0.585), c=REDB)
box(ax, 0.04, 0.06, 0.92, 0.155, "One SCW per kind of conversation (Balanced preset shown; up to 12 per profile)",
    "Work: sealed (nothing leaves)     ·     Learning: contextual, Working + Episodic     ·     Everyday: contextual, Working + Episodic",
    fc=BG, ec=BD, gap=0.06)
f.savefig(OUT + "f1_object.png"); plt.close(f)

# ---------- Figure 2: the evaluator ----------
f, ax = canvas(10, 4.4); title(ax, "The evaluator: one pure function decides every turn in every SCW")
tiers = [("Working", "the current message"), ("Episodic", "earlier turns in this SCW;\nsensitive or blocked turns skipped"),
         ("Semantic", "stated interests; read only\nin open and review worlds"), ("Persistent · Procedural", "never read (INV-4)")]
cols = ["#d8f2e6", "#dce8fb", "#fbeccb", "#f2d6d6"]
for i, (t, b) in enumerate(tiers):
    y = 0.72 - i * 0.205
    box(ax, 0.02, y, 0.21, 0.16, t, b, fc=cols[i], ec=BD2, tc=INK, bfs=7.0)
    if i < 3: arrow(ax, (0.23, y + 0.08), (0.27, 0.47))
box(ax, 0.27, 0.30, 0.18, 0.33, "Classifier", "text → vocabulary labels,\neach with an ad category;\nsensitive class;\nidentity-cue kinds\n\nmessage text never\npasses on", fc=BG2, ec=BD2, tc=SL, bfs=7.2)
arrow(ax, (0.45, 0.50), (0.485, 0.50))
box(ax, 0.485, 0.27, 0.265, 0.61, "Rule chain (fixed order)",
    " 1  INV-1: ledger identity cues\n"
    " 2  INV-3: sensitive → suppressed\n"
    " 3  blocked topic → blocked\n"
    " 4  sealed world → sealed\n"
    " 5  Working: grant + sharing\n"
    " 6  Episodic: grant + sharing\n"
    " 7  Semantic: grant + interests on,\n      not contextual; each interest\n      checked INV-1, INV-3, blocked,\n      length, category\n"
    "     every label: category allowed\n      by the world and the profile\n"
    " 8  nothing released → none\n"
    " 9  budget spent → capped\n"
    "10  relevance below floor → labels\n"
    "11  review → held; otherwise ad", fc=BG, ec=BD, bfs=6.7, mono=True, gap=0.05)
outs = [("Released labels", "vocabulary labels or bounded\ninterests, with category\nand source tier"),
        ("Withheld ledger", "every signal not released,\nwith one rule code"),
        ("Outcome", "ad · held · labels · capped ·\nsealed · suppressed ·\nblocked · none")]
for i, (t, b) in enumerate(outs):
    y = 0.66 - i * 0.28
    red = i == 1
    box(ax, 0.78, y, 0.20, 0.20, t, b, fc=RED if red else BG2, ec=REDB if red else BD2, tc=REDT if red else SL, bfs=7.2)
    arrow(ax, (0.75, 0.575), (0.78, y + 0.10))
f.savefig(OUT + "f2_evaluator.png"); plt.close(f)

# ---------- Figure 3: tiers and the promotion gate ----------
f, ax = canvas(10, 3.9); title(ax, "Maxey0 memory: five typed tiers; every move between them passes one evidence-gated gate")
T = [("Working", "in-flight state\nChatGPT: this message", "#d8f2e6", "grantable · w 0.2"),
     ("Episodic", "turn chains, summaries\nChatGPT: this chat", "#dce8fb", "grantable · w 0.3"),
     ("Semantic", "concepts, interests\nChatGPT: memory, past\nchats, inferred ad\ninterests", "#fbeccb", "grantable · w 0.5"),
     ("Persistent", "durable facts, prefs\nChatGPT: account,\nprofile, settings", "#f2d6d6", "never ad-readable"),
     ("Procedural", "skills, instructions\nChatGPT: custom\ninstructions", "#e6dcf6", "never ad-readable")]
for i, (t, b, c, n) in enumerate(T):
    x = 0.02 + i * 0.196
    box(ax, x, 0.50, 0.18, 0.37, t, b + "\n\n" + n, fc=c, ec=BD2, tc=INK, bfs=7.2, gap=0.055)
    arrow(ax, (x + 0.09, 0.50), (x + 0.09, 0.405), c=SL, style="<|-|>")
box(ax, 0.02, 0.255, 0.96, 0.145, "Promotion gate  (governs every move between tiers; nothing skips it)",
    "relevance  ·  evidence  ·  consistency  ·  reuse  ·  policy        all five must pass; Persistent writes also need an evidence chain",
    fc=BG, ec=BD, gap=0.055)
box(ax, 0.30, 0.03, 0.40, 0.13, "Quarantine", "items that fail are repaired or forgotten", fc=RED, ec=REDB, tc=REDT, gap=0.055)
arrow(ax, (0.50, 0.255), (0.50, 0.165), c=REDB)
f.savefig(OUT + "f3_tiers.png"); plt.close(f)

# ---------- Figure 6: one real export (v3.1, policy only: no interests) ----------
R = {"Strict":   {"Work": {"sealed": 555, "suppressed": 43, "blocked": 3},
                  "Learning": {"none": 366, "ad": 74, "labels": 118, "suppressed": 43},
                  "Everyday": {"sealed": 558, "suppressed": 43}},
     "Balanced": {"Work": {"sealed": 555, "suppressed": 43, "blocked": 3},
                  "Learning": {"none": 245, "ad": 264, "labels": 49, "suppressed": 43},
                  "Everyday": {"none": 231, "ad": 275, "labels": 52, "suppressed": 43}},
     "Open":     {"Work": {"none": 272, "held": 239, "labels": 47, "suppressed": 43},
                  "Learning": {"none": 245, "ad": 264, "labels": 49, "suppressed": 43},
                  "Everyday": {"none": 225, "ad": 284, "labels": 49, "suppressed": 43}}}
for pr in R:
    for g in R[pr]:
        assert sum(R[pr][g].values()) == 601, (pr, g)
oc = [("ad", "#d9a441"), ("held", "#e0874a"), ("labels", "#6f93c9"), ("none", "#c9c3b8"),
      ("sealed", "#6aa889"), ("suppressed", "#9a7cc2"), ("blocked", "#cf6fb8")]
f, (a0, a1) = plt.subplots(1, 2, figsize=(10, 3.9), dpi=200, gridspec_kw={"width_ratios": [1.6, 1]})
labels = []; xs = []; x = 0
for pr in R:
    for g in ["Work", "Learning", "Everyday"]:
        b = 0
        for k, c in oc:
            v = R[pr][g].get(k, 0)
            if v: a0.bar(x, v, bottom=b, color=c, width=0.8); b += v
        labels.append(f"{g}\n{pr}"); xs.append(x); x += 1
    x += 0.6
a0.legend(handles=[Patch(color=c, label=k) for k, c in oc], fontsize=7, ncol=4, loc="upper center", bbox_to_anchor=(0.5, -0.2), frameon=False)
a0.set_xticks(xs); a0.set_xticklabels(labels, fontsize=6.5); a0.set_ylabel("chats (601 non-empty)")
a0.set_title("A. Outcome per chat, by world and preset", fontsize=9, color=ACC, loc="left")
for s in ["top", "right"]:
    a0.spines[s].set_visible(False); a1.spines[s].set_visible(False)
cls = ["politics", "health", "religion", "financial\nhardship", "mental\nhealth", "sexuality"]; n = [25, 10, 5, 3, 0, 0]
assert sum(n) == 43
a1.barh(cls[::-1], n[::-1], color="#9a7cc2"); a1.set_title("B. 43 chats suppressed under INV-3", fontsize=9, color=ACC, loc="left"); a1.set_xlabel("chats")
for i, v in enumerate(n[::-1]): a1.text(v + 0.4, i, str(v), va="center", fontsize=7.5)
f.tight_layout(); f.savefig(OUT + "f6_real.png"); plt.close(f)
print("figs ok")
