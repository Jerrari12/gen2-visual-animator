# GEN2 Decor Handles — Render + Crystal GLB Batch (2026-07-20)

Source: `D:\Render Projects\Hardware\GEN2 Decor Handles.blend` (open session via
MCP — same locked rig: TrueIsoCam ortho iso, Plaza HDRI, Cycles GPU 32 samples,
256×256 RGBA transparent). Contents: Deco (1) · BlockBar A–F (V1.1) ·
**Crystal A + Crystal B Wide** (the newly discovered second variant).

**Status: COMPLETE.** 9 renders, 2 new Crystal GLBs, viewer wired for Crystal.

## Renders (9)

- All handles rendered in **185 Standard** orange (they had no materials;
  matches the faceplate-thumbnail accent + Joey's handle orange). Assignments
  live in the open session. Easy to re-render in another palette color.
- Fit: standard translate-only cam recenter + `ortho_scale = span/0.84`.
- Output: `D:\Render Projects\Hardware\GEN2 Thumbnails\<node>.png` — named by
  GLB node: `Handle_Deco`, `Handle_BlockBar_A..F`, `Handle_Crystal_A/B`.
  Verified 256² RGBA ×9, contact-sheet reviewed.
- Copied to `viewer/img/parts/` (all 9) — lights up the viewer BOM handle rows
  via the new `imgFor` branch (below).
- **Series heroes** for the planner's new handle cards + BOM rows (exact
  filenames from Joey's code session), in planner `img/parts/`:
  - `GEN2_Decor Handles - Deco Series_256p.png` ← Handle_Deco render
  - `GEN2_Decor Handles - BlockBar Series_256p.png` ← BlockBar **A** (the
    studio's cycle start)
  - `GEN2_Decor Handles - Crystal Series_256p.png` ← Crystal **A**
  - To front a card with a different variant, copy any other variant render
    over the series filename — no code involved.

## Crystal GLBs (2)

- Worker in-session: `select prefix:Crystal`, `code_regex "Crystal \w"`,
  `name_template Handle_{code}` → **`Handle_Crystal_A`** (54 × 19.07 × 11.78)
  and **`Handle_Crystal_B`** (98 wide — the Wide; regex drops "Wide" so node
  names stay uniform). Source pose rot 0, canonical after rebase.
- Post-processed: **2/2 canonical OK**, 8.9/9 KB libs →
  `GLB Library\Handles\Crystal\` (+ raw/ + report + parts_index.csv).
- Synced into **all six** `viewer/parts/<L>/` pools (shared hardware).
- Deco (1) + BlockBar (6) GLBs already existed — verified present, untouched.

## Viewer wiring (Crystal is REAL in the 3D studio now)

- **main.js**: two `HANDLE_STYLES` entries (`Crystal A`, `Crystal B Wide`,
  planner family `crystal`, h 11.78 / d 19.07) + `HANDLE_LINKS.crystal`
  (Printables/Thangs from the planner's LINK_OVERRIDES). The tap-to-cycle
  switcher picks them up automatically.
- **generate.js**: `crystal` entry in the per-manifest `HANDLE_STYLES`
  (starts at Crystal A) + `links.hc` + the "not modeled yet → Deco stand-in"
  warning no longer fires for crystal (still fires for unknown families).
  New `imgFor` branch: `Handle_*` → `img/parts/<node>.png` (BOM row art for
  every handle variant).

## ⚑ Flags for Joey

1. **Your uncommitted planner code session**: the Crystal card's sub-line
   "Not in the 3D studio yet" (and its blurb about the Deco stand-in) is now
   stale — the studio shows real Crystal. One-line copy tweak in your session
   (data.js handle card catalog). I did NOT touch planner js files — only
   dropped the three PNGs into `img/parts/`.
2. **Crystal orientation eyeballed, not calibrated**: exported as posed
   (rot 0, same convention as BlockBar A). Renders look right; confirm
   mount-holes-to-plate contact in the studio on first load.
3. "Crystal B Wide - Handle 44mm " has a **trailing space** in its object name
   in the blend — harmless (regex ignores it), but worth trimming if you save.
4. Possible follow-up from your code session note: persisting the exact
   BlockBar/Crystal variant (A–F / A–B) into share links — the viewer restarts
   family cycles at A today.
