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
  window.eval(read('js/requirement-scope.js') + '\n' + read('js/data.js') + '\n' + read('js/app.js'));
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

const skipIfNoPlanner = (t) => {
  if (!existsSync(join(PLANNER, 'js', 'app.js'))) { t.skip('planner checkout not present (GEN2_PLANNER_ROOT)'); return true; }
  return false;
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
