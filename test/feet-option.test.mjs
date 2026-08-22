/* Feet option (2026-08-21, confirmed rule): printed TPU feet OR adhesive
   rubber feet - one-for-one alternatives, same count at the same spots. The
   planner's build carries `feet` ('tpu' default | 'adhesive'); the generated
   BOM bills ONLY the chosen option, and the adhesive row is purchased +
   REQUIRED. Official kits never set `feet`, so their goldens are untouched.

   2026-08-22: the adhesive foot became REAL geometry. Joey confirmed the bought
   foot is the printed one WITHOUT its upper dovetail rail - same body, same
   height, and the rail is what seats inside the case, so a build stands at the
   same height either way. It therefore has its own node (`Adhesive-Foot`,
   derived by GLB Pipeline/derive_adhesive_foot.py and guarded by
   test/adhesive-foot.test.mjs), its own type, a matte rubber finish, and it
   counts toward the published W/H/L envelope like any other part. The previous
   translucent "placement marker" is gone. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { generateManifest } = await import(new URL('file://' + join(root, 'viewer', 'js', 'generate.js').replace(/\\/g, '/')).href);

const build = (extra) => Object.assign({
  mount: 'tabletop', length: 185, gridW: 4, gridH: 4, printer: 'any',
  faceStyle: 'essential', handleStyle: 'deco', wallStagger: false, backCover: false, removedStoppers: [],
  placed: [{ id: 1, x: 0, y: 6, w: 2, hh: 2, fill: 'classic', shelves: 0, closure: 'none' }], nextId: 2
}, extra);
const gen = (b) => { const r = generateManifest(b); assert.deepEqual(r.errors, []); return r.manifest; };
const feetRows = (m) => (m.parts || []).filter(p => p.type === 'Foot' || p.type === 'FootAdhesive');

test('default: six printed TPU feet on a single 2W bottom case, nothing to buy', () => {
  const m = gen(build({}));
  const r = feetRows(m);
  assert.equal(r.length, 1);
  assert.equal(r[0].node, 'Tabletop-Kit-Foot');
  assert.equal(r[0].label, 'Tabletop Kit Foot');
  assert.equal(r[0].qty, 6);                 // 2 x (2 + 1): the one-case rule
  assert.equal(r[0].purchased, undefined);
  assert.ok(m.steps.some(s => /insert the 6 feet/.test(s.title)));
});

test('adhesive: the same six feet as a purchased, required row - and no printed row', () => {
  const m = gen(build({ feet: 'adhesive' }));
  const r = feetRows(m);
  assert.equal(r.length, 1);
  assert.equal(r[0].node, 'Adhesive-Foot');
  assert.equal(r[0].label, 'Adhesive rubber foot');
  assert.equal(r[0].qty, 6);                 // one-for-one: the same count
  assert.equal(r[0].purchased, true);
  assert.equal(r[0].required, true);         // a tabletop build cannot stand without feet
  assert.equal(r[0].links.buy[0].id, 'rubber-feet');   // mirrors the planner's HARDWARE_BUY id
  assert.ok(!(m.parts || []).some(p => p.node === 'Tabletop-Kit-Foot'), 'never both options');
});

test('adhesive feet sit at exactly the printed feet positions', () => {
  const adhesive = (gen(build({ feet: 'adhesive' })).instances || []).filter(i => i.node === 'Adhesive-Foot');
  const printed = (gen(build({})).instances || []).filter(i => i.node === 'Tabletop-Kit-Foot');
  assert.equal(adhesive.length, 6);
  assert.equal(printed.length, 6);
  assert.deepEqual(adhesive.map(i => i.pos), printed.map(i => i.pos));
  assert.deepEqual(adhesive.map(i => i.yaw), printed.map(i => i.yaw));
});

test('the adhesive foot is a real bought part, not a placement marker', () => {
  const m = gen(build({ feet: 'adhesive' }));
  const r = feetRows(m)[0];
  // its own TYPE is what gives it a matte rubber finish instead of the
  // identification palette; colour-locking falls out of `purchased`
  assert.equal(r.type, 'FootAdhesive');
  assert.ok(m.colors.FootAdhesive, 'the rubber colour rides in on adhesive builds');
  assert.equal(gen(build({})).colors.FootAdhesive, undefined, 'a printed-feet build emits no rubber colour');
  assert.ok(!/FootMarker/.test(JSON.stringify(m)), 'the placement-marker type is gone');
  // NO printed-foot render under the label "Adhesive rubber foot"
  assert.equal(r.img, undefined, 'the adhesive row shows no render (there is no photo of the bought part)');
  assert.ok(feetRows(gen(build({})))[0].img, 'the printed row keeps its render');
  // pressed on, not slid in: it has no rail to enter a slot with
  const step = m.steps.find(s => /stick on the 6 feet/.test(s.title));
  assert.ok(step, 'the adhesive step is titled "stick on"');
  assert.ok(/same height/.test(step.note), 'the note states the height is unchanged');
  assert.ok(step.phases.every(p => p.enter && !p.fade), 'the adhesive step presses the feet on');
  assert.ok(step.phases.every(p => p.enter.every(e => e.from[1] < 0 && !e.from[0] && !e.from[2])),
    'straight up onto the pad, never sideways into a slot');
  const printedStep = gen(build({})).steps.find(s => /insert the/.test(s.title));
  assert.ok(printedStep.phases.every(p => p.enter.every(e => e.from[1] === 0)), 'the printed step still slides in level');
});

test('both feet GLBs exist in every collection pool', () => {
  // generated builds load from parts/<collection>/, so a node that is missing
  // from one pool is a production hang on that collection, not a test failure
  for (const c of ['59', '115', '165', '185', '240', '270']) {
    for (const node of ['Tabletop-Kit-Foot', 'Adhesive-Foot']) {
      assert.ok(existsSync(join(root, 'viewer', 'parts', c, node + '.lib.glb')),
        `viewer/parts/${c}/${node}.lib.glb is missing`);
    }
  }
});

test('the footrail path swaps the node too, not just the case-feet path', () => {
  // two bottom-row cases -> foot rails carry the feet (the confirmed rule is
  // the COUNT of bottom-row cases, never their width)
  const twoCases = build({
    feet: 'adhesive',
    placed: [
      { id: 1, x: 0, y: 6, w: 1, hh: 2, fill: 'classic', shelves: 0, closure: 'none' },
      { id: 2, x: 1, y: 6, w: 1, hh: 2, fill: 'classic', shelves: 0, closure: 'none' },
    ], nextId: 3,
  });
  const m = gen(twoCases);
  assert.ok((m.parts || []).some(p => p.node === 'FR-L_185-2W'), 'two cases take foot rails');
  assert.ok(!(m.instances || []).some(i => i.node === 'Tabletop-Kit-Foot'), 'no printed feet on an adhesive rail build');
  assert.ok((m.instances || []).filter(i => i.node === 'Adhesive-Foot').length > 0);
});

test('the printed-feet manifest is byte-identical to before the feet option existed', () => {
  // the ten committed kit goldens depend on this: the option must be additive
  const m = gen(build({}));
  assert.equal(m.parts.filter(p => p.type === 'FootAdhesive').length, 0);
  assert.equal(JSON.stringify(m), JSON.stringify(gen(build({ feet: 'tpu' }))), 'explicit tpu === default');
});

test('an unknown value falls back to printed feet (the planner sanitizes the same way)', () => {
  const m = gen(build({ feet: 'nonsense' }));
  assert.equal(feetRows(m)[0].label, 'Tabletop Kit Foot');
});
