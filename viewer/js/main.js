// GEN2 Assembly Instructions viewer — build-free, data-driven.
// One kit = one folder under kits/<name>/ holding manifest.json + parts/*.lib.glb.
// The viewer never changes between kits; everything it animates comes from the manifest.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { generateManifest } from './generate.js';

const KIT = new URLSearchParams(location.search).get('kit') || 'tabletop-185';
const KIT_URL = `kits/${KIT}/`;
// #build=<base64> — the planner's own share-link encoding, generated at runtime
const BUILD_HASH = (location.hash || '').match(/build=([^&]+)/);

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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
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

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // re-fit a whole-build shot to the new aspect (skip during the cinema, which
    // drives the camera itself)
    if (curCamPreset?.fit && !cinema.on && !tweens.size && !camOverride) {
      const { pos, target } = camPos(curCamPreset);
      camera.position.copy(pos); controls.target.copy(target); controls.update();
    }
  }
}

// ---------- load manifest + parts ----------
// `build` is the decoded planner build (null for static kits). The options menu
// mutates it and regenerate() re-runs the generator + re-mounts the scene, so
// most manifest-derived state below is (re)built inside mountManifest().
let manifest, PARTS_BASE, build = null, originalBuild = null;
const decodeBuild = h => { const raw = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(h))))); return raw.data || raw; };
if (BUILD_HASH) {
  let gen;
  try {
    build = decodeBuild(BUILD_HASH[1]); // accept raw serializeBuild() or the file export wrapper
    originalBuild = structuredClone(build); // "Reset to original" restores this exact build
    gen = generateManifest(build);
  } catch (e) {
    gen = { errors: ['This build link is damaged or truncated — try copying it again from the planner.'], manifest: null };
  }
  if (!gen.manifest) {
    const box = document.getElementById('loading-overlay');
    box.querySelector('.spinner')?.remove();
    document.getElementById('loading-text').innerHTML =
      '<strong>Can’t show this build yet</strong><br><br>' + gen.errors.map(e => '• ' + e).join('<br>');
    throw new Error('unsupported build: ' + gen.errors.join('; '));
  }
  manifest = gen.manifest;
  PARTS_BASE = 'parts/185/';
} else {
  manifest = await (await fetch(KIT_URL + 'manifest.json')).json();
  PARTS_BASE = KIT_URL + 'parts/';
}

// mount type is fixed for the life of the page (toggles never change it), so the
// backdrop + polar limits are set once here from the first manifest.

// wall builds hang on a wall, not a table — swap the table+grid for the backdrop.
const isWallBuild = manifest.mount === 'wall';
if (isWallBuild) {
  table.visible = false;
  grid.visible = false;
  wall.visible = true;
  scene.background = new THREE.Color(0xd7d4ce); // slightly deeper than the wall, for depth
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

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const materials = {};
const fallbackMat = new THREE.MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.6 });
function ensureMaterials() { // one shared material per part type (idempotent across re-mounts)
  for (const [type, hex] of Object.entries(manifest.colors))
    if (!materials[type]) materials[type] = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.55, metalness: 0.05 });
}

// tiled multi-width types: adjacent same-type tiles alternate a slightly lighter
// shade of the type color, so a 2W landing next to a 1W reads as two parts, not
// one fused piece. Same hue = same identity in the BOM; the lightened variants
// re-derive from the active palette (instruction OR custom filament colors).
const TILED_TYPES = new Set(['FootrailL', 'FootrailU', 'CoverL', 'CoverU', 'Bracket', 'Rail']);
const ALT_LIGHTEN = 0.16;
const altMaterials = {};
function altMatFor(type) {
  if (!altMaterials[type]) {
    const m = (materials[type] || fallbackMat).clone();
    m.color.lerp(new THREE.Color('#ffffff'), ALT_LIGHTEN);
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
  await Promise.all(need.map(async node => {
    const gltf = await loader.loadAsync(`${PARTS_BASE}${node}.lib.glb`);
    const mat = materials[typeByNode[node]] || fallbackMat;
    gltf.scene.traverse(o => { if (o.isMesh) o.material = mat; });
    templates[node] = gltf.scene;
  }));
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
function computeBounds() {
  const box = new THREE.Box3();
  for (const inst of instances.values()) {
    inst.group.position.copy(basePos(inst, false));
    inst.group.updateMatrixWorld(true);
    box.expandByObject(inst.group);
  }
  if (!box.isEmpty()) {
    box.getCenter(buildCenter);
    buildRadius = box.getSize(new THREE.Vector3()).length() / 2; // ≈ bounding-sphere radius
  }
}
// distance at which the bounding sphere (× margin) fits BOTH the vertical and
// horizontal FOV — the max keeps it uncropped on wide (fills height) and narrow
// (fills width) viewports alike.
function fitDistance(margin, fovDeg) {
  // frame with the fov the shot will END at (presets default to 40) — reading
  // the live camera.fov here overshot ~4× when dot-jumping from the telephoto
  // cover (fov 9) straight to a fit step.
  const vFov = THREE.MathUtils.degToRad(fovDeg || camera.fov || 40);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (camera.aspect || 1.6));
  const R = buildRadius * margin;
  return Math.max(R / Math.sin(vFov / 2), R / Math.sin(hFov / 2));
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
    inst.group.visible = st.visible.has(inst.cfg.id);
    inst.staged = !!inst.cfg.stage && !st.settled.has(inst.cfg.stage);
    inst.group.position.copy(basePos(inst, inst.staged));
    // restore shared materials (an interrupted fade leaves per-mesh clones)
    inst.group.traverse(o => { if (o.isMesh) o.material = materialFor(inst, false); });
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
    inst.group.visible = true;
    inst.staged = false;
    inst.group.position.copy(exploded.get(inst.cfg.id));
    inst.group.traverse(o => { if (o.isMesh) o.material = materialFor(inst, false); });
  }
}
// animated variant: parts drift from wherever they are (the finished cover
// assembly) out to the exploded spread while the camera pans in from the cover
function playExploded() {
  killTweens();
  for (const inst of instances.values()) {
    inst.staged = false;
    inst.group.traverse(o => { if (o.isMesh) o.material = materialFor(inst, false); });
    const e = exploded.get(inst.cfg.id);
    if (!inst.group.visible) { inst.group.visible = true; inst.group.position.copy(e); continue; }
    const fromV = inst.group.position.clone();
    tween({ duration: 1000, onUpdate: k => inst.group.position.lerpVectors(fromV, e, k) });
  }
}

// ---------- cover page ----------
// Synthetic page 0: the finished build, shot "telephoto" (tiny FOV, camera far
// away) for an isometric feel, framed left of center to leave room for the
// brand overlay. Engine-computed — works for kits and generated builds alike.
function applyCover() {
  killTweens();
  applyState(manifest.steps.length - 1); // the finished assembly
  const box = new THREE.Box3();
  for (const inst of instances.values()) if (inst.group.visible) box.expandByObject(inst.group);
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const spread = Math.max(size.x, size.y * 1.9, size.z);
  return { t: 0, p: 82, r: spread * 7.2, target: [c.x + size.x * 0.33, c.y * 0.98, 0], fov: 9 };
}

// ---------- step animation ----------
const DUR = { enter: 750, settle: 850, move: 600, fade: 650, stagger: 130, camera: 750 };
let animToken = 0;

async function playStep(i) {
  const my = ++animToken;
  const step = manifest.steps[i];
  if (step.checklist) { playExploded(); tweenCamera(step.camera, 1400); return; }
  applyState(i - 1);
  tweenCamera(step.camera);
  for (const ph of step.phases || []) {
    if (my !== animToken) return;
    const jobs = [];
    // a phase can retarget the camera mid-step (e.g. zoom in on the pegs, then
    // zoom back out) — the phase waits for the move like any other job.
    if (ph.camera) jobs.push(tweenCamera(ph.camera, DUR.camera));
    // ghost: fade instances to translucent so you can see through them (e.g. a
    // cover, to reveal the pegs behind it); solid: fade them back opaque.
    (ph.ghost || []).forEach(g => {
      const inst = instances.get(g.id);
      const mats = [];
      inst.group.traverse(o => {
        if (!o.isMesh) return;
        const m = materialFor(inst, false).clone();
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
        onDone: () => inst.group.traverse(o => { if (o.isMesh) o.material = materialFor(inst, false); })
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
      inst.group.visible = true;
      inst.group.position.copy(fromV);
      jobs.push(tween({
        duration: DUR.enter * pace, delay: ph.sync ? 0 : n * DUR.stagger * pace,
        onUpdate: k => inst.group.position.lerpVectors(fromV, to, k)
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
      inst.group.visible = true;
      inst.group.position.copy(basePos(inst, inst.staged));
      const mats = [];
      inst.group.traverse(o => {
        if (!o.isMesh) return;
        const m = materialFor(inst, false).clone();
        m.transparent = true;
        m.opacity = 0;
        o.material = m;
        mats.push(m);
      });
      jobs.push(tween({
        duration: DUR.fade, delay: n * 80,
        onUpdate: k => mats.forEach(m => { m.opacity = k; }),
        onDone: () => inst.group.traverse(o => { if (o.isMesh) o.material = materialFor(inst, false); })
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
  // the current aspect instead of a fixed distance; others use their tuned r.
  const r = preset.fit ? fitDistance(preset.fit, preset.fov || 40) : preset.r;
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
    d.onclick = () => goTo(i);
    wrap.appendChild(d);
    return d;
  });
}

function linkEl(text, href) {
  const a = document.createElement('a');
  a.className = 'dl-link';
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = text;
  return a;
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
async function setAllClosure(val) { drawersInBuild().forEach(u => u.closure = val); await regenerate(); }
async function setAllStoppers(on) { build.removedStoppers = on ? [] : allStopperKeys(); await regenerate(); }
async function resetBuild() { build = structuredClone(originalBuild); activeHandleStyle = null; await regenerate(); }
function renderOptions() {
  const box = $('build-options');
  if (!box) return;
  box.innerHTML = '';
  if (!build) { box.classList.add('hidden'); return; } // static kits have no editable build
  box.classList.remove('hidden');
  const title = document.createElement('div'); title.className = 'opt-title'; title.textContent = '⚙ Build options';
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
  if (currentHandleStyleIndex() >= 0) {
    const row = document.createElement('div'); row.className = 'opt-row';
    const lab = document.createElement('span'); lab.className = 'opt-label'; lab.textContent = 'Handle';
    const grp = document.createElement('div'); grp.className = 'opt-seg opt-cycle';
    const prev = document.createElement('button'); prev.textContent = '◀'; prev.onclick = () => cycleHandleStyle(-1);
    const name = document.createElement('span'); name.className = 'opt-cycle-name';
    const idx = currentHandleStyleIndex(); name.textContent = idx >= 0 ? HANDLE_STYLES[idx].label.replace(' Handle', '') : '?';
    const next = document.createElement('button'); next.textContent = '▶'; next.onclick = () => cycleHandleStyle(1);
    grp.append(prev, name, next); row.append(lab, grp); box.appendChild(row);
  }
  if (isWallBuild) {
    box.appendChild(optSeg('Top cover', [{ label: 'Per-column', val: false }, { label: 'Staggered', val: true }], !!build.wallStagger,
      async v => { build.wallStagger = v; await regenerate(); }));
  }
  const reset = document.createElement('button'); reset.className = 'opt-reset'; reset.textContent = '↺ Reset to original';
  reset.onclick = resetBuild; box.appendChild(reset);
}

function renderChecklist() {
  renderOptions();
  const rows = $('checklist-rows');
  rows.innerHTML = '';
  let total = 0;
  for (const p of manifest.parts) {
    if (!p.purchased) total += p.qty; // purchased hardware isn't a print
    const row = document.createElement('div');
    row.className = 'checklist-row';
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.style.background = activeHex(p.type); // reflects custom filament colors
    chip.title = (useCustom && customColors[p.type] ? customColors[p.type].name + ' · ' : '') + 'click to pick a filament color';
    chip.onclick = () => openFilamentMenu(p.type);
    const mid = document.createElement('div');
    mid.className = 'cl-mid';
    const label = document.createElement('span');
    label.textContent = p.label;
    mid.appendChild(label);
    if (p.links) {
      const lnks = document.createElement('span');
      if (p.links.p) lnks.appendChild(linkEl('Printables', p.links.p));
      if (p.links.t) lnks.appendChild(linkEl('Thangs', p.links.t));
      mid.appendChild(lnks);
    }
    const qty = document.createElement('span');
    qty.className = 'qty';
    qty.textContent = '×' + p.qty + (p.purchased ? ' · buy' : '');
    row.append(chip, mid, qty);
    rows.appendChild(row);
  }
  $('checklist-title').textContent = `Print these parts first (${total} prints)`;
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
}

// ---------- BOM export (mirrors the planner's Copy / CSV actions) ----------
function bomRows() {
  return manifest.parts.filter(p => p.qty > 0).map(p => ({
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
  navigator.clipboard.writeText(txt).then(() => flashBtn('bom-copy', '✓ Copied!'));
}
function downloadCsv() {
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
  $('filament-menu').classList.add('hidden');
  stopCinema();
  cur = Math.max(0, Math.min(PAGES.length - 1, i));
  const page = PAGES[cur];
  const isCover = !!page.cover, isOutro = !!page.outro;
  $('cover-overlay').classList.toggle('hidden', !isCover);
  $('outro-overlay').classList.toggle('hidden', !isOutro);
  $('controls').classList.toggle('hidden', isCover);
  $('note-panel').classList.toggle('hidden', isCover || isOutro);
  // the "tap any part" hint only rides the exploded intro page (and only until dismissed)
  const onChecklist = !isCover && !isOutro && !!manifest.steps[cur - 1]?.checklist;
  $('tap-hint').classList.toggle('hidden', !onChecklist || tapHintDismissed);
  dots.forEach((d, n) => d.classList.toggle('on', n <= cur));
  updateColorToggle();
  if (isCover) {
    $('step-counter').textContent = '';
    setCamOverride(false); // the cover owns the camera — reset any user override
    setChecklist(false);
    $('checklist-tab').classList.add('hidden'); // cover stays clean
    animToken++;
    camTweenToken++;
    const preset = applyCover();
    const { pos, target } = camPos(preset);
    camera.position.copy(pos);
    controls.target.copy(target);
    camera.fov = preset.fov;
    camera.updateProjectionMatrix();
    return;
  }
  if (isOutro) {
    $('step-counter').textContent = 'Thanks for building';
    setCamOverride(false); // the cinema owns the camera
    $('btn-pause').disabled = true; // the cinema runs its own clock — not pausable
    setChecklist(!isMobile()); // desktop finale shows the full list; mobile keeps it one tap away (less clutter)
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
  $('step-title').textContent = step.title;
  $('step-note').textContent = step.note || '';
  const numbered = !step.checklist; // assembly steps count from 1, intro shows none
  $('step-num').classList.toggle('hidden', !numbered);
  $('step-num').textContent = numbered ? stepIdx : '';
  $('step-counter').textContent = numbered ? `Step ${stepIdx} / ${manifest.steps.length - 1}` : 'Intro';
  setChecklist((!!step.checklist || stepIdx === manifest.steps.length - 1) && !isMobile());
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
$('btn-replay').onclick = () => goTo(cur);
$('btn-slow').onclick = () => {
  slowmo = !slowmo;
  $('btn-slow').classList.toggle('on', slowmo);
};
function setPaused(on) {
  paused = on;
  const b = $('btn-pause');
  b.classList.toggle('on', on);
  b.querySelector('i').textContent = on ? '▶' : '⏸';
  b.querySelector('span').textContent = on ? 'Play' : 'Pause';
}
$('btn-pause').onclick = () => setPaused(!paused);
// google-maps-style "re-center": drop the user override and glide back to
// wherever the guided camera last wanted to be.
$('btn-cam').onclick = () => { setCamOverride(false); tweenCamera(curCamPreset, 900, true); };
$('btn-start').onclick = () => goTo(1); // cover → intro, camera pans + de-zooms
$('checklist-tab').onclick = () => { if (isMobile()) setSelected(null); setChecklist(true); };
$('checklist-close').onclick = () => setChecklist(false);
let tapHintDismissed = false;
$('tap-hint-x').onclick = () => { tapHintDismissed = true; $('tap-hint').classList.add('hidden'); };
addEventListener('keydown', e => {
  if (e.key === 'ArrowRight') goTo(cur + 1);
  if (e.key === 'ArrowLeft') goTo(cur - 1, { animate: false });
});

// tap a part to identify it: the part lights up and an info card shows its
// name, kit quantity, and download links (tap empty space to dismiss).
// Suppressed when the pointer dragged (= orbiting).
const ray = new THREE.Raycaster();
let downXY = null, selectedId = null;
const highlightMats = {}, altHighlightMats = {}; // type -> emissive clone (base / lightened tile)
function materialFor(inst, highlighted) {
  const type = typeByNode[inst.cfg.node];
  const base = inst.alt ? altMatFor(type) : (materials[type] || fallbackMat);
  if (!highlighted) return base;
  const cache = inst.alt ? altHighlightMats : highlightMats;
  if (!cache[type]) {
    const m = base.clone();
    m.emissive = new THREE.Color(0xff8a40);
    m.emissiveIntensity = 0.4;
    cache[type] = m;
  }
  return cache[type];
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
function slideDrawer(carrier, open) {
  const group = [carrier, ...[...instances.values()].filter(x => x.cfg.rides === carrier.cfg.id)];
  for (const i of group) {
    const to = basePos(i, i.staged);
    if (open) to.z += 40;
    const fromV = i.group.position.clone();
    tween({ duration: 320, onUpdate: k => i.group.position.lerpVectors(fromV, to, k) });
  }
}

let selAnchor = new THREE.Vector3(); // selected part's bbox-center offset from its origin
function setSelected(id) {
  if (selectedId === id) return;
  if (selectedId && instances.has(selectedId)) {
    const prev = instances.get(selectedId);
    prev.group.traverse(o => { if (o.isMesh) o.material = materialFor(prev, false); });
  }
  if (openCarrier) { slideDrawer(openCarrier, false); openCarrier = null; }
  selectedId = id;
  $('filament-menu').classList.add('hidden');
  const card = $('identify-card');
  if (!id) { card.classList.add('hidden'); $('pointer-line').classList.add('hidden'); return; }
  if (isMobile()) setChecklist(false); // mobile: parts list & identify sheet are mutually exclusive
  const inst = instances.get(id);
  inst.group.traverse(o => { if (o.isMesh) o.material = materialFor(inst, true); });
  selAnchor = new THREE.Box3().setFromObject(inst.group).getCenter(new THREE.Vector3()).sub(inst.group.position);
  const info = partInfoByNode[inst.cfg.node] || { label: inst.cfg.node, qty: '?' };
  const selType = typeByNode[inst.cfg.node];
  $('identify-swatch').style.background = activeHex(selType);
  $('identify-name').textContent = info.label;
  $('identify-qty').textContent = `×${info.qty} in this kit` +
    (customColors[selType] ? ` · ${customColors[selType].name}` : '');
  const img = $('identify-img');
  if (info.img) { img.src = info.img; img.classList.remove('hidden'); }
  else img.classList.add('hidden');
  const linksEl = $('identify-links');
  linksEl.innerHTML = '';
  if (info.links?.p) linksEl.appendChild(linkEl('Printables', info.links.p));
  if (info.links?.t) linksEl.appendChild(linkEl('Thangs', info.links.t));
  if (customColors[selType]) linksEl.appendChild(linkEl('Get filament', customColors[selType].url));
  // handles get a style switcher (Deco / BlockBar A–F)
  if (typeByNode[inst.cfg.node] === 'Handle') {
    const idx = currentHandleStyleIndex();
    $('style-name').textContent = idx >= 0 ? HANDLE_STYLES[idx].label : '?';
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
  // drawer-open interaction: only when the drawer is seated in its final spot
  const carrier = drawerCarrier(inst);
  if (carrier && !carrier.staged && carrier.group.visible &&
      carrier.group.position.distanceTo(basePos(carrier, false)) < 0.01) {
    slideDrawer(carrier, true);
    openCarrier = carrier;
  }
}
// ---------- filament colors ----------
// Real Panchroma™ Basic PLA 1.75mm/1kg variants (names + Shopify variant ids
// pulled from shop.polymaker.com 2026-07-05; hexes approximated — refine
// against the spool renders anytime). Swap the urls for affiliate versions
// when Joey's Polymaker affiliate links exist. The Elegoo entry is Joey's
// budget pick (amzn.to IS an affiliate link) — mainly cases & drawer bodies.
const PM = id => `https://shop.polymaker.com/products/panchroma-pla?variant=${id}`;
const POLYMAKER_URL = PM(44863271895097);
const FILAMENTS = [
  { name: 'Elegoo PETG Black', label: 'Elegoo PETG Black', hex: '#232427', url: 'https://amzn.to/3QWCdV6', pick: true },
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
].map(f => ({ ...f, label: f.label || `Panchroma ${f.name}`, url: f.url || PM(f.id) }));

// ---------- filament presets ----------
// One click sets a filament per part TYPE. Colors/links are PLACEHOLDERS for now
// (swap for real Panchroma/Prusa variants + affiliate links later). L/R mirror
// pairs are single types, so setting e.g. QuickLock covers both.
const _f = (name, hex, url = '#') => ({ name, hex, url });
const _blk = _f('Black', '#232427'), _pro = _f('Prusa Orange', '#f5820a'),
      _proP = _f('Prusa Orange PETG', '#f5820a'), _sil = _f('Silver', '#c7ccd2');
const PRESETS = [
  { name: 'The Jerrari', swatches: ['#232427', '#f5820a', '#c7ccd2'], colors: {
    Case: _blk, Drawer: _blk, CoverL: _blk, CoverU: _blk, Bracket: _blk,
    FootrailL: _blk, FootrailU: _blk, Foot: _blk,
    Faceplate: _pro, Handle: _sil,
    QuickLock: _proP, MagnetClip: _proP, Stopper: _proP, Magnet: _sil, Screw: _sil,
  } },
  { name: 'Stealth', swatches: ['#232427', '#4a4c51', '#6e7178'], colors: {
    Case: _blk, Drawer: _f('Dark Grey', '#4a4c51'), CoverL: _blk, CoverU: _blk,
    Bracket: _blk, FootrailL: _blk, FootrailU: _blk, Foot: _blk,
    Faceplate: _f('Steel Grey', '#6e7178'), Handle: _sil,
    QuickLock: _f('Dark Grey', '#4a4c51'), MagnetClip: _f('Dark Grey', '#4a4c51'),
    Stopper: _f('Dark Grey', '#4a4c51'), Magnet: _sil, Screw: _sil,
  } },
  { name: 'Signal', swatches: ['#232427', '#d23a2e', '#00a5a5'], colors: {
    Case: _blk, Drawer: _f('Red', '#d23a2e'),
    CoverL: _f('Green', '#3f9b4f'), CoverU: _f('Lime Green', '#9ccb3b'),
    FootrailL: _f('Blue', '#2f6fbe'), FootrailU: _f('Aqua Blue', '#5cc6e0'), Foot: _f('Purple', '#7a4fb0'),
    Bracket: _f('Steel Grey', '#6e7178'), Faceplate: _pro, Handle: _f('Yellow', '#f5c542'),
    QuickLock: _f('Polymaker Teal', '#00a5a5'), MagnetClip: _f('Brown', '#7a5236'),
    Stopper: _f('Magenta', '#d4308f'), Magnet: _sil, Screw: _sil,
  } },
  { name: 'Sandstone', swatches: ['#7a5236', '#c8a97e', '#f1e7cf'], colors: {
    Case: _f('Brown', '#7a5236'), Drawer: _f('Tan', '#c8a97e'),
    CoverL: _f('Beige', '#ddc9a3'), CoverU: _f('Cream', '#f1e7cf'),
    Bracket: _f('Brown', '#7a5236'), FootrailL: _f('Brown', '#7a5236'), FootrailU: _f('Tan', '#c8a97e'), Foot: _f('Brown', '#7a5236'),
    Faceplate: _pro, Handle: _f('Steel Grey', '#6e7178'),
    QuickLock: _f('Tan', '#c8a97e'), MagnetClip: _f('Brown', '#7a5236'),
    Stopper: _f('Tan', '#c8a97e'), Magnet: _sil, Screw: _sil,
  } },
];

const COLOR_STORE_KEY = 'gen2-colors:' + (BUILD_HASH ? 'custom-build' : KIT);
let customColors = {}, useCustom = false; // customColors: type -> {name, hex, url}
try {
  const saved = JSON.parse(localStorage.getItem(COLOR_STORE_KEY) || 'null');
  if (saved) { customColors = saved.colors || {}; useCustom = !!saved.on; }
} catch (e) { /* corrupt storage — start fresh */ }
const saveColors = () => localStorage.setItem(COLOR_STORE_KEY, JSON.stringify({ colors: customColors, on: useCustom }));
const activeHex = type => (useCustom && customColors[type]) ? customColors[type].hex : (manifest.colors[type] || '#b9bcc2');

function applyPalette() {
  for (const [type, mat] of Object.entries(materials)) mat.color.set(activeHex(type));
  for (const [type, mat] of Object.entries(highlightMats)) mat.color.set(activeHex(type));
  // lightened alternate-tile variants track the active palette too
  for (const [type, mat] of Object.entries(altMaterials)) mat.color.set(activeHex(type)).lerp(new THREE.Color('#ffffff'), ALT_LIGHTEN);
  for (const [type, mat] of Object.entries(altHighlightMats)) mat.color.set(activeHex(type)).lerp(new THREE.Color('#ffffff'), ALT_LIGHTEN);
  renderChecklist();
  updateColorToggle();
  if (selectedId) {
    const type = typeByNode[instances.get(selectedId).cfg.node];
    $('identify-swatch').style.background = activeHex(type);
  }
}
function updateColorToggle() {
  const btn = $('color-toggle');
  const any = Object.keys(customColors).length > 0;
  const onContentPage = !PAGES[cur]?.cover && !PAGES[cur]?.outro;
  btn.classList.toggle('hidden', !any || !onContentPage);
  btn.textContent = useCustom ? '🎨 My colors' : '🎨 Instruction colors';
}
$('color-toggle').onclick = () => { useCustom = !useCustom; saveColors(); applyPalette(); };

// preset picker: apply a whole per-type filament set at once, and save/load them
function applyPreset(p) {
  customColors = {};
  for (const [type, f] of Object.entries(p.colors)) customColors[type] = { ...f };
  useCustom = true;
  saveColors();
  applyPalette();
  renderPresets();
}
function renderPresets() {
  const box = $('preset-chips');
  box.innerHTML = '';
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.className = 'preset-chip';
    b.title = `Apply the "${p.name}" filament preset`;
    b.innerHTML = `<span class="preset-sw">${p.swatches.map(h => `<i style="background:${h}"></i>`).join('')}</span>${p.name}`;
    b.onclick = () => applyPreset(p);
    box.appendChild(b);
  }
}
function savePreset() {
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
        customColors = d.colors; useCustom = true; saveColors(); applyPalette(); renderPresets();
      }
    } catch (e) { /* ignore a bad file */ }
  };
  r.readAsText(file);
}
$('preset-save').onclick = savePreset;
$('preset-load').onclick = () => $('preset-file').click();
$('preset-file').onchange = e => { if (e.target.files[0]) loadPresetFile(e.target.files[0]); e.target.value = ''; };
renderPresets();

let fmType = null; // the part type the filament menu is editing
function openFilamentMenu(type) {
  fmType = type;
  const grid = $('fm-grid');
  grid.innerHTML = '';
  for (const f of FILAMENTS) {
    const b = document.createElement('button');
    b.style.background = f.hex;
    b.title = f.label + (f.pick ? ' — Joey’s budget pick for cases & drawer bodies' : '');
    if (f.pick) b.classList.add('pick');
    if (customColors[type]?.name === f.label) b.classList.add('active');
    b.onclick = () => {
      customColors[type] = { name: f.label, hex: f.hex, url: f.url };
      useCustom = true;
      saveColors();
      applyPalette();
      [...grid.children].forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      const buy = $('fm-buy');
      buy.href = f.url;
      buy.textContent = `Buy ${f.name} →`;
    };
    grid.appendChild(b);
  }
  const buy = $('fm-buy');
  const sel = customColors[type];
  buy.href = sel ? sel.url : POLYMAKER_URL;
  buy.textContent = sel ? `Buy ${sel.name.replace('Panchroma ', '')} →` : 'Shop Panchroma PLA →';
  $('filament-menu').classList.remove('hidden');
}
$('identify-swatch').onclick = () => {
  if (!selectedId) return;
  const type = typeByNode[instances.get(selectedId).cfg.node];
  if ($('filament-menu').classList.contains('hidden')) openFilamentMenu(type);
  else $('filament-menu').classList.add('hidden');
};
$('fm-reset').onclick = () => {
  if (fmType) delete customColors[fmType];
  if (!Object.keys(customColors).length) useCustom = false;
  saveColors();
  applyPalette();
  $('filament-menu').classList.add('hidden');
};

// ---------- handle style swap ----------
// Every handle style mounts the same way: back face against the faceplate
// front (z 97.57), vertically centered on the plate — so swapping is just a
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
];
const HANDLE_LINKS = {
  deco:     { p: 'https://www.printables.com/model/1044972-gen2-decor-handles-deco-series', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20Handles%20-%20Deco%20Series-1159960' },
  blockbar: { p: 'https://www.printables.com/model/965604-gen2-decor-handles-blockbar-series', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20-%20Handles%20-%20BlockBar-1116949' },
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
  activeHandleStyle = style;
  if (build) build.handleStyle = style.planner; // keep the build in sync (regenerate/BOM/reset read this)
  if (!templates[style.node]) {
    const gltf = await loader.loadAsync(`${PARTS_BASE}${style.node}.lib.glb`);
    const mat = materials.Handle || fallbackMat;
    gltf.scene.traverse(o => { if (o.isMesh) o.material = mat; });
    templates[style.node] = gltf.scene;
  }
  let oldNode = null;
  for (const inst of instances.values()) {
    if (typeByNode[inst.cfg.node] !== 'Handle') continue;
    oldNode = oldNode || inst.cfg.node;
    const off = inst.group.position.clone().sub(basePos(inst, inst.staged)); // keep open/exploded offsets
    const fp = [...instances.values()].find(x => x.cfg.rides && x.cfg.rides === inst.cfg.rides && typeByNode[x.cfg.node] === 'Faceplate');
    if (fp) {
      const fpH = faceplateHeightOf(fp.cfg.node);
      inst.cfg.pos = [inst.cfg.pos[0], fp.cfg.pos[1] + (fpH - style.h) / 2 - 0.5, 97.57 + style.d / 2];
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
  const next = HANDLE_STYLES[(idx + dir + HANDLE_STYLES.length) % HANDLE_STYLES.length];
  await applyHandleStyle(next);
  $('style-name').textContent = next.label;
  if (!selectedId) return;
  const inst = instances.get(selectedId);
  if (typeByNode[inst.cfg.node] !== 'Handle') return;
  inst.group.traverse(o => { if (o.isMesh) o.material = materialFor(inst, true); });
  selAnchor = new THREE.Box3().setFromObject(inst.group).getCenter(new THREE.Vector3()).sub(inst.group.position);
  const info = partInfoByNode[inst.cfg.node] || { label: next.label };
  $('identify-name').textContent = info.label;
  const linksEl = $('identify-links');
  linksEl.innerHTML = '';
  if (info.links?.p) linksEl.appendChild(linkEl('Printables', info.links.p));
  if (info.links?.t) linksEl.appendChild(linkEl('Thangs', info.links.t));
}
$('style-prev').onclick = () => cycleHandleStyle(-1);
$('style-next').onclick = () => cycleHandleStyle(1);
// remove the selected optional part (magnet closure for its drawer, or a 1W
// stopper pair), then regenerate + update the BOM
$('identify-remove').onclick = async () => {
  const inst = selectedId && instances.get(selectedId);
  if (!inst || !build) return;
  const type = typeByNode[inst.cfg.node];
  if (type === 'Stopper' && inst.cfg.stopperKey) {
    build.removedStoppers = [...new Set([...(build.removedStoppers || []), inst.cfg.stopperKey])];
  } else if ((type === 'MagnetClip' || type === 'Magnet') && inst.cfg.owner != null) {
    const d = build.placed.find(u => u.id === inst.cfg.owner);
    if (d) d.closure = 'none'; else return;
  } else return;
  setSelected(null);
  await regenerate();
};

canvas.addEventListener('pointerdown', e => { downXY = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', e => {
  if (!downXY || Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 6) return;
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(
    ((e.clientX - r.left) / r.width) * 2 - 1,
    -((e.clientY - r.top) / r.height) * 2 + 1
  ), camera);
  const hits = ray.intersectObjects([...instances.values()].filter(i => i.group.visible).map(i => i.group), true);
  if (!hits.length) { setSelected(null); return; }
  let o = hits[0].object;
  while (o && !o.userData.instanceId) o = o.parent;
  setSelected(o ? o.userData.instanceId : null);
});

// ---------- outro party dressing ----------
// The finale gets stage treatment: the room dims to night, an HDR-style
// emissive "party room" environment (PMREM, no .hdr file — offline-safe)
// puts colored reflections on the plastic, two hue-drifting party lights
// circle the build, and confetti poppers fire on scene cuts. Everything
// mounts in startCinema and unmounts in stopCinema — instruction pages
// never see any of it.
const party = {
  fade: 0, cuts: 0,
  env: null, rig: null, spots: [],
  bgDay: scene.background.clone(), bgNight: new THREE.Color(0x14171e),
  tableDay: table.material.color.clone(), tableNight: new THREE.Color(0x252a32),
};
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
const CINEMA_MODES = [0, 1, 2, 3, 4, 5, 5]; // macro gets a double share
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
  scene.environment = partyEnv();
  scene.environmentIntensity = 0; // ramps in with the fade
  scene.add(partyRig());
  sun.color.set(0xffe0b3); // warm golden sun for the finale
  grid.visible = false;
  wall.visible = false;    // clean cinema stage, even for wall builds
  surface.visible = false; // …and under-table builds
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
  scene.environment = null;
  scene.environmentIntensity = 1;
  scene.remove(party.rig);
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
  // a cut mid-drawer-glide must not orphan the drawer open
  if (cinema.drawer) {
    for (const m of cinema.drawer.members) m.group.position.copy(basePos(m, false));
    cinema.drawer = null;
  }
  cinema.cut = 0;
  const mode = cinema.mode = CINEMA_MODES[Math.floor(Math.random() * CINEMA_MODES.length)];
  cinema.az = Math.random() * Math.PI * 2;
  cinema.azV = (0.05 + Math.random() * 0.09) * (Math.random() < 0.5 ? -1 : 1);
  cinema.pol = [1.25, 0.8, 1.05, 1.18, 1.0, 1.3][mode] + (Math.random() - 0.5) * 0.15;
  cinema.r = cinema.size * [1.5, 2.7, 2.1, 1.6, 2.4, 2.2][mode]; // macro sits far back — the long lens does the closing in
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
  cinema.drawerAt = (mode === 0 || mode === 1 || mode === 3 || mode === 5) ? 1 + Math.random() * 3 : Infinity;
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
      const carrier = drawers[Math.floor(Math.random() * drawers.length)];
      const travel = (parseInt(manifest.collection, 10) || 185) - 20; // full pull ≈ case depth − rear engagement
      const frac = 0.3 + Math.random() * 0.65;                       // 30%..95% open
      cinema.drawer = {
        members: [carrier, ...[...instances.values()].filter(x => x.cfg.rides === carrier.cfg.id)],
        t: 0,
        span: travel * frac,
        tOpen: 0.6 + frac * 0.9 + Math.random() * 0.6,
        tHold: 0.4 + Math.random() * 2.0,
        tClose: 0.6 + frac * 0.9 + Math.random() * 0.8,
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
    if (d.t >= d.tOpen + d.tHold + d.tClose) cinema.drawer = null;
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
    table.material.color.lerpColors(party.tableDay, party.tableNight, f);
    hemi.intensity = 1.1 - 0.75 * f;
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
  const p = inst.group.position.clone().add(selAnchor).project(camera);
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
  return { closures, removedStoppers: build.removedStoppers || [], wallStagger: !!build.wallStagger, handleStyle: build.handleStyle };
}
let syncBuildToPlanner = () => {
  if (applyingRemote || !build || !window.opener) return;
  try { window.opener.postMessage({ gen2: 'buildOptions', opts: currentOpts() }, '*'); } catch (e) { /* cross-origin opener gone */ }
};
addEventListener('message', async (e) => {
  const d = e.data;
  if (!d || d.gen2 !== 'buildOptions' || !d.opts || !build || regenBusy) return;
  const o = d.opts;
  // ignore a message that matches our current state — this is what breaks the
  // planner↔viewer echo loop (an applied change bounces back identical → dropped)
  let changed = false;
  if (o.closures) for (const u of build.placed) if (o.closures[u.id] && (o.closures[u.id] === 'magnet') !== (u.closure === 'magnet')) changed = true;
  if (Array.isArray(o.removedStoppers) && [...o.removedStoppers].sort().join(',') !== [...(build.removedStoppers || [])].sort().join(',')) changed = true;
  if (typeof o.wallStagger === 'boolean' && o.wallStagger !== !!build.wallStagger) changed = true;
  if (o.handleStyle && o.handleStyle !== build.handleStyle) changed = true;
  if (!changed) return;
  applyingRemote = true;
  try {
    if (o.closures) for (const u of build.placed) if (o.closures[u.id]) u.closure = o.closures[u.id];
    if (Array.isArray(o.removedStoppers)) build.removedStoppers = o.removedStoppers;
    if (typeof o.wallStagger === 'boolean') build.wallStagger = o.wallStagger;
    if (o.handleStyle) build.handleStyle = o.handleStyle;
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
  $('kit-title').textContent = m.title;
  document.title = m.title;
  typeByNode = Object.fromEntries(m.parts.map(p => [p.node, p.type]));
  partInfoByNode = Object.fromEntries(m.parts.map(p => [p.node, p]));
  ensureMaterials();
  await loadTemplates();
  buildInstances();
  computeBounds();
  if (isWallBuild) fitWall();
  if (isUnderTableBuild) fitSurface();
  buildAfterState();
  buildExploded();
  buildPages();
  renderChecklist();
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
  const keep = Math.min(cur, gen.manifest.steps.length); // step indices are stable (deterministic gen)
  await mountManifest(gen.manifest);
  applyPalette(); // re-tint any custom filament colors onto the fresh materials
  // the generator rebuilds handles as the planner-level default (blockbar → A);
  // re-apply the specific variant the user picked so it survives the regenerate
  if (activeHandleStyle && currentHandleStyleIndex() >= 0 &&
      instances.get([...instances.keys()].find(id => typeByNode[instances.get(id).cfg.node] === 'Handle'))?.cfg.node !== activeHandleStyle.node) {
    await applyHandleStyle(activeHandleStyle);
  }
  goTo(keep, { animate: false });
  regenBusy = false;
  syncBuildToPlanner(); // keep the opener planner tab in step (no-op if opened cold)
}

// ---------- boot ----------
const X_URL = 'https://x.com/jerrari3D';
if (X_URL) { const a = $('outro-x'); a.href = X_URL; a.classList.remove('hidden'); }
const YT_URL = 'https://www.youtube.com/@jerrari3D';
if (YT_URL) { const a = $('outro-yt'); a.href = YT_URL; a.classList.remove('hidden'); }
await mountManifest(manifest);
applyPalette(); // restore any saved filament colors
$('loading-overlay').remove();
goTo(0); // open on the cover

renderer.setAnimationLoop(now => {
  resize();
  stepTweens(now);
  if (cinema.on) updateCinema(now); else controls.update();
  // the wall is a backdrop, not part of the model — drop it out of the way when
  // the camera orbits behind it, so you can inspect the pegs/case backs freely.
  if (isWallBuild && !cinema.on) wall.visible = camera.position.z > wall.position.z;
  // same rule for the under-table surface: hide it when the camera rises above
  // its underside, so the rails/screw layout can be inspected from the top.
  if (isUnderTableBuild && !cinema.on) surface.visible = camera.position.y < surfaceUnderY;
  updatePointerLine();
  renderer.render(scene, camera);
});

// dev-only hook (mirrors the planner's guarded test-hook convention): ?debug=1
if (new URLSearchParams(location.search).get('debug')) {
  window.__GEN2_VIEWER__ = { THREE, scene, camera, controls, goTo, applyState, instances, manifest, cinema, updateCinema, cinemaScene, party, confetti, confettiPop,
    get build() { return build; }, regenerate, setSelected, get selectedId() { return selectedId; } };
}
