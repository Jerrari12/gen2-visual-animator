# Session handoff — GEN2 viewer + planner (2026-07-24)

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

Both repos have the SAME 18 files untracked, **predating this session** (they
were in the git status at session start; I did not touch them):

- **`viewer/img/parts/ClassicDecor_*.png`** and planner **`img/parts/ClassicDecor_*.png`**
  — 18 files, one per faceplate size (`1W-05H … 4W-2H`). These look like the
  **Classic (non-pro) faceplate render thumbnails** — i.e. art for the exact
  family the planned next step switches the kits to (§4). **Confirm with Joey
  what they are before wiring them.** Do not commit them as a side effect.
- viewer also has a pre-existing modified `GLB Pipeline/gen2_jobs.json` + a
  `.json.bak` — pipeline scratch, not this session's work, not mine to commit.

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

1. **Classic (non-pro) faceplate switch for the starter kits** — the biggest
   planned item; see the **"PLANNED: Classic faceplates"** section in `CLAUDE.md`.
   Goal: switch the 10 kits from Essential (bolt-on handle → needs M3 screws) to
   print-in-place Classic, dropping required hardware to zero. **Blocker:**
   `FACE_FAMILIES` in `generate.js` has no `classic` entry; needs the 18-size
   GLB set + a mounting-plane Z + a render batch (same pipeline as Classic Pro).
   NB the 18 untracked `ClassicDecor_*.png` (§2) may already be the render half —
   check with Joey. Standing offer: scaffold `FACE_FAMILIES.classic` ahead of the GLBs.
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
