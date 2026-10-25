import { h, icon, sprite } from "../dom.js";
import { state, edit, currentShot, refInfo } from "../store.js";
import { toggle } from "../controls.js";
import { CAMERA_LABELS, TRANSITION_LABELS, compose, finalPrompt, emptyShot, wordBudget, wordCount } from "../script.js";
import { loraWords } from "../loras.js";

const LANGUAGES = ["English", "French", "Spanish", "German", "Italian", "Portuguese", "Polish", "Arabic", "Hindi", "Japanese", "Korean", "Chinese"];
let root;

function seg(options, value, onPick) {
  return h("div.segment.is-inline", { role: "group" },
    Object.entries(options).map(([v, label]) =>
      h("button", { type: "button", "aria-pressed": String(v === value), on: { click: () => onPick(v) } }, label)),
  );
}

/** Refreshes the bits that depend on typed text, without redrawing the fields. */
function refreshLive() {
  const d = state.draft;
  const budget = root.querySelector(".budget");
  if (budget) {
    const used = wordCount(d.script);
    const max = wordBudget(d.seconds);
    budget.classList.toggle("is-over", used > max);
    budget.querySelector("span").textContent = `${used} / ${max} words`;
    const segs = budget.querySelectorAll(".seg i");
    segs.forEach((s, i) => s.classList.toggle("on", i < Math.round((Math.min(used, max) / Math.max(1, max)) * segs.length)));
  }
}

/** One line of the script: what it is on the left, what you write on the right. */
function row(label, side, ...body) {
  return h("div.srow", {},
    h("div.srow-label", {}, h("span.row-label", {}, label), side),
    h("div.srow-body", {}, ...body.filter(Boolean)),
  );
}

const area = (value, placeholder, onInput) =>
  h("textarea.field", { rows: 2, placeholder, value: value ?? "", on: { input: (e) => onInput(e.target.value) } });

/** The camera moves as icon tiles: each icon draws its move, the name is in the tooltip. */
function cameraRow(shot) {
  const pick = (v) => edit(() => Object.assign(currentShot(), { camera: v, cameraText: "" }), "script");
  const tile = (v, label, on, click) =>
    h("button.cam", { type: "button", "aria-pressed": String(on), "aria-label": label, title: label, dataset: { move: v }, on: { click } }, v === "preset" ? icon("sparkle") : sprite(`camera-${v}`));
  const moves = h("div.cams", { role: "group", "aria-label": "Camera movement" },
    Object.entries(CAMERA_LABELS).map(([v, label]) => tile(v, label, shot.camera === v && !shot.cameraText, () => pick(v))),
    // a preset can bring its own move; it shows as a seventh tile while it's in use
    shot.cameraText ? tile("preset", "The preset's own move", true, () => {}) : null,
  );
  return row("Camera", null,
    moves,
    shot.cameraText
      ? h("textarea.field.preset-move", { rows: 2, value: shot.cameraText, "aria-label": "The preset's camera move", on: { input: (e) => edit(() => (currentShot().cameraText = e.target.value)) } })
      : null,
    h("label.ends-on", { title: "Framing — where the camera ends" }, sprite("camera-framing"), h("input.field.is-line", {
      placeholder: "ends on… a medium close-up",
      "aria-label": "Where the camera ends",
      value: shot.framing ?? "",
      on: { input: (e) => edit(() => (currentShot().framing = e.target.value)) },
    })),
  );
}

function dialogueRow(shot) {
  const d = state.draft;
  shot.dialogue ??= [];
  const lines = shot.dialogue.map((line, i) =>
    h("div.line", {},
      h("input.field.is-line", { placeholder: "Who", "aria-label": "Speaker", value: line.speaker ?? "", on: { input: (e) => edit(() => (line.speaker = e.target.value)) } }),
      h("select.field.is-line", { "aria-label": "Language", on: { change: (e) => edit(() => (line.language = e.target.value)) } },
        LANGUAGES.map((l) => h("option", { value: l, selected: (line.language || "English") === l }, l))),
      h("input.field.is-line", {
        placeholder: "What they say",
        "aria-label": "Line",
        value: line.line ?? "",
        on: { input: (e) => { edit(() => (line.line = e.target.value)); refreshLive(); } },
      }),
      h("button.key.is-icon.is-quiet", { type: "button", "aria-label": "Remove line", on: { click: () => edit(() => shot.dialogue.splice(i, 1), "script") } }, icon("close")),
    ));
  const used = wordCount(d.script);
  const max = wordBudget(d.seconds);
  const seg16 = h("div.seg", { dataset: { tone: used > max ? "accent" : "ok" } });
  for (let i = 0; i < 16; i++) seg16.append(h("i", { className: i < Math.round((Math.min(used, max) / Math.max(1, max)) * 16) ? "on" : "" }));
  return row("Says",
    h("div.budget", { className: `budget${used > max ? " is-over" : ""}`, title: "About 2.5 spoken words per second" }, h("span", {}, `${used} / ${max} words`), seg16),
    lines.length ? h("div.dialogue", {}, lines) : h("span.hint", {}, "No one speaks. Add a line to give them a voice."),
    h("div", {}, h("button.key.is-sm", {
      type: "button",
      disabled: shot.dialogue.length >= 6,
      on: { click: () => edit(() => shot.dialogue.push({ speaker: shot.dialogue.at(-1)?.speaker ?? "", language: "English", line: "" }), "script") },
    }, icon("plus"), "Add a line")),
  );
}

/** The shots as a timeline: chips with their share of the length, the cut between them a choice. */
function shotBar() {
  const d = state.draft;
  const n = d.script.shots.length;
  const each = (d.seconds / n).toFixed(1);
  const parts = [];
  d.script.shots.forEach((shot, i) => {
    if (i > 0) {
      parts.push(h("select.chip-select.cut-select", {
        title: `How shot ${i + 1} begins`,
        "aria-label": `Transition into shot ${i + 1}`,
        on: { change: (e) => edit(() => (d.script.shots[i].transition = e.target.value), "script") },
      }, Object.entries(TRANSITION_LABELS).map(([v, l]) => h("option", { value: v, selected: (shot.transition || "hard-cut") === v }, l))));
    }
    parts.push(h("button.shot-chip", { type: "button", "aria-pressed": String(i === d.shot), on: { click: () => edit((x) => (x.shot = i), "script") } },
      h("b", {}, `Shot ${i + 1}`),
      n > 1 ? h("small", {}, `${each} s`) : null,
      n > 1 && i === d.shot
        ? h("span.x", { role: "button", "aria-label": "Remove shot", on: { click: (e) => {
            e.stopPropagation();
            edit((x) => {
              x.script.shots.splice(i, 1);
              x.shot = Math.max(0, i - 1);
            }, "script", "monitor");
          } } }, icon("close"))
        : null));
  });
  parts.push(h("button.shot-add", {
    type: "button",
    disabled: n >= 4,
    title: "LTX-2.5 cuts between shots inside one clip; give each about 3 seconds",
    on: { click: () => edit((x) => {
      x.script.shots.push(emptyShot());
      x.shot = x.script.shots.length - 1;
    }, "script", "monitor") },
  }, icon("plus"), "Add a shot"));
  return h("div.shot-bar", {}, parts);
}

function scriptView() {
  const shot = currentShot();
  return h("div.script-rows", {},
    shotBar(),
    row("Action", null, area(shot.action, "What happens, in order. Lead with the motion.", (v) => edit(() => (shot.action = v)))),
    cameraRow(shot),
    row("Sound", null, area(shot.sound, "Ambience, foley, music. Name what makes each sound.", (v) => edit(() => (shot.sound = v)))),
    dialogueRow(shot),
  );
}

function promptView() {
  const d = state.draft;
  if (d.script.raw) {
    return h("div", {},
      h("textarea.field.prompt-edit", { value: d.script.raw, on: { input: (e) => edit(() => (d.script.raw = e.target.value)) } }),
      h("div.prompt-note", {},
        h("span.hint", {}, "Your text is sent as it is. The script fields are ignored."),
        h("button.key", { type: "button", on: { click: () => edit((x) => (x.script.raw = ""), "script") } }, "Back to the script"),
      ),
    );
  }
  const text = finalPrompt(d.script, { lipsync: !!d.audio?.lipsync, references: refInfo() });
  // the LoRAs' words open it (a style's trigger word first)
  const lead = text && !(d.model && d.model !== "ltx-2.5") ? loraWords(d.loras ?? []) : "";
  return h("div", {},
    h("p.prompt-view", {}, lead ? h("b.prompt-lora", { title: "The LoRAs' own words" }, lead) : null, lead ? " " : null, text || "Write the shot in Script to see the prompt."),
    h("div.prompt-note", {},
      h("span.hint", {}, "This is the exact paragraph sent to LTX-2.5."),
      h("button.key", { type: "button", disabled: !text, on: { click: () => edit((x) => (x.script.raw = compose(x.script)), "script") } }, "Edit as text"),
    ),
  );
}

export function renderScript(el) {
  root = el;
  const d = state.draft;
  const enhancer = h("button", { type: "button" });
  toggle(enhancer, { value: d.enhance, label: "Prompt enhancer", onChange: (v) => edit((x) => (x.enhance = v), "settings") });
  el.replaceChildren(
    h("div.card-head", {},
      h("span.card-label", { role: "heading", "aria-level": "2" }, "Script"),
      h("input.title-input", {
        "aria-label": "Shot name",
        placeholder: "Name this shot",
        value: d.name,
        on: { input: (e) => edit((x) => (x.name = e.target.value || "Untitled shot")) },
      }),
      h("span.spacer"),
      h("label.switch-row", { title: "Expands the script with LTX-2.5's own prompt writer (adds 1–2 minutes)" }, "Prompt enhancer", enhancer),
      seg({ script: "Write", prompt: "Final prompt" }, d.view, (v) => edit((x) => (x.view = v), "script")),
    ),
    d.view === "script" ? scriptView() : promptView(),
  );
}
