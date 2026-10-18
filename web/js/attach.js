// The attach key opens two frames: pictures, from your computer or the Library, and control maps
// drawn from the Stage's camera. Each composer says what picking one does.
import { h, sprite } from "./dom.js";
import { stageReady } from "./control/link.js";
import { view } from "./viewer.js";

/** The maps a picture can take from the Stage: its id, its @name, what it shows. */
export const MAPS = [
  ["id", "colour-id", "Colour ID — each person in their own colour"],
  ["depth", "depth", "Depth — near is white"],
  ["normal", "normal", "Normal — which way each surface faces"],
  ["pose", "pose", "Pose — the skeletons, as OpenPose draws them"],
  ["lines", "lines", "Lines — the outlines"],
  ["mask", "mask", "Mask — the people, white on black"],
  ["clay", "clay", "Clay — the stage as it looks"],
];
export const MAP_TAG = Object.fromEntries(MAPS.map(([id, tag]) => [id, tag]));
export const MAP_OF_TAG = Object.fromEntries(MAPS.map(([id, tag]) => [tag, id]));

let menu = null;
const close = () => {
  menu?.el.remove();
  menu?.anchor.setAttribute("aria-expanded", "false");
  document.removeEventListener("pointerdown", outside, true);
  document.removeEventListener("keydown", escape, true);
  menu = null;
};
const outside = (e) => menu && !menu.el.contains(e.target) && !menu.anchor.contains(e.target) && close();
const escape = (e) => e.key === "Escape" && menu && (e.stopPropagation(), close());

/**
 * Opens (or closes) the frames over anchor. files(FileList): from the computer. picture(photo):
 * one from the Library. map(id, on): a control map in or out; chosen(id): whether it is in.
 * camera: where the maps are drawn from (the Stage's own camera when not given).
 */
export function attachMenu(anchor, { files, picture, map, chosen = () => false, camera = null, accept = "image/*", taken = () => false }) {
  if (menu?.anchor === anchor) return close();
  close();
  const input = h("input", { type: "file", multiple: true, hidden: true, accept });
  input.addEventListener("change", () => (files([...input.files]), (input.value = ""), close()));
  const tile = (glyph, label, word, run, extra = {}) => h("button.attach-tile", { type: "button", title: label, "aria-label": label, on: { click: run }, ...extra }, glyph, h("span", {}, word));
  // the Library, opened in place, to take several pictures from
  let photos = null;
  let query = "";
  const grid = h("div.attach-lib-grid");
  const drawLibrary = () => {
    const list = (photos ?? []).filter((p) => !query || `${p.name ?? ""} ${p.file}`.toLowerCase().includes(query.toLowerCase()));
    grid.replaceChildren(...(!photos ? [h("p.attach-empty", {}, "…")] : list.length ? list.map((p) =>
      h("button.attach-lib-pic", { type: "button", title: p.name ?? p.file, "aria-pressed": String(taken(p)), on: { click: (e) => (picture(p), e.currentTarget.setAttribute("aria-pressed", "true")) } },
        h("img", { src: p.url, alt: "", loading: "lazy", draggable: false }))) : [h("p.attach-empty", {}, query ? "Nothing by that name." : "The Library is empty.")]));
  };
  const search = h("input.field.attach-search", { type: "search", placeholder: "Search the Library…", "aria-label": "Search the Library", on: { input: (e) => ((query = e.target.value), drawLibrary()), keydown: (e) => e.stopPropagation() } });
  const library = h("div.attach-library", { hidden: true }, search, grid);
  const libKey = tile(sprite("image-library"), "From the Library", "Library", async () => {
    library.hidden = !library.hidden;
    libKey.setAttribute("aria-pressed", String(!library.hidden));
    if (library.hidden) return;
    drawLibrary();
    search.focus();
    try {
      photos = await (await fetch("api/photos")).json();
    } catch {
      photos = [];
    }
    drawLibrary();
  }, { "aria-pressed": "false" });
  // the maps, each drawn small from the camera, in or out with a click
  const mapTiles = h("div.attach-maps", { role: "group", "aria-label": "Control maps" });
  if (map) stageReady.then(({ stage }) => {
    const draw = (channel) => {
      try {
        if (camera) return stage.stillFrom(camera, { width: 160, height: 90, channel });
        return stage.thumbnail({ position: stage.camera.position, target: stage.orbit.target, focal: stage.focal }, { width: 160, height: 90, channel });
      } catch {
        return "";
      }
    };
    mapTiles.replaceChildren(...MAPS.map(([id, tag, about]) => {
      const b = h("button.attach-map", { type: "button", title: `@${tag} — ${about.split(" — ")[1]}`, "aria-label": about.split(" — ")[0], "aria-pressed": String(chosen(id)) },
        h("img", { src: draw(id), alt: "", draggable: false }), h("span", {}, about.split(" — ")[0]));
      b.addEventListener("click", async () => {
        const on = b.getAttribute("aria-pressed") !== "true";
        b.setAttribute("aria-pressed", String(on));
        b.classList.add("is-busy");
        try {
          await map(id, on);
        } catch (e) {
          b.setAttribute("aria-pressed", String(!on));
        } finally {
          b.classList.remove("is-busy");
        }
      });
      b.addEventListener("dblclick", () => view(b.querySelector("img").src));
      return b;
    }));
  });
  const el = h("div.attach-menu", { role: "dialog", "aria-label": "Attach" },
    h("div.attach-frames", {},
      h("section.attach-frame.is-sources", {},
        tile(sprite("image-upload"), "From your computer", "Computer", () => input.click()),
        libKey),
      map ? h("section.attach-frame.is-maps", {}, h("span.attach-label", {}, "Control"), mapTiles) : null),
    library, input);
  document.body.append(el);
  menu = { el, anchor };
  anchor.setAttribute("aria-expanded", "true");
  // above the key, inside the window
  const a = anchor.getBoundingClientRect();
  const place = () => {
    const box = el.getBoundingClientRect();
    const x = Math.min(Math.max(8, a.left), innerWidth - box.width - 8);
    const y = Math.max(8, a.top - box.height - 10);
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
  };
  place();
  new ResizeObserver(place).observe(el);
  setTimeout(() => {
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
  });
}

export const closeAttach = close;
