import { h } from "../dom.js";
import { STATIC } from "../api.js";
import { state } from "../store.js";
import { toggleAccount, redrawAccount } from "./account.js";

const fmt = (n) => Math.round(n).toLocaleString("en-US");

/** The header's one fact about the Comfy account: the credits left, and a lamp that says if the work can run. Click for the account. */
export function renderStatus(el) {
  if (!state.info) return;
  if (!el.dataset.bound) {
    el.dataset.bound = "1";
    el.addEventListener("click", () => toggleAccount(el));
  }
  const active = state.runs.filter((r) => ["queued", "frame", "shot"].includes(r.status)).length + Object.keys(state.jobs).length;
  const running = active ? [h("span.account-run", {}, `· ${active} running`)] : [];
  if (STATIC) {
    el.replaceChildren(h("span.lamp", { dataset: { tone: "idle" } }), h("b", {}, "Live demo"), h("span", {}, "rendering is off"));
    el.title = "Takes play here, but rendering needs Comfyture running on your machine";
    el.disabled = true;
    return;
  }
  const a = state.account;
  const own = state.info.target !== "comfy-cloud";
  let tone = active ? "busy" : "ok";
  let face;
  let tip;
  if (!a) {
    face = [h("span.account-credits", {}, "…")];
    tip = "Comfy account";
  } else if (a.balance) {
    face = [h("b.account-credits", {}, `${fmt(a.balance.credits)} cr`)];
    tip = `Comfy account: $${a.balance.usd.toFixed(2)} · ${fmt(a.balance.credits)} credits`;
  } else if (!a.key.set) {
    // a ComfyUI of your own needs no key; Comfy Cloud does
    face = own ? [h("b", {}, "Your ComfyUI"), h("span", {}, "no key")] : [h("span.account-credits", {}, "no key")];
    tip = own ? `Your ComfyUI at ${a.target.url}: no Comfy key set` : "Comfy account: no API key set";
    if (!own) tone = "crit";
  } else if (a.openWeights) {
    face = [h("span.account-credits", {}, "open weights")];
    tip = "Comfy account: open weights only, no credits are spent";
  } else {
    face = [h("span.account-credits", {}, a.error === "The key was refused" ? "key refused" : "offline")];
    tip = `Comfy account: ${a.error}`;
    tone = "crit";
  }
  el.disabled = false;
  el.replaceChildren(h("span.lamp", { dataset: { tone } }), ...face, ...running);
  el.title = tip;
  redrawAccount();
}
