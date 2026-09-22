/* =========================================================================
   BED-SURFACE FINISH - what the build plate left on every printed part
   =========================================================================
   A part's BED-CONTACT FACE - the face that lay on the build plate - takes the
   plate's finish. Joey 2026-09-14: every eligible part, not just faceplates.
   Ported from the finish lab (D:\Claude - Output\GEN2 veryhigh\harness\r29,
   bedfinish.js + setup.js __PC), whose look Astra approved on 2026-09-14 with
   "keep this appearance and stop further grain tuning". The GLSL below is the
   lab's, trimmed only of branches the approved settings never take (the
   rejected cellular grain shape, and the round-38 moving-frame knobs, which
   are exact no-ops at the defaults the build look uses).

   ⚠ THE FINISH IS ONE BUILD-WIDE ENUM. Two finishes cannot stack, and the
   plate choice never changes with the rendering tier: a tier may draw a
   cheaper REPRESENTATION of the same finish (see setBedFinish), never a
   different finish.

   ⚠ EVERY FINISH IS A PROFILE THAT OWNS THE CONTACT FACE. At contact the face
   first gets its PLAIN surface back - the interpolated normal and the
   material's authored roughness - which removes what the layer relief drew
   there (its bottom-skin fold and micro-relief belong to layer-stacked faces,
   not a plate-moulded one). Then the profile draws on top: Smooth is the plain
   surface and nothing else; Powder adds the grain; Holographic adds the
   polished contact surface and the diffraction pattern.

   WHICH FACE IS THE BED FACE - from print metadata, never from the assembly:
   - the build axis per part comes from generate.js PLATE_POSE (Joey's
     confirmed print orientations, through buildAxisForType). A part with no
     confirmed pose, or a chiral pair, has no axis and is left plain.
   - a fragment is a bed face when (1) its GEOMETRIC normal (from derivatives,
     so smooth-shaded vertices cannot leak it onto neighbours) points down the
     build axis, AND (2) it lies within CONTACT_BAND_MM of the PART's lowest
     plane along that axis. (2) keeps recessed faces that are merely parallel
     to the bed - a chevron backer, a groove floor, a step - plain. Sidewalls
     fail (1), so their layer lines are untouched.
   - the plane is found per PART on the CPU and stored as the vertex attribute
     aBfMm (authored position in mm, shifted so the bed plane passes through 0),
     so ONE material serves every size and every instance of a type.

   ⚠ THE TANGENTS ARE DERIVED FROM THE AXIS IN THE SHADER, PER MATERIAL. The lab
   computed the same two vectors per mesh and transformed them into each mesh's
   frame; that equals this only while no part file carries its own rotation or
   a non-uniform scale. test/bed-finish.test.mjs pins exactly that over every
   GLB the viewer ships (1,202 files, 0 rotations, 2026-09-14).

   ⚠ NO THREE IMPORT, like part-material.js: the module is plain strings and
   numbers, so node can test the patch against three's real shader sources.
   Uniform objects are created by the caller's material system and SHARED - a
   clone of a patched material (highlight, alternate tile, planned cover, fade)
   tracks every finish change with no rebuild.
   ========================================================================= */

/** Selector order is Astra's: Powder-coated / Smooth / Holographic. */
export const PLATE_FINISHES = Object.freeze(['powder', 'smooth', 'holographic']);
export const PLATE_LABELS = Object.freeze({ powder: 'Powder-coated', smooth: 'Smooth', holographic: 'Holographic' });

/**
 * THE DEFAULT FINISH, for every build that has not stored one: a new planner build, and every share
 * link, saved file, saved session, official kit, static demo kit and product preview made before the
 * field existed.
 *
 * ⚠ POWDER-COATED EVERYWHERE, BY DECISION. Asked on 2026-09-14 how builds with no stored finish
 * should read, Joey answered "yes, powder-coat as default". An explicitly stored finish is always
 * kept (a saved Smooth stays Smooth); only the absence of one reads as this. An unknown value (a
 * newer build format's finish) reads as the default too.
 */
export const DEFAULT_PLATE = 'powder';

/** The finish a build asks for, resolved: a stored known finish, else DEFAULT_PLATE. */
export const plateFinishOf = (build) =>
  (build && PLATE_FINISHES.includes(build.buildPlate)) ? build.buildPlate : DEFAULT_PLATE;

/* The approved powder-coat grain (finish lab page, 2026-09-14): cell 0.25 mm, second octave at
   0.45 of it with 0.7 of the slope, 28 degree peak facet tilt, facet roughness 0.15. */
export const POWDER_GRAIN = Object.freeze({ cellMm: 0.25, fine: 0.7, tiltDeg: 28, rough: 0.15 });

/**
 * The two REPRESENTATIONS of the one powder finish, as the octave fade window in cells per pixel.
 *
 * - moving: an octave is drawn in full at >= 6.7 px per cell and folded into roughness at <= 2.5.
 *   This is the only form a single-sample frame can show without the grain crawling, so it is what
 *   every ordinary frame draws.
 * - detail: every octave drawn as explicit normals up to 50 cells per pixel - it folds only on a face
 *   seen almost edge-on or from very far away. ⚠ ONLY FOR A SETTLE ACCUMULATOR that averages
 *   sub-pixel-jittered samples - the approved comparison sheet is that settled mean. Drawn into one
 *   ordinary frame it aliases into sparkle that crawls on orbit. The Very High tier's accumulator is
 *   the one caller (Joey 2026-09-14: "place it on very high for now"): it switches to 'detail'
 *   around each of its sample renders and back to 'moving' after, through setSettleDetail (which
 *   turns the visible layer lines on and off with it).
 */
export const POWDER_FADE = Object.freeze({ moving: Object.freeze([0.15, 0.40]), detail: Object.freeze([50, 51]) });

/** Height above the part's lowest plane, mm, over which a downward face stops being a bed face. */
export const CONTACT_BAND_MM = Object.freeze([0.03, 0.08]);

/**
 * VISIBLE LAYER LINES - the print's layers, drawn at a spacing a screen can show. Settled Very High
 * frames only, exactly like the powder grain's detail form.
 *
 * WHY THEY EXIST. The printed relief (vendor/layer-detail.js) draws the true 0.2 mm corrugation and
 * starts only at 4 CSS px per layer. A normal view puts a 0.2 mm layer at ~1 px (MEASURED
 * 2026-09-14 on the 185 starter: 5.59 / 2.68 / 2.28 CSS px per mm close / mid / whole), so the
 * layers read only when zoomed in very close. Joey asked for them visible, and offered to cheat
 * the spacing. These lines are that cheat, bounded:
 *
 * - NESTED OCTAVES. The drawn spacing is pitchMm x 2^k, k the smallest that leaves at least minPx
 *   CSS px between lines, cross-faded between k and k + 1. Every line of one octave is also a line
 *   of the next finer one, so zooming in fades the in-between lines in and nothing jumps.
 * - CAPPED AT maxMm. Joey 2026-09-14, after the prototype page: "anything above 0.8mm looks kind of
 *   too big and crazy"; 2026-09-21, on the live build: "these layer lines are just too huge" - the cap
 *   dropped one octave to 0.4 mm. Past the cap the lines only get finer on screen, and the band limit fades
 *   them out before they alias. ⚠ SO THEY ARE A CLOSE-RANGE DETAIL ON A DPR-1 SCREEN. MEASURED
 *   2026-09-14 (185 starter, 1600x900): at the mid and whole-build views 0.8 mm is 1.7 / 1.5 device
 *   px, past the sampling limit, so no anti-alias-safe band limit can keep it and the settled frame
 *   does not change at all; at close range (4.6 CSS px/mm) it does. At dpr 2 the same views keep
 *   the lines, attenuated by the band limit at the whole-build view.
 * - ON THE RELIEF'S OWN LATTICE. The height is the relief's phase coordinate (position along the
 *   axis at the object's own scale) and a drawn seam sits on one of its valleys, so where the real
 *   relief takes over up close (handoffPx, the relief's own cutoff and full thresholds) the bands
 *   do not shift by half a layer.
 * - WEIGHTED TO WALLS, from the geometric normal: full on a wall, fading through a chamfer, zero on a
 *   skin that lies in a layer plane and on the bed face, where the plate finish owns the surface.
 *   The weights are smooth, so the transition band at the edge of a bed face carries part of both.
 *
 * ⚠ SETTLE SAMPLES ONLY (Joey 2026-09-14: "can it be treated the same way as the powdercoated
 * texture, like it pops in after a few seconds?"). A single ordinary frame holds a regular stripe
 * pattern this fine only as moire that crawls on orbit; the accumulator's jittered mean holds it.
 * uLLOn is 0 in every other frame, so no tier but Very High ever draws a line.
 *
 * ⚠ pitchMm IS main.js LAYER_PITCH_MM and handoffPx IS the relief's cutoffPxPerLayer /
 * fullDetailPxPerLayer; test/bed-finish.test.mjs holds each pair together. dark, tiltDeg and minPx
 * are the prototype page's defaults ("Normal", 6 px gap) that Joey was shown.
 */
export const LAYER_LINES = Object.freeze({
  pitchMm: 0.2, maxMm: 0.4, minPx: 6, dark: 0.12, tiltDeg: 22, width: 0.35,
  handoffPx: Object.freeze([4, 12]),
  /* cycles per DEVICE px over which each harmonic of a drawn octave fades out - aliasing is a fact
     about the sampling grid, so this one is not CSS. Wider than a single frame could take (the
     prototype's 0.18-0.4) because the settle mean is supersampled: a line's fundamental is full at
     4 px per line and gone at 2.2. ⚠ The upper end must stay below 0.5 - see the seam series. */
  bandCycles: Object.freeze([0.25, 0.45]),
});

/** The holographic transfer's intensity - the same constant the faceplate path has used since 2026-08-10. */
export const HOLO_OPACITY = 0.07;

/**
 * One set of finish uniforms for every material that carries the finish. Pass the SAME object to
 * every applyBedFinish call; setBedFinish then changes the whole scene at once.
 */
export function createBedFinishUniforms() {
  return {
    uPC: { value: 0 }, uPCCell: { value: POWDER_GRAIN.cellMm }, uPCFine: { value: POWDER_GRAIN.fine },
    uPCTilt: { value: POWDER_GRAIN.tiltDeg }, uPCRough: { value: POWDER_GRAIN.rough },
    uPCFadeLo: { value: POWDER_FADE.moving[0] }, uPCFadeHi: { value: POWDER_FADE.moving[1] },
    uScale: { value: 1 },                                  // aBfMm is already millimetres
    uBFPlaneLo: { value: CONTACT_BAND_MM[0] }, uBFPlaneHi: { value: CONTACT_BAND_MM[1] },
    /* 1 = a profile owns the contact face. 0 is a DIAGNOSTIC only (the viewer's look with no
       profile at all), reachable from the debug hook, never a user choice. */
    uBFPlain: { value: 1 },
    uBFDbg: { value: 0 },                                   // debug views, see DEBUG_BLOCK
    uBfHoloOp: { value: 0 },
    /* the visible layer lines (LAYER_LINES) - off until a settle sample turns them on */
    uLLOn: { value: 0 }, uLLPitch: { value: LAYER_LINES.pitchMm }, uLLMaxMm: { value: LAYER_LINES.maxMm },
    uLLMinPx: { value: LAYER_LINES.minPx }, uLLDark: { value: LAYER_LINES.dark },
    uLLTilt: { value: LAYER_LINES.tiltDeg }, uLLWidth: { value: LAYER_LINES.width },
    uLLHandLo: { value: LAYER_LINES.handoffPx[0] }, uLLHandHi: { value: LAYER_LINES.handoffPx[1] },
    uLLBandLo: { value: LAYER_LINES.bandCycles[0] }, uLLBandHi: { value: LAYER_LINES.bandCycles[1] },
    uLLPxRatio: { value: 1 },                               // device px per CSS px, set with uLLOn
  };
}

/**
 * Point the shared uniforms at a finish.
 *
 * Powder and Smooth are the SAME program - only uPC differs - so switching between them needs no
 * material rebuild and no shader compile. Holographic is a different program (see applyBedFinish),
 * so the caller rebuilds materials when it crosses that boundary.
 */
export function setBedFinish(u, finish, representation = 'moving') {
  const f = PLATE_FINISHES.includes(finish) ? finish : DEFAULT_PLATE;
  u.uPC.value = f === 'powder' ? 1 : 0;
  setGrainRepresentation(u, representation);
  u.uBfHoloOp.value = f === 'holographic' ? HOLO_OPACITY : 0;
  return f;
}

/**
 * Switch only the powder grain's REPRESENTATION (see POWDER_FADE), leaving the finish alone. The call
 * a settle accumulator makes around each jittered sample: 'detail' before it, 'moving' after. The
 * uniforms are shared, so every finished material follows at once; three re-uploads a material's
 * uniforms at its first draw in each render() call, so a value set between two renders is the value
 * the next render draws.
 */
export function setGrainRepresentation(u, representation) {
  const fade = Object.hasOwn(POWDER_FADE, representation) ? POWDER_FADE[representation] : POWDER_FADE.moving;
  u.uPCFadeLo.value = fade[0];
  u.uPCFadeHi.value = fade[1];
}

/**
 * Everything a settle sample draws that an ordinary frame must not: the powder grain's detail form
 * and the visible layer lines. The accumulator calls it on before each jittered sample, with the
 * renderer's pixel ratio (the lines are sized in CSS px), and off after - so every other frame, on
 * every tier, draws neither. Like setGrainRepresentation it leaves the finish itself alone.
 */
export function setSettleDetail(u, on, pixelRatio) {
  setGrainRepresentation(u, on ? 'detail' : 'moving');
  u.uLLOn.value = on ? 1 : 0;
  if (Number.isFinite(pixelRatio) && pixelRatio > 0) u.uLLPxRatio.value = pixelRatio;
}

/** Whether the settle detail is on at this moment: the grain in its detail form AND the layer lines drawn. Read, never written,
 *  by the viewer's accumulator right after a sample renders, so the settle benchmark (settle-bench.js) counts samples that
 *  really drew the detail rather than samples that merely asked for it. */
export function settleDetailIsOn(u) {
  return u.uLLOn.value === 1 && u.uPCFadeLo.value === POWDER_FADE.detail[0] && u.uPCFadeHi.value === POWDER_FADE.detail[1];
}

/* ---- the shader ------------------------------------------------------------------------------ */

/* The plain surface at contact: the normal as three built it before any patch (normal_fragment_begin)
   and the authored roughness uniform, mixed in by the contact weight.
   ⚠ Exact while these materials carry no normal, bump or roughness map - a map would be discarded
   at contact too. The clearcoat lobe is untouched either way: three gives it nonPerturbedNormal,
   which no patch writes.
   ⚠ ROUGHNESS ONLY FOR THE SHARE THE GRAIN DOES NOT TAKE (lab review 01a09f74). The grain block
   already blends the old roughness toward its own by the same weight; restoring it here as well
   blended twice in the transition band. */
const PLAIN = (w) => [
  '#ifdef FLAT_SHADED',
  '  gBFPlainN = normalize( cross( dFdx( vViewPosition ), dFdy( vViewPosition ) ) );',
  '#else',
  '  gBFPlainN = normalize( vNormal );',
  '  #ifdef DOUBLE_SIDED',
  '  gBFPlainN *= faceDirection;',
  '  #endif',
  '#endif',
  `  if ( uBFPlain > 0.5 && ${w} > 0.0 ) { normal = normalize( mix( normal, gBFPlainN, ${w} ) ); roughnessFactor = mix( roughnessFactor, roughness, ${w} * ( 1.0 - clamp( uPC, 0.0, 1.0 ) ) ); }`,
].join('\n');

const VERT_COMMON = [
  'attribute vec3 aBfMm;',
  'uniform vec3 uAxis;',
  'varying vec3 vObjPos;',
  'varying vec3 vPCT1;',
  'varying vec3 vPCT2;',
  'varying float vLLh;',
].join('\n');

/* the lab swatch's in-shader tangents (setup.js __PC.vertexMain), identical to bedfinish.js's
   per-mesh uniforms while mesh frames carry no rotation - see the header */
const VERT_MAIN = [
  'vObjPos = aBfMm;',
  '{ vec3 axV = normalize( uAxis );',
  '  vec3 a1 = normalize( abs( axV.y ) < 0.9 ? cross( axV, vec3( 0.0, 1.0, 0.0 ) ) : cross( axV, vec3( 1.0, 0.0, 0.0 ) ) );',
  '  vPCT1 = normalize( normalMatrix * a1 ); vPCT2 = normalize( normalMatrix * cross( axV, a1 ) );',
  /* the layer lines' height, mm: the RELIEF's phase coordinate times the pitch - raw position along
     the axis at the object's own scale from modelMatrix (vendor/layer-detail.js VERT_BODY) - and NOT
     aBfMm, whose origin is the bed plane. Same origin, so a drawn seam lands on a relief valley. */
  '  vLLh = dot( position, axV ) * length( ( modelMatrix * vec4( axV, 0.0 ) ).xyz ); }',
].join('\n');

const FRAG_COMMON = [
  'varying vec3 vObjPos;',
  'varying vec3 vPCT1;',
  'varying vec3 vPCT2;',
  'varying float vLLh;',
  'uniform vec3 uAxis;',
  'uniform float uScale;',
  'uniform float uBFPlaneLo, uBFPlaneHi, uBFDbg, uBFPlain;',
  'uniform float uPC, uPCCell, uPCFine, uPCTilt, uPCRough, uPCFadeLo, uPCFadeHi;',
  'uniform float uLLOn, uLLPitch, uLLMaxMm, uLLMinPx, uLLDark, uLLTilt, uLLWidth, uLLHandLo, uLLHandHi, uLLBandLo, uLLBandHi, uLLPxRatio;',
  'float gBFContact = 0.0;',
  'float gBFAxial = 1.0;',                 // |geometric normal . axis|: 0 on a wall, 1 on a skin
  'float gLLW = 0.0; float gLLNear = 0.0;', // the layer lines' weight and hand-off factor, for DEBUG_BLOCK
  'vec3 gBFPlainN = vec3( 0.0, 0.0, 1.0 );',
  'vec2 pcHash2( vec2 p ) { vec2 h = vec2( dot( p, vec2( 127.1, 311.7 ) ), dot( p, vec2( 269.5, 183.3 ) ) ); return fract( sin( h ) * 43758.5453 ); }',
  /* gradient of a sum of domes s * ( 1 - d^2 / R^2 )^2: one per cell, jittered +/-0.45 cell, radius
     0.62-0.95 cell, height -0.2..1 (mostly bumps, a few shallow pits) - irregular on purpose. The 3x3
     neighbourhood holds every dome that can reach the fragment. Scaled so a 0.75-cell dome's peak
     slope is 1: mean |grad|^2 = 0.229, the constant the fold below uses. */
  'vec2 pcDomeGrad( vec2 q ) {',
  '  vec2 i = floor( q ), f = fract( q ); vec2 g = vec2( 0.0 );',
  '  for ( int y = -1; y <= 1; y++ ) for ( int x = -1; x <= 1; x++ ) {',
  '    vec2 c = vec2( float( x ), float( y ) ); vec2 o = pcHash2( i + c );',
  '    float s = -0.2 + 1.2 * fract( o.x * 7.13 + o.y * 3.71 );',
  '    float R = 0.62 + 0.33 * fract( o.x * 3.17 + o.y * 9.23 ); float R2 = R * R;',
  '    vec2 r = c + 0.5 + 0.9 * ( o - 0.5 ) - f; float d2 = dot( r, r );',
  '    if ( d2 < R2 ) g += s * 4.0 * ( 1.0 - d2 / R2 ) / R2 * r; }',
  '  return g * ( 0.75 / 1.5396 ); }',
].join('\n');

/* the contact weight and the plain surface - every finish */
const CONTACT_BLOCK = [
  '{',
  /* a triangle seen exactly edge-on has a zero cross product: a floored length instead of normalize(),
     so it reads as no contact rather than NaN */
  '  vec3 cBF = cross( dFdx( vObjPos ), dFdy( vObjPos ) ); vec3 nBF = cBF / max( length( cBF ), 1e-20 ); if ( !gl_FrontFacing ) nBF = -nBF;',
  '  vec3 axBF = normalize( uAxis );',
  '  gBFContact = smoothstep( 0.82, 0.94, -dot( nBF, axBF ) ) * ( 1.0 - smoothstep( uBFPlaneLo, uBFPlaneHi, dot( vObjPos, axBF ) ) );',
  '  gBFAxial = abs( dot( nBF, axBF ) );',
  PLAIN('gBFContact'),
  '}',
].join('\n');

/* the powder grain (lab setup.js __PC.fragBlock, contact from the plane test above) */
const GRAIN_BLOCK = [
  'if ( uPC > 0.0 ) {',
  '  vec3 axPC = normalize( uAxis );',
  '  float wPC = gBFContact * clamp( uPC, 0.0, 1.0 );',
  /* the footprint BEFORE the per-fragment branch: derivatives inside non-uniform control flow are
     undefined at the branch's pixel-quad boundaries (uPC is a uniform, so this outer block is safe) */
  '  vec3 pPC = ( vObjPos - dot( vObjPos, axPC ) * axPC ) * uScale;',
  '  vec3 u1 = normalize( abs( axPC.y ) < 0.9 ? cross( axPC, vec3( 0.0, 1.0, 0.0 ) ) : cross( axPC, vec3( 1.0, 0.0, 0.0 ) ) );',
  '  vec2 qmm = vec2( dot( pPC, u1 ), dot( pPC, cross( axPC, u1 ) ) );',
  '  float pxMm = max( length( dFdx( qmm ) ), length( dFdy( qmm ) ) );',
  '  if ( wPC > 0.0 ) {',
  '    float tanT = tan( radians( uPCTilt ) );',
  '    vec2 slope = vec2( 0.0 ); float lost = 0.0;',
  '    for ( int k = 0; k < 2; k++ ) {',
  '      float cell = k == 0 ? uPCCell : uPCCell * 0.45; float amp = k == 0 ? 1.0 : uPCFine;',
  '      float vis = 1.0 - smoothstep( uPCFadeLo, uPCFadeHi, pxMm / max( cell, 1e-4 ) );',
  /* each octave on its own rotated lattice, so no row of domes runs with the panel edges */
  '      float ang = k == 0 ? 0.61 : 2.17; float ca = cos( ang ), sa = sin( ang );',
  '      vec2 qr = vec2( ca * qmm.x - sa * qmm.y, sa * qmm.x + ca * qmm.y ) / max( cell, 1e-4 ) + float( k ) * 17.3;',
  '      if ( vis > 0.0 ) { vec2 gk = pcDomeGrad( qr ) * amp * vis; slope += vec2( ca * gk.x + sa * gk.y, -sa * gk.x + ca * gk.y ); }',
  '      lost += 0.229 * amp * amp * ( 1.0 - vis * vis ); }',
  /* the drawn slope scales with the weight, so the variance it stands for scales with it SQUARED */
  '    slope *= tanT * wPC; lost *= tanT * tanT * wPC * wPC;',
  '    normal = normalize( normal - normalize( vPCT1 ) * slope.x - normalize( vPCT2 ) * slope.y );',
  '    float a0 = mix( roughnessFactor, uPCRough, wPC ); a0 *= a0;',
  '    roughnessFactor = clamp( sqrt( sqrt( a0 * a0 + lost ) ), 0.0, 1.0 );',
  '  }',
  '}',
].join('\n');

/* ---- holographic, on parts that are not a face-down faceplate ----
   The faceplate transfer main.js has drawn since 2026-08-10 (attachHolo), gated by the SAME contact
   rule as every other finish instead of an object-space normal, and pinned to the bed plane instead
   of the plate's front. Contact takes the polished surface the faceplate spec gives its contact face
   (roughness, clearcoat - passed in, never retyped here); everything off contact keeps the part's
   own surface, so a sidewall looks exactly as it did. */
const HOLO_VERT_COMMON = 'attribute vec2 aBfUv;\nvarying vec2 vBfUv;';
const HOLO_VERT_MAIN = 'vBfUv = aBfUv;';
const HOLO_FRAG_COMMON = 'varying vec2 vBfUv;\nuniform sampler2D uBfHoloTex;\nuniform float uBfHoloOp, uBfHoloRough;';
const HOLO_BLOCK = [
  'roughnessFactor = mix( roughnessFactor, uBfHoloRough, gBFContact );',
  'if ( uBfHoloOp > 0.0 ) {',
  '  float contact = gBFContact;',
  '  float hA = 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) );',
  '  vec4 pat = texture2D( uBfHoloTex, vBfUv );',
  '  float macro = pat.r, phaseT = pat.g, amp = pat.b, fine = pat.a;',
  '  float ramp = ( abs( vBfUv.x - 0.5 ) + vBfUv.y * 0.7071 ) * 0.9;',
  '  float gate = pow( smoothstep( 0.09, 0.32, hA ), 1.8 ) * contact;',
  '  float cycC = fract( 0.45 * phaseT + 0.5 * macro + ramp + hA * 2.4 );',
  '  float off = cycC - 0.5;',
  '  float wC = mix( 0.06, 0.55, smoothstep( 0.06, 0.55, hA ) ) * ( 0.9 + 0.4 * macro );',
  '  float band = smoothstep( wC, wC * 0.7, abs( off ) );',
  '  float chroma = band * smoothstep( 0.06, 0.30, amp ) * gate;',
  '  float hue = 6.2832 * ( 0.45 * phaseT + hA * 2.2 ) + off * 6.0 + 3.4;',
  '  vec3 rainbow = pow( 0.5 + 0.5 * cos( hue + vec3( 0.0, -2.094, -4.188 ) ), vec3( 0.72 ) );',
  '  rainbow /= max( max( rainbow.r, max( rainbow.g, rainbow.b ) ), 1e-3 );',
  '  totalEmissiveRadiance += rainbow * chroma * 1.9 * ( 0.8 + fine * 0.35 ) * uBfHoloOp;',
  '}',
].join('\n');
/* off contact the clearcoat the holographic material was given goes back to nothing */
const HOLO_CLEARCOAT = '#ifdef USE_CLEARCOAT\n\tmaterial.clearcoat *= gBFContact;\n#endif';

/* ---- the visible layer lines (LAYER_LINES) - settle samples only ----
   Two terms per drawn octave: a darkening of a narrow band at each seam that averages to exactly zero,
   and a bead - the normal rocked across the lines, valley at the seam. Last in the block, so the
   holographic pattern above reads the normal it always read; it is weighted off the contact face anyway.
   ⚠ THE SEAM IS A RELIEF VALLEY. The relief writes normal + across * sin( 2 pi phase ) * tan, which
   puts its crests at integer phase (vendor/layer-detail.js, "the crest must stay at t = 0"). Here x
   is integer at h = pitch * ( 0.5 + m 2^k ) - half-integer phase, a valley - and the bead term is
   the relief's own at the true pitch: - t sin( 2 pi x ) = + t sin( 2 pi h / pitch ). */
const LINES_BLOCK = [
  'if ( uLLOn > 0.5 ) {',
  /* derivatives before any per-fragment branch - uLLOn is a uniform, so this outer one is safe */
  '  float fpLL = max( length( vec2( dFdx( vLLh ), dFdy( vLLh ) ) ), 1e-6 );',   // mm of height per device px
  '  float fpCssLL = fpLL * max( uLLPxRatio, 1e-3 );',                             // per CSS px
  /* the coarsest octave AT or below the cap - a cap between two octaves rounds down */
  '  float kMaxLL = floor( log2( max( uLLMaxMm / uLLPitch, 1.0 ) ) + 1e-3 );',
  '  float kfLL = clamp( log2( max( uLLMinPx * fpCssLL / uLLPitch, 1.0 ) ), 0.0, kMaxLL );',
  '  float k0LL = floor( kfLL ); float tLL = kfLL - k0LL;',
  '  float albedoLL = 0.0; float slopeLL = 0.0;',
  '  for ( int o = 0; o < 2; o++ ) {',
  '    float wO = o == 0 ? 1.0 - tLL : tLL;',
  '    if ( wO <= 0.0 ) continue;',
  '    float S = uLLPitch * pow( 2.0, k0LL + float( o ) );',
  '    float x = ( vLLh - 0.5 * uLLPitch ) / S;',
  '    float fpC = fpLL / S;',                                                       // cycles per device px
  /* the seam: a band uLLWidth of a line wide at every integer x, as its cosine series - which has NO
     constant term, so the darkening averages to exactly zero. Each harmonic is softened the way the
     single-frame prototype softened its seam edge - a box 2 fpC wide, i.e. TWO device px, a
     deliberate stabilising blur rather than the physical pixel footprint - and band-limited at its OWN
     frequency, the relief's per-harmonic rule: a limit on the fundamental alone let the 2nd harmonic
     through past the sampling limit (review 01a0a0b7). Band-limited harmonics fall off with n, hence
     break; and since uLLBandHi < 0.5, 2 n fpC < 1 wherever one is drawn, so the softening never
     changes sign.
     ⚠ NEVER SHARPER THAN 0.08 OF A LINE: four harmonics of a sharper edge ring into a doubled seam,
     darkest either side of the valley (at dpr 2, lines 12-24 device px apart). The floor is a C1
     smooth max (width 0.02) so the softness does not change its rate abruptly while zooming; it
     equals fpC above 0.10, where the sign argument above needs it to. */
  '    for ( int n = 1; n <= 4; n++ ) {',
  '      float fn = float( n );',
  '      float An = 1.0 - smoothstep( uLLBandLo, uLLBandHi, fn * fpC );',
  '      if ( An <= 0.0 ) break;',
  '      float fpS = max( fpC, 0.08 ) + pow( max( 0.02 - abs( fpC - 0.08 ), 0.0 ), 2.0 ) / 0.08;',
  '      float bx = 3.14159265 * 2.0 * fn * fpS;',
  '      float soft = bx < 1e-4 ? 1.0 : sin( bx ) / bx;',
  '      albedoLL += wO * An * soft * ( 2.0 * sin( 3.14159265 * fn * uLLWidth ) / ( 3.14159265 * fn ) ) * cos( 6.2831853 * fn * x );',
  '    }',
  '    float A = 1.0 - smoothstep( uLLBandLo, uLLBandHi, fpC );',
  '    slopeLL += wO * sin( 6.2831853 * x ) * A;',
  '  }',
  /* walls only; off the bed face; and handed to the real relief as it fades in, over the same CSS
     px per true layer it uses */
  '  gLLNear = 1.0 - smoothstep( uLLHandLo, uLLHandHi, uLLPitch / fpCssLL );',
  '  float wLL = ( 1.0 - smoothstep( 0.35, 0.75, gBFAxial ) ) * ( 1.0 - gBFContact ) * gLLNear;',
  '  gLLW = wLL;',
  '  if ( wLL > 0.0 ) {',
  '    diffuseColor.rgb *= 1.0 - uLLDark * albedoLL * wLL;',
  /* the build axis in view space: cross( a1, axis x a1 ) = axis, carried by the grain tangents */
  '    vec3 axLL = normalize( cross( normalize( vPCT1 ), normalize( vPCT2 ) ) );',
  '    vec3 acLL = axLL - normal * dot( axLL, normal ); float acLen = length( acLL );',
  '    if ( acLen > 1e-4 ) normal = normalize( normal - ( acLL / acLen ) * slopeLL * tan( radians( uLLTilt ) ) * wLL );',
  '  }',
  '}',
].join('\n');

/* uBFDbg 1: the bed-face mask. 2 (measurement): R = roughnessFactor after every patch, G = the
   roughness GGX is given, B = the contact weight - raw, so a read-back pixel / 255 is the value.
   3 (measurement): the final normal's deviation from the plain interpolated normal,
   (normal - plain) x 8 + 0.5 per view-space component - mid-grey where nothing bent the normal.
   4 (measurement, meaningful only while uLLOn is 1): R = the layer lines' weight, G = |geometric
   normal . axis|, B = the hand-off factor (1 where the lines draw, 0 where the relief has taken over). */
const DEBUG_BLOCK = [
  'if ( uBFDbg > 3.5 ) gl_FragColor = vec4( gLLW, gBFAxial, gLLNear, 1.0 );',
  'else if ( uBFDbg > 2.5 ) gl_FragColor = vec4( clamp( ( normal - gBFPlainN ) * 8.0 + 0.5, 0.0, 1.0 ), 1.0 );',
  'else if ( uBFDbg > 1.5 ) gl_FragColor = vec4( roughnessFactor, material.roughness, gBFContact, 1.0 );',
  'else if ( uBFDbg > 0.5 ) gl_FragColor = vec4( mix( vec3( 0.16 ), vec3( 0.15, 0.95, 0.40 ), gBFContact ), 1.0 );',
].join('\n');

/* An anchor is a LINE that is only the directive. The layer relief injects a comment that quotes
   "'#include <common>'", so a plain substring count finds two; a real directive stands on its own
   line. Exactly one such line, or it throws - a patch that silently stopped applying must not pass
   for a result. */
const anchorRe = (a) => new RegExp('^[ \\t]*' + a.replace(/[.*+?^${}()|[\]\\<>]/g, '\\$&') + '[ \\t]*$', 'gm');
function after(src, directive, text, what) {
  const re = anchorRe(directive);
  const n = (src.match(re) || []).length;
  if (n !== 1) throw new Error(`bed finish: ${what} anchor ${directive} found on ${n} lines`);
  return src.replace(re, () => directive + '\n' + text);
}

/** The cache-key suffix a patched material adds, exported so a test can read it. */
export const BED_FINISH_KEY = '|bf1';

/**
 * Chain the finish onto a material's own shader patches.
 *
 * ⚠ CHAINS, NEVER ASSIGNS - the same rule as vendor/layer-detail.js. It must run AFTER the layer
 * relief (newPartMaterial orders it; test/layer-detail-seam.test.mjs gates the order): the plain
 * restore has to see what the relief put on a bed face in order to take it off. At runtime its
 * block sits after emissivemap_fragment, which three expands after normal_fragment_maps, where the
 * relief writes - so the order in the shader is right whatever the chain order, but the chain order
 * is what keeps each patch's anchors unique.
 *
 * @param {object} material        a MeshStandardMaterial or MeshPhysicalMaterial
 * @param {object} opts
 * @param {number[]} opts.axis     the build axis in the part's authored frame (unit, axis-aligned)
 * @param {object} opts.uniforms   the shared object from createBedFinishUniforms()
 * @param {object} [opts.holo]     { texture: {value}, roughness: number } for the holographic program
 * @returns the same material
 */
export function applyBedFinish(material, { axis, uniforms, holo = null }) {
  if (!Array.isArray(axis) || axis.length !== 3) throw new Error('bed finish: axis must be [x, y, z]');
  const len = Math.hypot(axis[0], axis[1], axis[2]);
  if (!(len > 0)) throw new Error('bed finish: zero axis');
  const own = { uAxis: { value: axis.map((v) => v / len) } };
  if (holo) {
    own.uBfHoloTex = holo.texture;
    own.uBfHoloRough = { value: holo.roughness };
  }
  const prior = Object.prototype.hasOwnProperty.call(material, 'onBeforeCompile') ? material.onBeforeCompile : null;
  /* chain the key the material resolved to BEFORE this patch - its own, or three's default
     (onBeforeCompile.toString()) - never a constant. A patched material must stay at least as
     distinct as its source, or three hands it a program another material compiled from different
     source. */
  const priorKey = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey')
    ? material.customProgramCacheKey : null;
  const priorKeyText = priorKey ? null : (prior ? String(prior) : '');
  material.onBeforeCompile = function (shader, renderer) {
    if (prior) prior.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms, own);
    shader.vertexShader = after(shader.vertexShader, '#include <common>',
      VERT_COMMON + (holo ? '\n' + HOLO_VERT_COMMON : ''), 'vertex common');
    shader.vertexShader = after(shader.vertexShader, '#include <begin_vertex>',
      VERT_MAIN + (holo ? '\n' + HOLO_VERT_MAIN : ''), 'begin_vertex');
    shader.fragmentShader = after(shader.fragmentShader, '#include <common>',
      FRAG_COMMON + (holo ? '\n' + HOLO_FRAG_COMMON : ''), 'fragment common');
    shader.fragmentShader = after(shader.fragmentShader, '#include <emissivemap_fragment>',
      CONTACT_BLOCK + '\n' + GRAIN_BLOCK + (holo ? '\n' + HOLO_BLOCK : '') + '\n' + LINES_BLOCK,
      'emissivemap_fragment');
    if (holo) shader.fragmentShader = after(shader.fragmentShader, '#include <lights_physical_fragment>',
      HOLO_CLEARCOAT, 'lights_physical_fragment');
    shader.fragmentShader = after(shader.fragmentShader, '#include <dithering_fragment>', DEBUG_BLOCK,
      'dithering_fragment');
  };
  const suffix = BED_FINISH_KEY + (holo ? 'h' : '');
  material.customProgramCacheKey = function () {
    return (priorKey ? priorKey.call(this) : priorKeyText) + suffix;
  };
  material.userData = Object.assign({}, material.userData, { bedFinish: holo ? 'holographic' : 'profile' });
  return material;
}

/* ---- the per-part geometry ------------------------------------------------------------------ */

/** The two bed-plane coordinates the holographic pattern is pinned to, for an axis-aligned axis:
    the plate's front plane (x, y) for a part growing along Z - the same pair the faceplate
    transfer has always used - (x, z) along Y, (z, y) along X. */
const planeAxes = (axis) => {
  const i = axis.findIndex((v) => Math.abs(v) > 0.5);
  return i === 2 ? [0, 1] : i === 1 ? [0, 2] : [2, 1];
};

/**
 * The finish attributes for one PART, all of whose meshes are given in the part's authored frame.
 *
 * @param {Float32Array[]} meshPositions  xyz per vertex, mm, part frame (node transform applied)
 * @param {number[]} axis                 the build axis (unit, axis-aligned)
 * @returns {{ mm: Float32Array[], uv: Float32Array[], hMin: number }}
 *   mm  aBfMm per mesh: position shifted so the bed plane passes through height 0 along the axis
 *   uv  aBfUv per mesh: the bed-plane coordinates over the PART's longer side, the same scale on
 *       both axes (one unstretched pattern per part)
 */
export function bedFaceAttributes(meshPositions, axis) {
  const ai = axis.findIndex((v) => Math.abs(v) > 0.5);
  if (ai < 0 || axis.some((v, i) => i !== ai && Math.abs(v) > 1e-9) || Math.abs(Math.abs(axis[ai]) - 1) > 1e-9) {
    throw new Error('bed finish: the build axis must be a signed unit axis, got ' + JSON.stringify(axis));
  }
  const s = Math.sign(axis[ai]);
  const [pu, pv] = planeAxes(axis);
  let hMin = Infinity, uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const p of meshPositions) {
    for (let k = 0; k < p.length; k += 3) {
      hMin = Math.min(hMin, s * p[k + ai]);
      uMin = Math.min(uMin, p[k + pu]); uMax = Math.max(uMax, p[k + pu]);
      vMin = Math.min(vMin, p[k + pv]); vMax = Math.max(vMax, p[k + pv]);
    }
  }
  /* ⚠ ONE SCALE FOR BOTH AXES - the part's longer bed-plane side. Normalising each axis over its own
     extent (what the faceplate transfer's per-geometry UVs do) stretched the pattern 3:1 into
     horizontal streaks on a long, low accent (seen on the review render, 2026-09-14). */
  const su = Math.max(uMax - uMin, vMax - vMin) || 1, sv = su;
  const mm = [], uv = [];
  for (const p of meshPositions) {
    const a = new Float32Array(p.length), t = new Float32Array((p.length / 3) * 2);
    for (let k = 0, j = 0; k < p.length; k += 3, j += 2) {
      a[k] = p[k]; a[k + 1] = p[k + 1]; a[k + 2] = p[k + 2];
      a[k + ai] -= s * hMin;                 // p - hMin * axis
      t[j] = (p[k + pu] - uMin) / su;
      t[j + 1] = (p[k + pv] - vMin) / sv;
    }
    mm.push(a); uv.push(t);
  }
  return { mm, uv, hMin };
}
