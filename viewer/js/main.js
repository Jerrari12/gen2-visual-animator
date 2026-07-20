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
// ?embed=1 — docked inside the planner's split view: slimmer chrome (no top
// bar, no BOM exports — the planner owns those), and a live "preview" landing
// (the finished build, orbitable/colorable) instead of the box-art cover; a
// "Begin the instructions" pill enters the normal page flow. The flag rides
// location.search, so the mount/length-change self-reload keeps it.
const IS_EMBED = new URLSearchParams(location.search).has('embed') && !!BUILD_HASH;
document.body.classList.toggle('embed', IS_EMBED);

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
    viewInsetPx = -1; // canvas size changed — re-apply the note-panel view inset with fresh dims
    // re-fit a whole-build shot to the new aspect (skip during the cinema, which
    // drives the camera itself, and during drawer/faceplate focus, which park
    // the camera on the part)
    if (curCamPreset?.fit && !cinema.on && !tweens.size && !camOverride && !dFocus.carrier && !fpFocus.id) {
      const { pos, target } = camPos(curCamPreset);
      camera.position.copy(pos); controls.target.copy(target); controls.update();
    }
  }
}
// Mobile: the step-note panel overlays the top of the canvas (long wall notes
// used to cover half the action — Joey). Pan the camera's PROJECTION down by
// half the covered height (setViewOffset — a pure pan, same aspect), so every
// framing (fit presets, the faceplate cinematic, isolation) centers itself in
// the visible band below the note. Projected labels (dims/pointer/measure) go
// through camera.project(), so they track the shift for free.
let viewInsetPx = 0;
function updateViewInset() {
  let inset = 0;
  if (isMobile() && !cinema.on) {
    const note = $('note-panel');
    if (note && !note.classList.contains('hidden') && !note.classList.contains('collapsed')) {
      const nb = note.getBoundingClientRect(), cb = canvas.getBoundingClientRect();
      inset = Math.max(0, Math.min(nb.bottom - cb.top, cb.height * 0.5));
    }
  }
  if (Math.abs(inset - viewInsetPx) < 1) return;
  viewInsetPx = inset;
  if (inset > 0) camera.setViewOffset(canvas.clientWidth, canvas.clientHeight, 0, -inset / 2, canvas.clientWidth, canvas.clientHeight);
  else camera.clearViewOffset();
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
    gen = { errors: ['This build link is damaged or truncated · try copying it again from the planner.'], manifest: null };
  }
  if (!gen.manifest) {
    const box = document.getElementById('loading-overlay');
    box.querySelector('.spinner')?.remove();
    document.getElementById('loading-text').innerHTML =
      '<strong>Can’t show this build yet</strong><br><br>' + gen.errors.map(e => '• ' + e).join('<br>');
    throw new Error('unsupported build: ' + gen.errors.join('; '));
  }
  manifest = gen.manifest;
  PARTS_BASE = 'parts/' + (manifest.collection || '185') + '/';   // one self-contained pool per collection (parts/165, parts/185)
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

// Materials are keyed by part TYPE ('Faceplate') or a ZONE of one
// ('Faceplate:GRIP'). Zones come from 2-zone GLBs (EdgeLabel body+grip): the
// exporter ships tiny NAMED material stubs whose name tags each primitive —
// the viewer replaces every material, the name is the only thing it reads.
const materials = {};
const fallbackMat = new THREE.MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.6 });
const zoneKey = (type, zone) => zone ? `${type}:${zone}` : type;
function ensureMaterials() { // one shared material per type/zone key (idempotent across re-mounts)
  for (const [key, hex] of Object.entries(manifest.colors))
    if (!materials[key]) materials[key] = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.55, metalness: 0.05 });
}
function baseMatFor(type, zone = '') { // shared material per (type, zone) — zones build lazily off the active palette
  const key = zoneKey(type, zone);
  if (!materials[key]) materials[key] = new THREE.MeshStandardMaterial({ color: new THREE.Color(activeHex(key)), roughness: 0.55, metalness: 0.05 });
  return materials[key];
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
  await Promise.all(need.map(async node => {
    const gltf = await loader.loadAsync(`${PARTS_BASE}${node}.lib.glb`);
    templates[node] = adoptTemplate(gltf.scene, typeByNode[node]);
  }));
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
    if (inst.group.children[0]) inst.group.children[0].position.set(0, 0, 0); // clear a stranded label lift (killed mid-tween)
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
  return { t: 0, p: 90, r: spread * 7.2, target: [c.x + size.x * 0.33, c.y, 0], fov: 9 };
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
      jobs.push(tween({
        duration: (DUR.enter + DUR.via * (e.via?.length || 0)) * pace, delay: ph.sync ? 0 : n * DUR.stagger * pace,
        onUpdate: k => {
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
  const r = preset.fitR ? fitDistanceFor(preset.fitR, preset.fov || 40)
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
async function resetBuild() { build = structuredClone(originalBuild); activeHandleStyle = null; activeFaceplateStyle = null; await regenerate(); }
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
    name.textContent = currentFaceplateStyle().label;
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
      async v => { build.backCover = v; await regenerate(); }));
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
    if (p.styleHidden) continue; // suppressed by the active faceplate style (handles under EdgeLabel)
    if (!p.purchased) total += p.qty; // purchased hardware isn't a print
    const row = document.createElement('div');
    row.className = 'checklist-row';
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.style.background = activeHex(p.type); // reflects custom filament colors
    if (colorLocked(p.type)) { // purchased hardware: no filament picker
      chip.classList.add('locked');
      chip.title = 'Hardware-store item · shown in its real finish';
    } else {
      chip.title = (useCustom && customColors[p.type] ? customColors[p.type].name + ' · ' : '') + 'click to pick a filament color';
      chip.onclick = () => openFilamentMenu(p.type);
    }
    const mid = document.createElement('div');
    mid.className = 'cl-mid';
    const label = document.createElement('span');
    label.textContent = p.label;
    mid.appendChild(label);
    if (p.links) {
      const lnks = document.createElement('span');
      if (p.links.p) lnks.appendChild(linkEl('Printables', p.links.p));
      if (p.links.t) lnks.appendChild(linkEl('Thangs', p.links.t));
      // purchased hardware: Amazon affiliate buy options (generate.js BUY)
      for (const b of p.links.buy || []) lnks.appendChild(linkEl(b.label, b.url));
      mid.appendChild(lnks);
    }
    const qty = document.createElement('span');
    qty.className = 'qty';
    qty.textContent = '×' + p.qty + (p.purchased ? ' · buy' : '');
    row.append(chip, mid, qty);
    rows.appendChild(row);
  }
  // Amazon buy chips are affiliate links → the panel carries the disclosure
  // (same wording as the filament menu's)
  if (manifest.parts.some(p => !p.styleHidden && p.links?.buy)) {
    const aff = document.createElement('div');
    aff.className = 'fm-note';
    aff.textContent = 'Amazon links are affiliate links — buying through them supports the project at no extra cost.';
    rows.appendChild(aff);
  }
  $('checklist-title').textContent = build ? 'Your build' : 'Parts list';
  $('parts-head').textContent = `🧩 Parts to print · ${total} print${total === 1 ? '' : 's'}`;
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
  setMeasure(false); // parts move between steps — a measurement would go stale
  fpEnv.target = 1;  // a step-scripted `room: 0` (faceplate cinematic) must not outlive its page
  $('filament-menu').classList.add('hidden');
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
$('btn-replay').onclick = () => goTo(cur);
// collapse the step text to its number badge (session-sticky across steps) —
// reclaims the canvas while recoloring/inspecting on small screens
$('note-collapse').onclick = () => {
  const collapsed = $('note-panel').classList.toggle('collapsed');
  // expanded shows ✕ ("put this text away"), collapsed shows ▸ ("bring it back")
  $('note-collapse').innerHTML = collapsed ? '&#9656;' : '&#10005;';
  $('note-collapse').title = collapsed ? 'Show the step text' : 'Collapse the step text';
};
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
// customizers' shortcut: straight to the finished build (final assembly step —
// dims + expanded BOM), skipping the step-by-step. Snap, don't replay the step.
$('btn-skip-end').onclick = () => goTo(PAGES.length - 2, { animate: false });
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
  const chip = (label, key) => {
    const b = document.createElement('button');
    b.className = 'zone-chip';
    const dot = document.createElement('i');
    dot.style.background = activeHex(key);
    b.appendChild(dot);
    b.appendChild(document.createTextNode(label));
    b.title = `Pick a filament color for the ${label.toLowerCase()}`;
    b.onclick = () => { openFilamentMenu(key); };
    box.appendChild(b);
  };
  chip('Body', type);
  for (const z of [...zones].sort()) chip(z.charAt(0) + z.slice(1).toLowerCase(), zoneKey(type, z));
}

let selAnchor = new THREE.Vector3(); // selected part's bbox-center offset from its origin
function setSelected(id) {
  if (selectedId === id) return;
  if (selectedId && instances.has(selectedId)) {
    const prev = instances.get(selectedId);
    prev.group.traverse(o => { if (o.isMesh) o.material = materialFor(prev, false, o.userData.zone); });
  }
  const prevOpen = openCarrier; openCarrier = null; // may re-pull the SAME drawer further below
  selectedId = id;
  $('filament-menu').classList.add('hidden');
  const card = $('identify-card');
  if (ritualInst && (!id || !instances.has(id) || instances.get(id) !== ritualInst)) {
    slideRitual(ritualInst, false); // label/accent/cover reseats in reverse on deselect/switch
    ritualInst = null;
  }
  if (!id) { if (prevOpen) slideDrawer(prevOpen, false); exitFaceplateFocus(); exitDrawerFocus(); card.classList.add('hidden'); $('pointer-line').classList.add('hidden'); return; }
  if (isMobile() || IS_EMBED) setChecklist(false); // mobile + narrow dock: parts list & identify card are mutually exclusive
  const inst = instances.get(id);
  inst.group.traverse(o => { if (o.isMesh) o.material = materialFor(inst, true, o.userData.zone); });
  selAnchor = new THREE.Box3().setFromObject(inst.group).getCenter(new THREE.Vector3()).sub(inst.group.position);
  const info = partInfoByNode[inst.cfg.node] || { label: inst.cfg.node, qty: '?' };
  const selType = typeByNode[inst.cfg.node];
  const selLocked = colorLocked(selType); // purchased hardware: swatch is a plain color dot, not a picker
  const sw = $('identify-swatch');
  sw.style.background = activeHex(selType);
  sw.classList.toggle('locked', selLocked);
  sw.title = selLocked ? 'Hardware-store item · shown in its real finish' : 'Pick a filament color';
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
  const linksEl = $('identify-links');
  linksEl.innerHTML = '';
  if (info.links?.p) linksEl.appendChild(linkEl('Printables', info.links.p));
  if (info.links?.t) linksEl.appendChild(linkEl('Thangs', info.links.t));
  // purchased hardware: Amazon affiliate buy options (generate.js BUY) + the
  // required affiliate disclosure right in the card
  for (const b of info.links?.buy || []) linksEl.appendChild(linkEl(b.label, b.url));
  if (info.links?.buy?.length) {
    const aff = document.createElement('div');
    aff.className = 'fm-note';
    aff.textContent = 'Affiliate links — they support the project at no extra cost.';
    linksEl.appendChild(aff);
  }
  if (!selLocked && customColors[selType]) linksEl.appendChild(linkEl('Get filament', customColors[selType].url));
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
  dFocus.group.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x656a73, transparent: true, opacity: 0.9 })));
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
// refine against the spool renders anytime). Swap urls for affiliate versions
// when Joey's Polymaker affiliate links exist. The Elegoo entry is Joey's
// budget pick (amzn.to IS an affiliate link) — mainly cases & drawer bodies.
const PM = id => `https://shop.polymaker.com/products/panchroma-pla?variant=${id}`;
const POLYMAKER_URL = PM(44863271895097);
const FILAMENT_DB = [
  { brand: 'Elegoo', line: 'PETG', url: 'https://amzn.to/3QWCdV6', colors: [
    { name: 'PETG Black', label: 'Elegoo PETG Black', hex: '#232427', url: 'https://amzn.to/3QWCdV6', pick: true },
  ] },
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
];

// ---------- filament presets ----------
// One click sets a filament per part TYPE. Colors/links are PLACEHOLDERS for now
// (swap for real Panchroma/Prusa variants + affiliate links later). L/R mirror
// pairs are single types, so setting e.g. QuickLock covers both.
const _f = (name, hex, url = '#') => ({ name, hex, url });
const _blk = _f('Black', '#232427'), _pro = _f('Prusa Orange', '#f5820a'),
      _proP = _f('Prusa Orange PETG', '#f5820a'), _sil = _f('Silver', '#c7ccd2'),
      _wht = _f('White', '#eef0f4'), _navy = _f('Holo Blue', '#25316e');
// Every preset themes the WHOLE build (Joey 2026-07-13): faceplate zones
// ('Faceplate:GRIP' drives the EdgeLabel/Classic Pro printed-in grip,
// ':GRIP ACCENT' the Classic Pro rod) + the dressing (Accent/Label/BackCover)
// + Rail. L/U pairs (covers, footrails) share ONE color per preset — the
// two-tone look belongs to the instruction palette only (see applyPalette's
// alt-shade gate).
const PRESETS = [
  { name: 'The Jerrari', swatches: ['#232427', '#f5820a', '#c7ccd2'], colors: {
    Case: _blk, Drawer: _blk, CoverL: _blk, CoverU: _blk, Bracket: _blk,
    FootrailL: _blk, FootrailU: _blk, Foot: _blk, Rail: _blk,
    Faceplate: _blk, 'Faceplate:GRIP': _pro, 'Faceplate:GRIP ACCENT': _sil,
    Accent: _navy, Label: _wht, BackCover: _blk,
    Handle: _sil,
    QuickLock: _proP, MagnetClip: _proP, Stopper: _proP, Magnet: _sil, Screw: _sil,
  } },
  { name: 'Stealth', swatches: ['#232427', '#4a4c51', '#6e7178'], colors: {
    Case: _blk, Drawer: _f('Dark Grey', '#4a4c51'), CoverL: _blk, CoverU: _blk,
    Bracket: _blk, FootrailL: _blk, FootrailU: _blk, Foot: _blk, Rail: _blk,
    Faceplate: _f('Steel Grey', '#6e7178'), 'Faceplate:GRIP': _f('Dark Grey', '#4a4c51'), 'Faceplate:GRIP ACCENT': _sil,
    Accent: _blk, Label: _wht, BackCover: _blk,
    Handle: _sil,
    QuickLock: _f('Dark Grey', '#4a4c51'), MagnetClip: _f('Dark Grey', '#4a4c51'),
    Stopper: _f('Dark Grey', '#4a4c51'), Magnet: _sil, Screw: _sil,
  } },
  { name: 'Signal', swatches: ['#232427', '#d23a2e', '#00a5a5'], colors: {
    Case: _blk, Drawer: _f('Red', '#d23a2e'),
    CoverL: _f('Green', '#3f9b4f'), CoverU: _f('Green', '#3f9b4f'),
    FootrailL: _f('Blue', '#2f6fbe'), FootrailU: _f('Blue', '#2f6fbe'), Foot: _f('Purple', '#7a4fb0'), Rail: _f('Blue', '#2f6fbe'),
    Bracket: _f('Steel Grey', '#6e7178'),
    Faceplate: _pro, 'Faceplate:GRIP': _f('Yellow', '#f5c542'), 'Faceplate:GRIP ACCENT': _f('Polymaker Teal', '#00a5a5'),
    Accent: _f('Aqua Blue', '#5cc6e0'), Label: _wht, BackCover: _f('Steel Grey', '#6e7178'),
    Handle: _f('Yellow', '#f5c542'),
    QuickLock: _f('Polymaker Teal', '#00a5a5'), MagnetClip: _f('Brown', '#7a5236'),
    Stopper: _f('Magenta', '#d4308f'), Magnet: _sil, Screw: _sil,
  } },
  { name: 'Sandstone', swatches: ['#7a5236', '#c8a97e', '#f1e7cf'], colors: {
    Case: _f('Brown', '#7a5236'), Drawer: _f('Tan', '#c8a97e'),
    CoverL: _f('Cream', '#f1e7cf'), CoverU: _f('Cream', '#f1e7cf'),
    Bracket: _f('Brown', '#7a5236'), FootrailL: _f('Brown', '#7a5236'), FootrailU: _f('Brown', '#7a5236'), Foot: _f('Brown', '#7a5236'), Rail: _f('Brown', '#7a5236'),
    Faceplate: _pro, 'Faceplate:GRIP': _f('Brown', '#7a5236'), 'Faceplate:GRIP ACCENT': _f('Steel Grey', '#6e7178'),
    Accent: _f('Tan', '#c8a97e'), Label: _f('Cream', '#f1e7cf'), BackCover: _f('Brown', '#7a5236'),
    Handle: _f('Steel Grey', '#6e7178'),
    QuickLock: _f('Tan', '#c8a97e'), MagnetClip: _f('Brown', '#7a5236'),
    Stopper: _f('Tan', '#c8a97e'), Magnet: _sil, Screw: _sil,
  } },
];

const COLOR_STORE_KEY = 'gen2-colors:' + (BUILD_HASH ? 'custom-build' : KIT);
let customColors = {}, useCustom = false; // customColors: type -> {name, hex, url}
// userPalette = the last palette the user built BY HAND (individual swatch
// picks / per-type resets / file upload). Hand edits mirror the whole working
// state into it; presets never touch it — so one preset click can't destroy
// hours of picking. A "★ My palette" chip (renderPresets) restores it.
let userPalette = {};
let colorsT = 0; // stamp of the last palette save — newest-wins when the planner relays palettes between viewer contexts
try {
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
const activeHex = key => {
  if (useCustom && customColors[key] && !colorLocked(key)) return customColors[key].hex;
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
    $('identify-swatch').style.background = activeHex(typeByNode[inst.cfg.node]);
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
$('color-toggle').onclick = () => { useCustom = !useCustom; saveColors(); applyPalette(); };

// preset picker: apply a whole per-type filament set at once, and save/load
// them. Presets only replace the WORKING palette (customColors) — the user's
// hand-built palette survives in userPalette and comes back via its chip.
function applyPreset(p) {
  customColors = {};
  for (const [type, f] of Object.entries(p.colors)) customColors[type] = { ...f };
  useCustom = true;
  saveColors();
  applyPalette();
}
function restoreUserPalette() {
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

let fmType = null;     // the part type the filament menu is editing
let fmQuery = '';      // live search filter (cleared on every open)
let fmExpanded = null; // Set of expanded brand names (null → first render expands all)
function renderFilamentBrands() {
  if (!fmExpanded) fmExpanded = new Set(FILAMENT_DB.map(b => b.brand)); // session default: everything visible
  const box = $('fm-brands');
  box.innerHTML = '';
  const q = fmQuery.trim().toLowerCase();
  for (const brand of FILAMENT_DB) {
    const colors = q
      ? brand.colors.filter(f => `${brand.brand} ${brand.line} ${f.label}`.toLowerCase().includes(q))
      : brand.colors;
    if (q && !colors.length) continue;                    // searching: hide brands with no hits
    const open = q ? true : fmExpanded.has(brand.brand);  // searching force-opens the matches
    const sec = document.createElement('div');
    sec.className = 'fm-brand';
    const head = document.createElement('button');
    head.className = 'fm-brand-head';
    head.innerHTML = `<span>${brand.brand} <i>${brand.line} · ${colors.length}</i></span><span class="fm-chev">${open ? '▾' : '▸'}</span>`;
    head.onclick = () => { fmExpanded[fmExpanded.has(brand.brand) ? 'delete' : 'add'](brand.brand); renderFilamentBrands(); };
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
          customColors[fmType] = { name: f.label, hex: f.hex, url: f.url };
          useCustom = true;
          snapshotUserPalette(); // a hand pick — this IS the user's palette now
          saveColors();
          applyPalette();
          renderFilamentBrands(); // refresh the active ring across sections
          const buy = $('fm-buy');
          buy.href = f.url;
          buy.textContent = `Buy ${f.name} →`;
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
function openFilamentMenu(type) {
  fmType = type;
  fmQuery = '';
  $('fm-search').value = '';
  renderFilamentBrands();
  const buy = $('fm-buy');
  const sel = customColors[type];
  buy.href = sel ? sel.url : FILAMENT_DB[0].url;
  buy.textContent = sel ? `Buy ${sel.name.replace('Panchroma ', '')} →` : 'Shop filament →';
  $('filament-menu').classList.remove('hidden');
  refreshSelHighlight(); // color mode: drop the emissive glow so picks read true
}
// The selection highlight is an emissive orange — it SKEWS the very color the
// user is trying to judge (a blue pick reads pink). While the filament menu is
// open the selected part renders in its plain material; the identify card +
// pointer line still mark it. Glow returns the moment the menu closes.
function refreshSelHighlight() {
  if (!selectedId || !instances.has(selectedId)) return;
  const inst = instances.get(selectedId);
  const glow = $('filament-menu').classList.contains('hidden');
  inst.group.traverse(o => { if (o.isMesh) o.material = materialFor(inst, glow, o.userData.zone); });
}
$('fm-search').oninput = e => { fmQuery = e.target.value; renderFilamentBrands(); };
$('identify-swatch').onclick = () => {
  if (!selectedId) return;
  const type = typeByNode[instances.get(selectedId).cfg.node];
  if (colorLocked(type)) return; // purchased hardware: no filament picker
  if ($('filament-menu').classList.contains('hidden')) openFilamentMenu(type);
  else { $('filament-menu').classList.add('hidden'); refreshSelHighlight(); }
};
$('fm-reset').onclick = () => {
  if (fmType) delete customColors[fmType];
  if (!Object.keys(customColors).length) useCustom = false;
  snapshotUserPalette(); // a per-type reset is a hand edit too
  saveColors();
  applyPalette();
  $('filament-menu').classList.add('hidden');
  refreshSelHighlight();
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
  const next = HANDLE_STYLES[(idx + dir + HANDLE_STYLES.length) % HANDLE_STYLES.length];
  await applyHandleStyle(next);
  $('style-name').textContent = next.label;
  if (!selectedId) return;
  const inst = instances.get(selectedId);
  if (typeByNode[inst.cfg.node] !== 'Handle') return;
  refreshSelHighlight(); // no glow if the filament menu is open (color mode)
  selAnchor = new THREE.Box3().setFromObject(inst.group).getCenter(new THREE.Vector3()).sub(inst.group.position);
  const info = partInfoByNode[inst.cfg.node] || { label: next.label };
  $('identify-name').textContent = info.label;
  const linksEl = $('identify-links');
  linksEl.innerHTML = '';
  if (info.links?.p) linksEl.appendChild(linkEl('Printables', info.links.p));
  if (info.links?.t) linksEl.appendChild(linkEl('Thangs', info.links.t));
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
  { key: 'edgelabel', label: 'EdgeLabel', node: c => `Faceplate_EdgeLabel_${c}`, hasHandle: false, collections: ['185', '165', '59', '115', '240', '270'],
    img: c => `img/parts/EdgeLabel_${c}.png`, // per-size renders, 2026-07-08 batch
    links: { p: 'https://www.printables.com/model/1093933-gen2-decor-faceplates-edgelabel-series', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20-%20Faceplate%20-%20EdgeLabel-1215609' } },
  // 3-zone plate (BODY/GRIP/GRIP ACCENT — the identify card grows a third
  // swatch via the generic renderZoneChips); grip scoop at the top with the
  // tilted label riding its slope
  { key: 'classicpro', label: 'Classic Pro', node: c => `Faceplate_ClassicPro_${c}`, hasHandle: false, collections: ['185', '165', '59', '115', '240', '270'],
    img: c => `img/parts/ClassicPro_${c}.png`, // per-size renders, 2026-07-13 batch
    links: { p: 'https://www.printables.com/model/1291210-gen2-decor-faceplates-classic-pro-series', t: 'https://thangs.com/designer/Jerrari/3d-model/GEN2%20Decor%20-%20Faceplates%20-%20Classic%20Pro%20Series-1332444' } },
];
const fpSizeCode = node => (node.match(/_(\dW-\d+H)$/) || [])[1] || null;
const availableFaceplateStyles = () => FACEPLATE_STYLES.filter(s => s.collections.includes(manifest.collection || '185'));
// label-bearing families link out to their label generator, carrying the
// build's typed drawer labels so they pre-fill there — the SAME
// `#labels=<base64 JSON array>` handoff the planner's own button uses
// (updateLabelGenLink in planner app.js; URLs from its faceplateStyles data)
const LABEL_GEN_URLS = { edgelabel: 'https://edgelabel.jerrari3d.com/', classicpro: 'https://classic.jerrari3d.com/' };
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
  await Promise.all(codes.map(async code => {
    const node = style.node(code);
    if (templates[node]) return;
    const gltf = await loader.loadAsync(`${PARTS_BASE}${node}.lib.glb`);
    templates[node] = adoptTemplate(gltf.scene, 'Faceplate');
  }));
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
    if (typeByNode[inst.cfg.node] !== 'Handle') continue;
    inst.styleHidden = !style.hasHandle;
    if (!fpFocus.id) inst.group.visible = pageVisibility(inst);
    else if (inst.styleHidden) inst.group.visible = false;
  }
  // BOM: faceplate rows follow the family; Handle rows hide with the style.
  // The original rows (labels/links/renders) are backed up on first swap so
  // returning to the manifest's own family restores them exactly.
  for (const row of manifest.parts) {
    if (row.type === 'Handle') { row.styleHidden = !style.hasHandle; continue; }
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
  const next = styles[(Math.max(0, styles.indexOf(curStyle)) + dir + styles.length) % styles.length];
  await applyFaceplateStyle(next);
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
  const linksEl = $('identify-links');
  linksEl.innerHTML = '';
  if (info.links?.p) linksEl.appendChild(linkEl('Printables', info.links.p));
  if (info.links?.t) linksEl.appendChild(linkEl('Thangs', info.links.t));
}
// the ◀ ▶ row serves whichever swappable part is selected
const cycleStyle = dir => {
  const inst = selectedId && instances.get(selectedId);
  if (!inst) return;
  const t = typeByNode[inst.cfg.node];
  if (t === 'Handle') cycleHandleStyle(dir);
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
    build.removedStoppers = [...new Set([...(build.removedStoppers || []), inst.cfg.stopperKey])];
  } else if ((type === 'MagnetClip' || type === 'Magnet') && inst.cfg.owner != null) {
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
    if (hits.length) addMeasurePoint(hits[0].point);
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
$('measure-toggle').onclick = () => setMeasure(!measure.on);
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
    $('measure-label').innerHTML = `${a.distanceTo(b).toFixed(1)} mm` +
      `<small>&#916;X ${Math.abs(b.x - a.x).toFixed(1)} &middot; &#916;Y ${Math.abs(b.y - a.y).toFixed(1)} &middot; &#916;Z ${Math.abs(b.z - a.z).toFixed(1)}</small>`;
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
  dims.group.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x656a73, transparent: true, opacity: 0.85 })));
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
  const d = e.data;
  if (!d || !build) return;
  if (d.gen2 === 'layoutBlocked' && typeof d.reason === 'string') { showBlocked(d.reason); return; }
  if (d.gen2 === 'layout' && d.build) { await applyRemoteLayout(d.build); return; }
  if (d.gen2 === 'colors') { applyRemoteColors(d); return; }
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
  // preview mode always re-lands on the FINISHED build (the new final step) —
  // min(cur, …) would strand it one step short whenever the layout GREW
  const keep = previewMode ? gen.manifest.steps.length : Math.min(cur, gen.manifest.steps.length); // step indices are stable (deterministic gen)
  // every options toggle lives INSIDE the parts panel, so it's open right now —
  // keep it open through goTo(), whose default policy would close it whenever a
  // toggle changes the step count (e.g. wallStagger restructures the step list
  // so `keep` no longer lands on the auto-open final step).
  const panelOpen = !$('checklist-panel').classList.contains('hidden');
  await mountManifest(gen.manifest);
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

// ---------- boot ----------
const X_URL = 'https://x.com/jerrari3D';
if (X_URL) { const a = $('outro-x'); a.href = X_URL; a.classList.remove('hidden'); }
const YT_URL = 'https://www.youtube.com/@jerrari3D';
if (YT_URL) { const a = $('outro-yt'); a.href = YT_URL; a.classList.remove('hidden'); }
await mountManifest(manifest);
applyPalette(); // restore any saved filament colors
$('loading-overlay').remove();
if (IS_EMBED && build) {
  // docked split view: land on the live PREVIEW (finished build, dims on,
  // parts panel minimized to its tab) instead of the box-art cover
  goTo(PAGES.length - 2, { animate: false });
  setChecklist(false);
  setPreview(true);
} else {
  goTo(0); // open on the cover
}
booted = true;
// introduce this tab to the planner (opener tab OR split-view parent) so live
// layout sync works even after a planner reload (it re-captures our window
// from any gen2 message) — the planner replies with the current layout,
// which no-ops if unchanged.
if (build && plannerWin()) {
  try { plannerWin().postMessage({ gen2: 'viewerReady' }, '*'); } catch (e) { /* opener gone */ }
  // …and teach the planner's palette cache our local colors (it keeps the
  // newest; its viewerReady reply may in turn carry something newer for us)
  if (colorsT) postColorsToPlanner();
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
  resize();
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
  renderer.render(scene, camera);
});

// dev-only hook (mirrors the planner's guarded test-hook convention): ?debug=1
if (new URLSearchParams(location.search).get('debug')) {
  window.__GEN2_VIEWER__ = { THREE, scene, camera, controls, goTo, applyState, instances, manifest, cinema, updateCinema, cinemaScene, party, confetti, confettiPop, fpFocus, fpEnv,
    get build() { return build; }, regenerate, setSelected, get selectedId() { return selectedId; } };
}
