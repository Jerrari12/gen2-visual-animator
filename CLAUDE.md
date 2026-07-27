# GEN2 Visual Animator — project memory

> **ACTIVE HANDOFF (2026-07-27) — read `2026-07-27-session-handoff.md` first.**
> Site icons now ship on all four GEN2 properties, and the viewer is
> instrumented with GoatCounter (the planner already was). The
> `jerrari-build.goatcounter.com` site is created and **verified accepting hits
> in production**. Next up is still the magnet buy-links redesign + the club
> faceplate link gap. Older context below.
>
> **PREVIOUS HANDOFF (2026-07-25) — `2026-07-25-session-handoff.md`.**
> The 2026-07-24 deploy gate is CLOSED: DNS + Pages custom domain + HTTPS are
> set, the held stack is pushed, and **both repos are live and clean** —
> viewer at **gen2build.jerrari3d.com**, planner at gen2planner.jerrari3d.com.
> Push normally. Tests green (viewer 18/18, planner 94/94). Next up: the magnet
> buy-links redesign + the accent/label link gap (handoff §2–3). ⚠ Kit ids
> under `viewer/builds/` become PERMANENT the moment a `?build=` link is
> printed in a live listing — Joey is creating those listings now.

Interactive LEGO-style assembly instructions for GEN2 kits (jerrari3d.com).
Same conventions as the gen2-planner: **build-free static web tool**, vanilla JS,
no bundler — `viewer/index.html` runs from any static server.

## Layout

- `viewer/` — the instructions viewer (deploy target: GitHub Pages).
  - `js/main.js` — entire engine: GLTFLoader + meshopt decoder, per-type brand
    colors, staged subassemblies, phased step animations, camera preset tweens,
    checklist, tap-to-identify. Data-driven: **never hardcode a kit here.**
  - `kits/<kit>/manifest.json` + `kits/<kit>/parts/*.lib.glb` — one folder per
    kit is the entire authoring surface. Kits: `tabletop-185` (default, 2×2),
    `tabletop-185-3w` (3W×2H with a 2W case/drawer — proves multi-width,
    rail-junction feet dedup, and the 2W left-slot magnet rule), and
    `tabletop-165` (2×2 165-collection demo — PORTED from tabletop-185: node
    names 185→165 + each shared-hardware Z shifted ±dz; keeps the GEN2 palette),
    and `edgelabel-test` (dev bench: the 2-zone EdgeLabel faceplate set — see the
    EdgeLabel section).
    Select via
    `?kit=<name>`. BOM panel: expanded on the checklist step and final step,
    minimized to a "Parts · N" tab elsewhere (user-toggleable). The panel has
**Copy list / Download CSV** export buttons (main.js copyBom/downloadCsv, mirrors
the planner's BOM actions) and is shown on the outro so the finale lists every
part with its color chip + download links.
  - `vendor/three/` — vendored three.js (0.185.1) + addons; import-mapped in
    index.html. No CDN (works offline, no version drift).
  - Debug hook: append `?debug=1` → `window.__GEN2_VIEWER__` (guarded, planner-
    style) + a calibration readout in the identify card (`#identify-debug`:
    the instance's MANIFEST pos + yaw + world bbox mm — the exact numbers to
    hand back when a part needs shifting). NB `__GEN2_VIEWER__.manifest` is a
    boot-time snapshot — stale after regenerate (only `build` is a getter).
  - 📏 Measure (`#measure-toggle` pill, hidden on cover/outro): PrusaSlicer-
    lite — two taps on part surfaces raycast to the mesh, drop always-visible
    markers (depthTest off, screen-constant size) + a line + a floating
    mid-point label with distance + ΔX/ΔY/ΔZ. The scene is authored in REAL
    mm, so the reading IS the mm value. 3rd tap starts fresh; empty tap
    clears; identify is suppressed while measuring; page changes exit the
    mode (parts move). Feature-snapping (edges/holes/angles) deliberately
    skipped.
  - Overall W/H/L dimension callouts (product-diagram style) auto-show on the
    FINAL assembly step only: tick-capped lines along `assembledBox` (computed
    in computeBounds — final-state extents, wood screws excluded, handles/
    faceplates/bracket included = the true physical envelope), labels in
    mm + inches (`.dim-label`, midpoint-tracked + viewport-clamped in
    updateDims). NOTHING may cover the model (Joey): the lines are
    depth-tested (they sit outside the box, so occluded = genuinely behind
    the build; floor lines +1 mm above b.min.y to dodge table z-fighting),
    and each label anchors to a point ON ITS OWN LINE, walking OUT FROM THE
    CENTER (0.5, ±1/16, …) to the first spot that (a) doesn't collide with an
    already-placed dim label and (b) isn't covered by the model — projected-
    AABB rect as broad-phase, then a RAYCAST for truth (the rect over-covers
    at 3/4 angles; its empty corners are fine label spots). Whole line
    covered → least-bad on-line point. THE EDGES ARE CAMERA-PICKED
    (buildDimLines, rebuilt only when the choice changes): H hops between the
    4 vertical corners to the screen-OUTERMOST one, offset diagonally outward
    (gap = max(30, 8% of maxDim) — Joey wanted breathing room), with a 15%
    hysteresis and a 0.25 score penalty within ~90px of the open desktop
    parts panel (labels also right-clamp clear of it); W/L flip to the floor
    edge FACING the camera. Placement is cached per camera pose (raycasts
    only when the view changes; labels' offsetWidth is 0 on the first hidden
    pass → cache invalidates itself for one more pass). History: fixed
    screen-direction push-out detached labels from lines after an orbit;
    rect-only center-preference fled center too eagerly AND let labels
    overlap; fixed-left lines sat over the build at some orbits (Joey
    reports ×3) — center-out walk + raycast + mutual collision + camera-
    picked edges solved all of it, CAD-style. Rebuilt on every step entry
    (regenerate-safe).
  - Drawer focus (dFocus in main.js): selecting a drawer BODY (the deep pull)
    saves the camera pose, tweens to a front-above 3/4 on the OPEN drawer
    (floor + back wall readable), hides the build dims, and shows the
    drawer's INTERIOR W/L/H — lines drawn inside the cavity (W floor-front,
    L floor-left, H back wall), parented INTO the drawer group so they ride
    the slide, reusing the dim-label pills. Interior sizes are MEASURED
    (raycasts: down from mid-height → floor, then walls from floor+6 mm —
    the decor drawers' front wall is a low lip a mid-height ray overshoots;
    truly open front falls back to bbox−2), cached per node. Deselect tweens
    the camera back to the saved pose + restores the build dims; switching
    drawers re-frames without restoring; camera tweens ride camTweenToken so
    paging cancels them cleanly; resize() skips its preset re-fit while
    focused.
- `GLB Pipeline/` — Blender→GLB batch exporter (`python gen2_batch.py`), see its README.
- `GLB Library/` — canonical compressed parts + `parts_index.csv` per collection.
  **2026-07-10: cases + decor drawers + covers landed for ALL six lengths**
  (59/115/165/185/240/270 — 189 parts across the touched folders, zero canonical
  failures). The 59 is a mini collection: 1W/2W × 05H/1H only (4 cases + 4 DDs),
  covers, and **no foot rails AND no feet slots BY DESIGN** (too shallow to be
  stable — the planner's `mountBlocksLength()` greys 59 tabletop out entirely;
  59 is a HANGING-ONLY collection, and generate.js `noTabletop` mirrors that).
  Foot rails: 115/165/185/240/270 ×1W/2W. New part type:
  `115-1W-2H_TiltDrawerCase.lib.glb` — **ON HOLD (Joey 2026-07-10): the matching
  Tilt Drawer model isn't converted to GLB yet; don't reference the case
  anywhere until the drawer lands** (excluded from viewer pools). Six 185 decor
  drawers (all 2H/3H sizes) were re-exported 2026-07-09 to strip baked-in print
  supports (old ones displayed wrong in the viewer) — `viewer/parts/185/` synced
  2026-07-10; kit folders only use 1H drawers (unaffected). **2026-07-10
  rotation fix: 11 of the 7/9 exports shipped rotated 90° about Y** (X/Z
  swapped — `240-2W-1H_Case` + ALL ten `DecorDrawer_240-1W/2W-*`; caught by
  width≠88·W in parts_index.csv). Fixed at the GLB level (+90° about Y, sign
  chosen by Z-profile correlation vs known-good same-size parts, 0.99 decisive),
  stale libs deleted, re-compressed, 44/44 canonical. ⚠ **The source blends
  (`D:\Render Projects\GEN2 Cases - ALL.blend` / `GEN2 Decor Drawers -
  ALL.blend`) still carry those 11 objects rotated** — a re-export reproduces
  the bug; fix the source or re-apply the fix (scratch script pattern: rotate ±90,
  correlate depth profiles). The thickness-axis orientation check does NOT catch
  Y-rotations — also compare wbounds X/Z against 88·W / collection depth. CU
  covers ship upside down in every fresh import from the covers source (print
  orientation) — always flip-verify against 185 ground truth. Pipeline gotcha:
  the compressor SKIPS existing `.lib.glb` — delete stale lib+raw before
  re-export or the old file silently survives.
  **2026-07-11: Classic Drawer GLBs + thumbnails landed for ALL SIX lengths**
  (88 parts — 59:4 / 115:16 / 165:18 / 185:18 / 240:16 / 270:16, `ClassicDrawer_{code}`,
  all canonical_ok; six `collection:<L>` jobs appended to gen2_jobs.json; run notes:
  `D:\Render Projects\GEN2_Blender_Render_Setup_ClassicDrawers_AllLengths.md`).
  ⚠ **The 16-part catalogs (115/240/270) have NO 3H** — only 165/185 got the
  two 3H sizes. That gap silently HUNG the viewer (2026-07-25: the generator
  emitted `ClassicDrawer_<L>-…-3H` unguarded and loadTemplates never surfaced
  the 404). Guarded both ends now: generate.js `COLL[L].classicMaxHH: 4` →
  graceful error, planner `collectionCases[L].maxClassicH: 2` → the size isn't
  offered (sanitize drops it from restored hashes). If the 3H models ever get
  cut, delete both caps together. `test/parts-exist.test.mjs` sweeps every
  legal build against the GLB pools so the next catalog gap fails in CI, not
  as a production hang.
  Source blend is `GLB Library\GEN2 GLB Exporter - GEN2 Classic Drawers.blend` —
  ⚠ it received in-session fixes (240-4W rotations zeroed, 115-4W-15H/2H restored
  from disk, 185-4W-05H/1H appended from the old 185 thumbnail blend, spec-order
  renames) that **must be saved** before any headless re-run.
  **2026-07-12: ClassicDrawer_240-3W-05H + 240-3W-1H shipped rotated 90° about
  Y** (Joey caught it in the viewer — drawers faced right). 240-3W is the ONE
  size the width≠88·W−13 check can't see: 3W width 251 vs 240 classic depth
  250 differ by 1 mm (sweep with tolerance <0.5 mm to catch it; 15H/2H were
  fine). Fixed at the GLB level (exact quantized component swap x,z→−z,x —
  the quantization node scale is uniform so the swap is lossless; sign chosen
  by a two-invariant geometry gate validated on 4 known-good parts: dense
  full-width full-height back wall at −Z + pull-lip tip at +Z inset ~16 mm
  per side (<95 % width), plus Z-profile correlation as tie-breaker; scratch
  script pattern in this fix: decompress lib → swap → meshopt recompress),
  parts_index.csv rows updated, synced to viewer/parts/240/. NB the front-lip
  HEIGHT is not a valid orientation invariant — 1H carries the grip low
  (y≤7) but 15H carries it high (y≈62/78). ⚠ **The source blend still
  carries these two rotated** — same story as the case/decor blends; fix at
  the source or re-apply on re-export. All 88 matching 256²
  thumbnails re-rendered as ONE batch (replaces the 14 old 185s), copied flat into
  `viewer/img/parts/`; `.lib.glb` synced into `viewer/parts/<L>/`.
  **2026-07-11 (same day): classics are REAL 3D PARTS in generate.js** — the
  `_classic_`/"coming soon" placeholder is gone. Closed Z is DERIVED from
  measured GLB geometry (decompressed classic vs decor 1W-1H, vertex-profile
  compare): the classic back wall (same 2.6 mm wall + magnet-clip slot as the
  decor) back-aligns with the CALIBRATED decor back, which lands its main
  front wall within 0.3 mm of the decor's — same box, back-aligned; the
  integrated pull lip runs ~18 mm proud of the case face. `classicZ = 5.24 +
  (classicDepth − (depth − 5.7))/2` = 13.09 (13.035 on 59/115, whose exports
  run 0.11 shy of case+10 → `COLL.classicDepth`). Same bottom (case + 5.72),
  same drawer-side clip/magnet Z (backs align), NO faceplate/handle/dressing
  (the front is printed in), no 2H forward nudge (that was a decor-model
  quirk). Demo owners split: `firstDrawerDemo` (either fill) runs the
  Drawers-step pop-in + clip demo; `firstFpDemo` (first DECOR) keys the
  faceplate cinematic — classic-first builds keep it, classic-ONLY builds skip
  the Faceplates step (the Drawers note gains the "build is done" outro line).
  imgFor: `ClassicDrawer_<L>-…` → per-length `Classic Drawer <L>-<code>.png`.
  Type 'Drawer' → deep pull/interior dims/cinema glides/planner closure sync
  all work unchanged. Regression-tested old-vs-new: decor-only output
  byte-identical across 5 mount/length combos (+50 behavior checks); verified
  in-browser on a mixed 185 #build= (world bboxes: classic back −84.41 = decor
  back exactly). Runtime warning "placement derived — verify on a printed
  build" replaces the old one; no calibrated classic assembly exists yet.
  Still no GLBs: Case Extenders (render meshes live in `D:\Render Projects\<length>
  <family>\` thumbnail blends). 256px thumbnails: covers + foot rails for ALL
  SIX lengths rendered 2026-07-10 (44 PNGs, filenames = library part codes) in
  `D:\Render Projects\Covers\GEN2 Thumbnails\` + `D:\Render Projects\Foot Rails\
  GEN2 Thumbnails\`, and **WIRED INTO BOTH TOOLS** same day: planner
  `IMAGE_OVERRIDES` (44 entries, files in `img/parts/<L>/`) + viewer
  `imgFor()` (CL/CU/FR node name = PNG name, flat in `viewer/img/parts/`) +
  explicit `img` fields on the three static kits' cover/footrail BOM rows.
  Viewer also carries the planner's per-length CASE + DECOR DRAWER renders for
  all six lengths now (151 PNGs copied 2026-07-10 — identify cards show photos
  everywhere; imgFor's flat `Case <L>-<w>W-<h>H.png` paths resolve).
  Full run notes:
  `D:\Render Projects\GEN2_Blender_Render_Setup_CoversFootRails.md`.
  **2026-07-11 links refresh:** covers + foot rails have their OWN per-length
  Printables pages now (no longer funneled to the Table Top Kit), every
  collection's cases/decor pages carry both Printables + Thangs, and classic
  drawers link per length. Viewer: `LINKS_BY_LEN` in generate.js (per-length
  cases/decor/classic/covers/fr/kit/wall/rail maps, 185 fallbacks) mirrors the
  planner's LINK_OVERRIDES — update both together. Wall-mount bracket BOM
  thumbnails (`WallMount_Lite_{1,2,3}W.png`, 2026-07-11 batch) serve both
  tools: viewer imgFor per-width rule; planner partImage takes the row's
  VARIANT ("<w>W section") since bracket rows share one name per length.
- `Blender Files/` — source .blends ("GEN2 GLB Exporter - *").
- `GEN2-Part-Orientation-Notes.md` — **evergreen placement/sequencing rules per part.**
  Read it before authoring manifests. Joint grammar: `2026-07-04-gen2-interactive-assembly-instructions.md` §5.

## Placement math (locked — CALIBRATED against ground truth)

Calibrated 2026-07-04 against `Blender Files\Training Examples\GEN2 TableTop Kit
Assembly Example.glb` (Joey's accurate reference assembly; two independent
extractions — raw GLB parse + headless Blender — agreed on all 42 parts, 0
discrepancies). Full numbers live in the kit manifest's `_datums` string.

- Pitch: 88 mm per 1W column, 56.00 mm per 1H row (**exact**); case is
  physically 59 mm tall (3 mm dovetail seats into the unit above).
  **Never stack by bounding boxes.**
- Height chain: foot exposed 7.65 (10.62 − 2.97 insertion) → FR-L bottom 7.65
  → FR-U +5.10 → row0 case bottom +10.00 → rows +56.00 → CL = top-row bottom
  +56.00 → CU = CL +4.30.
- QuickLock: bottom = case +35.68, z-center 65.02, handed x (outer L −84.12 /
  R +84.55, inner R −3.45 / L +3.88 for ±44 columns).
- Drawer: bottom = case +5.72, z-center 5.24 (front protrudes 2.39 past the
  case face to meet the faceplate). Faceplate: bottom = case +3.72, z-center
  95.07. Handle: bottom = faceplate +22.49, z-center 109.57.
- Stoppers: bottom = covering unit's bottom −2.00 (tabs hang into the bay
  below), z-center 76.5, L/R slots ±12.5 from ~case center.
- Feet (2W rail, 6): x −76.48 / −0.18 / +76.65, z −73.00 back / +81.15 front;
  left pair yaw 180.
- 3W-3H and 4W-3H don't exist (deliberately) — illegal sizes, like the planner's
  `unavailableSizes`.

## Manifest model (kit authoring)

`instances` (id, node, pos, yaw, stage) + `stages` (named world-offset for bench
subassemblies) + `steps` with `phases`: `enter` (from = start-offset delta;
optional `at` = temporary landing offset, e.g. onto a popped-out drawer;
optional `via` = cumulative deltas past the landing point, glided through as
ONE arc-length-continuous eased motion — an approach + press-on as separate
phases eased to a dead stop at each boundary and read as a mid-air stall
(Joey 2026-07-13, the faceplate dressing) — the enter's net = at + last via,
duration DUR.enter + 300/waypoint),
`settle` (stage name → members tween from staged to final), `move`
(nudge placed instances by a delta — **net deltas must cancel by the end of the
step** so prev/jump's computed after-state stays true; used for the per-drawer
faceplate pop-out choreography and the wall hang), `ghost`/`solid` (fade
instances to translucent 0.15 and back — used to see the pegs through a cover),
`vanish`/`appear` + `room: 0|1` (2026-07-08: fade EVERY visible instance to
nothing then hide / fade the hidden set back — the step-scripted twin of the
faceplate tap-isolation, `room` drives the table/grid/wall via the fpEnv lerp
and goTo resets it to 1; transient within a step — an appear always follows —
so after-state math is untouched; killTweens never fires the hide-onDone and
applyState restores everything), and per-phase `camera` (retarget mid-step,
e.g. zoom to the pegs then back), and
`land` (mark a staged group settled in place — used after explicit `move` phases
already carried it home, so a two-step staged hang stays deterministic). Steps
are deterministic — prev/jump snaps to computed after-state, next/replay
animates. Phases may set `pace` (duration+stagger multiplier); without it the
engine auto-paces 1.6× any enter phase landing ≥2 tiles of a TILED_TYPES part
(covers/footrails/brackets/rails — multi-tile landings read too fast at 1×).
**Readability & study aids (main.js, Joey 2026-07-06):** adjacent same-type
tiles alternate a lighter shade (TILED_TYPES + ALT_LIGHTEN 0.16 — instance
`alt` flag, altMaterials/altHighlightMats track the active palette, so a 2W
next to a 1W never fuses visually; materialFor is instance-keyed for this).
The two-shade tiling is INSTRUCTION-palette-only (Joey 2026-07-13: his black
preset covers showed one black + one grey tile): `altLerp(type)` drops to 0
whenever the type has a custom filament pick, recoloring the SAME alt
materials — no mesh reassignment; a type still on instruction colors keeps
its tiling even in a mixed palette.
🐢 `#btn-slow` toggles slow-motion (tween() stretches all step/camera tweens
2.5×; never the cinema). ⏸ `#btn-pause` freezes the tween clock (stepTweens
shifts pending t0s while paused, so everything resumes mid-motion exactly);
paging auto-resumes, and the outro disables it (cinema clock is separate).
Camera override: orbiting/zooming >4 mm during a step
sets `camOverride` — tweenCamera then only RECORDS presets (curCamPreset)
without moving, per-phase retargets included, until 🎥 `#btn-cam` (visible only
while overridden) glides back to the tour's latest preset; cover/outro reset
the override, replay keeps it (study a step from any angle). fitDistance takes
the preset's END fov (dot-jumping cover→fit-step used to overframe ~4× off the
cover's fov-9 telephoto).
`parts[]` is the BOM: type keys into `colors`. Generated builds use a **K'nex-
style identification palette** (generate.js COLORS): one distinct saturated hue
per part TYPE for easy identification — cases dark ("black", Joey's one rule),
drawers red, faceplates orange, handles yellow, CoverL/U green/lime, FootrailL/U
blue/cyan, QuickLock teal, Foot purple, Stopper magenta, bracket/screw steel.
L/R mirror pairs are single types so they share a color already. Users can still
switch to their own filament colors via the identify card. The static demo kits
keep the planner's GEN2 palette in their manifests. Per-part
`links` {p, t, m, c} = Printables/Thangs/MakerWorld/Cults URLs **mirrored from
the planner's verified LINK_OVERRIDES** (`gen2-planner-main/js/data.js` is the
source of truth — update both together).
**Preferred model site (2026-07-25, ahead of Joey's MakerWorld/Cults uploads):**
each row shows ONE store button + a ▾ of the other stores that actually carry
the part, so rows never widen as stores are added. `STORES` in main.js (id/
key/label/host) mirrors the planner's STORES in data.js — keep ids and order in
step; array order IS the fallback chain (Printables first, most complete
catalog). Resolution: preferred store if it has the part, else first fallback —
and the button always NAMES the store it opens (a Printables-only part under a
MakerWorld preference reads "Printables", never a surprise). Stores without the
part are OMITTED from the ▾, not greyed. The preference is set BY USE (opening
a store from the ▾ adopts it), by the explicit picker (`#store-pref` beside
Copy list/CSV; planner `#link-site` in .bom-actions; the embed hides the
viewer's — the docked planner owns it), or SEEDED by `?from=<storeid>` /
referrer — seeding only fills an EMPTY preference, never overwrites a pick.
Put `?from=makerworld` etc. in the links you print in each platform's
description (also crude attribution). Cross-context sync rides a `{gen2:
'store', t, store}` message on the SAME newest-wins-by-stamp pattern as the
palette relay — deliberately NOT on buildOptions, which regenerates the scene.
Viewer storage `gen2-store`(+`:t`), planner `gen2-link-store`(+`:t`); NOT a
BUILD_FIELD (device preference, not build state — never rides share links).
Adding a store = a STORES row in both tools + `m`/`c` urls on LINK_OVERRIDES
entries (viewer LINKS/LINKS_BY_LEN inherit via the mirror rule). ⚠ MakerWorld
403s automated fetchers — those urls can't be link-checked in CI, verify by
eye. **MakerWorld coverage (2026-07-25 batch, Joey's uploads):** cases /
classic drawers / decor drawers / under-table rails / covers for ALL SIX
lengths + foot rails 115/165/185/240 — patched into BOTH tools keyed by each
entry's unique Printables model id (scratch `add_makerworld.py` pattern; the
per-SKU "185-2W-1H Decor Drawer" row and the viewer's LINKS.rail 185-fallback
share their page's id and correctly took the same m url). ⚠ Joey's foot-rails
list arrived with a row slip (165 duplicated the 115 url; 240/270 rows carried
165/240 slugs) — wired BY SLUG, and **270 foot rails has NO MakerWorld url
yet** (falls back to Printables, honestly labelled). Faceplates deliberately
have none (Joey can't publish EdgeLabel there). Kit + wall-bracket pages also
still Printables/Thangs-only. Planner-side the ▾ lives in string-rendered BOM HTML → its click handler
is DELEGATED on #bom (survives re-renders); `sitesFor` keeps the ghost-search
fallback ONLY for the single primary button when NO store has the part. `purchased: true` marks hardware-store items (magnets, screws
would-be) — excluded from the print count, shown "×N · buy", and **color-locked**
(main.js `colorLocked`: a type whose rows are all purchased gets no filament
picker — BOM chip + identify swatch inert, presets/saved tints ignored by
activeHex — it always renders its manifest color). Purchased rows also carry
**Amazon affiliate buy chips** (2026-07-12, Joey's links): `links.buy`
[{label,url}] arrays — generate.js `BUY` (magnets ×4: standard 10×2/6×2 +
N52 strong variants, people found the standard ones weak; wood screws #6/#8)
mirrors the planner's `HARDWARE_BUY` in data.js (which adds M3 screws
stainless/steel; the M3 hex nut has no link yet). Rendered after the
Printables/Thangs chips in the checklist + identify card, EACH surface with
an affiliate disclosure (`.fm-note` in the viewer, `.affiliate-note` under
the planner BOM; planner buttons carry rel="sponsored"). Update both tools
together. Per-part `img`
points at `viewer/img/parts/` (copied from the planner's BOM renders — same
art in both tools). Links + image render in the tap-to-identify card (tap
highlights the part, draws a thin pointer line to it, empty tap dismisses).
Instance `rides: "<drawerId>"` marks drawer attachments (faceplate, handle,
clip, magnet): in assembled scenes, selecting a RIDER (handle/clip/magnet) of
a seated drawer slides the whole set open 40 mm (a peek — enough to expose the
body for tapping); selecting the drawer BODY pulls it ~90% of the safe travel
(`(collection − 20) · 0.9` — deep enough to read the body colour/interior).
**Faceplate focus** (fpFocus in main.js, Joey 2026-07-08): selecting a
FACEPLATE skips the peek and ISOLATES the plate instead — every other part
fades to NOTHING (per-mesh clones, `userData.fpFade` guard so step phases/
applyState can stomp them safely; fully-faded groups get `visible=false` so
the user can orbit clear around the plate and read its BACK side), EXCEPT the
plate's own DRESSING (`FP_COMPANIONS` = Handle/Accent/Label/BackCover sharing
the plate's carrier, or riding the plate itself in the test kit — fpFocus.mates
Set, Joey 2026-07-08): those stay solid and tappable in isolation (own cards →
◀▶ swaps + recolor each piece; isolation survives). While isolated the
identify raycast is whitelisted to plate+dressing — tapping anything else
counts as empty space = deselect. The table/grid/wall/surface fade to 0 via a render-loop lerp
(`updateFpEnv` — NOT tween(), killTweens on a page snap would strand a
half-faded room; flipping `material.transparent` needs `needsUpdate=true` or
the program keeps rendering opaque), build dims hide, and the camera
fit-frames the plate near straight-on off its real bbox (both FOVs → 1W-1H
fills the frame like a 4W-2H; aim biased 15% of view height low so the plate
clears the identify card; frames the SEAT while a shut-slide is in flight,
the floating spot on the exploded page; the tween also settles camera.fov to
the preset's — selecting mid cover→step flight used to strand the telephoto
9 ≈ 4× overzoom; dFocus got the same fix). The card gains **"Open the drawer
▸"** (plate OR its handle, only when the drawer is seatable) — the
discoverable, touch-friendly hand-off the peek used to provide: it re-selects
the drawer BODY, which runs the normal deep pull + interior dims, with the
pre-isolation camera pose transferred to dFocus.saved so the final deselect
restores the original view. Drawer-body focus gains **"✕ Close drawer"**
(empty tap still works). Switching plates swaps fades without re-saving the
pose; switching drawers shuts the old one; empty tap slides shut/restores
everything. NB the tab must be foreground to verify visually — rAF freezes in
hidden tabs (tweens/env lerp stall; state changes still apply).
Steps show a LEGO-style number badge; `#note-collapse` (chevron in the note
panel) folds the step text down to that badge — session-sticky across steps —
so the model stays visible while recoloring on small screens. Mobile (≤560px):
`#step-dots` gets its own full-width row above the buttons (`order:-1` +
`flex-basis:100%` — squeezed between Back and the tools they used to wrap into
a tall column when 🎥 Resume cam appeared), and the button paddings are sized
so Back + 4 tools + Next fit one row on a 360px phone. **The step note used to
sit over the action** (Joey 2026-07-08, phone screenshots): fixed two ways —
the note panel caps at 34vh with the text scrolling inside, and
`updateViewInset()` (render loop) pans the camera PROJECTION down by half the
note's real canvas overlap via `camera.setViewOffset` (a pure pan — every
framing incl. the cinematic centers itself in the visible band, and projected
labels ride camera.project() so they track for free; cleared on desktop/cover,
`viewInsetPx = -1` in resize() re-applies with fresh dims). Camera presets can
carry **`fitR` (a radius in mm)** instead of `r` — camPos turns it into an
aspect-aware distance (`fitDistanceFor`); the faceplate cinematic uses it
(fixed r overfilled portrait phones, whose horizontal fov is ~⅓ desktop's).
The `vanish` phase also hides the W/H/L dim callouts (they floated over the
clean stage); `appear` re-evaluates them.
**Build options (generated builds only, main.js 2026-07-06):** the whole scene
is regenerate-able — `mountManifest()` (re)builds every manifest-derived thing
and `regenerate()` re-runs `generateManifest` on the mutated `build`, lazy-
loading new GLBs, tearing down old instance groups, preserving the step AND the
open parts panel (every toggle lives inside it; goTo's default panel policy
would close it when a toggle changes the step count, e.g. wallStagger). A
"⚙ Build options" block at the top of the parts panel (so it reuses the panel's
mobile bottom-sheet + updates the BOM live) drives it: Drawer close None/Magnets
(per-drawer `closure`), Drawer stoppers All/None (`build.removedStoppers` — set
of `"<unitId>:<localCol>"` keys the generator honors in all 3 stopper spots),
Handle ◀▶ (hot-swap, keeps the BlockBar variant across regenerates via
`activeHandleStyle`; the row hides while EdgeLabel plates are active), Faceplate
◀▶ (family swap via `activeFaceplateStyle`), **Faceplate back cover Off/On**
(`build.backCover`, 2026-07-08 — generator emits a `BackCover_EdgeLabel_{code}`
per decor faceplate: z-center 92.795 = mounting plane + 0.225, bottom = fp
bottom + 7.22 (DERIVED from the EdgeLabel blend @1W-1H — verify on a print),
rides the drawer, enters the faceplate demo BEFORE the plate + joins the
push-home/fades, note gains "clip the back cover…"; BOM type `BackCover`
×drawers, COLORS indigo #5b6ee1. Serves BOTH collections (shared hardware,
−dz on 165 → cover z 82.8). Family-agnostic (Essential/EdgeLabel/Classic Pro
all seat the same cover), so it coexists with the plate swap — verified on
constructed #build= links, incl. `activeFaceplateStyle` surviving the toggle's
regenerate),
wall-only Top cover Per-column/Staggered (`wallStagger`), and Reset to original
(snapshotted `originalBuild`). `currentOpts` posts closures/removedStoppers/
wallStagger/handleStyle/faceStyle/backCover and the incoming handler applies
`faceStyle` + `backCover`. **Planner side wired 2026-07-08** (gen2-planner-main:
`state.backCover` + BUILD_FIELDS + sanitize, syncOptionsToViewer posts
faceStyle+backCover, incoming validates+applies both, an Off/On toggle under
the faceplate style cards, per-size `P.backCover` BOM rows; all planner tests
pass) — so planner⇄viewer faceplate style
AND back cover live-sync both ways. Back covers were RELEASED 2026-07-12
(the files ship inside every faceplate series download since v2602): planner
rows linkAs the chosen style's series page, viewer rows carry `face.links` —
no more "coming soon". Same day the planner dropped the LENGTH prefix from
faceplate + back-cover BOM names ("GEN2 240 EdgeLabel Decor Faceplate…" →
"GEN2 EdgeLabel Decor Faceplate…") — they're universal shared hardware
(width × height only) and the prefix read as length-specific; viewer labels
never carried one. Planner partImage/COLLECTION_RULES regexes updated to the
unprefixed names. Selecting a **magnet
clip/magnet** or a **stopper** shows a ✕ Remove in the identify card (generator
stamps `owner`=drawerId / `stopperKey`); magnet → that drawer's closure none,
stopper → drop its 1W L+R pair. **Bidirectional planner sync**: the planner
opens the viewer WITHOUT noopener and both post `{gen2:'buildOptions', opts}`
(closures/removedStoppers/wallStagger/handleStyle) on change; echo-guarded
(applyingRemote + ignore-if-unchanged). Planner mirrors the model
(`state.removedStoppers` in BUILD_FIELDS, sanitized, in share links; stopper BOM
subtracts removed pairs). **Live LAYOUT sync (2026-07-19, Joey's ask):** the
planner also posts `{gen2:'layout', build}` (the FULL serializeBuild, debounced
350 ms + sig-guarded so option-only changes never ride it) whenever units are
placed/moved/removed — main.js `applyRemoteLayout` replaces `build` +
`originalBuild` wholesale and regenerates in place (layoutKey compare drops
echoes/no-ops; steps follow the layout live). Mount OR length change instead
rewrites `location.hash` + `location.reload()` (backdrop + PARTS_BASE pool are
page-lifetime). While the planner's layout is instructions-blocked it posts
`{gen2:'layoutBlocked', reason}` → `#blocked-overlay` veils the stage ("Fix
the build in the planner" + the reason, scene stays mounted dimmed behind);
the next legal layout hides it. A layout the planner allows but the generator
can't show (its errors) veils the same way and keeps the old scene. Handshake:
the viewer posts `{gen2:'viewerReady'}` to its opener after boot; the planner
(re)captures `viewerWin` from ANY incoming gen2 message's `e.source` and
answers viewerReady with an immediate layout post — so sync survives a
planner reload (once the viewer speaks) AND a viewer self-reload. `booted`
gate drops layout messages during boot; a layout arriving mid-regenerate
retries in 250 ms so the newest state is never dropped.
**Embed mode `?embed=1` (2026-07-19, the planner's docked split view):**
`IS_EMBED` (requires a #build= hash) adds body.embed — no `#topbar`, no BOM
export buttons (`#checklist-actions`; the planner owns exports) — and boots
onto the **preview landing** instead of the cover: `goTo(last assembly step)`
+ `setChecklist(false)` + `setPreview(true)` (body.embed-preview hides
`#controls`/`#note-panel` and floats `#embed-begin` "▶ Begin the
instructions" → setPreview(false) + goTo(0) = normal cover→steps flow;
the way BACK is `enterPreview()` — re-runs the boot landing: goTo(final
step, no animate) + setChecklist(false) + setPreview(true) — wired to
`#btn-preview`, an embed-only 🧪 tool in the controls bar (display:flex —
inline-flex would break the tool group's column layout — first in
#ctl-tools) AND to `#cover-preview` on the cover ("← Back to the live
preview", which REPLACES `#btn-skip-end` in embed — the skip link's job IS
the preview there). Embed cover framing: applyCover()'s landscape box-art
composition (fixed telephoto r + build framed left of the brand overlay)
shoved the model off-frame in the narrow dock — IS_EMBED gets a centered
aspect-aware fit instead (fov 12, fitDistanceFor(R·1.15), capped 7500 clear
of the 8000 far plane). And the cover snap now records `curCamPreset` like
tweenCamera would — without it, the resize that ALWAYS fires entering the
flow (the controls footer appears → canvas reshapes) re-fit the camera to
the PREVIOUS page's preset and stranded the cover on a mis-aimed telephoto
(Joey's dock repro; latent standalone bug too, masked because the cover is
page 0 at boot). Embed narrow-layout rules (the dock sits ABOVE the 560px
mobile break but below desktop room — Joey's overlap repro on the intro):
`body.embed #note-panel` caps at min(420px, 100%−170px) clear of the
top-right pills AND at 34vh with the text scrolling inside (the mobile
treatment, Joey's ask — long intro/bench notes); the checklist/final/outro
auto-expand is gated `!IS_EMBED` (the planner's own BOM sits alongside —
the panel stays one tap away on its pill, and regenerate's panelOpen
restore still honors a user-opened panel); part taps fold the panel like
mobile (`isMobile() || IS_EMBED` in setSelected) so the identify card never
fights it; and an OPEN panel hides the note entirely (mobile's one-sheet
rule — setChecklist stamps body.panel-open, `body.embed.panel-open
#note-panel{display:none}` — the note returns on close; a width cap alone
still underlapped at narrow dock widths, Joey's 2nd repro). The tap-hint
retires on the FIRST pointerdown anywhere (capture-phase document listener —
canvas, pills, panel, controls all count as "got it"; not embed-scoped, the
✕-hunt annoyed on every layout). Button vocabulary matches the planner
(2026-07-19): #controls buttons + #embed-begin radius 8 + weight 700 —
accent (#ff8a40) and font stack were already identical; the light stage
stays deliberately (filament colors read true against it, vs the planner's
dark app chrome). ⚠ #btn-preview's embed-only hiding needs DOUBLE-ID
specificity (`#controls #btn-preview`) — a bare id rule loses to
`#ctl-tools button{display:flex}` and shipped the Preview tool to the
standalone viewer, wrapping the mobile controls row (Joey's phone).
Narrow-embed squeeze in the 560px block (`body.embed #controls…`): Back +
FIVE tools + Next measured 389px at old paddings — slimmed to ~367 so one
row holds at the 380px dock floor. On the embed preview the identify card
lifts to bottom:72px (>560px widths only) clear of the Begin pill — a
selected part's card used to bury its style arrows under it (Joey).
NB planner handleStyles[0] is now DECO (its default + sanitize fallback);
the generator's own `|| HANDLE_STYLES.deco` fallback already matched. The
preview rides the FINAL STEP's state (dims, identify, colors all free), so
`regenerate()` re-lands on `steps.length` while previewMode (min(cur,…)
would strand it a step short when the layout grows) and a user's orbit
survives regenerates via camOverride. `plannerWin()` = opener OR parent —
the same sync serves popped-out tabs and the iframe. Embed extras: one-time
orbit hint (`#embed-hint`, localStorage gen2-embed-hint), and a 4 s FPS
sample posts `{gen2:'perfSlow'}` to the planner when <20 fps (its dock
offers a collapse). The partitioned-storage color problem is SOLVED by the
**palette relay (2026-07-19)**: every `saveColors()` stamps `colorsT` and
posts `{gen2:'colors', t, colors, on, user}` to `plannerWin()`; the planner
caches the newest in ITS first-party storage and replays it after every
viewerReady, and `applyRemoteColors` applies an incoming palette only when
its stamp is newer (adopting the stamp so the exchange converges; a viewer
holding a NEWER palette answers back once to teach the cache). Remote
persists via `persistColors()` (no re-stamp, no echo); payloads pass
`cleanPalette` (hex must be a color, urls http(s) — they end up in material
colors + identify-card hrefs). Dock, pop-out and reloads all converge on the
latest picks regardless of storage partitioning.
Local dev needs a hard-refresh after JS edits (module cache; deploys are
SHA-stamped so prod is immune).
The checklist step shows an engine-computed **exploded parts preview** (radial
spread from assembly center + per-type pushes; riders explode with their
drawer) — no manifest data, works for generated builds too.
**Filament colors:** FILAMENT_DB in main.js = a multi-BRAND database — one
entry per brand `{brand, line, url, colors[]}`, rendered as collapsible
sections (session-remembered expansion, count badge) under a live search box
(filters across brand+line+label; matches force-open; empty state). Sections are
keyed by **brand + LINE**, not brand alone — one brand can ship several lines on
separate product pages (Polymaker Basic PLA vs Silk PLA) and they must fold
independently. Adding
Prusa / Polar later = appending one DB entry. Today: Elegoo
PLA/PETG (★ "Elegoo PETG Black", amzn.to affiliate, Joey's budget pick for
cases/drawer bodies; ★ "Elegoo PLA Black" 2026-07-25 = the Classic faceplate
BODY) + Polymaker Panchroma™ PLA (all 28 real 1kg variants,
Shopify variant ids scraped 2026-07-05, hexes approximated) + Polymaker
Panchroma™ Silk PLA (★ "Panchroma Silk Silver" 2026-07-25 = the Classic
grip-accent rod; its own section because Silk is the `panchroma-silk` product
page, not `PM(id)`'s `panchroma-pla`) + Printed Solid
(Jessie) PLA (2026-07-15: 21 solid Basic/Premium colors, hexes + printedsolid.com
product links scraped from 3dfilamentprofiles.com/filaments/printed-solid;
PLA-only, solids-only, links-only per Joey — glitter/marble/silk/multicolor +
Mix Tape/linkless rows excluded; ★ "Printed Solid Mystery Orange" is Joey's
Handle orange, carries a per-color `pickNote`). Non-Elegoo `pick` swatches use
`f.pickNote` (falls back to the Elegoo budget-pick text). Viewer-only by design:
the planner has NO filament-color picker (it delegates color entirely to this 3D
viewer — syncOptionsToViewer posts faceStyle/handleStyle/backCover/stoppers only,
never colors), so there is nothing to mirror there. Swap for
affiliate URLs when Joey has them. Color `label` must stay UNIQUE across
brands (it's the customColors identity key). Menu carries an affiliate
disclosure line. Tap a part → swatch in the identify card → filament menu; OR
click a part's color chip in the BOM panel — both open the same menu. Picking
assigns per part TYPE, persists to localStorage
(`gen2-colors:<kit|custom-build>`), and unlocks the "🎨 My colors /
Instruction colors" toggle chip. Checklist chips + card follow the active
palette; "Get filament" link appears on customized parts. **Color mode drops
the glow** (refreshSelHighlight, Joey 2026-07-07): the selection highlight is
an emissive orange that SKEWS the color being judged (a blue pick read pink),
so while the filament menu is open the selected part renders in its plain
material — identify card + pointer line still mark it; the glow returns when
the menu closes (all 3 close paths + handle swaps route through the helper).
**Picker open/close/target (rebuilt 2026-07-25, Joey):** every dismissal goes
through `closeFilamentMenu()`, which also CLEARS `fmType` — it used to linger,
so a swatch clicked after the menu was dismissed still wrote to the
last-edited key. There's a **✕** in the menu's title row (`#fm-close`; 34 px on
the mobile bottom sheet) because there was no reliable way to dismiss it.
Clicking the chip/swatch you're already editing toggles the menu shut; clicking
a DIFFERENT one RE-TARGETS without closing (the header swatch used to just
close, which is how stale-key picks happened). The zone chip being edited wears
an accent ring (`.zone-chip.on`), rebuilt by `syncZoneChips()` on every
open/retarget/close — without it you can't tell where your next pick lands.
**One-swatch surfaces show the FRONT, not the base** (`primaryKey(node)`, Joey
2026-07-25): where only a single chip fits — the BOM row chip and the identify
card's header swatch — a part with a `FACE` zone shows and EDITS
`Faceplate:FACE`, because that layer covers the whole visible front while BODY
sits behind it and barely shows. Data-driven off the GLB's zone tags (`FRONT_ZONE`),
so any future part with a FACE inherits it; everything else still keys the plain
type. The per-zone chips remain the full control.
⚠ **"Body" is the part's BASE colour, not just the body zone**: per `activeHex`,
every zone with no explicit pick INHERITS it, so changing Body visibly repaints
all untouched zones — on the 4-zone Classic plate that reads exactly like a bug
(Joey reported it as one). It's the documented "one identification colour per
part by default" rule, so the fix was to make it legible, not to remove it: the
Body chip's tooltip now names the zones currently inheriting. Every PRESET
defines all four faceplate zones, so under a preset nothing inherits.
**Filament presets**
(main.js PRESETS, shown in the BOM panel): one click sets a filament per type —
"The Jerrari" (black shell INCLUDING the faceplate body + black back cover,
orange GRIP, silver grip-accent rod, silver handles, holo-blue Accent, white
Label, orange-PETG hardware — Joey's 2026-07-13 spec) + Stealth / Signal /
Sandstone. **The Jerrari's faceplate is REAL, buyable filament as of
2026-07-25** — the `CLASSIC_FACE` block (Joey's Classic spec): body = Elegoo
PLA Black, FACE + GRIP = Printed Solid Mystery Orange, GRIP ACCENT = Panchroma
Silk Silver. Each `name` matches its FILAMENT_DB `label` exactly, which is what
makes the picker ring that swatch as active and resolve "Buy … →" to the real
product page — copy that pattern when swapping the remaining placeholder hexes.
Joey's call 2026-07-25: this is the ONE-CLICK look, **not** the first-load
default — a fresh build still opens in the K'nex instruction palette so parts
stay findable while you follow the steps.
Every preset themes the FULL build: faceplate zone keys
('Faceplate:FACE' — Classic only, ':GRIP', ':GRIP ACCENT'), Accent/Label/BackCover, Rail — and L/U
pairs (covers, footrails) share ONE color per preset (the two-tone pair look
belongs to the instruction palette; see the alt-shade gate above). The preset
block is COLLAPSIBLE (`#preset-head` chevron, sessionStorage
'gen2-presets-open', head names the active palette while folded) so a growing
preset library never crowds the panel. Colors are PLACEHOLDERS (swap for real
Panchroma/Prusa variants + affiliate links later). **Preset-proof "My
palette"** (Joey 2026-07-06): every HAND edit (swatch pick / per-type reset /
Upload) snapshots the whole working palette into `userPalette` (stored as
`user` in the same localStorage record; pre-existing saves migrate their
colors into it); presets only replace the WORKING palette, so a "★ My
palette" chip (first in the preset row) restores the hand-built one — the
active chip (preset or mine) gets an `.on` highlight via order-independent
`palKey` compare. Hand-editing after a preset FORKS it into the new user
palette (standard custom-theme semantics). **Save colors / Upload**
export/import the current per-type choices as JSON. The first exploded page shows
a dismissable `#tap-hint` pill encouraging part taps + color changes.
**Outro page** (last, synthetic): Jerrari club promo (Printables
`#join.@Jerrari.893`, Thangs `/memberships`, jerrari3d.com, x.com/jerrari3D
via X_URL + YT_URL (youtube.com/@jerrari3D) in main.js boot) over an
end-credits cinema loop (random scene cuts every 9 s across 6 modes: close
orbit / high sweep / slow-motion explode at random depth / lateral truck-pan /
starts-exploded fast reassembly / macro detail — telephoto fov 11-17 creeping
in on a random exterior part (DETAIL_TYPES: Handle/QuickLock/Foot/Faceplate),
camera biased to the side the part faces; macro gets a double share in
CINEMA_MODES and every cut re-rolls the lens (normal shots jitter fov 37-45
with slow zoom creep); assembled scenes randomly glide a drawer open and shut —
each glide rolls its own personality: 30–95% of the drawer's travel (≈ case
depth − 20) with varied open/hold/close timings, bigger pulls taking longer;
on UNDER-TABLE builds ~55% of the wide assembled shots (modes 0/1/3) dip below
the horizon (pol 1.8–2.15) with the mounting slab shown — explode/macro keep
the clean floating stage; drifting sun + fill lights; controls disabled while
it plays. Scene cuts snap in-flight drawers home and k-settle snaps parts
exactly to basePos).
The outro is celebratory: room fades to night (~1.1 s), table darkens, grid
hides, a PMREM "party room" env (emissive color panels — no .hdr file,
offline-safe) lights the plastic, two hue-drifting point lights (decay 0)
circle the build, the sun goes warm gold, and a 400-piece InstancedMesh
confetti pool pops on scene cuts (first cut = double volley) plus mid-scene
sprinkles; bits flutter/tumble, rest on the table, then shrink out. All of it
mounts in startCinema / unmounts in stopCinema — instruction pages never see
it. startCinema also claims fov 40 (fixes stuck telephoto when dot-jumping
cover → outro).
**Cover framing is width-aware (2026-07-24):** applyCover's box-art shot is a
straight-on telephoto with the build pushed left of the brand overlay, at a
tuned `spread * 7.2`. `spread` saturates on depth/height, so it was WIDTH-BLIND
— a 3W+ build kept the same pull-back AND sat further left (the offset scales
with size.x) and ran off frame (Joey caught it on the new 3W kit; it hit any
wide planner build too). The preset now also carries `coverBox {halfW, halfH,
halfD}` and camPos's `coverDistance()` only ever pulls FURTHER back, so narrow
builds keep the tuned composition byte-for-byte. halfD is essential: the widest
thing on screen is the NEAR face, halfD closer than the centre — ignoring it ate
the entire margin on a deep 240 and still clipped. resize() re-fits `coverBox`
presets like `fit` ones, so the framing follows a window resize.
**Camera framing:** whole-build camera presets (generate.js `cam(...,FIT)`, margin
1.18) carry a `fit` flag; the viewer's `camPos` reframes them to the real
bounding sphere at the current aspect (`fitDistance` uses both v/h FOV) so 16:9
fullscreen isn't zoomed out, and re-fits on window resize. Per-case / staged-bench
shots and the exploded checklist skip `fit` (their action sits away from the
bounds). Wall bench-assembly steps target the bench (Z=`benchFwd`) and pan to the
wall (`base`) as the case hangs.
**Page model:** pages = [cover, ...steps, outro]. The cover (synthetic page 0) is
box-art (Joey 2026-07-07): the finished build shot STRAIGHT-ON at mid-height
(p 90, telephoto fov 9 → flat, near-2D faceplates; framed left for the brand
overlay + "Get started"), plus LEGO-box dressing (all renderCoverBadges(),
engine-computed from manifest+assembledBox on every cover entry, regenerate-
safe): a thick diagonal `#cover-ribbon` corner seal top-left — big collection
number (`.cr-band b`) over "COLLECTION"; the band is corner-CENTERED
(`left=(box−width)/2`) — and `#cover-badges` bottom-left (tilted gradient hero
leading with the STORAGE you get — "N DRAWERS" (or "N CASES" for drawer-less
builds) so the number reads as value, not the print-labor "N parts" did; the
raw print count stays on the checklist page — with a pop-in + steps / real
W×H×L mm chips). `#cover-bg` (a spotlight +
warm brand glow + edge-vignette gradient composited over the 3D) fades in on
the cover and out into the normal flat bg on page 2 (goTo toggles `.show`,
CSS 0.7s). The brand block is tidied — eyebrow → logo → accent rule →
"3D Build / Studio" (renamed from "Dynamic / Instruction Manual" 2026-07-10 —
the tool customizes colors/faceplates/hardware, not just instructions; the
planner's buttons carry the same "3D Build Studio" name) → arrow button — over
a soft light halo
(`.cover-right::before` + text-shadows) so it stays legible over any build color.
"Get started" pans to the intro/exploded page while the fov tweens back to 40
and the parts drift apart (playExploded). **Finished-build shortcut** (Joey
2026-07-08, for customizers who skip the build): the final assembly step's
timeline dot is a bigger ✓ marker (`.dot.finish`, darker gray until reached),
and the cover carries a quiet "Skip to the finished build →" link under the
CTA (`#btn-skip-end` → `goTo(PAGES.length - 2, {animate:false})` — snaps, no
step replay; BOM panel + dims land expanded). The checklist page is the unnumbered
"Intro"; assembly steps count from Step 1. Logo asset: viewer/img/gen2-logo.png
(copy of GLB Library/GEN2-QL Logo Main.png). Generated builds get a
deterministic fun name (generate.js ADJ/NOUN pools) as intro title + header.
Magnet clip/magnet positions are ESTIMATED from renders (see orientation
notes) — everything else is ground-truth calibrated.

## Site icons (all four repos — 2026-07-27)

`favicon.svg` + `favicon.ico` + `apple-touch-icon.png` sit at each repo's SERVED
ROOT (`viewer/` for the viewer, repo root for the other three), linked
root-absolute so `/builds/` and local dev both resolve. **The same three files
in all four repos** — the family should read as one site in a tab strip.
Generated from `viewer/img/jerrari-logo.svg` (the J teardrop, 798.74×1365.44) by
the scratch `mkicon.py` pattern: wrap the source `<g>` in a 512² viewBox behind a
`#2c2d31` rounded rect (rx 112 ≈ 22%), mark fitted to **86% of tile height** —
Joey picked 86 over 90/94 off a proof sheet; 94 crowded the tile corners at
128 px. ICO is 16/32/48 multi-res via `magick … -define icon:auto-resize`;
apple-touch renders from an rx=**0** variant (iOS masks its own corners, and a
pre-rounded tile fringes).
⚠ **The tile is not decoration** — the mark's core is a WHITE path, so a
transparent icon dissolves into a light tab bar and degrades to an outline. Any
future icon variant must keep an opaque backing.
⚠ **BOTH label-generator repos have MIXED line endings** (not just Classic Pro,
as previously noted — EdgeLabel's `</title>` line is CRLF while its neighbours
are LF). A normal file write normalises them: a 6-line insert produced a
**260-line diff / 127 phantom deletions**, exactly the `fafbad8` failure mode.
Edit those two byte-exactly (read bytes → insert reusing the neighbouring line's
own terminator → write bytes; scratch `insert_icons.py`), and check
`git diff --stat` before committing. Each repo now also carries `*.ico`/`*.png`
`binary` in `.gitattributes` (the planner gained its first `.gitattributes` —
binary rules ONLY, no `text=auto`, so nothing renormalises).

## Analytics — GoatCounter (viewer wired 2026-07-27)

Cookieless, no consent banner, **nothing stored client-side** — that last part is
load-bearing, which is why there is deliberately no "returning visitor" event
(it would need an analytics-only localStorage key; the other `gen2-*` keys are
user settings and legitimately exempt).

**Two SEPARATE GoatCounter sites, one account.** Planner → `jerrari.goatcounter.com`
(instrumented long before this; `track()` in its `js/app.js` + ~28 call sites).
Viewer + `/builds/` → **`jerrari-build.goatcounter.com`** — separate so the two
apps' `/` pageviews don't collapse into one row, and so viewer event names need
no app prefix. Created + production-verified 2026-07-27. The endpoint lives in
exactly two places: the `data-goatcounter` tag in `viewer/index.html` and
`viewer/builds/index.html`. (New sites: Settings → **Sites** — GoatCounter
doesn't use the phrase "additional sites" anywhere in its UI.)
⚠ **Keep `src` ABSOLUTE (`https://gc.zgo.at/count.js`).** GoatCounter's own
copy-paste snippet is protocol-relative `//gc.zgo.at/…`, which via `file://`
resolves to a Windows network share and hangs the page for minutes. Both apps
are pinned deliberately — don't "correct" them to match the snippet.
**Testing the endpoint without guessing:** `/count` answers a good request with
a 1×1 GIF and an unknown site code with a 404, so an `<img>` onload/onerror
probe is a definitive check — run a made-up site code alongside it as a control.
The browser tools' network log won't help: it records only fetch/XHR, and the
beacon (and count.js itself) are image/script loads.

`track(name)` in main.js mirrors the planner's helper and its **colon vocabulary**
(`step:4`, `out:printables`) — one shape across both apps. Additions over the
planner's version:
- **A boot queue.** main.js fires `open:`/`collection:`/`error:` DURING boot,
  which can beat count.js's async load (the planner's events are all
  click-driven, so it never hits this). Events sent before the beacon exists are
  queued and flushed by a 400 ms poll for **30 s** — not 5, a cold CDN on a slow
  phone takes longer, and giving up early drops precisely the highest-value
  events — plus a `load` flush, whichever wins.
- `trackOnce()` for `step:*` / `complete` / `identify:open`: Back, replay and
  `regenerate()` all re-enter `goTo`, and a step counted twice makes the
  drop-off curve meaningless.
- **`linkEl` is the single outbound funnel.** Every store button, ▾ item, buy
  chip and "Get filament" is built there, so ONE listener covers them all and
  future links are instrumented for free. Hostname → a fixed id via `OUT_HOSTS`
  (⚠ include `than.gs`, the short domain `LINKS` actually uses, or Thangs lands
  in `out:other`). Pass `linkEl`'s 3rd arg where the host doesn't tell the story
  (`hardware:buy` vs `filament:buy` are both amazon).
- The label-gen pill and `#fm-buy` are STATIC anchors (markup owns them, only
  the href is swapped) → they miss `linkEl` and carry their own listeners.
- `setStorePref` tracks only when `relay` is true — it's also the receiver for
  the planner's relay, and the planner already counts its own `linksite:` pick.

**Every name comes from a fixed vocabulary** (kit ids, store ids, preset names,
brand slugs, step numbers). Never a colour label, hex, or `fm-search` term —
that's the rule that keeps this consent-free. Filament picks report the BRAND
only.

Events: `open:<kitId|planner-link|embed|kit-<name>>` · `collection:<L>` ·
`mount:<m>` · `from:<store>` (our own param — GoatCounter reads `ref`/`utm_source`
natively but not this) · `start` · `skip-to-end` · `step:intro|<n>` · `complete` ·
`outro` · `out:<store>` · `store-pref:<id>` · `bom:copy|csv` · `hardware:buy` ·
`filament:buy` · `filament:<brand>` · `preset:<slug>` · `colors:mine|instruction|save|load` ·
`identify:open` · `style:handle:<slug>` / `style:faceplate:<slug>` (names the style
LANDED ON — "which do people pick" beats ◀/▶) · `labelgen:<family>` ·
`customize:cover|outro` · `opt:closure|stoppers|backcover|topcover|reset|remove-*` ·
`error:kit-not-found|kit-version|kit-generate|build-damaged|build-unsupported|build-crash|parts-missing|webgl`.

⚠ **Verification can't use the beacon.** count.js loads fine on localhost but
discards localhost hits by design, and forcing them would write junk into the
real dashboard. So `?debug=1` exposes **`__GEN2_VIEWER__.trackLog`** — every name
fired this session, in order (capped 200). It's installed EARLY as well as in the
main hook at the end of main.js, because a boot failure throws long before that
hook exists and the error events are exactly the ones worth reading back.
Walk the funnel with `goTo()` and diff the log.

Two things this wiring FIXED along the way, both pre-existing:
- **No WebGL used to hang the spinner forever** (uncaught constructor throw).
  Now a readable message via `bootFail` (hoisted, so it's callable that early)
  plus `error:webgl` — those visitors were previously invisible.
- **The `#build=` catch conflated three failures** into "this link is damaged,
  copy it again" — including builds that decoded perfectly and were merely
  unsupported. Split into `build-damaged` (mangled hash) / `build-unsupported`
  (generator returned errors) / `build-crash` (generator threw). Messages
  unchanged; only the events distinguish them.

`&ref=` (per-listing attribution, no code — GoatCounter reads it natively) is
documented in `2026-07-25-kit-upload-checklist.md`.

### The telemetry dashboard — `viewer/stats/` (2026-07-27)

A retro-HUD front end for GoatCounter at **gen2build.jerrari3d.com/stats/** —
one self-contained `index.html`, same build-free convention as everything else.

⚠⚠ **The page CANNOT read the GoatCounter API, and no amount of fiddling will
change that.** The token is accepted only in an `Authorization` header; a
non-safelisted header always forces a CORS preflight; GoatCounter implements no
`OPTIONS` handler. So every authenticated cross-origin call is refused. Its
*GET* responses do carry CORS headers, which is the trap: an early check
returned a readable 401 and looked like a green light — but it ran against a
site code that **did not exist yet** and fell through to a generic handler. The
whole first version of this page was built on that false positive and failed the
moment it met the real endpoint. **Verify against the real resource, in its real
state, or you have verified nothing.**

**So the data arrives as a SNAPSHOT.** `.github/workflows/stats.yml` runs
hourly, `.github/scripts/fetch-stats.mjs` reads the API server-side with
`secrets.GOATCOUNTER_TOKEN`, and the result is force-pushed as a single commit
to the **orphan `stats-data` branch** (NOT main — hourly bot commits would bury
the real history this repo leans on, and would trigger a Pages deploy every
hour). The page fetches it from `raw.githubusercontent.com`, which serves
cross-origin (verified). Three problems die at once: no CORS, the token never
touches a browser, and tracker blockers stop mattering because a GitHub runner
makes the request, not a visitor.
- **Setup is one repo secret**, `GOATCOUNTER_TOKEN` — a GoatCounter API token
  with **"Read statistics" only**. Tokens are created at User → API and are
  ACCOUNT-level: the "All sites" grant (default) means ONE token covers both
  sites. There is no per-device setup and nothing stored in localStorage.
- The snapshot is **public** at its raw URL — aggregate only (counts by country,
  path and event), no personal data. Joey's call, taken deliberately.
- The header shows how old it is; REFRESH drops the cache and re-fetches.
- `fetch-stats.mjs` trims what it stores: per-hit `stats` arrays are dropped
  entirely and `total.stats` is cut to the last 3 days (the strip only ever
  draws 48 h). Without that the file is many times larger for nothing.
- ⚠ Rate limit is **4 requests/second**; the script issues ~26, so it paces at
  300 ms and retries on 429. Adding a range or endpoint multiplies that.
- ⚠ This page carries NO GoatCounter script — tracking the dashboard would fold
  admin visits into the numbers being read.

World map: vendored `world-atlas` 110m TopoJSON (107 kB, Natural Earth, public
domain) + a ~20-line decoder inline (the format is just delta-encoded shared
arcs; not worth a library). Three things that WILL bite a future edit:
- **Antimeridian.** Russia's ring runs +180 → −180; projected naively the
  closing edge fills a band across every longitude at the top of the map. Rings
  with a >180° jump are rebased to a continuous 0..360 run and drawn twice
  (as-is and −360), letting the canvas clip. Fiji and NZ's outliers need it too.
- **Small countries don't exist at 110m.** Singapore is consistently top-3
  traffic and has no polygon at all — it would rank second in the list and
  appear nowhere. `PTS` holds centroids for the 76 such countries; they render
  as glowing markers. Anything in the data with neither a polygon nor a centroid
  is invisible, so keep both tables in step.
- **Colour ramp stops must be saturated.** A straight cyan→orange RGB lerp
  passes through a desaturated olive and mid-traffic countries came out muddy
  grey-green. `RAMP` is a 6-stop neon thermal scale interpolated between
  ADJACENT stops; the country list uses the same scale so map and list agree.
- The alpha-2 → ISO-numeric table (`A2N`) exists because the atlas keys
  geometries by numeric id while GoatCounter reports alpha-2.

⚠ **GoatCounter returns FULL 24-slot hourly arrays including hours that haven't
happened yet**, so the series is cut at the current hour and `thisHour` is
looked up by key, never taken from the tail.
⚠ **And those stats are in the ACCOUNT'S timezone, not UTC** — which is exactly
why the spec carries a separate `total_utc` beside `total`. Cutting at the UTC
hour on a US account looked 4 hours into the future: "this hour" was a
guaranteed 0 and the strip carried a dead tail. The zone is read once per
session from `/api/v0/me` (`user.settings.timezone`) and the axis is labelled
with it; a failed lookup or bad zone name falls back to UTC.
⚠⚠ **That field is REGION-PREFIXED — `US.America/New_York`, not
`America/New_York`.** It is not a valid IANA name, so `Intl` throws and the
whole timezone fix degrades silently back to UTC — the same bug it was written
to cure, just harder to spot (this-hour back to 0, dead tail on the strip).
`resolveTz()` tries the raw value, then the part after the first dot, then UTC,
VALIDATING each against `Intl` rather than trusting the format.

**Verifying it without a token or a screenshot:** the Browser pane can't
screenshot unless it's displayed, and there's no real token to hand. Stub
`window.fetch` for `goatcounter.com` URLs with mock payloads (`tokens` is a
script-scoped `let`, assignable from the console) — that exercises the real
render path. To SEE the result, POST a canvas `toDataURL` to a throwaway local
sink (scratch `shotsink.py`; `mode:'no-cors'` with a text body needs no
preflight, so the sink needs no CORS headers) and read the PNG off disk.
Both the antimeridian band and the future-hours bug were caught this way and
would not have shown up in any assertion.

## Run / preview

⚠ **Never write a whole source file back from a copy you read earlier in the
session — re-read first, and check your own diffstat for deletions you can't
explain.** This is not hypothetical: commit `fafbad8` ("Crystal handles land +
embed polish", 2026-07-20) did exactly that to `generate.js` and silently
REVERTED the completed 2026-07-19 under-table rails wiring — 24 insertions / 38
deletions, where every deletion belonged to a feature the commit never mentions.
It reached production and broke under-table generation for 4 of the 6
collections (the planner meanwhile advertised all six, so the 3D button was live
and led to an error overlay). Found + restored 2026-07-25 from `369dcff`. Two
cheap habits catch it: prefer targeted edits over whole-file writes, and read
your own `git show <sha> --stat` before committing — a file shrinking in a
commit that only adds a feature is the tell.

`.claude/launch.json` → "viewer" (`python serve-viewer.py 8123` — a no-store
http.server serving `viewer/`). Or double-click `serve-viewer.bat` (repo root).
**Cache-Control: no-store is deliberate** (2026-07-08): plain `python -m
http.server` sends no cache headers and Chrome's heuristic cache serves STALE
ES modules — "my generate.js edit does nothing" / half-applied features (bit
Joey twice). With no-store, hard-refreshes are never needed locally; deploys
are SHA-stamped so prod never cached wrong. NB the Claude preview server is
EPHEMERAL — it dies with the session; the planner's local "3D instructions"
button needs SOMETHING on :8123 (Joey's "viewer won't load but planner does"
repro = no server). Repo: github.com/Jerrari12/gen2-visual-animator — pushing
main IS a deploy (Pages action serves viewer/). **Custom domain (2026-07-23):
gen2build.jerrari3d.com** — `viewer/CNAME` rides the Pages artifact; the old
github.io URL 301-redirects (hash + query survive). Joey's one-time setup: DNS
CNAME `gen2build` → `jerrari12.github.io` + repo Settings→Pages→custom domain
+ HTTPS. The planner's prod `INSTRUCTIONS_VIEWER_URL` points here. NB the
domain change reset viewer localStorage once (origin-scoped saved colors) —
that's why it shipped BEFORE any official-kit link was printed anywhere.

## Official kits (permanent beginner links — 2026-07-23)

Preconfigured builds a beginner can follow like LEGO instructions, with links
durable enough for Printables descriptions / QR codes. `viewer/builds/<id>.json`
= `{gen2OfficialBuild:1, id, title, tagline, buildVersion:1, build:<the
planner's serializeBuild() shape>}` — opened via **`?build=<id>`**
(gen2build.jerrari3d.com/?build=240-tabletop-2w2h). The build data lives in the
COMMITTED file, not the URL: short links, no base64 mangling, and a kit is
fixable post-print (replace the file; the id stays). Ids are mintable by repo
commit only — `?build=anything-else` = friendly 404 with a gallery link — so
there's nothing for users to name or abuse (user builds keep the anonymous
`#build=` hash). Precedence in main.js boot: `#build=` hash (planner hand-off,
wins) → `?build=` official → `?kit=` static. **`migrateOfficialBuild` in
generate.js** (exported; main.js imports it) is the version gate — THE RULE:
planner build-format changes must be ADDITIVE, else bump the exporter's
buildVersion and add a migration case (committed kits must never go stale);
returning null = file newer than the deployed viewer → "refresh" message.
Official mode: `OFFICIAL = {id,title,tagline}`; mountManifest overrides
manifest.title + brands the intro step (tagline + "An official GEN2 kit" text
swap) on EVERY mount so it survives regenerate(); colors persist per kit
(`gen2-colors:official-<id>`); IS_EMBED stays false (embed requires the hash).
**Customize CTA** (official only): `#btn-customize` on the cover (accent-tinted
quiet pill under the skip link) + `#outro-customize` in the outro card — both
open `PLANNER_URL#build=` of the CURRENT mutated build (option tweaks ride
along; raw base64, NEVER percent-encoded — the planner's decode lacks
decodeURIComponent and silently fails on encoded hashes). **Gallery:**
`viewer/builds/index.html` (standalone page, no three.js) — styled as a
SECONDARY PAGE OF THE PLANNER (Joey 2026-07-23): its dark :root tokens,
hero-bar brand ("GEN2 KITS" wordmark + "← Open the GEN2 Planner" ghost pill),
and footer mirror gen2-planner css/style.css. The page wears the PLANNER'S CHROME (Joey 2026-07-24 — "it needs to feel
like a different page on the same website"): the same parallax hero photo
(`viewer/img/page/GEN2-Background-A.jpg`, copied from the planner repo), shade
gradient, brand bar and tagline/chips block, with js/hero.js's slow pan ported
inline. **Cross-site nav both ways:** a "← GEN2 Planner" pill + footer link
here, and a "🧩 Official kits" pill + footer link in the planner (its `KITS_URL`
= INSTRUCTIONS_VIEWER_URL + "builds/", so local dev walks between the tools).
Narrow screens drop jerrari3d.com from both bars, and the planner also sheds
its PLANNER sub-word ≤430px. ⚠ The planner's new hero-bar media rules sit
AFTER the `.hero-bar`/`.brand-*` base rules on purpose — the older 560px block
near the top of style.css cannot override them (same specificity, later rule
wins regardless of media query). Planner dev now has `serve-planner.py`
(no-store, mirrors serve-viewer.py) — a plain `python -m http.server` served
stale css/js and made a fresh edit look broken. Cards render from
`builds/index.json` (stats + `length` precomputed at authoring): each card is
the planner mount-card pattern — dark panel, the kit's 3/4 render as a
right-side background under a left legibility gradient, and the planner's
LENGTH COLOR (data.js GEN2.lengths, mirrored in the page's LENGTH_COLORS —
240=#3ecfa0 green etc.) as a left spine + "<L> COLLECTION" chip. Card art =
**`?shot=1` capture mode** (main.js, dev-only like ?debug): boots the build,
applyState(final), hides table/grid/wall/surface, sets scene bg to the card's
EXACT panel gray #3a3b3f, 1200×750 @ t35/p66/fov40 fit 0.95, slides camera+
target along screen-left by buildRadius·0.5 so the build sits RIGHT-of-center
(text column overlays the empty left), downloads `<id>.jpg` → commit to
`builds/img/`. The page contain-fits the render (never crops; the matched bg
gray blends seamlessly — a missing image degrades to a plain panel).
**Card palette (Joey 2026-07-24):** the instruction rainbow made all five kits
look identical at thumbnail size, so captureShot() FORCES its own product
palette — faceplates take the collection color (SHOT_LEN_COLORS, the planner's
lineup palette), everything else goes graphite/black. Deterministic: it
replaces whatever palette the tab holds, so re-captures are reproducible.
`captureShot()` is exported on the debug hook, so an automated capture drives
the exact same code path as `?shot=1`.
Debug hook also exposes renderer/table/grid/camPos/buildCenter now. **Authoring:** the planner's
"📦 Export official kit" button (Save & share block, `IS_LOCAL_DEV`-gated —
invisible in prod) prompts title/id(slugified, editable)/tagline, downloads the
wrapper, and console.logs the ready index.json row. **Golden tests (the
durability guarantee):** repo-root `npm test` → `test/official-builds.test.mjs`
runs every builds/*.json through migrate+generateManifest (pure JS, plain node)
and diffs against `test/golden/<id>.manifest.json` — a generator change that
alters an official kit fails before it can deploy over a printed link;
intentional changes refresh via `UPDATE_GOLDEN=1 npm test`.
⚠ `npm test` is bare `node --test`, which executes **every** `.mjs` inside
`test/` — not just `*.test.mjs`. Drop a scratch probe in there and it becomes
part of the suite (one that loads a GLB or waits will hang `npm test`
outright, which is exactly what happened 2026-07-25). Put throwaway scripts in
a scratch dir OUTSIDE the repo, and if the suite ever hangs or reports odd
counts, `ls test/` first. Same rule in the planner repo.
`test/parts-exist.test.mjs` (2026-07-25) is the second suite: it sweeps every
legal single-unit build (6 lengths × both drawer fills × all sizes × mounts ×
faceplate families × handle styles) and asserts a generated manifest never
references a GLB missing from `viewer/parts/<L>/` — the exact condition that
used to hang the app (see the Classic Drawer 3H note in the GLB Library
section). It also enforces each static kit folder backs its manifest, all
NINE handle styles when the kit has handles, and all four faceplate families
per plate size (the Crystal batch once skipped the kit folders and ▶ died
silently on the default page; every kit carries all nine now, and main.js's
cycle handlers roll back + SKIP a style whose GLB is absent instead of dying —
applyHandleStyle/applyFaceplateStyle return `false`, loadTemplates collects
missing nodes and throws a READABLE error that boot routes to bootFail and
regenerate to showBlocked with regenBusy cleared).
**The five starter kits (2026-07-23):** `{115,165,185,240,270}-tabletop-2w2h` —
ONE layout for all (2W-1H on top, two 1W-1H below = 3 drawers / 39 prints /
12 steps) so the collection DEPTH is the only variable across the family. 59
is excluded (hanging-only). **Magnet closures are ON by default and that's
deliberate** (Joey): it adds the clip/magnet install steps and puts the
hardware-store magnets in the BOM with their affiliate buy chips — a beginner
sees exactly what to order; stoppers ship too, and both are ✕-removable in the
viewer so the kits double as a demo of Build options. **Classic faceplates
since 2026-07-25** (was Essential + Deco handles): the grip prints in, so the
kits need **zero** required hardware and the wrench counter is gone — see the
"Decor Faceplates — Classic" section. Magnets stay opt-in, so they don't
count against the print-and-build-today promise.
Gallery `dims` are the
TRUE physical envelope read from the viewer's assembledBox (matches the cover
badge — 240 = 176×140×269), NOT the planner's grid math.
**Second tier — the 3W kit (2026-07-24):** `{115,165,185,240,270}-tabletop-3w2h`
— top row 2W-1H + 1W-1H over three 1W-1H (5 drawers / 63 prints / 14 steps).
**Naming: every kit is a "Tabletop Kit", differentiated ONLY by footprint**
(`GEN2 240 Tabletop Kit 3W-2H`, id `<L>-tabletop-<w>w<h>h`) — Joey rejected a
separate "Workbench Kit" name because the ASSEMBLY PROCESS is identical, and a
new name implied a different build type; W-H codes are the system's existing
vocabulary (cases are already 2W-1H etc.) so users parse them for free. Ids
were renamed 2026-07-24, which is only safe because nothing was published yet
— **once a link is printed in a Printables description the id is frozen
forever** (that's the whole point of the official-build indirection).
It exists to TEACH THE BRICK STAGGER: at ≤2W both cover/footrail layers are a
single tile, so the two-layer design reads as pointless doubling-up (Joey's
most-asked question); at 3W the seams offset (CL 2W+1W over CU 1W+2W) and the
generator's own notes already narrate it ("staggered brick-style… tying the
base together"). Measured tradeoff before choosing this layout: 2W = 3 drawers/
42 prints; 3W single-row = 2/38 (CHEAPER than the starter but poor value);
3W 4-unit = 4/60; this 5-unit = 5/68 (best drawers-per-print of all four).
Both tiers now cover all five lengths (10 kits). **Taglines describe the unit
on its own terms**, never by comparison ("one column wider" had nothing to
compare to on a standalone Printables image, Joey 2026-07-24) — and index.json
is the SOURCE OF TRUTH for title+tagline: the per-kit files were re-synced from
it (they had kept em-dashes when the hyphen pass only touched the index, so the
viewer's intro step and the gallery card disagreed).
Tiers are a PROGRESSION, not a choice — each kit gets its own Printables page,
so a beginner only ever meets one link; the gallery is the only place both
appear, grouped "Start here" / "Go bigger" via each index.json row's `tier`
(missing tier → first group). **The non-staggered notes now explain WHY there
are two layers** (upper footrail + upper cover steps in generate.js): the
lower cover carries the stopper slots and dovetails, the upper locks them in.
That fires on every ≤2W build, planner-generated ones included.
**Gallery sections are MOUNT × SIZE** (2026-07-24, ahead of under-table/wall
kits): each index.json row carries `mount` + `tier`, sections render as
"Tabletop · 2W-2H" (the mount prefix appears only once >1 mount exists), and a
mount filter bar appears on the same condition. Mount leads because it's the
planner's own question 1 and the builder's hard constraint; size is the
progression inside it. Flat (mount, size) sections beat nesting — they stay
scannable as the matrix fills. Verified by injecting fake wall/under-table rows.
**Printables share images:** `viewer/builds/banner.html` (dev tool, same folder
as the gallery) renders each kit as THE SAME CARD the gallery shows — length
spine, collection chip, title, tagline, stat chips — at 1600×700, drawn on
canvas from `builds/index.json` + the `?shot=1` render. Joey picked the card
over the earlier wide "Interactive 3D Build Guide" banner (2026-07-24): it's
more polished and carries real detail. Two things a standalone card can't do,
so they're added: the button can't be clicked, so it states the VALUE
("Interactive 3D build guide →"), and the address is printed under it. The copy
block is measured then vertically CENTRED (a fixed start left a dead gap under
short taglines). Output `builds/img/card-<id>.jpg` ("Download all", or POST the
canvases). The old `banner-*.jpg` files are gone.
Rollback tag in both repos:
`pre-official-kits`.

## Planner → generated instructions (BUILT)

`viewer/js/generate.js` compiles planner state → manifest at runtime. Input:
`viewer/#build=<base64>` — the **same encoding as the planner's share links**
(`encodeBuildHash()` in planner app.js; also accepts the file-export wrapper).
Planner's "🧊 3D assembly instructions" button (bom-actions row) opens
`INSTRUCTIONS_VIEWER_URL + "#build=" + encodeBuildHash()` — update that constant
in planner app.js when the viewer deploys. Generated builds load parts from a
per-collection pool `viewer/parts/<L>/` (`59/115/165/185/240/270` — each
self-contained: the collection GLBs + copies of the shared hardware/faceplate
GLBs; lazy per node; `PARTS_BASE` in main.js = `parts/${manifest.collection}/`;
the 59 pool is trimmed to its 1W/2W × 05H/1H faceplate-family sizes).
Scope (2026-07-19): **ALL THREE MOUNTS for ALL SIX collections** — the last
gap closed when the 2026-07-19 rails batch landed rail GLBs for 59/115/240/270
(`2026-07-19-under-table-rails-batch.md` is the run log; `COLL[L].railDepth`
per length: 59=74.89 / 115=130.9 / 165=179 / 185=201 / 240=240 flush-back /
270=286; a length WITHOUT railDepth still errors gracefully, and the planner's
`VIEWER_UT_LENGTHS` + updateInstructionsButton machinery — visible reason line,
board note, length-card "no 3D guide yet" badges, 2026-07-19 — stands ready to
grey any future capability gap). Rail BOM rows show the per-length renders
(imgFor `UnderTableRail_<L>-<w>W` → flat `Rails <L>-<w>W.png`, 24 copied from
`D:\Render Projects\GEN2 Thumbnails`; planner partImage serves the same art
from `img/parts/<L>/`); **59 is hanging-only** (`COLL[59].noTabletop` +
maxW/maxHH guards — no foot rails, no feet slots; mirrors the planner's
mountBlocksLength). classic drawers are full 3D parts (2026-07-11 — see the
GLB Library section for the derived placement); shelf >1H /
cabinet → graceful error overlay. Also
rejected: non-flat tops (mirrors the planner's columnTops() flat-top rule —
the planner button greys out with the reason via updateInstructionsButton())
and builds over 80 units (a step per case stops being instructions).
The four new lengths generate with a runtime warning ("scaled from the 185
calibration") — every hardware Z is DERIVED via ±dz (sign generic: 240/270
shift outward), ZERO ground-truth assemblies; verify on printed builds like the
165. Deep collections get depth-scaled staging (`slideBack`/`wallFwd`/`drwPop`/
`CAM_DEPTH` locals in generate.js). ⚠ **`drwPop` (the Drawers-step pop) MUST
scale with depth**: the magnet clip rides the drawer's BACK (z −83 + dz), so
the pop has to clear the CASE FRONT (depth/2) or the clip is installed
*inside* the case — a hardcoded 190 buried it 40 mm on the 240 and 70 mm on
the 270 (Joey 2026-07-25). `drwPop = depth + 5` puts the clip a constant
14.5 mm proud on every collection and is a generalization of the 185
calibration, not a new tuning (185 + 5 = the old 190, so 185 is unchanged).
165/185 output stays byte-identical
(regression-tested old-vs-new on 11 build shapes, 2026-07-10). Faceplate family
swap serves all six (main.js FACEPLATE_STYLES.collections). Every collection's
case/drawer/cover/footrail BOM rows show real photos (2026-07-10 render
batches, copied from the planner); the new lengths still reuse the 185
Printables/Thangs links as placeholders.
**Collections 165 + 185** (generate.js `COLL` table, `build.length`): the 165 is
the 185 shrunk exactly 20 mm deep. Every part exports re-centered on its own bbox
(`depth_mode: center`), so in file coords each case face moves `dz = (185−depth)/2`
(= 10 mm for 165) toward center. Node names template off `L` (`${L}-…_Case`,
`DecorDrawer_${L}-…`, `CL/CU-${L}-…`, `FR-L/U_${L}-…`, `UnderTableRail_${L}-…`);
collection-specific parts (case/drawer/cover/footrail/rail) shrank with the case
and keep their center-relative Z (**drawer z-center 5.24 is unchanged** — the
drawer is 5.7 mm shorter than the case in BOTH collections). SHARED hardware is
placed against a case face, so its Z shifts ±dz: faceplate/handle/QuickLock/
stopper/front-feet `−dz`, magnet clip+magnet/back-feet `+dz`. Wall mount is
BACK-aligned (case back meets the bracket) → the bracket + wood screws shift
`+dz` forward to meet the shorter back; front hardware is unchanged from tabletop.
Under-table rail front-aligns with the case front (`railZ = depth/2 − railDepth/2`
→ −8/185, −7/165); its screw rows sit on **MEASURED hole rows (2026-07-19)** —
front 12 mm from the rail front on EVERY length, back per-length
(`COLL[L].railScrewBack`, inset from the rail back: 59=16.89 / 115=42.4 /
165=34 / 240=20; default 36 = the 185 calibration, 270 matches it). Measured by
hole-bore face-clustering on the rails blend's evaluated meshes after Joey
caught the 59 back screws floating ~18 mm off (the old one-size-fits-all 36
was wrong on three lengths, incl. 165 by 2 mm); every measured back row carries
holes exactly at the end+seam screw Xs on all widths. Screw pos = hole axis
− 3.43 (the radial offset the pitched WoodScrew GLB carries).
**DERIVED, no 165 ground-truth assembly** (185 was calibrated against the TableTop
Assembly Example): QuickLock / stopper / feet Z — verify by eye on a
printed 165 build, like the non-1H drawers (UT-screw Z graduated to MEASURED,
see above). 165 has no BOM renders yet (imgFor
reuses the 185 render); LINKS still point at the 185 Printables/Thangs pages
(swap when 165 URLs exist). Verified 2026-07-06: all 3 mounts generate, every
GLB resolves in `parts/165/`, 185 output byte-identical (no regression).
**Wall mount** (`build.mount === 'wall'`): no feet/footrails — one bracket
course (WallMount_Lite_1/2/3W, tiled to width, no 4W) spans the flat top with 2
WoodScrews per 1W column at ±24 as pegs; cases hang TOP-DOWN (steps reversed).
Covers slide back→front like tabletop, so on a wall they MUST attach to the top
cases at a forward bench (`WALL.benchFwd` 200, clear of the wall) BEFORE the case
hangs — they're per-top-case (not a separate end step) and STAGED (`w${i}`) at
the bench so the assemble/hang can be two deterministic steps. Bench order is
physical: case → QuickLocks → clip → **CL → drawer stoppers → CU** (stoppers go
into the Cover Lower before the Cover Upper caps them, else they clip the CU;
top-row drawers' own stoppers are generated inline here, so the generic stopper
loop skips wall top-row drawers). Then the whole staged group moves back
−benchFwd (pegs enter) → drops −Y 16 → `land` (settles in place). The FIRST top
case shown (`ghostTopIdx` = last generated, since wall reverses to top-down) is
SPLIT into two steps ("Cover the top case" + "Hang the top case on the pegs")
and its hang gets a ghost+zoom peg demo (engine `ghost`/`solid` + per-phase
`camera`); other top cases are one step; lower rows just hang. Wall case steps
use descriptive titles (no "Case N" renumber).
**Under-table mount** (`build.mount === 'under-table'`, CALIBRATED 2026-07-06
against `GEN2 Under-Table Rails - case to rail example.blend` — see
GEN2-Part-Orientation-Notes.md "Under-Table Rails"): one rail course
(`UnderTableRail_185-1/2/3/4W`, tiled biggest-first per contiguous top run)
spans the flat top; rails screw UP into the surface (screws `rot:[90,0,0]` —
main.js instances now accept `rot:[rx,ry,rz]`, `yaw` still works) with 2(W+1)
screws per tile (= planner railScrews; blend independently confirmed the
formula). Rail bottom = flatTop − 2, z-center −8 (front-aligned, 201 deep);
table underside = flatTop + 6.9. No covers/feet/footrails; steps top-down like
wall; EVERY case slides straight back from +Z `UT.fwd` (top row into the rail
channels, lower rows QuickLock under the row above; the first-shown case
assembles out front via enter-`at` + a canceling move, with the camera rising
to an overhead 3/4 for the QuickLock install — width-scaled r so both slots
frame on any size — then a camera-only phase glides back below BEFORE the
slide-in); all case steps use the camUp 3/4-below preset; top-row drawers skip
stoppers (the rail has them built in). main.js `isUnderTableBuild` swaps table+grid for a horizontal `surface`
slab (fitSurface: underside on the rail tops; **front edge flush with the rail
fronts** — desk-edge mounting, drawers/handles poke past it — 90 mm margin on
the back/sides only) hidden whenever the camera rises above its underside —
the horizontal twin of the wall-backdrop hide — and the outro cinema
hides/restores it like the wall.
**Staggered wall covers** (`build.wallStagger`): the top row is placed case-by-
case on ONE shared `'wtop'` bench stage, then a single connected cover
(brick-tiled `tilesLower/tilesUpper` across the FULL width, seams offset) goes
on — CL → top-row stoppers → CU — and the whole row hangs as a unit
(`stagCoverStep` + `stagHang`, composed ahead of the reversed lower rows). Per-
column (default) keeps per-case covers. **Magnet clips** (case-back + drawer
clip, +2 magnets) only generate when the planner drawer's `closure === 'magnet'`
— none/push-click drawers skip them and the notes drop the magnet steps.
Lower rows slide straight in from +Z `WALL.lowerFwd` (a full case-depth + 40, so
the slide-in reads clearly; no drop, so they can't clip the row above) as one
piece — the enter phase is `sync: true` so the case + its QuickLocks move in
unison (engine skips the per-item stagger delay). They're shot from a 3/4-below
**camUp** preset (p=116; needs the wall
build's relaxed `controls.maxPolarAngle` = 0.85π). **Every per-case wall shot
(bench, peg zoom, lower-row slide-in) is sized by `caseR` — the CASE + its
hardware, never the whole build** (Joey 2026-07-11: on wide builds cam()'s
totalW scaling shrank the action to a thumbnail; don't crop the wall into
view). The wide FIT shots bookending each step still restore full context. CALIBRATED 2026-07-05 (WALL constants; bracket
Z −89.45, peg Y = flatTop − 15.1) against the case-to-bracket reference — see
GEN2-Part-Orientation-Notes.md. Wall builds swap the table+grid for a
`wall` backdrop plane (main.js `isWallBuild`, toggled on manifest load; the
outro cinema hides it for a clean stage and restores on page-back). `fitWall()`
sizes it to the assembled build + 90 mm margin, just behind the case backs (a
"mounting surface", not an infinite wall); the render loop hides it whenever the
camera orbits behind it (`camera.z < wall.z`) so pegs/case-backs stay inspectable. Screws sit
at flatTop − 18.1 (3 mm below the measured peg, to line up with the bracket
holes). DERIVED/unverified: taller-than-1H top rows (peg height assumes slots
~18 mm below the case top). LINKS.wall = the UNIVERSAL wall-mount brackets
page (2026-07-12, Joey retired the per-length pages — the 1W/2W/3W sections
are shared hardware; planner LINK_OVERRIDES matches for all six lengths).
**Single-case bottom row → no footrails**: feet go into the case's own
underside slots (lengthwise, 4/1W, middle dedup) and the stack sits at 7.65.
**Handle styles are swappable** (identify card ◀ ▶ on any handle): all styles
mount back-face against the faceplate front (= fp z-center + 2.5 — 97.57/185,
87.57/165; derived from the faceplate instance, never hardcoded — a hardcoded
97.57 once left 165 handles floating 10 mm out), vertically centered on the
faceplate — registry in
main.js HANDLE_STYLES (Deco + BlockBar A–F + Crystal A/B Wide — Crystal GLBs
landed 2026-07-20, dims 11.78×19.07 from GLB Library/Handles/Crystal
parts_index.csv, copies in all six pools); swaps postMessage
{gen2:"handleStyle"} back to the planner opener tab, which updates
state.handleStyle live. Generator honors build.handleStyle (blockbar → A,
crystal → Crystal A; unknown ids fall back to Deco + a warning). All nine
handles have node-named 256p renders flat in viewer/img/parts/ (imgFor
`Handle_*` → `img/parts/<node>.png`) serving BOM rows + identify cards.
**Brick stagger (planner `brickTiling()` in data.js, mirrored in generate.js):**
FR-U over FR-L and CU over CL must have offset seams so the layers tie sections
together — odd runs: 1W on opposite ends (upper-left / lower-right); even ≥4:
upper all-2W, lower 1W-capped both ends; runs ≤2W: same tile both layers. Rules
generalized from 1H ground truth are marked DERIVED in generate.js (QL/clip y
by case height, drawer/faceplate/handle sizes, 1W-rail foot slots ±32.5) —
recalibrate against a training assembly when one exists. Hash-only URL changes
don't reload the page — force `location.reload()` when testing.

## Handle screws — M3-6 button head (2026-07-24)

`ButtonHeadScrew_M3-6` fastens a BOLT-ON handle to its faceplate — the one
REQUIRED bought item on an Essential build, and **Essential is now the ONLY
family that emits it** (Classic / EdgeLabel / Classic Pro all print their grip
in; generate.js gates on `face.hasHandle`, the planner on
`decorExtras[].boltOnOnly` + `faceDef.integratedHandle`). **2 per handle.**
Since the starter kits moved to Classic (2026-07-25) this is opt-in art rather
than something every beginner meets — but Essential stays user-selectable, so
the screws are still modeled, billed and animated.
Asset handoff + provenance: `2026-07-24-m3-screw-asset-handoff.md`.
Placement (faceplate-CENTRE-relative, DERIVED from one posed Essential 1W-1H —
no printed ground truth): x ±21.99/+22.02 (the handle's mount-hole pitch),
y −1.01, z +2.12 (the handoff's +0.49/−1.88 nudged 1.5 down + 4 forward onto
the holes by eye, Joey 2026-07-24 — which also RECESSES the head 0.79 mm inside
the plate's back face, so the optional back cover clears it by more than
before). `pos` is [x-centre, y-BOTTOM, z-centre] so the height offset
converts via `SCREW_M3.h/2`; the GLB carries its shank along depth like
WoodScrew, so NO rotation — verified in-viewer 2026-07-24: head slice 5.09 mm
at the back vs 2.96 mm shank at the front, protruding 3.21 mm behind the plate
(where the optional back cover hides it). BOM: `purchased` (out of the print
count, "×N · buy", colour-locked steel) + affiliate `BUY.handleScrews` /
planner `HARDWARE_BUY["M3×6mm button head screw"]`. Renders: full-detail 256²
PNG in both tools' `img/parts/` (the GLB is deliberately decimated; the PNG is
not). ⚠ In the faceplate cinematic the screws enter at **`at: [0, HOV, 40]`**
like every other dressing piece — the drawer is popped 40 forward while the
unit assembles, and a `0` there breaks the step's net-cancels-to-zero rule so
prev/jump strands them 40 mm back (caught by the net check, not by eye). One
`camera: camBack` swing serves the screws AND the back cover, and it's a 3/4
angle (t 143, p 76, fitR ×0.72) rather than the old near-straight-on t 168 —
head-on flattened the screws into discs and hid the threads (Joey).
**`spin: <turns>` on an enter item** (main.js, added for this): rotates the
part about its own depth axis as it travels, so a screw reads as THREADING in.
Parts are bottom-anchored and only X/Z-centred, so a plain `group.rotation.z`
would swing the screw around its base — the runner rotates the INNER CHILD
about the mesh's own centre with a compensating translation (p → R(p−c)+c),
lands on a whole number of turns so the resting pose is identity, and
applyState clears child rotation like it already cleared child position.
Positive θ reads clockwise from behind, which is where the driver is.
GLBs live in all six `viewer/parts/<L>/`; the STATIC kit manifests don't carry
them (hand-authored — generated builds only).

## "Can I build this today?" — required-hardware marker (2026-07-24)

Purchased BOM rows now split two ways: `purchased` (you buy it) and
`required` (you CANNOT finish without it). Required = handle screws +
wall/under-table wood screws. Magnets are purchased but NOT required — they're
an opt-in closure with "None" beside them, so a magnet build is still
print-and-build-today; counting them would make the signal mean "something
costs money" instead of "this stops you finishing" (Joey's call).
`add(node,label,type,links,n,purchased,required)` in generate.js carries it.
Surfacing it costs NO new layout (Joey's constraint):
- viewer checklist head: `🧩 N to print · 🔩 N to buy` — the buy half renders
  only when required hardware exists, so a print-only build looks CLEANER
  (renderChecklist reads `p.purchased && p.required`).
- viewer Build options: the Faceplate ◀▶ name suffixes the wrench on bolt-on
  families (`hasHandle`), so flipping styles shows which you can finish today.
- planner: the same wrench in the top corner of faceplate cards without
  `integratedHandle` and of the Wall / Under-Table mount cards.
**One icon, two repos:** a single-colour inline SVG wrench (`HW_ICON` in both
main.js and the planner's app.js) — two different glyphs for one idea read as
two ideas (Joey), so keep the path in sync. Drawing note: the head is a C-RING
(outer arc → step in → inner arc back), NOT a circle with a notch subtracted —
a notch has to overhang the circle to leave the jaw open, and that overhang is
a lone counter-clockwise region, still winding −1, so nonzero fill renders it
as a stray square floating off the head. Ring + shaft wound clockwise union
seamlessly; only the handle hole (fully inside the shaft) is counter-clockwise.

## Decor Faceplates — Classic, the FREE series (DONE — 2026-07-25)

**The starter kits are print-and-build-today.** All ten now ship **Classic**
instead of Essential, so their required hardware is **zero** and the wrench
counter is simply gone from the checklist head ("🧩 39 to print", was
"42 to print · 🔩 6 to buy"). Print counts dropped because the Deco handles
left the list too: **2W-2H 42 → 39, 3W-2H 68 → 63** (the gallery's TIERS
blurbs in `builds/index.html` carry those numbers — update them together).
**Why this is the right default, not just convenient:** magnets are opt-in
(a menu with "None" beside them), but a bolt-on handle has no "None" — without
the screws there's no handle, so an Essential kit CANNOT be finished from the
printer alone. That was the worst failure point for an onboarding kit.
**The upsell ladder is now legible in-tool:** Classic (free, no hardware) →
Essential (free, swap handle styles, costs 2 screws/drawer) → Classic Pro /
EdgeLabel (club, labels + accents). A tapped faceplate cycles all four.
Essential keeps its M3 screws — only the kit DEFAULT changed.

⚠ **Naming trap, the one thing that will bite you:** the GLB/render prefix is
**`ClassicDecor_`** (the exporter's name) but the family id is `classic` and the
label is **"Classic"** — and "Classic Pro" is a DIFFERENT family. Never
prefix-match loosely: `startsWith('Faceplate_Classic')` swallows Classic Pro.
generate.js `imgFor` uses an anchored regex; the planner's `partImage`
alternation lists `Classic Pro` BEFORE `Classic`. The planner's BOM template is
`GEN2 <label> Decor Faceplate - <size>`, so label "Classic" (not "Classic
Decor") is what avoids a "Decor Decor" stutter.

- **Geometry:** 18 sizes, depth **29.2**, canonical center-mode ⇒ plate z-center
  = mounting plane 92.57 + 29.2/2 = **107.17** (same rule as every family).
  **4 material zones — `BODY | FACE | GRIP | GRIP ACCENT`** (one more than
  Classic Pro; `FACE` is a 2 mm front layer). The identify card grows a 4th
  swatch with ZERO code — `renderZoneChips` discovers zones from the GLB
  material stubs. `Faceplate:FACE` has no PRESETS entry on purpose, so it
  follows the body colour until someone picks it (the "one identification
  colour by default" rule).
- ⚠ **The four 1H sizes carry the grip BOTTOM-flush; the other fourteen carry
  it TOP-flush.** This looks exactly like the upside-down-export bug that hit
  the accents and the 240 drawers — it is NOT one. The pipeline job note says
  *"that is correct per Fusion, do not 'fix' it"*, and the shipped Classic
  DRAWERS behave the same way (see the GLB Library section's note that lip
  height is not a valid orientation invariant). Verified in-scene: 1H grip low,
  2H grip high, both facing forward.
- **No dressing at all** (`extras: false`, `hasHandle: false`): no accent, no
  label, no handle, no screws — the only family needing zero bought hardware.
  It DOES seat the universal optional back cover (that placement is
  family-independent; the row just picks up `face.links`). The faceplate
  cinematic degenerates to 7 phases — pop, vanish, plate floats in, appear,
  slide down, home — with the back-cover swoop added when it's on.
- **The step note needed a real fix, not just a new entry:** it was a BINARY
  ternary (`extras ? dressing : M3-handle-text`), so a family with neither
  would have told users to thread screws into a plate that has no handle, after
  an empty "Assemble the faceplate first: ." sentence. Now three-way, and it
  drops the "assembled" wording when nothing was assembled. Essential /
  EdgeLabel / Classic Pro output is **byte-identical** — proved old-vs-new
  across 78 build shapes before the kits were flipped.
- **Wired:** generate.js `LINKS.fpcl` + `FACE_FAMILIES.classic` + `imgFor`;
  main.js `FACEPLATE_STYLES` (2nd, so the cycle reads Essential → Classic →
  EdgeLabel → Classic Pro); planner `faceplateStyles` (index 1 — NOT 0, that's
  the default and a test hard-codes "essential"), `LINK_OVERRIDES["GEN2 Decor -
  Faceplates - Classic Series"]` (serves the plate rows AND, via `linkAs`, the
  back-cover rows), `partImage`, and the hero card art
  `img/parts/Faceplate-Classic.jpg`. No `labelGen` — Classic has no label
  generator, and the ABSENCE of the key is what hides the pill (don't add one).
  Links: Printables /model/1280870-gen2-decor-faceplates-classic-series ·
  than.gs/m/1334047.
- **Assets** (exported 2026-07-25, 18/18 canonical): `GLB Library/Faceplates/
  ClassicDecor/`, copied into `viewer/parts/{115,165,185,240,270}/` (18 each)
  and `parts/59/` (4 — the mini catalog's 1W/2W × 05H/1H, same trim as every
  family), plus the kit folders. 18 renders `ClassicDecor_<size>.png` flat in
  BOTH tools' `img/parts/`. Source blend `Blender Files\Decor Faceplates\GEN2
  GLB Exporter - GEN2 Faceplates - Classic.blend`; job in `gen2_jobs.json`.

## Decor Faceplates — EdgeLabel (thumbnails + GLB DONE — 2026-07-08)

Source blend: `Blender Files\Decor Faceplates\GEN2 GLB Exporter - GEN2 Faceplates -
EdgeLabel B.blend`. **18 sizes, one collection per size** named `<W>W-<H>H`
(1W-05H … 4W-2H; no 3W-3H/4W-3H — matches the planner's illegal sizes). Every part
is scale 1,1,1 in real mm; widths 87/175/263/351 for 1–4W, depth 26.1.

**Parts per faceplate (physical prints):**
- **Body** (`BODY` mat) — the faceplate itself, a single **2-color print**. The orange
  "grip" strips (`GRIP` mat — RENAMED from HANDLE this session; NB the rename is NOT in
  the saved blend — disk still says `HANDLE` on 80 objects (verified headless
  2026-07-08), so export scripts must accept either name until re-saved. It's an
  integrated edge/grip detail, **NOT** a bolt-on handle) are part of the SAME printed piece.
  **Unlike Essential, EdgeLabel has NO separate handle part** (no handle GLB, no handle
  step). Objects: `EdgeLabel <size>.stl_1` (body) + `.001–.004/.005/.006` (grip strips).
- **Accent** (`ACCENT` mat) — a SEPARATE print (designed face-down on a textured bed for
  holo/texture). **Per-size**, and **absent on the four 05H sizes** (14 total). Shared
  per-size with the upcoming Classic Pro faceplate. Objects: `<size> Accent`.
- **Label** (`LABEL` mat) — the universal swappable EdgeLabel label (same part as the
  EdgeLabel generator). ONE mesh (`Label V1.2`) **linked-duplicated** (Alt+D) into all 18
  collections → one model, placed per faceplate, exports once.
- **Back Cover** (`BACK COVER` mat) — **OPTIONAL** part (fills the new Decor drawer's
  front gap; toggle OFF = backwards-compat with older closed-front drawers). `<size> Back Cover`.
  **UNIVERSAL across decor faceplate families** (Joey 2026-07-08): Essential, EdgeLabel
  and future plates all seat the SAME per-size cover — the `BackCover_EdgeLabel_*` GLB
  name is historical (from this exporter blend), not a compatibility statement.
  Likewise the **Accent is shared with Classic Pro** (same part, two faceplates).

**Viewer color model (DECIDED, not yet built):** faceplate = ONE library part = ONE
LEGO-style identification color by default. **On selection**, the identify card should
offer TWO swatches — Body + Grip — recoloring the two material zones independently. Needs
a `main.js` enhancement, AND the faceplate GLB must keep body+grip as two primitives.
**VERIFIED 2026-07-08 (two-slot test cube through the real toolchain):** the split dies
at the BLENDER export, not meshopt — `export_materials='NONE'` (the worker's law-#2
setting) merges both slots into ONE primitive. `'PLACEHOLDER'` keeps 2 primitives with
zero material data (zone identity = primitive order); `'EXPORT'` keeps 2 primitives +
tiny named `BODY`/`GRIP` material stubs (zone identity = material NAME — robust, and the
viewer replaces every material anyway). `gltf-transform meshopt` preserves primitives +
material names in both modes (it's pure compression, no join). → the EdgeLabel job needs
a per-job `export_materials` option added to `gen2_glb_export.py`; prefer `EXPORT` (law
#2 relaxes to "materials are zone tags the viewer ignores"). Accent
+ Back Cover are their own parts → independently colorable for free.

**Planner thumbnail render pipeline (DONE):** blend carries `TrueIsoCam` (ORTHO,
ortho_scale 154.6 base) + `GEN2 Lights`; Cycles, 256×256, `film_transparent`, Standard view.
Batch loop (bpy, one pass): per size collection → `hide_render` all others → aim the ortho
cam at the collection's world-bbox center (**translate only**, `cam.loc = orig + center`;
ortho recentres by translation) → `ortho_scale = max(cam-local x/y span)/0.82` → render to
`D:\Render Projects\Faceplates\EdgeLabel\EdgeLabel_<size>.png`. **Uniform ~82% fill;
geometry is NEVER scaled — framing is 100% ortho_scale** (so GLB real-scale is untouched).
All 18 rendered 2026-07-08. NB: the Blender MCP call may TIME OUT mid-batch while Blender
keeps rendering to completion — re-check the output folder before re-running.

**Render palette (RENDER ONLY — GLBs are material-free per pipeline law #2):** BODY
68/68/68 (GEN2 Case Black), GRIP 255/111/27 (185 orange), ACCENT 42/47/110 (holo blue,
metallic 0.45 / rough 0.30 — a flat stand-in; true holo/texture can't render flat), LABEL
255/255/255, BACK COVER = body black. Label white + cover black chosen since the cover hides
behind the plate.

**GLB export DONE 2026-07-08 — the pipeline CODE changed (the earlier "NOT new code"
assumption was wrong; a 2-zone part needs worker + verifier changes):**
- **Prep (blend, destructive, saved):** body+GRIP JOINED into one object per size (2
  material slots → 2 primitives); accents/back covers renamed to `Accent_EdgeLabel_{code}`
  / `BackCover_EdgeLabel_{code}`; ONE authoritative `Label_EdgeLabel` object (the 18 linked
  dupes share its mesh, so this prefix matches exactly one). GRIP rename now persisted to
  disk. Pre-merge backup: `...EdgeLabel B_premerge_backup.blend`.
- **`gen2_glb_export.py`:** new `export_materials` option (CONFIG + `--export-materials`,
  NONE|PLACEHOLDER|EXPORT) passed to `export_scene.gltf`. Default NONE = unchanged for
  every existing part.
- **`gen2_batch.py`:** forwards `--export-materials`; `world_bounds` now UNIONS ALL
  primitives (it read only `primitives[0]` before — would miss a 2nd zone);
  `verify_canonical(allow_materials=)` set per-job from `export_materials != NONE` → rejects
  only TEXTURED materials, so the tiny BODY/GRIP name stubs pass law #2. Both changes are
  no-ops for single-primitive material-free parts.
- **`gen2_jobs.json`:** 4 jobs — `EdgeLabel Faceplates (185)` (`export_materials: EXPORT`)
  → `GLB Library\Faceplates\EdgeLabel\`; Accents → `…\EdgeLabel\Accents\`; Back Covers →
  `…\EdgeLabel\BackCovers\`; Label → `…\EdgeLabel\Label\`. No handle job.
- **Output — verified 51/51 canonical, meshopt ~80%:** 18 faceplates (2 primitives,
  materials `BODY|GRIP` confirmed preserved THROUGH meshopt), 14 accents, 18 back covers,
  1 label. Produced via the connected Blender worker + `gltf-transform meshopt` (not a full
  headless `gen2_batch.py` run); re-running `python gen2_batch.py` regenerates them
  identically (compression is idempotent) and also writes the global `parts_index.csv` +
  `run_report.json`.
- **Viewer two-zone color model (DONE 2026-07-08, verified in-browser):** material
  ZONES in main.js. `loadTemplates` reads each primitive's material-stub NAME once and
  stamps it on the mesh (`userData.zone`; the name `BODY` = "the part's main color" →
  maps to the plain type key so BOM chip/header swatch/presets drive it; clones inherit
  the tag). Color keys are now type OR `"Type:ZONE"` (`"Faceplate:GRIP"`) everywhere —
  customColors/localStorage/Save/Upload/userPalette work unchanged. `activeHex` fallback
  chain: custom zone → manifest zone color → the BODY's active color (so a zone FOLLOWS
  the body until explicitly picked = one identification color by default; generated
  builds simply don't define zone colors). `materialFor(inst, hl, zone)` + per-zone
  shared/highlight materials (`baseMatFor`/`zoneKey`); every traverse site passes
  `o.userData.zone` (applyState/exploded/ghost/fade/fpFocus fades/highlight — a zoned
  part keeps two-tone through every animation). Identify card: `#identify-zones` row
  renders labeled Body/Grip chips (renderZoneChips; hidden for single-zone parts) that
  open the SAME filament menu on their own key; glow-drop while the menu is open covers
  both zones. **Test kit `?kit=edgelabel-test`** (viewer/kits/edgelabel-test): the real
  1W-1H set (plate + accent + back cover + label GLBs copied from the library) placed at
  offsets derived from the blend's world bounds — reproduces Joey's palette render;
  faceplate isolation + dims (26.1 deep) all compose with zones. Regression-checked:
  tabletop-185 has 0 zoned meshes, handle swap + cards unchanged.
- **Faceplate family swap (DONE 2026-07-08, verified in-browser):** identify-card ◀▶
  row (`cycleStyle` dispatches by selected type) + a Faceplate row in Build options.
  `FACEPLATE_STYLES` in main.js: essential / edgelabel — BOTH serve 185 AND 165
  (2026-07-08, Joey's live 165 repro caught the wrong 185-only guard): faceplates
  are SHARED hardware, same GLBs placed −dz on 165 (EdgeLabel plate 94.62, accent
  86.95, label 88.32, cover 82.8 — DERIVED like every 165 number; swap round-trips
  Essential@85.07); GLB copies in parts/165/ + the tabletop-165 kit folder. **Generated
  builds swap through the GENERATOR** (2026-07-08, Joey hit the bare-plate limit):
  applyFaceplateStyle sets `build.faceStyle` — the PLANNER'S OWN field (ids
  essential/edgelabel/classicpro, already in BUILD_FIELDS + share links, so a planner
  link with EdgeLabel picked just works) — regenerates, and re-selects the plate
  (ids are deterministic). generate.js `FACE_FAMILIES` emits natively: EdgeLabel =
  plate z 104.62 (mounting plane 92.57 + depth/2) + **Accent** (not on 05H; bottom
  fp+0.05, z-center plate−7.675, centered; **the accent GLBs exported UPSIDE DOWN**
  (blend pose) — the viewer counter-rotates `rot:[0,0,180]` (about Z, the depth
  axis: top↔bottom + left↔right, face still forward — an X flip showed the BACK,
  Joey) and places at the TOP (bottom + accentH, = fpH − 27.2 label band) so the
  flip is self-centered; same world volume verified. Fix at the SOURCE someday:
  flip in the blend + re-export, then drop the rot) + **universal Label** (LEFT-ANCHORED:
  center = plate LEFT edge + 28.5 on EVERY width — a center-based −15 was off by
  half a pitch on 2W, Joey measured the 44 mm; bottom fp+plateH−27, z-center
  plate−6.3) — offsets DERIVED from the EdgeLabel B blend @1W-1H — riding the
  drawer. **The faceplate install step is a CINEMATIC for BOTH families,
  ASSEMBLY-FIRST** (Joey 2026-07-08, first drawer only): pop +40 →
  `vanish`+`room:0`+camera to a plate-front preset (t12 p82, r=180+plateW·1.5,
  target = plate center at the popped seat + HOV 45) → the bare plate floats in
  at the HOVER (at [0,45,40]) → dressing attaches AT THE HOVER (Essential:
  handle presses on −15z; EdgeLabel: accent + label with their removal rituals
  REVERSED — at-offsets + canceling moves) → if backCover, camera swings to
  t168 BEHIND the plate and the cover attaches (fwd 20, down 4) →
  `appear`+`room:1`+camera back to `fpStepCam` (hoisted with H_MM ABOVE the
  drawer loop — declared after = TDZ crash on first try) → the ASSEMBLED unit
  slides DOWN −45y onto the popped drawer (sync move) → push home. Notes read
  assembly-first ("Assemble the faceplate first: …"). Verified both families:
  camera dip (minZ −166), handle hover peak = final+45 exactly, deterministic
  snap-jump; later drawers keep the fade-in. NO handle
  instance/BOM/step ("Faceplates" title, accent/label note); COLORS Accent deep-navy
  #25316e, Label near-white #eef0f4. currentOpts posts `faceStyle`; the incoming
  handler applies it (live planner style changes regenerate). STATIC KITS keep the
  in-place mutation swap (bare plate + `styleHidden` handle suppression honored by
  applyState/exploded/phases/computeBounds/checklist/bomRows + `pageVisibility()`
  reconcile at isolation exit; mounting plane preserved via `nodeDepth` template
  depths — 0 ↔ −9.55 on edgelabel-test; `row._origFp` restores BOM rows exactly).
  applyHandleStyle's faceplate-front also uses nodeDepth now (165 Deco round-trips to
  the exact 99.57). **Label niceties (Joey 2026-07-08):** selecting a LABEL slides it
  20 mm up out of its window — SEQUENCED: when the tap also triggers the drawer peek,
  the lift waits 420 ms so the drawer glides out FIRST (Joey); immediate when nothing
  moves (isolation tap / exploded page / static bench). Back down on deselect/switch —
  All three dressing parts share ONE
  "removal ritual" engine (`RITUALS`/`slideRitual`, Joey 2026-07-08): world-space
  waypoint paths on the group's INNER CHILD (composes with drawer peeks/step motion) —
  **Label** up 20; **Accent** down 4 → fwd 20 (the fwd-2 unhook was cut); **BackCover**
  up 4 → back 20 — exact reverse on deselect/switch, interrupted mid-ritual → one clean
  glide home. Waypoints map through the INVERSE group rotation (accents are
  group-rotated); cancellation is a PER-INSTANCE token (`inst._ritualTok` — a global
  one froze the outgoing part's reseat when switching accent→label, both must run
  concurrently); applyState/applyExploded zero the child as kill-tween self-heal;
  updatePointerLine maps the child offset through the group quaternion. Sequencing:
  ritual delays 420 ms only when the drawer is REALLY gliding (measured against the
  slide target — `drawerGliding`); selecting a **BackCover on an already-open drawer
  keeps the drawer where it is** (no yank to the 40 mm peek — cover work happens on an
  open drawer; other dressing taps still normalize to the peek). The label
  card shows an accent pill "🏷 Design your labels · N ready →"
  (`labelGenInfo`: LABEL_GEN_URLS by family — edgelabel/classicpro jerrari3d
  subdomains — + the planner's exact `#labels=<base64 JSON array>` handoff built from
  build.placed decor `label` texts, which ride the share link already). Wall-build EdgeLabel + back cover verified end-to-end on a
  constructed 4W-2H #build= link (Joey's repro); swap round-trip keeps the cover
  (family-agnostic), restores handles/accent/label correctly. GLBs: all EdgeLabel
  plates + accents + covers + label live in `viewer/parts/185/`; 185 kit folders
  carry used plate sizes. NB local dev module cache: generate.js edits need a
  HARD refresh — a stale generator silently ignores new build fields (Joey's
  "toggle does nothing" repro).
- **EdgeLabel per-size renders + links WIRED (2026-07-10):** the 18 planner
  thumbnails (`EdgeLabel_<size>.png`, 2026-07-08 batch) now serve BOTH tools —
  copied flat into planner `img/parts/` + viewer `img/parts/`. Planner:
  `partImage()` gained a faceplate pattern branch (faceplates are SHARED
  hardware — one render set for every length, so no length-keyed auto-pattern;
  EdgeLabel → per-size PNG, Essential/Classic Pro → their hero jpg until
  per-size batches exist; BOM size tokens drop dots: 0.5H → 05H). Viewer:
  `imgFor()` maps `Faceplate_EdgeLabel_<size>` → the PNG; `LINKS.fpe` = the
  EdgeLabel Series Printables/Thangs pages (mirrored from the planner) and
  FACE_FAMILIES carries per-family `links` (the club-family "no links" gap is
  closed); main.js FACEPLATE_STYLES carries matching img/links so a STATIC-kit
  swap dresses its BOM row exactly like a generated build (the old swap DELETED
  img/links); edgelabel-test's manifest row carries both explicitly. Verified
  in-browser: planner BOM per-size thumbs (Essential fallback too), generated
  185 EdgeLabel build rows, static-kit swap round-trip restores `_origFp`
  exactly. NO renders yet: Accent / BackCover / Label (identify cards hide the
  missing img) — a future mini render batch.
- **Still TODO (viewer side):** accent/label renders. Back-cover renders landed
  2026-07-13 (`BackCover_<size>.png` ×18, copied into BOTH tools' img/parts/;
  viewer imgFor + planner partImage map the universal covers to them — the
  node's `_EdgeLabel_` family name is historical). (Classic Pro is fully wired
  into both tools as of 2026-07-13 — see the Classic Pro section below.)

## Decor Faceplates — Classic Pro (thumbnails + GLB DONE — 2026-07-13)

Source blend: `Blender Files\Decor Faceplates\GEN2 GLB Exporter - GEN2 Faceplates -
Classic Pro.blend`. Same 18-size collection layout as EdgeLabel (`<W>W-<H>H`, no
3W-3H/4W-3H), all scale 1,1,1 real mm, widths 87/175/263/351, assembled depth 29.5
(the classic grip scoop is deep — 23 mm — unlike EdgeLabel's 26.1 flat plate).
Emulates the classic-drawers style as a Decor-compatible faceplate; **label is centered
horizontally** (vs EdgeLabel's edge label).

**Parts (per Joey 2026-07-13):**
- **Faceplate** — ONE printed piece = body + 2 grip pieces + the thin grip-accent rod
  (2.8×2.8 mm bar, 4 lengths by width: 48/136/224/312). **The rod is PART OF THE PRINT,
  NOT a separate part** → merged into one object per size = **3 material slots → 3
  primitives**: `BODY` / `GRIP` / `GRIP ACCENT` (material `Grip Accent` RENAMED →
  `GRIP ACCENT` this session, persisted). Objects now `Faceplate_ClassicPro_<size>`.
- **Accent + Back Cover — NOT in this blend and NOT re-exported:** Classic Pro seats
  EdgeLabel's per-size Accents (14, none on 05H) and the universal BackCovers verbatim.
  Manifests must point at the existing `Accent_EdgeLabel_*` / `BackCover_EdgeLabel_*` GLBs.
- **Label** (`CLASSIC PRO LABEL` mat) — unique to this family, universal across its 18
  sizes; ONE mesh linked-duplicated ×18, authoritative object `Label_ClassicPro` → exports
  once. **Exports TILTED** (as-installed on the sloped grip face — bbox 47×18×19, not flat
  like EdgeLabel's vertical 57×27×4.5 label). Correct per the translate-only pipeline law.

**Viewer color model:** extends the EdgeLabel decision — on selection the identify card
needs **THREE swatches** (Body / Grip / Grip Accent) for this family; zone identity by
material-stub name, same as EdgeLabel's two.

**Thumbnails (DONE):** 18 × `ClassicPro_<size>.png` in `D:\Render Projects\Faceplates\
ClassicPro\` — same pipeline (isolate collection → translate-only cam aim → ortho_scale
= span/0.82, geometry never scaled; Cycles 256×256 transparent). Palette as-found in the
blend (Joey approved): BODY 15/15/15, GRIP 255/41/3, GRIP ACCENT 94/94/94 metallic 1.0,
LABEL white. NB the join batch gotcha: hidden LAYER collections (`LayerCollection.hide_viewport`,
the outliner eye) silently block `select_set` → `bpy.ops.object.join` no-ops with only a
console warning — un-hide the layer collection first, not just object flags.

**GLB export (DONE — 19/19 canonical, meshopt ~79%):** 2 jobs added to `gen2_jobs.json`
(`ClassicPro Faceplates (185)` with `export_materials: EXPORT` → `GLB Library\Faceplates\
ClassicPro\`; `ClassicPro Label (universal)` → `…\ClassicPro\Label\`). 18 faceplates
each 3 primitives `BODY|GRIP|GRIP ACCENT` confirmed preserved through meshopt + 1 label.
Produced via the connected Blender worker + `gltf-transform meshopt` (same as EdgeLabel;
`python gen2_batch.py` regenerates identically). Per-folder `parts_index.csv` written.
NB when hand-verifying meshopt GLBs: POSITION accessors are `normalized` SHORTs — world
= node.translation + node.scale × (v/32767); reading accessor min/max raw looks like
±32767 garbage. Pre-merge backup: `...Classic Pro_premerge_backup.blend`.

**WIRED INTO BOTH TOOLS (2026-07-13):** generate.js `FACE_FAMILIES.classicpro` —
plate z 107.32 (mounting plane 92.57 + 29.5/2), extras (shared EdgeLabel accents,
none on 05H, + `Label_ClassicPro`), no handle. Extras families now carry their
label/accent placement as FUNCTIONS (labelX/labelY/labelZ/accentZ) so EdgeLabel's
expressions stay byte-identical (regression-proved across 5 mount/length builds).
The shared accent seats at mounting plane + 4.375 in BOTH families (raw-GLB face
profiles match: lower face at mounting + 5.3, accent front 1.4 mm proud —
raycast-verified frontmost). Classic Pro label: pos.y is a BOTTOM (exports are
bottom-anchored) — bottom = fp bottom + fpH − 18.16 → the 18.14-tall tilted label
sits TOP-FLUSH with the plate (0.02 mm), horizontally centered (dx −0.08 = the
label mesh's bbox skew), z-center = plate z − 0.71. Offsets DERIVED from the
blend's EVALUATED meshes — `bound_box` LIES here (the label's modifier trims
~0.9 mm off its top; headless `evaluated_get` + `to_mesh()` per vertex is the
pattern). Faceplates-step note says "lay the label onto the grip slope". **The label
animates ALONG ITS ANGLED SLOT (Joey 2026-07-13):** FACE_FAMILIES carries
`labelIn {rise, back}` — EdgeLabel {20, 0} keeps its exact vertical window
drop (byte-identical), Classic Pro {16, 16} enters up-and-behind then glides
45° down + back-to-front in the cinematic; main.js `NODE_RITUALS`
(checked before the type-keyed RITUALS in slideRitual) mirrors the same
diagonal for the tap ritual — Label_ClassicPro removes [0, 16, −16] up the
slope and reseats in reverse.
main.js FACEPLATE_STYLES gained the classicpro entry (per-size PNGs, series
links, all six collections; static-kit swap verified round-trip on
tabletop-185); **renderZoneChips needed ZERO changes** — the third swatch
(Body/Grip/"Grip accent") falls out of the generic zone discovery. imgFor +
planner partImage map `Faceplate_ClassicPro_<size>`/"GEN2 Classic Pro Decor
Faceplate - <size>" → `ClassicPro_<size>.png` (18 renders copied flat into BOTH
tools' img/parts/). GLB copies: all 18 plates + `Label_ClassicPro` in
parts/115..270/, the four 1W/2W × 05H/1H sizes + label in parts/59/, 1W-1H (+
2W-1H for -3w) in the four kit folders. Verified in-browser: 185 classicpro
#build= (accents/labels/covers place correctly, 3-zone identify card, family
swap round-trips both generated + static); planner partImage per-size renders.

## Label generators (EdgeLabel / Classic Pro) — external tools, 2026-07-24 fix

The two faceplate-label generators the viewer links to (`LABEL_GEN_URLS` in
main.js: edgelabel.jerrari3d.com / classic.jerrari3d.com — the "🏷 Design your
labels" pill on a selected label) are SEPARATE projects with their own GitHub
Pages repos. ⚠ **Their deployed source lives at
`C:\Users\Joey\Documents\Github\gen2-edgelabel-label-generator\` and
`…\gen2-classic-label-generator\`** (GitHub Desktop clones, carry the CNAMEs +
remotes) — NOT under `D:\Code Projects\`. A stale D: copy existed and got
edited by mistake once; Joey deleted the D: copies 2026-07-24. Each is a single
`index.html` + a `vendor/` folder + README.
**Fixes (both generators, from a Printables report — user mbravo):**
- **Blank page in Firefox, fine in Chrome.** The apps pulled three.js /
  opentype.js / JSZip / SVGLoader from jsdelivr, and `init()` ran
  `setupThree()` BEFORE `setupUI()` — so one unreachable script threw on the
  first line, the label inputs were never built, and the status stuck on
  "Loading…". The user's Firefox was blocking the CDN (DoH / tracking
  protection / an extension). Reproduced EXACTLY in Chrome by pointing the CDN
  at an unroutable host.
  - Fix 1 — **libraries vendored** in `vendor/` (three 0.146.0, opentype.js
    1.3.4, JSZip 3.10.1, SVGLoader). Same rationale as the viewer's vendored
    three.js: no third party in the load path, can't be blocked without
    blocking the page. `.gitattributes` marks `vendor/**` `-text -diff` so
    autocrlf doesn't rewrite the minified files.
  - Fix 2 — **fail-safe init**: `setupUI()` runs FIRST, then each lib is
    checked and any missing one named, then `setupThree()` is guarded. Worst
    case is now a usable form + a real error message; Download stays disabled
    (nothing exports without three.js).
- **"Plate W × L says mm but shows cm"** — NOT a unit bug. The number inputs
  were `width:46px`, too narrow for 3 digits + the spinner, so 250 rendered
  clipped as "25". Widened to 68px (clears the 1000 max). Hit every preset
  ≥100 mm (Bambu 256, Prusa XL 360, …), not just the default.
- Verified on the LIVE sites after deploy: zero third-party requests, plate
  reads 250 × 220, exports a valid 3MF. Both repos pushed 2026-07-24.
- ⚠ The Classic Pro repo has MIXED line endings (127 CRLF / 2203 LF). Edit it
  IN PLACE preserving each line's own terminator — a whole-file rewrite shows
  as thousands of phantom changed lines. The generators are NOT part of this
  repo's tests; verify them by loading each with the network/vendor blocked.

## Deferred (designed, not built)

Ghost previews of upcoming parts, fx timelines (quicklock dip-and-pop, disassembly
epilogue), case extender GLBs.
PoC v2 JSX (chat artifact) had the fx design; notes §6 describes it.
All four decor faceplate families are BUILT now (Essential / Classic / EdgeLabel
/ Classic Pro) — the last one landed 2026-07-25, hero card art included. The
only faceplate art still missing is Accent + Label renders for the two club
families (their identify cards hide the gap).
