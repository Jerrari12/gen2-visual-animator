/* The cutover forwarding script at the top of viewer/index.html (branch cutover-redirect): what the old address carries to
   the Assemble workspace of the merged planner, and the addresses this viewer keeps serving. The script runs only on
   gen2build.jerrari3d.com, so here its function is taken from the page text and called directly. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../viewer/index.html', import.meta.url), 'utf8');
const m = /<!-- CUTOVER:[\s\S]*?<script>([\s\S]*?)<\/script>/.exec(html);
assert.ok(m, 'the cutover script is the first script of the page');
const forward = (() => {
  const w = {};
  new Function('window', 'location', m[1])(w, undefined);
  return w.__gen2CutoverForward;
})();
const loc = (search = '', hash = '') => ({ search, hash });
const A = 'https://planner.modulith.systems/?ws=assemble';

test('a kit, a planner hand-off, the site ref and a store listing go along to Assemble', () => {
  assert.equal(forward(loc('?build=185-tabletop-2w2h')), A + '&build=185-tabletop-2w2h');
  assert.equal(forward(loc('', '#build=AAA')), A + '#build=AAA');
  // the site's kit pages linked here with &ref=modulith-site, which GoatCounter reads as the referrer
  assert.equal(forward(loc('?build=185-tabletop-2w2h&ref=modulith-site')), A + '&build=185-tabletop-2w2h&ref=modulith-site');
  // ?from=<store>: the link printed in a listing's description; the merged planner counts it and seeds the store from it
  assert.equal(forward(loc('?from=makerworld&build=240-tabletop-3w2h')), A + '&build=240-tabletop-3w2h&from=makerworld');
  assert.equal(forward(loc('?from=cults')), A + '&from=cults');
  // the bare address, and anything else in the query, lands on Assemble alone
  assert.equal(forward(loc('')), A);
  assert.equal(forward(loc('?debug=1&tier=fast&kit=edgelabel-test')), A);
});

test('the part preview, the old planner dock and the benchmarks stay on this viewer', () => {
  assert.equal(forward(loc('?part=185-case-2w-1h&mode=preview')), null, 'the site iframes the part preview');
  assert.equal(forward(loc('?part=185-case-2w-1h&mode=preview&plate=256x256&rid=r1')), null);
  assert.equal(forward(loc('?embed=1', '#build=AAA')), null, 'the old planner docks this viewer');
  assert.equal(forward(loc('?bench=orbit')), null);
  assert.equal(forward(loc('?bench=settle&tier=high')), null);
});

test('only on the viewer host: checkouts and the test suites open this viewer', () => {
  assert.ok(/location\.hostname !== 'gen2build\.jerrari3d\.com'\) return;/.test(m[1]), 'the forward is guarded by the host');
  assert.ok(/location\.replace\(to\)/.test(m[1]), 'and replaces the page, so Back does not return to the old address');
});
