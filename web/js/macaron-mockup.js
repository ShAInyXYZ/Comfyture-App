// The mockup window: a design placed in a real-world scene (a poster on a wall, a jar's label, a phone in a hand). On the left
// the twelve scenes, grouped, as photographs; the one picked big in the middle with the design beside it; on the right the
// design, the light, the angle and how many pictures. Nothing is paid for until the key is pressed twice: the first press says
// what it will cost, the second asks the picture model (GPT Image 2.5 Flare, with the scene and the design as references).
// A picture that comes back is kept as an asset of kind "mockup" and shows in Create's Mockups bento.
import { h, icon } from "./dom.js";
import { toast, changed } from "./store.js";
import { frameOf, FORMATS, loadImage } from "./design.js";
import { macaron, designById, thumb, renderPng, makePicture, edit, setAsset, uid } from "./macaron.js";
import { fill, arming, isArmed, armedNow } from "./macaron-ui.js";
import { placeOn } from "./macaron-mockup-warp.js";
import { defineWindow } from "./macaron-win.js";
import { view } from "./viewer.js";
import { SCENES, SCENE_GROUPS, LIGHTS, ANGLES, sceneById, scenePhoto, mockupPrompt } from "./macaron-mockup-scenes.js";

const MODEL = "gpt-image-2.5-flare";
/** What a picture costs, in credits, on Comfy Router at this quality (the Make a picture window says the same). */
const PER_PICTURE = [3, 8];
export const costOf = (n) => (n === 1 ? `≈ ${PER_PICTURE[0]} to ${PER_PICTURE[1]} cr` : `≈ ${PER_PICTURE[0] * n} to ${PER_PICTURE[1] * n} cr`);

const bases = (b) => b.body.designs.filter((d) => !d.variant && !d.motion);

// ---- the preview: the design on the scene's blank surface, in its perspective (nothing is paid for: it is drawn here)
const W = 960;
const H = 720;
const bitmaps = new Map();
/** The design as a bitmap to place, kept while it is not changed. */
async function designBitmap(d) {
  const key = `${macaron.brand?.id}|${d.id}|${d.updatedAt}|${d.format}|${d.layers.length}`;
  if (!bitmaps.has(key)) {
    if (bitmaps.size > 12) bitmaps.clear();
    const f = frameOf(d.format);
    bitmaps.set(key, renderPng(d, d.format, { scale: Math.min(1, 900 / Math.max(f.w, f.h)) }).then((blob) => createImageBitmap(blob)));
  }
  return bitmaps.get(key);
}
/** A canvas with the scene's photograph and, on its blank surface, the design (when the scene's surface is known). */
function preview(scene, d) {
  const canvas = h("canvas.mc-mcanvas", { width: W, height: H });
  (async () => {
    const photo = await loadImage(scenePhoto(scene.id));
    const ctx = canvas.getContext("2d");
    ctx.drawImage(photo, 0, 0, W, H);
    if (!d || !scene.quad) return;
    const bmp = await designBitmap(d);
    placeOn(ctx, bmp, scene.quad.map(([x, y]) => [x * W, y * H]), { panel: scene.panel, round: scene.round ?? 0, fill: !!scene.fill });
  })().catch(() => {});
  return canvas;
}
/** The mockup being set up, with what it has not been told filled in: the first scene, the open design, daylight, three-quarters, one picture. */
export function setup() {
  const b = macaron.brand;
  const m = (macaron.mockup ??= {});
  const designs = bases(b);
  if (!sceneById(m.scene)) m.scene = SCENES[0].id;
  if (!designs.some((d) => d.id === m.design)) m.design = (designs.find((d) => d.id === macaron.design) ?? designs.find((d) => d.status === "approved") ?? designs[0])?.id ?? null;
  m.light ??= "day";
  m.angle ??= "three";
  m.count = Math.min(4, Math.max(1, m.count ?? 1));
  return m;
}
const set = (patch) => {
  Object.assign((macaron.mockup ??= {}), patch);
  changed("macaron");
};
export const mockupBusy = () => macaron.busy.has("mockup");

/** The design drawn out as a picture to give the model, kept on the server (it is not recorded as an export of the brand). */
async function designPicture(d) {
  const f = frameOf(d.format);
  const blob = await renderPng(d, d.format, { scale: Math.min(1, 1600 / Math.max(f.w, f.h)) });
  const res = await fetch(`api/macaron/exports?name=${encodeURIComponent(`${macaron.brand.name} ${d.name} for a mockup`)}`, { method: "POST", headers: { "Content-Type": "image/png" }, body: blob });
  const kept = await res.json();
  if (!res.ok) throw new Error(kept.error ?? "The design could not be kept for the picture model.");
  return kept;
}

/** Places the design in the scene: as many pictures as asked, one after the other, each an asset of kind "mockup". */
export async function placeMockup() {
  const b = macaron.brand;
  const m = setup();
  const scene = sceneById(m.scene);
  const d = designById(m.design);
  if (!b || !scene || !d || mockupBusy()) return [];
  macaron.busy.add("mockup");
  changed("macaron");
  const made = [];
  try {
    const kept = await designPicture(d);
    const refs = [{ url: scenePhoto(scene.id), name: "scene" }, { url: kept.url, name: "design" }];
    for (let i = 0; i < m.count; i++) {
      const asset = await makePicture({ prompt: mockupPrompt(scene, m), model: MODEL, aspect: scene.aspect, refs, quality: "medium", name: `${scene.name} · ${d.name}` });
      // another brand may be open by now: the picture stays in the library of the brand it was made for
      setAsset(asset.id, { kind: "mockup" });
      if (macaron.brand === b) edit(() => b.body.mockups.unshift({ id: uid("k"), scene: scene.id, design: d.id, asset: asset.id, light: m.light, angle: m.angle, at: new Date().toISOString() }), "A mockup");
      made.push(asset);
    }
    toast(made.length === 1 ? "The mockup is in." : `${made.length} mockups are in.`);
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    macaron.busy.delete("mockup");
    changed("macaron");
  }
  return made;
}

function mockupWin() {
  const el = h("div.mc-w.is-mockup");
  const go = h("button.mc-primary", { type: "button", on: { click: () => (!mockupBusy() && arming("mockup", () => changed("macaron"), () => placeMockup())) } });
  const goLabel = h("span");
  go.append(icon("plus"), goLabel);
  const cost = h("span.mc-cost");
  const note = h("span.mc-mnote");
  const foot = [cost, note, h("span.spacer"), go];

  const chips = (list, value, key) => h("div.mc-fchips", { role: "group" }, ...list.map(([id, label]) => h("button.mc-fchip", { type: "button", "aria-pressed": String(value === id), on: { click: () => set({ [key]: id }) } }, label)));

  function update() {
    const b = macaron.brand;
    if (!b) return;
    const m = setup();
    const scene = sceneById(m.scene);
    const designs = bases(b);
    const d = designById(m.design);
    const busy = mockupBusy();
    const armed = isArmed("mockup");
    goLabel.textContent = busy ? "Placing it" : armed ? `Yes, place it · ${costOf(m.count)}` : "Place my design";
    go.disabled = busy || !d;
    go.classList.toggle("is-armed", armed && !busy);
    cost.textContent = busy ? "Asking the picture model…" : armed ? "Press again to start: this spends credits" : `${costOf(m.count)} · ${m.count} ${m.count === 1 ? "picture" : "pictures"}`;
    note.textContent = d ? "" : "Make a design first";
    const made = (b.body.mockups ?? []).map((k) => ({ k, asset: b.body.assets.find((a) => a.id === k.asset) })).filter((x) => x.asset?.url).slice(0, 8);

    const gallery = h("div.mc-scenes", {}, ...SCENE_GROUPS.map(([g, name]) => h("section.mc-scene-group", { dataset: { group: g } },
      h("span.label", {}, name),
      h("div.mc-scgrid", {}, ...SCENES.filter((s) => s.group === g).map((s) => h("button.mc-scn", { type: "button", "aria-pressed": String(m.scene === s.id), dataset: { scene: s.id }, title: s.name, on: { click: () => set({ scene: s.id }) } },
        h("img", { src: scenePhoto(s.id), alt: "", draggable: false, loading: "lazy" }), h("span.mc-scn-name", {}, s.name), m.scene === s.id ? h("i.mc-scn-tick", {}, icon("check")) : null))))));

    const stage = h("div.mc-mstage", {},
      h("figure.mc-mpreview", {}, preview(scene, d),
        d ? h("figcaption.mc-mdesign", { title: `${d.name} goes on ${scene.on}` }, h("span.mc-mdesign-pic", {}, thumb(d, { width: 220 })), h("span", {}, h("b", {}, d.name), h("em", {}, `${FORMATS[d.format].name} → ${scene.name}`))) : null),
      made.length ? h("div.mc-mmade", {}, h("span.label", {}, "Made"), h("div.mc-mmade-row", {}, ...made.map(({ k, asset }) => h("button.mc-mmade-pic", { type: "button", title: `${sceneById(k.scene)?.name ?? "Mockup"}\nSee it`, on: { click: () => view(asset.url) } }, h("img", { src: asset.url, alt: "", draggable: false, loading: "lazy" }))))) : null);

    const side = h("aside.mc-mside", {},
      h("section.mc-sec", {}, h("span.label", {}, "The design"),
        designs.length ? h("div.mc-mdesigns", {}, ...designs.map((x) => h("button.mc-mdz", { type: "button", "aria-pressed": String(x.id === m.design), title: x.name, on: { click: () => set({ design: x.id }) } }, thumb(x, { width: 140 })))) : h("p.mc-hint", {}, "No design yet: make one in the editor.")),
      h("section.mc-sec", {}, h("span.label", {}, "Light"), chips(LIGHTS.map(([id, label]) => [id, label]), m.light, "light")),
      h("section.mc-sec", {}, h("span.label", {}, "Angle"), chips(ANGLES.map(([id, label]) => [id, label]), m.angle, "angle")),
      h("section.mc-sec", {}, h("span.label", {}, "Pictures"),
        h("div.mc-stepper", {}, h("button.mc-iconkey", { type: "button", title: "One fewer", "aria-label": "One fewer", disabled: m.count <= 1, on: { click: () => set({ count: m.count - 1 }) } }, "−"), h("b", {}, String(m.count)), h("button.mc-iconkey", { type: "button", title: "One more", "aria-label": "One more", disabled: m.count >= 4, on: { click: () => set({ count: m.count + 1 }) } }, "+"))));

    fill(el, gallery, stage, side);
  }
  const sig = () => JSON.stringify([macaron.mockup, macaron.brand?.body.mockups, macaron.brand?.body.designs?.map((d) => [d.id, d.name, d.updatedAt]), mockupBusy(), armedNow()]);
  return { el, update, sig, foot };
}
defineWindow("mockup", { eyebrow: "Create", title: "New mockup", sub: () => macaron.brand?.name ?? "", size: "xl", advanced: false, make: mockupWin, foot: (part) => part.foot });
