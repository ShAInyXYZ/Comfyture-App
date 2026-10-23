// Spice's assistant: Paprika, the baby chameleon who runs the VFX house. This module writes her brief, the tool she answers through, what
// she is told each time (the shot open: its footage and frame range, the passes the six departments have made, the department open and its
// settings, what a run would cost, the talk so far) and reads her answer, keeping only what she can do: open a department, trim the shot,
// add a subject to Roto, set up an effect, a clean-up, a light or a finish, and ask for it to run. She knows Spice and nothing else. Setting
// up costs nothing, so the page does it at once; running costs credits (or time), so her answer only asks for it: the page asks the user,
// with the price, before anything runs. She cannot click in the viewer or paint a mask: those are the user's.
import { ELEMENTS, REMOVERS, EASES } from "../web/js/spice-model.js";
import { DEPARTMENTS } from "../web/js/spice-harness.js";

export const SPICE_OPS = ["open", "trim", "subject", "fx", "paint", "light", "finish", "run"] as const;
export const SPICE_DEPARTMENTS = DEPARTMENTS as readonly string[];
const ELEMENT_IDS = ELEMENTS.map((e) => e.id);
const LIGHT_TOOLS = ["relight", "weather", "grade"] as const;
const FINISH_TOOLS = ["upscale", "slow", "export"] as const;
const PAINT_WHAT = ["object", "logo", "subtitles"] as const;
const WEATHERS = ["rain", "snow", "fog"] as const;
const GRADES = ["none", "warm", "cool", "filmic", "punchy", "faded", "noir"] as const;
const FORMATS = ["mp4", "webm", "mov", "gif"] as const;
const EASE_IDS = EASES.map(([id]: [string, string]) => id);

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
            element: { type: "string", enum: ELEMENT_IDS, description: "For fx: the element to add." },
            words: { type: "string", description: "In your own words: what happens (fx), what to remove (paint), the light you want (light)." },
            from: { type: "number", description: "For fx: the frame the element starts on." },
            to: { type: "number", description: "For fx: the frame the element ends on." },
            depth: { type: "string", enum: ["behind", "front"], description: "For fx: behind the people or in front of them." },
            intensity: { type: "number", description: "For fx: 0 to 1." },
            spill: { type: "number", description: "For fx: how much its light falls on the shot, 0 to 1." },
            ease: { type: "string", enum: EASE_IDS, description: "For fx: how it builds." },
            x: { type: "number", description: "For fx: where it is, 0 (left) to 1 (right)." },
            y: { type: "number", description: "For fx: where it is, 0 (top) to 1 (bottom)." },
            size: { type: "number", description: "For fx: how big, 0.1 to 1." },
            what: { type: "string", enum: [...PAINT_WHAT], description: "For paint: object (words say which), logo or subtitles." },
            engine: { type: "string", description: "For paint: void, obscura or vace. For finish slow: free or film." },
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

export const SPICE_BRIEF = `You are Paprika, the baby chameleon who runs Comfyture's Spice: a VFX house. One shot goes through six departments in order, each making its pass: plate (the footage: import it, trim it to a frame range, read its depth), roto (cut subjects out, a matte for each), paint (clean up: take out an object, a logo or the subtitles), light (relight it, a new sky, weather, a grade), fx (add an element: portal, fire, explosion, lightning, disintegrate, hologram, freeze, petals, levitate, shatter, sparks) and comp (the stack of every pass, then upscale, slow motion, export). You are warm, quick and a little theatrical; you speak in one or two short sentences, in the user's language. You answer through the spice_answer tool: a reply and the actions to take.

You set a department up; the user presses its key. You cannot click in the viewer, paint a mask or import a file: those are theirs.

Actions (op and its fields):
- open {department}: open a department (plate, roto, paint, light, fx, comp).
- trim {in, out}: the frame range the shot is worked on. Frames are slate numbers: the first frame of the footage is 1001.
- subject {name}: add a subject to Roto by its name ("the woman in the raincoat"); Roto cuts it out from its name, and the user may click it in the viewer too.
- fx {element, words, from, to, depth, intensity, spill, ease, x, y, size}: open Fx with that element and its settings. from and to are the frames it plays on; depth is behind or front (the people); intensity and spill are 0 to 1; x and y say where it is (0 to 1); size 0.1 to 1. Send only what the user asked for; words only when they describe it their own way.
- paint {what, words, engine}: open Paint ready: what is object (words say which one), logo or subtitles; engine void, obscura or vace for an object.
- light {tool, words, weather, amount, grade, exposure, saturation}: open Light with that tool set up: relight (words say the light), weather (rain, snow or fog, amount 0 to 1) or grade (none, warm, cool, filmic, punchy, faded, noir).
- finish {tool, height, factor, engine, format}: open Comp with a finish set up: upscale (height 720, 1080 or 1440), slow (factor 1.5, 2, 3 or 4; engine free or film) or export (mp4, webm, mov or gif).
- run {}: run what is open, with what it holds. It can cost credits: the app asks the user to confirm the price with a key under your answer, so say it is ready, never that it has started; a yes in words gets pointed to that key.

Rules: use only the ids and the frames shown below. Set up the department that fits the job in the same answer (open it, set it, then run if the user says to make it, do it or add it); when they only ask for it ("a portal behind her") set it up and say it is ready. A job that lacks the footage, or a name or a picture it needs, gets one short question and no run. A question gets an answer and no action. Never promise what you did not do.`;

interface Pass { dept: string; note?: string; credits?: number; from?: number; to?: number; shown?: boolean }
interface Summary {
  department?: string;
  shot?: string;
  shots?: number;
  footage?: { kind?: string; name?: string; width?: number; height?: number; fps?: number; frames?: number; first?: number; last?: number; range?: [number, number] } | null;
  passes?: Pass[];
  subjects?: { name: string; tracked?: boolean; clicks?: number }[];
  fx?: { element?: string; from?: number; to?: number; depth?: string; intensity?: number; spill?: number; ease?: string; seconds?: number };
  paint?: { what?: string; engine?: string; words?: string };
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
  lines.push(`FX ELEMENTS (ids): ${ELEMENT_IDS.join(", ")}. EASES: ${EASE_IDS.join(", ")}.`);
  if (s.fx && typeof s.fx === "object") lines.push(`FX HOLDS: ${cut(s.fx.element, 16)}, frames ${Number(s.fx.from) || "?"} to ${Number(s.fx.to) || "?"} (${Number(s.fx.seconds) || "?"} s), ${cut(s.fx.depth, 8)}, intensity ${s.fx.intensity ?? "?"}, light spill ${s.fx.spill ?? "?"}, ease ${cut(s.fx.ease, 8)}.`);
  if (s.paint && typeof s.paint === "object") lines.push(`PAINT HOLDS: ${cut(s.paint.what, 12)}${s.paint.words ? ` "${cut(s.paint.words, 80)}"` : ""}, engine ${cut(s.paint.engine, 10)}. ENGINES: ${REMOVERS.join(", ")}.`);
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
      case "fx": {
        const out: any = { op: "fx" };
        const element = oneOf(a.element, ELEMENT_IDS);
        if (element) out.element = element;
        if (typeof a.words === "string" && cut(a.words, 600)) out.words = cut(a.words, 600);
        for (const k of ["from", "to"] as const) if (frame(a[k]) !== undefined) out[k] = frame(a[k]);
        const depth = oneOf(a.depth, ["behind", "front"] as const);
        if (depth) out.depth = depth;
        for (const k of ["intensity", "spill"] as const) if (num(a[k], 0, 1) !== undefined) out[k] = Math.round(num(a[k], 0, 1)! * 100) / 100;
        const ease = oneOf(a.ease, EASE_IDS as readonly string[]);
        if (ease) out.ease = ease;
        for (const k of ["x", "y"] as const) if (num(a[k], 0, 1) !== undefined) out[k] = Math.round(num(a[k], 0, 1)! * 100) / 100;
        if (num(a.size, 0.1, 1) !== undefined) out.size = Math.round(num(a.size, 0.1, 1)! * 100) / 100;
        if (Object.keys(out).length > 1) actions.push(out);
        break;
      }
      case "paint": {
        const what = oneOf(a.what, PAINT_WHAT);
        if (!what) break;
        const out: any = { op: "paint", what };
        if (what === "object" && cut(a.words, 300)) out.words = cut(a.words, 300);
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
