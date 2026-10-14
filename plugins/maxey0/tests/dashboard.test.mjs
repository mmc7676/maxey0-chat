import { test } from "node:test"; import assert from "node:assert/strict";
import { chromium } from "playwright-core"; import { renderStandalone, example } from "./render.mjs";
const exe = process.env.CHROME || "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
async function open(state, opts = {}) {
  const b = await chromium.launch({ executablePath: exe });
  const p = await b.newPage({ viewport: { width: opts.width || 380, height: 800 }, colorScheme: opts.dark ? "dark" : "light" });
  const errors = []; p.on("pageerror", e => errors.push(String(e)));
  await p.route(/^https?:/, r => r.abort()); // offline: no CDN
  await p.setContent(renderStandalone(state), { waitUntil: "domcontentloaded", timeout: 15000 });
  await p.evaluate(() => { window.__sent = []; window.sendPrompt = t => window.__sent.push(t); });
  return { b, p, errors };
}
const btn = (p, name) => p.getByRole("button", { name, exact: false }).first();
const sent = p => p.evaluate(() => window.__sent);

test("renders example state with correct counts and no script errors", async () => {
  const { b, p, errors } = await open(example());
  const mets = await p.$$eval("#mets .met b", e => e.map(x => x.textContent));
  assert.deepEqual(mets, ["3", "3", "2", "0"]);
  for (const t of ["SCWs", "Agents", "Gates", "Memory", "Ledger", "Plan"]) { await p.locator("#nav button", { hasText: t }).first().click(); assert.ok((await p.$$("#view > *")).length > 0, t); assert.ok(!/\b(null|undefined|NaN)\b/.test(await p.textContent("#m0")), "stray null/undefined on " + t); }
  assert.deepEqual(errors, []); await b.close();
});
test("memory tab shows exactly the five typed tiers, no L1-L4", async () => {
  const { b, p } = await open(example());
  await p.locator("#nav button", { hasText: "Memory" }).click();
  const txt = await p.textContent("#view");
  for (const t of ["working", "episodic", "semantic", "persistent", "procedural"]) assert.ok(txt.includes(t), t);
  assert.ok(!/L[1-4]\b/.test(txt)); await b.close();
});
test("new SCW: empty and duplicate names rejected, valid one staged and applied", async () => {
  const { b, p } = await open(example());
  await btn(p, "Add").click(); assert.equal(await p.textContent("#err"), "Enter a name first");
  await p.fill('input[placeholder="Research notes"]', "maker"); await btn(p, "Add").click();
  assert.equal(await p.textContent("#err"), "That name's already taken");
  assert.equal(await p.locator("text=Apply edits").count(), 0);
  await p.fill('input[placeholder="Research notes"]', "Launch"); await btn(p, "Add").click();
  assert.equal(await p.textContent("#err"), "");
  await btn(p, "Apply edits").click();
  const [m] = await sent(p); assert.ok(m.startsWith("Maxey0: apply "));
  const st = JSON.parse(m.slice("Maxey0: apply ".length));
  assert.equal(st.scws.length, 4); assert.equal(st.scws[3].id, "SCW4"); assert.deepEqual(st.scws[3].tiers, ["working"]);
  await b.close();
});
test("agent binding, gate add/remove and tier toggles are staged into apply", async () => {
  const { b, p } = await open(example());
  await p.locator("#nav button", { hasText: "Agents" }).click();
  await p.locator(".card", { hasText: "Maxey3" }).getByRole("button", { name: "Maker" }).click();
  await p.locator("#nav button", { hasText: "Gates" }).click();
  await btn(p, "Add").click(); assert.equal(await p.textContent("#err"), "Describe the rule first");
  await p.fill('input[placeholder="Send anything outside this world"]', "Use web search"); await btn(p, "Add").click();
  await p.getByRole("button", { name: "Remove gate" }).first().click();
  await p.locator("#nav button", { hasText: "Memory" }).click();
  await p.locator(".card", { hasText: "Maker tier access" }).getByRole("button", { name: "procedural" }).click();
  await btn(p, "Apply edits").click();
  const st = JSON.parse((await sent(p))[0].slice(14));
  assert.deepEqual(st.agents.find(a => a.name === "Maxey3").scws, ["SCW2", "SCW1"]);
  assert.equal(st.gates.length, 2); assert.equal(st.gates[1].rule, "Use web search");
  assert.ok(st.scws[0].tiers.includes("procedural")); await b.close();
});
test("run plan validates goal and sends goal + agents", async () => {
  const { b, p } = await open(example());
  await p.locator("#nav button", { hasText: "Plan" }).click();
  await btn(p, "Run plan").click(); assert.equal(await p.textContent("#err"), "Describe the goal first");
  await p.fill("textarea", "Draft and check the README");
  await btn(p, "Run plan").click();
  const m = (await sent(p))[0]; assert.ok(m.startsWith("Maxey0: run "));
  const r = JSON.parse(m.slice(12)); assert.equal(r.goal, "Draft and check the README"); assert.deepEqual(r.agents, ["Maxey1", "Maxey2", "Maxey3"]); assert.equal(r.state, undefined);
  await b.close();
});
test("hostile strings in state render as text and cannot break out of the script", async () => {
  const s = example(); s.scws[0].name = '<img src=x onerror="window.pwned=1">'; s.scws[1].purpose = "</script><script>window.pwned=2</script>";
  const { b, p, errors } = await open(s);
  assert.equal(await p.evaluate(() => window.pwned), undefined);
  assert.ok((await p.textContent("#view")).includes("<img src=x")); assert.deepEqual(errors, []); await b.close();
});
test("empty state renders (fresh user)", async () => {
  const { b, p, errors } = await open({ schema: "maxey0.state/2", world: "SCW0", rev: 0 });
  assert.deepEqual(await p.$$eval("#mets .met b", e => e.map(x => x.textContent)), ["0", "0", "0", "0"]);
  for (const t of ["Agents", "Gates", "Memory", "Ledger", "Plan"]) await p.locator("#nav button", { hasText: t }).first().click();
  assert.deepEqual(errors, []); await b.close();
});
for (const dark of [false, true]) test(`no horizontal overflow at 380px (${dark ? "dark" : "light"})`, async () => {
  const s = example(); s.ledger = [{ at: "2026-10-14T21:40:00Z", agent: "Maxey2", scw: "SCW1", op: "read", result: "refused" }];
  const { b, p } = await open(s, { dark });
  for (const t of ["SCWs", "Agents", "Gates", "Memory", "Ledger", "Plan"]) {
    await p.locator("#nav button", { hasText: t }).first().click();
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), t);
    if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/${dark ? "dark" : "light"}-${t}.png`, fullPage: true });
  }
  await b.close();
});
