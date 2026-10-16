import { h, icon } from "../dom.js";
import { state, setEdit, removeClip, moveClip, trimClip, clearEdit, exportFilm, addToEdit, takeLength } from "../store.js";
import { go } from "../router.js";

const runOf = (clip) => state.runs.find((r) => r.id === clip.run) ?? null;
const full = (clip) => {
  const run = runOf(clip);
  return run ? takeLength(run) : 0;
};
const clipLen = (clip) => Math.max(0, (clip.to ?? full(clip)) - clip.from);
const FADE = 0.5;

/** Length of the whole film: the clips end to end, less the overlap of each cross-dissolve. */
function totalLength() {
  const lens = state.edit.clips.map(clipLen);
  const f = state.edit.fade && lens.length > 1 ? Math.min(FADE, ...lens.map((l) => l / 2)) : 0;
  return lens.reduce((t, l) => t + l, 0) - f * Math.max(0, lens.length - 1);
}

const fmt = (t) => `${t.toFixed(1)} s`;

// ---------------------------------------------------------------- the preview: plays the clips in order

const player = { video: null, index: -1, playing: false };

function video() {
  if (player.video) return player.video;
  const el = h("video.edit-video", { playsInline: true, preload: "auto" });
  el.addEventListener("timeupdate", () => {
    const clip = state.edit.clips[player.index];
    if (!clip) return;
    const end = clip.to ?? full(clip);
    if (el.currentTime >= end - 0.04) return player.playing ? next() : el.pause();
    moveHead();
  });
  el.addEventListener("ended", () => player.playing && next());
  el.addEventListener("play", syncPlay);
  el.addEventListener("pause", syncPlay);
  player.video = el;
  return el;
}

function load(i, at) {
  const clip = state.edit.clips[i];
  const run = clip && runOf(clip);
  if (!run) return false;
  player.index = i;
  const el = video();
  const src = run.video;
  if (!el.src.endsWith(src)) el.src = src;
  el.currentTime = at ?? clip.from;
  return true;
}

function next() {
  const i = player.index + 1;
  if (i >= state.edit.clips.length) {
    player.playing = false;
    video().pause();
    return syncPlay();
  }
  if (load(i)) video().play().catch(() => {});
  highlight();
}

function playAll(from = 0) {
  if (!state.edit.clips.length) return;
  player.playing = true;
  if (load(from)) video().play().catch(() => {});
  highlight();
}

function togglePlay() {
  const el = video();
  if (player.playing && !el.paused) {
    player.playing = false;
    return el.pause();
  }
  playAll(player.index >= 0 && player.index < state.edit.clips.length ? player.index : 0);
}

function syncPlay() {
  const key = document.querySelector("#page-edit [data-act=play]");
  if (!key) return;
  const on = !video().paused && player.playing;
  key.replaceChildren(icon(on ? "pause" : "play"));
  key.setAttribute("aria-label", on ? "Pause" : "Play the film");
}

function highlight() {
  document.querySelectorAll("#page-edit .clip").forEach((c, i) => c.classList.toggle("is-playing", i === player.index && player.playing));
  document.querySelectorAll("#page-edit .seg-clip").forEach((c, i) => c.classList.toggle("is-playing", i === player.index));
}

function moveHead() {
  const head = document.querySelector("#page-edit .edit-head");
  if (!head) return;
  const lens = state.edit.clips.map(clipLen);
  const total = lens.reduce((t, l) => t + l, 0) || 1;
  const clip = state.edit.clips[player.index];
  if (!clip) return;
  const before = lens.slice(0, player.index).reduce((t, l) => t + l, 0);
  head.style.left = `${((before + Math.max(0, video().currentTime - clip.from)) / total) * 100}%`;
}

// ---------------------------------------------------------------- the page

function trimRow(clip, i) {
  const length = full(clip);
  const label = h("span.trim-label", {}, `${fmt(clip.from)} → ${fmt(clip.to ?? length)}`);
  const refresh = () => {
    label.textContent = `${fmt(clip.from)} → ${fmt(clip.to ?? length)}`;
    const card = label.closest(".clip");
    card?.querySelector(".clip-len")?.replaceChildren(fmt(clipLen(clip)));
    const seg = document.querySelectorAll("#page-edit .seg-clip")[i];
    if (seg) seg.style.flexGrow = String(clipLen(clip));
    document.querySelector("#page-edit .edit-total")?.replaceChildren(fmt(totalLength()));
  };
  const from = h("input", {
    type: "range", min: 0, max: length, step: 0.1, value: clip.from, "aria-label": "Start of the clip",
    on: { input: (e) => {
      const v = Math.min(Number(e.target.value), (clip.to ?? length) - 0.5);
      e.target.value = v;
      trimClip(i, { from: Math.round(v * 10) / 10 });
      load(i, clip.from);
      refresh();
    } },
  });
  const to = h("input", {
    type: "range", min: 0, max: length, step: 0.1, value: clip.to ?? length, "aria-label": "End of the clip",
    on: { input: (e) => {
      const v = Math.max(Number(e.target.value), clip.from + 0.5);
      e.target.value = v;
      trimClip(i, { to: v >= length - 0.05 ? null : Math.round(v * 10) / 10 });
      load(i, (clip.to ?? length) - 0.1);
      refresh();
    } },
  });
  return h("div.trim", {}, h("div.trim-bars", {}, from, to), label);
}

function clipCard(clip, i) {
  const run = runOf(clip);
  const card = h("article.clip", { draggable: true },
    h("span.clip-grip", { title: "Drag to reorder" }, icon("more")),
    h("button.clip-thumb", { type: "button", title: "Play from here", on: { click: () => playAll(i) } },
      run ? h("video", { src: `${run.video}#t=${clip.from + 0.3}`, muted: true, preload: "metadata", draggable: false }) : null,
      h("span.clip-num", {}, String(i + 1))),
    h("div.clip-main", {},
      h("div.clip-title", {}, h("b", {}, run?.request.name ?? "Missing take"), h("span.clip-len", {}, fmt(clipLen(clip)))),
      run ? trimRow(clip, i) : h("span.hint", {}, "This take was deleted."),
    ),
    h("button.key.is-icon.is-quiet", { type: "button", "aria-label": "Remove from the film", title: "Remove from the film", on: { click: () => removeClip(i) } }, icon("close")),
  );
  card.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/comfyture-clip", String(i));
    e.dataTransfer.effectAllowed = "move";
    card.classList.add("is-dragging");
  });
  card.addEventListener("dragend", () => card.classList.remove("is-dragging"));
  card.addEventListener("dragover", (e) => {
    if (!e.dataTransfer.types.includes("text/comfyture-clip")) return;
    e.preventDefault();
    const above = e.offsetY < card.offsetHeight / 2;
    card.classList.toggle("is-drop-before", above);
    card.classList.toggle("is-drop-after", !above);
  });
  card.addEventListener("dragleave", () => card.classList.remove("is-drop-before", "is-drop-after"));
  card.addEventListener("drop", (e) => {
    e.preventDefault();
    const above = e.offsetY < card.offsetHeight / 2;
    card.classList.remove("is-drop-before", "is-drop-after");
    moveClip(Number(e.dataTransfer.getData("text/comfyture-clip")), above ? i : i + 1);
  });
  return card;
}

function joinMark() {
  return h("div.join", {}, h("span", {}, state.edit.fade ? `cross-dissolve ${FADE} s` : "cut"));
}

function timeline() {
  const clips = state.edit.clips;
  const seek = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const lens = clips.map(clipLen);
    const total = lens.reduce((t, l) => t + l, 0) || 1;
    let at = ((e.clientX - box.left) / box.width) * total;
    for (let i = 0; i < clips.length; i++) {
      if (at <= lens[i] || i === clips.length - 1) {
        player.playing = false;
        load(i, clips[i].from + Math.min(at, lens[i]));
        highlight();
        return moveHead();
      }
      at -= lens[i];
    }
  };
  return h("div.edit-timeline", { on: { pointerdown: seek } },
    ...clips.map((c, i) => h("span.seg-clip", { style: { flexGrow: String(clipLen(c)) }, title: runOf(c)?.request.name ?? "" }, String(i + 1))),
    h("i.edit-head", {}));
}

/** Finished takes not yet in the film, one click to add. */
function picker() {
  const used = new Set(state.edit.clips.map((c) => c.run));
  const takes = state.runs.filter((r) => r.status === "done");
  return h("section.card.edit-picker", {},
    h("div.card-head", {}, h("span.card-label", {}, "Add takes"), h("span.card-hint", {}, `${takes.length} finished · click to add, or choose more in the Library`),
      h("span.card-tools", {}, h("a.key.is-sm", { href: "#/library" }, icon("grid"), "Library"))),
    takes.length
      ? h("div.picker-strip", {}, takes.map((r) =>
          h("button.pick", { type: "button", title: r.request.name, className: used.has(r.id) ? "is-used" : "", on: { click: () => addToEdit(r.id) } },
            h("video", { src: `${r.video}#t=0.5`, muted: true, preload: "metadata", draggable: false }),
            h("span", {}, r.request.name),
            used.has(r.id) ? h("i.pick-badge", {}, icon("check")) : null)))
      : h("p.hint", {}, "Finished takes appear here."),
  );
}

export function renderEdit(el) {
  const e = state.edit;
  const clips = e.clips;
  const ready = clips.filter((c) => runOf(c)?.status === "done").length;
  const playing = player.playing;
  el.replaceChildren(
    h("div.page-head", {},
      h("h1", {}, "Edit"),
      h("span.hint", {}, "Cut takes into one film: put them in order, trim each one, choose how they join."),
      h("span.spacer"),
      clips.length ? h("button.key.is-quiet", { type: "button", on: { click: clearEdit } }, icon("trash"), "Clear") : null,
    ),
    h("div.edit-page", {},
      h("div.edit-main", {},
        clips.length
          ? h("section.card.edit-clips", {},
              h("div.card-head", {}, h("span.card-label", {}, "Clips"), h("span.card-hint", {}, `${clips.length} in order · drag to reorder`)),
              h("div.clip-list", {}, clips.flatMap((c, i) => (i ? [joinMark(), clipCard(c, i)] : [clipCard(c, i)]))))
          : h("section.card.edit-empty", {},
              icon("scissors"),
              h("b", {}, "Nothing to cut yet"),
              h("p", {}, "Send the takes of your Create tabs here, or pick takes below or in the Library."),
              h("a.key.is-primary", { href: "#/create" }, "Back to Create")),
        picker(),
      ),
      h("aside.edit-side", {},
        h("section.card.edit-preview", {},
          h("div.card-head", {}, h("span.card-label", {}, "Preview"), h("span.card-hint", {}, "plays the clips in order, without the dissolves")),
          h("div.edit-screen", {}, video(), clips.length ? null : h("span.empty", {}, "The film plays here.")),
          h("div.edit-transport", {},
            h("button.play", { type: "button", dataset: { act: "play" }, disabled: !clips.length, "aria-label": "Play the film", on: { click: togglePlay } }, icon(playing ? "pause" : "play")),
            h("span.timecode", {}, h("span.edit-total", {}, fmt(totalLength())), h("span", {}, " total"))),
          clips.length ? timeline() : null,
        ),
        h("section.card.edit-settings", {},
          h("div.card-head", {}, h("span.card-label", {}, "Film")),
          h("div.rows", {},
            h("span.row-label", {}, "Name"),
            h("input.field.is-line", { value: e.name, placeholder: "Untitled film", "aria-label": "Film name", on: { input: (ev) => setEdit({ name: ev.target.value }) } }),
            h("span.row-label", {}, "Join"),
            h("div.segment", { role: "group", "aria-label": "How clips join" },
              h("button", { type: "button", "aria-pressed": String(!e.fade), on: { click: () => setEdit({ fade: false }) } }, "Cut"),
              h("button", { type: "button", "aria-pressed": String(e.fade), title: "Picture and sound dissolve into each other", on: { click: () => setEdit({ fade: true }) } }, "Cross-dissolve")),
          ),
          h("button.roll", { type: "button", disabled: ready < 2 || e.exporting, on: { click: exportFilm } },
            icon("film"), e.exporting ? "CUTTING…" : "CUT THE FILM"),
          h("p.hint.note", {}, ready < 2 ? "Add at least two finished takes." : `${ready} clips, ${fmt(totalLength())}. The film is saved in the Library.`),
        ),
      ),
    ),
  );
  syncPlay();
}
