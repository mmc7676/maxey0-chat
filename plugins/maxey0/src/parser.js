function parseWorkflow(text) {
  var SCW = "(?:#)?scw\\s*(\\d*)";
  var out = { scws: [{ id: "scw0", name: "SCW0", desc: "", parent: null, files: [] }], steps: [], tracks: [] };
  var n = 0, cur = "scw0", track = null, fresh = true, last = {};
  function scw(num, parent) {
    var id = "scw" + (num === "" || num == null ? "0" : String(parseInt(num, 10)));
    var s = out.scws.find(function (x) { return x.id === id; });
    if (!s) { s = { id: id, name: id.toUpperCase(), desc: "", parent: parent || "scw0", files: [] }; out.scws.push(s); }
    else if (parent && id !== "scw0" && s.parent !== parent) s.parent = parent;
    return id;
  }
  function newTrack() { track = { id: "t" + (out.tracks.length + 1), parallel: false, steps: [] }; out.tracks.push(track); last = {}; fresh = true; }
  function newStep() {
    var prev = last[cur];
    var st = { id: "s" + (++n), scw: cur, track: track.id, agent: "", task: "", skills: [], saveTo: "", after: [], waitFor: [], loop: null };
    if (prev) st.after.push(prev.id);
    else if (!track.parallel && track.steps.length) st.after.push(track.steps[track.steps.length - 1]);
    out.steps.push(st); track.steps.push(st.id); last[cur] = st; fresh = false;
    return st;
  }
  function current() { var s = last[cur]; return !s || fresh ? newStep() : s; }
  function content(raw) {
    var t = raw.trim(); if (!t) return;
    var skills = [], m, re = /(^|\s)\/([a-z][\w:.-]*)/gi;
    while ((m = re.exec(t))) skills.push(m[2].replace(/[.:]+$/, "")); // "/deep-research." ends a sentence; the dot is not part of the name
    var rest = t.replace(/(^|\s)\/(?=\s|$)/g, " ");
    var lead = rest.replace(/^(\s*\/[a-z][\w:.-]*)+/i, "").trim();
    var save = /save\s+(?:it\s+)?(?:in|to|into)\s+(?:#)?scw\s*(\d+)/i.exec(t);
    var wait = /when\s+(?:#)?scw\s*(\d+)(?:\s+loop)?\s+(?:is\s+)?(?:complete|completed|done|finished)/i.exec(t);
    var onlySkills = !lead.replace(/[\s,.;:]/g, "");
    var st = last[cur] && !fresh ? last[cur] : null;
    if (onlySkills && st && st.task) st = newStep();
    if (!st) st = current();
    skills.forEach(function (k) { if (st.skills.indexOf(k) < 0) st.skills.push(k); });
    if (!onlySkills) st.task = (st.task ? st.task + " " : "") + lead;
    if (save) st.saveTo = scw(save[1]);
    if (wait) { var w = "scw" + parseInt(wait[1], 10); if (st.waitFor.indexOf(w) < 0) st.waitFor.push(w); }
  }
  function directive(s) {
    var m;
    if ((m = new RegExp("^launch\\s+(?:a\\s+)?(?:logical\\s+)?" + SCW + "(?:\\s+in\\s+" + SCW + ")?\\s*[.:]?\\s*(.*)$", "i").exec(s))) {
      scw(m[1], m[2] !== undefined ? scw(m[2]) : cur); if (m[3]) sentence(m[3]); return;
    }
    if ((m = new RegExp("^in\\s+" + SCW + "\\s+launch\\s+(?:a\\s+)?(?:logical\\s+)?" + SCW + "\\s*[.:]?\\s*(.*)$", "i").exec(s))) {
      scw(m[2], scw(m[1])); if (m[3]) sentence(m[3]); return;
    }
    if ((m = new RegExp("^in\\s+" + SCW + "\\s*[:,]?\\s*(.*)$", "i").exec(s))) {
      cur = scw(m[1]); fresh = true; if (m[2]) content(m[2]); return;
    }
    if (/^(?:process\s+in\s+parallel\s*)?\(?\$pp\)?\s*$/i.test(s) || /^process\s+in\s+parallel\b/i.test(s)) { track.parallel = true; return; }
    if ((m = /^\d+[).]\s*(.*)$/.exec(s))) {
      var st = last[cur] && !fresh && !last[cur].task ? last[cur] : newStep();
      last[cur] = st; fresh = false; content(m[1]); return;
    }
    content(s);
  }
  function sentence(s) {
    s.split(/(?<=[.:?!])\s+(?=(?:in|launch)\s+(?:a\s+)?(?:logical\s+)?#?scw)/i).forEach(function (p) { if (p.trim()) directive(p.trim()); });
  }
  var lines = String(text || "")
    .replace(/\[(#?[^\]]+)\]\((?:https?:)?[^)]*\)/g, "$1")
    .replace(/\r/g, "").split("\n");
  newTrack();
  lines.forEach(function (raw) {
    var line = raw.trim();
    if (/^-{3,}$/.test(line)) { if (track.steps.length) newTrack(); return; }
    if (/^\$pp\b/i.test(line) && track.steps.length) newTrack();
    if (!line) return;
    sentence(line);
  });
  out.tracks = out.tracks.filter(function (t) { return t.steps.length; });
  out.steps.forEach(function (st) {
    st.waitFor.forEach(function (w) {
      var ids = {}; ids[w] = 1; var grew = true;
      while (grew) { grew = false; out.scws.forEach(function (s) { if (ids[s.parent] && !ids[s.id]) { ids[s.id] = 1; grew = true; } }); }
      out.steps.forEach(function (o) { if (o !== st && ids[o.scw] && st.after.indexOf(o.id) < 0) st.after.push(o.id); });
    });
    delete st.waitFor;
  });
  return out;
}
function stagesOf(steps) {
  var level = {}, byId = {}, stages = [];
  steps.forEach(function (s) { byId[s.id] = s; });
  function lv(s, seen) {
    if (level[s.id] != null) return level[s.id];
    if (seen[s.id]) return 0;
    seen[s.id] = 1;
    var l = 0;
    s.after.forEach(function (a) { if (byId[a]) l = Math.max(l, lv(byId[a], seen) + 1); });
    return (level[s.id] = l);
  }
  steps.forEach(function (s) { var l = lv(s, {}); (stages[l] = stages[l] || []).push(s.id); });
  return stages.filter(Boolean);
}
