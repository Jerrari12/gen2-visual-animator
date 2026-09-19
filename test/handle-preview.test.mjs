/* THE NINE HANDLE PREVIEWS (2026-09-19)
 *
 * The site sells nine bolt-on handles as nine products, and until now the
 * viewer could not show one: a handle is not a Planner BOM row of its own - the
 * Planner picks a FAMILY for the whole build and the Build Studio cycles the
 * variants with the identify card's arrows - so generateManifest only ever knew
 * three handles, one per family, and previewProbe had no handle case at all.
 *
 * What is new is `build.handleVariant`, a PREVIEW-ONLY field naming one of the
 * nine nodes, and a preview that shows the handle MOUNTED on the Essential
 * 1W-1H plate it was probed against, because a 75 mm bar alone on a transparent
 * stage reads as nothing - which is what the site's old handle thumbnails were.
 *
 * The two failure modes this suite exists to prevent:
 *
 *  1. THE WRONG HANDLE ON A PERMANENT PRODUCT PAGE. A build that ignored the
 *     variant would bill the family's FIRST handle, and a type-only pick would
 *     preview it happily - the same silent substitution a Gridfinity drawer
 *     makes outside its own family. Hence the exact-node pick, and hence the
 *     first test asserting the NODE rather than that something resolved.
 *  2. A HANDLE FLOATING OFF ITS PLATE. The mounted seat is computed from `h`
 *     and `d` in HANDLE_VARIANTS, copied by hand from main.js's table. They are
 *     measured against the GLBs here rather than trusted.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { generateManifest, resolvePartPreview, HANDLE_VARIANTS } = await import(
  new URL('../viewer/js/generate.js', import.meta.url).href);
const { worldExtents } = await import(new URL('./lib/glb-spans.mjs', import.meta.url).href);

/* slug -> node, the site's own list (D:/Claude - Output/modulith-handles-as-parts-2026-09-19/
   handle-site-slugs.json). Retyped rather than imported from generate.js, so that editing the
   slug table has to be done twice on purpose - these URLs are permanent once the pages go up. */
const SLUGS = {
  'deco-handle': 'Handle_Deco',
  'blockbar-handle-a': 'Handle_BlockBar_A',
  'blockbar-handle-b': 'Handle_BlockBar_B',
  'blockbar-handle-c': 'Handle_BlockBar_C',
  'blockbar-handle-d': 'Handle_BlockBar_D',
  'blockbar-handle-e': 'Handle_BlockBar_E',
  'blockbar-handle-f': 'Handle_BlockBar_F',
  'crystal-handle-a': 'Handle_Crystal_A',
  'crystal-handle-b-wide': 'Handle_Crystal_B',
};
const PLATE = 'Faceplate_Essential_1W-1H';
const FP_H = 55;          // the probe's own plate size, 1W-1H
const FP_Z = 95.07;       // Essential z-centre: mounting plane 92.57 + depth/2
const HANDLE_Z = 97.57;   // every handle's back face lands here, on the plate front
const glb = (node) => join(root, 'viewer', 'parts', '185', node + '.lib.glb');

test('each slug previews ITS OWN handle - never the family default', () => {
  const got = {};
  for (const s of Object.keys(SLUGS)) {
    const r = resolvePartPreview(s);
    assert.ok(!r.fail, s + ': ' + (r.fail && r.fail.message));
    got[s] = r.part.node;
    assert.equal(r.part.type, 'Handle', s + ': type');
    assert.equal(String(r.manifest.collection), '185', s + ': probed on the calibrated collection');
  }
  assert.deepEqual(got, SLUGS, 'slug -> node');
  // labels are per VARIANT, not per family: nine pages must not all call
  // themselves "BlockBar Handle"
  const labels = Object.keys(SLUGS).map(s => resolvePartPreview(s).part.label);
  assert.equal(new Set(labels).size, 9, 'nine distinct labels');
  assert.equal(resolvePartPreview('blockbar-handle-d').part.label, 'BlockBar Handle D');
  assert.equal(resolvePartPreview('crystal-handle-b-wide').part.label, 'Crystal Handle B Wide');
});

test('HANDLE_VARIANTS h/d are the GLBs own height and depth', () => {
  // a wrong h or d seats the handle off its plate in the preview AND misplaces
  // it in every build, so these are measured rather than trusted
  const bad = [];
  for (const [node, v] of Object.entries(HANDLE_VARIANTS)) {
    assert.ok(existsSync(glb(node)), node + ': GLB missing from the 185 pool');
    const { lo, hi } = worldExtents(glb(node));
    if (Math.abs((hi[1] - lo[1]) - v.h) > 0.02) bad.push(node + ': height ' + (hi[1] - lo[1]) + ' vs h ' + v.h);
    if (Math.abs((hi[2] - lo[2]) - v.d) > 0.02) bad.push(node + ': depth ' + (hi[2] - lo[2]) + ' vs d ' + v.d);
    // bottom-anchored, X-centred - the canonical pose every part here carries
    if (Math.abs(lo[1]) > 0.02) bad.push(node + ': not bottom-anchored (minY ' + lo[1] + ')');
    if (Math.abs(lo[0] + hi[0]) > 0.02) bad.push(node + ': not X-centred');
  }
  assert.deepEqual(bad, [], 'handle placement dims against the GLBs');
  /* Crystal A and B Wide SHARE h and d, which the knowledge pack has carried as a possible
     duplicated row since 2026-09-13. MEASURED here: it is correct. They differ on X - 54 mm
     against 98 - and X is the one axis placement never uses. */
  const A = worldExtents(glb('Handle_Crystal_A')), B = worldExtents(glb('Handle_Crystal_B'));
  assert.ok((B.hi[0] - B.lo[0]) - (A.hi[0] - A.lo[0]) > 40, 'B Wide is the wide one');
});

test('the preview is MOUNTED: the plate sits where the generator seats it', () => {
  for (const [s, node] of Object.entries(SLUGS)) {
    const r = resolvePartPreview(s);
    assert.deepEqual(r.part.context, [PLATE], s + ': mounted on the Essential plate');
    assert.equal(r.part.extras, undefined, s + ': a handle is not DRESSED - the plate is context');
    const [prim, plate] = r.manifest.instances;
    assert.deepEqual(prim.pos, [0, 0, 0], s + ': the handle is the primary, at the origin');
    assert.equal(plate.node, PLATE, s + ': the context IS the plate');
    const { h, d } = HANDLE_VARIANTS[node];
    /* The generator centres a handle on its plate (less 0.5) and lands its back face on the
       plate front. Seen from the handle, the plate is exactly that far down and that far back.
       Written out from the same two numbers the BUILD uses, so a placement change surfaces
       here as a failure instead of as a nudge nobody notices. */
    assert.ok(Math.abs(plate.pos[1] - -((FP_H - h) / 2 - 0.5)) < 1e-9, s + ': plate height ' + plate.pos[1]);
    assert.ok(Math.abs(plate.pos[2] - (FP_Z - (HANDLE_Z + d / 2))) < 1e-9, s + ': plate depth ' + plate.pos[2]);
    // the handle is the SUBJECT: poster orange, against the plate's dark hue
    assert.equal(r.manifest.colors.Handle, '#ff6f1b', s + ': handle wears the poster orange');
    assert.notEqual(r.manifest.colors.Faceplate, r.manifest.colors.Handle, s + ': the plate reads as context');
    // the two M3 screws that fasten it are purchased hardware and stay out
    assert.equal(r.manifest.parts.length, 2, s + ': handle + plate, nothing else');
    // and the viewer frames the handle, not the pair - without this the plate sets
    // the fit radius and the handle is a stripe across it (fitPartCamera)
    assert.equal(r.manifest.previewFocus, 'p0', s + ': the preview frames its subject');
  }
});

test('only the Deco handle has a confirmed print pose', () => {
  /* Joey, 2026-09-14, of the Deco handle: "the side facing up, that side prints face-down on
     the build plate" - and of no other handle family. The pose is keyed by FAMILY, so the eight
     BlockBar and Crystal pages ship turntable-only until their own words arrive. */
  const deco = resolvePartPreview('deco-handle', { plate: true });
  assert.ok(!deco.fail, 'deco plate boot');
  assert.equal(deco.manifest.instances.length, 1, 'the plate view is the bare print job - the plate is not mounted');
  assert.deepEqual(deco.manifest.instances[0].rot, [180, 0, 0], 'the installed top goes onto the bed');
  assert.equal(deco.manifest.parts.length, 1, 'and the BOM is the handle alone');
  for (const s of Object.keys(SLUGS)) {
    if (s === 'deco-handle') continue;
    assert.equal(resolvePartPreview(s).part.platePreview, false, s + ': no confirmed pose');
    assert.equal(resolvePartPreview(s, { plate: true }).fail.reason, 'unsupported', s + ': plate boot fails closed');
  }
});

test('the deployed support manifest carries all nine', () => {
  // the site will not create the nine product pages until this file names them;
  // its own gate fails on a slug the viewer does not back.
  const support = JSON.parse(readFileSync(join(root, 'viewer', 'part-preview-support.json'), 'utf8'));
  for (const s of Object.keys(SLUGS)) {
    assert.ok(support.parts[s], s + ': missing from the support manifest');
    assert.equal(support.parts[s].preview, true, s + ': preview');
    assert.equal(support.parts[s].platePreview, s === 'deco-handle', s + ': platePreview');
  }
});

test('a BUILD is untouched: it still gets its familys first handle', () => {
  // the whole point of handleVariant being preview-only. The ten official-kit
  // goldens are the wider net; this is the direct statement.
  const build = (o) => ({ mount: 'wall', length: 185, gridH: 1, faceStyle: 'essential',
                          placed: [{ id: 'u1', x: 0, y: 0, w: 1, hh: 2, fill: 'decor' }], ...o });
  const handleRow = (b) => generateManifest(b).manifest.parts.find(p => p.type === 'Handle');
  assert.deepEqual(
    ['deco', 'blockbar', 'crystal'].map(f => handleRow(build({ handleStyle: f }))).map(r => [r.node, r.label]),
    [['Handle_Deco', 'Deco Handle'], ['Handle_BlockBar_A', 'BlockBar Handle'],
     ['Handle_Crystal_A', 'Crystal Handle']],
    'a family build bills the family handle under the family name');
  // a variant keeps its family's store links - one Printables page carries all six BlockBars
  const fam = handleRow(build({ handleStyle: 'blockbar' }));
  const one = handleRow(build({ handleStyle: 'blockbar', handleVariant: 'Handle_BlockBar_E' }));
  assert.equal(one.node, 'Handle_BlockBar_E');
  assert.deepEqual(one.links, fam.links, 'the variant keeps the family page');
});

test('an unknown handleVariant is an ERROR, not a quiet fallback', () => {
  // it can only come from a slug table naming a node the library does not have,
  // and a permanent product page showing a DIFFERENT handle is exactly what
  // this resolver exists to refuse.
  const g = generateManifest({ mount: 'wall', length: 185, gridH: 1, faceStyle: 'essential',
    handleStyle: 'deco', handleVariant: 'Handle_Knob_A',
    placed: [{ id: 'u1', x: 0, y: 0, w: 1, hh: 2, fill: 'decor' }] });
  assert.equal(g.manifest, null, 'no manifest');
  assert.match(g.errors.join(' '), /Handle_Knob_A/, 'and it names what it refused');
});
