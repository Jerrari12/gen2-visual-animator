/* THE LABEL PANEL'S PURE PARTS (label plan step 2, 2026-10-02) - what one edit writes into a build, how a badge's state is
 * named, and the two relay helpers in isolation. viewer/js/label-panel.js has no DOM and no three, so it imports under node;
 * the vendored core (the generator's own guessIconId / ICON_LIBRARY / prepareLabel) is evaluated the way
 * edgelabel-core-vendor.test.mjs does it. The relay helpers' behaviour against main.js's REAL layoutKey / currentOpts /
 * incoming block is in test/relay-contract.test.mjs; this file pins the parts those run on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LABEL_STYLE_FALLBACK, LABEL_STYLE_ROWS, isLabelUnit, labelOrder, effectiveStyle, labelOptsOf, labelOptsChanges, applyLabelOpts,
  labelOnlyDiff, copyLabelFields, editCommit, styleEdit, iconChoices, badgeStateText, shownBadge, historyKeyOf } from '../viewer/js/label-panel.js';
import { LABEL_SPEC } from '../viewer/js/label-spec.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function loadCore() {
  delete globalThis.GEN2EdgeLabelCore;
  (0, eval)(readFileSync(join(root, 'viewer', 'js', 'vendor', 'edgelabel-core.js'), 'utf8'));
  return globalThis.GEN2EdgeLabelCore.create({ THREE: {} });
}
const core = loadCore();

const unit = (id, extra = {}) => ({ id, x: id - 1, y: 2, w: 1, hh: 2, fill: 'decor', shelves: 0, ...extra });
const build = (extra = {}) => ({ mount: 'tabletop', length: 185, gridW: 4, gridH: 4, buildId: 'k7m2p9q4x1z8',
  placed: [unit(1, { label: 'Torx Bits' }), unit(2, { label: 'Nuts', labelBadge: { type: 'icon', value: 'nut' } }), unit(3), unit(4, { fill: 'classic', label: 'Washers' })], ...extra });

test('badgeStateText names the three states, and says the letter the way the label prints it', () => {
  assert.equal(badgeStateText('Torx Bits', undefined, null, core), 'Auto · screw torx head', 'the core\'s own icon NAME, lower-cased');
  assert.equal(badgeStateText('Zip Ties', undefined, null, core), 'Auto · none matched');
  assert.equal(badgeStateText('Torx Bits', undefined, { predictIcons: false }, core), 'Auto · off');
  assert.equal(badgeStateText('Torx Bits', undefined, null, null), 'Auto', 'before the core loads nothing is predicted yet');
  assert.equal(badgeStateText('Torx Bits', { type: 'none' }, null, core), 'No icon');
  assert.equal(badgeStateText('Torx Bits', { type: 'icon', value: 'nut' }, null, core), 'Manual · nut');
  assert.equal(badgeStateText('Torx Bits', { type: 'icon', value: 'a-newer-icon' }, null, core), 'Manual · a-newer-icon', 'an unknown id reads as itself');
  assert.equal(badgeStateText('Torx Bits', { type: 'char', value: 'm3' }, null, core), 'Letter · M3', 'ALL CAPS by default, like prepareLabel');
  assert.equal(badgeStateText('Torx Bits', { type: 'char', value: 'm3' }, { allCaps: false }, core), 'Letter · m3');
  assert.equal(badgeStateText('Torx Bits', { type: 'svg', value: '<svg/>' }, null, core), 'Auto · screw torx head', 'a badge the cleaner drops reads as Auto');
});

test('shownBadge is what the button shows: the manual badge, else the prediction (marked predicted)', () => {
  assert.deepEqual(shownBadge('Torx Bits', undefined, null, core), { type: 'icon', value: 'screw-torx-head', predicted: true });
  assert.deepEqual(shownBadge('Zip Ties', undefined, null, core), { type: 'none', predicted: true });
  assert.deepEqual(shownBadge('Torx Bits', undefined, { predictIcons: false }, core), { type: 'none', predicted: true });
  assert.deepEqual(shownBadge('Torx Bits', { type: 'char', value: 'T' }, null, core), { type: 'char', value: 'T' });
  assert.deepEqual(shownBadge('Torx Bits', { type: 'none' }, null, core), { type: 'none' });
  // the two agree with the geometry's own choice (label-text.js defaultBadge is core.guessIconId under predictIcons)
  assert.equal(shownBadge('Torx Bits', undefined, null, core).value, core.guessIconId('Torx Bits'));
});

test('editCommit: the words cleaned, empty words take the badge with them, a badge only on a unit with words, the previous state returned', () => {
  const b = build();
  assert.deepEqual(editCommit(b, 1, { label: '  bolts  ' }), { label: 'Torx Bits', labelBadge: undefined });
  assert.equal(b.placed[0].label, 'bolts', 'stored AS TYPED (trimmed), never upper-cased');
  assert.deepEqual(editCommit(b, 2, { label: '' }), { label: 'Nuts', labelBadge: { type: 'icon', value: 'nut' } });
  assert.ok(!('label' in b.placed[1]) && !('labelBadge' in b.placed[1]), 'clearing the words must delete the badge too');
  editCommit(b, 3, { labelBadge: { type: 'icon', value: 'nut' } });
  assert.ok(!('labelBadge' in b.placed[2]), 'a unit with no words took a badge');
  editCommit(b, 1, { labelBadge: { type: 'char', value: ' t ' } });
  assert.deepEqual(b.placed[0].labelBadge, { type: 'char', value: 't' }, 'a letter badge is trimmed and kept as typed');
  editCommit(b, 1, { labelBadge: { type: 'svg', value: '<svg/>' } });
  assert.deepEqual(b.placed[0].labelBadge, { type: 'char', value: 't' }, 'a hostile badge must leave the stored one alone');
  editCommit(b, 1, { labelBadge: null });
  assert.ok(!('labelBadge' in b.placed[0]), 'Auto (null) must delete the badge so the generator predicts again');
  editCommit(b, 1, { label: 'y'.repeat(50) });
  assert.equal(b.placed[0].label, 'y'.repeat(40));
  assert.equal(editCommit(b, 4, { label: 'Shims' }), null, 'a classic unit is not the card\'s to edit');
  assert.equal(b.placed[3].label, 'Washers');
  assert.equal(editCommit(b, 99, { label: 'x' }), null);
  // ONE patch may carry the words AND the badge - the card's Undo restores a unit's previous pair in a single commit (one post),
  // never "old words first, then the badge" (Sol 01a0fffd, 3); the words apply first, so the badge lands only if words remain
  const c = build();
  const prev = editCommit(c, 3, { label: 'Hex Keys', labelBadge: { type: 'char', value: 'm3' } });
  assert.deepEqual(prev, { label: undefined, labelBadge: undefined });
  assert.equal(c.placed[2].label, 'Hex Keys'); assert.deepEqual(c.placed[2].labelBadge, { type: 'char', value: 'm3' });
  editCommit(c, 3, { label: prev.label ?? '', labelBadge: prev.labelBadge === undefined ? null : prev.labelBadge });   // the Undo's own call
  assert.ok(!('label' in c.placed[2]) && !('labelBadge' in c.placed[2]), 'undoing a first naming must leave the unit bare');
  editCommit(c, 2, { label: 'Bolts', labelBadge: null });
  assert.equal(c.placed[1].label, 'Bolts'); assert.ok(!('labelBadge' in c.placed[1]), 'words + null badge = words set, badge back to Auto');
  editCommit(c, 1, { label: '', labelBadge: { type: 'icon', value: 'nut' } });
  assert.ok(!('label' in c.placed[0]) && !('labelBadge' in c.placed[0]), 'empty words take the badge with them even when the patch names one');
});

test('styleEdit stores what the generator\'s inputs would take and DROPS the rest - never clamps; a default is stored explicitly', () => {
  const b = build();
  assert.equal(styleEdit(b, 'capMm', 4), true); assert.deepEqual(b.labelStyle, { capMm: 4 });
  assert.equal(styleEdit(b, 'capMm', 7), false, '7 mm must be refused'); assert.deepEqual(b.labelStyle, { capMm: 4 }, 'and nothing stored');
  assert.equal(styleEdit(b, 'capMm', NaN), false); assert.deepEqual(b.labelStyle, { capMm: 4 });
  assert.equal(styleEdit(b, 'depth', 1.2), true); assert.deepEqual(b.labelStyle, { capMm: 4, depth: 1.2 }, 'the limit itself is in range');
  assert.equal(styleEdit(b, 'depth', 1.21), false);
  assert.equal(styleEdit(b, 'bold', true), true); assert.equal(styleEdit(b, 'bold', 'yes'), false); assert.equal(b.labelStyle.bold, true);
  assert.equal(styleEdit(b, 'capMm', 5), true); assert.equal(b.labelStyle.capMm, 5, 'the generator\'s default is still stored when chosen');
  assert.equal(styleEdit(b, 'colorText', '#f00'), false, 'colours are filament picks, not label style');
  assert.equal(styleEdit(null, 'capMm', 4), false);
  // the effective style the rows read: defaults under the stored values
  assert.deepEqual(effectiveStyle({ labelStyle: { capMm: 4, allCaps: false } }), { ...LABEL_STYLE_FALLBACK, capMm: 4, allCaps: false });
  assert.deepEqual(effectiveStyle({ labelStyle: { capMm: 9 } }), LABEL_STYLE_FALLBACK, 'an out-of-range stored value reads as the default');
  assert.deepEqual(LABEL_STYLE_ROWS.map((r) => r.key), Object.keys(LABEL_SPEC.limits));
});

test('labelOptsOf: decor units only, cleaned, badges for the labelled ones, the id only when valid', () => {
  const o = labelOptsOf(build());
  assert.deepEqual(o, { buildId: 'k7m2p9q4x1z8', labels: { 1: 'Torx Bits', 2: 'Nuts', 3: '' }, labelBadges: { 1: null, 2: { type: 'icon', value: 'nut' } }, labelStyle: null });
  assert.equal(labelOptsOf(build({ buildId: 'BAD' })).buildId, null);
  assert.deepEqual(labelOptsOf({ placed: [unit(1, { label: ' ' + 'z'.repeat(45), labelBadge: 'nut' })] }).labels, { 1: 'z'.repeat(40) });
  assert.deepEqual(labelOptsOf({ placed: [unit(1, { label: 'a', labelBadge: 'nut' })] }).labelBadges, { 1: null });
  assert.deepEqual(labelOptsOf(null), { buildId: null, labels: {}, labelBadges: {}, labelStyle: null });
});

test('labelOptsChanges / applyLabelOpts: the three booleans, the mismatch, the planner\'s rules', () => {
  const b = build();
  assert.deepEqual(labelOptsChanges(b, { buildId: 'zzzzzzzzzzzz', labels: { 1: 'x' } }), { mismatch: true, text: false, badge: false, style: false });
  assert.deepEqual(applyLabelOpts(b, { buildId: 'zzzzzzzzzzzz', labels: { 1: 'x' } }).mismatch, true);
  assert.equal(b.placed[0].label, 'Torx Bits', 'a mismatch wrote through');
  assert.deepEqual(labelOptsChanges(b, { labels: { 1: 'Torx Bits', 2: 'Nuts', 3: '' }, labelBadges: { 1: null, 2: { type: 'icon', value: 'nut' } }, labelStyle: null }),
    { mismatch: false, text: false, badge: false, style: false }, 'the build\'s own post is not a change');
  assert.deepEqual(labelOptsChanges(b, { labels: { 1: ' Torx Bits ' } }).text, false, 'whitespace around the same words is not a change');
  assert.deepEqual(labelOptsChanges(b, { labelBadges: { 2: { value: 'nut', type: 'icon' } } }).badge, false, 'a badge with its keys in another order is the same badge');
  assert.deepEqual(labelOptsChanges(b, { labelStyle: { bold: false, capMm: 5 } }).style, true);
  assert.deepEqual(labelOptsChanges(b, { labelStyle: { colorText: '#f00' } }).style, false, 'a style that cleans to null against null is no change');
  // a badge for a unit whose words are being cleared in the same message is not a change (the words take it)
  assert.deepEqual(labelOptsChanges(b, { labels: { 2: '' }, labelBadges: { 2: { type: 'none' } } }), { mismatch: false, text: true, badge: false, style: false });
  const r = applyLabelOpts(b, { labels: { 2: '' }, labelBadges: { 2: { type: 'none' } } });
  assert.deepEqual(r, { mismatch: false, text: true, badge: false, style: false });
  assert.ok(!('label' in b.placed[1]) && !('labelBadge' in b.placed[1]));
  assert.deepEqual(applyLabelOpts(b, { labels: { 3: 'Bolts' }, labelBadges: { 3: { type: 'char', value: 'B' } } }), { mismatch: false, text: true, badge: true, style: false },
    'words and a badge arriving together both apply (the words first)');
  assert.deepEqual(b.placed[2].labelBadge, { type: 'char', value: 'B' });
  assert.equal(labelOptsChanges(b, { labels: { 4: 'Shims' } }).text, false, 'a classic unit is never the relay\'s');
  assert.equal(labelOptsChanges(null, {}).mismatch, false);
  // a HOSTILE badge is no change: applyLabelOpts leaves the stored badge alone, so counting it would rebuild the label for
  // nothing (65-263 ms of main thread per label - review X5, 2026-10-03)
  const c = build();
  for (const bad of [{ type: 'svg', value: '<svg/>' }, { type: 'icon', value: 'Not An Id!' }, { type: 'char', value: 'ABCDE' }, 'nut', 7, {}])
    assert.equal(labelOptsChanges(c, { labelBadges: { 2: bad } }).badge, false, `${JSON.stringify(bad)} counted as a badge change`);
  assert.equal(labelOptsChanges(c, { labelBadges: { 2: { type: 'icon', value: 'bolt' } } }).badge, true, 'the control: a real badge change counts');
});

test('historyKeyOf: Ctrl/Cmd+Z is undo, Ctrl/Cmd+Y and Ctrl/Cmd+Shift+Z are redo, nothing else (review D2)', () => {
  const k = (key, m = {}) => historyKeyOf({ key, code: m.code || '', ctrlKey: !!m.ctrl, metaKey: !!m.meta, shiftKey: !!m.shift, altKey: !!m.alt });
  assert.equal(k('z', { ctrl: true }), 'undo');
  assert.equal(k('Z', { ctrl: true, shift: true }), 'redo');
  assert.equal(k('z', { meta: true }), 'undo');
  assert.equal(k('y', { ctrl: true }), 'redo');
  assert.equal(k('y', { ctrl: true, shift: true }), null);
  assert.equal(k('z'), null, 'a plain z is typing');
  assert.equal(k('z', { ctrl: true, alt: true }), null, 'AltGr / Ctrl+Alt is a character on some layouts');
  assert.equal(k('a', { ctrl: true }), null);
  assert.equal(k('Dead', { ctrl: true, code: 'KeyZ' }), 'undo', 'a layout whose Z key reports another key still undoes');
  assert.equal(historyKeyOf(null), null);
});

test('labelOnlyDiff and copyLabelFields with a stand-in key: nothing but label fields and the id may differ', () => {
  // a key that reads the same fields main.js's does (the relay test runs the REAL one); here the shape is what is under test
  const key = (x) => JSON.stringify([x.mount, +x.length, (x.placed || []).map((u) => [u.id, u.x, u.y, u.w, u.hh, u.fill, u.label || '', JSON.stringify(u.labelBadge ?? null), u.closure || '']), JSON.stringify(x.labelStyle ?? null), x.buildId || '']);
  const cur = build();
  const nb = build({ buildId: 'zzzzzzzzzzzz', labelStyle: { capMm: 4 } }); nb.placed[2].label = 'Bolts'; delete nb.placed[1].labelBadge;
  assert.equal(labelOnlyDiff(nb, cur, key), true);
  assert.equal(labelOnlyDiff(build(), cur, key), false, 'identical');
  const moved = build(); moved.placed[0].x = 3;
  assert.equal(labelOnlyDiff(moved, cur, key), false, 'a moved unit');
  assert.equal(labelOnlyDiff(null, cur, key), false);
  assert.deepEqual(copyLabelFields(nb, cur), [3]);
  assert.equal(key(cur), key(nb), 'the copy must leave the keys equal');
  assert.equal(cur.buildId, 'zzzzzzzzzzzz'); assert.deepEqual(cur.labelStyle, { capMm: 4 });
  assert.ok(!('labelBadge' in cur.placed[1]), 'the planner dropped the badge; the copy must too');
  // the planner's null style lands as null, a style-less planner build too
  const c2 = build({ labelStyle: { bold: true } }); copyLabelFields(build({ labelStyle: undefined }), c2); assert.equal(c2.labelStyle, null);
});

test('labelOrder is the planner\'s one drawer order (top row first, then left to right); isLabelUnit is decor only', () => {
  const us = [unit(1, { x: 2, y: 2 }), unit(2, { x: 0, y: 2 }), unit(3, { x: 1, y: 0 }), unit(4, { x: 0, y: 0 })];
  assert.deepEqual(labelOrder(us).map((u) => u.id), [4, 3, 2, 1]);
  assert.deepEqual(us.map((u) => u.id), [1, 2, 3, 4], 'labelOrder must not reorder its input');
  assert.equal(isLabelUnit(unit(1)), true);
  for (const f of ['classic', 'shelf', 'cabinet']) assert.equal(isLabelUnit(unit(1, { fill: f })), false);
  assert.equal(isLabelUnit(null), false);
  assert.equal(iconChoices(core).length, core.ICON_LIBRARY.length);
});
