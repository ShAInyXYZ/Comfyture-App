// The Utensils "Edit" workspace: twelve free tools that run on this machine (trim, reframe, speed, reverse, loop, merge,
// captions, grade, logo, audio, convert, GIF and frames). The strip of the tools is above, the workbench below: the stage with
// the clip, its transport and its timeline on the left (utensils-edit-stage.js), the open tool's controls and the yellow Export
// key on the right (utensils-edit-controls.js). Nothing here costs credits. The workspace is made once and kept: a clip that plays
// must not be made again at each redraw, so the stage lives on and the strip and the controls are drawn again around it.
// A workspace is { el, update, sig, count }: the shell (panels/utensils.js) puts el in the grid and calls update() when sig() changes.
import { h, icon, sprite, ago } from "./dom.js";
import { toast, changed } from "./store.js";
import { api } from "./api.js";
import { currentPage } from "./router.js";
import { utensils, inputOf, setInput, setQuietly, pickTool, runTool, give, pickInput, show, forget, takersOf, handOn } from "./utensils.js";
import { EDIT_TOOLS, editTool, isEdit, paramsOf, readyOf, bodyOf, registerEditTools } from "./utensils-edit-tools.js";
import { art } from "./utensils-edit-art.js";
import { createStage } from "./utensils-edit-stage.js";
import { controlsOf, readCuesFile, readLutFile, giveSound, chooseFile } from "./utensils-edit-controls.js";
import { editPreview } from "./utensils-edit-api.js";

// the twelve tools are on the shelf as soon as the page is (the Shelf's grid and Truffle know them before this workspace is open)
registerEditTools();

const PREVIEWS = ["reframe", "grade", "logo", "captions"];
/** The tools that show the real frame at once, because moving their sliders is how they are used. */
const LIVE = { grade: true };
const RANGED = ["trim", "gif", "logo"];

// what is on show, by tool: whether the clip or the result, whether one real frame is on, and the last frame asked for
const ui = { views: {}, seen: {}, preview: {}, uploading: false };

export function editSpace() {
  const el = h("div.ut-grid.is-edit");
  const cards = h("section.ut-bento.ue-strip-card");
  const side = h("div.ue-side");
  const made = h("div.ue-made");
  let t = EDIT_TOOLS[0];

  /** What the current tool's settings are right now (never a copy kept from an earlier draw). */
  const params = () => paramsOf(t.key, inputOf(t.id));
  const set = (patch, quiet = false) => {
    if (quiet) {
      setQuietly(patch, t.id);
      live();
    } else setInput(patch, t.id);
  };

  // ---- the stage, made once
  const stage = createStage({
    pick: () => (t.key === "merge" ? addClips() : pickInput("video")),
    range: (patch, quiet) => set(patch, quiet),
    crop: (patch, quiet) => set(patch, quiet),
    time: () => wantFrame(),
    play: () => {
      const pv = ui.preview[t.key];
      if (pv) pv.url = null;
      live();
    },
    open: (r) => (setInput({ video: { file: r.file, url: r.url, width: r.width, height: r.height, duration: r.seconds } }, t.id), (ui.views[t.id] = "source")),
  });
  stage.el.append(made);

  // ---- files: a clip, a sound, caption lines, a LUT
  async function uploadClips(files) {
    ui.uploading = true;
    changed("utensils");
    try {
      const clips = [...params().clips];
      for (const f of files) {
        if (!f.type.startsWith("video/")) continue;
        const v = await api.uploadVideo(f);
        clips.push({ file: v.file, url: v.url, width: v.width, height: v.height, duration: v.duration, name: f.name.replace(/\.\w+$/, "").slice(0, 40) });
      }
      setInput({ clips: clips.slice(0, 12) }, "ed-merge");
    } catch (e) {
      toast(e.message, { tone: "crit" });
    } finally {
      ui.uploading = false;
      changed("utensils");
    }
  }
  function addClips() {
    const input = h("input", { type: "file", accept: "video/*", multiple: true, hidden: true, on: { change: () => (input.files.length && uploadClips([...input.files]), input.remove()) } });
    document.body.append(input);
    input.click();
  }
  const addOpen = () => {
    const v = inputOf("ed-merge").video;
    if (v) setInput({ clips: [...params().clips, { file: v.file, url: v.url, width: v.width, height: v.height, duration: v.duration, name: "Open clip" }].slice(0, 12) }, "ed-merge");
  };
  /** A file dropped or pasted: where it goes depends on the tool open. */
  function take(file) {
    const name = file.name ?? "";
    if (/\.(srt|vtt)$/i.test(name) && t.key === "captions") return readCuesFile(file, (p) => set(p));
    if (/\.cube$/i.test(name) && t.key === "grade") return readLutFile(file, (p) => set(p));
    if (file.type.startsWith("video/")) return t.key === "merge" ? uploadClips([file]) : give(file);
    if (file.type.startsWith("audio/") && t.key === "audio") return giveSound(file);
    if (file.type.startsWith("image/") && t.key === "logo") return give(file);
    toast(t.key === "merge" ? "Drop clips here." : "Drop a clip here.");
  }
  el.addEventListener("dragover", (e) => e.dataTransfer?.types?.includes("Files") && e.preventDefault());
  el.addEventListener("drop", (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    for (const f of e.dataTransfer.files) take(f);
  });
  document.addEventListener("paste", (e) => {
    if (currentPage() !== "utensils" || utensils.workspace !== "edit" || e.target.closest?.("input, textarea")) return;
    const files = [...(e.clipboardData?.files ?? [])];
    if (!files.length) return;
    e.preventDefault();
    files.forEach(take);
  });

  const env = {
    set,
    stage,
    params,
    addClips,
    addOpen,
    readCues: (f) => readCuesFile(f, (p) => set(p)),
    readLut: (f) => readLutFile(f, (p) => set(p)),
    pickSound: () => chooseFile("audio/*,video/*", giveSound),
  };

  // ---- one real frame of what the tool would make (the tools that draw on every frame): asked for a moment after the last change
  let wait = 0;
  let token = 0;
  function wantFrame() {
    clearTimeout(wait);
    const pv = ui.preview[t.key];
    if (!pv?.on || !PREVIEWS.includes(t.key)) return;
    wait = setTimeout(askFrame, 280);
  }
  async function askFrame() {
    const key = t.key;
    const pv = ui.preview[key];
    const i = inputOf(t.id);
    if (!pv || !i.video || !readyOf(key, i) || (key === "captions" && !params().cues.length)) return void ((pv.url = null), live());
    const at = Math.round(stage.time() * 10) / 10;
    const body = bodyOf(key, i);
    const sig = JSON.stringify([key, body, at]);
    if (sig === pv.sig && pv.url) return;
    const mine = ++token;
    pv.busy = true;
    live();
    try {
      const out = await editPreview(key, body, at);
      if (mine !== token || key !== t.key) return;
      Object.assign(pv, { url: `${out.url}?${Date.now().toString(36)}`, at, sig, busy: false });
    } catch (e) {
      if (mine === token) Object.assign(pv, { url: null, busy: false, sig: "" });
      if (mine === token) toast(`Preview: ${e.message}`, { tone: "crit" });
    }
    if (mine === token) live();
  }
  function togglePreview() {
    const key = t.key;
    const pv = (ui.preview[key] ??= { on: false });
    if (pv.on) Object.assign(pv, { on: false, url: null, busy: false, sig: "" });
    else (pv.on = true), askFrame();
    live();
  }

  // ---- what the stage is told
  const shownResult = () => {
    const mine = utensils.results.filter((r) => r.tool === t.id);
    return mine.find((r) => r.id === utensils.shown) ?? mine[0] ?? null;
  };
  function stageContext() {
    const i = inputOf(t.id);
    const p = paramsOf(t.key, i);
    const result = shownResult();
    const pv = ui.preview[t.key];
    return {
      key: t.key, params: p, clip: t.key === "merge" ? p.clips[0] ?? null : i.video ?? null, image: i.image,
      result, view: result && ui.views[t.id] === "result" ? "result" : "source",
      setView: (v) => ((ui.views[t.id] = v), live()),
      canPreview: PREVIEWS.includes(t.key), preview: { on: !!pv?.on, url: pv?.on ? pv.url : null, at: pv?.at, busy: !!pv?.busy },
      togglePreview,
    };
  }
  /** The stage and what hangs on it is brought up to date (a setting moved, a frame came), the controls left as they are. */
  function live() {
    stage.sync(stageContext());
    wantFrame();
  }

  // a clip that is a new one starts every range tool whole, and a new result is shown when it comes
  function settle() {
    const i = inputOf(t.id);
    const file = t.key === "merge" ? "" : i.video?.file ?? "";
    if (RANGED.includes(t.key) && i.for !== file) setQuietly({ for: file, start: 0, end: 0, ...(t.key === "gif" ? { times: [] } : {}) }, t.id);
    const latest = utensils.results.find((r) => r.tool === t.id)?.id;
    if (ui.seen[t.id] === undefined) ui.seen[t.id] = latest ?? null;
    else if (latest && latest !== ui.seen[t.id]) {
      ui.seen[t.id] = latest;
      ui.views[t.id] = "result";
    }
  }

  // ---- the strip of the tools
  const tool = (x) =>
    h(`button.ue-tool${x.id === t.id ? ".is-on" : ""}`, { type: "button", title: x.hint, "aria-pressed": String(x.id === t.id), dataset: { tool: x.id }, on: { click: () => pickTool(x.id) } },
      h("span.ue-tool-head", {}, h("span.ue-tool-icon", {}, sprite(x.icon)), h("b", {}, x.name)),
      art(x.key));
  const drawCards = () =>
    cards.replaceChildren(
      h("div.ut-b-head", {}, h("span.ut-b-label", {}, "Edit tools"), h("span.ut-b-note", {}, "free · on your machine")),
      h("div.ue-tools", {}, ...EDIT_TOOLS.map(tool)));

  // ---- the workbench's right column
  function drawSide() {
    const i = inputOf(t.id);
    const p = paramsOf(t.key, i);
    const job = utensils.jobs.find((j) => j.tool === t.id && j.status === "running");
    const ok = readyOf(t.key, i) && !job && !ui.uploading;
    const lacks = t.key === "merge" ? "Add two clips or more" : !i.video ? "Add a clip first" : t.key === "captions" && !p.cues.length ? "Add a caption line first" : t.key === "logo" && !i.image ? "Add the logo first" : t.key === "audio" && p.mode !== "mute" && !i.audio ? "Add the new sound first" : "";
    side.replaceChildren(
      h("div.ut-bench-title", {}, h("h2", {}, t.name), h("p", {}, t.hint)),
      ...controlsOf(t.key, p, i, env),
      h("span.spacer"),
      h("div.ue-export", {},
        h("span.ue-free", { title: "Nothing here costs credits: it runs with ffmpeg on this machine." }, h("span.lamp", { dataset: { tone: "ok" } }), "Free · on your machine"),
        h("button.ut-primary.ut-go", { type: "button", disabled: !ok, title: ok ? `${t.name}: export the result` : lacks, on: { click: () => runTool(t.id) } },
          sprite("export"), h("span", {}, job ? `Working ${Math.round((job.progress ?? 0) * 100)} %` : ui.uploading ? "Adding the clip" : "Export"))));
  }

  /** The results this tool has made, small, to show again (in the result view, where the timeline was). */
  function drawMade() {
    const list = utensils.results.filter((r) => r.tool === t.id).slice(0, 12);
    const shown = shownResult();
    made.replaceChildren(
      h("span.ut-label", {}, "Made here"),
      ...list.map((r) => {
        const pic = r.kind === "image" ? h("img", { src: r.url, alt: "", draggable: false, loading: "lazy" }) : r.kind === "video" ? h("video", { src: `${r.url}#t=0.1`, muted: true, preload: "metadata", playsInline: true }) : h("span.ue-made-audio", {}, icon("sound"));
        return h(`div.ue-made-item${r.id === shown?.id ? ".is-on" : ""}`, { title: `${r.note ?? t.name} · ${ago(r.at)}` },
          h("button.ue-made-pic", { type: "button", "aria-label": "Show it", on: { click: () => (show(r.id), (ui.views[t.id] = "result"), live()) } }, pic),
          h("button.ue-made-x", { type: "button", title: "Take it off the list\nThe file stays in the Library", "aria-label": "Take it off the list", on: { click: () => forget(r.id) } }, icon("close")));
      }),
      shown ? h("span.ut-readout.ue-made-note", {}, shown.note ?? "") : null,
      shown && takersOf(shown).filter((x) => !isEdit(x.id)).length ? h("span.ue-made-hands", {}, ...takersOf(shown).filter((x) => !isEdit(x.id)).slice(0, 5).map((x) => h("button.ut-iconkey.is-quiet", { type: "button", title: `Give it to ${x.name}`, "aria-label": `Give it to ${x.name}`, on: { click: () => handOn(shown, x.id) } }, sprite(x.icon)))) : null);
  }

  const bench = h("section.ut-bento.ue-benchwrap", {}, h("div.ue-bench", {}, h("div.ue-main", {}, stage.el), side));
  el.append(cards, bench);

  function update() {
    if (!isEdit(utensils.tool)) utensils.tool = EDIT_TOOLS[0].id;
    // a line or a field being typed in is left alone: the screen is drawn again when it is left
    const a = document.activeElement;
    if (el.contains(a) && a.matches("input:not([type=range]):not([type=color]):not([type=file]), textarea")) return false;
    t = editTool(utensils.tool);
    if (PREVIEWS.includes(t.key)) ui.preview[t.key] ??= { on: !!LIVE[t.key] };
    settle();
    bench.dataset.tool = t.key;
    drawCards();
    drawSide();
    drawMade();
    live();
  }
  const sig = () => {
    const tt = editTool(utensils.tool) ?? EDIT_TOOLS[0];
    const i = inputOf(tt.id);
    const jobs = utensils.jobs.filter((j) => j.tool === tt.id).map((j) => [j.id, j.status, Math.round((j.progress ?? 0) * 100)]);
    return JSON.stringify([tt.id, i, utensils.shown, utensils.results.filter((r) => r.tool === tt.id).map((r) => r.id), jobs, ui.uploading, ui.views[tt.id]]);
  };
  return { el, update, sig, count: () => EDIT_TOOLS.length };
}
