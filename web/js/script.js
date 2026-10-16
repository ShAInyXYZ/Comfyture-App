// The script: one or more shots, composed into the single present-tense
// paragraph LTX-2.5 reads best. Shared by the browser (live prompt view)
// and the server (what is actually sent).

export const CAMERA = {
  locked: "The camera holds steady on a locked-off frame",
  "push-in": "The camera pushes in slowly",
  "pull-out": "The camera pulls back slowly",
  orbit: "The camera orbits smoothly around the subject",
  "crane-up": "The camera cranes up and back",
  handheld: "The camera follows handheld, with a subtle natural sway",
};

export const CAMERA_LABELS = {
  locked: "Locked",
  "push-in": "Push in",
  "pull-out": "Pull out",
  orbit: "Orbit",
  "crane-up": "Crane up",
  handheld: "Handheld",
};

export const TRANSITIONS = {
  "hard-cut": "A hard cut opens the next shot:",
  "match-cut": "A match cut carries into the next shot:",
  dissolve: "The image dissolves into the next shot:",
};

export const TRANSITION_LABELS = { "hard-cut": "Hard cut", "match-cut": "Match cut", dissolve: "Dissolve" };

/** About 2.5 spoken words per second keeps lines intelligible. */
export const WORDS_PER_SECOND = 2.5;

const sentence = (text) => {
  const t = String(text ?? "").trim();
  if (!t) return "";
  return /[.!?…"”]$/.test(t) ? t : `${t}.`;
};

export function cameraSentence(shot) {
  const base = shot.cameraText?.trim() || CAMERA[shot.camera] || "";
  if (!base) return "";
  const framing = shot.framing?.trim();
  return sentence(framing ? `${base.replace(/[.]$/, "")}, ending on ${framing}` : base);
}

export function dialogueSentences(shot) {
  return (shot.dialogue ?? [])
    .filter((d) => d.line?.trim())
    .map((d) => {
      const who = d.speaker?.trim() || "The subject";
      const how = d.language?.trim() ? ` in ${d.language.trim()}` : "";
      const line = d.line.trim().replace(/^["“]|["”]$/g, "");
      return `${who} says${how}, "${line}"`;
    });
}

export function shotText(shot) {
  return [sentence(shot.action), cameraSentence(shot), ...dialogueSentences(shot).map(sentence), sentence(shot.sound)]
    .filter(Boolean)
    .join(" ");
}

/** The paragraph for the script alone. A raw override wins when present. */
export function compose(script) {
  if (script?.raw?.trim()) return script.raw.trim();
  const shots = (script?.shots ?? []).filter((s) => shotText(s));
  return shots
    .map((shot, i) => {
      const text = shotText(shot);
      if (i === 0) return text;
      const lead = TRANSITIONS[shot.transition] ?? TRANSITIONS["hard-cut"];
      return `${lead} ${text}`;
    })
    .join(" ");
}

export function wordCount(script) {
  return (script?.shots ?? [])
    .flatMap((s) => s.dialogue ?? [])
    .reduce((n, d) => n + (d.line?.trim() ? d.line.trim().split(/\s+/).length : 0), 0);
}

export const wordBudget = (seconds) => Math.max(0, Math.floor(seconds * WORDS_PER_SECOND) - 2);

export const emptyShot = () => ({ action: "", camera: "locked", cameraText: "", framing: "", sound: "", dialogue: [], transition: "hard-cut" });

export const LIPSYNC = "The speaker moves with natural lip-sync to the audio, small head nods, blinks and steady eye contact.";
export const PANELS = ["cast", "prop", "location"];
const PANEL_TEXT = { cast: "a person", prop: "an object", location: "a place" };
// where each panel sits on the sheet, by how many there are (see composeSheet)
const POSITIONS = { 1: [""], 2: ["on the left", "on the right"], 3: ["on the left", "top right", "bottom right"] };

/**
 * The reference IC-LoRA's prompt opens by describing each panel by its place
 * on the sheet, so the model knows which element is which.
 */
export function sheetText({ panels = PANELS, texts = {} } = {}) {
  const used = PANELS.filter((p) => panels.includes(p));
  const where = POSITIONS[used.length] ?? POSITIONS[3];
  const items = used.map((p, i) => {
    const what = texts[p]?.trim().replace(/[.;\s]+$/, "") || PANEL_TEXT[p];
    return where[i] ? `${where[i]}, ${what}` : what;
  });
  return `Reference sheet: ${items.join("; ")}. Generated video:`;
}

/** The exact text sent to LTX-2.5, with the source-dependent additions. `references` is { panels, texts }. */
export function finalPrompt(script, { lipsync = false, references = null } = {}) {
  const body = compose(script);
  if (!body) return "";
  const text = lipsync ? `${body} ${LIPSYNC}` : body;
  return references?.panels?.length ? `${sheetText(references)} ${text}` : text;
}
