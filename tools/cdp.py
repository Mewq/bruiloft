"""Minimal CDP client: raw RFC6455 websocket, no third-party deps."""
import base64, json, os, socket, struct, subprocess, time, urllib.request

CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

class WS:
    def __init__(self, url):
        _, rest = url.split("://", 1)
        hostport, path = rest.split("/", 1)
        host, port = hostport.split(":")
        self.s = socket.create_connection((host, int(port)))
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall(("GET /%s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\n"
                        "Connection: Upgrade\r\nSec-WebSocket-Key: %s\r\n"
                        "Sec-WebSocket-Version: 13\r\n\r\n" % (path, hostport, key)).encode())
        self.buf = b""
        while b"\r\n\r\n" not in self.buf:
            self.buf += self.s.recv(4096)
        self.buf = self.buf.split(b"\r\n\r\n", 1)[1]
        self.id = 0

    def _read(self, n):
        while len(self.buf) < n:
            d = self.s.recv(65536)
            if not d: raise EOFError
            self.buf += d
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def send(self, method, **params):
        self.id += 1
        payload = json.dumps({"id": self.id, "method": method, "params": params}).encode()
        head = struct.pack("!BB", 0x81, 0x80 | (126 if len(payload) < 65536 else 127) if len(payload) > 125 else 0x80 | len(payload))
        if len(payload) > 125:
            head += struct.pack("!H", len(payload)) if len(payload) < 65536 else struct.pack("!Q", len(payload))
        mask = os.urandom(4)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.s.sendall(head + mask + masked)
        return self.id

    def recv(self):
        b1, b2 = struct.unpack("!BB", self._read(2))
        ln = b2 & 0x7F
        if ln == 126: ln = struct.unpack("!H", self._read(2))[0]
        elif ln == 127: ln = struct.unpack("!Q", self._read(8))[0]
        return json.loads(self._read(ln).decode())

    def call(self, method, **params):
        i = self.send(method, **params)
        while True:
            m = self.recv()
            if m.get("id") == i:
                if "error" in m: raise RuntimeError(m["error"])
                return m.get("result", {})

def launch(width, height, port=9333):
    proc = subprocess.Popen(
        [CHROME, "--headless=new", "--no-sandbox", "--disable-gpu", "--no-proxy-server",
         "--hide-scrollbars", "--remote-debugging-port=%d" % port,
         "--window-size=%d,%d" % (width, height), "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(80):
        try:
            v = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json/list" % port))
            if v: return proc, WS(v[0]["webSocketDebuggerUrl"])
        except Exception: time.sleep(0.25)
    raise RuntimeError("chrome did not start")

def goto(ws, url, wait=3.0):
    ws.call("Page.enable"); ws.call("Runtime.enable")
    ws.call("Page.navigate", url=url); time.sleep(wait)

def js(ws, expr):
    r = ws.call("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
    return r.get("result", {}).get("value")

def shot(ws, path):
    d = ws.call("Page.captureScreenshot", format="png")
    open(path, "wb").write(base64.b64decode(d["data"]))
    return path

def emulate(ws, w, h, dsf=2, mobile=True):
    ws.call("Emulation.setDeviceMetricsOverride", width=w, height=h,
            deviceScaleFactor=dsf, mobile=mobile)

def click_text(ws, text, nth=0):
    """Click the nth element whose trimmed text equals/contains `text`."""
    box = js(ws, """(() => {
      const t = %s, n = %d;
      const els = [...document.querySelectorAll('div,button,span,h2,h3')]
        .filter(e => e.textContent.trim().includes(t) &&
                     ![...e.children].some(c => c.textContent.trim().includes(t)));
      const e = els[n]; if (!e) return null;
      const r = e.getBoundingClientRect();
      return JSON.stringify({x: r.x + r.width/2, y: r.y + r.height/2});
    })()""" % (json.dumps(text), nth))
    if not box:
        raise RuntimeError("no element for %r" % text)
    b = json.loads(box)
    for typ in ("mousePressed", "mouseReleased"):
        ws.call("Input.dispatchMouseEvent", type=typ, x=b["x"], y=b["y"],
                button="left", clickCount=1)
    time.sleep(0.6)
