import { test } from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core"; import { renderStandalone, example, APP, CDN, WIDGET } from "./render.mjs";
const dir = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE = fs.readFileSync(path.join(dir, "example-workflow.txt"), "utf8");
const exe = process.env.CHROME || "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
const opened = [];
import { after } from "node:test";
after(async () => { for (const b of opened) await b.close().catch(() => {}); });
async function open(state, opts = {}) {
  const b = await chromium.launch({ executablePath: exe }); opened.push(b);
  const p = await b.newPage({ viewport: { width: opts.width || 380, height: opts.height || 900 }, colorScheme: opts.dark ? "dark" : "light" });
  const errors = []; p.on("pageerror", (e) => errors.push(String(e)));
  await p.route(/^https?:/, (r) => r.abort());
  if (!opts.cdnDown) await p.route(CDN, (r) => r.fulfill({ body: APP, contentType: "application/javascript" }));
  if (opts.clock) await p.clock.install();
  await p.setContent(renderStandalone(state), { waitUntil: "domcontentloaded", timeout: 15000 });
  if (!opts.cdnDown) await p.waitForFunction(() => window.Maxey0 && document.getElementById("pal"), null, { timeout: 15000 });
  await p.evaluate(() => { window.__sent = []; window.sendPrompt = (t) => window.__sent.push(t); });
  return { b, p, errors };
}
const sent = (p) => p.evaluate(() => window.__sent);
const steps = (p) => p.locator("#tree .card");
const world = (p, id) => p.locator(".scw").filter({ has: p.locator(":scope > .row > .chip", { hasText: new RegExp(`^${id}$`) }) });
async function runPayload(p) { await p.click("#run"); const m = (await sent(p)).at(-1); assert.ok(m && m.startsWith("Maxey0: run "), "Run sends a Maxey0: run message"); return JSON.parse(m.slice(12)); }

test("blank: three default agents, only SCW0, nothing to run, no script errors", async () => {
  const { b, p, errors } = await open({});
  assert.deepEqual(await p.$$eval("#pal .agent", (e) => e.map((x) => x.textContent)), ["Maxey1 · maker", "Maxey2 · checker", "Maxey3 · judge"]);
  assert.equal(await p.locator("#tree .scw").count(), 1);
  assert.match(await p.textContent("#order"), /Nothing to run yet/);
  await p.click("#run"); assert.match(await p.textContent("#err"), /Add at least one step/); assert.equal((await sent(p)).length, 0);
  assert.deepEqual(errors, []); await b.close();
});
test("Human0's workflow text draws 5 nested worlds, 6 steps and 2 run stages", async () => {
  const { b, p, errors } = await open({ input: EXAMPLE });
  assert.equal(await p.locator("#tree .scw").count(), 5);
  assert.equal(await steps(p).count(), 6);
  assert.equal(await p.locator("#order .stage").count(), 2);
  assert.equal(await world(p, "scw5").locator(".scw").count(), 2, "SCW30 and SCW31 sit inside SCW5");
  assert.equal(await world(p, "scw0").locator(":scope > .scw").count(), 2, "SCW5 and SCW32 sit directly in SCW0");
  assert.match(await world(p, "scw5").locator(":scope > .card").first().textContent(), /Saves to SCW5/);
  assert.deepEqual(errors, []); await b.close();
});
test("typing a workflow and pressing Visualize draws it; empty text is refused", async () => {
  const { b, p } = await open({});
  await p.click("#viz"); assert.match(await p.textContent("#err"), /Add a task/);
  await p.fill("#txt", "In scw1: draft the plan /deep-research\nIn scw2: review the plan");
  await p.click("#viz");
  assert.equal(await steps(p).count(), 2); assert.equal(await p.locator("#order .stage").count(), 2);
  assert.match(await p.textContent("#err"), /Drew 3 worlds and 2 steps/); await b.close();
});
test("tap an agent then a step places it; tapping the step again removes it", async () => {
  const { b, p } = await open({ input: EXAMPLE });
  await p.locator("#pal .agent", { hasText: "Maxey1" }).click();
  assert.equal(await p.locator("#pal .agent.pick").count(), 1);
  await steps(p).first().locator(".slot").click();
  assert.equal(await steps(p).first().locator(".slot").textContent(), "Maxey1 ×");
  assert.equal(await p.locator("#pal .agent.pick").count(), 0);
  await steps(p).first().locator(".slot").click();
  assert.equal(await steps(p).first().locator(".slot").textContent(), "Drop an agent"); await b.close();
});
test("drag an agent onto a step places it; a drop with no agent changes nothing", async () => {
  // Tall viewport: a simulated drag only reaches targets that are on screen.
  const { b, p } = await open({ input: EXAMPLE }, { height: 2400 });
  await p.locator("#pal .agent", { hasText: "Maxey2" }).dragTo(steps(p).nth(1).locator(".slot"));
  assert.equal(await steps(p).nth(1).locator(".slot").textContent(), "Maxey2 ×");
  await steps(p).nth(1).locator(".slot").dispatchEvent("drop", { dataTransfer: await p.evaluateHandle(() => new DataTransfer()) });
  assert.equal(await steps(p).nth(1).locator(".slot").textContent(), "Maxey2 ×"); await b.close();
});
test("Run sends the plan with agents, order and a loop", async () => {
  const { b, p } = await open({ input: EXAMPLE });
  await p.locator("#pal .agent", { hasText: "Maxey1" }).click(); await steps(p).first().locator(".slot").click();
  await steps(p).first().getByRole("checkbox").check();
  const r = await runPayload(p);
  assert.equal(r.steps.length, 6); assert.equal(r.scws.length, 5); assert.equal(r.agents.length, 3);
  assert.equal(r.steps[0].agent, "Maxey1"); assert.deepEqual(r.steps[0].loop, { checker: "Maxey2", max: 3 });
  const pdf = r.steps.find((s) => s.scw === "scw5"); assert.deepEqual(pdf.skills, ["research-paper-pdf"]);
  assert.deepEqual(pdf.after, r.steps.filter((s) => s.scw === "scw30").map((s) => s.id)); await b.close();
});
test("add agent inline; duplicate and empty names refused", async () => {
  const { b, p } = await open({});
  await p.click("#aa"); assert.match(await p.textContent("#err"), /Enter an agent name/);
  await p.fill("#an", "maxey1"); await p.click("#aa"); assert.match(await p.textContent("#err"), /already taken/);
  await p.fill("#an", "Scout"); await p.fill("#ar", "researcher"); await p.click("#aa");
  assert.equal(await p.locator("#pal .agent").count(), 4); assert.match(await p.textContent("#pal"), /Scout · researcher/); await b.close();
});
test("add a world and a step, change when a step starts, remove a world with its steps", async () => {
  const { b, p } = await open(example());
  assert.equal(await p.locator("#order .stage").count(), 2);
  await world(p, "scw0").locator(":scope > .row button", { hasText: "+ world inside" }).click();
  assert.equal(await p.locator("#tree .scw").count(), 4);
  await world(p, "scw3").locator(":scope > .row button", { hasText: "+ step" }).click();
  assert.equal(await steps(p).count(), 3);
  await world(p, "scw2").locator(":scope > .card select").first().selectOption("");
  assert.equal(await p.locator("#order .stage").count(), 1, "the PDF step now starts at once");
  await world(p, "scw1").locator(":scope > .row button[aria-label='Remove world']").click();
  assert.equal(await steps(p).count(), 2); assert.equal(await p.locator("#tree .scw").count(), 3);
  const r = await runPayload(p);
  assert.equal(r.steps.length, 1, "the new empty step is not sent"); assert.equal(r.steps[0].scw, "scw2"); await b.close();
});
test("monitoring: statuses and results from a run are shown", async () => {
  const s = example(); s.run = "P-1"; s.steps[0].status = "done"; s.steps[0].result = "Paper saved to Research"; s.steps[1].status = "running";
  const { b, p } = await open(s);
  assert.match(await p.textContent("#sum"), /P-1: 1 of 2 done, 1 running/);
  assert.equal(await p.locator("#order .st-done").count(), 1); assert.equal(await p.locator("#order .st-running").count(), 1);
  assert.match(await steps(p).first().textContent(), /done\s*Paper saved to Research/); await b.close();
});
test("hostile strings render as text", async () => {
  const s = example(); s.scws[1].name = '<img src=x onerror="window.pwned=1">'; s.steps[0].task = "</script><script>window.pwned=2</script>";
  const { b, p, errors } = await open(s);
  assert.equal(await p.evaluate(() => window.pwned), undefined); assert.deepEqual(errors, []); await b.close();
});
for (const dark of [false, true]) test(`380px ${dark ? "dark" : "light"}: no horizontal overflow, no stray null/undefined`, async () => {
  const { b, p } = await open({ input: EXAMPLE }, { dark });
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.ok(!/\b(null|undefined|NaN)\b/.test(await p.textContent("#m0")));
  if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/${dark ? "dark" : "light"}.png`, fullPage: true });
  await b.close();
});

test("the widget Claude sends is tiny and pins the app to one commit", () => {
  assert.ok(WIDGET.length < 600, `widget template is ${WIDGET.length} bytes`);
  assert.match(WIDGET, /cdn\.jsdelivr\.net\/gh\/mmc7676\/maxey0-chat@67e24cd02c007e7cf96fa48e6023b085a4ec9fd2\//);
});
test("if the CDN is unreachable, the widget says so instead of hanging", async () => {
  const { b, p } = await open({}, { cdnDown: true, clock: true });
  assert.match(await p.textContent("#m0"), /Loading Maxey0/);
  await p.clock.runFor(12500);
  assert.match(await p.textContent("#m0"), /could not load from cdn\.jsdelivr\.net/); await b.close();
});
test("SKILL.md carries the exact widget template, so no file has to be read to render", () => {
  const skill = fs.readFileSync(path.join(dir, "..", "skills", "maxey0", "SKILL.md"), "utf8");
  assert.ok(skill.includes(WIDGET.trim()), "SKILL.md must contain widget.html verbatim");
});
