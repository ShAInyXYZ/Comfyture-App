// Spice's screen. On the left Paprika and THE SHOTS of the scenario open: each a card with the picture of what it is now, its name, how
// many passes it has, and a lamp while a tool works on it; the one open is lit; under them the key that adds a shot (rolled by LTX-2.5
// from a first frame, or a clip brought in), and what is known of the scenario. Beside it THE SUITE (spice-tools.js): the viewer, the
// hero, with its wipe and the chain of passes under it; the tool picked with its words, dials and yellow key; the shelf of tools by
// family; the bin. Paprika's bar docks at the foot of the page. A window opens over the screen for a new shot and for the scenario.
import { h, icon, sprite } from "../dom.js";
import { state, changed, toast, onChange } from "../store.js";
import { currentPage } from "../router.js";
import { dropdown } from "../controls.js";
import { api } from "../api.js";
import { hasPending, takePending, spice, loadScenarios, openScenario, newScenario, removeScenario, rename, shot, openShot, addShot, removeShot, renameShot, setPlate, creditsTodayAll, workingOn, body } from "../spice.js";
import { PAPRIKA } from "../spice-harness.js";
import { lookingAt, outputOf, shotCredits } from "../spice-model.js";
import { setRoom } from "../harnesses.js";
import { createViewer } from "../spice-viewer.js";
import { windowHost, defineWindow, openWin, closeWin } from "../spice-win.js";
import { thumb, spicon, fill, ghost, danger, primary } from "../spice-ui.js";
import { importFootage, pickFile, rollShot, work } from "../spice-engines.js";
import { suiteSpace } from "../spice-tools.js";
import { slider } from "../utensils-fx-controls.js";

// made once and kept: the suite holds its own state (a clip that plays, a slider being dragged)
let suite = null;
let viewer = null;
let host = null;
let shell = null;
let slot = null;

function made() {
  if (!suite) {
    viewer = createViewer({ drop: () => openWin("shot") });
    host = windowHost();
    suite = suiteSpace();
    suite.slot.append(viewer.el);
  }
  return suite;
}

function build(el) {
  made();
  // Paprika's bar docks into this slot; it is the same element every time the page is built, so the bar goes with it
  slot ??= h("div.sp-chat", { id: "spice-chat" });
  const side = h("aside.sp-side", { "aria-label": "Paprika, the VFX house" });
  const grid = h("div.sp-grid", {}, suite.el);
  const main = h("div.sp-main", {}, grid, slot);
  const root = h("div.spice", {}, h("h1.sr-only", {}, "Spice"), side, main, host.el);
  // the app does not draw a page while a field in it is in use: what waited is drawn as soon as the field is left
  root.addEventListener("focusout", (e) => !root.contains(e.relatedTarget) && setTimeout(() => changed("spice"), 0));
  el.replaceChildren(root);
  shell = { el, root, side, grid, last: "", sideSig: "" };
  document.dispatchEvent(new Event("spice:drawn"));
}

// ---------------------------------------------------------------- Paprika and the scenario

function scenarioChip() {
  const sc = spice.scenario;
  return dropdown({
    label: "Scenario",
    value: sc.id,
    items: [
      ...spice.list.map((x) => ({ value: x.id, label: x.name, glyph: () => (x.thumb ? h("img.sel-glyph", { src: x.thumb, alt: "" }) : spicon("film")) })),
      { value: "__new", label: "A new scenario", glyph: () => spicon("plus") },
      { value: "__settings", label: "This scenario", glyph: () => icon("pencil") },
    ],
    // (the chip is drawn again: it shows the scenario that is open, not the key that was chosen)
    onChange: (id) => {
      changed("spice");
      if (id === "__new") return newScenario();
      if (id === "__settings") return openWin("scenario");
      return openScenario(id);
    },
    width: "fill",
  });
}

/** The scenario's own window: its name, its logline, how much it holds, the other scenarios, a new one, its end. */
function scenarioWin() {
  const el = h("div.sp-w.is-scenario");
  function update() {
    const sc = spice.scenario;
    const b = sc.body;
    if (el.contains(document.activeElement) && document.activeElement.matches("input, textarea")) return false;
    const others = spice.list.filter((x) => x.id !== sc.id);
    const passes = b.shots.reduce((n, s) => n + s.passes.length, 0);
    fill(el,
      h("input.field.sp-text", { value: sc.name, "aria-label": "The scenario's name", placeholder: "Truffle's Jam Heist", on: { input: (e) => rename(e.target.value) } }),
      h("textarea.ut-words.sp-words", { rows: 2, value: b.logline, "aria-label": "The logline", placeholder: "One line on what happens", on: { change: (e) => void (b.logline = e.target.value.slice(0, 300), changed("spice")) } }),
      h("div.sp-stats", {}, stat(b.shots.length, b.shots.length === 1 ? "shot" : "shots"), stat(passes, passes === 1 ? "pass" : "passes"), stat(b.log.length, "paid runs")),
      others.length ? h("div.sp-others", {}, h("span.ut-label", {}, "Another scenario"), ...others.map((x) => h("button.sp-other", { type: "button", on: { click: () => (closeWin(), openScenario(x.id)) } }, spicon("film"), h("span", {}, x.name)))) : null,
      h("div.sp-w-foot", {},
        ghost("A new scenario", () => (closeWin(), newScenario()), { icon: spicon("plus") }),
        h("span.spacer"),
        danger({ id: `scenario:${sc.id}`, label: "Delete this scenario", again: "Click again to delete it", run: () => (closeWin(), removeScenario(sc.id)) })),
      h("p.sp-hint", {}, "A scenario keeps its shots and every pass made on them. Deleting it leaves the clips in your library."));
  }
  return { el, update, sig: () => JSON.stringify([spice.scenario?.name, spice.list.map((x) => x.id), spice.scenario?.body.log.length]) };
}
const stat = (n, label) => h("div.sp-stat", {}, h("b", {}, String(n)), h("span", {}, label));
defineWindow("scenario", { eyebrow: "Scenario", title: () => spice.scenario?.name ?? "The scenario", size: "s", make: scenarioWin });

/**
 * The window that adds a shot: a first frame from the library of pictures (or one brought in), the words LTX-2.5 is told of the motion,
 * the seconds, and the key that rolls it (a paid run: it asks first); or a clip brought in as the plate as it is.
 */
function shotWin() {
  const el = h("div.sp-w.is-shot");
  let photos = null;
  let loading = null;
  const loadPhotos = () => (loading ??= api.photos().then((list) => ((photos = list.slice(0, 18)), changed("spice"))).catch(() => (photos = [])));
  async function roll() {
    const r = spice.roll;
    if (!r.frame || !r.words.trim()) return;
    const open = shot();
    // the shot is on the strip at once, its lamp lit while it rolls; a shot open with no plate yet takes the roll
    const s = open && !open.plate ? open : addShot({ name: r.name || undefined, made: { words: r.words, seconds: r.seconds, frame: r.frame, run: "" } });
    closeWin();
    const made = await work(s.id, "Rolling with LTX-2.5", (progress) => rollShot({ frame: r.frame, words: r.words, seconds: r.seconds, name: s.name }, progress));
    if (made) setPlate(made.media, { words: r.words, seconds: r.seconds, frame: r.frame, run: made.run });
    spice.roll = { frame: null, words: "", seconds: 5, name: "" };
    changed("spice");
  }
  function update() {
    if (el.contains(document.activeElement) && document.activeElement.matches("input, textarea")) return false;
    if (!photos) loadPhotos();
    const r = spice.roll;
    const cost = shotCredits(r.seconds);
    fill(el,
      h("div.sp-roll", {},
        h("div.sp-roll-frame", {},
          h("span.ut-label", {}, "The first frame"),
          r.frame ? h("div.sp-roll-pic", {}, h("img", { src: r.frame.url, alt: "" }), h("span", {}, `${r.frame.width} × ${r.frame.height}`)) : h("p.sp-hint", {}, "Pick a picture of the library, or bring one in: LTX-2.5 rolls the shot from it."),
          h("div.sp-roll-pics", {}, ...(photos ?? []).map((p) => h(`button.sp-roll-choice${r.frame?.file === p.file ? ".is-on" : ""}`, { type: "button", title: p.name ?? p.file, "aria-pressed": String(r.frame?.file === p.file), on: { click: () => ((spice.roll = { ...spice.roll, frame: { kind: "image", url: p.url, file: p.file, width: p.width, height: p.height } }), changed("spice")) } }, h("img", { src: p.url, alt: "", loading: "lazy" })))),
          h("div.sp-keys", {}, ghost("Bring a picture", () => pickFile(importFootage, "image/*"), { icon: spicon("upload") }), ghost("Or a clip, as it is", () => pickFile(importFootage, "video/*"), { icon: spicon("film"), title: "A clip from the computer becomes the shot's plate as it is: nothing is rolled" }))),
        h("div.sp-roll-words", {},
          h("label.sp-field", {}, h("span.ut-label", {}, "The shot's name"), h("input.field.sp-text", { value: r.name, placeholder: "SH060 · The getaway", "aria-label": "The shot's name", on: { input: (e) => (spice.roll.name = e.target.value.slice(0, 40)) } })),
          h("label.sp-field", {}, h("span.ut-label", {}, "What happens"), h("textarea.ut-words.sp-words", { rows: 5, value: r.words, placeholder: "Truffle tiptoes across the yard with the jar, glancing over his shoulder; the awnings stir; the camera is locked off.", "aria-label": "What happens", on: { input: (e) => (spice.roll.words = e.target.value.slice(0, 1200)) } })),
          h("div.sp-dial", {}, h("span.ut-label", {}, "Seconds"), slider({ value: r.seconds, min: 2, max: 10, step: 1, show: (v) => `${Math.round(v)} s`, label: "Seconds", set: (v, quiet) => ((spice.roll.seconds = Math.round(v)), !quiet && changed("spice")) })),
          h("div.sp-tool-key", {}, primary({ id: "spice:roll", label: "Roll it with LTX-2.5", cost, disabled: !r.frame || !r.words.trim(), title: !r.frame ? "Pick a first frame" : !r.words.trim() ? "Say what happens" : `LTX-2.5 on Comfy Cloud: ${r.seconds} s at 720p, with its sound`, run: roll })))));
  }
  return { el, update, sig: () => JSON.stringify([spice.roll, photos?.length]) };
}
defineWindow("shot", { eyebrow: "A new shot", title: () => (spice.roll.frame ? "Roll it" : "Add a shot"), size: "l", make: shotWin });

/** The open shot's own window: its name, what it is about, what it was rolled from, its end. */
function shotInfoWin() {
  const el = h("div.sp-w.is-shotinfo");
  function update() {
    const s = shot();
    if (!s) return void fill(el, h("p.sp-hint", {}, "No shot is open."));
    if (el.contains(document.activeElement) && document.activeElement.matches("input, textarea")) return false;
    fill(el,
      h("input.field.sp-text", { value: s.name, "aria-label": "The shot's name", placeholder: "SH010 · The yard", on: { input: (e) => renameShot(s.id, e.target.value) } }),
      h("textarea.ut-words.sp-words", { rows: 2, value: s.about, "aria-label": "What the shot is about", placeholder: "One line on what happens in it", on: { change: (e) => void (s.about = e.target.value.slice(0, 300), changed("spice")) } }),
      s.made?.words ? h("div.sp-field", {}, h("span.ut-label", {}, `Rolled by LTX-2.5, ${s.made.seconds} s`), h("p.sp-hint", {}, s.made.words)) : null,
      h("div.sp-stats", {}, stat(s.passes.length, s.passes.length === 1 ? "pass" : "passes"), stat(s.bin.length, s.bin.length === 1 ? "take in the bin" : "takes in the bin"), stat(s.plate ? `${s.plate.width}×${s.plate.height}` : "–", "plate")),
      h("div.sp-w-foot", {},
        h("span.spacer"),
        danger({ id: `shot:${s.id}`, label: "Delete this shot", again: "Click again to delete it", run: () => (closeWin(), removeShot(s.id)) })),
      h("p.sp-hint", {}, "A shot keeps its plate and every pass made on it. Deleting it leaves the clips in your library."));
  }
  return { el, update, sig: () => JSON.stringify([shot()?.id, shot()?.name, shot()?.about, shot()?.passes.length, shot()?.bin.length]) };
}
defineWindow("shotinfo", { eyebrow: "Shot", title: () => shot()?.name ?? "The shot", size: "s", make: shotInfoWin });

function drawSide() {
  const sc = spice.scenario;
  const b = sc.body;
  const open = shot();
  const credits = creditsTodayAll();
  const working = b.shots.map((s) => workingOn(s.id));
  const sig = JSON.stringify([sc.id, sc.name, spice.list.map((x) => [x.id, x.name]), b.open, b.shots.map((s, i) => [s.id, s.name, s.passes.length, outputOf(s)?.url, working[i]?.progress != null ? 1 : 0]), credits]);
  if (sig === shell.sideSig) return;
  shell.sideSig = sig;
  const passes = b.shots.reduce((n, s) => n + s.passes.length, 0);
  fill(shell.side,
    h("div.sp-id", {},
      h("img", { src: PAPRIKA.portrait, alt: "", draggable: false }),
      h("div.sp-id-text", {}, h("b", {}, PAPRIKA.name), h("span", {}, `· ${PAPRIKA.tag}`)),
      h("button.sp-id-go", { type: "button", title: "Ask Paprika", "aria-label": "Ask Paprika", on: { click: () => document.querySelector("#assistant .composer textarea, #assistant textarea")?.focus() } }, spicon("chev"))),
    h("div.sp-shotchip", {}, scenarioChip()),
    h("nav.sp-shots", { "aria-label": "The shots of the scenario" }, ...b.shots.map((s, i) => {
      const on = s.id === open?.id;
      const w = working[i];
      const n = s.passes.length;
      return h(`div.sp-shot${on ? ".is-on" : ""}${s.plate ? "" : ".is-empty"}`, { dataset: { shot: s.id } },
        h("button.sp-shot-main", { type: "button", "aria-pressed": String(on), title: s.about || s.name, on: { click: () => openShot(s.id) } },
          thumb(outputOf(s)),
          h("span.sp-shot-text", {}, h("b", {}, s.name), h("span", {}, w ? w.label : s.plate ? `${n} ${n === 1 ? "pass" : "passes"}` : "No plate yet")),
          h("span.sp-lamp", { dataset: { tone: w ? "busy" : n ? "done" : "" }, title: w ? `Working: ${w.label}` : n ? `${n} passes` : "Nothing yet" })),
        // the open shot's own window: its name, what it is about, its end
        on ? h("button.sp-shot-more", { type: "button", title: "This shot: its name, what it is about, delete it", "aria-label": `${s.name}: its settings`, on: { click: () => openWin("shotinfo") } }, icon("pencil")) : null);
    }),
    h("button.sp-add", { type: "button", title: "A new shot: rolled by LTX-2.5 from a first frame, or a clip brought in", on: { click: () => openWin("shot") } }, spicon("plus"), h("span", {}, "Add a shot"))),
    h("dl.sp-facts", {},
      fact("Shots · passes", `${b.shots.length} · ${passes}`),
      fact("Compute (Comfy Cloud)", `${credits} cr today`)),
    // what Spice is for, beside the other product that does VFX: a scenario, every pass kept on its chain; one quick fix, Utensils
    h("div.sp-about", {},
      h("p", {}, "Every tool is a workflow on Comfy Cloud, and every pass keeps the clip it ran on: nothing is overwritten."),
      h("a.sp-about-link", { href: "#/utensils", title: "Utensils: one small tool, one job, one result (an upscale, a cutout, a quick removal)" }, sprite("product-utensils"), h("span", {}, "One quick fix? Utensils"))));
}
const fact = (k, v) => h("div", {}, h("dt", {}, k), h("dd", {}, v));

// ---------------------------------------------------------------- the page

// the account comes after the page may have drawn: what it says (open weights only) is drawn too
onChange((scopes) => scopes.has("account") && !scopes.has("spice") && currentPage() === "spice" && changed("spice"));

export function renderSpice(el) {
  loadScenarios();
  // a clip sent from another product (Utensils' VFX) becomes a new shot first
  if (hasPending()) takePending();
  if (!spice.scenario) {
    shell = null;
    // Paprika's bar is not left in the page that is being replaced: it waits at the body until a scenario is open
    const bar = document.getElementById("assistant");
    if (bar && el.contains(bar)) {
      bar.hidden = true;
      document.body.append(bar);
    }
    el.replaceChildren(h("div.sp-boot", {}, h("span.lamp", { dataset: { tone: "busy" } })));
    return;
  }
  if (!shell || shell.el !== el || !el.contains(shell.root)) build(el);
  setRoom("spice", "suite");
  drawSide();
  const s = shot();
  try {
    // the suite is drawn again only when what it shows has changed (open weights only, read with the account, takes the partners' keys away)
    const sig = JSON.stringify([spice.scenario.id, spice.scenario.body, [...spice.busy].map(([k, v]) => [k, Math.round(v.progress * 20)]), spice.armed?.id, !!state.account?.openWeights, suite.sig?.()]);
    if (sig !== shell.last) {
      shell.last = sig;
      if (suite.update() === false) shell.last = "";
    }
    viewer.update({ shot: s, pass: lookingAt(s) });
  } catch (e) {
    console.warn("spice:", e);
  }
  try {
    host.update();
  } catch (e) {
    console.warn("spice window:", e);
  }
}

// a clip or a picture dropped on Spice, or pasted, becomes a shot (a picture: the first frame of one to roll)
const takes = (e) => currentPage() === "spice" && !e.target.closest?.("#assistant, .sp-win");
document.addEventListener("dragover", (e) => takes(e) && e.dataTransfer?.types?.includes("Files") && e.preventDefault());
document.addEventListener("drop", (e) => {
  if (!takes(e) || !e.dataTransfer?.files?.length) return;
  e.preventDefault();
  const f = [...e.dataTransfer.files].find((x) => /^(video|image)\//.test(x.type));
  if (f) importFootage(f);
  else toast("Spice takes a clip or a picture.");
});
document.addEventListener("paste", (e) => {
  if (!takes(e) || e.target.closest?.("input, textarea")) return;
  const f = [...(e.clipboardData?.files ?? [])].find((x) => /^(video|image)\//.test(x.type));
  if (!f) return;
  e.preventDefault();
  importFootage(f);
});
export { removeShot, renameShot };
