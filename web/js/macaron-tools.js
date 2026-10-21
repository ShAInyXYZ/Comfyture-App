// Brioche's tools, as the left panel offers them in the workspace that is open: the three of web/js/macaron-harness.js
// (PRESETS), each either words sent to her (through the registry's tell(), so the bar opens its conversation and answers
// as it does for anything typed) or one thing the page does at once, named by the tool's `page`: a picker, a window.
import { h } from "./dom.js";
import { macaron, designNow } from "./macaron.js";
import { armPreset } from "./macaron-assist.js";
import { openWin, closeAll } from "./macaron-win.js";
import { pickReferences } from "./macaron-idea.js";
import { PRESETS, BRIOCHE } from "./macaron-harness.js";
import { tell } from "./harnesses.js";

/** What the page does for a tool of its own. */
const PAGE = {
  references: (e) => pickReferences(e),
  contrast: () => ((macaron.adv = { ...macaron.adv, palette: true }), closeAll(), openWin("palette")),
  export: () => (closeAll(), openWin("exportkit")),
};

export const TOOLS = Object.fromEntries(Object.entries(PRESETS).map(([space, list]) => [space, list.map((t) => ({ ...t, run: t.page ? PAGE[t.page] : null }))]));

/** What the tool needs that is not there: the reason it waits (Brioche working, a post to be open), or nothing. */
export const waitingFor = (tool) => (macaron.chat.busy ? "Brioche is working" : tool.needs === "design" && !designNow() ? "Open a post first" : "");

/** The tool, done: a page action runs, or Brioche is asked (the tool's id goes with the words, for what she is told about it). */
export function runTool(tool, e) {
  if (waitingFor(tool)) return;
  if (tool.run) return tool.run(e);
  armPreset(tool.id, tool.ask);
  tell(tool.ask);
}

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
