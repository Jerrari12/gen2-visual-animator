r"""Rebuild the Gridfinity Decor Drawers source blend from the shipped STLs.

    blender --background --python build_gridfinity_drawer_blend.py -- <out.blend> <stl-root> [version] [--planar DEG]

<stl-root> is the GEN2 folder of Model Sharing (on Joey's machine
`D:\Claude - Model Sharing\GEN2`); each drawer is read from
`<root>\<L>\Gridfinity\Decor Drawer\<version>\STL\<L>-<W>W-<H>H Decor Gridfinity Drawer.stl`
(version defaults to v2609). Sixty drawers: 115/165/185/240/270 x 1W-4W x 1H/1.5H/2H.

Same standing as `build_shelf_insert_blend.py`: provenance KNOWLEDGE, not provenance
PROOF. The STLs are not committed and their hashes are not recorded; this preserves the
recipe, and fails closed on orientation.

WHAT IT DOES, per drawer: import the STL with NO rotation - the STLs are authored in the
installed pose (open top up) and in the same frame as the Decor drawer STLs, whose low-y
end is the drawer FRONT. The glTF exporter maps Blender (x, y, z) to glTF (x, z, -y), so
an identity import lands the front at glTF +Z, which is where the viewer's DecorDrawer
GLBs put it (measured 2026-09-18: the May standard 185-1W-1H STL imported this way
matches 100 percent of the July DecorDrawer GLB's vertices). Recentre X/Y on the bbox,
drop the bottom to Z = 0, clear materials, and file it into `GridfinityDecor_<L>`.

`--planar DEG` (optional) merges coplanar triangles within DEG degrees and re-triangulates
(bmesh dissolve_limit). The STLs triangulate every flat CAD face finely; a planar merge
removes triangles without moving any surface. The bounding box is asserted unchanged.

FAIL CLOSED on orientation. `gen2_batch.py` reporting "canonical OK" cannot catch a
rotated or flipped part (canonical rebasing recentres anything), so this refuses to write
unless, for every drawer:
  - its span is the standard Decor drawer's: 88W - 13 wide, L - 5.7 deep, 50/78/106 tall;
  - it is right side up: there is upward-facing area at the grid top (z = 6.40) and at
    the half-grid channel floor (z = 1.20);
  - the half-grid channel is on +x (the right, seen from the front): the upward faces at
    z = 1.20 have their area-weighted centroid right of the drawer's centre line;
  - the tear-away front is at -y (the front): the largest -y-facing area within 10 mm
    of the low-y end exceeds the largest +y-facing area within 10 mm of the high-y end.
"""

import bpy, bmesh, os, sys, math
from mathutils import Matrix

_a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(_a) < 2:
    sys.exit("usage: blender -b --python build_gridfinity_drawer_blend.py -- <out.blend> <stl-root> [version] [--planar DEG]")
dst, ROOT = _a[0], _a[1].rstrip("\\/")
planar = None
if "--planar" in _a:
    planar = float(_a[_a.index("--planar") + 1])
    _a = _a[:_a.index("--planar")]
VERSION = _a[2] if len(_a) > 2 else "v2609"
if not os.path.isdir(ROOT):
    sys.exit("stl root not found: %r" % ROOT)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.unit_settings.system = 'METRIC'
sc.unit_settings.scale_length = 0.001
LENGTHS, WIDTHS, HEIGHTS = (115, 165, 185, 240, 270), (1, 2, 3, 4), ("1H", "15H", "2H")
report = []


def face_stats(me):
    """(area, centroid-x, centroid-y, centroid-z, normal) per polygon."""
    out = []
    for p in me.polygons:
        c = p.center
        out.append((p.area, c.x, c.y, c.z, p.normal.copy()))
    return out


def add(stl, name, col, gx, gy):
    if not os.path.isfile(stl):
        sys.exit("missing source STL: %s" % stl)
    before = set(bpy.data.objects)
    bpy.ops.wm.stl_import(filepath=stl)
    ob = [o for o in bpy.data.objects if o not in before][0]
    me = ob.data
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    tris_in = len(bm.faces)
    xs = [v.co.x for v in bm.verts]; ys = [v.co.y for v in bm.verts]; zs = [v.co.z for v in bm.verts]
    bmesh.ops.translate(bm, verts=bm.verts, vec=(-(min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2, -min(zs)))
    span_in = (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
    if planar is not None:
        bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(planar), verts=bm.verts, edges=bm.edges,
                                 delimit={'NORMAL'})
        bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free(); me.update()
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    span = (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
    if any(abs(a - b) > 1e-3 for a, b in zip(span, span_in)):
        sys.exit("%s: planar merge changed the bounding box %s -> %s" % (name, span_in, span))

    st = face_stats(me)
    # right side up: upward faces at the grid top (6.40) AND at the channel floor (1.20)
    frame_top = sum(s[0] for s in st if s[4].z > 0.99 and abs(s[3] - 6.40) < 0.02)
    chan = [s for s in st if s[4].z > 0.99 and abs(s[3] - 1.2) < 0.02]
    chan_area = sum(s[0] for s in chan)
    chan_x = sum(s[0] * s[1] for s in chan) / chan_area if chan_area else 0.0
    ymin, ymax = min(ys), max(ys)
    # the tear-away panel's face sits 3.10 mm behind the front plane (measured 2026-09-18);
    # the same depth from the BACK must carry next to nothing
    panel = sum(s[0] for s in st if s[4].y < -0.99 and abs(s[2] - (ymin + 3.10)) < 0.05)
    panel_mirror = sum(s[0] for s in st if s[4].y > 0.99 and abs(s[2] - (ymax - 3.10)) < 0.05)
    opening = max(0.0, (span[0] - 21.5) * (span[2] - 6.5))
    L_, W_, H_ = int(name.split("-")[0]), int(name.split("-")[1][0]), name.split("-")[2].split()[0]
    want = (88 * W_ - 13, L_ - 5.7, {"1H": 50.0, "15H": 78.0, "2H": 106.0}[H_])
    problems = []
    if any(abs(a - b) > 0.05 for a, b in zip(span, want)):
        problems.append("span %s, expected %s (width x depth x height; rotated about Z?)" % ([round(v, 2) for v in span], want))
    if frame_top < 50 or chan_area < 50:
        problems.append("upward area at the grid top (6.40) %.0f mm2 and channel floor (1.20) %.0f mm2, "
                        "expected >= 50 each (upside down or not a Gridfinity drawer?)" % (frame_top, chan_area))
    if not chan_area or chan_x <= 0:
        problems.append("half-grid channel centroid x = %.2f, expected > 0 (mirrored or turned round?)" % chan_x)
    if panel < 0.3 * opening or panel < 5 * panel_mirror:
        problems.append("tear-away panel area at the front %.0f (opening %.0f), mirror at the back %.0f (turned round?)"
                        % (panel, opening, panel_mirror))
    if problems:
        sys.exit("ORIENTATION: %s\n  - %s" % (name, "\n  - ".join(problems)))

    ob.name = name; me.name = name
    ob.matrix_world = Matrix.Identity(4)
    ob.location = (gx, gy, 0)
    ob.hide_viewport = False; ob.hide_render = False; ob.hide_select = False
    me.materials.clear()
    for c in ob.users_collection:
        c.objects.unlink(ob)
    col.objects.link(ob)
    report.append((name, tris_in, len(me.polygons), [round(v, 2) for v in span], round(frame_top),
                   round(chan_area), round(chan_x, 1), round(panel), round(panel_mirror)))


for i, L in enumerate(LENGTHS):
    col = bpy.data.collections.new(f"GridfinityDecor_{L}")
    sc.collection.children.link(col)
    for j, w in enumerate(WIDTHS):
        for k, h in enumerate(HEIGHTS):
            code = f"{L}-{w}W-{h}"
            add(os.path.join(ROOT, str(L), "Gridfinity", "Decor Drawer", VERSION, "STL", f"{code} Decor Gridfinity Drawer.stl"),
                f"{code} Gridfinity Decor Drawer", col, j * 420.0 + k * 0.0, i * 320.0 + k * 1200.0)

EXPECTED = len(LENGTHS) * len(WIDTHS) * len(HEIGHTS)
if len(report) != EXPECTED or len(sc.objects) != EXPECTED:
    sys.exit("expected %d drawers, built %d (%d objects)" % (EXPECTED, len(report), len(sc.objects)))
os.makedirs(os.path.dirname(dst), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=dst, compress=True)
print("[build] %d drawers, planar=%s, version=%s" % (len(report), planar, VERSION))
for r in report:
    print("[build]", r)
