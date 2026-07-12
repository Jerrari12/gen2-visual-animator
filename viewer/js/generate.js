// Planner build → viewer manifest, at runtime. No backend: the planner's
// #build= hash (base64 JSON of its serializeBuild()) is the entire input.
//
// All placement numbers derive from the ground-truth calibration of
// 2026-07-04 (see CLAUDE.md "Placement math"). Rules generalized from the
// 1H ground truth are marked DERIVED; positions Joey tuned by eye are
// marked TUNED. Scope: all six collections (59/115/165/185/240/270) — tabletop
// and wall everywhere; under-table only where rail GLBs exist (165/185). The 59
// is a mini collection: 1W/2W × 05H/1H only, and NO footrails BY DESIGN (Joey
// 2026-07-10: too shallow to be stable on rails) — feet go into every bottom
// case's own underside slots instead.

const PITCH_X = 88, PITCH_HALF_Y = 28;        // 1W column / half-row pitch
const ROW0_BOTTOM = 17.65;                    // bottom-row case bottom (7.65 + 10.00)
const FRL_Y = 7.65, FRU_Y = 12.75;
const DEPTH = 185;                            // staging/framing baseline (slide-in reach, camera size floor) — NOT placement
let CAM_DEPTH = DEPTH;                        // cam()'s size floor — raised per run for the deeper collections (240/270), set in generateManifest

// Collection depth table. The 165 is the 185 model shortened exactly 20 mm
// overall; every part is exported re-centered on its own bbox (depth_mode:
// center), so in file coordinates each case face moves dz = (185−depth)/2 toward
// center (10 mm for 165). Collection-specific parts (case/drawer/cover/footrail/
// rail) shrank with the case and keep their center-relative Z; SHARED hardware
// (QuickLock, faceplate, handle, stopper, magnet clip, feet, wall bracket/screw)
// is placed against a case face, so its Z shifts ±dz. Wall mount is back-aligned
// (case back meets the bracket) → the bracket + screws shift forward by dz.
// DERIVED, no 165 ground-truth assembly (185 was calibrated against the TableTop
// Assembly Example): QuickLock / stopper / feet / under-table-screw Z. Verify by
// eye against a printed 165 build, same as the non-1H drawers.
const COLL = {
  185: { depth: 185, railDepth: 201 },
  165: { depth: 165, railDepth: 179 },
  // 2026-07-10: the four remaining lengths (cases/drawers/covers landed in the
  // library). railDepth absent = no under-table rail GLBs yet → UT builds error.
  // ALL hardware Z for these lengths is DERIVED from the 185 calibration via
  // ±dz (same rule that produced the 165) — verify against printed builds.
  // 59: noTabletop mirrors the planner's mountBlocksLength — the mini collection
  // has NO foot rails and NO feet slots (too shallow to be stable), so it only
  // ships as a hanging mount; maxW/maxHH mirror its catalog (1W/2W × 05H/1H).
  // classicDepth: the Classic Drawer's overall depth (body + integrated pull
  // lip). It's case depth + 10 everywhere except 59/115, whose exports run
  // 0.11 shy (parts_index.csv ground truth) — generateManifest defaults the
  // rest to depth + 10.
  59:  { depth: 59, noTabletop: true, maxW: 2, maxHH: 2, classicDepth: 68.89 },
  115: { depth: 115, classicDepth: 124.89 },
  240: { depth: 240 },
  270: { depth: 270 },
};

// Wall mount — CALIBRATED 2026-07-05 from Joey's case-to-bracket reference
// (see GEN2-Part-Orientation-Notes.md "Case → bracket attachment"). Values in
// viewer/glTF axes; cases centered at Z=0 (back at ~-92.5), Z- = toward wall.
const WALL = {
  bracketH: 56,           // bracket is 1H tall
  bracketZ: -89.45,       // bracket depth-center: back at the wall, nests ~6.5 into the case back
  screwDX: 24,            // 2 screws per 1W column, at ±24 from column center
  screwZ: -101.65,        // screw depth-center (head ~-85.8 at the case back, tip into the wall)
  pegBelowTop: 18.1,      // peg height = flatTop − 18.1  (≈ top-case base + 37.9); screws sit 3 mm lower to align with the bracket holes
  approach: 20,           // top-row hang phase 1: slide −Z toward the wall
  drop: 16,               // top-row hang phase 2: drop −Y onto the pegs (trap depth)
  lowerFwd: DEPTH + 40,   // lower rows appear a full case-depth (+40) in front, then slide straight back (no drop) — reads as a clear slide-in
  benchFwd: 200,          // top rows assemble (case+cover) this far forward, clear of the wall
  coverSlide: 60,         // cover slides onto the case back-to-front at the bench
};

// Under-table rails — CALIBRATED 2026-07-06 from Joey's case-to-rail example
// (Blender Files\Training Examples\GEN2 Under-Table Rails - case to rail
// example.blend, headless extraction; see GEN2-Part-Orientation-Notes.md
// "Under-Table Rails"). The rail screws flat to the underside of a surface and
// becomes the stationary part; the top row's case tops then slide front→back
// into its downward-facing channels. The rail is FRONT-ALIGNED with the case
// (201 vs 185 deep — the extra 16 mm runs past the case back) and its channels
// swallow the case's 3 mm-proud top plus 2 mm: rail bottom = flat-top − 2.
const UT = {
  railH: 8.9,             // rail plate + channel height
  // railZ / screwFrontZ / screwBackZ are now derived PER COLLECTION in
  // generateManifest (railZ, utScrewFrontZ, utScrewBackZ) so the shorter 165
  // rail front-aligns correctly; these 185 values are kept only as documentation.
  railZ: -8.0,            // rail depth-center vs the case column center (front-aligned) — 185; see local railZ
  railBottom: -2.0,       // rail bottom = flatTopY − 2 (channels nest over the case top)
  surface: 6.9,           // table underside = rail top = flatTopY + 6.9
  screwY: 19.775,         // screw CENTER height above flatTopY (head 3 mm inside the rail plate, tip 28.75 into the wood)
  screwFrontZ: 77.07,     // 185 front screw row (z ≈ +80.5 − 3.43 radial offset the pitched GLB carries) — see local utScrewFrontZ
  screwBackZ: -75.93,     // 185 back screw row (z ≈ −72.5 − 3.43) — see local utScrewBackZ
  screwInset: 5,          // outer screws 5 mm in from each rail end + one at every 88 mm seam → 2(W+1) per tile = planner railScrews(w)
  fwd: DEPTH + 40,        // cases slide in from a full case-depth out front (same read as the wall's lowerFwd)
};

const H_LABEL = { 1: '05', 2: '1', 3: '15', 4: '2', 6: '3' };

// Shared-hardware pages (same for every collection). Per-length pages live in
// LINKS_BY_LEN below. All URLs mirror the planner's verified LINK_OVERRIDES
// (gen2-planner-main/js/data.js is the source of truth — update both together).
const LINKS = {
  hw:    { p: 'https://www.printables.com/model/1012796-gen2-hardware', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Hardware-1141439' },
  fp:    { p: 'https://www.printables.com/model/964559-gen2-decor-faceplates-essential-series', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20-%20Faceplates%20-%20Essential%20Series-1116946' },
  fpe:   { p: 'https://www.printables.com/model/1093933-gen2-decor-faceplates-edgelabel-series', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20-%20Faceplate%20-%20EdgeLabel-1215609' },
  h:     { p: 'https://www.printables.com/model/1044972-gen2-decor-handles-deco-series', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20Handles%20-%20Deco%20Series-1159960' },
  hb:    { p: 'https://www.printables.com/model/965604-gen2-decor-handles-blockbar-series', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20-%20Handles%20-%20BlockBar-1116949' },
  // fallbacks when a length has no page of its own yet
  kit:   { p: 'https://www.printables.com/model/1118906-gen2-table-top-kit-v2-185-standard', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Table%20Top%20Kit%20V2%20-%20185-1231757' },
  wall:  { p: 'https://www.printables.com/model/1777719-gen2-wall-mount-brackets', t: 'https://than.gs/m/1574321' }, // universal brackets page (2026-07-12 — replaced the old -59 placeholder)
  rail:  { p: 'https://www.printables.com/model/1052357-gen2-rails-185-standard', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20RAILS%20-%20STANDARD-1163830' },
};

// Amazon affiliate buy links for purchased hardware (Joey's, 2026-07-12) —
// rendered as extra chips after Printables/Thangs in the BOM checklist +
// identify card (links.buy, main.js). Standard magnets suit most builds; the
// N52s hold noticeably harder (people found the standard ones weak) but can
// be too strong for small drawers. Mirrors the planner's HARDWARE_BUY.
const BUY = {
  magnets: [
    { label: '10×2 mm', url: 'https://amzn.to/4sesPKm' },
    { label: '6×2 mm', url: 'https://amzn.to/4aH1ASw' },
    { label: 'N52 10×2 strong', url: 'https://amzn.to/4q4JX3Z' },
    { label: 'N52 6×2 strong', url: 'https://amzn.to/49BZyC0' },
  ],
  woodScrews: [
    { label: 'Buy #6', url: 'https://amzn.to/4s487gc' },
    { label: 'Buy #8', url: 'https://amzn.to/4pTWDuq' },
  ],
};

// Per-length product pages (2026-07-11 refresh — every collection has its own
// cases/decor pages now, and covers + foot rails got dedicated pages instead
// of funneling to the Table Top Kit bundle).
const LINKS_BY_LEN = {
  cases: {
    59:  { p: 'https://www.printables.com/model/1658749-gen2-59-cases-all', t: 'https://than.gs/m/1535454' },
    115: { p: 'https://www.printables.com/model/1658744-gen2-115-cases-all', t: 'https://than.gs/m/1535435' },
    165: { p: 'https://www.printables.com/model/1658722-gen2-165-cases-all', t: 'https://than.gs/m/1535457' },
    185: { p: 'https://www.printables.com/model/1658700-gen2-185-cases-all', t: 'https://than.gs/m/1535455' },
    240: { p: 'https://www.printables.com/model/1658608-gen2-240-cases-all', t: 'https://than.gs/m/1535459' },
    270: { p: 'https://www.printables.com/model/1658688-gen2-270-cases-all', t: 'https://than.gs/m/1535458' },
  },
  decor: {
    59:  { p: 'https://www.printables.com/model/1070454-gen2-59-decor-drawers-all', t: 'https://than.gs/m/1481534' },
    115: { p: 'https://www.printables.com/model/1307794-gen2-115-decor-drawers-all', t: 'https://than.gs/m/1158598' },
    165: { p: 'https://www.printables.com/model/1100978-gen2-165-decor-drawers-all', t: 'https://than.gs/m/1493950' },
    185: { p: 'https://www.printables.com/model/964551-gen2-185-decor-drawers-all', t: 'https://than.gs/m/1116945' },
    240: { p: 'https://www.printables.com/model/1322479-gen2-240-decor-drawers-all', t: 'https://than.gs/m/1360074' },
    270: { p: 'https://www.printables.com/model/1062961-gen2-270-decor-drawers-all', t: 'https://than.gs/m/1171387' },
  },
  classic: { // Thangs pages mirrored from the planner 2026-07-12 (240 new; 59 has none yet)
    59:  { p: 'https://www.printables.com/model/234780-gen2-59-classic-drawers-all' },
    115: { p: 'https://www.printables.com/model/1143243-gen2-115-classic-drawers-all', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20115%20Classic%20Drawers-1069181' },
    165: { p: 'https://www.printables.com/model/625776-gen2-165-classic-drawers-all', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20165%20Classic%20Drawers-1044262' },
    185: { p: 'https://www.printables.com/model/278293-gen2-185-classic-drawers-all', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20185%20-%20Classic%20Drawers-1042322' },
    240: { p: 'https://www.printables.com/model/1324538-gen2-240-classic-drawers-all', t: 'https://than.gs/m/1360091' },
    270: { p: 'https://www.printables.com/model/1164306-gen2-270-classic-drawers-all', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Drawers%20-%20Large-1093398' },
  },
  covers: { // Thangs pages added 2026-07-12
    59:  { p: 'https://www.printables.com/model/1777881-gen2-59-cover', t: 'https://than.gs/m/1574324' },
    115: { p: 'https://www.printables.com/model/1777837-gen2-115-cover', t: 'https://than.gs/m/1574330' },
    165: { p: 'https://www.printables.com/model/1774498-gen2-165-covers', t: 'https://than.gs/m/1574320' },
    185: { p: 'https://www.printables.com/model/1777844-gen2-185-cover', t: 'https://than.gs/m/1574319' },
    240: { p: 'https://www.printables.com/model/1777846-gen2-240-cover', t: 'https://than.gs/m/1574326' },
    270: { p: 'https://www.printables.com/model/1777849-gen2-270-cover', t: 'https://than.gs/m/1574325' },
  },
  fr: { // no 59 — that collection has no foot rails. Thangs pages added 2026-07-12
    115: { p: 'https://www.printables.com/model/1777819-gen2-115-foot-rails', t: 'https://than.gs/m/1574331' },
    165: { p: 'https://www.printables.com/model/1775386-gen2-165-foot-rails', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20165%20Foot%20Rails-1574329' },
    185: { p: 'https://www.printables.com/model/1777823-gen2-185-foot-rails', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20185%20Foot%20Rails-1574328' },
    240: { p: 'https://www.printables.com/model/1777826-gen2-240-foot-rails', t: 'https://than.gs/m/1574322' },
    270: { p: 'https://www.printables.com/model/1777830-gen2-270-foot-rails', t: 'https://than.gs/m/1574327' },
  },
  kit: {
    115: { p: 'https://www.printables.com/model/1146353-gen2-table-top-kit-v2-115-medium', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Table%20Top%20Kit%20V2%20-%20115-1245167' },
    165: { p: 'https://www.printables.com/model/1124278-gen2-table-top-kit-v2-165-mini', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Table%20Top%20Kit%20V2%20-%20165-1233752' },
    185: { p: 'https://www.printables.com/model/1118906-gen2-table-top-kit-v2-185-standard', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Table%20Top%20Kit%20V2%20-%20185-1231757' },
    240: { p: 'https://www.printables.com/model/1324501-gen2-table-top-kit-v2-240', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Table%20Top%20Kit%20V2%20-%20240-1360073' },
    270: { p: 'https://www.printables.com/model/1163955-gen2-table-top-kit-v2-270-large', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Table%20Top%20Kit%20V2%20-%20270-1253780' },
  },
  // Wall mount: ONE universal brackets page serves every length (2026-07-12,
  // Joey — the 1W/2W/3W sections are shared hardware; per-length pages retired).
  // Kept per-length for shape consistency; LINKS.wall carries the same page.
  wall: {
    59:  { p: 'https://www.printables.com/model/1777719-gen2-wall-mount-brackets', t: 'https://than.gs/m/1574321' },
    115: { p: 'https://www.printables.com/model/1777719-gen2-wall-mount-brackets', t: 'https://than.gs/m/1574321' },
    165: { p: 'https://www.printables.com/model/1777719-gen2-wall-mount-brackets', t: 'https://than.gs/m/1574321' },
    185: { p: 'https://www.printables.com/model/1777719-gen2-wall-mount-brackets', t: 'https://than.gs/m/1574321' },
    240: { p: 'https://www.printables.com/model/1777719-gen2-wall-mount-brackets', t: 'https://than.gs/m/1574321' },
    270: { p: 'https://www.printables.com/model/1777719-gen2-wall-mount-brackets', t: 'https://than.gs/m/1574321' },
  },
  rail: { // all six lengths have real pages now (2026-07-12) — UT still only
          // GENERATES for 165/185 (no rail GLBs elsewhere), but the links are ready
    59:  { p: 'https://www.printables.com/model/1053797-gen2-rails-59-small', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20RAILS%20-%20SMALL-1165763' },
    115: { p: 'https://www.printables.com/model/1053795-gen2-rails-115-medium', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20RAILS%20-%20MEDIUM-1165720' },
    165: { p: 'https://www.printables.com/model/1053557-gen2-rails-165-mini', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20RAILS%20-%20165-1165793' },
    185: { p: 'https://www.printables.com/model/1052357-gen2-rails-185-standard', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20RAILS%20-%20STANDARD-1163830' },
    240: { p: 'https://www.printables.com/model/1322484-gen2-rails-240', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20RAILS%20-%20240%20Lite-1360077' },
    270: { p: 'https://www.printables.com/model/1053793-gen2-rails-270-large', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20RAILS%20-%20LARGE-1165816' },
  },
};

// Instruction colors are a K'nex-style identification palette: one distinct
// saturated hue per part TYPE so it's obvious what each piece is. Cases stay
// dark (Joey's one rule); L/R mirror pairs are single types so they already
// share a color (QuickLock, Stopper); the two-layer parts sit in a light/dark
// family (CoverL/U green, FootrailL/U blue). Users can still switch to their
// own filament colors via the identify card.
const COLORS = {
  Case: '#34373c',        // dark charcoal — kept ("black")
  Drawer: '#e8433a',      // red
  Faceplate: '#f2911f',   // orange
  Handle: '#f6cf2b',      // yellow
  CoverL: '#34a85a',      // green — lower cover
  CoverU: '#8bd14e',      // lime — upper cover
  FootrailL: '#2f7fd6',   // blue — lower rail
  FootrailU: '#45c8e0',   // cyan — upper rail
  QuickLock: '#12b5a8',   // teal (L & R share)
  Foot: '#8b5cf0',        // purple
  Stopper: '#d84fb0',     // magenta (L & R share)
  MagnetClip: '#b06a3c',  // brown
  Magnet: '#b8bcc4',      // silver
  BackCover: '#5b6ee1',   // indigo — faceplate back cover (optional)
  Accent: '#25316e',      // deep navy — EdgeLabel/Classic Pro accent panel
  Label: '#eef0f4',       // near-white — the universal swap-in label card
  Bracket: '#8792a2',     // steel — wall bracket
  Screw: '#d5dae1',       // light steel — wood screw
  Rail: '#2f7fd6',        // blue — under-table rail (footrails never coexist with it)
};

export function generateManifest(build) {
  const errors = [], warnings = [];
  if (!build || !Array.isArray(build.placed) || !build.placed.length)
    return { errors: ['This link has no build in it.'], warnings, manifest: null };
  const isWall = build.mount === 'wall';
  const isUT = build.mount === 'under-table';
  const hangs = isWall || isUT; // both hang top-down from a mounting surface
  // stoppers the user has removed (viewer options menu / per-part remove). Key
  // = "<plannerUnitId>:<localColumn>" — one key drops the L+R pair for one 1W of
  // a drawer. Shared verbatim with the planner so removals round-trip.
  const removedStoppers = new Set(build.removedStoppers || []);
  const stopperOff = (u, c) => removedStoppers.has(`${u.id}:${c - u.col}`);
  // wallStagger = one connected staggered cover across the whole top row (built
  // and hung as a unit); false = per-column cover on each top case.
  const isStaggered = isWall && !!build.wallStagger;
  if (build.mount !== 'tabletop' && !hangs)
    errors.push(`"${build.mount}" mounts aren't supported yet · tabletop, wall, and under-table builds for now.`);
  // ---- collection depth (165 vs 185) --------------------------------------
  // node names key off L; depth-referenced SHARED hardware shifts by ±dz. See
  // the COLL table comment for the geometry. coll falls back to 185 so an
  // unknown collection reports the error above without crashing the placement.
  const L = build.length;
  if (!COLL[L])
    errors.push(`The ${L} collection isn't in the 3D part library yet · 59, 115, 165, 185, 240 and 270 builds for now.`);
  else if (COLL[L].depth !== 185 && COLL[L].depth !== 165)
    warnings.push(`${L} hardware positions are scaled from the 185 calibration · double-check a printed build and report anything that sits off.`);
  const coll = COLL[L] || COLL[185];
  const depth = coll.depth;
  const dz = (185 - depth) / 2;                       // 0 for 185, 10 for 165 — each case face moves this toward center (negative for 240/270: faces move outward)
  CAM_DEPTH = Math.max(DEPTH, depth);                 // camera size floor follows the deepest dimension
  // deep collections need a longer runway than the 185-tuned constants: slide
  // offsets must clear the part's own depth or the enter starts inside the
  // final volume. 165/185 keep their calibrated values exactly.
  const slideBack = -Math.max(170, depth - 15);       // covers/FR-U/settle-from-behind reach
  const wallFwd = Math.max(WALL.lowerFwd, depth + 40);// wall lower-row slide-in reach
  // tight per-case framing for wall work: size the shot by THE CASE and its
  // hardware, never the whole build — on a wide build cam()'s totalW scaling
  // shrank the actual action to a thumbnail (Joey 2026-07-11: don't crop the
  // wall into view, get close to the small bits being inserted). The wide
  // FIT shots that bookend each step still restore full-build context.
  const caseR = (w, h) => Math.max(430, Math.hypot(w * PITCH_X, h, depth) / 2 * 3.0);
  if (isUT && COLL[L] && !coll.railDepth)
    errors.push(`Under-table rails for the ${L} collection aren't in the 3D part library yet · 165 and 185 under-table builds for now.`);
  // planner mountBlocksLength() greys 59 tabletop out, so this only fires on a
  // hand-built link — same physical reason as the planner's tooltip.
  if (!hangs && coll.noTabletop)
    errors.push(`The ${L} collection can't be table-top mounted · it has no foot rails and no feet slots (too shallow to be stable). Wall-mount builds work.`);
  // Under-table rail: front-aligned with the case front (= depth/2). The rail
  // (railDepth deep) overhangs the case back. Screw rows keep the SAME inset
  // from each rail face as the 185 calibration (DERIVED for 165). front inset
  // 15.43, back inset 32.57 (from the 201-deep 185 rail: front 92.5→77.07,
  // back −108.5→−75.93).
  const railFrontZ = depth / 2, railBackZ = depth / 2 - (coll.railDepth || 201); // fallback only pads the error path (UT without rails errors above)
  const railZ = (railFrontZ + railBackZ) / 2;         // −8 (185) / −7 (165)
  const utScrewFrontZ = railFrontZ - 15.43;           // 77.07 (185) / 67.07 (165)
  const utScrewBackZ = railBackZ + 32.57;             // −75.93 (185) / −63.93 (165)
  // Classic drawer closed Z — DERIVED 2026-07-11 from measured part geometry
  // (no assembled ground truth): the classic's back wall (same 2.6 mm wall +
  // magnet clip slot as the decor) aligns with the calibrated decor back,
  // which lands its main front wall within 0.3 mm of the decor's — same box,
  // back-aligned; the integrated pull lip runs ~18 mm proud of the case face.
  const classicZ = 5.24 + ((coll.classicDepth || depth + 10) - (depth - 5.7)) / 2; // 13.09 on 185
  // Per-length pages where they exist (LINKS_BY_LEN), shared/185 fallbacks
  // otherwise. covers/fr/classic fall back to the 185 page only for safety —
  // every supported length has its own now (fr/kit: except the 59, which
  // never generates foot rails or feet anyway).
  const links = {
    ...LINKS,
    kit:     LINKS_BY_LEN.kit[L] || LINKS.kit,
    cases:   LINKS_BY_LEN.cases[L] || LINKS_BY_LEN.cases[185],
    decor:   LINKS_BY_LEN.decor[L] || LINKS_BY_LEN.decor[185],
    classic: LINKS_BY_LEN.classic[L] || LINKS_BY_LEN.classic[185],
    covers:  LINKS_BY_LEN.covers[L] || LINKS_BY_LEN.covers[185],
    fr:      LINKS_BY_LEN.fr[L] || LINKS_BY_LEN.fr[185],
    wall:    LINKS_BY_LEN.wall[L] || LINKS.wall,
    rail:    LINKS_BY_LEN.rail[L] || LINKS.rail,
  };
  // ---- faceplate family (planner `faceStyle`, carried in share links) -----
  // essential: flat 5 mm plate + bolt-on handle. edgelabel: 24.1 mm deep 2-zone
  // plate (grip printed in — NO handle) + accent panel (not on 05H) + the
  // universal label card. Both mount their BACK FACE on the same plane (the
  // drawer front, 92.57 − dz): z-center = plane + depth/2.
  const FACE_FAMILIES = {
    essential: { key: 'essential', node: c => `Faceplate_Essential_${c}`, z: 95.07, hasHandle: true,
                 label: c => `Faceplate Essential ${c}`, extras: false, links: links.fp },
    edgelabel: { key: 'edgelabel', node: c => `Faceplate_EdgeLabel_${c}`, z: 104.62, hasHandle: false,
                 label: c => `EdgeLabel Faceplate ${c}`, extras: true, links: links.fpe }, // club family — EdgeLabel Series pages
  };
  // faceplates are SHARED hardware (same GLBs both collections, placed −dz on
  // 165 like every other front-face part) — both families serve 165 and 185
  const face = FACE_FAMILIES[build.faceStyle] || FACE_FAMILIES.essential;
  if (build.faceStyle && !FACE_FAMILIES[build.faceStyle])
    warnings.push(`Faceplates are shown in the Essential style (your "${build.faceStyle}" style isn't modeled yet).`);
  // faceplate back cover: a UNIVERSAL decor-faceplate accessory (every family
  // seats the same per-size part — the GLB family name is historical, from the
  // EdgeLabel exporter blend). Optional: fills the new open-front Decor
  // drawer's gap; off = older closed-front drawers. Shared hardware → −dz.
  const bcOn = !!build.backCover;

  // ---- normalize units to a bottom-left origin ----------------------------
  const gridBottom = build.gridH * 2; // planner y counts half-rows from the TOP
  const minCol = Math.min(...build.placed.map(u => u.x));
  const units = build.placed.map(u => ({
    ...u,
    col: u.x - minCol,                       // columns from the build's left edge
    rowIdx: gridBottom - (u.y + u.hh),       // half-rows above the frame
    topIdx: gridBottom - u.y,
  })).sort((a, b) => a.rowIdx - b.rowIdx || a.col - b.col);
  const totalW = Math.max(...units.map(u => u.col + u.w));
  const maxTop = Math.max(...units.map(u => u.topIdx));  // top edge, in half-rows
  const colCenter = c => (c + 0.5 - totalW / 2) * PITCH_X;   // center of column c
  const spanCenter = u => (u.col + u.w / 2 - totalW / 2) * PITCH_X;

  // single-case bottom row: no footrails — the case itself takes the feet
  // (rails exist to LINK cases horizontally; one case has nothing to link).
  // Feet then insert into the case's underside slots and the whole stack
  // sits 10 mm lower (no FR-L/FR-U sandwich). NB the 59 never gets here at
  // all — it has no feet slots either (noTabletop errors above).
  const bottomUnits = units.filter(u => u.rowIdx === 0);
  const caseFeet = !hangs && bottomUnits.length === 1;
  // hanging builds (wall brackets / under-table rails) have no feet/footrail
  // sandwich, so the bottom row sits at Y=0. Tabletop lifts onto footrails
  // (or feet-on-case).
  const row0 = hangs ? 0 : (caseFeet ? 7.65 : ROW0_BOTTOM);

  // handle style from the planner build (crystal not modeled yet -> Deco)
  const HANDLE_STYLES = {
    deco:     { node: 'Handle_Deco',       label: 'Deco Handle',        h: 9, d: 24, links: links.h },
    blockbar: { node: 'Handle_BlockBar_A', label: 'BlockBar Handle',    h: 9, d: 9,  links: links.hb },
  };
  const handleStyle = HANDLE_STYLES[build.handleStyle] || HANDLE_STYLES.deco;
  if (build.handleStyle && !HANDLE_STYLES[build.handleStyle])
    warnings.push(`"${build.handleStyle}" handles aren't modeled yet · showing ${handleStyle.label.replace(' Handle', '')} (swap styles by tapping a handle).`);

  // ---- per-unit validation -------------------------------------------------
  for (const u of units) {
    const H = H_LABEL[u.hh];
    if (!H) { errors.push(`A unit has an unknown height (hh=${u.hh}).`); continue; }
    if (u.w >= 3 && u.hh === 6) errors.push(`${u.w}W-3H doesn't exist (too large to print) · planner shouldn't allow this.`);
    if (coll.maxW && u.w > coll.maxW) errors.push(`${u.w}W cases don't exist in the ${L} collection (1W and 2W only).`);
    if (coll.maxHH && u.hh > coll.maxHH) errors.push(`${H}H cases don't exist in the ${L} collection (05H and 1H only).`);
    if (u.fill === 'cabinet') errors.push('Cabinet units need case-extender models that are not in the 3D library yet.');
    if (u.fill === 'shelf' && u.hh !== 2) errors.push('Shelves taller than 1H use case extenders that are not in the 3D library yet.');
  }
  // support check: tabletop stacks bottom-up (each column rests on a unit top);
  // hanging mounts go top-down (each column hangs off a unit above). Mount flips it.
  const topAt = (col, level) => units.some(v => v.topIdx === level && col >= v.col && col < v.col + v.w);
  const bottomAt = (col, level) => units.some(v => v.rowIdx === level && col >= v.col && col < v.col + v.w);
  for (const u of units) {
    if (hangs ? u.topIdx === maxTop : u.rowIdx === 0) continue; // top row hangs on brackets/rails / bottom row sits on the surface
    for (let c = u.col; c < u.col + u.w; c++)
      if (hangs ? !bottomAt(c, u.topIdx) : !topAt(c, u.rowIdx)) {
        errors.push(hangs
          ? `A unit has nothing above part of it to hang from · ${isUT ? 'under-table' : 'wall'} builds hang top-down.`
          : 'A unit is floating (nothing under part of it) · tabletop builds stack bottom-up.');
        break;
      }
  }
  // the top must be flat — every occupied column must reach the same height
  // (planner columnTops() rule; covers need it, and so do the bracket/rail courses)
  const colTop = new Map();
  for (const u of units) for (let c = u.col; c < u.col + u.w; c++)
    colTop.set(c, Math.max(colTop.get(c) || 0, u.topIdx));
  if (new Set(colTop.values()).size > 1)
    errors.push(`${isUT ? 'The rails need a flat top row against the surface' : 'The covers need a flat top'} · every column must stack to the same height. Fix the build in the planner first.`);
  // sanity cap: each unit becomes ~9 parts and its own step — beyond this the
  // instructions stop being instructions
  if (units.length > 80)
    errors.push(`This build has ${units.length} units · 3D instructions currently support up to 80. It'll still print and assemble fine; the step-by-step just isn't practical at this size yet.`);
  if (errors.length) return { errors, warnings, manifest: null };

  // ---- build instances + steps ---------------------------------------------
  const inst = [], stages = { base: [0, 110, 0] }, steps = [];
  const bom = new Map(); // node -> {label,type,qty,links,img,purchased}
  const add = (node, label, type, links, n = 1, purchased = false) => {
    if (!bom.has(node)) {
      const img = imgFor(node);
      bom.set(node, { node, label, type, qty: 0, ...(links ? { links } : {}), ...(img ? { img } : {}), ...(purchased ? { purchased } : {}) });
    }
    bom.get(node).qty += n;
  };

  // frame: rails under contiguous bottom-column runs. The two layers use the
  // planner's brickTiling() stagger (data.js) so seams never align and the
  // upper layer ties the lower sections (and the cases) together:
  //   odd ≥3 : one 1W per layer on OPPOSITE ends (upper-left / lower-right)
  //   even ≥4: upper all-2W, lower 1W-capped at both ends
  const tilesLower = n => n <= 2 ? [n] : (n % 2 ? [...Array((n - 1) / 2).fill(2), 1] : [1, ...Array((n - 2) / 2).fill(2), 1]);
  const tilesUpper = n => n <= 2 ? [n] : (n % 2 ? [1, ...Array((n - 1) / 2).fill(2)] : Array(n / 2).fill(2));
  const tileOut = (run, widths) => {
    const out = []; let c = run.c0;
    for (const w of widths) { out.push({ w, col: c, first: c === run.c0 }); c += w; }
    return out;
  };
  const bottomCols = new Set();
  units.filter(u => u.rowIdx === 0).forEach(u => { for (let c = u.col; c < u.col + u.w; c++) bottomCols.add(c); });
  const runs = [];
  for (let c = 0, run = null; c <= totalW; c++) {
    if (bottomCols.has(c)) { if (!run) runs.push(run = { c0: c, c1: c }); else run.c1 = c; }
    else run = null;
  }
  const rails = [], uppers = []; // FR-L tiles (carry the feet) / FR-U tiles (staggered)
  const railX = r => (r.col + r.w / 2 - totalW / 2) * PITCH_X;
  const frlIds = [], feetIds = { back: [], front: [] };
  const bracketIds = [], screwIds = [];       // wall only
  const utIds = [], utScrewIds = [];          // under-table only
  const flatTopY = row0 + maxTop * PITCH_HALF_Y;
  if (isUT) {
    // one rail course spans the flat top, tiled biggest-first 1–4W per contiguous
    // top-row run (same greedy fill as the planner's railSections; a bed-limited
    // printer may split differently — the parts are interchangeable widths).
    const topCols = new Set();
    units.filter(u => u.topIdx === maxTop).forEach(u => { for (let c = u.col; c < u.col + u.w; c++) topCols.add(c); });
    const topRuns = [];
    for (let c = 0, run = null; c <= totalW; c++) {
      if (topCols.has(c)) { if (!run) topRuns.push(run = { c0: c, c1: c }); else run.c1 = c; }
      else run = null;
    }
    for (const run of topRuns) for (let c = run.c0; c <= run.c1; ) {
      const w = Math.min(4, run.c1 - c + 1);
      const t = { col: c, w };
      const id = `utr${utIds.length}`;
      utIds.push(id);
      inst.push({ id, node: `UnderTableRail_${L}-${w}W`, pos: [railX(t), flatTopY + UT.railBottom, railZ] });
      add(`UnderTableRail_${L}-${w}W`, `Under-Table Rail ${L}-${w}W`, 'Rail', links.rail);
      // screws: one x-position at each rail end (inset 5) + every internal 88 mm
      // seam, × 2 depth rows (front/back) → 2(W+1) per tile = planner railScrews(w).
      // Pitched 90° about X so they stand tip-up into the surface.
      const xs = [-(44 * w - UT.screwInset)];
      for (let i = 1; i < w; i++) xs.push(-44 * w + 88 * i);
      xs.push(44 * w - UT.screwInset);
      for (const lx of xs) for (const z of [utScrewBackZ, utScrewFrontZ]) {
        const sid = `uts${utScrewIds.length}`;
        utScrewIds.push(sid);
        inst.push({ id: sid, node: 'WoodScrew', pos: [railX(t) + lx, flatTopY + UT.screwY, z], rot: [90, 0, 0] });
        add('WoodScrew', 'Wood Screw', 'Screw', { ...links.rail, buy: BUY.woodScrews }, 1, true); // purchased hardware
      }
      c += w;
    }
  } else if (isWall) {
    // one bracket course spans the flat top, tiled 1/2/3W (no 4W bracket).
    // Brackets screw to the wall; the top row of cases then hangs on the pegs.
    const bracketBaseY = flatTopY - WALL.bracketH; // base flush with the top-row case base
    const pegY = flatTopY - WALL.pegBelowTop;
    for (let c = 0; c < totalW; ) {
      const w = Math.min(3, totalW - c);
      const r = { col: c, w };
      const id = `br${bracketIds.length}`;
      bracketIds.push(id);
      inst.push({ id, node: `WallMount_Lite_${w}W`, pos: [railX(r), bracketBaseY, WALL.bracketZ + dz] });
      add(`WallMount_Lite_${w}W`, `Wall Mount Lite ${w}W`, 'Bracket', links.wall);
      c += w;
    }
    for (let c = 0; c < totalW; c++) for (const dx of [-WALL.screwDX, WALL.screwDX]) {
      const id = `sc${screwIds.length}`;
      screwIds.push(id);
      inst.push({ id, node: 'WoodScrew', pos: [colCenter(c) + dx, pegY, WALL.screwZ + dz] });
      add('WoodScrew', 'Wood Screw', 'Screw', { ...links.wall, buy: BUY.woodScrews }, 1, true); // purchased hardware
    }
  } else if (caseFeet) {
    // feet slide into the bottom case's own underside slots: 4 per 1W, running
    // LENGTHWISE (front feet snap in back->front, rear feet front->back).
    // Slot x per 1W (11.5 / 76.5 from the left edge) ESTIMATED by symmetry with
    // the rail inset; where adjacent 1W slots crowd (<30 mm), fill just one per
    // row — same dedup rule as rail junctions.
    const u0 = bottomUnits[0];
    const leftEdge = (u0.col - totalW / 2) * PITCH_X;
    const xs = [];
    for (let i = 0; i < u0.w; i++) xs.push(leftEdge + i * PITCH_X + 11.5, leftEdge + i * PITCH_X + 76.5);
    const slots = [];
    for (const x of xs) if (!slots.length || x - slots[slots.length - 1] >= 30) slots.push(x);
    for (const x of slots) for (const z of [-73 + dz, 81.15 - dz]) {
      const id2 = `f${inst.length}`;
      feetIds[z < 0 ? 'back' : 'front'].push(id2);
      inst.push({ id: id2, node: 'Tabletop-Kit-Foot', pos: [x, 0, z], yaw: z < 0 ? 90 : 270, stage: 'base' });
      add('Tabletop-Kit-Foot', 'Tabletop Kit Foot', 'Foot', links.kit);
    }
  } else {
    for (const r of runs) {
      const n = r.c1 - r.c0 + 1;
      rails.push(...tileOut(r, tilesLower(n)));
      uppers.push(...tileOut(r, tilesUpper(n)));
    }
    uppers.forEach(r => add(`FR-U_${L}-${r.w}W`, `Footrail Upper ${L}-${r.w}W`, 'FootrailU', links.fr));
    rails.forEach((r, i) => {
      const id = `frl${i}`;
      frlIds.push(id);
      inst.push({ id, node: `FR-L_${L}-${r.w}W`, pos: [railX(r), FRL_Y, 0], stage: 'base' });
      add(`FR-L_${L}-${r.w}W`, `Footrail Lower ${L}-${r.w}W`, 'FootrailL', links.fr);
      // foot slots: 2W local x ±76.48 / −0.18, 1W local ±32.5 (DERIVED by symmetry).
      // Junction rule (Joey): where rails meet, install feet on one rail only —
      // a rail with a left neighbor in the same run skips its left slot pair.
      let slots = r.w === 2 ? [-76.48, -0.18, 76.65] : [-32.5, 32.5];
      if (!r.first) slots = slots.slice(1);
      for (const lx of slots) {
        const yaw = (r.first && lx === slots[0]) ? 180 : 0; // outer-left feet point left
        for (const z of [-73 + dz, 81.15 - dz]) {
          const id2 = `f${inst.length}`;
          feetIds[z < 0 ? 'back' : 'front'].push(id2);
          inst.push({ id: id2, node: 'Tabletop-Kit-Foot', pos: [railX(r) + lx, 0, z], yaw, stage: 'base' });
          add('Tabletop-Kit-Foot', 'Tabletop Kit Foot', 'Foot', links.kit);
        }
      }
    });
  }

  // cases + per-case hardware
  let firstClipDemo = null, firstDrawerDemo = null;
  const baseCaseSteps = []; // bench cases (feet-on-case rows) slot into the bench flow before the feet
  // wall steps play top-down (reversed), so the first top case SHOWN is the last
  // one generated — that's the one that gets the ghost+zoom peg demo.
  const ghostTopIdx = units.reduce((acc, v, idx) => v.topIdx === maxTop ? idx : acc, -1);
  const clIds = [], cuIds = [];         // cover ids (wall: filled per top case; tabletop: in the cover section)
  const caseSteps = [];
  // staggered wall: the top row is assembled and hung as ONE unit — collect the
  // per-case bench placements + members here; the cover + hang are built after.
  const topPlacements = [], topMembers = [];
  const stagHang = { title: 'Hang the top row on the pegs', _stoppers: [], phases: [] };
  let stagCoverStep = null;
  units.forEach((u, i) => {
    const H = H_LABEL[u.hh];
    const caseNode = `${L}-${u.w}W-${H}H_Case`;
    const bottom = row0 + u.rowIdx * PITCH_HALF_Y;
    const caseH = u.hh * PITCH_HALF_Y + 3;
    const cx = spanCenter(u);
    const left = cx - u.w * PITCH_X / 2, right = cx + u.w * PITCH_X / 2;
    const isBase = caseFeet && u.rowIdx === 0; // shares the bench stage with its feet
    const isTop = u.topIdx === maxTop;
    // Stages: tabletop non-base cases settle from behind. Wall TOP cases stage
    // at a forward bench (so the cover can be attached, and the two steps —
    // assemble, then hang — each end at a deterministic state). Wall lower rows
    // and ALL under-table cases have no stage (they slide straight in via
    // enter+move). Staggered top cases share one bench stage ('wtop') so the
    // whole row hangs together; per-column top cases each get their own.
    const st = hangs ? (isWall && isTop ? (isStaggered ? 'wtop' : `w${i}`) : null) : (isBase ? 'base' : `c${i}`);
    if (st && !isBase) stages[st] = isWall ? [0, WALL.drop, WALL.benchFwd] : [0, 0, slideBack];
    const stg = st ? { stage: st } : {};
    inst.push({ id: `case${i}`, node: caseNode, pos: [cx, bottom, 0], ...stg });
    add(caseNode, `Case ${L}-${u.w}W-${H}H`, 'Case', links.cases);
    // QuickLocks: one handed pair per case, outer walls, near the top.
    // y = caseBottom + caseH − 23.32 (DERIVED from 1H ground truth 35.68).
    const qy = bottom + caseH - 23.32;
    inst.push({ id: `ql${i}L`, node: 'QuickLock-L', pos: [left + 3.88, qy, 65.02 - dz], ...stg });
    inst.push({ id: `ql${i}R`, node: 'QuickLock-R', pos: [right - 3.45, qy, 65.02 - dz], ...stg });
    add('QuickLock-L', 'QuickLock L', 'QuickLock', links.hw);
    add('QuickLock-R', 'QuickLock R', 'QuickLock', links.hw);

    const isDrawer = u.fill === 'decor' || u.fill === 'classic';
    const hasMagnet = isDrawer && u.closure === 'magnet'; // planner "Drawer close = Magnets"
    const members = [`case${i}`, `ql${i}L`, `ql${i}R`]; // move together during a wall hang
    const clipText = 'Magnet closure: snap the clip into the back-wall slot (magnet pressed in back-to-front, clip lowered) · unreachable after assembly, so now is the time.';
    let mcId, mgId;
    if (hasMagnet) {
      // magnet clip in the case back: one per drawer bay, LEFT slot on 2W,
      // center on 3W, left-center on 4W (Joey's rule). TUNED y/z for 1H,
      // DERIVED for other heights (clip rides the wall top).
      const slotCol = u.w <= 2 ? 0 : 1;
      const mx = colCenter(u.col + slotCol);
      const mcy = bottom + caseH - 23.2;
      mcId = `mc${i}`; mgId = `mg${i}`;
      inst.push({ id: mcId, node: 'MagnetClip_10x2mm', pos: [mx, mcy, -85.7 + dz], owner: u.id, ...stg });
      inst.push({ id: mgId, node: 'Magnet_10x2mm', pos: [mx, mcy + 4.2, -86 + dz], owner: u.id, ...stg });
      add('MagnetClip_10x2mm', 'Magnet Clip 10×2', 'MagnetClip', links.hw, 2);
      add('Magnet_10x2mm', 'Magnet 10×2 mm', 'Magnet', { buy: BUY.magnets }, 2, true);
      members.push(mcId, mgId);
    }
    const step = {
      title: isBase ? `Bench: bottom case · ${u.w}W-${H}H` : `Case ${i + 1} · ${u.w}W-${H}H`,
      note: null,
      // wall lower rows — and every under-table case — are viewed from a
      // 3/4-below angle so you can watch them slide in under the surface/row
      // above; everything else is the standard preset. Wall shots frame THE
      // CASE (caseR), not the whole build.
      camera: isBase ? cam(cx, 125, totalW, gridBottom)
        : isUT ? camUp(cx, bottom + caseH / 2, totalW, gridBottom)
        : isWall && !isTop ? { ...camUp(cx, bottom + caseH / 2, totalW, gridBottom), r: caseR(u.w, caseH) }
        : cam(cx, bottom + caseH / 2, totalW, gridBottom),
      _stoppers: [], // stoppers hosted by THIS case's floor (filled below)
    };
    if (isWall && isTop && isStaggered) {
      // Staggered: each top case is just LINED UP on the shared bench here; the
      // one connected cover + the hang come after the whole row is placed.
      const benchCam = { ...cam(0, flatTopY - 10, totalW, gridBottom), target: [0, flatTopY - 10, WALL.benchFwd] };
      const n = topPlacements.length + 1;
      topPlacements.push({
        title: `Top case ${n} · ${u.w}W-${H}H`,
        note: 'On the bench, line this top case up with the rest of the top row: QuickLocks into the outer wall slots (L left, R right)'
          + (mcId ? ', magnet clip into the back slot' : '') + '. The cover slides on across the whole row next.',
        camera: benchCam,
        phases: [
          { enter: [{ id: `case${i}`, from: [0, 45, 0] }] },
          { enter: [{ id: `ql${i}L`, from: [0, 45, 0] }, { id: `ql${i}R`, from: [0, 45, 0] }] },
          ...(mcId ? [{ enter: [{ id: mcId, from: [0, 35, 0] }, { id: mgId, from: [0, 0, -30] }] }] : []),
        ],
      });
      topMembers.push(...members);
      caseSteps.push(stagHang); // floor stoppers (row below) drop in after the whole row hangs
      if (mcId && firstClipDemo === null) firstClipDemo = i;
      return;
    }
    if (isWall && isTop) {
      // Top cases carry their own cover, attached at a forward bench (staged)
      // BEFORE the case meets the wall — covers slide on back-to-front, so they
      // can't go on once the case is against the wall. The drawer stoppers drop
      // into the Cover LOWER before the Cover UPPER caps them (otherwise the CU
      // would clip them). Then the whole assembly hangs onto the pegs and drops.
      const run = { c0: u.col, c1: u.col + u.w - 1 };
      const clLocal = [], cuLocal = [];
      for (const t of tileOut(run, tilesLower(u.w))) {
        const id = `cl${clIds.length}`; clIds.push(id); clLocal.push(id);
        inst.push({ id, node: `CL-${L}-${t.w}W`, pos: [railX(t), flatTopY, 0], ...stg });
        add(`CL-${L}-${t.w}W`, `Cover Lower ${L}-${t.w}W`, 'CoverL', links.covers);
      }
      for (const t of tileOut(run, tilesUpper(u.w))) {
        const id = `cu${cuIds.length}`; cuIds.push(id); cuLocal.push(id);
        inst.push({ id, node: `CU-${L}-${t.w}W`, pos: [railX(t), flatTopY + 4.3, 0], ...stg });
        add(`CU-${L}-${t.w}W`, `Cover Upper ${L}-${t.w}W`, 'CoverU', links.covers);
      }
      const coverIds = [...clLocal, ...cuLocal];
      // a top-row drawer's own stoppers go into its CL (handled here, so the
      // generic stopper loop skips top-row drawers)
      const stopIds = [];
      if (isDrawer) for (let c = u.col; c < u.col + u.w; c++) {
        if (stopperOff(u, c)) continue; // user removed this 1W's stopper pair
        const lx = colCenter(c), idL = `tst${i}c${c}L`, idR = `tst${i}c${c}R`, sk = `${u.id}:${c - u.col}`;
        inst.push({ id: idL, node: 'Drawer_Stoppers_L', pos: [lx - 12.6, flatTopY - 2, 76.5 - dz], stopperKey: sk, ...stg });
        inst.push({ id: idR, node: 'Drawer_Stoppers_R', pos: [lx + 12.4, flatTopY - 2, 76.5 - dz], stopperKey: sk, ...stg });
        add('Drawer_Stoppers_L', 'Drawer Stopper L', 'Stopper', links.hw);
        add('Drawer_Stoppers_R', 'Drawer Stopper R', 'Stopper', links.hw);
        stopIds.push(idL, idR);
      }
      members.push(...coverIds, ...stopIds); // all ride the hang together

      // bench assembly, in physical order (CL → stoppers → CU)
      const bench = [
        { enter: [{ id: `case${i}`, from: [0, 45, 0] }] },
        { enter: [{ id: `ql${i}L`, from: [0, 45, 0] }, { id: `ql${i}R`, from: [0, 45, 0] }] },
      ];
      if (mcId) bench.push({ enter: [{ id: mcId, from: [0, 35, 0] }, { id: mgId, from: [0, 0, -30] }] });
      bench.push({ enter: clLocal.map(id => ({ id, from: [0, 0, -WALL.coverSlide] })) });
      if (stopIds.length) bench.push({ enter: stopIds.map(id => ({ id, from: [0, 35, 0] })) });
      bench.push({ enter: cuLocal.map(id => ({ id, from: [0, 0, -WALL.coverSlide] })) });

      const back = { move: members.map(id => ({ id, by: [0, 0, -WALL.benchFwd] })) }; // bench → wall (pegs enter the back slots)
      const drop = { move: members.map(id => ({ id, by: [0, -WALL.drop, 0] })) };     // drop onto the pegs
      const land = { land: st };
      const base = cam(cx, bottom + caseH / 2, totalW, gridBottom, FIT); // frames the hung (final) build
      // the bench assembly sits WALL.benchFwd toward the camera — frame THAT
      // case up close (caseR), not the whole build
      const benchCam = { t: 30, p: 58, r: caseR(u.w, caseH), target: [cx, bottom + caseH / 2 + WALL.drop, WALL.benchFwd] };
      const benchNote = 'On the bench, before it goes near the wall: QuickLocks in, slide the Cover Lower on'
        + (isDrawer ? ', drop the drawer stoppers into it,' : ',') + ' then cap it with the Cover Upper · the cover can only slide on now, not once the case is on the wall.'
        + (mcId && firstClipDemo === null ? ' ' + clipText : '');

      if (i === ghostTopIdx) {
        // the first top case shown is split into two steps (there's a lot going
        // on), and its hang ghosts the cover + zooms to reveal the pegs.
        const pegCam = { t: 24, p: 40, r: Math.max(380, caseR(u.w, caseH) * 0.7), target: [cx, flatTopY - 18, -30] };
        const assembleStep = { title: `Cover the top case · ${u.w}W-${H}H`, note: benchNote, camera: benchCam, phases: bench };
        const hangStep = {
          title: 'Hang the top case on the pegs',
          note: 'Now hang the covered case: push it straight back so the bracket pegs enter the case-back slots, then drop it 16 mm to lock. (The cover is ghosted so you can see the pegs.)',
          camera: benchCam, _stoppers: [], // arrive framing the bench, then zoom to the pegs
          phases: [{ camera: pegCam, ghost: coverIds.map(id => ({ id })) }, back, drop, { camera: base, solid: coverIds.map(id => ({ id })) }, land],
        };
        // wall steps are reversed for top-down order, so push hang→assemble to
        // land assemble→hang in the final sequence.
        steps.push(hangStep, assembleStep);
        caseSteps.push(hangStep); // one caseSteps entry per unit; floor stoppers (row below) merge into the hang
        if (mcId && firstClipDemo === null) firstClipDemo = i;
        return;
      }
      step.title = `Hang the covered top case · ${u.w}W-${H}H`;
      step.camera = benchCam;                        // start framing the bench…
      step.phases = [...bench, { camera: base, move: back.move }, drop, land]; // …pan to the wall as it hangs
      step.note = benchNote + ' Then hang it: push it straight back onto the pegs and drop 16 mm to lock.';
      if (mcId && firstClipDemo === null) firstClipDemo = i;
    } else if (isUT) {
      // under-table: EVERY case slides straight back from out front, one piece —
      // the top row's case tops ride into the rail channels; lower rows hang
      // under the row above (front→back, then the QuickLocks click).
      step.title = isTop ? `Slide the case into the rails · ${u.w}W-${H}H` : `Hang case · ${u.w}W-${H}H`;
      if (i === ghostTopIdx) {
        // the first case shown assembles out front (QuickLocks, clip) before it
        // slides home — enter `at` the forward offset; the move cancels it, so
        // prev/jump's computed after-state stays true. The camera rises to an
        // overhead 3/4 for the QuickLock install (looking down into the open
        // case so BOTH outer-wall slots are visible on any size, 1W-05H..4W-2H;
        // r scales with the case width), then glides back to the below view in
        // its own phase BEFORE the slide-in starts.
        const above = { t: 26, p: 36, r: Math.max(430, u.w * PITCH_X * 2.4), target: [cx, bottom + caseH / 2, UT.fwd] };
        step.phases = [
          { enter: [{ id: `case${i}`, at: [0, 0, UT.fwd], from: [0, 0, 60] }] },
          { camera: above },                                   // rise above the bench
          { enter: [{ id: `ql${i}L`, at: [0, 0, UT.fwd], from: [0, 45, 0] }, { id: `ql${i}R`, at: [0, 0, UT.fwd], from: [0, 45, 0] }] },
          ...(mcId ? [{ enter: [{ id: mcId, at: [0, 0, UT.fwd], from: [0, 30, 0] }, { id: mgId, at: [0, 0, UT.fwd], from: [0, 0, -30] }] }] : []),
          { camera: camUp(cx, bottom + caseH / 2, totalW, gridBottom) }, // back below before the slide
          { move: members.map(id => ({ id, by: [0, 0, -UT.fwd] })) },
        ];
        step.note = 'Fit the QuickLocks first (L left, R right)' + (mcId ? ', snap in the magnet clip,' : ',')
          + ' then slide the case straight back under the surface · its top rails ride into the rail channels until it stops.';
      } else {
        // pre-assembled one-piece slide-in, same read as wall lower rows
        step.phases = [{ sync: true, enter: members.map(id => ({ id, from: [0, 0, UT.fwd] })) }];
        step.note = isTop
          ? 'QuickLocks in, then slide the case straight back · its top rails ride into the rail channels until it stops.'
          : 'Slide the case straight back under the row above · its top rails engage the case above and the QuickLocks click home.';
      }
      if (isTop && isDrawer) step.note += ' (No drawer stoppers needed up here · the rail has them built in.)';
      if (mcId && firstClipDemo === null) { firstClipDemo = i; if (i !== ghostTopIdx) step.note += ' ' + clipText; }
    } else if (isWall) {
      // lower rows: the assembled case (with quicklocks + clip) slides straight
      // back from ~40 mm in front — no drop, so it can't clip the case above.
      step.title = `Hang case · ${u.w}W-${H}H`;
      // sync: the case + its QuickLocks (+ clip) slide in together as one piece,
      // not staggered (they're pre-assembled, not arriving separately).
      step.phases = [{ sync: true, enter: members.map(id => ({ id, from: [0, 0, wallFwd] })) }];
      step.note = 'Slide the case straight back toward the wall from just in front · its top rails engage the case above and the QuickLocks click home.';
      if (mcId && firstClipDemo === null) { firstClipDemo = i; step.note += ' ' + clipText; }
    } else {
      // tabletop: case + quicklocks drop in on the bench, then settle from behind
      step.phases = [
        { enter: [{ id: `case${i}`, from: [0, 60, 0] }] },
        { enter: [{ id: `ql${i}L`, from: [0, 55, 0] }, { id: `ql${i}R`, from: [0, 55, 0] }] },
      ];
      if (isBase) step.note = 'A single bottom case needs no footrails · it takes the feet directly. Start at the bench: QuickLocks into the outer wall slots, L left, R right.';
      if (mcId && firstClipDemo === null) {
        firstClipDemo = i;
        step.phases.push(
          { enter: [{ id: mcId, at: [0, 35, 0], from: [0, 30, 0] }] },
          { enter: [{ id: mgId, at: [0, 35, 0], from: [0, 0, -30] }] },
          { move: [{ id: mcId, by: [0, -35, 0] }, { id: mgId, by: [0, -35, 0] }] },
        );
        step.note = isBase
          ? step.note + ' ' + clipText
          : `QuickLocks go in the outer wall slots: L left, R right. ${clipText} Then slide the case on from the back until it clicks.`;
      } else if (mcId) {
        step.phases.push({ fade: [{ id: mcId }, { id: mgId }] });
      }
    }
    if (hangs) steps.push(step);
    else if (!isBase) { step.phases.push({ settle: st }); steps.push(step); }
    else baseCaseSteps.push(step); // slots into the bench flow before the feet
    caseSteps.push(step);
  });

  // staggered wall: one connected cover across the whole top row, then hang the
  // whole row as a unit (all top cases + cover + stoppers share the 'wtop' stage)
  if (isStaggered && topPlacements.length) {
    const run = { c0: 0, c1: totalW - 1 };
    const clLocal = [], cuLocal = [], stopIds = [];
    for (const t of tileOut(run, tilesLower(totalW))) {
      const id = `cl${clIds.length}`; clIds.push(id); clLocal.push(id);
      inst.push({ id, node: `CL-${L}-${t.w}W`, pos: [railX(t), flatTopY, 0], stage: 'wtop' });
      add(`CL-${L}-${t.w}W`, `Cover Lower ${L}-${t.w}W`, 'CoverL', links.covers);
    }
    for (const t of tileOut(run, tilesUpper(totalW))) {
      const id = `cu${cuIds.length}`; cuIds.push(id); cuLocal.push(id);
      inst.push({ id, node: `CU-${L}-${t.w}W`, pos: [railX(t), flatTopY + 4.3, 0], stage: 'wtop' });
      add(`CU-${L}-${t.w}W`, `Cover Upper ${L}-${t.w}W`, 'CoverU', links.covers);
    }
    // stoppers into the CL for each top-row drawer column (before the CU caps them)
    units.filter(u => u.topIdx === maxTop && (u.fill === 'decor' || u.fill === 'classic')).forEach(u => {
      for (let c = u.col; c < u.col + u.w; c++) {
        if (stopperOff(u, c)) continue; // user removed this 1W's stopper pair
        const lx = colCenter(c), idL = `tst${c}L`, idR = `tst${c}R`, sk = `${u.id}:${c - u.col}`;
        inst.push({ id: idL, node: 'Drawer_Stoppers_L', pos: [lx - 12.6, flatTopY - 2, 76.5 - dz], stopperKey: sk, stage: 'wtop' });
        inst.push({ id: idR, node: 'Drawer_Stoppers_R', pos: [lx + 12.4, flatTopY - 2, 76.5 - dz], stopperKey: sk, stage: 'wtop' });
        add('Drawer_Stoppers_L', 'Drawer Stopper L', 'Stopper', links.hw);
        add('Drawer_Stoppers_R', 'Drawer Stopper R', 'Stopper', links.hw);
        stopIds.push(idL, idR);
      }
    });
    const coverIds = [...clLocal, ...cuLocal];
    const allMembers = [...topMembers, ...coverIds, ...stopIds];
    const benchCam = { ...cam(0, flatTopY - 10, totalW, gridBottom), target: [0, flatTopY - 10, WALL.benchFwd] };
    stagCoverStep = {
      title: 'Cover the top row',
      note: 'Slide the staggered Cover Lower across the whole top row'
        + (stopIds.length ? ', drop the drawer stoppers into it,' : ',') + ' then cap it with the staggered Cover Upper · the offset seams tie all the top cases together before it goes on the wall.',
      camera: benchCam,
      phases: [
        { enter: clLocal.map(id => ({ id, from: [0, 0, -WALL.coverSlide] })) },
        ...(stopIds.length ? [{ enter: stopIds.map(id => ({ id, from: [0, 35, 0] })) }] : []),
        { enter: cuLocal.map(id => ({ id, from: [0, 0, -WALL.coverSlide] })) },
      ],
    };
    const base = cam(0, flatTopY - 30, totalW, gridBottom, FIT);
    const pegCam = { t: 24, p: 40, r: base.r * 0.62, target: [0, flatTopY - 18, -30] };
    stagHang.camera = benchCam;
    stagHang.note = 'Now hang the whole top row: push it straight back so the bracket pegs enter the case-back slots, then drop it 16 mm to lock. (The cover is ghosted so you can see the pegs.)';
    stagHang.phases = [
      { camera: pegCam, ghost: coverIds.map(id => ({ id })) },
      { move: allMembers.map(id => ({ id, by: [0, 0, -WALL.benchFwd] })) },
      { move: allMembers.map(id => ({ id, by: [0, -WALL.drop, 0] })) },
      { camera: base, solid: coverIds.map(id => ({ id })) },
      { land: 'wtop' },
    ];
  }

  // stoppers: protect each drawer bay from the surface above (case floor or CL)
  // bottom = covering surface bottom − 2 = 17.65 + topIdx·28 − 2 (identical
  // whether the cover is a case or the CL — the 2 mm tab hang is the same).
  let stopN = 0;
  const coverStoppers = [];
  units.forEach(u => {
    if (u.fill !== 'decor' && u.fill !== 'classic') return;
    // wall top-row drawers' stoppers are handled inline (into their CL, before
    // the CU); under-table top-row drawers need none at all — the rail has
    // stoppers built in (planner note).
    if (hangs && u.topIdx === maxTop) return;
    const sy = row0 + u.topIdx * PITCH_HALF_Y - 2;
    for (let c = u.col; c < u.col + u.w; c++) {
      if (stopperOff(u, c)) continue; // user removed this 1W's stopper pair
      const lx = colCenter(c);
      const idL = `st${stopN}L`, idR = `st${stopN}R`, sk = `${u.id}:${c - u.col}`;
      stopN++;
      inst.push({ id: idL, node: 'Drawer_Stoppers_L', pos: [lx - 12.6, sy, 76.5 - dz], stopperKey: sk });
      inst.push({ id: idR, node: 'Drawer_Stoppers_R', pos: [lx + 12.4, sy, 76.5 - dz], stopperKey: sk });
      add('Drawer_Stoppers_L', 'Drawer Stopper L', 'Stopper', links.hw);
      add('Drawer_Stoppers_R', 'Drawer Stopper R', 'Stopper', links.hw);
      const host = units.findIndex(v => v.rowIdx === u.topIdx && c >= v.col && c < v.col + v.w);
      const entry = { enter: [{ id: idL, from: [0, 55, 0] }, { id: idR, from: [0, 55, 0] }] };
      // a drawer's stoppers drop into the floor of the case above it (that case's
      // step). Tabletop top-row drawers have no case above — their stoppers go
      // into the covers (a later step, coverStoppers).
      if (host >= 0) caseSteps[host]._stoppers.push(entry);
      else coverStoppers.push(entry);
    }
  });
  // unique — a staggered top row's cases all point their floor stoppers at the
  // single shared hang step, so the same object appears in caseSteps repeatedly.
  [...new Set(caseSteps)].forEach(s => {
    if (s._stoppers.length) {
      const merged = { enter: s._stoppers.flatMap(e => e.enter) };
      s.phases.push(merged);
      s.note = (s.note || 'QuickLocks in, slide the case on from the back until it clicks.') +
        ' Then drop the drawer stoppers into its floor slots · they stop the drawer BELOW from being pulled all the way out (optional).';
    } else if (!s.note) {
      s.note = 'QuickLocks in (L left, R right), then slide the case on from the back until it clicks.';
    }
    delete s._stoppers;
  });

  // covers: contiguous column runs sharing the same exposed top height. On WALL
  // builds the covers were already generated per top case (they must attach
  // before the case hangs); under-table builds have NO covers (the rail course
  // is the top) — so this whole section is tabletop-only.
  const topOf = c => Math.max(0, ...units.filter(v => c >= v.col && c < v.col + v.w).map(v => v.topIdx));
  const coverRuns = [];
  for (let c = 0, run = null; !hangs && c < totalW; c++) {
    const t = bottomCols.size ? topOf(c) : 0;
    const occupied = units.some(v => c >= v.col && c < v.col + v.w);
    if (occupied && run && run.top === t && run.c1 === c - 1) run.c1 = c;
    else if (occupied) coverRuns.push(run = { c0: c, c1: c, top: t });
    else run = null;
  }
  coverRuns.forEach(r => {
    const n = r.c1 - r.c0 + 1;
    const clY = row0 + r.top * PITCH_HALF_Y;
    // CL/CU brick-stagger like the rails: seams offset so the CU ties the CLs
    // (and the cases under them) together — planner brickTiling() rule.
    for (const t of tileOut(r, tilesLower(n))) {
      const i = clIds.length;
      inst.push({ id: `cl${i}`, node: `CL-${L}-${t.w}W`, pos: [railX(t), clY, 0] });
      clIds.push(`cl${i}`);
      add(`CL-${L}-${t.w}W`, `Cover Lower ${L}-${t.w}W`, 'CoverL', links.covers);
    }
    for (const t of tileOut(r, tilesUpper(n))) {
      const i = cuIds.length;
      inst.push({ id: `cu${i}`, node: `CU-${L}-${t.w}W`, pos: [railX(t), clY + 4.3, 0] });
      cuIds.push(`cu${i}`);
      add(`CU-${L}-${t.w}W`, `Cover Upper ${L}-${t.w}W`, 'CoverU', links.covers);
    }
  });

  // drawers + faceplates + handles (decor gets a plate + dressing; the classic
  // prints its front + pull lip into the body — drawer instance only)
  const drawerPhases = [], drawerFades = [], fpDemo = [], fpFades = [];
  // overall build height (also used by the step-list cameras below) + the
  // faceplate step's own camera — hoisted so the EdgeLabel cinematic's final
  // phase can glide back to exactly this preset
  const H_MM = row0 + maxTop * PITCH_HALF_Y + 10;
  const fpStepCam = { ...cam(0, H_MM * 0.5, totalW, gridBottom, FIT), t: 15, p: isUT ? 99 : 66 };
  // demo owners: the first drawer of EITHER fill runs the pop-in (+ clip/magnet)
  // demo in the Drawers step; the faceplate cinematic keys off the first DECOR
  // drawer separately, so a classic-first build doesn't lose it.
  let classicCount = 0, firstFpDemo = null;
  units.forEach((u, i) => {
    if (u.fill !== 'decor' && u.fill !== 'classic') return;
    const isClassic = u.fill === 'classic';
    if (isClassic) classicCount += 1;
    const H = H_LABEL[u.hh];
    const bottom = row0 + u.rowIdx * PITCH_HALF_Y;
    const cx = spanCenter(u);
    const drwH = u.hh * PITCH_HALF_Y - 6;
    const fpH = u.hh * PITCH_HALF_Y - 1;
    const slotCol = u.w <= 2 ? 0 : 1;
    const dx = colCenter(u.col + slotCol) + 0.16;
    const hasMag = u.closure === 'magnet'; // per-drawer magnet clip only when chosen
    // The 2H DecorDrawer model seats its body 2mm too deep (z-center 5.24 is
    // ground-truth at 1H) — leaving a gap behind the correctly-placed faceplate.
    // Push the 2H drawer (and its back-wall clip/magnet) forward 2mm to close it
    // (Joey-verified 2026-07-06). Other non-1H heights are still derived (warned).
    // Classic bodies are their own exports placed off their measured back — no nudge.
    const drwFwd = !isClassic && u.hh === 4 ? 2 : 0;
    const drwNode = `${isClassic ? 'ClassicDrawer' : 'DecorDrawer'}_${L}-${u.w}W-${H}H`;
    inst.push({ id: `drw${i}`, node: drwNode, pos: [cx + 0.16, bottom + 5.72, (isClassic ? classicZ : 5.24) + drwFwd] });
    add(drwNode, `${isClassic ? 'Classic' : 'Decor'} Drawer ${L}-${u.w}W-${H}H`, 'Drawer', isClassic ? links.classic : links.decor);
    if (hasMag) {
      // the clip + magnet are already counted once per magnet drawer in the case
      // loop (qty 2 covers this drawer-side clip and the case-back clip); no add.
      // Backs align across both fills, so the clip Z holds for the classic too.
      inst.push({ id: `dc${i}`, node: 'MagnetClip_10x2mm', pos: [dx, bottom + 5.72 + drwH - 20, -83 + dz + drwFwd], yaw: 180, rides: `drw${i}`, owner: u.id });
      inst.push({ id: `dm${i}`, node: 'Magnet_10x2mm', pos: [dx, bottom + 5.72 + drwH - 15, -84 + dz + drwFwd], rides: `drw${i}`, owner: u.id });
    }
    const magIds = hasMag ? [{ id: `dc${i}` }, { id: `dm${i}` }] : []; // clip+magnet riders, or none
    if (firstDrawerDemo === null) {
      firstDrawerDemo = i;
      drawerPhases.push({ enter: [{ id: `drw${i}`, at: [0, 0, 190], from: [0, 0, 60] }] });
      if (hasMag) drawerPhases.push(
        { enter: [{ id: `dc${i}`, at: [0, 35, 190], from: [0, 30, 0] }] },
        { enter: [{ id: `dm${i}`, at: [0, 35, 190], from: [0, 0, 30] }] },
        { move: [{ id: `dc${i}`, by: [0, -35, 0] }, { id: `dm${i}`, by: [0, -35, 0] }] },
      );
      drawerPhases.push({ move: [{ id: `drw${i}`, by: [0, 0, -190] }, ...magIds.map(m => ({ id: m.id, by: [0, 0, -190] }))] });
    } else {
      if (hasMag) drawerFades.push({ id: `dc${i}` }, { id: `dm${i}` });
      drawerPhases._laterDrawers = (drawerPhases._laterDrawers || []).concat({ id: `drw${i}`, from: [0, 0, 200] });
    }
    if (isClassic) return; // the classic drawer IS its own front — no plate, no dressing
    // faceplate: Essential ground-truth z-center 95.07 (front face 97.57, where
    // the handle mounts); EdgeLabel 104.62 — both = mounting plane + depth/2.
    // Correct at every height — the faceplate does NOT move with the above
    // drawer-body nudge (it's placed to sit flush regardless).
    const code = `${u.w}W-${H}H`;
    inst.push({ id: `fp${i}`, node: face.node(code), pos: [cx + 0.47, bottom + 3.72, face.z - dz], rides: `drw${i}` });
    if (bcOn) {
      // back cover: seats in the drawer-front gap BEHIND the plate — z-center =
      // the mounting plane (fp back face, 92.57) + 0.225, bottom = fp bottom
      // + 7.22 (DERIVED from the EdgeLabel B blend @1W-1H — verify on a print;
      // works under every plate family since the mounting plane never moves)
      inst.push({ id: `bc${i}`, node: `BackCover_EdgeLabel_${u.w}W-${H}H`, pos: [cx + 0.47, bottom + 3.72 + 7.22, 92.795 - dz], rides: `drw${i}` });
      add(`BackCover_EdgeLabel_${u.w}W-${H}H`, `Faceplate Back Cover ${u.w}W-${H}H`, 'BackCover', null);
    }
    if (face.extras) {
      // EdgeLabel dressing (offsets DERIVED from the EdgeLabel B blend @1W-1H,
      // relative to the plate): accent panel — bottom +0.05, z-center −7.675
      // from the plate center — fills the face below the label band, so 05H
      // (where the band IS the whole plate) has none. The universal label card
      // is LEFT-ANCHORED: its center sits 28.5 from the plate's LEFT edge on
      // EVERY width (the window doesn't move as plates widen — a center-based
      // −15 was off by half a pitch on 2W, Joey measured the 44 mm). Bottom
      // + plate height − 27 (top band), z-center −6.3. All ride the drawer.
      if (u.hh !== 1) {
        // the accent GLBs exported UPSIDE DOWN (blend pose) — counter-rotate 180°
        // about Z (the depth axis): top↔bottom + left↔right, face still forward
        // (an X flip showed the accent's BACK — Joey). Bottom-anchored parts hang
        // below their origin when flipped, so place at their TOP (bottom + accent
        // height, = fpH − 27.2 label band) to keep the flip centered on itself.
        inst.push({ id: `fa${i}`, node: `Accent_EdgeLabel_${code}`, rot: [0, 0, 180], pos: [cx + 0.47, bottom + 3.77 + (fpH - 27.2), face.z - 7.675 - dz], rides: `drw${i}` });
        add(`Accent_EdgeLabel_${code}`, `EdgeLabel Accent ${code}`, 'Accent', null);
      }
      inst.push({ id: `fl${i}`, node: 'Label_EdgeLabel', pos: [cx + 0.47 - (u.w * PITCH_X - 1) / 2 + 28.5, bottom + 3.72 + fpH - 27, face.z - 6.3 - dz], rides: `drw${i}` });
      add('Label_EdgeLabel', 'EdgeLabel Label (universal)', 'Label', null);
    }
    if (face.hasHandle) {
      // handle: back face against the faceplate front, vertically centered on
      // the plate — the mounting rule that holds for every style (from the Deco
      // ground truth: bottom = fp + 22.49, z-center 109.57 for h9 × d24).
      // EdgeLabel prints its grip into the plate — no bolt-on handle at all.
      inst.push({ id: `h${i}`, node: handleStyle.node, pos: [cx + 0.46, bottom + 3.72 + (fpH - handleStyle.h) / 2 - 0.5, 97.57 - dz + handleStyle.d / 2], rides: `drw${i}` });
    }
    add(face.node(code), face.label(code), 'Faceplate', face.links);
    if (face.hasHandle) add(handleStyle.node, handleStyle.label, 'Handle', handleStyle.links);
    if (firstFpDemo === null) {
      firstFpDemo = i;
      const hasAccent = face.extras && u.hh !== 1;
      const homeMove = { move: [ // everyone glides home together at the end
        { id: `drw${i}`, by: [0, 0, -40] }, ...magIds.map(m => ({ id: m.id, by: [0, 0, -40] })),
        ...(bcOn ? [{ id: `bc${i}`, by: [0, 0, -40] }] : []),
        { id: `fp${i}`, by: [0, 0, -40] },
        ...(hasAccent ? [{ id: `fa${i}`, by: [0, 0, -40] }] : []),
        ...(face.extras ? [{ id: `fl${i}`, by: [0, 0, -40] }] : []),
        ...(face.hasHandle ? [{ id: `h${i}`, by: [0, 0, -40] }] : []),
      ] };
      // Joey's faceplate cinematic (2026-07-08, BOTH families — assembly-first):
      // pop the drawer, fade the WHOLE WORLD away (vanish + room 0 — the step
      // twin of the tap isolation), then build the plate UNIT hovering above
      // its seat: plate in, dressing attaches (Essential: handle presses on;
      // EdgeLabel: accent + label with their removal rituals reversed), camera
      // swings BEHIND for the back cover when one is on, then the camera
      // glides home, the world fades back, the ASSEMBLED unit slides DOWN
      // onto the popped drawer, and everyone pushes home. Every at-offset +
      // move nets to zero → prev/jump stays deterministic.
      const HOV = 45; // the unit assembles hovering this far above its seat
      const plateW = u.w * PITCH_X - 1;
      const pc = [cx + 0.47, bottom + 3.72 + fpH / 2 + HOV, face.z - dz + 40]; // plate center at the assembly hover
      // fitR = the plate's half-diagonal (+ dressing depth allowance) × margin —
      // the VIEWER turns it into an aspect-aware distance (a fixed r overfilled
      // portrait phones, whose horizontal fov is a third of a desktop's)
      const fitR = Math.hypot(plateW, fpH, 30) / 2 * 1.5;
      const camFront = { t: 12, p: 82, fitR, target: pc };
      const camBack = { t: 168, p: 82, fitR, target: pc };
      const unit = [ // the plate + its dressing — everything that slides down as one
        { id: `fp${i}` },
        ...(face.hasHandle ? [{ id: `h${i}` }] : []),
        ...(hasAccent ? [{ id: `fa${i}` }] : []),
        ...(face.extras ? [{ id: `fl${i}` }] : []),
        ...(bcOn ? [{ id: `bc${i}` }] : []),
      ];
      fpDemo.push(
        { move: [{ id: `drw${i}`, by: [0, 0, 40] }, ...magIds.map(m => ({ id: m.id, by: [0, 0, 40] }))] },
        { vanish: true, room: 0, camera: camFront },                              // world away → the assembly stage
        { enter: [{ id: `fp${i}`, at: [0, HOV, 40], from: [0, 30, 0] }] },        // the bare plate floats in
        ...(face.hasHandle ? [
          { enter: [{ id: `h${i}`, at: [0, HOV, 55], from: [0, 0, 30] }] },       // handle arrives out front…
          { move: [{ id: `h${i}`, by: [0, 0, -15] }] },                           // …and presses on (2× M3)
        ] : []),
        ...(hasAccent ? [
          { enter: [{ id: `fa${i}`, at: [0, HOV - 4, 60], from: [0, 0, 30] }] },  // accent arrives riding low…
          { move: [{ id: `fa${i}`, by: [0, 0, -20] }] },                          // …in 20 (its removal ritual, reversed)
          { move: [{ id: `fa${i}`, by: [0, 4, 0] }] },                            // …up 4 onto its clips
        ] : []),
        ...(face.extras ? [
          { enter: [{ id: `fl${i}`, at: [0, HOV + 20, 40], from: [0, 25, 0] }] }, // label hovers over its window…
          { move: [{ id: `fl${i}`, by: [0, -20, 0] }] },                          // …and slides in
        ] : []),
        ...(bcOn ? [
          { camera: camBack },                                                    // swing behind the plate
          { enter: [{ id: `bc${i}`, at: [0, HOV + 4, 20], from: [0, 0, -35] }] }, // cover arrives behind, riding high…
          { move: [{ id: `bc${i}`, by: [0, 0, 20] }] },                           // …forward 20 against the plate back
          { move: [{ id: `bc${i}`, by: [0, -4, 0] }] },                           // …down 4 onto its hooks
        ] : []),
        { appear: true, room: 1, camera: fpStepCam },                             // world returns, camera glides home
        { move: unit.map(p => ({ id: p.id, by: [0, -HOV, 0] })), sync: true },    // the ASSEMBLED unit slides DOWN onto the drawer
        homeMove,
      );
    } else {
      if (bcOn) fpFades.push({ id: `bc${i}` });
      fpFades.push({ id: `fp${i}` });
      if (face.extras && u.hh !== 1) fpFades.push({ id: `fa${i}` });
      if (face.extras) fpFades.push({ id: `fl${i}` });
      if (face.hasHandle) fpFades.push({ id: `h${i}` });
    }
  });

  if (classicCount) warnings.push('Classic drawers are placed from measured part geometry (back-aligned with the calibrated Decor drawer) — no assembled ground truth yet · verify the fit on a printed build.');
  if (units.some(u => u.fill === 'decor' && u.hh !== 2)) warnings.push('Non-1H drawers use some derived (not-yet-calibrated) sizing · double-check the tall drawers and report anything that looks off.');

  // ---- assemble the step list ----------------------------------------------
  // (H_MM is hoisted above the drawer/faceplate loop — the cinematic needs it)
  const wide = cam(0, H_MM * 0.45, totalW, gridBottom);

  const magnetTotal = bom.get('Magnet_10x2mm')?.qty || 0;
  const handleTotal = bom.get(handleStyle.node)?.qty || 0;
  let printTotal = 0;
  for (const p of bom.values()) if (!p.purchased) printTotal += p.qty;

  const nFeet = feetIds.back.length + feetIds.front.length;
  const setDownStep = {
    title: 'Set the base down',
    note: 'Flip the base feet-down and set it where the kit will live.',
    camera: cam(0, 50, totalW, gridBottom, FIT),
    phases: [{ settle: 'base' }],
  };
  // a fun, deterministic name for the custom build (same build = same name)
  const ADJ = ['Mighty', 'Tidy', 'Trusty', 'Grand', 'Clever', 'Bold', 'Steady', 'Nimble'];
  const NOUN = ['Workbench Commander', 'Drawer Vault', 'Parts Palace', 'Sorting Station', 'Bit Bunker', 'Hardware Haven', 'Stack Machine', 'Organizer Rig'];
  const drawerCount = units.filter(u => u.fill === 'decor' || u.fill === 'classic').length;
  const seed = units.length * 31 + totalW * 7 + maxTop * 3;
  const funName = `The ${ADJ[seed % ADJ.length]} ${NOUN[(seed >> 3) % NOUN.length]}`;

  const preSteps = [
    {
      title: funName,
      note: `Your custom GEN2 build · ${units.length} unit${units.length > 1 ? 's' : ''}, ${drawerCount} drawer${drawerCount === 1 ? '' : 's'}, ${totalW} column${totalW > 1 ? 's' : ''} wide. Drag to orbit, tap any part to identify it. ` +
        `${printTotal} prints · quantities on the right.` +
        (handleTotal ? ` You'll also need ${handleTotal * 2}× M3 screws for the handles` : '') +
        (magnetTotal ? ` and ${magnetTotal}× 10×2 mm disc magnets for the optional magnet closures (hardware store items).` : '.') +
        (warnings.length ? ' ⚠ ' + warnings.join(' ⚠ ') : ''),
      // the exploded preview spreads parts past the assembled bounds, so it
      // keeps a fixed (looser) r rather than fitting the bounding sphere.
      camera: { ...wide, fit: undefined, r: Math.min(2200, wide.r * 1.35), target: [0, H_MM * 0.55, 50] }, checklist: true,
    },
  ];
  if (isUT) {
    preSteps.push({
      title: utIds.length > 1 ? 'Screw the rails to the surface' : 'Screw the rail to the surface',
      note: 'Hold each rail flat against the underside · channels facing down, the long overhang toward the back · and drive the wood screws up through the plate: one at each end and at every seam line, in the front and back rows. The rail is the stationary part; every case slides into it.',
      camera: { ...camUp(0, flatTopY, totalW, gridBottom), fit: FIT },
      phases: [
        { enter: utIds.map(id => ({ id, from: [0, -70, 0] })) },      // lift the rail up against the surface
        { enter: utScrewIds.map(id => ({ id, from: [0, -45, 0] })) }, // drive the screws up into the wood
      ],
    });
  } else if (isWall) {
    preSteps.push({
      title: bracketIds.length > 1 ? 'Mount the wall brackets' : 'Mount the wall bracket',
      note: `Screw the bracket${bracketIds.length > 1 ? 's' : ''} flat to the wall · 2 wood screws per 1W column. The cases hang on the protruding screw-head pegs, so drive them until the heads stand just proud of the bracket.`,
      camera: cam(0, flatTopY, totalW, gridBottom, FIT),
      phases: [
        { enter: bracketIds.map(id => ({ id, from: [0, 0, 70] })) },       // hold the bracket to the wall
        { enter: screwIds.map(id => ({ id, from: [0, 0, 55] })) },          // drive the screws in (−Z into the wall)
      ],
    });
  } else if (caseFeet) {
    preSteps.push(...baseCaseSteps);
    preSteps.push({
      title: `Bench: insert the ${nFeet} feet`,
      note: 'Feet slide into the slots under the case, lengthwise: front feet snap in back-to-front, rear feet front-to-back.' +
        (bottomUnits[0].w > 1 ? ' Where the middle slots sit close together, fill just one per row.' : ''),
      camera: cam(spanCenter(bottomUnits[0]), 125, totalW, gridBottom, FIT),
      phases: [
        { enter: feetIds.back.map(id => ({ id, from: [0, 0, 35] })) },
        { enter: feetIds.front.map(id => ({ id, from: [0, 0, -35] })) },
      ],
    });
    preSteps.push(setDownStep);
  } else {
    preSteps.push(
    {
      title: rails.length > 1 ? 'Bench: lower footrails' : 'Bench: lower footrail',
      note: 'Start at the bench · the rails are shown raised so you can see the foot slots on the undersides.',
      camera: cam(0, 115, totalW, gridBottom, FIT),
      phases: [{ enter: frlIds.map(id => ({ id, from: [0, 90, 0] })) }],
    },
    {
      title: `Bench: insert the ${nFeet} feet`,
      note: 'Pointy end slides in first · outer feet toward the rail ends, middle feet left to right.' +
        (rails.length > 1 ? ' Where two rails meet, install that slot pair on ONE rail only.' : ''),
      camera: cam(0, 115, totalW, gridBottom, FIT),
      phases: [
        { enter: feetIds.back.map((id, n) => ({ id, from: [n === 0 ? 30 : -30, 0, 0] })) },
        { enter: feetIds.front.map((id, n) => ({ id, from: [n === 0 ? 30 : -30, 0, 0] })) },
      ],
    },
    setDownStep,
    {
      title: uppers.length > 1 ? 'Upper footrails' : 'Upper footrail',
      note: 'Each upper footrail slides on from the back, all the way forward until it stops.' +
        (uppers.length > 1 ? ' The upper sections are staggered brick-style over the lower ones, tying the base together.' : ''),
      camera: cam(0, 30, totalW, gridBottom, FIT),
      phases: [{ enter: uppers.map((r, i) => {
        inst.push({ id: `fru${i}`, node: `FR-U_${L}-${r.w}W`, pos: [railX(r), FRU_Y, 0] });
        return { id: `fru${i}`, from: [0, 0, slideBack] };
      }) }],
    });
  }

  // tabletop covers slide on from the back as their own two steps at the end.
  // wall covers were already attached to the top cases (before hanging), so they
  // aren't a separate step here.
  const postSteps = [];
  if (!hangs) {
    postSteps.push({
      title: clIds.length > 1 ? 'Lower covers' : 'Lower cover',
      note: 'The lower covers slide over the top from the back · the top cases’ QuickLocks lock them.' +
        (coverStoppers.length ? ' Then drop the remaining stoppers into the covers’ slots to protect the top-row drawers.' : ''),
      camera: cam(0, H_MM, totalW, gridBottom, FIT),
      phases: [
        { enter: clIds.map(id => ({ id, from: [0, 0, slideBack] })) },
        ...(coverStoppers.length ? [{ enter: coverStoppers.flatMap(e => e.enter) }] : []),
      ],
    });
    postSteps.push({
      title: cuIds.length > 1 ? 'Upper covers' : 'Upper cover',
      note: 'The upper covers slide in from the back, onto the lower covers’ dovetails.' +
        (cuIds.length > 1 ? ' Their seams are staggered brick-style over the lower covers’ seams, locking the sections together.' : ''),
      camera: cam(0, H_MM, totalW, gridBottom, FIT),
      phases: [{ enter: cuIds.map(id => ({ id, from: [0, 0, slideBack] })) }],
    });
  }
  if (firstDrawerDemo !== null) {
    const later = drawerPhases._laterDrawers || [];
    delete drawerPhases._laterDrawers;
    const anyMagnet = units.some(u => (u.fill === 'decor' || u.fill === 'classic') && u.closure === 'magnet');
    postSteps.push({
      title: 'Drawers',
      note: (anyMagnet
        ? 'Before a magnet-closure drawer goes in: snap a clip into its back-wall slot and press in the magnet, front to back. Then slide each drawer in from the front.'
        : 'Slide each drawer in from the front.') +
        // classic-only builds end here — no faceplate step follows
        (firstFpDemo === null ? ' The build is done · tap any part to see its name and download links.' : ''),
      // under-table drawers live below eye level — shoot from just under the horizon
      camera: { ...cam(0, H_MM * 0.45, totalW, gridBottom, FIT), t: 12, p: isUT ? 97 : 68 },
      phases: [
        ...drawerPhases,
        ...(drawerFades.length ? [{ fade: drawerFades }] : []),
        ...(later.length ? [{ enter: later }] : []),
      ],
    });
  }
  if (firstFpDemo !== null) {
    postSteps.push({
      title: face.hasHandle ? 'Faceplates & handles' : 'Faceplates',
      // assembly-first (Joey): build the plate unit, THEN slide it onto the
      // drawer — the note follows each family's dressing in demo order
      note: 'Assemble the faceplate first: ' +
        (face.extras
          ? 'press the accent panel into the face and slide the label into its window'
          : `screw on the ${handleStyle.label} (2× M3)`) +
        (bcOn ? ', then clip the back cover in from behind' : '') +
        '. Pop a drawer out about 40 mm, slide the assembled faceplate DOWN onto the drawer front until it snaps, then push the drawer home.' +
        ` Repeat for every ${classicCount ? 'Decor drawer' : 'drawer'} · the build is done. Tap any part to see its name and download links.`,
      camera: fpStepCam,
      phases: [
        ...fpDemo,
        ...(fpFades.length ? [{ fade: fpFades }] : []),
      ],
    });
  }

  // hanging builds assemble top-down (top row onto the brackets/rails first);
  // the case steps are generated bottom-up, so reverse them (their steps have
  // their own descriptive titles). Tabletop keeps its bottom-up "Case N" order.
  // Staggered wall: the top row (place each case → cover the row → hang the
  // row) leads, then the lower rows reversed.
  const caseStepOrder = isStaggered
    ? [...topPlacements, stagCoverStep, stagHang, ...[...steps].reverse()]
    : hangs ? [...steps].reverse() : steps;
  const manifest = {
    title: `${funName} · GEN2 Custom · ${L}`,
    collection: String(L),
    generated: true,
    mount: build.mount,
    pitch: { x: PITCH_X, y: 56 },
    colors: COLORS,
    parts: [...bom.values()],
    instances: inst,
    stages,
    steps: [...preSteps, ...caseStepOrder, ...postSteps],
  };
  return { errors, warnings, manifest };
}

// part image for the identify card / checklist — same renders as the planner BOM
function imgFor(node) {
  let m;
  // Case / decor renders are per-collection — ALL six lengths copied from the
  // planner's per-length batches (2026-07-10). The identify card's <img>
  // onerror (main.js) hides any stray gap rather than showing a wrong photo.
  if ((m = node.match(/^(\d+)-(\d)W-(\w+)H_Case$/))) return `img/parts/Case ${m[1]}-${m[2]}W-${m[3]}H.png`;
  if ((m = node.match(/^DecorDrawer_(\d+)-(\d)W-(\w+)H$/))) return `img/parts/Decor Drawer ${m[1]}-${m[2]}W-${m[3]}H.png`;
  // classic drawers: per-length renders for all six lengths (2026-07-11 batch)
  if ((m = node.match(/^ClassicDrawer_(\d+)-(\d)W-(\w+)H$/))) return `img/parts/Classic Drawer ${m[1]}-${m[2]}W-${m[3]}H.png`;
  // covers + foot rails (2026-07-10 batch, all six lengths): the render files
  // ARE the library part codes, so the node name maps straight to a PNG
  if (/^C[LU]-\d+-\dW$/.test(node) || /^FR-[LU]_\d+-\dW$/.test(node)) return `img/parts/${node}.png`;
  // wall brackets: per-width renders (2026-07-11 batch), universal across lengths
  if ((m = node.match(/^WallMount_Lite_(\dW)$/))) return `img/parts/WallMount_Lite_${m[1]}.png`;
  // mirror parts: the R render is the L one flipped horizontally (2026-07-10)
  if (node === 'QuickLock-R') return 'img/parts/QuickLock-R.png';
  if (node.startsWith('QuickLock')) return 'img/parts/QuickLock.png';
  if (node.startsWith('Drawer_Stoppers')) return 'img/parts/Drawer Stopper.png';
  if (node === 'MagnetClip_10x2mm') return 'img/parts/Magnet Clip.png';
  if (node === 'Magnet_10x2mm') return 'img/parts/Magnets.png';
  if (node.startsWith('Faceplate_Essential')) return 'img/parts/Faceplate-Essential.jpg';
  // EdgeLabel plates have per-size renders (2026-07-08 batch) — shared
  // hardware, so one 18-file set serves every collection
  if ((m = node.match(/^Faceplate_EdgeLabel_(\dW-\d+H)$/))) return `img/parts/EdgeLabel_${m[1]}.png`;
  return null;
}

// camera preset scaled to the build's size. Pass `fit` (a margin, e.g. 1.18) on
// WHOLE-BUILD shots: the viewer reframes them to the real bounds at the current
// aspect, so 16:9 fullscreen isn't zoomed out (r is the fallback). Leave it off
// for per-case / staged-bench shots, whose action sits away from the bounds.
function cam(tx, ty, totalW, gridBottom, fit) {
  const size = Math.max(totalW * PITCH_X, gridBottom * PITCH_HALF_Y + 30, CAM_DEPTH);
  const p = { t: 30, p: 58, r: Math.min(1800, Math.max(620, size * 3.1)), target: [tx, ty, 0] };
  if (fit) p.fit = fit;
  return p;
}
const FIT = 1.18; // whole-build framing margin

// 3/4 view from BELOW the build — for wall lower rows, so you watch the case
// slide up under the row above (polar > 90° needs the wall build's relaxed
// maxPolarAngle, set in main.js).
function camUp(tx, ty, totalW, gridBottom) {
  return { ...cam(tx, ty, totalW, gridBottom), p: 116, target: [tx, ty + 15, 0] };
}
