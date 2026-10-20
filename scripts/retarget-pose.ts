// A clip's DWPose keypoints (the POSE_KEYPOINT JSON a ComfyUI graph saves as text) as a pose video for
// characters built differently from the people in it (kittens, by default), ready for the swap graphs'
// "ready" control, plus its first frame as a still for drawing the first frame to. With --animal, the
// keypoints are AnimalPose's (AP-10K) for animals standing up, rebuilt with the cat build. With --size,
// the characters are laid out again for a frame of that size (a portrait take from a wide clip, say); it
// prints the spot between the first two at eye height, where a shared microphone hangs. --frames holds
// the last pose until the take's length:
//   node scripts/retarget-pose.ts keypoints.json out.mp4 [first.png] [--animal] [--size 1152x2048] [--span 0.5] [--frames 57]
import { readFile } from "node:fs/promises";
import { CAT, KITTEN, hold, parseAnimalPoses, parsePoses, reframe, retarget, trackPeople, writePoseVideo } from "../server/pose.ts";

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args.splice(i, 2)[1];
};
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 && Boolean(args.splice(i, 1));
};
const size = option("--size")?.split("x").map(Number);
const span = option("--span");
const length = Number(option("--frames") ?? 0);
const animal = flag("--animal");
const [keypoints, out, still] = args;
if (!keypoints || !out) throw new Error("usage: retarget-pose.ts keypoints.json out.mp4 [first.png] [--animal] [--size WxH] [--span 0.5] [--frames N]");
const text = await readFile(keypoints, "utf8");
let frames = animal ? retarget(hold(trackPeople(parseAnimalPoses(text), 2)), CAT) : retarget(parsePoses(text), KITTEN);
if (size) {
  const laid = reframe(frames, size[0], size[1], { span: span ? Number(span) : undefined });
  frames = laid.frames;
  if (laid.between) console.log(`between: ${laid.between.map(Math.round).join(",")}`);
}
while (frames.length < length) frames.push(frames[frames.length - 1]);
await writePoseVideo(frames, out);
if (still) await writePoseVideo(frames.slice(0, 1), still);
console.log(`${frames.length} frames, ${frames[0].width}×${frames[0].height}`);
