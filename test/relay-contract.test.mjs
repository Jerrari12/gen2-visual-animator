/* PLANNER <-> VIEWER RELAY CONTRACT - the VIEWER's half.
 *
 * The two tools exchange build state over two postMessage channels, and each
 * channel has a half in each repo that must agree about SHAPE. Nothing else
 * checks that: `requirement-parity` compares what the two tools CONCLUDE and
 * never sends a message, so a field can be added to one half and missed in the
 * other while both suites stay green.
 *
 * That is why this exists. The shelf `lip` began as a boolean and became a
 * three-state string ("front" | "both", absence = none). Three serialization
 * paths were never updated, and because each half fails CLOSED the feature
 * silently did nothing:
 *   1. the planner's outgoing `lips` sent `u.lip === true` - ALWAYS false for a
 *      string field, so every shelf relayed "off";
 *   2. the planner's incoming handler demanded `typeof === "boolean"`, dropping
 *      every mode the viewer sent;
 *   3. the viewer's `layoutKey` omitted `lip`, so the layout channel - which DID
 *      carry the change - was misread as an echo and dropped.
 * Any ONE was enough. (1) and (2) are the planner's half and are pinned by its
 * own `test/relay-contract.test.mjs`; (3) is pinned here.
 *
 * ⚠⚠ THESE TESTS EXECUTE THE REAL FUNCTIONS. An earlier version of this file
 * asserted on SOURCE TEXT (regex) instead, and it was worthless: it passed
 * against a guard inverted to accept nothing, and against the outgoing loop
 * rewritten to fire for cabinets instead of shelves - two mutations that each
 * break the feature completely. Matching text proves nothing about behaviour.
 * If you extend this file, extend it by CALLING something.
 *
 * The two functions live in main.js, which cannot be imported under node (it
 * builds a WebGL renderer at module scope). Both are self-contained - one pure
 * arrow, one function reading only `build` - so they are extracted by balanced
 * scan and evaluated in isolation. The extraction is itself guarded: every test
 * asserts a CONTROL that must hold, so a regex that silently matched the wrong
 * thing fails loudly instead of vacuously passing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const viewerSrc = readFileSync(join(root, 'viewer', 'js', 'main.js'), 'utf8');

/* Take the whole declaration starting at `needle`, ending at the `;` that
   closes it - tracking (), [] and {} so a nested literal cannot end it early. */
function declAt(src, needle) {
  const start = src.indexOf(needle);
  assert.ok(start >= 0, `could not find "${needle}" in main.js - if it was renamed, update this test rather than deleting it`);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ';' && depth === 0) return src.slice(start, i + 1);
  }
  assert.fail(`unterminated declaration for "${needle}"`);
}

const LIP_MODES = (() => {
  const m = viewerSrc.match(/const LIP_MODES = new Set\(\[([^\]]*)\]\)/);
  assert.ok(m, 'LIP_MODES not found in main.js');
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
})();

// the real layoutKey, executable
const layoutKey = new Function(`${declAt(viewerSrc, 'const layoutKey =')} return layoutKey;`)();
// the real currentOpts - it reads the module-level `build`, and the build plate through the
// resolver main.js imports, which is handed in here as the same real function
const { plateFinishOf, PLATE_FINISHES } = await import(new URL('../viewer/js/bed-finish.js', import.meta.url).href);
// the label half of the post (label plan step 2) lives in label-panel.js, which node imports directly; main.js's
// currentOpts calls it by name, so the extracted function is handed the same real export
const { labelOptsOf, labelOptsChanges, applyLabelOpts, labelOnlyDiff, copyLabelFields } = await import(new URL('../viewer/js/label-panel.js', import.meta.url).href);
const currentOptsWith = new Function('build', 'plateFinishOf', 'labelOptsOf', `${declAt(viewerSrc, 'function currentOpts()')} return currentOpts();`);
const currentOpts = (b) => currentOptsWith(b, plateFinishOf, labelOptsOf);

const buildWith = (lip) => ({
  mount: 'tabletop', length: 185, gridW: 4, gridH: 4,
  placed: [{ id: 1, x: 0, y: 0, w: 1, hh: 4, fill: 'shelf', shelves: 0, ...(lip ? { lip } : {}) }],
});

test('LIP_MODES is exactly the three modes', () => {
  assert.deepEqual([...LIP_MODES].sort(), ['both', 'front', 'none']);
});

test('layoutKey DISTINGUISHES a lip-only change (the echo guard that dropped it)', () => {
  const none = layoutKey(buildWith(null));
  const front = layoutKey(buildWith('front'));
  const both = layoutKey(buildWith('both'));

  // the control: the extraction really is a working fingerprint
  assert.equal(layoutKey(buildWith('front')), front, 'layoutKey is not deterministic - extraction is wrong');
  const wider = buildWith('front'); wider.placed[0].w = 2;
  assert.notEqual(layoutKey(wider), front, 'layoutKey ignores WIDTH - extraction matched the wrong thing');

  /* The bug: `lip` was absent from the key, so an incoming layout carrying a
     lip change hashed identical to the current build and applyRemoteLayout
     returned early as a no-op. All three states must be distinguishable. */
  assert.equal(new Set([none, front, both]).size, 3,
    'layoutKey collapses lip states - a lip-only layout will be dropped as an echo');
});

test('currentOpts relays a lip MODE per shelf, distinct per state', () => {
  const sent = ['none', 'front', 'both'].map((m) => {
    const o = currentOpts(buildWith(m === 'none' ? null : m));
    return o.lips[1];
  });

  for (const v of sent)
    assert.ok(LIP_MODES.includes(v), `the viewer relays ${JSON.stringify(v)}, which the receiver's whitelist drops`);
  /* `u.lip === true` - the planner's original bug - yields false for all three
     states, so the receiver cannot tell them apart and the toggle is inert. */
  assert.equal(new Set(sent).size, 3,
    `the viewer collapses the lip states to ${JSON.stringify(sent)}`);
});

test('currentOpts keys lips by SHELF, and gives non-shelves no key at all', () => {
  const b = buildWith('front');
  b.placed.push({ id: 2, x: 1, y: 0, w: 1, hh: 4, fill: 'decor', shelves: 0, closure: 'magnet' });
  b.placed.push({ id: 3, x: 2, y: 0, w: 1, hh: 4, fill: 'cabinet', shelves: 0 });
  const o = currentOpts(b);

  assert.equal(o.lips[1], 'front');
  /* A MISSING key means "not a shelf"; a present one means "a shelf, in this
     mode". Collapsing those breaks the receiver's ability to tell them apart -
     and firing the loop for the wrong fill is a mutation the old text-matching
     version of this test could not see. */
  assert.ok(!(2 in o.lips), 'a drawer got a lips entry');
  assert.ok(!(3 in o.lips), 'a cabinet got a lips entry - the loop is keyed on the wrong fill');
  assert.equal(o.closures[2], 'magnet', 'closures regressed');
  assert.ok(!(1 in o.closures), 'a shelf got a closures entry');
});

test('currentOpts relays the build plate RESOLVED, and as the last key', () => {
  /* The planner's echo guard compares the viewer's JSON with its own, so the key has to be there
     on every post and in the same place; a build that never stored a plate must still send what it
     SHOWS (the default, Powder), or the planner cannot tell "never chose" from "chose Powder" and would re-post. */
  const legacy = currentOpts(buildWith('front'));
  assert.equal(legacy.buildPlate, 'powder', 'a build with no stored plate relays something other than what it shows');
  assert.equal(Object.keys(legacy).at(-1), 'buildPlate', 'buildPlate is not the last key of the post');
  const sent = PLATE_FINISHES.map((f) => currentOpts({ ...buildWith('front'), buildPlate: f }).buildPlate);
  assert.deepEqual(sent, [...PLATE_FINISHES], 'a stored plate is not relayed as itself');
  assert.equal(currentOpts({ ...buildWith('front'), buildPlate: 'carbon' }).buildPlate, 'powder',
    'an unknown stored value is relayed raw - the receiver would have to guess');
  /* the control: lips still ride unchanged beside it */
  assert.equal(legacy.lips[1], 'front');
});

/* ---- the Gridfinity drawer body (`variant`, 2026-09-18) ----
   A per-unit field like `lip`, so it rides both channels and needs the same four
   places: layoutKey, currentOpts, the incoming handler, and the planner's half.
   Absence of `variant` is the standard drawer; the only value written is 'gridfinity'. */
const VARIANT_MODES = (() => {
  const m = viewerSrc.match(/const VARIANT_MODES = new Set\(\[([^\]]*)\]\)/);
  assert.ok(m, 'VARIANT_MODES not found in main.js');
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
})();
const drawerBuild = (variant, fill = 'decor') => ({
  mount: 'tabletop', length: 185, gridW: 4, gridH: 4,
  placed: [{ id: 1, x: 0, y: 2, w: 2, hh: 2, fill, shelves: 0, ...(variant ? { variant } : {}) }],
});

test('VARIANT_MODES is exactly standard and gridfinity', () => {
  assert.deepEqual([...VARIANT_MODES].sort(), ['gridfinity', 'standard']);
});

test('layoutKey DISTINGUISHES a drawer-body-only change', () => {
  const std = layoutKey(drawerBuild(null)), grid = layoutKey(drawerBuild('gridfinity'));
  assert.equal(layoutKey(drawerBuild('gridfinity')), grid, 'layoutKey is not deterministic - extraction is wrong');
  assert.notEqual(std, grid, 'layoutKey ignores `variant` - a planner layout that only switches a drawer body is dropped as an echo');
});

/* Drawer labels (2026-10-02): a unit's `labelBadge` and the build's `labelStyle` change what every label in this page
   looks like, so a planner layout carrying ONLY one of them must not be read as an echo - the lip bug, in a new field. */
const labelBuild = (badge, style) => ({
  mount: 'tabletop', length: 185, gridW: 4, gridH: 4,
  placed: [{ id: 1, x: 0, y: 2, w: 1, hh: 2, fill: 'decor', shelves: 0, label: 'Torx Bits', ...(badge ? { labelBadge: badge } : {}) }],
  ...(style ? { labelStyle: style } : {}),
});

test('layoutKey DISTINGUISHES a label-badge-only change', () => {
  const auto = layoutKey(labelBuild(null));
  const torx = layoutKey(labelBuild({ type: 'icon', value: 'screw-torx-head' }));
  const none = layoutKey(labelBuild({ type: 'none' }));
  assert.equal(layoutKey(labelBuild({ type: 'icon', value: 'screw-torx-head' })), torx, 'layoutKey is not deterministic');
  assert.equal(new Set([auto, torx, none]).size, 3,
    'layoutKey collapses badge states - an icon picked in the planner would be dropped here as an echo');
});

test('layoutKey DISTINGUISHES a label-style-only change', () => {
  const defaults = layoutKey(labelBuild(null));
  const bigger = layoutKey(labelBuild(null, { capMm: 6 }));
  const lower = layoutKey(labelBuild(null, { allCaps: false }));
  assert.equal(new Set([defaults, bigger, lower]).size, 3,
    'layoutKey ignores labelStyle - a style change made in the planner would never reach the 3D labels');
});

test('currentOpts relays a body per DECOR drawer, right after lips', () => {
  assert.equal(currentOpts(drawerBuild(null)).variants[1], 'standard', 'absence must relay as standard');
  assert.equal(currentOpts(drawerBuild('gridfinity')).variants[1], 'gridfinity');
  assert.equal(currentOpts(drawerBuild('bogus')).variants[1], 'standard', 'an unknown stored value is relayed raw');
  for (const fill of ['classic', 'shelf', 'cabinet'])
    assert.ok(!(1 in currentOpts(drawerBuild('gridfinity', fill)).variants), `a ${fill} unit got a variants entry`);
  // the planner's echo guard compares JSON strings, so the key sits where the planner puts it
  const keys = Object.keys(currentOpts(drawerBuild(null)));
  assert.equal(keys[keys.indexOf('lips') + 1], 'variants', `variants is not right after lips: ${keys.join(', ')}`);
});

/* The viewer's INCOMING buildOptions half, executed: everything from the channel check to
   the end of the apply block, run with stubs for the two module lets it touches. */
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const applyOpts = (() => {
  const a = viewerSrc.indexOf("if (d.gen2 !== 'buildOptions'");
  const endMark = '} finally { applyingRemote = false; }';
  const b = viewerSrc.indexOf(endMark, a);
  assert.ok(a >= 0 && b > a, 'the incoming buildOptions block was not found in main.js');
  // `regenBusy` and the retry plumbing (dispatchEvent / setTimeout / clearTimeout / MessageEvent) are handed in, so the
  // mid-regenerate branch can be driven too: `busy` runs the block with regenBusy true and records what it re-dispatches
  const fn = new AsyncFunction('d', 'build', 'regenerate', 'LIP_MODES', 'VARIANT_MODES', 'PLATE_FINISHES', 'plateFinishOf',
    'labelOptsChanges', 'applyLabelOpts', 'refreshLabelTexts', 'renderLabelEditorState', 'renderOptions', 'noteBuildMismatch',
    'regenBusy', 'dispatchEvent', 'setTimeout', 'clearTimeout', 'MessageEvent',
    `let applyingRemote = false; let optsRetryTimer = 0; ${viewerSrc.slice(a, b + endMark.length)}`);
  const run = async (b0, opts, busy = false) => {
    const n = { regens: 0, refreshes: 0, mismatches: 0, retried: [] };
    // the ORDER the card and the meshes were told in (non-enumerable, so the deepEqual counts above are unchanged)
    const order = []; Object.defineProperty(n, 'order', { value: order, enumerable: false });
    await fn({ gen2: 'buildOptions', opts }, b0, async () => { n.regens++; }, new Set(LIP_MODES), new Set(VARIANT_MODES),
      PLATE_FINISHES, plateFinishOf, labelOptsChanges, applyLabelOpts, () => { n.refreshes++; order.push('refresh'); },
      (o) => { order.push({ remote: (o && o.remote) || [] }); }, () => {}, () => { n.mismatches++; },
      busy, (ev) => { n.retried.push(ev.data); }, (f) => { f(); return 1; }, () => {}, globalThis.MessageEvent);
    if (!busy) delete n.retried;
    return n;
  };
  const regensOnly = async (b0, opts) => (await run(b0, opts)).regens;
  regensOnly.full = run;
  regensOnly.busy = (b0, opts) => run(b0, opts, true);
  return regensOnly;
})();

test('incoming: the planner\'s resolved "none" closure is stored as ABSENCE (its own rule), so its next layout still reads as an echo', async () => {
  /* The planner deletes `closure` for "none" and its layouts never carry it; the viewer used to store the resolved "none"
     from an options post, so layoutKey read 'none' against the planner's '' for ever after - the next layout was never an
     echo, never label-only, and ONE planner keystroke regenerated the build and closed the card (e2e, 2026-10-03). */
  const b = labelledBuild();
  const n = await applyOpts.full(b, { buildId: ID, closures: { 1: 'none', 2: 'none', 3: 'none', 4: 'none' }, labels: { 3: 'Bolts' } });
  assert.deepEqual(n, { regens: 0, refreshes: 1, mismatches: 0 }, 'resolved "none" closures beside a label change must still be label-only');
  for (const u of b.placed) assert.ok(!('closure' in u), `unit ${u.id} stored closure "none"`);
  const nb = labelledBuild(); nb.placed[2].label = 'Bolts';
  assert.equal(layoutKey(b), layoutKey(nb), 'after the apply the planner\'s bounce of the same build would not read as an echo');
  await applyOpts(b, { buildId: ID, closures: { 1: 'magnet' } }); assert.equal(b.placed[0].closure, 'magnet', 'a real closure still lands');
  await applyOpts(b, { buildId: ID, closures: { 1: 'none' } }); assert.ok(!('closure' in b.placed[0]), 'and leaves again as absence');
});

test('incoming: a buildOptions message arriving MID-REGENERATE is retried, never dropped (newest wins)', async () => {
  /* Until 2026-10-03 the handler returned while regenBusy. A planner change to a build-level option (handle style, back
     cover, plate...) made in that window was lost for good: the layout that follows does not carry those fields in
     layoutKey, so it was dropped as an echo, and the planner's lastSentOpts kept it from re-posting (Sol 01a0fffd, 1). */
  const b = labelledBuild();
  const n = await applyOpts.busy(b, { buildId: ID, handleStyle: 'crystal', labels: { 3: 'Bolts' } });
  assert.deepEqual({ regens: n.regens, refreshes: n.refreshes, mismatches: n.mismatches }, { regens: 0, refreshes: 0, mismatches: 0 }, 'nothing may apply mid-regenerate');
  assert.ok(!('label' in b.placed[2]) && !('handleStyle' in b), 'the message was applied while regenerating');
  assert.equal(n.retried.length, 1, 'the message was not re-dispatched for after the regenerate');
  assert.equal(n.retried[0].gen2, 'buildOptions'); assert.equal(n.retried[0].opts.handleStyle, 'crystal'); assert.equal(n.retried[0].opts.labels[3], 'Bolts');
  // the control: the same message, not busy, applies (a handle style regenerates; the label rides along)
  const c = labelledBuild({ handleStyle: 'deco' });
  const m = await applyOpts.full(c, { buildId: ID, handleStyle: 'crystal', labels: { 3: 'Bolts' } });
  assert.equal(m.regens, 1); assert.equal(c.handleStyle, 'crystal'); assert.equal(c.placed[2].label, 'Bolts');
});

test('an incoming body switch is applied, and absence is written for standard', async () => {
  // the control: the extracted block really is the handler (a closure change applies)
  const c = drawerBuild(null);
  assert.equal(await applyOpts(c, { closures: { 1: 'magnet' } }), 1, 'extraction is wrong: a closure change did not apply');
  assert.equal(c.placed[0].closure, 'magnet');

  const b = drawerBuild(null);
  assert.equal(await applyOpts(b, { variants: { 1: 'gridfinity' } }), 1);
  assert.equal(b.placed[0].variant, 'gridfinity');
  assert.equal(await applyOpts(b, { variants: { 1: 'gridfinity' } }), 0, 'an echo regenerated');
  assert.equal(await applyOpts(b, { variants: { 1: 'standard' } }), 1);
  assert.ok(!('variant' in b.placed[0]), 'standard must be written as ABSENCE, never variant: "standard"');
});

test('an incoming body switch drops hostile values and non-decor units', async () => {
  for (const v of [true, '', 'Gridfinity', 'classic', {}, 1]) {
    const b = drawerBuild('gridfinity');
    assert.equal(await applyOpts(b, { variants: { 1: v } }), 0, `${JSON.stringify(v)} was taken as a change`);
    assert.equal(b.placed[0].variant, 'gridfinity', `${JSON.stringify(v)} overwrote the stored body`);
  }
  for (const fill of ['classic', 'shelf']) {
    const b = drawerBuild(null, fill);
    assert.equal(await applyOpts(b, { variants: { 1: 'gridfinity' } }), 0, `a ${fill} unit took a drawer body`);
    assert.ok(!('variant' in b.placed[0]));
  }
});

/* ---- cross-repo tripwire: needs the planner checkout, skips without it ----
   ⚠ This DOES skip in the viewer's CI, which checks out only this repo - so it
   is a local-dev tripwire, NOT the protection. The protection is the executable
   half above (always runs here) plus the planner's own relay-contract test
   (always runs there). Do not let this test be the only thing guarding a
   channel. */
const PLANNER = process.env.GEN2_PLANNER_ROOT || join(root, '..', 'GEN2 Planner', 'gen2-planner-main');
const havePlanner = existsSync(join(PLANNER, 'js', 'app.js'));

test('layoutKey and the planner\'s layoutSig carry the same per-unit fields', { skip: !havePlanner && 'planner checkout not present' }, () => {
  const plannerSrc = readFileSync(join(PLANNER, 'js', 'app.js'), 'utf8');
  const fields = (src, re, what) => {
    const m = src.match(re);
    assert.ok(m, `could not locate ${what}`);
    return m[1].split(',').map((p) => (p.match(/u\.([A-Za-z_$][\w$]*)/) || [])[1]).filter(Boolean);
  };
  const viewer = fields(viewerSrc, /const layoutKey = b => JSON\.stringify\(\[b\.mount, \+b\.length, \(b\.placed \|\| \[\]\)\.map\(u =>\s*\[([^\]]*)\]/, "the viewer's layoutKey");
  const planner = fields(plannerSrc, /p:\s*state\.placed\.map\(\(u\)\s*=>\s*\[([^\]]*)\]/, "the planner's layoutSig");

  /* layoutSig decides whether a layout is POSTED, layoutKey whether it is
     APPLIED. A field in one but not the other is a silently half-broken
     channel - which is exactly how `lip` shipped. */
  assert.deepEqual([...viewer].sort(), [...planner].sort(),
    'a per-unit field is missing from one side of the layout channel');
  assert.ok(viewer.includes('lip') && viewer.length >= 10, 'extracted field list looks wrong - check the regexes');
});

/* ---- drawer labels on the relay (label plan step 2, 2026-10-02) ----
   Three new keys ride buildOptions in BOTH directions - `labels` (every decor unit, "" = none), `labelBadges` (the
   labelled units, null = absent = the generator predicts) and `labelStyle` (cleaned, or null) - plus `buildId` FIRST, the
   build both ends believe they are editing. A message naming another build is dropped WHOLE. A message whose only
   differences are label fields refreshes the label meshes in place and never regenerates (regenerate() deselects, which
   would close the card under the user). The planner's echo guard compares JSON strings, so key ORDER is part of the
   contract: buildId first, the three label keys right after variants, buildPlate still last. */
const ID = 'k7m2p9q4x1z8';
const labelledBuild = (extra = {}) => ({
  mount: 'tabletop', length: 185, gridW: 4, gridH: 4, buildId: ID,
  placed: [
    { id: 1, x: 0, y: 2, w: 1, hh: 2, fill: 'decor', shelves: 0, label: 'Torx Bits' },
    { id: 2, x: 1, y: 2, w: 1, hh: 2, fill: 'decor', shelves: 0, label: 'Nuts', labelBadge: { type: 'icon', value: 'nut' } },
    { id: 3, x: 2, y: 2, w: 1, hh: 2, fill: 'decor', shelves: 0 },
    { id: 4, x: 3, y: 2, w: 1, hh: 2, fill: 'classic', shelves: 0, label: 'Washers' },
    { id: 5, x: 0, y: 0, w: 1, hh: 4, fill: 'shelf', shelves: 0 },
  ],
  ...extra,
});

test('currentOpts: buildId FIRST, the three label keys right after variants, buildPlate still LAST', () => {
  const o = currentOpts(labelledBuild());
  const keys = Object.keys(o);
  assert.equal(keys[0], 'buildId', `buildId is not the first key: ${keys.join(', ')}`);
  assert.equal(o.buildId, ID);
  assert.deepEqual(keys.slice(keys.indexOf('variants'), keys.indexOf('variants') + 4), ['variants', 'labels', 'labelBadges', 'labelStyle'],
    `the label keys are not right after variants: ${keys.join(', ')}`);
  assert.equal(keys.at(-1), 'buildPlate', 'buildPlate is no longer the last key');
  // a build with no id, or a malformed one, sends NO key (the planner reads absence as legacy and accepts)
  assert.ok(!('buildId' in currentOpts(labelledBuild({ buildId: undefined }))), 'a build with no id relayed a buildId key');
  assert.ok(!('buildId' in currentOpts(labelledBuild({ buildId: '../../x' }))), 'a malformed id was relayed');
  assert.equal(Object.keys(currentOpts(labelledBuild({ buildId: undefined })))[0], 'closures');
});

test('currentOpts: labels for every DECOR unit, badges only for the labelled ones, nothing for classic or shelf units', () => {
  const o = currentOpts(labelledBuild());
  assert.deepEqual(o.labels, { 1: 'Torx Bits', 2: 'Nuts', 3: '' }, 'labels must name every decor unit, "" for none');
  assert.ok(!(4 in o.labels), 'a classic unit got a labels entry - its name is the planner\'s, the viewer shows no faceplate label for it');
  assert.ok(!(5 in o.labels), 'a shelf got a labels entry');
  assert.deepEqual(o.labelBadges, { 1: null, 2: { type: 'icon', value: 'nut' } }, 'labelBadges: labelled units only, null = absent');
  assert.ok(!(3 in o.labelBadges), 'an unlabelled unit got a labelBadges entry');
  assert.equal(o.labelStyle, null, 'a build with no style relays null');
  assert.deepEqual(currentOpts(labelledBuild({ labelStyle: { capMm: 4, bold: true, colorText: '#f00' } })).labelStyle, { capMm: 4, bold: true },
    'labelStyle must go out CLEANED');
});

test('currentOpts CLEANS what it relays: a hash-made 60-character label goes out at 40, trimmed; a bad badge as null', () => {
  const b = labelledBuild();
  b.placed[0].label = '   ' + 'x'.repeat(60);
  b.placed[1].labelBadge = { type: 'svg', value: '<svg/>' };
  const o = currentOpts(b);
  assert.equal(o.labels[1], 'x'.repeat(40), 'the label was relayed raw - the planner stores 40 and the two ends would disagree for ever');
  assert.equal(o.labelBadges[2], null, 'a badge the planner would drop was relayed as if stored');
});

test('layoutKey DISTINGUISHES a buildId-only change (how an official-kit viewer learns the id the planner minted)', () => {
  const a = layoutKey(labelledBuild()), b = layoutKey(labelledBuild({ buildId: 'zzzzzzzzzzzz' })), c = layoutKey(labelledBuild({ buildId: undefined }));
  assert.equal(layoutKey(labelledBuild()), a, 'layoutKey is not deterministic');
  assert.equal(new Set([a, b, c]).size, 3, 'layoutKey ignores buildId - a layout differing only in the id is dropped as an echo');
});

test('labelOnlyDiff, against the REAL layoutKey: label words / badge / style / buildId alone are label-only, anything else is not', () => {
  const cur = labelledBuild();
  const only = (mut) => { const nb = labelledBuild(); mut(nb); return labelOnlyDiff(nb, cur, layoutKey); };
  assert.equal(labelOnlyDiff(labelledBuild(), cur, layoutKey), false, 'an identical layout is not a diff at all');
  assert.equal(only((nb) => { nb.placed[2].label = 'Bolts'; }), true, 'a words-only change');
  assert.equal(only((nb) => { delete nb.placed[1].labelBadge; }), true, 'a badge-only change');
  assert.equal(only((nb) => { nb.labelStyle = { allCaps: false }; }), true, 'a style-only change');
  assert.equal(only((nb) => { nb.buildId = 'zzzzzzzzzzzz'; }), true, 'a buildId-only change (the one-off that hands a kit its id) must not regenerate');
  assert.equal(only((nb) => { nb.placed[0].w = 2; }), false, 'a width change took the cheap path');
  assert.equal(only((nb) => { nb.placed[0].label = 'Bolts'; nb.placed[1].closure = 'magnet'; }), false, 'a label + a closure took the cheap path');
  assert.equal(only((nb) => { nb.placed.pop(); }), false, 'a removed unit took the cheap path');
  // and the copy leaves the two keys EQUAL, so the planner's bounce of the same layout is then dropped as an echo
  const nb = labelledBuild({ buildId: 'zzzzzzzzzzzz', labelStyle: { capMm: 4 } }); nb.placed[2].label = 'Bolts'; nb.placed[0].labelBadge = { type: 'none' };
  const b2 = labelledBuild();
  assert.deepEqual(copyLabelFields(nb, b2), [3], 'copyLabelFields must name exactly the units whose WORDS changed');
  assert.equal(layoutKey(b2), layoutKey(nb), 'after copyLabelFields the keys still differ - the next echo would not be dropped');
});

test('incoming: a buildId that names ANOTHER build drops the message WHOLE (a closure in the same message is not applied)', async () => {
  const b = labelledBuild();
  const n = await applyOpts.full(b, { buildId: 'zzzzzzzzzzzz', closures: { 1: 'magnet' }, labels: { 1: 'HACK' } });
  assert.deepEqual(n, { regens: 0, refreshes: 0, mismatches: 1 });
  assert.ok(!('closure' in b.placed[0]), 'the mismatched message\'s closure was applied');
  assert.equal(b.placed[0].label, 'Torx Bits', 'the mismatched message\'s label was applied');
  // the control: the same message with the RIGHT id applies both
  const c = labelledBuild();
  const m = await applyOpts.full(c, { buildId: ID, closures: { 1: 'magnet' }, labels: { 1: 'HACK' } });
  assert.deepEqual(m, { regens: 1, refreshes: 0, mismatches: 0 }, 'a closure change still regenerates (and the mount re-attaches the labels)');
  assert.equal(c.placed[0].closure, 'magnet'); assert.equal(c.placed[0].label, 'HACK');
  // no id on either side = legacy = accepted
  const d = labelledBuild({ buildId: undefined });
  assert.equal((await applyOpts.full(d, { buildId: ID, labels: { 1: 'Bolts' } })).mismatches, 0, 'a viewer with no id refused the planner');
  assert.equal(d.placed[0].label, 'Bolts');
  const e = labelledBuild();
  assert.equal((await applyOpts.full(e, { labels: { 1: 'Bolts' } })).mismatches, 0, 'a message with no id was refused');
});

test('incoming: a label-only message refreshes the labels in place and NEVER regenerates; an echo does nothing', async () => {
  const b = labelledBuild();
  assert.deepEqual(await applyOpts.full(b, { buildId: ID, labels: { 1: 'Torx Bits', 2: 'Nuts', 3: 'Bolts' } }), { regens: 0, refreshes: 1, mismatches: 0 });
  assert.equal(b.placed[2].label, 'Bolts');
  assert.deepEqual(await applyOpts.full(b, { buildId: ID, labels: { 1: 'Torx Bits', 2: 'Nuts', 3: 'Bolts' } }), { regens: 0, refreshes: 0, mismatches: 0 }, 'an echo was taken as a change');
  assert.deepEqual(await applyOpts.full(b, { buildId: ID, labelBadges: { 1: { type: 'char', value: 'T' } } }), { regens: 0, refreshes: 1, mismatches: 0 });
  assert.deepEqual(b.placed[0].labelBadge, { type: 'char', value: 'T' });
  assert.deepEqual(await applyOpts.full(b, { buildId: ID, labelStyle: { capMm: 4, bold: true } }), { regens: 0, refreshes: 1, mismatches: 0 });
  assert.deepEqual(b.labelStyle, { capMm: 4, bold: true });
  // a classic unit's name is not the viewer's to change
  assert.deepEqual(await applyOpts.full(b, { buildId: ID, labels: { 4: 'Shims' } }), { regens: 0, refreshes: 0, mismatches: 0 });
  assert.equal(b.placed[3].label, 'Washers');
});

test('incoming: clearing the words deletes the badge; a hostile badge leaves the stored one alone; a badge needs words', async () => {
  const b = labelledBuild();
  await applyOpts(b, { buildId: ID, labels: { 2: '' } });
  assert.ok(!('label' in b.placed[1]) && !('labelBadge' in b.placed[1]), 'the badge survived its words being cleared (it would reappear on the next name)');
  const c = labelledBuild();
  for (const bad of [{ type: 'svg', value: '<svg/>' }, { type: 'icon', value: 'Not An Id!' }, { type: 'char', value: 'ABCDE' }, 'nut', 7]) {
    assert.equal(await applyOpts(c, { buildId: ID, labelBadges: { 2: bad } }), 0);
    assert.deepEqual(c.placed[1].labelBadge, { type: 'icon', value: 'nut' }, `${JSON.stringify(bad)} overwrote the badge`);
  }
  await applyOpts(c, { buildId: ID, labelBadges: { 3: { type: 'icon', value: 'nut' } } });
  assert.ok(!('labelBadge' in c.placed[2]), 'an unlabelled unit took a badge');
  await applyOpts(c, { buildId: ID, labelBadges: { 2: null } });
  assert.ok(!('labelBadge' in c.placed[1]), 'null (Auto) did not delete the badge');
});

test('incoming: a style outside the generator\'s limits is DROPPED, never clamped; incoming words are cut to 40', async () => {
  const b = labelledBuild({ labelStyle: { capMm: 4 } });
  const n = await applyOpts.full(b, { buildId: ID, labelStyle: { capMm: 7 } });
  assert.deepEqual(b.labelStyle, null, 'capMm 7 was clamped or kept - cleanLabelStyle drops it, leaving nothing');
  assert.equal(n.refreshes, 1, 'the (now default) style is a change and refreshes');
  const c = labelledBuild({ labelStyle: { capMm: 4 } });
  assert.equal(await applyOpts(c, { buildId: ID, labelStyle: { capMm: 4, depth: 9 } }), 0, 'an out-of-range depth beside an unchanged capMm was taken as a change');
  assert.deepEqual(c.labelStyle, { capMm: 4 });
  const d = labelledBuild();
  await applyOpts(d, { buildId: ID, labels: { 3: '  ' + 'y'.repeat(41) } });
  assert.equal(d.placed[2].label, 'y'.repeat(40), 'incoming words were not trimmed and cut to 40');
});

test('layoutKey and layoutSig both carry the build-level label fields (style + id)', { skip: !havePlanner && 'planner checkout not present' }, () => {
  const plannerSrc = readFileSync(join(PLANNER, 'js', 'app.js'), 'utf8');
  const sig = plannerSrc.slice(plannerSrc.indexOf('const layoutSig = () => JSON.stringify({'), plannerSrc.indexOf('function postLayoutNow()'));
  const key = declAt(viewerSrc, 'const layoutKey =');
  for (const [src, what, fields] of [[sig, "the planner's layoutSig", ['state.labelStyle', 'state.buildId']], [key, "the viewer's layoutKey", ['b.labelStyle', 'b.buildId']]])
    for (const f of fields) assert.ok(src.includes(f), `${what} does not read ${f} - a layout differing only in it would be half-broken`);
});

/* ---- review round 2026-10-03: the card is told about a planner change BEFORE the label meshes rebuild ----
   renderLabelEditorState({ remote }) is what drops a draft open on a drawer the planner just changed. Both incoming paths used to
   refresh the meshes first, so the abandoned draft was rebuilt onto the 3D label (review D3); the options path - the planner's
   Undo / Redo - never named the changed drawers at all, so its draft stayed and no "Changed in the planner" showed; and a new
   build id with the same words left a draft typed under the OLD build to be saved into the new one on the next blur (review D6). */
test('incoming options: the drawers whose WORDS changed are named to the card, BEFORE the meshes refresh (a badge-only change names none)', async () => {
  const b = labelledBuild();
  const n = await applyOpts.full(b, { buildId: ID, labels: { 1: 'Torx Bits', 2: 'Bolts', 3: '' } });
  assert.deepEqual(n, { regens: 0, refreshes: 1, mismatches: 0 });
  assert.deepEqual(n.order, [{ remote: [2] }, 'refresh'], `the card must hear [2] before the refresh: ${JSON.stringify(n.order)}`);
  const m = await applyOpts.full(b, { buildId: ID, labelBadges: { 1: { type: 'char', value: 'T' } } });
  assert.deepEqual(m.order, [{ remote: [] }, 'refresh'], 'a badge-only change must keep a draft (Sol 4): it names no drawer');
});

/* applyRemoteLayout, executed: the real function with the real layoutKey / labelOnlyDiff / copyLabelFields, and a card stub that
   behaves like renderLabelEditorState on `remote` (it drops the open unit's draft); refreshLabelTexts records the draft it would
   rebuild the open label with. */
const funcAt = (src, needle) => {
  const start = src.indexOf(needle);
  assert.ok(start >= 0, `could not find "${needle}" in main.js`);
  let depth = 0, opened = false;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') { depth++; opened = true; } else if (src[i] === '}') { depth--; if (opened && depth === 0) return src.slice(start, i + 1); }
  }
  assert.fail('unterminated ' + needle);
};
const applyLayout = (() => {
  const body = funcAt(viewerSrc, 'async function applyRemoteLayout(nb)');
  const fn = new AsyncFunction('b0', 'nb', 'labelEdit', 'layoutKey', 'labelOnlyDiff', 'copyLabelFields', 'refreshLabelTexts', 'renderLabelEditorState',
    'renderOptions', 'regenerate', 'generateManifest', 'showBlocked', 'hideBlocked',
    `let build = b0, originalBuild = null, applyingRemote = false, layoutRetryTimer = 0; const booted = true, regenBusy = false;
     ${body} await applyRemoteLayout(nb); return build;`);
  return async (b0, nb, labelEdit) => {
    const order = [], n = { regens: 0 };
    const out = await fn(b0, nb, labelEdit, layoutKey, labelOnlyDiff, copyLabelFields,
      () => order.push({ refreshWithDraft: labelEdit && labelEdit.draft ? labelEdit.draft.text : null }),
      (o) => { const r = (o && o.remote) || []; if (labelEdit && r.includes(labelEdit.unit.id)) labelEdit.draft = null; order.push({ remote: r }); },
      () => {}, async () => { n.regens++; }, () => ({ manifest: {} }), () => {}, () => {});
    return { order, regens: n.regens, build: out };
  };
})();
const openCard = (b, id, draft) => ({ unit: b.placed.find((u) => u.id === id), draft: draft ? { text: draft } : null });

test('incoming layout, label-only: a planner change to the drawer under an open draft drops the draft BEFORE the refresh (review D3)', async () => {
  const b = labelledBuild(), card = openCard(b, 1, 'Draft words');
  const nb = labelledBuild(); nb.placed[0].label = 'Planner words';
  const r = await applyLayout(b, nb, card);
  assert.equal(r.regens, 0, 'the control: a words-only layout must take the label-only path');
  assert.equal(b.placed[0].label, 'Planner words');
  assert.deepEqual(r.order[0], { remote: [1] }, `the card was not told first: ${JSON.stringify(r.order)}`);
  assert.deepEqual(r.order.find((x) => 'refreshWithDraft' in x), { refreshWithDraft: null }, 'the meshes were rebuilt with the abandoned draft');
});

test('incoming layout, label-only: a NEW build id drops the open draft even when the words are the same (review D6); a change to ANOTHER drawer keeps it', async () => {
  const b = labelledBuild(), card = openCard(b, 1, 'Draft for A');
  const nb = labelledBuild({ buildId: 'dddddddddddd' });
  const r = await applyLayout(b, nb, card);
  assert.equal(r.regens, 0, 'the control: an id-only layout must take the label-only path');
  assert.equal(b.buildId, 'dddddddddddd');
  assert.ok(r.order[0].remote.includes(1), `a draft typed under build ${ID} survived the switch to dddddddddddd: ${JSON.stringify(r.order)}`);
  assert.equal(card.draft, null);
  // the same id, ANOTHER drawer's words: the draft on drawer 1 stays (it is still this build's, and nobody changed its drawer)
  const c = labelledBuild(), card2 = openCard(c, 1, 'Still mine');
  const nc = labelledBuild(); nc.placed[1].label = 'Bolts';
  const r2 = await applyLayout(c, nc, card2);
  assert.deepEqual(r2.order[0], { remote: [2] });
  assert.equal(card2.draft && card2.draft.text, 'Still mine');
});
/* ---- release checks 2026-10-03 (Astra): the card's 6-s Undo (item 4) and the stale pop-out's refused edit (item 2) ----
   The REAL main.js functions - commitLabelEdit, undoLastLabelEdit, setLabelStatus, noteRelayRejected, syncRelayRejected,
   closeRelayRejected - run together in one scope over a DOM stub, with the real label-panel / label-spec helpers, and the
   planner post each commit makes is the REAL currentOpts of the build at that moment. Planner-side changes arrive through the
   real incoming paths extracted above (applyRemoteLayout, the buildOptions block). */
const { cleanLabelText } = await import(new URL('../viewer/js/label-spec.js', import.meta.url).href);
const { labelSnap, labelUndoPatch, rejectionIsMine, editCommit } = await import(new URL('../viewer/js/label-panel.js', import.meta.url).href);
// a top-level function in main.js: from its declaration to the first closing brace at column 0 (CRLF-safe)
const topFn = (needle) => {
  const a = viewerSrc.indexOf(needle);
  assert.ok(a >= 0, `could not find "${needle}" in main.js - if it was renamed, update this test rather than deleting it`);
  const b = viewerSrc.indexOf('\n}', a);
  return viewerSrc.slice(a, b + 2);
};
const fakeDom = () => {
  const els = new Map();
  const el = (id) => {
    if (!els.has(id)) {
      const cls = new Set(['hidden']);
      els.set(id, { id, textContent: '', onclick: null, classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c),
        toggle: (c, on) => { const v = on === undefined ? !cls.has(c) : !!on; if (v) cls.add(c); else cls.delete(c); return v; } } });
    }
    return els.get(id);
  };
  return el;
};
const cardHarness = (b0, { planner = true } = {}) => {
  const src = ['function setLabelStatus(', 'function commitLabelEdit(', 'function undoLastLabelEdit(', 'function noteRelayRejected(',
    'function syncRelayRejected(', 'function closeRelayRejected('].map(topFn).join('\n');
  const $ = fakeDom();
  const posts = [], tracked = [];
  const fn = new Function('env', `
    let { build, $, plannerWin, syncBuildToPlanner, track, trackOnce, editCommit, labelSnap, labelUndoPatch, rejectionIsMine, cleanLabelText } = env;
    let labelEdit = null, lastLabelEdit = null, lastLabelPost = null, relayRejected = null;
    let labelPreviewTimer = 0, labelStatusTimer = 0, labelUndoTimer = 0;
    ${declAt(viewerSrc, 'const LABEL_REJECTED_STATUS =')}
    const refreshLabelText = () => {}, renderLabelEditorState = () => {}, renderOptions = () => {};
    const offerLabelUndo = () => { $('label-edit-undo').classList.remove('hidden'); };
    ${src}
    return { commitLabelEdit, undoLastLabelEdit, noteRelayRejected, syncRelayRejected, closeRelayRejected,
      open: (id) => { labelEdit = id == null ? null : { unit: build.placed.find((u) => u.id === id), inst: {}, draft: null, tracked: true }; },
      get slot() { return lastLabelEdit; }, get rejected() { return relayRejected; }, LABEL_REJECTED_STATUS };`);
  const h = fn({ build: b0, $, plannerWin: () => (planner ? {} : null), syncBuildToPlanner: () => posts.push(currentOpts(b0)),
    track: (e) => tracked.push(e), trackOnce: (e) => tracked.push(e), editCommit, labelSnap, labelUndoPatch, rejectionIsMine, cleanLabelText });
  h.$ = $; h.posts = posts; h.build = b0;
  return h;
};
const unitOf = (b, id) => b.placed.find((u) => u.id === id);
const restOf = (b) => JSON.stringify({ ...b, placed: b.placed.map((u) => { const c = { ...u }; delete c.label; delete c.labelBadge; return c; }) });

test('6-s Undo: puts back ONLY the words and the badge, in ONE post through the ordinary commit path (buildId first)', () => {
  const b = labelledBuild(); b.placed[0].closure = 'magnet'; b.placed[0].variant = 'gridfinity'; b.labelStyle = { capMm: 4 };
  const h = cardHarness(b);
  h.open(1);
  h.commitLabelEdit({ labelBadge: { type: 'char', value: 'T' } }, 'label:badge:char');
  h.commitLabelEdit({ label: 'Hex Keys' }, 'label:edit');
  const rest = restOf(b), others = JSON.stringify(b.placed.slice(1));
  assert.equal(h.posts.length, 2, 'the control: each commit is one post');
  assert.equal(h.$('label-edit-undo').classList.contains('hidden'), false, 'the commit did not offer the Undo');
  h.undoLastLabelEdit();
  assert.equal(h.posts.length, 3, 'the Undo did not post exactly once');
  const post = h.posts[2];
  assert.equal(Object.keys(post)[0], 'buildId'); assert.equal(post.buildId, ID, 'the Undo\'s post does not carry the build id first');
  assert.equal(post.labels[1], 'Torx Bits'); assert.deepEqual(post.labelBadges[1], { type: 'char', value: 'T' });
  assert.equal(unitOf(b, 1).label, 'Torx Bits'); assert.deepEqual(unitOf(b, 1).labelBadge, { type: 'char', value: 'T' }, 'the badge from before the undone edit was not kept');
  assert.equal(restOf(b), rest, 'the Undo touched something besides the words and the badge (closure, body, style...)');
  assert.equal(JSON.stringify(b.placed.slice(1)), others, 'the Undo touched another drawer');
  assert.equal(h.slot, null, 'an undo of an undo is not offered');
  h.undoLastLabelEdit();
  assert.equal(h.posts.length, 3, 'a second press posted again');
});

test('6-s Undo: a later PLANNER edit to the same drawer (words, or only its badge) blocks it - it never writes over the newer change', async () => {
  // words, through the real incoming LAYOUT path
  const b = labelledBuild(), h = cardHarness(b);
  h.open(3); h.commitLabelEdit({ label: 'Bolts' }, 'label:edit');
  const nb = labelledBuild(); nb.placed[2].label = 'Planner bolts';
  assert.equal((await applyLayout(b, nb, null)).regens, 0, 'the control: a words-only layout takes the label-only path');
  h.undoLastLabelEdit();
  assert.equal(h.posts.length, 1, 'the Undo posted over the planner\'s newer words');
  assert.equal(unitOf(b, 3).label, 'Planner bolts');
  assert.match(h.$('label-edit-status').textContent, /Changed since/, 'the refused Undo said nothing');
  // only the BADGE, through the real incoming OPTIONS path (a badge-only change names no drawer to the card, so the old
  // remote-list clearing never saw it)
  const c = labelledBuild(), k = cardHarness(c);
  k.open(1); k.commitLabelEdit({ label: 'Torx Drivers' }, 'label:edit');
  await applyOpts(c, { buildId: ID, labelBadges: { 1: { type: 'icon', value: 'nut' } } });
  assert.deepEqual(unitOf(c, 1).labelBadge, { type: 'icon', value: 'nut' }, 'the control: the planner badge landed');
  k.undoLastLabelEdit();
  assert.equal(k.posts.length, 1, 'the Undo posted over the planner\'s newer badge');
  assert.equal(unitOf(c, 1).label, 'Torx Drivers'); assert.deepEqual(unitOf(c, 1).labelBadge, { type: 'icon', value: 'nut' });
});

test('6-s Undo: a later VIEWER edit - to the same drawer, to another drawer, or a Reset - never lets it write over that edit', async () => {
  // the same drawer twice: the slot is the LAST edit's, so the Undo goes back one edit, never two
  const b = labelledBuild(), h = cardHarness(b);
  h.open(3); h.commitLabelEdit({ label: 'Bolts' }, 'label:edit'); h.commitLabelEdit({ label: 'Bolts M4' }, 'label:edit');
  h.undoLastLabelEdit();
  assert.equal(unitOf(b, 3).label, 'Bolts', 'the Undo did not stop at the first edit');
  // another drawer edited after: the slot moved to it, and drawer 1's card cannot reach drawer 3's undo - nor 3's card 1's
  const c = labelledBuild(), k = cardHarness(c);
  k.open(1); k.commitLabelEdit({ label: 'Torx Drivers' }, 'label:edit');
  k.open(3); k.commitLabelEdit({ label: 'Bolts' }, 'label:edit');
  k.open(1); k.undoLastLabelEdit();
  assert.equal(k.posts.length, 2, 'drawer 1\'s card ran an Undo');
  assert.equal(unitOf(c, 1).label, 'Torx Drivers'); assert.equal(unitOf(c, 3).label, 'Bolts', 'drawer 3\'s edit was undone from drawer 1\'s card');
  // a Reset (or any other path that rewrites the words) after the edit
  const d = labelledBuild(), m = cardHarness(d);
  m.open(3); m.commitLabelEdit({ label: 'Bolts' }, 'label:edit');
  editCommit(d, 3, { label: 'Reset words' });   // any later write to the same fields, not through this slot
  m.undoLastLabelEdit();
  assert.equal(m.posts.length, 1, 'the Undo wrote over a later edit made by another path');
  assert.equal(unitOf(d, 3).label, 'Reset words');
});

test('6-s Undo: a new build id (unit ids restart at 1) blocks it, even when the drawer holds the very same words', async () => {
  const b = labelledBuild(), h = cardHarness(b);
  h.open(3); h.commitLabelEdit({ label: 'Bolts' }, 'label:edit');
  const nb = labelledBuild({ buildId: 'dddddddddddd' }); nb.placed[2].label = 'Bolts';
  await applyLayout(b, nb, null);
  assert.equal(b.buildId, 'dddddddddddd', 'the control: the new build arrived');
  h.undoLastLabelEdit();
  assert.equal(h.posts.length, 1, 'the Undo wrote build A\'s old words into build B');
  assert.equal(unitOf(b, 3).label, 'Bolts');
});

test('labelUndoPatch: exactly the two fields; null for no slot, another drawer, another build, or changed fields', () => {
  const b = labelledBuild();
  const prev = editCommit(b, 2, { label: 'Hex Nuts' });
  const slot = { unitId: 2, prev, after: labelSnap(unitOf(b, 2)), buildId: ID };
  assert.deepEqual(labelUndoPatch(slot, b, 2), { label: 'Nuts', labelBadge: { type: 'icon', value: 'nut' } });
  assert.deepEqual(Object.keys(labelUndoPatch(slot, b, 2)), ['label', 'labelBadge']);
  assert.equal(labelUndoPatch(null, b, 2), null);
  assert.equal(labelUndoPatch(slot, b, 1), null, 'another drawer\'s card');
  assert.equal(labelUndoPatch(slot, { ...b, buildId: 'dddddddddddd' }, 2), null, 'another build');
  unitOf(b, 2).labelBadge = { type: 'none' };
  assert.equal(labelUndoPatch(slot, b, 2), null, 'a changed badge');
  // a label with no badge before: the Undo asks for Auto (null), never leaves the new badge on
  const c = labelledBuild(), p2 = editCommit(c, 1, { labelBadge: { type: 'char', value: 'T' } });
  assert.deepEqual(labelUndoPatch({ unitId: 1, prev: p2, after: labelSnap(unitOf(c, 1)), buildId: ID }, c, 1), { label: 'Torx Bits', labelBadge: null });
});

test('stale pop-out: the planner\'s refusal shows "Not saved", drops the Undo, quotes the words, offers a reload - and never for another build', () => {
  const b = labelledBuild(), h = cardHarness(b);
  h.open(3); h.commitLabelEdit({ label: 'Stale Edit' }, 'label:edit');
  assert.equal(h.$('label-edit-undo').classList.contains('hidden'), false, 'the control: the commit offered its Undo');
  // a late answer naming a build this page is not on: nothing happens
  h.noteRelayRejected({ gen2: 'buildRejected', buildId: 'zzzzzzzzzzzz' });
  assert.equal(h.$('relay-rejected').classList.contains('hidden'), true, 'a refusal for another build raised the note');
  assert.equal(h.$('label-edit-undo').classList.contains('hidden'), false);
  h.noteRelayRejected({ gen2: 'buildRejected', buildId: ID });
  assert.equal(h.$('relay-rejected').classList.contains('hidden'), false, 'the refusal raised no note');
  assert.equal(h.$('label-edit-undo').classList.contains('hidden'), true, 'the card still offers Undo for an edit that was never saved');
  assert.equal(h.slot, null);
  assert.equal(h.$('label-edit-status').textContent, h.LABEL_REJECTED_STATUS, 'the card does not say "Not saved"');
  assert.match(h.$('relay-rejected-words').textContent, /Stale Edit/, 'the refused words are not kept on screen');
  assert.equal(h.$('relay-rejected-load').classList.contains('hidden'), false, 'no way to reload the planner\'s build');
  assert.equal(unitOf(b, 3).label, 'Stale Edit', 'the typed words were thrown away on this page');
  // the planner's build arrives (the reload, or its next change): the note stops offering a reload and keeps the words
  b.buildId = 'dddddddddddd';
  h.syncRelayRejected();
  assert.equal(h.$('relay-rejected-load').classList.contains('hidden'), true, 'still offering a reload once in step');
  assert.match(h.$('relay-rejected-words').textContent, /Stale Edit/);
  assert.notEqual(h.$('label-edit-status').textContent, h.LABEL_REJECTED_STATUS, '"Not saved" stuck on the card of the new build');
  // a refused NON-label post quotes no words, and the note goes away by itself once in step
  const c = labelledBuild(), k = cardHarness(c);
  k.noteRelayRejected({ gen2: 'buildRejected', buildId: ID });
  assert.equal(k.$('relay-rejected-words').classList.contains('hidden'), true);
  c.buildId = 'dddddddddddd'; k.syncRelayRejected();
  assert.equal(k.$('relay-rejected').classList.contains('hidden'), true);
});

test('stale pop-out: closing the note leaves the card saying "Not saved" - never pointing at a note that is gone (release verify 2026-10-03, cosmetic a)', () => {
  const b = labelledBuild(), h = cardHarness(b);
  h.open(3); h.commitLabelEdit({ label: 'Stale Edit' }, 'label:edit');
  h.noteRelayRejected({ gen2: 'buildRejected', buildId: ID });
  assert.equal(h.$('label-edit-status').textContent, h.LABEL_REJECTED_STATUS, 'the control: the card points at the note');
  h.closeRelayRejected();
  assert.equal(h.$('relay-rejected').classList.contains('hidden'), true, 'the note did not close');
  assert.equal(h.$('label-edit-status').textContent, 'Not saved', 'after the note closed the card still points at it (or claims nothing)');
  assert.equal(h.$('label-edit-undo').classList.contains('hidden'), true, 'closing the note brought the Undo back');
  h.commitLabelEdit({ label: 'Saved Later' }, 'label:edit');
  assert.equal(h.$('label-edit-status').textContent, '', 'a later commit left "Not saved" on the card');
});

test('rejectionIsMine: only an answer naming this page\'s own id (a page with no id is never told it was refused)', () => {
  assert.equal(rejectionIsMine({ buildId: ID }, { buildId: ID }), true);
  assert.equal(rejectionIsMine({ buildId: ID }, { buildId: 'zzzzzzzzzzzz' }), false);
  assert.equal(rejectionIsMine({}, { buildId: undefined }), false);
  assert.equal(rejectionIsMine({ buildId: '' }, { buildId: '' }), false);
  assert.equal(rejectionIsMine(null, { buildId: ID }), false);
});

test('the message listener routes buildRejected to noteRelayRejected, and re-checks the note after every layout', async () => {
  const a = viewerSrc.indexOf("addEventListener('message', async (e) => {");
  assert.ok(a >= 0, 'the incoming message listener was not found');
  const body = viewerSrc.slice(a, viewerSrc.indexOf('\n});', a) + 4);
  const calls = [];
  const fn = new AsyncFunction('build', 'noteRelayRejected', 'syncRelayRejected', 'applyRemoteLayout', 'applyRemoteColors',
    `let handler; const addEventListener = (t, f) => { handler = f; }; const IS_PART = false; ${body} return handler;`);
  const handler = await fn(labelledBuild(), (d) => calls.push(['rejected', d.buildId]), () => calls.push(['sync']),
    async () => calls.push(['layout']), () => calls.push(['colors']));
  await handler({ data: { gen2: 'buildRejected', buildId: ID } });
  await handler({ data: { gen2: 'layout', build: { placed: [] } } });
  await handler({ data: { gen2: 'colors' } });
  assert.deepEqual(calls, [['rejected', ID], ['layout'], ['sync'], ['colors']]);
});
