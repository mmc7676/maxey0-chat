import { chromium } from "playwright"; import fs from "fs";
const html = `<!doctype html><html><head><meta name=viewport content="width=device-width"></head><body style="margin:0"><div id="root"></div><script>${fs.readFileSync("out/app.js","utf8")}</script></body></html>`;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const R = {}; const errs = [];
for (const [w,h,tag] of [[1440,1000,"desk"],[400,860,"mob"]]) {
const p = await b.newPage({ viewport:{width:w,height:h} });
p.on("pageerror", e => errs.push(tag+": "+e.message)); p.on("console", m => m.type()==="error" && errs.push(tag+": "+m.text()));
await p.route("http://localhost/**", r => r.fulfill({ body: html, contentType: "text/html" })); await p.goto("http://localhost/");
const nav = async n => { await p.locator(tag==="desk"?".side .nav button":".mobnav button",{hasText:n}).first().click(); await p.waitForTimeout(500); };
if (tag==="desk") {
 // engine checks
 R.engine = await p.evaluate(() => { const E = window.E, P = E.PRESETS; const out = {};
  const bal = P.balanced.build(); const [work, learn, every] = bal.scwGates;
  out.sensitiveSuppressed = E.evaluateTurn(bal, every, "My doctor changed my blood pressure medication").outcome === "suppressed";
  out.sealed = E.evaluateTurn(bal, work, "debug my rust api").outcome === "sealed";
  out.eduAd = E.evaluateTurn(bal, learn, "Explain Bayesian statistics with a worked example").outcome;
  const id = E.evaluateTurn(bal, every, "My name is Sam, email sam@example.com, fix my Python code");
  out.identityWithheld = id.withheld.some(w=>w.rule==="INV-1") && !id.released.some(r=>/sam|email/.test(r.label));
  out.techDebtNotSensitive = E.classifyText("How do we pay down technical debt?").sensitive === null;
  out.versionNotPhone = E.classifyText("Upgrade to TypeScript 5.6 from version 4.9.5").personal.length === 0;
  out.normalize = JSON.stringify(E.normalizeMemoryTiers(["Scratchpad (L1)","Persistent (L3)","Permanent (L4)","Persistent","Procedural","Working",3]));
  const open = P.minimal.build(); open.interests=["rust"];
  out.semanticUsedWhenOpen = E.evaluateTurn(open, open.scwGates[2], "help with my server").released.some(r=>r.tier==="Semantic");
  out.semanticNotInBalanced = !E.evaluateTurn({...bal,interests:["rust"]}, every, "help with my server").released.some(r=>r.tier==="Semantic");
  out.brandBlock = E.evaluateTurn({...open, blockedBrands:["Tidewater"]}, open.scwGates[2], "Best trail running shoes for hiking?").ad?.cand.advertiser !== "Tidewater Trail Co.";
  { const rb = E.evaluateTurn(bal, every, "Best trail running shoes for hiking?", [], 99); out.budget = rb.outcome === "capped" && rb.released.length === 0; }
  let breaches = 0; for (const pr of [P.strict.build(), bal, open]) for (const g of pr.scwGates) for (const c of E.CORPUS) { const r = E.evaluateTurn({...pr,interests:["rust","therapy"]}, g, c.text); if (r.released.some(x=>x.tier==="Persistent"||x.tier==="Procedural"||/sam|example|denver/i.test(x.label)) || (r.cls.sensitive && r.released.length) || r.released.some(x=>x.label==="therapy")) breaches++; }
  out.invariantBreaches = breaches;
  out.scores = [P.strict.build(), bal, open].map(E.privacyScore);
  const rt = E.importProfile(E.exportProfile(bal)); out.roundTrip = rt.ok && JSON.stringify(rt.profile) === JSON.stringify(bal);
  out.rejectsForeign = !E.importProfile(JSON.stringify({profile:{interests:["x"]}})).ok;
  return out; });
 await p.screenshot({ path: "s-overview.png", fullPage: true });
 R.overview = /Exposure flow/.test(await p.locator("main").innerText());
 await nav("Latent Map"); await p.waitForTimeout(2500);
 const box = await p.locator(".canvaswrap").boundingBox(); R.canvas = box.width > 500;
 const px = await p.evaluate(() => { const c = document.querySelector("canvas"); const d = c.getContext("2d").getImageData(0,0,c.width,c.height).data; let n=0; for (let i=0;i<d.length;i+=4) if (d[i+3]>0) n++; return n; }); R.canvasPainted = px > 10000;
 const counts = await p.locator("main").innerText(); R.probesRunning = /Probes admitted\s+\d+/.test(counts);
 // click a gate: find via hit area — scan grid
 let clicked = false;
 for (let yy=0.1; yy<0.95 && !clicked; yy+=0.03) for (let xx=0.1; xx<0.95 && !clicked; xx+=0.03) { await p.mouse.move(box.x+box.width*xx, box.y+box.height*yy); if (await p.locator(".tip").count() && /click to edit/.test(await p.locator(".tip").innerText())) { await p.mouse.click(box.x+box.width*xx, box.y+box.height*yy); clicked = true; } }
 await p.waitForTimeout(400); R.gateSelectFromMap = clicked && (await p.locator(".g-map input[type=text]").count()) > 0;
 await p.screenshot({ path: "s-map.png" });
 await nav("SCW Studio"); R.studioCards = await p.locator(".grid.g3 > .panel").count();
 const before = await p.locator(".side .stat .big").innerText();
 await p.getByRole("group", { name: "Everyday mode" }).getByRole("button", { name: "Open" }).click(); await p.waitForTimeout(150);
 await p.getByRole("switch", { name: "Semantic readable in Everyday" }).click(); await p.waitForTimeout(200);
 await nav("Apply to ChatGPT"); await p.getByRole("switch", { name: "Use my interests" }).click();
 await nav("SCW Studio"); await p.getByRole("switch", { name: "Use my interests in Everyday" }).click(); await p.waitForTimeout(200);
 const after = await p.locator(".side .stat .big").innerText(); R.scoreReacts = +after < +before;
 R.lockedTiers = (await p.locator("text=locked").count()) >= 6;
 await p.getByRole("button", { name: "Undo" }).click(); await p.waitForTimeout(200); R.undo = (await p.locator(".side .stat .big").innerText()) !== after;
 await p.screenshot({ path: "s-studio.png", fullPage: true });
 await nav("Simulator");
 await p.getByRole("button", { name: "Best trail running shoes for mud?" }).click(); await p.waitForTimeout(200);
 await p.getByRole("button", { name: "My doctor changed my medication" }).click(); await p.waitForTimeout(300);
 const st = await p.locator("main").innerText(); R.simSuppressed = /Suppressed \(sensitive\)/.test(st) && /INV-3/.test(st); R.simCompare = /Isolation at a glance/.test(st);
 await p.getByLabel("Message").fill("Help me debug my Rust API"); await p.getByRole("button", { name: "Send" }).click(); await p.waitForTimeout(300);
 await p.screenshot({ path: "s-sim.png", fullPage: true });
 await nav("Advertiser Lens"); await p.getByRole("group", { name: "SCW" }).getByRole("button", { name: "Learning" }).click(); await p.waitForTimeout(200); const lt = await p.locator("main").innerText(); R.lensNulls = /"message_text": null/.test(lt) && /"user_id": null/.test(lt);
 await p.getByRole("group", { name: "SCW" }).getByRole("button", { name: "Work" }).click(); await p.waitForTimeout(200); R.lensSealedNoRequest = /No ad request is made/.test(await p.locator("main").innerText()) && !/"request_id"/.test(await p.locator("main").innerText());
 await p.screenshot({ path: "s-lens.png", fullPage: true });
 await nav("Memory"); await p.waitForTimeout(800); R.memory = ["Working","Episodic","Semantic","Persistent","Procedural"].every(x => lt || true) && /Quarantine/.test(await p.locator("main").innerText());
 await p.screenshot({ path: "s-memory.png", fullPage: true });
 await nav("Learn SCWs"); await p.locator(".lesson").nth(2).click(); R.learn = /Invariants beat settings/.test(await p.locator("main").innerText());
 await nav("Apply to ChatGPT");
 const exp = JSON.parse(await p.getByLabel("Exported profile JSON").inputValue()); R.exportVersion = exp.version === "2.0.0" && /^\d{4}-\d{2}-\d{2}$/.test(exp.exportedAt);
 const old = { version: "1.0.0", profile: { privacyLevel: "custom", interests: [], blockedBrands: [], allowedCategories: ["technology"], sessionLimits: { maxAdsPerHour: 3, maxAdsPerDay: 9, minRelevanceThreshold: 80 }, dataControls: { shareConversationTopics: false, shareSearchHistory: false, shareInteractionPatterns: false, allowPersonalization: false }, scwGates: [{ id: "g1", name: "Legacy", gateType: "allow", allowedCategories: ["technology"], blockedTopics: [], maxAdsPerSession: 2, requireRelevanceScore: 80, memoryTierAccess: ["Scratchpad (L1)", "Persistent (L3)", "Permanent (L4)", "Procedural"], dataSharing: { conversationContext: true, userPreferences: false, behavioralData: true, demographicData: true } }] } };
 await p.getByLabel("Profile JSON to import").fill(JSON.stringify(old)); await p.getByRole("button", { name: /Import configuration/ }).click(); await p.waitForTimeout(300);
 R.legacyImport = /imported successfully/.test(await p.locator("main").innerText()) && /2 tier grants removed/.test(await p.locator("main").innerText());
 const e2 = JSON.parse(await p.getByLabel("Exported profile JSON").inputValue()); R.legacyMigrated = JSON.stringify(e2.profile.scwGates[0].memoryTierAccess)==='["Working","Semantic"]' && e2.profile.scwGates[0].dataSharing.demographicData===false;
 await p.getByLabel("Profile JSON to import").fill('{"profile":{"interests":["a"]}}'); await p.getByRole("button", { name: /Import configuration/ }).click(); R.foreignRejected = /Invalid profile format/.test(await p.locator("main").innerText());
 await p.screenshot({ path: "s-apply.png", fullPage: true });
} else {
 for (const n of ["Overview","Latent Map","SCW Studio","Simulator","Advertiser Lens","Memory","Learn SCWs","Apply to ChatGPT"]) { await nav(n); const ov = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (ov > 1) (R.mobOverflow ??= []).push(n+":"+ov); }
 await nav("Latent Map"); await p.waitForTimeout(1200); await p.screenshot({ path: "s-mob-map.png", fullPage: true });
}
await p.close(); }
R.errors = errs; console.log(JSON.stringify(R, null, 1)); await b.close();
