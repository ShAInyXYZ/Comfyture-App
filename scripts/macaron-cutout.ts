// A picture's subject on a clear background, from the app's own remove-background tool (a running server):
//   node scripts/macaron-cutout.ts in.png out.png [server, default http://127.0.0.1:5177]
// The picture goes into the server's library, is cut out there (BiRefNet on Comfy Cloud), and the PNG with
// its alpha is saved to out.png.
import { readFile, writeFile } from "node:fs/promises";

const [src, out, base = process.env.MACARON_SERVER ?? "http://127.0.0.1:5177"] = process.argv.slice(2);
if (!src || !out) throw new Error("usage: node scripts/macaron-cutout.ts in.png out.png [server]");
const type = src.endsWith(".png") ? "image/png" : src.endsWith(".webp") ? "image/webp" : "image/jpeg";
const up = await (await fetch(`${base}/api/photos?name=cutout-source`, { method: "POST", headers: { "Content-Type": type }, body: await readFile(src) })).json();
if (!up.file) throw new Error(up.error ?? "The server did not take the picture.");

// the server says a job is done on its event stream: listen before asking
const events = await fetch(`${base}/api/events`);
const reader = events.body!.getReader();
const decoder = new TextDecoder();
let job: string | null = null;
const finished = (async () => {
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) throw new Error("The event stream closed.");
    buffer += decoder.decode(value);
    for (let at = buffer.indexOf("\n\n"); at >= 0; at = buffer.indexOf("\n\n")) {
      const frame = buffer.slice(0, at);
      buffer = buffer.slice(at + 2);
      if (!frame.includes("event: paint")) continue;
      const paint = JSON.parse(frame.split("data: ")[1]);
      if (paint.id !== job) continue;
      if (paint.status === "failed") throw new Error(paint.error);
      if (paint.status === "done") return paint;
    }
  }
})();
const started = await (await fetch(`${base}/api/utensils/cutout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: up.file }) })).json();
if (!started.id) throw new Error(started.error ?? "The cut-out did not start.");
job = started.id;
const done = await finished;
await writeFile(out, Buffer.from(await (await fetch(`${base}${done.photo.url}`)).arrayBuffer()));
console.log(`saved ${out} (${done.photo.width}x${done.photo.height})`);
reader.cancel().catch(() => {});
