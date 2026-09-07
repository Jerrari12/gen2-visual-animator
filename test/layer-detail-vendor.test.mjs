/* THE VENDORED LAYER-DETAIL MODULE — drift gate + load contract.
 *
 * `viewer/js/vendor/layer-detail.js` is the Filament Material Lab's printed-layer renderer,
 * compiled from `src/appearance/layerDetail.ts` over there and copied here. It draws the bead
 * corrugation, the bead crown and the crest on printed parts.
 *
 * ⚠ OWNERSHIP IS INVERTED FROM EVERY OTHER VENDORED FILE IN THIS REPO, so the two halves of the
 * gate swap sides. `part-material.js`, `filament-db.js` and `data/plate-poses.json` are OURS and
 * the Lab copies them; `requirement-scope.js` is the planner's and we copy it. This one is the
 * Lab's and we carry the copy — the same shape as requirement-scope, and the OPPOSITE of
 * plate-poses.
 *
 * The rule `plate-poses-vendor.test.mjs` states decides what belongs here: **each repo gates the
 * drift it can actually cause.**
 *
 *   HERE      someone hand-edits the copy       <- the pinned hash below
 *   THE LAB   someone edits the source and      <- their portVendor test, which re-derives the
 *             does not re-emit                     source hash and compares it to the banner
 *
 * ⚠ SO THE PIN IS NOT THE WHOLE GATE AND IS NOT MEANT TO BE. It cannot tell a current copy from a
 * stale one — both are "unchanged since I last looked". What it catches is the one failure this
 * repo can produce on its own, which is an edit made here to a file whose author is elsewhere.
 * The staleness half is unrunnable here: this repo has no TypeScript, no tsconfig and no `three`
 * in node_modules, so it cannot compile the source even if the source were present.
 *
 * ⚠ DERIVED FILE. Do not "fix" a failure here by editing the vendored copy or this constant.
 * Edit `src/appearance/layerDetail.ts` in the Lab and run `node tools/build-port-harness.mjs`,
 * which rewrites the copy and re-stamps its banner. Then bump the pin, in the same commit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDORED = join(root, 'viewer', 'js', 'vendor', 'layer-detail.js');

/* ⚠ Bump ONLY after the Lab's module legitimately changed AND it has been re-emitted here. */
const PINNED_SHA256 = '904abd9df9ecf793a0d4331df0b6ff1879a615a353c330f2823b861b7b912c15';

/* ⚠⚠ HASH THE CANONICAL CONTENT, NEVER THE WORKING-COPY BYTES. Both repos STORE LF and a Windows
   working copy holds CRLF, so hashing raw bytes asks which OS checked the file out rather than
   what the file says — and it answers NO in every fresh clone and in CI while passing locally.
   That already blocked one deploy on a copy that was correct. */
const canonical = (p) => Buffer.from(readFileSync(p, 'utf8').replace(/\r\n/g, '\n'), 'utf8');

test('the vendored layer-detail module is the copy that was reviewed', () => {
  assert.ok(existsSync(VENDORED), 'viewer/js/vendor/layer-detail.js is missing');
  const got = createHash('sha256').update(canonical(VENDORED)).digest('hex');
  assert.equal(got, PINNED_SHA256,
    'the vendored layer-detail copy has been edited here. It is a compiler emit owned by the '
    + 'Filament Material Lab — re-run their tools/build-port-harness.mjs rather than editing it.');
});

test('it declares where it came from, in a form the Lab can check', () => {
  const src = canonical(VENDORED).toString('utf8');
  assert.match(src, /SOURCE OF TRUTH:\s+filament-material-lab\/src\/appearance\/layerDetail\.ts/,
    'the provenance banner is gone — a derived file with no stated author is unmaintainable');
  /* The Lab's half of the gate reads this line and compares it to the live source. A copy with no
     source hash is one the other repo cannot prove current, so the banner is load-bearing rather
     than decorative. */
  assert.match(src, /SOURCE SHA256:\s+[0-9a-f]{64}/,
    'the banner carries no source hash, so the Lab cannot prove this copy is not stale');
});

test('it loads in a browser here: three and nothing else', () => {
  const src = canonical(VENDORED).toString('utf8');
  /* Our import map (viewer/index.html) resolves `three` and `three/addons/`. Any other specifier
     arrives with nothing to resolve it and fails at LOAD — a blank viewer, not a build error. */
  const specs = [...src.matchAll(/^\s*(?:import|export)\s[^\n]*?from\s+['"]([^'"]+)['"]/gm)]
    .map((m) => m[1]);
  assert.ok(specs.length > 0, 'no imports at all — the emit is not what we think it is');
  const foreign = specs.filter((s) => s !== 'three' && !s.startsWith('three/addons/'));
  assert.deepEqual(foreign, [],
    `this module imports specifiers our import map cannot resolve: ${foreign.join(', ')}`);
});

test('it exports the entry point the viewer will call', () => {
  const src = canonical(VENDORED).toString('utf8');
  assert.match(src, /export function applyLayerDetail\b/,
    'applyLayerDetail is gone — the seam in main.js has nothing to call');
});

/* ⚠ AND THE DEPLOY GUARD'S OWN RULE, APPLIED HERE RATHER THAN AT DEPLOY TIME. This file is 113 KB
   of heavily commented shader code. `pages.yml` scans raw text for relative module specifiers and
   fails the deploy on any that is not version-stamped — including one written inside a PROSE
   COMMENT, which in a file this size is a live hazard rather than a theoretical one. Catching it
   in the suite turns a red deploy into a red test. */
test('it carries no relative module specifier for the deploy guard to reject', () => {
  const src = canonical(VENDORED).toString('utf8');
  const SPEC = /(?:\bfrom\s*|\bimport\s*\(?\s*|\bexport\s+\*\s+from\s*)(['"])(\.[^'"]*)\1/g;
  const bad = [...src.matchAll(SPEC)]
    .map((m) => m[2])
    .filter((s) => (s.endsWith('.js') || s.includes('.js?')) && !/[?&]v=/.test(s));
  assert.deepEqual(bad, [],
    `unstamped relative specifiers would fail the Pages deploy: ${bad.join(', ')}`);
});
