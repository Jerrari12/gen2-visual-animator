/* THE DECLARED BUILD AXIS — a STATIC gate, and the reason it is static.
 *
 * `buildAxisForType` tells the renderer which way each part grew, and the layer relief stacks
 * along it. Declare it wrong and the bands run the wrong way across every face of that type — a
 * picture of a print that does not exist, and one that looks exactly as convincing as a correct
 * one. Nothing about the rendered result says which.
 *
 * ── WHY NOT THE RUNTIME TEST THAT WAS PROPOSED ───────────────────────────────────────────
 *
 * ⚠ THE OBVIOUS GATE IS INVERTED, AND IT WAS MEASURED TO BE. The Filament Material Lab scoped a
 * runtime check — declare an axis perpendicular to the confirmed one and watch the highlight
 * wobble collapse — and then ran it: the wobble collapses by 8x to 59x on exactly the flat-faced
 * parts it targets (wall bracket 0.988 -> 0.017, back cover 0.522 -> 0.017, chevron 0.143 -> 0.016,
 * essential faceplate 0.338 -> 0.041). Declaring the WRONG axis makes the render CALMER. So the
 * test cannot separate "the port declared the wrong axis" from "this part legitimately prints
 * face-down", and it was dropped rather than shipped. This file must not rebuild it.
 *
 * ── AND WHY THIS ONE IS NARROWER THAN IT LOOKS ───────────────────────────────────────────
 *
 * ⚠ THERE IS NO UNIVERSAL GEOMETRIC CHECK, and it is worth saying why rather than leaving the gap
 * looking like laziness. The tempting rule is "a plate pose lays the part FLAT, so the span along
 * the build axis must be the smallest of the three". It is false here: `PLATE_POSE.case` is `[]`,
 * a case prints AS AUTHORED and upright, and its build-axis span is its full height. A plate pose
 * is a statement about which FACE goes down, not about the part being thin.
 *
 * So the geometric half applies where a documented constant exists — the faceplate families, whose
 * plate depth is cross-checked against the generator's own placement math — and that is precisely
 * the case the runtime gate got backwards. Everything else is covered by an agreement between the
 * two code paths that read the pose data.
 *
 * Pure node — no browser, no packages, no mesh decoding; spans come from the JSON chunk.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { worldSpans } from './lib/glb-spans.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { resolvePartPreview, buildAxisForType, buildAxisFromEuler, plateRotForType } = await import(
  new URL('file://' + join(root, 'viewer', 'js', 'generate.js').replace(/\\/g, '/')).href
);
const SLUGS = JSON.parse(readFileSync(join(root, 'test', 'site-slugs.json'), 'utf8')).slugs;

/* The faceplate FAMILY, from the body's own node name.
   `resolvePartPreview` derives it internally from the slug and exposes only `part` and `manifest`,
   so a sweep that wants to ask the renderer the same question has to supply it — and reading it
   from the NODE is what keeps the two answers independently derived rather than shared. */
const FAMILY_KEY = {
  Essential: 'essential', ClassicDecor: 'classic', EdgeLabel: 'edgelabel',
  ClassicPro: 'classicpro', Chevron: 'chevron',
};
const familyOf = (node) => {
  const m = /^Faceplate_(\w+?)_\d+W-/.exec(node ?? '');
  return m ? FAMILY_KEY[m[1]] ?? null : null;
};

const same = (a, b) => !!a && !!b && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

/** Every plate-eligible body, found the way plate-glb-orientation.test.mjs finds them. */
const bodies = new Map();   // "<coll>/<node>" -> { file, node, type, family, rot }
for (const slug of SLUGS) {
  let r;
  try { r = resolvePartPreview(slug, { plate: true }); } catch { continue; }
  if (r.fail || !r.part?.platePreview) continue;
  const rot = r.manifest?.instances?.[0]?.rot ?? [];
  for (const node of r.part.set || [r.part.node]) {
    const key = r.manifest.collection + '/' + node;
    if (bodies.has(key)) continue;
    bodies.set(key, {
      file: join(root, 'viewer', 'parts', r.manifest.collection, node + '.lib.glb'),
      node, type: r.part.type, family: familyOf(node), rot,
    });
  }
}

/* ── 1. the two readers of the pose data agree ───────────────────────────────────────────── */

test('the renderer per-TYPE axis matches the pose the plate view actually renders', () => {
  /* Two entry points reach the same table by different routes. The PREVIEW asks per part: slug ->
     resolvePartPreview -> a probe that resolves the part, its hardware entry and, for a faceplate,
     its family from the slug. The RENDERER asks per material, and a material is keyed by TYPE, so
     it has no slug and no probe — only a type name and the current family.

     ⚠ AN ABSENT `rot` MEANS THE IDENTITY POSE, NOT A LOOKUP FAILURE. generate.js omits the key
     when the pose is the as-authored empty triple, which is the majority of parts — every Case,
     Drawer, CoverL, FootrailU, FootrailL and CaseExtender. Reading it as "missing" would silently
     drop most of the sweep and leave this test passing on almost nothing. */
  const bad = [];
  let compared = 0;
  for (const [key, b] of bodies) {
    const viaPreview = buildAxisFromEuler(b.rot);
    const viaType = buildAxisForType(b.type, b.family);
    if (viaType === null) {
      /* Two lawful reasons for no axis, neither a disagreement: the type has no confirmed pose at
         all, or it is a CHIRAL PAIR whose two nodes grow along opposite axes and share one
         material. The renderer withholds the relief in both cases, which is the intent. */
      const rot = plateRotForType(b.type, b.family);
      if (rot !== null && Array.isArray(rot)) {
        bad.push(`${key}: the preview poses it but the renderer has no axis for type ${b.type}`);
      }
      continue;
    }
    compared += 1;
    if (!same(viaType, viaPreview)) {
      bad.push(`${key} (${b.type}): plate view says ${JSON.stringify(viaPreview)}, `
        + `renderer says ${JSON.stringify(viaType)}`);
    }
  }
  assert.ok(bodies.size > 100, `only ${bodies.size} plate bodies resolved — the sweep is broken`);
  assert.ok(compared > 100, `only ${compared} axes compared of ${bodies.size} bodies`);
  assert.deepEqual(bad, [], 'the plate view and the renderer disagree about how a part printed');
});

/* ── 2. the declared axis against the GEOMETRY ───────────────────────────────────────────── */

/* Each family's plate depth, cross-checked against the GENERATOR's own placement math
   (z-centre = mounting plane 92.57 + depth/2): Essential 95.07->5.0, ClassicDecor 107.17->29.2,
   EdgeLabel 104.62->24.1 (the bare plate; the notes' 26.1 is the assembled set), ClassicPro
   107.32->29.5, Chevron 95.67->6.2. plate-glb-orientation.test.mjs asserts these on the Z axis BY
   NAME; this file reaches them through the DECLARED AXIS, which is what makes it a check on the
   declaration rather than a second copy of that test. */
const FP_DEPTH = { essential: 5, classic: 29.2, edgelabel: 24.1, classicpro: 29.5, chevron: 6.2 };

/** The span along a signed basis axis. |axis| picks the component; the sign is irrelevant. */
const spanAlong = (spans, axis) => spans[axis.findIndex((v) => Math.abs(v) > 0.5)];

test('a faceplate span ALONG ITS DECLARED AXIS is its family plate depth', () => {
  /* THE DISCRIMINATING ONE, on the part the runtime gate got backwards.
     A faceplate's build axis is ±Z — it prints on its back (Classic, ClassicPro, EdgeLabel) or on
     its face (Essential, Chevron) — and along that axis it measures its DEPTH, 5 to 29.5 mm.
     Declare ±Y instead and the span becomes the plate HEIGHT, 27 mm at minimum; declare ±X and it
     becomes the WIDTH, 88 mm per unit. Both are caught.

     ⚠ AND IT IS BLIND TO SIGN, DELIBERATELY. A span is an extent, so a part that legitimately
     prints face-down measures the same as one that prints back-up. That blindness is exactly what
     keeps this out of the inverted-gate trap the runtime test fell into: it cannot mistake "prints
     face-down" for "declared wrong", because it never asks which way round it is. The renderer's
     corrugation is sign-invariant too, so nothing is lost by not asking. */
  const plates = [...bodies.values()].filter((b) => b.family && b.family in FP_DEPTH);
  assert.ok(plates.length >= 5, `only ${plates.length} faceplate bodies found`);

  const bad = [];
  for (const b of plates) {
    const axis = buildAxisForType('Faceplate', b.family);
    assert.ok(axis, `no build axis for the ${b.family} family`);
    const along = spanAlong(worldSpans(b.file), axis);
    const want = FP_DEPTH[b.family];
    /* Essential's depth is not separately documented — the precedent requires only "thinner than
       any plate height", and this keeps that tolerance rather than inventing a tighter one. */
    const ok = want === 5 ? along < 20 : Math.abs(along - want) < 1;
    if (!ok) {
      bad.push(`${b.node}: span along the declared axis ${JSON.stringify(axis)} is `
        + `${along.toFixed(2)}, family ${b.family} says ${want}`);
    }
  }
  assert.deepEqual(bad, [], 'a faceplate declared build axis does not match its geometry');
});

test('and the check has teeth: the plausible wrong axis puts the plate HEIGHT there', () => {
  /* The mutation, run inline rather than left as an instruction — the assertion that says the test
     above CAN fail. +Y is the mistake to make: it is what every case and drawer uses. */
  const b = [...bodies.values()].find((x) => x.family && x.family in FP_DEPTH);
  assert.ok(b, 'no faceplate body resolved');
  const want = FP_DEPTH[b.family];
  const along = spanAlong(worldSpans(b.file), [0, 1, 0]);
  const wouldPass = want === 5 ? along < 20 : Math.abs(along - want) < 1;
  assert.equal(wouldPass, false,
    `declaring +Y for a ${b.family} faceplate puts ${along.toFixed(2)} where ${want} is expected, `
    + 'and that still satisfies the family tolerance — the check above cannot discriminate');
});
