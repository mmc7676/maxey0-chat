// Builds the Maxey0 app view (ui/app.ts plus the workflow builder plugins/maxey0/app/maxey0.js) into
// src/app-ui-html.ts: one self-contained HTML string. Run: node build-ui-app.mjs  (part of npm run build:ui)
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const version = JSON.parse(readFileSync(join(here, "package.json"), "utf8")).version;
const logo = "data:image/webp;base64," + readFileSync(join(here, "../plugins/maxey0/src/logo48.webp")).toString("base64");
const builder = readFileSync(join(here, "../plugins/maxey0/app/maxey0.js"), "utf8");

const js = (await build({
  entryPoints: [join(here, "ui/app.ts")], bundle: true, write: false, format: "iife",
  target: "es2020", minify: true, define: { __LOGO__: JSON.stringify(logo), __VERSION__: JSON.stringify(version) }, logLevel: "warning",
})).outputFiles[0].text;

// The builder's styles use the inline-widget host's CSS variables; this view defines them.
const css = `:root{--bg:#070a1a;--card:#10153a;--line:#273072;--ink:#e8ebff;--dim:#9aa3d6;--acc:#5b7cff;--ok:#34d399;--warn:#fbbf24;--bad:#f87171;color-scheme:dark;
--text-primary:var(--ink);--text-secondary:var(--dim);--text-accent:#c7d2ff;--text-danger:var(--bad);--text-warning:var(--warn);--text-success:var(--ok);
--surface-1:#0b1030;--surface-2:var(--card);--border:var(--line);--border-strong:#3a4699;--border-accent:var(--acc);--bg-accent:rgba(91,124,255,.18);
--bg-warning:rgba(251,191,36,.15);--bg-success:rgba(52,211,153,.15);--bg-danger:rgba(248,113,113,.15);--radius:8px}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
body{padding:12px max(12px,env(safe-area-inset-right)) 16px max(12px,env(safe-area-inset-left))}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.grow{flex:1;min-width:0}
.title{font-weight:600;overflow-wrap:anywhere}.meta{color:var(--dim);font-size:12px}.pad{padding:12px}.lbl{font-size:13px;font-weight:500;margin:12px 0 4px}
input,select,textarea{background:var(--surface-1);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:inherit}
input[type=search]{flex:1;min-width:160px}
button,a{background:transparent;color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:7px 12px;font:inherit;cursor:pointer;text-decoration:none}
button.primary{background:var(--acc);border-color:var(--acc);color:#fff}button:focus-visible,a:focus-visible,.chip:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
#arts{margin-top:14px;border-top:1px solid var(--line);padding-top:10px}
.toggle{font-weight:600;border:none;padding:6px 0}
#arts-body.collapsed{display:none}
.chip{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);color:var(--dim);white-space:nowrap}
.tray{margin:6px 0}#tray-more{font-size:12px;padding:5px 12px}
.chip.art{font-size:12px;padding:5px 10px;cursor:grab;background:var(--bg-accent);color:var(--text-accent);border-color:var(--border-accent);white-space:normal}
.chip.art .kind{color:var(--dim)}.chip.art.pick{outline:2px solid var(--acc)}.chip.art.placed{opacity:.55}
.st-rendered{color:var(--ok);border-color:var(--ok)}.st-error{color:var(--bad);border-color:var(--bad)}.st-loading,.st-running{color:var(--warn);border-color:var(--warn)}
.err{color:var(--bad);font-size:12px;overflow-wrap:anywhere;min-height:0}
.tgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:10px;margin-top:6px}
.tslot{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:8px;min-width:0}
.tslot.empty{border-style:dashed;min-height:120px;justify-content:center}.tslot.hot{border-color:var(--acc)}
.tslot.wide{grid-column:1/-1}
.tslot .drop{width:100%;min-height:80px;border-style:dashed;color:var(--dim)}
.tbody{border-radius:8px;overflow:hidden;background:#fff;height:300px}@media (max-width:600px){.tbody{height:420px}.tbody.tall{height:640px}}.tslot.empty .tbody{display:none}.tbody.tall{height:640px}
.frame{width:100%;height:100%;border:0;display:block}
body.focus{padding:0}body.focus #builder,body.focus .arts-head,body.focus #arts-body>:not(#slots),body.focus .tslot:not(.focused){display:none}
body.focus #arts{margin:0;border:0;padding:0}body.focus #slots{display:block;margin:0}
.tslot.focused{position:fixed;inset:0;z-index:10;border-radius:0;border:0;padding:8px}.tslot.focused .tbody{flex:1;height:auto}
[hidden]{display:none!important}`;

const safe = (s) => s.replace(/<\/script/gi, "<\\/script");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Maxey0</title><style>${css}</style></head><body><script>${safe(builder)}</script><script>${safe(js)}</script></body></html>`;
writeFileSync(join(here, "src/app-ui-html.ts"), `// GENERATED by build-ui-app.mjs — do not edit. Sources: ui/app.ts, ../plugins/maxey0/app/maxey0.js\nexport const APP_HTML = ${JSON.stringify(html)};\n`);
console.log(`app UI: ${html.length} chars (Maxey0 ${version})`);
