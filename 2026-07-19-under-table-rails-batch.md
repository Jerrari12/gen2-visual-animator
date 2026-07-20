# GEN2 Under-Table Rails — Render + GLB Batch (2026-07-19)

Combined **render → GLB library → full wiring** batch, same pattern as the
2026-07-11 Classic Drawers all-lengths run.
Source: `D:\Render Projects\GEN2 Under-table Rails.blend` (open session via MCP —
TrueIsoCam ortho iso, Plaza HDRI, Cycles GPU 32 samples, 256×256 RGBA transparent).
Rails present: 185 (top level) + `115` / `165` / `240` / `270` collections.

**Status: COMPLETE for all five lengths.** (240 was held mid-session for Joey's
model fixes, then finished the same day — see the Addendum.)

## Facing verification (before anything else)

Canonical ground truth: the raw `UnderTableRail_185/165` GLBs carry the rail's
8.9 mm front ridge at the **+Z (front) end** (glTF) = **−Y in Blender world**.
Thickness-profile check (z-extent per depth bin) across all 20 in-file rails:

- **115 (×4), 270 (×4), 185 (×4), 165-3W/4W** — ridge at −Y ✔ posed correctly.
- **165-1W/2W** — ridge at +Y ✘ 180° flipped **in this render file only** (the
  canonical 165 GLBs, exported 2026-07-05 from the 165 exporter blend, are fine).
  Fixed with a temporary 180° Z spin for their renders; **scene objects untouched**.
- Note: naive mass-asymmetry (mean-Y) flags the 115s as flipped — false alarm,
  the 115 design is front-heavy. The ridge signature is the reliable check.

## Thumbnails (16)

- Per-length `<L> Standard` materials appended from
  `GEN2 Covers + Foot Rails for planner.blend` and assigned (115/165/270 new;
  185 already present). Assignments live in the open session — save or discard
  at will; the GLBs were exported material-free before any assignment.
- Fit: hide_render all but target → translate-only cam recenter
  (`cam.loc = (1028,−1028,1028) + bbox center`) → `ortho_scale = span/0.84`.
  Geometry never scaled. Camera restored to base after the batch.
- Output: `D:\Render Projects\GEN2 Thumbnails\Rails <L>-<w>W.png` — verified
  256² RGBA ×16, contact-sheet reviewed (consistent angle/fill/facing).
- Copied to planner `img/parts/<L>/Rails <L>-<w>W.png` (115/165/185/270).

## GLB export (viewer library)

- Worker logic of `gen2_glb_export.py` executed in-session (non-destructive):
  `select collection:115|270`, `code_regex <L>-\dW`,
  `name_template UnderTableRail_{code}`, `depth_mode center`, materials NONE.
  Reports: `GLB Library\UnderTable\raw\_export_report_115.json` / `_270.json`.
- Post: `python gen2_batch.py --post-only` on-device → meshopt `.lib.glb`,
  quantization-aware canonical verify, `parts_index.csv` rebuilt.
  **16/16 canonical OK (8 new + 165/185 re-verified), 81 % compression.**
  ⚠ The UnderTable `parts_index.csv` was an older ad-hoc column format; the
  rebuild normalized it to the standard pipeline columns.
- Depths (parts_index ground truth): **115 = 130.9** (115+15.9 back overhang),
  **270 = 286** (270+16) — same front-aligned family as 185 (201) / 165 (179).
- Synced into `viewer/parts/115/` and `viewer/parts/270/` pools.
- Three jobs appended to `GLB Pipeline\gen2_jobs.json`: 115 + 270 live
  (pointing at the Render Projects blend), 240 with `skip: true` + hold note.

## Code wiring

- **viewer `generate.js`**: `COLL[115].railDepth = 130.9`,
  `COLL[270].railDepth = 286` (railZ derives to −7.95/−8.0 — matches the 185
  calibration); scope comments + error copy updated.
- **planner `app.js`**: `VIEWER_UT_LENGTHS = [115, 165, 185, 270]` — un-greys
  the 3D-instructions button, board note and length-card badges for 115/270.
- **planner `data.js`**: `partImage()` rail branch — `"GEN2 Rails - <L>"` +
  `"<w>W section"` variant → `img/parts/<L>/Rails <L>-<w>W.png` (Wall Mount
  Lite pattern). 59/240 fall through to auto-pattern → placeholder.
- **planner test** updated: the "no rail models" test now uses 240 (was 270);
  expected badge set now `["240","59"]`. **79/79 pass.**

## Addendum — 240 rails (same day, after Joey's fix)

Joey replaced the four 240 models (`240-<w>W Rail - Full.001`, saved) — all
upright, 8.9 mm tall, front ridge verified. **The 240 Lite is exactly 240 mm
deep: NO back overhang**, so `railZ` derives to 0 (front-aligned = back-flush).

- Thumbnails `Rails 240-1..4W.png` rendered (240 Standard) + copied to planner.
- GLBs exported + post-processed: **20/20 canonical OK** library-wide; synced
  to `viewer/parts/240/`. Wiring un-held everywhere: `COLL[240].railDepth =
  240`, `VIEWER_UT_LENGTHS` includes 240, `partImage()` serves 240, jobs.json
  `skip` removed. Planner test's rail-less example moved 240 → 59 (79/79 pass).
- ~~⚠ dense 240 meshes~~ **RESOLVED (Joey's call, later same day):** the
  240 GLBs were re-exported with a decimate pass on the export duplicates —
  planar dissolve (3°) to collapse the flat fan-triangulation, then collapse
  to a ~2.5k + 1.5k·W vert budget. 57k→4k / 114k→8.4k verts, **bounds
  byte-identical (0.000 mm delta)**, silhouette/cutouts verified visually.
  Libs now **91–187 KB** (were 1.2–2.3 MB) — in family with the other rails.
  24/24 canonical still OK. Source models untouched — so a HEADLESS rerun of
  the 240 job reproduces the dense libs (worker has no decimate option); the
  jobs.json note carries the warning. Long-term fix: decimate the 240 source
  meshes themselves.

## Addendum 2 — 59 rails (same day, Joey's late addition)

Joey appended the 59 rails as a `59` collection
(`gen2-ql-rail-single/double/triple/quad-small`). Verified before touching:
88·W × **74.89** × 8.9 (59 + 15.9 back overhang — same family, railZ −7.945),
and although posed at rot 0 (unlike everything else's 180°X) they're **already
channels-down with the front ridge correct** in world space (z-density profile
matches the calibrated 185 near-exactly).

- Renamed in-session to **`GEN2 Rail - 59-<w>W`** (object + mesh datablock)
  so the pipeline's `collection:59` + `59-\dW` regex work headlessly.
- Thumbnails `Rails 59-1..4W.png` (59 Standard) rendered + copied to planner
  `img/parts/59/`; GLBs exported + post-processed — **24/24 canonical OK**
  library-wide (30–44 KB libs) — synced to `viewer/parts/59/`.
- Wiring: `COLL[59].railDepth = 74.89`, `VIEWER_UT_LENGTHS` now all six,
  `partImage()` serves 59, 59 job appended to jobs.json (33 jobs).
- Planner test: the "length without rail models" test had no subject left —
  rewritten as its inverse ("under-table serves every collection": button live,
  no reason, no badges, checked across 59/115/240/270). **79/79 pass.**
- **Under-table now generates for ALL SIX collections.**

## Addendum 3 — back screw rows MEASURED, per-length fix (same day, Joey's catch)

Joey measured (viewer 📏) the 59 back screws floating **~18 mm in front of their
holes** — the screw placement assumed every rail shares the 185's back-row
inset (36 from the rail back). Measured the real hole rows instead (evaluated
meshes in this render blend, hole-bore face clustering, all 4 widths × all 6
lengths agree):

| length | back-row inset from rail back | old derived (36) error |
|---|---|---|
| 59 | **16.89** | 19.1 mm |
| 115 | **42.4** | 6.4 mm |
| 165 | **34** | 2.0 mm (was itself derived, never measured) |
| 185 | 36 (calibration) | — |
| 240 | **20** | 16 mm |
| 270 | 36 | — |

Front row = 12 mm from the rail front on EVERY length (unchanged). Every
measured back row carries holes exactly at the viewer's end + seam screw Xs.
Fix: `COLL[L].railScrewBack` in generate.js (default 36), `utScrewBackZ =
railBackZ + (railScrewBack || 36) − 3.43`. Verified: all six lengths generate
on the measured rows, 185 output byte-identical (−75.93/77.07), 59 screws seat
in their holes in-browser. GLBs untouched — the placement was wrong, not the
models.

## ⚑ Flags for Joey

1. ~~240 rails held~~ ~~dense-mesh payload~~ **BOTH RESOLVED same day** —
   see the Addendum above. Only long-term nicety left: decimating the 240
   source meshes so headless reruns match the shipped libs.
2. **165-1W/2W are 180° flipped in the render blend** (render-side corrected
   only). Worth spinning them in the file when convenient so the next batch
   doesn't need the special case.
3. **SAVE the render blend** — the open session now carries changes worth
   keeping: the 59 rail renames (`GEN2 Rail - 59-<w>W`, required for the
   headless 59 job) plus the appended Standard materials/assignments. The
   exports themselves were non-destructive.
4. Under-table starter-kit listings exist only for 185/270 — 115 builds link
   to the per-length Rails pages (already wired for all six lengths).
5. Viewer hardware Z for 115/270 UT builds is DERIVED from the 185 calibration
   (±dz) — verify by eye on a printed build, same standing item as the 165.
   (UT SCREW rows are the exception now — measured per length, Addendum 3.)
