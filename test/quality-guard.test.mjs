/* THE MOVING-FRAME PASSES AND THE AUTO-DOWNGRADE (2026-09-14, Joey and Astra's rules).
 *
 * 1. While the CAMERA moves, the floor reflection and ambient occlusion skip their scene renders and come
 *    back SETTLE_MS after it stops - MEASURED that day on an 80-unit build, a moving High frame made 3,812
 *    draw calls against Balanced's 1,271.
 * 2. The auto-downgrade no longer discards a window for being slow. Before, every 3 s window with fewer
 *    than 30 frames was thrown away as "untrustworthy", so a device running High at ~9 fps took 25.9 s to
 *    reach Balanced. Hidden pages, single intervals over PERF_PAUSE_MS and the grace after a change are
 *    what keep a background tab from reading as a slow device now.
 *
 * ⚠ THESE TESTS CALL THE CODE. main.js cannot be imported under node (it builds a WebGL renderer at module
 * scope), so the pieces are extracted by balanced scan and run - against synthetic frame timestamps for
 * the sampler, and against a real three.js scene with a counting renderer for the reflection.
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
  return assert.fail(`unterminated "${needle}"`);
}

/* ---------------------------------------------------------------------------------------- the sampler */

const SAMPLER = [
  takeAt('const PERF_PAUSE_MS ='), takeAt('const PERF_RETURN_GRACE_MS ='), takeAt('const PERF_SEVERE ='),
  takeAt('const PERF_MODERATE ='), takeAt('function perfVerdict(', { fn: true }), takeAt('function perfFeed(', { fn: true }),
].join('\n');
const { perfFeed, perfVerdict, PERF_SEVERE } = new Function(SAMPLER + '\nreturn { perfFeed, perfVerdict, PERF_SEVERE };')();

const fresh = () => ({ win: { ms: 0, n: 0 }, lastNow: 0, wasHidden: false, returnGraceUntil: 0, checked: 0 });
/* drive frames at `fps` for `seconds`, applying verdicts the way qualityTick does; returns the actions */
function run(p, state, segments) {
  const actions = [];
  let now = state.now ?? 1000;
  for (const seg of segments) {
    const dt = 1000 / seg.fps;
    for (let t = 0; t < seg.seconds * 1000; t += dt) {
      now += dt;
      const v = perfFeed(p, now, { hidden: !!seg.hidden, graceUntil: state.graceUntil, thrifty: state.thrifty, locked: !!state.locked, canStep: state.tier < 3 });
      if (!v || !(v.thrifty || v.step)) continue;
      if (v.thrifty) { state.thrifty = true; actions.push({ at: now, what: 'thrifty', fps: v.fps, severe: v.severe }); }
      if (v.step) { state.tier++; state.graceUntil = now + 1500; actions.push({ at: now, what: 'step', fps: v.fps, severe: v.severe }); }
    }
  }
  state.now = now;
  return actions;
}

test('a device that drops to 8 fps steps down within seconds, and again if it stays that slow', () => {
  const p = fresh(), s = { thrifty: false, tier: 1 };
  run(p, s, [{ fps: 60, seconds: 5 }]);                  // boot window discarded, then healthy
  const slowFrom = s.now;
  const acts = run(p, s, [{ fps: 8, seconds: 12 }]);
  const steps = acts.filter((a) => a.what === 'step');
  assert.ok(steps.length >= 2, `only ${steps.length} step(s) in 12 s at 8 fps: ${JSON.stringify(acts)}`);
  assert.ok(steps[0].at - slowFrom <= 6000, `the first step came ${steps[0].at - slowFrom} ms after the slowdown`);
  assert.ok(steps[1].at - steps[0].at <= 5000, `the second step came ${steps[1].at - steps[0].at} ms after the first`);
  assert.ok(steps.every((a) => a.severe), 'a sub-15-fps step must come from the severe rule');
  assert.equal(s.thrifty, true, 'the severe rule also turns on the resolution drop');
});

test('the old blind spot is gone: at 9 fps from the start of a window, the step comes after ~2 s of frames', () => {
  const p = fresh(), s = { thrifty: false, tier: 1 };
  run(p, s, [{ fps: 9, seconds: 3.5 }]);                // the first window (boot) is discarded even when slow
  assert.equal(s.tier, 1, 'the boot window must not judge');
  const from = s.now;
  const acts = run(p, s, [{ fps: 9, seconds: 3 }]);
  const step = acts.find((a) => a.what === 'step');
  assert.ok(step && step.at - from <= PERF_SEVERE.windowMs + 400, `no step within ${PERF_SEVERE.windowMs + 400} ms at 9 fps: ${JSON.stringify(acts)}`);
});

test('at 2 fps, the slowest rate that is not a pause, the severe window is still 2 s', () => {
  const p = fresh(), s = { thrifty: false, tier: 1 };
  run(p, s, [{ fps: 60, seconds: 4 }]);
  const from = s.now;
  const acts = run(p, s, [{ fps: 2, seconds: 8 }]);
  const step = acts.find((a) => a.what === 'step');
  /* a 60 fps window may be open when the slowdown starts; it closes, then 2 s of 2 fps frames judge */
  assert.ok(step && step.at - from <= 3000 + PERF_SEVERE.windowMs + 600, `the step at 2 fps came ${step ? step.at - from : 'never'} ms after the slowdown`);
  assert.equal(perfVerdict({ ms: 2000, n: 4 }, { thrifty: false, locked: false, canStep: true })?.step, true, '2 s of 2 fps is not judged severe');
});

test('a hidden tab is never judged, even at a frame rate that would step a visible one', () => {
  const p = fresh(), s = { thrifty: false, tier: 0 };
  run(p, s, [{ fps: 60, seconds: 4 }]);
  /* 8 fps steps a visible device within seconds (the first test); hidden, it must count for nothing */
  assert.deepEqual(run(p, s, [{ fps: 8, seconds: 30, hidden: true }]), [], 'a hidden tab was judged');
  /* the first second back is ignored too: a returning tab re-rasterises slowly before it is itself */
  assert.deepEqual(run(p, s, [{ fps: 8, seconds: 0.9 }, { fps: 60, seconds: 4 }]), [], 'the return from hidden was judged');
  assert.equal(s.tier, 0);
});

test('a single long pause among healthy frames is a pause, not a frame rate; 1 Hz throttling is never judged', () => {
  const p = fresh(), s = { thrifty: false, tier: 0 };
  run(p, s, [{ fps: 60, seconds: 4 }]);
  /* a visible tab the browser paused for 5 s (an alert, a GC, an occluded window that never reported hidden):
     counted, that one interval would take a 60 fps window to ~10 fps and step the tier */
  assert.deepEqual(run(p, s, [{ fps: 60, seconds: 1 }, { fps: 0.2, seconds: 5 }, { fps: 60, seconds: 4 }]), [],
    'one 5 s interval was read as a slow device');
  assert.deepEqual(run(p, s, [{ fps: 1, seconds: 120 }]), [], 'one-second intervals were read as a frame rate');
  assert.equal(s.tier, 0);
});

test('frames inside a grace period do not count, so a compile stall after a change is not a verdict', () => {
  const p = fresh(), s = { thrifty: false, tier: 0 };
  run(p, s, [{ fps: 60, seconds: 4 }]);
  s.graceUntil = s.now + 1500;
  assert.deepEqual(run(p, s, [{ fps: 3, seconds: 1.4 }]), [], 'stall frames inside the grace were judged');
  const acts = run(p, s, [{ fps: 60, seconds: 4 }]);
  assert.deepEqual(acts, [], 'a healthy frame rate after the grace was judged slow');
});

test('a locked tier only gets the resolution drop, and Fast has nowhere to step', () => {
  const locked = fresh(), a = { thrifty: false, tier: 0, locked: true };
  run(locked, a, [{ fps: 60, seconds: 4 }]);
  const acts = run(locked, a, [{ fps: 8, seconds: 8 }]);
  assert.equal(a.tier, 0, 'a locked tier was stepped');
  assert.ok(acts.some((x) => x.what === 'thrifty'), 'a locked, severely slow device got no resolution drop');
  assert.deepEqual(perfVerdict({ ms: 2000, n: 16 }, { thrifty: true, locked: false, canStep: false }),
    { fps: 8, severe: true, thrifty: false, step: false });
});

test('the moderate rule still works: 20 fps gets the resolution drop first, then a step', () => {
  const p = fresh(), s = { thrifty: false, tier: 1 };
  run(p, s, [{ fps: 60, seconds: 4 }]);
  const acts = run(p, s, [{ fps: 20, seconds: 10 }]);
  assert.equal(acts[0]?.what, 'thrifty', JSON.stringify(acts));
  assert.ok(acts.some((x) => x.what === 'step' && !x.severe), JSON.stringify(acts));
  /* and nothing below 24 but above 15 is ever severe */
  assert.equal(perfVerdict({ ms: 2500, n: 50 }, { thrifty: false, locked: false, canStep: true }), null);
});

test('the visibilitychange handler resets the new window and does not throw', () => {
  /* It still reset the REMOVED perf.frames / perf.t0 after the rewrite and threw on every tab switch - caught by
     the browser harness's console, not by a unit test. This one runs the handler. */
  const handlers = {};
  const document = { hidden: true, addEventListener(type, fn) { handlers[type] = fn; } };
  const perf = { lastNow: 1234, win: { ms: 900, n: 40 }, wasHidden: false };
  new Function('document', 'perf', takeAt("document.addEventListener('visibilitychange'"))(document, perf);
  assert.equal(typeof handlers.visibilitychange, 'function');
  handlers.visibilitychange();
  assert.deepEqual(perf, { lastNow: 0, win: { ms: 0, n: 0 }, wasHidden: true });
  assert.ok(!/perf\.(frames|t0)\b/.test(src), 'main.js still reads a field the sampler no longer has');
});

test('a healthy device is left alone: 45 fps for a minute changes nothing', () => {
  const p = fresh(), s = { thrifty: false, tier: 0 };
  assert.deepEqual(run(p, s, [{ fps: 45, seconds: 60 }]), []);
});

/* ------------------------------------------------------------------------------ the moving-frame passes */

test('motionLite is the CAMERA moving, never during the outro, never under the capture flag', () => {
  const motionLite = new Function('perf', 'cinema', 'window', takeAt('function motionLite(', { fn: true }) + '\nreturn motionLite;');
  assert.equal(motionLite({ cameraMoving: true }, { on: false }, {})(), true);
  assert.equal(motionLite({ cameraMoving: false }, { on: false }, {})(), false);
  assert.equal(motionLite({ cameraMoving: true }, { on: true }, {})(), false, 'the outro lost its reflection');
  assert.equal(motionLite({ cameraMoving: true }, { on: false }, { __FILM_AO_DURING_TWEENS: true })(), false, 'a capture harness lost AO mid-clip');
});

test('holding AO for motion forces a regeneration on return, and engages at once unless a tween is running', () => {
  const hold = (tweenCount) => {
    const ao = { blocked: false, quietAt: 5 };
    new Function('ao', 'tweens', takeAt('function holdAOForMotion(', { fn: true }) + '\nholdAOForMotion();')(ao, { size: tweenCount });
    return ao;
  };
  assert.deepEqual(hold(0), { blocked: true, quietAt: -Infinity });
  assert.deepEqual(hold(3), { blocked: true, quietAt: -1 });
});

test('the render loop skips the mirror and the AO pass on a moving frame and composites only when still', () => {
  const loop = takeAt('function renderLoop(now)', { fn: true });
  assert.match(loop, /const lite = motionLite\(\);/);
  assert.match(loop, /updateReflection\(false, lite\)/);
  assert.match(loop, /if \(lite\) holdAOForMotion\(\); else guardFx\('ao', updateAO\);/);
  assert.match(loop, /if \(!lite\) guardFx\('ao', compositeAO\);/);
  /* and no second, unconditional call of either beside the gated ones */
  assert.equal((loop.match(/updateAO\b/g) || []).length, 1, 'renderLoop calls updateAO more than once');
  assert.equal((loop.match(/compositeAO\b/g) || []).length, 1, 'renderLoop calls compositeAO more than once');
  assert.equal((loop.match(/updateReflection\b/g) || []).length, 1, 'renderLoop calls updateReflection more than once');
});

test('the reflection: no mirror render while moving and no stale image shown; one render and full opacity on return', () => {
  const REFL_CODE = [takeAt('const REFL_OPACITY ='), takeAt('const _rRw ='), takeAt('function updateReflection(', { fn: true })].join('\n');
  const camera = new THREE.PerspectiveCamera(40, 2, 1, 8000);
  camera.position.set(300, 250, 600); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const controls = { target: new THREE.Vector3(0, 40, 0) };
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ uniforms: { uOpacity: { value: 0.16 } } }));
  mesh.rotation.x = -Math.PI / 2; mesh.visible = true; mesh.updateMatrixWorld(true);
  const refl = { rt: {}, mesh, cam: new THREE.PerspectiveCamera(), tex: new THREE.Matrix4(), key: '' };
  const scene = new THREE.Scene(); scene.add(mesh);
  let renders = 0;
  const renderer = { setRenderTarget() {}, clear() {}, render() { renders++; } };
  const grid = new THREE.Object3D();
  const updateReflection = new Function('THREE', 'camera', 'controls', 'refl', 'scene', 'renderer', 'grid',
    REFL_CODE + '\nreturn updateReflection;')(THREE, camera, controls, refl, scene, renderer, grid);

  updateReflection(false, false);
  assert.equal(renders, 1, 'a still first frame did not render the mirror');
  for (let i = 0; i < 5; i++) { camera.position.x += 10; camera.updateMatrixWorld(); updateReflection(false, true); }
  assert.equal(renders, 1, 'the mirror rendered on a moving frame');
  assert.equal(mesh.material.uniforms.uOpacity.value, 0, 'a stale mirror image stayed on the floor while the camera moved');
  updateReflection(false, false);
  assert.equal(renders, 2, 'the mirror did not render when the camera stopped');
  assert.equal(mesh.material.uniforms.uOpacity.value, 0.16, 'the reflection did not come back at full opacity');
  updateReflection(false, false);
  assert.equal(renders, 2, 'a still camera re-rendered the mirror');
  updateReflection(true, true);
  assert.equal(renders, 3, 'a forced update (a tier change) did not render while moving');
});
