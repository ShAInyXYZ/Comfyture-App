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
{"cast": [{"name": "Mara", "about": "who she is, in a few words"}], "places": [{"name": "Storm beach", "about": "what it is, in a few words"}], "scenes": [{"slug": "EXT. STORM BEACH — NIGHT", "place": "Storm beach", "summary": "one sentence", "beats": ["something we see happen"], "lines": [{"who": "Mara", "line": "It's still glowing.", "how": "whispers"}]}]}
Rules: as many scenes as the length allows (about one per 20 seconds, two to six); two to five beats per scene, each one thing we see; dialogue short and sparse: a line has at most twelve words, and many scenes have none; every speaker is in cast and every scene's place in places; names never change.`,
  world: `You are the production designer of a short AI film. For each character and place of the script, write how they look, to draw reference sheets from, and the film's look. Answer with JSON only, no other words:
{"cast": [{"name": "Mara", "words": "a ten-year-old girl, curly dark hair, freckles, a bright yellow raincoat, red rubber boots"}], "places": [{"name": "Storm beach", "words": "a black-sand beach under a lighthouse at night, wet rocks, heavy surf"}], "look": {"words": "the film's style: medium, light, colour, lens, texture", "palette": ["#1b2a3a", "#2f4b66", "#e8b04a", "#9fd3e6", "#0d1117", "#c9ced6"]}}
Rules: visual facts only (age, build, face, hair, clothes and their colours for people; place, time of day, weather, light for places); a character's clothes stay the same all film; the palette is six hex colours that fit the look.`,
  board: `You are the storyboard artist of a short AI film. Break each scene into shots for an AI video model that makes each shot from its first frame. Answer with JSON only, no other words:
{"shots": [{"scene": 1, "size": "wide", "camera": "push-in", "seconds": 5, "action": "what happens in the shot, present tense, one or two sentences", "frame": "the first frame as a picture: who (by @tag), where (by @tag), what they do, the light", "line": {"who": "Mara", "text": "It's still glowing."}, "sound": "what we hear"}]}
Rules: every scene gets two to four shots (never just one), in order; vary the sizes (open a scene wide, go close for feelings); size is wide, medium, close or ots (over the shoulder); camera is one of locked, push-in, pull-out, orbit, crane-up, handheld; seconds 3 to 8, the total near the film's length; in frame, call characters and places only by their @tags; a line of dialogue goes in the shot of the one who says it, else line is null; sound names what we hear.`,
};

/** What the writer of a step reads: the steps before it, and what to change if asked. */
export function storyPrompt(step: StoryStep, story: any, ask?: string): string {
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
    lines.push("Script:", ...scenes);
  }
  if (step === "board") {
    lines.push(`Tags: ${[...list(story?.cast, 8), ...list(story?.places, 6)].map((c: any) => `@${c.tag ?? tagOf(c.name)} is ${text(c.name, 40)}`).join(", ")}`);
    if (story?.look?.words) lines.push(`Look: ${text(story.look.words, 300)}`);
  }
  // asked to change a step: the step as it is, and what to change, answered whole again
  const current = step === "idea" ? pick(idea, ["title", "logline", "synopsis", "genre", "tone"])
    : step === "script" ? { cast: story?.cast, places: story?.places, scenes: script.scenes }
    : step === "world" ? { cast: list(story?.cast, 8).map((c: any) => ({ name: c.name, words: c.words })), places: list(story?.places, 6).map((p: any) => ({ name: p.name, words: p.words })), look: story?.look }
    : { shots: story?.board?.shots };
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
