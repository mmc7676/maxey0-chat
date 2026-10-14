"""Build skills/maxey0/dashboard.html from dashboard.src.html + logo, then syntax-check its script."""
import base64, pathlib, subprocess, sys, tempfile
src, logo, out = map(pathlib.Path, sys.argv[1:4])
t = src.read_text().replace("__LOGO__", base64.b64encode(logo.read_bytes()).decode())
assert t.count("__STATE__") == 1, "__STATE__ must appear exactly once"
js = t[t.index("<script>") + 8 : t.rindex("</script>")].replace("__STATE__", "{}")
with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f: f.write(js)
subprocess.run(["node", "--check", f.name], check=True)
out.write_text(t); print("built", out, len(t), "bytes")
