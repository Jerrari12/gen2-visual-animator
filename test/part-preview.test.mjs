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
// case extenders have no GLBs; the six hardware pages await Joey's product-
// composition call (pair vs single — see the resolver's comment).
const expectUnsupported = s =>
  /-case-extender-/.test(s) ||
  /^(drawer-stoppers|tpu-foot|magnet-insert-(6|10)x2mm|quicklock-a-v1-11|quicklock-b-bi-directional-optional)$/.test(s);

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
  assert.equal(supported, 458, 'supported preview count');
  assert.equal(unsupported, 30, 'intentionally-unsupported count (24 extenders + 6 hardware)');
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
