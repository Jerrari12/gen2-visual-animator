// GEN2 Assembly Instructions viewer — build-free, data-driven.
// One kit = one folder under kits/<name>/ holding manifest.json + parts/*.lib.glb.
// The viewer never changes between kits; everything it animates comes from the manifest.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { generateManifest, migrateOfficialBuild, resolvePartPreview } from './generate.js';

const KIT = new URLSearchParams(location.search).get('kit') || 'tabletop-185';
const KIT_URL = `kits/${KIT}/`;
// #build=<base64> — the planner's own share-link encoding, generated at runtime
const BUILD_HASH = (location.hash || '').match(/build=([^&]+)/);
// ?embed=1 — docked inside the planner's split view: slimmer chrome (no top
// bar, no BOM exports — the planner owns those), and a live "preview" landing
// (the finished build, orbitable/colorable) instead of the box-art cover; a
// "Begin the instructions" pill enters the normal page flow. The flag rides
// location.search, so the mount/length-change self-reload keeps it.
const IS_EMBED = new URLSearchParams(location.search).has('embed') && !!BUILD_HASH;
document.body.classList.toggle('embed', IS_EMBED);
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
const PART_SLUG = new URLSearchParams(location.search).get('part');
const IS_PART = new URLSearchParams(location.search).get('mode') === 'preview' && !!PART_SLUG;
const PART_RID = new URLSearchParams(location.search).get('rid') || '';
// &plate=<W>x<D> (usable mm, 50-1000 each) — the PRINT-ORIENTATION view: the
// bare part in its confirmed print pose on a true-scale build plate. The dims
// come from the SITE's printer profile (the viewer can't read a cross-origin
// localStorage); which parts have a confirmed pose is viewer-owned
// (resolvePartPreview's whitelist + the support manifest's platePreview).
const PLATE_RAW = IS_PART && new URLSearchParams(location.search).has('plate');
const PART_PLATE = (() => {
  if (!PLATE_RAW) return null;
  const m = (new URLSearchParams(location.search).get('plate') || '').match(/^(\d{2,4})[xX](\d{2,4})$/);
  if (!m) return null;
  const w = +m[1], d = +m[2];
  return (w >= 50 && w <= 1000 && d >= 50 && d <= 1000) ? { w, d } : null;
})();
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
const OFFICIAL_ID = !BUILD_HASH ? new URLSearchParams(location.search).get('build') : null;
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
function tween({ duration = 700, delay = 0, onUpdate, onDone }) {
  const f = slowmo && !cinema.on ? 2.5 : 1;
  return new Promise(resolve => {
    tweens.add({ t0: performance.now() + delay * f, duration: duration * f, onUpdate, done: () => { onDone?.(); resolve(); } });
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
    tw.onUpdate(e);
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

const camera = new THREE.PerspectiveCamera(40, 1, 1, 8000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.52; // don't go under the table

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
  dark:  { bg: 0x0d0e21, bgWall: 0x150f30, table: 0x14163a, wall: 0x1c1442,
           surface: 0x171a40, grid: 0x2b7f9e, dim: 0x8f9ad8 },
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
const QUALITY = {
  high:     { env: true,  tone: true,  key: true,  shadow: true,  reflect: true,  ao: true,  dpr: 2 },
  balanced: { env: true,  tone: true,  key: true,  shadow: true,  reflect: false, ao: false, dpr: 1.5 },
  fast:     { env: false, tone: false, key: false, shadow: false, reflect: false, ao: false, dpr: 1 },
};
const QUALITY_ORDER = ['high', 'balanced', 'fast'];
var qualityReady = false;   // hoisted (see applyStageTheme) — true once a tier has been applied
let quality = 'high';
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
function studioEnv() {
  if (studioEnvTex) return studioEnvTex;
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
  const pmrem = new THREE.PMREMGenerator(renderer);
  studioEnvTex = pmrem.fromScene(room, 0.04).texture;
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
  for (const inst of instances.values())
    inst.group.traverse(o => { if (o.isMesh) { o.castShadow = on; o.receiveShadow = on; } });
  table.receiveShadow = on;
  if (on) fitShadowCamera();
  // shadowMap.enabled is in the program cache key and three does NOT auto-detect
  // the flip — every material must recompile or nothing changes on screen.
  scene.traverse(o => {
    if (!o.material) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) m.needsUpdate = true;
  });
}
function fitShadowCamera() {
  if (!sun.castShadow || typeof assembledBox === 'undefined' || assembledBox.isEmpty()) return;
  const size = new THREE.Vector3(), c = new THREE.Vector3();
  assembledBox.getSize(size); assembledBox.getCenter(c);
  const r = Math.max(size.x, size.y, size.z) * 0.85 + 40;
  const cam = sun.shadow.camera;
  cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
  cam.near = 1; cam.far = 3000;
  cam.updateProjectionMatrix();
  sun.target.position.copy(c);
  if (!sun.target.parent) scene.add(sun.target);
  sun.target.updateMatrixWorld();
  sun.shadow.mapSize.set(1024, 1024);
  // world units are MILLIMETRES and parts are 2-3mm thick — normalBias has to be a
  // fraction of a mm, not the ~0.02 a tutorial suggests
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  renderer.shadowMap.needsUpdate = true;   // THE flag that matters (see above)
}

// ---- planar floor reflection (dark stage) ----------------------------------
// The dark stage cannot use a shadow: the floor is already near-black, so there is
// no luminance range left to darken, and lifting it costs the retrowave mood. A
// faint blurred reflection grounds the build while keeping the deep navy.
// Refreshed only when the camera or the build moves.
const refl = { rt: null, mesh: null, cam: null, tex: new THREE.Matrix4(), key: '' };
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
  const mat = new THREE.ShaderMaterial({
    uniforms: { tRefl: { value: refl.rt.texture }, textureMatrix: { value: refl.tex },
                uOpacity: { value: 0.16 }, uBlur: { value: 1.2 } },
    vertexShader: `
      uniform mat4 textureMatrix;
      varying vec4 vProj; varying vec2 vUv;
      void main(){ vUv = uv; vProj = textureMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
    fragmentShader: `
      uniform sampler2D tRefl; uniform float uOpacity, uBlur;
      varying vec4 vProj; varying vec2 vUv;
      void main(){
        vec2 uv = vProj.xy / vProj.w;
        float d = distance( vUv, vec2( 0.5 ) );
        float r = uBlur * ( 0.0015 + d * 0.014 );
        vec3 c = texture2D( tRefl, uv ).rgb * 0.28;
        c += texture2D( tRefl, uv + vec2( r, 0.0 ) ).rgb * 0.18;
        c += texture2D( tRefl, uv - vec2( r, 0.0 ) ).rgb * 0.18;
        c += texture2D( tRefl, uv + vec2( 0.0, r ) ).rgb * 0.18;
        c += texture2D( tRefl, uv - vec2( 0.0, r ) ).rgb * 0.18;
        gl_FragColor = vec4( c, uOpacity * smoothstep( 0.5, 0.05, d ) );
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
function updateReflection(force = false) {
  if (!refl.mesh || !refl.mesh.visible) return;
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
  scene.traverse(o => { if ((o.isLine || o.isLineSegments || o.isSprite) && o.visible) hide(o); });
  const prevBg = scene.background;
  scene.background = null;
  renderer.setRenderTarget(refl.rt);
  renderer.clear();
  renderer.render(scene, vc);
  renderer.setRenderTarget(null);
  scene.background = prevBg;
  for (const o of hidden) o.visible = true;
}

// ---- ambient occlusion -----------------------------------------------------
// Hand-rolled half-res SSAO. No EffectComposer: the beauty pass never goes through
// a render target — AO is rendered into its own buffer and laid over the finished
// frame as a fullscreen quad, so the normal render path is untouched.
// Measured cost: +0.18 ms/frame steady, +0.66 ms one-off when the view settles —
// cheaper than the shadow map and ~3x cheaper than the environment.
//
// ⚠ The scene is REAL MILLIMETRES. AO_RADIUS is in mm (~18mm reads the case seams
// and drawer gaps); a tutorial's 0.5 "units" is a sub-pixel no-op here.
// ⚠ Do NOT composite with MultiplyBlending. Measured: MultiplyBlending and
// NoBlending produced byte-identical frames (the blend mode was ignored and the
// quad simply REPLACED the frame). Black-with-alpha has no such ambiguity.
const AO_N = 24, AO_RADIUS = 18, AO_STRENGTH = 1.15;
const ao = { rtN: null, rtAO: null, normalMat: null, aoMat: null, compMat: null,
             quad: null, qScene: null, qCam: null, key: '', busy: false };
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
function aoWanted() { return QUALITY[quality].ao && !cinema.on && !fxDead.ao && !tweens.size && !IS_PART; }
function aoKernel(n) {              // deterministic hemisphere kernel (golden angle)
  const k = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2.399963, r = Math.sqrt((i + 0.5) / n), z = Math.sqrt(1 - r * r);
    k.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z)
      .multiplyScalar(0.3 + 0.7 * ((i / n) ** 2)));   // cluster near the origin
  }
  return k;
}
function ensureAO() {
  if (ao.rtN) return;
  const w = Math.max(2, Math.floor(canvas.width * 0.5)), h = Math.max(2, Math.floor(canvas.height * 0.5));
  ao.rtN = new THREE.WebGLRenderTarget(w, h);
  ao.rtN.depthTexture = new THREE.DepthTexture(w, h);
  ao.rtN.depthTexture.type = THREE.UnsignedIntType;
  ao.rtAO = new THREE.WebGLRenderTarget(w, h);
  ao.normalMat = new THREE.MeshNormalMaterial();     // view-space normals in RGB
  ao.aoMat = new THREE.ShaderMaterial({
    defines: { N: AO_N },
    uniforms: {
      tNormal: { value: ao.rtN.texture }, tDepth: { value: ao.rtN.depthTexture },
      uProj: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() },
      uKernel: { value: aoKernel(AO_N) },
      uRadius: { value: AO_RADIUS }, uBias: { value: 0.6 },
      uRes: { value: new THREE.Vector2(w, h) },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`,
    fragmentShader: `
      uniform sampler2D tNormal; uniform sampler2D tDepth;
      uniform mat4 uProj, uProjInv; uniform vec3 uKernel[N];
      uniform float uRadius, uBias; uniform vec2 uRes;
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
        float ang = fract( sin( dot( vUv * uRes, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) * 6.2831853;
        vec3 rv = vec3( cos( ang ), sin( ang ), 0.0 );
        vec3 t = normalize( rv - n * dot( rv, n ) );
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
  ao.compMat = new THREE.ShaderMaterial({
    uniforms: { tAO: { value: ao.rtAO.texture }, uTexel: { value: new THREE.Vector2(1 / w, 1 / h) },
                uStrength: { value: AO_STRENGTH } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`,
    fragmentShader: `
      uniform sampler2D tAO; uniform vec2 uTexel; uniform float uStrength; varying vec2 vUv;
      void main(){
        float a = texture2D( tAO, vUv ).r * 0.4;
        a += texture2D( tAO, vUv + vec2(  uTexel.x,  uTexel.y ) ).r * 0.15;
        a += texture2D( tAO, vUv + vec2( -uTexel.x,  uTexel.y ) ).r * 0.15;
        a += texture2D( tAO, vUv + vec2(  uTexel.x, -uTexel.y ) ).r * 0.15;
        a += texture2D( tAO, vUv + vec2( -uTexel.x, -uTexel.y ) ).r * 0.15;
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
  ao.aoMat.uniforms.uRes.value.set(w, h);
  ao.compMat.uniforms.uTexel.value.set(1 / w, 1 / h);
  ao.key = '';                       // force a regen at the new resolution
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
const _aoCam = new Float32Array(32);
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
  if (!aoWanted()) { ao.blocked = true; return; }
  if (ao.blocked) { ao.blocked = false; force = true; }
  ensureAO(); aoResize();
  camera.updateMatrixWorld();
  const key = instances.size + '|' + cur;   // scene identity; the camera is matrix-compared
  if (!force && key === ao.key && !aoCamMoved()) return;
  ao.key = key;
  aoCamStore();
  ao.busy = true;
  // depth + view-space normals of the PARTS only — the table would occlude itself
  // into a grey wash and it isn't what anyone is inspecting
  const hidden = [];
  scene.traverse(o => {
    if ((o === table || o === grid || o === wall || o === surface ||
         o.isLine || o.isLineSegments || o.isSprite || o === refl.mesh) && o.visible) {
      o.visible = false; hidden.push(o);
    }
  });
  const prevBg = scene.background, prevOv = scene.overrideMaterial;
  scene.background = null; scene.overrideMaterial = ao.normalMat;
  renderer.setRenderTarget(ao.rtN);
  renderer.clear();
  renderer.render(scene, camera);
  scene.overrideMaterial = prevOv; scene.background = prevBg;
  for (const o of hidden) o.visible = true;

  ao.aoMat.uniforms.uProj.value.copy(camera.projectionMatrix);
  ao.aoMat.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse);
  ao.quad.material = ao.aoMat;
  renderer.setRenderTarget(ao.rtAO);
  renderer.render(ao.qScene, ao.qCam);
  renderer.setRenderTarget(null);
  ao.busy = false;
}
// Per-feature kill switch: an optional render effect must never be able to take
// the render loop with it. First throw disables that effect for the session and
// reports it once (error:fx-* so a driver-specific failure is actually visible in
// the telemetry rather than being an invisible "it looked wrong on my phone").
const fxDead = {};
function guardFx(name, fn) {
  if (fxDead[name]) return;
  try { fn(); }
  catch (e) {
    fxDead[name] = true;
    if (name === 'ao') { ao.busy = false; scene.overrideMaterial = null; }
    if (name === 'reflection' && refl.mesh) refl.mesh.visible = false;
    renderer.setRenderTarget(null);
    console.warn(`[gen2] ${name} disabled after a render error —`, e);
    track('error:fx-' + name);
  }
}
function compositeAO() {
  if (!aoWanted() || !ao.rtAO || ao.busy || fxDead.ao) return;
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

// ---- the topbar control ----------------------------------------------------
const btnQuality = document.getElementById('btn-quality');
const QUALITY_LABEL = { high: 'High', balanced: 'Balanced', fast: 'Fast' };
function labelQualityBtn() {
  if (!btnQuality) return;
  btnQuality.textContent = QUALITY_LABEL[quality];
  btnQuality.dataset.q = quality;
  btnQuality.title = `Render quality: ${QUALITY_LABEL[quality]} — click to change`;
}
// returning from a background tab starts a FRESH window — the frames either side
// of the gap describe two different situations
document.addEventListener('visibilitychange', () => { perf.t0 = 0; perf.frames.length = 0; });
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
const perf = { key: '', moving: false, lastChange: 0, dpr: null, frames: [], t0: 0, checked: 0,
               thrifty: false };   // one-way: set once the device proves it needs the resolution drop
const SETTLE_MS = 160;
function qualityTick(now) {
  const q = QUALITY[quality];
  const cap = Math.min(q.dpr, devicePixelRatio);
  if (cinema.on) {                       // the outro drives its own camera constantly
    if (perf.dpr !== cap) { perf.dpr = cap; renderer.setPixelRatio(cap); renderer.setSize(canvas.clientWidth, canvas.clientHeight, false); }
    return;
  }
  const key = camera.position.toArray().concat(controls.target.toArray())
    .map(v => v.toFixed(2)).join() + '|' + tweens.size;
  if (key !== perf.key) { perf.key = key; perf.lastChange = now; perf.moving = true; }
  else if (perf.moving && now - perf.lastChange > SETTLE_MS) {
    perf.moving = false;
    if (renderer.shadowMap.enabled) { renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true; }
  }
  if (perf.moving && renderer.shadowMap.enabled) renderer.shadowMap.autoUpdate = true;

  // ⚠ The resolution drop is CONDITIONAL — it only engages on a device that has
  // actually shown it needs the help (perf.thrifty). It shipped unconditional and
  // that was wrong: every animation resized the canvas down and back up, and thin
  // geometry — the cyber grid above all — visibly shimmered on each switch (Joey
  // caught it on a phone that never needed the saving). A rescue mechanism should
  // cost nothing on hardware that is coping.
  const want = (perf.thrifty && perf.moving) ? Math.min(1, cap) : cap;
  if (perf.dpr !== want) {
    perf.dpr = want;
    renderer.setPixelRatio(want);
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  }

  // Sustained-low-fps guard, sampled over 3s. TWO stages, cheapest first:
  //   < 30 fps -> turn on the resolution drop during motion (invisible when idle)
  //   < 24 fps -> step the whole tier down
  // 30 not 45: the drop is VISIBLE (thin geometry shimmers as the canvas resizes),
  // so it has to mean "genuinely struggling", not "fine but not a solid 60". A
  // 45 threshold tripped on a merely-throttled tab in testing.
  // Both are ONE-WAY, so a brief stall can't start anything oscillating, and the
  // first window is discarded because boot jank is not a verdict.
  if (quality === 'fast' && perf.thrifty) return;
  // ⚠ A BACKGROUNDED TAB IS NOT A SLOW DEVICE. Browsers throttle rAF to ~1Hz (or
  // stop it) when the tab is hidden, and an unguarded sampler reads that as a
  // struggling GPU and silently downgrades — so backgrounding the studio and
  // coming back would quietly cost you the good renderer, for nothing. Caught in
  // testing, where the throttled pane tripped it every time.
  // Two guards: skip while hidden, and refuse to judge a window that didn't
  // collect enough frames to mean anything.
  if (document.hidden) { perf.t0 = 0; perf.frames.length = 0; return; }
  if (!perf.t0) { perf.t0 = now; return; }
  perf.frames.push(now);
  if (now - perf.t0 < 3000) return;
  const elapsed = (now - perf.t0) / 1000;
  const fps = perf.frames.length / elapsed;
  const enough = perf.frames.length >= 30;          // < 10fps of samples = untrustworthy window
  perf.frames.length = 0; perf.t0 = now;
  if (perf.checked++ === 0 || !enough) return;      // discard the first window and any junk one
  if (fps < 30 && !perf.thrifty) { perf.thrifty = true; track('quality:thrifty'); return; }
  if (fps < 24 && !qualityLocked) {
    const next = QUALITY_ORDER[QUALITY_ORDER.indexOf(quality) + 1];
    if (next) { setQuality(next); track('quality:auto-' + next); }
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
    res = (PLATE_RAW && !PART_PLATE)
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
} else if (OFFICIAL_ID) {
  const GALLERY = '<br><br><a href="builds/">Browse the official GEN2 kits →</a>';
  // `ev` names the failure for analytics — never the id itself, which at this
  // point is unvalidated visitor input (and a bad id is the whole story anyway:
  // it means a link we printed somewhere is wrong)
  const kitFail = (msg, ev) => {
    track('error:' + ev);
    bootFail('<strong>' + msg + '</strong>' + GALLERY, 'official kit "' + OFFICIAL_ID + '": ' + msg);
  };
  let file = null;
  if (/^[a-z0-9][a-z0-9-]*$/.test(OFFICIAL_ID)) {
    try {
      const res = await fetch(`builds/${OFFICIAL_ID}.json`);
      if (res.ok) file = await res.json();
    } catch (e) { /* network / parse — falls through to the friendly 404 */ }
  }
  if (!file || !file.build)
    kitFail('This kit link isn’t available - it may have moved or been renamed.', 'kit-not-found');
  if (file.gen2OfficialBuild !== 1)
    kitFail('This kit was made for a newer version of the Build Studio - refresh the page and try again.', 'kit-version');
  build = migrateOfficialBuild(file.build, file.buildVersion ?? 1);
  if (!build)
    kitFail('This kit was made for a newer version of the Build Studio - refresh the page and try again.', 'kit-version');
  OFFICIAL = { id: OFFICIAL_ID, title: String(file.title || 'GEN2 Kit'), tagline: typeof file.tagline === 'string' ? file.tagline : '' };
  originalBuild = structuredClone(build);
  const gen = generateManifest(build);
  if (!gen.manifest) // a committed kit failing to generate is OUR bug, not the user's — say so plainly
    kitFail('This kit can’t be shown right now (' + gen.errors.join(' · ') + ') - please report it.', 'kit-generate');
  manifest = gen.manifest;
  PARTS_BASE = 'parts/' + (manifest.collection || '185') + '/';
} else {
  manifest = await (await fetch(KIT_URL + 'manifest.json')).json();
  PARTS_BASE = KIT_URL + 'parts/';
}

// Funnel entry — which door they came in by, and what they're building. The
// official id is safe to name here: an unmatched one threw above, so only
// committed kit slugs reach this line (~20 values, not a long tail).
// part previews report ONE row (`open:part`), never the slug: the site's own
// analytics already record which part page was visited, and 458 slug rows
// would bury the dashboard's funnel.
track(IS_PART ? (PART_PLATE ? 'open:part-plate' : 'open:part')
  : OFFICIAL_ID ? 'open:' + OFFICIAL_ID
  : BUILD_HASH ? (IS_EMBED ? 'open:embed' : 'open:planner-link')
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
    if (!materials[key]) materials[key] = newPartMaterial(key);
}
function baseMatFor(type, zone = '') { // shared material per (type, zone) — zones build lazily off the active palette
  const key = zoneKey(type, zone);
  if (!materials[key]) materials[key] = newPartMaterial(key);
  return materials[key];
}

// ---- build-plate transfer (2026-08-10) --------------------------------------
// A faceplate printed FACE-DOWN takes an impression of the build plate it was
// printed on. Only families whose front is a flat contact surface can do it —
// Essential and Chevron. This is the first PLATE PROFILE; carbon / textured PEI
// / geometric are the same mechanism with the diffraction pass turned off, so
// keep new plates as PROFILE ROWS, never as new material code.
// ⚠ It is a FINISH, not a paint: the material's colour still comes from
// activeHex(), so the user's filament pick drives it and the transfer rides on
// top. Never hardcode a colour here.
const PLATE_PROFILES = [
  { key: 'smooth', label: 'Smooth', holo: 0 },
  { key: 'holographic', label: 'Holographic', holo: 0.07 },
];
const PLATE_FAMILIES = new Set(['essential', 'chevron']); // printable face-down
const plateProfile = () => PLATE_PROFILES.find(p => p.key === (build && build.buildPlate)) || PLATE_PROFILES[0];
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
function newPartMaterial(key) {
  if (plateActive() && key.split(':')[0] === 'Faceplate') {
    const face = plateContactKey(key);
    return attachHolo(new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(activeHex(key)),
      metalness: 0, roughness: face ? 0.14 : 0.2,
      clearcoat: face ? 1.0 : 0.8, clearcoatRoughness: face ? 0.11 : 0.14,
      envMapIntensity: 1.15,
    }), face);
  }
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(activeHex(key)), roughness: 0.55, metalness: 0.05 });
}
// Toggling rebuilds only the faceplate registry entries (a class swap, so it
// cannot be done in place) and drops their highlight clones; the reassignment
// onto meshes rides regenerate()'s normal applyState path like every other
// build option.
async function setBuildPlate(key) {
  if (!build) return;
  track('opt:buildplate:' + key);
  build.buildPlate = key;
  holoUniforms.length = 0;
  for (const k of Object.keys(materials)) if (k.split(':')[0] === 'Faceplate') delete materials[k];
  for (const k of Object.keys(highlightMats)) if (k.split(':')[0] === 'Faceplate') delete highlightMats[k];
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
    const m = (materials[type] || fallbackMat).clone();
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
      templates[node] = adoptTemplate(gltf.scene, typeByNode[node]);
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
function adoptTemplate(sceneRoot, type) {
  sceneRoot.traverse(o => {
    if (!o.isMesh) return;
    const zone = (o.material?.name && o.material.name !== 'BODY') ? o.material.name : '';
    if (zone) o.userData.zone = zone;
    o.material = baseMatFor(type, zone);
  });
  return sceneRoot;
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
  const margin = 90;
  wall.geometry.dispose();
  wall.geometry = new THREE.PlaneGeometry(size.x + margin * 2, size.y + margin * 2);
  wall.position.set(ctr.x, ctr.y, box.min.z - 2); // just behind the case backs / bracket
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
  const margin = 90;
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
    // build's physical envelope (same rule as fitWall/fitSurface)
    if (!inst.cfg.node.startsWith('WoodScrew')) assembledBox.expandByObject(inst.group);
  }
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
    Foot: [0, -25, 0], Drawer: [0, 0, 170], CoverU: [0, 45, 0], FootrailU: [0, 25, 0],
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
const DUR = { enter: 750, settle: 850, move: 600, fade: 650, stagger: 130, camera: 750, via: 300 };
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
          const m = materialFor(inst, false, o.userData.zone).clone();
          m.transparent = true;
          o.material = m; mats.push(m);
        });
        vanished.add(inst.cfg.id);
        jobs.push(tween({
          duration: DUR.fade,
          onUpdate: k => mats.forEach(m => { m.opacity = 1 - k; }),
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
          onUpdate: k => mats.forEach(m => { m.opacity = k; }),
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
        const m = materialFor(inst, false, o.userData.zone).clone();
        m.transparent = true; m.opacity = 1;
        o.material = m; mats.push(m);
      });
      jobs.push(tween({ duration: DUR.fade, onUpdate: k => mats.forEach(m => { m.opacity = 1 - 0.85 * k; }) }));
    });
    (ph.solid || []).forEach(g => {
      const inst = instances.get(g.id);
      const mats = [];
      inst.group.traverse(o => { if (o.isMesh && o.material.transparent) mats.push(o.material); });
      jobs.push(tween({
        duration: DUR.fade,
        onUpdate: k => mats.forEach(m => { m.opacity = 0.15 + 0.85 * k; }),
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
    // move: nudge already-placed instances by a delta (net deltas must cancel
    // by the end of the step so prev/jump's computed after-state stays true)
    (ph.move || []).forEach(m => {
      const inst = instances.get(m.id);
      const fromV = inst.group.position.clone();
      const to = fromV.clone().add(new THREE.Vector3(...m.by));
      jobs.push(tween({
        duration: DUR.move,
        onUpdate: k => inst.group.position.lerpVectors(fromV, to, k)
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
        const m = materialFor(inst, false, o.userData.zone).clone();
        m.transparent = true;
        m.opacity = 0;
        o.material = m;
        mats.push(m);
      });
      jobs.push(tween({
        duration: DUR.fade, delay: n * 80,
        onUpdate: k => mats.forEach(m => { m.opacity = k; }),
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

function linkEl(text, href, ev) {
  const a = document.createElement('a');
  a.className = 'dl-link';
  a.href = href;
  a.target = '_blank';
  // every paid link is marked AT the link (FTC proximity) and carries
  // rel=sponsored (the planner's buy buttons already do)
  const paid = isPaidLink(href);
  a.rel = paid ? 'noopener sponsored' : 'noopener';
  a.textContent = paid ? text + ' · paid link' : text;
  a.addEventListener('click', () => track(ev || 'out:' + outTarget(href)));
  return a;
}
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
  // purchased hardware: Amazon affiliate buy options (generate.js BUY)
  for (const b of info?.links?.buy || []) linksEl.appendChild(linkEl(b.label, b.url, buyEvent(b)));
  if (filament) linksEl.appendChild(linkEl('Get filament', filament.url, buyFilamentEvent(filament)));
  // The paid-link disclosure covers EVERYTHING this card rendered, so it is
  // decided after all of it. ⚠ It used to key on links.buy alone, which left
  // the "Get filament" link (Elegoo = Amazon) undisclosed on parts with a
  // filament pick but no hardware rows. The filament link is judged by its
  // HOST because Polymaker/Printed Solid picks are plain links — a disclosure
  // under those would claim a relationship that doesn't exist.
  if (info?.links?.buy?.length || (filament && isPaidLink(filament.url))) {
    const aff = document.createElement('div');
    aff.className = 'fm-note';
    // covers BOTH programs — this card can show Amazon hardware chips OR a
    // Polymaker "Get filament" link, and the note must be true for either
    aff.textContent = 'Paid links - I earn a commission if you buy through them, at no extra cost to you. '
      + 'As an Amazon Associate I earn from qualifying purchases; I’m also a Polymaker Ambassador.';
    linksEl.appendChild(aff);
  }
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
  // Build plate — only for families printed FACE-DOWN (Essential, Chevron):
  // their front IS the plate-contact surface, so it can take a transfer. Sits
  // under Faceplate/Handle because it describes how that plate was PRINTED.
  if (plateSupported()) {
    box.appendChild(optSeg('Build plate', PLATE_PROFILES.map(p => ({ label: p.label, val: p.key })),
      plateProfile().key, setBuildPlate));
    const note = document.createElement('div');
    note.className = 'opt-note';
    note.textContent = plateProfile().holo
      ? 'Simulated — the real effect shifts with lighting and angle.'
      : 'Printed face-down, this plate can take a build-surface pattern.';
    box.appendChild(note);
  }
  // faceplate back cover — a universal decor-faceplate accessory (every family
  // seats the same SHARED part, both collections); fills the new open-front
  // Decor drawer's gap, off = older closed-front drawers
  if (drawersInBuild().length) {
    box.appendChild(optSeg('Faceplate back cover', [{ label: 'Off', val: false }, { label: 'On', val: true }], !!build.backCover,
      async v => { track('opt:backcover:' + (v ? 'on' : 'off')); build.backCover = v; await regenerate(); }));
  }
  if (isWallBuild) {
    box.appendChild(optSeg('Top cover', [{ label: 'Per-column', val: false }, { label: 'Staggered', val: true }], !!build.wallStagger,
      async v => { track('opt:topcover:' + (v ? 'staggered' : 'per-column')); build.wallStagger = v; await regenerate(); }));
  }
  const reset = document.createElement('button'); reset.className = 'opt-reset'; reset.textContent = '↺ Reset to original';
  reset.onclick = resetBuild; box.appendChild(reset);
}

// "needs bought hardware" wrench — the SAME single-colour glyph the planner
// puts on its option cards (HW_PATH in its app.js): two icons for one idea read
// as two different ideas (Joey 2026-07-24), so keep these in sync. Head is a
// C-ring rather than a circle-minus-notch — see the planner comment for why a
// notch leaves a stray filled square.
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
      // purchased hardware: Amazon affiliate buy options (generate.js BUY)
      for (const b of p.links.buy || []) lnks.appendChild(linkEl(b.label, b.url, buyEvent(b)));
      mid.appendChild(lnks);
    }
    const qty = document.createElement('span');
    qty.className = 'qty';
    qty.textContent = '×' + p.qty + (p.purchased ? ' · buy' : '');
    row.append(chip, mid, qty);
    rows.appendChild(row);
  }
  // Amazon buy chips are paid links → the panel carries the disclosure right
  // under the rows that show them (FTC: disclosure and links seen together),
  // including Amazon's own required Associate statement
  if (manifest.parts.some(p => !p.styleHidden && p.links?.buy)) {
    const aff = document.createElement('div');
    aff.className = 'fm-note';
    aff.textContent = 'Paid links - I earn a commission if you buy through the Amazon links here, at no extra cost to you. '
      + 'As an Amazon Associate I earn from qualifying purchases. Any equivalent hardware from any store works.';
    rows.appendChild(aff);
  }
  $('checklist-title').textContent = build ? 'Your build' : 'Parts list';
  // "can I build this today?" rides the counter that was already here rather
  // than adding a row (Joey 2026-07-24): only REQUIRED buys count, so a
  // print-only build simply shows nothing extra — the cleaner line IS the
  // reward. Opt-in magnets never trip it.
  // !styleHidden: the M3 screws are REQUIRED under a bolt-on family but their
  // row hides under an integrated-grip one — the counter must follow (a
  // Classic/EdgeLabel swap on a static kit used to keep saying "8 to buy")
  const toBuy = manifest.parts.filter(p => p.purchased && p.required && !p.styleHidden).reduce((n, p) => n + p.qty, 0);
  $('parts-head').innerHTML = `🧩 ${total} to print` + (toBuy ? ` · ${HW_ICON} ${toBuy} to buy` : '');
  $('checklist-tab').textContent = `Parts · ${total}`;
}

// Narrow screens get the bottom-sheet layout (matches the CSS breakpoint): the
// parts list defaults to minimized and the parts/identify sheets are mutually
// exclusive so they never overlap at the bottom.
const isMobile = () => matchMedia('(max-width: 560px)').matches;

// BOM widget: expanded on the checklist step and the final step, minimized to
// a side tab everywhere else — the user can toggle it on any step.
function setChecklist(open) {
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
    printables: p.links?.p || '',
    thangs: p.links?.t || '',
  }));
}
function copyBom() {
  let txt = `${manifest.title}\n3D assembly instructions · jerrari3d.com\n`;
  for (const r of bomRows()) {
    txt += `\n${r.qty}× ${r.name}\n`;
    if (r.printables) txt += `    Printables: ${r.printables}\n`;
    if (r.thangs) txt += `    Thangs:     ${r.thangs}\n`;
  }
  navigator.clipboard.writeText(txt).then(() => { track('bom:copy'); flashBtn('bom-copy', '✓ Copied!'); });
}
function downloadCsv() {
  track('bom:csv');
  const esc = s => `"${String(s).replace(/"/g, '""')}"`;
  let csv = 'Qty,Part,Printables,Thangs\n';
  for (const r of bomRows()) csv += [r.qty, esc(r.name), esc(r.printables), esc(r.thangs)].join(',') + '\n';
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
  cur = Math.max(0, Math.min(PAGES.length - 1, i));
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
function materialFor(inst, highlighted, zone = '') {
  const type = typeByNode[inst.cfg.node];
  const key = zoneKey(type, zone);
  const base = (inst.alt && !zone) ? altMatFor(type) : baseMatFor(type, zone); // zoned types aren't tiled — alt is a body-only concept
  if (!highlighted) return base;
  const cache = (inst.alt && !zone) ? altHighlightMats : highlightMats;
  if (!cache[key]) {
    const m = base.clone();
    // ⚠ Material.copy() does NOT carry onBeforeCompile/customProgramCacheKey, so
    // a cloned highlight would silently lose a build-plate transfer — and the
    // selected plate is exactly where it must not vanish.
    if (base.onBeforeCompile) { m.onBeforeCompile = base.onBeforeCompile; m.customProgramCacheKey = base.customProgramCacheKey; }
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
function setSelected(id) {
  if (selectedId === id) return;
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
  sw.title = selLocked ? 'Hardware-store item · shown in its real finish'
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
    const m = materialFor(inst, false, o.userData.zone).clone();
    m.transparent = true;
    m.userData.fpFade = true; // exit only reclaims meshes that still hold OUR clone
    o.material = m;
    mats.push(m);
  });
  fpFocus.mats.set(inst.cfg.id, mats);
  tween({
    duration: DUR.fade,
    onUpdate: k => mats.forEach(m => { m.opacity = 1 - (1 - FP_FADE) * k; }),
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
    onUpdate: k => mats.forEach(m => { m.opacity = FP_FADE + (1 - FP_FADE) * k; }),
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
// Multi-brand filament database. Each brand entry: { brand, line, url (shop
// fallback), colors: [{name, label, hex, url, pick?}] }. `label` must stay
// UNIQUE across all brands — customColors stores it as the identity key.
// Adding a brand (Prusa / Polar / Printed Solids / …) = appending one entry
// here; the menu renders it as its own collapsible section automatically.
// Polymaker: real Panchroma™ Basic PLA 1.75mm/1kg variants (names + Shopify
// variant ids pulled from shop.polymaker.com 2026-07-05; hexes approximated —
// refine against the spool renders anytime). The Elegoo entry is Joey's
// budget pick (amzn.to IS an affiliate link) — mainly cases & drawer bodies.
//
// Polymaker links are Joey's AMBASSADOR tracked links (Superfiliate, 2026-08-07).
// The `q` value is Superfiliate's OWN feed handle — `pla` / `silk-pla`, NOT the
// shop's `panchroma-pla` / `panchroma-silk` — and only PORTAL-MINTED values are
// valid: an unknown q fails SOFT (attribution + the 15% first-purchase code
// still attach; the shopper just lands on the store root instead of the
// product). Chain: /JERRARI?q=… → superfiliate session → /discount/JERRARI
// ?redirect=/products/… — so the code arrives pre-applied at checkout.
// Colour/variant preselect is NOT supported by these links (verified: the
// variant syntax gets stripped), which is why the buy button names the exact
// colour to pick on the page. The per-colour variant ids are KEPT in the data
// below so plain deep links can be restored the day Superfiliate supports
// them: `https://shop.polymaker.com/products/panchroma-pla?variant=${id}`.
const POLY_LINK = q => `https://shop.polymaker.com/JERRARI?q=${q}`;
const PM = id => POLY_LINK('pla');           // id retained in the colour rows, unused for now
const PM_SILK = POLY_LINK('silk-pla');
const POLYMAKER_URL = PM(44863271895097);
const FILAMENT_DB = [
  { brand: 'Polymaker', line: 'Panchroma™ PLA', url: POLYMAKER_URL, colors: [
    { name: 'Black',           hex: '#2b2b2e', id: 44863271731257 },
    { name: 'Dark Grey',       hex: '#4a4c51', id: 44863271010361 },
    { name: 'Steel Grey',      hex: '#6e7178', id: 44863271829561 },
    { name: 'Grey',            hex: '#9a9da3', id: 44863271862329 },
    { name: 'Cold White',      hex: '#eef1f4', id: 44863271043129 },
    { name: 'White',           hex: '#f5f4ee', id: 44863271895097 },
    { name: 'Cream',           hex: '#f1e7cf', id: 44863271239737 },
    { name: 'Beige',           hex: '#ddc9a3', id: 44863271436345 },
    { name: 'Tan',             hex: '#c8a97e', id: 44863271108665 },
    { name: 'Brown',           hex: '#7a5236', id: 44863271338041 },
    { name: 'Red',             hex: '#d23a2e', id: 44863271796793 },
    { name: 'Wine Red',        hex: '#7e2432', id: 44863271534649 },
    { name: 'Magenta',         hex: '#d4308f', id: 44863271174201 },
    { name: 'Pink',            hex: '#f0a4c0', id: 44863271632953 },
    { name: 'Orange',          hex: '#ff8a40', id: 44863271665721 },
    { name: 'Yellow',          hex: '#f5c542', id: 44863271567417 },
    { name: 'Lemon Yellow',    hex: '#f8e35a', id: 44863271305273 },
    { name: 'Lime Green',      hex: '#9ccb3b', id: 44863271206969 },
    { name: 'Green',           hex: '#3f9b4f', id: 44863271698489 },
    { name: 'Jungle Green',    hex: '#1f6e46', id: 44863271501881 },
    { name: 'Olive Green',     hex: '#708238', id: 44863271469113 },
    { name: 'Dark Olive Drab', hex: '#4e5136', id: 44863271075897 },
    { name: 'Polymaker Teal',  hex: '#00a5a5', id: 44863271272505 },
    { name: 'Aqua Blue',       hex: '#5cc6e0', id: 44863271403577 },
    { name: 'Azure Blue',      hex: '#2e8fdc', id: 44863271141433 },
    { name: 'Blue',            hex: '#2f6fbe', id: 44863271764025 },
    { name: 'Stone Blue',      hex: '#4a6a8a', id: 44863271370809 },
    { name: 'Purple',          hex: '#7a4fb0', id: 44863271600185 },
  ].map(f => ({ ...f, label: `Panchroma ${f.name}`, url: PM(f.id) })) },
  // Silk is a separate Panchroma product page (shop handle silk-pla), so it
  // gets its own section rather than a stray url inside the Basic PLA block.
  // All 24 new-formula 1.75mm/1kg colours (variant ids scraped from the shop's
  // product JSON 2026-08-07, shop's own order; ids KEPT like the PLA section's
  // — unused until Superfiliate supports variant deep links; hexes are
  // approximated silk sheens, refine against spool renders anytime).
  // Availability is deliberately NOT tracked — spool stock shifts weekly
  // (Silver ships as a refill right now) and the product page is the truth.
  // Silver is the Classic faceplate GRIP ACCENT default (Joey 2026-07-25) —
  // its label 'Panchroma Silk Silver' is load-bearing: PRESETS' CLASSIC_FACE
  // block and saved user palettes match on it exactly.
  { brand: 'Polymaker', line: 'Panchroma™ Silk PLA', url: PM_SILK, colors: [
    { name: 'Silk Black',         hex: '#3a3b40', id: 43637560868921 },
    { name: 'Silk Purple',        hex: '#8655c8', id: 43637560901689 },
    { name: 'Silk Magenta',       hex: '#d63d9a', id: 43637560934457 },
    { name: 'Silk Rose',          hex: '#e87c9c', id: 43637560967225 },
    { name: 'Silk Red',           hex: '#d43a3a', id: 43637560999993 },
    { name: 'Silk Rose Gold',     hex: '#e0a48c', id: 43637561032761 },
    { name: 'Silk Quartz Pink',   hex: '#f2c4cf', id: 43637561065529 },
    { name: 'Silk Bronze',        hex: '#b0703a', id: 43637561098297 },
    { name: 'Silk Orange',        hex: '#f28034', id: 43637561131065 },
    { name: 'Silk White',         hex: '#f4f3ee', id: 43637561163833 },
    { name: 'Silk Gold',          hex: '#d9b13b', id: 43637561196601 },
    { name: 'Silk Yellow',        hex: '#f2d03c', id: 43637561229369 },
    { name: 'Silk Lime',          hex: '#aad438', id: 43637561262137 },
    { name: 'Silk Green',         hex: '#3da954', id: 43637561294905 },
    { name: 'Silk Teal',          hex: '#2aa8a0', id: 43637561327673 },
    { name: 'Silk Light Blue',    hex: '#7ec3ea', id: 43637561360441 },
    { name: 'Silk Blue',          hex: '#3672c8', id: 43637561393209 },
    { name: 'Silk Chrome',        hex: '#c8ccd2', id: 43637561425977 },
    { name: 'Silk Silver',        hex: '#cdd2d9', id: 43637561458745, pick: true,
      pickNote: ' · Joey’s silver for grip-accent rods' },
    { name: 'Silk Brass',         hex: '#c9a545', id: 43637561491513 },
    { name: 'Silk Peridot Green', hex: '#9fb43a', id: 43637561524281 },
    { name: 'Silk Periwinkle',    hex: '#8a96dc', id: 43637561557049 },
    { name: 'Silk Dark Blue',     hex: '#2b4a8c', id: 43637561589817 },
    { name: 'Silk Gunmetal Grey', hex: '#6a6f78', id: 43637561622585 },
  ].map(f => ({ ...f, label: `Panchroma ${f.name}`, url: PM_SILK })) },
  // Polymaker PETG — feed handle petg, all 25 real 1.75mm/1kg variants
  // (variant ids scraped from the shop's product JSON 2026-08-07, shop order,
  // Galaxy/Clear/Army Brown included; hexes approximated like every section).
  // ★ PETG Black is Joey's recommended PETG — the premium lane beside the
  // Elegoo budget pick below; both stars are honest, different budgets.
  { brand: 'Polymaker', line: 'PETG', url: POLY_LINK('petg'), colors: [
    { name: 'PETG Black',            hex: '#26272b', id: 45079221108793, pick: true,
      pickNote: ' · Joey’s recommended PETG for cases & drawer bodies' },
    { name: 'PETG White',            hex: '#f2f2ee', id: 45079221141561 },
    { name: 'PETG Grey',             hex: '#9a9da3', id: 45079221174329 },
    { name: 'PETG Red',              hex: '#cf3430', id: 45079221207097 },
    { name: 'PETG Orange',           hex: '#f07a26', id: 45079221239865 },
    { name: 'PETG Blue',             hex: '#2f66b8', id: 45079221272633 },
    { name: 'PETG Yellow',           hex: '#f2c73b', id: 45079221305401 },
    { name: 'PETG Dark Grey',        hex: '#4d4f54', id: 45079221338169 },
    { name: 'PETG Teal',             hex: '#159a9c', id: 45079221370937 },
    { name: 'PETG Silver',           hex: '#b9bec6', id: 45079221403705 },
    { name: 'PETG Green',            hex: '#2f9e53', id: 45079221436473 },
    { name: 'PETG Electric Blue',    hex: '#1d7fe0', id: 45079221469241 },
    { name: 'PETG Purple',           hex: '#7b4fb5', id: 45079221502009 },
    { name: 'PETG Dark Blue',        hex: '#23407f', id: 45079221534777 },
    { name: 'PETG Lime',             hex: '#a6cf3a', id: 45079221567545 },
    { name: 'PETG Dark Green',       hex: '#1e6b46', id: 45079221600313 },
    { name: 'PETG Magenta',          hex: '#d23590', id: 45079221633081 },
    { name: 'PETG Pink',             hex: '#ef9cc0', id: 45079221665849 },
    { name: 'PETG Dark Purple',      hex: '#462a6b', id: 45079221698617 },
    { name: 'PETG Army Brown',       hex: '#6f5b3e', id: 45588258095161 },
    { name: 'PETG Clear',            hex: '#e8ecef', id: 46279866023993 },
    { name: 'PETG Galaxy Black',     hex: '#23252e', id: 45588258553913 },
    { name: 'PETG Galaxy Dark Grey', hex: '#4a4e59', id: 45588259078201 },
    { name: 'PETG Galaxy Blue',      hex: '#2b4a8c', id: 45588259176505 },
    { name: 'PETG Galaxy Red',       hex: '#8c2430', id: 45588259504185 },
  ].map(f => ({ ...f, label: `Polymaker ${f.name}`, url: POLY_LINK('petg') })) },
  { brand: 'Elegoo', line: 'PLA / PETG', url: 'https://amzn.to/3QWCdV6', colors: [
    { name: 'PETG Black', label: 'Elegoo PETG Black', hex: '#232427', url: 'https://amzn.to/3QWCdV6', pick: true },
    // PLA Black is the Classic faceplate BODY default (Joey 2026-07-25)
    { name: 'PLA Black', label: 'Elegoo PLA Black', hex: '#1c1d20', url: 'https://amzn.to/4fqvv1O', pick: true,
      pickNote: ' · Joey’s black for faceplate bodies & shells' },
  ] },
  // Printed Solid (Jessie) PLA — real solid Basic/Premium colors with printedsolid.com
  // product links (hexes = the flat swatches from 3dfilamentprofiles.com/filaments/printed-solid;
  // Pure Magenta/Natural read pale — kept as-sourced). Mystery Orange is Joey's Handle orange.
  { brand: 'Printed Solid', line: 'PLA', url: 'https://www.printedsolid.com/collections/1-75mm-jessie', colors: [
    { name: 'Mystery Orange',   hex: '#F56233', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-mystery-orange', pick: true, pickNote: ' · Joey’s orange for the Handles' },
    { name: 'Blue Whale Grey',  hex: '#35608E', url: 'https://www.printedsolid.com/collections/filament/products/jessie-pla-1-75mm-x-1kg-blue-whale-grey' },
    { name: 'Purple Ice',       hex: '#C965EA', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-purple-ice' },
    { name: 'Red Ice',          hex: '#862E26', url: 'https://www.printedsolid.com/collections/jessie/products/jessie-pla-1-75mm-x-1kg-red-ice' },
    { name: 'White',            hex: '#EFEFEA', url: 'https://www.printedsolid.com/collections/jessie/products/jessie-pla-1-75mm-x-1kg-white' },
    { name: 'Black',            hex: '#2A242D', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-black' },
    { name: 'Natural',          hex: '#FFFFCC', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-natural' },
    { name: 'PS Red',           hex: '#EC2F26', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-ps-red' },
    { name: 'Safety Orange',    hex: '#F04000', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-safety-orange' },
    { name: 'Yellow Bird',      hex: '#FDC230', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-yellow-bird' },
    { name: 'Neon Green',       hex: '#B1DA00', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-neon-green' },
    { name: 'Bold Blue',        hex: '#0251A7', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-bold-blue' },
    { name: 'Blue Ice',         hex: '#201E8A', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-blue-ice' },
    { name: 'Blue Moon',        hex: '#022679', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-blue-moon' },
    { name: 'Deep Purple',      hex: '#2E073E', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-deep-purple' },
    { name: 'Purple Eater',     hex: '#8E4FB0', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-purple-eater' },
    { name: 'Pure Magenta',     hex: '#FFE0F8', url: 'https://www.printedsolid.com/products/jessie-pla-1-75mm-x-1kg-pure-magenta' },
    { name: 'Elixir Aquamarine',hex: '#2E8FFF', url: 'https://www.printedsolid.com/products/jessie-premium-elixir-1-75mm-x-aquamarine-1kg' },
    { name: 'Elixir Gold Rush', hex: '#F0C838', url: 'https://www.printedsolid.com/products/jessie-premium-elixir-1-75mm-x-gold-rush-1kg' },
    { name: 'Elixir Nightshade',hex: '#501282', url: 'https://www.printedsolid.com/products/jessie-premium-elixir-1-75mm-x-nightshade-1kg' },
    { name: 'Elixir Royal Ruby',hex: '#A91E16', url: 'https://www.printedsolid.com/products/jessie-premium-elixir-1-75mm-x-royal-ruby-1kg' },
  ].map(f => ({ ...f, label: `Printed Solid ${f.name}` })) },
  // ERYONE Burnt Titanium — the REAL "holo blue" Joey prints Accent panels in
  // (the presets' _navy placeholder until 2026-08-07). One colour-shift blue,
  // Amazon listing → isPaidLink marks it automatically like every amzn link.
  { brand: 'ERYONE', line: 'Burnt Titanium PLA', url: 'https://amzn.to/4fTKtO9', colors: [
    { name: 'Burnt Titanium', label: 'ERYONE Burnt Titanium', hex: '#31517e', url: 'https://amzn.to/4fTKtO9', pick: true,
      pickNote: ' · Joey’s colour-shift blue for Accent panels' },
  ] },
];

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
    Rail: _db('Panchroma Black'),
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
    Bracket: _db('Panchroma Steel Grey'),
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
    Rail: _db('Panchroma Brown'),
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
const COLOR_STORE_KEY = 'gen2-colors:' + (BUILD_HASH ? 'custom-build' : OFFICIAL ? 'official-' + OFFICIAL.id : KIT);
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

function applyPalette() {
  for (const [type, mat] of Object.entries(materials)) mat.color.set(activeHex(type));
  for (const [type, mat] of Object.entries(highlightMats)) mat.color.set(activeHex(type));
  // lightened alternate-tile variants track the active palette too — and fall
  // to lerp 0 (identical to base) for types with a custom filament pick, so a
  // preset's covers/footrails render uniform without any material reassignment
  for (const [type, mat] of Object.entries(altMaterials)) mat.color.set(activeHex(type)).lerp(new THREE.Color('#ffffff'), altLerp(type));
  for (const [type, mat] of Object.entries(altHighlightMats)) mat.color.set(activeHex(type)).lerp(new THREE.Color('#ffffff'), altLerp(type));
  renderChecklist();
  updateColorToggle();
  renderPresets(); // keep the active preset / My-palette chip highlight in step
  if (selectedId) {
    const inst = instances.get(selectedId);
    $('identify-swatch').style.background = activeHex(primaryKey(inst.cfg.node));
    renderZoneChips(inst); // keep the Body/Grip dots tracking the live palette
  }
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
const setPresetsOpen = open => {
  sessionStorage.setItem('gen2-presets-open', open ? '1' : '0');
  $('preset-chips').classList.toggle('hidden', !open);
  $('preset-io').classList.toggle('hidden', !open);
  $('preset-head').classList.toggle('collapsed', !open);
  $('preset-head').setAttribute('aria-expanded', String(open));
};
$('preset-head').onclick = () => setPresetsOpen($('preset-chips').classList.contains('hidden'));
setPresetsOpen(sessionStorage.getItem('gen2-presets-open') !== '0');
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
  const prevActive = activeHandleStyle, prevPlanner = build && build.handleStyle;
  activeHandleStyle = style;
  if (build) build.handleStyle = style.planner; // keep the build in sync (regenerate/BOM/reset read this)
  if (!templates[style.node]) {
    try {
      const gltf = await loader.loadAsync(`${PARTS_BASE}${style.node}.lib.glb`);
      const mat = materials.Handle || fallbackMat;
      gltf.scene.traverse(o => { if (o.isMesh) o.material = mat; });
      templates[style.node] = gltf.scene;
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
    inst.group.position.copy(basePos(inst, inst.staged)).add(off);
  }
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
      templates[node] = adoptTemplate(gltf.scene, 'Faceplate');
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
  const modelCovers = (ndcX, ndcY, worldPt) => { // is the model IN FRONT of this line point?
    dimRay.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const hit = dimRay.intersectObjects(targets, true)[0];
    return !!hit && hit.distance < camera.position.distanceTo(worldPt) - 2;
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
const DETAIL_TYPES = new Set(['Handle', 'QuickLock', 'Foot', 'Faceplate']); // exterior parts only — no macro shots of hidden stoppers/magnets
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
function currentOpts() {
  if (!build) return null;
  const closures = {};
  for (const u of build.placed) if (u.fill === 'decor' || u.fill === 'classic') closures[u.id] = u.closure === 'magnet' ? 'magnet' : 'none';
  return { closures, removedStoppers: build.removedStoppers || [], wallStagger: !!build.wallStagger, handleStyle: build.handleStyle, faceStyle: build.faceStyle, backCover: !!build.backCover };
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
const layoutKey = b => JSON.stringify([b.mount, +b.length, (b.placed || []).map(u =>
  [u.id, u.x, u.y, u.w, u.hh, u.fill, u.shelves || 0, u.label || '', u.closure || '', JSON.stringify(u.interior ?? null)])]);
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
  if (!changed) return;
  applyingRemote = true;
  try {
    if (o.closures) for (const u of build.placed) if (o.closures[u.id]) u.closure = o.closures[u.id];
    if (Array.isArray(o.removedStoppers)) build.removedStoppers = o.removedStoppers;
    if (typeof o.wallStagger === 'boolean') build.wallStagger = o.wallStagger;
    if (o.handleStyle) build.handleStyle = o.handleStyle;
    if (o.faceStyle) build.faceStyle = o.faceStyle;
    if (typeof o.backCover === 'boolean') build.backCover = o.backCover;
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
  ensureMaterials();
  await loadTemplates();
  if (plateActive()) ensurePlateUVs();   // plate GLBs ship position+normal only
  buildInstances();
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
};
// lifecycle: loading → ready (posted) | failed — failed is a SINK: once set,
// partReady can never post (context loss / mount failure must leave the site
// on its poster, not hand it a blank canvas)
const partView = { interacted: false, pose: null, visible: true, posted: false, failed: false };
function fitPartCamera() {
  const a = PART_CAM[manifest.parts[0]?.type] || { t: 33, p: 66 }; // default: 3/4 box
  camera.fov = 38;
  camera.updateProjectionMatrix();
  const { pos, target } = camPos({ t: a.t, p: a.p, fitR: buildRadius * 1.12, fov: 38, target: buildCenter.toArray() });
  camera.position.copy(pos);
  controls.target.copy(target);
  controls.minDistance = buildRadius * 0.9;      // don't fly inside the part
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
const plateStage = { group: null, top: false, yawed: false };
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

renderer.setAnimationLoop(now => {
  // offscreen part-preview cards stop rendering entirely (only after the ready
  // frame was posted — the site must never wait on a suspended first frame)
  if (IS_PART && partView.posted && !partView.visible) return;
  resize();
  qualityTick(now);
  stepTweens(now);
  if (cinema.on) updateCinema(now); else controls.update();
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
  // ⚠ AO and the reflection are the only things here touching driver-dependent
  // features (render targets, depth textures, an override material). A throw
  // INSIDE setAnimationLoop kills the whole loop — the screen would freeze
  // entirely, which is far worse than losing an effect. So each one is guarded
  // and disables ITSELF permanently on first failure, degrading to the plain
  // render instead of taking the studio down on some GPU we've never seen.
  guardFx('reflection', updateReflection);
  guardFx('ao', updateAO);
  renderer.render(scene, camera);
  guardFx('ao', compositeAO);   // laid over the finished frame; no composer in the path
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
});

// dev-only hook (mirrors the planner's guarded test-hook convention): ?debug=1
if (new URLSearchParams(location.search).get('debug')) {
  window.__GEN2_VIEWER__ = { THREE, scene, camera, controls, goTo, applyState, instances, manifest, cinema, updateCinema, cinemaScene, party, confetti, confettiPop, fpFocus, fpEnv,
    renderer, table, grid, camPos, captureShot, get buildCenter() { return buildCenter; },
    // render-quality internals (2026-08-10) — the tier, the AO buffers and the
    // reflector, so a rendering question can be answered by reading state instead
    // of squinting at a screenshot
    QUALITY, get quality() { return quality; }, applyQuality, setQuality,
    ao, updateAO, compositeAO, aoWanted, refl, updateReflection, studioEnv,
    fxDead, perf, get tweenCount() { return tweens.size; },
    get build() { return build; }, regenerate, setSelected, get selectedId() { return selectedId; },
    // part-preview internals (2026-08-19) — the mode flag, the view state and
    // the resolver, so an embed question is answerable by reading state
    IS_PART, partView, resolvePartPreview, fitPartCamera, PART_PLATE, plateStage,
    trackLog, track };
}
