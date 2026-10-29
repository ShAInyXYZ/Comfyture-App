import { h, icon } from "../dom.js";
import { workflowUrl } from "../api.js";
import { state, openTake, approve, reframe, cancel, remove, remix, useSettings, useLastFrame, continueFrom, shareClip, newSound, removeFilm, inProject } from "../store.js";
import { view } from "../viewer.js";

const STATE = {
  queued: ["Waiting", "busy"],
  frame: ["Painting", "busy"],
  review: ["Last frame ready", "warn"],
  shot: ["Rendering", "busy"],
  done: ["Done", "ok"],
  failed: ["Failed", "crit"],
  canceled: ["Canceled", undefined],
};
let menu = null;

function thumb(run) {
  const box = h("div.take-thumb", {});
  if (run.status === "done") {
    box.append(h("video", { src: `${run.video}#t=0.4`, muted: true, preload: "metadata", draggable: false }));
  } else {
    const src = state.previews.get(run.id) ?? run.frame ?? (run.request.start ? `media/photos/${run.request.start}` : null);
    if (src) box.append(h("img", { src, alt: "", draggable: false }));
    if (["queued", "frame", "shot"].includes(run.status)) box.append(h("span.bar", { style: { width: `${Math.round(run.progress * 100)}%` } }));
  }
  return box;
}

function dialog(title, hint, value, placeholder, label, onSubmit) {
  const d = h("dialog.dialog", {});
  const field = h("textarea.field", { rows: 3, value, placeholder });
  d.append(h("form", { method: "dialog", on: { submit: (e) => {
    e.preventDefault();
    if (field.value.trim()) onSubmit(field.value.trim());
    d.close();
  } } },
    h("h2", {}, title),
    h("span.hint", {}, hint),
    field,
    h("div.row", {},
      h("button.key", { type: "button", on: { click: () => d.close() } }, "Cancel"),
      h("button.key", { type: "submit", "aria-pressed": "true" }, label),
    ),
  ));
  d.addEventListener("close", () => d.remove());
  document.body.append(d);
  d.showModal();
  field.focus();
}

const paintAgain = (run) =>
  dialog("Paint the last frame again", "A new seed, and your instruction if you change it.", run.request.end?.paint ?? "", "", "Paint again", (text) => reframe(run.id, text));

const soundDialog = (run) =>
  dialog("A new sound for this take", "The picture stays. LTX-2.5 writes the sound again for what it sees.",
    run.request.sound?.text ?? run.request.script.shots.map((s) => s.sound?.trim()).filter(Boolean).join(" "),
    "Rain on a tin roof, a distant train horn.", "Roll the sound", (text) => newSound(run, text));

function closeMenu() {
  menu?.remove();
  menu = null;
}

function moreMenu(run, at) {
  closeMenu();
  const item = (ic, label, fn, cls = "") => h(`button${cls}`, { type: "button", on: { click: () => (closeMenu(), fn()) } }, icon(ic), label);
  const list = [
    item("open", "Open in a tab", () => openTake(run.id)),
    item("remix", "Copy into the Draft", () => useSettings(run)),
  ];
  if (run.status === "done") {
    list.push(
      item("image", "Use its last frame as a start", () => useLastFrame(run)),
      item("dice", "Remix (new seed)", () => remix(run)),
      h("a", { href: workflowUrl(run.id), on: { click: closeMenu } }, icon("flow"), "ComfyUI workflow"),
    );
  }
  if (!["queued", "frame", "review", "shot"].includes(run.status)) {
    // deleting asks twice: the first press arms it
    const del = h("button.is-danger", { type: "button" }, icon("trash"), "Delete take");
    let armed = false;
    del.addEventListener("click", () => {
      if (armed) return (closeMenu(), remove(run.id));
      armed = true;
      del.replaceChildren(icon("trash"), "Delete? Click again");
    });
    list.push(h("hr"), del);
  }
  const box = at.getBoundingClientRect();
  menu = h("div.menu", { style: { left: `${Math.min(innerWidth - 220, box.left)}px`, top: `${box.top - 8}px`, transform: "translateY(-100%)" } }, ...list);
  document.body.append(menu);
  setTimeout(() => document.addEventListener("pointerdown", (e) => !menu?.contains(e.target) && closeMenu(), { once: true }));
}

/** What can be done to a take, over its picture: the obvious next steps only, the rest is under "more". */
function actions(run) {
  const key = (ic, label, fn, opts = {}) =>
    h("button.key.is-icon", { type: "button", "aria-label": label, title: label, ...opts, on: { click: (e) => (e.stopPropagation(), fn(e)) } }, icon(ic));
  const list = [];
  if (run.status === "review") {
    list.push(h("button.key.is-primary", { type: "button", on: { click: (e) => (e.stopPropagation(), approve(run.id)) } }, "Animate"),
      key("remix", "Paint again", () => paintAgain(run)));
  } else if (["queued", "frame", "shot"].includes(run.status)) {
    list.push(h("button.key", { type: "button", on: { click: (e) => (e.stopPropagation(), cancel(run.id)) } }, "Cancel"));
  } else if (run.status === "done") {
    list.push(
      key("next", "Next shot: starts where this one ends", () => continueFrom(run)),
      key("sound", "New sound: keep the picture", () => soundDialog(run), { disabled: !!run.request.audio || run.fps !== 24 }),
      key("share", "A 9:16 clip to post", () => shareClip(run)),
      h("a.key.is-icon", {
        href: `${run.video}?download=comfyture-${run.request.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-take${run.take}.mp4`,
        "aria-label": "Download",
        title: "Download",
        on: { click: (e) => e.stopPropagation() },
      }, icon("download")),
    );
  } else {
    list.push(h("button.key", { type: "button", on: { click: (e) => (e.stopPropagation(), remix(run)) } }, "Retry"));
  }
  return h("div.take-actions", {}, list);
}

function card(run) {
  const [label, tone] = STATE[run.status] ?? [run.status];
  const name = run.takes > 1 ? `${run.request.name} · ${run.take}/${run.takes}` : run.request.name;
  const isOpen = state.tabs.some((t) => t.run === run.id && t.id === state.tab);
  const running = ["queued", "frame", "shot"].includes(run.status);
  const stage = run.error ? `${label} · ${String(run.error).trim().split("\n")[0]}` : (running ? `${run.stage || label} · ${Math.round(run.progress * 100)}%` : run.status === "done" ? `Ready in ${run.seconds.shot ?? "?"} s` : label);
  const box = thumb(run);
  box.append(h("span.take-dur", {}, `${(run.length ?? run.request.seconds).toFixed(1)} s`), actions(run));
  return h("article.take", {
    className: `${isOpen ? "is-open" : ""} ${run.status === "review" ? "is-review" : ""}`,
    title: run.prompt,
    on: { click: () => openTake(run.id) },
  },
    box,
    h("div.take-title", {},
      h("b", {}, name),
      h("button.key.is-quiet.is-icon.take-more", { type: "button", "aria-label": "More", title: "More", on: { click: (e) => (e.stopPropagation(), moreMenu(run, e.currentTarget)) } }, icon("more")),
    ),
    h("div.take-state", { className: run.error ? "is-error" : "" }, h("span.lamp", { dataset: tone ? { tone } : {} }), h("span", run.error ? { title: String(run.error).trim() } : {}, stage)),
  );
}

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** A film cut from takes: plays full screen; download it, or delete it (asks twice). */
function filmCard(film) {
  const del = h("button.key.is-icon", { type: "button", "aria-label": "Delete film", title: "Delete film" }, icon("trash"));
  del.addEventListener("click", (e) => {
    e.stopPropagation();
    if (del.classList.contains("is-armed")) return removeFilm(film.id);
    del.classList.add("is-armed");
    del.replaceChildren(icon("trash"), "Delete?");
  });
  return h("article.take.is-film", { title: `${film.name} · ${film.takes.length} shots`, on: { click: () => view(film.url, "video") } },
    h("div.take-thumb", {},
      h("video", { src: `${film.url}#t=0.6`, muted: true, preload: "metadata", draggable: false }),
      h("span.film-badge", {}, icon("film"), "Film"),
      h("span.take-dur", {}, `${film.seconds.toFixed(1)} s`),
      h("div.take-actions", {},
        h("a.key.is-icon", { href: `${film.url}?download=comfyture-${slug(film.name) || "film"}.mp4`, "aria-label": "Download", title: "Download", on: { click: (e) => e.stopPropagation() } }, icon("download")),
        del,
      ),
    ),
    h("div.take-title", {}, h("b", {}, film.name)),
    h("div.take-state", {}, h("span.lamp", { dataset: { tone: "ok" } }), h("span", {}, `${film.takes.length} shots`)),
  );
}

// Progress arrives every second while a take renders: cards whose take didn't change are kept
// as they are, so the log doesn't rebuild dozens of video thumbnails on every tick.
const built = new Map();
function cached(key, sig, make) {
  const hit = built.get(key);
  if (hit && hit.sig === sig) return hit.el;
  const el = make();
  built.set(key, { sig, el });
  return el;
}
const runSig = (run) => JSON.stringify([
  run.status, run.stage, Math.round((run.progress ?? 0) * 100), run.error, run.video, run.length, run.request.name, run.take, run.takes,
  state.tabs.some((t) => t.run === run.id && t.id === state.tab), state.previews.get(run.id) ?? null,
]);

export function renderTakes(el) {
  // the open project's takes and films only
  const runs = state.runs.filter((r) => inProject("take", { id: r.id, project: r.request?.project }));
  const films = state.films.filter((f) => inProject("film", f));
  const before = el.querySelector(".shelf");
  const scroll = [before?.scrollLeft ?? 0, before?.scrollTop ?? 0];
  el.replaceChildren(
    h("div.card-head", {},
      h("span.card-label", { role: "heading", "aria-level": "2" }, "Take log"),
      h("span.card-hint", {}, runs.length
        ? `${runs.length} take${runs.length > 1 ? "s" : ""}${films.length ? ` · ${films.length} film${films.length > 1 ? "s" : ""}` : ""}`
        : ""),
    ),
    runs.length || films.length
      ? h("div.shelf", {},
          films.map((f) => cached(`film:${f.id}`, `${f.name}|${f.seconds}`, () => filmCard(f))),
          runs.map((r) => cached(r.id, runSig(r), () => card(r))))
      : h("p.shelf-empty", {}, "Takes you roll appear here, newest first."),
  );
  const shelf = el.querySelector(".shelf");
  if (shelf) [shelf.scrollLeft, shelf.scrollTop] = scroll;
  const live = new Set([...runs.map((r) => r.id), ...state.films.map((f) => `film:${f.id}`)]);
  for (const key of built.keys()) if (!live.has(key)) built.delete(key);
}
