// Planner build → viewer manifest, at runtime. No backend: the planner's
// #build= hash (base64 JSON of its serializeBuild()) is the entire input.
//
// All placement numbers derive from the ground-truth calibration of
// 2026-07-04 (see CLAUDE.md "Placement math"). Rules generalized from the
// 1H ground truth are marked DERIVED; positions Joey tuned by eye are
// marked TUNED. Scope: all six collections (59/115/165/185/240/270) — tabletop
// and wall everywhere; under-table everywhere (all six rail GLB sets landed 2026-07-19). The 59
// is a mini collection: 1W/2W × 05H/1H only, and NO footrails BY DESIGN (Joey
// 2026-07-10: too shallow to be stable on rails) — feet go into every bottom
// case's own underside slots instead.

/* THE REQUIREMENT-SCOPE CONTRACT - resolved, never reimplemented.
   In the browser, viewer/js/vendor/requirement-scope.js is a classic script
   loaded before this module and attaches GEN2_REQ to the global. In node (the
   test suites import this file directly, no DOM) there is no such global, so
   the same vendored file is read and evaluated here. Either way the bytes are
   the planner's, gated by test/requirement-scope-vendor.test.mjs.
   ⚠ FAIL LOUD. A generator that silently ran without the contract would emit
   unclassified rows that every consumer downstream would misread as "never
   migrated" rather than "broken" - the exact silent failure this replaces. */
const REQ = (() => {
  if (typeof globalThis.GEN2_REQ === 'object' && globalThis.GEN2_REQ) return globalThis.GEN2_REQ;
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    // node: evaluate the vendored classic script the way a browser would
    const { readFileSync } = process.getBuiltinModule('node:fs');
    const { fileURLToPath } = process.getBuiltinModule('node:url');
    const { join, dirname } = process.getBuiltinModule('node:path');
    const here = dirname(fileURLToPath(import.meta.url));
    (0, eval)(readFileSync(join(here, 'vendor', 'requirement-scope.js'), 'utf8'));
    if (globalThis.GEN2_REQ) return globalThis.GEN2_REQ;
  }
  throw new Error('requirement-scope contract is not loaded: viewer/js/vendor/requirement-scope.js must precede generate.js (see index.html)');
})();
/* Re-exported so main.js reads the SAME resolved contract this generator used,
   rather than reaching for the global on its own. One resolution, one object. */
export { REQ as REQUIREMENT };

/* THE TABLETOP-COMPLETION CONTRACT (2026-08-23) - which empty cells a tabletop
   run still needs before its top is level. Same vendoring shape as the
   requirement-scope contract above: a classic script in the browser, the
   vendored file evaluated here under node, the bytes pinned by
   test/tabletop-completion-vendor.test.mjs. The planner draws the same cells
   on its board, so what this viewer ghosts and what the board hatches can
   never disagree. */
const TABLETOP = (() => {
  if (typeof globalThis.GEN2_TABLETOP === 'object' && globalThis.GEN2_TABLETOP) return globalThis.GEN2_TABLETOP;
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    const { readFileSync } = process.getBuiltinModule('node:fs');
    const { fileURLToPath } = process.getBuiltinModule('node:url');
    const { join, dirname } = process.getBuiltinModule('node:path');
    const here = dirname(fileURLToPath(import.meta.url));
    (0, eval)(readFileSync(join(here, 'vendor', 'tabletop-completion.js'), 'utf8'));
    if (globalThis.GEN2_TABLETOP) return globalThis.GEN2_TABLETOP;
  }
  throw new Error('tabletop-completion contract is not loaded: viewer/js/vendor/tabletop-completion.js must precede generate.js (see index.html)');
})();

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
  // railScrewBack = the rail's rear screw-hole row, inset from the rail BACK
  // face (MEASURED per length 2026-07-19, all widths agree; default 36 = the
  // 185 calibration, which 270 matches exactly). See utScrewBackZ below.
  185: { depth: 185, railDepth: 201 },
  165: { depth: 165, railDepth: 179, railScrewBack: 34 },
  // 2026-07-10: the four remaining lengths (cases/drawers/covers landed in the
  // library).
  // ALL hardware Z for these lengths is DERIVED from the 185 calibration via
  // ±dz (same rule that produced the 165) — verify against printed builds.
  // 59: noTabletop mirrors the planner's mountBlocksLength — the mini collection
  // has NO foot rails and NO feet slots (too shallow to be stable), so it only
  // ships as a hanging mount; maxW/maxHH mirror its catalog (1W/2W × 05H/1H).
  // classicDepth: the Classic Drawer's overall depth (body + integrated pull
  // lip). It's case depth + 10 everywhere except 59/115, whose exports run
  // 0.11 shy (parts_index.csv ground truth) — generateManifest defaults the
  // rest to depth + 10.
  59:  { depth: 59, noTabletop: true, maxW: 2, maxHH: 2, classicDepth: 68.89, railDepth: 74.89, railScrewBack: 16.89 },
  // 2026-07-19: 115 + 270 + 240 rail GLBs landed (exported from D:\Render
  // Projects\GEN2 Under-table Rails.blend — facing verified against the
  // canonical 185 front-ridge signature). Depths from parts_index.csv:
  // 115 = 130.9 (115 + 15.9 back overhang), 270 = 286 (270 + 16) — railZ
  // derives to −7.95 / −8.0, matching the 185 calibration. The 240 Lite rail
  // is exactly 240 deep (NO back overhang — Joey's fixed models, later same
  // day) → railZ derives to 0: front-aligned and back-flush. The 59 rails
  // (gen2-ql-rail-*-small, renamed GEN2 Rail - 59-<w>W) landed last: 74.89
  // deep (59 + 15.9 back overhang, railZ −7.945) — EVERY collection has rail
  // GLBs now. ⚠ This block was accidentally REVERTED by fafbad8 (a stale-copy
  // overwrite during the Crystal-handles work) and shipped broken to prod;
  // restored 2026-07-25. railDepth absent would make UT builds error.
  // classicMaxHH capped 115/240/270 at 2H while their Classic Drawer catalogs
  // stopped there (16 GLBs each). CLOSED 2026-08-02 — Joey modelled 1W-3H +
  // 2W-3H for all three, so every length now ships the full 18 and no entry
  // sets the cap. The GUARD ITSELF STAYS (see the per-unit validation below):
  // it costs nothing and is the net that catches the next partial catalog.
  // Removed here in step with the planner's collectionCases[L].maxClassicH —
  // lifting only one side offers a size the other end can't build.
  115: { depth: 115, classicDepth: 124.89, railDepth: 130.9, railScrewBack: 42.4 },
  240: { depth: 240, railDepth: 240, railScrewBack: 20 },
  270: { depth: 270, railDepth: 286 },
};

// The under-table rail fastener — Joey's default, 2026-08-23: a #6 × 3/4"
// (19.05 mm) wood screw. The original 31.8 mm `WoodScrew` stays the WALL
// model on purpose: the right wall fastener or anchor depends on the wall
// material, so the two mounts keep separate guidance. The 31.8 mm model under
// a table put its tip 28.75 mm into the top — through any 25 mm worktop —
// which is what this corrects. GLB canonical like WoodScrew (shank along
// depth, head at +Z, tip at −Z, base at Y=0), 7.13 × 7.15 × 19.05 mm.
// `r` is the GLB's Y half-height: pitched 90° about X, the bottom-anchored
// origin sits that far from the screw's axis, so a MEASURED hole row places
// the instance at axis − r (the old 3.43 was the 31.8 mm model's).
// `bite` = len − the 3.025 mm head seat inside the rail plate = how far the
// tip reaches into the surface; it is what the BOM warning quotes.
const SCREW_UT = {
  node: 'WoodScrew_No6-19mm', label: '#6 × 3/4" wood screw', len: 19.05, r: 3.574, bite: 16.0,
  note: 'Hardware store item · a 3/4" screw reaches about 16 mm into the top - check the surface is thick enough first and choose a length that cannot break through.',
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
  screwY: 6.9 - 3.025 + SCREW_UT.len / 2, // screw CENTER height above flatTopY = 13.4: head seated 3 mm inside the rail plate (surface 6.9 − 3.025) + half the #6 × 3/4" length → tip 16.0 into the wood. (The 31.8 mm WoodScrew sat at 19.775 with its tip 28.75 into the wood — through a 25 mm top; corrected 2026-08-23.)
  screwFrontZ: 76.93,     // 185 front screw row (z ≈ +80.5 − SCREW_UT.r, the radial offset the pitched GLB carries) — see local utScrewFrontZ
  screwBackZ: -76.07,     // 185 back screw row (z ≈ −72.5 − SCREW_UT.r) — see local utScrewBackZ
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
  fpc:   { p: 'https://www.printables.com/model/1291210-gen2-decor-faceplates-classic-pro-series', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20-%20Faceplates%20-%20Classic%20Pro%20Series-1332444' },
  // the FREE Classic series — not to be confused with `fpc` (Classic Pro, club)
  fpcl:  { p: 'https://www.printables.com/model/1280870-gen2-decor-faceplates-classic-series', t: 'https://than.gs/m/1334047' },
  // the Chevron series (2026-08-08) — a PREMIUM family (club), not core
  fpch:  { p: 'https://www.printables.com/model/968654-gen2-decor-faceplates-chevron-series', t: 'https://than.gs/m/1116950' },
  h:     { p: 'https://www.printables.com/model/1044972-gen2-decor-handles-deco-series', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20Handles%20-%20Deco%20Series-1159960' },
  hb:    { p: 'https://www.printables.com/model/965604-gen2-decor-handles-blockbar-series', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20-%20Handles%20-%20BlockBar-1116949' },
  hc:    { p: 'https://www.printables.com/model/1001155-gen2-decor-handles-crystal', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20-%20Handles%20-%20Crystal-1134382' },
  // fallbacks when a length has no page of its own yet
  kit:   { p: 'https://www.printables.com/model/1118906-gen2-185-tabletop-starter-kit', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20185%20Tabletop%20Starter%20Kit-1231757' },
  wall:  { p: 'https://www.printables.com/model/1777719-gen2-wall-mount-brackets', t: 'https://than.gs/m/1574321' }, // universal brackets page (2026-07-12 — replaced the old -59 placeholder)
  rail:  { p: 'https://www.printables.com/model/1052357-gen2-rails-185-standard', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Under%20Table%20Rails%20-%20185-1163830', m: 'https://makerworld.com/en/models/2199580-gen2-under-table-rails-185' },
};

// The handle fastener. GLB is canonical like WoodScrew (shank along depth,
// base at Y=0), 5.09 × 5.08 × 7.67 mm — `h` is used to convert the handoff's
// centre-relative height offset into the bottom-anchored `pos.y`.
const SCREW_M3 = { node: 'ButtonHeadScrew_M3-6', label: 'M3×6mm Button Head Screw', h: 5.08 };

// Amazon affiliate buy links for purchased hardware (Joey's, 2026-07-12) —
// rendered as extra chips after Printables/Thangs in the BOM checklist +
// identify card (links.buy, main.js). Standard magnets suit most builds; the
// N52s hold noticeably harder (people found the standard ones weak) but can
// be too strong for small drawers. Mirrors the planner's HARDWARE_BUY.
// `id` is the ANALYTICS identity of a listing — it rides the buy:hardware:<id>
// event so the dashboard can say WHICH affiliate link converted, not just that
// one did. Keep it stable when a label is reworded (the label is display text,
// the id is data), and keep it in step with the planner's HARDWARE_BUY ids:
// both apps point at the same amzn.to listings, so matching ids let the two
// GoatCounter sites sum into one row.
const BUY = {
  magnets: [
    { id: 'magnet-10x2', label: '10×2 mm', url: 'https://amzn.to/4sesPKm' },
    { id: 'magnet-6x2', label: '6×2 mm', url: 'https://amzn.to/4aH1ASw' },
    { id: 'magnet-n52-10x2', label: 'N52 10×2 strong', url: 'https://amzn.to/4q4JX3Z' },
    { id: 'magnet-n52-6x2', label: 'N52 6×2 strong', url: 'https://amzn.to/49BZyC0' },
  ],
  // the #6 listing IS the 3/4" screw (Joey, 2026-08-23) — the label says so;
  // the id is the analytics identity and stays as it was
  woodScrews: [
    { id: 'woodscrew-6', label: 'Buy #6 × 3/4"', url: 'https://amzn.to/4s487gc' },
    { id: 'woodscrew-8', label: 'Buy #8', url: 'https://amzn.to/4pTWDuq' },
  ],
  // fastens a bolt-on handle to its faceplate — the one REQUIRED buy on an
  // Essential-faceplate build (integrated-grip families need none)
  handleScrews: [
    { id: 'm3-button-head', label: 'Buy M3×6 button head', url: 'https://amzn.to/4x4opHK' },
  ],
  // the purchased one-for-one alternative to printed TPU feet (2026-08-21,
  // confirmed): same count, same support spots, stuck to the flat pads around
  // the slots. Billed INSTEAD of the TPU feet when build.feet === 'adhesive'.
  // id mirrors the planner's HARDWARE_BUY entry (the analytics identity).
  rubberFeet: [
    { id: 'rubber-feet', label: 'Buy rubber feet', url: 'https://amzn.to/4cEanSB' },
  ],
};
// Under-table rails bill ONLY the #6 × 3/4" listing: it is the specific
// recommendation (SCREW_UT), not a gauge choice. Wall rows keep both gauges.
BUY.railScrews = [BUY.woodScrews[0]];

// Per-length product pages (2026-07-11 refresh — every collection has its own
// cases/decor pages now, and covers + foot rails got dedicated pages instead
// of funneling to the Table Top Kit bundle).
const LINKS_BY_LEN = {
  cases: {
    59:  { p: 'https://www.printables.com/model/1658749-gen2-59-cases-all', t: 'https://than.gs/m/1535454', m: 'https://makerworld.com/en/models/3092550-gen2-59-cases-all' },
    115: { p: 'https://www.printables.com/model/1658744-gen2-115-cases-all', t: 'https://than.gs/m/1535435', m: 'https://makerworld.com/en/models/3092499-gen2-115-cases-all' },
    165: { p: 'https://www.printables.com/model/1658722-gen2-165-cases-all', t: 'https://than.gs/m/1535457', m: 'https://makerworld.com/en/models/3092414-gen2-165-cases-all' },
    185: { p: 'https://www.printables.com/model/1658700-gen2-185-cases-all', t: 'https://than.gs/m/1535455', m: 'https://makerworld.com/en/models/3092219-gen2-185-cases-all' },
    240: { p: 'https://www.printables.com/model/1658608-gen2-240-cases-all', t: 'https://than.gs/m/1535459', m: 'https://makerworld.com/en/models/3091292-gen2-240-cases-all' },
    270: { p: 'https://www.printables.com/model/1658688-gen2-270-cases-all', t: 'https://than.gs/m/1535458', m: 'https://makerworld.com/en/models/3092111-gen2-270-cases-all' },
  },
  decor: {
    59:  { p: 'https://www.printables.com/model/1070454-gen2-59-decor-drawers-all', t: 'https://than.gs/m/1481534', m: 'https://makerworld.com/en/models/2364145-gen2-59-decor-drawers-all' },
    115: { p: 'https://www.printables.com/model/1307794-gen2-115-decor-drawers-all', t: 'https://than.gs/m/1158598', m: 'https://makerworld.com/en/models/755457-gen2-115-decor-drawers-all' },
    165: { p: 'https://www.printables.com/model/1100978-gen2-165-decor-drawers-all', t: 'https://than.gs/m/1493950', m: 'https://makerworld.com/en/models/861753-gen2-165-decor-drawers-all' },
    185: { p: 'https://www.printables.com/model/964551-gen2-185-decor-drawers-all', t: 'https://than.gs/m/1116945', m: 'https://makerworld.com/en/models/1253173-gen2-185-decor-drawers-all' },
    240: { p: 'https://www.printables.com/model/1322479-gen2-240-decor-drawers-all', t: 'https://than.gs/m/1360074', m: 'https://makerworld.com/en/models/1516607-gen2-240-decor-drawers-all' },
    270: { p: 'https://www.printables.com/model/1062961-gen2-270-decor-drawers-all', t: 'https://than.gs/m/1171387', m: 'https://makerworld.com/en/models/1938424-gen2-270-decor-drawers-all' },
  },
  classic: { // Thangs pages mirrored from the planner 2026-07-12 (240 new; 59 has none yet)
    59:  { p: 'https://www.printables.com/model/234780-gen2-59-classic-drawers-all', m: 'https://makerworld.com/en/models/2364890-gen2-59-classic-drawers-all' },
    115: { p: 'https://www.printables.com/model/1143243-gen2-115-classic-drawers-all', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20115%20Classic%20Drawers-1069181', m: 'https://makerworld.com/en/models/755424-gen2-115-classic-drawers-all' },
    165: { p: 'https://www.printables.com/model/625776-gen2-165-classic-drawers-all', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20165%20Classic%20Drawers-1044262', m: 'https://makerworld.com/en/models/922620-gen2-165-classic-drawers-all' },
    // no MakerWorld url — the 185 classic-drawers page was withdrawn 2026-07-25
    // (Joey). The row falls back to Printables and MakerWorld is simply omitted
    // from its ▾, which is the designed behaviour for a store without the part.
    185: { p: 'https://www.printables.com/model/278293-gen2-185-classic-drawers-all', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20185%20-%20Classic%20Drawers-1042322' },
    240: { p: 'https://www.printables.com/model/1324538-gen2-240-classic-drawers-all', t: 'https://than.gs/m/1360091', m: 'https://makerworld.com/en/models/1516621-gen2-240-classic-drawers-all' },
    270: { p: 'https://www.printables.com/model/1164306-gen2-270-classic-drawers-all', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Drawers%20-%20Large-1093398', m: 'https://makerworld.com/en/models/1938234-gen2-270-classic-drawers-all' },
  },
  covers: { // Thangs pages added 2026-07-12
    59:  { p: 'https://www.printables.com/model/1777881-gen2-59-cover', t: 'https://than.gs/m/1574324', m: 'https://makerworld.com/en/models/3094116-gen2-59-covers' },
    115: { p: 'https://www.printables.com/model/1777837-gen2-115-cover', t: 'https://than.gs/m/1574330', m: 'https://makerworld.com/en/models/3093900-gen2-115-covers' },
    165: { p: 'https://www.printables.com/model/1774498-gen2-165-covers', t: 'https://than.gs/m/1574320', m: 'https://makerworld.com/en/models/3094016-gen2-165-covers' },
    185: { p: 'https://www.printables.com/model/1777844-gen2-185-cover', t: 'https://than.gs/m/1574319', m: 'https://makerworld.com/en/models/3093827-gen2-185-covers' },
    240: { p: 'https://www.printables.com/model/1777846-gen2-240-cover', t: 'https://than.gs/m/1574326', m: 'https://makerworld.com/en/models/3094065-gen2-240-covers' },
    270: { p: 'https://www.printables.com/model/1777849-gen2-270-cover', t: 'https://than.gs/m/1574325', m: 'https://makerworld.com/en/models/3094095-gen2-270-covers' },
  },
  fr: { // no 59 — that collection has no foot rails. Thangs pages added 2026-07-12
    115: { p: 'https://www.printables.com/model/1777819-gen2-115-foot-rails', t: 'https://than.gs/m/1574331', m: 'https://makerworld.com/en/models/3093882-gen2-115-foot-rails' },
    165: { p: 'https://www.printables.com/model/1775386-gen2-165-foot-rails', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20165%20Foot%20Rails-1574329', m: 'https://makerworld.com/en/models/3093999-gen2-165-foot-rails' },
    185: { p: 'https://www.printables.com/model/1777823-gen2-185-foot-rails', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20185%20Foot%20Rails-1574328', m: 'https://makerworld.com/en/models/3093787-gen2-185-foot-rails' },
    240: { p: 'https://www.printables.com/model/1777826-gen2-240-foot-rails', t: 'https://than.gs/m/1574322', m: 'https://makerworld.com/en/models/3094051-gen2-240-foot-rails' },
    270: { p: 'https://www.printables.com/model/1777830-gen2-270-foot-rails', t: 'https://than.gs/m/1574327' },
  },
  // Renamed on BOTH platforms 2026-07-29 ("… Tabletop Starter Kit"); the model
  // ids are unchanged, so the old slugs still 301/resolve — these are canonical.
  kit: {
    115: { p: 'https://www.printables.com/model/1146353-gen2-115-tabletop-starter-kit', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20115%20Tabletop%20Starter%20Kit-1245167' },
    165: { p: 'https://www.printables.com/model/1124278-gen2-165-tabletop-starter-kit', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20165%20Tabletop%20Starter%20Kit-1233752' },
    185: { p: 'https://www.printables.com/model/1118906-gen2-185-tabletop-starter-kit', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20185%20Tabletop%20Starter%20Kit-1231757' },
    240: { p: 'https://www.printables.com/model/1324501-gen2-240-tabletop-starter-kit', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20240%20Tabletop%20Starter%20Kit-1360073' },
    270: { p: 'https://www.printables.com/model/1163955-gen2-270-tabletop-starter-kit', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20270%20Tabletop%20Starter%20Kit-1253780' },
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
  rail: { // all six lengths have real pages (2026-07-12) AND real GLBs — UT
          // GENERATES for every collection (2026-07-19 batches).
          // Thangs renamed all six to "GEN2 Under Table Rails - <L>" 2026-07-29
          // (old names: SMALL/MEDIUM/165/STANDARD/240 Lite/LARGE). Ids unchanged
          // — Thangs resolves by the trailing id, so this is canonicalisation.
          // Printables rails pages were NOT renamed in that cycle.
    59:  { p: 'https://www.printables.com/model/1053797-gen2-rails-59-small', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Under%20Table%20Rails%20-%2059-1165763', m: 'https://makerworld.com/en/models/3093597-gen2-under-table-rails-59' },
    115: { p: 'https://www.printables.com/model/1053795-gen2-rails-115-medium', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Under%20Table%20Rails%20-%20115-1165720', m: 'https://makerworld.com/en/models/755511-gen2-under-table-rails-115' },
    165: { p: 'https://www.printables.com/model/1053557-gen2-rails-165-mini', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Under%20Table%20Rails%20-%20165-1165793', m: 'https://makerworld.com/en/models/939507-gen2-under-table-rails-165' },
    185: { p: 'https://www.printables.com/model/1052357-gen2-rails-185-standard', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Under%20Table%20Rails%20-%20185-1163830', m: 'https://makerworld.com/en/models/2199580-gen2-under-table-rails-185' },
    240: { p: 'https://www.printables.com/model/1322484-gen2-rails-240', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Under%20Table%20Rails%20-%20240-1360077', m: 'https://makerworld.com/en/models/1516579-gen2-under-table-rails-240' },
    270: { p: 'https://www.printables.com/model/1053793-gen2-rails-270-large', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Under%20Table%20Rails%20-%20270-1165816', m: 'https://makerworld.com/en/models/1938132-gen2-under-table-rails-270' },
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

// ---- official-kit build migrations -----------------------------------------
// Official kits (builds/<id>.json) commit a planner build to the repo forever —
// their printed links (Printables descriptions, QR codes) must outlive format
// changes. RULE: changes to the planner build format must be ADDITIVE — new
// optional fields only. Anything else must bump the exporter's buildVersion
// and add a case here that upgrades older committed files in place (each case
// falls through to the next, so v1 → v2 → v3 chains). Returning null = the
// file is NEWER than this viewer knows, which only happens on a stale cached
// deploy → the caller tells the user to refresh. Lives here (not main.js) so
// the golden tests exercise the real migration code.
export function migrateOfficialBuild(b, v) {
  switch (v) {
    case 1: return b;   // current planner serializeBuild() shape
    default: return null;
  }
}

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

  /* REQUIREMENT FACTS this generator knows and the shared classifier does not.
     The policy - what makes a Cover Lower core, option or enhancement - lives
     in the vendored contract and in the planner's buildCoverItems(); this file
     only establishes the FACTS and hands them over:
       - does any top cover run need the staggered two-layer tiling?  A run of
         3W+ tiles 1W+2W with offset seams and the lower layer ties the sections
         together (the same rule the planner's brickTiling() encodes as
         lowerOptional === false). 1W and 2W are a single piece per layer.
       - are there any drawer stoppers? They seat INTO the Cover Lower.
     Both are resolved lazily, after units/runs exist, via coverReq(). */
  const REQ_MOUNT = { 'under-table': 'under-table', wall: 'wall', tabletop: 'tabletop' }[build.mount] || build.mount;
  const mountCore = (obligationId) => ({
    requirement: REQ.core(obligationId),
    basis: REQ.basis('mount', REQ_MOUNT, 'build'),
  });
  let coverFacts = null;   // { staggerRequired, hasStoppers } - filled once units exist
  // stoppers are recommended and removable; omitting them keeps every selected capability intact
  const STOPPER_REQ = { requirement: REQ.enhancement('drawer.retention') };
  const coverReq = (layer) => {
    if (layer === 'upper') return { requirement: REQ.core('top.enclosure') };
    const f = coverFacts || { staggerRequired: false, hasStoppers: false };
    const reasons = [];
    if (f.staggerRequired) reasons.push(Object.assign(REQ.core('top.enclosure'), { basis: REQ.basis('cover.layout', 'staggered', 'build') }));
    if (f.hasStoppers) reasons.push(Object.assign(REQ.option('drawer.stopper.seat', 'drawer.stoppers'), { basis: REQ.basis('drawer.stoppers', 'on', 'build') }));
    if (!reasons.length) reasons.push(REQ.enhancement('top.rigidity'));
    return REQ.resolveReasons(reasons);
  };
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
  // How far the Drawers step pops the demo drawer forward. The magnet clip
  // rides the drawer's BACK (z −83 + dz), so the pop has to clear the CASE
  // FRONT (depth/2) or you're watching the clip go on inside the case — which
  // is exactly what happened on 240 (40 mm buried) and 270 (70 mm), Joey
  // 2026-07-25. depth + 5 puts the clip a constant 14.5 mm proud of the case
  // face on every collection, and is a straight generalization of the 185
  // calibration (185 + 5 = the 190 this used to hardcode, unchanged).
  const drwPop = depth + 5;
  // tight per-case framing for wall work: size the shot by THE CASE and its
  // hardware, never the whole build — on a wide build cam()'s totalW scaling
  // shrank the actual action to a thumbnail (Joey 2026-07-11: don't crop the
  // wall into view, get close to the small bits being inserted). The wide
  // FIT shots that bookend each step still restore full-build context.
  const caseR = (w, h) => Math.max(430, Math.hypot(w * PITCH_X, h, depth) / 2 * 3.0);
  if (isUT && COLL[L] && !coll.railDepth)
    errors.push(`Under-table rails for the ${L} collection aren't in the 3D part library yet.`);
  // planner mountBlocksLength() greys 59 tabletop out, so this only fires on a
  // hand-built link — same physical reason as the planner's tooltip.
  if (!hangs && coll.noTabletop)
    errors.push(`The ${L} collection can't be table-top mounted · it has no foot rails and no feet slots (too shallow to be stable). Wall-mount builds work.`);
  // Under-table rail: front-aligned with the case front (= depth/2). The rail
  // (railDepth deep) overhangs the case back. Screw rows sit on MEASURED hole
  // rows (2026-07-19, evaluated meshes in the rails render blend — hole-bore
  // face clustering; Joey caught the 59 back screws floating ~18 mm off):
  // FRONT row is 12 mm from the rail front on every length (screw pos = axis
  // − SCREW_UT.r, the radial offset the pitched screw GLB carries → 15.574;
  // it was 15.43 with the 31.8 mm WoodScrew, whose GLB was 0.14 mm slimmer).
  // BACK row inset from the rail back varies per collection (railScrewBack in
  // COLL, default 36 = the 185 calibration; 270 measured 36 too, 165 measured
  // 34 — 2 mm off the old derived value, 115 = 42.4, 240 = 20, 59 = 16.89).
  // Every measured back row carries holes exactly at the end + seam screw Xs.
  const railFrontZ = depth / 2, railBackZ = depth / 2 - (coll.railDepth || 201); // fallback only pads the error path (UT without rails errors above)
  const railZ = (railFrontZ + railBackZ) / 2;         // −8 (185) / −7 (165)
  const utScrewFrontZ = railFrontZ - (12 + SCREW_UT.r);                     // 76.93 (185) / 66.93 (165)
  const utScrewBackZ = railBackZ + (coll.railScrewBack || 36) - SCREW_UT.r; // −76.07 (185) / −66.07 (165)
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
  // essential: flat 5 mm plate + bolt-on handle. classic (2026-07-25): the FREE
  // Classic series — 29.2 mm deep 4-zone plate (BODY/FACE/GRIP/GRIP ACCENT)
  // whose grip is printed IN, so no handle AND no dressing: the only family
  // that needs ZERO bought hardware, which is why the starter kits ship it.
  // edgelabel: 24.1 mm deep 2-zone
  // plate (grip printed in — NO handle) + accent panel (not on 05H) + the
  // universal label card. classicpro (2026-07-13): 29.5 mm deep 3-zone plate
  // (BODY/GRIP/GRIP ACCENT — grip scoop at the TOP with the label TILTED onto
  // its slope) + the same SHARED accents + its own universal label. ALL mount
  // their BACK FACE on the same plane (the drawer front, 92.57 − dz):
  // z-center = plane + depth/2. Extras families carry their label/accent
  // placement as functions so EdgeLabel's expressions stay byte-identical:
  // labelX(cx, plateW) / labelY(bottom, fpH) / labelZ(faceZ, dz) /
  // accentZ(faceZ, dz). The shared accent seats at mounting plane + 4.375 in
  // BOTH families (same window stop). Classic Pro offsets DERIVED 2026-07-13
  // from its exporter blend @1W/2W, EVALUATED meshes (bound_box lies — the
  // label's modifier trims ~0.9 mm off its top): the label is top-anchored —
  // same world spot for every height, top FLUSH with the plate top — and
  // horizontally centered (−0.08 = the label mesh's own bbox skew).
  const FACE_FAMILIES = {
    essential: { key: 'essential', node: c => `Faceplate_Essential_${c}`, z: 95.07, hasHandle: true,
                 label: c => `Faceplate Essential ${c}`, extras: false, links: links.fp },
    // z = mounting plane 92.57 + 29.2/2 (canonical center-mode depth from the
    // ClassicDecor parts_index). NB the node prefix is ClassicDecor_ (the
    // exporter's name) while the family/label is "Classic" — and it must never
    // be prefix-matched loosely, or it swallows Faceplate_ClassicPro_*.
    // extras:false + hasHandle:false = a bare plate: no accent, no label, no
    // handle, no screws. It still seats the universal optional back cover
    // (that placement is family-independent).
    classic:   { key: 'classic', node: c => `Faceplate_ClassicDecor_${c}`, z: 107.17, hasHandle: false,
                 label: c => `Classic Faceplate ${c}`, extras: false, links: links.fpcl },
    edgelabel: { key: 'edgelabel', node: c => `Faceplate_EdgeLabel_${c}`, z: 104.62, hasHandle: false,
                 label: c => `EdgeLabel Faceplate ${c}`, extras: true, links: links.fpe, // club family — EdgeLabel Series pages
                 labelNode: 'Label_EdgeLabel', labelName: 'EdgeLabel Label (universal)',
                 // the EdgeLabel window is LEFT-ANCHORED: center 28.5 from the plate's left edge on every width
                 labelX: (cx, plateW) => cx + 0.47 - (plateW - 1) / 2 + 28.5,
                 labelY: (bottom, fpH) => bottom + 3.72 + fpH - 27,
                 labelZ: (faceZ, dz) => faceZ - 6.3 - dz,
                 // vertical window: the label drops straight down into it
                 labelIn: { rise: 20, back: 0 },
                 accentZ: (faceZ, dz) => faceZ - 7.675 - dz },
    // z = mounting plane 92.57 + 6.2/2 (thinnest family: 4.2 backer + 2 mm
    // chevron face). PREMIUM family (planner card: club ✦ + wrench, the first
    // with both). Essential-like: bolt-on handle + M3 screws (the two holes
    // at plate-center ±22 — Joey's 2026-08-08 page retired the knob version).
    // The face strips ship as ONE `FACE` material zone (many print bodies, one
    // recolorable zone) — renderZoneChips gives Body/Face swatches for free.
    chevron:   { key: 'chevron', node: c => `Faceplate_Chevron_${c}`, z: 95.67, hasHandle: true,
                 label: c => `Chevron Faceplate ${c}`, extras: false, links: links.fpch },
    classicpro: { key: 'classicpro', node: c => `Faceplate_ClassicPro_${c}`, z: 107.32, hasHandle: false,
                 label: c => `Classic Pro Faceplate ${c}`, extras: true, links: links.fpc, // club family — Classic Pro Series pages
                 labelNode: 'Label_ClassicPro', labelName: 'Classic Pro Label (universal)',
                 // pos.y is the part's BOTTOM (exports are bottom-anchored); the
                 // 18.14-tall tilted label sits TOP-FLUSH with the plate
                 labelX: cx => cx + 0.47 - 0.08,
                 labelY: (bottom, fpH) => bottom + 3.72 + fpH - 18.16,
                 labelZ: (faceZ, dz) => faceZ - 0.71 - dz,
                 // ANGLED slot on the grip slope: the label slides in at 45°,
                 // down + back-to-front (Joey 2026-07-13) — main.js
                 // NODE_RITUALS mirrors the same diagonal for the tap ritual
                 labelIn: { rise: 16, back: 16 },
                 accentZ: (faceZ, dz) => faceZ - 10.375 - dz },
  };
  // faceplates are SHARED hardware (same GLBs, every collection pool carries
  // copies, placed −dz like every other front-face part) — all families serve
  // all six lengths
  const face = FACE_FAMILIES[build.faceStyle] || FACE_FAMILIES.essential;
  if (build.faceStyle && !FACE_FAMILIES[build.faceStyle])
    warnings.push(`Faceplates are shown in the Essential style (your "${build.faceStyle}" style isn't modeled yet).`);
  // faceplate back cover: a UNIVERSAL decor-faceplate accessory (every family
  // seats the same per-size part — the GLB family name is historical, from the
  // EdgeLabel exporter blend). Optional: fills the new open-front Decor
  // drawer's gap; off = older closed-front drawers. Shared hardware → −dz.
  const bcOn = !!build.backCover;
  // Feet (2026-08-21, confirmed): printed TPU feet OR adhesive rubber feet -
  // one-for-one alternatives with the same count at the same support spots.
  // The planner's build carries the pick (`feet`); the BOM bills ONLY the
  // chosen option.
  //
  // Both are REAL geometry (2026-08-22). Joey confirmed the bought foot has the
  // same external body and the same height as the printed one and differs ONLY
  // by not carrying the upper dovetail rail - the rail is what seats into the
  // case or lower rail, and a stick-on foot has nothing to seat into. So
  // `Adhesive-Foot` is DERIVED from the printed master by cutting at the
  // rail-base plane (GLB Pipeline/derive_adhesive_foot.py; guarded by
  // test/adhesive-foot.test.mjs), and the finished build stands at the same
  // height either way - which is why the adhesive foot contributes to the
  // published W/H/L envelope exactly like the printed one.
  const adhesiveFeet = build.feet === 'adhesive';
  const FOOT_LABEL = adhesiveFeet ? 'Adhesive rubber foot' : 'Tabletop Kit Foot';
  const FOOT_NODE = adhesiveFeet ? 'Adhesive-Foot' : 'Tabletop-Kit-Foot';
  // Its own TYPE is what gives it a matte rubber finish instead of the
  // identification palette: materials/highlights/palette are all type-keyed, so
  // this costs no new registry, and colour-locking falls out of the row being
  // `purchased`. Emitted ONLY on adhesive builds, so the default manifest (and
  // the ten committed kit goldens) stays byte-identical.
  const FOOT_TYPE = adhesiveFeet ? 'FootAdhesive' : 'Foot';

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

  // handle style from the planner build — all three series modeled (Crystal
  // GLBs landed 2026-07-20; starts at Crystal A, B Wide cycles in the studio
  // like the BlockBar variants). Unknown future families still warn + Deco.
  const HANDLE_STYLES = {
    deco:     { node: 'Handle_Deco',       label: 'Deco Handle',     h: 9,     d: 24,    links: links.h },
    blockbar: { node: 'Handle_BlockBar_A', label: 'BlockBar Handle', h: 9,     d: 9,     links: links.hb },
    crystal:  { node: 'Handle_Crystal_A',  label: 'Crystal Handle',  h: 11.78, d: 19.07, links: links.hc },
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
    // No length sets classicMaxHH since 2026-08-02 (all six ship 3H classics),
    // but the guard stays armed for the next partial catalog — so the ceiling
    // is read from the cap rather than hardcoded, or it would misreport it.
    if (u.fill === 'classic' && coll.classicMaxHH && u.hh > coll.classicMaxHH)
      errors.push(`Classic Drawers only go up to ${H_LABEL[coll.classicMaxHH]}H in the ${L} collection (no ${H}H model) · switch this drawer to Decor, or pick a smaller size.`);
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
  // The top. On a HANGING mount it must be flat against the surface (the rail
  // or bracket course is one line) - and an uneven one is a unit with nothing
  // to hang from, which the support check just reported; the error stays for
  // the message. On a TABLETOP build an unfinished run is NOT an error any
  // more (2026-08-23, Joey): every kit passes through "one column shorter than
  // the tallest" while it is being built, so the manifest carries the deficit
  // and the viewer previews the layout as in progress - ghost boxes over the
  // missing volume, covers translucent until their run is level, no
  // instructions. The deficit comes from the SHARED contract (per contiguous
  // run: separate stacks of different heights are each complete), so the
  // planner's board hatches exactly the cells ghosted here.
  const colTop = new Map();
  for (const u of units) for (let c = u.col; c < u.col + u.w; c++)
    colTop.set(c, Math.max(colTop.get(c) || 0, u.topIdx));
  if (hangs && new Set(colTop.values()).size > 1)
    errors.push(`${isUT ? 'The rails need a flat top row against the surface' : 'The covers need a flat top'} · every column must stack to the same height. Fix the build in the planner first.`);
  const completion = hangs ? null : TABLETOP.completion(build.placed);
  const incomplete = !!completion && !completion.complete;
  // sanity cap: each unit becomes ~9 parts and its own step — beyond this the
  // instructions stop being instructions
  if (units.length > 80)
    errors.push(`This build has ${units.length} units · 3D instructions currently support up to 80. It'll still print and assemble fine; the step-by-step just isn't practical at this size yet.`);
  if (errors.length) return { errors, warnings, manifest: null };

  // ---- build instances + steps ---------------------------------------------
  const inst = [], stages = { base: [0, 110, 0] }, steps = [];
  const bom = new Map(); // node -> {label,type,qty,links,img,purchased}
  // `required` (purchased rows only) = you CANNOT finish the build without it:
  // handle screws, wall/under-table mounting screws. Magnets are excluded on
  // purpose — they're an opt-in closure with "None" right beside it, so a
  // magnet build is still print-and-build-today. That distinction is what the
  // "· N to buy" counter reports (main.js renderChecklist).
  /* `req` is the row's requirement metadata - { requirement, basis?, reasons? }
     built with the SHARED classifiers in GEN2_REQ (viewer/js/vendor/
     requirement-scope.js, vendored byte-for-byte from the planner). This
     generator keeps computing its own geometry, instances and counts; what it
     must never do is restate what core / option / enhancement MEAN. It passes
     the facts it knows (this drawer chose magnets; this build is under-table)
     into the planner-owned constructors and emits whatever comes back.
     ⚠ `required` survives as a DERIVED legacy boolean for readers not yet
     moved, computed by the contract as scope !== 'enhancement' - never set by
     hand here any more, so it cannot disagree with the requirement. */
  // `note`: an optional per-row line the label can't carry (a condition, a
  // warning) — rendered under the label (main.js .cl-note), carried by Copy
  // list + the CSV's Note column, exactly like the static kits' manifest notes.
  const add = (node, label, type, links, n = 1, purchased = false, required = false, req = null, note = null) => {
    if (!bom.has(node)) {
      const img = imgFor(node, type);
      const row = { node, label, type, qty: 0, ...(links ? { links } : {}), ...(img ? { img } : {}),
        ...(purchased ? { purchased } : {}), ...(note ? { note } : {}) };
      if (req && req.requirement) {
        row.requirement = req.requirement;
        // COPY the basis: per-unit rows accumulate selectedCount across calls
        // below, and the caller's object must not be mutated under it. It
        // starts at 0 so the increment after this block counts the first
        // subject exactly once.
        if (req.basis) row.basis = { ...req.basis, ...('selectedCount' in req.basis ? { selectedCount: 0 } : {}) };
        if (req.reasons) row.reasons = req.reasons;
        // the legacy boolean is DERIVED, and `required` passed alongside is ignored
        const derived = REQ.selectedPlanRows([row]).length === 1;
        if (derived) row.required = true;
      } else if (required) {
        row.required = true;   // unmigrated row - the ratchet counts these
      }
      bom.set(node, row);
    }
    const row = bom.get(node);
    row.qty += n;
    // an aggregated per-unit basis keeps counting the subjects that chose it
    if (req && req.basis && typeof req.basis.selectedCount === 'number' && row.basis) {
      row.basis.selectedCount = (row.basis.selectedCount || 0) + req.basis.selectedCount;
    }
  };
  // one foot in the BOM: the printed part, or the purchased alternative
  // (purchased + REQUIRED - a tabletop build cannot stand without its feet)
  const addFoot = () => adhesiveFeet
    ? add(FOOT_NODE, FOOT_LABEL, FOOT_TYPE, { buy: BUY.rubberFeet }, 1, true, true)
    : add(FOOT_NODE, FOOT_LABEL, FOOT_TYPE, links.kit);

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
      add(`UnderTableRail_${L}-${w}W`, `Under-Table Rail ${L}-${w}W`, 'Rail', links.rail, 1, false, false, mountCore('mount.install'));
      // screws: one x-position at each rail end (inset 5) + every internal 88 mm
      // seam, × 2 depth rows (front/back) → 2(W+1) per tile = planner railScrews(w).
      // Pitched 90° about X so they stand tip-up into the surface. The model
      // is the #6 × 3/4" SCREW_UT (not the wall's 31.8 mm WoodScrew — that one
      // went straight through a 25 mm top).
      const xs = [-(44 * w - UT.screwInset)];
      for (let i = 1; i < w; i++) xs.push(-44 * w + 88 * i);
      xs.push(44 * w - UT.screwInset);
      for (const lx of xs) for (const z of [utScrewBackZ, utScrewFrontZ]) {
        const sid = `uts${utScrewIds.length}`;
        utScrewIds.push(sid);
        inst.push({ id: sid, node: SCREW_UT.node, pos: [railX(t) + lx, flatTopY + UT.screwY, z], rot: [90, 0, 0] });
        add(SCREW_UT.node, SCREW_UT.label, 'Screw', { ...links.rail, buy: BUY.railScrews }, 1, true, true, mountCore('mount.install'), SCREW_UT.note); // purchased + core: the rail can't mount without them
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
      add(`WallMount_Lite_${w}W`, `Wall Mount Lite ${w}W`, 'Bracket', links.wall, 1, false, false, mountCore('mount.install'));
      c += w;
    }
    for (let c = 0; c < totalW; c++) for (const dx of [-WALL.screwDX, WALL.screwDX]) {
      const id = `sc${screwIds.length}`;
      screwIds.push(id);
      inst.push({ id, node: 'WoodScrew', pos: [colCenter(c) + dx, pegY, WALL.screwZ + dz] });
      // The wall keeps the 31.8 mm model as an ILLUSTRATION, never a length
      // spec: wall guidance is deliberately separate from the under-table
      // default (Joey, 2026-08-23) because the right screw or anchor depends
      // on the wall material - the note says so on the row.
      add('WoodScrew', 'Wood Screw', 'Screw', { ...links.wall, buy: BUY.woodScrews }, 1, true, true, mountCore('mount.install'),
        'Hardware store item · length and anchors depend on the wall material; the 1-1/4" screw shown is an illustration.'); // purchased + core: nothing hangs without them
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
      inst.push({ id: id2, node: FOOT_NODE, pos: [x, 0, z], yaw: z < 0 ? 90 : 270, stage: 'base' });
      addFoot();
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
          inst.push({ id: id2, node: FOOT_NODE, pos: [railX(r) + lx, 0, z], yaw, stage: 'base' });
          addFoot();
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

  // ---- QuickLock dip-and-pop (ground truth: the 2026-08-24 spring video) ----
  // A seated QuickLock's tab is pressed DOWN while a unit's channel slides
  // over it and springs UP into the keyhole at full seat. `dipFrom(travel)` =
  // the fraction of the slide at which the slider's leading edge first covers
  // a tab: the leading edge always ENDS at depth/2 and the tab sits at qlZ,
  // so the geometry is identical in every mount and for the covers.
  const qlZ = 65.02 - dz;
  const dipFrom = travel => Math.min(0.92, Math.max(0.1, 1 - (depth / 2 - qlZ - 10) / travel));
  const dipItems = (ids, travel) => ids.map(id => ({ id, from: dipFrom(travel) }));
  const popItems = ids => ids.map(id => ({ id }));
  // The QuickLocks DIRECTLY UNDER `u` whose tabs lie inside u's span - the
  // ones u's bottom channel actually presses during its slide. Per-TAB filter:
  // a partially-overlapped supporter can have one tab under u and one outside.
  const qlsUnder = u => {
    const uL = spanCenter(u) - u.w * PITCH_X / 2 - 1, uR = spanCenter(u) + u.w * PITCH_X / 2 + 1;
    const out = [];
    units.forEach((v, j) => {
      if (v.topIdx !== u.rowIdx) return;
      const vL = spanCenter(v) - v.w * PITCH_X / 2, vR = spanCenter(v) + v.w * PITCH_X / 2;
      if (vL + 3.88 >= uL && vL + 3.88 <= uR) out.push(`ql${j}L`);
      if (vR - 3.45 >= uL && vR - 3.45 <= uR) out.push(`ql${j}R`);
    });
    return out;
  };
  const clIds = [], cuIds = [];         // cover ids (wall: filled per top case; tabletop: in the cover section)
  const caseSteps = [];
  // staggered wall: the top row is assembled and hung as ONE unit — collect the
  // per-case bench placements + members here; the cover + hang are built after.
  const topPlacements = [], topMembers = [];
  const stagHang = { title: 'Hang the top row on the pegs', _stoppers: [], phases: [] };
  let stagCoverStep = null;

  /* The cover FACTS, established once before any cover row is emitted. Which
     runs get covers depends on mount: a staggered wall covers the whole top
     row as one run; otherwise each top case is its own run. A run wider than
     2W needs the two-layer stagger (lower layer structurally required). Any
     drawer that keeps at least one stopper pair seats those into the CL. */
  {
    const topUnits = units.filter(u => u.topIdx === maxTop);
    /* ⚠ RUN WIDTH IS THE CONTIGUOUS TOP RUN, NOT THE PER-CASE WIDTH. The first
       version used each top case's own width and classified the 3W starter's
       Cover Lower as option while the planner said core - caught by the
       cross-tool parity check. The planner's ctx.runs spans contiguous top
       columns, and brickTiling(3) on that run is the staggered 1W+2W tiling
       whose lower layer ties the sections together. This generator tiles the
       SAME pieces (CL-2W + CL-1W) but had asked the question per case. The
       fact must be gathered the way the owner of the policy gathers it. */
    const topCols = new Set();
    topUnits.forEach(u => { for (let c = u.col; c < u.col + u.w; c++) topCols.add(c); });
    const contiguousRuns = [];
    for (let c = 0, run = null; c < totalW; c++) {
      if (topCols.has(c)) { if (!run) contiguousRuns.push(run = { w: 1 }); else run.w++; }
      else run = null;
    }
    const runWidths = isStaggered ? [totalW] : contiguousRuns.map(r => r.w);
    const anyDrawerStoppers = units.some(u =>
      (u.fill === 'decor' || u.fill === 'classic') &&
      Array.from({ length: u.w }, (_, k) => u.col + k).some(c => !stopperOff(u, c)));
    coverFacts = {
      staggerRequired: runWidths.some(w => w > 2),
      hasStoppers: anyDrawerStoppers,
    };
  }

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
      // ⚠ OPTION rows, classified by the SHARED contract, not by this file: they
      // exist only because THIS drawer chose magnetic closure. Per-unit basis,
      // so add() accumulates selectedCount across the drawers that opted in -
      // the shared BOM stores totals; which drawer stays in the instances above.
      const magReq = {
        requirement: REQ.option('drawer.closure', 'drawer.closure.magnet'),
        basis: REQ.basis('drawer.closure', 'magnet', 'unit', 1),
      };
      add('MagnetClip_10x2mm', 'Magnet Clip 10×2', 'MagnetClip', links.hw, 2, false, false, magReq);
      add('Magnet_10x2mm', 'Magnet 10×2 mm', 'Magnet', { buy: BUY.magnets }, 2, true, false, magReq);
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
        add(`CL-${L}-${t.w}W`, `Cover Lower ${L}-${t.w}W`, 'CoverL', links.covers, 1, false, false, coverReq('lower'));
      }
      for (const t of tileOut(run, tilesUpper(u.w))) {
        const id = `cu${cuIds.length}`; cuIds.push(id); cuLocal.push(id);
        inst.push({ id, node: `CU-${L}-${t.w}W`, pos: [railX(t), flatTopY + 4.3, 0], ...stg });
        add(`CU-${L}-${t.w}W`, `Cover Upper ${L}-${t.w}W`, 'CoverU', links.covers, 1, false, false, coverReq('upper'));
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
        add('Drawer_Stoppers_L', 'Drawer Stopper L', 'Stopper', links.hw, 1, false, false, STOPPER_REQ);
        add('Drawer_Stoppers_R', 'Drawer Stopper R', 'Stopper', links.hw, 1, false, false, STOPPER_REQ);
        stopIds.push(idL, idR);
      }
      members.push(...coverIds, ...stopIds); // all ride the hang together

      // bench assembly, in physical order (CL → stoppers → CU)
      const bench = [
        { enter: [{ id: `case${i}`, from: [0, 45, 0] }] },
        { enter: [{ id: `ql${i}L`, from: [0, 45, 0] }, { id: `ql${i}R`, from: [0, 45, 0] }] },
      ];
      if (mcId) bench.push({ enter: [{ id: mcId, from: [0, 35, 0] }, { id: mgId, from: [0, 0, -30] }] });
      bench.push({ enter: clLocal.map(id => ({ id, from: [0, 0, -WALL.coverSlide] })), dip: dipItems([`ql${i}L`, `ql${i}R`], WALL.coverSlide) });
      bench.push({ pop: popItems([`ql${i}L`, `ql${i}R`]) });
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
          { move: members.map(id => ({ id, by: [0, 0, -UT.fwd] })), dip: dipItems([`ql${i}L`, `ql${i}R`], UT.fwd) },
          { pop: popItems([`ql${i}L`, `ql${i}R`]) },
        ];
        step.note = 'Fit the QuickLocks first (L left, R right)' + (mcId ? ', snap in the magnet clip,' : ',')
          + ' then slide the case straight back under the surface · its top rails ride into the rail channels until it stops.';
      } else {
        // pre-assembled one-piece slide-in, same read as wall lower rows
        step.phases = [
          { sync: true, enter: members.map(id => ({ id, from: [0, 0, UT.fwd] })), dip: dipItems([`ql${i}L`, `ql${i}R`], UT.fwd) },
          { pop: popItems([`ql${i}L`, `ql${i}R`]) },
        ];
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
      step.phases = [
        { sync: true, enter: members.map(id => ({ id, from: [0, 0, wallFwd] })), dip: dipItems([`ql${i}L`, `ql${i}R`], wallFwd) },
        { pop: popItems([`ql${i}L`, `ql${i}R`]) },
      ];
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
    else if (!isBase) {
      // the settle is the back-to-front slide over the row below: that row's
      // QuickLock tabs dip under this case's channel and click up at full seat
      const dips = qlsUnder(u);
      if (dips.length) {
        step.phases.push({ settle: st, dip: dipItems(dips, Math.abs(slideBack)) }, { pop: popItems(dips) });
      } else step.phases.push({ settle: st });
      steps.push(step);
    }
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
      add(`CL-${L}-${t.w}W`, `Cover Lower ${L}-${t.w}W`, 'CoverL', links.covers, 1, false, false, coverReq('lower'));
    }
    for (const t of tileOut(run, tilesUpper(totalW))) {
      const id = `cu${cuIds.length}`; cuIds.push(id); cuLocal.push(id);
      inst.push({ id, node: `CU-${L}-${t.w}W`, pos: [railX(t), flatTopY + 4.3, 0], stage: 'wtop' });
      add(`CU-${L}-${t.w}W`, `Cover Upper ${L}-${t.w}W`, 'CoverU', links.covers, 1, false, false, coverReq('upper'));
    }
    // stoppers into the CL for each top-row drawer column (before the CU caps them)
    units.filter(u => u.topIdx === maxTop && (u.fill === 'decor' || u.fill === 'classic')).forEach(u => {
      for (let c = u.col; c < u.col + u.w; c++) {
        if (stopperOff(u, c)) continue; // user removed this 1W's stopper pair
        const lx = colCenter(c), idL = `tst${c}L`, idR = `tst${c}R`, sk = `${u.id}:${c - u.col}`;
        inst.push({ id: idL, node: 'Drawer_Stoppers_L', pos: [lx - 12.6, flatTopY - 2, 76.5 - dz], stopperKey: sk, stage: 'wtop' });
        inst.push({ id: idR, node: 'Drawer_Stoppers_R', pos: [lx + 12.4, flatTopY - 2, 76.5 - dz], stopperKey: sk, stage: 'wtop' });
        add('Drawer_Stoppers_L', 'Drawer Stopper L', 'Stopper', links.hw, 1, false, false, STOPPER_REQ);
        add('Drawer_Stoppers_R', 'Drawer Stopper R', 'Stopper', links.hw, 1, false, false, STOPPER_REQ);
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
      phases: (() => {
        const topQls = [];
        units.forEach((v, j) => { if (v.topIdx === maxTop) topQls.push(`ql${j}L`, `ql${j}R`); });
        return [
          { enter: clLocal.map(id => ({ id, from: [0, 0, -WALL.coverSlide] })), dip: dipItems(topQls, WALL.coverSlide) },
          { pop: popItems(topQls) },
          ...(stopIds.length ? [{ enter: stopIds.map(id => ({ id, from: [0, 35, 0] })) }] : []),
          { enter: cuLocal.map(id => ({ id, from: [0, 0, -WALL.coverSlide] })) },
        ];
      })(),
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
      add('Drawer_Stoppers_L', 'Drawer Stopper L', 'Stopper', links.hw, 1, false, false, STOPPER_REQ);
      add('Drawer_Stoppers_R', 'Drawer Stopper R', 'Stopper', links.hw, 1, false, false, STOPPER_REQ);
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
  // A run is a contiguous span of occupied columns; its covers sit at the
  // run's TARGET top (its tallest column). On a level run that is every
  // column's top, exactly as before; on an in-progress run it is the intended
  // flat top, and every tile whose footprint touches a short column is
  // `planned` - the viewer renders it translucent, because it cannot attach
  // until that column is built up (a tile wholly over level columns stays
  // normal; it is installable today).
  const shortCols = new Set(incomplete ? completion.columns.map(c => c.x - minCol) : []);
  const coverRuns = [];
  for (let c = 0, run = null; !hangs && c < totalW; c++) {
    const t = bottomCols.size ? topOf(c) : 0;
    const occupied = units.some(v => c >= v.col && c < v.col + v.w);
    if (occupied && run && run.c1 === c - 1) { run.c1 = c; run.top = Math.max(run.top, t); }
    else if (occupied) coverRuns.push(run = { c0: c, c1: c, top: t });
    else run = null;
  }
  const plannedTile = t => [...Array(t.w).keys()].some(k => shortCols.has(t.col + k));
  coverRuns.forEach(r => {
    const n = r.c1 - r.c0 + 1;
    const clY = row0 + r.top * PITCH_HALF_Y;
    // CL/CU brick-stagger like the rails: seams offset so the CU ties the CLs
    // (and the cases under them) together — planner brickTiling() rule.
    for (const t of tileOut(r, tilesLower(n))) {
      const i = clIds.length;
      inst.push({ id: `cl${i}`, node: `CL-${L}-${t.w}W`, pos: [railX(t), clY, 0], ...(plannedTile(t) ? { planned: true } : {}) });
      clIds.push(`cl${i}`);
      add(`CL-${L}-${t.w}W`, `Cover Lower ${L}-${t.w}W`, 'CoverL', links.covers, 1, false, false, coverReq('lower'));
    }
    for (const t of tileOut(r, tilesUpper(n))) {
      const i = cuIds.length;
      inst.push({ id: `cu${i}`, node: `CU-${L}-${t.w}W`, pos: [railX(t), clY + 4.3, 0], ...(plannedTile(t) ? { planned: true } : {}) });
      cuIds.push(`cu${i}`);
      add(`CU-${L}-${t.w}W`, `Cover Upper ${L}-${t.w}W`, 'CoverU', links.covers, 1, false, false, coverReq('upper'));
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
      drawerPhases.push({ enter: [{ id: `drw${i}`, at: [0, 0, drwPop], from: [0, 0, 60] }] });
      if (hasMag) drawerPhases.push(
        { enter: [{ id: `dc${i}`, at: [0, 35, drwPop], from: [0, 30, 0] }] },
        { enter: [{ id: `dm${i}`, at: [0, 35, drwPop], from: [0, 0, 30] }] },
        { move: [{ id: `dc${i}`, by: [0, -35, 0] }, { id: `dm${i}`, by: [0, -35, 0] }] },
      );
      drawerPhases.push({ move: [{ id: `drw${i}`, by: [0, 0, -drwPop] }, ...magIds.map(m => ({ id: m.id, by: [0, 0, -drwPop] }))] });
    } else {
      if (hasMag) drawerFades.push({ id: `dc${i}` }, { id: `dm${i}` });
      drawerPhases._laterDrawers = (drawerPhases._laterDrawers || []).concat({ id: `drw${i}`, from: [0, 0, drwPop + 10] });
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
      // the cover files ship inside every faceplate series download (v2602+),
      // so the row links the active family's page — mirrors the planner's linkAs
      add(`BackCover_EdgeLabel_${u.w}W-${H}H`, `Faceplate Back Cover ${u.w}W-${H}H`, 'BackCover', face.links);
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
        inst.push({ id: `fa${i}`, node: `Accent_EdgeLabel_${code}`, rot: [0, 0, 180], pos: [cx + 0.47, bottom + 3.77 + (fpH - 27.2), face.accentZ(face.z, dz)], rides: `drw${i}` });
        add(`Accent_EdgeLabel_${code}`, `EdgeLabel Accent ${code}`, 'Accent', null);
      }
      inst.push({ id: `fl${i}`, node: face.labelNode, pos: [face.labelX(cx, u.w * PITCH_X), face.labelY(bottom, fpH), face.labelZ(face.z, dz)], rides: `drw${i}` });
      add(face.labelNode, face.labelName, 'Label', null);
    }
    if (face.hasHandle) {
      // handle: back face against the faceplate front, vertically centered on
      // the plate — the mounting rule that holds for every style (from the Deco
      // ground truth: bottom = fp + 22.49, z-center 109.57 for h9 × d24).
      // EdgeLabel prints its grip into the plate — no bolt-on handle at all.
      inst.push({ id: `h${i}`, node: handleStyle.node, pos: [cx + 0.46, bottom + 3.72 + (fpH - handleStyle.h) / 2 - 0.5, 97.57 - dz + handleStyle.d / 2], rides: `drw${i}` });
      // 2× M3-6 button head, driven in from BEHIND the plate to fasten the
      // handle. Offsets are faceplate-CENTRE-relative, DERIVED from the posed
      // Essential 1W-1H reference (2026-07-24 handoff): ±22 mm apart (the
      // handle's mount-hole pitch), vertically centred +0.49, and 1.88 mm
      // behind the plate's depth centre so the heads sit proud of the back
      // face — where the optional back cover then hides them. `pos` is
      // [x-centre, y-BOTTOM, z-centre] and the GLB carries its shank along
      // depth like WoodScrew, so no rotation is needed.
      // …then nudged onto the holes by eye in the viewer (Joey 2026-07-24):
      // 1.5 down, 4 forward from the handoff's derived numbers.
      const fpMidY = bottom + 3.72 + fpH / 2, fpMidZ = face.z - dz;
      for (const [n, sx] of [[0, -21.99], [1, 22.02]])
        inst.push({ id: `hs${i}_${n}`, node: SCREW_M3.node,
          pos: [cx + 0.47 + sx, fpMidY - 1.01 - SCREW_M3.h / 2, fpMidZ + 2.12], rides: `drw${i}` });
    }
    add(face.node(code), face.label(code), 'Faceplate', face.links);
    if (face.hasHandle) {
      add(handleStyle.node, handleStyle.label, 'Handle', handleStyle.links);
      // purchased hardware: excluded from the print count, "×N · buy",
      // color-locked steel (main.js colorLocked) — mirrors WoodScrew/magnets
      add(SCREW_M3.node, SCREW_M3.label, 'Screw', { buy: BUY.handleScrews }, 2, true, true); // REQUIRED: no screws, no handle
    }
    if (firstFpDemo === null) {
      firstFpDemo = i;
      const hasAccent = face.extras && u.hh !== 1;
      const homeMove = { move: [ // everyone glides home together at the end
        { id: `drw${i}`, by: [0, 0, -40] }, ...magIds.map(m => ({ id: m.id, by: [0, 0, -40] })),
        ...(bcOn ? [{ id: `bc${i}`, by: [0, 0, -40] }] : []),
        { id: `fp${i}`, by: [0, 0, -40] },
        ...(hasAccent ? [{ id: `fa${i}`, by: [0, 0, -40] }] : []),
        ...(face.extras ? [{ id: `fl${i}`, by: [0, 0, -40] }] : []),
        ...(face.hasHandle ? [{ id: `h${i}`, by: [0, 0, -40] },
          ...[0, 1].map(n => ({ id: `hs${i}_${n}`, by: [0, 0, -40] }))] : []),
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
      // Behind-the-plate shot for the handle screws + back cover. Was near
      // straight-on (t 168), which flattened the screws into discs — a 3/4
      // angle shows the threads and the plate's back detail (Joey 2026-07-24),
      // and the tighter fitR brings the hardware close enough to read.
      const camBack = { t: 143, p: 76, fitR: fitR * 0.72, target: pc };
      const unit = [ // the plate + its dressing — everything that slides down as one
        { id: `fp${i}` },
        ...(face.hasHandle ? [{ id: `h${i}` }, ...[0, 1].map(n => ({ id: `hs${i}_${n}` }))] : []),
        ...(hasAccent ? [{ id: `fa${i}` }] : []),
        ...(face.extras ? [{ id: `fl${i}` }] : []),
        ...(bcOn ? [{ id: `bc${i}` }] : []),
      ];
      fpDemo.push(
        { move: [{ id: `drw${i}`, by: [0, 0, 40] }, ...magIds.map(m => ({ id: m.id, by: [0, 0, 40] }))] },
        { vanish: true, room: 0, camera: camFront },                              // world away → the assembly stage
        { enter: [{ id: `fp${i}`, at: [0, HOV, 40], from: [0, 30, 0] }] },        // the bare plate floats in
        // Each dressing piece is ONE continuous swoop (enter + `via` waypoints,
        // arc-length eased in main.js): approach and press-on used to be
        // separate phases, and easing to a dead stop between them read as a
        // weird mid-air stall (Joey 2026-07-13). The `at` + via net still
        // lands each piece exactly at the unit hover, so nothing downstream
        // (unit slide-down, homeMove) changes.
        ...(face.hasHandle ? [
          // handle arrives out front and presses on (2× M3)
          { enter: [{ id: `h${i}`, at: [0, HOV, 55], from: [0, 0, 30], via: [[0, 0, -15]] }] },
        ] : []),
        ...(hasAccent ? [
          // accent arrives riding low, in 20 (its removal ritual, reversed), up 4 onto its clips
          { enter: [{ id: `fa${i}`, at: [0, HOV - 4, 60], from: [0, 0, 30], via: [[0, 0, -20], [0, 4, -20]] }] },
        ] : []),
        ...(face.extras ? [
          // label hovers over its seat (up `rise`, and `back` behind it for the
          // Classic Pro slope slot), then slides in — straight down for the
          // EdgeLabel window, a 45° down-and-forward glide for Classic Pro
          { enter: [{ id: `fl${i}`, at: [0, HOV + face.labelIn.rise, 40 - face.labelIn.back], from: [0, 25, 0], via: [[0, -face.labelIn.rise, face.labelIn.back]] }] },
        ] : []),
        // Behind the plate: the handle screws go in, then the back cover that
        // hides their heads. One camera swing serves both (Joey 2026-07-24) —
        // the screws are the reason a bolt-on handle needs bought hardware, so
        // the step shows them rather than leaving the handle magically fixed.
        ...(face.hasHandle || bcOn ? [{ camera: camBack }] : []),
        ...(face.hasHandle ? [
          // both screws drive forward 30 mm into the plate, together. `at` is
          // the same [0, HOV, 40] every other dressing piece lands on (the
          // drawer is popped 40 forward while the unit assembles) — miss it and
          // the step's net stops cancelling and prev/jump lands them 40 back.
          // `spin` turns each screw about its own shank on the way in, so it
          // reads as threading rather than sliding into place
          { enter: [0, 1].map(n => ({ id: `hs${i}_${n}`, at: [0, HOV, 40], from: [0, 0, -30], spin: 3 })), sync: true },
        ] : []),
        ...(bcOn ? [
          // cover arrives behind riding high, forward 20 against the plate back, down 4 onto its hooks
          { enter: [{ id: `bc${i}`, at: [0, HOV + 4, 20], from: [0, 0, -35], via: [[0, 0, 20], [0, -4, 20]] }] },
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
      if (face.hasHandle) {
        fpFades.push({ id: `h${i}` });
        for (const n of [0, 1]) fpFades.push({ id: `hs${i}_${n}` });
      }
    }
  });

  if (classicCount) warnings.push('Classic drawers are placed from measured part geometry (back-aligned with the calibrated Decor drawer) - no assembled ground truth yet · verify the fit on a printed build.');
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
      note: 'Hold each rail flat against the underside · channels facing down, the long overhang toward the back · and drive the #6 × 3/4" wood screws up through the plate: one at each end and at every seam line, in the front and back rows. A 3/4" screw reaches about 16 mm into the top, so check the surface is thick enough first. The rail is the stationary part; every case slides into it.',
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
      title: adhesiveFeet ? `Bench: stick on the ${nFeet} feet` : `Bench: insert the ${nFeet} feet`,
      note: (adhesiveFeet
        ? 'Adhesive rubber feet: peel each one and press it onto the flat pad around each slot, same count and same spots as the printed feet. The bought foot is the printed one without its dovetail rail, so the build stands at exactly the same height.'
        : 'Feet slide into the slots under the case, lengthwise: front feet snap in back-to-front, rear feet front-to-back.') +
        (bottomUnits[0].w > 1 ? ' Where the middle slots sit close together, fill just one per row.' : ''),
      camera: cam(spanCenter(bottomUnits[0]), 125, totalW, gridBottom, FIT),
      // adhesive feet are PRESSED ON, not slid in - they have no rail to enter a
      // slot with, so they rise straight onto the pad. (The whole base is staged
      // 110 mm up at this step, so there is nothing below to clip.)
      phases: adhesiveFeet ? [
        { enter: feetIds.back.map(id => ({ id, from: [0, -18, 0] })) },
        { enter: feetIds.front.map(id => ({ id, from: [0, -18, 0] })) },
      ] : [
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
      title: adhesiveFeet ? `Bench: stick on the ${nFeet} feet` : `Bench: insert the ${nFeet} feet`,
      note: (adhesiveFeet
        ? 'Adhesive rubber feet: peel each one and press it onto the flat pad around each lower-rail slot, same count and same spots as the printed feet. The bought foot is the printed one without its dovetail rail, so the build stands at exactly the same height.'
        : 'Pointy end slides in first · outer feet toward the rail ends, middle feet left to right.') +
        (rails.length > 1 ? ' Where two rails meet, install that slot pair on ONE rail only.' : ''),
      camera: cam(0, 115, totalW, gridBottom, FIT),
      // pressed on, not slid in - see the case-feet step above
      phases: adhesiveFeet ? [
        { enter: feetIds.back.map(id => ({ id, from: [0, -18, 0] })) },
        { enter: feetIds.front.map(id => ({ id, from: [0, -18, 0] })) },
      ] : [
        { enter: feetIds.back.map((id, n) => ({ id, from: [n === 0 ? 30 : -30, 0, 0] })) },
        { enter: feetIds.front.map((id, n) => ({ id, from: [n === 0 ? 30 : -30, 0, 0] })) },
      ],
    },
    setDownStep,
    {
      title: uppers.length > 1 ? 'Upper footrails' : 'Upper footrail',
      note: 'Each upper footrail slides on from the back, all the way forward until it stops.' +
        (uppers.length > 1 ? ' The upper sections are staggered brick-style over the lower ones, tying the base together.'
        // narrow builds tile ONE piece per layer, so the two-layer design reads as
        // pointless doubling-up ("why not one thick rail?" — Joey's most-asked
        // question). Name the real reason instead of leaving it unexplained.
          : ' The two layers are one system: the lower rail holds the feet, the upper caps them and carries the case dovetails - and on wider builds their seams offset brick-style to tie sections together.'),
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
      phases: (() => {
        const topQls = [];
        units.forEach((v, j) => { if (v.topIdx === maxTop) topQls.push(`ql${j}L`, `ql${j}R`); });
        return [
          { enter: clIds.map(id => ({ id, from: [0, 0, slideBack] })), dip: dipItems(topQls, Math.abs(slideBack)) },
          { pop: popItems(topQls) },
          ...(coverStoppers.length ? [{ enter: coverStoppers.flatMap(e => e.enter) }] : []),
        ];
      })(),
    });
    postSteps.push({
      title: cuIds.length > 1 ? 'Upper covers' : 'Upper cover',
      note: 'The upper covers slide in from the back, onto the lower covers’ dovetails.' +
        (cuIds.length > 1 ? ' Their seams are staggered brick-style over the lower covers’ seams, locking the sections together.'
        // same rule as the upper footrail note above — at ≤2W both layers are a
        // single tile, so spell out why the cover is two parts
          : ' They’re not a doubling-up: the lower cover carries the stopper slots and dovetails, and this one locks them in - on wider builds the two layers’ seams also offset to tie sections together.'),
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
    // What the user actually assembles before the plate goes on: dressing
    // (EdgeLabel / Classic Pro), or a bolt-on handle (Essential), or NOTHING —
    // the free Classic family prints its grip in and takes no dressing, so it
    // has no assembly step to describe. With nothing to assemble the
    // "Assemble the faceplate first:" preamble becomes an empty sentence and
    // there is no "assembled" unit to slide on, so both are replaced rather
    // than left dangling. The three dressed families stay byte-identical.
    const dress = face.extras
      ? (face.key === 'classicpro'
        ? 'press the accent panel into the face and lay the label onto the grip slope'
        : 'press the accent panel into the face and slide the label into its window')
      // the screws are shown going in from behind, so the note says where
      // plastic threads strip easily — say so where the screws go in
      : face.hasHandle
        ? `hold the ${handleStyle.label} against the front and thread 2× M3×6 button head screws in from behind the plate · go gently and stop as soon as they seat, the screws bite straight into plastic and will strip if you overtighten`
        : '';
    // on a bare plate the back cover IS the whole sub-assembly, so it leads
    const bcClause = bcOn ? (dress ? ', then clip the back cover in from behind' : 'clip the back cover in from behind') : '';
    const prep = dress || bcClause
      ? `Assemble the faceplate first: ${dress}${bcClause}. `
      : "The faceplate prints complete - its grip is part of the plate, so there's nothing to bolt on and no hardware to buy. ";
    postSteps.push({
      title: face.hasHandle ? 'Faceplates & handles' : 'Faceplates',
      // assembly-first (Joey): build the plate unit, THEN slide it onto the
      // drawer — the note follows each family's dressing in demo order
      note: prep +
        `Pop a drawer out about 40 mm, slide the ${dress || bcClause ? 'assembled ' : ''}faceplate DOWN onto the drawer front until it snaps, then push the drawer home.` +
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
    // FootAdhesive rides in only when it exists, so a printed-feet build emits
    // exactly the colours it always did. Dark neutral RUBBER, not the
    // identification purple: it is a bought item shown in its real finish.
    // PICKED OFF A RENDER LADDER on both stages (#33353b / #3f424a / #4a4d56 /
    // #565a63): the two darkest vanish against the dark stage's floor, the
    // lightest starts reading as grey plastic, and this one is dark rubber on
    // the light stage while staying legible on the dark one. Faking it via
    // DARK_STAGE_PALETTE was rejected - that would contradict the "shown in its
    // real finish" promise the colour-locked tooltip makes about a bought item.
    colors: adhesiveFeet ? { ...COLORS, FootAdhesive: '#4a4d56' } : COLORS,
    parts: [...bom.values()],
    instances: inst,
    stages,
    steps: [...preSteps, ...caseStepOrder, ...postSteps],
  };
  if (incomplete) {
    /* IN-PROGRESS PREVIEW (2026-08-23). The layout is valid but one or more
       runs are not level yet. The manifest carries:
       - `incomplete`: the deficit in the planner's own terms - `areas` is the
         count a person sees (4-connected regions of missing cells, from the
         shared contract), never the number of boxes it takes to draw them;
       - `ghosts`: one translucent box per short COLUMN, in viewer millimetres,
         with `halfRows` so the viewer can draw the 0.5H grid inside it (the
         volume reads as space to fill, never as a particular drawer - a 1H, two
         0.5H or any other fit all complete it). Not parts: never in `parts`,
         `instances`, the bounds or a raycast;
       - ONE step that simply places everything (no motion, no assembly). The
         viewer hides every instruction surface in this mode, so this is a
         state carrier, not a page anyone reads as "step 1 of 1". Staged
         subassemblies are un-staged so each part's `pos` is final. */
    const ghosts = completion.columns.map(c => {
      const col = c.x - minCol, n = c.y1 - c.y0;
      return {
        pos: [colCenter(col), row0 + (gridBottom - c.y1) * PITCH_HALF_Y, 0],
        size: [PITCH_X, n * PITCH_HALF_Y, depth],
        halfRows: n,
      };
    });
    for (const i of inst) delete i.stage;
    // the parts list still bills the intended covers (they are the kit's), but a
    // row with a planned tile says so - the same `note` line the feet rows use
    for (const p of manifest.parts)
      if (inst.some(i => i.node === p.node && i.planned)) p.note = 'Planned · attaches once every column in its run reaches the top';
    manifest.incomplete = { areas: completion.areas.length, cells: completion.cells.length, columns: completion.columns.length };
    manifest.ghosts = ghosts;
    manifest.steps = [{
      title: 'Finish the top',
      note: `This layout is still in progress · fill the outlined space in the planner (${completion.areas.length === 1 ? 'one area' : completion.areas.length + ' areas'}) so every column supports the top cover - any drawer combination that fits. The translucent covers attach once their run is level.`,
      camera: { ...cam(0, H_MM * 0.45, totalW, gridBottom, FIT) },
      preview: true,
      phases: [{ enter: inst.map(i => ({ id: i.id, from: [0, 0, 0] })), sync: true }],
    }];
  }
  return { errors, warnings, manifest };
}

// part image for the identify card / checklist — same renders as the planner BOM
function imgFor(node, type) {
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
  // under-table rails: per-length + per-width renders (2026-07-19 batch, all six
  // lengths) — flat "Rails <L>-<w>W.png", same art as the planner's BOM rows
  if ((m = node.match(/^UnderTableRail_(\d+)-(\d)W$/))) return `img/parts/Rails ${m[1]}-${m[2]}W.png`;
  // decor handles: per-variant renders named by node (2026-07-20 batch —
  // Deco, BlockBar A–F, Crystal A/B) — lights up the handle BOM rows
  if (node.startsWith('Handle_')) return `img/parts/${node}.png`;
  // mirror parts: the R render is the L one flipped horizontally (2026-07-10)
  if (node === 'QuickLock-R') return 'img/parts/QuickLock-R.png';
  if (node.startsWith('QuickLock')) return 'img/parts/QuickLock.png';
  if (node.startsWith('Drawer_Stoppers')) return 'img/parts/Drawer Stopper.png';
  if (node === 'MagnetClip_10x2mm') return 'img/parts/Magnet Clip.png';
  if (node === 'Magnet_10x2mm') return 'img/parts/Magnets.png';
  // TPU foot — ONE universal render: the foot is length-agnostic (it seats in
  // the foot rail / case underside slots, which are the same on every
  // collection), so there's no per-length set like the cases or drawers.
  if (node === 'Tabletop-Kit-Foot') return 'img/parts/TPU Foot.png';
  // The bought adhesive foot has no photograph yet, and the printed foot's
  // render is the wrong product under the label "Adhesive rubber foot". Returning
  // null degrades gracefully - the BOM row omits img, the identify card hides
  // its <img> - and matches the MODULITH site, which also shows no stand-in.
  if (node === 'Adhesive-Foot') return null;
  // handle fastener (2026-07-24) — rendered at full thread detail, unlike the
  // deliberately decimated GLB
  if (node === 'ButtonHeadScrew_M3-6') return 'img/parts/ButtonHeadScrew_M3-6.png';
  // the under-table rail screw (2026-08-23) — same recipe: full-detail render
  // of the #6 × 3/4" model, from the Screws exporter blend's TrueIsoCam rig
  if (node === SCREW_UT.node) return `img/parts/${SCREW_UT.node}.png`;
  if (node.startsWith('Faceplate_Essential')) return 'img/parts/Faceplate-Essential.jpg';
  // EdgeLabel plates have per-size renders (2026-07-08 batch) — shared
  // hardware, so one 18-file set serves every collection
  if ((m = node.match(/^Faceplate_EdgeLabel_(\dW-\d+H)$/))) return `img/parts/EdgeLabel_${m[1]}.png`;
  // Classic Pro plates have per-size renders too (2026-07-13 batch)
  if ((m = node.match(/^Faceplate_ClassicPro_(\dW-\d+H)$/))) return `img/parts/ClassicPro_${m[1]}.png`;
  // the free Classic series (2026-07-25 batch). ANCHORED on purpose — a loose
  // startsWith('Faceplate_Classic') would swallow the Classic Pro plates above
  if ((m = node.match(/^Faceplate_ClassicDecor_(\dW-\d+H)$/))) return `img/parts/ClassicDecor_${m[1]}.png`;
  // the free Chevron series (2026-08-08 batch)
  if ((m = node.match(/^Faceplate_Chevron_(\dW-\d+H)$/))) return `img/parts/Chevron_${m[1]}.png`;
  // universal faceplate back covers: per-size renders (2026-07-13 batch) —
  // the node's family name is historical, the render set serves every family
  if ((m = node.match(/^BackCover_EdgeLabel_(\dW-\d+H)$/))) return `img/parts/BackCover_${m[1]}.png`;
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

// ---- ?part= product-preview resolver (2026-08-19) ---------------------------
// The MODULITH site embeds this viewer per part page (?part=<slug>&mode=preview,
// iframe). The URL carries the SITE'S frozen /parts/ slug — never a GLB node
// name (node names have a rename history; the slugs are frozen by the site's
// URL-permanence law). Resolution is viewer-owned and derived from the REAL
// generator: each slug maps to a minimal PROBE build, generateManifest runs on
// it, and the part is picked out of the resulting BOM by TYPE — so node names,
// labels, links, renders and validation all flow from the same code that mints
// them for instructions, and can never drift from it. The full catalog output
// is pinned by test/golden/part-previews.json (the official-kits durability
// mechanism): a generator change that alters any preview fails npm test as a
// reviewable diff, never ships silently.
//
// Fail-closed rules (2026-08-19 design review): a lookup must land on EXACTLY
// one BOM row or it fails; assembly context (pos/stage/rides/yaw) is stripped —
// the preview shows the part's canonical GLB pose at the origin, because an
// installation transform is not a product pose. Unsupported-on-purpose: case
// extenders (no GLBs exist) and the 6 hardware slugs (pair-vs-single product
// composition needs Joey's call — 'unsupported' keeps the site on its poster).
const H_FROM_SLUG = { '0-5': 1, '1': 2, '1-5': 3, '2': 4, '3': 6 }; // site h token → planner hh
// Collection colors for collection-scoped parts — the site's poster renders are
// tinted per collection (planner lineup palette; siblings: main.js
// SHOT_LEN_COLORS, planner data.js GEN2.lengths), and the poster→3D swap must
// not change the part's color family.
const PREVIEW_LEN_COLORS = { 59: '#f2f2f2', 115: '#9ea3a8', 165: '#3aa0e8', 185: '#ff8a40', 240: '#3ecfa0', 270: '#e8453c' };
function previewColors(L) {
  const lc = PREVIEW_LEN_COLORS[parseInt(L, 10)] || '#ff8a40';
  return {
    ...COLORS,
    // collection-scoped families wear the collection color, like their posters
    Case: lc, Drawer: lc, CoverL: lc, CoverU: lc, FootrailL: lc, FootrailU: lc, Rail: lc,
    // universal parts wear their poster-render hues (faceplates: dark
    // navy-charcoal body + the render palette's orange grip/face + silver rod)
    Faceplate: '#31333f',
    'Faceplate:GRIP': '#ff6f1b', 'Faceplate:FACE': '#ff6f1b', 'Faceplate:GRIP ACCENT': '#8d939e',
    BackCover: '#c25c28', Label: '#eef0f4',
    // hardware wears the poster orange too (the site's card art) — the K'nex
    // identification palette is an instructions affordance, not a product shot
    QuickLock: '#ff6f1b', Stopper: '#ff6f1b', MagnetClip: '#ff6f1b', Foot: '#ff6f1b',
  };
}
// Hardware previews (Joey's composition decision 2026-08-20): a handed pair is
// ONE product — "they function exactly the same and are typically both
// needed" — so the set previews AND prints together, exactly as each STL
// ships both hands in one file. All numbers below are STL GROUND TRUTH,
// measured from the v2608 files (per-body bboxes + centers): `dx` is the
// body-center spacing, `stl` the combined print footprint W×D the site's fit
// verdict judges — the plate must reproduce the real print job, never invent
// a layout that could contradict a green Fits. `plateRot` maps the GLB
// assembly pose flat onto the bed ([] = already flat as authored); rotation
// AXES are derived from measured spans, SIGNS (which face is down) go through
// Joey's eye-gate like every plate pose. quicklock-b and the 6x2 insert have
// NO GLB in the library and stay unsupported (fail closed) until one lands.
const HARDWARE_PREVIEW = {
  'quicklock-a-v1-11': {
    label: 'QuickLock (Left + Right)', type: 'QuickLock',
    nodes: ['QuickLock-L', 'QuickLock-R'],
    dx: 25.11, stl: [48.41, 18.42],
    // 3.9mm thickness lies on GLB X (installed upright) → swing flat. PER-NODE
    // and MIRRORED on purpose: L and R are chiral twins, and the rotation that
    // lays L on its correct face lays the mirror twin on its WRONG face —
    // Joey's live check caught R resting on its snap tab (2026-08-20). For a
    // mirror image, the corrective rotation mirrors too: Rz(+90) ↔ Rz(−90).
    plateRot: { 'QuickLock-L': [0, 0, 90], 'QuickLock-R': [0, 0, -90] },
    // the GLBs are BOTTOM-ANCHORED, so a ±90° swing displaces each body's
    // center by half its 23.3mm width to opposite sides of its anchor —
    // without this compensation the mirrored poses silently widened the pair
    // to a ~25mm gap (Joey caught it on the live plate; the file's gap is
    // 1.81mm). plateCenterOff = the rotated body-center's X offset from the
    // instance anchor; plate positions subtract it so BODY centers, not
    // anchors, sit dx apart.
    plateCenterOff: { 'QuickLock-L': -11.65, 'QuickLock-R': 11.65 },
  },
  'drawer-stoppers': {
    label: 'Drawer Stoppers (Left + Right)', type: 'Stopper',
    nodes: ['Drawer_Stoppers_L', 'Drawer_Stoppers_R'],
    dx: 25.6, stl: [45.18, 28.0],
    // the GLB lies flat (4.5mm on Y) but on the WRONG face — Joey's plate
    // check: flip 180° to print flat. A COMMON flip for both hands (same
    // authored orientation, same correction — unlike the QuickLock ±90
    // chirality case); footprint and spacing are untouched (x stays, z
    // mirrors about center).
    plateRot: [180, 0, 0],
  },
  'magnet-insert-10x2mm': {
    label: 'Magnet Clip (10×2mm)', type: 'MagnetClip',
    nodes: ['MagnetClip_10x2mm'],
    dx: 0, stl: [19.82, 20.0],
    plateRot: [90, 0, 0],   // 2.4mm thickness lies on GLB Z (clips face forward) → lay flat
  },
  'tpu-foot': {
    label: 'TPU Foot', type: 'Foot',
    nodes: ['Tabletop-Kit-Foot'],
    dx: 0, stl: [20.6, 20.6],
    plateRot: [],           // prints upright as authored (20.6 × 20.6 footprint, 10.6 tall)
  },
};
// slug → { build: <probe planner-build>, pick: {type, suffix?} } | { fail }
function previewProbe(slug) {
  const s = String(slug || '').toLowerCase();
  const un = (message) => ({ fail: { reason: 'unsupported', message } });
  const unit = (w, hh, fill) => ({ id: 'u1', x: 0, y: 0, w, hh, fill });
  // single-unit probe. Mount is WALL on purpose: it serves all six collections
  // with one code path (the 59 forbids tabletop — noTabletop), and wall builds
  // emit cases, drawers, faceplates, back covers AND per-top-case covers alike.
  const one = (L, w, hh, fill = 'decor', extra = {}) =>
    ({ mount: 'wall', length: L, gridH: hh / 2, placed: [unit(w, hh, fill)], ...extra });
  let m;
  const H = '(0-5|1|1-5|2|3)';
  // recognized-but-unsupported families first (the site falls back to its poster)
  if (/^\d+-case-extender-\d+w-1h$/.test(s))
    return un("Case extenders aren't in the 3D part library yet.");
  if (/^(quicklock-b-bi-directional-optional|magnet-insert-6x2mm)$/.test(s))
    return un("This hardware part doesn't have a 3D model in the part library yet.");
  // hardware (sets + singles) — the probe mounts are chosen so the REAL
  // generator bills exactly the expected rows: a wall single-unit emits the
  // QuickLock pair AND the stopper pair (bench covers carry the stopper
  // slots); the magnet clip needs the unit's closure opted in; feet exist
  // only on a tabletop frame. All probe on the calibrated 185.
  if (HARDWARE_PREVIEW[s]) {
    const hw = HARDWARE_PREVIEW[s];
    const build = s === 'tpu-foot'
      ? { mount: 'tabletop', length: 185, gridH: 1, placed: [unit(1, 2, 'decor')] }
      : s === 'magnet-insert-10x2mm'
        ? { mount: 'wall', length: 185, gridH: 1, placed: [{ ...unit(1, 2, 'decor'), closure: 'magnet' }] }
        : one(185, 1, 2);
    return { build, hw };
  }
  if ((m = s.match(new RegExp(`^(\\d+)-case-([1-4])w-${H}h$`))))
    return { build: one(+m[1], +m[2], H_FROM_SLUG[m[3]]), pick: { type: 'Case' } };
  if ((m = s.match(new RegExp(`^(\\d+)-(classic|decor)-drawer-([1-4])w-${H}h$`))))
    return { build: one(+m[1], +m[3], H_FROM_SLUG[m[4]], m[2]), pick: { type: 'Drawer' } };
  if ((m = s.match(/^(\d+)-cover-(lower|upper)-([12])w$/)))
    return { build: one(+m[1], +m[3], 2), pick: { type: m[2] === 'lower' ? 'CoverL' : 'CoverU' } };
  if ((m = s.match(/^(\d+)-foot-rail-(lower|upper)-([12])w$/))) {
    // foot rails only exist on a TABLETOP frame, and a single-unit build takes
    // feet in the case instead (caseFeet) — so the probe is a bottom ROW: two
    // 1W cases tile [2W] on both layers; three tile [2W,1W]/[1W,2W], which is
    // the only shape that yields a 1W rail. The pick disambiguates by the
    // library's universal -<w>W size suffix.
    const w = +m[3], n = w === 2 ? 2 : 3;
    const placed = Array.from({ length: n }, (_, i) => ({ id: 'u' + (i + 1), x: i, y: 0, w: 1, hh: 2, fill: 'decor' }));
    return { build: { mount: 'tabletop', length: +m[1], gridH: 1, placed },
             pick: { type: m[2] === 'lower' ? 'FootrailL' : 'FootrailU', suffix: `-${w}W` } };
  }
  if ((m = s.match(/^(\d+)-under-table-rail-([1-4])w$/))) {
    // a ROW of 1W cases, not one w-wide case: rails tile biggest-first over the
    // top run (a w-wide run → exactly one <w>W rail), and the 59 collection
    // sells 3W/4W rails while its cases stop at 2W — the production slug sweep
    // caught a single-case probe failing exactly there.
    const w = +m[2];
    const placed = Array.from({ length: w }, (_, i) => ({ id: 'u' + (i + 1), x: i, y: 0, w: 1, hh: 2, fill: 'decor' }));
    return { build: { mount: 'under-table', length: +m[1], gridH: 1, placed }, pick: { type: 'Rail' } };
  }
  // universal families (no length prefix on the site): probe on the calibrated 185
  if ((m = s.match(new RegExp(`^(essential|classic|classicpro|edgelabel|chevron)-faceplate-([1-4])w-${H}h$`))))
    return { build: one(185, +m[2], H_FROM_SLUG[m[3]], 'decor', { faceStyle: m[1] }), pick: { type: 'Faceplate' } };
  if ((m = s.match(new RegExp(`^faceplate-back-cover-([1-4])w-${H}h$`))))
    return { build: one(185, +m[1], H_FROM_SLUG[m[2]], 'decor', { backCover: true }), pick: { type: 'BackCover' } };
  // wall-mount bracket sections (2026-08-20, the site's hardware restructure):
  // a single w-wide wall case tiles exactly one <w>W bracket course, so the
  // pick is unambiguous. Turntable only - no confirmed print pose yet, so the
  // plate view fails closed like every unpoosed family.
  if ((m = s.match(/^wall-mount-bracket-([1-3])w$/)))
    return { build: one(185, +m[1], 2), pick: { type: 'Bracket' } };
  return { fail: { reason: 'unknown-part', message: "This part id isn't recognized." } };
}
// Print-orientation whitelist for the ?plate= view (Joey's confirmations,
// 2026-08-19): cases and both drawer fills print AS AUTHORED; the three
// integrated-grip faceplate families print BACK-DOWN (grip up: rot -90° about
// X maps the product pose's -Z back face onto the plate); Essential and
// Chevron print FACE-DOWN by preference (+90° about X - it transfers the
// build-plate texture onto the face). Everything else has NO confirmed print
// pose and gets no plate view until Joey confirms one - fail closed, never
// guess an orientation onto a permanent product page.
const PLATE_POSE = {
  case: [],
  drawer: [],
  'faceplate:edgelabel': [-90, 0, 0],
  'faceplate:classic': [-90, 0, 0],
  'faceplate:classicpro': [-90, 0, 0],
  'faceplate:essential': [90, 0, 0],
  'faceplate:chevron': [90, 0, 0],
};
function platePoseFor(probe) {
  if (probe.hw) return probe.hw.plateRot; // hardware poses live on the entry ([] = as authored)
  const k = probe.pick.type === 'Case' ? 'case'
    : probe.pick.type === 'Drawer' ? 'drawer'
    : probe.pick.type === 'Faceplate' ? 'faceplate:' + probe.build.faceStyle
    : null;
  return k != null && k in PLATE_POSE ? PLATE_POSE[k] : null;
}

export function resolvePartPreview(slug, opts = {}) {
  const probe = previewProbe(slug);
  if (probe.fail) return { fail: probe.fail };
  const platePose = platePoseFor(probe);
  if (opts.plate && !platePose)
    return { fail: { reason: 'unsupported', message: "This part doesn't have a confirmed print orientation yet." } };
  const gen = generateManifest(probe.build);
  // the generator is the validator: per-collection size caps, illegal sizes and
  // library gaps all surface here with their real user-facing messages
  if (!gen.manifest)
    return { fail: { reason: 'unsupported', message: gen.errors.join(' · ') } };
  if (probe.hw) {
    const hw = probe.hw;
    // exact node-set membership, both directions: every expected node has a
    // BOM row, and NO OTHER row of the type exists — never pick by row order
    const rows = hw.nodes.map(n => gen.manifest.parts.find(p => p.node === n));
    if (rows.some(r => !r))
      return { fail: { reason: 'unsupported', message: 'Hardware row missing from the probe BOM.' } };
    const typeNodes = gen.manifest.parts.filter(p => p.type === hw.type).map(p => p.node).sort().join('|');
    if (typeNodes !== [...hw.nodes].sort().join('|'))
      return { fail: { reason: 'unsupported', message: `Hardware set membership was ambiguous (${typeNodes}).` } };
    const L = gen.manifest.collection;
    // a pair sits at the STL's own body spacing, centered — instances are
    // SYNTHESIZED from the rows (a probe places 2-6 physical copies; insertion
    // order must never pick the canonical one)
    const off = hw.nodes.length === 2 ? [-hw.dx / 2, hw.dx / 2] : [0];
    return {
      part: { node: hw.nodes[0], label: hw.label, type: hw.type,
              platePreview: !!platePose,
              ...(hw.nodes.length > 1 ? { set: hw.nodes } : {}) },
      manifest: {
        title: hw.label,
        collection: L,
        generated: true,
        preview: true,
        mount: 'tabletop',
        pitch: { x: PITCH_X, y: 56 },
        colors: previewColors(L),
        parts: rows.map(r => ({ ...r, qty: 1 })),
        ...(opts.plate ? { platePose: true } : {}),
        instances: hw.nodes.map((n, i) => {
          // plateRot is one array for the whole job, or per-node for chiral sets
          const r = Array.isArray(platePose) ? platePose : platePose[n];
          // on the plate, anchors shift so rotated BODY centers sit dx apart
          const x = off[i] - (opts.plate && hw.plateCenterOff ? hw.plateCenterOff[n] || 0 : 0);
          return { id: 'p' + i, node: n, pos: [x, 0, 0],
            ...(opts.plate && r && r.length ? { rot: r } : {}) };
        }),
        stages: {},
        steps: [{ title: hw.label, note: '', camera: { t: 32, p: 64, r: 600, target: [0, 0, 0] },
                  phases: [{ enter: hw.nodes.map((n, i) => ({ id: 'p' + i, from: [0, 0, 0] })) }] }],
      },
    };
  }
  const rows = gen.manifest.parts.filter(p => p.type === probe.pick.type &&
    (!probe.pick.suffix || p.node.endsWith(probe.pick.suffix)));
  // fail CLOSED on anything but exactly one match — never guess which physical
  // part a permanent product page means
  if (rows.length !== 1)
    return { fail: { reason: 'unsupported', message: `Part lookup was ambiguous (${rows.length} matches).` } };
  const row = rows[0];
  const primary = gen.manifest.instances.find(i => i.node === row.node);
  if (!primary)
    return { fail: { reason: 'unsupported', message: 'Part has no placed instance in the probe build.' } };
  // Extras families (EdgeLabel / Classic Pro) preview DRESSED — accent panel +
  // label in their windows — because that is the product as sold (both ship in
  // the series download) and the site's posters render them dressed; a bare
  // plate shows an open label window and reads as a regression at the
  // poster→3D swap. The offsets are PLATE-relative (product geometry, not
  // installation context), and the accent keeps its generator-minted
  // corrective rot (the GLB exports upside down).
  const typeOf = Object.fromEntries(gen.manifest.parts.map(p => [p.node, p.type]));
  // the PLATE view shows only the primary print body: extras (accent/label)
  // have no confirmed individual print poses or plate arrangement yet
  const extras = row.type === 'Faceplate' && !opts.plate
    ? gen.manifest.instances.filter(i => i.rides === primary.rides &&
        (typeOf[i.node] === 'Accent' || typeOf[i.node] === 'Label'))
    : [];
  const L = gen.manifest.collection;
  return {
    part: { node: row.node, label: row.label, type: row.type,
            platePreview: !!platePose,
            ...(extras.length ? { extras: extras.map(x => x.node) } : {}) },
    manifest: {
      title: row.label,
      collection: L,
      generated: true,
      preview: true,
      // 'tabletop' regardless of the probe's mount: the preview stage is a clean
      // float and must not trigger main.js's wall/under-table backdrop machinery
      mount: 'tabletop',
      pitch: { x: PITCH_X, y: 56 },
      colors: previewColors(L),
      parts: [{ ...row, qty: 1 }, ...extras.map(x => ({ ...gen.manifest.parts.find(p => p.node === x.node), qty: 1 }))],
      // canonical pose: the primary sits identity at the origin (parts are
      // bottom-anchored, X/Z-centered). Assembly context — pos, stage, rides,
      // owner, yaw — is deliberately NOT inherited; every previewable family's
      // canonical pose is its GLB pose. Extras keep their PLATE-relative
      // offsets (+ any corrective rot) — that is product geometry. A plate
      // boot instead applies the confirmed PRINT pose to the bare primary;
      // main.js seats the rotated part on the plate (bbox lift + recenter).
      ...(opts.plate ? { platePose: true } : {}),
      instances: [
        { id: 'p0', node: row.node, pos: [0, 0, 0],
          ...(opts.plate && platePose.length ? { rot: platePose } : {}) },
        ...extras.map((x, n) => ({ id: 'p' + (n + 1), node: x.node,
          pos: [x.pos[0] - primary.pos[0], x.pos[1] - primary.pos[1], x.pos[2] - primary.pos[2]],
          ...(x.rot ? { rot: x.rot } : {}) })),
      ],
      stages: {},
      steps: [{ title: row.label, note: '', camera: { t: 32, p: 64, r: 600, target: [0, 0, 0] },
                phases: [{ enter: [{ id: 'p0', from: [0, 0, 0] },
                                   ...extras.map((x, n) => ({ id: 'p' + (n + 1), from: [0, 0, 0] }))] }] }],
    },
  };
}
