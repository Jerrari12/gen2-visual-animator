# GEN2 Part Orientation Notes

Evergreen reference for the interactive viewer / manifest work: how each part is
modeled and how it must be oriented at placement time.

**Pipeline reminder:** every GLB exports at its canonical origin (width + depth
centered on 0, Y = 0 at the bottom, no rotation) with its modeled orientation
preserved — the export only translates, never rotates. Any per-placement rotation
is applied by the **viewer at runtime** (in the manifest), never baked into the GLB.

---

## Tabletop Kit Foot — `Tabletop-Kit-Foot`

**Source:** `Blender Files\Hardware\GEN2 GLB Exporter - GEN2 Tabletop Kit Foot.blend`
**Size:** ~20.6 × 20.6 mm footprint, ~10.6 mm tall. Square footprint → rotates cleanly in 90° steps.

**Geometry / function**
- There is a **dovetail rail on TOP** of the foot (male). It slides into a slot on the **footrail underside** or **under an individual case**.
- The **pointy (chamfered lead-in) end slides in FIRST.**

**Modeled / exported orientation (canonical)**
- Dovetail rail runs along the **width (X) axis**.
- **Pointy end faces +X.** (Confirmed by top-down render: rail stops ~3.9 mm short of the +X edge, tapering to the point there.)
- Bottom at Y = 0; rail is the highest geometry.

**Placement rule — IMPORTANT**
- The foot must be **rotated in 90° / 180° increments about the vertical axis** (Y-up in the GLB) so its pointy end points the correct way for the slot it enters.
- Which rotation is needed **depends on the orientation of the slot** on the footrail and under each case — it is not fixed.
- Assembly context (from joint grammar): feet are installed at the bench *before* the rails are placed; outer feet slide toward the rail ends, and the 2W middle pair slides left→right.

**Manifest implication**
- Foot placements carry a **yaw value (0 / 90 / 180 / 270°)** per slot. The GLB itself stays canonical; only the placement transform rotates.

---

## Drawer Stoppers — `Drawer_Stoppers_L` / `Drawer_Stoppers_R`

**Source:** `Blender Files\Hardware\GEN2 GLB Exporter - GEN2 Drawer Stoppers.blend`
**Size:** ~19.6 × 28 mm, 4.5 mm tall. Handed pair (L/R marked on the part).

**Geometry / function — they serve the drawer BELOW them**
- Snap **straight down** into slots on the **top side of case bottoms** and on **CL-1W / CL-2W** covers.
- Their tabs stick **below** the bottom of the unit they're installed in — down into the drawer bay of the unit **underneath**. When that lower drawer is pulled forward, its top inside back collides with the tabs, preventing it from falling out of its case.
- Top-row drawers have no case above them — that's why **CL covers carry the same slots**: stoppers in the CL protect the top row's drawers identically.
- **Optional** — omit for full drawer removal.

**Slot layout**
- Slots repeat **per 1W of width**: each 1W span has one **L slot (left)** and one **R slot (right)** — a 2W case has 2× L + 2× R.
- L model in the L slot, R model in the R slot.

**Placement rule / sequencing**
- Installed from above, inside the **upper** unit — so that upper unit's own drawer must be out (or not yet inserted). Natural kit sequence: after a case/CL is placed, before its own drawer goes in, as an optional sub-step benefiting the row below.

**Manifest implication**
- Optional per-drawer flag → emits 1 L + 1 R per 1W into the unit **above** that drawer (case bottom, or CL for the top row), drop-in-from-above motion.
- Note for step text: the stoppers protect the drawer *below* where the builder is placing them — worth saying explicitly, it's not intuitive.

---

## Magnet Clip — `MagnetClip_10x2mm`  (object: `Magnet Insert - 10x2mm`)

**Source:** `Blender Files\Hardware\GEN2 GLB Exporter - GEN2 Magnet Clip.blend`
**Size:** ~19.8 × 20 mm face, ~2.4 mm thick (thin plate). Holds a 10 × 2 mm disc magnet.

**Geometry / function**
- Clips into the **back** of a GEN2 **case** OR a GEN2 **drawer** and traps the magnet in its slot.
- When both a case and its drawer have one installed, the drawer is **magnetically pulled shut**.

**Modeled / exported orientation (canonical)**
- Modeled **facing BACK** — the correct orientation for snapping into a **CASE**.
- In the source the part is posed with a −90° X rotation + offset; the pipeline **bakes that world orientation into the GLB**, so the export is canonical (centered, Y = 0 bottom) *and* back-facing. The thin (~2.4 mm) axis is depth.

**Placement rule — IMPORTANT**
- **CASE:** use the GLB as-is (back-facing) → **yaw 0**.
- **DRAWER:** rotate **180° about the vertical axis** so it faces **FORWARD** → **yaw 180**.
- Both a case-clip and a drawer-clip must be present for the magnet latch to work.

**Manifest implication**
- One GLB serves both roles; only the placement yaw differs (0 for case, 180 for drawer).

---

## Wall Mount Lite brackets — `WallMount_Lite_1W` / `_2W` / `_3W`

**Source:** `Blender Files\Hardware\GEN2 GLB Exporter - GEN2 Wall Mount Brackets.blend`. Objects: `Wall Mount Lite - {1,2,3}W v2602`.
**Size (canonical):** 88 / 176 / 264 mm wide × **56 mm tall** × **6.9 mm thick** (all three).

**3W tilt — FIXED in source**
- Originally the 3W bracket was spun ~37.63° about world Y in the source (bbox read 239.6 × 6.9 × 201.9). **Joey corrected the source**, so it now reads a flat **264 × 6.9 × 56 at identity rotation** and exports cleanly via the standard job — no correction needed.
- (Historical: if a future wide bracket ever comes in tilted, the fix was +37.63° about world Y applied before the canonical bake.)

**Wood screws (wall attachment)**
- `WoodScrew` — decimated to ~1.5k tris (from ~62k) for illustration/animation.
- **2 screws per 1W column**, at **±24 mm from the column center** (48 mm apart), at the peg / keyhole positions → 4 for 2W, 6 for 3W.
- Screw long axis and the bracket's into-wall (thin 6.9 mm) axis both map to **glTF Z (depth)** — so the screw's insertion direction already aligns with the wall normal; the viewer just translates it in along Z to "drive" it into the wall.

**Case → bracket attachment — CALIBRATED (Joey's reference, 2026-07-05)**
Source: `Blender Files\Training Examples\GEN2 GLB Exporter - GEN2 Wall Mount case
to bracket.blend` — three 185-1W-1H cases posed as the three hang stages
(extracted via Blender MCP; all values below in **viewer/glTF axes**:
X=width, Y=up, Z=depth, Z− = toward the wall). The bracket + its 2 screws are
placed first (screwed to the wall); the case then hangs on the screw-head pegs.
- **Rest (locked) pose:** case back plane sits at the wall; the bracket is 1H
  (56 mm) tall with its **base flush with the case base**, back on the wall, and
  **nests ~6.5 mm into the case's back opening** (so the pegs pass through the
  back-wall opening). Bracket occupies the lower 56 mm of the 59 mm case.
- **Pegs (screw heads):** 2 per 1W column at **X = ±24 mm** from column center,
  at **Y ≈ 37.9 mm above the case base** (= flatTop − 18.1; the reference read
  40.9 but the screws sit 3 mm lower to line up with the bracket holes),
  axis along Z into the wall.
- **Hang motion (top row onto pegs), two phases — the LOCKED joint animation:**
  1. **Approach:** case starts **+20 mm in Z** (out from the wall), aligned with
     the pegs, and slides **−20 mm Z** to the wall — pegs enter the back opening.
  2. **Drop:** case drops **−16 mm in Y**; pegs ride up into the narrow keyhole
     groove and lock it to the wall. (16 mm is the functional trap depth; the
     20 mm approach is display clearance — any comfortable approach reads fine.)
- **Rows below the top:** hang off the case above, NOT off more brackets — one
  bracket course at the very top spans the full width (tiled 1W/2W/3W, no 4W).
  Lower cases use the front→back-then-quicklock hang (same as under-table); the
  56 mm vertical row pitch carries over from the tabletop stack.

**Sequencing — IMPORTANT (from Joey, July 4)**
- **Optional**, used in every assembly type, and only ever paired with drawers (case-back clip + drawer-back clip pull the drawer shut).
- Must be installed into the case and the drawer **before** either slides into the assembly — once assembled they are covered up and inaccessible. When the magnet option is on, the generator must inject clip bench-steps ahead of that case's and drawer's placement steps.
- The 10 × 2 mm disc magnet itself is purchased hardware (no GLB) — BOM line item, like M3 screws.

---

## Faceplates (Essential series) — `Faceplate_Essential_<W>W-<H>H`

**Source:** `Blender Files\Decor Faceplates\GEN2 GLB Exporter - GEN2 Faceplates - Essential....blend`
**Library:** `GLB Library\Faceplates\Essential\` — 18 variants, exactly matching the case/drawer size range (1W–4W × 05H/1H/15H/2H, plus 1W-3H and 2W-3H).

**Geometry / function**
- Separate part that pairs with **Decor Drawers**. Joint grammar: nudge the drawer forward → faceplate slides **down** onto the drawer front → compliant snap, sits flush.
- Kits that use faceplates must show them as their own step.

**Manifest implication**
- Optional per-drawer: faceplate step follows the drawer-insertion step (nudge-forward + slide-down fx timeline).

---

## Handle (Deco style) — `Handle_Deco`

**Source:** `Blender Files\Decor Faceplates\GEN2 GLB Exporter - GEN2 Handles - Deco.blend`
**Library:** `GLB Library\Handles\Deco\Handle_Deco.lib.glb`

**Geometry / function**
- Attaches to the **front of a faceplate** via **two M3 screws** through the faceplate's holes.
- M3 screws = purchased hardware (BOM line, no GLB).

**Manifest implication**
- Bench sub-step: handle onto faceplate (screwed) **before** the faceplate goes onto the drawer.

---

## Tabletop Kit Foot — quantity rule (supplements orientation section above)

- **FR-L 1W has 4 foot slots; FR-L 2W has 6.**
- When two FR-L rails sit side by side, the slots at the shared junction put feet right next to each other — overkill. Real-world practice: install feet in only **one** rail's junction slots.
- Generator default: populate all slots of a standalone rail; at rail-to-rail junctions, populate one side only (pick a deterministic rule, e.g. always the left rail) and drop the duplicates from the BOM.

---

## Legal size range (generator constraint)

- **3W-3H and 4W-3H do not exist** (case, drawer, or faceplate) — deliberately excluded from the product line: too large a print for comfort, and new users tend to be over-ambitious. The planner/generator must treat these as illegal, not just missing.

---

## M3 hex-nut slots in case bottoms

- Case bottoms include **M3 hex-nut slots** (visible in the stopper illustration: nuts drop straight down into pockets in the floor's center spine).
- **Uses:**
  1. **Legacy attachment:** an M3 screw into the captive nut is how older GEN2 models attached before Quicklocks existed.
  2. **Tabletop frame hard-lock:** run an M3 screw **up through the bottom of the FR-L, through the hole in the FR-U, into the hex nut** installed in the aligned slot of a bottom-row case — hard-locking the frame to the bottom row.
- M3 nuts and screws are purchased hardware (no GLB) — BOM lines when the option is used.
- **Manifest implication:** optional advanced callout (per the locked decision: hard-lock is a callout, not a numbered step). If shown, nut drop-in must precede that case's placement onto the frame; the screw goes in from underneath after.

## Ground-truth placement datums (calibrated July 4)

Source: `Blender Files\Training Examples\GEN2 TableTop Kit Assembly Example.glb`
(Joey's accurate reference assembly — 42 parts, full optional loadout). All
values in mm, +Y up, y=0 at tabletop, x/z centered on the footrail plate.
Extraction was double-checked by two independent methods with zero disagreement.

| Rule | Value |
|---|---|
| Foot exposed height | 7.65 (10.62 tall − 2.97 insertion) |
| FR-U bottom | FR-L bottom + 5.10 |
| Row-0 case bottom | FR-L bottom + 10.00 |
| Row pitch | **56.00 exact** |
| CL bottom | top-row case bottom + 56.00 |
| CU bottom | CL bottom + 4.30 — CU installs by sliding **back→front onto the CL's dovetails** (per Joey, July 4), not by dropping straight down |
| QuickLock | bottom = case bottom + 35.68; z-center 65.02; handed x: outer L −40.12 / outer R +40.55, inner ±0.43-ish from column edge (see manifest) |
| Drawer | bottom = case bottom + 5.72; z-center +5.24 (front protrudes 2.39 past case face into the faceplate pocket) |
| Faceplate | bottom = case bottom + 3.72; z-center 95.07 (against case front) |
| Deco handle | bottom = faceplate bottom + 22.49; z-center 109.57 |
| Drawer stopper | bottom = covering unit's bottom − 2.00 (tabs hang 2 mm into the bay below); z-center 76.5 |
| Feet (2W rail) | x = −76.48 / −0.18 / +76.65; z = −73.00 (back row) / +81.15 (front row); left pair yaw 180 |

**Magnet clips + magnets (ESTIMATED from Joey's July 4 renders — not ground-truth calibrated; the training example didn't include them):**

| Rule | Estimated value |
|---|---|
| Case clip (yaw 0) | x = case column center (one slot per 1W; on 2W use left, 3W center, 4W left-center); bottom = case bottom + 35.8; z-center = −85.7 for 185 depth (Joey-tuned in two passes, July 4 — treat as final for 185) |
| Case magnet | bottom = case bottom + 40 (disc center at clip's pocket); z = −86 (Joey-tuned) |
| Drawer clip (yaw 180) | x = drawer center; bottom ≈ drawer bottom + 30 (top flush with drawer back wall); z-center ≈ −83 (closed) |
| Drawer magnet | clip bottom + 5; z ≈ −84 (faces the case magnet; ~2 mm air gap closed) |
| Magnet part | `Magnet_10x2mm.lib.glb` — generated cylinder (r5 × 2 thick, axis on Z), purchased hardware, `purchased: true` in manifests so it's excluded from print counts |
| Sequencing | clip + magnet into the case at the bench before the case slides on; clip + magnet into the drawer before the drawer is inserted (both unreachable afterward) |

*To calibrate exactly: add clips+magnets to a training-example assembly and re-run the extraction, or hand-tweak the kit manifest.*

## Single-case bottom row — feet go in the CASE (July 4, from Joey)

- Footrails exist to **link cases together horizontally** on the bottom row.
  When the bottom row is a single case, skip the rails entirely — the case
  itself has foot slots on its underside: **4 per 1W**.
- Unlike rail slots, case slots run **lengthwise** (parallel to depth):
  front feet snap in **back→front** (yaw 270 in the viewer), rear feet
  **front→back** (yaw 90).
- Where adjacent 1W slots crowd together mid-case (2W+), fill just **one per
  row** — same dedup rule as rail junctions.
- Without the rail sandwich the whole stack sits 10 mm lower: bottom case
  bottom = foot exposed height = **7.65** (est. — same insertion as rails).
- Slot x positions (11.5 / 76.5 mm from each 1W's left edge) and z rows
  (−73 / +81.15) are **ESTIMATED** by symmetry with the rail slots — calibrate
  against a training assembly when one exists.

## Handle mounting rule (any style)

From the Deco ground truth: a handle's **back face sits against the faceplate
front face (z = 97.57)** and it is **vertically centered on the plate**
(bottom = fpBottom + (fpH − handleH)/2 − 0.5). This holds for every style, so
handles are swappable from their dims alone. BlockBar A–F dims are in
`GLB Library\Handles\BlockBar\parts_index.csv`. Crystal not yet modeled.

## Open questions

*(none — all placement rules for parts currently in the library are resolved and calibrated as of July 4)*
