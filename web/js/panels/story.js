import { h, icon, sprite } from "../dom.js";
import { openImage } from "../store.js";
import { view } from "../viewer.js";
import { go } from "../router.js";
import { stageReady } from "../control/link.js";
import { CAMERA_LABELS } from "../script.js";
import { pillField, pillText } from "../pills.js";
import { attachMenu } from "../attach.js";
import {
  story, STEPS, SIZES, loadStories, openStory, newStory, duplicateStory, closeStory, deleteStory, setStep, touch, writeStep,
  drawRef, drawShot, drawAllShots, drawAllRefs, addRefPicture, removeRefPicture, castOf, rollShot, rollAllShots, takeOf,
  openShotTab, sendToCut, addShot, removeShot, moveShot, selectShot, storyLookup, speaker,
} from "../story.js";

const CAMERA_ICON = { locked: "camera-locked", "push-in": "camera-push-in", "pull-out": "camera-pull-out", orbit: "camera-orbit", "crane-up": "camera-crane-up", handheld: "camera-handheld" };
const LENGTHS = [[30, "30 s"], [60, "1 min"], [90, "1:30"], [120, "2 min"]];
const busy = (k) => story.busy.has(k);
const key = (glyph, label, run, extra = {}) => h("button.key.is-icon", { type: "button", title: label, "aria-label": label, on: { click: run }, ...extra }, glyph);
const lamp = (tone) => h("span.lamp", { dataset: tone ? { tone } : {} });
let armed = null;

const lookup = storyLookup;

// ---------------------------------------------------------------- the bar of stories

function subbar() {
  const p = story.project;
  const tab = (id) => {
    const s = story.list.find((x) => x.id === id) ?? { id, name: "…" };
    const active = id === p?.id;
    return h("div.tab.story-tab", { role: "tab", tabindex: "0", "aria-selected": String(active), on: { click: () => !active && openStory(id) } },
      s.thumb ? h("img.tab-thumb", { src: s.thumb, alt: "", draggable: false }) : h("span.tab-thumb.is-icon", {}, icon("film")),
      h("span.tab-name", {}, active ? p.name : s.name),
      story.tabs.length > 1 ? h("span.tab-close", { role: "button", "aria-label": `Close ${s.name}`, title: "Close the tab — the story is kept", on: { click: (e) => (e.stopPropagation(), closeStory(id)) } }, icon("close")) : null);
  };
  const others = story.list.filter((s) => !story.tabs.includes(s.id));
  return h("div.subbar", {}, h("div.subbar-in", {},
    h("nav.tabs", { role: "tablist", "aria-label": "Stories" }, ...story.tabs.map(tab),
      h("button.tab-add", { type: "button", title: "A new story in its own tab", on: { click: () => newStory() } }, icon("plus"), "New story")),
    h("div.subbar-actions", {},
      others.length ? h("select.chip-select.story-open", { "aria-label": "Open a story", on: { change: (e) => e.target.value && openStory(e.target.value) } },
        h("option", { value: "" }, `${others.length} more`), ...others.map((s) => h("option", { value: s.id }, s.name))) : null,
      key(sprite("copy"), "Duplicate the story", () => duplicateStory()),
      key(icon("trash"), armed === p?.id ? "Click again to delete it for good" : "Delete the story", () => {
        if (armed !== p?.id) return ((armed = p?.id), touch(), setTimeout(() => ((armed = null), touch()), 3000));
        armed = null;
        deleteStory();
      }, { "aria-pressed": String(armed === p?.id) }))));
}

// ---------------------------------------------------------------- the five steps, each with its output

function stepRail(b) {
  const shots = b.board.shots;
  const rolled = shots.filter((s) => takeOf(s)?.status === "done").length;
  const output = {
    idea: b.idea.logline ? h("span.step-out", {}, h("span.step-text", {}, b.idea.logline)) : h("span.step-out.is-empty", {}, "a logline, a synopsis"),
    script: b.script.scenes.length ? h("span.step-out", {}, h("span.step-glyph", {}, sprite("file")), `${b.script.scenes.length} scenes · ${b.script.scenes.reduce((t, s) => t + s.beats.length, 0)} beats`) : h("span.step-out.is-empty", {}, "scenes, beats, lines"),
    world: b.cast.length || b.places.length ? h("span.step-out", {}, ...[...b.cast, ...b.places].slice(0, 3).map((x) => x.refs[0] ? h("img", { src: x.refs[0].url, alt: "", draggable: false }) : h("i.step-dot", { style: { background: x.color ?? "var(--s3)" } })), h("span", {}, `${b.cast.length} cast · ${b.places.length} places`)) : h("span.step-out.is-empty", {}, "sheets, places, look"),
    board: shots.length ? h("span.step-out", {}, ...shots.filter((s) => s.photo).slice(0, 3).map((s) => h("img", { src: s.photo.url, alt: "", draggable: false })), h("span", {}, `${shots.length} panels`)) : h("span.step-out.is-empty", {}, "every shot as a panel"),
    shots: shots.length ? h("span.step-out", {}, h("span.step-glyph", {}, icon("play")), `${rolled} of ${shots.length} rolled`) : h("span.step-out.is-empty", {}, "the takes, in order"),
  };
  const done = { idea: !!b.idea.logline, script: b.script.scenes.length > 0, world: b.cast.some((c) => c.refs.length), board: shots.length > 0 && shots.every((s) => s.photo), shots: shots.length > 0 && rolled === shots.length };
  return h("ol.story-steps", { "aria-label": "Steps" }, ...STEPS.map(([id, name], i) =>
    h("li", {}, h("button.story-step", { type: "button", "aria-current": String(b.step === id), on: { click: () => setStep(id) } },
      h("span.step-num", {}, String(i + 1)),
      h("span.step-head", {}, h("b", {}, name), lamp(busy(id) ? "busy" : done[id] ? "ok" : null)),
      output[id]))));
}

// ---------------------------------------------------------------- 1. idea

function ideaStep(b) {
  const i = b.idea;
  const field = (k, tag, label, extra = {}) => h(tag, { className: "field story-field", value: i[k] ?? "", "aria-label": label, on: { input: (e) => ((i[k] = e.target.value), touch()) }, ...extra });
  return h("div.story-desk.is-two", {},
    h("section.card.story-brief", {},
      h("div.card-head", {}, h("span.card-label", {}, "Brief"), h("span.card-hint", {}, "a sentence or a page")),
      field("brief", "textarea", "What the film is about", { rows: 7, placeholder: "An old lighthouse keeper and a girl find a glowing jellyfish after a storm and carry it back to the sea at night." }),
      h("div.story-options", {},
        h("span.row-label", {}, "Length"),
        h("div.segment", { role: "group", "aria-label": "Length" }, ...LENGTHS.map(([v, l]) => h("button", { type: "button", "aria-pressed": String(i.length === v), on: { click: () => ((i.length = v), touch()) } }, l))),
        h("span.row-label", {}, "Frame"),
        h("div.segment", { role: "group", "aria-label": "Frame" }, ...["16:9", "9:16", "1:1"].map((v) => h("button", { type: "button", "aria-pressed": String(i.aspect === v), on: { click: () => ((i.aspect = v), touch()) } }, v)))),
      h("button.key.is-primary.story-write", { type: "button", disabled: busy("idea"), on: { click: () => writeStep("idea") } }, sprite("prompt-enhance"), busy("idea") ? "Writing…" : i.logline ? "Write it again" : "Write the idea")),
    h("section.card.story-output", {},
      h("div.card-head", {}, h("span.card-label", {}, "The idea"), h("span.card-hint", {}, "what the script grows from")),
      i.logline || i.title ? h("div.story-idea", {},
        field("title", "input", "Title", { placeholder: "Title" }),
        h("label.story-label", {}, h("span.row-label", {}, "Logline"), field("logline", "textarea", "Logline", { rows: 2 })),
        h("label.story-label", {}, h("span.row-label", {}, "Synopsis"), field("synopsis", "textarea", "Synopsis", { rows: 6 })),
        h("div.story-pair", {},
          h("label.story-label", {}, h("span.row-label", {}, "Genre"), field("genre", "input", "Genre")),
          h("label.story-label", {}, h("span.row-label", {}, "Tone"), field("tone", "input", "Tone"))),
        h("div.story-next", {}, h("button.key", { type: "button", disabled: busy("script"), on: { click: () => writeStep("script") } }, sprite("prompt-enhance"), b.script.scenes.length ? "Write the script again" : "Write the script"), nextKey("script")))
        : empty(busy("idea") ? "Writing the idea…" : "The title, the logline and the synopsis come here.")));
}

const empty = (words) => h("p.story-empty", {}, words);
const nextKey = (step) => h("button.key.is-quiet", { type: "button", title: "The next step", on: { click: () => setStep(step) } }, STEPS.find(([id]) => id === step)[1], icon("next"));

// ---------------------------------------------------------------- 2. script

function scriptStep(b) {
  const scenes = b.script.scenes;
  const sceneCard = (s, n) => h("article.card.story-scene", {},
    h("div.story-scene-head", {},
      h("span.step-num", {}, String(n + 1)),
      h("input.field.story-slug", { value: s.slug, "aria-label": "Slugline", on: { input: (e) => ((s.slug = e.target.value.toUpperCase()), touch()) } }),
      key(icon("trash"), "Take the scene out", () => ((b.script.scenes = scenes.filter((x) => x !== s)), touch()))),
    h("textarea.field.story-field", { rows: 2, value: s.summary, "aria-label": "What happens", on: { input: (e) => ((s.summary = e.target.value), touch()) } }),
    h("ol.story-beats", {}, ...s.beats.map((beat, k) => h("li", {},
      h("input.field.is-line", { value: beat, "aria-label": `Beat ${k + 1}`, on: { input: (e) => ((s.beats[k] = e.target.value), touch()) } }),
      h("button.ctl-mini", { type: "button", title: "Take the beat out", "aria-label": "Take the beat out", on: { click: () => (s.beats.splice(k, 1), touch()) } }, icon("close")))),
      h("li.is-add", {}, h("button.key.is-sm.is-quiet", { type: "button", on: { click: () => (s.beats.push(""), touch()) } }, icon("plus"), "Beat"))),
    s.lines.length ? h("div.story-lines", {}, ...s.lines.map((l, k) => h("div.story-line", {},
      h("select.chip-select", { "aria-label": "Who says it", on: { change: (e) => ((l.who = e.target.value), touch()) } }, ...b.cast.map((c) => h("option", { value: c.name, selected: c.name === l.who }, c.name))),
      h("input.field.is-line", { value: l.line, "aria-label": "The line", on: { input: (e) => ((l.line = e.target.value), touch()) } }),
      h("button.ctl-mini", { type: "button", title: "Take the line out", "aria-label": "Take the line out", on: { click: () => (s.lines.splice(k, 1), touch()) } }, icon("close"))))) : null,
    b.cast.length ? h("button.key.is-sm.is-quiet.story-add-line", { type: "button", on: { click: () => (s.lines.push({ who: b.cast[0].name, line: "", how: "" }), touch()) } }, icon("plus"), "Line") : null);
  return h("div.story-desk.is-script", {},
    references(b, { compact: true }),
    h("section.story-sheet", {},
      h("div.story-sheet-head", {}, h("span.card-label", {}, "Script"), h("span.card-hint", {}, scenes.length ? `${scenes.length} scenes` : ""), h("span.spacer"),
        h("button.key", { type: "button", disabled: busy("script"), on: { click: () => writeStep("script") } }, sprite("prompt-enhance"), busy("script") ? "Writing…" : scenes.length ? "Write it again" : "Write the script")),
      scenes.length ? h("div.story-scenes", {}, ...scenes.map(sceneCard),
        h("div.story-next", {}, h("button.key", { type: "button", disabled: busy("world"), on: { click: () => (writeStep("world"), setStep("world")) } }, sprite("prompt-enhance"), "Describe the cast and the world"), nextKey("world")))
        : empty(busy("script") ? "Writing the script…" : "Write the idea first; the script comes from its logline and synopsis.")));
}

// ---------------------------------------------------------------- 3. cast & world

function refCard(kind, item, b) {
  const id = item.id;
  const busyKey = `ref:${kind}:${id ?? "look"}`;
  const clip = h("button.key.is-icon", { type: "button", title: "Add a picture — from your computer or the Library", "aria-label": "Add a picture", "aria-expanded": "false" }, sprite("paperclip"));
  clip.addEventListener("click", () => attachMenu(clip, {
    files: async (files) => {
      for (const f of files) {
        const res = await fetch(`api/photos?name=${encodeURIComponent(item.name ?? "look")}`, { method: "POST", headers: { "Content-Type": f.type }, body: f });
        if (res.ok) addRefPicture(kind, id, await res.json());
      }
    },
    picture: (photo) => addRefPicture(kind, id, photo),
    taken: (photo) => item.refs.some((r) => r.file === photo.file),
  }));
  const words = h("textarea.field.story-field", { rows: kind === "look" ? 3 : 3, value: item.words ?? "", placeholder: kind === "cast" ? "How they look: age, face, hair, clothes" : kind === "place" ? "The place: where, when, weather, light" : "The look: medium, light, colour, lens, texture", "aria-label": "Words", on: { input: (e) => ((item.words = e.target.value), touch()) } });
  return h("article.card.story-ref", { className: `is-${kind}` },
    h("div.story-ref-head", {},
      kind === "cast" ? h("i.story-chip", { style: { background: item.color } }) : kind === "place" ? h("span.step-glyph", {}, sprite("asset-tree")) : h("span.step-glyph", {}, sprite("view-material")),
      kind === "look" ? h("b", {}, "Look") : h("input.field.is-line.story-name", { value: item.name, "aria-label": "Name", on: { input: (e) => ((item.name = e.target.value), touch()) } }),
      kind === "look" ? null : h("span.story-tag", {}, `@${item.tag}`),
      h("span.spacer"),
      clip,
      key(sprite("image-generate"), kind === "cast" ? "Draw a character sheet" : kind === "place" ? "Draw the place" : "Draw a frame of the look", () => drawRef(kind === "look" ? "look" : kind, id), { disabled: busy(busyKey) })),
    item.refs.length || busy(busyKey) ? h("div.story-ref-pics", {}, ...item.refs.map((r) => h("div.story-ref-pic", {},
      h("button", { type: "button", title: "Look at it", on: { click: () => view(r.url) } }, h("img", { src: r.url, alt: "", draggable: false })),
      h("button.ctl-mini.story-ref-off", { type: "button", title: "Take it off", "aria-label": "Take it off", on: { click: () => removeRefPicture(kind, id, r.file) } }, icon("close")))),
      busy(busyKey) ? h("div.story-ref-pic.is-drawing", {}, h("span.typing", {}, h("i"), h("i"), h("i"))) : null) : null,
    words,
    kind === "look" ? h("div.story-palette", {}, ...(item.palette ?? []).map((c) => h("i", { style: { background: c }, title: c }))) : null);
}

function worldStep(b) {
  return h("div.story-desk.is-world", {},
    h("section.story-sheet", {},
      h("div.story-sheet-head", {}, h("span.card-label", {}, "Cast & world"), h("span.card-hint", {}, "the references every panel and shot follows"), h("span.spacer"),
        h("button.key", { type: "button", disabled: busy("world"), on: { click: () => writeStep("world") } }, sprite("prompt-enhance"), busy("world") ? "Describing…" : "Describe them"),
        h("button.key", { type: "button", on: { click: () => drawAllRefs() } }, sprite("image-generate"), "Draw what's missing")),
      b.cast.length || b.places.length ? h("div.story-world", {},
        h("span.story-group", {}, "Cast"), h("div.story-refs-grid", {}, ...b.cast.map((c) => refCard("cast", c, b))),
        h("span.story-group", {}, "Places"), h("div.story-refs-grid", {}, ...b.places.map((p) => refCard("place", p, b))),
        h("span.story-group", {}, "Look"), h("div.story-refs-grid", {}, refCard("look", b.look, b)),
        h("div.story-next", {}, h("button.key", { type: "button", disabled: busy("board"), on: { click: () => (writeStep("board"), setStep("board")) } }, sprite("prompt-enhance"), "Board the shots"), nextKey("board")))
        : empty("The script names the cast and the places; write it first.")));
}

/** The references, kept in view while boarding: who, where, and the look. */
function references(b, { compact = false } = {}) {
  const person = (c) => h("div.story-mini", { title: c.words || c.about },
    h("div.story-mini-head", {}, h("i.story-chip", { style: { background: c.color } }), h("b", {}, c.name), h("span.story-tag", {}, `@${c.tag}`)),
    !compact && c.refs[0] ? h("img", { src: c.refs[0].url, alt: "", draggable: false, on: { click: () => view(c.refs[0].url) } }) : compact ? h("span.story-about", {}, c.about || c.words) : null);
  const place = (p) => h("div.story-mini", { title: p.words || p.about },
    !compact && p.refs[0] ? h("img", { src: p.refs[0].url, alt: "", draggable: false, on: { click: () => view(p.refs[0].url) } }) : null,
    h("div.story-mini-head", {}, h("b", {}, p.name), h("span.story-tag", {}, `@${p.tag}`)), compact ? h("span.story-about", {}, p.about || p.words) : null);
  return h("aside.story-refs", { "aria-label": "References" },
    h("span.card-label", {}, "References"),
    h("span.story-group", {}, "Cast"), ...(b.cast.length ? b.cast.map(person) : [h("p.story-empty", {}, "—")]),
    h("span.story-group", {}, "Places"), ...(b.places.length ? b.places.map(place) : [h("p.story-empty", {}, "—")]),
    !compact && (b.look.refs.length || b.look.palette.length) ? h("span.story-group", {}, "Look") : null,
    !compact && b.look.refs.length ? h("div.story-look", {}, ...b.look.refs.slice(0, 3).map((r) => h("img", { src: r.url, alt: "", draggable: false, on: { click: () => view(r.url) } }))) : null,
    !compact && b.look.palette.length ? h("div.story-palette", {}, ...b.look.palette.map((c) => h("i", { style: { background: c }, title: c }))) : null);
}

// ---------------------------------------------------------------- 4. storyboard

function panel(b, s) {
  const take = takeOf(s);
  const drawing = busy(`shot:${s.id}`);
  const tone = take?.status === "done" ? "ok" : take && take.status !== "failed" ? "busy" : take?.status === "failed" ? "crit" : null;
  const card = h("article.story-panel", { className: story.selected === s.id ? "is-selected" : "", draggable: true, on: { click: () => selectShot(s.id) } },
    h("div.story-frame", { className: drawing ? "is-drawing" : "" },
      (b.step === "shots" && s.still) || s.photo ? h("img", { src: (b.step === "shots" && s.still ? s.still : s.photo).url, alt: "", draggable: false }) : h("span.story-frame-empty", {}, sprite("image-generate")),
      h("span.story-code", {}, s.code),
      h("span.story-size", {}, SIZES.find(([v]) => v === s.size)?.[1] ?? s.size),
      h("span.story-secs", {}, `${s.seconds} s`),
      h("span.story-cam", { title: CAMERA_LABELS[s.camera] }, sprite(CAMERA_ICON[s.camera] ?? "camera-locked")),
      drawing ? h("span.story-drawing", {}, "Drawing…") : null,
      tone ? h("span.story-take", { title: take.status === "done" ? "Rolled" : take.status }, lamp(tone)) : null),
    pillText("p.story-action", s.action, lookup),
    s.line?.text ? h("p.story-say", {}, h("span.pill.is-who", {}, `@${speaker(b, s.line.who)?.tag ?? String(s.line.who).replace(/^@/, "")}`), `“${s.line.text}”`) : null);
  card.addEventListener("dragstart", (e) => (e.dataTransfer.setData("text/story-shot", s.id), card.classList.add("is-dragging")));
  card.addEventListener("dragend", () => card.classList.remove("is-dragging"));
  card.addEventListener("dragover", (e) => [...e.dataTransfer.types].includes("text/story-shot") && e.preventDefault());
  card.addEventListener("drop", (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/story-shot");
    if (id && id !== s.id) moveShot(id, b.board.shots.findIndex((x) => x.id === s.id));
  });
  return card;
}

function boardStep(b) {
  const shots = b.board.shots;
  const scenes = b.script.scenes;
  const groups = scenes.map((sc, i) => ({ sc, n: i + 1, shots: shots.filter((s) => s.scene === i + 1) }));
  const stray = shots.filter((s) => !scenes[s.scene - 1]);
  const sheet = h("section.story-sheet.is-board", {},
    h("div.story-sheet-head", {}, h("span.card-label", {}, "Storyboard"), h("span.card-hint", {}, shots.length ? `${shots.length} shots · ${shots.reduce((t, s) => t + s.seconds, 0)} s` : ""),
      h("nav.story-jump", { "aria-label": "Scenes" }, ...groups.map((g) => h("a", { href: `#scene-${g.n}`, on: { click: (e) => (e.preventDefault(), document.getElementById(`story-scene-${g.n}`)?.scrollIntoView({ behavior: "smooth", block: "start" })) } }, String(g.n).padStart(2, "0")))),
      h("span.spacer"),
      h("div.segment.is-sm", { role: "group", "aria-label": "How panels are drawn" },
        h("button", { type: "button", "aria-pressed": String(b.board.style === "sketch"), title: "Drawn as pencil sketches", on: { click: () => ((b.board.style = "sketch"), touch()) } }, "Sketch"),
        h("button", { type: "button", "aria-pressed": String(b.board.style === "film"), title: "Drawn as film frames, in the look", on: { click: () => ((b.board.style = "film"), touch()) } }, "Film")),
      h("button.key", { type: "button", disabled: busy("board"), on: { click: () => writeStep("board") } }, sprite("prompt-enhance"), busy("board") ? "Boarding…" : shots.length ? "Board it again" : "Board the shots"),
      shots.length ? h("button.key", { type: "button", on: { click: () => drawAllShots() } }, sprite("image-generate"), "Draw what's missing") : null),
    shots.length ? h("div.story-scroll", { dataset: { scrollKey: "board" } },
      ...groups.map((g) => h("section.story-scene-row", { id: `story-scene-${g.n}` },
        h("div.story-scene-title", {}, h("b", {}, `Scene ${g.n} · ${g.sc.slug}`), h("span", {}, g.sc.summary), h("span.spacer"), h("span.card-hint", {}, `${g.shots.length} shots · ${g.shots.reduce((t, s) => t + s.seconds, 0)} s`)),
        h("div.story-panels", {}, ...g.shots.map((s) => panel(b, s)),
          h("button.story-panel.is-add", { type: "button", title: "Add a shot to the scene", "aria-label": "Add a shot", on: { click: () => addShot(g.n, g.shots.at(-1)) } }, icon("plus"))))),
      ...(stray.length ? [h("section.story-scene-row", {}, h("div.story-scene-title", {}, h("b", {}, "Other shots")), h("div.story-panels", {}, ...stray.map((s) => panel(b, s))))] : []))
      : empty(busy("board") ? "Boarding the shots…" : "Board the shots: each scene of the script becomes panels, with their frames, sizes, moves and lines."));
  return h("div.story-desk.is-board", {}, references(b), sheet, inspector(b));
}

function inspector(b) {
  const s = b.board.shots.find((x) => x.id === story.selected);
  if (!s) return h("aside.story-inspector", {}, h("span.card-label", {}, "Shot"), empty("Pick a panel."));
  const take = takeOf(s);
  const frame = pillField({ label: "The frame", placeholder: "The first frame: who (@name), where (@place), what they do, the light", lookup, className: "field story-prompt" });
  frame.value = s.frame;
  frame.addEventListener("input", () => ((s.frame = frame.value), touch()));
  const members = castOf(b, `${s.frame} ${s.action}`);
  return h("aside.story-inspector", { "aria-label": "Shot" },
    h("div.story-ins-head", {}, h("span.card-label", {}, "Shot inspector"), h("span.spacer"), h("b.story-ins-code", {}, s.code), key(icon("trash"), "Take the shot out", () => removeShot(s.id))),
    h("div.story-ins-frame", { className: busy(`shot:${s.id}`) ? "is-drawing" : "" },
      take?.status === "done" ? h("video", { src: take.video, muted: true, loop: true, autoplay: true, playsInline: true }) : s.photo ? h("img", { src: s.photo.url, alt: "", draggable: false, on: { click: () => view(s.photo.url) } }) : h("span.story-frame-empty", {}, sprite("image-generate"))),
    h("span.row-label", {}, "Shot size"),
    h("div.segment", { role: "group", "aria-label": "Shot size" }, ...SIZES.map(([v, l]) => h("button", { type: "button", "aria-pressed": String(s.size === v), on: { click: () => ((s.size = v), touch()) } }, l))),
    h("span.row-label", {}, "Camera move"),
    h("div.story-moves", { role: "group", "aria-label": "Camera move" }, ...Object.keys(CAMERA_ICON).map((m) => h("button.ctl-tool", { type: "button", "aria-pressed": String(s.camera === m), title: CAMERA_LABELS[m], "aria-label": CAMERA_LABELS[m], on: { click: () => ((s.camera = m), touch()) } }, sprite(CAMERA_ICON[m])))),
    h("div.story-ins-row", {}, h("span.row-label", {}, "Duration"),
      h("div.story-stepper", {}, h("button", { type: "button", "aria-label": "Shorter", disabled: s.seconds <= 3, on: { click: () => ((s.seconds -= 1), touch()) } }, "−"), h("b", {}, `${s.seconds.toFixed(1)} s`), h("button", { type: "button", "aria-label": "Longer", disabled: s.seconds >= 8, on: { click: () => ((s.seconds += 1), touch()) } }, "+"))),
    h("span.row-label", {}, "Frame prompt"), frame.el,
    h("span.row-label", {}, "Action"),
    h("textarea.field.story-field", { rows: 2, value: s.action, "aria-label": "What happens", on: { input: (e) => ((s.action = e.target.value), touch()) } }),
    h("span.row-label", {}, "Dialogue"),
    h("div.story-line", {},
      h("select.chip-select", { "aria-label": "Who says it", on: { change: (e) => ((s.line = e.target.value ? { who: e.target.value, text: s.line?.text ?? "" } : null), touch()) } },
        h("option", { value: "" }, "No line"), ...b.cast.map((c) => h("option", { value: c.name, selected: speaker(b, s.line?.who) === c }, c.name))),
      h("input.field.is-line", { value: s.line?.text ?? "", disabled: !s.line, placeholder: "What they say", "aria-label": "The line", on: { input: (e) => s.line && ((s.line.text = e.target.value), touch()) } })),
    h("span.row-label", {}, "Sound"),
    h("input.field.is-line", { value: s.sound, placeholder: "What we hear", "aria-label": "Sound", on: { input: (e) => ((s.sound = e.target.value), touch()) } }),
    members.length ? h("span.row-label", {}, "References used") : null,
    members.length ? h("div.story-used", {}, ...members.map((m) => h("div.story-used-item", { title: m.words || m.about }, m.refs[0] ? h("img", { src: m.refs[0].url, alt: "", draggable: false }) : h("i.story-chip", { style: { background: m.color ?? "var(--s3)" } }), h("span", {}, m.name)))) : null,
    h("div.story-ins-keys", {},
      key(icon("remix"), s.photo ? "Draw the frame again" : "Draw the frame", () => drawShot(s.id), { disabled: busy(`shot:${s.id}`) }),
      key(sprite("image-edit"), "Edit the frame in the Image window", () => (s.photo ? openImage({ refs: [{ ...s.photo, name: "frame" }], template: "edit" }) : null), { disabled: !s.photo }),
      key(sprite("section-stage"), "Block it on the Stage", () => stageIt(b, s)),
      take ? key(icon("open"), "Open its take in Shot", () => openShotTab(s)) : null,
      h("button.roll.story-roll", { type: "button", disabled: busy(`roll:${s.id}`) || (take && !["done", "failed", "canceled"].includes(take.status)), on: { click: () => rollShot(s.id) } }, sprite("scene-render"), take?.status === "done" ? "ROLL AGAIN" : "ROLL SHOT")));
}

/** A panel blocked on the Stage, as a stage of its own: the Stage's assistant stages what it shows. */
async function stageIt(b, s) {
  go("stage");
  const { projects } = await stageReady;
  await projects?.newProject(`${b.idea.title || story.project.name} — ${s.code}`.slice(0, 60)).catch(() => null);
  const { askStage } = await import("../store.js");
  const who = castOf(b, `${s.frame} ${s.action}`).filter((m) => m.person).map((m) => `${m.name} (${m.words || m.about})`).join("; ");
  askStage(`New scene: ${s.action.replace(/@([a-z0-9-]+)/gi, (_, t) => b.cast.find((c) => c.tag === t)?.name ?? b.places.find((p) => p.tag === t)?.name ?? t)}, ${s.size} shot, camera ${CAMERA_LABELS[s.camera]?.toLowerCase() ?? "locked"}.${who ? ` Cast: ${who}.` : ""} Frame ${b.idea.aspect}, ${s.seconds} seconds.`);
}

// ---------------------------------------------------------------- 5. shots: the animatic

const animatic = { playing: false, index: 0, timer: 0, started: 0 };
function stopAnimatic() {
  animatic.playing = false;
  clearTimeout(animatic.timer);
  document.querySelector("#page-story .story-screen video")?.pause();
}

function shotsStep(b) {
  const shots = b.board.shots;
  const rolled = shots.filter((s) => takeOf(s)?.status === "done").length;
  const screen = h("div.story-screen");
  const bar = h("div.story-anim-bar", {}, ...shots.map((s, i) => h("button", { type: "button", title: `${s.code} — ${s.seconds} s`, style: { flexGrow: String(s.seconds) }, className: takeOf(s)?.status === "done" ? "is-rolled" : s.photo ? "is-drawn" : "", on: { click: () => show(i, false) } })));
  const code = h("span.story-anim-code");
  const show = (i, play = animatic.playing) => {
    clearTimeout(animatic.timer);
    animatic.index = i;
    const s = shots[i];
    if (!s) return stopAnimatic();
    const take = takeOf(s);
    bar.querySelectorAll("button").forEach((x, k) => x.classList.toggle("is-on", k === i));
    code.textContent = `${s.code} · ${s.seconds} s${take?.status === "done" ? "" : " · drawn frame"}`;
    if (take?.status === "done") {
      const v = h("video", { src: take.video, playsInline: true, preload: "auto", poster: s.photo?.url ?? "" });
      screen.replaceChildren(v);
      v.addEventListener("ended", () => animatic.playing && show(i + 1));
      if (play) v.play().catch(() => {});
    } else {
      screen.replaceChildren(s.photo ? h("img", { src: s.photo.url, alt: "", draggable: false }) : h("span.story-frame-empty", {}, sprite("image-generate")));
      if (play) animatic.timer = setTimeout(() => animatic.playing && show(i + 1), s.seconds * 1000);
    }
  };
  const playKey = h("button.play", { type: "button", "aria-label": "Play the animatic", disabled: !shots.length, on: { click: () => {
    if (animatic.playing) return (stopAnimatic(), (playKey.replaceChildren(icon("play"))));
    animatic.playing = true;
    playKey.replaceChildren(icon("pause"));
    show(animatic.index >= shots.length ? 0 : animatic.index, true);
  } } }, icon(animatic.playing ? "pause" : "play"));
  requestAnimationFrame(() => shots.length && show(Math.min(animatic.index, shots.length - 1), false));
  const total = shots.reduce((t, s) => t + s.seconds, 0);
  return h("div.story-desk.is-board", {},
    references(b),
    h("section.story-sheet", {},
      h("div.story-sheet-head", {}, h("span.card-label", {}, "Shots"), h("span.card-hint", {}, `${rolled} of ${shots.length} rolled · ${total} s`), h("span.spacer"),
        h("button.key", { type: "button", disabled: !shots.length, on: { click: () => rollAllShots() } }, sprite("scene-render"), rolled ? "Roll what's missing" : "Roll every shot"),
        h("button.key.is-primary", { type: "button", disabled: !rolled, on: { click: () => (stopAnimatic(), sendToCut()) } }, icon("scissors"), "Send to Cut")),
      shots.length ? h("div.story-animatic", {}, screen, h("div.story-anim-row", {}, playKey, code), bar,
        h("div.story-strip", {}, ...shots.map((s) => panel(b, s))))
        : empty("Board the shots first: every panel rolls into a take here.")),
    inspector(b));
}

// ---------------------------------------------------------------- the page

// the assistant's bar docks here; the slot is kept across redraws so the bar stays in it
const chatSlot = h("div.story-chat", { id: "story-chat" });

export function renderStory(el) {
  loadStories();
  const p = story.project;
  if (!p) {
    return el.replaceChildren(h("div.story-loading", {}, story.error ? h("p", {}, story.error) : h("span.typing", {}, h("i"), h("i"), h("i"))));
  }
  const b = p.body;
  if (b.step !== "shots") stopAnimatic();
  const steps = { idea: ideaStep, script: scriptStep, world: worldStep, board: boardStep, shots: shotsStep };
  el.replaceChildren(subbar(), h("div.story-page", {}, stepRail(b), (steps[b.step] ?? ideaStep)(b)), chatSlot);
  document.dispatchEvent(new Event("story:drawn"));
}

