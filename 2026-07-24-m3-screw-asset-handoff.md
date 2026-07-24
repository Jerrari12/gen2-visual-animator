# GEN2 M3-6 Button Head Screw — Asset + Placement Handoff
*2026-07-24 · assets built, planner wiring NOT done (this is the wiring brief)*

New hardware part: an **M3 x 6mm button-head hex screw** that fastens a bolt-on handle
to faceplates that use a separate handle (e.g. the **Essential** series, which has no
integrated grip). Faceplates with integrated grips (EdgeLabel, Classic Pro) do NOT use it.
**2 screws per handle.** Installed from behind the faceplate, **before** the faceplate
back cover (the heads end up behind the plate, hidden by the back cover).

---

## What was created (DONE)

**GLB** — `ButtonHeadScrew_M3-6`
- `D:\Code Projects\GEN2 Visual Animator\GLB Library\Handles\Hardware\ButtonHeadScrew_M3-6.lib.glb`
- 30 KB, **1,354 tris**, 1 primitive, no materials, meshopt + KHR_mesh_quantization.
- Canonical per pipeline law #4: width(X)/depth(Z) centered on 0, base at Y=0, node identity.
- GLB dims (W×H×D): **5.09 × 5.08 × 7.67 mm**. Long axis (7.67, the shank) runs along
  **depth (glTF Z)** — same orientation convention as `WoodScrew`.
- Deliberately decimated from the source (was 27,082 tris / 423 KB). Threads are a
  low-poly hint only; that's all the planner needs. Raw intermediate in `raw/`,
  `parts_index.csv` row written (`ButtonHeadScrew_M3-6,Screw,5.1,5.1,7.65,1354,True,29.6`).

**Thumbnail (BOM)** — `ButtonHeadScrew_M3-6.png`
- `D:\Render Projects\Hardware\GEN2 Thumbnails\ButtonHeadScrew_M3-6.png`
- 256² RGBA transparent, TrueIsoCam rig, steel material. **Left at full detail on purpose**
  (it's just a PNG — crisp threads read better on a BOM row than the low-poly mesh would).

**Source** — `D:\Render Projects\Hardware\GEN2 Decor Handles.blend`, object
`M3-6 - Hex - Buttonhead` (the blend also has `Essential 1W-1H` + `Deco Handle` posed as
the reference assembly). Screw was posed at rot **-90° X**.

---

## Positioning (DERIVED from the posed reference — verify in the viewer)

Reference faceplate: **Essential 1W-1H** (87×55×5 mm, W×H×D). Axis convention matches the
viewer: **faceplate-local X = width, Y = height, Z = depth**.

**Two screws, offset from the faceplate CENTER (width, height, depth, mm):**

| screw | width | height | depth |
|---|--:|--:|--:|
| left  | **-21.99** | **+0.49** | **-1.88** |
| right | **+22.02** | **+0.49** | **-1.88** |

- Horizontal: **±22 mm from center (44 mm apart)** — this is the handle's mount-hole pitch.
- Vertical: **~centered** on the faceplate (+0.5 mm).
- Depth: screw center sits **1.88 mm behind** the faceplate depth-center.
- Screw axis is along **depth**; **head on the BACK** (−depth), shank threads **forward**
  into the handle. The head protrudes ~3 mm behind the faceplate back face (→ hidden by
  the back cover; matches "install screws before the back cover").
- Because the GLB is canonical with the shank along depth (like `WoodScrew`), placement
  should be a pure translation to the offsets above (relative to the faceplate instance) —
  **no rotation expected**, but confirm head-faces-back on first placement; flip 180° about
  the height axis if it comes in reversed.

⚠ All numbers are DERIVED from one posed 1W-1H reference (no ground-truth printed assembly),
same caveat as other DERIVED placements in CLAUDE.md — eyeball it on a constructed `#build=`
before trusting it. The ±22 mm pitch is the Deco handle's; confirm it holds for BlockBar /
Crystal handles or key it per handle family if their mount holes differ.

---

## Wiring TODO (deferred — do this next)

1. **Pools:** copy `ButtonHeadScrew_M3-6.lib.glb` into every `viewer/parts/<L>/` (shared
   hardware, all six lengths).
2. **Images:** copy `ButtonHeadScrew_M3-6.png` into `viewer/img/parts/` and planner
   `img/parts/`; add the `imgFor` branch (`ButtonHeadScrew_M3-6` → `img/parts/ButtonHeadScrew_M3-6.png`)
   and the planner `partImage` equivalent.
3. **generate.js:** emit **2 screw instances per bolt-on handle**, at the faceplate-relative
   offsets above. Gate it: only faceplates that carry a separate handle (Essential family);
   skip integrated-grip families (EdgeLabel, Classic Pro). Screws ride the drawer/faceplate
   and go in **before** the back cover in the step order.
4. **BOM:** add as **purchased hardware** — mirror `WoodScrew` / magnets: `purchased: true`,
   excluded from the print count, shown "×N · buy", **color-locked steel** (no filament
   picker). Add an Amazon affiliate `links.buy` (M3 button-head 6 mm); the planner's
   `HARDWARE_BUY` / viewer `BUY` already carry generic M3 screws — extend for the
   button-head variant. Update both tools together.
5. **Count:** N = 2 × (number of bolt-on handles in the build).

Naming is `ButtonHeadScrew_M3-6` (parallel to `WoodScrew`); trivial to rename if you prefer
`HandleScrew_M3` — it's the GLB + PNG + index row + the references above.
