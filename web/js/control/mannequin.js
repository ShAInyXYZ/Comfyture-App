// A wooden artist's mannequin: a joint hierarchy (one Object3D per joint, named
// after skeleton.js) with clay segments and ball joints hung on it. The pose is
// the joints' local rotations; the profile sets the segment lengths and widths.

import * as THREE from "three";
import { JOINTS, JOINT_NAMES, SEGMENTS, HINGES, CONES, CHAINS, MIRROR, DEFAULT_PROFILE } from "./skeleton.js";

const CLAY = new THREE.Color("#b9b5ae");
const geometryCache = new Map();
const unitSphere = () => geometryCache.get("sphere") ?? geometryCache.set("sphere", new THREE.SphereGeometry(1, 28, 18)).get("sphere");
function capsule(radius, length) {
  const key = `capsule:${radius.toFixed(4)}:${length.toFixed(4)}`;
  if (!geometryCache.has(key)) geometryCache.set(key, new THREE.CapsuleGeometry(radius, length, 6, 18));
  return geometryCache.get(key);
}

let count = 0;

export class Mannequin {
  constructor({ id, name, color, profile } = {}) {
    this.id = id ?? `char-${Date.now().toString(36)}-${count++}`;
    this.name = name ?? "Character";
    this.color = new THREE.Color(color ?? "#e8584f");
    this.profile = { ...DEFAULT_PROFILE, ...profile };
    this.root = new THREE.Group();
    this.root.name = this.id;
    this.root.userData.character = this;
    this.joints = {};
    this.parts = [];
    this.material = new THREE.MeshStandardMaterial({ color: CLAY, roughness: 0.78, metalness: 0 });
    this.ballMaterial = new THREE.MeshStandardMaterial({ color: CLAY.clone().multiplyScalar(0.86), roughness: 0.7 });
    this.build();
  }

  /** Builds (or rebuilds) the joints and segments from the profile, keeping the pose. */
  build() {
    const pose = Object.keys(this.joints).length ? this.getPose() : null;
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
    if (pose) this.setPose(pose);
    this.root.updateMatrixWorld(true);
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
      piece(unitSphere(), new THREE.Vector3(0, 0.012 * h, 0), new THREE.Vector3(r * 1.12 * p.hips, r * 0.72, r * 0.74));
    } else if (kind === "waist") {
      piece(unitSphere(), to.clone().multiplyScalar(0.5), new THREE.Vector3(r * 0.92, to.length() * 0.6, r * 0.68));
    } else if (kind === "chest") {
      piece(unitSphere(), new THREE.Vector3(0, to.y * 0.52, 0.004 * h), new THREE.Vector3(r * 1.16 * p.shoulders, to.y * 0.6, r * 0.72));
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

  /** Every joint's local rotation, as [x, y, z, w]. */
  getPose() {
    return Object.fromEntries(JOINT_NAMES.map((n) => [n, this.joints[n].quaternion.toArray().map((v) => Math.round(v * 1e5) / 1e5)]));
  }

  setPose(pose) {
    for (const n of JOINT_NAMES) {
      const q = pose[n];
      if (q) this.joints[n].quaternion.fromArray(q);
    }
    this.root.updateMatrixWorld(true);
  }

  /** A pose written as Euler degrees per joint (XYZ), the way presets are authored. */
  setEulerPose(degrees) {
    const d = THREE.MathUtils.degToRad;
    for (const n of JOINT_NAMES) {
      const e = degrees[n];
      this.joints[n].quaternion.setFromEuler(e ? new THREE.Euler(d(e[0] ?? 0), d(e[1] ?? 0), d(e[2] ?? 0), "XYZ") : new THREE.Euler());
    }
    this.root.updateMatrixWorld(true);
  }

  /** The pose seen in a mirror: left and right swap, and every turn flips across the body's middle. */
  mirror() {
    const pose = this.getPose();
    const flipped = {};
    for (const n of JOINT_NAMES) {
      const [x, y, z, w] = pose[MIRROR[n]];
      flipped[n] = [x, -y, -z, w];
    }
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
      profile: this.profile,
      position: this.root.position.toArray(),
      quaternion: this.root.quaternion.toArray(),
      pose: this.getPose(),
      visible: this.root.visible,
    };
  }

  static fromJSON(data) {
    const m = new Mannequin(data);
    m.root.position.fromArray(data.position ?? [0, 0, 0]);
    m.root.quaternion.fromArray(data.quaternion ?? [0, 0, 0, 1]);
    if (data.pose) m.setPose(data.pose);
    m.root.visible = data.visible !== false;
    return m;
  }
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
