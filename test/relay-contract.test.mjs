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
const currentOptsWith = new Function('build', 'plateFinishOf', `${declAt(viewerSrc, 'function currentOpts()')} return currentOpts();`);
const currentOpts = (b) => currentOptsWith(b, plateFinishOf);

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
  const fn = new AsyncFunction('d', 'build', 'regenerate', 'LIP_MODES', 'VARIANT_MODES', 'PLATE_FINISHES', 'plateFinishOf',
    `let applyingRemote = false; const regenBusy = false; ${viewerSrc.slice(a, b + endMark.length)}`);
  return async (b0, opts) => {
    let regens = 0;
    await fn({ gen2: 'buildOptions', opts }, b0, async () => { regens++; }, new Set(LIP_MODES), new Set(VARIANT_MODES),
      PLATE_FINISHES, plateFinishOf);
    return regens;
  };
})();

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
