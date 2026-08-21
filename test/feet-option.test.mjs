/* Feet option (2026-08-21, confirmed rule): printed TPU feet OR adhesive
   rubber feet - one-for-one alternatives, same count at the same spots. The
   planner's build carries `feet` ('tpu' default | 'adhesive'); the generated
   BOM bills ONLY the chosen option, the adhesive row is purchased + REQUIRED,
   and the scene keeps the foot geometry as position markers (the step note
   says so). Official kits never set `feet`, so their goldens are untouched. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { generateManifest } = await import(new URL('file://' + join(root, 'viewer', 'js', 'generate.js').replace(/\\/g, '/')).href);

const build = (extra) => Object.assign({
  mount: 'tabletop', length: 185, gridW: 4, gridH: 4, printer: 'any',
  faceStyle: 'essential', handleStyle: 'deco', wallStagger: false, backCover: false, removedStoppers: [],
  placed: [{ id: 1, x: 0, y: 6, w: 2, hh: 2, fill: 'classic', shelves: 0, closure: 'none' }], nextId: 2
}, extra);
const gen = (b) => { const r = generateManifest(b); assert.deepEqual(r.errors, []); return r.manifest; };
const rows = (m) => (m.parts || []).filter(p => p.node === 'Tabletop-Kit-Foot');

test('default: six printed TPU feet on a single 2W bottom case, nothing to buy', () => {
  const m = gen(build({}));
  const r = rows(m);
  assert.equal(r.length, 1);
  assert.equal(r[0].label, 'Tabletop Kit Foot');
  assert.equal(r[0].qty, 6);                 // 2 x (2 + 1): the one-case rule
  assert.equal(r[0].purchased, undefined);
  assert.ok(m.steps.some(s => /insert the 6 feet/.test(s.title)));
});

test('adhesive: the same six feet as a purchased, required row - and no printed row', () => {
  const m = gen(build({ feet: 'adhesive' }));
  const r = rows(m);
  assert.equal(r.length, 1);
  assert.equal(r[0].label, 'Adhesive rubber foot');
  assert.equal(r[0].qty, 6);                 // one-for-one: the same count
  assert.equal(r[0].purchased, true);
  assert.equal(r[0].required, true);         // a tabletop build cannot stand without feet
  assert.equal(r[0].links.buy[0].id, 'rubber-feet');   // mirrors the planner's HARDWARE_BUY id
  assert.ok(!(m.parts || []).some(p => p.label === 'Tabletop Kit Foot'), 'never both options');
  const step = m.steps.find(s => /stick on the 6 feet/.test(s.title));
  assert.ok(step && /mark the spots/.test(step.note), 'the step says the printed feet only mark the spots');
  // the geometry stays: six foot instances at the same positions either way
  const feet = (m.instances || []).filter(i => i.node === 'Tabletop-Kit-Foot');
  const feetDefault = (gen(build({})).instances || []).filter(i => i.node === 'Tabletop-Kit-Foot');
  assert.equal(feet.length, 6);
  assert.deepEqual(feet.map(i => i.pos), feetDefault.map(i => i.pos));
});

test('an unknown value falls back to printed feet (the planner sanitizes the same way)', () => {
  const m = gen(build({ feet: 'nonsense' }));
  assert.equal(rows(m)[0].label, 'Tabletop Kit Foot');
});
