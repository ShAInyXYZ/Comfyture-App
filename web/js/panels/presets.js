import { h, icon } from "../dom.js";
import { state, loadPreset, setGroup, savePreset } from "../store.js";

const GROUPS = { camera: "Camera", vfx: "VFX", transform: "Transform" };
let query = "";

/** A still that plays the preset's preview while pointed at. */
function thumbOf(preset) {
  const thumb = h("span.ptile-thumb", {});
  if (preset.poster) thumb.append(h("img", { src: preset.poster, alt: "", draggable: false, loading: "lazy" }));
  if (preset.preview) {
    // the preview plays only while pointed at, so the grid stays calm
    thumb.addEventListener("pointerenter", () => {
      if (!thumb.querySelector("video")) thumb.replaceChildren(h("video", { src: preset.preview, muted: true, loop: true, playsInline: true, autoplay: true, draggable: false }));
    });
    thumb.addEventListener("pointerleave", () => preset.poster && thumb.replaceChildren(h("img", { src: preset.poster, alt: "", draggable: false })));
  }
  return thumb;
}

function tile(preset) {
  const thumb = thumbOf(preset);
  return h("button.ptile", {
    type: "button",
    "aria-pressed": String(state.draft.preset === preset.id),
    title: preset.blurb,
    on: { click: () => loadPreset(preset.id) },
  }, thumb, h("span.ptile-name", {}, preset.name), h("span.ptile-blurb", {}, preset.blurb));
}

function matches() {
  const q = query.trim().toLowerCase();
  if (!q) return state.presets.filter((p) => p.category === state.group);
  return state.presets.filter((p) => `${p.name} ${p.blurb} ${p.category}`.toLowerCase().includes(q));
}

function grid() {
  const list = matches();
  return list.length
    ? h("div.preset-grid", { dataset: { scrollKey: query ? "search" : state.group } }, list.map(tile))
    : h("p.hint.preset-grid", {}, `Nothing called "${query.trim()}".`);
}

function saveDialog() {
  const d = state.draft;
  const dialog = h("dialog.dialog", {});
  const name = h("input.field", { required: true, maxLength: 60, placeholder: "Name", value: d.preset ? `${d.name} (mine)` : d.name });
  const blurb = h("input.field", { maxLength: 80, placeholder: "One line about it" });
  const group = h("select.field", {}, Object.entries(GROUPS).map(([v, l]) => h("option", { value: v, selected: v === state.group }, l)));
  dialog.append(h("form", { method: "dialog", on: { submit: async (e) => {
    e.preventDefault();
    if (await savePreset({ name: name.value.trim(), blurb: blurb.value.trim(), category: group.value })) dialog.close();
  } } },
    h("h2", {}, "Save as preset"),
    h("span.hint", {}, "Saves this script, its paint instruction and its length as a preset file in presets/."),
    name, blurb, group,
    h("div.row", {},
      h("button.key", { type: "button", on: { click: () => dialog.close() } }, "Cancel"),
      h("button.key", { type: "submit", "aria-pressed": "true" }, "Save preset"),
    ),
  ));
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  name.select();
}

export function renderPresets(el) {
  const count = state.presets.filter((p) => p.category === state.group).length;
  const search = h("input.field.preset-search", {
    type: "search",
    placeholder: "Search all presets",
    value: query,
    "aria-label": "Search presets",
    on: { input: (e) => {
      query = e.target.value;
      el.querySelector(".preset-grid").replaceWith(grid());
      el.querySelector(".segment").classList.toggle("is-muted", !!query.trim());
    } },
  });
  el.replaceChildren(
    h("div.card-head", {},
      h("span.card-label", { role: "heading", "aria-level": "2" }, "Presets"),
      h("span.card-hint", {}, `${count} ${GROUPS[state.group].toLowerCase()} moves`),
      h("span.card-tools", {},
        h("button.key.is-sm", { type: "button", title: "Save this script as your own preset", on: { click: saveDialog } }, icon("plus"), "Save")),
    ),
    h("div.segment", { role: "group", "aria-label": "Preset group", className: `segment${query.trim() ? " is-muted" : ""}` },
      Object.entries(GROUPS).map(([v, l]) =>
        h("button", { type: "button", "aria-pressed": String(v === state.group), on: { click: () => {
          query = "";
          setGroup(v);
        } } }, l))),
    h("label.search-box", {}, icon("search"), search),
    grid(),
  );
}
