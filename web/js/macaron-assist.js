// Brioche, the baby bunny who runs Macaron. She works in the workspace that is open, and is told only what is
// in it: in Design idea the brief, the directions and the story; in Brand kit the palette, the logos, the type,
// the voice and the rules; in Content the design open, the others, the week and the motion. She answers with
// actions of that workspace, made here as one step back; what takes time (a new picture) follows once they are done.
import { changed, toast, writer } from "./store.js";
import { FORMAT_KEYS, FORMATS, PURPOSES, frameOf, newLayer, ownFormats, contrast } from "./design.js";
import { LAYOUTS } from "./macaron-layout.js";
import {
  macaron, designNow, designById, kitNow, layoutNow, patchLayer, postJson, batch, undo, edit, applyLayout, adaptFormat, applyKitNow, makeVariant, openDesign, guardOf, makePicture, VARIANT_KINDS,
  setBrief, addDirection, pickDirection, addNote, setColour, addColour, setColourField, setKit, setWords, setType, addRule, setRule, planDesign, addDesign, addMotion, setSpace, uid,
} from "./macaron.js";

const r = (v, n = 3) => (typeof v === "number" ? Math.round(v * 10 ** n) / 10 ** n : v);

/** What she is told: the workspace open and what is in it, nothing of the others. */
export function summary(space = macaron.space) {
  const b = macaron.brand;
  const body = b.body;
  const kit = kitNow();
  const base = {
    name: b.name,
    space,
    kit: { about: body.kit.about, tagline: kit.tagline, palette: kit.palette.map(({ id, name, hex, role, share }) => ({ id, name, hex, role, share })), type: kit.type, logos: kit.logos.map(({ id, kind, tone, ground }) => ({ id, kind, tone, ground })), voice: kit.voice },
  };
  if (space === "idea") {
    return { ...base, brief: body.brief, directions: (body.directions ?? []).map(({ id, name, note, picked }) => ({ id, name, note, picked })), refs: body.refs.map(({ id, title, kind, note }) => ({ id, title, kind, note })), story: body.history.filter((x) => x.kind !== "export").map(({ title, kind, note }) => ({ title, kind, note })) };
  }
  if (space === "kit") {
    const pairs = kit.palette.flatMap((a, i) => kit.palette.slice(i + 1).map((c) => ({ a: a.id, b: c.id, ratio: Math.round(contrast(a.hex, c.hex) * 10) / 10 }))).filter((x) => x.ratio < 4.5);
    return { ...base, rules: body.kit.rules.map(({ id, kind, text }) => ({ id, kind, text })), colourways: (body.kit.colourways ?? []).map(({ name, ground, logo }) => ({ name, ground, logo })), lowContrast: pairs, products: body.products.map(({ name, features }) => ({ name, features })) };
  }
  const d = designNow();
  return {
    ...base,
    brief: body.brief,
    design: d && {
      id: d.id, name: d.name, purpose: d.purpose, status: d.status, day: d.plan?.day, format: d.format, openFormat: macaron.format, ownFormats: ownFormats(d), intent: d.intent, variantKind: d.variant?.kind, bg: layoutNow().bg,
      layers: layoutNow().layers.map((l) => ({ id: l.id, type: l.type, role: l.role, name: l.name, x: r(l.x), y: r(l.y), w: r(l.w), h: l.h ? r(l.h) : 0, size: r(l.size), fontRole: l.fontRole, colorRole: l.colorRole, accent: l.accent, align: l.align, hidden: l.hidden, text: l.text, logo: l.logo, shape: l.shape, src: l.src, fit: l.fit })),
      guard: guardOf(d).map((g) => ({ text: g.text, level: g.level })),
    },
    designs: body.designs.map((x) => ({ id: x.id, name: x.name, purpose: x.purpose, format: x.format, status: x.status, day: x.plan?.day, variant: x.variant?.kind })),
    motion: body.motion.map(({ id, design, duration, format }) => ({ id, design, duration, format })),
    assets: body.assets.filter((a) => a.url).slice(0, 40).map((a) => ({ id: a.id, name: a.name, kind: a.kind, width: a.width, height: a.height })),
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

const IDEA_OPS = ["write_brief", "add_direction", "pick_direction", "add_note"];
const KIT_OPS = ["set_colour", "add_colour", "add_colourway", "set_voice", "add_rule", "set_type"];
const BRIEF_KEYS = ["pitch", "goal", "audience", "message", "tone", "deliverables", "constraints", "channels"];
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
/** Whether an action belongs to the workspace that is open (the server keeps to this too; the page does not trust it). */
const allowed = (op) => op === "open_space" || (macaron.space === "idea" ? IDEA_OPS : macaron.space === "kit" ? KIT_OPS : null)?.includes(op) || (macaron.space === "content" && !IDEA_OPS.includes(op) && !KIT_OPS.includes(op));

/** One action, made. Answers what to tell the user; pushes what takes time onto later. */
function run(a, later) {
  if (!allowed(a.op)) return null;
  const d = designNow();
  const name = (l) => l?.name ?? "a layer";
  switch (a.op) {
    case "open_space":
      if (!["idea", "kit", "content"].includes(a.space)) return null;
      setSpace(a.space);
      return `Opened ${{ idea: "Design idea", kit: "Brand kit", content: "Content" }[a.space]}`;
    case "write_brief": {
      const patch = {};
      for (const [k, v] of Object.entries(a.fields ?? {})) if (BRIEF_KEYS.includes(k) && typeof v === "string" && v.trim()) patch[k] = v.trim();
      const goals = (Array.isArray(a.goals) ? a.goals : []).map((g) => String(g).trim().slice(0, 32)).filter(Boolean).slice(0, 3);
      if (goals.length) patch.goals = goals;
      if (!Object.keys(patch).length) return null;
      setBrief(patch);
      return `Brief: ${Object.keys(patch).join(", ")}`;
    }
    case "add_direction": {
      if (!a.name) return null;
      const logo = kitNow().logos.some((l) => l.id === a.logo) ? a.logo : undefined;
      addDirection({ name: a.name, note: a.note ?? "", logo });
      return `Direction: ${a.name}`;
    }
    case "pick_direction":
      if (!(macaron.brand.body.directions ?? []).some((x) => x.id === a.id)) return null;
      pickDirection(a.id);
      return "Direction picked";
    case "add_note":
      if (!a.title) return null;
      addNote(String(a.title).slice(0, 140), String(a.note ?? "").slice(0, 200));
      return "A note in the story";
    case "set_colour": {
      const i = kitNow().palette.findIndex((p) => p.id === a.id);
      if (i < 0) return null;
      const did = [];
      if (a.hex) (setColour(i, a.hex), did.push("colour"));
      const patch = {};
      if (a.name) patch.name = String(a.name).slice(0, 24);
      if (a.role) patch.role = String(a.role).slice(0, 30);
      if (Object.keys(patch).length) (setColourField(i, patch), did.push(Object.keys(patch).join(" and ")));
      return did.length ? `${macaron.brand.body.kit.palette[i].name}: ${did.join(", ")}` : null;
    }
    case "add_colour": {
      if (!/^#[0-9a-f]{6}$/i.test(a.hex ?? "") || kitNow().palette.length >= 8) return null;
      addColour();
      const i = macaron.brand.body.kit.palette.length - 1;
      setColour(i, a.hex);
      setColourField(i, { name: String(a.name ?? "New colour").slice(0, 24), role: String(a.role ?? "").slice(0, 30) });
      return `Colour: ${a.name ?? a.hex}`;
    }
    case "add_colourway": {
      const kit = kitNow();
      const g = kit.palette.find((p) => p.id === a.ground);
      const l = kit.logos.find((x) => x.id === a.logo);
      if (!g || !l) return null;
      setKit("colourways", [...(macaron.brand.body.kit.colourways ?? []), { id: uid("cw"), name: String(a.name || `${l.name} on ${g.name}`).slice(0, 40), ground: g.id, logo: l.id }]);
      return `Colourway: ${a.name || l.name}`;
    }
    case "set_voice": {
      const v = macaron.brand.body.kit.voice;
      let did = false;
      if (typeof a.summary === "string" && a.summary.trim()) (setKit("voice.summary", a.summary.trim().slice(0, 300)), (did = true));
      if (Array.isArray(a.words) && a.words.length) (setWords("voice", a.words.map(String).slice(0, 6)), (did = true));
      if (Array.isArray(a.dos) && a.dos.length) (setKit("voice.dos", a.dos.map(String).slice(0, 8)), (macaron.brand.body.dos = String(a.dos[0])), (did = true));
      if (Array.isArray(a.donts) && a.donts.length) (setKit("voice.donts", a.donts.map(String).slice(0, 8)), (macaron.brand.body.donts = String(a.donts[0])), (did = true));
      return did && v ? "Voice" : null;
    }
    case "add_rule": {
      if (!a.text || !["do", "dont"].includes(a.kind)) return null;
      addRule(a.kind);
      const rules = macaron.brand.body.kit.rules;
      setRule(rules.at(-1).id, { text: String(a.text).slice(0, 200) });
      return a.kind === "do" ? "A rule to keep" : "A rule never to break";
    }
    case "set_type": {
      if (!["display", "text", "mono"].includes(a.type)) return null;
      const patch = {};
      if (a.family) patch.family = String(a.family).slice(0, 40);
      if (typeof a.weight === "number") patch.weight = a.weight;
      if (!Object.keys(patch).length) return null;
      setType(a.type, patch);
      return `Type: ${a.type}`;
    }
    case "add_design": {
      const made = addDesign({ name: String(a.name || "New post").slice(0, 60), purpose: PURPOSES.includes(a.purpose) ? a.purpose : "Launch", format: FORMAT_KEYS.includes(a.format) ? a.format : macaron.format, layout: LAYOUTS[a.layout] ? a.layout : "left" });
      return `A new post: ${made.name}`;
    }
    case "add_motion": {
      const id = a.design && designById(a.design) ? a.design : macaron.design;
      return id && addMotion(id) ? "A motion piece" : null;
    }
    case "plan_design": {
      const id = a.design && designById(a.design) ? a.design : macaron.design;
      if (!id || !DAYS.includes(a.day)) return null;
      planDesign(id, a.day);
      return `Planned for ${a.day}`;
    }
    case "edit_text": {
      const l = find(a.layer);
      if (l?.type !== "text" || typeof a.text !== "string") return null;
      patchLayer(l.id, { text: a.text });
      return `Words: ${name(l)}`;
    }
    case "set_layer": {
      const l = find(a.layer);
      const props = clean(a.props, l);
      if (!l || !Object.keys(props).length) return null;
      patchLayer(l.id, props);
      return `${name(l)}: ${Object.keys(props).join(", ")}`;
    }
    case "add_layer": {
      const type = ["text", "image", "logo", "shape"].includes(a.type) ? a.type : null;
      if (!type) return null;
      const layer = newLayer(type, { colorRole: "white", ...clean(a.props, { type }) });
      if (type === "image" && !layer.src) return null;
      if (type === "text" && !layer.text) layer.text = "Your words";
      if (type === "logo" && !layer.logo) layer.logo = kitNow().logos[0]?.id ?? "";
      d.layers.push(layer);
      macaron.layer = layer.id;
      return `Added ${type}`;
    }
    case "remove_layer": {
      const l = find(a.layer);
      if (!l) return null;
      d.layers = d.layers.filter((x) => x.id !== l.id);
      for (const f of Object.values(d.formats ?? {})) delete f.layers?.[l.id];
      if (macaron.layer === l.id) macaron.layer = null;
      return `Removed ${name(l)}`;
    }
    case "set_background": {
      const patch = {};
      if (a.color && palette().has(a.color)) patch.color = a.color;
      const pic = a.asset ? macaron.brand.body.assets.find((x) => x.id === a.asset) : null;
      if (pic) (patch.src = pic.url, (patch.crop = { x: 0, y: 0, w: 1, h: 1 }));
      if (typeof a.dim === "number") patch.dim = { color: "ink", alpha: a.dim };
      if (!Object.keys(patch).length) return null;
      Object.assign(macaron.format === d.format ? d.bg : ((d.formats[macaron.format] ??= { layers: {} }).bg ??= {}), patch);
      return patch.color ? `Ground: ${kitNow().palette.find((p) => p.id === patch.color)?.name ?? patch.color}` : "Ground picture";
    }
    case "apply_kit":
      return applyKitNow().length ? "Kit applied" : "Already on brand";
    case "suggest_layout":
      if (!LAYOUTS[a.layout]) return null;
      applyLayout(a.layout);
      return `Layout: ${LAYOUTS[a.layout]}`;
    case "adapt_format":
      if (!FORMAT_KEYS.includes(a.format)) return null;
      if (a.format === d.format) return (macaron.format = a.format, `Opened ${a.format}`);
      adaptFormat(a.format);
      return `Laid out for ${FORMATS[a.format].name}`;
    case "make_variation": {
      if (!VARIANT_KINDS[a.kind]) return null;
      const copy = makeVariant(a.kind, { name: a.name?.slice(0, 60), note: a.note?.slice(0, 120) });
      for (const x of a.actions ?? []) run(x, later);
      return `Variation: ${copy.name}`;
    }
    case "generate_background":
      if (!a.prompt) return null;
      later.push(() => makeBackground(a));
      return "Making a picture";
    case "set_status":
      if (!["draft", "review", "approved", "scheduled"].includes(a.status)) return null;
      d.status = a.status;
      return `Status: ${a.status}`;
    case "rename":
      if (!a.name) return null;
      d.name = a.name.slice(0, 60);
      return "Renamed";
    case "select_design":
      if (!macaron.brand.body.designs.some((x) => x.id === a.design)) return null;
      openDesign(a.design);
      return "Opened it";
    default:
      return null;
  }
}

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

// the tool a key of her panel asked through: its id rides with the words it sent, once (the bar sends them as typed)
let armed = null;
export function armPreset(id, text) {
  armed = { id, text: text.trim() };
  setTimeout(() => armed?.text === text.trim() && (armed = null), 2000);
}

/** The bar's words, in Macaron: Brioche reads the project and makes the changes. */
export async function askMacaron(text, { preset } = {}) {
  const words = text.trim();
  const chat = macaron.chat;
  const brand = macaron.brand;
  if (armed && armed.text === words) preset ??= armed.id;
  armed = null;
  if (!words || chat.busy || !brand) return;
  chat.messages.push({ role: "user", text: words });
  chat.busy = "Thinking";
  changed("assistant");
  try {
    const space = macaron.space;
    const out = await postJson("api/macaron/assist", "POST", { model: writer(), messages: chat.messages.slice(-8), brand: summary(space), space, ...(preset ? { preset } : {}) });
    // her answer is for the brand it was asked in: if another is open now, it is not made there
    if (macaron.brand !== brand) return;
    const later = [];
    const did = [];
    await batch(() => {
      for (const a of out.actions ?? []) {
        const said = run(a, later);
        if (said) did.push(said);
      }
    }, "Brioche");
    chat.messages.push({ role: "assistant", text: out.reply || (did.length ? "Done." : "Nothing to change."), did, undo: did.length > 0, macaron: true });
    chat.busy = later.length ? "Making a picture" : null;
    changed("assistant", "macaron");
    for (const job of later) {
      try {
        await job();
      } catch (e) {
        chat.messages.push({ role: "assistant", text: e.message, error: true, macaron: true });
      }
    }
  } catch (e) {
    chat.messages.push({ role: "assistant", text: e.message, error: true, macaron: true });
  } finally {
    chat.busy = null;
    changed("assistant", "macaron");
  }
}

/** Takes back what a message of hers did: the one step it was. */
export function undoMacaron(message) {
  undo();
  message.did = ["Undone"];
  message.undo = false;
  changed("assistant", "macaron");
}
export function clearMacaronChat() {
  macaron.chat.messages = [];
  changed("assistant");
}
