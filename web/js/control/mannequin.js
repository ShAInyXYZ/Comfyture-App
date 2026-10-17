// A wooden artist's mannequin: a joint hierarchy (one Object3D per joint, named
// after skeleton.js) with clay segments and ball joints hung on it, tinted with
// the character's colour. The pose is a base (each joint's local rotation) with
// the pose sliders laid over it; the profile sets the segment lengths and widths.

import * as THREE from "three";
import { JOINTS, JOINT_NAMES, SEGMENTS, HINGES, CONES, CHAINS, MIRROR, DEFAULT_PROFILE, bodyById } from "./skeleton.js";

const CLAY = new THREE.Color("#b9b5ae");
/** The character's colour as clay: still matte and light, but no two bodies alike. */
const tint = (color) => color.clone().lerp(CLAY, 0.32);
const geometryCache = new Map();
const unitSphere = () => geometryCache.get("sphere") ?? geometryCache.set("sphere", new THREE.SphereGeometry(1, 28, 18)).get("sphere");
function capsule(radius, length) {
  const key = `capsule:${radius.toFixed(4)}:${length.toFixed(4)}`;
  if (!geometryCache.has(key)) geometryCache.set(key, new THREE.CapsuleGeometry(radius, length, 6, 18));
  return geometryCache.get(key);
}

let count = 0;

export class Mannequin {
  constructor({ id, name, color, profile, body } = {}) {
    this.id = id ?? `char-${Date.now().toString(36)}-${count++}`;
    this.name = name ?? "Character";
    this.color = new THREE.Color(color ?? "#e8584f");
    this.body = bodyById(body) ? body : "man";
    this.profile = { ...DEFAULT_PROFILE, ...(bodyById(this.body)?.profile ?? {}), ...profile };
    this.root = new THREE.Group();
    this.root.name = this.id;
    this.root.userData.character = this;
    this.joints = {};
    this.parts = [];
    this.base = {};
    this.params = {};
    // timeline keys: [{ t, position, quaternion, pose, params }]
    this.keys = [];
    this.material = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0 });
    this.ballMaterial = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    this.setColor(this.color);
    this.build();
  }

  /** A new colour for the clay and the joints. */
  setColor(color) {
    this.color = new THREE.Color(color);
    this.material.color.copy(tint(this.color));
    this.ballMaterial.color.copy(tint(this.color).multiplyScalar(0.82));
  }

  /** One of the body types, keeping the pose; its proportions can be tuned after. */
  setBody(id) {
    const type = bodyById(id);
    if (!type) return;
    this.body = id;
    this.profile = { ...DEFAULT_PROFILE, ...type.profile };
    this.build();
  }

  /** Changes some proportions (height, build, shoulders...) and rebuilds, keeping the pose. */
  setProfile(patch) {
    this.profile = { ...this.profile, ...patch };
    this.build();
  }

  /** Builds (or rebuilds) the joints and segments from the profile, keeping the pose. */
  build() {
    for (const j of Object.values(this.joints)) j.removeFromParent();
    this.joints = {};
    this.parts = [];
    const p = this.profile;
    const h = p.height;
    for (const [name, parent, offset] of JOINTS) {
      const joint = new THREE.Group();
      joint.name = name;
      joint.userData.joint = name;
      joint.userData.rest = new THREE.Vector3(...offset(p)).multiplyScalar(h);
      joint.position.copy(joint.userData.rest);
      (parent ? this.joints[parent] : this.root).add(joint);
      this.joints[name] = joint;
    }
    for (const [name, kind, radius] of SEGMENTS) this.addSegment(name, kind, radius * h * p.build);
    this.apply();
  }

  /** The clay piece a joint owns: from the joint toward its child (or a head, a hand, a foot). */
  addSegment(name, kind, r) {
    const joint = this.joints[name];
    const p = this.profile;
    const h = p.height;
    const child = Object.values(this.joints).find((j) => j.parent === joint && !j.name.endsWith("Shoulder") && !j.name.endsWith("UpLeg"));
    const to = child ? child.userData.rest.clone() : new THREE.Vector3(0, 0.1 * h, 0);
    const piece = (geometry, position, scale, quaternion) => {
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.position.copy(position);
      mesh.scale.copy(scale);
      if (quaternion) mesh.quaternion.copy(quaternion);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.joint = name;
      mesh.userData.character = this;
      joint.add(mesh);
      this.parts.push(mesh);
      return mesh;
    };
    const along = (v) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());
    if (kind === "head") {
      const s = 0.066 * h * p.head;
      piece(unitSphere(), new THREE.Vector3(0, s * 1.05, s * 0.06), new THREE.Vector3(s * 0.86, s * 1.12, s * 0.96));
    } else if (kind === "pelvis") {
      piece(unitSphere(), new THREE.Vector3(0, 0.012 * h, 0), new THREE.Vector3(r * 1.12 * p.hips, r * 0.72, r * 0.74 * Math.max(1, (p.belly + p.hips) / 2)));
    } else if (kind === "waist") {
      piece(unitSphere(), to.clone().multiplyScalar(0.5), new THREE.Vector3(r * 0.92 * p.waist, to.length() * 0.6, r * 0.68 * p.belly));
    } else if (kind === "chest") {
      piece(unitSphere(), new THREE.Vector3(0, to.y * 0.52, 0.004 * h * p.chest), new THREE.Vector3(r * 1.16 * p.shoulders, to.y * 0.6, r * 0.72 * p.chest));
    } else if (kind === "hand") {
      const dir = Math.sign(joint.userData.rest.x) || 1;
      piece(unitSphere(), new THREE.Vector3(dir * 0.045 * h * p.arms, 0, 0), new THREE.Vector3(0.048 * h * p.arms, r * 0.55, r * 1.25));
    } else if (kind === "foot") {
      piece(unitSphere(), new THREE.Vector3(0, -0.025 * h, 0.035 * h), new THREE.Vector3(r * 1.05, r * 0.9, 0.075 * h));
    } else if (kind === "toe") {
      piece(unitSphere(), new THREE.Vector3(0, 0, 0.022 * h), new THREE.Vector3(r * 1.05, r * 0.6, 0.035 * h));
    } else {
      // a limb, the neck, a clavicle: a capsule from the joint to its child, sized for real
      // (scaling a capsule would squash its round ends)
      const len = to.length();
      piece(capsule(r, Math.max(0.001, len - r)), to.clone().multiplyScalar(0.5), new THREE.Vector3(1, 1, 1), along(to));
    }
    // ball joints at the elbows, knees, wrists, ankles, shoulders and hips
    if (["LeftForeArm", "RightForeArm", "LeftLeg", "RightLeg", "LeftArm", "RightArm", "LeftUpLeg", "RightUpLeg", "LeftHand", "RightHand", "LeftFoot", "RightFoot", "Neck"].includes(name)) {
      const ball = new THREE.Mesh(unitSphere(), this.ballMaterial);
      ball.scale.setScalar(r * 1.08);
      ball.castShadow = true;
      ball.userData.joint = name;
      ball.userData.character = this;
      joint.add(ball);
      this.parts.push(ball);
    }
  }

  /** The base pose (before the sliders): every joint's local rotation, as [x, y, z, w]. */
  getPose() {
    return Object.fromEntries(JOINT_NAMES.map((n) => [n, (this.base[n] ?? new THREE.Quaternion()).toArray().map((v) => Math.round(v * 1e5) / 1e5)]));
  }

  /** The pose as it shows, sliders and all. */
  getFinalPose() {
    return Object.fromEntries(JOINT_NAMES.map((n) => [n, this.joints[n].quaternion.toArray().map((v) => Math.round(v * 1e5) / 1e5)]));
  }

  setPose(pose) {
    for (const n of JOINT_NAMES) this.base[n] = new THREE.Quaternion().fromArray(pose[n] ?? [0, 0, 0, 1]);
    this.apply();
  }

  /** A pose written as Euler degrees per joint (XYZ), the way presets are authored. */
  setEulerPose(degrees) {
    const d = THREE.MathUtils.degToRad;
    for (const n of JOINT_NAMES) {
      const e = degrees[n];
      this.base[n] = new THREE.Quaternion().setFromEuler(e ? new THREE.Euler(d(e[0] ?? 0), d(e[1] ?? 0), d(e[2] ?? 0), "XYZ") : new THREE.Euler());
    }
    this.apply();
  }

  /** Sets some pose sliders (degrees; crouch 0 to 1) and shows the result. */
  setParams(patch) {
    this.params = { ...this.params, ...patch };
    for (const [k, v] of Object.entries(this.params)) if (!v) delete this.params[k];
    this.apply();
  }

  /** Writes base and sliders into the joints. */
  apply() {
    const deltas = paramDeltas(this.params);
    for (const n of JOINT_NAMES) {
      const base = this.base[n] ?? new THREE.Quaternion();
      this.joints[n].quaternion.copy(deltas[n] ? deltas[n].clone().multiply(base) : base);
    }
    this.root.updateMatrixWorld(true);
  }

  /** Takes what the joints show now (after a drag, IK or an import) as the base, the sliders still laid over it. */
  absorb(names = JOINT_NAMES) {
    const deltas = paramDeltas(this.params);
    for (const n of names) {
      const q = this.joints[n].quaternion.clone();
      this.base[n] = deltas[n] ? deltas[n].clone().invert().multiply(q) : q;
    }
  }

  /** The pose seen in a mirror: left and right swap, and every turn flips across the body's middle. */
  mirror() {
    const pose = this.getPose();
    const flipped = {};
    for (const n of JOINT_NAMES) {
      const [x, y, z, w] = pose[MIRROR[n]];
      flipped[n] = [x, -y, -z, w];
    }
    const params = { ...this.params };
    for (const k of ["look", "tilt", "twist", "side", "step", "swing"]) if (params[k]) params[k] = -params[k];
    this.params = params;
    this.setPose(flipped);
  }

  /** Keeps a joint's rotation inside its limits: hinges on their axis and range, ball joints within a cone. */
  constrain(name) {
    const joint = this.joints[name];
    const hinge = HINGES[name];
    if (hinge) {
      const axis = new THREE.Vector3(...hinge.axis);
      // twist-swing split: keep only the turn about the hinge axis
      const q = joint.quaternion;
      const proj = axis.clone().multiplyScalar(axis.dot(new THREE.Vector3(q.x, q.y, q.z)));
      const twist = new THREE.Quaternion(proj.x, proj.y, proj.z, q.w).normalize();
      let angle = 2 * Math.atan2(new THREE.Vector3(twist.x, twist.y, twist.z).dot(axis), twist.w);
      angle = THREE.MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;
      const deg = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(angle), hinge.min, hinge.max);
      joint.quaternion.setFromAxisAngle(axis, THREE.MathUtils.degToRad(deg));
    } else if (CONES[name] !== undefined) {
      const max = THREE.MathUtils.degToRad(CONES[name]);
      const angle = 2 * Math.acos(THREE.MathUtils.clamp(Math.abs(joint.quaternion.w), -1, 1));
      if (angle > max) joint.quaternion.slerp(new THREE.Quaternion(), 1 - max / angle);
    }
    joint.updateMatrixWorld(true);
    this.absorb([name]);
  }

  /**
   * Two-bone IK: turns the chain's root and middle so the effector (a hand or a
   * foot) reaches the target, bending in the plane the limb already bends in.
   */
  reach(effector, target) {
    const chain = CHAINS[effector];
    if (!chain) return;
    const A = this.joints[chain.root];
    const B = this.joints[chain.mid];
    const C = this.joints[effector];
    this.root.updateMatrixWorld(true);
    const a = A.getWorldPosition(new THREE.Vector3());
    const b = B.getWorldPosition(new THREE.Vector3());
    const c = C.getWorldPosition(new THREE.Vector3());
    const l1 = a.distanceTo(b);
    const l2 = b.distanceTo(c);
    const toTarget = target.clone().sub(a);
    const dist = THREE.MathUtils.clamp(toTarget.length(), Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
    const dir = toTarget.normalize();
    // which way the middle joint bends: as it bends now, else the chain's natural pole
    let pole = b.clone().sub(a).sub(dir.clone().multiplyScalar(b.clone().sub(a).dot(dir)));
    if (pole.lengthSq() < 1e-8) {
      pole = new THREE.Vector3(...chain.pole).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()));
      pole.sub(dir.clone().multiplyScalar(pole.dot(dir)));
    }
    pole.normalize();
    const cosA = THREE.MathUtils.clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    const bTarget = a.clone().add(dir.clone().multiplyScalar(cosA * l1)).add(pole.multiplyScalar(sinA * l1));
    const cTarget = a.clone().add(dir.multiplyScalar(dist));
    aim(A, b, a, bTarget);
    A.updateMatrixWorld(true);
    const b2 = B.getWorldPosition(new THREE.Vector3());
    aim(B, C.getWorldPosition(new THREE.Vector3()), b2, cTarget);
    this.root.updateMatrixWorld(true);
    this.absorb([chain.root, chain.mid]);
  }

  /** Box around the whole body in world space. */
  bounds() {
    return new THREE.Box3().setFromObject(this.root);
  }

  /** Box around the head, for close-ups. */
  headBounds() {
    return new THREE.Box3().setFromObject(this.joints.Head);
  }

  /** Puts the lowest point of the body on the ground (y = 0). */
  ground() {
    this.root.updateMatrixWorld(true);
    const box = this.bounds();
    this.root.position.y -= box.min.y;
    this.root.updateMatrixWorld(true);
  }

  setVisible(on) {
    this.root.visible = on;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      color: `#${this.color.getHexString()}`,
      body: this.body,
      profile: this.profile,
      position: this.root.position.toArray(),
      quaternion: this.root.quaternion.toArray(),
      pose: this.getPose(),
      params: { ...this.params },
      posed: this.posed,
      visible: this.root.visible,
      keys: this.keys?.length ? this.keys : undefined,
    };
  }

  static fromJSON(data) {
    const m = new Mannequin(data);
    m.root.position.fromArray(data.position ?? [0, 0, 0]);
    m.root.quaternion.fromArray(data.quaternion ?? [0, 0, 0, 1]);
    m.params = { ...(data.params ?? {}) };
    if (data.pose) m.setPose(data.pose);
    else m.apply();
    m.posed = data.posed;
    m.root.visible = data.visible !== false;
    m.keys = data.keys ? structuredClone(data.keys) : [];
    return m;
  }
}

const D = THREE.MathUtils.degToRad;

/**
 * What the pose sliders add to each joint, as turns about the parent's axes (so "look"
 * turns the head about the neck whatever the pose). Degrees, and crouch from 0 to 1;
 * swing is the arms' walking swing, which the timeline drives.
 */
export function paramDeltas(p = {}) {
  const e = {};
  const add = (joint, x = 0, y = 0, z = 0) => {
    const v = (e[joint] ??= [0, 0, 0]);
    v[0] += x;
    v[1] += y;
    v[2] += z;
  };
  const v = (k) => Number(p[k]) || 0;
  add("Neck", v("nod") * 0.4, v("look") * 0.4, 0);
  add("Head", v("nod") * 0.6, v("look") * 0.6, v("tilt"));
  for (const j of ["Spine", "Chest"]) add(j, v("lean") * 0.5, v("twist") * 0.5, v("side") * 0.5);
  add("LeftArm", -v("reach") - v("swing"), 0, v("arms"));
  add("RightArm", -v("reach") + v("swing"), 0, -v("arms"));
  add("LeftForeArm", 0, -v("elbows"), 0);
  add("RightForeArm", 0, v("elbows"), 0);
  add("LeftUpLeg", 0, 0, v("stance") * 0.5);
  add("RightUpLeg", 0, 0, -v("stance") * 0.5);
  add("LeftFoot", 0, 0, -v("stance") * 0.5);
  add("RightFoot", 0, 0, v("stance") * 0.5);
  // a step brings the left leg forward and the right one back; the forward knee bends a little
  const step = v("step");
  add("LeftUpLeg", -step, 0, 0);
  add("RightUpLeg", step * 0.6, 0, 0);
  add(step >= 0 ? "LeftLeg" : "RightLeg", Math.abs(step) * 0.35, 0, 0);
  const crouch = THREE.MathUtils.clamp(v("crouch"), 0, 1);
  if (crouch) {
    for (const s of ["Left", "Right"]) {
      add(`${s}UpLeg`, -78 * crouch, 0, 0);
      add(`${s}Leg`, 122 * crouch, 0, 0);
      add(`${s}Foot`, -44 * crouch, 0, 0);
    }
    add("Spine", 18 * crouch, 0, 0);
  }
  return Object.fromEntries(Object.entries(e).filter(([, a]) => a.some((x) => x)).map(([j, [x, y, z]]) => [j, new THREE.Quaternion().setFromEuler(new THREE.Euler(D(x), D(y), D(z), "XYZ"))]));
}

/** Turns a joint (in world space) so the direction joint→from points joint→to instead. */
function aim(joint, from, origin, to) {
  const current = from.clone().sub(origin).normalize();
  const wanted = to.clone().sub(origin).normalize();
  if (current.lengthSq() < 1e-10 || wanted.lengthSq() < 1e-10) return;
  const delta = new THREE.Quaternion().setFromUnitVectors(current, wanted);
  const world = joint.getWorldQuaternion(new THREE.Quaternion());
  const parentWorld = joint.parent.getWorldQuaternion(new THREE.Quaternion());
  joint.quaternion.copy(parentWorld.invert().multiply(delta.multiply(world)));
}
