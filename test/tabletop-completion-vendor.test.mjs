/* THE VENDORED TABLETOP-COMPLETION CONTRACT - drift gate + the behaviour this
 * app leans on.
 *
 * `viewer/js/vendor/tabletop-completion.js` is a BYTE-FOR-BYTE copy of
 * `gen2-planner-main/js/tabletop-completion.js`. The planner's board hatches
 * the cells this returns; this viewer ghosts them. One implementation, or the
 * two tools drift and the drift reads as a bug in whichever one you look at.
 *
 * A lighter chain than requirement-scope's (no receipt, no sync tool): both
 * repos pin the sha256, and this test additionally checks byte equality
 * against the planner source when that checkout is present (a sibling, or
 * GEN2_PLANNER_ROOT). A mismatch there is a hard failure; its absence (a
 * fresh clone, CI) leaves the pin to catch a viewer-side edit, which is the
 * drift this repo can actually cause.
 *
 * ⚠ Bump the pin ONLY after the planner's file legitimately changed and was
 * re-copied here; the planner's own test pins the same value.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDORED = join(root, 'viewer', 'js', 'vendor', 'tabletop-completion.js');
const UPSTREAM = process.env.GEN2_PLANNER_ROOT
  ? join(process.env.GEN2_PLANNER_ROOT, 'js', 'tabletop-completion.js')
  : join(root, '..', 'GEN2 Planner', 'gen2-planner-main', 'js', 'tabletop-completion.js');
const PINNED_SHA256 = 'b65de204cd8c900bd2f2247508eda2eb68395bf9eff002db5779a433d456a65d';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

test('the vendored copy matches its pin', () => {
  assert.ok(existsSync(VENDORED), 'viewer/js/vendor/tabletop-completion.js is missing');
  const actual = sha(VENDORED);
  assert.equal(actual, PINNED_SHA256,
    `vendored tabletop-completion.js changed (sha256 ${actual.slice(0, 16)}…).\n` +
    '  Edit the PLANNER source, copy it here, then bump PINNED_SHA256 in both repos.');
});

test('the vendored copy is byte-identical to the planner source (when the planner is checked out)', (t) => {
  if (!existsSync(UPSTREAM)) { t.skip('planner checkout not present - pin-only'); return; }
  assert.equal(readFileSync(VENDORED, 'utf8'), readFileSync(UPSTREAM, 'utf8'),
    'viewer/js/vendor/tabletop-completion.js differs from the planner source - re-copy it');
});

test('the contract loads in node the way generate.js loads it, and answers the shared fixture', async () => {
  (0, eval)(readFileSync(VENDORED, 'utf8'));
  const T = globalThis.GEN2_TABLETOP;
  assert.ok(T && typeof T.completion === 'function');
  assert.equal(T.CONTRACT_VERSION, 1);
  // the planner's starter with the right column still one row short
  const r = T.completion([{ x: 2, y: 4, w: 1, hh: 2 }, { x: 2, y: 6, w: 1, hh: 2 }, { x: 3, y: 6, w: 1, hh: 2 }]);
  assert.equal(r.complete, false);
  assert.deepEqual(r.columns, [{ x: 3, y0: 4, y1: 6 }]);
  assert.equal(r.areas.length, 1);
});
