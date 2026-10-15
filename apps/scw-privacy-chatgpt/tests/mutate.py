import subprocess, json, sys
src = open("app.tsx").read()
M = {
 "drop INV-3 suppression": [('  if (cls.sensitive) {\n    steps.push({ id: "INV-3"', '  if (false && cls.sensitive) {\n    steps.push({ id: "INV-3"')],
 "drop sealed mode": [('  if (g.gateType === "block") {\n    steps.push({ id: "MODE"', '  if (false) {\n    steps.push({ id: "MODE"'), ('  if (g.gateType === "block" || !AD_GRANTABLE.has(t)', '  if (!AD_GRANTABLE.has(t)')],
 "ignore personalization flags": [('  return g.gateType !== "contextual" && g.dataSharing.userPreferences && p.dataControls.allowPersonalization;', '  return g.gateType !== "contextual";')],
 "drop category rule": [('    if (!allowedCats.has(category)) return withheld.push(', '    if (false) return withheld.push(')],
 "allow sealed-tier grants": [('    if (AD_GRANTABLE.has(tier) && !out.includes(tier)) out.push(tier);', '    if (!out.includes(tier)) out.push(tier);')],
 "review serves ads": [('  if (g.gateType === "review") return done("held"', '  if (false) return done("held"')],
 "drop interest length guard": [('    if (!interestBounded(i)) return withheld.push', '    if (false) return withheld.push')],
 "drop interest identity guard (INV-1)": [('    if (c.personal.length) return withheld.push({ label: "interest with an identity cue"', '    if (false) return withheld.push({ label: "interest with an identity cue"')],
 "drop blocked-topic check on earlier turns": [('    if (c.sensitive || isBlocked(h)) return', '    if (c.sensitive) return')],
 "drop blocked-topic check on interests": [('    if (isBlocked(i)) return withheld.push', '    if (false) return withheld.push')],
 "drop sensitive check on earlier turns": [('    if (c.sensitive || isBlocked(h)) return', '    if (isBlocked(h)) return')],
 "contextual reads Semantic": [('  return g.gateType !== "contextual" && g.dataSharing.userPreferences', '  return g.dataSharing.userPreferences')],
 "release labels over budget": [('    released.splice(0).forEach((r) => withheld.push({ label: r.label, tier: r.tier, rule: "BUDGET" }));\n', '')],
}
out = {}
for name, edits in M.items():
    t = src
    for a, b in edits:
        assert t.count(a) == 1, (name, a[:60]); t = t.replace(a, b)
    open("target.tsx", "w").write(t)
    subprocess.run(["npx", "esbuild", "prop.ts", "--bundle", "--platform=node", "--outfile=mut.cjs", "--log-level=error"], check=True)
    r = json.loads(subprocess.run(["node", "mut.cjs"], env={"PATH": "/usr/bin:/bin:/usr/local/bin", "N": "5000"}, capture_output=True, text=True).stdout)
    out[name] = sum(r["violations"].values())
    print(f"{name}: {out[name]} violations  {r['violations']}", flush=True)
open("target.tsx", "w").write(src)
print("caught", sum(1 for v in out.values() if v > 0), "of", len(out))
