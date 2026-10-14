// Performs exactly the substitution SKILL.md section 2 prescribes.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "skills", "maxey0");
export function renderWidget(state) {
  const tpl = fs.readFileSync(path.join(dir, "dashboard.html"), "utf8");
  if (tpl.split("__STATE__").length !== 2) throw new Error("template must contain __STATE__ exactly once");
  return tpl.replace("__STATE__", () => JSON.stringify(state).replace(/<\//g, "<\\/"));
}
export function renderStandalone(state) {
  const shell = fs.readFileSync(path.join(dir, "standalone-shell.html"), "utf8");
  return shell.replace("__WIDGET__", () => renderWidget(state));
}
export const example = () => JSON.parse(fs.readFileSync(path.join(dir, "state.example.json"), "utf8"));
