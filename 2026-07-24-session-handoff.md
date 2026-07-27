# Session handoff — GEN2 viewer + planner (2026-07-24)

> ⚠ **SUPERSEDED by `2026-07-25-session-handoff.md` — read that instead.**
> Kept for the history. Everything below is RESOLVED: the §1 deploy gate is
> closed (DNS set 2026-07-25, both repos pushed and live), and the §4 open
> threads are done. Do not act on this file.

Read this first, then `CLAUDE.md` (auto-loaded). This file is the TRANSIENT
state — what's in flight right now. `CLAUDE.md` has the durable how/why.

---

## ⚠ 1. THE DEPLOY GATE — read before you `git push` anything

There is a large stack of commits **held back deliberately**, waiting on Joey's
DNS setup. Pushing the viewer or planner `main` IS a live deploy (GitHub Pages
fires on push). **Do not push until Joey confirms the DNS/Pages step is done.**

| repo | working copy | unpushed | live? |
|---|---|---|---|
| **viewer** (GEN2 Visual Animator) | `D:\Code Projects\GEN2 Visual Animator` | **19 commits** | pushing deploys `gen2build.jerrari3d.com` |
| **planner** | `D:\Code Projects\GEN2 Planner\gen2-planner-main` | **9 commits** | pushing deploys `gen2planner.jerrari3d.com` |

**Why held:** the viewer's canonical domain moved to `gen2build.jerrari3d.com`
(`viewer/CNAME` committed). The planner's prod `INSTRUCTIONS_VIEWER_URL` already
points there. Until Joey (a) adds the DNS CNAME `gen2build → jerrari12.github.io`,
(b) sets the repo's Pages custom domain + HTTPS, that domain doesn't resolve —
so a premature planner push ships a "3D Build Studio" button that opens a dead
URL.

**Push order when Joey gives the OK:**
1. Push **viewer** first. Wait for Pages to build; verify `https://gen2build.jerrari3d.com/` serves (hard-refresh).
2. Then push **planner**. Verify its 3D button opens the live viewer.

Rollback tag in both repos: `pre-official-kits`.

---

## 2. Uncommitted / untracked in the working tree — LEAVE ALONE unless asked

**RESOLVED 2026-07-25** — Joey confirmed the untracked `ClassicDecor_*.png` in
both repos ARE the Classic (non-pro) faceplate renders, and the matching GLBs
had landed too. Both are now wired and are part of the Classic work (§4), so
they SHOULD be committed with it. Still do not commit
`GLB Pipeline/gen2_jobs.json.bak` (pipeline scratch); the `gen2_jobs.json`
change itself is the ClassicDecor export job and belongs with the assets.

---

## 3. What this session shipped (all committed, see `CLAUDE.md` for detail)

Viewer + planner, in rough order:
- **Official starter kits** — `viewer/builds/{115,165,185,240,270}-tabletop-{2w2h,3w2h}.json` (10 kits), permanent `?build=<id>` links, `migrateOfficialBuild` version gate, golden tests (`npm test`).
- **Kits gallery** `viewer/builds/index.html` — planner-styled dark chrome, parallax hero, MOUNT × SIZE sections + mount filter, per-collection card art via **`?shot=1` capture** (`captureShot()` on the debug hook).
- **Printables share images** — `viewer/builds/banner.html` renders the gallery card at 1600×700 → `builds/img/card-<id>.jpg`.
- **Cross-site nav** both ways (planner ⇄ kits gallery), `serve-planner.py` no-store dev server.
- **M3-6 button-head handle screws** — GLB in all six pools, placement, BOM (purchased+required), and the threading install animation (`spin:` engine feature, 3/4 `camBack`).
- **"Can I build this today?" marker** — `required` BOM flag, `🔧 N to buy` counter, single-colour wrench SVG (`HW_ICON`/`HW_PATH`) on planner cards + viewer, mirrored in both repos.
- **"Start fresh"** moved out of planner nav → `#reset-bar`, shown only once a unit is placed; closes a popped-out studio.
- Bug fixes: cover/outro taps no longer isolate a faceplate; width-aware cover framing (`coverBox`).

**Label generators (separate repos, ALREADY LIVE):** fixed a Firefox blank-page
bug (vendored libs, fail-safe init) + a plate-width "shows cm" bug. See the
"Label generators" section in `CLAUDE.md`. The code fixes are **pushed and
deployed**; only a doc-only README update is unpushed (1 commit each, safe to
push anytime — they're not gated on DNS):
- `C:\Users\Joey\Documents\Github\gen2-edgelabel-label-generator` (live `edgelabel.jerrari3d.com`)
- `C:\Users\Joey\Documents\Github\gen2-classic-label-generator` (live `classic.jerrari3d.com`)

---

## 4. Open threads / suggested next steps

1. ~~**Classic (non-pro) faceplate switch for the starter kits**~~ — **DONE
   2026-07-25.** All four families are wired in both tools and the 10 kits ship
   Classic with zero required hardware (39/63 prints, no wrench counter). Card
   + share art re-captured, goldens refreshed, viewer 12/12 + planner 90/90.
   See the "Decor Faceplates — Classic" section in `CLAUDE.md`. The planner's
   Classic hero card art (`img/parts/Faceplate-Classic.jpg`) landed the same
   day and is wired, so all four style cards now carry a background + hover
   preview.
1b. ✅ **REGRESSION found AND fixed 2026-07-25.** Commit `fafbad8` ("Crystal
   handles land + embed polish") accidentally reverted the completed 2026-07-19
   under-table rails wiring in `generate.js` — a stale-copy overwrite: its
   diffstat was 24 insertions / 38 deletions, and the deletions were all rails
   work the commit message never mentions. Lost: `railDepth`/`railScrewBack`
   for 59/115/240/270, 165's MEASURED `railScrewBack: 34`, the `utScrewBackZ`
   formula (hardcoded back to `railBackZ + 32.57`, which silently put the 165
   back screw row 2 mm out), `imgFor`'s `UnderTableRail_` branch, and the
   header/links scope comments.
   ⚠ **This was NOT pending — `fafbad8` IS `origin/main`, so it was LIVE.** The
   deployed planner advertises all six under-table lengths with no badge while
   the deployed viewer errors on four of them. Restored from `369dcff` and
   verified: all six generate, rails mount, screw rows land on the measured
   insets (185 −75.93/77.07, 165 −65.93, 240 railZ 0 flush-back), rail BOM rows
   show their renders. The Crystal-handle changes in the same commit were
   legitimate and were deliberately left intact.
   **Lesson for future sessions: never write a whole file back from a copy read
   earlier in the session — re-read before writing, and check your own diffstat
   for deletions you can't explain.**
1c. ✅ **Two more live bugs found by the 2026-07-25 audit, both fixed:**
   - **Classic 3H drawers on 115/240/270 hung the viewer forever** — those
     catalogs stop at 2H (no 3H GLB was ever cut), the generator emitted the
     node anyway, and loadTemplates' bare Promise.all swallowed the 404 with
     the spinner still up. Fixed at four layers: generate.js
     `COLL[L].classicMaxHH` (graceful error), planner
     `collectionCases[L].maxClassicH` (size not offered, sanitize drops it),
     main.js loadTemplates now throws a readable "part model missing" error
     (boot → bootFail, regenerate → showBlocked, regenBusy cleared), and
     `test/parts-exist.test.mjs` sweeps every legal build against the pools.
   - **Handle ◀▶ silently died on the static kits** — the Crystal batch never
     copied into the kit folders (tabletop-165 had ONLY Deco). All nine handle
     GLBs are in all three handled kit folders now (hash-verified against the
     pools), and applyHandleStyle/applyFaceplateStyle roll back + return
     `false` on a missing GLB so the cycle SKIPS the gap instead of dying
     (verified live by stashing a GLB: ▶ from BlockBar F lands on Crystal B).
2. **Push the label-generator README updates** (doc-only, not DNS-gated) — 1 commit each.
3. **Reply to mbravo on Printables** once the label fixes are confirmed working
   in his Firefox (the one env neither Claude nor Joey can test).
4. Minor taste call left open: the viewer counter pairs a 🧩 emoji with the
   monochrome wrench SVG. Joey may want 🧩 converted to a matching glyph.

---

## 5. Run / test / verify

- **Viewer dev server:** `.claude/launch.json` → `viewer` (`python serve-viewer.py 8123`, no-store). Preview via the Browser pane, never Bash.
- **Planner dev server:** `.claude/launch.json` → `planner` (`serve-planner.py 8124`, no-store). Local dev links the two tools to each other (env-aware URLs).
- **Tests:** `npm test` in each repo. Currently **viewer 12/12, planner 88/88 green.**
  - Viewer golden tests: `test/official-builds.test.mjs` runs every `builds/*.json` through migrate+generate and diffs `test/golden/<id>.manifest.json`. A generator change that alters a kit fails here; refresh intentional changes with `UPDATE_GOLDEN=1 npm test`.
- **Browser verify:** open `?build=<id>&debug=1` → `window.__GEN2_VIEWER__` hook. `?shot=1` captures a card render. `#build=<base64>` is a hand-off from the planner (same encoding as its share links).
- **Gotcha:** local dev needs a HARD refresh after JS edits (module cache); a stale `generate.js` silently ignores new build fields.

---

## 6. Repo map (4 repos, 2 disk locations — this bit me)

| repo | disk path | live URL |
|---|---|---|
| viewer | `D:\Code Projects\GEN2 Visual Animator` (serves `viewer/`) | gen2build.jerrari3d.com |
| planner | `D:\Code Projects\GEN2 Planner\gen2-planner-main` | gen2planner.jerrari3d.com |
| edgelabel gen | `C:\Users\Joey\Documents\Github\gen2-edgelabel-label-generator` | edgelabel.jerrari3d.com |
| classic gen | `C:\Users\Joey\Documents\Github\gen2-classic-label-generator` | classic.jerrari3d.com |

⚠ The label generators are under **Documents\Github** (GitHub Desktop), NOT
`D:\Code Projects`. Stale D: copies existed and got edited by mistake; Joey
deleted them. Classic Pro repo has mixed line endings — edit in place preserving
each line's terminator.
