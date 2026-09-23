/* SEE-INTO TRANSLUCENT FILAMENT. Since 2026-09-18 ON BY DEFAULT for a translucent filament picked on a supported component
 * (grip / Essential face / Chevron faces - main.js); the frosted back-cover PRESET is still behind `?seeinto=frosted`.
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

/* THE BURIED LATTICE (trial, 2026-09-21 - Joey: "i thought we had a way to fake it with parallax?"). The lab's rounds 5-33
   drew the part's own infill UNDER its skin, and it never came across with the see-through (Astra had deferred the infill
   question "until buried-structure testing"). This is its SINGLE-MATERIAL form (the lab's uBacking 0): the walls and infill
   are the same filament as the skin, so they cannot show as a colour - they show as LESS of what is behind, because light
   crossing a line meets more plastic. The see-through is scaled by 1 - occlude * density, which inverts correctly between
   a dark and a light background.
   From the EdgeLabel 3MF (lab round 5): grid infill at 45 degrees, 15 % (a ~6 mm line pitch at 0.45 mm width), the grid in
   the LAYER plane - perpendicular to the part's print axis - so it rides with the part. depthMm / soft are the lab's round
   31-33 art values (0.8 mm of plastic over the structure, blur 0.35 mm per mm of skin), occlude 0.75 its round-27 default.
   THE LAB'S FULL MODEL, ported after Joey's first look (the grid alone ran down the grip's slopes, "where infill would never
   be"): (1) the structure shows only through faces that point ALONG the print axis - the top skin printed over the infill;
   walls and slopes are solid perimeter plastic (the lab's faceGate, 0.72-0.93); (2) TWO 0.45 mm perimeter walls follow the
   part's REAL layer outline - a cross-section cut just above its base along the print axis, turned into a distance field
   (bakeOutline below) - and the grid stops at the inner wall (3MF: perimeters 2 x 0.45). The distance fields share one
   atlas texture and every vertex carries its own atlas coordinate (aSIMask), because the patched material is shared by
   every plate size and cannot hold a per-size texture.
   ⚠ ONE CUT IS NOT ENOUGH (found on the Classic grip, 2026-09-21): a wedge's section changes with height, and a single cut
   just above its base was a sliver there, so almost no face showed structure. The bake therefore cuts a SLICE every
   sliceMm up the part - a stack of layer outlines - and each face reads the slice just INSIDE its skin: depthMm below a
   face that looks along +axis (the top skin, printed over the infill), depthMm above one that looks along -axis (the
   first layers, printed on the plate, with the infill growing above them). ⚠ Artistic values, not measured optics. */
export const SEE_INTO_LATTICE = Object.freeze({ pitchMm: 6.0, lineMm: 0.45, depthMm: 0.8, softPerMm: 0.35, occlude: 0.75,
  perimMm: 0.9, bakePxPerMm: 5, sliceMm: 1.0, maxSlices: 32,
  reachMm: 12.0,       // how far below the skin the parallax walks the walls (mm); the part's own thickness caps it
  fadeMm: 4.0,         // depth fade: a wall's contribution falls to 1/e this far below the skin (artistic, Joey 2026-09-22)
  skin: 0.5,           // the skin crosshatch's strength (0 = off)
  lensPx: 3.5,         // how far a skin bead bends the view behind it, drawing-buffer px (artistic)
  shell: 0.5,          // how strongly a seam between two perimeter beads reads (artistic)
  specTilt: 0.07,      // how far the skin beads tilt the shading normal: the glint along the lines (artistic)
  fillMm: 1.4,         // a grid needs this much room BEYOND the perimeters; narrower is all perimeter
  layerMm: 0.2,        // the layer height the crosshatch alternates at
  densityCap: 0.7,     // the most of the see-through the structure may take, so a part stays translucent
  clearMm: 9.0,
  budget: 1 / 10,      // the share of the outline atlas ONE geometry's slice stack may take
  minPx: 2.5 });       // the outline may blur down to this before the SLICES are thinned (see bakeOutline)     // mm of solid plastic that leaves about a third of the light: the transmission fall-off (artistic)

/** `?silattice=on|flat`: the trial switch - 'on' with parallax, 'flat' the pre-parallax surface pattern for comparison.
    Off (false) unless asked for, so the shipped look is untouched. */
export function parseSeeIntoLattice(search) {
  const v = new URLSearchParams(search || '').get('silattice');
  return v === 'on' || v === 'flat' ? v : false;
}

/** The preset the URL asks for, or null. Unknown values are null: an experiment never turns on by accident. */
export function parseSeeInto(search) {
  const v = new URLSearchParams(search || '').get('seeinto');
  return v && Object.prototype.hasOwnProperty.call(SEE_INTO_PRESETS, v) ? v : null;
}

/** How the experiment skips its extra renders. The assembly-state rule is ON by default since local integration and
 *  `?siskip=off` disables it for diagnosis. ⚠ It is an APPROXIMATION: measured page against page over 58 views per build
 *  (p62 skipsweep.mjs) it changes 13 of 58 views on the representative build and 17 of 58 on the 80-unit one, by at most
 *  43-45 px, the worst a 3 x 263 hairline at a case seam. Astra accepted that on 2026-09-17 from the sheets in
 *  integration/results/p62/sweep/. Older text below, kept for the reasoning:
 *  `?siskip=state` turns on the assembly-state rule (Astra's option 1
 *  as first built). It is OFF by default because the rule is NOT a proof of invisibility: measured 2026-09-17 (p62), a
 *  shut drawer's cover still occupies 6-60 px in 19 of 138 ordinary outside views of the representative build, ~900 px
 *  in a close view, and the whole frame from a camera inside the drawer - it shows through the very gap it fills. With
 *  the switch on those pixels render as plain frost (the see-through is 0, never a stale interior). */
/* The skip is ON by default as of local integration (Astra 2026-09-17: "accept the residual seam/sliver compromise shown in
   these sheets and make the skip the default for local integration. Keep ?siskip=off for diagnosis."). Measured residual: it
   changes at most 43-45 px in any of 58 swept views per build, the worst being a 3 x 263 hairline at a case seam. */
export const SEE_INTO_SKIP_DEFAULT = 'state';
export function parseSeeIntoSkip(search) {
  const v = new URLSearchParams(search || '').get('siskip');
  if (v === 'off') return null;              // the diagnosis switch: always available, whatever the default becomes
  if (v === 'state') return 'state';
  return SEE_INTO_SKIP_DEFAULT;
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
export const WRAP_TO = 'reflectedLight.directDiffuse += mix( dotNL, saturate( ( dot( geometryNormal, directLight.direction ) + uSIWrap ) / ( 1.0 + uSIWrap ) ), gSIWrapK * uSIActive ) * directLight.color * BRDF_Lambert( material.diffuseContribution );';

export const FRAG_HEAD = [
  'varying vec3 vSIObjNrm;',
  'varying vec3 vSIMm;',                         // object position, rotated + scaled to world millimetres, NOT translated
  'varying vec3 vSIAxW;',                        // the print axis in that same frame
  'uniform float uSILattice, uSILatPitch, uSILatLine, uSILatSoft, uSILatOcc, uSILatPerim;',
  'uniform sampler2D uSIMask;',                  // the outline atlas: mm to the layer outline, 25 steps per mm, 8 bit
  'uniform float uSILatDepth;',                  // mm of skin over the structure
  'uniform float uSILatSoftK, uSILatReach, uSILatPar, uSILatFade, uSILatSkin, uSILatBead, uSILatLayer;',   // blur per mm of depth, how deep the walls are walked, parallax on
  'varying vec3 vSINrmW;',                       // the geometric normal, world-rotated (the refraction needs it)
  'varying vec3 vSIWPos;',                       // world position, for the view direction
  'varying vec4 vSIMask3;',                      // this part's tile in the atlas: origin uv (xy) and content size (zw)
  'varying vec4 vSIMask;',                       // slice 0's atlas uv (xy) and one tile's size in uv (zw)
  'varying vec4 vSIMask2;',                      // tiles per row, this point's height along the axis (mm), slice step, slices
  'float siOutlineAt( vec2 off, float k ) {',     // slice k, at this point's uv moved by `off` (clamped to the tile)
  '  vec2 t = vec2( mod( k, vSIMask2.x ), floor( k / max( vSIMask2.x, 1.0 ) ) );',
  '  vec2 uv0 = vSIMask3.w > 0.0 ? clamp( vSIMask.xy + off, vSIMask3.xy, vSIMask3.xy + vSIMask3.zw ) : vSIMask.xy + off;',
  '  return texture2D( uSIMask, uv0 + t * vSIMask.zw ).r * ( 255.0 / 25.0 );',
  '}',
  'float gSIDens = 0.0;',                        // how much infill line this fragment looks through
  'float gSIPath = 0.0;',                        // mm of plastic this fragment's view ray crosses (0 = not measured)
  'uniform float uSIClearMm;',                   // how far light gets through this filament before it is gone
  'vec3 gSISpecW = vec3( 0.0 );',                 // the skin beads' slope, in the part's own world-rotated frame
  'uniform float uSISpecTilt, uSILatFill, uSILatCap;',
  'vec2 gSILens = vec2( 0.0 );',                  // the skin beads' bend of the see-through, drawing-buffer px
  'float gSIDiff = 0.0;',                         // and the extra blur they add
  'uniform float uSILensPx, uSILatShell;',
  'uniform float uSIActive, uSIRough, uSISee, uSIBlurPx, uSIWallOpaque, uSIGraze, uSIWrap;',
  'uniform float uSIOwn;',                       // per-material: 1 = keep this part's own colour and roughness
  'uniform float uSIOwnSee;',                    // shared: a filament-driven part's see-through, as a multiple of the preset's
  'uniform vec3 uSIAxisM;',                      // per-material: the direction this part printed in
  'uniform vec3 uSIColor, uSITint;',
  'uniform sampler2D uSIBehind;',
  'uniform vec2 uSIRes;',
  /* TWO weights, because they answer two different questions (Astra 2026-09-17). gSISee = how much of what is behind
     the part shows through HERE; gSIWrapK = how much the direct light wraps past the terminator HERE. They used to be
     one axis-aligned value and its complement, which made the PRINT DIRECTION decide which faces were made of
     translucent material. */
  'float gSISee = 0.0;',
  'float gSIWrapK = 0.0;',
].join('\n');

/* right after roughnessmap_fragment: before the layer relief (normal_fragment_maps) and the plate finish (emissivemap)
   modulate normal and roughness, so both still ride on top of the translucent part's own colour and roughness */
/* ⚠ uSIAxisM AND uSIOwn ARE PER-MATERIAL, not shared (2026-09-17, the faceplate-grip scope). uSIOwn is 1 for a part
   whose translucency comes from the FILAMENT the user assigned: it then keeps its own colour and roughness (Astra:
   "Don't force the frosted colour onto parts assigned opaque filament" - and equally, a translucent pick should look
   like the filament picked, not like the cover's preset). The reference back cover keeps uSIOwn 0 and wears the preset.

   ⚠⚠ TRANSLUCENCY IS A PROPERTY OF THE MATERIAL, NOT OF A FACE DIRECTION (Astra 2026-09-17: "print direction should
   control printed surface detail and bed-contact texture, not decide which faces are made of translucent material").
   A FILAMENT-DRIVEN part is therefore translucent on EVERY face - front, slopes and edges alike - and the only thing
   that modulates the see-through is the grazing term in FRAG_COMPOSITE, which stands in for the longer path light
   takes through the part at a shallow angle. The print direction still governs what it always governed, in the two
   modules that own those jobs: the printed relief and layer lines (bed-finish.js, keyed by buildAxisForKey) and the
   build-plate finish on the bed-contact face. This shader no longer reads uSIAxisM for a filament-driven part.
   ⚠ The REFERENCE COVER keeps the axis-weighted behaviour byte for byte: its appearance was accepted on 2026-09-17
   from the measured sheets, and re-tuning it would reopen that acceptance and tomorrow's release. The same question
   applies to it in principle - flagged, not changed. */
export const FRAG_SURFACE = [
  'if ( uSIActive > 0.5 ) {',
  '  if ( uSIOwn < 0.5 ) {',
  '    float siAxis = smoothstep( 0.72, 0.93, abs( dot( normalize( vSIObjNrm ), normalize( uSIAxisM ) ) ) );',
  '    gSISee = siAxis;',                       // the reference cover: plate-parallel faces see through, walls stay
  '    gSIWrapK = 1.0 - siAxis;',               // and the walls are where the scatter wrap lands
  '    diffuseColor.rgb = uSIColor;',
  '    roughnessFactor = uSIRough;',
  '  } else {',
  '    gSISee = 1.0;',                          // translucent throughout: every face shows what is behind it,
  '    gSIWrapK = 1.0;',                        // and light wraps on every face, because it is one material
  /* the buried lattice (SEE_INTO_LATTICE): a 45-degree grid in the layer plane, distance to the NEAREST line (not the cell
     centre - the lab's round-5 mistake), softened by the plastic over it and its darkness spread, not created */
  '    if ( uSILattice > 0.5 ) {',
  /* only the printed FACE looks into the part (lab faceGate): a wall or slope shows its perimeter plastic, not the lattice */
  '      float faceGate = smoothstep( 0.72, 0.93, abs( dot( normalize( vSIObjNrm ), normalize( uSIAxisM ) ) ) );',
  '      vec3 ax = normalize( vSIAxW );',
  '      vec3 t1 = normalize( abs( ax.y ) < 0.9 ? cross( ax, vec3( 0.0, 1.0, 0.0 ) ) : cross( ax, vec3( 1.0, 0.0, 0.0 ) ) );',
  '      vec3 t2 = cross( ax, t1 );',
  '      float pitch = max( uSILatPitch, 0.01 );',
  '      float hw = uSILatLine / pitch * 0.5;',
  '      float nA = dot( normalize( vSIObjNrm ), normalize( uSIAxisM ) );',
  '      float sgn = nA >= 0.0 ? 1.0 : -1.0;',
  '      float kMax = max( vSIMask2.w - 1.0, 0.0 );',
  '      float Htot = vSIMask2.z * vSIMask2.w;',
  /* the grid's screen-space line width, taken ONCE at the surface: derivatives inside the loop would be of a moving point */
  '      vec2 q0 = vec2( dot( vSIMm, t1 ), dot( vSIMm, t2 ) );',
  '      vec2 luv0 = vec2( q0.x - q0.y, q0.x + q0.y ) * 0.70710678 / pitch;',
  '      float aa = max( length( fwidth( luv0 ) ) * 0.5, 1e-4 );',
  /* PARALLAX (2026-09-21, Joey: "is it possible to do parallax?"). The walls and the infill are VERTICAL: every line of the
     grid is a wall standing from the skin down through the part, and the air between them is what scatters. So a view ray
     is refracted into the plastic (PLA ~1.5) and walked from under the skin to the far side; at each depth the grid and the
     outline are sampled where the RAY is, not where the surface is. Face-on the ray runs down one wall and nothing moves;
     at an angle the lines slide under the surface as the view turns, widen into walls and blur with depth. */
  '      vec3 nW = normalize( vSINrmW );',
  '      vec3 Vw = normalize( cameraPosition - vSIWPos );',
  '      if ( dot( nW, Vw ) < 0.0 ) nW = -nW;',
  '      vec3 Tr = uSILatPar > 0.5 ? refract( -Vw, nW, 0.6667 ) : -nW;',
  '      float cosT = max( dot( Tr, -nW ), 0.2 );',
  '      float room = sgn > 0.0 ? vSIMask2.y - uSILatDepth : Htot - vSIMask2.y - uSILatDepth;',
  /* a top or bottom skin looks down the build axis, through uSILatDepth of solid skin, and the part's own height caps how
     far there is to go; a wall looks straight into the perimeters from the surface, and the outline itself says where the
     part ends (a sample outside reads dOut 0). The face gate blends the two. */
  '      float z0 = uSILatDepth * faceGate;',
  '      float reach = uSILatPar > 0.5 ? mix( uSILatReach, clamp( room, 0.0, uSILatReach ), faceGate ) : 0.0;',
  /* the atlas is affine in the layer plane: solve the surface's own screen-space basis once, then any in-plane offset is a
     uv offset. Clamped to this part's tile, whose margin is outside the part, so running off the edge reads as "no wall". */
  '      vec3 Px = dFdx( vSIMm ), Py = dFdy( vSIMm );',
  '      vec2 Ux = dFdx( vSIMask.xy ), Uy = dFdy( vSIMask.xy );',
  '      float g11 = dot( Px, Px ), g12 = dot( Px, Py ), g22 = dot( Py, Py ), det = g11 * g22 - g12 * g12;',
  '      float nShell = uSILatPerim / max( uSILatLine, 0.01 );',   // perimeter beads before the infill starts
  '      float occS = 0.0, occW = 0.0, occM = 0.0, dOut0 = 0.0, plastic = 0.0;',
  '      float stepLen = ( reach / 12.0 ) / cosT;',   // how far the refracted ray travels between two samples
  '      for ( int k = 0; k < 12; k ++ ) {',
  '        float z = z0 + reach * float( k ) / 12.0;',     // the first sample is right under the skin (or at a wall's surface)
  '        vec3 o = Tr * ( z / cosT );',
  '        vec3 p = vSIMm + o;',
  '        vec2 q = vec2( dot( p, t1 ), dot( p, t2 ) );',
  '        vec2 luv = vec2( q.x - q.y, q.x + q.y ) * 0.70710678 / pitch;',
  '        vec2 dl = 0.5 - abs( fract( luv ) - 0.5 );',
  '        float dLine = min( dl.x, dl.y );',
  '        float sM = uSILatSoftK * ( uSILatDepth + 0.1 * z );',   // mm of blur: the skin's, and a little more with depth
  '        float softZ = sM / pitch;',
  '        float line = ( 1.0 - smoothstep( hw - aa - softZ, hw + aa + softZ, dLine ) ) * hw / ( hw + softZ );',
  '        vec3 oP = o - ax * dot( o, ax );',
  '        vec2 uvOff = abs( det ) > 1e-12 ? ( ( g22 * dot( oP, Px ) - g12 * dot( oP, Py ) ) * Ux + ( g11 * dot( oP, Py ) - g12 * dot( oP, Px ) ) * Uy ) / det : vec2( 0.0 );',
  '        float hs = vSIMask2.y + dot( o, ax );',          // this sample's own height along the build axis: its layer
  '        float kf = clamp( hs / max( vSIMask2.z, 0.01 ), 0.0, kMax );',
  '        float k0 = floor( kf );',
  '        float dOut = mix( siOutlineAt( uvOff, k0 ), siOutlineAt( uvOff, min( k0 + 1.0, kMax ) ), kf - k0 );',
  '        if ( vSIMask2.w < 0.5 || hs < 0.0 || hs > Htot ) dOut = 0.0;',
  '        float aaD = max( aa * pitch, 0.02 );',
  '        float inside = smoothstep( 0.0, 0.06, dOut );',
  /* ⚠ A GRID NEEDS A POCKET (Joey 2026-09-22: "these grips are way to thin to be able to have the large infill pattern in
     them, it would be made entirely from perimeters alone"). Past the last perimeter a slicer only starts a grid where the
     space left is worth filling; anything narrower is more perimeter and gap fill. So the infill starts uSILatFill BEYOND
     the perimeters, and a thin feature - a grip strip, a rib, a handle - never gets one. */
  '        float sparse = smoothstep( uSILatPerim + uSILatFill - aaD, uSILatPerim + uSILatFill + aaD, dOut );',
  /* THE PERIMETERS ARE SHELLS (Joey 2026-09-22: handles are "mostly perimeters, so not really cross hatching but concentric
     lines"). Every perimeter is a bead following the layer's outline, so the seams between them sit at whole multiples of
     a bead in from it - the outline's distance field says exactly where. The outer surface itself is not a seam; the last
     one is where the perimeters meet the infill. A ray through a wall crosses the shells; on a slope or a curve each layer's
     shells shift, which is what draws the nested contours. */
  '        float sh = dOut / max( uSILatLine, 0.01 );',
  '        float sdS = abs( fract( sh ) - 0.5 ) * 2.0;',
  '        float bS = ( aaD + sM ) / max( uSILatLine, 0.01 );',
  '        float shell = pow( smoothstep( 0.0, 1.0 + bS, sdS ), 1.6 ) * smoothstep( 0.5, 0.7, sh ) * ( 1.0 - smoothstep( nShell + 0.3, nShell + 0.5, sh ) );',
  /* HOW MUCH PLASTIC THIS RAY CROSSES (Joey 2026-09-22: at a grazing angle "we would be looking through multiple
     overlapping sections of the grip which should make it basically impossible to see through to the other side"). A
     sample inside the perimeters is solid; one out in the infill is mostly air, so it counts for a quarter. The sum is a
     real distance in mm, and the composite turns it into transmission - so a thin face stays clear and a long slanted
     path through a grip closes up, which is what the filament does. */
  '        plastic += inside * mix( 1.0, 0.25, sparse ) * stepLen;',
  '        if ( k == 0 ) dOut0 = dOut;',                  // the surface layer's own outline distance, for the skin below
  '        float occ = clamp( uSILatShell * shell * inside + line * sparse * inside, 0.0, 1.0 );',
  '        float wz = exp( -( z - z0 ) / uSILatFade );',   // light that went deeper scattered more: deep walls fade
  '        occS += occ * wz; occW += wz; occM = max( occM, occ * wz );',
  '      }',
  /* face-on every sample agrees; at an angle a crossed wall still reads nearly full. No face gate here any more: a wall
     looks into its perimeters too, and the outline decides whether there is any infill behind them. */
  '      gSIPath = plastic + z0 / cosT;',   // plus the skin the ray came through before the first sample
  '      gSIDens = min( mix( occS / max( occW, 1e-4 ), occM, 0.75 ), uSILatCap );',   // never enough to close the part up
  /* THE SKIN'S OWN LINES (Joey 2026-09-22: "3d prints are made of criss crossing layers ... at or below the surface"). The
     solid skin over the infill is uSILatSkinN layers of 0.45 mm beads laid at 45 degrees, each layer turned 90 from the one
     under it. Seen through clear plastic the seams between beads read as a fine crosshatch just below the surface, the
     nearest layer strongest. Same refracted ray as the walls, so it slides with the view too. Band-limited: a bead pitch
     under ~2.5 px fades out rather than crawling (Very High's settle samples then average what is left). */
  '      if ( uSILatSkin > 0.0 ) {',
  '        float fwC = length( fwidth( luv0 ) ) * pitch / uSILatBead;',   // bead cycles per pixel
  '        float band = 1.0 - smoothstep( 0.2, 0.4, fwC );',
  '        float skin = 0.0;',
  /* ⚠ A SKIN IS LAID INSIDE ITS PERIMETERS (Joey 2026-09-22: "the crosshatch goes right to the edge but realistically there
     are perimeter lines"). The beads start one perimeter band in from the layer's outline; the ring outside them is the
     perimeters themselves, which the shells above already draw. */
  '        float skinIn = smoothstep( uSILatPerim - 0.15, uSILatPerim + 0.15, dOut0 );',
  /* THE BEADS ARE LENSES (Joey 2026-09-22: "more of an appearance closer to what you'd find on a light diffuser ... a surface
     diffused by this crosshatch of overlapping layers"). Each bead is a rounded rod; light through it is bent across the
     bead, by an amount that swings from one side to the other over its width. The two outermost layers do most of it, at
     90 degrees to each other: resolved, the view behind ripples in a crosshatch; too fine to resolve, the same swings
     average into blur - so a skin is always a diffuser, never a window. Directions are the beads' own screen gradients. */
  '        float cA = ( q0.x + q0.y ) * 0.70710678 / uSILatBead, cB = ( q0.x - q0.y ) * 0.70710678 / uSILatBead;',
  '        vec2 gA = vec2( dFdx( cA ), dFdy( cA ) ), gB = vec2( dFdx( cB ), dFdy( cB ) );',
  '        vec2 dA = gA / max( length( gA ), 1e-6 ), dB = gB / max( length( gB ), 1e-6 );',
  '        gSILens = faceGate * skinIn * uSILensPx * band * ( dA * sin( 6.2831853 * cA ) * 0.8 + dB * sin( 6.2831853 * cB ) * 0.55 );',
  /* and the same two layers leave the skin faintly rippled, so the lines REFLECT as well as block (Joey 2026-09-22: "is it
     possible to have specular reflection on the theoretical reflections of the layer lines?"). A slope in the beads' own
     plane, handed to the normal after three has built it (SPEC_BLOCK) - so it lights through the ordinary specular path and
     the glints travel with the view and the light, instead of being painted on. */
  '        vec3 wA = normalize( t1 + t2 ), wB = normalize( t1 - t2 );',
  '        gSISpecW = uSISpecTilt * band * faceGate * skinIn * ( wA * sin( 6.2831853 * cA ) * 0.8 + wB * sin( 6.2831853 * cB ) * 0.55 );',
  '        gSIDiff = faceGate * uSILensPx * ( 0.35 + 0.5 * ( 1.0 - band ) );',
  '        for ( int j = 0; j < 4; j ++ ) {',
  '          float zj = uSILatLayer * ( float( j ) + 0.5 );',
  '          if ( zj > uSILatDepth ) break;',
  '          vec3 pj = vSIMm + Tr * ( zj / cosT );',
  '          vec2 qj = vec2( dot( pj, t1 ), dot( pj, t2 ) );',
  '          float c = ( mod( float( j ), 2.0 ) < 0.5 ? qj.x + qj.y : qj.x - qj.y ) * 0.70710678 / uSILatBead;',
  '          float sd = abs( fract( c ) - 0.5 ) * 2.0;',                 // 0 at a bead centre, 1 on the seam between two
  /* a rounded rod across its whole width: clearest through the crown, most scattering toward the two edges */
  '          float seam = pow( smoothstep( 0.0, 1.0 + fwC, sd ), 1.6 );',
  '          skin += seam * exp( -zj / 0.35 );',
  '        }',
  '        gSIDens = clamp( gSIDens + faceGate * band * skinIn * uSILatSkin * skin, 0.0, 1.0 );',
  '      }',
  '    }',
  '  }',
  '}',
].join('\n');

/** The skin beads' ripple, handed to the shading normal. Zero unless a filament-driven part is drawing its lattice. */
export const SPEC_BLOCK = [
  'if ( dot( gSISpecW, gSISpecW ) > 0.0 ) {',
  '  vec3 svS = mat3( viewMatrix ) * gSISpecW;',
  '  normal = normalize( normal - svS );',
  '}',
].join('\n');

export const FRAG_COMPOSITE = [
  'if ( uSIActive > 0.5 && uSISee > 0.0 ) {',
  '  vec2 suv = ( gl_FragCoord.xy + gSILens ) / uSIRes;',   // gSILens / gSIDiff are 0 unless the skin lenses are on
  '  vec3 siAcc = texture2D( uSIBehind, suv ).rgb; float siW = 1.0;',
  '  for ( int i = 0; i < 12; i++ ) { float ga = float( i ) * 2.39996;',
  '    float gr = ( uSIBlurPx + gSIDiff ) * sqrt( ( float( i ) + 0.5 ) / 12.0 );',
  '    siAcc += texture2D( uSIBehind, suv + vec2( cos( ga ), sin( ga ) ) * gr / uSIRes ).rgb; siW += 1.0; }',
  '  vec3 seeC = ( siAcc / siW ) * uSITint;',
  '  float kSee = uSISee * mix( 1.0, gSISee, clamp( uSIWallOpaque, 0.0, 1.0 ) );',
  '  float nvS = clamp( dot( geometryNormal, geometryViewDir ), 0.0, 1.0 );',
  '  float Fg = 0.04 + 0.96 * pow( 1.0 - nvS, 5.0 );',
  '  kSee *= mix( 1.0, 1.0 - Fg, uSIGraze );',
  '  kSee *= 1.0 - uSILatOcc * gSIDens;',       // 0 unless the lattice is on for a filament-driven part
  '  if ( uSIOwn > 0.5 ) kSee = clamp( kSee * uSIOwnSee, 0.0, 1.0 );',
  '  if ( gSIPath > 0.0 ) kSee *= exp( -gSIPath / max( uSIClearMm, 0.1 ) );',   // thick, or a long slanted path: it closes up
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
export function patchSeeIntoMaterial(material, uniforms, lightsParsChunk, own = null) {
  if (!lightsParsChunk || !lightsParsChunk.includes(WRAP_FROM)) throw new Error('see-into: the wrap anchor is missing from lights_physical_pars_fragment');
  const prior = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prior) prior.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms, own || {});
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <common>',
      '#include <common>\nvarying vec3 vSIObjNrm;\nvarying vec3 vSIMm;\nvarying vec3 vSIAxW;\nuniform vec3 uSIAxisM;\nattribute vec4 aSIMask;\nattribute vec4 aSIMask2;\nattribute vec4 aSIMask3;\nvarying vec4 vSIMask;\nvarying vec4 vSIMask2;\nvarying vec4 vSIMask3;\nvarying vec3 vSINrmW;\nvarying vec3 vSIWPos;', 'vertex common');
    /* the lattice lives in millimetres and rides with the part: the model matrix's rotation and scale (the mesh node carries
       the meshopt quantisation scale), never its translation, so a sliding drawer does not drag the pattern */
    shader.vertexShader = replaceOnce(shader.vertexShader, '#include <begin_vertex>',
      '#include <begin_vertex>\nvSIObjNrm = objectNormal;\nvSIMm = mat3( modelMatrix ) * transformed;\nvSIAxW = mat3( modelMatrix ) * uSIAxisM;\nvSIMask = aSIMask;\nvSIMask2 = aSIMask2;\nvSIMask3 = aSIMask3;\nvSINrmW = mat3( modelMatrix ) * objectNormal;\nvSIWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;', 'begin_vertex');
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <common>', '#include <common>\n' + FRAG_HEAD, 'fragment common');
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FRAG_SURFACE, 'roughnessmap_fragment');
    /* the bead ripple reaches the normal AFTER three has built it (normal_fragment_maps runs before this anchor), and
       before any lighting - so it is ordinary specular, not an overlay. bed-finish.js patches the same anchor; both chain. */
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + SPEC_BLOCK, 'emissivemap_fragment');
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <transmission_fragment>', FRAG_COMPOSITE + '\n#include <transmission_fragment>', 'transmission_fragment');
    // includes are resolved AFTER onBeforeCompile, so the lights chunk is expanded here to edit one line of it
    shader.fragmentShader = replaceOnce(shader.fragmentShader, '#include <lights_physical_pars_fragment>',
      lightsParsChunk.replace(WRAP_FROM, WRAP_TO), 'lights_physical_pars_fragment');
  };
  const priorKey = material.customProgramCacheKey;
  // ⚠ A NEW CACHE KEY OR THE PATCH NEVER COMPILES: three would reuse the unpatched program (the lab's round-3 trap)
  material.customProgramCacheKey = () => `${priorKey ? priorKey.call(material) : ''}|seeinto`;   // the per-material uniforms do not change the PROGRAM, only its values
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
    uSIBehind: { value: null },
    uSIRes: { value: new T.Vector2(1, 1) },
    uSILattice: { value: o.lattice ? 1 : 0 },
    uSILatPitch: { value: SEE_INTO_LATTICE.pitchMm },
    uSILatLine: { value: SEE_INTO_LATTICE.lineMm },
    uSILatSoft: { value: SEE_INTO_LATTICE.softPerMm * SEE_INTO_LATTICE.depthMm },
    uSILatOcc: { value: SEE_INTO_LATTICE.occlude },
    uSILatPerim: { value: SEE_INTO_LATTICE.perimMm },
    uSIMask: { value: null },   // the outline atlas (bakeOutline); the placeholder until the first bake
    uSILatDepth: { value: SEE_INTO_LATTICE.depthMm },
    uSILatSoftK: { value: SEE_INTO_LATTICE.softPerMm },
    uSILatReach: { value: SEE_INTO_LATTICE.reachMm },
    uSILatFade: { value: SEE_INTO_LATTICE.fadeMm },
    uSILatSkin: { value: SEE_INTO_LATTICE.skin },
    uSILensPx: { value: SEE_INTO_LATTICE.lensPx },
    uSISpecTilt: { value: SEE_INTO_LATTICE.specTilt },
    uSILatFill: { value: SEE_INTO_LATTICE.fillMm },
    uSILatCap: { value: SEE_INTO_LATTICE.densityCap },
    uSIClearMm: { value: SEE_INTO_LATTICE.clearMm },
    uSILatShell: { value: SEE_INTO_LATTICE.shell },
    uSILatBead: { value: SEE_INTO_LATTICE.lineMm },
    uSILatLayer: { value: SEE_INTO_LATTICE.layerMm },
    uSILatPar: { value: o.lattice === 'flat' ? 0 : 1 },   // ?silattice=flat keeps the pre-parallax look, for comparison
    uSIOwnSee: { value: 1 },   // set every prepare() from o.ownSee() - the reference cover never reads it
  };
  const stats = { passRuns: 0, passRunsStill: 0, skippedHidden: 0, lastMs: 0, lastMsA: 0, lastMsMask: 0, lastMsB: 0, active: false, parts: 0, lastReason: '' };
  const placeholder = (() => { const t = new T.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); t.needsUpdate = true; return t; })();
  uniforms.uSIBehind.value = placeholder;
  uniforms.uSIMask.value = placeholder;   // distance 0 everywhere = no structure until a part's outline is baked

  /* ---- the buried lattice's LAYER-OUTLINE BAKE (the lab's __maskFor, generalised; see SEE_INTO_LATTICE).
     For one part geometry: cut it 0.1 mm above its lowest point along its print axis, look straight down that axis with
     everything above the cut clipped away - a point inside the solid then sees the INSIDE of the part (a back face) first -
     and turn that mask into millimetres to the outline with an exact Euclidean distance transform. The result goes into ONE
     shared atlas texture, and the geometry gains a per-vertex attribute (aSIMask) holding each vertex's place in it. That
     mapping is affine (an orthographic view), so interpolating it across a triangle is exact, and because it is derived
     from the vertex's OBJECT position it is right for every instance of that geometry wherever it sits or slides.
     Once per geometry, when the lattice is on and a filament-driven part first needs it - never per frame. */
  const ATLAS_W = 4096, ATLAS_H = 4096;
  const atlas = { data: null, tex: null, x: 0, y: 0, rowH: 0, full: false };
  const outlined = new WeakSet();
  function atlasPeek(w, h) {
    const x = atlas.x + w > ATLAS_W ? 0 : atlas.x, y = atlas.x + w > ATLAS_W ? atlas.y + atlas.rowH + 1 : atlas.y;
    return w <= ATLAS_W && y + h <= ATLAS_H;
  }
  function atlasAlloc(w, h) {
    if (atlas.x + w > ATLAS_W) { atlas.x = 0; atlas.y += atlas.rowH + 1; atlas.rowH = 0; }
    if (atlas.y + h > ATLAS_H || w > ATLAS_W) { atlas.full = true; return null; }
    const at = { x: atlas.x, y: atlas.y };
    atlas.x += w + 1; atlas.rowH = Math.max(atlas.rowH, h);
    return at;
  }
  function bakeOutline(mesh, axisObj, label) {
    const g = mesh.geometry;
    if (!g || !g.attributes.position) return false;
    mesh.updateMatrixWorld(true);
    const MW = mesh.matrixWorld;
    const a = new T.Vector3(...axisObj).transformDirection(MW);
    const u = new T.Vector3().crossVectors(a, Math.abs(a.y) < 0.9 ? new T.Vector3(0, 1, 0) : new T.Vector3(1, 0, 0)).normalize();
    const v = new T.Vector3().crossVectors(a, u);
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox;
    let lo = Infinity, hi = -Infinity, u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    const c = new T.Vector3();
    for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
      c.set(x, y, z).applyMatrix4(MW);
      lo = Math.min(lo, c.dot(a)); hi = Math.max(hi, c.dot(a));
      u0 = Math.min(u0, c.dot(u)); u1 = Math.max(u1, c.dot(u)); v0 = Math.min(v0, c.dot(v)); v1 = Math.max(v1, c.dot(v));
    }
    u0 -= 1; u1 += 1; v0 -= 1; v1 += 1;                       // a millimetre of margin, so the outline never touches the edge
    const L = SEE_INTO_LATTICE;
    /* ⚠⚠ EVERY GEOMETRY GETS A BUDGET, because the atlas is SHARED and first come first served
       (found 2026-09-22 from Joey's "the 2W-1H faceplate is missing the infill pattern ... yet it's
       showing for the 1W-1H"). MEASURED before the budget: ONE Classic Pro pair - the 1W and 2W
       plates with their zones, accents, covers and label - took 11.7 Mpx of the 16.8 the atlas
       holds, 70%, the 2W grip alone 3.65. A third plate size would not have fitted, and a part that
       does not fit bakes NOTHING: no shells, no grid, silently, on that size alone.
       So a stack is trimmed to L.budget of the atlas before it is placed - and ⚠ PIXELS FIRST, down
       to L.minPx, SLICES only after. Trimming slices first was tried on 2026-09-22 and Joey caught it
       within the hour ("there's this weird striped appearance on the classic handle"): the Classic Pro
       grip is a SCOOP, its cross-section changes with height, and at 7 slices over 25 mm the outline
       stepped in 3.6 mm jumps that read as bands across it. A coarser outline blurs; a coarser stack
       STAIRCASES, and a slope is where it shows. A part still shows nothing if even the trimmed stack
       will not fit, and stats.bakes records that rather than leaving it to be noticed. */
    const BUDGET = ATLAS_W * ATLAS_H * L.budget;
    const span = hi - lo;
    let step = Math.max(L.sliceMm, span / L.maxSlices);
    let PX = L.bakePxPerMm, w, h, cols, rows, K = 1, at = null;
    const trim = () => { if (PX > L.minPx) PX = Math.max(L.minPx, PX * 0.8); else step *= 1.4; };
    for (let tries = 0; tries < 24 && !at; tries++) {
      K = Math.max(1, Math.min(L.maxSlices, Math.ceil(span / step)));
      w = Math.max(2, Math.ceil((u1 - u0) * PX)); h = Math.max(2, Math.ceil((v1 - v0) * PX));
      cols = Math.max(1, Math.min(K, Math.floor(ATLAS_W / (w + 1)))); rows = Math.ceil(K / cols);
      const area = cols * (w + 1) * rows * (h + 1);
      if (area > BUDGET || cols * (w + 1) > ATLAS_W) { trim(); continue; }
      if (atlasPeek(cols * (w + 1), rows * (h + 1))) at = atlasAlloc(cols * (w + 1), rows * (h + 1));
      else trim();                                            // the atlas is filling: trim and try again
    }
    if (!at) { atlas.full = true;                            // atlas full: this part simply shows no structure
      (stats.bakes = stats.bakes || []).push({ label: label || '?', skipped: 'atlas full' });
      return false; }
    // the camera's x/y ARE u/v: its basis is (u, v, a), placed above the part and looking back down -a
    const cam = new T.OrthographicCamera(u0, u1, v1, v0, 0.5, hi - lo + 20);
    cam.matrixAutoUpdate = false;
    cam.matrixWorld.makeBasis(u, v, a).setPosition(a.clone().multiplyScalar(hi + 10));
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    cam.updateProjectionMatrix();
    const plane = new T.Plane(a.clone().negate(), 0);
    const mat = new T.MeshBasicMaterial({ side: T.DoubleSide, clippingPlanes: [plane] });
    mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );',
      'vec4 diffuseColor = vec4( gl_FrontFacing ? vec3( 0.0 ) : vec3( 1.0 ), 1.0 );'); };
    const sc = new T.Scene();
    const mm = new T.Mesh(g, mat); mm.matrixAutoUpdate = false; mm.matrix.copy(MW); mm.matrixWorld.copy(MW); sc.add(mm);
    const rt = new T.WebGLRenderTarget(w, h), buf = new Uint8Array(w * h * 4);
    const INF = 1e20, N = Math.max(w, h), fb = new Float64Array(N), db = new Float64Array(N),
      vb = new Int32Array(N), zb = new Float64Array(N + 1), D = new Float64Array(w * h);
    const dt = (n) => { let k = 0; vb[0] = 0; zb[0] = -INF; zb[1] = INF;
      for (let q = 1; q < n; q++) {
        let sv = ((fb[q] + q * q) - (fb[vb[k]] + vb[k] * vb[k])) / (2 * q - 2 * vb[k]);
        while (sv <= zb[k]) { k--; sv = ((fb[q] + q * q) - (fb[vb[k]] + vb[k] * vb[k])) / (2 * q - 2 * vb[k]); }
        k++; vb[k] = q; zb[k] = sv; zb[k + 1] = INF; }
      k = 0; for (let q = 0; q < n; q++) { while (zb[k + 1] < q) k++; db[q] = (q - vb[k]) * (q - vb[k]) + fb[vb[k]]; } };
    if (!atlas.data) atlas.data = new Uint8Array(ATLAS_W * ATLAS_H);
    const prev = { clip: R.localClippingEnabled, rt: R.getRenderTarget(), auto: R.autoClear,
      cc: R.getClearColor(new T.Color()), ca: R.getClearAlpha(), sh: R.shadowMap.needsUpdate };
    if (o.pauseShadowWatch) o.pauseShadowWatch(true);
    let insideAll = 0;
    try {
      R.localClippingEnabled = true; R.setRenderTarget(rt); R.setClearColor(0x000000, 1); R.autoClear = true;
      for (let k = 0; k < K; k++) {
        plane.constant = lo + (k + 0.5) * step;              // the layer at the middle of this slice; above it is cut away
        R.clear(); R.render(sc, cam); R.readRenderTargetPixels(rt, 0, 0, w, h, buf);
        // exact squared EDT (Felzenszwalb), as the lab: 0 outside the section, INF inside
        for (let i = 0; i < w * h; i++) { const on = buf[i * 4] > 127; D[i] = on ? INF : 0; insideAll += on; }
        for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) fb[y] = D[y * w + x]; dt(h); for (let y = 0; y < h; y++) D[y * w + x] = db[y]; }
        for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) fb[x] = D[y * w + x]; dt(w); for (let x = 0; x < w; x++) D[y * w + x] = db[x]; }
        const ox = at.x + (k % cols) * (w + 1), oy = at.y + Math.floor(k / cols) * (h + 1);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const d = D[y * w + x];
          atlas.data[(oy + y) * ATLAS_W + ox + x] = d ? Math.min(255, Math.round(Math.max(Math.sqrt(d) - 0.5, 0) / PX * 25)) : 0;
        }
      }
    } finally {
      R.localClippingEnabled = prev.clip; R.setRenderTarget(prev.rt); R.autoClear = prev.auto;
      R.setClearColor(prev.cc, prev.ca); R.shadowMap.needsUpdate = prev.sh; rt.dispose(); mat.dispose();
      if (o.pauseShadowWatch) o.pauseShadowWatch(false);
    }
    if (!atlas.tex) {
      atlas.tex = new T.DataTexture(atlas.data, ATLAS_W, ATLAS_H, T.RedFormat, T.UnsignedByteType);
      atlas.tex.minFilter = atlas.tex.magFilter = T.LinearFilter;
      uniforms.uSIMask.value = atlas.tex;
    }
    atlas.tex.needsUpdate = true;
    /* per vertex: slice 0's atlas uv + one tile's size (aSIMask), and the tile layout + this vertex's height above the
       part's lowest point along the axis (aSIMask2). All affine in the vertex position, so interpolation is exact. */
    const pos = g.attributes.position, n = pos.count, m1 = new Float32Array(n * 4), m2 = new Float32Array(n * 4), m3 = new Float32Array(n * 4), p = new T.Vector3();
    const tu = (w + 1) / ATLAS_W, tv = (h + 1) / ATLAS_H;
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(MW);
      m1[i * 4] = (at.x + (p.dot(u) - u0) / (u1 - u0) * w) / ATLAS_W;
      m1[i * 4 + 1] = (at.y + (p.dot(v) - v0) / (v1 - v0) * h) / ATLAS_H;
      m1[i * 4 + 2] = tu; m1[i * 4 + 3] = tv;
      m2[i * 4] = cols; m2[i * 4 + 1] = p.dot(a) - lo; m2[i * 4 + 2] = step; m2[i * 4 + 3] = K;
      m3[i * 4] = at.x / ATLAS_W; m3[i * 4 + 1] = at.y / ATLAS_H; m3[i * 4 + 2] = (w - 1) / ATLAS_W; m3[i * 4 + 3] = (h - 1) / ATLAS_H;
    }
    g.setAttribute('aSIMask', new T.BufferAttribute(m1, 4));
    g.setAttribute('aSIMask2', new T.BufferAttribute(m2, 4));
    g.setAttribute('aSIMask3', new T.BufferAttribute(m3, 4));
    stats.outlines = (stats.outlines || 0) + 1;
    stats.lastOutline = { w, h, slices: K, stepMm: +step.toFixed(2), px: +PX.toFixed(2), insideFrac: +(insideAll / (w * h * K)).toFixed(3) };
    /* one row per baked geometry, so a part that came out coarse - or did not fit the atlas at all - can be read back
       rather than guessed at (the 2026-09-22 "the 2W plate has no infill" report) */
    (stats.bakes = stats.bakes || []).push({ label: label || '?', ...stats.lastOutline, atlasFull: atlas.full });
    return true;
  }
  /** Bake every filament-driven part that the lattice needs and has not got yet. Cheap when there is nothing to do. */
  function ensureOutlines() {
    if (!uniforms.uSILattice.value || atlas.full) return;
    for (const part of o.parts()) for (const mesh of part.meshes) {
      const si = mesh.material && mesh.material.userData && mesh.material.userData.seeInto;
      if (!si || !si.own || !mesh.geometry || outlined.has(mesh.geometry)) continue;
      outlined.add(mesh.geometry);
      bakeOutline(mesh, si.axis, `${part.partId} ${mesh.userData.zone || '-'}`);
    }
  }

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
  /* ⚠⚠ THE MASK HAS NO DEPTH TEST - IT IS THE COVERS' WHOLE SILHOUETTE. The mask pass draws the translucent parts alone
     on their own layer, so it marks them even where the faceplate and the drawer stand in front, and weighting AO by
     that mask lightened contact shading across a band on every drawer front: 37,225 px, up to 89 levels, on one ordinary
     view of the representative build, which was 97% of everything the candidate changed against today's Very High
     (p62, 2026-09-17). The weighting is now gated on the cover really being the nearest surface - pass A's cover depth
     against the scene depth the AO pass already renders. Both are window depth from the same camera; the AO depth is
     half resolution, so a silhouette edge can land in the neighbouring texel, which shows as full AO on a cover's
     outermost pixel and never as a band on the part in front of it. */
  /* ⚠ NEVER A NULL SAMPLER (local review local-20260917-154809-151): the fetch happens whether or not the weight ends up
     at 1, so both start on the 1x1 placeholder and the weight is forced to 1 until a real pair exists. */
  comp.uniforms.tSICoverDepth = { value: placeholder };
  comp.uniforms.tSISceneDepth = { value: (o.sceneDepth && o.sceneDepth()) || placeholder };
  comp.fragmentShader = replaceOnce(comp.fragmentShader,
    'uniform sampler2D tAO; uniform float uStrength; varying vec2 vUv;',
    'uniform sampler2D tAO; uniform float uStrength; varying vec2 vUv; uniform sampler2D tSIMask; uniform float uSIAOWeight; uniform sampler2D tSICoverDepth; uniform sampler2D tSISceneDepth;', 'AO composite head');
  comp.fragmentShader = replaceOnce(comp.fragmentShader,
    'gl_FragColor = vec4( 0.0, 0.0, 0.0, clamp( ( 1.0 - a ) * uStrength, 0.0, 1.0 ) );',
    'float siM = clamp( texture2D( tSIMask, vUv ).r, 0.0, 1.0 );\n' +
    'if ( siM > 0.0 ) { float cd = texture2D( tSICoverDepth, vUv ).x, sd = texture2D( tSISceneDepth, vUv ).x;\n' +
    '  siM *= step( cd, sd ); }\n' +
    'float siW = mix( 1.0, uSIAOWeight, siM );\n' +
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
  let keyRef = '', hasRef = false, lastMoving = false, hasDepthPair = false;
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
    if (comp) {
      comp.uniforms.tSIMask.value = rtMask.texture;
      comp.uniforms.tSICoverDepth.value = rtA.depthTexture;
      const sd = o.sceneDepth ? o.sceneDepth() : null;
      comp.uniforms.tSISceneDepth.value = sd || placeholder;   // the AO pass's target is rebuilt on resize
      hasDepthPair = !!sd;
    }
  }

  /**
   * Once per frame, before anything renders the scene. `moving` = the camera or a tween moved this frame.
   * Returns true when the passes ran.
   */
  function prepare({ moving }) {
    const on = !!o.wanted();
    stats.active = on;
    /* a filament-driven part's see-through strength, re-read every frame because the build plate that decides it is a
       uniform-only switch elsewhere (Powder <-> Smooth rebuilds no material) */
    uniforms.uSIOwnSee.value = o.ownSee ? o.ownSee() / P.see : 1;
    uniforms.uSIActive.value = on ? 1 : 0;
    if (comp) comp.uniforms.uSIAOWeight.value = on ? P.aoWeight : 1;
    if (!on) { hasRef = false; lastMoving = false; uniforms.uSISee.value = P.see; return false; }
    ensureOutlines();
    /* ⚠ NO COVER IN ANY VIEW, NO RENDERS (Astra 2026-09-17, option 1). The see-through goes to 0 rather than keeping the
       last interior: a skipped frame must never sample a stale image, and a part that leaks a few pixels through a slot
       then renders as plain frost instead of wrongly. hasRef is dropped, so the frame a cover becomes visible again -
       decided on THAT frame, not from the last one - runs the passes before anything is drawn. */
    if (comp) {
      const sd = o.sceneDepth ? o.sceneDepth() : null;
      comp.uniforms.tSISceneDepth.value = sd || placeholder;
      if (!sd || !hasDepthPair) comp.uniforms.uSIAOWeight.value = 1;   // no depth pair to judge visibility by, no weighting
    }
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
    /**
     * Patch one part material. `axis` is THAT part's build axis - the direction it printed in - and `own` is true when the
     * translucency came from the FILAMENT the user assigned: the part then keeps its own colour and roughness and only the
     * interior is mixed in. Both are PER-MATERIAL uniforms, so a patched grip cannot move a patched cover.
     */
    patch(material, axis, { own = false } = {}) {
      const perMaterial = {
        uSIAxisM: { value: new T.Vector3(...(axis && axis.length === 3 ? axis : [0, 0, 1])).normalize() },
        uSIOwn: { value: own ? 1 : 0 },
      };
      material.userData.seeInto = { own: !!own, axis: perMaterial.uSIAxisM.value.toArray() };
      return patchSeeIntoMaterial(material, uniforms, T.ShaderChunk.lights_physical_pars_fragment, perMaterial);
    } };
}
