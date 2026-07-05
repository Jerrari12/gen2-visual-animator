# GLB Batch Pipeline — Session Notes (follow-up)

**Date:** July 4, 2026 (later session)
**Project:** GEN2 interactive assembly instructions
**Topic:** Clarifying the batch GLB export/compress step, canonical origins, and the round-1 file plan
**Previous notes:** `2026-07-04-gen2-interactive-assembly-instructions.md`

---

## 1. What "registering and compressing batch GLB files" actually means

The confusing next-step from the previous session unpacked into three separate things:

**Compressing (per file, automated).** A Blender-exported part GLB is bigger than it needs to be (test case: 447 KB). One command — `npx @gltf-transform/cli meshopt in.glb out.glb` — shrinks it ~80% (to 90.6 KB) with zero geometry change. Like zipping a file, except the viewer reads it directly. "Batch" just means a script loops this over a folder of ~30 parts instead of running it by hand.

**Rebasing origins (per file, automated, before export).** Each part's origin must move to bottom-center (Y=0 at the part's bottom) before export, because the viewer places parts by math from that origin. Parts sitting at arbitrary scene positions (e.g., arranged for thumbnail renders) would otherwise carry hidden offsets that break placement math. The batch script does this automatically.

**Registering (one line of code, once, ever).** Nothing to do with registering files or a parts registry. It's a single line in the viewer code — `loader.setMeshoptDecoder(MeshoptDecoder)` — that teaches three.js how to read meshopt-compressed files. Written once when building the viewer; no per-part work, nothing to manage.

**The whole batch step in one sentence:** point a script at the part models → it outputs a folder of small, correctly-origined GLBs ready for the viewer. Run once per collection; re-run only when a part's geometry changes.

## 2. Canonical origins — Joey's question, confirmed

**Question raised:** for dynamic assemblies (matching whatever the user creates in the planner, not just one fixed animation), shouldn't each model sit at a generic origin rather than its position in one specific assembly?

**Answer: yes — this is pipeline law #4, already locked.** Every part exports at its own canonical origin: centered on X/Z, Y=0 at the part's bottom, at world (0,0,0), no rotation. Nothing about any specific assembly is baked into a GLB.

- Assembly position comes from the **viewer at runtime**: planner grid coordinates → world position via pitch arithmetic (88 mm horizontal / 56 mm vertical).
- One GLB per part type serves **every** assembly and quantity (loaded once, instanced per placement).
- Insertion direction ("from": "above" etc.) lives in the **manifest**, not the model.
- This is exactly what makes planner-generated instructions possible: GLBs are a fixed part library; each build is just data.
- The proven test file (`185-1W-1H_Case.lib.glb`) already follows this convention.

## 3. Height clarification — 59 mm vs 56 mm (reaffirmed)

Physical case height is **59 mm** including the 3 mm-high dovetail rails on top, which slide into the female slot under the unit above. Subtracting the 3 mm that seats into the part above gives **56 mm — the true modular repeating height of a 1H unit**.

Pipeline consequence (law #5): the GLB keeps the true 59 mm geometry; stacking math uses the 56 mm pitch. Consecutive rows visually overlap by 3 mm — correct, that's the rail seated in the channel. **Place by pitch math, never bounding boxes** (box-based stacking would use 59 and drift 3 mm per row).

## 4. Model source status

| Part group | Status |
|---|---|
| **Cases** | Print-ready STLs need **helper disks and built-in supports removed** before library export (one-time manual cleanup per part). Round 1: clean only two 185 widths, not the whole catalog. |
| **Drawers** | Geometry ready; Joey setting up Blender files. |
| **Covers & footrails** | Not yet modeled/exported — placeholder boxes until ready (engine treats them as data; swapping later is zero code). |
| **Quicklocks L/R** | Real geometry requested even for round 1 — they carry the signature dip-and-pop lock animation. |

Existing render meshes live in `D:\Render Projects\<size> <category>\GEN2 Thumbnail Renderer - *.blend` (a `Models` collection with one mesh per variant) — confirmed by inspecting the open 59 Case Extenders scene. No frame-part (rails/feet/quicklocks/covers) models found on disk yet.

## 5. Round-1 file request (for testing the batch pipeline)

Goal: prove the batch script (import → rebase origin → export GLB → meshopt) on real files, then swap into the PoC.

1. **185 case, 1W-1H** — cleaned (disks/supports removed)
2. **185 case, one more width used by the tabletop kit** — cleaned (two files so the script is tested as a *batch* with naming/variant handling)
3. **185 Classic Drawer 1W-1H** — Joey's Blender file
4. **Quicklock L + R** — real geometry

**Format:**
- Ideal: one **.blend** with a `Models` collection, one mesh object per part (same structure as the thumbnail renderers). Individual STLs (mm, one part per file) also fine — script will handle both. Blend preferred because object names survive.
- **Name each object/file with its planner part code** (e.g. `185-1W-1H_Case`) — that name becomes the manifest node name; correct at source = zero manual mapping.
- Position in file doesn't matter (script rebases). **Orientation does:** upright as-installed, consistent "front" across all parts.
- No materials — viewer assigns colors by part code.

## 6. Standing items

- ⚠️ **Planner BOM check (still open):** does the live planner count one quicklock per case, or the correct **L/R pair** (separate line items — handed prints)? If singles, every generated parts list is short by half. Two-minute check.
- No Blender modeling or animation work started this session, per Joey's instruction — waiting on round-1 files.
