/* THE LAYER-DETAIL SEAM — an ordering constraint that is invisible when it is wrong.
 *
 * `newPartMaterial` builds a part's material and, since the layer-detail port, hands it to
 * `withLayerDetail`. Two hooks now want the same material:
 *
 *   attachHolo         ASSIGNS  m.onBeforeCompile = sh => {...}   and  m.customProgramCacheKey
 *   applyLayerDetail   CHAINS   const prior = material.onBeforeCompile; ... prior.call(...)
 *
 * ⚠ SO THE ORDER IS LOAD-BEARING AND ITS FAILURE IS SILENT. Chain first and assign second and the
 * assignment DISCARDS the chain: a holographic faceplate renders with its rainbow and no layer
 * lines, no error, no warning, and every non-holographic part in the frame still correct. There is
 * no runtime symptom to notice and no exception to catch — the only evidence is the compiled
 * shader, which this repo has no browser harness to inspect.
 *
 * ── WHY THIS IS A SOURCE-TEXT GATE AND NOT A COMPILED ONE ────────────────────────────────
 *
 * `viewer/js/main.js` cannot be imported by `node --test`: it is a browser module that reaches
 * `document` at the top level. So no test here can observe what `newPartMaterial` actually does at
 * runtime, and a compiled-shader test — which would build its own material and its own attach
 * order — would stay GREEN while the two calls inside `newPartMaterial` were swapped. That is the
 * mutation this file exists to catch, so it reads the function's own text, the way
 * `part-material.test.mjs` already slices `newPartMaterial` to prove it stopped hard-coding the
 * finish numbers.
 *
 * The COMPOSITION MECHANISM — that a chain really does survive an assignment that ran first — is
 * gated where three can actually be loaded: the Lab's `test/unit/layerDetailSeam.test.ts` compiles
 * both orders against a stand-in assigner and reads the resulting shader. Between them the claim
 * is covered from both ends; neither half covers it alone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const main = readFileSync(join(root, 'viewer', 'js', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
const vendored = readFileSync(join(root, 'viewer', 'js', 'vendor', 'layer-detail.js'), 'utf8')
  .replace(/\r\n/g, '\n');

/**
 * Comments removed, because this file asks about ORDER and prose is not code.
 *
 * ⚠ THIS IS NOT TIDINESS — IT IS THE BUG THIS GATE HIT ON ITS FIRST RUN. `newPartMaterial` carries
 * a comment explaining why the two calls are two statements rather than one nested call, and that
 * comment necessarily QUOTES the wrong form: `withLayerDetail(attachHolo(m), key)`. A plain
 * indexOf found the quoted `withLayerDetail(` sixteen characters before the real `attachHolo(` and
 * reported the order backwards on correct code. The Lab hit the identical failure in its own
 * injection-order test and records the identical fix: strip comments before scanning.
 */
const decomment = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/** One function's own text, by the same slice `part-material.test.mjs` uses. */
const body = (name) => {
  const fn = main.slice(main.indexOf(`function ${name}`));
  assert.ok(fn.length > 0, `${name} is gone from main.js`);
  return decomment(fn.slice(0, fn.indexOf('\n}\n') + 2));
};

test('⚔ the relief is attached AFTER the holographic patch, not before', () => {
  const fn = body('newPartMaterial');
  const holo = fn.indexOf('attachHolo(');
  const relief = fn.indexOf('withLayerDetail(');
  assert.ok(holo >= 0, 'newPartMaterial no longer calls attachHolo');
  assert.ok(relief >= 0, 'newPartMaterial no longer calls withLayerDetail — the seam is gone');
  assert.ok(holo < relief,
    'withLayerDetail runs BEFORE attachHolo in newPartMaterial. attachHolo assigns '
    + 'onBeforeCompile outright, so it will discard the layer-detail chain and holographic '
    + 'faceplates will render with no layer lines and no error.');
});

test('⚔ every material newPartMaterial returns goes through the seam', () => {
  const fn = body('newPartMaterial');
  /* Two branches — physical (faceplates, hardware) and standard (the ordinary printed part).
     A seam on one of them looks entirely correct until you compare two parts side by side. */
  const returns = [...fn.matchAll(/\breturn\s+([^;]+);/g)].map((m) => m[1].trim());
  assert.ok(returns.length >= 2, `expected both branches to return, found ${returns.length}`);
  for (const r of returns) {
    assert.ok(r.startsWith('withLayerDetail('),
      `a material leaves newPartMaterial without passing through the seam: return ${r}`);
  }
});

test('⚔ the constraint still holds: attachHolo ASSIGNS and the vendored module CHAINS', () => {
  /* ⚠ THE ROLES ARE DERIVED, NOT ASSUMED. Pinning "attachHolo is the assigner" would leave this
     file green on the day someone teaches attachHolo to chain — at which point the ordering
     assertion above would be enforcing a constraint that no longer exists, which is its own kind
     of wrong. If either role flips, this fails and the order above must be re-derived. */
  const holo = body('attachHolo');
  assert.match(holo, /m\.onBeforeCompile\s*=\s*sh\s*=>/,
    'attachHolo no longer ASSIGNS onBeforeCompile — re-derive the ordering constraint');
  assert.ok(!/\bprior\b|previousOnBeforeCompile|const\s+\w+\s*=\s*m\.onBeforeCompile/.test(holo),
    'attachHolo appears to chain now. If it does, the order in newPartMaterial is no longer '
    + 'load-bearing and this gate should be rewritten rather than kept.');

  assert.match(vendored, /const prior = material\.onBeforeCompile;/,
    'the vendored layer-detail module no longer chains — if it assigns, it must run FIRST, and '
    + 'the ordering assertion in this file is backwards');
  assert.match(vendored, /prior\.call\(/,
    'the vendored module captures the previous hook but never calls it');
});

test('⚔ the print facts it passes are named constants, not literals in the call', () => {
  /* This repo knows no layer height and no facet tilt; both travel from the Lab, where they were
     measured, and are gated from that side. A literal in the call would be a sixth site with no
     gate on it — the failure the Lab's own layerTiltAgreement test exists for. */
  const fn = body('withLayerDetail');
  assert.match(fn, /layerPitchMm:\s*LAYER_PITCH_MM/, 'the layer pitch is not the named constant');
  assert.match(fn, /tiltDeg:\s*LAYER_TILT_DEG/, 'the facet tilt is not the named constant');
  assert.match(main, /const LAYER_PITCH_MM = ([\d.]+);/);
  assert.match(main, /const LAYER_TILT_DEG = ([\d.]+);/);
});

test('⚔ the relief is withheld when the build axis is unknown, rather than guessed', () => {
  /* The Lab's standing rule: layer bands at an invented axis are a picture of a print that does
     not exist, and they look exactly as convincing as correct ones. Fail closed. */
  const fn = body('withLayerDetail');
  assert.match(fn, /const up = buildAxisForKey\(key\);/);
  assert.match(fn, /if \(!up\) return m;/,
    'withLayerDetail no longer withholds the relief when the axis is unknown');
});

test('⚔ the live handles are dropped wherever the materials they point at are', () => {
  /* Two different build options invalidate the Faceplate materials — the build PLATE (its
     impression on a face-down plate) and the FAMILY (which way the plate prints, and therefore
     which way its layers run). Each used to know about only one. Both now go through one
     function, and the handles are dropped there with the materials. */
  const drop = body('dropFaceplateMaterials');
  assert.match(drop, /delete materials\[k\]/, 'it no longer drops the materials');
  assert.match(drop, /delete highlightMats\[k\]/, 'it no longer drops the highlight clones');
  assert.match(drop, /layerHandles\.delete\(k\)/,
    'the Faceplate materials are dropped without their layer handles — the map would keep dead '
    + 'materials alive and grow on every swap');

  /* ⚠ AND NOTHING ELSE MAY DO IT. A second place that deletes Faceplate materials inline is a
     second author of the invalidation rule, and the one that forgets the handles is the one that
     will be written next. This is the assertion that keeps the function load-bearing rather than
     merely present. */
  const all = decomment(main);
  const inlineDeletes = [...all.matchAll(/delete materials\[[^\]]*\]/g)].length;
  assert.equal(inlineDeletes, 1,
    `${inlineDeletes} places delete from the materials registry; there must be exactly one, `
    + 'inside dropFaceplateMaterials');
});

test('⚔ both build options that change a faceplate\'s axis invalidate its material', () => {
  /* The family swap is the one that was missing: ensureMaterials is idempotent, so a Faceplate
     material built under `classic` (grows +Z) survived a swap to `essential` (grows −Z) with the
     old axis baked into its uniform. Neither symptom is an error — the bands simply run the wrong
     way on a part that looks otherwise correct. */
  for (const fn of ['setBuildPlate', 'applyFaceplateStyle']) {
    assert.match(body(fn), /dropFaceplateMaterials\(\)/,
      `${fn} changes what a faceplate's material should be without invalidating it`);
  }
});

test('⚔ BOTH device-pixel-ratio paths re-push it, and there are two', () => {
  /* The band limit is stated in CSS pixels per layer, so a tier change that moves the device
     pixel ratio has to reach the relief. `qualityTick` has a cinema branch and an ordinary one,
     and an earlier reading of this code found only the second. */
  const setters = [...main.matchAll(/renderer\.setPixelRatio\(([a-z]+)\)/g)].map((m) => m[1]);
  const pushes = [...main.matchAll(/setLayerDetailPixelRatio\(([a-z]+)\)/g)].map((m) => m[1]);
  /* The boot-time call at module scope has no relief to tell — nothing is built yet. */
  const runtime = setters.filter((v) => v !== 'Math');
  assert.ok(runtime.length >= 2, `expected at least two runtime dpr setters, found ${runtime.length}`);
  for (const v of runtime) {
    assert.ok(pushes.includes(v),
      `renderer.setPixelRatio(${v}) has no matching setLayerDetailPixelRatio(${v}) — a quality `
      + 'tier change would draw the corrugation at the wrong sampling');
  }
});
