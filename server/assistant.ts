// The Shot room's assistant: a chat that sets up the shot (Kitchen's pet, Ketkout, fronts it, like the
// other rooms' assistants). Gemma 4 answers inside ComfyUI with a reply and a list of actions; the
// browser applies them to the open tab. This module writes its prompt (the open tab's whole state, recent
// takes, the conversation) and reads its answer, checking every action against what the app can actually
// do. It knows the Shot and nothing of the other products: its manual (manual.ts) is the Shot's part only.

import { CAMERA, TRANSITIONS } from "../web/js/script.js";
import { LIMITS } from "./limits.ts";

export interface ChatFile { name: string; kind: "image" | "video" | "audio" | "text"; source?: "attached" | "take" | "film" | "image" | "preset"; width?: number; height?: number; seconds?: number; text?: string; mentioned?: boolean }
const FROM = { attached: "attached", take: "a take from the library", film: "a film from the library", image: "a library image", preset: "a preset, as JSON" };
export interface Turn { role: "user" | "assistant"; text: string; did?: string[] }
interface Line { speaker?: string; line?: string; language?: string }
interface ShotSpec { action?: string; camera?: string; cameraText?: string; framing?: string; sound?: string; dialogue?: Line[]; transition?: string }
export interface ShotState {
  section?: string;
  name?: string;
  preset?: string;
  made?: string;
  startMode?: string;
  start?: { width?: number; height?: number } | null;
  video?: { mode?: string; control?: string; seconds?: number } | null;
  end?: string;
  keyframes?: number[];
  references?: Record<string, string | null>;
  audio?: { name?: string; seconds?: number; lipsync?: boolean } | null;
  shots?: ShotSpec[];
  current?: number;
  seconds?: number;
  aspect?: string;
  quality?: string;
  takes?: number;
  enhance?: boolean;
  review?: boolean;
  prompt?: string;
  recent?: { name?: string; status?: string; seconds?: number; error?: string; here?: boolean }[];
  library?: { takes?: number; films?: number };
}
export type Action =
  | { do: "preset"; id: string }
  | { do: "shots"; shots: ShotSpec[] }
  | { do: "script"; action?: string; camera?: string; framing?: string; sound?: string; dialogue?: Line[] }
  | { do: "settings"; seconds?: number; aspect?: string; quality?: string; takes?: number; enhance?: boolean; review?: boolean }
  | { do: "name"; name: string }
  | { do: "start"; prompt: string; aspect: string }
  | { do: "edit_start"; instruction: string }
  | { do: "paint"; instruction: string }
  | { do: "reference"; slot: "cast" | "prop" | "location"; prompt?: string; words?: string }
  | { do: "video"; mode?: "extend" | "motion"; control?: "pose" | "edges" }
  | { do: "lipsync"; on: boolean }
  | { do: "clear"; what: "end" | "keyframes" | "references" | "sound" | "video" }
  | { do: "use"; name: string; as: "start" | "end" | "keyframe" | "cast" | "prop" | "location" | "video" | "sound"; time?: number; words?: string; mode?: "extend" | "motion"; control?: "pose" | "edges" }
  | { do: "next"; from?: string }
  | { do: "roll" };

const str = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const lower = (t: string) => t.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase());
const SLOTS = ["cast", "prop", "location"] as const;

function shotLines(shots: ShotSpec[] = [], current = 0) {
  return shots.map((s, i) => [
    `shot ${i + 1}${i === current ? " (open)" : ""}${i ? `, opens with ${s.transition || "hard-cut"}` : ""}:`,
    `  action: ${s.action || "-"}`,
    `  camera: ${s.cameraText ? `preset move "${s.cameraText}"` : s.camera || "locked"}; ends on: ${s.framing || "-"}`,
    `  sound: ${s.sound || "-"}`,
    `  dialogue: ${s.dialogue?.length ? s.dialogue.map((d) => `${d.speaker || "someone"} (${d.language || "English"}): "${d.line}"`).join(" | ") : "none"}`,
  ].join("\n"));
}

/** The prompt: the open tab as it stands, the latest takes, and the conversation so far. */
export function assistantPrompt(shot: ShotState, turns: Turn[], sees: string, files: ChatFile[] = []) {
  const seesPhoto = /start photo/.test(sees);
  const refs = SLOTS.map((k) => (shot.references?.[k] != null ? `${k === "location" ? "place" : k}: ${shot.references[k] || "(no words)"}` : null)).filter(Boolean);
  const lines = [
    `THE OPEN TAB (section: ${shot.section ?? "create"})`,
    `name: ${shot.name || "untitled"}; preset: ${shot.preset || "none"}; made as: ${shot.made || "unknown"}`,
    `start: ${shot.startMode === "video" && shot.video ? `a video, ${shot.video.seconds ?? "?"} s, mode ${shot.video.mode}${shot.video.mode === "motion" ? ` (${shot.video.control})` : ""}` : shot.start ? `a photo ${shot.start.width ?? "?"}×${shot.start.height ?? "?"}${seesPhoto ? " (attached, you can see it)" : ""}` : "none"}`,
    `end frame: ${shot.end || "none"}; keyframes: ${shot.keyframes?.length ? shot.keyframes.map((t) => `${t} s`).join(", ") : "none"}`,
    `references: ${refs.length ? refs.join("; ") : "none"}`,
    `sound track: ${shot.audio ? `${shot.audio.name}, ${shot.audio.seconds} s, lip sync ${shot.audio.lipsync ? "on" : "off"}` : "none (LTX-2.5 writes the sound)"}`,
    `settings: ${shot.seconds ?? 5} s, aspect ${shot.aspect ?? "auto"}, quality ${shot.quality ?? "standard"}, ${shot.takes ?? 1} take(s), prompt enhancer ${shot.enhance ? "on" : "off"}, check painted frame ${shot.review === false ? "off" : "on"}`,
    "script:",
    ...shotLines(shot.shots, shot.current),
    `the exact prompt now: ${shot.prompt || "(empty: the shot has no script yet)"}`,
    "",
    "LATEST TAKES (newest first):",
    ...(shot.recent?.length ? shot.recent.map((r) => `- ${r.name} · ${r.status}${r.seconds ? ` · ${r.seconds} s` : ""}${r.here ? " · in this tab" : ""}${r.error ? ` · error: ${r.error}` : ""}`) : ["none yet"]),
    `library: ${shot.library?.takes ?? 0} takes, ${shot.library?.films ?? 0} films`,
    "",
    "FILES THE USER ATTACHED (use them by name; the ones marked mentioned are named in the last message):",
    ...(files.length
      ? files.map((f) => `- @${f.name}: ${f.kind}, ${FROM[f.source ?? "attached"]}${f.width ? ` ${f.width}×${f.height}` : ""}${f.seconds ? ` ${f.seconds} s` : ""}${f.mentioned ? " (mentioned)" : ""}${f.text ? `\n  text: ${str(f.text, 3000)}` : ""}`)
      : ["none"]),
    `the picture attached to this message: ${sees || "none"}`,
    "",
    "CONVERSATION:",
    ...turns.slice(-8).map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${str(t.text, 800)}${t.did?.length ? ` [the app applied: ${t.did.join(", ")}]` : ""}`),
  ];
  return lines.join("\n");
}

function shotSpec(a: Record<string, any>): ShotSpec {
  const out: ShotSpec = {};
  if (a.action) out.action = str(a.action, 1200);
  if (typeof a.camera === "string" && a.camera in CAMERA) out.camera = a.camera;
  if (a.framing) out.framing = lower(str(a.framing, 120));
  if (a.sound) out.sound = str(a.sound, 600);
  if (typeof a.transition === "string" && a.transition in TRANSITIONS) out.transition = a.transition;
  if (Array.isArray(a.dialogue)) {
    out.dialogue = a.dialogue.slice(0, LIMITS.dialogue)
      .map((d: Record<string, unknown>) => ({ speaker: str(d?.speaker, 40), line: str(d?.line, 400), language: str(d?.language, 40) || "English" }))
      .filter((d: Line) => d.line);
  }
  return out;
}

const int = (v: unknown, min: number, max: number) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? undefined : Math.min(max, Math.max(min, Math.round(Number(v)))));

/** The answer, read leniently: the first JSON object in it, every action checked and clamped. */
export function readAnswer(text: string, presetIds: Set<string>, files: ChatFile[] = []): { reply: string; actions: Action[] } {
  const byName = new Map(files.map((f) => [f.name, f]));
  const FITS: Record<string, string[]> = { image: ["start", "end", "keyframe", "cast", "prop", "location"], video: ["video"], audio: ["sound"], text: [] };
  let raw: Record<string, any> = {};
  try {
    raw = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    // a plain sentence is still a reply
    return { reply: str(text.replace(/[{}"]/g, ""), 600) || "Sorry, I lost my words. Say it again?", actions: [] };
  }
  const actions: Action[] = [];
  for (const a of Array.isArray(raw.actions) ? raw.actions.slice(0, 12) : []) {
    switch (a?.do) {
      case "preset":
        if (presetIds.has(a.id)) actions.push({ do: "preset", id: a.id });
        break;
      case "shots": {
        const shots = (Array.isArray(a.shots) ? a.shots : []).slice(0, LIMITS.shots).map(shotSpec).filter((s: ShotSpec) => s.action);
        if (shots.length) actions.push({ do: "shots", shots });
        break;
      }
      case "script": {
        const spec = shotSpec(a);
        delete spec.transition;
        if (Object.keys(spec).length) actions.push({ do: "script", ...spec });
        break;
      }
      case "settings": {
        const out: Extract<Action, { do: "settings" }> = { do: "settings" };
        const seconds = int(a.seconds, LIMITS.seconds.min, LIMITS.seconds.max);
        const takes = int(a.takes, LIMITS.takes.min, LIMITS.takes.max);
        if (seconds) out.seconds = seconds;
        if (takes) out.takes = takes;
        if (["auto", "16:9", "9:16", "1:1"].includes(a.aspect)) out.aspect = a.aspect;
        if (["draft", "standard", "production"].includes(a.quality)) out.quality = a.quality;
        if (typeof a.enhance === "boolean") out.enhance = a.enhance;
        if (typeof a.review === "boolean") out.review = a.review;
        if (Object.keys(out).length > 1) actions.push(out);
        break;
      }
      case "name":
        if (str(a.name, 60)) actions.push({ do: "name", name: str(a.name, 60) });
        break;
      case "start":
        if (str(a.prompt, 1200)) actions.push({ do: "start", prompt: str(a.prompt, 1200), aspect: ["16:9", "9:16", "1:1", "3:2"].includes(a.aspect) ? a.aspect : "16:9" });
        break;
      case "edit_start":
        if (str(a.instruction, 600)) actions.push({ do: "edit_start", instruction: str(a.instruction, 600) });
        break;
      case "paint":
        if (str(a.instruction, 600)) actions.push({ do: "paint", instruction: str(a.instruction, 600) });
        break;
      case "reference": {
        const slot = a.slot === "place" ? "location" : a.slot;
        if (!SLOTS.includes(slot)) break;
        const out: Extract<Action, { do: "reference" }> = { do: "reference", slot };
        if (str(a.prompt, 1200)) out.prompt = str(a.prompt, 1200);
        if (str(a.words, 160)) out.words = str(a.words, 160);
        if (out.prompt || out.words) actions.push(out);
        break;
      }
      case "video": {
        const out: Extract<Action, { do: "video" }> = { do: "video" };
        if (a.mode === "extend" || a.mode === "motion") out.mode = a.mode;
        if (a.control === "pose" || a.control === "edges") out.control = a.control;
        if (out.mode || out.control) actions.push(out);
        break;
      }
      case "lipsync":
        if (typeof a.on === "boolean") actions.push({ do: "lipsync", on: a.on });
        break;
      case "clear":
        if (["end", "keyframes", "references", "sound", "video"].includes(a.what)) actions.push({ do: "clear", what: a.what });
        break;
      case "use": {
        const name = str(a.name, 40).replace(/^@/, "").toLowerCase();
        const as = a.as === "place" ? "location" : a.as;
        const f = byName.get(name);
        // a file only goes where its kind fits: an image can't be the sound track
        if (!f || !FITS[f.kind]?.includes(as)) break;
        const out: Extract<Action, { do: "use" }> = { do: "use", name, as };
        if (as === "keyframe" && Number.isFinite(Number(a.time))) out.time = Math.max(0.1, Number(a.time));
        if (str(a.words, 160)) out.words = str(a.words, 160);
        if (a.mode === "extend" || a.mode === "motion") out.mode = a.mode;
        if (a.control === "pose" || a.control === "edges") out.control = a.control;
        actions.push(out);
        break;
      }
      case "next": {
        const from = str(a.from, 40).replace(/^@/, "").toLowerCase();
        actions.push(byName.get(from)?.source === "take" ? { do: "next", from } : { do: "next" });
        break;
      }
      case "roll":
        actions.push({ do: "roll" });
        break;
    }
  }
  return { reply: str(raw.reply, 800) || (actions.length ? "Done." : "Tell me what the shot should be."), actions };
}

/** "roll it", "render the shot", "go ahead": a plain request to render. "make it three shots" is not. */
export function wantsRoll(text: string) {
  return /\b(?:roll|render|shoot)\b|\bgo ahead\b|\b(?:make|generate) (?:the |a )?(?:video|take|clip)\b|\b(?:make|do) it now\b/i.test(text);
}

/** When the user names transitions and the model left them out, give them to the cuts in the order named. */
export function fillTransitions(actions: Action[], text: string) {
  const named = [...text.matchAll(/\b(match[- ]?cut|dissolve|hard[- ]?cut|cross[- ]?fade)/gi)]
    .map((m) => (/match/i.test(m[1]) ? "match-cut" : /dissolve|fade/i.test(m[1]) ? "dissolve" : "hard-cut"));
  if (!named.length) return;
  for (const a of actions) {
    if (a.do !== "shots" || a.shots.slice(1).some((s) => s.transition && s.transition !== "hard-cut")) continue;
    a.shots.slice(1).forEach((s, i) => (s.transition = named[i] ?? "hard-cut"));
  }
}

/** "continue from this take", "the next shot", "pick up where it ends": start a new tab on the last frame first. */
export function wantsNext(text: string) {
  return /\bcontinue (?:from|after|on)\b|\b(?:the )?next shot\b|\bpick(?:s)? up (?:from|where)\b|\bwhere (?:it|this|the take) ends\b|\bfrom (?:the|its) last frame\b/i.test(text);
}

const SLOT_WORDS: [RegExp, Extract<Action, { do: "use" }>["as"]][] = [
  [/^(?:start(?: photo| frame| image)?|first frame|opening frame)$/, "start"],
  [/^(?:end(?: frame)?|last frame|final frame)$/, "end"],
  [/^key ?frame$/, "keyframe"],
  [/^(?:cast|actor|character|person)$/, "cast"],
  [/^(?:prop|product|object)$/, "prop"],
  [/^(?:place|location|set|background)$/, "location"],
  [/^(?:video|clip)$/, "video"],
  [/^(?:sound|track|music|voice|audio)$/, "sound"],
];

/** "@chef as the cast", "use @track for the sound": the user said where a file goes, so it goes there. */
export function fillUses(actions: Action[], text: string, files: ChatFile[]) {
  const kinds = new Map(files.map((f) => [f.name, f.kind]));
  const FITS: Record<string, string[]> = { image: ["start", "end", "keyframe", "cast", "prop", "location"], video: ["video"], audio: ["sound"], text: [] };
  for (const m of text.matchAll(/@([a-z0-9][a-z0-9-]*)\s+(?:as|for|in|into|is)\s+(?:the|my|a|an)?\s*([a-z]+(?: (?:photo|frame|image))?)/gi)) {
    const name = m[1].toLowerCase();
    const slot = SLOT_WORDS.find(([re]) => re.test(m[2].toLowerCase()))?.[1];
    if (!slot || !FITS[kinds.get(name) ?? "text"]?.includes(slot)) continue;
    if (actions.some((a) => a.do === "use" && a.name === name)) continue;
    actions.unshift({ do: "use", name, as: slot });
  }
}
