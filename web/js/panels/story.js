import { h, icon, sprite } from "../dom.js";
import { openImage } from "../store.js";
import { view } from "../viewer.js";
import { CAMERA_LABELS } from "../script.js";
import { pillField, pillText } from "../pills.js";
import { attachMenu } from "../attach.js";
import {
  story, SIZES, KINDS, BIBLE, loadStories, openStory, newStory, duplicateStory, closeStory, deleteStory, undo, redo, commit, touch, refresh,
  select, addBlock, updateBlock, removeBlock, moveBlock, addRef, updateRef, removeRef, write, writeAll, scenesOf, shotsOf,
  codeOf, blockOf, bible, speaker, castOf, storyLookup, drawRef, drawShot, drawMissingRefs, drawMissingShots, addRefPicture,
  removeRefPicture, rollShot, rollMissingShots, takeOf, openInShot, stageShot, sendToCut,
} from "../story.js";

const CAMERA_ICON = { locked: "camera-locked", "push-in": "camera-push-in", "pull-out": "camera-pull-out", orbit: "camera-orbit", "crane-up": "camera-crane-up", handheld: "camera-handheld" };
const LENGTHS = [[30, "30 s"], [60, "1 min"], [90, "1:30"], [120, "2 min"]];
const KIND_GLYPH = { scene: () => sprite("scene-camera"), action: () => icon("pencil"), line: () => sprite("message"), shot: () => sprite("frame-first"), note: () => sprite("file") };
const busy = (k) => story.busy.has(k);
const key = (glyph, label, run, extra = {}) => h("button.key.is-icon", { type: "button", title: label, "aria-label": label, on: { click: (e) => (e.stopPropagation(), run(e)) }, ...extra }, glyph);
const mini = (glyph, label, run, extra = {}) => h("button.ctl-mini", { type: "button", title: label, "aria-label": label, on: { click: (e) => (e.stopPropagation(), run(e)) }, ...extra }, glyph);
const lamp = (tone) => h("span.lamp", { dataset: tone ? { tone } : {} });
const isSel = (kind, id) => story.selected?.kind === kind && story.selected?.id === id;
const selBlock = (id) => isSel("block", id);
const redraw = () => refresh();
// typing saves quietly, so the field keeps its caret; leaving it makes the undo step
const typed = (done) => (done ? commit() : touch({ quiet: true }));
let armed = null;
let inserting = null;
// where a click picked a block, so its field gets the caret there once it is drawn ("end": a new block)
let focusAt = null;

/** A picture into the Library and onto a sheet. */
async function importInto(k, x, files) {
  for (const f of [...(files ?? [])].filter((f) => f.type?.startsWith("image/"))) {
    const res = await fetch(`api/photos?name=${encodeURIComponent(x.name ?? "look")}`, { method: "POST", headers: { "Content-Type": f.type }, body: f });
    if (res.ok) addRefPicture(k, x.id, await res.json());
  }
}
const attachTo = (anchor, k, x) => attachMenu(anchor, { files: (files) => importInto(k, x, files), picture: (photo) => addRefPicture(k, x.id, photo), taken: (photo) => (x.refs ?? []).some((r) => r.file === photo.file) });

// ---------------------------------------------------------------- the bar of stories

function subbar() {
  const p = story.project;
  const tab = (id) => {
    const s = story.list.find((x) => x.id === id) ?? { id, name: "…" };
    const active = id === p?.id;
    return h("div.tab", { role: "tab", tabindex: "0", "aria-selected": String(active), on: { click: () => !active && openStory(id) } },
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
      key(sprite("edit-undo"), "Undo — Ctrl Z", undo, { disabled: !story.history.length }),
      key(sprite("edit-redo"), "Redo — Ctrl Shift Z", redo, { disabled: !story.future.length }),
      key(sprite("copy"), "Duplicate the story", () => duplicateStory()),
      key(icon("trash"), armed === p?.id ? "Click again to delete it for good" : "Delete the story", () => {
        if (armed !== p?.id) return ((armed = p?.id), redraw(), setTimeout(() => ((armed = null), redraw()), 3000));
        armed = null;
        deleteStory();
      }, { "aria-pressed": String(armed === p?.id) }))));
}

// ---------------------------------------------------------------- left: the story bible

function bibleCard(kind, x) {
  const k = kind;
  const busyKey = `ref:${k}:${x.id ?? "look"}`;
  const clip = mini(sprite("image-upload"), "Import a picture — from your computer or the Library", () => attachTo(clip, k, x), { "aria-expanded": "false" });
  const pic = x.refs[0];
  const label = kind === "cast" ? "Render a character sheet" : kind === "places" ? "Render the place" : kind === "props" ? "Render the prop" : "Render a frame of the look";
  const card = h("article.bible-card", { className: `is-${kind}${isSel(kind, x.id) ? " is-selected" : ""}`, on: { click: () => select(kind, x.id) } },
    h("div.bible-head", {},
      kind === "cast" ? h("i.story-chip", { style: { background: x.color } }) : null,
      kind === "look" ? h("b", {}, "Look") : h("b", {}, x.name),
      kind === "look" ? null : h("span.story-tag", {}, `@${x.tag}`),
      h("span.spacer"),
      mini(sprite("image-generate"), label, () => drawRef(k, x.id), { disabled: busy(busyKey) }),
      clip),
    pic || busy(busyKey) ? h("div.bible-pic", { className: `${busy(busyKey) ? "is-drawing" : ""}${kind === "props" ? " is-square" : ""}` },
      pic ? h("img", { src: pic.url, alt: "", draggable: false, on: { click: (e) => (e.stopPropagation(), view(pic.url)) } }) : null,
      busy(busyKey) ? h("span.bible-drawing", {}, "Rendering…") : null,
      x.refs.length > 1 ? h("span.bible-count", {}, `+${x.refs.length - 1}`) : null) : null,
    kind === "look" && x.palette?.length ? h("div.story-palette", {}, ...x.palette.map((c) => h("i", { style: { background: c }, title: c }))) : null,
    x.words || x.about ? h("p.bible-words", {}, x.about && kind === "cast" ? x.about : x.words || x.about) : h("p.bible-words.is-empty", {}, kind === "look" ? "The film's style: medium, light, colour, lens" : "How it looks, for its sheet"));
  // a picture dropped on a card goes on its sheet
  card.addEventListener("dragover", (e) => [...e.dataTransfer.types].includes("Files") && (e.preventDefault(), card.classList.add("is-drop")));
  card.addEventListener("dragleave", () => card.classList.remove("is-drop"));
  card.addEventListener("drop", (e) => (e.preventDefault(), card.classList.remove("is-drop"), importInto(k, x, e.dataTransfer.files)));
  return card;
}

function bibleColumn(b) {
  return h("aside.story-bible", { "aria-label": "Story bible", dataset: { scrollKey: "bible" } },
    h("div.story-col-head", {}, h("span.card-label", {}, "Story bible"), h("span.spacer"),
      key(sprite("prompt-enhance"), busy("world") ? "Describing…" : "Describe everyone and everything from the script", () => write("world"), { disabled: busy("world") }),
      key(sprite("image-generate"), "Render what has no picture yet", () => drawMissingRefs())),
    ...BIBLE.flatMap(([kind, label, one]) => [
      h("div.bible-group", {}, h("span.story-group", {}, label), mini(icon("plus"), `Add a ${one}`, () => addRef(kind))),
      h("div.bible-list", { className: `is-${kind}` }, ...(b[kind].length ? b[kind].map((x) => bibleCard(kind, x)) : [h("p.bible-empty", {}, kind === "cast" ? "The script names the cast." : kind === "places" ? "The script names its places." : "Key objects the story turns on.")])),
    ]),
    h("div.bible-group", {}, h("span.story-group", {}, "Look")),
    bibleCard("look", { ...b.look, id: undefined }));
}

// ---------------------------------------------------------------- center: the story, top to bottom

function titleBlock(b) {
  const i = b.idea;
  if (!i.logline && !i.title) {
    // the start: a brief, and one key that writes a whole first draft
    return h("section.doc-start", {},
      h("span.card-label", {}, "A new story"),
      h("textarea.field.doc-brief", { rows: 5, value: i.brief, placeholder: "What is the film about? A sentence or a page: an old lighthouse keeper and a girl find a glowing jellyfish after a storm and carry it back to the sea at night.", "aria-label": "What the film is about", on: { input: (e) => ((i.brief = e.target.value), typed(false)), change: () => commit(), keydown: (e) => e.stopPropagation() } }),
      h("div.doc-options", {},
        h("div.segment", { role: "group", "aria-label": "Length" }, ...LENGTHS.map(([v, l]) => h("button", { type: "button", "aria-pressed": String(i.length === v), on: { click: () => ((i.length = v), commit()) } }, l))),
        h("div.segment", { role: "group", "aria-label": "Frame" }, ...["16:9", "9:16", "1:1"].map((v) => h("button", { type: "button", "aria-pressed": String(i.aspect === v), on: { click: () => ((i.aspect = v), commit()) } }, v))),
        h("span.spacer"),
        h("button.key.is-primary", { type: "button", disabled: busy("idea") || busy("script") || busy("world"), on: { click: () => writeAll() } }, sprite("prompt-enhance"), busy("idea") ? "Writing the idea…" : busy("script") ? "Writing the script…" : busy("world") ? "Describing the cast…" : "Write the story")),
      h("p.doc-hint", {}, "Gemma 4 writes the idea, then the script, then who and where it is. Or start from an empty page and add blocks with the + below."));
  }
  return h("header.doc-title", { className: isSel("idea") ? "is-selected" : "", on: { click: () => select("idea") } },
    h("div.doc-title-row", {}, h("h1", {}, i.title || "Untitled"), h("span.spacer"),
      h("div.doc-chips", {}, ...[i.genre, i.tone, LENGTHS.find(([v]) => v === i.length)?.[1] ?? `${i.length} s`, i.aspect].filter(Boolean).map((t) => h("span.chip", {}, t)))),
    i.logline ? h("p.doc-logline", {}, i.logline) : null,
    i.synopsis ? pillText("p.doc-synopsis", i.synopsis, storyLookup) : null);
}

/** The thin line between two blocks that adds one there: a scene, an action, a line, a shot or a note. */
function inserter(after, kinds = KINDS) {
  const open = inserting === after;
  return h("div.doc-insert", { className: open ? "is-open" : "" },
    h("button.doc-insert-key", { type: "button", title: "Add here", "aria-label": "Add a block here", on: { click: (e) => (e.stopPropagation(), (inserting = open ? null : after), redraw()) } }, icon("plus")),
    open ? h("div.doc-insert-menu", { role: "menu" }, ...kinds.map(([k, label]) => h("button", { type: "button", role: "menuitem", on: { click: (e) => (e.stopPropagation(), (inserting = null), (focusAt = "end"), addBlock(k, after)) } }, KIND_GLYPH[k](), h("span", {}, label)))) : null);
}

/** Words with their pills, written in place once the block is picked: Enter starts the next block, Escape lets go. */
function editable(text, set, placeholder, className = "", next = null) {
  const f = pillField({ placeholder, label: placeholder, lookup: storyLookup, className: `doc-edit ${className}`.trim() });
  f.value = text ?? "";
  f.addEventListener("input", () => set(f.value, false));
  f.addEventListener("blur", () => set(f.value, true));
  f.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") return f.el.blur(), select(null);
    // the field lets go first (its words are kept as it does), so the story can redraw with the new block
    if (e.key === "Enter" && !e.shiftKey && next) return e.preventDefault(), f.el.blur(), (focusAt = "end"), next();
  });
  f.addEventListener("click", (e) => e.stopPropagation());
  return f.el;
}

function blockTools(x) {
  return h("div.doc-tools", { on: { click: (e) => e.stopPropagation() } },
    mini(sprite("prompt-enhance"), "Ask the assistant to change it — on the bar below", () => document.querySelector("#story-chat .pill-field")?.focus()),
    mini(icon("plus"), "Add a block below", () => ((inserting = x.id), redraw())),
    mini(icon("chevron"), "Move it up", () => moveBlock(x.id, -1), { className: "ctl-mini is-up" }),
    mini(icon("chevron"), "Move it down", () => moveBlock(x.id, 1)),
    mini(icon("trash"), "Take it out", () => removeBlock(x.id)));
}

function textBlock(b, x) {
  const sel = selBlock(x.id);
  const pick = (e) => !sel && ((focusAt = { x: e.clientX, y: e.clientY }), select("block", x.id));
  const set = (field) => (v, done) => ((x[field] = v), typed(done));
  const stop = { keydown: (e) => e.stopPropagation(), click: (e) => e.stopPropagation() };
  if (x.kind === "action") {
    return h("div.doc-block.doc-action", { className: sel ? "is-selected" : "", on: { click: pick } },
      sel ? editable(x.text, set("text"), "What we see — call people and places by @tag", "", () => addBlock("action", x.id)) : pillText("p", x.text || "…", storyLookup), sel ? blockTools(x) : null);
  }
  if (x.kind === "line") {
    const who = speaker(b, x.who);
    return h("div.doc-block.doc-line", { className: sel ? "is-selected" : "", on: { click: pick } },
      h("i.story-chip", { style: { background: who?.color ?? "var(--s3)" } }),
      sel ? h("select.chip-select", { "aria-label": "Who says it", on: { change: (e) => ((x.who = e.target.value), commit()), ...stop } }, h("option", { value: "" }, "Who?"), ...b.cast.map((c) => h("option", { value: c.name, selected: who === c }, c.name)))
        : h("span.pill.is-who", { dataset: { name: who?.tag ?? "" } }, who?.refs[0] ? h("img", { src: who.refs[0].url, alt: "" }) : null, `@${who?.tag ?? (x.who || "someone")}`),
      sel ? h("input.field.is-line.doc-line-field", { value: x.text, placeholder: "What they say", "aria-label": "The line", on: { input: (e) => ((x.text = e.target.value), typed(false)), change: () => commit(), ...stop, keydown: (e) => {
        e.stopPropagation();
        if (e.key === "Escape") return e.target.blur(), select(null);
        // the answer: a line from someone else
        if (e.key === "Enter") return e.preventDefault(), e.target.blur(), (focusAt = "end"), addBlock("line", x.id, { who: b.cast.find((c) => c !== who)?.name ?? who?.name ?? "" });
      } } }) : h("q", {}, x.text || "…"),
      sel ? h("input.field.is-line.doc-how", { value: x.how ?? "", placeholder: "how", "aria-label": "How it's said", on: { input: (e) => ((x.how = e.target.value), typed(false)), change: () => commit(), ...stop } }) : x.how ? h("span.doc-how-text", {}, x.how) : null,
      sel ? blockTools(x) : null);
  }
  return h("div.doc-block.doc-note", { className: sel ? "is-selected" : "", on: { click: pick } },
    h("span.doc-note-glyph", {}, sprite("file")), sel ? editable(x.text, set("text"), "A note for yourself", "", () => addBlock("note", x.id)) : pillText("p", x.text || "…", storyLookup), sel ? blockTools(x) : null);
}

function panel(b, x) {
  const take = takeOf(x);
  const drawing = busy(`shot:${x.id}`) || busy(`roll:${x.id}`) || busy(`open:${x.id}`);
  const tone = take?.status === "done" ? "ok" : take && take.status !== "failed" ? "busy" : take?.status === "failed" ? "crit" : null;
  const pic = take?.status === "done" ? x.still ?? x.photo : x.photo;
  return h("article.doc-shot", { className: selBlock(x.id) ? "is-selected" : "", on: { click: (e) => (e.stopPropagation(), select("block", x.id)) } },
    h("div.story-frame", { className: drawing ? "is-drawing" : "" },
      pic ? h("img", { src: pic.url, alt: "", draggable: false }) : h("span.story-frame-empty", {}, sprite("image-generate")),
      drawing ? h("span.story-drawing", {}, busy(`roll:${x.id}`) ? "Rolling…" : busy(`open:${x.id}`) ? "Film frame…" : "Drawing…") : null),
    h("div.doc-shot-foot", {},
      h("b", {}, codeOf(x.id)), h("span", {}, SIZES.find(([v]) => v === x.size)?.[1] ?? x.size), h("span", {}, `${x.seconds} s`), h("span.spacer"),
      h("span.doc-shot-cam", { title: CAMERA_LABELS[x.camera] }, sprite(CAMERA_ICON[x.camera] ?? "camera-locked")),
      h("span.doc-shot-lamp", { title: take?.status === "done" ? "Rolled" : take ? take.status : "Not rolled" }, lamp(tone))));
}

/** A scene as a card: its header, what happens in it, its lines, and its shots beside or under them. */
function sceneCard(b, sc) {
  const x = sc.scene;
  const sel = x && selBlock(x.id);
  const shots = sc.blocks.filter((y) => y.kind === "shot");
  const texts = sc.blocks.filter((y) => y.kind !== "shot");
  const place = x && bible(b).find((r) => r.tag === x.place);
  const pick = (e) => x && !sel && ((focusAt = { x: e.clientX, y: e.clientY }), select("block", x.id));
  const head = x ? h("div.doc-scene-head", { on: { click: pick } },
    h("b.doc-slug", {}, `SCENE ${sc.n} · `, sel ? h("input.doc-slug-field", { value: x.slug, "aria-label": "Slugline", on: { input: (e) => ((x.slug = e.target.value.toUpperCase()), typed(false)), change: () => commit(), click: (e) => e.stopPropagation(), keydown: (e) => {
      e.stopPropagation();
      if (e.key === "Escape") return e.target.blur(), select(null);
      if (e.key === "Enter") return e.preventDefault(), commit(), e.target.closest(".doc-scene")?.querySelector(":scope > .doc-edit")?.focus();
    } } }) : x.slug),
    place ? h("span.pill", { dataset: { name: place.tag } }, place.refs[0] ? h("img", { src: place.refs[0].url, alt: "" }) : null, `@${place.tag}`) : null,
    h("span.spacer"),
    h("span.doc-meta", {}, `${shots.length} shot${shots.length === 1 ? "" : "s"} · ${shots.reduce((t, y) => t + (Number(y.seconds) || 0), 0)} s`),
    h("button.key.is-sm", { type: "button", disabled: busy("board"), title: shots.length ? "More shots for the scene, from its beats" : "Board the scene: its shots, written from its beats", on: { click: (e) => (e.stopPropagation(), write("board", { only: x.id })) } }, sprite("frame-first"), busy("board") ? "Boarding…" : "Board"),
    sel ? blockTools(x) : null) : h("div.doc-scene-head", {}, h("b.doc-slug", {}, "BEFORE THE FIRST SCENE"));
  const summary = x ? (sel ? editable(x.summary, (v, done) => ((x.summary = v), typed(done)), "What happens in the scene", "is-summary", () => addBlock("action", x.id)) : x.summary ? pillText("p.doc-summary", x.summary, storyLookup) : null) : null;
  const textList = h("div.doc-texts", {}, ...texts.flatMap((y) => [textBlock(b, y), inserter(y.id, KINDS.filter(([k]) => k !== "scene"))]));
  if (!texts.length) textList.append(inserter(x?.id ?? "start", KINDS.filter(([k]) => k !== "scene")));
  const strip = h("div.doc-shots", {}, ...shots.map((y) => panel(b, y)),
    h("button.doc-shot.is-add", { type: "button", title: "Add a shot to the scene", "aria-label": "Add a shot", on: { click: (e) => (e.stopPropagation(), addBlock("shot", (shots.at(-1) ?? sc.blocks.at(-1) ?? x)?.id)) } }, icon("plus")));
  return h("section.doc-scene", { className: `${sel ? "is-selected" : ""}${shots.length > 2 ? " is-wide" : ""}`, id: x ? `story-scene-${sc.n}` : undefined },
    head, summary, h("div.doc-scene-body", {}, textList, strip));
}

function documentColumn(b) {
  const parts = [titleBlock(b)];
  const scenes = scenesOf(b);
  if (b.idea.logline && !b.blocks.length) {
    parts.push(h("section.doc-start.is-next", {},
      h("p", {}, "The idea is in. The script comes next: scenes, what we see, who says what."),
      h("div.doc-options", {}, h("button.key.is-primary", { type: "button", disabled: busy("script"), on: { click: () => write("script") } }, sprite("prompt-enhance"), busy("script") ? "Writing the script…" : "Write the script"),
        h("button.key", { type: "button", on: { click: () => addBlock("scene", "start") } }, icon("plus"), "A scene of my own"))));
  }
  for (const sc of scenes) parts.push(sceneCard(b, sc), inserter(sc.blocks.at(-1)?.id ?? sc.scene?.id ?? "start", [["scene", "Scene"], ["note", "Note"]]));
  const shots = shotsOf(b);
  if (b.blocks.length) {
    const drawn = shots.filter((s) => s.block.photo).length;
    const rolled = shots.filter((s) => takeOf(s.block)?.status === "done").length;
    parts.push(h("section.doc-production", {},
      h("div.doc-production-text", {}, h("b", {}, "Send to production"), h("span", {}, shots.length ? `${shots.length} shots · ${drawn} drawn · ${rolled} rolled · ${shots.reduce((t, s) => t + (Number(s.block.seconds) || 0), 0)} s` : "Board the scenes to plan their shots.")),
      h("div.doc-production-keys", {},
        h("button.key", { type: "button", disabled: busy("board"), title: "Shots for every scene that has none", on: { click: () => write("board") } }, sprite("frame-first"), "Board"),
        h("button.key", { type: "button", disabled: !shots.length, title: "Draw every shot that has no frame", on: { click: () => drawMissingShots() } }, sprite("image-generate"), "Draw"),
        h("button.key", { type: "button", disabled: !shots.length, title: "Block the picked shot (or the first) on the Stage", on: { click: () => stageShot(story.selected?.kind === "block" && blockOf(story.selected.id)?.kind === "shot" ? story.selected.id : shots[0].block.id) } }, sprite("section-stage"), "Block on Stage"),
        h("button.key", { type: "button", disabled: !shots.length, title: "Roll every shot with LTX-2.5, each in a Shot tab of its own", on: { click: () => rollMissingShots() } }, sprite("section-shot"), "Roll in Shot"),
        h("button.key.is-primary", { type: "button", disabled: !shots.length, title: "An edit in Cut, in story order: the takes, or the frames until they're rolled", on: { click: () => sendToCut() } }, icon("scissors"), "Edit in Cut"))));
  }
  return h("section.story-doc", { on: { click: (e) => e.target.classList.contains("doc-page") && ((inserting = null), select(null)) } },
    h("div.story-doc-head", {}, h("span.card-label", {}, "The story"), h("span.doc-saved", {}, lamp("ok"), "Saved"), h("span.spacer"),
      h("nav.story-jump", { "aria-label": "Scenes" }, ...scenes.filter((s) => s.scene).map((s) => h("a", { href: `#scene-${s.n}`, title: s.scene.slug, on: { click: (e) => (e.preventDefault(), document.getElementById(`story-scene-${s.n}`)?.scrollIntoView({ behavior: "smooth", block: "start" })) } }, String(s.n).padStart(2, "0")))),
      h("div.segment.is-sm", { role: "group", "aria-label": "How frames are drawn" },
        h("button", { type: "button", "aria-pressed": String(b.style === "sketch"), title: "Frames drawn as pencil sketches", on: { click: () => ((b.style = "sketch"), commit()) } }, "Sketch"),
        h("button", { type: "button", "aria-pressed": String(b.style === "film"), title: "Frames drawn as film stills, in the look", on: { click: () => ((b.style = "film"), commit()) } }, "Film"))),
    h("div.doc-page", { dataset: { scrollKey: "doc" } }, ...parts.filter(Boolean)));
}

// ---------------------------------------------------------------- right: the inspector

function shotInspector(b, x) {
  const take = takeOf(x);
  const field = (k, label, placeholder, cls) => {
    const f = pillField({ label, placeholder, lookup: storyLookup, className: `field story-prompt ${cls ?? ""}`.trim() });
    f.value = x[k] ?? "";
    f.addEventListener("input", () => ((x[k] = f.value), typed(false)));
    f.addEventListener("blur", () => commit());
    f.addEventListener("keydown", (e) => e.stopPropagation());
    return f.el;
  };
  const members = castOf(b, `${x.frame} ${x.action}`);
  return [
    h("div.story-ins-head", {}, h("span.card-label", {}, "Inspector"), h("span.spacer"), h("b.story-ins-code", {}, `Shot ${codeOf(x.id)}`)),
    h("div.story-ins-frame", { className: busy(`shot:${x.id}`) || busy(`open:${x.id}`) || busy(`roll:${x.id}`) ? "is-drawing" : "" },
      take?.status === "done" ? h("video", { src: take.video, muted: true, loop: true, autoplay: true, playsInline: true, poster: (x.still ?? x.photo)?.url ?? "" }) : x.photo ? h("img", { src: x.photo.url, alt: "", draggable: false, on: { click: () => view(x.photo.url) } }) : h("span.story-frame-empty", {}, sprite("image-generate")),
      busy(`shot:${x.id}`) ? h("span.story-drawing", {}, "Drawing the frame…") : busy(`open:${x.id}`) || busy(`roll:${x.id}`) ? h("span.story-drawing", {}, x.drawnAs === "sketch" && !x.still ? "Making a film frame of the sketch…" : "Rolling…") : null),
    h("div.story-ins-row", {}, h("b.story-ins-big", {}, codeOf(x.id)), h("span.story-ins-size", {}, (SIZES.find(([v]) => v === x.size)?.[1] ?? x.size).toUpperCase()), h("span.spacer"),
      h("span.story-ins-state", {}, lamp(take?.status === "done" ? "ok" : take && take.status !== "failed" ? "busy" : null), take?.status === "done" ? "Rolled" : take ? take.status : "Not rolled")),
    h("span.row-label", {}, "Shot size"),
    h("div.segment", { role: "group", "aria-label": "Shot size" }, ...SIZES.map(([v, l]) => h("button", { type: "button", "aria-pressed": String(x.size === v), on: { click: () => updateBlock(x.id, { size: v }) } }, l))),
    h("span.row-label", {}, "Camera"),
    h("div.story-moves", { role: "group", "aria-label": "Camera move" }, ...Object.keys(CAMERA_ICON).map((m) => h("button.ctl-tool", { type: "button", "aria-pressed": String(x.camera === m), title: CAMERA_LABELS[m], "aria-label": CAMERA_LABELS[m], on: { click: () => updateBlock(x.id, { camera: m }) } }, sprite(CAMERA_ICON[m])))),
    h("div.story-ins-row", {}, h("span.row-label", {}, "Duration"),
      h("div.story-stepper", {}, h("button", { type: "button", "aria-label": "Shorter", disabled: x.seconds <= 3, on: { click: () => updateBlock(x.id, { seconds: x.seconds - 1 }) } }, "−"), h("b", {}, `${Number(x.seconds).toFixed(1)} s`), h("button", { type: "button", "aria-label": "Longer", disabled: x.seconds >= 8, on: { click: () => updateBlock(x.id, { seconds: x.seconds + 1 }) } }, "+"))),
    h("span.row-label", {}, "Frame prompt"), field("frame", "The frame", "The first frame: who (@name), where (@place), what they do, the light"),
    h("span.row-label", {}, "What happens"), field("action", "What happens", "What happens in the shot, present tense", "is-short"),
    h("span.row-label", {}, "Dialogue"),
    h("div.story-line", {},
      h("select.chip-select", { "aria-label": "Who says it", on: { change: (e) => updateBlock(x.id, { line: e.target.value ? { who: e.target.value, text: x.line?.text ?? "" } : null }) } },
        h("option", { value: "" }, "No line"), ...b.cast.map((c) => h("option", { value: c.name, selected: speaker(b, x.line?.who) === c }, c.name))),
      h("input.field.is-line", { value: x.line?.text ?? "", disabled: !x.line, placeholder: "What they say", "aria-label": "The line", on: { input: (e) => x.line && ((x.line.text = e.target.value), typed(false)), change: () => commit(), keydown: (e) => e.stopPropagation() } })),
    h("span.row-label", {}, "Sound"),
    h("input.field.is-line", { value: x.sound, placeholder: "What we hear", "aria-label": "Sound", on: { input: (e) => ((x.sound = e.target.value), typed(false)), change: () => commit(), keydown: (e) => e.stopPropagation() } }),
    members.length ? h("span.row-label", {}, "References used") : null,
    members.length ? h("div.story-used", {}, ...members.map((m) => h("button.story-used-item", { type: "button", title: m.words || m.about, on: { click: () => select(m.kind, m.id) } }, m.refs[0] ? h("img", { src: m.refs[0].url, alt: "", draggable: false }) : h("i.story-chip", { style: { background: m.color ?? "var(--s3)" } }), h("span", {}, `@${m.tag}`)))) : null,
    h("span.row-label", {}, "Actions"),
    h("div.story-ins-keys", {},
      key(icon("remix"), x.photo ? "Draw the frame again" : "Draw the frame", () => drawShot(x.id), { disabled: busy(`shot:${x.id}`) }),
      key(sprite("image-edit"), "Edit the frame in the Image window", () => x.photo && openImage({ refs: [{ ...x.photo, name: "frame" }], template: "edit" }), { disabled: !x.photo }),
      key(sprite("section-stage"), "Block it on the Stage", () => stageShot(x.id)),
      key(sprite("section-shot"), "Open it in Shot, to craft its prompt there", () => openInShot(x.id), { disabled: busy(`open:${x.id}`) }),
      key(icon("trash"), "Take the shot out", () => removeBlock(x.id))),
    h("button.roll.story-roll", { type: "button", disabled: busy(`roll:${x.id}`) || (take && !["done", "failed", "canceled"].includes(take.status)), on: { click: () => rollShot(x.id) } }, sprite("scene-render"), take?.status === "done" ? "ROLL AGAIN" : busy(`roll:${x.id}`) ? "ROLLING…" : "ROLL SHOT"),
  ];
}

function refInspector(b, kind, x) {
  const look = kind === "look";
  const uses = look ? 0 : b.blocks.filter((y) => [y.text, y.summary, y.frame, y.action].some((t) => String(t ?? "").toLowerCase().includes(`@${x.tag}`)) || y.place === x.tag || speaker(b, y.who ?? y.line?.who) === x).length;
  const importKey = h("button.key", { type: "button", "aria-expanded": "false", on: { click: () => attachTo(importKey, kind, x) } }, sprite("image-upload"), "Import");
  return [
    h("div.story-ins-head", {}, h("span.card-label", {}, look ? "Look" : kind === "cast" ? "Character" : kind === "places" ? "Place" : "Prop"), h("span.spacer"), look ? null : key(icon("trash"), "Take it out of the bible", () => removeRef(kind, x.id))),
    look ? null : h("input.field.story-ins-name", { value: x.name, "aria-label": "Name", on: { change: (e) => updateRef(kind, x.id, { name: e.target.value.trim() || x.name }), keydown: (e) => e.stopPropagation() } }),
    look ? null : h("p.story-ins-tag", {}, h("span.story-tag", {}, `@${x.tag}`), h("span", {}, uses ? `in ${uses} block${uses === 1 ? "" : "s"}` : "not in the script yet")),
    look ? null : h("span.row-label", {}, "Who or what"),
    look ? null : h("input.field.is-line", { value: x.about, placeholder: kind === "cast" ? "who they are: the old keeper" : "what it is", "aria-label": "About", on: { change: (e) => updateRef(kind, x.id, { about: e.target.value }), keydown: (e) => e.stopPropagation() } }),
    h("span.row-label", {}, look ? "The film's style" : "How it looks"),
    h("textarea.field.story-field", { rows: 4, value: x.words ?? "", placeholder: kind === "cast" ? "Age, face, hair, clothes: a girl of ten, curly dark hair, a yellow raincoat" : kind === "places" ? "Where, when, the weather, the light" : kind === "props" ? "Shape, material, colour" : "Medium, light, colour, lens, texture", "aria-label": "How it looks", on: { change: (e) => (look ? ((b.look.words = e.target.value), commit()) : updateRef(kind, x.id, { words: e.target.value })), keydown: (e) => e.stopPropagation() } }),
    h("span.row-label", {}, "Pictures"),
    h("div.story-ref-pics", {}, ...(x.refs ?? []).map((r) => h("div.story-ref-pic", {},
      h("button", { type: "button", title: "Look at it", on: { click: () => view(r.url) } }, h("img", { src: r.url, alt: "", draggable: false })),
      h("button.ctl-mini.story-ref-off", { type: "button", title: "Take it off", "aria-label": "Take it off", on: { click: () => removeRefPicture(kind, x.id, r.file) } }, icon("close")))),
      busy(`ref:${kind}:${x.id ?? "look"}`) ? h("div.story-ref-pic.is-drawing", {}, h("span.typing", {}, h("i"), h("i"), h("i"))) : null),
    h("div.story-ins-keys", {},
      h("button.key", { type: "button", disabled: busy(`ref:${kind}:${x.id ?? "look"}`), on: { click: () => drawRef(kind, x.id) } }, sprite("image-generate"), kind === "cast" ? "Render a sheet" : "Render"),
      importKey),
  ];
}

function blockInspector(b, x) {
  const sc = scenesOf(b).find((s) => s.scene === x || s.blocks.includes(x));
  const shots = sc?.blocks.filter((y) => y.kind === "shot") ?? [];
  return [
    h("div.story-ins-head", {}, h("span.card-label", {}, "Inspector"), h("span.spacer"), h("b.story-ins-code", {}, KINDS.find(([k]) => k === x.kind)?.[1] ?? "Block")),
    h("p.story-ins-hint", {}, x.kind === "scene" ? `Scene ${sc?.n}: ${sc?.blocks.length ?? 0} blocks, ${shots.length} shots. Write in place in the story, or ask the assistant on the bar.` : "Write in place in the story, or ask the assistant on the bar to change it: it knows the whole story."),
    x.kind === "scene" ? h("span.row-label", {}, "Place") : null,
    x.kind === "scene" ? h("select.chip-select", { "aria-label": "Place", on: { change: (e) => updateBlock(x.id, { place: e.target.value }) } }, h("option", { value: "" }, "No place"), ...b.places.map((p) => h("option", { value: p.tag, selected: x.place === p.tag }, p.name))) : null,
    h("span.row-label", {}, "Add after it"),
    h("div.story-add-row", {}, ...KINDS.map(([k, label]) => h("button.key.is-sm", { type: "button", on: { click: () => (focusAt = "end") && addBlock(k, x.kind === "scene" && k !== "scene" ? x.id : x.kind === "scene" ? (sc?.blocks.at(-1)?.id ?? x.id) : x.id) } }, KIND_GLYPH[k](), label))),
    x.kind === "scene" ? h("button.key", { type: "button", disabled: busy("board"), on: { click: () => write("board", { only: x.id }) } }, sprite("frame-first"), busy("board") ? "Boarding…" : shots.length ? "More shots for the scene" : "Board the scene") : null,
    h("div.story-ins-keys", {}, key(icon("chevron"), "Move it up", () => moveBlock(x.id, -1), { className: "key is-icon is-up" }), key(icon("chevron"), "Move it down", () => moveBlock(x.id, 1)), key(icon("trash"), "Take it out", () => removeBlock(x.id))),
  ];
}

function overview(b) {
  // nothing picked: the story at a glance, and what is next
  const shots = shotsOf(b);
  const scenes = scenesOf(b).filter((s) => s.scene).length;
  const next = !b.idea.logline ? "Write the brief, and the story." : !scenes ? "Write the script." : !b.cast.some((c) => c.refs.length) ? "Render the cast's sheets in the bible." : !shots.length ? "Board the scenes." : shots.some((s) => !s.block.photo) ? "Draw the shots' frames." : shots.some((s) => takeOf(s.block)?.status !== "done") ? "Roll the shots." : "Edit it in Cut.";
  return [
    h("div.story-ins-head", {}, h("span.card-label", {}, "Inspector"), h("span.spacer"), h("b.story-ins-code", {}, "The story")),
    h("div.story-facts", {},
      h("span", {}, "Scenes"), h("b", {}, String(scenes)),
      h("span", {}, "Shots"), h("b", {}, String(shots.length)),
      h("span", {}, "Drawn"), h("b", {}, `${shots.filter((s) => s.block.photo).length}`),
      h("span", {}, "Rolled"), h("b", {}, `${shots.filter((s) => takeOf(s.block)?.status === "done").length}`),
      h("span", {}, "Length"), h("b", {}, `${shots.reduce((t, s) => t + (Number(s.block.seconds) || 0), 0)} s of ${b.idea.length} s`),
      h("span", {}, "Cast"), h("b", {}, `${b.cast.length} · ${b.cast.filter((c) => c.refs.length).length} with sheets`)),
    h("span.row-label", {}, "Next"), h("p.story-next-step", {}, next),
    h("p.story-ins-hint", {}, "Pick anything in the story or the bible to change it here, or ask the assistant on the bar: it knows the whole story."),
  ];
}

function inspectorColumn(b) {
  const sel = story.selected;
  let content = null;
  if (sel?.kind === "block" && blockOf(sel.id)) {
    const x = blockOf(sel.id);
    content = x.kind === "shot" ? shotInspector(b, x) : blockInspector(b, x);
  } else if (sel && ["cast", "places", "props"].includes(sel.kind)) {
    const x = b[sel.kind].find((r) => r.id === sel.id);
    content = x ? refInspector(b, sel.kind, x) : null;
  } else if (sel?.kind === "look") content = refInspector(b, "look", { ...b.look, id: undefined, refs: b.look.refs });
  else if (sel?.kind === "idea") {
    const i = b.idea;
    const f = (k, tag, label, extra = {}) => h(tag, { className: "field story-field", value: i[k] ?? "", "aria-label": label, on: { change: (e) => ((i[k] = e.target.value), commit()), keydown: (e) => e.stopPropagation() }, ...extra });
    content = [
      h("div.story-ins-head", {}, h("span.card-label", {}, "Inspector"), h("span.spacer"), h("b.story-ins-code", {}, "The idea")),
      f("title", "input", "Title"),
      h("span.row-label", {}, "Logline"), f("logline", "textarea", "Logline", { rows: 2 }),
      h("span.row-label", {}, "Synopsis"), f("synopsis", "textarea", "Synopsis", { rows: 6 }),
      h("div.story-pair", {}, h("label.story-label", {}, h("span.row-label", {}, "Genre"), f("genre", "input", "Genre")), h("label.story-label", {}, h("span.row-label", {}, "Tone"), f("tone", "input", "Tone"))),
      h("span.row-label", {}, "Length"),
      h("div.segment", { role: "group" }, ...LENGTHS.map(([v, l]) => h("button", { type: "button", "aria-pressed": String(i.length === v), on: { click: () => ((i.length = v), commit()) } }, l))),
      h("span.row-label", {}, "Frame"),
      h("div.segment", { role: "group" }, ...["16:9", "9:16", "1:1"].map((v) => h("button", { type: "button", "aria-pressed": String(i.aspect === v), on: { click: () => ((i.aspect = v), commit()) } }, v))),
      h("span.row-label", {}, "Brief"), f("brief", "textarea", "Brief", { rows: 3 }),
      h("button.key", { type: "button", disabled: busy("idea"), on: { click: () => write("idea") } }, sprite("prompt-enhance"), busy("idea") ? "Writing…" : "Write the idea again from the brief"),
    ];
  }
  return h("aside.story-inspector", { "aria-label": "Inspector", dataset: { scrollKey: "inspector" } }, ...(content ?? overview(b)).filter(Boolean));
}

// ---------------------------------------------------------------- the page

/** The caret into the picked block's field: where it was clicked, or at its end. */
function caretInto(el, at) {
  const field = el.querySelector(".doc-block.is-selected .doc-edit, .doc-block.is-selected .doc-line-field, .doc-scene.is-selected .doc-slug-field, .doc-scene.is-selected > .doc-edit");
  if (!field) return;
  field.focus({ preventScroll: true });
  if (field.matches("input")) return field.setSelectionRange(field.value.length, field.value.length);
  const sel = getSelection();
  const r = at !== "end" && document.caretRangeFromPoint?.(at.x, at.y);
  if (r && field.contains(r.startContainer)) return sel.removeAllRanges(), sel.addRange(r);
  const end = document.createRange();
  end.selectNodeContents(field);
  end.collapse(false);
  sel.removeAllRanges();
  sel.addRange(end);
}

// the assistant's bar docks here; the slot is kept across redraws so the bar stays in it
const chatSlot = h("div.story-chat", { id: "story-chat" });

document.addEventListener("keydown", (e) => {
  if (document.body.dataset.page !== "story" || document.body.classList.contains("has-window")) return;
  if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === "z") return e.preventDefault(), e.shiftKey ? redo() : undo();
  if (e.key === "Escape") return (inserting = null), select(null);
  if ((e.key === "Delete" || e.key === "Backspace") && story.selected?.kind === "block") return removeBlock(story.selected.id);
});

export function renderStory(el) {
  loadStories();
  const p = story.project;
  if (!p) return el.replaceChildren(h("div.story-loading", {}, story.error ? h("p", {}, story.error) : h("span.typing", {}, h("i"), h("i"), h("i"))));
  const b = p.body;
  el.replaceChildren(subbar(), h("div.story-desk3", {}, bibleColumn(b), documentColumn(b), inspectorColumn(b)), chatSlot);
  if (focusAt) caretInto(el, focusAt);
  focusAt = null;
  document.dispatchEvent(new Event("story:drawn"));
}
