// A clip's pose, reshaped for characters built differently from the people in it. DWPose (run on
// ComfyUI) reads each person's 18 body keypoints per frame; here every bone keeps its angle frame by
// frame but takes the character's length, the hands and the 70 face points are left out (so paws
// stay paws and the voice, not a person's lips, moves the mouth), and the result is drawn the way
// DWPose draws, for the union-control IC-LoRA to follow.

import { spawn } from "node:child_process";

export type Point = [number, number] | null;
export type Body = Point[]; // 18 OpenPose body points: nose, neck, shoulders, elbows, wrists, hips, knees, ankles, eyes, ears
export type PoseFrame = { width: number; height: number; people: Body[] };

const NOSE = 0, NECK = 1, R_SHOULDER = 2, R_ELBOW = 3, R_WRIST = 4, L_SHOULDER = 5, L_ELBOW = 6, L_WRIST = 7;
const R_HIP = 8, R_KNEE = 9, R_ANKLE = 10, L_HIP = 11, L_KNEE = 12, L_ANKLE = 13, R_EYE = 14, L_EYE = 15, R_EAR = 16, L_EAR = 17;

/** The frames DWPose's POSE_KEYPOINT gives (as JSON text), each person's body points only. */
export function parsePoses(text: string, least = 0.3): PoseFrame[] {
  const frames = JSON.parse(text) as { canvas_width: number; canvas_height: number; people: { pose_keypoints_2d: number[] }[] }[];
  return frames.map((f) => ({
    width: f.canvas_width,
    height: f.canvas_height,
    people: (f.people ?? []).map((p) => Array.from({ length: 18 }, (_, i) => {
      const [x, y, c] = p.pose_keypoints_2d.slice(i * 3, i * 3 + 3);
      return c >= least && x > 0 && y > 0 ? [x, y] as [number, number] : null;
    })),
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
 * share of its length, and hangs from where its parent now is. The neck stays put.
 */
export function rebuild(body: Body, build: Build): Body {
  const out: Body = Array(18).fill(null);
  out[NECK] = body[NECK];
  for (const [from, to, part] of BONES) {
    const a = body[from], b = body[to], at = out[from];
    if (!a || !b || !at) continue;
    out[to] = [at[0] + (b[0] - a[0]) * build[part], at[1] + (b[1] - a[1]) * build[part]];
  }
  return out;
}

/**
 * The clip's people rebuilt as the characters. Where the people's feet show (a wide shot), each
 * character stands where its person stands, feet on the same floor, so it comes out its own size;
 * otherwise its face stays where the person's face is (nose on nose), for the mouth and the mic.
 * A light average over neighbouring frames takes out DWPose's jitter.
 */
export function retarget(frames: PoseFrame[], build: Build = KITTEN, count = 2): PoseFrame[] {
  const tracked = trackPeople(frames, count);
  const feet = (b: Body) => [b[R_ANKLE], b[L_ANKLE]].filter(Boolean) as [number, number][];
  return smooth(tracked.map((f) => ({
    ...f,
    people: f.people.map((body) => {
      const next = rebuild(body, build);
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

/** One frame's skeletons, drawn as DWPose draws them. */
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
