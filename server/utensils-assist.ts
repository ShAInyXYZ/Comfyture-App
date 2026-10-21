// Utensils' assistant: Truffle, the raccoon who keeps the shelf of one-job tools. This module writes her brief, the tool she
// answers through, what she is told each time (the workspace open and its tools in full, the other workspaces' tools by id, the
// tool open and what it holds, the queue, the newest results, the library's newest files), and reads her answer, keeping only
// the four things she can do on the shelf. She knows Utensils and nothing else. Running a tool costs credits, so her answer only
// asks for it: the page asks the user, with the price, before anything runs.
//
// EXTENDING IT: a workspace adds a tool with registerTool() on the page (web/js/utensils.js), declaring its `takes`, its `words`
// and its `options` (settings: a choice of values, a range, a flag or a text). The page puts them in the summary below and this
// reader keeps exactly what a tool declares: no new op is needed. A tool with run() can be run from her key.

export const UTENSILS_OPS = ["pick_workspace", "pick_tool", "set_input", "run_tool"] as const;
export const UTENSILS_WORKSPACES = ["shelf", "picture", "video", "audio", "vfx", "edit", "templates"] as const;

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
          },
          required: ["op"],
        },
      },
    },
    required: ["reply", "actions"],
  },
};

export const UTENSILS_BRIEF = `You are Truffle, the round grey raccoon with a dark eye mask who keeps Comfyture's Utensils: a shelf of small tools, each one job, in seven workspaces: shelf (the home: every tool at a glance), picture, video, audio, vfx (effects that change a clip), edit (free tools that run on this machine) and templates (the official ComfyUI workflows, run on Comfy Cloud). You are practical and a little sly; you speak in one or two short sentences, in the user's language. You answer through the utensils_answer tool: a reply and the actions to take.

A tool takes what it works on (a picture, a clip or a sound), sometimes words, sometimes settings, and makes a result kept in Recent. Several jobs can run at once; the queue below says what runs. The user's own files come from the library below: you give a tool one by its id and never invent a file.

Actions (op and its fields):
- pick_workspace {workspace}: open a workspace.
- pick_tool {tool}: open a tool by its id; its workspace opens with it. The open workspace's tools are listed in full, the others by id.
- set_input {image, video, audio, words, options, lyrics, scale, height, seconds, bpm, real}: give the tool that is open what it works on (an id from the library, and only the kinds that tool takes), its words and its settings. Send only what changes. Words say what to vary, change, make or hear. Settings are the ones listed with the tool, each within its values: send them in options by name (scale, height, seconds, bpm, lyrics and real may be sent as they are).
- run_tool {}: run the tool that is open on what it holds. It costs credits or takes a minute or more. The app asks the user to confirm the price first, with a key under your answer, so say it is ready to run, never that it has started; if they say yes in words, point them to that key.

Rules: use only the ids shown below. "My latest picture" or "my last clip" is the first one listed. Open the tool that fits the job, give it what it needs, and ask for run_tool only when the user says to run, make or do it, or names the job outright ("upscale my latest picture"). When something is missing (a picture, a clip, the words), ask for it in one short question and ask for no run_tool. When the job belongs to another workspace, open its tool: you may set it up in the same answer. When the user only asks a question, answer it and take no action. Never promise what you did not do.`;

/** A setting a tool declares: a choice of values, a number in a range, a flag or a text. */
interface Option { key: string; type?: string; values?: unknown[]; min?: number; max?: number }
interface Tool { id: string; group?: string; workspace?: string; name: string; hint?: string; takes?: string[]; words?: string; options?: Option[] }
interface Summary {
  workspace?: string;
  workspaces?: { id: string; name?: string; tools?: number }[];
  tools?: Tool[];
  others?: Tool[];
  open?: { tool: string; has?: { image?: string | null; video?: string | null; audio?: string | null }; words?: string; options?: Record<string, unknown>; ready?: boolean; cost?: number | null } | null;
  queue?: { tool: string; label?: string; progress?: number; status?: string }[];
  results?: { tool: string; kind?: string; note?: string; ago?: string }[];
  library?: { images?: { id: string; name: string; size?: string }[]; clips?: { id: string; name: string; seconds?: number; kind?: string }[]; sounds?: { id: string; name: string; seconds?: number }[] };
  busy?: boolean;
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

/** What Truffle is told each time: the workspace open, its tools, the other workspaces' tools, the tool open and what it holds, the queue, the newest results, the library, the talk so far. */
export function utensilsPrompt(s: Summary, turns: Turn[]) {
  const lines: string[] = [];
  const spaces = things<{ id: string; name?: string; tools?: number }>(s.workspaces, 8);
  if (s.workspace) lines.push(`WORKSPACE OPEN: ${cut(s.workspace, 12)}.${spaces.length ? ` THE WORKSPACES: ${spaces.map((w) => `${cut(w.id, 12)} (${Number(w.tools) || 0})`).join(", ")}.` : ""}`, "");
  lines.push(`THE TOOLS${s.workspace ? ` OF ${cut(s.workspace, 12).toUpperCase()}` : ""} (id · workspace · what it does · what it takes · words · settings):`);
  for (const t of things<Tool>(s.tools, 24)) lines.push(`- ${cut(t.id, 30)} · ${cut(t.workspace ?? t.group, 12)} · ${cut(t.hint, 90)} · ${t.takes?.length ? t.takes.map((k) => NOUN[k] ?? k).join(" and ") : "words only"} · ${t.words ?? "none"}${optionsLine(t) ? ` · settings: ${optionsLine(t)}` : ""}`);
  const others = things<Tool>(s.others, 60);
  if (others.length) {
    lines.push("", "THE TOOLS OF THE OTHER WORKSPACES (id · workspace · name · what it takes · words), to open when the job is theirs:");
    for (const t of others) lines.push(`- ${cut(t.id, 30)} · ${cut(t.workspace ?? t.group, 12)} · ${cut(t.name, 40)} · ${t.takes?.length ? t.takes.map((k) => NOUN[k] ?? k).join(" and ") : "words only"} · ${t.words ?? "none"}`);
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
 * Truffle's answer, read whole and checked against what the page told her: only her four actions, each with only what the
 * tool it is for takes (a file that is in the library, words if it has them, the settings it declares, within range), a workspace
 * that exists, and run_tool once, last. Anything else is dropped.
 */
export function readUtensilsAnswer(reply: string, s: Summary = {}) {
  const from = reply.indexOf("{");
  const to = reply.lastIndexOf("}");
  let raw: any;
  try {
    raw = JSON.parse(reply.slice(from, to + 1));
  } catch {
    return { reply: reply.replace(/[{}"]/g, "").trim().slice(0, 400) || "I didn't catch that. Say it again?", actions: [] as any[] };
  }
  // the tools she may open or set up: the open workspace's, and the others' by id
  const tools = new Map([...things<Tool>(s.others, 60), ...things<Tool>(s.tools, 24)].map((t) => [t.id, t]));
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
    }
  }
  if (run && tool) actions.push({ op: "run_tool" });
  return { reply: cut(raw.reply, 500), actions };
}
