// Snapshot the GoatCounter API into one JSON file for viewer/stats/.
//
// WHY THIS EXISTS: the dashboard cannot read the API directly. GoatCounter
// accepts the token ONLY in an Authorization header, a non-safelisted header
// always triggers a CORS preflight, and GoatCounter answers no OPTIONS request
// — so any browser page on another origin is refused, permanently. (Its GET
// responses DO carry CORS headers, which is what made an early check look
// green; that check ran against a site code that didn't exist yet and fell
// through to a generic handler.)
//
// Running here instead of in the browser fixes three things at once: no CORS,
// the token never leaves GitHub Secrets, and tracker blockers stop mattering —
// the request is made by a runner, not by a visitor's browser.
//
// Reads GOATCOUNTER_TOKEN. Writes data.json to the path given as argv[2].

import { writeFileSync } from 'node:fs';

const TOKEN = process.env.GOATCOUNTER_TOKEN;
if (!TOKEN) { console.error('GOATCOUNTER_TOKEN is not set'); process.exit(1); }
const OUT = process.argv[2] || 'data.json';

const SITES = { planner: 'jerrari.goatcounter.com', build: 'jerrari-build.goatcounter.com' };
const RANGES = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 };
// The activity strip only ever draws the last 48 hours, so keeping every day's
// hourly array for a 90-day window would bloat the file for nothing.
const SERIES_DAYS = 3;
const HITS_LIMIT = 100;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ⚠ 4 requests/second, enforced. This script issues ~26, so it paces and
// retries rather than firing them off in parallel.
let lastCall = 0;
async function api(host, path, params = {}, tries = 0) {
  const wait = 300 - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();

  const url = new URL(`https://${host}/api/v0/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + TOKEN } });

  if (res.status === 429 && tries < 4) {
    const reset = parseInt(res.headers.get('X-Rate-Limit-Reset') || '', 10);
    await sleep(Math.min(Number.isFinite(reset) ? reset * 1000 : 1500, 8000) + 250);
    return api(host, path, params, tries + 1);
  }
  if (!res.ok) throw new Error(`${host}/${path} → HTTP ${res.status}`);
  return res.json();
}

const hourRounded = d => d.toISOString().slice(0, 13) + ':00:00Z';

async function forRange(host, days) {
  const end = new Date(); end.setMinutes(0, 0, 0);
  const w = {
    start: hourRounded(new Date(end.getTime() - days * 864e5)),
    end: hourRounded(new Date(end.getTime() + 36e5)),
  };
  const [total, loc, hits] = [
    await api(host, 'stats/total', w),
    await api(host, 'stats/locations', w),
    await api(host, 'stats/hits', { ...w, limit: HITS_LIMIT }),
  ];
  return {
    total: total.total || 0,
    total_events: total.total_events || 0,
    // trimmed to the tail the strip actually draws
    series: (total.stats || []).slice(-SERIES_DAYS).map(d => ({ day: d.day, hourly: d.hourly || [] })),
    locations: (loc.stats || []).map(s => ({ id: s.id, name: s.name, count: s.count })),
    // each hit carries its own per-day stats array — dropped, the dashboard
    // never reads it and it would multiply the file size
    hits: (hits.hits || []).map(h => ({ path: h.path, count: h.count, event: !!h.event, title: h.title || '' })),
  };
}

const out = { generated: new Date().toISOString(), tz: 'UTC', sites: {} };

// GoatCounter reports stats in the ACCOUNT's timezone and returns it
// region-prefixed ("US.America/New_York"), which is not a valid IANA name.
try {
  const me = await api(SITES.build, 'me');
  const raw = me?.user?.settings?.timezone || '';
  const dot = raw.indexOf('.');
  for (const c of [raw, dot > -1 ? raw.slice(dot + 1) : '', 'UTC']) {
    if (!c) continue;
    try { new Intl.DateTimeFormat('en-CA', { timeZone: c }); out.tz = c; break; } catch (e) { /* next */ }
  }
} catch (e) { console.error('timezone lookup failed, assuming UTC:', e.message); }

for (const [id, host] of Object.entries(SITES)) {
  out.sites[id] = {};
  for (const [rid, days] of Object.entries(RANGES)) {
    out.sites[id][rid] = await forRange(host, days);
    console.log(`${id} ${rid}: ${out.sites[id][rid].hits.length} rows`);
  }
}

writeFileSync(OUT, JSON.stringify(out));
console.log(`wrote ${OUT} · tz=${out.tz} · ${(JSON.stringify(out).length / 1024).toFixed(1)} kB`);
