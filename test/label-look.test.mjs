/* label-look.js - which drawer wears a part label or a colour stripe, and what it draws (2026-10-10). Pure: no DOM, no three.
 *
 * The rules are the planner's (label-list.js reconcile with its live sync's editInPlace) and the Label Studio's (its item check,
 * its colour cleaning). When the Label Studio is checked out beside this repo (GEN2_LABELSTUDIO_ROOT, "../ls-next", or a
 * "GEN2 EdgeLabel Label Generator" folder) the tests below also run ITS label-list.js / label-hardware.js on the same inputs,
 * so the two can never disagree about what a drawer wears; without it the fixed cases still pin the behaviour.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanPartItem, stripeColour, cleanStripe, stripePositionOf, assignedLabelOf, wornLabelOf, labelLookOf, labelLooksKey, labelLookNeeds,
  stripeZone, isStripeZone, stripeHexOfKey, STRIPE_POSITIONS } from '../viewer/js/label-look.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const STUDIO = process.env.GEN2_LABELSTUDIO_ROOT
  ? [process.env.GEN2_LABELSTUDIO_ROOT]
  : [join(root, '..', 'ls-next'), join(root, '..', 'GEN2 EdgeLabel Label Generator'), join(root, '..', '..', 'GEN2 EdgeLabel Label Generator')];
const STUDIO_ROOT = STUDIO.find((d) => existsSync(join(d, 'label-hardware.js')) && existsSync(join(d, 'label-list.js')));
const REF = JSON.parse(readFileSync(join(root, 'test', 'golden', 'part-label-ref.json'), 'utf8')).items;
const METRIC = REF[0].item, SAE = REF[1].item;   // M5 x 20 socket cap (metric blue + stainless), 1/4-20 x 3/4" (SAE red + stainless)

const BLUE = { colour: 'sky-blue', hex: '#56B4E9', label: 'Metric' };
const GREEN = { colour: 'green', hex: '#009E73', label: 'Green' };
/* A build of four 1W decor drawers; `labels` the label list, `assign` drawer id -> label id, `mirror` the drawers' words/badges. */
function build(labels, assign, mirror) {
  return {
    mount: 'tabletop', length: 185, buildId: 'k7m2p9q4x1z8',
    placed: [1, 2, 3, 4].map((id) => ({ id, x: id - 1, y: 2, w: 1, hh: 2, fill: 'decor', shelves: 0, ...(mirror[id] || {}) })),
    labelList: { format: 'modulith-labels', version: 1, labels: structuredClone(labels) },   // a copy: tests change it
    labelAssign: { ...assign },
  };
}
const PART = { id: 'lblpart00001', text: 'M5 × 20 SHCS A2', hardware: METRIC };
const SAEL = { id: 'lblsae000001', text: '1/4-20 × 3/4" SHCS A2', hardware: SAE };
const STRIPE = { id: 'lblnoz000001', text: 'Spare nozzles', colours: { band: GREEN } };
const PLAIN = { id: 'lbltorx00001', text: 'Torx Bits' };
const sample = () => build([PART, SAEL, STRIPE, PLAIN], { 1: PART.id, 2: SAEL.id, 3: STRIPE.id, 4: PLAIN.id },
  { 1: { label: PART.text }, 2: { label: SAEL.text }, 3: { label: STRIPE.text }, 4: { label: PLAIN.text } });

test('a drawer wears its assigned label: part labels draw their item (its own stripe), stripes theirs, plain labels nothing new', () => {
  const b = sample();
  const [p, s, n, t] = b.placed.map((u) => labelLookOf(b, u));
  assert.equal(p.kind, 'part');
  assert.equal(p.item.id, METRIC.id);
  assert.equal(p.item.colours.band.hex, '#56B4E9', 'the Part Picker\'s metric blue');
  assert.equal(p.position, 'bottom', 'the Label Studio\'s default position');
  assert.equal(s.kind, 'part');
  assert.equal(s.item.colours.band.hex, '#D55E00', 'the Part Picker\'s SAE red');
  assert.deepEqual(n, { kind: 'stripe', colours: { band: { ...GREEN, pattern: 'solid' } }, position: 'end' },
    "an ordinary label's stripe runs at the END (the Label Studio's rule: the words never reach it); no accent slot: the band covers it");
  assert.equal(t, null, 'a plain label draws exactly what it drew before');
  assert.notStrictEqual(p.item, METRIC, 'the item is a copy (the caller may hand it on)');
});

test('the planner\'s wear rule: a part label only while the drawer keeps its words AND icon; a striped label while it is the only carrier', () => {
  const b = sample();
  const u = (id) => b.placed.find((x) => x.id === id);
  assert.equal(labelLookOf(b, u(1), 'M5 screws'), null, 'a draft of other words: the part label is no longer worn');
  u(1).labelBadge = { type: 'icon', value: 'screw' };
  assert.equal(labelLookOf(b, u(1)), null, 'an icon picked on the drawer makes it a plain label');
  delete u(1).labelBadge;
  assert.equal(labelLookOf(b, u(1)).kind, 'part');
  const edited = labelLookOf(b, u(3), 'Nozzles 0.4');
  assert.equal(edited && edited.kind, 'stripe', 'an edit keeps the stripe of a label this drawer alone carries (edited in place)');
  b.labelAssign[4] = STRIPE.id;   // drawer 4 now carries the same striped label (its words still "Torx Bits": not its mirror)
  assert.equal(labelLookOf(b, u(4)), null, 'a shared label with another drawer\'s words is not this drawer\'s');
  assert.equal(labelLookOf(b, u(3), 'Nozzles 0.4'), null, 'a shared striped label loses its stripe on an edit (the planner makes a new label)');
  assert.equal(labelLookOf(b, u(3)).kind, 'stripe', '...and keeps it while the words are its own');
  assert.equal(labelLookOf(b, { id: 9, label: 'X' }), null, 'no assignment');
  assert.equal(wornLabelOf({ placed: [] }, u(1)), null, 'no label list');
  assert.equal(assignedLabelOf(b, u(2)).id, SAEL.id);
});

test('colours: the label\'s own replace the item\'s, null takes them off; positions; unreadable stripes and items draw nothing new', () => {
  const one = (l, mirror) => { const b = build([l], { 1: l.id }, { 1: mirror || { label: l.text } }); return labelLookOf(b, b.placed[0]); };
  assert.equal(one({ ...PART, colours: { band: GREEN } }).item.colours.band.hex, '#009E73', 'a label-level stripe replaces the item\'s');
  assert.ok(!('colours' in one({ ...PART, colours: null }).item), 'colours: null takes the item\'s stripe off');
  assert.equal(one({ ...PART, bandPosition: 'end' }).position, 'end');
  assert.equal(one({ ...PART, bandPosition: 'off' }).position, null, 'off: the part label is laid out on the whole face');
  for (const pos of [...STRIPE_POSITIONS]) {
    assert.equal(one({ ...PART, bandPosition: pos }).position, pos, 'a part label may name its position');
    assert.equal(one({ ...STRIPE, bandPosition: pos }).position, 'end', "an ordinary label's stripe is always at the end");
  }
  assert.equal(one({ ...PART, bandPosition: 'sideways' }).position, 'bottom', 'an unknown position: the default');
  assert.equal(one({ ...PART, colours: { band: { colour: 'red', hex: 'red' } } }).item.colours.band.hex, '#56B4E9',
    "a part label's own colours with no readable band are ignored: the item keeps its stripe");
  assert.ok(!('band_accent' in one({ ...STRIPE, colours: { band: GREEN, band_accent: { colour: 'x', hex: 'nope' } } }).colours),
    "an unreadable accent is dropped (the band's colour covers it)");
  assert.equal(one({ ...STRIPE, bandPosition: 'off' }), null, 'a stripe switched off is no stripe');
  assert.equal(one({ ...STRIPE, colours: { band: { colour: 'red', hex: 'red' } } }), null, 'an unreadable band colour on a plain label: no stripe');
  assert.equal(one({ ...STRIPE, colours: { band_accent: GREEN } }), null, 'no band colour: no stripe');
  assert.equal(one({ ...STRIPE, colours: [GREEN] }), null);
  const huge = { ...PART, hardware: { ...METRIC, attributes: Array.from({ length: 30 }, (_, i) => ({ path: 'a' + i, text: 'x' })) } };
  assert.equal(one(huge), null, 'an item past the Label Studio\'s bounds is not laid out (its words stand in)');
  assert.equal(one({ ...PART, hardware: { ...METRIC, schema: 'other' } }), null);
  // the badge rule uses the planner's cleaner: an absent badge and an unreadable one are the same mirror
  assert.equal(one({ ...STRIPE, badge: { type: 'icon', value: 'Not An Id' } }).kind, 'stripe');
});

test('labelLooksKey moves with a part item, a stripe or its position only; labelLookNeeds names the files a build needs', () => {
  const k = labelLooksKey(sample());
  assert.equal(labelLooksKey(sample()), k, 'deterministic');
  const moved = sample(); moved.labelList.labels[2].colours.band = BLUE;
  assert.notEqual(labelLooksKey(moved), k);
  const pos = sample(); pos.labelList.labels[0].bandPosition = 'wedge';
  assert.notEqual(labelLooksKey(pos), k);
  const tray = sample(); tray.labelList.labels.push({ id: 'lblspare0001', text: 'Spare', colours: { band: BLUE } });
  assert.equal(labelLooksKey(tray), k, 'a label no drawer wears changes nothing drawn');
  assert.equal(labelLooksKey({ placed: [{ id: 1, label: 'X' }] }), '[]');
  assert.deepEqual(labelLookNeeds(sample()), { layout: true, bands: true });
  const stripeOnly = build([STRIPE], { 3: STRIPE.id }, { 3: { label: STRIPE.text } });
  assert.deepEqual(labelLookNeeds(stripeOnly), { layout: false, bands: true }, 'a stripe alone needs only the band data');
  assert.deepEqual(labelLookNeeds(build([PLAIN], { 4: PLAIN.id }, { 4: { label: PLAIN.text } })), { layout: false, bands: false }, 'plain labels load nothing');
  assert.deepEqual(labelLookNeeds({ placed: [{ id: 1, fill: 'decor', label: 'Torx Bits' }] }), { layout: false, bands: false }, 'no list: nothing');
});

test('the stripe zone carries its colour: the key names it, nothing else reads as one', () => {
  assert.equal(stripeZone('#56B4E9'), 'STRIPE#56b4e9');
  assert.ok(isStripeZone('STRIPE#56b4e9'));
  for (const z of ['', 'TEXT', 'GRIP ACCENT', 'STRIPE#56B4E9', 'STRIPE#56b4e', 'BODY']) assert.ok(!isStripeZone(z), z);
  assert.equal(stripeHexOfKey('Label:STRIPE#d55e00'), '#d55e00');
  assert.equal(stripeHexOfKey('STRIPE#d55e00'), '#d55e00');
  for (const k of ['Label', 'Label:TEXT', 'Faceplate:GRIP ACCENT', 'Label:STRIPE#zz0000', undefined]) assert.equal(stripeHexOfKey(k), null, String(k));
});

/* main.js's activeHex, executed: a stripe key is its own colour whatever the palette says, every other key as before. */
const mainSrc = readFileSync(join(root, 'viewer', 'js', 'main.js'), 'utf8');
function declAt(src, needle) {
  const start = src.indexOf(needle);
  assert.ok(start >= 0, `could not find "${needle}" in main.js`);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--; else if (c === ';' && depth === 0) return src.slice(start, i + 1);
  }
  assert.fail('unterminated ' + needle);
}
test('activeHex / activeLabel (main.js, executed): a stripe wears its own colour, never a filament; other keys are unchanged', () => {
  const make = (name) => new Function('stripeHexOfKey', 'useCustom', 'customColors', 'colorLocked', 'stageTheme', 'DARK_STAGE_PALETTE', 'manifest',
    `${declAt(mainSrc, `const ${name} =`)} return ${name};`);
  const ctx = [stripeHexOfKey, true, { Label: { hex: '#123456', name: 'Some PLA' }, 'Label:STRIPE#56b4e9': { hex: '#000000', name: 'Black' } },
    () => false, 'light', { Case: '#dfe3ec' }, { colors: { Label: '#eef0f4' } }];
  const activeHex = make('activeHex')(...ctx), activeLabel = make('activeLabel')(...ctx);
  assert.equal(activeHex('Label:STRIPE#56b4e9'), '#56b4e9', 'even a palette entry for the key cannot repaint a stripe');
  assert.equal(activeLabel('Label:STRIPE#56b4e9'), null, 'a stripe wears no filament (no filament finish)');
  assert.equal(activeHex('Label'), '#123456', 'the control: the body still follows the palette');
  assert.equal(activeHex('Label:TEXT'), '#123456', 'a zone with no pick still follows its body');
  assert.equal(activeLabel('Label'), 'Some PLA');
});

test('renderZoneChips (main.js) offers no chip for a stripe zone', () => {
  const body = mainSrc.slice(mainSrc.indexOf('function renderZoneChips(inst)'));
  assert.match(body.slice(0, 900), /o\.userData\.zone && !isStripeZone\(o\.userData\.zone\)/);
});

/* ---- the Label Studio's own code on the same inputs (when it is checked out) ---- */
test('cleanPartItem and stripeColour agree with the Label Studio\'s label-list.js cleanHardware and label-hardware.js colour()', (t) => {
  if (!STUDIO_ROOT) { t.skip('Label Studio checkout not present'); return; }
  const require = createRequire(import.meta.url);
  const LL = require(join(STUDIO_ROOT, 'label-list.js'));
  delete globalThis.GEN2LabelHardware;
  (0, eval)(readFileSync(join(STUDIO_ROOT, 'label-hardware.js'), 'utf8'));
  const LH = globalThis.GEN2LabelHardware.create({});
  const items = [...REF.map((r) => r.item), null, 'x', { ...METRIC, schema: 'nope' }, { ...METRIC, id: '' }, { ...METRIC, id: 'x'.repeat(65) },
    { ...METRIC, fields: ['x'.repeat(61)] }, { ...METRIC, fields: Array(7).fill('M5') }, { ...METRIC, attributes: 'no' },
    { ...METRIC, pinned: ['not.an.attribute'] }, { ...METRIC, optional: Array(9).fill('head') }, { ...METRIC, extra: 'k'.repeat(9000) },
    { ...METRIC, attributes: [{ path: 'head', text: 5 }] }];
  for (const it of items) assert.deepEqual(cleanPartItem(it), LL.cleanHardware(it), JSON.stringify(it).slice(0, 80));
  const cols = [BLUE, GREEN, null, undefined, 'red', {}, { colour: 'red', hex: '#D55E00', pattern: 'dashed' }, { colour: 'Red Bold', hex: '#D55E00' },
    { colour: 'red', hex: '#D55E0' }, { colour: 'red', hex: '#D55E00', label: 'x'.repeat(50) }, { colour: 'red', hex: '#D55E00', label: 7 }];
  for (const c of cols) assert.deepEqual(stripeColour(c), LH.colour(c), JSON.stringify(c));
});

test('the wear rule agrees with the planner\'s live reconcile (label-list.js, editInPlace): worn exactly when the drawer keeps its label', (t) => {
  if (!STUDIO_ROOT) { t.skip('Label Studio checkout not present'); return; }
  const LL = createRequire(import.meta.url)(join(STUDIO_ROOT, 'label-list.js'));
  const cases = [
    ['part label, own words', [PART], { 1: PART.id }, { 1: { label: PART.text } }],
    ['part label, other words', [PART], { 1: PART.id }, { 1: { label: 'M5 screws' } }],
    ['part label, an icon picked', [PART], { 1: PART.id }, { 1: { label: PART.text, labelBadge: { type: 'icon', value: 'screw' } } }],
    ['striped, own words', [STRIPE], { 1: STRIPE.id }, { 1: { label: STRIPE.text } }],
    ['striped, edited, sole carrier', [STRIPE], { 1: STRIPE.id }, { 1: { label: 'Nozzles' } }],
    ['striped, edited, shared', [STRIPE], { 1: STRIPE.id, 2: STRIPE.id }, { 1: { label: 'Nozzles' }, 2: { label: STRIPE.text } }],
    ['striped, letter picked', [STRIPE], { 1: STRIPE.id }, { 1: { label: STRIPE.text, labelBadge: { type: 'char', value: 'N' } } }],
  ];
  for (const [name, labels, assign, mirror] of cases) {
    const b = build(labels, assign, mirror);
    const r = LL.reconcile(b.placed, b.labelList, b.labelAssign, { editInPlace: true });
    const kept = r.assignments['1'] === assign[1];
    assert.equal(!!wornLabelOf(b, b.placed[0]), kept, `${name}: the planner ${kept ? 'keeps' : 'replaces'} the drawer's label`);
  }
});

test('stripePositionOf: a part label bottom unless it names one, an ordinary label always the end, off = none', () => {
  assert.equal(stripePositionOf({}), 'bottom');
  assert.equal(stripePositionOf(null), 'bottom');
  assert.equal(stripePositionOf({ bandPosition: 'wedge' }), 'wedge');
  assert.equal(stripePositionOf({ bandPosition: 'off' }), null);
  assert.equal(stripePositionOf({}, 'ordinary'), 'end');
  assert.equal(stripePositionOf({ bandPosition: 'bottom' }, 'ordinary'), 'end');
  assert.equal(stripePositionOf({ bandPosition: 'off' }, 'ordinary'), null);
});

/* The Label Studio's own stripe rules (its label-stripes.js, being written beside this on 2026-10-10 - skipped until it is there):
   the same cleaning, and with its default setting ('bottom') the same position for a part label and an ordinary one. */
test("cleanStripe and the default positions agree with the Label Studio's label-stripes.js (when it is there)", (t) => {
  const dir = STUDIO.find((d) => existsSync(join(d, 'label-stripes.js')));
  if (!dir) { t.skip("the Label Studio's label-stripes.js is not present"); return; }
  delete globalThis.GEN2LabelStripes;
  (0, eval)(readFileSync(join(dir, 'label-stripes.js'), 'utf8'));
  const S = globalThis.GEN2LabelStripes;
  const cases = [null, undefined, 'red', [], {}, { band: BLUE }, { band: GREEN, band_accent: BLUE }, { band: GREEN, band_accent: { colour: 'x', hex: 'no' } },
    { band: { colour: 'red', hex: 'red' } }, { band_accent: GREEN }, { band: { ...BLUE, pattern: 'dashed', label: 'x'.repeat(60) } }, ...S.COLOURS.map((c) => S.stripe(c.colour))];
  for (const c of cases) {
    assert.deepEqual(cleanStripe(c, true), S.clean(c, { allowNone: true }), JSON.stringify(c));
    assert.deepEqual(cleanStripe(c), S.clean(c), JSON.stringify(c));
  }
  assert.equal(stripePositionOf({}, 'part'), S.positionFor('part', 'bottom'));
  assert.equal(stripePositionOf({}, 'ordinary'), S.positionFor('ordinary', 'bottom'));
});
