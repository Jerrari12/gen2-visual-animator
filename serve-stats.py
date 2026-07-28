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
import threading
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
# The data is HOURLY - refetching more often spends quota to learn nothing.
# The page's REFRESH button sends fresh=1 to bypass this deliberately.
CACHE_TTL = 3300
# ⚠ THE REAL LIMIT IS NOT THE DOCUMENTED "4 requests/second". Measured from a
# live 429, GoatCounter enforces a BUDGET: X-Rate-Limit-Limit 500 with
# X-Rate-Limit-Reset counting down ~765s. So it is ~500 requests per ~13-minute
# window, and once spent NOTHING gets through until the window rolls over.
# Pacing cannot save you from that - only making fewer calls can. A build is 7
# calls, so normal use is nowhere near it; development thrash is what burns it.
BUILD_BUDGET = 45.0

_cache = {}          # range -> (fetched_at, payload)
_last_call = [0.0]
_quota = [None]      # X-Rate-Limit-Remaining from the last successful call
_tz_cache = [None]   # resolved once per process - it cost 1 API call per build
_api_log = []        # timestamps of our API calls, for the console accounting
# ⚠ ThreadingHTTPServer serves requests CONCURRENTLY, and a browser giving up
# does not stop the work already running here. Without these locks every
# REFRESH started another build, the builds interleaved past 4 req/s, and the
# rate limiter never got a quiet moment to reset - a self-sustaining overload
# that looks exactly like "the API is down".
_api_lock = threading.Lock()     # strictly one in-flight API call, paced
_build_lock = threading.Lock()   # one snapshot build at a time; the rest reuse its result
PACE = 0.35                      # ~2.8 req/s, comfortably under the limit


def token():
    tok = os.environ.get("GOATCOUNTER_TOKEN", "").strip()
    if tok:
        return tok
    path = os.path.join(HERE, ".goatcounter-token")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            return fh.read().strip()
    return ""


def api(host, path, params=None, deadline=None):
    """One GoatCounter call. Serialised and paced under the 4 req/s limit.

    The lock is held for the whole call INCLUDING back-off sleeps: while we are
    being rate-limited, the right number of concurrent requests is zero.
    """
    if deadline is None:
        deadline = time.time() + BUILD_BUDGET
    url = f"https://{host}/api/v0/{path}"
    if params:
        # doseq: include_paths is an ARRAY parameter and must repeat, not stringify
        url += "?" + urllib.parse.urlencode(params, doseq=True)

    with _api_lock:
        tries = 0
        while True:
            wait = PACE - (time.time() - _last_call[0])
            if wait > 0:
                time.sleep(wait)
            _last_call[0] = time.time()
            now = time.time()
            _api_log.append(now)
            while _api_log and _api_log[0] < now - 900:
                _api_log.pop(0)
            req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token()})
            try:
                with urllib.request.urlopen(req, timeout=30) as res:
                    rem = res.headers.get("X-Rate-Limit-Remaining")
                    if rem is not None:
                        _quota[0] = int(rem)
                    print(f"[api] {path}: ok · {len(_api_log)} calls in last 15m · quota left {rem}")
                    return json.loads(res.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    print(f"[api] {path}: 429 · {len(_api_log)} calls in last 15m · "
                          f"reset {e.headers.get('X-Rate-Limit-Reset')}s")
                    # The server tells us exactly how long the window has left.
                    # Retrying a 12-minute reset in 15-second nibbles just burns
                    # attempts and looks like a hang, so only retry when the wait
                    # genuinely fits the budget; otherwise report the real number.
                    reset = float(e.headers.get("X-Rate-Limit-Reset") or 0)
                    back = reset if reset > 0 else 1.5 * (tries + 1)
                    if back + time.time() < deadline and tries < 6:
                        time.sleep(back + 0.25)
                        tries += 1
                        continue
                    mins = int(reset // 60)
                    secs = int(reset % 60)
                    when = f"{mins}m {secs}s" if mins else f"{secs}s"
                    raise RuntimeError(
                        f"GoatCounter quota is spent — it allows about "
                        f"{e.headers.get('X-Rate-Limit-Limit') or '500'} requests per "
                        f"window and the window resets in {when}. Nothing will load "
                        f"until then; this isn't a token or network problem."
                    )
                if e.code in (401, 403):
                    raise RuntimeError(
                        'token rejected by %s - check it has the "Read statistics" '
                        "permission and was copied whole" % host
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
        filt = dict(w, limit=100, path_by_name="true", include_paths=page_paths)
        loc = api(host, "stats/locations", filt, deadline=deadline)
        # Referrers, same pageview-only restriction: a source that "sent" a
        # button click is meaningless, and unfiltered these inherit the same
        # ~6x event inflation the country list had.
        refs = api(host, "stats/toprefs", filt, deadline=deadline)
    else:
        loc = {"stats": []}          # no pageviews in this window: no countries to attribute
        refs = {"stats": []}
    return {
        "total": total.get("total") or 0,
        "total_events": total.get("total_events") or 0,
        "series": [{"day": d["day"], "hourly": d.get("hourly") or []}
                   for d in (total.get("stats") or [])[-SERIES_DAYS:]],
        "locations": [{"id": s.get("id"), "name": s.get("name"), "count": s.get("count")}
                      for s in (loc.get("stats") or [])],
        # ref_scheme: h=HTTP referer, g=generated (GoatCounter groups all Google
        # domains into one "Google"), c=campaign (our ?ref= / utm_source), o=other
        "refs": [{"name": s.get("name") or "", "count": s.get("count") or 0,
                  "scheme": s.get("ref_scheme") or ""}
                 for s in (refs.get("stats") or [])],
        # each hit carries its own per-day stats array - dropped, unused by the page
        "hits": [{"path": h.get("path"), "count": h.get("count"),
                  "event": bool(h.get("event")), "title": h.get("title") or ""}
                 for h in (hits.get("hits") or [])],
    }


def resolve_tz(deadline):
    """GoatCounter reports stats in the ACCOUNT'S timezone and returns it
    region-prefixed ("US.America/New_York"), which is not a valid IANA name.
    Cached for the life of the process - it doesn't change, and uncached it
    cost one API call on every single build."""
    if _tz_cache[0]:
        return _tz_cache[0]
    try:
        raw = (api(SITES["build"], "me", deadline=deadline).get("user", {})
               .get("settings", {}).get("timezone") or "")
    except Exception:
        return "UTC"
    stripped = raw.split(".", 1)[1] if "." in raw else raw
    for cand in (raw, stripped):
        if not cand:
            continue
        try:
            import zoneinfo
            zoneinfo.ZoneInfo(cand)
            _tz_cache[0] = cand
            return cand
        except Exception:
            continue
    # ⚠ zoneinfo on Windows often has NO tz database at all (needs the `tzdata`
    # package), so it rejects EVERY name — including real ones — and this fell
    # through to UTC while looking like a quota problem. The page's Intl-based
    # fallback is the real guard, so accept a plausible IANA name syntactically.
    if stripped and "/" in stripped:
        _tz_cache[0] = stripped
        return stripped
    _tz_cache[0] = "UTC"     # the lookup SUCCEEDED and resolved to nothing — cache that too
    return "UTC"


def snapshot(rng, force=False):
    def cached():
        hit = _cache.get(rng)
        return hit[1] if hit and time.time() - hit[0] < CACHE_TTL else None

    fresh = None if force else cached()
    if fresh:
        return fresh
    # single-flight: whoever gets the lock builds, everyone else takes the
    # result rather than launching a competing build against the same quota
    with _build_lock:
        fresh = None if force else cached()
        if fresh:
            return fresh
        try:
            return _build(rng)
        except RuntimeError as e:
            # quota spent or API down - old numbers beat a wall of nothing.
            # _cache is never evicted, so whatever loaded last is still here.
            hit = _cache.get(rng)
            if hit:
                stale = dict(hit[1])
                stale["stale"] = True
                stale["stale_error"] = str(e)
                return stale
            raise


def _build(rng):
    days = RANGES[rng]
    deadline = time.time() + BUILD_BUDGET      # one budget for the whole build
    out = {"generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
           "tz": resolve_tz(deadline), "sites": {}}
    for sid, host in SITES.items():
        out["sites"][sid] = {rng: for_range(host, days, deadline)}
    out["quota"] = _quota[0]        # requests left in this window, for the header
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
        force = (qs.get("fresh") or ["0"])[0] == "1"
        if rng not in RANGES:
            return self.fail(400, f"unknown range {rng!r}")
        if not token():
            return self.fail(500, "No API token. Set GOATCOUNTER_TOKEN, or put the token "
                                  "in a .goatcounter-token file next to serve-stats.py.")
        try:
            body = json.dumps(snapshot(rng, force)).encode("utf-8")
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


class Server(http.server.ThreadingHTTPServer):
    # ⚠ http.server defaults allow_reuse_address=True, and on Windows that lets
    # MULTIPLE processes bind the same port simultaneously. Every "restart" then
    # ADDS a server instead of replacing one, requests land on whichever process
    # wins, and stale code keeps answering (three servers were once found
    # sharing 8125, two of them old builds hammering the API quota). A second
    # instance must fail loudly instead.
    allow_reuse_address = False


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8125
    if not token():
        print("!! No token found. Set GOATCOUNTER_TOKEN or create .goatcounter-token")
        print("   ([site].goatcounter.com -> User -> API, tick 'Read statistics' only)")
    handler = functools.partial(Handler, directory=ROOT)
    try:
        srv = Server(("", port), handler)
    except OSError:
        print(f"!! Port {port} is already in use - another serve-stats window is open.")
        print("   Close the other black console window (or all of them) and run this again.")
        sys.exit(1)
    print(f"GEN2 telemetry at http://localhost:{port}/   (Ctrl+C to stop)  [pid {os.getpid()}]")
    print("Stats stay on this machine - nothing is published.")
    srv.serve_forever()
