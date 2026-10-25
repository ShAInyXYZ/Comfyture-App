// Blockout assets: furniture, architecture and outdoor pieces built from simple
// shapes in the same clay as the mannequins, so a reference reads as one staged
// scene. Each one is parametric: its sizes are numbers you can change, and it is
// rebuilt from them (a table keeps its leg thickness however wide it gets).
// Every asset stands on the ground (y = 0), centred, with its front toward +Z;
// seats and tops say where a body sits and where things rest.

import * as THREE from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { MODELS, openSurface, loadManifest, wantModel } from "./models.js";

const clay = () => new THREE.MeshStandardMaterial({ color: "#a9a59e", roughness: 0.85 });
// the parts of a model that read apart: glass, a screen, a shade
const accentClay = () => new THREE.MeshStandardMaterial({ color: "#86827c", roughness: 0.7 });

// shape helpers: each takes its centre
const box = (w, h, d, x = 0, y = 0, z = 0) => at(new THREE.BoxGeometry(w, h, d), x, y, z);
const cyl = (rTop, rBottom, h, x = 0, y = 0, z = 0, segments = 28) => at(new THREE.CylinderGeometry(rTop, rBottom, h, segments), x, y, z);
const ball = (r, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => at(new THREE.SphereGeometry(r, 28, 18), x, y, z, [sx, sy, sz]);
function at(geometry, x, y, z, scale) {
  const mesh = new THREE.Mesh(geometry);
  mesh.position.set(x, y, z);
  if (scale) mesh.scale.set(...scale);
  return mesh;
}
/** A flat profile (in the x-y plane) pushed `depth` along z, centred. */
function extrude(shape, depth, x = 0, y = 0, z = 0) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return at(g, x, y, z);
}
/** Seats spread along a width: one place per `each` metres, at least one. */
const places = (width, each = 0.6) => {
  const n = Math.max(1, Math.floor(width / each));
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * (width / n));
};

/**
 * The catalogue. params: [key, label, min, max, step, default]; build(p) returns the pieces;
 * seat(p): where a body sits ({ y: seat height, z: hip depth, x: [places] }); top(p): the height
 * things rest on. legacy: the sizes an asset had before it was parametric, for old scenes.
 */
export const ASSETS = [
  // ---------------------------------------------------------------- basic
  { type: "box", name: "Box", category: "Basic", icon: "prop-box",
    params: [["w", "Width", 0.1, 6, 0.05, 0.6], ["h", "Height", 0.05, 4, 0.05, 0.6], ["d", "Depth", 0.1, 6, 0.05, 0.6]],
    build: (p) => [box(p.w, p.h, p.d, 0, p.h / 2)], top: (p) => p.h },
  { type: "cylinder", name: "Cylinder", category: "Basic", icon: "prop-cylinder",
    params: [["r", "Radius", 0.05, 3, 0.01, 0.3], ["h", "Height", 0.05, 6, 0.05, 0.8]],
    build: (p) => [cyl(p.r, p.r, p.h, 0, p.h / 2)], top: (p) => p.h },
  { type: "sphere", name: "Sphere", category: "Basic", icon: "prop-sphere",
    params: [["r", "Radius", 0.05, 3, 0.01, 0.35]],
    build: (p) => [ball(p.r, 0, p.r)] },
  { type: "cone", name: "Cone", category: "Basic", icon: "asset-cone",
    params: [["r", "Radius", 0.05, 2, 0.01, 0.25], ["h", "Height", 0.1, 4, 0.05, 0.7]],
    build: (p) => [box(p.r * 2.2, 0.03, p.r * 2.2, 0, 0.015), cyl(0.02, p.r, p.h - 0.03, 0, 0.03 + (p.h - 0.03) / 2)] },

  // ---------------------------------------------------------------- architecture
  { type: "plane", name: "Wall", category: "Architecture", icon: "prop-wall",
    params: [["w", "Width", 0.2, 20, 0.1, 4], ["h", "Height", 0.2, 8, 0.05, 2.6], ["d", "Thickness", 0.02, 1, 0.01, 0.12]],
    legacy: { w: 2.4, h: 2.2, d: 0.08 },
    build: (p) => [box(p.w, p.h, p.d, 0, p.h / 2)] },
  { type: "doorway", name: "Doorway", category: "Architecture", icon: "asset-doorway",
    params: [["w", "Width", 1.2, 20, 0.1, 4], ["h", "Height", 2.2, 8, 0.05, 2.7], ["d", "Thickness", 0.05, 1, 0.01, 0.15], ["door", "Opening", 0.6, 3, 0.05, 1], ["doorH", "Opening height", 1.6, 3.5, 0.05, 2.1]],
    build: (p) => {
      const side = (p.w - p.door) / 2;
      const lintel = Math.max(0.02, p.h - p.doorH);
      return [box(side, p.h, p.d, -(p.door + side) / 2, p.h / 2), box(side, p.h, p.d, (p.door + side) / 2, p.h / 2), box(p.door, lintel, p.d, 0, p.doorH + lintel / 2)];
    } },
  { type: "window", name: "Window wall", category: "Architecture", icon: "asset-window",
    params: [["w", "Width", 1.2, 20, 0.1, 4], ["h", "Height", 1.8, 8, 0.05, 2.7], ["d", "Thickness", 0.05, 1, 0.01, 0.15], ["win", "Window width", 0.4, 4, 0.05, 1.4], ["winH", "Window height", 0.3, 3, 0.05, 1.2], ["sill", "Sill height", 0.2, 2, 0.05, 0.9]],
    build: (p) => {
      const side = (p.w - p.win) / 2;
      const above = Math.max(0.02, p.h - p.sill - p.winH);
      return [
        box(side, p.h, p.d, -(p.win + side) / 2, p.h / 2), box(side, p.h, p.d, (p.win + side) / 2, p.h / 2),
        box(p.win, p.sill, p.d, 0, p.sill / 2), box(p.win, above, p.d, 0, p.h - above / 2),
        box(p.win, 0.04, p.d + 0.06, 0, p.sill + 0.02),
      ];
    } },
  { type: "door", name: "Door", category: "Architecture", icon: "asset-door",
    params: [["w", "Width", 0.6, 2, 0.05, 0.9], ["h", "Height", 1.6, 3, 0.05, 2.1], ["open", "Open", 0, 120, 1, 0]],
    build: (p) => {
      const frame = 0.06;
      const slab = box(p.w, p.h, 0.045, p.w / 2, p.h / 2, 0);
      const hinge = new THREE.Group();
      hinge.position.set(-p.w / 2, 0, 0);
      hinge.rotation.y = THREE.MathUtils.degToRad(-p.open);
      hinge.add(slab);
      return [box(frame, p.h + frame, 0.1, -p.w / 2 - frame / 2, (p.h + frame) / 2), box(frame, p.h + frame, 0.1, p.w / 2 + frame / 2, (p.h + frame) / 2), box(p.w, frame, 0.1, 0, p.h + frame / 2), hinge];
    } },
  { type: "pillar", name: "Pillar", category: "Architecture", icon: "asset-pillar",
    params: [["r", "Radius", 0.08, 1.5, 0.01, 0.25], ["h", "Height", 0.5, 12, 0.05, 3]],
    build: (p) => [box(p.r * 2.6, 0.12, p.r * 2.6, 0, 0.06), cyl(p.r, p.r * 1.06, p.h - 0.24, 0, 0.12 + (p.h - 0.24) / 2), box(p.r * 2.6, 0.12, p.r * 2.6, 0, p.h - 0.06)] },
  { type: "arch", name: "Arch", category: "Architecture", icon: "asset-arch",
    params: [["w", "Width", 1, 12, 0.1, 2.6], ["h", "Height", 1.5, 10, 0.05, 3.2], ["d", "Depth", 0.1, 2, 0.05, 0.5], ["open", "Opening", 0.5, 10, 0.05, 1.6]],
    build: (p) => {
      const o = Math.min(p.open, p.w - 0.2) / 2;
      const spring = Math.max(0.3, p.h - o - 0.25);
      const shape = new THREE.Shape([new THREE.Vector2(-p.w / 2, 0), new THREE.Vector2(p.w / 2, 0), new THREE.Vector2(p.w / 2, p.h), new THREE.Vector2(-p.w / 2, p.h)]);
      const hole = new THREE.Path();
      hole.moveTo(-o, 0);
      hole.lineTo(-o, spring);
      hole.absarc(0, spring, o, Math.PI, 0, true);
      hole.lineTo(o, 0);
      hole.lineTo(-o, 0);
      shape.holes.push(hole);
      return [extrude(shape, p.d)];
    } },
  { type: "stairs", name: "Stairs", category: "Architecture", icon: "prop-stairs",
    params: [["w", "Width", 0.5, 6, 0.05, 1], ["steps", "Steps", 1, 20, 1, 5], ["rise", "Step height", 0.08, 0.3, 0.01, 0.18], ["run", "Step depth", 0.15, 0.6, 0.01, 0.3]],
    // the steps rise toward the back (-z), the first one at the front
    build: (p) => Array.from({ length: Math.round(p.steps) }, (_, i) => box(p.w, p.rise * (i + 1), p.run, 0, (p.rise * (i + 1)) / 2, -i * p.run)),
    seat: (p) => ({ y: p.rise * Math.min(2, Math.round(p.steps)), z: -Math.min(1, Math.round(p.steps) - 1) * p.run, x: places(p.w, 0.55) }) },
  { type: "ramp", name: "Ramp", category: "Architecture", icon: "asset-ramp",
    params: [["w", "Width", 0.4, 8, 0.05, 1.2], ["d", "Length", 0.4, 10, 0.05, 2], ["h", "Height", 0.05, 4, 0.05, 0.6]],
    // rising toward the back
    build: (p) => {
      const shape = new THREE.Shape([new THREE.Vector2(p.d / 2, 0), new THREE.Vector2(-p.d / 2, 0), new THREE.Vector2(-p.d / 2, p.h)]);
      const mesh = extrude(shape, p.w);
      mesh.rotation.y = -Math.PI / 2;
      return [mesh];
    } },
  { type: "platform", name: "Platform", category: "Architecture", icon: "asset-platform",
    params: [["w", "Width", 0.4, 12, 0.05, 2], ["d", "Depth", 0.4, 12, 0.05, 2], ["h", "Height", 0.05, 3, 0.05, 0.4]],
    build: (p) => [box(p.w, p.h, p.d, 0, p.h / 2)], top: (p) => p.h,
    seat: (p) => ({ y: p.h, z: p.d / 2 - 0.15, x: places(p.w) }) },
  { type: "floor", name: "Floor", category: "Architecture", icon: "asset-floor",
    params: [["w", "Width", 0.4, 30, 0.1, 3], ["d", "Depth", 0.4, 30, 0.1, 2]],
    build: (p) => [box(p.w, 0.012, p.d, 0, 0.006)] },
  { type: "fence", name: "Fence", category: "Architecture", icon: "asset-fence",
    params: [["w", "Length", 0.5, 20, 0.1, 2.4], ["h", "Height", 0.4, 3, 0.05, 1.1]],
    build: (p) => {
      const posts = Math.max(2, Math.round(p.w / 0.8) + 1);
      const parts = Array.from({ length: posts }, (_, i) => box(0.08, p.h, 0.08, -p.w / 2 + (i * p.w) / (posts - 1), p.h / 2));
      parts.push(box(p.w, 0.07, 0.04, 0, p.h * 0.82), box(p.w, 0.07, 0.04, 0, p.h * 0.38));
      return parts;
    } },

  // ---------------------------------------------------------------- furniture
  { type: "chair", name: "Chair", category: "Furniture", icon: "asset-chair",
    params: [["w", "Width", 0.35, 0.8, 0.01, 0.46], ["d", "Depth", 0.35, 0.8, 0.01, 0.46], ["seat", "Seat height", 0.3, 0.8, 0.01, 0.46], ["h", "Back height", 0.6, 1.4, 0.01, 0.9]],
    build: (p) => {
      const leg = 0.04;
      const parts = [box(p.w, 0.05, p.d, 0, p.seat - 0.025), box(p.w, p.h - p.seat, 0.05, 0, p.seat + (p.h - p.seat) / 2, -p.d / 2 + 0.025)];
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(box(leg, p.seat - 0.05, leg, sx * (p.w / 2 - leg / 2), (p.seat - 0.05) / 2, sz * (p.d / 2 - leg / 2)));
      return parts;
    },
    seat: (p) => ({ y: p.seat, z: -0.02, x: [0] }), top: (p) => p.seat },
  { type: "armchair", name: "Armchair", category: "Furniture", icon: "asset-armchair",
    params: [["w", "Width", 0.6, 1.4, 0.01, 0.9], ["d", "Depth", 0.6, 1.2, 0.01, 0.85], ["seat", "Seat height", 0.3, 0.6, 0.01, 0.42], ["h", "Back height", 0.6, 1.3, 0.01, 0.9]],
    build: (p) => [
      box(p.w, p.seat - 0.12, p.d, 0, (p.seat - 0.12) / 2), box(p.w - 0.3, 0.12, p.d - 0.2, 0, p.seat - 0.06, 0.1),
      box(p.w, p.h, 0.2, 0, p.h / 2, -p.d / 2 + 0.1), box(0.15, p.seat + 0.2, p.d, -p.w / 2 + 0.075, (p.seat + 0.2) / 2), box(0.15, p.seat + 0.2, p.d, p.w / 2 - 0.075, (p.seat + 0.2) / 2),
    ],
    seat: (p) => ({ y: p.seat, z: 0.02, x: [0] }) },
  { type: "sofa", name: "Sofa", category: "Furniture", icon: "asset-sofa",
    params: [["w", "Width", 1, 4, 0.05, 2], ["d", "Depth", 0.6, 1.4, 0.01, 0.9], ["seat", "Seat height", 0.3, 0.6, 0.01, 0.42], ["h", "Back height", 0.6, 1.2, 0.01, 0.85]],
    build: (p) => [
      box(p.w, p.seat - 0.12, p.d, 0, (p.seat - 0.12) / 2), box(p.w - 0.36, 0.12, p.d - 0.22, 0, p.seat - 0.06, 0.11),
      box(p.w, p.h, 0.22, 0, p.h / 2, -p.d / 2 + 0.11), box(0.18, p.seat + 0.2, p.d, -p.w / 2 + 0.09, (p.seat + 0.2) / 2), box(0.18, p.seat + 0.2, p.d, p.w / 2 - 0.09, (p.seat + 0.2) / 2),
    ],
    seat: (p) => ({ y: p.seat, z: 0.04, x: places(p.w - 0.36, 0.6) }) },
  { type: "stool", name: "Stool", category: "Furniture", icon: "asset-stool",
    params: [["r", "Radius", 0.12, 0.35, 0.01, 0.18], ["seat", "Height", 0.3, 1.1, 0.01, 0.65]],
    build: (p) => {
      const parts = [cyl(p.r, p.r, 0.05, 0, p.seat - 0.025)];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        parts.push(cyl(0.018, 0.018, p.seat - 0.05, Math.cos(a) * p.r * 0.75, (p.seat - 0.05) / 2, Math.sin(a) * p.r * 0.75, 10));
      }
      return parts;
    },
    seat: (p) => ({ y: p.seat, z: 0, x: [0] }), top: (p) => p.seat },
  { type: "bench", name: "Bench", category: "Furniture", icon: "asset-bench",
    params: [["w", "Length", 0.6, 6, 0.05, 1.6], ["d", "Depth", 0.25, 0.8, 0.01, 0.4], ["seat", "Seat height", 0.25, 0.7, 0.01, 0.45]],
    build: (p) => [box(p.w, 0.06, p.d, 0, p.seat - 0.03), box(0.06, p.seat - 0.06, p.d * 0.9, -p.w / 2 + 0.12, (p.seat - 0.06) / 2), box(0.06, p.seat - 0.06, p.d * 0.9, p.w / 2 - 0.12, (p.seat - 0.06) / 2)],
    seat: (p) => ({ y: p.seat, z: 0, x: places(p.w, 0.55) }), top: (p) => p.seat },
  { type: "table", name: "Table", category: "Furniture", icon: "asset-table",
    params: [["w", "Width", 0.4, 4, 0.05, 1.2], ["d", "Depth", 0.4, 2, 0.05, 0.7], ["h", "Height", 0.3, 1.2, 0.01, 0.75]],
    build: (p) => {
      const leg = 0.05;
      const parts = [box(p.w, 0.04, p.d, 0, p.h - 0.02)];
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(box(leg, p.h - 0.04, leg, sx * (p.w / 2 - 0.06), (p.h - 0.04) / 2, sz * (p.d / 2 - 0.06)));
      return parts;
    },
    top: (p) => p.h },
  { type: "desk", name: "Desk", category: "Furniture", icon: "asset-desk",
    params: [["w", "Width", 0.6, 3, 0.05, 1.4], ["d", "Depth", 0.4, 1.2, 0.05, 0.7], ["h", "Height", 0.5, 1.1, 0.01, 0.75]],
    build: (p) => [box(p.w, 0.04, p.d, 0, p.h - 0.02), box(0.04, p.h - 0.04, p.d, -p.w / 2 + 0.02, (p.h - 0.04) / 2), box(0.04, p.h - 0.04, p.d, p.w / 2 - 0.02, (p.h - 0.04) / 2), box(p.w - 0.08, (p.h - 0.04) * 0.55, 0.02, 0, p.h - 0.04 - ((p.h - 0.04) * 0.55) / 2, -p.d / 2 + 0.03)],
    top: (p) => p.h },
  { type: "counter", name: "Counter", category: "Furniture", icon: "asset-counter",
    params: [["w", "Length", 0.6, 8, 0.05, 2], ["d", "Depth", 0.3, 1.2, 0.01, 0.6], ["h", "Height", 0.6, 1.3, 0.01, 1.05]],
    build: (p) => [box(p.w, p.h - 0.05, p.d - 0.06, 0, (p.h - 0.05) / 2, -0.03), box(p.w + 0.04, 0.05, p.d, 0, p.h - 0.025)],
    top: (p) => p.h },
  { type: "bed", name: "Bed", category: "Furniture", icon: "asset-bed",
    params: [["w", "Width", 0.8, 2.4, 0.05, 1.6], ["d", "Length", 1.6, 2.6, 0.05, 2.05], ["h", "Height", 0.25, 0.8, 0.01, 0.45]],
    // the headboard at the back (-z): someone lying on it with the lie pose has their head there
    build: (p) => [
      box(p.w, p.h - 0.18, p.d, 0, (p.h - 0.18) / 2), box(p.w - 0.04, 0.18, p.d - 0.06, 0, p.h - 0.09, 0.02),
      box(p.w, p.h + 0.55, 0.08, 0, (p.h + 0.55) / 2, -p.d / 2 + 0.04), box(p.w * 0.38, 0.1, 0.4, -p.w * 0.24, p.h + 0.05, -p.d / 2 + 0.32), box(p.w * 0.38, 0.1, 0.4, p.w * 0.24, p.h + 0.05, -p.d / 2 + 0.32),
    ],
    seat: (p) => ({ y: p.h, z: p.d / 2 - 0.25, x: places(p.w, 0.6) }), top: (p) => p.h },
  { type: "shelf", name: "Shelf", category: "Furniture", icon: "asset-shelf",
    params: [["w", "Width", 0.4, 4, 0.05, 1], ["d", "Depth", 0.2, 0.8, 0.01, 0.35], ["h", "Height", 0.4, 3, 0.05, 1.9]],
    build: (p) => {
      const t = 0.03;
      const shelves = Math.max(2, Math.round(p.h / 0.38));
      const parts = [box(t, p.h, p.d, -p.w / 2 + t / 2, p.h / 2), box(t, p.h, p.d, p.w / 2 - t / 2, p.h / 2), box(p.w, p.h, 0.015, 0, p.h / 2, -p.d / 2 + 0.008)];
      for (let i = 0; i <= shelves; i++) parts.push(box(p.w - 2 * t, t, p.d, 0, Math.min(p.h - t / 2, t / 2 + (i * (p.h - t)) / shelves)));
      return parts;
    },
    top: (p) => p.h },
  { type: "lamp", name: "Floor lamp", category: "Furniture", icon: "asset-lamp",
    params: [["h", "Height", 0.8, 2.4, 0.05, 1.7]],
    build: (p) => [cyl(0.16, 0.18, 0.03, 0, 0.015), cyl(0.015, 0.015, p.h - 0.3, 0, 0.03 + (p.h - 0.3) / 2, 0, 10), cyl(0.12, 0.22, 0.3, 0, p.h - 0.15)] },
  { type: "tv", name: "Screen", category: "Furniture", icon: "asset-tv",
    params: [["w", "Width", 0.4, 3, 0.05, 1.2]],
    build: (p) => {
      const h = p.w * 0.5625;
      return [box(p.w * 1.1, 0.45, 0.4, 0, 0.225), box(p.w, h, 0.05, 0, 0.5 + h / 2, -0.05), box(0.08, 0.06, 0.08, 0, 0.48, -0.05)];
    } },

  // ---------------------------------------------------------------- outdoor and vehicles
  { type: "car", name: "Car", category: "Outdoor", icon: "asset-car",
    params: [["l", "Length", 2.5, 6, 0.05, 4.3], ["w", "Width", 1.4, 2.4, 0.05, 1.8], ["h", "Height", 1.1, 2.2, 0.05, 1.45]],
    // its length along x, the front toward +x
    build: (p) => {
      const r = 0.33;
      const body = p.h * 0.42;
      const parts = [box(p.l, body, p.w, 0, r + body / 2 - 0.08), box(p.l * 0.5, p.h - body - r + 0.08, p.w * 0.88, -p.l * 0.06, r + body - 0.08 + (p.h - body - r + 0.08) / 2)];
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const wheel = cyl(r, r, 0.24, sx * p.l * 0.32, r, sz * (p.w / 2 - 0.1));
        wheel.rotation.x = Math.PI / 2;
        parts.push(wheel);
      }
      return parts;
    } },
  { type: "tree", name: "Tree", category: "Outdoor", icon: "asset-tree",
    params: [["h", "Height", 1.5, 15, 0.1, 4.5], ["crown", "Crown", 0.6, 8, 0.1, 2.4]],
    build: (p) => {
      const trunk = Math.max(0.6, p.h - p.crown * 0.8);
      return [cyl(0.12 * (p.h / 4.5) + 0.04, 0.18 * (p.h / 4.5) + 0.05, trunk, 0, trunk / 2, 0, 14), ball(p.crown / 2, 0, p.h - p.crown / 2, 0, 1, 1.1, 1)];
    } },
  { type: "bush", name: "Bush", category: "Outdoor", icon: "asset-bush",
    params: [["s", "Size", 0.3, 3, 0.05, 1]],
    build: (p) => [ball(p.s * 0.42, 0, p.s * 0.38, 0, 1.2, 0.9, 1), ball(p.s * 0.32, p.s * 0.32, p.s * 0.3, p.s * 0.1, 1, 0.9, 1), ball(p.s * 0.3, -p.s * 0.3, p.s * 0.28, -p.s * 0.08, 1, 0.9, 1)] },
  { type: "rock", name: "Rock", category: "Outdoor", icon: "asset-rock",
    params: [["s", "Size", 0.2, 4, 0.05, 0.8]],
    build: (p) => [at(new THREE.DodecahedronGeometry(p.s / 2, 0), 0, p.s * 0.32, 0, [1.25, 0.7, 1])], top: (p) => p.s * 0.67 },
  { type: "streetlamp", name: "Street lamp", category: "Outdoor", icon: "asset-streetlamp",
    params: [["h", "Height", 2.5, 9, 0.1, 4.5]],
    build: (p) => [cyl(0.12, 0.14, 0.4, 0, 0.2), cyl(0.05, 0.06, p.h - 0.4, 0, 0.4 + (p.h - 0.4) / 2, 0, 12), box(0.9, 0.05, 0.05, 0.42, p.h - 0.05), box(0.36, 0.1, 0.22, 0.82, p.h - 0.12)] },
  { type: "crate", name: "Crate", category: "Outdoor", icon: "asset-crate",
    params: [["s", "Size", 0.2, 2, 0.05, 0.6]],
    build: (p) => {
      const parts = [box(p.s, p.s, p.s, 0, p.s / 2)];
      const e = Math.max(0.02, p.s * 0.06);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(e, p.s + 0.004, e, sx * (p.s / 2 - e / 2 + 0.002), p.s / 2, sz * (p.s / 2 - e / 2 + 0.002)));
      return parts;
    },
    top: (p) => p.s, seat: (p) => ({ y: p.s, z: 0, x: [0] }) },
  { type: "barrel", name: "Barrel", category: "Outdoor", icon: "asset-barrel",
    params: [["r", "Radius", 0.15, 1, 0.01, 0.3], ["h", "Height", 0.3, 2, 0.05, 0.9]],
    build: (p) => [cyl(p.r * 0.92, p.r * 0.92, p.h, 0, p.h / 2), cyl(p.r, p.r, 0.04, 0, p.h * 0.22), cyl(p.r, p.r, 0.04, 0, p.h * 0.78)],
    top: (p) => p.h, seat: (p) => ({ y: p.h, z: 0, x: [0] }) },
  { type: "traffic-cone", name: "Traffic cone", category: "Outdoor", icon: "asset-cone",
    params: [["h", "Height", 0.3, 1.2, 0.01, 0.7]],
    build: (p) => [box(p.h * 0.55, 0.03, p.h * 0.55, 0, 0.015), cyl(0.03, p.h * 0.2, p.h - 0.03, 0, 0.03 + (p.h - 0.03) / 2)] },
];

/**
 * A piece that exists only as a model (models/props): sized by width, height and depth around the
 * model's own, its seat and top scaling with it; until the model loads it stands in as a box.
 */
function modelled(type, name, category, icon, [w, h, d], seat, top) {
  const range = (v) => [Math.round(v * 40) / 100, Math.round(v * 250) / 100];
  return {
    type, name, category, icon, model: true,
    params: [["w", "Width", ...range(w), 0.01, w], ["h", "Height", ...range(h), 0.01, h], ["d", "Depth", ...range(d), 0.01, d]],
    build: (p) => [box(p.w, p.h, p.d, 0, p.h / 2)],
    seat: seat && ((p) => ({ y: seat.y * (p.h / h), z: seat.z * (p.d / d), x: seat.x.map((x) => x * (p.w / w)) })),
    top: top && ((p) => top * (p.h / h)),
  };
}
ASSETS.push(
  modelled("fridge", "Fridge", "Furniture", "asset-shelf", [0.76, 1.82, 0.781], null, 1.82),
  modelled("stove", "Stove", "Furniture", "asset-counter", [0.72, 0.934, 0.717], null, 0.934),
  modelled("kitchen-island", "Kitchen island", "Furniture", "asset-counter", [1.7, 0.92, 0.94], null, 0.92),
  modelled("office-chair", "Office chair", "Furniture", "asset-chair", [0.65, 1.033, 0.621], { y: 0.49, z: 0.035, x: [0.0] }, null),
  modelled("wardrobe", "Wardrobe", "Furniture", "asset-shelf", [1.3, 2.05, 0.692], null, 2.05),
  modelled("bathtub", "Bathtub", "Furniture", "asset-bed", [1.873, 0.838, 0.897], { y: 0.2, z: 0.05, x: [0.0] }, null),
  modelled("piano", "Piano", "Furniture", "asset-counter", [1.5, 1.23, 0.755], null, 1.23),
  modelled("bus-stop", "Bus stop", "Outdoor", "asset-bench", [3.08, 2.3, 1.42], { y: 0.47, z: -0.21, x: [-0.65, 0.0, 0.65] }, null),
  modelled("trash-bin", "Trash bin", "Outdoor", "asset-barrel", [0.62, 1.005, 0.62], null, null),
  modelled("mailbox", "Mailbox", "Outdoor", "asset-streetlamp", [0.49, 1.58, 0.701], null, null),
  modelled("phone-booth", "Phone booth", "Outdoor", "asset-door", [1.02, 2.39, 1.02], null, null),
  modelled("tent", "Tent", "Outdoor", "asset-cone", [2.328, 1.513, 2.909], null, null),
  modelled("campfire", "Campfire", "Outdoor", "asset-rock", [1.24, 0.876, 1.143], null, null),
  modelled("pine-tree", "Pine tree", "Outdoor", "asset-tree", [2.148, 4.0, 2.004], null, null),
  modelled("palm-tree", "Palm tree", "Outdoor", "asset-tree", [3.51, 4.014, 3.564], null, null),
  modelled("rowing-boat", "Rowing boat", "Outdoor", "asset-car", [1.27, 0.55, 3.29], { y: 0.35, z: 0.0, x: [-0.0] }, null),
);

const BY_TYPE = new Map(ASSETS.map((a) => [a.type, a]));
export const assetByType = (type) => BY_TYPE.get(type);
export const ASSET_CATEGORIES = [...new Set(ASSETS.map((a) => a.category))];
/** The categories in the order the library lists them; anything new after. */
export function assetCategories() {
  const order = ["Furniture", "Objects", "Food", "Products", "Studio", "Architecture", "Outdoor", "Vehicles", "Fantasy", "Creatures", "Basic", "Mine"];
  const have = new Set(ASSETS.map((a) => a.category));
  return [...order.filter((c) => have.has(c)), ...[...have].filter((c) => !order.includes(c))];
}

/**
 * The model manifest's word on every piece: themes and tags for the search, a hand's grip for a
 * piece that can be held, and the pieces that exist only as models (they join the catalogue).
 */
export function registerModelAssets(list) {
  for (const a of list) {
    if (a.module) continue;
    let def = BY_TYPE.get(a.type);
    if (!def) {
      if (!Array.isArray(a.size) || a.size.length !== 3) continue;
      def = modelled(a.type, a.name ?? a.type, a.category ?? "Objects", "prop-box", a.size.map((v) => Math.max(0.01, v)), a.seat ?? null, a.top ?? null);
      ASSETS.push(def);
      BY_TYPE.set(a.type, def);
    }
    def.themes = a.themes ?? def.themes ?? [];
    def.tags = a.tags ?? def.tags ?? [];
    if (a.holdable) def.holdable = a.holdable;
  }
}

/**
 * The library's baby animals: each its own rigged model in its own colours, with five clips
 * (stand, sit, lie, walk, hop). On the Stage an animal is a piece of the set that holds a pose,
 * one of its clips; one that travels between keys walks.
 */
export function registerAnimals(list) {
  for (const a of list) {
    if (BY_TYPE.has(a.type) || !Array.isArray(a.size) || a.size.length !== 3) continue;
    const def = modelled(a.type, a.name ?? a.type, "Animals", "prop-box", a.size.map((v) => Math.max(0.01, v)), null, null);
    Object.assign(def, { animal: true, poses: a.clips ?? ["stand"], loops: a.loops ?? [], themes: a.themes ?? ["animals"], tags: a.tags ?? [] });
    ASSETS.push(def);
    BY_TYPE.set(a.type, def);
  }
}
export const isAnimal = (object) => Boolean(object?.userData?.prop && BY_TYPE.get(object.userData.type)?.animal);

let cataloguing = null;
/**
 * Reads the model manifest and lists what it says in the catalogue (once): the pieces that exist only as
 * models, the animals, and every piece's themes and tags. No model is fetched: each comes when a piece asks.
 */
export function loadCatalogue() {
  cataloguing ??= loadManifest().then((models) => {
    if (models.manifest) (registerModelAssets(models.manifest.assets ?? []), registerAnimals(models.manifest.animals ?? []));
    return models;
  });
  return cataloguing;
}

/**
 * An animal in its pose: a held pose is its clip's first frame, a loop plays at `time`, and
 * `walk` (the share of a stride, 0 to 1) walks it whatever its pose.
 */
export function poseAnimal(object, { time = 0, walk = null } = {}) {
  const { mixer, clips } = object.userData;
  if (!mixer || !clips?.length) return;
  const name = walk !== null ? "walk" : object.userData.pose ?? "stand";
  const clip = clips.find((c) => c.name === name) ?? clips.find((c) => c.name === "stand") ?? clips[0];
  if (object.userData.clip !== clip) {
    mixer.stopAllAction();
    mixer.clipAction(clip).play();
    object.userData.clip = clip;
  }
  const loops = BY_TYPE.get(object.userData.type)?.loops?.includes(clip.name);
  mixer.setTime(walk !== null ? (((walk % 1) + 1) % 1) * clip.duration : loops ? time % clip.duration : 0);
  object.updateMatrixWorld(true);
  // what the frame, the picking and the ground see is the pose, not the rest
  object.traverse((o) => o.isSkinnedMesh && (o.computeBoundingBox(), o.computeBoundingSphere()));
}

/** Sets the pose an animal holds (one of its clips). */
export function setAnimalPose(object, pose, time = 0) {
  const def = BY_TYPE.get(object.userData.type);
  if (!def?.animal) throw new Error("Only animals take poses among the set pieces.");
  if (!def.poses.includes(pose)) throw new Error(`No pose "${pose}" for the ${def.name.toLowerCase()}. Poses: ${def.poses.join(", ")}.`);
  object.userData.pose = pose;
  poseAnimal(object, { time });
}

/** An animal's model, skinned and in its own colours, at its size, with its clips ready. */
function animalPiece(def, animal, object) {
  const sizer = new THREE.Group();
  sizer.scale.copy(builtSize(def, object.userData.params).clone().divide(builtSize(def, paramsOf(def.type))));
  const copy = cloneSkinned(animal.scene);
  copy.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    o.frustumCulled = false;
    // the geometry is the model's: it stays when the prop is rebuilt
    o.userData.shared = true;
  });
  sizer.add(copy);
  object.userData.mixer = new THREE.AnimationMixer(copy);
  object.userData.clips = animal.clips;
  object.userData.clip = null;
  return sizer;
}

/** One of the user's own props, as a piece of the catalogue under Mine, kept in its own materials. */
export function registerUserProp(entry) {
  MODELS.props.set(entry.id, { ...entry, keepMaterials: true });
  if (BY_TYPE.has(entry.id)) return;
  const size = entry.size.map((v) => Math.max(0.01, v));
  const def = modelled(entry.id, entry.name, "Mine", "prop-box", size, null, size[1]);
  def.themes = ["mine"];
  def.tags = String(entry.name).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  def.user = true;
  ASSETS.push(def);
  BY_TYPE.set(entry.id, def);
}

export function forgetUserProp(id) {
  MODELS.props.delete(id);
  BY_TYPE.delete(id);
  const i = ASSETS.findIndex((a) => a.type === id);
  if (i >= 0) ASSETS.splice(i, 1);
}
/** [type, name] for every asset, the way the panels list them. */
export const PROP_TYPES = ASSETS.map((a) => [a.type, a.name]);

/** An asset's sizes: its defaults, then what it was given. */
export function paramsOf(type, given = {}) {
  const def = assetByType(type) ?? assetByType("box");
  const out = Object.fromEntries(def.params.map(([k, , , , , v]) => [k, v]));
  for (const [k, , min, max] of def.params) if (Number.isFinite(Number(given[k]))) out[k] = THREE.MathUtils.clamp(Number(given[k]), min, max);
  return out;
}

/** Where a body sits on this prop, in the prop's own frame, or null. */
export const seatOf = (prop) => assetByType(prop.userData.type)?.seat?.(prop.userData.params) ?? null;
/** The height things rest on, in the prop's own frame, or null (then its top). */
export const topOf = (prop) => assetByType(prop.userData.type)?.top?.(prop.userData.params) ?? null;

let count = 0;

// The modelled pieces (models/props) stand in for the built ones whenever their sizes allow: a
// model is scaled to the size the built piece would have, so seats and tops stay where they are.
const SIZES = new Set(["w", "h", "d", "r", "s", "l"]);
// a stool's or a bench's seat is its height; elsewhere the seat is a shape
const AS_SIZE = { stool: ["seat"], bench: ["seat"] };
// stretched, these would widen an opening, the steps or the gaps between posts: built instead
const KEEPS_SHAPE = { doorway: ["w"], window: ["w"], arch: ["w"], fence: ["w"], stairs: ["w"] };
// where a model's frame differs from the built piece's: a turn about y, then an offset
const MODEL_FIX = { stairs: { turn: Math.PI, offset: [0, 0, -0.6] }, streetlamp: { offset: [0.43, 0, 0] } };

// what a model's own parts answer for: a door's leaf swings open on the model itself
const MODEL_PARAMS = { door: ["open"] };

function modelFits(def, params) {
  const defaults = paramsOf(def.type);
  return def.params.every(([k]) => {
    if (Math.abs(params[k] - defaults[k]) < 1e-6) return true;
    if (MODEL_PARAMS[def.type]?.includes(k)) return true;
    if (KEEPS_SHAPE[def.type]?.includes(k)) return false;
    return SIZES.has(k) || AS_SIZE[def.type]?.includes(k);
  });
}
const atDefaults = (def, params) => Object.entries(paramsOf(def.type)).every(([k, v]) => Math.abs(params[k] - v) < 1e-6);

/** A clone of a model's scene in the prop's materials (or its own), its geometry shared. */
function dress(scene, object, keep) {
  const copy = scene.clone(true);
  copy.traverse((o) => {
    if (!o.isMesh) return;
    if (!keep) {
      const key = o.material?.name === "accent" ? "accent" : "material";
      // a sheet (a backdrop's paper, a canopy) shows from behind as well
      o.material = openSurface(o.geometry) ? (object.userData[`${key}Sheet`] ??= Object.assign(object.userData[key].clone(), { side: THREE.DoubleSide })) : object.userData[key];
    }
    o.castShadow = o.receiveShadow = true;
    o.userData.shared = true;
  });
  return copy;
}
/** A model's scene scaled to a box: size [w, h, d], standing at (x, y, z) on its base. */
function fitted(scene, object, from, [w, h, d], [x, y, z]) {
  const g = new THREE.Group();
  g.add(dress(scene, object));
  g.scale.set(w / from[0], h / from[1], d / from[2]);
  g.position.set(x, y, z);
  return g;
}

/**
 * Pieces put together from a model's modules or its walls, once their shape leaves the
 * defaults: a staircase of any steps from its step, a fence of any length from its posts and
 * rails, a doorway or a window wall of any size from the wall's own slab.
 */
const ASSEMBLE = {
  stairs(p, object) {
    const step = MODELS.modules.get("stairs.step");
    if (!step) return null;
    const n = Math.round(p.steps);
    return Array.from({ length: n }, (_, i) => fitted(step.scene, object, step.size, [p.w, p.rise * (i + 1), p.run], [0, 0, -i * p.run]));
  },
  fence(p, object) {
    const post = MODELS.modules.get("fence.post");
    const rail = MODELS.modules.get("fence.rail");
    if (!post || !rail) return null;
    const gaps = Math.max(1, Math.round(p.w / 0.8));
    const s = p.w / gaps;
    const k = p.h / 1.1;
    const out = [];
    for (let i = 0; i <= gaps; i++) out.push(fitted(post.scene, object, post.size, [post.size[0], p.h, post.size[2]], [-p.w / 2 + i * s, 0, 0]));
    for (let i = 0; i < gaps; i++) for (const y of [0.383, 0.867]) out.push(fitted(rail.scene, object, rail.size, [s, rail.size[1], rail.size[2]], [-p.w / 2 + (i + 0.5) * s, y * k, 0]));
    return out;
  },
};
// a doorway's or a window wall's pieces, each box of it made of the wall's slab
for (const type of ["doorway", "window"]) {
  ASSEMBLE[type] = (p, object) => {
    const wall = MODELS.props.get("plane");
    if (!wall) return null;
    const out = [];
    for (const piece of assetByType(type).build(p)) {
      piece.updateMatrixWorld(true);
      const prm = piece.geometry?.parameters;
      if (piece.isMesh && prm?.width !== undefined && prm.depth > 0.02) {
        out.push(fitted(wall.scene, object, wall.size, [prm.width * piece.scale.x, prm.height * piece.scale.y, prm.depth * piece.scale.z], [piece.position.x, piece.position.y - (prm.height * piece.scale.y) / 2, piece.position.z]));
        piece.geometry.dispose();
      } else {
        // glass and anything thin stays as it was built, in the accent
        piece.traverse((o) => o.isMesh && ((o.material = object.userData.accent), (o.castShadow = o.receiveShadow = true)));
        out.push(piece);
      }
    }
    return out;
  };
}

const builtSizes = new Map();
/** The size of the built piece, for these sizes. */
function builtSize(def, params) {
  const key = `${def.type}:${JSON.stringify(params)}`;
  if (!builtSizes.has(key)) {
    const group = new THREE.Group();
    for (const piece of def.build(params)) group.add(piece);
    group.updateMatrixWorld(true);
    builtSizes.set(key, new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3()));
    group.traverse((o) => o.geometry?.dispose());
  }
  return builtSizes.get(key);
}

/** The model of a piece, scaled to these sizes, its materials the prop's own. */
function modelPiece(def, model, object) {
  const ratio = builtSize(def, object.userData.params).clone().divide(builtSize(def, paramsOf(def.type)));
  const sizer = new THREE.Group();
  sizer.scale.copy(ratio);
  const fix = new THREE.Group();
  const f = MODEL_FIX[def.type];
  if (f) {
    fix.rotation.y = f.turn ?? 0;
    fix.position.fromArray(f.offset ?? [0, 0, 0]);
  }
  const copy = dress(model.scene, object, model.keepMaterials);
  // a door's leaf on its hinge, at the left of the frame, swung open
  const open = def.type === "door" ? object.userData.params.open : 0;
  if (open) {
    const hinge = new THREE.Group();
    hinge.position.set(-paramsOf("door").w / 2, 0, 0);
    copy.add(hinge);
    copy.updateMatrixWorld(true);
    const leaf = [];
    copy.traverse((o) => o.isMesh && /slab|panel|handle|lever|escutcheon/.test(o.name) && leaf.push(o));
    for (const o of leaf) hinge.attach(o);
    hinge.rotation.y = THREE.MathUtils.degToRad(-open);
  }
  fix.add(copy);
  sizer.add(fix);
  return sizer;
}

// the models a piece put together from parts needs besides its own (see ASSEMBLE)
const PARTS = { stairs: [["modules", "stairs.step"]], fence: [["modules", "fence.post"], ["modules", "fence.rail"]], doorway: [["props", "plane"]], window: [["props", "plane"]] };
/** Whether a prop of this type is made with the model (kind: "props", "animals" or "modules"; key: its type) that has arrived. */
export const usesModel = (type, kind, key) => ((kind === "props" || kind === "animals") && type === key) || Boolean(PARTS[type]?.some(([k, v]) => k === kind && v === key));

/** (Re)builds the pieces of a prop from its type and sizes, keeping where it stands. */
function fill(object) {
  const def = assetByType(object.userData.type) ?? assetByType("box");
  for (const child of [...object.children]) {
    child.traverse((o) => !o.userData.shared && o.geometry?.dispose());
    object.remove(child);
  }
  const params = object.userData.params;
  // its models are asked for as it is built: until they come it stands in as the built piece
  const apart = !atDefaults(def, params) && !modelFits(def, params) && ASSEMBLE[def.type];
  if (def.animal) wantModel("animals", def.type);
  else {
    wantModel("props", def.type);
    if (apart) for (const [kind, key] of PARTS[def.type]) wantModel(kind, key);
  }
  const model = MODELS.props.get(def.type);
  const animal = def.animal ? MODELS.animals.get(def.type) : null;
  const assembled = model && apart ? apart(params, object) : null;
  object.userData.modelled = Boolean(animal || (model && (assembled || modelFits(def, params))));
  if (animal) {
    object.add(animalPiece(def, animal, object));
    poseAnimal(object);
  } else if (assembled) for (const piece of assembled) object.add(piece);
  else if (object.userData.modelled) object.add(modelPiece(def, model, object));
  else {
    for (const piece of def.build(object.userData.params)) {
      piece.traverse((o) => {
        if (!o.isMesh) return;
        o.material = object.userData.material;
        o.castShadow = o.receiveShadow = true;
      });
      object.add(piece);
    }
  }
  // child meshes point back at their prop, so a click on a table leg picks the table
  object.traverse((o) => {
    if (o !== object) o.userData.propRoot = object;
  });
  object.updateMatrixWorld(true);
}

export function makeProp(type, id, params) {
  // a piece whose model is not here yet keeps its type, standing in as a box until it comes
  const def = assetByType(type) ?? { ...assetByType("box"), type: String(type), name: String(type) };
  const object = new THREE.Group();
  object.name = def.name;
  object.userData = {
    prop: true,
    id: id ?? `prop-${Date.now().toString(36)}-${count++}`,
    type: def.type,
    label: def.name,
    params: paramsOf(def.type, params),
    material: clay(),
    accent: accentClay(),
    keys: [],
    tag: { description: "", refs: [] },
    toJSON: () => ({
      id: object.userData.id,
      type: object.userData.type,
      label: object.userData.label,
      params: { ...object.userData.params },
      position: object.position.toArray(),
      quaternion: object.quaternion.toArray(),
      scale: object.scale.toArray(),
      visible: object.visible,
      keys: object.userData.keys?.length ? object.userData.keys : undefined,
      pose: object.userData.pose ?? undefined,
      tag: object.userData.tag?.description || object.userData.tag?.refs?.length ? object.userData.tag : undefined,
    }),
  };
  fill(object);
  return object;
}

/** Changes some of a prop's sizes and rebuilds it; it stays on the ground where it was. */
export function setPropParams(object, patch) {
  object.userData.params = paramsOf(object.userData.type, { ...object.userData.params, ...patch });
  fill(object);
}

/** Rebuilds a prop as it is (once the models have loaded, a built piece becomes its model). */
export const refillProp = (object) => fill(object);

export function propFromJSON(data) {
  const def = assetByType(data.type) ?? { ...assetByType("box"), type: data.type };
  // a scene from before the assets were parametric keeps the old sizes
  const object = makeProp(def.type, data.id, data.params ?? def.legacy);
  object.userData.label = data.label ?? object.userData.label;
  object.name = object.userData.label;
  object.position.fromArray(data.position ?? [0, 0, 0]);
  object.quaternion.fromArray(data.quaternion ?? [0, 0, 0, 1]);
  object.scale.fromArray(data.scale ?? [1, 1, 1]);
  object.visible = data.visible !== false;
  object.userData.keys = data.keys ? structuredClone(data.keys) : [];
  // what the very thing is, for a render: a few words and pictures (the product, the car); an older one picture is its first
  object.userData.tag = { description: String(data.tag?.description ?? "").slice(0, 600), refs: Array.isArray(data.tag?.refs) ? data.tag.refs.filter((r) => r?.file).slice(0, 8) : data.ref?.file ? [data.ref] : [] };
  // an animal's pose, kept even before its model has come
  if (typeof data.pose === "string") {
    object.userData.pose = data.pose;
    poseAnimal(object);
  }
  // the old box, sphere and cylinder stood on their centre: lift them onto the ground once
  if (!data.params && ["box", "cylinder", "sphere", "plane"].includes(def.type)) {
    const lift = { box: def.legacy?.h ?? 0.6, cylinder: 0.8, sphere: 0.7, plane: 2.2 }[def.type] / 2;
    object.position.y -= lift * object.scale.y;
  }
  return object;
}
