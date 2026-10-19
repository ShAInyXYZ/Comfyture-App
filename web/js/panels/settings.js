import { h, icon } from "../dom.js";
import { state, edit, roll } from "../store.js";
import { knob } from "../controls.js";
import { compose } from "../script.js";
import { loraControl } from "../loras.js";

function segment(options, value, onPick, disabled = () => false) {
  return h("div.segment", { role: "group" },
    options.map(([v, label, title]) =>
      h("button", {
        type: "button",
        "aria-pressed": String(v === value),
        disabled: disabled(v),
        title,
        on: { click: () => onPick(v) },
      }, label)),
  );
}

const row = (label, ...control) => [h("span.row-label", {}, label), h("div.row-control", {}, ...control)];

/** What the shot will be made from, in a few words, for the card's header. */
function source(d, video) {
  if (video) return video.mode === "extend" ? "Extends a video" : "Motion from a video";
  if (Object.values(d.refs ?? {}).some(Boolean)) return "From references";
  if (!d.start) return "From the script";
  return d.end || d.paint.trim() ? "Start to end frame" : "From a photo";
}

export function renderSettings(el) {
  const d = state.draft;
  const video = d.startMode === "video" && d.video ? d.video : null;
  const refs = Object.values(d.refs ?? {}).some(Boolean);
  const guided = refs || !!video || !!(d.end || d.keyframes.length || !d.start || (d.paint.trim() && !d.end));
  if (guided && d.quality === "production") d.quality = "standard";
  // a track sets the length; so does the clip whose motion is copied
  const cap = d.audio ? Math.floor(d.audio.duration) : video?.mode === "motion" ? Math.floor(video.duration) : 10;
  const maxSeconds = Math.max(2, Math.min(10, cap));
  if (d.seconds > maxSeconds) d.seconds = maxSeconds;

  const dial = h("button", { type: "button" });
  knob(dial, {
    label: "Length",
    options: Array.from({ length: maxSeconds - 1 }, (_, i) => ({ value: i + 2, label: `${i + 2} seconds` })),
    value: d.seconds,
    onChange: (v) => {
      edit((x) => (x.seconds = v), "monitor", "script");
      el.querySelector(".dial-value").textContent = `${v.toFixed(1)} s`;
    },
  });

  const seed = h("input.field.is-line", {
    type: "number",
    min: 0,
    step: 1,
    value: d.seed,
    disabled: !d.lockSeed,
    "aria-label": "Seed",
    on: { change: (e) => edit((x) => (x.seed = Math.max(0, Math.floor(Number(e.target.value) || 0))), "monitor") },
  });

  const notes = [];
  if (refs) notes.push("References render at 768 × 448.");
  else if (video?.mode === "extend") notes.push("The shot picks up where the clip ends and adds this length to it.");
  else if (video) notes.push(`Copies the clip's ${video.control === "pose" ? "body and face" : "shapes and edges"}${d.start ? " onto the start photo" : ""}, up to ${maxSeconds} s.`);
  else if (!d.start) notes.push("No start frame: the shot is made from the script alone.");
  else if (d.paint.trim() && !d.end) notes.push(d.review ? "Each take paints its last frame first and waits for you." : "Each take paints its last frame first.");
  if (d.audio) notes.push(`Follows the ${d.audio.duration.toFixed(1)} s track, so up to ${maxSeconds} s.`);

  const prompt = compose(d.script);
  const frameLocked = refs || !!video;
  el.replaceChildren(
    h("div.col-head", {}, h("span.col-title", {}, "Shot"), h("span.col-hint", {}, "how it renders"), h("span.col-count", {}, source(d, video))),
    h("div.card.settings-card", {},
    h("div.rows", {},
      ...row("Length",
        h("div.dial-row", {}, dial, h("span.dial-value", {}, `${d.seconds.toFixed(1)} s`), h("span.dial-scale", {}, `2–${maxSeconds} s`))),
      ...row("Frame",
        segment([["auto", "Auto", "Follow the start frame"], ["16:9", "16:9"], ["9:16", "9:16"], ["1:1", "1:1"]],
          frameLocked ? "auto" : d.aspect, (v) => edit((x) => (x.aspect = v), "settings", "monitor"), () => frameLocked)),
      ...row("Quality",
        segment([["draft", "Draft", "Fast, lower resolution"], ["standard", "Standard", "Full resolution"], ["production", "Production", "Keyframes first, a detail pass and 48 fps (start frame only)"]],
          d.quality, (v) => edit((x) => (x.quality = v), "settings"), (v) => (v === "production" && guided) || refs)),
      // LoRAs: only LTX-2.5 takes them
      ...(d.model && d.model !== "ltx-2.5" ? [] : [
        ...row("Style", loraControl({ kinds: ["style", "finish"], value: d.style, label: "Style", note: "A LoRA on LTX-2.5: the whole take in this style",
          onPick: (v) => edit((x) => (x.style = v), "settings", "script"), onStrength: (v) => edit((x) => (x.style.strength = v)) })),
        ...row("Move", loraControl({ kinds: ["motion"], value: d.move, label: "Move", note: "A LoRA on LTX-2.5: a kind of shot it was trained to make",
          onPick: (v) => edit((x) => (x.move = v), "settings", "script"), onStrength: (v) => edit((x) => (x.move.strength = v)) })),
      ]),
      ...row("Takes",
        segment([[1, "1"], [2, "2"], [3, "3"], [4, "4"]], d.takes, (v) => edit((x) => (x.takes = v), "settings"))),
      ...row("Seed",
        h("div.seed-row", {},
          seed,
          h("button.key.is-icon", {
            type: "button",
            "aria-pressed": String(d.lockSeed),
            "aria-label": d.lockSeed ? "Seed locked" : "Seed random",
            title: d.lockSeed ? "Takes use this seed, then +1, +2…" : "Every take gets a random seed",
            on: { click: () => edit((x) => (x.lockSeed = !x.lockSeed), "settings", "monitor") },
          }, icon(d.lockSeed ? "lock" : "unlock")),
          h("button.key.is-icon", {
            type: "button",
            "aria-label": "New seed",
            title: "New seed",
            on: { click: () => edit((x) => {
              x.seed = Math.floor(Math.random() * 2 ** 32);
              x.lockSeed = true;
            }, "settings", "monitor") },
          }, icon("dice")),
        )),
    ),
    h("button.roll", { type: "button", disabled: !prompt, title: prompt ? "Ctrl + Enter" : "Write the shot first", on: { click: roll } },
      icon("play"), `ROLL ${d.takes} TAKE${d.takes > 1 ? "S" : ""}`),
    ...(notes.length ? [h("p.hint.note", {}, notes.join(" "))] : []),
    ),
  );
}
