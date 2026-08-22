/* THE BOOT MATRIX — which door every URL shape opens.
 *
 * This is the branch every printed kit link, every planner hand-off and every
 * MODULITH product-page embed takes, and until now it had NO test at all: it
 * lived inline in main.js among DOM and WebGL setup, so the only way to
 * exercise it was to load the viewer in a browser and look. Two boot defects
 * shipped behind that gap - `?build=` with an empty value silently opening the
 * static demo instead of the 404 card, and an official kit whose generator
 * threw hanging the spinner with no message and no analytics.
 *
 * resolveEntry() is a pure function of (search, hash), so the whole matrix is
 * cheap to assert. What it CANNOT see is what main.js then does with the
 * answer; those consequences are pinned as source assertions at the end, which
 * is honest about being second-best but still fails loudly on a regression.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveEntry, parsePlate, ROOT_BUILD, DEFAULT_KIT } from '../viewer/js/entry.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAIN = readFileSync(join(root, 'viewer', 'js', 'main.js'), 'utf8');

/* ---------- the bare root ---------- */

test('the bare root opens the recommended starter through the official path', () => {
  const e = resolveEntry('', '');
  assert.equal(e.isRoot, true);
  assert.equal(e.wantsOfficial, true, 'the root must run the official branch, not the static one');
  assert.equal(e.officialTarget, ROOT_BUILD);
  assert.equal(e.isPart, false);
  assert.equal(e.buildHash, null);
});

test('the root survives params that are not routing decisions', () => {
  // ?from= store attribution, ?debug=, ?theme=/&tt= must never change the door
  for (const q of ['?from=makerworld', '?debug=1', '?theme=dark&tt=123', '?from=cults&debug=1']) {
    const e = resolveEntry(q, '');
    assert.equal(e.isRoot, true, q);
    assert.equal(e.officialTarget, ROOT_BUILD, q);
  }
});

test('⚠ ROOT_BUILD is a LIVE promise: the root must not pin itself into the URL', () => {
  /* `/` means "open the current recommended starter". A replaceState rewrite to
     ?build=<id> shipped on 2026-08-22 and was reversed the same day (Joey):
     it pinned everyone who bookmarked or shared the rewritten address to
     whichever kit was the starter that day, so moving ROOT_BUILD could never
     reach them. The pinned semantic is offered explicitly instead, by the
     cover's "Copy link to this kit". If this assertion ever fails, the rewrite
     came back - that is a product decision, not a refactor. */
  // match a CALL, not the word: the comment explaining the reversal says
  // "replaceState" in prose, and a bare substring test failed on that
  assert.ok(!/history\s*\.\s*replaceState\s*\(/.test(MAIN),
    'main.js must not rewrite the address bar; the root URL is a live promise');
  assert.ok(!/history\s*\.\s*pushState\s*\(/.test(MAIN),
    'nor push a second entry for the same page');
});

/* ---------- named official kits ---------- */

test('?build=<id> loads that exact kit and nothing else', () => {
  const e = resolveEntry('?build=240-tabletop-3w2h', '');
  assert.equal(e.isRoot, false);
  assert.equal(e.wantsOfficial, true);
  assert.equal(e.officialTarget, '240-tabletop-3w2h');
  assert.equal(e.officialId, '240-tabletop-3w2h');
});

test('⚠ an EMPTY ?build= is still a request for a kit by name, and must fail visibly', () => {
  /* The long-standing bug: branching on the target STRING sent `?build=` down
     the static path, so someone who asked for a kit got the demo silently.
     wantsOfficial must be true (so the official branch runs and shows the 404
     card) while the target stays '' (so the id regex rejects it). */
  const e = resolveEntry('?build=', '');
  assert.equal(e.isRoot, false, 'an empty ?build= is not a bare root');
  assert.equal(e.wantsOfficial, true, 'the official branch must still run');
  assert.equal(e.officialTarget, '', 'and it must resolve to nothing, so it 404s');
});

test('an unknown kit id resolves to itself, for the 404 card to name', () => {
  const e = resolveEntry('?build=not-a-real-kit', '');
  assert.equal(e.wantsOfficial, true);
  assert.equal(e.officialTarget, 'not-a-real-kit');
});

test('a kit id that is not a safe slug still routes officially, to be rejected there', () => {
  // main.js gates on /^[a-z0-9][a-z0-9-]*$/ before fetching - path traversal and
  // absolute URLs must never reach the fetch, but they must not fall through to
  // the static kit either
  for (const bad of ['../../etc/passwd', 'https://evil.test/x', 'a/b']) {
    const e = resolveEntry('?build=' + encodeURIComponent(bad), '');
    assert.equal(e.wantsOfficial, true, bad);
    assert.equal(e.isRoot, false, bad);
  }
});

/* ---------- static kits ---------- */

test('?kit=<name> takes the static path', () => {
  const e = resolveEntry('?kit=edgelabel-test', '');
  assert.equal(e.kit, 'edgelabel-test');
  assert.equal(e.isRoot, false);
  assert.equal(e.wantsOfficial, false);
});

test('⚠ an EMPTY ?kit= is an explicit static request, not a bare root', () => {
  const e = resolveEntry('?kit=', '');
  assert.equal(e.isRoot, false, 'presence, not truthiness');
  assert.equal(e.wantsOfficial, false, 'it must not be routed to the official branch');
  assert.equal(e.kit, DEFAULT_KIT, 'and it falls back to the demo kit name');
});

/* ---------- the planner hand-off ---------- */

test('#build= wins over every query form', () => {
  for (const q of ['', '?build=185-tabletop-2w2h', '?kit=tabletop-165']) {
    const e = resolveEntry(q, '#build=eyJhIjoxfQ==');
    assert.ok(e.buildHash, q);
    assert.equal(e.isRoot, false, q);
    assert.equal(e.wantsOfficial, false, 'a hash build is never an official kit: ' + q);
    assert.equal(e.officialId, null, q);
  }
});

test('?embed=1 only means anything alongside a hash build', () => {
  assert.equal(resolveEntry('?embed=1', '#build=eyJhIjoxfQ==').isEmbed, true);
  assert.equal(resolveEntry('?embed=1', '').isEmbed, false, 'embed without a build is not an embed');
  assert.equal(resolveEntry('?embed=1', '').isRoot, true, 'and it is still the front door');
});

/* ---------- part previews ---------- */

test('?part= with mode=preview takes precedence over everything', () => {
  const e = resolveEntry('?part=185-case-2w-1h&mode=preview', '#build=eyJhIjoxfQ==');
  assert.equal(e.isPart, true);
  assert.equal(e.partSlug, '185-case-2w-1h');
  assert.equal(e.isRoot, false);
  assert.equal(e.wantsOfficial, false, 'part mode must never run the official branch');
});

test('the modes are mutually exclusive - never two at once', () => {
  /* "Precedence over everything" has to mean the losing modes are actually
     FALSE, not merely unused. A part URL that also carries ?embed=1 and a
     build hash used to report isPart AND isEmbed together. */
  const hybrid = resolveEntry('?part=x&mode=preview&embed=1', '#build=eyJhIjoxfQ==');
  assert.equal(hybrid.isPart, true, 'part preview wins');
  assert.equal(hybrid.isEmbed, false, 'so it is not also an embed');
  assert.equal(hybrid.isRoot, false);
  assert.equal(hybrid.wantsOfficial, false);
  // at most one mode is true for every shape we can construct
  for (const q of ['', '?kit=x', '?build=y', '?embed=1', '?part=x&mode=preview', '?part=x&mode=preview&embed=1']) {
    for (const h of ['', '#build=eyJhIjoxfQ==']) {
      const e = resolveEntry(q, h);
      const modes = [e.isPart, e.isEmbed, e.isRoot].filter(Boolean).length;
      assert.ok(modes <= 1, `${q} ${h} reported ${modes} simultaneous modes`);
    }
  }
});

test('?part= without mode=preview is NOT a part boot, and lands on the front door', () => {
  /* mode=preview is what the site's iframe always sends; a bare ?part= is a
     hand-edited or truncated URL. It must not boot the part embed (chrome
     hidden, transparent stage, no instructions), and since it names no kit it
     is simply the front door - the same treatment ?from= and ?debug= get.
     Only build/kit/part-preview are routing decisions; everything else rides
     along. */
  const e = resolveEntry('?part=185-case-2w-1h', '');
  assert.equal(e.isPart, false, 'not a part boot');
  assert.equal(e.isRoot, true, 'an unrecognised param is not a route');
  assert.equal(e.officialTarget, ROOT_BUILD, 'so it opens the recommended starter');
});

test('mode=preview without a slug is not a part boot', () => {
  assert.equal(resolveEntry('?mode=preview', '').isPart, false);
});

test('the rid correlation token rides through, defaulting to empty', () => {
  assert.equal(resolveEntry('?part=x&mode=preview&rid=abc123', '').partRid, 'abc123');
  assert.equal(resolveEntry('?part=x&mode=preview', '').partRid, '');
});

/* ---------- the build plate ---------- */

test('&plate= accepts real printer sizes and rejects nonsense', () => {
  assert.deepEqual(parsePlate('256x256'), { w: 256, d: 256 });
  assert.deepEqual(parsePlate('360X360'), { w: 360, d: 360 }, 'capital X is accepted');
  for (const bad of ['', '0x0', '10x10', '2000x2000', '256', '256x', 'axb', '256x256x256', '-5x100']) {
    assert.equal(parsePlate(bad), null, `must reject ${JSON.stringify(bad)}`);
  }
});

test('⚠ "no plate asked for" and "plate asked for, refused" stay distinguishable', () => {
  /* main.js turns (requested && !parsed) into a HARD partError so the site
     keeps its poster. If these two collapsed to `partPlate: null`, a typo in a
     printer profile would render a perfectly good product view that silently
     answers a different question than the one the Plate tab asked. */
  const bad = resolveEntry('?part=x&mode=preview&plate=9999x1', '');
  assert.equal(bad.isPart, true, 'still a part preview');
  assert.equal(bad.partPlate, null, 'the size is refused');
  assert.equal(bad.plateRequested, true, 'but a plate WAS requested - this must fail loudly');

  const none = resolveEntry('?part=x&mode=preview', '');
  assert.equal(none.partPlate, null);
  assert.equal(none.plateRequested, false, 'nothing was asked for, so the turntable is correct');
});

test('plate is ignored outside part mode', () => {
  const e = resolveEntry('?plate=256x256', '');
  assert.equal(e.partPlate, null, 'a plate size means nothing without a part');
  assert.equal(e.isRoot, true, 'and it is not a routing param, so the front door still opens');
});

/* ---------- consequences main.js owns, pinned as source assertions ---------- */

test('the root keeps its fallback and every other failure stays visible', () => {
  /* Joey, 2026-08-22: "Root failures may fall back; explicit kit URLs should
     fail visibly rather than silently open a different build." The fallback is
     guarded by IS_ROOT and records its own analytics row, so a degraded front
     door is never mistaken for a healthy one. */
  assert.ok(/if \(IS_ROOT\) \{ rootFailure = ev; return; \}/.test(MAIN),
    'the root fallback must be gated on IS_ROOT alone');
  assert.ok(/entry:root-fallback/.test(MAIN),
    'a fallen-back root must still report that it fell back');
  assert.ok(/track\('entry:root'\)/.test(MAIN),
    'the door itself is counted separately from what loaded');
});

test('the official boot cannot throw its way into a silent hang', () => {
  // error:kit-crash exists because generateManifest() on the official path had
  // no try/catch: a throw was an unhandled top-level-await rejection, which is
  // a spinner forever with no message and no analytics
  assert.ok(/error:kit-crash|'kit-crash'/.test(MAIN), 'the official path must report a crash');
});

test('every ENTRY.<field> main.js reads is one resolveEntry actually returns', () => {
  /* The extraction of this logic out of main.js deleted the old `const`s, and
     one of them - PLATE_RAW - was still referenced further down the file. That
     is a ReferenceError on the part-plate boot only, a path no other test and
     no ordinary page load touches, so it would have shipped. A plain name
     check is crude, but it is the cheap guard that would have caught it. */
  const keys = new Set(Object.keys(resolveEntry('', '')));
  const used = new Set([...MAIN.matchAll(/\bENTRY\.([A-Za-z_$][\w$]*)/g)].map(m => m[1]));
  assert.ok(used.size > 0, 'sanity: main.js reads ENTRY at all');
  const unknown = [...used].filter(k => !keys.has(k));
  assert.deepEqual(unknown, [], 'main.js reads fields resolveEntry does not return: ' + unknown);
});

test('the constants extracted into entry.js are no longer declared in main.js', () => {
  // a leftover declaration would shadow ENTRY and silently diverge from it
  for (const name of ['PLATE_RAW']) {
    assert.ok(!new RegExp('\\b(const|let|var)\\s+' + name + '\\b').test(MAIN),
      `${name} was extracted into entry.js and must not be redeclared`);
  }
  assert.ok(!/\bPLATE_RAW\b/.test(MAIN), 'and nothing may still reference it');
});

test('exactly one open: event fires, naming what actually loaded', () => {
  /* The dashboard sums the `open:` prefix blindly into BUILDS STARTED, so a
     second open: on one visit double-counts the build and invents a kit row.
     The door uses the separate `entry:` head for that reason. */
  const opens = MAIN.match(/track\(\s*IS_PART \?/g) || [];
  assert.equal(opens.length, 1, 'one open: call site');
  assert.ok(!/track\('open:root'\)/.test(MAIN), "the door must not emit an open: row");
});
