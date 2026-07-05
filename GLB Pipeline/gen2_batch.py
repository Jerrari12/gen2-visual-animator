r"""
gen2_batch.py  --  GEN2 GLB Pipeline: batch orchestrator
========================================================

Point it at a list of Blender exporter files (jobs.json) and it produces a
folder of small, canonically-origined, viewer-ready GLBs -- in one shot.

Per job it:
  1. launches Blender headless and runs gen2_glb_export.py  -> raw .glb
  2. meshopt-compresses each raw file                       -> .lib.glb  (~80% smaller)
  3. verifies every .lib.glb lands on the canonical origin in WORLD space
     (accounting for KHR_mesh_quantization node transforms)
Then it writes a combined parts_index.csv (manifest-ready) and run_report.json.

------------------------------------------------------------------------------
REQUIREMENTS
  - Blender (auto-detected on Windows, or set "blender_exe" in jobs.json / $BLENDER)
  - Node.js on PATH (for `npx @gltf-transform/cli meshopt`) -- only for compression
  - Python 3.8+

USAGE
  Full run:            python gen2_batch.py                 # uses ./gen2_jobs.json
                       python gen2_batch.py my_jobs.json
  Post-process only:   python gen2_batch.py --post-only "D:\...\GLB Library\185"
                         (skips Blender; compress + verify + index an existing
                          folder that already contains a raw\ subfolder)
------------------------------------------------------------------------------
"""

import os, sys, json, glob, csv, struct, shutil, subprocess, re

HERE = os.path.dirname(os.path.abspath(__file__))
WORKER = os.path.join(HERE, "gen2_glb_export.py")


# ---------------------------------------------------------------------------
# Blender discovery + headless export
# ---------------------------------------------------------------------------
def find_blender(explicit=None):
    if explicit and explicit != "auto":
        return explicit
    if os.environ.get("BLENDER"):
        return os.environ["BLENDER"]
    cands = []
    for pat in (r"C:\Program Files\Blender Foundation\Blender */blender.exe",
                r"C:\Program Files\Blender Foundation\Blender*/blender.exe"):
        cands += glob.glob(pat)
    if cands:
        return sorted(cands)[-1]          # newest installed version
    found = shutil.which("blender")
    return found or "blender"


def run_export(blender_exe, job):
    raw_dir = os.path.join(job["out"], "raw")
    cmd = [
        blender_exe, "--background", job["blend"],
        "--python", WORKER, "--",
        "--out", raw_dir,
        "--select", job.get("select", "all"),
        "--code-regex", job.get("code_regex", ""),
        "--name-template", job.get("name_template", "{name}"),
        "--depth-mode", job.get("depth_mode", "center"),
        "--drop-islands-max-verts", str(job.get("drop_islands_max_verts", 0)),
        "--drop-islands-max-thick", str(job.get("drop_islands_max_thick", 2.0)),
    ]
    print(f"  [blender] {os.path.basename(job['blend'])} -> {raw_dir}")
    subprocess.run(cmd, check=True)
    return raw_dir


# ---------------------------------------------------------------------------
# meshopt compression
# ---------------------------------------------------------------------------
def _run(cmd):
    if os.name == "nt":
        return subprocess.run(subprocess.list2cmdline(cmd), shell=True,
                              capture_output=True, text=True)
    return subprocess.run(cmd, capture_output=True, text=True)


def have_npx():
    return shutil.which("npx") or shutil.which("npx.cmd")


def compress(raw_path, lib_path):
    npx = have_npx()
    if not npx:
        raise RuntimeError("npx not found -- install Node.js to enable meshopt compression")
    r = _run([npx, "--yes", "@gltf-transform/cli", "meshopt", raw_path, lib_path])
    if r.returncode != 0:
        raise RuntimeError(f"meshopt failed for {os.path.basename(raw_path)}:\n{r.stderr[-400:]}")


# ---------------------------------------------------------------------------
# GLB parsing + canonical-origin verification (quantization-aware)
# ---------------------------------------------------------------------------
def glb_json(path):
    d = open(path, "rb").read()
    length = struct.unpack("<III", d[:12])[2]
    off = 12
    while off < length:
        clen, ctype = struct.unpack("<II", d[off:off + 8]); off += 8
        chunk = d[off:off + clen]; off += clen
        if ctype == 0x4E4F534A:                       # 'JSON'
            return json.loads(chunk.decode("utf-8"))
    raise ValueError("no JSON chunk in " + path)


def position_accessor(js):
    prim = js["meshes"][0]["primitives"][0]
    return js["accessors"][prim["attributes"]["POSITION"]], prim


def world_bounds(js):
    """Real-world bounds, applying node TRS and de-normalising quantized ints."""
    n = js["nodes"][0]
    acc, _ = position_accessor(js)
    t = n.get("translation", [0, 0, 0])
    s = n.get("scale", [1, 1, 1])
    div = 32767.0 if (acc.get("normalized") and acc["componentType"] == 5122) else 1.0
    mn = [max(v / div, -1.0) * s[i] + t[i] for i, v in enumerate(acc["min"])]
    mx = [(v / div) * s[i] + t[i] for i, v in enumerate(acc["max"])]
    return mn, mx


def verify_canonical(js, tol=0.15):
    """glTF space: X=width, Y=height, Z=depth. Canonical = X/Z centred, Y bottom=0."""
    mn, mx = world_bounds(js)
    checks = {
        "x_centered": abs(mn[0] + mx[0]) < tol,
        "z_centered": abs(mn[2] + mx[2]) < tol,
        "y_bottom_zero": abs(mn[1]) < tol,
        "y_positive_height": mx[1] > tol,
        "no_materials": not js.get("materials"),
    }
    return all(checks.values()), checks, mn, mx


# ---------------------------------------------------------------------------
# post-process a folder: compress raw -> lib, verify, collect index rows
# ---------------------------------------------------------------------------
CODE_RE = re.compile(r"(\d+)W-(\d+)H")


def post_process(out_dir, do_compress=True):
    raw_dir = os.path.join(out_dir, "raw")
    raws = sorted(glob.glob(os.path.join(raw_dir, "*.glb")))
    rows, problems = [], []
    for raw in raws:
        base = os.path.splitext(os.path.basename(raw))[0]
        lib = os.path.join(out_dir, base + ".lib.glb")

        if do_compress and not os.path.exists(lib):
            compress(raw, lib)
        target = lib if os.path.exists(lib) else raw

        js = glb_json(target)
        ok, checks, mn, mx = verify_canonical(js)
        if not ok:
            problems.append({"file": os.path.basename(target), "checks": checks})

        m = CODE_RE.search(base)
        width_u = m.group(1) if m else ""
        height_code = m.group(2) if m else ""
        rows.append({
            "node": base,
            "width_units": width_u,
            "height_code": height_code,
            "size_x_width": round(mx[0] - mn[0], 2),
            "size_y_height": round(mx[1] - mn[1], 2),
            "size_z_depth": round(mx[2] - mn[2], 2),
            "wbounds_x": f"[{mn[0]:.2f}, {mx[0]:.2f}]",
            "wbounds_y": f"[{mn[1]:.2f}, {mx[1]:.2f}]",
            "wbounds_z": f"[{mn[2]:.2f}, {mx[2]:.2f}]",
            "canonical_ok": ok,
            "raw_bytes": os.path.getsize(raw),
            "lib_bytes": os.path.getsize(lib) if os.path.exists(lib) else "",
            "lib_file": os.path.relpath(lib, out_dir) if os.path.exists(lib) else "",
        })
    return rows, problems


# ---------------------------------------------------------------------------
# index + report writers
# ---------------------------------------------------------------------------
def write_index(rows, path):
    if not rows:
        return
    cols = ["node", "width_units", "height_code", "size_x_width", "size_y_height",
            "size_z_depth", "wbounds_x", "wbounds_y", "wbounds_z", "canonical_ok",
            "raw_bytes", "lib_bytes", "lib_file"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow(r)


def human(n):
    return f"{n/1024:.1f} KB" if isinstance(n, (int, float)) else "-"


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main():
    args = sys.argv[1:]

    # --- post-only mode: no Blender, just compress + verify + index one folder ---
    if args and args[0] == "--post-only":
        out_dir = args[1]
        do_comp = have_npx() is not None
        if not do_comp:
            print("  [warn] npx not found -- verifying raw files only, no compression")
        rows, problems = post_process(out_dir, do_compress=do_comp)
        write_index(rows, os.path.join(out_dir, "parts_index.csv"))
        print_summary({"post_only": out_dir}, rows, problems)
        return 0 if not problems else 2

    # --- full mode ---
    jobs_path = args[0] if args else os.path.join(HERE, "gen2_jobs.json")
    cfg = json.load(open(jobs_path, encoding="utf-8"))
    blender_exe = find_blender(cfg.get("blender_exe"))
    do_comp = cfg.get("compress", True) and have_npx() is not None
    print(f"Blender: {blender_exe}")
    print(f"Compression: {'on' if do_comp else 'OFF (npx missing or disabled)'}\n")

    all_rows, all_problems, out_dirs = [], [], []
    for job in cfg["jobs"]:
        if job.get("skip"):
            print(f"- SKIP  {job.get('name','?')}")
            continue
        print(f"- JOB   {job.get('name','?')}")
        run_export(blender_exe, job)
        rows, problems = post_process(job["out"], do_compress=do_comp)
        write_index(rows, os.path.join(job["out"], "parts_index.csv"))
        all_rows += rows
        all_problems += problems
        if job["out"] not in out_dirs:
            out_dirs.append(job["out"])

    index_path = cfg.get("index", os.path.join(HERE, "parts_index.csv"))
    write_index(all_rows, index_path)
    with open(os.path.join(HERE, "run_report.json"), "w", encoding="utf-8") as f:
        json.dump({"jobs": cfg["jobs"], "parts": all_rows, "problems": all_problems},
                  f, indent=2)
    print_summary({"index": index_path, "out_dirs": out_dirs}, all_rows, all_problems)
    return 0 if not all_problems else 2


def print_summary(where, rows, problems):
    print("\n" + "=" * 64)
    tr = sum(r["raw_bytes"] for r in rows if isinstance(r["raw_bytes"], int))
    tl = sum(r["lib_bytes"] for r in rows if isinstance(r["lib_bytes"], int))
    print(f"Parts processed:   {len(rows)}")
    if tr and tl:
        print(f"Size:              {human(tr)} raw -> {human(tl)} compressed "
              f"({100*(1-tl/tr):.0f}% smaller)")
    print(f"Canonical origin:  {sum(1 for r in rows if r['canonical_ok'])}/{len(rows)} OK")
    if problems:
        print("PROBLEMS:")
        for p in problems:
            print("  -", p["file"], p["checks"])
    else:
        print("PROBLEMS:          none")
    for k, v in where.items():
        print(f"{k}: {v}")
    print("=" * 64)


if __name__ == "__main__":
    sys.exit(main())
# gen2 glb pipeline
