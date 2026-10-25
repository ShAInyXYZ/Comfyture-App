// The band: who performs. A stage with the cast standing on it (the lead, the jam's artist, and up to two performers beside
// them, each with a role), the dance to copy and the look of the scene, and the one key that casts the band: every shot not
// made yet is rolled (LTX-2.5), which costs credits, so that key asks twice. Choosing costs nothing. The shots the video is
// planned in, and the finer things (LoRAs, the crew's whole list), are in windows the bentos open.
import { h, icon, pad2 } from "../dom.js";
import { state, changed, toast } from "../store.js";
import { openPicker, pictureOf } from "../picker.js";
import { CREW, crewFace, crewById } from "../mixer-trends.js";
import { jam, useCrew, setArtist, setDance, clearDance, setStyle, setEvery, setLoras, setKind, take, making, rerollShot, shotState, KINDS, openWindow, bars, makeVideo, costOfVideo, setWorkspace } from "../jam.js";
import { loraStack } from "../loras.js";
import { editor } from "./editor.js";
import { bento, jicon, mins, pickFile, keep, cr, lamp, registerWindow } from "./jam-ui.js";
import { ROLES, SUPPORT, MAX_BAND, castOf, creditsFor } from "../jam-band-model.js";
import { addPerformer, addPerformerFile, swapPerformer, setRole, setShown, removePerformer, setLipsync, lipsyncOn } from "./jam-band-cast.js";
import { pay, isArmed } from "./jam-band-pay.js";

const LOOKS = [["Soft daylight", "sun", "soft daylight, a pastel room"], ["Studio", "studio", "a clean studio backdrop, soft light"], ["Concert", "stage", "a concert stage, coloured lights, haze"]];
const KIND_ICON = { performance: "mic", dance: "dancer", broll: "film2" };
const cloud = () => state.info?.target === "comfy-cloud";

/** A figure for the stage: a crew member's cut-out, or a picture of one's own (kept as it is, framed). */
const PETS = new Set(["praline", "sesame", "mochi", "meringue"]);
const figure = (who) => (who?.crew ? h(`img.jm-fig${PETS.has(who.crew) ? ".is-pet" : ""}`, { src: `brand/mixer/crew/${who.crew}-stage.webp`, alt: "", draggable: false }) : h("img.jm-fig.is-photo", { src: who.url, alt: "", draggable: false }));

/** A switch: a pill that is on or off. */
const toggle = (on, label, run, title) =>
  h("button.jm-switch", { type: "button", role: "switch", "aria-checked": String(!!on), title, on: { click: run } }, h("span", {}, label), h("i"));

// the performer the cast window is about: "lead", or a place in the line-up (0 and 1)
let slot = "lead";
const open = (to) => ((slot = to), openWindow("artist"));

// ---------------------------------------------------------------- the stage

function leadCard(b) {
  const a = b?.artist;
  if (!a) {
    return h("article.jm-cast.is-empty", {},
      h("button.jm-cast-pic.is-add", { type: "button", title: "Pick who sings: one of the crew, a picture, or a photo of yours", on: { click: () => open("lead") } },
        h("i", {}, jicon("plus")), h("b", {}, "Pick your artist"), h("span", {}, "One of the crew or a photo")));
  }
  const crew = crewById(a.crew);
  return h("article.jm-cast.is-lead", { dataset: { slot: "lead" } },
    h("button.jm-cast-pic", { type: "button", title: "Change the artist", on: { click: () => open("lead") } }, figure(a)),
    h("div.jm-cast-meta", {},
      h("div.jm-cast-who", {}, h("b", {}, crew?.name ?? a.name ?? "Your photo"), h("span.jm-role", {}, ROLES.lead[0])),
      toggle(lipsyncOn(b), "Lip-sync", () => setLipsync(!lipsyncOn(b)), "Sung parts are performance shots, the lips following the vocals. Off: they become dance or b-roll shots instead")));
}

function supportCard(p, i) {
  return h("article.jm-cast", { dataset: { slot: String(i) }, className: p.show === false ? "is-out" : "" },
    h("button.jm-cast-pic", { type: "button", title: `${p.name}: change who or what they play`, on: { click: () => open(i) } }, figure(p)),
    h("div.jm-cast-meta", {},
      h("div.jm-cast-who", {}, h("b", {}, p.name), h("button.jm-role", { type: "button", title: "What they play", on: { click: () => open(i) } }, ROLES[p.role]?.[0] ?? "Performer")),
      toggle(p.show !== false, "In the shots", () => setShown(i, p.show === false), "Whether they stand beside the lead in the scenes")));
}

function addCard(b) {
  const free = MAX_BAND - castOf(b).length;
  return h("article.jm-cast.is-slot", {},
    h("button.jm-cast-add", { type: "button", disabled: !b?.artist || free <= 0, title: !b?.artist ? "Pick the lead first" : free <= 0 ? "The stage is full" : "Add a performer beside the lead", on: { click: () => open(castOf(b).length) } },
      h("i", {}, jicon("plus")), h("b", {}, "Add a performer"), h("span", {}, free > 0 ? `${free} place${free > 1 ? "s" : ""} left` : "The stage is full")));
}

function stageBento({ b }) {
  const cast = castOf(b);
  const shots = b?.shots?.length ?? 0;
  const body = h("div.jm-stage", {},
    h("i.jm-curtain.is-l"), h("i.jm-curtain.is-r"), h("i.jm-glow"), h("i.jm-floor"),
    h("div.jm-castrow", { dataset: { n: String(1 + cast.length) } }, leadCard(b), ...cast.map(supportCard), cast.length < MAX_BAND ? addCard(b) : null));
  return bento({ id: "stage", title: "THE STAGE", win: "artist", cls: "is-bare",
    tools: [h("button.jm-chipkey", { type: "button", disabled: !b?.part, title: b?.part ? "The shots: how often the video cuts, and each shot" : "The shots are planned once the track is cut", on: { click: () => openWindow("shots") } }, jicon("film"), `${shots} shot${shots === 1 ? "" : "s"}`)] }, body);
}

// ---------------------------------------------------------------- the dance to copy

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

/** The dance clip in a phone, the skeleton lightly over it when its pose is known. */
function phone(b) {
  const pose = poseOf(b.trend?.id);
  return h("div.jm-phone", {},
    loopVideo(b.dance.url, "dance"),
    pose ? h("div.jm-pose", { title: "The skeleton the motion is read from" }, loopVideo(pose, "pose")) : null,
    h("span.jm-phone-time", {}, mins(b.dance.duration)));
}

function danceBento({ b }) {
  const busy = jam.busy.has("dance");
  if (!b?.dance) {
    return bento({ id: "dance", title: "DANCE REFERENCE", win: "moves" },
      h("div.jm-dance.is-empty", {},
        h("button.jm-phone.is-add", { type: "button", disabled: busy, title: "A dance video: its moves are copied in the parts without singing", on: { click: () => pickFile("video/*", setDance) } },
          h("i", {}, jicon("upload")), h("b", {}, busy ? "Adding…" : "Add a dance"), h("span", {}, "A video of the moves")),
        h("div.jm-dance-info", {},
          h("p.jm-lead", {}, "Where nobody sings, the artist can copy a dance."),
          h("p.jm-fine", {}, "Add a video of the moves, or start from a dance trend on the track: its own dance comes with it."),
          h("button.key", { type: "button", on: { click: () => setWorkspace("track") } }, jicon("disc"), "Pick a trend on the track"))));
  }
  const trend = b.trend?.name;
  const per10 = cloud() ? creditsFor(10) : null;
  return bento({ id: "dance", title: "DANCE REFERENCE", win: "moves" },
    h("div.jm-dance", {},
      phone(b),
      h("div.jm-dance-info", {},
        h("div.jm-fact", {}, h("span.label", {}, trend ? "Trend" : "Dance"), h("b", {}, trend ?? "Your own video")),
        h("p.jm-lead", {}, "Your character will dance this."),
        toggle(!!b.dance.synced, "In step with the sound", () => ((b.dance.synced = !b.dance.synced), changed("jam")), "Each shot copies the stretch of the dance at its own time, so it keeps in step with the track"),
        per10 ? h("p.jm-fine", {}, `≈ ${per10} cr per 10 s`) : null,
        h("div.jm-row", {},
          h("button.jm-iconkey", { type: "button", disabled: busy, title: "Another dance", "aria-label": "Another dance", on: { click: () => pickFile("video/*", setDance) } }, jicon("upload")),
          h("button.jm-iconkey", { type: "button", title: "No dance", "aria-label": "No dance", on: { click: () => clearDance() } }, jicon("close"))))));
}

// ---------------------------------------------------------------- the look, and the key that casts

function lookTile([label, ic, text], b) {
  const on = (b?.style ?? "") === text;
  const a = b?.artist;
  return h(`button.jm-look-tile.is-look-${ic}`, { type: "button", "aria-pressed": String(on), disabled: !b, title: `${label}: ${text}`, on: { click: () => (setStyle(text), changed("jam")) } },
    h("span.jm-look-scene", {}, a ? figure(a) : jicon(ic)),
    h("span.jm-look-name", {}, label));
}

/** What casting the band costs: the looks to draw and every second not yet rolled, or nothing when it is all made. */
function castState(b) {
  const busy = making() || jam.busy.has("render");
  const clips = !!b?.shots?.length && b.shots.every((s) => s.clip);
  const todo = b?.shots?.filter((s) => !s.clip && !(take(s)?.status === "done")).length ?? 0;
  return { busy, cost: costOfVideo(), todo, ready: !!b?.shots?.length && (!!b.artist || clips) };
}

function castKey(b) {
  const m = castState(b);
  const armed = isArmed("cast");
  const label = making() ? "Casting…" : armed ? "Press again to cast" : "Cast the band";
  const why = !b?.part ? "Add a track first: the shots are cut on its beat" : !m.ready ? "Pick the artist first" : m.cost ? `Rolls the ${m.todo} shot${m.todo === 1 ? "" : "s"} not made yet with LTX-2.5: it costs about ${m.cost} credits, so it asks twice` : "Every shot is made: the video is cut and put together";
  return h(`button.jm-cast-key${armed ? ".is-armed" : ""}`, { type: "button", disabled: m.busy || !m.ready, title: why, dataset: { go: "cast" }, on: { click: () => pay("cast", m.cost, makeVideo) } },
    jicon(armed ? "sparkle" : "band"), h("b", {}, label), m.cost ? h("em", {}, cr(m.cost)) : null);
}

function lookBento({ b }) {
  return bento({ id: "look", title: "LOOK", win: "vibe", tools: [h("span.jm-fine", { title: "The vibe in the look's own words" }, b?.style ? `“${b.style.slice(0, 34)}${b.style.length > 34 ? "…" : ""}”` : "")] },
    h("div.jm-looks", {}, ...LOOKS.map((l) => lookTile(l, b))),
    h("div.jm-castbar", {}, castKey(b), h("p.jm-fine", {}, cloud() ? `≈ ${creditsFor(10)} cr per 10 s` : "On your own GPU")));
}

export function bandWorkspace(ctx) {
  return [stageBento(ctx), danceBento(ctx), lookBento(ctx)];
}

// ---------------------------------------------------------------- the shots (a bar the length of the part, a shot each)

function shotsBar(b) {
  const total = b?.part?.seconds || 1;
  if (!b?.shots?.length) return h("p.jm-hint", {}, b?.part ? "No shots planned: change how often the video cuts below." : "The shots are planned once the part is cut.");
  const marks = bars(b);
  return h("div.jm-shotbar", {},
    h("div.jm-shot-ticks", {}, ...marks.map((t) => h("i", { style: { left: `${(t / total) * 100}%` } }))),
    h("div.jm-shot-lane", {}, ...b.shots.map((s, i) =>
      h(`button.jm-shot.is-${s.kind}`, { type: "button", style: { left: `${(s.from / total) * 100}%`, width: `${((s.to - s.from) / total) * 100}%` }, title: `Shot ${i + 1}: ${KINDS[s.kind]}, ${(s.to - s.from).toFixed(1)} s`, on: { click: () => openWindow("shots") } },
        b.artist ? h("img", { src: b.artist.url, alt: "", draggable: false }) : null, h("span", {}, KINDS[s.kind])))),
    h("div.jm-shot-times", {}, ...[0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => h("span", {}, mins(total * f)))));
}

// ---------------------------------------------------------------- windows

/** The crew as a grid of faces: a tap puts that one in the slot the window is about. */
function crewGrid(b, onPick) {
  const used = new Set([b?.artist?.crew, ...castOf(b).map((p) => p.crew)].filter(Boolean));
  const here = slot === "lead" ? b?.artist?.crew : castOf(b)[slot]?.crew;
  return h("div.jm-crewgrid", { role: "group", "aria-label": "The crew" },
    ...CREW.map((c) => {
      const taken = used.has(c.id) && c.id !== here;
      return h(`button.jm-crew${here === c.id ? ".is-on" : ""}`, { type: "button", disabled: taken, "aria-pressed": String(here === c.id), title: taken ? `${c.name} is already on the stage` : `${c.name}, the ${c.role.toLowerCase()}`, on: { click: () => onPick(c.id) } },
        h("img", { src: crewFace(c.id), alt: "", draggable: false }), h("b", {}, c.name), h("em", {}, c.role));
    }),
    h("button.jm-crew.is-add", { type: "button", title: "A photo of yours, from your computer", on: { click: () => onPick("__file") } }, h("i", {}, jicon("plus")), h("b", {}, "Your photo"), h("em", {}, "From your computer")));
}

registerWindow("artist", {
  title: "THE CAST",
  wide: true,
  build() {
    const b = jam.jam?.body;
    const cast = castOf(b);
    if (slot !== "lead" && (typeof slot !== "number" || slot > cast.length || slot >= MAX_BAND)) slot = "lead";
    const isNew = typeof slot === "number" && slot >= cast.length;
    const tab = (to, name, sub) =>
      h("button.jm-slot", { type: "button", "aria-pressed": String(slot === to), on: { click: () => ((slot = to), changed("jam")) } }, h("b", {}, name), h("em", {}, sub));
    const pick = async (id) => {
      if (slot === "lead") {
        if (id === "__file") return pickFile("image/*", (f) => setArtist(f));
        return useCrew(id);
      }
      if (id === "__file") return pickFile("image/*", async (f) => (isNew ? addPerformerFile(f) : (await swapPerformer(slot, { picture: await uploaded(f) }))));
      return isNew ? addPerformer({ crew: id }) : swapPerformer(slot, { crew: id });
    };
    const uploaded = async (f) => {
      const { api } = await import("../api.js");
      const p = await api.upload(f, f.name);
      return { ...p, name: (f.name ?? "").replace(/\.\w+$/, "").slice(0, 24) || "Guest" };
    };
    const current = slot === "lead" ? null : cast[slot];
    return [
      h("div.jm-slots", {}, tab("lead", "The lead", b?.artist ? (crewById(b.artist.crew)?.name ?? b.artist.name ?? "Your photo") : "Pick who"),
        ...[0, 1].map((i) => tab(i, `Performer ${i + 2}`, cast[i] ? cast[i].name : i === cast.length ? "Add one" : "—")).filter((_, i) => i <= cast.length)),
      crewGrid(b, pick),
      h("div.jm-row", {},
        h("button.key", { type: "button", title: "A picture from the Library, one of our characters or a photo", on: { click: (e) => openPicker(e.currentTarget, { title: slot === "lead" ? "The artist" : "A performer", onPick: async (choice) => {
          try {
            const p = await pictureOf(choice);
            if (slot === "lead") await setArtist(p);
            else if (isNew) await addPerformer({ picture: p });
            else await swapPerformer(slot, { picture: p });
          } catch (e2) { toast(e2.message, { tone: "crit" }); }
        } }) } }, icon("image"), "From the library"),
        current ? h("button.key", { type: "button", title: "Take them off the stage", on: { click: () => (removePerformer(slot), (slot = "lead")) } }, jicon("trash"), "Take off the stage") : null),
      current ? h("div.jm-roles", { role: "group", "aria-label": "What they play" }, ...SUPPORT.map((r) =>
        h("button.jm-chip", { type: "button", "aria-pressed": String(current.role === r), on: { click: () => setRole(slot, r) } }, ROLES[r][0]))) : null,
      h("p.jm-note", {}, slot === "lead"
        ? "Choosing costs nothing: the picture goes up once. The lead is drawn into every shot, and sings when the lips follow the vocals."
        : "A performer stands beside the lead in the scenes, as what they play. Changing who is on the stage draws the looks and shots again when the video is made."),
    ];
  },
});

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

registerWindow("moves", {
  title: "THE DANCE",
  wide: true,
  build() {
    const b = jam.jam?.body;
    return [
      movesTiles(b),
      h("div.jm-row", {},
        h("button.key", { type: "button", disabled: jam.busy.has("dance"), on: { click: () => pickFile("video/*", setDance) } }, icon("upload"), b?.dance ? "Another dance" : "Add a dance"),
        b?.dance ? h("button.key", { type: "button", on: { click: () => clearDance() } }, icon("close"), "No dance") : null,
        b?.dance ? h("button.key", { type: "button", "aria-pressed": String(!!b.dance.synced), title: "In step with the sound: each shot copies the stretch of the dance at its own time", on: { click: () => ((b.dance.synced = !b.dance.synced), changed("jam")) } }, icon("loop"), "In step with the sound") : null),
      h("p.jm-note", {}, "Where nobody sings, the artist copies the dance (the shots made with LTX-2.5 read its motion). Choosing it costs nothing."),
    ];
  },
});

registerWindow("vibe", {
  title: "THE LOOK",
  build() {
    const b = jam.jam?.body;
    return [
      h("textarea.field.jm-style-field", { rows: 3, value: b?.style ?? "", placeholder: "pastel room, soft daylight, a giant jam-jar lid", disabled: !b, dataset: { focus: "vibe-text" }, on: { change: (e) => setStyle(e.target.value), keydown: (e) => e.stopPropagation() } }),
      h("div.jm-looks.is-window", {}, ...LOOKS.map((l) => lookTile(l, b))),
      h("span.label", {}, "LoRAs"),
      loraStack(b?.loras ?? [], (list) => b && setLoras(list)),
      h("p.jm-note", {}, "A new vibe means the shots are drawn again when the video is made."),
    ];
  },
});

const costOfShot = (s) => (cloud() ? creditsFor(Math.min(10, Math.max(2, Math.ceil(s.to - s.from)))) : null);

registerWindow("shots", {
  title: "THE SHOTS",
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
