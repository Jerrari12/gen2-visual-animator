"""GEN2 viewer dev server - http.server with caching disabled.

Chrome's heuristic cache happily serves STALE ES modules from a plain
`python -m http.server` (it sends no Cache-Control header), which shows up
during local dev as "my main.js/generate.js edit does nothing" - toggles that
silently no-op, style swaps that only half-apply. `Cache-Control: no-store`
makes every load fresh. GitHub Pages deploys are SHA-stamped, so production
never needed this.

Run:  python serve-viewer.py            (or double-click serve-viewer.bat)
      python serve-viewer.py 8123 viewer     # port / directory overrides
"""
import functools
import http.server
import os
import sys


class NoStoreHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    sub = sys.argv[2] if len(sys.argv) > 2 else "viewer"
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), sub)
    handler = functools.partial(NoStoreHandler, directory=root)
    print(f"Serving GEN2 viewer (no-store) at http://localhost:{port}/  (Ctrl+C to stop)")
    http.server.ThreadingHTTPServer(("", port), handler).serve_forever()
