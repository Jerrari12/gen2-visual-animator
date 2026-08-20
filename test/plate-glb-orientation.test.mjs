/* The plate view's pose whitelist assumes the CURRENT GLB intrinsic
   orientations - and this repo's documented recurring failure mode is exactly
   a re-export arriving rotated (2026-07-10: 11 cases/drawers rotated 90°
   about Y; 2026-07-12: two more only 1mm away from invisible). The pose
   tests pin rotation CONSTANTS, so a rotated re-export would ship silently
   wrong plate views. This suite closes that hole WITHOUT decoding meshes:

   A meshopt .lib.glb's JSON chunk carries each POSITION accessor's quantized
   min/max plus the node transform that dequantizes it (world = T + S·v/32767
   for normalized SHORTs - the documented house formula). So the world-space
   X/Y/Z spans of every plate-eligible GLB are measurable from the JSON chunk
   alone, and they are SNAPSHOTTED here as a golden:
   - a re-export that rotates a part swaps its spans -> hard CI failure with
     a reviewable diff naming the file;
   - a byte-level recompression with identical geometry passes untouched;
   - a legitimate geometry change fails until UPDATE_GOLDEN=1 - which is the
     forced "re-verify the plate poses BY EYE" checkpoint (the refresh
     message says so), instead of a checklist that relies on memory.
   A semantic layer sanity-checks the snapshot itself: faceplate depth (the
   axis the print pose rotates onto the plate) must equal each family's
   documented plate depth, and case/drawer widths must track the 88mm grid -
   so the golden can't silently bless an already-rotated state.

   Pure node - no browser, no packages, no mesh decoding. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { worldSpans } from './lib/glb-spans.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { resolvePartPreview } = await import(
  new URL('file://' + join(root, 'viewer', 'js', 'generate.js').replace(/\\/g, '/')).href
);
const SLUGS = JSON.parse(readFileSync(join(root, 'test', 'site-slugs.json'), 'utf8')).slugs;
const GOLDEN_PATH = join(root, 'test', 'golden', 'plate-glb-spans.json');

// ---- the plate-eligible set, straight from the resolver --------------------
// EVERY body that can appear on a plate is swept — a handed pair's second
// hand included (r.part.set), not just the primary: an R-hand re-export
// arriving rotated must fail here exactly like an L (2026-08-20 review catch).
const plateSet = new Map(); // "<coll>/<node>" -> {file, spans, slugSample}
for (const s of SLUGS) {
  const r = resolvePartPreview(s);
  if (r.fail || !r.part.platePreview) continue;
  for (const node of r.part.set || [r.part.node]) {
    const key = r.manifest.collection + '/' + node;
    if (!plateSet.has(key)) {
      const file = join(root, 'viewer', 'parts', r.manifest.collection, node + '.lib.glb');
      plateSet.set(key, { file, slug: s });
    }
  }
}

test('parser self-check: a ground-truth part measures its documented size', () => {
  // the 185 2W-1H case: 176 wide (2x88), 59 tall (56 installed + 3 dovetail),
  // 185 deep - the locked calibration numbers. If the JSON-chunk math were
  // wrong (transform composition, dequantization), this fails first and the
  // golden below could not silently bless nonsense.
  const spans = worldSpans(join(root, 'viewer', 'parts', '185', '185-2W-1H_Case.lib.glb'));
  assert.ok(Math.abs(spans[0] - 176) < 2.5, 'width ' + spans[0]);
  assert.ok(Math.abs(spans[1] - 59) < 2.5, 'height ' + spans[1]);
  assert.ok(Math.abs(spans[2] - 185) < 2.5, 'depth ' + spans[2]);
});

test('every plate-eligible GLB matches its span snapshot (UPDATE_GOLDEN=1 + re-verify poses BY EYE)', () => {
  const now = {};
  for (const [key, e] of [...plateSet.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    assert.ok(existsSync(e.file), key + ': GLB missing');
    now[key] = worldSpans(e.file);
  }
  if (process.env.UPDATE_GOLDEN) {
    writeFileSync(GOLDEN_PATH, JSON.stringify(now, null, 1) + '\n');
    return;
  }
  assert.ok(existsSync(GOLDEN_PATH), 'span golden missing - run UPDATE_GOLDEN=1 npm test once');
  assert.deepEqual(now, JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')),
    'a plate-eligible GLB\'s dimensions changed - if a re-export rotated it, the plate view now shows a WRONG print pose. ' +
    'Verify the affected parts\' plate views BY EYE (?part=<slug>&mode=preview&plate=256x256), then UPDATE_GOLDEN=1 npm test.');
});

test('semantic sanity: the snapshot itself is unrotated', () => {
  // faceplates: the Z span is the plate DEPTH - the axis the print pose lays
  // onto the bed. Each family's depth is a documented constant; a rotated
  // export would put a width (>=87) or height (>=27, except 05H) there.
  // depths cross-checked against the GENERATOR's own placement math
  // (z-center = mounting plane 92.57 + depth/2): Essential 95.07->5.0,
  // ClassicDecor 107.17->29.2, EdgeLabel 104.62->24.1 (the bare plate - the
  // notes' 26.1 is the assembled-set figure), ClassicPro 107.32->29.5,
  // Chevron 95.67->6.2
  const FP_DEPTH = { Essential: 5, ClassicDecor: 29.2, EdgeLabel: 24.1, ClassicPro: 29.5, Chevron: 6.2 };
  const bad = [];
  for (const [key, e] of plateSet.entries()) {
    const node = key.split('/')[1];
    const spans = worldSpans(e.file);
    let m;
    if ((m = node.match(/^Faceplate_(\w+?)_(\d)W-/))) {
      const want = FP_DEPTH[m[1]];
      // Essential's depth is not separately documented - just require thinner
      // than any plate height (27); the four known families check exactly
      const ok = want === 5 ? spans[2] < 20 : Math.abs(spans[2] - want) < 1;
      if (!ok) bad.push(`${key}: faceplate depth(Z)=${spans[2]}`);
      if (!(spans[0] >= m[2] * 88 - 2 && spans[0] <= m[2] * 88 + 1)) bad.push(`${key}: faceplate width(X)=${spans[0]}`);
    } else if ((m = node.match(/^(\d+)-(\d)W-[\d\w]+H_Case$/))) {
      if (Math.abs(spans[0] - m[2] * 88) > 2.5) bad.push(`${key}: case width(X)=${spans[0]} want ~${m[2] * 88}`);
      if (Math.abs(spans[2] - +m[1]) > 2.5) bad.push(`${key}: case depth(Z)=${spans[2]} want ~${m[1]}`);
    } else if ((m = node.match(/^(Classic|Decor)Drawer_(\d+)-(\d)W-/))) {
      // drawers: width = 88w-13 (house rule). ⚠ tolerance stays SUB-0.5mm on
      // the width check's spirit but the 240-3W trap (251 vs 250) is exactly
      // why the check is against the WIDTH formula, not "which axis is bigger"
      if (Math.abs(spans[0] - (m[3] * 88 - 13)) > 2) bad.push(`${key}: drawer width(X)=${spans[0]} want ~${m[3] * 88 - 13}`);
    }
  }
  assert.deepEqual(bad, [], 'axis-profile violations');
});
