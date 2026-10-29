// Backstage is the visual plan for a song: timed scenes, reusable characters, and its cover.
// Preparing and editing a plan is free. Every generated asset has its own review before submission.
import { h } from "../dom.js";
import { changed, toast, mentionables } from "../store.js";
import { mentionAt, putMention } from "../mentions.js";
import { backstageMentionables } from "../jam-backstage-mentions.js";
import { jam, openWindow, setWorkspace, partMatchesSpan } from "../jam.js";
import { openPicker, pictureOf } from "../picker.js";
import { lyricTimeline, syncedLinesForCut } from "../song-lyrics.js";
import { jicon, clock, registerWindow, pickFile, keep } from "./jam-ui.js";
import { segs } from "./jam-card.js";
import {
  backstageOf, VIDEO_MODELS, planScenes, addScene, updateScene, removeScene,
  setBackstage, attachAsset, generateAsset, resumeAsset, resumeBackstageJobs, insertScenes,
  addCharacter, removeCharacter, generationDetails, estimateGeneration, useCover, prepareBackstageMentions,
} from "../jam-backstage.js";

const TABS = [["scenes", "Scenes"], ["characters", "Characters"], ["cover", "Cover"]];
const FORMATS = [["music-video", "Music video"], ["opening", "Anime / TV opening"], ["ending", "Ending credits"], ["game-cinematic", "Game cinematic"], ["lyric-video", "Lyric video"], ["podcast", "Podcast"]];
const SLOTS = [["image", "Start frame"], ["endImage", "End frame"], ["video", "Video"]];
const BUSY = new Set(["submitting", "running"]);
const views = new Map();
let review = null;
let audition = null;

const show = () => changed("jam");
const run = (fn) => {
  const failed = (e) => toast(e?.message || "The action could not finish.", { tone: "crit" });
  // Invoke inside the click event so file pickers retain the browser's user gesture.
  try { return Promise.resolve(fn()).catch(failed); }
  catch (e) { failed(e); return Promise.resolve(); }
};
const seconds = (n) => `${Number(n).toFixed(Number.isInteger(Number(n)) ? 0 : 1)} s`;
const assetUrl = (a) => typeof a === "string" ? a : a?.url;
const labelFor = (kind) => kind === "video" ? "video" : kind === "endImage" ? "end frame" : "image";
const busyOf = (item) => Object.values(item?.jobs ?? {}).some((job) => BUSY.has(job?.status));
const pendingOf = (item) => Object.values(item?.jobs ?? {}).some((job) => BUSY.has(job?.status) || job?.status === "unknown");
const hasWork = (item) => !!(item?.image || item?.video || item?.endImage || item?.reference);
const itemOf = (bs, id) => id === "cover" ? bs.cover : [...bs.scenes, ...bs.characters].find((x) => x.id === id);

function viewOf(j) {
  if (!views.has(j.id)) views.set(j.id, { tab: "scenes", scene: null, character: null, slot: "image", scope: "cut" });
  return views.get(j.id);
}

function selected(bs, v) {
  if (v.tab === "cover") return bs.cover;
  const list = v.tab === "characters" ? bs.characters : bs.scenes;
  const key = v.tab === "characters" ? "character" : "scene";
  if (!list.some((x) => x.id === v[key])) v[key] = list[0]?.id ?? null;
  return list.find((x) => x.id === v[key]) ?? null;
}

function selectItem(v, id) {
  stopBackstageAudio();
  v[v.tab === "characters" ? "character" : "scene"] = id;
  v.slot = "image";
  show();
}

function key(text, ic, fn, { disabled = false, primary = false, title = "", cls = "" } = {}) {
  return h(`button.jb-key${primary ? ".is-primary" : ""}${cls ? `.${cls}` : ""}`, {
    type: "button", disabled, title, on: { click: () => run(fn) },
  }, ic ? jicon(ic) : null, h("span", {}, text));
}

function smallKey(label, ic, fn, disabled = false) {
  return h("button.jb-icon", { type: "button", disabled, title: label, "aria-label": label, on: { click: () => run(fn) } }, jicon(ic));
}

function field(label, value, commit, { name, area = false, placeholder = "", rows = 3, disabled = false, hint = "", mentions = null } = {}) {
  const id = `backstage-${name}`;
  const input = h(area ? "textarea.field" : "input.field", {
    id, value: value ?? "", rows: area ? rows : undefined, disabled, placeholder,
    dataset: { focus: id }, on: { input: (e) => run(() => commit(e.target.value)), keydown: (e) => e.stopPropagation() },
  });
  const picker = mentions ? h("div.mention-picker.is-list.jb-mentions", { hidden: true, role: "listbox", "aria-label": "Character and image references" }) : null;
  if (picker) {
    let options = [], active = 0;
    const draw = () => {
      const at = document.activeElement === input ? mentionAt(input) : null;
      options = at ? mentions().filter(c => c.name.startsWith(at.query) || (at.query && c.title?.toLowerCase().includes(at.query))).slice(0, 10) : [];
      active = Math.min(active, Math.max(0, options.length - 1));
      picker.hidden = !options.length;
      picker.replaceChildren(h("div.pick-grid.is-list", {}, ...options.map((c, i) => h("button.pick-file", {
        type: "button", role: "option", "aria-selected": String(i === active), className: i === active ? "is-active" : "",
        on: { mousedown: e => { e.preventDefault(); putMention(input, c.name); picker.hidden = true; } },
      }, c.image ? h("img.jb-mention-face", { src: c.image, alt: "" }) : jicon("image"), h("span", {}, h("b", {}, c.title), h("small", {}, ` @${c.name}`))))));
    };
    input.addEventListener("input", () => { active = 0; draw(); });
    input.addEventListener("click", draw);
    input.addEventListener("blur", () => { picker.hidden = true; });
    input.addEventListener("keydown", e => {
      if (picker.hidden || !options.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); active = (active + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length; draw(); }
      else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); putMention(input, options[active].name); picker.hidden = true; }
      else if (e.key === "Escape") { e.preventDefault(); picker.hidden = true; }
    });
  }
  return h("div.jb-field", {},
    h("label.label", { for: id }, label),
    h("div.jb-field-input", {}, input, picker), hint ? h("p.jb-hint", {}, hint) : null);
}

function chooser(label, value, options, commit, name, disabled = false) {
  return h("label.jb-field", {}, h("span.label", {}, label),
    h("select.field", { "aria-label": label, disabled, dataset: { focus: `backstage-${name}` }, on: { change: (e) => run(() => commit(e.target.value)) } },
      ...options.map(([id, text]) => h("option", { value: id, selected: id === value }, text))));
}

function panel(title, cls, ...children) {
  return h(`section.jb-panel.${cls}`, {}, h("header.jb-panel-head", {}, h("h2", {}, title)), ...children);
}

function empty(title, note, ic = "image", action = null) {
  return h("div.jb-empty", {}, jicon(ic), h("b", {}, title), h("p", {}, note), action);
}

function addNew(v) {
  return run(async () => {
    const out = v.tab === "characters" ? await addCharacter({ title: "New character", prompt: "" }) : await addScene();
    const bs = backstageOf();
    const list = v.tab === "characters" ? bs.characters : bs.scenes;
    selectItem(v, out?.id ?? list.at(-1)?.id);
  });
}

function plan(v) {
  return run(async () => {
    await planScenes({ scope: v.scope });
    v.scene = backstageOf().scenes[0]?.id ?? null;
    show();
  });
}

function statusOf(item) {
  const jobs = Object.values(item?.jobs ?? {});
  if (jobs.some((x) => BUSY.has(x?.status))) return "Generating";
  if (jobs.some((x) => x?.status === "unknown")) return "Check job";
  if (jobs.some((x) => x?.status === "failed") || item?.error) return "Needs attention";
  return item?.video ? "Video ready" : item?.image ? "Frame ready" : "Planned";
}

function storyboard(ctx, bs, v) {
  const characters = v.tab === "characters";
  const list = characters ? bs.characters : bs.scenes;
  const title = characters ? "Characters" : "Storyboard";
  const current = characters ? v.character : v.scene;
  const p = panel(title, "jb-library");
  p.firstElementChild.append(smallKey(characters ? "Add character" : "Add scene", "plus", () => addNew(v), !ctx.b?.track && !characters));
  p.append(h("p.jb-hint", {}, characters ? "Keep identities consistent across scenes." : "Full-song timestamps · one shot per scene"));
  if (!list.length) {
    p.append(characters
      ? empty("Your visual cast", "Choose a character or create an identity reference for this project.", "band", key("Add character", "plus", () => addNew(v)))
      : empty("Start with the song", "Build shots up to 10 seconds from its sections, then give each scene your own direction.", "film",
        h("div.jb-plan", {},
          segs([["cut", "Selected cut"], ["track", "Full song"]], v.scope, (value) => { v.scope = value; show(); }, { label: "Storyboard range" }),
          key("Build storyboard", "plus", () => plan(v), { disabled: !ctx.b?.track, primary: true }))));
    return p;
  }
  p.append(h("div.jb-items", { dataset: { scrollKey: `backstage-${v.tab}` }, role: "list", "aria-label": title }, ...list.map((item, i) => {
    const src = assetUrl(item.image) ?? assetUrl(item.reference);
    return h("div.jb-list-entry", { role: "listitem" }, h(`button.jb-item${item.id === current ? ".is-on" : ""}`, {
      type: "button", "aria-pressed": String(item.id === current), on: { click: () => selectItem(v, item.id) },
    }, h("span.jb-item-pic", {}, src ? h("img", { src, alt: "", loading: "lazy" }) : jicon(characters ? "band" : "image")),
    h("span.jb-item-text", {}, h("span.jb-item-name", {}, h("small", {}, String(i + 1).padStart(2, "0")), h("b", {}, item.title || (characters ? "Character" : "Untitled scene"))),
      !characters ? h("time", {}, `${clock(item.from)}–${clock(item.to)}`) : null,
      h("em", { dataset: { state: statusOf(item) } }, statusOf(item)))));
  })));
  if (!characters) p.append(h("div.jb-list-foot", {},
    h("span", {}, `${list.length} scenes`),
    h("span", {}, `${clock(list[0].from)}–${clock(list.at(-1).to)}`)));
  return p;
}

function coverLibrary(ctx, bs) {
  return panel("Cover artwork", "jb-library",
    h("p.jb-hint", {}, "One visual identity for the song, its release and its video."),
    h("div.jb-cover-song", {}, h("span.label", {}, "Song"), h("b", {}, ctx.b?.track?.name || ctx.j?.name || "Untitled"),
      h("span.jb-hint", {}, "Square · GPT Image 2.5 Flare")),
    h("p.jb-hint", {}, "Describe the atmosphere and composition. Keep the image free of lettering; add titles in the edit."),
    bs.cover?.image ? key("Use as song cover", "check", () => useCover(), { primary: true }) : null);
}

function timeline(ctx, bs, item) {
  const total = Number(ctx.b?.track?.seconds) || 1;
  return h("div.jb-timeline", { "aria-label": "Scene position in the song" },
    h("div.jb-timeline-labels", {}, h("span", {}, clock(0)), h("b", {}, `${clock(item.from)}–${clock(item.to)}`), h("span", {}, clock(total))),
    h("div.jb-timeline-track", {}, ...bs.scenes.map((s) => h(`i${s.id === item.id ? ".is-on" : ""}`, {
      style: { left: `${Math.max(0, s.from / total * 100)}%`, width: `${Math.min(100, (s.to - s.from) / total * 100)}%` },
    }))));
}

function songLines(ctx, item) {
  const track = ctx.b?.track;
  if (!track?.lyrics) return null;
  const isSynced = syncedLinesForCut(track, { from: 0, to: track.seconds }) !== null;
  if (!isSynced) return h("p.jb-hint", {}, "Sync the song's lyrics to show the lines heard in this scene.");
  const lines = lyricTimeline(track.lyrics, track.seconds, track.timing).filter((line) => line.kind === "line" && line.to > item.from && line.from < item.to);
  return h("section.jb-song-lines", {}, h("span.label", {}, "Lyrics in this scene"),
    lines.length ? h("div", {}, ...lines.map((line) => h("p", {}, h("time", {}, clock(line.from)), h("span", {}, line.text))))
      : h("p.jb-hint", {}, "Instrumental passage"));
}

function jobPanel(item, slot) {
  const job = item?.jobs?.[slot];
  if (!job) return item?.error ? h("div.jb-error", { role: "alert" }, item.error) : null;
  const busy = BUSY.has(job.status);
  const unknown = job.status === "unknown";
  const meta = job.metadata ?? {};
  const progress = Number.isFinite(job.progress) ? Math.round(Math.max(0, Math.min(1, job.progress)) * 100) : null;
  return h(`div.jb-job${job.status === "failed" ? ".is-error" : ""}`, { role: "status", "aria-live": "polite" },
    h("div.jb-job-line", {}, h("b", {}, busy ? job.phase || "Generating…" : unknown ? "Job needs a status check" : job.status === "done" ? "Generation complete" : "Generation failed"),
      busy && progress !== null ? h("span", {}, `${progress}%`) : null),
    busy ? h("progress", { max: 100, value: progress ?? undefined, "aria-label": "Generation progress" }) : null,
    job.error ? h("p", {}, job.error) : null,
    unknown ? h("p", {}, "Check the existing job before starting another paid generation.") : null,
    unknown || job.status === "failed" ? job.id ? key("Check existing job", "loop", () => resumeAsset(item.id, slot))
      : h("a.jb-key", { href: "https://cloud.comfy.org", target: "_blank", rel: "noopener" }, jicon("expand"), "Check Comfy Cloud") : null,
    job.status === "done" ? h("div.jb-job-facts", {},
      Number.isFinite(meta.elapsedSeconds) ? h("span", {}, `Elapsed ${seconds(meta.elapsedSeconds)}`) : null,
      Number.isFinite(meta.actualCostCredits) ? h("span", {}, `${meta.actualCostCredits.toFixed(2)} cr billed`)
        : Number.isFinite(meta.estimatedCredits) ? h("span", {}, `≈ ${meta.estimatedCredits.toFixed(2)} cr estimated`)
          : h("span", {}, "Final cost unavailable")) : null);
}

function audioPreview(ctx, item) {
  const src = ctx.b?.track?.url;
  if (!src) return null;
  const player = keep(`backstage-audio:${ctx.j.id}:${src}`, () => h("audio.jb-audio", { preload: "metadata", src }));
  if (audition && audition !== player) audition.pause();
  audition = player;
  player.controls = false;
  player.dataset.to = String(item.to);
  const duration = Math.max(0, item.to - item.from);
  const position = () => Math.min(duration, Math.max(0, (Number(player.currentTime) || 0) - item.from));
  const toggle = smallKey("Listen to this scene", "play", () => {
    if (!player.paused) return player.pause();
    if (player.currentTime < item.from || player.currentTime >= item.to || !Number.isFinite(player.currentTime)) player.currentTime = item.from;
    return player.play();
  });
  const time = h("span.jb-audio-time", {}, `${clock(position())} / ${clock(duration)}`);
  const seek = h("input.jb-audio-seek", {
    type: "range", min: 0, max: duration, step: 0.1, value: position(), "aria-label": "Seek within this scene",
    on: { input: (e) => { player.currentTime = item.from + Math.min(duration, Math.max(0, Number(e.target.value) || 0)); refresh(); } },
  });
  function refresh() {
    const label = player.paused ? "Listen to this scene" : "Pause scene preview";
    toggle.title = label;
    toggle.setAttribute("aria-label", label);
    toggle.replaceChildren(jicon(player.paused ? "play" : "pause"));
    seek.value = position();
    seek.setAttribute("aria-valuetext", `${clock(position())} of ${clock(duration)}`);
    time.textContent = `${clock(position())} / ${clock(duration)}`;
  }
  player.ontimeupdate = () => {
    if (!player.paused && player.currentTime >= Number(player.dataset.to)) player.pause();
    refresh();
  };
  player.onplay = player.onpause = player.onended = player.onloadedmetadata = refresh;
  refresh();
  return h("div.jb-audio-row", {}, toggle, h("div.jb-audio-track", {}, h("div.jb-audio-label", {}, h("span.label", {}, "Song preview"), time), seek), player);
}

function previousTakes(item, slot) {
  const seen = new Set([item[slot]?.file]);
  const takes = (item.history ?? []).filter((take) => {
    if (take.kind !== slot || !take.media?.file || !take.media.url || seen.has(take.media.file)) return false;
    seen.add(take.media.file);
    return true;
  });
  if (!takes.length) return null;
  return h("details.jb-history", {}, h("summary", {}, `${takes.length} previous ${slot === "video" ? "video" : "image"} take${takes.length === 1 ? "" : "s"}`),
    h("div.jb-history-takes", {}, ...takes.map((take, i) => h("button.jb-history-take", { type: "button", disabled: pendingOf(item), title: `Use previous ${labelFor(slot)} ${i + 1}`, on: { click: () => run(() => attachAsset(item.id, slot, take.media)) } },
      slot === "video" ? jicon("film") : h("img", { src: take.media.url, alt: "", loading: "lazy" }), h("span", {}, `Take ${i + 1}`)))));
}

function monitor(ctx, bs, v, item) {
  const scene = v.tab === "scenes";
  if (!item) return v.tab === "characters"
    ? panel("Character preview", "jb-monitor", empty("Create a character identity", "Select or add a character to prepare a reusable visual reference.", "band"))
    : v.tab === "cover"
      ? panel("Cover preview", "jb-monitor", empty("Create the song's artwork", "Describe a square cover that captures the song's atmosphere.", "image"))
      : panel("Scene preview", "jb-monitor", empty("Give the music a scene", "Select or add a scene to prepare its frames and animation.", "film"));
  const slot = scene ? v.slot : "image";
  const asset = item[slot];
  const src = assetUrl(asset);
  const isVideo = slot === "video";
  const ratio = v.tab === "cover" ? "1:1" : bs.aspect;
  const p = panel(item.title || "Preview", "jb-monitor");
  if (src) p.firstElementChild.append(h("div.jb-preview-tools", {},
    smallKey(`Clear ${labelFor(slot)}`, "close", () => attachAsset(item.id, slot, null), pendingOf(item)),
    h("a.jb-icon", { href: src, target: "_blank", rel: "noopener", title: "Open asset full size", "aria-label": "Open asset full size" }, jicon("expand"))));
  p.append(...[h("div.jb-monitor-toolbar", {},
    scene ? segs(SLOTS, slot, (s) => { v.slot = s; show(); }, { label: "Preview asset" }) : h("span.label", {}, v.tab === "cover" ? "Album artwork" : "Identity reference"),
    h("span.jb-ratio", {}, ratio)),
    h("div.jb-view-space", {}, h("div.jb-preview", { style: { aspectRatio: String(ratio || "16:9").replace(":", "/") }, dataset: { slot } },
      src ? isVideo ? h("video", { src, controls: true, playsInline: true, preload: "metadata", "aria-label": `${item.title}, generated video` }) : h("img", { src, alt: `${item.title || "Scene"}, ${labelFor(slot)}` })
        : empty(isVideo ? "Ready for motion" : slot === "endImage" ? "Plan where the shot ends" : v.tab === "cover" ? "Create the song's artwork" : "Your next frame", isVideo ? "Generate a start frame, review it, then animate the scene." : slot === "endImage" ? "An optional ending frame guides LTX's final composition." : "Write your direction, add a reference if needed, then review generation.", isVideo ? "film" : "image"))),
    jobPanel(item, slot), previousTakes(item, slot)].filter(Boolean));
  if (scene) p.append(...[timeline(ctx, bs, item), audioPreview(ctx, item), songLines(ctx, item)].filter(Boolean));
  return p;
}

function chooseReference(e, item) {
  openPicker(e.currentTarget, {
    title: "Scene reference", stars: backstageOf().characters.filter((c) => c.image?.file).map((c) => ({ ...c.image, name: c.title })),
    onPick: (choice) => run(async () => attachAsset(item.id, "reference", await pictureOf(choice))),
  });
}

function references(bs, item, isScene) {
  const src = assetUrl(item.reference);
  return h("section.jb-references", {}, h("span.label", {}, "Reference"),
    h("div.jb-reference", {},
      h("button.jb-reference-pick", { type: "button", disabled: pendingOf(item), on: { click: (e) => chooseReference(e, item) } },
        src ? h("img", { src, alt: "Current identity or scene reference" }) : jicon("image"),
        h("span", {}, h("b", {}, src ? item.reference?.name || "Reference image" : "Add a reference"), h("small", {}, src ? "Change image" : "Your photo, crew or library"))),
      src ? smallKey("Remove reference", "close", () => attachAsset(item.id, "reference", null), pendingOf(item)) : null),
    isScene && bs.characters.length ? h("div.jb-character-picks", {}, h("span.label", {}, "Characters in this scene"), ...bs.characters.map((c) => {
      const on = item.characterIds?.includes(c.id) ?? false;
      return h("button.jb-character-pick", { type: "button", disabled: !c.image || pendingOf(item), "aria-pressed": String(on), title: c.image ? c.title : "Generate this character's reference first", on: { click: () => run(() => updateScene(item.id, { characterIds: on ? item.characterIds.filter((id) => id !== c.id) : [...(item.characterIds ?? []), c.id] })) } },
        assetUrl(c.image) ? h("img", { src: assetUrl(c.image), alt: "" }) : jicon("band"), h("span", {}, c.title), on ? jicon("check") : null);
    })) : null);
}

function timingFields(ctx, item) {
  const bound = Number(ctx.b?.track?.seconds) || undefined;
  const at = (name, label) => h("label.jb-field", {}, h("span.label", {}, label), h("input.field", {
    type: "number", min: 0, max: bound, step: 0.1, value: Number(item[name]).toFixed(1), disabled: pendingOf(item),
    "aria-label": `${label}, seconds from song start`, dataset: { focus: `backstage-${item.id}-${name}` },
    on: { change: (e) => run(() => updateScene(item.id, { [name]: Number(e.target.value) })), keydown: (e) => e.stopPropagation() },
  }));
  return h("div.jb-times", {}, at("from", "Start · seconds"), at("to", "End · seconds"), h("span.jb-duration", {}, seconds(item.to - item.from)));
}

function removeItem(item, v) {
  if (hasWork(item)) {
    review = { type: "remove", jamId: jam.jam.id, id: item.id, title: item.title, tab: v.tab };
    openWindow("backstage-review");
    return;
  }
  return v.tab === "characters" ? removeCharacter(item.id) : removeScene(item.id);
}

async function requestGeneration(item, kind) {
  const j = jam.jam;
  await prepareBackstageMentions(item.id, kind);
  const details = generationDetails(item.id, kind);
  review = { type: "generate", jamId: j.id, id: item.id, title: item.title, kind, details, signature: JSON.stringify(details), loading: true };
  const current = review;
  openWindow("backstage-review");
  try { current.estimate = await estimateGeneration(item.id, kind); }
  catch (e) { current.estimate = { credits: null, note: "A price estimate is unavailable. This generation is billed by the provider." }; }
  finally { current.loading = false; if (review === current) show(); }
}

function inspector(ctx, bs, v, item) {
  if (!item) return v.tab === "characters"
    ? panel("Character direction", "jb-inspector", h("p.jb-hint", {}, "Add a character to describe their appearance and choose an identity reference."))
    : v.tab === "cover"
      ? panel("Artwork direction", "jb-inspector", h("p.jb-hint", {}, "Your cover's composition, mood and reference image will appear here."))
      : panel("Direction", "jb-inspector", h("p.jb-hint", {}, "A selected scene's timing, reference and prompts will appear here."));
  const scene = v.tab === "scenes";
  const slot = scene ? v.slot : "image";
  const busy = pendingOf(item);
  const model = VIDEO_MODELS.find((x) => x.id === item.model) ?? VIDEO_MODELS[0];
  const ready = () => slot === "video" ? !!item.image && !!item.motion?.trim() && (!item.endImage || (VIDEO_MODELS.find((x) => x.id === item.model) ?? VIDEO_MODELS[0]).endFrame)
    : slot === "endImage" ? !!item.image && !!(item.endPrompt?.trim() || item.prompt?.trim()) : !!item.prompt?.trim();
  const generateKey = key(busy ? busyOf(item) ? "Generation in progress" : "Check the existing job" : slot === "video" ? "Review video generation" : slot === "endImage" ? "Review end frame" : "Review image generation", "sparkle", () => requestGeneration(item, slot), {
    primary: true, disabled: busy || !ready(),
  });
  // The app preserves focused fields instead of redrawing them while typing.
  // Update this existing key after saving each input so review never requires a blur.
  const update = (patch) => {
    const result = updateScene(item.id, patch);
    generateKey.disabled = pendingOf(item) || !ready();
    return result;
  };
  const p = panel(scene ? "Scene direction" : v.tab === "cover" ? "Artwork direction" : "Character direction", "jb-inspector");
  if (v.tab !== "cover") p.firstElementChild.append(smallKey(`Remove ${scene ? "scene" : "character"}`, "trash", () => removeItem(item, v), busy));
  p.append(h("div.jb-inspector-scroll", { dataset: { scrollKey: `backstage-inspector-${item.id}` } },
    field(scene ? "Scene name" : "Name", item.title, (title) => update({ title }), { name: `${item.id}-title`, placeholder: scene ? "A quiet train platform" : v.tab === "cover" ? "Name this artwork" : "Name this character", disabled: busy }),
    scene ? timingFields(ctx, item) : null,
    field(v.tab === "characters" ? "Identity & appearance" : "Image direction", item.prompt, (prompt) => update({ prompt }), {
      name: `${item.id}-prompt`, area: true, rows: 4, disabled: busy,
      mentions: () => backstageMentionables(bs, mentionables(), item, slot),
      hint: "Type @ to add a character or picture reference.",
      placeholder: v.tab === "characters" ? "Appearance, outfit and defining features. Describe a clear reusable character reference." : v.tab === "cover" ? "Composition, mood and colour palette…" : "Setting, character pose, framing and atmosphere for this shot…",
    }),
    scene && slot === "endImage" ? field("End-frame direction", item.endPrompt, (endPrompt) => update({ endPrompt }), {
      name: `${item.id}-end-prompt`, area: true, rows: 3, disabled: busy,
      mentions: () => backstageMentionables(bs, mentionables(), item, slot),
      placeholder: "How should the shot end? Keep this setting and character, but pull back to reveal the station and evening sky.",
      hint: "The start frame anchors the same location, lighting and character. This is a separately generated image.",
    }) : null,
    references(bs, item, scene),
    scene ? field("Camera & action", item.motion, (motion) => update({ motion }), { name: `${item.id}-motion`, area: true, rows: 3, disabled: busy, placeholder: "A slow push-in. Hair and coat move gently in the breeze." }) : null,
    scene ? chooser("Video model", item.model || "ltx-2.5", VIDEO_MODELS.map((m) => [m.id, m.name]), (model) => update({ model }), `${item.id}-model`, busy) : null,
    scene ? h("p.jb-hint", {}, model.endFrame ? "LTX can use both frames. Short 5–10 second shots with controlled movement work best. The song stays on the edit's audio track." : "Fast H3 animates one start frame. Remove an end frame or switch to LTX to use both. The song stays on the edit's audio track.") : null,
    h("details.jb-global", {}, h("summary", {}, "Project visual direction"),
      field("Shared by every scene", bs.style, (style) => setBackstage({ style }), { name: "project-style", area: true, rows: 3, placeholder: "Hand-painted anime backgrounds, soft evening light, muted natural colour…" }))),
    h("footer.jb-inspector-foot", {},
      h("span.jb-model-label", {}, slot === "video" ? model.name : "GPT Image 2.5 Flare"),
      generateKey,
      key(`Upload ${slot === "video" ? "video" : "image"}`, "upload", () => pickFile(slot === "video" ? "video/*" : "image/*", (f) => run(() => attachAsset(item.id, slot, f))), { disabled: busy }),
      h("p.jb-hint", {}, slot === "image" && (item.endImage || item.video) ? "A new start frame archives this scene's end frame and video in Previous takes." : slot === "endImage" && item.video ? "A new end frame archives the existing video in Previous takes." : "You review the request and cost before generation starts.")));
  return p;
}

function footer(ctx, bs, v, item) {
  const ready = bs.scenes.filter((s) => s.image || s.video);
  const from = Number(ctx.b?.span?.from) || 0;
  const to = Number(ctx.b?.span?.to) || Number(ctx.b?.track?.seconds) || 0;
  const inCut = ready.filter((s) => s.to > from && s.from < to);
  return h("footer.jb-footer", {},
    h("div", {}, h("b", {}, v.tab === "scenes" ? `${ready.length} of ${bs.scenes.length} scenes have visuals` : v.tab === "characters" ? `${bs.characters.filter((c) => c.image).length} character references ready` : "Artwork for this release"),
      h("p", {}, v.tab === "scenes" ? `Edit range ${clock(from)}–${clock(to)} · music and captions are kept` : v.tab === "characters" ? "Select these identities in a scene's direction panel." : "Your cover is separate from the timestamped storyboard.")),
    v.tab === "scenes" ? h("div.jb-footer-actions", {},
      key("Open edit", "scissors", () => setWorkspace("edit"), { disabled: !ctx.b?.part }),
      key("Add scenes to edit", "next", async () => {
        await insertScenes(inCut.map((s) => s.id));
        toast(`${inCut.length} scene${inCut.length === 1 ? "" : "s"} added to the edit.`);
        setWorkspace("edit");
      }, { primary: true, disabled: !inCut.length || !ctx.b?.part || jam.busy.has('part') || !partMatchesSpan(ctx.b) }))
      : v.tab === "cover" && item?.image ? key("Use as song cover", "check", () => useCover(), { primary: true }) : null);
}

export function backstageWorkspace(ctx) {
  if (!ctx.j || !ctx.b?.track) return [h("div.jb.is-empty", {}, empty("Start with your soundtrack", "Choose or make a song, then prepare its visual world here.", "note", key("Open the song", "next", () => setWorkspace("song"))))];
  void resumeBackstageJobs(ctx.j);
  const bs = backstageOf(ctx.j);
  const v = viewOf(ctx.j);
  const item = selected(bs, v);
  return [h("div.jb", {},
    h("header.jb-toolbar", {}, segs(TABS, v.tab, (tab) => { stopBackstageAudio(); v.tab = tab; v.slot = "image"; show(); }, { label: "Backstage assets" }),
      h("div.jb-project-options", {},
        chooser("Format", bs.format || "music-video", FORMATS, (format) => setBackstage({ format }), "format"),
        v.tab === "cover" ? chooser("Cover canvas", "1:1", [["1:1", "1:1 · Square"]], () => {}, "aspect", true)
          : chooser("Project canvas", bs.aspect || "16:9", [["16:9", "16:9 · Landscape"], ["9:16", "9:16 · Portrait"], ["1:1", "1:1 · Square"]], (aspect) => setBackstage({ aspect }), "aspect"))),
    h("div.jb-workspace", {}, v.tab === "cover" ? coverLibrary(ctx, bs) : storyboard(ctx, bs, v), monitor(ctx, bs, v, item), inspector(ctx, bs, v, item)),
    footer(ctx, bs, v, item))];
}

function summaryRow(label, value) {
  return value === undefined || value === null || value === "" ? null : h("div.jb-summary-row", {}, h("dt", {}, label), h("dd", {}, value));
}

function reviewReference(bs, item, ref) {
  if (ref.name === "start-frame") return { asset: item.image, label: "Start frame" };
  if (ref.name === "identity-reference") return { asset: item.reference, label: "Identity reference" };
  const mentioned = (item.mentionRefs ?? []).find((a) => a.file === ref.file);
  if (mentioned) return { asset: mentioned, label: `@${mentioned.name} · ${mentioned.title || "Reference"}` };
  const character = bs.characters.find((c) => c.image?.file === ref.file || c.reference?.file === ref.file);
  if (character) return { asset: character.image?.file === ref.file ? character.image : character.reference, label: character.title || "Character reference" };
  return { asset: [item.reference, item.image].find((a) => a?.file === ref.file), label: "Reference image" };
}

registerWindow("backstage-review", {
  title: "REVIEW GENERATION",
  wide: true,
  build() {
    const r = review;
    if (!r || r.jamId !== jam.jam?.id) return h("p.jb-hint", {}, "This request belongs to another Jam. Close the window and review again.");
    const bs = backstageOf();
    const item = itemOf(bs, r.id);
    if (!item) return h("p.jb-hint", {}, "This asset is no longer in the project.");
    if (r.type === "remove") return h("div.jb-review", {},
      h("h2", {}, `Remove ${r.title || "this asset"}?`), h("p", {}, "Its generated files stay in the library. This removes its place in this Backstage plan."),
      h("div.jb-review-actions", {}, key("Cancel", null, () => openWindow(null)), key("Remove from plan", "trash", async () => {
        r.tab === "characters" ? await removeCharacter(r.id) : await removeScene(r.id);
        openWindow(null);
      })));
    const d = r.details;
    const price = r.estimate;
    const value = price?.credits ?? price?.estimatedCredits ?? price?.estimate ?? null;
    const references = r.kind === "video" ? d.frames.map((asset, i) => ({ asset, label: i === 0 ? "Start frame" : "End frame" }))
      : d.references.map((ref) => reviewReference(bs, item, ref));
    const changedRequest = JSON.stringify(generationDetails(r.id, r.kind)) !== r.signature;
    return h("div.jb-review", {},
      h("div.jb-review-heading", {}, h("span.label", {}, `Backstage · ${labelFor(r.kind)}`), h("h2", {}, r.title || "Untitled scene"),
        h("p.jb-hint", {}, r.kind === "video" ? "Animate this scene. Your song remains the soundtrack in the final edit." : r.id === "cover" ? "Generate square cover artwork. It stays separate from your video scenes." : bs.characters.some((c) => c.id === r.id) ? "Generate a reusable character reference to keep this identity consistent across scenes." : "Generate one image, then review it before making a video.")),
      h("div.jb-review-body", {},
        references.some((ref) => assetUrl(ref.asset)) ? h("div.jb-review-references", {}, ...references.filter((ref) => assetUrl(ref.asset)).map((ref) => h("figure.jb-review-reference", {}, h("img", { src: assetUrl(ref.asset), alt: ref.label }), h("figcaption", {}, ref.label)))) : null,
        h("dl.jb-summary", {},
          summaryRow("Model", d.modelName || d.model || (r.kind === "video" ? VIDEO_MODELS.find((m) => m.id === item.model)?.name : "GPT Image 2.5 Flare")),
          summaryRow("Output", r.kind === "video" ? `${seconds(d.duration)} video` : `${d.request.count || 1} image · ${d.request.megapixels || 1} MP`),
          summaryRow("In the edit", r.kind === "video" && d.duration !== d.timelineDuration ? `${seconds(d.timelineDuration)} · trimmed to the scene` : null),
          summaryRow("Resolution", d.width && d.height ? `${d.width} × ${d.height}` : d.resolution),
          summaryRow("Canvas", r.id === "cover" ? "1:1" : bs.aspect),
          summaryRow("Song timing", bs.scenes.some((s) => s.id === item.id) ? `${clock(item.from)}–${clock(item.to)}` : null),
          summaryRow("End frame", r.kind === "video" ? item.endImage && item.model === "ltx-2.5" ? "Included" : "Not used" : null),
          summaryRow("Characters", (item.characterIds ?? []).map((id) => bs.characters.find((c) => c.id === id)?.title).filter(Boolean).join(", ")))),
      h("section.jb-review-direction", {}, h("span.label", {}, "Generation direction"), h("p", {}, d.prompt || [bs.style, item.prompt, r.kind === "video" ? item.motion : ""].filter(Boolean).join("\n\n"))),
      h("div.jb-review-price", {}, h("div", {}, h("span", {}, "Estimated additional cost"), h("strong", {}, r.loading ? "Checking…" : typeof value === "number" && Number.isFinite(value) ? `≈ ${value.toFixed(2).replace(/\.00$/, "")} cr` : "Not available")),
        h("p", {}, price?.note || price?.costNote || "Actual billing depends on provider execution. This estimate is for this asset only; later images and videos are separate.")),
      changedRequest ? h("p.jb-error", { role: "alert" }, "The scene changed. Close this window and review the updated request.") : null,
      h("div.jb-review-actions", {}, key("Cancel", null, () => openWindow(null)), key(`Generate ${labelFor(r.kind)}`, "sparkle", async () => {
        if (r.jamId !== jam.jam?.id || JSON.stringify(generationDetails(r.id, r.kind)) !== r.signature) throw new Error("The scene changed. Review the updated request first.");
        openWindow(null);
        await generateAsset(r.id, r.kind, { confirm: true, expected: r.signature });
      }, { primary: true, disabled: r.loading || changedRequest || pendingOf(item) })));
  },
});

// A dropped file belongs to the selected Backstage asset, not the global song drop target.
document.addEventListener("drop", (e) => {
  const stage = e.target.closest?.(".jb");
  if (!stage || !e.dataTransfer?.files?.length || jam.workspace !== "backstage" || !jam.jam) return;
  e.preventDefault();
  e.stopPropagation();
  const v = viewOf(jam.jam);
  const item = selected(backstageOf(), v);
  if (!item) return void toast("Add a scene or a character first.");
  const file = e.dataTransfer.files[0];
  const slot = file.type.startsWith("video/") && v.tab === "scenes" ? "video" : file.type.startsWith("image/") ? v.tab === "scenes" && v.slot === "endImage" ? "endImage" : "reference" : null;
  if (!slot) return void toast("Drop an image reference or a video for this scene.");
  run(() => attachAsset(item.id, slot, file));
}, true);

export function stopBackstageAudio() { audition?.pause(); }
/** Return from a timeline clip to its own saved scene direction. */
export function openBackstageScene(id) {
  if (!jam.jam) return;
  const v = viewOf(jam.jam);
  v.tab = "scenes";
  v.scene = id;
  v.slot = "image";
  setWorkspace("backstage");
}
document.addEventListener("jam:drawn", () => { if (jam.workspace !== "backstage") stopBackstageAudio(); });
window.addEventListener("hashchange", stopBackstageAudio);
