import { Comfy } from "@comfyorg/sdk";
import { writeFile } from "node:fs/promises";

const client = new Comfy();
const wf = client.workflows.fromJson({
  load: { class_type: "LoadImage", inputs: { image: "" } },
  invert: { class_type: "ImageInvert", inputs: { image: ["load", 0] } },
  save: { class_type: "SaveImage", inputs: { filename_prefix: "smoke/inv", images: ["invert", 0] } },
});
const png = await (await fetch("https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/input/neon_cyborg_portrait.png")).arrayBuffer();
wf.setInput("load", "image", client.assets.fromBytes(new Uint8Array(png), { name: "smoke.png" }));
const job = await client.submit(wf);
console.log("submitted", job.id, job.status);
for await (const ev of job.events()) {
  console.log("event", ev.kind, ev.kind === "statusChange" ? ev.status : "");
  if (ev.kind === "statusChange" && ["succeeded", "failed", "canceled"].includes(ev.status)) break;
}
await job.wait();
const outs = job.getOutputs("save");
console.log("status", job.status, "outputs", outs.map((o) => [o.name, o.type]));
await writeFile(process.argv[2], await outs[0].toBytes());
console.log("saved", process.argv[2]);
