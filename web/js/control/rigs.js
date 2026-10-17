// A character someone brings, rigged in another tool (Mixamo, Unreal, VRoid, Rigify, Character
// Creator, Daz...), read onto the Stage's own skeleton: its bones are found by name, the body is
// turned to face +Z and set in metres on the ground, and each bone learns how to follow the
// Stage's joints, so every pose, slider, contact and key drives it like a mannequin.

import * as THREE from "three";
import { JOINTS } from "./skeleton.js";

const PART = {
  Shoulder: /^(shoulder|clavicle|clav|collar|shoulderbone)$/,
  Arm: /^(arm|upperarm|uparm|shldr|shldrbend|shoulderbend|humerus|upper_arm)$/,
  ForeArm: /^(forearm|lowerarm|forearmbend|elbow|radius|lower_arm)$/,
  Hand: /^(hand|wrist)$/,
  UpLeg: /^(upleg|upperleg|thigh|thighbend|femur|upper_leg|leg_upper)$/,
  Leg: /^(leg|lowerleg|calf|shin|knee|tibia|lower_leg|leg_lower)$/,
  Foot: /^(foot|ankle)$/,
  Toe: /^(toe|toes|toebase|ball|toe0|toes0|bigtoe)$/,
};

/** A bone's name without the tool's prefixes, its side (left, right or none) and what is left. */
export function readBoneName(raw) {
  let n = String(raw).toLowerCase().replace(/^.*[:|]/, "");
  n = n.replace(/^(def|org|mch|drv|jnt|bn)[-_. ]/, "").replace(/^(cc_base|j_bip|j_sec|bip0*1)[-_. ]?/, "").replace(/^c[-_. ](?=[a-z])/, "");
  const glued = "(?=(shldr|forearm|hand|thigh|shin|foot|toe|collar|pectoral|uparm|loarm|calf))";
  const tests = [
    [/^left[-_. ]?/, "left"], [/^right[-_. ]?/, "right"],
    [/[-_. ]?left$/, "left"], [/[-_. ]?right$/, "right"],
    [/^l[-_. ]/, "left"], [/^r[-_. ]/, "right"],
    [/[-_. ]l$/, "left"], [/[-_. ]r$/, "right"],
    [new RegExp(`^l${glued}`), "left"], [new RegExp(`^r${glued}`), "right"],
  ];
  let side = "none";
  for (const [re, s] of tests) {
    if (re.test(n)) {
      side = s;
      n = n.replace(re, "");
      break;
    }
  }
  return { side, base: n.replace(/[-_. ]/g, "").replace(/\d+$/, "") };
}

const depth = (o) => {
  let d = 0;
  for (let p = o.parent; p; p = p.parent) d++;
  return d;
};
const isAncestor = (a, b) => {
  for (let p = b.parent; p; p = p.parent) if (p === a) return true;
  return false;
};

/**
 * Finds the Stage's joints among a model's bones: { joint: bone }. The trunk is read along the
 * chain from the hips to the neck; arms and legs by name and side, the main bone of each (a
 * twist or roll bone is skipped), each below the one before it.
 */
export function mapBones(bones) {
  const read = bones.map((b) => ({ bone: b, ...readBoneName(b.name) })).filter((r) => !/twist|roll|share|helper|^ik|pole|target|ctrl/.test(r.base));
  const pick = (test, under) => read.filter((r) => test(r) && (!under || isAncestor(under, r.bone))).sort((a, b) => depth(a.bone) - depth(b.bone))[0]?.bone ?? null;
  const map = {};
  map.Hips = pick((r) => /^(hips?|pelvis|hip_?root|cog|centerofmass)$/.test(r.base)) ?? read.filter((r) => /hip|pelvis/.test(r.base)).sort((a, b) => depth(a.bone) - depth(b.bone))[0]?.bone ?? null;
  map.Head = pick((r) => /^head$/.test(r.base), map.Hips);
  // the neck is its first bone, twist or not (some rigs have two)
  map.Neck = bones.map((b) => ({ bone: b, ...readBoneName(b.name) })).filter((r) => /^neck/.test(r.base) && (!map.Hips || isAncestor(map.Hips, r.bone)) && (!map.Head || isAncestor(r.bone, map.Head)))
    .sort((a, b) => depth(a.bone) - depth(b.bone))[0]?.bone ?? (map.Head?.parent?.isBone ? map.Head.parent : null);
  if (map.Neck === map.Head) map.Neck = null;
  // the spine: the bones between the hips and the neck, first and last
  const top = map.Neck ?? map.Head;
  if (map.Hips && top) {
    const chain = [];
    for (let p = top.parent; p && p !== map.Hips; p = p.parent) if (p.isBone) chain.unshift(p);
    map.Spine = chain[0] ?? null;
    map.Chest = chain.length > 1 ? chain[chain.length - 1] : null;
  }
  for (const [S, side] of [["Left", "left"], ["Right", "right"]]) {
    const of = (part, under) => pick((r) => r.side === side && PART[part].test(r.base), under);
    map[`${S}Shoulder`] = of("Shoulder", map.Hips);
    map[`${S}Arm`] = of("Arm", map[`${S}Shoulder`] ?? map.Hips);
    map[`${S}ForeArm`] = of("ForeArm", map[`${S}Arm`]);
    map[`${S}Hand`] = of("Hand", map[`${S}ForeArm`]);
    map[`${S}UpLeg`] = of("UpLeg", map.Hips);
    map[`${S}Leg`] = of("Leg", map[`${S}UpLeg`]);
    map[`${S}Foot`] = of("Foot", map[`${S}Leg`]);
    map[`${S}Toe`] = of("Toe", map[`${S}Foot`]);
  }
  for (const k of Object.keys(map)) if (!map[k]) delete map[k];
  return map;
}

const NEEDED = ["Hips", "Head", "LeftArm", "LeftForeArm", "LeftHand", "RightArm", "RightForeArm", "RightHand", "LeftUpLeg", "LeftLeg", "LeftFoot", "RightUpLeg", "RightLeg", "RightFoot"];

/**
 * Reads a loaded model as a rigged character: { scene, bones, joints, height } where scene is
 * the model set on the ground, facing +Z, in metres; bones maps each joint to its bone's name;
 * joints are the Stage skeleton's rest offsets for this body (arms out in a T, whatever the
 * model's own rest pose); and each bone's bind rotation and alignment, for driving it.
 */
export function readRig(model) {
  const bones = [];
  model.traverse((o) => o.isBone && bones.push(o));
  if (!bones.length) throw new Error("This model has no rig. Import it as a prop instead.");
  const map = mapBones(bones);
  const missing = NEEDED.filter((j) => !map[j]);
  if (missing.length) throw new Error(`Its rig is missing ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? "…" : ""}. Bones found: ${bones.slice(0, 8).map((b) => b.name).join(", ")}…`);
  // in metres, on the ground, facing +Z with its left at +X
  const scene = new THREE.Group();
  const turn = new THREE.Group();
  turn.add(model);
  scene.add(turn);
  scene.updateMatrixWorld(true);
  const at = (j) => map[j].getWorldPosition(new THREE.Vector3());
  const box = new THREE.Box3().setFromObject(model, true);
  const tall = box.max.y - box.min.y;
  // centimetres (FBX, most often) and millimetres to metres
  const unit = tall > 5000 ? 0.001 : tall > 50 ? 0.01 : 1;
  model.scale.multiplyScalar(unit);
  scene.updateMatrixWorld(true);
  if (at("LeftUpLeg").x < at("RightUpLeg").x) turn.rotation.y = Math.PI;
  scene.updateMatrixWorld(true);
  const ground = new THREE.Box3().setFromObject(model, true);
  turn.position.set(-(ground.min.x + ground.max.x) / 2, -ground.min.y, -(ground.min.z + ground.max.z) / 2);
  scene.updateMatrixWorld(true);
  for (const o of [model]) o.traverse((m) => m.isMesh && (m.frustumCulled = false));
  const height = new THREE.Box3().setFromObject(model, true).max.y;

  // the Stage skeleton for this body: its bones' rest places, the arms laid out in a T
  const P = {};
  for (const j of Object.keys(map)) P[j] = at(j);
  // what the rig lacks, placed between what it has
  P.Spine ??= P.Hips.clone().lerp(P.Neck ?? P.Head, 0.3);
  P.Chest ??= P.Hips.clone().lerp(P.Neck ?? P.Head, 0.65);
  P.Neck ??= P.Chest.clone().lerp(P.Head, 0.6);
  for (const S of ["Left", "Right"]) {
    P[`${S}Shoulder`] ??= P.Chest.clone().lerp(P[`${S}Arm`], 0.25).setY(P[`${S}Arm`].y);
    P[`${S}Toe`] ??= P[`${S}Foot`].clone().add(new THREE.Vector3(0, -0.6 * P[`${S}Foot`].y, 0.08 * height));
  }
  const parentOf = Object.fromEntries(JOINTS.map(([n, p]) => [n, p]));
  const joints = JOINTS.map(([name, parent]) => {
    let local;
    if (!parent) local = P[name].clone();
    else if (/(ForeArm|Hand)$/.test(name)) local = new THREE.Vector3((name.startsWith("Left") ? 1 : -1) * P[name].distanceTo(P[parent]), 0, 0);
    else local = P[name].clone().sub(P[parent]);
    return { name, parent, local: local.toArray() };
  });

  // how each bone follows its joint: from its rest direction to the Stage's, then its own bind turn
  const rest = Object.fromEntries(joints.map((j) => [j.name, new THREE.Vector3(...j.local)]));
  const childOf = (name) => JOINTS.find(([n, p]) => p === name && !/Shoulder$|UpLeg$/.test(n))?.[0];
  const align = {};
  for (const [name] of JOINTS) {
    const child = childOf(name);
    if (child && map[name] && P[child]) {
      const from = P[child].clone().sub(P[name]).normalize();
      const to = rest[child].clone().normalize();
      align[name] = new THREE.Quaternion().setFromUnitVectors(from, to);
    } else align[name] = align[parentOf[name]]?.clone() ?? new THREE.Quaternion();
  }
  const drive = Object.entries(map).map(([joint, bone]) => ({
    joint, bone: bone.name, align: align[joint].toArray(), bind: bone.getWorldQuaternion(new THREE.Quaternion()).toArray(),
  })).sort((a, b) => depth(map[a.joint]) - depth(map[b.joint]));
  return { scene, joints, drive, height, bones: Object.fromEntries(Object.entries(map).map(([j, b]) => [j, b.name])) };
}
