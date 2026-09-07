/* =========================================================================
   PART MATERIAL SPEC - what a printed part's surface is made of
   =========================================================================
   SOURCE OF TRUTH: gen2-visual-animator/viewer/js/part-material.js
   CONTRACT VERSION: 1
   ⚠ VENDORED BYTE-FOR-BYTE INTO THE FILAMENT MATERIAL LAB.
   Edit it HERE ONLY, then re-vendor. Both repos gate on byte equality, so a
   divergent copy fails their suites rather than quietly drifting.

   WHY THIS EXISTS
   ---------------------------------------------------------------------------
   The Lab's staging page shows three panes: a reference photograph, its own
   candidate render, and WHAT BUILD STUDIO SHOWS TODAY. That third pane has to
   be the real thing or it is worthless - and the two ways to get it were both
   wrong. An iframe cannot be told which filament to use (part-preview mode
   accepts no incoming messages, by design, and there is no colour parameter).
   A hand-written replica in the Lab would make these numbers double-authored,
   which is exactly the failure `requirement-scope.js` exists to prevent.

   So the numbers move here, once, and both repos read them.

   ⚠ WHAT THIS RETURNS IS A FINISH, NOT A MATERIAL, AND CARRIES NO COLOUR.
   Colour is palette state - `activeHex(key)` here, a vendored catalog lookup in
   the Lab - and it changes constantly while the finish does not. Keeping them
   apart is what lets the Lab render Build Studio's surface in a filament Build
   Studio has never been told about.

   ⚠ AND IT HOLDS NO `THREE` IMPORT. The two repos resolve three differently
   (vendored import map here, npm there), so a shared module that constructed a
   material would have to agree about that too. Each side builds its own from
   the spec; the numbers are what must not differ. It is also why this file is
   testable in plain node on both sides.
   ========================================================================= */

export const PART_MATERIAL_CONTRACT_VERSION = 1;

/** A zone key is `Type` or `Type:zone`; the base type is what carries identity. */
export const baseType = (key) => String(key).split(':')[0];

/**
 * The finish for one part-type key.
 *
 * @param {string} key                     `Type` or `Type:zone`
 * @param {object} [ctx]
 * @param {boolean} [ctx.holographicPlate] a holographic build-plate profile is active
 * @param {boolean} [ctx.plateContact]     this key is the face that touched the plate
 * @returns {{kind:'standard'|'physical', roughness:number, metalness:number,
 *            clearcoat?:number, clearcoatRoughness?:number,
 *            envMapIntensity?:number, holographic?:boolean}}
 */
export function partMaterialSpec(key, ctx = {}) {
  const { holographicPlate = false, plateContact = false } = ctx;

  /* The holographic build plate transfers its own finish to the faceplate that
     was printed against it - polished where it made contact, ordinary elsewhere.
     ⚠ ONLY REACHABLE IN THE PLATE VIEW. The Lab never sets this, so its third
     pane always takes one of the two branches below. */
  if (holographicPlate && baseType(key) === 'Faceplate') {
    return {
      kind: 'physical',
      metalness: 0,
      roughness: plateContact ? 0.14 : 0.2,
      clearcoat: plateContact ? 1.0 : 0.8,
      clearcoatRoughness: plateContact ? 0.11 : 0.14,
      envMapIntensity: 1.15,
      holographic: true,
    };
  }

  /* Bought adhesive rubber feet (2026-08-22). A REAL part in the scene, not an
     annotation - Joey confirmed the bought foot is the printed one minus its
     dovetail rail, so `Adhesive-Foot` is derived from the printed master and
     the shape IS the product. What it must not wear is the identification
     palette: rubber reads as rubber only if it is matte beside the plastics.
     Colour comes from the palette like every other type - and because its BOM
     row is `purchased`, colorLocked pins it to the manifest colour, so no
     preset or filament pick can repaint a bought item.

     0.72, not the 0.95 a "matte rubber" instinct reaches for: a real bumper
     foot carries a soft sheen, and at 0.95 there is no specular at all - the
     pad's edges disappeared into the dark stage (checked on screen, not
     reasoned about). */
  if (key === 'FootAdhesive') return { kind: 'standard', roughness: 0.72, metalness: 0 };

  /* ⚠ THE ORDINARY PRINTED PART — every case, drawer, shelf and handle in the
     viewer. 0.55 / 0.05 is a plausible plastic and nothing more: no layer lines,
     no anisotropy, no dependence on how the part was printed or which filament
     it is. Roadmap item 1 is the proposal to replace it.

     ⚠ PHYSICAL SINCE 2026-09-07, ON THE ROADMAP'S GROUNDS AND NOT ON A
     MEASUREMENT. B2 was scoped as promoting the class only "where a profile is
     active"; it is promoted everywhere because the authored profile this viewer
     is meant to consume was judged on a MeshPhysicalMaterial, and because the
     two renderers being structurally the same is worth having on its own.

     ⚠ THE MEASUREMENT THAT WAS FIRST OFFERED FOR IT IS WITHDRAWN. The Lab
     reported the two pages 16.1 % apart in windowed mean at an identical rig and
     paint and named this class as the only remaining difference. It was not: the
     gap was the Lab's own control arm painting the part TWICE — its catalog
     material carries the filament in coexColors with material.color left white,
     and the coextrusion patch multiplies them. Promoting this class moved the
     comparison by nothing at all, and once the control arm painted once the two
     pages agreed to 0.1 % at three framings. So the "same shader" premise B2
     rested on was never falsified, and this change fixes no defect.
     See docs/RENDERING.md § 1.4s in the Lab, which records the retraction.

     ⚠ AND IT IS FREE, WHICH IS THE ONLY REASON IT SURVIVED THE RETRACTION.
     Benched on the 185 2W-2H at quality high, seven interleaved rounds against
     the deployed main: the class costs −0.086 ms a frame, 4 of 7 rounds
     disagreeing on the sign — unresolved, inside its own spread. The same
     harness resolves layer detail at +2.171 ms with 7 of 7 agreeing and lands a
     planted 1.25x-DPR cost at 1.558x against the 1.5625x its own arithmetic
     predicts. A bench that pins a known cost to 0.3 % cannot see this one.
     docs/data/bs-perf-b2.json.

     The three extra fields are what the physical branch of newPartMaterial
     reads. clearcoat 0 keeps USE_CLEARCOAT undefined, so no clearcoat lobe is
     compiled and clearcoatRoughness is inert; envMapIntensity 1 is three's own
     default and is stated so the branch is not handed an undefined. What
     remains is a plain MeshPhysicalMaterial at its defaults, which is exactly
     what the Lab builds and what the comparison was judged on. */
  return { kind: 'physical', roughness: 0.55, metalness: 0.05,
    clearcoat: 0, clearcoatRoughness: 0, envMapIntensity: 1 };
}
