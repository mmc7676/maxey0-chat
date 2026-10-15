"""Build skills/maxey0/dashboard.html from src/dashboard.src.html, src/parser.js and the logo, then syntax-check its script.

usage: python3 build-template.py <dashboard.src.html> <parser.js> <logo.webp> <out.html>
"""
import base64, pathlib, subprocess, sys, tempfile
src, parser, logo, out = map(pathlib.Path, sys.argv[1:5])
t = src.read_text()
assert t.count("__PARSER__") == 1 and t.count("__LOGO__") == 1, "template placeholders missing"
t = t.replace("__PARSER__", parser.read_text().strip()).replace("__LOGO__", base64.b64encode(logo.read_bytes()).decode())
assert t.count("__STATE__") == 1, "__STATE__ must appear exactly once"
js = t[t.index("<script>") + 8 : t.rindex("</script>")].replace("__STATE__", "{}")
with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f: f.write(js)
subprocess.run(["node", "--check", f.name], check=True)
out.write_text(t); print("built", out, len(t), "bytes")
