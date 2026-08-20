/* World-space X/Y/Z spans of a meshopt .lib.glb, measured from the JSON chunk
   alone - no mesh decoding. A quantized POSITION accessor's min/max plus the
   composed node transforms give exact world bounds (world = T + S·v/32767 for
   normalized SHORTs - the documented house formula; rotations DO appear
   legitimately and are composed fully).

   Extracted from plate-glb-orientation.test.mjs 2026-08-20 verbatim, when the
   hardware-set work gave a second suite a reason to measure spans (the
   STL-footprint law in part-preview.test.mjs). One parser, two consumers. */

import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

export function glbJson(file) {
  const buf = readFileSync(file);
  assert.equal(buf.readUInt32LE(0), 0x46546c67, file + ': not a GLB'); // 'glTF'
  const len0 = buf.readUInt32LE(12), type0 = buf.readUInt32LE(16);
  assert.equal(type0, 0x4e4f534a, file + ': first chunk is not JSON');
  return JSON.parse(buf.toString('utf8', 20, 20 + len0));
}
// 4x4 column-major helpers - node transforms can be TRS or matrix.
export function mat4FromTRS(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
const mul = (a, b) => { // a·b, column-major
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
const xform = (m, [x, y, z]) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];
export function worldExtents(file) {
  const g = glbJson(file);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const walk = (ni, parent) => {
    const n = g.nodes[ni];
    const local = n.matrix
      ? n.matrix.slice()
      : mat4FromTRS(n.translation, n.rotation, n.scale);
    const m = mul(parent, local);
    if (n.mesh != null) {
      for (const prim of g.meshes[n.mesh].primitives) {
        const acc = g.accessors[prim.attributes.POSITION];
        assert.ok(acc.min && acc.max, file + ': POSITION accessor lacks min/max');
        // quantized (normalized SHORT) or raw float - both appear in the wild
        const dq = acc.normalized ? v => v / 32767 : v => v;
        // all 8 corners through the composed transform (rotations permute axes)
        for (const cx of [acc.min[0], acc.max[0]]) for (const cy of [acc.min[1], acc.max[1]])
          for (const cz of [acc.min[2], acc.max[2]]) {
            const p = xform(m, [dq(cx), dq(cy), dq(cz)]);
            for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
          }
      }
    }
    for (const c of n.children || []) walk(c, m);
  };
  const I = mat4FromTRS();
  for (const ni of g.scenes[g.scene || 0].nodes) walk(ni, I);
  return { lo, hi };
}
export function worldSpans(file) {
  const { lo, hi } = worldExtents(file);
  return [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]].map(v => +v.toFixed(1));
}
