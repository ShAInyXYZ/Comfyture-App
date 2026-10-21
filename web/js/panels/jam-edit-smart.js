// The smart key of the timeline: one key that opens a short list of what the editor can do on the beat for the whole film,
// every item an action the editor already has (the cuts moved onto the beats or the bars, an effect on the beat, a whip into
// the next clip). A menu that opens under the key and closes on a press elsewhere or Escape.
import { h } from "../dom.js";
import { changed } from "../store.js";
import { cut, addFx, snapToBeats, setJoin, findItem } from "../cut.js";
import { jicon } from "./jam-ui.js";

let open = false;

const beats = () => !!cut.project?.body.beats?.times?.length;
/** The picked clip, when it is one on the main track (a whip joins it to the next). */
const pickedClip = () => {
  const f = cut.selected ? findItem(cut.selected) : null;
  return f?.track.main ? f.item : null;
};

const ITEMS = [
  { id: "beat", icon: "wave", label: "Cut on every beat", why: "Moves every cut onto the nearest beat, trimming each clip a little (nothing is lost)", ok: beats, run: () => snapToBeats("beat") },
  { id: "bar", icon: "scissors", label: "Cut on every bar", why: "Moves every cut onto the nearest bar line", ok: beats, run: () => snapToBeats("bar") },
  { id: "zoom", icon: "pulse", label: "Zoom pulse from here", why: "A zoom on the beat, from the playhead on", ok: () => !!cut.project, run: () => addFx("zoom", { at: cut.playhead }) },
  { id: "flash", icon: "flash", label: "Flash on the bars", why: "A flash on every bar, from the playhead on", ok: () => !!cut.project, run: () => addFx("flash", { at: cut.playhead }) },
  { id: "whip", icon: "whip", label: "Whip into the next clip", why: "Pick a clip on the timeline first: its join to the next one becomes a whip", ok: () => !!pickedClip(), run: () => setJoin(pickedClip().id, "whip") },
];

function close() {
  if (!open) return;
  open = false;
  changed("jam");
}

document.addEventListener("pointerdown", (e) => open && !e.target.closest?.(".jm-smart") && close(), true);
document.addEventListener("keydown", (e) => e.key === "Escape" && open && close());

/** The key and, when it is open, its menu. */
export function smartKey() {
  return h("div.jm-smart", {},
    h("button.jm-chipkey", { type: "button", "aria-haspopup": "menu", "aria-expanded": String(open), title: "Smart keys: cut on the beat, an effect on the bars, a whip", on: { click: () => ((open = !open), changed("jam")) } },
      jicon("sparkle"), "Smart", jicon("caret")),
    open ? h("div.jm-smart-menu", { role: "menu" }, ...ITEMS.map((it) =>
      h("button.jm-smart-item", { type: "button", role: "menuitem", disabled: !it.ok(), title: it.ok() ? it.why : it.id === "whip" ? it.why : "Find the beats first (the beat tools)", on: { click: () => (it.run(), close()) } }, jicon(it.icon), h("span", {}, it.label)))) : null);
}
