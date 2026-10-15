import { test } from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(dir, "..", "src", "parser.js"), "utf8");
const { parseWorkflow, stagesOf } = new Function(src + "; return { parseWorkflow, stagesOf };")();

// Human0's own workflow message (2026-10-14), with the LinkedIn hashtag links; two long step texts are abridged.
const EXAMPLE = fs.readFileSync(path.join(dir, "example-workflow.txt"), "utf8");

const p = parseWorkflow(EXAMPLE);
const by = (scw) => p.steps.filter((s) => s.scw === scw);
const parent = (id) => p.scws.find((s) => s.id === id)?.parent;

test("SCW tree: scw5 in scw0, scw30 and scw31 in scw5, scw32 in scw0", () => {
  assert.deepEqual(p.scws.map((s) => s.id).sort(), ["scw0", "scw30", "scw31", "scw32", "scw5"]);
  assert.equal(parent("scw5"), "scw0"); assert.equal(parent("scw30"), "scw5");
  assert.equal(parent("scw31"), "scw5"); assert.equal(parent("scw32"), "scw0"); assert.equal(parent("scw0"), null);
});
test("four parallel tracks", () => {
  assert.equal(p.tracks.length, 4); assert.ok(p.tracks.every((t) => t.parallel));
});
test("scw0 step keeps its question and three skills", () => {
  const [s] = by("scw0"); assert.ok(s);
  assert.deepEqual(s.skills, ["effort-optimizer", "supersystem-integrate", "file-graph"]);
  assert.match(s.task, /^How would you \/file-graph the in-line visualization/);
});
test("scw30: one research step, saved to SCW30", () => {
  const s = by("scw30"); assert.equal(s.length, 1);
  assert.deepEqual(s[0].skills, ["effort-optimizer", "deep-research"]);
  assert.match(s[0].task, /^What is the best way.*#Maxey0.*Synthesize your results/s);
  assert.equal(s[0].saveTo, "scw30");
});
test("scw5: PDF step waits for scw30 and saves to SCW5", () => {
  const s = by("scw5"); assert.equal(s.length, 1);
  assert.deepEqual(s[0].skills, ["research-paper-pdf"]); assert.equal(s[0].saveTo, "scw5");
  assert.deepEqual(s[0].after, by("scw30").map((x) => x.id));
});
test("scw31: two numbered steps in order, skills attached to the right step", () => {
  const s = by("scw31"); assert.equal(s.length, 2);
  assert.match(s[0].task, /^Teach yourself this.*https:\/\/lnkd\.in\/geJwmaSj/);
  assert.deepEqual(s[0].skills, ["effort-optimizer", "supersystem-integrate"]);
  assert.match(s[1].task, /^Rebuild SCW's/); assert.deepEqual(s[1].skills, ["effort-optimizer", "supersystem-integrate"]);
  assert.deepEqual(s[1].after, [s[0].id]); assert.equal(s[1].saveTo, "scw31");
});
test("scw32: one step with its skills, saved to SCW32", () => {
  const s = by("scw32"); assert.equal(s.length, 1);
  assert.match(s[0].task, /^Rewrite Maxey0/); assert.deepEqual(s[0].skills, ["effort-optimizer", "supersystem-integrate"]); assert.equal(s[0].saveTo, "scw32");
});
test("run order: everything starts at once except the SCW5 PDF and SCW31 step 2", () => {
  const st = stagesOf(p.steps).map((g) => g.map((id) => p.steps.find((s) => s.id === id).scw).sort());
  assert.deepEqual(st, [["scw0", "scw30", "scw31", "scw32"], ["scw31", "scw5"]]);
});
test("plain text with no directives becomes one step in SCW0", () => {
  const q = parseWorkflow("Summarize the attached report /effort-optimizer");
  assert.equal(q.steps.length, 1); assert.equal(q.steps[0].scw, "scw0"); assert.deepEqual(q.steps[0].skills, ["effort-optimizer"]);
});
test("without $pp, a block runs in order", () => {
  const q = parseWorkflow("In scw1: draft it\nIn scw2: review it");
  assert.deepEqual(q.steps[1].after, [q.steps[0].id]);
});
test("empty input yields no steps and only SCW0", () => {
  const q = parseWorkflow("   "); assert.equal(q.steps.length, 0); assert.equal(q.scws.length, 1);
});
test("the parser shipped in the skill is the same file as src/parser.js", () => {
  assert.equal(fs.readFileSync(path.join(dir, "..", "skills", "maxey0", "parser.js"), "utf8"), src);
});
