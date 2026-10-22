// Brioche in Create, the page's side: what she is told of it (summary) and how each of her actions is made (RUN). The actions
// themselves, their fields and their lines in her brief are in space-create.js; a check at load fails when the two differ.
import { toast } from "../store.js";
import { ALL_FORMATS, FORMATS, FAMILIES, PURPOSES, frameOf, newLayer, ownFormats, familyOf, familyFormats, nativeSize } from "../design.js";
import { LAYOUTS, safeRect, presetFor } from "../macaron-layout.js";
import { SCENE_IDS, sceneById } from "../macaron-mockup-scenes.js";
import { openWin } from "../macaron-win.js";
import {
  macaron, designNow, designById, kitNow, layoutNow, patchLayer, edit, applyLayout, adaptFormat, applyKitNow, makeVariant, openDesign, guardOf, makePicture, VARIANT_KINDS, planDesign, addDesign, addMotion,
} from "../macaron.js";

const r = (v, n = 3) => (typeof v === "number" ? Math.round(v * 10 ** n) / 10 ** n : v);
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** What she is told of Create, on top of what every workspace is told of the brand. */
export function summary() {
  const body = macaron.brand.body;
  const d = designNow();
  return {
    brief: body.brief,
    design: d && {
      id: d.id, name: d.name, purpose: d.purpose, status: d.status, day: d.plan?.day, format: d.format, family: familyOf(d.format), openFormat: macaron.format, safe: safeRect(macaron.format), ownFormats: ownFormats(d),
      // the formats of its family: what each is, how big, where its safe zone is
      siblings: familyFormats(d.format).map((f) => ({ id: f, name: FORMATS[f].name, w: nativeSize(f).w, h: nativeSize(f).h, own: ownFormats(d).includes(f), safe: safeRect(f) })), intent: d.intent, variantKind: d.variant?.kind, bg: layoutNow().bg,
      layers: layoutNow().layers.map((l) => ({ id: l.id, type: l.type, role: l.role, name: l.name, x: r(l.x), y: r(l.y), w: r(l.w), h: l.h ? r(l.h) : 0, size: r(l.size), fontRole: l.fontRole, colorRole: l.colorRole, accent: l.accent, align: l.align, hidden: l.hidden, text: l.text, logo: l.logo, shape: l.shape, src: l.src, fit: l.fit })),
      guard: guardOf(d).map((g) => ({ text: g.text, level: g.level })),
    },
    designs: body.designs.map((x) => ({ id: x.id, name: x.name, purpose: x.purpose, format: x.format, family: familyOf(x.format), status: x.status, day: x.plan?.day, variant: x.variant?.kind })),
    mockups: (body.mockups ?? []).slice(0, 6).map(({ scene, design }) => ({ scene, design })),
    motion: body.motion.map(({ id, design, duration, format }) => ({ id, design, duration, format })),
    assets: body.assets.filter((a) => a.url).slice(0, 10).map((a) => ({ id: a.id, name: a.name, kind: a.kind, width: a.width, height: a.height })),
  };
}

const ENUM = { align: ["left", "center", "right"], valign: ["top", "middle", "bottom"], fontRole: ["display", "text", "mono"], fit: ["cover", "contain"], shape: ["round", "rect", "pill", "ellipse", "ring"], role: ["eyebrow", "headline", "sub", "cta", "label", "logo", "hero", "badge", "deco"] };
const RANGE = { x: [-0.5, 1.5], y: [-0.5, 1.5], w: [0.02, 2], h: [0, 2], size: [0.012, 0.4], lineHeight: [0.8, 2], tracking: [-0.1, 0.4], opacity: [0, 1], rot: [-360, 360], radius: [0, 0.5] };

/** A layer by its id, or by its name when she named it so. */
const find = (ref) => {
  const d = designNow();
  const key = String(ref ?? "").toLowerCase();
  return d?.layers.find((l) => l.id === ref) ?? d?.layers.find((l) => l.name?.toLowerCase() === key) ?? null;
};
const palette = () => new Set(kitNow().palette.map((p) => p.id));

/** Her props for a layer, checked: only what a layer has, within range, colours from the palette. */
function clean(props = {}, layer) {
  const out = {};
  const kit = kitNow();
  for (const [k, v] of Object.entries(props)) {
    if (RANGE[k] && typeof v === "number") out[k] = Math.min(RANGE[k][1], Math.max(RANGE[k][0], v));
    else if (ENUM[k] && ENUM[k].includes(v)) out[k] = v;
    else if ((k === "colorRole" || k === "accent") && (palette().has(v) || /^#[0-9a-f]{6}$/i.test(v))) out[k] = v;
    else if (k === "hidden" || k === "caps") out[k] = !!v;
    else if (k === "text" && layer?.type === "text") out[k] = String(v);
    else if (k === "name") out[k] = String(v).slice(0, 40);
    else if (k === "logo" && kit.logos.some((l) => l.id === v)) out[k] = v;
    else if (k === "src" && layer?.type === "image") out[k] = macaron.brand.body.assets.find((a) => a.id === v)?.url ?? (macaron.brand.body.assets.some((a) => a.url === v) ? v : undefined);
  }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

const name = (l) => l?.name ?? "a layer";

/** One action of Create, made: answers what to tell the user (and pushes what takes time onto later), or null when it is not made. */
export const RUN = {
  add_design(a) {
    // a format by its id, else the first of a family, else the one that is open
    const format = ALL_FORMATS.includes(a.format) ? a.format : FAMILIES[a.family]?.formats[0] ?? macaron.format;
    // (the words ride with the design: a headline and a subhead in the brand's voice, so the new one is not left on the starter's filler)
    const texts = { ...(typeof a.headline === "string" && a.headline.trim() ? { headline: a.headline.trim().slice(0, 90) } : {}), ...(typeof a.sub === "string" ? { sub: a.sub.trim().slice(0, 140) } : {}) };
    const made = addDesign({ name: String(a.name || "New design").slice(0, 60), purpose: PURPOSES.includes(a.purpose) ? a.purpose : "Launch", format, layout: LAYOUTS[a.layout] ? a.layout : presetFor(format), texts });
    return `A new ${FORMATS[format].name.toLowerCase()}: ${made.name}`;
  },
  propose_mockup(a) {
    // it only opens the window with the scene and the design chosen: a picture is paid for there, by the person
    if (!SCENE_IDS.includes(a.scene)) return null;
    const id = a.design && designById(a.design) ? a.design : macaron.design;
    macaron.mockup = { ...(macaron.mockup ?? {}), scene: a.scene, ...(id ? { design: id } : {}) };
    openWin("mockup");
    return `A mockup to look at: ${sceneById(a.scene).name}`;
  },
  add_motion(a) {
    const id = a.design && designById(a.design) ? a.design : macaron.design;
    return id && addMotion(id) ? "A motion piece" : null;
  },
  plan_design(a) {
    const id = a.design && designById(a.design) ? a.design : macaron.design;
    if (!id || !DAYS.includes(a.day)) return null;
    planDesign(id, a.day);
    return `Planned for ${a.day}`;
  },
  edit_text(a) {
    const l = find(a.layer);
    if (l?.type !== "text" || typeof a.text !== "string") return null;
    patchLayer(l.id, { text: a.text });
    return `Words: ${name(l)}`;
  },
  set_layer(a) {
    const l = find(a.layer);
    const props = clean(a.props, l);
    if (!l || !Object.keys(props).length) return null;
    patchLayer(l.id, props);
    return `${name(l)}: ${Object.keys(props).join(", ")}`;
  },
  add_layer(a) {
    const d = designNow();
    const type = ["text", "image", "logo", "shape"].includes(a.type) ? a.type : null;
    if (!type) return null;
    const layer = newLayer(type, { colorRole: "white", ...clean(a.props, { type }) });
    if (type === "image" && !layer.src) return null;
    if (type === "text" && !layer.text) layer.text = "Your words";
    if (type === "logo" && !layer.logo) layer.logo = kitNow().logos[0]?.id ?? "";
    d.layers.push(layer);
    macaron.layer = layer.id;
    return `Added ${type}`;
  },
  remove_layer(a) {
    const d = designNow();
    const l = find(a.layer);
    if (!l) return null;
    d.layers = d.layers.filter((x) => x.id !== l.id);
    for (const f of Object.values(d.formats ?? {})) delete f.layers?.[l.id];
    if (macaron.layer === l.id) macaron.layer = null;
    return `Removed ${name(l)}`;
  },
  set_background(a) {
    const d = designNow();
    const patch = {};
    if (a.color && palette().has(a.color)) patch.color = a.color;
    const pic = a.asset ? macaron.brand.body.assets.find((x) => x.id === a.asset) : null;
    if (pic) (patch.src = pic.url, (patch.crop = { x: 0, y: 0, w: 1, h: 1 }));
    if (typeof a.dim === "number") patch.dim = { color: "ink", alpha: a.dim };
    if (!Object.keys(patch).length) return null;
    Object.assign(macaron.format === d.format ? d.bg : ((d.formats[macaron.format] ??= { layers: {} }).bg ??= {}), patch);
    return patch.color ? `Ground: ${kitNow().palette.find((p) => p.id === patch.color)?.name ?? patch.color}` : "Ground picture";
  },
  apply_kit() {
    return applyKitNow().length ? "Kit applied" : "Already on brand";
  },
  suggest_layout(a) {
    if (!LAYOUTS[a.layout]) return null;
    applyLayout(a.layout);
    return `Layout: ${LAYOUTS[a.layout]}`;
  },
  adapt_format(a) {
    const d = designNow();
    if (!ALL_FORMATS.includes(a.format)) return null;
    if (a.format === d.format) return (macaron.format = a.format, `Opened ${a.format}`);
    adaptFormat(a.format);
    return `Laid out for ${FORMATS[a.format].name}`;
  },
  make_variation(a, later) {
    if (!VARIANT_KINDS[a.kind]) return null;
    const copy = makeVariant(a.kind, { name: a.name?.slice(0, 60), note: a.note?.slice(0, 120) });
    // (the nested actions are Create's own: the server keeps to the ones that may be nested)
    for (const x of a.actions ?? []) if (Object.hasOwn(RUN, x?.op)) RUN[x.op](x, later);
    return `Variation: ${copy.name}`;
  },
  generate_background(a, later) {
    if (!a.prompt) return null;
    later.push(() => makeBackground(a));
    return "Making a picture";
  },
  set_status(a) {
    const d = designNow();
    if (!["draft", "review", "approved", "scheduled"].includes(a.status)) return null;
    d.status = a.status;
    return `Status: ${a.status}`;
  },
  rename(a) {
    const d = designNow();
    if (!a.name) return null;
    d.name = a.name.slice(0, 60);
    return "Renamed";
  },
  select_design(a) {
    if (!macaron.brand.body.designs.some((x) => x.id === a.design)) return null;
    openDesign(a.design);
    return "Opened it";
  },
};

/** A new picture for the design, behind it or as a layer, from the image model she chose. */
async function makeBackground(a) {
  const brand = macaron.brand;
  const d = designNow();
  const format = macaron.format;
  const flux = a.model === "flux";
  const asset = await makePicture({
    prompt: `${a.prompt} No text, no letters, no logo, no watermark.`,
    model: flux ? "flux-3-image" : "gpt-image-2.5-flare",
    aspect: format,
    name: a.prompt.slice(0, 50),
    refs: [],
  });
  // another brand may be open by now: the picture stays in the library of the brand it was made for
  if (macaron.brand !== brand) return;
  edit(() => {
    if (a.use === "image") {
      const f = frameOf(format);
      const l = newLayer("image", { name: asset.name, src: asset.url, x: 0.1, y: 0.3, w: 0.8, h: (0.8 * f.w * (asset.height / asset.width)) / f.h, fit: "cover", crop: { x: 0, y: 0, w: 1, h: 1 } });
      d.layers.push(l);
      macaron.layer = l.id;
    } else {
      Object.assign(macaron.format === d.format ? d.bg : ((d.formats[format] ??= { layers: {} }).bg ??= {}), { src: asset.url, crop: { x: 0, y: 0, w: 1, h: 1 }, dim: { color: "ink", alpha: 0.45 } });
    }
  }, "A new picture");
  toast("The new picture is in.");
}
