// Macaron: content for a brand. A brand kit (its logo, colours, type, voice) and its products; a
// template is a setup the product is shot in, as a picture in each format asked for, or a picture
// then a short video from it. Every shot is kept with the brand, and checked against its palette.
import { state, changed, onChange, toast, waitFor, artistFor, presetById } from "./store.js";
import { api } from "./api.js";
import { TEMPLATES, templateById } from "./macaron-templates.js";

const OPEN = "comfyture.macaron.open";
export const macaron = { list: [], brand: null, ready: null, busy: new Set(), template: TEMPLATES[0].id, media: "all", category: "all" };
const update = () => changed("macaron");

const call = async (path, init) => {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
};
const send = (path, method, body) => call(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const blank = () => ({ logo: null, colours: [], fonts: [], voice: [], dos: "", donts: "", headline: "", tagline: "", products: [], product: null, outputs: [], shoot: { formats: {}, count: 2 } });

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
  const { project } = await call(`api/brands/${id}`);
  macaron.brand = { ...project, body: { ...blank(), ...project.body } };
  try {
    localStorage.setItem(OPEN, id);
  } catch {}
  update();
}

export async function newBrand(name = "New brand", body = blank()) {
  const { project } = await send("api/brands", "POST", { name, body });
  macaron.list = [{ id: project.id, name: project.name, updatedAt: project.updatedAt }, ...macaron.list];
  macaron.brand = { ...project, body: { ...blank(), ...project.body } };
  try {
    localStorage.setItem(OPEN, project.id);
  } catch {}
  update();
  return macaron.brand;
}

let saving = null;
export function save() {
  const b = macaron.brand;
  if (!b) return;
  clearTimeout(saving);
  saving = setTimeout(() => {
    const thumb = b.body.logo?.url ?? productNow()?.photo?.url;
    send(`api/brands/${b.id}`, "PUT", { name: b.name, body: b.body, ...(thumb ? { thumb } : {}) })
      .then(() => {
        const row = macaron.list.find((x) => x.id === b.id);
        if (row) Object.assign(row, { name: b.name, thumb, updatedAt: new Date().toISOString() });
      })
      .catch((e) => toast(e.message, { tone: "crit" }));
  }, 400);
}
const touched = () => (save(), update());
export const setBrand = (patch) => (Object.assign(macaron.brand.body, patch), touched());
export const rename = (name) => ((macaron.brand.name = name.slice(0, 60)), save());

export async function removeBrand(id) {
  const { brands } = await call(`api/brands/${id}`, { method: "DELETE" });
  macaron.list = brands ?? [];
  if (macaron.brand?.id === id) {
    macaron.brand = null;
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

// ---------------------------------------------------------------- the kit and the products

export async function setLogo(file) {
  const b = await ensure();
  try {
    const p = file.file ? file : await api.upload(file, file.name);
    b.body.logo = { file: p.file, url: p.url, width: p.width, height: p.height };
    touched();
  } catch (e) {
    toast(e.message, { tone: "crit" });
  }
}
export function setColour(i, hex) {
  const c = macaron.brand.body.colours;
  if (hex === null) c.splice(i, 1);
  else c[i] = hex.toUpperCase();
  touched();
}
export const addColour = () => (macaron.brand.body.colours.length < 6 && macaron.brand.body.colours.push("#FFFFFF"), touched());
export const setWords = (key, list) => ((macaron.brand.body[key] = list), touched());

export const productNow = (b = macaron.brand) => b?.body.products.find((p) => p.id === b.body.product) ?? b?.body.products[0] ?? null;
export async function addProduct(file) {
  const b = await ensure();
  try {
    const p = file.file ? file : await api.upload(file, file.name);
    const product = { id: uid(), name: (file.file ? file.name ?? "" : (file.name ?? "").replace(/\.\w+$/, "").replace(/[-_]+/g, " ")).slice(0, 40) || "Product", photo: { file: p.file, url: p.url, width: p.width, height: p.height }, cutout: null, features: [] };
    b.body.products.push(product);
    b.body.product = product.id;
    touched();
    cutOut(product);
  } catch (e) {
    toast(e.message, { tone: "crit" });
  }
}
/** A product's clear cut-out, for its card (the shoot draws from its photo). */
async function cutOut(product) {
  try {
    const job = await send("api/utensils/cutout", "POST", { source: product.photo.file });
    const done = await waitFor("job", job.id);
    product.cutout = { file: done.photo.file, url: done.photo.url };
    touched();
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
    const refs = [{ file: p.photo.file, name: "product" }, ...(b.body.logo ? [{ file: b.body.logo.file, name: "logo" }] : [])];
    const prompt = t.prompt({ ...b.body, name: b.name }, p).replace(/\s+/g, " ").trim();
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
    touched();
    await Promise.all(outs.map(async ({ o, job }) => {
      try {
        const done = await waitFor("job", job.id);
        o.photo = { file: done.photo.file, url: done.photo.url, width: done.photo.width, height: done.photo.height };
        o.status = t.media === "video" ? "rolling" : "done";
        o.palette = await paletteMatch(o.photo.url, b.body.colours);
        touched();
        if (t.media === "video") await roll(b, t, p, o);
      } catch (e) {
        o.status = "failed";
        o.error = e.message;
        touched();
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
  touched();
  try {
    const done = await waitFor("run", run.id);
    o.video = done.video;
    o.status = "done";
  } catch (e) {
    o.status = "failed";
    o.error = e.message;
  }
  touched();
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
