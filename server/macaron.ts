// Macaron's server side: Brioche, the brand's assistant (a brief, the tool she answers through, her
// answer read and checked), and the files a design leaves as: its exported pictures and the video
// encoded from its frames.
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

// ------------------------------------------------------------------ Brioche, the assistant

const OPS = ["edit_text", "set_layer", "add_layer", "remove_layer", "set_background", "apply_kit", "suggest_layout", "adapt_format", "make_variation", "generate_background", "set_status", "rename", "select_design"] as const;
const NESTED = new Set(["edit_text", "set_layer", "add_layer", "remove_layer", "set_background", "apply_kit", "suggest_layout", "adapt_format"]);

/** How Brioche answers: the tool she is made to call, so her answer is data and never prose to be guessed at. */
export const MACARON_TOOL = {
  name: "macaron_answer",
  description: "Answer the user: one short, warm sentence, and the actions to take on the design (none when they only ask a question).",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "One or two short sentences, in Brioche's voice: what you did, or the answer." },
      actions: {
        type: "array",
        description: "The changes to make, in order. Each has an op and its fields, as the brief lists them.",
        items: {
          type: "object",
          properties: {
            op: { type: "string", enum: [...OPS] },
            layer: { type: "string", description: "A layer's id, from the design below." },
            design: { type: "string", description: "A design's id." },
            text: { type: "string" },
            props: { type: "object", description: "Layer properties to set: x, y, w, h, size, align, valign, colorRole, accent, fontRole, lineHeight, tracking, opacity, hidden, caps, logo, rot, fit, text, src, role, shape, radius." },
            type: { type: "string", enum: ["text", "image", "logo", "shape"] },
            layout: { type: "string", enum: ["stack", "left", "poster", "split"] },
            format: { type: "string", enum: ["4:5", "1:1", "9:16"] },
            kind: { type: "string", enum: ["copy", "composition", "colour", "intent", "format"] },
            name: { type: "string" },
            note: { type: "string" },
            color: { type: "string", description: "A palette id for a background." },
            asset: { type: "string", description: "An asset's id, for a picture." },
            dim: { type: "number", description: "How much ink over a background picture, 0 to 0.9." },
            prompt: { type: "string", description: "What a new picture shows, in plain words. Never ask for text, a logo or a headline in it." },
            model: { type: "string", enum: ["gpt", "flux"] },
            use: { type: "string", enum: ["background", "image"] },
            status: { type: "string", enum: ["draft", "review", "approved", "scheduled"] },
            actions: { type: "array", items: { type: "object" }, description: "For make_variation: the changes to make on the new copy." },
          },
          required: ["op"],
        },
      },
    },
    required: ["reply", "actions"],
  },
};

export const MACARON_BRIEF = `You are Brioche, the baby bunny who helps with a brand's content in Comfyture's Macaron room. You are warm, brief and practical; you speak in one or two short sentences. You answer through the macaron_answer tool: a reply and the actions to take.

A design is layers on a ground: text, image, logo and shape layers, each with an id. Positions are fractions of the frame (x, y, w, h: 0 to 1, from the top left); a text's size is a fraction of the frame's width (0.1 is a big headline, 0.034 a subhead, 0.026 a label). Formats: 4:5 (1080x1350), 1:1 (1080x1080), 9:16 (1080x1920). Safe zones: keep text and logos inside x 0.07 to 0.93 and y 0.06 to 0.94; in 9:16 clear of the top 13% and the bottom 18% (the story's app covers them). Edits apply to the format that is open, so a change to "y" in 1:1 does not move the layer in 4:5.

Actions (op and its fields):
- edit_text {layer, text}: the words of a text layer. Wrap one word in *asterisks* to set it in the accent colour; \\n is a new line.
- set_layer {layer, props}: change a layer's properties in the open format (x, y, w, h, size, align left|center|right, valign top|middle|bottom, colorRole, accent, fontRole display|text|mono, lineHeight, tracking, opacity, hidden, caps, logo, rot, fit cover|contain, role).
- add_layer {type, props}: a new text, shape, image (props.src is an asset's url) or logo (props.logo is a logo id from the kit).
- remove_layer {layer}
- set_background {color, asset, dim}: a palette id for the ground, and an asset id for a picture behind (dim: 0 to 0.9 of ink over it).
- apply_kit {}: sets type roles, colours from the palette, the logo in the file that reads on its ground, keeps everything inside the safe zones. Use it when asked to apply or check the brand.
- suggest_layout {layout}: lays the layers out by their roles: stack (centred), left (type left, picture bleeding), poster (picture full-bleed, type over it), split (type and picture side by side). In the open format.
- adapt_format {format}: lays the design out for another format, keeping it readable and inside its safe zones, and opens that format.
- make_variation {kind, name, note, actions}: saves a copy of the design as a variation and makes the nested actions on the copy. kinds: copy (other words), composition (another layout), colour (another ground and colours), intent (another goal: awareness, trial, community), format. Always nest at least one action.
- generate_background {prompt, model, use}: makes a new picture with an image model and puts it behind the design (use: background) or as a layer (use: image). gpt is GPT Image 2.5 Flare (follows references, characters, products), flux is FLUX 3 (photographic scenes). The prompt describes a scene only: never ask for words, a logo or a headline in the picture: those are layers.
- set_status {design, status}, rename {name}, select_design {design}.

Rules: change only what is asked. Use the layer ids and asset ids shown below, and palette ids for colours (never hex). Copy follows the brand's voice and never uses its don'ts; headlines are short. Colours: text must stay readable on its ground (yellow and warm white on ink or plum, ink on yellow or warm white). When the user only asks a question or for advice, answer it and take no action. Never promise what you did not do.`;

type Summary = Record<string, any>;
const r = (v: unknown, n = 3) => (typeof v === "number" ? Math.round(v * 10 ** n) / 10 ** n : v);
const cut = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").slice(0, n);

/** What Brioche is told each time: the kit, the design open and the format it is open in, the others, the assets, the talk so far. */
export function macaronPrompt(s: Summary, turns: { role: string; text: string }[]) {
  const kit = s.kit ?? {};
  const d = s.design;
  const lines: string[] = [];
  lines.push(`THE BRAND: ${cut(s.name, 60)}. ${cut(kit.about, 240)}`);
  lines.push(`Voice: ${cut(kit.voice?.summary, 200)} Do: ${(kit.voice?.dos ?? []).slice(0, 5).map((x: string) => cut(x, 90)).join(" | ")} Don't: ${(kit.voice?.donts ?? []).slice(0, 5).map((x: string) => cut(x, 90)).join(" | ")}`);
  lines.push(`Palette (ids): ${(kit.palette ?? []).map((p: any) => `${p.id} ${p.hex} (${cut(p.role, 30)})`).join("; ")}`);
  lines.push(`Type roles: ${Object.entries(kit.type ?? {}).map(([k, v]: any) => `${k}: ${v.family} ${v.weight}`).join("; ")}`);
  lines.push(`Logos (ids): ${(kit.logos ?? []).map((l: any) => `${l.id} (${l.kind}, ${l.tone}, for ${cut(l.ground, 40)})`).join("; ")}`);
  if (s.brief?.goal) lines.push(`Brief: ${cut(s.brief.goal, 260)} Audience: ${cut(s.brief.audience, 140)}`);
  lines.push("");
  if (d) {
    lines.push(`THE DESIGN OPEN: id ${d.id} "${cut(d.name, 60)}", purpose ${d.purpose}, status ${d.status}${d.variantKind ? `, a ${d.variantKind} variation` : ""}. Intent: ${cut(d.intent, 120)}`);
    lines.push(`Open format: ${d.openFormat} (primary ${d.format}; own layouts: ${(d.ownFormats ?? []).join(", ")}). Ground: ${d.bg?.color ?? "?"}${d.bg?.src ? ` with a picture (dim ${r(d.bg.dim?.alpha ?? 0, 2)})` : ""}.`);
    lines.push("Layers, bottom to top (id · type · role · place in the open format · look):");
    for (const l of d.layers ?? []) {
      const place = `x${r(l.x)} y${r(l.y)} w${r(l.w)}${l.h ? ` h${r(l.h)}` : ""}`;
      const look = l.type === "text" ? `size ${r(l.size)}, ${l.fontRole}, ${l.colorRole}${l.accent ? `/${l.accent}` : ""}, ${l.align}${l.hidden ? ", hidden" : ""} · "${cut(l.text, 110)}"`
        : l.type === "logo" ? `${l.logo}`
        : l.type === "shape" ? `${l.shape} ${l.colorRole}`
        : `${cut(l.src, 60)}, ${l.fit ?? "cover"}`;
      lines.push(`- ${l.id} · ${l.type} · ${l.role ?? "-"} · ${place} · ${look}`);
    }
    if (d.guard?.length) lines.push(`Brand guard says: ${d.guard.slice(0, 6).map((g: any) => g.text).join("; ")}`);
  } else lines.push("No design is open.");
  lines.push("");
  lines.push(`OTHER DESIGNS: ${(s.designs ?? []).slice(0, 30).map((x: any) => `${x.id} "${cut(x.name, 40)}" (${x.purpose}, ${x.format}, ${x.status}${x.variant ? `, ${x.variant}` : ""})`).join("; ") || "none"}`);
  lines.push(`ASSETS (ids): ${(s.assets ?? []).slice(0, 40).map((a: any) => `${a.id} "${cut(a.name, 36)}" (${a.kind}, ${a.width}x${a.height})`).join("; ") || "none"}`);
  lines.push("");
  lines.push("THE CONVERSATION");
  for (const t of turns.slice(-8)) lines.push(`${t.role === "user" ? "User" : "Brioche"}: ${cut(t.text, 600)}`);
  return lines.join("\n");
}

const LAYER_PROPS = new Set(["x", "y", "w", "h", "size", "align", "valign", "colorRole", "accent", "fontRole", "lineHeight", "tracking", "opacity", "hidden", "caps", "logo", "rot", "fit", "text", "src", "role", "shape", "radius", "name"]);
const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);
// a writer that answers the JSON as text sometimes escapes a line break twice: it is meant as a break
const breaks = (s: string) => s.replace(/\\n/g, "\n");

function cleanAction(a: any, nested = false): any | null {
  if (!a || typeof a !== "object" || !(OPS as readonly string[]).includes(a.op)) return null;
  if (nested && !NESTED.has(a.op)) return null;
  const out: any = { op: a.op };
  for (const k of ["layer", "design", "text", "type", "layout", "format", "kind", "name", "note", "color", "asset", "prompt", "model", "use", "status"]) if (typeof a[k] === "string") out[k] = (k === "text" ? breaks(a[k]) : a[k]).slice(0, k === "text" || k === "prompt" ? 600 : 120);
  if (finite(a.dim)) out.dim = Math.min(0.9, Math.max(0, a.dim));
  if (a.props && typeof a.props === "object") {
    out.props = {};
    for (const [k, v] of Object.entries(a.props)) if (LAYER_PROPS.has(k) && (typeof v === "string" || typeof v === "boolean" || finite(v))) out.props[k] = typeof v === "string" ? (k === "text" ? breaks(v) : v).slice(0, 600) : v;
  }
  if (a.op === "make_variation") out.actions = (Array.isArray(a.actions) ? a.actions : []).map((x: any) => cleanAction(x, true)).filter(Boolean).slice(0, 12);
  return out;
}

/** Brioche's answer, read whole and checked: only known actions, with their fields kept to what is allowed. */
export function readMacaronAnswer(reply: string) {
  const from = reply.indexOf("{");
  const to = reply.lastIndexOf("}");
  let raw: any;
  try {
    raw = JSON.parse(reply.slice(from, to + 1));
  } catch {
    return { reply: reply.replace(/[{}"]/g, "").trim().slice(0, 400) || "I didn't catch that. Say it again?", actions: [] };
  }
  return { reply: String(raw.reply ?? "").slice(0, 500), actions: (Array.isArray(raw.actions) ? raw.actions : []).map((a: any) => cleanAction(a)).filter(Boolean).slice(0, 16) };
}

// ------------------------------------------------------------------ the files a design leaves as

export const exportsDir = (data: string) => join(data, "macaron", "exports");
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "design";

/** An exported picture or video, kept under the data folder with a name that says what it is. */
export async function keepExport(data: string, bytes: Buffer, name: string, ext: "png" | "mp4") {
  await mkdir(exportsDir(data), { recursive: true });
  const file = `${slug(name)}-${createHash("sha256").update(bytes).digest("hex").slice(0, 8)}.${ext}`;
  await writeFile(join(exportsDir(data), file), bytes);
  return { file, url: `/media/macaron/exports/${file}`, bytes: bytes.length };
}

const framesDir = (data: string, job: string) => join(data, "macaron", "frames", job);
export const frameJob = () => randomBytes(5).toString("hex");
export const validJob = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{6,20}$/.test(v);

/** One frame of a motion render, as a PNG, kept until the video is encoded. */
export async function keepFrame(data: string, job: string, n: number, bytes: Buffer) {
  const dir = framesDir(data, job);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${String(n).padStart(5, "0")}.png`), bytes);
}
export const dropFrames = (data: string, job: string) => rm(framesDir(data, job), { recursive: true, force: true });

/**
 * A soft sound for a motion piece, made from sines: a short wooden pop where each lid lands, and a
 * quiet pad under the whole (two fifths, breathing slowly). As an aevalsrc expression of time.
 */
function soundExpr(pops: number[], pad: boolean) {
  const pop = (at: number) => `gt(t,${at})*(0.34*sin(2*PI*196*(t-${at}))*exp(-(t-${at})*34)+0.13*sin(2*PI*784*(t-${at}))*exp(-(t-${at})*52)+0.06*sin(2*PI*1568*(t-${at}))*exp(-(t-${at})*90))`;
  const drone = "(0.035*sin(2*PI*130.81*t)+0.028*sin(2*PI*196*t)+0.02*sin(2*PI*261.63*t))*(0.75+0.25*sin(2*PI*0.35*t))";
  return [...pops.slice(0, 4).map(pop), ...(pad ? [drone] : [])].join("+") || "0";
}

/** Frames sent one by one, encoded as one H.264 video at the size they are, with a soft sound under it when asked. */
export async function encodeFrames(data: string, job: string, v: { fps: number; name: string; sound?: { pops?: number[]; pad?: boolean } }) {
  const dir = framesDir(data, job);
  const frames = (await readdir(dir)).filter((f) => f.endsWith(".png")).length;
  if (frames < 8) throw Object.assign(new Error("A video needs at least 8 frames."), { status: 400 });
  const out = join(dir, "video.mp4");
  const seconds = frames / v.fps;
  const sound = v.sound && (v.sound.pops?.length || v.sound.pad);
  const args = ["-v", "error", "-y", "-framerate", String(v.fps), "-i", join(dir, "%05d.png")];
  if (sound) args.push("-f", "lavfi", "-i", `aevalsrc='${soundExpr((v.sound!.pops ?? []).filter(Number.isFinite), !!v.sound!.pad)}':d=${seconds.toFixed(3)}:s=48000:c=stereo`);
  args.push("-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p", "-c:v", "libx264", "-crf", "17", "-preset", "slow", "-movflags", "+faststart");
  if (sound) args.push("-af", `afade=t=in:st=0:d=0.4,afade=t=out:st=${Math.max(0, seconds - 0.8).toFixed(3)}:d=0.8,alimiter=limit=0.8`, "-c:a", "aac", "-b:a", "160k");
  args.push("-t", seconds.toFixed(3), out);
  await exec("ffmpeg", args, { maxBuffer: 1 << 20 });
  const bytes = await readFile(out);
  const probe = JSON.parse((await exec("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", out])).stdout).streams?.[0] ?? {};
  const kept = await keepExport(data, bytes, v.name, "mp4");
  await dropFrames(data, job);
  return { ...kept, width: Number(probe.width), height: Number(probe.height), duration: Math.round(seconds * 100) / 100, frames, sound: !!sound };
}

/** The pictures of an old job are cleared at start, so a render that was cut off leaves nothing behind. */
export async function sweepFrames(data: string) {
  const root = join(data, "macaron", "frames");
  for (const job of await readdir(root).catch(() => [] as string[])) {
    const at = await stat(join(root, job)).catch(() => null);
    if (at && Date.now() - at.mtimeMs > 3_600_000) await rm(join(root, job), { recursive: true, force: true });
  }
}
