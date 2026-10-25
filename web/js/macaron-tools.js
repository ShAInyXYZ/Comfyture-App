// Brioche's draft key, the one piece every Macaron window shares to ask her for something: her face, a line of what she will do, and
// the words she is sent through the registry's tell(), so the bar opens its conversation and answers as it does for anything typed.
// (The left panel's row of tools it used to make went with the five workspaces; the brand's health and the windows' keys replace it.)
import { h } from "./dom.js";
import { macaron } from "./macaron.js";
import { armPreset } from "./macaron-assist.js";
import { BRIOCHE } from "./macaron-harness.js";
import { tell } from "./harnesses.js";

/**
 * A key that asks Brioche to draft something from inside a window: her round face, a line of what she will do, and the words
 * she is sent (the bar opens its conversation and answers as it does for anything typed). `id` names the instructions she
 * is given with it, when the server has some for it.
 */
export function draftKey(title, sub, ask, id) {
  // (`ask` may be a function: the words are worked out when the key is pressed, from what is open then)
  const say = () => (typeof ask === "function" ? ask() : ask);
  return h("button.mc-draft", { type: "button", title: typeof ask === "function" ? title : ask, disabled: !!macaron.chat.busy, on: { click: () => { const text = say(); if (id) armPreset(id, text); tell(text); } } },
    h("img", { src: BRIOCHE.face, alt: "", draggable: false }),
    h("span", {}, h("b", {}, title), sub ? h("em", {}, sub) : null));
}
