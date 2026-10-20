r"""Rebuild the standard Decor Drawers source blend from the released v2609 STLs.

    blender --background --python build_decor_drawer_blend.py -- <out.blend> <stl-root> [version]

<stl-root> is the release folder in Model Sharing (on Joey's machine
`D:\Claude - Model Sharing\GEN2\v2609 Decor Drawers`); each drawer is read from
`<root>\<L>\STL\Decor Drawer <L>-<W>W-<H>H - <version>.stl` (version defaults to v2609).
Ninety-four drawers: 59 x 1W-2W x 05H/1H; 115/165/185/240/270 x 1W-4W x 05H/1H/15H/2H, plus
3H in 1W and 2W.

Same standing as `build_gridfinity_drawer_blend.py`: provenance KNOWLEDGE, not provenance PROOF.
The STLs are not committed and their hashes are not recorded; this preserves the recipe, and
fails closed on envelope and orientation.

WHAT IT DOES, per drawer: import the STL with NO rotation. The v2609 STLs are authored in the
installed pose (open top up) in the same frame as the May 2026 STLs the July DecorDrawer GLBs
were exported from (measured 2026-10-19: the May 185-1W-1H STL imported this way matches 100
percent of the July raw GLB's vertices, and every v2609 STL has the May bounding box, so the
low-y end is the drawer FRONT, which the glTF exporter lands at +Z like every DecorDrawer GLB).

THE BED TABS. Eleven of the 94 release STLs (every 3H size, and 240-2W-15H) carry a 1.2 mm
bed-adhesion flange round the two back bottom corners: 3.4 mm beyond each side wall, 2.8 mm
beyond the back, ~8 mm along each side and across the whole back, with chamfered edges. The May
3H STLs carried the same flange and the July GLBs do not, and a drawer 6.8 mm wider than its
case opening cannot be posed in the planner, so the flange is CUT OFF here: three plane cuts
(both sides and the back; the front carries no flange) one micron OUTSIDE the standard envelope,
outer side removed, each cut capped with an edge-net fill, applied only when the imported span
exceeds the standard envelope. The micron matters: a cut exactly on the wall plane makes
bisect_plane delete the wall's own faces lying in that plane (measured 2026-10-19 on 115-1W-3H:
the boundary then included the whole side wall's outline and its plug window), while one micron
out the wall faces are inside and untouched and the only boundary loops are the flange's
cross-sections, about 4 mm2 a side and 10 mm2 at the back on every flanged size. The cut also
leaves, where the flange's chamfer steps met the wall, four closed slivers one micron thick and
0.3 mm2 each; a shell under 1 mm2 lying wholly in that micron band is dropped after a cut, and
no other shell is touched (the smallest real shell, a wall plug, is 51 mm2). Before any cut the
oversize must be the known flange - nothing outside the envelope higher than 1.5 mm above the
underside or more than 4 mm beyond it - and the mesh must have no boundary edge; after each cut
only the loops lying in that cut plane are capped, and a boundary edge anywhere else fails the
build. So a 2W drawer under a 1W name, a protrusion elsewhere, or a hole in the source is
refused rather than trimmed into shape. The cap areas and the sliver count are in the build
report. Everything else in the STL is kept as released - the tear-away front, the two wall
plugs, the 185 collection's front-recess blocks.

FAIL CLOSED. `gen2_batch.py` reporting "canonical OK" cannot catch a rotated or flipped part
(canonical rebasing recentres anything), so this refuses to write unless, for every drawer:
  - its span, after any cut, is the standard Decor drawer's: 88W - 13 wide, L - 5.7 deep,
    22 / 50 / 78 / 106 / 162 tall for 05H / 1H / 15H / 2H / 3H, within 0.05 mm;
  - the mesh is closed: every edge is used by an even number of faces, two per shell (the
    release STLs are several closed shells touching along edges - the wall plugs sit in the
    wall windows - so a shared edge carries four; a cut that left a hole leaves an odd count);
  - it is right side up: the downward-facing area in the bottom plane is at least half the
    footprint (the floor's underside), and the upward-facing area in the top plane at most a
    fifth of it (the wall rims);
  - the tear-away front is at -y (the front): the -y-facing area between 2.3 and 3.2 mm behind
    the low-y end (the panel's rim at 2.40 and its recessed centre at 3.10, measured 2026-10-19,
    plus the front frame's step) is at least 0.3 x the front opening and at least 1.2 x the
    +y-facing area in the same band from the high-y end (the drawer's back is recessed 2.6 to
    2.9 mm over most of its face, so that band is never empty). Measured on all 94 release STLs
    as authored: front/back from 1.34 to 9.4; a drawer turned round about Z gives at most 0.75;
  - on the 1H and 1.5H sizes, the right-hand side is on +x: those drawers carry a 56 mm2 recess
    0.05 to 0.45 mm into the right wall's outer face (4.8 to 22.4 mm above the underside) and
    nothing in the mirror band on the left (measured on all 94, 2026-10-19). A MIRROR IN X IS
    NOT DETECTED ON THE OTHER HEIGHTS: the 05H drawers are mirror-symmetric to the vertex and
    the 2H and 3H carry near-equal features on both walls, so there is nothing to pin. For the
    2026-10-19 run the comparison against the July GLBs (every July vertex found in the new
    mesh within 0.05 mm) is what rules a mirror out; a later run must repeat it.
"""

import bpy, bmesh, os, sys
from mathutils import Matrix, Vector

_a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(_a) < 2:
    sys.exit("usage: blender -b --python build_decor_drawer_blend.py -- <out.blend> <stl-root> [version]")
dst, ROOT = _a[0], _a[1].rstrip("\\/")
VERSION = _a[2] if len(_a) > 2 else "v2609"
if not os.path.isdir(ROOT):
    sys.exit("stl root not found: %r" % ROOT)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.unit_settings.system = 'METRIC'
sc.unit_settings.scale_length = 0.001
LENGTHS = (59, 115, 165, 185, 240, 270)
HEIGHT_MM = {"05H": 22.0, "1H": 50.0, "15H": 78.0, "2H": 106.0, "3H": 162.0}
TOL = 0.05


def sizes(L):
    """(W, H) pairs the release carries for a Collection."""
    if L == 59:
        return [(w, h) for w in (1, 2) for h in ("05H", "1H")]
    out = []
    for w in (1, 2, 3, 4):
        for h in ("05H", "1H", "15H", "2H", "3H"):
            if h == "3H" and w >= 3:
                continue
            out.append((w, h))
    return out


def span_of(bm):
    xs = [v.co.x for v in bm.verts]; ys = [v.co.y for v in bm.verts]; zs = [v.co.z for v in bm.verts]
    return (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))


CUT_OUT = 0.001     # the cut planes sit this far outside the envelope (see the docstring)
FLANGE_Z = 1.5      # the bed flange lives in the bottom 1.5 mm (measured: 1.2 mm tall)
FLANGE_OUT = 4.0    # and reaches at most this far beyond the envelope (measured: 3.4 side, 2.8 back)


def boundary_edges(bm):
    return [e for e in bm.edges if len(e.link_faces) == 1]


def flange_only(bm, xlo, xhi, yhi, zmin):
    """What lies outside the envelope must be the known bed flange: in the bottom FLANGE_Z mm and at most
    FLANGE_OUT beyond the planes. Returns a problem string, or None."""
    worst_z, worst_out = zmin, 0.0
    for v in bm.verts:
        out = max(xlo - v.co.x, v.co.x - xhi, v.co.y - yhi)
        if out > TOL:
            worst_z = max(worst_z, v.co.z); worst_out = max(worst_out, out)
    if worst_z > zmin + FLANGE_Z or worst_out > FLANGE_OUT:
        return ("geometry outside the standard envelope reaches %.2f mm above the underside and %.2f mm beyond it; "
                "the bed flange is within %.1f and %.1f (a different oversize, or the wrong size?)"
                % (worst_z - zmin, worst_out, FLANGE_Z, FLANGE_OUT))
    return None


def cut_outside(bm, xlo, xhi, yhi):
    """Remove everything beyond the two side planes and the back plane; cap each cut with the loops it
    opened, and only those. Returns (capped area per cut in mm2, the cut planes as (axis, value))."""
    caps, planes = [], []
    for axis, val, sign in ((0, xhi + CUT_OUT, 1), (0, xlo - CUT_OUT, -1), (1, yhi + CUT_OUT, 1)):
        no = Vector((0, 0, 0)); no[axis] = sign
        co = Vector((0, 0, 0)); co[axis] = val
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=co, plane_no=no,
                               clear_outer=True, clear_inner=False)
        rim = [e for e in boundary_edges(bm) if all(abs(v.co[axis] - val) < 1e-4 for v in e.verts)]
        stray = len(boundary_edges(bm)) - len(rim)
        if stray:
            sys.exit("CUT: %d boundary edges off the cut plane (axis %d at %.3f): a hole the cut did not make"
                     % (stray, axis, val))
        if rim:
            r = bmesh.ops.edgenet_fill(bm, edges=rim, sides=0)
            caps.append(round(sum(f.calc_area() for f in r["faces"]), 2))
        else:
            caps.append(0.0)
        planes.append((axis, val))
    return caps, planes


def drop_slivers(bm, planes, min_area=1.0):
    """Delete closed shells smaller than min_area mm2 that lie wholly in the micron band between a cut plane
    and the wall it sits beside (what the cut leaves where the flange's chamfer met the wall). Any other
    small shell is left alone. Returns how many were dropped."""
    parent = list(range(len(bm.faces)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]; a = parent[a]
        return a
    bm.faces.ensure_lookup_table(); bm.faces.index_update()   # the cut and the fill leave face indices stale
    for v in bm.verts:
        fs = v.link_faces
        for f in fs[1:]:
            ra, rb = find(fs[0].index), find(f.index)
            if ra != rb:
                parent[ra] = rb
    area, members = {}, {}
    for f in bm.faces:
        r = find(f.index)
        area[r] = area.get(r, 0.0) + f.calc_area()
        members.setdefault(r, []).append(f)
    def in_band(fs):
        for axis, val in planes:
            if all(abs(v.co[axis] - val) <= CUT_OUT + 1e-4 for f in fs for v in f.verts):
                return True
        return False
    small = [r for r in members if area[r] < min_area and in_band(members[r])]
    doomed = [f for r in small for f in members[r]]
    if doomed:
        bmesh.ops.delete(bm, geom=doomed, context='FACES')
    return len(small)


def face_stats(me):
    out = []
    for p in me.polygons:
        c = p.center
        out.append((p.area, c.x, c.y, c.z, p.normal.copy()))
    return out


report = []


def add(stl, name, col, L, W_, H_, gx, gy):
    if not os.path.isfile(stl):
        sys.exit("missing source STL: %s" % stl)
    before = set(bpy.data.objects)
    bpy.ops.wm.stl_import(filepath=stl)
    ob = [o for o in bpy.data.objects if o not in before][0]
    me = ob.data
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    tris_in = len(bm.faces)
    want = (88 * W_ - 13, L - 5.7, HEIGHT_MM[H_])
    xmin, xmax, ymin, ymax, zmin, zmax = span_of(bm)
    span_in = (xmax - xmin, ymax - ymin, zmax - zmin)
    cut = False; caps = []; slivers = 0
    if span_in[0] > want[0] + TOL or span_in[1] > want[1] + TOL:
        # the bed flange: symmetric in x, at the back in y (the front plane is the low-y end)
        xc = (xmin + xmax) / 2.0
        xlo, xhi, yhi = xc - want[0] / 2.0, xc + want[0] / 2.0, ymin + want[1]
        problem = flange_only(bm, xlo, xhi, yhi, zmin)
        if problem:
            sys.exit("OVERSIZE: %s - %s" % (name, problem))
        if boundary_edges(bm):
            sys.exit("OPEN: %s has %d boundary edges before any cut" % (name, len(boundary_edges(bm))))
        caps, planes = cut_outside(bm, xlo, xhi, yhi)
        slivers = drop_slivers(bm, planes)
        cut = True
    bmesh.ops.triangulate(bm, faces=bm.faces)
    open_edges = sum(1 for e in bm.edges if len(e.link_faces) % 2 or not e.link_faces)
    xmin, xmax, ymin, ymax, zmin, zmax = span_of(bm)
    span = (xmax - xmin, ymax - ymin, zmax - zmin)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(-(xmin + xmax) / 2, -(ymin + ymax) / 2, -zmin))
    bm.to_mesh(me); bm.free(); me.update()

    st = face_stats(me)
    zs = [v.co.z for v in me.vertices]; ys = [v.co.y for v in me.vertices]
    zmin, zmax, ymin, ymax = min(zs), max(zs), min(ys), max(ys)
    footprint = want[0] * want[1]
    floor = sum(s[0] for s in st if s[4].z < -0.99 and abs(s[3] - zmin) < 0.02)
    rim = sum(s[0] for s in st if s[4].z > 0.99 and abs(s[3] - zmax) < 0.02)
    panel = sum(s[0] for s in st if s[4].y < -0.99 and 2.3 < s[2] - ymin < 3.2)
    panel_mirror = sum(s[0] for s in st if s[4].y > 0.99 and 2.3 < ymax - s[2] < 3.2)
    opening = (want[0] - 21.0) * (want[2] - 6.0)
    xmin_, xmax_ = min(v.co.x for v in me.vertices), max(v.co.x for v in me.vertices)
    right = sum(s[0] for s in st if s[4].x > 0.8 and 0.05 < xmax_ - s[1] < 0.45 and s[3] > zmin + FLANGE_Z)
    left = sum(s[0] for s in st if s[4].x < -0.8 and 0.05 < s[1] - xmin_ < 0.45 and s[3] > zmin + FLANGE_Z)
    problems = []
    if H_ in ("1H", "15H") and (right < 20 or left > 5):
        problems.append("right-wall recess %.0f mm2, its mirror on the left %.0f mm2; a 1H or 1.5H drawer carries "
                        "about 56 on the right and none on the left (mirrored in x?)" % (right, left))
    if any(abs(a - b) > TOL for a, b in zip(span, want)):
        problems.append("span %s, expected %s (width x depth x height%s)"
                        % ([round(v, 2) for v in span], want, "; after the tab cut" if cut else ""))
    if open_edges:
        problems.append("%d edges with an odd number of faces (an open shell%s)"
                        % (open_edges, "; the tab cut left a hole?" if cut else ""))
    if floor < 0.5 * footprint or rim > 0.2 * footprint:
        problems.append("downward area in the bottom plane %.0f mm2 and upward area in the top plane %.0f mm2 "
                        "against a %.0f mm2 footprint (upside down?)" % (floor, rim, footprint))
    if panel < 0.3 * opening or panel < 1.2 * panel_mirror:
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
    report.append((name, tris_in, len(me.polygons), ("tabs cut, caps %s mm2, %d slivers dropped" % (caps, slivers)) if cut else "as released",
                   [round(v, 2) for v in span], round(floor), round(rim), round(panel), round(panel_mirror), round(right), round(left)))


for i, L in enumerate(LENGTHS):
    col = bpy.data.collections.new(f"Decor_{L}")
    sc.collection.children.link(col)
    for j, (w, h) in enumerate(sizes(L)):
        code = f"{L}-{w}W-{h}"
        add(os.path.join(ROOT, str(L), "STL", f"Decor Drawer {code} - {VERSION}.stl"),
            f"Decor Drawer {code}", col, L, w, h, j * 420.0, i * 320.0)

EXPECTED = sum(len(sizes(L)) for L in LENGTHS)
if len(report) != EXPECTED or len(sc.objects) != EXPECTED:
    sys.exit("expected %d drawers, built %d (%d objects)" % (EXPECTED, len(report), len(sc.objects)))
if os.path.dirname(dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=dst, compress=True)
print("[build] %d drawers, version=%s, tabs cut on %d" % (len(report), VERSION, sum(1 for r in report if r[3].startswith("tabs cut"))))
for r in report:
    print("[build]", r)
