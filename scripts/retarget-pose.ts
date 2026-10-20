// A clip's DWPose keypoints (the POSE_KEYPOINT JSON a ComfyUI graph saves as text) as a pose video for
// characters built differently from the people in it (kittens, by default), ready for the swap graphs'
// "ready" control, plus its first frame as a still for drawing the first frame to. With --size, the
// characters are laid out again for a frame of that size (a portrait take from a wide clip, say); it
// prints the spot between the first two at eye height, where a shared microphone hangs:
//   node scripts/retarget-pose.ts keypoints.json out.mp4 [first.png] [--size 1152x2048] [--span 0.5]
import { readFile } from "node:fs/promises";
import { parsePoses, reframe, retarget, writePoseVideo } from "../server/pose.ts";

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args.splice(i, 2)[1];
};
const size = option("--size")?.split("x").map(Number);
const span = option("--span");
const [keypoints, out, still] = args;
if (!keypoints || !out) throw new Error("usage: retarget-pose.ts keypoints.json out.mp4 [first.png] [--size WxH] [--span 0.5]");
let frames = retarget(parsePoses(await readFile(keypoints, "utf8")));
if (size) {
  const laid = reframe(frames, size[0], size[1], { span: span ? Number(span) : undefined });
  frames = laid.frames;
  if (laid.between) console.log(`between: ${laid.between.map(Math.round).join(",")}`);
}
await writePoseVideo(frames, out);
if (still) await writePoseVideo(frames.slice(0, 1), still);
console.log(`${frames.length} frames, ${frames[0].width}×${frames[0].height}`);
