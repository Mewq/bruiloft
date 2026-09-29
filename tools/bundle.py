#!/usr/bin/env python3
"""Pak docs/index.html uit naar bewerkbare bestanden en weer terug.

docs/index.html is een gebundelde pagina: de app zelf staat als JSON-string in
<script type="__bundler/template">, en het spel (Color Jam) zit als gzip+base64
in het manifest, met daarbinnen wéér een eigen template. Rechtstreeks bewerken
is dus onleesbaar. Dit script haalt beide templates eruit:

    python3 tools/bundle.py unpack MAP     # schrijft MAP/app.html en MAP/game.html
    python3 tools/bundle.py pack MAP       # zet ze terug in docs/index.html

Alleen de twee templates worden vervangen; al het andere (fonts, afbeeldingen,
loader) blijft byte voor byte gelijk.
"""
import base64
import gzip
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir)
INDEX = os.path.join(ROOT, "docs", "index.html")
GAME_KEY = "909eacc0-0316-42ab-afcc-88d4acdf019f"

TEMPLATE_RE = re.compile(r'(<script type="__bundler/template">\s*)(.*?)(\s*</script>)', re.S)
MANIFEST_RE = re.compile(r'(<script type="__bundler/manifest">\s*)(.*?)(\s*</script>)', re.S)


def encode_template(text):
    # "</" moet ge-escaped blijven, anders sluit het de <script> van de bundel af.
    return json.dumps(text).replace("</", "<\\/")


def read_parts(html):
    tm = TEMPLATE_RE.search(html)
    return tm, json.loads(tm.group(2))


def unpack(out):
    html = open(INDEX, encoding="utf-8").read()
    _, app = read_parts(html)
    mm = MANIFEST_RE.search(html)
    manifest = json.loads(mm.group(2))
    game_html = gzip.decompress(base64.b64decode(manifest[GAME_KEY]["data"])).decode("utf-8")
    _, game = read_parts(game_html)
    os.makedirs(out, exist_ok=True)
    open(os.path.join(out, "app.html"), "w", encoding="utf-8").write(app)
    open(os.path.join(out, "game.html"), "w", encoding="utf-8").write(game)
    print("uitgepakt naar", out, "- app %d tekens, spel %d tekens" % (len(app), len(game)))


def pack(src):
    app = open(os.path.join(src, "app.html"), encoding="utf-8").read()
    game = open(os.path.join(src, "game.html"), encoding="utf-8").read()
    html = open(INDEX, encoding="utf-8").read()

    mm = MANIFEST_RE.search(html)
    manifest = json.loads(mm.group(2))
    game_html = gzip.decompress(base64.b64decode(manifest[GAME_KEY]["data"])).decode("utf-8")
    gm, _ = read_parts(game_html)
    game_html = game_html[:gm.start(2)] + encode_template(game) + game_html[gm.end(2):]
    manifest[GAME_KEY]["data"] = base64.b64encode(gzip.compress(game_html.encode("utf-8"), 9)).decode()
    html = html[:mm.start(2)] + json.dumps(manifest) + html[mm.end(2):]

    tm, _ = read_parts(html)
    html = html[:tm.start(2)] + encode_template(app) + html[tm.end(2):]

    # Controle: een onge-escapete "</script>" in een template zou de bundel breken.
    before = open(INDEX, encoding="utf-8").read().count("</script>")
    assert html.count("</script>") == before, "onge-escapete </script> in een template"
    open(INDEX, "w", encoding="utf-8").write(html)
    print("ingepakt in docs/index.html (%d KB)" % (len(html) // 1024))


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("unpack", "pack"):
        sys.exit(__doc__)
    (unpack if sys.argv[1] == "unpack" else pack)(sys.argv[2])
