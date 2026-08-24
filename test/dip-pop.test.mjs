/* QuickLock dip-and-pop emission (2026-08-24, ground truth: Joey's spring
   video). A seated QuickLock's tab is pressed down while a unit's channel
   slides over it and springs up into the keyhole at full seat. The generator
   emits `dip` on the sliding phase (settle / sync enter / move) and a `pop`
   phase after it; the engine holds the tab down between the two and lands it
   at exactly zero, riding the same self-healing inner-child channel as spin.

   The invariant that keeps prev/jump deterministic: EVERY dipped id is popped
   later in the SAME step. These tests sweep it across all three mounts. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateManifest } from '../viewer/js/generate.js';

const baseBuild = (over = {}) => ({
  mount: 'tabletop', length: 185, printer: 'any', customBed: { x: null, y: null },
  spaceW: null, spaceH: null, faceStyle: 'classic', doorStyle: 'essential',
  handleStyle: 'deco', wallStagger: false, backCover: false, feet: 'tpu',
  removedStoppers: [], gridW: 6, gridH: 4, nextId: 9, ...over,
});
// the starter-kit shape: 2W-1H on top of two 1W-1H
const starterPlaced = [
  { id: 1, x: 2, y: 6, w: 1, hh: 2, fill: 'decor', shelves: 0 },
  { id: 2, x: 3, y: 6, w: 1, hh: 2, fill: 'decor', shelves: 0 },
  { id: 3, x: 2, y: 4, w: 2, hh: 2, fill: 'decor', shelves: 0 },
];
const gen = (over) => {
  const g = generateManifest(baseBuild(over));
  assert.ok(g.manifest, (g.errors || []).join(' · '));
  return g.manifest;
};

const phasesOf = (m) => m.steps.flatMap(s => s.phases || []);
const dipsInStep = (s) => (s.phases || []).flatMap(p => p.dip || []);
const popsInStep = (s) => (s.phases || []).flatMap(p => p.pop || []);

test('every dipped id is popped later in the SAME step, in every mount', () => {
  for (const over of [
    { placed: starterPlaced },
    { mount: 'wall', placed: starterPlaced },
    { mount: 'wall', wallStagger: true, placed: starterPlaced },
    { mount: 'under-table', placed: starterPlaced },
  ]) {
    const m = gen(over);
    let dippedSomewhere = 0;
    for (const s of m.steps) {
      const phases = s.phases || [];
      for (let i = 0; i < phases.length; i++) {
        for (const d of phases[i].dip || []) {
          dippedSomewhere++;
          const popped = phases.slice(i + 1).some(p => (p.pop || []).some(x => x.id === d.id));
          assert.ok(popped, `${over.mount || 'tabletop'}: ${d.id} dipped in "${s.title}" but never popped`);
          assert.ok(d.from >= 0.1 && d.from <= 0.92, `${d.id} from=${d.from} out of range`);
        }
      }
    }
    assert.ok(dippedSomewhere > 0, `${over.mount || 'tabletop'}: no dips emitted at all`);
  }
});

test('tabletop: an upper case dips exactly the QuickLocks of the cases under it', () => {
  const m = gen({ placed: starterPlaced });
  // unit order is bottom-up: units 0,1 = the two 1W (row 0), unit 2 = the 2W above
  const caseStep = m.steps.find(s => /^Case .*2W-1H/.test(s.title));
  assert.ok(caseStep, 'the 2W upper case has a step');
  const dips = dipsInStep(caseStep).map(d => d.id).sort();
  assert.deepEqual(dips, ['ql0L', 'ql0R', 'ql1L', 'ql1R'], 'both lower cases, both tabs');
  assert.deepEqual(popsInStep(caseStep).map(p => p.id).sort(), dips, 'same ids pop');
  // the dip rides the settle phase (the back-to-front slide), not the drop-in
  const settlePhase = caseStep.phases.find(p => p.settle);
  assert.ok(settlePhase.dip && settlePhase.dip.length === 4);
  // contact timing: the tab sits near the front face, so contact is late in
  // the slide (185: leading edge covers the tab ~90% in)
  assert.ok(Math.abs(settlePhase.dip[0].from - 0.897) < 0.01, `from=${settlePhase.dip[0].from}`);
});

test('tabletop: a base-row case dips nothing (no QuickLocks under it), the lower covers dip every top tab', () => {
  const m = gen({ placed: starterPlaced });
  const benchStep = m.steps.find(s => /^Bench: bottom case/.test(s.title) || /bottom case/.test(s.title));
  if (benchStep) assert.equal(dipsInStep(benchStep).length, 0);
  const clStep = m.steps.find(s => /^Lower cover/.test(s.title));
  assert.ok(clStep, 'lower covers step exists');
  // top row = the 2W case (unit index 2)
  assert.deepEqual(dipsInStep(clStep).map(d => d.id).sort(), ['ql2L', 'ql2R']);
  assert.deepEqual(popsInStep(clStep).map(p => p.id).sort(), ['ql2L', 'ql2R']);
});

test('hanging mounts: the SLIDING case dips its own QuickLocks (they engage the row above / the rails)', () => {
  for (const mount of ['wall', 'under-table']) {
    const m = gen({ mount, placed: starterPlaced });
    // lower-row steps: hangs reverse to top-down, so the 1W cases hang after the top
    const hangSteps = m.steps.filter(s => /^Hang case|Slide the case into the rails/.test(s.title));
    assert.ok(hangSteps.length >= 1, `${mount}: hang steps exist`);
    for (const s of hangSteps) {
      const dips = dipsInStep(s);
      if (!dips.length) continue; // the wall TOP case hangs on pegs - no dip
      const ids = dips.map(d => d.id);
      assert.equal(ids.length, 2, `${mount} "${s.title}" dips its own pair`);
      assert.match(ids[0], /^ql\d+L$/); assert.match(ids[1], /^ql\d+R$/);
      assert.equal(ids[0].replace('L', ''), ids[1].replace('R', ''), 'same case, both hands');
    }
    // every non-top hang dips; under-table top row dips too (the rail channel)
    const dippingHangs = hangSteps.filter(s => dipsInStep(s).length);
    assert.ok(dippingHangs.length >= (mount === 'under-table' ? 3 : 2), `${mount}: enough hangs dip`);
  }
});

test('partial overlap dips only the tabs actually under the slider', () => {
  // a 2W case whose left half sits on a 1W case, right half on a 2W case that
  // extends beyond it: the far tab of the wide supporter stays untouched
  // top row must LEVEL the run or the in-progress preview takes over (the
  // carrier manifest has no case steps at all - the first fixture did this)
  const m = gen({ placed: [
    { id: 1, x: 1, y: 6, w: 1, hh: 2, fill: 'decor', shelves: 0 },
    { id: 2, x: 2, y: 6, w: 2, hh: 2, fill: 'decor', shelves: 0 },
    { id: 3, x: 1, y: 4, w: 2, hh: 2, fill: 'decor', shelves: 0 },
    { id: 4, x: 3, y: 4, w: 1, hh: 2, fill: 'decor', shelves: 0 },
  ] });
  assert.ok(!m.incomplete, 'fixture must be a complete tabletop');
  // unit order bottom-up: 0=1W@col0, 1=2W@col1 (bottom), 2=the 2W above (Case 3)
  const caseStep = m.steps.find(s => /^Case 3 /.test(s.title));
  const dips = dipsInStep(caseStep).map(d => d.id).sort();
  // unit 0 = 1W (both tabs under), unit 1 = 2W supporter (only its LEFT tab
  // lies inside the upper case's span; its right tab sits under Case 4)
  assert.deepEqual(dips, ['ql0L', 'ql0R', 'ql1L']);
  const caseStep4 = m.steps.find(s => /^Case 4 /.test(s.title));
  assert.deepEqual(dipsInStep(caseStep4).map(d => d.id).sort(), ['ql1R'],
    "the wide supporter's far tab dips under the case that actually covers it");
});

test('the incomplete-preview carrier step never dips', () => {
  const m = gen({ placed: [
    { id: 1, x: 2, y: 6, w: 1, hh: 2, fill: 'decor', shelves: 0 },
    { id: 2, x: 3, y: 6, w: 1, hh: 2, fill: 'decor', shelves: 0 },
    { id: 3, x: 2, y: 4, w: 1, hh: 2, fill: 'decor', shelves: 0 },   // one column short
  ] });
  assert.ok(m.incomplete, 'fixture is an in-progress tabletop');
  for (const s of m.steps) assert.equal(dipsInStep(s).length + popsInStep(s).length, 0);
});
