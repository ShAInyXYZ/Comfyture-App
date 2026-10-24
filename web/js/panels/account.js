import { h, icon, ago } from "../dom.js";
import { float, stick } from "../controls.js";
import { state, loadAccount, saveAccountKey, clearAccountKey } from "../store.js";

const fmt = (n) => Math.round(n).toLocaleString("en-US");
const usd = (cents) => `$${(cents / 100).toFixed(2)}`;

let pop = null;
let trigger = null;
let unstick = null;
let editing = false;
let message = "";
let busy = false;

/** Opens the account settings under the header's button, or closes them. */
export function toggleAccount(button) {
  if (pop) return close();
  trigger = button;
  pop = h("div.menu.account-pop", { role: "dialog", "aria-label": "Comfy account" });
  document.body.append(pop);
  button.setAttribute("aria-expanded", "true");
  editing = false;
  message = "";
  draw();
  place();
  unstick = stick(pop, button, close);
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", place);
  loadAccount(true);
}

function place() {
  if (pop) float(pop, trigger.getBoundingClientRect(), 340);
}

function close() {
  if (!pop) return;
  unstick?.();
  pop.remove();
  pop = null;
  trigger.setAttribute("aria-expanded", "false");
  document.removeEventListener("pointerdown", outside, true);
  document.removeEventListener("keydown", onKey, true);
  window.removeEventListener("resize", place);
}
const outside = (e) => !pop?.contains(e.target) && !trigger.contains(e.target) && close();
const onKey = (e) => {
  if (e.key !== "Escape") return;
  e.stopPropagation();
  close();
  trigger.focus();
};

/** The header draws again: so do the settings, unless a key is being typed. */
export function redrawAccount() {
  if (pop && !editing) draw();
}

const link = (href, label, ...kids) => h("a.account-link", { href, target: "_blank", rel: "noreferrer", title: label, "aria-label": label }, ...kids);
const section = (title, ...kids) => h("section.account-sec", {}, h("h3", {}, title), ...kids);

function draw() {
  const a = state.account;
  if (!a) return pop.replaceChildren(h("p.hint", {}, "Reading your account…"));
  const jobs = state.runs.filter((r) => ["queued", "frame", "shot"].includes(r.status)).length + Object.keys(state.jobs).length;
  const b = a.balance;
  const own = a.target.kind !== "comfy-cloud";
  const host = new URL(a.target.url).host;

  const credits = section(
    "Credits",
    b
      ? h("div.account-big", {}, h("b", {}, fmt(b.credits)), h("span", {}, "credits"))
      : h("p.account-none", {}, a.openWeights ? "Open weights only: nothing here spends credits." : a.error ?? "Not read yet"),
    b && h("p.hint", {}, `${usd(b.prepaidCents)} prepaid`),
    b && b.cloudCents > 0 && h("p.hint", {}, `${usd(b.cloudCents)} in cloud credits`),
    b && b.pendingCents > 0 && h("p.hint", {}, `${usd(b.pendingCents)} pending`),
    h(
      "div.account-row",
      {},
      b && h("span.hint", {}, `Read ${ago(b.at)}`),
      h("span.spacer"),
      h("button.key.is-quiet", { type: "button", title: "Read the balance again", "aria-label": "Refresh", on: { click: () => loadAccount(true) } }, icon("remix")),
      link("https://cloud.comfy.org", "Buy credits on Comfy Cloud", icon("plus"), "Buy credits"),
    ),
  );

  const renders = section(
    "Renders on",
    h("div.account-row", {}, h("b", {}, own ? "Your ComfyUI" : "Comfy Cloud"), h("span.hint", {}, host)),
    h("p.hint", {}, jobs ? `${jobs} job${jobs > 1 ? "s" : ""} running` : "Nothing running"),
  );

  const keyBox = editing
    ? h(
        "form.account-edit",
        {
          on: {
            submit: async (e) => {
              e.preventDefault();
              const field = e.target.elements.key;
              if (busy || !field.value.trim()) return;
              busy = true;
              message = "Checking with Comfy…";
              draw();
              try {
                await saveAccountKey(field.value);
                editing = false;
                message = "";
              } catch (error) {
                message = error.message;
              }
              busy = false;
              draw();
            },
          },
        },
        h("input.field", { type: "password", name: "key", autocomplete: "off", spellcheck: "false", placeholder: "Paste your Comfy API key", "aria-label": "Comfy API key" }),
        h(
          "div.account-row",
          {},
          h("button.key.is-primary", { type: "submit", disabled: busy }, "Save"),
          h("button.key.is-quiet", { type: "button", on: { click: () => ((editing = false), (message = ""), draw()) } }, "Cancel"),
        ),
      )
    : null;
  const keySection = section(
    "API key",
    h(
      "div.account-row",
      {},
      icon("key"),
      h("code.account-key", {}, a.key.set ? `•••• ${a.key.last4}` : "none"),
      h("span.hint", {}, a.key.set ? (a.key.source === "settings" ? "saved here" : "from .env") : ""),
      h("span.spacer"),
      !editing && h("button.key.is-quiet", { type: "button", on: { click: () => ((editing = true), (message = ""), draw(), pop.querySelector("input")?.focus(), place()) } }, a.key.set ? "Change" : "Add"),
    ),
    keyBox,
    message && h("p.account-msg", { role: "status", dataset: { tone: busy ? "" : "crit" } }, message),
    h(
      "div.account-row",
      {},
      a.key.source === "settings" && a.key.set && h("button.key.is-quiet", { type: "button", on: { click: async () => ((message = ""), await clearAccountKey().catch((e) => (message = e.message)), draw()) } }, "Use the .env key again"),
      h("span.spacer"),
      link("https://platform.comfy.org/profile/api-keys", "Get a key from Comfy", "Get a key"),
    ),
  );

  const weights = section(
    "Open weights only",
    h("div.account-row", {}, h("b", {}, a.openWeights ? "On" : "Off"), h("span.hint", {}, "COMFYTURE_OPEN_WEIGHTS")),
    h("p.hint", {}, a.openWeights ? "Partner models are kept out, so only open models run." : "Partner models are offered. Set COMFYTURE_OPEN_WEIGHTS in .env to keep them out."),
  );

  pop.replaceChildren(credits, renders, keySection, weights);
  place();
}
