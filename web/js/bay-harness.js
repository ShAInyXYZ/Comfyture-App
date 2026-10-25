// Paprika's harness on the bay's side: what her bar offers above it in each of the seven stages (the placeholders and her lines are
// spice2-model.js's). Plain data with no imports of the page, so the pet registry (harnesses.js), the chat bar and the tests read the same words.
import { PLACEHOLDER, SAY } from "./spice2-model.js";

export { PLACEHOLDER, SAY };

const o = (label, ask) => ({ label, ask });
/** What Paprika offers above her bar in each stage: words said to her, as if typed (she sets it up; a run still waits for a yes, with its price). */
export const OFFERS = {
  conform: [o("Plan the edit", "Read the brief and plan the whole edit, stage by stage"), o("What needs fixing?", "Which engines take this clip, and what should Conform change?")],
  select: [o("Follow the main character", "Follow the main character through the clip")],
  clean: [o("Remove what is in the way", "Take out what is in the way of the shot"), o("No subtitles", "Take the subtitles off")],
  direct: [o("Rainy blue hour", "Make it a rainy blue hour and keep everything else"), o("Relight to dusk", "Relight it to a warm dusk"), o("Swap something", "Swap one thing in the shot for another")],
  control: [o("Keep the motion", "Keep the motion and redraw the look"), o("Hold the character", "Hold the character's look from a reference sheet"), o("Make it vertical", "Widen or reframe it to vertical 9:16")],
  extend: [o("Continue 8 s", "Continue the clip for eight seconds"), o("Bridge two takes", "Bridge this take to the next one")],
  finish: [o("Add the sound", "Add sound effects that fit the picture"), o("Smoother motion", "Make the motion smoother")],
};
