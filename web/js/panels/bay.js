// Spice's screen: the AI edit bay (docs/SPICE-V2.md). On the left Paprika, the shot open and THE RAIL: the seven stages a clip goes through
// (conform, select, clean, direct, control, extend, finish), each a row with the picture of its pass, a lamp and what it has spent. On the
// right the viewer (the footage against a take, on a wipe), under it the open stage as two cards: the ENGINES that can do its job (Comfy
// Cloud's models, grouped by what they are for, with their price and their limit), and the form of the one chosen; then the TAKES of the
// stage and the LEDGER. Paprika's bar docks at the foot. Every paid run asks for its price first (bay-ui.js).
import { h, icon } from "../dom.js";
import { changed, state } from "../store.js";
import { dropdown } from "../controls.js";
import { setRoom } from "../harnesses.js";
import {
  bay, loadBays, openShot, newShot, removeShot, rename, setStage, setBrief, setSource, setText, pickEngine, chosen, enginesOfStage, priceNow, problems,
  pickRef, dropRef, importClip, pickClip, conform, exportClip, downloadLedger, run, stopRun, mark, drop, showTake, workingOn, mediaOfSide, hasPending, takePending, loadCatalog, followStep,
} from "../bay.js";
import { STAGES, SAY, PLACEHOLDER, MODES, passOf, takesOf, ledger, creditsOnDay, conformPlan, inputFor, blocked, stageOf, stepDone, engineOf, needsFromForm } from "../spice2-model.js";
import { createViewer } from "../bay-viewer.js";
import { yes, ghost, iconKey, danger, lamp, thumb, fill, card, glyph } from "../bay-ui.js";

const PAPRIKA = { name: "Paprika", tag: "AI editor", face: "brand/cast/paprika-face.webp" };

let shell = null;
let viewer = null;
let slot = null;

function build(el) {
  viewer ??= createViewer();
  slot ??= h("div.bay-chat", { id: "spice-chat" });
  const side = h("aside.bay-side", { "aria-label": "Paprika, the AI editor" });
  const stageCard = h("div.bay-stage");
  const takesCard = h("div.bay-takes");
  const heroNote = h("span.bay-card-note.bay-clipfacts");
  const heroCard = card("bay-hero", "Viewer", viewer.el);
  heroCard.querySelector(".bay-card-head").append(heroNote);
  const grid = h("div.bay-grid", {}, heroCard, stageCard, takesCard);
  const main = h("div.bay-main", {}, grid, slot);
  const root = h("div.bay", {}, h("h1.sr-only", {}, "Spice"), side, main);
  // the app does not draw a page while a field in it is in use: what waited is drawn as soon as the field is left
  root.addEventListener("focusout", (e) => !root.contains(e.relatedTarget) && setTimeout(() => changed("spice"), 0));
  el.replaceChildren(root);
  shell = { el, root, side, stageCard, takesCard, heroNote, last: {} };
  document.dispatchEvent(new Event("spice:drawn"));
}

// ---------------------------------------------------------------- the rail

function shotChip() {
  const s = bay.shot;
  const pic = s.body.clip?.media;
  return dropdown({
    label: "Shot",
    value: s.id,
    items: [
      ...bay.list.map((x) => ({ value: x.id, label: x.name, glyph: () => (x.id === s.id && pic ? thumb(pic, { cls: "is-chip" }) : icon("film")) })),
      { value: "__new", label: "A new shot", glyph: () => icon("plus") },
    ],
    onChange: (id) => {
      changed("spice");
      return id === "__new" ? newShot() : openShot(id);
    },
    width: "fill",
  });
}

function railRow(st) {
  const b = bay.shot.body;
  const working = workingOn(st.id);
  const pass = passOf(b, st.id);
  const n = b.stages[st.id].takes.length;
  const spent = ledger(b).byStage[st.id];
  const on = bay.stage === st.id;
  return h(`button.bay-step${on ? ".is-on" : ""}${pass ? "" : ".is-empty"}`, {
    type: "button", dataset: { stage: st.id }, "aria-pressed": String(on), title: `${st.name} · ${st.verb}`,
    on: { click: () => setStage(st.id) },
  },
    pass ? thumb(pass.media) : h("span.bay-step-icon", {}, glyph(st.icon)),
    h("span.bay-step-text", {}, h("b", {}, st.name), h("small", {}, working ? `${working.label} ${Math.round(working.progress * 100)}%` : n ? `${n} ${n === 1 ? "take" : "takes"}${spent ? ` · ${spent} cr` : ""}` : st.verb)),
    lamp(working ? "busy" : pass ? "done" : "empty"));
}

function drawSide() {
  const s = bay.shot;
  const b = s.body;
  const clip = b.clip;
  const day = creditsOnDay([b, ...bay.list.filter((x) => x.id !== s.id).map((x) => ({ log: x.info?.log ?? [] }))]);
  fill(shell.side,
    h("div.bay-id", {}, h("img", { src: PAPRIKA.face, alt: "", draggable: false }), h("div.bay-id-text", {}, h("b", {}, PAPRIKA.name), h("span", {}, PAPRIKA.tag))),
    h("div.bay-shotchip", {}, shotChip()),
    h("button.bay-classic", { type: "button", title: "The VFX house: FX's compositor and its free bake, Roto, Light, Paint and Comp", on: { click: () => (location.hash = "#/spice", location.reload()) } }, icon("compass"), h("span", {}, "Classic Spice (FX, Roto)"), icon("next")),
    h("div.bay-rail", { role: "group", "aria-label": "The stages" }, STAGES.map(railRow)),
    b.plan.length ? planList(b) : null,
    h("div.bay-facts", {}, fact("This shot", `${ledger(b).spent} cr`), fact("Today", `${day} cr`)),
    h("label.bay-brief", {}, h("span", {}, "What is this shot for?"),
      h("textarea.field", { rows: "3", maxlength: "4000", placeholder: "Taro carries a lantern across the yard at dusk; the van and the sign must go, then rain.", "aria-label": "The brief", on: { input: (e) => setBrief(e.target.value) } }, b.brief)));
}
/** Paprika's plan of the edit: the steps in order, the ones made ticked; a step taken up sets its stage. */
function planList(b) {
  return h("div.bay-planlist", { role: "group", "aria-label": "Paprika's plan" },
    h("span.bay-planlist-label", {}, "Paprika's plan"),
    b.plan.map((p, i) => {
      const done = stepDone(b, p);
      return h(`button.bay-planstep${done ? ".is-done" : ""}`, { type: "button", dataset: { step: String(i) }, title: p.why || stageOf(p.stage).name, on: { click: () => followStep(p) } },
        h("i", {}, done ? icon("check") : String(i + 1)), h("span", {}, h("b", {}, stageOf(p.stage).name), p.engine ? h("small", {}, engineOf(p.engine)?.title ?? p.engine) : null));
    }));
}
const fact = (k, v) => h("div.bay-fact", {}, h("span", {}, k), h("b", {}, v));

// ---------------------------------------------------------------- the stage: engines and form

function sourcePicker(st) {
  const b = bay.shot.body;
  const now = inputFor(b, st.id);
  const options = [{ value: "", label: "Automatic", sub: now ? (now.from === "clip" ? "the footage" : stageOf(now.from).name) : "" }, { value: "clip", label: "The footage" }];
  for (const x of STAGES) if (x.clip && x.id !== st.id && passOf(b, x.id)?.media?.kind === "video") options.push({ value: x.id, label: `${x.name}'s pass` });
  const value = b.stages[st.id].from;
  return h("label.bay-source", {}, h("span", {}, "Works from"),
    h("select.field", { "aria-label": "Works from", on: { change: (e) => setSource(st.id, e.target.value) } }, options.map((o) => h("option", { value: o.value, selected: o.value === value }, o.sub ? `${o.label} (${o.sub})` : o.label))));
}

function engineCard(eng, picked, pickedByPaprika) {
  const est = bay.estimates.get(eng.name);
  const price = eng.partner ? (est?.credits > 0 ? `≈ ${est.credits} cr` : "partner") : "open";
  const on = eng.name === picked?.name;
  return h(`button.bay-engine${on ? ".is-on" : ""}`, {
    type: "button", dataset: { engine: eng.name }, "aria-pressed": String(on), title: eng.about,
    on: { click: () => pickEngine(bay.stage, eng.name) },
  },
    h("b", {}, eng.title),
    h("small", {}, eng.maker || (eng.found ? "new" : "")),
    h("span.bay-engine-tags", {}, eng.max ? h("i", {}, `≤ ${eng.max} s`) : null, h("i", { class: eng.partner ? "is-partner" : "is-open" }, price), on && pickedByPaprika ? h("i.is-pick", {}, "Paprika's pick") : null, eng.found ? h("i.is-new", {}, "new") : null));
}

function stagePanel(st) {
  const b = bay.shot.body;
  const working = workingOn(st.id);
  if (st.local) return conformPanel(st, working);
  const { engines, missing, hidden } = enginesOfStage(st.id);
  const f = bay.form[st.id];
  const picked = chosen(st.id);
  const byPaprika = !!picked && !engines.some((x) => x.name === f.engine);
  const modes = Object.entries(MODES[st.id] ?? {});
  const groups = [...modes.map(([mode, label]) => [mode, label, engines.filter((x) => x.mode === mode)]), ["other", "New in the catalog", engines.filter((x) => x.mode === "other")]].filter(([, , list]) => list.length);
  const ps = problems(st.id);
  const price = priceNow(st.id);
  const need = picked?.needs ?? {};
  // (what the template's own form requires, once it is read, wins over Spice's guess)
  const real = bay.forms.get(picked?.name);
  const formNeed = real ? needsFromForm(real) : null;
  const wantsRefs = need.image || need.images || formNeed?.images;
  return h("div.bay-stage-body", {}, h("div.bay-scroll", {},
    h("div.bay-stage-head", {}, h("span.bay-stage-icon", {}, glyph(st.icon)), h("div", {}, h("h2", {}, st.name), h("p", {}, st.makes)), sourcePicker(st)),
    !bay.catalog && !bay.catalogError ? h("p.bay-note", {}, "Reading Comfy Cloud's templates…") : null,
    bay.catalogError ? h("p.bay-note.is-warn", {}, `Comfy Cloud's catalog could not be read (${bay.catalogError}); the engines shown are the ones Spice knows.`, " ", ghost("Try again", () => ((bay.catalogError = ""), loadCatalog()))) : null,
    h("div.bay-engines", {}, groups.map(([mode, label, list]) => h("div.bay-group", { dataset: { mode } }, h("span.bay-group-label", {}, label), h("div.bay-group-cards", {}, list.map((x) => engineCard(x, picked, byPaprika)))))),
    hidden ? h("p.bay-note", { dataset: { openWeights: "1" } }, `Open weights only is on: ${hidden} partner ${hidden === 1 ? "engine is" : "engines are"} left out, and no credits are spent.`) : null,
    missing.length ? h("p.bay-note", {}, `Not in the catalog now: ${missing.map((x) => x.title).join(", ")}.`) : null,
    picked ? h("p.bay-why", {}, h("b", {}, picked.title), ` ${picked.about}. `, h("em", {}, byPaprika ? `Paprika picks it: ${picked.why}.` : picked.why)) : null,
    h("label.bay-words", {}, h("span", {}, need.text ? "In words" : "Words (optional)"),
      h("textarea.field", { rows: "3", maxlength: "2000", placeholder: PLACEHOLDER[st.id].replace(/^Ask Paprika — /, "e.g. "), "aria-label": "Describe the change", dataset: { words: st.id },
        on: { input: (e) => { setText(st.id, e.target.value); recheck(st.id); } } }, f.text)),
    wantsRefs ? refsRow(st, need, formNeed) : null,
    h("div.bay-problems", { "aria-live": "polite" }, problemList(ps)),
    st.id === "finish" ? exportRow() : null),
    h("div.bay-run", {}, working
      ? h("div.bay-working", {}, h("div.bay-bar", {}, h("i", { style: { width: `${Math.round(working.progress * 100)}%` } })), h("span", {}, `${working.label} · ${Math.round(working.progress * 100)}%`), ghost("Stop", () => stopRun(st.id), { icon: "close" }))
      : yes({ id: `run:${st.id}`, label: picked ? `Run ${picked.title}` : "Pick an engine", price: picked ? price : 0, disabled: !picked || blocked(ps), run: () => run(st.id) })));
}

/** Finish's export, on this machine (free), and the ledger to keep. */
function exportRow() {
  const o = bay.exporting;
  const pick = (label, key, list) => h("label.bay-export-field", {}, h("span", {}, label), h("select.field", { "aria-label": label, on: { change: (e) => (o[key] = e.target.value) } }, list.map(([v, t]) => h("option", { value: v, selected: o[key] === v }, t))));
  return h("div.bay-export", {}, h("span.bay-refs-label", {}, "Export (free, on this machine)"),
    h("div.bay-export-row", {}, pick("Format", "format", [["mp4", "MP4"], ["webm", "WebM"], ["mov", "MOV"]]), pick("Height", "height", [["0", "As it is"], ["720", "720"], ["1080", "1080"], ["1440", "1440"]]),
      ghost("Export", () => exportClip(), { icon: "download", title: "Write the clip Finish works from as a file of this format" }),
      ghost("Ledger", downloadLedger, { icon: "key", title: "Save what was run and what it cost as a text file" })));
}

function refsRow(st, need, formNeed) {
  const f = bay.form[st.id];
  const must = formNeed ? formNeed.images : need.image === true && !need.video ? Math.max(1, need.images ?? 1) : 0;
  return h("div.bay-refs", {}, h("span.bay-refs-label", {}, need.images > 1 ? `Pictures (${need.images})` : need.image === true ? "A picture it needs" : "A picture it can use"),
    h("div.bay-refs-row", {},
      f.refs.map((m, i) => h("span.bay-ref", {}, thumb(m), h("button", { type: "button", title: "Take it off", "aria-label": "Take the picture off", on: { click: () => dropRef(st.id, i) } }, icon("close")))),
      h("button.bay-ref-add", { type: "button", title: "Add a picture", on: { click: () => pickRef(st.id) } }, icon("plus"), must && f.refs.length < must ? h("small", {}, `${must - f.refs.length} more`) : null)));
}

const problemList = (ps) => ps.map((p) => h(`p.bay-problem.is-${p.level}`, {}, icon(p.level === "stop" ? "close" : "info"), h("span", {}, p.text)));
/** The problems of the open stage, redrawn without drawing the stage (a field is being typed in). */
function recheck(id) {
  const box = shell?.stageCard.querySelector(".bay-problems");
  if (box) fill(box, problemList(problems(id)));
  const key = shell?.stageCard.querySelector(".bay-primary");
  if (key) key.disabled = blocked(problems(id));
}

function conformPanel(st, working) {
  const b = bay.shot.body;
  const clip = b.clip;
  const plan = clip ? conformPlan(clip) : [];
  const said = { rate: "Rate", size: "Size", length: "Length" };
  return h("div.bay-stage-body", {}, h("div.bay-scroll", {},
    h("div.bay-stage-head", {}, h("span.bay-stage-icon", {}, glyph(st.icon)), h("div", {}, h("h2", {}, st.name), h("p", {}, st.makes))),
    clip ? h("div.bay-plan", {}, plan.length ? plan.map((p) => h("p.bay-plan-row", {}, h("span", {}, said[p.what]), h("b", {}, `${p.from} → ${p.to}${p.what === "length" ? " s" : p.what === "rate" ? " fps" : ""}`))) : h("p.bay-plan-row.is-ready", {}, icon("check"), h("span", {}, "The clip is ready for the editors as it is.")))
      : h("p.bay-note", {}, "Most editors take clips of up to ten seconds at about 24 fps. Bring the clip and Spice says what to change."),
    h("p.bay-why", {}, "Conform runs on this machine (free). Its result is the clip the next stages work from.")),
    h("div.bay-run", {}, working
      ? h("div.bay-working", {}, h("div.bay-bar", {}, h("i", { style: { width: `${Math.round(working.progress * 100)}%` } })), h("span", {}, `${working.label} · ${Math.round(working.progress * 100)}%`), working.cancel ? ghost("Stop", () => stopRun(st.id), { icon: "close" }) : null)
      : h("div.bay-run-row", {}, ghost(clip ? "Replace the clip" : "Bring a clip", pickClip, { icon: "upload" }), yes({ id: "conform", label: plan.length ? "Conform it" : "Re-encode as it is", price: 0, disabled: !clip, run: () => conform() }))));
}

// ---------------------------------------------------------------- takes and ledger

function takeRow(st, t) {
  const b = bay.shot.body;
  const marked = b.stages[st.id].mark === t.id;
  const on = bay.wipe.b?.id === t.id;
  return h(`div.bay-take${marked ? ".is-marked" : ""}${on ? ".is-shown" : ""}${t.state === "failed" ? ".is-failed" : ""}`, { dataset: { take: t.id } },
    h("button.bay-take-pic", { type: "button", title: "Show it on the right of the wipe", disabled: t.state === "failed", on: { click: () => showTake(st.id, t.id) } }, thumb(t.media)),
    h("div.bay-take-text", {}, h("b", {}, t.title || t.engine), h("small", {}, t.state === "failed" ? t.note || "It did not work." : (t.prompt || t.note || "No words").slice(0, 90)),
      h("small.bay-take-meta", {}, `${t.source === "example" ? "example result" : t.credits ? `${t.credits} cr` : "free"}${t.seconds && t.source !== "example" ? ` · ${Math.round(t.seconds)} s` : ""}`)),
    h("div.bay-take-keys", {},
      t.state === "failed" ? null : iconKey("check", marked ? "This is the stage's pass" : "Make it the stage's pass", () => mark(st.id, t.id), { pressed: marked, cls: marked ? "is-lit" : "" }),
      danger({ id: `drop:${t.id}`, label: "Delete the take", again: "Delete it", compact: true, run: () => drop(st.id, t.id) })));
}

function drawTakes(st) {
  const b = bay.shot.body;
  const all = b.stages[st.id].takes.slice().reverse();
  return [
    h("div.bay-card-head", {}, h("span.bay-card-label", {}, `${st.name} takes`), h("span.bay-card-note", {}, all.length ? `${takesOf(b, st.id).length} kept` : "none yet")),
    all.length ? h("div.bay-take-list", {}, all.map((t) => takeRow(st, t))) : h("p.bay-empty", {}, `Every run of ${st.name} is kept here, whether it worked or not. ${SAY[st.id]}`),
  ];
}

// ---------------------------------------------------------------- the viewer's two sides

function viewerSides() {
  const b = bay.shot.body;
  const st = stageOf(bay.stage);
  // the right of the wipe: the take picked, else the open stage's pass
  let right = bay.wipe.b ? mediaOfSide(bay.wipe.b, b) : null;
  let rightName = bay.wipe.b ? `${stageOf(bay.wipe.b.stage).name} take` : "";
  if (!right) {
    const p = passOf(b, bay.stage);
    right = p?.media ?? null;
    rightName = p ? `${st.name} pass` : "";
  }
  const input = inputFor(b, bay.stage);
  const left = input?.media ?? b.clip?.media ?? null;
  return { left, right: right && right !== left ? right : null, names: [input && input.from !== "clip" ? `${stageOf(input.from).name} pass` : "Footage", rightName] };
}

// ---------------------------------------------------------------- the page

export function renderBay(el) {
  loadBays();
  if (hasPending()) takePending();
  if (!bay.shot) {
    shell = null;
    const barEl = document.getElementById("assistant");
    if (barEl && el.contains(barEl)) {
      barEl.hidden = true;
      document.body.append(barEl);
    }
    el.replaceChildren(h("div.bay-boot", {}, h("span.lamp", { dataset: { tone: "busy" } })));
    return;
  }
  if (!shell || shell.el !== el || !el.contains(shell.root)) build(el);
  const st = stageOf(bay.stage);
  setRoom("spice", bay.stage);
  const busy = [...bay.busy].map(([k, v]) => [k, Math.round(v.progress * 50)]);
  const sig = (...x) => JSON.stringify([bay.shot.id, bay.stage, busy, bay.armed?.id, ...x]);
  const b = bay.shot.body;
  const parts = {
    side: sig(b, bay.list.length, bay.shot.name),
    stage: sig(b.clip, b.stages[bay.stage], b.log.length, state.account?.openWeights, bay.form[bay.stage], bay.catalog?.length, bay.catalogError, [...bay.estimates], bay.forms.size, b.brief ? 1 : 0),
    takes: sig(b.stages[bay.stage], bay.wipe),
  };
  const draw = (key, fn) => {
    if (parts[key] === shell.last[key]) return;
    shell.last[key] = parts[key];
    fn();
  };
  try {
    draw("side", drawSide);
    draw("stage", () => fill(shell.stageCard, card("bay-stage-card", `${st.name} · ${st.verb}`, stagePanel(st))));
    draw("takes", () => fill(shell.takesCard, h("section.bay-card.bay-takes-card", {}, ...drawTakes(st))));
    const c = b.clip;
    shell.heroNote.textContent = c ? `${c.media.width ?? "?"}×${c.media.height ?? "?"} · ${c.fps} fps · ${Math.round((c.media.seconds ?? 0) * 10) / 10} s` : "no clip yet";
    viewer.update({ ...viewerSides(), onDrop: importClip });
  } catch (e) {
    console.warn("spice:", e);
  }
}
