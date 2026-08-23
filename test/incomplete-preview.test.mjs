/* THE IN-PROGRESS TABLETOP PREVIEW (2026-08-23).
 *
 * A tabletop kit is built column by column, so one run is shorter than its
 * tallest column for a while. That used to be a generator ERROR (and a red
 * warning + a blocking modal in the docked viewer). It is now a renderable
 * state: the manifest carries the deficit from the SHARED contract
 * (viewer/js/vendor/tabletop-completion.js == the planner's), ghost volumes
 * over the missing cells, covers at the intended top marked `planned` where
 * their footprint touches a short column, and ONE carrier step. Real faults
 * still refuse the build, and a level layout is untouched - the ten official
 * kit goldens are the proof of that last part (test/official-builds.test.mjs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateManifest } from '../viewer/js/generate.js';

const PITCH_X = 88, HALF = 28, ROW0 = 17.65;   // the generator's own constants
const base = {
  mount: 'tabletop', length: 185, printer: 'any', customBed: { x: null, y: null }, spaceW: null, spaceH: null,
  faceStyle: 'classic', doorStyle: 'essential', handleStyle: 'deco', wallStagger: false, backCover: false,
  removedStoppers: [], gridW: 6, gridH: 4, nextId: 99,
};
const u = (id, x, y, w, hh, fill = 'decor') => ({ id, x, y, w, hh, fill, shelves: 0, closure: 'none' });
const gen = (placed, extra = {}) => generateManifest({ ...base, ...extra, placed });
const covers = (m) => m.instances.filter(i => /^C[LU]-/.test(i.node));
const cols = (m) => m.instances.filter(i => /_Case$/.test(i.node));

test('one short column: the deficit, one ghost, covers at the intended top and planned', () => {
  // col 0 two rows tall, col 1 one row: rows 4-5 of col 1 are missing (grid 4H = 8 half-rows)
  const g = gen([u(1, 0, 4, 1, 2), u(2, 0, 6, 1, 2), u(3, 1, 6, 1, 2)]);
  assert.deepEqual(g.errors, []);
  const m = g.manifest;
  assert.deepEqual(m.incomplete, { areas: 1, cells: 2, columns: 1 });
  assert.equal(m.ghosts.length, 1);
  const [gh] = m.ghosts;
  // col 1 of a 2-wide build is centred at +44; the box sits on the bottom row's top
  assert.deepEqual(gh.pos, [PITCH_X / 2, ROW0 + 2 * HALF, 0]);
  assert.deepEqual(gh.size, [PITCH_X, 2 * HALF, 185]);
  assert.equal(gh.halfRows, 2);
  // the covers sit at the TARGET top (the tall column's), and the ghost's top meets them
  const cl = covers(m).filter(i => i.node.startsWith('CL-'));
  assert.equal(cl.length, 1);
  assert.equal(cl[0].pos[1], ROW0 + 4 * HALF);
  assert.equal(gh.pos[1] + gh.size[1], cl[0].pos[1], 'the ghost fills exactly up to the cover');
  assert.ok(covers(m).every(i => i.planned), 'every tile spans the short column here');
});

test('planned is decided per tile footprint: tiles wholly over level columns stay normal', () => {
  // three columns, the MIDDLE one short: CL tiles [2W over cols 0-1, 1W over col 2], CU [1W over col 0, 2W over cols 1-2]
  const g = gen([u(1, 0, 4, 1, 2), u(2, 0, 6, 1, 2), u(3, 1, 6, 1, 2), u(4, 2, 4, 1, 2), u(5, 2, 6, 1, 2)]);
  const m = g.manifest;
  assert.equal(m.incomplete.columns, 1);
  const tiles = covers(m).map(i => ({ node: i.node, x: i.pos[0], planned: !!i.planned })).sort((a, b) => a.node.localeCompare(b.node) || a.x - b.x);
  const byNode = Object.fromEntries(tiles.map(t => [t.node + '@' + t.x, t.planned]));
  // a 2W tile's centre sits on a column seam; the 1W tiles sit on column centres
  assert.equal(byNode['CL-185-2W@-44'], true, 'CL 2W over cols 0-1 touches the short col 1');
  assert.equal(byNode['CL-185-1W@88'], false, 'CL 1W over col 2 is installable today');
  assert.equal(byNode['CU-185-1W@-88'], false, 'CU 1W over col 0 is installable today');
  assert.equal(byNode['CU-185-2W@44'], true, 'CU 2W over cols 1-2 touches the short col 1');
  // and the parts list says which rows carry a planned tile
  const notes = Object.fromEntries(m.parts.filter(p => /^Cover/.test(p.label)).map(p => [p.label, p.note || '']));
  assert.match(notes['Cover Lower 185-2W'], /Planned/);
  assert.equal(notes['Cover Lower 185-1W'], '');
});

test('a staircase is ONE area drawn as two ghosts; ghosts never reach the parts list', () => {
  const g = gen([u(1, 0, 2, 1, 2), u(2, 0, 4, 1, 2), u(3, 0, 6, 1, 2), u(4, 1, 4, 1, 2), u(5, 1, 6, 1, 2), u(6, 2, 6, 1, 2)]);
  const m = g.manifest;
  assert.deepEqual(m.incomplete, { areas: 1, cells: 6, columns: 2 });
  assert.equal(m.ghosts.length, 2);
  assert.deepEqual(m.ghosts.map(x => x.halfRows), [2, 4]);
  assert.equal(m.ghosts.reduce((n, x) => n + x.halfRows, 0), m.incomplete.cells, 'the ghosts tile exactly the missing cells');
  assert.ok(!m.parts.some(p => /ghost/i.test(p.node) || /ghost/i.test(p.label)), 'no ghost row');
  assert.ok(!m.instances.some(i => /ghost/i.test(i.node)), 'no ghost instance');
});

test('the rule is per run: a finished short stack beside an unfinished one gets no ghost and keeps solid covers', () => {
  const g = gen([u(1, 0, 4, 1, 2), u(2, 0, 6, 1, 2), u(3, 1, 6, 1, 2), u(4, 4, 6, 1, 2)]);   // run A cols 0-1 (col 1 short), run B col 4 alone
  const m = g.manifest;
  assert.deepEqual(m.incomplete, { areas: 1, cells: 2, columns: 1 });
  assert.equal(m.ghosts.length, 1);
  const runB = covers(m).filter(i => i.pos[0] > 150);   // col 4 of a 5-wide build sits at +176
  assert.ok(runB.length >= 2, 'run B has its own covers');
  assert.ok(runB.every(i => !i.planned), 'run B is level: its covers are installable');
  // two separate stacks of DIFFERENT heights are simply complete
  const two = gen([u(1, 0, 4, 1, 2), u(2, 0, 6, 1, 2), u(3, 4, 6, 1, 2)]).manifest;
  assert.equal(two.incomplete, undefined);
  assert.equal(two.ghosts, undefined);
  assert.ok(two.steps.length > 1, 'a complete build gets its full instructions');
});

test('0.5H gaps are measured in half-rows; a 2W unit makes two columns short or level at once', () => {
  const half = gen([u(1, 0, 3, 1, 1), u(2, 0, 4, 1, 2), u(3, 0, 6, 1, 2), u(4, 1, 4, 1, 2), u(5, 1, 6, 1, 2)]).manifest;
  assert.deepEqual(half.incomplete, { areas: 1, cells: 1, columns: 1 });
  assert.deepEqual(half.ghosts[0].size, [PITCH_X, HALF, 185]);
  const wide = gen([u(1, 0, 4, 2, 2), u(2, 0, 6, 1, 2), u(3, 1, 6, 1, 2), u(4, 2, 6, 1, 2)]).manifest;   // a 2W on top of cols 0-1, col 2 short
  assert.deepEqual(wide.incomplete, { areas: 1, cells: 2, columns: 1 });
  assert.equal(wide.ghosts[0].pos[0], (2 + 0.5 - 3 / 2) * PITCH_X);
});

test('the carrier step places everything, un-staged, and is the ONLY step', () => {
  const m = gen([u(1, 0, 4, 1, 2), u(2, 0, 6, 1, 2), u(3, 1, 6, 1, 2)]).manifest;
  assert.equal(m.steps.length, 1);
  assert.equal(m.steps[0].preview, true);
  assert.match(m.steps[0].note, /still in progress/);
  const entered = new Set(m.steps[0].phases.flatMap(ph => (ph.enter || []).map(e => e.id)));
  assert.equal(entered.size, m.instances.length, 'every instance enters in the one phase');
  assert.ok(m.instances.every(i => !i.stage), 'no staged subassembly - every pos is final');
});

test('a real fault still refuses the build: an unfinished run never launders a floating unit', () => {
  const g = gen([u(1, 0, 6, 1, 2), u(2, 1, 6, 1, 2), u(3, 1, 2, 1, 2)]);   // col 1 has a unit floating above a gap
  assert.equal(g.manifest, null);
  assert.ok(g.errors.some(e => /floating/i.test(e)), g.errors.join(' | '));
});

test('hanging mounts keep the flat-top refusal (their uneven top is a unit with nothing to hang from)', () => {
  const g = gen([u(1, 0, 0, 1, 2), u(2, 0, 2, 1, 2), u(3, 1, 2, 1, 2)], { mount: 'wall' });
  assert.equal(g.manifest, null);
  assert.ok(g.errors.length >= 1);
});

test('filling the deficit does not change the cover rows - the BOM billed the intended covers all along', () => {
  const before = gen([u(1, 0, 4, 1, 2), u(2, 0, 6, 1, 2), u(3, 1, 6, 1, 2)]).manifest;
  const after = gen([u(1, 0, 4, 1, 2), u(2, 0, 6, 1, 2), u(3, 1, 6, 1, 2), u(4, 1, 4, 1, 2)]).manifest;
  const rows = (m) => m.parts.filter(p => /^Cover/.test(p.label)).map(p => p.label + ' x' + p.qty).sort();
  assert.deepEqual(rows(before), rows(after));
  assert.equal(after.incomplete, undefined);
  assert.ok(!after.instances.some(i => i.planned));
  assert.ok(!after.parts.some(p => /Planned/.test(p.note || '')));
});
