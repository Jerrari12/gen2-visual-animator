"""Derived parts for the Glass Top Coffee Station (240): NOT a Blender job.

Writes, into the parts pool given by --out (the gen2-parts checkout's parts/240), viewer-ready GLBs (uncompressed, like the adhesive foot: in this repo
`.lib.glb` means "viewer-ready", not "meshopt-compressed"):

  GlassTopCover_240-2W / -4W   the printed frame, from Joey's release STLs
  KCupInsert_240-2W / -4W      the printed insert, from Joey's release STLs
  GlassTop_240-2W / -4W        the bought tempered glass board with its four stick-on feet: SIMPLE SHAPES
  KCup                         one coffee pod, a simple shape, shown in the insert for illustration only

and prints the numbers generate.js carries as constants (hole centres, drawer cavity centres).

Frames (the viewer's: +Y up, mm):
  cover   X centred on its width, Y 0 at its underside, and its CLOSED end at Z +120, which is where the
          Cover Lower's closed end is (CL-240-2W raw GLB: the end section 1 mm in is 1352 mm2 at +Z, 390 at -Z).
          The cover is 243 deep against the Cover Lower's 240, so its open end reaches Z -123.
  insert  centred in X and Z, Y 0 at its underside.
  glass   centred in X and Z, Y 0 at the underside of its feet.
  K-cup   centred in X and Z, Y 0 at its base (the narrow end; it hangs in the insert by its rim).

    python "GLB Pipeline/derive_glass_top.py" --src "<folder with the four release STLs>" --out "<gen2-parts>/parts/240"

The glass sizes are the nominal sizes of the two cutting boards on the listing (7 x 10 in and 14 x 10 in,
about 3 mm thick, Joey 2026-11-25). Replace GLASS with his measured sizes when he sends them.
"""
import argparse, json, os, sys
import numpy as np
import trimesh
from shapely.geometry import Polygon

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = None   # set from --out
IN = 25.4
GLASS = {'2W': (7 * IN, 10 * IN, 3.0), '4W': (14 * IN, 10 * IN, 3.0)}   # width X, depth Z, thickness
FOOT_D, FOOT_H, FOOT_INSET = 10.0, 2.5, 14.0
ROT_Z_UP_TO_Y_UP = trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0])   # STL z-up -> viewer y-up


def y_up(m):
    """An STL (Z up) into the viewer's frame (Y up): x stays, z -> y, y -> -z."""
    m = m.copy(); m.apply_transform(ROT_Z_UP_TO_Y_UP); return m


def centre(m, y0=True):
    b = m.bounds; t = [-(b[0][0] + b[1][0]) / 2, -b[0][1] if y0 else 0, -(b[0][2] + b[1][2]) / 2]
    m.apply_translation(t); return m


def depth_to_z(m, depth):
    """Turn the part about Y so the extent that equals `depth` lies on Z."""
    e = m.extents
    if abs(e[2] - depth) < 0.6: return m
    assert abs(e[0] - depth) < 0.6, (e, depth)
    m.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0])); return m


def end_area(m, z):
    sec = m.section(plane_origin=[0, 0, z], plane_normal=[0, 0, 1])
    return sum(p.area for p in sec.to_2D()[0].polygons_full)


def cover(src, w):
    m = centre(depth_to_z(y_up(trimesh.load(os.path.join(src, f'Glass Top Cover 240-{w}.stl'))), 243.0))
    lo, hi = m.bounds[0][2], m.bounds[1][2]
    a_lo, a_hi = end_area(m, lo + 1.0), end_area(m, hi - 1.0)
    if a_lo > a_hi:   # closed end must face +Z
        m.apply_transform(trimesh.transformations.rotation_matrix(np.pi, [0, 1, 0]))
    m = centre(m); m.apply_translation([0, 0, 120.0 - m.bounds[1][2]])
    assert m.is_watertight, w
    return m


def insert(src, w):
    """The insert prints with its holed plate on the bed and is used the other way up: plate on top, ribs down."""
    m = centre(depth_to_z(y_up(trimesh.load(os.path.join(src, f'K-cup Insert 240-{w}.stl'))), 225.2))
    # hole centres, from the outline 1 mm into the plate (the plate is the first 2 mm of the print)
    sec = m.section(plane_origin=[0, 1.0, 0], plane_normal=[0, 1, 0])
    planar, T = sec.to_2D()
    holes = []
    for poly in planar.polygons_full:
        for ring in poly.interiors:
            c = ring.centroid.coords[0]; r = np.sqrt(abs(Polygon(ring).area) / np.pi)
            q = trimesh.transformations.transform_points([[c[0], c[1], 0]], T)[0]
            holes.append((round(float(-q[0]), 1), round(float(q[2]), 1), round(float(r), 1)))   # -x: the flip below
    holes.sort(key=lambda h: (round(h[1] / 5), h[0]))
    m.apply_transform(trimesh.transformations.rotation_matrix(np.pi, [0, 0, 1]))   # plate up
    return centre(m), holes


def glass(w):
    gx, gz, t = GLASS[w]
    slab = trimesh.creation.box(extents=[gx, t, gz]); slab.apply_translation([0, FOOT_H + t / 2, 0])
    feet = []
    for sx in (-1, 1):
        for sz in (-1, 1):
            f = trimesh.creation.cylinder(radius=FOOT_D / 2, height=FOOT_H, sections=24)
            f.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
            f.apply_translation([sx * (gx / 2 - FOOT_INSET), FOOT_H / 2, sz * (gz / 2 - FOOT_INSET)]); feet.append(f)
    return trimesh.util.concatenate([slab] + feet)


def kcup():
    """A pod: 37 mm base, 45 mm under the rim, 44 mm tall, with a 51 mm rim."""
    n = 32; ang = np.linspace(0, 2 * np.pi, n, endpoint=False)
    rings = [(18.5, 0.0), (22.5, 42.0), (25.5, 42.0), (25.5, 44.0)]
    v = [[r * np.cos(a), y, r * np.sin(a)] for r, y in rings for a in ang] + [[0, 0, 0], [0, 44.0, 0]]
    f = []
    for k in range(len(rings) - 1):
        for i in range(n):
            a, b = k * n + i, k * n + (i + 1) % n; c, d = a + n, b + n
            f += [[a, c, b], [b, c, d]]
    bot, top = len(v) - 2, len(v) - 1
    for i in range(n):
        f.append([bot, i, (i + 1) % n]); f.append([top, (len(rings) - 1) * n + (i + 1) % n, (len(rings) - 1) * n + i])
    m = trimesh.Trimesh(vertices=np.array(v), faces=np.array(f), process=True); m.fix_normals()
    return m


def cavity(path):
    """Centre (x, z) and floor height of a drawer's cavity in a raw library GLB, by rays from above."""
    s = trimesh.load(path); m = s.to_geometry() if isinstance(s, trimesh.Scene) else s
    b = m.bounds
    def hit(x, z):
        loc, _, _ = m.ray.intersects_location([[x, b[1][1] + 5, z]], [[0, -1, 0]])
        return max(loc[:, 1]) if len(loc) else None
    floor = hit(0, 0)
    def edge(axis, sign):
        lo, hi = 0.0, (b[1][axis] if sign > 0 else -b[0][axis])
        for _ in range(40):
            mid = (lo + hi) / 2; p = [0, 0]; p[0 if axis == 0 else 1] = sign * mid
            h = hit(p[0], p[1])
            if h is not None and h < floor + 1.0: lo = mid
            else: hi = mid
        return sign * lo
    x0, x1, z0, z1 = edge(0, -1), edge(0, 1), edge(2, -1), edge(2, 1)
    return {'cx': round((x0 + x1) / 2, 2), 'cz': round((z0 + z1) / 2, 2), 'floor': round(float(floor), 2),
            'w': round(x1 - x0, 2), 'd': round(z1 - z0, 2)}


def write(m, name):
    """Split the vertices at hard edges and write NORMALS: the viewer shades from them and computes none itself
    (a position-only GLB renders black), exactly as the Blender exports carry auto-smoothed normals."""
    m = trimesh.graph.smooth_shade(m, angle=np.radians(30))
    m.visual = trimesh.visual.ColorVisuals(m)
    _ = m.vertex_normals
    p = os.path.join(OUT, name + '.lib.glb')
    with open(p, 'wb') as fh: fh.write(trimesh.exchange.gltf.export_glb(trimesh.Scene({name: m}), include_normals=True))
    print(f'{name}.lib.glb  {os.path.getsize(p):>8} B  faces {len(m.faces):>6}  verts {len(m.vertices):>6}  bounds {np.round(m.bounds, 2).tolist()}')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True, help='folder holding the Glass Top Cover and K-cup Insert release STLs')
    ap.add_argument('--out', required=True, help='the parts pool to write into: <gen2-parts checkout>/parts/240')
    ap.add_argument('--raw', help='GLB Library/240/raw, to measure the drawer cavities (optional)')
    a = ap.parse_args()
    OUT = a.out
    facts = {}
    for w in ('2W', '4W'):
        write(cover(a.src, w), f'GlassTopCover_240-{w}')
        ins, holes = insert(a.src, w); write(ins, f'KCupInsert_240-{w}'); facts[f'holes_{w}'] = holes
        write(glass(w), f'GlassTop_240-{w}')
    write(kcup(), 'KCup')
    if a.raw:
        for fam in ('DecorDrawer', 'ClassicDrawer'):
            for w in ('2W', '4W'):
                facts[f'{fam}_{w}'] = cavity(os.path.join(a.raw, f'{fam}_240-{w}-1H.glb'))
    print(json.dumps(facts, indent=1))
