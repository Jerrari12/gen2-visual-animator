/* THE VENDORED PART-LABEL FILES - drift gate + the behaviour this app leans on (2026-10-10).
 *
 * `viewer/js/vendor/label-hardware.js`, `hardware-layout.js`, `hardware-data.js`, `hardware-v5-data.js` and
 * `hardware-band-data.js` are BYTE-FOR-BYTE copies of the MODULITH Label Studio's (the EdgeLabel label generator's) part-label
 * code and data: the Part Picker item laid out on the EdgeLabel face (the Python print engine, ported rule for rule), its
 * screw and nut drawings, the raised ink, and the label body cut into colour-band pieces. label-text.js builds every part
 * label and every colour stripe a drawer wears through them, so a part label in 3D is the part label the Label Studio prints.
 *
 * Same chain as label-icons-vendor.test.mjs: the sha256s are pinned here, and this test also checks byte equality against the
 * Label Studio's files when a checkout carrying label-hardware.js sits beside this repo (GEN2_LABELSTUDIO_ROOT, then
 * "../ls-next", then a "GEN2 EdgeLabel Label Generator" folder beside this repo or its worktree folder). Bump the pins ONLY
 * after the LABEL STUDIO's files changed and were re-copied here. Never edit the viewer's copies.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = (f) => join(root, 'viewer', 'js', 'vendor', f);
const STUDIO = process.env.GEN2_LABELSTUDIO_ROOT
  ? [process.env.GEN2_LABELSTUDIO_ROOT]
  : [join(root, '..', 'ls-next'), join(root, '..', 'GEN2 EdgeLabel Label Generator'), join(root, '..', '..', 'GEN2 EdgeLabel Label Generator')];
const STUDIO_ROOT = STUDIO.find((d) => existsSync(join(d, 'label-hardware.js')));
const PINS = {
  'label-hardware.js': 'd1c0eb6b96d791f628fc56d1ce66d22f50f4738da11f4108b486d656ed0d9df0',
  'hardware-layout.js': 'd807991cc8d012399084b072db750b72744f723aa1cf183812a2bed6060946e2',
  'hardware-data.js': 'b97c422e90699c1e9dafc610292f44bf1341cbd3a4d1e12fbedd2a5be1c75d2d',
  'hardware-v5-data.js': '73b3895d8865dfc2c91a215405e78d597dc6dd9f7dda9cfaf4ee6034dc3224e8',
  'hardware-band-data.js': '865744a360b3816b2f8b28a69ae6fc907e6d8306edaf0abca4091f47184b3a78',
};
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

test('the vendored part-label files match their pins', () => {
  for (const [f, pin] of Object.entries(PINS)) {
    assert.ok(existsSync(V(f)), `viewer/js/vendor/${f} is missing`);
    assert.equal(sha(V(f)), pin, `vendored ${f} changed - edit the LABEL STUDIO's file, copy it here, then bump its pin`);
  }
});

test('the vendored part-label files are byte-identical to the Label Studio\'s (when it is checked out)', (t) => {
  if (!STUDIO_ROOT) { t.skip('Label Studio checkout with label-hardware.js not present - pin-only'); return; }
  for (const f of Object.keys(PINS)) assert.ok(readFileSync(V(f)).equals(readFileSync(join(STUDIO_ROOT, f))), `${f} differs from the Label Studio's - re-copy it`);
});

/* ---- under node: the viewer's OWN font and opentype, the vendored files ---- */
const THREE = await import(pathToFileURL(join(root, 'viewer', 'vendor', 'three', 'three.module.js')).href);
function loadAll() {
  for (const k of ['opentype', 'GEN2EdgeLabelCore', 'GEN2HardwareLayout', 'GEN2HardwareData', 'GEN2HardwareV5Data', 'GEN2HardwareBandData', 'GEN2LabelHardware']) delete globalThis[k];
  (0, eval)(readFileSync(join(root, 'viewer', 'vendor', 'opentype', 'opentype.min.js'), 'utf8'));
  for (const f of ['edgelabel-core.js', ...Object.keys(PINS)]) (0, eval)(readFileSync(V(f), 'utf8'));
  const buf = readFileSync(join(root, 'viewer', 'vendor', 'fonts', 'LiberationSansNarrow-Bold.ttf'));
  const font = globalThis.opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  const core = globalThis.GEN2EdgeLabelCore.create({ THREE });
  const G = globalThis;
  const LH = G.GEN2LabelHardware.create({ THREE, layout: G.GEN2HardwareLayout, data: G.GEN2HardwareData, v5: G.GEN2HardwareV5Data,
    bands: G.GEN2HardwareBandData, mergeGeoms: (g) => core.mergeGeoms(g) });
  LH.setFont(font);
  return { LH, core };
}
const { LH, core } = loadAll();
const REF = JSON.parse(readFileSync(join(root, 'test', 'golden', 'part-label-ref.json'), 'utf8')).items;

function ringArea(r) { let a = 0; for (let i = 0, n = r.length; i < n; i += 2) { const j = (i + 2) % n; a += r[i] * r[j + 1] - r[j] * r[i + 1]; } return Math.abs(a / 2); }
function inRing(x, y, r) {
  let inside = false;
  for (let i = 0, n = r.length, j = n - 2; i < n; j = i, i += 2) {
    const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function summary(parts) {   // the Label Studio's test/hardware-bands.test.mjs summary: bbox + even-odd area of one element
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, area = 0;
  for (const rings of parts) for (const r of rings) {
    for (let i = 0; i < r.length; i += 2) { x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]); y0 = Math.min(y0, r[i + 1]); y1 = Math.max(y1, r[i + 1]); }
    const depth = rings.filter((o) => o !== r && inRing(r[0], r[1], o)).length;
    area += (depth % 2 ? -1 : 1) * ringArea(r);
  }
  return { bbox: [x0, y0, x1, y1], area };
}

test('with the viewer\'s own font, a part label lays out exactly as the Label Studio prints it (records, every element\'s box and area)', () => {
  assert.equal(REF.length, 4);
  for (const ref of REF) {
    const r = LH.layOut(ref.item, { type: 'edgelabel', profile: true, band: 'bottom' });
    assert.ok(r.elements, `${ref.item.id}: not laid out (${JSON.stringify(r.record)})`);
    // (the Python record writes null where the browser leaves a field out - the Label Studio's own comparison reads both as null)
    for (const [k, v] of Object.entries(ref.bottom.record)) assert.deepEqual(r.record[k] ?? null, v, `${ref.item.id}: record.${k}`);
    assert.deepEqual(Object.keys(r.elements).sort(), Object.keys(ref.bottom.elements).sort(), `${ref.item.id}: element names`);
    for (const [k, e] of Object.entries(ref.bottom.elements)) {
      const s = summary(r.elements[k]);
      assert.ok(Math.max(...s.bbox.map((v, i) => Math.abs(v - e.bbox[i]))) <= 1e-5, `${ref.item.id} ${k}: box ${s.bbox} vs ${e.bbox}`);
      assert.ok(Math.abs(s.area - e.area) <= 1e-5 * Math.max(1, e.area), `${ref.item.id} ${k}: area ${s.area} vs ${e.area}`);
    }
    // the band position moves the layout as it moves it in the Label Studio (the face less the band)
    const end = LH.layOut(ref.item, { type: 'edgelabel', profile: true, band: 'end' });
    for (const [k, v] of Object.entries(ref.end.record)) assert.deepEqual(end.record[k] ?? null, v, `${ref.item.id}: end record.${k}`);
    assert.equal(r.band, 'bottom');
    assert.equal(end.band, 'end');
  }
});

test('the ink and the band pieces are in the label core\'s frame: pieces = the 57 x 27 x 4.5 mm body, ink inside the face, 0.45 mm proud', () => {
  const ref = REF[0];
  const r = LH.layOut(ref.item, { type: 'edgelabel', profile: true, band: 'bottom' });
  const m = LH.meshes(r, r.inkDepth);
  assert.equal(r.inkDepth, 0.45);
  m.textGeo.computeBoundingBox();
  const ib = m.textGeo.boundingBox;
  assert.ok(Math.abs(ib.min.z) < 1e-6 && Math.abs(ib.max.z - 0.45) < 1e-6, 'the ink stands from z 0 to its depth (placed at the top face by the caller)');
  assert.ok(ib.min.x >= -core.LABEL_LEN / 2 && ib.max.x <= core.LABEL_LEN / 2 && ib.min.y >= -core.LABEL_WID / 2 && ib.max.y <= core.LABEL_WID / 2);
  assert.deepEqual(m.baseParts.map((p) => p.piece), ['base', 'band', 'accent']);
  const box = new THREE.Box3();
  for (const p of m.baseParts) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox); }
  assert.ok(Math.abs(box.max.x - box.min.x - core.LABEL_LEN) < 0.01 && Math.abs(box.max.y - box.min.y - core.LABEL_WID) < 0.01, 'the pieces are the whole label');
  assert.ok(Math.abs(box.min.z) < 1e-6 && Math.abs(box.max.z - core.LABEL_HT) < 1e-6, 'from the bed (z 0) to the top face');
  assert.equal(m.baseParts[1].colour.hex, '#56B4E9', 'the band takes the band colour (metric blue)');
  assert.equal(m.baseParts[2].colour.hex, '#F4F4F2', 'the accent takes the material (stainless)');
  assert.equal(m.baseParts[0].colour, null, 'the base is the label\'s base colour');
});

test('ANY label can carry a stripe: bandParts takes one colour, and a missing accent slot takes the band\'s colour', () => {
  const red = LH.colour({ colour: 'red', hex: '#D55E00', label: 'Inch (SAE)' });
  for (const tr of LH.treatments) {
    const p = LH.bandParts(tr, { band: red });
    assert.equal(p.length, 3);
    assert.equal(p[1].colour.hex, '#D55E00');
    assert.equal(p[2].colour.hex, '#D55E00', 'no band_accent slot: the accent is the band');
  }
  assert.deepEqual(LH.treatments, ['bottom', 'end', 'wedge']);
  assert.equal(LH.bandParts('nowhere', { band: red }), null);
  assert.equal(LH.colour({ colour: 'red', hex: 'red' }), null, 'an unreadable hex prints in the base colour');
});
