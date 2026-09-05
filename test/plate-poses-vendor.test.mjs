/* THE VENDORED PLATE-POSE REGISTRY — drift gate.
 *
 * `data/plate-poses.json` is 511 confirmed print poses, and the Filament
 * Material Lab holds a byte-for-byte copy at `public/data/plate-poses.json`
 * because it renders the same parts in the same poses. As of 2026-09-05 the two
 * copies were already identical - 416,443 bytes, sha256 b0a2a314… - with NO
 * gate on either side. That is a fork waiting for the first pose correction.
 *
 * THIS REPO OWNS IT, and the file says so itself rather than by convention:
 *   sourceRegistryRevision  "gen2-viewer@065cee2"
 *   entries[].asset.path    "viewer/parts/59/59-1W-05H_Case.lib.glb"
 * The paths are relative to THIS repo and the revision names THIS repo, so the
 * registry is an export of the viewer's own pose data. The Lab consumes it.
 *
 * ⚠ OWNERSHIP IS INVERTED FROM `requirement-scope-vendor.test.mjs`, SO THE TWO
 * HALVES OF THE GATE LIVE IN DIFFERENT REPOS THAN THEY DO THERE.
 *
 * That test guards a file this repo CONSUMES, so both halves belong here: a
 * pinned hash catches an edit made on this side, and a cross-repo compare
 * catches drift from the owner. Here we are the OWNER. Pinning our own file
 * would fire on every legitimate regeneration of the registry, which is not
 * drift - it is the point of owning it.
 *
 * So each repo gates the drift it can actually cause, which is the same
 * reasoning that test states, applied the other way round:
 *
 *   HERE      regenerate the registry and forget to re-vendor  <- this file
 *   THE LAB   edit the vendored copy instead of asking for it  <- a pinned
 *             hash on the Lab's side, landing with its vendoring step
 *
 * ⚠ Which means THIS half does not run in CI, because the Lab is a private
 * sibling checkout that is usually absent. It is still the half worth having
 * here: it fires at the moment the drift is created, on the machine that
 * created it, which is when it is cheapest to fix.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(root, 'data', 'plate-poses.json');
/* The Lab is a sibling checkout, and private. Not required for this suite. */
const VENDORED = join(root, '..', 'Filament Material Lab', 'public', 'data', 'plate-poses.json');

/* ⚠⚠ HASH THE CANONICAL CONTENT, NEVER THE WORKING-COPY BYTES.
   Lifted verbatim from requirement-scope-vendor.test.mjs, and for a reason it
   already paid for: both repos STORE LF, a Windows working copy holds CRLF, so
   hashing raw bytes asks "were these two checked out on the same OS" instead of
   "do they say the same thing" - and answers NO in CI on a correct pair. It is
   not a weaker gate: a real edit changes content. */
const canonical = (p) => Buffer.from(readFileSync(p, 'utf8').replace(/\r\n/g, '\n'), 'utf8');
const sha = (p) => createHash('sha256').update(canonical(p)).digest('hex');

test('the registry is present, parses, and still names its own source', () => {
  assert.ok(existsSync(SOURCE), 'data/plate-poses.json is missing');
  const reg = JSON.parse(readFileSync(SOURCE, 'utf8'));

  assert.equal(reg.contractVersion, '1.0.0', 'contract version changed - the Lab reads this');
  assert.match(reg.sourceRegistryRevision, /^gen2-viewer@[0-9a-f]{7,40}$/,
    'sourceRegistryRevision no longer names this repo and a commit');
  assert.ok(Number.isFinite(Date.parse(reg.exportedAt)), 'exportedAt is not a date');

  assert.ok(Array.isArray(reg.entries) && reg.entries.length > 0, 'no entries');
  /* ⚠ NOT PINNED TO 511. Parts get added; a count assertion would fail on every
     legitimate export and teach whoever hits it to edit the number rather than
     read the diff. What must not silently change is the SHAPE the Lab reads. */
  for (const e of reg.entries) {
    const where = e.partId ?? '(no partId)';
    assert.equal(typeof e.partId, 'string', `${where}: partId`);
    assert.match(e.asset?.path ?? '', /^viewer\/parts\//,
      `${where}: asset.path should be relative to THIS repo - that is what makes us the owner`);
    assert.match(e.asset?.sha256 ?? '', /^[0-9a-f]{64}$/, `${where}: asset.sha256`);
    assert.ok(Array.isArray(e.rotation), `${where}: rotation`);
    assert.equal(e.convention?.eulerOrder, 'XYZ', `${where}: eulerOrder`);
    assert.equal(e.convention?.angleUnit, 'degree', `${where}: angleUnit`);
  }
});

test('⚠ DRIFT GATE: the Lab\'s vendored copy is identical to ours', (t) => {
  if (!existsSync(VENDORED)) {
    t.skip('Filament Material Lab checkout not present - nothing to compare against');
    return;
  }
  const ours = sha(SOURCE);
  const theirs = sha(VENDORED);
  assert.equal(theirs, ours,
    'the Lab\'s plate-poses.json has DRIFTED from this repo\'s.\n' +
    `  here    : ${statSync(SOURCE).size} bytes  ${ours.slice(0, 16)}\n` +
    `  the Lab : ${statSync(VENDORED).size} bytes  ${theirs.slice(0, 16)}\n` +
    '  This registry is OWNED HERE. If the poses changed, re-export here and\n' +
    '  re-vendor into the Lab - never edit the Lab\'s copy to match.');
});
