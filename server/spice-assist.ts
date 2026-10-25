// Spice's assistant: Paprika, the baby chameleon who runs the VFX house. This module writes her brief, the tool she answers through, what
// she is told each time (the shot open: its footage and frame range, the passes the six departments have made, the department open and its
// settings, what a run would cost, the talk so far) and reads her answer, keeping only what she can do: open a department, trim the shot,
// add a subject to Roto, set up an effect (the light a layer casts on the shot too, and the shot's own bloom and vignette: `polish`), a
// clean-up, a light or a finish, and ask for it to run. She knows Spice and nothing else. Setting
// up costs nothing, so the page does it at once; running costs credits (or time), so her answer only asks for it: the page asks the user,
// with the price, before anything runs. She cannot click in the viewer or paint a mask: those are the user's.
import { ELEMENTS, REMOVERS } from "../web/js/spice-model.js";
import { LIBRARY, BLENDS, MOTIONS } from "../web/js/spice-elements.js";
import { DEPARTMENTS } from "../web/js/spice-harness.js";

export const SPICE_OPS = ["open", "trim", "subject", "layer", "tweak", "polish", "paint", "light", "finish", "run"] as const;
export const SPICE_DEPARTMENTS = DEPARTMENTS as readonly string[];
// Fx: the library's elements (laid free) and the AI effects (Kitchen's presets: made by a model, they cost credits)
const LIBRARY_IDS = LIBRARY.filter((e) => e.kind !== "ai").map((e) => e.id);
export const AI_IDS = ELEMENTS.filter((e) => e.preset).map((e) => `ai:${e.id}`);
const BLEND_IDS = BLENDS.map((b) => b.id);
const MOTION_IDS = MOTIONS.map(([id]) => id);
const LIGHT_TOOLS = ["relight", "weather", "grade"] as const;
const FINISH_TOOLS = ["upscale", "slow", "export"] as const;
const PAINT_WHAT = ["object", "logo", "subtitles"] as const;
const WEATHERS = ["rain", "snow", "fog"] as const;
const GRADES = ["none", "warm", "cool", "filmic", "punchy", "faded", "noir"] as const;
const FORMATS = ["mp4", "webm", "mov", "gif"] as const;

/** How Paprika answers: the tool she is made to call, so her answer is data and never prose to be guessed at. */
export const SPICE_TOOL = {
  name: "spice_answer",
  description: "Answer the user: one or two short sentences, and the actions to take on the shot (none when they only ask a question).",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "One or two short sentences, in Paprika's voice: what you did, or the answer." },
      actions: {
        type: "array",
        description: "What to do, in order. Each has an op and its fields, as the brief lists them.",
        items: {
          type: "object",
          properties: {
            op: { type: "string", enum: [...SPICE_OPS] },
            department: { type: "string", enum: [...SPICE_DEPARTMENTS], description: "For open: the department to open." },
            in: { type: "number", description: "For trim: the first frame to work on." },
            out: { type: "number", description: "For trim: the last frame to work on." },
            name: { type: "string", description: "For subject: what to cut out, by its name." },
            element: { type: "string", enum: [...LIBRARY_IDS, ...AI_IDS], description: "For layer: a library element (free) or an AI effect (ai:..., made by a model)." },
            words: { type: "string", description: "In your own words: what an AI layer is (layer), what to remove (paint), the light you want (light)." },
            x: { type: "number", description: "For layer and tweak: its centre, 0 (left) to 1 (right)." },
            y: { type: "number", description: "For layer and tweak: its centre, 0 (top) to 1 (bottom)." },
            size: { type: "number", description: "For layer and tweak: its width as a share of the frame's (1 is the whole width)." },
            angle: { type: "number", description: "For layer and tweak: its angle in degrees." },
            blend: { type: "string", enum: BLEND_IDS, description: "For layer and tweak: how it lies on the picture (screen for light and fire)." },
            opacity: { type: "number", description: "For layer and tweak: 0 to 1." },
            glow: { type: "number", description: "For layer and tweak: 0 to 1." },
            light: { type: "number", description: "For layer and tweak (a library element, not particles or an AI effect): how much light it casts on the shot and the people, 0 (none) to 1." },
            reach: { type: "number", description: "For layer and tweak: how far its light reaches, 0.3 to 4, in boxes of the layer's own size." },
            follow: { type: "boolean", description: "For layer and tweak, on a clip whose subject Roto holds (not an AI effect): true keeps the layer's place on the subject as it moves, placed where it is now." },
            bloom: { type: "number", description: "For polish: a soft glow around the bright parts of the whole shot, 0 (none) to 1." },
            vignette: { type: "number", description: "For polish: darker corners over the whole shot, 0 (none) to 1." },
            tint: { type: "string", description: "For layer and tweak: a colour #rrggbb laid on its light." },
            behind: { type: "boolean", description: "For layer and tweak: behind the people Roto holds (true) or in front (false)." },
            motion: { type: "string", enum: MOTION_IDS, description: "For layer and tweak, on a clip: how it moves." },
            from: { type: "number", description: "For layer and tweak, on a clip: the first frame it plays on." },
            to: { type: "number", description: "For layer and tweak, on a clip: the last frame it plays on." },
            what: { type: "string", enum: [...PAINT_WHAT], description: "For paint: object (words say which), logo or subtitles." },
            after: { type: "string", description: "For paint with void: the place once the object is gone, what is left there (an empty pavement, a bare wall), never the object." },
            engine: { type: "string", description: "For paint: void or obscura. For finish slow: free or film." },
            tool: { type: "string", enum: [...LIGHT_TOOLS, ...FINISH_TOOLS], description: "For light: relight, weather or grade. For finish: upscale, slow or export." },
            weather: { type: "string", enum: [...WEATHERS] },
            amount: { type: "number", description: "For light weather: 0 to 1." },
            grade: { type: "string", enum: [...GRADES] },
            exposure: { type: "number", description: "For light grade: -1 to 1." },
            saturation: { type: "number", description: "For light grade: 0 to 3." },
            height: { type: "number", description: "For finish upscale: 720, 1080 or 1440." },
            factor: { type: "number", description: "For finish slow: 1.5, 2, 3 or 4." },
            format: { type: "string", enum: [...FORMATS], description: "For finish export." },
          },
          required: ["op"],
        },
      },
    },
    required: ["reply", "actions"],
  },
};

export const SPICE_BRIEF = `You are Paprika, the baby chameleon who runs Comfyture's Spice: a VFX house. A shot (a clip or a picture) goes through six departments, each making its pass: plate (the footage: trim it, read its depth), roto (cut subjects out as mattes), paint (take out an object, a logo, the subtitles), light (relight, a new sky, weather, a grade), fx (a compositor: effects laid as layers the user moves on the picture, from a library or made by an AI model) and comp (upscale, slow motion, export). You are warm, quick, a little theatrical, and say one or two short sentences in the user's language, through the spice_answer tool.

You set things up; the user presses the keys. You cannot click in the viewer, paint a mask or import a file.

Actions:
- open {department}
- trim {in, out}: the frames worked on (slate numbers: the footage's first frame is 1001).
- subject {name}: a subject for Roto to cut out ("the frog on the stage").
- layer {element, x, y, size, angle, blend, opacity, glow, light, reach, follow, tint, behind, motion, from, to, words}: add an Fx layer and hold it. element: a library id, laid free, or an AI id (ai:portal...), made by a model when run (credits; words say what). x, y: its centre, 0 to 1. size: its width as a share of the frame. angle in degrees. opacity, glow 0 to 1. light 0 to 1: the light it casts on the shot and the people (fires and portals shine, smoke does not). reach 0.3 to 4: how far, in boxes of its own. follow true: stays on Roto's subject as it moves (clips). tint #rrggbb. behind true: behind the people Roto holds. motion (clips) and from, to (frames). Send only what was asked.
- tweak {same fields, no element}: change the layer held.
- polish {bloom, vignette}: Fx's whole-shot finish (not Comp's): bloom, a glow round bright parts; vignette, dark corners; 0 to 1.
- paint {what, words, after, engine}: object (words name it, short), logo or subtitles; engine void or obscura; after (void): what is left once it is gone.
- light {tool, words, weather, amount, grade, exposure, saturation}: relight (words), weather (rain, snow, fog; amount 0 to 1) or grade (none, warm, cool, filmic, punchy, faded, noir).
- finish {tool, height, factor, engine, format}: upscale (720, 1080, 1440), slow (1.5, 2, 3, 4; free or film) or export (mp4, webm, mov, gif).
- run {}: run the key of the department open (Fx: make the AI layer held, else bake the layers, free). It may cost credits: the app asks the user to confirm under your answer, so say it is ready, never that it has started.

Rules: only the ids and frames shown below. Set up what fits the job (open it, set it; run when they say make it or do it). Missing footage, a name or a picture: one short question, no run. A question: an answer, no action. Never promise what you did not do. Someone new ("how do I start?", "what is this for?"): two short sentences naming where to begin and the key to press, and say that Show me around, above the bar, walks them through an example for free.`;

interface Pass { dept: string; note?: string; credits?: number; from?: number; to?: number; shown?: boolean }
interface Summary {
  department?: string;
  shot?: string;
  shots?: number;
  footage?: { kind?: string; name?: string; width?: number; height?: number; fps?: number; frames?: number; first?: number; last?: number; range?: [number, number] } | null;
  passes?: Pass[];
  subjects?: { name: string; tracked?: boolean; clicks?: number }[];
  fx?: { layers?: { el?: string; name?: string; x?: number; y?: number; size?: number; blend?: string; behind?: boolean; made?: boolean; from?: number | null; to?: number | null; light?: number; reach?: number; follow?: boolean }[]; held?: string | null; matte?: boolean; finish?: { bloom?: number; vignette?: number } };
  paint?: { what?: string; engine?: string; words?: string; after?: string };
  light?: { tool?: string; words?: string; weather?: string; grade?: string };
  comp?: { tool?: string; height?: number; factor?: number; engine?: string; format?: string };
  run?: { label?: string; cost?: number | null; free?: boolean; ready?: boolean; why?: string };
  today?: number;
  busy?: string[];
}
export interface Turn { role: string; text: string; did?: string[] }

const cut = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const list = <T>(v: unknown, n: number): T[] => (Array.isArray(v) ? (v.slice(0, n) as T[]) : []);
const things = <T>(v: unknown, n: number): T[] => list<T>(v, n).filter((x) => x && typeof x === "object");
const num = (v: unknown, lo: number, hi: number): number | undefined => {
  const n = Number(v);
  return v !== null && v !== "" && v !== undefined && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined;
};
const oneOf = <T extends string>(v: unknown, values: readonly T[]): T | undefined => (typeof v === "string" && (values as readonly string[]).includes(v) ? (v as T) : undefined);
const r2 = (v: number) => Math.round(v * 100) / 100;

/** What Paprika is told each time: the shot, its footage, the passes, the department open and what it holds, the key's price, the talk so far. */
export function spicePrompt(s: Summary, turns: Turn[]) {
  const lines: string[] = [];
  const here = cut(s.department, 8);
  lines.push(`THE SHOT: ${cut(s.shot, 60) || "untitled"}${typeof s.shots === "number" ? ` (${s.shots} shot${s.shots === 1 ? "" : "s"} in all)` : ""}. DEPARTMENT OPEN: ${here || "none"}. THE DEPARTMENTS, in order: ${SPICE_DEPARTMENTS.join(", ")}.`);
  const f = s.footage;
  if (f && typeof f === "object") {
    const r = Array.isArray(f.range) ? `, worked on frames ${Number(f.range[0])} to ${Number(f.range[1])}` : "";
    lines.push(`THE FOOTAGE: ${cut(f.kind, 8) === "image" ? "a picture" : "a clip"} ${cut(f.name, 60)}, ${Number(f.width) || "?"} × ${Number(f.height) || "?"}${f.kind === "video" ? `, ${Number(f.fps) || 24} fps, frames ${Number(f.first) || 1001} to ${Number(f.last) || "?"}` : ""}${r}.`);
  } else lines.push("THE FOOTAGE: none yet. The user brings it to the plate; until then nothing can be run.");
  const passes = things<Pass>(s.passes, 8);
  lines.push(passes.length ? `THE PASSES MADE: ${passes.map((p) => `${cut(p.dept, 8)}${p.note ? ` (${cut(p.note, 60)})` : ""}${typeof p.from === "number" ? `, frames ${p.from}-${p.to}` : ""}${p.shown === false ? ", hidden" : ""}`).join("; ")}.` : "THE PASSES MADE: none beyond the footage.");
  const subjects = things<{ name: string; tracked?: boolean; clicks?: number }>(s.subjects, 6);
  if (subjects.length) lines.push(`ROTO'S SUBJECTS: ${subjects.map((x) => `${cut(x.name, 40)} (${x.tracked ? "cut out" : "not yet"}, ${Number(x.clicks) || 0} clicks)`).join("; ")}.`);
  lines.push(`FX LIBRARY (ids): ${LIBRARY_IDS.join(", ")}. AI EFFECTS (ids): ${AI_IDS.join(", ")}. BLENDS: ${BLEND_IDS.join(", ")}. MOTIONS: ${MOTION_IDS.join(", ")}.`);
  if (s.fx && typeof s.fx === "object") {
    const layers = things<NonNullable<NonNullable<Summary["fx"]>["layers"]>[number]>(s.fx.layers, 12);
    const at = (v: unknown) => (typeof v === "number" ? v.toFixed(2) : "?");
    // (the light a layer casts, told only for one that casts some: the others cast none)
    const shines = (l: { light?: number; reach?: number }) => (typeof l.light === "number" && l.light > 0 ? `, light ${at(l.light)}, reach ${typeof l.reach === "number" ? l.reach.toFixed(1) : "?"}` : "");
    lines.push(layers.length
      ? `FX LAYERS (bottom first): ${layers.map((l) => `${cut(l.name || l.el, 30)} (${cut(l.el, 16)}, at ${at(l.x)} ${at(l.y)}, size ${at(l.size)}, ${cut(l.blend, 8)}${shines(l)}${l.follow ? ", follows the subject" : ""}${l.behind ? ", behind the people" : ""}${l.made === false ? ", not made yet" : ""}${typeof l.from === "number" ? `, frames ${l.from}-${l.to}` : ""})`).join("; ")}. HELD: ${cut(s.fx.held, 30) || "none"}.`
      : "FX LAYERS: none yet.");
    if (s.fx.finish && typeof s.fx.finish === "object") lines.push(`FX FINISH (the whole shot): bloom ${at(s.fx.finish.bloom)}, vignette ${at(s.fx.finish.vignette)}.`);
    if (s.fx.matte === false) lines.push("ROTO HOLDS NOBODY YET: a layer cannot go behind the people until a subject is cut out.");
  }
  if (s.paint && typeof s.paint === "object") lines.push(`PAINT HOLDS: ${cut(s.paint.what, 12)}${s.paint.words ? ` "${cut(s.paint.words, 80)}"` : ""}${s.paint.after ? `, what is left "${cut(s.paint.after, 80)}"` : ""}, engine ${cut(s.paint.engine, 10)}. ENGINES: ${REMOVERS.join(", ")}.`);
  if (s.light && typeof s.light === "object") lines.push(`LIGHT HOLDS: ${cut(s.light.tool, 10)}, light "${cut(s.light.words, 80)}", weather ${cut(s.light.weather, 6)}, grade ${cut(s.light.grade, 8)}.`);
  if (s.comp && typeof s.comp === "object") lines.push(`COMP HOLDS: ${cut(s.comp.tool, 8)}, ${Number(s.comp.height) || "?"}p, ${s.comp.factor ?? "?"}x, ${cut(s.comp.engine, 6)}, ${cut(s.comp.format, 5)}.`);
  const r = s.run;
  if (r && typeof r === "object") lines.push(`THE KEY OF THE DEPARTMENT OPEN: "${cut(r.label, 40)}". ${r.ready ? "It has what it needs." : `It is missing something: ${cut(r.why, 80)}.`} ${r.free ? "It runs free, on this machine." : typeof r.cost === "number" ? `Running it costs about ${Math.round(r.cost)} credits.` : "Its price is told when it runs."}`);
  if (Array.isArray(s.busy) && s.busy.length) lines.push(`WORKING NOW: ${s.busy.map((x) => cut(x, 8)).join(", ")}.`);
  if (typeof s.today === "number") lines.push(`CREDITS SPENT TODAY: ${Math.round(s.today)}.`);
  lines.push("", "THE CONVERSATION");
  for (const t of turns.slice(-8)) lines.push(`${t.role === "user" ? "User" : "Paprika"}: ${cut(t.text, 600)}${t.did?.length ? ` [the app did: ${t.did.join(", ")}]` : ""}`);
  return lines.join("\n");
}

/**
 * Paprika's answer, read whole and checked against what the page told her: only her own actions, each with only what it takes, every
 * choice one of its values, every number within its range (a frame within the footage), and run once, last. Anything else is dropped.
 */
export function readSpiceAnswer(reply: string, s: Summary = {}) {
  const from = reply.indexOf("{");
  const to = reply.lastIndexOf("}");
  let raw: any;
  try {
    raw = JSON.parse(reply.slice(from, to + 1));
  } catch {
    return { reply: reply.replace(/[{}"]/g, "").trim().slice(0, 400) || "I didn't catch that. Say it again?", actions: [] as any[] };
  }
  const first = Number(s.footage?.first) || 1001;
  const last = Number(s.footage?.last) || first;
  const frame = (v: unknown) => (num(v, first, last) === undefined ? undefined : Math.round(num(v, first, last)!));
  const actions: any[] = [];
  let run = false;
  for (const a of list<any>(raw.actions, 40)) {
    if (actions.length >= 8) break;
    switch (a?.op) {
      case "open": {
        const department = oneOf(a.department, SPICE_DEPARTMENTS);
        if (department) actions.push({ op: "open", department });
        break;
      }
      case "trim": {
        const inn = frame(a.in);
        const out = frame(a.out);
        if (inn !== undefined || out !== undefined) actions.push({ op: "trim", ...(inn !== undefined ? { in: inn } : {}), ...(out !== undefined ? { out } : {}) });
        break;
      }
      case "subject": {
        const name = cut(a.name, 60);
        if (name) actions.push({ op: "subject", name });
        break;
      }
      case "layer":
      case "tweak": {
        const out: any = { op: a.op };
        if (a.op === "layer") {
          const element = oneOf(a.element, [...LIBRARY_IDS, ...AI_IDS]);
          if (!element) break;
          out.element = element;
        }
        if (typeof a.words === "string" && cut(a.words, 600)) out.words = cut(a.words, 600);
        for (const k of ["x", "y"] as const) if (num(a[k], -0.5, 1.5) !== undefined) out[k] = r2(num(a[k], -0.5, 1.5)!);
        if (num(a.size, 0.03, 3) !== undefined) out.size = r2(num(a.size, 0.03, 3)!);
        if (num(a.angle, -360, 360) !== undefined) out.angle = Math.round(num(a.angle, -360, 360)!);
        const blend = oneOf(a.blend, BLEND_IDS);
        if (blend) out.blend = blend;
        for (const k of ["opacity", "glow", "light"] as const) if (num(a[k], 0, 1) !== undefined) out[k] = r2(num(a[k], 0, 1)!);
        if (num(a.reach, 0.3, 4) !== undefined) out.reach = r2(num(a.reach, 0.3, 4)!);
        if (typeof a.tint === "string" && /^#[0-9a-f]{6}$/i.test(a.tint)) out.tint = a.tint.toLowerCase();
        if (typeof a.behind === "boolean") out.behind = a.behind;
        if (typeof a.follow === "boolean") out.follow = a.follow;
        const motion = oneOf(a.motion, MOTION_IDS);
        if (motion) out.motion = motion;
        for (const k of ["from", "to"] as const) if (frame(a[k]) !== undefined) out[k] = frame(a[k]);
        if (a.op === "layer" || Object.keys(out).length > 1) actions.push(out);
        break;
      }
      case "polish": {
        // the shot's own finish: what it says of the bloom and the vignette, kept inside 0 to 1 (an empty polish is dropped)
        const out: any = { op: "polish" };
        for (const k of ["bloom", "vignette"] as const) if (num(a[k], 0, 1) !== undefined) out[k] = r2(num(a[k], 0, 1)!);
        if (Object.keys(out).length > 1) actions.push(out);
        break;
      }
      case "paint": {
        const what = oneOf(a.what, PAINT_WHAT);
        if (!what) break;
        const out: any = { op: "paint", what };
        if (what === "object" && cut(a.words, 300)) out.words = cut(a.words, 300);
        if (what === "object" && cut(a.after, 300)) out.after = cut(a.after, 300);
        const engine = oneOf(a.engine, REMOVERS as readonly string[]);
        if (what === "object" && engine) out.engine = engine;
        actions.push(out);
        break;
      }
      case "light": {
        const tool = oneOf(a.tool, LIGHT_TOOLS);
        if (!tool) break;
        const out: any = { op: "light", tool };
        if (tool === "relight" && cut(a.words, 300)) out.words = cut(a.words, 300);
        if (tool === "weather") {
          const weather = oneOf(a.weather, WEATHERS);
          if (weather) out.weather = weather;
          if (num(a.amount, 0, 1) !== undefined) out.amount = Math.round(num(a.amount, 0, 1)! * 100) / 100;
        }
        if (tool === "grade") {
          const grade = oneOf(a.grade, GRADES);
          if (grade) out.grade = grade;
          if (num(a.exposure, -1, 1) !== undefined) out.exposure = Math.round(num(a.exposure, -1, 1)! * 100) / 100;
          if (num(a.saturation, 0, 3) !== undefined) out.saturation = Math.round(num(a.saturation, 0, 3)! * 100) / 100;
        }
        actions.push(out);
        break;
      }
      case "finish": {
        const tool = oneOf(a.tool, FINISH_TOOLS);
        if (!tool) break;
        const out: any = { op: "finish", tool };
        if (tool === "upscale") {
          const h = [720, 1080, 1440].find((v) => v === Math.round(Number(a.height)));
          if (h) out.height = h;
        } else if (tool === "slow") {
          const f = [1.5, 2, 3, 4].find((v) => v === Number(a.factor));
          if (f) out.factor = f;
          const engine = oneOf(a.engine, ["free", "film"] as const);
          if (engine) out.engine = engine;
        } else {
          const format = oneOf(a.format, FORMATS);
          if (format) out.format = format;
        }
        actions.push(out);
        break;
      }
      case "run":
        run = true;
        break;
    }
  }
  // running is asked for once, last, and only when there is a department it could be the key of
  if (run && (SPICE_DEPARTMENTS.includes(String(s.department)) || actions.some((a) => a.op !== "trim"))) actions.push({ op: "run" });
  return { reply: cut(raw.reply, 500), actions };
}
