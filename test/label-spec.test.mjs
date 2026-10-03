/* WHAT A DRAWER LABEL MAY CARRY - the viewer's checks, and the proof they are the planner's (2026-10-02).
 *
 * viewer/js/label-spec.js decides which `labelBadge` / `labelStyle` values reach the label generator's code in this page.
 * The planner decides the same thing when it restores a build (js/app.js cleanLabelBadge / cleanLabelStyle). Two copies
 * of one rule drift unless something runs them side by side - so the cross-repo tests below EXECUTE the planner's own
 * functions (extracted from app.js by balanced scan, fed the planner's own GEN2.labelSpec) and require identical answers
 * on a shared list of inputs, and compare the limits with the EdgeLabel generator's own inputs. Each cross-repo test skips
 * honestly when that checkout is not beside this one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { LABEL_SPEC, LABEL_TEXT_MAX, BUILD_ID_RE, cleanLabelBadge, cleanLabelStyle, cleanLabelText, cleanBuildId } from '../viewer/js/label-spec.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const firstDir = (cands, file) => cands.find((d) => existsSync(join(d, file)));
const PLANNER = firstDir(process.env.GEN2_PLANNER_ROOT ? [process.env.GEN2_PLANNER_ROOT]
  : [join(root, '..', 'GEN2 Planner', 'gen2-planner-main'), join(root, '..', '..', 'GEN2 Planner', 'gen2-planner-main')], join('js', 'app.js'));
const GENERATOR = firstDir(process.env.GEN2_EDGELABEL_ROOT ? [process.env.GEN2_EDGELABEL_ROOT]
  : [join(root, '..', 'GEN2 EdgeLabel Label Generator'), join(root, '..', '..', 'GEN2 EdgeLabel Label Generator')], 'index.html');

const BADGES = [
  { type: 'icon', value: 'screw-torx-head' }, { type: 'none' }, { type: 'char', value: ' m3 ' }, { type: 'char', value: 'ABCD' },
  { type: 'char', value: 'ABCDE' }, { type: 'char', value: '   ' }, { type: 'char', value: 7 }, { type: 'icon', value: 'Torx Head!' },
  { type: 'icon', value: 'a-'.repeat(30) + 'b' }, { type: 'icon', value: 'a-brand-new-icon' }, { type: 'icon', value: '-lead' },
  { type: 'icon' }, { type: 'svg', value: '<svg/>' }, 'screw-torx-head', null, undefined, [], 0,
];
const STYLES = [
  { capMm: 6, depth: 0.8, badgeSize: 10, bold: true, allCaps: false, predictIcons: false },
  { capMm: 7 }, { capMm: 2, depth: 0.1 }, { capMm: 6.5, badgeSize: 22, depth: 1.2 }, { capMm: '5', bold: 'yes', allCaps: 0 },
  { capMm: NaN, badgeSize: Infinity }, { colorText: '#ff0000' }, [], 'big', null, undefined, {},
];

test('a badge passes only in a shape the generator can print', () => {
  assert.deepEqual(cleanLabelBadge({ type: 'icon', value: 'screw-torx-head' }), { type: 'icon', value: 'screw-torx-head' });
  assert.deepEqual(cleanLabelBadge({ type: 'char', value: ' m3 ' }), { type: 'char', value: 'm3' }, 'trimmed, case kept');
  assert.deepEqual(cleanLabelBadge({ type: 'none' }), { type: 'none' });
  assert.equal(cleanLabelBadge({ type: 'char', value: 'ABCDE' }), null, 'the generator\'s letter field takes 4');
  assert.equal(cleanLabelBadge({ type: 'icon', value: 'Torx Head!' }), null);
  assert.deepEqual(cleanLabelBadge({ type: 'icon', value: 'a-brand-new-icon' }), { type: 'icon', value: 'a-brand-new-icon' },
    'checked for shape only - an icon added to the generator later must still pass');
  assert.equal(cleanLabelBadge({ type: 'svg', value: '<svg/>' }), null, 'custom SVGs are not build state');
  assert.equal(cleanLabelBadge('screw-torx-head'), null);
});

test('a style keeps only in-range values of the right type, and never clamps', () => {
  assert.deepEqual(cleanLabelStyle(STYLES[0]), STYLES[0]);
  assert.equal(cleanLabelStyle({ capMm: 7 }), null, '7 mm is above the generator\'s 6.5 - dropped, not clamped');
  assert.deepEqual(cleanLabelStyle({ capMm: 2, depth: 0.1 }), { capMm: 2 });
  assert.equal(cleanLabelStyle({ capMm: '5', bold: 'yes' }), null);
  assert.equal(cleanLabelStyle({ colorText: '#ff0000' }), null, 'colours are the viewer\'s filament picks, not label style');
  assert.equal(cleanLabelStyle([]), null);
  assert.equal(cleanLabelStyle({}), null);
});

/* The planner's functions, executed - not their text compared. */
function plannerCleaners() {
  const app = readFileSync(join(PLANNER, 'js', 'app.js'), 'utf8');
  const data = readFileSync(join(PLANNER, 'js', 'data.js'), 'utf8');
  const fnAt = (name) => {
    const start = app.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `planner app.js has no function ${name} - if it was renamed, update this test rather than deleting it`);
    let depth = 0, seen = false;
    for (let i = start; i < app.length; i++) {
      if (app[i] === '{') { depth++; seen = true; } else if (app[i] === '}') { depth--; if (seen && depth === 0) return app.slice(start, i + 1); }
    }
    assert.fail(`unterminated function ${name}`);
  };
  // data.js needs the two scripts index.html loads before it, in that order
  const ctx = vm.createContext({});
  ctx.window = ctx;
  const labelMax = app.match(/const LABEL_MAX = (\d+);/);
  assert.ok(labelMax, 'planner app.js has no LABEL_MAX');
  vm.runInContext([readFileSync(join(PLANNER, 'js', 'requirement-scope.js'), 'utf8'),
    readFileSync(join(PLANNER, 'js', 'tabletop-completion.js'), 'utf8'), data, labelMax[0], (app.match(/const BUILD_ID_RE = [^;]+;/) || [''])[0],
    `${fnAt('cleanLabelBadge')}\n${fnAt('cleanLabelStyle')}\n${fnAt('cleanLabelText')}\nthis.out = { GEN2, cleanLabelBadge, cleanLabelStyle, cleanLabelText, LABEL_MAX, BUILD_ID_RE };`].join('\n;\n'), ctx);
  return ctx.out;
}

/* The words (label plan step 2): ONE canonical form on both ends - trim, THEN cut to 40 - so a label that enters either tool
   by any path (the field, a link, the relay) never leaves the two disagreeing. The planner used to slice without trimming
   on its restore path while its field trimmed; the ORDER matters too (" ".repeat(3) + 45 x's is 40 x's one way, 37 the other). */
const TEXTS = ['Torx Bits', '  Torx  ', ' '.repeat(3) + 'x'.repeat(45), ' '.repeat(50) + 'x', 'y'.repeat(41), ' '.repeat(40), '', 7, null, undefined, ['a'], { label: 'a' }];

test('cleanLabelText trims, then cuts to 40, and gives "" for anything that is not words', () => {
  assert.equal(LABEL_TEXT_MAX, 40);
  assert.equal(cleanLabelText('  Torx  '), 'Torx');
  assert.equal(cleanLabelText(' '.repeat(3) + 'x'.repeat(45)), 'x'.repeat(40), 'trim must come BEFORE the cut');
  assert.equal(cleanLabelText(' '.repeat(50) + 'x'), 'x', 'leading whitespace must not eat the whole allowance');
  assert.equal(cleanLabelText('y'.repeat(41)), 'y'.repeat(40));
  assert.equal(cleanLabelText(' '.repeat(40)), '', 'a whitespace-only label is no label');
  for (const v of [7, null, undefined, ['a'], { label: 'a' }]) assert.equal(cleanLabelText(v), '');
});

test('cleanBuildId keeps the planner\'s own ids and nothing else', () => {
  assert.equal(cleanBuildId('k7m2p9q4x1z8'), 'k7m2p9q4x1z8');
  assert.equal(cleanBuildId('abcdefgh'), 'abcdefgh', '8 is the planner\'s floor');
  for (const v of ['../../x', 'ABCDEFGHIJKL', 'short', 'z'.repeat(33), '', null, 12, {}]) assert.equal(cleanBuildId(v), null, `${JSON.stringify(v)} passed`);
  assert.equal(String(BUILD_ID_RE), '/^[a-z0-9]{8,32}$/');
});

test('the viewer and the planner give the same words for every text, and share the 40 and the id shape', { skip: !PLANNER && 'planner checkout not present' }, () => {
  const P = plannerCleaners();
  for (const t of TEXTS) assert.equal(cleanLabelText(t), P.cleanLabelText(t), `label text ${JSON.stringify(t)}`);
  assert.equal(P.LABEL_MAX, LABEL_TEXT_MAX, 'the planner\'s LABEL_MAX and the viewer\'s LABEL_TEXT_MAX differ');
  assert.equal(String(P.BUILD_ID_RE), String(BUILD_ID_RE), 'the two BUILD_ID_RE differ');
  // the three fields that take the words all say 40: the planner's #ut-label, the viewer's card, the constant
  const maxlength = (html, id) => { const m = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`)); assert.ok(m, `no #${id}`); return +m[0].match(/\smaxlength="(\d+)"/)[1]; };
  assert.equal(maxlength(readFileSync(join(PLANNER, 'index.html'), 'utf8'), 'ut-label'), LABEL_TEXT_MAX);
  assert.equal(maxlength(readFileSync(join(root, 'viewer', 'index.html'), 'utf8'), 'label-edit-text'), LABEL_TEXT_MAX);
});

test('the viewer and the planner give the same answer for every badge and style', { skip: !PLANNER && 'planner checkout not present' }, () => {
  const P = plannerCleaners();
  const j = (v) => JSON.stringify(v ?? null);
  for (const b of BADGES) assert.equal(j(cleanLabelBadge(b)), j(P.cleanLabelBadge(b)), `labelBadge ${JSON.stringify(b)}`);
  for (const s of STYLES) assert.equal(j(cleanLabelStyle(s)), j(P.cleanLabelStyle(s)), `labelStyle ${JSON.stringify(s)}`);
  assert.equal(JSON.stringify(P.GEN2.labelSpec), JSON.stringify(LABEL_SPEC), 'GEN2.labelSpec and LABEL_SPEC differ');
});

test('the limits are the EdgeLabel generator\'s own inputs', { skip: !GENERATOR && 'EdgeLabel generator checkout not present' }, () => {
  const html = readFileSync(join(GENERATOR, 'index.html'), 'utf8');
  const input = (id) => { const m = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`)); assert.ok(m, `no #${id} in the generator`); return m[0]; };
  const attr = (id, a) => +input(id).match(new RegExp(`\\s${a}="([^"]*)"`))[1];
  assert.deepEqual(LABEL_SPEC.limits.capMm, [attr('font-size', 'min'), attr('font-size', 'max')]);
  assert.deepEqual(LABEL_SPEC.limits.depth, [attr('text-depth', 'min'), attr('text-depth', 'max')]);
  assert.deepEqual(LABEL_SPEC.limits.badgeSize, [attr('badge-size', 'min'), attr('badge-size', 'max')]);
  assert.equal(LABEL_SPEC.charMax, attr('bp-char', 'maxlength'));
  for (const id of ['bold-text', 'all-caps', 'predict-icons']) assert.equal(input(id).includes('type="checkbox"'), true, `#${id} is not a checkbox`);
});
