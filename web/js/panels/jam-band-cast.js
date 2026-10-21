// The line-up of the band: the lead (the jam's artist: jam.js keeps it) and up to two supporting performers beside them, each
// with a role. The data and the words that put them in a frame are in ../jam-band-model.js; this is what changes them.
// A change to who is in the scenes draws the looks and the shots again, as a new artist does: what was made for the old
// line-up is not kept. Nothing here costs credits.
import { changed, toast } from "../store.js";
import { api } from "../api.js";
import { onServer } from "../picker.js";
import { crewById, crewPicture } from "../mixer-trends.js";
import { jam, newJam, save, plan, syncEdit } from "../jam.js";
import { MAX_BAND, SUPPORT, castOf } from "../jam-band-model.js";

/** The looks and the shots made for the old line-up are put away: they are drawn again when the video is made. */
function again(b) {
  b.looks = {};
  for (const s of b.shots ?? []) {
    s.run = null;
    delete s.clip;
  }
  b.film = null;
}
const kept = (j) => (save(j), changed("jam"));

/** A supporting performer in the line-up: one of the crew (`crew`) or a picture already on the server (`file`, `url`). */
export async function addPerformer({ crew, picture, role }) {
  const j = jam.jam ?? (await newJam());
  const b = j.body;
  const band = (b.band ??= []);
  if (castOf(b).length >= MAX_BAND) return toast("The stage is full: two performers beside the lead.");
  try {
    const c = crew ? crewById(crew) : null;
    const p = c ? await onServer(crewPicture(c.id), c.name) : picture;
    if (!p) return;
    const taken = new Set(band.map((x) => x.role));
    band.push({ file: p.file, url: p.url, name: c?.name ?? p.name ?? "Guest", ...(c ? { crew: c.id } : {}), role: role ?? SUPPORT.find((r) => !taken.has(r)) ?? SUPPORT[0], show: true });
    again(b);
    kept(j);
    return band.length - 1;
  } catch (e) {
    toast(e.message, { tone: "crit" });
  }
}

/** A supporting performer's picture from the computer, kept on the server and put in the line-up. */
export async function addPerformerFile(file) {
  try {
    const p = await api.upload(file, file.name);
    return addPerformer({ picture: { ...p, name: (file.name ?? "").replace(/\.\w+$/, "").replace(/[-_]+/g, " ").slice(0, 24) || "Guest" } });
  } catch (e) {
    toast(e.message, { tone: "crit" });
  }
}

/** Someone else in the slot: the same place in the line-up, a new face (the role stays). */
export async function swapPerformer(i, { crew, picture }) {
  const j = jam.jam;
  const old = j?.body.band?.[i];
  if (!old) return;
  try {
    const c = crew ? crewById(crew) : null;
    const p = c ? await onServer(crewPicture(c.id), c.name) : picture;
    if (!p) return;
    j.body.band[i] = { file: p.file, url: p.url, name: c?.name ?? p.name ?? "Guest", ...(c ? { crew: c.id } : {}), role: old.role, show: old.show !== false };
    again(j.body);
    kept(j);
  } catch (e) {
    toast(e.message, { tone: "crit" });
  }
}

export function setRole(i, role) {
  const j = jam.jam;
  const p = j?.body.band?.[i];
  if (!p || !SUPPORT.includes(role) || p.role === role) return;
  p.role = role;
  again(j.body);
  kept(j);
}

export function setShown(i, on) {
  const j = jam.jam;
  const p = j?.body.band?.[i];
  if (!p || (p.show !== false) === !!on) return;
  p.show = !!on;
  again(j.body);
  kept(j);
}

export function removePerformer(i) {
  const j = jam.jam;
  if (!j?.body.band?.[i]) return;
  j.body.band.splice(i, 1);
  again(j.body);
  kept(j);
}

/** Whether the sung parts are performance shots, the lips following the vocals (the lead's lip-sync). */
export const lipsyncOn = (b) => b?.lipsync !== false;
export function setLipsync(on) {
  const j = jam.jam;
  if (!j || lipsyncOn(j.body) === !!on) return;
  j.body.lipsync = !!on;
  // the shots are planned again: the sung ones are performances, or not; what is kept where nothing changed stays
  plan(j);
  kept(j);
  syncEdit(j, { lines: false, beats: false });
}
