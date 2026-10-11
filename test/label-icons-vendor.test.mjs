/* THE VENDORED LABEL ICON CATALOG - drift gate + the behaviour this app leans on (2026-10-09).
 *
 * `viewer/js/vendor/label-icons.js` and `label-icon-art.js` are BYTE-FOR-BYTE copies of the EdgeLabel label generator's
 * (the MODULITH Label Studio's) icon catalog: the icons a label can carry beyond the core's 23 (the MODULITH icon family),
 * their groups, the drawing a badge prints for its size, and the wider word -> icon guess, built ON the core (its 23 icons
 * and its rules first). label-text.js builds every drawer label through it and the identify card's picker offers exactly its
 * icons, so a drawer in 3D shows the icon its printed label carries.
 *
 * Same chain as edgelabel-core-vendor.test.mjs: the sha256s are pinned here, and this test also checks byte equality against
 * the generator's files when that checkout is present. ⚠ Bump the pins ONLY after the GENERATOR's files changed and were
 * re-copied here. Never edit the viewer's copies.
 *
 * ⚠ SHIP ORDER (Sol 01a122f1, finding 4): this app ships BEFORE the Label Studio carries the same catalog, so no new icon id
 * reaches a drawer this app cannot draw.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = (f) => join(root, 'viewer', 'js', 'vendor', f);
const GEN = process.env.GEN2_EDGELABEL_ROOT
  ? [process.env.GEN2_EDGELABEL_ROOT]
  : [join(root, '..', 'GEN2 EdgeLabel Label Generator'), join(root, '..', '..', 'GEN2 EdgeLabel Label Generator')];
const GEN_ROOT = GEN.find((d) => existsSync(join(d, 'label-icons.js')));
const PINS = {
  'label-icons.js': '8db74ae1c267fbae7f5946b4521d9744f72453cc5fea8f78cb4c8788883f408b',
  'label-icon-art.js': 'd24118c36c0fa7251d4fcd90f801937fbf954fe6bfd736cb460a34c28477f16e',
};
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

function load() {
  for (const k of ['GEN2EdgeLabelCore', 'GEN2LabelIconArt', 'GEN2LabelIcons']) delete globalThis[k];
  for (const f of ['edgelabel-core.js', 'label-icon-art.js', 'label-icons.js']) (0, eval)(readFileSync(V(f), 'utf8'));
  const core = globalThis.GEN2EdgeLabelCore.create({ THREE: {} });
  return { core, cat: globalThis.GEN2LabelIcons.create({ core, art: globalThis.GEN2LabelIconArt }) };
}

test('the vendored icon catalog matches its pins', () => {
  for (const [f, pin] of Object.entries(PINS)) {
    assert.ok(existsSync(V(f)), `viewer/js/vendor/${f} is missing`);
    assert.equal(sha(V(f)), pin, `vendored ${f} changed - edit the GENERATOR's file, copy it here, then bump its pin`);
  }
});

test('the vendored icon catalog is byte-identical to the generator\'s (when the generator is checked out)', (t) => {
  if (!GEN_ROOT) { t.skip('EdgeLabel generator checkout with label-icons.js not present - pin-only'); return; }
  for (const f of Object.keys(PINS)) assert.ok(readFileSync(V(f)).equals(readFileSync(join(GEN_ROOT, f))), `${f} differs from the generator's - re-copy it`);
});

test('over the vendored core: the core\'s 23 icons + 9 MODULITH-family icons, the core\'s guess first, the drawing by badge size', () => {
  const { core, cat } = load();
  assert.equal(cat.icons.length, core.ICON_LIBRARY.length + 9);
  assert.ok(!cat.find('coffee-filter'), 'the staged coffee filter is in no picker');
  for (const t of ['Torx Bits', 'Washers', 'Spare nozzles', 'Resistors 10k', 'AA batteries', 'SD cards', 'Gears', 'Flush cutters', 'Fuses', 'M3 nyloc'])
    assert.equal(cat.guessIconId(t), core.guessIconId(t), `"${t}" keeps the core's icon`);
  assert.equal(cat.guessIconId('JST connectors'), 'wire-connector');
  assert.equal(cat.guessIconId('Paper clips'), 'paper-clip');
  const nut = cat.find('hex-nut');
  assert.equal(cat.resolveBadge({ type: 'icon', value: 'hex-nut' }, 14).svg, nut.svg);
  assert.equal(cat.resolveBadge({ type: 'icon', value: 'hex-nut' }, 8).svg, nut.svgCompact);
  const b = { type: 'icon', value: 'nut' };
  assert.equal(cat.resolveBadge(b, 14), b, 'a core icon is built from its id, as before');
});

test('label-text.js loads the catalog with its own ?v= stamp and builds every label through resolveBadge', () => {
  const src = readFileSync(join(root, 'viewer', 'js', 'label-text.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(src, /script\(url\('\.\/vendor\/label-icon-art\.js'\), \(\) => !!window\.GEN2LabelIconArt\),\n {4}script\(url\('\.\/vendor\/label-icons\.js'\), \(\) => !!window\.GEN2LabelIcons\),/);
  assert.match(src, /core\.prepareLabel\(raw, icons\.resolveBadge\(chosen, S\.badgeSize\), S\.allCaps\)/);
  assert.equal((src.match(/prepareLabel\(/g) || []).length, 1, 'one label build path');
  assert.match(src, /const id = S\.predictIcons \? icons\.guessIconId\(text\) : null;/);
  const main = readFileSync(join(root, 'viewer', 'js', 'main.js'), 'utf8');
  assert.doesNotMatch(main, /ICON_LIBRARY/, 'main.js reads icons only through labelIcons()');
});
