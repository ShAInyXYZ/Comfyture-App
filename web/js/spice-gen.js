// The GEN department: the IC-LoRA suite. Every in-context LoRA Comfy Cloud has for LTX-2.3 is a tool here (server/iclora.ts, the list is
// workflows/ic-loras.json), run on the footage as it was cleaned up: draw it again under its pose, restore it, grade it, take something out,
// widen the frame. Its bentos: TOOL (the one picked: its words, its strength, the size, the seconds, the yellow key), TOOLS (all of them,
// by family, each with what a real run of it showed), TAKES (what was made: any can be put back as the pass, and the examples' own are
// there to look at without a key). Gen reads the footage and never its own last take, so its takes are alternatives, not layers.
// Made once and kept: { el, update, sig, slot }.
import { h } from "./dom.js";
import { state, changed } from "./store.js";
import { spice, edit, setSet, setQuietly, setPass, clearPass, workingOn } from "./spice.js";
import { FIRST, framesIn, genCredits, genRange, addGenTake } from "./spice-model.js";
import { bento, spicon, ghost, primary, iconKey, fill, thumb } from "./spice-ui.js";
import { work, inputFor, serverJob } from "./spice-engines.js";
import { slider, chipRow } from "./utensils-fx-controls.js";
import { registerRunner } from "./spice-runs.js";

const set = () => spice.shot.body.set.gen;
const isClip = () => spice.shot.body.passes.plate?.media.kind === "video";
const footageSeconds = () => {
  const p = spice.shot.body.passes.plate;
  return p?.media.kind === "video" ? (p.media.seconds ?? 5) : 0;
};

// ---------------------------------------------------------------- the suite's tools (the server's list, read once)

let suite = null;
let loading = null;
/** The tools and their families, from the server (api/spice/ic), once; the department draws again when they are there (drawn, not kept: opening a shot changes nothing in it). */
function loadSuite() {
  loading ??= fetch("api/spice/ic")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`The suite's list did not come (${r.status})`))))
    .then((j) => ((suite = j), changed("spice")))
    .catch((e) => ((loading = null), console.warn("gen:", e.message)));
  return loading;
}
const tools = () => suite?.tools ?? [];
const toolOf = (id) => tools().find((t) => t.id === id) ?? null;
/** The tool in use: the one picked, else the first. */
const current = () => toolOf(set().tool) ?? tools()[0] ?? null;

// ---------------------------------------------------------------- what a key needs and costs

/** { why, cost, seconds, tool }: the words that stop the key, or what it costs. */
function plan() {
  const b = spice.shot.body;
  const g = set();
  const t = current();
  const seconds = Math.min(g.seconds ?? 2, genRange("motion", footageSeconds()).max);
  const why = !t ? "The suite's tools are still coming" : !b.passes.plate ? "Bring the footage to the Plate first" : !isClip() ? "The IC-LoRAs work on a clip: a picture has no motion" : t.needs?.length ? `${t.name} needs ${t.needs.join(" and ")}: not offered yet` : "";
  return { why, cost: genCredits(seconds, g.size), seconds, tool: t };
}

/** The clip run through the tool, kept as a take, and the pass. */
async function run() {
  const shot = spice.shot;
  const g = { ...set() };
  const p = plan();
  const t = p.tool;
  const made = await work("gen", t.name, async (progress) => {
    const input = await inputFor("gen", shot);
    const media = await serverJob("api/spice/ic", { video: input.media.file, tool: t.id, scene: g.scene ?? "", words: g.words ?? "", seconds: p.seconds, size: g.size, ...(g.strength ? { strength: g.strength } : {}) })(progress);
    return { files: [{ kind: "video", url: media.url, file: media.file, width: media.width, height: media.height, duration: media.duration }], from: input.from };
  }, { note: `${t.name} · ${String(g.words || t.words || t.prompt || "").slice(0, 70)}`, credits: p.cost, source: "cloud" });
  if (made) {
    edit((b) => {
      b.set.gen = addGenTake(b.set.gen, { id: `g${Date.now().toString(36)}`, at: new Date().toISOString(), tool: t.id, words: g.words || t.words || t.prompt || "", strength: g.strength ?? t.strength, size: g.size, seconds: made.seconds ?? p.seconds, credits: p.cost, media: made });
    }, shot);
  }
  return made;
}

/** What Paprika is told of Gen: the tool in use, the tools there are, and what was set. */
export function genSummary() {
  const g = set();
  return { tool: current()?.id, tools: tools().map((t) => ({ id: t.id, name: t.name, family: t.family, about: t.about, ...(t.needs?.length ? { needs: t.needs } : {}) })), words: g.words, strength: g.strength, size: g.size, seconds: g.seconds, takes: g.takes?.length ?? 0 };
}

registerRunner("gen", () => {
  const p = plan();
  return { label: p.tool ? p.tool.name : "Run the tool", cost: p.cost, why: p.why, run };
});

// ---------------------------------------------------------------- the bentos' bodies

const dot = (t) => h(`i.sp-dot.is-${t.needs?.length ? "needs" : t.status}`, { title: t.needs?.length ? `Needs ${t.needs.join(" and ")}` : t.status === "verified" ? "A real run of it was looked at: it does what its card says (its note says what to expect)" : t.status === "failed" ? "A real run of it did not work: see its note" : "Not run yet" });

function toolBody() {
  const g = set();
  const p = plan();
  const t = p.tool;
  const busy = workingOn("gen");
  if (!t) return h("p.sp-hint", {}, "The suite's tools are coming…");
  const field = (key, label, placeholder, rows) => h("label.sp-gen-field", {}, h("span.ut-label", {}, label), h("textarea.ut-words.sp-words", {
    rows, placeholder, value: g[key] ?? "", "aria-label": label,
    on: { input: (e) => setQuietly("gen", { [key]: e.target.value }), change: () => edit(() => {}) },
  }));
  // a card with a fixed grammar says the shot twice ({scene}) and takes the effect's words ({words}); the others take the words as they are
  const grammar = !!t.template;
  const wordsShown = !grammar || t.template.includes("{words}");
  const sceneShown = grammar && t.template.includes("{scene}");
  const fields = [
    sceneShown ? field("scene", "The shot, described", suite.scene, 2) : null,
    wordsShown ? field("words", grammar ? "The effect" : "What it is told", grammar ? t.words || "" : t.prompt, grammar ? 2 : 3) : null,
  ];
  const r = genRange("motion", footageSeconds());
  const strength = g.strength ?? t.strength;
  return h("div.sp-gen-tool", {},
    h("div.sp-gen-name", {}, dot(t), h("b", {}, t.name), h("em", {}, suite.families.find((f) => f.id === t.family)?.name ?? t.family)),
    h("p.sp-gen-about", {}, t.note ? `${t.about} ${t.note}` : t.about),
    ...fields,
    h("div.sp-gen-pair", {},
      h("div.sp-gen-dial", {}, h("span.ut-label", {}, "Strength"), slider({ value: strength, min: 0, max: 2, step: 0.05, show: (v) => v.toFixed(2), label: "Strength", set: (v, quiet) => (quiet ? setQuietly("gen", { strength: v }) : setSet("gen", { strength: v })) })),
      h("div.sp-gen-dial", {}, h("span.ut-label", {}, "Seconds"), slider({ value: Math.min(g.seconds ?? 2, r.max), min: r.min, max: r.max, step: 1, show: (v) => `${Math.round(v)} s`, label: "Seconds", set: (v, quiet) => (quiet ? setQuietly("gen", { seconds: Math.round(v) }) : setSet("gen", { seconds: Math.round(v) })) }))),
    chipRow([["draft", "Draft", "Shorter side 320: a look, a few credits"], ["standard", "Standard", "Shorter side 544, doubled by the second pass: the one to keep"]], g.size, (v) => setSet("gen", { size: v })),
    h("div.sp-gen-key", {},
      primary({ id: "gen:run", label: "Run it", cost: p.cost, working: !!busy, disabled: !!p.why, title: p.why || `${t.name}: LTX-2.3 on Comfy Cloud`, run }),
      spice.shot.body.passes.gen ? ghost("Start over", () => clearPass("gen"), { icon: spicon("trash"), title: "Take the Gen pass away: the next look starts from the clean-up" }) : null));
}

function toolsBody() {
  const cur = current();
  if (!suite) return h("p.sp-hint", {}, "The suite's tools are coming…");
  return h("div.sp-gen-tools", {}, ...suite.families.map((f) => {
    const list = tools().filter((t) => t.family === f.id);
    return list.length ? h("div.sp-gen-family", {}, h("span.ut-label", { title: f.about }, f.name),
      h("div.sp-gen-chips", {}, ...list.map((t) => h(`button.sp-gen-chip${cur?.id === t.id ? ".is-on" : ""}`, { type: "button", "aria-pressed": String(cur?.id === t.id), title: `${t.name}: ${t.about}`, on: { click: () => setSet("gen", { tool: t.id, words: "", strength: null }) } }, dot(t), h("span", {}, t.name))))) : null;
  }));
}

function takesBody() {
  const g = set();
  const using = spice.shot.body.passes.gen?.media?.url;
  const list = [...(g.takes ?? [])].reverse();
  if (!list.length) return h("p.sp-hint", {}, "What the tools make is kept here: put any take back as the pass, whenever you like.");
  return h("div.sp-gen-takes", {}, ...list.map((t) =>
    h(`div.sp-gen-take${t.media?.url === using ? ".is-on" : ""}`, {},
      thumb(t.media),
      h("div.sp-gen-take-text", {}, h("b", {}, toolOf(t.tool)?.name ?? t.tool), h("span", {}, `${Math.round(t.seconds ?? 0)} s · ${t.size ?? "draft"}${t.example ? " · example" : t.credits ? ` · ${t.credits} cr` : ""}${t.inputLabel ? ` · on ${t.inputLabel}` : ""}`), h("span", {}, String(t.words ?? "").slice(0, 80))),
      iconKey(spicon("check"), t.media?.url === using ? "This is the pass" : "Use this take", () => putBack(t), { pressed: t.media?.url === using }),
      iconKey(spicon("trash"), "Forget this take", () => edit((b) => (b.set.gen.takes = b.set.gen.takes.filter((x) => x.id !== t.id)))))));
}
/** A take put back as the pass: it covers the frames it was made over. */
function putBack(t) {
  const fps = spice.shot.body.passes.plate?.fps ?? 24;
  const from = t.from ?? spice.shot.body.passes.gen?.from ?? FIRST;
  setPass("gen", t.media, { from, to: from + Math.max(1, framesIn(t.media?.seconds ?? t.seconds ?? 2, fps)) - 1, note: `${toolOf(t.tool)?.name ?? t.tool} · ${String(t.words ?? "").slice(0, 60)}`, credits: 0, source: t.example ? "free" : "cloud", ...(t.input ? { before: t.input } : {}) });
}

// ---------------------------------------------------------------- the department

export function genSpace() {
  loadSuite();
  const el = h("div.sp-dept.is-gen.is-wide");
  const slot = h("div.sp-slot");
  const BENTOS = [["tool", "TOOL", "sp-side-b.sp-b-gtool", toolBody], ["tools", "TOOLS", "sp-b-gtools", toolsBody], ["takes", "TAKES", "sp-b-gtakes", takesBody]];
  const bentos = Object.fromEntries(BENTOS.map(([id, title, cls]) => [id, bento(cls, title, null)]));
  const bodies = Object.fromEntries(BENTOS.map(([id]) => [id, h("div.sp-b-body")]));
  for (const [id] of BENTOS) bentos[id].append(bodies[id]);
  el.append(slot, bentos.tool, h("div.sp-lower.is-2", {}, bentos.tools, bentos.takes));
  function update() {
    // (a field being typed in is not drawn over: its words are kept as they are typed)
    if (el.contains(document.activeElement) && document.activeElement.matches("textarea, input")) return false;
    for (const [id, , , body] of BENTOS) fill(bodies[id], body());
  }
  return { el, update, slot, sig: () => JSON.stringify([!!suite, state.account?.target?.kind]) };
}
