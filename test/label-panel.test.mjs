/* THE LABEL PANEL'S PURE PARTS (label plan step 2, 2026-10-02) - what one edit writes into a build, how a badge's state is
 * named, and the two relay helpers in isolation. viewer/js/label-panel.js has no DOM and no three, so it imports under node;
 * the vendored core (the generator's own prepareLabel) and its icon catalog (label-icons.js: the icons, their names, the guess)
 * are evaluated the way edgelabel-core-vendor.test.mjs does it. The relay helpers' behaviour against main.js's REAL layoutKey / currentOpts /
 * incoming block is in test/relay-contract.test.mjs; this file pins the parts those run on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LABEL_STYLE_FALLBACK, LABEL_STYLE_ROWS, isLabelUnit, labelOrder, effectiveStyle, labelOptsOf, labelOptsChanges, applyLabelOpts,
  labelOnlyDiff, copyLabelFields, editCommit, styleEdit, iconChoices, iconGroups, badgeStateText, shownBadge, historyKeyOf,
  labelUploadFor, labelUploadOf, syncLabelList, uploadsKey, isLabelSvg } from '../viewer/js/label-panel.js';
import { LABEL_SPEC } from '../viewer/js/label-spec.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function loadCore() {
  delete globalThis.GEN2EdgeLabelCore;
  (0, eval)(readFileSync(join(root, 'viewer', 'js', 'vendor', 'edgelabel-core.js'), 'utf8'));
  return globalThis.GEN2EdgeLabelCore.create({ THREE: {} });
}
const core = loadCore();
// the catalog the card reads (label-text.js labelIcons()): the vendored icon art + label-icons.js over the core
(0, eval)(readFileSync(join(root, 'viewer', 'js', 'vendor', 'label-icon-art.js'), 'utf8'));
(0, eval)(readFileSync(join(root, 'viewer', 'js', 'vendor', 'label-icons.js'), 'utf8'));
const cat = globalThis.GEN2LabelIcons.create({ core, art: globalThis.GEN2LabelIconArt });

const unit = (id, extra = {}) => ({ id, x: id - 1, y: 2, w: 1, hh: 2, fill: 'decor', shelves: 0, ...extra });
const build = (extra = {}) => ({ mount: 'tabletop', length: 185, gridW: 4, gridH: 4, buildId: 'k7m2p9q4x1z8',
  placed: [unit(1, { label: 'Torx Bits' }), unit(2, { label: 'Nuts', labelBadge: { type: 'icon', value: 'nut' } }), unit(3), unit(4, { fill: 'classic', label: 'Washers' })], ...extra });

test('badgeStateText names the three states, and says the letter the way the label prints it', () => {
  assert.equal(badgeStateText('Torx Bits', undefined, null, cat), 'Auto · torx screw', 'the catalog\'s icon NAME, lower-cased');
  assert.equal(badgeStateText('Zip Ties', undefined, null, cat), 'Auto · none matched');
  assert.equal(badgeStateText('JST connectors', undefined, null, cat), 'Auto · wire connector', 'the wider guess names a new icon');
  assert.equal(badgeStateText('Torx Bits', undefined, { predictIcons: false }, cat), 'Auto · off');
  assert.equal(badgeStateText('Torx Bits', undefined, null, null), 'Auto', 'before the core loads nothing is predicted yet');
  assert.equal(badgeStateText('Torx Bits', { type: 'none' }, null, cat), 'No icon');
  assert.equal(badgeStateText('Torx Bits', { type: 'icon', value: 'nut' }, null, cat), 'Manual · hex nut, plain');
  assert.equal(badgeStateText('Torx Bits', { type: 'icon', value: 'hex-nut' }, null, cat), 'Manual · hex nut, chamfered');
  assert.equal(badgeStateText('Torx Bits', { type: 'icon', value: 'a-newer-icon' }, null, cat), 'Manual · a-newer-icon', 'an unknown id reads as itself');
  assert.equal(badgeStateText('Torx Bits', { type: 'char', value: 'm3' }, null, cat), 'Letter · M3', 'ALL CAPS by default, like prepareLabel');
  assert.equal(badgeStateText('Torx Bits', { type: 'char', value: 'm3' }, { allCaps: false }, cat), 'Letter · m3');
  assert.equal(badgeStateText('Torx Bits', { type: 'svg', value: '<svg/>' }, null, cat), 'Auto · torx screw', 'a badge the cleaner drops reads as Auto');
});

test('shownBadge is what the button shows: the manual badge, else the prediction (marked predicted)', () => {
  assert.deepEqual(shownBadge('Torx Bits', undefined, null, cat), { type: 'icon', value: 'screw-torx-head', predicted: true });
  assert.deepEqual(shownBadge('Paper clips', undefined, null, cat), { type: 'icon', value: 'paper-clip', predicted: true });
  assert.deepEqual(shownBadge('Zip Ties', undefined, null, cat), { type: 'none', predicted: true });
  assert.deepEqual(shownBadge('Torx Bits', undefined, { predictIcons: false }, cat), { type: 'none', predicted: true });
  assert.deepEqual(shownBadge('Torx Bits', { type: 'char', value: 'T' }, null, cat), { type: 'char', value: 'T' });
  assert.deepEqual(shownBadge('Torx Bits', { type: 'none' }, null, cat), { type: 'none' });
  // the two agree with the geometry's own choice (label-text.js defaultBadge is the catalog's guessIconId under predictIcons)
  assert.equal(shownBadge('Torx Bits', undefined, null, cat).value, cat.guessIconId('Torx Bits'));
  assert.equal(shownBadge('Misc', undefined, null, cat).value, cat.guessIconId('Misc'));
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
  // the picker offers the catalog: the core's 23 and the MODULITH family (never the staged coffee filter), in groups
  assert.equal(iconChoices(cat).length, cat.menu().length);
  assert.equal(iconChoices(cat).length, core.ICON_LIBRARY.length + 9, 'both drawings of each near twin');
  assert.equal(iconChoices(null), null, 'null until the catalog has loaded');
  assert.ok(!iconChoices(cat).some((c) => c.id === 'coffee-filter'));
  const gs = iconGroups(cat);
  assert.deepEqual(gs.map((g) => g.id), cat.GROUPS.map((g) => g.id));
  assert.equal(gs.reduce((n, g) => n + g.items.length, 0), cat.menu().length);
  assert.deepEqual(iconGroups(cat, 'scissors').map((g) => [g.id, g.items.map((i) => i.id)]), [['office', ['scissors']]]);
  assert.deepEqual(iconGroups(cat, 'zzzz'), []);
});

/* ---- a drawer's uploaded icon (2026-10-09; ChatGPT's review via Joey) ---- */
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0H10V10H0Z"/></svg>';
const withUpload = (over = {}) => build({
  labelList: { format: 'modulith-labels', version: 1, labels: [
    { id: 'lbltorx00001', text: 'Torx Bits', badge: { type: 'icon', svg: SVG } },
    { id: 'lblnuts00002', text: 'Nuts', badge: { type: 'icon', value: 'nut', svg: SVG } }] },
  labelAssign: { 1: 'lbltorx00001', 2: 'lblnuts00002' }, ...over });

test('labelUploadFor: a drawer wears its label\'s upload while its mirror badge is still the label\'s own; never anything that is not an SVG', () => {
  const b = withUpload();
  assert.equal(labelUploadFor(b, b.placed[0]), SVG, 'no id: the mirror carries no badge');
  assert.equal(labelUploadFor(b, b.placed[1]), SVG, 'uploaded with an id: the mirror carries that id');
  assert.equal(labelUploadFor(b, b.placed[2]), null, 'no label assigned');
  // a pick in the card changes the mirror: the pick shows (and the planner makes it the label's badge)
  assert.equal(labelUploadFor(b, { ...b.placed[0], labelBadge: { type: 'icon', value: 'star' } }), null);
  assert.equal(labelUploadFor(b, { ...b.placed[0], labelBadge: { type: 'none' } }), null);
  assert.equal(labelUploadFor(b, { ...b.placed[1], labelBadge: undefined }), null, 'the id was removed from the mirror: not the label\'s own any more');
  assert.equal(labelUploadFor(b, { ...b.placed[0], label: '' }), null, 'no words, no label');
  // the build's data is untrusted: only an SVG within the label list's bound
  for (const svg of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', 'x', 7, null, '<svg>' + 'x'.repeat(64 * 1024) + '</svg>']) {
    const bad = withUpload(); bad.labelList.labels[0].badge.svg = svg;
    assert.equal(labelUploadFor(bad, bad.placed[0]), null, String(svg).slice(0, 30));
  }
  assert.equal(isLabelSvg('  <svg viewBox="0 0 1 1"/>'), true);
  for (const junk of [{}, { labelList: {} }, { labelList: { labels: 'x' }, labelAssign: { 1: 'a' } }, { labelAssign: null }]) {
    const j = build(junk);
    assert.equal(labelUploadFor(j, j.placed[0]), null);
  }
  assert.equal(labelUploadFor(null, b.placed[0]), null);
});

test('uploadsKey: every drawer\'s upload - it moves when an upload changes and only then', () => {
  const k = uploadsKey(withUpload());
  assert.deepEqual(JSON.parse(k), [[1, SVG], [2, SVG]], 'the SVG text itself, not a digest (a 32-bit hash can be matched on purpose: Sol 01a1234d)');
  assert.equal(uploadsKey(withUpload()), k, 'deterministic');
  const changed = withUpload(); changed.labelList.labels[0].badge.svg = SVG.replace('H10', 'H9');
  assert.notEqual(uploadsKey(changed), k);
  assert.equal(uploadsKey(build()), '[]', 'no label list: nothing');
});

test('the card names an upload: shownBadge says the button shows it, badgeStateText says "Uploaded icon"', () => {
  assert.deepEqual(shownBadge('Torx Bits', undefined, null, cat, SVG), { type: 'icon', upload: true });
  assert.equal(badgeStateText('Torx Bits', undefined, null, cat, SVG), 'Uploaded icon');
  assert.equal(badgeStateText('Torx Bits', undefined, null, cat, null), 'Auto · torx screw', 'without one, as before');
});

test('copyLabelFields carries the build\'s label list (where uploads live) as the planner holds it; labelOnlyDiff counts a list-only change as label-only', () => {
  const cur = build();
  const nb = withUpload();
  copyLabelFields(nb, cur);
  assert.deepEqual(cur.labelList, nb.labelList);
  assert.deepEqual(cur.labelAssign, nb.labelAssign);
  assert.notEqual(cur.labelList, nb.labelList, 'a copy, not a shared reference');
  copyLabelFields(build(), cur);
  assert.equal('labelList' in cur, false, 'a layout without a list clears it');
  assert.equal('labelAssign' in cur, false);
  const key = (b) => JSON.stringify([b.placed.map((u) => [u.id, u.x, u.label || '']), b.labelStyle ?? null, b.buildId || '', uploadsKey(b)]);
  assert.equal(labelOnlyDiff(withUpload(), build(), key), true, 'a list-only change takes the cheap path');
});

/* ---- Auto vs Restore uploaded icon (ChatGPT's second review via Joey, 2026-10-09): Auto always means a guess from the words;
   putting an upload back is its own button, which needs the upload whether or not the drawer wears it now ---- */
test('labelUploadOf: the label\'s upload and the drawer badge that wears it, worn or not', () => {
  const b = withUpload();
  assert.deepEqual(labelUploadOf(b, b.placed[0]), { svg: SVG, own: null }, 'no id: worn while the drawer has no badge');
  assert.deepEqual(labelUploadOf(b, b.placed[1]), { svg: SVG, own: { type: 'icon', value: 'nut' } }, 'with an id: worn while the drawer carries it');
  // a pick in the card: no longer worn, still there to restore
  const picked = { ...b.placed[0], labelBadge: { type: 'icon', value: 'star' } };
  assert.equal(labelUploadFor(b, picked), null);
  assert.deepEqual(labelUploadOf(b, picked), { svg: SVG, own: null });
  assert.equal(labelUploadFor(b, { ...picked, labelBadge: labelUploadOf(b, picked).own }), SVG, 'restoring `own` wears it again');
  assert.equal(labelUploadOf(b, b.placed[2]), null, 'no label assigned');
  assert.equal(labelUploadOf(b, { ...b.placed[0], label: '' }), null, 'no words, no label');
  const bad = withUpload(); bad.labelList.labels[0].badge.svg = '<script>alert(1)</script>';
  assert.equal(labelUploadOf(bad, bad.placed[0]), null, 'never anything that is not an SVG');
  assert.equal(labelUploadOf(null, b.placed[0]), null);
});

test('syncLabelList: takes the planner\'s label list on a layout that changes nothing else, and says whether it moved', () => {
  const cur = withUpload();
  assert.equal(syncLabelList(withUpload(), cur), false, 'same list: nothing to do');
  // the planner replaced the upload (a pick in the docked card): its list no longer holds it, and Restore must not be offered
  const nb = withUpload(); nb.labelList.labels[0].badge = { type: 'icon', value: 'star' };
  assert.equal(syncLabelList(nb, cur), true);
  assert.deepEqual(cur.labelList, nb.labelList);
  assert.notEqual(cur.labelList, nb.labelList, 'a copy, not a shared reference');
  assert.equal(labelUploadOf(cur, cur.placed[0]), null);
  assert.equal(syncLabelList(build(), cur), true, 'a layout without a list clears it');
  assert.equal('labelList' in cur, false);
  assert.equal('labelAssign' in cur, false);
  assert.equal(syncLabelList(build(), cur), false);
  assert.equal(syncLabelList(null, build()), false);
});

test('main.js: Auto always asks for a guess, Restore uploaded icon puts back `own`, and an echo layout still refreshes the list', () => {
  const src = readFileSync(join(root, 'viewer', 'js', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(src, /\$\('label-pick-auto'\)\.onclick = \(\) => commitLabelEdit\(\{ labelBadge: null \}, 'label:badge:auto'\);/);
  assert.ok(!/textContent = autoUp/.test(src), 'Auto is never relabelled as the upload');
  assert.match(src, /if \(up\) commitLabelEdit\(\{ labelBadge: up\.own \}, 'label:badge:upload'\);/);
  assert.match(src, /if \(layoutKey\(nb\) === layoutKey\(build\)\) \{[^}]*syncLabelList\(nb, build\)/);
  const html = readFileSync(join(root, 'viewer', 'index.html'), 'utf8');
  assert.match(html, /<button id="label-pick-upload"[^>]*>Restore uploaded icon<\/button>/);
  assert.match(html, /<button id="label-pick-auto"[^>]*>Auto<\/button>/);
  assert.match(html, /id="label-pick-upnote"[^>]*>This label wears an uploaded icon\. Choosing anything else here replaces it in the planner too\./);
  // touch screens see each icon's name under it, before choosing
  const css = readFileSync(join(root, 'viewer', 'css', 'viewer.css'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(css, /\.le-iname \{ display: none; \}/);
  assert.match(css, /@media \(hover: none\), \(any-pointer: coarse\) \{[^@]*#label-pick-icons \.le-iname \{ display: block;/);
  assert.match(src, /nm\.className = 'le-iname'; nm\.textContent = c\.name;/);
});
