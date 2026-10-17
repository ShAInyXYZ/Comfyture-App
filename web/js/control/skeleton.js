// The mannequin's skeleton: one fixed list of joints, named the way BVH and
// glTF tools name them, so poses, mocap and exports all speak the same names.
// Rest pose is a T-pose (arms along ±X, legs down −Y, feet forward +Z), the
// character faces +Z, and its left is +X. Lengths are fractions of the height.

/** Body proportions, saved as a profile. Every value is a multiplier around 1 except height (metres). */
export const DEFAULT_PROFILE = {
  name: "Man",
  height: 1.78, build: 1, head: 1.04, arms: 1, legs: 1, shoulders: 1.1, hips: 0.96, waist: 1, chest: 1, belly: 1,
  muscle: 1.05, soft: 1, bust: 0, glutes: 1, neck: 1.05, hands: 1.05, feet: 1.05, stoop: 0,
};

/**
 * The bodies people stage most, as profiles. Heights are metres; the rest are multipliers
 * around 1: build (thickness all over), head, arm and leg length, shoulder and hip width, waist
 * width, chest depth, belly, muscle (biceps, quads, calves, pecs), softness (fat), bust and
 * glutes, neck thickness, hand and foot size, and stoop (an elder's bent back, 0 to 1).
 */
export const BODY_TYPES = [
  { id: "man", name: "Man", profile: { height: 1.78, build: 1, head: 1.04, arms: 1, legs: 1, shoulders: 1.1, hips: 0.96, waist: 1, chest: 1, belly: 1, muscle: 1.05, soft: 1, bust: 0, glutes: 1, neck: 1.05, hands: 1.05, feet: 1.05, stoop: 0 } },
  { id: "woman", name: "Woman", profile: { height: 1.66, build: 0.9, head: 0.98, arms: 0.97, legs: 1.02, shoulders: 0.9, hips: 1.14, waist: 0.8, chest: 0.94, belly: 0.9, muscle: 0.78, soft: 1.03, bust: 1, glutes: 1.3, neck: 0.85, hands: 0.9, feet: 0.9, stoop: 0 } },
  { id: "teen", name: "Teen", profile: { height: 1.6, build: 0.86, head: 1.06, arms: 1, legs: 1.03, shoulders: 0.94, hips: 0.95, waist: 0.92, chest: 0.94, belly: 0.9, muscle: 0.82, soft: 0.95, bust: 0, glutes: 1, neck: 0.88, hands: 0.95, feet: 0.95, stoop: 0 } },
  { id: "child", name: "Child", profile: { height: 1.22, build: 0.92, head: 1.45, arms: 0.92, legs: 0.9, shoulders: 0.92, hips: 0.98, waist: 1.08, chest: 1, belly: 1.25, muscle: 0.72, soft: 1.12, bust: 0, glutes: 1, neck: 0.82, hands: 0.95, feet: 0.95, stoop: 0 } },
  { id: "toddler", name: "Toddler", profile: { height: 0.9, build: 1, head: 1.8, arms: 0.85, legs: 0.74, shoulders: 0.9, hips: 1.04, waist: 1.08, chest: 1.04, belly: 1.45, muscle: 0.68, soft: 1.3, bust: 0, glutes: 1.05, neck: 0.78, hands: 0.98, feet: 0.98, stoop: 0 } },
  { id: "elder", name: "Elder", profile: { height: 1.68, build: 0.95, head: 1.02, arms: 0.99, legs: 0.97, shoulders: 0.95, hips: 1.02, waist: 1.08, chest: 0.95, belly: 1.25, muscle: 0.72, soft: 1.06, bust: 0, glutes: 0.92, neck: 0.88, hands: 1, feet: 1, stoop: 1 } },
  { id: "heavy", name: "Heavy", profile: { height: 1.76, build: 1.1, head: 1.03, arms: 1, legs: 0.98, shoulders: 1.06, hips: 1.1, waist: 1.08, chest: 1.08, belly: 1.9, muscle: 0.92, soft: 1.32, bust: 0, glutes: 1.35, neck: 1.25, hands: 1.08, feet: 1.08, stoop: 0 } },
  { id: "athletic", name: "Athletic", profile: { height: 1.84, build: 1.05, head: 0.97, arms: 1.03, legs: 1.03, shoulders: 1.24, hips: 0.94, waist: 0.86, chest: 1.12, belly: 0.85, muscle: 1.5, soft: 0.92, bust: 0, glutes: 1.05, neck: 1.25, hands: 1.05, feet: 1.05, stoop: 0 } },
];
export const bodyById = (id) => BODY_TYPES.find((b) => b.id === id);

/** Body sliders in the Selected panel: [key, label, min, max, step, unit]. */
export const BODY_SLIDERS = [
  ["height", "Height", 0.6, 2.4, 0.01, "m"], ["build", "Build", 0.7, 1.6, 0.01], ["head", "Head", 0.8, 2, 0.01],
  ["shoulders", "Shoulders", 0.75, 1.4, 0.01], ["hips", "Hips", 0.8, 1.4, 0.01], ["waist", "Waist", 0.7, 1.6, 0.01],
  ["muscle", "Muscle", 0.6, 1.8, 0.01], ["soft", "Softness", 0.8, 1.6, 0.01], ["belly", "Belly", 0.8, 2.2, 0.01],
  ["chest", "Chest", 0.8, 1.35, 0.01], ["bust", "Bust", 0, 1.5, 0.01], ["glutes", "Glutes", 0.8, 1.6, 0.01],
  ["neck", "Neck", 0.7, 1.4, 0.01], ["legs", "Legs", 0.75, 1.2, 0.01], ["arms", "Arms", 0.8, 1.15, 0.01],
  ["hands", "Hands", 0.8, 1.25, 0.01], ["feet", "Feet", 0.8, 1.25, 0.01], ["stoop", "Stoop", 0, 1.5, 0.01],
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
// offsets are in units of height (h), from standard human proportions: the ankle at 0.039 h,
// the knee at 0.285 h, the hip joint at 0.53 h, the waist at 0.625 h, the shoulder joints at
// 0.8 h and 0.1 h either side (so the arms span about the height), the chin at 0.865 h and
// the crown at h (a big head sits on a shorter neck); the profile's multipliers lengthen the legs and arms and widen the
// shoulders and hips
export const JOINTS = [
  ["Hips", null, (p) => [0, 0.059 + (0.245 + 0.246) * p.legs, 0]],
  ["Spine", "Hips", () => [0, 0.075, 0]],
  ["Chest", "Spine", () => [0, 0.09, 0]],
  ["Neck", "Chest", () => [0, 0.115, -0.004]],
  ["Head", "Neck", (p) => [0, 0.05 / (p.head ?? 1) ** 0.8, 0.008]],
  ["LeftShoulder", "Chest", (p) => [0.02 * p.shoulders, 0.088, -0.004]],
  ["LeftArm", "LeftShoulder", (p) => [0.08 * p.shoulders, 0, 0]],
  ["LeftForeArm", "LeftArm", (p) => [0.186 * p.arms, 0, 0]],
  ["LeftHand", "LeftForeArm", (p) => [0.146 * p.arms, 0, 0]],
  ["RightShoulder", "Chest", (p) => [-0.02 * p.shoulders, 0.088, -0.004]],
  ["RightArm", "RightShoulder", (p) => [-0.08 * p.shoulders, 0, 0]],
  ["RightForeArm", "RightArm", (p) => [-0.186 * p.arms, 0, 0]],
  ["RightHand", "RightForeArm", (p) => [-0.146 * p.arms, 0, 0]],
  ["LeftUpLeg", "Hips", (p) => [0.052 * p.hips, -0.02, 0]],
  ["LeftLeg", "LeftUpLeg", (p) => [0, -0.245 * p.legs, 0]],
  ["LeftFoot", "LeftLeg", (p) => [0, -0.246 * p.legs, 0]],
  ["LeftToe", "LeftFoot", (p) => [0, -0.035, 0.078 * (p.feet ?? 1)]],
  ["RightUpLeg", "Hips", (p) => [-0.052 * p.hips, -0.02, 0]],
  ["RightLeg", "RightUpLeg", (p) => [0, -0.245 * p.legs, 0]],
  ["RightFoot", "RightLeg", (p) => [0, -0.246 * p.legs, 0]],
  ["RightToe", "RightFoot", (p) => [0, -0.035, 0.078 * (p.feet ?? 1)]],
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
