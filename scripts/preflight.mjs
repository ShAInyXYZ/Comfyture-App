// Run by npm before `npm start` and `npm run dev`: says plainly what is missing on this machine, before the server fails on it.
// Node.js 22.18 or newer runs the server's TypeScript as it is; an older one cannot start it at all. ffmpeg is only needed by the free
// edits, bakes and exports, so its absence is said and the app starts anyway. Plain JavaScript, so any Node can read it.
import { execFileSync } from "node:child_process";

const NEED = [22, 18];
// (COMFYTURE_NODE_VERSION stands in for this Node's version, to try the message)
const have = (process.env.COMFYTURE_NODE_VERSION || process.versions.node).split(".").map(Number);
const old = have[0] < NEED[0] || (have[0] === NEED[0] && have[1] < NEED[1]);
if (old) {
  console.error(`Comfyture needs Node.js ${NEED.join(".")} or newer, and this is ${have.join(".")}.`);
  console.error("Install a current Node.js (https://nodejs.org, or `nvm install 22`), then run `npm start` again.");
  process.exit(1);
}
try {
  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
} catch {
  console.warn("ffmpeg is not installed: the app starts, but the free edits, bakes and exports need it (https://ffmpeg.org).");
}
