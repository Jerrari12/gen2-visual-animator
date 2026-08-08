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
    for (const fill of ['decor', 'classic'])
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
  }
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
