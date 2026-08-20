/* The ?part= product-preview resolver, swept against the REAL site catalog.

   The MODULITH site embeds this viewer per part page (?part=<slug>&mode=preview)
   and its /parts/ slugs are frozen by URL permanence — so this suite enumerates
   test/site-slugs.json, a vendored copy of the site's production search index
   (deliberately NOT re-derived from the same grammar the resolver parses: the
   list is the independent authority; 2026-08-19 design review). It asserts:

   1. Every production slug is ACCOUNTED FOR — resolves to a preview, or fails
      with the intended 'unsupported' reason. 'unknown-part' on a production
      slug means the resolver's grammar drifted from the site's tokenizer.
   2. Every resolved preview's GLB exists in its collection pool — the exact
      condition that used to hang the app (see parts-exist.test.mjs).
   3. The full catalog output matches test/golden/part-previews.json — the
      official-kits durability mechanism applied to product pages: a generator
      change (tiling, BOM grouping, node renames) that alters ANY preview fails
      here as a reviewable diff instead of silently changing a permanent
      product page. Intentional changes refresh via UPDATE_GOLDEN=1 npm test.
   4. Preview manifests are CANONICAL: exactly one part row, one instance at
      the origin with no assembly context (pos/stage/rides/yaw/rot), and a
      palette entry for the part's type.

   Pure node — no browser, no packages. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { resolvePartPreview } = await import(
  new URL('file://' + join(root, 'viewer', 'js', 'generate.js').replace(/\\/g, '/')).href
);

const SLUGS = JSON.parse(readFileSync(join(root, 'test', 'site-slugs.json'), 'utf8')).slugs;
const GOLDEN_PATH = join(root, 'test', 'golden', 'part-previews.json');
const glbExists = (L, node) => existsSync(join(root, 'viewer', 'parts', String(L), node + '.lib.glb'));

// families with no 3D model ON PURPOSE (the site keeps its static poster):
// case extenders have no GLBs, and neither do QuickLock B or the 6x2 magnet
// insert. The other four hardware pages preview since 2026-08-20 (Joey's
// composition call: a handed pair is ONE product — see HARDWARE_PREVIEW).
const expectUnsupported = s =>
  /-case-extender-/.test(s) ||
  /^(magnet-insert-6x2mm|quicklock-b-bi-directional-optional)$/.test(s);

// resolve the whole catalog once — every test reads from this
const resolved = new Map();
for (const s of SLUGS) resolved.set(s, resolvePartPreview(s));

test('every production slug is accounted for — resolved or intentionally unsupported', () => {
  const unknown = [], wrongBucket = [];
  let supported = 0, unsupported = 0;
  for (const [s, r] of resolved) {
    if (r.fail?.reason === 'unknown-part') { unknown.push(s); continue; }
    if (r.fail) {
      unsupported++;
      if (!expectUnsupported(s)) wrongBucket.push(`${s} → unsupported (${r.fail.message})`);
    } else {
      supported++;
      if (expectUnsupported(s)) wrongBucket.push(`${s} → resolved but should be unsupported`);
    }
  }
  assert.deepEqual(unknown, [], 'production slugs the resolver does not recognize (grammar drift)');
  assert.deepEqual(wrongBucket, [], 'slugs in the wrong support bucket');
  assert.equal(supported, 462, 'supported preview count');
  assert.equal(unsupported, 26, 'intentionally-unsupported count (24 extenders + 2 no-GLB hardware)');
});

test('every resolved preview references GLBs that exist in its collection pool', () => {
  const missing = [];
  for (const [s, r] of resolved) {
    if (r.fail) continue;
    for (const i of r.manifest.instances)
      if (!glbExists(r.manifest.collection, i.node))
        missing.push(`${s} → parts/${r.manifest.collection}/${i.node}.lib.glb`);
  }
  assert.deepEqual(missing, [], 'preview GLBs missing from the library');
});

test('preview manifests are canonical: primary at the origin, no assembly context', () => {
  const bad = [];
  for (const [s, r] of resolved) {
    if (r.fail) continue;
    const m = r.manifest;
    if (r.part.set) {
      // a handed SET: both bodies, symmetric about the origin at the STL's
      // own spacing, pure GLB pose (no assembly fields, no rot off-plate)
      if (m.parts.length !== r.part.set.length || m.instances.length !== r.part.set.length) bad.push(`${s}: set row/instance count`);
      const xs = m.instances.map(i => i.pos[0]);
      if (Math.abs(xs.reduce((a, b) => a + b, 0)) > 1e-9) bad.push(`${s}: set not centered (${xs})`);
      if (m.instances.some(i => i.pos[1] !== 0 || i.pos[2] !== 0)) bad.push(`${s}: set body off the ground line`);
      for (const i of m.instances)
        for (const k of ['stage', 'rides', 'owner', 'stopperKey', 'yaw', 'rot'])
          if (k in i) bad.push(`${s}: set body carries "${k}"`);
    } else {
      const nExtras = r.part.extras?.length || 0;
      if (m.parts.length !== 1 + nExtras || m.parts.some(p => !p || p.qty !== 1)) bad.push(`${s}: parts rows`);
      if (m.instances.length !== 1 + nExtras) bad.push(`${s}: instance count`);
      const [prim, ...extras] = m.instances;
      if (prim.pos.join() !== '0,0,0') bad.push(`${s}: primary pos ${prim.pos}`);
      // primaries are pure GLB pose; extras keep plate-relative pos and a
      // corrective rot (the accent's flip) — but NEVER assembly bookkeeping
      for (const k of ['stage', 'rides', 'owner', 'stopperKey', 'yaw', 'rot'])
        if (k in prim) bad.push(`${s}: primary carries assembly field "${k}"`);
      for (const x of extras)
        for (const k of ['stage', 'rides', 'owner', 'stopperKey', 'yaw'])
          if (k in x) bad.push(`${s}: extra ${x.node} carries assembly field "${k}"`);
      // extras only ever dress faceplates, and only the two extras families
      if (nExtras && (m.parts[0].type !== 'Faceplate')) bad.push(`${s}: extras on a non-faceplate`);
    }
    if (m.parts.some(p => !p || p.qty !== 1)) bad.push(`${s}: parts qty`);
    if (m.mount !== 'tabletop') bad.push(`${s}: mount ${m.mount}`);
    if (m.parts.some(p => !m.colors[p.type])) bad.push(`${s}: missing palette entry`);
    if (m.steps.length !== 1) bad.push(`${s}: step count`);
    // every instance must enter in the single step, or applyState(0) hides it
    const entered = new Set(m.steps[0].phases.flatMap(ph => (ph.enter || []).map(e => e.id)));
    if (m.instances.some(i => !entered.has(i.id))) bad.push(`${s}: instance never enters`);
  }
  assert.deepEqual(bad, [], 'non-canonical preview manifests');
});

test('extras families preview dressed — label always, accent above 0.5H', () => {
  const x = s => resolved.get(s).part.extras || [];
  assert.deepEqual(x('edgelabel-faceplate-2w-1h').sort(),
    ['Accent_EdgeLabel_2W-1H', 'Label_EdgeLabel'], 'EdgeLabel 1H carries accent + label');
  assert.deepEqual(x('edgelabel-faceplate-1w-0-5h'), ['Label_EdgeLabel'], '0.5H has no accent by design');
  assert.deepEqual(x('classicpro-faceplate-2w-1h').sort(),
    ['Accent_EdgeLabel_2W-1H', 'Label_ClassicPro'], 'Classic Pro shares the EdgeLabel accents');
  assert.deepEqual(x('essential-faceplate-2w-1h'), [], 'Essential is a bare plate');
  assert.deepEqual(x('chevron-faceplate-2w-1h'), [], 'Chevron is a bare plate');
  assert.deepEqual(x('classic-faceplate-2w-1h'), [], 'Classic is a bare plate');
});

test('catalog output matches the golden snapshot (UPDATE_GOLDEN=1 to refresh)', () => {
  // slug → the fields a product page depends on. Node + collection are the
  // load-bearing pair (they name the GLB a permanent URL will show forever);
  // label/type ride along so a wording change is also a visible diff.
  const now = {};
  for (const [s, r] of resolved) {
    now[s] = r.fail
      ? { unsupported: r.fail.reason }
      : { node: r.part.node, collection: r.manifest.collection, type: r.part.type, label: r.part.label,
          platePreview: !!r.part.platePreview,
          // dressed previews pin the extras' plate-relative GEOMETRY too — the
          // canonical test already constrains bare previews to identity-at-
          // origin, but a generator offset change could silently move the
          // EdgeLabel/ClassicPro dressing while a membership-only golden
          // stayed green (review catch, 2026-08-19)
          ...(r.part.extras ? { instances: r.manifest.instances } : {}) };
  }
  if (process.env.UPDATE_GOLDEN) {
    writeFileSync(GOLDEN_PATH, JSON.stringify(now, null, 2) + '\n');
    return;
  }
  assert.ok(existsSync(GOLDEN_PATH), 'golden missing — run UPDATE_GOLDEN=1 npm test once');
  assert.deepEqual(now, JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')),
    'a generator change altered a product-page preview — review the diff, then UPDATE_GOLDEN=1 npm test if intended');
});

test('the deployed support manifest matches the resolver (UPDATE_GOLDEN=1 to refresh)', () => {
  // viewer/part-preview-support.json is the VIEWER-OWNED capability artifact
  // the MODULITH site vendors (data/sources/) so its build only offers a 3D
  // button where a preview actually exists — one authority, no doomed iframes,
  // and cross-repo drift fails a gate instead of accumulating silently
  // (2026-08-19 integration review). Deployed with the viewer, so the live
  // copy is inspectable at /part-preview-support.json. Deliberately carries
  // NO node names — those are internal, and the site must never learn them.
  const SUPPORT_PATH = join(root, 'viewer', 'part-preview-support.json');
  const parts = {};
  for (const [s, r] of resolved)
    parts[s] = r.fail
      ? { preview: false, reason: r.fail.message }
      : { preview: true, platePreview: !!r.part.platePreview }; // plate = confirmed print pose only
  const now = { v: 1, source: 'MODULITH search-index v2608', parts };
  if (process.env.UPDATE_GOLDEN) {
    writeFileSync(SUPPORT_PATH, JSON.stringify(now, null, 2) + '\n');
    return;
  }
  assert.ok(existsSync(SUPPORT_PATH), 'support manifest missing — run UPDATE_GOLDEN=1 npm test once');
  assert.deepEqual(JSON.parse(readFileSync(SUPPORT_PATH, 'utf8')), now,
    'viewer/part-preview-support.json is stale — UPDATE_GOLDEN=1 npm test, then re-vendor it into the MODULITH site');
});

test('plate view: confirmed print poses only, bare primary, fail-closed elsewhere', () => {
  // Joey's 2026-08-19 confirmations — the ONLY families with a plate view:
  // cases + both drawer fills print as-authored; integrated-grip faceplates
  // (EdgeLabel/Classic/Classic Pro) print back-down (grip up); Essential and
  // Chevron print face-down (build-plate texture transfers onto the face).
  const rot = s => resolvePartPreview(s, { plate: true }).manifest?.instances[0].rot;
  assert.deepEqual(rot('edgelabel-faceplate-2w-1h'), [-90, 0, 0], 'EdgeLabel prints back-down');
  assert.deepEqual(rot('classic-faceplate-2w-1h'), [-90, 0, 0], 'Classic prints back-down');
  assert.deepEqual(rot('classicpro-faceplate-2w-1h'), [-90, 0, 0], 'Classic Pro prints back-down');
  assert.deepEqual(rot('essential-faceplate-2w-1h'), [90, 0, 0], 'Essential prints face-down');
  assert.deepEqual(rot('chevron-faceplate-2w-1h'), [90, 0, 0], 'Chevron prints face-down');
  assert.equal(rot('185-case-2w-1h'), undefined, 'cases print as authored — no rotation');
  assert.equal(rot('270-classic-drawer-1w-1h'), undefined, 'drawers print as authored');
  // the plate shows the BARE print body — dressed extras have no confirmed
  // individual print pose or plate arrangement yet
  const p = resolvePartPreview('edgelabel-faceplate-2w-1h', { plate: true });
  assert.equal(p.manifest.instances.length, 1, 'plate view is the primary alone');
  assert.equal(p.manifest.platePose, true);
  // hardware poses (2026-08-20): the pair prints together and BOTH hands ride
  // the plate — unlike dressing extras, the second hand IS the same print job
  assert.deepEqual(rot('quicklock-a-v1-11'), [0, 0, 90], 'QuickLock prints flat (thickness off X)');
  assert.equal(rot('drawer-stoppers'), undefined, 'stoppers print as authored');
  assert.deepEqual(rot('magnet-insert-10x2mm'), [90, 0, 0], 'clip prints flat (thickness off Z)');
  assert.equal(rot('tpu-foot'), undefined, 'foot prints upright as authored');
  const qlPlate = resolvePartPreview('quicklock-a-v1-11', { plate: true });
  assert.equal(qlPlate.manifest.instances.length, 2, 'a pair plate shows both hands');
  assert.ok(qlPlate.manifest.instances.every(i => i.rot?.join() === '0,0,90'), 'both hands wear the print pose');
  // fail closed on anything without a confirmed pose
  for (const s of ['185-cover-lower-2w', '270-foot-rail-upper-1w', '115-under-table-rail-2w', 'faceplate-back-cover-2w-1h'])
    assert.equal(resolvePartPreview(s, { plate: true }).fail.reason, 'unsupported', s + ' must fail closed');
  // plate-capable census: 94 cases + 94 classic + 94 decor + 90 faceplates
  // + 4 hardware (2026-08-20)
  const n = [...resolved.values()].filter(r => !r.fail && r.part.platePreview).length;
  assert.equal(n, 376, 'plate-capable slug count');

  // sweep EVERY plate-capable slug's plate boot (not just samples): the bare
  // print JOB (one body, or every member of a handed set), rotations matching
  // the confirmed pose
  const expectRot = s =>
    /-faceplate-/.test(s)
      ? (/^(essential|chevron)-/.test(s) ? [90, 0, 0] : [-90, 0, 0])
      : s === 'quicklock-a-v1-11' ? [0, 0, 90]
      : s === 'magnet-insert-10x2mm' ? [90, 0, 0]
      : undefined;
  for (const [s, r] of resolved) {
    if (r.fail || !r.part.platePreview) continue;
    const pb = resolvePartPreview(s, { plate: true });
    assert.ok(!pb.fail, s + ': plate boot must resolve');
    assert.equal(pb.manifest.instances.length, (r.part.set || [1]).length, s + ': plate boot is the bare print job');
    for (const i of pb.manifest.instances)
      assert.deepEqual(i.rot, expectRot(s), s + ': confirmed pose');
  }
});

test('hardware sets: exact membership, STL-authored layout, footprint law', async () => {
  const { worldSpans } = await import('./lib/glb-spans.mjs');
  // membership is exact and by node, never row order
  assert.deepEqual(resolved.get('quicklock-a-v1-11').part.set, ['QuickLock-L', 'QuickLock-R']);
  assert.deepEqual(resolved.get('drawer-stoppers').part.set, ['Drawer_Stoppers_L', 'Drawer_Stoppers_R']);
  assert.equal(resolved.get('magnet-insert-10x2mm').part.set, undefined, 'a single clip is not a set');
  assert.equal(resolved.get('tpu-foot').part.set, undefined);
  // composite product labels, not one hand's name
  assert.equal(resolved.get('quicklock-a-v1-11').part.label, 'QuickLock (Left + Right)');
  assert.equal(resolved.get('drawer-stoppers').part.label, 'Drawer Stoppers (Left + Right)');
  // the two library gaps stay honestly unsupported
  for (const s of ['quicklock-b-bi-directional-optional', 'magnet-insert-6x2mm']) {
    assert.equal(resolved.get(s).fail.reason, 'unsupported');
    assert.match(resolved.get(s).fail.message, /3D model/);
  }
  // THE FOOTPRINT LAW: the plate arrangement must reproduce the real STL's
  // combined print footprint (the site's fit verdict judges that file), so
  // baked pose + spacing applied to the measured GLB spans must land on the
  // STL ground truth within 0.5mm. STL numbers measured 2026-08-20 from the
  // v2608 files (per-body bboxes; see HARDWARE_PREVIEW in generate.js).
  const spanAfter = (spans, rotKey) => {
    // axis permutation for the exact rotations HARDWARE_PREVIEW uses — a new
    // pose must extend this map consciously
    if (rotKey === '') return [spans[0], spans[2]];          // as authored: X, Z
    if (rotKey === '0,0,90') return [spans[1], spans[2]];    // Z-yaw: Y→X, Z stays
    if (rotKey === '90,0,0') return [spans[0], spans[1]];    // X-roll: Y→Z, X stays
    assert.fail('unmapped plate rotation ' + rotKey);
  };
  const CASES = [
    { slug: 'quicklock-a-v1-11', node: 'QuickLock-L', rot: '0,0,90', dx: 25.11, stl: [48.41, 18.42] },
    { slug: 'drawer-stoppers', node: 'Drawer_Stoppers_L', rot: '', dx: 25.6, stl: [45.18, 28.0] },
    { slug: 'magnet-insert-10x2mm', node: 'MagnetClip_10x2mm', rot: '90,0,0', dx: 0, stl: [19.82, 20.0] },
    { slug: 'tpu-foot', node: 'Tabletop-Kit-Foot', rot: '', dx: 0, stl: [20.6, 20.6] },
  ];
  for (const c of CASES) {
    const spans = worldSpans(join(root, 'viewer', 'parts', '185', c.node + '.lib.glb'));
    const [w, d] = spanAfter(spans, c.rot);
    assert.ok(Math.abs(w + c.dx - c.stl[0]) <= 0.5,
      `${c.slug}: posed width ${w} + dx ${c.dx} must match the STL footprint ${c.stl[0]}`);
    assert.ok(Math.abs(d - c.stl[1]) <= 0.5,
      `${c.slug}: posed depth ${d} must match the STL footprint ${c.stl[1]}`);
    // and the resolver's own constants agree with this table
    const pb = resolvePartPreview(c.slug, { plate: true });
    const xs = pb.manifest.instances.map(i => i.pos[0]).sort((a, b) => a - b);
    if (c.dx) assert.ok(Math.abs(xs[1] - xs[0] - c.dx) < 1e-9, `${c.slug}: instance spacing is the STL's`);
  }
});

test('failure modes are typed correctly', () => {
  assert.equal(resolvePartPreview('garbage-slug').fail.reason, 'unknown-part');
  assert.equal(resolvePartPreview('').fail.reason, 'unknown-part');
  assert.equal(resolvePartPreview(null).fail.reason, 'unknown-part');
  // recognized grammar, impossible catalog entries → the GENERATOR's own caps
  // reject them with its real messages
  assert.equal(resolvePartPreview('59-case-4w-1h').fail.reason, 'unsupported');
  assert.match(resolvePartPreview('59-case-4w-1h').fail.message, /59 collection/);
  assert.equal(resolvePartPreview('185-case-3w-3h').fail.reason, 'unsupported');
  // 59 is hanging-only → its foot-rail probe (tabletop) must fail, not resolve
  assert.equal(resolvePartPreview('59-foot-rail-lower-1w').fail.reason, 'unsupported');
  // case sanity: the resolver lowercases, so a shouty URL still resolves
  assert.equal(resolvePartPreview('185-CASE-2W-1H').fail, undefined);
});
