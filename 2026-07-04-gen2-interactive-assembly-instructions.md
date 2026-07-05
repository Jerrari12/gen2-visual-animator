# GEN2 Interactive Assembly Instructions — Session Notes

**Date:** July 4, 2026
**Project:** Premade GEN2 kits with interactive assembly instructions (beginner onboarding)
**Status:** Concept validated → PoC v2 built → joint rules locked → GLB pipeline proven

---

## 1. The concept

Premade GEN2 designs with instructions (e.g., a wall mount kit) to get beginners started. Instructions vision: LEGO-style step-by-step at a 3D/isometric view, but interactive on a computer — parts slide into place per step, the model reorients when a part goes on the underside, text notes and part number identification throughout. Target audience: beginners. Goal: the easiest possible entry into GEN2.

## 2. Research — does this exist?

- **LEGO Builder app** validates the concept at scale: interactive 3D instructions with rotate/zoom and step-through. Its core value confirmed by user reviews: 3D resolves part-orientation ambiguity that static images can't — GEN2's exact failure mode (dovetail direction, quicklock orientation).
- **LEGO's UX complaints = free design lessons:** let users stop/skip animations, jump between steps easily, keep camera controls simple, keep part colors accurate.
- **Commercial category exists** (manufacturer-focused): Cadasio (CAD → interactive step presentations, free viewing, embeds, QR), Easemble (GLB/FBX/OBJ → web manuals), Synode, BuildIn3D, Vectary.
- **Indie precedent:** designers have built three.js / react-three-fiber exploded views for 3D printed products (slider-driven assembly state).
- **The gap:** Printables and MakerWorld only offer static images and video embeds. Nobody does interactive instructions at the model-page level. That's the opening.

## 3. Decisions

- **Build custom, not off-the-shelf.** Reusable engine, not per-kit code. On-brand with the planner/label generator tooling; avoids another platform dependency; the tool itself is content ("I built LEGO-style interactive instructions for 3D printing").
- **Web-based, static hosting** on GitHub Pages, same as gen2planner. No backend, no accounts. Must work on a phone — real usage context is standing at the workbench with printed parts.
- **One Blender master scene per kit → three outputs:** static isometric step renders (Printables page + START_HERE.pdf in the zip), a 60–90s assembly animation (short single-concept videos outperform, per GA data), and the GLB for the interactive viewer.
- **Sequencing:** ship kit #1 with static + video; interactive viewer follows as its own announcement. Don't block the kit launch on tool dev.
- **Step 0 is a print checklist** — quantities, plate groupings. LEGO parts come in the box; ours come off a printer. The honest count matters (this 4-case kit = 26 prints).
- **Distribution:** QR/link in the Printables description and inside a START_HERE.pdf in the download zip.

## 4. Architecture

**Viewer:** React + three.js. Loads one GLB + one JSON manifest per kit. Parts animate in along their true insertion axis, camera tweens between per-step presets, tap any part to identify it (name, code, qty, source). Ghost preview of upcoming parts. Kit lives at `/kits/<kit-name>/{model.glb, manifest.json}` — viewer code never changes between kits.

**Manifest = entire authoring surface:**

```json
{ "title": "Lower foot rails",
  "note": "Dark rails first — seam lands mid-span of the layer above.",
  "camera": { "t": 0.6, "p": 1.15, "r": 600, "target": [132, 34, 0] },
  "parts": [ { "node": "FR-L_2W", "from": "above" },
             { "node": "FR-L_1W", "from": "above" } ] }
```

**The endgame — generate manifests from the planner.** Chess games replay from notation because pieces and legal moves are finite; GEN2 builds are the same. Planner state = the notation; assembly order is *derivable*, not designed:

1. **Part library** (one-time per collection): every part exported once as a compressed GLB (~30 parts for the 185). No Blender work per kit after that.
2. **Placement math** already exists in the planner (grid → 3D is pure arithmetic on the 88/56 pitch).
3. **Assembly order is a dependency sort:** tabletop builds bottom-up (nothing places until what it rests on exists); wall mount builds top-down (nothing places until what it hangs from exists). Quicklocks are templated sub-actions. Cameras from a bounding-box heuristic. Notes from template strings.

Encode build state in the URL hash → no backend → "Get instructions for this build" works for **any** custom layout, and club members can share builds in Discord with a working assembly animation attached. Sharing mechanic, not just documentation.

**Caveats:** auto-generated output reads uniform — generator is the first draft; hand-polish notes/cameras on flagship kits only. Before trusting it, spend an hour trying to construct a legal planner layout that produces a blocked insertion. The interior-slot stress warning can inject itself into the relevant step's note since the generator sees the full layout.

**Scope discipline:** 185 collection + tabletop mount first, wall mount second. Don't build six part libraries before one kit proves people use this.

## 5. Joint grammar — LOCKED (source of truth)

**Core invariant:** the female dovetail channel is closed at the rear, so insertion always happens through its open front end. Which body moves determines what the motion looks like — one rule, two appearances.

| Joint | Mover | Motion | Stop / lock |
|---|---|---|---|
| Case/cover onto unit below (tabletop stacking) | upper unit (female) | **back→front**, full depth | channel rear wall = stop; quicklocks below spring into channel cutout |
| Case hanging under unit above (wall / under-table) | lower case (male rails on top) | **front→back**, toward wall | rear stop; the lower case's own quicklocks lock it |
| Quicklock into case | quicklock | straight **down** into top-wall slots | installed **before** that case joins the build |
| Top row onto wall pegs | case | toward wall, then small **drop** | screw/nail head traps in keyhole slot narrow section |
| Feet into FR-L underside | foot | **horizontal**: outer feet slide toward the rail ends; 2W middle pair slides left→right | done at the bench **before** rails are placed |
| Drawer into case | drawer | front insertion, **after full assembly** | — |
| Decor faceplate | faceplate | drawer nudges forward → plate slides **down** → flush | compliant snap |

**Quicklocks:** one per outer case wall — L variant in the left wall, R in the right (a **pair per case**, handed prints). When a case or cover slides over, they compress slightly, then spring up into the cutout in that unit's channel at full insertion — interrupting the rail and preventing movement. Release: reach in through the case front opening, pull the quicklock down, slide the units apart.

**Non-quicklock joints** (FR-U↔FR-L, feet↔rail, bottom case row↔FR-U, CU↔CL): v2602 compliant snap + friction fit. Optional M3 screw for a hard lock (advanced callout, not a step).

**Under-table:** the auto-added rail's underside carries female channels; cases slide front→back into it — same grammar as wall hanging.

**Wall mount detail:** each 1W of case has two rear slots — round and open at the bottom, narrowing above except at the nail-head position. Case moves toward the wall, then down slightly; peg (screw head, positioned by the Wall Mount Lite bracket) traps in the narrow section.

**Assembly order:** tabletop = feet→FR-L subassembly, place, FR-U, rows bottom-up, CL, CU, drawers, (faceplates). Wall = brackets, peg row, down the columns, drawers. Disassembly = reverse, top-down.

## 6. Deliverables produced

| File | What it is |
|---|---|
| `gen2-instructions-poc.jsx` | v1 PoC — superseded (had drop-from-above motion, 4 feet, no quicklocks/drawers) |
| `gen2-instructions-poc-v2.jsx` | **Current PoC.** Table Top Kit · 185, 12 steps: print checklist → feet-into-rails bench subassembly → rails set down → upper rails back→front → per-case quicklock-then-slide (×4) → covers with dip-and-pop lock animation → drawer finale → physically correct disassembly epilogue (cover off snaps → drawer out → pull quicklocks → cover slides free) |
| `185-1W-1H_Case.lib.glb` | Library-ready part: origin rebased to bottom-center, meshopt-compressed |

**Engine features added in v2 (all data-driven — a generated manifest can produce all of it):** parent-child parts (quicklocks/drawers ride their case, feet ride their rail), staged targets (subassembly enters elevated, drops as a unit), fx timelines (dip-and-pop, disassembly sequence as keyframe entries in step JSON).

## 7. GLB pipeline — proven on 185-1W-1H case

Test file: Blender export, 8,618 tris / 16,456 verts, 447 KB.

- **Poly count is correct — do not simplify further.** gltf-transform's simplifier removed nothing (mesh already clean). Full kit ≈ ~100k tris — trivial on a phone. Headroom exists to keep *more* detail where geometry teaches (quicklock slots).
- **Compression:** 447 KB → **90.6 KB** with meshopt, zero geometry loss. Whole kit ships under ~1 MB. Command: `npx @gltf-transform/cli meshopt in.glb out.glb`
- **Origin must be canonical:** export was at scene position (X 81–169, Z −204.6…−19.6). Rebased to bottom-center: X/Z centered, Y=0 at case bottom → bounds −44…44, 0…59, −92.5…92.5. Every library part follows this convention or placement math inherits scene offsets.

**Pipeline law (validated by this file):**

1. Axes: width=X, height=Y, depth=Z (Blender +Y-up export). ✓
2. No material in the GLB — viewer assigns brand colors per part code; one GLB serves any theme. ✓
3. Units: mm-as-meters. Matches planner math. Stock glTF viewers show it building-sized — ignore. ✓
4. Origin: bottom-center, Y=0 at part bottom.
5. **Place by pitch math, never bounding boxes** — physical case height is 59 mm vs 56 mm stacking pitch (3 mm rail overlap); box-based stacking drifts every row.

**Loader requirement:** meshopt needs the decoder registered once — `loader.setMeshoptDecoder(MeshoptDecoder)` (import from `three/examples/jsm/libs/meshopt_decoder.module.js`).

## 8. Flags & open items

**Model source status (updated July 4, later session):**
- **Cases:** print-ready STLs need **helper disks and built-in supports removed** before library export — one-time cleanup per part. Round 1: clean just two 185 case widths, not the whole catalog.
- **Drawers:** geometry ready; Joey will set up Blender files.
- **Covers & footrails:** not yet modeled/exported — use placeholder boxes until ready.
- **Quicklocks L/R:** requested with real geometry for round 1 (they carry the signature lock animation).
- Master part meshes for existing renders live in `D:\Render Projects\<size> <category>\GEN2 Thumbnail Renderer - *.blend` (Models collection, one mesh per variant).
- **Confirmed:** parts export at generic canonical origin (bottom-center, Y=0), never at assembly position — assemblies are computed from planner data at runtime. 59 mm physical case height vs 56 mm modular pitch reaffirmed (3 mm dovetail rail seats into the unit above).

- ⚠️ **Planner BOM check:** locked planner spec said one quicklock per case; actual rule is an **L/R pair per case**. If the live beta counts singles, every generated parts list is short by half — and L/R must be separate line items (handed prints). Two-minute check.
- **Next build steps:**
  1. Batch export script: folder of parts in → rebased, compressed GLBs out (Blender import → origin to bottom-center → GLB export → meshopt).
  2. Swap PoC placeholder boxes for real GLBs on Tabletop Kit 185.
  3. Deploy viewer to GitHub Pages alongside planner.
- **Effort estimates:** PoC → production v1 with real geometry for one kit: 2–3 weekends. Each additional hand-authored kit: 1–2 hrs. Planner auto-generation: ~2 more weekends — build it after 2–3 kits validate the format.
