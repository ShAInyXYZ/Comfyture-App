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
  { id: "stand", name: "Stand", joints: { ...relaxed } },
  { id: "walk", name: "Walk", joints: {
    Spine: [2, -4, 0], Chest: [0, 6, 0], Head: [0, -2, 0],
    LeftArm: [24, 0, -76], RightArm: [-26, 0, 76],
    LeftForeArm: [0, -12, 0], RightForeArm: [0, 28, 0],
    LeftUpLeg: [-26, 0, 0], LeftLeg: [8, 0, 0], LeftFoot: [-6, 0, 0],
    RightUpLeg: [18, 0, 0], RightLeg: [22, 0, 0], RightFoot: [12, 0, 0],
  } },
  { id: "run", name: "Run", joints: {
    Spine: [14, -6, 0], Chest: [4, 10, 0], Head: [-10, -4, 0],
    LeftArm: [40, 0, -70], RightArm: [-52, 0, 70],
    LeftForeArm: [0, -82, 0], RightForeArm: [0, 92, 0],
    LeftUpLeg: [-62, 0, 0], LeftLeg: [74, 0, 0], LeftFoot: [-10, 0, 0],
    RightUpLeg: [26, 0, 0], RightLeg: [48, 0, 0], RightFoot: [28, 0, 0],
  } },
  { id: "sit", name: "Sit", joints: {
    Spine: [4, 0, 0],
    LeftArm: [-30, 0, -72], RightArm: [-30, 0, 72], LeftForeArm: [0, -40, 0], RightForeArm: [0, 40, 0],
    LeftUpLeg: [-88, 0, -4], LeftLeg: [88, 0, 0], RightUpLeg: [-88, 0, 4], RightLeg: [88, 0, 0],
  } },
  { id: "kneel", name: "Kneel", joints: {
    ...relaxed,
    LeftUpLeg: [-86, 0, 0], LeftLeg: [88, 0, 0],
    RightUpLeg: [8, 0, 0], RightLeg: [98, 0, 0], RightFoot: [-30, 0, 0],
  } },
  { id: "crouch", name: "Crouch", joints: {
    Spine: [28, 0, 0], Chest: [14, 0, 0], Head: [-24, 0, 0],
    LeftArm: [-40, 0, -64], RightArm: [-40, 0, 64], LeftForeArm: [0, -50, 0], RightForeArm: [0, 50, 0],
    LeftUpLeg: [-112, 0, -10], LeftLeg: [136, 0, 0], LeftFoot: [-20, 0, 0],
    RightUpLeg: [-112, 0, 10], RightLeg: [136, 0, 0], RightFoot: [-20, 0, 0],
  } },
  { id: "lie", name: "Lie down", joints: {
    Hips: [-90, 0, 0],
    LeftArm: [0, 0, -84], RightArm: [0, 0, 84],
  } },
  { id: "point", name: "Point", joints: {
    Chest: [0, -12, 0], Head: [0, -18, 0],
    LeftArm: [0, 0, -76], LeftForeArm: [0, -10, 0],
    RightArm: [0, 84, -4], RightForeArm: [0, 4, 0],
  } },
  { id: "wave", name: "Wave", joints: {
    Head: [0, -6, 4],
    LeftArm: [0, 0, -76], LeftForeArm: [0, -10, 0],
    RightArm: [-90, 0, -14], RightForeArm: [0, 96, 0], RightHand: [0, 0, 10],
  } },
  { id: "arms-crossed", name: "Arms crossed", joints: {
    LeftArm: [-62, 0, -66], RightArm: [-58, 0, 66],
    LeftForeArm: [0, -126, 0], RightForeArm: [0, 122, 0],
  } },
  { id: "fight", name: "Fighting stance", joints: {
    Spine: [8, 22, 0], Chest: [4, 12, 0], Head: [-8, -30, 0],
    LeftArm: [-50, 0, -56], RightArm: [-40, 0, 62],
    LeftForeArm: [0, -128, 0], RightForeArm: [0, 136, 0],
    LeftUpLeg: [-24, 0, -6], LeftLeg: [26, 0, 0],
    RightUpLeg: [14, 0, 10], RightLeg: [22, 0, 0], RightFoot: [10, 0, 0],
  } },
  { id: "hero-landing", name: "Hero landing", joints: {
    Spine: [34, 0, 0], Chest: [16, 0, 0], Head: [-34, 0, 0],
    LeftArm: [-70, 0, -40], LeftForeArm: [0, -10, 0],
    RightArm: [40, 0, 50], RightForeArm: [0, 20, 0],
    LeftUpLeg: [-118, 0, -12], LeftLeg: [140, 0, 0], LeftFoot: [-20, 0, 0],
    RightUpLeg: [-6, 0, 14], RightLeg: [112, 0, 0], RightFoot: [-40, 0, 0],
  } },
  { id: "reach", name: "Reach up", joints: {
    Chest: [-6, 0, 0], Head: [-24, 0, 0],
    LeftArm: [0, 0, -76], LeftForeArm: [0, -10, 0],
    RightArm: [0, 0, -82], RightForeArm: [0, 6, 0],
    LeftFoot: [-8, 0, 0], RightFoot: [-8, 0, 0],
  } },
  { id: "t-pose", name: "T-pose", joints: {} },
];

export const poseById = (id) => POSES.find((p) => p.id === id);
