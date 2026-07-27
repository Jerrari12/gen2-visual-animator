# Session handoff — GEN2 viewer + planner (2026-07-25)

Read this first, then `CLAUDE.md` (auto-loaded). This file is the TRANSIENT
state — what's in flight and what's next. `CLAUDE.md` has the durable how/why.

**Supersedes `2026-07-24-session-handoff.md`.** That file's §1 deploy gate is
CLOSED (see below); its other sections are resolved in place.

---

## 1. ✅ THE DEPLOY GATE IS LIFTED — both repos are LIVE

Joey set the DNS CNAME + GitHub Pages custom domain + Enforce HTTPS on
2026-07-25, and the held stack was pushed. **Both repos are pushed, clean and
deployed.** Nothing is being held back any more — push normally.

| repo | working copy | live URL | tip |
|---|---|---|---|
| **viewer** | `D:\Code Projects\GEN2 Visual Animator` | **gen2build.jerrari3d.com** | `3a06e88` |
| **planner** | `D:\Code Projects\GEN2 Planner\gen2-planner-main` | gen2planner.jerrari3d.com | `7e892fa` |

Verified in production: old `jerrari12.github.io/gen2-visual-animator/`
**301-redirects** to the custom domain preserving path+query; all 10 kit
`?build=` links + their card art serve; the app boots clean over HTTPS.
Tests green at both tips: **viewer 18/18, planner 94/94.**

Only untracked file anywhere: `GLB Pipeline/gen2_jobs.json.bak` (pipeline
scratch, deliberately uncommitted — delete whenever).

⚠ **Kit ids are now publishable and therefore about to be frozen.** The moment
a `?build=<id>` link goes into a live Printables/Thangs/MakerWorld
description, that id is permanent. Nothing is published yet as of this
writing — confirm with Joey before renaming anything under `viewer/builds/`.

---

## 2. NEXT UP — the magnet buy-links redesign (Joey greenlit the ideas)

Joey's prompt: the magnets row offers **four peer buttons** — `10×2mm`,
`6×2mm`, `N52 10×2mm`, `N52 6×2mm` — and "most people won't know what N52 is".

**The diagnosis (agreed): the jargon is the symptom; the structure is the
problem.** Those four buttons flatten a 2×2 matrix — SIZE (10×2 vs 6×2) ×
STRENGTH (standard vs N52) — into four equal-weight options, so a beginner
must decompose a label before they can choose, and nothing signals which axis
matters. Three changes, in value order:

1. **The row already contains a recommendation it doesn't act on.** The note
   says "Standard strength suits most builds", but four equal buttons make
   that prose the eye skips. Promote ONE primary — 10×2mm — and put the other
   three behind a **▾**, reusing the `STORES` overflow pattern shipped this
   session (viewer `appendStoreLinks` / `.dl-more`; planner `linkButtons` /
   `.link-more`, delegated on `#bom`).
2. **Label by EFFECT, keep the grade as a spec.** `N52 10×2mm` →
   **"Extra strong (N52)"**. Don't drop N52 — it's the spec people match on
   once they're comparing Amazon listings — but it must not be the headline.
   Also: **6×2mm currently has no stated reason to exist**, so nobody can
   choose it deliberately. Give it one ("slimmer", availability fallback —
   ask Joey which is true).
3. **These are NOT like the model-site links, and must not behave like them.**
   Printables vs Thangs is the same file at a different shop → user is
   indifferent → remembering a preference is right. Magnets are *different
   products with different physical behaviour*, there's a correct answer for
   most people, and choosing wrong has a consequence. So: strong default,
   explanation at the point of choice, **no remembered preference**.

**Bonus the data already supports:** the tool knows the collection and drawer
sizes, and the note itself warns N52 "can be too strong for smaller drawers".
On a 59 / all-1W build it could actively steer away from N52 rather than
offering it as a peer. A parts list can do that; a static description can't.

**Mirror rule:** the labels already differ between tools — viewer
`BUY.magnets` says `N52 10×2 strong`, planner `HARDWARE_BUY["Magnets 10×2mm or
6×2mm"]` says `N52 10×2mm`. Define the set ONCE and mirror it, like `STORES`.
Files: viewer `js/generate.js` `BUY` (~line 141) + planner `js/data.js`
`HARDWARE_BUY` (~line 665) and the `closures` note (~line 396).

Do this **alongside item 3b below** — both are BOM-row link work in the same
two functions.

---

## 3. WHAT'S MISSING — audited 2026-07-25, not from memory

Swept every legal build (6 collections × both fills × all sizes × 3 mounts ×
4 faceplate families × 3 handle styles) = 57 distinct BOM rows. Script pattern
in scratch `gapaudit.mjs`; re-runnable.

### a. Models (Joey knows about these)
- **Classic drawers at 3H — 6 GLBs**: `1W-3H` + `2W-3H` for **115, 240, 270**
  (165/185 have theirs). Currently GUARDED at both ends —
  `COLL[L].classicMaxHH` in generate.js, `collectionCases[L].maxClassicH` in
  the planner — so the size isn't offered and a hostile hash errors
  gracefully. **When the GLBs land, delete BOTH caps together** and drop the
  6 thumbnails in. This is the only hole left in the buildable matrix.

### b. Renders — 4 rows have no thumbnail (0 rows point at a MISSING file)
- ⚠ **`Tabletop-Kit-Foot` — the surprising one.** It's in every tabletop build
  and all 10 starter kits, yet has no render in EITHER tool. Every other
  hardware part (QuickLock, stopper, magnet clip, magnets, M3 screw) has one.
  Cheapest win with the widest reach; `imgFor` has no mapping for it at all.
- EdgeLabel Accent (14 sizes), EdgeLabel Label (1), Classic Pro Label (1).

### c. Links
- **3 rows have NO model links at all**: EdgeLabel Accent, EdgeLabel Label,
  Classic Pro Label — `add(..., 'Accent', null)` / `'Label', null` in
  generate.js. On a club-faceplate build these are separate prints the user
  needs, and the row is a bare name. **Do this with item 2.**
- Store coverage across 54 printable rows: Printables 51, Thangs 50,
  MakerWorld 35, **Cults 0** (nothing uploaded there yet).
- **270 foot rails** has no MakerWorld url (the incoming list omitted it; the
  other 4 foot-rail rows were wired BY SLUG after a row slip). One-line add.
- Faceplates deliberately have no MakerWorld (Joey can't publish EdgeLabel
  there); kit + wall-bracket pages are Printables/Thangs-only.

### d. Not-yet-released (planner already flags)
`shelfInsert`, `door`, `hinge`, `latch`, `sideCover` — shelves, cabinets, side
covers. Case-extender GLBs are the blocker for shelf/cabinet fills in 3D. The
**Tilt Drawer** is still on hold (its case GLB exists, the drawer was never
converted).

---

## 4. IN PROGRESS FOR JOEY (content, not code)

Creating the **10 kit listings** — Printables first, then Thangs, then
MakerWorld. Checklist with per-tier parts lists (pulled from the golden BOMs)
and the per-platform links: **`2026-07-25-kit-upload-checklist.md`**.

- Each platform's description gets its own `&from=` suffix
  (`?build=<id>&from=printables|thangs|makerworld`) — that's what seeds a
  visitor's part links onto the site they arrived from.
- Link-ready art per kit already exists and is live:
  `builds/img/card-<id>.jpg` (1600×700, carries the button + printed address)
  and `builds/img/<id>.jpg` (2400×1500 clean render). Regenerate variants via
  `viewer/builds/banner.html`.
- **As kit pages go live, send the URLs** — they should be wired into each
  kit's link entry so the tools cross-link back.

---

## 5. Gotchas this session actually hit (don't relearn these)

- **`npm test` is bare `node --test` → it runs EVERY `.mjs` in `test/`.** A
  scratch probe dropped there becomes part of the suite; one that loads a GLB
  hangs `npm test` outright. Keep throwaways OUTSIDE the repo. If the suite
  hangs or the count looks odd, `ls test/` first.
- **Never write a whole source file back from a copy read earlier.** Commit
  `fafbad8` did exactly that and silently reverted the completed under-table
  rails wiring — it reached production and broke UT for 4 of 6 collections
  while the planner still advertised all six. Found + restored this session.
  Read your own `git show <sha> --stat` before committing: a file shrinking in
  a commit that only adds a feature is the tell.
- **MakerWorld 403s automated fetchers.** Its urls can't be link-checked in
  CI — verify by eye.
- `test/parts-exist.test.mjs` is the net for asset gaps: it sweeps every legal
  build against the GLB pools and enforces the kit folders back their
  manifests + both style cycles. It exists because a missing GLB used to hang
  the app forever rather than fail readably.
- Local dev needs no hard-refresh (both servers send `no-store`), but the
  Claude preview server is EPHEMERAL — it dies with the session.

---

## 6. Run / test / verify

- **Viewer dev:** `.claude/launch.json` → `viewer` (`python serve-viewer.py 8123`).
  **Planner dev:** → `planner` (`serve-planner.py 8124`). Preview via the
  Browser pane, never Bash.
- **Tests:** `npm test` in each repo — viewer 18/18, planner 94/94.
  Viewer suites: `official-builds.test.mjs` (golden manifests per kit;
  intentional changes refresh with `UPDATE_GOLDEN=1 npm test` AFTER reviewing
  the diff) and `parts-exist.test.mjs` (asset sweep).
- **Browser verify:** `?build=<id>&debug=1` → `window.__GEN2_VIEWER__`.
  `#build=<base64>` is the planner hand-off. `?shot=1` captures card art.
  NB `__GEN2_VIEWER__.manifest` is a BOOT-TIME snapshot — stale after
  regenerate; only `build` is a getter.

## 7. Repo map (4 repos, 2 disk locations)

| repo | disk path | live URL |
|---|---|---|
| viewer | `D:\Code Projects\GEN2 Visual Animator` (serves `viewer/`) | gen2build.jerrari3d.com |
| planner | `D:\Code Projects\GEN2 Planner\gen2-planner-main` | gen2planner.jerrari3d.com |
| edgelabel gen | `C:\Users\Joey\Documents\Github\gen2-edgelabel-label-generator` | edgelabel.jerrari3d.com |
| classic gen | `C:\Users\Joey\Documents\Github\gen2-classic-label-generator` | classic.jerrari3d.com |

⚠ The label generators live under **Documents\Github**, NOT `D:\Code Projects`.
Classic Pro repo has mixed line endings — edit in place preserving each line's
terminator.
