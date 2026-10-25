// Spice's assistant: Paprika, the baby chameleon who is the AI editor of the bay (docs/SPICE-V2.md). This module writes her brief, the tool she
// answers through, what she is told each time (the shot open: its brief and clip, what each of the seven stages has made, the stage open with
// the engines it offers, what is set up, what stands in the way, what a run would cost, the talk so far) and reads her answer, keeping only what
// she can do: open a stage, pick its engine, put words to it, point it at another input, write the PLAN of the edit (which engine in which stage,
// in order), conform the clip, and ask for the run. She sets things up; the user presses the keys. Setting up costs nothing, so the page does it
// at once; a run costs credits (or time), so her answer only asks for it: the page asks the user, with the price, before anything runs.
import { STAGE_IDS, ENGINES } from "../web/js/spice2-model.js";

export const BAY_OPS = ["open", "engine", "words", "source", "plan", "conform", "run"] as const;
const NAMES = new Set(ENGINES.map((e) => e.name));

/** How Paprika answers: the tool she is made to call, so her answer is data and never prose to be guessed at. */
export const BAY_TOOL = {
  name: "bay_answer",
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
            op: { type: "string", enum: [...BAY_OPS] },
            stage: { type: "string", enum: [...STAGE_IDS], description: "For open, engine, words and source: the stage." },
            engine: { type: "string", description: "For engine: the template name of one of the engines listed for the stage." },
            text: { type: "string", description: "For words: what the engine is told, in plain words. Say what must change and what must stay." },
            from: { type: "string", description: "For source: clip (the footage) or the id of an earlier stage whose pass it takes." },
            steps: {
              type: "array",
              description: "For plan: the edit, in the order to run it, at most 8 steps.",
              items: {
                type: "object",
                properties: {
                  stage: { type: "string", enum: [...STAGE_IDS] },
                  engine: { type: "string", description: "The template name of the engine (omit for conform)." },
                  text: { type: "string", description: "The words it will be given." },
                  why: { type: "string", description: "One short line: why this engine." },
                },
                required: ["stage"],
              },
            },
          },
          required: ["op"],
        },
      },
    },
    required: ["reply", "actions"],
  },
};

export const BAY_BRIEF = `You are Paprika, the baby chameleon who is the AI editor of Comfyture's Spice. Spice is an edit bay: a clip is edited by AI models on Comfy Cloud, the way a finishing editor works, in seven stages, in this order:
- conform: trim to the length the editors take (10 s for most) and set 24 fps and an even size. Free, on this machine.
- select: a matte of a subject, tracked (SAM3), or a green screen / cut-out (Bria).
- clean: take something out. VOID (an object with its shadow, 10 s max), Obscura Remova (describe it, no mask), LTX subtitles, LTX watermark.
- direct: change the clip by words. Gemini Omni 1.1 Flash (keeps what you do not name, 10 s max), Seedance 2.5 (replace one thing), Runway Aleph 2 (keeps motion and timing exactly), Luma Ray 3.2 (look and mood), Kling O3 (a reference picture for the new thing), Wan 2.7 (replace a person or place from pictures). Relight: Beeble SwitchX (needs a reference picture of the place), Bernini-R (faces and products). Recast a person: Higgsfield Genjutsu (needs a picture of the new character), Wan Animate 2, SCAIL-2.
- control: LTX IC-LoRAs redraw the clip under a guide. Union control keeps the motion and framing (depth, pose or edges of the source) and redraws the look; Ingredients holds a character's look from a reference sheet; outpaint widens the frame; the LTX 2.5 first-and-last-frame redoes a middle between two held pictures. FastH3 OmniRef (open, 8 steps) and MiniMax H3 reference redo a clip from reference pictures.
- extend: Gemini Omni 1.1 Flash extend continues a clip by up to 10 s a step; LTX 2.5 first-and-last-frame, the LTX style transition and MiniMax H3 multiframe bridge two takes.
- finish: FILM interpolation (smoother or slow motion), Mirelo SFX 2.0 (sound effects timed to the picture), VEED Clean Audio (clean speech); then export.
Each run is a take of its stage; the user marks one as the stage's pass; the next stage works from it. Every paid run asks the user for its price first.

You set things up; the user presses the keys. You cannot click, import a file, or add a reference picture.

Actions:
- open {stage}
- engine {stage, engine}: pick the engine of a stage, by its template name as listed. Choose by the job, the clip's length against the engine's limit, and whether the engine needs a picture the user has not given.
- words {stage, text}: what the engine is told. Say what must change and what must stay, in plain words, one or two sentences.
- source {stage, from}: the input of a stage: clip, or the id of an earlier stage.
- plan {steps}: the whole edit as an ordered list of at most 8 steps {stage, engine, text, why}. Use it when the user describes a job with several parts, or asks what to do; leave out stages that are not needed.
- conform {}: run Conform now (free).
- run {}: run the key of the stage open. It may cost credits: the app asks the user to confirm under your answer, so say it is ready, never that it has started.

Rules: only the stages and engines shown below. Set up what fits the job (open the stage, pick the engine, put the words; run when they say do it). A clip longer than the engine takes: say so and send them to conform, or pick an engine that takes it. An engine that needs a picture the user has not given: say which picture, no run. A question: an answer, no action. Never promise what you did not do. Someone new ("how do I start?"): two short sentences, bring a clip, then ask you for a plan. Short sentences, a chameleon's calm; no markdown.`;

interface StageInfo { id: string; takes?: number; pass?: string; spent?: number }
interface EngineInfo { name: string; title?: string; mode?: string; max?: number; partner?: boolean; about?: string; needs?: Record<string, unknown> }
interface Summary {
  stage?: string;
  shot?: string;
  shots?: number;
  brief?: string;
  clip?: { seconds?: number; width?: number; height?: number; fps?: number } | null;
  stages?: StageInfo[];
  engines?: EngineInfo[];
  chosen?: string;
  words?: string;
  refs?: number;
  problems?: string[];
  price?: number | null;
  today?: number;
  busy?: string[];
  plan?: { stage: string; engine?: string }[];
}
export interface Turn { role: string; text: string; did?: string[] }

const cut = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const list = <T>(v: unknown, n: number): T[] => (Array.isArray(v) ? (v.slice(0, n) as T[]) : []);
const oneOf = <T extends string>(v: unknown, values: readonly T[]): T | undefined => (typeof v === "string" && (values as readonly string[]).includes(v) ? (v as T) : undefined);

/** What Paprika is told each time: the shot, its clip, what each stage has made, the stage open and its engines, what stands in the way, the talk so far. */
export function bayPrompt(s: Summary, turns: Turn[]) {
  const lines: string[] = [];
  lines.push(`THE SHOT: ${cut(s.shot, 60) || "untitled"}${typeof s.shots === "number" ? ` (${s.shots} shot${s.shots === 1 ? "" : "s"} in all)` : ""}. STAGE OPEN: ${cut(s.stage, 10) || "none"}. THE STAGES, in order: ${STAGE_IDS.join(", ")}.`);
  if (cut(s.brief, 800)) lines.push(`WHAT THE SHOT IS FOR (the user's words): ${cut(s.brief, 800)}`);
  const c = s.clip;
  lines.push(c ? `THE CLIP: ${Math.round((Number(c.seconds) || 0) * 10) / 10} s, ${c.width ?? "?"}x${c.height ?? "?"}, ${c.fps ?? "?"} fps.` : "THE CLIP: none yet; nothing can run until one is brought.");
  const made = list<StageInfo>(s.stages, 7).filter((x) => x && typeof x === "object" && (x.takes ?? 0) > 0);
  lines.push(made.length ? `MADE SO FAR: ${made.map((x) => `${cut(x.id, 10)} (${x.takes} take${x.takes === 1 ? "" : "s"}${x.pass ? `, pass by ${cut(x.pass, 60)}` : ""}${x.spent ? `, ${x.spent} cr` : ""})`).join("; ")}.` : "MADE SO FAR: nothing.");
  const engines = list<EngineInfo>(s.engines, 24).filter((e) => e && typeof e.name === "string");
  if (engines.length) {
    lines.push(`ENGINES OF THE STAGE OPEN (use these template names):`);
    for (const e of engines) lines.push(`- ${cut(e.name, 90)} = ${cut(e.title, 50)}${e.mode ? ` [${cut(e.mode, 16)}]` : ""}${e.max ? `, ${e.max} s at most` : ""}, ${e.partner ? "partner (paid)" : "open model"}${e.needs?.image === true ? ", needs a picture" : ""}: ${cut(e.about, 110)}`);
  }
  if (s.chosen) lines.push(`ENGINE PICKED: ${cut(s.chosen, 90)}. WORDS TYPED: ${cut(s.words, 300) || "none"}. PICTURES GIVEN: ${Number(s.refs) || 0}.`);
  const problems = list<string>(s.problems, 6).map((p) => cut(p, 160)).filter(Boolean);
  if (problems.length) lines.push(`STANDING IN THE WAY: ${problems.join(" | ")}`);
  if (s.price !== undefined) lines.push(`A RUN NOW WOULD COST: ${s.price === null ? "a partner price not known yet" : s.price === 0 ? "nothing" : `about ${s.price} credits`}. CREDITS SPENT TODAY: ${Number(s.today) || 0}.`);
  if (s.busy?.length) lines.push(`WORKING NOW: ${list<string>(s.busy, 7).map((x) => cut(x, 10)).join(", ")}.`);
  const plan = list<{ stage: string; engine?: string }>(s.plan, 8);
  if (plan.length) lines.push(`THE PLAN SO FAR: ${plan.map((p, i) => `${i + 1}. ${cut(p.stage, 10)}${p.engine ? ` (${cut(p.engine, 60)})` : ""}`).join("; ")}.`);
  lines.push("", "THE TALK:");
  for (const t of turns.slice(-8)) lines.push(`${t.role === "user" ? "USER" : "PAPRIKA"}: ${cut(t.text, 600)}${t.did?.length ? ` [done: ${t.did.join("; ")}]` : ""}`);
  lines.push("", "Answer through the tool.");
  return lines.join("\n");
}

/**
 * Paprika's answer, read whole and checked against what the page told her: only her own actions, each with only what it takes, every choice
 * one of its values (an engine must be one Spice lists for that stage, or a find the page told her of), the plan at most eight steps, and run
 * once, last. Anything else is dropped.
 */
export function readBayAnswer(reply: string, s: Summary = {}) {
  const from = reply.indexOf("{");
  const to = reply.lastIndexOf("}");
  let raw: any;
  try {
    raw = JSON.parse(reply.slice(from, to + 1));
  } catch {
    return { reply: reply.replace(/[{}"]/g, "").trim().slice(0, 400) || "I didn't catch that. Say it again?", actions: [] as any[] };
  }
  const told = new Set(list<EngineInfo>(s.engines, 24).map((e) => e?.name).filter((n): n is string => typeof n === "string"));
  /** An engine is valid for a stage when Spice lists it there, or the page told her of it as a find in the stage open. */
  const engineFor = (stage: string | undefined, name: unknown): string | undefined => {
    if (typeof name !== "string" || !stage) return undefined;
    if (NAMES.has(name)) return ENGINES.some((e) => e.name === name && e.stage === stage) ? name : undefined;
    return told.has(name) && s.stage === stage ? name : undefined;
  };
  const actions: any[] = [];
  let run = false;
  for (const a of list<any>(raw.actions, 40)) {
    if (actions.length >= 8) break;
    switch (a?.op) {
      case "open": {
        const stage = oneOf(a.stage, STAGE_IDS);
        if (stage) actions.push({ op: "open", stage });
        break;
      }
      case "engine": {
        const stage = oneOf(a.stage, STAGE_IDS);
        const engine = engineFor(stage, a.engine);
        if (stage && engine) actions.push({ op: "engine", stage, engine });
        break;
      }
      case "words": {
        const stage = oneOf(a.stage, STAGE_IDS);
        const text = cut(a.text, 800);
        if (stage && text) actions.push({ op: "words", stage, text });
        break;
      }
      case "source": {
        const stage = oneOf(a.stage, STAGE_IDS);
        const src = oneOf(a.from, ["clip", ...STAGE_IDS] as const);
        if (stage && src && src !== stage && (src === "clip" || STAGE_IDS.indexOf(src) < STAGE_IDS.indexOf(stage))) actions.push({ op: "source", stage, from: src });
        break;
      }
      case "plan": {
        const steps: any[] = [];
        for (const x of list<any>(a.steps, 12)) {
          const stage = oneOf(x?.stage, STAGE_IDS);
          if (!stage || steps.length >= 8) continue;
          const engine = engineFor(stage, x.engine);
          // (a stage that runs engines names one; conform needs none)
          if (stage !== "conform" && !engine) continue;
          steps.push({ stage, ...(engine ? { engine } : {}), ...(cut(x.text, 500) ? { text: cut(x.text, 500) } : {}), ...(cut(x.why, 140) ? { why: cut(x.why, 140) } : {}) });
        }
        if (steps.length) actions.push({ op: "plan", steps });
        break;
      }
      case "conform":
        actions.push({ op: "conform" });
        break;
      case "run":
        run = true;
        break;
    }
  }
  // running is asked for once, last, and only when there is a stage it could be the key of
  if (run && STAGE_IDS.includes(String(s.stage) as never)) actions.push({ op: "run" });
  return { reply: cut(raw.reply, 500), actions };
}
