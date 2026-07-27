"""GEN2 telemetry dev server - serves viewer/stats/ and proxies GoatCounter.

WHY A PROXY EXISTS: the dashboard cannot call the GoatCounter API from the
browser. The token is accepted only in an Authorization header, a
non-safelisted header always forces a CORS preflight, and GoatCounter
implements no OPTIONS handler - so every authenticated cross-origin call is
refused. (Its GET responses DO carry CORS headers, which is what once made a
check against a not-yet-created site look like a green light.)

Fetching here fixes that and two other things: the token never reaches a
browser, and tracker blockers stop mattering - this process makes the request,
not the page. Nothing is published anywhere; the numbers stay on this machine.

TOKEN - one of, in order:
  1. GOATCOUNTER_TOKEN environment variable
  2. a `.goatcounter-token` file next to this script (gitignored; one line)
Create one at [site].goatcounter.com -> User -> API, with "Read statistics"
ONLY. Tokens are account-level, so the "All sites" grant covers both sites.

Run:  python serve-stats.py            (or double-click serve-stats.bat)
      python serve-stats.py 8125
Then open http://localhost:8125/
"""
import functools
import http.server
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "viewer", "stats")

SITES = {"planner": "jerrari.goatcounter.com", "build": "jerrari-build.goatcounter.com"}
RANGES = {"24h": 1, "7d": 7, "30d": 30, "90d": 90}
SERIES_DAYS = 3      # the strip only ever draws 48h; keeping 90 days of hourly arrays is waste
HITS_LIMIT = 100
CACHE_TTL = 300      # seconds; the underlying data only changes hourly
# ⚠ A whole snapshot is 7 API calls and each can be rate-limited. Retrying each
# one generously means the request can block for minutes while the page just
# says FETCHING - so the BUDGET IS FOR THE WHOLE BUILD, not per call. Past it,
# fail with something readable instead of hanging.
BUILD_BUDGET = 45.0

_cache = {}          # range -> (fetched_at, payload)
_last_call = [0.0]


def token():
    tok = os.environ.get("GOATCOUNTER_TOKEN", "").strip()
    if tok:
        return tok
    path = os.path.join(HERE, ".goatcounter-token")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            return fh.read().strip()
    return ""


def api(host, path, params=None, tries=0, deadline=None):
    """One GoatCounter call, paced under the 4 requests/second limit."""
    if deadline is None:
        deadline = time.time() + BUILD_BUDGET
    wait = 0.3 - (time.time() - _last_call[0])
    if wait > 0:
        time.sleep(wait)
    _last_call[0] = time.time()

    url = f"https://{host}/api/v0/{path}"
    if params:
        # doseq: include_paths is an ARRAY parameter and must repeat, not stringify
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token()})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 429:
            hint = float(e.headers.get("X-Rate-Limit-Reset") or 0)
            wait = min(max(hint, 1.5 * (tries + 1)), 15) + 0.25
            if time.time() + wait < deadline:
                time.sleep(wait)
                return api(host, path, params, tries + 1, deadline)
            raise RuntimeError(
                "GoatCounter is rate-limiting us (4 requests/second, and it stays "
                "limited for a while after a burst). Wait a minute, then press REFRESH."
            )
        if e.code in (401, 403):
            raise RuntimeError(
                'token rejected by %s - check it has the "Read statistics" permission '
                "and was copied whole" % host
            )
        raise RuntimeError(f"{host}/{path} -> HTTP {e.code}")


def hour_str(t):
    return time.strftime("%Y-%m-%dT%H:00:00Z", time.gmtime(t))


def for_range(host, days, deadline):
    end = time.time() // 3600 * 3600
    w = {"start": hour_str(end - days * 86400), "end": hour_str(end + 3600)}
    total = api(host, "stats/total", w, deadline=deadline)
    hits = api(host, "stats/hits", dict(w, limit=HITS_LIMIT), deadline=deadline)

    # ⚠ /stats/locations counts EVERY hit, events included, so its numbers ran
    # ~6x the pageview tile (645 for the US against 278 pageviews) and looked
    # broken. Restrict it to the non-event paths so countries and pageviews
    # describe the same thing. NB `limit` defaults to 20 on this endpoint —
    # without it the country list silently truncated at 20 and the COUNTRIES
    # tile reported that cap as if it were the real number.
    page_paths = [h["path"] for h in (hits.get("hits") or []) if not h.get("event")]
    if page_paths:
        loc = api(host, "stats/locations",
                  dict(w, limit=100, path_by_name="true", include_paths=page_paths),
                  deadline=deadline)
    else:
        loc = {"stats": []}          # no pageviews in this window: no countries to attribute
    return {
        "total": total.get("total") or 0,
        "total_events": total.get("total_events") or 0,
        "series": [{"day": d["day"], "hourly": d.get("hourly") or []}
                   for d in (total.get("stats") or [])[-SERIES_DAYS:]],
        "locations": [{"id": s.get("id"), "name": s.get("name"), "count": s.get("count")}
                      for s in (loc.get("stats") or [])],
        # each hit carries its own per-day stats array - dropped, unused by the page
        "hits": [{"path": h.get("path"), "count": h.get("count"),
                  "event": bool(h.get("event")), "title": h.get("title") or ""}
                 for h in (hits.get("hits") or [])],
    }


def resolve_tz(deadline):
    """GoatCounter reports stats in the ACCOUNT'S timezone and returns it
    region-prefixed ("US.America/New_York"), which is not a valid IANA name."""
    try:
        raw = (api(SITES["build"], "me", deadline=deadline).get("user", {})
               .get("settings", {}).get("timezone") or "")
    except Exception:
        return "UTC"
    for cand in (raw, raw.split(".", 1)[1] if "." in raw else "", "UTC"):
        if not cand:
            continue
        try:
            import zoneinfo
            zoneinfo.ZoneInfo(cand)
            return cand
        except Exception:
            continue
    return "UTC"


def snapshot(rng):
    hit = _cache.get(rng)
    if hit and time.time() - hit[0] < CACHE_TTL:
        return hit[1]
    days = RANGES[rng]
    deadline = time.time() + BUILD_BUDGET      # one budget for the whole build
    out = {"generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
           "tz": resolve_tz(deadline), "sites": {}}
    for sid, host in SITES.items():
        out["sites"][sid] = {rng: for_range(host, days, deadline)}
    _cache[rng] = (time.time(), out)
    return out


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.rstrip("/") in ("/data.json", "/data"):
            return self.serve_data(urllib.parse.parse_qs(parsed.query))
        return super().do_GET()

    def serve_data(self, qs):
        rng = (qs.get("range") or ["7d"])[0]
        if rng not in RANGES:
            return self.fail(400, f"unknown range {rng!r}")
        if not token():
            return self.fail(500, "No API token. Set GOATCOUNTER_TOKEN, or put the token "
                                  "in a .goatcounter-token file next to serve-stats.py.")
        try:
            body = json.dumps(snapshot(rng)).encode("utf-8")
        except RuntimeError as e:
            return self.fail(502, str(e))
        except Exception as e:                       # network, JSON, anything else
            return self.fail(502, f"{type(e).__name__}: {e}")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def fail(self, code, msg):
        body = json.dumps({"error": msg}).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8125
    if not token():
        print("!! No token found. Set GOATCOUNTER_TOKEN or create .goatcounter-token")
        print("   ([site].goatcounter.com -> User -> API, tick 'Read statistics' only)")
    handler = functools.partial(Handler, directory=ROOT)
    print(f"GEN2 telemetry at http://localhost:{port}/   (Ctrl+C to stop)")
    print("Stats stay on this machine - nothing is published.")
    http.server.ThreadingHTTPServer(("", port), handler).serve_forever()
