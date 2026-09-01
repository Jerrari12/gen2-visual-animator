/* Plate-pose manifest exporter - the PLATE_POSE-to-data promotion.
   Contract: Filament Lab docs/PLATE-POSE-MANIFEST-HANDOFF.md (2026-08-31);
   validator src/profile/poseManifest.ts on their side. This writes down what
   the resolver already knows, once, in a file - it does not change how poses
   are decided, stored or applied.

   Everything here is read from the SAME machinery the tests trust:
   - rotations come from resolvePartPreview(slug, {plate:true}) - the exact
     numbers the plate view applies, never re-derived from PLATE_POSE;
   - geometry comes from test/lib/glb-spans.mjs (accessor min/max through
     composed node transforms - the house formula);
   - the GLB identity is the file the viewer actually loads,
     viewer/parts/<collection>/<node>.lib.glb, hashed byte-for-byte.

   Honesty rules, from the handoff:
   - rotation [] is a CONFIRMATION (as authored), never a placeholder - only
     confirmed platePreview slugs are exported at all;
   - bedOffsetAlongBuildAxis is emitted ONLY because the plate view really
     seats the part (seatOnPlate lifts the job to bbox.min.y = 0); it is the
     min projection of the asset-space geometry onto the build axis, exact
     because every confirmed pose is a 90-degree multiple (asserted below);
   - no layer height, fill angle, seam or sheet finish - the pose does not
     establish them;
   - a part the contract cannot carry honestly is SKIPPED and reported, never
     flattened (the chiral QuickLock pair: two rotations in one physical
     print; the stopper pair: one print, two asset files, singular asset
     identity in the contract).

   Usage: node tools/export-plate-poses.mjs [--pilot] [--out <file>]
     --pilot  the four-entry handoff fixture set only */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { resolvePartPreview } from '../viewer/js/generate.js';
import { worldExtents, worldSpans, glbJson, mat4FromTRS } from '../test/lib/glb-spans.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const PILOT = args.includes('--pilot');
const outFlag = args.indexOf('--out');
const OUT = outFlag > -1 ? args[outFlag + 1] : join(root, 'data', 'plate-poses.json');

/* The handoff's suggested pilot: one as-authored case, one flipped rail, one
   back-printed cover, one wall bracket - every distinct pose shape. */
const PILOT_SLUGS = ['59-case-1w-1h', '115-under-table-rail-2w', 'faceplate-back-cover-2w-1h', 'wall-mount-bracket-2w'];

/* ---- registry revision: pin to the commit, not the day ---- */
const sha = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
const dirty = execSync('git status --porcelain -- viewer/js/generate.js viewer/parts', { cwd: root }).toString().trim();
if (dirty) throw new Error('generate.js or viewer/parts is dirty - commit first, the revision stamp must mean something');
const REV = `gen2-viewer@${sha}`;

/* ---- units: measured, not taken from the glTF spec (handoff's own trap) ----
   The 115 1W-1H case is ~59 mm tall; if its world span along Y is not ~59
   asset units, unitsPerMm=1 is a lie and the export must not happen. */
{
  const s = worldSpans(join(root, 'viewer', 'parts', '115', '115-1W-1H_Case.lib.glb'));
  if (Math.abs(s[1] - 59) > 3) throw new Error(`units check failed: 115 1H case spans ${s[1]} along Y, expected ~59mm`);
}

const CONVENTION = { plateUp: [0, 1, 0], plateRef: [1, 0, 0], eulerOrder: 'XYZ', angleUnit: 'degree' };

/* Euler XYZ (three.js default, the viewer's group.rotation.set), degrees ->
   matrix; buildAxis in the part's own frame is R-transpose times plate-up. */
function buildAxis(rotDeg) {
  const [x, y, z] = rotDeg.map(d => (d * Math.PI) / 180);
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  // three.js Euler XYZ: R = Rx * Ry * Rz (applied to column vectors)
  const R = [
    [cy * cz, -cy * sz, sy],
    [cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy],
    [sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy],
  ];
  // R^T * [0,1,0] = row 1 of R
  return R[1].map(v => Math.abs(v) < 1e-12 ? 0 : v);
}

/* bedOffsetAlongBuildAxis = min projection of the geometry onto the build
   axis, in asset units - the coordinate of layer zero in the object frame
   (the Lab's layerOriginObj). Exact via the AABB only when the axis is a
   signed basis vector, which every confirmed pose satisfies; anything else
   refuses rather than approximates. */
function bedOffset(ext, axis) {
  const nz = axis.map((v, i) => [v, i]).filter(([v]) => Math.abs(v) > 1e-9);
  if (nz.length !== 1 || Math.abs(Math.abs(nz[0][0]) - 1) > 1e-9)
    throw new Error('build axis is not a signed basis vector - AABB projection would be approximate');
  const [v, i] = nz[0];
  return v > 0 ? ext.lo[i] : -ext.hi[i];
}

/* Exactness guard (adversarial review, 2026-08-31): the AABB that worldExtents
   composes is TIGHT only when every composed node transform is axis-permuting
   (one nonzero per row and column of the 3x3). An internal free rotation makes
   the box conservative, and a conservative box makes the min projection a
   bound, not a coordinate - so such a part gets NO bedOffset rather than an
   approximate one (the contract says absence is honest: direction stands,
   phase stays unresolved). */
function transformsAxisPermuting(file) {
  const g = glbJson(file);
  const mul3 = (a, b) => { // 3x3 blocks of the column-major 4x4s
    const o = new Array(9).fill(0);
    for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++)
      for (let k = 0; k < 3; k++) o[c * 3 + r] += a[k * 3 + r] * b[c * 3 + k];
    return o;
  };
  const block3 = (m) => [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const permuting = (m) => {
    for (let r = 0; r < 3; r++) {
      let rowNz = 0, colNz = 0;
      for (let c = 0; c < 3; c++) {
        if (Math.abs(m[c * 3 + r]) > 1e-9) rowNz++;
        if (Math.abs(m[r * 3 + c]) > 1e-9) colNz++;
      }
      if (rowNz !== 1 || colNz !== 1) return false;
    }
    return true;
  };
  let ok = true;
  const walk = (ni, parent) => {
    const n = g.nodes[ni];
    const local = block3(n.matrix ? n.matrix : mat4FromTRS(n.translation, n.rotation, n.scale));
    const m = mul3(parent, local);
    if (n.mesh != null && !permuting(m)) ok = false;
    for (const c of n.children || []) walk(c, m);
  };
  for (const ni of g.scenes[g.scene || 0].nodes) walk(ni, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  return ok;
}

/* Provenance notes: the register's own language, keyed the way the register
   keys it. Every pose traces to Joey's statement about how HIS parts print
   on HIS printers - observed practice, not geometry reasoning. */
function noteFor(slug, rot) {
  const R = JSON.stringify(rot);
  if (/-case-extender-/.test(slug)) return 'prints same as a case, as authored (Joey, 2026-08-31)';
  if (/-case-/.test(slug)) return 'cases always print bottom-down, as authored (Joey, 2026-08-31)';
  if (/-drawer-/.test(slug)) return 'drawers always print bottom-down, as authored (Joey, 2026-08-31)';
  if (/-cover-upper-/.test(slug)) return 'installed top prints against the plate (Joey, 2026-08-31)';
  if (/-cover-lower-|foot-rail/.test(slug)) return 'sits in the finished tabletop exactly as it prints, as authored (Joey, 2026-08-31)';
  if (/under-table-rail/.test(slug)) return 'prints top down, the side that contacts the underside of the table (Joey, 2026-08-31)';
  if (/-shelf-insert-|^shelf-lip-/.test(slug)) return 'shelves and lips print top down (Joey, 2026-08-31)';
  if (/^faceplate-back-cover-/.test(slug)) return 'the side facing the back of the build prints face down (Joey, 2026-08-31)';
  if (/^wall-mount-bracket-/.test(slug)) return 'the back that contacts the wall prints face down (Joey, 2026-08-31)';
  if (/^tpu-foot$/.test(slug)) return 'prints upright as authored (Joey, 2026-08-20)';
  if (/^magnet-insert-/.test(slug)) return 'lies flat on its face, the 2026-08-20 eye-gated swing';
  if (/faceplate/.test(slug) && R === '[90,0,0]') return 'prints FACE-DOWN on the sheet (Joey, 2026-08-19/20 faceplate confirmations)';
  if (/faceplate/.test(slug) && R === '[-90,0,0]') return 'prints back-down (Joey, 2026-08-19/20 faceplate confirmations)';
  return 'confirmed print pose from the viewer register (2026-08-31)';
}

/* ---- the export ---- */
const support = JSON.parse(readFileSync(join(root, 'viewer', 'part-preview-support.json'), 'utf8'));
const all = Object.entries(support.parts).filter(([, v]) => v.platePreview).map(([s]) => s);
const slugs = PILOT ? PILOT_SLUGS : all;

const entries = [];
const skipped = [];    // no entry at all, with the reason
const noOffset = [];   // entry exported, bedOffset honestly omitted
const meshSeen = new Map();

for (const slug of slugs) {
  const r = resolvePartPreview(slug, { plate: true });
  if (r.fail) { skipped.push({ slug, reason: `resolver refused: ${r.fail.reason}` }); continue; }
  const inst = r.manifest.instances;
  const rots = inst.map(i => JSON.stringify(i.rot ?? []));
  if (new Set(rots).size > 1) {
    skipped.push({ slug, reason: 'chiral set: one physical print, two per-node rotations - the contract carries one rotation per entry (handoff invites an extension rather than flattening)' });
    continue;
  }
  if (inst.length > 1) {
    skipped.push({ slug, reason: 'multi-body set: one physical print across several GLB files - the contract carries a singular asset identity per entry' });
    continue;
  }
  const node = inst[0].node;
  const rotation = inst[0].rot ?? [];
  const collection = String(r.manifest.collection || '185');
  const rel = `viewer/parts/${collection}/${node}.lib.glb`;
  const file = join(root, rel);
  if (!existsSync(file)) { skipped.push({ slug, reason: `GLB missing: ${rel}` }); continue; }
  const bytes = readFileSync(file);
  const hash = createHash('sha256').update(bytes).digest('hex');
  // the master GLB Library copy must agree with what the viewer serves - a
  // divergence means the pose was confirmed against different bytes
  const libFile = join(root, 'GLB Library', collection, `${node}.lib.glb`);
  if (existsSync(libFile)) {
    const libHash = createHash('sha256').update(readFileSync(libFile)).digest('hex');
    if (libHash !== hash) { skipped.push({ slug, reason: `GLB Library copy differs from served copy for ${node}` }); continue; }
  }
  if (meshSeen.has(node)) { skipped.push({ slug, reason: `mesh ${node} already exported for ${meshSeen.get(node)}` }); continue; }
  meshSeen.set(node, slug);

  // per-part scale guard: a metres or centimetres asset would make
  // unitsPerMm=1 a lie for THIS entry, whatever the calibration part said
  const spans = worldSpans(file);
  if (spans.some(s => s < 1 || s > 1200)) { skipped.push({ slug, reason: `spans ${JSON.stringify(spans)} are not mm-plausible` }); continue; }

  const rotFull = rotation.length ? rotation : [0, 0, 0];
  let offset;
  if (transformsAxisPermuting(file)) {
    try {
      offset = +bedOffset(worldExtents(file), buildAxis(rotFull)).toFixed(4);
    } catch (e) {
      noOffset.push({ slug, reason: String(e.message || e) });
    }
  } else {
    noOffset.push({ slug, reason: 'internal free rotation makes the AABB conservative - offset omitted, direction stands' });
  }
  entries.push({
    contractVersion: '1.0.0',
    partId: slug,
    poseSourceVersion: REV,
    asset: { path: rel, sha256: hash },
    unitsPerMm: 1,
    convention: CONVENTION,
    rotation,
    basis: 'observed',
    note: noteFor(slug, rotation),
    meshIds: [node],
    ...(offset !== undefined ? { bedOffsetAlongBuildAxis: offset } : {}),
  });
}

const manifest = {
  contractVersion: '1.0.0',
  sourceRegistryRevision: REV,
  exportedAt: new Date().toISOString(),
  entries,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n');
/* The exclusions ledger travels BESIDE the manifest, never inside it (the
   contract has no such field, and unknown fields are someone else's parser
   risk) - so "N entries" is never mistaken for full source coverage. */
const LEDGER = OUT.replace(/\.json$/, '.exclusions.json');
writeFileSync(LEDGER, JSON.stringify({
  sourceRegistryRevision: REV,
  plateCapableInRegistry: all.length,
  exported: entries.length,
  skippedEntirely: skipped,
  bedOffsetOmitted: noOffset,
}, null, 2) + '\n');
console.log(`wrote ${OUT}`);
console.log(`wrote ${LEDGER}`);
console.log(`entries: ${entries.length} of ${slugs.length} requested (${all.length} plate-capable in registry)`);
for (const s of skipped) console.log(`  SKIPPED ${s.slug}: ${s.reason}`);
for (const s of noOffset) console.log(`  NO-OFFSET ${s.slug}: ${s.reason}`);
if (!skipped.length && !noOffset.length) console.log('  (no skips, no offset omissions)');
