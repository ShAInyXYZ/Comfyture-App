import { h, icon, ago } from "../dom.js";
import { float, stick } from "../controls.js";
import { state, loadAccount, saveAccountKey, clearAccountKey, setRenderTarget, testRenderTarget } from "../store.js";

// comfy-api-proxy's own address: the bridge in front of your ComfyUI
const LOCAL = "http://127.0.0.1:8189";
const GUIDE = "docs/guides/LOCAL-COMFYUI.md";

const fmt = (n) => Math.round(n).toLocaleString("en-US");
const usd = (cents) => `$${(cents / 100).toFixed(2)}`;

let pop = null;
let trigger = null;
let unstick = null;
let editing = false;
let message = "";
let busy = false;
// the renders' switch: the side picked (before it is taken), the address typed, and what answered there
let side = null;
let address = "";
let answer = null;
let checking = false;

/** Opens the account settings under the header's button, or closes them. */
export function toggleAccount(button) {
  if (pop) return close();
  trigger = button;
  pop = h("div.menu.account-pop", { role: "dialog", "aria-label": "Comfy account", tabindex: "-1" });
  document.body.append(pop);
  button.setAttribute("aria-expanded", "true");
  editing = false;
  message = "";
  side = null;
  answer = null;
  draw();
  place();
  // opened by the keyboard, the window takes the focus: it sits at the end of the page, a whole page of Tab stops away
  if (button.matches(":focus-visible")) pop.focus({ preventScroll: true });
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

/** The header draws again: so do the settings, unless a key or an address is being typed. */
export function redrawAccount() {
  if (pop && !editing && (!pop.contains(document.activeElement) || document.activeElement === pop)) draw();
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

  // where the renders go: Comfy Cloud, or your own ComfyUI through comfy-api-proxy (the bridge); a local address is checked before it is taken
  const picked = side ?? (own ? "self-hosted" : "comfy-cloud");
  const guide = state.info?.repository ? `${state.info.repository.replace(/\.git$/, "").replace(/^git\+/, "")}/blob/main/${GUIDE}` : GUIDE;
  const choose = (kind) => {
    if (busy || jobs) return;
    side = kind;
    answer = null;
    if (kind === "comfy-cloud" && own) go("comfy-cloud");
    else draw();
  };
  const go = async (kind) => {
    busy = true;
    answer = kind === "comfy-cloud" ? null : { detail: "Checking the bridge…" };
    draw();
    try {
      await setRenderTarget(kind, kind === "comfy-cloud" ? undefined : address || LOCAL);
      side = null;
      answer = kind === "comfy-cloud" ? null : { ok: true, detail: "Renders now go to your ComfyUI." };
    } catch (e) {
      answer = { ok: false, detail: e.message };
    }
    busy = false;
    draw();
  };
  const test = async () => {
    checking = true;
    answer = { detail: "Asking…" };
    draw();
    try {
      answer = await testRenderTarget(address || LOCAL);
    } catch (e) {
      answer = { ok: false, detail: e.message };
    }
    checking = false;
    draw();
  };
  const local = picked === "self-hosted";
  // a judges' copy (COMFYTURE_JUDGE): its key and where it renders are its host's, shown but not changed here
  const judge = !!state.info?.judge;
  const renders = judge
    ? section("Renders on", h("div.account-row", {}, h("b", {}, own ? "Your ComfyUI" : "Comfy Cloud"), h("span.hint", {}, host)),
        a.judge && h("div.account-row", {}, h("b", {}, `${a.judge.renders} render${a.judge.renders === 1 ? "" : "s"} left today`), h("span.hint", {}, `${a.judge.words} answers`)),
        h("p.hint", {}, "A judges' copy: where it renders is set by its host, and renders are counted for each visitor. The examples and the tours are free."))
    : section(
    "Renders on",
    h("div.account-switch", { role: "radiogroup", "aria-label": "Where the renders go" },
      ...[["comfy-cloud", "Comfy Cloud"], ["self-hosted", "Your ComfyUI"]].map(([kind, label]) =>
        h("button", { type: "button", role: "radio", "aria-checked": String(picked === kind), disabled: busy || (!!jobs && picked !== kind), title: jobs ? "Wait for the jobs running to end" : "", on: { click: () => choose(kind) } }, label))),
    local
      ? h("div.account-local", {},
          h("label.account-field", {}, h("span.hint", {}, "The bridge's address (comfy-api-proxy)"),
            h("input.field", { type: "url", value: address || (own ? a.target.url : LOCAL), spellcheck: "false", autocomplete: "off", placeholder: LOCAL, "aria-label": "The bridge's address", on: { input: (e) => ((address = e.target.value.trim()), (answer = null)) } })),
          h("div.account-row", {},
            h("button.key.is-quiet", { type: "button", disabled: checking || busy, on: { click: test } }, checking ? "Asking…" : "Test"),
            h("span.spacer"),
            (!own || (address && address !== a.target.url)) && h("button.key.is-primary", { type: "button", disabled: busy, on: { click: () => go("self-hosted") } }, busy ? "Switching…" : "Use it")),
          answer && h("p.account-msg", { role: "status", dataset: { tone: answer.ok ? "ok" : answer.ok === false ? "crit" : "" } }, answer.detail),
          h("p.hint", {}, "Run ComfyUI with its models, then the bridge in front of it:"),
          h("code.account-cmd", {}, "pip install comfy-api-proxy", h("br"), "comfy-api-proxy run"),
          h("div.account-row", {}, h("span.spacer"), link(guide, "How to set up your own ComfyUI", icon("open"), "The setup guide")))
      : h("div.account-row", {}, h("b", {}, "Comfy Cloud"), h("span.hint", {}, own && side ? "" : host)),
    h("p.hint", {}, jobs ? `${jobs} job${jobs > 1 ? "s" : ""} running: switch once they end` : own && !side ? (a.reach === false ? `Nothing answers at ${host} yet: start the bridge, or pick Comfy Cloud and add a key` : `Rendering on ${host}`) : "Nothing running"),
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
      !editing && !judge && h("button.key.is-quiet", { type: "button", on: { click: () => ((editing = true), (message = ""), draw(), pop.querySelector("input")?.focus(), place()) } }, a.key.set ? "Change" : "Add"),
    ),
    judge && h("p.hint", {}, "A judges' copy: its key is set by its host and never leaves the server."),
    keyBox,
    message && h("p.account-msg", { role: "status", dataset: { tone: busy ? "" : "crit" } }, message),
    h(
      "div.account-row",
      {},
      !judge && a.key.source === "settings" && a.key.set && h("button.key.is-quiet", { type: "button", on: { click: async () => ((message = ""), await clearAccountKey().catch((e) => (message = e.message)), draw()) } }, "Use the .env key again"),
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
