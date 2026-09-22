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

test('the viewer wires it by default (covers only behind the switch), at the two places part materials are registered, and before the reflection, AO and accumulator', () => {
  const main = readFileSync(join(root, 'viewer', 'js', 'main.js'), 'utf8');
  assert.equal((main.match(/seeIntoPatched\(key, newPartMaterial\(key\)\)/g) || []).length, 2);
  assert.equal((main.match(/materials\[key\] = newPartMaterial\(key\)/g) || []).length, 0, 'no registration bypasses the patch helper');
  assert.match(main, /if \(!ENTRY\.isPart\) seeInto = createSeeInto\(/);
  assert.match(main, /const SEE_INTO_COVERS = parseSeeInto\(location\.search\);/);
  // the back-cover preset stays behind the switch at BOTH places it enters: the pass list and the material patch
  assert.match(main, /if \(SEE_INTO_COVERS && \/\^BackCover\/\.test\(inst\.cfg\.node\)\)/);
  assert.match(main, /if \(key === 'BackCover' && SEE_INTO_COVERS\) seeInto\.patch\(/);
  /* since 2026-09-21 a back cover wearing translucent FILAMENT is patched too, as its own colour - the switch still owns the preset look */
  // no translucent part, no passes: `wanted` is gated on there being something to draw
  assert.match(main, /wanted: \(\) => \(!!SEE_INTO_COVERS \|\| seeIntoDriven\.size > 0\)/);
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
function fakeSeeInto(extra = {}) {
  let renders = 0;
  const R = {
    autoClear: true, shadowMap: { needsUpdate: false },
    getDrawingBufferSize: (v) => v.set(64, 48), getRenderTarget: () => null, setRenderTarget() {},
    getClearColor: (c) => c.set(0), getClearAlpha: () => 1, setClearColor() {}, clear() {}, render() { renders++; },
  };
  const S = new THREE.Scene(), C = new THREE.PerspectiveCamera();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const si = SI.createSeeInto({ THREE, renderer: R, scene: S, camera: C, presetKey: 'frosted',
    parts: () => [{ partId: 'bc1', meshes: [mesh] }], wanted: () => true, sceneKey: () => 'k', ...extra });
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

/* ---------------------------------------------------------------- option 1: no cover visible, no extra renders
   Astra 2026-09-17: "skip the behind-cover rendering when no eligible cover can contribute to the displayed image ...
   uncertain cases should render normally". The decision lives in main.js (`seeIntoCoversVisible`) and is extracted and
   CALLED here with fake instances - asserting on its source text would prove nothing (the relay-contract lesson). */
const mainSrc = readFileSync(join(root, 'viewer', 'js', 'main.js'), 'utf8');
function fnAt(src, needle) {
  const start = src.indexOf(needle);
  assert.ok(start >= 0, `"${needle}" not found in main.js - if it was renamed, update this test rather than deleting it`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  assert.fail(`unterminated function for "${needle}"`);
}
const coversVisibleWith = new Function('THREE', 'manifest', 'PAGES', 'cur', 'instances', 'tweens', 'fpFocus', 'dFocus', 'assembledBox', 'camera', 'seeIntoDriven', 'typeByNode',
  `${mainSrc.match(/const SEE_INTO_TYPES = .*;/)[0]}\n${fnAt(mainSrc, 'function basePos(')}\n${fnAt(mainSrc, 'function seeIntoCoversVisible(')}\nreturn seeIntoCoversVisible();`);

function scene(over = {}) {
  const inst = (id, node, rides, pos) => ({ cfg: { id, node, rides, pos }, staged: false,
    group: { visible: true, position: new THREE.Vector3(...pos), children: [{ position: new THREE.Vector3() }] } });
  const list = [inst('d0', 'DecorDrawer_185-1W-1H', null, [0, 10, 5]), inst('bc0', 'BackCover_EdgeLabel_1W-1H', 'd0', [0, 30, 92])];
  const s = {
    manifest: { steps: [{}, {}], stages: {}, incomplete: null }, PAGES: [{ cover: true }, {}, {}, { outro: true }],
    cur: 2, instances: new Map(list.map((x) => [x.cfg.id, x])), tweens: new Set(), fpFocus: { id: null }, dFocus: { carrier: null },
    assembledBox: new THREE.Box3(new THREE.Vector3(-50, 0, -50), new THREE.Vector3(50, 60, 50)),
    camera: { position: new THREE.Vector3(0, 40, 400) },      // outside the build, looking in
    seeIntoDriven: new Set(),                                 // no supported component wears translucent filament
    typeByNode: { 'DecorDrawer_185-1W-1H': 'Drawer', 'BackCover_EdgeLabel_1W-1H': 'BackCover', 'Faceplate_EdgeLabel_1W-1H': 'Faceplate' },
  };
  Object.assign(s, over);
  s.cover = s.instances.get('bc0'); s.drawer = s.instances.get('d0');
  return s;
}
const ask = (s) => coversVisibleWith(THREE, s.manifest, s.PAGES, s.cur, s.instances, s.tweens, s.fpFocus, s.dFocus, s.assembledBox, s.camera, s.seeIntoDriven, s.typeByNode);

test('hidden covers: the finished build with every drawer shut needs no behind-cover render', () => {
  assert.equal(ask(scene()), false);
});

test('hidden covers: anything that could expose one answers "render"', () => {
  let s = scene(); s.drawer.group.position.z += 40;            // a drawer peek / deep pull
  assert.equal(ask(s), true, 'open drawer');
  s = scene(); s.cover.group.children[0].position.y = 4;        // the cover's own removal ritual
  assert.equal(ask(s), true, 'cover lifted');
  s = scene(); s.tweens.add({});
  assert.equal(ask(s), true, 'a tween is running');
  s = scene({ cur: 1 });
  assert.equal(ask(s), true, 'mid-assembly page');
  s = scene({ cur: 0 });
  assert.equal(ask(s), true, 'the cover page');
  s = scene({ cur: 3 });
  assert.equal(ask(s), true, 'the outro');
  s = scene(); s.fpFocus.id = 'fp0';
  assert.equal(ask(s), true, 'faceplate isolation');
  s = scene(); s.dFocus.carrier = {};
  assert.equal(ask(s), true, 'drawer focus');
  s = scene(); s.manifest.incomplete = { areas: 1 };
  assert.equal(ask(s), true, 'the in-progress preview draws planned covers translucent');
  s = scene(); s.cover.staged = true;
  assert.equal(ask(s), true, 'a staged cover sits on a bench');
  s = scene(); s.cover.cfg.rides = 'gone';
  assert.equal(ask(s), true, 'a cover whose carrier cannot be found is not ruled out');
  s = scene(); s.camera.position.set(0, 30, 0);
  assert.equal(ask(s), true, 'a camera inside the build sees covers directly (p62 measured the whole frame)');
});

test('hidden covers: an invisible cover is not a reason to render, even with its drawer open', () => {
  const s = scene();
  s.cover.group.visible = false; s.drawer.group.position.z += 40;
  assert.equal(ask(s), false);
});

test('prepare: while no cover is visible nothing renders and the see-through is off, and it returns the same frame it is needed', () => {
  let visible = false;
  const { si, runs } = fakeSeeInto({ coversVisible: () => visible });
  si.prepare({ moving: false });
  assert.equal(runs(), 0, 'no passes while hidden');
  assert.equal(si.uniforms.uSISee.value, 0, 'no see-through, so no stale interior is sampled');
  assert.equal(si.uniforms.uSIActive.value, 1, 'the frosted colour stays');
  si.prepare({ moving: false }); si.prepare({ moving: true });
  assert.equal(runs(), 0);
  visible = true;
  si.prepare({ moving: false });     // the camera never moved and the scene key is unchanged
  assert.equal(runs(), 1, 'the frame a cover becomes visible runs the passes');
  assert.equal(si.uniforms.uSISee.value, SI.SEE_INTO_PRESETS.frosted.see);
  si.prepare({ moving: false });
  assert.equal(runs(), 1, 'then reused while still');
  visible = false;
  si.prepare({ moving: false });
  assert.equal(si.uniforms.uSISee.value, 0);
  visible = true;
  si.prepare({ moving: false });
  assert.equal(runs(), 2, 'a fresh interior after every hidden stretch');
  assert.equal(si.stats.skippedHidden, 4);
});

test('the skip switch: off by default, askable, and always disable-able for diagnosis', () => {
  assert.equal(SI.parseSeeIntoSkip(''), SI.SEE_INTO_SKIP_DEFAULT);
  assert.equal(SI.parseSeeIntoSkip('?siskip=state'), 'state');
  assert.equal(SI.parseSeeIntoSkip('?siskip=off'), null, 'off wins whatever the default becomes');
  assert.equal(SI.parseSeeIntoSkip('?siskip=1'), SI.SEE_INTO_SKIP_DEFAULT, 'an unknown value is not a switch');
  assert.ok(SI.SEE_INTO_SKIP_DEFAULT === null || SI.SEE_INTO_SKIP_DEFAULT === 'state');
});

test('hidden covers: a grip wearing translucent filament is never treated as hidden', () => {
  /* Astra 2026-09-17: the closed-drawer skip cannot claim a faceplate grip - it faces the room. */
  const s = scene();
  const fp = { cfg: { id: 'fp0', node: 'Faceplate_EdgeLabel_1W-1H', pos: [0, 30, 95] }, staged: false,
    group: { visible: true, position: new THREE.Vector3(0, 30, 95), children: [{ position: new THREE.Vector3() }] } };
  s.instances.set('fp0', fp);
  assert.equal(ask(s), false, 'with no translucent pick the plate is just another part');
  s.seeIntoDriven = new Set(['Faceplate:GRIP']);
  assert.equal(ask(s), true, 'a translucent grip on screen means the passes run');
  fp.group.visible = false;
  assert.equal(ask(s), false, 'a hidden plate cannot show its grip');
});

test('filament-driven patch: a supported component keeps its own colour, the reference cover wears the preset', () => {
  /* Astra 2026-09-17: "Don't force the frosted colour onto parts assigned opaque filament" - and a translucent pick
     should look like the filament picked, not like the cover's preset. The flag and the print axis are PER MATERIAL. */
  const { si } = fakeSeeInto();
  const own = si.patch(new THREE.MeshPhysicalMaterial(), [0, 1, 0], { own: true });
  const ref = si.patch(new THREE.MeshPhysicalMaterial(), [0, 0, 1]);
  assert.deepEqual(own.userData.seeInto, { own: true, axis: [0, 1, 0] });
  assert.deepEqual(ref.userData.seeInto, { own: false, axis: [0, 0, 1] });
  const compile = (m) => { const sh = { vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader, uniforms: {} }; m.onBeforeCompile(sh, {}); return sh; };
  const a = compile(own), b = compile(ref);
  assert.equal(a.uniforms.uSIOwn.value, 1);
  assert.equal(b.uniforms.uSIOwn.value, 0);
  assert.deepEqual(a.uniforms.uSIAxisM.value.toArray(), [0, 1, 0], 'the grip carries its own print axis');
  assert.deepEqual(b.uniforms.uSIAxisM.value.toArray(), [0, 0, 1]);
  assert.ok(a.uniforms.uSISee === b.uniforms.uSISee, 'the pass parameters stay shared');
  assert.match(a.fragmentShader, /if \( uSIOwn < 0\.5 \) \{[\s\S]*diffuseColor\.rgb = uSIColor;/,
    'the preset colour override is behind the own-colour gate');
});

test('translucency is a property of the material, not of a face direction', () => {
  /* Astra 2026-09-17: "print direction should control printed surface detail and bed-contact texture, not decide which
     faces are made of translucent material." So the filament-driven branch must not consult the print axis at all, and
     the reference cover must keep the axis-weighted behaviour it was accepted with. */
  const surface = SI.FRAG_SURFACE;
  /* ⚠ THE BURIED LATTICE IS CUT OFF FIRST, deliberately: it reads the print axis to decide where the PRINTED STRUCTURE shows
     (only through the top skin that grew over the infill), which is exactly the "printed surface detail" Astra left to the
     print direction. What this test guards is the translucency itself - gSISee and gSIWrapK - which must not read it. */
  const ownAll = surface.slice(surface.indexOf('} else {'));
  const own = ownAll.includes('if ( uSILattice > 0.5 )') ? ownAll.slice(0, ownAll.indexOf('if ( uSILattice > 0.5 )')) : ownAll;
  const preset = surface.slice(surface.indexOf('if ( uSIOwn < 0.5 )'), surface.indexOf('} else {'));
  assert.ok(!own.includes('uSIAxisM'), 'a filament-driven part reads no print axis for its translucency in this shader');
  assert.ok(!/gSISee|gSIWrapK/.test(ownAll.slice(own.length)), 'and the lattice block leaves both translucency weights alone');
  assert.match(own, /gSISee = 1\.0;/, 'it shows what is behind it on every face');
  assert.match(own, /gSIWrapK = 1\.0;/, 'and the scatter wrap is on every face, because it is one material');
  assert.match(preset, /gSISee = siAxis;/, 'the reference cover keeps its axis-weighted see-through');
  assert.match(preset, /gSIWrapK = 1\.0 - siAxis;/, 'and its walls keep the wrap');
  /* the two weights must reach their two consumers, or the separation is only in the comments */
  assert.ok(SI.WRAP_TO.includes('gSIWrapK * uSIActive') && !SI.WRAP_TO.includes('gSISee'),
    'the light wrap consumes the wrap weight');
  assert.ok(SI.FRAG_COMPOSITE.includes('mix( 1.0, gSISee,') && !SI.FRAG_COMPOSITE.includes('gSIWrapK'),
    'the see-through consumes the see weight');
  assert.ok(SI.FRAG_HEAD.includes('float gSISee = 0.0;') && SI.FRAG_HEAD.includes('float gSIWrapK = 0.0;'),
    'both are declared, so a fragment that runs neither branch is opaque and unwrapped');
  assert.ok(!surface.includes('gSIGate') && !SI.FRAG_COMPOSITE.includes('gSIGate') && !SI.WRAP_TO.includes('gSIGate'),
    'the one-value-for-two-jobs name is gone, so it cannot come back by accident');
});

/* ---- the performance fallback: simplified translucency above a measured build-complexity limit --------------------
   Joey asked for it and Astra scoped it (2026-09-17): keep the filament and its colour, drop the see-through when the
   whole-scene render would be too expensive, decide on a build or pick change rather than during an orbit, and keep a
   user override. These call the real functions out of main.js; the limit itself is measured (p65). */
const detailWith = (mode, drawsPerPart, parts) => new Function('instances', 'location', 'SEE_INTO_DETAIL_LIMIT_OVERRIDE',
  `${fnAt(mainSrc, 'function parseSeeIntoDetail(')}
   ${fnAt(mainSrc, 'function partMeshCount(')}
   const SEE_INTO_DETAIL_LIMIT = SEE_INTO_DETAIL_LIMIT_OVERRIDE;
   let seeIntoDetailMode = parseSeeIntoDetail(location.search);
   ${fnAt(mainSrc, 'function seeIntoDetailAllowed(')}
   return { allowed: seeIntoDetailAllowed(), draws: partMeshCount(), mode: seeIntoDetailMode };`)(
  new Map(Array.from({ length: parts }, (_, i) => [i, {
    group: { visible: true, traverse(f) { f(this); for (let m = 0; m < drawsPerPart; m++) f({ isMesh: true, visible: true }); } },
  }])), { search: mode }, 250);

test('the supported keys are every zone of every faceplate-assembly part in the build', () => {
  /* Joey 2026-09-21: "it make sense to take the majority of faceplate parts utilize it". The keys come from what is
     MOUNTED, so a family's own zones appear without a table, and structural parts never do. */
  const mesh = (zone) => ({ isMesh: true, userData: { zone } });
  const inst = (node, zones) => ({ cfg: { node }, group: { traverse(f) { for (const z of zones) f(mesh(z)); } } });
  const keysWith = (list, typeByNode) => new Function('instances', 'typeByNode', 'zoneKey',
    `${mainSrc.match(/const SEE_INTO_TYPES = .*;/)[0]}
     ${fnAt(mainSrc, 'function seeIntoComponentKeys(')}
     return seeIntoComponentKeys();`)(new Map(list.map((x, i) => [i, x])), typeByNode, (t, z) => (z ? `${t}:${z}` : t));
  const T = { FP: 'Faceplate', AC: 'Accent', LB: 'Label', BC: 'BackCover', HD: 'Handle', CS: 'Case', DR: 'Drawer' };
  const keys = keysWith([inst('FP', ['', 'FACE', 'GRIP', 'GRIP ACCENT']), inst('AC', ['']), inst('LB', ['']),
    inst('BC', ['']), inst('HD', ['']), inst('CS', ['']), inst('DR', [''])], T).sort();
  assert.deepEqual(keys, ['Accent', 'BackCover', 'Faceplate', 'Faceplate:FACE', 'Faceplate:GRIP', 'Faceplate:GRIP ACCENT', 'Handle', 'Label']);
  assert.ok(!keys.includes('Case') && !keys.includes('Drawer'), 'structural parts stay out of scope');
  assert.deepEqual(keysWith([], T), [], 'nothing mounted, nothing supported');
});

test('the fallback is decided by the scene DRAW count, so a zoned plate is charged per zone', () => {
  /* Joey 2026-09-18: does a Chevron plate's many printed chevrons count once or many times? In the viewer a faceplate
     is ONE placed part whatever it prints as, but a zoned plate draws once per zone - so the measure must be draws,
     not parts, or a 4-zone Classic build reads as cheap as a 2-zone Chevron one. */
  assert.equal(detailWith('', 2, 100).draws, 200, '100 two-zone parts are 200 draws');
  assert.equal(detailWith('', 4, 100).draws, 400, 'the same 100 parts with four zones each are 400');
  assert.equal(detailWith('', 2, 100).allowed, true, '200 draws is inside the measured limit');
  assert.equal(detailWith('', 4, 100).allowed, false, '400 draws is not - and it is the same part count');
  assert.equal(detailWith('', 1, 250).allowed, true, 'the limit itself is allowed (<=)');
  assert.equal(detailWith('', 1, 251).allowed, false);
});

test('the override wins over the measured rule, in both directions', () => {
  assert.equal(detailWith('?sidetail=full', 4, 400).allowed, true, 'the user can ask for the full effect anyway');
  assert.equal(detailWith('?sidetail=simple', 1, 10).allowed, false, 'and can force the fallback on a tiny build');
  assert.equal(detailWith('?sidetail=nonsense', 1, 10).mode, 'auto', 'anything else is the measured rule');
  assert.equal(detailWith('', 1, 10).mode, 'auto');
});

test('simplified translucency keeps the filament but runs no passes', () => {
  /* the two things that must both be true, or the fallback is either a lie or not a saving: the driven-key test says
     NO (so nothing is patched and the interior pass has nothing to serve), and the see-into scope set is empty (so
     `seeIntoCoversVisible` does not force the passes on and `parts()` collects no grip) */
  const src = fnAt(mainSrc, 'function syncSeeIntoComponents(');
  assert.match(src, /const simplify = picked\.size > 0 && !seeIntoDetailAllowed\(\);/, 'the decision is taken here');
  assert.match(src, /const want = simplify \? new Set\(\) : picked;/, 'and simplified means an EMPTY driven set');
  const key = mainSrc.slice(mainSrc.indexOf('const seeIntoDrivenKey ='), mainSrc.indexOf('/* Translucency is STRUCTURAL'));
  assert.match(key, /&& !seeIntoSimplified/, 'and no material is patched while simplified');
  /* and it is decided on a pick or a build change, never per frame: the only callers are applyPalette (a pick) and the
     override button. A call from the render loop would switch it mid-orbit, which Astra ruled out. */
  const callers = [...mainSrc.matchAll(/^.*syncSeeIntoComponents\(\).*$/gm)].map((m) => m[0].trim());
  for (const line of callers) {
    assert.ok(/function syncSeeIntoComponents|syncSeeIntoComponents\(\);\s*\/\/ a translucent filament|if \(syncSeeIntoComponents\(\)\)/.test(line)
      || /assert|fnAt|match/.test(line),
      `unexpected caller of syncSeeIntoComponents - is it per frame? ${line}`);
  }
});

test('the grazing term is what modulates a filament-driven part, and it is not the print axis', () => {
  /* The only thing left standing between "translucent material" and "how much shows through here" is path length at a
     shallow angle. Astra: don't simply remove the gate and assume the flat-cover method transfers - this pins WHAT
     replaced it, and the visual check for slopes and edges is in integration/results/p63. */
  const comp = SI.FRAG_COMPOSITE;
  assert.match(comp, /float nvS = clamp\( dot\( geometryNormal, geometryViewDir \)/, 'it measures the view angle');
  assert.match(comp, /kSee \*= mix\( 1\.0, 1\.0 - Fg, uSIGraze \);/, 'and scales the see-through by it');
  assert.ok(comp.indexOf('float kSee') < comp.indexOf('kSee *= mix'), 'the graze applies after the face weight');
});
