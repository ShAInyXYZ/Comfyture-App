// Spice's state: the shots kept on the server (data/spice-shots, one file each, the way Jam keeps its videos), the one open, the
// department open, what is working. A shot is the footage and the passes the six departments made of it (spice-model.js holds the rules).
// Every change to the open shot is kept a moment after the last one (a save for each shot, so changing A and then B keeps both).
import { changed, toast } from "./store.js";
import { keyedSaver } from "./saving.js";
import { DEPARTMENTS } from "./spice-harness.js";
import { FIRST, blankBody, normaliseBody, passOf, logCredits, creditsToday, nextName } from "./spice-model.js";

const KIND = "spice-shots";
const OPEN = "comfyture.spice.open";
const DEPT = "comfyture.spice.dept";

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
  /** the shots, newest first: { id, name, thumb, updatedAt, info } */
  list: [],
  /** the shot open: { id, name, body } */
  shot: null,
  dept: DEPARTMENTS.includes(read(DEPT)) ? read(DEPT) : "plate",
  ready: null,
  /** what is working, by shot and department ("shot:dept"): { label, progress } */
  busy: new Map(),
  /** the frame the viewer is on (a slate number) and whether it plays */
  frame: FIRST,
  playing: false,
  /** the window open over the page: { id, ... } (spice-win.js) */
  win: null,
  /** the key waiting for its yes: { id, until } (a paid run asks for the person's yes first) */
  armed: null,
  /** a tool that wants the viewer's pointer: null, "points" (Roto), "mask" (Paint) */
  pointer: null,
  /** the bento whose key a department's yellow key stands for, where it has several (Light, Comp): what Paprika set up */
  tool: { light: "relight", comp: "export" },
};
const update = () => changed("spice");

const call = async (path, init) => {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
};
const send = (path, method, body) => call(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });

// ---------------------------------------------------------------- the shots kept on the server

/** Reads the shots (once) and opens the one that was open, else the newest; a first visit starts a shot, so the page is never empty. */
export function loadShots() {
  return (spice.ready ??= (async () => {
    try {
      spice.list = (await call(`api/${KIND}`))[KIND] ?? [];
      const id = spice.list.find((s) => s.id === read(OPEN))?.id ?? spice.list[0]?.id;
      if (id) await openShot(id);
      else await newShot();
    } catch (e) {
      console.warn("spice:", e.message);
    }
    update();
  })());
}

export async function openShot(id) {
  // what the one open has not yet had kept is kept before another is read
  await flushShots();
  const { project } = await call(`api/${KIND}/${id}`);
  spice.shot = { id: project.id, name: project.name, body: normaliseBody(project.body) };
  write(OPEN, id);
  spice.frame = FIRST;
  spice.playing = false;
  update();
}

export async function newShot(name) {
  await flushShots();
  const { project } = await send(`api/${KIND}`, "POST", { name: name || nextName(spice.list), body: blankBody() });
  spice.list = [{ id: project.id, name: project.name, updatedAt: project.updatedAt, info: {} }, ...spice.list];
  spice.shot = { id: project.id, name: project.name, body: normaliseBody(project.body) };
  write(OPEN, project.id);
  spice.frame = FIRST;
  spice.dept = "plate";
  update();
  return spice.shot;
}

const keep = async (id, shot) => {
  const thumb = shot.body.passes.plate?.still ?? undefined;
  await send(`api/${KIND}/${id}`, "PUT", { name: shot.name, body: shot.body, ...(thumb ? { thumb } : {}) })
    .then(() => {
      const row = spice.list.find((x) => x.id === id);
      if (row) Object.assign(row, { name: shot.name, thumb, updatedAt: new Date().toISOString() });
    })
    .catch((e) => toast(e.message, { tone: "crit" }));
};
const saver = keyedSaver(500, keep);
export const flushShots = () => saver.flush();
export function save(shot = spice.shot) {
  if (shot) saver.save(shot.id, shot);
}

export async function removeShot(id) {
  saver.drop(id);
  const out = await call(`api/${KIND}/${id}`, { method: "DELETE" });
  spice.list = out[KIND] ?? [];
  if (spice.shot?.id === id) {
    spice.shot = null;
    if (spice.list[0]) await openShot(spice.list[0].id);
    else await newShot();
  }
  update();
}

export function rename(name) {
  if (!spice.shot) return;
  spice.shot.name = String(name).slice(0, 60);
  save();
  update();
}

// ---------------------------------------------------------------- the open shot

export const body = () => spice.shot?.body ?? null;

/** Changes the open shot: fn(body) edits it in place; it is kept and the page drawn again. A shot that was left meanwhile still gets its change. */
export function edit(fn, shot = spice.shot) {
  if (!shot) return;
  fn(shot.body);
  save(shot);
  update();
}

/** Changes a setting of a department quietly (a slider being dragged): kept, the page not drawn again under the pointer. */
export function setQuietly(dept, patch, shot = spice.shot) {
  if (!shot) return;
  Object.assign(shot.body.set[dept], patch);
  save(shot);
}
export function setSet(dept, patch, shot = spice.shot) {
  edit((b) => Object.assign(b.set[dept], patch), shot);
}

export function setDept(id) {
  if (!DEPARTMENTS.includes(id) || spice.dept === id) return;
  spice.dept = id;
  spice.pointer = null;
  spice.armed = null;
  write(DEPT, id);
  update();
}

export function setFrame(frame) {
  spice.frame = Math.round(frame);
  changed("spice-frame");
}

/** A department's eye: whether its pass shows in the viewer's comp. */
export function toggleEye(dept) {
  edit((b) => {
    const p = passOf(b, dept);
    if (p) p.eye = p.eye === false;
  });
}

/** A department's pass made: the media kept as its pass, with what it cost; the department is no longer working. */
export function setPass(dept, media, { from, to, note, credits = 0, label, source } = {}, shot = spice.shot) {
  edit((b) => {
    const eye = passOf(b, dept)?.eye;
    const pass = { media, eye: eye ?? true, from, to, note, credits, at: new Date().toISOString(), source };
    if (dept === "depth") b.depth = pass;
    else b.passes[dept] = { ...(b.passes[dept] ?? {}), ...pass };
    if (credits > 0) logCredits(b, { dept, label: label ?? note ?? dept, credits });
  }, shot);
}

/** A pass taken away (its media stays in the library). */
export function clearPass(dept) {
  edit((b) => {
    if (dept === "depth") b.depth = null;
    else if (dept === "plate") b.passes.plate = null;
    else b.passes[dept] = null;
  });
}

/** What was spent today, in credits, on every shot. */
export function creditsTodayAll() {
  const open = spice.shot;
  const logs = spice.list.filter((s) => s.id !== open?.id).map((s) => s.info?.log ?? []);
  return creditsToday([...logs, open?.body.log ?? []]);
}

/** A department's work as the panel shows it, for the shot open: working, with its progress ({ label, progress }), or null. */
export const workingOn = (dept) => spice.busy.get(`${spice.shot?.id}:${dept}`) ?? null;
/** Marks a department of a shot as working (a state), or as done (null): the shot it was asked for, which may no longer be the open one. */
export function setBusy(dept, state, shotId = spice.shot?.id) {
  const k = `${shotId}:${dept}`;
  state ? spice.busy.set(k, state) : spice.busy.delete(k);
  changed("spice");
}
