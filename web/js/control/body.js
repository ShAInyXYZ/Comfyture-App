// The mannequin's body, sculpted piece by piece. Each piece is a loft: rings of
// rounded cross-sections along its bone, drawn through a few stations (where a
// muscle bulges, where a waist narrows) by a smooth curve. The pieces end in a
// rounded rim just short of each joint, so a darker ball joint shows in the seam,
// the way an artist's mannequin is built. Sizes are fractions of the height, set
// for a man and shaped by the profile: build, muscle, softness, bust, glutes,
// waist, belly, neck, hands and feet.

import * as THREE from "three";

const cache = new Map();
const TRAITS = ["height", "build", "head", "arms", "legs", "shoulders", "hips", "waist", "chest", "belly", "muscle", "soft", "bust", "glutes", "neck", "hands", "feet"];
const key = (name, p) => `${name}:${TRAITS.map((k) => Number(p[k] ?? 1).toFixed(3)).join(",")}`;
const mix = THREE.MathUtils.lerp;
/** A smooth bump centred at c with half-width s (0 outside it). */
const bump = (t, c, s) => (Math.abs(t - c) >= s ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * (t - c)) / s));

/**
 * A curve through stations [[t, v], ...]: monotone cubic, so a station that is a bulge stays
 * the bulge and nothing overshoots between them.
 */
function curve(points) {
  const n = points.length;
  const t = points.map((p) => p[0]);
  const v = points.map((p) => p[1]);
  const d = [];
  for (let k = 0; k < n - 1; k++) d.push((v[k + 1] - v[k]) / (t[k + 1] - t[k]));
  const m = [d[0]];
  for (let k = 1; k < n - 1; k++) m.push(d[k - 1] * d[k] <= 0 ? 0 : (d[k - 1] + d[k]) / 2);
  m.push(d[n - 2]);
  for (let k = 0; k < n - 1; k++) {
    if (d[k] === 0) { m[k] = 0; m[k + 1] = 0; continue; }
    const a = m[k] / d[k];
    const b = m[k + 1] / d[k];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[k] = tau * a * d[k];
      m[k + 1] = tau * b * d[k];
    }
  }
  return (x) => {
    if (x <= t[0]) return v[0];
    if (x >= t[n - 1]) return v[n - 1];
    let k = 0;
    while (x > t[k + 1]) k++;
    const h = t[k + 1] - t[k];
    const s = (x - t[k]) / h;
    const s2 = s * s;
    const s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * v[k] + (s3 - 2 * s2 + s) * h * m[k] + (-2 * s3 + 3 * s2) * v[k + 1] + (s3 - s2) * h * m[k + 1];
  };
}

/** Cross-sections through stations: rows of {t, w, df, db, z, x}, each column its own curve. */
function sections(rows) {
  const cols = ["w", "df", "db", "z", "x"];
  const curves = Object.fromEntries(cols.map((c) => [c, curve(rows.map((r) => [r.t, r[c] ?? (c === "df" || c === "db" ? r.w : 0)]))]));
  return (t) => Object.fromEntries(cols.map((c) => [c, curves[c](t)]));
}

/**
 * How a piece ends: over the first `a` of its length it rises from `fa` of its size (0 is a
 * round end, 0.8 a rounded rim at a seam), and over the last `b` it falls to `fb`.
 */
function ends(t, a, b, fa, fb) {
  const up = a > 0 && t < a ? fa + (1 - fa) * Math.sqrt(Math.max(0, 1 - (1 - t / a) ** 2)) : 1;
  const down = b > 0 && t > 1 - b ? fb + (1 - fb) * Math.sqrt(Math.max(0, 1 - ((t - (1 - b)) / b) ** 2)) : 1;
  return Math.min(up, down);
}

/**
 * A loft along +Y from y0 to y1. ring(t) gives the cross-section at t (0 to 1): half-width w
 * (along x), half-depth in front df and behind db (along z), a centre offset (x, z). n is the
 * roundness (2 an ellipse, more is squarer). The ends close with flat caps of their own.
 */
function loft(y0, y1, ring, { rings = 26, sides = 32, n = 2.1, round = [0.1, 0.1], floor = [0, 0] } = {}) {
  const e = 2 / n;
  const rows = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const r = ring(t);
    const k = ends(t, round[0], round[1], floor[0], floor[1]);
    const y = mix(y0, y1, t);
    const row = [];
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      row.push([
        Math.sign(c) * Math.abs(c) ** e * r.w * k + r.x,
        y,
        Math.sign(s) * Math.abs(s) ** e * (s >= 0 ? r.df : r.db) * k + r.z,
      ]);
    }
    rows.push({ row, centre: [r.x, y, r.z] });
  }
  const pos = [];
  const idx = [];
  for (const { row } of rows) for (const p of row) pos.push(...p);
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j;
      const b = i * sides + ((j + 1) % sides);
      idx.push(a, a + sides, b, b, a + sides, b + sides);
    }
  }
  const cap = (k, top) => {
    const base = pos.length / 3;
    pos.push(...rows[k].centre);
    for (const p of rows[k].row) pos.push(...p);
    for (let j = 0; j < sides; j++) {
      const p = base + 1 + j;
      const q = base + 1 + ((j + 1) % sides);
      if (top) idx.push(base, q, p);
      else idx.push(base, p, q);
    }
  };
  cap(0, false);
  cap(rings, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** An ellipsoid (a scaled sphere), for the ball joints, a deltoid, a bust. */
function blob(rx, ry, rz) {
  const g = new THREE.SphereGeometry(1, 28, 18);
  g.scale(rx, ry, rz);
  return g;
}

/** Turns a piece built along +Y to run forward (+Z) and stand up on its +z side: x→−x, y→z, z→y. */
const FORWARD = new THREE.Matrix4().set(-1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);

/** The traits a profile carries, with their defaults. */
export function traits(p) {
  return {
    H: p.height, build: p.build ?? 1, head: p.head ?? 1, arms: p.arms ?? 1, legs: p.legs ?? 1,
    shoulders: p.shoulders ?? 1, hips: p.hips ?? 1, waist: p.waist ?? 1, chest: p.chest ?? 1, belly: p.belly ?? 1,
    muscle: p.muscle ?? 1, soft: p.soft ?? 1, bust: p.bust ?? 0, glutes: p.glutes ?? 1, neck: p.neck ?? 1, hands: p.hands ?? 1, feet: p.feet ?? 1,
  };
}

/** Where the head sits in the Head joint's frame, for the pose keypoints: its centre and its half-height. */
export function headFrame(p) {
  const { H, head } = traits(p);
  return { centre: new THREE.Vector3(0, 0.052 * H * head, 0.012 * H * head), radius: 0.066 * H * head };
}

/**
 * The pieces of a body, each as [joint, geometry, material ("plate" or "joint")]. Geometries
 * are in the joint's frame at rest, built from the profile and cached by it.
 */
export function bodyParts(p) {
  const T = traits(p);
  const { H, build } = T;
  const m = T.muscle - 1;
  const f = T.soft;
  const belly = T.belly - 1;
  const glutes = T.glutes - 1;
  // girth: the frame (build) and the flesh on it (softness)
  const g = build * f ** 0.7;
  const sh = T.shoulders ** 0.6;
  const parts = [];
  const add = (joint, name, make, material = "plate") => {
    const id = key(`${joint}:${name}`, p);
    if (!cache.has(id)) cache.set(id, make());
    parts.push([joint, cache.get(id), material]);
  };
  // stations are written in fractions of the height; scale(rows) turns them into metres
  const scale = (rows, sx = 1, sz = 1) => rows.map((r) => ({ t: r.t, w: r.w * H * sx, df: (r.df ?? r.w) * H * sz, db: (r.db ?? r.w) * H * sz, z: (r.z ?? 0) * H, x: (r.x ?? 0) * H }));

  // ---------------------------------------------------------------- the trunk
  // three plates, with a seam under the ribcage and one at the belt
  // pelvis: from the crotch to the belt, widest at the hips, the buttocks behind
  const B = Math.max(0, belly);
  add("Hips", "pelvis", () => {
    const rows = [
      { t: 0, w: 0.048, df: 0.032, db: 0.038 },
      { t: 0.2, w: 0.083 * T.hips, df: 0.05, db: 0.062 + 0.014 * glutes },
      { t: 0.42, w: 0.096 * T.hips, df: 0.056, db: 0.071 + 0.026 * glutes },
      { t: 0.68, w: 0.092 * mix(T.hips, T.waist, 0.3), df: 0.056, db: 0.063 + 0.012 * glutes },
      { t: 1, w: 0.079 * mix(T.hips, T.waist, 0.6), df: 0.055, db: 0.054 },
    ];
    return loft(-0.084 * H, 0.0635 * H, sections(scale(rows, g, g)), { round: [0.2, 0.025], floor: [0.35, 0.93], n: 2.25 });
  });
  // abdomen: the waist, narrowest a third of the way up; a belly rounds its front, and a big
  // one reaches down over the belt and curls under
  add("Spine", "abdomen", () => {
    const big = THREE.MathUtils.smoothstep(B, 0.35, 0.85);
    const y0 = (-0.008 - 0.075 * big) * H;
    const y1 = 0.08 * H;
    const at = (y) => THREE.MathUtils.clamp((y * H - y0) / (y1 - y0), 0, 1);
    const rows = [
      ...(big > 0.01 ? [{ t: 0, w: 0.072 * T.waist, df: 0.048, db: 0.046 }] : []),
      { t: at(-0.009), w: 0.078 * mix(T.waist, T.hips, 0.3), df: 0.055, db: 0.054 },
      { t: at(0.018), w: 0.073 * T.waist, df: 0.056, db: 0.051 },
      { t: at(0.06), w: 0.08 * mix(T.waist, 1, 0.3), df: 0.06, db: 0.055 },
      { t: 1, w: 0.084 * mix(T.waist, 1, 0.4), df: 0.062, db: 0.057 },
    ];
    const base = sections(scale(rows, g, g));
    const yc = mix(0.015, -0.025, big) * H;
    const span = (0.05 + 0.06 * B) * H;
    const k = build * f ** 0.5;
    const ring = (t) => {
      const r = base(t);
      const y = mix(y0, y1, t);
      r.df += 0.05 * B * H * k * bump(y, yc, span);
      return r;
    };
    return loft(y0, y1, ring, { rings: 30, round: [mix(0.03, 0.42, big), 0.03], floor: [mix(0.93, 0, big), 0.93], n: 2.2 });
  });
  // ribcage: widening to the armpits (the lats), the pecs in front, rounding off under the neck
  add("Chest", "ribcage", () => {
    const rows = [
      { t: 0, w: 0.085 * mix(T.waist, 1, 0.5), df: 0.063, db: 0.058 },
      { t: 0.17, w: 0.088 * mix(T.waist, 1, 0.75) * (1 + 0.04 * m), df: (0.071 + 0.012 * m) * T.chest, db: 0.061 },
      { t: 0.42, w: 0.091 * sh * (1 + 0.09 * m), df: (0.07 + 0.008 * m) * T.chest, db: 0.066 * (1 + 0.05 * m) },
      { t: 0.66, w: 0.086 * sh * (1 + 0.05 * m), df: 0.061 * T.chest, db: 0.065 },
      { t: 0.86, w: 0.06 * sh, df: 0.044, db: 0.054, z: -0.005 },
      { t: 1, w: 0.036, df: 0.028, db: 0.04, z: -0.006 },
    ];
    return loft(-0.0065 * H, 0.128 * H, sections(scale(rows, build * f ** 0.5, build * f ** 0.6)), { round: [0.025, 0.16], floor: [0.93, 0.45], n: 2.3 });
  });
  // a bust, on the chest's front, a little apart, turned out and down
  if (T.bust > 0.05) {
    for (const side of [-1, 1]) {
      add("Chest", `bust${side}`, () => {
        const r = 0.034 * H * Math.sqrt(T.bust) * f ** 0.5;
        const surface = (0.071 + 0.012 * m) * T.chest * build * f ** 0.6 * H;
        const b = blob(r * 1.08, r, r * 0.68);
        b.rotateX(0.3);
        b.rotateY(side * 0.25);
        b.translate(side * 0.044 * H * sh * build, 0.006 * H, surface - 0.25 * r * 0.68);
        return b;
      });
    }
  }
  // trapezius and collarbone: the slope from the neck down to each shoulder
  for (const [joint, side] of [["LeftShoulder", 1], ["RightShoulder", -1]]) {
    add(joint, "shoulder", () => {
      const len = 0.08 * H * T.shoulders;
      // x is the height of the slope (the piece is turned to lie along the shoulder)
      const rows = [
        { t: 0, w: 0.027 * (1 + 0.12 * m), df: 0.034, db: 0.044, x: -side * 0.02 },
        { t: 0.5, w: 0.026 * (1 + 0.12 * m), df: 0.038, db: 0.046, x: -side * 0.011 },
        { t: 1, w: 0.023, df: 0.033, db: 0.038, x: -side * 0.002 },
      ];
      const piece = loft(-0.014 * H, len, sections(scale(rows, build * f ** 0.4, build * f ** 0.5)), { rings: 16, sides: 26, round: [0.2, 0.25], floor: [0.4, 0.5] });
      piece.rotateZ(-side * Math.PI / 2);
      return piece;
    });
  }
  // neck: a column, flaring a little into the shoulders
  add("Neck", "neck", () => {
    const rows = [
      { t: 0, w: 0.036, db: 0.039 },
      { t: 0.35, w: 0.031, db: 0.033 },
      { t: 1, w: 0.03, db: 0.032 },
    ];
    const k = T.neck * build * f ** 0.3;
    return loft(-0.03 * H, 0.065 * H, sections(scale(rows, k, k).map((r) => ({ ...r, z: -0.002 * H }))), { rings: 14, sides: 28, round: [0.1, 0.1], floor: [0.6, 0.6] });
  });
  // head: an egg, rounder behind; the jaw narrows forward to the chin
  add("Head", "skull", () => {
    const { centre, radius: r } = headFrame(p);
    const rows = [
      { t: 0, w: 0.2, df: 0.26, db: 0.18, z: 0.46 },
      { t: 0.1, w: 0.39, df: 0.4, db: 0.36, z: 0.38 },
      { t: 0.26, w: 0.58, df: 0.56, db: 0.56, z: 0.22 },
      { t: 0.44, w: 0.69, df: 0.72, db: 0.8, z: 0.06 },
      { t: 0.62, w: 0.73, df: 0.78, db: 0.9, z: 0 },
      { t: 0.8, w: 0.7, df: 0.67, db: 0.86, z: -0.02 },
      { t: 0.93, w: 0.52, df: 0.44, db: 0.6, z: -0.04 },
      { t: 1, w: 0.22, df: 0.2, db: 0.26, z: -0.04 },
    ].map((s) => ({ t: s.t, w: s.w * r, df: s.df * r, db: s.db * r, z: centre.z + s.z * r, x: 0 }));
    return loft(centre.y - r * 1.02, centre.y + r * 1.02, sections(rows), { rings: 30, sides: 36, round: [0.06, 0.07], floor: [0, 0] });
  });
  // the trunk's seams, at the belt and under the ribcage
  add("Spine", "waist-ball", () => blob(0.066 * H * T.waist * g, 0.015 * H, 0.045 * H * g).translate(0, -0.0105 * H, 0), "joint");
  add("Chest", "chest-ball", () => blob(0.068 * H * mix(T.waist, 1, 0.5) * g, 0.014 * H, 0.05 * H * g).translate(0, -0.0085 * H, 0), "joint");
  add("Neck", "neck-ball", () => blob(0.032 * H * T.neck * build, 0.016 * H, 0.032 * H * T.neck * build), "joint");

  // ---------------------------------------------------------------- arms
  for (const [s, side] of [["Left", 1], ["Right", -1]]) {
    const turn = (piece) => (piece.rotateZ(-side * Math.PI / 2), piece);
    const upper = 0.186 * H * T.arms;
    const fore = 0.146 * H * T.arms;
    const hand = 0.108 * H * T.arms * T.hands;
    const limb = build * f ** 0.7;
    // deltoid: the round cap over the shoulder joint
    add(`${s}Arm`, "deltoid", () => {
      const r = 0.036 * H * build * f ** 0.5 * (1 + 0.22 * m);
      return blob(r * 1.1, r, r * 0.98).translate(side * 0.006 * H, 0, 0);
    });
    // upper arm: the biceps in front, the triceps behind, tapering to the elbow
    add(`${s}Arm`, "upper", () => {
      const rows = [
        { t: 0, w: 0.032, df: 0.032, db: 0.033 },
        { t: 0.4, w: 0.029 * (1 + 0.1 * m), df: 0.031 * (1 + 0.24 * m), db: 0.031 * (1 + 0.14 * m) },
        { t: 0.82, w: 0.025, df: 0.025 * (1 + 0.06 * m), db: 0.026 },
        { t: 1, w: 0.0245, df: 0.0245, db: 0.025 },
      ];
      return turn(loft(0.028 * H, upper - 0.005 * H, sections(scale(rows, limb, limb)), { round: [0.12, 0.07], floor: [0.5, 0.82] }));
    });
    // forearm: full near the elbow, flat and slim at the wrist
    add(`${s}ForeArm`, "fore", () => {
      const rows = [
        { t: 0, w: 0.024, df: 0.025, db: 0.025 },
        { t: 0.22, w: 0.025 * (1 + 0.1 * m), df: 0.027 * (1 + 0.14 * m), db: 0.027 * (1 + 0.1 * m) },
        { t: 0.7, w: 0.018, df: 0.022, db: 0.022 },
        { t: 1, w: 0.013, df: 0.019, db: 0.019 },
      ];
      return turn(loft(0.005 * H, fore - 0.005 * H, sections(scale(rows, build * f ** 0.4, build * f ** 0.4)), { round: [0.07, 0.07], floor: [0.84, 0.85] }));
    });
    // hand: a mitten, thicker at the palm, widest at the knuckles, round at the fingertips
    add(`${s}Hand`, "hand", () => {
      const rows = [
        { t: 0, w: 0.0125, df: 0.019 },
        { t: 0.3, w: 0.014, df: 0.025 },
        { t: 0.56, w: 0.0115, df: 0.027 },
        { t: 0.82, w: 0.0095, df: 0.025 },
        { t: 1, w: 0.0085, df: 0.021 },
      ];
      const k = T.hands * build;
      return turn(loft(0.004 * H, hand, sections(scale(rows, k * f ** 0.3, k)), { rings: 20, sides: 28, round: [0.08, 0.2], floor: [0.8, 0], n: 2.5 }));
    });
    // thumb: from the base of the palm, forward and along the hand
    add(`${s}Hand`, "thumb", () => {
      const k = T.hands * build;
      const rows = [{ t: 0, w: 0.0098 }, { t: 0.5, w: 0.009 }, { t: 1, w: 0.0076 }];
      const piece = loft(0, 0.044 * H * T.hands, sections(scale(rows, k, k)), { rings: 12, sides: 18, round: [0.2, 0.35], floor: [0.4, 0] });
      piece.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(side * 0.72, -0.22, 0.66).normalize()));
      piece.translate(side * 0.02 * H * T.hands, -0.004 * H, 0.012 * H * k);
      return piece;
    });
    add(`${s}ForeArm`, "elbow", () => blob(0.021 * H * limb, 0.021 * H * limb, 0.021 * H * limb), "joint");
    add(`${s}Hand`, "wrist", () => blob(0.012 * H * build, 0.0105 * H * build, 0.0155 * H * build), "joint");
  }

  // ---------------------------------------------------------------- legs
  for (const [s, side] of [["Left", 1], ["Right", -1]]) {
    const down = (piece) => (piece.rotateZ(Math.PI), piece);
    const thigh = 0.245 * H * T.legs;
    const shin = 0.246 * H * T.legs;
    const flesh = build * f ** 0.8;
    // thigh: full at the top, the quadriceps in front, tapering to the knee
    add(`${s}UpLeg`, "thigh", () => {
      const rows = [
        { t: 0, w: 0.051 * T.hips ** 0.5, df: 0.053, db: 0.055 },
        { t: 0.16, w: 0.056 * T.hips ** 0.5, df: 0.058, db: 0.06 + 0.01 * glutes },
        { t: 0.5, w: 0.045 * (1 + 0.06 * m), df: 0.049 * (1 + 0.16 * m), db: 0.046 },
        { t: 0.86, w: 0.035, df: 0.035, db: 0.034 },
        { t: 1, w: 0.032, df: 0.033, db: 0.032 },
      ];
      return down(loft(-0.004 * H, thigh - 0.006 * H, sections(scale(rows, flesh, flesh)), { round: [0.1, 0.05], floor: [0.5, 0.84] }));
    });
    // shin: the calf high behind, slim at the ankle
    add(`${s}Leg`, "shin", () => {
      const rows = [
        { t: 0, w: 0.032, df: 0.031, db: 0.032 },
        { t: 0.24, w: 0.035 * (1 + 0.06 * m), df: 0.031, db: 0.046 * (1 + 0.2 * m) },
        { t: 0.6, w: 0.027, df: 0.025, db: 0.029 },
        { t: 1, w: 0.021, df: 0.02, db: 0.021 },
      ];
      return down(loft(0.006 * H, shin - 0.016 * H, sections(scale(rows, build * f ** 0.6, build * f ** 0.6)), { round: [0.05, 0.06], floor: [0.85, 0.85] }));
    });
    // foot: heel to the ball, standing on its sole 0.039 h under the ankle; the toes are their own piece
    add(`${s}Foot`, "foot", () => {
      const sole = -0.039;
      const top = [[0, -0.003, 0.021], [0.22, 0.013, 0.024], [0.6, 0, 0.031], [1, -0.011, 0.035]];
      const rows = top.map(([t, y, w]) => ({ t, w: w * T.feet * build, df: (y - sole) / 2, db: (y - sole) / 2, z: (y + sole) / 2 }));
      const piece = loft(-0.037 * H * T.feet, 0.079 * H * T.feet, sections(scale(rows)), { rings: 22, sides: 30, round: [0.24, 0.05], floor: [0.25, 0.86], n: 2.6 });
      return piece.applyMatrix4(FORWARD);
    });
    // toes: a rounded toe box, from the ball of the foot
    add(`${s}Toe`, "toes", () => {
      const sole = -0.004;
      const top = [[0, 0.021, 0.034], [0.5, 0.018, 0.033], [1, 0.011, 0.029]];
      const rows = top.map(([t, y, w]) => ({ t, w: w * T.feet * build, df: (y - sole) / 2, db: (y - sole) / 2, z: (y + sole) / 2 }));
      const piece = loft(-0.004 * H, 0.04 * H * T.feet, sections(scale(rows)), { rings: 14, sides: 30, round: [0.08, 0.5], floor: [0.85, 0.1], n: 2.6 });
      return piece.applyMatrix4(FORWARD);
    });
    add(`${s}UpLeg`, "hip", () => blob(0.04 * H * flesh, 0.04 * H * flesh, 0.04 * H * flesh), "joint");
    add(`${s}Leg`, "knee", () => blob(0.028 * H * build * f ** 0.6, 0.028 * H * build * f ** 0.6, 0.029 * H * build * f ** 0.6), "joint");
    add(`${s}Foot`, "ankle", () => blob(0.02 * H * build, 0.02 * H * build, 0.02 * H * build), "joint");
  }
  return parts;
}
