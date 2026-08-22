/* THE RE-EXPORT LAW FOR THE DERIVED ADHESIVE FOOT (2026-08-22).

   `Adhesive-Foot.lib.glb` is not exported from a blend - it is DERIVED from the
   printed `Tabletop-Kit-Foot` by cutting away the upper dovetail rail
   (GLB Pipeline/derive_adhesive_foot.py). Joey confirmed the bought rubber foot
   is exactly that: same external body, same height, no rail (the rail is what
   seats inside the case, and a stick-on foot has nothing to seat into).

   A derived asset has one failure mode nothing else in this repo has: the
   SOURCE can be re-exported and the derivative silently keeps the old geometry.
   Nobody would notice - both files still load, both still look like feet - and
   the published build height would quietly stop matching the printed part.

   So this suite pins BOTH files. The printed foot is fingerprinted (its bytes
   are the thing that must not move without a re-derivation), and the derived
   foot is measured properly: topology, winding, normals, spans, and the
   semantic tie between the two. It reads the SHIPPED artifacts under
   viewer/parts/, never the untracked GLB Library master, because the shipped
   pool copies are what a visitor actually downloads.

   Intentional changes refresh via UPDATE_GOLDEN=1 npm test - but read the
   failure message first: refreshing the golden WITHOUT re-running the
   derivation script is exactly the desync this suite exists to catch. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { worldSpans } from './lib/glb-spans.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GOLDEN_PATH = join(root, 'test', 'golden', 'adhesive-foot.json');
const UPDATE = !!process.env.UPDATE_GOLDEN;
// read from disk, not hardcoded: a NEW collection pool must carry both feet
// or adhesive builds hang on it, and a hardcoded list would not notice
const POOLS = readdirSync(join(root, 'viewer', 'parts'), { withFileTypes: true })
  .filter(d => d.isDirectory()).map(d => d.name);
const pool = (c, node) => join(root, 'viewer', 'parts', c, node + '.lib.glb');
const PRINTED = pool('185', 'Tabletop-Kit-Foot');
const ADHESIVE = pool('185', 'Adhesive-Foot');

const md5 = (f) => createHash('md5').update(readFileSync(f)).digest('hex');
const r6 = (n) => Math.round(n * 1e6) / 1e6;

/* Minimal reader for an UNCOMPRESSED float32 GLB. The derived foot deliberately
   ships uncompressed (16 triangles - the meshopt container's own overhead
   exceeds the payload, and it measures smaller this way), so no decoder is
   needed and this suite can check real vertices rather than accessor min/max. */
function readMesh(file) {
  const buf = readFileSync(file);
  assert.equal(buf.readUInt32LE(0), 0x46546c67, file + ': not a GLB');
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(body.toString('utf8'));
    else if (type === 0x004e4942) bin = body;
    off += 8 + len + (len % 4 ? 4 - (len % 4) : 0);
  }
  assert.ok(json && bin, file + ': missing a chunk');
  const acc = (i, comps) => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
    assert.ok(!(bv.extensions && bv.extensions.EXT_meshopt_compression),
      file + ': accessor is meshopt-compressed - this suite reads the uncompressed derived asset');
    const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const out = [];
    for (let i2 = 0; i2 < a.count; i2++) {
      if (comps === 1) out.push(a.componentType === 5125 ? bin.readUInt32LE(base + i2 * 4) : bin.readUInt16LE(base + i2 * 2));
      else out.push([0, 1, 2].map(k => bin.readFloatLE(base + i2 * 12 + k * 4)));
    }
    return out;
  };
  const prim = json.meshes[0].primitives[0];
  return {
    json,
    name: json.nodes[0].name,
    pos: acc(prim.attributes.POSITION, 3),
    nrm: acc(prim.attributes.NORMAL, 3),
    idx: acc(prim.indices, 1),
  };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const wkey = (v) => v.map(c => c.toFixed(4)).join(',');

test('both feet ship in every collection pool, byte-identical across pools', () => {
  for (const node of ['Tabletop-Kit-Foot', 'Adhesive-Foot']) {
    const hashes = new Map();
    for (const c of POOLS) {
      const f = pool(c, node);
      assert.ok(existsSync(f), `viewer/parts/${c}/${node}.lib.glb is missing`);
      hashes.set(c, md5(f));
    }
    assert.equal(new Set(hashes.values()).size, 1,
      `${node}.lib.glb differs between pools: ${[...hashes].map(([c, h]) => c + '=' + h.slice(0, 8)).join(' ')}`);
  }
});

test('the derived foot is a closed, outward-wound, flat-shaded solid', () => {
  const m = readMesh(ADHESIVE);
  assert.equal(m.name, 'Adhesive-Foot');
  assert.equal(m.idx.length % 3, 0);
  const tris = [];
  for (let i = 0; i < m.idx.length; i += 3) tris.push([m.idx[i], m.idx[i + 1], m.idx[i + 2]]);
  assert.equal(tris.length, 16, '12 shell triangles + a 4-triangle cap over the six-vertex rim');

  // --- welded topology: closed, oriented 2-manifold -------------------------
  const wid = new Map(), wpos = [];
  const w = (i) => { const k = wkey(m.pos[i]); if (!wid.has(k)) { wid.set(k, wpos.length); wpos.push(m.pos[i]); } return wid.get(k); };
  const wt = tris.map(t => t.map(w));
  assert.equal(wpos.length, 10, 'four bottom corners + a six-vertex top rim');
  const directed = new Map();
  for (const [a, b, c] of wt) for (const e of [[a, b], [b, c], [c, a]]) {
    const k = e.join('>');
    directed.set(k, (directed.get(k) || 0) + 1);
  }
  for (const [k, n] of directed) {
    assert.equal(n, 1, `directed edge ${k} used ${n} times - orientation is inconsistent`);
    const [a, b] = k.split('>');
    assert.ok(directed.has(b + '>' + a), `edge ${k} has no opposite twin - the surface is open`);
  }
  const undirected = new Set([...directed.keys()].map(k => k.split('>').map(Number).sort((x, y) => x - y).join('-')));
  assert.equal(wpos.length - undirected.size + wt.length, 2, 'Euler characteristic must be 2');

  // --- winding + shading ----------------------------------------------------
  let vol = 0;
  for (const [a, b, c] of wt) vol += dot(wpos[a], cross(wpos[b], wpos[c])) / 6;
  assert.ok(vol > 0, `signed volume ${vol.toFixed(3)} - the solid is wound inside-out`);
  assert.ok(Math.abs(vol - 2634.98) < 0.5, `volume ${vol.toFixed(3)} mm^3 - expected the printed foot's pad frustum`);

  let capped = 0, bottomed = 0;
  for (const t of tris) {
    const p = t.map(i => m.pos[i]);
    const n = cross(sub(p[1], p[0]), sub(p[2], p[0]));
    const a = len(n) / 2;
    assert.ok(a > 1e-6, 'degenerate triangle in the derived mesh');
    const unit = n.map(c => c / len(n));
    // flat shading: every vertex normal equals its own face normal
    for (const i of t) assert.ok(len(sub(m.nrm[i], unit)) < 1e-5,
      'vertex normals are not per-face - the cap-to-wall crease would render smooth');
    if (unit[1] > 0.999) { capped++; assert.ok(p.every(v => Math.abs(v[1] - p[0][1]) < 1e-4), 'cap is not planar'); }
    if (unit[1] < -0.999) bottomed++;
  }
  assert.equal(capped, 4, 'exactly four +Y cap triangles');
  assert.equal(bottomed, 2, 'exactly two -Y bottom triangles');
});

test('the derived foot is the printed foot minus its rail - same footprint, shorter', () => {
  const printed = worldSpans(PRINTED);   // [x, y, z], read from the JSON chunk
  const adhesive = worldSpans(ADHESIVE);
  // the pad keeps the printed foot's FULL footprint: the rail sat on top of it
  assert.ok(Math.abs(adhesive[0] - printed[0]) < 0.01, `X span ${adhesive[0]} vs printed ${printed[0]}`);
  assert.ok(Math.abs(adhesive[2] - printed[2]) < 0.01, `Z span ${adhesive[2]} vs printed ${printed[2]}`);
  // and loses exactly the rail's height
  const rail = printed[1] - adhesive[1];
  assert.ok(Math.abs(rail - 3.0) < 0.01,
    `the discarded rail measures ${rail.toFixed(4)} mm, expected 3.00 - re-run GLB Pipeline/derive_adhesive_foot.py`);
});

test('the shipped feet match the golden (UPDATE_GOLDEN=1 to refresh)', () => {
  const actual = {
    _: 'Fingerprint of the printed foot and its DERIVED adhesive variant. If the ' +
       'printed row changed, the source was re-exported: re-run ' +
       '"python GLB Pipeline/derive_adhesive_foot.py" BEFORE refreshing this golden, ' +
       'or the adhesive foot silently keeps the old geometry.',
    printed: { md5: md5(PRINTED), spans: worldSpans(PRINTED).map(r6) },
    adhesive: { md5: md5(ADHESIVE), spans: worldSpans(ADHESIVE).map(r6) },
  };
  const prior = existsSync(GOLDEN_PATH) ? JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) : null;
  if (UPDATE) {
    // ⚠ THE REFRESH MUST NOT BE ABLE TO LAUNDER A STALE DERIVATIVE. Blindly
    // rewriting both rows is exactly how the desync this suite exists to catch
    // would get blessed: re-export the printed foot, skip the re-derivation, run
    // the repo's routine UPDATE_GOLDEN=1 npm test, and the stale pairing becomes
    // the new law. If the printed foot moved and the derived one did NOT, the
    // derivation was not re-run - refuse.
    if (prior && prior.printed.md5 !== actual.printed.md5 && prior.adhesive.md5 === actual.adhesive.md5) {
      assert.fail(
        'REFUSING TO REFRESH: the printed foot changed but Adhesive-Foot did not, so it is\n' +
        'still derived from the OLD geometry. Run this first:\n' +
        '  python "GLB Pipeline/derive_adhesive_foot.py"\n' +
        'then re-check the printed foot\'s plate pose by eye, then UPDATE_GOLDEN=1 npm test again.');
    }
    writeFileSync(GOLDEN_PATH, JSON.stringify(actual, null, 2) + '\n');
    return;
  }
  assert.ok(prior, 'missing golden - create it with UPDATE_GOLDEN=1 npm test');
  const golden = prior;
  if (golden.printed.md5 !== actual.printed.md5) {
    assert.fail(
      'THE PRINTED FOOT GLB CHANGED (' + golden.printed.md5.slice(0, 8) + ' -> ' + actual.printed.md5.slice(0, 8) + ').\n' +
      'Adhesive-Foot.lib.glb is DERIVED from it and is now stale. Before anything else:\n' +
      '  python "GLB Pipeline/derive_adhesive_foot.py"\n' +
      'then re-check the printed foot\'s plate pose by eye, then UPDATE_GOLDEN=1 npm test.');
  }
  assert.deepEqual(actual, golden,
    'the shipped feet no longer match the golden - if this is intentional, refresh with UPDATE_GOLDEN=1 npm test');
});
