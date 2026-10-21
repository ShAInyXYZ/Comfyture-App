// Utensils' assistant: Truffle, the raccoon who keeps the shelf of one-job tools. This module writes her brief, the tool she
// answers through, what she is told each time (the workspace open and its tools in full, the other workspaces' tools by id, the
// tool open and what it holds, the queue, the newest results, the library's newest files), and reads her answer, keeping only
// the four things she can do on the shelf. She knows Utensils and nothing else. Running a tool costs credits, so her answer only
// asks for it: the page asks the user, with the price, before anything runs.
//
// EXTENDING IT: a workspace adds a tool with registerTool() on the page (web/js/utensils.js), declaring its `takes`, its `words`
// and its `options` (settings: a choice of values, a range, a flag or a text). The page puts them in the summary below and this
// reader keeps exactly what a tool declares: no new op is needed. A tool with run() can be run from her key.
//
// GUIDES: each ask, the knowledge base (server/utensils-knowledge.ts) is searched with what the user asked and its best matches are
// put before her as CANDIDATES; for a job she answers with a guide (a recipe of 1-5 steps, tools and Library workflows, in order),
// which the page shows as a panel and lit books. Her guide may name only those candidates.
import { searchKnowledge, type Entry, knowledgeById } from "./utensils-knowledge.ts";
import { CURATED_APPS, OFFICIAL_APPS } from "./comfy-templates.ts";

export const UTENSILS_OPS = ["pick_workspace", "pick_tool", "set_input", "run_tool", "guide"] as const;
export const UTENSILS_WORKSPACES = ["home", "shelf", "picture", "video", "audio", "vfx", "edit", "templates"] as const;

/** How Truffle answers: the tool she is made to call, so her answer is data and never prose to be guessed at. */
export const UTENSILS_TOOL = {
  name: "utensils_answer",
  description: "Answer the user: one or two short sentences, and the actions to take on the shelf (none when they only ask a question).",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "One or two short sentences, in Truffle's voice: what you did, or the answer." },
      actions: {
        type: "array",
        description: "What to do, in order. Each has an op and its fields, as the brief lists them.",
        items: {
          type: "object",
          properties: {
            op: { type: "string", enum: [...UTENSILS_OPS] },
            workspace: { type: "string", enum: [...UTENSILS_WORKSPACES], description: "For pick_workspace: the workspace to open." },
            tool: { type: "string", description: "A tool's id, from the tools below." },
            image: { type: "string", description: "A picture's id, from the library below." },
            video: { type: "string", description: "A clip's id, from the library below." },
            audio: { type: "string", description: "A sound's id, from the library below." },
            words: { type: "string", description: "What to vary, change, make or hear, in plain words." },
            options: { type: "object", description: "The tool's own settings, by the names listed with it." },
            lyrics: { type: "string" },
            scale: { type: "number" },
            height: { type: "number" },
            seconds: { type: "number" },
            bpm: { type: "number" },
            real: { type: "boolean" },
            title: { type: "string", description: "For guide: the recipe's name, a few words (\"Product photo to ad video\")." },
            steps: {
              type: "array",
              description: "For guide: 1 to 5 steps in order, each a candidate's id, why it is there and how to use it.",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "A candidate's id, from CANDIDATES FOR THIS JOB." },
                  why: { type: "string", description: "What this step does for the job, a few words." },
                  how: { type: "string", description: "How to use it, one short line: what to give it, what to pick." },
                },
                required: ["id", "why", "how"],
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

export const UTENSILS_BRIEF = `You are Truffle, the round grey raccoon with a dark eye mask who keeps Comfyture's Utensils: a shelf of small tools, each one job, in eight workspaces: home (where it opens: a dashboard), shelf (every tool as a book), picture, video, audio, vfx, edit (free, on this machine) and templates (the Library: every official ComfyUI workflow, run on Comfy Cloud). You are practical, a little sly; you speak in one or two short sentences, in the user's language. You answer through the utensils_answer tool: a reply and the actions to take.

A tool takes what it works on (a picture, a clip or a sound), sometimes words or settings, and makes a result kept in Recent. Several jobs can run at once (the queue below). Files come from the library below: you give a tool one by its id and never invent a file.

Actions (op and its fields):
- pick_workspace {workspace}: open a workspace.
- pick_tool {tool}: open a tool by its id; its workspace opens with it.
- set_input {image, video, audio, words, options, lyrics, scale, height, seconds, bpm, real}: give the tool that is open what it works on (a library id, only the kinds it takes), its words and its settings; send only what changes. Settings are the tool's own, within their values, in options by name.
- run_tool {}: run the tool that is open on what it holds. It costs credits: the app asks the user to confirm the price with a key under your answer, so say it is ready, never that it has started; a yes in words gets pointed to that key.
- guide {title, steps}: a recipe, 1 to 5 steps in order, each {id, why, how}, ids from CANDIDATES FOR THIS JOB. A job of two tools or more ALWAYS gets a guide at once, files or not. It comes alone, never with run_tool. Each step takes what the person has or what an earlier step gives (a photo needs a step that makes a clip before a clip tool); pieces that belong together (a clip and its music or words) end with the step that joins them (ed-audio, au-mix, ed-captions).

Mini apps (ids app-..., listed below) are ComfyUI workflows on Comfy Cloud: open one with pick_tool when no built-in tool does the job or the user names it, then set_input and run_tool as for any tool.

On home nothing is open: name the workspace that fits what the person wants and open it, or open the tool outright when they name the job; never list the tools back.

Rules: use only the ids shown below. "My latest picture" or "my last clip" is the first one listed. Open the tool that fits the job, give it what it needs, and ask for run_tool only when the user says to run, make or do it, or names the job outright ("upscale my latest picture"). A how-to, a which-tool question or a job of several tools gets one short sentence and a guide. When a run lacks a file or words, ask for them in one short question and no run_tool. When the job belongs to another workspace, open its tool and set it up in the same answer. When the user only asks a question, answer and take no action. Never promise what you did not do.`;

/** A setting a tool declares: a choice of values, a number in a range, a flag or a text. */
interface Option { key: string; type?: string; values?: unknown[]; min?: number; max?: number }
interface Tool { id: string; group?: string; workspace?: string; name: string; hint?: string; takes?: string[]; words?: string; options?: Option[] }
interface Summary {
  workspace?: string;
  workspaces?: { id: string; name?: string; tools?: number }[];
  tools?: Tool[];
  others?: Tool[];
  /** the mini apps: workflows shown simply, opened by their app- ids */
  apps?: Tool[];
  open?: { tool: string; has?: { image?: string | null; video?: string | null; audio?: string | null }; words?: string; options?: Record<string, unknown>; ready?: boolean; cost?: number | null } | null;
  queue?: { tool: string; label?: string; progress?: number; status?: string }[];
  results?: { tool: string; kind?: string; note?: string; ago?: string }[];
  library?: { images?: { id: string; name: string; size?: string }[]; clips?: { id: string; name: string; seconds?: number; kind?: string }[]; sounds?: { id: string; name: string; seconds?: number }[] };
  busy?: boolean;
  /** the guide on show, if any: its title, its steps' ids, the step open */
  guide?: { title?: string; steps?: string[]; current?: number | null } | null;
}
export interface Turn { role: string; text: string; did?: string[] }

const cut = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const list = <T>(v: unknown, n: number): T[] => (Array.isArray(v) ? (v.slice(0, n) as T[]) : []);
// the page's lists of things (tools, library files) are read as objects, whatever was sent
const things = <T>(v: unknown, n: number): T[] => list<T>(v, n).filter((x) => x && typeof x === "object");
const NOUN: Record<string, string> = { image: "a picture", video: "a clip", audio: "a sound" };
const WORKSPACES = new Set<string>(UTENSILS_WORKSPACES);

/** A tool's settings, as a line: scale 2|4, seconds 2-10, real yes/no. */
const optionsLine = (t: Tool) => things<Option>(t.options, 8).map((o) => `${cut(o.key, 16)} ${o.type === "range" ? `${Number(o.min)}-${Number(o.max)}` : o.type === "flag" ? "yes/no" : o.type === "text" ? "text" : list<unknown>(o.values, 12).map((v) => cut(v, 12)).join("|")}`).join(", ");

/** What a step costs, in a few words: free, GPU or partner, with the credits when they are known. */
const costLine = (e: Entry) =>
  e.cost === "free" ? "free" : `${e.cost === "partner" ? "partner" : "GPU"}${typeof e.credits === "number" && e.credits > 0 ? ` ≈${Math.round(e.credits)} cr` : e.cost === "partner" ? ", priced at the run" : ""}`;

/**
 * The knowledge base's best matches for what the user asks now: their last words, with the ones before when the last are few
 * ("yes, and with music"). These are the only ids her guide may name.
 */
export function utensilsCandidates(turns: Turn[], k = 12): Entry[] {
  const asked = turns.filter((t) => t.role === "user").map((t) => cut(t.text, 600)).filter(Boolean);
  const last = asked[asked.length - 1] ?? "";
  const query = last.split(/\s+/).filter(Boolean).length < 5 && asked.length > 1 ? `${asked[asked.length - 2]} ${last}` : last;
  if (!query) return [];
  const found = searchKnowledge(query, { k }).map((h) => h.entry);
  // the tools that join pieces (a sound under a clip, sounds mixed, words on a clip) are always offered: a search for the job
  // ("a video ad with music") finds what makes the pieces, rarely what puts them together
  const have = new Set(found.map((e) => e.id));
  for (const id of JOINERS) {
    const e = knowledgeById(id);
    if (e && !have.has(id)) found.push(e);
  }
  return found;
}
const JOINERS = ["ed-audio", "au-mix", "ed-captions"];

/** What Truffle is told each time: the workspace open, its tools, the other workspaces' tools, the tool open and what it holds, the queue, the newest results, the library, the candidates for the job, the talk so far. */
export function utensilsPrompt(s: Summary, turns: Turn[], candidates: Entry[] = utensilsCandidates(turns)) {
  const lines: string[] = [];
  const spaces = things<{ id: string; name?: string; tools?: number }>(s.workspaces, 10);
  const here = cut(s.workspace, 12);
  if (s.workspace) lines.push(`WORKSPACE OPEN: ${here}.${spaces.length ? ` THE WORKSPACES: ${spaces.map((w) => `${cut(w.id, 12)}${typeof w.tools === "number" ? ` (${w.tools})` : ""}`).join(", ")}.` : ""}`, "");
  // home is a dashboard: no tool is described there, only where each kind of job lives (the tools are named by id below, to open when the job is named)
  if (here === "home") lines.push("HOME shows every workspace's tools as pictures. Nothing is open. Tools are described only inside their own workspace; the ids below open them.", "");
  else lines.push(`THE TOOLS${s.workspace ? ` OF ${cut(s.workspace, 12).toUpperCase()}` : ""} (id · workspace · what it does · what it takes · words · settings):`);
  for (const t of things<Tool>(s.tools, 24)) lines.push(`- ${cut(t.id, 30)} · ${cut(t.workspace ?? t.group, 12)} · ${cut(t.hint, 90)} · ${t.takes?.length ? t.takes.map((k) => NOUN[k] ?? k).join(" and ") : "words only"} · ${t.words ?? "none"}${optionsLine(t) ? ` · settings: ${optionsLine(t)}` : ""}`);
  const others = things<Tool>(s.others, 60);
  if (others.length) {
    lines.push("", "THE TOOLS OF THE OTHER WORKSPACES (id · workspace · name · what it takes · words), to open when the job is theirs:");
    for (const t of others) lines.push(`- ${cut(t.id, 30)} · ${cut(t.workspace ?? t.group, 12)} · ${cut(t.name, 40)} · ${t.takes?.length ? t.takes.map((k) => NOUN[k] ?? k).join(" and ") : "words only"} · ${t.words ?? "none"}`);
  }
  const apps = things<Tool>(s.apps, 60);
  if (apps.length) {
    lines.push("", "THE MINI APPS (ready-made workflows run on Comfy Cloud; id · name · what it takes · words), opened with pick_tool like any tool:");
    for (const t of apps) lines.push(`- ${cut(t.id, 30)} · ${cut(t.name, 40)} · ${t.takes?.length ? t.takes.map((k) => NOUN[k] ?? k).join(" and ") : "words only"} · ${t.words ?? "none"}`);
  }
  lines.push("");
  const o = s.open;
  if (o?.tool) {
    const has = o.has ?? {};
    lines.push(`THE TOOL OPEN: ${cut(o.tool, 30)}. It holds: picture ${cut(has.image, 60) || "none"}; clip ${cut(has.video, 60) || "none"}; sound ${cut(has.audio, 60) || "none"}. Words: ${cut(o.words, 200) || "none"}. Settings: ${Object.entries(o.options ?? {}).map(([k, v]) => `${cut(k, 16)} ${cut(v, 40)}`).join(", ") || "none"}.`);
    lines.push(`${o.ready ? "It has what it needs." : "It is missing something it needs."} ${typeof o.cost === "number" ? `Running it costs about ${Math.round(o.cost)} credits.` : "It runs on the user's own machine."}`);
  } else lines.push("NO TOOL IS OPEN.");
  const queue = things<{ tool: string; label?: string; progress?: number; status?: string }>(s.queue, 4);
  lines.push(queue.length ? `THE QUEUE: ${queue.map((j) => `${cut(j.tool, 24)} ${cut(j.status, 10)}${j.status === "running" ? ` ${Math.round((Number(j.progress) || 0) * 100)}%` : ""}`).join("; ")}.` : s.busy ? "A tool is running right now." : "THE QUEUE: nothing is running.");
  const made = things<{ tool: string; kind?: string; note?: string; ago?: string }>(s.results, 5);
  if (made.length) lines.push(`NEWEST RESULTS: ${made.map((r) => `${cut(r.tool, 24)} (${cut(r.kind, 8)}${r.note ? `, ${cut(r.note, 24)}` : ""}${r.ago ? `, ${cut(r.ago, 12)}` : ""})`).join("; ")}.`);
  const lib = s.library ?? {};
  lines.push("", "THE LIBRARY (newest first; id · name · size or length):");
  lines.push(`Pictures: ${things<{ id: string; name: string; size?: string }>(lib.images, 12).map((x) => `${cut(x.id, 12)} · ${cut(x.name, 40)} · ${cut(x.size, 14)}`).join("; ") || "none"}`);
  lines.push(`Clips: ${things<{ id: string; name: string; seconds?: number; kind?: string }>(lib.clips, 10).map((x) => `${cut(x.id, 12)} · ${cut(x.name, 40)} · ${Number(x.seconds) || "?"} s${x.kind ? ` · a ${cut(x.kind, 8)}` : ""}`).join("; ") || "none"}`);
  lines.push(`Sounds: ${things<{ id: string; name: string; seconds?: number }>(lib.sounds, 8).map((x) => `${cut(x.id, 12)} · ${cut(x.name, 40)} · ${Number(x.seconds) || "?"} s`).join("; ") || "none"}`);
  if (s.guide && typeof s.guide === "object") {
    const ids = list<unknown>(s.guide.steps, 5).map((x) => cut(x, 60));
    const at = typeof s.guide.current === "number" ? ` The person is on step ${s.guide.current + 1}.` : "";
    lines.push("", `THE GUIDE ON SHOW: ${cut(s.guide.title, 80) || "a recipe"}: ${ids.join(" → ") || "no steps"}.${at}`);
  }
  if (candidates.length) {
    lines.push("", "CANDIDATES FOR THIS JOB (from the knowledge base, best match first; id · name · section · takes->gives · cost · what it does · good after it). A guide names only these: the fewest steps that do the job, in order; free and cheap steps first; a built-in tool before a workflow that does the same; each why a few words, each how one short line (what to give it, what to pick); your sentence says the total cost (free, or about N credits; a partner step is priced when it runs). When the user names the job outright on a file and one tool does it, set that tool up instead:");
    for (const e of candidates) lines.push(`- ${e.id} · ${cut(e.name, 50)} · ${e.section} · ${e.takes.join("+")}->${e.gives.join("+")} · ${costLine(e)} · ${cut(e.what, 120)}${e.after?.length ? ` · after: ${e.after.slice(0, 4).join(", ")}` : ""}`);
    // (told last, where it is read: a small model otherwise asks for the files first and the person gets no recipe)
    lines.push("A job that takes two tools or more gets its guide NOW, before any file is given: the files are given in the steps. Ask a question only when the job itself is unclear.");
  }
  lines.push("", "THE CONVERSATION");
  for (const t of turns.slice(-8)) lines.push(`${t.role === "user" ? "User" : "Truffle"}: ${cut(t.text, 600)}${t.did?.length ? ` [the app did: ${t.did.join(", ")}]` : ""}`);
  return lines.join("\n");
}

// the settings the built-in tools have, and what they may be: what a summary that does not declare options is read by
const CHOICE: Record<string, Record<string, number[]>> = { upscale: { scale: [2, 4] }, "upscale-video": { height: [720, 1080, 1440] } };
const RANGE: Record<string, Record<string, [number, number]>> = { extend: { seconds: [2, 10] }, music: { seconds: [10, 240], bpm: [60, 180] }, sfx: { seconds: [1, 30] } };
const FLAG: Record<string, string[]> = { sound: ["real"] };
/** The older settings are sent as they are; the others go in options. */
const FLAT = new Set(["scale", "height", "seconds", "bpm", "real", "lyrics"]);

/** One setting, read against what the tool declares (or the built-in tables): its value kept to its values, or undefined. */
function readSetting(o: Option, raw: unknown): unknown {
  switch (o.type) {
    case "choice": {
      const values = list<unknown>(o.values, 24);
      const hit = values.find((v) => (typeof v === "number" ? v === Math.round(Number(raw)) : String(v) === String(raw)));
      return hit;
    }
    case "range": {
      const n = Number(raw);
      return raw !== undefined && raw !== null && raw !== "" && Number.isFinite(n) ? Math.min(Number(o.max), Math.max(Number(o.min), Math.round(n))) : undefined;
    }
    case "flag":
      return typeof raw === "boolean" ? raw : undefined;
    case "text":
      return typeof raw === "string" ? raw.trim().slice(0, 2000) : undefined;
  }
  return undefined;
}

/** The settings a tool has: what it declares, else what the built-in tables say of it. */
function optionsOf(t: Tool): Option[] {
  const declared = things<Option>(t.options, 12).filter((o) => typeof o.key === "string");
  if (declared.length) return declared;
  return [
    ...Object.entries(CHOICE[t.id] ?? {}).map(([key, values]) => ({ key, type: "choice", values })),
    ...Object.entries(RANGE[t.id] ?? {}).map(([key, [min, max]]) => ({ key, type: "range", min, max })),
    ...(FLAG[t.id] ?? []).map((key) => ({ key, type: "flag" })),
    ...(t.id === "music" ? [{ key: "lyrics", type: "text" }] : []),
  ];
}

/**
 * Truffle's answer, read whole and checked against what the page told her: only her actions, each with only what the
 * tool it is for takes (a file that is in the library, words if it has them, the settings it declares, within range), a workspace
 * that exists, and run_tool once, last; a guide of 1-5 steps whose ids are among the candidates she was given (a step that is not
 * is dropped, and the guide with it when none is left), alone with no run_tool. Anything else is dropped.
 */
export function readUtensilsAnswer(reply: string, s: Summary = {}, candidates?: Entry[]) {
  const from = reply.indexOf("{");
  const to = reply.lastIndexOf("}");
  let raw: any;
  try {
    raw = JSON.parse(reply.slice(from, to + 1));
  } catch {
    return { reply: reply.replace(/[{}"]/g, "").trim().slice(0, 400) || "I didn't catch that. Say it again?", actions: [] as any[] };
  }
  // the tools she may open or set up: the open workspace's, and the others' by id
  const tools = new Map([...things<Tool>(s.others, 60), ...things<Tool>(s.apps, 60), ...things<Tool>(s.tools, 24)].map((t) => [t.id, t]));
  const lib = s.library ?? {};
  const known = {
    image: new Set(things<{ id: string }>(lib.images, 12).map((x) => x.id)),
    video: new Set(things<{ id: string }>(lib.clips, 10).map((x) => x.id)),
    audio: new Set(things<{ id: string }>(lib.sounds, 8).map((x) => x.id)),
  };
  // the tool a setting is for: the one open, until an action opens another
  let tool: string | null = s.open?.tool && tools.has(s.open.tool) ? s.open.tool : null;
  const actions: any[] = [];
  let run = false;
  let guide: any = null;
  // the ids a guide may name: the candidates she was given
  const allowed = new Set((candidates ?? []).map((e) => e.id));
  // a step may also name anything the knowledge base knows (she sees the tools of the open workspace and the mini apps too):
  // a mini app's tool id (app-<id>) is its Library workflow
  const knownStep = (id: string): string | null => {
    if (allowed.has(id)) return id;
    const app = id.startsWith("app-") ? [...CURATED_APPS, ...OFFICIAL_APPS].find((x) => `app-${x.id}` === id) : null;
    const key = app ? `wf:${app.name}` : id;
    return knowledgeById(key) ? key : null;
  };
  for (const a of list<any>(raw.actions, 40)) {
    // a few actions at most: what is dropped does not count
    if (actions.length >= 8) break;
    switch (a?.op) {
      case "pick_workspace":
        if (typeof a.workspace === "string" && WORKSPACES.has(a.workspace)) actions.push({ op: "pick_workspace", workspace: a.workspace });
        break;
      case "pick_tool":
        if (typeof a.tool === "string" && tools.has(a.tool)) {
          actions.push({ op: "pick_tool", tool: a.tool });
          tool = a.tool;
        }
        break;
      case "set_input": {
        const t = tool ? tools.get(tool) : undefined;
        if (!t) break;
        const out: any = { op: "set_input" };
        for (const kind of ["image", "video", "audio"] as const) if (typeof a[kind] === "string" && t.takes?.includes(kind) && known[kind].has(a[kind])) out[kind] = a[kind];
        if (t.words && typeof a.words === "string" && cut(a.words, 600)) out.words = cut(a.words, 600);
        // settings: flat (the older way) or in options, each read against what the tool declares
        const given = a.options && typeof a.options === "object" ? a.options : {};
        const kept: Record<string, unknown> = {};
        for (const o of optionsOf(t)) {
          const value = readSetting(o, a[o.key] !== undefined ? a[o.key] : given[o.key]);
          if (value !== undefined) kept[o.key] = value;
        }
        for (const [k, v] of Object.entries(kept)) FLAT.has(k) ? (out[k] = v) : ((out.options ??= {})[k] = v);
        if (Object.keys(out).length > 1) actions.push(out);
        break;
      }
      case "run_tool":
        run = true;
        break;
      case "guide": {
        if (guide) break;
        const steps = things<any>(a.steps, 12)
          .map((x) => ({ x, id: typeof x.id === "string" ? knownStep(x.id) : null }))
          .filter((y) => y.id)
          .slice(0, 5)
          .map(({ x, id }) => ({ id: id as string, why: cut(x.why, 160), how: cut(x.how, 240) }));
        if (steps.length) actions.push((guide = { op: "guide", title: cut(a.title, 80) || "Your recipe", steps }));
        break;
      }
    }
  }
  if (run && tool && !guide) actions.push({ op: "run_tool" });
  // a guide only shows the way: it comes alone
  return { reply: cut(raw.reply, 500), actions: guide ? [guide] : actions };
}
