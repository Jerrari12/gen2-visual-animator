// Feedback & support: viewer/js/vendor/modulith-feedback.js is the planner's js/modulith-feedback.js byte for byte (the
// planner owns it), so every MODULITH tool shows the same three kinds and the same email wording (Astra 2026-10-10).
// Re-vendor: copy the planner's file, update PIN. The deploy stamps its script tag (pages.yml); a missing sed line fails the
// module-graph guard there and this test here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const PIN = 'b5e41b406e55cfde4b688a5fa2dea2e73c59bb954d78a98c1aedb09ff2907c32';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url));
const sha = (b) => createHash('sha256').update(b).digest('hex');

test('the vendored feedback dialog is the pinned copy', () => {
  assert.equal(sha(read('viewer/js/vendor/modulith-feedback.js')), PIN);
});

test("it is the planner checkout's file byte for byte (GEN2_PLANNER_ROOT)", { skip: !process.env.GEN2_PLANNER_ROOT && 'set GEN2_PLANNER_ROOT to compare' }, () => {
  const p = process.env.GEN2_PLANNER_ROOT + '/js/modulith-feedback.js';
  assert.ok(existsSync(p), p);
  assert.equal(sha(readFileSync(p)), sha(read('viewer/js/vendor/modulith-feedback.js')));
});

test('the standalone viewer offers it (topbar + the outro) and the deploy stamps its script tag', () => {
  const html = read('viewer/index.html').toString('utf8');
  assert.match(html, /<script src="js\/vendor\/modulith-feedback\.js"><\/script>/);
  assert.match(html, /<header id="topbar">[\s\S]*?<button id="btn-feedback"[^>]*>Feedback<\/button>[\s\S]*?<\/header>/);
  assert.match(html, /<a id="outro-feedback"[^>]*>Feedback &amp; support<\/a>/);
  const yml = read('.github/workflows/pages.yml').toString('utf8');
  assert.match(yml, /sed -i "s\|js\/vendor\/modulith-feedback\.js\|js\/vendor\/modulith-feedback\.js\?v=\\|" viewer\/index\.html/);
  const main = read('viewer/js/main.js').toString('utf8');
  assert.match(main, /F\.open\(\{ tool: '3D Build Studio'/);
});
