/* THE MOVING-FRAME SAVINGS (MOVE_OPT, Joey and Astra 2026-09-14, "Step 1") - main.js, run against three r185's real objects.
 *
 * Three of the four savings skip work when nothing it depends on changed, so each one is only as good as its idea of
 * "changed". These tests drive that idea directly: the shadow watch must ask for a shadow render after every kind of change
 * to a caster or the key light and never when nothing changed; the contact map's check likewise for what it reads; and the
 * three places that act on them (qualityTick, updateGrounding, updateCavityFill) must go quiet only when they should.
 * The fourth saving, the dimension labels' cover test, has its own file (test/dim-cover.test.mjs).
 *
 * ⚠ THESE TESTS CALL THE CODE. main.js cannot be imported under node (it builds a WebGL renderer at module scope), so the
 * functions are extracted by balanced scan and evaluated against real three objects and plain stubs. And each check
 * is run against copies with one comparison removed, which must fail - a check that passes with the comparison gone was
 * never testing it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const THREE = await import(pathToFileURL(join(root, 'viewer', 'vendor', 'three', 'three.module.js')).href);
// ⚠ LF, whatever the checkout: a Windows clone has CRLF, and a multi-line mutation anchor would then match nothing
const src = readFileSync(join(root, 'viewer', 'js', 'main.js'), 'utf8').replace(/\r\n/g, '\n');

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
const mutate = (code, from, to) => {
  assert.equal(code.split(from).length - 1, 1, `mutation anchor "${from.slice(0, 60)}" must occur exactly once`);
  return code.replace(from, to);
};

/* ------------------------------------------------------------------------------------------------ the shadow watch */
const SHADOW_CODE = [takeAt('var shadowWatch = {'), takeAt('function watchShadowCasters()', { fn: true }),
  takeAt('function storeChanged16(', { fn: true }), takeAt('function shadowInputsChanged(W)', { fn: true })].join('\n');

function part(x) {
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(80, 50, 180), new THREE.MeshStandardMaterial());
  mesh.castShadow = true;
  inner.add(mesh);
  group.position.set(x, 0, 0);
  return { group, inner, mesh };
}
/* every kind of change, and the frames where nothing changed; returns what went wrong */
function shadowScenario(code) {
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(300, 600, 400);
  scene.add(sun, sun.target);
  const parts = [part(0), part(100), part(200)];
  const instances = new Map(parts.map((p, i) => [i, { group: p.group }]));
  for (const p of parts) scene.add(p.group);
  const renderer = { shadowMap: { enabled: true, needsUpdate: false } };
  const MOVE_OPT = { shadow: true };
  // count the walks: at rest the watch must not walk the parts at all (it is the idle frames' cost)
  let walks = 0;
  const values = instances.values.bind(instances);
  instances.values = () => { walks++; return values(); };
  const api = new Function('renderer', 'MOVE_OPT', 'sun', 'instances', code + '\nreturn { watchShadowCasters, shadowWatch };');
  let env = api(renderer, MOVE_OPT, sun, instances);
  env.shadowWatch.moving = true;                   // qualityTick's mirror of perf.moving: these frames are all moving ones
  const failures = [];
  const frame = (label, expect) => {
    scene.updateMatrixWorld(true);                 // what three does before it calls onBeforeRender
    sun.shadow.camera.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = false;
    env.watchShadowCasters();
    if (renderer.shadowMap.needsUpdate !== expect) failures.push(`${label}: asked for a shadow render = ${renderer.shadowMap.needsUpdate}, expected ${expect}`);
  };
  frame('the first look', true);
  frame('nothing changed', false);
  frame('nothing changed again (a camera-only frame)', false);
  parts[0].group.position.x += 5; frame('a part moved', true);
  frame('it stopped', false);
  parts[1].inner.position.y += 3; frame('an inner child moved (a label lift, a screw spin)', true);
  parts[1].inner.rotation.z += 0.2; frame('an inner child turned', true);
  parts[2].group.visible = false; frame('a part hidden', true);
  frame('still hidden', false);
  parts[2].group.visible = true; frame('shown again', true);
  parts[0].inner.visible = false; frame('an inner node hidden', true);
  parts[0].inner.visible = true; frame('an inner node shown', true);
  parts[0].mesh.material = parts[0].mesh.material.clone(); frame('a material swapped (a fade clone)', true);
  parts[0].mesh.material.needsUpdate = true; frame('a material changed in place (its version moved)', true);
  parts[1].mesh.castShadow = false; frame('castShadow off', true);
  parts[1].mesh.castShadow = true; frame('castShadow on', true);
  parts[1].mesh.layers.set(3); frame('layers changed', true);
  parts[2].mesh.geometry = new THREE.BoxGeometry(10, 10, 10); frame('a geometry swapped', true);
  const extra = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5), new THREE.MeshStandardMaterial());
  parts[2].inner.add(extra); frame('a mesh added', true);
  parts[2].inner.remove(extra); frame('a mesh removed', true);
  frame('settled after the removal', false);
  // the walk visits the first part's subtree LAST, so this mesh is the list's tail: removing it shifts no other entry,
  // and only the list-length check can see it
  const tail = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5), new THREE.MeshStandardMaterial());
  parts[0].inner.add(tail); frame('a mesh added at the end of the walk', true);
  parts[0].inner.remove(tail); frame('the last mesh of the walk removed', true);
  frame('settled after the tail removal', false);
  sun.position.x += 10; frame('the key light moved', true);
  sun.target.position.z += 10; frame('the light target moved', true);
  sun.shadow.camera.left -= 50; frame('the shadow camera refitted', true);
  instances.clear();
  const rebuilt = [part(0), part(90)];
  rebuilt.forEach((p, i) => { instances.set(i, { group: p.group }); scene.add(p.group); });
  frame('a rebuild (regenerate) with new parts', true);
  frame('settled after the rebuild', false);
  // AT REST (perf.moving false) the old code never re-rendered the map, and the watch stays out of it the same way -
  // without walking the parts - while a change made there is seen on the next moving frame
  env.shadowWatch.moving = false;
  const walksBefore = walks;
  rebuilt[1].group.position.x += 30; frame('at rest a part moved: left to the next moving frame, as the old code did', false);
  frame('still at rest', false);
  if (walks !== walksBefore) failures.push(`at rest the watch walked the parts ${walks - walksBefore} times`);
  env.shadowWatch.moving = true; frame('moving again: the change made at rest is seen', true);
  frame('moving, nothing changed', false);
  MOVE_OPT.shadow = false; rebuilt[0].group.position.x += 50; frame('switched off: the watch stays out of it', false);
  MOVE_OPT.shadow = true; renderer.shadowMap.enabled = false; frame('shadows disabled: the watch stays out of it', false);
  return failures;
}

test('the shadow watch asks for a shadow render after every kind of caster or light change, and never without one', () => {
  const failures = shadowScenario(SHADOW_CODE);
  assert.deepEqual(failures, []);
});

test('the shadow watch\'s checks have power: each one removed makes the scenario fail', () => {
  const mutations = [
    ['visibility up the tree ignored', 'shown = vis.pop() && o.visible', 'shown = true'],
    ['world matrices not compared', 'if (storeChanged16(W.m, j * 16, o.matrixWorld.elements)) changed = true;', 'storeChanged16(W.m, j * 16, o.matrixWorld.elements);'],
    ['material swaps ignored', 'if (W.mats[j] !== o.material) { W.mats[j] = o.material; changed = true; }', 'W.mats[j] = o.material;'],
    ['material versions ignored', 'if (W.ver[j] !== version) { W.ver[j] = version; changed = true; }', 'W.ver[j] = version;'],
    ['castShadow ignored', 'const flag = (shown ? 1 : 0) | (o.castShadow ? 2 : 0);', 'const flag = shown ? 1 : 0;'],
    ['layers ignored', 'if (W.layers[j] !== o.layers.mask >>> 0) { W.layers[j] = o.layers.mask >>> 0; changed = true; }', ''],
    ['geometry swaps ignored', 'if (W.geos[j] !== o.geometry) { W.geos[j] = o.geometry; changed = true; }', 'W.geos[j] = o.geometry;'],
    ['the key light ignored', 'let changed = storeChanged16(W.light, 0, sun.matrixWorld.elements);', 'let changed = false; storeChanged16(W.light, 0, sun.matrixWorld.elements);'],
    ['a shrinking mesh list ignored', 'if (W.meshes.length !== j) { W.meshes.length = j; W.mats.length = j; W.geos.length = j; changed = true; }', 'W.meshes.length = j; W.mats.length = j; W.geos.length = j;'],
    ['the at-rest gate removed', ' || !shadowWatch.moving) return;', ') return;'],
  ];
  for (const [name, from, to] of mutations) {
    const failures = shadowScenario(mutate(SHADOW_CODE, from, to));
    assert.ok(failures.length > 0, `removing "${name}" left every expectation satisfied - that check is untested`);
  }
});

test('qualityTick: while the camera moves the shadow map no longer re-renders every frame; settling still refreshes it once', () => {
  const code = takeAt('function qualityTick(now)', { fn: true });
  const run = (shadowOpt) => {
    const camera = new THREE.PerspectiveCamera(40, 1, 1, 8000);
    const controls = { target: new THREE.Vector3() };
    const perf = { key: '', moving: false, lastChange: 0, dpr: 2, camKey: '', cameraMoving: false, camChange: 0, thrifty: false };
    const renderer = { shadowMap: { enabled: true, autoUpdate: false, needsUpdate: false }, setPixelRatio() {}, setSize() {} };
    const shadowWatch = { moving: false };
    const tick = new Function('QUALITY', 'quality', 'devicePixelRatio', 'cinema', 'perf', 'renderer', 'setLayerDetailPixelRatio', 'canvas',
      'camera', 'controls', 'tweens', 'SETTLE_MS', 'MOVE_OPT', 'perfFeed', 'document', 'perfGraceUntil', 'qualityLocked', 'QUALITY_ORDER',
      'shadowWatch', 'benchHold', code + '\nreturn qualityTick;')({ high: { dpr: 2 } }, 'high', 2, { on: false }, perf, renderer, () => {}, { clientWidth: 800, clientHeight: 600 },
      camera, controls, { size: 0 }, 160, { shadow: shadowOpt }, () => null, { hidden: false }, 0, true, ['high', 'balanced', 'fast'], shadowWatch, false);
    const log = [];
    let t = 1000;
    for (let i = 0; i < 20; i++) {          // an orbit: the camera moves every frame
      camera.position.set(Math.sin(i / 10) * 500, 200, Math.cos(i / 10) * 500);
      renderer.shadowMap.needsUpdate = false;
      tick(t += 16);
      log.push({ auto: renderer.shadowMap.autoUpdate, need: renderer.shadowMap.needsUpdate, moving: perf.moving, watch: shadowWatch.moving });
    }
    let settledRefresh = false, watchAtRest = false;
    for (let i = 0; i < 30; i++) { renderer.shadowMap.needsUpdate = false; tick(t += 16); if (renderer.shadowMap.needsUpdate) settledRefresh = true; watchAtRest = shadowWatch.moving; }
    return { log, settledRefresh, autoAfter: renderer.shadowMap.autoUpdate, watchAtRest };
  };
  const off = run(false), on = run(true);
  assert.ok(off.log.slice(1).every((f) => f.moving && f.auto), 'switched off, the old behaviour (a shadow render every moving frame) is gone');
  assert.ok(on.log.slice(1).every((f) => f.moving && !f.auto), 'with MOVE_OPT.shadow, a camera-only move still turned autoUpdate on');
  assert.ok(on.settledRefresh && off.settledRefresh, 'settling no longer asks for its one shadow refresh');
  assert.equal(on.autoAfter, false);
  // the watch's gate mirrors perf.moving on every frame - the frames the old code re-rendered the map on
  assert.ok(on.log.every((f) => f.watch === f.moving), 'shadowWatch.moving stopped mirroring perf.moving while moving');
  assert.equal(on.watchAtRest, false, 'shadowWatch.moving stayed on after settling - the watch would walk every idle frame');
});

/* ------------------------------------------------------------------------------------------------ the contact map */
const GROUND_CHECK = [takeAt('function storeChanged16(', { fn: true }), takeAt('function groundingInputsChanged(boxes)', { fn: true })].join('\n');

function groundScenario(code) {
  const scene = new THREE.Scene();
  const groups = [0, 1, 2].map((i) => { const g = new THREE.Group(); g.position.set(i * 90, 0, 0); scene.add(g); return g; });
  let boxes = groups.map((group) => ({ inst: { group } }));
  const ground = { seen: null, mat: {} };
  const refl = { mesh: null };
  const assembledBox = new THREE.Box3(new THREE.Vector3(-50, 0, -100), new THREE.Vector3(250, 60, 100));
  const check = new Function('ground', 'refl', 'scene', 'assembledBox', code + '\nreturn groundingInputsChanged;')(ground, refl, scene, assembledBox);
  const failures = [];
  const frame = (label, expect) => {
    scene.updateMatrixWorld(true);
    const got = check(boxes);
    if (got !== expect) failures.push(`${label}: recompute = ${got}, expected ${expect}`);
  };
  frame('the first look', true);
  frame('nothing changed (a camera-only frame)', false);
  groups[0].position.y += 4; frame('a part lifted', true);
  frame('it stopped', false);
  groups[1].position.x += 4; frame('a part slid sideways', true);
  groups[2].position.z -= 4; frame('a part slid back', true);
  groups[2].visible = false; frame('a part hidden', true);
  groups[2].visible = true; frame('shown again', true);
  frame('settled', false);
  boxes = boxes.slice(); frame('the box list rebuilt', true);
  refl.mesh = { material: {} }; frame('a reflector created', true);
  refl.mesh.material = {}; frame('the reflector material replaced', true);
  ground.mat = {}; frame('the ground material replaced', true);
  assembledBox.max.x += 10; frame('the build bounds changed', true);
  scene.position.x += 1; frame('the scene itself moved', true);
  scene.position.x -= 1; frame('and back', true);
  frame('settled again', false);
  const holder = new THREE.Group(); scene.add(holder); holder.add(groups[1]);
  frame('a part moved under another object', true);
  frame('...which is checked every frame', true);
  return failures;
}

test('the contact map is recomputed after every change it reads, and not on a camera-only frame', () => {
  assert.deepEqual(groundScenario(GROUND_CHECK), []);
});

test('the contact map check has power: each comparison removed makes the scenario fail', () => {
  const mutations = [
    ['height ignored', '|| v[o + 2] !== p.y ', ''],
    ['visibility ignored', 'if (v[o] !== shown ||', 'if ('],
    ['the reflector ignored', 'if (s.refl !== rm || s.reflMat !== rmat) { s.refl = rm; s.reflMat = rmat; changed = true; }', 's.refl = rm; s.reflMat = rmat;'],
    ['the parent ignored', 'if (g.parent !== scene) changed = true;', ''],
    ['the bounds ignored', 'bb[0] = b.min.x; bb[1] = b.min.y; bb[2] = b.min.z; bb[3] = b.max.x; bb[4] = b.max.y; bb[5] = b.max.z;\n    changed = true;',
      'bb[0] = b.min.x; bb[1] = b.min.y; bb[2] = b.min.z; bb[3] = b.max.x; bb[4] = b.max.y; bb[5] = b.max.z;'],
  ];
  for (const [name, from, to] of mutations) {
    assert.ok(groundScenario(mutate(GROUND_CHECK, from, to)).length > 0, `removing "${name}" left every expectation satisfied`);
  }
});

test('updateGrounding writes the contact uniforms after a change and leaves them alone on a camera-only frame', () => {
  const code = [takeAt('function storeChanged16(', { fn: true }), takeAt('function groundingInputsChanged(boxes)', { fn: true }),
    takeAt('function updateGrounding()', { fn: true })].join('\n');
  const scene = new THREE.Scene();
  const groups = [0, 1].map((i) => { const g = new THREE.Group(); g.position.set(i * 90, 0, 0); scene.add(g); return g; });
  const boxes = groups.map((group) => ({ inst: { group }, base: 0, size: new THREE.Vector3(80, 50, 180) }));
  const GROUND_MAX = 24;
  const uniforms = { uCount: { value: 0 }, uPos: { value: null }, uSiz: { value: null }, uStr: { value: null } };
  const ground = { mesh: { visible: false, position: new THREE.Vector3(), scale: new THREE.Vector3() }, mat: { uniforms, uniformsNeedUpdate: false },
    seen: null, pos: new Float32Array(GROUND_MAX * 2), siz: new Float32Array(GROUND_MAX * 2), str: new Float32Array(GROUND_MAX) };
  const MOVE_OPT = { grounding: true };
  const update = new Function('THREE', 'ground', 'refl', 'scene', 'assembledBox', 'MOVE_OPT', 'GROUND_MAX', 'GROUND_H', '_gv',
    'groundingWanted', 'ensureGrounding', 'contactMapWanted', 'groundingBoxes', code + '\nreturn updateGrounding;')(
    THREE, ground, { mesh: null }, scene, new THREE.Box3(new THREE.Vector3(-50, 0, -100), new THREE.Vector3(150, 60, 100)), MOVE_OPT, GROUND_MAX, 90,
    new THREE.Vector3(), () => false, () => {}, () => true, () => boxes);
  const wrote = () => { ground.mat.uniformsNeedUpdate = false; update(); return ground.mat.uniformsNeedUpdate; };
  assert.equal(wrote(), true, 'the first frame must compute the map');
  assert.equal(wrote(), false, 'a frame where no part moved recomputed the map');
  groups[1].position.y = 30;
  assert.equal(wrote(), true, 'a part lifted and the map was not recomputed');
  assert.ok(Math.abs(ground.siz[0] - (40 + 6)) < 1e-4 || Math.abs(ground.siz[2] - (40 + 6)) < 1e-4, 'the recomputed map lost the resting part');
  MOVE_OPT.grounding = false;
  assert.equal(wrote(), true, 'switched off, it must compute every frame as before');
  assert.equal(wrote(), true, 'switched off, it must compute every frame as before');
});

/* -------------------------------------------------------------------------------------------------- the cavity fill */
test('updateCavityFill does no per-drawer work while off with nothing to restore, and still restores what it cloned', () => {
  const code = takeAt('function updateCavityFill()', { fn: true });
  let hexCalls = 0, on = false;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  const group = new THREE.Group(); group.add(mesh);
  const list = [{ inst: { group, cfg: { node: 'DecorDrawer_185-1W-1H' } }, caseInst: null, z0: 0, mats: null }];
  const cavity = { clones: false };
  const MOVE_OPT = { cavity: true };
  const update = new Function('THREE', 'cavityDrawers', 'cavityFillWanted', 'MOVE_OPT', 'cavity', 'manifest', 'primaryKey', 'activeHex',
    '_cavA', '_cavB', '_cavC', 'CAVITY', 'cloneMaterial', code + '\nreturn updateCavityFill;')(
    THREE, () => list, () => on, MOVE_OPT, cavity, { collection: '185' }, (n) => n, () => { hexCalls++; return '#808080'; },
    new THREE.Color(), new THREE.Color(), new THREE.Color(), { strength: 0.3, caseWeight: 0.75, room: new THREE.Color(0xb9c2d6) },
    (m) => m.clone());
  const original = mesh.material;
  update(); update();
  assert.equal(hexCalls, 0, 'off with nothing to restore, it still computed colours');
  on = true; update();
  assert.ok(hexCalls > 0 && mesh.material !== original && cavity.clones, 'switched on, it did not fill');
  on = false; update();
  assert.equal(mesh.material, original, 'switched off again, the clone was not restored');
  assert.equal(cavity.clones, false);
  const before = hexCalls; update(); update();
  assert.equal(hexCalls, before, 'after restoring, it kept computing colours while off');
  MOVE_OPT.cavity = false; update();
  assert.ok(hexCalls > before, 'switched off, the old per-frame loop did not run');
});

/* ---------------------------------------------------------------------------------------------------- the wiring */
test('the scene asks the shadow watch before every render, and the labels use the cover test only behind their switch', () => {
  assert.ok(/scene\.onBeforeRender = watchShadowCasters;/.test(src), 'scene.onBeforeRender no longer runs the shadow watch');
  const dims = takeAt('function updateDims()', { fn: true });
  assert.ok(dims.includes('if (!MOVE_OPT.labels) { const hit = dimRay.intersectObjects(targets, true)[0]; return !!hit && hit.distance < maxD; }'),
    'updateDims lost its switched-off path (the one the harness compares against)');
  assert.ok(dims.includes('dimCover.prepare(targets)') && dims.includes('return dimCover.covers(dimRay, maxD);'), 'updateDims no longer uses dim-cover.js');
});
