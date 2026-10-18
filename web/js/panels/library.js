import { h, icon, sprite, ago } from "../dom.js";
import { state, openTake, remove, removeFilm, useImage, loadPhotos, takeLength, openImage } from "../store.js";
import { addTakesToCut, editFilm } from "../cut.js";
import { workflowUrl } from "../api.js";
import { go } from "../router.js";
import { view } from "../viewer.js";

let kind = "takes";
let query = "";
const picked = new Set();
let asked = false;

const STATE = { queued: ["Waiting", "busy"], frame: ["Painting", "busy"], review: ["Needs you", "warn"], shot: ["Rendering", "busy"], done: ["Done", "ok"], failed: ["Failed", "crit"], canceled: ["Canceled", null] };
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "take";
const match = (...parts) => !query.trim() || parts.join(" ").toLowerCase().includes(query.trim().toLowerCase());

/** A confirm that asks twice: the first press arms it. */
function twoStep(label, run) {
  const key = h("button.key.is-sm.is-icon.is-quiet", { type: "button", "aria-label": label, title: label }, icon("trash"));
  key.addEventListener("click", (e) => {
    e.stopPropagation();
    if (key.classList.contains("is-armed")) return run();
    key.classList.add("is-armed");
    key.replaceChildren(icon("trash"), "Sure?");
  });
  return key;
}

function pickBox(id) {
  const box = h("button.lib-pick", {
    type: "button",
    "aria-pressed": String(picked.has(id)),
    "aria-label": "Select",
    on: { click: (e) => {
      e.stopPropagation();
      picked.has(id) ? picked.delete(id) : picked.add(id);
      box.setAttribute("aria-pressed", String(picked.has(id)));
      box.closest(".lib-card")?.classList.toggle("is-picked", picked.has(id));
      refreshBar();
    } },
  }, icon("check"));
  return box;
}

function takeCard(run) {
  const [label, tone] = STATE[run.status] ?? [run.status, null];
  const done = run.status === "done";
  const media = done
    ? h("video", { src: `${run.video}#t=0.5`, muted: true, loop: true, preload: "metadata", draggable: false })
    : h("img", { src: state.previews.get(run.id) ?? run.frame ?? (run.request.start ? `media/photos/${run.request.start}` : ""), alt: "", draggable: false });
  const card = h("article.lib-card", { className: picked.has(run.id) ? "is-picked" : "", on: { click: () => (openTake(run.id), go("shot")) } },
    h("div.lib-thumb", {}, media, done ? pickBox(run.id) : null, h("span.lib-dur", {}, `${takeLength(run).toFixed(1)} s`)),
    h("div.lib-meta", {},
      h("b", {}, run.takes > 1 ? `${run.request.name} · ${run.take}/${run.takes}` : run.request.name),
      h("span.lib-sub", {}, h("span.lamp", { dataset: tone ? { tone } : {} }), run.error ?? label, h("em", {}, ago(run.createdAt)))),
    h("div.lib-actions", {},
      done ? h("button.key.is-sm", { type: "button", title: "Add it to the open edit in Cut", on: { click: (e) => (e.stopPropagation(), addTakesToCut([run.id])) } }, icon("plus"), "Cut") : null,
      done ? h("a.key.is-sm.is-icon.is-quiet", { href: `${run.video}?download=comfyture-${slug(run.request.name)}-take${run.take}.mp4`, "aria-label": "Download", title: "Download", on: { click: (e) => e.stopPropagation() } }, icon("download")) : null,
      h("a.key.is-sm.is-icon.is-quiet", { href: workflowUrl(run.id), "aria-label": "ComfyUI workflow", title: "ComfyUI workflow", on: { click: (e) => e.stopPropagation() } }, icon("flow")),
      !["queued", "frame", "review", "shot"].includes(run.status) ? twoStep("Delete take", () => remove(run.id)) : null,
    ),
  );
  if (done) {
    const v = card.querySelector("video");
    card.addEventListener("pointerenter", () => v.play().catch(() => {}));
    card.addEventListener("pointerleave", () => (v.pause(), (v.currentTime = 0.5)));
  }
  return card;
}

function filmCard(film) {
  const card = h("article.lib-card.is-film", { on: { click: () => view(film.url, "video") } },
    h("div.lib-thumb", {},
      h("video", { src: `${film.url}#t=0.6`, muted: true, loop: true, preload: "metadata", draggable: false }),
      h("span.film-badge", {}, icon("film"), "Film"),
      h("span.lib-dur", {}, `${film.seconds.toFixed(1)} s`)),
    h("div.lib-meta", {}, h("b", {}, film.name), h("span.lib-sub", {}, `${film.takes.length} clips${film.transition === "fade" ? " · dissolves" : ""}`, h("em", {}, ago(film.createdAt)))),
    h("div.lib-actions", {},
      film.clips || film.cut || film.takes?.length
        ? h("button.key.is-sm", { type: "button", title: "Edit it again in Cut", on: { click: (e) => (e.stopPropagation(), go("cut"), editFilm(film)) } }, icon("scissors"), "Edit again")
        : null,
      h("a.key.is-sm.is-icon.is-quiet", { href: `${film.url}?download=comfyture-${slug(film.name)}.mp4`, "aria-label": "Download", title: "Download", on: { click: (e) => e.stopPropagation() } }, icon("download")),
      twoStep("Delete film", () => removeFilm(film.id)),
    ),
  );
  const v = card.querySelector("video");
  card.addEventListener("pointerenter", () => v.play().catch(() => {}));
  card.addEventListener("pointerleave", () => (v.pause(), (v.currentTime = 0.6)));
  return card;
}

function imageCard(photo) {
  return h("article.lib-card.is-image", { on: { click: () => view(photo.url) } },
    h("div.lib-thumb", {}, h("img", { src: photo.url, alt: "", loading: "lazy", draggable: false }), h("span.lib-dur", {}, `${photo.width} × ${photo.height}`)),
    h("div.lib-meta", {}, h("b", {}, photo.name ?? "Image"), h("span.lib-sub", {}, ago(photo.createdAt))),
    h("div.lib-actions", {},
      h("button.key.is-sm", { type: "button", title: "Use as the start frame", on: { click: (e) => (e.stopPropagation(), useImage(photo)) } }, icon("play"), "Use as start"),
      h("button.key.is-sm.is-icon", { type: "button", title: "Edit it in the Image window", "aria-label": "Edit it", on: { click: (e) => (e.stopPropagation(), openImage({ refs: [photo], template: "edit" })) } }, sprite("image-edit"))),
  );
}

function refreshBar() {
  const bar = document.querySelector("#page-library .lib-selection");
  if (!bar) return;
  bar.hidden = !picked.size;
  bar.querySelector("b").textContent = `${picked.size} selected`;
}

export function renderLibrary(el) {
  if (!asked) {
    asked = true;
    loadPhotos();
  }
  const takes = state.runs.filter((r) => match(r.request.name, r.prompt, r.status));
  const films = state.films.filter((f) => match(f.name));
  const photos = state.photos.filter((p) => match(p.file));
  const shown = kind === "takes" ? takes : kind === "films" ? films : photos;
  for (const id of [...picked]) if (!state.runs.some((r) => r.id === id && r.status === "done")) picked.delete(id);
  const search = h("input.field.lib-search", {
    type: "search", placeholder: "Search", value: query, "aria-label": "Search the library",
    on: { input: (e) => {
      query = e.target.value;
      renderLibrary(el);
      const again = el.querySelector(".lib-search");
      again.focus();
      again.setSelectionRange(again.value.length, again.value.length);
    } },
  });
  const count = (n) => h("span.count", {}, String(n));
  el.replaceChildren(
    h("div.page-head", {},
      h("h1", {}, "Library"),
      h("span.hint", {}, "Everything you've made: takes, films and images."),
      h("span.spacer"),
      h("label.search-box", {}, icon("search"), search)),
    h("div.lib-bar", {},
      h("div.segment", { role: "group", "aria-label": "Show" },
        ...[["takes", "Takes", state.runs.length], ["films", "Films", state.films.length], ["images", "Images", state.photos.length]].map(([id, label, n]) =>
          h("button", { type: "button", "aria-pressed": String(kind === id), on: { click: () => ((kind = id), renderLibrary(el)) } }, label, count(n)))),
      kind === "images" ? h("button.key", { type: "button", title: "Make a picture in the Image window", on: { click: () => openImage() } }, sprite("image-generate"), "New image") : null,
      h("div.lib-selection", { hidden: !picked.size },
        h("b", {}, `${picked.size} selected`),
        h("button.key.is-primary", { type: "button", on: { click: () => (addTakesToCut([...picked]), picked.clear(), renderLibrary(el), go("cut")) } }, icon("scissors"), "Add to Cut"),
        h("button.key.is-quiet", { type: "button", on: { click: () => (picked.clear(), renderLibrary(el)) } }, "Clear"))),
    shown.length
      ? h("div.lib-grid", {}, kind === "takes" ? takes.map(takeCard) : kind === "films" ? films.map(filmCard) : photos.map(imageCard))
      : h("p.lib-empty", {}, query ? `Nothing matches "${query.trim()}".` : kind === "takes" ? "Takes you roll appear here." : kind === "films" ? "Films you cut in Cut or make in Story appear here." : "Images you upload, generate or paint appear here."),
  );
}
