// An artist's mannequin: a joint hierarchy (one Object3D per joint, named after
// skeleton.js) with the sculpted pieces of body.js hung on it, tinted with the
// character's colour, the ball joints a shade darker. The pose is a base (each
// joint's local rotation) with the pose sliders laid over it; the profile sets
// the bones' lengths and the body's shape.

import * as THREE from "three";
import { JOINTS, JOINT_NAMES, HINGES, CONES, CHAINS, MIRROR, DEFAULT_PROFILE, bodyById } from "./skeleton.js";
import { bodyParts } from "./body.js";

const CLAY = new THREE.Color("#b9b5ae");
/** The character's colour as clay: still matte and light, but no two bodies alike. */
const tint = (color) => color.clone().lerp(CLAY, 0.32);
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
    this.ballMaterial.color.copy(tint(this.color).multiplyScalar(0.45));
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

  /** Builds (or rebuilds) the joints and the body from the profile, keeping the pose. */
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
    for (const [name, geometry, kind] of bodyParts(p)) {
      const mesh = new THREE.Mesh(geometry, kind === "joint" ? this.ballMaterial : this.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.joint = name;
      mesh.userData.character = this;
      this.joints[name].add(mesh);
      this.parts.push(mesh);
    }
    this.apply();
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

  /**
   * A pose from the library: its angles (or a saved pose's quaternions), then its aims, then its
   * contacts. An aim points a bone along a direction in the body's own frame (+x its left, +y up,
   * +z forward), with an optional twist about the bone (degrees), so a pose reads the way a
   * person would say it: "the forearm points up". A contact puts a hand or a foot on a point of
   * this body, reached by IK (see contact()), so a hand finds the hip or the chin of any body,
   * tall or small, thin or heavy.
   */
  setPreset(preset) {
    if (!preset) return;
    if (preset.quaternions) {
      this.setPose(preset.quaternions);
      return;
    }
    this.setEulerPose(preset.joints ?? {});
    const frame = this.root.getWorldQuaternion(new THREE.Quaternion());
    const aim = (names) => {
      for (const name of names) {
        const dir = preset.aim?.[name];
        if (!dir) continue;
        const joint = this.joints[name];
        this.root.updateMatrixWorld(true);
        const parent = joint.parent.getWorldQuaternion(new THREE.Quaternion());
        const want = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize().applyQuaternion(frame).applyQuaternion(parent.invert());
        const rest = boneDirection(this, name);
        joint.quaternion.setFromUnitVectors(rest, want);
        if (dir[3]) joint.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(rest, THREE.MathUtils.degToRad(dir[3])));
        joint.updateMatrixWorld(true);
        this.absorb([name]);
      }
      this.apply();
    };
    // the limbs first; the hands after their contacts, so a hand reached to a hip can still point down into a pocket
    aim(JOINT_NAMES.filter((n) => !n.endsWith("Hand")));
    for (const [effector, spec] of Object.entries(preset.reach ?? {})) {
      this.root.updateMatrixWorld(true);
      const target = this.contact(spec, effector);
      // twice: the second pass mends what the first left when the chain was folded tight
      this.reach(effector, target);
      this.reach(effector, target);
    }
    aim(["LeftHand", "RightHand"]);
    this.apply();
  }

  /**
   * Where a contact is, in world space: a joint (or the middle of two), plus an offset in units
   * of height, in the body's frame or a joint's (frame). With surface ("front", "back", "left",
   * "right", "top"), the point moves out that way onto the body's skin and clear of it by
   * `clear` (heights), so a hand rests on a belly or a hip wherever this body's surface is.
   */
  contact({ at, to, offset = [0, 0, 0], frame, surface, clear = 0 }, effector = "") {
    const h = this.profile.height;
    const q = (frame ? this.joints[frame] : this.root).getWorldQuaternion(new THREE.Quaternion());
    const point = this.joints[at].getWorldPosition(new THREE.Vector3());
    if (to) point.lerp(this.joints[to].getWorldPosition(new THREE.Vector3()), 0.5);
    point.add(new THREE.Vector3(...offset).multiplyScalar(h).applyQuaternion(q));
    if (surface) {
      const dir = new THREE.Vector3(...SURFACES[surface]).applyQuaternion(q);
      // the skin is the piece at the joint and its neighbours (so a big head is not taken for the
      // top of a toddler's knee), less the limb being placed
      const joint = this.joints[at];
      const near = new Set([at, joint.parent?.name, ...JOINT_NAMES.filter((n) => this.joints[n].parent === joint)]);
      const chain = CHAINS[effector] ? [effector, CHAINS[effector].mid, CHAINS[effector].root] : [];
      const skin = this.parts.filter((m) => near.has(m.userData.joint) && !chain.includes(m.userData.joint));
      const hit = new THREE.Raycaster(point.clone().addScaledVector(dir, 2), dir.clone().negate(), 0, 4).intersectObjects(skin, false)[0];
      if (hit) point.copy(hit.point).addScaledVector(dir, clear * h);
    }
    return point;
  }

  /** Sets some pose sliders (degrees; crouch 0 to 1) and shows the result. */
  setParams(patch) {
    this.params = { ...this.params, ...patch };
    for (const [k, v] of Object.entries(this.params)) if (!v) delete this.params[k];
    this.apply();
  }

  /** The sliders' turns, with the body's own stoop. */
  deltas() {
    return paramDeltas(this.params, this.profile.stoop);
  }

  /** Writes base and sliders into the joints. */
  apply() {
    const deltas = this.deltas();
    for (const n of JOINT_NAMES) {
      const base = this.base[n] ?? new THREE.Quaternion();
      this.joints[n].quaternion.copy(deltas[n] ? deltas[n].clone().multiply(base) : base);
    }
    this.root.updateMatrixWorld(true);
  }

  /** Takes what the joints show now (after a drag, IK or an import) as the base, the sliders still laid over it. */
  absorb(names = JOINT_NAMES) {
    const deltas = this.deltas();
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
const SURFACES = { front: [0, 0, 1], back: [0, 0, -1], left: [1, 0, 0], right: [-1, 0, 0], top: [0, 1, 0], bottom: [0, -1, 0] };

/** Which way a joint's bone runs at rest, in its own frame: toward its child, or on for a hand, the head, the toes. */
function boneDirection(m, name) {
  const child = JOINT_NAMES.find((n) => m.joints[n].parent === m.joints[name] && !n.endsWith("Shoulder") && !n.endsWith("UpLeg"));
  if (child) return m.joints[child].userData.rest.clone().normalize();
  if (name.endsWith("Hand")) return new THREE.Vector3(name.startsWith("Left") ? 1 : -1, 0, 0);
  if (name.endsWith("Toe")) return new THREE.Vector3(0, 0, 1);
  return new THREE.Vector3(0, 1, 0);
}

/**
 * What the pose sliders add to each joint, as turns about the parent's axes (so "look"
 * turns the head about the neck whatever the pose). Degrees, and crouch from 0 to 1;
 * swing is the arms' walking swing, which the timeline drives.
 */
export function paramDeltas(p = {}, stoop = 0) {
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
  // an elder's stoop: the upper back rounds, the neck comes forward and the head lifts to look ahead
  if (stoop) {
    add("Spine", 4 * stoop, 0, 0);
    add("Chest", 13 * stoop, 0, 0);
    add("Neck", 16 * stoop, 0, 0);
    add("Head", -26 * stoop, 0, 0);
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
