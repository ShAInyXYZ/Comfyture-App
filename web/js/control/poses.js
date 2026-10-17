// The pose library. A pose is written three ways, laid one over the other:
//   joints: Euler degrees (XYZ) per joint, from the T-pose rest. For the spine, neck and head
//           +X leans forward, Y turns, Z tilts; for the hips the same, for the whole body.
//   aim:    the direction a bone points, in the body's own frame (+x its left, +y up, +z
//           forward), with an optional twist about the bone: [x, y, z, twist°]. "The forearm
//           points up" is { LeftForeArm: [0, 1, 0] }.
//   reach:  contacts, solved by IK on the body that takes the pose: a hand (or a foot) goes to
//           a joint plus an offset in heights, and with surface onto the skin on that side and
//           clear of it, so hands find hips, chins and knees on any body type.
//   grip:   how a hand holds what it holds, last: where its palm faces and where its thumb
//           points, in the body's frame ({ RightHand: { palm: [0, 0, 1], thumb: [0, 1, 0] } }).
// seat says what a pose sits on: a chair (stage furniture takes it) or the floor; kneeling and
// lying need none. hold says what the pose puts in a hand (a hand prop from models/hand).

const L = (x, y, z, twist = 0) => [x, y, z, twist];
const R = (x, y, z, twist = 0) => [-x, y, z, -twist];
// arms hanging easy, the elbows a little bent
const relaxed = { LeftArm: L(0.2, -1, 0), LeftForeArm: L(0.1, -1, 0.16), RightArm: R(0.2, -1, 0), RightForeArm: R(0.1, -1, 0.16) };
const relaxedLeft = { LeftArm: relaxed.LeftArm, LeftForeArm: relaxed.LeftForeArm };
const relaxedRight = { RightArm: relaxed.RightArm, RightForeArm: relaxed.RightForeArm };
// seated on a chair: thighs level and forward, shins down
const seated = { LeftUpLeg: L(0.07, -0.04, 1), LeftLeg: L(0, -1, 0.05), RightUpLeg: R(0.07, -0.04, 1), RightLeg: R(0, -1, 0.05) };
// a hand resting on the top of its own knee
const onKnee = (side, back = 0.05) => ({ at: `${side}Leg`, offset: [0, 0, -back], surface: "top", clear: 0.012 });
// a hand in its front trouser pocket: the wrist at the hip's front, the hand down inside the leg
const pocket = (side) => ({ at: `${side}UpLeg`, offset: [side === "Left" ? 0.035 : -0.035, 0.012, 0], surface: "front", clear: -0.018 });
const pockets = { LeftHand: L(0.1, -1, 0.12), RightHand: R(0.1, -1, 0.12) };

export const POSES = [
  // ---------------------------------------------------------------- standing
  { id: "stand", category: "Stand", name: "Stand", aim: { ...relaxed } },
  { id: "stand-weight", category: "Stand", name: "Weight on one leg", joints: { Hips: [0, 6, -5], Spine: [0, -3, 3], Chest: [0, -3, 3], Head: [0, 6, -3] },
    aim: { ...relaxed, LeftUpLeg: L(0.1, -1, 0.12), LeftLeg: L(0.02, -1, -0.12), RightUpLeg: R(0.02, -1, 0), RightLeg: R(0.02, -1, 0) } },
  { id: "arms-crossed", category: "Stand", name: "Arms crossed", joints: { Head: [-3, 0, 0] },
    aim: { LeftArm: L(0.32, -1, 0.3), LeftForeArm: L(-1, 0.15, 0.3), RightArm: R(0.32, -1, 0.3), RightForeArm: R(-1, 0.1, 0.35), LeftHand: L(-0.5, 0.1, -0.85), RightHand: R(-0.5, 0.15, -0.85) },
    reach: { RightHand: { at: "Chest", offset: [0.04, -0.03, 0], surface: "front", clear: 0.02 }, LeftHand: { at: "Chest", offset: [-0.04, -0.045, 0], surface: "front", clear: 0.045 } } },
  { id: "hands-on-hips", category: "Stand", name: "Hands on hips", joints: { Head: [-2, 0, 0], LeftHand: [0, 0, -25], RightHand: [0, 0, 25] },
    aim: { LeftArm: L(0.8, -0.6, -0.1), LeftForeArm: L(-0.4, -0.6, 0.4), RightArm: R(0.8, -0.6, -0.1), RightForeArm: R(-0.4, -0.6, 0.4), LeftUpLeg: L(0.08, -1, 0), RightUpLeg: R(0.08, -1, 0) },
    reach: { LeftHand: { at: "Spine", offset: [0, -0.04, -0.012], surface: "left", clear: 0.01 }, RightHand: { at: "Spine", offset: [0, -0.04, -0.012], surface: "right", clear: 0.01 } } },
  { id: "hands-in-pockets", category: "Stand", name: "Hands in pockets", joints: { Head: [2, 0, 0] },
    aim: { LeftArm: L(0.25, -1, -0.08), LeftForeArm: L(-0.1, -1, 0.35), RightArm: R(0.25, -1, -0.08), RightForeArm: R(-0.1, -1, 0.35), ...pockets },
    reach: { LeftHand: pocket("Left"), RightHand: pocket("Right") } },
  { id: "hands-behind-back", category: "Stand", name: "Hands behind the back", joints: { Head: [-4, 0, 0], Chest: [-3, 0, 0] },
    aim: { LeftArm: L(0.22, -1, -0.3), LeftForeArm: L(-0.6, -0.3, -0.5), RightArm: R(0.22, -1, -0.3), RightForeArm: R(-0.6, -0.3, -0.5) },
    reach: { LeftHand: { at: "Hips", offset: [0.015, 0.045, 0], surface: "back", clear: 0.02 }, RightHand: { at: "Hips", offset: [-0.015, 0.055, 0], surface: "back", clear: 0.04 } } },
  // leaning back on a wall: the body tipped back from the feet, hands in pockets, the right sole flat on the wall
  { id: "lean-back", category: "Stand", name: "Lean back", joints: { Hips: [-11, 0, 0], Spine: [-2, 0, 0], Head: [10, 12, 0], LeftUpLeg: [2, 0, -3], RightUpLeg: [-15, 0, 3], RightLeg: [80, 0, 0], RightFoot: [25, 0, 0] },
    aim: { LeftArm: L(0.25, -1, -0.12), LeftForeArm: L(-0.1, -1, 0.3), RightArm: R(0.25, -1, -0.12), RightForeArm: R(-0.1, -1, 0.3), ...pockets },
    reach: { LeftHand: pocket("Left"), RightHand: pocket("Right") } },
  // forearms on a counter or a railing, leaning in
  { id: "lean-on", category: "Stand", name: "Lean on a counter", joints: { Spine: [18, 0, 0], Chest: [12, 0, 0], Head: [-24, 0, 0] },
    aim: { LeftArm: L(0.22, -0.85, 0.5), LeftForeArm: L(-0.45, -0.02, 0.9), RightArm: R(0.22, -0.85, 0.5), RightForeArm: R(-0.45, -0.02, 0.9),
      LeftUpLeg: L(0.04, -1, -0.12), RightUpLeg: R(0.1, -1, -0.1), RightLeg: R(-0.05, -1, -0.1) } },
  { id: "look-up", category: "Stand", name: "Look up", joints: { Chest: [-6, 0, 0], Neck: [-16, 0, 0], Head: [-34, 0, 0] }, aim: { ...relaxed } },
  { id: "slouch", category: "Stand", name: "Tired", joints: { Spine: [6, 0, 0], Chest: [16, 0, 0], Neck: [14, 0, 0], Head: [14, 0, 0], LeftShoulder: [0, -14, -8], RightShoulder: [0, 14, 8] },
    aim: { LeftArm: L(0.12, -1, 0.14), LeftForeArm: L(0.05, -1, 0.12), RightArm: R(0.12, -1, 0.14), RightForeArm: R(0.05, -1, 0.12), LeftUpLeg: L(0.05, -1, 0.06), LeftLeg: L(0, -1, -0.04) } },
  { id: "cold", category: "Stand", name: "Cold", joints: { Head: [12, 0, 0], LeftShoulder: [0, -8, 12], RightShoulder: [0, 8, -12] },
    aim: { LeftArm: L(0.22, -1, 0.5), RightArm: R(0.22, -1, 0.5), LeftUpLeg: L(0, -1, 0), RightUpLeg: R(0, -1, 0), LeftHand: L(-0.4, 0.2, -0.9), RightHand: R(-0.4, 0.2, -0.9) },
    reach: { RightHand: { at: "Chest", offset: [0.06, 0.0, 0], surface: "front", clear: 0.03 }, LeftHand: { at: "Chest", offset: [-0.06, 0.02, 0], surface: "front", clear: 0.055 } } },
  { id: "t-pose", category: "Stand", name: "T-pose", joints: {} },

  // ---------------------------------------------------------------- moving
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
  // walking, eyes on the phone held in both hands
  { id: "walk-phone", category: "Move", name: "Walk on the phone", hold: { right: "phone" }, joints: {
    Spine: [4, 0, 0], Neck: [12, 0, 0], Head: [26, 0, 0],
    LeftUpLeg: [-22, 0, 0], LeftLeg: [8, 0, 0], LeftFoot: [-6, 0, 0], RightUpLeg: [16, 0, 0], RightLeg: [20, 0, 0], RightFoot: [10, 0, 0] },
    aim: { LeftArm: L(0.12, -1, 0.06), RightArm: R(0.12, -1, 0.06) },
    reach: { LeftHand: { at: "Chest", offset: [0.025, -0.01, 0], surface: "front", clear: 0.19 }, RightHand: { at: "Chest", offset: [-0.025, -0.01, 0], surface: "front", clear: 0.2 } },
    grip: { RightHand: { palm: [0, 0.8, -0.6], thumb: [0, 0.6, 0.8] } } },
  // up a ladder: one hand high, one knee up
  { id: "climb", category: "Move", name: "Climb", joints: { Head: [-16, 0, 0] },
    aim: { RightArm: R(0.12, 1, 0.25), RightForeArm: R(0.05, 1, 0.12), LeftArm: L(0.22, -0.2, 1), LeftForeArm: L(-0.1, 0.9, 0.35),
      LeftUpLeg: L(0.04, -0.2, 1), LeftLeg: L(0, -1, 0.05), RightUpLeg: R(0.04, -1, 0.05), RightLeg: R(0, -1, -0.1) } },
  // stumbling backwards, arms thrown out
  { id: "fall", category: "Move", name: "Stumble", joints: { Hips: [-12, 0, 0], Spine: [-10, 0, 0], Head: [18, 0, 0] },
    aim: { LeftArm: L(0.7, 0.55, 0.45), LeftForeArm: L(0.4, 0.85, 0.35), RightArm: R(0.75, 0.4, 0.55), RightForeArm: R(0.5, 0.8, 0.3),
      LeftUpLeg: L(0.05, -0.55, 0.85), LeftLeg: L(0, -1, 0.35), RightUpLeg: R(0.02, -1, 0.15), RightLeg: R(0, -1, 0.05) } },
  { id: "dance", category: "Move", name: "Dance", joints: { Hips: [0, 10, 6], Chest: [0, -10, -8], Head: [-6, -10, 6] },
    aim: { RightArm: R(0.3, 1, 0.1), RightForeArm: R(-0.1, 1, 0.1), LeftArm: L(0.85, -0.35, 0.4), LeftForeArm: L(0.3, 0.6, 0.8),
      LeftUpLeg: L(0.12, -1, 0.25), LeftLeg: L(0.05, -1, -0.25), RightUpLeg: R(0.06, -1, 0) } },

  // ---------------------------------------------------------------- sitting and lying
  { id: "sit", category: "Sit", name: "Sit", seat: "chair", joints: { Spine: [4, 0, 0] },
    aim: { ...seated, LeftArm: L(0.18, -1, 0.25), RightArm: R(0.18, -1, 0.25) },
    reach: { LeftHand: onKnee("Left", 0.07), RightHand: onKnee("Right", 0.07) } },
  { id: "sit-relaxed", category: "Sit", name: "Sit back", seat: "chair", joints: {
    Spine: [-10, 0, 0], Chest: [-6, 0, 0], Head: [10, 0, 0],
    LeftArm: [10, 0, -70], LeftForeArm: [0, -30, 0], RightArm: [10, 0, 70], RightForeArm: [0, 30, 0],
    LeftUpLeg: [-74, 0, -6], LeftLeg: [50, 0, 0], RightUpLeg: [-74, 0, 6], RightLeg: [50, 0, 0],
  } },
  { id: "sit-cross-legs", category: "Sit", name: "Sit, legs crossed", seat: "chair", joints: { Spine: [-4, 0, 0], Head: [4, 0, 0] },
    aim: { LeftUpLeg: L(0.06, -0.04, 1), LeftLeg: L(0, -1, 0.05), RightUpLeg: R(-0.3, 0.22, 0.95), RightLeg: R(-0.12, -1, 0.12),
      LeftArm: L(0.18, -1, 0.2), RightArm: R(0.15, -1, 0.3) },
    reach: { RightHand: onKnee("Right", 0.03), LeftHand: onKnee("Left", 0.1) } },
  // at a desk, typing
  { id: "sit-desk", category: "Sit", name: "Sit at a desk", seat: "chair", joints: { Spine: [6, 0, 0], Chest: [4, 0, 0], Head: [8, 0, 0] },
    aim: { ...seated, LeftArm: L(0.15, -1, 0.4), LeftForeArm: L(-0.15, -0.05, 1), RightArm: R(0.15, -1, 0.4), RightForeArm: R(-0.15, -0.05, 1) } },
  // elbows on the knees, leaning in
  { id: "sit-hunched", category: "Sit", name: "Sit hunched", seat: "chair", joints: { Spine: [28, 0, 0], Chest: [14, 0, 0], Head: [-22, 0, 0] },
    aim: { LeftUpLeg: L(0.1, -0.05, 1), LeftLeg: L(0, -1, -0.15), RightUpLeg: R(0.1, -0.05, 1), RightLeg: R(0, -1, -0.15), LeftArm: L(0.1, -0.85, 0.55), RightArm: R(0.1, -0.85, 0.55) },
    reach: { LeftHand: { at: "LeftLeg", to: "RightLeg", offset: [0.02, 0.06, 0.04] }, RightHand: { at: "LeftLeg", to: "RightLeg", offset: [-0.02, 0.05, 0.04] } } },
  // at the wheel: leaning back, feet on the pedals
  { id: "drive", category: "Sit", name: "Drive", hold: { right: "steering-wheel" }, seat: "chair", joints: { Spine: [-8, 0, 0], Head: [6, 0, 0] },
    aim: { LeftUpLeg: L(0.06, 0.1, 1), LeftLeg: L(0, -0.6, 0.8), RightUpLeg: R(0.06, 0.1, 1), RightLeg: R(0, -0.6, 0.8), LeftArm: L(0.22, -0.6, 0.8), RightArm: R(0.22, -0.6, 0.8) },
    reach: { LeftHand: { at: "Chest", offset: [0.1, -0.02, 0], surface: "front", clear: 0.3 }, RightHand: { at: "Chest", offset: [-0.1, -0.02, 0], surface: "front", clear: 0.3 } },
    grip: { RightHand: { palm: [0, 0.5, -0.87], thumb: [0, 0.87, 0.5] }, LeftHand: { palm: [0, 0.5, -0.87], thumb: [0, 0.87, 0.5] } } },
  { id: "sit-floor", category: "Sit", name: "Sit cross-legged", seat: "floor", joints: { Spine: [10, 0, 0], Head: [-6, 0, 0] },
    aim: { LeftUpLeg: L(0.85, -0.12, 0.55), LeftLeg: L(-0.85, -0.12, 0.42), RightUpLeg: R(0.85, -0.12, 0.55), RightLeg: R(-0.85, -0.12, 0.48), LeftArm: L(0.25, -1, 0.3), RightArm: R(0.25, -1, 0.3) },
    reach: { LeftHand: onKnee("Left", 0.02), RightHand: onKnee("Right", 0.02) } },
  // on the floor, hugging the knees
  { id: "sit-knees-up", category: "Sit", name: "Hug the knees", seat: "floor", joints: { Spine: [22, 0, 0], Chest: [10, 0, 0], Head: [-12, 0, 0] },
    aim: { LeftUpLeg: L(0.08, 0.75, 0.65), LeftLeg: L(0, -1, 0.12), RightUpLeg: R(0.08, 0.75, 0.65), RightLeg: R(0, -1, 0.12), LeftArm: L(0.35, -0.3, 1), RightArm: R(0.35, -0.3, 1) },
    reach: { LeftHand: { at: "RightLeg", offset: [0, -0.07, 0], surface: "front", clear: 0.02 }, RightHand: { at: "LeftLeg", offset: [0, -0.08, 0], surface: "front", clear: 0.045 } } },
  { id: "kneel", category: "Sit", name: "Kneel", joints: { LeftUpLeg: [-86, 0, 0], LeftLeg: [88, 0, 0], RightUpLeg: [8, 0, 0], RightLeg: [98, 0, 0], RightFoot: [-30, 0, 0] },
    aim: { ...relaxedRight, LeftArm: L(0.1, -1, 0.45) }, reach: { LeftHand: onKnee("Left", 0.04) } },
  { id: "crouch", category: "Sit", name: "Crouch", joints: {
    Spine: [28, 0, 0], Chest: [14, 0, 0], Head: [-24, 0, 0],
    LeftArm: [-40, 0, -64], RightArm: [-40, 0, 64], LeftForeArm: [0, -50, 0], RightForeArm: [0, 50, 0],
    LeftUpLeg: [-112, 0, -10], LeftLeg: [136, 0, 0], LeftFoot: [-20, 0, 0],
    RightUpLeg: [-112, 0, 10], RightLeg: [136, 0, 0], RightFoot: [-20, 0, 0],
  } },
  { id: "lie", category: "Sit", name: "Lie down", joints: { Hips: [-90, 0, 0], LeftArm: [0, 0, -84], RightArm: [0, 0, 84] } },
  // on the left side, knees drawn up, the head on the lower arm
  { id: "lie-side", category: "Sit", name: "Lie on the side", joints: { Hips: [0, 0, -90], Head: [0, 0, -14] },
    aim: { LeftUpLeg: L(-0.7, 0, 0.7), LeftLeg: L(-1, 0, -0.25), RightUpLeg: R(0.55, 0.06, 0.8), RightLeg: R(1, 0.05, -0.3),
      LeftArm: L(0.45, 0, 1), LeftForeArm: L(1, 0, 0.35), RightArm: R(0.9, 0.25, 0.35), RightForeArm: R(0.8, 0.05, 0.6) } },
  // face down, up on the elbows, feet in the air
  { id: "lie-front", category: "Sit", name: "Lie on the front", joints: { Hips: [90, 0, 0], Spine: [-22, 0, 0], Chest: [-20, 0, 0], Head: [-34, 0, 0] },
    aim: { LeftArm: L(0.15, -1, 0.12), LeftForeArm: L(-0.12, -0.05, 1), RightArm: R(0.15, -1, 0.12), RightForeArm: R(-0.12, -0.05, 1),
      LeftUpLeg: L(0.06, 0, -1), LeftLeg: L(0, 0.35, -1), RightUpLeg: R(0.06, 0, -1), RightLeg: R(0, 0.75, -0.7) } },

  // ---------------------------------------------------------------- gestures
  { id: "point", category: "Gesture", name: "Point", joints: { Chest: [0, -12, 0], Head: [0, -16, 0] },
    aim: { ...relaxedLeft, RightArm: R(0.15, 0.05, 1), RightForeArm: R(0.1, 0.08, 1) } },
  { id: "wave", category: "Gesture", name: "Wave", joints: { Head: [0, -6, 4] },
    aim: { ...relaxedLeft, RightArm: R(0.85, 0.45, 0.2), RightForeArm: R(0.15, 1, 0.12) } },
  { id: "thinking", category: "Gesture", name: "Thinking", joints: { Head: [6, -6, 6] },
    aim: { RightArm: R(0.15, -1, 0.35), LeftArm: L(0.2, -1, 0.3) },
    reach: { RightHand: { at: "Head", offset: [0, -0.075, 0], surface: "front", clear: 0.03 }, LeftHand: { at: "RightForeArm", offset: [0.0, -0.015, 0.03] } } },
  { id: "phone-call", category: "Gesture", name: "Phone call", hold: { right: "phone" }, joints: { Head: [4, 0, 8] },
    aim: { ...relaxedLeft, RightArm: R(0.3, -1, 0.2) }, reach: { RightHand: { at: "Head", offset: [0, -0.02, 0.012], surface: "right", clear: 0.02 } },
    grip: { RightHand: { palm: [1, 0, 0], thumb: [0, 0.6, -0.5] } } },
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
  { id: "cheer", category: "Gesture", name: "Cheer", joints: { Chest: [-6, 0, 0], Head: [-14, 0, 0] },
    aim: { LeftArm: L(0.6, 1, 0.1), LeftForeArm: L(0.4, 1, 0.05), RightArm: R(0.6, 1, 0.1), RightForeArm: R(0.4, 1, 0.05) } },
  { id: "hands-up", category: "Gesture", name: "Hands up", joints: { Head: [-4, 0, 0] },
    aim: { LeftArm: L(1, 0.1, 0.05), LeftForeArm: L(0, 1, 0.05), RightArm: R(1, 0.1, 0.05), RightForeArm: R(0, 1, 0.05) } },
  { id: "bow", category: "Gesture", name: "Bow", joints: { Spine: [30, 0, 0], Chest: [22, 0, 0], Head: [12, 0, 0], LeftArm: [0, 0, -84], RightArm: [0, 0, 84] } },
  { id: "thumbs-up", category: "Gesture", name: "Thumbs up", joints: { Head: [0, -4, 4] },
    aim: { ...relaxedLeft, RightArm: R(0.2, -1, 0.3), RightForeArm: R(0.1, 0.1, 1, -90) } },
  { id: "facepalm", category: "Gesture", name: "Facepalm", joints: { Neck: [10, 0, 0], Head: [22, 0, 0] },
    aim: { ...relaxedLeft, RightArm: R(0.1, -1, 0.5) }, reach: { RightHand: { at: "Head", offset: [0, -0.06, 0], surface: "front", clear: 0.02 } } },
  { id: "salute", category: "Gesture", name: "Salute", joints: { Head: [-3, 0, 0] },
    aim: { ...relaxedLeft, RightArm: R(1, 0.12, 0.35) }, reach: { RightHand: { at: "Head", offset: [-0.06, 0.03, 0], surface: "front", clear: 0.02 } } },
  { id: "stop", category: "Gesture", name: "Stop", joints: { RightHand: [0, 0, -70] },
    aim: { ...relaxedLeft, RightArm: R(0.15, -0.1, 1), RightForeArm: R(0.05, 0.25, 1) } },
  { id: "hand-on-heart", category: "Gesture", name: "Hand on heart", joints: { Head: [-4, 0, 0] },
    aim: { ...relaxedLeft, RightArm: R(0.15, -1, 0.3) }, reach: { RightHand: { at: "Chest", offset: [0.035, 0.02, 0], surface: "front", clear: 0.015 } } },
  { id: "pray", category: "Gesture", name: "Hands together", joints: { Head: [14, 0, 0] },
    aim: { LeftArm: L(0.3, -1, 0.2), RightArm: R(0.3, -1, 0.2), LeftHand: L(-0.06, 1, 0.3, 90), RightHand: R(-0.06, 1, 0.3, 90) },
    reach: { LeftHand: { at: "Chest", offset: [0.02, -0.01, 0], surface: "front", clear: 0.07 }, RightHand: { at: "Chest", offset: [-0.02, -0.01, 0], surface: "front", clear: 0.07 } } },
  { id: "look-at-watch", category: "Gesture", name: "Check the time", joints: { Head: [26, 10, 0] },
    aim: { ...relaxedRight, LeftArm: L(0.25, -1, 0.25) }, reach: { LeftHand: { at: "Chest", offset: [-0.02, -0.03, 0], surface: "front", clear: 0.15 } } },
  { id: "scratch-head", category: "Gesture", name: "Scratch the head", joints: { Head: [0, 0, 8] },
    aim: { ...relaxedLeft, RightArm: R(0.8, 0.5, 0.3) }, reach: { RightHand: { at: "Head", offset: [0, 0.075, -0.01], surface: "right", clear: 0.015 } } },
  { id: "cover-mouth", category: "Gesture", name: "Shocked", joints: { Spine: [-5, 0, 0], Head: [-6, 0, 0] },
    aim: { RightArm: R(0.1, -1, 0.5), LeftArm: L(0.15, -1, 0.3) },
    reach: { RightHand: { at: "Head", offset: [0, -0.04, 0], surface: "front", clear: 0.02 }, LeftHand: { at: "Chest", offset: [-0.02, 0.04, 0], surface: "front", clear: 0.015 } } },
  { id: "hands-on-head", category: "Gesture", name: "Hands on the head", joints: { Head: [-8, 0, 0] },
    aim: { LeftArm: L(1, 0.5, 0.2), RightArm: R(1, 0.5, 0.2) },
    reach: { LeftHand: { at: "Head", offset: [0.035, 0.1, 0], surface: "top", clear: 0.005 }, RightHand: { at: "Head", offset: [-0.035, 0.1, 0], surface: "top", clear: 0.005 } } },
  { id: "handshake", category: "Gesture", name: "Handshake", joints: { Chest: [0, 6, 0] },
    aim: { ...relaxedLeft, RightArm: R(0.12, -1, 0.35), RightForeArm: R(0.05, -0.15, 1, 90) } },
  { id: "open-arms", category: "Gesture", name: "Welcome", joints: { Chest: [-4, 0, 0], Head: [-6, 0, 0] },
    aim: { LeftArm: L(0.8, -0.2, 0.55), LeftForeArm: L(0.5, 0, 0.9), RightArm: R(0.8, -0.2, 0.55), RightForeArm: R(0.5, 0, 0.9) } },
  { id: "selfie", category: "Gesture", name: "Selfie", hold: { right: "phone" }, joints: { Head: [-8, -10, 6] },
    aim: { ...relaxedLeft, RightArm: R(0.5, 0.3, 0.8) }, reach: { RightHand: { at: "Head", offset: [-0.12, 0.06, 0.36] } },
    grip: { RightHand: { palm: [0.3, -0.2, -1], thumb: [0, 1, 0] } } },

  // ---------------------------------------------------------------- action
  { id: "fight", category: "Action", name: "Fighting stance", joints: {
    Spine: [8, 22, 0], Chest: [4, 12, 0], Head: [-8, -30, 0],
    LeftArm: [-50, 0, -56], RightArm: [-40, 0, 62],
    LeftForeArm: [0, -128, 0], RightForeArm: [0, 136, 0],
    LeftUpLeg: [-24, 0, -6], LeftLeg: [26, 0, 0],
    RightUpLeg: [14, 0, 10], RightLeg: [22, 0, 0], RightFoot: [10, 0, 0],
  } },
  { id: "punch", category: "Action", name: "Punch", joints: {
    Spine: [6, 30, 0], Chest: [4, 20, 0], Head: [-6, -40, 0],
    LeftArm: [-50, 0, -56], LeftForeArm: [0, -128, 0],
    RightArm: [0, 88, 0], RightForeArm: [0, 6, 0],
    LeftUpLeg: [-26, 0, -6], LeftLeg: [26, 0, 0], RightUpLeg: [16, 0, 10], RightLeg: [14, 0, 0],
  } },
  { id: "kick", category: "Action", name: "Kick", joints: {
    Spine: [-12, 0, 0], Head: [10, 0, 0],
    LeftArm: [-30, 0, -40], LeftForeArm: [0, -90, 0], RightArm: [30, 0, 50], RightForeArm: [0, 60, 0],
    RightUpLeg: [-92, 0, 0], RightLeg: [10, 0, 0], RightFoot: [-20, 0, 0],
    LeftLeg: [12, 0, 0],
  } },
  { id: "hero-landing", category: "Action", name: "Hero landing", joints: {
    Spine: [34, 0, 0], Chest: [16, 0, 0], Head: [-34, 0, 0],
    LeftArm: [-70, 0, -40], LeftForeArm: [0, -10, 0],
    RightArm: [40, 0, 50], RightForeArm: [0, 20, 0],
    LeftUpLeg: [-118, 0, -12], LeftLeg: [140, 0, 0], LeftFoot: [-20, 0, 0],
    RightUpLeg: [-6, 0, 14], RightLeg: [112, 0, 0], RightFoot: [-40, 0, 0],
  } },
  { id: "reach", category: "Action", name: "Reach up", joints: { Chest: [-6, 0, 0], Head: [-24, 0, 0], LeftFoot: [-8, 0, 0], RightFoot: [-8, 0, 0] },
    aim: { ...relaxedLeft, RightArm: R(0.15, 1, 0.12), RightForeArm: R(0.05, 1, 0.08) } },
  // a gun held in both hands, arms out
  { id: "aim", category: "Action", name: "Aim", hold: { right: "pistol" }, joints: { Head: [4, 0, 0] },
    aim: { RightArm: R(0.3, -0.1, 1), LeftArm: L(0.45, -0.3, 1), LeftUpLeg: L(0.06, -1, 0.15), RightUpLeg: R(0.06, -1, -0.12), RightHand: R(-0.04, 0.02, 1), LeftHand: L(-0.25, 0.05, 1) },
    reach: { RightHand: { at: "Chest", offset: [-0.02, 0.06, 0], surface: "front", clear: 0.42 }, LeftHand: { at: "Chest", offset: [-0.02, 0.045, 0], surface: "front", clear: 0.39 } },
    grip: { RightHand: { palm: [1, 0, 0], thumb: [0, 1, 0] } } },
  // a box held in front, leaning back to balance it
  { id: "carry", category: "Action", name: "Carry", joints: { Spine: [-6, 0, 0] },
    aim: { LeftArm: L(0.25, -1, 0.35), RightArm: R(0.25, -1, 0.35) },
    reach: { LeftHand: { at: "Spine", offset: [0.11, 0.07, 0], surface: "front", clear: 0.17 }, RightHand: { at: "Spine", offset: [-0.11, 0.07, 0], surface: "front", clear: 0.17 } } },
  { id: "push", category: "Action", name: "Push", joints: {
    Spine: [24, 0, 0], Chest: [8, 0, 0], Head: [-18, 0, 0],
    LeftArm: [0, -70, -24], LeftForeArm: [0, -30, 0], RightArm: [0, 70, 24], RightForeArm: [0, 30, 0],
    LeftUpLeg: [-40, 0, 0], LeftLeg: [40, 0, 0], RightUpLeg: [26, 0, 0], RightLeg: [10, 0, 0], RightFoot: [20, 0, 0],
  } },
  // hauling a rope, leaning back
  { id: "pull", category: "Action", name: "Pull", joints: { Hips: [-8, 0, 0], Spine: [-10, 0, 0], Head: [12, 0, 0] },
    aim: { LeftArm: L(0.2, -0.4, 1), RightArm: R(0.2, -0.7, 0.7), LeftUpLeg: L(0.05, -1, 0.35), LeftLeg: L(0, -1, 0.1), RightUpLeg: R(0.05, -1, -0.12), RightLeg: R(0, -1, -0.25), LeftHand: L(-0.05, -0.1, 1), RightHand: R(-0.05, -0.1, 1) },
    reach: { LeftHand: { at: "Chest", offset: [0, -0.05, 0], surface: "front", clear: 0.32 }, RightHand: { at: "Chest", offset: [0, -0.08, 0], surface: "front", clear: 0.18 } } },
  // an overhand throw, the right arm back
  { id: "throw", category: "Action", name: "Throw", joints: { Spine: [0, 20, 0], Chest: [-6, 20, 0], Head: [0, -32, 0] },
    aim: { RightArm: R(0.7, 0.5, -0.5), RightForeArm: R(0, 1, 0.1), LeftArm: L(0.25, 0.1, 1), LeftForeArm: L(0.1, 0.1, 1),
      LeftUpLeg: L(0.1, -1, 0.35), LeftLeg: L(0, -1, 0), RightUpLeg: R(0.1, -1, -0.3), RightLeg: R(0, -1, -0.2) } },
  // a sword raised in both hands, lunging in
  { id: "sword", category: "Action", name: "Sword strike", hold: { right: "sword" }, joints: { Spine: [6, 0, 0], Head: [-6, 0, 0] },
    aim: { LeftArm: L(0.4, 0.8, 0.4), RightArm: R(0.4, 0.8, 0.4), LeftUpLeg: L(0.1, -0.8, 0.6), LeftLeg: L(0, -1, -0.1), RightUpLeg: R(0.06, -1, -0.4), RightLeg: R(0, -1, -0.5) },
    reach: { RightHand: { at: "Head", offset: [0, 0.16, 0.04] }, LeftHand: { at: "Head", offset: [0.01, 0.1, 0.09] } },
    grip: { RightHand: { palm: [1, 0, 0.3], thumb: [0, 0.75, -0.65] }, LeftHand: { palm: [-1, 0, 0.3], thumb: [0, 0.75, -0.65] } } },
  // forearms up in front of the face
  { id: "block", category: "Action", name: "Guard", joints: { Spine: [6, 0, 0], Head: [12, 0, 0] },
    aim: { LeftArm: L(0.35, -0.3, 0.9), LeftForeArm: L(-0.3, 1, 0.25), RightArm: R(0.35, -0.3, 0.9), RightForeArm: R(-0.3, 1, 0.25),
      LeftUpLeg: L(0.08, -1, 0.15), LeftLeg: L(0, -1, -0.05), RightUpLeg: R(0.08, -1, -0.12), RightLeg: R(0, -1, -0.1) } },
  // picking a box up off the floor: a deep squat, back straight
  { id: "lift", category: "Action", name: "Lift", joints: {
    Spine: [30, 0, 0], Chest: [8, 0, 0], Head: [-26, 0, 0],
    LeftUpLeg: [-100, 0, -14], LeftLeg: [118, 0, 0], LeftFoot: [-14, 0, 0], RightUpLeg: [-100, 0, 14], RightLeg: [118, 0, 0], RightFoot: [-14, 0, 0] },
    aim: { LeftArm: L(0.3, -1, 0.4), RightArm: R(0.3, -1, 0.4) },
    reach: { LeftHand: { at: "LeftFoot", offset: [0.12, 0.08, 0.17] }, RightHand: { at: "RightFoot", offset: [-0.12, 0.08, 0.17] } } },
  { id: "drink", category: "Action", name: "Drink", hold: { right: "cup" }, joints: { Head: [-10, 0, 0] },
    aim: { ...relaxedLeft, RightArm: R(0.2, -1, 0.45) }, reach: { RightHand: { at: "Head", offset: [-0.04, -0.06, 0], surface: "front", clear: 0.04 } },
    grip: { RightHand: { palm: [0, 0, -1], thumb: [0, 0.95, -0.3] } } },
  { id: "read", category: "Action", name: "Read", hold: { right: "book" }, joints: { Neck: [8, 0, 0], Head: [28, 0, 0] },
    aim: { LeftArm: L(0.2, -1, 0.15), RightArm: R(0.2, -1, 0.15) },
    reach: { LeftHand: { at: "Chest", offset: [0.15, -0.05, 0], surface: "front", clear: 0.2 }, RightHand: { at: "Chest", offset: [-0.12, -0.08, 0], surface: "front", clear: 0.2 } },
    grip: { RightHand: { palm: [0, -0.5, 0.87], thumb: [0, 0.87, 0.5] } } },
  // a camera at the eye
  { id: "photo", category: "Action", name: "Take a photo", hold: { right: "camera" }, joints: { Head: [4, 0, 0] },
    aim: { RightArm: R(0.7, -0.6, 0.3), LeftArm: L(0.3, -1, 0.5) },
    reach: { RightHand: { at: "Head", offset: [-0.06, 0.02, 0], surface: "front", clear: 0.08 }, LeftHand: { at: "Head", offset: [0.04, 0, 0], surface: "front", clear: 0.08 } },
    grip: { RightHand: { palm: [1, 0, 0], thumb: [0, 1, 0] } } },
  // bending to pick something up, a hand on the knee
  { id: "pick-up", category: "Action", name: "Pick up", joints: { Spine: [40, 0, 0], Chest: [24, 0, 0], Head: [-20, 0, 0] },
    aim: { LeftUpLeg: L(0, -1, 0.18), LeftLeg: L(0, -1, -0.1), RightUpLeg: R(0, -1, -0.05), LeftArm: L(0.2, -1, 0.3), RightArm: R(0.15, -1, 0.3) },
    reach: { RightHand: { at: "RightFoot", offset: [-0.03, 0.03, 0.22] }, LeftHand: { at: "LeftLeg", offset: [0, 0.04, 0], surface: "front", clear: 0.01 } } },
];

/**
 * How an arm holds a thing given to a hand outside a pose that brings it: an umbrella up over
 * the head, a bag hanging at the side, a guitar across the body. Laid over the pose as it is.
 */
export function holdArm(type, hand) {
  const right = hand === "right";
  const S = right ? "Right" : "Left";
  const D = right ? R : L;
  const inward = [right ? 1 : -1, 0, 0];
  const arms = {
    umbrella: { aim: { [`${S}Arm`]: D(0.25, -0.75, 0.55), [`${S}ForeArm`]: D(0.05, 0.75, 0.62) }, grip: { [`${S}Hand`]: { palm: inward, thumb: [0, 1, 0] } } },
    bag: { aim: { [`${S}Arm`]: D(0.14, -1, 0), [`${S}ForeArm`]: D(0.06, -1, 0.06) }, grip: { [`${S}Hand`]: { palm: inward, thumb: [0, 1, 0] } } },
    guitar: { aim: { [`${S}Arm`]: D(0.3, -0.8, 0.45), [`${S}ForeArm`]: D(-0.85, -0.2, 0.4) }, grip: { [`${S}Hand`]: { palm: [0, 0, -1], thumb: [right ? 1 : -1, 0.6, 0] } } },
  };
  return arms[type] ?? null;
}

export const POSE_CATEGORIES = ["Stand", "Move", "Sit", "Gesture", "Action", "Mine"];

// the poses you saved, from the server; each keeps its joints as quaternions
export const SAVED = [];
export function setSaved(list) {
  SAVED.length = 0;
  for (const p of list ?? []) if (p?.id && p.quaternions) SAVED.push({ ...p, category: "Mine" });
}

export const poseById = (id) => POSES.find((p) => p.id === id) ?? SAVED.find((p) => p.id === id);
export const allPoses = () => [...POSES, ...SAVED];
/** What a pose sits on: "chair" (stage furniture takes it), "floor", or null. */
export const poseSeat = (id) => poseById(id)?.seat ?? null;
