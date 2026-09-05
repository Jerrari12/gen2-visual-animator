/* FILAMENT PRESETS: every part type themed, every colour REAL.
 *
 * Two promises a preset makes, both of which have been broken silently before:
 *
 * 1. EVERY colour is a real catalog entry with a clickable buy link. The
 *    2026-08-07 audit found 'Black', 'Dark Grey', 'Prusa Orange PETG' and
 *    'Holo Blue' silently failing the picker's active-ring match, which keys on
 *    exact labels. `_db()` fixed that by pulling from FILAMENT_DB by label - an
 *    unknown label warns and falls back to a grey stand-in, so the failure is
 *    LOUD but only in a console nobody reads during a build.
 *
 * 2. EVERY part type is themed. A type a preset does not define falls back to
 *    the IDENTIFICATION colour, so a themed build shows one rainbow part. That
 *    is exactly what shipped on 2026-08-29: `ShelfInsert`, `ShelfLip` and
 *    `CaseExtender` were in no preset, so The Jerrari rendered a teal deck and
 *    a coral lip inside an otherwise black-and-orange build (Joey 2026-08-30).
 *
 * ⚠ This is the test that makes adding a part TYPE a complete act: mint the
 * identification colour AND give all four presets an entry, or fail here.
 *
 * main.js cannot be imported under node (it builds a WebGL renderer at module
 * scope), so PRESETS is lifted out and EXECUTED - the same technique
 * test/relay-contract.test.mjs uses. Every extraction is guarded: if a regex
 * stops matching, the test fails loudly rather than passing vacuously.
 *
 * ⚠ FILAMENT_DB IS IMPORTED NOW, NOT LIFTED (2026-09-05). It moved to its own
 * module, which node CAN import - so the catalog under test is the object the
 * viewer actually ships, rather than a re-execution of a text slice, and one
 * whole class of "the regex quietly stopped matching" is gone with it. PRESETS
 * still lives in main.js and is still lifted, with the catalog injected.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILAMENT_DB } from '../viewer/js/filament-db.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const main = readFileSync(join(root, 'viewer', 'js', 'main.js'), 'utf8');
const gen = readFileSync(join(root, 'viewer', 'js', 'generate.js'), 'utf8');
const L = main.split(/\r?\n/);

/* `_db` through the end of PRESETS. The catalog is IMPORTED above and injected
   into this scope, so the only thing executed here is the preset table. */
const from = L.findIndex((l) => /^function _db\s*\(/.test(l));
const pStart = L.findIndex((l) => /^const PRESETS\s*=/.test(l));
assert.ok(from >= 0 && pStart > from, 'could not locate _db / PRESETS in main.js');
let to = pStart;
while (to < L.length && !/^\];/.test(L[to])) to++;
assert.ok(to < L.length, 'PRESETS array is unterminated at column 0');

const warnings = [];
const { PRESETS } = new Function('__warn', 'FILAMENT_DB', [
  'const console = { warn: (m) => __warn.push(m) };',
  L.slice(from, to + 1).join('\n'),
  'return { PRESETS };',
].join('\n'))(warnings, FILAMENT_DB);

/* the identification palette's type list, from the generator */
function objAt(needle) {
  const s = gen.indexOf(needle);
  if (s < 0) return null;
  let d = 0;
  for (let i = s; i < gen.length; i++) {
    const c = gen[i];
    if ('([{'.includes(c)) d++;
    else if (')]}'.includes(c)) d--;
    else if (c === ';' && d === 0)
      return new Function(gen.slice(s, i + 1) + ' return ' + needle.split(/\s+/)[1] + ';')();
  }
  return null;
}
const COLORS = objAt('const COLORS');
const SHELF_COLORS = objAt('const SHELF_COLORS') || {};
const extHex = (gen.match(/CaseExtender:\s*'([^']+)'/) || [])[1];

const ZONE_KEYS = ['Faceplate:FACE', 'Faceplate:GRIP', 'Faceplate:GRIP ACCENT'];
/* ⚠ FootAdhesive is deliberately EXCLUDED. It is a bought rubber foot, not
   filament: the row is `purchased`, so colorLocked always renders its real
   finish and a preset entry could never apply. Giving it one would contradict
   the "shown in its real finish" promise its own tooltip makes. */
const TYPES = [...Object.keys(COLORS || {}), ...Object.keys(SHELF_COLORS),
               ...(extHex ? ['CaseExtender'] : []), ...ZONE_KEYS]
  .filter((t) => t !== 'FootAdhesive');

test('the extraction actually found the catalog and the presets', () => {
  assert.ok(Array.isArray(FILAMENT_DB) && FILAMENT_DB.length >= 4, 'FILAMENT_DB looks wrong');
  assert.ok(FILAMENT_DB.reduce((a, b) => a + b.colors.length, 0) > 50, 'too few catalog colours - check the extraction');
  assert.equal(PRESETS.length, 4, 'expected four presets');
  assert.ok(COLORS && Object.keys(COLORS).length > 10, 'COLORS did not extract');
  assert.ok(TYPES.includes('ShelfInsert') && TYPES.includes('CaseExtender'),
    'the type list is missing the newest parts - the extraction is stale');
});

test('every preset colour is a REAL catalog entry', () => {
  /* `_db` warns and substitutes grey for an unknown label, so a drifted preset
     boots fine and merely looks wrong. Zero warnings is the proof. */
  assert.deepEqual(warnings, [], 'preset colours that are not in FILAMENT_DB');
});

test('every preset colour carries a buy URL people can click', () => {
  for (const p of PRESETS)
    for (const [k, v] of Object.entries(p.colors)) {
      assert.ok(v && v.name, `${p.name}.${k}: no colour`);
      assert.ok(v.url && /^https?:\/\//.test(v.url), `${p.name}.${k} (${v.name}): no buyable url`);
    }
});

test('every part TYPE is themed by every preset', () => {
  for (const p of PRESETS) {
    const missing = TYPES.filter((t) => !(t in p.colors));
    assert.deepEqual(missing, [],
      `${p.name} leaves ${missing.join(', ')} undefined - those fall back to the ` +
      'identification colour, so a themed build shows a rainbow part');
  }
});

test('a case extender wears the CASE colour in every preset', () => {
  /* Joey 2026-08-30: an extender IS a case without the bottom, so a stacked
     shelf must not read as two different products. */
  for (const p of PRESETS)
    assert.equal(p.colors.CaseExtender.name, p.colors.Case.name,
      `${p.name}: extender is ${p.colors.CaseExtender.name} but the case is ${p.colors.Case.name}`);
});

test('The Jerrari keeps the shelf colours Joey specified', () => {
  const j = PRESETS.find((p) => p.name === 'The Jerrari');
  assert.ok(j, 'The Jerrari preset is gone');
  assert.match(j.colors.ShelfInsert.name, /white/i, 'the shelf insert should be white');
  assert.equal(j.colors.ShelfLip.name, j.colors.Case.name, 'the lip should be case black');
  assert.equal(j.colors.CaseExtender.name, j.colors.Case.name, 'the extender should be case black');
});

/* Relative luminance contrast, the standard formula - the same one used to
   audit the planner's text colours in 2026-08-08. */
const _lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => {
  const [hi, lo] = [_lum(a), _lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('the shelf DECK stays legible against its own case colour', () => {
  /* Joey 2026-08-30: "the shelf to match yet be a higher contrast when
     available to the color theme". The deck is the surface you have to see
     things on, so it takes the high-contrast end of the preset's OWN palette -
     never a colour from outside the theme.
     ⚠ Stealth shipped at 1.64:1 (Dark Grey on a black case): a deck you could
     not see. 4.5:1 is the recognised legibility floor. */
  for (const p of PRESETS) {
    const r = contrast(p.colors.ShelfInsert.hex, p.colors.Case.hex);
    assert.ok(r >= 4.5,
      `${p.name}: deck ${p.colors.ShelfInsert.name} is only ${r.toFixed(2)}:1 against ` +
      `case ${p.colors.Case.name} - pick a lighter colour the preset already uses`);
  }
});

test('the shelf LIP wears the case colour, framing the deck', () => {
  for (const p of PRESETS)
    assert.equal(p.colors.ShelfLip.name, p.colors.Case.name,
      `${p.name}: lip is ${p.colors.ShelfLip.name}, case is ${p.colors.Case.name}`);
});

test('the deck colour comes from INSIDE the preset, not a new filament', () => {
  /* "match the theme" - the deck must be a colour the preset already uses
     elsewhere, so raising contrast can never smuggle in a fifth filament the
     builder would have to buy just for the shelf. */
  for (const p of PRESETS) {
    const used = new Set(Object.entries(p.colors)
      .filter(([k]) => k !== 'ShelfInsert').map(([, v]) => v.name));
    assert.ok(used.has(p.colors.ShelfInsert.name),
      `${p.name}: deck ${p.colors.ShelfInsert.name} is used by no other part - ` +
      'that is a whole extra spool for one deck');
  }
});
