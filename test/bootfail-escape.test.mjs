/* THE BOOT-FAILURE MESSAGE IS TEXT (2026-10-15).

   bootFail(html, log) writes `html` into the loading overlay's innerHTML. The generator's errors quote a share link's
   own fields (`"${build.mount}" mounts aren't supported yet`), so a crafted #build= link ran script on this origin:
   shown on loopback against this code, with a mount of `<img src=x onerror=...>`. The planner carried the same code and
   was fixed the same day (modulith-planner e49f7a5).

   This pins the fix at the source: the helper exists, and every dynamic part a bootFail message carries goes through it.
   A new bootFail call that splices in something unescaped should be caught by the last check. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(fileURLToPath(new URL('../viewer/js/main.js', import.meta.url)), 'utf8');

test('bootFail has an HTML escape beside it', () => {
  assert.match(src, /const escHtml = \(s\) => String\(s\)\.replace\(\/\[&<>"'\]\/g/);
});

test('the dynamic parts of every bootFail message are escaped', () => {
  assert.match(src, /gen\.errors\.map\(e => '• ' \+ escHtml\(e\)\)/, 'the #build= and benchmark errors');
  assert.doesNotMatch(src, /gen\.errors\.map\(e => '• ' \+ e\)/, 'no raw generator error');
  assert.match(src, /<br><br>• ' \+ escHtml\(res\.fail\.message\)/, 'the part preview message');
  assert.match(src, /escHtml\(mGen\.errors\.join\(' · '\)\)/, 'an official kit\'s generate errors');
  assert.match(src, /<br><br>• ' \+ escHtml\(\(e && e\.message\) \|\| e\)/, 'the mount failure');
});

test('no bootFail call splices in a value outside the escape', () => {
  // each call's first argument, up to the comma before its log argument: any `' + name` that is not escHtml(...) or a
  // known static markup constant is a new unescaped splice
  const calls = [...src.matchAll(/bootFail\(([^;]*?),\s*\n?\s*['`"]/g)].map((m) => m[1]);
  assert.ok(calls.length >= 6, `found ${calls.length} bootFail calls`);
  // a template literal splices with ${...}, which the `+ name` scan below cannot see (Terra 01a141dc): each one must be escaped
  for (const m of src.matchAll(/bootFail\(\s*`([^`]*)`/g)) {
    for (const i of m[1].matchAll(/\$\{([^}]*)\}/g)) assert.match(i[1], /^\s*escHtml\(/, `bootFail's template splices in \${${i[1]}} without escHtml`);
  }
  for (const c of calls) {
    for (const m of c.matchAll(/\+\s*([A-Za-z_][\w.]*)/g)) {
      const name = m[1];
      if (['escHtml', 'GALLERY', 'msg'].includes(name)) continue;   // msg: kitFail's, built from static words and escHtml(...)
      if (name.startsWith('gen.errors.map') || name.startsWith('res.fail')) continue;   // checked above
      assert.fail(`bootFail splices in "${name}" without escHtml: ${c.slice(0, 120)}`);
    }
  }
});
