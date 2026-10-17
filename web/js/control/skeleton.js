// The mannequin's skeleton: one fixed list of joints, named the way BVH and
// glTF tools name them, so poses, mocap and exports all speak the same names.
// Rest pose is a T-pose (arms along ±X, legs down −Y, feet forward +Z), the
// character faces +Z, and its left is +X. Lengths are fractions of the height.

/** Body proportions, saved as a profile. Every value is a multiplier around 1 except height (metres). */
export const DEFAULT_PROFILE = {
  name: "Adult",
  height: 1.75,
  build: 1,
  head: 1,
  arms: 1,
  legs: 1,
  shoulders: 1,
  hips: 1,
};

// [name, parent, offset from the parent as a function of the profile]
// offsets are in units of height (h) and are scaled by the profile's multipliers
export const JOINTS = [
  ["Hips", null, (p) => [0, 0.04 + (0.245 + 0.246) * p.legs, 0]],
  ["Spine", "Hips", () => [0, 0.09, 0]],
  ["Chest", "Spine", () => [0, 0.11, 0]],
  ["Neck", "Chest", () => [0, 0.135, 0]],
  ["Head", "Neck", () => [0, 0.055, 0.005]],
  ["LeftShoulder", "Chest", (p) => [0.025 * p.shoulders, 0.105, 0]],
  ["LeftArm", "LeftShoulder", (p) => [0.085 * p.shoulders, 0, 0]],
  ["LeftForeArm", "LeftArm", (p) => [0.165 * p.arms, 0, 0]],
  ["LeftHand", "LeftForeArm", (p) => [0.145 * p.arms, 0, 0]],
  ["RightShoulder", "Chest", (p) => [-0.025 * p.shoulders, 0.105, 0]],
  ["RightArm", "RightShoulder", (p) => [-0.085 * p.shoulders, 0, 0]],
  ["RightForeArm", "RightArm", (p) => [-0.165 * p.arms, 0, 0]],
  ["RightHand", "RightForeArm", (p) => [-0.145 * p.arms, 0, 0]],
  ["LeftUpLeg", "Hips", (p) => [0.055 * p.hips, -0.025, 0]],
  ["LeftLeg", "LeftUpLeg", (p) => [0, -0.245 * p.legs, 0]],
  ["LeftFoot", "LeftLeg", (p) => [0, -0.246 * p.legs, 0]],
  ["LeftToe", "LeftFoot", () => [0, -0.04, 0.1]],
  ["RightUpLeg", "Hips", (p) => [-0.055 * p.hips, -0.025, 0]],
  ["RightLeg", "RightUpLeg", (p) => [0, -0.245 * p.legs, 0]],
  ["RightFoot", "RightLeg", (p) => [0, -0.246 * p.legs, 0]],
  ["RightToe", "RightFoot", () => [0, -0.04, 0.1]],
];

export const JOINT_NAMES = JOINTS.map(([n]) => n);

/** What a person would call each joint, for tooltips and the outliner. */
export const JOINT_LABELS = {
  Hips: "Hips", Spine: "Waist", Chest: "Chest", Neck: "Neck", Head: "Head",
  LeftShoulder: "Left shoulder", LeftArm: "Left upper arm", LeftForeArm: "Left forearm", LeftHand: "Left hand",
  RightShoulder: "Right shoulder", RightArm: "Right upper arm", RightForeArm: "Right forearm", RightHand: "Right hand",
  LeftUpLeg: "Left thigh", LeftLeg: "Left shin", LeftFoot: "Left foot", LeftToe: "Left toes",
  RightUpLeg: "Right thigh", RightLeg: "Right shin", RightFoot: "Right foot", RightToe: "Right toes",
};

/** The other side's joint, for mirroring. */
export const MIRROR = Object.fromEntries(JOINT_NAMES.map((n) => [n, n.startsWith("Left") ? n.replace("Left", "Right") : n.startsWith("Right") ? n.replace("Right", "Left") : n]));

/**
 * Hinges bend on one axis only, within a range (degrees). Elbows fold forward
 * (arm along ±X, so the hinge is the Y axis: a left forearm turns −Y to come
 * forward, a right one +Y); knees fold backward (X axis).
 */
export const HINGES = {
  LeftForeArm: { axis: [0, 1, 0], min: -150, max: 0 },
  RightForeArm: { axis: [0, 1, 0], min: 0, max: 150 },
  LeftLeg: { axis: [1, 0, 0], min: 0, max: 155 },
  RightLeg: { axis: [1, 0, 0], min: 0, max: 155 },
};

/** Ball joints keep within a cone (degrees from rest); the spine and neck turn less than a shoulder. */
export const CONES = {
  Spine: 45, Chest: 40, Neck: 50, Head: 60,
  LeftShoulder: 25, RightShoulder: 25,
  LeftArm: 170, RightArm: 170,
  LeftHand: 85, RightHand: 85,
  LeftUpLeg: 130, RightUpLeg: 130,
  LeftFoot: 55, RightFoot: 55,
  LeftToe: 40, RightToe: 40,
};

/** Two-bone chains that IK drives: the effector, its middle joint, its root, and which way the middle bends. */
export const CHAINS = {
  LeftHand: { root: "LeftArm", mid: "LeftForeArm", pole: [0, -0.3, -1] },
  RightHand: { root: "RightArm", mid: "RightForeArm", pole: [0, -0.3, -1] },
  LeftFoot: { root: "LeftUpLeg", mid: "LeftLeg", pole: [0, 0, 1] },
  RightFoot: { root: "RightUpLeg", mid: "RightLeg", pole: [0, 0, 1] },
};

/**
 * Body parts: the segment from a joint toward its child belongs to that joint, so
 * clicking an upper arm selects (and turns) the shoulder joint. [joint, kind, radius (h), shape]
 */
export const SEGMENTS = [
  ["Hips", "pelvis", 0.085],
  ["Spine", "waist", 0.07],
  ["Chest", "chest", 0.095],
  ["Neck", "neck", 0.032],
  ["Head", "head", 0.066],
  ["LeftShoulder", "clavicle", 0.03],
  ["RightShoulder", "clavicle", 0.03],
  ["LeftArm", "limb", 0.034],
  ["RightArm", "limb", 0.034],
  ["LeftForeArm", "limb", 0.028],
  ["RightForeArm", "limb", 0.028],
  ["LeftHand", "hand", 0.024],
  ["RightHand", "hand", 0.024],
  ["LeftUpLeg", "limb", 0.05],
  ["RightUpLeg", "limb", 0.05],
  ["LeftLeg", "limb", 0.039],
  ["RightLeg", "limb", 0.039],
  ["LeftFoot", "foot", 0.03],
  ["RightFoot", "foot", 0.03],
  ["LeftToe", "toe", 0.026],
  ["RightToe", "toe", 0.026],
];
