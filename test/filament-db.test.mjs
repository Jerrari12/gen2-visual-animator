/* THE FILAMENT CATALOG'S SHAPE, AND THE ONE INVARIANT EVERYTHING KEYS ON.
 *
 * `filament-db.js` moved out of main.js on 2026-09-05 so the Filament Material
 * Lab could read it. Nothing checked the catalog itself before that - the tests
 * that touch it check what PRESETS do WITH it - so the invariants its own header
 * states were asserted only in prose.
 *
 * ⚠ `label` UNIQUENESS IS LOAD-BEARING, NOT TIDINESS. It is the identity key
 * `customColors` stores, the key `_db()` resolves presets by, and the key the
 * picker's active-ring match compares. A duplicate would not throw: it would
 * silently bind two catalogue entries to one saved palette slot, and the loser
 * would change colour when someone else's row was edited.
 *
 * ⚠ AND `label` IS DERIVED FOR FOUR OF THE SIX BRANDS, by a `.map()` at the end
 * of each block. That is why the pattern is asserted per brand rather than
 * globally: a row appended AFTER the map - or a block whose map is dropped in a
 * refactor - keeps a bare `name` and no `url`, which reads as a working entry
 * right up until a preset cannot resolve it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FILAMENT_DB } from '../viewer/js/filament-db.js';

/** How each brand's `label` is built. `null` = the rows carry their own. */
const LABEL_PREFIX = {
  'Panchroma™ PLA': 'Panchroma ',
  'Panchroma™ Silk PLA': 'Panchroma ',
  PETG: 'Polymaker ',
  'PLA / PETG': null,                 // Elegoo, explicit per row
  PLA: 'Printed Solid ',
  'Burnt Titanium PLA': null,         // ERYONE, explicit per row
};

test('the catalog is the shape main.js and the Lab both read', () => {
  assert.ok(Array.isArray(FILAMENT_DB), 'FILAMENT_DB is an array');
  assert.equal(FILAMENT_DB.length, 6, 'six brand entries');

  for (const b of FILAMENT_DB) {
    const where = `${b.brand} / ${b.line}`;
    assert.equal(typeof b.brand, 'string', `${where}: brand`);
    assert.equal(typeof b.line, 'string', `${where}: line`);
    assert.match(b.url, /^https:\/\//, `${where}: brand url is https`);
    assert.ok(Array.isArray(b.colors) && b.colors.length > 0, `${where}: has colours`);
  }
});

test('every colour carries the four fields a consumer may rely on', () => {
  /* ⚠ THE OPTIONAL FIELDS ARE DELIBERATELY NOT REQUIRED. `id` is a storefront
     variant id kept so plain deep links can be restored the day Superfiliate
     supports them, and 20 of the 101 rows have none; `pick` / `pickNote` mark
     Joey's recommendations. Requiring them would make adding an ordinary colour
     fail this test for no reason. */
  let n = 0;
  for (const b of FILAMENT_DB) {
    for (const c of b.colors) {
      n += 1;
      const where = `${b.brand} "${c.name}"`;
      assert.equal(typeof c.name, 'string', `${where}: name`);
      assert.equal(typeof c.label, 'string', `${where}: label`);
      assert.ok(c.label.length > 0, `${where}: label is not empty`);
      assert.match(c.hex, /^#[0-9a-fA-F]{6}$/, `${where}: hex`);
      assert.match(c.url, /^https:\/\//, `${where}: url is https`);
      if ('id' in c) assert.equal(typeof c.id, 'number', `${where}: id is a number`);
      if ('pickNote' in c) assert.ok(c.pick === true, `${where}: pickNote without pick`);
    }
  }
  assert.equal(n, 101, 'one hundred and one colours');
});

test('⚔ every label is unique across every brand', () => {
  const seen = new Map();
  const clashes = [];
  for (const b of FILAMENT_DB) {
    for (const c of b.colors) {
      if (seen.has(c.label)) clashes.push(`"${c.label}" in both ${seen.get(c.label)} and ${b.line}`);
      seen.set(c.label, b.line);
    }
  }
  assert.deepEqual(clashes, [], 'labels collide, and customColors keys on them');
  assert.equal(seen.size, 101, 'every colour contributed a distinct label');
});

test('⚔ each brand builds its labels the way its block says it does', () => {
  /* Catches the row appended after the `.map()`, which is the way this breaks. */
  for (const b of FILAMENT_DB) {
    const prefix = LABEL_PREFIX[b.line];
    assert.notEqual(prefix, undefined, `${b.line}: unknown brand line - add it to LABEL_PREFIX`);
    if (prefix === null) continue;
    for (const c of b.colors) {
      assert.equal(c.label, prefix + c.name,
        `${b.line} "${c.name}": label should be "${prefix}${c.name}" - was the .map() skipped?`);
    }
  }
});

test('the labels the presets and the Classic faceplate hard-code still resolve', () => {
  /* These four are named as string literals in main.js's PRESETS / CLASSIC_FACE.
     `_db()` degrades to a grey stand-in and a console warning when one is missing,
     so a rename would ship a grey part and a message nobody reads. */
  const all = new Set(FILAMENT_DB.flatMap((b) => b.colors.map((c) => c.label)));
  for (const label of [
    'Elegoo PLA Black',
    'Printed Solid Mystery Orange',
    'Panchroma Silk Silver',
    'ERYONE Burnt Titanium',
  ]) assert.ok(all.has(label), `no catalog colour labelled "${label}"`);
});
