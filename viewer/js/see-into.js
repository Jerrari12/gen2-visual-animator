/* SEE-INTO TRANSLUCENT FILAMENT - an EXPERIMENT, OFF unless the URL asks for it (`?seeinto=frosted`).
 *
 * Astra, 2026-09-17 (vault decisions.md, "Are the settle benchmark's pass limits agreed, and what is the first graphics
 * candidate"): "Please prepare the first representative-build comparison using the existing frosted/translucent filament
 * work, retaining the plate finish. Keep it optional and isolated."
 *
 * WHAT IT IS: the translucency lab's round-39 frosted BACK COVER (viewer/lab/progressive, setup.js `__patch` +
 * `__behindPass` + `__aoMask`; index.html COVER preset), ported without its lab scaffolding. A translucent part is NOT a
 * lowered opacity: its own material stays opaque, and a softened, tinted share of what lies BEHIND its near surface is
 * mixed into its diffuse light. Two extra renders make that image:
 *   pass A  (full resolution)  the translucent parts only: the depth of the NEAREST translucent surface, and its
 *                              component id (one id per part), written as linear colour, Nearest-filtered
 *   pass B  (interior scale)   the whole scene, background kept, with each translucent part drawn by a "peel" material that
 *                              discards everything at or in front of pass A's surface, and its OWN surfaces entirely (a
 *                              solid single-material cover: its internal faces are not what shows through). A DIFFERENT
 *                              translucent part behind keeps a frosted layer at alpha 1 - see.
 *   AO mask (half resolution)  the translucent parts white on black; the AO composite weights their occlusion by aoWeight
 * The main render then samples pass B at gl_FragCoord with a 13-tap golden-angle blur.
 *
 * DELIBERATELY NOT PORTED in this first comparison (each recorded as a decision, not an omission):
 *   - buried print structure (the lab's grid/perimeters, outline bake, uStructMode): Astra deferred the infill question
 *     "until buried-structure testing" (2026-09-16); the see-through without structure never depended on it.
 *   - the lab's own plate grain (__PC): the viewer's bed-finish.js IS the production plate finish and stays chained under
 *     this patch ("retaining the plate finish").
 *   - the lab's half-width bead relief (beadScale 0.5): the production layer detail is left exactly as shipped.
 *   - the backed grip model (uBacking 1, depth tint): round 39's validated look is the single-material cover.
 *
 * TIER: the patch compiles on every tier while the switch is on, but its uniforms gate every change - on any tier but Very
 * High (and in the outro, a part preview, a lost context) uSIActive is 0, NO extra pass runs, and the shaded result is the
 * shipping one. That is what keeps High an honest control arm with the switch set.
 *
 * WHEN THE PASSES RUN: every frame while anything moves (the camera or a tween), and once when a still view starts - then
 * the image is REUSED through Very High's accumulation samples, whose jitter is sub-pixel against a blurred interior.
 *
 * Pure parts (preset parsing, component ids, the shader patch strings) are tested in node: test/see-into.test.mjs.
 */

export const SEE_INTO_PRESETS = Object.freeze({
  /* the lab's round-39 cover: COMMON then COVER (index.html 72-77), structure removed (see above) */
  frosted: Object.freeze({
    label: 'Frosted clear (experiment)',
    colorHex: '#e6ecee',    // gripHex: the natural/clear filament colour
    seeTintHex: '#f4f7f7',  // what the light picks up crossing the plastic
    see: 0.20,              // share of the interior mixed into the diffuse light
    blurPx: 6,              // interior blur radius, drawing-buffer px
    wallOpaque: 0.85,       // faces that do not face along the build axis keep 15% of the see-through
    graze: 1,               // Schlick-Fresnel: less see-through at grazing angles
    wrap: 1.0,              // scatter wrap on the direct diffuse of non-axis faces
    roughness: 0.25,
    aoWeight: 0.35,         // occlusion on the translucent part, as a share of the ordinary
    interiorScale: 0.5,     // pass B's resolution, of the drawing buffer
  }),
});

/** The preset the URL asks for, or null. Unknown values are null: an experiment never turns on by accident. */
export function parseSeeInto(search) {
  const v = new URLSearchParams(search || '').get('seeinto');
  return v && Object.prototype.hasOwnProperty.call(SEE_INTO_PRESETS, v) ? v : null;
}

/** How the experiment may skip its extra renders. `?siskip=state` turns on the assembly-state rule (Astra's option 1
 *  as first built). It is OFF by default because the rule is NOT a proof of invisibility: measured 2026-09-17 (p62), a
 *  shut drawer's cover still occupies 6-60 px in 19 of 138 ordinary outside views of the representative build, ~900 px
 *  in a close view, and the whole frame from a camera inside the drawer - it shows through the very gap it fills. With
 *  the switch on those pixels render as plain frost (the see-through is 0, never a stale interior). */
export function parseSeeIntoSkip(search) {
  return new URLSearchParams(search || '').get('siskip') === 'state' ? 'state' : null;
}

/** Component ids, 1..N, one per translucent PART (not per mesh: a part's own faces must share an id, or its internal
 *  surfaces would read as another part behind it). 0 means "no translucent surface". The 8-bit id holds 254. */
export function componentIds(entries) {
  const byPart = new Map(), out = [];
  for (const e of entries) {
    if (!byPart.has(e.partId)) byPart.set(e.partId, byPart.size + 1);
    out.push(byPart.get(e.partId));
  }
  if (byPart.size > 254) throw new Error(`see-into: ${byPart.size} translucent parts; the 8-bit id holds 254`);
  return out;
}

/* ---------------------------------------------------------------------------------------------- shader patch strings */
export const WRAP_FROM = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );';
export const WRAP_TO = 'reflectedLight.directDiffuse += mix( dotNL, saturate( ( dot( geometryNormal, directLight.direction ) + uSIWrap ) / ( 1.0 + uSIWrap ) ), ( 1.0 - gSIGate ) * uSIActive ) * directLight.color * BRDF_Lambert( material.diffuseContribution );';

export const FRAG_HEAD = [
  'varying vec3 vSIObjNrm;',
  'uniform float uSIActive, uSIRough, uSISee, uSIBlurPx, uSIWallOpaque, uSIGraze, uSIWrap;',
  'uniform vec3 uSIColor, uSITint, uSIAxis;',
  'uniform sampler2D uSIBehind;',
  'uniform vec2 uSIRes;',
  'float gSIGate = 0.0;',
].join('\n');

/* right after roughnessmap_fragment: before the layer relief (normal_fragment_maps) and the plate finish (emissivemap)
   modulate normal and roughness, so both still ride on top of the translucent part's own colour and roughness */
export const FRAG_SURFACE = [
  'if ( uSIActive > 0.5 ) {',
  '  gSIGate = smoothstep( 0.72, 0.93, abs( dot( normalize( vSIObjNrm ), normalize( uSIAxis ) ) ) );',
  '  diffuseColor.rgb = uSIColor;',
  '  roughnessFactor = uSIRough;',
  '}',
].join('\n');

export const FRAG_COMPOSITE = [
  'if ( uSIActive > 0.5 && uSISee > 0.0 ) {',
  '  vec2 suv = gl_FragCoord.xy / uSIRes;',
  '  vec3 siAcc = texture2D( uSIBehind, suv ).rgb; float siW = 1.0;',
  '  for ( int i = 0; i < 12; i++ ) { float ga = float( i ) * 2.39996;',
  '    float gr = uSIBlurPx * sqrt( ( float( i ) + 0.5 ) / 12.0 );',
  '    siAcc += texture2D( uSIBehind, suv + vec2( cos( ga ), sin( ga ) ) * gr / uSIRes ).rgb; siW += 1.0; }',
  '  vec3 seeC = ( siAcc / siW ) * uSITint;',
  '  float kSee = uSISee * mix( 1.0, gSIGate, clamp( uSIWallOpaque, 0.0, 1.0 ) );',
  '  float nvS = clamp( dot( geometryNormal, geometryViewDir ), 0.0, 1.0 );',
  '  float Fg = 0.04 + 0.96 * pow( 1.0 - nvS, 5.0 );',
  '  kSee *= mix( 1.0, 1.0 - Fg, uSIGraze );',
  '  totalDiffuse = mix( totalDiffuse, seeC, kSee );',
  '}',
].join('\n');

/* ⚠ AN ANCHOR IS A LINE THAT IS ONLY THE DIRECTIVE (bed-finish.js's rule, and its reason): the layer relief injects a comment
   quoting '#include <common>', so a substring count finds two (p60's first browser probe threw exactly that). Exactly one such
   line, or it throws - a patch that silently stopped applying must not pass for a result. Plain-text anchors (the AO composite's
   lines) are matched the same way, as whole lines. */
const lineRe = (a) => new RegExp('^[ \\t]*' + a.replace(/[.*+?^${}()|[\]\\<>]/g, '\\$&') + '[ \\t]*$', 'gm');
const replaceOnce = (src, anchor, to, what) => {
  const re = lineRe(anchor);
  const n = (src.match(re) || []).length;
  if (n !== 1) throw new Error(`see-into: anchor for ${what} found on ${n} lines, not exactly one`);
  return src.replace(re, () => to);
};

/**
 * Chain the see-into patch onto a part material. `uniforms` is the ONE shared uniform object (every clone of this material
 * - a highlight, a fade - reads the same values). `lightsParsChunk` is three's ShaderChunk.lights_physical_pars_fragment,
 * passed in so this stays importable without three.
 */
export function patchSeeIntoMaterial(material, uniforms, lightsParsChunk) {
  if (!lightsParsChunk || !lightsParsChunk.includes(WRAP_FROM)) throw new Error('see-into: the wrap anchor is missing from lights_physical_pars_fragment');
  const prior = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prior) prior.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <common>', '#include <common>\nvarying vec3 vSIObjNrm;', 'vertex common');
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <begin_vertex>', '#include <begin_vertex>\nvSIObjNrm = objectNormal;', 'begin_vertex');
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <common>', '#include <common>\n' + FRAG_HEAD, 'fragment common');
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FRAG_SURFACE, 'roughnessmap_fragment');
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <transmission_fragment>', FRAG_COMPOSITE + '\n#include <transmission_fragment>', 'transmission_fragment');
    // includes are resolved AFTER onBeforeCompile, so the lights chunk is expanded here to edit one line of it
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <lights_physical_pars_fragment>',
      lightsParsChunk.replace(WRAP_FROM, WRAP_TO), 'lights_physical_pars_fragment');
  };
  const priorKey = material.customProgramCacheKey;
  // ⚠ A NEW CACHE KEY OR THE PATCH NEVER COMPILES: three would reuse the unpatched program (the lab's round-3 trap)
  material.customProgramCacheKey = () => `${priorKey ? priorKey.call(material) : ''}|seeinto`;
  material.needsUpdate = true;
  return material;
}

/* ---------------------------------------------------------------------------------------------- the browser half */
/**
 * @param o.THREE, o.renderer, o.scene, o.camera
 * @param o.presetKey        a SEE_INTO_PRESETS key
 * @param o.parts()          the translucent parts now: [{ partId, meshes: [Mesh] }] (visible or not; hidden meshes draw nothing)
 * @param o.wanted()         whether the effect may run this frame (Very High, not the outro, not a part preview)
 * @param o.sceneKey()       a string that changes whenever the scene changes without the camera moving
 * @param o.coversVisible()  optional: false ONLY when no translucent part can contribute to any view of this frame
 *                           (Astra 2026-09-17, option 1). While it says false the three renders do not run, the
 *                           see-through is 0 and the AO weight is 1, so nothing samples a stale interior. It must be
 *                           view-INDEPENDENT (see main.js): the floor reflection draws the same parts from a second
 *                           camera in the same frame, and a mirror does not un-hide an enclosed part.
 * @param o.pauseShadowWatch(on)  suspend the viewer's shadow-caster watch while the passes swap materials (see runPasses)
 * The AO composite is patched separately, once it exists (`patchAO`): main.js builds it lazily on AO's first frame.
 */
export function createSeeInto(o) {
  const { THREE: T, renderer: R, scene: S, camera: C } = o;
  const P = SEE_INTO_PRESETS[o.presetKey];
  const LAYER_A = 29, LAYER_MASK = 30;   // below BATCH_SUPPRESS_LAYER (31), unused by the viewer
  const uniforms = {
    uSIActive: { value: 0 },
    uSIColor: { value: new T.Color(P.colorHex) },
    uSITint: { value: new T.Color(P.seeTintHex) },
    uSIRough: { value: P.roughness },
    uSISee: { value: P.see },
    uSIBlurPx: { value: P.blurPx },
    uSIWallOpaque: { value: P.wallOpaque },
    uSIGraze: { value: P.graze },
    uSIWrap: { value: P.wrap },
    uSIAxis: { value: new T.Vector3(0, 0, 1) },
    uSIBehind: { value: null },
    uSIRes: { value: new T.Vector2(1, 1) },
  };
  const stats = { passRuns: 0, passRunsStill: 0, skippedHidden: 0, lastMs: 0, lastMsA: 0, lastMsMask: 0, lastMsB: 0, active: false, parts: 0, lastReason: '' };
  const placeholder = (() => { const t = new T.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); t.needsUpdate = true; return t; })();
  uniforms.uSIBehind.value = placeholder;

  // ---- AO composite weight (the lab's __patchAOComposite, against the shipping composite's exact lines)
  let comp = null;
  function patchAO(compMat) {
  if (comp === compMat) return false;
  comp = compMat;
  /* ⚠ THE MASK THE PASSES ALREADY MADE, NOT THE PLACEHOLDER: the composite is created on AO's first frame, which on a still view
     comes AFTER this frame's passes - a placeholder here would leave the AO weight off until the camera next moved (local review
     local-20260917-101900-641, extended) */
  comp.uniforms.tSIMask = { value: rtMask && hasRef ? rtMask.texture : placeholder };
  comp.uniforms.uSIAOWeight = { value: 1 };
  comp.fragmentShader = replaceOnce(comp.fragmentShader,
    'uniform sampler2D tAO; uniform float uStrength; varying vec2 vUv;',
    'uniform sampler2D tAO; uniform float uStrength; varying vec2 vUv; uniform sampler2D tSIMask; uniform float uSIAOWeight;', 'AO composite head');
  comp.fragmentShader = replaceOnce(comp.fragmentShader,
    'gl_FragColor = vec4( 0.0, 0.0, 0.0, clamp( ( 1.0 - a ) * uStrength, 0.0, 1.0 ) );',
    'float siW = mix( 1.0, uSIAOWeight, clamp( texture2D( tSIMask, vUv ).r, 0.0, 1.0 ) );\n' +
    'gl_FragColor = vec4( 0.0, 0.0, 0.0, clamp( ( 1.0 - a ) * uStrength * siW, 0.0, 1.0 ) );', 'AO composite output');
  comp.needsUpdate = true;
  return true;
  }

  // ---- targets and pass materials
  let rtA = null, rtB = null, rtMask = null;
  const idMats = new Map();
  const idMat = (cid) => {
    if (!idMats.has(cid)) {
      const m = new T.MeshBasicMaterial({ toneMapped: false });
      m.color.setRGB(cid / 255, 0, 0, T.LinearSRGBColorSpace);   // an exact linear id; a target texture has no colour space
      idMats.set(cid, m);
    }
    return idMats.get(cid);
  };
  const peelShared = { uNear: { value: null }, uNearId: { value: null }, uRes2: { value: new T.Vector2(1, 1) } };
  const peelMats = new Map();
  const peelMat = (cid) => {
    if (peelMats.has(cid)) return peelMats.get(cid);
    const m = new T.MeshStandardMaterial({ color: P.colorHex, roughness: 0.5, metalness: 0, transparent: true });
    const own = { uSelfId: { value: cid }, uApproxAlpha: { value: 1 - P.see } };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, peelShared, own);
      sh.fragmentShader = replaceOnce(sh.fragmentShader, '#include <common>',
        '#include <common>\nuniform sampler2D uNear; uniform sampler2D uNearId; uniform vec2 uRes2; uniform float uSelfId, uApproxAlpha;', 'peel common');
      /* ⚠ THE ALPHA IS WRITTEN AFTER THE OWNERSHIP TEST: r185 declares diffuseColor before clipping_planes_fragment (the lab's
         round-33 trap). A solid single-material part discards ALL of its own peeled fragments (the lab's peelSelf false). */
      sh.fragmentShader = replaceOnce(sh.fragmentShader, '#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\n{ vec2 puv = gl_FragCoord.xy / uRes2;\n' +
        '  if ( gl_FragCoord.z <= texture2D( uNear, puv ).r + 2e-5 ) discard;\n' +
        '  float nid = floor( texture2D( uNearId, puv ).r * 255.0 + 0.5 );\n' +
        '  if ( abs( nid - uSelfId ) < 0.5 ) discard;\n' +
        '  diffuseColor.a = uApproxAlpha; }', 'peel clipping');
    };
    m.customProgramCacheKey = () => 'gen2-seeinto-peel';
    peelMats.set(cid, m);
    return m;
  };
  const maskMat = new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });

  const size = new T.Vector2();
  function ensureTargets() {
    R.getDrawingBufferSize(size);
    const w = Math.max(1, size.x), h = Math.max(1, size.y);
    if (!rtA || rtA.width !== w || rtA.height !== h) {
      if (rtA) rtA.dispose();
      rtA = new T.WebGLRenderTarget(w, h, { depthTexture: new T.DepthTexture(w, h), minFilter: T.NearestFilter, magFilter: T.NearestFilter });
    }
    const bw = Math.max(1, Math.round(w * P.interiorScale)), bh = Math.max(1, Math.round(h * P.interiorScale));
    if (!rtB || rtB.width !== bw || rtB.height !== bh) {
      if (rtB) rtB.dispose();
      rtB = new T.WebGLRenderTarget(bw, bh, { type: T.HalfFloatType });
    }
    const mw = Math.max(2, Math.floor(w * 0.5)), mh = Math.max(2, Math.floor(h * 0.5));
    if (!rtMask || rtMask.width !== mw || rtMask.height !== mh) {
      if (rtMask) rtMask.dispose();
      rtMask = new T.WebGLRenderTarget(mw, mh);
    }
    return { w, h, bw, bh };
  }

  // the still-view key: the camera matrices (64-bit exact, like the accumulator's), the scene key, the buffer size
  const camRef = new Float64Array(32);
  let keyRef = '', hasRef = false, lastMoving = false;
  const camSame = () => { const m = C.matrixWorld.elements, p = C.projectionMatrix.elements;
    for (let i = 0; i < 16; i++) if (camRef[i] !== m[i] || camRef[16 + i] !== p[i]) return false; return true; };
  const camStore = () => { const m = C.matrixWorld.elements, p = C.projectionMatrix.elements;
    for (let i = 0; i < 16; i++) { camRef[i] = m[i]; camRef[16 + i] = p[i]; } };

  function runPasses(dims) {
    const parts = o.parts();
    const entries = [];
    for (const p of parts) for (const mesh of p.meshes) entries.push({ partId: p.partId, mesh });
    stats.parts = parts.length;
    const cids = componentIds(entries);
    const saved = entries.map((e) => e.mesh.material);
    const prev = { rt: R.getRenderTarget(), auto: R.autoClear, bg: S.background, ov: S.overrideMaterial, mask: C.layers.mask,
      cc: R.getClearColor(new T.Color()), ca: R.getClearAlpha(), shadowNeeds: R.shadowMap.needsUpdate };
    /* ⚠⚠ THE SHADOW MAP MUST NOT SEE THESE RENDERS (p61, 2026-09-17). main.js's shadow-caster watch runs in scene.onBeforeRender,
       so it runs inside every pass here - where the covers wear id and peel materials on an extra layer - and it read those
       swaps as moved casters: the light stage re-rendered its whole shadow map on every moving frame (orbit draw calls 1,271 ->
       2,539, moving-frame GPU time +10 ms against +5.4 on the shadowless dark stage). The watch is paused for the passes, and a
       pending refresh is held for the viewer's own render rather than spent on a pass. */
    if (o.pauseShadowWatch) o.pauseShadowWatch(true);
    R.shadowMap.needsUpdate = false;
    try {
      // pass A: nearest translucent surface, depth + id
      for (const e of entries) e.mesh.layers.enable(LAYER_A);
      C.layers.set(LAYER_A); S.background = null; S.overrideMaterial = null;
      entries.forEach((e, k) => { e.mesh.material = idMat(cids[k]); });
      const tA = performance.now();
      R.setRenderTarget(rtA); R.autoClear = true; R.setClearColor(0x000000, 1); R.clear(); R.render(S, C);
      stats.lastMsA = performance.now() - tA;
      // AO mask: the same parts, white
      S.overrideMaterial = maskMat;
      const tM = performance.now();
      R.setRenderTarget(rtMask); R.clear(); R.render(S, C);
      stats.lastMsMask = performance.now() - tM;
      S.overrideMaterial = null;
      C.layers.mask = prev.mask;
      // pass B: the whole scene behind the near translucent surface, background kept
      S.background = prev.bg;
      peelShared.uNear.value = rtA.depthTexture;
      peelShared.uNearId.value = rtA.texture;
      peelShared.uRes2.value.set(dims.bw, dims.bh);
      entries.forEach((e, k) => { e.mesh.material = peelMat(cids[k]); });
      // ⚠ nothing drawn into pass B may sample it (WebGL drops the draw): every patched part samples a placeholder meanwhile
      uniforms.uSIBehind.value = placeholder;
      const tB = performance.now();
      R.setRenderTarget(rtB); R.setClearColor(prev.cc, prev.ca); R.clear(); R.render(S, C);
      stats.lastMsB = performance.now() - tB;
    } finally {
      entries.forEach((e, k) => { e.mesh.material = saved[k]; e.mesh.layers.disable(LAYER_A); });
      C.layers.mask = prev.mask; S.overrideMaterial = prev.ov; S.background = prev.bg;
      R.setRenderTarget(prev.rt); R.autoClear = prev.auto; R.setClearColor(prev.cc, prev.ca);
      R.shadowMap.needsUpdate = prev.shadowNeeds;
      if (o.pauseShadowWatch) o.pauseShadowWatch(false);
    }
    uniforms.uSIBehind.value = rtB.texture;
    uniforms.uSIRes.value.set(dims.w, dims.h);
    if (comp) comp.uniforms.tSIMask.value = rtMask.texture;
  }

  /**
   * Once per frame, before anything renders the scene. `moving` = the camera or a tween moved this frame.
   * Returns true when the passes ran.
   */
  function prepare({ moving }) {
    const on = !!o.wanted();
    stats.active = on;
    uniforms.uSIActive.value = on ? 1 : 0;
    if (comp) comp.uniforms.uSIAOWeight.value = on ? P.aoWeight : 1;
    if (!on) { hasRef = false; lastMoving = false; uniforms.uSISee.value = P.see; return false; }
    /* ⚠ NO COVER IN ANY VIEW, NO RENDERS (Astra 2026-09-17, option 1). The see-through goes to 0 rather than keeping the
       last interior: a skipped frame must never sample a stale image, and a part that leaks a few pixels through a slot
       then renders as plain frost instead of wrongly. hasRef is dropped, so the frame a cover becomes visible again -
       decided on THAT frame, not from the last one - runs the passes before anything is drawn. */
    if (o.coversVisible && !o.coversVisible()) {
      uniforms.uSISee.value = 0;
      if (comp) comp.uniforms.uSIAOWeight.value = 1;
      uniforms.uSIBehind.value = placeholder;
      hasRef = false; lastMoving = false;
      stats.skippedHidden++; stats.lastReason = 'no cover visible';
      return false;
    }
    uniforms.uSISee.value = P.see;
    C.updateMatrixWorld();
    const dims = ensureTargets();
    const key = o.sceneKey() + '|' + dims.w + 'x' + dims.h;
    const same = camSame();
    /* ⚠ THE FRAME AFTER A TWEEN ENDS RE-RUNS TOO (Sol review 2026-09-17): stepTweens applies a tween's FINAL pose and deletes it
       in the same frame, before this runs, so that frame reads moving = false with an unchanged camera and scene key - and the
       image from the previous, not-quite-final pose would be kept until the camera next moved. */
    const wasMoving = lastMoving; lastMoving = moving;
    if (!moving && !wasMoving && hasRef && key === keyRef && same) return false;
    stats.lastReason = moving ? 'moving' : wasMoving ? 'tween ended' : !hasRef ? 'first' : key !== keyRef ? 'scene: ' + keyRef + ' -> ' + key : 'camera';
    const t0 = performance.now();
    /* ⚠ A THROW MUST TURN THE SHADER SIDE OFF TOO. main.js's guardFx disables this effect after a throw and never calls prepare
       again - with uSIActive left at 1 and the interior bound to the black placeholder, every cover would render wrong for the
       rest of the page. */
    try { runPasses(dims); }
    catch (e) {
      uniforms.uSIActive.value = 0; uniforms.uSIBehind.value = placeholder;
      if (comp) comp.uniforms.uSIAOWeight.value = 1;
      hasRef = false; stats.active = false;
      throw e;
    }
    stats.lastMs = performance.now() - t0;
    stats.passRuns++;
    if (!moving) stats.passRunsStill++;
    camStore(); keyRef = key; hasRef = true;
    return true;
  }

  /* ⚠ ANOTHER CAMERA'S RENDER MUST NOT SAMPLE THE INTERIOR (Sol review 2026-09-17): the interior image is registered to the main
     camera's pixels, so a cover drawn into the floor reflection would show unrelated imagery. The reflection render is bracketed
     with this: the cover keeps its frosted colour and loses only the see-through. */
  function withoutSeeThrough(fn) {
    const s = uniforms.uSISee.value; uniforms.uSISee.value = 0;
    try { return fn(); } finally { uniforms.uSISee.value = s; }
  }

  return { uniforms, prepare, patchAO, withoutSeeThrough, stats, preset: P, presetKey: o.presetKey, invalidate() { hasRef = false; },
    patch(material, axis) {
      if (axis) uniforms.uSIAxis.value.set(axis[0], axis[1], axis[2]).normalize();
      return patchSeeIntoMaterial(material, uniforms, T.ShaderChunk.lights_physical_pars_fragment);
    } };
}
