# GEN2 GLB Pipeline

Turns GEN2 Blender exporter files into small, canonically-origined, viewer-ready
GLB part libraries — in one command. Point it at a list of `.blend` files, get a
folder of `.lib.glb` parts plus a manifest-ready `parts_index.csv`.

## Files

| File | Runs where | Does what |
|---|---|---|
| `gen2_glb_export.py` | inside Blender | Duplicates each part, rebases to canonical origin, exports raw `.glb` (+Y-up, no materials). Non-destructive — your `.blend` is never touched or saved. |
| `gen2_batch.py` | your machine (Python) | Launches Blender headless per job, meshopt-compresses, verifies canonical origins in world space, writes `parts_index.csv`. |
| `gen2_jobs.json` | — | The job list. Drawers job is ready; Cases + Quicklocks are `skip` templates. |
| `derive_adhesive_foot.py` | your machine (Python) | **Not a job.** Derives `Adhesive-Foot.lib.glb` from the printed `Tabletop-Kit-Foot` master by cutting off the dovetail rail and capping the opening — see "Derived parts" below. |

## Derived parts

One part in this library is not exported from a blend. The bought **adhesive
rubber foot** is the printed TPU foot without its upper dovetail rail (Joey
confirmed 2026-08-21: same external body, same height, no rail — the rail seats
inside the case, and a stick-on foot has nothing to seat into), so it is
DERIVED from the shipped master rather than redrawn:

```bat
python "GLB Pipeline\derive_adhesive_foot.py"          :: write + verify + copy to every pool
python "GLB Pipeline\derive_adhesive_foot.py" --check  :: verify only
```

It finds the rail-base plane empirically, keeps the shell below it, caps the
six-vertex rim with a 4-triangle fan, and refuses to write unless the result is
a closed, outward-wound, non-degenerate 2-manifold with a +Y cap and −Y bottom.
`--check` rebuilds the bytes in memory and diffs them against the library copy
AND all six shipped pool copies, so a stale artifact fails (exit 1, naming the
file) rather than passing on a mere existence test.

⚠ Like every blend, `GLB Library/` is gitignored, so the printed master this
reads lives only on Joey's machine — the script cannot run from a fresh clone.
The SHIPPED copies under `viewer/parts/<L>/` are committed, which is why
`test/adhesive-foot.test.mjs` measures those and never the master.

⚠ **Two things about it break the usual conventions, both deliberately:**
- It ships **UNCOMPRESSED** despite the `.lib.glb` suffix. At 16 triangles the
  meshopt container's own overhead exceeds the payload — the uncompressed file
  is 2124 B against the compressed 96-triangle printed foot's 2924 B — and it
  drops the `EXT_meshopt_compression` requirement entirely. **In this repo
  `.lib.glb` means "viewer-ready GLB", not "meshopt-compressed";** the viewer's
  loader hardcodes that suffix, so a derived part still has to wear it.
- **Re-exporting the printed foot silently invalidates it.** Both files would
  still load and still look like feet. `test/adhesive-foot.test.mjs` in the repo
  root is the guard: it fingerprints the printed foot and fails with a message
  ordering a re-derivation before the golden may be refreshed. Re-run this
  script whenever `Tabletop-Kit-Foot` changes.

## Requirements

- **Blender** — auto-detected from `C:\Program Files\Blender Foundation\...`, or set `"blender_exe"` in `gen2_jobs.json`, or the `BLENDER` env var.
- **Node.js** on PATH — for meshopt compression (`npx @gltf-transform/cli`). Without it the batch still exports and verifies raw GLBs; it just skips compression.
- **Python 3.8+**.

## Run it

```bat
cd "D:\Code Projects\GEN2 Visual Animator\GLB Pipeline"

:: full run — every non-skipped job in gen2_jobs.json
python gen2_batch.py

:: a different job file
python gen2_batch.py my_jobs.json

:: compress + verify + index an existing folder, no Blender
python gen2_batch.py --post-only "D:\Code Projects\GEN2 Visual Animator\GLB Library\185"
```

Output per job `out` folder:

```
GLB Library\185\
  DecorDrawer_185-1W-1H.lib.glb   <- viewer-ready (compressed, canonical)
  ...
  parts_index.csv                 <- node names, dims, bounds, sizes
  raw\*.glb                       <- uncompressed intermediates (regenerable; safe to delete)
```

## Adding a new part type (e.g. Cases, Quicklocks)

1. In `gen2_jobs.json`, set the job's `blend` path and `out` folder.
2. Open that `.blend` once and look at the mesh object names.
3. Set:
   - `select` — `"prefix:TEXT"` (matches the start of the object names), `"collection:NAME"`, or `"all"`.
   - `code_regex` — pulls the planner part code out of the object name (e.g. `185-\d+W-\d+H`). Use `""` to keep the object name as-is.
   - `name_template` — the GLB node + file name. `{code}` = the regex match, `{name}` = the raw object name. This name is what the viewer manifest references, so make it match your planner codes.
   - `depth_mode` — leave `center` unless you want a front/back-flush reference.
4. Remove `"skip": true`.
5. `python gen2_batch.py`.

## Pipeline laws it enforces

1. **Axes** — width = X, height = Y, depth = Z (Blender `+Y Up` glTF export).
2. **No materials** — the viewer assigns brand colours per part code; one GLB serves every theme.
3. **Units** — mm-as-meters (raw Blender numbers pass straight through; a 50 mm-tall part reads `0…50` in the GLB). Stock glTF viewers show parts building-sized — ignore.
4. **Canonical origin** — width and depth centred on 0, `Y = 0` at the part's bottom, node at identity, no rotation. Verified in **world space** after export, so meshopt's `KHR_mesh_quantization` node transform (which shifts the raw accessor numbers) is accounted for — the verifier de-quantizes and re-applies the node TRS before checking. Every part passes or the run reports it.
5. **Place by pitch math, not bounding boxes** — this is a *viewer* rule (88 mm horizontal / 56 mm vertical pitch; 3 mm dovetail overlap). The pipeline only guarantees canonical origins so that math works.

## Notes

- **`depth_mode`**: `center` matches the case library and is the locked default. `front`/`back` assume `+Y` is the installed front; if a file is modelled the other way, swap them. When unsure, use `center` and let the viewer align faces from each GLB's bounds at runtime.
- **Idempotent**: compression skips a `.lib.glb` that already exists. Delete it to force a re-compress.
- **Consistent "front"**: the exporter only translates, never rotates, so all parts in a file keep one shared front. Confirm that front matches across part *types* (drawers vs cases) before wiring up the viewer, or parts can animate in backwards.
