#!/usr/bin/env python3
"""Render docs/index.html in Chromium and save screenshots.

Serves docs/ locally, drives a headless Chromium over the DevTools protocol
(see cdp.py — no npm/playwright needed) and writes one PNG per tab.

    python3 tools/render.py                 # iPhone-formaat
    python3 tools/render.py 1280 800 out/   # eigen formaat en map
"""
import functools, http.server, json, os, subprocess, sys, threading, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cdp

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, "docs")
TABS = ["Tijdlijn", "Dromen & doelen", "Beloftes", "Agenda", "Waardering",
        "Color Jam", "Bruiloft plannen"]


def serve(port):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd.server_address[1]


def main():
    w = int(sys.argv[1]) if len(sys.argv) > 1 else 393
    h = int(sys.argv[2]) if len(sys.argv) > 2 else 852
    out = sys.argv[3] if len(sys.argv) > 3 else "shots"
    os.makedirs(out, exist_ok=True)
    port = serve(0)
    proc, ws = cdp.launch(w + 60, h + 60)
    try:
        cdp.emulate(ws, w, h, 2, w < 700)
        cdp.goto(ws, "http://127.0.0.1:%d/index.html" % port, 5)
        cdp.click_text(ws, "Tik om te openen")
        report(ws, out, "home", w)
        for tab in TABS:
            kebab(ws)
            try:
                cdp.click_text(ws, tab, 1)
            except RuntimeError:
                cdp.click_text(ws, tab, 0)
            time.sleep(0.8)
            report(ws, out, tab, w)
    finally:
        proc.kill()


def kebab(ws):
    """Open the drawer via the button in the top bar."""
    b = json.loads(cdp.js(ws, """(() => {
      const bar = [...document.querySelectorAll('div')].find(e => e.style.zIndex === '30');
      const r = bar.firstElementChild.getBoundingClientRect();
      return JSON.stringify({x: r.x + r.width / 2, y: r.y + r.height / 2});
    })()"""))
    for t in ("mousePressed", "mouseReleased"):
        ws.call("Input.dispatchMouseEvent", type=t, x=b["x"], y=b["y"],
                button="left", clickCount=1)
    time.sleep(0.8)


def report(ws, out, tab, w):
    """Print how the tab uses the vertical space, then screenshot it."""
    s = cdp.js(ws, """(() => {
      const shell = document.querySelector('div[style*="100dvh"]');
      const pane = [...shell.children].find(c => /flex: *1/.test(c.getAttribute('style') || ''));
      const r = shell.getBoundingClientRect();
      return JSON.stringify({viewport: innerHeight, shell: Math.round(r.height),
        content: pane.scrollHeight});
    })()""")
    name = tab.lower().split()[0]
    print("%-11s %s" % (tab, s))
    cdp.shot(ws, os.path.join(out, "%s-%d.png" % (name, w)))


if __name__ == "__main__":
    main()
