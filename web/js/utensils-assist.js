// Truffle, the raccoon who keeps Utensils' shelf. She is told the tools, the one open and what it holds, and the
// Library's newest pictures, clips and sounds, and answers with what to set up: a tool opened, its input taken
// from the Library, its words and settings, and "run it". Setting up costs nothing, so it is done at once.
// Running a tool costs credits: it waits in her answer for one yes from you, with its price, and nothing runs
// until you give it.
import { state, changed, toast, writer } from "./store.js";
import { api } from "./api.js";
import { TOOLS, toolById, utensils, inputOf, pickTool, setInput, runTool, ready, estimate } from "./utensils.js";

/** Truffle's conversation: Utensils' own, never mixed with another product's. */
export const chat = { messages: [], busy: null };

/** The room of the bar on Utensils: the shelf's group of the tool open (picture, video or sound). */
export const roomOfTool = () => toolById(utensils.tool).group.toLowerCase();

const NOUN = { image: "Picture", video: "Clip", audio: "Sound" };

/**
 * The newest of the Library she can give a tool, each under a short id she names it by: pictures, clips (takes, films
 * and what the tools made), sounds. The files are got when one is given: a clip is made ready on the server only then.
 */
async function library() {
  const sounds = await fetch("api/audio").then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const items = new Map();
  const add = (id, kind, name, value) => items.set(id, { kind, name, value });
  const images = state.photos.slice(0, 12).map((p, n) => {
    const name = p.name || p.file.slice(0, 8);
    add(`img${n + 1}`, "image", name, async () => ({ file: p.file, url: p.url, width: p.width, height: p.height }));
    return { id: `img${n + 1}`, name, size: `${p.width}×${p.height}` };
  });
  const video = async (source) => {
    const v = await api.videoFrom(source);
    return { file: v.file, url: v.url, width: v.width, height: v.height, duration: v.duration };
  };
  // clips, newest first: takes and films from the Library, and the videos the tools themselves made (a clip given a sound, a larger one)
  const made = utensils.results.filter((r) => r.kind === "video" && r.file).map((r) => ({ kind: "result", name: `${toolById(r.tool).name} result`, seconds: r.seconds, date: r.at, value: async () => ({ file: r.file, url: r.url, width: r.width, height: r.height, duration: r.seconds }) }));
  const takes = state.runs.filter((r) => r.status === "done" && r.video).map((r) => ({ kind: "take", name: r.request.name, seconds: r.length ?? r.request.seconds, date: r.createdAt, value: () => video({ run: r.id }) }));
  const films = state.films.map((f) => ({ kind: "film", name: f.name, seconds: f.seconds, date: f.createdAt, value: () => video({ film: f.id }) }));
  const count = {};
  const clips = [...made, ...takes, ...films].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, 10).map((c) => {
    const id = `${c.kind === "result" ? "res" : c.kind}${(count[c.kind] = (count[c.kind] ?? 0) + 1)}`;
    add(id, "video", c.name, c.value);
    return { id, name: c.name, seconds: Math.round(c.seconds ?? 0), kind: c.kind };
  });
  const heard = (Array.isArray(sounds) ? sounds : []).slice(0, 8).map((a, n) => {
    add(`snd${n + 1}`, "audio", a.name, async () => ({ file: a.file, url: a.url, seconds: a.seconds, name: a.name }));
    return { id: `snd${n + 1}`, name: a.name, seconds: Math.round(a.seconds) };
  });
  return { items, view: { images, clips, sounds: heard } };
}

/** The settings a tool has, as they stand. */
function optionsOf(t, i) {
  return {
    upscale: { scale: i.scale === 2 ? 2 : 4 },
    "upscale-video": { height: i.height ?? 1080 },
    extend: { seconds: i.seconds ?? 5 },
    music: { seconds: i.seconds ?? 30, bpm: i.bpm ?? 100 },
    sfx: { seconds: i.seconds ?? 6 },
    sound: { real: i.real === true },
  }[t.id] ?? {};
}
const labelOf = (v, kind) => (v ? (kind === "audio" ? v.name ?? "a voice track" : kind === "video" ? `a clip, ${Math.round(v.duration ?? 0)} s` : `${v.width}×${v.height}`) : null);
const costOf = (t, i) => {
  const credits = estimate(t, i);
  return typeof credits === "number" ? `≈ ${credits} cr` : "your GPU";
};
// what running would run: the tool, what it holds, its words and its settings
const signature = (t, i) => JSON.stringify([t.id, i.image?.file, i.video?.file, i.audio?.file, i.prompt, i.lyrics, optionsOf(t, i)]);
/** What a tool that is not ready still lacks, in a few words. */
const lacks = (t, i) => {
  const missing = t.takes.find((k) => !i[k]);
  return missing ? `${t.name} still needs ${{ image: "a picture", video: "a clip", audio: "a voice track" }[missing]}` : `${t.name} still needs words`;
};

/** What she is told: the tools, the one open and what it holds, and the Library's newest files. */
export function summary(lib) {
  const t = toolById(utensils.tool);
  const i = inputOf(t.id);
  return {
    tools: TOOLS.map(({ id, group, name, hint, takes, words }) => ({ id, group, name, hint, takes, words })),
    open: { tool: t.id, has: { image: labelOf(i.image, "image"), video: labelOf(i.video, "video"), audio: labelOf(i.audio, "audio") }, words: i.prompt ?? "", options: optionsOf(t, i), ready: ready(t, i), cost: estimate(t, i) },
    library: lib.view,
    busy: !!utensils.busy,
  };
}

async function post(body) {
  const res = await fetch("api/utensils/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `Request failed (${res.status})`);
  return out;
}

/** One action, made. Answers what to tell the user: what was done, and what could not be. */
async function run(a, lib) {
  const did = [];
  const failed = [];
  if (a.op === "pick_tool") {
    const t = TOOLS.find((x) => x.id === a.tool);
    if (!t) failed.push("No such tool");
    else (pickTool(t.id), did.push(`Opened ${t.name}`));
  } else if (a.op === "set_input") {
    const t = toolById(utensils.tool);
    for (const kind of ["image", "video", "audio"]) {
      if (!a[kind]) continue;
      const item = lib.items.get(a[kind]);
      if (!t.takes.includes(kind) || item?.kind !== kind) {
        failed.push(`${t.name} can't take that ${NOUN[kind].toLowerCase()}`);
        continue;
      }
      setInput({ [kind]: await item.value() });
      did.push(`${NOUN[kind]}: ${item.name}`);
    }
    // words and settings, kept as the tool's own screen keeps them
    const patch = {};
    if (typeof a.words === "string") patch.prompt = a.words;
    for (const k of ["lyrics", "scale", "height", "seconds", "bpm", "real"]) if (a[k] !== undefined) patch[k] = a[k];
    if (Object.keys(patch).length) {
      setInput(patch);
      did.push(typeof a.words === "string" ? `Words: ${a.words.length > 40 ? `${a.words.slice(0, 39)}…` : a.words}` : Object.keys(patch).join(", "));
    }
  }
  return { did, failed };
}

/** The bar's words, on Utensils: Truffle reads the shelf and sets the tool up. */
export async function askUtensils(text) {
  const words = text.trim();
  if (!words || chat.busy) return;
  chat.messages.push({ role: "user", text: words });
  chat.busy = "Thinking";
  changed("assistant");
  try {
    const lib = await library();
    const out = await post({ model: writer("assistant"), messages: chat.messages.filter((m) => !m.error).slice(-8).map(({ role, text, did }) => ({ role, text, did })), utensils: summary(lib) });
    const did = [];
    const failed = [];
    let go = false;
    for (const a of out.actions ?? []) {
      if (a.op === "run_tool") go = true;
      else {
        chat.busy = "Setting it up";
        changed("assistant");
        const said = await run(a, lib);
        did.push(...said.did);
        failed.push(...said.failed);
      }
    }
    const message = { role: "assistant", text: out.reply || (go ? "Ready when you are." : did.length ? "Done." : "Nothing to change."), did, failed };
    // running costs credits: it is only offered, with its price; the key under the answer is the user's yes
    if (go) {
      const t = toolById(utensils.tool);
      const i = inputOf(t.id);
      if (utensils.busy) failed.push("A tool is already running");
      else if (!ready(t, i)) failed.push(lacks(t, i));
      else {
        for (const m of chat.messages) if (m.confirm?.state === "asking") m.confirm.state = "stale";
        message.confirm = { state: "asking", label: t.verb, cost: costOf(t, i), sig: signature(t, i), running: "Working", done: "Done: it is in the results", failed: "It didn't finish" };
      }
    }
    chat.messages.push(message);
  } catch (e) {
    chat.messages.push({ role: "assistant", text: e.message, error: true });
  } finally {
    chat.busy = null;
    changed("assistant");
  }
}

/** The user's yes to running the tool: it runs now, if it is still the tool and the input that were offered. */
export async function confirmUtensils(message) {
  const c = message.confirm;
  if (c?.state !== "asking") return;
  const t = toolById(utensils.tool);
  const i = inputOf(t.id);
  if (utensils.busy || !ready(t, i) || signature(t, i) !== c.sig) {
    c.state = "stale";
    toast("The tool or what it holds changed since. Ask me again.");
    return changed("assistant");
  }
  c.state = "running";
  changed("assistant");
  const before = utensils.results[0]?.id;
  try {
    await runTool();
    c.state = utensils.results[0]?.id !== before ? "done" : "failed";
  } catch (e) {
    c.state = "failed";
    toast(e.message, { tone: "crit" });
  }
  changed("assistant");
}
export function declineUtensils(message) {
  if (message.confirm?.state !== "asking") return;
  message.confirm.state = "declined";
  changed("assistant");
}

export function clearUtensilsChat() {
  chat.messages = [];
  changed("assistant");
}
