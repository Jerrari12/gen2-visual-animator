#!/usr/bin/env python
"""Derive Adhesive-Foot.lib.glb from the printed Tabletop-Kit-Foot master.

WHY THIS EXISTS
---------------
The GEN2 tabletop feet come two ways: printed in TPU, or bought as adhesive
rubber feet.  Joey confirmed 2026-08-21 that the bought foot has the SAME
external body and the SAME height as the printed one and differs ONLY by not
carrying the upper dovetail rail (the rail is what seats into the case or the
lower foot rail; a stick-on foot has nothing to seat into).

So the adhesive foot is not a new design - it is the printed foot's pad, and
deriving it from the shipped master is more authoritative than redrawing it.
That also means this file is NOT a normal pipeline job: there is no blend and
no `gen2_batch.py` entry.  It is a deterministic transform of one committed
binary into another, re-runnable at any time.

WHAT IT DOES
------------
1. Reads the uncompressed float32 master `GLB Library/Hardware/raw/
   Tabletop-Kit-Foot.glb` (the meshopt `.lib.glb` copies decode to the same
   geometry within 0.0005 mm, but the master needs no decoder).
2. Finds the rail-base plane EMPIRICALLY - the second-lowest distinct vertex
   Y - rather than hardcoding it, so a re-export with a nudged rail still
   derives correctly.  (`test/adhesive-foot.test.mjs` is what notices that the
   number moved and orders a re-derivation; the script itself just follows the
   geometry.)
3. Keeps every triangle at or below that plane - measured: 12 faces, being the
   2 bottom triangles and 10 side-wall triangles.  ZERO triangles cross the
   plane, because the mesh already carries a complete edge loop there.
4. Caps the resulting open rim.  ! The rim is a SIX-vertex loop, not four: the
   four pad corners PLUS two extra collinear points at (-10.3, -1.0) and
   (-10.3, +1.0) left over from the rail's slot notch.  A corner-only quad cap
   would leave T-junctions, so the cap is a 4-triangle fan whose apex is chosen
   to avoid every collinear run (see pick_fan_apex).
   The master's own coplanar patch is deliberately NOT reused: it is two
   disconnected components (a 15-triangle outer patch plus a free-floating
   2-triangle island inside the slot) and it lets rail material through, so it
   is not a clean cap.
5. Writes flat-shaded, watertight, outward-wound geometry with per-face
   duplicated render vertices (48 verts / 16 triangles).  Sharing the 10 welded
   vertices would smooth the cap-to-wall crease - the pad's edges are hard.
6. Verifies the result before writing: closed oriented 2-manifold, Euler 2,
   every directed edge used exactly once, positive signed volume, no degenerate
   triangle, cap exactly +Y and bottom exactly -Y, and the expected bounds.

OUTPUT IS UNCOMPRESSED, DELIBERATELY.  Every other `.lib.glb` in this repo is
meshopt-compressed, but at 16 triangles the compressed container's own overhead
exceeds the payload - the uncompressed file measures smaller than a compressed
one would, and it drops the `EXT_meshopt_compression` requirement entirely.
`.lib.glb` here means "viewer-ready GLB", not "meshopt".  See GLB Pipeline/
README.md.

USAGE
-----
    python "GLB Pipeline/derive_adhesive_foot.py"            # write + verify
    python "GLB Pipeline/derive_adhesive_foot.py" --check    # verify only

Run from the repo root (or anywhere - paths resolve relative to this file).
"""

from __future__ import annotations

import json
import shutil
import struct
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MASTER = REPO / "GLB Library" / "Hardware" / "raw" / "Tabletop-Kit-Foot.glb"
LIBRARY_OUT = REPO / "GLB Library" / "Hardware" / "Adhesive-Foot.lib.glb"
# every collection pool a generated build can load from; 59 is hanging-only and
# never emits feet, but the printed foot ships there too and the pools are kept
# symmetrical on purpose.
POOLS = [REPO / "viewer" / "parts" / c for c in ("59", "115", "165", "185", "240", "270")]

NODE_NAME = "Adhesive-Foot"
EPS = 1e-4          # mm - plane membership; the master's planes are ~0.45 mm apart
AREA_EPS = 1e-6     # mm^2 - degenerate-triangle floor


# ---------------------------------------------------------------- GLB reading

def read_glb(path: Path):
    """Return (gltf_json, bin_chunk) from a binary glTF."""
    data = path.read_bytes()
    magic, version, _total = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67:
        raise SystemExit(f"{path} is not a GLB (bad magic)")
    if version != 2:
        raise SystemExit(f"{path} is glTF {version}, expected 2")
    off, js, bin_chunk = 12, None, b""
    while off < len(data):
        clen, ctype = struct.unpack_from("<II", data, off)
        body = data[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(body.decode("utf-8"))
        elif ctype == 0x004E4942:
            bin_chunk = body
        off += 8 + clen + ((4 - clen % 4) % 4 if clen % 4 else 0)
    if js is None:
        raise SystemExit(f"{path} has no JSON chunk")
    return js, bin_chunk


def read_accessor(gltf, blob, index):
    """Read a float32 VEC3 or scalar-index accessor into a python list."""
    acc = gltf["accessors"][index]
    if acc.get("sparse"):
        raise SystemExit("sparse accessors are not supported here")
    bv = gltf["bufferViews"][acc["bufferView"]]
    if "EXT_meshopt_compression" in (bv.get("extensions") or {}):
        raise SystemExit(
            "this accessor is meshopt-compressed - point the script at the "
            "uncompressed master under GLB Library/Hardware/raw/"
        )
    base = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    ncomp = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[acc["type"]]
    fmt, size = {
        5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2),
        5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4),
    }[acc["componentType"]]
    stride = bv.get("byteStride") or (size * ncomp)
    out = []
    for i in range(acc["count"]):
        vals = struct.unpack_from("<" + fmt * ncomp, blob, base + i * stride)
        out.append(vals[0] if ncomp == 1 else list(vals))
    return out


def load_master():
    gltf, blob = read_glb(MASTER)
    nodes = gltf.get("nodes") or []
    if len(nodes) != 1:
        raise SystemExit(f"expected exactly 1 node in the master, found {len(nodes)}")
    node = nodes[0]
    for key in ("translation", "rotation", "scale", "matrix"):
        if key in node:
            raise SystemExit(
                f"the master node carries a {key} - this script assumes an "
                "identity transform so raw coordinates ARE world coordinates"
            )
    mesh = gltf["meshes"][node["mesh"]]
    if len(mesh["primitives"]) != 1:
        raise SystemExit("expected exactly 1 primitive in the master")
    prim = mesh["primitives"][0]
    if prim.get("mode", 4) != 4:
        raise SystemExit("expected TRIANGLES")
    pos = read_accessor(gltf, blob, prim["attributes"]["POSITION"])
    idx = read_accessor(gltf, blob, prim["indices"])
    tris = [tuple(idx[i:i + 3]) for i in range(0, len(idx), 3)]
    return pos, tris


# ------------------------------------------------------------------- geometry

def sub(a, b):
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def norm(a):
    return sum(c * c for c in a) ** 0.5


def tri_normal(p, q, r):
    n = cross(sub(q, p), sub(r, p))
    ln = norm(n)
    return ([0.0, 0.0, 0.0], 0.0) if ln == 0 else ([c / ln for c in n], ln / 2.0)


def key(v, nd=4):
    """Weld key - the master carries 158 render verts for 50 welded positions
    (normal seams), so any topology test has to weld first."""
    return (round(v[0], nd), round(v[1], nd), round(v[2], nd))


def rail_base_plane(pos):
    """The rail base = the second-lowest distinct vertex Y.  Measured on the
    shipped master the six planes are 0 / 7.620003 / 8.073158 / 8.702534 /
    9.887955 / 10.620003, and NOTHING lies between the first two."""
    ys = sorted({round(v[1], 6) for v in pos})
    if len(ys) < 3:
        raise SystemExit(f"expected a layered foot, found Y planes {ys}")
    return ys[1]


def order_rim(edges):
    """Walk the single boundary loop of directed edges into a vertex ring."""
    nxt = {}
    for a, b in edges:
        if a in nxt:
            raise SystemExit("boundary is not a simple loop (branching vertex)")
        nxt[a] = b
    start = edges[0][0]
    loop, cur = [start], nxt[start]
    while cur != start:
        loop.append(cur)
        cur = nxt.get(cur)
        if cur is None:
            raise SystemExit("boundary loop does not close")
        if len(loop) > len(edges):
            raise SystemExit("boundary loop does not terminate")
    if len(loop) != len(edges):
        raise SystemExit(f"boundary has {len(edges)} edges but the loop visited {len(loop)}")
    return loop


def pick_fan_apex(ring, verts):
    """Choose the fan apex that maximises the SMALLEST triangle it produces.

    The rim is convex (a square with two extra collinear points on one edge), so
    a fan from any vertex tiles it - but a fan rooted ON the collinear run emits
    a zero-area triangle, and dropping that triangle would leave two rim edges
    uncovered and the mesh open.  Maximising the minimum area picks a true
    corner away from every collinear run, and the assertion below proves it.
    """
    best, best_score = None, -1.0
    for i in range(len(ring)):
        areas = []
        for j in range(1, len(ring) - 1):
            a = verts[ring[i]]
            b = verts[ring[(i + j) % len(ring)]]
            c = verts[ring[(i + j + 1) % len(ring)]]
            areas.append(tri_normal(a, b, c)[1])
        score = min(areas)
        if score > best_score:
            best, best_score = i, score
    if best_score <= AREA_EPS:
        raise SystemExit("no fan apex avoids a degenerate triangle - rim is not convex?")
    return best


def derive():
    pos, tris = load_master()
    cut = rail_base_plane(pos)

    kept = [t for t in tris if all(pos[i][1] <= cut + EPS for i in t)]
    crossing = [t for t in tris
                if any(pos[i][1] < cut - EPS for i in t) and any(pos[i][1] > cut + EPS for i in t)]
    if crossing:
        raise SystemExit(f"{len(crossing)} triangles cross the rail-base plane - "
                         "the master's geometry changed and this derivation is no longer a clean cut")
    coplanar = [t for t in kept if all(abs(pos[i][1] - cut) <= EPS for i in t)]
    shell = [t for t in kept if t not in coplanar]

    # weld the shell so the open rim can be found
    wmap, wverts = {}, []
    def widx(v):
        k = key(v)
        if k not in wmap:
            wmap[k] = len(wverts)
            wverts.append([float(v[0]), float(v[1]), float(v[2])])
        return wmap[k]

    wtris = [tuple(widx(pos[i]) for i in t) for t in shell]
    wtris = [t for t in wtris if len(set(t)) == 3]

    # boundary = directed edges with no opposite twin
    seen = {}
    for a, b, c in wtris:
        for e in ((a, b), (b, c), (c, a)):
            seen[e] = seen.get(e, 0) + 1
    boundary = [e for e, n in seen.items() if seen.get((e[1], e[0]), 0) == 0]
    if any(n > 1 for n in seen.values()):
        raise SystemExit("shell has a repeated directed edge - non-manifold input")

    ring = order_rim(boundary)
    for i in ring:
        if abs(wverts[i][1] - cut) > EPS:
            raise SystemExit(f"rim vertex {wverts[i]} is not on the cut plane")

    # cap it.  The boundary of the shell runs one way, so the cap triangles must
    # run the OTHER way to close the surface consistently.
    apex = pick_fan_apex(ring, wverts)
    cap = []
    n = len(ring)
    for j in range(1, n - 1):
        cap.append((ring[apex], ring[(apex + j + 1) % n], ring[(apex + j) % n]))

    faces = wtris + cap

    # ---- verify BEFORE writing ------------------------------------------
    directed = {}
    for a, b, c in faces:
        for e in ((a, b), (b, c), (c, a)):
            directed[e] = directed.get(e, 0) + 1
    bad = [e for e, n_ in directed.items() if n_ != 1]
    if bad:
        raise SystemExit(f"{len(bad)} directed edges used more than once - orientation is inconsistent")
    missing = [e for e in directed if (e[1], e[0]) not in directed]
    if missing:
        raise SystemExit(f"{len(missing)} edges have no opposite twin - the surface is open")

    undirected = {tuple(sorted(e)) for e in directed}
    V, E, F = len(wverts), len(undirected), len(faces)
    if V - E + F != 2:
        raise SystemExit(f"Euler characteristic is {V - E + F}, expected 2 (V={V} E={E} F={F})")

    vol = 0.0
    for a, b, c in faces:
        p, q, r = wverts[a], wverts[b], wverts[c]
        vol += dot(p, cross(q, r)) / 6.0
    if vol <= 0:
        raise SystemExit(f"signed volume is {vol:.4f} - winding is inside-out")

    for a, b, c in faces:
        nrm, area = tri_normal(wverts[a], wverts[b], wverts[c])
        if area <= AREA_EPS:
            raise SystemExit(f"degenerate triangle {(a, b, c)} area {area}")

    caps = [tri_normal(wverts[a], wverts[b], wverts[c])[0] for a, b, c in cap]
    if not all(nz[1] > 0.999 for nz in caps):
        raise SystemExit(f"cap normals are not +Y: {caps}")
    bottoms = [tri_normal(wverts[a], wverts[b], wverts[c])[0]
               for a, b, c in wtris
               if all(abs(wverts[i][1]) <= EPS for i in (a, b, c))]
    if not bottoms or not all(nz[1] < -0.999 for nz in bottoms):
        raise SystemExit(f"bottom normals are not -Y: {bottoms}")

    return wverts, faces, cap, cut, vol, len(coplanar)


# ---------------------------------------------------------------- GLB writing

def write_glb(path: Path, wverts, faces):
    """Flat-shaded, per-face duplicated render vertices (no shared normals)."""
    pos_f, nrm_f, idx = [], [], []
    for a, b, c in faces:
        p, q, r = wverts[a], wverts[b], wverts[c]
        nrm, _ = tri_normal(p, q, r)
        for v in (p, q, r):
            idx.append(len(pos_f))
            pos_f.append(v)
            nrm_f.append(nrm)

    pos_bytes = b"".join(struct.pack("<3f", *v) for v in pos_f)
    nrm_bytes = b"".join(struct.pack("<3f", *v) for v in nrm_f)
    idx_bytes = b"".join(struct.pack("<H", i) for i in idx)
    pad = lambda b, n=4: b + b"\x00" * ((n - len(b) % n) % n)
    blob = pad(pos_bytes) + pad(nrm_bytes) + pad(idx_bytes)
    o_pos, o_nrm = 0, len(pad(pos_bytes))
    o_idx = o_nrm + len(pad(nrm_bytes))

    mins = [min(v[i] for v in pos_f) for i in range(3)]
    maxs = [max(v[i] for v in pos_f) for i in range(3)]

    gltf = {
        "asset": {
            "version": "2.0",
            "generator": "GEN2 derive_adhesive_foot.py (derived from Tabletop-Kit-Foot)",
        },
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": NODE_NAME}],
        "meshes": [{
            "name": NODE_NAME,
            "primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2, "mode": 4}],
        }],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": len(pos_f), "type": "VEC3",
             "min": mins, "max": maxs},
            {"bufferView": 1, "componentType": 5126, "count": len(nrm_f), "type": "VEC3"},
            {"bufferView": 2, "componentType": 5123, "count": len(idx), "type": "SCALAR"},
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": o_pos, "byteLength": len(pos_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": o_nrm, "byteLength": len(nrm_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": o_idx, "byteLength": len(idx_bytes), "target": 34963},
        ],
        "buffers": [{"byteLength": len(blob)}],
    }

    js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    js += b" " * ((4 - len(js) % 4) % 4)
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob))
    out += struct.pack("<II", len(js), 0x4E4F534A) + js
    out += struct.pack("<II", len(blob), 0x004E4942) + blob
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(out)
    return len(out), len(pos_f), len(idx) // 3


def main():
    check_only = "--check" in sys.argv
    wverts, faces, cap, cut, vol, n_coplanar = derive()

    xs = [v[0] for v in wverts]
    ys = [v[1] for v in wverts]
    zs = [v[2] for v in wverts]
    print(f"master            : {MASTER.relative_to(REPO)}")
    print(f"rail-base plane   : y = {cut:.6f}   (rail discarded above it)")
    print(f"kept shell        : {len(faces) - len(cap)} triangles"
          f"   (master's own {n_coplanar}-triangle coplanar patch discarded)")
    print(f"cap               : {len(cap)} triangles over a {len(set(i for f in cap for i in f))}-vertex rim")
    print(f"welded topology   : V={len(wverts)} F={len(faces)} chi=2, volume {vol:.4f} mm^3")
    print(f"bounds (mm)       : x {max(xs) - min(xs):.6f}  y {max(ys) - min(ys):.6f}  z {max(zs) - min(zs):.6f}")

    if check_only:
        # ⚠ Verifying the derivation IN MEMORY proves nothing about what shipped:
        # a stale Adhesive-Foot.lib.glb on disk would sail through. Build the
        # bytes and compare them against the library copy AND every pool copy.
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td) / "expected.glb"
            write_glb(tmp, wverts, faces)
            expected = tmp.read_bytes()
        bad = []
        for target in [LIBRARY_OUT] + [p / f"{NODE_NAME}.lib.glb" for p in POOLS if p.exists()]:
            if not target.exists():
                bad.append(f"MISSING  {target.relative_to(REPO)}")
            elif target.read_bytes() != expected:
                bad.append(f"STALE    {target.relative_to(REPO)}  "
                           f"({target.stat().st_size} bytes on disk vs {len(expected)} expected)")
        if bad:
            print("\n--check FAILED - re-run without --check to regenerate:")
            for b in bad:
                print("  " + b)
            raise SystemExit(1)
        print(f"\n--check: derivation verified AND all {1 + len([p for p in POOLS if p.exists()])} "
              f"shipped copies match byte-for-byte ({len(expected)} bytes). Nothing written.")
        return

    size, nverts, ntris = write_glb(LIBRARY_OUT, wverts, faces)
    print(f"\nwrote {LIBRARY_OUT.relative_to(REPO)}"
          f"  ({size} bytes, {nverts} render verts, {ntris} triangles, uncompressed)")
    print(f"      vs the printed master's meshopt copy at "
          f"{(REPO / 'GLB Library' / 'Hardware' / 'Tabletop-Kit-Foot.lib.glb').stat().st_size} bytes")
    for pool in POOLS:
        if not pool.exists():
            print(f"  ! pool missing, skipped: {pool.relative_to(REPO)}")
            continue
        shutil.copyfile(LIBRARY_OUT, pool / f"{NODE_NAME}.lib.glb")
        print(f"  -> {(pool / (NODE_NAME + '.lib.glb')).relative_to(REPO)}")


if __name__ == "__main__":
    main()
