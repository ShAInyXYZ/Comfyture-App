// A clip's pose, reshaped for characters built differently from the people in it. DWPose (run on
// ComfyUI) reads each person's 18 body keypoints per frame; here every bone keeps its angle frame by
// frame but takes the character's length, the hands and the 70 face points are left out (so paws
// stay paws and the voice, not a person's lips, moves the mouth), and the result is drawn the way
// DWPose draws, for the union-control IC-LoRA to follow.

import { spawn } from "node:child_process";

export type Point = [number, number] | null;
// 18 OpenPose body points (nose, neck, shoulders, elbows, wrists, hips, knees, ankles, eyes, ears), and for
// people kept as people, after them the 70 face points and the 21 of each hand (left, then right)
export type Body = Point[];
export type PoseFrame = { width: number; height: number; people: Body[] };
const FACE = 18, LEFT_HAND = 88, RIGHT_HAND = 109;

const NOSE = 0, NECK = 1, R_SHOULDER = 2, R_ELBOW = 3, R_WRIST = 4, L_SHOULDER = 5, L_ELBOW = 6, L_WRIST = 7;
const R_HIP = 8, R_KNEE = 9, R_ANKLE = 10, L_HIP = 11, L_KNEE = 12, L_ANKLE = 13, R_EYE = 14, L_EYE = 15, R_EAR = 16, L_EAR = 17;

type Person = { pose_keypoints_2d: number[]; face_keypoints_2d?: number[]; hand_left_keypoints_2d?: number[]; hand_right_keypoints_2d?: number[] };

/**
 * The frames DWPose's POSE_KEYPOINT gives (as JSON text): each person's body points, and with `parts`
 * their face and hands too (for people played by people: the face and fingers carry the performance).
 */
export function parsePoses(text: string, least = 0.3, parts = false): PoseFrame[] {
  const frames = JSON.parse(text) as { canvas_width: number; canvas_height: number; people: Person[] }[];
  const points = (flat: number[] | undefined, n: number): Point[] => Array.from({ length: n }, (_, i) => {
    const [x, y, c] = (flat ?? []).slice(i * 3, i * 3 + 3);
    return c >= least && x > 0 && y > 0 ? [x, y] as [number, number] : null;
  });
  return frames.map((f) => ({
    width: f.canvas_width,
    height: f.canvas_height,
    people: (f.people ?? []).map((p) => [
      ...points(p.pose_keypoints_2d, 18),
      ...(parts ? [...points(p.face_keypoints_2d, 70), ...points(p.hand_left_keypoints_2d, 21), ...points(p.hand_right_keypoints_2d, 21)] : []),
    ]),
  }));
}

// AP-10K's animal points (eyes, nose, neck, tail root, front and back legs) in the body's order, ears aside
const FROM_AP10K = [2, 3, 8, 9, 10, 5, 6, 7, 14, 15, 16, 11, 12, 13, 1, 0];

/**
 * The frames AnimalPose (AP-10K, on ComfyUI) gives, for animals standing up like people, as the same 18
 * body points: front legs as arms, back legs as legs, ears set out from the eyes (AP-10K has none). An
 * animal close to the lens (eyes `close` of the frame's width apart, or more) keeps only its head: up
 * close, its legs are read wrong.
 */
export function parseAnimalPoses(text: string, least = 0.45, close = 0.1): PoseFrame[] {
  const frames = JSON.parse(text) as { canvas_width: number; canvas_height: number; animals?: number[][][] }[];
  const out = (a: Point, b: Point): Point => (a && b ? [a[0] + (a[0] - b[0]) * 0.45, a[1] + (a[1] - b[1]) * 0.45] : null);
  return frames.map((f) => ({
    width: f.canvas_width,
    height: f.canvas_height,
    people: (f.animals ?? []).map((a) => {
      const body: Body = FROM_AP10K.map((i) => (a[i][2] >= least ? [a[i][0], a[i][1]] as [number, number] : null));
      const r = body[R_EYE], l = body[L_EYE], nose = body[NOSE];
      body.push(out(r, l), out(l, r));
      // every bone hangs from the neck: one not read sits below the nose, on from the eyes
      if (!body[NECK] && nose && r && l) body[NECK] = [nose[0] + (nose[0] - (r[0] + l[0]) / 2) * 1.5, nose[1] + (nose[1] - (r[1] + l[1]) / 2) * 1.5];
      const near = r && l && Math.hypot(r[0] - l[0], r[1] - l[1]) >= close * f.canvas_width;
      return near ? body.map((p, i) => ([NOSE, NECK, R_EYE, L_EYE, R_EAR, L_EAR].includes(i) ? p : null)) : body;
    }),
  }));
}

/** The people in the same order in every frame (by where they stand, left first), so each stays the same character. */
export function trackPeople(frames: PoseFrame[], count: number): PoseFrame[] {
  const centre = (b: Body) => b[NECK] ?? b[NOSE] ?? b.find(Boolean) ?? null;
  let last: (Point)[] = [];
  return frames.map((f) => {
    const found = f.people.filter((b) => centre(b));
    let people: Body[];
    if (!last.length) people = [...found].sort((a, b) => centre(a)![0] - centre(b)![0]).slice(0, count);
    else {
      // each character takes the person nearest to where it was
      const free = [...found];
      people = last.map((at) => {
        if (!at || !free.length) return Array(18).fill(null);
        let best = 0;
        free.forEach((b, i) => (Math.hypot(centre(b)![0] - at[0], centre(b)![1] - at[1]) < Math.hypot(centre(free[best])![0] - at[0], centre(free[best])![1] - at[1]) ? (best = i) : 0));
        return free.splice(best, 1)[0];
      });
    }
    while (people.length < count) people.push(Array(18).fill(null));
    last = people.map((b, i) => centre(b) ?? last[i] ?? null);
    return { ...f, people };
  });
}

/** How a character is built, against a person: each bone's length as a share of the person's. */
export type Build = { neck: number; face: number; shoulder: number; upperArm: number; forearm: number; torso: number; thigh: number; shin: number };
/**
 * Upright kittens, as our crew is drawn: a big, wide head sitting right on narrow shoulders (no neck to
 * speak of), short arms and legs, a short body.
 */
export const KITTEN: Build = { neck: 0.75, face: 1.4, shoulder: 0.7, upperArm: 0.55, forearm: 0.55, torso: 0.6, thigh: 0.5, shin: 0.5 };
/**
 * Upright cats (AP-10K's, as above) as our kittens: a head half again as big on a body three quarters
 * as long, legs a little shorter, so a round kitten stands about as tall as the cat did.
 */
export const CAT: Build = { neck: 1.3, face: 1.5, shoulder: 1.45, upperArm: 1.1, forearm: 1.1, torso: 0.73, thigh: 0.87, shin: 0.87 };

/** A point missed for a few frames (the detector blinking) held where it last was; the people tracked first. */
export function hold(frames: PoseFrame[], most = 3): PoseFrame[] {
  const last: { at: [number, number]; age: number }[][] = [];
  return frames.map((f) => ({
    ...f,
    people: f.people.map((b, who) => b.map((p, k) => {
      const seen = (last[who] ??= [])[k];
      if (p) return ((last[who][k] = { at: p, age: 0 }), p);
      if (seen && seen.age < most) return (seen.age++, seen.at);
      return null;
    })),
  }));
}

const quantile = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.round(p * (s.length - 1))];
};

/** People played by people: tracked, the detector's blinks held, its jitter smoothed, their shape kept. */
export function steady(frames: PoseFrame[], count = 2): PoseFrame[] {
  return smooth(hold(trackPeople(frames, count)));
}

// every bone from its parent, out from the neck, with the part of the build that sets its length
const BONES: [number, number, keyof Build][] = [
  [NECK, NOSE, "neck"], [NOSE, R_EYE, "face"], [NOSE, L_EYE, "face"], [R_EYE, R_EAR, "face"], [L_EYE, L_EAR, "face"],
  [NECK, R_SHOULDER, "shoulder"], [R_SHOULDER, R_ELBOW, "upperArm"], [R_ELBOW, R_WRIST, "forearm"],
  [NECK, L_SHOULDER, "shoulder"], [L_SHOULDER, L_ELBOW, "upperArm"], [L_ELBOW, L_WRIST, "forearm"],
  [NECK, R_HIP, "torso"], [R_HIP, R_KNEE, "thigh"], [R_KNEE, R_ANKLE, "shin"],
  [NECK, L_HIP, "torso"], [L_HIP, L_KNEE, "thigh"], [L_KNEE, L_ANKLE, "shin"],
];

/**
 * One person's body rebuilt with a character's build: each bone keeps its direction, takes the build's
 * share of its length, and hangs from where its parent now is. The neck stays put. A bone longer than
 * `most` (bone by bone, in the person's own lengths) is cut to it.
 */
export function rebuild(body: Body, build: Build, most: number[] = []): Body {
  const out: Body = Array(18).fill(null);
  out[NECK] = body[NECK];
  for (const [i, [from, to, part]] of BONES.entries()) {
    const a = body[from], b = body[to], at = out[from];
    if (!a || !b || !at) continue;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]), cut = most[i] && length > most[i] ? most[i] / length : 1;
    out[to] = [at[0] + (b[0] - a[0]) * build[part] * cut, at[1] + (b[1] - a[1]) * build[part] * cut];
  }
  // a person's face and hands go where the nose and the wrists went, their own shape kept
  if (body.length > 18) {
    const moved = (k: number) => (body[k] && out[k] ? [out[k]![0] - body[k]![0], out[k]![1] - body[k]![1]] : null);
    const shifts: [number, number, number[] | null][] = [[FACE, 70, moved(NOSE)], [LEFT_HAND, 21, moved(L_WRIST)], [RIGHT_HAND, 21, moved(R_WRIST)]];
    for (const [start, n, d] of shifts) for (let k = start; k < start + n; k++) out[k] = body[k] && d ? [body[k]![0] + d[0], body[k]![1] + d[1]] : null;
  }
  return out;
}

/**
 * The clip's people rebuilt as the characters. Where the people's feet show (a wide shot), each
 * character stands where its person stands, feet on the same floor, so it comes out its own size;
 * otherwise its face stays where the person's face is (nose on nose), for the mouth and the mic.
 * A light average over neighbouring frames takes out DWPose's jitter, and a bone read far longer than
 * it usually is in the clip (a joint read in the wrong place) is held to half again its usual length.
 */
export function retarget(frames: PoseFrame[], build: Build = KITTEN, count = 2): PoseFrame[] {
  const tracked = trackPeople(frames, count);
  const feet = (b: Body) => [b[R_ANKLE], b[L_ANKLE]].filter(Boolean) as [number, number][];
  const usual = Array.from({ length: count }, (_, who) => BONES.map(([from, to]) => {
    const lengths = tracked.map((f) => f.people[who]).filter((b) => b?.[from] && b[to]).map((b) => Math.hypot(b[to]![0] - b[from]![0], b[to]![1] - b[from]![1]));
    return lengths.length ? 1.5 * quantile(lengths, 0.5) : 0;
  }));
  return smooth(tracked.map((f) => ({
    ...f,
    people: f.people.map((body, who) => {
      const next = rebuild(body, build, usual[who]);
      const was = feet(body), now = feet(next);
      if (was.length && now.length) {
        // feet on the floor: the whole character drops by however much shorter its legs and body are
        const floor = Math.max(...was.map((p) => p[1])), lowest = Math.max(...now.map((p) => p[1]));
        const dy = floor - lowest;
        return next.map((p) => (p ? [p[0], p[1] + dy] as [number, number] : null));
      }
      const nose = body[NOSE], moved = next[NOSE];
      if (nose && moved) return next.map((p) => (p ? [p[0] + nose[0] - moved[0], p[1] + nose[1] - moved[1]] as [number, number] : null));
      return next;
    }),
  })));
}

const middle = (b: Body, i: number, j: number): Point => (b[i] && b[j] ? [(b[i]![0] + b[j]![0]) / 2, (b[i]![1] + b[j]![1]) / 2] : b[i] ?? b[j]);

/** The characters laid out for another frame, and the spot between the first two at eye height (where a shared microphone hangs). */
export type Layout = { frames: PoseFrame[]; between: [number, number] | null };

/**
 * The clip's own framing kept on a frame of another shape: every point scaled by `scale` and moved by
 * (x, y), the same for all frames, as the clip's picture is placed on that frame (a portrait take whose
 * first frame is the clip's own, extended). What leaves the frame is drawn off it; nothing is laid out again.
 */
export function place(frames: PoseFrame[], width: number, height: number, scale: number, x: number, y: number): PoseFrame[] {
  return frames.map((f) => ({ width, height, people: f.people.map((body) => body.map((p) => (p ? [p[0] * scale + x, p[1] * scale + y] : null))) }));
}

/**
 * The characters laid out again for a frame of another shape (a phone's 9:16, from a wide clip): side
 * by side as they stand, closer together, the row across the frame (`span` of its width; a wide shot,
 * where every character's feet show, keeps air around them), feet on a floor at `floor` of its height.
 * A shot is laid out once for all its frames, so every move stays. Each character keeps room around
 * its skeleton for the head, body and tail drawn over it; a reach past that leaves the frame now and then.
 * With `eyes`, the eye line sits at that share of the height instead (people in a medium shot, whose
 * legs leave the frame, have no floor to stand on).
 */
export function reframe(frames: PoseFrame[], width: number, height: number, { span, floor = 0.8, gap = 0.25, eyes: eyeLine }: { span?: number; floor?: number; gap?: number; eyes?: number } = {}): Layout {
  const people = (frames[0]?.people ?? []).map((_, who) => {
    const xs: number[] = [], ys: number[] = [], torso: number[] = [], hips: number[] = [], feet: number[] = [], eyes: number[] = [];
    for (const f of frames) {
      const b = f.people[who];
      for (const p of b) if (p) (xs.push(p[0]), ys.push(p[1]));
      const hip = middle(b, R_HIP, L_HIP), eye = middle(b, R_EYE, L_EYE) ?? b[NOSE];
      if (b[NECK] && hip) (torso.push(Math.hypot(hip[0] - b[NECK]![0], hip[1] - b[NECK]![1])), hips.push(hip[1]));
      const ankles = [b[R_ANKLE], b[L_ANKLE]].filter(Boolean).map((p) => p![1]);
      if (ankles.length) feet.push(Math.max(...ankles));
      if (eye) eyes.push(eye[1]);
    }
    if (!xs.length) return null;
    const from = quantile(xs, 0.03), to = quantile(xs, 0.97);
    // a character's size is its body (neck to hips), else its width
    const size = torso.length ? quantile(torso, 0.5) : (to - from) / 2;
    return { who, from, to, size, top: quantile(ys, 0.03) - 0.35 * size, eyes: eyes.length ? quantile(eyes, 0.5) : null, hips: hips.length ? quantile(hips, 0.5) : null, feet: feet.length > frames.length / 2 ? quantile(feet, 0.5) : null };
  }).filter((p) => p !== null);
  if (!people.length) return { frames: frames.map((f) => ({ ...f, width, height, people: f.people.map((b) => b.map(() => null)) })), between: null };

  // room for the head and the tail outside, a little inside; then the gaps closed up to `gap` of a body
  const boxes = people.map((p, i) => ({ ...p, left: p.from - p.size * (i === 0 ? 0.35 : 0.12), right: p.to + p.size * (i === people.length - 1 ? 0.35 : 0.12), shift: 0 }));
  const air = gap * quantile(people.map((p) => p.size), 0.5);
  let pull = 0;
  for (let i = 1; i < boxes.length; i++) {
    const open = boxes[i].left - boxes[i - 1].right;
    if (open > air) pull += open - air;
    boxes[i].shift = -pull;
  }
  const left = boxes[0].left + boxes[0].shift, right = boxes[boxes.length - 1].right + boxes[boxes.length - 1].shift;
  const wide = people.every((p) => p.feet !== null);
  // feet on the floor: where they show, else where short legs under the hips put them
  const ground = quantile(people.map((p) => p.feet ?? (p.hips !== null ? p.hips + 0.7 * p.size : p.to)), 0.5);
  // across the frame, as long as the heads stay in it
  const top = Math.min(...people.map((p) => p.top));
  const eyes = people.map((p) => p.eyes).filter((y) => y !== null);
  const level = eyeLine !== undefined && eyes.length ? quantile(eyes, 0.5) : ground;
  const at0 = eyeLine !== undefined && eyes.length ? eyeLine * height : floor * height;
  const scale = Math.min(((span ?? (wide ? 0.5 : 1)) * width) / (right - left), (0.95 * at0) / (level - top));
  const shiftOf = new Map(boxes.map((b) => [b.who, b.shift]));
  const at = (x: number, y: number, who: number): [number, number] => [(x + (shiftOf.get(who) ?? 0) - (left + right) / 2) * scale + width / 2, (y - level) * scale + at0];
  const between = boxes.length > 1 && eyes.length
    ? ([((boxes[0].right + boxes[0].shift + boxes[1].left + boxes[1].shift) / 2 - (left + right) / 2) * scale + width / 2, (quantile(eyes, 0.5) - level) * scale + at0] as [number, number])
    : null;
  return { frames: frames.map((f) => ({ width, height, people: f.people.map((b, who) => b.map((p) => (p ? at(p[0], p[1], who) : null))) })), between };
}

/**
 * Each person's skeleton scaled and moved, once for the whole clip, so its first frame lands on that
 * person in a picture: `target` is DWPose's read of the first frame drawn for the take. People are matched
 * left to right, and the fit is made on the head, neck and shoulders, so every move keeps its shape.
 */
export function fit(frames: PoseFrame[], target: Body[]): PoseFrame[] {
  const keys = [NOSE, NECK, R_SHOULDER, L_SHOULDER, R_EYE, L_EYE, R_EAR, L_EAR];
  const x = (b: Body) => (b[NECK] ?? b[NOSE] ?? b.find(Boolean) ?? [0, 0])[0];
  const sorted = [...target].sort((a, b) => x(a) - x(b));
  const mean = (ps: [number, number][]) => [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length];
  const spread = (ps: [number, number][], m: number[]) => Math.sqrt(ps.reduce((s, p) => s + (p[0] - m[0]) ** 2 + (p[1] - m[1]) ** 2, 0));
  const fits = (frames[0]?.people ?? []).map((b, who) => {
    const t = sorted[who];
    const pairs = t ? keys.filter((k) => b[k] && t[k]).map((k) => [b[k]!, t[k]!] as [[number, number], [number, number]]) : [];
    if (pairs.length < 3) return null;
    const cs = mean(pairs.map((p) => p[0])), ct = mean(pairs.map((p) => p[1]));
    return { s: spread(pairs.map((p) => p[1]), ct) / spread(pairs.map((p) => p[0]), cs), cs, ct };
  });
  return frames.map((f) => ({
    ...f,
    people: f.people.map((b, who) => {
      const m = fits[who];
      return m ? b.map((p) => (p ? [(p[0] - m.cs[0]) * m.s + m.ct[0], (p[1] - m.cs[1]) * m.s + m.ct[1]] as [number, number] : null)) : b;
    }),
  }));
}

/**
 * Each person rebuilt with the bone lengths of the figure drawn in the take's first frame (DWPose's read of
 * it, `target`, after `fit`): stylized people have bigger heads and shorter limbs than the people filmed,
 * and a skeleton longer than its drawing would stretch it. Each part's share is the drawing's length over
 * the skeleton's in the first frame, kept between 0.6 and 1.4; the head stays as fitted.
 */
export function conform(frames: PoseFrame[], target: Body[]): PoseFrame[] {
  const x = (b: Body) => (b[NECK] ?? b[NOSE] ?? b.find(Boolean) ?? [0, 0])[0];
  const sorted = [...target].sort((a, b) => x(a) - x(b));
  const len = (b: Body, i: number, j: number) => (b[i] && b[j] ? Math.hypot(b[i]![0] - b[j]![0], b[i]![1] - b[j]![1]) : null);
  const part = (b: Body, t: Body, bones: [number, number][]) => {
    const ratios = bones.map(([i, j]) => {
      const a = len(b, i, j), c = len(t, i, j);
      return a && c ? c / a : null;
    }).filter((r) => r !== null) as number[];
    return ratios.length ? Math.max(0.6, Math.min(1.4, ratios.reduce((s, r) => s + r, 0) / ratios.length)) : 1;
  };
  const builds = (frames[0]?.people ?? []).map((b, who) => {
    const t = sorted[who];
    if (!t) return null;
    return {
      neck: 1, face: 1,
      shoulder: part(b, t, [[NECK, R_SHOULDER], [NECK, L_SHOULDER]]),
      upperArm: part(b, t, [[R_SHOULDER, R_ELBOW], [L_SHOULDER, L_ELBOW]]),
      forearm: part(b, t, [[R_ELBOW, R_WRIST], [L_ELBOW, L_WRIST]]),
      torso: part(b, t, [[NECK, R_HIP], [NECK, L_HIP]]),
      thigh: part(b, t, [[R_HIP, R_KNEE], [L_HIP, L_KNEE]]),
      shin: part(b, t, [[R_KNEE, R_ANKLE], [L_KNEE, L_ANKLE]]),
    } as Build;
  });
  return frames.map((f) => ({ ...f, people: f.people.map((b, who) => (builds[who] ? rebuild(b, builds[who]!) : b)) }));
}

function smooth(frames: PoseFrame[]): PoseFrame[] {
  return frames.map((f, t) => ({
    ...f,
    people: f.people.map((body, who) => body.map((p, k) => {
      if (!p) return null;
      const near = [frames[t - 1], f, frames[t + 1]].map((g) => g?.people[who]?.[k]).filter(Boolean) as [number, number][];
      return [near.reduce((s, q) => s + q[0], 0) / near.length, near.reduce((s, q) => s + q[1], 0) / near.length];
    })),
  }));
}

// DWPose's drawing (draw_bodypose in its util): 17 limbs as ellipses 4 px thick in these colours at 60%,
// then the 18 joints as 4 px discs at full colour, on black
const LIMBS: [number, number][] = [[1, 2], [1, 5], [2, 3], [3, 4], [5, 6], [6, 7], [1, 8], [8, 9], [9, 10], [1, 11], [11, 12], [12, 13], [1, 0], [0, 14], [14, 16], [0, 15], [15, 17]];
const COLOURS: [number, number, number][] = [
  [255, 0, 0], [255, 85, 0], [255, 170, 0], [255, 255, 0], [170, 255, 0], [85, 255, 0], [0, 255, 0], [0, 255, 85], [0, 255, 170],
  [0, 255, 255], [0, 170, 255], [0, 85, 255], [0, 0, 255], [85, 0, 255], [170, 0, 255], [255, 0, 255], [255, 0, 85], [255, 0, 170],
];

/** A convex polygon filled into an RGB frame. */
function fill(rgb: Buffer, width: number, height: number, poly: [number, number][], colour: [number, number, number]) {
  const top = Math.max(0, Math.floor(Math.min(...poly.map((p) => p[1]))));
  const bottom = Math.min(height - 1, Math.ceil(Math.max(...poly.map((p) => p[1]))));
  for (let y = top; y <= bottom; y++) {
    const yc = y + 0.5;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
      if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) {
        const x = x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1);
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
    }
    for (let x = Math.max(0, Math.round(lo)); x <= Math.min(width - 1, Math.round(hi) - 1); x++) {
      const o = (y * width + x) * 3;
      rgb[o] = colour[0];
      rgb[o + 1] = colour[1];
      rgb[o + 2] = colour[2];
    }
  }
}
const ellipse = (cx: number, cy: number, a: number, b: number, degrees: number): [number, number][] => {
  const t = (degrees * Math.PI) / 180;
  return Array.from({ length: 72 }, (_, i) => {
    const u = (i / 72) * 2 * Math.PI;
    return [cx + a * Math.cos(u) * Math.cos(t) - b * Math.sin(u) * Math.sin(t), cy + a * Math.cos(u) * Math.sin(t) + b * Math.sin(u) * Math.cos(t)];
  });
};

// its hands (draw_handpose): 20 bones 2 px thick, coloured round the hue circle, the joints as 4 px blue
// discs; its face (draw_facepose): the 70 points as 3 px white discs
const HAND: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [0, 9], [9, 10], [10, 11], [11, 12], [0, 13], [13, 14], [14, 15], [15, 16], [0, 17], [17, 18], [18, 19], [19, 20]];
const hue = (h: number): [number, number, number] => {
  const k = (n: number) => (n + h * 6) % 6;
  const c = (n: number) => Math.round(255 * (1 - Math.max(0, Math.min(k(n), 4 - k(n), 1))));
  return [c(5), c(3), c(1)];
};
const segment = (p: [number, number], q: [number, number], half: number): [number, number][] => {
  const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1, nx = (-dy / len) * half, ny = (dx / len) * half;
  return [[p[0] + nx, p[1] + ny], [q[0] + nx, q[1] + ny], [q[0] - nx, q[1] - ny], [p[0] - nx, p[1] - ny]];
};

/** One frame's skeletons, drawn as DWPose draws them (with hands and face for people kept as people). */
export function drawPose(f: PoseFrame, stick = 4): Buffer {
  const rgb = Buffer.alloc(f.width * f.height * 3);
  for (const [i, [a, b]] of LIMBS.entries()) {
    for (const body of f.people) {
      const p = body[a], q = body[b];
      if (!p || !q) continue;
      const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const angle = (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
      fill(rgb, f.width, f.height, ellipse((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, length / 2, stick, angle), COLOURS[i]);
    }
  }
  for (let o = 0; o < rgb.length; o++) rgb[o] = Math.floor(rgb[o] * 0.6);
  for (let k = 0; k < 18; k++) for (const body of f.people) if (body[k]) fill(rgb, f.width, f.height, ellipse(body[k]![0], body[k]![1], 4, 4, 0), COLOURS[k]);
  for (const body of f.people) {
    if (body.length <= 18) continue;
    for (const start of [LEFT_HAND, RIGHT_HAND]) {
      for (const [i, [a, b]] of HAND.entries()) {
        const p = body[start + a], q = body[start + b];
        if (p && q) fill(rgb, f.width, f.height, segment(p, q, 1), hue(i / HAND.length));
      }
      for (let k = 0; k < 21; k++) if (body[start + k]) fill(rgb, f.width, f.height, ellipse(body[start + k]![0], body[start + k]![1], 4, 4, 0), [0, 0, 255]);
    }
    for (let k = 0; k < 70; k++) if (body[FACE + k]) fill(rgb, f.width, f.height, ellipse(body[FACE + k]![0], body[FACE + k]![1], 3, 3, 0), [255, 255, 255]);
  }
  return rgb;
}

/** The skeletons as a video (or a still, for one frame), at the frames' own size. */
export function writePoseVideo(frames: PoseFrame[], path: string, fps = 24): Promise<void> {
  const { width, height } = frames[0];
  const still = path.endsWith(".png");
  const ff = spawn("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${width}x${height}`, "-r", String(fps), "-i", "-",
    ...(still ? ["-frames:v", "1"] : ["-c:v", "libx264", "-pix_fmt", "yuv444p", "-crf", "8", "-preset", "medium"]), path]);
  return new Promise((ok, no) => {
    ff.on("error", no);
    ff.on("close", (code) => (code === 0 ? ok() : no(new Error(`ffmpeg exited with ${code}`))));
    (async () => {
      for (const f of frames) if (!ff.stdin.write(drawPose(f))) await new Promise((r) => ff.stdin.once("drain", r));
      ff.stdin.end();
    })().catch(no);
  });
}
