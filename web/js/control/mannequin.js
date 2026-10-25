// An artist's mannequin: a joint hierarchy (one Object3D per joint, named after
// skeleton.js) with the sculpted pieces of body.js hung on it, tinted with the
// character's colour, the ball joints a shade darker. The pose is a base (each
// joint's local rotation) with the pose sliders laid over it; the profile sets
// the bones' lengths and the body's shape.

import * as THREE from "three";
import { JOINTS, JOINT_NAMES, HINGES, CONES, CHAINS, MIRROR, DEFAULT_PROFILE, bodyById } from "./skeleton.js";
import { bodyParts, headFrame } from "./body.js";
import { MODELS, rigById, wantModel, wantHeld } from "./models.js";
import { assetByType } from "./assets.js";
import { clone as cloneRigged } from "three/addons/utils/SkeletonUtils.js";


const CLAY = new THREE.Color("#b9b5ae");
/** The character's colour as clay: still matte and light, but no two bodies alike. */
const tint = (color) => color.clone().lerp(CLAY, 0.32);
let count = 0;

export class Mannequin {
  constructor({ id, name, color, profile, body, hold, rig, tag, ref } = {}) {
    this.id = id ?? `char-${Date.now().toString(36)}-${count++}`;
    this.name = name ?? "Character";
    this.color = new THREE.Color(color ?? "#e8584f");
    this.body = bodyById(body) ? body : "man";
    // a character someone brought, rigged: its id among the user's models
    this.rigId = rig ?? null;
    // who this is, for a render: a few words and pictures (a character sheet), called by @name; an
    // older stage's one picture is its first
    this.tag = { description: String(tag?.description ?? "").slice(0, 600), refs: Array.isArray(tag?.refs) ? tag.refs.filter((r) => r?.file).slice(0, 8) : ref?.file ? [ref] : [] };
    this.profile = { ...DEFAULT_PROFILE, ...(bodyById(this.body)?.profile ?? {}), ...(this.rigId && rigById(this.rigId) ? { height: rigById(this.rigId).height } : {}), ...profile };
    this.root = new THREE.Group();
    this.root.name = this.id;
    this.root.userData.character = this;
    this.joints = {};
    this.parts = [];
    this.base = {};
    this.params = {};
    // timeline keys: [{ t, position, quaternion, pose, params }]
    this.keys = [];
    // what each hand holds (a hand prop's type), and which of those a pose put there
    this.hold = { right: null, left: null, ...(hold ?? {}) };
    this.autoHold = { right: false, left: false };
    this.material = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0 });
    this.ballMaterial = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    // held things are in plain clay, so they read apart from the body
    // what a hand holds is small and often a sheet (an umbrella's canopy): drawn from both sides
    this.heldMaterial = new THREE.MeshStandardMaterial({ color: "#a9a59e", roughness: 0.8, side: THREE.DoubleSide });
    this.heldAccent = new THREE.MeshStandardMaterial({ color: "#76726c", roughness: 0.7, side: THREE.DoubleSide });
    this.setColor(this.color);
    this.build();
  }

  /**
   * Takes the models that have come since it was built: the modelled body in place of the sculpted one, and what it
   * holds in its hands. Where it stands and how it is posed stay as they are. Answers whether anything changed.
   */
  refit() {
    if (!this.rigId && this.model !== (MODELS.bodies.get(this.body) ?? null)) return this.build(), true;
    let changed = false;
    for (const hand of ["right", "left"]) {
      const type = this.hold[hand];
      if (type && !this.held?.[hand] && (MODELS.hand.has(type) || MODELS.props.has(type))) (this.setHold(hand, type), (changed = true));
    }
    return changed;
  }

  /** A new colour for the clay and the joints. */
  setColor(color) {
    this.color = new THREE.Color(color);
    this.material.color.copy(tint(this.color));
    // thin seams read best dark; a model's broad sockets, a shade lighter
    this.ballMaterial.color.copy(tint(this.color).multiplyScalar(this.model ? 0.66 : 0.45));
  }

  /** One of the body types, keeping the pose; its proportions can be tuned after. */
  setBody(id) {
    const type = bodyById(id);
    if (!type) return;
    this.body = id;
    this.rigId = null;
    this.profile = { ...DEFAULT_PROFILE, ...type.profile };
    this.build();
  }

  /** One of the user's rigged characters as this body, at its own height. */
  setRig(id) {
    const rig = rigById(id);
    this.rigId = id;
    if (rig) this.profile = { ...this.profile, height: rig.height };
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
    const type = bodyById(this.body);
    const base = { ...DEFAULT_PROFILE, ...(type?.profile ?? {}) };
    const rig = this.rigId ? rigById(this.rigId) : null;
    // the modelled body is asked for as the body is built: until it comes the sculpted one stands in
    if (!rig) wantModel("bodies", this.body);
    const model = MODELS.bodies.get(this.body);
    this.rigScene?.removeFromParent();
    this.rigScene = null;
    this.rigDrive = null;
    // the modelled body whenever there is one: every slider shapes it (see buildModel)
    this.model = !rig && model ? model : null;
    if (rig) this.buildRig(rig);
    else if (this.model) this.buildModel(this.model, base);
    else this.buildSculpted();
    this.setColor(this.color);
    for (const hand of ["right", "left"]) if (this.hold[hand]) this.setHold(hand, this.hold[hand]);
    this.apply();
  }

  /** The body sculpted in code from the profile: joints from skeleton.js, pieces from body.js. */
  buildSculpted() {
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
    for (const [name, geometry, kind] of bodyParts(p)) this.addPiece(this.joints[name], geometry, kind === "joint");
  }

  /**
   * The modelled body of this type, its joints where the model has them. The frame's sliders
   * still apply: height scales it all; arms and legs lengthen the bones and their pieces;
   * shoulders and hips set the joints apart; build thickens the pieces across their bones;
   * head, hands and feet scale those pieces.
   */
  buildModel(model, base) {
    const p = this.profile;
    const k = (key) => (p[key] ?? 1) / (base[key] ?? 1);
    // how far a shape trait has moved from the type's own
    const dk = (key, none = 1) => (p[key] ?? none) - (base[key] ?? none);
    const s = p.height / base.height;
    const [legs, arms, sh, hips, build, head, hands, feet] = ["legs", "arms", "shoulders", "hips", "build", "head", "hands", "feet"].map(k);
    const soft = 1 + 0.35 * dk("soft");
    const muscle = 1 + 0.22 * dk("muscle");
    const rest = new Map(model.joints.map((j) => [j.name, new THREE.Vector3(...j.local)]));
    // longer legs lift the hips by what the thigh and shin gain
    const lift = (rest.get("LeftLeg").length() + rest.get("LeftFoot").length()) * (legs - 1);
    for (const [name, parent] of JOINTS) {
      const v = rest.get(name).clone();
      if (name === "Hips") v.y += lift;
      if (/^(Left|Right)(Leg|Foot)$/.test(name)) v.multiplyScalar(legs);
      if (/^(Left|Right)(ForeArm|Hand)$/.test(name)) v.multiplyScalar(arms);
      if (/^(Left|Right)(Arm|Shoulder)$/.test(name)) v.x *= sh;
      if (/^(Left|Right)UpLeg$/.test(name)) v.x *= hips;
      v.multiplyScalar(s);
      const joint = new THREE.Group();
      joint.name = name;
      joint.userData.joint = name;
      joint.userData.rest = v;
      joint.position.copy(v);
      (parent ? this.joints[parent] : this.root).add(joint);
      this.joints[name] = joint;
    }
    // each joint's pieces go in a sizer that stretches them in the joint's own frame
    // across each bone: the frame (build), the flesh (softness) and the muscle; the trunk takes
    // the waist, belly, chest, bust and glutes, the neck its own
    const stretch = (name) => {
      if (/(Arm|ForeArm)$/.test(name)) return [arms, build * soft * muscle, build * soft * muscle];
      if (/Shoulder$/.test(name)) return [sh, build * muscle, build * muscle];
      if (/UpLeg$/.test(name)) return [build * soft * muscle, legs, build * soft * muscle];
      if (/Leg$/.test(name)) return [build * muscle, legs, build * muscle * (1 + 0.08 * dk("muscle"))];
      if (/Hand$/.test(name)) return [hands, hands, hands];
      if (/(Foot|Toe)$/.test(name)) return [feet, feet, feet];
      if (name === "Head") return [head, head, head];
      if (name === "Hips") return [build * hips * soft, build, build * soft * (1 + 0.25 * dk("glutes"))];
      if (name === "Spine") return [build * k("waist") * soft * (1 + 0.15 * dk("belly")), build, build * soft * (1 + 0.45 * dk("belly"))];
      if (name === "Chest") return [build * Math.sqrt(sh) * soft * (1 + 0.08 * dk("muscle")), build, build * k("chest") * soft * (1 + 0.15 * dk("bust", 0))];
      if (name === "Neck") return [build * k("neck"), build, build * k("neck")];
      return [build, build, build];
    };
    const sizers = {};
    model.scene.updateMatrixWorld(true);
    const inverse = new THREE.Matrix4();
    const local = new THREE.Matrix4();
    model.scene.traverse((o) => {
      if (!o.isMesh) return;
      // the piece belongs to the nearest joint above it, wherever it is nested
      let owner = o.parent;
      while (owner && !this.joints[owner.name]) owner = owner.parent;
      if (!owner) return;
      const name = owner.name;
      if (!sizers[name]) {
        const sizer = new THREE.Group();
        sizer.scale.set(...stretch(name).map((v) => v * s));
        this.joints[name].add(sizer);
        sizers[name] = sizer;
      }
      const mesh = this.addPiece(sizers[name], o.geometry, o.material?.name === "joint", name);
      local.multiplyMatrices(inverse.copy(owner.matrixWorld).invert(), o.matrixWorld);
      local.decompose(mesh.position, mesh.quaternion, mesh.scale);
    });
    this.modelScale = { s, head };
  }

  /**
   * A rigged character the user brought: the Stage's joints where its bones are (its arms laid
   * out in a T), and its own model, skinned, following them (see driveRig). Height scales it.
   */
  buildRig(rig) {
    const s = this.profile.height / rig.height;
    for (const j of rig.joints) {
      const joint = new THREE.Group();
      joint.name = j.name;
      joint.userData.joint = j.name;
      joint.userData.rest = new THREE.Vector3(...j.local).multiplyScalar(s);
      joint.position.copy(joint.userData.rest);
      (j.parent ? this.joints[j.parent] : this.root).add(joint);
      this.joints[j.name] = joint;
    }
    const copy = cloneRigged(rig.scene);
    copy.scale.setScalar(s);
    this.root.add(copy);
    const bones = new Map();
    copy.traverse((o) => {
      if (o.isBone) bones.set(o.name, o);
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = true;
      Object.assign(o.userData, { joint: "Hips", character: this, rigged: true });
      this.parts.push(o);
    });
    this.rigScene = copy;
    this.rigDrive = rig.drive.map((d) => ({ joint: d.joint, bone: bones.get(d.bone), align: new THREE.Quaternion(...d.align), bind: new THREE.Quaternion(...d.bind) })).filter((d) => d.bone);
  }

  /** Turns the rig's bones to follow the joints: each bone keeps its own bind turn, aligned to the Stage's rest. */
  driveRig() {
    if (!this.rigDrive) return;
    this.root.updateMatrixWorld(true);
    const into = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    for (const d of this.rigDrive) {
      const joint = into.clone().multiply(this.joints[d.joint].getWorldQuaternion(new THREE.Quaternion()));
      const want = joint.multiply(d.align).multiply(d.bind);
      const parent = into.clone().multiply(d.bone.parent.getWorldQuaternion(new THREE.Quaternion()));
      d.bone.quaternion.copy(parent.invert().multiply(want));
      d.bone.updateMatrixWorld(true);
    }
  }

  /** One piece of the body on a joint (or a joint's sizer), in clay or in the joint's darker clay. */
  addPiece(parent, geometry, ball, joint = parent.name) {
    const mesh = new THREE.Mesh(geometry, ball ? this.ballMaterial : this.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.joint = joint;
    mesh.userData.character = this;
    parent.add(mesh);
    this.parts.push(mesh);
    return mesh;
  }

  /**
   * Puts a hand prop (models/hand: a phone, a cup, a sword...) in a hand, or empties it (null).
   * The prop sits at the palm's grip, scaled to the hand; it stays held through every pose.
   */
  setHold(hand, type) {
    this.held ??= {};
    this.held[hand]?.removeFromParent();
    this.parts = this.parts.filter((m) => m.userData.held !== hand);
    this.held[hand] = null;
    this.hold[hand] = type || null;
    // a hand prop, or a piece of the set that can be held (a bottle, an apple, a book); asked for, and held once it comes
    if (type) wantHeld(type);
    const model = type && (MODELS.hand.get(type) ?? (() => {
      const def = assetByType(type);
      const piece = MODELS.props.get(type);
      return def?.holdable?.grips && piece ? { scene: piece.scene, grips: def.holdable.grips, socket: def.holdable.referenceSocket } : null;
    })());
    if (!model) return;
    const grip = model.grips[hand];
    const p = this.profile;
    const base = { ...DEFAULT_PROFILE, ...(bodyById(this.body)?.profile ?? {}) };
    const k = this.model ? this.model.handSocketScale * this.modelScale.s * ((p.hands ?? 1) / (base.hands ?? 1)) : (p.height / 1.78) * (p.hands ?? 1);
    // a child's bag is a child's: the thing scales with a small hand, never past its own size;
    // the palm's socket moves with the hand, the thing's own grip offset with the thing
    const size = THREE.MathUtils.clamp(k, 0.55, 1);
    const socket = new THREE.Vector3(...(model.socket?.[hand] ?? (hand === "left" ? [0.075, -0.018, 0] : [-0.075, -0.018, 0])));
    const holder = new THREE.Group();
    holder.position.copy(socket.multiplyScalar(k - size)).addScaledVector(new THREE.Vector3(...grip.position), size);
    holder.quaternion.fromArray(grip.quaternion ?? [0, 0, 0, 1]);
    if (grip.scale) holder.scale.fromArray(grip.scale);
    holder.scale.multiplyScalar(size);
    const copy = model.scene.clone(true);
    const joint = hand === "left" ? "LeftHand" : "RightHand";
    copy.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material?.name === "accent" ? this.heldAccent : this.heldMaterial;
      o.castShadow = o.receiveShadow = true;
      Object.assign(o.userData, { joint, character: this, held: hand });
      this.parts.push(o);
    });
    holder.add(copy);
    this.joints[joint].add(holder);
    this.held[hand] = holder;
    this.root.updateMatrixWorld(true);
  }

  /** Where the head is in the Head joint's frame (its centre and half-height), for the face's keypoints. */
  headFrame() {
    const hb = this.model?.headBounds;
    if (!hb) return headFrame(this.profile);
    const k = this.modelScale.s * this.modelScale.head;
    return { centre: new THREE.Vector3(...hb.centre).multiplyScalar(k), radius: ((hb.max[1] - hb.min[1]) / 2) * k };
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
    // what the pose puts in the hands, replacing only what an earlier pose put there
    for (const hand of ["right", "left"]) {
      const want = preset.hold?.[hand] ?? null;
      if (want) this.setHold(hand, want);
      else if (this.autoHold[hand]) this.setHold(hand, null);
      this.autoHold[hand] = Boolean(want);
    }
    if (preset.quaternions) {
      this.setPose(preset.quaternions);
      return;
    }
    this.setEulerPose(preset.joints ?? {});
    this.shapePose(preset);
  }

  /**
   * A pose's aims, contacts and grips, laid over the joints as they are: the rest of setPreset,
   * and how an arm holds what its hand was given (an umbrella up, a bag hanging).
   */
  shapePose(preset) {
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
    // a hand that holds something can say how: where its palm faces and where its thumb points
    for (const [name, g] of Object.entries(preset.grip ?? {})) {
      const joint = this.joints[name];
      this.root.updateMatrixWorld(true);
      const z = new THREE.Vector3(...g.thumb).normalize().applyQuaternion(frame);
      const y = new THREE.Vector3(...g.palm).negate().applyQuaternion(frame);
      y.addScaledVector(z, -y.dot(z)).normalize();
      const x = new THREE.Vector3().crossVectors(y, z);
      const world = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
      joint.quaternion.copy(joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
      joint.updateMatrixWorld(true);
      this.absorb([name]);
    }
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
      const skin = this.parts.filter((m) => m.userData.rigged || (near.has(m.userData.joint) && !chain.includes(m.userData.joint)));
      this.driveRig();
      for (const m of skin) if (m.isSkinnedMesh) m.computeBoundingSphere();
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
    // a modelled body is stooped in its joints as its type is (the elder): only the difference bends it
    const base = this.model ? bodyById(this.body)?.profile.stoop ?? 0 : 0;
    return paramDeltas(this.params, (this.profile.stoop ?? 0) - base);
  }

  /** Writes base and sliders into the joints. */
  apply() {
    const deltas = this.deltas();
    for (const n of JOINT_NAMES) {
      const base = this.base[n] ?? new THREE.Quaternion();
      this.joints[n].quaternion.copy(deltas[n] ? deltas[n].clone().multiply(base) : base);
    }
    this.root.updateMatrixWorld(true);
    this.driveRig();
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
    // what each hand held goes to the other
    const { right, left } = this.hold;
    this.setHold("right", left);
    this.setHold("left", right);
    this.autoHold = { right: this.autoHold.left, left: this.autoHold.right };
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
    // a skinned model's box is the pose's, read from its vertices
    this.driveRig();
    return new THREE.Box3().setFromObject(this.root, Boolean(this.rigScene));
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
      hold: this.hold.right || this.hold.left ? { ...this.hold } : undefined,
      rig: this.rigId ?? undefined,
      tag: this.tag.description || this.tag.refs.length ? this.tag : undefined,
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
