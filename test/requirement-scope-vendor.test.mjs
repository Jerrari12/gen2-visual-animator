/* THE VENDORED REQUIREMENT-SCOPE CONTRACT — drift gate + behaviour.
 *
 * `viewer/js/vendor/requirement-scope.js` is a BYTE-FOR-BYTE copy of
 * `gen2-planner-main/js/requirement-scope.js`. The planner owns the policy:
 * what core / option / enhancement / basis / reasons MEAN has exactly one
 * author. This app still computes its own geometry, instances and quantities
 * and passes those resolved facts in.
 *
 * Two engines that agree only because a parity test says so will eventually
 * disagree, and the failure looks like a data bug rather than a policy split.
 * So this file gates on the copy being identical, not on the answers matching.
 *
 * ⚠ THE PLANNER LIVES OUTSIDE THIS REPO, so byte equality can only be checked
 * when it is present. When it is, a mismatch is a hard failure. When it is
 * not - a fresh clone, CI - the pinned hash below still catches a viewer-side
 * edit, which is the drift this repo can actually cause.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDORED = join(root, 'viewer', 'js', 'vendor', 'requirement-scope.js');
/* The planner is a sibling checkout. Not required for this suite to pass. */
const UPSTREAM = join(root, '..', 'GEN2 Planner', 'gen2-planner-main', 'js', 'requirement-scope.js');

/* ⚠ Bump ONLY after the planner's module legitimately changed AND you have
   re-vendored it. If this fails, do NOT "fix" it by editing the vendored copy
   or this constant - re-copy from the planner, which is the source of truth.
   This is the half of the gate that works on a fresh clone or in CI, where no
   planner checkout exists: it catches an edit made on THIS side, which is the
   drift this repo can actually cause. */
const PINNED_SHA256 = '9d50b076a030fd7b6930c8cb7e0e2d4d8d96e754a11db3a41727de259481a2ef';

/* ⚠⚠ HASH THE CANONICAL CONTENT, NEVER THE WORKING-COPY BYTES.
   This repo and the planner both STORE LF; a Windows working copy holds
   CRLF. Hashing raw bytes therefore asked "was this file checked out on
   the same OS as whoever computed the pin", which is not the question -
   and it answered NO in every fresh clone and in CI while passing locally.
   That blocked a viewer deploy on a copy that was actually correct.
   Normalising does not weaken the gate: a real edit changes content. */
const canonical = (p) => Buffer.from(readFileSync(p, 'utf8').replace(/\r\n/g, '\n'), 'utf8');
const sha = (p) => createHash('sha256').update(canonical(p)).digest('hex');

test('the vendored copy exists and is loadable', () => {
  assert.ok(existsSync(VENDORED), 'viewer/js/vendor/requirement-scope.js is missing');
  const src = readFileSync(VENDORED, 'utf8');
  assert.ok(/SOURCE OF TRUTH: gen2-planner-main\/js\/requirement-scope\.js/.test(src),
    'the provenance marker is gone - this copy can no longer be traced to its owner');
  assert.ok(/CONTRACT VERSION: 2/.test(src), 'the contract version marker is gone');
});

test('⚠ DRIFT GATE 1/2: the vendored copy matches its pinned hash', () => {
  /* Works with no planner checkout, so it is the gate CI actually runs. */
  assert.equal(sha(VENDORED), PINNED_SHA256,
    'viewer/js/vendor/requirement-scope.js was edited on this side.\n' +
    '  This file is OWNED BY THE PLANNER. Change it there, re-vendor, then\n' +
    '  update PINNED_SHA256 - in that order.');
});

test('⚠ DRIFT GATE 2/2: the vendored copy is identical to the planner', (t) => {
  if (!existsSync(UPSTREAM)) {
    t.skip('planner checkout not present - the pinned hash below still guards this side');
    return;
  }
  const a = canonical(UPSTREAM), b = canonical(VENDORED);
  assert.equal(sha(UPSTREAM), sha(VENDORED),
    `vendored copy has DRIFTED from the planner.\n` +
    `  planner : ${a.length} bytes  ${sha(UPSTREAM).slice(0, 16)}\n` +
    `  vendored: ${b.length} bytes  ${sha(VENDORED).slice(0, 16)}\n` +
    `  Re-copy from the planner - never edit the vendored file.`);
});

/* ---------- the contract behaves, in THIS runtime ---------- */

/* Load it exactly as the BROWSER does: evaluate the classic script and read
   the global it attaches. ⚠ Not require() - this package is "type": "module",
   so node treats the .js as ESM, the UMD CommonJS branch never runs, and the
   namespace comes back empty. Indirect eval also keeps this faithful to the
   real load path rather than testing a code path the app never takes. */
let cached = null;
async function load() {
  if (!cached) {
    (0, eval)(readFileSync(VENDORED, 'utf8'));
    cached = globalThis.GEN2_REQ;
    assert.ok(cached, 'the vendored script did not attach GEN2_REQ to the global');
  }
  return cached;
}

test('the classifiers produce the shapes the viewer will emit', async () => {
  const REQ = await load();
  assert.equal(REQ.CONTRACT_VERSION, 2);
  assert.deepEqual(REQ.SCOPES, ['core', 'option', 'enhancement']);
  assert.deepEqual(REQ.core('mount.install'), { scope: 'core', obligationId: 'mount.install' });
  assert.deepEqual(REQ.option('drawer.closure', 'drawer.closure.magnet'),
    { scope: 'option', obligationId: 'drawer.closure', optionId: 'drawer.closure.magnet' });
  assert.deepEqual(REQ.basis('mount', 'wall', 'build'),
    { axis: 'mount', choice: 'wall', subjectType: 'build' });
  assert.equal(REQ.basis('drawer.closure', 'magnet', 'unit', 2).selectedCount, 2);
});

test('the four totals are computed by the module, not by callers', async () => {
  const REQ = await load();
  const rows = [
    { name: 'case', qty: 4, requirement: REQ.core('structure') },
    { name: 'magnets', qty: 4, requirement: REQ.option('drawer.closure', 'drawer.closure.magnet') },
    { name: 'stoppers', qty: 4, requirement: REQ.enhancement('drawer.retention') },
  ];
  assert.deepEqual(REQ.minimumRows(rows).map((r) => r.name), ['case'],
    'the minimum build is core only');
  assert.deepEqual(REQ.selectedPlanRows(rows).map((r) => r.name), ['case', 'magnets'],
    'the selected plan is core PLUS the options actually chosen');
  assert.deepEqual(REQ.enhancementRows(rows).map((r) => r.name), ['stoppers'],
    'enhancements stay separately disclosed');
});

test('⚠ the viewer\'s "required" is NOT "core"', async () => {
  const REQ = await load();
  const magnets = { name: 'magnets', requirement: REQ.option('drawer.closure', 'drawer.closure.magnet') };
  /* Assembly instructions must never tell someone to skip the magnets they
     chose, so required = scope !== enhancement, which is selectedPlanRows. */
  assert.equal(REQ.minimumRows([magnets]).length, 0, 'magnets are not in the minimum build');
  assert.equal(REQ.selectedPlanRows([magnets]).length, 1, 'but they ARE required to assemble this plan');
});

test('rows say WHY they are required, not just that they are', async () => {
  const REQ = await load();
  const labels = { 'drawer.closure.magnet': 'magnetic closure', 'mount:under-table': 'under-table' };
  const magnets = { requirement: REQ.option('drawer.closure', 'drawer.closure.magnet') };
  assert.equal(REQ.explain(magnets, labels), 'Required with magnetic closure',
    'a generic "Required" loses the reason the row exists');
  const rail = { requirement: REQ.core('mount.install'), basis: REQ.basis('mount', 'under-table', 'build') };
  assert.equal(REQ.explain(rail, labels), 'Required for under-table builds');
  assert.equal(REQ.explain({ requirement: REQ.enhancement('top.rigidity') }, labels), 'Optional');
});

test('a multi-cause row explains every option that caused it', async () => {
  const REQ = await load();
  const resolved = REQ.resolveReasons([
    Object.assign(REQ.core('top.enclosure'), { basis: REQ.basis('cover.layout', 'staggered', 'build') }),
    Object.assign(REQ.option('drawer.stopper.seat', 'drawer.stoppers'), { basis: REQ.basis('drawer.stoppers', 'on', 'build') }),
  ]);
  assert.equal(resolved.requirement.scope, 'core', 'the strongest reason wins the row');
  assert.equal(resolved.reasons.length, 2, 'and neither explanation is lost');
  assert.equal(REQ.explain(resolved, { 'drawer.stoppers': 'drawer stoppers' }),
    'Required with drawer stoppers', 'the option cause is still surfaced on a core row');
});

test('validation fails closed on the shape of the original defect', async () => {
  const REQ = await load();
  assert.deepEqual(REQ.validate({ name: 'r', requirement: REQ.core('o') }), []);
  assert.ok(REQ.validate({ name: 'r', requirement: { scope: 'option', obligationId: 'o' } }).length,
    'an option with no optionId cannot be routed to a column');
  assert.ok(REQ.validate({ name: 'r', requirement: { scope: 'core', obligationId: 'o', optionId: 'x' } }).length,
    'a core row is not caused by an option');
});
