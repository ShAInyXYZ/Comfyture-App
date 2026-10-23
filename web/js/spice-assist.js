// Paprika, the baby chameleon who runs Spice. She is told the shot open (its footage and frame range, the passes the six departments have
// made), the department open and what it holds, what its key would cost, and answers with what to set up: a department opened, the shot
// trimmed, a subject for Roto, an effect, a clean-up, a light or a finish, and "run it". Setting up costs nothing, so it is done at once.
// Running costs credits (or time): it waits in her answer for one yes from you, with its price, and nothing runs until you give it.
import { changed, toast, writer } from "./store.js";
import { spice, edit, setSet, setDept, creditsTodayAll, workingOn } from "./spice.js";
import { FIRST, lastFrame, rangeOf, whenOf, fxSeconds, elementById, passOf, visible } from "./spice-model.js";
import { WORKSPACES } from "./spice-harness.js";
import { runnerFor } from "./spice-runs.js";

/** Paprika's conversation: Spice's own, never mixed with another product's. */
export const chat = { messages: [], busy: null };

/** The room of the bar on Spice: the department that is open. */
export const roomOfSpice = () => spice.dept;

const noun = { relight: "Relight", weather: "Weather", grade: "Grade", upscale: "Upscale", slow: "Slow motion", export: "Export" };

/** What she is told: the shot, its footage, the passes, the department open and what it holds, the price of its key. */
export function summary() {
  const s = spice.shot;
  if (!s) return {};
  const b = s.body;
  const plate = b.passes.plate;
  const r = rangeOf(b);
  const f = b.set.fx;
  const w = whenOf(b);
  const fps = plate?.fps ?? 24;
  const tool = spice.tool[spice.dept];
  const key = runnerFor(spice.dept, tool);
  return {
    department: spice.dept,
    shot: s.name,
    shots: spice.list.length,
    footage: plate ? { kind: plate.media.kind, name: plate.name, width: plate.media.width, height: plate.media.height, fps, first: FIRST, last: lastFrame(plate), range: [r.in, r.out] } : null,
    passes: WORKSPACES.map((d) => d.id).filter((d) => passOf(b, d)?.media).map((d) => ({ dept: d, note: passOf(b, d).note, from: passOf(b, d).from, to: passOf(b, d).to, shown: visible(passOf(b, d)) })),
    subjects: b.set.roto.subjects.map((x) => ({ name: x.name, tracked: !!x.media && !x.stale, clicks: x.points.length })),
    fx: { element: f.element, from: w.from, to: w.to, seconds: fxSeconds(w, fps), depth: f.depth, intensity: f.intensity, spill: f.spill, ease: f.ease },
    paint: { what: b.set.paint.how === "describe" ? "object" : b.set.paint.how, engine: b.set.paint.engine, words: b.set.paint.words },
    light: { tool: spice.tool.light, words: b.set.light.words || b.set.light.look, weather: b.set.light.weather, grade: b.set.light.grade },
    comp: { tool: spice.tool.comp, height: b.set.comp.height, factor: b.set.comp.factor, engine: b.set.comp.engine, format: b.set.comp.format },
    run: key ? { label: key.label, cost: key.cost, free: key.free, ready: key.ready, why: key.why } : null,
    today: creditsTodayAll(),
    busy: WORKSPACES.map((d) => d.id).filter((d) => workingOn(d)),
  };
}

async function post(body) {
  const res = await fetch("api/spice/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `Request failed (${res.status})`);
  return out;
}

const newId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** One action, made. Answers what to tell the user: what was done, and what could not be. */
export function apply(a) {
  const did = [];
  const failed = [];
  const b = spice.shot.body;
  const name = (id) => WORKSPACES.find((w) => w.id === id)?.name ?? id;
  if (a.op === "open") {
    setDept(a.department);
    did.push(`Opened ${name(a.department)}`);
  } else if (a.op === "trim") {
    if (!b.passes.plate) return { did, failed: ["No footage to trim yet"] };
    const last = lastFrame(b.passes.plate);
    const r = rangeOf(b);
    const inn = Math.min(Math.max(FIRST, a.in ?? r.in), last);
    const out = Math.max(Math.min(last, a.out ?? r.out), inn);
    edit((x) => (x.range = inn <= FIRST && out >= last ? null : { in: inn, out }));
    did.push(`Frames ${inn} – ${out}`);
  } else if (a.op === "subject") {
    edit((x) => {
      const id = newId();
      x.set.roto.subjects.push({ id, name: a.name, points: [], media: null, eye: true });
      x.set.roto.open = id;
    });
    setDept("roto");
    did.push(`Subject: ${a.name}`);
  } else if (a.op === "fx") {
    const patch = {};
    if (a.element) patch.element = a.element;
    if (a.words !== undefined) patch.words = a.words;
    if (a.element && a.words === undefined) patch.words = "";
    if (a.from !== undefined || a.to !== undefined) {
      const w = whenOf(b);
      const from = a.from ?? w.from;
      patch.when = { from, to: Math.max(from, a.to ?? w.to) };
    }
    for (const k of ["depth", "intensity", "spill", "ease"]) if (a[k] !== undefined) patch[k] = a[k];
    if (a.x !== undefined || a.y !== undefined || a.size !== undefined) patch.place = { ...b.set.fx.place, ...(a.x !== undefined ? { x: a.x } : {}), ...(a.y !== undefined ? { y: a.y } : {}), ...(a.size !== undefined ? { size: a.size } : {}) };
    setSet("fx", patch);
    setDept("fx");
    did.push(a.element ? `FX: ${elementById(a.element).name}` : "FX settings");
  } else if (a.op === "paint") {
    const patch = { how: a.what === "object" ? "describe" : a.what };
    if (a.words !== undefined) patch.words = a.words;
    if (a.engine) patch.engine = a.engine;
    setSet("paint", patch);
    setDept("paint");
    did.push(`Paint: ${a.what}${a.words ? ` · ${a.words.length > 30 ? `${a.words.slice(0, 29)}…` : a.words}` : ""}`);
  } else if (a.op === "light") {
    spice.tool.light = a.tool;
    const patch = {};
    if (a.words !== undefined) Object.assign(patch, { words: a.words, look: a.words });
    for (const k of ["weather", "amount", "grade", "exposure", "saturation"]) if (a[k] !== undefined) patch[k] = a[k];
    setSet("light", patch);
    setDept("light");
    did.push(`Light: ${noun[a.tool]}`);
  } else if (a.op === "finish") {
    spice.tool.comp = a.tool;
    const patch = {};
    for (const k of ["height", "factor", "engine", "format"]) if (a[k] !== undefined) patch[k] = a[k];
    setSet("comp", patch);
    setDept("comp");
    did.push(`Comp: ${noun[a.tool]}`);
  }
  return { did, failed };
}

/** The key of the department open, as it stands: what a yes would run. */
const signature = (k) => JSON.stringify([spice.dept, spice.tool[spice.dept], k?.label, k?.cost, spice.shot?.body.set[spice.dept], spice.shot?.body.passes.plate?.media.url, spice.shot?.body.range]);

/** The bar's words, on Spice: Paprika reads the shot and sets the department up. */
export async function askSpice(text) {
  const words = text.trim();
  if (!words || chat.busy || !spice.shot) return;
  chat.messages.push({ role: "user", text: words });
  chat.busy = "Thinking";
  changed("assistant");
  try {
    const out = await post({ model: writer("assistant"), messages: chat.messages.filter((m) => !m.error).slice(-8).map(({ role, text, did }) => ({ role, text, did })), spice: summary() });
    const did = [];
    const failed = [];
    let go = false;
    for (const a of out.actions ?? []) {
      if (a.op === "run") go = true;
      else {
        chat.busy = "Setting it up";
        changed("assistant");
        const said = apply(a);
        did.push(...said.did);
        failed.push(...said.failed);
      }
    }
    const message = { role: "assistant", text: out.reply || (go ? "Ready when you are." : did.length ? "Done." : "Nothing to change."), did, failed };
    // running costs credits: it is only offered, with its price; the key under the answer is the user's yes
    if (go) {
      const key = runnerFor(spice.dept, spice.tool[spice.dept]);
      if (!key) failed.push("Nothing to run here");
      else if (!key.ready) failed.push(key.why);
      else {
        for (const m of chat.messages) if (m.confirm?.state === "asking") m.confirm.state = "stale";
        message.confirm = { state: "asking", label: key.label, cost: key.free ? "free" : typeof key.cost === "number" ? `≈ ${key.cost} cr` : "price at the run", sig: signature(key), dept: spice.dept, running: "Working", done: "Done: it is in the stack", failed: "It didn't finish" };
      }
    }
    chat.messages.push(message);
  } catch (e) {
    chat.messages.push({ role: "assistant", text: e.message, error: true });
  } finally {
    chat.busy = null;
    changed("assistant");
  }
}

/** The user's yes to running the key: it runs now, if it is still the department and the settings that were offered. */
export async function confirmSpice(message) {
  const c = message.confirm;
  if (c?.state !== "asking") return;
  const key = runnerFor(spice.dept, spice.tool[spice.dept]);
  if (!key?.ready || spice.dept !== c.dept || signature(key) !== c.sig) {
    c.state = "stale";
    toast("The shot changed since. Ask me again.");
    return changed("assistant");
  }
  c.state = "running";
  changed("assistant");
  try {
    const made = await key.run();
    c.state = made === null ? "failed" : "done";
  } catch (e) {
    c.state = "failed";
    toast(e.message, { tone: "crit" });
  }
  changed("assistant");
}
export function declineSpice(message) {
  if (message.confirm?.state !== "asking") return;
  message.confirm.state = "declined";
  changed("assistant");
}

export function clearSpiceChat() {
  chat.messages = [];
  changed("assistant");
}
