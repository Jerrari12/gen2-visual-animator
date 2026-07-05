r"""
gen2_glb_export.py  --  GEN2 GLB Pipeline: Blender-side export worker
=====================================================================

Exports mesh parts from a Blender scene to RAW canonical GLBs, ready for
meshopt compression by gen2_batch.py.

It enforces the locked GEN2 pipeline laws:
  1. Axes        width = X, height = Y, depth = Z   (Blender +Y-up glTF export)
  2. No material the viewer assigns brand colours by part code
  3. Units       mm-as-meters (raw Blender coordinate numbers pass straight through)
  4. Origin      canonical: width + depth centred on 0, Y = 0 at the part's bottom,
                 node at identity, no rotation
  5. (stacking pitch math lives in the viewer, not here)

It is NON-DESTRUCTIVE: every part is duplicated, the duplicate is rebased and
exported, then deleted. Your source .blend is never modified and never saved.

------------------------------------------------------------------------------
HOW TO RUN
------------------------------------------------------------------------------
A) Headless, driven by gen2_batch.py (normal use) -- one file, one command:
     blender --background "part.blend" --python gen2_glb_export.py -- \
         --out "D:\...\GLB Library\185" \
         --select "prefix:Decor Drawer" \
         --code-regex "185-\d+W-\d+H" \
         --name-template "DecorDrawer_{code}" \
         --depth-mode center

B) Inside an open Blender (paste into the Scripting tab, or via the MCP):
     leave argv empty and edit the CONFIG dict below, then Run.

Args after `--` override CONFIG. Everything not passed falls back to CONFIG.
"""

import bpy, bmesh, os, sys, re, json
from mathutils import Vector, Matrix


# ---------------------------------------------------------------------------
# CONFIG -- used when no CLI args are given (i.e. running inside open Blender).
# ---------------------------------------------------------------------------
CONFIG = {
    "out":           r"D:\Code Projects\GEN2 Visual Animator\GLB Library\185",
    "select":        "prefix:Decor Drawer",   # "prefix:TEXT" | "collection:NAME" | "all"
    "code_regex":    r"185-\d+W-\d+H",         # extract the planner part code; "" = use object name
    "name_template": "DecorDrawer_{code}",     # {code} = regex match, {name} = raw object name
    "depth_mode":    "center",                 # center | front | back  (see note below)
    "drop_islands_max_verts": 0,               # >0 = delete tiny mesh islands (print bridges/
    "drop_islands_max_thick": 2.0,             #   supports) that are ALSO thinner than this (mm, Z)
    "report":        "_export_report.json",    # written into --out
}

# depth-mode note:
#   center  -> part centred on its own depth (LOCKED default, matches the case library).
#   front   -> the +Y extreme sits at Z=0 (front-flush reference).
#   back    -> the -Y extreme sits at Z=0.
#   front/back assume +Y is the installed "front"; if a given file is modelled the
#   other way round, swap them. When unsure, use center -- the viewer aligns faces
#   at runtime from each GLB's bounds.


def get_config():
    argv = sys.argv
    user = argv[argv.index("--") + 1:] if "--" in argv else []
    if not user:
        return dict(CONFIG)
    import argparse
    ap = argparse.ArgumentParser(description="GEN2 GLB export worker")
    ap.add_argument("--out", required=True)
    ap.add_argument("--select", default=CONFIG["select"])
    ap.add_argument("--code-regex", dest="code_regex", default=CONFIG["code_regex"])
    ap.add_argument("--name-template", dest="name_template", default=CONFIG["name_template"])
    ap.add_argument("--depth-mode", dest="depth_mode", default=CONFIG["depth_mode"],
                    choices=["center", "front", "back"])
    ap.add_argument("--drop-islands-max-verts", dest="drop_islands_max_verts",
                    type=int, default=CONFIG["drop_islands_max_verts"])
    ap.add_argument("--drop-islands-max-thick", dest="drop_islands_max_thick",
                    type=float, default=CONFIG["drop_islands_max_thick"])
    ap.add_argument("--report", default=CONFIG["report"])
    return vars(ap.parse_args(user))


def get_targets(select):
    kind, _, val = select.partition(":")
    if kind == "collection":
        col = bpy.data.collections.get(val)
        objs = [o for o in col.all_objects if o.type == "MESH"] if col else []
    elif kind == "prefix":
        objs = [o for o in bpy.context.scene.objects
                if o.type == "MESH" and o.name.startswith(val)]
    elif kind == "all":
        objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    else:
        raise ValueError("select must be 'prefix:...', 'collection:...' or 'all'")
    return sorted(objs, key=lambda o: o.name)


def make_node_name(obj_name, code_regex, template):
    code = obj_name
    if code_regex:
        m = re.search(code_regex, obj_name)
        if m:
            code = m.group(0)
    name = template.format(code=code, name=obj_name)
    return name.strip().replace(" ", "_")


def world_bounds(obj):
    mw = obj.matrix_world
    cs = [mw @ Vector(c) for c in obj.bound_box]
    xs = [c.x for c in cs]; ys = [c.y for c in cs]; zs = [c.z for c in cs]
    return min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)


def rebase_offset(bounds, depth_mode):
    xmin, xmax, ymin, ymax, zmin, zmax = bounds
    dx = -(xmin + xmax) / 2.0          # centre width (Blender X)
    dz = -zmin                         # drop bottom to 0 (Blender Z = height)
    if depth_mode == "center":
        dy = -(ymin + ymax) / 2.0
    elif depth_mode == "front":
        dy = -ymax
    elif depth_mode == "back":
        dy = -ymin
    else:
        raise ValueError("bad depth_mode")
    return Vector((dx, dy, dz))


def export_selected(obj, path):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,           # law #1: Blender Z-up -> glTF Y-up
        export_materials="NONE",   # law #2: no materials
        export_cameras=False,
        export_lights=False,
        export_apply=True,
    )


def drop_support_islands(mesh, max_verts, max_thick):
    """Delete disconnected mesh islands that are BOTH tiny (< max_verts verts) and
    thin (< max_thick mm in Z) -- print bridges / built-in supports, not real part
    geometry. Returns how many islands were removed. Operates on the duplicate only."""
    n = len(mesh.vertices)
    parent = list(range(n))
    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]; a = parent[a]
        return a
    for e in mesh.edges:
        ra, rb = find(e.vertices[0]), find(e.vertices[1])
        if ra != rb:
            parent[ra] = rb
    groups = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)
    drop, dropped = set(), 0
    for verts in groups.values():
        zs = [mesh.vertices[i].co.z for i in verts]
        if len(verts) < max_verts and (max(zs) - min(zs)) < max_thick:
            drop.update(verts); dropped += 1
    if drop:
        bm = bmesh.new(); bm.from_mesh(mesh); bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[bm.verts[i] for i in drop], context='VERTS')
        bm.to_mesh(mesh); bm.free(); mesh.update()
    return dropped


def run():
    cfg = get_config()
    out_dir = cfg["out"]
    os.makedirs(out_dir, exist_ok=True)

    if bpy.context.mode != "OBJECT":
        try:
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception:
            pass

    targets = get_targets(cfg["select"])
    if not targets:
        print(f"[gen2] WARNING: no meshes matched select='{cfg['select']}'")

    report = []
    for src in targets:
        node = make_node_name(src.name, cfg["code_regex"], cfg["name_template"])

        # If the source itself already holds the target name, temporarily park it
        # so the exported NODE gets the clean name (Blender forbids duplicate names,
        # else the copy becomes 'name.001'). Restored after export -> source intact.
        parked_obj = parked_mesh = None
        if src.name == node:
            parked_obj = src.name; src.name = node + "__parked__"
        if src.data.name == node:
            parked_mesh = src.data.name; src.data.name = node + "__parked__"

        # non-destructive duplicate (object + its own mesh datablock)
        mesh = src.data.copy()
        dup = src.copy()
        dup.data = mesh
        dup.name = node
        mesh.name = node
        bpy.context.scene.collection.objects.link(dup)

        # Bake any object-level transform (rotation/offset from being posed) into the
        # mesh, so a part posed in its as-installed orientation exports in that WORLD
        # orientation; then reset the object to identity. Parts modeled at identity
        # (loc 0, no rotation) are unchanged by this.
        mw = dup.matrix_world.copy()
        mesh.transform(mw)
        dup.matrix_world = Matrix.Identity(4)
        mesh.update()
        bpy.context.view_layer.update()

        dropped = 0
        if cfg["drop_islands_max_verts"] > 0:
            dropped = drop_support_islands(mesh, cfg["drop_islands_max_verts"],
                                           cfg["drop_islands_max_thick"])
            bpy.context.view_layer.update()

        off = rebase_offset(world_bounds(dup), cfg["depth_mode"])
        for v in mesh.vertices:
            v.co += off
        mesh.update()
        bpy.context.view_layer.update()

        b = world_bounds(dup)  # Blender-space bounds after rebase (sanity only)
        path = os.path.join(out_dir, node + ".glb")
        export_selected(dup, path)

        report.append({
            "source_object": src.name,
            "node": node,
            "islands_dropped": dropped,
            "file": os.path.basename(path),
            "offset_applied": [round(v, 4) for v in off],
            "blender_bounds_after": {
                "x": [round(b[0], 3), round(b[1], 3)],
                "y_depth": [round(b[2], 3), round(b[3], 3)],
                "z_height": [round(b[4], 3), round(b[5], 3)],
            },
            "raw_bytes": os.path.getsize(path),
        })

        bpy.data.objects.remove(dup, do_unlink=True)
        bpy.data.meshes.remove(mesh, do_unlink=True)

        if parked_obj is not None:
            src.name = parked_obj
        if parked_mesh is not None:
            src.data.name = parked_mesh

    meta = {
        "blend": bpy.data.filepath,
        "select": cfg["select"],
        "code_regex": cfg["code_regex"],
        "name_template": cfg["name_template"],
        "depth_mode": cfg["depth_mode"],
        "exported": len(report),
        "parts": report,
    }
    with open(os.path.join(out_dir, cfg["report"]), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print(f"[gen2] exported {len(report)} raw GLB(s) -> {out_dir}")
    return meta


if __name__ == "__main__":
    run()
