// GEN2 Assembly Instructions viewer — build-free, data-driven.
// One kit = one folder under kits/<name>/ holding manifest.json + parts/*.lib.glb.
// The viewer never changes between kits; everything it animates comes from the manifest.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { generateManifest, migrateOfficialBuild, resolvePartPreview, REQUIREMENT as REQ,
  shelfLipModes, SHELF_LIP_LABEL, buildAxisForType, gridfinitySizeOk } from './generate.js';
import { resolveEntry } from './entry.js';
import { FILAMENT_DB } from './filament-db.js';
import { partMaterialSpec } from './part-material.js';
import { applyLayerDetail } from './vendor/layer-detail.js';
import { PLATE_FINISHES, PLATE_LABELS, HOLO_OPACITY, plateFinishOf, createBedFinishUniforms, setBedFinish,
  setSettleDetail, settleDetailIsOn, applyBedFinish, bedFaceAttributes } from './bed-finish.js';
import { createDimCoverTest } from './dim-cover.js';
import { benchBuild, createOrbitBench } from './orbit-bench.js';
import { createSettleBench } from './settle-bench.js';
import { parseSeeInto, parseSeeIntoSkip, createSeeInto } from './see-into.js';

/* Every entry-routing boolean below is derived by resolveEntry() in entry.js -
   a pure function of (search, hash) with no DOM or network - so the boot
   matrix is testable in node (test/entry-routes.test.mjs). The names here are
   unchanged from when the logic was inline; only where they are COMPUTED
   moved. Read entry.js for the precedence order and the two presence-vs-
   truthiness traps it exists to hold. */
const ENTRY = resolveEntry(location.search, location.hash);
const QS = ENTRY.QS;
const KIT = ENTRY.kit;
const KIT_URL = `kits/${KIT}/`;
// The BARE ROOT is the front door, and until 2026-08-22 it opened a hand-authored
// STATIC demo manifest - which has `build === null`, so it silently withheld the
// whole Build options panel and the Customize CTA. It now opens the canonical
// starter kit instead, so the door demonstrates the generated workflow the rest
// of the site is built on. ROOT_BUILD and the reasoning for 185 live in entry.js.
// #build=<base64> — the planner's own share-link encoding, generated at runtime
const BUILD_HASH = ENTRY.buildHash;
// ?embed=1 — docked inside the planner's split view: slimmer chrome (no top
// bar, no BOM exports — the planner owns those), and a live "preview" landing
// (the finished build, orbitable/colorable) instead of the box-art cover; a
// "Begin the instructions" pill enters the normal page flow. The flag rides
// location.search, so the mount/length-change self-reload keeps it.
const IS_EMBED = ENTRY.isEmbed;
document.body.classList.toggle('embed', IS_EMBED);
/* ?bench=orbit - the orbit benchmark (orbit-bench.js, Joey relaying Astra 2026-09-14): its own fixed 80-unit build, a
   warm-up and a timed camera orbit at a locked tier, a PASS/FAIL card. `benchHold` holds the resolution drop and the
   automatic tier change off for the page once a run starts (qualityTick). Both are `var` for the same reason as
   shadowWatch: the render loop and qualityTick read them, and a render can come before a `let` line has run. */
const IS_BENCH = ENTRY.isBench;
/* ?bench=settle (settle-bench.js, 2026-09-16) shares the fixed build, the hold and every guard IS_BENCH carries; it reads the
   settle machinery through the four monotonic counters below (acc.sampleCount, acc.detailCount, ao.passCount,
   refl.renderCount) and a per-frame afterFrame call from the render loop. Nothing else in the viewer reads them. */
var orbitBench = null, settleBench = null, benchHold = false;
/* The see-into translucent filament (see-into.js). ON BY DEFAULT since 2026-09-18 (Joey, after his live check on the showcase
   laptop: "those all are running extremely well", "yeah they look good") for the SUPPORTED components only - a translucent
   filament picked on a grip, Essential's face or Chevron's faces (SEE_INTO_COMPONENTS_BY_FAMILY). Nothing is patched and no
   pass runs until such a pick exists (`wanted` below). ⚠ The frosted BACK COVER is a PRESET, not a filament pick, so it stays
   behind `?seeinto=<preset>` (SEE_INTO_COVERS): turning it on by default would change every build's covers whatever the user
   picked. Null only in part-preview mode. `var`: newPartMaterial and the render loop read it, and both can run before a
   `let` line would have. */
var seeInto = null;
const SEE_INTO_COVERS = parseSeeInto(location.search);   // null = back covers stay ordinary opaque parts
// ?part=<slug>&mode=preview — the MODULITH product-page embed (2026-08-19): a
// TRANSPARENT iframe showing one part, poster-fast, slow idle spin until
// interaction, orbit/zoom/reset and nothing else. The slug is the SITE'S frozen
// /parts/ id — resolution to node names is viewer-owned (resolvePartPreview in
// generate.js). Protocol v1 to the embedding parent, matching the house
// {gen2:...} relay shape: partReady after the first real rendered frame,
// partError on any failure (the site keeps its static poster either way —
// "fail loud, never blank"). `rid` is an optional correlation token the site
// puts in the URL and gets echoed on every message, so a rapid A→B→A size
// switch can't act on a stale iframe's message. Incoming messages are ignored
// in this mode; the parent contract (validate origin+source+part+rid, timeout,
// poster crossfade) lives in the MODULITH repo's integration handoff.
const PART_SLUG = ENTRY.partSlug;
const IS_PART = ENTRY.isPart;
const PART_RID = ENTRY.partRid;
// &plate=<W>x<D> (usable mm, 50-1000 each) — the PRINT-ORIENTATION view: the
// bare part in its confirmed print pose on a true-scale build plate. The dims
// come from the SITE's printer profile (the viewer can't read a cross-origin
// localStorage); which parts have a confirmed pose is viewer-owned
// (resolvePartPreview's whitelist + the support manifest's platePreview).
const PART_PLATE = ENTRY.partPlate;   // parsePlate() in entry.js: 50-1000mm each, else null
document.body.classList.toggle('part-preview', IS_PART);
document.body.classList.toggle('part-plate', !!PART_PLATE); // pill layout: Top view owns the corner on plate boots
function postToEmbedder(msg) {
  if (!IS_PART || window.parent === window) return;
  try {
    window.parent.postMessage({ ...msg, part: PART_SLUG, ...(PART_RID ? { rid: PART_RID } : {}), v: 1 }, '*');
  } catch (e) { /* parent gone — nothing to tell */ }
}
// ?build=<id> — a named OFFICIAL kit. The build data lives in a COMMITTED file
// (builds/<id>.json), not in the URL — that's what makes printed links
// (Printables descriptions, QR codes) permanent: short, un-manglable, and
// fixable after the fact (replace the file; the id stays). Only files in the
// repo resolve, so ids are mintable by commit only — nothing for visitors to
// name or abuse. A #build= hash (the planner hand-off) always wins.
const OFFICIAL_ID = ENTRY.officialId;
const IS_ROOT = ENTRY.isRoot;
// Whether the official branch RUNS, kept separate from what it loads. Branching
// on the target string would send `?build=` (present but empty) down the static
// path instead of the official 404 card - the visitor asked for a kit by name
// and got the demo, silently. Long-standing; the presence test above makes it
// avoidable, so it is fixed rather than inherited.
const WANTS_OFFICIAL = ENTRY.wantsOfficial;
// '' (not null) so the id regex below rejects it and it fails as a bad kit id
const OFFICIAL_TARGET = ENTRY.officialTarget;
let OFFICIAL = null; // {id, title, tagline} once the kit file loads

// ---------- analytics (GoatCounter — cookieless; see the tag in index.html) ----------
// `name` is the event path, in the PLANNER'S vocabulary ("step:4", "out:printables")
// so both apps read the same way on one account. Fails silent and is a no-op when
// the beacon is blocked or absent — analytics must NEVER be able to break the viewer.
// Every name comes from a fixed vocabulary (kit ids, store ids, preset names, brand
// slugs, step numbers): no user-entered values, no colour hexes, no search terms.
//
// Unlike the planner — whose events are all click-driven, long after load — this
// module fires open:/collection:/error: DURING boot, which can beat count.js's async
// load. Those are the highest-value events in the set, so anything sent before the
// beacon exists is queued and flushed once it appears (and dropped, not queued
// forever, if it never does).
const trackQ = [];
let trackSettled = false;           // beacon has either appeared or been given up on
const trackedOnce = new Set();
// Every name fired this session, in order, capped. Exposed on the ?debug=1 hook
// as __GEN2_VIEWER__.trackLog: the ONLY way to check what the viewer reports
// without sending live traffic (count.js skips localhost by design, and forcing
// it would write junk into the real dashboard).
const trackLog = [];
// Installed EARLY — and replaced by the full hook at the end of this file. A
// boot failure throws long before that hook exists, and the error events are
// precisely the ones worth reading back (locally, count.js loads but discards
// localhost hits, so the beacon itself can never be observed in dev).
if (new URLSearchParams(location.search).has('debug')) window.__GEN2_VIEWER__ = { trackLog };
function track(name) {
  if (trackLog.length < 200) trackLog.push(name);
  if (IS_BENCH) return;   // a benchmark run is a test, not a visitor: none of its events reach the dashboard (count.js still counts the page load itself)
  try {
    const gc = window.goatcounter;
    if (gc && gc.count) { gc.count({ path: name, title: name, event: true }); return; }
    if (!trackSettled && trackQ.length < 40) trackQ.push(name);
  } catch (e) { /* ignore — never let tracking throw */ }
}
// fire at most once per page session: replay, Back and regenerate() all re-enter
// the same code paths, and a step counted twice turns the drop-off curve to noise
function trackOnce(name) { if (!trackedOnce.has(name)) { trackedOnce.add(name); track(name); } }
// our own names (presets, brands, styles) → a safe event token
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
(function flushTrack(tries) {
  if (window.goatcounter && window.goatcounter.count) {
    trackSettled = true;
    for (const n of trackQ.splice(0)) track(n);
  } else if (tries < 75) {
    // 30 s, not 5: count.js is an async third-party script and a cold CDN on a
    // slow phone easily takes longer than a few seconds. Giving up early drops
    // exactly the boot events (open/collection/error) that matter most.
    setTimeout(() => flushTrack(tries + 1), 400);
  } else {
    trackSettled = true;                            // blocked (the endpoint is on
    trackQ.length = 0;                              // EasyPrivacy) — stop queueing
  }
})(0);
// `load` waits on async scripts, so by then count.js has either run or failed —
// a deterministic flush alongside the poll, for whichever arrives first
addEventListener('load', () => { if (!trackSettled) flushTrack2(); });
function flushTrack2() {
  if (!(window.goatcounter && window.goatcounter.count)) return;
  trackSettled = true;
  for (const n of trackQ.splice(0)) track(n);
}

// ---------- tiny tween runner (no lib) ----------
const tweens = new Set();
// slow-motion study mode (🐢 in the controls bar): stretches every step and
// camera tween so an installation can be watched closely. The outro cinema
// drives its own clock and is never slowed.
let slowmo = false;
/* `raw: true` hands onUpdate the UNEASED 0..1 progress. Every tween is
   easeInOutCubic'd by default, which starts AND ends at zero velocity - fine
   for travel, impossible for a mechanism that has to arrive abruptly. A curve
   that owns its own ending (the shelf lip's dovetail snap) cannot be built by
   composing on top of that, because no shaping of a value whose derivative is
   already 0 at k=1 can produce a snap. dip/pop shape the eased value and are
   deliberately left alone - they are mid-travel effects, not arrivals. */
function tween({ duration = 700, delay = 0, onUpdate, onDone, raw = false }) {
  const f = slowmo && !cinema.on ? 2.5 : 1;
  return new Promise(resolve => {
    tweens.add({ t0: performance.now() + delay * f, duration: duration * f, onUpdate, raw, done: () => { onDone?.(); resolve(); } });
  });
}
// pause (⏸ in the controls bar) freezes the tween clock: while paused every
// pending tween's start time shifts forward with real time, so on resume
// everything continues exactly where it stopped. The outro cinema runs its own
// clock and isn't pausable (the button is disabled there).
let paused = false, lastTick = 0;
function stepTweens(now) {
  if (paused) {
    const dt = now - lastTick;
    for (const tw of tweens) tw.t0 += dt;
    lastTick = now;
    return;
  }
  lastTick = now;
  for (const tw of [...tweens]) {
    if (now < tw.t0) continue;
    const k = Math.min(1, (now - tw.t0) / tw.duration);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // easeInOutCubic
    tw.onUpdate(tw.raw ? k : e);
    if (k >= 1) { tweens.delete(tw); tw.done(); }
  }
}
function killTweens() { tweens.clear(); }

// ---------- scene ----------
const canvas = document.getElementById('stage');
// A device with no WebGL used to die here with an uncaught throw, leaving the
// spinner turning forever. bootFail is a hoisted declaration, so it's callable
// this early. (These visitors were completely invisible before — they just left.)
let renderer;
try {
  // alpha: true so ?shot=1 can clear to TRANSPARENT and the gallery card art
  // stops baking a background colour (see captureShot). No effect on normal
  // pages — scene.background is always set there, so it paints over the clear.
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch (e) {
  track('error:webgl');
  postToEmbedder({ gen2: 'partError', reason: 'webgl', message: 'WebGL unavailable' });
  bootFail('<strong>This browser can’t show 3D</strong><br><br>The Build Studio needs WebGL. Try a different browser, or turn on hardware acceleration in your browser’s settings.',
    'WebGL unavailable: ' + e.message);
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
// runtime context loss (GPU reset, tab pressure) — the constructor catch above
// can't see it. Only the embed cares: the site restores its poster on partError.
// Failure is TERMINAL for the ready handshake: three's render() returns without
// drawing while the context is lost, so without the flag the loop would post a
// false partReady right after this error (review catch, 2026-08-19).
canvas.addEventListener('webglcontextlost', () => {
  // partView is declared later in the module, but events can't dispatch during
  // module eval, so this callback never sees the TDZ (and a typeof "guard"
  // would THROW there, not protect — the documented let/const trap)
  partView.failed = true;
  postToEmbedder({ gen2: 'partError', reason: 'webgl', message: 'WebGL context lost' });
});
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeef0f3);
/* THE MOVING-FRAME SAVINGS (Joey and Astra, 2026-09-14, "Step 1"). Each one is a switch so a harness can run the viewer
   with and without it IN ONE PAGE - to measure it, and to prove the image did not change. Only the ?debug=1 hook
   (`moveOpt`) ever turns one off.
     labels     the dimension labels' cover test walks the parts once per placement pass (dim-cover.js), not once per ray
     shadow     the light stage's shadow map re-renders when a caster or the key light changed (watchShadowCasters),
                not on every frame the camera moves
     grounding  the dark stage's contact map is recomputed only when a part moved, showed or hid (updateGrounding)
     cavity     the drawer cavity fill does nothing while it is off with nothing to restore (updateCavityFill)
   MEASURED before them, on the 80-unit build: vault measurements.md "An 80-unit build: where a moving frame's CPU time
   goes". ⚠ Declared beside the scene because scene.onBeforeRender reads it on every render of the scene. */
const MOVE_OPT = { labels: true, shadow: true, grounding: true, cavity: true };
scene.onBeforeRender = watchShadowCasters;   // after three updates world matrices, before its shadow pass

const camera = new THREE.PerspectiveCamera(40, 1, 1, 8000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.52; // don't go under the table

/* ⚠ THE ORBIT COAST IS STOPPED ONCE IT IS INVISIBLE. With damping on, a released drag keeps turning the camera by a
   shrinking amount every update (x0.95, no time term), and that motion takes ~700 updates to round away to nothing.
   MEASURED 2026-09-13 on the A5000 laptop at 120 Hz (orbit-coast-repro): under half a pixel per frame 0.7 s after
   release, but not exactly still until 5.35 s. Everything that waits for a still camera waited with it - Very High's
   settled image restarts on ANY change of the camera matrices, and the powder grain's detail form and the visible layer
   lines exist only in that image; the AO settle uses the same exact compare. So the wait was set by the FRAME COUNT, not
   the GPU: roughly twice as long at 60 fps, and about a minute on an iGPU (Joey 2026-09-14).
   Once one update's own motion is under COAST_STILL_PX drawing-buffer pixels at the orbit target, the rest of the coast
   is dropped: the camera stops where it is - the unplayed remainder is ~19 updates of that motion, under a pixel -
   rather than jumping to where the coast would have ended. The visible glide is untouched. With a button or finger
   still down the threshold is ten times smaller, so a slow pan is not cut off mid-gesture; and never while
   auto-rotating, where the spin adds its angle to the same delta every update and zeroing it would hold the spin at
   the damping factor's share of its speed. The translucent-filament lab's round-39 preview fix (review 01a09d71). */
const COAST_STILL_PX = 0.05;
const _coastPos = new THREE.Vector3(), _coastQuat = new THREE.Quaternion();
function updateOrbit() {
  _coastPos.copy(camera.position); _coastQuat.copy(camera.quaternion);
  controls.update();
  const delta = controls._sphericalDelta, pan = controls._panOffset;
  if (!controls.enableDamping || controls.autoRotate || !delta || !pan) return;
  const dist = camera.position.distanceTo(controls.target);
  const mmPerPx = 2 * dist * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, renderer.domElement.height);
  _coastQuat.invert().multiply(camera.quaternion);
  const turn = 2 * Math.atan2(Math.hypot(_coastQuat.x, _coastQuat.y, _coastQuat.z), Math.abs(_coastQuat.w));
  const px = Math.max(camera.position.distanceTo(_coastPos), turn * dist) / Math.max(mmPerPx, 1e-9);
  if (px < (controls.state === -1 ? COAST_STILL_PX : COAST_STILL_PX / 10)) { delta.set(0, 0, 0); pan.set(0, 0, 0); }
}

const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f98, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(300, 600, 400);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xffffff, 0.5);
fill.position.set(-400, 200, -300);
scene.add(fill);

// table surface + subtle grid, sized generously around any kit
const table = new THREE.Mesh(
  new THREE.CircleGeometry(1400, 64).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0xdadce0, roughness: 0.95 })
);
table.position.y = -0.5;
scene.add(table);
const grid = new THREE.GridHelper(2000, 40, 0xc7cad0, 0xd4d7db);
grid.position.y = 0.01;

// wall backdrop for wall-mount builds: a vertical plane just behind the build
// (case backs sit at z ≈ −92.5), shown instead of the table+grid. Toggled once
// the manifest is known (see below).
const wall = new THREE.Mesh(
  new THREE.PlaneGeometry(6000, 4000),
  new THREE.MeshStandardMaterial({ color: 0xe6e3dd, roughness: 1 })
);
wall.position.set(0, 600, -95);
wall.visible = false;
scene.add(wall);
scene.add(grid);

// mounting-surface slab for under-table builds: the horizontal twin of the wall
// backdrop — the rails screw UP into it and the build hangs below. Sized to the
// build by fitSurface(); hidden whenever the camera rises above its underside so
// the rails/case tops stay inspectable (same rule as the wall's behind-hide).
const surface = new THREE.Mesh(
  new THREE.BoxGeometry(6000, 25, 4000),
  new THREE.MeshStandardMaterial({ color: 0xd9cfc0, roughness: 0.9 })
);
surface.visible = false;
scene.add(surface);

/* IN-PROGRESS TABLETOP PREVIEW (2026-08-23). While a tabletop run is still
   being built up, the generator ships the layout with `manifest.incomplete`
   and `manifest.ghosts`: one box per short column, the volume that is still
   missing before the run's top is level. They are VOLUME, never parts: neutral,
   translucent, with the 0.5H grid drawn inside so a 1H box never reads as
   "a 1H drawer goes here" (a 1H, two 0.5H, or any other fit completes it).
   They live in their own group, outside `instances`, so the BOM, the
   dimension callouts, measuring, identify, exports, shadows, AO and the
   reflection never see them; the passes that walk the scene skip
   `userData.ghost`. Shown only on the preview state (goTo). */
const ghostGroup = new THREE.Group();
ghostGroup.visible = false;
scene.add(ghostGroup);
const GHOST_FILL = new THREE.MeshBasicMaterial({ color: 0x9aa3b8, transparent: true, opacity: 0.16, depthWrite: false });
const GHOST_EDGE = new THREE.LineBasicMaterial({ color: 0xc9d0e4, transparent: true, opacity: 0.9 });
const GHOST_GRID = new THREE.LineBasicMaterial({ color: 0xc9d0e4, transparent: true, opacity: 0.35 });
function buildGhosts() {
  for (const o of [...ghostGroup.children]) { ghostGroup.remove(o); o.traverse(c => { if (c.geometry) c.geometry.dispose(); }); }
  for (const g of (manifest.ghosts || [])) {
    const [w, h, d] = g.size;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w - 2, h - 1, d - 2), GHOST_FILL);
    box.position.set(g.pos[0], g.pos[1] + h / 2, g.pos[2]);
    box.userData.ghost = true;
    box.renderOrder = 2; // after the parts, so the translucent fill composites over them correctly
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), GHOST_EDGE);
    edges.userData.ghost = true;
    box.add(edges);
    // the half-row grid inside the volume: every 0.5H a rectangle, so the box
    // reads as "this much space", not as a drawer of this size
    const pts = [];
    for (let r = 1; r < g.halfRows; r++) {
      const y = -h / 2 + r * (h / g.halfRows);
      const x0 = -(w - 2) / 2, x1 = (w - 2) / 2, z0 = -(d - 2) / 2, z1 = (d - 2) / 2;
      pts.push(x0, y, z1, x1, y, z1,  x1, y, z1, x1, y, z0,  x1, y, z0, x0, y, z0,  x0, y, z0, x0, y, z1);
    }
    if (pts.length) {
      const gridGeo = new THREE.BufferGeometry();
      gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const lines = new THREE.LineSegments(gridGeo, GHOST_GRID);
      lines.userData.ghost = true;
      box.add(lines);
    }
    ghostGroup.add(box);
  }
}
/* The status pill + the chrome. body.incomplete hides every instruction
   surface (controls, dots, note, the embed's Begin button) - this is a
   preview of a layout in progress, not step 1 of 1 of anything. */
function setIncomplete(on) {
  const inc = on ? manifest.incomplete : null;
  document.body.classList.toggle('incomplete', !!inc);
  const pill = document.getElementById('incomplete-status');
  if (pill) {
    pill.classList.toggle('hidden', !inc);
    if (inc) {
      const n = inc.areas;
      pill.querySelector('b').textContent = `Previewing an in-progress tabletop kit · ${n === 1 ? 'one area' : n + ' areas'} remaining`;
      pill.querySelector('span').textContent = 'Fill the outlined space in the planner · any drawer combination that fits · the translucent covers attach once the top is level';
    }
  }
  if (inc) trackOnce('incomplete:preview');
}

// ---- stage themes: light / dark mode (retrowave look, 2026-08-08) ----------
// light = the color-accurate default the filament picks are judged against;
// dark = the retrowave showcase stage (navy room, cyan grid). ONLY the room
// is themed — part materials, lights and the identification palette are never
// touched, and shot mode (?shot=1) still forces its own background. The
// planner relays its hero-bar switch here ({gen2:'theme'}, replayed on every
// viewerReady like the palette relay); standalone gets its own topbar switch.
// The 'light' grid entry is null because the light grid keeps GridHelper's
// two-tone vertex colors; dark flattens to one cyan via material.color.
const STAGE_THEMES = {
  light: { bg: 0xeef0f3, bgWall: 0xd7d4ce, table: 0xdadce0, wall: 0xe6e3dd,
           surface: 0xd9cfc0, grid: null, dim: 0x656a73 },
  // ⚠ wall + surface on the dark stage are MEASURED values (2026-08-23, a
  // relayed review said the wall was "slightly too low contrast"; it was
  // worse - the rendered wall (13,4,49) sat DARKER than the room (21,15,48),
  // luminance ratio 0.55, and the under-table slab 0.88). Desaturated navy-
  // greys from a rendered sweep: the wall renders (40,43,75), L* 18.7, +12
  // L* over the room; the slab (seen from below, lit less, and at its full
  // desk size the far reaches are dimmer still) (34,40,70), L* 17, +12.4
  // over its room. A plane you see at once, still far below the parts.
  // Keep them low-chroma: bluer materials rendered as saturated blue here.
  // ⚠ THE FLOOR WAS LIFTED 0x14163a -> 0x282c66 (2026-09-10, Joey's pick from a
  // four-rung sweep). NOT a mood change for its own sake: the near-black floor
  // was the reason two separate contact cues measured as unusable - a black
  // overlay came in under 5 levels at any strength, and attenuating the
  // reflection only removed the one grounding cue that stage had. Both fail for
  // the same reason, no tonal range near the contact, and the stage colour is an
  // artistic choice rather than a constraint. Measured across the sweep: open
  // floor 20.2 -> 35.6 luminance, and the contact darkening it can carry 3.22 ->
  // 4.77 levels. The next rung up (0x343a7e, 47.8) carried more still and was
  // rejected by eye as "noticeably brighter and bluer" - the deep navy is the
  // point of this stage, so this is the brightest rung that keeps it.
  dark:  { bg: 0x0d0e21, bgWall: 0x150f30, table: 0x282c66, wall: 0x50526e,
           surface: 0x6e7090, grid: 0x2b7f9e, dim: 0x8f9ad8 },
};
// DARK IS THE DEFAULT (Joey 2026-08-08). Both choices are stored explicitly,
// so "no key" can't mean light and a blocked localStorage fails safe to the
// default. ('retrowave' was the stored value's dev-era name — anything but
// 'light' reads as dark.)
// A nav link from the PLANNER (a separate origin, so no shared localStorage)
// can hand its choice over as ?theme=&tt= — newest stamp wins, the same rule
// the palette and store relays use.
try {
  const q = new URLSearchParams(location.search);
  const v = q.get('theme'), tt = +q.get('tt') || 0;
  if ((v === 'dark' || v === 'light') && tt >= (+localStorage.getItem('gen2-theme:t') || 0)) {
    localStorage.setItem('gen2-theme', v);
    localStorage.setItem('gen2-theme:t', String(tt || Date.now()));
  }
} catch (e) { /* private mode */ }
let stageTheme = 'dark';
try { if (localStorage.getItem('gen2-theme') === 'light') stageTheme = 'light'; } catch (e) { /* private mode */ }
// part-preview iframes always run the LIGHT stage machinery, whatever the
// stored theme: the stage itself is invisible (transparent background, no
// furniture), but 'dark' would substitute DARK_STAGE_PALETTE's light Case
// color into the product palette and turn the light-stage-only shadow gates on.
if (IS_PART) stageTheme = 'light';
function applyStageTheme(name) {
  perfGrace();   // a theme flip recompiles programs (the shadow map toggles); the stalls are not a frame rate
  stageTheme = STAGE_THEMES[name] ? name : 'light';
  const t = STAGE_THEMES[stageTheme];
  const wallish = typeof manifest !== 'undefined' && manifest && manifest.mount === 'wall';
  // part-preview: the iframe is TRANSPARENT — the embedding page's panel is the
  // background. Applied here (not at module eval): `party` clones the boot
  // Color at init, and this runs first inside mountManifest, safely after that.
  if (IS_PART) scene.background = null;
  else scene.background.set(wallish ? t.bgWall : t.bg);
  table.material.color.set(t.table);
  wall.material.color.set(t.wall);
  surface.material.color.set(t.surface);
  if (t.grid === null) { grid.material.vertexColors = true; grid.material.color.set(0xffffff); }
  else { grid.material.vertexColors = false; grid.material.color.set(t.grid); }
  grid.material.needsUpdate = true;
  // the outro cinema restores "day" from these clones — keep them honest so
  // leaving the outro lands back on the CURRENT stage, not the boot one
  if (typeof party !== 'undefined' && scene.background) { party.bgDay.set(scene.background); party.tableDay.set(t.table); }
  // dim callouts + drawer interior dims rebuild often, but retint any that
  // are alive right now so a theme flip never strands gray-on-navy lines
  for (const g of [typeof dims !== 'undefined' && dims.group, typeof dFocus !== 'undefined' && dFocus.group]) {
    if (g) g.traverse(o => { if (o.isLineSegments) o.material.color.set(t.dim); });
  }
  document.body.classList.toggle('stage-dark', stageTheme !== 'light');
  // Grounding is stage-specific: the light stage gets a contact shadow, the dark
  // stage a faint reflection (a shadow is invisible on a near-black floor, and
  // lifting the floor to fix that costs the retrowave mood). So a theme flip has
  // to re-pick the mechanism. Guarded: this also runs at module eval, before the
  // quality tier exists.
  // (`var` on purpose: it hoists to `undefined` instead of sitting in a TDZ, so
  // this stays safe no matter when applyStageTheme first runs. A `let` here would
  // throw on `typeof` — the same trap that once took the whole boot down.)
  if (qualityReady) { applyShadowQuality(); applyReflectionQuality(); }
  // the dark stage substitutes part of the instruction palette (see
  // DARK_STAGE_PALETTE), so a theme flip has to repaint the materials
  if (typeof manifest !== 'undefined' && manifest && typeof applyPalette === 'function') applyPalette();
  invalidateFrame();   // stage colours, grid, dim lines - all repainted
}
// NB plain getElementById here — this runs at module eval, BEFORE the `$`
// helper below is initialized (a `$(...)` call here dies on the TDZ and takes
// the whole boot with it)
const btnTheme = document.getElementById('btn-theme');
function labelThemeBtn() {
  if (!btnTheme) return;
  btnTheme.setAttribute('aria-checked', stageTheme === 'dark' ? 'true' : 'false');
  btnTheme.title = stageTheme === 'dark' ? 'Light mode — the color-accurate stage' : 'Dark mode';
}
btnTheme?.addEventListener('click', () => {
  const next = stageTheme === 'dark' ? 'light' : 'dark';
  applyStageTheme(next);
  // stamp the choice so a cross-site handoff can tell whose pick is newer
  try { localStorage.setItem('gen2-theme', next); localStorage.setItem('gen2-theme:t', String(Date.now())); } catch (e) { /* private mode */ }
  labelThemeBtn();
  track('theme:' + next);
});
labelThemeBtn();

// ---- render quality tiers (2026-08-10) -------------------------------------
// Measured on an Intel UHD iGPU with EXT_disjoint_timer_query_webgl2 (gl.finish()
// under-reports by 10-40x — see notes). The studio package costs ~2.4x the shipped
// renderer, and FILL RATE is the axis that decides mobile: at devicePixelRatio 2
// the GPU ceiling alone is ~54 fps. So pixelRatio is the strongest lever and it is
// what degrades first.
//
// `fast` is deliberately BYTE-IDENTICAL to the pre-2026-08-10 renderer, so the
// fallback is a known-good state rather than a half-disabled new one.
// ⚠ `relief` IS THE PRINTED-LAYER TERM, AND IT IS ON THE LADDER BECAUSE OF A MEASUREMENT.
// Benched against the deployed baseline under a forced software rasteriser, the candidate ran at
// 0.739x the deployed frame rate at `high` and 0.452x at `fast` — WORSE at the cheap tier, because
// `fast` turns off the environment, tone mapping, the key light, shadows, reflections and AO while
// the relief, a per-fragment cost, kept running. The ladder's own floor was more than twice as
// expensive as it had been, and a device that steps down BECAUSE it is struggling still paid it.
//
// ⚠ AND IT CANNOT BE A UNIFORM. The vendored module's `setMode` has no 'off': `averaged` still runs
// the whole fragment term, band-limited. Taking the cost away means building the material WITHOUT
// the shader patch, which is why `syncRelief` below drops the material cache when this flips rather
// than poking a handle.
//
// balanced KEEPS it: `balanced` is the tier for a machine that is coping but not comfortable, it
// already halves the pixels at dpr 1.5 — and the relief is fill-bound, so that alone takes most of
// the cost — and dropping the appearance improvement at the first sign of trouble spends the whole
// feature to buy a step the resolution drop has usually already bought.
const QUALITY = {
  /* ⚠ VERY HIGH IS `high` PLUS ONE FLAG, DELIBERATELY. It changes nothing about
     a moving frame - same env, same rig, same shadow, same AO, same dpr - so a
     device that copes with High copes with Very High while you orbit. The whole
     difference is what happens once you stop: see accumFrame(). That is also
     why it is safe to leave reachable on the pill rather than gating it behind
     a GPU sniff.
     It is NOT the default, for two reasons. The settle burst is real work; and
     the two RGBA16F targets plus a depth buffer scale with the DRAWING BUFFER,
     which is the canvas area times the square of the device pixel ratio:
         1920x1080 buffer (a 1080p panel, dpr 1)      ~41 MB
         3024x1964 buffer (a retina laptop at dpr 2) ~119 MB
         3840x2160 buffer (a 4K panel at 200%, dpr 2) ~166 MB
     So the worst case is a high-dpr 4K desktop - which is exactly the machine
     most likely to be able to afford it - and an ordinary laptop pays a quarter
     of that. Dropping MSAA from the scene target (see ACC_WARMUP) is what keeps
     the top of that range at 166 MB instead of four times it. */
  /* ⚠ NO `grounding` FLAG ON ANY TIER. The black-overlay version was built,
     laddered and MEASURED not to work (see updateGrounding): darkening a
     near-black floor has no range, exactly as this repo's own render-lab note
     said before it was built. It is left in the file because the CONTACT MAP it
     computes is what the reflection-attenuation experiment consumes - but it
     draws nothing unless a debug session turns it on. "Harmless" is not a reason
     to leave rendering work enabled in a shipping tier. */
  veryhigh: { env: true,  tone: true,  key: true,  shadow: true,  reflect: true,  ao: true,  dpr: 2,   relief: true,  accum: true },
  high:     { env: true,  tone: true,  key: true,  shadow: true,  reflect: true,  ao: true,  dpr: 2,   relief: true },
  balanced: { env: true,  tone: true,  key: true,  shadow: true,  reflect: false, ao: false, dpr: 1.5, relief: true },
  fast:     { env: false, tone: false, key: false, shadow: false, reflect: false, ao: false, dpr: 1,   relief: false },
};
// the auto-downgrade walks this DOWNWARD only, so Very High sitting at index 0
// means a device that cannot hold it steps back to High and stops there
const QUALITY_ORDER = ['veryhigh', 'high', 'balanced', 'fast'];
var qualityReady = false;   // hoisted (see applyStageTheme) — true once a tier has been applied
/* ⚠ VERY HIGH IS THE DEFAULT since 2026-09-18 (Joey: "can we make very high default?", after the translucency live check on the
   showcase laptop). A visitor with no explicit pick starts here; the silent auto-downgrade still steps a device that cannot hold
   it down to High (QUALITY_ORDER), and an explicit pick is still honoured and locks that out. */
let quality = 'veryhigh';
let qualityLocked = false;   // an explicit user pick stops the auto-downgrade fighting them
// ⚠ An EXPLICIT pick persists; an AUTO-downgrade does not outlive the tab.
// It shipped persisting both, which meant one bad three-second window — a
// throttled tab, a background app, a thermal blip — permanently cost you the good
// renderer, with no way back on mobile because the pill is hidden under 560px.
// Auto lives in sessionStorage so it doesn't re-jank within a visit but is
// re-judged on the next one. A stored value with no `:set` marker is a stale
// auto-downgrade from the old scheme — drop it.
try {
  const q = localStorage.getItem('gen2-quality');
  if (localStorage.getItem('gen2-quality:set') === '1' && QUALITY[q]) { quality = q; qualityLocked = true; }
  else {
    if (q) localStorage.removeItem('gen2-quality');   // migrate the old sticky auto value away
    const s = sessionStorage.getItem('gen2-quality');
    if (QUALITY[s]) quality = s;
  }
} catch (e) { /* private mode */ }
// ?shot=1 is PINNED: the ten gallery cards must not re-shoot themselves every time
// the user-facing default moves (captureShot already forces its own palette for
// the same reason).
const SHOT_QUALITY = 'high';

// Neutral studio environment. Same PMREM-from-a-tiny-scene trick as partyEnv() —
// no .hdr fetch, so it stays offline-safe. WHITE and asymmetric: white keeps hue
// drift ~0 (measured max 2.4 deg vs a tinted room's 121 deg), the asymmetry is
// what reads as "lit" rather than "brighter".
let studioEnvTex = null;
/* ⚠ THE ROOM IS ITS OWN FUNCTION so that nothing has to describe it TWICE. The
   moment a second consumer needs this lighting - a path tracer, which cannot
   read a PMREM and needs an equirectangular source - the panel table becomes
   the kind of number that exists in two places and drifts. It exists here. The
   caller owns disposing what it gets back.
   ⚠ The PMREM's 0.04 blur is applied by `fromScene` and is NOT part of the room:
   anything rebuilding this lighting from the room alone has to apply the
   equivalent angular blur itself, or it is a different environment. */
const STUDIO_SIGMA = 0.04;
function studioRoom() {
  const room = new THREE.Scene();
  const panel = (hex, boost, w, h, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(boost), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); room.add(m);
  };
  panel(0xffffff, 5.0, 9, 9, -7, 7, 5);      // key
  panel(0xffffff, 1.2, 9, 9, 8, 3, 2);       // fill
  panel(0xffffff, 2.2, 12, 3, 0, 5, -10);    // rim
  panel(0x9aa3b0, 0.7, 16, 16, 0, -9, 0);    // floor bounce
  return room;
}
function studioEnv() {
  if (studioEnvTex) return studioEnvTex;
  const room = studioRoom();
  const pmrem = new THREE.PMREMGenerator(renderer);
  studioEnvTex = pmrem.fromScene(room, STUDIO_SIGMA).texture;
  pmrem.dispose();
  room.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return studioEnvTex;
}
// Shipped light rig vs the key-dominant one. Key-dominant is what makes a shadow
// read at all — with the shipped near-even lighting the shadow is washed out.
const LIGHT_RIG = {
  shipped: { hemi: 1.1, sun: 1.6, fill: 0.5 },
  key:     { hemi: 0.15, sun: 1.2, fill: 0.3 },
};
let baseHemi = LIGHT_RIG.shipped.hemi;   // updateCinema fades FROM this, per tier

function applyQuality(name) {
  /* every tier change and every re-mount (mountManifest calls this) compiles programs on the next frames;
     the auto-downgrade must not read those stalls as the new tier's frame rate */
  perfGrace();
  quality = QUALITY[name] ? name : 'high';
  const q = QUALITY[quality];

  renderer.toneMapping = q.tone ? THREE.NeutralToneMapping : THREE.NoToneMapping;
  // ⚠ NOT ACES. Measured median hue error: none 0.9 deg, Khronos Neutral 2.5 deg,
  // ACES 5.3 deg. Neutral exists for product rendering where colour is a promise.

  const rig = q.key ? LIGHT_RIG.key : LIGHT_RIG.shipped;
  baseHemi = rig.hemi;
  if (!cinema.on) hemi.intensity = rig.hemi;
  sun.intensity = rig.sun;
  fill.intensity = rig.fill;

  // The outro owns scene.environment while it runs — don't stomp the party room.
  if (!cinema.on) scene.environment = q.env ? studioEnv() : null;

  qualityReady = true;
  /* ⚠ AFTER the tier is assigned and BEFORE the frame that follows it. syncRelief reads `quality`,
     so calling it earlier would rebuild against the tier being replaced. */
  syncRelief();
  guardFx('grounding', updateGrounding);
  applyShadowQuality();
  guardFx('reflection', applyReflectionQuality);   // also builds the render target
  labelQualityBtn();
}
function setQuality(name, { user = false } = {}) {
  applyQuality(name);
  if (user) qualityLocked = true;
  try {
    if (user) { localStorage.setItem('gen2-quality', quality); localStorage.setItem('gen2-quality:set', '1'); }
    else sessionStorage.setItem('gen2-quality', quality);   // this visit only — see the boot note
  } catch (e) { /* private mode */ }
  if (user) track('quality:' + quality);
}

// ---- contact shadow (light stage) ------------------------------------------
// The build is STATIC between steps, so the shadow map is rendered on demand and
// then left alone — costing nothing per frame until something moves.
// ⚠ Two r185 traps, both silent: PCFSoftShadowMap is DEPRECATED (three warns and
// substitutes PCFShadowMap), and the shadow pass bails at the TOP on
// renderer.shadowMap.needsUpdate — setting light.shadow.needsUpdate alone never
// reaches the per-light loop and you get a valid-looking 1024² map that is never
// sampled.
function shadowsWanted() {
  // part-preview floats the part on a transparent stage — no floor, no catcher
  return QUALITY[quality].shadow && stageTheme === 'light' && !cinema.on && !isWallBuild && !isUnderTableBuild && !IS_PART;
}
function applyShadowQuality() {
  const on = shadowsWanted();
  if (renderer.shadowMap.enabled === on && !on) return;
  renderer.shadowMap.enabled = on;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  sun.castShadow = on;
  for (const inst of instances.values()) setPartShadows(inst.group, on);
  table.receiveShadow = on;
  if (on) fitShadowCamera();
  // shadowMap.enabled is in the program cache key and three does NOT auto-detect
  // the flip — every material must recompile or nothing changes on screen.
  scene.traverse(o => {
    if (!o.material) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) m.needsUpdate = true;
  });
}
/* A PART CHANGED WHILE NOTHING MOVES ASKS FOR ITS OWN SHADOW RENDER (Joey relaying Astra, 2026-09-14). The map re-renders on
   moving frames (watchShadowCasters) and once when motion settles, so a change made at rest never reached it: Back after
   the user took the camera left the previous step's shadows on screen until the next move (p30, 94,749-189,496 pixels),
   and so did the checklist page and both style swaps (p31). The at-rest writers of what the shadow pass reads call this -
   applyState, applyExploded, computeBounds and the two swaps; every other writer of part transforms or visibility runs
   inside a tween, which the moving gate covers. It changes only frames whose map was stale: a re-render with the same
   casters draws the same map.
   ⚠ NOT by making a snap count as motion: perf.moving also drives the resolution drop and holds Very High's accumulation,
   so frames that are not stale would change too. The swap half reached production first as the 4279c3f hotfix. */
function markShadowDirty() {
  if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true;
}
/* castShadow + receiveShadow for a part's meshes. The template roots are never flagged, so the clones a handle swap or a
   static kit's faceplate swap adds had neither - the new part cast and received no shadow until the stage or tier was
   re-applied (MEASURED 2026-09-14: 0 of 8 plate meshes, 0 of 4 and 0 of 3 handle meshes; a remembered non-default handle
   lost them again on every regenerate). receiveShadow is a per-object uniform in r185, so a clone sharing a material
   needs no recompile. */
function setPartShadows(root, on) {
  root.traverse(o => { if (o.isMesh) { o.castShadow = on; o.receiveShadow = on; } });
}
function fitShadowCamera() {
  if (!sun.castShadow || typeof assembledBox === 'undefined' || assembledBox.isEmpty()) return;
  const size = new THREE.Vector3(), c = new THREE.Vector3();
  assembledBox.getSize(size); assembledBox.getCenter(c);
  /* ⚠ A SPHERE WHEN THE KEY LIGHT MOVES. `high` fits the box for one fixed
     light direction; Very High sweeps the light over a 6-degree disc, and a box
     fit for the centre clips on the outer samples - a clipped frustum drops the
     shadow entirely for those samples, which averages into a pale band rather
     than an obvious error. The bounding sphere is rotation-invariant, so one
     fit covers every sample (review catch, 2026-09-09). */
  const r = QUALITY[quality].accum
    ? size.length() / 2 + 60
    : Math.max(size.x, size.y, size.z) * 0.85 + 40;
  const cam = sun.shadow.camera;
  cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
  cam.near = 1; cam.far = 3000;
  cam.updateProjectionMatrix();
  sun.target.position.copy(c);
  if (!sun.target.parent) scene.add(sun.target);
  sun.target.updateMatrixWorld();
  /* Texel density is the FLOOR on the contact sharpness the accumulation can
     deliver: no number of light samples makes a shadow edge finer than one
     shadow-map texel plus the PCF tap. Very High spends the memory. */
  const sm = QUALITY[quality].accum ? 2048 : 1024;
  if (sun.shadow.mapSize.x !== sm) {
    sun.shadow.mapSize.set(sm, sm);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }   // three only allocates once
  }
  // world units are MILLIMETRES and parts are 2-3mm thick — normalBias has to be a
  // fraction of a mm, not the ~0.02 a tutorial suggests
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  renderer.shadowMap.needsUpdate = true;   // THE flag that matters (see above)
}

/* THE SHADOW MAP RE-RENDERS WHEN WHAT IT SHOWS CHANGED (MOVE_OPT.shadow, Joey and Astra 2026-09-14).
   It used to re-render on every frame `perf.moving` was true, and a moving CAMERA sets that - so an orbit on the light
   stage drew every caster twice per frame. MEASURED on the 80-unit build at a 4x CPU throttle, High: holding it while
   only the camera moved saved 13.3 ms of a 45 ms frame (20.5 -> 28.0 fps), 2,539 -> 1,271 draw calls.
   What the map holds depends on the casters and the key light, never on the view camera: a directional light fixed in
   the scene, a shadow camera fitted to the assembled bounds (fitShadowCamera). So this compares exactly those against
   the last look and asks for a shadow render when any of them differ:
     each caster (the instance meshes - applyShadowQuality flags exactly those): the mesh itself, its world matrix,
     visible all the way up the tree, castShadow, its layers, its geometry, its material and that material's version;
     the key light: its world matrix, its target's, and its shadow camera's projection.
   It runs from scene.onBeforeRender, which three calls on EVERY render of the scene - after updating every world
   matrix, before the shadow pass - so a part moved this frame (a tween, a snap in applyState, a fade that hides a group)
   is in this frame's shadow.
   ⚠ ONLY ON THE FRAMES THE OLD CODE RE-RENDERED THE MAP ON: `moving` mirrors perf.moving (qualityTick writes it).
   At rest the old code left the map alone and so does this - the walk is not free: MEASURED on the 80-unit build it
   added ~1 ms to every IDLE light-stage frame unthrottled and several ms at a 4x CPU throttle (p29, 2026-09-14), where
   the old code spent nothing. Gated like that, on every moving frame the map holds exactly what the old code's map held.
   A change made AT REST is not the watch's job: the writers that make one ask for the render themselves (markShadowDirty).
   ⚠ `var`, for the same reason as perfGraceUntil: nothing may read a `let`/`const` before its line has run - which is
   also why the gate is a field here and not a read of `perf` (declared far below; a render can precede it). */
var shadowWatch = { n: -1, meshes: [], mats: [], geos: [],
  m: new Float64Array(0), flags: new Uint8Array(0), layers: new Uint32Array(0), ver: new Float64Array(0),
  light: new Float64Array(48), stack: [], vis: [], moving: false };
function watchShadowCasters() {
  if (!renderer.shadowMap.enabled || !MOVE_OPT.shadow || !shadowWatch || !shadowWatch.moving) return;
  if (shadowInputsChanged(shadowWatch)) renderer.shadowMap.needsUpdate = true;
}
/* true when `into[at..at+15]` differed from `elements`; stores them either way */
function storeChanged16(into, at, elements) {
  let changed = false;
  for (let k = 0; k < 16; k++) { const v = elements[k]; if (into[at + k] !== v) { into[at + k] = v; changed = true; } }
  return changed;
}
function shadowInputsChanged(W) {
  let changed = storeChanged16(W.light, 0, sun.matrixWorld.elements);
  if (storeChanged16(W.light, 16, sun.target.matrixWorld.elements)) changed = true;
  if (storeChanged16(W.light, 32, sun.shadow.camera.projectionMatrix.elements)) changed = true;
  // walk every instance's subtree, carrying "visible all the way up" down the stack
  const stack = W.stack, vis = W.vis;
  stack.length = 0; vis.length = 0;
  for (const inst of instances.values()) { stack.push(inst.group); vis.push(true); }
  let j = 0;
  while (stack.length) {
    const o = stack.pop(), shown = vis.pop() && o.visible;
    if (o.isMesh) {
      if (j >= W.n) {   // more meshes than last time: grow and count it as a change
        const n = Math.max(64, (j + 1) * 2);
        const m = new Float64Array(n * 16); m.set(W.m); W.m = m;
        const flags = new Uint8Array(n); flags.set(W.flags); W.flags = flags;
        const layers = new Uint32Array(n); layers.set(W.layers); W.layers = layers;
        const ver = new Float64Array(n); ver.set(W.ver); W.ver = ver;
        W.n = n; changed = true;
      }
      if (W.meshes[j] !== o) { W.meshes[j] = o; changed = true; }
      if (W.mats[j] !== o.material) { W.mats[j] = o.material; changed = true; }
      if (W.geos[j] !== o.geometry) { W.geos[j] = o.geometry; changed = true; }
      const mat = o.material;
      const version = Array.isArray(mat) ? mat.reduce((s, x) => s + (x ? x.version : 0), 0) : (mat ? mat.version : 0);
      if (W.ver[j] !== version) { W.ver[j] = version; changed = true; }
      const flag = (shown ? 1 : 0) | (o.castShadow ? 2 : 0);
      if (W.flags[j] !== flag) { W.flags[j] = flag; changed = true; }
      // three's shadow pass tests each object's layers against the VIEW camera's (renderObject), which nothing changes
      if (W.layers[j] !== o.layers.mask >>> 0) { W.layers[j] = o.layers.mask >>> 0; changed = true; }
      if (storeChanged16(W.m, j * 16, o.matrixWorld.elements)) changed = true;
      j++;
    }
    const children = o.children;
    for (let k = children.length - 1; k >= 0; k--) { stack.push(children[k]); vis.push(shown); }
  }
  if (W.meshes.length !== j) { W.meshes.length = j; W.mats.length = j; W.geos.length = j; changed = true; }
  return changed;
}

/* ⚠ DECLARED HERE, ABOVE THE REFLECTOR, AND THAT POSITION IS LOAD-BEARING.
   ensureReflector() binds these arrays as uniforms and uses GROUND_MAX as a
   shader define, and it can run during module evaluation via applyQuality.
   A `const` referenced before its declaration is a TDZ crash that takes the
   whole boot down - the `#btn-theme` and `lipUnit` lesson, twice already. */
const GROUND_MAX = 24;          // patches per frame; a 6H board's low parts fit easily
const GROUND_H = 90;            // mm above the stage past which a part contributes nothing
const _gv = new THREE.Vector3();
/* ⚠ THE ARRAYS ARE ALLOCATED HERE, NOT IN ensureGrounding(). The reflector's
   material binds them as uniforms when IT is first built, and there is no
   ordering guarantee between the two - a null uniform array is a silently dead
   shader, not an error. */
const ground = {
  mesh: null, mat: null, boxes: null, rev: -1,
  pos: new Float32Array(GROUND_MAX * 2),   // world x, z
  siz: new Float32Array(GROUND_MAX * 2),   // half-extent x, z (already widened by height)
  str: new Float32Array(GROUND_MAX),
  seen: null,   // what the map was last computed from (groundingInputsChanged); null = compute next frame
};
/* Whether the contact MAP is computed. Deliberately separate from whether the
   black overlay is DRAWN (`QUALITY[...].grounding`, off on every shipping tier):
   the reflection-attenuation experiment needs the points and not the overlay. */
function contactMapWanted() {
  return stageTheme === 'dark' && !cinema.on
    && !isWallBuild && !isUnderTableBuild && !IS_PART && !fxDead.grounding
    && typeof assembledBox !== 'undefined' && !assembledBox.isEmpty();
}

// ---- planar floor reflection (dark stage) ----------------------------------
// The dark stage cannot use a shadow: the floor is already near-black, so there is
// no luminance range left to darken, and lifting it costs the retrowave mood. A
// faint blurred reflection grounds the build while keeping the deep navy.
// Refreshed only when the camera or the build moves.
const refl = { rt: null, mesh: null, cam: null, tex: new THREE.Matrix4(), key: '', renderCount: 0 };
/* The reflection's resting opacity. A moving camera sets the uniform to 0 and skips the mirror render
   (see updateReflection), so this is the value it comes back to. */
const REFL_OPACITY = 0.16;
function reflectionWanted() {
  if (fxDead.reflection || !QUALITY[quality].reflect) return false;
  if (IS_PART) return false; // no floor to reflect in on the preview's clean float
  // Both hanging mounts are excluded for the same reason: there is no floor
  // beneath the build to reflect in. A wall build hangs on a backdrop, and an
  // under-table build hangs BELOW its slab — a mirror plane at the build's
  // underside would just be floating in mid-air.
  if (isWallBuild || isUnderTableBuild) return false;
  // The outro fades the room to night in BOTH themes, so the finale is grounded
  // even for someone working on the light stage.
  if (cinema.on) return true;
  return stageTheme !== 'light';
}
function ensureReflector() {
  if (refl.mesh) return refl.mesh;
  const S = 512;                                   // low res IS most of the blur
  refl.rt = new THREE.WebGLRenderTarget(S, S);
  refl.rt.texture.minFilter = THREE.LinearFilter;
  refl.rt.texture.magFilter = THREE.LinearFilter;
  refl.cam = new THREE.PerspectiveCamera();
  /* ⚠⚠ uContact IS AN EXPERIMENT AND DEFAULTS TO OFF (0).
     The reasoning behind it: on the dark stage the only thing with any luminance
     RANGE is this reflection - it is worth up to +47 levels where the build
     stands, while a black overlay measured under 5. So a contact cue has a
     chance if it modulates the reflection instead of painting darkness.
     ⚠ IT IS NOT A PHYSICAL CORRECTION AND MUST NOT BE DESCRIBED AS ONE. A real
     reflection runs right up to the contact point; suppressing it near contact
     is an ARTISTIC grounding device that may read as convincing or may read as a
     dark halo round the feet. The picture decides, and until it has, this is 0.
     ⚠ Deliberately narrow: it scales the existing alpha and touches nothing
     else, so the reflected feet stay recognisable rather than being cut away. */
  const mat = new THREE.ShaderMaterial({
    uniforms: { tRefl: { value: refl.rt.texture }, textureMatrix: { value: refl.tex },
                uOpacity: { value: REFL_OPACITY }, uBlur: { value: 1.2 },
                uContact: { value: 0 },
                uPos: { value: ground.pos }, uSiz: { value: ground.siz },
                uStr: { value: ground.str }, uCount: { value: 0 } },
    defines: { GROUND_MAX },
    vertexShader: `
      uniform mat4 textureMatrix;
      varying vec4 vProj; varying vec2 vUv; varying vec2 vXZ;
      void main(){ vUv = uv; vProj = textureMatrix * vec4( position, 1.0 );
        vXZ = ( modelMatrix * vec4( position, 1.0 ) ).xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
    fragmentShader: `
      uniform sampler2D tRefl; uniform float uOpacity, uBlur, uContact;
      uniform vec2 uPos[ GROUND_MAX ]; uniform vec2 uSiz[ GROUND_MAX ];
      uniform float uStr[ GROUND_MAX ]; uniform int uCount;
      varying vec4 vProj; varying vec2 vUv; varying vec2 vXZ;
      void main(){
        vec2 uv = vProj.xy / vProj.w;
        float d = distance( vUv, vec2( 0.5 ) );
        float r = uBlur * ( 0.0015 + d * 0.014 );
        vec3 c = texture2D( tRefl, uv ).rgb * 0.28;
        c += texture2D( tRefl, uv + vec2( r, 0.0 ) ).rgb * 0.18;
        c += texture2D( tRefl, uv - vec2( r, 0.0 ) ).rgb * 0.18;
        c += texture2D( tRefl, uv + vec2( 0.0, r ) ).rgb * 0.18;
        c += texture2D( tRefl, uv - vec2( 0.0, r ) ).rgb * 0.18;
        float a = uOpacity * smoothstep( 0.5, 0.05, d );
        if ( uContact > 0.0 ) {
          float open = 1.0;
          for ( int i = 0; i < GROUND_MAX; i++ ) {
            if ( i >= uCount ) break;
            float rr = length( ( vXZ - uPos[ i ] ) / uSiz[ i ] );
            float k = 1.0 - smoothstep( 0.0, 1.0, rr );
            open *= 1.0 - uStr[ i ] * k * k;
          }
          a *= mix( 1.0, open, clamp( uContact, 0.0, 1.0 ) );
        }
        gl_FragColor = vec4( c, a );
      }`,
    transparent: true, depthWrite: false,
  });
  // ⚠ Geometry stays in its native XY (+Z normal) and the OBJECT is rotated — the
  // reflection maths reads the normal out of the object's rotation, so baking
  // rotateX into the vertices would mirror the scene about the wrong plane.
  refl.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  refl.mesh.rotation.x = -Math.PI / 2;
  refl.mesh.renderOrder = 1;
  refl.mesh.raycast = () => {};      // never a tap-to-identify target
  refl.mesh.visible = false;
  scene.add(refl.mesh);
  return refl.mesh;
}
function applyReflectionQuality() {
  const on = reflectionWanted();
  if (!on) { if (refl.mesh) refl.mesh.visible = false; return; }
  ensureReflector();
  refl.mesh.visible = true;
  fitReflector();
  updateReflection(true);
}
function fitReflector() {
  if (!refl.mesh || typeof assembledBox === 'undefined' || assembledBox.isEmpty()) return;
  const size = new THREE.Vector3(), c = new THREE.Vector3();
  assembledBox.getSize(size); assembledBox.getCenter(c);
  const s = Math.max(size.x, size.z) * 4.0;
  refl.mesh.scale.set(s, s, 1);
  refl.mesh.position.set(c.x, assembledBox.min.y + 0.08, c.z);
  refl.mesh.updateMatrixWorld(true);
}
const _rRw = new THREE.Vector3(), _rCw = new THREE.Vector3(), _rN = new THREE.Vector3(),
      _rRot = new THREE.Matrix4(), _rView = new THREE.Vector3(), _rLook = new THREE.Vector3(),
      _rTgt = new THREE.Vector3();
function updateReflection(force = false, moving = false) {
  if (!refl.mesh || !refl.mesh.visible) return;
  /* ⚠ WHILE THE CAMERA MOVES THE MIRROR IS NOT RENDERED AND THE FLOOR SHOWS NO REFLECTION (Joey and
     Astra, 2026-09-14). The mirror render draws the whole build a second time on every moving frame -
     on an 80-unit build a third of the 3,812 draw calls a High frame made - and a floor reflection is
     not what anyone is watching mid-orbit. It is hidden, not frozen: a mirror image rendered for the
     last still view would slide against the floor as the camera turns. The render loop passes `moving`
     (motionLite); a forced call, from a tier change, always renders. */
  const u = refl.mesh.material.uniforms;
  if (moving && !force) { u.uOpacity.value = 0; refl.key = ''; return; }
  if (u.uOpacity.value !== REFL_OPACITY) { u.uOpacity.value = REFL_OPACITY; force = true; }
  const key = camera.position.toArray().concat(controls.target.toArray(), refl.mesh.position.toArray())
    .map(v => v.toFixed(1)).join();
  if (!force && key === refl.key) return;
  refl.key = key;
  _rRw.setFromMatrixPosition(refl.mesh.matrixWorld);
  _rCw.setFromMatrixPosition(camera.matrixWorld);
  _rRot.extractRotation(refl.mesh.matrixWorld);
  _rN.set(0, 0, 1).applyMatrix4(_rRot);
  _rView.subVectors(_rRw, _rCw);
  if (_rView.dot(_rN) > 0) return;                 // camera is below the floor
  _rView.reflect(_rN).negate().add(_rRw);
  _rRot.extractRotation(camera.matrixWorld);
  _rLook.set(0, 0, -1).applyMatrix4(_rRot).add(_rCw);
  _rTgt.subVectors(_rRw, _rLook).reflect(_rN).negate().add(_rRw);
  // ⚠ must be a RIGID transform (reflect position, reflect up, lookAt the reflected
  // target). Building it from a determinant -1 reflection matrix flips winding
  // order and culls every front face.
  const vc = refl.cam;
  vc.position.copy(_rView);
  vc.up.set(0, 1, 0).applyMatrix4(_rRot).reflect(_rN);
  vc.lookAt(_rTgt);
  vc.near = camera.near; vc.far = camera.far;
  vc.updateMatrixWorld();
  vc.projectionMatrix.copy(camera.projectionMatrix);
  refl.tex.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  refl.tex.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse).multiply(refl.mesh.matrixWorld);
  // Reflect the PRODUCT only — grid, dim callouts and measure markers bounced back
  // at the viewer read as clutter, not as depth.
  const hidden = [];
  const hide = o => { if (o.visible) { o.visible = false; hidden.push(o); } };
  hide(refl.mesh); hide(grid);
  scene.traverse(o => { if ((o.isLine || o.isLineSegments || o.isSprite || o.userData.ghost) && o.visible) hide(o); });
  const prevBg = scene.background;
  scene.background = null;
  renderer.setRenderTarget(refl.rt);
  renderer.clear();
  renderer.render(scene, vc);
  renderer.setRenderTarget(null);
  refl.renderCount++;   // the settle benchmark's "the mirror came back" reading (settle-bench.js)
  scene.background = prevBg;
  for (const o of hidden) o.visible = true;
}

// ---- ambient occlusion -----------------------------------------------------
// Hand-rolled half-res SSAO. No EffectComposer: the beauty pass never goes through
// a render target — AO is rendered into its own buffer and laid over the finished
// frame as a fullscreen quad, so the normal render path is untouched.
// Measured cost: ~0.19 ms/frame steady (one bilinear quad); after a settle, a
// ~16-frame accumulation burst at ~1 ms/frame (jittered depth+normals + SSAO
// + half-res bilateral), then EXACTLY zero work until something moves.
//
// ⚠ The scene is REAL MILLIMETRES. AO_RADIUS is in mm (~18mm reads the case seams
// and drawer gaps); a tutorial's 0.5 "units" is a sub-pixel no-op here.
// ⚠ Do NOT composite with MultiplyBlending. Measured: MultiplyBlending and
// NoBlending produced byte-identical frames (the blend mode was ignored and the
// quad simply REPLACED the frame). Black-with-alpha has no such ambiguity.
const AO_N = 24, AO_ACCUM = 16, AO_RADIUS = 18, AO_STRENGTH = 1.15, AO_DEPTH_TOL = 12;
// AO engages only after this much CONTINUOUS quiet (2026-08-24, Joey's
// flicker report): playStep's phase boundaries leave 1-2 tween-free frames
// (the next phase's tweens are scheduled in a microtask after the frame that
// finished the last one), and a single quiet frame used to render AND
// composite pass 1 - a one-frame dark blink between animations (measured on
// the step-7 playback: three flash-frame pairs per step, p99 darkening 37
// luma levels). 300ms also outlasts the ~160ms settle that restores
// pixelRatio, so the burst no longer starts once only to be thrown away by
// the resize.
const AO_ENGAGE_MS = 300;
const ao = { rtN: null, rtAO: null, normalMat: null, aoMat: null, compMat: null,
             quad: null, qScene: null, qCam: null, key: '', busy: false,
             // settle accumulation (2026-08-23): passes = how many jittered
             // SSAO passes the buffer currently averages for THIS camera;
             // accumMax = 16 with a float-renderable target, 1 without (the
             // running mean needs more than 8 bits or late passes quantize
             // away); rev = scene revision, bumped by mountManifest - the
             // old `instances.size + cur` key survived a regenerate that
             // replaced every part, and a stale buffer accumulated 16 passes
             // of confidence in geometry that no longer exists.
             // quietAt = when the current quiet spell began (-1 = not quiet;
             // -Infinity = seeded by a force pass so scripted captures never
             // wait out AO_ENGAGE_MS)
             passes: 0, accumMax: 1, groups: null, rev: 0, rtBlur: null, blurMat: null, quietAt: -1,
             // the wall / under-table slab ride the AO pass, so the cases cast
             // a contact shadow onto what they are mounted to (2026-08-23).
             // The TABLE never does - a floor disc occludes itself into a grey
             // wash at grazing angles. The site's frame capture turns this off
             // for its plain pass (the core's shading must match across mounts).
             backdrops: true, passCount: 0 };
// ⚠ `!tweens.size` is load-bearing, not an optimisation. The AO buffer is
// regenerated off a key built from the CAMERA — but a step animation moves the
// PARTS while the camera sits still, so the key never changes, the stale buffer
// keeps compositing, and the occlusion stays painted where the part used to be.
// That showed up on a real device as a shadow floating behind every moving piece
// (Joey 2026-08-10, worst on the light stage). Parts in motion get no AO at all;
// it comes back on settle, which also drops the cost during the busiest frames.
// !IS_PART: the AO composite is a blurred black-alpha quad — on the preview's
// TRANSPARENT background its half-res bleed draws a dark halo just outside the
// part's silhouette, over the embedding page's panel (2026-08-19 design
// review). And the idle turntable would invalidate it every frame anyway.
/* ⚠ !tweens.size is a LIVE-PERFORMANCE choice (AO skipped while anything
   animates) - and therefore the exact mechanism of the filmed-clip flicker:
   engine-tweened footage ships AO-less frames, then AO pops in at rest. The
   film rig needs AO HELD ON through tweens for consistent frames, so the
   window flag below exists for capture harnesses only. It costs production
   nothing (undefined stays falsy) and replaces the old git-archive-and-patch
   ritual (NEXT-SESSION 2026-08-30) now that this repo owns its own filming. */
function aoWanted() { return QUALITY[quality].ao && !cinema.on && !fxDead.ao && (!tweens.size || window.__FILM_AO_DURING_TWEENS) && !IS_PART; }
/* Every accumulation pass gets its OWN full 24-point golden-angle spiral -
   the shipped kernel's angular quality (max azimuth gap ~20 deg) - rotated by
   an equally-spaced g/groups turn and radius-interleaved by (g+0.5)/groups,
   so the 16-hand union is 384 DISTINCT azimuths and radii. Two designs were
   REJECTED by review before this one (2026-08-23):
   - jittering ONE kernel by golden-RATIO rotations: the kernel's own step is
     0.381966 turns and the golden-ratio conjugate is its negative mod 1, so
     16 passes collapse to ~39 distinct azimuths;
   - stride-dealing one 384-point spiral into 16 hands: 16*goldenAngle is
     ~1/9 turn, so each HAND was nine tight clusters (azimuth gaps 1.1-39
     deg) - and pass 0 is what every MOTION frame and the byte fallback use,
     so single-pass quality had silently regressed below the shipped kernel.
   The g/groups offsets are RATIONAL, the kernel step irrational - no
   resonance, no collisions. */
/* Sub-texel jitter per accumulation pass (in half-res texel units): the
   passes render the SCENE grid shifted by fractions of a texel, so the
   accumulated buffer is grid-SUPERSAMPLED - occlusion terminators (the
   shadow boundary under a drawer lip) come out anti-aliased instead of
   quantized to half-res stairs. Pass 0 is unjittered, so a single-pass
   frame (motion, the byte fallback) is exactly the old picture. */
const AO_JITTER = (() => {
  const j = [new THREE.Vector2(0, 0)];
  for (let i = 1; i < 16; i++) j.push(new THREE.Vector2(((i % 4) - 1.5) / 4, ((i >> 2) - 1.5) / 4));
  return j;
})();
const _aoProj = new THREE.Matrix4(), _aoProjInv = new THREE.Matrix4();

function aoKernelGroups(n, groups) {
  return Array.from({ length: groups }, (_, g) => {
    const k = [];
    for (let i = 0; i < n; i++) {
      const t = (i + (g + 0.5) / groups) / n;             // radius interleave across hands
      const a = (i * 0.381966 + g / groups) * 6.2831853;  // full spiral + equal-spaced hand rotation
      const r = Math.sqrt(t), z = Math.sqrt(Math.max(0, 1 - r * r));
      k.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z)
        .multiplyScalar(0.3 + 0.7 * (t ** 2)));           // cluster near the origin
    }
    return k;
  });
}
/* A complete RGBA16F framebuffer proves renderability, not that the
   constant-alpha running-mean blend behaves. Verify the arithmetic once, on
   the device: write 0.8, blend 0.0 at blendAlpha 0.25, expect 0.6. On any
   failure (bad blend, unreadable float framebuffer) accumulation is turned
   OFF - single-pass AO with the new noise and bilateral chain is the shipped
   fallback, never a silently-shimmering half-working mean. */
function aoBlendProbe() {
  let rt = null, mat = null, quad = null;
  const prevAuto = renderer.autoClear;
  try {
    const gl = renderer.getContext();
    rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
    mat = new THREE.ShaderMaterial({
      uniforms: { uV: { value: 0.8 } },
      vertexShader: `void main(){ gl_Position = vec4( position.xy, 0.0, 1.0 ); }`,
      fragmentShader: `uniform float uV; void main(){ gl_FragColor = vec4( vec3( uV ), 1.0 ); }`,
      depthTest: false, depthWrite: false,
    });
    quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    const sc = new THREE.Scene(); sc.add(quad);
    const cam = new THREE.Camera();
    renderer.setRenderTarget(rt);
    mat.blending = THREE.NoBlending;
    renderer.render(sc, cam);
    mat.uniforms.uV.value = 0.0;
    mat.blending = THREE.CustomBlending;
    mat.blendEquation = THREE.AddEquation;
    mat.blendSrc = THREE.ConstantAlphaFactor;
    mat.blendDst = THREE.OneMinusConstantAlphaFactor;
    mat.blendAlpha = 0.25;
    renderer.autoClear = false;
    renderer.render(sc, cam);
    // read one pixel back in whatever float format the device offers
    const fmt = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT);
    const type = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);
    let r = NaN;
    if (fmt === gl.RGBA && type === gl.FLOAT) {
      const b = new Float32Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, b); r = b[0];
    } else if (fmt === gl.RGBA && type === gl.HALF_FLOAT) {
      const b = new Uint16Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.HALF_FLOAT, b);
      const h = b[0], sgn = h >> 15 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
      r = e === 0 ? sgn * f * 2 ** -24 : sgn * (1 + f / 1024) * 2 ** (e - 15);
    }
    renderer.setRenderTarget(null);
    const pass = Math.abs(r - 0.6) < 0.02;
    if (!pass) { console.warn('[gen2] AO accumulation probe failed (read ' + r + ') — single-pass AO only'); track('error:fx-ao-accum'); }
    return pass;
  } catch (e) {
    console.warn('[gen2] AO accumulation probe threw — single-pass AO only', e);
    track('error:fx-ao-accum');
    return false;
  } finally {
    // ⚠ unconditional: a throw between autoClear=false and its inline restore
    // used to leave the MAIN renderer never clearing again (frame trails),
    // with the exception swallowed here so guardFx never saw it (post-work
    // review blocker). State first, disposals after.
    renderer.autoClear = prevAuto;
    renderer.setRenderTarget(null);
    if (rt) rt.dispose();
    if (mat) mat.dispose();
    if (quad) quad.geometry.dispose();
  }
}

function ensureAO() {
  if (ao.rtN) return;
  const w = Math.max(2, Math.floor(canvas.width * 0.5)), h = Math.max(2, Math.floor(canvas.height * 0.5));
  ao.rtN = new THREE.WebGLRenderTarget(w, h);
  ao.rtN.depthTexture = new THREE.DepthTexture(w, h);
  ao.rtN.depthTexture.type = THREE.UnsignedIntType;
  // The accumulation target must be float-renderable: a running mean in 8 bits
  // quantizes late passes to nothing. EXT_color_buffer_float guarantees
  // RGBA16F renderability (and 16F blending); the completeness probe below
  // catches a driver that advertises the extension and lies - the failure
  // mode is not a throw guardFx could see, it is an incomplete framebuffer
  // that silently renders nothing and composites a full-screen black overlay.
  ao.accumMax = 1;
  if (renderer.extensions.has('EXT_color_buffer_float')) {
    ao.rtAO = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
    const gl = renderer.getContext();
    renderer.setRenderTarget(ao.rtAO);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    renderer.setRenderTarget(null);
    if (ok && aoBlendProbe()) ao.accumMax = AO_ACCUM;
    else { ao.rtAO.dispose(); ao.rtAO = null; }
  }
  // fullscreen-quad targets never use depth - the default depthBuffer:true
  // silently costs ~3.5 MB each at dpr 2 (post-work review)
  if (!ao.rtAO) ao.rtAO = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false });
  ao.rtBlur = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false });   // denoised copy (8 bits is plenty for display)
  ao.groups = aoKernelGroups(AO_N, AO_ACCUM);
  ao.normalMat = new THREE.MeshNormalMaterial();     // view-space normals in RGB
  ao.aoMat = new THREE.ShaderMaterial({
    defines: { N: AO_N },
    uniforms: {
      tNormal: { value: ao.rtN.texture }, tDepth: { value: ao.rtN.depthTexture },
      uProj: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() },
      uKernel: { value: ao.groups[0] },
      uRadius: { value: AO_RADIUS }, uBias: { value: 0.6 },
      uRes: { value: new THREE.Vector2(w, h) },
      uNoiseOff: { value: new THREE.Vector2(0, 0) }, uJitter: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`,
    fragmentShader: `
      uniform sampler2D tNormal; uniform sampler2D tDepth;
      uniform mat4 uProj, uProjInv; uniform vec3 uKernel[N];
      uniform float uRadius, uBias, uJitter; uniform vec2 uRes, uNoiseOff;
      varying vec2 vUv;
      vec3 viewPos( vec2 uv ){
        float d = texture2D( tDepth, uv ).x;
        vec4 c = uProjInv * vec4( uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 );
        return c.xyz / c.w;
      }
      void main(){
        float d = texture2D( tDepth, vUv ).x;
        if ( d >= 1.0 ) { gl_FragColor = vec4( 1.0 ); return; }   // background: no AO
        vec3 p = viewPos( vUv );
        vec3 n = normalize( texture2D( tNormal, vUv ).xyz * 2.0 - 1.0 );
        // Interleaved gradient noise (Jimenez) over PIXEL coords - even error
        // distribution where the old white-noise hash clumped into speckle.
        // uNoiseOff scrolls the domain per accumulation pass; uJitter adds an
        // unrelated phase (plastic number, NOT the golden ratio - see
        // aoKernelGroups for the resonance this avoids).
        vec2 px = gl_FragCoord.xy + uNoiseOff;
        float ign = fract( 52.9829189 * fract( dot( px, vec2( 0.06711056, 0.00583715 ) ) ) );
        float ang = ( ign + uJitter ) * 6.2831853;
        // branchless orthonormal basis (Duff et al.) - the old tangent
        // projection normalized a near-zero vector when the rotation vector
        // grazed the normal, and ONE NaN pixel in ONE pass poisons the
        // accumulated mean permanently
        float sn = n.z >= 0.0 ? 1.0 : -1.0;
        float ka = -1.0 / ( sn + n.z );
        float kb = n.x * n.y * ka;
        vec3 b1 = vec3( 1.0 + sn * n.x * n.x * ka, sn * kb, -sn * n.x );
        vec3 b2 = vec3( kb, sn + n.y * n.y * ka, -n.y );
        vec3 t = cos( ang ) * b1 + sin( ang ) * b2;
        mat3 tbn = mat3( t, cross( n, t ), n );
        float occ = 0.0;
        for ( int i = 0; i < N; i++ ){
          vec3 sp = p + tbn * uKernel[i] * uRadius;
          vec4 o = uProj * vec4( sp, 1.0 );
          o.xy = ( o.xy / o.w ) * 0.5 + 0.5;
          float sz = viewPos( o.xy ).z;
          float range = smoothstep( 0.0, 1.0, uRadius / max( 0.0001, abs( p.z - sz ) ) );
          occ += ( sz >= sp.z + uBias ? 1.0 : 0.0 ) * range;
        }
        gl_FragColor = vec4( vec3( clamp( 1.0 - occ / float( N ), 0.0, 1.0 ) ), 1.0 );
      }`,
    depthTest: false, depthWrite: false,
  });
  /* Bilateral denoise, HALF-RES, run inside updateAO only when a pass just
     rendered: 3x3 taps, spatial gaussian x linear falloff of |view-Z
     difference|. At half-res every output pixel IS a texel centre, so the
     spatial weights are compile-time constants (1 / .4111 / .169) - the
     full-res version of this ran at ~37% of a whole beauty pass (~1.6 ms,
     measured by timer query) and the design review named this exact split as
     the fallback. View-Z is the scalar near/far reconstruction, never a
     matrix multiply. */
  ao.blurMat = new THREE.ShaderMaterial({
    uniforms: { tAO: { value: ao.rtAO.texture }, tCDepth: { value: ao.rtN.depthTexture },
                uRes: { value: new THREE.Vector2(w, h) },
                uDepthTol: { value: AO_DEPTH_TOL }, uNear: { value: 1 }, uFar: { value: 8000 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`,
    fragmentShader: `
      uniform sampler2D tAO; uniform sampler2D tCDepth;
      uniform vec2 uRes; uniform float uDepthTol, uNear, uFar;
      varying vec2 vUv;
      float viewDist( float d ){ return ( uNear * uFar ) / ( uFar - d * ( uFar - uNear ) ); }
      void main(){
        float dc = texture2D( tCDepth, vUv ).x;
        if ( dc >= 1.0 ) { gl_FragColor = vec4( 1.0 ); return; }
        float zc = viewDist( dc );
        float a = 0.0, wsum = 0.0;
        for ( int j = -1; j <= 1; j++ )
        for ( int i = -1; i <= 1; i++ ){
          vec2 uv = vUv + vec2( float( i ), float( j ) ) / uRes;
          float ws = ( i == 0 && j == 0 ) ? 1.0 : ( ( i == 0 || j == 0 ) ? 0.4111 : 0.169 );
          float dz = abs( viewDist( texture2D( tCDepth, uv ).x ) - zc );
          // the 0.12 floor: with HARD rejection every texel is purely one
          // surface and a diagonal silhouette ramps in exactly one texel,
          // which zooms into visible half-res stairs. A few percent of
          // cross-edge weight widens the boundary blend to ~2 texels, which
          // the composite's bilinear then smooths continuously - the last
          // trace of the old bleed, kept deliberately and this small.
          float w = ws * ( 0.12 + 0.88 * max( 0.0, 1.0 - dz / uDepthTol ) );
          a += texture2D( tAO, uv ).r * w;
          wsum += w;
        }
        gl_FragColor = vec4( vec3( wsum > 0.0 ? a / wsum : 1.0 ), 1.0 );
      }`,
    depthTest: false, depthWrite: false,
  });
  /* The composite is ONE bilinear fetch. All edge-awareness lives at half-res
     (the SSAO pass and the bilateral denoise both reject across depth), so
     every rtBlur texel belongs purely to its own surface and plain bilinear
     interpolation ramps between surfaces over exactly one texel - continuous,
     so no stair-steps. Two shapes were tried and REJECTED here first: a
     full-res 3x3 bilateral (correct but ~1.6 ms at dpr 2 - 9x the budget) and
     a 4-tap depth-referenced upsample (cheap but its per-pixel nearest-depth
     reference FLIPS at half-res texel boundaries, drawing stair-steps along
     occlusion silhouettes that the MSAA beauty edge makes obvious). Background
     texels hold AO=1 so alpha fades to 0 within a texel of the silhouette -
     no outward halo beyond a sub-pixel feather.
     ⚠ Output is BLACK with alpha, never MultiplyBlending - measured earlier:
     Multiply was ignored on this quad and REPLACED the frame. */
  ao.compMat = new THREE.ShaderMaterial({
    uniforms: { tAO: { value: ao.rtBlur.texture }, uStrength: { value: AO_STRENGTH } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`,
    fragmentShader: `
      uniform sampler2D tAO; uniform float uStrength; varying vec2 vUv;
      void main(){
        float a = texture2D( tAO, vUv ).r;
        gl_FragColor = vec4( 0.0, 0.0, 0.0, clamp( ( 1.0 - a ) * uStrength, 0.0, 1.0 ) );
      }`,
    transparent: true, depthTest: false, depthWrite: false,
  });
  ao.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ao.aoMat);
  ao.quad.frustumCulled = false;
  ao.qScene = new THREE.Scene(); ao.qScene.add(ao.quad);
  ao.qCam = new THREE.Camera();
}
function aoResize() {
  const w = Math.max(2, Math.floor(canvas.width * 0.5)), h = Math.max(2, Math.floor(canvas.height * 0.5));
  if (ao.rtN.width === w && ao.rtN.height === h) return;
  ao.rtN.setSize(w, h);
  ao.rtN.depthTexture.image.width = w; ao.rtN.depthTexture.image.height = h;
  ao.rtAO.setSize(w, h);
  ao.rtBlur.setSize(w, h);
  ao.aoMat.uniforms.uRes.value.set(w, h);
  ao.blurMat.uniforms.uRes.value.set(w, h);
  ao.key = '';                       // force a regen at the new resolution
  ao.passes = 0;                     // and a fresh accumulation
}
// Regenerated only when the view or the build moved — the whole point of a
// mostly-static viewer.
// ⚠ The AO buffer is only valid for the EXACT camera it was rendered from, so
// the freshness test compares the full world + projection matrices — not a
// rounded position string. A slow glide (an eased tween tailing off, orbit
// damping) or a projection-only change (fov settling, setViewOffset's pan, an
// aspect change) moves the picture while a rounded position stays put; the
// overlay then sits offset from the geometry it is meant to shade, which reads
// as a ghosted second copy of the build.
// ⚠ Float64, NOT Float32 (2026-08-22): Matrix4.elements are doubles, and a
// Float32 copy rounds them, so `_aoCam[i] !== m[i]` was TRUE for any camera
// that was not at a round number - aoCamMoved() reported a moved camera on
// every frame and compositeAO() never drew. Measured: 9 of 32 elements
// mismatched under Float32, 0 under Float64. The high tier's AO had been
// silently invisible in production since the guard landed (d6a5ab5).
const _aoCam = new Float64Array(32);
function aoCamMoved() {
  const m = camera.matrixWorld.elements, p = camera.projectionMatrix.elements;
  for (let i = 0; i < 16; i++) if (_aoCam[i] !== m[i] || _aoCam[16 + i] !== p[i]) return true;
  return false;
}
function aoCamStore() {
  const m = camera.matrixWorld.elements, p = camera.projectionMatrix.elements;
  for (let i = 0; i < 16; i++) { _aoCam[i] = m[i]; _aoCam[16 + i] = p[i]; }
}
function updateAO(force = false) {
  // Coming back from a blocked spell (an animation, the outro) the camera may be
  // exactly where it was, so nothing would look changed and we'd composite the
  // buffer from BEFORE the parts moved. Force one regeneration on resume.
  if (!aoWanted()) { ao.blocked = true; ao.quietAt = -1; return; }
  // the engage delay (see AO_ENGAGE_MS). ⚠ ao.passes is zeroed while waiting:
  // the buffer still holds the PRE-motion image, and if the step's camera
  // returns to the exact stored pose, compositeAO's only other guards
  // (aoCamMoved + passes) would happily lay that stale shading over the
  // moved parts for the whole waiting window.
  if (force) ao.quietAt = -Infinity;
  else {
    const nowQ = performance.now();
    if (ao.quietAt === -1) ao.quietAt = nowQ;
    if (nowQ - ao.quietAt < AO_ENGAGE_MS) { ao.blocked = true; ao.passes = 0; return; }
  }
  if (ao.blocked) { ao.blocked = false; force = true; }
  ensureAO(); aoResize();
  camera.updateMatrixWorld();
  const key = instances.size + '|' + cur + '|' + ao.rev;   // scene identity; the camera is matrix-compared
  const changed = force || key !== ao.key || aoCamMoved();
  // converged and nothing moved: free. Not yet converged: one more jittered
  // pass per frame, averaged into the buffer - the burst after a settle costs
  // one SSAO quad per frame for ~AO_ACCUM frames, exactly when the camera is
  // idle. Motion keeps today's behaviour (a fresh single pass every frame).
  if (!changed && ao.passes >= ao.accumMax) return;
  ao.busy = true;
  const hidden = [], prevBg = scene.background, prevOv = scene.overrideMaterial;
  const prevAuto = renderer.autoClear;
  try {
    if (changed) ao.passes = 0;
    // Every pass renders its OWN depth+normals, at that pass's sub-texel
    // jitter - the projection is shifted by a fraction of a half-res texel
    // (TAA-style, elements 8/9), and the SSAO pass reconstructs with the SAME
    // shifted pair, so each pass is self-consistent and the accumulated mean
    // is a supersampled image on the base grid. The camera's own matrices are
    // restored immediately: aoCamMoved() compares the REAL projection.
    const off = AO_JITTER[ao.passes % AO_ACCUM];
    _aoProj.copy(camera.projectionMatrix);
    _aoProj.elements[8] += off.x * 2 / ao.rtN.width;
    _aoProj.elements[9] += off.y * 2 / ao.rtN.height;
    _aoProjInv.copy(_aoProj).invert();
    {
      // depth + view-space normals of the PARTS (+ the mounting backdrop when
      // ao.backdrops, for the contact shadow) — never the table: a floor disc
      // occludes itself into a grey wash and it isn't what anyone is inspecting
      scene.traverse(o => {
        if ((o === table || o === grid || (!ao.backdrops && (o === wall || o === surface)) || o.userData.ghost ||
             o.isLine || o.isLineSegments || o.isSprite || o === refl.mesh) && o.visible) {
          o.visible = false; hidden.push(o);
        }
      });
      scene.background = null; scene.overrideMaterial = ao.normalMat;
      const savedProj = camera.projectionMatrix, savedInv = camera.projectionMatrixInverse;
      camera.projectionMatrix = _aoProj; camera.projectionMatrixInverse = _aoProjInv;
      try {
        renderer.setRenderTarget(ao.rtN);
        renderer.clear();
        renderer.render(scene, camera);
      } finally {
        camera.projectionMatrix = savedProj; camera.projectionMatrixInverse = savedInv;
      }
      scene.overrideMaterial = prevOv; scene.background = prevBg;
      while (hidden.length) hidden.pop().visible = true;
      ao.blurMat.uniforms.uNear.value = camera.near;
      ao.blurMat.uniforms.uFar.value = camera.far;
    }
    // one SSAO pass: pass 0 overwrites, later passes blend into the running
    // mean via the blend constant (out = src/(n+1) + dst*n/(n+1)).
    // ⚠ autoClear must be off for the blended passes - renderer.render()
    // clears the BOUND target first, which silently resets the mean every
    // frame and leaves accumulation looking exactly like a single pass
    // (design review). Each pass gets its own stratified kernel group, a
    // scrolled noise domain and an unrelated phase.
    const u = ao.aoMat.uniforms;
    u.uKernel.value = ao.groups[ao.passes % AO_ACCUM];
    u.uNoiseOff.value.set(5.588238 * ao.passes, 5.588238 * ao.passes);
    u.uJitter.value = (ao.passes * 0.754877666) % 1;
    u.uProj.value.copy(_aoProj);
    u.uProjInv.value.copy(_aoProjInv);
    if (ao.passes === 0) {
      ao.aoMat.blending = THREE.NoBlending;
    } else {
      ao.aoMat.blending = THREE.CustomBlending;
      ao.aoMat.blendEquation = THREE.AddEquation;
      ao.aoMat.blendSrc = THREE.ConstantAlphaFactor;
      ao.aoMat.blendDst = THREE.OneMinusConstantAlphaFactor;
      ao.aoMat.blendAlpha = 1 / (ao.passes + 1);
    }
    ao.quad.material = ao.aoMat;
    renderer.setRenderTarget(ao.rtAO);
    renderer.autoClear = false;
    renderer.render(ao.qScene, ao.qCam);
    // denoise the running mean into rtBlur (full overwrite, half-res, cheap) -
    // the composite reads only this, so its per-frame cost stays one quad
    ao.quad.material = ao.blurMat;
    renderer.setRenderTarget(ao.rtBlur);
    renderer.render(ao.qScene, ao.qCam);
    // commit identity only after the passes actually rendered
    ao.passes++;
    ao.passCount++;   // monotonic, never reset: the settle benchmark's pass counter (settle-bench.js)
    if (changed) { ao.key = key; aoCamStore(); }
    // The RESTING image must not depend on which jitter happened to come
    // last: the bilateral classifies the accumulated mean against rtN, which
    // holds the LAST pass's +-0.375-texel-shifted depth. On the final pass,
    // re-render depth+normals CENTRED and re-blur - deterministic
    // classification for the frame that then sits on screen for seconds
    // (post-work review: order-dependence at depth edges).
    if (ao.passes === ao.accumMax && ao.accumMax > 1) {
      scene.traverse(o => {
        if ((o === table || o === grid || (!ao.backdrops && (o === wall || o === surface)) || o.userData.ghost ||
             o.isLine || o.isLineSegments || o.isSprite || o === refl.mesh) && o.visible) {
          o.visible = false; hidden.push(o);
        }
      });
      scene.background = null; scene.overrideMaterial = ao.normalMat;
      renderer.setRenderTarget(ao.rtN);
      renderer.autoClear = prevAuto;
      renderer.clear();
      renderer.render(scene, camera);
      scene.overrideMaterial = prevOv; scene.background = prevBg;
      while (hidden.length) hidden.pop().visible = true;
      ao.quad.material = ao.blurMat;
      renderer.setRenderTarget(ao.rtBlur);
      renderer.autoClear = false;
      renderer.render(ao.qScene, ao.qCam);
    }
  } finally {
    // a throw mid-normals-pass must not strand hidden parts, a null background
    // or an override material - guardFx only resets the render target
    renderer.autoClear = prevAuto;
    renderer.setRenderTarget(null);
    scene.overrideMaterial = prevOv;
    scene.background = prevBg;
    while (hidden.length) hidden.pop().visible = true;
    ao.busy = false;
  }
}
// Per-feature kill switch: an optional render effect must never be able to take
// the render loop with it. First throw disables that effect for the session and
// reports it once (error:fx-* so a driver-specific failure is actually visible in
// the telemetry rather than being an invisible "it looked wrong on my phone").
const fxDead = {};
// ⚠ RETURNS THE CALLEE'S VALUE. accumFrame() reports whether it drew the canvas
// itself, and a disabled or thrown effect must report `undefined` - falsy - so
// the caller falls back to the plain render rather than showing nothing.
function guardFx(name, fn) {
  if (fxDead[name]) return;
  try { return fn(); }
  catch (e) {
    fxDead[name] = true;
    if (name === 'ao') { ao.busy = false; scene.overrideMaterial = null; }
    if (name === 'reflection' && refl.mesh) refl.mesh.visible = false;
    renderer.setRenderTarget(null);
    console.warn(`[gen2] ${name} disabled after a render error —`, e);
    track('error:fx-' + name);
  }
}
/* Ambient occlusion waits while the CAMERA moves (see motionLite): the render loop calls this instead
   of updateAO and skips the composite. Its per-frame pass redraws the whole build for depth and
   normals - on an 80-unit build a third of a High frame's draw calls.
   ⚠ `blocked` forces one regeneration on return, because the buffer holds another view.
   ⚠ quietAt -Infinity when nothing is tweening: AO_ENGAGE_MS exists for the one-frame gaps between a
   step's phases, and a camera that has just stopped has already been still for SETTLE_MS - so it
   engages on the frame the debounce ends. A tween still running keeps the normal delay (-1). */
function holdAOForMotion() {
  ao.blocked = true;
  ao.quietAt = tweens.size ? -1 : -Infinity;
}
function compositeAO() {
  if (!aoWanted() || !ao.rtAO || ao.busy || fxDead.ao || !ao.passes) return;
  // safety net: never lay the overlay over a frame drawn from a different camera
  // than the buffer was rendered from. Losing AO for one frame is invisible; a
  // mismatched overlay is a ghost of the build sitting beside the build.
  if (aoCamMoved()) return;
  ao.quad.material = ao.compMat;
  // ⚠ autoClear defaults TRUE — without this the quad WIPES the frame it is
  // meant to shade, and you capture the bare AO buffer on an empty canvas.
  const prev = renderer.autoClear;
  renderer.autoClear = false;
  renderer.render(ao.qScene, ao.qCam);
  renderer.autoClear = prev;
}

/* ==========================================================================
   VERY HIGH - accumulated settle rendering
   ==========================================================================
   The tier's whole idea is the one this viewer has been built on since the AO
   burst landed: it is STATIC almost all the time, so render cheap while moving
   and spend the budget the instant everything settles. AO already spends there.
   Very High spends there on THE FRAME ITSELF.

   Once nothing has moved, ACC_SAMPLES further frames are rendered into a linear
   HDR target and averaged. Each sample jitters two things:

     (a) THE KEY LIGHT'S POSITION, over an equal-area disk about its axis. The
         average of many hard shadows from a disk of directions IS the shadow of
         a disk-shaped source - so the penumbra widens with the distance from
         the occluder to what it lands on, which is the thing a constant-width
         blur (VSM, a blurred shadow map) can never do. Sharp under a foot, soft
         under a drawer 100 mm up. That contact hardening IS the tier.
     (b) THE PROJECTION, by a sub-pixel offset. It rides along for free and
         cleans what MSAA cannot: specular aliasing and the shadow-map edge.

   ⚠ IT IS A DISTANT DISK, NOT A SOFTBOX. Jittering a DirectionalLight's
   direction integrates a distant uniformly-radiating disk emitter. That the
   diffuse shading changes too is not a bug - it is the rest of the same
   integral - but it will not reproduce the travelling highlight of a finite
   rectangular source near the part. The PMREM environment and the fill light
   are NOT jittered, so this is a deliberately hybrid studio model.

   ⚠⚠ WHY NOT copyFramebufferToTexture FROM THE CANVAS. The first design
   accumulated real canvas frames, so every sample would have been tone-mapped
   and encoded by three exactly as `high` does and parity would have been free.
   Rejected on review (2026-09-09): in WebGL2, copyTexSubImage2D from a
   MULTISAMPLED read framebuffer - which is what `antialias: true` gives the
   default framebuffer - is not a portable resolve path and may raise
   INVALID_OPERATION. It would also have made the accumulation input 8-bit and
   POST-tone-map. At a penumbra pixel that computes
       vis * T(ambient + direct) + (1 - vis) * T(ambient)
   where the honest answer is
       T(ambient + vis * direct),
   and Neutral is nonlinear, so mixed lit/shadow pixels come out too dark.
   So the scene renders into an OWNED multisampled HDR target, is averaged in
   LINEAR, and the mean reaches the screen through an ordinary three material -
   which means three's own tone mapping and output encoding run, rather than a
   private clone of NeutralToneMapping that could drift from `high`.

   ⚠ AO IS COMPOSITED ONCE, AFTER THE RESOLVE, AT THE NOMINAL PROJECTION - and
   never into the samples. Compositing one unjittered AO buffer into every
   jittered sample would slide the occlusion against the geometry it darkens,
   which is exactly the drawer gaps, dovetails and feet the product needs crisp.
   It is also cheaper this way. The loop order already does it: blit, then
   compositeAO - the same order in which `high` renders then composites.       */
const ACC_SAMPLES = 24;
/* Half-angle of the emitter disc, in degrees. 6 is a large studio source, not
   the sun (the real sun is 0.27), and that is the point: this is a product
   still and the reference is a softbox two feet away. ⚠ Wider is not free - a
   wide penumbra eventually needs more than ACC_SAMPLES to stop banding into
   separate shadows, which is what the "ghost shadows" failure looks like. */
/* ⚠ `let`, and it is a TUNING KNOB with no measurement behind it yet - 6 looked
   right on the 185 starter and that is the whole provenance. Exposed on the debug
   hook so a softness ladder can be rendered without editing the file. */
let ACC_SUN_HALF_DEG = 6;
/* ⚠⚠ HOW THE BURST AVOIDS ANNOUNCING ITSELF, AND WHY THERE IS NO MSAA ON THE
   SCENE TARGET. The first version gave rtScene `samples: 4` so that sample 0
   looked like the multisampled canvas frame it replaced. MEASURED: an MSAA
   RGBA16F colour buffer plus its multisampled depth is four times the memory,
   and at a 3840x2160 drawing buffer that is ~400 MB of render targets for a
   tier that is supposed to be the SAFE one. Ten times what the whole AO chain
   costs.
   So there is no MSAA, and the pop is solved for free instead: for the first
   ACC_WARMUP frames of a burst the accumulator still takes its samples but does
   NOT put the mean on screen - it reports "I did not draw" and the loop renders
   the ordinary multisampled canvas frame, exactly what was on screen a moment
   earlier while the camera moved. By the time the mean is shown it already
   averages ACC_WARMUP+1 jittered samples, which resolves edges at least as well
   as 4x MSAA and, unlike MSAA, resolves SHADING too. The handover is a small
   improvement rather than a jump. Cost: one extra scene render on each of those
   frames, about 2 ms each on the machine this was built on. */
const ACC_WARMUP = 6;
/* ⚠⚠ CAN A BACK COVER BE SEEN AT ALL THIS FRAME? (Astra 2026-09-17: "skip the behind-cover rendering when no eligible
   cover can contribute to the displayed image ... uncertain cases should render normally".) A back cover clips onto the
   BACK of a faceplate, facing into its drawer, so in the finished build with that drawer shut it is enclosed by the
   drawer, the plate and the case. The answer here is therefore about ASSEMBLY STATE, never about the camera - which is
   what makes it right for the floor reflection too: a second camera in the same frame cannot un-hide an enclosed part,
   and a frustum test would have answered "in view" on exactly the whole-build frames that show no cover.
   It returns TRUE (render) for everything it cannot rule out: any tween, a focus/isolation fade, the in-progress
   preview's translucent covers, any page but the finished build, and any cover or drawer not exactly at its resting
   pose. ⚠ It reads no camera and no bounds ON PURPOSE - keep it that way, or the reflection needs its own answer. */
function seeIntoCoversVisible() {
  /* ⚠ A SUPPORTED COMPONENT IS NOT ENCLOSED BY ANYTHING. The rule below reasons about back covers shut inside
     drawers; a faceplate grip faces the room on the front of the build, so whenever one is wearing translucent
     filament and its plate is on screen's page at all, the passes run. Astra 2026-09-17: "The closed-drawer skip
     won't hide these surfaces, so report their actual cost rather than relying on the cover benchmark." */
  if (seeIntoDriven.size) {
    for (const inst of instances.values()) {
      if (inst.group && inst.group.visible && typeByNode[inst.cfg.node] === 'Faceplate') return true;
    }
  }
  if (tweens.size) return true;                                   // anything moving: the enclosure may be opening
  if (fpFocus.id || dFocus.carrier) return true;                  // isolation fades the room / pulls a drawer open
  if (manifest.incomplete) return true;                           // planned covers render translucent
  const page = PAGES[cur];
  if (!page || page.cover || page.outro) return true;
  if (cur !== manifest.steps.length) return true;                 // mid-assembly: parts sit on benches, cases are missing
  /* ⚠ ONE CAMERA CLAUSE, AND IT IS SOUND FOR THE MIRROR TOO: inside the build nothing is enclosed - a camera within a
     case sees the cover directly (p62 measured the whole frame). The floor reflection's camera is the main one mirrored
     through the floor, and the build stands ON the floor, so whenever the real camera is outside this box the mirrored
     one is further outside it. `assembledBox` is the build's own envelope, kept by computeBounds. */
  if (assembledBox && !assembledBox.isEmpty() && assembledBox.containsPoint(camera.position)) return true;
  const atRest = (inst) => !inst.staged && inst.group.position.distanceToSquared(basePos(inst, false)) < 1e-6
    && (!inst.group.children[0] || inst.group.children[0].position.lengthSq() < 1e-6);
  for (const inst of instances.values()) {
    if (!/^BackCover/.test(inst.cfg.node) || !inst.group || !inst.group.visible) continue;   // a hidden cover draws nothing
    if (!atRest(inst)) return true;                               // its own removal ritual is running or stranded
    const carrier = inst.cfg.rides ? instances.get(inst.cfg.rides) : null;
    if (!carrier || !atRest(carrier)) return true;                // the drawer it rides is open (a peek, a deep pull, a cinema glide)
  }
  return false;
}
if (!ENTRY.isPart) seeInto = createSeeInto({
  /* the preset's constants drive the filament-driven components too (they keep their own colour through `own`); 'frosted'
     is the one every grip/face measurement and Joey's live check ran on */
  THREE, renderer, scene, camera, presetKey: SEE_INTO_COVERS || 'frosted',
  // every back cover (only behind the switch), one part per instance (hidden meshes draw nothing in the passes)
  parts: () => {
    const out = [];
    for (const inst of instances.values()) {
      if (!inst.group) continue;
      if (SEE_INTO_COVERS && /^BackCover/.test(inst.cfg.node)) {                    // the reference piece: the whole part is translucent
        const meshes = [];
        inst.group.traverse((o) => { if (o.isMesh) meshes.push(o); });
        out.push({ partId: inst.cfg.id, meshes });
        continue;
      }
      /* A supported component is a ZONE of a bigger part, so only its own primitives go in - the plate body and face
         beside it stay opaque and must keep occluding, which is exactly what leaving them out of pass A does. */
      if (seeIntoDriven.size && typeByNode[inst.cfg.node] === 'Faceplate') {
        const meshes = [];
        inst.group.traverse((o) => {
          if (o.isMesh && seeIntoDriven.has(zoneKey('Faceplate', o.userData.zone || ''))) meshes.push(o);
        });
        if (meshes.length) out.push({ partId: inst.cfg.id + ':zone', meshes });
      }
    }
    return out;
  },
  // Very High only: the tier that spends its budget once the camera stops (Astra's control 2)
  /* ⚠ NOTHING TRANSLUCENT, NOTHING RUNS: without the cover switch and without a driven component there is no part for the
     passes to draw, and seeIntoCoversVisible() still says yes on every moving frame - a whole-scene render for nothing. */
  wanted: () => (!!SEE_INTO_COVERS || seeIntoDriven.size > 0)
    && !!QUALITY[quality].accum && !cinema.on && !renderer.getContext().isContextLost(),
  sceneKey: () => instances.size + '|' + cur + '|' + ao.rev + '|' + accRev + '|' + quality + '|' + stageTheme,
  /* ⚠ ON by default since local integration, `?siskip=off` to disable for diagnosis: the rule below is a STATE rule, not
     a proof of invisibility (a shut drawer's cover still shows through the gap it fills), and Astra accepted that measured
     residual. Without it every behind-cover pass runs, which is what failed the moving-cost limit. */
  coversVisible: parseSeeIntoSkip(location.search) ? seeIntoCoversVisible : null,
  // the scene depth the AO pass already renders, so the AO weighting can tell a visible cover from a hidden one
  sceneDepth: () => (ao.rtN ? ao.rtN.depthTexture : null),
  // the passes swap cover materials and layers; the shadow-caster watch must not read those as moved casters (see-into.js)
  pauseShadowWatch: (on) => { if (on) { shadowWatch.pausedMoving = shadowWatch.moving; shadowWatch.moving = false; } else shadowWatch.moving = shadowWatch.pausedMoving; },
});
const acc = {
  rtScene: null,    // owned MSAA linear-HDR target - one sample renders here
  rtAcc: null,      // single-sample HalfFloat running mean, in LINEAR light
  quad: null, qScene: null, qCam: null,
  accMat: null,     // rtScene -> rtAcc, running mean via the blend constant
  outMat: null,     // rtAcc -> canvas; an ordinary material, so three tone-maps it
  n: 0, key: '', blocked: true, ok: false, probed: false,
  jitter: true,     // debug: off makes sample 0 the exact `high` frame
  sunHome: new THREE.Vector3(), disk: null,
  // monotonic, never reset: samples rendered, and samples rendered with the settle detail on (settle-bench.js)
  sampleCount: 0, detailCount: 0,
};
/* ⚠ Float64Array, NOT Float32. Matrix4.elements are doubles; a Float32 copy
   rounds, and the comparison then reports a moved camera on EVERY frame. That
   exact mistake silently disabled the AO composite in production for two weeks
   (see the AO section) and this is the same compare. */
const _accCam = new Float64Array(32);
const _accClear = new THREE.Color();
function accCamMoved() {
  const m = camera.matrixWorld.elements, p = camera.projectionMatrix.elements;
  for (let i = 0; i < 16; i++) if (_accCam[i] !== m[i] || _accCam[16 + i] !== p[i]) return true;
  return false;
}
function accCamStore() {
  const m = camera.matrixWorld.elements, p = camera.projectionMatrix.elements;
  for (let i = 0; i < 16; i++) { _accCam[i] = m[i]; _accCam[16 + i] = p[i]; }
}
/* Anything that changes the picture WITHOUT moving the camera, the step, the
   instance count or ao.rev has to say so, or the held mean is a FROZEN VIEWER -
   a far worse failure than stale AO, which is only wrong shading over correct
   geometry. `accVerify()` on the debug hook is what turns "did I miss a call
   site" into something testable rather than something hoped. */
/* ⚠ `var`, and the counter lives OUTSIDE `acc`. applyStageTheme runs during
   module evaluation - before `const acc` has initialised - and `typeof` does
   NOT protect a const in its TDZ (the `#btn-theme` lesson, twice). A hoisted
   var is callable from the first line of the file. */
var accRev = 0;
function invalidateFrame() { accRev++; }
/* Equal-area disk, deterministic, index 0 at the CENTRE.
   ⚠ NOT random. Sixteen random directions read as sixteen ghost shadows rather
   than one soft one. A golden-angle spiral at r = sqrt(i/(n-1)) covers the disc
   evenly and every PREFIX of it is roughly even too, so a burst interrupted
   part-way still looks like a soft shadow rather than a smear.
   ⚠ Index 0 is the centre so a ONE-sample accumulation is the `high` light
   position exactly - which is what the parity test compares against. */
function accDisk(n) {
  const out = [new THREE.Vector2(0, 0)];
  const g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 1; i < n; i++) {
    const r = Math.sqrt(i / (n - 1)), a = i * g;
    out.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  return out;
}
function accWanted() {
  /* ⚠ `!acc.probed || acc.ok`, NOT `acc.ok`. The probe only runs inside
     ensureAcc(), which only runs from accumFrame(), which only runs when this
     returns true - so gating on an `ok` that starts false is a deadlock the
     tier never escapes, and it looks exactly like a tier that does nothing. */
  return !!QUALITY[quality].accum && (!acc.probed || acc.ok) && !fxDead.accum
    && !cinema.on && !IS_PART
    && !tweens.size && !perf.moving
    && fpEnv.k === fpEnv.target;   // the room fade is a per-frame lerp, not a tween
}
function ensureAcc() {
  if (acc.rtScene) return;
  /* The same evidence AO accumulation runs on: a complete float framebuffer
     proves renderability, not that the constant-alpha running mean behaves.
     Reuse the AO probe rather than writing a second one - it IS the identical
     blend. On failure the tier degrades to a plain `high` frame for the
     session; never a silently half-working mean. */
  if (!acc.probed) { acc.probed = true; acc.ok = aoBlendProbe(); }
  if (!acc.ok) return;
  const w = Math.max(1, renderer.domElement.width), h = Math.max(1, renderer.domElement.height);
  // depthBuffer is real here, unlike the AO quads: a scene render needs one.
  // No MSAA - see ACC_WARMUP for what replaces it and why.
  acc.rtScene = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false,
  });
  acc.rtAcc = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
  });
  /* LINEAR, stated. The mean is light, not a picture: three must not decode it
     as sRGB when the output material samples it. */
  acc.rtScene.texture.colorSpace = THREE.LinearSRGBColorSpace;
  acc.rtAcc.texture.colorSpace = THREE.LinearSRGBColorSpace;
  acc.accMat = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: acc.rtScene.texture } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    fragmentShader: 'uniform sampler2D tSrc; varying vec2 vUv; void main(){ gl_FragColor = texture2D( tSrc, vUv ); }',
    depthTest: false, depthWrite: false,
  });
  /* AN ORDINARY MATERIAL ON PURPOSE. MeshBasicMaterial compiles three's own
     <tonemapping_fragment> and <colorspace_fragment>, so the mean reaches the
     canvas through the exact path a `high` frame takes - there is no second
     copy of NeutralToneMapping to drift.

     ⚠⚠ AND IT COMPOSITES, IT DOES NOT REPLACE - because THE STAGE COLOUR IS
     NOT TONE MAPPED AND MUST NOT BECOME SO. A `scene.background` Color is a
     glClearColor: three writes it straight into the canvas in the output colour
     space and the tone mapping chunk, which only runs on drawn geometry, never
     touches it. Rendering into a linear target instead put that same colour
     through the blit's tone mapping and the light stage came out EIGHT LEVELS
     darker - #eef0f3 (238,240,243) landing at (230,232,235). Caught by the
     parity test, which is the entire reason it exists.
     So the accumulator owns only the LIT SCENE: samples render over a
     transparent clear, and the stage colour is laid down here by the renderer's
     own clear, exactly as three lays it down for `high`. The blend is
     premultiplied because that is what an MSAA resolve over a transparent clear
     produces at a silhouette. ⚠ Tone mapping a premultiplied edge texel is
     very slightly wrong; it is sub-pixel and it buys exact stage colour. */
  acc.outMat = new THREE.MeshBasicMaterial({
    map: acc.rtAcc.texture, transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  acc.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), acc.accMat);
  acc.quad.frustumCulled = false;
  acc.qScene = new THREE.Scene(); acc.qScene.add(acc.quad);
  acc.qCam = new THREE.Camera();
  acc.disk = accDisk(ACC_SAMPLES);
  acc.sunHome.copy(sun.position);
}
function accResize() {
  if (!acc.rtScene) return;
  const w = Math.max(1, renderer.domElement.width), h = Math.max(1, renderer.domElement.height);
  if (acc.rtScene.width === w && acc.rtScene.height === h) return;
  acc.rtScene.setSize(w, h); acc.rtAcc.setSize(w, h);
  acc.n = 0;
}
/* Point the key light at disk sample i and mark its shadow for re-rendering.
   ⚠ THE SHADOW CAMERA IS FITTED TO THE BOUNDING SPHERE, NOT THE BOX, whenever
   this tier is on (see fitShadowCamera). A box fitted for the central direction
   is not valid for a CONE of directions - the margin `high` uses disappears
   when a tall build is seen from 6 degrees off, and a clipped shadow frustum
   drops the shadow entirely on some samples, which averages into a pale band.
   A sphere is rotation-invariant by construction, so one fit covers the disk. */
function accSetSun(i) {
  const s = acc.disk[i];
  if (s.x === 0 && s.y === 0) sun.position.copy(acc.sunHome);
  else {
    const axis = new THREE.Vector3().subVectors(acc.sunHome, sun.target.position);
    const d = axis.length();
    const u = new THREE.Vector3(0, 1, 0).cross(axis);
    if (u.lengthSq() < 1e-6) u.set(1, 0, 0); else u.normalize();
    const v = new THREE.Vector3().crossVectors(axis, u).normalize();
    const t = Math.tan(ACC_SUN_HALF_DEG * Math.PI / 180) * d;
    sun.position.copy(acc.sunHome).addScaledVector(u, s.x * t).addScaledVector(v, s.y * t);
    // hold the distance constant so the ortho shadow frustum stays centred
    sun.position.sub(sun.target.position).setLength(d).add(sun.target.position);
  }
  sun.updateMatrixWorld();
  renderer.shadowMap.needsUpdate = true;
}
/**
 * One frame of Very High. Returns true when it has drawn the canvas itself, in
 * which case the caller must NOT render the scene again.
 *
 * Three states:
 *   not wanted   -> false, and the loop renders `high` exactly as before
 *   accumulating -> render one jittered sample, blend it in, blit the mean
 *   converged    -> blit the held mean; ONE fullscreen quad, so a SETTLED Very
 *                   High frame is cheaper than a settled `high` one
 */
function accumFrame() {
  if (!accWanted()) { acc.blocked = true; return false; }
  ensureAcc(); accResize();
  if (!acc.ok || !acc.rtScene) return false;
  camera.updateMatrixWorld();
  const key = instances.size + '|' + cur + '|' + ao.rev + '|' + accRev + '|' + quality;
  if (acc.blocked || key !== acc.key || accCamMoved()) {
    acc.blocked = false; acc.n = 0; acc.key = key; accCamStore();
  }
  /* Only a Color or nothing. A texture or cube background would have to be
     accumulated with the scene rather than cleared, and the outro - the one
     thing here that uses a mesh dome - never accumulates. Anything else falls
     back to the plain frame rather than being rendered wrong. */
  const bg = scene.background;
  if (bg && !bg.isColor) return false;
  const prevAuto = renderer.autoClear;
  if (acc.n < ACC_SAMPLES) {
    const savedProj = camera.projectionMatrix, savedInv = camera.projectionMatrixInverse;
    const jProj = new THREE.Matrix4(), jInv = new THREE.Matrix4();
    const savedClear = renderer.getClearColor(_accClear).clone(), savedAlpha = renderer.getClearAlpha();
    try {
      accSetSun(acc.jitter ? acc.n : 0);
      // the lit scene only - see the note on outMat
      scene.background = null;
      renderer.setClearColor(0x000000, 0);
      /* ⚠ DERIVED FROM THE COMPOSED PROJECTION EVERY SAMPLE, never mutated in
         place. `camera.setViewOffset` is live in this app - the filament menu
         pans the projection to clear the docked panel - so the jitter has to
         ride whatever offset is current and be dropped cleanly afterwards.
         Elements 8/9 are the perspective form; this camera is always one. */
      jProj.copy(camera.projectionMatrix);
      if (acc.jitter && acc.n > 0) {
        const s = acc.disk[acc.n];
        jProj.elements[8] += s.x / acc.rtScene.width;
        jProj.elements[9] += s.y / acc.rtScene.height;
      }
      jInv.copy(jProj).invert();
      camera.projectionMatrix = jProj; camera.projectionMatrixInverse = jInv;
      /* THE SETTLE-ONLY DETAIL - the one place either is drawn (Joey 2026-09-14: "place it on very
         high for now", and for the layer lines "treated the same way as the powdercoated texture").
         The build plate's powder grain in full: an ordinary frame folds the sub-pixel grain into
         roughness, which reads almost like Smooth. And the visible layer lines (bed-finish.js
         LAYER_LINES), a stripe pattern a single frame could only show as crawling moire. These samples
         (the first at the centre, the rest jittered) average both. Not when the jitter is off:
         unjittered samples would only repeat one aliased pattern, and accVerify('parity') compares
         them against a plain frame. */
      if (acc.jitter) setSettleDetail(bedFinishU, true, renderer.getPixelRatio());
      renderer.autoClear = true;
      renderer.setRenderTarget(acc.rtScene);
      renderer.render(scene, camera);
      if (settleDetailIsOn(bedFinishU)) acc.detailCount++;   // read after the render: the detail really drew (settle-bench.js)
    } finally {
      setSettleDetail(bedFinishU, false);   // every frame outside a sample: folded grain, no lines
      camera.projectionMatrix = savedProj; camera.projectionMatrixInverse = savedInv;
      accSetSun(0);
      scene.background = bg;
      renderer.setClearColor(savedClear, savedAlpha);
      renderer.setRenderTarget(null);
      renderer.autoClear = prevAuto;
    }
    /* blend the sample into the running mean: out = src/(n+1) + dst*n/(n+1).
       ⚠ autoClear OFF, or renderer.render() clears rtAcc first and the "mean"
       is silently just the newest sample, every frame, forever - which looks
       exactly like accumulation that is working. */
    if (acc.n === 0) acc.accMat.blending = THREE.NoBlending;
    else {
      acc.accMat.blending = THREE.CustomBlending;
      acc.accMat.blendEquation = THREE.AddEquation;
      acc.accMat.blendSrc = THREE.ConstantAlphaFactor;
      acc.accMat.blendDst = THREE.OneMinusConstantAlphaFactor;
      acc.accMat.blendAlpha = 1 / (acc.n + 1);
    }
    acc.quad.material = acc.accMat;
    try {
      renderer.autoClear = false;
      renderer.setRenderTarget(acc.rtAcc);
      renderer.render(acc.qScene, acc.qCam);
    } finally {
      renderer.setRenderTarget(null);
      renderer.autoClear = prevAuto;
    }
    acc.n++;
    acc.sampleCount++;
    /* The warm-up hand-back: the samples are banked, but the ordinary canvas
       frame stays on screen until the mean is worth showing. Returning false
       makes the loop render it. */
    if (acc.n <= ACC_WARMUP) return false;
  }
  /* Lay the stage down the way three lays it down - same setClearColor path,
     same conversion - then composite the lit scene over it. */
  const savedClear2 = renderer.getClearColor(_accClear).clone(), savedAlpha2 = renderer.getClearAlpha();
  acc.quad.material = acc.outMat;
  try {
    if (bg) renderer.setClearColor(bg, 1); else renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    renderer.clear();
    renderer.render(acc.qScene, acc.qCam);
  } finally {
    renderer.setClearColor(savedClear2, savedAlpha2);
    renderer.autoClear = prevAuto;
  }
  return true;
}

/* Very High's own tripwire. Two questions, both answered against the real
   canvas, and both otherwise unanswerable by reading state.

     mode 'parity'  - run the accumulation with the jitter OFF, so every sample
                      is the nominal projection and the centre light position,
                      and compare the held mean against a plain `high` frame.
                      They must agree to within rounding. This is the test that
                      catches the whole class of "the mean reaches the screen
                      through a different colour pipeline than the scene does" -
                      a tone-mapping or colour-space mistake shows up here as a
                      flat offset over the entire frame.
     mode 'stale'   - snapshot the mean currently on screen, force a full
                      re-accumulation from the CURRENT scene state, and compare.
                      A missed invalidateFrame() call site is exactly a held
                      mean that no longer matches what the scene would render,
                      and this is what turns "did I miss one" into a number.

   ⚠ Reads happen in the SAME TASK as the render they read. preserveDrawingBuffer
   is false, so any await between them hands back an empty buffer - the trap
   this repo has paid for more than once. */
function accVerify(mode = 'stale') {
  if (!QUALITY[quality].accum) return { error: 'not on a tier that accumulates' };
  renderer.setAnimationLoop(null);
  const c2 = document.createElement('canvas');
  const w = renderer.domElement.width, h = renderer.domElement.height;
  c2.width = w; c2.height = h;
  const ctx = c2.getContext('2d', { willReadFrequently: true });
  const grab = () => { ctx.drawImage(renderer.domElement, 0, 0); return ctx.getImageData(0, 0, w, h).data; };
  const converge = () => {
    acc.blocked = true;                       // force a restart from sample 0
    for (let i = 0; i < ACC_SAMPLES + 2; i++) { accumFrame(); compositeAO(); }
  };
  const savedJitter = acc.jitter;
  let a, b, label;
  try {
    if (mode === 'parity') {
      acc.jitter = false;
      converge();
      a = grab();                             // the accumulated mean, unjittered
      renderer.render(scene, camera); compositeAO();
      b = grab();                             // the plain `high` frame
      label = 'unjittered mean vs plain frame';
    } else {
      accumFrame(); compositeAO();
      a = grab();                             // whatever is being held right now
      converge();
      b = grab();                             // freshly accumulated from live state
      label = 'held mean vs fresh mean';
    }
  } finally {
    acc.jitter = savedJitter;
    acc.blocked = true;
    renderer.setAnimationLoop(renderLoop);   // see the note on renderLoop
  }
  /* ⚠ REPORTED TWICE, AND THE SECOND NUMBER IS THE ONE THAT MEANS SOMETHING.
     There is no MSAA on the scene target (see ACC_WARMUP), so at any pixel with
     FRACTIONAL COVERAGE - a silhouette, a grid line, a dimension callout - the
     two arms are resolving coverage by different methods and are SUPPOSED to
     differ. What must not differ is the colour pipeline, and that shows up on
     flat pixels: background, and the interior of any shaded surface. So the
     flat-pixel figures are the parity test; the overall ones are context. */
  const W = w, H = h;
  const flatAt = (i) => {
    const x = (i / 4) % W, y = ((i / 4) / W) | 0;
    if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return false;
    const L = (j) => 0.2126 * b[j] + 0.7152 * b[j + 1] + 0.0722 * b[j + 2];
    const c = L(i);
    return Math.abs(L(i - 4) - c) < 2 && Math.abs(L(i + 4) - c) < 2 &&
           Math.abs(L(i - W * 4) - c) < 2 && Math.abs(L(i + W * 4) - c) < 2;
  };
  let max = 0, sum = 0, over1 = 0, over4 = 0;
  let fMax = 0, fSum = 0, fOver1 = 0, fN = 0;
  for (let i = 0; i < a.length; i += 4) {
    const flat = flatAt(i);
    for (let k = 0; k < 3; k++) {
      const d = Math.abs(a[i + k] - b[i + k]);
      if (d > max) max = d;
      sum += d;
      if (d > 1) over1++;
      if (d > 4) over4++;
      if (flat) { if (d > fMax) fMax = d; fSum += d; if (d > 1) fOver1++; fN++; }
    }
  }
  const n = (a.length / 4) * 3;
  return { mode, label, samples: ACC_SAMPLES, pixels: a.length / 4,
           flatMaxDelta: fMax, flatMeanDelta: +(fSum / Math.max(fN, 1)).toFixed(4),
           flatPctOver1: +(100 * fOver1 / Math.max(fN, 1)).toFixed(3), flatPixels: fN / 3,
           allMaxDelta: max, allMeanDelta: +(sum / n).toFixed(4),
           allPctOver1: +(100 * over1 / n).toFixed(3), allPctOver4: +(100 * over4 / n).toFixed(3) };
}

/* ==========================================================================
   CONTACT GROUNDING - the dark stage's missing occlusion
   ==========================================================================
   MEASURED (2026-09-10): on the dark stage the FLOOR receives no occlusion of
   any kind. No key-light shadow - `shadowsWanted()` gates on the light stage, so
   `shadowMap.enabled` is false and neither directional light casts. And no AO -
   toggling the AO composite moves the floor by 0.00 levels and 0.00 % of its
   pixels, because the AO pass deliberately skips `table` and `grid` (a floor
   disc occludes itself into a grey wash at grazing angles). The BUILD does get
   AO, -5.14 levels over 58 % of its pixels. So the object is grounded only by
   the planar reflection, which BRIGHTENS where the feet touch (+20.6 levels)
   where the light stage goes 47 levels darker.

   THE APPROACH, AND WHY IT IS NOT A RENDER PASS.
   This is not a shadow solver. It is an approximation that uses what GEN2
   already knows: where the parts are, how big their footprints are, and how far
   each one currently sits above the stage. Every low-lying instance contributes
   one soft elliptical patch, and the patch WIDENS and FADES as the part rises -
   which is what a real contact shadow does, and which makes lifting, separating
   and assembly behave correctly for free rather than needing a special case.

   ⚠ WHY IT WILL NOT REPRODUCE THE GREY WASH THAT GOT FLOOR AO EXCLUDED.
     - the plane is sized to the build's own footprint plus a margin, not to the
       table, so there is no far field to wash;
     - strength falls off steeply with height, so only things actually NEAR the
       stage draw anything;
     - contributions combine as 1 - PROD(1 - a). ⚠ THAT SATURATES, IT DOES NOT
       MAKE OVERLAP NEUTRAL, and an earlier version of this comment claimed it
       did. Two overlapping 0.5 masks give 0.75 - darker than either, just never
       past 1. That is the intended behaviour (two parts really do occlude more
       than one) but it is NOT a guarantee against a darker seam, and anything
       relying on one has to say so itself.
   ⚠ AND IT DOES NOT REPLACE THE REFLECTION. Both are on: the reflection says
   "polished surface", the patch says "resting on it". They are different cues.  */
function groundingWanted() {
  return !!QUALITY[quality].grounding && stageTheme === 'dark' && !cinema.on
    && !isWallBuild && !isUnderTableBuild && !IS_PART && !fxDead.grounding
    && typeof assembledBox !== 'undefined' && !assembledBox.isEmpty();
}
function ensureGrounding() {
  if (ground.mesh) return;
  ground.mat = new THREE.ShaderMaterial({
    uniforms: {
      uPos: { value: ground.pos }, uSiz: { value: ground.siz }, uStr: { value: ground.str },
      uCount: { value: 0 }, uDark: { value: 0.55 },
    },
    defines: { GROUND_MAX },
    vertexShader: `
      varying vec2 vXZ;
      void main() {
        vec4 wp = modelMatrix * vec4( position, 1.0 );
        vXZ = wp.xz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec2 uPos[ GROUND_MAX ];
      uniform vec2 uSiz[ GROUND_MAX ];
      uniform float uStr[ GROUND_MAX ];
      uniform int uCount;
      uniform float uDark;
      varying vec2 vXZ;
      void main() {
        /* Each patch removes a fraction of the light still left, so the total
           SATURATES at 1 instead of running away. ⚠ It does not make overlap
           neutral: two 0.5 patches give 0.75. Seams get darker, bounded. */
        float open = 1.0;
        for ( int i = 0; i < GROUND_MAX; i++ ) {
          if ( i >= uCount ) break;
          vec2 d = ( vXZ - uPos[ i ] ) / uSiz[ i ];
          float r = length( d );
          // squared smoothstep: tight core, soft shoulder, exactly zero at r = 1
          float a = 1.0 - smoothstep( 0.0, 1.0, r );
          open *= 1.0 - uStr[ i ] * a * a;
        }
        float occ = ( 1.0 - open ) * uDark;
        if ( occ < 0.002 ) discard;
        gl_FragColor = vec4( 0.0, 0.0, 0.0, occ );
      }`,
    transparent: true, depthWrite: false, depthTest: true,
  });
  ground.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), ground.mat);
  ground.mesh.renderOrder = 1;          // over the grid, under everything solid
  ground.mesh.frustumCulled = false;
  ground.mesh.visible = false;
  ground.mesh.userData.ghost = true;    // keep it out of the AO pass and the reflection
  scene.add(ground.mesh);
}
/* Everything updateGrounding reads, compared against the last computation and stored: the box list (rebuilt with the
   parts), each box's part - shown, and its position (the height test reads it, and its world position IS its position
   while the part hangs straight off the scene and the scene sits at the origin, both checked) - the assembled bounds
   (the plane's placement), and the two materials the counts are written into. true = compute. */
function groundingInputsChanged(boxes) {
  const s = ground.seen || (ground.seen = { boxes: null, mat: null, refl: null, reflMat: null,
    v: new Float64Array(0), bounds: new Float64Array(6), sceneM: new Float64Array(16), first: true });
  let changed = s.first;
  s.first = false;
  if (s.boxes !== boxes) { s.boxes = boxes; changed = true; }
  if (s.mat !== ground.mat) { s.mat = ground.mat; changed = true; }
  const rm = refl.mesh, rmat = rm ? rm.material : null;
  if (s.refl !== rm || s.reflMat !== rmat) { s.refl = rm; s.reflMat = rmat; changed = true; }
  if (storeChanged16(s.sceneM, 0, scene.matrixWorld.elements)) changed = true;
  const b = assembledBox, bb = s.bounds;
  if (bb[0] !== b.min.x || bb[1] !== b.min.y || bb[2] !== b.min.z || bb[3] !== b.max.x || bb[4] !== b.max.y || bb[5] !== b.max.z) {
    bb[0] = b.min.x; bb[1] = b.min.y; bb[2] = b.min.z; bb[3] = b.max.x; bb[4] = b.max.y; bb[5] = b.max.z;
    changed = true;
  }
  if (s.v.length !== boxes.length * 4) { s.v = new Float64Array(boxes.length * 4); changed = true; }
  const v = s.v;
  for (let i = 0; i < boxes.length; i++) {
    const g = boxes[i].inst.group, o = i * 4;
    if (g.parent !== scene) changed = true;   // a part under anything else: its world position is not its position
    const shown = g.visible ? 1 : 0, p = g.position;
    if (v[o] !== shown || v[o + 1] !== p.x || v[o + 2] !== p.y || v[o + 3] !== p.z) {
      v[o] = shown; v[o + 1] = p.x; v[o + 2] = p.y; v[o + 3] = p.z;
      changed = true;
    }
  }
  return changed;
}
/* Each instance's LOCAL bounding box, computed once per scene revision. Calling
   Box3.setFromObject every frame walks the geometry; transforming a cached local
   box by the group matrix does not, and a lift animation needs this per frame. */
function groundingBoxes() {
  if (ground.rev === ao.rev && ground.boxes) return ground.boxes;
  ground.boxes = [];
  for (const inst of instances.values()) {
    if (!inst.group) continue;
    const b = new THREE.Box3();
    inst.group.updateMatrixWorld(true);
    b.setFromObject(inst.group);
    if (b.isEmpty()) continue;
    // store it relative to the group so it can be re-placed cheaply
    ground.boxes.push({ inst, size: b.getSize(new THREE.Vector3()), base: b.min.y - inst.group.position.y });
  }
  ground.rev = ao.rev;
  return ground.boxes;
}
function updateGrounding() {
  const draw = groundingWanted();
  ensureGrounding();
  if (!ground.mesh) return;
  ground.mesh.visible = draw;
  if (!contactMapWanted()) { ground.mat.uniforms.uCount.value = 0; ground.seen = null; return; }

  const boxes = groundingBoxes();
  /* MOVE_OPT.grounding (2026-09-14): the map is where the PARTS are, and a moving camera does not move them - so when
     no part moved, showed or hid since the last computation, the uniforms already hold this frame's answer. */
  if (!MOVE_OPT.grounding) ground.seen = null;
  else if (!groundingInputsChanged(boxes)) return;
  const cand = [];
  for (const e of boxes) {
    const g = e.inst.group;
    if (!g.visible) continue;
    const h = g.position.y + e.base;                       // this part's height above the stage NOW
    if (h > GROUND_H || h < -20) continue;
    /* ⚠ THE PATCH GROWS AND FADES WITH HEIGHT, and that single line is what
       makes assembly, lifting and separation behave without a special case: a
       part carried up leaves a wider, weaker mark and then none at all, instead
       of a hard shadow stuck to the floor under nothing. */
    const k = 1.0 - Math.min(1, Math.max(0, h) / GROUND_H);
    g.getWorldPosition(_gv);
    cand.push({
      x: _gv.x, z: _gv.z,
      sx: e.size.x * 0.5 + 6 + h * 0.55,
      sz: e.size.z * 0.5 + 6 + h * 0.55,
      s: 0.85 * k * k,
    });
  }
  // the strongest contacts win the slots; a 6H board has more low parts than uniforms
  cand.sort((a, b) => b.s - a.s);
  const n = Math.min(GROUND_MAX, cand.length);
  for (let i = 0; i < n; i++) {
    ground.pos[i * 2] = cand[i].x; ground.pos[i * 2 + 1] = cand[i].z;
    ground.siz[i * 2] = cand[i].sx; ground.siz[i * 2 + 1] = cand[i].sz;
    ground.str[i] = cand[i].s;
  }
  ground.mat.uniforms.uCount.value = n;
  ground.mat.uniforms.uPos.value = ground.pos;
  ground.mat.uniforms.uSiz.value = ground.siz;
  ground.mat.uniforms.uStr.value = ground.str;
  ground.mat.uniformsNeedUpdate = true;
  /* the reflector reads the SAME arrays - one contact map, two possible
     consumers, so the two can never disagree about where the contacts are */
  if (refl.mesh) {
    const u = refl.mesh.material.uniforms;
    if (u.uCount) { u.uCount.value = n; u.uniformsNeedUpdate = true; refl.mesh.material.uniformsNeedUpdate = true; }
  }

  // sit the plane on the build's own footprint plus the widest patch, never the table
  const c = assembledBox.getCenter(new THREE.Vector3());
  const s = assembledBox.getSize(new THREE.Vector3());
  const pad = 40 + GROUND_H * 0.55;
  ground.mesh.position.set(c.x, 0.02, c.z);              // above the grid at 0.01
  ground.mesh.scale.set(s.x + pad * 2, 1, s.z + pad * 2);
}

/* ==========================================================================
   DRAWER CAVITY FILL - an assembly-aware approximation of interior bounce
   ==========================================================================
   THE CUE IT BORROWS, and the limits of what was established about it. Against a
   path-traced reference on matched studio lighting, a drawer's interior differed
   from the raster one mainly in COLOUR: normalising both so the red channel
   matched exactly, the traced cavity carried ~60 % more blue (15.2 -> 24.3 of
   255). ⚠ THAT MEASURED A COLOUR DIFFERENCE, NOT AN ISOLATION OF INDIRECT LIGHT -
   material response, specular and the tone curve all move channel ratios too, and
   the baseline is small. Bounce is the most plausible reading, not a proven one.
   ⚠ The traced image is INSPIRATION, NOT A TARGET. This does not try to match it
   numerically; it tries to look better.

   WHAT IT DOES. A drawer's interior gets a small ADDITIVE fill - never a repaint
   of the drawer's own colour, which would throw away the filament the user chose.
   Two components, deliberately not one:
     ROOM   neutral, rises with how far the drawer is out. An open drawer is in
            the room and sees more of it.
     CASE   tinted by the case the drawer sits in, and a PARABOLA in openness,
            peaking half-open. ⚠ This is the part that must not simply increase
            with opening distance: a drawer still inside its case is enclosed by
            the case and sees mostly that; a drawer pulled right out has left the
            cavity behind and sees the room instead.

   ⚠⚠ SCALED BY THE DRAWER'S OWN ALBEDO, WHICH IS WHAT STOPS BLACK PLASTIC
   GLOWING. Bounced light is light a surface REFLECTS; a near-black drawer
   reflects almost none of it. Adding a flat emissive term to every drawer would
   make the black ones glow like lamps - the single most likely artefact of this
   whole idea - so the fill is multiplied by the drawer's own colour channels.
   Black stays black by construction rather than by a tuned exception.        */
const CAVITY = {
  on: false,            // OFF until the matrix below has been judged by eye
  strength: 0.30,       // overall scale
  caseWeight: 0.75,     // how much of the fill is case-tinted vs neutral room
  room: new THREE.Color(0xb9c2d6),   // the studio's own neutral, desaturated
};
const _cavA = new THREE.Color(), _cavB = new THREE.Color(), _cavC = new THREE.Color();
/* ⚠ declared ABOVE the function that reads it, not below - the ordering lesson
   this file has now paid for three times. */
const cavity = { _list: null, _rev: -1, _palRev: -1, clones: false };   // clones: a drawer may still wear a fill clone
/* the drawers this touches, and the case each one sits in - resolved from the
   MANIFEST's own relationships, not from a hardcoded kit */
function cavityDrawers() {
  if (ground.rev === cavity._rev && cavity._list) return cavity._list;
  cavity._list = [];
  for (const inst of instances.values()) {
    if (!/Drawer_/.test(inst.cfg.node) || inst.cfg.rides) continue;
    // the case whose bay this drawer occupies: nearest case centre in x, same row
    let best = null, bestD = Infinity;
    for (const c of instances.values()) {
      if (!/_Case$/.test(c.cfg.node)) continue;
      const dy = Math.abs(c.cfg.pos[1] - inst.cfg.pos[1]);
      if (dy > 40) continue;                       // a different row
      const dx = Math.abs(c.cfg.pos[0] - inst.cfg.pos[0]);
      if (dx < bestD) { bestD = dx; best = c; }
    }
    cavity._list.push({ inst, caseInst: best, z0: inst.cfg.pos[2], mats: null });
  }
  cavity._rev = ground.rev;
  return cavity._list;
}
function cavityFillWanted() { return CAVITY.on && !cinema.on && !IS_PART; }
function updateCavityFill() {
  const on = cavityFillWanted();
  /* MOVE_OPT.cavity (2026-09-14): switched off, with no drawer still wearing a fill clone, the loop below only computes
     two colours per drawer and throws them away - every frame (0.33 ms per unthrottled frame on the 80-unit build in a
     sampled profile, from a session that ran slow; vault measurements.md). */
  if (MOVE_OPT.cavity && !on && !cavity.clones) return;
  const list = cavityDrawers();
  const travel = Math.max(1, (parseInt(manifest && manifest.collection, 10) || 185) - 20);
  for (const d of list) {
    const g = d.inst.group;
    if (!g) continue;
    /* openness from the drawer's OWN travel, so it tracks a live slide, a step
       animation and the deep-pull focus without any of them knowing about this */
    const o = Math.min(1, Math.max(0, (g.position.z - d.z0) / travel));
    // the drawer's own colour is the albedo that scales everything
    const key = primaryKey(d.inst.cfg.node);
    _cavA.set(activeHex(key));
    // room term rises with openness; case term is a parabola peaking half-open
    const roomK = o;
    const caseK = 4 * o * (1 - o);
    _cavB.copy(CAVITY.room).multiplyScalar(roomK * (1 - CAVITY.caseWeight));
    if (d.caseInst) {
      _cavC.set(activeHex(primaryKey(d.caseInst.cfg.node)));
      _cavB.add(_cavC.multiplyScalar(caseK * CAVITY.caseWeight));
    }
    // ⚠ times the drawer's own albedo: black plastic cannot glow
    _cavB.multiply(_cavA).multiplyScalar(CAVITY.strength);
    /* ⚠⚠ PER-DRAWER CLONES, BECAUSE THE REGISTRY MATERIAL IS SHARED PER TYPE.
       Writing `emissive` onto what `materialFor` returns would light EVERY
       drawer of that type at once - including the closed ones, whose fronts
       would visibly come up. The fill is per-instance by definition, so it needs
       per-instance materials. `cloneMaterial` is used rather than `.clone()`
       because a bare clone drops onBeforeCompile and would silently lose the
       printed-layer relief on the drawer body.
       ⚠ KNOWN LIMITATION, and the reason this is off by default: the clones are
       re-synced from the registry only when the palette revision moves. A
       production version has to hook applyPalette properly rather than poll. */
    if (on && !d.mats) {
      d.mats = [];
      g.traverse((m) => {
        if (!m.isMesh || !m.material || !m.material.emissive) return;
        const c = cloneMaterial(m.material);
        c.userData.cavityClone = true;
        m.userData.cavityOrig = m.material;
        m.material = c;
        d.mats.push({ mesh: m, mat: c });
      });
      cavity.clones = true;
    }
    if (!on && d.mats) {
      for (const e of d.mats) {
        e.mat.emissive.setRGB(0, 0, 0);
        if (e.mesh.userData.cavityOrig) e.mesh.material = e.mesh.userData.cavityOrig;
        e.mat.dispose();
      }
      d.mats = null;
      continue;
    }
    if (d.mats) for (const e of d.mats) e.mat.emissive.copy(_cavB);
  }
  if (!on) cavity.clones = false;   // the loop just restored every drawer that wore one
}

// ---- the topbar control ----------------------------------------------------
const btnQuality = document.getElementById('btn-quality');
/* The docked (embed) viewer hides #topbar, which took the quality pill with it - so a planner user could not reach Very High
   without popping the studio out (Joey 2026-09-18). In embed the pill moves onto the stage, top-right, above the Parts pill. */
if (IS_EMBED && btnQuality) document.getElementById('stage-wrap')?.appendChild(btnQuality);
const QUALITY_LABEL = { veryhigh: 'Very High', high: 'High', balanced: 'Balanced', fast: 'Fast' };
function labelQualityBtn() {
  if (!btnQuality) return;
  btnQuality.textContent = QUALITY_LABEL[quality];
  btnQuality.dataset.q = quality;
  btnQuality.title = `Render quality: ${QUALITY_LABEL[quality]} — click to change`;
}
// returning from a background tab starts a FRESH window — the frames either side
// of the gap describe two different situations. perfFeed also does this per frame (a hidden frame
// resets the window, and the first second back is ignored); the event covers a browser that stops
// rAF entirely while hidden, so no hidden frame ever arrives to do it.
document.addEventListener('visibilitychange', () => {
  perf.lastNow = 0; perf.win.ms = 0; perf.win.n = 0;
  if (document.hidden) perf.wasHidden = true;
});
btnQuality?.addEventListener('click', () => {
  const i = QUALITY_ORDER.indexOf(quality);
  setQuality(QUALITY_ORDER[(i + 1) % QUALITY_ORDER.length], { user: true });
});

// ---- progressive quality + silent auto-downgrade ---------------------------
// This viewer is STATIC almost all the time — only manual orbit and step
// animations move it. So render cheap while moving and spend the budget the
// instant everything settles. pixelRatio is the measured strongest lever, so it
// is what moves; the reflection self-gates on its own view key, and the shadow
// map switches between per-frame and on-demand.
//
// The auto-downgrade is SILENT and ONE-WAY (Joey 2026-08-10): it only ever steps
// DOWN, never back up, so a brief stall can't start the tier oscillating. An
// explicit user pick locks it out entirely.
const perf = { key: '', moving: false, lastChange: 0, dpr: null, checked: 0,
               // the CAMERA alone - no tween count - for the passes that only a camera change invalidates
               camKey: '', cameraMoving: false, camChange: 0,
               // the auto-downgrade's window of accepted frame intervals (perfFeed)
               win: { ms: 0, n: 0 }, lastNow: 0, wasHidden: false, returnGraceUntil: 0,
               log: [],   // why each automatic quality change happened, newest last (debug hook: perf.log)
               thrifty: false };   // one-way: set once the device proves it needs the resolution drop
const SETTLE_MS = 160;

/**
 * A MOVING-CAMERA frame: the floor reflection and ambient occlusion skip their scene renders and come
 * back SETTLE_MS after the camera stops (Joey and Astra, 2026-09-14). MEASURED the same day on an
 * 80-unit build: a moving High frame made 3,812 draw calls against Balanced's 1,271 - the main image,
 * the mirror and the AO depth/normal pass each draw the whole build - and ran at 59.9 fps against 120.5.
 *
 * ⚠ THE CAMERA, NOT perf.moving. perf.moving also flips on a change in the tween count, so a step
 * animation with a still camera would blink the reflection off at every phase boundary; the mirror and
 * the AO buffer are invalidated by the camera, and AO already sits out tweens on its own (aoWanted).
 * ⚠ NOT DURING THE OUTRO, whose reflection is the point and whose camera never stops; and not for a
 * capture harness that holds AO on through motion (window.__FILM_AO_DURING_TWEENS, which the filming
 * rig sets so every frame of a clip is shaded the same).
 * The debounce is SETTLE_MS, inside the 100-200 ms Astra asked for, so small movements and touch inertia
 * do not flip the passes on and off.
 */
function motionLite() {
  return perf.cameraMoving && !cinema.on && !window.__FILM_AO_DURING_TWEENS;
}

/* ---- the auto-downgrade (rewritten 2026-09-14, Astra's rules) -------------------------------------
   MEASURED before the rewrite: an 80-unit build under a 4x CPU throttle ran High at ~9 fps, and from a
   fresh High the downgrade reached Balanced only after 25.9 s - because every 3 s window holding fewer
   than 30 frames, i.e. anything under 10 fps, was discarded as "untrustworthy". The guard against a
   throttled background tab threw away exactly the case that most needs the downgrade.
   Now:
   - a HIDDEN page is not sampled at all, and its first second back is ignored (the tab-switch case);
   - a single frame interval over PERF_PAUSE_MS is a PAUSE, not a frame rate - a throttled or offscreen
     frame, a compile stall, an alert - and is left out of the window rather than failing it;
   - the second and a half after any quality change, stage-theme change or re-mount is ignored too,
     because each of those compiles programs and the stalls are not the device's frame rate;
   - SEVERE: under PERF_SEVERE.fps over 2 s of accepted frames steps the tier down at once (and turns on
     the resolution drop), and again after the next 2 s window if it is still that slow - that window
     starts when the tier change's 1.5 s grace ends, so a second severe step comes 3.5 s or more after
     the first (in both measured runs of the 80-unit build under a 4x throttle the second step came
     about 5 s after the first, by the moderate rule);
   - MODERATE: the old rule on 3 s windows - under 30 fps the resolution drop, under 24 a tier step;
   - the first window after boot is discarded, and nothing ever steps back UP (hysteresis by design:
     one-way, so a recovered frame rate cannot start an oscillation).
   ⚠ RESIDUAL RISK, stated: a page the browser keeps VISIBLE but throttles to between 2 and 15 fps would
   read as a slow device. Hidden pages, paused rAF and 1 Hz throttling (Chrome's background tabs and
   offscreen frames) all fall outside that band. */
const PERF_PAUSE_MS = 500;
const PERF_RETURN_GRACE_MS = 1000;
/* minFrames 4 is what 2 s holds at the slowest rate that is not a pause (500 ms a frame) - a larger
   minimum stretched the severe window past 2 s for exactly the slowest devices (review 01a0a19a) */
const PERF_SEVERE = Object.freeze({ windowMs: 2000, minFrames: 4, fps: 15 });
const PERF_MODERATE = Object.freeze({ windowMs: 3000, minFrames: 30, thriftyFps: 30, stepFps: 24 });
/* ⚠ `var` WITH NO INITIALISER, AND A FUNCTION DECLARATION: applyQuality and applyStageTheme run during
   module evaluation and call perfGrace, long before a `const` here would exist (the #btn-theme lesson).
   An initialiser would also reset the value when this line finally runs. */
var perfGraceUntil;
function perfGrace(ms = 1500) {
  perfGraceUntil = Math.max(perfGraceUntil || 0, performance.now() + ms);
}
/**
 * The verdict on one window of accepted frame intervals, or null while it is too short to judge.
 * Pure: test/quality-guard.test.mjs calls it.
 */
function perfVerdict(win, { thrifty, locked, canStep }) {
  const fps = win.ms > 0 ? win.n / (win.ms / 1000) : 0;
  if (win.ms >= PERF_SEVERE.windowMs && win.n >= PERF_SEVERE.minFrames && fps < PERF_SEVERE.fps) {
    return { fps, severe: true, thrifty: !thrifty, step: !locked && canStep };
  }
  if (win.ms < PERF_MODERATE.windowMs) return null;
  if (win.n < PERF_MODERATE.minFrames) return { fps, severe: false, thrifty: false, step: false };
  if (fps < PERF_MODERATE.thriftyFps && !thrifty) return { fps, severe: false, thrifty: true, step: false };
  return { fps, severe: false, thrifty: false, step: fps < PERF_MODERATE.stepFps && !locked && canStep };
}
/**
 * Feed one frame to the window. Returns a verdict when a window closes (with its length in `windowMs`),
 * else null. Touches nothing but `p`, so the test drives it with synthetic timestamps.
 */
function perfFeed(p, now, { hidden, graceUntil, thrifty, locked, canStep }) {
  if (hidden) { p.lastNow = 0; p.win.ms = 0; p.win.n = 0; p.wasHidden = true; return null; }
  if (p.wasHidden) { p.wasHidden = false; p.returnGraceUntil = now + PERF_RETURN_GRACE_MS; }
  const dt = p.lastNow ? now - p.lastNow : 0;
  p.lastNow = now;
  if (now < Math.max(graceUntil || 0, p.returnGraceUntil || 0)) { p.win.ms = 0; p.win.n = 0; return null; }
  if (!(dt > 0) || dt > PERF_PAUSE_MS) return null;
  p.win.ms += dt; p.win.n++;
  const v = perfVerdict(p.win, { thrifty, locked, canStep });
  if (!v) return null;
  v.windowMs = p.win.ms;
  p.win.ms = 0; p.win.n = 0;
  if (p.checked++ === 0) return null;   // the first window after boot is boot jank, not a verdict
  return v;
}
function logQuality(line) {
  perf.log.push({ t: Math.round(performance.now()), line });
  if (perf.log.length > 20) perf.log.shift();
  console.info('[gen2] ' + line);
}

function qualityTick(now) {
  const q = QUALITY[quality];
  const cap = Math.min(q.dpr, devicePixelRatio);
  if (cinema.on) {                       // the outro drives its own camera constantly
    if (perf.dpr !== cap) { perf.dpr = cap; renderer.setPixelRatio(cap); setLayerDetailPixelRatio(cap); renderer.setSize(canvas.clientWidth, canvas.clientHeight, false); }
    perf.cameraMoving = false;           // and keeps its reflection (motionLite excludes it anyway)
    return;
  }
  const camKey = camera.position.toArray().concat(controls.target.toArray()).map(v => v.toFixed(2)).join();
  if (camKey !== perf.camKey) { perf.camKey = camKey; perf.camChange = now; perf.cameraMoving = true; }
  else if (perf.cameraMoving && now - perf.camChange > SETTLE_MS) perf.cameraMoving = false;
  const key = camKey + '|' + tweens.size;
  if (key !== perf.key) { perf.key = key; perf.lastChange = now; perf.moving = true; }
  else if (perf.moving && now - perf.lastChange > SETTLE_MS) {
    perf.moving = false;
    if (renderer.shadowMap.enabled) { renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true; }
  }
  /* Before MOVE_OPT.shadow the shadow map re-rendered on every frame this was true, a camera-only move included. With
     it, watchShadowCasters asks for a render when a caster or the light changed; the one refresh on settling stays. */
  if (renderer.shadowMap.enabled) renderer.shadowMap.autoUpdate = perf.moving && !MOVE_OPT.shadow;
  shadowWatch.moving = perf.moving;   // the watch runs on exactly these frames (see shadowWatch)

  // ⚠ The resolution drop is CONDITIONAL — it only engages on a device that has
  // actually shown it needs the help (perf.thrifty). It shipped unconditional and
  // that was wrong: every animation resized the canvas down and back up, and thin
  // geometry — the cyber grid above all — visibly shimmered on each switch (Joey
  // caught it on a phone that never needed the saving). A rescue mechanism should
  // cost nothing on hardware that is coping.
  const want = (perf.thrifty && perf.moving && !benchHold) ? Math.min(1, cap) : cap;
  if (perf.dpr !== want) {
    perf.dpr = want;
    renderer.setPixelRatio(want);
    /* ⚠ BOTH dpr PATHS, AND THERE ARE TWO. The relief's band limit is stated in CSS pixels per
       layer, so it has to be told when the device pixel ratio moves under it — otherwise a tier
       change draws the corrugation at the wrong sampling and nothing says so. The cinema branch
       above is the other one. */
    setLayerDetailPixelRatio(want);
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  }

  // The sustained-low-fps guard - the rules are above perfVerdict. Both actions are ONE-WAY.
  // 30 not 45 for the resolution drop: it is VISIBLE (thin geometry shimmers as the canvas
  // resizes), so it has to mean "genuinely struggling", not "fine but not a solid 60".
  // ⚠ A BACKGROUNDED TAB IS NOT A SLOW DEVICE - browsers throttle rAF to ~1 Hz (or stop it) when
  // a tab is hidden, and a sampler that believed it would silently cost you the good renderer.
  // perfFeed skips hidden frames, drops intervals over PERF_PAUSE_MS, and waits a second after a
  // return; it no longer discards a slow window, which is the case the downgrade exists for.
  if (quality === 'fast' && perf.thrifty) return;
  if (benchHold) return;   // the orbit benchmark holds the tier and the resolution for the whole run (orbit-bench.js)
  const v = perfFeed(perf, now, { hidden: document.hidden, graceUntil: perfGraceUntil, thrifty: perf.thrifty,
    locked: qualityLocked, canStep: QUALITY_ORDER.indexOf(quality) < QUALITY_ORDER.length - 1 });
  if (!v || !(v.thrifty || v.step)) return;
  const units = build && Array.isArray(build.placed) ? ` (${build.placed.length} units)` : '';
  const why = `${v.severe ? 'sustained' : 'averaged'} ${v.fps.toFixed(1)} fps over ${(v.windowMs / 1000).toFixed(1)} s, `
    + `visible tab, ${instances.size} parts${units}`;
  if (v.thrifty) {
    perf.thrifty = true; track('quality:thrifty');
    logQuality(`auto quality: resolution drop while moving - ${why}`);
  }
  if (v.step) {
    const from = quality, next = QUALITY_ORDER[QUALITY_ORDER.indexOf(quality) + 1];
    setQuality(next); track('quality:auto-' + next);
    logQuality(`auto quality: ${QUALITY_LABEL[from]} → ${QUALITY_LABEL[next]} - ${why}`);
  }
}

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  // a zero-area canvas (display:none iframe whose rAF still ticks) must never
  // reach setSize/aspect — 0/0 writes a NaN projection and a 0×0 buffer that
  // "renders" successfully showing nothing (the partReady gate also refuses it)
  if (!w || !h) return;
  // ⚠ canvas.width is the DRAWING BUFFER size (device px); clientWidth is the CSS
  // layout size. setPixelRatio(2) makes the buffer twice the CSS width, so
  // comparing them DIRECTLY was never equal on a HiDPI display and this whole body
  // ran every single frame — measured 2026-08-10 by counting setSize calls: 0/sec
  // at devicePixelRatio 1, 39/sec (i.e. every frame) at devicePixelRatio 2. That
  // also re-NaN'd viewInset every frame, so the desktop filament-menu pan snapped
  // instead of lerping, and it is the likely root cause of the old "violent
  // vibration" (the 0↔target oscillation worked around in updateViewInset).
  const dpr = renderer.getPixelRatio();
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    viewInset.x = viewInset.y = NaN; // canvas size changed — force a re-apply with fresh dims (the lerp treats NaN as "adopt the target instantly")
    // re-fit a whole-build shot to the new aspect (skip during the cinema, which
    // drives the camera itself, and during drawer/faceplate focus, which park
    // the camera on the part)
    if ((curCamPreset?.fit || curCamPreset?.coverBox) && !cinema.on && !tweens.size && !camOverride && !dFocus.carrier && !fpFocus.id) {
      const { pos, target } = camPos(curCamPreset);
      camera.position.copy(pos); controls.target.copy(target); controls.update();
    }
    // part-preview: the iframe resizes with the site's media column — keep the
    // part (or the plate scene) fitted until the user has taken the camera over
    if (IS_PART && manifest && !partView.interacted)
      PART_PLATE ? fitPlateCamera(plateStage.top) : fitPartCamera();
  }
}
// Mobile: the step-note panel overlays the top of the canvas (long wall notes
// used to cover half the action — Joey). Pan the camera's PROJECTION down by
// half the covered height (setViewOffset — a pure pan, same aspect), so every
// framing (fit presets, the faceplate cinematic, isolation) centers itself in
// the visible band below the note. Projected labels (dims/pointer/measure) go
// through camera.project(), so they track the shift for free.
const viewInset = { x: 0, y: 0 }; // APPLIED projection pan in px (lerped toward target each frame)
const _viCorner = new THREE.Vector3(); // scratch — updateViewInset runs every frame
function updateViewInset() {
  // Pan the camera PROJECTION so the model sits in the VISIBLE region of the
  // canvas. A pure presentation pan (setViewOffset): camera pose, orbit target
  // and zoom are never touched, and clearing the offset restores the exact
  // prior framing. Two independent axes:
  // - MOBILE (vertical): center in the band below the note panel and above the
  //   filament bottom sheet (2026-08-07 — the two used to leave a sliver).
  // - DESKTOP (horizontal, 2026-08-07 second UX pass): occlusion-aware only.
  //   While the right-docked picker is up, if the PROJECTED build extends
  //   under the panel, shift the composition left just enough to clear it
  //   (+32px) — and NOT AT ALL when nothing meaningful is covered. The model
  //   is the picker's live feedback, so an unobstructed build is task support,
  //   not aesthetics; the conditionality is what keeps it from reading as a
  //   camera glitch. Sign convention (probed): positive offsetX shifts content
  //   LEFT, 1px = 1px, so base (unshifted) x = measured x + applied offset.
  // Rects and projections re-measure every frame; the applied offset LERPS
  // toward its target (~150-200ms), so panel-open, orbiting and drawer glides
  // all track smoothly instead of snapping.
  let tx = 0, ty = 0;
  if (!cinema.on) {
    const cb = canvas.getBoundingClientRect();
    if (isMobile()) {
      let top = 0, bottom = 0;
      const note = $('note-panel');
      if (note && !note.classList.contains('hidden') && !note.classList.contains('collapsed')) {
        const nb = note.getBoundingClientRect();
        top = Math.max(0, Math.min(nb.bottom - cb.top, cb.height * 0.5));
      }
      const fm = $('filament-menu');
      if (fm && !fm.classList.contains('hidden')) {
        const mb = fm.getBoundingClientRect();
        bottom = Math.max(0, Math.min(cb.bottom - mb.top, cb.height * 0.5));
      }
      ty = (bottom - top) / 2;
    } else if (document.body.classList.contains('fm-open') && !assembledBox.isEmpty()) {
      const fm = $('filament-menu');
      if (fm && !fm.classList.contains('hidden')) {
        const mb = fm.getBoundingClientRect();
        const panelLeft = mb.left - cb.left;
        if (panelLeft > 120) { // sanity: the panel is genuinely right-docked with room to spare
          let minX = Infinity, maxX = -Infinity, ok = true;
          const b = assembledBox;
          for (let i = 0; i < 8; i++) {
            _viCorner.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(camera);
            if (_viCorner.z > 1) { ok = false; break; } // a corner behind the camera mirrors — bail rather than shift on garbage
            const sx = (_viCorner.x * 0.5 + 0.5) * cb.width;
            if (sx < minX) minX = sx;
            if (sx > maxX) maxX = sx;
          }
          if (ok) {
            // ⚠ the base-correction MUST read the CAMERA, not viewInset:
            // resize() NaNs the bookkeeping while the projection matrix still
            // carries the offset, and reading the mirror here desynced the
            // two — need flapped across the deadband and the whole scene
            // oscillated 0↔target at full amplitude, once per frame (the
            // "violent vibration": the shifted dim labels changed layout,
            // layout fired resize(), resize() re-armed the desync).
            const applied = camera.view && camera.view.enabled ? camera.view.offsetX : 0;
            const need = (maxX + applied) - (panelLeft - 32);   // clear the panel by 32px
            if (need > 12) // deadband: ignore trivial underlap
              tx = Math.min(need, Math.max(0, (minX + applied) - 16), cb.width * 0.35);
          }
        }
      }
    }
  }
  // lerp the applied offset toward its target; snap the last half-pixel so a
  // zero target genuinely reaches clearViewOffset. After an invalidation the
  // lerp reseeds from the CAMERA's actual offset (same truth-source rule as
  // the base-correction above) — seeding from the target instead turned every
  // resize() into a full-amplitude jump.
  const curX = isFinite(viewInset.x) ? viewInset.x : (camera.view && camera.view.enabled ? camera.view.offsetX : 0);
  const curY = isFinite(viewInset.y) ? viewInset.y : (camera.view && camera.view.enabled ? camera.view.offsetY : 0);
  let nx = curX + (tx - curX) * 0.25;
  let ny = curY + (ty - curY) * 0.25;
  if (Math.abs(nx - tx) < 0.5) nx = tx;
  if (Math.abs(ny - ty) < 0.5) ny = ty;
  if (nx === viewInset.x && ny === viewInset.y) return;
  viewInset.x = nx; viewInset.y = ny;
  if (nx || ny) camera.setViewOffset(canvas.clientWidth, canvas.clientHeight, nx, ny, canvas.clientWidth, canvas.clientHeight);
  else camera.clearViewOffset();
}

// ---------- load manifest + parts ----------
// `build` is the decoded planner build (null for static kits). The options menu
// mutates it and regenerate() re-runs the generator + re-mounts the scene, so
// most manifest-derived state below is (re)built inside mountManifest().
let manifest, PARTS_BASE, build = null, originalBuild = null;
// set when the ROOT's official kit could not be shown and the static demo took
// over; read once below to report the degraded door
let rootFailure = null;
// The static path, factored out because the root can land here two ways: an
// explicit ?kit=, or the official front door failing. It had NO error handling
// at all — a missing kit folder returns an HTML 404 body, .json() throws, and
// as top-level await that was an unhandled rejection: spinner forever, no
// message, no analytics. On the production root that was a silent total loss.
async function loadStaticKit() {
  try {
    const res = await fetch(KIT_URL + 'manifest.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    manifest = await res.json();
  } catch (e) {
    track('error:kit-not-found');
    bootFail('<strong>This build isn’t available - it may have moved or been renamed.</strong>' +
      '<br><br><a href="builds/">Browse the official GEN2 kits →</a>', 'static kit "' + KIT + '": ' + e.message);
  }
  PARTS_BASE = KIT_URL + 'parts/';
}
const decodeBuild = h => { const raw = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(h))))); return raw.data || raw; };
// boot failure → the loading overlay becomes the message and the module halts
// (the throw is deliberate: nothing below can run without a manifest)
function bootFail(html, log) {
  const box = document.getElementById('loading-overlay');
  box.querySelector('.spinner')?.remove();
  document.getElementById('loading-text').innerHTML = html;
  throw new Error(log);
}
if (IS_PART) {
  // product-preview embed: the slug resolves through the REAL generator
  // (resolvePartPreview) into a one-part manifest the normal mount consumes.
  // Every failure posts partError to the embedding page FIRST — the site keeps
  // its static poster ("fail loud, never blank") — then halts with a readable
  // message for anyone looking at the iframe directly.
  let res;
  try {
    // a plate= param that doesn't parse is a hard failure, not a silent
    // fall-through to the product view — the site must keep its poster
    res = (ENTRY.plateRequested && !PART_PLATE)
      ? { fail: { reason: 'unsupported', message: 'Bad plate size (want <width>x<depth> in mm, 50-1000 each).' } }
      : resolvePartPreview(PART_SLUG, { plate: !!PART_PLATE });
  } catch (e) {
    // a resolver THROW is our bug, not a bad slug — the site still needs a
    // typed message so its poster stays up
    res = { fail: { reason: 'load-failed', message: 'preview resolver crashed: ' + ((e && e.message) || e) } };
  }
  if (res.fail) {
    postToEmbedder({ gen2: 'partError', reason: res.fail.reason, message: res.fail.message });
    track('error:part-' + (res.fail.reason === 'unknown-part' ? 'unknown' : 'unsupported'));
    bootFail('<strong>No 3D preview for this part</strong><br><br>• ' + res.fail.message,
      'part preview "' + PART_SLUG + '": ' + res.fail.message);
  }
  manifest = res.manifest;
  PARTS_BASE = 'parts/' + (manifest.collection || '185') + '/';
} else if (IS_BENCH) {
  // the orbit benchmark's fixed workload (benchBuild in orbit-bench.js; pinned part for part by test/orbit-bench.test.mjs)
  build = benchBuild();
  originalBuild = structuredClone(build);
  let gen = null;
  try { gen = generateManifest(build); } catch (e) { gen = { manifest: null, errors: [String((e && e.message) || e)] }; }
  if (!gen.manifest) bootFail('<strong>The benchmark build can’t be shown</strong><br><br>' + gen.errors.map(e => '• ' + e).join('<br>'),
    'benchmark build: ' + gen.errors.join('; '));
  manifest = gen.manifest;
  PARTS_BASE = 'parts/' + (manifest.collection || '185') + '/';
} else if (BUILD_HASH) {
  // The message is the same either way, but the EVENT distinguishes three very
  // different problems: a mangled/truncated hash (the link), a build the
  // generator knowingly refuses (a capability gap), and a generator that threw
  // (our bug). Telling them apart in the dashboard is the whole point.
  let gen = null, fail = 'build-damaged';
  const HASH_ERR = { errors: ['This build link is damaged or truncated · try copying it again from the planner.'], manifest: null };
  try {
    build = decodeBuild(BUILD_HASH[1]); // accept raw serializeBuild() or the file export wrapper
    originalBuild = structuredClone(build); // "Reset to original" restores this exact build
  } catch (e) {
    gen = HASH_ERR;
  }
  if (!gen) {
    try {
      gen = generateManifest(build);
      if (!gen.manifest) fail = 'build-unsupported';
    } catch (e) {
      gen = HASH_ERR;
      fail = 'build-crash';
    }
  }
  if (!gen.manifest) {
    track('error:' + fail);
    bootFail('<strong>Can’t show this build yet</strong><br><br>' + gen.errors.map(e => '• ' + e).join('<br>'),
      'unsupported build: ' + gen.errors.join('; '));
  }
  manifest = gen.manifest;
  PARTS_BASE = 'parts/' + (manifest.collection || '185') + '/';   // one self-contained pool per collection (parts/165, parts/185)
} else if (WANTS_OFFICIAL) {
  const GALLERY = '<br><br><a href="builds/">Browse the official GEN2 kits →</a>';
  // `ev` names the failure for analytics — never the id itself, which at this
  // point is unvalidated visitor input (and a bad id is the whole story anyway:
  // it means a link we printed somewhere is wrong)
  //
  // AT THE ROOT there is no bad link to report and no visitor to blame: the door
  // must open. So a root failure records the same typed error — a broken front
  // door has to be VISIBLE in the dashboard, not silently papered over — and
  // then falls through to the static demo manifest instead of showing a 404
  // card. Everywhere else the 404 card is still exactly right.
  const kitFail = (msg, ev) => {
    track('error:' + ev);
    if (IS_ROOT) { rootFailure = ev; return; }
    bootFail('<strong>' + msg + '</strong>' + GALLERY, 'official kit "' + OFFICIAL_TARGET + '": ' + msg);
  };
  // TRANSACTIONAL: everything lands in locals and the globals (build, OFFICIAL,
  // originalBuild, manifest, PARTS_BASE) are committed only once the kit is
  // known good. A half-committed OFFICIAL on a root fallback would put the
  // static kit's palette in `gen2-colors:official-<id>` and hand it a Customize
  // button pointing at a build it isn't showing.
  let file = null, mBuild = null, mGen = null;
  if (/^[a-z0-9][a-z0-9-]*$/.test(OFFICIAL_TARGET)) {
    try {
      const res = await fetch(`builds/${OFFICIAL_TARGET}.json`);
      if (res.ok) file = await res.json();
    } catch (e) { /* network / parse — falls through to the friendly 404 */ }
  }
  if (!file || !file.build)
    kitFail('This kit link isn’t available - it may have moved or been renamed.', 'kit-not-found');
  else if (file.gen2OfficialBuild !== 1)
    kitFail('This kit was made for a newer version of the Build Studio - refresh the page and try again.', 'kit-version');
  else if (!(mBuild = migrateOfficialBuild(file.build, file.buildVersion ?? 1)))
    kitFail('This kit was made for a newer version of the Build Studio - refresh the page and try again.', 'kit-version');
  else {
    // a THROW here used to be an unhandled top-level-await rejection: no message,
    // no analytics, spinner forever. The #build= path has always caught it; this
    // one never did, and it is the path every printed kit link takes.
    try { mGen = generateManifest(mBuild); } catch (e) { console.error(e); mGen = null; }
    if (!mGen) kitFail('This kit can’t be shown right now - please report it.', 'kit-crash');
    else if (!mGen.manifest) // a committed kit failing to generate is OUR bug, not the user's — say so plainly
      kitFail('This kit can’t be shown right now (' + mGen.errors.join(' · ') + ') - please report it.', 'kit-generate');
    else {
      build = mBuild;
      originalBuild = structuredClone(mBuild);
      OFFICIAL = { id: OFFICIAL_TARGET, title: String(file.title || 'GEN2 Kit'), tagline: typeof file.tagline === 'string' ? file.tagline : '' };
      manifest = mGen.manifest;
      PARTS_BASE = 'parts/' + (manifest.collection || '185') + '/';
    }
  }
  if (!manifest) await loadStaticKit();   // root fallback only — kitFail threw otherwise
} else {
  await loadStaticKit();
}
/* ⚠ THE BARE ROOT DELIBERATELY DOES NOT REWRITE THE ADDRESS BAR (Joey,
   2026-08-22, reversing the rewrite that shipped the day before).
   `/` MEANS "open the current recommended starter" - a live promise, not a
   snapshot. An earlier version replaceState'd it to `?build=<ROOT_BUILD>` so a
   copied link would name the real kit; the cost was that everyone who
   bookmarked or shared the rewritten URL was pinned to whatever kit happened
   to be the starter that day, and moving ROOT_BUILD later could never reach
   them. Two link semantics are better than one, so they are now BOTH
   available and each says what it means:
     /                       -> "send me to the currently recommended starter"
     ?build=<id>             -> "always open this exact kit"  (the Share pill)
   Analytics never needed the rewrite: `entry:root` records the door and
   `open:<actual-id>` records what loaded, so both facts are already reported
   correctly and independently of the address bar.
   The other half of the reversal is resilience: the root keeps its fallback
   (a kit that fails to load degrades to the static demo, loudly, via
   `entry:root-fallback`), while an EXPLICIT `?build=` still fails visibly with
   the 404 card rather than silently opening a different build. Someone who
   named a kit must never be quietly given another one.
   Pinned by test/entry-routes.test.mjs - do not reintroduce a rewrite here
   without changing that suite on purpose. */

// Funnel entry — which door they came in by, and what they're building. The
// official id is safe to name here: an unmatched one threw above, so only
// committed kit slugs reach this line (~20 values, not a long tail).
// part previews report ONE row (`open:part`), never the slug: the site's own
// analytics already record which part page was visited, and 458 slug rows
// would bury the dashboard's funnel.
// The DOOR is counted separately from the destination, under its own prefix
// head. It cannot be `open:root`: the dashboard sums the `open:` prefix blindly
// into BUILDS STARTED and the funnel's OPENED stage and lists every `open:*` row
// as a kit, so a second open: on one visit would double-count it and invent a
// kit called "root". `entry:` groups under ENTRY & INTENT instead.
// This also survives changing where the root points: the door keeps its own
// series while `open:` follows the destination.
if (IS_ROOT) {
  track('entry:root');
  if (rootFailure) track('entry:root-fallback'); // door opened, but on the demo kit
}
// ONE open: per visit, naming what actually LOADED - so a root that fell back to
// the static kit reports the static kit, not the official one it failed to show.
track(IS_PART ? (PART_PLATE ? 'open:part-plate' : 'open:part')
  : OFFICIAL ? 'open:' + OFFICIAL.id
  : BUILD_HASH ? (IS_EMBED ? 'open:embed' : 'open:planner-link')
  : IS_BENCH ? 'open:bench'   // never sent (track() stops benchmark events), but the local log should name the page
  : 'open:kit-' + KIT);
track('collection:' + (manifest.collection || '185'));
if (build?.mount) track('mount:' + build.mount);
// NB deliberately NO "returning visitor" event: it would need an
// analytics-only localStorage key, and storing nothing is exactly what lets
// this run without a consent banner. The other gen2-* keys are user settings.

// mount type is fixed for the life of the page (toggles never change it), so the
// backdrop + polar limits are set once here from the first manifest.

// wall builds hang on a wall, not a table — swap the table+grid for the backdrop.
const isWallBuild = manifest.mount === 'wall';
if (isWallBuild) {
  table.visible = false;
  grid.visible = false;
  wall.visible = true;
  scene.background = new THREE.Color(STAGE_THEMES[stageTheme].bgWall); // slightly deeper than the wall, for depth
  controls.maxPolarAngle = Math.PI * 0.85;      // allow a 3/4 view from below (watch rows hang up under the row above)
}
// under-table builds hang below a surface slab — no floor table/grid (they'd
// read as a second surface), and the camera lives mostly below the horizon.
const isUnderTableBuild = manifest.mount === 'under-table';
if (isUnderTableBuild) {
  table.visible = false;
  grid.visible = false;
  surface.visible = true;
  controls.maxPolarAngle = Math.PI * 0.85;      // the whole build is viewed from a 3/4-below angle
}
// part-preview: a clean float — no furniture, and the DOCUMENT itself goes
// transparent so the iframe shows the embedding page's panel color (the
// renderer already runs alpha:true for ?shot=1; applyStageTheme nulls
// scene.background in this mode). Full orbit: there's no table to dip under.
if (IS_PART) {
  table.visible = false;
  grid.visible = false;
  controls.maxPolarAngle = Math.PI * 0.9;
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
}

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

// Materials are keyed by part TYPE ('Faceplate') or a ZONE of one
// ('Faceplate:GRIP'). Zones come from 2-zone GLBs (EdgeLabel body+grip): the
// exporter ships tiny NAMED material stubs whose name tags each primitive —
// the viewer replaces every material, the name is the only thing it reads.
const materials = {};
const fallbackMat = new THREE.MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.6 });
const zoneKey = (type, zone) => zone ? `${type}:${zone}` : type;
function ensureMaterials() { // one shared material per type/zone key (idempotent across re-mounts)
  for (const [key, hex] of Object.entries(manifest.colors))
    if (!materials[key]) materials[key] = seeIntoPatched(key, newPartMaterial(key));
}
/* the see-into experiment's patch on the back cover material, or the material unchanged (see-into.js) */
/* ---------------------------------------------------------------- supported translucent previews (Astra 2026-09-17)
   WHICH COMPONENTS RENDER A TRANSLUCENT FILAMENT AS TRANSLUCENT. This is a RENDERING scope and never a claim about
   what can be printed: any part can be printed in translucent filament, and a part outside this set simply keeps its
   ordinary shading until its component is supported. Astra's order: the faceplate GRIP first, accents next if the
   grip holds up; cases, drawer bodies and structural parts are out of scope. The back cover stays the reference
   piece and is patched by the switch alone, not by a filament pick.
   ⚠ A zone with no pick of its own INHERITS the plate body's (activeLabel), so assigning translucent filament to the
   plate body turns its grip translucent too - which is what a plate printed in that filament would look like. */
/* ⚠ THE SUPPORTED SET IS PER FACEPLATE FAMILY, because the same material key means different geometry in each one
   (Joey 2026-09-18: "On the essential, allow the face, and on the Chevron faceplate allow the faces"). Essential is a
   SINGLE-ZONE plate, so its face IS the plain `Faceplate` key; Chevron's chevrons ship as one `FACE` zone; the three
   families with a grip keep the grip. A flat set could not express that: `Faceplate` is also the BODY key behind
   everything on EdgeLabel and Classic, and `Faceplate:FACE` also exists on Classic - neither of which Joey asked for,
   and neither of which is in Astra's scope for this release. */
const SEE_INTO_COMPONENTS_BY_FAMILY = {
  essential: ['Faceplate'],            // one zone: the whole plate, printed face-down
  chevron: ['Faceplate:FACE'],         // the chevron strips, merged into one FACE zone
  edgelabel: ['Faceplate:GRIP'],
  classic: ['Faceplate:GRIP'],
  classicpro: ['Faceplate:GRIP'],
};
/* The keys supported RIGHT NOW - the active family's, or the grip alone before a family is known (boot order). */
function seeIntoComponentKeys() {
  const fam = typeof currentFaceplateStyle === 'function' ? currentFaceplateStyle() : null;
  return SEE_INTO_COMPONENTS_BY_FAMILY[fam && fam.key] || [];
}
const TRANSLUCENT_BY_LABEL = new Map(FILAMENT_DB.flatMap(
  b => b.colors.filter(c => c.translucent).map(c => [c.label, c.translucent])));
function translucentFamilyFor(key) {
  const label = activeLabel(key);      // null in instruction-colour mode and in the part embed, so neither previews
  return label ? (TRANSLUCENT_BY_LABEL.get(label) || null) : null;
}
/* ---------------------------------------------------------------- the performance fallback (Joey + Astra 2026-09-17)
   Joey: "after a certain number of transparent models we just make them non transparent?" Astra agreed as a release
   safeguard AND corrected the trigger: "transparent-part count alone isn't enough. In this implementation, even one
   visible translucent part can trigger rendering the entire build behind it. A small transparent-part count on a huge
   build could still be costly. Use a conservative total-build complexity limit, informed by the tests."
   So the limit is on how much the interior pass has to REDRAW, not on how many parts are translucent.

   ⚠⚠ ONE DEFINITION, AND IT IS THE ONE BELOW (Astra 2026-09-17: "'Draw count' has one precise definition matching the
   measured workload; don't interchange it with mesh count or count all renderer passes"). The number is
   `partMeshCount()`: the VISIBLE MESHES OF VISIBLE PLACED PARTS. It is not `renderer.info.render.calls` (that also
   counts the stage and, on an effect frame, the effect's own passes) and it is not the placed-part count. For the
   builds measured here the renderer's own count for one ordinary frame runs exactly 3 higher - the table, the grid and
   the floor - so the two are one explainable step apart, and the rule uses only the first.
   ⚠ Why meshes and not placed parts (Joey's question, 2026-09-18: does a Chevron plate's many printed chevrons count
   once or many times?): a faceplate is ONE placed part whatever it prints as - the chevron strips ship merged into a
   single FACE zone - but a zoned plate draws once per zone, so Classic (4 zones) costs twice what Chevron (2) does at
   the same part count. Counting meshes charges that honestly.

   ⚠ MULTI-ZONE PARTS CONTRIBUTE THE SAME WAY HERE AS THEY DID IN THE MEASUREMENT, and that is checkable rather than
   asserted: every measured build was EdgeLabel, whose plate is two zones, and in all five the mesh count exceeds the
   placed-part count by EXACTLY the number of plates (70-66=4, 200-188=12, 396-372=24, 636-596=40, 1268-1188=80). So a
   zone is one mesh, one plate of N zones is N, and the rule counts what the timings were taken against. A Classic
   plate (4 zones) therefore contributes 4 and an Essential plate (1 zone) contributes 1.

   MEASURED on the Dell Precision 7760 (A5000) at 3,840 x 2,400 uncapped, translucent grips against opaque, EdgeLabel
   grid builds, in THIS unit (p65 cutoff.mjs + confirm.mjs, results integration/results/p65/):
       70 part meshes (4 units, 66 parts)    frame 3.90 ms against 1.35 opaque   (+2.55)
      200 part meshes (12 units, 188)        frame 4.83 ms against 1.65          (+3.18)
      396 part meshes (24 units, 372)        frame 8.10 ms against 2.50          (+5.60)
      636 part meshes (40 units, 596)        frame 11.8 ms against 3.50          (+8.30)   [ONE valid round: the
                                             other recorded no interior pass at all, so it was not the translucent
                                             arm and is EXCLUDED rather than averaged]
     1268 part meshes (80 units, 1188)       frame 26.3 ms against 7.40          (+18.9, 38 fps)
   The 120 Hz internal panel's budget is 8.33 ms a frame; the booth monitor's is 16.7. The limit below keeps the
   translucent frame near 5 ms at 4K - inside the 120 Hz budget with room for the rest of the app - which puts it
   between the 200-mesh build that measures 4.83 ms and the 396-mesh one that already spends the whole 120 Hz budget.
   ⚠⚠ IT IS PROVISIONAL AND IT IS THIS MACHINE'S (Astra: "a reasonable conservative starting point for the tested
   Dell - not a universal performance guarantee. Draw count is a useful proxy, but resolution, geometry and device
   capability still matter"). A weaker GPU, a denser part or a higher resolution can all miss the budget below this
   line, and a stronger one can beat it above. Raise or lower it with new measurements, never by feel. */
const SEE_INTO_DETAIL_LIMIT = 250;     // visible part meshes above which the see-through is simplified away
/* `?sidetail=full` keeps the full effect whatever the build costs (the user override Astra asked for), `simple` forces
   the fallback for diagnosis, anything else is the measured rule. */
function parseSeeIntoDetail(search) {
  const v = new URLSearchParams(search || '').get('sidetail');
  return v === 'full' || v === 'simple' ? v : 'auto';
}
let seeIntoDetailMode = parseSeeIntoDetail(location.search);
let seeIntoSimplified = false;         // true while a driven component is rendering WITHOUT the see-through
/* How many draws the interior pass would carry: every mesh of every visible placed part. Counted at a build change or
   a filament pick, NEVER per frame - Astra: "Decide when the build or filament selection changes, rather than
   switching repeatedly during orbit." */
function partMeshCount() {
  let n = 0;
  for (const inst of instances.values()) {
    if (!inst.group || !inst.group.visible) continue;
    inst.group.traverse(o => { if (o.isMesh && o.visible) n++; });
  }
  return n;
}
/* The decision, and the only place it is made. Returns true when the detailed see-through may run. */
function seeIntoDetailAllowed() {
  if (seeIntoDetailMode === 'full') return true;
  if (seeIntoDetailMode === 'simple') return false;
  return partMeshCount() <= SEE_INTO_DETAIL_LIMIT;
}
let seeIntoDriven = new Set();         // the supported keys wearing a translucent filament RIGHT NOW
const seeIntoDrivenKey = key => !!seeInto && seeIntoComponentKeys().includes(key) && !!translucentFamilyFor(key)
  && !seeIntoSimplified;               // simplified: the filament's colour stays, the extra passes do not run
/* Translucency is STRUCTURAL - it patches the shader and changes the program cache key - so it cannot be moved by
   applyPalette's in-place repaint the way colour and roughness are. When a pick crosses the line in either
   direction the affected faceplate materials are rebuilt and re-assigned, which is `dropFaceplateMaterials`'s own
   job. ⚠ Re-assigning stomps a faceplate isolation fade if one is up; it heals on deselect. */
function syncSeeIntoComponents() {
  if (!seeInto) return false;
  const picked = new Set(seeIntoComponentKeys().filter(k => translucentFamilyFor(k)));
  /* the fallback decision rides HERE, with the pick and the build, so it cannot flip mid-orbit. It is only asked when
     something is actually picked - an opaque build pays nothing for the count. */
  const simplify = picked.size > 0 && !seeIntoDetailAllowed();
  const want = simplify ? new Set() : picked;
  if (simplify === seeIntoSimplified && want.size === seeIntoDriven.size && [...want].every(k => seeIntoDriven.has(k))) return false;
  const noteChanged = simplify !== seeIntoSimplified;
  seeIntoSimplified = simplify;
  seeIntoDriven = want;
  /* ⚠ A BUILD CHANGE DECIDES THIS TOO, and mountManifest renders the panel BEFORE it calls applyPalette - so growing a
     build past the limit in the planner would leave the old note on screen until something else re-rendered it.
     renderOptions is declared below (hoisted) and returns early with no box and on a static kit. */
  if (noteChanged) renderOptions();
  dropFaceplateMaterials();
  ensureMaterials();
  for (const inst of instances.values()) {
    if (!inst.group || typeByNode[inst.cfg.node] !== 'Faceplate') continue;
    inst.group.traverse(o => { if (o.isMesh) o.material = materialFor(inst, inst.cfg.id === selectedId, o.userData.zone); });
  }
  seeInto.invalidate();                // the interior was rendered for a scene that shaded differently
  invalidateFrame();
  return true;
}
function seeIntoPatched(key, m) {
  if (!seeInto) return m;
  if (key === 'BackCover') { if (SEE_INTO_COVERS) seeInto.patch(m, buildAxisForKey(key)); }   // the reference piece: preset look, switch only
  else if (seeIntoDrivenKey(key)) seeInto.patch(m, buildAxisForKey(key), { own: true }); // filament-driven: its own colour
  return m;
}
function baseMatFor(type, zone = '') { // shared material per (type, zone) — zones build lazily off the active palette
  const key = zoneKey(type, zone);
  if (!materials[key]) materials[key] = seeIntoPatched(key, newPartMaterial(key));
  return materials[key];
}

// ---- build plate (2026-08-10; every eligible part since 2026-09-14) ----------
// Every printed part's BED-CONTACT FACE takes the finish of the sheet it was
// printed on - viewer/js/bed-finish.js holds the shader and the rules. The
// choice is ONE build-wide field, `build.buildPlate`, and a build that never
// stored one reads as the default, Powder-coated (DEFAULT_PLATE there says why).
// ⚠ It is a FINISH, not a paint: the material's colour still comes from
// activeHex(), so the user's filament pick drives it and the transfer rides on
// top. Never hardcode a colour here.
// ⚠ PER-PART FINISHES ARE A LATER STEP (Joey 2026-09-14: "it could be an option
// to any part"). The intended model is "a part inherits the build's finish
// unless it has its own"; nothing stores an override yet, and `plateProfile` is
// where one would be consulted.
const PLATE_PROFILES = PLATE_FINISHES.map(key =>
  ({ key, label: PLATE_LABELS[key], holo: key === 'holographic' ? HOLO_OPACITY : 0 }));
// The face-down faceplate families keep the holographic transfer they have had
// since 2026-08-10, UNCHANGED (Astra 2026-09-14, "preserve existing holographic
// behaviour"): their whole material takes the plate's polished spec and
// attachHolo draws the diffraction. Every other eligible part - and these two
// families under Powder or Smooth - goes through the bed-finish contact rule.
const PLATE_FAMILIES = new Set(['essential', 'chevron']); // printed face-down
const plateProfile = () => PLATE_PROFILES.find(p => p.key === plateFinishOf(build));
/* One set of finish uniforms for every part material that carries the finish, so Powder <-> Smooth
   is a uniform write and every clone of every material follows it. */
const bedFinishU = createBedFinishUniforms();
const plateSupported = () => !!build && PLATE_FAMILIES.has(currentFaceplateStyle()?.key);
const plateActive = () => plateSupported() && plateProfile().holo > 0;
// which key carries the CONTACT face: Chevron's raised strips are its FACE zone
// (the recessed backer never touched the plate — its grooves stay dark, as on
// the real print); Essential is a single-zone plate, so its base key is the face.
const plateContactKey = key =>
  currentFaceplateStyle()?.key === 'chevron' ? key === 'Faceplate:FACE' : key === 'Faceplate';
let holoTex = null;
function holoTexture() {
  if (!holoTex) {
    // plate-space control map derived from a photo of the real plate:
    // R macro flame envelope · G phase · B diffraction amplitude · A fine detail
    holoTex = new THREE.TextureLoader().load('img/plates/holo-pattern.png');
    holoTex.colorSpace = THREE.NoColorSpace;
    holoTex.wrapS = holoTex.wrapT = THREE.MirroredRepeatWrapping;
  }
  return holoTex;
}
// the same plate map for the bed-finish holographic program, as ONE shared uniform
// object - built on first use, so a build that never picks Holographic never loads it
let bedHoloTexU = null;
const bedHoloTexture = () => bedHoloTexU || (bedHoloTexU = { value: holoTexture() });
// planar UVs from each geometry's own bbox — the plate GLBs ship position+normal
// only, and the transfer has to stay pinned to the plate as the drawer slides
function ensurePlateUVs() {
  for (const t of Object.values(templates)) {
    t.traverse(o => {
      if (!o.isMesh || o.geometry.attributes.uv) return;
      const g = o.geometry;
      g.computeBoundingBox();
      const bb = g.boundingBox, sx = bb.max.x - bb.min.x || 1, sy = bb.max.y - bb.min.y || 1;
      const pos = g.attributes.position, uv = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        uv[i * 2] = (pos.getX(i) - bb.min.x) / sx;
        uv[i * 2 + 1] = (pos.getY(i) - bb.min.y) / sy;
      }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    });
  }
}
// The shader. Diffraction is ADDITIVE over an ordinary silk PBR base, and every
// term is continuous across the plate — one plate is one contiguous first layer,
// so pattern, phase and hue must not break at the chevron's fold.
// ⚠ Gated by a CONTACT MASK on the object-space normal: chamfers, sidewalls and
// groove walls never touched the plate and stay plain filament.
function attachHolo(m, diffracts) {
  m.onBeforeCompile = sh => {
    sh.uniforms.holoTex = { value: holoTexture() };
    sh.uniforms.uHoloOp = { value: plateProfile().holo };
    holoUniforms.push(sh.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vHUv;\nvarying vec3 vON;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n\tvON = objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvHUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vHUv;\nvarying vec3 vON;\nuniform sampler2D holoTex;\nuniform float uHoloOp;')
      // print walls are layer-lined, not plate-polished: rougher, less clearcoat
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
\troughnessFactor = mix( 0.55, roughnessFactor, smoothstep( 0.82, 0.94, normalize( vON ).z ) );`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
\tmaterial.clearcoat *= mix( 0.15, 1.0, smoothstep( 0.82, 0.94, normalize( vON ).z ) );
#endif`);
    if (!diffracts) return;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
\tfloat contact = smoothstep( 0.82, 0.94, normalize( vON ).z );
\tfloat hA = 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) );
\tvec4 pat = texture2D( holoTex, vHUv );
\tfloat macro = pat.r, phaseT = pat.g, amp = pat.b, fine = pat.a;
\tfloat ramp = ( abs( vHUv.x - 0.5 ) + vHUv.y * 0.7071 ) * 0.9;
\tfloat gate = pow( smoothstep( 0.09, 0.32, hA ), 1.8 ) * contact;
\tfloat cycC = fract( 0.45 * phaseT + 0.5 * macro + ramp + hA * 2.4 );
\tfloat off = cycC - 0.5;
\tfloat wC = mix( 0.06, 0.55, smoothstep( 0.06, 0.55, hA ) ) * ( 0.9 + 0.4 * macro );
\tfloat band = smoothstep( wC, wC * 0.7, abs( off ) );
\tfloat chroma = band * smoothstep( 0.06, 0.30, amp ) * gate;
\tfloat hue = 6.2832 * ( 0.45 * phaseT + hA * 2.2 ) + off * 6.0 + 3.4;
\tvec3 rainbow = pow( 0.5 + 0.5 * cos( hue + vec3( 0.0, -2.094, -4.188 ) ), vec3( 0.72 ) );
\trainbow /= max( max( rainbow.r, max( rainbow.g, rainbow.b ) ), 1e-3 );
\ttotalEmissiveRadiance += rainbow * chroma * 1.9 * ( 0.8 + fine * 0.35 ) * uHoloOp;
}`);
  };
  m.customProgramCacheKey = () => 'holo' + (diffracts ? 1 : 0);
  return m;
}
const holoUniforms = [];   // live intensity across every holo material
/* ⚠ THE FINISH NUMBERS MOVED TO `part-material.js` ON 2026-09-05, unchanged.
   They are vendored into the Filament Material Lab, whose staging page has to
   render what THIS viewer renders in order to argue that something else would
   be better - and a hand-copied 0.55 / 0.05 there would be a second author of
   this surface. Edit them THERE only; both suites gate on byte equality.

   What stays here is everything the spec deliberately does not carry: the
   colour (palette state, and the whole point of the picker), the THREE
   construction, and the holographic shader patch. */
/* ── PRINTED LAYER RELIEF ────────────────────────────────────────────────────────────────────
   Every part in this viewer is a 3D print, and until now none of them looked like one: the
   surface is smooth where a real part carries 0.2 mm bead corrugation, a crown of light along
   each bead crest, and a crest line on convex edges. `vendor/layer-detail.js` is the Filament
   Material Lab's renderer for exactly that, vendored (see test/layer-detail-vendor.test.mjs).

   Two print facts have to travel with it, because THIS REPO KNOWS NEITHER. There is no layer
   height and no facet tilt anywhere in the viewer - a kit is geometry and a colour, and how it
   was printed has never been part of that. Both are gated from the Lab's side, which is where
   they were measured; see the ⚠ on each. */

/* ⚠ AN ASSUMPTION, AND THE ONLY ONE THE SURFACE RESTS ON. The Lab calls it ASSUMED_LAYER_PITCH_MM
   and derives it from its one preview recipe; nothing in a GEN2 manifest records a layer height,
   so every part here is drawn as if printed at 0.2 mm. A part printed at 0.28 gets bands 40 % too
   close together. That is a real error and it is bounded: it moves the SPACING, never the shape,
   because the relief's amplitude is a slope. */
const LAYER_PITCH_MM = 0.2;

/* ⚠ MEASURED FROM A PRINT, 2026-09-05, not chosen. It is the peak facet tilt of the corrugation
   and it is the ENTIRE amplitude of the relief - the model is a sinusoid whose only magnitude
   term is tan(this). The Lab holds it as ASSUMED_LAYER_TILT_DEG across four sites plus the
   shader's own tan() literal, with a gate that moves them together; this copy is the fifth site
   and their test/unit/layerTiltAgreement.test.ts now reads it from here. */
const LAYER_TILT_DEG = 22;

/* Live handles, one per material that carries the relief, KEYED BY MATERIAL KEY.
   ⚠ A MAP AND NOT AN ARRAY, because the registries they shadow are purged SELECTIVELY: a plate or
   family swap deletes the `Faceplate*` materials and leaves every other one alive, so a flat array
   could only be cleared wholesale — which would strand the surviving materials' handles and stop
   the pixel-ratio ever reaching them again. Keyed, the handles are dropped exactly where their
   materials are. */
const layerHandles = new Map();
function setLayerDetailPixelRatio(dpr) {
  for (const h of layerHandles.values()) h.setPixelRatio(dpr);
}

/**
 * The build axis for a material key, in the part's OWN coordinates, or null when we do not know.
 *
 * ⚠ NULL IS AN ANSWER, NOT A GAP, AND IT IS WHY THIS IS SAFE. Layer bands drawn along a guessed
 * axis are a picture of a print that does not exist — they run the wrong way across every face and
 * look exactly as convincing as correct ones. `buildAxisForType` answers null for a type with no
 * confirmed plate pose AND for a chiral pair whose two nodes grow along opposite axes, and
 * `withLayerDetail` then leaves the material plain.
 *
 * ⚠ THE FACEPLATE FAMILY IS PART OF THE QUESTION, which is why the style is passed. Classic,
 * ClassicPro and EdgeLabel print back-down and grow along +Z; Essential and Chevron print
 * FACE-down and grow along −Z. Same material key, opposite axes, decided by a build option the
 * user can change mid-session — see the invalidation in `dropFaceplateMaterials`.
 */
const faceStyleNow = () =>
  (build && build.faceStyle) || (currentFaceplateStyle() && currentFaceplateStyle().key) || null;
/* ⚠ THE HANDLE FAMILY IS PART OF THE QUESTION TOO (Joey 2026-09-14: the Deco handle prints top-down;
   BlockBar and Crystal have no confirmed pose). Read from the NODE NAME - Handle_Deco, Handle_BlockBar_C
   - not from HANDLE_STYLES, which is declared thousands of lines below and would be in its TDZ if a
   material were ever built during module evaluation. */
const handleFamilyOfNode = (node) => {
  const m = /^Handle_([A-Za-z]+)/.exec(node || '');
  return m ? m[1].toLowerCase() : null;
};
/* The family the build's handles ARE: the manifest's Handle row, which a handle swap renames in place
   (applyHandleStyle) and every regenerate re-emits - so a swap, a relayed style, a planner layout and
   Reset all answer from the one place that describes what is on screen. */
const handleFamilyNow = () => handleFamilyOfNode(manifest?.parts?.find((p) => p.type === 'Handle')?.node);

function buildAxisForKey(key) {
  return buildAxisForType(key.split(':')[0], faceStyleNow(), handleFamilyNow());
}

/* One author for "the faceplate materials are no longer valid", because there are two reasons and
   they used to know about only one. The build PLATE decides the impression on a face-down plate;
   the FAMILY decides which way the plate prints at all, and therefore which way its layers run. */
function dropFaceplateMaterials() {
  for (const k of Object.keys(materials)) if (k.split(':')[0] === 'Faceplate') delete materials[k];
  for (const k of Object.keys(highlightMats)) if (k.split(':')[0] === 'Faceplate') delete highlightMats[k];
  for (const k of [...layerHandles.keys()]) if (k.split(':')[0] === 'Faceplate') layerHandles.delete(k);
}

/**
 * Attach the printed relief, if we know which way the part grew.
 *
 * ⚠ IT MUST RUN AFTER `attachHolo`, NEVER BEFORE, AND NOTHING ABOUT THE RESULT SAYS WHICH.
 * `attachHolo` ASSIGNS `m.onBeforeCompile` and `m.customProgramCacheKey` outright; the Lab's
 * module CHAINS onto whatever is already there. Chain-then-assign silently discards the chain, so
 * a holographic faceplate would render with the rainbow and no layer lines - no error, no warning,
 * and correct-looking everywhere else. Verified by compiling both orders: assign-then-chain gives
 * a cache key of `holo1|ld` and both shader blocks present; the other order gives `holo1` and the
 * layer block simply absent. test/layer-detail-seam.test.mjs is the gate.
 */
/**
 * ⚠ THE KILL SWITCH. Set false and redeploy to take printed-layer relief off every part in the
 * viewer, without reverting anything and without touching the vendored module.
 *
 * It exists because layer detail is the first thing this repo has shipped that changes how EVERY
 * printed surface is drawn, on hardware nobody here has benchmarked — it costs +2.171 ms a frame on
 * an A5000 at DPR 2, and fill rate is what decides mobile. If it is wrong on a real device the
 * answer has to be one line and one deploy, not a revert of a landed port. The flag is read at
 * material construction, so flipping it takes effect on the next build of the scene.
 *
 * ⚠ IT IS A LEVER, NOT A SETTING. There is no UI for it and there should not be: a user-facing
 * toggle would need a persisted preference, a place in the quality tiers and a story about what the
 * comparison in the Lab is then comparing. This is the thing you reach for at 2am.
 */
const LAYER_DETAIL_ENABLED = true;

/**
 * Whether a material built RIGHT NOW should carry the printed relief.
 *
 * ⚠ THE CONSTANT SITS ABOVE THE LADDER, NOT INSIDE IT. `LAYER_DETAIL_ENABLED` false takes the
 * relief off every tier at once and is the thing you reach for at 2am; `QUALITY[tier].relief` is
 * the lever the auto-downgrade can pull on its own, on a device that is struggling. They answer
 * different questions and neither can stand in for the other.
 */
const reliefWanted = () => LAYER_DETAIL_ENABLED && !!QUALITY[quality].relief;

/**
 * Rebuild the part materials when the relief crosses the tier boundary.
 *
 * ⚠ THE CACHE IS DROPPED, NOT PATCHED, and it has to be: the relief is a shader injection, so a
 * material that carries it carries it for the life of its program. `materialFor` rebuilds lazily
 * from `newPartMaterial`, which is where `reliefWanted` is read — the same shape as
 * `dropFaceplateMaterials`, which drops a subset for the same reason.
 *
 * ⚠ AND THE LIVE MESHES ARE RE-POINTED, or they keep the material objects that were just orphaned
 * and the tier change does nothing visible until something else happens to rebuild the scene. That
 * loop is `applyState`'s, verbatim, including dropping a highlight — the established idiom for
 * "restore shared materials".
 *
 * ⚠ IT DOES NOT DISPOSE THE OLD MATERIALS, matching `dropFaceplateMaterials`. A tier change is
 * rare and one-way, so the leak is bounded at a few dozen programs per session; disposing while a
 * planned clone still holds a `src` reference is the more expensive mistake.
 */
let reliefApplied = null;
function syncRelief() {
  const want = reliefWanted();
  if (want === reliefApplied) { reliefApplied = want; return; }
  reliefApplied = want;
  /* Boot: nothing is built yet, and everything built after this reads the flag anyway. */
  if (!instances || !instances.size) return;
  purgePartMaterials();
  for (const inst of instances.values()) {
    inst.group.traverse((o) => {
      if (o.isMesh) o.material = materialFor(inst, false, o.userData.zone);
    });
  }
  applyPalette();
}

/* Every part-material registry emptied, with the live handles that point into it - the one idiom for
   "the shader patch these materials carry is no longer the one wanted". Two callers: the relief's
   tier gate above, and the build plate's program switch below. It does NOT re-point meshes: syncRelief
   does that itself, and the plate switch runs inside mountManifest, whose applyState reassigns every
   mesh from the rebuilt registries. */
function purgePartMaterials() {
  for (const map of [materials, highlightMats, altMaterials, altHighlightMats,
    plannedMats, plannedHighlightMats]) {
    for (const k of Object.keys(map)) delete map[k];
  }
  layerHandles.clear();
  holoUniforms.length = 0;
}

/**
 * Drop the part materials whose build axis is no longer the one they were built with, and say which
 * TYPES they were.
 *
 * ⚠ A MATERIAL KEY IS A TYPE, AND TWO TYPES' AXES DEPEND ON A BUILD OPTION: the faceplate FAMILY
 * (back-down +Z, face-down -Z) and the handle FAMILY (Deco prints top-down; BlockBar and Crystal have no
 * pose). ensureMaterials is idempotent, so a cached material keeps the axis it was built with - layer
 * lines and a plate finish running the wrong way, or a guessed axis on a family that has none. Each
 * material records its axis when it is built (recordAxis) and this compares. mountManifest runs it on
 * every mount, which is every path that re-emits the build; the in-place handle swap mounts nothing
 * and runs it itself.
 *
 * Every registry, by TYPE - the base key, its zones, and the alternate, planned and highlight clones
 * (keyed `Type`, `Type:ZONE`, `Type|alt`) - so no clone outlives its base.
 *
 * `onlyTypes` narrows the check. The in-place handle swap passes ['Handle']: it changes the handle
 * family and nothing else, so it has no business rebuilding another type - and on a static kit the
 * faceplate family is read from the live instances, an input the swap does not control.
 */
function dropStaleAxisMaterials(onlyTypes = null) {
  const typeOf = (k) => k.split(/[:|]/)[0];
  const stale = new Set();
  for (const [key, m] of Object.entries(materials)) {
    if (m?.userData?.buildAxis === undefined || (onlyTypes && !onlyTypes.includes(typeOf(key)))) continue;
    if (m.userData.buildAxis !== JSON.stringify(buildAxisForKey(key))) stale.add(typeOf(key));
  }
  if (!stale.size) return [];
  for (const map of [materials, highlightMats, altMaterials, altHighlightMats, plannedMats, plannedHighlightMats]) {
    for (const k of Object.keys(map)) if (stale.has(typeOf(k))) delete map[k];
  }
  for (const k of [...layerHandles.keys()]) if (stale.has(typeOf(k))) layerHandles.delete(k);
  return [...stale];
}
/* The axis a part material was built with, as text (null and an array compare as strings), for
   dropStaleAxisMaterials. */
function recordAxis(m, key) {
  m.userData = Object.assign({}, m.userData, { buildAxis: JSON.stringify(buildAxisForKey(key)) });
  return m;
}

/**
 * Point the shared finish uniforms at this build's plate, and purge the materials when the PROGRAM
 * changes.
 *
 * Powder and Smooth are one program with a different uniform, so switching between them rebuilds
 * nothing and compiles nothing. Holographic is a different program on every eligible part (and a
 * different spec on the face-down faceplates), so crossing that boundary purges every registry.
 *
 * ⚠ IT RUNS AT THE TOP OF mountManifest, because every path that can change `build.buildPlate`
 * reaches it: the Build options row, the planner's option relay, a planner layout (which replaces
 * `build` wholesale), Reset to original, and boot.
 */
let bedFinishProgram = null;
function syncBedFinish() {
  const finish = setBedFinish(bedFinishU, plateFinishOf(build));
  const program = finish === 'holographic' ? 'holographic' : 'profile';
  if (bedFinishProgram !== null && program !== bedFinishProgram) purgePartMaterials();
  bedFinishProgram = program;
}
/* Debug-hook handles for the finish (?debug=1 only): the shared uniforms - the readback views
   (uBFDbg), the no-profile diagnostic (uBFPlain 0) and the representation hook - and a check that
   every finished mesh was stamped along the axis its material tests against. */
const bedFinishDebug = {
  uniforms: bedFinishU, setBedFinish, plateFinishOf,
  get program() { return bedFinishProgram; },
  check() {
    const out = { meshes: 0, finished: 0, byType: {}, noAttribute: [], axisMismatch: [] };
    for (const inst of instances.values()) inst.group.traverse(o => {
      if (!o.isMesh) return;
      out.meshes++;
      if (!o.material?.userData?.bedFinish) return;
      out.finished++;
      const type = typeByNode[inst.cfg.node];
      out.byType[type] = (out.byType[type] || 0) + 1;
      const stamped = o.geometry.userData.bedAxis, want = buildAxisForKey(zoneKey(type, o.userData.zone || ''));
      if (!o.geometry.attributes.aBfMm) out.noAttribute.push(inst.cfg.node);
      else if (!stamped || !want || stamped.some((v, i) => v !== want[i])) out.axisMismatch.push(inst.cfg.node);
    });
    return out;
  },
};

function withLayerDetail(m, key) {
  if (!reliefWanted()) return m;
  const up = buildAxisForKey(key);
  if (!up) return m;
  layerHandles.set(key, applyLayerDetail(m, {
    layerPitchMm: LAYER_PITCH_MM,
    tiltDeg: LAYER_TILT_DEG,
    pixelRatio: renderer.getPixelRatio(),
    printUp: new THREE.Vector3(up[0], up[1], up[2]),
  }));
  return m;
}

function newPartMaterial(key) {
  const plateContact = plateContactKey(key);
  const spec = partMaterialSpec(key, {
    holographicPlate: plateActive(), plateContact, label: activeLabel(key),
  });
  const color = new THREE.Color(activeHex(key));

  if (spec.kind === 'physical') {
    const m = new THREE.MeshPhysicalMaterial({
      color,
      metalness: spec.metalness, roughness: spec.roughness,
      clearcoat: spec.clearcoat, clearcoatRoughness: spec.clearcoatRoughness,
      envMapIntensity: spec.envMapIntensity,
    });
    /* ⚠ SEPARATE STATEMENTS, NOT ONE NESTED CALL, AND THE ORDER IS THE WHOLE POINT. attachHolo
       ASSIGNS onBeforeCompile; withLayerDetail CHAINS onto it; withBedFinish CHAINS onto that.
       Written as `withLayerDetail(attachHolo(m), key)` the text reads in the opposite order to the
       way it evaluates — which is a bad way to write a constraint whose failure is invisible, and
       it defeats a source-order gate as well. Each mutates and returns the same material, so
       dropping a return changes nothing but the reading order. */
    if (spec.holographic) attachHolo(m, plateContact);
    withLayerDetail(m, key);
    recordAxis(m, key);   // withBedFinish merges userData, so the record survives it
    return withBedFinish(m, key, spec);
  }
  const m = new THREE.MeshStandardMaterial(
    { color, roughness: spec.roughness, metalness: spec.metalness });
  withLayerDetail(m, key);
  recordAxis(m, key);
  return withBedFinish(m, key, spec);
}

/* The contact surface the holographic plate leaves - the faceplate spec's own contact values, read
   once rather than retyped, so a part that is not a faceplate polishes exactly as a faceplate does. */
const HOLO_CONTACT = partMaterialSpec('Faceplate', { holographicPlate: true, plateContact: true });

/**
 * Attach the build plate's finish to a part's bed-contact face, when we know how the part printed.
 *
 * ⚠ AFTER withLayerDetail, NEVER BEFORE. Both chain, so neither discards the other; the order is
 * what the finish's plain restore is written against - it takes the relief's bottom-skin fold and
 * micro-relief OFF a plate-moulded face, and the relief is the patch it is undoing.
 * test/layer-detail-seam.test.mjs gates the order.
 *
 * ⚠ THE FACE-DOWN FACEPLATE TRANSFER IS LEFT ALONE. When the spec says holographic, attachHolo has
 * already given the material the finish it has had since 2026-08-10, and a second contact rule on
 * top would change how it looks.
 *
 * ⚠ NULL AXIS, NO FINISH - the relief's rule. A texture on a guessed bed face is a picture of a
 * print that does not exist.
 */
function withBedFinish(m, key, spec) {
  if (spec.holographic) return m;
  const axis = buildAxisForKey(key);
  if (!axis) return m;
  let holo = null;
  if (plateProfile().key === 'holographic') {
    holo = { texture: bedHoloTexture(), roughness: HOLO_CONTACT.roughness };
    /* the clearcoat lobe has to be COMPILED for contact to wear it; the patch multiplies it by the
       contact weight, so every face that never touched the plate keeps none, as before */
    if (m.isMeshPhysicalMaterial) {
      m.clearcoat = HOLO_CONTACT.clearcoat;
      m.clearcoatRoughness = HOLO_CONTACT.clearcoatRoughness;
    }
  }
  return applyBedFinish(m, { axis, uniforms: bedFinishU, holo });
}
/* A material's RESTING opacity. Every fade in this engine used to drive
   opacity from/to a hardcoded 1, which is only true while every part is
   opaque; a part that rests translucent popped fully opaque the moment one
   ran. Each clone stamps its rest value on creation, so the tweens scale by it
   - and for an opaque part rest === 1, leaving every existing animation
   arithmetically identical. No shipped part rests translucent today (the
   adhesive-feet marker that forced this became real geometry on 2026-08-22),
   so it is a currently-inert invariant - KEEP it: it is what makes the next
   translucent part safe, and it costs one property read. */
const restOf = m => (m.userData && m.userData.rest != null) ? m.userData.rest : 1;

/**
 * Clone a part material and KEEP THE TWO THINGS three throws away.
 *
 * ⚠ `Material.copy()` CARRIES NEITHER `onBeforeCompile` NOR `customProgramCacheKey`. Read r185's
 * `Material.copy` — it copies fifty-odd named fields and neither of those is among them, because
 * both are prototype no-ops that a patch overrides per instance. So a cloned material silently
 * renders WITHOUT whatever shader patch its source carried, and with a cache key that no longer
 * distinguishes it.
 *
 * ⚠ AND THE SYMPTOM IS NEVER AN ERROR. Before this helper, three of the eight clone sites in this
 * file hand-copied the pair and five did not:
 *
 *   altMatFor          PERMANENT, and on six tiled types (CoverL/U, FootrailL/U, Bracket, Rail).
 *                      Every second tile rendered with no build-plate transfer and no layer
 *                      relief, beside siblings that had both. A still frame shows it; nothing
 *                      raises.
 *   vanish/ghost/fade  for the duration of a tween, so a part goes smooth mid-animation and snaps
 *   fpFocus            back when the tween restores the real material.
 *
 * The 2026-08-10 comment that used to sit on the highlight clone said exactly this about the build
 * plate, on one of the three sites that already did it right. It is here now because the rule is
 * not about highlights.
 *
 * ⚠ OWN PROPERTIES ONLY. `Material.prototype.onBeforeCompile` is a no-op METHOD, so `src.onBeforeCompile`
 * is truthy on every material ever made and the old `if (src.onBeforeCompile)` guard was vacuous.
 * Copying the prototype's no-op onto a clone is harmless but says something false — that this
 * material is patched. A clone of an unpatched material must stay unpatched.
 *
 * ⚠ THE UNIFORMS ARE SHARED WITH THE SOURCE, DELIBERATELY. The patch closes over its uniform
 * objects and hands the same ones to every shader it compiles, so a clone tracks the source's
 * layer pitch, build axis and pixel ratio. That is what we want: a ghost of a part is the same
 * print as the part.
 */
function cloneMaterial(mat) {
  const m = mat.clone();
  for (const k of ['onBeforeCompile', 'customProgramCacheKey']) {
    if (Object.prototype.hasOwnProperty.call(mat, k)) m[k] = mat[k];
  }
  return m;
}
// Toggling drops the faceplate registry entries (their spec depends on the
// plate) and regenerates; mountManifest's syncBedFinish then points the shared
// finish uniforms at the new plate and purges every other registry only when
// the shader PROGRAM changes (to or from Holographic). The reassignment onto
// meshes rides regenerate()'s normal applyState path like every other build
// option, and so does the relay to the planner.
async function setBuildPlate(key) {
  if (!build || !PLATE_FINISHES.includes(key)) return;
  track('opt:buildplate:' + key);
  build.buildPlate = key;
  holoUniforms.length = 0;
  /* ⚠ THE LAYER HANDLES GO WITH THEM. The faceplate materials below are DELETED and rebuilt
     through newPartMaterial, which pushes fresh handles; keeping the old ones would leave the
     array growing on every plate swap and pointing at materials nothing draws. It sits beside
     holoUniforms because it is the same class of live-handle registry, purged in the same place. */
  dropFaceplateMaterials();
  if (plateActive()) ensurePlateUVs();
  await regenerate();
}
// Which single colour REPRESENTS a part where only one swatch fits (BOM chip,
// identify-card header)? Not the base type when a zone covers the whole visible
// front: the Classic plate's FACE is the surface you actually look at, while
// BODY sits behind it and barely shows (Joey 2026-07-25). Data-driven off the
// GLB's own zone tags, so any future part with a FACE zone inherits this.
const FRONT_ZONE = 'FACE';
function primaryKey(node) {
  const type = typeByNode[node];
  const t = templates[node];
  if (!t || !type) return type;
  let front = false;
  t.traverse(o => { if (o.isMesh && o.userData.zone === FRONT_ZONE) front = true; });
  return front ? zoneKey(type, FRONT_ZONE) : type;
}

// tiled multi-width types: adjacent same-type tiles alternate a slightly lighter
// shade of the type color, so a 2W landing next to a 1W reads as two parts, not
// one fused piece. Same hue = same identity in the BOM; the lightened variants
// re-derive from the active palette (instruction OR custom filament colors).
const TILED_TYPES = new Set(['FootrailL', 'FootrailU', 'CoverL', 'CoverU', 'Bracket', 'Rail']);
const ALT_LIGHTEN = 0.16;
// The lighter alternate-tile shade is an INSTRUCTION-palette readability aid —
// once the user picks a real filament for the type (hand pick or preset), the
// tiles render UNIFORM in that color (Joey 2026-07-13: his all-black covers
// showed one black + one grey tile). Gate = the same test activeHex uses to
// resolve a custom color, so a type still on instruction colors keeps its
// two-shade tiling even while other types are customized.
const altLerp = type => (useCustom && customColors[type] && !colorLocked(type)) ? 0 : ALT_LIGHTEN;
const altMaterials = {};
function altMatFor(type) {
  if (!altMaterials[type]) {
    const m = cloneMaterial(materials[type] || fallbackMat);
    m.color.set(activeHex(type)).lerp(new THREE.Color('#ffffff'), altLerp(type));
    altMaterials[type] = m;
  }
  return altMaterials[type];
}

let typeByNode = {}, partInfoByNode = {};

// GLB templates are cached across re-mounts — only newly-needed nodes load (e.g.
// turning magnet closure ON pulls in the clip/magnet GLBs the first time).
const templates = {};
async function loadTemplates() {
  const need = [...new Set(manifest.instances.map(i => i.node))].filter(n => !templates[n]);
  // A missing GLB used to reject the bare Promise.all and HANG the app on the
  // loading spinner forever (2026-07-25: classic 3H drawers on 115/240/270 —
  // the generator guards that gap now, but ANY future asset gap must fail as a
  // readable message, not a hang). Collect every failure and throw ONE error
  // naming the nodes; boot routes it to bootFail, regenerate to showBlocked.
  const missing = [];
  await Promise.all(need.map(async node => {
    try {
      const gltf = await loader.loadAsync(`${PARTS_BASE}${node}.lib.glb`);
      templates[node] = adoptTemplate(gltf.scene, typeByNode[node], node);
    } catch (e) { missing.push(node); }
  }));
  if (missing.length) {
    track('error:parts-missing'); // covers a real asset gap AND a failed fetch — both leave a broken studio
    throw new Error(`part model${missing.length > 1 ? 's' : ''} missing from the library: ${missing.sort().join(', ')}`);
  }
}
// 2-zone parts (EdgeLabel body+grip) arrive as two primitives carrying named
// material stubs — the NAME is the zone tag, read once here and stamped on the
// mesh (clones inherit it). 'BODY' means "the part's main color" = the plain
// type key (so BOM chip / header swatch / presets all drive it). Material-free
// parts get an unnamed default → no zone.
function adoptTemplate(sceneRoot, type, node) {
  sceneRoot.traverse(o => {
    if (!o.isMesh) return;
    const zone = (o.material?.name && o.material.name !== 'BODY') ? o.material.name : '';
    if (zone) o.userData.zone = zone;
    o.material = baseMatFor(type, zone);
  });
  /* ⚠ A PART WHOSE BED FACES CANNOT BE STAMPED STAYS PLAIN, IT DOES NOT FAIL THE LOAD. This runs
     inside loadTemplates' per-node try, whose catch reports a MISSING GLB - a throw here would tell
     the user a file is absent that is not. Without the attribute the finish's contact weight reads
     0, so the part simply wears no finish. */
  try { stampBedFaces(sceneRoot, type, node); }
  catch (e) { console.warn(`[bed finish] ${node}: ${(e && e.message) || e} - left plain`); }
  return sceneRoot;
}
/* The bed-finish attributes for one part template - aBfMm (authored position in mm, shifted so the
   bed plane passes through 0 along the build axis) and aBfUv (the bed-plane coordinates the
   holographic pattern is pinned to); bed-finish.js says how they are read. Per TEMPLATE, so every
   instance of the node shares them. Skipped for a type with no confirmed print pose, whose material
   carries no finish.
   ⚠ THE AXIS IS THE NODE'S OWN. A faceplate node names its family and cannot change how it printed,
   so it is read from the name rather than from the build's current style - which it agrees with
   whenever the node is on screen, because the generator emits the family build.faceStyle names and
   a static-kit swap loads the new family's nodes before it shows them. */
const faceFamilyOfNode = node => (node && FACEPLATE_STYLES.find(s => node.startsWith(s.node('')))?.key) || null;
function stampBedFaces(root, type, node) {
  const axis = type
    ? buildAxisForType(type, faceFamilyOfNode(node) || faceStyleNow(), handleFamilyOfNode(node) || handleFamilyNow())
    : null;
  if (!axis) return;
  root.updateMatrixWorld(true);   // the template is not in the scene: its world IS the part frame
  const meshes = [];
  root.traverse(o => { if (o.isMesh) meshes.push(o); });
  const v = new THREE.Vector3();
  const positions = meshes.map(o => {
    const pos = o.geometry.attributes.position, out = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);   // de-quantised, node transform applied: mm
      out[3 * i] = v.x; out[3 * i + 1] = v.y; out[3 * i + 2] = v.z;
    }
    return out;
  });
  const { mm, uv } = bedFaceAttributes(positions, axis);
  meshes.forEach((o, i) => {
    o.geometry.setAttribute('aBfMm', new THREE.BufferAttribute(mm[i], 3));
    o.geometry.setAttribute('aBfUv', new THREE.BufferAttribute(uv[i], 2));
    o.geometry.userData.bedAxis = axis;
  });
}

// ---------- instances ----------
const instances = new Map(); // id -> { cfg, group, staged, alt }
let tileSeen = {};           // per-type tile counter — every second tile shades lighter
function buildInstances() {
  for (const inst of instances.values()) scene.remove(inst.group); // tear down a previous mount
  instances.clear();
  tileSeen = {};
  for (const cfg of manifest.instances) {
    const group = new THREE.Group();
    group.add(templates[cfg.node].clone(true));
    // yaw (about Y) covers most parts; rot = [rx,ry,rz] degrees adds pitch/roll
    // for the few that need it (under-table screws stand UP into the surface)
    const rot = cfg.rot || [0, cfg.yaw || 0, 0];
    group.rotation.set(THREE.MathUtils.degToRad(rot[0]), THREE.MathUtils.degToRad(rot[1]), THREE.MathUtils.degToRad(rot[2]));
    group.visible = false;
    group.userData.instanceId = cfg.id;
    scene.add(group);
    const type = typeByNode[cfg.node];
    let alt = false;
    if (TILED_TYPES.has(type)) {
      const n = tileSeen[type] = (tileSeen[type] || 0) + 1;
      alt = n % 2 === 0; // tiles are emitted in spatial order, so neighbors alternate
      if (alt) group.traverse(o => { if (o.isMesh) o.material = altMatFor(type); });
    }
    instances.set(cfg.id, { cfg, group, staged: !!cfg.stage, alt });
  }
}
function basePos(inst, staged) {
  const p = new THREE.Vector3(...inst.cfg.pos);
  if (staged && inst.cfg.stage) p.add(new THREE.Vector3(...manifest.stages[inst.cfg.stage]));
  return p;
}

// size the wall backdrop to the assembled build + a margin, sitting just behind
// it — a "mounting surface" that reads as sized to the kit, not an infinite wall.
function fitWall() {
  if (!isWallBuild) return;
  const box = new THREE.Box3(), one = new THREE.Box3();
  for (const inst of instances.values()) {
    if (inst.cfg.node.startsWith('WoodScrew')) continue; // screw tips sink INTO the wall — ignore for sizing
    inst.group.position.copy(basePos(inst, false));
    inst.group.updateMatrixWorld(true);
    one.setFromObject(inst.group);
    if (!one.isEmpty()) box.union(one);
  }
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  // Sized from the build's bounding SPHERE, not its box + 90 mm (2026-08-23):
  // at the tour's fit framing a box-plus-margin plane showed all four edges
  // and read as a dark board hung behind the model. MEASURED at the tour's
  // final 3/4 preset on a 1440x791 canvas: 6R wide still showed the left
  // edge (the camera sits to the right), 8R cleared it by 18 px, 10R by 165;
  // 7R tall centred ONE RADIUS BELOW the build clears top and bottom - a wall
  // runs down to the floor, not up into the air. Zoom out and the edges
  // return, which is fine for a "mounting surface". The behind-the-wall hide
  // rule (render loop) is what keeps orbiting free, not the plane's size.
  const R = size.length() / 2, margin = 90;
  const w = Math.max(size.x + margin * 2, R * 10), h = Math.max(size.y + margin * 2, R * 7);
  wall.geometry.dispose();
  wall.geometry = new THREE.PlaneGeometry(w, h);
  wall.position.set(ctr.x, ctr.y - R, box.min.z - 2); // just behind the case backs / bracket
}

// size the surface slab to the assembled build + margin, its underside resting
// on the rail tops (the screws poke INTO the wood — excluded from sizing, same
// as the wall excludes its screw tips). The slab's FRONT edge sits flush with
// the rail fronts — the kit mounts at a desk's front edge, so drawers (and
// their handles) poke out past it; margins only on the back and sides.
let surfaceUnderY = 0;
function fitSurface() {
  if (!isUnderTableBuild) return;
  const box = new THREE.Box3(), rails = new THREE.Box3(), one = new THREE.Box3();
  for (const inst of instances.values()) {
    if (inst.cfg.node.startsWith('WoodScrew')) continue;
    inst.group.position.copy(basePos(inst, false));
    inst.group.updateMatrixWorld(true);
    one.setFromObject(inst.group);
    if (one.isEmpty()) continue;
    box.union(one);
    if (inst.cfg.node.startsWith('UnderTableRail')) rails.union(one);
  }
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  // back + side margins from the bounding sphere (see fitWall): the desk runs
  // off the frame instead of ending 90 mm past the cases. The FRONT edge is
  // still flush with the rail fronts - that edge is the product's own claim.
  const R = size.length() / 2, margin = Math.max(90, R * 4);
  surfaceUnderY = box.max.y;
  const front = rails.isEmpty() ? box.max.z : rails.max.z; // rail front = the desk edge
  const depth = (front - box.min.z) + margin;              // margin on the back only
  surface.geometry.dispose();
  surface.geometry = new THREE.BoxGeometry(size.x + margin * 2, 25, depth);
  surface.position.set(ctr.x, surfaceUnderY + 12.5, front - depth / 2);
}

// build bounding sphere, for aspect-aware "fit to view" camera framing (so
// whole-build shots fill the frame on any aspect, not just tall/square ones)
let buildCenter = new THREE.Vector3(), buildRadius = 400;
const assembledBox = new THREE.Box3(); // final-state extents, wood screws excluded — feeds the W/H/L dimension callouts
function computeBounds() {
  const box = new THREE.Box3();
  assembledBox.makeEmpty();
  for (const inst of instances.values()) {
    inst.group.position.copy(basePos(inst, false));
    inst.group.updateMatrixWorld(true);
    if (inst.styleHidden) continue; // style-suppressed (handles under an EdgeLabel plate) — not part of the build
    box.expandByObject(inst.group);
    // screws sink INTO the mounting surface (wall/wood) — not part of the
    // build's physical envelope (same rule as fitWall/fitSurface). FEET DO
    // count, and both kinds do: the bought adhesive foot is the printed one
    // without its dovetail rail, and that rail lives INSIDE the case, so a
    // build stands at the same height either way and the published envelope
    // has to say so. (It briefly did not - 2026-08-21 to -22.)
    if (!inst.cfg.node.startsWith('WoodScrew')) assembledBox.expandByObject(inst.group);
  }
  markShadowDirty();   // every part was just moved to its final place
  if (!box.isEmpty()) {
    box.getCenter(buildCenter);
    buildRadius = box.getSize(new THREE.Vector3()).length() / 2; // ≈ bounding-sphere radius
  }
}
// distance at which a bounding sphere of radius R fits BOTH the vertical and
// horizontal FOV — the max keeps it uncropped on wide (fills height) and narrow
// (fills width) viewports alike.
function fitDistanceFor(R, fovDeg) {
  // frame with the fov the shot will END at (presets default to 40) — reading
  // the live camera.fov here overshot ~4× when dot-jumping from the telephoto
  // cover (fov 9) straight to a fit step.
  const vFov = THREE.MathUtils.degToRad(fovDeg || camera.fov || 40);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (camera.aspect || 1.6));
  return Math.max(R / Math.sin(vFov / 2), R / Math.sin(hFov / 2));
}
const fitDistance = (margin, fovDeg) => fitDistanceFor(buildRadius * margin, fovDeg);
// distance that keeps an OFF-CENTRE composition on frame: halfW/halfH are the
// worst-case extents measured from the camera axis (not the build centre), so
// the cover can push the model left of the brand overlay without cropping it.
// halfD (half the depth) matters: the widest thing on screen is the NEAR face,
// which sits halfD closer than the centre and so subtends more angle — ignoring
// it ate the whole margin on a deep 240 build and clipped 3 px off the edge.
function coverDistance({ halfW, halfH, halfD = 0 }, fovDeg, min) {
  const vT = Math.tan(THREE.MathUtils.degToRad(fovDeg || 40) / 2);
  const hT = vT * (camera.aspect || 1.6);
  return Math.max(min || 0, halfW / hT + halfD, halfH / vT + halfD);
}

// ---------- step state (deterministic jump to any step) ----------
// After step i: which instances are visible, which stages are settled.
const afterState = [];
function buildAfterState() {
  afterState.length = 0;
  const visible = new Set(), settled = new Set();
  manifest.steps.forEach(step => {
    for (const ph of step.phases || []) {
      for (const e of ph.enter || []) visible.add(e.id);
      for (const f of ph.fade || []) visible.add(f.id);
      // settle = tween a staged group home; land = mark it home in place (used
      // after explicit move phases already carried it there, e.g. a wall hang).
      if (ph.settle) settled.add(ph.settle);
      if (ph.land) settled.add(ph.land);
    }
    afterState.push({ visible: new Set(visible), settled: new Set(settled) });
  });
}
function applyState(i) { // instant snap to "after step i" (i = -1 for nothing)
  killTweens();
  const st = i < 0 ? { visible: new Set(), settled: new Set() } : afterState[i];
  for (const inst of instances.values()) {
    inst.group.visible = st.visible.has(inst.cfg.id) && !inst.styleHidden; // styleHidden: bolt-on handles while an EdgeLabel plate is active
    inst.staged = !!inst.cfg.stage && !st.settled.has(inst.cfg.stage);
    inst.group.position.copy(basePos(inst, inst.staged));
    // clear a stranded label lift / mid-spin screw (killed mid-tween)
    if (inst.group.children[0]) { inst.group.children[0].position.set(0, 0, 0); inst.group.children[0].rotation.set(0, 0, 0); }
    // restore shared materials (an interrupted fade leaves per-mesh clones)
    inst.group.traverse(o => { if (o.isMesh) o.material = materialFor(inst, false, o.userData.zone); });
  }
  markShadowDirty();   // a snap at rest (Back, a regenerate, a restored page) moves no camera and starts no tween
}

// ---------- exploded parts preview (checklist step) ----------
// Engine-computed from final positions — no manifest data, works for any kit
// or generated build: radial spread from the assembly center, per-type pushes
// for parts that hide inside others, drawer attachments explode with their drawer.
const exploded = new Map();
function buildExploded() {
  exploded.clear();
  const center = new THREE.Vector3();
  for (const inst of instances.values()) center.add(basePos(inst, false));
  center.divideScalar(instances.size);
  const SCALE = new THREE.Vector3(1.35, 1.75, 1.35);
  const PUSH = {
    QuickLock: [0, 55, 0], Stopper: [0, 55, 0], MagnetClip: [0, 0, -70], Magnet: [0, 0, -100],
    Foot: [0, -25, 0], FootAdhesive: [0, -25, 0], Drawer: [0, 0, 170], CoverU: [0, 45, 0], FootrailU: [0, 25, 0],
  };
  const RIDER_PUSH = { Faceplate: [0, 0, 70], Handle: [0, 0, 115] };
  const eFor = inst => {
    const e = basePos(inst, false).sub(center).multiply(SCALE).add(center);
    const push = PUSH[typeByNode[inst.cfg.node]];
    if (push) e.add(new THREE.Vector3(...push));
    return e;
  };
  for (const inst of instances.values()) if (!inst.cfg.rides) exploded.set(inst.cfg.id, eFor(inst));
  for (const inst of instances.values()) if (inst.cfg.rides && instances.has(inst.cfg.rides)) {
    const carrier = instances.get(inst.cfg.rides);
    const rel = basePos(inst, false).sub(basePos(carrier, false));
    const e = (exploded.get(carrier.cfg.id) || eFor(carrier)).clone().add(rel);
    const push = RIDER_PUSH[typeByNode[inst.cfg.node]];
    if (push) e.add(new THREE.Vector3(...push));
    exploded.set(inst.cfg.id, e);
  }
  let minY = Infinity;
  for (const v of exploded.values()) minY = Math.min(minY, v.y);
  if (minY < 6) for (const v of exploded.values()) v.y += 6 - minY;
}
function applyExploded() {
  killTweens();
  for (const inst of instances.values()) {
    inst.group.visible = !inst.styleHidden;
    inst.staged = false;
    inst.group.position.copy(exploded.get(inst.cfg.id));
    if (inst.group.children[0]) inst.group.children[0].position.set(0, 0, 0); // clear a stranded label lift
    inst.group.traverse(o => { if (o.isMesh) o.material = materialFor(inst, false, o.userData.zone); });
  }
  markShadowDirty();   // the checklist page, snapped at rest
}
// animated variant: parts drift from wherever they are (the finished cover
// assembly) out to the exploded spread while the camera pans in from the cover
function playExploded() {
  killTweens();
  for (const inst of instances.values()) {
    inst.staged = false;
    inst.group.traverse(o => { if (o.isMesh) o.material = materialFor(inst, false, o.userData.zone); });
    const e = exploded.get(inst.cfg.id);
    if (!inst.group.visible || inst.styleHidden) { inst.group.visible = !inst.styleHidden; inst.group.position.copy(e); continue; }
    const fromV = inst.group.position.clone();
    tween({ duration: 1000, onUpdate: k => inst.group.position.lerpVectors(fromV, e, k) });
  }
}

// ---------- cover page ----------
// Synthetic page 0: the finished build, shot "telephoto" (tiny FOV, camera far
// away) STRAIGHT-ON at the build's mid-height — faceplates read almost 2D,
// like box-art product photography (Joey) — framed left of center to leave
// room for the brand overlay. Engine-computed — kits and generated builds alike.
function applyCover() {
  killTweens();
  applyState(manifest.steps.length - 1); // the finished assembly
  const box = new THREE.Box3();
  for (const inst of instances.values()) if (inst.group.visible) box.expandByObject(inst.group);
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const spread = Math.max(size.x, size.y * 1.9, size.z);
  if (IS_EMBED) {
    // the dock is a narrow portrait-ish pane: the landscape composition below
    // (fixed telephoto distance + build pushed left to clear the brand
    // overlay) shoves the model off-frame there. Center it and fit for real
    // at the live aspect instead — fov 12 keeps the flat box-art look while
    // halving the telephoto pull-back (capped clear of the 8000 far plane).
    const R = size.length() / 2;
    return { t: 0, p: 90, r: Math.min(7500, fitDistanceFor(R * 1.15, 12)), target: [c.x, c.y, 0], fov: 12 };
  }
  // Box art: straight-on telephoto with the build pushed left of the brand
  // overlay. `spread * 7.2` is Joey's tuned distance but it's WIDTH-BLIND —
  // spread saturates on depth/height, so a 3W+ build kept the same pull-back,
  // sat further left (the offset scales with size.x) and ran off the frame.
  // coverBox states what must stay on screen and camPos only ever pulls FURTHER
  // back, so narrow builds keep the tuned composition exactly.
  const off = size.x * 0.33;
  return { t: 0, p: 90, r: spread * 7.2, target: [c.x + off, c.y, 0], fov: 9,
    coverBox: { halfW: (size.x / 2 + off) * 1.04, halfH: size.y / 2 * 1.12, halfD: size.z / 2 } };
}
// LEGO-box dressing: a thick corner ribbon (collection number + "COLLECTION")
// and stat badges bottom-left (big "ONLY N PARTS" block + drawers / steps /
// real W×H×L). All engine-computed from the manifest/bounds — regenerate-safe.
function renderCoverBadges() {
  const drawers = manifest.parts.filter(p => p.type === 'Drawer').reduce((n, p) => n + p.qty, 0);
  const cases = manifest.parts.filter(p => p.type === 'Case').reduce((n, p) => n + p.qty, 0);
  const steps = manifest.steps.length - 1; // numbered steps (intro is unnumbered)
  const s = assembledBox.isEmpty() ? null : assembledBox.getSize(new THREE.Vector3());
  $('cover-ribbon-num').textContent = manifest.collection || 'GEN2'; // e.g. 185 / 165
  // Hero = the storage you GET (drawers) rather than the raw printed-piece count
  // — small QuickLocks/stoppers made "N parts" read as print labor. Drawer-less
  // builds lead with the case/module count so the hero is never "0". The full
  // print count still lives on the checklist page.
  const hero = drawers
    ? { n: drawers, label: drawers === 1 ? 'drawer' : 'drawers' }
    : { n: cases, label: cases === 1 ? 'case' : 'cases' };
  const chip = (b, l) => `<div class="cv-chip"><b>${b}</b><span>${l}</span></div>`;
  $('cover-badges').innerHTML =
    `<div class="cv-hero"><b>${hero.n}</b><span>${hero.label}</span></div>` +
    chip(steps, 'steps') +
    (s ? chip(`${s.x.toFixed(0)}×${s.y.toFixed(0)}×${s.z.toFixed(0)}`, 'mm · W·H·L') : '');
}

// ---------- step animation ----------
const DUR = { enter: 750, settle: 850, move: 600, fade: 650, stagger: 130, camera: 750, via: 300, detent: 900 };
/* Named curves a `move` phase can ask for by name, over RAW progress.
   detent: p(k) = k + (A/2pi)*sin(2pi*k), so p'(k) = 1 + A*cos(2pi*k) —
   fast off the mark (1+A), nearly stalled at mid-travel (1-A), fast again into
   the seat (1+A). ⚠ A must stay BELOW 1 or p' goes negative and the part
   visibly reverses mid-slide; 0.85 is the deepest hesitation that stays
   monotone. Endpoints are exact: sin(0) = sin(2pi) = 0, so p(0)=0 and p(1)=1
   and the part rests precisely on its seat. */
const MOVE_EASE = {
  detent: k => k + (0.85 / (2 * Math.PI)) * Math.sin(2 * Math.PI * k),
};
const QL_DIP = 3;   // mm a pressed QuickLock tab travels (ground truth: the 2026-08-24 spring video)
let animToken = 0;

async function playStep(i) {
  const my = ++animToken;
  const step = manifest.steps[i];
  if (step.checklist) { playExploded(); tweenCamera(step.camera, 1400); return; }
  applyState(i - 1);
  tweenCamera(step.camera);
  const vanished = new Set(); // ids hidden by a `vanish` phase, restored by `appear`
  for (const ph of step.phases || []) {
    if (my !== animToken) return;
    const jobs = [];
    // a phase can retarget the camera mid-step (e.g. zoom in on the pegs, then
    // zoom back out) — the phase waits for the move like any other job.
    if (ph.camera) jobs.push(tweenCamera(ph.camera, DUR.camera));
    // vanish/appear: the step-scripted twin of the faceplate tap-isolation —
    // fade EVERY currently-visible instance to nothing (then hide), and later
    // fade the hidden set back in. `room: 0|1` drives the table/grid/wall fade
    // via the same render-loop lerp the isolation uses (goTo resets it to 1).
    // Both are transient within the step (an `appear` always follows), so
    // prev/jump determinism is untouched; an aborted step never fires the
    // onDone hide (killTweens drops it) and applyState restores everything.
    if (ph.room !== undefined) fpEnv.target = ph.room;
    if (ph.vanish) {
      setDims(false); // the W/H/L callouts would float over the clean stage
      for (const inst of instances.values()) {
        if (!inst.group.visible) continue;
        const mats = [];
        inst.group.traverse(o => {
          if (!o.isMesh) return;
          const m = cloneMaterial(materialFor(inst, false, o.userData.zone));
          m.userData.rest = m.opacity; // 1 for every part shipping today; see restOf()
          m.transparent = true;
          o.material = m; mats.push(m);
        });
        vanished.add(inst.cfg.id);
        jobs.push(tween({
          duration: DUR.fade,
          onUpdate: k => mats.forEach(m => { m.opacity = restOf(m) * (1 - k); }),
          onDone: () => { inst.group.visible = false; },
        }));
      }
    }
    if (ph.appear) {
      setDims(!PAGES[cur]?.cover && !PAGES[cur]?.outro && cur - 1 === manifest.steps.length - 1); // callouts return with the world
      for (const id of vanished) {
        const inst = instances.get(id);
        if (!inst) continue;
        inst.group.visible = true;
        const mats = [];
        inst.group.traverse(o => { if (o.isMesh && o.material.transparent) mats.push(o.material); });
        jobs.push(tween({
          duration: DUR.fade,
          onUpdate: k => mats.forEach(m => { m.opacity = restOf(m) * k; }),
          onDone: () => inst.group.traverse(o => { if (o.isMesh) o.material = materialFor(inst, false, o.userData.zone); }),
        }));
      }
      vanished.clear();
    }
    // ghost: fade instances to translucent so you can see through them (e.g. a
    // cover, to reveal the pegs behind it); solid: fade them back opaque.
    (ph.ghost || []).forEach(g => {
      const inst = instances.get(g.id);
      const mats = [];
      inst.group.traverse(o => {
        if (!o.isMesh) return;
        const m = cloneMaterial(materialFor(inst, false, o.userData.zone));
        m.userData.rest = m.opacity;
        m.transparent = true;
        o.material = m; mats.push(m);
      });
      jobs.push(tween({ duration: DUR.fade, onUpdate: k => mats.forEach(m => { const r = restOf(m); m.opacity = r - 0.85 * r * k; }) }));
    });
    (ph.solid || []).forEach(g => {
      const inst = instances.get(g.id);
      const mats = [];
      inst.group.traverse(o => { if (o.isMesh && o.material.transparent) mats.push(o.material); });
      jobs.push(tween({
        duration: DUR.fade,
        onUpdate: k => mats.forEach(m => { const r = restOf(m); m.opacity = r * (0.15 + 0.85 * k); }),
        onDone: () => inst.group.traverse(o => { if (o.isMesh) o.material = materialFor(inst, false, o.userData.zone); })
      }));
    });
    // enter items normally stagger (parts arriving one by one). `sync: true`
    // moves them in unison — for a pre-assembled group sliding in as one piece
    // (e.g. a wall case with its QuickLocks already fitted).
    // Multi-tile landings (covers, footrails, brackets, rails) read too fast at
    // full speed and then fuse visually — pace them down so each tile is seen
    // arriving on its own. Manifests can override with an explicit `pace`.
    const tileCount = (ph.enter || []).filter(e => TILED_TYPES.has(typeByNode[instances.get(e.id).cfg.node])).length;
    const pace = ph.pace || (tileCount >= 2 ? 1.6 : 1);
    (ph.enter || []).forEach((e, n) => {
      const inst = instances.get(e.id);
      const to = basePos(inst, inst.staged);
      if (e.at) to.add(new THREE.Vector3(...e.at)); // land at a temporary offset (e.g. onto a popped-out drawer)
      const fromV = to.clone().add(new THREE.Vector3(...e.from));
      inst.group.visible = !inst.styleHidden;
      inst.group.position.copy(fromV);
      // `via`: cumulative deltas from the landing point, glided through as ONE
      // arc-length-continuous motion — an approach + press-on reads as a single
      // swoop instead of easing to a dead stop at every phase boundary (the
      // faceplate dressing looked like it stalled mid-air, Joey 2026-07-13).
      // The eased k maps to distance along the polyline, so the path bends
      // still read as deliberate direction changes — there's just no stop.
      const pts = [fromV, to, ...(e.via || []).map(d => to.clone().add(new THREE.Vector3(...d)))];
      const legs = []; let total = 0;
      for (let s = 1; s < pts.length; s++) { total += pts[s].distanceTo(pts[s - 1]); legs.push(total); }
      // `spin: <turns>`: rotate the part about its own depth axis as it travels
      // — a screw visibly THREADS in rather than sliding (Joey 2026-07-24).
      // Parts are bottom-anchored (base at Y=0) and only X/Z are centred, so
      // spinning group.rotation.z would swing the screw around its base instead
      // of its shank; rotate the inner child about the mesh's own centre by
      // compensating the translation (p → R(p−c)+c). Positive θ reads CLOCKWISE
      // from behind the plate — where the person holding the driver is.
      const child = e.spin ? inst.group.children[0] : null;
      let pivot = null;
      if (child) {
        child.rotation.set(0, 0, 0); child.position.set(0, 0, 0);
        inst.group.updateMatrixWorld(true);
        pivot = inst.group.worldToLocal(new THREE.Box3().setFromObject(child).getCenter(new THREE.Vector3()));
      }
      jobs.push(tween({
        duration: (DUR.enter + DUR.via * (e.via?.length || 0)) * pace, delay: ph.sync ? 0 : n * DUR.stagger * pace,
        onUpdate: k => {
          if (child) {
            // land on a whole number of turns so the resting pose is identity
            const th = k >= 1 ? 0 : e.spin * Math.PI * 2 * k;
            child.rotation.z = th;
            child.position.set(
              pivot.x - (pivot.x * Math.cos(th) - pivot.y * Math.sin(th)),
              pivot.y - (pivot.x * Math.sin(th) + pivot.y * Math.cos(th)), 0);
          }
          if (!total) { inst.group.position.copy(pts[pts.length - 1]); return; }
          const d = k * total;
          let s = legs.findIndex(L => d <= L); if (s === -1) s = legs.length - 1;
          const prev = s === 0 ? 0 : legs[s - 1];
          const t = legs[s] === prev ? 1 : (d - prev) / (legs[s] - prev);
          inst.group.position.lerpVectors(pts[s], pts[s + 1], t);
        }
      }));
    });
    // dip: spring-loaded QuickLock tabs pressed DOWN while a unit slides over
    // them in THIS phase (enter, settle or move), then HELD until the `pop`
    // phase that must follow in the same step releases them - the mechanism
    // Joey filmed 2026-08-24 (integrated serpentine spring; the tab dips ~3 mm
    // under the slider's channel, then clicks up into the keyhole at full
    // seat). `from` = the fraction of the slide at which the slider's leading
    // edge first covers the tab - the generator computes it from geometry.
    // Rides each instance's INNER CHILD exactly like `spin`, so applyState's
    // child-zeroing self-heals any interruption, and dip+pop always net to
    // zero within the step - after-state math never sees the offset.
    if (ph.dip && ph.dip.length) {
      const nEnter = (ph.enter || []).length;
      const maxVia = Math.max(0, ...(ph.enter || []).map(e => e.via?.length || 0));
      const span = nEnter
        ? (DUR.enter + DUR.via * maxVia) * pace + (ph.sync ? 0 : (nEnter - 1) * DUR.stagger * pace)
        : ph.settle ? DUR.settle : DUR.move;
      ph.dip.forEach(dp => {
        const inst = instances.get(dp.id);
        const child = inst && inst.group.children[0];
        if (!child) return;
        const f0 = dp.from ?? 0.7, lead = Math.min(0.12, f0);
        jobs.push(tween({
          duration: span,
          onUpdate: k => {
            const e = k <= f0 - lead ? 0 : k >= f0 ? 1 : (k - (f0 - lead)) / lead;
            child.position.y = -QL_DIP * e * e * (3 - 2 * e);   // smoothstep press
          }
        }));
      });
    }
    // pop: the spring release - rise from the held dip with a small damped
    // overshoot, landing EXACTLY at 0 (k>=1 clamps, deterministic rest).
    (ph.pop || []).forEach((p, n2) => {
      const inst = instances.get(p.id);
      const child = inst && inst.group.children[0];
      if (!child) return;
      jobs.push(tween({
        duration: 320, delay: n2 * 45,
        onUpdate: k => {
          child.position.y = k >= 1 ? 0 : -QL_DIP * (1 - k) * (1 - k) * Math.cos(5.2 * k);
        }
      }));
    });
    // move: nudge already-placed instances by a delta (net deltas must cancel
    // by the end of the step so prev/jump's computed after-state stays true)
    (ph.move || []).forEach(m => {
      const inst = instances.get(m.id);
      const fromV = inst.group.position.clone();
      const to = fromV.clone().add(new THREE.Vector3(...m.by));
      /* `hold`: wait before starting. Phases run back to back, so without it a
         two-leg install reads as one continuous motion - the beat is what says
         "it is IN the slot now, and THAT was a separate action".
         `ease: 'detent'`: moves off, all but stops at mid-travel, then snaps
         home - a dovetail that catches and clicks (Joey 2026-08-28). */
      const ease = MOVE_EASE[m.ease];
      jobs.push(tween({
        duration: m.ease ? DUR.detent : DUR.move,
        delay: m.hold || 0,
        raw: !!ease,
        onUpdate: k => inst.group.position.lerpVectors(fromV, to, ease ? ease(k) : k)
      }));
    });
    // fade: materialize instances at their final position ("…and repeat for
    // the rest") — one demonstrated install + a fade keeps big kits one step
    (ph.fade || []).forEach((f, n) => {
      const inst = instances.get(f.id);
      inst.group.visible = !inst.styleHidden;
      inst.group.position.copy(basePos(inst, inst.staged));
      const mats = [];
      inst.group.traverse(o => {
        if (!o.isMesh) return;
        const m = cloneMaterial(materialFor(inst, false, o.userData.zone));
        m.userData.rest = m.opacity;
        m.transparent = true;
        m.opacity = 0;
        o.material = m;
        mats.push(m);
      });
      jobs.push(tween({
        duration: DUR.fade, delay: n * 80,
        onUpdate: k => mats.forEach(m => { m.opacity = restOf(m) * k; }),
        onDone: () => inst.group.traverse(o => { if (o.isMesh) o.material = materialFor(inst, false, o.userData.zone); })
      }));
    });
    if (ph.settle) {
      for (const inst of instances.values()) {
        if (inst.cfg.stage !== ph.settle || !inst.staged) continue;
        const fromV = basePos(inst, true), to = basePos(inst, false);
        jobs.push(tween({
          duration: DUR.settle,
          onUpdate: k => inst.group.position.lerpVectors(fromV, to, k),
          onDone: () => { inst.staged = false; }
        }));
      }
    }
    await Promise.all(jobs);
    // land: a staged group's own move phases already carried it to final — mark
    // it un-staged (and snap exactly home) so prev/jump matches. No tween.
    if (ph.land) for (const inst of instances.values()) {
      if (inst.cfg.stage !== ph.land) continue;
      inst.staged = false;
      inst.group.position.copy(basePos(inst, false));
    }
  }
}

// ---------- camera ----------
function camPos(preset) {
  const t = THREE.MathUtils.degToRad(preset.t), p = THREE.MathUtils.degToRad(preset.p);
  const target = new THREE.Vector3(...preset.target);
  // whole-build presets carry `fit` (a margin) — frame to the actual bounds at
  // the current aspect; `fitR` frames a preset-supplied RADIUS in mm the same
  // aspect-aware way (the faceplate cinematic — a fixed r overfilled portrait
  // phones, whose horizontal fov is tiny); others use their tuned r.
  // `coverBox` frames the cover's OFF-CENTRE composition: a plain `fit` would
  // re-centre the build and throw the box-art layout away, so fit the stated
  // half-extents at the live aspect and never come closer than the tuned r.
  const r = preset.coverBox ? coverDistance(preset.coverBox, preset.fov || 40, preset.r)
    : preset.fitR ? fitDistanceFor(preset.fitR, preset.fov || 40)
    : preset.fit ? fitDistance(preset.fit, preset.fov || 40) : preset.r;
  const pos = new THREE.Vector3(
    r * Math.sin(p) * Math.sin(t),
    r * Math.cos(p),
    r * Math.sin(p) * Math.cos(t)
  ).add(target);
  return { pos, target };
}
// user camera override — orbit/zoom during a step and the guided camera stops
// fighting you (per-phase retargets included). A "resume" button returns to
// wherever the tour camera last wanted to be (google-maps-style re-center).
// The cover and outro reset it (they own the camera); replay keeps it, so an
// installation can be studied up close from any angle.
let camOverride = false, interactFrom = null;
function setCamOverride(on) {
  camOverride = on;
  document.getElementById('btn-cam').classList.toggle('hidden', !on);
}
controls.addEventListener('start', () => {
  interactFrom = { p: camera.position.clone(), t: controls.target.clone() };
});
controls.addEventListener('end', () => {
  if (!interactFrom || cinema.on) { interactFrom = null; return; }
  const moved = camera.position.distanceTo(interactFrom.p) + controls.target.distanceTo(interactFrom.t);
  if (moved > 4) setCamOverride(true); // a real orbit/zoom — an identify tap doesn't move the camera
  interactFrom = null;
});

let camTweenToken = 0, curCamPreset = null;
function tweenCamera(preset, duration = 900, force = false) {
  if (!preset) return Promise.resolve();
  curCamPreset = preset;                 // always record the tour's intent — Resume returns here
  if (camOverride && !force) return Promise.resolve(); // the user owns the camera right now
  const my = ++camTweenToken;
  const { pos, target } = camPos(preset);
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  const fov0 = camera.fov, fov1 = preset.fov || 40; // cover uses a telephoto fov
  return tween({
    duration,
    onUpdate: k => {
      if (my !== camTweenToken) return;
      camera.position.lerpVectors(p0, pos, k);
      controls.target.lerpVectors(t0, target, k);
      if (fov0 !== fov1) {
        camera.fov = fov0 + (fov1 - fov0) * k;
        camera.updateProjectionMatrix();
      }
    }
  });
}

// ---------- UI ----------
// Pages = [cover, ...manifest steps]. The cover is synthetic (page 0); the
// checklist/exploded page is the unnumbered intro; assembly steps count from 1.
const $ = id => document.getElementById(id);
let PAGES = [], dots = [], cur = 0;
function buildPages() {
  PAGES = [{ cover: true }, ...manifest.steps, { outro: true }];
  const wrap = $('step-dots');
  wrap.innerHTML = ''; // rebuilt on re-mount (step count can change)
  dots = PAGES.map((_, i) => {
    const d = document.createElement('div');
    d.className = 'dot';
    // the final ASSEMBLY step (2nd-to-last page) is the finished build — mark
    // it so customizers can jump straight there from anywhere on the timeline
    if (i === PAGES.length - 2) { d.classList.add('finish'); d.title = 'Skip to the finished build'; }
    d.onclick = () => goTo(i);
    wrap.appendChild(d);
    return d;
  });
}

// Every outbound link in the viewer is built here — store buttons, the ▾ menu,
// hardware buy chips, "Get filament", the label-generator pill — so this is the
// one place that needs instrumenting, and any link added later is covered for
// free. `ev` overrides the derived name where the destination host doesn't tell
// the whole story (a filament buy and a magnet buy are both amazon.com).
/* Affiliate clicks all report as `buy:<kind>:<what>` — ONE prefix, so the
   dashboard can group every monetisable click without also sweeping in
   `filament:<brand>`, which is a colour PICK in the designer and means the
   opposite thing (a design choice, not a purchase intent).

   Hardware resolves to the LISTING id from generate.js BUY, so a row reads
   `buy:hardware:magnet-n52-10x2` — which affiliate link converted, not merely
   that one did. Falls back to `unknown` rather than dropping the click, so a
   BUY entry added without an id still counts and shows up as something to fix. */
const buyEvent = b => 'buy:hardware:' + (b.id || 'unknown');

/* Filament reports BRAND + PRODUCT LINE, resolved from FILAMENT_DB by the
   colour the user actually picked. Deliberately NOT the colour label: that is
   a ~70-value long tail that would leave every dashboard row sitting at 1, and
   it's the rule that keeps event names free of user-visible values (same
   reason the pick handler sends brand only). Line is included because it maps
   to a distinct product page — Panchroma PLA and Panchroma Silk are separate
   listings, so "which line sells" is answerable while the tail stays short. */
function buyFilamentEvent(pick) {
  // No pick means the generic "Shop filament →", whose href is FILAMENT_DB[0] —
  // mirror that here so the event names the page the click actually opens.
  const src = pick ? FILAMENT_DB.find(f => f.colors.some(c => c.label === pick.name))
                   : FILAMENT_DB[0];
  return 'buy:filament:' + (src ? slug(src.brand + '-' + src.line) : 'unknown');
}

/* Which hosts pay a commission. HOST-driven so the "· paid link" marking and
   the disclosures can never drift from the truth of an individual URL — the
   filament menu mixes Amazon (paid) with Polymaker/Printed Solid (plain), so a
   blanket label would misstate the relationship in one direction or the other.
   When a store becomes a paid program (e.g. Polymaker tracked links), its host
   joins this list and every surface updates at once. FTC guidance: "paid link"
   next to the link is adequate where "affiliate link" alone may not be. */
const PAID_HOSTS = [/(^|\.)amzn\.to$/, /(^|\.)amazon\.[a-z.]+$/,
  // Polymaker Ambassador tracked links (2026-08-07) — every FILAMENT_DB
  // Polymaker url routes through /JERRARI, so the whole host is paid now
  /(^|\.)shop\.polymaker\.com$/];
function isPaidLink(href) {
  try { return PAID_HOSTS.some(re => re.test(new URL(href).hostname.toLowerCase())); }
  catch (e) { return false; }
}

function linkEl(text, href, ev, mark = true) {
  const a = document.createElement('a');
  a.className = 'dl-link';
  a.href = href;
  a.target = '_blank';
  // every paid link is marked AT the link (FTC proximity) and carries
  // rel=sponsored (the planner's buy buttons already do). mark=false is for a
  // caller that puts its own disclosure line directly under the link instead
  // (the identify card) - rel=sponsored stays either way, #paid-note reads it
  const paid = isPaidLink(href);
  a.rel = paid ? 'noopener sponsored' : 'noopener';
  a.textContent = paid && mark ? text + ' · paid link' : text;
  a.addEventListener('click', () => track(ev || 'out:' + outTarget(href)));
  return a;
}
/* Paid-link disclosure, consolidated 2026-09-18 (Joey: the paragraph in the
   identify card ate the card and read as "super serious"; Astra's layout). Two
   parts, from the sources read that day:
   1. NEAR each paid link: the "· paid link" label linkEl adds (FTC Endorsement
      Guides FAQ: "'Paid link' right next to an affiliate link should be an
      adequate disclosure"; the same FAQ says a bare "affiliate link" may not be
      understood - never swap the label for that), or, in the identify card and
      (since 2026-09-19) the parts list, plain link labels with one plain
      commission line right under them. The filament picker's buy link still
      wears the label (markFmBuy).
   2. ON THE SITE, clearly: Amazon's own sentence (Associates Operating
      Agreement s.5: "clearly and prominently state ... on your Site ...: 'As an
      Amazon Associate I earn from qualifying purchases.'" - kept VERBATIM, a
      house rule: the agreement also accepts "any substantially similar
      statement previously allowed", but the exact words need no judgement
      call). It lives in ONE shared line, #paid-note, at the bottom of
      the stage while any Amazon link is on screen, instead of in every panel.
      A visible Polymaker link adds the Ambassador sentence there, unless the
      identify card's own line already names Polymaker.
   Visibility is read from the DOM (a[rel~=sponsored], set by linkEl and
   markFmBuy on every paid link), so a new surface is covered without being
   wired in; the interval is the catch-all, schedulePaidNote the fast path.
   ⚠ `var`, not const/let: the hooks that call schedulePaidNote can run during
   the boot's top-level awaits, BEFORE this part of the module has evaluated -
   a let/const read there is a TDZ ReferenceError (the qualityReady lesson). */
var PAID_PROGRAMS = [
  ['amazon',    /(^|\.)(amzn\.to|amazon\.[a-z.]+)$/],
  ['polymaker', /(^|\.)shop\.polymaker\.com$/],
];
// the store a link lands on, for button text ("Get filament on Amazon")
var STORE_PHRASES = [
  [/(^|\.)(amzn\.to|amazon\.[a-z.]+)$/, 'on Amazon'],
  [/(^|\.)shop\.polymaker\.com$/,       'from Polymaker'],
  [/(^|\.)printedsolid\.com$/,          'from Printed Solid'],
];
function hostOf(href) {
  try { return new URL(href).hostname.toLowerCase(); } catch (e) { return ''; }
}
function paidProgramOf(href) {
  if (!isPaidLink(href)) return null;
  const hit = (PAID_PROGRAMS || []).find(([, re]) => re.test(hostOf(href)));
  return hit ? hit[0] : 'other';
}
function storePhrase(href) {
  const hit = (STORE_PHRASES || []).find(([re]) => re.test(hostOf(href)));
  return hit ? hit[1] : '';
}
// the identify card's one line under its paid link(s). Hardware chip labels
// ("10×2 mm") don't name their store, so that line does; the filament button
// already says "on Amazon" / "from Polymaker"
function cardDisclosure(programs, chips) {
  const poly = programs.has('polymaker'), amazon = programs.has('amazon');
  if (poly && !amazon)
    return 'As a Polymaker Ambassador I earn a small commission - it costs you nothing extra.';
  // unreachable today (chips are all Amazon and a card never shows chips with a
  // filament link), but the invariant lives in colour-locking, not here - if it
  // ever breaks, the Polymaker link must still be disclosed where it sits
  if (poly && amazon)
    return 'I earn a small commission on these Amazon links and, as a Polymaker Ambassador, on Polymaker’s - at no extra cost to you.';
  if (chips && amazon)
    return 'Amazon links - I earn a small commission, at no extra cost to you.';
  return 'I earn a small commission - it costs you nothing extra.';
}
// the shared line at the bottom of the stage. Its job is Amazon's site-level
// sentence; Polymaker joins only when nothing on screen names it already (the
// identify card's own line does, and saying it twice was the clutter this
// replaced). An empty string hides the line.
function paidNoteText(programs, polymakerNamed = false) {
  const s = [];
  if (programs.has('amazon')) s.push('As an Amazon Associate I earn from qualifying purchases.');
  if (programs.has('polymaker') && !polymakerNamed)
    s.push(programs.has('amazon') ? 'I’m also a Polymaker Ambassador.' : 'I’m a Polymaker Ambassador and earn a commission on Polymaker links.');
  if (programs.has('other') && !s.length) s.push('I earn a commission on paid links.');
  return s.join(' ');
}
function linkShown(a) {
  return a.checkVisibility ? a.checkVisibility({ visibilityProperty: true }) : a.getClientRects().length > 0;
}
function updatePaidNote() {
  const note = document.getElementById('paid-note');
  if (!note) return;
  const programs = new Set();
  for (const a of document.querySelectorAll('a[rel~="sponsored"]'))
    if (linkShown(a)) programs.add(paidProgramOf(a.href) || 'other');
  const polymakerNamed = [...document.querySelectorAll('.link-note')]
    .some((n) => linkShown(n) && n.textContent.includes('Polymaker'));
  const text = paidNoteText(programs, polymakerNamed);
  const on = text !== '';
  if (on && note.textContent !== text) note.textContent = text;
  note.classList.toggle('hidden', !on);
  document.body.classList.toggle('paid-note-on', on);
  // the stage's bottom-anchored UI makes room for the line's REAL height - one
  // line on a desktop, two on a narrow phone. Measured only when the text or
  // the width changes: offsetHeight forces a layout, and this runs 4x a second
  const key = on ? text + '|' + innerWidth : '';
  if (on && key !== paidNoteMeasured) {
    document.body.style.setProperty('--paid-note-h', note.offsetHeight + 'px');
    paidNoteMeasured = key;
  }
}
var paidNoteMeasured = '';
var paidNoteQueued = false;
function schedulePaidNote() {
  if (paidNoteQueued) return;
  paidNoteQueued = true;
  requestAnimationFrame(() => { paidNoteQueued = false; updatePaidNote(); });
}
if (!IS_PART) setInterval(updatePaidNote, 250);
// hostname → a fixed short id, so `out:` stays a small closed vocabulary and a
// raw url can never become an event name
const OUT_HOSTS = [
  [/(^|\.)printables\.com$/,            'printables'],
  [/(^|\.)thangs\.com$/,                'thangs'],
  [/(^|\.)than\.gs$/,                   'thangs'],     // the short domain LINKS actually uses
  [/(^|\.)makerworld\.com$/,            'makerworld'],
  [/(^|\.)cults3d\.com$/,               'cults'],
  [/^(edgelabel|classic)\.jerrari3d\.com$/, 'labelgen'],
  [/(^|\.)jerrari3d\.com$/,             'jerrari'],
  [/(^|\.)(amzn\.to|amazon\.[a-z.]+)$/, 'amazon'],
  [/(^|\.)(x\.com|youtube\.com)$/,      'social'],
];
function outTarget(href) {
  try {
    const host = new URL(href, location.href).hostname.toLowerCase();
    for (const [re, id] of OUT_HOSTS) if (re.test(host)) return id;
  } catch (e) { /* malformed href — fall through */ }
  return 'other';
}

// ---------- model stores (Printables / Thangs / MakerWorld / Cults) ----------
// A part's `links` object carries one url per store key. Rows show ONE button —
// the user's preferred store — plus a ▾ listing the others that actually have
// this part. That keeps a row the same width no matter how many stores exist:
// adding one is a row here plus the url key in generate.js LINKS/LINKS_BY_LEN
// (and the planner's LINK_OVERRIDES — mirror both).
// `order` is the fallback chain when the preferred store doesn't carry a part:
// Printables first, it has the most complete catalog.
const STORES = [
  { id: 'printables', key: 'p', label: 'Printables', host: 'printables.com' },
  { id: 'thangs',     key: 't', label: 'Thangs',     host: 'thangs.com' },
  { id: 'makerworld', key: 'm', label: 'MakerWorld', host: 'makerworld.com' },
  { id: 'cults',      key: 'c', label: 'Cults 3D',   host: 'cults3d.com' },
];
const STORE_BY_ID = Object.fromEntries(STORES.map(s => [s.id, s]));
const STORE_STORE_KEY = 'gen2-store'; // preference is a VIEWER-wide pref, not per-kit
// Which platform's listing did they arrive from? `?from=` is OUR param, so
// GoatCounter can't read it the way it natively reads `ref`/`utm_source` — and
// it's the attribution that says which listing is actually doing the work.
// (Bare referrers need no event: GoatCounter records those itself.)
{
  const f = (new URLSearchParams(location.search).get('from') || '').toLowerCase();
  if (STORE_BY_ID[f]) track('from:' + f);
}
// Which store did the visitor come from? `?from=` is authoritative (we control
// the links printed in each platform's description, and it survives any
// referrer policy); document.referrer is the fallback for links we didn't
// author. Either only SEEDS an empty preference — it must never overwrite a
// deliberate pick.
function storeFromEntry() {
  const from = (new URLSearchParams(location.search).get('from') || '').toLowerCase();
  if (STORE_BY_ID[from]) return from;
  try {
    const host = new URL(document.referrer).hostname;
    const hit = STORES.find(s => host === s.host || host.endsWith('.' + s.host));
    if (hit) return hit.id;
  } catch (e) { /* no/opaque referrer — fine */ }
  return null;
}
let storePref = (() => {
  let saved = null;
  try { saved = localStorage.getItem(STORE_STORE_KEY); } catch (e) { /* private mode */ }
  if (saved && STORE_BY_ID[saved]) return saved;
  return storeFromEntry() || STORES[0].id;
})();
let storePrefT = 0; // stamp for the planner relay (newest-wins, like colors)
try { storePrefT = +(localStorage.getItem(STORE_STORE_KEY + ':t') || 0) || 0; } catch (e) {}
function persistStorePref() {
  try {
    localStorage.setItem(STORE_STORE_KEY, storePref);
    localStorage.setItem(STORE_STORE_KEY + ':t', String(storePrefT));
  } catch (e) { /* private mode — the relay still works in-session */ }
}
function setStorePref(id, { relay = true } = {}) {
  if (!STORE_BY_ID[id] || id === storePref) return; // the no-op guard also keeps the event honest
  // only a LOCAL pick counts — this same function receives the planner's relay,
  // and the planner already tracks its own linksite: choice (double-counting a
  // single decision would make the store split look twice as busy as it is)
  if (relay) track('store-pref:' + id);
  storePref = id;
  if (relay) { storePrefT = Date.now(); postStorePrefToPlanner(); }
  persistStorePref();
  renderChecklist();                                  // BOM rows re-label
  if (selectedId && instances.has(selectedId)) {      // and so does the open card
    const inst = instances.get(selectedId), t = typeByNode[inst.cfg.node];
    renderIdentifyLinks(partInfoByNode[inst.cfg.node], !colorLocked(t) && customColors[t] ? customColors[t] : null);
  }
  renderStorePicker();
}
// every store that actually carries this part, preferred first then fallback order
function storesFor(links) {
  if (!links) return [];
  const have = STORES.filter(s => links[s.key]);
  const pref = have.filter(s => s.id === storePref);
  return [...pref, ...have.filter(s => s.id !== storePref)];
}
// Renders the model links for one part: primary button NAMES the store it
// opens (so a Printables-only part under a MakerWorld preference is never a
// surprise), plus a ▾ for the rest. Stores without this part are omitted, not
// greyed — a menu of dead entries is noise.
function appendStoreLinks(box, links) {
  const have = storesFor(links);
  if (!have.length) return;
  const [primary, ...rest] = have;
  box.appendChild(linkEl(primary.label, links[primary.key]));
  if (!rest.length) return;
  const wrap = document.createElement('span');
  wrap.className = 'dl-more';
  const btn = document.createElement('button');
  btn.className = 'dl-more-btn';
  btn.type = 'button';
  btn.textContent = '▾';
  btn.title = 'Other sites for this part';
  btn.setAttribute('aria-label', 'Other sites for this part');
  const menu = document.createElement('div');
  menu.className = 'dl-more-menu hidden';
  for (const s of rest) {
    const a = linkEl(s.label, links[s.key]);
    a.classList.add('dl-more-item'); // ADD to dl-link — replacing it dropped the pill styling (default blue link, Joey's repro)
    // opening a store from the menu makes it your default — the preference is
    // set BY USE, so there's nothing to discover in a settings screen
    a.addEventListener('click', () => setStorePref(s.id));
    menu.appendChild(a);
  }
  btn.onclick = e => { e.stopPropagation(); closeStoreMenus(menu); menu.classList.toggle('hidden'); };
  wrap.append(btn, menu);
  box.appendChild(wrap);
}
function closeStoreMenus(except) {
  for (const m of document.querySelectorAll('.dl-more-menu'))
    if (m !== except) m.classList.add('hidden');
}
addEventListener('click', () => closeStoreMenus(null)); // click-away closes

// Explicit picker for people who'd rather set it up front than discover it via
// the ▾. Lives beside Copy list / Download CSV — where the links already are.
function renderStorePicker() {
  const sel = $('store-select');
  if (!sel) return;
  if (!sel.options.length)
    for (const s of STORES) sel.appendChild(Object.assign(document.createElement('option'), { value: s.id, textContent: s.label }));
  sel.value = storePref;
}
$('store-select').onchange = e => setStorePref(e.target.value);
renderStorePicker();

// The identify card's link row — shared by setSelected and both style-cycle
// handlers (they rebuild the card in place), so a store-preference change can
// re-render it from one call.
function renderIdentifyLinks(info, filament = null) {
  const linksEl = $('identify-links');
  linksEl.innerHTML = '';
  appendStoreLinks(linksEl, info?.links);
  // Paid links here drop the "· paid link" suffix: ONE plain commission line
  // sits right under them instead, and the filament button names its store
  // (Astra 2026-09-18; this replaced a four-line paragraph that covered both
  // programs whatever the card showed). Amazon's own sentence is the shared
  // #paid-note line. Judged by HOST: a Printed Solid pick is a plain link and
  // brings no line; a Polymaker pick names only Polymaker. A card shows chips
  // OR a filament link, never both - bought hardware is colour-locked.
  const programs = new Set();
  const chips = info?.links?.buy || [];
  // purchased hardware: Amazon affiliate buy options (generate.js BUY)
  for (const b of chips) {
    linksEl.appendChild(linkEl(b.label, b.url, buyEvent(b), false));
    const p = paidProgramOf(b.url); if (p) programs.add(p);
  }
  if (filament) {
    const where = storePhrase(filament.url);
    linksEl.appendChild(linkEl(where ? `Get filament ${where}` : 'Get filament', filament.url, buyFilamentEvent(filament), false));
    const p = paidProgramOf(filament.url); if (p) programs.add(p);
  }
  if (programs.size) {
    const line = document.createElement('div');
    line.className = 'link-note';
    line.textContent = cardDisclosure(programs, chips.length > 0);
    linksEl.appendChild(line);
  }
  schedulePaidNote();
}

// ---------- build options (generated builds only; static kits skip it) ----------
const drawersInBuild = () => build ? build.placed.filter(u => u.fill === 'decor' || u.fill === 'classic') : [];
const allStopperKeys = () => drawersInBuild().flatMap(u => Array.from({ length: u.w }, (_, k) => `${u.id}:${k}`));
function optSeg(label, options, activeVal, onPick) {
  const row = document.createElement('div'); row.className = 'opt-row';
  const lab = document.createElement('span'); lab.className = 'opt-label'; lab.textContent = label;
  const grp = document.createElement('div'); grp.className = 'opt-seg';
  for (const o of options) {
    const b = document.createElement('button');
    b.textContent = o.label;
    if (o.val === activeVal) b.classList.add('on');
    b.onclick = () => onPick(o.val);
    grp.appendChild(b);
  }
  row.append(lab, grp);
  return row;
}
// These three are wired ONLY to the Build options panel — the planner's remote
// sync mutates `build` directly — so tracking here counts local decisions only.
async function setAllClosure(val) { track('opt:closure:' + val); drawersInBuild().forEach(u => u.closure = val); await regenerate(); }
async function setAllStoppers(on) { track('opt:stoppers:' + (on ? 'all' : 'none')); build.removedStoppers = on ? [] : allStopperKeys(); await regenerate(); }
// the Decor drawers that have a Gridfinity version; absence of `variant` is the standard drawer
const gridfinityDrawers = () => drawersInBuild().filter(u => gridfinitySizeOk(+build.length, u));
async function setAllVariant(v) {
  track('opt:gridfinity:' + v);
  for (const u of gridfinityDrawers()) { if (v === 'gridfinity') u.variant = v; else delete u.variant; }
  await regenerate();
}
async function resetBuild() { track('opt:reset'); build = structuredClone(originalBuild); activeHandleStyle = null; activeFaceplateStyle = null; await regenerate(); }
function renderOptions() {
  const box = $('build-options');
  if (!box) return;
  box.innerHTML = '';
  if (!build) { box.classList.add('hidden'); return; } // static kits have no editable build
  box.classList.remove('hidden');
  const title = document.createElement('div'); title.className = 'section-head'; title.textContent = '⚙ Build options';
  box.appendChild(title);
  const drawers = drawersInBuild();
  if (drawers.length) {
    const closures = drawers.map(u => u.closure === 'magnet' ? 'magnet' : 'none');
    const closureActive = closures.every(c => c === 'magnet') ? 'magnet' : closures.every(c => c === 'none') ? 'none' : null;
    box.appendChild(optSeg('Drawer close', [{ label: 'None', val: 'none' }, { label: 'Magnets', val: 'magnet' }], closureActive, setAllClosure));
    const removed = new Set(build.removedStoppers || []), keys = allStopperKeys();
    const stopActive = removed.size === 0 ? 'all' : (keys.length && keys.every(k => removed.has(k))) ? 'none' : null;
    box.appendChild(optSeg('Drawer stoppers', [{ label: 'All', val: 'all' }, { label: 'None', val: 'none' }], stopActive, v => setAllStoppers(v === 'all')));
    // Gridfinity Decor drawers (v2609): an all-drawers master over every Decor
    // drawer that HAS a Gridfinity version, beside the per-drawer ◀▶ on the
    // identify card and the planner's per-unit choice. null = they disagree.
    const gridable = gridfinityDrawers();
    if (gridable.length) {
      const vals = gridable.map(u => u.variant === 'gridfinity' ? 'gridfinity' : 'standard');
      box.appendChild(optSeg('Decor drawers', [{ label: 'Standard', val: 'standard' }, { label: 'Gridfinity', val: 'gridfinity' }],
        vals.every(v => v === vals[0]) ? vals[0] : null, setAllVariant));
    }
  }
  if (currentFaceplateStyle() && availableFaceplateStyles().length > 1) {
    const row = document.createElement('div'); row.className = 'opt-row';
    const lab = document.createElement('span'); lab.className = 'opt-label'; lab.textContent = 'Faceplate';
    const grp = document.createElement('div'); grp.className = 'opt-seg opt-cycle';
    const prev = document.createElement('button'); prev.textContent = '◀'; prev.onclick = () => cycleFaceplateStyle(-1);
    const name = document.createElement('span'); name.className = 'opt-cycle-name';
    // 🔩 marks a family whose handle BOLTS ON — i.e. picking it means ordering
    // screws before you can finish. Integrated-grip families print complete, so
    // flipping through the styles shows which ones you can build today.
    const bolts = currentFaceplateStyle().hasHandle;
    name.innerHTML = currentFaceplateStyle().label + (bolts ? ' ' + HW_ICON : '');
    name.title = bolts ? 'Bolt-on handle - needs 2× M3×6 screws per drawer' : 'Handle is printed in - no hardware needed';
    const next = document.createElement('button'); next.textContent = '▶'; next.onclick = () => cycleFaceplateStyle(1);
    grp.append(prev, name, next); row.append(lab, grp); box.appendChild(row);
  }
  // Handle sits under Faceplate (Joey) — it's the plate's accessory, and it
  // only appears while the active family takes a bolt-on handle at all
  if (currentHandleStyleIndex() >= 0 && currentFaceplateStyle()?.hasHandle !== false) { // EdgeLabel prints its grip in — no handle to style
    const row = document.createElement('div'); row.className = 'opt-row';
    const lab = document.createElement('span'); lab.className = 'opt-label'; lab.textContent = 'Handle';
    const grp = document.createElement('div'); grp.className = 'opt-seg opt-cycle';
    const prev = document.createElement('button'); prev.textContent = '◀'; prev.onclick = () => cycleHandleStyle(-1);
    const name = document.createElement('span'); name.className = 'opt-cycle-name';
    const idx = currentHandleStyleIndex(); name.textContent = idx >= 0 ? HANDLE_STYLES[idx].label.replace(' Handle', '') : '?';
    const next = document.createElement('button'); next.textContent = '▶'; next.onclick = () => cycleHandleStyle(1);
    grp.append(prev, name, next); row.append(lab, grp); box.appendChild(row);
  }
  // faceplate back cover — a universal decor-faceplate accessory (every family
  // seats the same SHARED part, both collections); fills the new open-front
  // Decor drawer's gap, off = older closed-front drawers
  if (drawersInBuild().length) {
    box.appendChild(optSeg('Faceplate back cover', [{ label: 'Off', val: false }, { label: 'On', val: true }], !!build.backCover,
      async v => { track('opt:backcover:' + (v ? 'on' : 'off')); build.backCover = v; await regenerate(); }));
    // otherwise "On" with only Gridfinity drawers changes nothing on screen or in the list
    if (build.backCover && gridfinityDrawers().some(u => u.variant === 'gridfinity')) {
      const note = document.createElement('div');
      note.className = 'opt-note';
      note.textContent = 'Not on the Gridfinity drawers: their tear-away front does the same job.';
      box.appendChild(note);
    }
  }
  // tabletop feet: printed TPU feet or purchased adhesive rubber feet - one-
  // for-one alternatives (same count, same spots); the BOM bills the pick.
  // Mirrors the planner's "Feet" control (2026-08-21); the relay carries it.
  if (build.mount === 'tabletop') {
    box.appendChild(optSeg('Feet', [{ label: 'Print TPU', val: 'tpu' }, { label: 'Buy adhesive', val: 'adhesive' }], build.feet === 'adhesive' ? 'adhesive' : 'tpu',
      async v => { track('opt:feet:' + v); build.feet = v; await regenerate(); }));
  }
  // shelf lip — an All/None master over every shelf, the same shape as the
  // planner's per-unit toggle and the Drawer stoppers control here. The lip is
  // a real option: a shelf without one is still a shelf, so "None" is a
  // legitimate finished build, not an unmet obligation.
  const shelves = build.placed.filter(u => u.fill === 'shelf');
  if (shelves.length) {
    /* The stops come from the COLLECTION: only a 240/270 deck carries the
       second slot pair, so 'Front + mid' simply is not offered elsewhere.
       ⚠ 'none' is a STRING sentinel here, not null — optSeg already uses null
       for "the shelves disagree", which is a different state. */
    const SEG = { null: 'None', front: 'Front', both: 'Front + mid' };
    const modes = shelfLipModes(parseInt(manifest.collection, 10) || 185);
    const vals = shelves.map(u => u.lip ?? 'none');
    const active = vals.every(v => v === vals[0]) ? vals[0] : null;
    box.appendChild(optSeg('Shelf lip',
      modes.map(mv => ({ label: SEG[mv], val: mv || 'none' })), active,
      async v => {
        track('opt:shelflip:' + v);
        // absence IS "no lip" — never write `lip: false`, or the build stops
        // round-tripping through a planner share link that never carried it
        for (const u of shelves) { if (v === 'none') delete u.lip; else u.lip = v; }
        await regenerate();
      }));
  }
  if (isWallBuild) {
    box.appendChild(optSeg('Top cover', [{ label: 'Per-column', val: false }, { label: 'Staggered', val: true }], !!build.wallStagger,
      async v => { track('opt:topcover:' + (v ? 'staggered' : 'per-column')); build.wallStagger = v; await regenerate(); }));
  }
  // Build plate - the sheet the whole build printed on. Every part with a
  // confirmed print pose takes its finish on the face that lay on the plate, so
  // the row shows on every generated build and sits last, apart from the
  // part-specific options above. Mirrors the planner's "Build plate" control;
  // the relay carries it.
  const plateRow = optSeg('Build plate', PLATE_PROFILES.map(p => ({ label: p.label, val: p.key })),
    plateProfile().key, setBuildPlate);
  plateRow.classList.add('opt-stack');   // three long names: stacked under the label (viewer.css .opt-stack)
  box.appendChild(plateRow);
  const plateNote = document.createElement('div');
  plateNote.className = 'opt-note';
  plateNote.textContent = {
    powder: 'The powder-coated sheet\'s grain, on every face that printed against the plate.',
    smooth: 'A smooth sheet: plain, untextured faces where parts touched the plate.',
    holographic: 'Simulated - the real effect shifts with lighting and angle.',
  }[plateProfile().key];
  box.appendChild(plateNote);
  /* The translucency fallback's own line, and only when a translucent filament is actually picked on a supported
     component. Astra 2026-09-17: "Show a small explanation: 'Simplified translucency for performance.' Keep a user
     override for the full effect." The override is per session (a URL switch carries it across reloads), and choosing
     it re-decides once - not per frame. */
  if (seeInto && seeIntoComponentKeys().some(k => !!translucentFamilyFor(k))) {
    const note = document.createElement('div');
    note.className = 'opt-note';
    note.textContent = seeIntoSimplified
      ? 'Simplified translucency for performance. The filament\'s colour and printed texture are unchanged.'
      : 'Full translucency: this build renders what is behind the part.';
    box.appendChild(note);
    const flip = document.createElement('button');
    flip.className = 'opt-reset';
    flip.textContent = seeIntoSimplified ? 'Use the full effect' : 'Use simplified translucency';
    flip.onclick = () => {
      seeIntoDetailMode = seeIntoSimplified ? 'full' : 'simple';
      track('opt:sidetail:' + seeIntoDetailMode);
      applyPalette();        // its first call is syncSeeIntoComponents, which re-decides and rebuilds the materials
      renderChecklist();     // renders renderOptions(), so the note and the button read the new state
    };
    box.appendChild(flip);
  }
  const reset = document.createElement('button'); reset.className = 'opt-reset'; reset.textContent = '↺ Reset to original';
  reset.onclick = resetBuild; box.appendChild(reset);
}

// "needs bought hardware" wrench — the SAME single-colour glyph the planner
// puts on its option cards (HW_PATH in its app.js): two icons for one idea read
// as two different ideas (Joey 2026-07-24), so keep these in sync. Head is a
// C-ring rather than a circle-minus-notch — see the planner comment for why a
// notch leaves a stray filled square.
/* Human names for the contract's option and basis ids, fed to REQ.explain().
   The ids are the planner's stable vocabulary; these are the words a person
   reads. ⚠ Mirrored in the site (src/lib/requirement-labels.js) - the same id
   must read the same way on a viewer row and on a site card, or "Required
   with magnetic closure" here becomes "Required with magnets" there and the
   two tools look like they disagree about a fact. Keep both in step. */
const OPTION_LABELS = {
  'drawer.closure.magnet': 'magnetic closure',
  'drawer.stoppers': 'drawer stoppers',
  'faceplate.backCover': 'the back cover',
  'mount:tabletop': 'tabletop',
  'mount:under-table': 'under-table',
  'mount:wall': 'wall-mounted',
  'cover.layout:staggered': 'staggered-cover',
  'tabletop.feet:tpu': 'printed-feet',
  'tabletop.feet:adhesive': 'adhesive-feet',
  'fill:classic': 'classic-drawer',
  'fill:decor': 'decor-drawer',
  'fill:shelf': 'shelf',
  'fill:cabinet': 'cabinet',
  'faceplate.family:essential': 'Essential faceplate',
  'faceplate.family:classic': 'Classic faceplate',
  'faceplate.family:edgelabel': 'EdgeLabel faceplate',
  'faceplate.family:classicpro': 'Classic Pro faceplate',
  'faceplate.family:chevron': 'Chevron faceplate',
  'drawer.closure:magnet': 'magnetic-closure',
  'drawer.stoppers:on': 'drawer-stopper',
};
// NB the viewBox is the artwork's ROTATED bounds, not 0 0 24 24: the wrench is
// drawn upright then turned −45°, so inside a square box it only spans ~13.6 of
// 24 units and rendered ~40% smaller than the text beside it (Joey saw it as
// invisible padding). Cropping to the real bounds makes 1em mean 1em of wrench.
const HW_ICON =
  '<svg class="hw-ico" viewBox="3.5 3.5 14.4 14.4" aria-hidden="true"><g transform="rotate(-45 12 12)"><path d="' +
  'M14.02 2.87A4.6 4.6 0 1 1 9.98 2.87L10.95 4.84A2.4 2.4 0 1 0 13.05 4.84Z' +
  'M10.1 9.5L13.9 9.5L13.9 17.1A1.9 1.9 0 0 1 10.1 17.1Z' +
  'M10.65 17.2a1.35 1.35 0 1 0 2.7 0a1.35 1.35 0 1 0 -2.7 0Z"/></g></svg>';

function renderChecklist() {
  renderOptions();
  const rows = $('checklist-rows');
  rows.innerHTML = '';
  let total = 0;
  for (const p of manifest.parts) {
    if (p.styleHidden) continue; // suppressed by the active faceplate style (handles under EdgeLabel)
    if (!p.purchased) total += p.qty; // purchased hardware isn't a print
    const row = document.createElement('div');
    row.className = 'checklist-row';
    const chip = document.createElement('button');
    chip.className = 'chip';
    // one swatch per row, so show the colour you actually SEE on the part
    const pk = primaryKey(p.node);
    chip.style.background = activeHex(pk); // reflects custom filament colors
    if (colorLocked(p.type)) { // purchased hardware: no filament picker
      chip.classList.add('locked');
      chip.title = 'Hardware-store item · shown in its real finish';
    } else {
      const zoned = pk !== p.type;
      chip.title = (useCustom && customColors[pk] ? customColors[pk].name + ' · ' : '') +
        (zoned ? 'click to pick the face filament · tap the part for its other zones'
               : 'click to pick a filament color');
      chip.onclick = () => openFilamentMenu(pk);
    }
    const mid = document.createElement('div');
    mid.className = 'cl-mid';
    const label = document.createElement('span');
    label.textContent = p.label;
    mid.appendChild(label);
    if (p.links) {
      const lnks = document.createElement('span');
      appendStoreLinks(lnks, p.links);
      // purchased hardware: Amazon affiliate buy options (generate.js BUY). As in
      // the identify card, the chips carry their plain labels and ONE line right
      // under them says who they go to and that I earn from them (Joey 2026-09-19:
      // it replaced a "· paid link" suffix on every chip; the Planner's parts list
      // reads the same). Judged by host, so a plain store link brings no line.
      const programs = new Set();
      for (const b of p.links.buy || []) {
        lnks.appendChild(linkEl(b.label, b.url, buyEvent(b), false));
        const pr = paidProgramOf(b.url); if (pr) programs.add(pr);
      }
      mid.appendChild(lnks);
      if (programs.size) {
        const line = document.createElement('div');
        line.className = 'link-note';
        line.textContent = cardDisclosure(programs, true);
        mid.appendChild(line);
      }
    }
    // optional per-row note (manifest-driven, like the planner's BOM rows):
    // where a row has an alternative or a condition the label can't carry -
    // the static kits use it to name the adhesive-feet option, which has no
    // Build options selector to discover (generated builds have the picker)
    if (p.note) {
      const note = document.createElement('span');
      note.className = 'cl-note';
      note.textContent = p.note;
      mid.appendChild(note);
    }
    /* WHY this row is in the bill, in the contract's own words. Three tiers
       and each must read differently, or the counter above is explaining a
       distinction the list then hides: a core row says nothing (it is the
       build); an option row names what selected it - "Required with magnetic
       closure", never a bare "Required"; an enhancement says "Optional". A
       core row WITH a basis names its variant, so a TPU foot reads "Required
       for printed-feet builds" and the adhesive alternative the same way. */
    if (p.requirement && p.requirement.scope !== 'core' || (p.requirement && p.basis)) {
      const why = document.createElement('span');
      why.className = 'cl-req ' + p.requirement.scope;
      why.textContent = REQ.explain(p, OPTION_LABELS);
      why.title = p.requirement.scope === 'option'
        ? 'Required by an option you selected · turn the option off and this row goes away'
        : p.requirement.scope === 'enhancement'
          ? 'Optional enhancement · the build works without it'
          : 'Core to this build as configured';
      mid.appendChild(why);
    }
    const qty = document.createElement('span');
    qty.className = 'qty';
    qty.textContent = '×' + p.qty + (p.purchased ? ' · buy' : '');
    row.append(chip, mid, qty);
    rows.appendChild(row);
  }
  // Each hardware row carries its own commission line (above); Amazon's own
  // sentence is the page's #paid-note line (updatePaidNote), shown while the
  // chips are on screen. What stays here is the shopping tip.
  if (manifest.parts.some(p => !p.styleHidden && p.links?.buy)) {
    const tip = document.createElement('div');
    tip.className = 'fm-note';
    tip.textContent = 'Any equivalent hardware from any store works.';
    rows.appendChild(tip);
  }
  $('checklist-title').textContent = build ? 'Your build' : 'Parts list';
  // "can I build this today?" rides the counter that was already here rather
  // than adding a row (Joey 2026-07-24): only REQUIRED buys count, so a
  // print-only build simply shows nothing extra — the cleaner line IS the
  // reward. Opt-in magnets never trip it.
  // !styleHidden: the M3 screws are REQUIRED under a bolt-on family but their
  // row hides under an integrated-grip one — the counter must follow (a
  // Classic/EdgeLabel swap on a static kit used to keep saying "8 to buy")
  /* THE HEAD NAMES ITS TIER. Two readings of "to buy" are both true and used
     to collide in one number: "hardware this build cannot be finished without"
     (Joey, 2026-07-24 - opt-in magnets must not trip it, or the starter kits'
     print-and-build-today promise reads as false) and "hardware this plan as
     configured needs" (the contract - instructions must never tell someone to
     skip the magnets they chose). The contract has three tiers precisely so
     that is not a coin-flip: the CORE buys are the minimum, the OPTION buys
     are named for what selected them. Scope is read off the shared contract,
     never off the legacy boolean - `required` is derived from it anyway. */
  const visible = manifest.parts.filter(p => !p.styleHidden);
  const qtyOf = rows => rows.reduce((n, p) => n + p.qty, 0);
  const classified = visible.filter(p => p.requirement);
  const coreBuy = qtyOf(REQ.minimumRows(classified).filter(p => p.purchased));
  // purchased rows an OPTION selected (core + option = selected plan, minus core)
  const optionBuyRows = REQ.selectedPlanRows(classified).filter(p => p.purchased && p.requirement.scope === 'option');
  const optionBuy = qtyOf(optionBuyRows);
  // ⚠ legacy rows (no requirement yet) keep the old rule so the ratchet, not a
  // silent re-classification, decides when they move
  const legacyBuy = qtyOf(visible.filter(p => !p.requirement && p.purchased && p.required));
  const mustBuy = coreBuy + legacyBuy;
  // "with magnetic closure" - the explanation comes from the contract, so it
  // says the same thing here as on the site's cards
  const optionWhy = optionBuyRows.length
    ? REQ.explain(optionBuyRows[0], OPTION_LABELS).replace(/^Required /, '') : '';
  $('parts-head').innerHTML = `🧩 ${total} to print`
    + (mustBuy ? ` · ${HW_ICON} ${mustBuy} to buy` : '')
    + (optionBuy ? ` · ${optionBuy} ${optionWhy}` : '');
  $('checklist-tab').textContent = `Parts · ${total}`;
}

// Narrow screens get the bottom-sheet layout (matches the CSS breakpoint): the
// parts list defaults to minimized and the parts/identify sheets are mutually
// exclusive so they never overlap at the bottom.
const isMobile = () => matchMedia('(max-width: 560px)').matches;

// BOM widget: expanded on the checklist step and the final step, minimized to
// a side tab everywhere else — the user can toggle it on any step.
function setChecklist(open) {
  schedulePaidNote(); // its buy chips show or hide with it
  $('checklist-panel').classList.toggle('hidden', !open);
  $('checklist-tab').classList.toggle('hidden', open);
  document.body.classList.toggle('panel-open', open); // narrow embed: the note yields while the panel is open (CSS one-sheet rule)
}

// Embed "preview" landing (docked split view only): the finished build as a
// live model — orbit, tap-to-identify, recolor — with the step chrome hidden
// (body.embed-preview CSS). It rides the FINAL assembly step's state rather
// than being a new page, so dims/identify/colors all just work; regenerate()
// re-lands on the (new) final step while it's active. One-way for now: "Begin
// the instructions" enters the normal cover → steps flow.
let previewMode = false;
function setPreview(on) {
  previewMode = !!on && IS_EMBED;
  document.body.classList.toggle('embed-preview', previewMode);
}

// ---------- BOM export (mirrors the planner's Copy / CSV actions) ----------
function bomRows() {
  return manifest.parts.filter(p => p.qty > 0 && !p.styleHidden).map(p => ({
    qty: p.qty,
    name: p.label + (p.purchased ? ' (buy)' : ''),
    note: p.note || '',   // an alternative or condition the label can't carry
    printables: p.links?.p || '',
    thangs: p.links?.t || '',
  }));
}
function copyBom() {
  let txt = `${manifest.title}\n3D assembly instructions · jerrari3d.com\n`;
  for (const r of bomRows()) {
    txt += `\n${r.qty}× ${r.name}\n`;
    if (r.note) txt += `    ${r.note}\n`;
    if (r.printables) txt += `    Printables: ${r.printables}\n`;
    if (r.thangs) txt += `    Thangs:     ${r.thangs}\n`;
  }
  navigator.clipboard.writeText(txt).then(() => { track('bom:copy'); flashBtn('bom-copy', '✓ Copied!'); });
}
function downloadCsv() {
  track('bom:csv');
  const esc = s => `"${String(s).replace(/"/g, '""')}"`;
  let csv = 'Qty,Part,Note,Printables,Thangs\n';
  for (const r of bomRows()) csv += [r.qty, esc(r.name), esc(r.note), esc(r.printables), esc(r.thangs)].join(',') + '\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `gen2-${manifest.collection || 'build'}-parts.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function flashBtn(id, msg) {
  const b = $(id), prev = b.textContent;
  b.textContent = msg;
  setTimeout(() => { b.textContent = prev; }, 1600);
}
$('bom-copy').onclick = copyBom;
$('bom-csv').onclick = downloadCsv;

function goTo(i, { animate = true } = {}) {
  setSelected(null); // a highlighted part may hide or move between steps
  setPaused(false);  // paging is an implicit resume — a frozen new step reads as broken
  setMeasure(false); // parts move between steps — a measurement would go stale
  fpEnv.target = 1;  // a step-scripted `room: 0` (faceplate cinematic) must not outlive its page
  closeFilamentMenu(false); // parts move on a page change; selection is handled below
  stopCinema();
  // an in-progress layout has exactly one page - its preview - whatever was
  // asked for (the cover, a keyboard Next, a restored index): no cover, no
  // intro, no outro for a kit that is not finished
  if (manifest.incomplete) i = manifest.steps.length;
  cur = Math.max(0, Math.min(PAGES.length - 1, i));
  ghostGroup.visible = !!manifest.incomplete && cur === manifest.steps.length;
  const page = PAGES[cur];
  const isCover = !!page.cover, isOutro = !!page.outro;
  $('cover-overlay').classList.toggle('hidden', !isCover);
  $('cover-bg').classList.toggle('show', isCover); // premium cover backdrop fades out into the normal bg on page 2
  $('outro-overlay').classList.toggle('hidden', !isOutro);
  $('controls').classList.toggle('hidden', isCover);
  $('note-panel').classList.toggle('hidden', isCover || isOutro);
  $('measure-toggle').classList.toggle('hidden', isCover || isOutro);
  setDims(!isCover && !isOutro && cur - 1 === manifest.steps.length - 1); // W/H/L callouts on the fully-assembled final step
  // the "tap any part" hint only rides the exploded intro page — and once it
  // has been seen there, paging anywhere else counts as dismissal (it never
  // re-appears on a return visit; ✕ and scene interaction dismiss it too)
  const onChecklist = !isCover && !isOutro && !!manifest.steps[cur - 1]?.checklist;
  const showHint = onChecklist && !tapHintDismissed;
  if (tapHintShown && !showHint) tapHintDismissed = true;
  if (showHint) tapHintShown = true;
  $('tap-hint').classList.toggle('hidden', !showHint);
  dots.forEach((d, n) => d.classList.toggle('on', n <= cur));
  updateColorToggle();
  if (isCover) {
    $('step-counter').textContent = '';
    setCamOverride(false); // the cover owns the camera — reset any user override
    setChecklist(false);
    $('checklist-tab').classList.add('hidden'); // cover stays clean
    renderCoverBadges(); // box-art series + stat badges (fresh after a regenerate)
    animToken++;
    camTweenToken++;
    const preset = applyCover();
    // record it like tweenCamera would — otherwise resize() (which ALWAYS
    // fires entering the flow in the embed: the controls footer appears and
    // reshapes the canvas) re-fits to the PREVIOUS page's preset and strands
    // the cover on a mis-aimed telephoto (Joey's dock repro, 2026-07-19)
    curCamPreset = preset;
    const { pos, target } = camPos(preset);
    camera.position.copy(pos);
    controls.target.copy(target);
    camera.fov = preset.fov;
    camera.updateProjectionMatrix();
    return;
  }
  if (isOutro) {
    trackOnce('outro'); // they sat through the whole thing
    $('step-counter').textContent = 'Thanks for building';
    setCamOverride(false); // the cinema owns the camera
    $('btn-pause').disabled = true; // the cinema runs its own clock — not pausable
    setChecklist(!isMobile() && !IS_EMBED); // desktop finale shows the full list; mobile AND the narrow dock keep it one tap away (less clutter)
    $('btn-prev').disabled = false;
    $('btn-next').disabled = true;
    animToken++;
    camTweenToken++;
    applyState(manifest.steps.length - 1); // the finished build stars in its own credits
    startCinema();
    return;
  }
  const stepIdx = cur - 1;
  const step = manifest.steps[stepIdx];
  // The drop-off curve: the step where the count falls off a cliff is a broken
  // instruction. Once per page session only — Back, replay and regenerate() all
  // re-enter goTo, and a step counted twice makes the curve meaningless.
  trackOnce(step.checklist ? 'step:intro' : 'step:' + stepIdx);
  if (stepIdx === manifest.steps.length - 1) trackOnce('complete');
  $('step-title').textContent = step.title;
  $('step-note').textContent = step.note || '';
  const numbered = !step.checklist; // assembly steps count from 1, intro shows none
  $('step-num').classList.toggle('hidden', !numbered);
  $('step-num').textContent = numbered ? stepIdx : '';
  $('step-counter').textContent = numbered ? `Step ${stepIdx} / ${manifest.steps.length - 1}` : 'Intro';
  // the checklist/final auto-expand is a WIDE-desktop luxury: mobile and the
  // narrow embed dock keep the panel folded to its tab (in the dock the
  // planner's own BOM sits right alongside anyway — Joey's overlap repro)
  setChecklist((!!step.checklist || stepIdx === manifest.steps.length - 1) && !isMobile() && !IS_EMBED);
  $('btn-prev').disabled = false;
  $('btn-next').disabled = cur === PAGES.length - 1;
  $('btn-pause').disabled = false;
  if (animate) playStep(stepIdx);
  else {
    animToken++;
    if (step.checklist) applyExploded(); else applyState(stepIdx);
    tweenCamera(step.camera);
  }
}

$('btn-prev').onclick = () => goTo(cur - 1, { animate: false });
$('btn-next').onclick = () => goTo(cur + 1);
// The study tools all report as `tool:<name>`, and — like tool:measure — only
// when TURNED ON. These are "is this feature worth its maintenance and its
// space in the controls row" questions, so a session that used slow-motion
// once counts the same as one that toggled it five times.
$('btn-replay').onclick = () => { track('tool:replay'); goTo(cur); };
// collapse the step text to its number badge (session-sticky across steps) —
// reclaims the canvas while recoloring/inspecting on small screens
$('note-collapse').onclick = () => {
  const collapsed = $('note-panel').classList.toggle('collapsed');
  if (collapsed) track('tool:note-collapse'); // only the "put it away" direction
  // expanded shows ✕ ("put this text away"), collapsed shows ▸ ("bring it back")
  $('note-collapse').innerHTML = collapsed ? '&#9656;' : '&#10005;';
  $('note-collapse').title = collapsed ? 'Show the step text' : 'Collapse the step text';
};
$('btn-slow').onclick = () => {
  slowmo = !slowmo;
  if (slowmo) track('tool:slow');
  $('btn-slow').classList.toggle('on', slowmo);
};
function setPaused(on) {
  paused = on;
  const b = $('btn-pause');
  b.classList.toggle('on', on);
  b.querySelector('i').textContent = on ? '▶' : '⏸';
  b.querySelector('span').textContent = on ? 'Play' : 'Pause';
}
$('btn-pause').onclick = () => { if (!paused) track('tool:pause'); setPaused(!paused); };
// google-maps-style "re-center": drop the user override and glide back to
// wherever the guided camera last wanted to be.
$('btn-cam').onclick = () => { setCamOverride(false); tweenCamera(curCamPreset, 900, true); };
$('btn-start').onclick = () => { track('start'); goTo(1); }; // cover → intro, camera pans + de-zooms
// customizers' shortcut: straight to the finished build (final assembly step —
// dims + expanded BOM), skipping the step-by-step. Snap, don't replay the step.
$('btn-skip-end').onclick = () => { track('skip-to-end'); goTo(PAGES.length - 2, { animate: false }); };
// Official kits only: "Customize this build" (cover + outro) — the on-ramp to
// the planner. Hands over the CURRENT build (option tweaks ride along) as a
// #build= hash the planner sanitizes + restores. Raw base64, NOT
// percent-encoded — the planner's decode has no decodeURIComponent, so an
// encoded hash would silently fail there.
const PLANNER_URL = 'https://gen2planner.jerrari3d.com/';
// ?theme=&tt= rides along so the planner (a separate origin) can adopt the
// light/dark choice; the query goes BEFORE the hash — the planner's decoder
// reads location.hash and never sees it.
const themeQS = () => {
  try {
    const v = localStorage.getItem('gen2-theme');
    if (v !== 'dark' && v !== 'light') return '';
    return '?theme=' + v + '&tt=' + encodeURIComponent(localStorage.getItem('gen2-theme:t') || '0');
  } catch (e) { return ''; }
};
const plannerHandoffUrl = () => PLANNER_URL + themeQS() + '#build=' + btoa(unescape(encodeURIComponent(JSON.stringify(build))));
if (OFFICIAL) {
  const cover = $('btn-customize');
  cover.classList.remove('hidden');
  cover.onclick = () => { track('customize:cover'); window.open(plannerHandoffUrl(), '_blank', 'noopener'); };
  const outro = $('outro-customize');
  outro.classList.remove('hidden');
  // anchor: freshen the href as the click starts (build mutates with options)
  outro.addEventListener('click', () => { track('customize:outro'); outro.href = plannerHandoffUrl(); });

  /* THE PINNED LINK. `/` is a live promise ("the current recommended starter")
     and never rewrites itself, so copying the address bar there deliberately
     does NOT give you this kit. This button is the other semantic, offered
     explicitly rather than smuggled into the URL: it always opens THIS id.
     Built from OFFICIAL.id, not from location.search, so it is correct whether
     the visitor arrived at the root or at an explicit ?build=. ?from=/?debug=/
     ?theme= are intentionally dropped - a shared link should carry the kit and
     nothing about the sharer's session or store attribution. */
  const copyBtn = $('btn-copylink');
  copyBtn.classList.remove('hidden');
  /* ⚠ location.origin is the string "null" under file://, which would mint a
     link reading "null/?build=..." - so build the base from href instead and
     strip the query/hash off it. */
  const kitLink = () => location.href.split('#')[0].split('?')[0] + '?build=' + encodeURIComponent(OFFICIAL.id);

  /* ⚠ THE FALLBACK IS A REAL FIELD, NOT BUTTON TEXT. A first version put the
     URL into the button's own label for eight seconds - which is not reliably
     selectable by keyboard or touch, and pressing it again just retried the
     copy instead of selecting anything. navigator.clipboard needs a secure
     context, so plain http and file:// land here routinely; it has to be a
     dead end for nobody. */
  const manual = document.createElement('input');
  manual.type = 'text';
  manual.readOnly = true;
  manual.className = 'copy-fallback hidden';
  manual.setAttribute('aria-label', 'Link to this kit - copy it manually');
  manual.onfocus = () => manual.select();
  copyBtn.insertAdjacentElement('afterend', manual);

  const say = (msg) => {
    copyBtn.textContent = msg;
    clearTimeout(copyBtn._t);
    copyBtn._t = setTimeout(() => { copyBtn.innerHTML = '🔗 Copy link to this kit'; }, 2200);
  };
  copyBtn.onclick = async () => {
    const url = kitLink();
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error('no clipboard');
      await navigator.clipboard.writeText(url);
      manual.classList.add('hidden');
      say('✓ Link copied');
    } catch (e) {
      // hand them the text, focused and selected, so ⌘C/Ctrl-C just works
      manual.value = url;
      manual.classList.remove('hidden');
      manual.focus();
      manual.select();
      say('Copy it from here →');
    }
    track('share:kit-link');
  };
}
// embed preview ⇄ the instruction flow: "Begin" enters at the cover;
// the 🧪 Preview tool (embed-only, controls bar — hidden on the preview
// itself since the whole bar is) re-runs the boot landing from any step.
$('embed-begin').onclick = () => { setPreview(false); goTo(0); };
const enterPreview = () => {
  goTo(PAGES.length - 2, { animate: false }); // the finished build, snapped
  setChecklist(false);
  setPreview(true);
};
$('btn-preview').onclick = enterPreview;   // controls-bar tool (any step)
$('cover-preview').onclick = enterPreview; // the cover's way back (replaces the skip link in embed)
// one-time orbit hint on the embed preview (the tap-hint's quieter cousin);
// dismissed by first touch or a few seconds, remembered per device
if (IS_EMBED) {
  let hintSeen = false;
  try { hintSeen = !!localStorage.getItem('gen2-embed-hint'); } catch (e) { /* private mode */ }
  if (!hintSeen) {
    document.body.classList.add('embed-hint-on');
    const hintOff = () => {
      document.body.classList.remove('embed-hint-on');
      try { localStorage.setItem('gen2-embed-hint', '1'); } catch (e) { /* private mode */ }
      canvas.removeEventListener('pointerdown', hintOff);
    };
    canvas.addEventListener('pointerdown', hintOff);
    setTimeout(hintOff, 9000);
  }
}
$('checklist-tab').onclick = () => { if (isMobile()) setSelected(null); setChecklist(true); };
$('checklist-close').onclick = () => setChecklist(false);
let tapHintDismissed = false, tapHintShown = false;
const dismissTapHint = () => { if (!tapHintDismissed) { tapHintDismissed = true; $('tap-hint').classList.add('hidden'); } };
$('tap-hint-x').onclick = dismissTapHint;
// any interaction with the viewer counts as "got it": the first pointerdown
// anywhere — canvas orbit, the Parts/colors/Measure pills, the panel, the
// controls bar — retires the hint for the session (Joey: it lingered over
// the parts panel in the dock until its ✕ was hunted down)
document.addEventListener('pointerdown', () => { if (tapHintShown) dismissTapHint(); }, { capture: true });
// the moment the user touches the scene — a tap, an orbit, a zoom — they're
// already doing what the hint teaches, so it bows out (controls fires 'start'
// for every pointer/wheel interaction on the canvas)
controls.addEventListener('start', dismissTapHint);
addEventListener('keydown', e => {
  if (IS_PART) return; // the preview has no pages — arrows must not walk into the step machinery
  if (IS_BENCH) return; // nor the benchmark: one stray arrow mid-run would page to the outro and time a different workload
  if (e.key === 'ArrowRight') goTo(cur + 1);
  if (e.key === 'ArrowLeft') goTo(cur - 1, { animate: false });
});

// tap a part to identify it: the part lights up and an info card shows its
// name, kit quantity, and download links (tap empty space to dismiss).
// Suppressed when the pointer dragged (= orbiting).
const ray = new THREE.Raycaster();
const DEBUG_ON = !!new URLSearchParams(location.search).get('debug'); // ?debug=1 — same flag as the __GEN2_VIEWER__ hook
let downXY = null, selectedId = null;
const highlightMats = {}, altHighlightMats = {}; // (type | type:zone) -> emissive clone (base / lightened tile)
/* PLANNED parts (2026-08-23): a cover tile the generator marked `planned`
   sits over a column that is not built up yet, so it cannot attach today. It
   renders as a translucent clone of the material it would otherwise wear -
   colour copied from the registry entry on every applyPalette, so a filament
   pick repaints it like any other cover - with its RESTING opacity stamped,
   which is what keeps every fade in this engine honest about it. A separate
   registry, so the shared opaque material is never mutated. */
const PLANNED_OPACITY = 0.35;
const plannedMats = {}, plannedHighlightMats = {}; // cacheKey -> { mat, src }
function plannedMatFor(src, cacheKey) {
  if (!plannedMats[cacheKey]) {
    const m = cloneMaterial(src);
    m.transparent = true; m.opacity = PLANNED_OPACITY; m.userData.rest = PLANNED_OPACITY;
    plannedMats[cacheKey] = { mat: m, src };
  }
  return plannedMats[cacheKey].mat;
}
function materialFor(inst, highlighted, zone = '') {
  const type = typeByNode[inst.cfg.node];
  const key = zoneKey(type, zone);
  const solid = (inst.alt && !zone) ? altMatFor(type) : baseMatFor(type, zone); // zoned types aren't tiled — alt is a body-only concept
  const planned = !!inst.cfg.planned;
  const pKey = key + (inst.alt && !zone ? '|alt' : '');
  const base = planned ? plannedMatFor(solid, pKey) : solid;
  if (!highlighted) return base;
  if (planned) {
    if (!plannedHighlightMats[pKey]) {
      const m = cloneMaterial(base);
      m.emissive = new THREE.Color(0xff8a40); m.emissiveIntensity = 0.4;
      plannedHighlightMats[pKey] = { mat: m, src: solid };
    }
    return plannedHighlightMats[pKey].mat;
  }
  const cache = (inst.alt && !zone) ? altHighlightMats : highlightMats;
  if (!cache[key]) {
    const m = cloneMaterial(base);
    m.emissive = new THREE.Color(0xff8a40);
    m.emissiveIntensity = 0.4;
    cache[key] = m;
  }
  return cache[key];
}
// selecting a seated drawer (or anything riding it — faceplate, handle, clip)
// slides it open 40 mm like a real drawer; deselecting slides it shut
let openCarrier = null;
function drawerCarrier(inst) {
  if (typeByNode[inst.cfg.node] === 'Drawer') return inst;
  if (inst.cfg.rides && instances.has(inst.cfg.rides)) {
    const c = instances.get(inst.cfg.rides);
    if (typeByNode[c.cfg.node] === 'Drawer') return c;
  }
  return null;
}
function slideDrawer(carrier, open, dist = 40) {
  const group = [carrier, ...[...instances.values()].filter(x => x.cfg.rides === carrier.cfg.id)];
  for (const i of group) {
    const to = basePos(i, i.staged);
    if (open) to.z += dist;
    const fromV = i.group.position.clone();
    tween({ duration: open ? 380 : 320, onUpdate: k => i.group.position.lerpVectors(fromV, to, k) });
  }
}
// Selection "removal rituals": some parts glide through world-space waypoints
// when selected — the "this part swaps/removes" demo — and back in exact
// reverse on deselect. The tween rides the group's INNER child, so it composes
// with drawer peeks/slides and step motion (those drive the group itself);
// waypoints map through the INVERSE group rotation (accents are group-rotated
// 180°), applyState/applyExploded zero the child as kill-tween self-heal, and
// a PER-INSTANCE token cancels that part's stale chain when its direction
// flips mid-ritual (per-instance, NOT global — switching accent→label runs
// the accent's reseat and the label's lift CONCURRENTLY) — an interrupted
// reattach glides straight home instead of replaying steps it never reached.
const RITUALS = {
  Label:     { path: [[0, 20, 0]],               durs: [420] },      // lift out of its window
  Accent:    { path: [[0, -4, 0], [0, -4, 20]],  durs: [260, 380] }, // drop off its clips, pull away
  BackCover: { path: [[0, 4, 0], [0, 4, -20]],   durs: [240, 380] }, // lift off its hooks, draw back
};
// per-NODE overrides where a family's seat differs from the type default:
// the Classic Pro label lives in an ANGLED slot on the grip slope — it
// removes by sliding 45° up-and-back along the slope (front → back), and
// reseats down-and-forward, matching the cinematic's diagonal (Joey 2026-07-13)
const NODE_RITUALS = {
  Label_ClassicPro: { path: [[0, 16, -16]], durs: [420] },
};
let ritualInst = null; // the part the CURRENT selection popped (selection is single)
async function slideRitual(inst, out, delay = 0) {
  const r = NODE_RITUALS[inst.cfg.node] || RITUALS[typeByNode[inst.cfg.node]];
  const child = inst.group.children[0];
  if (!r || !child) return;
  const my = inst._ritualTok = (inst._ritualTok || 0) + 1;
  const inv = inst.group.quaternion.clone().invert();
  const toLocal = p => new THREE.Vector3(...p).applyQuaternion(inv);
  let targets = r.path, durs = r.durs;
  if (!out) {
    const atEnd = child.position.distanceTo(toLocal(r.path[r.path.length - 1])) < 0.5;
    if (atEnd) { targets = [...r.path.slice(0, -1)].reverse().concat([[0, 0, 0]]); durs = [...r.durs].reverse(); }
    else { targets = [[0, 0, 0]]; durs = [400]; } // interrupted mid-ritual → one clean glide home
  }
  for (let s = 0; s < targets.length; s++) {
    if (my !== inst._ritualTok) return;
    const from = child.position.clone(), to = toLocal(targets[s]);
    await tween({ duration: durs[s], delay: s === 0 ? delay : 0,
      onUpdate: k => { if (my === inst._ritualTok) child.position.lerpVectors(from, to, k); } });
  }
}

// 2-zone parts (EdgeLabel body+grip): the identify card offers one labeled
// swatch per color zone — Body (the base type key) + each named zone (Grip,
// 'Type:ZONE' key) — every chip opening the same filament menu on its own key.
// Single-zone parts hide the row (the header swatch already covers them).
function renderZoneChips(inst) {
  const box = $('identify-zones');
  box.innerHTML = '';
  const type = typeByNode[inst.cfg.node];
  const zones = new Set();
  inst.group.traverse(o => { if (o.isMesh && o.userData.zone) zones.add(o.userData.zone); });
  const show = zones.size > 0 && !colorLocked(type);
  box.classList.toggle('hidden', !show);
  if (!show) return;
  const menuOpen = !$('filament-menu').classList.contains('hidden');
  const chip = (label, key, tip) => {
    const b = document.createElement('button');
    b.className = 'zone-chip' + (menuOpen && fmType === key ? ' on' : '');
    const dot = document.createElement('i');
    dot.style.background = activeHex(key);
    b.appendChild(dot);
    b.appendChild(document.createTextNode(label));
    b.title = tip || `Pick a filament color for the ${label.toLowerCase()}`;
    // clicking the chip you're already editing closes the picker (there was no
    // reliable way to dismiss it); any other chip RE-TARGETS without closing
    b.onclick = () => { (menuOpen && fmType === key) ? closeFilamentMenu() : openFilamentMenu(key); };
    box.appendChild(b);
  };
  // Tooltips are STATE-first (Joey 2026-08-07): the chip visibly IS a colour
  // picker, so the hover's job is the one thing you can't see — WHICH filament
  // the zone is wearing. An explicit pick shows its name; an untouched zone
  // says "follows Body" (the one-identification-colour-per-part rule, which
  // read as a bug until it was named — Joey 2026-07-25); static kits' own
  // zone colours and the instruction palette say so honestly.
  const wornName = key => (useCustom && customColors[key]) ? customColors[key].name : null;
  const inherits = [...zones].filter(z => !(useCustom && customColors[zoneKey(type, z)]) && !manifest.colors[zoneKey(type, z)]);
  const bodyName = wornName(type);
  chip('Body', type, [
    bodyName ? `Body - ${bodyName}` : 'Body - instruction colour',
    inherits.length
      ? `also repaints the zones you haven’t picked yet (${inherits.map(z => z.toLowerCase()).join(', ')})`
      : 'click to change',
  ].join(' · '));
  for (const z of [...zones].sort()) {
    const key = zoneKey(type, z);
    const label = z.charAt(0) + z.slice(1).toLowerCase();
    const own = wornName(key);
    const tip = own ? `${label} - ${own} · click to change`
      : manifest.colors[key] ? `${label} - this kit’s colour · click to pick a filament`
      : bodyName ? `${label} - follows Body (${bodyName}) · click to change`
      : `${label} - instruction colour · click to pick a filament`;
    chip(label, key, tip);
  }
}

let selAnchor = new THREE.Vector3(); // selected part's bbox-center offset from its origin
/* The shelf whose lip the identify card is editing (null when the selection is
   anything else). Assigned in setSelected, read by cycleLip further down.
   ⚠ DECLARED HERE, ABOVE its assignment, on purpose: setSelected runs during
   boot (regenerate calls it with null), and a `let` still in its temporal dead
   zone throws a ReferenceError that takes the entire boot down — the same trap
   the #btn-theme wiring hit. */
let lipUnit = null;
/* The Decor drawer whose Standard / Gridfinity body the identify card is
   switching (null otherwise). Assigned in setSelected, read by cycleVariant.
   Declared up here for the same TDZ reason as lipUnit. */
let variantUnit = null;
function setSelected(id) {
  if (selectedId === id) return;
  schedulePaidNote(); // the card's paid links come and go with the selection
  // "did they discover tap-to-identify at all" — once per session, because the
  // answer is a yes/no about the feature, not a per-tap volume metric
  if (id) trackOnce('identify:open');
  if (selectedId && instances.has(selectedId)) {
    const prev = instances.get(selectedId);
    prev.group.traverse(o => { if (o.isMesh) o.material = materialFor(prev, false, o.userData.zone); });
  }
  const prevOpen = openCarrier; openCarrier = null; // may re-pull the SAME drawer further below
  selectedId = id;
  closeFilamentMenu(false); // the new selection's own glow is applied just below
  const card = $('identify-card');
  if (ritualInst && (!id || !instances.has(id) || instances.get(id) !== ritualInst)) {
    slideRitual(ritualInst, false); // label/accent/cover reseats in reverse on deselect/switch
    ritualInst = null;
  }
  if (!id) { if (prevOpen) slideDrawer(prevOpen, false); exitFaceplateFocus(); exitDrawerFocus(); card.classList.add('hidden'); $('pointer-line').classList.add('hidden'); return; }
  if (isMobile() || IS_EMBED) setChecklist(false); // mobile + narrow dock: parts list & identify card are mutually exclusive
  const inst = instances.get(id);
  inst.group.traverse(o => { if (o.isMesh) o.material = materialFor(inst, selGlow(inst), o.userData.zone); });
  selAnchor = new THREE.Box3().setFromObject(inst.group).getCenter(new THREE.Vector3()).sub(inst.group.position);
  const info = partInfoByNode[inst.cfg.node] || { label: inst.cfg.node, qty: '?' };
  const selType = typeByNode[inst.cfg.node];
  // WHICH parts people inspect — "are faceplates even being looked at" is the
  // question the Club upsell rests on. Once per type per session, like
  // identify:open above: that reads as "what share of sessions examined a
  // faceplate", where a raw tap count would just surface whoever clicked most.
  // selType is a fixed vocabulary (the manifest's part types), never user text.
  if (selType) trackOnce('identify:' + String(selType).toLowerCase());
  const selLocked = colorLocked(selType); // purchased hardware: swatch is a plain color dot, not a picker
  const sw = $('identify-swatch');
  const selKey = primaryKey(inst.cfg.node); // the visible front, not the hidden base
  sw.style.background = activeHex(selKey);
  sw.classList.toggle('locked', selLocked);
  sw.title = selLocked
      ? 'Hardware-store item · shown in its real finish'
    : selKey !== selType ? 'Pick the face filament · the chips below cover every zone'
    : 'Pick a filament color';
  renderZoneChips(inst); // 2-zone parts get Body + Grip swatches; others hide the row
  // the swappable label's card links to the label generator (pre-filled with
  // the build's typed labels — the same #labels= handoff the planner's button
  // uses); the 20 mm lift itself starts down in the drawer block, so the
  // drawer peek can glide out FIRST
  const lg = $('identify-label-gen');
  const lgInfo = selType === 'Label' ? labelGenInfo() : null;
  lg.classList.toggle('hidden', !lgInfo);
  if (lgInfo) {
    lg.href = lgInfo.href;
    lg.textContent = `🏷 Design your labels${lgInfo.count ? ` · ${lgInfo.count} ready` : ''} →`;
  }
  $('identify-name').textContent = info.label;
  $('identify-qty').textContent = `×${info.qty} in this kit` +
    (!selLocked && customColors[selType] ? ` · ${customColors[selType].name}` : '');
  // ?debug=1 calibration readout: the instance's MANIFEST position (the exact
  // numbers generate.js placed it with — hand these back to shift a part) +
  // its world bbox size. Complements the measure tool for offset work.
  const dbg = $('identify-debug');
  if (DEBUG_ON) {
    const size = new THREE.Box3().setFromObject(inst.group).getSize(new THREE.Vector3());
    dbg.textContent = `pos [${inst.cfg.pos.map(n => +(+n).toFixed(2)).join(', ')}]` +
      (inst.cfg.yaw ? ` · yaw ${inst.cfg.yaw}°` : '') +
      ` · ${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)} mm`;
    dbg.classList.remove('hidden');
  } else dbg.classList.add('hidden');
  const img = $('identify-img');
  if (info.img) { img.onerror = () => img.classList.add('hidden'); img.src = info.img; img.classList.remove('hidden'); } // hide if the render 404s (e.g. 165 has no renders yet)
  else img.classList.add('hidden');
  renderIdentifyLinks(info, !selLocked && customColors[selType] ? customColors[selType] : null);
  // handles get a style switcher (Deco / BlockBar A–F); faceplates get the
  // family switcher (Essential / EdgeLabel) when this collection has >1 family
  if (typeByNode[inst.cfg.node] === 'Handle') {
    const idx = currentHandleStyleIndex();
    $('style-name').textContent = idx >= 0 ? HANDLE_STYLES[idx].label : '?';
    $('identify-style').classList.remove('hidden');
  } else if (typeByNode[inst.cfg.node] === 'Faceplate' && availableFaceplateStyles().length > 1 && currentFaceplateStyle()) {
    $('style-name').textContent = currentFaceplateStyle().label;
    $('identify-style').classList.remove('hidden');
  } else {
    $('identify-style').classList.add('hidden');
  }
  // Remove button: ONLY the optional hardware — a magnet clip/magnet (removes
  // that drawer's magnet closure) or a drawer stopper (removes the L+R pair for
  // that 1W). Generated builds only; never cases/drawers/rails/etc.
  const rmType = typeByNode[inst.cfg.node];
  const removable = build && (
    ((rmType === 'MagnetClip' || rmType === 'Magnet') && inst.cfg.owner != null) ||
    (rmType === 'Stopper' && inst.cfg.stopperKey));
  const rmBtn = $('identify-remove');
  rmBtn.classList.toggle('hidden', !removable);
  if (removable) rmBtn.textContent = rmType === 'Stopper' ? '✕ Remove this stopper' : '✕ Remove magnet closure';
  /* Shelf lip ◀▶ — offered on the insert AND on a lip itself, because the lip
     is the thing you tap when you want rid of it. Generated builds only: a
     static kit has no `build` to mutate. */
  lipUnit = (build && (rmType === 'ShelfInsert' || rmType === 'ShelfLip') && inst.cfg.owner != null)
    ? build.placed.find(p => p.id === inst.cfg.owner && p.fill === 'shelf') : null;
  $('identify-lip').classList.toggle('hidden', !lipUnit);
  if (lipUnit) $('lip-name').textContent = SHELF_LIP_LABEL[lipUnit.lip ?? null];
  /* Standard / Gridfinity ◀▶ — on a Decor drawer BODY whose size has a
     Gridfinity version (115-270, 1H / 1.5H / 2H). The drawer instance names its
     planner unit in `owner`. Generated builds only. */
  variantUnit = (build && rmType === 'Drawer' && inst.cfg.owner != null)
    ? build.placed.find(p => p.id === inst.cfg.owner && gridfinitySizeOk(+build.length, p)) || null : null;
  $('identify-variant').classList.toggle('hidden', !variantUnit);
  if (variantUnit) $('variant-name').textContent = variantUnit.variant === 'gridfinity' ? 'Gridfinity drawer' : 'Standard drawer';
  card.classList.remove('hidden');
  // drawer-open interaction (assembled scenes only — the drawer must be resting
  // in its FINAL seat, not staged or mid-step). Selecting the drawer BODY pulls
  // it ~90% of the safe travel (case depth − 20 mm rear engagement) so its
  // colour/interior reads clearly; selecting a rider (faceplate/handle/clip/
  // magnet) pulls just 40 mm — enough to expose the body for tapping. prevOpen
  // counts as seated (we opened it from base), so a faceplate→body reselect
  // re-pulls the SAME drawer further instead of snapping it shut first.
  const carrier = drawerCarrier(inst);
  // NB the isolation HIDES fully-faded parts — a carrier hidden by the focus
  // (it's in fpFocus.mats) is still present on this step, unlike one hidden by
  // paging; without this, "Open the drawer" dies once the fade-out completes
  const seatable = carrier && !carrier.staged && (carrier.group.visible || fpFocus.mats.has(carrier.cfg.id)) &&
    (carrier === prevOpen || carrier.group.position.distanceTo(basePos(carrier, false)) < 0.01);
  // faceplates get an ISOLATION view instead of the old 40 mm rider peek: the
  // rest of the build + the room fade away and the camera frames the plate.
  // The card's "Open the drawer" button is the hand-off into the drawer-body
  // focus the peek used to lead to; "Close drawer" is the obvious way back out.
  const isFp = selType === 'Faceplate';
  // tapping the focused plate's own dressing (handle / accent / label / cover)
  // keeps the isolation — those pieces are part of the faceplate there (swap
  // styles / recolor each without leaving)
  const keepIso = !!fpFocus.id && !isFp && fpFocus.mates.has(id);
  $('identify-open-drawer').classList.toggle('hidden', !((isFp || keepIso) && seatable));
  $('identify-close-drawer').classList.toggle('hidden', !(seatable && carrier === inst));
  if (prevOpen && (prevOpen !== carrier || isFp)) slideDrawer(prevOpen, false); // switching drawers (or isolating a plate) → shut the old one
  let drawerGliding = false;
  if (seatable && !isFp && !keepIso) {
    const travel = (parseInt(manifest.collection, 10) || 185) - 20;
    // back-cover work happens on an OPEN drawer — selecting it must not yank an
    // already-open drawer back to the 40 mm peek (Joey); anything else follows
    // the normal body → deep pull / rider → peek rule
    const keepOpen = selType === 'BackCover' && carrier === prevOpen;
    if (!keepOpen) {
      const dist = carrier === inst ? travel * 0.9 : 40;
      const target = basePos(carrier, false); target.z += dist;
      drawerGliding = carrier.group.position.distanceTo(target) > 1; // a real glide, not a re-target no-op
      slideDrawer(carrier, true, dist);
    }
    openCarrier = carrier;
  }
  // removal rituals (label lift / accent pop / cover pop) — AFTER the drawer
  // glide lands when one is running (Joey: drawer out first, then the part);
  // immediate when nothing moved (isolation tap, exploded page, open drawer)
  if (RITUALS[selType] && ritualInst !== inst) {
    slideRitual(inst, true, drawerGliding ? 420 : 0);
    ritualInst = inst;
  }
  // drawer BODY selected → zoom into the open drawer + show its inner dims;
  // faceplate → isolation focus; the focused plate's handle stays inside the
  // isolation; anything else leaves/never enters either focus
  if (isFp) {
    exitDrawerFocus(true); // keep the saved pose — the faceplate focus adopts it
    enterFaceplateFocus(inst, seatable);
  } else if (!keepIso) {
    exitFaceplateFocus();
    if (seatable && carrier === inst) enterDrawerFocus(carrier);
    else exitDrawerFocus();
  }
  // the highlight emissive, the pointer line and the drawer/faceplate focus all
  // change the picture without moving the camera or the step
  invalidateFrame();
}

// ---------- drawer focus: camera zoom + INNER dimensions ----------
// Selecting a drawer BODY (the deep pull above) swings the camera to a
// front-above 3/4 on the open drawer — floor and back wall both readable —
// hides the overall build dims, and shows the drawer's usable INTERIOR
// W / L / H with lines drawn inside the cavity (reusing the dim-label pills;
// the build dims are hidden while focused). Deselect tweens the camera back
// to where it was and brings the build dims back. Interior sizes are MEASURED
// live — raycasts from inside the cavity to its walls/floor — so every drawer
// GLB works without data tables; results are cached per node.
const dFocus = { carrier: null, saved: null, group: null, lines: null, cache: new Map() };
function drawerInterior(carrier) {
  const key = carrier.cfg.node;
  if (dFocus.cache.has(key)) return dFocus.cache.get(key);
  const g = carrier.group;
  const box = new THREE.Box3().setFromObject(g);
  const c = box.getCenter(new THREE.Vector3());
  const cast = (o, dx, dy, dz) => {
    dimRay.set(o, new THREE.Vector3(dx, dy, dz));
    const h = dimRay.intersectObject(g, true)[0];
    return h ? h.point : null;
  };
  // 1) find the cavity floor: straight down from mid-height center
  const D = cast(new THREE.Vector3(c.x, box.min.y + (box.max.y - box.min.y) * 0.55, c.z), 0, -1, 0);
  if (!D) { dFocus.cache.set(key, null); return null; } // odd geometry — skip inner dims
  // 2) walls: cast from just above the floor, where every wall exists — the
  //    decor drawers' FRONT wall is a low lip (the faceplate is the real
  //    front), so a mid-height forward ray flies straight over it
  const o2 = new THREE.Vector3(c.x, D.y + 6, c.z);
  const R = cast(o2, 1, 0, 0), L = cast(o2, -1, 0, 0), B = cast(o2, 0, 0, -1);
  let F = cast(o2, 0, 0, 1);
  if (!R || !L || !B) { dFocus.cache.set(key, null); return null; }
  if (!F) F = new THREE.Vector3(c.x, o2.y, box.max.z - 2); // truly open front → assume a thin lip at the body's front
  const p = g.position; // drawers are unrotated → local = world − position
  const it = { xL: L.x - p.x, xR: R.x - p.x, yF: D.y - p.y, yT: box.max.y - p.y, zB: B.z - p.z, zF: F.z - p.z };
  it.w = it.xR - it.xL; it.d = it.zF - it.zB; it.h = it.yT - it.yF;
  dFocus.cache.set(key, it);
  return it;
}
function enterDrawerFocus(carrier) {
  if (dFocus.carrier === carrier) return;
  exitDrawerFocus(true); // switching drawers: drop the old lines, keep the saved pose
  const it = drawerInterior(carrier);
  if (!it) return;
  dFocus.carrier = carrier;
  if (!dFocus.saved) dFocus.saved = { pos: camera.position.clone(), target: controls.target.clone() };
  setDims(false); // the drawer owns the stage — overall dims come back on exit
  const mmIn = (mm, axis) => `<b>${axis}</b> ${mm.toFixed(0)} mm<small>${(mm / 25.4).toFixed(1)} in</small>`;
  $('dim-w').innerHTML = mmIn(it.w, 'W');
  $('dim-l').innerHTML = mmIn(it.d, 'L');
  $('dim-h').innerHTML = mmIn(it.h, 'H');
  // interior lines live INSIDE the drawer group, so they ride the slide;
  // spread across the cavity so the three pills never crowd each other:
  // W across the floor near the front, L along the floor near the left wall,
  // H up the back wall right of center
  const t = 6, V = (x, y, z) => new THREE.Vector3(x, y, z);
  const segs = [];
  const line = (a, c2, tickDir) => {
    segs.push(a, c2);
    for (const end of [a, c2]) segs.push(end.clone().addScaledVector(tickDir, -t), end.clone().addScaledVector(tickDir, t));
    return { a, c: c2 };
  };
  const yF = it.yF + 1; // floor lines float 1 mm above the floor (no z-fighting)
  dFocus.lines = {
    'dim-w': line(V(it.xL, yF, it.zB + it.d * 0.68), V(it.xR, yF, it.zB + it.d * 0.68), V(0, 0, 1)),
    'dim-l': line(V(it.xL + it.w * 0.24, yF, it.zB), V(it.xL + it.w * 0.24, yF, it.zF), V(1, 0, 0)),
    'dim-h': line(V(it.xL + it.w * 0.76, it.yF, it.zB + 1), V(it.xL + it.w * 0.76, it.yT, it.zB + 1), V(1, 0, 0)),
  };
  const geo = new THREE.BufferGeometry().setFromPoints(segs);
  dFocus.group = new THREE.Group();
  dFocus.group.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: STAGE_THEMES[stageTheme].dim, transparent: true, opacity: 0.9 })));
  carrier.group.add(dFocus.group);
  // camera: frame the drawer's OPEN position from front-above (≈50° down) on
  // whichever side the camera is already on — floor + back wall both visible
  const travel = (parseInt(manifest.collection, 10) || 185) - 20;
  const openPos = basePos(carrier, false); openPos.z += travel * 0.9;
  const target = new THREE.Vector3(openPos.x + (it.xL + it.xR) / 2, openPos.y + (it.yF + it.yT) / 2, openPos.z + (it.zB + it.zF) / 2);
  const s = Math.max(it.w, it.d);
  const side = Math.sign(camera.position.x - target.x) || 1;
  const pos = target.clone().add(new THREE.Vector3(side * s * 0.45, s * 1.5, s * 1.15));
  const my = ++camTweenToken; // cancels tour tweens; paging cancels this one
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  // settle the fov too — cancelling a cover→step tween mid-flight would
  // otherwise strand the cover's telephoto 9 on the drawer close-up
  const fov0 = camera.fov, fov1 = curCamPreset?.fov || 40;
  tween({ duration: 750, onUpdate: k => {
    if (my !== camTweenToken) return;
    camera.position.lerpVectors(p0, pos, k);
    controls.target.lerpVectors(t0, target, k);
    if (fov0 !== fov1) { camera.fov = fov0 + (fov1 - fov0) * k; camera.updateProjectionMatrix(); }
  } });
}
function exitDrawerFocus(keepPose = false) {
  if (dFocus.group) {
    dFocus.group.parent?.remove(dFocus.group);
    dFocus.group.traverse(o => o.geometry?.dispose());
    dFocus.group = null;
  }
  dFocus.lines = null;
  const was = dFocus.carrier;
  dFocus.carrier = null;
  if (!was) return;
  for (const id of ['dim-w', 'dim-h', 'dim-l']) $(id).classList.add('hidden');
  if (keepPose) return; // hopping straight to another drawer — no restore yet
  if (dFocus.saved) { // glide back to wherever the user was before the zoom
    const { pos, target } = dFocus.saved;
    dFocus.saved = null;
    const my = ++camTweenToken;
    const p0 = camera.position.clone(), t0 = controls.target.clone();
    tween({ duration: 650, onUpdate: k => {
      if (my !== camTweenToken) return;
      camera.position.lerpVectors(p0, pos, k);
      controls.target.lerpVectors(t0, target, k);
    } });
  }
  // overall build dims return (only the final assembly step shows them)
  setDims(!PAGES[cur]?.cover && !PAGES[cur]?.outro && cur - 1 === manifest.steps.length - 1);
}
function updateDrawerDims() { // render-loop: pills track their lines while the drawer slides / camera tweens
  if (!dFocus.lines || !dFocus.carrier) return;
  const r = canvas.getBoundingClientRect();
  for (const [id, seg] of Object.entries(dFocus.lines)) {
    const el = $(id);
    const mid = seg.a.clone().add(seg.c).multiplyScalar(0.5).add(dFocus.carrier.group.position).project(camera);
    if (mid.z > 1) { el.classList.add('hidden'); continue; }
    el.style.left = Math.min(Math.max((mid.x + 1) / 2 * r.width, 40), r.width - 40) + 'px';
    el.style.top = Math.min(Math.max((1 - mid.y) / 2 * r.height, 24), r.height - 24) + 'px';
    el.classList.remove('hidden');
  }
}

// ---------- faceplate focus: isolate + frame the plate ----------
// Selecting a FACEPLATE fades everything else away COMPLETELY — every other
// part fades to nothing (then hides, so the user can orbit clear around the
// plate and read its back side), the table/grid/wall/surface fade out, the
// overall W/H/L dims hide — and the camera frames the plate near straight-on,
// fit to its real bbox at the current aspect (so a 1W-1H fills the view
// exactly like a 4W-2H). The plate's DRESSING is treated as part of the plate
// and stays solid + tappable in isolation: the bolt-on handle (Essential) or
// the accent / label / back cover (EdgeLabel) — swap styles / recolor each
// piece without leaving. The old 40 mm rider peek is skipped for faceplates;
// the identify card's "Open the drawer" button is the explicit hand-off into
// the drawer-body focus (deep pull + interior dims). Deselect restores
// materials, the room, the dims and the camera pose the user started from.
const FP_FADE = 0; // the rest vanishes completely — orbit all the way around the plate, back side included
const FP_COMPANIONS = new Set(['Handle', 'Accent', 'Label', 'BackCover']);
const fpFocus = { id: null, mates: new Set(), saved: null, mats: new Map() }; // mates = the plate's dressing (stays solid); mats: instId -> fade-clone mats
// a companion shares the plate's carrier (generated builds: both ride the
// drawer) or rides the plate itself (the static test kit)
const fpCompanions = inst => [...instances.values()].filter(x =>
  x !== inst && FP_COMPANIONS.has(typeByNode[x.cfg.node]) &&
  ((inst.cfg.rides && x.cfg.rides === inst.cfg.rides) || x.cfg.rides === inst.cfg.id));
// the room fades via a render-loop lerp, NOT tween() — killTweens() on a page
// snap would strand a half-faded table otherwise (part materials don't need
// this: every killTweens caller restores shared materials itself)
const fpEnv = { k: 1, target: 1, meshes: [table, grid, wall, surface] };
function updateFpEnv() {
  if (fpEnv.k === fpEnv.target) return;
  fpEnv.k += Math.sign(fpEnv.target - fpEnv.k) * Math.min(0.05, Math.abs(fpEnv.target - fpEnv.k));
  for (const m of fpEnv.meshes) {
    const t = fpEnv.k < 1; // flipping `transparent` re-bakes the program — needsUpdate or it keeps rendering opaque
    if (m.material.transparent !== t) { m.material.transparent = t; m.material.needsUpdate = true; }
    m.material.opacity = fpEnv.k;
  }
}
function fadeOutInstance(inst) {
  if (fpFocus.mats.has(inst.cfg.id)) return;
  const mats = [];
  inst.group.traverse(o => {
    if (!o.isMesh) return;
    const m = cloneMaterial(materialFor(inst, false, o.userData.zone));
    m.userData.rest = m.opacity;
    m.transparent = true;
    m.userData.fpFade = true; // exit only reclaims meshes that still hold OUR clone
    o.material = m;
    mats.push(m);
  });
  fpFocus.mats.set(inst.cfg.id, mats);
  tween({
    duration: DUR.fade,
    onUpdate: k => mats.forEach(m => { const r = restOf(m); m.opacity = r - (r - FP_FADE) * k; }),
    // fully faded → stop drawing it (an invisible part must not catch taps or
    // occlude anything; skipped if the focus already ended / hopped away)
    onDone: () => { if (fpFocus.id && fpFocus.mats.has(inst.cfg.id)) inst.group.visible = false; },
  });
}
function unfadeInstance(inst) {
  const mats = fpFocus.mats.get(inst.cfg.id);
  if (!mats) return;
  fpFocus.mats.delete(inst.cfg.id);
  inst.group.visible = true; // only instances that were visible at focus time ever get faded
  tween({
    duration: DUR.fade,
    onUpdate: k => mats.forEach(m => { const r = restOf(m); m.opacity = FP_FADE + (r - FP_FADE) * k; }),
    // only reclaim meshes that still hold OUR clone — a step phase, applyState
    // or a handle-style swap may have replaced materials while we faded back
    onDone: () => inst.group.traverse(o => { if (o.isMesh && o.material.userData?.fpFade) o.material = materialFor(inst, false, o.userData.zone); }),
  });
}
function enterFaceplateFocus(inst, seated) {
  if (fpFocus.id === inst.cfg.id) return;
  // the plate's dressing stays solid with it (handle / accent / label / cover)
  const mates = new Set(fpCompanions(inst).filter(x => !x.styleHidden).map(x => x.cfg.id));
  // remember where the user was BEFORE any focus — the drawer focus may already
  // hold that pose (faceplate tapped while a drawer was zoomed)
  if (!fpFocus.saved) {
    fpFocus.saved = dFocus.saved || { pos: camera.position.clone(), target: controls.target.clone() };
    dFocus.saved = null;
  }
  if (!fpFocus.id) { // first entry: fade the rest of the build + the room
    for (const other of instances.values()) if (other !== inst && !mates.has(other.cfg.id) && other.group.visible) fadeOutInstance(other);
    fpEnv.target = 0;
    setDims(false); // the plate owns the stage — overall dims come back on exit
  } else {           // hopping plate → plate (programmatic only — hidden plates can't be tapped): swap the fades
    const prev = instances.get(fpFocus.id);
    if (prev) fadeOutInstance(prev);
    for (const id of fpFocus.mates) if (!mates.has(id) && id !== inst.cfg.id && instances.has(id)) fadeOutInstance(instances.get(id));
    fpFocus.mats.delete(inst.cfg.id); // the new plate is already solid — the selection highlight replaced its fade clone
    inst.group.visible = true;        // (its own earlier fade-out may have hidden it)
    for (const id of mates) if (instances.has(id)) unfadeInstance(instances.get(id));
  }
  fpFocus.id = inst.cfg.id;
  fpFocus.mates = mates;
  // frame the plate where it will REST: a seated drawer that was open is
  // sliding shut right now, so aim at the seat, not the in-flight position;
  // unseated (exploded page / staged bench) plates frame where they float
  const box = new THREE.Box3().setFromObject(inst.group);
  if (seated) box.translate(basePos(inst, inst.staged).sub(inst.group.position));
  const c = box.getCenter(new THREE.Vector3());
  const R = box.getSize(new THREE.Vector3()).length() / 2 * 1.4; // breathing room at any plate size
  const vFov = THREE.MathUtils.degToRad(curCamPreset?.fov || 40);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (camera.aspect || 1.6));
  const dist = Math.max(R / Math.sin(vFov / 2), R / Math.sin(hFov / 2));
  const side = Math.sign(camera.position.x - c.x) || 1; // approach from the side the camera is already on
  const dir = new THREE.Vector3(side * 0.2, 0.16, 1).normalize(); // near straight-on, a hint of 3/4 for depth
  // aim a touch low so the plate rides the upper half of the frame, clear of
  // the identify card (bottom-center) — a fixed fraction of the VIEW height,
  // so 1W-1H and 4W-2H sit at the same spot on screen
  c.y -= dist * Math.tan(vFov / 2) * 0.15;
  const pos = c.clone().addScaledVector(dir, dist);
  const my = ++camTweenToken; // cancels tour tweens; paging cancels this one
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  // settle the fov the fit math assumed — cancelling a cover→step tween
  // mid-flight (skip-to-end, then tap a plate) would strand the telephoto 9
  const fov0 = camera.fov, fov1 = curCamPreset?.fov || 40;
  tween({ duration: 750, onUpdate: k => {
    if (my !== camTweenToken) return;
    camera.position.lerpVectors(p0, pos, k);
    controls.target.lerpVectors(t0, c, k);
    if (fov0 !== fov1) { camera.fov = fov0 + (fov1 - fov0) * k; camera.updateProjectionMatrix(); }
  } });
}
function exitFaceplateFocus() {
  if (!fpFocus.id) return;
  fpFocus.id = null;
  fpFocus.mates = new Set();
  for (const id of [...fpFocus.mats.keys()]) {
    const other = instances.get(id);
    if (other) unfadeInstance(other); else fpFocus.mats.delete(id);
  }
  fpEnv.target = 1;
  // a faceplate-style swap inside the isolation may have suppressed/restored
  // the plate's dressing (handles/accent/label/cover) — those pieces were never
  // part of the fade set, so give them the current page state's visibility
  for (const other of instances.values())
    if (FP_COMPANIONS.has(typeByNode[other.cfg.node])) other.group.visible = pageVisibility(other);
  if (fpFocus.saved) { // glide back to wherever the user was before the zoom
    const { pos, target } = fpFocus.saved;
    fpFocus.saved = null;
    const my = ++camTweenToken;
    const p0 = camera.position.clone(), t0 = controls.target.clone();
    tween({ duration: 650, onUpdate: k => {
      if (my !== camTweenToken) return;
      camera.position.lerpVectors(p0, pos, k);
      controls.target.lerpVectors(t0, target, k);
    } });
  }
  // overall build dims return (only the final assembly step shows them)
  setDims(!PAGES[cur]?.cover && !PAGES[cur]?.outro && cur - 1 === manifest.steps.length - 1);
}
// ---------- filament colors ----------
// The catalog moved to `filament-db.js` on 2026-09-05 so the Lab can read it
// too; values unchanged, and it is imported at the top of this file with the
// other modules. Edit it THERE - it is vendored into the Lab and both suites
// gate on byte equality. See that file for the measured shape, and for why it
// is an ES module rather than JSON.

// ---------- filament presets ----------
// One click sets a filament per part TYPE. Every colour is pulled from
// FILAMENT_DB BY LABEL via _db(), so a preset can no longer drift from the
// catalog — the 2026-08-07 audit found every bare-named entry ('Black',
// 'Dark Grey', 'Prusa Orange PETG', 'Holo Blue'…) silently failing the
// picker's active-ring match, which keys on exact labels. Unknown label =
// loud console warning + a grey stand-in, never a boot failure.
function _db(label) {
  for (const b of FILAMENT_DB) {
    const f = b.colors.find(c => c.label === label);
    if (f) return { name: f.label, hex: f.hex, url: f.url };
  }
  console.warn(`[presets] no catalog colour labelled "${label}"`);
  return { name: label, hex: '#888a90', url: FILAMENT_DB[0].url };
}
// The Classic faceplate's four zones, as one reusable block — Joey's
// 2026-07-25 spec: black body, orange face + grip, silk-silver accent rod.
const CLASSIC_FACE = {
  Faceplate: _db('Elegoo PLA Black'),
  'Faceplate:FACE': _db('Printed Solid Mystery Orange'),
  'Faceplate:GRIP': _db('Printed Solid Mystery Orange'),
  'Faceplate:GRIP ACCENT': _db('Panchroma Silk Silver'),
};
// Every preset themes the WHOLE build (Joey 2026-07-13): faceplate zones
// ('Faceplate:GRIP' drives the EdgeLabel/Classic Pro printed-in grip,
// ':GRIP ACCENT' the Classic Pro rod) + the dressing (Accent/Label/BackCover)
// + Rail. L/U pairs (covers, footrails) share ONE color per preset — the
// two-tone look belongs to the instruction palette only (see applyPalette's
// alt-shade gate). NB Magnet/Screw entries are inert (colorLocked purchased
// hardware always renders its manifest colour) — kept for completeness.
const PRESETS = [
  // The Jerrari = the build Joey actually prints: Elegoo black shell,
  // Mystery Orange face/grip, silk-silver rod + handles, Burnt Titanium
  // accent, PETG-orange hardware (real since the Polymaker PETG line landed).
  { name: 'The Jerrari', swatches: ['#1c1d20', '#F56233', '#cdd2d9'], colors: {
    Case: _db('Elegoo PLA Black'), Drawer: _db('Elegoo PLA Black'),
    CoverL: _db('Elegoo PLA Black'), CoverU: _db('Elegoo PLA Black'),
    Bracket: _db('Elegoo PLA Black'), FootrailL: _db('Elegoo PLA Black'),
    FootrailU: _db('Elegoo PLA Black'), Foot: _db('Elegoo PLA Black'),
    Rail: _db('Elegoo PLA Black'),
    /* SHELF + EXTENDER COLOUR RULE (Joey 2026-08-30), applied to all four:
       - a case extender IS a case without the bottom, so it takes the CASE's
         filament - a stacked shelf must not read as two different products;
       - the LIP takes the case colour too, so it reads as part of the shell;
       - the DECK "matches the theme yet is higher contrast where the palette
         allows" - it is the surface you have to see things on. MEASURED as a
         luminance contrast ratio against that preset's own case colour, and
         chosen from colours the preset ALREADY uses, so it never leaves the
         theme: Jerrari 14.9:1, Stealth 12.5:1, Signal 8.7:1, Sandstone 5.5:1.
         Stealth previously sat at 1.64:1 (Dark Grey on black) - a deck you
         could not see. test/presets.test.mjs pins a 4.5:1 floor. */
    CaseExtender: _db('Elegoo PLA Black'),
    ShelfInsert: _db('Panchroma Cold White'), ShelfLip: _db('Elegoo PLA Black'),
    ...CLASSIC_FACE, // black body / orange face + grip / silk-silver rod
    Accent: _db('ERYONE Burnt Titanium'), Label: _db('Panchroma Cold White'),
    BackCover: _db('Elegoo PLA Black'),
    Handle: _db('Panchroma Silk Silver'),
    QuickLock: _db('Polymaker PETG Orange'), MagnetClip: _db('Polymaker PETG Orange'),
    Stopper: _db('Polymaker PETG Orange'),
    Magnet: _db('Panchroma Silk Silver'), Screw: _db('Panchroma Silk Silver'),
  } },
  { name: 'Stealth', swatches: ['#2b2b2e', '#4a4c51', '#6e7178'], colors: {
    Case: _db('Panchroma Black'), Drawer: _db('Panchroma Dark Grey'),
    CoverL: _db('Panchroma Black'), CoverU: _db('Panchroma Black'),
    Bracket: _db('Panchroma Black'), FootrailL: _db('Panchroma Black'),
    FootrailU: _db('Panchroma Black'), Foot: _db('Panchroma Black'),
    Rail: _db('Panchroma Black'), CaseExtender: _db('Panchroma Black'),
    // Silk Silver, not Cold White: Joey wants Stealth to stay stealthy
    // (9.29:1 against its black case - Steel Grey would drop to 2.89:1)
    ShelfInsert: _db('Panchroma Silk Silver'), ShelfLip: _db('Panchroma Black'),
    // FACE is the Classic plate's front layer — every preset defines all four
    // zones so nothing silently inherits the body (see renderZoneChips)
    Faceplate: _db('Panchroma Steel Grey'), 'Faceplate:FACE': _db('Panchroma Dark Grey'),
    'Faceplate:GRIP': _db('Panchroma Dark Grey'), 'Faceplate:GRIP ACCENT': _db('Panchroma Silk Silver'),
    Accent: _db('Panchroma Black'), Label: _db('Panchroma Cold White'),
    BackCover: _db('Panchroma Black'),
    Handle: _db('Panchroma Silk Silver'),
    QuickLock: _db('Panchroma Dark Grey'), MagnetClip: _db('Panchroma Dark Grey'),
    Stopper: _db('Panchroma Dark Grey'),
    Magnet: _db('Panchroma Silk Silver'), Screw: _db('Panchroma Silk Silver'),
  } },
  { name: 'Signal', swatches: ['#2b2b2e', '#d23a2e', '#00a5a5'], colors: {
    Case: _db('Panchroma Black'), Drawer: _db('Panchroma Red'),
    CoverL: _db('Panchroma Green'), CoverU: _db('Panchroma Green'),
    FootrailL: _db('Panchroma Blue'), FootrailU: _db('Panchroma Blue'),
    Foot: _db('Panchroma Purple'), Rail: _db('Panchroma Blue'),
    Bracket: _db('Panchroma Steel Grey'), CaseExtender: _db('Panchroma Black'),
    ShelfInsert: _db('Panchroma Yellow'), ShelfLip: _db('Panchroma Black'),
    Faceplate: _db('Panchroma Orange'), 'Faceplate:FACE': _db('Panchroma Yellow'),
    'Faceplate:GRIP': _db('Panchroma Yellow'), 'Faceplate:GRIP ACCENT': _db('Panchroma Polymaker Teal'),
    Accent: _db('Panchroma Aqua Blue'), Label: _db('Panchroma Cold White'),
    BackCover: _db('Panchroma Steel Grey'),
    Handle: _db('Panchroma Yellow'),
    QuickLock: _db('Panchroma Polymaker Teal'), MagnetClip: _db('Panchroma Brown'),
    Stopper: _db('Panchroma Magenta'),
    Magnet: _db('Panchroma Silk Silver'), Screw: _db('Panchroma Silk Silver'),
  } },
  { name: 'Sandstone', swatches: ['#7a5236', '#c8a97e', '#f1e7cf'], colors: {
    Case: _db('Panchroma Brown'), Drawer: _db('Panchroma Tan'),
    CoverL: _db('Panchroma Cream'), CoverU: _db('Panchroma Cream'),
    Bracket: _db('Panchroma Brown'), FootrailL: _db('Panchroma Brown'),
    FootrailU: _db('Panchroma Brown'), Foot: _db('Panchroma Brown'),
    Rail: _db('Panchroma Brown'), CaseExtender: _db('Panchroma Brown'),
    ShelfInsert: _db('Panchroma Cream'), ShelfLip: _db('Panchroma Brown'),
    Faceplate: _db('Panchroma Orange'), 'Faceplate:FACE': _db('Panchroma Brown'),
    'Faceplate:GRIP': _db('Panchroma Brown'), 'Faceplate:GRIP ACCENT': _db('Panchroma Steel Grey'),
    Accent: _db('Panchroma Tan'), Label: _db('Panchroma Cream'),
    BackCover: _db('Panchroma Brown'),
    Handle: _db('Panchroma Steel Grey'),
    QuickLock: _db('Panchroma Tan'), MagnetClip: _db('Panchroma Brown'),
    Stopper: _db('Panchroma Tan'),
    Magnet: _db('Panchroma Silk Silver'), Screw: _db('Panchroma Silk Silver'),
  } },
];

// official kits get their own palette slot (keyed by kit id) so a saved color
// scheme sticks to THAT kit — planner hand-offs share one 'custom-build' slot
// the benchmark keeps its own key, so a palette saved for the demo kit never repaints the benchmark's build
const COLOR_STORE_KEY = 'gen2-colors:' + (IS_BENCH ? 'bench' : BUILD_HASH ? 'custom-build' : OFFICIAL ? 'official-' + OFFICIAL.id : KIT);
let customColors = {}, useCustom = false; // customColors: type -> {name, hex, url}
// userPalette = the last palette the user built BY HAND (individual swatch
// picks / per-type resets / file upload). Hand edits mirror the whole working
// state into it; presets never touch it — so one preset click can't destroy
// hours of picking. A "★ My palette" chip (renderPresets) restores it.
let userPalette = {};
let colorsT = 0; // stamp of the last palette save — newest-wins when the planner relays palettes between viewer contexts
// part-preview never reads OR writes saved palettes: its manifest carries the
// product palette, and a user's studio picks must not leak into catalog cards
if (!IS_PART) try {
  const saved = JSON.parse(localStorage.getItem(COLOR_STORE_KEY) || 'null');
  if (saved) {
    customColors = saved.colors || {};
    useCustom = !!saved.on;
    // migration: pre-userPalette saves treat the current colors as hand-picked
    userPalette = saved.user || structuredClone(customColors);
    colorsT = saved.t || 0;
  }
} catch (e) { /* corrupt storage — start fresh */ }
// persist without re-stamping (remote applies adopt the sender's stamp so the
// exchange converges); saveColors = a LOCAL edit → new stamp + tell the planner
const persistColors = () => {
  try { localStorage.setItem(COLOR_STORE_KEY, JSON.stringify({ colors: customColors, on: useCustom, user: userPalette, t: colorsT })); }
  catch (e) { /* storage unavailable (private mode) — the planner relay still works */ }
};
const saveColors = () => { colorsT = Date.now(); persistColors(); postColorsToPlanner(); };
// call after any HAND edit to the palette (never after a preset)
const snapshotUserPalette = () => { userPalette = structuredClone(customColors); };
// purchased hardware (wood screws, magnets — every row of the type is `purchased`)
// isn't printed, so it can't take a filament color: no picker, and any stored/
// preset tint for the type is ignored — it always renders its manifest color.
const colorLocked = type => {
  const rows = manifest.parts.filter(p => p.type === type.split(':')[0]); // zone keys lock with their base type
  return rows.length > 0 && rows.every(p => p.purchased);
};
// key = a part TYPE ('Faceplate') or a zone of one ('Faceplate:GRIP'). A zone
// with no explicit pick and no manifest color FOLLOWS THE BODY — one
// identification color per part by default; a zone forks only when chosen.
// ⚠ The identification palette paints cases near-black (#34373c — "Joey's one
// rule"), which was chosen against the LIGHT stage. On the dark stage that puts a
// near-black shell on a near-black floor and the largest part in the build — the
// one you are meant to be locating — disappears. So the instruction palette gets a
// dark-stage substitution for exactly those types.
// ONLY the instruction palette: a user's own filament pick is the colour they will
// actually print, and must never be second-guessed by the stage they're viewing on.
const DARK_STAGE_PALETTE = { Case: '#dfe3ec' };
const activeHex = key => {
  if (useCustom && customColors[key] && !colorLocked(key)) return customColors[key].hex;
  if (stageTheme !== 'light' && DARK_STAGE_PALETTE[key]) return DARK_STAGE_PALETTE[key];
  if (manifest.colors[key]) return manifest.colors[key];
  const base = key.split(':')[0];
  return base !== key ? activeHex(base) : '#b9bcc2';
};

/**
 * WHICH FILAMENT THIS KEY IS WEARING, or null when it is not wearing one.
 *
 * ⚠ IT MIRRORS activeHex BRANCH FOR BRANCH, AND IT HAS TO. A profile keys by filament LABEL, and
 * the only branch of activeHex that HAS a label is the first — a custom palette pick, whose entry
 * carries {name, hex, url}. The dark-stage palette and the manifest colours are identification
 * colours: they are a hex and nothing more, and a part painted by one is not wearing a filament.
 * Falling through to a filament there would paint a profile onto a colour the user never chose.
 *
 * ⚠ THE THREE SHARED RULES ARE WHY THIS IS NOT A ONE-LINER. It must honour `colorLocked`, or a
 * purchased part — the adhesive foot — picks up a profile for a filament it was never printed in.
 * It must honour `useCustom`, or turning the palette off leaves the finish behind while the colour
 * reverts. And it must take the `Type:zone -> Type` fallback, or a zone with no pick of its own gets
 * the base type's COLOUR and the base finish, which is the split that makes a grip read as a
 * different material from the face it is moulded into.
 *
 * ⚠ SO IN INSTRUCTION-COLOURS MODE THIS RETURNS NULL FOR EVERYTHING, and so it does in the ?part=
 * embed, which never loads a palette. Those views get the base finish plus layer detail. That is
 * the decision of 2026-09-07, and it is enforced here rather than anywhere else.
 */
const activeLabel = key => {
  if (useCustom && customColors[key] && !colorLocked(key)) return customColors[key].name || null;
  if (stageTheme !== 'light' && DARK_STAGE_PALETTE[key]) return null;
  if (manifest.colors[key]) return null;
  const base = key.split(':')[0];
  return base !== key ? activeLabel(base) : null;
};

/**
 * The finish a key should be wearing right now, as a live read rather than a construction-time one.
 *
 * ⚠ THIS IS THE HALF applyPalette WAS MISSING. It has always walked the six material maps setting
 * `.color` AND NOTHING ELSE, which was complete while a finish was a constant. It is not one any
 * more: a filament with a profile carries its own roughness and metalness, so a palette change that
 * moves the colour and leaves the finish renders the new filament at the old material until
 * something happens to rebuild the scene. The part would look right in the picker and wrong on the
 * model, which is the failure this whole transport exists to produce correctly.
 */
const finishFor = key => partMaterialSpec(key, {
  holographicPlate: plateActive(), plateContact: plateContactKey(key), label: activeLabel(key),
});

function applyPalette() {
  /* ⚠ COLOUR AND FINISH, SINCE 2026-09-07. See finishFor. Only roughness and metalness move:
     they are the whole of what a profile carries, and they are plain uniforms, so no material needs
     recompiling. Anything structural — the clearcoat the holographic plate transfers, the material
     CLASS — still comes from a rebuild, exactly as it did before, because nothing here can change
     it without one. */
  syncSeeIntoComponents();   // a translucent filament arriving on (or leaving) a supported component rebuilds it first
  const repaint = (type, mat) => {
    mat.color.set(activeHex(type));
    const spec = finishFor(type);
    mat.roughness = spec.roughness;
    mat.metalness = spec.metalness;
  };
  for (const [type, mat] of Object.entries(materials)) repaint(type, mat);
  for (const [type, mat] of Object.entries(highlightMats)) repaint(type, mat);
  // lightened alternate-tile variants track the active palette too — and fall
  // to lerp 0 (identical to base) for types with a custom filament pick, so a
  // preset's covers/footrails render uniform without any material reassignment
  for (const [type, mat] of Object.entries(altMaterials)) { repaint(type, mat); mat.color.lerp(new THREE.Color('#ffffff'), altLerp(type)); }
  for (const [type, mat] of Object.entries(altHighlightMats)) { repaint(type, mat); mat.color.lerp(new THREE.Color('#ffffff'), altLerp(type)); }
  // planned (translucent) clones take their source's colour AND finish, after both moved
  for (const e of Object.values(plannedMats)) { e.mat.color.copy(e.src.color); e.mat.roughness = e.src.roughness; e.mat.metalness = e.src.metalness; }
  for (const e of Object.values(plannedHighlightMats)) { e.mat.color.copy(e.src.color); e.mat.roughness = e.src.roughness; e.mat.metalness = e.src.metalness; }
  renderChecklist();
  updateColorToggle();
  renderPresets(); // keep the active preset / My-palette chip highlight in step
  if (selectedId) {
    const inst = instances.get(selectedId);
    $('identify-swatch').style.background = activeHex(primaryKey(inst.cfg.node));
    renderZoneChips(inst); // keep the Body/Grip dots tracking the live palette
  }
  invalidateFrame();   // every part material just changed colour
}
function updateColorToggle() {
  const btn = $('color-toggle');
  const any = Object.keys(customColors).length > 0;
  const onContentPage = !PAGES[cur]?.cover && !PAGES[cur]?.outro;
  btn.classList.toggle('hidden', !any || !onContentPage);
  btn.textContent = useCustom ? '🎨 My colors' : '🎨 Instruction colors';
}
$('color-toggle').onclick = () => { useCustom = !useCustom; track('colors:' + (useCustom ? 'mine' : 'instruction')); saveColors(); applyPalette(); };

// preset picker: apply a whole per-type filament set at once, and save/load
// them. Presets only replace the WORKING palette (customColors) — the user's
// hand-built palette survives in userPalette and comes back via its chip.
function applyPreset(p) {
  track('preset:' + slug(p.name)); // preset names are OURS — a fixed, tiny vocabulary
  customColors = {};
  for (const [type, f] of Object.entries(p.colors)) customColors[type] = { ...f };
  useCustom = true;
  saveColors();
  applyPalette();
}
function restoreUserPalette() {
  track('preset:my-palette');
  customColors = structuredClone(userPalette);
  useCustom = true;
  saveColors();
  applyPalette();
}
// order-independent palette identity — for highlighting the active chip
const palKey = o => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]?.name, o[k]?.hex]));
function renderPresets() {
  const box = $('preset-chips');
  box.innerHTML = '';
  const cur = useCustom ? palKey(customColors) : null;
  const chip = (label, swatches, title, onclick, extraClass) => {
    const b = document.createElement('button');
    b.className = 'preset-chip' + (extraClass ? ' ' + extraClass : '');
    b.title = title;
    b.innerHTML = `<span class="preset-sw">${swatches.map(h => `<i style="background:${h}"></i>`).join('')}</span>${label}`;
    b.onclick = onclick;
    box.appendChild(b);
    return b;
  };
  // the user's own hand-built palette leads (only once they've picked something)
  let activeName = '';
  if (Object.keys(userPalette).length) {
    const order = ['Case', 'Drawer', 'Faceplate', 'Handle', 'CoverU'];
    const hexes = [...new Set([...order.filter(t => userPalette[t]), ...Object.keys(userPalette)])]
      .map(t => userPalette[t].hex).slice(0, 3);
    const b = chip('My palette', hexes, 'Your own hand-picked filament colors · presets never overwrite these', restoreUserPalette, 'mine');
    if (cur && cur === palKey(userPalette)) { b.classList.add('on'); activeName = 'My palette'; }
  }
  for (const p of PRESETS) {
    const b = chip(p.name, p.swatches, `Apply the "${p.name}" filament preset`, () => applyPreset(p));
    if (cur && cur === palKey(p.colors)) { b.classList.add('on'); activeName = p.name; }
  }
  // name the active palette in the section head, so the state still reads
  // while the block is collapsed
  $('preset-active').textContent = activeName ? `· ${activeName}`
    : useCustom && Object.keys(customColors).length ? '· custom' : '';
}
function savePreset() {
  track('colors:save');
  const blob = new Blob([JSON.stringify({ gen2Filaments: 1, colors: customColors }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'gen2-filament-colors.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
function loadPresetFile(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (d && d.colors && typeof d.colors === 'object') {
        track('colors:load');
        customColors = d.colors; useCustom = true;
        snapshotUserPalette(); // an uploaded file is a hand-authored palette
        saveColors(); applyPalette();
      }
    } catch (e) { /* ignore a bad file */ }
  };
  r.readAsText(file);
}
$('preset-save').onclick = savePreset;
$('preset-load').onclick = () => $('preset-file').click();
$('preset-file').onchange = e => { if (e.target.files[0]) loadPresetFile(e.target.files[0]); e.target.value = ''; };
// the preset block collapses (chevron, session-remembered) so a growing preset
// library never crowds the parts panel — the head keeps naming the active
// palette while folded (Joey 2026-07-13)
/* ⚠ STORAGE CAN THROW, and this runs while the module loads: a browser that blocks the site's storage throws on the
   first touch of sessionStorage, which stopped main.js right here - no viewer, no benchmark (found by the p34
   benchmark harness, 2026-09-15). The fold works without it; it is just not remembered. */
const setPresetsOpen = open => {
  try { sessionStorage.setItem('gen2-presets-open', open ? '1' : '0'); } catch (e) { /* storage blocked */ }
  $('preset-chips').classList.toggle('hidden', !open);
  $('preset-io').classList.toggle('hidden', !open);
  $('preset-head').classList.toggle('collapsed', !open);
  $('preset-head').setAttribute('aria-expanded', String(open));
};
$('preset-head').onclick = () => setPresetsOpen($('preset-chips').classList.contains('hidden'));
setPresetsOpen((() => { try { return sessionStorage.getItem('gen2-presets-open'); } catch (e) { return null; } })() !== '0');
renderPresets();

let fmType = null;     // the part type/zone key the filament menu is editing
let fmQuery = '';      // live search filter (cleared on every open)
let fmExpanded = null; // Set of expanded brand+line keys (null → first render expands all)
const secKey = b => `${b.brand} ${b.line}`;
function renderFilamentBrands() {
  // keyed by brand+LINE: one brand can ship several lines (Polymaker Basic PLA
  // and Silk PLA are separate product pages), and they must fold independently
  if (!fmExpanded) fmExpanded = new Set(FILAMENT_DB.map(secKey)); // session default: everything visible
  const box = $('fm-brands');
  box.innerHTML = '';
  const q = fmQuery.trim().toLowerCase();
  // ---- "In this build" — the working palette's picks, deduped by label ----
  // The agreed kernel of the 2026-08-07 UX review (ChatGPT proposed a whole
  // palette-first picker LAYER; the counter was that this app's palette is
  // per-type by construction, so a section — not a second surface — captures
  // the reuse case): open the menu and the colours you already chose sit
  // first, one tap to give this part one of them. Hidden while empty, so a
  // first-run user meets the catalog exactly as before. Works for colours
  // that aren't in FILAMENT_DB at all (uploaded palettes, preset placeholders)
  // because the assignment copies the STORED {name,hex,url}, not a DB row.
  const seen = new Map();
  for (const c of Object.values(customColors))
    if (c && c.name && c.hex && !seen.has(c.name)) seen.set(c.name, c);
  const inBuild = [...seen.values()].filter(c => !q || c.name.toLowerCase().includes(q));
  if (inBuild.length) {
    const sec = document.createElement('div');
    sec.className = 'fm-brand';
    const head = document.createElement('div');
    head.className = 'fm-inbuild-head';
    head.textContent = 'In this build';
    sec.appendChild(head);
    const grid = document.createElement('div');
    grid.className = 'fm-swatches';
    for (const c of inBuild) {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.background = c.hex;
      b.title = c.name + ' · already in this build';
      if (customColors[fmType]?.name === c.name) b.classList.add('active');
      b.onclick = () => {
        // same side-effects as a catalog swatch pick, sourced from the stored colour
        customColors[fmType] = { name: c.name, hex: c.hex, url: c.url };
        useCustom = true;
        snapshotUserPalette();
        saveColors();
        applyPalette();
        renderFilamentBrands();
        const buy = $('fm-buy');
        buy.href = c.url || FILAMENT_DB[0].url;
        buy.textContent = `Buy ${c.name.replace('Panchroma ', '')} →`;
        markFmBuy();
        // brand only when the colour resolves to the catalog — reusing an
        // uploaded/unknown colour is a palette action, not a brand signal
        const src = FILAMENT_DB.find(br => br.colors.some(f => f.label === c.name));
        if (src) track('filament:' + slug(src.brand));
      };
      grid.appendChild(b);
    }
    sec.appendChild(grid);
    box.appendChild(sec);
  }
  for (const brand of FILAMENT_DB) {
    const colors = q
      ? brand.colors.filter(f => `${brand.brand} ${brand.line} ${f.label}`.toLowerCase().includes(q))
      : brand.colors;
    if (q && !colors.length) continue;                    // searching: hide brands with no hits
    const key = secKey(brand);
    const open = q ? true : fmExpanded.has(key);          // searching force-opens the matches
    const sec = document.createElement('div');
    sec.className = 'fm-brand';
    const head = document.createElement('button');
    head.className = 'fm-brand-head';
    head.innerHTML = `<span>${brand.brand} <i>${brand.line} · ${colors.length}</i></span><span class="fm-chev">${open ? '▾' : '▸'}</span>`;
    head.onclick = () => { fmExpanded[fmExpanded.has(key) ? 'delete' : 'add'](key); renderFilamentBrands(); };
    sec.appendChild(head);
    if (open) {
      const grid = document.createElement('div');
      grid.className = 'fm-swatches';
      for (const f of colors) {
        const b = document.createElement('button');
        b.style.background = f.hex;
        b.title = f.label + (f.pick ? (f.pickNote || ' · Joey’s budget pick for cases & drawer bodies') : '');
        if (f.pick) b.classList.add('pick');
        if (customColors[fmType]?.name === f.label) b.classList.add('active');
        b.onclick = () => {
          // brand only, never the colour label — which brands the audience runs
          // is the useful signal; a colour name is a user-visible value with a
          // long tail, and the doc's rule is no user values in event names
          track('filament:' + slug(brand.brand));
          customColors[fmType] = { name: f.label, hex: f.hex, url: f.url };
          useCustom = true;
          snapshotUserPalette(); // a hand pick — this IS the user's palette now
          saveColors();
          applyPalette();
          renderFilamentBrands(); // refresh the active ring across sections
          const buy = $('fm-buy');
          buy.href = f.url;
          buy.textContent = `Buy ${f.label} →`; // label, not name — `name` is the bare colour ("Black")
          markFmBuy();
        };
        grid.appendChild(b);
      }
      sec.appendChild(grid);
    }
    box.appendChild(sec);
  }
  if (q && !box.children.length) {
    const none = document.createElement('div');
    none.className = 'fm-none';
    none.textContent = 'No filaments match';
    box.appendChild(none);
  }
}
// Closing must CLEAR fmType. It used to linger, so a swatch clicked after the
// menu had been dismissed still wrote to the last-edited key — picks landing on
// a zone the user was no longer editing (Joey 2026-07-25).
function closeFilamentMenu(refresh = true) {
  if ($('filament-menu').classList.contains('hidden')) return;
  $('filament-menu').classList.add('hidden');
  document.body.classList.remove('fm-open'); // note panel returns as it was
  fmType = null;
  schedulePaidNote();
  if (refresh) { refreshSelHighlight(); syncZoneChips(); }
}
// the zone chips carry the "which key am I editing" ring, so they must be
// rebuilt whenever the picker opens, retargets or closes — applyPalette only
// covers the pick itself
function syncZoneChips() {
  if (selectedId && instances.has(selectedId)) renderZoneChips(instances.get(selectedId));
}
// #fm-buy is a STATIC anchor (markup owns it, href/label swapped in TWO places:
// menu open + colour pick) → linkEl never sees it, so it marks itself. One
// helper for both sites, judged by the CURRENT href like everything else —
// Elegoo lands on Amazon (paid), Polymaker / Printed Solid are plain.
function markFmBuy() {
  const buy = $('fm-buy');
  if (isPaidLink(buy.href)) { buy.rel = 'noopener sponsored'; buy.textContent += ' · paid link'; }
  else buy.rel = 'noopener';
  schedulePaidNote();
}
function openFilamentMenu(type) {
  fmType = type;
  fmQuery = '';
  $('fm-search').value = '';
  renderFilamentBrands();
  const buy = $('fm-buy');
  const sel = customColors[type];
  buy.href = sel ? sel.url : FILAMENT_DB[0].url;
  buy.textContent = sel ? `Buy ${sel.name.replace('Panchroma ', '')} →` : 'Shop filament →';
  markFmBuy();
  $('filament-menu').classList.remove('hidden');
  // body.fm-open: on mobile the note panel hides while the picker is up (the
  // sheet + note left a sliver of model between them, Joey 2026-08-07) — and
  // because it's ONLY a class, the panel returns in whatever state it was in
  // (expanded or ✕-collapsed to its badge); updateViewInset recenters per-frame
  document.body.classList.add('fm-open');
  refreshSelHighlight(); // color mode: drop the emissive glow so picks read true
  syncZoneChips();       // move the active ring to the zone we just targeted
}
// The selection highlight is an emissive orange — it SKEWS the very color the
// user is trying to judge (a blue pick reads pink). While the filament menu is
// open the selected part renders in its plain material; the identify card +
// pointer line still mark it. Glow returns the moment the menu closes.
// Should the selected part wear the emissive glow? The glow SKEWS a colour
// being judged (a blue pick read pink), so it yields twice over:
// - while the filament menu is open (the 2026-07-07 rule), and
// - 2026-08-07 (Joey): whenever the part is wearing a USER-picked filament.
//   Closing the menu used to bring the glow straight back, so the fresh pick
//   read wrong until the part was deselected — the exact problem the menu-open
//   rule solved, one click later. Identification-palette parts keep the glow
//   (finding parts is its job); customized parts are marked by the pointer
//   line + card instead.
function selGlow(inst) {
  if (!$('filament-menu').classList.contains('hidden')) return false;
  if (!useCustom) return true;
  const type = typeByNode[inst.cfg.node];
  return !Object.keys(customColors).some(k => k === type || k.startsWith(type + ':'));
}
function refreshSelHighlight() {
  if (!selectedId || !instances.has(selectedId)) return;
  const inst = instances.get(selectedId);
  const glow = selGlow(inst);
  inst.group.traverse(o => { if (o.isMesh) o.material = materialFor(inst, glow, o.userData.zone); });
}
$('fm-search').oninput = e => { fmQuery = e.target.value; renderFilamentBrands(); };
$('identify-swatch').onclick = () => {
  if (!selectedId) return;
  const node = instances.get(selectedId).cfg.node;
  if (colorLocked(typeByNode[node])) return; // purchased hardware: no filament picker
  // edits the PRIMARY key (the visible front — FACE on a Classic plate, the
  // plain type elsewhere). Toggle, but RE-TARGET when the menu is open on a
  // different key: it used to just close, and the next swatch click then wrote
  // to the stale zone
  const key = primaryKey(node);
  if ($('filament-menu').classList.contains('hidden')) openFilamentMenu(key);
  else if (fmType !== key) openFilamentMenu(key);
  else closeFilamentMenu();
};
$('fm-close').onclick = () => closeFilamentMenu();
$('fm-reset').onclick = () => {
  if (fmType) delete customColors[fmType];
  if (!Object.keys(customColors).length) useCustom = false;
  snapshotUserPalette(); // a per-type reset is a hand edit too
  saveColors();
  applyPalette();
  closeFilamentMenu();
};

// ---------- handle style swap ----------
// Every handle style mounts the same way: back face against the faceplate
// front (= faceplate z-center + 2.5, half the plate depth — 97.57 on 185,
// 87.57 on 165), vertically centered on the plate — so swapping is just a
// node change + a reposition from the style's own height/depth. The choice is
// reported back to the planner tab (postMessage) so both stay in sync.
const HANDLE_STYLES = [
  { node: 'Handle_Deco',       label: 'Deco',       planner: 'deco',     h: 9,  d: 24 },
  { node: 'Handle_BlockBar_A', label: 'BlockBar A', planner: 'blockbar', h: 9,  d: 9 },
  { node: 'Handle_BlockBar_B', label: 'BlockBar B', planner: 'blockbar', h: 9,  d: 27 },
  { node: 'Handle_BlockBar_C', label: 'BlockBar C', planner: 'blockbar', h: 11, d: 12 },
  { node: 'Handle_BlockBar_D', label: 'BlockBar D', planner: 'blockbar', h: 9,  d: 9 },
  { node: 'Handle_BlockBar_E', label: 'BlockBar E', planner: 'blockbar', h: 10, d: 24 },
  { node: 'Handle_BlockBar_F', label: 'BlockBar F', planner: 'blockbar', h: 9,  d: 24 },
  // Crystal series (2026-07-20 GLB batch): A standard + B wide, same 44 mm
  // mount spacing; dims from Handles/Crystal/parts_index.csv.
  { node: 'Handle_Crystal_A', label: 'Crystal A',      planner: 'crystal', h: 11.78, d: 19.07 },
  { node: 'Handle_Crystal_B', label: 'Crystal B Wide', planner: 'crystal', h: 11.78, d: 19.07 },
];
const HANDLE_LINKS = {
  deco:     { p: 'https://www.printables.com/model/1044972-gen2-decor-handles-deco-series', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20Handles%20-%20Deco%20Series-1159960' },
  blockbar: { p: 'https://www.printables.com/model/965604-gen2-decor-handles-blockbar-series', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20-%20Handles%20-%20BlockBar-1116949' },
  crystal:  { p: 'https://www.printables.com/model/1001155-gen2-decor-handles-crystal', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20-%20Handles%20-%20Crystal-1134382' },
};
const currentHandleStyleIndex = () => {
  const inst = [...instances.values()].find(i => typeByNode[i.cfg.node] === 'Handle');
  return inst ? HANDLE_STYLES.findIndex(s => s.node === inst.cfg.node) : -1;
};
function faceplateHeightOf(node) {
  const m = node.match(/_(\d)W-(\w+)H$/);
  const hh = m ? { '05': 1, '1': 2, '15': 3, '2': 4, '3': 6 }[m[2]] : 2;
  return (hh || 2) * 28 - 1;
}
let activeHandleStyle = null; // the specific HANDLE_STYLES entry in use (BlockBar_D etc.), re-applied after a regenerate so a variant survives
async function applyHandleStyle(style) {
  ao.rev++;   // static kits swap meshes/visibility in place - no mountManifest to bump it
  const prevActive = activeHandleStyle, prevPlanner = build && build.handleStyle;
  activeHandleStyle = style;
  if (build) build.handleStyle = style.planner; // keep the build in sync (regenerate/BOM/reset read this)
  if (!templates[style.node]) {
    try {
      const gltf = await loader.loadAsync(`${PARTS_BASE}${style.node}.lib.glb`);
      /* through adoptTemplate like every other part load, so the node's bed faces are STAMPED. This
         path used to assign the material by hand and skip the stamp - harmless only while no handle
         had a confirmed pose. */
      templates[style.node] = adoptTemplate(gltf.scene, 'Handle', style.node);
    } catch (e) {
      // GLB absent from this kit's folder (static kits carry their own parts/):
      // roll the state back and report `false` so the ▶ cycle can skip past —
      // the un-caught await used to kill the click handler mid-function, which
      // read as a dead button (the 185 kits shipped without Crystal once)
      activeHandleStyle = prevActive;
      if (build) build.handleStyle = prevPlanner;
      console.warn(`Handle style "${style.label}" has no GLB at ${PARTS_BASE}${style.node}.lib.glb - skipped.`);
      return false;
    }
  }
  let oldNode = null;
  for (const inst of instances.values()) {
    if (typeByNode[inst.cfg.node] !== 'Handle') continue;
    oldNode = oldNode || inst.cfg.node;
    const off = inst.group.position.clone().sub(basePos(inst, inst.staged)); // keep open/exploded offsets
    const fp = [...instances.values()].find(x => x.cfg.rides && x.cfg.rides === inst.cfg.rides && typeByNode[x.cfg.node] === 'Faceplate');
    if (fp) {
      const fpH = faceplateHeightOf(fp.cfg.node);
      // faceplate front = its z-center + half the plate's REAL depth (measured
      // off the loaded template — 2.5 for Essential; collection-agnostic, and
      // it stays sane even if the plate family was swapped under the handles)
      inst.cfg.pos = [inst.cfg.pos[0], fp.cfg.pos[1] + (fpH - style.h) / 2 - 0.5, fp.cfg.pos[2] + nodeDepth(fp.cfg.node) / 2 + style.d / 2];
    }
    inst.cfg.node = style.node;
    inst.group.clear();
    inst.group.add(templates[style.node].clone(true));
    setPartShadows(inst.group, renderer.shadowMap.enabled);   // the template was never flagged (see setPartShadows)
    inst.group.position.copy(basePos(inst, inst.staged)).add(off);
  }
  markShadowDirty();   // the swap happens at rest
  if (!oldNode || oldNode === style.node) return;
  typeByNode[style.node] = 'Handle';
  const row = manifest.parts.find(p => p.node === oldNode);
  if (row) {
    row.node = style.node;
    row.label = `${style.label} Handle`;
    row.links = HANDLE_LINKS[style.planner];
    delete partInfoByNode[oldNode];
    partInfoByNode[style.node] = row;
    renderChecklist();
  }
  /* The family can change the handle's BUILD AXIS (Deco prints top-down; BlockBar and Crystal have no
     pose), and nothing here re-mounts - so drop the stale materials and put the live meshes of those
     types back on rebuilt ones. After the row rename above: handleFamilyNow reads that row. */
  const staleTypes = dropStaleAxisMaterials(['Handle']);
  if (staleTypes.length) {
    for (const inst of instances.values()) {
      if (!staleTypes.includes(typeByNode[inst.cfg.node])) continue;
      inst.group.traverse((o) => { if (o.isMesh) o.material = materialFor(inst, false, o.userData.zone); });
    }
    applyPalette();
  }
  syncBuildToPlanner(); // live-sync the planner tab that opened us (no-op if opened cold)
}
async function cycleHandleStyle(dir) {
  const idx = currentHandleStyleIndex();
  if (idx < 0) return;
  // a style whose GLB is missing from this kit's folder applies as `false`
  // (rolled back) — keep stepping in the same direction so ▶ always lands on
  // a REAL style instead of silently doing nothing on the gap
  let next = null;
  for (let hop = 1; hop <= HANDLE_STYLES.length; hop++) {
    const cand = HANDLE_STYLES[(idx + dir * hop + HANDLE_STYLES.length * hop) % HANDLE_STYLES.length];
    if (await applyHandleStyle(cand) !== false) { next = cand; break; }
  }
  if (!next) return; // nothing but the current style is available
  // name the style LANDED ON, not the direction — "which handles do people
  // actually choose" is the question; ◀ vs ▶ answers nothing (9 fixed values).
  // Tracked here rather than at the two call sites so the identify card and the
  // Build options ◀▶ both count through one place.
  track('style:handle:' + slug(next.label));
  $('style-name').textContent = next.label;
  if (!selectedId) return;
  const inst = instances.get(selectedId);
  if (typeByNode[inst.cfg.node] !== 'Handle') return;
  refreshSelHighlight(); // no glow if the filament menu is open (color mode)
  selAnchor = new THREE.Box3().setFromObject(inst.group).getCenter(new THREE.Vector3()).sub(inst.group.position);
  const info = partInfoByNode[inst.cfg.node] || { label: next.label };
  $('identify-name').textContent = info.label;
  renderIdentifyLinks(info);
}
// ---------- faceplate style swap ----------
// Like the handle swap, but faceplates are PER-SIZE (the whole family swaps,
// each plate keeping its W-H code) and the families mount differently: the
// swap preserves each plate's MOUNTING PLANE (back face against the drawer
// front) by re-deriving z from the two templates' REAL depths — measured off
// the loaded GLBs, never hardcoded (center-mode canonical ⇒ back = −depth/2).
// EdgeLabel prints its grip INTO the plate, so its style SUPPRESSES every
// bolt-on Handle instance + BOM row (inst/row.styleHidden — honored by
// applyState/exploded/phases/computeBounds/checklist/bomRows); switching back
// restores them untouched (their cfg was never edited).
const FACEPLATE_STYLES = [
  // faceplates are SHARED hardware — the same GLBs serve every collection
  // (each parts/<L> pool carries copies; placement shifts −dz per collection,
  // sign included: 240/270 shift outward)
  // img/links mirror generate.js (imgFor + LINKS.fp/fpe) so a static-kit swap
  // dresses its BOM row exactly like a generated build's
  { key: 'essential', label: 'Essential', node: c => `Faceplate_Essential_${c}`, hasHandle: true,  collections: ['185', '165', '59', '115', '240', '270'],
    img: c => 'img/parts/Faceplate-Essential.jpg',
    links: { p: 'https://www.printables.com/model/964559-gen2-decor-faceplates-essential-series', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20-%20Faceplates%20-%20Essential%20Series-1116946' } },
  // the FREE Classic series (2026-07-25) — 4-zone plate (BODY/FACE/GRIP/GRIP
  // ACCENT, a fourth swatch that renderZoneChips discovers for free), grip
  // printed IN and NO dressing at all: the only family that needs zero bought
  // hardware, which is why the official starter kits ship it. NB the node
  // prefix is ClassicDecor_ (the exporter's name) while the family is
  // "Classic" — distinct from Classic Pro below, and neither prefix is a
  // prefix of the other, so currentFaceplateStyle()'s startsWith is safe.
  { key: 'classic', label: 'Classic', node: c => `Faceplate_ClassicDecor_${c}`, hasHandle: false, collections: ['185', '165', '59', '115', '240', '270'],
    img: c => `img/parts/ClassicDecor_${c}.png`, // per-size renders, 2026-07-25 batch
    links: { p: 'https://www.printables.com/model/1280870-gen2-decor-faceplates-classic-series', t: 'https://than.gs/m/1334047' } },
  { key: 'edgelabel', label: 'EdgeLabel', node: c => `Faceplate_EdgeLabel_${c}`, hasHandle: false, collections: ['185', '165', '59', '115', '240', '270'],
    img: c => `img/parts/EdgeLabel_${c}.png`, // per-size renders, 2026-07-08 batch
    links: { p: 'https://www.printables.com/model/1093933-gen2-decor-faceplates-edgelabel-series', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20-%20Faceplate%20-%20EdgeLabel-1215609' } },
  // 3-zone plate (BODY/GRIP/GRIP ACCENT — the identify card grows a third
  // swatch via the generic renderZoneChips); grip scoop at the top with the
  // tilted label riding its slope
  { key: 'classicpro', label: 'Classic Pro', node: c => `Faceplate_ClassicPro_${c}`, hasHandle: false, collections: ['185', '165', '59', '115', '240', '270'],
    img: c => `img/parts/ClassicPro_${c}.png`, // per-size renders, 2026-07-13 batch
    links: { p: 'https://www.printables.com/model/1291210-gen2-decor-faceplates-classic-pro-series', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20-%20Faceplates%20-%20Classic%20Pro%20Series-1332444' } },
  // the PREMIUM Chevron series (2026-08-08, club family) — 2-zone plate
  // (BODY/FACE: the many angled strips ship as ONE recolorable FACE zone)
  // with the Essential-style bolt-on handle.
  { key: 'chevron', label: 'Chevron', node: c => `Faceplate_Chevron_${c}`, hasHandle: true, collections: ['185', '165', '59', '115', '240', '270'],
    img: c => `img/parts/Chevron_${c}.png`, // per-size renders, 2026-08-08 batch
    links: { p: 'https://www.printables.com/model/968654-gen2-decor-faceplates-chevron-series', t: 'https://than.gs/m/1116950' } },
];
const fpSizeCode = node => (node.match(/_(\dW-\d+H)$/) || [])[1] || null;
const availableFaceplateStyles = () => FACEPLATE_STYLES.filter(s => s.collections.includes(manifest.collection || '185'));
// label-bearing families link out to their label generator, carrying the
// build's typed drawer labels so they pre-fill there — the SAME
// `#labels=<base64 JSON array>` handoff the planner's own button uses
// (updateLabelGenLink in planner app.js; URLs from its faceplateStyles data)
const LABEL_GEN_URLS = { edgelabel: 'https://edgelabel.jerrari3d.com/', classicpro: 'https://classic.jerrari3d.com/' };
// The label-gen pill and the filament menu's Buy button are STATIC anchors (the
// markup owns them, only the href is swapped), so they miss linkEl's tracking —
// one listener each, wired once at module level.
$('identify-label-gen').addEventListener('click', () => track('labelgen:' + (currentFaceplateStyle()?.key || 'unknown')));
$('fm-buy').addEventListener('click', () => track(buyFilamentEvent(customColors[fmType])));
function labelGenInfo() {
  const url = LABEL_GEN_URLS[currentFaceplateStyle()?.key];
  if (!url) return null;
  const labels = build ? build.placed.filter(p => p.fill === 'decor' && p.label).map(p => p.label) : [];
  return { href: url + (labels.length ? '#labels=' + btoa(unescape(encodeURIComponent(JSON.stringify(labels)))) : ''), count: labels.length };
}
const currentFaceplateStyle = () => {
  const inst = [...instances.values()].find(i => typeByNode[i.cfg.node] === 'Faceplate');
  return inst ? FACEPLATE_STYLES.find(s => inst.cfg.node.startsWith(s.node(''))) || null : null;
};
const nodeDepths = {};
const nodeDepth = node => {
  if (!(node in nodeDepths)) nodeDepths[node] = new THREE.Box3().setFromObject(templates[node]).getSize(new THREE.Vector3()).z;
  return nodeDepths[node];
};
// what SHOULD this instance's visibility be right now, per the current page —
// used to reconcile handles after a suppress/restore without a full applyState
function pageVisibility(inst) {
  if (inst.styleHidden) return false;
  const page = PAGES[cur];
  if (!page || page.cover || page.outro) return inst.group.visible;
  const step = manifest.steps[cur - 1];
  if (step?.checklist) return true;
  return !!afterState[cur - 1]?.visible.has(inst.cfg.id);
}
let activeFaceplateStyle = null; // kit-swap memory (generated builds carry the family in build.faceStyle instead)
async function applyFaceplateStyle(style) {
  ao.rev++;   // static kits swap plates/dressing in place - no mountManifest to bump it
  /* ⚠ THE FAMILY DECIDES WHICH WAY THE PLATE PRINTS, so it decides which way its layer lines
     run: Classic/ClassicPro/EdgeLabel print back-down and grow along +Z, Essential and Chevron
     print FACE-down and grow along −Z. The Faceplate materials are keyed by type and are NOT
     rebuilt by a style swap - ensureMaterials is idempotent - so without this they keep the
     previous family's axis, and both paths below (generated and static-kit) need it. */
  dropFaceplateMaterials();
  const prevActive = activeFaceplateStyle;
  activeFaceplateStyle = style;
  if (build) {
    // generated builds go through the GENERATOR — it emits the full family
    // natively (EdgeLabel brings its accent + label and drops the handles) and
    // the planner's own `faceStyle` field carries it in share links. Keep the
    // user's selection: the plate ids are deterministic across regenerates.
    build.faceStyle = style.key;
    const keepSel = selectedId;
    await regenerate();
    if (keepSel && instances.has(keepSel)) setSelected(keepSel); // re-isolate the plate the user was on
    return;
  }
  // static kits: in-place mutation (bare plate swap — kits author their own extras)
  const fps = [...instances.values()].filter(i => typeByNode[i.cfg.node] === 'Faceplate');
  if (!fps.length) return;
  // lazy-load every size the scene needs in the new family (zone tags included)
  const codes = [...new Set(fps.map(i => fpSizeCode(i.cfg.node)).filter(Boolean))];
  try {
    await Promise.all(codes.map(async code => {
      const node = style.node(code);
      if (templates[node]) return;
      const gltf = await loader.loadAsync(`${PARTS_BASE}${node}.lib.glb`);
      templates[node] = adoptTemplate(gltf.scene, 'Faceplate', node);
    }));
  } catch (e) {
    // a family size missing from this kit's folder: roll back and report
    // `false` so the ▶ cycle skips past instead of dying silently (same
    // guard as applyHandleStyle — the un-caught await killed the handler)
    activeFaceplateStyle = prevActive;
    console.warn(`Faceplate family "${style.label}" is missing a size GLB in ${PARTS_BASE} - skipped.`);
    return false;
  }
  for (const inst of fps) {
    const code = fpSizeCode(inst.cfg.node);
    if (!code) continue;
    const newNode = style.node(code);
    if (newNode === inst.cfg.node) continue;
    const off = inst.group.position.clone().sub(basePos(inst, inst.staged)); // keep open/exploded offsets
    const back = inst.cfg.pos[2] - nodeDepth(inst.cfg.node) / 2; // the mounting plane stays put
    inst.cfg.pos = [inst.cfg.pos[0], inst.cfg.pos[1], back + nodeDepth(newNode) / 2];
    inst.cfg.node = newNode;
    typeByNode[newNode] = 'Faceplate';
    inst.group.clear();
    inst.group.add(templates[newNode].clone(true));
    setPartShadows(inst.group, renderer.shadowMap.enabled);   // the template was never flagged (see setPartShadows)
    inst.group.position.copy(basePos(inst, inst.staged)).add(off);
  }
  // handles: EdgeLabel's grip is part of the plate print — no bolt-on part.
  // Inside the plate isolation everything is hidden anyway; exitFaceplateFocus
  // runs the same reconcile so restored handles reappear on deselect.
  for (const inst of instances.values()) {
    // the M3 handle screws are bolt-on hardware too (static kits carry them
    // as of 2026-08-08) — they hide and return with the handles
    if (typeByNode[inst.cfg.node] !== 'Handle' && inst.cfg.node !== 'ButtonHeadScrew_M3-6') continue;
    inst.styleHidden = !style.hasHandle;
    if (!fpFocus.id) inst.group.visible = pageVisibility(inst);
    else if (inst.styleHidden) inst.group.visible = false;
  }
  markShadowDirty();   // new plates, and handles hidden or shown, at rest
  // BOM: faceplate rows follow the family; Handle rows hide with the style.
  // The original rows (labels/links/renders) are backed up on first swap so
  // returning to the manifest's own family restores them exactly.
  for (const row of manifest.parts) {
    if (row.type === 'Handle' || row.node === 'ButtonHeadScrew_M3-6') { row.styleHidden = !style.hasHandle; continue; }
    if (row.type !== 'Faceplate') continue;
    const code = fpSizeCode(row.node);
    if (!code) continue;
    row._origFp = row._origFp || { node: row.node, label: row.label, links: row.links, img: row.img };
    const newNode = style.node(code);
    if (newNode === row.node) continue;
    delete partInfoByNode[row.node];
    if (newNode === row._origFp.node) Object.assign(row, row._origFp);
    else {
      row.node = newNode;
      row.label = `${style.label} Faceplate ${code}`;
      row.img = style.img(code);       // per-size renders + Series pages follow
      row.links = style.links;         // the family (public since 2026-07-10)
    }
    partInfoByNode[row.node] = row;
  }
  renderChecklist();
  computeBounds(); // the envelope changed (24 mm plate vs 5 mm plate + handle) — dims/wall sizing follow
  setDims(dims.on); // rebuild the callouts if they're showing
  syncBuildToPlanner(); // no-op if opened cold; carries build.faceplateStyle
}
async function cycleFaceplateStyle(dir) {
  const styles = availableFaceplateStyles();
  const curStyle = currentFaceplateStyle();
  if (styles.length < 2 || !curStyle) return;
  // hop past any family whose GLBs are missing from this kit's folder
  // (applyFaceplateStyle rolls back and reports `false`) — mirrors the
  // handle cycle's skip so ▶ never reads as a dead button
  let next = null;
  const from = Math.max(0, styles.indexOf(curStyle));
  for (let hop = 1; hop <= styles.length; hop++) {
    const cand = styles[(from + dir * hop + styles.length * hop) % styles.length];
    if (cand === curStyle) break;
    if (await applyFaceplateStyle(cand) !== false) { next = cand; break; }
  }
  if (!next) return;
  track('style:faceplate:' + slug(next.label)); // 4 families — the upsell ladder, measured
  $('style-name').textContent = next.label;
  if (!selectedId) return;
  const inst = instances.get(selectedId);
  if (typeByNode[inst.cfg.node] !== 'Faceplate') return;
  refreshSelHighlight(); // no glow if the filament menu is open (color mode)
  renderZoneChips(inst); // EdgeLabel gains the Grip swatch, Essential drops it
  selAnchor = new THREE.Box3().setFromObject(inst.group).getCenter(new THREE.Vector3()).sub(inst.group.position);
  const info = partInfoByNode[inst.cfg.node] || { label: `${next.label} Faceplate` };
  $('identify-name').textContent = info.label;
  $('identify-img').classList.add('hidden');
  if (info.img) { const img = $('identify-img'); img.onerror = () => img.classList.add('hidden'); img.src = info.img; img.classList.remove('hidden'); }
  renderIdentifyLinks(info);
}
// the ◀ ▶ row serves whichever swappable part is selected
const cycleStyle = dir => {
  const inst = selectedId && instances.get(selectedId);
  if (!inst) return;
  const t = typeByNode[inst.cfg.node];
  if (t === 'Handle') cycleHandleStyle(dir);          // both cycles track themselves
  else if (t === 'Faceplate') cycleFaceplateStyle(dir);
};
$('style-prev').onclick = () => cycleStyle(-1);
$('style-next').onclick = () => cycleStyle(1);

/* ⚠ The field's ABSENCE is "no lip" — never write `lip: false`/`null`, or a
   build stops round-tripping through a planner share link that never carried
   the key. Joey's rule is front first, always, so the cycle is
   None → Front → Front + mid and a rear-only shelf is unreachable by design. */
const cycleLip = async (dir) => {
  if (!lipUnit || regenBusy) return;
  const modes = shelfLipModes(parseInt(manifest.collection, 10) || 185);
  const cur = modes.indexOf(lipUnit.lip ?? null);
  const next = modes[((cur < 0 ? 0 : cur) + dir + modes.length) % modes.length];
  if (next) lipUnit.lip = next; else delete lipUnit.lip;
  track('opt:shelflip:' + (next || 'none'));
  const keepUnit = lipUnit, keep = selectedId;   // setSelected reassigns lipUnit
  await regenerate();
  /* Re-open the card on the same part — instance ids are deterministic, so
     without this the card closes on every click and the ◀▶ is unusable.
     ⚠ If the LIP you were looking at is the one that just went away, fall back
     to the shelf INSERT of the same unit: otherwise the control deletes its own
     anchor the first time you cycle to "No lip" and there is no way back. */
  let re = instances.has(keep) ? keep : null;
  if (!re) for (const [id, inst] of instances)
    if (inst.cfg.owner === keepUnit.id && typeByNode[inst.cfg.node] === 'ShelfInsert') { re = id; break; }
  if (re) setSelected(re);
};
$('lip-prev').onclick = () => cycleLip(-1);
$('lip-next').onclick = () => cycleLip(1);

/* Two stops, so ◀ and ▶ both flip it. ⚠ The field's ABSENCE is the standard
   drawer — never write `variant: 'standard'`, for the same share-link reason as
   the lip. The drawer is open and the camera zoomed on it when this runs:
   regenerate() deselects, which starts the zoom-out, and paging lands the step's
   camera. Holding the pose and the pre-zoom view across the swap keeps the new
   body sliding out in the same shot, and closing it still returns to the view
   from before the zoom. */
const cycleVariant = async () => {
  if (!variantUnit || regenBusy) return;
  const next = variantUnit.variant === 'gridfinity' ? 'standard' : 'gridfinity';
  if (next === 'gridfinity') variantUnit.variant = next; else delete variantUnit.variant;
  track('opt:gridfinity:' + next);
  const keep = selectedId;
  const home = dFocus.saved && { pos: dFocus.saved.pos.clone(), target: dFocus.saved.target.clone() };
  const pose = { pos: camera.position.clone(), target: controls.target.clone() };
  await regenerate();
  if (!instances.has(keep)) return;
  ++camTweenToken;                      // the deselect's zoom-out
  camera.position.copy(pose.pos); controls.target.copy(pose.target);
  if (home) dFocus.saved = home;
  setSelected(keep);
};
$('variant-prev').onclick = cycleVariant;
$('variant-next').onclick = cycleVariant;
// remove the selected optional part (magnet closure for its drawer, or a 1W
// stopper pair), then regenerate + update the BOM
$('identify-remove').onclick = async () => {
  const inst = selectedId && instances.get(selectedId);
  if (!inst || !build) return;
  const type = typeByNode[inst.cfg.node];
  if (type === 'Stopper' && inst.cfg.stopperKey) {
    track('opt:remove-stopper');
    build.removedStoppers = [...new Set([...(build.removedStoppers || []), inst.cfg.stopperKey])];
  } else if ((type === 'MagnetClip' || type === 'Magnet') && inst.cfg.owner != null) {
    track('opt:remove-magnet');
    const d = build.placed.find(u => u.id === inst.cfg.owner);
    if (d) d.closure = 'none'; else return;
  } else return;
  setSelected(null);
  await regenerate();
};
// faceplate isolation → drawer hand-off: "Open the drawer" re-selects the
// drawer BODY, which runs the normal deep-pull + interior-dims focus. The
// pre-isolation camera pose transfers to the drawer focus so the final
// deselect still returns to where the user started.
$('identify-open-drawer').onclick = () => {
  const inst = selectedId && instances.get(selectedId);
  const carrier = inst && drawerCarrier(inst);
  if (!carrier) return;
  if (fpFocus.saved && !dFocus.saved) { dFocus.saved = fpFocus.saved; fpFocus.saved = null; }
  openCarrier = carrier; // counts as "seated" even if a shut-slide is still in flight
  setSelected(carrier.cfg.id);
};
// the obvious way OUT of an open drawer (an empty tap still works too)
$('identify-close-drawer').onclick = () => setSelected(null);

canvas.addEventListener('pointerdown', e => { downXY = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', e => {
  // The cover and outro are PRESENTATION pages (box art / end-credits cinema) —
  // taps there must not identify parts: a stray cover click used to raycast the
  // model and ISOLATE a faceplate underneath the cover chrome (Joey's official-
  // kit repro, 2026-07-23 — latent on every cover; the telephoto framing makes
  // a face-on plate the likeliest hit). Orbit/zoom stay free; identify starts
  // with the instruction pages.
  // part-preview measure is the ONE tap path allowed past the cover guard —
  // identify stays inert there (cur is 0 by design), but the measure pill is
  // a deliberate mode the user switched on (2026-08-20, the site's expanded
  // inspection view)
  if ((PAGES[cur]?.cover || PAGES[cur]?.outro) && !(IS_PART && measure.on)) return;
  if (!downXY || Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 6) return;
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(
    ((e.clientX - r.left) / r.width) * 2 - 1,
    -((e.clientY - r.top) / r.height) * 2 + 1
  ), camera);
  // faceplate isolation: only the plate + its dressing are tappable (mid-fade
  // parts are still technically visible — anything else counts as empty space)
  const pickable = [...instances.values()].filter(i => i.group.visible &&
    (!fpFocus.id || i.cfg.id === fpFocus.id || fpFocus.mates.has(i.cfg.id)));
  const hits = ray.intersectObjects(pickable.map(i => i.group), true);
  if (measure.on) { // measure mode swallows taps: surface point, not part identity
    // on a plate boot the slab is a legitimate target too — free points on the
    // plate SURFACE, measured manually (never claimed as an edge-clearance
    // result; that precision is a future automatic callout)
    const targets = pickable.map(i => i.group);
    if (IS_PART && plateStage.group) targets.push(plateStage.group.children[0]);
    const mhits = ray.intersectObjects(targets, true);
    if (mhits.length) addMeasurePoint(mhits[0].point);
    else clearMeasure(); // empty tap wipes the current measurement (stay in mode)
    return;
  }
  if (!hits.length) { setSelected(null); return; }
  let o = hits[0].object;
  while (o && !o.userData.instanceId) o = o.parent;
  setSelected(o ? o.userData.instanceId : null);
});

// ---------- measure tool ----------
// PrusaSlicer-lite: two taps on part surfaces → markers + a line + a floating
// distance readout. The scene is authored in REAL millimetres (GLBs + every
// generate.js placement number), so the measured distance IS the mm value —
// no scaling. Markers rescale each frame to stay a constant on-screen size.
// Page changes clear it (parts move between steps, measurements go stale).
const measure = { on: false, pts: [], marks: [], line: null };
const measureMat = new THREE.MeshBasicMaterial({ color: 0xff8a40, depthTest: false, transparent: true });
function clearMeasure() {
  measure.pts = [];
  for (const m of measure.marks) scene.remove(m);
  measure.marks = [];
  if (measure.line) { scene.remove(measure.line); measure.line = null; }
  $('measure-label').classList.add('hidden');
}
function setMeasure(on) {
  measure.on = on;
  $('measure-toggle').classList.toggle('on', on);
  if (on) setSelected(null); // identify and measure are mutually exclusive
  else clearMeasure();
}
// only the deliberate tap counts — goTo() calls setMeasure(false) on every page
$('measure-toggle').onclick = () => { if (!measure.on) track('tool:measure'); setMeasure(!measure.on); };
function addMeasurePoint(p) {
  if (measure.pts.length >= 2) clearMeasure(); // 3rd tap starts a fresh measurement
  measure.pts.push(p.clone());
  const mark = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), measureMat);
  mark.position.copy(p);
  mark.renderOrder = 999; // depthTest off → always visible, even inside parts
  scene.add(mark);
  measure.marks.push(mark);
  if (measure.pts.length === 2) {
    const [a, b] = measure.pts;
    measure.line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([a, b]),
      new THREE.LineBasicMaterial({ color: 0xff8a40, depthTest: false, transparent: true }));
    measure.line.renderOrder = 998;
    scene.add(measure.line);
    // Case honesty hint (part-preview only): measured geometry is the PHYSICAL
    // part — a case reads 3mm taller than its installed height because the
    // dovetail nests into the unit above (the locked calibration rule)
    const caseHint = IS_PART && manifest.parts[0]?.type === 'Case'
      ? '<small>physical geometry - a case measures 3mm taller than its installed height (the dovetail nests into the unit above)</small>' : '';
    $('measure-label').innerHTML = `${a.distanceTo(b).toFixed(1)} mm` +
      `<small>&#916;X ${Math.abs(b.x - a.x).toFixed(1)} &middot; &#916;Y ${Math.abs(b.y - a.y).toFixed(1)} &middot; &#916;Z ${Math.abs(b.z - a.z).toFixed(1)}</small>` + caseHint;
  }
}
function updateMeasure() { // render-loop: constant marker screen-size + label tracking
  for (const m of measure.marks) m.scale.setScalar(camera.position.distanceTo(m.position) * 0.006);
  const label = $('measure-label');
  if (measure.pts.length !== 2) return;
  const mid = measure.pts[0].clone().add(measure.pts[1]).multiplyScalar(0.5).project(camera);
  if (mid.z > 1) { label.classList.add('hidden'); return; } // midpoint behind the camera
  const r = canvas.getBoundingClientRect();
  label.style.left = ((mid.x + 1) / 2 * r.width) + 'px';
  label.style.top = ((1 - mid.y) / 2 * r.height) + 'px';
  label.classList.remove('hidden');
}

// ---------- overall dimensions (final assembled step) ----------
// Product-diagram style W / H / L callouts along the assembled build's bounding
// box. True physical envelope (handles/faceplates/bracket included, screws
// excluded), labelled in mm + inches. The edges the lines ride are chosen PER
// CAMERA (Joey: a line that ends up over the build should redraw somewhere
// clear): H hops between the four vertical corners to the screen-OUTERMOST one
// (offset diagonally outward = it can never overlap the model), W and L flip
// to whichever floor edge faces the camera. Geometry rebuilds only when that
// choice changes; labels re-place only when the camera pose changes.
const dims = { on: false, group: null, lines: {}, choice: '', hCorner: null, lastKey: null };
function setDims(on) {
  dims.on = on && !assembledBox.isEmpty();
  dims.choice = ''; dims.hCorner = null; dims.lastKey = null;
  if (dims.group) { scene.remove(dims.group); dims.group.traverse(o => o.geometry?.dispose()); dims.group = null; }
  for (const id of ['dim-w', 'dim-h', 'dim-l']) $(id).classList.add('hidden');
  if (!dims.on) return;
  const size = assembledBox.getSize(new THREE.Vector3());
  const mmIn = (mm, axis) => `<b>${axis}</b> ${mm.toFixed(0)} mm<small>${(mm / 25.4).toFixed(1)} in</small>`;
  $('dim-w').innerHTML = mmIn(size.x, 'W');
  $('dim-h').innerHTML = mmIn(size.y, 'H');
  $('dim-l').innerHTML = mmIn(size.z, 'L');
  // lines + labels materialize in updateDims (they depend on the camera)
}
function buildDimLines(wFront, lRight, hsx, hsz) {
  if (dims.group) { scene.remove(dims.group); dims.group.traverse(o => o.geometry?.dispose()); dims.group = null; }
  const b = assembledBox, size = b.getSize(new THREE.Vector3());
  const gap = Math.max(30, Math.max(size.x, size.y, size.z) * 0.08); // breathing room off the model
  const t = 8; // tick half-length
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const segs = [];
  const line = (a, c, tickDir) => { // main segment + perpendicular end ticks
    segs.push(a, c);
    for (const end of [a, c]) segs.push(end.clone().addScaledVector(tickDir, -t), end.clone().addScaledVector(tickDir, t));
    return { a, c }; // endpoints — updateDims anchors the label ON this line
  };
  // floor lines sit +1 mm above b.min.y so they don't z-fight the table plane
  const floorY = b.min.y + 1;
  const wz = wFront ? b.max.z + gap : b.min.z - gap;  // W: the floor edge facing the camera
  const lx = lRight ? b.max.x + gap : b.min.x - gap;  // L: same, left/right
  const hx = hsx > 0 ? b.max.x + gap : b.min.x - gap; // H: screen-outermost corner, pushed out
  const hz = hsz > 0 ? b.max.z + gap : b.min.z - gap; //    diagonally so it clears the build
  dims.lines = {
    'dim-w': line(V(b.min.x, floorY, wz), V(b.max.x, floorY, wz), V(0, 0, wFront ? 1 : -1)),
    'dim-h': line(V(hx, b.min.y, hz), V(hx, b.max.y, hz), V(hsx, 0, hsz).normalize()),
    'dim-l': line(V(lx, floorY, b.min.z), V(lx, floorY, b.max.z), V(lRight ? 1 : -1, 0, 0)),
  };
  const geo = new THREE.BufferGeometry().setFromPoints(segs);
  dims.group = new THREE.Group();
  // depth-tested (unlike the measure tool): the lines sit OUTSIDE the box, so
  // any segment the model hides is genuinely behind the build — occluding it
  // reads as physical, and nothing draws over the model
  dims.group.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: STAGE_THEMES[stageTheme].dim, transparent: true, opacity: 0.85 })));
  scene.add(dims.group);
}
const dimRay = new THREE.Raycaster();
const dimCover = createDimCoverTest(THREE);   // MOVE_OPT.labels: one walk of the parts per placement pass, see dim-cover.js
function updateDims() { // render-loop: pick edges for the camera, then place labels ON their lines
  if (!dims.on) return;
  const r = canvas.getBoundingClientRect();
  // static camera → nothing to do (edge choice + placement both raycast)
  const key = camera.matrixWorld.elements.map(e => e.toFixed(2)).join() + '|' + r.width + 'x' + r.height;
  if (dims.lastKey === key) return;
  dims.lastKey = key;
  // broad-phase: the model's projected-AABB rect. Points OUTSIDE it are visible
  // for free; points inside get a precise raycast (the rect over-covers at 3/4
  // angles — its empty corners are fine places for a label).
  const b = assembledBox, ctr = b.getCenter(new THREE.Vector3());
  let rx0 = Infinity, ry0 = Infinity, rx1 = -Infinity, ry1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    const c = new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(camera);
    if (c.z > 1) continue;
    const sx = (c.x + 1) / 2 * r.width, sy = (1 - c.y) / 2 * r.height;
    rx0 = Math.min(rx0, sx); rx1 = Math.max(rx1, sx);
    ry0 = Math.min(ry0, sy); ry1 = Math.max(ry1, sy);
  }
  const cx = (rx0 + rx1) / 2, cy = (ry0 + ry1) / 2;
  // the desktop parts panel overlays the canvas's right side when open — keep
  // the H line (and clamp all labels) clear of it
  const cp = $('checklist-panel');
  const panelLeft = (!cp.classList.contains('hidden') && !isMobile())
    ? cp.getBoundingClientRect().left - r.left : Infinity;
  // ---- choose the edges for this view --------------------------------------
  const wFront = camera.position.z >= ctr.z;
  const lRight = camera.position.x >= ctr.x;
  // H: score each vertical corner by how far OUT it projects horizontally —
  // the screen-outermost corner clears the silhouette. Penalize corners under
  // the parts panel; 15% hysteresis so the line doesn't flip-flop mid-orbit.
  let hBest = null, hCur = null;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = new THREE.Vector3(sx > 0 ? b.max.x : b.min.x, ctr.y, sz > 0 ? b.max.z : b.min.z).project(camera);
    if (p.z > 1) continue;
    const px = (p.x + 1) / 2 * r.width;
    // penalize corners whose LABEL would have no room before the panel (pill
    // needs ~90px) — not just corners literally under it
    const score = Math.abs(px - cx) * (px > panelLeft - 90 ? 0.25 : 1);
    const cand = { sx, sz, score };
    if (!hBest || score > hBest.score) hBest = cand;
    if (dims.hCorner && sx === dims.hCorner.sx && sz === dims.hCorner.sz) hCur = cand;
  }
  if (!hBest) { for (const id of ['dim-w', 'dim-h', 'dim-l']) $(id).classList.add('hidden'); return; }
  const hPick = (hCur && hBest.score < hCur.score * 1.15) ? hCur : hBest;
  dims.hCorner = hPick;
  const choice = `${wFront}|${lRight}|${hPick.sx},${hPick.sz}`;
  if (choice !== dims.choice || !dims.group) { dims.choice = choice; buildDimLines(wFront, lRight, hPick.sx, hPick.sz); }
  // ---- place the labels on their lines -------------------------------------
  const targets = [...instances.values()].filter(i => i.group.visible).map(i => i.group);
  let coverPrepared = false;
  const modelCovers = (ndcX, ndcY, worldPt) => { // is the model IN FRONT of this line point?
    dimRay.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const maxD = camera.position.distanceTo(worldPt) - 2;
    if (!MOVE_OPT.labels) { const hit = dimRay.intersectObjects(targets, true)[0]; return !!hit && hit.distance < maxD; }
    // the same answer without a scene-graph walk per ray: one walk per pass (dim-cover.js, test/dim-cover.test.mjs)
    if (!coverPrepared) { dimCover.prepare(targets); coverPrepared = true; }
    return dimCover.covers(dimRay, maxD);
  };
  // center-out walk: 0.5, ±1/16, ±2/16 … — the label sits at the line's MIDDLE
  // whenever the view allows and only slides along the line as far as needed
  const T = [0]; for (let k = 1; k <= 8; k++) T.push(k, -k);
  const placedRects = []; // labels must not overlap each other either
  for (const [id, seg] of Object.entries(dims.lines)) {
    const el = $(id);
    const hw = el.offsetWidth / 2 + 8, hh = el.offsetHeight / 2 + 6; // pill half-size + breathing room
    let pos = null, fallback = null, fallbackDist = -1;
    for (const off of T) {
      const t01 = 0.5 + off / 16;
      const wp = seg.a.clone().lerp(seg.c, t01);
      const p = wp.clone().project(camera);
      if (p.z > 1) continue;
      const x = (p.x + 1) / 2 * r.width, y = (1 - p.y) / 2 * r.height;
      const collides = placedRects.some(q => x + hw > q.x0 && x - hw < q.x1 && y + hh > q.y0 && y - hh < q.y1);
      if (!collides) {
        const dc = Math.hypot(x - cx, y - cy);
        if (dc > fallbackDist) { fallbackDist = dc; fallback = { x, y } };
        const inRect = x > rx0 - hw && x < rx1 + hw && y > ry0 - hh && y < ry1 + hh;
        if (!inRect || !modelCovers(p.x, p.y, wp)) { pos = { x, y }; break; } // first clear spot walking out from center
      }
    }
    pos = pos || fallback; // whole line covered → least-bad point (farthest from the model, still on the line)
    if (!pos) { el.classList.add('hidden'); continue; } // entire line behind the camera
    // clamp to the viewport (and clear of the parts panel) — the label pins to
    // the edge if a tight crop pushes its line point off-screen
    const maxX = Math.min(r.width - 40, panelLeft - hw);
    const fx = Math.min(Math.max(pos.x, 40), Math.max(40, maxX)), fy = Math.min(Math.max(pos.y, 24), r.height - 24);
    placedRects.push({ x0: fx - hw, x1: fx + hw, y0: fy - hh, y1: fy + hh });
    el.style.left = fx + 'px';
    el.style.top = fy + 'px';
    el.classList.remove('hidden');
  }
  // first pass after setDims runs with hidden labels (offsetWidth 0) — their
  // real sizes exist next frame; force one more placement pass then
  if (['dim-w', 'dim-h', 'dim-l'].some(id => !$(id).offsetWidth)) dims.lastKey = null;
}

// ---------- outro party dressing ----------
// The finale gets stage treatment: the room dims to night, an HDR-style
// emissive "party room" environment (PMREM, no .hdr file — offline-safe)
// puts colored reflections on the plastic, two hue-drifting party lights
// circle the build, and confetti poppers fire on scene cuts. Everything
// mounts in startCinema and unmounts in stopCinema — instruction pages
// never see any of it.
const party = {
  fade: 0, cuts: 0,
  env: null, sky: null, rig: null, spots: [],
  bgDay: scene.background.clone(), bgNight: new THREE.Color(0x14171e),
  tableDay: table.material.color.clone(), tableNight: new THREE.Color(0x252a32),
};
// The outro sky: a retrowave gradient instead of a flat night colour (Joey
// 2026-08-08). A plain Texture assigned to scene.background is drawn stretched
// across the viewport, which is exactly what a gradient wants — and it is
// SEPARATE from scene.environment, so the party room's PMREM keeps lighting and
// reflecting on the plastic exactly as before. Lazy + cached; 2×256 is plenty
// for a vertical ramp (linear filtering does the smoothing).
function partySky() {
  if (party.sky) return party.sky;
  const c = document.createElement('canvas');
  c.width = 2; c.height = 256;
  const g = c.getContext('2d').createLinearGradient(0, 0, 0, 256);
  // Canvas top maps to the dome's ZENITH (flipY puts image row 0 at v=1), so
  // these stops read top-down and the horizon sits near the middle. The hot
  // band is deliberately just ABOVE 0.5 — the table disc hides everything
  // below the horizon, so a sunset placed at the true bottom is never seen.
  g.addColorStop(0.00, '#05061a');   // deep space overhead
  g.addColorStop(0.30, '#1a0a38');
  g.addColorStop(0.42, '#4d1566');   // violet
  g.addColorStop(0.50, '#a82f70');   // magenta
  g.addColorStop(0.56, '#ff8a40');   // the JERRARI orange sun line, at eye level
  g.addColorStop(0.62, '#2a0f2e');   // falls off fast under the horizon
  g.addColorStop(1.00, '#07061a');
  const ctx = c.getContext('2d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;   // else the ramp renders washed out
  party.sky = tex;
  return tex;
}
// …hung on a big BackSide dome rather than assigned to scene.background, for
// two reasons: it gives a real HORIZON that tracks the camera as the shot
// orbits (a screen-stretched background can't), and being a mesh it has an
// opacity to CROSSFADE with — the room's existing day→night lerp keeps running
// underneath, so the sky arrives without a pop. depthWrite off + renderOrder
// -1 keep it behind everything; radius sits well inside the 8000 far plane.
function partyDome() {
  if (party.dome) return party.dome;
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(6000, 32, 24),
    new THREE.MeshBasicMaterial({ map: partySky(), side: THREE.BackSide,
      transparent: true, opacity: 0, depthWrite: false, fog: false }));
  m.renderOrder = -1;
  party.dome = m;
  return m;
}
function partyEnv() { // lazy: tiny room of glowing panels → PMREM environment
  if (party.env) return party.env;
  const room = new THREE.Scene();
  const panel = (hex, boost, w, h, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(boost), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    room.add(m);
  };
  panel(0xffffff, 5.0, 6, 6, 0, 9, 0);      // key: big soft ceiling bounce
  panel(0xff4f81, 2.5, 8, 5, -10, 3, 2);    // magenta wash
  panel(0x38b6ff, 2.5, 8, 5, 10, 3, -2);    // cyan wash
  panel(0xffb347, 1.8, 10, 4, 0, 2, -11);   // amber back glow
  const pmrem = new THREE.PMREMGenerator(renderer);
  party.env = pmrem.fromScene(room, 0.04).texture;
  pmrem.dispose();
  return party.env;
}
function partyRig() {
  if (party.rig) return party.rig;
  party.rig = new THREE.Group();
  for (const hex of [0xff4f81, 0x38b6ff]) {
    const l = new THREE.PointLight(hex, 2.4, 0, 0); // decay 0: plain intensity at any scale
    party.spots.push(l);
    party.rig.add(l);
  }
  return party.rig;
}

// confetti: one InstancedMesh, bits recycled through a free list
const CONFETTI_N = 400;
const CONFETTI_HEX = [0xff8a40, 0x2f9be0, 0xffd23f, 0xff4f81, 0x7bdff2, 0x9b5de5, 0x3ddc84];
const confetti = { mesh: null, bits: [], free: [], m4: new THREE.Matrix4(), q: new THREE.Quaternion(), s3: new THREE.Vector3() };
function confettiInit() { // sized to the build, so it reads at every camera distance
  if (confetti.mesh) return;
  const w = cinema.size * 0.038;
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(w, w * 0.62),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }),
    CONFETTI_N);
  mesh.frustumCulled = false;
  mesh.raycast = () => {}; // never a tap-to-identify target
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const c = new THREE.Color();
  for (let i = 0; i < CONFETTI_N; i++) {
    mesh.setMatrixAt(i, zero);
    mesh.setColorAt(i, c.setHex(CONFETTI_HEX[i % CONFETTI_HEX.length]));
    confetti.free.push(i);
    confetti.bits.push(null);
  }
  mesh.instanceColor.needsUpdate = true;
  confetti.mesh = mesh;
}
function confettiBurst(origin, dir, count, speed) {
  for (let n = 0; n < count && confetti.free.length; n++) {
    const i = confetti.free.pop();
    confetti.bits[i] = {
      p: origin.clone().addScaledVector(new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5), cinema.size * 0.05),
      v: dir.clone()
        .addScaledVector(new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5), 0.85)
        .normalize().multiplyScalar(speed * (0.45 + Math.random() * 0.8)),
      q: new THREE.Quaternion().random(),
      ax: new THREE.Vector3().randomDirection(),
      av: 4 + Math.random() * 9,
      age: 0, life: 4.5 + Math.random() * 2.5,
      wob: Math.random() * Math.PI * 2,
    };
  }
}
function confettiPop(count) { // popper at a random azimuth, aimed up across the build
  const az = Math.random() * Math.PI * 2;
  const origin = new THREE.Vector3(
    cinema.center.x + Math.sin(az) * cinema.size * 0.85,
    cinema.center.y + cinema.size * 0.25,
    cinema.center.z + Math.cos(az) * cinema.size * 0.85);
  const dir = new THREE.Vector3(-Math.sin(az) * 0.55, 1, -Math.cos(az) * 0.55);
  confettiBurst(origin, dir, count, cinema.size * (1.4 + Math.random() * 0.7));
}
function updateConfetti(dt, t) {
  if (!confetti.mesh) return;
  const g = cinema.size * 0.85, drag = 1 - Math.min(1, 0.9 * dt);
  let any = false;
  for (let i = 0; i < CONFETTI_N; i++) {
    const b = confetti.bits[i];
    if (!b) continue;
    any = true;
    b.age += dt;
    if (b.age >= b.life) {
      confetti.bits[i] = null;
      confetti.free.push(i);
      confetti.mesh.setMatrixAt(i, confetti.m4.makeScale(0, 0, 0));
      continue;
    }
    b.v.y -= g * dt;
    b.v.multiplyScalar(drag);
    b.p.addScaledVector(b.v, dt);
    b.p.x += Math.sin(t * 5 + b.wob) * cinema.size * 0.05 * dt; // paper flutter
    if (b.p.y < 3) { // touched the table: rest briefly, then shrink away
      b.p.y = 3;
      b.v.multiplyScalar(0.2);
      b.life = Math.min(b.life, b.age + 0.8);
    }
    confetti.q.setFromAxisAngle(b.ax, b.av * dt);
    b.q.premultiply(confetti.q);
    const k = Math.min(1, (b.life - b.age) / 0.5); // shrink out at end of life
    confetti.mesh.setMatrixAt(i, confetti.m4.compose(b.p, b.q, confetti.s3.setScalar(k)));
  }
  if (any) confetti.mesh.instanceMatrix.needsUpdate = true;
}

// ---------- outro cinema ----------
// End-credits loop for the finished build. Scene modes, cut every ~9 s:
//   0 close orbit · 1 high sweep · 2 slow-mo explode (random depth)
//   3 lateral truck-pan across the build · 4 starts exploded, pulls together
//   5 macro detail: telephoto close-up creeping in on one part
// Assembled scenes (0/1/3/5) randomly play a drawer opening and closing.
// Sun + fill lights drift the whole time. Random per visit.
// Mode mix (Joey 2026-08-08): the outro is a FINISHED build, so it should
// celebrate what the thing DOES, not take it apart again. The two exploded
// shots (2 = slow explode, 4 = reverse assembly) were 2-in-7 of every cut and
// are now 2-in-13, while mode 6 — open a drawer and work its faceplate's own
// feature — gets a triple share. Macro keeps its double.
const CINEMA_MODES = [0, 0, 1, 1, 2, 3, 3, 4, 5, 5, 6, 6, 6];
const DETAIL_TYPES = new Set(['Handle', 'QuickLock', 'Foot', 'FootAdhesive', 'Faceplate']); // exterior parts only — no macro shots of hidden stoppers/magnets
const cinema = {
  on: false, last: 0, cut: 99, mode: 0,
  az: 0, azV: 0.1, pol: 1.1, r: 800, rV: 0,
  fov: 40, fovV: 0,
  k: 0, kTarget: 0, assembleFast: false,
  tOff: new THREE.Vector3(), tV: new THREE.Vector3(),
  drawer: null, drawerAt: Infinity, popAt: Infinity,
  size: 400, center: new THREE.Vector3(),
};
function startCinema() {
  const box = new THREE.Box3();
  for (const inst of instances.values()) if (inst.group.visible) box.expandByObject(inst.group);
  box.getCenter(cinema.center);
  const s = box.getSize(new THREE.Vector3());
  cinema.size = Math.max(s.x, s.y * 1.4, s.z);
  cinema.on = true;
  cinema.last = performance.now();
  cinema.cut = 99; // force an immediate scene pick
  cinema.k = 0;
  cinema.drawer = null;
  controls.enabled = false;
  camera.fov = 40; // the cinema owns the camera — undo the cover's telephoto if we jumped from there
  camera.updateProjectionMatrix();
  // party dressing on
  party.fade = 0;
  party.cuts = 0;
  // Re-pick the grounding for the finale (Joey 2026-08-10: the outro read as a
  // build floating in space). Tabletop keeps its floor — grid + reflection — and
  // the reflected confetti and sky are the point, not a cost to avoid. Wall builds
  // still get the clean stage: there is no floor under a wall mount to reflect in.
  applyReflectionQuality();
  scene.environment = partyEnv();
  scene.environmentIntensity = 0; // ramps in with the fade
  scene.add(partyRig());
  partyDome().material.opacity = 0; // crossfades in behind everything
  scene.add(partyDome());
  sun.color.set(0xffe0b3); // warm golden sun for the finale
  // The floor stays for tabletop builds so the finale is grounded like every other
  // page. Same rule as a normal page: hanging builds never show the floor grid.
  grid.visible = !isWallBuild && !isUnderTableBuild;
  wall.visible = false;    // clean cinema stage for wall builds — no floor to stand on
  surface.visible = false; // under-table: updateCinema's per-shot `withSlab` owns this
  confettiInit();
  scene.add(confetti.mesh);
}
function stopCinema() {
  if (!cinema.on) return;
  cinema.on = false;
  controls.enabled = true;
  camera.fov = 40; // a cut may leave a telephoto lens behind
  camera.updateProjectionMatrix();
  sun.intensity = 1.6;
  sun.position.set(300, 600, 400);
  sun.color.set(0xffffff);
  fill.intensity = 0.5;
  // party dressing off — instruction pages get the daylight studio back
  hemi.intensity = 1.1;
  scene.background.copy(party.bgDay);
  table.material.color.copy(party.tableDay);
  grid.visible = !isWallBuild && !isUnderTableBuild; // hanging builds never show the floor grid
  wall.visible = isWallBuild;
  surface.visible = isUnderTableBuild;
  // ⚠ restore the QUALITY TIER's environment, not null — otherwise leaving the
  // outro drops the studio lighting and the build goes flat until something else
  // re-applies it (same class of bug as the theme clones this function restores).
  scene.environment = QUALITY[quality].env ? studioEnv() : null;
  scene.environmentIntensity = 1;
  hemi.intensity = baseHemi;
  applyShadowQuality(); applyReflectionQuality();
  scene.remove(party.rig);
  if (party.dome) { scene.remove(party.dome); party.dome.material.opacity = 0; }
  scene.remove(confetti.mesh);
  const zero = confetti.m4.makeScale(0, 0, 0); // clear airborne bits for a clean return visit
  confetti.bits.forEach((b, i) => {
    if (!b) return;
    confetti.bits[i] = null;
    confetti.free.push(i);
    confetti.mesh.setMatrixAt(i, zero);
  });
  confetti.mesh.instanceMatrix.needsUpdate = true;
}
function cinemaScene() {
  // a cut mid-drawer-glide must not orphan the drawer open — nor a mid-trick
  // label stranded out of its window
  if (cinema.drawer) {
    for (const m of cinema.drawer.members) m.group.position.copy(basePos(m, false));
    for (const f of (cinema.drawer.trick || [])) {
      const kid = f.inst.group.children[0];
      if (kid) kid.position.set(0, 0, 0);
    }
    cinema.drawer = null;
  }
  cinema.featureOn = null;
  cinema.cut = 0;
  const mode = cinema.mode = CINEMA_MODES[Math.floor(Math.random() * CINEMA_MODES.length)];
  cinema.az = Math.random() * Math.PI * 2;
  cinema.azV = (0.05 + Math.random() * 0.09) * (Math.random() < 0.5 ? -1 : 1);
  cinema.pol = [1.25, 0.8, 1.05, 1.18, 1.0, 1.3, 1.32][mode] + (Math.random() - 0.5) * 0.15;
  cinema.r = cinema.size * [1.5, 2.7, 2.1, 1.6, 2.4, 2.2, 1.35][mode]; // macro sits far back — the long lens does the closing in
  cinema.rV = (Math.random() - 0.5) * cinema.size * 0.04;
  cinema.tOff.set(0, 0, 0);
  cinema.tV.set(0, 0, 0);
  cinema.assembleFast = false;
  cinema.kTarget = 0;
  // every cut re-rolls the lens: normal shots jitter around 40, macro goes telephoto
  cinema.fov = 37 + Math.random() * 8;
  cinema.fovV = (Math.random() - 0.5) * 0.3; // barely-there zoom creep
  if (mode === 2) {              // slow-motion explode — depth varies per visit
    cinema.kTarget = 0.15 + Math.random() * 0.75;
    cinema.rV = cinema.size * 0.09;
  } else if (mode === 3) {       // truck-pan: slide sideways across the front
    const dir = Math.random() < 0.5 ? -1 : 1;
    cinema.azV *= 0.15;          // barely any orbit — the pan carries the shot
    cinema.tOff.x = -dir * cinema.size * 0.45;
    cinema.tV.x = dir * cinema.size * 0.11;
    cinema.tV.y = (Math.random() - 0.5) * cinema.size * 0.015;
  } else if (mode === 4) {       // reverse: parts fly home from an exploded start
    cinema.k = 0.55 + Math.random() * 0.4;
    cinema.assembleFast = true;
  } else if (mode === 5) {       // macro detail: long lens on one small part
    const cand = [...instances.values()].filter(i => i.group.visible && DETAIL_TYPES.has(typeByNode[i.cfg.node]));
    const pick = cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
    if (pick) {
      cinema.tOff.copy(pick.group.position).sub(cinema.center);
      // shoot from the side the part faces, so the build doesn't block the shot
      cinema.az = Math.atan2(cinema.tOff.x, cinema.tOff.z) + (Math.random() - 0.5) * 1.2;
    }
    cinema.fov = 11 + Math.random() * 6;
    cinema.fovV = -(0.15 + Math.random() * 0.3); // slow zoom-in — the "lean closer" feel
    cinema.azV *= 0.3;                           // long lens: tiny moves read big
    cinema.rV = -cinema.size * 0.015;            // gentle push-in
    cinema.tV.set((Math.random() - .5), (Math.random() - .5) * 0.6, (Math.random() - .5))
      .multiplyScalar(cinema.size * 0.012);      // slight frame drift
  } else if (mode === 6) {       // FEATURE: open a drawer and work its faceplate
    // Frame a real drawer three-quarters-on from the FRONT, close enough to
    // read the plate — the glide scheduler below then opens that exact drawer
    // (cinema.featureOn) instead of a random one, and lifts its label.
    const drawers = [...instances.values()].filter(i => typeByNode[i.cfg.node] === 'Drawer' && i.group.visible);
    const pick = drawers.length ? drawers[Math.floor(Math.random() * drawers.length)] : null;
    if (pick) {
      cinema.featureOn = pick;
      cinema.tOff.copy(pick.group.position).sub(cinema.center).multiplyScalar(0.85);
      cinema.az = (Math.random() - 0.5) * 1.15;  // near the front, drawers open toward +Z
    }
    cinema.fov = 26 + Math.random() * 7;
    cinema.azV *= 0.28;                          // hold the framing while it works
    cinema.rV = -cinema.size * 0.02;             // drift in a touch
  }
  // under-table builds: some assembled wide shots dip below the horizon and
  // bring the mounting slab into frame — the build lives under a surface, so
  // show it off from underneath. Explode and macro scenes keep the clean
  // floating stage (exploding parts would clip up through the slab).
  if (isUnderTableBuild) {
    const withSlab = (mode === 0 || mode === 1 || mode === 3) && Math.random() < 0.55;
    surface.visible = withSlab;
    if (withSlab) cinema.pol = 1.8 + Math.random() * 0.35; // ~103°–123°: under the slab, looking up
  }
  camera.fov = cinema.fov;
  camera.updateProjectionMatrix();
  // drawer play only when the build is (or ends up) assembled
  // NB set after the mode chain, so mode 6's short delay lives here or it gets
  // overwritten — the feature shot is the whole point of that cut, so it opens
  // almost immediately rather than after the usual idle beat.
  cinema.drawerAt = mode === 6 ? 0.35
    : (mode === 0 || mode === 1 || mode === 3 || mode === 5) ? 1 + Math.random() * 3 : Infinity;
  cinema.drawer = null;
  // confetti: the first cut gets a two-sided volley, later cuts usually one pop
  if (party.cuts++ === 0) { confettiPop(90); confettiPop(90); }
  else if (Math.random() < 0.7) confettiPop(50 + Math.floor(Math.random() * 40));
  cinema.popAt = 3 + Math.random() * 4; // occasional mid-scene sprinkle
}
const easeSm = t => t * t * (3 - 2 * t);
function updateCinema(now) {
  const dt = Math.min(0.05, (now - cinema.last) / 1000);
  cinema.last = now;
  if ((cinema.cut += dt) > 9) cinemaScene();
  cinema.az += cinema.azV * dt;
  cinema.r += cinema.rV * dt;
  cinema.tOff.addScaledVector(cinema.tV, dt);
  camera.fov = (cinema.fov += cinema.fovV * dt);
  camera.updateProjectionMatrix();
  // explode factor: drifts out slowly, pulls home fast (faster still on cuts)
  const speed = cinema.kTarget > cinema.k ? 0.05 : (cinema.assembleFast ? 0.4 : 0.9);
  cinema.k += Math.sign(cinema.kTarget - cinema.k) * Math.min(Math.abs(cinema.kTarget - cinema.k), speed * dt);
  if (cinema.k > 0.001) {
    for (const inst of instances.values())
      inst.group.position.lerpVectors(basePos(inst, false), exploded.get(inst.cfg.id), cinema.k);
    cinema.kDirty = true;
  } else if (cinema.kDirty) {
    // k just hit zero — settle everything exactly home (the lerp freezes a few
    // mm short otherwise); an active drawer glide re-applies itself below
    cinema.kDirty = false;
    for (const inst of instances.values()) inst.group.position.copy(basePos(inst, false));
  }
  // a random drawer glides open and shut while the build sits assembled.
  // Every glide rolls its own personality: how far it opens (30–95% of the
  // drawer's travel) and how fast it opens, how long it sits open, and how
  // fast it closes — bigger pulls naturally take a little longer.
  if (cinema.cut > cinema.drawerAt && !cinema.drawer && cinema.k < 0.01) {
    const drawers = [...instances.values()].filter(i => typeByNode[i.cfg.node] === 'Drawer' && i.group.visible);
    if (drawers.length) {
      // a feature cut opens the drawer it framed; every other cut picks freely
      const carrier = (cinema.featureOn && drawers.includes(cinema.featureOn))
        ? cinema.featureOn : drawers[Math.floor(Math.random() * drawers.length)];
      const feature = carrier === cinema.featureOn;
      const travel = (parseInt(manifest.collection, 10) || 185) - 20; // full pull ≈ case depth − rear engagement
      const frac = feature ? 0.55 + Math.random() * 0.25              // enough to read, not a full yank
        : 0.3 + Math.random() * 0.65;                                 // 30%..95% open
      const members = [carrier, ...[...instances.values()].filter(x => x.cfg.rides === carrier.cfg.id)];
      cinema.drawer = {
        members, t: 0,
        span: travel * frac,
        tOpen: 0.6 + frac * 0.9 + Math.random() * 0.6,
        tHold: feature ? 2.6 + Math.random() * 0.8 : 0.4 + Math.random() * 2.0,
        tClose: 0.6 + frac * 0.9 + Math.random() * 0.8,
        // …and the LABEL lifts out of its window while it sits open, exactly
        // the way a tap does. Labels only, deliberately: the accent has a
        // removal ritual too, but a panel detaching reads as the plate coming
        // APART, and this shot is meant to say "your labels swap" — the one
        // feature the finished build actually performs. NODE_RITUALS first, so
        // Classic Pro's angled slot keeps its diagonal for free; a family with
        // no label finds no rider and the shot is a clean deep pull instead.
        trick: feature ? members.filter(m => typeByNode[m.cfg.node] === 'Label').map(m => {
          const path = NODE_RITUALS[m.cfg.node] || RITUALS.Label;
          return { inst: m, to: path.path[path.path.length - 1] };
        }) : [],
      };
    }
    cinema.drawerAt = cinema.cut + 3.5 + Math.random() * 3; // maybe another one later
  }
  if (cinema.drawer) {
    const d = cinema.drawer;
    d.t += dt;
    let off = 0;
    if (d.t < d.tOpen) off = easeSm(d.t / d.tOpen);
    else if (d.t < d.tOpen + d.tHold) off = 1;
    else if (d.t < d.tOpen + d.tHold + d.tClose) off = 1 - easeSm((d.t - d.tOpen - d.tHold) / d.tClose);
    for (const m of d.members) {
      const p = basePos(m, false);
      p.z += d.span * off;
      m.group.position.copy(p);
    }
    // …and while it sits fully open, the dressing performs. Driven straight off
    // the cinema clock (not slideRitual's tweens, which run on the step clock
    // and would fight a cut); the offset rides the group's INNER CHILD, the
    // same place the tap ritual puts it, so nothing else has to know.
    if (d.trick && d.trick.length) {
      const inHold = d.t - d.tOpen;
      const u = inHold <= 0 ? 0
        : inHold < 0.45 ? easeSm(inHold / 0.45)                       // lift
        : inHold < d.tHold - 0.5 ? 1                                  // hold it up
        : inHold < d.tHold ? 1 - easeSm((inHold - (d.tHold - 0.5)) / 0.5)  // reseat
        : 0;
      for (const f of d.trick) {
        const kid = f.inst.group.children[0];
        if (kid) kid.position.set(f.to[0] * u, f.to[1] * u, f.to[2] * u);
      }
    }
    if (d.t >= d.tOpen + d.tHold + d.tClose) {
      for (const f of (d.trick || [])) {           // never strand a lifted label
        const kid = f.inst.group.children[0];
        if (kid) kid.position.set(0, 0, 0);
      }
      cinema.drawer = null;
    }
  }
  const c = cinema.center.clone().add(cinema.tOff);
  camera.position.set(
    c.x + cinema.r * Math.sin(cinema.pol) * Math.sin(cinema.az),
    c.y + cinema.r * Math.cos(cinema.pol),
    c.z + cinema.r * Math.sin(cinema.pol) * Math.cos(cinema.az)
  );
  camera.lookAt(c);
  const t = now / 1000;
  // dimmer, warmer drift than the instruction pages — the party rig carries the color
  sun.intensity = 0.95 + 0.4 * Math.sin(t * 0.35);
  sun.position.set(650 * Math.cos(t * 0.12), 480 + 160 * Math.sin(t * 0.2), 650 * Math.sin(t * 0.12));
  fill.intensity = 0.3 + 0.22 * Math.sin(t * 0.23 + 2);
  // night falls over ~1.1 s while the HDR environment ramps in
  if (party.fade < 1) {
    const f = easeSm(party.fade = Math.min(1, party.fade + dt / 1.1));
    scene.background.lerpColors(party.bgDay, party.bgNight, f);
    if (party.dome) party.dome.material.opacity = f;   // the retrowave sky rides the same fade
    table.material.color.lerpColors(party.tableDay, party.tableNight, f);
    hemi.intensity = baseHemi - (baseHemi * 0.68) * f;   // fade from the TIER's hemi, not a hardcoded 1.1
    scene.environmentIntensity = 0.55 * f;
  }
  // party lights circle in opposite directions, hues slowly drifting apart
  const hue = t * 0.025, pr = cinema.size * 1.7, py = cinema.center.y;
  party.spots[0].color.setHSL(hue % 1, 0.8, 0.55);
  party.spots[1].color.setHSL((hue + 0.45) % 1, 0.8, 0.55);
  party.spots[0].position.set(cinema.center.x + Math.cos(t * 0.31) * pr, py + cinema.size * 1.1, cinema.center.z + Math.sin(t * 0.31) * pr);
  party.spots[1].position.set(cinema.center.x - Math.cos(t * 0.22) * pr, py + cinema.size * 0.9, cinema.center.z - Math.sin(t * 0.22) * pr);
  if (cinema.cut > cinema.popAt) {
    confettiPop(25 + Math.floor(Math.random() * 25));
    cinema.popAt = cinema.cut + 2.5 + Math.random() * 3.5;
  }
  updateConfetti(dt, t);
}

// thin pointer line from the identify card to the selected part, updated every
// frame so it tracks orbiting and the drawer-open slide
function updatePointerLine() {
  const svg = $('pointer-line');
  if (!selectedId) { svg.classList.add('hidden'); return; }
  const inst = instances.get(selectedId);
  const p = inst.group.position.clone().add(selAnchor);
  // track the label lift / accent pop — the child offset is group-local, so
  // rotate it into world space (accents are group-rotated 180°)
  if (inst.group.children[0]) p.add(inst.group.children[0].position.clone().applyQuaternion(inst.group.quaternion));
  p.project(camera);
  if (p.z > 1 || !inst.group.visible) { svg.classList.add('hidden'); return; }
  const wrap = document.getElementById('stage-wrap').getBoundingClientRect();
  const card = $('identify-card').getBoundingClientRect();
  const line = svg.querySelector('line');
  line.setAttribute('x1', card.left - wrap.left + card.width / 2);
  line.setAttribute('y1', card.top - wrap.top);
  line.setAttribute('x2', (p.x + 1) / 2 * wrap.width);
  line.setAttribute('y2', (1 - p.y) / 2 * wrap.height);
  svg.classList.remove('hidden');
}

// ---------- bidirectional planner sync ----------
// The planner opens us with a live opener ref, so option changes round-trip
// both ways. Applying a received change must NOT re-post (loop guard). Static
// kits (no build) never sync.
let applyingRemote = false;
// the only shelf-lip values that may cross the relay - anything else is dropped
const LIP_MODES = new Set(['none', 'front', 'both']);
// the only drawer-body values that may cross the relay (absence of `variant` = 'standard')
const VARIANT_MODES = new Set(['standard', 'gridfinity']);
function currentOpts() {
  if (!build) return null;
  const closures = {};
  for (const u of build.placed) if (u.fill === 'decor' || u.fill === 'classic') closures[u.id] = u.closure === 'magnet' ? 'magnet' : 'none';
  // shelf lips ride the same per-unit-map shape as closures, keyed by unit id.
  // Every SHELF gets an entry (true or false) so the receiver can tell "lip
  // turned off" from "this unit is not a shelf" - the map's own absence of a
  // key is what means the latter.
  const lips = {};
  for (const u of build.placed) if (u.fill === 'shelf') lips[u.id] = u.lip ?? 'none';
  // Standard / Gridfinity drawer bodies, the same per-unit-map shape: every DECOR
  // unit gets an entry, whether or not its size has a Gridfinity version - the
  // generator keeps a variant on a size without one and renders the standard body
  const variants = {};
  for (const u of build.placed) if (u.fill === 'decor') variants[u.id] = u.variant === 'gridfinity' ? 'gridfinity' : 'standard';
  // buildPlate goes out RESOLVED (a build that never stored one sends the default, 'powder'), and LAST, in the
  // same key order as the planner's post - its echo guard compares the two JSON strings
  return { closures, lips, variants, removedStoppers: build.removedStoppers || [], wallStagger: !!build.wallStagger, handleStyle: build.handleStyle, faceStyle: build.faceStyle, backCover: !!build.backCover, feet: build.feet === 'adhesive' ? 'adhesive' : 'tpu', buildPlate: plateFinishOf(build) };
}
// The planner window, wherever we live: a popped-out tab talks to its opener,
// the docked split-view iframe talks to its parent.
const plannerWin = () => window.opener || (window.parent !== window ? window.parent : null);

// ---- palette relay (2026-07-19) ----
// Filament colors persist in VIEWER localStorage, which browsers PARTITION
// when the viewer runs as the planner's cross-site dock iframe — a popped-out
// tab can't see the dock's picks. The planner (first-party storage) relays:
// every local save posts the stamped palette to it; it caches the newest and
// replays it on every viewerReady. Newest-wins by stamp; a viewer holding a
// NEWER palette answers back once so the cache converges (adopting the
// sender's stamp makes the next comparison equal, ending the exchange).
let applyingRemoteColors = false;
function postColorsToPlanner() {
  const pw = plannerWin();
  if (applyingRemoteColors || !build || !pw) return;
  try { pw.postMessage({ gen2: 'colors', t: colorsT, colors: customColors, on: useCustom, user: userPalette }, '*'); } catch (e) { /* planner gone */ }
}
// keep only well-formed entries — hex must be a color, urls must be http(s)
// (palette values end up in material colors and identify-card link hrefs)
function cleanPalette(o) {
  const out = {};
  if (!o || typeof o !== 'object') return out;
  for (const [k, v] of Object.entries(o)) {
    if (!v || typeof v.hex !== 'string' || !/^#[0-9a-fA-F]{3,8}$/.test(v.hex)) continue;
    const e = { name: String(v.name || ''), hex: v.hex };
    if (typeof v.url === 'string' && /^https?:\/\//.test(v.url)) e.url = v.url;
    out[k] = e;
  }
  return out;
}
function applyRemoteColors(d) {
  if (typeof d.t !== 'number' || !d.colors || typeof d.colors !== 'object') return;
  if (d.t <= colorsT) { if (colorsT > d.t) postColorsToPlanner(); return; } // ours is newer — teach the cache instead
  applyingRemoteColors = true;
  try {
    customColors = cleanPalette(d.colors);
    useCustom = !!d.on;
    userPalette = d.user && typeof d.user === 'object' ? cleanPalette(d.user) : structuredClone(customColors);
    colorsT = d.t;
    persistColors();
    applyPalette();
  } finally { applyingRemoteColors = false; }
}
// ---- store-preference relay (2026-07-25) ----
// Rides the SAME newest-wins-by-stamp pattern as the palette, and for the same
// reason: the preference lives in viewer localStorage, which is partitioned in
// the dock iframe. Deliberately NOT on the buildOptions channel — that calls
// regenerate(), and rebuilding the 3D scene because you changed store would be
// absurd. `booted` isn't required: this touches no scene state.
let applyingRemoteStore = false;
function postStorePrefToPlanner() {
  const pw = plannerWin();
  if (applyingRemoteStore || !pw) return;
  try { pw.postMessage({ gen2: 'store', t: storePrefT, store: storePref }, '*'); } catch (e) { /* planner gone */ }
}
function applyRemoteStore(d) {
  if (typeof d.t !== 'number' || !STORE_BY_ID[d.store]) return;
  if (d.t <= storePrefT) { if (storePrefT > d.t) postStorePrefToPlanner(); return; } // ours is newer — teach the cache
  applyingRemoteStore = true;
  try {
    storePrefT = d.t;                       // adopt the sender's stamp so the exchange converges
    setStorePref(d.store, { relay: false }); // no re-stamp, no echo
    persistStorePref();
  } finally { applyingRemoteStore = false; }
}
let syncBuildToPlanner = () => {
  const pw = plannerWin();
  if (applyingRemote || !build || !pw) return;
  try { pw.postMessage({ gen2: 'buildOptions', opts: currentOpts() }, '*'); } catch (e) { /* cross-origin opener gone */ }
};
// ---- live layout sync (planner → viewer, 2026-07-19) ----
// The planner posts its FULL serialized build (same shape as the #build= hash)
// whenever units are placed / moved / removed there; options keep riding the
// buildOptions channel below. While the planner reports the layout blocked
// (floating case, non-flat top, … — its own greyed-button reasons), the page
// pauses under #blocked-overlay with the reason; the old scene stays mounted
// so the next legal layout regenerates in place. Mount/length changes reload
// onto the new hash instead (backdrop + parts pool are page-lifetime).
let booted = false, layoutRetryTimer = 0;
const showBlocked = r => { $('blocked-reason').textContent = r; $('blocked-overlay').classList.remove('hidden'); };
const hideBlocked = () => $('blocked-overlay').classList.add('hidden');
/* The no-op/echo guard for an incoming layout. WARNING: every per-unit field
   the generator READS must appear here, or a layout that changes only that
   field is misread as an echo and DROPPED. It must also stay in step with the
   planner's own `layoutSig` - that one decides whether a layout is POSTED, this
   one whether it is APPLIED, and a field in one but not the other is a silent
   half-broken channel (exactly how `lip` shipped: the planner posted the
   change, this key ignored it, the toggle did nothing). */
const layoutKey = b => JSON.stringify([b.mount, +b.length, (b.placed || []).map(u =>
  [u.id, u.x, u.y, u.w, u.hh, u.fill, u.shelves || 0, u.label || '', u.closure || '', u.lip || '', u.variant || '', JSON.stringify(u.interior ?? null)])]);
async function applyRemoteLayout(nb) {
  if (!booted || !nb || !Array.isArray(nb.placed) || !nb.placed.length) return;
  if (regenBusy) { // mid-regenerate from an earlier message — retry, never drop the newest state
    clearTimeout(layoutRetryTimer);
    layoutRetryTimer = setTimeout(() => applyRemoteLayout(nb), 250);
    return;
  }
  hideBlocked();
  if (layoutKey(nb) === layoutKey(build)) return; // no-op/echo (e.g. the viewerReady handshake)
  if (nb.mount !== build.mount || +nb.length !== +build.length) {
    location.hash = '#build=' + btoa(unescape(encodeURIComponent(JSON.stringify(nb))));
    location.reload(); // hash-only changes don't navigate — force it
    return;
  }
  let gen;
  try { gen = generateManifest(nb); }
  catch (err) { showBlocked('This layout can’t be shown: ' + ((err && err.message) || err)); return; }
  if (!gen.manifest) { showBlocked((gen.errors || []).join(' · ') || 'This layout can’t be shown.'); return; }
  applyingRemote = true;
  try {
    build = nb;
    originalBuild = structuredClone(nb); // the Reset-to-original baseline follows the planner
    await regenerate();
  } finally { applyingRemote = false; }
}
addEventListener('message', async (e) => {
  // part-preview accepts NO incoming messages (v1 protocol is outbound-only) —
  // explicit, not just the !build guard below: this mode lives inside a page we
  // don't control, and the planner relay handlers must be unreachable from it
  if (IS_PART) return;
  const d = e.data;
  if (!d || !build) return;
  if (d.gen2 === 'layoutBlocked' && typeof d.reason === 'string') { showBlocked(d.reason); return; }
  if (d.gen2 === 'layout' && d.build) { await applyRemoteLayout(d.build); return; }
  if (d.gen2 === 'colors') { applyRemoteColors(d); return; }
  if (d.gen2 === 'store') { applyRemoteStore(d); return; }
  if (d.gen2 === 'theme') { // the planner's dark-mode switch, relayed like the palette
    const th = (d.theme === 'dark' || d.theme === 'retrowave') ? 'dark' : 'light';
    if (th !== stageTheme) {
      applyStageTheme(th); // no track() here — the planner already counted its own switch
      try { localStorage.setItem('gen2-theme', th); } catch (e) { /* private mode */ }
      labelThemeBtn();
    }
    return;
  }
  if (d.gen2 !== 'buildOptions' || !d.opts || regenBusy) return;
  const o = d.opts;
  // ignore a message that matches our current state — this is what breaks the
  // planner↔viewer echo loop (an applied change bounces back identical → dropped)
  let changed = false;
  if (o.closures) for (const u of build.placed) if (o.closures[u.id] && (o.closures[u.id] === 'magnet') !== (u.closure === 'magnet')) changed = true;
  if (Array.isArray(o.removedStoppers) && [...o.removedStoppers].sort().join(',') !== [...(build.removedStoppers || [])].sort().join(',')) changed = true;
  if (typeof o.wallStagger === 'boolean' && o.wallStagger !== !!build.wallStagger) changed = true;
  if (o.handleStyle && o.handleStyle !== build.handleStyle) changed = true;
  if (o.faceStyle && o.faceStyle !== build.faceStyle) changed = true;
  if (typeof o.backCover === 'boolean' && o.backCover !== !!build.backCover) changed = true;
  if ((o.feet === 'tpu' || o.feet === 'adhesive') && o.feet !== (build.feet === 'adhesive' ? 'adhesive' : 'tpu')) changed = true;
  // compared RESOLVED, so a planner's 'powder' against a build that never stored a plate is no change
  if (PLATE_FINISHES.includes(o.buildPlate) && o.buildPlate !== plateFinishOf(build)) changed = true;
  if (o.lips) for (const u of build.placed)
    if (u.fill === 'shelf' && LIP_MODES.has(o.lips[u.id]) && o.lips[u.id] !== (u.lip ?? 'none')) changed = true;
  if (o.variants) for (const u of build.placed)
    if (u.fill === 'decor' && VARIANT_MODES.has(o.variants[u.id]) &&
        o.variants[u.id] !== (u.variant === 'gridfinity' ? 'gridfinity' : 'standard')) changed = true;
  if (!changed) return;
  applyingRemote = true;
  try {
    if (o.closures) for (const u of build.placed) if (o.closures[u.id]) u.closure = o.closures[u.id];
    if (Array.isArray(o.removedStoppers)) build.removedStoppers = o.removedStoppers;
    if (typeof o.wallStagger === 'boolean') build.wallStagger = o.wallStagger;
    if (o.handleStyle) build.handleStyle = o.handleStyle;
    if (o.faceStyle) build.faceStyle = o.faceStyle;
    if (typeof o.backCover === 'boolean') build.backCover = o.backCover;
    if (o.feet === 'tpu' || o.feet === 'adhesive') build.feet = o.feet;
    if (PLATE_FINISHES.includes(o.buildPlate)) build.buildPlate = o.buildPlate;   // anything else is dropped
    if (o.lips) for (const u of build.placed) {
      if (u.fill !== 'shelf' || !LIP_MODES.has(o.lips[u.id])) continue;
      const v = o.lips[u.id];
      if (v === 'none') delete u.lip; else u.lip = v;      // absence IS "no lip"
    }
    if (o.variants) for (const u of build.placed) {
      if (u.fill !== 'decor' || !VARIANT_MODES.has(o.variants[u.id])) continue;
      if (o.variants[u.id] === 'gridfinity') u.variant = 'gridfinity'; else delete u.variant;   // absence IS standard
    }
    await regenerate();
  } finally { applyingRemote = false; }
});

// ---------- (re)mount a manifest ----------
// Builds (or rebuilds) all manifest-derived scene state. Called once at boot and
// again by regenerate() after the options menu mutates `build`. Mount type,
// lights, table/wall/surface and the tween/camera state are page-lifetime and
// live outside this.
async function mountManifest(m) {
  manifest = m;
  ao.rev++;   // the parts are about to be rebuilt - never accumulate over stale normals

  if (OFFICIAL) {
    // official kits carry their real name — replace the generator's random fun
    // name on the header/tab and brand the intro step. Done here (not at boot)
    // so it survives every regenerate(), which re-runs the generator.
    m.title = OFFICIAL.title;
    const intro = m.steps[0];
    if (intro && intro.checklist) {
      intro.title = OFFICIAL.title;
      intro.note = (OFFICIAL.tagline ? OFFICIAL.tagline + ' ' : '') +
        (intro.note || '').replace('Your custom GEN2 build', 'An official GEN2 kit');
    }
  }
  $('kit-title').textContent = m.title;
  document.title = m.title;
  typeByNode = Object.fromEntries(m.parts.map(p => [p.node, p.type]));
  partInfoByNode = Object.fromEntries(m.parts.map(p => [p.node, p]));
  syncBedFinish();   // before any material is built: the plate decides which program they get
  dropStaleAxisMaterials();   // and a faceplate or handle FAMILY change decides which way their layers run
  ensureMaterials();
  await loadTemplates();
  if (plateActive()) ensurePlateUVs();   // plate GLBs ship position+normal only
  buildInstances();
  buildGhosts();
  setIncomplete(!!m.incomplete);
  computeBounds();
  // (re)apply the tier now that the build exists — the shadow camera and the
  // reflector plane are both sized off assembledBox, and regenerate() replaces
  // every instance group, so the shadow casters have to be re-flagged too.
  applyQuality(quality);
  if (isWallBuild) fitWall();
  if (isUnderTableBuild) fitSurface();
  buildAfterState();
  buildExploded();
  buildPages();
  renderChecklist();
  applyStageTheme(stageTheme); // re-assert the stage (boot, regenerate, and the wall-mount bg path)
}

// regenerate: re-run the generator on the (mutated) build and re-mount, keeping
// the current step. Generated builds only — static kits have no `build`.
let regenBusy = false;
async function regenerate() {
  if (!build || regenBusy) return;
  const gen = generateManifest(build);
  if (!gen.manifest) return; // valid toggles can't make an unbuildable build; ignore defensively
  regenBusy = true;
  setSelected(null);
  // preview mode always re-lands on the FINISHED build (the new final step) —
  // min(cur, …) would strand it one step short whenever the layout GREW
  const keep = previewMode ? gen.manifest.steps.length : Math.min(cur, gen.manifest.steps.length); // step indices are stable (deterministic gen)
  // every options toggle lives INSIDE the parts panel, so it's open right now —
  // keep it open through goTo(), whose default policy would close it whenever a
  // toggle changes the step count (e.g. wallStagger restructures the step list
  // so `keep` no longer lands on the auto-open final step).
  const panelOpen = !$('checklist-panel').classList.contains('hidden');
  try {
    await mountManifest(gen.manifest);
  } catch (e) {
    // missing GLB mid-regenerate (loadTemplates throws with the node names):
    // veil the stage with the reason instead of hanging — and NEVER leave
    // regenBusy latched, or applyRemoteLayout's retry loop spins forever
    regenBusy = false;
    showBlocked('This layout can’t be shown: ' + ((e && e.message) || e));
    return;
  }
  applyPalette(); // re-tint any custom filament colors onto the fresh materials
  // the generator rebuilds handles as the planner-level default (blockbar → A);
  // re-apply the specific variant the user picked so it survives the regenerate
  if (activeHandleStyle && currentHandleStyleIndex() >= 0 &&
      instances.get([...instances.keys()].find(id => typeByNode[instances.get(id).cfg.node] === 'Handle'))?.cfg.node !== activeHandleStyle.node) {
    await applyHandleStyle(activeHandleStyle);
  }
  // (no faceplate re-apply here: the generator emits the family natively from
  // build.faceStyle, so a regenerate always lands on the right plates)
  goTo(keep, { animate: false });
  if (panelOpen) setChecklist(true); // restore the panel the user was just clicking in
  regenBusy = false;
  syncBuildToPlanner(); // keep the opener planner tab in step (no-op if opened cold)
}

// ---------- part-preview mode (?part=&mode=preview) ----------
// Camera: per-TYPE angle table — flat front-facing parts near-frontal, boxes a
// classic 3/4, horizontal tiles (covers/rails) more top-down so the working
// face reads. Distance is aspect-aware off the part's real bounding sphere, so
// the site's square 300px column and a full-width phone both fill correctly.
const PART_CAM = {
  Faceplate: { t: 24, p: 72 }, BackCover: { t: 24, p: 72 },
  CoverL: { t: 30, p: 52 }, CoverU: { t: 30, p: 52 },
  FootrailL: { t: 30, p: 52 }, FootrailU: { t: 30, p: 52 }, Rail: { t: 30, p: 52 },
  Bracket: { t: 30, p: 52 }, // wall-bracket sections read like rails (2026-08-20)
  // hardware (2026-08-20): stoppers lie flat — the default 3/4 box angle reads
  // too grazing; the clip stands like a small plate. QuickLock + Foot keep the
  // default box angle.
  Stopper: { t: 30, p: 52 }, MagnetClip: { t: 24, p: 72 },
  // a handle is a horizontal bar, so it takes the tile angle rather than the 3/4 box - and it
  // previews MOUNTED, where the extra height matters twice: it is what shows the bar standing
  // OFF its plate. Picked off rendered sheets across the four shape extremes (2026-09-19), not
  // from the geometry: at the box angle a BlockBar A reads as a stripe painted on the plate.
  Handle: { t: 30, p: 52 },
};
// lifecycle: loading → ready (posted) | failed — failed is a SINK: once set,
// partReady can never post (context loss / mount failure must leave the site
// on its poster, not hand it a blank canvas)
const partView = { interacted: false, pose: null, visible: true, posted: false, failed: false };
function fitPartCamera() {
  const a = PART_CAM[manifest.parts[0]?.type] || { t: 33, p: 66 }; // default: 3/4 box
  /* A MOUNTED preview frames the SUBJECT, not the pair. `previewFocus` names the instance to
     frame - the generator sets it only where a preview carries context, which today means a
     handle on its Essential plate. Fitting the PAIR there lets the 87 x 55 plate set the radius
     and leaves the handle a stripe across it; MEASURED on screen 2026-09-19, which is the only
     way this shows up. The 1.55 margin is wide enough that the plate stays in shot as a backdrop
     and tight enough that the bar's profile and its stand-off read; 1.4 clipped the widest
     handle, 1.75 shrank it back. With no focus - every other preview - this is byte-for-byte
     what it was. */
  const focus = manifest.previewFocus && instances.get(manifest.previewFocus);
  let center = buildCenter, radius = buildRadius, margin = 1.12;
  if (focus) {
    const sph = new THREE.Box3().setFromObject(focus.group).getBoundingSphere(new THREE.Sphere());
    center = sph.center; radius = sph.radius; margin = 1.55;
  }
  camera.fov = 38;
  camera.updateProjectionMatrix();
  const { pos, target } = camPos({ t: a.t, p: a.p, fitR: radius * margin, fov: 38, target: center.toArray() });
  camera.position.copy(pos);
  controls.target.copy(target);
  controls.minDistance = radius * 0.9;           // don't fly inside the part
  controls.maxDistance = camera.position.distanceTo(target) * 4;
  controls.update();
  partView.pose = { pos: camera.position.clone(), target: controls.target.clone() };
}
// ---- the &plate= print-orientation stage ----
// True-scale build plate under the part's confirmed PRINT pose (the resolver
// applied the rotation; here the rotated part is SEATED — lifted and
// recentered onto the plate — and the plate itself is drawn: slab, 10 mm
// grid with stronger 50 mm majors, usable-area outline). No turntable — a
// print layout is studied, not admired. A "Top" pill swaps between the high
// 3/4 and a straight-down view.
const plateStage = { group: null, top: false, yawed: false, overhang: null, ringMat: null };
function seatOnPlate() {
  // a plate manifest is the bare PRINT JOB by construction — one body, or a
  // handed pair whose two bodies ship in one STL (the resolver's goldens pin
  // exactly which). Zero instances is a resolver bug; fail CLOSED.
  if (!instances.size) {
    postToEmbedder({ gen2: 'partError', reason: 'load-failed', message: 'plate view got an empty manifest' });
    bootFail('<strong>Plate preview error</strong><br><br>• unexpected part count', 'plate: 0 instances');
  }
  const job = [...instances.values()];
  const unionBox = () => {
    const b = new THREE.Box3();
    for (const i of job) b.union(new THREE.Box3().setFromObject(i.group));
    return b;
  };
  // rotate-to-fit (review catch): the site's fit rule accepts EITHER in-plane
  // orientation, so a part that only fits the bed rotated 90° must be shown
  // rotated — otherwise the plate contradicts a green "Fits" verdict with a
  // fake overhang. A world-Y yaw can never change which face is down. Only
  // yaw when the default does NOT fit and the rotation DOES; if neither fits,
  // the honest overhang stays. A multi-body job is RIGID: every body's
  // orientation AND its offset rotate together about the job's center —
  // yawing bodies around their own origins would break the STL's layout.
  const pre = unionBox();
  const s = pre.getSize(new THREE.Vector3());
  // +0.5mm tolerance: the site's verdict works in integer registry mm, and an
  // exact edge-to-edge part (the 250-deep classic on a 250 bed) must not flap
  // on GLB float noise
  const E = 0.5;
  const fitsAs = s.x <= PART_PLATE.w + E && s.z <= PART_PLATE.d + E;
  const fitsRot = s.z <= PART_PLATE.w + E && s.x <= PART_PLATE.d + E;
  if (!fitsAs && fitsRot) {
    const c = pre.getCenter(new THREE.Vector3());
    for (const i of job) {
      i.group.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), Math.PI / 2); // group.rotation is set once in buildInstances and applyState never touches it
      // +90° about world Y at the job center: (x,z) → (c.x + (z−c.z), c.z − (x−c.x))
      const [x, y, z] = i.cfg.pos;
      i.cfg.pos = [c.x + (z - c.z), y, c.z - (x - c.x)];
    }
    plateStage.yawed = true;
    applyState(0); // reposition from the rotated cfg before the seating measurement
  } else if (!fitsAs) {
    // neither orientation fits: the honest overhang still renders, but LOUDLY
    // (Joey, 2026-08-31, after a 270 rail hung off a 256 bed in silence) —
    // markOverhang() paints the job slicer-red and raises the banner. Ceil to
    // whole mm: the banner quotes a print requirement, not float noise.
    plateStage.overhang = { w: Math.ceil(s.x), d: Math.ceil(s.z) };
  }
  // the print pose rotated each body about its product-pose bottom-center —
  // measure the posed (and possibly yawed) JOB bounds once and BAKE one shared
  // correction into every cfg.pos, so applyState/computeBounds (which
  // re-derive from cfg) stay deterministic and the bodies keep their spacing
  const box = unionBox();
  const c = box.getCenter(new THREE.Vector3());
  for (const i of job)
    i.cfg.pos = [i.cfg.pos[0] - c.x, i.cfg.pos[1] - box.min.y, i.cfg.pos[2] - c.z];
  applyState(0);
  computeBounds();
}
// doesn't-fit treatment, the slicer convention (PrusaSlicer paints the part
// red when it exits the bed): flat red job + a banner naming the footprint the
// print actually needs. The site's fitline already says "Won't fit" before the
// visitor ever opens Plate - this makes the picture agree with the words.
const OVERHANG_MAT = new THREE.MeshStandardMaterial({ color: 0xd8434e, roughness: 0.55 });
function markOverhang() {
  if (!plateStage.overhang) return;
  for (const i of instances.values())
    i.group.traverse(o => { if (o.isMesh) o.material = OVERHANG_MAT; });
  const strip = document.createElement('div');
  strip.id = 'plate-overhang';
  strip.textContent = `✕ Too big for this plate · needs ${plateStage.overhang.w}×${plateStage.overhang.d} mm`;
  document.body.appendChild(strip);
  document.body.classList.add('plate-overhang-on'); // drops the corner pills below the strip
  buildWarnRing();
}
/* the in-scene half of the warning (Joey, 2026-08-31): a red frame on the
   plate PERIMETER, slow-pulsing, so the violation reads while looking at the
   part itself - straight-down top view included, where the banner sits
   outside the eye line. Four butt-jointed strips, never overlapped: the
   material is transparent and stacked corners would double-blend darker.
   MeshBasicMaterial on purpose - a warning is UI, not a lit surface. */
function buildWarnRing() {
  const { w, d } = PART_PLATE;
  const RING = 4;                              // strip width, mm - straddles the edge
  const mat = new THREE.MeshBasicMaterial({ color: 0xd8434e, transparent: true, opacity: 0.7, depthWrite: false });
  const strip = (sx, sz, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.6, sz), mat);
    m.position.set(x, 0.35, z);                // proud of the grid lines (0.15-0.25)
    plateStage.group.add(m);
  };
  strip(w + RING, RING, 0, -d / 2);            // far rail, spans the corners
  strip(w + RING, RING, 0, d / 2);             // near rail
  strip(RING, d - RING, -w / 2, 0);            // left rail, butts between them
  strip(RING, d - RING, w / 2, 0);             // right rail
  // a steady ring for anyone who asked the OS to hold still; the pulse tick
  // reads ringMat, so leaving it null freezes the ring at its base opacity
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) plateStage.ringMat = mat;
}
function updateOverhangPulse(now) {
  if (!plateStage.ringMat) return;
  // ~1.8s sine breath between 0.3 and 0.75 - a slow flash, not an alarm strobe
  plateStage.ringMat.opacity = 0.3 + 0.45 * (0.5 + 0.5 * Math.sin((now * Math.PI * 2) / 1800));
}
function buildPlateStage() {
  const { w, d } = PART_PLATE;
  const g = new THREE.Group();
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(w, 2, d),
    new THREE.MeshStandardMaterial({ color: 0x26282e, roughness: 0.9 }));
  slab.position.y = -1;                       // top face at y=0 — the part sits on it
  g.add(slab);
  // grid drawn CENTER-OUT like a real slicer plate, so 0 is always a line and
  // the pattern stays symmetric on non-multiple-of-10 beds
  const minor = [], major = [];
  const line = (arr, x0, y0, x1, y1) => arr.push(x0, 0, y0, x1, 0, y1);
  for (let x = 0; x <= w / 2; x += 10) {
    const a = x % 50 === 0 ? major : minor;
    line(a, x, -d / 2, x, d / 2);
    if (x) line(a, -x, -d / 2, -x, d / 2);
  }
  for (let z = 0; z <= d / 2; z += 10) {
    const a = z % 50 === 0 ? major : minor;
    line(a, -w / 2, z, w / 2, z);
    if (z) line(a, -w / 2, -z, w / 2, -z);
  }
  const mkLines = (arr, color, opacity, y) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    l.position.y = y;
    return l;
  };
  g.add(mkLines(minor, 0x3d414b, 0.85, 0.15));
  g.add(mkLines(major, 0x5c6272, 0.95, 0.2));
  // usable-area outline, slightly proud of the grid
  const corners = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  const outline = [];
  for (let i = 0; i < 4; i++) {
    const [x0, z0] = corners[i], [x1, z1] = corners[(i + 1) % 4];
    outline.push(x0, 0, z0, x1, 0, z1);
  }
  g.add(mkLines(outline, 0x8b93a5, 1, 0.25));
  scene.add(g);
  plateStage.group = g;
}
function fitPlateCamera(top) {
  plateStage.top = !!top;
  const R = Math.max(buildRadius, Math.hypot(PART_PLATE.w, PART_PLATE.d) / 2);
  // the TOP view is near-telephoto: at fov 38 a tall part's raised rim spills
  // past its flush footprint by parallax, and an exact-fit part reads as
  // overhanging — fov 14 reads near-orthographic, like a slicer's top view
  const fov = top ? 14 : 38;
  camera.fov = fov;
  camera.updateProjectionMatrix();
  const a = top ? { t: 0, p: 3 } : { t: 30, p: 55 };
  const { pos, target } = camPos({ t: a.t, p: a.p, fitR: R * 1.12, fov,
    target: [0, top ? 0 : Math.min(40, assembledBox.max.y / 3), 0] });
  camera.position.copy(pos);
  controls.target.copy(target);
  controls.minDistance = R * 0.4;
  controls.maxDistance = camera.position.distanceTo(controls.target) * 4;
  controls.update();
  partView.pose = { pos: camera.position.clone(), target: controls.target.clone() };
  const tb = $('part-top');
  tb.textContent = top ? '3/4 view' : 'Top view';
  tb.classList.remove('hidden');
}
function startPartIdle() {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const spin = !still && !PART_PLATE;            // the plate view never turns on its own
  controls.autoRotate = spin;                    // slow turntable until first touch
  controls.autoRotateSpeed = 0.9;
  controls.addEventListener('start', () => {     // any orbit/zoom = the user takes over
    if (!partView.interacted) {
      partView.interacted = true;
      controls.autoRotate = false;
      $('part-reset').classList.remove('hidden');
    }
  });
  $('part-top').onclick = () => fitPlateCamera(!plateStage.top);
  $('part-reset').onclick = () => {
    // zero OrbitControls' residual damping velocity BEFORE restoring the pose —
    // a fling + instant reset otherwise carries leftover sphericalDelta that
    // yanks the camera off the restored framing on the next frames. One
    // NON-damped update() consumes and explicitly ZEROES the deltas (vendored
    // OrbitControls, the non-damping branch) — exact, unlike an iterative
    // drain. It may move the camera wildly, but the recompute below lands
    // before anything renders (all synchronous).
    controls.autoRotate = false;
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = true;
    // RECOMPUTE the canonical fit for the CURRENT canvas rather than copying
    // the saved pose: the site's expand overlay resizes the iframe, and a pose
    // saved at one aspect restores mis-framed at another (review catch,
    // 2026-08-20). fitPartCamera/fitPlateCamera re-save partView.pose.
    if (PART_PLATE) fitPlateCamera(plateStage.top); else fitPartCamera();
    partView.interacted = false;
    controls.autoRotate = spin;
    $('part-reset').classList.add('hidden');
  };
  // ---- measure (2026-08-20, the site's expanded inspection view) ----
  // The pill drives the EXISTING mm engine; the tap path lets it past the
  // cover guard in this mode. Toggling off clears (setMeasure's own rule), so
  // the pill's Done state is also the visible clear affordance on touch.
  const mBtn = $('part-measure');
  mBtn.classList.remove('hidden');
  mBtn.onclick = () => {
    const on = !measure.on;
    if (on) trackOnce('tool:measure');
    setMeasure(on);
    mBtn.classList.toggle('on', on);
    mBtn.innerHTML = on ? '&#10005; Done' : '&#128207; Measure';
  };
  // Escape must reach the EMBEDDING page even while focus sits inside this
  // cross-origin iframe (it swallows the key) — outbound-only protocol, the
  // site validates origin/source/part/rid before collapsing its overlay.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') postToEmbedder({ gen2: 'partEscape' });
  });
  // offscreen product cards must cost nothing: the render loop skips entirely
  // while the iframe is scrolled out (browsers throttle offscreen-iframe rAF
  // inconsistently — this makes it deterministic)
  if ('IntersectionObserver' in window)
    new IntersectionObserver(es => { partView.visible = es.some(x => x.isIntersecting); }, { threshold: 0.01 }).observe(canvas);
}

// ---------- boot ----------
const X_URL = 'https://x.com/jerrari3D';
if (X_URL) { const a = $('outro-x'); a.href = X_URL; a.classList.remove('hidden'); }
const YT_URL = 'https://www.youtube.com/@jerrari3D';
if (YT_URL) { const a = $('outro-yt'); a.href = YT_URL; a.classList.remove('hidden'); }
// Club joins — the conversion event. These are STATIC anchors in index.html
// (markup owns the href), so they never pass through linkEl and would
// otherwise be invisible: the outro is the moment someone has just finished a
// build, which is exactly when a join is most likely. Same names the planner
// fires, and the two apps report to separate GoatCounter sites, so the
// dashboard's PLANNER/STUDIO filter already tells you which one converted.
// NOT trackOnce: a second click is a real second attempt worth seeing.
$('outro-club-printables').addEventListener('click', () => track('club:printables'));
$('outro-club-thangs').addEventListener('click', () => track('club:thangs'));
// The "where else to find us" row under the buttons. Same static-anchor story,
// and the question they answer is "is this row earning its space?" — so they
// share ONE `follow:` prefix and read as a block on the dashboard. jerrari3d.com
// rides it too: it isn't a social follow, but it sits in that row and is judged
// by the same measure. Destination names only, never a URL.
$('outro-site').addEventListener('click', () => track('follow:jerrari3d'));
$('outro-yt').addEventListener('click', () => track('follow:youtube'));
$('outro-x').addEventListener('click', () => track('follow:x'));
try {
  await mountManifest(manifest);
} catch (e) {
  // a mount failure here is almost always a missing GLB (loadTemplates names
  // them) — without this catch the spinner spins forever with no message.
  // The part-preview embed learns of it as a TYPED load-failed (its poster
  // stays); bootFail's throw halts the module either way.
  partView.failed = true;
  postToEmbedder({ gen2: 'partError', reason: 'load-failed', message: (e && e.message) || String(e) });
  bootFail('<strong>Can’t load this build</strong><br><br>• ' + ((e && e.message) || e) +
    '<br><br>Please report it - this is a library gap on our side, not your build.',
    'mount failed: ' + ((e && e.message) || e));
}
applyPalette(); // restore any saved filament colors
$('loading-overlay').remove();
if (IS_PART) {
  // product-preview: no pages, no goTo — snap the part in and frame it. cur
  // stays 0 (the cover page), which keeps tap-identify inert for free (the
  // pointerup handler early-returns on cover/outro pages).
  applyState(0);
  if (PART_PLATE) {
    seatOnPlate();
    buildPlateStage();
    markOverhang();
    fitPlateCamera(false);
  } else {
    fitPartCamera();
  }
  startPartIdle();
} else if (IS_EMBED && build) {
  // docked split view: land on the live PREVIEW (finished build, dims on,
  // parts panel minimized to its tab) instead of the box-art cover
  goTo(PAGES.length - 2, { animate: false });
  setChecklist(false);
  setPreview(true);
} else {
  goTo(0); // open on the cover
}
booted = true;
// ?bench=orbit: the benchmark's start card sits over the landing page until Start (orbit-bench.js)
const benchApi = !IS_BENCH ? null : ({
  THREE, camera, controls, renderer,
  goTo, stepCount: () => manifest.steps.length, tweenCount: () => tweens.size,
  applyQuality, applyStageTheme, quality: () => quality, stage: () => stageTheme,
  setHold: (on) => { benchHold = !!on; if (on) { perf.thrifty = false; qualityLocked = true; } },
  // stops and restarts the viewer's own loop, so the browser's bare frame cadence can be read (see renderLoop's note)
  pauseLoop: (on) => renderer.setAnimationLoop(on ? null : renderLoop),
  closePanel: () => setChecklist(false),
  bounds: () => ({ center: buildCenter, radius: buildRadius }),
  instanceCount: () => instances.size,
  version: new URL(import.meta.url).searchParams.get('v') || 'dev',
});
if (benchApi && ENTRY.benchKind === 'settle') settleBench = createSettleBench({
  ...benchApi,
  // the settle machinery, read after every frame's render (settle-bench.js)
  ACC_SAMPLES, ACC_WARMUP,
  settleState: () => ({ accN: acc.n, sampleCount: acc.sampleCount, detailCount: acc.detailCount, accOk: acc.ok,
    aoPasses: ao.passes, passCount: ao.passCount, aoAccumMax: ao.accumMax,
    reflCount: refl.renderCount, reflOpacity: refl.mesh ? refl.mesh.material.uniforms.uOpacity.value : null,
    shadowOn: renderer.shadowMap.enabled }),
  tierFlags: () => ({ accum: !!QUALITY[quality].accum, ao: !!QUALITY[quality].ao, refl: reflectionWanted() }),
});
else if (benchApi) orbitBench = createOrbitBench(benchApi);
// ?shot=1 (dev-only, like ?debug): capture the FINISHED build as a 3/4 gallery
// thumbnail and download it as <id>.jpg for viewer/builds/img/ — planner-card
// backdrop (--panel #3a3b3f), no table/grid/wall/surface, canvas-only (DOM
// chrome never reaches toDataURL). Repeatable for every future official kit:
// open ?build=<id>&shot=1, save the download, commit. The render loop's own
// resize() restores the canvas on the next frame, so the page stays usable.
// The planner's per-length lineup colors (data.js GEN2.lengths) — card art is
// tinted with them so the kits don't all look identical across collections.
const SHOT_LEN_COLORS = { 59: '#f2f2f2', 115: '#9ea3a8', 165: '#3aa0e8', 185: '#ff8a40', 240: '#3ecfa0', 270: '#e8453c' };
function captureShot() {
  applyState(manifest.steps.length - 1);          // assembled, deterministic
  table.visible = grid.visible = false;
  ghostGroup.visible = false;
  if (isWallBuild) wall.visible = false;
  if (isUnderTableBuild) surface.visible = false;
  // TRANSPARENT, not a baked panel colour (2026-08-08). The art used to carry
  // the gallery's exact card gray so a contain-fit blended edge to edge, which
  // silently made the card art theme-DEPENDENT: retinting the card grew a gray
  // rectangle on every one. With alpha the PNG carries no background at all, so
  // one capture serves light, dark and any future theme — and new kits (wall,
  // under-table) never need re-shooting when the palette moves.
  scene.background = null;
  // Card palette (Joey 2026-07-24): the instruction rainbow made every kit read
  // the same at thumbnail size. Faceplates take the COLLECTION color and the
  // rest of the shell goes graphite, so the length is the thing you see first.
  // Deterministic — it replaces whatever palette the tab happens to be holding.
  const shotHex = SHOT_LEN_COLORS[parseInt(manifest.collection, 10)];
  if (shotHex) {
    const graphite = { name: 'Graphite', hex: '#2b2d31' }, dark = { name: 'Black', hex: '#17181a' };
    customColors = {
      Faceplate: { name: 'Collection', hex: shotHex },
      Handle: dark, Accent: dark, Label: { name: 'White', hex: '#eef0f4' },
      CoverL: graphite, CoverU: graphite, FootrailL: graphite, FootrailU: graphite,
      Foot: dark, QuickLock: graphite, Stopper: graphite, Rail: graphite,
      Drawer: { name: 'Shell', hex: '#3c3f45' },
    };
    useCustom = true;
    applyPalette();
  }
  // PINNED tier: the ten committed gallery cards must not re-shoot themselves
  // every time the user-facing default moves (same reasoning as the forced palette
  // above). The reflection is stage furniture, so it goes too.
  applyQuality(SHOT_QUALITY);
  if (refl.mesh) refl.mesh.visible = false;
  const W = 1200, H = 750;                        // 16:10 — the gallery card's aspect
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  camera.fov = 40;
  camera.updateProjectionMatrix();
  const { pos, target } = camPos({ t: 35, p: 66, fov: 40, fit: 0.95, target: buildCenter.toArray() });
  // gallery-card composition: slide camera + target along screen-left so the
  // build sits right-of-center — the card's text column overlays the empty left
  const right = new THREE.Vector3().subVectors(target, pos).cross(camera.up).normalize();
  const slide = right.multiplyScalar(-buildRadius * 0.5);
  pos.add(slide); target.add(slide);
  camera.position.copy(pos);
  camera.lookAt(target);
  updateAO(true);
  // converge the accumulation synchronously - a capture is one frame, so it
  // takes the full settled quality, not the first pass of the burst
  for (let i = 0; ao.passes < ao.accumMax && i < AO_ACCUM * 2; i++) updateAO();
  renderer.render(scene, camera);
  compositeAO();
  return renderer.domElement.toDataURL('image/png');   // PNG: JPEG has no alpha
}
if (new URLSearchParams(location.search).get('shot')) {
  const a = document.createElement('a');
  a.href = captureShot();
  a.download = (OFFICIAL ? OFFICIAL.id : 'build') + '.png';
  a.click();
}
// introduce this tab to the planner (opener tab OR split-view parent) so live
// layout sync works even after a planner reload (it re-captures our window
// from any gen2 message) — the planner replies with the current layout,
// which no-ops if unchanged.
if (build && plannerWin()) {
  try { plannerWin().postMessage({ gen2: 'viewerReady' }, '*'); } catch (e) { /* opener gone */ }
  // …and teach the planner's palette cache our local colors (it keeps the
  // newest; its viewerReady reply may in turn carry something newer for us)
  if (colorsT) postColorsToPlanner();
  if (storePrefT) postStorePrefToPlanner(); // same deal for the store preference
}
// Potato guard, embed only: if we render badly (software GPU, ancient
// hardware) tell the planner once — it offers to collapse the dock. Sampled
// after the boot settle so load-time jank doesn't false-positive.
if (IS_EMBED && build) setTimeout(() => {
  let frames = 0; const t0 = performance.now();
  const tick = () => {
    frames++;
    const dt = performance.now() - t0;
    if (dt < 4000) { requestAnimationFrame(tick); return; }
    const fps = frames / (dt / 1000);
    if (fps < 20 && plannerWin()) { try { plannerWin().postMessage({ gen2: 'perfSlow' }, '*'); } catch (e) { /* gone */ } }
  };
  requestAnimationFrame(tick);
}, 2000);

/* ⚠ A NAMED DECLARATION, not an inline arrow. three r185 has no
   `getAnimationLoop`, so anything that pauses the loop to drive frames by hand
   (accVerify, the film rig, a capture harness) has nothing to put back unless
   the callback has a name. Restoring `null` freezes the viewer permanently. */
function renderLoop(now) {
  // offscreen part-preview cards stop rendering entirely (only after the ready
  // frame was posted — the site must never wait on a suspended first frame)
  if (IS_PART && partView.posted && !partView.visible) return;
  resize();
  if (orbitBench) orbitBench.tick(now);   // the benchmark's camera, placed before anything this frame reads it
  if (settleBench) settleBench.tick(now);
  qualityTick(now);
  stepTweens(now);
  if (cinema.on) updateCinema(now); else updateOrbit();
  // the wall is a backdrop, not part of the model — drop it out of the way when
  // the camera orbits behind it, so you can inspect the pegs/case backs freely.
  if (isWallBuild && !cinema.on) wall.visible = camera.position.z > wall.position.z;
  // same rule for the under-table surface: hide it when the camera rises above
  // its underside, so the rails/screw layout can be inspected from the top.
  if (isUnderTableBuild && !cinema.on) surface.visible = camera.position.y < surfaceUnderY;
  updateViewInset();
  updatePointerLine();
  updateMeasure();
  updateDims();
  updateDrawerDims();
  updateFpEnv();
  updateOverhangPulse(now);
  // ⚠ AO and the reflection are the only things here touching driver-dependent
  // features (render targets, depth textures, an override material). A throw
  // INSIDE setAnimationLoop kills the whole loop — the screen would freeze
  // entirely, which is far worse than losing an effect. So each one is guarded
  // and disables ITSELF permanently on first failure, degrading to the plain
  // render instead of taking the studio down on some GPU we've never seen.
  guardFx('grounding', updateGrounding);
  guardFx('cavity', updateCavityFill);
  /* ⚠ moving = a TWEEN, not perf.moving: the passes already re-run when the camera matrices change (see-into.js compares them
     exactly), and perf.moving stays true for 160 ms after the camera stops, which re-ran them on frames with an unchanged view.
     A tween moves parts under a still camera, so it must force the re-run itself. */
  if (seeInto) guardFx('seeinto', () => seeInto.prepare({ moving: tweens.size > 0 }));
  // while the camera moves, the floor reflection and ambient occlusion wait (motionLite)
  const lite = motionLite();
  // the see-into experiment's interior belongs to the main camera: a reflected cover drops its see-through (see-into.js)
  guardFx('reflection', () => { const mirror = () => updateReflection(false, lite); return seeInto ? seeInto.withoutSeeThrough(mirror) : mirror(); });
  if (lite) holdAOForMotion(); else guardFx('ao', updateAO);
  // the see-into experiment weights AO on its parts: patch the composite as soon as the AO step above has built it, before it draws
  if (seeInto && ao.compMat) guardFx('seeinto', () => seeInto.patchAO(ao.compMat));
  // Very High puts its own accumulated mean on the canvas and says so; every
  // other tier renders the scene straight to it, exactly as before. A thrown or
  // disabled accumulator returns undefined and we fall back to the plain frame.
  const accDrew = !!guardFx('accum', accumFrame);
  if (!accDrew) renderer.render(scene, camera);
  if (!lite) guardFx('ao', compositeAO);   // laid over the finished frame; no composer in the path
  if (settleBench) settleBench.afterFrame({ accDrew, lite });   // the frame's post-render settle state (settle-bench.js)
  // partReady only after a REAL rendered frame exists — posted from inside the
  // loop, not after mount, so the site never drops its poster onto a blank
  // canvas (the parent contract adds a short crossfade on top: render
  // submitted is not render composited)
  if (IS_PART && !partView.posted && !partView.failed &&
      canvas.clientWidth > 0 && canvas.clientHeight > 0 &&
      canvas.width > 0 && canvas.height > 0 &&
      !renderer.getContext().isContextLost() &&
      renderer.info.render.calls > 0) {
    // ready only from a PROVEN frame: nonzero layout AND buffer (a display:none
    // iframe can tick rAF with a 0×0 canvas — render "succeeds" showing
    // nothing), a live context (render() returns without drawing while lost),
    // and actual draw calls this frame. failed is terminal — see partView.
    partView.posted = true;
    postToEmbedder({ gen2: 'partReady' });
  }
}
renderer.setAnimationLoop(renderLoop);

// dev-only hook (mirrors the planner's guarded test-hook convention): ?debug=1
if (new URLSearchParams(location.search).get('debug')) {
  window.__GEN2_VIEWER__ = { THREE, scene, camera, controls, goTo, applyState, instances, manifest, cinema, updateCinema, cinemaScene, party, confetti, confettiPop, fpFocus, fpEnv,
    // The printed-relief handles, keyed by material key. ⚠ THE ONLY WAY TO REACH THE LAYER
    // UNIFORMS FROM OUTSIDE: they live in the vendored module's closure, so a tool that wants to
    // switch the relief off — the floor arm of any comparison against the Lab, and the one arm
    // that says what a statistic reads with NO bands drawn — has no other route. Debug-only, like
    // everything else on this object.
    layerHandles,
    bedFinish: bedFinishDebug,   // the build plate's finish, see bedFinishDebug
    wall, surface,   // the mount backdrops, for capture tooling that needs the mounting surface as context
    renderer, table, grid, camPos, captureShot, get buildCenter() { return buildCenter; },
    // render-quality internals (2026-08-10) — the tier, the AO buffers and the
    // reflector, so a rendering question can be answered by reading state instead
    // of squinting at a screenshot
    QUALITY, get quality() { return quality; }, applyQuality, setQuality,
    ao, updateAO, compositeAO, aoWanted, refl, updateReflection, studioEnv,
    // the room itself, so a second renderer can be given THE SAME lighting
    // rather than a description of it (see studioRoom)
    studioRoom, STUDIO_SIGMA, set studioEnvTex(t) { studioEnvTex = t; },
    /* Very High's accumulator (2026-09-09). `accVerify` is the tripwire - the
       parity arm proves the mean reaches the canvas through three's own tone
       mapping, the stale arm proves the invalidation set is complete. Neither
       is answerable by reading state, and both need the drawing buffer read in
       the same task as its render. */
    ground, updateGrounding, groundingWanted, contactMapWanted,
    CAVITY, updateCavityFill, cavityDrawers,
    // the reflection-attenuation experiment's one knob (0 = off, as shipped)
    setContactReflection(v) { if (refl.mesh) refl.mesh.material.uniforms.uContact.value = +v; },
    /* the moving-frame savings' switches (2026-09-14) and what they work on, so a harness can measure the viewer with
       and without each in one page and prove the image unchanged - see MOVE_OPT */
    moveOpt: MOVE_OPT, dimCover, shadowWatch, get cavityClones() { return cavity.clones; },   // ground.seen: see `ground`
    acc, accumFrame, accVerify, invalidateFrame, accWanted,
    get accSamples() { return acc.n; }, ACC_SAMPLES, ACC_WARMUP,
    get sunHalfDeg() { return ACC_SUN_HALF_DEG; },
    setSunHalfDeg(v) { ACC_SUN_HALF_DEG = +v; acc.blocked = true; },
    fxDead, perf, get tweenCount() { return tweens.size; },
    get orbitBench() { return orbitBench; }, get settleBench() { return settleBench; }, get seeInto() { return seeInto; },   // ?bench=orbit's controller (phase, result), for a harness that checks the run
    // the stage half of the render question: the contact shadow is LIGHT-STAGE
    // only, so a shadow measurement that does not state the stage means nothing
    applyStageTheme, get stageTheme() { return stageTheme; },
    get build() { return build; }, regenerate, setSelected, get selectedId() { return selectedId; },
    // part-preview internals (2026-08-19) — the mode flag, the view state and
    // the resolver, so an embed question is answerable by reading state
    IS_PART, partView, resolvePartPreview, fitPartCamera, PART_PLATE, plateStage,
    // the palette, for the profile transport's end-to-end test (2026-09-07). A profile keys by
    // filament LABEL, so nothing outside can assign one without reaching the picker's own state;
    // these are the two handles it touches. `customColors` is a getter because the binding is
    // REASSIGNED (presets, uploads, relays) - returning the object once would hand out a stale one.
    // Debug-only, like everything else here.
    applyPalette, activeLabel, activeHex, get customColors() { return customColors; },
    /* ⚠ `useCustom` IS THE GATE, and without it `customColors` is inert. A test
       that assigned customColors and called applyPalette repainted NOTHING and
       produced eighteen identical arms that looked like a working matrix. */
    get useCustom() { return useCustom; }, set useCustom(v) { useCustom = !!v; },
    // the relief lever, for the tier gate: `reliefWanted` is the constant AND the tier
    LAYER_DETAIL_ENABLED, reliefWanted,
    // the print pose's axis per material key - a buried-infill experiment needs
    // the LAYER PLANE, and object XY is only that for a part posed identity
    buildAxisForKey,
    /* ⚠ regenerate() TAKES NO ARGUMENTS - it reads module-scope `build`. A
       harness that passed it a mutated copy had the copy silently ignored and
       kept rendering the previous faceplate family. The family swap must go
       through applyFaceplateStyle, which also drops the faceplate materials so
       the new family's BUILD AXIS takes effect.
       ⚠⚠ AND IT TAKES A STYLE *OBJECT*, NOT AN ID. Passing the string
       'edgelabel' set build.faceStyle to `undefined` (it reads style.key), so the
       generator fell back to its default family - a single-zone plate printed
       face-down on -Z, i.e. Essential - while the call returned normally. Pass
       FACEPLATE_STYLES.find(s => s.key === 'edgelabel'). */
    applyFaceplateStyle, FACEPLATE_STYLES,
    // which material keys the translucent preview supports for the ACTIVE faceplate family - a harness cannot read
    // the per-family table any other way, and the answer changes with the family (Joey 2026-09-18)
    seeIntoComponentKeys,
    // the handle swap, so a harness can swap at rest with nothing selected (selecting a handle slides its drawer open,
    // and that motion would hide an at-rest shadow defect). Takes a style OBJECT from HANDLE_STYLES, like the plates.
    applyHandleStyle, HANDLE_STYLES,
    COLOR_STORE_KEY,
    trackLog, track };
}
