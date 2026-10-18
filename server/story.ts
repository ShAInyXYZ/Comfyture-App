// A story, step by step: the idea, the script, the cast and the world, the storyboard. Each step
// is written by Gemma 4 in ComfyUI from the steps before it, as JSON this file checks and clamps;
// "ask" turns a step's writer into its editor ("add a scene where she finds the jellyfish").

export type StoryStep = "idea" | "script" | "world" | "board";
const CAMERAS = ["locked", "push-in", "pull-out", "orbit", "crane-up", "handheld"];
const SIZES = ["wide", "medium", "close", "ots"];

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const list = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);
export const tagOf = (name: string) => name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "someone";

const BRIEFS: Record<StoryStep, string> = {
  idea: `You develop stories for short films (30 seconds to 3 minutes) made with AI video, one shot at a time.
From the user's idea, write the story's foundation. Answer with JSON only, no other words:
{"title": "two to five words", "logline": "one sentence: who wants what, and what stands in the way", "synopsis": "one paragraph of four to six sentences: the beginning, the turn, the end", "genre": "one or two words", "tone": "three words"}
Rules: concrete and visual, things a camera can see; one to four characters; one or two places; the end lands; no camera words.`,
  script: `You are the screenwriter of a short AI film. From its title, logline and synopsis, write the script as scenes. Answer with JSON only, no other words:
{"cast": [{"name": "a character's name", "about": "who they are, in a few words"}], "places": [{"name": "a place's name", "about": "what it is, in a few words"}], "scenes": [{"slug": "EXT. THE PLACE — NIGHT", "place": "a place's name", "summary": "one sentence", "beats": ["something we see happen"], "lines": [{"who": "a character's name", "line": "a short line", "how": "whispers"}]}]}
Rules: the cast is everyone who acts in the story, people or animals (an animal that does things is cast, never a prop), each with a name of this story's world (a person's first name, or what the others call them: "the fox"); as many scenes as the length allows (about one per 20 seconds, two to six); two to five beats per scene, each one thing we see; dialogue short and sparse: a line has at most twelve words, and many scenes have none; every speaker is in cast and every scene's place in places; names never change.`,
  world: `You are the production designer of a short AI film. For each character and place of the script, write how they look, to draw reference sheets from, and the film's look. Answer with JSON only, no other words:
{"cast": [{"name": "as in the script", "words": "a ten-year-old girl, curly dark hair, freckles, a bright yellow raincoat, red rubber boots"}], "places": [{"name": "as in the script", "words": "a black-sand beach under a lighthouse at night, wet rocks, heavy surf"}], "props": [{"name": "an object", "words": "a brass oil lantern with a cracked glass, glowing amber"}], "look": {"words": "the film's style: medium, light, colour, lens, texture", "palette": ["#1b2a3a", "#2f4b66", "#e8b04a", "#9fd3e6", "#0d1117", "#c9ced6"]}}
Rules: every character and place of the script, by its name in the script; visual facts only (age, build, face, hair, clothes and their colours for people; species, size, fur or feathers and markings for animals; place, time of day, weather, light for places; shape, material and colour for props); props are objects only, never a character, and only the key ones the story turns on; a character's clothes stay the same all film; the palette is six hex colours that fit the look.`,
  board: `You are the storyboard artist of a short AI film. Break each scene into shots for an AI video model that makes each shot from its first frame. Answer with JSON only, no other words:
{"shots": [{"scene": 1, "size": "wide", "camera": "push-in", "seconds": 5, "action": "what happens in the shot, present tense, one or two sentences", "frame": "the first frame as a picture: who (by @tag), where (by @tag), what they do, the light", "line": {"who": "a character's name", "text": "a short line"}, "sound": "what we hear"}]}
Rules: every scene gets two to four shots (never just one), in order; vary the sizes (open a scene wide, go close for feelings); size is wide, medium, close or ots (over the shoulder); camera is one of locked, push-in, pull-out, orbit, crane-up, handheld; seconds 3 to 8, the total near the film's length; in frame, call characters and places only by their @tags; a line of dialogue goes in the shot of the one who says it, else line is null; sound names what we hear.`,
};

/** What the writer of a step reads: the steps before it, and what to change if asked. */
export function storyPrompt(step: StoryStep, story: any, ask?: string, only?: number, seen = false): string {
  const idea = story?.idea ?? {};
  const script = story?.script ?? {};
  const lines: string[] = [];
  const seconds = Math.round(Math.min(180, Math.max(15, Number(idea.length) || 60)));
  if (step === "idea") {
    lines.push(`Idea: ${text(idea.brief, 1500) || text(idea.logline, 400) || "a short film"}`, `Length: about ${seconds} seconds`, `Frame: ${idea.aspect ?? "16:9"}`);
    if (idea.genre || idea.tone) lines.push(`Wanted: ${[idea.genre, idea.tone].filter(Boolean).join(", ")}`);
  } else {
    lines.push(`Title: ${text(idea.title, 80)}`, `Logline: ${text(idea.logline, 400)}`, `Synopsis: ${text(idea.synopsis, 1500)}`, `Genre and tone: ${[idea.genre, idea.tone].filter(Boolean).join(", ")}`, `Length: about ${seconds} seconds`);
  }
  if (step === "world" || step === "board") {
    const scenes = list(script.scenes, 8).map((s: any, i: number) =>
      `Scene ${i + 1}: ${text(s.slug, 80)} — ${text(s.summary, 300)}\n  Beats: ${list(s.beats, 8).map((b: unknown) => text(b, 160)).join(" / ")}${list(s.lines, 8).length ? `\n  Lines: ${list(s.lines, 8).map((l: any) => `${text(l.who, 30)}: "${text(l.line, 120)}"`).join(" / ")}` : ""}`);
    lines.push(`Cast: ${list(story?.cast, 8).map((c: any) => `${text(c.name, 30)} (${text(c.about ?? c.words, 160)})`).join("; ")}`);
    lines.push(`Places: ${list(story?.places, 6).map((p: any) => `${text(p.name, 40)} (${text(p.about ?? p.words, 160)})`).join("; ")}`);
    if (list(story?.props, 1).length) lines.push(`Props: ${list(story?.props, 8).map((p: any) => `${text(p.name, 40)} (${text(p.about ?? p.words, 160)})`).join("; ")}`);
    lines.push("Script:", ...scenes);
  }
  if (step === "board") {
    lines.push(`Tags: ${[...list(story?.cast, 8), ...list(story?.places, 6), ...list(story?.props, 8)].map((c: any) => `@${c.tag ?? tagOf(c.name)} is ${text(c.name, 40)}`).join(", ")}`);
    if (story?.look?.words) lines.push(`Look: ${text(story.look.words, 300)}`);
    if (only) lines.push(`Board scene ${only} only: two to four shots, each with "scene": ${only}.`);
  }
  // asked to change a step: the step as it is, and what to change, answered whole again
  const current = step === "idea" ? pick(idea, ["title", "logline", "synopsis", "genre", "tone"])
    : step === "script" ? { cast: story?.cast, places: story?.places, scenes: script.scenes }
    : step === "world" ? { cast: list(story?.cast, 8).map((c: any) => ({ name: c.name, words: c.words })), places: list(story?.places, 6).map((p: any) => ({ name: p.name, words: p.words })), props: list(story?.props, 8).map((p: any) => ({ name: p.name, words: p.words })), look: story?.look }
    : { shots: story?.board?.shots };
  // the user's references, on the picture the writer sees
  const refs = list(story?.idea?.refs, 4).map((r: any) => `@${text(r.name, 30)} (${r.kind === "video" ? "a frame of a reference video" : "a reference picture"})`);
  if (seen && refs.length) lines.push(`The picture shows the user's references, each under its @name: ${refs.join(", ")}. ${step === "world" ? "Describe the people, places and things that appear in them exactly as they look there." : "Build the film around them: who and what they show, where, and their look."}`);
  if (ask?.trim()) lines.push(`The ${step === "world" ? "cast and world" : step} as it is now: ${JSON.stringify(current).slice(0, 6000)}`, `Change it: ${text(ask, 800)}. Answer with the whole ${step === "world" ? "cast and world" : step} again, changed.`);
  return lines.join("\n");
}
const pick = (o: any, keys: string[]) => Object.fromEntries(keys.map((k) => [k, o?.[k]]));

export const storyBrief = (step: StoryStep) => BRIEFS[step];

/** The first {…} of a reply, read whole. */
function json(reply: string) {
  const from = reply.indexOf("{");
  const to = reply.lastIndexOf("}");
  try {
    return JSON.parse(reply.slice(from, to + 1));
  } catch {
    throw new Error("The writer's answer didn't come back whole. Try again?");
  }
}

/** A step's answer, checked and clamped to what the page can show. */
export function readStory(step: StoryStep, reply: string): any {
  const raw = json(reply);
  if (step === "idea") {
    return { title: text(raw.title, 60) || "Untitled", logline: text(raw.logline, 300), synopsis: text(raw.synopsis, 1400), genre: text(raw.genre, 40), tone: text(raw.tone, 60) };
  }
  if (step === "script") {
    const cast = list(raw.cast, 6).map((c: any) => ({ name: text(c?.name, 30), about: text(c?.about, 200) })).filter((c) => c.name);
    const places = list(raw.places, 5).map((p: any) => ({ name: text(p?.name, 40), about: text(p?.about, 200) })).filter((p) => p.name);
    const scenes = list(raw.scenes, 8).map((s: any) => ({
      slug: text(s?.slug, 80).toUpperCase(),
      place: text(s?.place, 40),
      summary: text(s?.summary, 300),
      beats: list(s?.beats, 8).map((b: unknown) => text(b, 200)).filter(Boolean),
      lines: list(s?.lines, 8).map((l: any) => ({ who: text(l?.who, 30).replace(/^@/, ""), line: text(l?.line, 160), how: text(l?.how, 40) })).filter((l) => l.who && l.line),
    })).filter((s) => s.summary || s.beats.length);
    if (!scenes.length) throw new Error("The script came back without scenes. Try again?");
    return { cast, places, scenes };
  }
  if (step === "world") {
    const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : null);
    return {
      cast: list(raw.cast, 6).map((c: any) => ({ name: text(c?.name, 30), words: text(c?.words, 400) })).filter((c) => c.name),
      places: list(raw.places, 5).map((p: any) => ({ name: text(p?.name, 40), words: text(p?.words, 400) })).filter((p) => p.name),
      props: list(raw.props, 8).map((p: any) => ({ name: text(p?.name, 40), words: text(p?.words, 400) })).filter((p) => p.name),
      look: { words: text(raw.look?.words, 400), palette: list(raw.look?.palette, 6).map(hex).filter(Boolean) },
    };
  }
  const shots = list(raw.shots, 40).map((s: any) => ({
    scene: Math.max(1, Math.round(Number(s?.scene) || 1)),
    size: SIZES.includes(s?.size) ? s.size : "medium",
    camera: CAMERAS.includes(s?.camera) ? s.camera : "locked",
    seconds: Math.round(Math.min(8, Math.max(3, Number(s?.seconds) || 5))),
    action: text(s?.action, 500),
    frame: text(s?.frame, 600),
    line: s?.line && text(s.line.text ?? s.line.line, 160) ? { who: text(s.line.who, 30).replace(/^@/, ""), text: text(s.line.text ?? s.line.line, 160) } : null,
    sound: text(s?.sound, 200),
  })).filter((s) => s.action || s.frame);
  if (!shots.length) throw new Error("The storyboard came back without shots. Try again?");
  return { shots };
}

// ------------------------------------------------------------------ the story assistant

/**
 * The editor that knows the whole story: it reads the idea, the bible and every block of the
 * script by its id, what is selected, and the conversation, and answers with edits to make.
 */
export const STORY_ASSIST_BRIEF = `You are the story editor of a short AI film. You know the whole story below: its idea, its bible (the cast, the places, the props and the look, each called by an @tag) and its script, one block per line, each with its id in brackets and its fields as JSON.
The user asks for a change, most often to the block they selected. Answer with JSON only, no other words:
{"reply": "one short sentence of what you changed", "ops": [ ... ]}
Ops:
- {"op": "update", "id": "b7", "set": {...}}: change some of a block's fields
- {"op": "insert", "after": "b7", "block": {...}}: a new block after another ("after": "start" or "end" also work); several inserts after the same block land in the order you list them
- {"op": "remove", "id": "b9"}
- {"op": "idea", "set": {"title": "...", "logline": "...", "synopsis": "..."}}
- {"op": "bible", "kind": "cast", "name": "Mara", "set": {"words": "how she looks", "about": "who she is"}}: a character (or "place", "prop") added or changed
The blocks, with all their fields:
- {"kind": "scene", "slug": "EXT. TIDE POOL — NIGHT", "summary": "what happens in it", "place": "a place's tag, without @"}
- {"kind": "action", "text": "what we see"}
- {"kind": "line", "who": "a character's name", "text": "what they say", "how": "softly"}
- {"kind": "shot", "size": "wide", "camera": "push-in", "seconds": 5, "action": "what happens in the shot", "frame": "the first frame as a picture in words, with @tags", "line": {"who": "Mara", "text": "..."}, "sound": "what we hear"}: size is wide, medium, close or ots; camera is locked, push-in, pull-out, orbit, crane-up or handheld; seconds 3 to 8; line can be null
- {"kind": "note", "text": "..."}
A scene's blocks follow it until the next scene. A new scene goes after the last block of the scene before it, and its own blocks right after it.
Rules: change only what is asked; every change is one op, and the reply names only what the ops do (to add a scene, an action, a line or a shot, insert it; never say you added something without its insert); keep every name and @tag as it is; write visually, in the present tense; lines are short; in a shot's frame call characters, places and props only by their @tags; when the user only asks a question, answer it with no ops.
Example: with [b4] selected, "make it gentler and give Ana a line after it" is
{"reply": "I softened the beat and gave Ana a line after it.", "ops": [{"op": "update", "id": "b4", "set": {"text": "Ana kneels and lifts the shell with both hands, slowly."}}, {"op": "insert", "after": "b4", "block": {"kind": "line", "who": "Ana", "text": "You're safe now.", "how": "whispering"}}]}`;

const short = (t: unknown, n: number) => text(t, n);
/** The whole story as the assistant reads it: every block one line, its short id and its fields. */
export function storyAssistPrompt(story: any, selected: string | null, turns: { role: string; text: string }[]) {
  const i = story?.idea ?? {};
  const bible = (k: string) => list(story?.[k], 12).map((x: any) => `@${x.tag} (${short(x.name, 30)}): ${short(x.words || x.about, 220)}`).join("; ") || "none";
  const lines = [
    "THE STORY",
    `Title: ${short(i.title, 80)}`, `Logline: ${short(i.logline, 300)}`, `Synopsis: ${short(i.synopsis, 1200)}`, `Genre and tone: ${[i.genre, i.tone].filter(Boolean).join(", ")}`, `Length: about ${Math.round(Number(i.length) || 60)} s, frame ${i.aspect ?? "16:9"}`,
    `Cast: ${bible("cast")}`, `Places: ${bible("places")}`, `Props: ${bible("props")}`, `Look: ${short(story?.look?.words, 300) || "none"}`,
    "",
    "SCRIPT",
  ];
  let scene = 0;
  let shot = 0;
  for (const b of list(story?.blocks, 300)) {
    let o: any = null;
    if (b.kind === "scene") {
      scene++;
      shot = 0;
      lines.push("");
      o = { kind: "scene", n: scene, slug: short(b.slug, 80), summary: short(b.summary, 300), place: b.place || undefined };
    } else if (b.kind === "action") o = { kind: "action", text: short(b.text, 400) };
    else if (b.kind === "line") o = { kind: "line", who: short(b.who, 30), text: short(b.text, 200), how: b.how ? short(b.how, 30) : undefined };
    else if (b.kind === "shot") {
      shot++;
      o = { kind: "shot", code: `${scene}${String.fromCharCode(64 + shot)}`, size: b.size, camera: b.camera, seconds: b.seconds, action: short(b.action, 300), frame: short(b.frame, 300), line: b.line?.text ? { who: short(b.line.who, 30), text: short(b.line.text, 160) } : null, sound: b.sound ? short(b.sound, 120) : undefined };
    } else if (b.kind === "note") o = { kind: "note", text: short(b.text, 300) };
    if (o) lines.push(`[${b.sid}] ${JSON.stringify(o)}`);
  }
  if (!list(story?.blocks, 1).length) lines.push("(no blocks yet)");
  lines.push("", `SELECTED: ${selected || "nothing"}`, "", "THE CONVERSATION", ...turns.slice(-8).map((t) => `${t.role === "user" ? "User" : "Editor"}: ${short(t.text, 800)}`));
  return lines.join("\n");
}

/** A reply's JSON, mended where a small writer slips: words around it, a brace too many or too few, a cut-off end. */
function loose(reply: string) {
  const from = reply.indexOf("{");
  if (from < 0) throw new Error("no JSON");
  const body = reply.slice(from);
  try {
    return JSON.parse(body.slice(0, body.lastIndexOf("}") + 1));
  } catch {}
  let out = "";
  let str = false;
  let esc = false;
  const open: string[] = [];
  for (const c of body) {
    if (str) {
      out += c;
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') str = false;
      continue;
    }
    if (c === '"') (str = true), (out += c);
    else if (c === "{" || c === "[") open.push(c === "{" ? "}" : "]"), (out += c);
    else if (c === "}" || c === "]") {
      // a brace too many inside a list goes; an object a list leaves open is closed
      if (c === "}" && open.at(-1) === "]") continue;
      while (c === "]" && open.at(-1) === "}") out += open.pop();
      if (open.at(-1) !== c) continue;
      out += open.pop();
      if (!open.length) break;
    } else out += c;
  }
  if (str) out += '"';
  out = out.replace(/,\s*$/, "");
  if (/:\s*$/.test(out)) out += "null";
  return JSON.parse(`${out}${open.reverse().join("")}`.replace(/,\s*([}\]])/g, "$1"));
}

/** "SCENE 3: EXT. TIDE POOL — NIGHT — Mara kneels" as a slugline and a summary. */
function sceneText(t: string) {
  const s = String(t).replace(/^\s*SCENE\s+[\d.]+\s*[:.·—-]?\s*/i, "").trim();
  const parts = s.split(/\s+[—–-]\s+|:\s+/);
  const slug: string[] = [];
  while (parts.length && !/[a-z]/.test(parts[0])) slug.push(parts.shift()!);
  return slug.length ? { slug: slug.join(" — "), summary: parts.join(" — ") } : { slug: "INT. NEW PLACE — DAY", summary: s };
}

/** "medium, locked, 5 s: what happens | frame: … | line: Mara: "…" | sound: …" as a shot's fields. */
function shotText(t: string) {
  const out: any = {};
  const [head, ...rest] = String(t).split(/\s*\|\s*/);
  const m = head.match(/^\s*([a-z]+)\s*,\s*([a-z-]+)\s*,\s*(\d+)\s*s\s*:\s*([\s\S]*)$/i);
  if (m) Object.assign(out, { size: m[1].toLowerCase(), camera: m[2].toLowerCase(), seconds: Number(m[3]), action: m[4] });
  else out.action = head;
  for (const part of rest) {
    const k = part.match(/^(frame|line|sound)\s*:\s*([\s\S]*)$/i);
    if (!k) continue;
    const key = k[1].toLowerCase();
    const l = key === "line" && k[2].match(/^@?([^:]+):\s*"?([\s\S]*?)"?\.?\s*$/);
    if (l) out.line = { who: l[1].trim(), text: l[2].trim() };
    else if (key !== "line") out[key] = k[2].trim();
  }
  return out;
}

const KINDS = new Set(["scene", "action", "line", "shot", "note"]);
/** The assistant's answer, read whole and checked: known ops, blocks of known kinds, fields clamped. */
export function readStoryAssist(reply: string): { reply: string; ops: any[]; broken?: boolean } {
  let raw: any;
  try {
    raw = loose(reply);
  } catch {
    return { reply: "The writer's answer didn't come back whole. Ask again?", ops: [], broken: true };
  }
  const block = (o: any) => {
    // a block's fields, wherever the writer put them
    const b = o && typeof o === "object" ? { ...(o.set ?? o.fields ?? {}), ...o } : null;
    if (!b || !KINDS.has(b.kind)) return null;
    if (b.kind === "scene" && !b.slug && b.text) Object.assign(b, sceneText(b.text), { text: undefined });
    if (b.kind === "shot" && !b.action && !b.frame && b.text) Object.assign(b, shotText(b.text), { text: undefined });
    const out: any = { kind: b.kind };
    for (const [k, n] of [["text", 600], ["slug", 80], ["summary", 400], ["place", 40], ["who", 30], ["how", 40], ["action", 500], ["frame", 600], ["sound", 200]] as const) if (b[k] !== undefined) out[k] = text(b[k], n);
    if (out.place) out.place = out.place.replace(/^@/, "");
    if (b.kind === "shot") {
      out.size = SIZES.includes(b.size) ? b.size : "medium";
      out.camera = CAMERAS.includes(b.camera) ? b.camera : "locked";
      out.seconds = Math.round(Math.min(8, Math.max(3, Number(b.seconds) || 5)));
      out.line = b.line && text(b.line.text, 160) ? { who: text(b.line.who, 30).replace(/^@/, ""), text: text(b.line.text, 160) } : null;
    }
    if (out.slug) out.slug = out.slug.toUpperCase();
    if (out.who) out.who = out.who.replace(/^@/, "");
    return out;
  };
  const set = (o: any) => {
    const out: any = {};
    for (const [k, v] of Object.entries(o ?? {})) {
      if (k === "line") out.line = v && text((v as any).text, 160) ? { who: text((v as any).who, 30).replace(/^@/, ""), text: text((v as any).text, 160) } : null;
      else if (k === "seconds") out.seconds = Math.round(Math.min(8, Math.max(3, Number(v) || 5)));
      else if (k === "size") SIZES.includes(v as string) && (out.size = v);
      else if (k === "camera") CAMERAS.includes(v as string) && (out.camera = v);
      else if (typeof v === "string") out[k] = text(v, 1400);
    }
    return out;
  };
  const ops = list(raw.ops ?? raw.actions, 30).map((o: any) => {
    if (o?.op === "update" && o.id) return { op: "update", id: String(o.id), set: set(o.set ?? o.fields) };
    if (o?.op === "insert" && o.block) {
      const b = block(o.block);
      return b ? { op: "insert", after: String(o.after ?? "end"), block: b } : null;
    }
    if (o?.op === "remove" && o.id) return { op: "remove", id: String(o.id) };
    if (o?.op === "idea") return { op: "idea", set: set(o.set ?? o.fields) };
    if (o?.op === "bible" && o.name) return { op: "bible", kind: ["cast", "place", "prop"].includes(o.kind) ? o.kind : "cast", name: text(o.name, 30), set: set(o.set ?? o.fields) };
    return null;
  }).filter(Boolean);
  return { reply: text(raw.reply, 400), ops };
}
