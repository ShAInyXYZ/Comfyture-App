// A clip's DWPose keypoints (the POSE_KEYPOINT JSON a ComfyUI graph saves as text) as a pose video for
// characters built differently from the people in it (kittens, by default), ready for the swap graphs'
// "ready" control, plus its first frame as a still for drawing the first frame to:
//   node scripts/retarget-pose.ts keypoints.json out.mp4 [first.png]
import { readFile } from "node:fs/promises";
import { parsePoses, retarget, writePoseVideo } from "../server/pose.ts";

const [keypoints, out, still] = process.argv.slice(2);
if (!keypoints || !out) throw new Error("usage: retarget-pose.ts keypoints.json out.mp4 [first.png]");
const frames = retarget(parsePoses(await readFile(keypoints, "utf8")));
await writePoseVideo(frames, out);
if (still) await writePoseVideo(frames.slice(0, 1), still);
console.log(`${frames.length} frames, ${frames[0].width}×${frames[0].height}`);
