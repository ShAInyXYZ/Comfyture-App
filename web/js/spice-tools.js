// The suite's tools on the page: the registry read from the server (api/spice/tools), the one picked and how it is set up, what a run
// would cost and why it cannot run yet, the run itself (a pass of the shot), and what is drawn of them: the one bento beside the viewer
// (PAPRIKA: what to do next, her chains, or the tool picked with its words, its dials and the yellow key), the library of tools (a window:
// every tool a card with the picture of a real run, by family, searched), and the bin (the takes taken off the chain, in a window).
import { h } from "./dom.js";
import { state, changed } from "./store.js";
import { spice, shot as openShot, inputOf, looking_, setTool, setQuietly, addPass, putBack, forget, workingOn } from "./spice.js";
import { priceOf, newId, boxWords } from "./spice-model.js";
import { bento, spicon, primary, ghost, iconKey, fill, thumb } from "./spice-ui.js";
import { openWin, closeWin } from "./spice-win.js";
import { work, runTool } from "./spice-engines.js";
import { slider, chipRow } from "./utensils-fx-controls.js";

let loading = null;
/** The tools and their families, from the server, once; the page draws again when they are there. */
export function loadTools() {
  loading ??= fetch("api/spice/tools")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`The suite's list did not come (${r.status})`))))
    .then((j) => ((spice.tools = j), changed("spice")))
    .catch((e) => ((loading = null), console.warn("spice:", e.message)));
  return loading;
}
export const tools = () => spice.tools?.tools ?? [];
export const toolOf = (id) => tools().find((t) => t.id === id) ?? null;
/** The tool picked: the one set, else none. */
export const current = () => toolOf(spice.set.tool);
const familyOf = (id) => spice.tools?.families.find((f) => f.id === id);
/** The tools of the suite as a shelf: each family with its tools, in the registry's order, empty families left out. */
export const shelf = () => (spice.tools?.families ?? []).map((f) => ({ ...f, tools: tools().filter((t) => t.family === f.id) })).filter((f) => f.tools.length);

/** The shot described, for a card with a fixed grammar: the words it was rolled from, else what it is about. */
export const sceneOf = (shot) => (shot?.made?.words || shot?.about || "").trim();

/** Why a partner's template cannot run here: open weights only is on (COMFYTURE_OPEN_WEIGHTS), and the server would refuse it. */
const partnerOff = (t) => (t?.partner && state.account?.openWeights ? `Open weights only is on, and ${t.name} is ${t.partner}'s model` : "");

/** { why, cost, seconds, tool, input }: the words that stop the key, or what a run costs. */
export function plan() {
  const s = openShot();
  const t = current();
  const input = inputOf();
  const g = spice.set;
  const seconds = Math.min(10, Math.max(1, g.seconds ?? Math.round(input?.seconds ?? 5)));
  const words = (g.words ?? "").trim();
  const why = !spice.tools ? "The suite's tools are still coming" : !t ? "Pick a tool" : !s ? "Add a shot first" : !input ? "The shot has no plate yet: roll one or drop a clip" : input.kind !== "video" ? "The tools work on a clip" : t.needs?.length ? `${t.name} needs ${t.needs.join(" and ")}: not offered yet` : partnerOff(t) || ((t.id === "cutout" || t.id === "sound") && !words ? (t.id === "cutout" ? "Name what to cut out" : "Say what the sound is") : t.kind === "iclora" && !t.grammar && !t.prompt && !words && !sceneOf(s) ? "Say what it is told: this shot has no words of its own" : "");
  return { why, cost: t ? priceOf(t, { seconds, size: g.size }) : null, seconds, tool: t, input, shot: s };
}

/** The clip run through the tool picked: kept as a pass of the shot, on the pass looked at. (rethrow: a failure is thrown, not toasted.) */
export async function run({ rethrow = false } = {}) {
  const p = plan();
  if (p.why || !p.tool) return null;
  const t = p.tool;
  const g = { ...spice.set };
  const on = looking_()?.id ?? null;
  const shotId = p.shot.id;
  const body = { video: p.input.file, tool: t.id, words: g.words ?? "", scene: (g.scene ?? "").trim() || sceneOf(p.shot), seconds: p.seconds, size: g.size, ...(g.strength ? { strength: g.strength } : {}), ...(t.takes.includes("aspect") ? { aspect: g.aspect } : {}), ...(t.takes.includes("height") ? { height: g.height } : {}), ...(t.takes.includes("region") && g.region ? { region: g.region } : {}) };
  const made = await work(shotId, t.name, (progress) => runTool(body, progress), { rethrow });
  if (!made) return null;
  const { extra, credits, ...media } = made;
  const pass = { id: newId("p"), tool: t.id, name: t.name, words: g.words || "", params: { size: g.size, ...(g.strength ? { strength: g.strength } : {}), seconds: p.seconds, ...(t.takes.includes("aspect") ? { aspect: g.aspect } : {}), ...(t.takes.includes("height") ? { height: g.height } : {}), ...(t.takes.includes("region") && g.region ? { region: g.region } : {}) }, on, input: p.input, media, credits: typeof credits === "number" && credits > 0 ? credits : p.cost ?? 0, at: new Date().toISOString(), note: "", source: "cloud", ...(extra ? { extra } : {}) };
  addPass(shotId, pass);
  return media;
}

/** What Paprika is told of the suite: the tools there are, the one picked and its setup, the key. */
export function toolsSummary() {
  const p = plan();
  const g = spice.set;
  return {
    tools: tools().map((t) => ({ id: t.id, name: t.name, family: t.family, about: t.about, takes: t.takes, status: t.status, ...(t.needs?.length ? { needs: t.needs } : {}) })),
    tool: { id: g.tool, words: g.words, scene: g.scene, strength: g.strength, size: g.size, seconds: g.seconds, aspect: g.aspect, height: g.height },
    run: p.tool ? { label: p.tool.name, cost: p.cost, ready: !p.why, why: p.why } : null,
  };
}

// ---------------------------------------------------------------- the bentos' bodies

const dot = (t) => h(`i.sp-dot.is-${t.needs?.length ? "needs" : t.status}`, { title: t.needs?.length ? `Needs ${t.needs.join(" and ")}` : t.status === "verified" ? "A real run of it was looked at: it does what its card says" : t.status === "failed" ? "A real run of it did not work: see its note" : "Not run yet" });

const ASPECTS = [[2.39, "Scope 2.39", "A wide cinema frame"], [1.7778, "16:9", "A wide screen"], [1, "Square", "A square frame"], [0.5625, "9:16", "A tall phone frame"]];

export function toolBody() {
  const g = spice.set;
  const p = plan();
  const t = p.tool;
  const busy = p.shot ? workingOn(p.shot.id) : null;
  if (!spice.tools) return h("p.sp-hint", {}, "The suite's tools are coming…");
  if (!t) return h("div.sp-tool", {}, h("p.sp-hint", {}, "Pick a tool on the shelf: every one is a workflow on Comfy Cloud, run on the pass you are looking at. Its words, its dials and its price come here."));
  const field = (key, label, placeholder, rows) => h("label.sp-field", {}, h("span.ut-label", {}, label), h("textarea.ut-words.sp-words", {
    rows, placeholder, value: g[key] ?? "", "aria-label": label,
    on: { input: (e) => setQuietly({ [key]: e.target.value }), change: () => changed("spice") },
  }));
  const fields = [
    t.grammar ? field("scene", "The shot, described", sceneOf(p.shot) || "The shot in a sentence: who, where, the light", 2) : null,
    t.takes.includes("words") ? field("words", t.grammar ? "The effect" : t.id === "cutout" ? "Who, or what, to cut out" : t.id === "sound" ? "What is heard" : "What it is told", t.grammar ? t.words || "" : t.prompt || t.hint || "", t.grammar ? 2 : 3) : null,
    // (a tool with no words of its own is told the shot's, when the field is left empty)
    t.takes.includes("words") && !t.grammar && !t.prompt && !(g.words ?? "").trim() && sceneOf(p.shot) && t.id !== "cutout" && t.id !== "sound" ? h("p.sp-hint.sp-fine", {}, `Left empty, it is told the shot's own words: “${sceneOf(p.shot).slice(0, 72)}…”`) : null,
  ];
  const seconds = g.seconds ?? Math.round(p.input?.seconds ?? 5);
  const ic = t.kind === "iclora";
  return h("div.sp-tool", {},
    h("div.sp-tool-name", {}, dot(t), h("b", {}, t.name), h("em", {}, familyOf(t.family)?.name ?? t.family)),
    h("p.sp-tool-about", {}, t.note ? `${t.about} ${t.note}` : t.about),
    ...fields,
    ic ? h("div.sp-pair", {},
      h("div.sp-dial", {}, h("span.ut-label", {}, "Strength"), slider({ value: g.strength ?? t.strength ?? 1, min: 0, max: 2, step: 0.05, show: (v) => v.toFixed(2), label: "Strength", set: (v, quiet) => (quiet ? setQuietly({ strength: v }) : setTool({ strength: v })) })),
      h("div.sp-dial", {}, h("span.ut-label", {}, "Seconds"), slider({ value: Math.min(10, seconds), min: 1, max: Math.min(10, Math.max(1, Math.round(p.input?.seconds ?? 10))), step: 1, show: (v) => `${Math.round(v)} s`, label: "Seconds", set: (v, quiet) => (quiet ? setQuietly({ seconds: Math.round(v) }) : setTool({ seconds: Math.round(v) })) }))) : null,
    ic ? chipRow([["draft", "Draft", "Shorter side 320: a look, a credit or two"], ["standard", "Standard", "Shorter side 544, doubled by the second pass: the one to keep"]], g.size, (v) => setTool({ size: v })) : null,
    t.takes.includes("aspect") ? h("div.sp-field", {}, h("span.ut-label", {}, "Widen to"), chipRow(ASPECTS.map(([v, l, about]) => [String(v), l, about]), String(g.aspect), (v) => setTool({ aspect: Number(v) }))) : null,
    t.takes.includes("height") ? h("div.sp-field", {}, h("span.ut-label", {}, "Lines"), chipRow([["720", "720", ""], ["1080", "1080", ""], ["1440", "1440", ""]], String(g.height), (v) => setTool({ height: Number(v) }))) : null,
    t.takes.includes("region") ? h("div.sp-field.sp-box-field", {}, h("span.ut-label", {}, "The box"), h("p.sp-hint", {}, `${boxWords(g.region ?? t.region ?? { x: 0.35, y: 0.35, w: 0.3, h: 0.3 })}: drawn green on the viewer, drag it over what to fill, its corner to size it.`, g.region ? h("button.sp-link-ask", { type: "button", on: { click: () => setTool({ region: null }) } }, "Put it back.") : null)) : null,
    h("div.sp-tool-key", {},
      primary({ id: "spice:run", label: "Run it", cost: p.cost, working: !!busy, disabled: !!p.why, title: p.why || `${t.name}: ${t.kind === "iclora" ? "an IC-LoRA of LTX-2.3" : t.kind === "template" ? "a template of Comfy Cloud" : "the app's own graph"} on Comfy Cloud`, run })));
}

/** The library: every tool a card with the picture of a real run of it on our own footage (what it was given beside what it made), by family; `q` keeps the ones whose name, family or words have it. A card picks the tool and closes the window. */
export function toolsBody(q = "") {
  const cur = current();
  if (!spice.tools) return h("p.sp-hint", {}, "The suite's tools are coming…");
  const words = q.trim().toLowerCase();
  const fits = (t, f) => !words || `${t.name} ${t.id} ${f.name} ${t.about} ${t.status}`.toLowerCase().includes(words);
  const families = shelf().map((f) => ({ ...f, tools: f.tools.filter((t) => fits(t, f)) })).filter((f) => f.tools.length);
  if (!families.length) return h("p.sp-hint", {}, `No tool has “${q.trim()}” on its card. Try a word of what you want: sharpen, night, widen, sound.`);
  return h("div.sp-tools", {}, ...families.map((f) =>
    h("div.sp-family", {}, h("span.ut-label", { title: f.about }, f.name),
      h("div.sp-cards", {}, ...f.tools.map((t) => h(`button.sp-card${cur?.id === t.id ? ".is-on" : ""}${t.needs?.length ? ".is-needs" : ""}`, { type: "button", "aria-pressed": String(cur?.id === t.id), title: t.needs?.length ? `${t.name}: needs ${t.needs.join(" and ")}, not offered yet` : `${t.name}: ${t.about}`, on: { click: () => (setTool({ tool: t.id, words: "", strength: null, seconds: null }), closeWin()) } },
        t.preview ? h("span.sp-card-pic", {}, h("img", { src: t.preview, alt: `${t.name}: what it was given, and what it made`, loading: "lazy", draggable: false })) : h("span.sp-card-pic.is-none", {}, h("span", {}, t.needs?.length ? "Needs more than a clip" : t.status === "failed" ? "Did not work on a real run" : "No run yet")),
        h("span.sp-card-text", {}, dot(t), h("b", {}, t.name), h("span", {}, t.about))))))));
}

/** The library's window: a search field, what the dots mean, and the cards. */
export function toolsWindow() {
  let q = "";
  const list = h("div.sp-tools-list");
  const field = h("input.sp-search", { type: "search", placeholder: "Find a tool: sharpen, night, widen, sound…", "aria-label": "Find a tool", autocomplete: "off", on: { input: (e) => ((q = e.target.value), fill(list, toolsBody(q))) } });
  const legend = h("p.sp-hint.sp-legend", {}, h("i.sp-dot.is-verified"), " did what its card says on a real run", h("i.sp-dot.is-failed"), " did not", h("i.sp-dot.is-untested"), " not run yet", h("i.sp-dot.is-needs"), " needs more than a clip");
  const el = h("div.sp-w.is-tools", {}, h("div.sp-tools-head", {}, field, legend), list);
  return { el, update: () => fill(list, toolsBody(q)), sig: () => JSON.stringify([!!spice.tools, spice.set.tool]) };
}

export function binBody() {
  const s = openShot();
  const list = s ? [...s.bin].reverse() : [];
  if (!list.length) return h("p.sp-hint", {}, "A pass taken off the chain waits here with what was made on top of it: put it back and the chain is rebuilt to where it was made.");
  return h("div.sp-bin", {}, ...list.map((t) =>
    h("div.sp-take", {},
      thumb(t.media),
      h("div.sp-take-text", {}, h("b", {}, t.name || t.tool), h("span", {}, `${Math.round(t.media.seconds ?? 0)} s${t.params?.size ? ` · ${t.params.size}` : ""}${t.example ? " · example" : t.credits ? ` · ${t.credits} cr` : ""}`), h("span", {}, String(t.words ?? "").slice(0, 80))),
      iconKey(spicon("undo"), "Put it back on the chain", () => putBack(t.id)),
      iconKey(spicon("trash"), "Forget this take (its clip stays in the library)", () => forget(t.id)))));
}

/** What is next for the shot: Paprika's read and her chains; or, once a tool is picked, its card with the way back to them. */
function nextBody(guide) {
  const t = current();
  if (t) return h("div.sp-next.has-tool", {}, h("div.sp-next-row", {}, ghost("Her chains", () => setTool({ tool: null, words: "", strength: null, seconds: null, region: null }), { icon: spicon("prev"), title: "Back to what Paprika proposes for the shot", cls: "sp-back" })), toolBody());
  guide.update();
  return h("div.sp-next", {}, guide.body);
}

/**
 * The suite beside the viewer: one bento, PAPRIKA, with what is next for the shot (her read and her chains, or the tool picked) and, in
 * its head, the key that opens the library. Made once and kept: { el, update, sig, slot }. The library and the bin are windows.
 */
export function suiteSpace(guide) {
  loadTools();
  const el = h("div.sp-suite");
  const slot = h("div.sp-slot");
  const body = h("div.sp-b-body");
  const next = bento("sp-b-next", "PAPRIKA", null, body);
  // the library's key, in the head beside her name: seen at a glance whatever the panel scrolls to
  const browse = ghost("Tools", () => openWin("tools"), { icon: spicon("layers"), title: "The library: every tool of the suite as a card, what a real run of it was given and what it made", cls: "sp-browse" });
  next.querySelector(".sp-b-head").append(browse);
  el.append(slot, h("div.sp-right", {}, next));
  function update() {
    // (a field being typed in is not drawn over: its words are kept as they are typed)
    if (el.contains(document.activeElement) && document.activeElement.matches("textarea, input")) return false;
    browse.querySelector("span").textContent = tools().length ? `${tools().length} tools` : "Tools";
    fill(body, nextBody(guide));
  }
  return { el, update, slot, sig: () => JSON.stringify([!!spice.tools, spice.set, state.account?.target?.kind, !!state.account?.openWeights, guide.sig()]) };
}
