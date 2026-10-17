// Pose presets as Euler degrees (XYZ) per joint, from the T-pose rest.
// Axes, for the character facing +Z with its left at +X:
//   arms: Z lowers a left arm when negative (a right arm when positive); Y swings it forward
//         (left −, right +); X turns it about its own length (after it is lowered, X swings it
//         forward when negative)
//   elbows: left forearm folds forward with −Y, right with +Y
//   legs: X lifts a thigh forward when negative; knees fold with +X
//   spine, neck, head: +X leans forward, Y turns, Z tilts

const relaxed = {
  LeftArm: [0, 0, -76], RightArm: [0, 0, 76],
  LeftForeArm: [0, -10, 0], RightForeArm: [0, 10, 0],
};

export const POSES = [
  { id: "stand", category: "Stand", name: "Stand", joints: { ...relaxed } },
  { id: "walk", category: "Move", name: "Walk", joints: {
    Spine: [2, -4, 0], Chest: [0, 6, 0], Head: [0, -2, 0],
    LeftArm: [24, 0, -76], RightArm: [-26, 0, 76],
    LeftForeArm: [0, -12, 0], RightForeArm: [0, 28, 0],
    LeftUpLeg: [-26, 0, 0], LeftLeg: [8, 0, 0], LeftFoot: [-6, 0, 0],
    RightUpLeg: [18, 0, 0], RightLeg: [22, 0, 0], RightFoot: [12, 0, 0],
  } },
  { id: "run", category: "Move", name: "Run", joints: {
    Spine: [14, -6, 0], Chest: [4, 10, 0], Head: [-10, -4, 0],
    LeftArm: [40, 0, -70], RightArm: [-52, 0, 70],
    LeftForeArm: [0, -82, 0], RightForeArm: [0, 92, 0],
    LeftUpLeg: [-62, 0, 0], LeftLeg: [74, 0, 0], LeftFoot: [-10, 0, 0],
    RightUpLeg: [26, 0, 0], RightLeg: [48, 0, 0], RightFoot: [28, 0, 0],
  } },
  { id: "sit", category: "Sit", name: "Sit", joints: {
    Spine: [4, 0, 0],
    LeftArm: [-30, 0, -72], RightArm: [-30, 0, 72], LeftForeArm: [0, -40, 0], RightForeArm: [0, 40, 0],
    LeftUpLeg: [-88, 0, -4], LeftLeg: [88, 0, 0], RightUpLeg: [-88, 0, 4], RightLeg: [88, 0, 0],
  } },
  { id: "kneel", category: "Sit", name: "Kneel", joints: {
    ...relaxed,
    LeftUpLeg: [-86, 0, 0], LeftLeg: [88, 0, 0],
    RightUpLeg: [8, 0, 0], RightLeg: [98, 0, 0], RightFoot: [-30, 0, 0],
  } },
  { id: "crouch", category: "Sit", name: "Crouch", joints: {
    Spine: [28, 0, 0], Chest: [14, 0, 0], Head: [-24, 0, 0],
    LeftArm: [-40, 0, -64], RightArm: [-40, 0, 64], LeftForeArm: [0, -50, 0], RightForeArm: [0, 50, 0],
    LeftUpLeg: [-112, 0, -10], LeftLeg: [136, 0, 0], LeftFoot: [-20, 0, 0],
    RightUpLeg: [-112, 0, 10], RightLeg: [136, 0, 0], RightFoot: [-20, 0, 0],
  } },
  { id: "lie", category: "Sit", name: "Lie down", joints: {
    Hips: [-90, 0, 0],
    LeftArm: [0, 0, -84], RightArm: [0, 0, 84],
  } },
  { id: "point", category: "Gesture", name: "Point", joints: {
    Chest: [0, -12, 0], Head: [0, -18, 0],
    LeftArm: [0, 0, -76], LeftForeArm: [0, -10, 0],
    RightArm: [0, 84, -4], RightForeArm: [0, 4, 0],
  } },
  { id: "wave", category: "Gesture", name: "Wave", joints: {
    Head: [0, -6, 4],
    LeftArm: [0, 0, -76], LeftForeArm: [0, -10, 0],
    RightArm: [-90, 0, -14], RightForeArm: [0, 96, 0], RightHand: [0, 0, 10],
  } },
  { id: "arms-crossed", category: "Stand", name: "Arms crossed", joints: {
    LeftArm: [-62, 0, -66], RightArm: [-58, 0, 66],
    LeftForeArm: [0, -126, 0], RightForeArm: [0, 122, 0],
  } },
  { id: "fight", category: "Action", name: "Fighting stance", joints: {
    Spine: [8, 22, 0], Chest: [4, 12, 0], Head: [-8, -30, 0],
    LeftArm: [-50, 0, -56], RightArm: [-40, 0, 62],
    LeftForeArm: [0, -128, 0], RightForeArm: [0, 136, 0],
    LeftUpLeg: [-24, 0, -6], LeftLeg: [26, 0, 0],
    RightUpLeg: [14, 0, 10], RightLeg: [22, 0, 0], RightFoot: [10, 0, 0],
  } },
  { id: "hero-landing", category: "Action", name: "Hero landing", joints: {
    Spine: [34, 0, 0], Chest: [16, 0, 0], Head: [-34, 0, 0],
    LeftArm: [-70, 0, -40], LeftForeArm: [0, -10, 0],
    RightArm: [40, 0, 50], RightForeArm: [0, 20, 0],
    LeftUpLeg: [-118, 0, -12], LeftLeg: [140, 0, 0], LeftFoot: [-20, 0, 0],
    RightUpLeg: [-6, 0, 14], RightLeg: [112, 0, 0], RightFoot: [-40, 0, 0],
  } },
  { id: "reach", category: "Gesture", name: "Reach up", joints: {
    Chest: [-6, 0, 0], Head: [-24, 0, 0],
    LeftArm: [0, 0, -76], LeftForeArm: [0, -10, 0],
    RightArm: [0, 0, -82], RightForeArm: [0, 6, 0],
    LeftFoot: [-8, 0, 0], RightFoot: [-8, 0, 0],
  } },
  // hands in the front pockets, solved by reaching each hand to the hip and kept as angles
  { id: "hands-in-pockets", category: "Stand", name: "Hands in pockets", joints: {
    Head: [2, 0, 0],
    LeftArm: [4, 1, -74], LeftForeArm: [-11, -27, -44], RightArm: [4, -1, 74], RightForeArm: [-11, 27, 44],
  } },
  // leaning back on a wall: the body tipped back from the feet, hands in pockets, the right sole flat on the wall
  { id: "lean-back", category: "Stand", name: "Lean back", joints: {
    Hips: [-11, 0, 0], Spine: [-2, 0, 0], Head: [10, 12, 0],
    LeftArm: [1, 0, -78], LeftForeArm: [-7, -22, -34], RightArm: [1, 0, 78], RightForeArm: [-7, 22, 34],
    LeftUpLeg: [2, 0, -3], RightUpLeg: [-15, 0, 3], RightLeg: [80, 0, 0], RightFoot: [25, 0, 0],
  } },
  // solved by reaching each hand to the hip from an arm bent in the body's plane, so the elbows point out
  { id: "hands-on-hips", category: "Stand", name: "Hands on hips", joints: {
    Head: [-2, 0, 0],
    LeftArm: [-35, 40, -66], LeftForeArm: [-1, 58, 2], RightArm: [-35, -40, 66], RightForeArm: [-1, -58, -2],
    LeftUpLeg: [0, 0, 4], RightUpLeg: [0, 0, -4],
  } },
  { id: "thinking", category: "Gesture", name: "Thinking", joints: {
    Head: [8, -6, 4],
    LeftArm: [-48, 0, -70], LeftForeArm: [0, -104, 0],
    RightArm: [-70, 0, 70], RightForeArm: [0, 140, 0], RightHand: [0, 0, -30],
  } },
  { id: "phone-call", category: "Gesture", name: "Phone call", joints: {
    Head: [4, 0, 8],
    LeftArm: [0, 0, -76], LeftForeArm: [0, -10, 0],
    RightArm: [-26, -10, 52], RightForeArm: [0, 150, 0], RightHand: [0, 0, -20],
  } },
  { id: "shrug", category: "Gesture", name: "Shrug", joints: {
    Head: [0, 0, -6], LeftShoulder: [0, 0, 12], RightShoulder: [0, 0, -12],
    LeftArm: [0, -30, -62], LeftForeArm: [0, -70, 0], LeftHand: [0, 0, -20],
    RightArm: [0, 30, 62], RightForeArm: [0, 70, 0], RightHand: [0, 0, 20],
  } },
  { id: "talk", category: "Gesture", name: "Talk", joints: {
    Chest: [0, 6, 0], Head: [0, -6, 0],
    LeftArm: [0, -18, -64], LeftForeArm: [0, -72, 0],
    RightArm: [0, 34, 58], RightForeArm: [0, 58, 0], RightHand: [0, 0, 12],
  } },
  { id: "cheer", category: "Gesture", name: "Cheer", joints: {
    Chest: [-6, 0, 0], Head: [-14, 0, 0],
    LeftArm: [0, 0, 62], LeftForeArm: [0, -22, 0], RightArm: [0, 0, -62], RightForeArm: [0, 22, 0],
  } },
  // the upper arms turned a quarter about themselves, so the elbows fold up rather than forward
  { id: "hands-up", category: "Gesture", name: "Hands up", joints: {
    Head: [-4, 0, 0],
    LeftArm: [-90, 0, 8], LeftForeArm: [0, -92, 0], RightArm: [-90, 0, -8], RightForeArm: [0, 92, 0],
  } },
  { id: "bow", category: "Gesture", name: "Bow", joints: {
    Spine: [30, 0, 0], Chest: [22, 0, 0], Head: [12, 0, 0],
    LeftArm: [0, 0, -84], RightArm: [0, 0, 84],
  } },
  { id: "sneak", category: "Move", name: "Sneak", joints: {
    Spine: [22, 0, 0], Chest: [10, 0, 0], Head: [-20, 0, 0],
    LeftArm: [-30, 0, -62], LeftForeArm: [0, -60, 0], RightArm: [10, 0, 66], RightForeArm: [0, 50, 0],
    LeftUpLeg: [-58, 0, 0], LeftLeg: [82, 0, 0], LeftFoot: [-10, 0, 0],
    RightUpLeg: [-6, 0, 0], RightLeg: [62, 0, 0], RightFoot: [10, 0, 0],
  } },
  { id: "jump", category: "Move", name: "Jump", joints: {
    Chest: [-8, 0, 0], Head: [-10, 0, 0],
    LeftArm: [0, 0, 40], LeftForeArm: [0, -30, 0], RightArm: [0, 0, -40], RightForeArm: [0, 30, 0],
    LeftUpLeg: [-70, 0, 0], LeftLeg: [110, 0, 0], RightUpLeg: [-20, 0, 0], RightLeg: [90, 0, 0], RightFoot: [30, 0, 0],
  } },
  { id: "sit-floor", category: "Sit", name: "Sit on the floor", joints: {
    Spine: [10, 0, 0], Head: [-6, 0, 0],
    LeftArm: [-40, 0, -70], LeftForeArm: [0, -40, 0], RightArm: [-40, 0, 70], RightForeArm: [0, 40, 0],
    LeftUpLeg: [-80, 0, -38], LeftLeg: [130, 0, 0], LeftFoot: [0, 0, 20],
    RightUpLeg: [-80, 0, 38], RightLeg: [130, 0, 0], RightFoot: [0, 0, -20],
  } },
  { id: "sit-relaxed", category: "Sit", name: "Sit back", joints: {
    Spine: [-10, 0, 0], Chest: [-6, 0, 0], Head: [10, 0, 0],
    LeftArm: [10, 0, -70], LeftForeArm: [0, -30, 0], RightArm: [10, 0, 70], RightForeArm: [0, 30, 0],
    LeftUpLeg: [-74, 0, -6], LeftLeg: [50, 0, 0], RightUpLeg: [-74, 0, 6], RightLeg: [50, 0, 0],
  } },
  { id: "kick", category: "Action", name: "Kick", joints: {
    Spine: [-12, 0, 0], Head: [10, 0, 0],
    LeftArm: [-30, 0, -40], LeftForeArm: [0, -90, 0], RightArm: [30, 0, 50], RightForeArm: [0, 60, 0],
    RightUpLeg: [-92, 0, 0], RightLeg: [10, 0, 0], RightFoot: [-20, 0, 0],
    LeftLeg: [12, 0, 0],
  } },
  { id: "punch", category: "Action", name: "Punch", joints: {
    Spine: [6, 30, 0], Chest: [4, 20, 0], Head: [-6, -40, 0],
    LeftArm: [-50, 0, -56], LeftForeArm: [0, -128, 0],
    RightArm: [0, 88, 0], RightForeArm: [0, 6, 0],
    LeftUpLeg: [-26, 0, -6], LeftLeg: [26, 0, 0], RightUpLeg: [16, 0, 10], RightLeg: [14, 0, 0],
  } },
  { id: "aim", category: "Action", name: "Aim", joints: {
    Chest: [0, 8, 0], Head: [6, -4, 0],
    LeftArm: [0, -82, -8], LeftForeArm: [0, -20, 0], RightArm: [0, 80, 8], RightForeArm: [0, 20, 0],
    LeftUpLeg: [-14, 0, -4], LeftLeg: [14, 0, 0], RightUpLeg: [8, 0, 4],
  } },
  { id: "carry", category: "Action", name: "Carry", joints: {
    Spine: [-4, 0, 0],
    LeftArm: [-58, 0, -72], LeftForeArm: [0, -76, 0], RightArm: [-58, 0, 72], RightForeArm: [0, 76, 0],
  } },
  { id: "push", category: "Action", name: "Push", joints: {
    Spine: [24, 0, 0], Chest: [8, 0, 0], Head: [-18, 0, 0],
    LeftArm: [0, -70, -24], LeftForeArm: [0, -30, 0], RightArm: [0, 70, 24], RightForeArm: [0, 30, 0],
    LeftUpLeg: [-40, 0, 0], LeftLeg: [40, 0, 0], RightUpLeg: [26, 0, 0], RightLeg: [10, 0, 0], RightFoot: [20, 0, 0],
  } },
  { id: "t-pose", category: "Stand", name: "T-pose", joints: {} },
];

export const POSE_CATEGORIES = ["Stand", "Move", "Sit", "Gesture", "Action", "Mine"];

// the poses you saved, from the server; each keeps its joints as quaternions
export const SAVED = [];
export function setSaved(list) {
  SAVED.length = 0;
  for (const p of list ?? []) if (p?.id && p.quaternions) SAVED.push({ ...p, category: "Mine" });
}

export const poseById = (id) => POSES.find((p) => p.id === id) ?? SAVED.find((p) => p.id === id);
export const allPoses = () => [...POSES, ...SAVED];
