/* CROSS-TOOL PARITY: the viewer's generated BOM and the planner's computeBom()
 * must classify the same build the same way.
 *
 * ⚠ THIS VERIFIES A SHARED CONTRACT, NOT TWO RULE ENGINES. Both tools call the
 * same vendored module (viewer/js/vendor/requirement-scope.js == the planner's
 * js/requirement-scope.js, byte-for-byte). What CAN still differ is the FACTS
 * each tool gathers before calling it - and that is exactly what this caught
 * on its first run: the viewer asked "does this run stagger?" per top CASE
 * while the planner asked it per contiguous top RUN, so the 3W starter's
 * Cover Lower came out option here and core there. Same policy, different
 * question. The fix aligned the fact-gathering; this test keeps it aligned.
 *
 * The three closure states of the contract's first slice are run through
 * BOTH tools and compared row by row on scope, optionId, basis axis/choice
 * and selectedCount. Needs the planner checkout; skips honestly without it
 * (the vendor gate still proves the policy is shared).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLANNER = process.env.GEN2_PLANNER_ROOT
  ? process.env.GEN2_PLANNER_ROOT
  : join(root, '..', 'GEN2 Planner', 'gen2-planner-main');

const { generateManifest } = await import(
  new URL('file://' + join(root, 'viewer', 'js', 'generate.js').replace(/\\/g, '/')).href);

/* ---- a planner instance, the way its own suite boots one ---- */
async function plannerBom(build) {
  const { JSDOM } = await import('jsdom');
  const read = (p) => readFileSync(join(PLANNER, p), 'utf8');
  const dom = new JSDOM(read('index.html'), { runScripts: 'outside-only' });
  const { window } = dom;
  window.__GEN2_PLANNER_TEST__ = true;
  // tabletop-completion.js next: app.js calls it on every tabletop refresh (2026-08-23)
  window.eval(read('js/requirement-scope.js') + '\n' + read('js/tabletop-completion.js') + '\n' + read('js/data.js') + '\n' + read('js/app.js'));
  const app = window.__GEN2_PLANNER_TEST__;
  assert.ok(app.applyBuild(JSON.parse(JSON.stringify(build))), 'planner rejected the fixture build');
  const rows = JSON.parse(JSON.stringify(app.computeBom())).flatMap((s) => s.items);
  window.close();
  return rows;
}

/* The two-drawer tabletop fixture in three closure states - the contract's
   first vertical, expressed as a planner build both tools accept. */
/* ⚠ Units sit ON THE FLOOR: the viewer's generator requires y + hh === gridH
   for a tabletop build ("tabletop builds stack bottom-up") and rejects a
   floating unit outright. The planner's test hook is more permissive, which is
   exactly the kind of asymmetry a parity test must not paper over - so the
   fixture is a build BOTH tools accept, not one tool's lenient reading. */
const fixture = (magnetic) => ({
  mount: 'tabletop', length: 185, faceStyle: 'classic', handleStyle: 'deco',
  wallStagger: false, backCover: false, feet: 'tpu', removedStoppers: [],
  gridW: 6, gridH: 4, nextId: 3,
  placed: [1, 2].map((id) => ({ id, x: id - 1, y: 6, w: 1, hh: 2, fill: 'decor', shelves: 0,
    closure: id <= magnetic ? 'magnet' : 'none' })),
});

/* Normalise both tools' rows to the comparable essence. The planner names
   parts "GEN2 Magnet Clip"; the viewer "Magnet Clip 10×2". Map by a stable
   semantic key rather than by label. */
const keyOf = (label) => {
  const l = label.toLowerCase();
  if (/magnet clip/.test(l)) return 'magnet-clip';
  if (/^magnets? /.test(l) || /magnet 10/.test(l)) return 'magnets';
  if (/stopper/.test(l)) return 'stoppers';
  if (/cover lower/.test(l)) return 'cover-lower';
  if (/cover upper/.test(l)) return 'cover-upper';
  if (/under.?table rail/.test(l)) return 'ut-rail';
  if (/wood screw/.test(l)) return 'wood-screws';
  // 2026-08-28. "shelf lip" cannot be caught by the insert pattern and vice
  // versa, so order is not load-bearing here - but keep them adjacent.
  if (/shelf insert/.test(l)) return 'shelf-insert';
  if (/shelf lip/.test(l)) return 'shelf-lip';
  /* ⚠ EXTENDER BEFORE CASE, always. Both tools name the part "<L> Case
     Extender"/"Case Extender <L>", so a plain /case/ test swallows it - the
     same trap the planner documents for its own link rules ("Extender before
     Case so 'Case Extender - ' never matches 'Case - '"). */
  if (/case extender/.test(l)) return 'case-extender';
  /* MIGRATED 2026-08-29. These two were absent for months because the viewer's
     Case and QuickLock rows carried NO `requirement`, so `essence` silently
     dropped them and the two tools' most fundamental rows were never compared.
     The viewer now tags them `core('unit.enclosure')` / `core('unit.join')`,
     matching the planner. ⚠ Keep `case` AFTER `case extender` above. */
  if (/case/.test(l)) return 'case';
  if (/quicklock/.test(l)) return 'quicklock';
  return null;
};
/* Quantities are compared SEPARATELY from classification: `essence` compares
   scope/optionId/basis/reasons and never qty, so this stays useful even now
   that every row above is classified. Same extender-before-case ordering. */
const qtyKey = (label) => {
  const l = label.toLowerCase();
  if (/case extender/.test(l)) return 'case-extender';
  if (/\bcase\b/.test(l)) return 'case';
  if (/quicklock/.test(l)) return 'quicklock';
  if (/shelf insert/.test(l)) return 'shelf-insert';
  if (/shelf lip/.test(l)) return 'shelf-lip';
  return null;
};
const essence = (rows) => {
  const out = {};
  for (const r of rows) {
    const k = keyOf(r.label || r.name || '');
    if (!k || !r.requirement) continue;
    const e = {
      scope: r.requirement.scope,
      optionId: r.requirement.optionId || null,
      basis: r.basis ? `${r.basis.axis}=${r.basis.choice}` : null,
      selectedCount: r.basis && 'selectedCount' in r.basis ? r.basis.selectedCount : null,
      reasons: r.reasons ? r.reasons.map((x) => x.scope).sort().join('+') : null,
    };
    // the same SKU can be several rows (per width); they must agree, so keep one
    if (out[k]) assert.deepEqual(e, out[k], `${k}: rows of one SKU disagree within one tool`);
    out[k] = e;
  }
  return out;
};

/* TWO MODES, deliberately different.
   Standalone CI checks out this repository alone, so a missing planner or a
   missing jsdom is the normal case and the suite SKIPS - the vendor gate still
   proves the policy is shared bytes.
   Under the planner's write-mode sync (GEN2_REQUIRE_PARITY=1) every repository
   is present by construction, so a missing dependency is a broken setup, not a
   topology - and the receipt must not be written on a skipped suite. There it
   FAILS with the fix spelled out. Skipping would let the receipt claim a
   parity it never ran. */
/* Two shelves of one width, side by side on the floor, with the optional lip
   ON. Same shape as the closure fixture, and it exercises the two shelf rows
   the 2026-08-28 wiring added: the insert (CORE on unit.fill, like every other
   fill) and the lip (a real OPTION - a shelf without one is still a shelf).
   Two units of the SAME width so `selectedCount` has to agree on 2, not 1. */
const shelfFixture = (lip) => ({
  mount: 'tabletop', length: 185, faceStyle: 'classic', handleStyle: 'deco',
  wallStagger: false, backCover: false, feet: 'tpu', removedStoppers: [],
  gridW: 6, gridH: 4, nextId: 3,
  placed: [1, 2].map((id) => ({ id, x: id - 1, y: 6, w: 1, hh: 2, fill: 'shelf',
    shelves: 0, closure: 'none', ...(lip ? { lip: 'front' } : {}) })),
});

const REQUIRE = process.env.GEN2_REQUIRE_PARITY === '1';
const skipIfNoPlanner = (t) => {
  const plannerOk = existsSync(join(PLANNER, 'js', 'app.js'));
  let jsdomOk = true;
  try { import.meta.resolve('jsdom'); } catch (e) { jsdomOk = false; }
  if (plannerOk && jsdomOk) return false;
  const why = [
    !plannerOk && `planner checkout not found at ${PLANNER} - set GEN2_PLANNER_ROOT=<path>`,
    !jsdomOk && 'jsdom is not installed - run `npm install` in this repo (it is a devDependency)',
  ].filter(Boolean).join('; ');
  if (REQUIRE) throw new Error('cross-tool parity REQUIRED but cannot run: ' + why);
  t.skip(why);
  return true;
};

for (const magnetic of [0, 1, 2]) {
  test(`closure state ${magnetic}/2: planner and viewer classify identically`, async (t) => {
    if (skipIfNoPlanner(t)) return;
    const build = fixture(magnetic);
    const v = essence(generateManifest(build).manifest.parts);
    const p = essence(await plannerBom(build));
    const keys = [...new Set([...Object.keys(v), ...Object.keys(p)])].sort();
    for (const k of keys) {
      assert.ok(v[k], `${k}: classified by the planner but not the viewer`);
      assert.ok(p[k], `${k}: classified by the viewer but not the planner`);
      assert.deepEqual(v[k], p[k], `${k} disagrees (viewer vs planner)`);
    }
    // the contract's headline assertions, on BOTH tools
    if (magnetic === 0) {
      assert.equal(v.magnets, undefined, 'no magnets without magnetic closure');
    } else {
      assert.equal(v.magnets.scope, 'option');
      assert.equal(v.magnets.selectedCount, magnetic, 'selectedCount walks with the drawers that chose it');
    }
    assert.equal(v.stoppers.scope, 'enhancement', 'stoppers stay enhancements in every state');
  });
}

test('the 3W starter kit: the Cover Lower is CORE in both tools', async (t) => {
  /* The case that exposed the per-case vs per-run fact mismatch. */
  if (skipIfNoPlanner(t)) return;
  const file = JSON.parse(readFileSync(join(root, 'viewer', 'builds', '185-tabletop-3w2h.json'), 'utf8'));
  const v = essence(generateManifest(file.build).manifest.parts);
  const p = essence(await plannerBom(file.build));
  assert.equal(v['cover-lower'].scope, 'core');
  assert.equal(p['cover-lower'].scope, 'core');
  assert.equal(v['cover-lower'].reasons, 'core+option', 'both reasons preserved');
  assert.deepEqual(v['cover-lower'], p['cover-lower']);
});

test('the 2W starter kit: the Cover Lower is OPTION in both tools', async (t) => {
  if (skipIfNoPlanner(t)) return;
  const file = JSON.parse(readFileSync(join(root, 'viewer', 'builds', '185-tabletop-2w2h.json'), 'utf8'));
  const v = essence(generateManifest(file.build).manifest.parts);
  const p = essence(await plannerBom(file.build));
  assert.equal(v['cover-lower'].scope, 'option');
  assert.equal(v['cover-lower'].optionId, 'drawer.stoppers');
  assert.deepEqual(v['cover-lower'], p['cover-lower']);
});

test('an under-table build: mount parts are CORE with basis mount in both tools', async (t) => {
  if (skipIfNoPlanner(t)) return;
  const build = Object.assign(fixture(0), { mount: 'under-table' });
  const v = essence(generateManifest(build).manifest.parts);
  const p = essence(await plannerBom(build));
  for (const k of ['ut-rail', 'wood-screws']) {
    assert.equal(v[k].scope, 'core', `${k} viewer`);
    assert.equal(v[k].basis, 'mount=under-table', `${k} viewer basis`);
    assert.deepEqual(v[k], p[k], `${k} disagrees`);
  }
});

/* SHELVES (2026-08-28). The shelf insert was the FIRST row the planner billed
   that the viewer did not emit at all - a shelf generated a bare case, silently.
   Parity here is what keeps the two tools telling one story about the new fill:
   the insert is core because there is no "empty" fill, and the lip is an option
   because it has a genuine off state. */
for (const lip of [false, true]) {
  test(`a shelf build (lip ${lip ? 'on' : 'off'}): planner and viewer classify identically`, async (t) => {
    if (skipIfNoPlanner(t)) return;
    const build = shelfFixture(lip);
    const v = essence(generateManifest(build).manifest.parts);
    const p = essence(await plannerBom(build));
    assert.ok(v['shelf-insert'], 'the viewer must bill a shelf insert (it used to bill nothing)');
    assert.ok(p['shelf-insert'], 'the planner must bill a shelf insert');
    assert.deepEqual(v['shelf-insert'], p['shelf-insert'], 'shelf-insert disagrees (viewer vs planner)');
    assert.equal(v['shelf-insert'].scope, 'core');
    assert.equal(v['shelf-insert'].basis, 'fill=shelf');
    assert.equal(v['shelf-insert'].selectedCount, 2, 'both shelf units must be counted');

    if (!lip) {
      assert.equal(v['shelf-lip'], undefined, 'no lip chosen, no lip row in the viewer');
      assert.equal(p['shelf-lip'], undefined, 'no lip chosen, no lip row in the planner');
      return;
    }
    assert.ok(v['shelf-lip'] && p['shelf-lip'], 'both tools must bill the lip once it is on');
    assert.deepEqual(v['shelf-lip'], p['shelf-lip'], 'shelf-lip disagrees (viewer vs planner)');
    assert.equal(v['shelf-lip'].scope, 'option', 'a shelf without a lip is still a shelf');
    assert.equal(v['shelf-lip'].basis, 'shelf.lip=on');
  });
}

/* ⚠ THE MIXED BOARD - a shelf sitting ON TOP OF a drawer.
 * This is the fixture that caught the real defect: Joey's rule (the insert's
 * integrated stoppers occupy the drawer-stopper slots, so the drawer beneath
 * bills no pair) was implemented in the VIEWER only. The planner went on
 * billing the pair AND went on reporting `hasStoppers: true`, which also feeds
 * the Cover Lower's requirement. A shelf-only board never exercises it,
 * because it has no drawer underneath to disagree about.
 */
test('a shelf above a drawer: both tools drop that drawer\'s stopper pair', async (t) => {
  if (skipIfNoPlanner(t)) return;
  const build = {
    mount: 'tabletop', length: 185, faceStyle: 'classic', handleStyle: 'deco',
    wallStagger: false, backCover: false, feet: 'tpu', removedStoppers: [],
    gridW: 6, gridH: 2, nextId: 3,
    placed: [
      { id: 1, x: 0, y: 0, w: 1, hh: 2, fill: 'shelf', shelves: 0 },
      { id: 2, x: 0, y: 2, w: 1, hh: 2, fill: 'decor', shelves: 0, closure: 'none' },
    ],
  };
  const vRows = generateManifest(build).manifest.parts;
  const pRows = await plannerBom(build);
  const qty = (rows) => rows.filter((r) => /stopper/i.test(r.label || r.name || ''))
    .reduce((n, r) => n + (r.qty || 0), 0);
  assert.equal(qty(vRows), 0, 'viewer: the shelf insert above provides this drawer\'s stoppers');
  assert.equal(qty(pRows), 0, 'planner: same rule, or the two tools bill different parts');

  // and the Cover Lower must not still claim stoppers seat into it
  const v = essence(vRows), p = essence(pRows);
  assert.deepEqual(v['cover-lower'], p['cover-lower'],
    'cover-lower disagrees - `hasStoppers` is computed independently in each tool');

  // control: swap the shelf for a drawer and the pair comes back in BOTH
  const ctrl = JSON.parse(JSON.stringify(build));
  ctrl.placed[0].fill = 'decor';
  ctrl.placed[0].closure = 'none';
  assert.ok(qty(generateManifest(ctrl).manifest.parts) > 0, 'control: viewer bills stoppers under a drawer');
  assert.ok(qty(await plannerBom(ctrl)) > 0, 'control: planner bills stoppers under a drawer');
});

/* ---- tall shelves: the extender COUNT is derived twice (2026-08-29) ------
   A shelf above 1H is a 1H case plus (h − 1) case extenders, and each tool
   works that out from the raw build on its own — the planner in computeBom's
   `shelf` branch, the viewer in its emission loop. That is precisely the
   "same policy, different question" shape that has shipped two live defects
   here, so this compares QUANTITIES, not only classification. The existing
   parity tests deliberately do not: `essence` drops any row without a
   `requirement`, so the case and QuickLock rows were never compared at all. */
const tallShelves = {
  mount: 'tabletop', length: 185, faceStyle: 'classic', handleStyle: 'deco',
  wallStagger: false, backCover: false, feet: 'tpu', removedStoppers: [],
  gridW: 6, gridH: 3, nextId: 4,
  placed: [
    // 3H + 2H side by side: 2 cases, 2 + 1 = 3 extenders, 2 inserts.
    // Different heights on purpose — one shared height could not tell a
    // per-unit rule from a per-ring one.
    { id: 1, x: 0, y: 0, w: 1, hh: 6, fill: 'shelf', shelves: 0, lip: 'front' },
    { id: 2, x: 1, y: 2, w: 1, hh: 4, fill: 'shelf', shelves: 0 },
  ],
};

test('tall shelves: both tools bill the same cases, extenders and QuickLocks', async (t) => {
  if (skipIfNoPlanner(t)) return;
  const vRows = generateManifest(tallShelves).manifest.parts;
  const pRows = await plannerBom(tallShelves);
  const totals = (rows) => {
    const out = {};
    for (const r of rows) {
      const k = qtyKey(r.label || r.name || '');
      if (k) out[k] = (out[k] || 0) + (r.qty || 0);
    }
    return out;
  };
  const v = totals(vRows), p = totals(pRows);
  for (const k of ['case', 'case-extender', 'shelf-insert', 'quicklock']) {
    assert.equal(v[k], p[k], `${k}: viewer bills ${v[k]}, planner bills ${p[k]}`);
  }
  // and the absolute numbers, so a matched pair of wrong answers still fails
  assert.equal(v.case, 2, 'one 1H case per shelf, never a tall one');
  assert.equal(v['case-extender'], 3, '(3−1) + (2−1) rings');
  assert.equal(v['shelf-insert'], 2, 'one insert per shelf, at its base');
  /* ONE PAIR PER RING (Joey 2026-08-29), not per unit: the 3H shelf is three
     rings and the 2H is two, so five pairs = 10 handed rows (the key sums L and
     R). Billing per UNIT would read 4 here - which is what both tools did until
     this rule was confirmed, and what this number now pins. */
  assert.equal(v.quicklock, 10, 'a pair per ring: (3 + 2) rings x L+R');

  // classification must agree too, on the rows that carry it
  const ve = essence(vRows), pe = essence(pRows);
  assert.deepEqual(ve['case-extender'], pe['case-extender'],
    'the extender is CORE on unit.enclosure in both — enclosure, not an add-on');
  assert.equal(ve['case-extender'].scope, 'core');
  assert.equal(ve['case-extender'].basis, null, 'not a per-unit choice');
});
