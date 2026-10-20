// Utensils' assistant: Truffle, the raccoon who keeps the shelf of one-job tools. This module writes her
// brief, the tool she answers through, what she is told each time (the tools, the one open and what it
// holds, the library's newest files), and reads her answer, keeping only the three things she can do on the
// shelf. She knows Utensils and nothing else. Running a tool costs credits, so her answer only asks for it:
// the page asks the user, with the price, before anything runs.

export const UTENSILS_OPS = ["pick_tool", "set_input", "run_tool"] as const;

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
            tool: { type: "string", description: "A tool's id, from the tools below." },
            image: { type: "string", description: "A picture's id, from the library below." },
            video: { type: "string", description: "A clip's id, from the library below." },
            audio: { type: "string", description: "A sound's id, from the library below." },
            words: { type: "string", description: "What to vary, change, make or hear, in plain words." },
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

export const UTENSILS_BRIEF = `You are Truffle, the round grey raccoon with a dark eye mask who keeps Comfyture's Utensils: a shelf of small tools, each one job. You are practical and a little sly; you speak in one or two short sentences, in the user's language. You answer through the utensils_answer tool: a reply and the actions to take.

A tool takes what it works on (a picture, a clip or a sound), sometimes words, sometimes a setting or two, and makes one result, kept in the list beside it. The user's own files come from the library below: you give a tool one by its id and never invent a file.

Actions (op and its fields):
- pick_tool {tool}: open a tool, by its id.
- set_input {image, video, audio, words, lyrics, scale, height, seconds, bpm, real}: give the tool that is open what it works on (image, video or audio: an id from the library, and only the kind that tool takes), its words and its settings. Send only what changes. Words say what to vary, change, make or hear: edit, sound, music and sfx need them; variations, extend and lipsync may have them. Settings: upscale scale 2 or 4; upscale-video height 720, 1080 or 1440; extend seconds 2 to 10; music seconds 10 to 240, bpm 60 to 180, lyrics (empty: an instrumental); sfx seconds 1 to 30; sound real true for real sounds only, never music.
- run_tool {}: run the tool that is open on what it holds. It costs credits and takes a minute or more. The app asks the user to confirm the price first, with a key under your answer, so say it is ready to run, never that it has started; if they say yes in words, point them to that key.

Rules: use only the ids shown below. "My latest picture" or "my last clip" is the first one listed. Open the tool that fits the job, give it what it needs, and ask for run_tool only when the user says to run, make or do it, or names the job outright ("upscale my latest picture"). When something is missing (a picture, a clip, the words), ask for it in one short question and ask for no run_tool. When the user only asks a question, answer it and take no action. Never promise what you did not do.`;

interface Tool { id: string; group?: string; name: string; hint?: string; takes?: string[]; words?: string }
interface Summary {
  tools?: Tool[];
  open?: { tool: string; has?: { image?: string | null; video?: string | null; audio?: string | null }; words?: string; options?: Record<string, unknown>; ready?: boolean; cost?: number | null } | null;
  library?: { images?: { id: string; name: string; size?: string }[]; clips?: { id: string; name: string; seconds?: number; kind?: string }[]; sounds?: { id: string; name: string; seconds?: number }[] };
  busy?: boolean;
}
export interface Turn { role: string; text: string; did?: string[] }

const cut = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const list = <T>(v: unknown, n: number): T[] => (Array.isArray(v) ? (v.slice(0, n) as T[]) : []);
// the page's lists of things (tools, library files) are read as objects, whatever was sent
const things = <T>(v: unknown, n: number): T[] => list<T>(v, n).filter((x) => x && typeof x === "object");
const NOUN: Record<string, string> = { image: "a picture", video: "a clip", audio: "a sound" };

/** What Truffle is told each time: the tools, the one open and what it holds, the library's newest files, the talk so far. */
export function utensilsPrompt(s: Summary, turns: Turn[]) {
  const lines: string[] = ["THE TOOLS (id · group · what it does · what it takes · words):"];
  for (const t of things<Tool>(s.tools, 20)) lines.push(`- ${cut(t.id, 30)} · ${cut(t.group, 12)} · ${cut(t.hint, 90)} · ${t.takes?.length ? t.takes.map((k) => NOUN[k] ?? k).join(" and ") : "words only"} · ${t.words ?? "none"}`);
  lines.push("");
  const o = s.open;
  if (o?.tool) {
    const has = o.has ?? {};
    lines.push(`THE TOOL OPEN: ${cut(o.tool, 30)}. It holds: picture ${cut(has.image, 60) || "none"}; clip ${cut(has.video, 60) || "none"}; sound ${cut(has.audio, 60) || "none"}. Words: ${cut(o.words, 200) || "none"}. Settings: ${Object.entries(o.options ?? {}).map(([k, v]) => `${cut(k, 12)} ${cut(v, 12)}`).join(", ") || "as they are"}.`);
    lines.push(`${o.ready ? "It has what it needs." : "It is missing something it needs."} ${typeof o.cost === "number" ? `Running it costs about ${Math.round(o.cost)} credits.` : "It runs on the user's own machine."}`);
  } else lines.push("NO TOOL IS OPEN.");
  lines.push(s.busy ? "A tool is running right now: run_tool has to wait until it is done." : "No tool is running now.");
  const lib = s.library ?? {};
  lines.push("", "THE LIBRARY (newest first; id · name · size or length):");
  lines.push(`Pictures: ${things<{ id: string; name: string; size?: string }>(lib.images, 12).map((x) => `${cut(x.id, 12)} · ${cut(x.name, 40)} · ${cut(x.size, 14)}`).join("; ") || "none"}`);
  lines.push(`Clips: ${things<{ id: string; name: string; seconds?: number; kind?: string }>(lib.clips, 10).map((x) => `${cut(x.id, 12)} · ${cut(x.name, 40)} · ${Number(x.seconds) || "?"} s${x.kind ? ` · a ${cut(x.kind, 8)}` : ""}`).join("; ") || "none"}`);
  lines.push(`Sounds: ${things<{ id: string; name: string; seconds?: number }>(lib.sounds, 8).map((x) => `${cut(x.id, 12)} · ${cut(x.name, 40)} · ${Number(x.seconds) || "?"} s`).join("; ") || "none"}`);
  lines.push("", "THE CONVERSATION");
  for (const t of turns.slice(-8)) lines.push(`${t.role === "user" ? "User" : "Truffle"}: ${cut(t.text, 600)}${t.did?.length ? ` [the app did: ${t.did.join(", ")}]` : ""}`);
  return lines.join("\n");
}

// the settings each tool has, and what they may be
const CHOICE: Record<string, Record<string, number[]>> = { upscale: { scale: [2, 4] }, "upscale-video": { height: [720, 1080, 1440] } };
const RANGE: Record<string, Record<string, [number, number]>> = { extend: { seconds: [2, 10] }, music: { seconds: [10, 240], bpm: [60, 180] }, sfx: { seconds: [1, 30] } };
const FLAG: Record<string, string[]> = { sound: ["real"] };

/**
 * Truffle's answer, read whole and checked against what the page told her: only her three actions, each
 * with only what the tool it is for takes (a file that is in the library, words if it has them, its own
 * settings, within range), and run_tool once, last. Anything else is dropped.
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
  const tools = new Map(things<Tool>(s.tools, 20).map((t) => [t.id, t]));
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
        if (t.id === "music" && typeof a.lyrics === "string") out.lyrics = a.lyrics.trim().slice(0, 2000);
        for (const [k, allowed] of Object.entries(CHOICE[t.id] ?? {})) if (allowed.includes(Math.round(Number(a[k])))) out[k] = Math.round(Number(a[k]));
        for (const [k, [lo, hi]] of Object.entries(RANGE[t.id] ?? {})) if (a[k] !== undefined && a[k] !== null && Number.isFinite(Number(a[k]))) out[k] = Math.min(hi, Math.max(lo, Math.round(Number(a[k]))));
        for (const k of FLAG[t.id] ?? []) if (typeof a[k] === "boolean") out[k] = a[k];
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
