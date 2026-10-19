// Mixer: an edit someone likes, split at its cuts. Each shot gets its first frame (the picture the
// cast is redrawn into) and its own clip (the motion the new shot copies); the edit's sound is kept
// whole, so the remix plays on the same music and timing.
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

type Exec = (cmd: string, args: string[], opts?: Record<string, unknown>) => Promise<{ stdout: string; stderr: string }>;
type Frame = { file: string; url: string; width: number; height: number };
type Sound = { file: string; url: string; seconds: number };

export type MixShot = { from: number; to: number; frame: Frame; clip: { file: string; url: string; frames: number } };
export type Split = { seconds: number; width: number; height: number; sound: Sound | null; shots: MixShot[] };

// a cut is a frame unlike the one before by at least this much (ffmpeg's scene score, 0 to 1)
const SCENE = 0.3;
// a shot shorter than this joins the one before it: too short to roll, and usually a flash
const SHORTEST = 0.5;
// a shot longer than this is rolled in parts, so no single take runs long
const LONGEST = 6;
const MOST = 16;

/** Where the edit cuts, in seconds, from ffmpeg's scene detection. */
export async function cutsOf(exec: Exec, path: string): Promise<number[]> {
  const { stderr } = await exec("ffmpeg", ["-hide_banner", "-nostats", "-i", path, "-an", "-filter:v", `select='gt(scene,${SCENE})',showinfo`, "-f", "null", "-"], { maxBuffer: 1 << 24 });
  return [...stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1])).filter((t) => Number.isFinite(t) && t > 0);
}

/** The shots between the cuts: the short ones folded into the one before, the long ones split. */
export function shotsBetween(cuts: number[], seconds: number): { from: number; to: number }[] {
  const marks = [0, ...cuts.filter((t) => t > SHORTEST && t < seconds - SHORTEST).sort((a, b) => a - b), seconds];
  const spans: { from: number; to: number }[] = [];
  for (let i = 0; i < marks.length - 1; i++) {
    const from = marks[i];
    const to = marks[i + 1];
    if (to - from < SHORTEST && spans.length) spans[spans.length - 1].to = to;
    else spans.push({ from, to });
  }
  const out = spans.flatMap(({ from, to }) => {
    const parts = Math.ceil((to - from) / LONGEST);
    return Array.from({ length: parts }, (_, k) => ({ from: from + ((to - from) * k) / parts, to: from + ((to - from) * (k + 1)) / parts }));
  });
  // too many shots: the shortest neighbours are joined until they fit
  while (out.length > MOST) {
    let best = 0;
    for (let i = 1; i < out.length - 1; i++) if (out[i].to - out[i].from < out[best].to - out[best].from) best = i;
    const j = best === out.length - 1 ? best - 1 : best;
    out.splice(j, 2, { from: out[j].from, to: out[j + 1].to });
  }
  return out.map((s) => ({ from: Math.round(s.from * 1000) / 1000, to: Math.round(s.to * 1000) / 1000 }));
}

/**
 * The edit (a stored video) as shots, each with its first frame and its clip, and its sound kept.
 * store(bytes, name) keeps a picture, keep(bytes, name) a sound; clips go next to the edit in videos/.
 */
export async function splitEdit(o: {
  exec: Exec;
  data: string;
  file: string;
  name: string;
  probe: (path: string) => Promise<{ width: number; height: number; frames: number; duration: number }>;
  hasSound: (path: string) => Promise<boolean>;
  store: (bytes: Buffer, name: string) => Promise<Frame>;
  keep: (bytes: Buffer, name: string) => Promise<Sound>;
}): Promise<Split> {
  const path = join(o.data, "videos", o.file);
  const info = await o.probe(path);
  const seconds = info.duration;
  if (!(seconds > 0.8)) throw new Error("That edit is too short to remix.");
  const spans = shotsBetween(await cutsOf(o.exec, path), seconds);
  const base = o.file.replace(/\.\w+$/, "");
  const work = join(o.data, "videos", `${base}.split`);
  await mkdir(work, { recursive: true });
  try {
    const shots: MixShot[] = [];
    for (const [i, s] of spans.entries()) {
      const len = s.to - s.from;
      // the first frame a little after the cut (a cut's very first frame can be a blend)
      const at = s.from + Math.min(0.08, len / 4);
      const png = join(work, `${i}.png`);
      await o.exec("ffmpeg", ["-v", "error", "-y", "-ss", at.toFixed(3), "-i", path, "-frames:v", "1", png]);
      const frame = await o.store(await readFile(png), `${o.name} · shot ${i + 1}`);
      // the shot's own clip, for its motion: at least nine frames, the fewest LTX-2.5 reads
      const clipFile = `${base}-${String(i + 1).padStart(2, "0")}.mp4`;
      const clipPath = join(o.data, "videos", clipFile);
      const t = Math.max(len, 0.45);
      await o.exec("ffmpeg", ["-v", "error", "-y", "-ss", s.from.toFixed(3), "-i", path, "-t", t.toFixed(3), "-an", "-vf", "fps=24,format=yuv420p", "-c:v", "libx264", "-crf", "17", "-preset", "fast", "-movflags", "+faststart", clipPath]);
      const clip = await o.probe(clipPath);
      shots.push({ from: s.from, to: s.to, frame, clip: { file: clipFile, url: `/media/videos/${clipFile}`, frames: clip.frames } });
    }
    let sound: Sound | null = null;
    if (await o.hasSound(path)) {
      const mp3 = join(work, "sound.mp3");
      await o.exec("ffmpeg", ["-v", "error", "-y", "-i", path, "-vn", "-ac", "2", "-ar", "48000", "-b:a", "192k", mp3]);
      sound = await o.keep(await readFile(mp3), `${o.name} sound`);
    }
    return { seconds: Math.round(seconds * 1000) / 1000, width: info.width, height: info.height, sound, shots };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

