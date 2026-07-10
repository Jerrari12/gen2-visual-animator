# GEN2 Visual Animator — project memory

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
  Still no GLBs: Classic Drawers (all lengths) + Case Extenders — **Joey is
  adding these next** (render meshes live in `D:\Render Projects\<length>
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
optional `at` = temporary landing offset, e.g. onto a popped-out drawer),
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
`links` {p, t} = Printables/Thangs URLs **mirrored from the planner's verified
LINK_OVERRIDES** (`gen2-planner-main/js/data.js` is the source of truth — update
both together). `purchased: true` marks hardware-store items (magnets, screws
would-be) — excluded from the print count, shown "×N · buy", and **color-locked**
(main.js `colorLocked`: a type whose rows are all purchased gets no filament
picker — BOM chip + identify swatch inert, presets/saved tints ignored by
activeHex — it always renders its manifest color). Per-part `img`
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
the faceplate style cards, per-size `P.backCover` BOM rows marked `unreleased`
"coming soon"; all 65 planner tests pass) — so planner⇄viewer faceplate style
AND back cover live-sync both ways. Selecting a **magnet
clip/magnet** or a **stopper** shows a ✕ Remove in the identify card (generator
stamps `owner`=drawerId / `stopperKey`); magnet → that drawer's closure none,
stopper → drop its 1W L+R pair. **Bidirectional planner sync**: the planner
opens the viewer WITHOUT noopener and both post `{gen2:'buildOptions', opts}`
(closures/removedStoppers/wallStagger/handleStyle) on change; echo-guarded
(applyingRemote + ignore-if-unchanged). Planner mirrors the model
(`state.removedStoppers` in BUILD_FIELDS, sanitized, in share links; stopper BOM
subtracts removed pairs). Local dev needs a hard-refresh after JS edits (module
cache; deploys are SHA-stamped so prod is immune).
The checklist step shows an engine-computed **exploded parts preview** (radial
spread from assembly center + per-type pushes; riders explode with their
drawer) — no manifest data, works for generated builds too.
**Filament colors:** FILAMENT_DB in main.js = a multi-BRAND database — one
entry per brand `{brand, line, url, colors[]}`, rendered as collapsible
sections (session-remembered expansion, count badge) under a live search box
(filters across brand+line+label; matches force-open; empty state). Adding
Prusa / Polar / Printed Solids later = appending one DB entry. Today: Elegoo
PETG (★ "Elegoo PETG Black", amzn.to affiliate, Joey's budget pick for
cases/drawer bodies) + Polymaker Panchroma™ PLA (all 28 real 1kg variants,
Shopify variant ids scraped 2026-07-05, hexes approximated) — swap for
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
**Filament presets**
(main.js PRESETS, shown in the BOM panel): one click sets a filament per type —
"The Jerrari" (black shell, prusa-orange faceplates, silver handles, orange-PETG
hardware) + Stealth / Signal / Sandstone. Colors are PLACEHOLDERS (swap for real
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

## Run / preview

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
main IS a deploy (Pages action serves viewer/).

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
Scope (2026-07-10, ALL SIX lengths): **tabletop + wall for every collection;
under-table only 165 + 185** (no rail GLBs for the rest — generate.js errors,
and the planner's updateInstructionsButton greys under-table out for other
lengths with the reason); **59 is hanging-only** (`COLL[59].noTabletop` +
maxW/maxHH guards — no foot rails, no feet slots; mirrors the planner's
mountBlocksLength). classic drawers = BOM row only (no GLB); shelf >1H /
cabinet → graceful error overlay. Also
rejected: non-flat tops (mirrors the planner's columnTops() flat-top rule —
the planner button greys out with the reason via updateInstructionsButton())
and builds over 80 units (a step per case stops being instructions).
The four new lengths generate with a runtime warning ("scaled from the 185
calibration") — every hardware Z is DERIVED via ±dz (sign generic: 240/270
shift outward), ZERO ground-truth assemblies; verify on printed builds like the
165. Deep collections get depth-scaled staging (`slideBack`/`wallFwd`/
`CAM_DEPTH` locals in generate.js); 165/185 output stays byte-identical
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
→ −8/185, −7/165); its screw rows keep the same inset from each rail face.
**DERIVED, no 165 ground-truth assembly** (185 was calibrated against the TableTop
Assembly Example): QuickLock / stopper / feet / UT-screw Z — verify by eye on a
printed 165 build, like the non-1H drawers. 165 has no BOM renders yet (imgFor
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
build's relaxed `controls.maxPolarAngle` = 0.85π). CALIBRATED 2026-07-05 (WALL constants; bracket
Z −89.45, peg Y = flatTop − 15.1) against the case-to-bracket reference — see
GEN2-Part-Orientation-Notes.md. Wall builds swap the table+grid for a
`wall` backdrop plane (main.js `isWallBuild`, toggled on manifest load; the
outro cinema hides it for a clean stage and restores on page-back). `fitWall()`
sizes it to the assembled build + 90 mm margin, just behind the case backs (a
"mounting surface", not an infinite wall); the render loop hides it whenever the
camera orbits behind it (`camera.z < wall.z`) so pegs/case-backs stay inspectable. Screws sit
at flatTop − 18.1 (3 mm below the measured peg, to line up with the bracket
holes). DERIVED/unverified: taller-than-1H top rows (peg height assumes slots
~18 mm below the case top); LINKS.wall points at the -59 Printables page as a
placeholder (needs the 185 wall-kit URL).
**Single-case bottom row → no footrails**: feet go into the case's own
underside slots (lengthwise, 4/1W, middle dedup) and the stack sits at 7.65.
**Handle styles are swappable** (identify card ◀ ▶ on any handle): all styles
mount back-face against the faceplate front (= fp z-center + 2.5 — 97.57/185,
87.57/165; derived from the faceplate instance, never hardcoded — a hardcoded
97.57 once left 165 handles floating 10 mm out), vertically centered on the
faceplate — registry in
main.js HANDLE_STYLES (Deco + BlockBar A–F); swaps postMessage
{gen2:"handleStyle"} back to the planner opener tab, which updates
state.handleStyle live. Generator honors build.handleStyle (blockbar → A).
**Brick stagger (planner `brickTiling()` in data.js, mirrored in generate.js):**
FR-U over FR-L and CU over CL must have offset seams so the layers tie sections
together — odd runs: 1W on opposite ends (upper-left / lower-right); even ≥4:
upper all-2W, lower 1W-capped both ends; runs ≤2W: same tile both layers. Rules
generalized from 1H ground truth are marked DERIVED in generate.js (QL/clip y
by case height, drawer/faceplate/handle sizes, 1W-rail foot slots ±32.5) —
recalibrate against a training assembly when one exists. Hash-only URL changes
don't reload the page — force `location.reload()` when testing.

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
- **Still TODO (viewer side):** Classic Pro family when its GLBs exist (shares
  EdgeLabel's per-size accents; partImage + FACEPLATE_STYLES/FACE_FAMILIES
  entries are pre-wired for its hero jpg); accent/back-cover/label renders.

**Next family:** Classic Pro faceplate — its own unique label, **shares EdgeLabel's per-size accents**.

## Deferred (designed, not built)

Ghost previews of upcoming parts, fx timelines (quicklock dip-and-pop, disassembly
epilogue), classic drawer + case extender GLBs, non-Essential faceplate styles.
PoC v2 JSX (chat artifact) had the fx design; notes §6 describes it.
