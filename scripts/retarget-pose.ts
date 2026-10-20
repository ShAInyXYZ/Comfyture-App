// A clip's DWPose keypoints (the POSE_KEYPOINT JSON a ComfyUI graph saves as text) as a pose video for
// characters built differently from the people in it (kittens, by default), ready for the swap graphs'
// "ready" control, plus its first frame as a still for drawing the first frame to. With --human, the
// people stay people (body, face and hands, their own shape), for characters who are people. With --animal, the
// keypoints are AnimalPose's (AP-10K) for animals standing up, rebuilt with the cat build. With --size,
// the characters are laid out again for a frame of that size (a portrait take from a wide clip, say); it
// prints the spot between the first two at eye height, where a shared microphone hangs. --frames holds
// the last pose until the take's length:
// --eyes puts the eye line at that share of the height when laying out (people in a medium shot).
// --place scale,x,y keeps the clip's own framing instead: the points scaled and moved as the clip's
// picture is placed on the --size frame (its first frame drawn from the clip's own, extended).
// --align kps.json[:n] moves and sizes each person, once, onto that person in the drawn first frame,
// and changes nothing else (--fit also gives them the drawn figure's bone lengths).
// --fit kps.json[:n] fits each person, once, onto that person in the take's first frame (DWPose's read
// of it, frame n of the file), and gives each the drawn figure's bone lengths, so the take starts where
// the picture has them, built as drawn:
//   node scripts/retarget-pose.ts keypoints.json out.mp4 [first.png] [--human | --animal] [--size 1152x2048] [--span 0.5] [--eyes 0.32] [--frames 57]
import { readFile } from "node:fs/promises";
import { CAT, KITTEN, conform, fit, hold, parseAnimalPoses, parsePoses, place, reframe, retarget, steady, trackPeople, writePoseVideo } from "../server/pose.ts";

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
const human = flag("--human");
const eyes = option("--eyes");
const onto = option("--fit");
const at = option("--place")?.split(",").map(Number);
const align = option("--align");
const [keypoints, out, still] = args;
if (!keypoints || !out) throw new Error("usage: retarget-pose.ts keypoints.json out.mp4 [first.png] [--human | --animal] [--size WxH] [--span 0.5] [--eyes 0.32] [--place s,x,y] [--fit | --align kps.json[:n]] [--frames N]");
const text = await readFile(keypoints, "utf8");
let frames = human ? steady(parsePoses(text, 0.3, true)) : animal ? retarget(hold(trackPeople(parseAnimalPoses(text), 2)), CAT) : retarget(parsePoses(text), KITTEN);
if (size && at) frames = place(frames, size[0], size[1], at[0], at[1], at[2]);
else if (size) {
  const laid = reframe(frames, size[0], size[1], { span: span ? Number(span) : undefined, eyes: eyes ? Number(eyes) : undefined });
  frames = laid.frames;
  if (laid.between) console.log(`between: ${laid.between.map(Math.round).join(",")}`);
}
if (onto ?? align) {
  const [file, n] = (onto ?? align)!.split(":");
  const target = parsePoses(await readFile(file, "utf8"), 0.3, true)[Number(n ?? 0)];
  frames = fit(frames, target.people);
  if (onto) frames = conform(frames, target.people);
}
while (frames.length < length) frames.push(frames[frames.length - 1]);
await writePoseVideo(frames, out);
if (still) await writePoseVideo(frames.slice(0, 1), still);
console.log(`${frames.length} frames, ${frames[0].width}×${frames[0].height}`);
