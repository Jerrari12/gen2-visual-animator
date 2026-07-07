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
    names 185→165 + each shared-hardware Z shifted ±dz; keeps the GEN2 palette).
    Select via
    `?kit=<name>`. BOM panel: expanded on the checklist step and final step,
    minimized to a "Parts · N" tab elsewhere (user-toggleable). The panel has
**Copy list / Download CSV** export buttons (main.js copyBom/downloadCsv, mirrors
the planner's BOM actions) and is shown on the outro so the finale lists every
part with its color chip + download links.
  - `vendor/three/` — vendored three.js (0.185.1) + addons; import-mapped in
    index.html. No CDN (works offline, no version drift).
  - Debug hook: append `?debug=1` → `window.__GEN2_VIEWER__` (guarded, planner-style).
- `GLB Pipeline/` — Blender→GLB batch exporter (`python gen2_batch.py`), see its README.
- `GLB Library/` — canonical compressed parts + `parts_index.csv` per collection.
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
and per-phase `camera` (retarget mid-step, e.g. zoom to the pegs then back), and
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
clip, magnet): in assembled scenes, selecting a RIDER (faceplate/handle/clip/
magnet) of a seated drawer slides the whole set open 40 mm (a peek — enough to
expose the body for tapping); selecting the drawer BODY pulls it ~90% of the
safe travel (`(collection − 20) · 0.9` — deep enough to read the body colour/
interior). A faceplate→body reselect re-pulls the SAME drawer further (prevOpen
counts as seated); switching drawers shuts the old one; empty tap slides shut.
Steps show a LEGO-style number badge; `#note-collapse` (chevron in the note
panel) folds the step text down to that badge — session-sticky across steps —
so the model stays visible while recoloring on small screens. Mobile (≤560px):
`#step-dots` gets its own full-width row above the buttons (`order:-1` +
`flex-basis:100%` — squeezed between Back and the tools they used to wrap into
a tall column when 🎥 Resume cam appeared), and the button paddings are sized
so Back + 4 tools + Next fit one row on a 360px phone.
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
`activeHandleStyle`), wall-only Top cover Per-column/Staggered (`wallStagger`),
and Reset to original (snapshotted `originalBuild`). Selecting a **magnet
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
palette; "Get filament" link appears on customized parts. **Filament presets**
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
**Page model:** pages = [cover, ...steps, outro]. The cover (synthetic page 0) shows
the finished build front-on with a telephoto fake-isometric camera (fov 9,
distance from bounds; framed left for the brand overlay + "Get started"). The
overlay has a soft light halo (`.cover-right::before` + text-shadows + button
glow) so the title/button stay legible over any build color.
"Get started" pans to the intro/exploded page while the fov tweens back to 40
and the parts drift apart (playExploded). The checklist page is the unnumbered
"Intro"; assembly steps count from Step 1. Logo asset: viewer/img/gen2-logo.png
(copy of GLB Library/GEN2-QL Logo Main.png). Generated builds get a
deterministic fun name (generate.js ADJ/NOUN pools) as intro title + header.
Magnet clip/magnet positions are ESTIMATED from renders (see orientation
notes) — everything else is ground-truth calibrated.

## Run / preview

`.claude/launch.json` → "viewer" (python http.server :8123 serving `viewer/`).
Or: `cd viewer; python -m http.server 8123`. Not a git repo (yet).

## Planner → generated instructions (BUILT)

`viewer/js/generate.js` compiles planner state → manifest at runtime. Input:
`viewer/#build=<base64>` — the **same encoding as the planner's share links**
(`encodeBuildHash()` in planner app.js; also accepts the file-export wrapper).
Planner's "🧊 3D assembly instructions" button (bom-actions row) opens
`INSTRUCTIONS_VIEWER_URL + "#build=" + encodeBuildHash()` — update that constant
in planner app.js when the viewer deploys. Generated builds load parts from a
per-collection pool `viewer/parts/<L>/` (`165`/`185` — each self-contained: the
collection GLBs + copies of the shared hardware/faceplate GLBs; lazy per node;
`PARTS_BASE` in main.js = `parts/${manifest.collection}/`).
v1 scope: **tabletop + wall + under-table; 165 + 185**; classic drawers = BOM row
only (no GLB); shelf >1H / cabinet / other lengths → graceful error overlay. Also
rejected: non-flat tops (mirrors the planner's columnTops() flat-top rule —
the planner button greys out with the reason via updateInstructionsButton())
and builds over 80 units (a step per case stops being instructions).
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

## Deferred (designed, not built)

Ghost previews of upcoming parts, fx timelines (quicklock dip-and-pop, disassembly
epilogue), classic drawer + case extender GLBs, non-Essential faceplate styles.
PoC v2 JSX (chat artifact) had the fx design; notes §6 describes it.
