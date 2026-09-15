/* THE DIMENSION LABELS' COVER TEST - viewer/js/dim-cover.js against three r185's own Raycaster.intersectObjects.
 *
 * updateDims asks "is the model in front of this point?" as `intersectObjects(targets, true)[0]` then
 * `hit.distance < maxD`. dim-cover.js answers the same question with a sphere prefilter and three's own Mesh.raycast.
 * These tests put both to the same rays on random nested scenes (rotations, non-uniform scale, invisible groups left out of
 * the targets as updateDims leaves them out, meshes on other layers, single- and double-sided materials, a mesh with no
 * material) and require ZERO disagreements, with both answers well represented and thresholds placed exactly on the
 * nearest hit's distance.
 *
 * ⚠ A CHECK THAT CANNOT FAIL PROVES NOTHING. The first browser version of this check compared label placements at 72
 * camera poses and passed with its sabotages too, because every test there answered "clear" (2026-09-14). So the last
 * test here edits dim-cover.js's source in nine ways that each break the equivalence and requires every one of them to
 * disagree with intersectObjects somewhere. One of the nine is the first draft's real defect (below), which the
 * equivalence test found: rejecting "past the label point" with three's own world radius, which under-bounds the
 * geometry of a mesh under a non-uniformly scaled, rotated parent - so these scenes must keep that shear.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const THREE = await import(pathToFileURL(join(root, 'viewer', 'vendor', 'three', 'three.module.js')).href);
const MODULE = join(root, 'viewer', 'js', 'dim-cover.js');
// ⚠ LF, whatever the checkout: a Windows clone has CRLF, and a multi-line mutation anchor would then match nothing
const SOURCE = readFileSync(MODULE, 'utf8').replace(/\r\n/g, '\n');
const { createDimCoverTest } = await import(pathToFileURL(MODULE).href);

function mulberry32(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const GEOMETRIES = [new THREE.BoxGeometry(80, 50, 180), new THREE.SphereGeometry(30, 12, 8), new THREE.TorusGeometry(30, 8, 8, 16),
  new THREE.BoxGeometry(10, 60, 10), new THREE.CylinderGeometry(12, 20, 70, 10)];
const MATERIALS = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), new THREE.MeshBasicMaterial({ side: THREE.BackSide })];

/* a build-like layout: groups along a wide row, each Group > inner Group > meshes, as main.js's instances are */
function buildScene(rng, { groups = 120 } = {}) {
  const scene = new THREE.Scene();
  const all = [];
  const pick = (a) => a[Math.floor(rng() * a.length)];
  for (let i = 0; i < groups; i++) {
    const g = new THREE.Group();
    g.position.set((rng() - 0.5) * 1400, rng() * 300, (rng() - 0.5) * 300);
    g.rotation.set((rng() - 0.5) * 0.6, rng() * Math.PI * 2, (rng() - 0.5) * 0.6);
    // strongly non-uniform scale over a rotated child = a sheared world matrix, the case three's column-scale radius
    // under-bounds (see the header) - keep it strong, or the "three's radius" sabotage below goes uncaught
    g.scale.set(0.35 + rng() * 2.4, 0.35 + rng() * 2.4, 0.35 + rng() * 2.4);
    const inner = new THREE.Group();
    inner.position.set((rng() - 0.5) * 20, (rng() - 0.5) * 20, (rng() - 0.5) * 20);
    inner.rotation.set((rng() - 0.5) * 1.6, (rng() - 0.5) * 1.6, (rng() - 0.5) * 1.6);
    g.add(inner);
    const n = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(pick(GEOMETRIES), pick(MATERIALS));
      m.position.set((rng() - 0.5) * 60, (rng() - 0.5) * 40, (rng() - 0.5) * 60);
      m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      if (rng() < 0.12) m.layers.set(1);
      if (rng() < 0.02) m.material = undefined;
      inner.add(m);
    }
    if (rng() < 0.15) g.visible = false;
    scene.add(g);
    all.push(g);
  }
  scene.updateMatrixWorld(true);
  return { scene, groups: all, targets: all.filter((g) => g.visible) };   // exactly how updateDims builds its targets
}

const original = (raycaster, targets, maxD) => { const hit = raycaster.intersectObjects(targets, true)[0]; return !!hit && hit.distance < maxD; };

/* THE SHEAR CASE, built rather than hoped for. A radius-50 sphere under a parent scaled (4, 0.25, 1) and a child turned 45
   degrees about z: the world shape is an ellipsoid reaching 200 along x, but three's world radius is 50 x the largest
   COLUMN of the matrix, about 141.7. A ray from x = 400 toward the centre hits the surface at 200. With the label point at
   222 (maxD 220) the hit is in front of the point - covered - while three's whole sphere (from 258.3 on) lies past it,
   so a prefilter that trusted three's radius would answer clear. Random scenes reach that window too rarely to rely on. */
function shearedCase(createTest) {
  const g = new THREE.Group();
  g.scale.set(4, 0.25, 1);
  const inner = new THREE.Group();
  inner.rotation.z = Math.PI / 4;
  g.add(inner);
  inner.add(new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), new THREE.MeshBasicMaterial()));
  new THREE.Scene().add(g);
  g.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(400, 0, 0), new THREE.Vector3(-1, 0, 0));
  const cover = createTest(THREE);
  cover.prepare([g]);
  return { A: original(ray, [g], 220), B: cover.covers(ray, 220) };
}

/* THE MORPH CASE, built for the same reason. A 40 mm box at the origin with one relative morph target that moves every
   vertex +100 in z. computeBoundingSphere sizes the box for influences up to 1 (three r185 gives centre z 80, radius
   103.9), but the influence is 3, so the box three actually raycasts sits at z 280..320. A ray from z 400 toward -z meets
   it at 80; with the label point at 102 (maxD 100) that is covered, while even the Frobenius radius puts the whole sphere
   past the point (320 - 180.0 = 140) - so a prefilter that trusted the sphere for a morphed mesh would answer clear.
   `wholePast` re-derives that last inequality from the sphere three computed, so a three that sizes it differently
   fails the construction instead of quietly defanging the check (the first draft used maxD 150 on a hand-computed
   sphere, and the mutation that drops the guard went uncaught). */
function morphedCase(createTest) {
  const geo = new THREE.BoxGeometry(40, 40, 40);
  const delta = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < geo.attributes.position.count; i++) delta[i * 3 + 2] = 100;
  geo.morphAttributes.position = [new THREE.Float32BufferAttribute(delta, 3)];
  geo.morphTargetsRelative = true;
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());   // the constructor reads morphAttributes: set them first
  mesh.morphTargetInfluences[0] = 3;
  const g = new THREE.Group();
  g.add(mesh);
  new THREE.Scene().add(g);
  g.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 400), new THREE.Vector3(0, 0, -1));
  const cover = createTest(THREE);
  cover.prepare([g]);
  // three computes it lazily on the first raycast; a guarded prepare() falls back before it would
  if (geo.boundingSphere === null) geo.computeBoundingSphere();
  const maxD = 100, s = geo.boundingSphere;   // identity world matrix: the Frobenius norm of its 3x3 is sqrt(3)
  const wholePast = (400 - s.center.z) - s.radius * Math.sqrt(3) > maxD && Math.hypot(s.center.x, s.center.y) < s.radius;
  return { A: original(ray, [g], maxD), B: cover.covers(ray, maxD), exact: cover.exact, wholePast };
}

/* THE SUBCLASS CASE: a Mesh subclass that keeps Mesh's raycast but reads its vertices 300 mm further along z (a stand-in
   for any deformer). Three's own raycast tests the static sphere (radius ~34.6 at the origin), which the ray passes
   through, and then finds the shifted box at 80; test (b) on the static sphere would put the whole mesh past the point
   (400 - 60.0 = 340 > 100) and answer clear. */
function subclassCase(createTest) {
  class Shifted extends THREE.Mesh {
    getVertexPosition(index, target) { super.getVertexPosition(index, target); target.z += 300; return target; }
  }
  const mesh = new Shifted(new THREE.BoxGeometry(40, 40, 40), new THREE.MeshBasicMaterial());
  const g = new THREE.Group();
  g.add(mesh);
  new THREE.Scene().add(g);
  g.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 400), new THREE.Vector3(0, 0, -1));
  const cover = createTest(THREE);
  cover.prepare([g]);
  if (mesh.geometry.boundingSphere === null) mesh.geometry.computeBoundingSphere();
  const maxD = 100, s = mesh.geometry.boundingSphere;
  const wholePast = (400 - s.center.z) - s.radius * Math.sqrt(3) > maxD;
  return { A: original(ray, [g], maxD), B: cover.covers(ray, maxD), exact: cover.exact, wholePast };
}

/* N rays from around the scene through points in and near it; a quarter get a random threshold, a tenth a threshold placed
   ON the nearest hit (equal, a hair over, a hair under) */
function compare(cover, { targets }, rng, N) {
  const box = new THREE.Box3(); for (const g of targets) box.expandByObject(g);
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()), R = size.length() / 2;
  const ray = new THREE.Raycaster();
  const cam = new THREE.Vector3(), pt = new THREE.Vector3(), dir = new THREE.Vector3();
  const out = { covered: 0, clear: 0, boundary: 0, layered: 0, disagree: 0, firstDisagreement: null };
  for (let i = 0; i < N; i++) {
    const az = rng() * Math.PI * 2, pol = (10 + rng() * 120) * Math.PI / 180, dist = (0.8 + rng() * 2.5) * R;
    cam.set(c.x + dist * Math.sin(pol) * Math.sin(az), c.y + dist * Math.cos(pol), c.z + dist * Math.sin(pol) * Math.cos(az));
    pt.set(c.x + (rng() - 0.5) * size.x * 1.3, c.y + (rng() - 0.5) * size.y * 1.3, c.z + (rng() - 0.5) * size.z * 1.3);
    dir.subVectors(pt, cam).normalize();
    ray.set(cam, dir);
    ray.layers.set(0);
    if (rng() < 0.1) { ray.layers.set(1); out.layered++; }
    let maxD = cam.distanceTo(pt) - 2;
    const roll = rng();
    if (roll < 0.25) maxD = (rng() * 1.6 - 0.1) * cam.distanceTo(pt);
    else if (roll < 0.45) {
      const nearest = ray.intersectObjects(targets, true)[0];
      if (nearest) { maxD = nearest.distance + [0, 1e-9, -1e-9, 1e-12][Math.floor(rng() * 4)]; out.boundary++; }
    }
    const A = original(ray, targets, maxD);
    cover.prepare(targets);
    const B = cover.covers(ray, maxD);
    if (ray.far !== Infinity) throw new Error('covers() left raycaster.far changed');
    if (A) out.covered++; else out.clear++;
    if (A !== B) { out.disagree++; if (!out.firstDisagreement) out.firstDisagreement = { i, maxD, A, B }; }
  }
  return out;
}

test('covers() gives intersectObjects\' answer on every ray of a random build-like scene', () => {
  const rng = mulberry32(20260914);
  const scene = buildScene(rng);
  const cover = createDimCoverTest(THREE);
  const r = compare(cover, scene, rng, 3000);
  assert.equal(cover.exact, true, 'a scene of plain meshes must take the prefiltered path, not the fallback');
  assert.equal(r.disagree, 0, `disagreements: ${JSON.stringify(r.firstDisagreement)}`);
  // the check has to see both answers, the threshold edge and the layer rule, or a zero proves nothing
  assert.ok(r.covered >= 600 && r.clear >= 600, `covered ${r.covered}, clear ${r.clear}`);
  assert.ok(r.boundary >= 150, `boundary cases ${r.boundary}`);
  assert.ok(r.layered >= 150, `layered cases ${r.layered}`);
});

test('a sheared mesh whose geometry pokes outside three\'s own world sphere is still judged covered', () => {
  const s = shearedCase(createDimCoverTest);
  assert.equal(s.A, true, 'intersectObjects must find the hit at 200 (the construction is wrong otherwise)');
  assert.equal(s.B, true, 'covers() rejected a mesh whose geometry reaches in front of the label point');
});

test('a mesh whose raycast blends morph targets makes the pass fall back, and a morph outside the sphere is still covered', () => {
  const s = morphedCase(createDimCoverTest);
  assert.equal(s.A, true, 'intersectObjects must find the morphed box at 80 (the construction is wrong otherwise)');
  assert.equal(s.wholePast, true, 'the ray must pass through three\'s sphere and the whole sphere must lie past the label point');
  assert.equal(s.exact, false, 'a morphed mesh must make the pass fall back');
  assert.equal(s.B, true, 'covers() answered clear for a morphed mesh in front of the label point');
});

test('a Mesh subclass that reads its vertices its own way makes the pass fall back, and is still judged covered', () => {
  const s = subclassCase(createDimCoverTest);
  assert.equal(s.A, true, 'intersectObjects must find the shifted box at 80 (the construction is wrong otherwise)');
  assert.equal(s.wholePast, true, 'the whole static sphere must lie past the label point');
  assert.equal(s.exact, false, 'a subclass with its own getVertexPosition must make the pass fall back');
  assert.equal(s.B, true, 'covers() answered clear for a shifted mesh in front of the label point');
  // and the three subclasses three ships with their own vertex rules override raycast itself, so they never reach it
  for (const C of [THREE.SkinnedMesh, THREE.InstancedMesh, THREE.BatchedMesh]) {
    assert.notEqual(C.prototype.raycast, THREE.Mesh.prototype.raycast, `${C.name} must override raycast`);
  }
});

test('prepare() sees where the parts are NOW: moved, hidden and re-shown groups', () => {
  const rng = mulberry32(7);
  const scene = buildScene(rng, { groups: 80 });
  const cover = createDimCoverTest(THREE);
  for (let round = 0; round < 5; round++) {
    for (const g of scene.groups) { g.position.x += (rng() - 0.5) * 200; g.rotation.y += rng(); g.visible = rng() > 0.2; }
    scene.scene.updateMatrixWorld(true);
    scene.targets = scene.groups.filter((g) => g.visible);
    const r = compare(cover, scene, rng, 400);
    assert.equal(r.disagree, 0, `round ${round}: ${JSON.stringify(r.firstDisagreement)}`);
  }
});

test('anything that is not a plain mesh makes the pass fall back to intersectObjects, and the answers still agree', () => {
  const cases = {
    'line segments (drawer focus puts some inside a drawer group)': (g) => {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-60, 0, 0), new THREE.Vector3(60, 0, 0)]);
      g.children[0].add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial()));
    },
    'points': (g) => {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 30, 0), new THREE.Vector3(10, 40, 0)]);
      g.add(new THREE.Points(geo, new THREE.PointsMaterial()));
    },
    'an instanced mesh': (g) => {
      const im = new THREE.InstancedMesh(GEOMETRIES[0], MATERIALS[0], 3);
      const m = new THREE.Matrix4();
      for (let i = 0; i < 3; i++) im.setMatrixAt(i, m.makeTranslation(i * 150 - 150, 0, 0));
      g.add(im);
    },
    'a raycast override that stops the recursion': (g) => {
      g.children[0].raycast = () => false;   // three's intersect then never visits this object's children
    },
  };
  for (const [name, add] of Object.entries(cases)) {
    const rng = mulberry32(99);
    const scene = buildScene(rng, { groups: 60 });
    for (let i = 0; i < scene.targets.length; i += 3) add(scene.targets[i]);
    scene.scene.updateMatrixWorld(true);
    const cover = createDimCoverTest(THREE);
    const r = compare(cover, scene, rng, 800);
    assert.equal(cover.exact, false, `${name}: must fall back`);
    assert.equal(r.disagree, 0, `${name}: ${JSON.stringify(r.firstDisagreement)}`);
  }
});

test('the equivalence check has power: nine broken copies of dim-cover.js each disagree with intersectObjects', async () => {
  const mutations = [
    ['the layer test dropped', 'if (!mesh.layers.test(raycaster.layers)) continue;', ''],
    ['the line-miss prefilter too eager', 'if (d2 > r * r) continue;', 'if (d2 > r * r * 0.25) continue;'],
    ['past-the-point judged by the centre', 'if (tca - cb[i] > limit) continue;', 'if (tca > limit) continue;'],
    // the first version's own defect: three's column-scale radius under-bounds a sheared matrix
    ['past-the-point judged by three\'s radius', 'if (tca - cb[i] > limit) continue;', 'if (tca - r > limit) continue;'],
    ['the threshold made inclusive', 'if (hits[k].distance < maxD) return true;', 'if (hits[k].distance <= maxD) return true;'],
    ['spheres left in local space', 'sphere.copy(geometry.boundingSphere).applyMatrix4(obj.matrixWorld);', 'sphere.copy(geometry.boundingSphere);'],
    ['no fallback for objects that are not plain meshes', `} else if (rc !== objectRaycast) {\n        exact = false;\n        break;\n      }`, '}'],
    ['no fallback for morph targets', 'if (geometry.morphAttributes.position && obj.morphTargetInfluences) { exact = false; break; }', ''],
    ['no fallback for a subclass that reads its vertices its own way', 'if (obj.getVertexPosition !== meshVertex || obj._computeIntersections !== meshIntersections) { exact = false; break; }', ''],
  ];
  for (const [name, from, to] of mutations) {
    assert.equal(SOURCE.split(from).length - 1, 1, `mutation "${name}": its anchor must occur exactly once in dim-cover.js`);
    const mutated = await import('data:text/javascript;base64,' + Buffer.from(SOURCE.replace(from, to)).toString('base64'));
    const rng = mulberry32(4242);
    const scene = buildScene(rng, { groups: 120 });
    if (name.startsWith('no fallback')) {
      // needs objects with their own raycast rules under the targets
      for (let i = 0; i < scene.targets.length; i += 2) {
        const im = new THREE.InstancedMesh(GEOMETRIES[0], MATERIALS[0], 2);
        im.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-120, 0, 0)); im.setMatrixAt(1, new THREE.Matrix4().makeTranslation(120, 0, 0));
        scene.targets[i].add(im);
      }
      scene.scene.updateMatrixWorld(true);
    }
    const r = compare(mutated.createDimCoverTest(THREE), scene, rng, 3000);
    const sheared = shearedCase(mutated.createDimCoverTest);
    if (sheared.A !== sheared.B) r.disagree++;
    const morphed = morphedCase(mutated.createDimCoverTest);
    if (morphed.A !== morphed.B) r.disagree++;
    const shifted = subclassCase(mutated.createDimCoverTest);
    if (shifted.A !== shifted.B) r.disagree++;
    assert.ok(r.disagree > 0, `mutation "${name}" was NOT caught (covered ${r.covered}, clear ${r.clear}, boundary ${r.boundary}, layered ${r.layered})`);
  }
});
