/* Every node a generated manifest references must exist as a GLB on disk.

   main.js loadTemplates loads each instance node from viewer/parts/<L>/ — a
   missing file used to reject an uncaught Promise.all and hang the app on the
   loading spinner forever. That happened in production (2026-07-25): the
   generator emitted ClassicDrawer_<L>-…-3H for 115/240/270, whose GLBs were
   never cut. Those six were modelled 2026-08-02 so that particular gap is gone,
   but the generator keeps the guard (COLL[L].classicMaxHH, now unset everywhere)
   and loadTemplates fails readably. THIS sweep is the durable net: it walks
   every legal single-unit build across all six collections, both drawer
   fills, all three mounts, all four faceplate families and all three handle
   styles, and asserts that whenever a manifest is produced, every GLB it
   references exists. A combo may instead error gracefully (that's the guard
   working) — what must never happen is manifest + missing file.

   Also checks the STATIC KITS' contract: each kit folder must carry every GLB
   its manifest references, all nine handle styles when the kit has handles
   (the identify-card ◀▶ offers all nine — Crystal was missing once and the
   button silently died), and all four faceplate families at each plate size.

   Pure node — no browser, no packages. NB `npm test` is bare `node --test`,
   which executes every .mjs in test/ — keep scratch scripts out of this dir. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { generateManifest } = await import(
  new URL('file://' + join(root, 'viewer', 'js', 'generate.js').replace(/\\/g, '/')).href
);

const LENGTHS = [59, 115, 165, 185, 240, 270];
const HH = [1, 2, 3, 4, 6]; // 05H 1H 15H 2H 3H
const glbExists = (L, node) => existsSync(join(root, 'viewer', 'parts', String(L), node + '.lib.glb'));

const mk = (len, o = {}) => ({
  mount: len === 59 ? 'wall' : 'tabletop', length: len, printer: 'any', // 59 is hanging-only
  customBed: { x: null, y: null }, spaceW: null, spaceH: null,
  faceStyle: 'essential', doorStyle: 'essential', handleStyle: 'deco',
  wallStagger: false, backCover: false, removedStoppers: [], gridW: 6, gridH: 10, nextId: 2,
  placed: [], ...o,
});
const unit = (w, hh, fill) => ({ id: 1, x: 1, y: 20 - hh, w, hh, fill, shelves: 0, closure: 'none' });

// manifest + missing GLB = the hang; errors = the guard working = fine
const assertResolves = (name, b) => {
  const g = generateManifest(b);
  if (!g.manifest) return { errored: true };
  const missing = [...new Set(g.manifest.instances.map(i => i.node))].filter(n => !glbExists(b.length, n));
  assert.deepEqual(missing, [],
    `${name}: generated a manifest referencing GLBs that don't exist (the viewer would hang): ${missing.join(', ')}`);
  return { errored: false };
};

test('every legal drawer size resolves to real GLBs (or errors gracefully) in all six collections', () => {
  let generated = 0, guarded = 0;
  for (const L of LENGTHS)
    // 'shelf' joined 2026-08-28: only hh=2 is legal, and every other height
    // errors gracefully — which assertResolves already counts as guarded.
    for (const fill of ['decor', 'classic', 'shelf'])
      for (const w of [1, 2, 3, 4])
        for (const hh of HH) {
          if (w >= 3 && hh === 6) continue; // 3W/4W-3H are illegal everywhere
          const r = assertResolves(`${L}/${fill}/${w}W hh=${hh}`, mk(L, { placed: [unit(w, hh, fill)] }));
          r.errored ? guarded++ : generated++;
        }
  assert.ok(generated > 100, `sweep looks broken — only ${generated} builds generated`);
  // 2026-08-02: the 115/240/270 3H classics were modelled, closing the last
  // catalog gap. The sweep above already walks them, but name them explicitly —
  // a re-introduced cap, or a lost GLB, then fails with the specific size.
  for (const L of [115, 240, 270])
    for (const w of [1, 2]) {
      const node = `ClassicDrawer_${L}-${w}W-3H`;
      const g = generateManifest(mk(L, { placed: [unit(w, 6, 'classic')] }));
      assert.ok(g.manifest,
        `${L} ${w}W-3H classic should generate now: ${(g.errors || []).join(' ')}`);
      assert.ok(g.manifest.instances.some(i => i.node === node),
        `${L} ${w}W-3H classic must place ${node}`);
      assert.ok(glbExists(L, node), `${node}.lib.glb is missing from viewer/parts/${L}/`);
    }
});

test('all mounts, faceplate families, handle styles and the back cover resolve everywhere', () => {
  for (const L of LENGTHS) {
    for (const mount of ['tabletop', 'wall', 'under-table']) {
      if (L === 59 && mount === 'tabletop') continue; // hanging-only collection
      assertResolves(`${L}/${mount}`, mk(L, { mount, placed: [unit(2, 2, 'decor')] }));
    }
    for (const fs of ['essential', 'classic', 'edgelabel', 'classicpro', 'chevron'])
      assertResolves(`${L}/face=${fs}`, mk(L, { faceStyle: fs, backCover: true, placed: [unit(1, 2, 'decor')] }));
    for (const hs of ['deco', 'blockbar', 'crystal'])
      assertResolves(`${L}/handle=${hs}`, mk(L, { handleStyle: hs, placed: [unit(1, 2, 'decor')] }));
    /* Shelves on every mount, with and without the optional lip. The lip is a
       UNIVERSAL part copied into each per-length pool (like Adhesive-Foot), so
       this is what catches a pool that shipped the inserts but not the lips. */
    for (const mount of ['tabletop', 'wall', 'under-table']) {
      if (L === 59 && mount === 'tabletop') continue;
      // 'both' asks for the mid lip, which only 240/270 decks have a slot for -
      // everywhere else it must CLAMP to the front lip, not reach for a part
      for (const lip of [null, 'front', 'both'])
        for (const w of [1, 2]) // every collection has at least 1W/2W cases
          assertResolves(`${L}/${mount}/shelf ${w}W lip=${lip}`,
            mk(L, { mount, placed: [{ ...unit(w, 2, 'shelf'), ...(lip ? { lip } : {}) }] }));
    }
  }
});

/* ⚠ THE SWEEP ABOVE COUNTS A GRACEFUL ERROR AS A PASS, which is right for a
   catalog gap but useless as proof that anything BUILDS. This one DEMANDS a
   manifest for every shelf the planner will actually offer, so the day a cap is
   lifted onto a missing model the failure is here rather than in production.
   The matrix is the planner's own: `caseHeights` 1H-6H (its `unavailableSizes`
   and `maxDrawerH` are drawer-only, so 3W-3H and a tall 59 are legal SHELVES),
   capped per collection by `maxW`, which does apply to every fill. */
test('every legal SHELF the planner offers generates real GLBs - 1H to 6H', () => {
  let built = 0;
  for (const L of LENGTHS) {
    const maxW = L === 59 ? 2 : 4;   // COLL[59].maxW - the one cap that is not drawer-only
    for (const mount of ['tabletop', 'wall', 'under-table']) {
      if (L === 59 && mount === 'tabletop') continue;
      for (let rings = 1; rings <= 6; rings++)
        for (let w = 1; w <= maxW; w++) {
          const name = `${L}/${mount}/shelf ${w}W ${rings}H`;
          // `unit` places at y = 20 - hh, which sits on the floor exactly
          // because gridBottom is the default gridH 10 doubled - don't override it
          const b = mk(L, { mount, placed: [{ ...unit(w, rings * 2, 'shelf'), lip: 'front' }] });
          const g = generateManifest(b);
          // NOT "manifest or error" - a legal shelf MUST build
          assert.deepEqual(g.errors || [], [], `${name}: must generate, not error`);
          const missing = [...new Set(g.manifest.instances.map((i) => i.node))].filter((n) => !glbExists(L, n));
          assert.deepEqual(missing, [], `${name}: references GLBs that don't exist: ${missing.join(', ')}`);
          // and the rings are really there
          const ext = g.manifest.instances.filter((i) => /^CaseExtender_/.test(i.node));
          assert.equal(ext.length, rings - 1, `${name}: expected ${rings - 1} extenders`);
          built++;
        }
    }
  }
  // 5 lengths x 3 mounts x 6 heights x 4 widths + the 59's 2 mounts x 6 x 2
  assert.equal(built, 5 * 3 * 6 * 4 + 2 * 6 * 2, `sweep looks broken - built ${built}`);
});

// ---- static kits: the folder must back everything the UI can reach ---------

// mirrors main.js HANDLE_STYLES (all nine ◀▶ stops) and FACEPLATE_STYLES
// (the five family node templates) — update together with main.js
const HANDLE_NODES = ['Handle_Deco',
  'Handle_BlockBar_A', 'Handle_BlockBar_B', 'Handle_BlockBar_C',
  'Handle_BlockBar_D', 'Handle_BlockBar_E', 'Handle_BlockBar_F',
  'Handle_Crystal_A', 'Handle_Crystal_B'];
const FP_FAMILIES = ['Faceplate_Essential_', 'Faceplate_ClassicDecor_', 'Faceplate_EdgeLabel_', 'Faceplate_ClassicPro_', 'Faceplate_Chevron_'];

const kitsDir = join(root, 'viewer', 'kits');
for (const kit of readdirSync(kitsDir)) {
  test(`static kit ${kit}: folder backs its manifest and both style cycles`, () => {
    const m = JSON.parse(readFileSync(join(kitsDir, kit, 'manifest.json'), 'utf8'));
    const has = node => existsSync(join(kitsDir, kit, 'parts', node + '.lib.glb'));
    const nodes = [...new Set(m.instances.map(i => i.node))];
    for (const n of nodes) assert.ok(has(n), `${kit}: manifest references ${n} but parts/ lacks the GLB`);
    // handle ◀▶: any kit with a Handle offers all nine styles
    if (nodes.some(n => n.startsWith('Handle_')))
      for (const h of HANDLE_NODES) assert.ok(has(h), `${kit}: handle cycle offers ${h} but the GLB is missing — ▶ dies silently there`);
    // faceplate ◀▶: every plate size must exist in all five families
    for (const n of nodes) {
      const size = (n.match(/^Faceplate_\w+_(\dW-\d+H)$/) || [])[1];
      if (!size) continue;
      for (const fam of FP_FAMILIES) assert.ok(has(fam + size), `${kit}: faceplate cycle needs ${fam + size} for its ${size} plate`);
    }
  });
}

/* An ILLEGAL width must be REFUSED, not turned into a node name.
   This suite sweeps LEGAL builds, so it structurally cannot catch a build the
   generator should have rejected - and before 2026-08-30 it did not: w = 0, -1
   or 1.5 produced a manifest with zero errors AND zero warnings, referencing
   `185-0W-1H_Case`, `ShelfInsert_185--1W` and friends. The planner drops such a
   unit in sanitize, so it was reachable only from a hand-made or corrupted
   `#build=` hash, and loadTemplates' missing-node error caught it at the far
   end - but emitting a node with no GLB is exactly what this file exists to
   prevent. ⚠ It affected EVERY fill, not just shelves. Found by fuzzing. */
test('an impossible width is refused, never emitted as a node name', () => {
  const mk = (w, fill) => ({
    mount: 'tabletop', length: 185, faceStyle: 'essential', handleStyle: 'deco',
    wallStagger: false, backCover: false, feet: 'tpu', removedStoppers: [],
    gridW: 6, gridH: 1,
    placed: [{ id: 1, x: 0, y: 0, w, hh: 2, fill, shelves: 0 }], nextId: 2,
  });
  for (const fill of ['shelf', 'decor', 'classic']) {
    for (const w of [0, -1, 1.5, NaN]) {
      const r = generateManifest(mk(w, fill));
      assert.equal(r.manifest, null, `${fill} w=${w}: generated a manifest instead of refusing`);
      assert.ok(r.errors && r.errors.length, `${fill} w=${w}: refused with no error to show the user`);
    }
    // the legal ones still work, so the guard is a floor and not a wall
    for (const w of [1, 2, 3, 4])
      assert.ok(generateManifest(mk(w, fill)).manifest, `${fill} w=${w}: legal width was refused`);
  }
});
