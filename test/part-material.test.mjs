/* THE PART FINISH, AND THE FACT THAT ONLY ONE FILE STATES IT.
 *
 * `partMaterialSpec` was lifted out of `newPartMaterial` on 2026-09-05 so the
 * Filament Material Lab can render the surface this viewer renders. Its third
 * staging pane is "what Build Studio shows today", and that pane is only worth
 * looking at if it is not a replica someone typed a second time.
 *
 * So the numbers are asserted here, and `main.js` is asserted NOT to contain
 * them - which is the half that actually keeps the contract, because a copy
 * left behind would keep working and keep drifting.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { partMaterialSpec, baseType, PART_MATERIAL_CONTRACT_VERSION } from '../viewer/js/part-material.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/* ⚠ NORMALISED, because a Windows working copy holds CRLF and every `\n` anchor
   below would silently miss - the same trap the vendor gates hash around. */
const main = readFileSync(join(root, 'viewer', 'js', 'main.js'), 'utf8').replace(/\r\n/g, '\n');

test('the contract version is pinned - the Lab refuses a mismatch', () => {
  assert.equal(PART_MATERIAL_CONTRACT_VERSION, 1);
});

test('an ordinary printed part is 0.55 / 0.05 standard', () => {
  /* Every case, drawer, shelf and handle in the viewer. This is the surface
     roadmap item 1 proposes to replace, so it is the one that must not move by
     accident. */
  for (const key of ['Case', 'Drawer', 'ShelfInsert', 'Handle', 'Case:BODY']) {
    assert.deepEqual(partMaterialSpec(key), { kind: 'standard', roughness: 0.55, metalness: 0.05 }, key);
  }
});

test('the bought adhesive foot stays matte at 0.72', () => {
  assert.deepEqual(partMaterialSpec('FootAdhesive'),
    { kind: 'standard', roughness: 0.72, metalness: 0 });
});

test('the holographic plate transfers a polished finish, and only where it touched', () => {
  const contact = partMaterialSpec('Faceplate', { holographicPlate: true, plateContact: true });
  assert.deepEqual(contact, {
    kind: 'physical', metalness: 0, roughness: 0.14,
    clearcoat: 1.0, clearcoatRoughness: 0.11, envMapIntensity: 1.15, holographic: true,
  });

  const away = partMaterialSpec('Faceplate:GRIP', { holographicPlate: true, plateContact: false });
  assert.equal(away.roughness, 0.2);
  assert.equal(away.clearcoat, 0.8);
  assert.equal(away.clearcoatRoughness, 0.14);
});

test('⚔ the plate finish reaches faceplates only, and only when a plate is active', () => {
  /* Two ways this has to fail closed. A non-faceplate on a holographic plate is
     an ordinary part; a faceplate with no plate active is an ordinary part. */
  assert.equal(partMaterialSpec('Case', { holographicPlate: true, plateContact: true }).kind, 'standard');
  assert.equal(partMaterialSpec('Faceplate', { holographicPlate: false, plateContact: true }).kind, 'standard');
  assert.equal(partMaterialSpec('Faceplate').kind, 'standard');
});

test('a zone key resolves to its base type', () => {
  assert.equal(baseType('Faceplate:GRIP ACCENT'), 'Faceplate');
  assert.equal(baseType('Case'), 'Case');
});

test('⚔ main.js no longer states the finish numbers itself', () => {
  /* THE HALF THAT KEEPS THE CONTRACT. Extracting a module and leaving the old
     literals behind produces two authors and no error - the copy keeps working
     until someone changes one of them. `newPartMaterial` must read the spec.  */
  const fn = main.slice(main.indexOf('function newPartMaterial'));
  const body = fn.slice(0, fn.indexOf('\n}\n') + 2);

  assert.ok(/partMaterialSpec\(/.test(body), 'newPartMaterial does not call partMaterialSpec');
  for (const n of ['0.55', '0.05', '0.72', '0.14', '1.15', '0.8']) {
    assert.ok(!body.includes(n),
      `newPartMaterial still hard-codes ${n} - the spec is supposed to be its only source`);
  }
});
