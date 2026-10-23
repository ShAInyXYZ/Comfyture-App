// Toaster's clay: the geometry of each primitive, made at its real size (never scaled on the mesh), centred on the origin, so
// its bounding box is exactly +-size/2 before rotation. Every geometry has position, normal and uv.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** The geometry of a part. */
export function geometryOf(part) {
  const [w, h, d] = part.size.map((v) => Math.max(0.01, Number(v) || 0.01));
  const sides = Math.round(Math.min(64, Math.max(3, part.sides ?? 32)));
  const round = Math.min(1, Math.max(0, part.round ?? 0));
  let g;
  switch (part.shape) {
    case "cylinder": g = prism(new THREE.CylinderGeometry(0.5, 0.5, 1, sides), sides); break;
    case "cone": g = prism(new THREE.CylinderGeometry(0, 0.5, 1, sides), sides); break;
    case "sphere": g = new THREE.SphereGeometry(0.5, 48, 32); break;
    case "pyramid": g = pyramid(); break;
    case "wedge": g = wedge(); break;
    case "dome": g = dome(); break;
    case "torus": g = torus(round); break;
    case "capsule": g = capsule(w, h, d); break;
    case "tube": g = tube(round, sides); break;
    default: g = roundedBox(w, h, d, round * 0.5 * Math.min(w, h, d));
  }
  return fit(g, w, h, d);
}

// Whatever the shape's own proportions (a hexagon is narrower than its circle), the box is made exactly +-size/2.
function fit(g, w, h, d) {
  g.computeBoundingBox();
  const b = g.boundingBox;
  const c = b.getCenter(new THREE.Vector3());
  const s = b.getSize(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z);
  g.scale(w / Math.max(s.x, 1e-6), h / Math.max(s.y, 1e-6), d / Math.max(s.z, 1e-6));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

export function disposeGeometry(g) {
  g?.dispose();
}

// A few sides read as facets, so those get flat normals; many sides read as a round and stay smooth.
function prism(g, sides) {
  if (sides > 16) return g;
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

// Flat-faced solids are given as polygons, outward faces found by looking away from the centre.
function solid(polygons) {
  const pos = [], nor = [], uv = [], index = [];
  const all = polygons.flat().map((v) => new THREE.Vector3(...v));
  const mid = all.reduce((a, v) => a.add(v), new THREE.Vector3()).divideScalar(all.length);
  for (const poly of polygons) {
    const p = poly.map((v) => new THREE.Vector3(...v));
    const c = p.reduce((a, v) => a.add(v), new THREE.Vector3()).divideScalar(p.length);
    const n = new THREE.Vector3().crossVectors(p[1].clone().sub(p[0]), p[2].clone().sub(p[0])).normalize();
    if (n.dot(c.sub(mid)) < 0) (p.reverse(), n.negate());
    const base = pos.length / 3;
    // uv: the face seen straight on
    const u = new THREE.Vector3().subVectors(p[1], p[0]).normalize();
    const v = new THREE.Vector3().crossVectors(n, u);
    for (const q of p) (pos.push(q.x, q.y, q.z), nor.push(n.x, n.y, n.z), uv.push(q.dot(u) + 0.5, q.dot(v) + 0.5));
    for (let i = 1; i < p.length - 1; i++) index.push(base, base + i, base + i + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

function pyramid() {
  const b = [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]];
  const top = [0, 0.5, 0];
  return solid([b, ...b.map((v, i) => [v, b[(i + 1) % 4], top])]);
}

// A ramp: high at the back, sloping down to the front, extruded along x.
function wedge() {
  const [bb, bf, tb] = [[0, -0.5, -0.5], [0, -0.5, 0.5], [0, 0.5, -0.5]];
  const at = (v, x) => [x, v[1], v[2]];
  const L = (v) => at(v, -0.5), R = (v) => at(v, 0.5);
  return solid([
    [L(bb), L(bf), R(bf), R(bb)], // bottom
    [L(bb), R(bb), R(tb), L(tb)], // back
    [L(tb), R(tb), R(bf), L(bf)], // slope
    [L(bb), L(bf), L(tb)], // sides
    [R(bb), R(bf), R(tb)],
  ]);
}

// The top half of a sphere on a flat disc.
function dome() {
  const cap = new THREE.SphereGeometry(0.5, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const base = new THREE.CircleGeometry(0.5, 48).rotateX(Math.PI / 2);
  return mergeGeometries([cap, base]);
}

// Lies flat; round is the tube's thickness, the outer radius stays 0.5.
function torus(round) {
  const tr = 0.04 + 0.21 * round;
  const g = new THREE.TorusGeometry(0.5 - tr, tr, 24, 64).rotateX(Math.PI / 2);
  return g;
}

function capsule(w, h, d) {
  const r = Math.min(w, d) / 2;
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, h - 2 * r), 12, 32);
  // fit() widens it to w and d
  return g;
}

// A hollow cylinder: outer wall, inner wall (turned inside out), and the two rings.
function tube(round, sides) {
  const ri = 0.5 * (1 - (0.05 + 0.9 * round));
  const outer = new THREE.CylinderGeometry(0.5, 0.5, 1, sides, 1, true);
  const inner = new THREE.CylinderGeometry(ri, ri, 1, sides, 1, true);
  const flip = (g) => {
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
    return g;
  };
  const ring = (y) => {
    const g = new THREE.RingGeometry(ri, 0.5, sides, 1).rotateX(y > 0 ? -Math.PI / 2 : Math.PI / 2);
    return g.translate(0, y, 0);
  };
  const parts = [outer, flip(inner), ring(0.5), ring(-0.5)];
  return mergeGeometries(sides > 16 ? parts : parts.map((g) => prism(g, sides)));
}

// A box whose corners are rounded by r: a subdivided box with the vertices pushed out from the inner box by r.
function roundedBox(w, h, d, r) {
  if (r < 1e-4) return new THREE.BoxGeometry(w, h, d);
  const half = [w / 2, h / 2, d / 2];
  const k = 8;
  // coordinates along an axis: k steps over each rounded end, none over the flat middle
  const line = (H) => {
    const a = [];
    for (let i = 0; i <= k; i++) a.push(-H + (r * i) / k);
    const b = a.map((v) => -v).reverse();
    return [...a, ...b];
  };
  const lines = half.map(line);
  const pos = [], nor = [], uv = [], index = [];
  const q = new THREE.Vector3(), c = new THREE.Vector3(), dir = new THREE.Vector3();
  for (let w3 = 0; w3 < 3; w3++) {
    for (const s of [1, -1]) {
      const iu = (w3 + 1) % 3, iv = (w3 + 2) % 3;
      const lu = lines[iu], lv = lines[iv];
      const base = pos.length / 3;
      for (let j = 0; j < lv.length; j++) {
        for (let i = 0; i < lu.length; i++) {
          const t = [0, 0, 0];
          t[iu] = lu[i]; t[iv] = lv[j]; t[w3] = s * half[w3];
          q.fromArray(t);
          c.set(Math.max(-half[0] + r, Math.min(half[0] - r, q.x)), Math.max(-half[1] + r, Math.min(half[1] - r, q.y)), Math.max(-half[2] + r, Math.min(half[2] - r, q.z)));
          dir.subVectors(q, c).normalize();
          q.copy(c).addScaledVector(dir, r);
          pos.push(q.x, q.y, q.z); nor.push(dir.x, dir.y, dir.z);
          uv.push(i / (lu.length - 1), j / (lv.length - 1));
        }
      }
      for (let j = 0; j < lv.length - 1; j++) {
        for (let i = 0; i < lu.length - 1; i++) {
          const a = base + j * lu.length + i, b = a + 1, e = a + lu.length, f = e + 1;
          // u x v points along +w, so a face on the +w side runs the other way round
          if (s > 0) index.push(a, b, e, b, f, e);
          else index.push(a, e, b, b, e, f);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}
