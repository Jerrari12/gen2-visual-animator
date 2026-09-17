/* The see-into translucent filament experiment (viewer/js/see-into.js): the switch, the component ids, and the shader patch
   applied to the REAL vendored three chunks - the patch finds every anchor exactly once, chains onto the layer relief and the
   plate finish rather than replacing them, changes the program cache key, and gates every change on uSIActive. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const THREE_URL = pathToFileURL(join(root, 'viewer', 'vendor', 'three', 'three.module.js')).href;
// the vendored relief imports the bare 'three' (the page's import map); map it to the same file, as bed-finish.test.mjs does
register('data:text/javascript,' + encodeURIComponent(
  `export async function resolve(s, c, n) { return s === 'three' ? { url: ${JSON.stringify(THREE_URL)}, shortCircuit: true } : n(s, c); }`));
const THREE = await import(THREE_URL);
const SI = await import(pathToFileURL(join(root, 'viewer', 'js', 'see-into.js')).href);
const { applyLayerDetail } = await import(pathToFileURL(join(root, 'viewer', 'js', 'vendor', 'layer-detail.js')).href);
const BF = await import(pathToFileURL(join(root, 'viewer', 'js', 'bed-finish.js')).href);

test('the switch: only a known preset turns it on', () => {
  assert.equal(SI.parseSeeInto('?seeinto=frosted'), 'frosted');
  assert.equal(SI.parseSeeInto('?bench=settle&seeinto=frosted&tier=veryhigh'), 'frosted');
  for (const q of ['', '?seeinto=', '?seeinto=1', '?seeinto=FROSTED', '?seeinto=toString', '?seeinto=__proto__']) assert.equal(SI.parseSeeInto(q), null, q);
});

test('the frosted preset is the lab round-39 cover (index.html COMMON + COVER), structure removed', () => {
  const P = SI.SEE_INTO_PRESETS.frosted;
  assert.deepEqual([P.colorHex, P.seeTintHex, P.see, P.blurPx, P.wallOpaque, P.graze, P.wrap, P.roughness, P.aoWeight, P.interiorScale],
    ['#e6ecee', '#f4f7f7', 0.20, 6, 0.85, 1, 1.0, 0.25, 0.35, 0.5]);
});

test('component ids: one per PART, 1-based, shared by a part\'s meshes; 255 parts refuse', () => {
  assert.deepEqual(SI.componentIds([{ partId: 'bc0' }, { partId: 'bc0' }, { partId: 'bc1' }, { partId: 'bc2' }, { partId: 'bc1' }]), [1, 1, 2, 3, 2]);
  assert.equal(SI.componentIds(Array.from({ length: 254 }, (_, i) => ({ partId: 'p' + i }))).at(-1), 254);
  assert.throws(() => SI.componentIds(Array.from({ length: 255 }, (_, i) => ({ partId: 'p' + i }))), /holds 254/);
});

/* the shader as three would hand it to onBeforeCompile, with a prior patch in the chain like the viewer's relief */
function compile(material) {
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  material.onBeforeCompile(shader, null);
  return shader;
}

test('the patch chains, finds every anchor once, and gates every change on uSIActive', () => {
  const m = new THREE.MeshPhysicalMaterial();
  let priorRan = 0;
  m.onBeforeCompile = (sh) => { priorRan++; sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n// PRIOR-PATCH'); };
  m.customProgramCacheKey = () => 'ld';
  const uniforms = { uSIActive: { value: 0 } };
  SI.patchSeeIntoMaterial(m, uniforms, THREE.ShaderChunk.lights_physical_pars_fragment);
  const sh = compile(m);
  assert.equal(priorRan, 1, 'the prior patch (the relief, the plate finish) still runs');
  assert.ok(sh.fragmentShader.includes('// PRIOR-PATCH'));
  assert.equal(m.customProgramCacheKey(), 'ld|seeinto', 'a new cache key, or three reuses the unpatched program');
  assert.equal(sh.uniforms.uSIActive, uniforms.uSIActive, 'the one shared uniform object');
  assert.ok(sh.vertexShader.includes('vSIObjNrm = objectNormal;'));
  assert.ok(sh.fragmentShader.includes(SI.FRAG_SURFACE) && sh.fragmentShader.includes(SI.FRAG_COMPOSITE));
  // the surface block sits after roughness is read and BEFORE the relief's normal_fragment_maps and the finish's emissivemap
  const fs = sh.fragmentShader;
  assert.ok(fs.indexOf(SI.FRAG_SURFACE) > fs.indexOf('#include <roughnessmap_fragment>'));
  assert.ok(fs.indexOf(SI.FRAG_SURFACE) < fs.indexOf('#include <normal_fragment_maps>'));
  assert.ok(fs.indexOf(SI.FRAG_COMPOSITE) < fs.indexOf('#include <transmission_fragment>'));
  // the lights chunk is expanded with exactly one line changed, and that line is gated
  assert.ok(!fs.includes('#include <lights_physical_pars_fragment>'));
  assert.ok(fs.includes(SI.WRAP_TO) && !fs.includes(SI.WRAP_FROM));
  assert.ok(SI.WRAP_TO.includes('* uSIActive'));
  for (const block of [SI.FRAG_SURFACE, SI.FRAG_COMPOSITE]) assert.match(block, /^if \( uSIActive > 0\.5/, 'every block is gated');
});

test('a clone keeps the patch (the viewer\'s highlight and fade clones copy onBeforeCompile and the cache key)', () => {
  const m = SI.patchSeeIntoMaterial(new THREE.MeshPhysicalMaterial(), { uSIActive: { value: 1 } }, THREE.ShaderChunk.lights_physical_pars_fragment);
  const c = m.clone();
  c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey;   // what main.js cloneMaterial does
  assert.ok(compile(c).fragmentShader.includes(SI.FRAG_COMPOSITE));
});

test('a missing anchor fails loudly instead of compiling a shader that silently does nothing', () => {
  assert.throws(() => SI.patchSeeIntoMaterial(new THREE.MeshPhysicalMaterial(), {}, 'no wrap line here'), /wrap anchor/);
  const m = SI.patchSeeIntoMaterial(new THREE.MeshPhysicalMaterial(), {}, THREE.ShaderChunk.lights_physical_pars_fragment);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader.replace('#include <transmission_fragment>', '') };
  assert.throws(() => m.onBeforeCompile(shader, null), /transmission_fragment/);
});

test('the viewer wires it only behind the switch, at the two places part materials are registered, and before the reflection, AO and accumulator', () => {
  const main = readFileSync(join(root, 'viewer', 'js', 'main.js'), 'utf8');
  assert.equal((main.match(/seeIntoPatched\(key, newPartMaterial\(key\)\)/g) || []).length, 2);
  assert.equal((main.match(/materials\[key\] = newPartMaterial\(key\)/g) || []).length, 0, 'no registration bypasses the patch helper');
  assert.match(main, /if \(!ENTRY\.isPart && parseSeeInto\(location\.search\)\) seeInto = createSeeInto\(/);
  const loop = main.slice(main.indexOf('function renderLoop(now) {'));
  const at = (s) => loop.indexOf(s);
  assert.ok(at("guardFx('seeinto'") > 0 && at("guardFx('seeinto'") < at("guardFx('reflection'"));
  assert.ok(at("guardFx('seeinto'") < at("guardFx('accum', accumFrame)"));
  // the AO composite is patched after updateAO builds it and before compositeAO draws it
  const patchAt = at('seeInto.patchAO(ao.compMat)');
  assert.ok(patchAt > at("guardFx('ao', updateAO)") && patchAt < at("guardFx('ao', compositeAO)"));
  assert.match(main, /QUALITY\[quality\]\.accum && !cinema\.on/, 'Very High only');
});

test('on the REAL chain the viewer builds - layer relief, then plate finish, then see-into - every anchor is still found once', () => {
  /* p60's first browser probe threw here: the relief injects a comment quoting '#include <common>', and a substring count found
     two. A stand-in prior patch never quoted the directive, so the tests above could not see it. This runs the shipped patches. */
  const m = new THREE.MeshPhysicalMaterial();
  applyLayerDetail(m, { layerPitchMm: 0.2, tiltDeg: 22, pixelRatio: 1, printUp: new THREE.Vector3(0, 0, 1) });
  BF.applyBedFinish(m, { axis: [0, 0, 1], uniforms: BF.createBedFinishUniforms() });
  SI.patchSeeIntoMaterial(m, { uSIActive: { value: 1 } }, THREE.ShaderChunk.lights_physical_pars_fragment);
  const sh = compile(m);
  assert.ok(sh.fragmentShader.includes(SI.FRAG_SURFACE) && sh.fragmentShader.includes(SI.FRAG_COMPOSITE));
  assert.ok(sh.vertexShader.includes('vSIObjNrm = objectNormal;'));
  assert.match(m.customProgramCacheKey(), /\|seeinto$/);
});

/* prepare() against a counting fake renderer: which frames run the passes (Sol review 2026-09-17) */
function fakeSeeInto() {
  let renders = 0;
  const R = {
    autoClear: true, shadowMap: { needsUpdate: false },
    getDrawingBufferSize: (v) => v.set(64, 48), getRenderTarget: () => null, setRenderTarget() {},
    getClearColor: (c) => c.set(0), getClearAlpha: () => 1, setClearColor() {}, clear() {}, render() { renders++; },
  };
  const S = new THREE.Scene(), C = new THREE.PerspectiveCamera();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const si = SI.createSeeInto({ THREE, renderer: R, scene: S, camera: C, presetKey: 'frosted',
    parts: () => [{ partId: 'bc1', meshes: [mesh] }], wanted: () => true, sceneKey: () => 'k' });
  return { si, C, runs: () => renders / 3 };   // pass A, mask, pass B
}

test('prepare: a still view reuses the passes, and the frame after a tween ends runs them once more', () => {
  const { si, runs } = fakeSeeInto();
  si.prepare({ moving: false }); assert.equal(runs(), 1, 'first use');
  si.prepare({ moving: false }); assert.equal(runs(), 1, 'still: reused');
  si.prepare({ moving: true }); si.prepare({ moving: true }); assert.equal(runs(), 3, 'every tween frame');
  si.prepare({ moving: false }); assert.equal(runs(), 4, 'the frame the tween ended on (its final pose)');
  assert.equal(si.stats.lastReason, 'tween ended');
  si.prepare({ moving: false }); si.prepare({ moving: false }); assert.equal(runs(), 4, 'then reused again');
});

test('prepare: a camera change re-runs; withoutSeeThrough zeroes only the see-through and restores it, even on a throw', () => {
  const { si, C, runs } = fakeSeeInto();
  si.prepare({ moving: false });
  C.position.x += 1e-9; C.updateMatrixWorld();
  si.prepare({ moving: false }); assert.equal(runs(), 2);
  const see = si.uniforms.uSISee.value;
  assert.equal(si.withoutSeeThrough(() => si.uniforms.uSISee.value), 0);
  assert.equal(si.uniforms.uSISee.value, see);
  assert.throws(() => si.withoutSeeThrough(() => { throw new Error('x'); }));
  assert.equal(si.uniforms.uSISee.value, see);
  assert.equal(si.uniforms.uSIActive.value, 1);
});
