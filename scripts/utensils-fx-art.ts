// The before/after pictures of the VFX cards (web/brand/utensils/vfx/<tool>-before.webp and -after.webp), made again from the pictures in
// docs/brand/products/utensils-v2/vfx-art (a few made with GPT Image, in pairs that differ only in the effect). The cards of the tools
// that run on this machine show what the tool really makes: the rain, the sparks and the cutout are drawn by the server's own effects
// (server/utensils-fx.ts) on a frame; the colour grade is ffmpeg's. The cloud tools show the pair a model made.
//   node scripts/utensils-fx-art.ts
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { createFx } from "../server/utensils-fx.ts";

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const art = join(root, "docs/brand/products/utensils-v2/vfx-art");
const out = join(root, "web/brand/utensils/vfx");
await mkdir(out, { recursive: true });
const tmp = await mkdtemp(join(tmpdir(), "vfx-art-"));
const ff = (args: string[]) => exec("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...args], { maxBuffer: 1 << 24 });

/** A picture as a 16:9, 960 wide webp. */
const webp = (input: string, name: string, vf = "null") => ff(["-i", input, "-vf", `${vf},crop=iw:iw*9/16:0:(ih-iw*9/16)/2,scale=960:540:flags=lanczos`, "-c:v", "libwebp", "-quality", "84", "-frames:v", "1", join(out, name)]);
const pair = async (id: string, before: string, after: string) => {
  await webp(before, `${id}-before.webp`);
  await webp(after, `${id}-after.webp`);
  console.log(id, "ok");
};
const p = (...parts: string[]) => join(art, ...parts);

// ---- the pairs a model made
await pair("vfx-remove", p("a/street-before.png"), p("a/street-after.png"));
await pair("vfx-background", p("c/beach-before.png"), p("c/beach-after.png"));
await pair("vfx-relight", p("b/statue-before.png"), p("b/statue-after.png"));
await pair("vfx-restyle", p("c/style-before.png"), p("c/style-after.png"));
await pair("vfx-retouch", p("b/face-before.png"), p("b/face-after.png"));

// ---- the effects of this machine, drawn by the server's own tools on a still turned into a clip
const data = join(tmp, "data");
for (const d of ["videos", "audio", "photos"]) await mkdir(join(data, d), { recursive: true });
const clipOf = (image: string, name: string) => ff(["-loop", "1", "-framerate", "24", "-i", image, "-t", "2", "-vf", "scale=1536:1024,format=yuv420p", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(data, "videos", name)]);
await clipOf(p("a/street-after.png"), "street.mp4");
await clipOf(p("a/green-person.png"), "green.mp4");
const fx = createFx({ data, root });
const frame = async (tool: any, body: Record<string, unknown>) => {
  const { url } = await fx.preview(tool, { ...body, at: 1 });
  return join(data, url.replace(/^\/media\//, ""));
};
// the green of the screen is read from the picture itself (a patch of its corner)
const { stdout } = await exec("ffmpeg", ["-v", "error", "-i", p("a/green-person.png"), "-vf", "crop=8:8:20:20,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { encoding: "buffer", maxBuffer: 1 << 20 }) as unknown as { stdout: Buffer };
const green = `#${[...stdout.subarray(0, 3)].map((n) => n.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
console.log("the screen's green", green);

await webp(p("a/green-person.png"), "vfx-chroma-before.webp");
await webp(await frame("chroma", { video: "green.mp4", colour: green, similarity: 0.2, blend: 0.08, output: "webm" }), "vfx-chroma-after.webp");
console.log("vfx-chroma ok");
for (const [id, tool, body] of [["vfx-weather", "weather", { kind: "rain", amount: 0.7, angle: 12 }], ["vfx-sparks", "sparks", { kind: "sparks", amount: 0.8 }]] as const) {
  await webp(p("a/street-after.png"), `${id}-before.webp`);
  await webp(await frame(tool, { video: "street.mp4", ...body }), `${id}-after.webp`);
  console.log(id, "ok");
}

// ---- a shaky shot and a steady one: the same picture three times, a little apart, then once
{
  const ghost = join(tmp, "ghost.png");
  await ff(["-loop", "1", "-framerate", "3", "-i", p("a/street-after.png"), "-t", "1", "-vf", "crop=w=iw-60:h=ih-36:x='30+26*sin(n*2.1)':y='18+15*cos(n*2.7)',tmix=frames=3,scale=1536:1024", "-frames:v", "1", "-start_number", "0", ghost]).catch(async () => {
    await ff(["-i", p("a/street-after.png"), "-vf", "gblur=sigma=14:sigmaV=2", "-frames:v", "1", ghost]);
  });
  const steady = join(tmp, "steady.png");
  await ff(["-i", p("a/street-after.png"), "-vf", "crop=w=iw-60:h=ih-36:x=30:y=18,scale=1536:1024", "-frames:v", "1", steady]);
  await webp(ghost, "vfx-stabilise-before.webp");
  await webp(steady, "vfx-stabilise-after.webp");
  console.log("vfx-stabilise ok");
}

// ---- slow motion: the same pan as 3 frames and as 8
{
  const strip = async (n: number, to: string) => {
    const w = 1536;
    const h = 1024;
    // each frame is a window on the picture, moving across it; the strip is as wide as one picture
    const cw = Math.round(w / n);
    const parts = Array.from({ length: n }, (_, i) => `[0:v]crop=${cw}:${h}:${Math.round(((w - cw) * i) / Math.max(1, n - 1))}:0,drawbox=x=0:y=0:w=3:h=${h}:color=black@0.9:t=fill[f${i}]`);
    const filter = `${parts.join(";")};${Array.from({ length: n }, (_, i) => `[f${i}]`).join("")}hstack=inputs=${n},scale=${w}:${h}`;
    await ff(["-i", p("a/street-after.png"), "-filter_complex", filter, "-frames:v", "1", to]);
  };
  await strip(3, join(tmp, "slow-before.png"));
  await strip(9, join(tmp, "slow-after.png"));
  await webp(join(tmp, "slow-before.png"), "vfx-slowmo-before.webp");
  await webp(join(tmp, "slow-after.png"), "vfx-slowmo-after.webp");
  console.log("vfx-slowmo ok");
}

// ---- a flat grey picture and the same one graded
{
  const graded = join(tmp, "graded.png");
  await ff(["-i", p("c/mood-before.png"), "-vf", "eq=contrast=1.14:saturation=1.38:gamma=0.94,colorbalance=rs=-0.1:bs=0.14:rh=0.16:bh=-0.12,vignette=PI/6", "-frames:v", "1", graded]);
  await webp(p("c/mood-before.png"), "vfx-grade-before.webp");
  await webp(graded, "vfx-grade-after.webp");
  console.log("vfx-grade ok");
}

await rm(tmp, { recursive: true, force: true });
console.log((await readdir(out)).length, "pictures in", out);
