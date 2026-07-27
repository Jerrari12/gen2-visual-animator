# Session handoff — GEN2 viewer + planner (2026-07-27)

Read this first, then `CLAUDE.md` (auto-loaded). This file is the TRANSIENT
state — what's in flight and what's next. `CLAUDE.md` has the durable how/why.

**Supersedes `2026-07-25-session-handoff.md`.** Its §1 (deploy gate) stays
closed; its §2 (magnet buy-links) and §3 (gap list) are UNTOUCHED and still the
next work — see §3 below.

---

## 1. ✅ The GoatCounter site is CREATED and accepting hits

Joey created **`jerrari-build.goatcounter.com`** on 2026-07-27 (its "Your site"
is set to gen2build.jerrari3d.com; retention 0 = never delete; Sessions +
Referrer on, which is what makes `&ref=` attribution work). **Verified against
production the same day** — `/count` returns the 1×1 GIF, while a made-up site
code 404s, so the test discriminates. Nothing outstanding here.

The endpoint lives in exactly two places if it ever needs changing: the
`data-goatcounter` tag in `viewer/index.html` and `viewer/builds/index.html`.

⚠ **Keep `src="https://gc.zgo.at/count.js"` ABSOLUTE.** GoatCounter's own copy-
paste snippet gives you protocol-relative `//gc.zgo.at/...`; opened via
`file://` that resolves to a Windows network share and hangs the page for
minutes. Both apps are deliberately pinned to `https://` — don't "fix" them to
match the snippet.

**Why separate from the planner's `jerrari.goatcounter.com`:** both apps serve a
page at `/`, so one shared site would merge their pageviews into a single
meaningless row. Separate sites also mean viewer events need no app prefix.
Sites live under Settings → **Sites** (GoatCounter doesn't call it "additional
sites" anywhere in the UI).

---

## 2. ✅ SHIPPED THIS SESSION

### a. Site icons on all four properties
The Jerrari J on a `#2c2d31` rounded tile — `favicon.svg` + `favicon.ico`
(16/32/48) + `apple-touch-icon.png` (180), identical files in all four repos,
generated from the committed `jerrari-logo.svg`. No new artwork was needed.
Joey picked **86% fill** from a proof sheet (94% crowded the tile corners).

Two things worth remembering (both in CLAUDE.md):
- The tile is **required** — the mark's core is a WHITE path, so a transparent
  icon dissolves into a light tab bar and drops to an outline.
- **BOTH label-generator repos have mixed line endings**, not just Classic Pro
  as previously documented. A normal write normalises them: a 6-line insert
  produced a **260-line diff**. They were edited byte-exactly instead.

### b. Analytics on the viewer — the blackout is over
The 3D Build Studio had **zero** tracking. It now has the doc's Priority 1–2 and
most of 5–6. Full event list + design notes in CLAUDE.md.

⚠ **The analytics doc's premise about the PLANNER was wrong** — it claimed
"pageviews only, no custom events". The planner has had `track()` plus ~28 call
sites for a long time, so its Priority 2/5 were already done. **No planner code
changed this session** beyond the favicon. Don't re-do that work.

Also: the doc's "`window.goatcounter` was undefined when I checked" is expected,
not a failure — GoatCounter's endpoint is on EasyPrivacy, so ad-blocked visitors
are permanently uncounted. A floor on the numbers; nothing to fix.

### c. Two pre-existing bugs fixed on the way past
- **No WebGL hung the loading spinner forever** (uncaught renderer throw). Now a
  readable message + `error:webgl`. Those visitors were invisible before.
- **The `#build=` catch conflated three failures** into "this link is damaged,
  copy it again" — including builds that decoded perfectly and were merely
  unsupported. Now split three ways in the events (messages unchanged).

### d. Telemetry dashboard — `/stats/`
A retro-HUD GoatCounter front end at **gen2build.jerrari3d.com/stats/**: neon
thermal world map, 48-hour activity strip, totals, top countries. Reads the API
straight from the browser (GoatCounter allows CORS); tokens live in
localStorage only, one per site, pasted by Joey — nothing in the repo. Design
notes + the three map gotchas are in CLAUDE.md.

**v1 is deliberately just the map + strip** (Joey's pick). The three panels
left on the table are each roughly one function: the **build funnel**
(`step:1…11` → `complete` drop-off, the thing nothing else can show),
**normalised referrers**, and **kit/store demand**. `load()` already merges
across sites, so a new panel is a fetch + a render call.

⚠ **Hourly is GoatCounter's floor** — GA4-style per-minute "active users" can't
be reproduced, and the UI says so rather than implying otherwise.

### e. `&ref=` convention documented
`&from=` seeds the store preference but is NOT attribution — every kit page on a
platform sends the same value. `ref` is read natively by GoatCounter, so
`&ref=pr-240-kit-2w2h` turns 75 model pages into 75 measurable sources. Table +
prefixes in `2026-07-25-kit-upload-checklist.md`. **Use it from the first
publish** — retrofitting means re-editing every description.

---

## 3. NEXT UP — unchanged from the 2026-07-25 handoff

1. **The magnet buy-links redesign** (that handoff's §2, Joey greenlit it):
   promote `10×2mm` as the one primary, the other three behind a `▾`, label by
   EFFECT ("Extra strong (N52)") with the grade kept as a spec, and **no
   remembered preference** — unlike store links, these are different products
   with a right answer. Viewer `js/generate.js` `BUY` + planner `js/data.js`
   `HARDWARE_BUY`; define the set once and mirror it like `STORES`.
2. **The 3 club-faceplate rows with no model links at all** (EdgeLabel Accent,
   EdgeLabel Label, Classic Pro Label) — same two functions, do it together.
3. The rest of that handoff's §3 gap list: `Tabletop-Kit-Foot` has no render in
   either tool (widest reach, cheapest win), Classic drawers at 3H for
   115/240/270, 270 foot rails' missing MakerWorld url.

Once the analytics have a month of data, the doc's own follow-up applies:
anything at near-zero is a candidate for removal, and `filament:<brand>` /
`store-pref:` are the two numbers worth acting on.

---

## 4. Verify / re-check

- **Tests:** viewer **18/18**, planner **94/94** at the tips below.
- **Events without polluting the dashboard:** count.js loads on localhost but
  discards localhost hits, so the beacon can't be observed in dev and forcing it
  would write junk into the real site. Use `?debug=1` →
  **`__GEN2_VIEWER__.trackLog`** (every name fired, in order). Walk the funnel
  with `goTo()` and read it back. It's exposed early too, so boot-failure events
  (`?build=not-a-real-kit`) are readable even though the module throws.
- **Icons:** `/favicon.svg`, `/favicon.ico`, `/apple-touch-icon.png` should all
  200 on each domain after deploy.
- Before any commit: `git diff --stat`. A file shrinking in a feature-only
  commit is the `fafbad8` tell — and the label-generator repos will do exactly
  that if edited with a normal whole-file write.

## 5. Repo map (4 repos, 2 disk locations)

| repo | disk path | live URL |
|---|---|---|
| viewer | `D:\Code Projects\GEN2 Visual Animator` (serves `viewer/`) | gen2build.jerrari3d.com |
| planner | `D:\Code Projects\GEN2 Planner\gen2-planner-main` | gen2planner.jerrari3d.com |
| edgelabel gen | `C:\Users\Joey\Documents\Github\gen2-edgelabel-label-generator` | edgelabel.jerrari3d.com |
| classic gen | `C:\Users\Joey\Documents\Github\gen2-classic-label-generator` | classic.jerrari3d.com |

⚠ The label generators live under **Documents\Github**, NOT `D:\Code Projects`.
