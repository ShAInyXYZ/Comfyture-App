// Spice's assistant: Paprika, the baby chameleon who runs the AI VFX suite. This module writes her brief, the tool she answers through,
// what she is told each time (the scenario and its shots, the shot open with its chain of passes, the tool picked and its words, what a
// run would cost, the talk so far) and reads her answer, keeping only what she can do: open a shot, look at a pass, set a tool up with its
// words and settings, set a new shot up from words, and ask for the key to run. She knows Spice and nothing else. Setting up costs
// nothing, so the page does it at once; running costs credits, so her answer only asks for it: the page asks the user, with the price,
// before anything runs. She cannot pick a first frame or bring a clip in: those are the user's.

export const SPICE_OPS = ["open", "look", "tool", "shot", "run"] as const;
const SIZES = ["draft", "standard"] as const;
const HEIGHTS = [720, 1080, 1440];

/** How Paprika answers: the tool she is made to call, so her answer is data and never prose to be guessed at. */
export const SPICE_TOOL = {
  name: "spice_answer",
  description: "Answer the user: one or two short sentences, and the actions to take on the scenario (none when they only ask a question).",
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
            shot: { type: "string", description: "For open: the id of the shot to open, one of THE SHOTS." },
            pass: { type: "string", description: "For look: the id of a pass of the shot open, or plate." },
            tool: { type: "string", description: "For tool: the id of the tool to set up, one of THE TOOLS." },
            words: { type: "string", description: "For tool: what the tool is told (the effect, the subject to cut out, the sound). For shot: what LTX-2.5 is told of the motion." },
            scene: { type: "string", description: "For tool, a card with a fixed grammar: the shot described in a sentence." },
            strength: { type: "number", description: "For tool, an IC-LoRA: its strength, 0 to 2 (the card's when left out)." },
            size: { type: "string", enum: [...SIZES], description: "For tool, an IC-LoRA: draft (a look, a few credits) or standard (the one to keep)." },
            seconds: { type: "number", description: "For tool: the seconds of the clip to run it on, 1 to 10. For shot: the seconds to roll, 2 to 10." },
            aspect: { type: "number", description: "For tool, a widening tool: the frame's width over its height to widen to (2.39 for scope, 1 for a square)." },
            height: { type: "number", description: "For tool, the upscale: 720, 1080 or 1440." },
          },
          required: ["op"],
        },
      },
    },
    required: ["reply", "actions"],
  },
};

export const SPICE_BRIEF = `You are Paprika, the baby chameleon who runs Comfyture's Spice: an AI VFX suite. A scenario is a few shots. Each shot is its plate (a clip LTX-2.5 rolled from a first frame and some words, or a clip brought in) and a chain of passes the suite's tools made on it, each on the one before. Every tool is a workflow on Comfy Cloud: the IC-LoRAs of LTX-2.3 (restore, upscale, grade and light, clean, frame, camera, control, effects), SAM3's cut-out, SeedVR2's upscale, LTX-2.5's sound, Wan's restyle. A pass keeps the clip it ran on and the clip it made; the viewer wipes between them. You are warm, quick, a little theatrical, and say one or two short sentences in the user's language, through the spice_answer tool.

You set things up; the user presses the keys. You cannot pick a first frame, bring a clip in or click in the viewer.

Actions:
- open {shot}: open a shot of the scenario, by an id of THE SHOTS.
- look {pass}: look at a pass of the shot open (an id of ITS PASSES), or plate. A new run goes on the pass looked at.
- tool {tool, words, scene, strength, size, seconds, aspect, height}: pick a tool by an id of THE TOOLS and set it up. words: what it is told (a card with a fixed grammar takes the effect's words; cut-out takes the subject's name; sound takes what is heard). scene: the shot in a sentence, for a card with a fixed grammar. strength 0 to 2, size draft or standard, seconds 1 to 10 (IC-LoRAs). aspect: width over height, for a widening tool. height 720, 1080 or 1440, for the upscale. Send only what was asked.
- shot {words, seconds}: set a new shot up: what LTX-2.5 is told of the motion, and its seconds (2 to 10). The user picks its first frame and rolls it.
- run {}: run the key of the tool picked on the shot open. It costs credits: the app asks the user to confirm, so say it is ready, never that it has started.

Rules: only the ids shown below. A tool that needs more than a clip cannot run: say so. Set up what fits the job (open the shot, pick the tool, set its words; run when they say do it). Chain passes for a job in steps (take the van out, then turn the day to night, then widen). Missing footage or words: one short question, no run. A question: an answer, no action. Never promise what you did not do. Someone new ("how do I start?"): two short sentences on where to begin and the key to press, and that Show me around, above the bar, walks through the example for free.`;

interface Pass { id: string; tool?: string; name?: string; words?: string; credits?: number }
interface ShotSummary { id: string; name?: string; passes?: number; plate?: boolean }
interface Summary {
  scenario?: string;
  logline?: string;
  shots?: ShotSummary[];
  shot?: { id?: string; name?: string; about?: string; plate?: { width?: number; height?: number; seconds?: number } | null; passes?: Pass[]; looking?: string; bin?: number } | null;
  tool?: { id?: string; words?: string; scene?: string; strength?: number | null; size?: string; seconds?: number; aspect?: number | null; height?: number };
  tools?: { id: string; name: string; family?: string; about?: string; needs?: string[]; status?: string; takes?: string[] }[];
  run?: { label?: string; cost?: number | null; ready?: boolean; why?: string };
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

/** What Paprika is told each time: the scenario, the shot open and its chain, the tool picked, the key's price, the talk so far. */
export function spicePrompt(s: Summary, turns: Turn[]) {
  const lines: string[] = [];
  lines.push(`THE SCENARIO: ${cut(s.scenario, 60) || "untitled"}${s.logline ? ` (${cut(s.logline, 160)})` : ""}.`);
  const shots = things<ShotSummary>(s.shots, 24);
  lines.push(shots.length ? `THE SHOTS (id = name, passes): ${shots.map((x) => `${cut(x.id, 40)} = ${cut(x.name, 40)}, ${Number(x.passes) || 0} pass${Number(x.passes) === 1 ? "" : "es"}${x.plate === false ? ", no plate yet" : ""}`).join("; ")}.` : "THE SHOTS: none yet. The user adds one (a first frame rolled by LTX-2.5, or a clip brought in); until then nothing can be run.");
  const sh = s.shot;
  if (sh && typeof sh === "object") {
    const p = sh.plate;
    lines.push(`THE SHOT OPEN: ${cut(sh.id, 40)} = ${cut(sh.name, 40)}${sh.about ? ` (${cut(sh.about, 120)})` : ""}. ${p && typeof p === "object" ? `Its plate is ${Number(p.width) || "?"} × ${Number(p.height) || "?"}, ${Number(p.seconds) || "?"} s.` : "It has no plate yet."}`);
    const passes = things<Pass>(sh.passes, 40);
    lines.push(passes.length ? `ITS PASSES, in order (id = tool, words): ${passes.map((x) => `${cut(x.id, 40)} = ${cut(x.name || x.tool, 40)}${x.words ? `, "${cut(x.words, 60)}"` : ""}`).join("; ")}. LOOKING AT: ${cut(sh.looking, 40) || "the last"}.` : "ITS PASSES: none yet (the plate as it is).");
    if (Number(sh.bin) > 0) lines.push(`${Number(sh.bin)} take${Number(sh.bin) === 1 ? " waits" : "s wait"} in the bin.`);
  }
  const tools = things<NonNullable<Summary["tools"]>[number]>(s.tools, 60);
  if (tools.length) lines.push(`THE TOOLS (id = name, family, what it does${tools.some((t) => t.needs?.length) ? "; one that needs more than a clip cannot run yet" : ""}): ${tools.map((t) => `${cut(t.id, 40)} = ${cut(t.name, 40)}, ${cut(t.family, 16)}, ${cut(t.about, 90)}${t.takes?.includes("words") ? "" : " [no words]"}${t.needs?.length ? ` [needs ${t.needs.map((x) => cut(x, 24)).join(", ")}]` : ""}`).join(" | ")}.`);
  const t = s.tool;
  if (t && typeof t === "object") lines.push(`THE TOOL PICKED: ${cut(t.id, 40) || "none"}, words "${cut(t.words, 160)}"${t.scene ? `, scene "${cut(t.scene, 120)}"` : ""}, strength ${typeof t.strength === "number" ? t.strength : "the card's"}, ${cut(t.size, 8) || "draft"}, ${Number(t.seconds) || "all"} s${typeof t.aspect === "number" ? `, aspect ${t.aspect}` : ""}${t.height ? `, ${t.height}p` : ""}.`);
  const r = s.run;
  if (r && typeof r === "object") lines.push(`THE KEY: "${cut(r.label, 40)}". ${r.ready ? "It has what it needs." : `It is missing something: ${cut(r.why, 100)}.`} ${typeof r.cost === "number" ? `Running it costs about ${Math.round(r.cost)} credits.` : "Its price is told when it runs."}`);
  if (Array.isArray(s.busy) && s.busy.length) lines.push(`WORKING NOW: ${s.busy.map((x) => cut(x, 40)).join(", ")}.`);
  if (typeof s.today === "number") lines.push(`CREDITS SPENT TODAY: ${Math.round(s.today)}.`);
  lines.push("", "THE CONVERSATION");
  for (const turn of turns.slice(-8)) lines.push(`${turn.role === "user" ? "User" : "Paprika"}: ${cut(turn.text, 600)}${turn.did?.length ? ` [the app did: ${turn.did.join(", ")}]` : ""}`);
  return lines.join("\n");
}

/**
 * Paprika's answer, read whole and checked against what the page told her: only her own actions, each with only what it takes, every
 * id one the page listed, every number within its range, and run once, last. Anything else is dropped.
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
  const shotIds = things<ShotSummary>(s.shots, 24).map((x) => String(x.id));
  const passIds = ["plate", ...things<Pass>(s.shot?.passes, 40).map((x) => String(x.id))];
  const tools = things<NonNullable<Summary["tools"]>[number]>(s.tools, 60);
  const toolIds = tools.map((x) => String(x.id));
  const actions: any[] = [];
  let run = false;
  for (const a of list<any>(raw.actions, 40)) {
    if (actions.length >= 8) break;
    switch (a?.op) {
      case "open": {
        const shot = oneOf(a.shot, shotIds);
        if (shot) actions.push({ op: "open", shot });
        break;
      }
      case "look": {
        const pass = oneOf(a.pass, passIds);
        if (pass) actions.push({ op: "look", pass });
        break;
      }
      case "tool": {
        const tool = oneOf(a.tool, toolIds);
        if (!tool) break;
        const def = tools.find((x) => x.id === tool)!;
        const out: any = { op: "tool", tool };
        if (cut(a.words, 600) && (def.takes?.includes("words") ?? true)) out.words = cut(a.words, 600);
        if (cut(a.scene, 400)) out.scene = cut(a.scene, 400);
        if (num(a.strength, 0, 2) !== undefined) out.strength = r2(num(a.strength, 0, 2)!);
        const size = oneOf(a.size, SIZES);
        if (size) out.size = size;
        if (num(a.seconds, 1, 10) !== undefined) out.seconds = Math.round(num(a.seconds, 1, 10)!);
        if (def.takes?.includes("aspect") && num(a.aspect, 0.25, 4) !== undefined) out.aspect = r2(num(a.aspect, 0.25, 4)!);
        if (def.takes?.includes("height")) {
          const h = HEIGHTS.find((v) => v === Math.round(Number(a.height)));
          if (h) out.height = h;
        }
        actions.push(out);
        break;
      }
      case "shot": {
        const out: any = { op: "shot" };
        if (cut(a.words, 1200)) out.words = cut(a.words, 1200);
        if (num(a.seconds, 2, 10) !== undefined) out.seconds = Math.round(num(a.seconds, 2, 10)!);
        if (out.words || out.seconds) actions.push(out);
        break;
      }
      case "run":
        run = true;
        break;
    }
  }
  // running is asked for once, last, and only with a tool to run (one picked now, or one set up in this answer) on a shot that has a plate
  const picked = actions.find((a) => a.op === "tool")?.tool ?? s.tool?.id;
  const needs = tools.find((x) => x.id === picked)?.needs?.length;
  if (run && picked && !needs && s.shot?.plate) actions.push({ op: "run" });
  return { reply: cut(raw.reply, 500), actions };
}
