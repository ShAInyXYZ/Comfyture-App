// The band: who performs (one of the crew, or a photo of yours), the dance to copy and the vibe of the scene,
// and the shots the video is planned in. Choosing costs nothing; the shots are only rolled (LTX-2.5) by the
// keys that show their estimate, on The edit's screen or here on a shot.
import { h, icon, pad2 } from "../dom.js";
import { state, changed, toast } from "../store.js";
import { openPicker, pictureOf } from "../picker.js";
import { CREW, crewFace } from "../mixer-trends.js";
import { jam, useCrew, setArtist, setDance, clearDance, setStyle, setEvery, setLoras, setKind, take, making, rerollShot, shotState, KINDS, openWindow, bars } from "../jam.js";
import { loraStack } from "../loras.js";
import { editor } from "./editor.js";
import { bento, jicon, mins, pickFile, keep, cr, lamp, registerWindow } from "./jam-ui.js";

const LOOKS = [["Soft daylight", "sun", "soft daylight, a pastel room"], ["Studio", "studio", "a clean studio backdrop, soft light"], ["Concert", "stage", "a concert stage, coloured lights, haze"]];
const KIND_ICON = { performance: "mic", dance: "dancer", broll: "film2" };

// ---------------------------------------------------------------- the artist

function artistStage(b) {
  const crew = CREW.find((c) => c.id === b?.artist?.crew);
  return h("div.jm-artist-stage", {},
    h("i.jm-pool"), h("i.jm-spot.is-a"), h("i.jm-spot.is-b"), h("i.jm-spot.is-c"),
    b?.artist ? h(`img.jm-artist-img${crew ? ".is-crew" : ""}`, { src: b.artist.url, alt: crew?.name ?? "The artist", draggable: false }) : h("div.jm-artist-none", {}, h("img", { src: crewFace("praline"), alt: "", draggable: false }), h("span", {}, "Pick who performs")),
    b?.artist ? h("span.jm-name-chip", {}, crew?.name ?? "Your photo") : null);
}

function faces(b, { all = false } = {}) {
  const list = all ? CREW : CREW.slice(0, 7);
  return h("div.jm-faces-row", { role: "group", "aria-label": "The crew", dataset: { scrollKey: all ? "jm-faces-all" : "jm-faces" } },
    ...list.map((c) =>
      h(`button.jm-face${b?.artist?.crew === c.id ? ".is-on" : ""}`, { type: "button", "aria-pressed": String(b?.artist?.crew === c.id), title: `${c.name}, the ${c.role.toLowerCase()}`, on: { click: () => useCrew(c.id) } },
        h("img", { src: crewFace(c.id), alt: "", draggable: false }), h("span", {}, c.name), all ? h("em", {}, c.role) : null)),
    h("button.jm-face.is-add", { type: "button", title: "A photo of yours, from your computer", on: { click: () => pickFile("image/*", (f) => setArtist(f)) } }, h("i", {}, jicon("plus")), h("span", {}, "Your photo")));
}

function artistBento(ctx) {
  return bento({ id: "artist", title: "ARTIST" }, artistStage(ctx.b), faces(ctx.b));
}

// ---------------------------------------------------------------- the moves

const poses = new Map(); // trend id -> the url of its pose video, "" when it has none, undefined while asked
/** The pose of a trend's dance (the skeleton the motion is read from), when we have it: the first shot's control video. */
function poseOf(trend) {
  if (!trend) return "";
  if (!poses.has(trend)) {
    poses.set(trend, undefined);
    fetch(`brand/mixer/trends/${trend}/recipe.json`).then((r) => (r.ok ? r.json() : null)).then((recipe) => {
      const name = recipe?.shots?.find((s) => typeof s?.pose === "string")?.pose;
      poses.set(trend, name ? `brand/mixer/trends/${trend}/${name}` : "");
      changed("jam");
    }).catch(() => poses.set(trend, ""));
  }
  return poses.get(trend);
}

function loopVideo(url, key) {
  return keep(`loop:${key}:${url}`, () => h("video", { src: url, muted: true, loop: true, autoplay: true, playsInline: true, draggable: false }));
}

function movesTiles(b) {
  if (!b?.dance) {
    return h("div.jm-moves", {},
      h("button.jm-move.is-empty", { type: "button", disabled: jam.busy.has("dance"), title: "A dance video: its moves are copied in the parts without singing", on: { click: () => pickFile("video/*", setDance) } },
        h("i", {}, jicon("upload")), h("b", {}, jam.busy.has("dance") ? "Adding…" : "Add a dance"), h("span", {}, "A video of the moves to copy")));
  }
  const pose = poseOf(b.trend?.id);
  return h("div.jm-moves", {},
    h("div.jm-move", {}, loopVideo(b.dance.url, "dance"), h("span.jm-move-badge", {}, mins(b.dance.duration))),
    pose ? h("div.jm-move", {}, loopVideo(pose, "pose"), h("span.jm-move-tag", {}, "Pose preview")) : null);
}

function movesBento(ctx) {
  const { b } = ctx;
  return bento({ id: "moves", title: "MOVES", tools: b?.dance?.synced ? [h("span.jm-sync", {}, lamp("ok"), "in step with the sound")] : [] }, movesTiles(b));
}

// ---------------------------------------------------------------- the vibe

function lookChips(b) {
  return h("div.jm-looks", {}, ...LOOKS.map(([label, ic, text]) =>
    h("button.jm-look", { type: "button", "aria-pressed": String((b?.style ?? "") === text), disabled: !b, on: { click: () => (setStyle(text), changed("jam")) } }, jicon(ic), label)));
}

function vibeBento(ctx) {
  const { b } = ctx;
  return bento({ id: "vibe", title: "VIBE" },
    h("input.field.jm-vibe", { value: b?.style ?? "", placeholder: "pastel room, soft daylight", disabled: !b, dataset: { focus: "vibe" }, on: { change: (e) => setStyle(e.target.value), keydown: (e) => e.stopPropagation() } }),
    lookChips(b));
}

// ---------------------------------------------------------------- the shots

function shotsBar(b) {
  const total = b?.part?.seconds || 1;
  if (!b?.shots?.length) return h("p.jm-hint", {}, b?.part ? "No shots planned: change how often the video cuts in the shots' window." : "The shots are planned once the part is cut.");
  const marks = bars(b);
  return h("div.jm-shotbar", {},
    h("div.jm-shot-ticks", {}, ...marks.map((t) => h("i", { style: { left: `${(t / total) * 100}%` } }))),
    h("div.jm-shot-lane", {}, ...b.shots.map((s, i) =>
      h(`button.jm-shot.is-${s.kind}`, { type: "button", style: { left: `${(s.from / total) * 100}%`, width: `${((s.to - s.from) / total) * 100}%` }, title: `Shot ${i + 1}: ${KINDS[s.kind]}, ${(s.to - s.from).toFixed(1)} s`, on: { click: () => openWindow("shots") } },
        b.artist ? h("img", { src: b.artist.url, alt: "", draggable: false }) : null, h("span", {}, KINDS[s.kind])))),
    h("div.jm-shot-times", {}, ...[0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => h("span", {}, mins(total * f)))));
}

function shotsBento(ctx) {
  return bento({ id: "shots", title: "SHOTS" }, shotsBar(ctx.b));
}

export function bandWorkspace(ctx) {
  return [artistBento(ctx), movesBento(ctx), vibeBento(ctx), shotsBento(ctx)];
}

// ---------------------------------------------------------------- windows

registerWindow("artist", {
  title: "ARTIST",
  wide: true,
  build() {
    const b = jam.jam?.body;
    return [
      artistStage(b),
      faces(b, { all: true }),
      h("div.jm-row", {},
        h("button.key", { type: "button", title: "A picture from the Library, one of our characters or a photo", on: { click: (e) => openPicker(e.currentTarget, { title: "The artist", onPick: async (choice) => { try { await setArtist(await pictureOf(choice)); } catch (err) { toast(err.message, { tone: "crit" }); } } }) } }, icon("image"), "From the Library"),
        h("span.jm-note", {}, "Choosing costs nothing: the picture goes up once. The artist is drawn into every shot when the video is made.")),
    ];
  },
});

registerWindow("moves", {
  title: "MOVES",
  wide: true,
  build() {
    const b = jam.jam?.body;
    return [
      movesTiles(b),
      h("div.jm-row", {},
        h("button.key", { type: "button", disabled: jam.busy.has("dance"), on: { click: () => pickFile("video/*", setDance) } }, icon("upload"), b?.dance ? "Another dance" : "Add a dance"),
        b?.dance ? h("button.key", { type: "button", on: { click: () => clearDance() } }, icon("close"), "No dance") : null,
        b?.dance ? h("button.key", { type: "button", "aria-pressed": String(!!b.dance.synced), title: "In step with the sound: each shot copies the stretch of the dance at its own time", on: { click: () => ((b.dance.synced = !b.dance.synced), changed("jam")) } }, lamp(b.dance.synced ? "ok" : "off"), "In step with the sound") : null),
      h("p.jm-note", {}, "Where nobody sings, the artist copies the dance (the shots made with LTX-2.5 read its motion). Choosing it costs nothing."),
    ];
  },
});

registerWindow("vibe", {
  title: "VIBE",
  build() {
    const b = jam.jam?.body;
    return [
      h("textarea.field.jm-style-field", { rows: 3, value: b?.style ?? "", placeholder: "pastel room, soft daylight, a giant jam-jar lid", disabled: !b, dataset: { focus: "vibe-text" }, on: { change: (e) => setStyle(e.target.value), keydown: (e) => e.stopPropagation() } }),
      lookChips(b),
      h("span.label", {}, "LoRAs"),
      loraStack(b?.loras ?? [], (list) => b && setLoras(list)),
      h("p.jm-note", {}, "A new vibe means the shots are drawn again when the video is made."),
    ];
  },
});

const cloud = () => state.info?.target === "comfy-cloud";
const costOfShot = (s) => (cloud() ? Math.max(1, Math.round(Math.min(10, Math.max(2, Math.ceil(s.to - s.from))) * 18 * 0.266)) : null);

registerWindow("shots", {
  title: "SHOTS",
  wide: true,
  build() {
    const b = jam.jam?.body;
    return [
      h("div.jm-fields", {},
        h("div", {}, h("span.label", {}, "Plan the cuts"),
          h("div.jm-lengths", { title: "How often the video cuts. A shot already made stays when it is cut where it was" }, ...[[1, "Every bar"], [2, "Every 2 bars"], [4, "Every 4 bars"]].map(([n, label]) =>
            h("button.jm-chip", { type: "button", "aria-pressed": String((b?.every ?? 2) === n), disabled: !b?.part, on: { click: () => setEvery(n) } }, label))))),
      shotsBar(b),
      b?.shots?.length ? h("div.jm-shotlist", {}, ...b.shots.map((s, i) => {
        const st = shotState(s, i);
        const rolling = st.step === "rolling";
        const cost = costOfShot(s);
        return h(`div.jm-shot-row.is-${st.step}`, {},
          h("button.jm-shot-at", { type: "button", title: "Go to this shot", on: { click: () => (openWindow(null), editor.seek(s.from)) } }, pad2(i + 1)),
          h("div.jm-kinds", { role: "group", "aria-label": `Shot ${i + 1}` }, ...Object.entries(KINDS).map(([k, label]) => h("button.jm-kind", { type: "button", "aria-pressed": String(s.kind === k), disabled: k === "dance" && !b.dance, title: s.clip ? `${label}: a clip came with this project, another kind makes it new` : label, on: { click: () => setKind(i, k) } }, jicon(KIND_ICON[k]), label))),
          h("span.jm-shot-len", {}, `${(s.to - s.from).toFixed(1)} s`),
          h("span.jm-shot-state", { title: st.note ?? "" }, rolling ? `${Math.round((st.progress ?? 0) * 100)}%` : st.step === "done" ? "made" : st.step === "failed" ? "failed" : "waiting"),
          h("button.key.is-sm", { type: "button", disabled: rolling || making() || !b.artist, title: "Roll this shot (LTX-2.5): it costs credits, so it waits for this key", on: { click: () => rerollShot(i) } }, icon("remix"), rolling ? "Rolling" : "Roll it", cost !== null ? h("em.jm-cost", {}, cr(cost)) : null));
      })) : null,
    ];
  },
});
