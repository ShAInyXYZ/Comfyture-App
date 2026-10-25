// One of the bay's example shots (examples/bay/<id>/bay.json beside its pictures and clips): the clip and every take's media go into the
// library (data/videos, data/photos) so each stage can work on them like footage of the person's own, and the shot is written as the bay
// keeps one (data/spice-bays). A take that an example only stands in for (a clean-up or an edit drawn with GPT Image, not run by its engine)
// says so: `source: "example"`.
import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { addTake, blankBody, normaliseBody, withPlan, STAGE_IDS } from "../web/js/spice2-model.js";

const FILE = /^[\w.-]+\.(mp4|jpg|png|webp)$/;

export interface BayExampleDeps {
  /** the data folder */
  data: string;
  /** a moment, each later than the one before */
  stamp: () => string;
  /** writes the project into the store */
  write: (project: { id: string; name: string; createdAt: string; updatedAt: string; thumb?: string; body: unknown }) => Promise<void>;
}

export async function putBayExample(spec: any, folder: string, id: string, version: number, deps: BayExampleDeps) {
  const { data } = deps;
  const rev = version > 1 ? `-r${version}` : "";
  let body: any = blankBody();
  body.brief = String(spec.brief ?? "");
  let thumb: string | undefined;

  /** A file of the example in the library; answers it as media. */
  async function media(tag: string, p: any) {
    if (!p || !FILE.test(String(p.file ?? ""))) return null;
    const ext = p.file.split(".").pop()!.toLowerCase();
    const pic = ext !== "mp4";
    const file = `${id}-${tag}${rev}.${ext}`;
    await mkdir(join(data, pic ? "photos" : "videos"), { recursive: true });
    await copyFile(join(folder, p.file), join(data, pic ? "photos" : "videos", file));
    const size = { width: Number(p.width) || 1280, height: Number(p.height) || 720 };
    const m: any = pic ? { kind: "image", url: `/media/photos/${file}`, file, ...size } : { kind: "video", url: `/media/videos/${file}`, file, ...size, seconds: Number(p.seconds) || 8 };
    if (p.still && FILE.test(p.still) && !pic) {
      const still = `${id}-${tag}${rev}-still.${p.still.split(".").pop()}`;
      await mkdir(join(data, "photos"), { recursive: true });
      await copyFile(join(folder, p.still), join(data, "photos", still));
      m.still = `/media/photos/${still}`;
    }
    return m;
  }

  const at = deps.stamp();
  const clip = await media("clip", spec.clip);
  if (clip) {
    body.clip = { media: clip, fps: Number(spec.clip.fps) || 24, name: String(spec.clip.name ?? "clip.mp4"), at };
    thumb = clip.still;
  }
  // each take a millisecond after the one before, so the ledger reads in the order they were made
  let tick = Date.parse(at);
  for (const stage of STAGE_IDS) {
    for (const [i, t] of (spec.stages?.[stage]?.takes ?? []).entries()) {
      const m = await media(`${stage}${i}`, t);
      if (!m) continue;
      tick += 1000;
      body = addTake(body, stage, {
        engine: String(t.engine ?? ""), title: String(t.title ?? ""), mode: String(t.mode ?? ""), prompt: String(t.prompt ?? ""), media: m, from: String(t.from ?? "clip"),
        credits: 0, source: t.source === "local" ? "local" : "example", seconds: Number(t.took) || 0, at: new Date(tick).toISOString(), note: String(t.note ?? ""),
      }, { mark: !!t.mark });
    }
  }
  body = withPlan(body, spec.plan ?? []);
  await deps.write({ id, name: String(spec.name ?? "Example"), createdAt: at, updatedAt: at, ...(thumb ? { thumb } : {}), body: normaliseBody(body) });
}
