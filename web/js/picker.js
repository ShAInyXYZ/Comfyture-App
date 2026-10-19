// The picture picker every "add a photo" key opens: a photo from your computer (or dropped on it),
// one of our characters, a star added before, or any picture in the Library, made or uploaded,
// so nobody goes looking through their computer for the same picture twice.
import { h, icon, sprite } from "./dom.js";
import { api } from "./api.js";
import { CHARACTERS } from "./characters.js";

/** A picture of ours (a character's front view) as a picture on the server, uploaded once. */
const kept = new Map();
export function onServer(url, name) {
  if (!kept.has(url)) kept.set(url, (async () => api.upload(await (await fetch(url)).blob(), name))().catch((e) => (kept.delete(url), Promise.reject(e))));
  return kept.get(url);
}
/** Any choice from the picker as a picture on the server: { file, url, width, height, name }. */
export async function pictureOf(choice) {
  if (choice.kind === "photo") return choice.photo;
  if (choice.kind === "character") {
    const p = await onServer(choice.character.picture, choice.character.name);
    return { ...p, name: choice.character.name };
  }
  const p = await api.upload(choice.file, choice.file.name);
  return { ...p, name: (choice.file.name ?? "").replace(/\.\w+$/, "").replace(/[-_]+/g, " ").slice(0, 24) || "Photo" };
}

let open = null;
export function closePicker() {
  if (!open) return;
  open.el.remove();
  open.anchor?.setAttribute("aria-expanded", "false");
  document.removeEventListener("pointerdown", open.outside, true);
  document.removeEventListener("keydown", open.escape, true);
  open = null;
}

/**
 * Opens the picker by anchor. onPick(choice) hears each pick: { kind: "file", file },
 * { kind: "character", character } or { kind: "photo", photo }. stars: pictures added before,
 * shown first. multiple: stays open for several picks. characters: whether ours are offered.
 */
export function openPicker(anchor, { title = "Add a photo", onPick, multiple = false, stars = [], characters = true, library = true, accept = "image/*" }) {
  if (open?.anchor === anchor) return closePicker();
  closePicker();
  const picked = new Set();
  const choose = (key, choice, el) => {
    picked.add(key);
    el?.setAttribute("aria-pressed", "true");
    onPick(choice);
    if (!multiple) closePicker();
  };
  const input = h("input", { type: "file", accept, multiple, hidden: true, on: { change: () => { [...input.files].forEach((file) => choose(`file:${file.name}`, { kind: "file", file })); input.value = ""; } } });
  const computer = h("button.pk-computer", { type: "button", on: { click: () => input.click() } },
    sprite("image-upload"), h("span", {}, h("b", {}, "From your computer"), h("em", {}, "or drop a picture here")));

  const groups = [];
  if (characters) {
    for (const [group, label] of [["crew", "Mixer's crew"], ["cast", "The cast"]]) {
      const list = CHARACTERS.filter((c) => c.group === group);
      groups.push(h("section.pk-section", {}, h("span.label", {}, label),
        h("div.pk-faces", {}, ...list.map((c) => h("button.pk-face", { type: "button", title: `${c.name}\n${c.look}`, on: { click: (e) => choose(`char:${c.id}`, { kind: "character", character: c }, e.currentTarget) } },
          h("img", { src: c.face, alt: "", draggable: false }), h("b", {}, c.name))))));
    }
  }
  if (stars.length)
    groups.push(h("section.pk-section", {}, h("span.label", {}, "Your stars"),
      h("div.pk-grid", {}, ...stars.map((s) => h("button.pk-pic", { type: "button", title: s.name ?? "", on: { click: (e) => choose(`photo:${s.file}`, { kind: "photo", photo: s }, e.currentTarget) } },
        h("img", { src: s.url, alt: "", loading: "lazy", draggable: false }))))));

  // the Library, newest first, its names searchable
  let photos = null;
  let query = "";
  const grid = h("div.pk-grid.is-library");
  const drawLibrary = () => {
    const list = (photos ?? []).filter((p) => !query || `${p.name ?? ""} ${p.file}`.toLowerCase().includes(query.toLowerCase()));
    grid.replaceChildren(...(!photos ? [h("p.pk-empty", {}, h("span.lamp", { dataset: { tone: "busy" } }))]
      : list.length ? list.map((p) => h("button.pk-pic", { type: "button", title: p.name ?? p.file, "aria-pressed": String(picked.has(`photo:${p.file}`)), on: { click: (e) => choose(`photo:${p.file}`, { kind: "photo", photo: { file: p.file, url: p.url, width: p.width, height: p.height, name: p.name } }, e.currentTarget) } },
        h("img", { src: p.url, alt: "", loading: "lazy", draggable: false })))
      : [h("p.pk-empty", {}, query ? "Nothing by that name." : "Nothing made or uploaded yet.")]));
  };
  if (library) {
    const search = h("input.field.pk-search", { type: "search", placeholder: "Search", "aria-label": "Search the Library", on: { input: (e) => ((query = e.target.value), drawLibrary()), keydown: (e) => e.stopPropagation() } });
    groups.push(h("section.pk-section", {}, h("div.pk-section-head", {}, h("span.label", {}, "The Library"), search), grid));
    drawLibrary();
    fetch("api/photos").then((r) => r.json()).then((list) => ((photos = Array.isArray(list) ? list : []), drawLibrary())).catch(() => ((photos = []), drawLibrary()));
  }

  const el = h("div.picker", { role: "dialog", "aria-label": title },
    h("div.pk-head", {}, h("b", {}, title),
      multiple ? h("button.key.is-primary.is-sm", { type: "button", on: { click: closePicker } }, "Done") : null,
      h("button.key.is-icon.is-quiet", { type: "button", "aria-label": "Close", on: { click: closePicker } }, icon("close"))),
    computer, ...groups, input);
  // a picture dropped on the picker is taken as if picked from the computer
  el.addEventListener("dragover", (e) => (e.preventDefault(), el.classList.add("is-over")));
  el.addEventListener("dragleave", () => el.classList.remove("is-over"));
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove("is-over");
    [...(e.dataTransfer.files ?? [])].filter((f) => f.type.startsWith("image/")).forEach((file) => choose(`file:${file.name}`, { kind: "file", file }));
  });
  document.body.append(el);
  const outside = (e) => open && !el.contains(e.target) && !anchor.contains(e.target) && closePicker();
  const escape = (e) => e.key === "Escape" && open && (e.stopPropagation(), closePicker());
  open = { el, anchor, outside, escape };
  anchor.setAttribute("aria-expanded", "true");
  // by the key, inside the window: under it when there is room, else above it
  const place = () => {
    const a = anchor.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const x = Math.min(Math.max(8, a.left + a.width / 2 - box.width / 2), innerWidth - box.width - 8);
    const below = innerHeight - a.bottom - 10;
    const y = below >= box.height || below >= a.top ? Math.min(a.bottom + 8, innerHeight - box.height - 8) : Math.max(8, a.top - box.height - 8);
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(Math.max(8, y))}px`;
  };
  place();
  new ResizeObserver(place).observe(el);
  setTimeout(() => {
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
  });
}
