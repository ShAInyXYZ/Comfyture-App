// Macaron: content for a brand. A brand holds its kit (logos, palette, type, voice, rules), what it has
// collected and decided (a brief, references, a history), its pictures, and its designs: layers on a
// ground with a layout for each format, saved in alternatives, shown as motion, exported as pictures
// and video. A template can also shoot a product into pictures (and a take from each). Everything is
// kept with the brand on the server, one JSON body; older brands open as they were.
import { state, changed, onChange, toast, waitFor, artistFor, presetById } from "./store.js";
import { api } from "./api.js";
import { TEMPLATES, templateById } from "./macaron-templates.js";
import { FORMATS, FORMAT_KEYS, kitOf, prepare, renderDesign, measurer, drawDesign, uid, clamp, newLayer, frameOf, layoutOf, ownFormats, colorOf, contrast, logoColour, lacksLid } from "./design.js";
import { reflow, withPreset, applyKit, cloneDesign, guard, LAYOUTS, safeRect, firstTiming, soundPops, patchLayerIn } from "./macaron-layout.js";

const OPEN = "comfyture.macaron.open";
export const macaron = {
  list: [], brand: null, ready: null, busy: new Set(),
  // the shoot's
  template: TEMPLATES[0].id, media: "all", category: "all",
  // the studio's: the design open, the format it is open in, the layer picked
  design: null, format: "4:5", layer: null, safe: false,
  // the content list's filters, the timeline's open entry, the motion piece open, what is being made
  filter: { purpose: "all", format: "all", status: "all", group: "none" }, entry: null, motion: null, progress: null,
  // Brioche's conversation, and the steps back and forward
  chat: { messages: [], busy: null }, past: [], future: [], mark: null,
};
const update = () => changed("macaron");

const call = async (path, init) => {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
};
const send = (path, method, body) => call(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
export { uid, send as postJson };

const BRIEF = { goal: "", audience: "", message: "", tone: "", deliverables: "", constraints: "", channels: "" };
const blank = () => ({ logo: null, colours: [], fonts: [], voice: [], dos: "", donts: "", headline: "", tagline: "", products: [], product: null, outputs: [], shoot: { formats: {}, count: 2 } });

/** A brand's body with everything the workspace needs, whatever it was saved with: older brands gain empty parts, nothing is changed. */
function normalize(saved = {}) {
  const body = { ...blank(), ...saved };
  body.kit = { ...(saved.kit ?? {}) };
  body.kit.palette = body.kit.palette?.length ? body.kit.palette : body.colours.map((hex, i) => ({ id: `c${i + 1}`, name: `Colour ${i + 1}`, hex, role: "", note: "" }));
  body.kit.logos = body.kit.logos?.length ? body.kit.logos : body.logo?.url ? [{ id: "logo", name: "Logo", kind: "wordmark", tone: "", url: body.logo.url, ground: "", note: "" }] : [];
  body.kit.type = kitOf(body).type;
  body.kit.voice = { summary: "", words: body.voice, dos: [], donts: [], lines: [], ...(body.kit.voice ?? {}) };
  body.kit.rules ??= [];
  for (const k of ["designs", "motion", "exports", "refs", "history", "assets"]) body[k] ??= [];
  body.brief = { ...BRIEF, ...(saved.brief ?? {}) };
  return body;
}

// ---------------------------------------------------------------- the brands kept on the server

export function loadBrands() {
  return (macaron.ready ??= (async () => {
    try {
      macaron.list = (await call("api/brands")).brands ?? [];
      let last = null;
      try {
        last = localStorage.getItem(OPEN);
      } catch {}
      const id = macaron.list.find((b) => b.id === last)?.id ?? macaron.list[0]?.id;
      if (id) await openBrand(id);
    } catch (e) {
      console.warn("macaron:", e.message);
    }
    update();
  })());
}

export async function openBrand(id) {
  // what the brand being left has waiting to be saved goes first: opening it again must find it as it was left
  await settleSaves(macaron.brand);
  const { project } = await call(`api/brands/${id}`);
  macaron.brand = { ...project, body: normalize(project.body) };
  macaron.mark = null;
  macaron.past = [];
  macaron.future = [];
  macaron.chat = { messages: [], busy: null };
  macaron.layer = null;
  macaron.entry = null;
  macaron.motion = macaron.brand.body.motion[0]?.id ?? null;
  restoreView();
  try {
    localStorage.setItem(OPEN, id);
  } catch {}
  update();
  toneLogos();
}

/** The logo files that do not say what colour they are (a brand from before, a file added by hand) are read for it, once. */
function toneLogos() {
  const b = macaron.brand;
  for (const l of b?.body.kit.logos ?? []) {
    if (!l.tone) logoColour(l.url).then((hex) => hex && !l.tone && ((l.tone = hex), save(b)));
  }
}

/** The design and format that were open in this brand, else its first approved design. */
function restoreView() {
  const b = macaron.brand;
  let kept = null;
  try {
    kept = JSON.parse(localStorage.getItem(`${OPEN}.${b.id}`) ?? "null");
  } catch {}
  const designs = b.body.designs;
  const d = designs.find((x) => x.id === kept?.design) ?? designs.find((x) => !x.variant && x.status === "approved") ?? designs[0];
  macaron.design = d?.id ?? null;
  macaron.format = d ? (kept?.format in FORMATS && ownFormats(d).includes(kept.format) ? kept.format : d.format) : "4:5";
}
function rememberView() {
  try {
    localStorage.setItem(`${OPEN}.${macaron.brand.id}`, JSON.stringify({ design: macaron.design, format: macaron.format }));
  } catch {}
}

export async function newBrand(name = "New brand", body = blank()) {
  await settleSaves(macaron.brand);
  const { project } = await send("api/brands", "POST", { name, body });
  macaron.list = [{ id: project.id, name: project.name, updatedAt: project.updatedAt }, ...macaron.list];
  macaron.brand = { ...project, body: normalize(project.body) };
  macaron.mark = null;
  macaron.past = [];
  macaron.future = [];
  macaron.chat = { messages: [], busy: null };
  macaron.design = null;
  macaron.layer = null;
  try {
    localStorage.setItem(OPEN, project.id);
  } catch {}
  update();
  toneLogos();
  return macaron.brand;
}

// A brand's save waits a moment for more edits. Each brand has a wait of its own, so an edit in one brand never
// cancels what another has waiting, and a brand's writes go one after another, so an older body never lands last.
const waiting = new Map();
const writing = new Map();
function write(b) {
  waiting.delete(b.id);
  const thumb = b.body.designs.find((d) => d.thumb?.url && !d.variant && d.status === "approved")?.thumb.url ?? b.body.logo?.url ?? productNow(b)?.photo?.url;
  const done = (writing.get(b.id) ?? Promise.resolve())
    .catch(() => {})
    .then(() => send(`api/brands/${b.id}`, "PUT", { name: b.name, body: b.body, ...(thumb ? { thumb } : {}) }))
    .then(() => {
      const row = macaron.list.find((x) => x.id === b.id);
      if (row) Object.assign(row, { name: b.name, thumb, updatedAt: new Date().toISOString() });
    });
  writing.set(b.id, done);
  done.catch((e) => toast(e.message, { tone: "crit" }));
  return done;
}
export function save(b = macaron.brand) {
  if (!b) return;
  clearTimeout(waiting.get(b.id));
  waiting.set(b.id, setTimeout(() => write(b), 400));
}
/** A brand's save that is waiting is made now, and what is being written is let finish. */
async function settleSaves(b) {
  if (!b) return;
  if (waiting.has(b.id)) {
    clearTimeout(waiting.get(b.id));
    write(b);
  }
  await writing.get(b.id)?.catch(() => {});
}
const touched = (b = macaron.brand) => (save(b), update());
export const setBrand = (patch) => (Object.assign(macaron.brand.body, patch), touched());
export const rename = (name) => ((macaron.brand.name = name.slice(0, 60)), save());

export async function removeBrand(id) {
  clearTimeout(waiting.get(id));
  waiting.delete(id);
  await writing.get(id)?.catch(() => {});
  const { brands } = await call(`api/brands/${id}`, { method: "DELETE" });
  macaron.list = brands ?? [];
  if (macaron.brand?.id === id) {
    macaron.brand = null;
    macaron.mark = null;
    if (macaron.list[0]) await openBrand(macaron.list[0].id);
  }
  update();
}

const ensure = async () => macaron.brand ?? (await newBrand());

/** The example brand: Comfyture's own preserves, its logo and its plum jam jar. */
export async function exampleBrand() {
  macaron.busy.add("example");
  update();
  try {
    const up = async (url, name) => api.upload(await (await fetch(url)).blob(), name);
    const [logo, jar] = await Promise.all([up("brand/products/macaron/example-logo.png", "Comfyture logo"), up("brand/products/macaron/example-jar.webp", "Plum jam")]);
    await newBrand("Comfyture Preserves", {
      ...blank(),
      logo: { file: logo.file, url: logo.url, width: logo.width, height: logo.height },
      colours: ["#F2FF59", "#211927", "#49378B", "#F0EFED", "#E8836B"],
      fonts: ["Manrope", "IBM Plex Mono"],
      voice: ["warm", "playful"],
      dos: "Stay sunny",
      donts: "Hard sell",
      headline: "Taste the season",
      tagline: "Sweet days ahead",
      products: [{ id: uid(), name: "Plum jam", photo: { file: jar.file, url: jar.url, width: jar.width, height: jar.height }, cutout: null, features: ["Real plums", "No added sugar", "Small batch"] }],
    });
    macaron.brand.body.product = macaron.brand.body.products[0].id;
    touched();
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    macaron.busy.delete("example");
    update();
  }
}

// ---------------------------------------------------------------- edits, with a way back

export const kitNow = () => kitOf(macaron.brand?.body);
export const designById = (id, b = macaron.brand) => b?.body.designs.find((d) => d.id === id) ?? null;
export const designNow = () => designById(macaron.design);
export const layerNow = () => designNow()?.layers.find((l) => l.id === macaron.layer) ?? null;
export const measure = () => measurer(kitNow());
export const reflowFor = (d, f) => reflow(d, f, measure());
/** A design as it sits in a format: its layers there (its own layout, or a reflowed one), and its ground. */
export const layoutNow = (d = designNow(), format = macaron.format) => layoutOf(d, format, { reflow: reflowFor });

const snap = () => JSON.stringify({ designs: macaron.brand.body.designs, motion: macaron.brand.body.motion });
/** Where a gesture began is kept with the brand it began in: another brand never reads it. */
const marked = () => (macaron.mark?.brand === macaron.brand?.id ? macaron.mark : null);
const hooks = new Set();
/** Called as a design changes between a gesture's start and end (a drag, typing): redraw what shows it. */
export const onLive = (fn) => (hooks.add(fn), () => hooks.delete(fn));

/** A gesture starts: where to go back to. */
export function begin() {
  if (!macaron.brand) return;
  if (!marked()) macaron.mark = { brand: macaron.brand.id, json: snap() };
}
/** A gesture that began and changed nothing (a field focused, then left): there is nothing to go back to. */
export function settle() {
  if (macaron.batch) return;
  if (!marked() || macaron.mark.json === snap()) macaron.mark = null;
}
/** In the middle of a gesture: the change is made and drawn, and saved soon, but the page is not rebuilt. */
export function live(fn) {
  fn();
  const d = designNow();
  if (d) d.updatedAt = new Date().toISOString();
  save();
  for (const h of hooks) h();
}
/** The gesture is over: one step back if anything changed, a line in the design's history, and the page drawn. */
export function end(note) {
  // inside a batch (Brioche's changes, one step back for them all) the batch ends it
  if (macaron.batch) return;
  const was = marked()?.json;
  macaron.mark = null;
  if (was && was !== snap()) {
    macaron.past.push(was);
    if (macaron.past.length > 60) macaron.past.shift();
    macaron.future = [];
    const d = designNow();
    if (d && note) (d.history ??= []).push({ at: new Date().toISOString(), who: "you", note });
    if (d) d.updatedAt = new Date().toISOString();
  }
  touched();
  for (const h of hooks) h();
}
/** Changes made together, as one step back: whatever edits run inside count as one. */
export async function batch(fn, note) {
  begin();
  macaron.batch = (macaron.batch ?? 0) + 1;
  try {
    return await fn();
  } finally {
    macaron.batch--;
    end(note);
  }
}
/** A change made at once, as one step back. */
export function edit(fn, note) {
  begin();
  fn();
  end(note);
}
function restore(json) {
  const { designs, motion } = JSON.parse(json);
  Object.assign(macaron.brand.body, { designs, motion });
  if (!designNow()) macaron.design = designs[0]?.id ?? null;
  if (!layerNow()) macaron.layer = null;
  const d = designNow();
  if (d && !ownFormats(d).includes(macaron.format) && !FORMAT_KEYS.includes(macaron.format)) macaron.format = d.format;
  touched();
  for (const h of hooks) h();
}
export function undo() {
  if (!macaron.past.length) return;
  macaron.future.push(snap());
  restore(macaron.past.pop());
}
export function redo() {
  if (!macaron.future.length) return;
  macaron.past.push(snap());
  restore(macaron.future.pop());
}

/** What happened, for the timeline: kept with the brand, newest last. */
export function remember(entry, brand = macaron.brand) {
  const b = brand.body;
  b.history.push({ id: uid("h"), at: new Date().toISOString(), who: "you", ...entry });
  if (b.history.length > 300) b.history.splice(0, b.history.length - 300);
}

// ---------------------------------------------------------------- the kit

export async function setLogo(file) {
  const b = await ensure();
  try {
    const p = file.file ? file : await api.upload(file, file.name);
    b.body.logo = { file: p.file, url: p.url, width: p.width, height: p.height };
    touched(b);
  } catch (e) {
    toast(e.message, { tone: "crit" });
  }
}
/** The colours of the kit, whole: the kit's palette and the flat list the shoot reads are kept the same. */
export function setPalette(list) {
  const body = macaron.brand.body;
  body.kit.palette = list;
  body.colours = list.map((p) => p.hex.toUpperCase()).slice(0, 6);
  touched();
}
export function setColour(i, hex) {
  const list = macaron.brand.body.kit.palette.map((p) => ({ ...p }));
  if (hex === null) list.splice(i, 1);
  else list[i].hex = hex.toUpperCase();
  setPalette(list);
}
export const addColour = () => macaron.brand.body.kit.palette.length < 8 && setPalette([...macaron.brand.body.kit.palette, { id: `c${uid()}`, name: "New colour", hex: "#FFFFFF", role: "", note: "" }]);
export function setColourField(i, patch) {
  Object.assign(macaron.brand.body.kit.palette[i], patch);
  save();
}
export const setWords = (key, list) => ((macaron.brand.body[key] = list), key === "voice" && (macaron.brand.body.kit.voice.words = list), touched());
export function setKit(path, value) {
  const [a, b] = path.split(".");
  if (b) (macaron.brand.body.kit[a] ??= {})[b] = value;
  else macaron.brand.body.kit[a] = value;
  save();
}
export function setType(role, patch) {
  Object.assign(macaron.brand.body.kit.type[role], patch);
  if (role === "display") macaron.brand.body.fonts = [macaron.brand.body.kit.type.display.family, macaron.brand.body.kit.type.mono.family];
  touched();
}
export function setBrief(patch) {
  Object.assign(macaron.brand.body.brief, patch);
  save();
}
export function setLogoField(id, patch) {
  Object.assign(macaron.brand.body.kit.logos.find((l) => l.id === id) ?? {}, patch);
  touched();
}
export async function addLogoFile(file, kind = "wordmark", tone = "") {
  const b = await ensure();
  try {
    // the library keeps pictures: an SVG is kept as a large PNG with its clear background
    const isSvg = !file.file && (file.type === "image/svg+xml" || /\.svg$/i.test(file.name ?? ""));
    const p = file.file ? file : await api.upload(isSvg ? await rasteriseSvg(file, 2400) : file, (file.name ?? "logo").replace(/\.svg$/i, "") + (isSvg ? ".png" : ""));
    tone ||= (await logoColour(p.url)) ?? "";
    b.body.kit.logos.push({ id: `logo-${uid()}`, name: (file.name ?? "Logo").replace(/\.\w+$/, "").slice(0, 40), kind, tone, url: p.url, ground: "", note: "" });
    if (!b.body.logo) b.body.logo = { file: p.file, url: p.url, width: p.width, height: p.height };
    touched(b);
  } catch (e) {
    toast(e.message, { tone: "crit" });
  }
}
/** An SVG as a PNG of a width, clear where the SVG is. */
async function rasteriseSvg(file, width) {
  const doc = new DOMParser().parseFromString(await file.text(), "image/svg+xml");
  const svg = doc.documentElement;
  if (svg.tagName.toLowerCase() !== "svg") throw new Error("That file is not an SVG.");
  const [, , vw, vh] = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  const ar = vw > 0 && vh > 0 ? vw / vh : parseFloat(svg.getAttribute("width")) / parseFloat(svg.getAttribute("height")) || 1;
  const height = Math.max(1, Math.round(width / ar));
  if (!svg.getAttribute("xmlns")) svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
  try {
    const img = await new Promise((ok, no) => Object.assign(new Image(), { onload() { ok(this); }, onerror: () => no(new Error("That SVG could not be drawn.")), src: url }));
    const canvas = Object.assign(document.createElement("canvas"), { width, height });
    canvas.getContext("2d").drawImage(img, 0, 0, width, height);
    return await new Promise((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("That SVG could not be drawn."))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function removeLogo(id) {
  macaron.brand.body.kit.logos = macaron.brand.body.kit.logos.filter((l) => l.id !== id);
  touched();
}
export function addRule(kind) {
  macaron.brand.body.kit.rules.push({ id: uid("r"), kind, text: "" });
  touched();
}
export function setRule(id, patch) {
  Object.assign(macaron.brand.body.kit.rules.find((r) => r.id === id) ?? {}, patch);
  save();
}
export function removeRule(id) {
  macaron.brand.body.kit.rules = macaron.brand.body.kit.rules.filter((r) => r.id !== id);
  touched();
}

// ---------------------------------------------------------------- references and assets

/** A picture from the computer or the Library, as an asset of the brand (kept on the server). */
export async function addAsset(file, kind = "upload") {
  const b = await ensure();
  const p = file.file ? file : await api.upload(file, file.name);
  const asset = { id: uid("a"), name: (file.name ?? p.name ?? "Picture").replace(/\.\w+$/, "").replace(/[-_]+/g, " ").slice(0, 40), kind, url: p.url, file: p.file, width: p.width, height: p.height, source: "upload" };
  b.body.assets.unshift(asset);
  touched(b);
  return asset;
}
export function setAsset(id, patch) {
  Object.assign(macaron.brand.body.assets.find((a) => a.id === id) ?? {}, patch);
  save();
}
export function removeAsset(id) {
  macaron.brand.body.assets = macaron.brand.body.assets.filter((a) => a.id !== id);
  touched();
}
export const assetByUrl = (url) => macaron.brand.body.assets.find((a) => a.url === url);

export async function addRef(file) {
  const b = await ensure();
  const p = file.file ? file : await api.upload(file, file.name);
  b.body.refs.unshift({ id: uid("f"), title: (file.name ?? "Reference").replace(/\.\w+$/, "").slice(0, 60), kind: "inspiration", src: p.url, note: "", at: new Date().toISOString() });
  remember({ kind: "reference", title: "Reference added", src: p.url }, b);
  touched(b);
}
export function setRef(id, patch) {
  Object.assign(macaron.brand.body.refs.find((r) => r.id === id) ?? {}, patch);
  save();
}
export function removeRef(id) {
  macaron.brand.body.refs = macaron.brand.body.refs.filter((r) => r.id !== id);
  touched();
}
export const pickEntry = (id) => ((macaron.entry = id), update());

/**
 * A new picture for the project from an image model on Comfy Router, at the format's own size. GPT Image
 * 2.5 Flare follows references (characters, products); FLUX 3 makes photographic scenes. It becomes an asset.
 */
export async function makePicture({ prompt, model = "gpt-image-2.5-flare", aspect = "4:5", refs = [], quality = "medium", name }) {
  const b = await ensure();
  const key = `picture:${uid()}`;
  macaron.busy.add(key);
  update();
  try {
    const jobs = await send("api/macaron/image", "POST", { model, prompt, aspect, refs, quality, name: name ?? prompt.slice(0, 60) });
    const done = await waitFor("job", jobs[0].id);
    // what Router charged and the job that made the picture come back with it, and stay with the asset (and in the ledger)
    const asset = { id: uid("a"), name: (name ?? prompt).slice(0, 40), kind: "render", url: done.photo.url, file: done.photo.file, width: done.photo.width, height: done.photo.height, source: "generated", model, aspect, ...(model.startsWith("gpt-image") ? { quality } : {}), prompt: prompt.slice(0, 400), job: done.id, credits: done.credits ?? null, at: new Date().toISOString() };
    b.body.assets.unshift(asset);
    remember({ kind: "design", title: "Picture generated", note: `${model === "flux-3-image" ? "FLUX 3" : "GPT Image 2.5 Flare"}${done.credits ? `, ${done.credits} credits` : ""}: ${prompt.slice(0, 120)}`, src: asset.url }, b);
    touched(b);
    return asset;
  } finally {
    macaron.busy.delete(key);
    update();
  }
}

// ---------------------------------------------------------------- designs

export function openDesign(id, format) {
  const d = designById(id);
  if (!d) return;
  macaron.design = id;
  macaron.format = format && FORMAT_KEYS.includes(format) ? format : d.format;
  macaron.layer = null;
  rememberView();
  update();
}
export function setFormat(format) {
  macaron.format = format;
  macaron.layer = null;
  rememberView();
  update();
}
export const pickLayer = (id) => ((macaron.layer = id), update());
export const toggleSafe = () => ((macaron.safe = !macaron.safe), update());

/** A new design from the brand: its ground, logo, headline, subhead and the product's picture, laid out in a format. */
export function newDesign({ name = "New design", purpose = "Launch", format = "4:5", layout = "left" } = {}) {
  const b = macaron.brand;
  const kit = kitNow();
  const p = productNow(b);
  const now = new Date().toISOString();
  // the palette's ground, else the colour the first logo reads best on, else the first colour
  const tone = colorOf(kit, (kit.logos.find((l) => l.kind === "wordmark") ?? kit.logos[0])?.tone, "");
  const ground = kit.palette.find((c) => /^ground/i.test(c.role ?? ""))?.id
    ?? (tone ? [...kit.palette].sort((a, c) => contrast(c.hex, tone) - contrast(a.hex, tone))[0]?.id : null)
    ?? kit.palette[0]?.id ?? "ink";
  const d = {
    id: uid("d"), name, purpose, status: "draft", format, intent: "", createdAt: now, updatedAt: now, layout,
    bg: { color: ground }, formats: {}, history: [{ at: now, who: "you", note: "Started from the brand kit" }],
    layers: [
      ...(kit.logos.length ? [newLayer("logo", { id: "logo", name: "Logo", logo: kit.logos.find((l) => l.kind === "wordmark")?.id ?? kit.logos[0].id, x: 0.07, y: 0.07, w: 0.3 })] : []),
      newLayer("text", { id: "headline", name: "Headline", role: "headline", fontRole: "display", text: b.body.headline || "Say it in a line.", size: 0.1, lineHeight: 1.02, tracking: -0.02, colorRole: "white", x: 0.07, y: 0.2, w: 0.86 }),
      newLayer("text", { id: "sub", name: "Subhead", role: "sub", fontRole: "text", text: b.body.tagline || "A few words on why it is worth a look.", size: 0.034, lineHeight: 1.3, colorRole: "white", opacity: 0.86, x: 0.07, y: 0.45, w: 0.6 }),
      ...(p ? [newLayer("image", { id: "hero", name: p.name, role: "hero", src: p.cutout?.url ?? p.photo.url, fit: "contain", x: 0.3, y: 0.55, w: 0.55, h: 0.35 })] : []),
    ],
  };
  const laid = withPreset(d, format, layout, measure());
  applyKit(laid, kit, measure());
  return laid;
}
export function addDesign(opts = {}) {
  const d = newDesign(opts);
  edit(() => {
    macaron.brand.body.designs.push(d);
    macaron.design = d.id;
    macaron.format = d.format;
    macaron.layer = null;
    remember({ kind: "design", title: `${d.name} started`, designId: d.id });
  }, "Started");
  rememberView();
  return d;
}
export function duplicateDesign(id = macaron.design) {
  const d = designById(id);
  if (!d) return;
  const copy = cloneDesign(d, { name: `${d.name} copy` });
  edit(() => {
    const list = macaron.brand.body.designs;
    list.splice(list.indexOf(d) + 1, 0, copy);
    macaron.design = copy.id;
    macaron.layer = null;
  }, "Duplicated");
  rememberView();
}
export function removeDesign(id) {
  edit(() => {
    const b = macaron.brand.body;
    b.designs = b.designs.filter((d) => d.id !== id && d.variant?.from !== id);
    b.motion = b.motion.filter((m) => b.designs.some((d) => d.id === m.design));
    if (!designNow()) {
      macaron.design = b.designs[0]?.id ?? null;
      macaron.layer = null;
    }
  });
  rememberView();
}
export function setDesign(id, patch, note) {
  const d = designById(id);
  if (!d) return;
  edit(() => {
    Object.assign(d, patch);
    if (patch.status) remember({ kind: "design", title: `${d.name}: ${patch.status}`, designId: d.id });
  }, note);
}
/** A text field of the open design, kept as it is typed (one step back for the whole field). */
export function setDesignLive(patch) {
  live(() => Object.assign(designNow(), patch));
}

/** The pixel size a layer has in the open design, for a change made by its width and height. */
export function patchLayer(layerId, patch, { design = designNow(), format = macaron.format } = {}) {
  patchLayerIn(design, layerId, patch, format, reflowFor);
}
export const patchLayerLive = (layerId, patch) => live(() => patchLayer(layerId, patch));
export function setBg(patch) {
  const d = designNow();
  edit(() => {
    if (macaron.format === d.format) d.bg = { ...d.bg, ...patch };
    else {
      d.formats ??= {};
      d.formats[macaron.format] ??= { layers: reflowFor(d, macaron.format) };
      d.formats[macaron.format].bg = { ...(d.formats[macaron.format].bg ?? {}), ...patch };
    }
  }, "Ground changed");
}
export function addLayer(type, patch = {}) {
  const d = designNow();
  const kit = kitNow();
  const layer = newLayer(type, { ...(type === "text" ? { colorRole: "white", size: 0.05, w: 0.6, x: 0.12, y: 0.4 } : type === "logo" ? { logo: kit.logos.find((l) => l.kind === "wordmark")?.id ?? kit.logos[0]?.id ?? "", x: 0.07, y: 0.07 } : type === "shape" ? { colorRole: kit.palette[0]?.id, x: 0.2, y: 0.4, w: 0.4, h: 0.12 } : { x: 0.2, y: 0.3, w: 0.6, h: 0.4 }), ...patch });
  edit(() => {
    d.layers.push(layer);
    macaron.layer = layer.id;
  }, `Added ${type}`);
  return layer;
}
export function removeLayer(id) {
  const d = designNow();
  edit(() => {
    d.layers = d.layers.filter((l) => l.id !== id);
    for (const f of Object.values(d.formats ?? {})) delete f.layers?.[id];
    if (macaron.layer === id) macaron.layer = null;
  }, "Removed a layer");
}
export function duplicateLayer(id) {
  const d = designNow();
  const l = d.layers.find((x) => x.id === id);
  if (!l) return;
  const copy = { ...structuredClone(l), id: uid("l"), name: `${l.name} copy`, x: clamp(l.x + 0.03, 0, 0.95), y: clamp(l.y + 0.03, 0, 0.95) };
  edit(() => {
    d.layers.splice(d.layers.indexOf(l) + 1, 0, copy);
    for (const f of Object.values(d.formats ?? {})) if (f.layers?.[id]) f.layers[copy.id] = structuredClone(f.layers[id]);
    macaron.layer = copy.id;
  }, "Duplicated a layer");
}
/** Moves a layer in the stack: +1 up, -1 down, or to the front or the back. */
export function moveLayer(id, to) {
  const d = designNow();
  const i = d.layers.findIndex((l) => l.id === id);
  if (i < 0) return;
  const j = to === "front" ? d.layers.length - 1 : to === "back" ? 0 : clamp(i + to, 0, d.layers.length - 1);
  if (i === j) return;
  edit(() => d.layers.splice(j, 0, d.layers.splice(i, 1)[0]), "Moved a layer");
}
/** Reorders by dragging: the layer takes the place of another. */
export function reorderLayer(id, beforeId) {
  const d = designNow();
  const i = d.layers.findIndex((l) => l.id === id);
  const j = beforeId ? d.layers.findIndex((l) => l.id === beforeId) : d.layers.length;
  if (i < 0 || i === j || i + 1 === j) return;
  edit(() => d.layers.splice(j > i ? j - 1 : j, 0, d.layers.splice(i, 1)[0]), "Reordered the layers");
}
/** Space the text and picture layers evenly down the open format, the first and last staying where they are. */
export function distribute(ids) {
  const d = designNow();
  const lay = layoutNow().layers.filter((l) => ids.includes(l.id)).sort((a, b) => a.y - b.y);
  if (lay.length < 3) return false;
  const [W, H] = [frameOf(macaron.format).w, frameOf(macaron.format).h];
  const m = measure();
  const hs = lay.map((l) => m(l, W, H).h / H);
  const gap = (lay.at(-1).y + hs.at(-1) - lay[0].y - hs.reduce((a, b) => a + b, 0)) / (lay.length - 1);
  edit(() => {
    let y = lay[0].y;
    lay.forEach((l, i) => {
      patchLayer(l.id, { y: Math.round(y * 10000) / 10000 }, { design: d });
      y += hs[i] + gap;
    });
  }, "Spaced evenly");
  return true;
}
/** Aligns a layer to the safe frame (or the frame itself for a layer that bleeds). */
export function alignLayer(id, where) {
  const d = designNow();
  const l = layoutNow().layers.find((x) => x.id === id);
  if (!l) return;
  const [W, H] = [frameOf(macaron.format).w, frameOf(macaron.format).h];
  const box = measure()(l, W, H);
  const S = safeRect(macaron.format);
  const [w, h] = [box.w / W, box.h / H];
  const patch = { left: { x: S.x }, center: { x: 0.5 - w / 2 }, right: { x: S.x + S.w - w }, top: { y: S.y }, middle: { y: 0.5 - h / 2 }, bottom: { y: S.y + S.h - h } }[where];
  if (patch) edit(() => patchLayer(id, Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, Math.round(v * 10000) / 10000])), { design: d }), "Aligned");
}

/** The open design laid out again for a format: reflowed within its safe zones, the layout kept as its own. */
export function adaptFormat(format = macaron.format, id = macaron.design) {
  const d = designById(id);
  if (!d || format === d.format) return;
  edit(() => {
    d.formats ??= {};
    d.formats[format] = { ...(d.formats[format] ?? {}), layers: reflowFor(d, format) };
    macaron.format = format;
    remember({ kind: "design", title: `${d.name}: laid out for ${FORMATS[format].name}`, designId: d.id });
  }, `Laid out for ${format}`);
  rememberView();
}
/** A layout preset on the open design, in every format it has a layout for. */
export function applyLayout(preset, id = macaron.design) {
  const d = designById(id);
  if (!d) return;
  edit(() => {
    const m = measure();
    let next = d;
    for (const f of new Set([d.format, ...Object.keys(d.formats ?? {}), macaron.format])) next = withPreset(next, f, preset, m);
    Object.assign(d, next, { layout: preset });
  }, `Layout: ${LAYOUTS[preset]}`);
}
export function applyKitNow(id = macaron.design) {
  const d = designById(id);
  if (!d) return [];
  let did = [];
  edit(() => (did = applyKit(d, kitNow(), measure())), "Kit applied");
  return did;
}
export const guardOf = (d = designNow(), format = macaron.format, sizes) => (d ? guard(d, format, kitNow(), measure(), sizes) : []);

// ---------------------------------------------------------------- variations

export const VARIANT_KINDS = { copy: "Copy", composition: "Composition", colour: "Colour", intent: "Intent", format: "Format" };
export const INTENTS = {
  awareness: { label: "Awareness", intent: "Say what it is in one look.", cta: "" },
  trial: { label: "Trial", intent: "Get people to try it today.", cta: "Try it today" },
  community: { label: "Community", intent: "Show what people make with it.", cta: "Share yours" },
  offer: { label: "Offer", intent: "Make one offer, plainly.", cta: "See the offer" },
};

/** The ground after this one in the kit, for a colour variation; the layers' colours turn with it. */
function recolour(copy, kit) {
  const grounds = kit.palette.filter((c) => /ground/i.test(c.role ?? "") || c.id === "yellow" || c.id === "white");
  const pool = grounds.length > 1 ? grounds : kit.palette;
  const now = pool.findIndex((c) => c.id === copy.bg.color);
  const next = pool[(now + 1) % pool.length];
  const was = copy.bg.color;
  const swap = (v) => (v === next.id ? was : v === was ? next.id : v);
  copy.bg.color = next.id;
  for (const l of copy.layers) {
    for (const k of ["colorRole", "accent", "strokeColor"]) if (l[k]) l[k] = swap(l[k]);
  }
  for (const f of Object.values(copy.formats ?? {})) if (f.bg?.color) f.bg.color = next.id;
  return next;
}

/** A saved alternative of the open design: a copy made with a starting change of one kind, to revise. */
export function makeVariant(kind, { from = designNow(), name, note, intent } = {}) {
  const kit = kitNow();
  const copy = cloneDesign(from, { name: name ?? `${from.name.replace(/ · .*$/, "")} · ${VARIANT_KINDS[kind]}`, kind, note });
  const m = measure();
  if (kind === "colour") {
    const to = recolour(copy, kit);
    applyKit(copy, kit, m);
    copy.variant.note = note ?? `${to.name} ground`;
  } else if (kind === "composition") {
    const order = Object.keys(LAYOUTS);
    const preset = order[(order.indexOf(from.layout ?? "left") + 1) % order.length];
    let next = copy;
    for (const f of new Set([copy.format, ...Object.keys(copy.formats ?? {})])) next = withPreset(next, f, preset, m);
    Object.assign(copy, next, { layout: preset });
    copy.variant.note = note ?? LAYOUTS[preset];
  } else if (kind === "intent") {
    const it = INTENTS[intent] ?? INTENTS.trial;
    copy.intent = it.intent;
    copy.variant.note = note ?? it.label;
    const cta = copy.layers.find((l) => l.role === "cta");
    if (cta && it.cta) cta.text = it.cta;
  } else if (kind === "format") {
    const to = FORMAT_KEYS.find((f) => f !== from.format && !from.formats?.[f]) ?? FORMAT_KEYS.find((f) => f !== from.format);
    const lay = layoutOf(copy, to, { reflow: reflowFor });
    copy.layers = lay.layers;
    copy.bg = lay.bg;
    copy.formats = {};
    copy.format = to;
    copy.variant.note = note ?? `${FORMATS[to].name} first`;
  } else copy.variant.note = note ?? "Other words";
  edit(() => {
    const list = macaron.brand.body.designs;
    let at = list.indexOf(from) + 1;
    while (list[at]?.variant?.of === (from.variant?.of ?? from.id)) at++;
    list.splice(at, 0, copy);
    macaron.design = copy.id;
    macaron.format = copy.format;
    macaron.layer = null;
    remember({ kind: "variant", title: `${copy.name}`, note: `A ${kind} variation of ${from.name}`, designId: copy.id });
  }, "Variation made");
  rememberView();
  return copy;
}
/** A variation takes the place of the design it came from: its layers, ground and layouts. */
export function useVariant(id) {
  const v = designById(id);
  const base = v && designById(v.variant?.from);
  if (!v || !base) return;
  edit(() => {
    Object.assign(base, structuredClone({ layers: v.layers, bg: v.bg, formats: v.formats, format: v.format, intent: v.intent, layout: v.layout }));
    (base.history ??= []).push({ at: new Date().toISOString(), who: "you", note: `Took the ${v.variant.kind} variation “${v.name}”` });
    macaron.design = base.id;
    macaron.format = base.format;
    remember({ kind: "decision", title: `${base.name}: ${v.name} chosen`, designId: base.id });
  });
}

// ---------------------------------------------------------------- the shapes things are drawn in

const thumbs = new Set();
let thumbFrame = 0;
/** A canvas that shows a design in a format at a width, redrawn when the design changes. */
export function thumb(design, { format = design.format, width = 240, t = null } = {}) {
  const canvas = document.createElement("canvas");
  canvas.className = "mc-canvas";
  const f = frameOf(format);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round((width * dpr * f.h) / f.w);
  canvas.style.aspectRatio = `${f.w} / ${f.h}`;
  // a design that moves is shown as its poster frame
  const item = { canvas, id: design.id, format, t: t ?? (design.motion ? design.poster ?? null : null), ready: false };
  thumbs.add(item);
  paint(item);
  return canvas;
}
async function paint(item) {
  const d = designById(item.id);
  if (!d || !item.canvas.isConnected && item.ready) return;
  const kit = kitNow();
  if (!item.ready) {
    await prepare(d, kit);
    item.ready = true;
  }
  const f = frameOf(item.format);
  const ctx = item.canvas.getContext("2d");
  ctx.save();
  ctx.scale(item.canvas.width / f.w, item.canvas.width / f.w);
  drawDesign(ctx, d, { w: f.w, h: f.h, format: item.format, kit, t: item.t, reflow: reflowFor });
  ctx.restore();
}
/** After a design changes: every canvas that shows one is drawn again (the ones no longer on the page are let go). */
export function refreshThumbs() {
  if (thumbFrame) return;
  thumbFrame = requestAnimationFrame(() => {
    thumbFrame = 0;
    for (const item of [...thumbs]) {
      if (!item.canvas.isConnected) thumbs.delete(item);
      else paint(item).catch(() => {});
    }
  });
}
onLive(refreshThumbs);

/** A design drawn out to a PNG blob, at its format's own size. */
export async function renderPng(design, format, { scale = 1, t = null, kit = kitNow() } = {}) {
  const problems = await prepare(design, kit);
  if (problems.length) throw new Error(problems[0]);
  const measure = measurer(kit);
  const canvas = renderDesign(design, { format, kit, scale, t, reflow: (d, f) => reflow(d, f, measure) });
  return new Promise((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("The picture could not be made."))), "image/png"));
}

// ---------------------------------------------------------------- export

/** When a motion design is a picture: the poster time it names, else most of the way through its piece. */
const posterTime = (d, b = macaron.brand) => {
  if (!d.motion) return null;
  const m = b.body.motion.find((x) => x.design === d.id);
  return d.poster ?? (m ? m.duration * 0.85 : null);
};
const nameOf = (d, format, ext, b = macaron.brand) => `${b.name}-${d.name}-${format.replace(":", "x")}.${ext}`.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
/** A design as a PNG, kept on the server and recorded with the brand, then downloaded. */
export async function exportPng(id = macaron.design, format = macaron.format, { download = true } = {}) {
  // the brand it was asked in is the brand it is kept with, whatever is open when it is done
  const b = macaron.brand;
  const d = designById(id, b);
  if (!d) return null;
  const key = `export:${d.id}:${format}`;
  macaron.busy.add(key);
  update();
  try {
    const blob = await renderPng(d, format, { t: posterTime(d, b), kit: kitOf(b.body) });
    const kept = await call(`api/macaron/exports?name=${encodeURIComponent(`${b.name} ${d.name} ${format}`)}`, { method: "POST", headers: { "Content-Type": "image/png" }, body: blob });
    const rec = { id: uid("x"), design: d.id, designName: d.name, format, kind: "png", url: kept.url, file: kept.file, width: kept.width, height: kept.height, bytes: kept.bytes, at: new Date().toISOString() };
    b.body.exports.unshift(rec);
    b.body.exports.splice(200);
    d.thumb = { file: kept.file, url: kept.url, format };
    remember({ kind: "export", title: `${d.name} exported`, note: `${FORMATS[format].name} ${kept.width}×${kept.height} PNG`, src: kept.url, designId: d.id }, b);
    touched(b);
    if (download) saveAs(`${kept.url}?download=${nameOf(d, format, "png", b)}`);
    return rec;
  } catch (e) {
    toast(e.message, { tone: "crit" });
    return null;
  } finally {
    macaron.busy.delete(key);
    update();
  }
}
export function saveAs(href) {
  const a = document.createElement("a");
  a.href = href;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
}
export const exportsOf = (id) => macaron.brand.body.exports.filter((x) => x.design === id);
export function removeExport(id) {
  macaron.brand.body.exports = macaron.brand.body.exports.filter((x) => x.id !== id);
  touched();
}

// ---------------------------------------------------------------- motion

export const motionNow = () => macaron.brand?.body.motion.find((m) => m.id === macaron.motion) ?? null;
export const pickMotion = (id) => ((macaron.motion = id), update());
/** A motion piece from a design: the design's layers carry their timing (anim), the piece its length and frame rate. */
export function addMotion(designId = macaron.design, { name, duration = 6, format } = {}) {
  const d = designById(designId);
  if (!d) return null;
  const m = { id: uid("m"), name: name ?? `${d.name} · motion`, design: d.id, format: format ?? d.format, duration, fps: 30, sound: { pad: true, pops: [] } };
  edit(() => {
    d.motion = true;
    // a design that does not move yet gets a first timing: the logo wipes in and its lid lands, then the rest follows
    if (!d.layers.some((l) => l.anim)) {
      const anims = firstTiming(d, duration, kitNow(), measure());
      for (const l of d.layers) if (anims[l.id]) l.anim = anims[l.id];
      for (const l of d.layers) if (l.anim?.lid && lacksLid(kitNow().logos.find((x) => x.id === l.logo)?.url)) delete l.anim.lid;
      m.sound.pops = soundPops(d);
    }
    macaron.brand.body.motion.push(m);
    macaron.motion = m.id;
  });
  return m;
}
export function setMotion(id, patch) {
  const m = macaron.brand.body.motion.find((x) => x.id === id);
  if (m) edit(() => Object.assign(m, patch));
}
/** A layer's timing in a motion piece: when it comes in, when it goes, and how. */
export function setAnim(design, layerId, patch) {
  // the design is the one the motion piece plays, which is not always the one open in the studio
  const l = design?.layers.find((x) => x.id === layerId);
  if (!l) return;
  edit(() => {
    l.anim = { ...(l.anim ?? { t0: 0 }), ...patch };
    for (const k of ["in", "out", "lid", "settle"]) if (l.anim[k] === null) delete l.anim[k];
    if (patch.settle === null) delete l.anim.settle;
    design.motion = true;
  }, "Timing changed");
}
export function removeMotion(id) {
  edit(() => {
    const b = macaron.brand.body;
    b.motion = b.motion.filter((m) => m.id !== id);
    if (macaron.motion === id) macaron.motion = b.motion[0]?.id ?? null;
  });
}

/**
 * Renders a motion piece: every frame drawn by drawDesign() at its time, sent to the server one by one, and
 * encoded there as an H.264 video. The poster frame is exported as a picture too.
 */
export async function renderMotion(id = macaron.motion) {
  const b = macaron.brand;
  const m = b?.body.motion.find((x) => x.id === id);
  const d = m && designById(m.design, b);
  if (!m || !d || macaron.progress) return null;
  const kit = kitOf(b.body);
  const measure = measurer(kit);
  const reflowIn = (x, f) => reflow(x, f, measure);
  const f = frameOf(m.format);
  const total = Math.round(m.duration * m.fps);
  macaron.progress = { id, kind: "motion", done: 0, total };
  update();
  const job = Array.from(crypto.getRandomValues(new Uint8Array(5)), (v) => v.toString(16).padStart(2, "0")).join("");
  try {
    const problems = await prepare(d, kit);
    if (problems.length) throw new Error(problems[0]);
    const canvas = document.createElement("canvas");
    canvas.width = f.w;
    canvas.height = f.h;
    const ctx = canvas.getContext("2d");
    const pending = new Set();
    for (let i = 0; i < total; i++) {
      drawDesign(ctx, d, { w: f.w, h: f.h, format: m.format, kit, t: i / m.fps, reflow: reflowIn });
      const blob = await new Promise((ok) => canvas.toBlob(ok, "image/png"));
      const p = call(`api/macaron/frames?job=${job}&n=${i}`, { method: "POST", headers: { "Content-Type": "image/png" }, body: blob }).then(() => {
        pending.delete(p);
        macaron.progress.done = i + 1 - pending.size;
      });
      pending.add(p);
      if (pending.size >= 4) await Promise.race(pending);
      if (i % 6 === 0) update();
    }
    await Promise.all(pending);
    macaron.progress.done = total;
    update();
    const video = await send("api/macaron/motion", "POST", { job, fps: m.fps, name: `${b.name} ${m.name} ${m.format}`, sound: m.sound });
    // the poster is a picture of the piece when it is whole
    const posterT = d.poster ?? m.duration * 0.85;
    drawDesign(ctx, d, { w: f.w, h: f.h, format: m.format, kit, t: posterT, reflow: reflowIn });
    const poster = await call(`api/macaron/exports?name=${encodeURIComponent(`${m.name} poster`)}`, { method: "POST", headers: { "Content-Type": "image/png" }, body: await new Promise((ok) => canvas.toBlob(ok, "image/png")) });
    m.render = { url: video.url, file: video.file, width: video.width, height: video.height, duration: video.duration, bytes: video.bytes, format: m.format, sound: video.sound, poster: poster.url, at: new Date().toISOString() };
    b.body.exports.unshift({ id: uid("x"), design: d.id, designName: m.name, format: m.format, kind: "mp4", url: video.url, file: video.file, width: video.width, height: video.height, bytes: video.bytes, duration: video.duration, poster: poster.url, at: m.render.at });
    remember({ kind: "export", title: `${m.name} rendered`, note: `${video.width}×${video.height} · ${video.duration} s`, src: poster.url, designId: d.id }, b);
    return m.render;
  } catch (e) {
    call(`api/macaron/frames?job=${job}`, { method: "DELETE" }).catch(() => {});
    toast(e.message, { tone: "crit" });
    return null;
  } finally {
    macaron.progress = null;
    touched(b);
  }
}

// ---------------------------------------------------------------- products

export const productNow = (b = macaron.brand) => b?.body.products.find((p) => p.id === b.body.product) ?? b?.body.products[0] ?? null;
export async function addProduct(file) {
  const b = await ensure();
  try {
    const p = file.file ? file : await api.upload(file, file.name);
    const product = { id: uid(), name: (file.file ? file.name ?? "" : (file.name ?? "").replace(/\.\w+$/, "").replace(/[-_]+/g, " ")).slice(0, 40) || "Product", photo: { file: p.file, url: p.url, width: p.width, height: p.height }, cutout: null, features: [] };
    b.body.products.push(product);
    b.body.product = product.id;
    touched(b);
    cutOut(b, product);
  } catch (e) {
    toast(e.message, { tone: "crit" });
  }
}
/** A product's clear cut-out, for its card (the shoot draws from its photo). */
async function cutOut(b, product) {
  try {
    const job = await send("api/utensils/cutout", "POST", { source: product.photo.file });
    const done = await waitFor("job", job.id);
    product.cutout = { file: done.photo.file, url: done.photo.url };
    touched(b);
  } catch {}
}
export const pickProduct = (id) => ((macaron.brand.body.product = id), touched());
export function setProduct(id, patch) {
  const p = macaron.brand.body.products.find((x) => x.id === id);
  if (!p) return;
  Object.assign(p, patch);
  save();
}
export function removeProduct(id) {
  const b = macaron.brand.body;
  b.products = b.products.filter((p) => p.id !== id);
  if (b.product === id) b.product = b.products[0]?.id ?? null;
  touched();
}

// ---------------------------------------------------------------- the shoot

export const pickTemplate = (id) => ((macaron.template = templateById(id).id), update());
export const setFilter = (key, value) => ((macaron[key] = value), update());
export function formatsOf(t = templateById(macaron.template), b = macaron.brand) {
  const kept = b?.body.shoot.formats[t.id];
  return Array.isArray(kept) && kept.length ? kept.filter((f) => t.formats.includes(f)) : t.formats.slice(0, 1);
}
export function toggleFormat(f) {
  const t = templateById(macaron.template);
  const now = formatsOf(t);
  const next = now.includes(f) ? now.filter((x) => x !== f) : [...now, f];
  macaron.brand.body.shoot.formats[t.id] = next.length ? next : now;
  touched();
}
export const setCount = (n) => ((macaron.brand.body.shoot.count = Math.max(1, Math.min(4, n))), touched());
export const shooting = () => [...macaron.busy].some((k) => k.startsWith("shoot"));

/** A picture of ours as a picture in the server's library, uploaded once when it only ships with the app. */
const library = new Map();
async function inLibrary(pic) {
  if (pic.file) return pic;
  if (!library.has(pic.url)) library.set(pic.url, (async () => api.upload(await (await fetch(pic.url)).blob(), "Macaron picture"))().catch((e) => (library.delete(pic.url), Promise.reject(e))));
  return library.get(pic.url);
}

/** The template shot: a picture per format and count, then for a video template a take from each. */
export async function shoot() {
  const b = macaron.brand;
  const p = productNow(b);
  const t = templateById(macaron.template);
  if (!p) return toast("Add a product to the brand first.");
  if (shooting()) return;
  const formats = formatsOf(t, b);
  const count = b.body.shoot.count ?? 2;
  macaron.busy.add("shoot");
  update();
  try {
    const photo = await inLibrary(p.photo);
    // a logo the library cannot take (an SVG) is left out, and the words about it with it: the shoot goes on
    const logo = b.body.logo ? await inLibrary(b.body.logo).catch(() => null) : null;
    const refs = [{ file: photo.file, name: "product" }, ...(logo ? [{ file: logo.file, name: "logo" }] : [])];
    const prompt = t.prompt({ ...b.body, ...(logo ? {} : { logo: null }), name: b.name }, p).replace(/\s+/g, " ").trim();
    const jobs = (await Promise.all(formats.map(async (format) => {
      const started = await api.image({ model: artistFor("edit"), template: "edit", prompt, refs, aspect: format, count, megapixels: 1, seed: Math.floor(Math.random() * 2 ** 31), name: `${b.name} · ${t.name}` });
      return started.map((job) => ({ job, format }));
    }))).flat();
    // each picture is kept as it comes in
    const outs = jobs.map(({ job, format }) => {
      const o = { id: uid(), template: t.id, product: p.id, format, kind: t.media, status: "drawing", at: new Date().toISOString() };
      b.body.outputs.unshift(o);
      return { o, job };
    });
    touched(b);
    await Promise.all(outs.map(async ({ o, job }) => {
      try {
        const done = await waitFor("job", job.id);
        o.photo = { file: done.photo.file, url: done.photo.url, width: done.photo.width, height: done.photo.height };
        o.status = t.media === "video" ? "rolling" : "done";
        o.palette = await paletteMatch(o.photo.url, b.body.colours);
        touched(b);
        if (t.media === "video") await roll(b, t, p, o);
      } catch (e) {
        o.status = "failed";
        o.error = e.message;
        touched(b);
      }
    }));
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    macaron.busy.delete("shoot");
    update();
  }
}

/** A video template's take, from its picture: a preset's move, or the template's own action and line. */
async function roll(b, t, p, o) {
  const v = t.video;
  const preset = v.preset ? presetById(v.preset) : null;
  const aspect = ["9:16", "1:1", "16:9"].includes(o.format) ? o.format : "auto";
  const line = v.line?.({ ...b.body, name: b.name }, p);
  const script = preset
    ? structuredClone(preset.script)
    : { shots: [{ action: v.action, camera: v.camera ?? "", sound: "Natural room sound.", framing: "", dialogue: line ? [{ speaker: "", language: "English", line }] : [] }], raw: "" };
  const [run] = await api.shoot({ name: `${b.name} · ${t.name}`, start: o.photo.file, seconds: preset?.seconds ?? 5, aspect, review: false, takes: 1, quality: "standard", preset: preset?.id, script });
  o.run = run.id;
  touched(b);
  try {
    const done = await waitFor("run", run.id);
    o.video = done.video;
    o.status = "done";
  } catch (e) {
    o.status = "failed";
    o.error = e.message;
  }
  touched(b);
}

export function removeOutput(id) {
  macaron.brand.body.outputs = macaron.brand.body.outputs.filter((o) => o.id !== id);
  touched();
}

/**
 * How close a picture keeps to the brand's palette: the share of its colourful pixels that sit near
 * one of the brand's colours. Unknown (null) without a palette.
 */
async function paletteMatch(url, colours) {
  if (!colours?.length) return null;
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = Math.max(1, Math.round((64 * img.naturalHeight) / img.naturalWidth));
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const hex = colours.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  let colourful = 0;
  let near = 0;
  for (let i = 0; i < d.length; i += 4) {
    const [r, gr, bl] = [d[i], d[i + 1], d[i + 2]];
    const max = Math.max(r, gr, bl);
    const min = Math.min(r, gr, bl);
    // greys and near-blacks say nothing about a palette
    if (max - min < 40 || max < 50) continue;
    colourful++;
    if (hex.some(([R, G, B]) => (r - R) ** 2 + (gr - G) ** 2 + (bl - B) ** 2 < 70 ** 2)) near++;
  }
  return colourful ? Math.round((near / colourful) * 100) / 100 : null;
}

/** Roughly what a shoot costs, in Comfy credits. */
export function estimate() {
  if (state.info?.target !== "comfy-cloud" || !macaron.brand) return null;
  const t = templateById(macaron.template);
  const look = (state.image.catalogue?.models ?? []).find((x) => x.id === artistFor("edit"));
  const pic = look?.router ? look.credits ?? 8 : (look?.seconds ?? 10) * 0.266;
  const n = formatsOf(t).length * (macaron.brand.body.shoot.count ?? 2);
  return Math.max(1, Math.round(n * pic + (t.media === "video" ? n * 5 * 18 * 0.266 : 0)));
}

// the shoot redraws while its takes roll
onChange((scopes) => {
  if (scopes.has("takes") && macaron.brand?.body.outputs.some((o) => o.status === "rolling")) changed("macaron");
});
