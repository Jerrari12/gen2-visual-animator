/* GRIDFINITY DECOR DRAWERS (v2609, 2026-09-18)
 *
 * A per-unit VARIANT of the Decor drawer (`variant: 'gridfinity'` on a decor
 * unit; absence = the standard drawer). Only the body, its BOM row and its links
 * change: the outer envelope is the standard Decor drawer's to 0.02 mm (vault
 * measurements.md "Gridfinity Decor drawers (v2609)"), so it must land on
 * EXACTLY the pose the Decor drawer would have. It takes no faceplate back cover:
 * its tear-away front does that job and physically blocks one (Joey 2026-09-18).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const G = await import(new URL('../viewer/js/generate.js', import.meta.url).href);
const { generateManifest, GRIDFINITY, isGridfinity, gridfinitySizeOk } = G;

/* planner coordinates: `y` is the unit's TOP row in half-units and the floor is
   at 2 * gridH, so every unit here sits on the floor at y = 6 - hh (gridH 3 fits 3H) */
const build = (L, o = {}) => ({
  mount: L === 59 ? 'wall' : 'tabletop', length: L, faceStyle: 'classic', handleStyle: 'deco',
  wallStagger: false, backCover: false, feet: 'tpu', removedStoppers: [],
  gridW: 8, gridH: 3, nextId: 3, placed: [], ...o,
});
const decor = (id, x, w, hh, o = {}) => ({ id, x, y: 6 - hh, w, hh, fill: 'decor', ...o });
const ok = (b, why) => {
  const g = generateManifest(b);
  assert.deepEqual(g.errors || [], [], `${why}: ${(g.errors || []).join(' ')}`);
  return g.manifest;
};
const inst = (m, re) => m.instances.filter((i) => re.test(i.node));
const row = (m, re) => m.parts.find((p) => re.test(p.node));
const H = { 2: '1', 3: '15', 4: '2' };
// a drawer BODY - never /Drawer_/, which also matches the Drawer_Stoppers_L/R nodes
const BODY = /^(Decor|Classic|GridfinityDecor)Drawer_/;

test('a Gridfinity decor unit gets the Gridfinity body, on exactly the Decor drawer pose', () => {
  for (const L of GRIDFINITY.lengths) {
    for (const hh of GRIDFINITY.hh) {
      for (const w of [1, 2, 3, 4]) {
        const std = ok(build(L, { placed: [decor('u1', 0, w, hh)] }), `${L} std ${w}W ${hh}`);
        const gf = ok(build(L, { placed: [decor('u1', 0, w, hh, { variant: 'gridfinity' })] }), `${L} gf ${w}W ${hh}`);
        const a = inst(std, /^DecorDrawer_/), b = inst(gf, /^GridfinityDecorDrawer_/);
        assert.equal(b.length, 1, `${L}-${w}W hh${hh}: one Gridfinity drawer`);
        assert.equal(inst(gf, /^DecorDrawer_/).length, 0, `${L}-${w}W hh${hh}: and no standard body beside it`);
        assert.equal(b[0].node, `GridfinityDecorDrawer_${L}-${w}W-${H[hh]}H`);
        assert.deepEqual(b[0].pos, a[0].pos, `${L}-${w}W hh${hh}: same pose as the Decor drawer it replaces`);
        assert.equal(b[0].id, a[0].id, 'same instance id, so riders and step phases still find it');
      }
    }
  }
});

test('its BOM row names the part, counts the grid and the optional magnets, and says it is not published yet', () => {
  const m = ok(build(185, { placed: [decor('u1', 0, 2, 2, { variant: 'gridfinity' })] }), '185 2W-1H');
  const r = row(m, /^GridfinityDecorDrawer_/);
  assert.ok(r, 'billed');
  assert.equal(r.label, 'Gridfinity Decor Drawer 185-2W-1H');
  assert.equal(r.type, 'Drawer', 'a drawer like any other: focus, interior dims, glides, closure sync');
  assert.match(r.note, /3 x 4 Gridfinity grid/);
  assert.match(r.note, /up to 48 optional 6x2 mm magnets/);
  assert.match(r.note, /tear-away front/);
  assert.match(r.note, /coming soon/, 'no page yet: says so instead of linking the standard Decor page');
  assert.ok(!r.links, 'no links until the MODULITH pages exist - never the standard Decor page');
  // grid size follows width and length (2W - 1 across; 2-6 deep by length)
  for (const [L, deep] of Object.entries(GRIDFINITY.cellsDeep)) {
    for (const w of [1, 2, 3, 4]) {
      const mm = ok(build(+L, { placed: [decor('u1', 0, w, 2, { variant: 'gridfinity' })] }), `${L}-${w}W`);
      const across = 2 * w - 1;
      assert.match(row(mm, /^GridfinityDecorDrawer_/).note, new RegExp(`^${across} x ${deep} Gridfinity grid`));
    }
  }
});

test('a Gridfinity drawer takes no back cover - its tear-away front does that job', () => {
  const b = build(185, {
    backCover: true,
    placed: [decor('u1', 0, 1, 2), decor('u2', 1, 1, 2, { variant: 'gridfinity' }), decor('u3', 2, 1, 2, { variant: 'gridfinity' })],
    nextId: 4,
  });
  const m = ok(b, 'mixed with back covers');
  assert.equal(inst(m, /^BackCover_/).length, 1, 'only the standard drawer gets a cover');
  assert.equal(row(m, /^BackCover_/).qty, 1, 'and only it is billed');
  // every back-cover phase references a cover that exists
  const ids = new Set(m.instances.map((i) => i.id));
  for (const s of m.steps) for (const ph of s.phases || []) {
    for (const k of ['enter', 'move', 'fade']) for (const it of ph[k] || []) {
      assert.ok(ids.has(it.id), `step "${s.title}" ${k}s ${it.id}, which is not in the manifest`);
    }
  }
  const fp = m.steps.find((s) => /^Faceplates/.test(s.title));
  assert.match(fp.note, /back cover/, 'the standard drawer still needs the instruction');
  assert.match(fp.note, /not on the Gridfinity drawers/);

  const onlyGrid = ok(build(185, { backCover: true, placed: [decor('u1', 0, 2, 2, { variant: 'gridfinity' })] }), 'all Gridfinity');
  assert.equal(inst(onlyGrid, /^BackCover_/).length, 0);
  assert.equal(row(onlyGrid, /^BackCover_/), undefined);
  assert.doesNotMatch(onlyGrid.steps.find((s) => /^Faceplates/.test(s.title)).note, /back cover/,
    'a build of only Gridfinity drawers never tells you to fit a cover');
});

test('the faceplate, handle and magnet closure are unchanged on a Gridfinity drawer', () => {
  for (const faceStyle of ['classic', 'essential', 'edgelabel']) {
    const std = ok(build(185, { faceStyle, placed: [decor('u1', 0, 2, 2, { closure: 'magnet' })] }), 'std');
    const gf = ok(build(185, { faceStyle, placed: [decor('u1', 0, 2, 2, { closure: 'magnet', variant: 'gridfinity' })] }), 'gf');
    const strip = (m) => m.instances.filter((i) => !BODY.test(i.node)).map((i) => [i.id, i.node, i.pos]);
    assert.deepEqual(strip(gf), strip(std), `${faceStyle}: everything but the body is identical`);
  }
});

test('a variant on a size or fill with no Gridfinity drawer renders the standard part, and is kept', () => {
  const cases = [
    [185, { fill: 'decor', w: 2, hh: 1 }, /^DecorDrawer_185-2W-05H$/],   // 0.5H
    [185, { fill: 'decor', w: 1, hh: 6 }, /^DecorDrawer_185-1W-3H$/],    // 3H
    [59, { fill: 'decor', w: 1, hh: 2 }, /^DecorDrawer_59-1W-1H$/],      // no 59 Gridfinity
    [185, { fill: 'classic', w: 1, hh: 2 }, /^ClassicDrawer_185-1W-1H$/],
  ];
  for (const [L, u, re] of cases) {
    const unit = { id: 'u1', x: 0, y: 6 - u.hh, ...u, variant: 'gridfinity' };
    assert.equal(isGridfinity(L, unit), false);
    const m = ok(build(L, { placed: [unit] }), `${L} ${JSON.stringify(u)}`);
    assert.equal(inst(m, /^GridfinityDecorDrawer_/).length, 0);
    assert.equal(inst(m, re).length, 1, `${L} ${JSON.stringify(u)}: the standard part`);
  }
  assert.equal(gridfinitySizeOk(185, { fill: 'decor', hh: 2 }), true);
  assert.equal(isGridfinity(185, { fill: 'decor', hh: 2 }), false, 'absence is the standard drawer');
  assert.equal(isGridfinity(185, { fill: 'decor', hh: 2, variant: 'standard' }), false, 'only the one known value switches it');
});

test('every drawer body names its planner unit, so the identify card can switch it', () => {
  const b = build(185, {
    placed: [decor('u1', 0, 1, 2), decor('u2', 1, 1, 2, { variant: 'gridfinity' }),
      { id: 'u3', x: 2, y: 4, w: 1, hh: 2, fill: 'classic' }, decor('u4', 3, 1, 1)],
    nextId: 5,
  });
  const m = ok(b, 'mixed bodies');
  const bodies = m.instances.filter((i) => BODY.test(i.node));
  assert.equal(bodies.length, 4, 'one body per drawer unit');
  assert.deepEqual(bodies.map((i) => i.owner).sort(), ['u1', 'u2', 'u3', 'u4'],
    'a drawer body without its unit id: the Standard / Gridfinity switch cannot find what to change');
});

test('every Gridfinity drawer the generator can name has its GLB in the pool and its thumbnail', () => {
  const root = new URL('../viewer/', import.meta.url);
  for (const L of GRIDFINITY.lengths) for (const hh of GRIDFINITY.hh) for (const w of [1, 2, 3, 4]) {
    const node = `GridfinityDecorDrawer_${L}-${w}W-${H[hh]}H`;
    assert.ok(fs.existsSync(new URL(`parts/${L}/${node}.lib.glb`, root)), `${node}.lib.glb missing from parts/${L}/`);
    assert.ok(fs.existsSync(new URL(`img/parts/Gridfinity Decor Drawer ${L}-${w}W-${H[hh]}H.png`, root)), `${node}: thumbnail missing`);
  }
});
