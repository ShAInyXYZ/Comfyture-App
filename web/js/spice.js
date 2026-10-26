// Spice's state: the scenarios kept on the server (data/spice-scenarios, one file each), the one open, the shot open in it, what is
// working. A scenario is a few shots, each a plate and the chain of passes the suite's tools made on it (spice-model.js holds the rules).
// Every change to the open scenario is kept a moment after the last one.
import { changed, toast } from "./store.js";
import { keyedSaver } from "./saving.js";
import { FIRST, blankBody, normaliseBody, nextScenarioName, nextShotName, openShotOf, shotIn, lookingAt, inputFor, putBack as putBackTake, takeOff as takeOffPass, forget as forgetTake, logCredits, creditsToday, newId, framesIn } from "./spice-model.js";

const KIND = "spice-scenarios";
/** a clip another product hands over (Utensils' VFX: "Open in Spice"), waiting in the session until Spice is drawn */
const PENDING = "comfyture.spice.pending";
const OPEN = "comfyture.spice.open";

const read = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

export const spice = {
  /** the scenarios, newest first: { id, name, thumb, updatedAt, info } */
  list: [],
  /** the scenario open: { id, name, body } */
  scenario: null,
  ready: null,
  /** what is working, by scenario and shot ("scenario:shot"): { label, progress } */
  busy: new Map(),
  /** the frame the viewer is on (a slate number) and whether it plays */
  frame: FIRST,
  playing: false,
  /** the window open over the page: its id (spice-win.js) */
  win: null,
  /** the key waiting for its yes: { id, until } (a paid run asks for the person's yes first) */
  armed: null,
  /** the suite's tools, read from the server once: { scene, families, tools } */
  tools: null,
  /** the tool picked and how it is set up (what Paprika sets up too) */
  set: { tool: "", words: "", scene: "", strength: null, size: "draft", seconds: null, aspect: 2.39, height: 1080 },
  /** a new shot being set up (the Add a shot window): its first frame, words and seconds */
  roll: { frame: null, words: "", seconds: 5, name: "" },
};
const update = () => changed("spice");

const call = async (path, init) => {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
};
const send = (path, method, body) => call(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });

// ---------------------------------------------------------------- the scenarios kept on the server

/** Reads the scenarios (once) and opens the one that was open, else the newest; a first visit starts one, so the page is never empty. */
export function loadScenarios() {
  return (spice.ready ??= (async () => {
    try {
      spice.list = (await call(`api/${KIND}`))[KIND] ?? [];
      const id = spice.list.find((s) => s.id === read(OPEN))?.id ?? spice.list[0]?.id;
      if (id) await openScenario(id);
      else await newScenario();
    } catch (e) {
      console.warn("spice:", e.message);
    }
    update();
  })());
}

/**
 * A clip of the library sent to Spice from another product: it becomes a new shot of the scenario open (Spice opens on it). Without a
 * clip, Spice simply opens. `media` is { url, file, width, height, seconds } of a clip kept in the library of clips (a picture is a first frame).
 */
export function sendToSpice(media, name) {
  if (media?.file) {
    try {
      sessionStorage.setItem(PENDING, JSON.stringify({ media, name }));
    } catch {}
  }
  location.hash = "#/spice";
}
let taking = false;
export const hasPending = () => {
  try {
    return !!sessionStorage.getItem(PENDING);
  } catch {
    return false;
  }
};
/** The clip handed over, made a new shot (once: it leaves the session as it is taken); a picture is the first frame of a shot to roll. */
export async function takePending() {
  if (taking) return;
  taking = true;
  try {
    let p = null;
    try {
      p = JSON.parse(sessionStorage.getItem(PENDING) || "null");
      sessionStorage.removeItem(PENDING);
    } catch {}
    if (!p?.media?.file) return;
    await loadScenarios();
    const m = p.media;
    if (m.kind === "image") {
      spice.roll = { frame: { kind: "image", url: m.url, file: m.file, width: m.width, height: m.height }, words: "", seconds: 5, name: p.name ? String(p.name).slice(0, 40) : "" };
      spice.win = "shot";
      return update();
    }
    addShot({ name: p.name ? String(p.name).slice(0, 40) : undefined, plate: { kind: "video", url: m.url, file: m.file, width: m.width, height: m.height, seconds: m.seconds ?? m.duration ?? 0, still: m.still } });
  } finally {
    taking = false;
  }
}

export async function openScenario(id) {
  await flush();
  const { project } = await call(`api/${KIND}/${id}`);
  spice.scenario = { id: project.id, name: project.name, body: normaliseBody(project.body) };
  write(OPEN, id);
  spice.frame = FIRST;
  spice.playing = false;
  update();
}

export async function newScenario(name) {
  await flush();
  const { project } = await send(`api/${KIND}`, "POST", { name: name || nextScenarioName(spice.list), body: blankBody() });
  spice.list = [{ id: project.id, name: project.name, updatedAt: project.updatedAt, info: {} }, ...spice.list];
  spice.scenario = { id: project.id, name: project.name, body: blankBody() };
  write(OPEN, project.id);
  spice.frame = FIRST;
  update();
  return spice.scenario;
}

const keep = async (id, scenario) => {
  const thumb = scenario.body.shots[0]?.plate?.still ?? undefined;
  await send(`api/${KIND}/${id}`, "PUT", { name: scenario.name, body: scenario.body, ...(thumb ? { thumb } : {}) })
    .then(() => {
      const row = spice.list.find((x) => x.id === id);
      if (row) Object.assign(row, { name: scenario.name, thumb, updatedAt: new Date().toISOString() });
    })
    .catch((e) => toast(e.message, { tone: "crit" }));
};
const saver = keyedSaver(500, keep);
export const flush = () => saver.flush();
let looking = 0;
export function save(scenario = spice.scenario) {
  if (scenario && !looking) saver.save(scenario.id, scenario);
}
/**
 * A look at a change (the tour's "Show me"): fn changes the open scenario, the page shows it, and nothing is kept; when fn ends the shots
 * are as they were, the same objects, and nothing was sent to the server (an example shipped with the app stays as it was shipped).
 */
export async function look(fn) {
  const sc = spice.scenario;
  if (!sc) return;
  await flush();
  const was = { shots: sc.body.shots.map((s) => ({ ...s })), open: sc.body.open };
  looking++;
  try {
    await fn();
  } finally {
    looking--;
    sc.body.shots = was.shots;
    sc.body.open = was.open;
    update();
  }
}

export async function removeScenario(id) {
  saver.drop(id);
  const out = await call(`api/${KIND}/${id}`, { method: "DELETE" });
  spice.list = out[KIND] ?? [];
  if (spice.scenario?.id === id) {
    spice.scenario = null;
    if (spice.list[0]) await openScenario(spice.list[0].id);
    else await newScenario();
  }
  update();
}

export function rename(name) {
  if (!spice.scenario) return;
  spice.scenario.name = String(name).slice(0, 60);
  save();
  update();
}

// ---------------------------------------------------------------- the scenario open

export const body = () => spice.scenario?.body ?? null;
/** The shot open: the one the scenario says, else its first. */
export const shot = () => openShotOf(body());
/** The pass the viewer looks at (null for the plate), and the clip a run goes on. */
export const looking_ = () => lookingAt(shot());
export const inputOf = () => inputFor(shot());

/** Changes the open scenario: fn(body) edits it in place; it is kept and the page drawn again. A scenario left meanwhile still gets its change. */
export function edit(fn, scenario = spice.scenario) {
  if (!scenario) return;
  fn(scenario.body);
  save(scenario);
  update();
}
/** Changes the tool's setup quietly (a slider being dragged, words being typed): not kept with the scenario, the page not drawn again. */
export function setQuietly(patch) {
  Object.assign(spice.set, patch);
}
export function setTool(patch) {
  Object.assign(spice.set, patch);
  spice.armed = null;
  update();
}

export function openShot(id) {
  const b = body();
  if (!b || !shotIn(b, id) || b.open === id) return;
  edit((x) => (x.open = id));
  spice.frame = FIRST;
  spice.playing = false;
  spice.armed = null;
}

/** A new shot of the scenario, opened: its plate (a clip of the library), or none yet (a frame to roll). */
export function addShot({ name, plate = null, made = null, about = "" } = {}) {
  const b = body();
  if (!b) return null;
  const s = { id: newId("sh"), name: name || nextShotName(b.shots), about, plate, fps: 24, passes: [], bin: [], made, sel: "plate" };
  edit((x) => {
    x.shots = [...x.shots, s];
    x.open = s.id;
  });
  spice.frame = FIRST;
  return s;
}
export function removeShot(id) {
  edit((b) => {
    b.shots = b.shots.filter((s) => s.id !== id);
    if (b.open === id) b.open = b.shots[0]?.id ?? null;
  });
}
export function renameShot(id, name) {
  edit((b) => {
    const s = shotIn(b, id);
    if (s) s.name = String(name).slice(0, 40);
  });
}
/** The plate of the shot open (a clip brought in, or one LTX-2.5 rolled). */
export function setPlate(media, made = null) {
  edit((b) => {
    const s = openShotOf(b);
    if (!s) return;
    s.plate = media;
    if (made) s.made = made;
    s.passes = [];
    s.bin = [];
    s.sel = "plate";
  });
  spice.frame = FIRST;
}

/** The viewer looks at a pass of the shot open (its id), or at the plate. */
export function lookAt(passId) {
  edit((b) => {
    const s = openShotOf(b);
    if (s) s.sel = passId;
  });
  spice.playing = false;
}

/**
 * A pass made: appended on the pass looked at. One made in the middle of the chain branches it: the passes that were on top go to the
 * bin, where they can be put back (the chain is then rebuilt to where they were made).
 */
export function addPass(shotId, pass) {
  const sc = spice.scenario;
  edit((b) => {
    const s = shotIn(b, shotId);
    if (!s) return;
    const on = s.passes.find((p) => p.id === pass.on);
    const at = on ? s.passes.indexOf(on) : -1;
    const off = s.passes.slice(at + 1);
    s.bin = [...s.bin, ...off];
    s.passes = [...s.passes.slice(0, at + 1), pass];
    s.sel = pass.id;
    if (pass.credits > 0) logCredits(b, { shot: shotId, tool: pass.tool, label: pass.name, credits: pass.credits });
  }, sc);
}
export function takeOff(passId) {
  edit((b) => {
    const s = openShotOf(b);
    if (s) takeOffPass(s, passId);
  });
}
export function putBack(takeId) {
  edit((b) => {
    const s = openShotOf(b);
    if (s && !putBackTake(s, takeId)) toast("That take was made on a pass that is gone: it stays in the bin.");
  });
}
export function forget(takeId) {
  edit((b) => {
    const s = openShotOf(b);
    if (s) forgetTake(s, takeId);
  });
}

export function setFrame(frame) {
  spice.frame = Math.round(frame);
  changed("spice-frame");
}

/** What was spent today, in credits, on every scenario. */
export function creditsTodayAll() {
  const open = spice.scenario;
  const day = new Date().toISOString().slice(0, 10);
  const others = spice.list.filter((s) => s.id !== open?.id).reduce((n, s) => n + (s.info?.log ?? []).filter((e) => e.at?.startsWith(day)).reduce((m, e) => m + (e.credits || 0), 0), 0);
  return Math.round(((open ? creditsToday(open.body) : 0) + others) * 100) / 100;
}

/** What is working on a shot of the scenario open: { label, progress }, or null. */
export const workingOn = (shotId) => spice.busy.get(`${spice.scenario?.id}:${shotId}`) ?? null;
export function setBusy(shotId, state, scenarioId = spice.scenario?.id) {
  const k = `${scenarioId}:${shotId}`;
  if (state) spice.busy.set(k, state);
  else spice.busy.delete(k);
  update();
}

export { FIRST, framesIn };
