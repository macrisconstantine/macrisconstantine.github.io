"""Local preview server with caching disabled, so edits show up on reload.

Development only; the published site is plain static files served by
GitHub Pages. Any static server works — this one just avoids the browser
holding on to a stale module while you are editing.

    python .claude/devserver.py 8099
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
    print("serving on http://127.0.0.1:%d" % port, file=sys.stderr)
    ThreadingHTTPServer(("127.0.0.1", port), NoCache).serve_forever()
