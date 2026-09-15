/* THE ORBIT COAST STOP - main.js updateOrbit(), run against three r185's REAL OrbitControls.
 *
 * With damping on, a released drag keeps turning the camera by a shrinking amount every update, and it takes ~600 updates
 * for that motion to round away to nothing. Everything that waits for a still camera - Very High's settled image, and
 * with it the powder grain and the visible layer lines - waited with it: 5.4 s after release at 120 Hz, about a minute
 * at 12 fps (MEASURED with real pointer input, 2026-09-13/14). updateOrbit drops the coast once one update's own motion
 * is under a twentieth of a pixel.
 *
 * ⚠ THESE TESTS CALL THE FUNCTION. main.js cannot be imported under node (it builds a WebGL renderer at module scope), so
 * updateOrbit and its two declarations are extracted by balanced scan and evaluated against a real PerspectiveCamera and
 * a real OrbitControls with no DOM element. A text match would pass against a stop that never fires.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = (...p) => pathToFileURL(join(root, ...p)).href;
const THREE_URL = url('viewer', 'vendor', 'three', 'three.module.js');
register('data:text/javascript,' + encodeURIComponent(
  `export async function resolve(s, c, n) { return s === 'three' ? { url: ${JSON.stringify(THREE_URL)}, shortCircuit: true } : n(s, c); }`));
const THREE = await import(THREE_URL);
const { OrbitControls } = await import(url('viewer', 'vendor', 'three', 'addons', 'controls', 'OrbitControls.js'));

// ⚠ LF, whatever the checkout: a Windows clone has CRLF, and a multi-line mutation anchor would then match nothing
const src = readFileSync(join(root, 'viewer', 'js', 'main.js'), 'utf8').replace(/\r\n/g, '\n');

/* from `needle` to the end of its statement (`;` at depth 0) or, for a function, its closing brace */
function takeAt(needle, { fn = false } = {}) {
  const start = src.indexOf(needle);
  assert.ok(start >= 0, `could not find "${needle}" in main.js - if it was renamed, update this test rather than deleting it`);
  let depth = 0, opened = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if ('([{'.includes(c)) { depth++; if (c === '{') opened = true; }
    else if (')]}'.includes(c)) { depth--; if (fn && opened && depth === 0 && c === '}') return src.slice(start, i + 1); }
    else if (!fn && c === ';' && depth === 0) return src.slice(start, i + 1);
  }
  assert.fail(`unterminated "${needle}"`);
}
const CODE = [takeAt('const COAST_STILL_PX ='), takeAt('const _coastPos ='), takeAt('function updateOrbit()', { fn: true })].join('\n');

const HEIGHT = 1600;
function rig() {
  const camera = new THREE.PerspectiveCamera(40, 2, 1, 8000);
  camera.position.set(0, 220, 620);
  const controls = new OrbitControls(camera);           // no DOM: update() is all we drive
  controls.enableDamping = true;
  controls.target.set(0, 40, 0);
  controls.update();
  const renderer = { domElement: { height: HEIGHT } };
  const updateOrbit = new Function('THREE', 'camera', 'controls', 'renderer', CODE + '\nreturn updateOrbit;')(THREE, camera, controls, renderer);
  return { camera, controls, updateOrbit };
}
const pxPerRad = (r) => {
  const dist = r.camera.position.distanceTo(r.controls.target);
  return dist / (2 * dist * Math.tan(r.camera.fov * Math.PI / 360) / HEIGHT);
};
/* updates until the camera is EXACTLY where the previous update left it (the Very High accumulator's own test) */
function runToStop(r, step, cap = 5000) {
  const p = new THREE.Vector3(), q = new THREE.Quaternion();
  for (let i = 1; i <= cap; i++) {
    p.copy(r.camera.position); q.copy(r.camera.quaternion);
    step();
    if (r.camera.position.equals(p) && r.camera.quaternion.equals(q)) return i;
  }
  return cap;
}

test('the render loop drives the camera through updateOrbit, not a bare controls.update()', () => {
  const loop = takeAt('function renderLoop(now)', { fn: true });
  assert.ok(loop.includes('else updateOrbit();'), 'renderLoop no longer calls updateOrbit - the coast is back');
  assert.ok(!/else controls\.update\(\);/.test(loop), 'renderLoop calls controls.update() directly again');
});

test('a released flick stops in a fraction of the updates, within a pixel of where the full coast ends', () => {
  const plain = rig(), fixed = rig();
  plain.controls._sphericalDelta.theta = fixed.controls._sphericalDelta.theta = 0.6;   // a fast drag's remaining turn
  const nPlain = runToStop(plain, () => plain.controls.update());
  const nFixed = runToStop(fixed, () => fixed.updateOrbit());
  assert.ok(nPlain > 400, `the control itself stopped after ${nPlain} updates - the premise (a long invisible coast) no longer holds`);
  assert.ok(nFixed < nPlain / 3, `the coast stop took ${nFixed} updates against ${nPlain} without it`);
  const gapPx = Math.abs(plain.controls.getAzimuthalAngle() - fixed.controls.getAzimuthalAngle()) * pxPerRad(fixed);
  assert.ok(gapPx < 1.5, `the stopped camera ends ${gapPx.toFixed(2)} px from the full coast`);
  /* and it is really stopped: nothing is left in the controls to play */
  assert.equal(fixed.controls._sphericalDelta.theta, 0);
});

test('a slow motion is dropped at once after release, but kept while the button is held', () => {
  /* one update's motion of about 0.02 px: under the released threshold (0.05), over the held one (0.005) */
  const make = () => { const r = rig(); r.controls._sphericalDelta.theta = 0.02 / pxPerRad(r) / r.controls.dampingFactor; return r; };
  const released = make();
  released.updateOrbit();
  assert.equal(released.controls._sphericalDelta.theta, 0, 'a sub-threshold coast after release was not dropped');
  const held = make();
  held.controls.state = 0;                                // ROTATE: a pointer is down
  const before = held.controls.getAzimuthalAngle();
  held.updateOrbit(); held.updateOrbit();
  assert.notEqual(held.controls._sphericalDelta.theta, 0, 'a slow held pan was cut off mid-gesture');
  assert.ok(Math.abs(held.controls.getAzimuthalAngle() - before) > 0, 'the held pan stopped moving the camera');
});

test('auto-rotate and a control without damping are left exactly as three drives them', () => {
  const plain = rig(), fixed = rig();
  /* a SLOW spin: its first damped steps move under the threshold, which is exactly when zeroing the delta would hold
     the spin at the damping factor's share of its speed (a fast spin never gets under it and proves nothing) */
  for (const r of [plain, fixed]) { r.controls.autoRotate = true; r.controls.autoRotateSpeed = 0.02; }
  const firstStepPx = 2 * Math.PI / 3600 * 0.02 * plain.controls.dampingFactor * pxPerRad(plain);
  assert.ok(firstStepPx < 0.005, `the spin's first step is ${firstStepPx} px - too fast to exercise the guard`);
  for (let i = 0; i < 300; i++) { plain.controls.update(); fixed.updateOrbit(); }
  assert.equal(fixed.controls.getAzimuthalAngle(), plain.controls.getAzimuthalAngle(), 'the stop changed an auto-rotating spin');
  const a = rig(), b = rig();
  for (const r of [a, b]) { r.controls.enableDamping = false; r.controls._sphericalDelta.theta = 1e-7; }
  a.controls.update(); b.updateOrbit();
  assert.ok(b.camera.position.equals(a.camera.position), 'the stop changed an undamped control');
});
