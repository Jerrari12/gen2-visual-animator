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

  /* ⚠ THE ORDINARY PRINTED PART, AND THE ONE THE LAB IS TRYING TO BEAT.
     0.55 / 0.05 is every case, drawer, shelf and handle in the viewer. It is a
     plausible plastic and nothing more: no layer lines, no anisotropy, no
     dependence on how the part was printed or which filament it is. Roadmap
     item 1 is the proposal to replace it. */
  return { kind: 'standard', roughness: 0.55, metalness: 0.05 };
}
