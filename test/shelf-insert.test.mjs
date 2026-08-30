/* SHELF INSERTS + SHELF LIPS (2026-08-28)
 *
 * The defect this suite exists to prevent came FIRST: before the inserts were
 * wired, `fill: 'shelf'` at 1H passed every guard, generated with no errors and
 * no warnings, and produced a BARE CASE. The planner offered Shelf, the viewer
 * silently showed an empty box, and nothing anywhere said so. Height was
 * guarded (`hh !== 2`); the part simply was not emitted. So the first test here
 * is the one that would have caught it, and it asserts on the PART, never on
 * the absence of errors.
 *
 * The placement numbers are MEASURED off Joey's case-and-insert render scene -
 * see the SHELF/LIP block in generate.js for the contact analysis. They are
 * pinned here so a re-derivation has to be deliberate.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { generateManifest } = await import(
  new URL('../viewer/js/generate.js', import.meta.url).href);

const LENGTHS = [59, 115, 165, 185, 240, 270];
/* 59 is a hanging-only collection (COLL[59].noTabletop), so it takes wall. */
const mountFor = (L) => (L === 59 ? 'wall' : 'tabletop');
const build = (L, o = {}) => ({
  mount: mountFor(L), length: L, faceStyle: 'essential', handleStyle: 'deco',
  wallStagger: false, backCover: false, feet: 'tpu', removedStoppers: [],
  gridW: 6, gridH: 1, nextId: 2, placed: [], ...o,
});
const shelf = (w = 1, o = {}) => ({ id: 'u1', x: 0, y: 0, w, hh: 2, fill: 'shelf', ...o });

const ok = (b, why) => {
  const g = generateManifest(b);
  assert.deepEqual(g.errors || [], [], `${why}: ${(g.errors || []).join(' ')}`);
  return g.manifest;
};
const nodes = (m, re) => m.instances.filter((i) => re.test(i.node));
const row = (m, re) => m.parts.find((p) => re.test(p.node));

/* ---- 1. the silent-empty-case regression -------------------------------- */

test('a 1H shelf actually gets a shelf insert - in every collection, on every mount', () => {
  for (const L of LENGTHS) {
    for (const mount of ['tabletop', 'wall', 'under-table']) {
      if (L === 59 && mount === 'tabletop') continue;
      for (const w of [1, 2]) {
        const m = ok(build(L, { mount, placed: [shelf(w)] }), `${L}/${mount}/${w}W`);
        const ins = nodes(m, /^ShelfInsert_/);
        assert.equal(ins.length, 1, `${L}/${mount}/${w}W: expected exactly one shelf insert`);
        assert.equal(ins[0].node, `ShelfInsert_${L}-${w}W`,
          `${L}/${mount}/${w}W: the insert must be this collection's own part`);
        assert.ok(row(m, /^ShelfInsert_/), `${L}/${mount}/${w}W: the insert must be billed`);
      }
    }
  }
});

test('a shelf unit is not silently treated as an empty case', () => {
  // the pre-2026-08-28 behaviour, stated as the thing that must never return
  const m = ok(build(185, { placed: [shelf(1)] }), '185 shelf');
  const bare = ok(build(185, { placed: [{ ...shelf(1), fill: 'decor' }] }), '185 decor');
  assert.notDeepEqual(
    m.parts.map((p) => p.node).sort(),
    bare.parts.filter((p) => !/Drawer|Faceplate|Handle|Screw|Stopper/.test(p.node)).map((p) => p.node).sort(),
    'a shelf build must differ from a drawer build by more than the drawer');
});

/* ---- 2. placement, against the measured contacts ------------------------ */

test('the insert seats 2.4 mm below the case bottom and is FLUSH AT THE FRONT', () => {
  for (const L of LENGTHS) {
    const m = ok(build(L, { mount: 'wall', placed: [shelf(1)] }), `${L} wall shelf`);
    const caseInst = m.instances.find((i) => /_Case$/.test(i.node));
    const ins = nodes(m, /^ShelfInsert_/)[0];
    assert.equal(+(ins.pos[1] - caseInst.pos[1]).toFixed(3), -2.4,
      `${L}: insert bottom must sit 2.4 mm below the case bottom (its integrated stoppers poke through the floor)`);
    /* Front-flush + centred means z = L/2 - (L-8.8)/2 = +4.4 on EVERY
       collection. That the number does NOT move with length is the whole
       point - it is what distinguishes this part from the shared hardware
       that references a case face and needs a per-length dz. */
    assert.equal(ins.pos[2], 4.4, `${L}: insert z-centre must be +4.4`);
  }
});

test('the lip is front-flush, so its z DOES track the collection length', () => {
  for (const L of LENGTHS) {
    const m = ok(build(L, { mount: 'wall', placed: [shelf(1, { lip: 'front' })] }), `${L} lip`);
    const caseInst = m.instances.find((i) => /_Case$/.test(i.node));
    const lip = nodes(m, /^ShelfLip_/)[0];
    assert.ok(lip, `${L}: lip: true must place a lip`);
    assert.equal(+(lip.pos[1] - caseInst.pos[1]).toFixed(3), 6.45,
      `${L}: the lip stands 5.0 mm above the shelf surface`);
    assert.equal(+lip.pos[2].toFixed(3), +(L / 2 - 8).toFixed(3),
      `${L}: the lip is 16 deep and front-flush, so its centre is L/2 - 8`);
  }
});

test('the lip is width-matched to its insert and is OFF by default', () => {
  for (const w of [1, 2, 3, 4]) {
    const on = ok(build(185, { placed: [shelf(w, { lip: 'front' })] }), `185 ${w}W lip on`);
    assert.equal(nodes(on, /^ShelfLip_/)[0].node, `ShelfLip_${w}W`);
    assert.equal(row(on, /^ShelfLip_/).qty, 1, 'exactly one lip per shelf');
    const off = ok(build(185, { placed: [shelf(w)] }), `185 ${w}W lip absent`);
    assert.equal(nodes(off, /^ShelfLip_/).length, 0, 'no lip unless asked for');
    assert.equal(row(off, /^ShelfLip_/), undefined, 'an unasked-for lip is not billed');
  }
});

/* ---- the mid lip (240 / 270 only) -------------------------------------- */

test('only 240 and 270 take a mid lip - and the offset is absolute, not a fraction', () => {
  /* MEASURED off the shipped decks: the lip's tabs drop through openings in the
     deck, and only these two lengths carry a second pair. The gap behind the
     front lip is a round number on both, and it is NOT the same fraction of the
     depth (39.5% back on a 240, 58% on a 270) - so a proportional rule would be
     wrong on one of them. */
  for (const [L, gap] of [[240, 84], [270, 144]]) {
    const m = ok(build(L, { mount: 'wall', placed: [shelf(1, { lip: 'both' })] }), `${L} both`);
    const lips = nodes(m, /^ShelfLip_/);
    assert.equal(lips.length, 2, `${L}: 'both' must place two lips`);
    assert.equal(+(lips[0].pos[2] - lips[1].pos[2]).toFixed(3), gap,
      `${L}: the mid lip sits exactly ${gap} mm behind the front one`);
    assert.equal(lips[0].pos[1], lips[1].pos[1], 'both sit at the same height');
    assert.equal(lips[0].pos[0], lips[1].pos[0], 'both are centred on the shelf');
    assert.equal(row(m, /^ShelfLip_/).qty, 2, 'one part, two positions, so qty 2');
  }
});

test("'both' CLAMPS to the front lip where the deck has no mid slot", () => {
  for (const L of [59, 115, 165, 185]) {
    const m = ok(build(L, { mount: 'wall', placed: [shelf(1, { lip: 'both' })] }), `${L} both`);
    assert.equal(nodes(m, /^ShelfLip_/).length, 1,
      `${L}: no mid slot in this deck, so 'both' must fall back to one lip - not error, ` +
      'and not invent a position');
    assert.equal(row(m, /^ShelfLip_/).qty, 1);
  }
});

test('the mid lip lands inside the shelf, never off the back', () => {
  for (const L of [240, 270]) {
    const m = ok(build(L, { mount: 'wall', placed: [shelf(2, { lip: 'both' })] }), `${L}`);
    const ins = nodes(m, /^ShelfInsert_/)[0];
    const back = ins.pos[2] - (L - 8.8) / 2, front = ins.pos[2] + (L - 8.8) / 2;
    for (const lip of nodes(m, /^ShelfLip_/)) {
      assert.ok(lip.pos[2] - 8 > back && lip.pos[2] + 8 <= front + 0.01,
        `${L}: a lip at z=${lip.pos[2]} falls outside the deck (${back}..${front})`);
    }
  }
});

test('a rear-only shelf is not expressible - front first, always', () => {
  // Joey's rule 2026-08-28. Anything that is not 'front' or 'both' is no lip.
  for (const bad of ['mid', 'rear', 'back', true, 1, 'both ']) {
    const m = ok(build(240, { placed: [shelf(1, { lip: bad })] }), `240 lip=${bad}`);
    assert.equal(nodes(m, /^ShelfLip_/).length, 0,
      `lip: ${JSON.stringify(bad)} is not a legal mode and must place nothing`);
  }
});

/* ---- 3. the stopper rule (Joey 2026-08-28) ------------------------------ */

test('a drawer directly BELOW a shelf bills no stoppers - the insert brings its own', () => {
  /* y is top-down in half-height units; the bottom unit satisfies
     y + hh === 2 * gridH. Shelf on top, drawer underneath. */
  const stacked = (topFill) => ok(build(185, {
    gridH: 2,
    placed: [
      { id: 's1', x: 0, y: 0, w: 1, hh: 2, fill: topFill },
      { id: 'd1', x: 0, y: 2, w: 1, hh: 2, fill: 'decor' },
    ],
  }), `185 ${topFill}-over-drawer`);

  const underShelf = stacked('shelf');
  const underDrawer = stacked('decor');

  // the control proves the stoppers WOULD be there but for the shelf
  const ceilingStoppers = (m) => nodes(m, /^Drawer_Stoppers/).filter((i) => i.pos[1] < 100).length;
  assert.ok(ceilingStoppers(underDrawer) > 0,
    'control: a drawer under a drawer must still get its ceiling stopper pair');
  assert.equal(ceilingStoppers(underShelf), 0,
    'a drawer under a shelf must get NO ceiling stoppers - they would fight the insert for the same slot');
});

test('a shelf unit never bills stoppers of its own', () => {
  for (const mount of ['tabletop', 'wall', 'under-table']) {
    const m = ok(build(185, { mount, placed: [shelf(2)] }), `185/${mount}`);
    assert.equal(nodes(m, /^Drawer_Stoppers/).length, 0,
      `${mount}: a shelf has no drawer, so nothing needs stopping`);
  }
});

/* ---- 4. the install animation ------------------------------------------- */

test('the shelf is installed while the case top is still open, never after', () => {
  /* The insert is LOWERED in - its integrated stoppers pass down through slots
     in the case floor, and a tab cannot enter a floor slot sideways. So on
     every mount that shows the install, the insert's enter must come from
     ABOVE (+Y), and on a wall top case it must precede the Cover Lower, which
     caps the case. */
  const m = ok(build(185, { placed: [shelf(1, { lip: 'front' })] }), '185 tabletop shelf');
  const step = m.steps.find((s) => (s.phases || []).some(
    (p) => (p.enter || []).some((e) => /^sh\d/.test(e.id))));
  assert.ok(step, 'the shelf must be installed in some step');
  const ent = step.phases.flatMap((p) => p.enter || []).find((e) => /^sh\d/.test(e.id));
  assert.ok(ent.from[1] > 0 && ent.from[0] === 0 && ent.from[2] === 0,
    `the insert must drop straight down, got from=[${ent.from}]`);

  const wall = ok(build(185, { mount: 'wall', placed: [shelf(1)] }), '185 wall shelf');
  const wstep = wall.steps.find((s) => (s.phases || []).some(
    (p) => (p.enter || []).some((e) => /^sh\d/.test(e.id))));
  const order = wstep.phases.flatMap((p) => (p.enter || []).map((e) => e.id));
  const shAt = order.findIndex((id) => /^sh\d/.test(id));
  const clAt = order.findIndex((id) => /^cl\d/.test(id));
  assert.ok(shAt >= 0 && clAt >= 0, 'the wall top bench must install both the shelf and the Cover Lower');
  assert.ok(shAt < clAt, 'the shelf must go in BEFORE the Cover Lower caps the case');
});

test('every step that moves a shelf still nets back to zero', () => {
  /* prev/jump snap to a computed after-state, so a step whose `move` deltas do
     not cancel strands the part. The under-table demo case is the one that
     enters `at` a forward offset and relies on a later move to cancel it.
     ⚠ EXCEPT where the step COMMITS a stage: `land` (the wall's two-step
     staged hang - move back onto the pegs, drop 16, then land) and `settle`
     both carry the group to a new resting place on purpose, so their net
     displacement is the point, not a bug. */
  for (const mount of ['tabletop', 'wall', 'under-table']) {
    const m = ok(build(185, { mount, gridH: 1, placed: [shelf(1, { lip: 'front' })] }), mount);
    for (const s of m.steps) {
      if ((s.phases || []).some((p) => p.land || p.settle)) continue;
      const net = {};
      for (const p of s.phases || []) {
        for (const e of p.enter || []) {
          /* ⚠ The engine's net for an enter is `at + LAST via` — `via` are
             cumulative deltas from the landing point, and the tween ends on the
             last one. Counting `at` alone reported the shelf lip as stranded
             4.93 mm back the moment its dovetail path landed, which is the
             install working, not a defect. */
          const last = (e.via || []).length ? e.via[e.via.length - 1] : null;
          if (!e.at && !last) continue;
          net[e.id] = (net[e.id] || [0, 0, 0]).map((v, k) =>
            v + (e.at ? e.at[k] : 0) + (last ? last[k] : 0));
        }
        for (const mv of p.move || []) {
          net[mv.id] = (net[mv.id] || [0, 0, 0]).map((v, k) => v + mv.by[k]);
        }
      }
      for (const [id, d] of Object.entries(net)) {
        if (!/^(sh|lip)\d/.test(id)) continue;
        assert.deepEqual(d.map((v) => +v.toFixed(6)), [0, 0, 0],
          `${mount}: step "${s.title}" leaves ${id} displaced by [${d}]`);
      }
    }
  }
});

/* ---- 5. the BOM contract ------------------------------------------------ */

test('the insert is CORE on unit.fill and the lip is a real OPTION', () => {
  const m = ok(build(185, { placed: [shelf(1, { lip: 'front' })] }), '185 shelf+lip');
  const ins = row(m, /^ShelfInsert_/);
  assert.deepEqual(ins.requirement, { scope: 'core', obligationId: 'unit.fill' },
    'there is no "empty" fill - the insert IS how a shelf unit is filled');
  assert.equal(ins.basis.axis, 'fill');
  assert.equal(ins.basis.choice, 'shelf');

  const lip = row(m, /^ShelfLip_/);
  assert.equal(lip.requirement.scope, 'option',
    'the lip has a genuine off state, so it is an option, not core');
  assert.equal(lip.requirement.obligationId, 'shelf.retention');
  assert.equal(lip.basis.axis, 'shelf.lip');
});

/* PUBLISHED 2026-08-29. This used to assert the OPPOSITE - that neither part
   claimed a link while the pages did not exist. Inverted rather than deleted,
   because the interesting failure moved: the risk is no longer "a link appears
   too early" but "a length points at another length's page", which is exactly
   how the foot-rails list once slipped (165 carrying the 115 url). */
test('both parts link to their OWN length shelf page', () => {
  for (const L of [59, 115, 165, 185, 240, 270]) {
    // 59 is hanging-only, so the fixture must be a wall build to cover it
    const m = ok(build(L, { mount: 'wall', placed: [shelf(1, { lip: 'front' })] }), L + ' shelf+lip');
    for (const re of [/^ShelfInsert_/, /^ShelfLip_/]) {
      const r = row(m, re);
      assert.ok(r.links && r.links.p, r.node + ': published, so it must carry a store link');
      assert.ok(r.links.p.includes('gen2-' + L + '-shelf-inserts'),
        r.node + ': links to ' + r.links.p + ' - that is not the ' + L + ' page');
      assert.doesNotMatch(r.note || '', /not published/i, r.node + ': the coming-soon note must be gone');
      assert.ok(r.img, r.node + ': the BOM thumbnail should still show');
    }
    /* The lip ships INSIDE the insert download, so its row has to say so - a
       button reading "Printables" that opens a page named for the inserts is
       otherwise indistinguishable from a mis-link. */
    assert.match(row(m, /^ShelfLip_/).note || '',
      new RegExp('Included in the ' + L + ' shelf insert download'),
      L + ': the lip must explain why its download is the insert page');
    assert.equal(row(m, /^ShelfInsert_/).links.p, row(m, /^ShelfLip_/).links.p,
      L + ': both rows must resolve to the SAME page');
  }
});

test('a build with no shelf emits exactly the palette it always did', () => {
  /* The adhesive-foot rule: a conditional colour must not move the ten
     official-kit goldens for a part the kit does not contain. */
  const plain = ok(build(185, { placed: [{ ...shelf(1), fill: 'decor' }] }), '185 decor');
  assert.equal('ShelfInsert' in plain.colors, false);
  assert.equal('ShelfLip' in plain.colors, false);
  const withShelf = ok(build(185, { placed: [shelf(1)] }), '185 shelf');
  assert.equal(withShelf.colors.ShelfInsert, '#7ad1c0');
  assert.equal('ShelfLip' in withShelf.colors, false, 'no lip chosen, no lip colour');
  const withLip = ok(build(185, { placed: [shelf(1, { lip: 'front' })] }), '185 shelf+lip');
  assert.equal(withLip.colors.ShelfLip, '#f26d5b');
});

/* ---- 6. TALL SHELVES: 1H case + case extenders (2026-08-29) -------------
   Replaces the old "taller than 1H is refused" guard, which was true only while
   the extender GLBs did not exist. The rule that replaced it is Joey's: a
   185-1W-2H shelf IS a 185-1W-1H case with a 185-1W-1H case extender on top.
   These assert the PART and its POSITION, never the absence of errors - the
   lesson from the bare-case defect at the top of this file. */

test('a tall shelf is a 1H case plus one extender per further ring', () => {
  for (const rings of [1, 2, 3, 6]) {
    const m = ok(build(185, { gridH: rings, placed: [{ ...shelf(1), hh: rings * 2 }] }), `${rings}H shelf`);
    // the CASE never grows: a shelf is assembled from rings, not printed tall
    const cases = nodes(m, /_Case$/);
    assert.equal(cases.length, 1, `${rings}H: exactly one case`);
    assert.equal(cases[0].node, '185-1W-1H_Case', `${rings}H: the case stays 1H`);
    const ext = nodes(m, /^CaseExtender_/);
    assert.equal(ext.length, rings - 1, `${rings}H: ${rings - 1} extenders`);
    ext.forEach((e) => assert.equal(e.node, 'CaseExtender_185-1W-1H'));
    /* Each ring exactly ONE ROW of pitch above the last, and the stack tops out
       where the tall case it replaces would have: caseH = hh*28+3. */
    const base = cases[0].pos[1];
    ext.forEach((e, k) => assert.equal(+(e.pos[1] - base).toFixed(4), (k + 1) * 56,
      `${rings}H: ring ${k + 1} sits ${(k + 1) * 56} above the case`));
    const top = base + (rings - 1) * 56 + 59;
    assert.equal(+(top - base).toFixed(4), rings * 2 * 28 + 3 - 0,
      `${rings}H: the stack is exactly as tall as the ${rings}H case it replaces`);
    // BOM: one row, qty = rings-1, and it is ENCLOSURE like the case it extends
    const r = row(m, /^CaseExtender_/);
    if (rings === 1) { assert.equal(r, undefined, '1H bills no extender'); continue; }
    assert.equal(r.qty, rings - 1, `${rings}H: BOM qty`);
    assert.equal(r.requirement.scope, 'core');
    assert.equal(r.requirement.obligationId, 'unit.enclosure');
    assert.equal(r.basis, undefined, 'enclosure is not a per-unit choice');
    // PUBLISHED, unlike the insert and lip - real links, and no "coming soon"
    assert.ok(r.links && r.links.p, `${rings}H: extender links to Printables`);
    assert.equal(r.note, undefined, 'the extender is released - no coming-soon note');
  }
});

test('the extender colour rides in only when a shelf actually stacks one', () => {
  const flat = ok(build(185, { placed: [shelf(1)] }), '1H shelf');
  assert.equal('CaseExtender' in flat.colors, false, 'a 1H shelf stacks none');
  const tall = ok(build(185, { gridH: 2, placed: [{ ...shelf(1), hh: 4 }] }), '2H shelf');
  assert.equal(tall.colors.CaseExtender, '#7d8496');
  /* Its OWN type, not 'Case' - three things in this codebase key off that type:
     the plate-pose table (it would inherit a print pose nobody verified), the
     part-preview row picker (which fails closed on more than one match), and
     the cover badge's case count (a 6H shelf would advertise "6 CASES"). */
  assert.equal(row(tall, /^CaseExtender_/).type, 'CaseExtender');
  assert.equal(nodes(tall, /_Case$/).length, 1, 'and the case row stays alone');
});

test('the height domain is PER FILL: drawers by catalog, shelves by rings', () => {
  /* The planner offers shelves at 1H-6H (`caseHeights`) but drawers only at the
     sizes the drawer catalog ships (`drawerHeights`). Judging both against
     H_LABEL - which stops at hh 6 - refused perfectly legal 4H-6H shelves. */
  for (const hh of [2, 4, 6, 8, 10, 12]) {
    const g = generateManifest(build(185, { gridH: hh / 2, placed: [{ ...shelf(1), hh }] }));
    assert.deepEqual(g.errors || [], [], `${hh / 2}H shelf must build`);
  }
  // ...and fails CLOSED outside it: half heights cannot be made of 1H rings,
  // and nothing exists above the planner's 6H cap.
  for (const hh of [0, 1, 3, 5, 14]) {
    const g = generateManifest(build(185, { gridH: 7, placed: [{ ...shelf(1), hh }] }));
    assert.ok((g.errors || []).length, `hh=${hh} must be refused, not silently drawn`);
  }
});

test('the 59 and the 3W-3H exclusion are DRAWER caps, not shelf caps', () => {
  /* Both were applied to every fill and both are drawer-only in the planner -
     a live cross-tool mismatch that was masked by the old height refusal and
     would have gone live with it lifted. A shelf needs no tall case: it stacks
     1H rings, and 59 extenders exist at every width the 59 can reach. */
  const tall59 = generateManifest(build(59, { gridH: 3, placed: [{ ...shelf(2), hh: 6 }] }));
  assert.deepEqual(tall59.errors || [], [], 'a 59-2W-3H SHELF is legal (the planner offers it)');
  // the same collection still refuses a 2H DRAWER - its case catalog stops at 1H
  const drawer59 = generateManifest(build(59, { gridH: 2, placed: [{ ...shelf(2), hh: 4, fill: 'decor' }] }));
  assert.ok((drawer59.errors || []).length, 'a 59 2H drawer needs a 2H case, which does not exist');
  // 3W-3H / 4W-3H: no single case that big prints, but a stacked shelf is fine
  for (const w of [3, 4]) {
    const g = generateManifest(build(185, { gridH: 3, placed: [{ ...shelf(w), hh: 6 }] }));
    assert.deepEqual(g.errors || [], [], `a ${w}W-3H SHELF stacks 1H rings`);
    const d = generateManifest(build(185, { gridH: 3, placed: [{ ...shelf(w), hh: 6, fill: 'decor' }] }));
    assert.ok((d.errors || []).length, `a ${w}W-3H DRAWER does not exist`);
  }
});

test('cabinets are still refused - and no longer blame the extenders', () => {
  const g = generateManifest(build(185, { placed: [{ ...shelf(1), fill: 'cabinet' }] }));
  assert.ok((g.errors || []).length, 'cabinets need door/hinge/latch models');
  const why = g.errors.join(' ');
  assert.match(why, /door/i, 'the reason names what is actually missing');
  assert.doesNotMatch(why, /extenders? (models )?(are |is )?not/i,
    'the extenders shipped 2026-08-29 - the old reason is now false');
});

test('every extender is entered by a phase, on every mount', () => {
  /* The staggered wall top row assembled its case and QuickLocks and then
     RETURNED, so from 2026-08-28 a staggered wall shelf placed its insert and
     lip as instances NO phase ever entered. That is why the fit sequence is one
     shared helper now. This is the net under it. */
  for (const [mount, wallStagger] of [['tabletop', false], ['wall', false], ['wall', true], ['under-table', false]]) {
    const m = ok({
      ...build(185), mount, wallStagger, gridW: 3, gridH: 2, nextId: 4,
      placed: [0, 1, 2].map((k) => ({ id: `u${k}`, x: k, y: 0, w: 1, hh: 4, fill: 'shelf', lip: 'front' })),
    }, `${mount}${wallStagger ? ' staggered' : ''}`);
    const entered = new Set(m.steps.flatMap((s) => (s.phases || []).flatMap((p) => (p.enter || []).map((e) => e.id))));
    const orphans = m.instances.filter((i) => !entered.has(i.id)).map((i) => i.id);
    assert.deepEqual(orphans, [], `${mount}${wallStagger ? ' staggered' : ''}: every instance must be installed on screen`);
    /* And the pair goes in AFTER the rings that host it - PER UNIT. Comparing
       globally would be meaningless: unit 0's QuickLocks legitimately precede
       unit 2's extenders, since each unit is its own step. */
    const order = m.steps.flatMap((s) => (s.phases || []).flatMap((p) => (p.enter || []).map((e) => e.id)));
    for (let u = 0; u < 3; u++) {
      const lastExt = order.map((id, n) => (id.startsWith(`ext${u}_`) ? n : -1)).reduce((a, b) => Math.max(a, b), -1);
      const firstQl = order.findIndex((id) => id === `ql${u}L` || id === `ql${u}R`);
      assert.ok(lastExt >= 0, `${mount} unit ${u}: its extenders must be entered`);
      assert.ok(firstQl > lastExt,
        `${mount} unit ${u}: QuickLocks seat in the TOP ring, so they follow its extenders`);
    }
  }
});


/* ---- the dovetail install (2026-08-28) --------------------------------- */

test('the lip is DOVETAILED in: down into the slots, then forward to lock', () => {
  /* Joey's install method, and the geometry closes on it exactly:
       deck slot       2.00..12.78 from the front edge  (10.78 long)
       tab seated      2.15.. 7.85                      ( 5.70 long)
       0.15 clearance + 5.70 tab + 4.93 free slot = 10.78
     So the travel is 4.93 mm and it goes FORWARD (+Z) - the insert is
     front-flush, so a lip sliding the wrong way would leave the case. */
  for (const mount of ['tabletop', 'wall', 'under-table']) {
    const m = ok(build(240, { mount, placed: [shelf(2, { lip: 'both' })] }), mount);
    const ent = m.steps.flatMap((s) => (s.phases || []).flatMap((p) => p.enter || []))
      .filter((e) => /^lip/.test(e.id));
    assert.equal(ent.length, 2, `${mount}: both lips must be installed`);
    /* TWO phases, deliberately: the drop is an `enter`, the slide is its own
       `move`. `via` would glide them into one continuous swoop, which is the
       opposite of what a dovetail does - it drops, sits, then snaps. */
    for (const e of ent) {
      assert.ok(e.at, `${mount}/${e.id}: the drop lands at the drop-in point`);
      assert.equal(e.via, undefined,
        `${mount}/${e.id}: no via - via removes the dead stop at the bend, and here the stop IS the point`);
      assert.deepEqual([e.from[0], e.from[2]], [0, 0],
        `${mount}/${e.id}: the approach is straight down, not diagonal`);
      assert.ok(e.from[1] > 1.42,
        `${mount}/${e.id}: must lift clear of the 1.42 mm tab foot, got ${e.from[1]}`);
    }
    const step = m.steps.find((s) => (s.phases || []).some(
      (p) => (p.enter || []).some((x) => /^lip/.test(x.id))));
    const iEnter = step.phases.findIndex((p) => (p.enter || []).some((x) => /^lip/.test(x.id)));
    const iMove = step.phases.findIndex((p) => (p.move || []).some((x) => /^lip/.test(x.id)));
    assert.ok(iMove > iEnter, `${mount}: the slide must come AFTER the drop`);
    for (const mv of step.phases[iMove].move) {
      assert.deepEqual(mv.by, [0, 0, 4.93],
        `${mount}/${mv.id}: the slide is 4.93 mm forward (+Z) - a -Z slide would drive it out the front`);
      assert.ok(mv.hold > 0, `${mount}/${mv.id}: a beat between dropping in and sliding home`);
      assert.equal(mv.ease, 'detent',
        `${mount}/${mv.id}: hesitates at mid-travel, then snaps - a plain lerp reads as a drift`);
    }
    // and the two legs still cancel against the step's own base offset
    for (const e of ent) {
      assert.equal(+(e.at[2] + 4.93).toFixed(6), mount === 'under-table' ? 225 : 0,
        `${mount}/${e.id}: enter.at + move.by must land on the step's base offset`);
    }
  }
});

test('the step note describes the dovetail, not a drop', () => {
  const m = ok(build(240, { placed: [shelf(2, { lip: 'front' })] }), '240 front lip');
  const note = m.steps.map((s) => s.note || '').join(' ');
  assert.match(note, /slide it forward until it locks/,
    'a reader told only to "drop it in" would leave it unseated');
});

/* ---- the install close-up (2026-08-28) --------------------------------- */

test('the shelf close-up aims at the STAGED shelf, not where it ends up', () => {
  /* The install happens on a bench, and every mount stages that bench
     elsewhere: tabletop's base sits 110 mm UP, a wall top case sits at
     WALL.benchFwd in front, the under-table demo case is carried out front by
     its own enter offset. Aiming at the resting position pointed the camera at
     empty stage a metre below the action — and nothing but measuring where the
     deck projected would have caught it, which is why this test exists. */
  for (const mount of ['tabletop', 'wall', 'under-table']) {
    const m = ok(build(240, { mount, placed: [shelf(2, { lip: 'both' })] }), mount);
    const step = m.steps.find((s) => (s.phases || []).some(
      (p) => (p.enter || []).some((e) => /^sh\d/.test(e.id))));
    const cams = step.phases.map((p) => p.camera).filter(Boolean);
    const close = cams.find((c) => c.p === 44);
    assert.ok(close, `${mount}: the shelf install must get its own close shot`);

    const sh = m.instances.find((i) => /^sh\d/.test(i.id));
    const stage = (sh.stage && m.stages[sh.stage]) || [0, 0, 0];
    const at = step.phases.flatMap((p) => p.enter || [])
      .find((e) => e.id === sh.id).at || [0, 0, 0];
    // where the insert genuinely IS while it is being installed
    const liveY = sh.pos[1] + stage[1] + at[1];
    const liveZ = sh.pos[2] + stage[2] + at[2];
    assert.ok(Math.abs(close.target[1] - liveY) < 40,
      `${mount}: camera aims at y=${close.target[1]} but the shelf is at y=${liveY}`);
    assert.ok(Math.abs(close.target[2] - liveZ) < 130,
      `${mount}: camera aims at z=${close.target[2]} but the shelf is at z=${liveZ}`);
    // and it is genuinely closer than the step's own shot
    assert.ok(close.r < (step.camera?.r ?? Infinity),
      `${mount}: the close-up must pull IN, not out`);
  }
});

test('the close-up hands the shot back before the step moves on', () => {
  /* Otherwise the rest of the step — the covers going on, the case sliding
     home — plays at a framing chosen for a 4.93 mm slide. */
  for (const mount of ['tabletop', 'wall', 'under-table']) {
    const m = ok(build(240, { mount, placed: [shelf(2, { lip: 'both' })] }), mount);
    const step = m.steps.find((s) => (s.phases || []).some(
      (p) => (p.enter || []).some((e) => /^sh\d/.test(e.id))));
    const iClose = step.phases.findIndex((p) => p.camera && p.camera.p === 44);
    const after = step.phases.slice(iClose + 1);
    const iBack = after.findIndex((p) => p.camera && p.camera.p !== 44);
    assert.ok(iBack >= 0, `${mount}: nothing restores the shot after the install`);
    const lastLip = after.findIndex((p) => (p.move || []).some((x) => /^lip/.test(x.id)));
    assert.ok(iBack > lastLip,
      `${mount}: the shot must be handed back AFTER the lips are seated, not during`);
  }
});

/* ---- 7. ONE QUICKLOCK PAIR PER RING (Joey 2026-08-29) ------------------
   Both independent reviewers flagged that the geometry could not settle this:
   the extender carries the same QuickLock channel as a case (96.9% vertex
   match in that wall window), but having a channel does not prove it must be
   populated. Joey confirmed EVERY seam locks. Until then both tools billed one
   pair per UNIT, so this is the net under a rule that was wrong in both. */

test('every ring gets its own QuickLock pair, at that ring bottom + 35.68', () => {
  for (const rings of [1, 2, 3, 6]) {
    const m = ok(build(185, { gridH: rings, placed: [{ ...shelf(1), hh: rings * 2 }] }), `${rings}H shelf`);
    const qls = m.instances.filter((i) => /^QuickLock-/.test(i.node));
    assert.equal(qls.length, rings * 2, `${rings}H: ${rings} pairs, L + R`);
    // BOM counts rings, not units
    for (const hand of ['L', 'R'])
      assert.equal(row(m, new RegExp(`^QuickLock-${hand}$`)).qty, rings, `${rings}H: QuickLock-${hand} qty`);
    /* Placement: ring k's pair sits 35.68 above ring k's own bottom - the 1H
       ground truth, applied per ring. The rings are 56 apart, so the pairs are
       too. */
    const base = m.instances.find((i) => /_Case$/.test(i.node)).pos[1];
    const ys = [...new Set(qls.map((q) => +q.pos[1].toFixed(4)))].sort((a, b) => a - b);
    assert.deepEqual(ys, Array.from({ length: rings }, (_, k) => +(base + k * 56 + 35.68).toFixed(4)),
      `${rings}H: one pair height per ring, 56 apart`);
    // the TOP ring keeps the bare ids every dip/pop site names
    const top = qls.filter((q) => q.id === 'ql0L' || q.id === 'ql0R');
    assert.equal(top.length, 2, 'the top ring keeps the un-suffixed ids');
    top.forEach((q) => assert.equal(+q.pos[1].toFixed(4), +(base + (rings - 1) * 56 + 35.68).toFixed(4),
      'the bare-id pair is the TOPMOST one - dip/pop depends on it'));
  }
});

test('a non-shelf unit is ONE ring however tall its case is', () => {
  /* A 2H drawer case is a single printed piece with one channel near its top,
     so the per-ring loop must reproduce the old single pair exactly - including
     the tall-case position, which is caseH - 23.32 and NOT bottom + 35.68. */
  for (const hh of [1, 2, 3, 4, 6]) {
    // gridBottom = gridH*2 = 6, and a tabletop unit must sit ON THE FLOOR
    const m = ok(build(185, { gridH: 3, placed: [{ ...shelf(1), y: 6 - hh, hh, fill: 'decor', closure: 'none' }] }), `hh=${hh} drawer`);
    const qls = m.instances.filter((i) => /^QuickLock-/.test(i.node));
    assert.equal(qls.length, 2, `hh=${hh}: exactly one pair`);
    const base = m.instances.find((i) => /_Case$/.test(i.node)).pos[1];
    assert.equal(+(qls[0].pos[1] - base).toFixed(2), +(hh * 28 + 3 - 23.32).toFixed(2),
      `hh=${hh}: the pair sits near the TOP of the one-piece case`);
  }
});

test('each ring is locked before the next one goes on', () => {
  const m = ok(build(185, { gridH: 3, placed: [{ ...shelf(1), hh: 6 }] }), '3H shelf');
  const order = m.steps.flatMap((s) => (s.phases || []).flatMap((p) => (p.enter || []).map((e) => e.id)));
  const at = (id) => order.indexOf(id);
  /* case -> its pair -> insert -> ring 1 -> ring 1's pair -> ring 2 -> ring 2's
     pair. Fitting a pair into a channel the next ring has already capped would
     be impossible to do on a real build. */
  assert.ok(at('case0') < at('ql0L_0'), 'the base ring is locked after it is placed');
  assert.ok(at('ql0L_0') < at('ext0_1'), 'and BEFORE the ring above caps it');
  assert.ok(at('ext0_1') < at('ql0L_1'), 'ring 1 placed, then locked');
  assert.ok(at('ql0L_1') < at('ext0_2'), 'and locked before ring 2 goes on');
  assert.ok(at('ext0_2') < at('ql0L'), 'the top ring is placed, then locked');
  order.filter((id) => /^ql0/.test(id)).forEach((id) => assert.ok(at(id) >= 0, `${id} entered`));
});
