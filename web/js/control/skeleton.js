// The mannequin's skeleton: one fixed list of joints, named the way BVH and
// glTF tools name them, so poses, mocap and exports all speak the same names.
// Rest pose is a T-pose (arms along ±X, legs down −Y, feet forward +Z), the
// character faces +Z, and its left is +X. Lengths are fractions of the height.

/** Body proportions, saved as a profile. Every value is a multiplier around 1 except height (metres). */
export const DEFAULT_PROFILE = {
  name: "Man",
  height: 1.78,
  build: 1,
  head: 1,
  arms: 1,
  legs: 1,
  shoulders: 1.04,
  hips: 0.97,
  waist: 1,
  chest: 1,
  belly: 1,
};

/**
 * The bodies people stage most, as profiles. Heights are metres; the rest are multipliers
 * around 1: build (limb and torso thickness), head, arm and leg length, shoulder and hip
 * width, waist width, chest depth and belly depth.
 */
export const BODY_TYPES = [
  { id: "man", name: "Man", profile: { height: 1.78, build: 1, head: 1, arms: 1, legs: 1, shoulders: 1.04, hips: 0.97, waist: 1, chest: 1, belly: 1 } },
  { id: "woman", name: "Woman", profile: { height: 1.66, build: 0.9, head: 0.98, arms: 0.97, legs: 1.02, shoulders: 0.88, hips: 1.16, waist: 0.82, chest: 1.12, belly: 0.92 } },
  { id: "teen", name: "Teen", profile: { height: 1.6, build: 0.86, head: 1.06, arms: 1, legs: 1.03, shoulders: 0.94, hips: 0.95, waist: 0.92, chest: 0.94, belly: 0.92 } },
  { id: "child", name: "Child", profile: { height: 1.22, build: 0.9, head: 1.3, arms: 0.92, legs: 0.9, shoulders: 0.92, hips: 0.98, waist: 1.02, chest: 0.98, belly: 1.08 } },
  { id: "toddler", name: "Toddler", profile: { height: 0.9, build: 1.02, head: 1.55, arms: 0.85, legs: 0.8, shoulders: 0.9, hips: 1.04, waist: 1.1, chest: 1, belly: 1.2 } },
  { id: "elder", name: "Elder", profile: { height: 1.68, build: 0.96, head: 1.02, arms: 0.99, legs: 0.97, shoulders: 0.95, hips: 1.02, waist: 1.04, chest: 0.96, belly: 1.12 } },
  { id: "heavy", name: "Heavy", profile: { height: 1.76, build: 1.3, head: 1.03, arms: 1, legs: 0.98, shoulders: 1.1, hips: 1.2, waist: 1.3, chest: 1.12, belly: 1.45 } },
  { id: "athletic", name: "Athletic", profile: { height: 1.84, build: 1.08, head: 0.97, arms: 1.03, legs: 1.03, shoulders: 1.2, hips: 0.94, waist: 0.9, chest: 1.08, belly: 0.88 } },
];
export const bodyById = (id) => BODY_TYPES.find((b) => b.id === id);

/** Body sliders in the Selected panel: [key, label, min, max, step, unit]. */
export const BODY_SLIDERS = [
  ["height", "Height", 0.6, 2.4, 0.01, "m"], ["build", "Build", 0.7, 1.6, 0.01], ["head", "Head", 0.8, 1.7, 0.01],
  ["shoulders", "Shoulders", 0.75, 1.4, 0.01], ["hips", "Hips", 0.8, 1.4, 0.01], ["waist", "Waist", 0.75, 1.5, 0.01],
  ["chest", "Chest", 0.8, 1.35, 0.01], ["belly", "Belly", 0.8, 1.7, 0.01], ["legs", "Legs", 0.75, 1.2, 0.01], ["arms", "Arms", 0.8, 1.15, 0.01],
];

/** One colour per character, apart enough to tell them at a glance; the Colour ID pass prints them flat. */
export const PALETTE = [
  ["#e8584f", "Coral"], ["#3fc6c0", "Teal"], ["#f0a63a", "Amber"], ["#8d7cf2", "Violet"],
  ["#5fbf6a", "Green"], ["#e86fb3", "Pink"], ["#4f8de8", "Blue"], ["#c28a5a", "Tan"],
];
export const colorName = (hex) => PALETTE.find(([h]) => h === String(hex).toLowerCase())?.[1] ?? hex;

/**
 * Pose sliders: turns laid over whichever pose a body holds, so a preset can still look
 * left, lean in or crouch a little. [key, label, min, max]. Degrees, except crouch (0 to 1).
 */
export const PARAMS = [
  ["look", "Look", -80, 80], ["nod", "Nod", -40, 40], ["tilt", "Tilt", -30, 30],
  ["lean", "Lean", -30, 60], ["twist", "Twist", -45, 45], ["side", "Side bend", -30, 30],
  ["arms", "Arms up", -20, 160], ["reach", "Arms forward", -40, 120], ["elbows", "Elbows", -20, 140],
  ["stance", "Stance", -10, 40], ["step", "Step", -45, 45], ["crouch", "Crouch", 0, 1],
];

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
