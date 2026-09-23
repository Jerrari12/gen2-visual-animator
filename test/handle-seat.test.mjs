/* WHERE A BOLT-ON HANDLE SEATS (2026-09-22)
 *
 * A handle mounts its BACK FACE on the faceplate's FRONT FACE. That front is the family's own:
 * a plate's z-centre is the mounting plane plus half ITS depth, so a deeper plate has a front
 * further out. The rule held for years only because Essential was the one bolt-on family and
 * its front - 97.57 - was written into the handle line as a constant.
 *
 * Chevron arrived 2026-08-08 as the second bolt-on family, 6.2 mm deep against Essential's 5.0,
 * and inherited that constant: every Deco, BlockBar and Crystal handle on a Chevron plate sat
 * 1.2 mm INSIDE it. Joey saw it in the Build Studio on 2026-09-22 ("the deco handles are sunk
 * into the chevron faceplate there, maybe a mm or so") - a millimetre, on a part whose whole
 * point is that it stands proud of the plate.
 *
 * So the seat is computed from the family now, and this suite pins both halves of that:
 * Essential must not move (it is the CALIBRATED ground truth, measured off Joey's reference
 * assembly), and every other bolt-on family must land on its own front rather than Essential's.
 * ⚠ A new bolt-on family needs its `depth` in FACE_FAMILIES, or its handles sink by the
 * difference - silently, because nothing else in the manifest reads it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateManifest } from '../viewer/js/generate.js';

/* the Deco handle's own depth, from HANDLE_STYLES - the handle is placed by its CENTRE, so its
   back face is centre - d/2 */
const DECO_DEPTH = 24;
/* each bolt-on family: its plate's z-centre and depth, as FACE_FAMILIES carries them */
const PLATES = { essential: { z: 95.07, depth: 5.0 }, chevron: { z: 95.67, depth: 6.2 } };

const build = (faceStyle) => ({
  mount: 'tabletop', length: 185, gridW: 2, gridH: 2, faceStyle, handleStyle: 'deco',
  placed: [{ id: 1, x: 0, y: 2, w: 1, hh: 2, fill: 'decor' }], nextId: 2, removedStoppers: [],
});

const parts = (faceStyle) => {
  const { errors, manifest } = generateManifest(build(faceStyle));
  assert.deepEqual(errors, [], `${faceStyle} generated with errors`);
  const plate = manifest.instances.find((i) => /^Faceplate_/.test(i.node));
  const handle = manifest.instances.find((i) => /^Handle_/.test(i.node));
  assert.ok(plate && handle, `${faceStyle} is missing its plate or handle`);
  return { plate, handle };
};

test('a handle seats its back face on ITS OWN family\'s plate front', () => {
  for (const [fam, p] of Object.entries(PLATES)) {
    const { plate, handle } = parts(fam);
    assert.equal(plate.pos[2], p.z, `${fam}: the plate moved`);
    const back = handle.pos[2] - DECO_DEPTH / 2;
    assert.ok(Math.abs(back - (p.z + p.depth / 2)) < 1e-9,
      `${fam}: the handle's back face is ${back}, the plate's front is ${p.z + p.depth / 2}`);
  }
});

test('⚔ Essential is unchanged - it is the calibrated ground truth', () => {
  /* 109.57 was measured off the TableTop Kit assembly reference (2026-07-04); the fix must be a
     no-op for the family the old constant was right for, or it is a re-tuning, not a fix. */
  const { handle } = parts('essential');
  assert.equal(handle.pos[2], 109.57);
});

test('⚔ a deeper plate pushes its handle further out, by exactly the depth difference', () => {
  /* the defect in one line: Chevron is 1.2 mm deeper than Essential, so its handle must sit 1.2 mm
     further out. Before the fix both families put it at the same z, which is what sank it. */
  const e = parts('essential').handle.pos[2];
  const c = parts('chevron').handle.pos[2];
  const expected = (PLATES.chevron.depth - PLATES.essential.depth) / 2 + (PLATES.chevron.z - PLATES.essential.z);
  assert.ok(Math.abs((c - e) - expected) < 1e-9, `chevron handle moved ${c - e}, expected ${expected}`);
  assert.ok(c > e, 'the deeper family must be further out, not the same');
});

test('the 165 collection shifts the whole set back by dz, handle included', () => {
  /* shared hardware is placed against a case face, so it carries the collection's ±dz - the handle
     must ride with its plate rather than keeping the 185 number. */
  const b = { ...build('chevron'), length: 165 };
  const { errors, manifest } = generateManifest(b);
  assert.deepEqual(errors, []);
  const plate = manifest.instances.find((i) => /^Faceplate_/.test(i.node));
  const handle = manifest.instances.find((i) => /^Handle_/.test(i.node));
  const dz = (185 - 165) / 2;
  assert.equal(plate.pos[2], PLATES.chevron.z - dz);
  assert.ok(Math.abs((handle.pos[2] - DECO_DEPTH / 2) - (plate.pos[2] + PLATES.chevron.depth / 2)) < 1e-9);
});
