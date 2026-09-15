/* THE BUILD PLATE'S BED-SURFACE FINISH — viewer/js/bed-finish.js, and what node can prove about it.
 *
 * Node cannot compile GLSL or look at a frame, so what the finish DRAWS is checked in the browser
 * (the debug hook's `bedFinish.check()` and the readback views). What node can prove is everything
 * the picture silently depends on:
 *
 *   1. what a saved build MEANS - a stored plate is kept, a missing or unknown one reads as Powder
 *   2. the patch composes on three r185's REAL shader sources after the REAL vendored relief, with
 *      every anchor found exactly once and its block where the relief's work is already done
 *   3. Powder and Smooth are one program, Holographic another, and clones share the switch
 *   4. the per-part geometry the contact test reads
 *   5. the premise the in-shader tangents rest on, over every GLB the viewer ships
 *   6. the one print pose this feature added, the EdgeLabel accent's
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { glbJson, worldSpans } from './lib/glb-spans.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = (...p) => pathToFileURL(join(root, ...p)).href;

/* The vendored relief imports the bare specifier 'three', which the browser resolves through the
   page's import map. Node has no import map, so map it to the same vendored file. Each test file
   runs in its own process, so this hook reaches no other suite. */
const THREE_URL = url('viewer', 'vendor', 'three', 'three.module.js');
register('data:text/javascript,' + encodeURIComponent(
  `export async function resolve(s, c, n) { return s === 'three' ? { url: ${JSON.stringify(THREE_URL)}, shortCircuit: true } : n(s, c); }`));

const THREE = await import(THREE_URL);
const { applyLayerDetail, LAYER_DETAIL_DEFAULTS } = await import(url('viewer', 'js', 'vendor', 'layer-detail.js'));
const BF = await import(url('viewer', 'js', 'bed-finish.js'));
const { generateManifest, buildAxisForType } = await import(url('viewer', 'js', 'generate.js'));

/* ── 1. what a saved build means ─────────────────────────────────────────────────────────── */

test('a stored plate is kept; a build that never stored one, or stored nonsense, reads as Powder', () => {
  assert.deepEqual([...BF.PLATE_FINISHES], ['powder', 'smooth', 'holographic'], 'the selector order moved');
  /* Joey 2026-09-14: Powder-coated is the default for EVERY build without a stored plate - new ones,
     and the links, sessions and files made before the field existed. One default, no legacy branch. */
  assert.equal(BF.DEFAULT_PLATE, 'powder');
  assert.equal('NEW_BUILD_PLATE' in BF, false, 'a separate new-build default came back');
  assert.equal('LEGACY_PLATE' in BF, false, 'a separate legacy reading came back');
  for (const f of BF.PLATE_FINISHES) assert.equal(BF.plateFinishOf({ buildPlate: f }), f);
  /* ⚠ an EXPLICIT Smooth must survive: it is the one stored value that differs from the default */
  assert.equal(BF.plateFinishOf({ buildPlate: 'smooth' }), 'smooth', 'a saved Smooth was overridden by the default');
  for (const b of [null, undefined, {}, { buildPlate: null }, { buildPlate: '' }, { buildPlate: 'carbon' },
    { buildPlate: 'Smooth' }, { buildPlate: true }, { buildPlate: {} }]) {
    assert.equal(BF.plateFinishOf(b), 'powder', `${JSON.stringify(b)} did not read as Powder`);
  }
});

test('Powder and Smooth differ only in a uniform; the settle hook moves only the fade window', () => {
  const u = BF.createBedFinishUniforms();
  assert.equal(BF.setBedFinish(u, 'powder'), 'powder');
  assert.equal(u.uPC.value, 1);
  assert.deepEqual([u.uPCFadeLo.value, u.uPCFadeHi.value], [...BF.POWDER_FADE.moving]);
  assert.equal(u.uBfHoloOp.value, 0);
  assert.equal(BF.setBedFinish(u, 'smooth'), 'smooth');
  assert.equal(u.uPC.value, 0);
  assert.equal(BF.setBedFinish(u, 'holographic'), 'holographic');
  assert.equal(u.uPC.value, 0);
  assert.equal(u.uBfHoloOp.value, BF.HOLO_OPACITY);
  assert.equal(BF.setBedFinish(u, 'nonsense'), 'powder', 'an unknown finish must fall back to the default');
  assert.equal(u.uPC.value, 1);
  BF.setBedFinish(u, 'powder', 'detail');
  assert.deepEqual([u.uPCFadeLo.value, u.uPCFadeHi.value], [...BF.POWDER_FADE.detail]);
  /* the Very High samples switch ONLY the representation: finish, holo and grain constants stay put */
  const before = Object.fromEntries(Object.entries(u).map(([k, v]) => [k, v.value]));
  BF.setGrainRepresentation(u, 'moving');
  assert.deepEqual([u.uPCFadeLo.value, u.uPCFadeHi.value], [...BF.POWDER_FADE.moving]);
  BF.setGrainRepresentation(u, 'detail');
  const after = Object.fromEntries(Object.entries(u).map(([k, v]) => [k, v.value]));
  assert.deepEqual(after, before, 'switching the representation touched something besides the fade window');
  BF.setGrainRepresentation(u, 'bogus');
  assert.deepEqual([u.uPCFadeLo.value, u.uPCFadeHi.value], [...BF.POWDER_FADE.moving],
    'an unknown representation must fall back to the folded (moving) grain');
  /* the approved grain itself, as the lab page configured it */
  assert.deepEqual({ ...BF.POWDER_GRAIN }, { cellMm: 0.25, fine: 0.7, tiltDeg: 28, rough: 0.15 });
  assert.equal(u.uPCCell.value, 0.25);
});

test('the settle switch turns the detail grain AND the layer lines on together, and off together', () => {
  const u = BF.createBedFinishUniforms();
  /* a fresh set draws no lines: every frame that is not a settle sample, on every tier */
  assert.equal(u.uLLOn.value, 0, 'the layer lines are on by default - every ordinary frame would draw them');
  BF.setBedFinish(u, 'smooth');
  const finishOnly = (s) => Object.fromEntries(Object.entries(s)
    .filter(([k]) => !['uPCFadeLo', 'uPCFadeHi', 'uLLOn', 'uLLPxRatio'].includes(k)).map(([k, v]) => [k, v.value]));
  const before = finishOnly(u);
  BF.setSettleDetail(u, true, 2);
  assert.equal(u.uLLOn.value, 1);
  assert.equal(u.uLLPxRatio.value, 2, 'the lines are sized in CSS px and did not get the pixel ratio');
  assert.deepEqual([u.uPCFadeLo.value, u.uPCFadeHi.value], [...BF.POWDER_FADE.detail]);
  BF.setSettleDetail(u, false);
  assert.equal(u.uLLOn.value, 0, 'switching the settle detail off left the lines on');
  assert.deepEqual([u.uPCFadeLo.value, u.uPCFadeHi.value], [...BF.POWDER_FADE.moving]);
  assert.deepEqual(finishOnly(u), before, 'the settle switch changed the finish or a constant');
  assert.equal(u.uPC.value, 0, 'a settle sample turned a Smooth plate into Powder');
  for (const bad of [0, -1, NaN, undefined, '2']) {
    BF.setSettleDetail(u, true, bad);
    assert.equal(u.uLLPxRatio.value, 2, `pixel ratio ${bad} was written`);
  }
});

test('the layer lines: Joey\'s 0.8 mm cap, and the numbers that must move with the relief', () => {
  /* Joey 2026-09-14, after the prototype page: "anything above 0.8mm looks kind of too big and crazy" */
  assert.equal(BF.LAYER_LINES.maxMm, 0.8);
  const u = BF.createBedFinishUniforms();
  assert.equal(u.uLLMaxMm.value, 0.8);
  /* the cap is a whole number of octaves above the pitch, so the shader's round-down is exact */
  assert.equal(Math.log2(BF.LAYER_LINES.maxMm / BF.LAYER_LINES.pitchMm) % 1, 0);
  /* the finest drawn spacing IS the relief's pitch - main.js passes it to the relief by name */
  const main = readFileSync(join(root, 'viewer', 'js', 'main.js'), 'utf8');
  const pitch = Number((main.match(/const LAYER_PITCH_MM = ([\d.]+);/) || [])[1]);
  assert.equal(BF.LAYER_LINES.pitchMm, pitch, 'the lines and the relief disagree on the layer pitch - '
    + 'their lattices would drift apart and the hand-off would shift');
  /* the hand-off is the relief's own visibility ramp, which main.js does not override */
  assert.deepEqual([...BF.LAYER_LINES.handoffPx],
    [LAYER_DETAIL_DEFAULTS.cutoffPxPerLayer, LAYER_DETAIL_DEFAULTS.fullDetailPxPerLayer]);
  assert.ok(!/cutoffPxPerLayer|fullDetailPxPerLayer/.test(main),
    'main.js now sets the relief\'s visibility thresholds - hand the lines the same numbers');
  assert.deepEqual([u.uLLHandLo.value, u.uLLHandHi.value], [...BF.LAYER_LINES.handoffPx]);
});

/* ── 2. the patch on three's real sources ────────────────────────────────────────────────── */

/* three resolves #include directives AFTER onBeforeCompile - the same regex, recursively */
const resolveIncludes = (s) => s.replace(/^[ \t]*#include +<([\w\d./]+)>/gm, (_, name) => {
  const chunk = THREE.ShaderChunk[name];
  assert.ok(chunk !== undefined, `unknown chunk ${name}`);
  return resolveIncludes(chunk);
});
const shaderFor = (lib) => ({
  uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib[lib].uniforms),
  vertexShader: THREE.ShaderLib[lib].vertexShader,
  fragmentShader: THREE.ShaderLib[lib].fragmentShader,
});
const relief = (m, up) => applyLayerDetail(m, {
  layerPitchMm: 0.2, tiltDeg: 22, pixelRatio: 1, printUp: new THREE.Vector3(...up),
});
/* the viewer's own clone helper, verbatim in behaviour: own hooks only */
const cloneMaterial = (mat) => {
  const m = mat.clone();
  for (const k of ['onBeforeCompile', 'customProgramCacheKey']) {
    if (Object.prototype.hasOwnProperty.call(mat, k)) m[k] = mat[k];
  }
  return m;
};
const count = (s, needle) => s.split(needle).length - 1;

for (const [lib, Ctor] of [['physical', THREE.MeshPhysicalMaterial], ['standard', THREE.MeshStandardMaterial]]) {
  test(`${lib}: the finish chains after the relief, every block once, in shader order`, () => {
    const u = BF.createBedFinishUniforms();
    const m = new Ctor();
    relief(m, [0, 1, 0]);
    BF.applyBedFinish(m, { axis: [0, 1, 0], uniforms: u });

    const sh = shaderFor(lib);
    m.onBeforeCompile(sh, null);
    const vs = resolveIncludes(sh.vertexShader), fs = resolveIncludes(sh.fragmentShader);

    for (const [src, needle] of [[vs, 'vObjPos = aBfMm;'], [vs, 'attribute vec3 aBfMm;'],
      [vs, 'vLLh = dot( position, axV )'], [vs, 'varying float vLLh;'], [fs, 'varying float vLLh;'],
      [fs, 'gBFContact = smoothstep( 0.82, 0.94'], [fs, 'if ( uPC > 0.0 ) {'], [fs, 'vec2 pcDomeGrad( vec2 q )'],
      [fs, 'if ( uLLOn > 0.5 ) {'], [fs, 'if ( uBFDbg > 3.5 )'], [fs, 'if ( uBFDbg > 2.5 )']]) {
      assert.equal(count(src, needle), 1, `${needle} appears ${count(src, needle)} times`);
    }
    /* the relief really is there too - chaining did not discard it */
    assert.ok(fs.includes('ldApplic'), 'the relief block is missing - the chain dropped it');

    /* ORDER, in the shader three will compile: relief normal work -> the finish's plain restore and
       grain -> the layer lines -> the lights reading colour, normal and roughness -> the debug views */
    const at = (needle) => { const i = fs.indexOf(needle); assert.ok(i >= 0, `${needle} not found`); return i; };
    const reliefAt = at('float ldApplic');
    const contactAt = at('gBFContact = smoothstep( 0.82, 0.94');
    const grainAt = at('if ( uPC > 0.0 ) {');
    const linesAt = at('if ( uLLOn > 0.5 ) {');
    const lightsAt = at('material.roughness = max(');
    const diffuseAt = at('material.diffuseColor = diffuseColor.rgb');
    const debugAt = at('if ( uBFDbg > 2.5 )');
    assert.ok(reliefAt < contactAt, 'the finish runs before the relief it has to undo');
    assert.ok(contactAt < grainAt, 'the grain runs before the plain restore under it');
    assert.ok(grainAt < linesAt, 'the layer lines run before the contact weight and grain they read');
    assert.ok(linesAt < lightsAt && linesAt < diffuseAt,
      'the layer lines run after the lights have read the colour and normal they change');
    assert.ok(lightsAt < debugAt);
    /* the layer lines' vertex coordinate is written after the position attribute exists */
    assert.ok(vs.indexOf('vec3 transformed = vec3( position );') < vs.indexOf('vLLh = dot( position, axV )'));

    /* the uniforms: the SHARED set is the caller's object, the axis is the material's own */
    assert.equal(sh.uniforms.uPC, u.uPC, 'the finish uniforms were copied, not shared');
    assert.deepEqual(sh.uniforms.uAxis.value, [0, 1, 0]);
    assert.match(m.customProgramCacheKey(), /\|ld\|bf1$/, 'the cache key does not carry both patches');
    assert.ok(!('uBfHoloTex' in sh.uniforms), 'the profile program binds the plate map');
  });
}

test('holographic is a different program, and only it samples the plate map and gates clearcoat', () => {
  const u = BF.createBedFinishUniforms();
  const tex = { value: null };
  const plain = new THREE.MeshPhysicalMaterial();
  const holo = new THREE.MeshPhysicalMaterial({ clearcoat: 1 });
  BF.applyBedFinish(plain, { axis: [0, 1, 0], uniforms: u });
  BF.applyBedFinish(holo, { axis: [0, 1, 0], uniforms: u, holo: { texture: tex, roughness: 0.14 } });
  assert.notEqual(plain.customProgramCacheKey(), holo.customProgramCacheKey(),
    'two different shader sources share a cache key - three would hand one the other\'s program');

  const sh = shaderFor('physical');
  holo.onBeforeCompile(sh, null);
  const fs = resolveIncludes(sh.fragmentShader);
  assert.equal(count(fs, 'texture2D( uBfHoloTex, vBfUv )'), 1);
  assert.equal(sh.uniforms.uBfHoloTex, tex, 'the plate map is not the shared uniform object');
  assert.equal(sh.uniforms.uBfHoloRough.value, 0.14);
  const cc = fs.indexOf('material.clearcoat *= gBFContact;');
  assert.ok(cc > fs.indexOf('material.clearcoat = clearcoat;'),
    'the clearcoat gate runs before three sets material.clearcoat - it would be overwritten');
  /* the layer lines are in this program too, AFTER the pattern: the pattern's view-angle term must
     read the normal it read before the lines existed */
  assert.equal(count(fs, 'if ( uLLOn > 0.5 ) {'), 1, 'the holographic program lost the layer lines');
  assert.ok(fs.indexOf('texture2D( uBfHoloTex, vBfUv )') < fs.indexOf('if ( uLLOn > 0.5 ) {'),
    'the layer lines bend the normal before the holographic pattern reads it');
});

/* ── 2b. the layer lines sit on the relief's lattice ─────────────────────────────────────── */

test('⚔ a drawn seam lands on a relief valley: same coordinate, same bead convention', () => {
  /* Node cannot run the GLSL, so this pins the two conventions the alignment is derived from, on
     BOTH sides - an edit to either breaks it here rather than as bands that jump half a layer where
     the relief takes over. The pixels are checked in the browser. */
  const reliefSrc = readFileSync(join(root, 'viewer', 'js', 'vendor', 'layer-detail.js'), 'utf8');
  /* the relief's coordinate: raw position along its covector, at the scale modelMatrix gives it */
  assert.ok(reliefSrc.includes('float ldAxial = length( ( modelMatrix * vec4( normalize( uLDCovectorObj ), 0.0 ) ).xyz );'));
  assert.ok(reliefSrc.includes('vLDPhase = dot( position, ldCovObj );'));
  /* and its bead: crest at integer phase */
  assert.ok(reliefSrc.includes('ldShape += wn * sin( n * ldT );'));
  assert.ok(reliefSrc.includes('normal = normalize( ldN0 + ldAcross * ldSlope );'));

  const m = new THREE.MeshPhysicalMaterial();
  BF.applyBedFinish(m, { axis: [0, 1, 0], uniforms: BF.createBedFinishUniforms() });
  const sh = shaderFor('physical');
  m.onBeforeCompile(sh, null);
  const vs = resolveIncludes(sh.vertexShader), fs = resolveIncludes(sh.fragmentShader);
  assert.ok(vs.includes('vLLh = dot( position, axV ) * length( ( modelMatrix * vec4( axV, 0.0 ) ).xyz );'),
    'the lines no longer measure height the way the relief measures phase');
  assert.ok(fs.includes('float x = ( vLLh - 0.5 * uLLPitch ) / S;'), 'the seam moved off the half-integer phase');
  assert.ok(fs.includes('slopeLL += wO * sin( 6.2831853 * x ) * A;'));
  assert.ok(fs.includes('normal = normalize( normal - ( acLL / acLen ) * slopeLL'), 'the bead sign flipped');

  /* what those strings amount to, evaluated: at the true pitch the lines' bead IS the relief's, and
     every octave's seam is a relief valley (half-integer phase) */
  const p = BF.LAYER_LINES.pitchMm;
  for (let i = 0; i < 200; i++) {
    const h = (i * 0.137) % 7 - 3.5;
    const lines = -Math.sin(2 * Math.PI * ((h - 0.5 * p) / p));
    const relief = Math.sin(2 * Math.PI * (h / p));
    assert.ok(Math.abs(lines - relief) < 1e-9, `bead differs at h ${h}`);
  }
  for (const k of [0, 1, 2]) for (const m2 of [-3, 0, 5]) {
    const h = p * 0.5 + m2 * p * 2 ** k;                        // x = m2, an integer: a drawn seam
    const phase = h / p;
    assert.ok(Math.abs((phase % 1 + 1) % 1 - 0.5) < 1e-9, `octave ${k} seam at phase ${phase}`);
  }
});

test('⚔ the seam darkening averages to exactly zero, is darkest on the seam, and each harmonic is band-limited', () => {
  /* Review 01a0a0b7 (terra): the first version subtracted uLLWidth from a smoothstep seam whose tail
     d = |fract - 0.5| truncates once fpC > width/2 - mean 0.35312, not 0.35 - and band-limited only
     the fundamental while the seam's 2nd harmonic crossed the sampling limit inside the fade band. */
  const m = new THREE.MeshPhysicalMaterial();
  BF.applyBedFinish(m, { axis: [0, 1, 0], uniforms: BF.createBedFinishUniforms() });
  const sh = shaderFor('physical');
  m.onBeforeCompile(sh, null);
  const fs = resolveIncludes(sh.fragmentShader);
  for (const line of [
    'for ( int n = 1; n <= 4; n++ ) {',
    'float An = 1.0 - smoothstep( uLLBandLo, uLLBandHi, fn * fpC );',
    'if ( An <= 0.0 ) break;',
    'float fpS = max( fpC, 0.08 ) + pow( max( 0.02 - abs( fpC - 0.08 ), 0.0 ), 2.0 ) / 0.08;',
    'float bx = 3.14159265 * 2.0 * fn * fpS;',
    'float soft = bx < 1e-4 ? 1.0 : sin( bx ) / bx;',
    'albedoLL += wO * An * soft * ( 2.0 * sin( 3.14159265 * fn * uLLWidth ) / ( 3.14159265 * fn ) ) * cos( 6.2831853 * fn * x );',
  ]) assert.equal(count(fs, line), 1, `the seam series lost or duplicated: ${line}`);
  assert.ok(!/uLLWidth\s*\)\s*\*\s*A|seam\s*-\s*uLLWidth/.test(fs), 'a constant is subtracted from the seam again');

  /* the same series on the CPU, term for term */
  const [lo, hi] = BF.LAYER_LINES.bandCycles, w = BF.LAYER_LINES.width;
  assert.ok(lo < hi && hi < 0.5, 'the band must end below 0.5 cycles per px, or a drawn harmonic\'s softening changes sign');
  const smooth = (e0, e1, v) => { const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const floorS = (fpC) => Math.max(fpC, 0.08) + Math.max(0.02 - Math.abs(fpC - 0.08), 0) ** 2 / 0.08;
  /* the softness floor is C1 (review 01a0a0b7: a bare max() changes the softening rate abruptly while
     zooming), and it is exactly fpC from 0.10 up */
  for (const at of [0.06, 0.08, 0.1]) {
    const e = 1e-6, left = (floorS(at) - floorS(at - e)) / e, right = (floorS(at + e) - floorS(at)) / e;
    assert.ok(Math.abs(left - right) < 1e-3, `the softness floor has a kink at ${at}: ${left} vs ${right}`);
  }
  for (const f of [0.1, 0.15, 0.3]) assert.equal(floorS(f), f);
  const series = (x, fpC) => {
    let s = 0;
    for (let n = 1; n <= 4; n++) {
      const An = 1 - smooth(lo, hi, n * fpC);
      if (An <= 0) break;
      const bx = Math.PI * 2 * n * floorS(fpC);
      assert.ok(bx < Math.PI, `harmonic ${n} drawn at ${n * fpC} cycles/px with its softening past a zero`);
      s += An * (bx < 1e-4 ? 1 : Math.sin(bx) / bx) * (2 * Math.sin(Math.PI * n * w) / (Math.PI * n)) * Math.cos(2 * Math.PI * n * x);
    }
    return s;
  };
  for (let j = 1; j < 90; j++) {
    const fpC = j * 0.005, N = 2000;                     // every footprint up to the end of the band
    let sum = 0, best = -Infinity, bestX = 0;
    for (let i = 0; i < N; i++) {
      const x = -0.5 + i / N, v = series(x, fpC);
      sum += v;
      if (v > best) { best = v; bestX = x; }
    }
    assert.ok(Math.abs(sum / N) < 1e-9, `fpC ${fpC}: the darkening does not average to zero (${sum / N})`);
    assert.ok(Math.abs(bestX) < 1e-3, `fpC ${fpC}: the darkest point is at x ${bestX}, not on the seam (the bead valley)`);
    assert.ok(series(0.5, fpC) < 0, `fpC ${fpC}: midway between seams is not lighter than the mean`);
  }
  /* and past the band nothing is drawn at all */
  assert.equal(series(0.1, hi), 0);
});

/* ── 2c. who turns the settle detail on ──────────────────────────────────────────────────── */

test('⚔ only a jittered Very High sample turns the settle detail on, and it is always turned off', () => {
  const main = readFileSync(join(root, 'viewer', 'js', 'main.js'), 'utf8');
  const start = main.indexOf('function accumFrame() {');
  assert.ok(start >= 0, 'accumFrame is gone');
  let i = main.indexOf('{', start), depth = 0, end = -1;
  for (; i < main.length; i++) {
    if (main[i] === '{') depth++;
    else if (main[i] === '}' && --depth === 0) { end = i; break; }
  }
  const fn = main.slice(start, end + 1);
  const ons = main.match(/setSettleDetail\([^)]*true/g) || [];
  assert.equal(ons.length, 1, `setSettleDetail(.., true) appears ${ons.length} times in main.js`);
  assert.match(fn, /if \(acc\.jitter\) setSettleDetail\(bedFinishU, true, renderer\.getPixelRatio\(\)\);/,
    'the settle detail is not gated on the jitter, or is not handed the pixel ratio');
  const on = fn.indexOf('setSettleDetail(bedFinishU, true');
  const render = fn.indexOf('renderer.render(scene, camera);', on);
  const fin = fn.indexOf('} finally {', on);
  const off = fn.indexOf('setSettleDetail(bedFinishU, false);', fin);
  assert.ok(on >= 0 && render > on && fin > render && off > fin,
    'the settle detail is not switched on before the sample render and off in its finally');
  assert.ok(!/uLLOn|uPCFadeLo|setGrainRepresentation/.test(main),
    'main.js writes a settle uniform directly - the one switch is setSettleDetail');
});

test('a clone carries the finish and SHARES the switch, so highlights and tiles follow it', () => {
  const u = BF.createBedFinishUniforms();
  const m = new THREE.MeshPhysicalMaterial();
  relief(m, [0, 0, -1]);
  BF.applyBedFinish(m, { axis: [0, 0, -1], uniforms: u });
  const c = cloneMaterial(m);
  assert.equal(c.customProgramCacheKey(), m.customProgramCacheKey(), 'a clone resolves to another program');
  const sh = shaderFor('physical');
  c.onBeforeCompile(sh, null);
  BF.setBedFinish(u, 'powder');
  assert.equal(sh.uniforms.uPC.value, 1, 'the clone did not see the finish change');
  BF.setBedFinish(u, 'smooth');
  assert.equal(sh.uniforms.uPC.value, 0);
  assert.equal(c.userData.bedFinish, 'profile');
});

test('a patch that lost an anchor THROWS - it never renders plain and passes for a result', () => {
  const m = new THREE.MeshPhysicalMaterial();
  BF.applyBedFinish(m, { axis: [0, 1, 0], uniforms: BF.createBedFinishUniforms() });
  const sh = shaderFor('physical');
  sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '');
  assert.throws(() => m.onBeforeCompile(sh, null), /emissivemap_fragment/);
  const twice = shaderFor('physical');
  twice.fragmentShader = twice.fragmentShader.replace('#include <emissivemap_fragment>',
    '#include <emissivemap_fragment>\n#include <emissivemap_fragment>');
  assert.throws(() => m.onBeforeCompile(twice, null), /found on 2 lines/);
});

/* ── 4. the per-part geometry ────────────────────────────────────────────────────────────── */

test('the bed plane passes through height 0 along the axis, over ALL of a part\'s meshes', () => {
  /* two meshes of one part printed face-down along -Z: the front plate at z 5..7 and a raised
     strip whose top is the lowest plane at z = 9 (face-down: highest z is on the bed) */
  const a = new Float32Array([0, 0, 5, 10, 0, 5, 0, 20, 7]);
  const b = new Float32Array([2, 2, 9, 8, 2, 9, 2, 18, 8]);
  const axis = [0, 0, -1];
  const { mm, uv, hMin } = BF.bedFaceAttributes([a, b], axis);
  assert.equal(hMin, -9);
  const height = (arr, k) => -arr[3 * k + 2] + 0;        // dot(p, axis); + 0 turns -0 into 0
  assert.equal(height(mm[1], 0), 0, 'the strip top is not at height 0');
  assert.equal(height(mm[0], 0), 4, 'the recessed plate is not 4 mm up');
  assert.equal(mm[0][0], 0, 'the in-plane coordinates moved');
  /* the pattern spans the PART (x 0..10, y 0..20) at ONE scale, its longer side (20 mm): a long,
     low part must not stretch the pattern into streaks */
  const near = (got, want) => got.every((v, i) => Math.abs(v - want[i]) < 1e-6);
  assert.ok(near([...uv[0].slice(0, 4)], [0, 0, 0.5, 0]), `plate uv ${[...uv[0].slice(0, 4)]}`);
  assert.ok(near([...uv[1].slice(0, 2)], [0.1, 0.1]), `strip uv ${[...uv[1].slice(0, 2)]}`);
  assert.ok(near([...uv[0].slice(4, 6)], [0, 1]), 'the longer side does not span 0..1');
});

test('an axis that is not a signed unit axis is refused, not approximated', () => {
  const p = [new Float32Array([0, 0, 0, 1, 1, 1, 2, 0, 1])];
  for (const bad of [[0, 0.7071, 0.7071], [0, 0, 0], [0, 2, 0], [1, 0, 1e-3]]) {
    assert.throws(() => BF.bedFaceAttributes(p, bad), /signed unit axis/, JSON.stringify(bad));
  }
  assert.throws(() => BF.applyBedFinish(new THREE.MeshPhysicalMaterial(), { axis: [0, 0, 0], uniforms: {} }), /zero axis/);
});

/* ── 5. the premise of the in-shader tangents ────────────────────────────────────────────── */

/* The lab transformed the grain tangents into each MESH's frame; the viewer derives them from the
   part-frame axis once per material. The two agree exactly while no mesh sits under a rotated or
   non-uniformly scaled node - so that is what is asserted, over every file the viewer loads. */
const nodeIsRigidScale = (n) => {
  if (n.matrix) return false;
  const r = n.rotation;
  if (r && !(Math.abs(r[0]) < 1e-9 && Math.abs(r[1]) < 1e-9 && Math.abs(r[2]) < 1e-9 && Math.abs(Math.abs(r[3]) - 1) < 1e-9)) return false;
  const s = n.scale;
  if (s && !(Math.abs(s[0] - s[1]) <= 1e-9 * Math.abs(s[0]) && Math.abs(s[0] - s[2]) <= 1e-9 * Math.abs(s[0]))) return false;
  return true;
};

test('⚠ no shipped GLB puts a mesh under a rotated or non-uniformly scaled node', () => {
  const pools = join(root, 'viewer', 'parts');
  const bad = [];
  let files = 0, nodes = 0;
  for (const coll of readdirSync(pools)) {
    for (const f of readdirSync(join(pools, coll))) {
      if (!f.endsWith('.lib.glb')) continue;
      files += 1;
      for (const n of glbJson(join(pools, coll, f)).nodes || []) {
        nodes += 1;
        if (!nodeIsRigidScale(n)) bad.push(`${coll}/${f}: ${JSON.stringify({ r: n.rotation, s: n.scale, m: !!n.matrix })}`);
      }
    }
  }
  assert.ok(files > 1000 && nodes >= files, `only ${files} files / ${nodes} nodes read - the sweep is broken`);
  assert.deepEqual(bad, [],
    'a part file carries a node rotation or non-uniform scale. The bed finish derives its grain '
    + 'tangents from the part-frame build axis, which equals the mesh frame only without one - '
    + 'pass per-mesh tangents (the lab did) before shipping this file.');
});

test('and the premise check has teeth', () => {
  assert.equal(nodeIsRigidScale({ rotation: [0, 0.7071068, 0, 0.7071068] }), false);
  assert.equal(nodeIsRigidScale({ scale: [1, 1, 2] }), false);
  assert.equal(nodeIsRigidScale({ matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }), false);
  assert.equal(nodeIsRigidScale({ translation: [0, 13.9, 0], scale: [43.5, 43.5, 43.5] }), true);
});

/* ── 6. the accent pose, and who is eligible ────────────────────────────────────────────── */

test('the EdgeLabel accent prints face-down: axis -Z, and along it the accent measures its thickness', () => {
  assert.deepEqual(buildAxisForType('Accent', 'edgelabel'), [0, 0, -1]);
  assert.deepEqual(buildAxisForType('Accent', 'classicpro'), [0, 0, -1], 'the shared accent grows differently per family');
  for (const size of ['1W-1H', '4W-2H']) {
    const [x, y, z] = worldSpans(join(root, 'viewer', 'parts', '185', `Accent_EdgeLabel_${size}.lib.glb`));
    /* a flat panel: its thinnest extent is along the declared axis. Declaring +Y instead (every
       case and drawer) would put its height there. */
    assert.ok(z < x && z < y, `Accent ${size} spans ${[x, y, z].map((v) => v.toFixed(2))} - Z is not its thickness`);
  }
});

test('on the starter kit dressed as EdgeLabel, only QuickLock, Magnet and Label stay plain', () => {
  const kit = JSON.parse(readFileSync(join(root, 'viewer', 'builds', '185-tabletop-2w2h.json'), 'utf8'));
  const gen = generateManifest({ ...kit.build, faceStyle: 'edgelabel', backCover: true });
  assert.ok(gen.manifest, (gen.errors || []).join('; '));
  const types = [...new Set(gen.manifest.parts.map((p) => p.type))].sort();
  const plain = types.filter((t) => !buildAxisForType(t, 'edgelabel'));
  /* the lab's finding on the same build (2026-09-14): QuickLock is a chiral pair, and Magnet and
     Label have no confirmed print pose. A new type landing in either list is a decision to make,
     not a number to update. */
  assert.deepEqual(plain, ['Label', 'Magnet', 'QuickLock']);
  for (const t of ['Accent', 'BackCover', 'Case', 'CoverL', 'CoverU', 'Drawer', 'Faceplate']) {
    assert.ok(types.includes(t) && buildAxisForType(t, 'edgelabel'), `${t} is not finished on this build`);
  }
});

/* ── 7. the Deco handle pose, keyed by handle FAMILY ────────────────────────────────────── */

test('the Deco handle prints top-down: axis -Y, and along it the handle measures its height', () => {
  /* Joey 2026-09-14: "the side facing up, that side prints face-down on the build plate". */
  assert.deepEqual(buildAxisForType('Handle', null, 'deco'), [0, -1, 0]);
  /* one material type serves every handle style, and only Deco has a confirmed pose */
  for (const family of ['blockbar', 'crystal', null, undefined]) {
    assert.equal(buildAxisForType('Handle', 'essential', family), null, `a ${family} handle has no confirmed pose`);
  }
  const [x, y, z] = worldSpans(join(root, 'viewer', 'parts', '185', 'Handle_Deco.lib.glb'));
  /* generate.js HANDLE_STYLES.deco h 9, the height it is centred on the plate by. Declaring its depth
     axis would put 24 here, its width 75. */
  assert.ok(Math.abs(y - 9) < 0.5 && y < z && y < x,
    `Handle_Deco spans ${[x, y, z].map((v) => v.toFixed(2))} - Y is not its 9 mm height`);
});

test('on the starter kit dressed as Essential with Deco handles, the handle is finished and only QuickLock, Magnet and Screw stay plain', () => {
  const kit = JSON.parse(readFileSync(join(root, 'viewer', 'builds', '185-tabletop-2w2h.json'), 'utf8'));
  const gen = generateManifest({ ...kit.build, faceStyle: 'essential', handleStyle: 'deco' });
  assert.ok(gen.manifest, (gen.errors || []).join('; '));
  const types = [...new Set(gen.manifest.parts.map((p) => p.type))].sort();
  assert.ok(types.includes('Handle'), 'this build has no handle to test');
  assert.deepEqual(types.filter((t) => !buildAxisForType(t, 'essential', 'deco')), ['Magnet', 'QuickLock', 'Screw']);
});

test('main.js reads the handle family from the node name for every handle style, and both axis readers pass it', () => {
  const main = readFileSync(join(root, 'viewer', 'js', 'main.js'), 'utf8');
  /* from `needle` to the end of its statement, brackets balanced - CALLED below, not text-matched */
  const take = (needle) => {
    const start = main.indexOf(needle);
    assert.ok(start >= 0, `main.js has no "${needle}" - if it was renamed, update this test rather than deleting it`);
    let depth = 0;
    for (let i = start; i < main.length; i++) {
      const c = main[i];
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) depth--;
      else if (c === ';' && depth === 0) return main.slice(start, i + 1);
    }
    return assert.fail(`unterminated "${needle}"`);
  };
  const familyOf = new Function(take('const handleFamilyOfNode =') + '\nreturn handleFamilyOfNode;')();
  const styles = new Function(take('const HANDLE_STYLES =') + '\nreturn HANDLE_STYLES;')();
  assert.ok(styles.length >= 9, `only ${styles.length} handle styles read`);
  for (const s of styles) assert.equal(familyOf(s.node), s.planner, `${s.node} reads as ${familyOf(s.node)}`);
  assert.equal(familyOf('Faceplate_Essential_1W-1H'), null);
  assert.equal(familyOf(undefined), null);
  /* the material's axis and the geometry's stamp must be asked the same question, or a Deco handle's
     layer lines and its plate face disagree about which way it printed */
  const fnBody = (name) => {
    const at = main.indexOf(`function ${name}(`);
    assert.ok(at >= 0, `main.js has no function ${name}`);
    return main.slice(at, main.indexOf('\n}', at));
  };
  assert.match(fnBody('buildAxisForKey'), /buildAxisForType\([^;]*handleFamilyNow\(\)\)/);
  assert.match(fnBody('stampBedFaces'), /buildAxisForType\([^;]*handleFamilyOfNode\(node\)/);
});
