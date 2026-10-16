import { h, icon, sprite } from "../dom.js";
import { imageFrom } from "../photo.js";
import {
  state, edit, setFrame, useSample, clearFrame, addKeyframe, paintEnd, setRef, clearRef, hasRefs, setAudio, clearAudio,
  setVideo, clearVideo, openImage,
} from "../store.js";
import { view } from "../viewer.js";
import { currentPage } from "../router.js";
import { toggle } from "../controls.js";

let root;
/** What the open tab's video does, if it starts from one. */
const videoMode = () => (state.draft.startMode === "video" && state.draft.video ? state.draft.video.mode : null);
// Start is always open; of the others, one at a time (the one you opened last)
const OPEN_KEY = "comfyture.card.v1";
let openCard = (() => {
  try {
    return localStorage.getItem(OPEN_KEY);
  } catch {
    return null;
  }
})();

const JOB_LABEL = { paint: "Painting the last frame…", generate: "Generating…", edit: "Editing…", cutout: "Cutting out…" };
const REF_HINTS = { cast: "Who: a chef in a white jacket", prop: "What: red sneakers", location: "Where: a harbor at dusk" };

const rerender = () => root && renderSources(root);

function setOpen(key, value) {
  openCard = value ? key : null;
  try {
    if (openCard) localStorage.setItem(OPEN_KEY, openCard);
    else localStorage.removeItem(OPEN_KEY);
  } catch {
    // only a convenience
  }
  rerender();
}

function pickFile(id, onFile) {
  const input = document.getElementById(id);
  input.value = "";
  input.onchange = () => input.files[0] && onFile(input.files[0]);
  input.click();
}
const pickImage = (onFile) => pickFile("file-image", onFile);

function droppable(el, onFile, kind = "image") {
  el.addEventListener("dragover", (e) => {
    e.preventDefault();
    el.classList.add("is-drop");
  });
  el.addEventListener("dragleave", () => el.classList.remove("is-drop"));
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    el.classList.remove("is-drop");
    const files = [...(e.dataTransfer?.files ?? [])];
    const file = kind === "image" ? imageFrom(e.dataTransfer)
      : kind === "video" ? files.find((f) => f.type.startsWith("video/"))
      : files.find((f) => f.type.startsWith("audio/") || f.type.startsWith("video/"));
    if (file) onFile(file);
  });
  return el;
}

function busy(job) {
  const seg = h("div.seg", { dataset: { tone: "accent" } });
  for (let i = 0; i < 16; i++) seg.append(h("i", { className: i / 16 < (job.progress ?? 0) ? "on" : "" }));
  return h("div.busy", {}, h("span.label", {}, JOB_LABEL[job.kind] ?? "Working…"), seg);
}

function media(photo, { job, onFile } = {}) {
  const box = h("div.media", {}, photo ? h("img", { src: photo.url, alt: "", draggable: false }) : null, job ? busy(job) : null);
  if (photo) box.addEventListener("click", () => view(photo.url));
  if (onFile) droppable(box, onFile);
  return box;
}

function drop(text, small, onPick, onFile, kind = "image") {
  const zone = h("div.drop", { tabIndex: 0, role: "button", on: { click: onPick } }, icon("upload"), h("span", {}, text), small ? h("small", {}, small) : null);
  return droppable(zone, onFile, kind);
}

/** One feature, one card: a numbered header that says what it is, and its own body. */
function card(key, { n, title, hint, set, summary, optional = true, tools = [], body, off }) {
  // a feature the chosen start can't use says why, and stays shut
  if (off) {
    return h("section.card.is-collapsed.is-off", {},
      h("div.card-head", {}, h("span.card-num", {}, String(n)), h("span.card-title", {}, title), h("span.card-hint", {}, off)));
  }
  const isOpen = !optional || openCard === key;
  const head = h("div.card-head", { className: optional ? "is-foldable" : "" },
    h("span.card-num", {}, String(n)),
    h("span.card-title", {}, title),
    // a closed card that holds something says what it holds
    !isOpen && set && summary ? h("span.card-hint.is-summary", {}, summary) : h("span.card-hint", {}, hint),
    h("span.card-tools", {},
      ...(isOpen ? tools : []),
      optional
        ? h("button.key.is-sm.is-icon.is-quiet", {
          type: "button",
          "aria-label": isOpen ? `Fold ${title}` : `Open ${title}`,
          "aria-expanded": String(isOpen),
          style: { transform: isOpen ? "rotate(180deg)" : "none" },
        }, icon(isOpen ? "chevron" : "plus"))
        : null,
    ),
  );
  // the whole header opens and closes it; the keys and fields inside keep their own clicks
  if (optional) head.addEventListener("click", (e) => !e.target.closest("button:not([aria-expanded]), input, textarea, select, a") && setOpen(key, !isOpen));
  return h("section.card", { className: `card${set ? " is-set" : ""}${isOpen ? "" : " is-collapsed"}` }, head, isOpen ? h("div.card-body", {}, ...body) : null);
}

/** The key that opens the Image window for a slot: a new picture, or (with a photo) an edit of it. */
function imageKey({ photo, label = "Generate", small = false } = {}) {
  return h(`button.key.is-accent${small ? ".is-sm" : ""}`, {
    type: "button",
    title: photo ? "Make it from this picture, in the Image window" : "Make a picture in the Image window",
    on: { click: () => openImage(photo ? { refs: [photo], template: "edit" } : {}) },
  }, sprite("image-generate"), label);
}

/**
 * A slot's picture with its keys on it: replace, edit, remove. They stay out of the way
 * until the pointer is over the picture (on touch they are always there).
 */
function framed(photo, { job, onFile, onRemove }) {
  const box = media(photo, { job, onFile });
  box.classList.add("is-framed");
  if (!photo || job) return box;
  const key = (ic, label, fn) => h("button.media-key", { type: "button", "aria-label": label, title: label, on: { click: (e) => (e.stopPropagation(), fn()) } }, ic);
  box.append(h("div.media-keys", {},
    key(sprite("image-replace"), "Replace", () => pickImage(onFile)),
    key(sprite("image-edit"), "Edit — in the Image window", () => openImage({ refs: [photo], template: "edit" })),
    key(icon("trash"), "Remove", onRemove)));
  return box;
}

// ---------------------------------------------------------------- 1 · start

function startCard() {
  const d = state.draft;
  const mode = d.startMode ?? "photo";
  const job = state.jobs.start;
  const setMode = (m) => edit((x) => (x.startMode = m), "sources", "settings", "monitor");
  const switcher = h("div.segment", { role: "group", "aria-label": "Start from" },
    ...[["photo", "Photo"], ["video", "Video"]].map(([m, label]) =>
      h("button", { type: "button", "aria-pressed": String(mode === m || (m === "photo" && mode === "generate")), on: { click: () => setMode(m) } }, label)));
  let body;
  if (mode === "video") body = videoBody();
  else if (d.start || job) {
    body = [framed(d.start, { job, onFile: (f) => setFrame("start", f), onRemove: () => clearFrame("start") })];
  } else {
    body = [
      drop("Drop, paste or pick a photo", "Or start from a sample", () => pickImage((f) => setFrame("start", f)), (f) => setFrame("start", f)),
      state.samples.length
        ? h("div.samples", { role: "group", "aria-label": "Sample photos" },
            state.samples.map((s) => h("button", { type: "button", title: s.name, on: { click: () => useSample(s.url.split("/").pop()) } },
              h("img", { src: s.url, alt: s.name, draggable: false, loading: "lazy" }))))
        : null,
    ];
  }
  return card("start", {
    n: 1,
    title: "Start",
    hint: mode === "video" ? "a clip to build on" : "the first frame",
    set: !!(mode === "video" ? d.video : d.start),
    optional: false,
    body: [switcher, ...body],
  });
}

function videoBody() {
  const d = state.draft;
  const v = d.video;
  if (!v) {
    return [drop("Drop a video", "MP4, WebM or MOV · up to 20 s", () => pickFile("file-video", setVideo), setVideo, "video")];
  }
  const setV = (patch) => edit((x) => Object.assign(x.video, patch), "sources", "settings", "monitor");
  return [
    h("div.video-box", {}, h("div.media", {}, h("video", { src: v.url, muted: true, controls: true, playsInline: true, preload: "metadata" }))),
    h("div.video-meta", {}, h("span", {}, v.name ?? "Video"), h("span", {}, `${(v.duration ?? 0).toFixed(1)} s · ${v.width} × ${v.height}`)),
    h("div.segment", { role: "group", "aria-label": "Use the video to" },
      h("button", { type: "button", "aria-pressed": String(v.mode === "extend"), title: "The new shot continues from the end of this clip", on: { click: () => setV({ mode: "extend" }) } }, "Extend this clip"),
      h("button", { type: "button", "aria-pressed": String(v.mode === "motion"), title: "The start photo performs this clip's motion", on: { click: () => setV({ mode: "motion" }) } }, "Copy its motion"),
    ),
    v.mode === "motion"
      ? h("div.card-body", {},
          h("div.segment", { role: "group", "aria-label": "Follow" },
            h("button", { type: "button", "aria-pressed": String(v.control === "pose"), on: { click: () => setV({ control: "pose" }) } }, "Body and face"),
            h("button", { type: "button", "aria-pressed": String(v.control === "edges"), on: { click: () => setV({ control: "edges" }) } }, "Shapes and edges"),
          ),
          d.start
            ? h("div.pair", {}, media(d.start), h("span.hint", {}, "This photo gets the clip's motion. Change it under Photo."))
            : h("span.hint", {}, "Add a photo under Photo: it takes on the clip's motion. Without one, the script sets the look."),
        )
      : h("span.hint", {}, "The shot starts where the clip ends and carries on."),
    h("button.key", { type: "button", on: { click: clearVideo } }, icon("trash"), "Remove video"),
  ];
}

// ---------------------------------------------------------------- 2 · end frame

/** Without an end frame each take paints its own: stop there so it can be checked, or go straight on. */
function reviewSwitch() {
  const sw = h("button", { type: "button" });
  toggle(sw, { value: state.draft.review, label: "Check the painted frame", onChange: (v) => edit((x) => (x.review = v), "settings") });
  return h("label.switch-row", { title: "Each take paints its own last frame, then waits for you to animate it" }, sw, "Check it before animating");
}

function endCard() {
  const d = state.draft;
  const job = state.jobs.end;
  const canPaint = d.start && d.paint.trim() && !job;
  const paintField = h("textarea.field", {
    rows: 2,
    placeholder: "How the start frame changes by the end: turn her into a gold statue",
    value: d.paint,
    on: {
      input: (e) => {
        edit((x) => (x.paint = e.target.value));
        root.querySelector("[data-act=paint]")?.toggleAttribute("disabled", !(state.draft.start && state.draft.paint.trim() && !state.jobs.end));
      },
      change: () => edit(() => {}, "settings", "monitor"),
    },
  });
  const body = [];
  if (job || d.end) {
    body.push(framed(job && job.kind === "paint" ? d.start : d.end, { job, onFile: (f) => setFrame("end", f), onRemove: () => clearFrame("end") }));
  } else {
    body.push(
      drop("Drop an end frame", "Or paint it from the start frame below", () => pickImage((f) => setFrame("end", f)), (f) => setFrame("end", f)),
      // the Image window starts from the start frame, so the end is the same scene changed
      d.start ? imageKey({ photo: d.start, label: "Make it from the start frame" }) : imageKey(),
    );
  }
  body.push(
    paintField,
    h("div.inline-edit", {},
      d.end ? h("span.hint", {}, "Painting replaces the end frame.") : reviewSwitch(),
      h("button.key", { type: "button", dataset: { act: "paint" }, disabled: !canPaint, title: d.start ? "Paint the end frame from the start frame" : "Add a start frame first", on: { click: paintEnd } }, icon("sparkle"), "Paint"),
    ),
  );
  const summary = job ? JOB_LABEL[job.kind] : d.end ? "end frame set" : d.paint.trim() ? `paints “${d.paint.trim().slice(0, 48)}${d.paint.trim().length > 48 ? "…" : ""}”` : null;
  return card("end", { n: 2, title: "End frame", hint: "where the shot lands", set: !!(d.end || job || d.paint.trim()), summary, body, off: videoMode() === "motion" && "not used when copying motion" });
}

// ---------------------------------------------------------------- 3 · keyframes

function keyframesCard() {
  const d = state.draft;
  const items = d.keyframes.map((k, i) =>
    h("div.kf-item", {},
      media(k.photo),
      h("input", {
        type: "number", min: 0.1, max: d.seconds - 0.1, step: 0.1, value: k.time, "aria-label": "At (seconds)",
        on: { change: (e) => edit((x) => (x.keyframes[i].time = Math.min(x.seconds - 0.1, Math.max(0.1, Number(e.target.value) || 0.1))), "sources", "monitor") },
      }),
      h("button.key.is-sm", { type: "button", on: { click: () => edit((x) => x.keyframes.splice(i, 1), "sources", "monitor", "settings") } }, icon("close")),
    ));
  return card("keyframes", {
    n: 3,
    title: "Keyframes",
    hint: "pin a moment in the shot",
    set: d.keyframes.length > 0,
    summary: `${d.keyframes.length} at ${d.keyframes.map((k) => `${k.time} s`).join(", ")}`,
    off: videoMode() === "motion" && "not used when copying motion",
    body: [
      h("div.kf-strip", {},
        ...items,
        d.keyframes.length < 6
          ? h("button.drop.kf-add", { type: "button", "aria-label": "Add a keyframe", on: { click: () => pickImage((f) => addKeyframe(f)) } }, icon("plus"))
          : null,
      ),
      h("span.hint", {}, "Drag the diamonds on the timeline to move them."),
    ],
  });
}

// ---------------------------------------------------------------- 4 · references

function referencesCard() {
  const d = state.draft;
  const refs = d.refs ?? {};
  const tile = (key, label) => {
    const job = state.jobs[key];
    return h("div.ref", {},
      h("span.ref-kind", {}, label),
      h("div.ref-tile", {},
        refs[key] || job
          ? media(refs[key], { job, onFile: (f) => setRef(key, f) })
          : droppable(h("div.drop", { role: "button", tabIndex: 0, on: { click: () => pickImage((f) => setRef(key, f)) } }, icon("upload")), (f) => setRef(key, f)),
      ),
      refs[key]
        ? h("div.inline-edit", {},
            h("input.field.is-line", {
              placeholder: REF_HINTS[key],
              "aria-label": `${label}: what it shows`,
              value: d.refText?.[key] ?? "",
              on: { input: (e) => edit((x) => (x.refText = { ...x.refText, [key]: e.target.value }), "script") },
            }),
            h("button.key.is-sm.is-icon", { type: "button", "aria-label": `Remove the ${label.toLowerCase()}`, on: { click: () => clearRef(key) } }, icon("close")),
          )
        : imageKey({ small: true }),
    );
  };
  return card("refs", {
    n: 4,
    title: "References",
    hint: "cast · prop · place",
    set: hasRefs(),
    summary: ["cast", "prop", "location"].filter((k) => d.refs?.[k]).map((k) => (k === "location" ? "place" : k)).join(" · "),
    off: videoMode() && "not used with a video",
    body: [
      h("div.refs", {}, tile("cast", "Cast"), tile("prop", "Prop"), tile("location", "Place")),
      h("span.hint", {}, hasRefs()
        ? "The shot is made from these and the script; start and end frames are set aside. Cast and props are cut out onto black."
        : "Put a person, a product and a place into a new scene."),
    ],
  });
}

// ---------------------------------------------------------------- 5 · sound

function soundCard() {
  const a = state.draft.audio;
  const pickAudio = () => pickFile("file-audio", setAudio);
  let body;
  if (a) {
    const audio = h("audio", { src: a.url, preload: "none" });
    const play = h("button.play-sm", { type: "button", "aria-label": "Play the track", on: { click: () => (audio.paused ? audio.play() : audio.pause()) } }, icon("play"));
    audio.addEventListener("play", () => play.replaceChildren(icon("pause")));
    audio.addEventListener("pause", () => play.replaceChildren(icon("play")));
    const lip = h("button.switch", { type: "button", role: "switch", "aria-checked": String(!!a.lipsync), "aria-label": "Lip sync", on: { click: () => edit((x) => (x.audio.lipsync = !x.audio.lipsync), "sources", "script") } });
    body = [
      h("div.sound-pill", {},
        play,
        h("span.name", {}, h("b", {}, a.name), h("span", {}, `${a.duration.toFixed(1)} s · the shot follows it`)),
        h("label.switch-row", { title: "The speaker's lips follow the track" }, "Lip sync", lip),
        audio,
      ),
      h("button.key", { type: "button", on: { click: clearAudio } }, icon("trash"), "Remove track"),
    ];
  } else {
    body = [drop("Drop voice or music", "Or a video: its sound is used", pickAudio, setAudio, "audio")];
  }
  return card("sound", { n: 5, title: "Sound", hint: "voice or music to follow", set: !!a, summary: a && `${a.name} · ${a.duration.toFixed(1)} s${a.lipsync ? " · lip sync" : ""}`, body });
}

// ---------------------------------------------------------------- 0 · a picture for any input

/** Step 0, optional: the Image window, whose pictures can go to any input below. */
function generateStep() {
  return h("button.step-zero", {
    type: "button",
    title: "Optional — make a picture for any input: start, end, a keyframe, cast, prop or place",
    on: { click: () => openImage() },
  },
    h("span.card-num", {}, "0"),
    sprite("image-generate"),
    h("span.step-zero-text", {}, h("b", {}, "Generate an image"), h("span", {}, "optional · for any input")),
    icon("arrow"));
}

export function renderSources(el) {
  root = el;
  const d = state.draft;
  const set = [d.startMode === "video" ? d.video : d.start, d.end || d.paint.trim(), d.keyframes.length, hasRefs(), d.audio].filter(Boolean).length;
  el.replaceChildren(
    generateStep(),
    h("div.col-head", {}, h("span.col-title", {}, "Inputs"), h("span.col-hint", {}, "what the shot is made from"), h("span.col-count", {}, `${set} of 5 set`)),
    startCard(), endCard(), keyframesCard(), referencesCard(), soundCard(),
  );
}

/** Paste anywhere outside a text field: it becomes the start frame. */
export function listenForPaste() {
  document.addEventListener("paste", (e) => {
    if (e.target.closest?.("input, textarea") || currentPage() !== "create" || state.image.open) return;
    const file = imageFrom(e.clipboardData);
    if (file) setFrame("start", file);
  });
}
