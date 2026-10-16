// Artifact objects: kinds, the mechanical checker, and the tile document a dashboard frame runs.
// Pure functions with no runtime dependencies, so the server (checks at upsert) and the
// dashboard UI (builds each tile) apply exactly the same rules.

export type ArtifactKind = "html" | "react" | "svg" | "mermaid" | "markdown" | "code" | "text";
export const ARTIFACT_KINDS: ArtifactKind[] = ["html", "react", "svg", "mermaid", "markdown", "code", "text"];
/** Kinds that render as a live app in a tile. The rest are shown as text. */
export const RENDERED_KINDS: ArtifactKind[] = ["html", "react", "svg", "mermaid"];

export interface ArtifactCheck { name: string; ok: boolean; detail: string }
export interface ArtifactRender { ok: boolean; detail: string; at: string }
export interface ArtifactSource { type: "chat" | "file" | "published" | "built"; chatUrl?: string; chatTitle?: string; originId?: string }
export interface ArtifactMeta {
  id: string; title: string; kind: ArtifactKind; description: string; scwId: string | null;
  version: number; size: number; sha256: string;
  status: "checked" | "failed"; checks: ArtifactCheck[]; render: ArtifactRender | null;
  source: ArtifactSource; createdAt: string; updatedAt: string;
}

/** Hosts a tile may load scripts and styles from. Declared as the UI resource's CSP resourceDomains. */
export const RESOURCE_DOMAINS = ["https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://unpkg.com", "https://cdn.tailwindcss.com"];

const NPM = "https://cdn.jsdelivr.net/npm/";
/** Libraries a React artifact may import, each pinned to a UMD build on jsDelivr and the global it defines.
 *  Paths verified to exist in the published npm packages. */
export const LIBS: Record<string, { urls: string[]; global: string }> = {
  "react": { urls: [NPM + "react@18.3.1/umd/react.production.min.js"], global: "React" },
  "react-dom": { urls: [NPM + "react-dom@18.3.1/umd/react-dom.production.min.js"], global: "ReactDOM" },
  "react-dom/client": { urls: [NPM + "react-dom@18.3.1/umd/react-dom.production.min.js"], global: "ReactDOM" },
  "recharts": { urls: [NPM + "prop-types@15.8.1/prop-types.min.js", NPM + "recharts@2.12.7/umd/Recharts.js"], global: "Recharts" },
  "lucide-react": { urls: [NPM + "lucide-react@0.383.0/dist/umd/lucide-react.min.js"], global: "LucideReact" },
  "d3": { urls: [NPM + "d3@7.9.0/dist/d3.min.js"], global: "d3" },
  "three": { urls: [NPM + "three@0.149.0/build/three.min.js"], global: "THREE" },
  "lodash": { urls: [NPM + "lodash@4.17.21/lodash.min.js"], global: "_" },
  "papaparse": { urls: [NPM + "papaparse@5.4.1/papaparse.min.js"], global: "Papa" },
  "mathjs": { urls: [NPM + "mathjs@12.4.2/lib/browser/math.js"], global: "math" },
  "chart.js": { urls: [NPM + "chart.js@4.4.1/dist/chart.umd.js"], global: "Chart" },
  "chart.js/auto": { urls: [NPM + "chart.js@4.4.1/dist/chart.umd.js"], global: "Chart" },
  "tone": { urls: [NPM + "tone@14.7.77/build/Tone.js"], global: "Tone" },
};
export const BABEL_URL = NPM + "@babel/standalone@7.24.0/babel.min.js";
export const MERMAID_URL = NPM + "mermaid@10.9.1/dist/mermaid.min.js";
export const TAILWIND_URL = "https://cdn.tailwindcss.com/3.4.17";
export const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;

/** Map a MIME type, extension or loose name to an artifact kind. */
export function kindOf(t: string): ArtifactKind {
  const s = String(t || "").toLowerCase().trim();
  if (["html", "htm", "text/html"].includes(s)) return "html";
  if (["react", "jsx", "tsx", "application/vnd.ant.react"].includes(s)) return "react";
  if (["svg", "image/svg+xml"].includes(s)) return "svg";
  if (["mermaid", "mmd", "application/vnd.ant.mermaid"].includes(s)) return "mermaid";
  if (["markdown", "md", "text/markdown"].includes(s)) return "markdown";
  if (["code", "application/vnd.ant.code", "py", "js", "ts", "css", "json", "sh"].includes(s)) return "code";
  return "text";
}

/** Module names imported by JS/TS source: import … from "x", import "x", export … from "x", require("x"), import("x"). */
export function importsOf(code: string): string[] {
  const found = new Set<string>();
  const res = [
    /(?:^|[\n;])\s*import\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?["']([^"']+)["']/g,
    /(?:^|[\n;])\s*export\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of res) for (const m of code.matchAll(re)) found.add(m[1]);
  return [...found];
}

function hostsLoadedBy(html: string): string[] {
  const hosts = new Set<string>();
  for (const m of html.matchAll(/<(?:script|link|img|iframe)\b[^>]*?\b(?:src|href)\s*=\s*["']?(https?:\/\/[^"'\s>]+)/gi)) {
    try { hosts.add(new URL(m[1]).origin); } catch { hosts.add(m[1]); }
  }
  return [...hosts];
}

/** The mechanical checks run on every upsert. No judgement: each one passes or fails on the code alone. */
export function checkArtifact(kind: ArtifactKind, code: string): ArtifactCheck[] {
  const size = new TextEncoder().encode(code).length;
  const checks: ArtifactCheck[] = [
    { name: "not_empty", ok: code.trim().length > 0, detail: code.trim() ? `${size} bytes` : "the artifact has no content" },
    { name: "size", ok: size <= MAX_ARTIFACT_BYTES, detail: `${size} of ${MAX_ARTIFACT_BYTES} bytes` },
  ];
  if (kind === "react") {
    const imports = importsOf(code);
    const bad = imports.filter((m) => !LIBS[m]);
    checks.push({ name: "imports_resolvable", ok: bad.length === 0,
      detail: bad.length ? `cannot load in a tile: ${bad.join(", ")}. Supported: ${Object.keys(LIBS).join(", ")}` : imports.length ? `all loadable: ${imports.join(", ")}` : "no imports" });
    const hasDefault = /\bexport\s+default\b/.test(code) || /\bexport\s*\{[^}]*\bas\s+default\b/.test(code);
    checks.push({ name: "default_export", ok: hasDefault, detail: hasDefault ? "has a default export" : "a React artifact needs `export default` for its main component" });
  }
  if (kind === "html") {
    const blocked = hostsLoadedBy(code).filter((h) => !RESOURCE_DOMAINS.includes(h));
    checks.push({ name: "external_hosts_allowed", ok: blocked.length === 0,
      detail: blocked.length ? `loads from hosts the tile frame blocks: ${blocked.join(", ")}` : "loads only from allowed hosts" });
    const looksHtml = /<[a-z!][\s\S]*>/i.test(code);
    checks.push({ name: "is_html", ok: looksHtml, detail: looksHtml ? "contains markup" : "no HTML tags found" });
  }
  if (kind === "svg") {
    const ok = /<svg[\s>]/i.test(code);
    checks.push({ name: "is_svg", ok, detail: ok ? "contains an <svg> element" : "no <svg> element found" });
  }
  return checks;
}

const jsonForScript = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/ /g, "\\u2028").replace(/ /g, "\\u2029");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Script every tile runs first: reports errors and a successful render to the dashboard by postMessage. */
function reporter(tileId: string) {
  return `<script>(function(){var id=${jsonForScript(tileId)},sent=false;function post(t,d){try{parent.postMessage({maxey0Tile:id,type:t,detail:String(d||"").slice(0,500)},"*")}catch(e){}}
window.__tileReport=function(ok,d){if(sent&&ok)return;sent=true;post(ok?"rendered":"error",d)};
window.addEventListener("error",function(e){window.__tileReport(false,(e.message||"script error")+(e.filename?" @ "+e.filename.split("/").pop()+":"+e.lineno:""))});
window.addEventListener("unhandledrejection",function(e){window.__tileReport(false,"unhandled rejection: "+(e.reason&&e.reason.message||e.reason))});})();</script>`;
}

/** The complete HTML document that runs one artifact inside a tile frame (srcdoc). */
export function tileDocument(kind: ArtifactKind, code: string, tileId: string): string {
  const head = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${reporter(tileId)}`;
  if (kind === "html") {
    const done = `<script>addEventListener("load",function(){setTimeout(function(){window.__tileReport(true,"loaded")},50)})</script>`;
    return /<head[\s>]/i.test(code) ? code.replace(/<head([^>]*)>/i, `<head$1>${reporter(tileId)}${done}`) : head + done + "</head><body>" + code + "</body></html>";
  }
  if (kind === "svg") {
    return `${head}<style>html,body{margin:0}svg{max-width:100%;height:auto}</style></head><body>${code}<script>window.__tileReport(!!document.querySelector("svg"),"svg drawn")</script></body></html>`;
  }
  if (kind === "mermaid") {
    return `${head}<script src="${MERMAID_URL}"></script></head><body><pre class="mermaid">${esc(code)}</pre><script>
mermaid.initialize({startOnLoad:false});mermaid.run({querySelector:".mermaid"}).then(function(){window.__tileReport(true,"diagram drawn")},function(e){window.__tileReport(false,"mermaid: "+(e&&e.message||e))});</script></body></html>`;
  }
  if (kind === "react") {
    const needed = [...new Set(["react", "react-dom", ...importsOf(code).filter((m) => LIBS[m])])];
    const urls = [...new Set(needed.flatMap((m) => LIBS[m].urls))];
    const globals: Record<string, string> = {};
    for (const m of Object.keys(LIBS)) globals[m] = LIBS[m].global;
    return `${head}<script src="${TAILWIND_URL}"></script>${urls.map((u) => `<script src="${u}"></script>`).join("")}<script src="${BABEL_URL}"></script></head><body><div id="root"></div>
<script id="src" type="application/json">${jsonForScript(code)}</script>
<script>(function(){var G=${jsonForScript(globals)},out;
try{out=Babel.transform(JSON.parse(document.getElementById("src").textContent),{filename:"artifact.tsx",presets:["react",["typescript",{isTSX:true,allExtensions:true}]],plugins:["transform-modules-commonjs"]}).code}
catch(e){return window.__tileReport(false,"compile error: "+e.message)}
var module={exports:{}};function req(n){if(!(n in G))throw new Error("cannot load module "+n);var g=window[G[n]];if(!g)throw new Error("library "+n+" did not load");return g}
try{new Function("require","exports","module","React",out)(req,module.exports,module,window.React)}catch(e){return window.__tileReport(false,"runtime error: "+e.message)}
var C=module.exports.default||module.exports;if(typeof C!=="function"&&!(C&&C.$$typeof))return window.__tileReport(false,"no component exported");
var Boundary=class extends React.Component{constructor(p){super(p);this.state={e:null}}static getDerivedStateFromError(e){return{e:e}}componentDidCatch(e){window.__tileReport(false,"render error: "+e.message)}render(){return this.state.e?React.createElement("pre",{style:{color:"#b91c1c",whiteSpace:"pre-wrap"}},String(this.state.e.message)):this.props.children}};
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(Boundary,null,React.createElement(C)));
setTimeout(function(){window.__tileReport(true,"rendered")},300);})();</script></body></html>`;
  }
  return `${head}<style>body{margin:0;padding:12px;font:13px/1.5 ui-monospace,monospace;white-space:pre-wrap;word-break:break-word}</style></head><body>${esc(code)}<script>window.__tileReport(true,"shown as text")</script></body></html>`;
}

/** SHA-256 of the artifact text, hex. Uses Web Crypto (Workers, Node 18+, browsers). */
export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
