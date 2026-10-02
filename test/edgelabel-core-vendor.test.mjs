/* THE VENDORED EDGELABEL LABEL CORE - drift gate + the behaviour this app leans on.
 *
 * `viewer/js/vendor/edgelabel-core.js` is a BYTE-FOR-BYTE copy of the EdgeLabel label generator's `label-core.js`: the
 * generator's own code for laying out and building one label (text area, word wrap, auto-shrink, the left badge, the icon
 * library, the keyword -> icon prediction). The 3D Build Studio builds every drawer label with it, so a label previewed on a
 * drawer is the label the generator prints. A port would drift; a copy that differs is the same drift with extra steps.
 *
 * Same chain as tabletop-completion: the sha256 is pinned here, and this test also checks byte equality against the
 * generator's file when that checkout is present (GEN2_EDGELABEL_ROOT, or a "GEN2 EdgeLabel Label Generator" folder beside
 * this repo or beside its worktree folder). Its absence (a fresh clone, CI) leaves the pin to catch a viewer-side edit.
 *
 * ⚠ Bump the pin ONLY after the GENERATOR's file legitimately changed and was re-copied here. Never edit the viewer's copy.
 *
 * Measured 2026-10-02 (scratchpad labelcore/deep.mjs): the viewer's three r185 builds the SAME SOLID as the generator's three
 * 0.146 from this file - volume, surface area and bounding box equal to 1e-11 on 27 texts x 3 settings and all 23 icons, and
 * every fits verdict equal - but splits flat faces into triangles differently (5 icons carry 12-36 fewer vertices). So the
 * geometry is the same shape, not the same bytes; nothing here asserts triangle-level equality across three versions.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDORED = join(root, 'viewer', 'js', 'vendor', 'edgelabel-core.js');
const GEN = process.env.GEN2_EDGELABEL_ROOT
  ? [process.env.GEN2_EDGELABEL_ROOT]
  : [join(root, '..', 'GEN2 EdgeLabel Label Generator'), join(root, '..', '..', 'GEN2 EdgeLabel Label Generator')];
const GEN_ROOT = GEN.find((d) => existsSync(join(d, 'label-core.js')));
const PINNED_SHA256 = 'c5e7fb96a93a2670c079781cfeec5909930dadacf379fe81bbb156b6672448ac';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

function loadCore() {
  delete globalThis.GEN2EdgeLabelCore;
  (0, eval)(readFileSync(VENDORED, 'utf8'));
  const M = globalThis.GEN2EdgeLabelCore;
  assert.ok(M && typeof M.create === 'function', 'GEN2EdgeLabelCore.create is missing');
  return M.create({ THREE: {} });   // nothing below builds geometry, so no three is needed
}

test('the vendored copy matches its pin', () => {
  assert.ok(existsSync(VENDORED), 'viewer/js/vendor/edgelabel-core.js is missing');
  const actual = sha(VENDORED);
  assert.equal(actual, PINNED_SHA256,
    `vendored edgelabel-core.js changed (sha256 ${actual.slice(0, 16)}…).\n` +
    '  Edit the GENERATOR\'s label-core.js, copy it here, then bump PINNED_SHA256.');
});

test('the vendored copy is byte-identical to the generator\'s label-core.js (when the generator is checked out)', (t) => {
  if (!GEN_ROOT) { t.skip('EdgeLabel generator checkout not present - pin-only'); return; }
  assert.ok(readFileSync(VENDORED).equals(readFileSync(join(GEN_ROOT, 'label-core.js'))),
    'viewer/js/vendor/edgelabel-core.js differs from the generator\'s label-core.js - re-copy it');
});

test('the core\'s DEFAULTS are the values the generator\'s inputs start at (when the generator is checked out)', (t) => {
  if (!GEN_ROOT) { t.skip('EdgeLabel generator checkout not present'); return; }
  const html = readFileSync(join(GEN_ROOT, 'index.html'), 'utf8');
  const input = (id) => { const m = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`)); assert.ok(m, `no #${id} in the generator`); return m[0]; };
  const value = (id) => input(id).match(/value="([^"]*)"/)[1];
  const checked = (id) => /\schecked(\s|>|\/)/.test(input(id));
  const D = loadCore().DEFAULTS;
  assert.equal(D.capMm, +value('font-size'));
  assert.equal(D.depth, +value('text-depth'));
  assert.equal(D.badgeSize, +value('badge-size'));
  assert.equal(D.bold, checked('bold-text'));
  assert.equal(D.allCaps, checked('all-caps'));
  assert.equal(D.predictIcons, checked('predict-icons'));
  assert.equal(D.colorBase, value('color-base').toLowerCase());
  assert.equal(D.colorText, value('color-text').toLowerCase());
});

test('label-text.js seeds the text colour the core defaults to', () => {
  const src = readFileSync(join(root, 'viewer', 'js', 'label-text.js'), 'utf8');
  const m = src.match(/LABEL_TEXT_DEFAULTS = Object\.freeze\(\{ hex: '(#[0-9a-f]{6})' \}\)/i);
  assert.ok(m, 'LABEL_TEXT_DEFAULTS.hex not found in label-text.js');
  assert.equal(m[1].toLowerCase(), loadCore().DEFAULTS.colorText);
});

test('the generator\'s icon prediction, as the viewer applies it by default', () => {
  const C = loadCore();
  assert.equal(C.guessIconId('Torx Bits'), 'screw-torx-head');      // "torx" is listed before "bits" (drill bit)
  assert.equal(C.guessIconId('drill bits'), 'drill-bit');
  assert.equal(C.guessIconId('M3 Screws'), null);                    // generic screws deliberately get no icon
  assert.equal(C.guessIconId('Zip Ties & Clips'), null);
  assert.equal(C.guessIconId('icing'), null);                        // whole words only: "ic" must not fire inside "icing"
  for (const [, id] of C.KEYWORD_ICONS) assert.ok(C.ICON_LIBRARY.some((i) => i.id === id), `prediction names a missing icon: ${id}`);
});

test('prepareLabel is the generator\'s per-row rule: ALL CAPS on text and letter badges, nothing for an empty row', () => {
  const C = loadCore();
  assert.deepEqual(C.prepareLabel('Torx Bits', { type: 'icon', value: 'screw-torx-head' }, true),
    { text: 'TORX BITS', badge: { type: 'icon', value: 'screw-torx-head' } });
  assert.deepEqual(C.prepareLabel('m3', { type: 'char', value: 'a' }, true), { text: 'M3', badge: { type: 'char', value: 'A' } });
  assert.deepEqual(C.prepareLabel('m3', { type: 'char', value: 'a' }, false), { text: 'm3', badge: { type: 'char', value: 'a' } });
  assert.deepEqual(C.prepareLabel('', { type: 'char', value: '7' }, true), { text: '', badge: { type: 'char', value: '7' } });
  assert.equal(C.prepareLabel('   ', { type: 'none' }, true), null);
  assert.equal(C.prepareLabel('', { type: 'char', value: ' ' }, true), null);
  assert.equal(C.prepareLabel('', { type: 'icon' }, true), null);
});
