// Renders exactly what SKILL.md tells Claude to send: widget.html with __STATE__ replaced.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const WIDGET = fs.readFileSync(path.join(root, "skills", "maxey0", "widget.html"), "utf8");
export const APP = fs.readFileSync(path.join(root, "app", "maxey0.js"), "utf8");
export const CDN = /^https:\/\/cdn\.jsdelivr\.net\/gh\/mmc7676\/maxey0-chat@4551647e4939fbea2e5e993a825a45159354ae32\/plugins\/maxey0\/app\/maxey0\.js$/;
export function renderWidget(state) {
  if (WIDGET.split("__STATE__").length !== 2) throw new Error("widget.html must contain __STATE__ exactly once");
  return WIDGET.replace("__STATE__", () => JSON.stringify(state).replace(/<\//g, "<\\/"));
}
export function renderStandalone(state) {
  const shell = fs.readFileSync(path.join(root, "tests", "standalone-shell.html"), "utf8");
  return shell.replace("__WIDGET__", () => renderWidget(state));
}
export const example = () => JSON.parse(fs.readFileSync(path.join(root, "skills", "maxey0", "state.example.json"), "utf8"));
