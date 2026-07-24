/* Golden tests for OFFICIAL kits (viewer/builds/<id>.json).

   These files back PERMANENT links — printed Printables descriptions and QR
   codes point at ?build=<id> forever. The tests are the durability guarantee:
   any change to generate.js (or the build format) that breaks or silently
   ALTERS an official kit's generated instructions fails here, before it can
   deploy over a printed link.

   generateManifest is dependency-free pure JS, so this runs in plain node —
   no browser, no jsdom, no packages.

   Run:              npm test
   Intentional change (reviewed a diff and mean it):
                     UPDATE_GOLDEN=1 npm test   → rewrites test/golden/
*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buildsDir = join(root, 'viewer', 'builds');
const goldenDir = join(root, 'test', 'golden');
const { generateManifest, migrateOfficialBuild } = await import(
  new URL('file://' + join(root, 'viewer', 'js', 'generate.js').replace(/\\/g, '/')).href
);

const UPDATE = !!process.env.UPDATE_GOLDEN;
const kitFiles = readdirSync(buildsDir).filter(f => f.endsWith('.json') && f !== 'index.json');
const readJson = p => JSON.parse(readFileSync(p, 'utf8'));

test('at least one official kit exists', () => {
  assert.ok(kitFiles.length > 0, 'viewer/builds/ has no kit files');
});

test('gallery index rows all resolve to kit files', () => {
  const index = readJson(join(buildsDir, 'index.json'));
  assert.ok(Array.isArray(index), 'builds/index.json must be an array');
  for (const row of index) {
    assert.equal(typeof row.id, 'string', 'index row missing id');
    assert.ok(kitFiles.includes(row.id + '.json'),
      `index.json lists "${row.id}" but builds/${row.id}.json does not exist — a gallery card would 404`);
    assert.equal(typeof row.title, 'string', `index row ${row.id} missing title`);
  }
});

for (const f of kitFiles) {
  const id = f.replace(/\.json$/, '');

  test(`official kit ${id}: wrapper + generate + golden`, () => {
    const file = readJson(join(buildsDir, f));

    // ---- wrapper shape (what the viewer's loader checks, and then some) ----
    assert.equal(file.gen2OfficialBuild, 1, 'gen2OfficialBuild must be 1');
    assert.equal(file.id, id, 'file.id must match the filename (the id IS the permanent link)');
    assert.match(id, /^[a-z0-9][a-z0-9-]*$/, 'id must be a clean slug');
    assert.equal(typeof file.title, 'string');
    assert.ok(file.title.trim().length, 'title must not be empty');
    assert.equal(typeof file.buildVersion, 'number');

    // ---- migrate + generate: the exact pipeline the viewer boots through ----
    const build = migrateOfficialBuild(file.build, file.buildVersion);
    assert.ok(build, `buildVersion ${file.buildVersion} is newer than migrateOfficialBuild knows — add a migration case`);
    const gen = generateManifest(build);
    assert.ok(gen.manifest,
      'generateManifest FAILED on a committed official kit:\n  • ' + (gen.errors || []).join('\n  • '));

    // ---- golden snapshot: the generated instructions must not silently drift ----
    const snap = JSON.stringify(gen.manifest, null, 1);
    const goldenPath = join(goldenDir, id + '.manifest.json');
    if (UPDATE || !existsSync(goldenPath)) {
      mkdirSync(goldenDir, { recursive: true });
      writeFileSync(goldenPath, snap);
      console.log(`  golden ${UPDATE ? 'updated' : 'created'}: test/golden/${id}.manifest.json`);
      return;
    }
    const golden = readFileSync(goldenPath, 'utf8');
    assert.equal(snap, golden,
      `Generated instructions for official kit "${id}" CHANGED. If this is intentional ` +
      `(reviewed the diff, kit still assembles correctly), refresh with: UPDATE_GOLDEN=1 npm test`);
  });
}
