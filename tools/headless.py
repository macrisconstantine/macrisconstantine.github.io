#!/usr/bin/env python3
"""Drive a headless Chrome/Edge over the DevTools protocol.

The site has no build step and no npm, so this is the whole test and
screenshot toolchain: one file, standard library plus `websocket-client`.

    python tools/headless.py shot  <url> <out.png> [options]
    python tools/headless.py eval  <url> "<js expression>" [options]
    python tools/headless.py test  <url> [options]

Options
    --size WxH        viewport in CSS pixels            (default 1280x800)
    --dpr N           device pixel ratio                (default 1)
    --mobile          emulate a touch phone
    --wait SECONDS    settle time after load            (default 1.0)
    --js EXPR         (shot) run this first; may be async
    --selector CSS    (shot) capture just this element
    --full            (shot) capture the whole scrollable page
    --timeout SECONDS overall limit                     (default 60)
    --motion full|reduce   emulate prefers-reduced-motion either way; without
                      it the page sees the host's own setting
    --media print     emulate the print stylesheet
    --quiet           do not echo page console errors to stderr

`eval` prints the expression's value as JSON. `test` loads a page that sets
`window.__TEST_RESULTS__ = {passed, failed, results:[{name, ok, detail}]}`
when it has finished, prints a report and exits non-zero on any failure.
Every command exits 2 if the page threw an uncaught exception.
"""
import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

try:
    import websocket  # websocket-client
except ImportError:  # pragma: no cover
    sys.exit("needs the websocket-client package:  pip install websocket-client")

BROWSERS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
]


def find_browser():
    env = os.environ.get("HEADLESS_BROWSER")
    if env and os.path.exists(env):
        return env
    for path in BROWSERS:
        if os.path.exists(path):
            return path
    sys.exit("no Chrome or Edge found; set HEADLESS_BROWSER to its path")


class Page:
    """One headless browser with one tab, spoken to over CDP."""

    def __init__(self, width, height, dpr=1, mobile=False, motion=None, media=None):
        self.profile = tempfile.mkdtemp(prefix="headless-")
        self.errors = []      # console.error + uncaught exceptions
        self.exceptions = []  # uncaught exceptions only
        self._id = 0
        self.proc = subprocess.Popen(
            [find_browser(), "--headless=new", "--remote-debugging-port=0",
             "--remote-allow-origins=*", f"--user-data-dir={self.profile}",
             "--no-first-run", "--no-default-browser-check", "--disable-extensions",
             "--hide-scrollbars", "--mute-audio", "--autoplay-policy=no-user-gesture-required",
             "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader",
             f"--window-size={width},{height}", "about:blank"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        port = self._port()
        target = None
        for _ in range(100):
            try:
                tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list"))
                target = next((t for t in tabs if t.get("type") == "page"), None)
                if target:
                    break
            except OSError:
                pass
            time.sleep(0.1)
        if not target:
            self.close()
            sys.exit("browser started but exposed no page target")
        self.ws = websocket.create_connection(
            target["webSocketDebuggerUrl"], suppress_origin=True, timeout=120)
        for domain in ("Page", "Runtime", "Log"):
            self.send(f"{domain}.enable")
        self.send("Emulation.setDeviceMetricsOverride", width=width, height=height,
                  deviceScaleFactor=dpr, mobile=mobile)
        if mobile:
            self.send("Emulation.setTouchEmulationEnabled", enabled=True, maxTouchPoints=5)
            self.send("Emulation.setUserAgentOverride", userAgent=(
                "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36"))
        # The host's own setting leaks in otherwise: with animation effects
        # switched off in Windows, every page here would report "reduce".
        if motion or media:
            value = {"full": "no-preference", "reduce": "reduce"}.get(motion)
            self.send("Emulation.setEmulatedMedia", media=media or "",
                      features=[{"name": "prefers-reduced-motion", "value": value}] if value else [])

    def _port(self):
        marker = os.path.join(self.profile, "DevToolsActivePort")
        for _ in range(200):
            if os.path.exists(marker):
                with open(marker) as fh:
                    first = fh.readline().strip()
                if first.isdigit():
                    return int(first)
            if self.proc.poll() is not None:
                break
            time.sleep(0.1)
        self.close()
        sys.exit("browser did not open a debugging port")

    # ------------------------------------------------------------------ CDP

    def send(self, method, **params):
        self._id += 1
        mine = self._id
        self.ws.send(json.dumps({"id": mine, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == mine:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error'].get('message')}")
                return msg.get("result", {})
            self._event(msg)

    def _event(self, msg):
        method, p = msg.get("method"), msg.get("params", {})
        if method == "Runtime.exceptionThrown":
            d = p.get("exceptionDetails", {})
            text = (d.get("exception", {}) or {}).get("description") or d.get("text", "exception")
            where = f"{d.get('url', '')}:{d.get('lineNumber', '?')}"
            self.exceptions.append(f"{text}  [{where}]")
            self.errors.append(f"uncaught: {text}  [{where}]")
        elif method == "Runtime.consoleAPICalled" and p.get("type") in ("error", "assert"):
            parts = [str(a.get("value", a.get("description", ""))) for a in p.get("args", [])]
            self.errors.append("console.error: " + " ".join(parts))
        elif method == "Log.entryAdded" and p.get("entry", {}).get("level") == "error":
            e = p["entry"]
            self.errors.append(f"log: {e.get('text', '')}  [{e.get('url', '')}]")
        elif method == "Page.loadEventFired":
            self._loaded = True

    def pump(self, seconds):
        """Let the page run, collecting events as they arrive."""
        end = time.time() + seconds
        while True:
            left = end - time.time()
            if left <= 0:
                break
            self.ws.settimeout(max(0.01, min(left, 0.25)))
            try:
                self._event(json.loads(self.ws.recv()))
            except websocket.WebSocketTimeoutException:
                pass
        self.ws.settimeout(120)

    def goto(self, url, wait=1.0, timeout=60):
        self._loaded = False
        self.send("Page.navigate", url=url)
        end = time.time() + timeout
        while not self._loaded and time.time() < end:
            self.pump(0.1)
        self.pump(wait)

    def evaluate(self, expression, timeout=60):
        res = self.send("Runtime.evaluate", expression=expression, awaitPromise=True,
                        returnByValue=True, userGesture=True, timeout=int(timeout * 1000))
        if "exceptionDetails" in res:
            d = res["exceptionDetails"]
            raise RuntimeError((d.get("exception", {}) or {}).get("description") or d.get("text"))
        return res.get("result", {}).get("value")

    def screenshot(self, path, selector=None, full=False):
        params = {"format": "png"}
        if selector:
            box = self.evaluate(
                "(() => { const e = document.querySelector(%s); if (!e) return null;"
                " e.scrollIntoView({block:'center'});"
                " const r = e.getBoundingClientRect();"
                " return {x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height}; })()"
                % json.dumps(selector))
            if not box:
                raise RuntimeError(f"no element matches {selector}")
            params["clip"] = {**box, "scale": 1}
            params["captureBeyondViewport"] = True
        elif full:
            m = self.send("Page.getLayoutMetrics")["cssContentSize"]
            params["clip"] = {"x": 0, "y": 0, "width": m["width"], "height": m["height"], "scale": 1}
            params["captureBeyondViewport"] = True
        data = self.send("Page.captureScreenshot", **params)["data"]
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(base64.b64decode(data))

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass
        try:
            self.proc.terminate()
            self.proc.wait(timeout=10)
        except Exception:
            try:
                self.proc.kill()
            except Exception:
                pass
        shutil.rmtree(self.profile, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["shot", "eval", "test"])
    ap.add_argument("url")
    ap.add_argument("arg", nargs="?", help="output path (shot) or expression (eval)")
    ap.add_argument("--size", default="1280x800")
    ap.add_argument("--dpr", type=float, default=1)
    ap.add_argument("--mobile", action="store_true")
    ap.add_argument("--wait", type=float, default=1.0)
    ap.add_argument("--js")
    ap.add_argument("--selector")
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--timeout", type=float, default=60)
    ap.add_argument("--motion", choices=["full", "reduce"],
                    help="emulate prefers-reduced-motion (default: whatever the host reports)")
    ap.add_argument("--media", choices=["print", "screen"], help="emulate a CSS media type")
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args()

    if a.command in ("shot", "eval") and not a.arg:
        ap.error(f"{a.command} needs an output path / expression")
    w, h = (int(v) for v in a.size.lower().split("x"))
    page = Page(w, h, a.dpr, a.mobile, a.motion, a.media)
    code = 0
    try:
        page.goto(a.url, a.wait, a.timeout)
        if a.command == "shot":
            if a.js:
                page.evaluate(a.js, a.timeout)
                page.pump(0.3)
            page.screenshot(a.arg, a.selector, a.full)
            print(a.arg)
        elif a.command == "eval":
            print(json.dumps(page.evaluate(a.arg, a.timeout), indent=2, ensure_ascii=False))
        else:
            end = time.time() + a.timeout
            res = None
            while time.time() < end:
                res = page.evaluate("window.__TEST_RESULTS__ || null")
                if res:
                    break
                page.pump(0.25)
            if not res:
                print("TIMEOUT: page never set window.__TEST_RESULTS__")
                code = 1
            else:
                for r in res.get("results", []):
                    mark = "ok  " if r.get("ok") else "FAIL"
                    detail = "" if r.get("ok") else f"   -> {r.get('detail', '')}"
                    print(f"  {mark} {r.get('name')}{detail}")
                print(f"\n{res.get('passed', 0)} passed, {res.get('failed', 0)} failed")
                code = 1 if res.get("failed") else 0
    except RuntimeError as err:
        print(f"ERROR: {err}", file=sys.stderr)
        code = 2
    finally:
        if page.errors and not a.quiet:
            print("\npage errors:", file=sys.stderr)
            for e in page.errors[:40]:
                print("  " + e, file=sys.stderr)
        if page.exceptions and code == 0:
            code = 2
        page.close()
    sys.exit(code)


if __name__ == "__main__":
    main()
