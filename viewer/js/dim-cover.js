/* THE DIMENSION LABELS' COVER TEST, without walking the scene graph once per ray (Joey and Astra, 2026-09-14, "Step 1").
 *
 * updateDims places each W/H/L pill on its line and asks, for a candidate point, "is the model IN FRONT of this point?":
 * a ray from the camera through the point, `intersectObjects(targets, true)[0]`, covered when that nearest hit is closer
 * than the point minus 2 mm. MEASURED 2026-09-14 on the 80-unit build (1,268 parts, High, final step): about 1.9 such
 * tests per moving frame, ~5.8 ms of a 36 ms frame at a 4x CPU throttle, and most of the sampled time was three's
 * recursive `intersect` visiting every object and testing every mesh's world bounding sphere (vault measurements.md,
 * "An 80-unit build: where a moving frame's CPU time goes").
 *
 * This asks the same yes/no question in two stages:
 *   prepare(targets)  once per placement pass: walks the objects three's recursion would visit and stores each mesh's
 *                     world bounding sphere, computed by three's own Sphere.applyMatrix4 from the CURRENT matrixWorld.
 *   covers(ray, maxD) per candidate point: skips a mesh only when (a) three's own sphere test would skip it - the same
 *                     arithmetic as Ray.intersectSphere, term for term - or (b) all of its geometry lies past the label
 *                     point; every other mesh goes to three's own Mesh.raycast, with the raycaster untouched.
 * Nothing is kept from one pass to the next, so a part that moved, a group that was shown or hidden, or a mesh that was
 * swapped is simply seen on the next pass - there is no invalidation to get wrong.
 *
 * ⚠ TWO RADII, AND THE DIFFERENCE IS THE WHOLE POINT. three's world sphere scales the radius by the largest COLUMN of the
 * matrix (getMaxScaleOnAxis), which under-bounds a sheared matrix - a non-uniformly scaled parent with a rotated child -
 * so geometry can poke outside it. Test (a) mirrors three exactly, so it shares that under-bound with the original and
 * agrees with it. Test (b) is a rejection three never makes, so it uses the matrix's Frobenius norm, which bounds the
 * stretch of ANY affine matrix. The first version used three's radius for (b) and set `far`, and the equivalence test
 * caught it missing hits on sheared meshes (2026-09-14).
 * ⚠ EXACT ONLY FOR PLAIN MESHES. If any object under the targets has a raycast that is neither Object3D's no-op nor
 * Mesh's own - a Line or LineSegments (drawer focus puts some inside a drawer's group), Points, a Sprite, an
 * InstancedMesh, a mesh whose raycast was replaced per instance - the whole pass falls back to intersectObjects itself.
 * Those have rules a bounding-sphere prefilter does not know (a pick threshold, per-instance spheres, a `false` return
 * that stops the recursion). Test (b) also relies on every vertex three's raycast reads lying inside
 * geometry.boundingSphere, so the pass falls back for a mesh that breaks that too: one whose raycast blends MORPH TARGETS
 * (computeBoundingSphere bounds each target at influence 1, while getVertexPosition adds influence-weighted targets - an
 * influence above 1, or several summing past it, carries geometry outside the sphere), and a Mesh subclass that keeps
 * Mesh's raycast but replaces getVertexPosition or _computeIntersections (review of the change, 2026-09-14; the viewer's
 * parts are plain unmorphed meshes).
 * ⚠ raycaster.ray.direction must be unit length, as setFromCamera leaves it (three's Ray.intersectSphere assumes it too).
 * The equivalence is tested against intersectObjects in test/dim-cover.test.mjs, sabotage included.
 *
 * No THREE import: main.js passes its own THREE in, so node tests can pass the vendored build.
 */
const MARGIN_MM = 1e-3 * 1e-3;   // a micrometre, in the scene's millimetres: rounding cannot move a hit across it

export function createDimCoverTest(THREE) {
  const objectRaycast = THREE.Object3D.prototype.raycast;
  const meshRaycast = THREE.Mesh.prototype.raycast;
  const meshVertex = THREE.Mesh.prototype.getVertexPosition, meshIntersections = THREE.Mesh.prototype._computeIntersections;
  const sphere = new THREE.Sphere();
  const stack = [];
  const meshes = [];
  const hits = [];
  // per mesh: three's world sphere (centre + radius, for test a) and a radius that bounds the geometry (for test b)
  let cx = new Float64Array(512), cy = new Float64Array(512), cz = new Float64Array(512), cr = new Float64Array(512), cb = new Float64Array(512);
  let count = 0;
  let exact = true;
  let targetsOfPass = null;

  function grow() {
    const n = cx.length * 2;
    const next = (a) => { const b = new Float64Array(n); b.set(a); return b; };
    cx = next(cx); cy = next(cy); cz = next(cz); cr = next(cr); cb = next(cb);
  }

  /** Walk the targets as three's recursive intersect would. Returns false when this pass must fall back. */
  function prepare(targets) {
    targetsOfPass = targets;
    count = 0;
    exact = true;
    stack.length = 0;
    for (let i = targets.length - 1; i >= 0; i--) stack.push(targets[i]);
    while (stack.length) {
      const obj = stack.pop();
      const rc = obj.raycast;
      if (rc === meshRaycast) {
        // Mesh.raycast returns before its sphere test when there is no material, so such a mesh can never be hit
        if (obj.material !== undefined) {
          const geometry = obj.geometry;
          // a subclass that reads its vertices or its triangles another way (SkinnedMesh, InstancedMesh and BatchedMesh
          // override raycast itself, so they already fall back below) - see the header
          if (obj.getVertexPosition !== meshVertex || obj._computeIntersections !== meshIntersections) { exact = false; break; }
          // Mesh.getVertexPosition blends morph targets exactly when both of these are set - see the header
          if (geometry.morphAttributes.position && obj.morphTargetInfluences) { exact = false; break; }
          if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
          sphere.copy(geometry.boundingSphere).applyMatrix4(obj.matrixWorld);
          if (count === cx.length) grow();
          cx[count] = sphere.center.x; cy[count] = sphere.center.y; cz[count] = sphere.center.z; cr[count] = sphere.radius;
          const e = obj.matrixWorld.elements;
          cb[count] = geometry.boundingSphere.radius * Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]
            + e[4] * e[4] + e[5] * e[5] + e[6] * e[6] + e[8] * e[8] + e[9] * e[9] + e[10] * e[10]);
          meshes[count++] = obj;
        }
      } else if (rc !== objectRaycast) {
        exact = false;
        break;
      }
      const children = obj.children;
      for (let k = children.length - 1; k >= 0; k--) stack.push(children[k]);
    }
    stack.length = 0;
    if (!exact) count = 0;
    meshes.length = count;
    return exact;
  }

  /** Is anything in the prepared targets hit closer than maxD along raycaster.ray? */
  function covers(raycaster, maxD) {
    if (!exact) {
      const hit = raycaster.intersectObjects(targetsOfPass, true)[0];
      return !!hit && hit.distance < maxD;
    }
    // a hit distance is never negative, so `distance < maxD` cannot hold (this is also the answer for NaN)
    if (!(maxD > 0)) return false;
    const ray = raycaster.ray, near = raycaster.near;
    // Mesh.raycast recasts the ray to `near` before its sphere test: origin + direction * near, as Ray.at computes it
    const dx = ray.direction.x, dy = ray.direction.y, dz = ray.direction.z;
    const ox = ray.origin.x + dx * near, oy = ray.origin.y + dy * near, oz = ray.origin.z + dz * near;
    const limit = maxD + MARGIN_MM;
    try {
      for (let i = 0; i < count; i++) {
        // (a) Ray.intersectSphere's own first test, term for term: the ray's line misses three's world sphere
        const vx = cx[i] - ox, vy = cy[i] - oy, vz = cz[i] - oz;
        const tca = vx * dx + vy * dy + vz * dz;
        const d2 = (vx * vx + vy * vy + vz * vz) - tca * tca;
        const r = cr[i];
        if (d2 > r * r) continue;
        // (b) every point of the geometry is further along the ray than the label point, so no hit can be closer
        if (tca - cb[i] > limit) continue;
        const mesh = meshes[i];
        if (!mesh.layers.test(raycaster.layers)) continue;
        hits.length = 0;
        meshRaycast.call(mesh, raycaster, hits);
        for (let k = 0; k < hits.length; k++) if (hits[k].distance < maxD) return true;
      }
      return false;
    } finally {
      hits.length = 0;
    }
  }

  return { prepare, covers, get exact() { return exact; }, get meshCount() { return count; } };
}
