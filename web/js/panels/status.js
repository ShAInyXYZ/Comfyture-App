import { h } from "../dom.js";
import { STATIC } from "../api.js";
import { state } from "../store.js";

/** Where shots render and whether it is busy: the one fact the header owes you. */
export function renderStatus(el) {
  if (!state.info) return;
  const active = state.runs.filter((r) => ["queued", "frame", "shot"].includes(r.status)).length + Object.keys(state.jobs).length;
  const target = STATIC ? "Live demo" : state.info.target === "comfy-cloud" ? "Comfy Cloud" : "Your ComfyUI";
  const text = STATIC ? "rendering is off" : active ? `${active} job${active > 1 ? "s" : ""} running` : "ready";
  el.replaceChildren(h("span.lamp", { dataset: { tone: STATIC ? "idle" : active ? "busy" : "ok" } }), h("b", {}, target), h("span", {}, text));
  el.title = STATIC ? "Takes play here, but rendering needs Comfyture running on your machine" : `Shots render on ${state.info.url}`;
}
