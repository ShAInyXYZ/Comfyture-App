// Crumpet, the baby beaver who builds Toaster's scenes. He is told the draft open as places on a floor in metres: every part with its kind
// (a shape, a piece of the Stage's library, a character in a pose), its colour, size, place (at [x, z], its bottom's height y) and turn, the
// camera and the render's words, and sees a photo when one is attached. He answers with what to build: a scene from a description or a
// photo, pieces brought and set down, moved, turned, sized and coloured, the camera placed, the words set. Building costs nothing, so it is
// done at once, as one step that Undo takes back; rendering costs credits (or GPU time): it waits in his answer for one yes, with its price.
// His brief and the reading of his answer are the server's (server/toaster-assist.ts).
import { changed, toast, writer } from "./store.js";
import { api } from "./api.js";
import {
  toaster, body, partsNow, editParts, select, setWords, setRatio, keepCamera, modelNow, hasClay, renderFrame, renderSheet, make3d, price3d, priceNow,
  setFocal, saveCamera, recallCamera, repose,
} from "./toaster.js";
import { tagsOf, cleanPart, newPart, newAssetPart, newCharacterPart, freeSpot, PALETTE, colorName, RATIOS, isAsset, isCharacter, roomOf, placeAgainst, placeNear, topOf } from "./toaster-model.js";

/** Crumpet's conversation: Toaster's own, never mixed with another product's. `pictures` is the photo waiting to go with the next words. */
export const chat = { messages: [], busy: null, pictures: [] };
/** What an @ can call in Crumpet's bar, and what each name stands for: filled by Toaster's page once it has a project open. */
export const tagHooks = { items: () => [], lookup: () => null };

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const hexOf = (name) => PALETTE.find(([, n]) => n === name)?.[0];

// ---------------------------------------------------------------- what he is told

/** A part as Crumpet reads it: its @tag, what it is, its colour by name, its size, where its footprint is on the floor, its bottom's height, its turn. */
function partOf(p, tags = new Map()) {
  const kind = isAsset(p) ? { kind: "piece", piece: p.asset } : isCharacter(p) ? { kind: "character", body: p.body, pose: p.pose, ...(p.params ? { tweak: p.params } : {}), ...(p.joints ? { edited: true } : {}) } : { kind: "shape", shape: p.shape };
  return {
    name: p.name,
    ...(tags.has(p.id) ? { tag: tags.get(p.id) } : {}),
    ...kind,
    color: colorName(p.color),
    ...(p.made ? { made: p.made } : {}),
    ...(p.refs?.length ? { pictures: p.refs.length } : {}),
    size: p.size.map(r2),
    at: [r2(p.pos[0]), r2(p.pos[2])],
    y: r2(p.pos[1] - p.size[1] / 2),
    turn: Math.round(p.rot[1]),
    ...(p.hidden ? { hidden: true } : {}),
  };
}

/** What he is told each time: the draft's parts, what is selected, the camera, the words, and what was toasted. */
export function summary() {
  const b = body();
  if (!b) return {};
  const cam = toaster.view?.cameraState() ?? b.camera ?? { position: [0, 0, 0], target: [0, 0, 0] };
  const tags = tagsOf(b.parts, b.refs.map((r) => r.name));
  return {
    draft: toaster.draft.name,
    parts: b.parts.map((p) => partOf(p, tags)),
    selected: b.parts.filter((p) => toaster.selected.includes(p.id)).map((p) => p.name),
    camera: { from: cam.position.map(r2), at: cam.target.map(r2), frame: b.ratio, focal: cam.focal ?? 50 },
    cameras: b.cameras.map((k) => ({ name: k.name, from: k.position.map(r2), at: k.target.map(r2), frame: k.ratio, focal: k.focal })),
    words: { what: b.what, scene: b.scene },
    renders: b.renders.filter((r) => r.status === "done").length,
    turnaround: b.sheets.some((s) => s.status === "done"),
    model3d: b.models.some((m) => m.status === "done"),
  };
}

// ---------------------------------------------------------------- what he does

/** The library and the characters, loaded (their sizes are what a new piece or character is made at). */
async function catalogue() {
  const m = await import("./toaster-assets.js");
  const lib = await m.loadLibrary();
  return { m, lib };
}

/**
 * His actions on the draft, made as one change (one Undo): a scene cleared, parts added, set, removed. Each part named in an action is found
 * by its name (one added earlier in the same answer too). Answers what to tell the user: what was done, and what could not be.
 */
async function build(actions) {
  const did = [];
  const failed = [];
  const needs = actions.some((a) => a.op === "add" && a.kind !== "shape") || actions.some((a) => a.op === "set" && (a.pose || a.tweak));
  // a figure's own box in its pose, its tweaks and its joints
  const measure = (q) => m.characterSize({ body: q.body, rig: q.rig, pose: q.pose, params: q.params, joints: q.joints });
  const { m, lib } = needs ? await catalogue() : {};
  const pieceOf = (type) => lib?.pieces.find((x) => x.type === type);
  const peopleOf = (body) => m?.characterList().people.find((x) => x.body === body);
  // what stands on the floor already, as footprints, for a part set down beside the others (the new ones counted as they come)
  const footprint = (p) => {
    const b = toaster.view && !p.fresh ? toaster.view.bounds([p.id]) : null;
    return b ? { min: [b.min[0], b.min[2]], max: [b.max[0], b.max[2]] } : { min: [p.pos[0] - p.size[0] / 2, p.pos[2] - p.size[2] / 2], max: [p.pos[0] + p.size[0] / 2, p.pos[2] + p.size[2] / 2] };
  };
  const placed = (p, a) => {
    // at [x, z] and the bottom's height y; no place said: beside what is there
    if (Array.isArray(a.at)) p.pos = [r3(a.at[0]), r3((a.y ?? 0) + p.size[1] / 2), r3(a.at[1])];
    else if (a.y !== undefined) p.pos = [p.pos[0], r3(a.y + p.size[1] / 2), p.pos[2]];
    if (a.turn !== undefined) p.rot = [p.rot[0], a.turn, p.rot[2]];
  };
  /**
   * The relations that place a part instead of numbers: on another (its bottom on that one's top), near another (on a side of it, facing it
   * unless turned), against a wall of the room (its back on the wall, facing in). Answers whether one placed it.
   */
  const related = (p, a, list, byName) => {
    const others = list.filter((q) => q !== p);
    const lift = (y) => r3((a.y ?? y) + p.size[1] / 2);
    if (a.on && byName(a.on) && byName(a.on) !== p) {
      const q = byName(a.on);
      const [x, z] = Array.isArray(a.at) ? a.at : [q.pos[0], q.pos[2]];
      p.pos = [r3(x), lift(topOf(q)), r3(z)];
      if (a.turn !== undefined) p.rot = [p.rot[0], a.turn, p.rot[2]];
      return true;
    }
    if (a.near && byName(a.near) && byName(a.near) !== p) {
      const { pos, turn } = placeNear(p, byName(a.near), a.side ?? "front", a.gap ?? 0.3, a.turn);
      p.pos = [pos[0], lift(0), pos[1]];
      p.rot = [p.rot[0], turn, p.rot[2]];
      return true;
    }
    if (a.against) {
      const along = Array.isArray(a.at) ? (a.against === "back" || a.against === "front" ? a.at[0] : a.at[1]) : undefined;
      const { pos, turn } = placeAgainst(p, a.against, roomOf(others), others, along);
      p.pos = [pos[0], lift(0), pos[1]];
      p.rot = [p.rot[0], turn, p.rot[2]];
      return true;
    }
    return false;
  };
  const sized = (p, a, own) => {
    if (Array.isArray(a.size)) p.size = a.size.map((v) => Math.max(0.01, r3(v)));
    else if (typeof a.scale === "number") p.size = own.map((v) => Math.max(0.01, r3(v * a.scale)));
  };
  const added = [];
  const faces = [];
  editParts((list) => {
    const byName = (n) => list.find((p) => p.name.toLowerCase() === String(n ?? "").toLowerCase());
    for (const a of actions) {
      if (a.op === "clear") {
        list.length = 0;
        did.push("Cleared the floor");
      } else if (a.op === "add") {
        let p = null;
        if (a.kind === "shape") p = newPart(a.shape, list);
        else if (a.kind === "piece") {
          const x = pieceOf(a.piece);
          if (!x) failed.push(`No ${a.piece} in the library`);
          else p = newAssetPart(x, list, { pieceOf });
        } else if (a.kind === "character") {
          const x = peopleOf(a.body);
          if (!x) failed.push(`No ${a.body} among the characters`);
          else {
            p = newCharacterPart(x, list, { pose: a.pose ?? "stand", size: m.characterSize({ body: a.body, pose: a.pose ?? "stand", params: a.tweak }) });
            if (a.tweak) p.params = { ...a.tweak };
          }
        }
        if (!p) continue;
        const own = [...p.size];
        if (a.name && !byName(a.name)) p.name = String(a.name).slice(0, 40);
        sized(p, a, own);
        // a piece and a character wear their colour ID: only a shape takes the colour he says
        if (a.color && hexOf(a.color) && a.kind === "shape") p.color = hexOf(a.color);
        if (a.made !== undefined) p.made = String(a.made).slice(0, 400);
        if (related(p, a, list, byName));
        else if (Array.isArray(a.at)) placed(p, a);
        else {
          const [x, z] = freeSpot([p.size[0], p.size[2]], list.filter((q) => !q.hidden).map(footprint), { near: [0, 0] });
          placed(p, { ...a, at: [x, z] });
        }
        if (a.face !== undefined) faces.push([p, a.face]);
        p.fresh = true;
        list.push(p);
        added.push(p);
        did.push(`Added ${p.name}`);
      } else if (a.op === "set") {
        const p = byName(a.part);
        if (!p) {
          failed.push(`No part called ${a.part}`);
          continue;
        }
        // a new pose or new tweaks are a new box: the figure keeps how it was stretched and its feet stay where they were
        if (isCharacter(p) && ((a.pose && a.pose !== p.pose) || a.tweak)) Object.assign(p, repose(p, { ...(a.pose ? { pose: a.pose } : {}), ...(a.tweak ? { params: a.tweak } : {}) }, measure));
        const bottom = p.pos[1] - p.size[1] / 2;
        sized(p, a, [...p.size]);
        // a new size keeps the bottom where it was, unless a height is said
        if (a.size || a.scale) p.pos = [p.pos[0], r3((a.y ?? bottom) + p.size[1] / 2), p.pos[2]];
        if (!related(p, a, list, byName)) placed(p, a.size || a.scale ? { ...a, y: a.y ?? bottom } : a);
        if (a.color && hexOf(a.color) && !isAsset(p) && !isCharacter(p)) p.color = hexOf(a.color);
        if (a.made !== undefined) p.made = String(a.made).slice(0, 400);
        if (a.hidden !== undefined) p.hidden = !!a.hidden;
        if (a.face !== undefined) faces.push([p, a.face]);
        if (a.name && !byName(a.name)) p.name = String(a.name).slice(0, 40);
        did.push(`Set ${p.name}`);
      } else if (a.op === "remove") {
        const p = byName(a.part);
        if (!p) failed.push(`No part called ${a.part}`);
        else {
          list.splice(list.indexOf(p), 1);
          did.push(`Removed ${p.name}`);
        }
      }
    }
    // what each part faces, once every part of the answer stands where it goes: the turn that points its front at it
    for (const [p, face] of faces) {
      const t = Array.isArray(face) ? face : (() => {
        const q = byName(face);
        return q ? [q.pos[0], q.pos[2]] : null;
      })();
      if (!t || (Math.abs(t[0] - p.pos[0]) < 1e-6 && Math.abs(t[1] - p.pos[2]) < 1e-6)) continue;
      p.rot = [p.rot[0], Math.round((Math.atan2(t[0] - p.pos[0], t[1] - p.pos[2]) * 180) / Math.PI), p.rot[2]];
    }
    for (const p of list) delete p.fresh;
    return list.map(cleanPart);
  });
  // what was brought is held, so the gizmo is on it
  if (added.length) select(added.map((p) => p.id).filter((id) => partsNow().some((q) => q.id === id)));
  return { did, failed };
}

/**
 * The camera on one side of a part (front, back, left or right, as seen facing it), on its axis at a height, looking at its middle, as far
 * as it takes for the part and `margin` times its size around it to fill the frame with the lens and the frame's ratio.
 */
function aimAt(p, { side = "front", height, margin = 1.8 } = {}) {
  const t = (p.rot[1] * Math.PI) / 180;
  const f = [Math.sin(t), Math.cos(t)];
  const r = [Math.cos(t), -Math.sin(t)];
  const u = side === "back" ? [-f[0], -f[1]] : side === "right" ? r : side === "left" ? [-r[0], -r[1]] : f;
  // what is across the frame (the part's width seen from this side) and its height, with room around them
  const across = (side === "left" || side === "right" ? p.size[2] : p.size[0]) * margin;
  const tall = Math.max(p.size[1], 0.5) * margin;
  const deep = (side === "left" || side === "right" ? p.size[0] : p.size[2]) / 2;
  const focal = toaster.view?.focal ?? 50;
  const tanY = 12 / focal;
  const ratio = RATIOS[body()?.ratio] ?? 1;
  const dist = Math.max(across / 2 / (tanY * ratio), tall / 2 / tanY) + deep;
  const mid = [p.pos[0], p.pos[1], p.pos[2]];
  const y = Number.isFinite(height) ? height : mid[1] + p.size[1] * 0.25;
  return { position: [r3(mid[0] + u[0] * dist), r3(y), r3(mid[2] + u[1] * dist)], target: [r3(mid[0]), r3(mid[1]), r3(mid[2])] };
}

/** The camera, the frame and the render's words: after the parts, so a view frames what was just built. */
function look(a) {
  const did = [];
  if (a.op === "camera") {
    if (a.slot && recallCamera(a.slot)) did.push(`Camera: ${a.slot}`);
    if (a.frame && a.frame in RATIOS) setRatio(a.frame);
    if (Number.isFinite(a.lens)) setFocal(a.lens);
    const subject = a.subject && partsNow().find((p) => p.name.toLowerCase() === String(a.subject).toLowerCase());
    if (toaster.view && subject) toaster.view.setCameraState(aimAt(subject, a));
    else if (toaster.view && Array.isArray(a.from) && Array.isArray(a.at)) toaster.view.setCameraState({ position: a.from, target: a.at });
    else if (toaster.view && a.view) toaster.view.view(a.view);
    keepCamera();
    if (!a.slot) did.push(a.view ? `Camera: ${a.view}` : "Camera placed");
    if (a.save && saveCamera(a.save)) did.push(`Kept as ${a.save}`);
  } else if (a.op === "words") {
    if (a.what !== undefined) setWords("what", a.what);
    if (a.scene !== undefined) setWords("scene", a.scene);
    did.push("Words set");
    changed("toaster");
  }
  return did;
}

// ---------------------------------------------------------------- the bar

async function post(payload) {
  const res = await fetch("api/toaster/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `Request failed (${res.status})`);
  return out;
}

/** What each offered run is: its key's words, its price, and what the bar says while it runs and once it is over. */
function offer(op) {
  const m = modelNow();
  const gpu = (c) => (c === 0 ? "GPU time" : typeof c === "number" ? `≈ ${c} cr` : "price at the run");
  if (op === "toast") return hasClay() && m ? { label: "Toast it", cost: m.router ? `≈ ${m.credits} cr` : "GPU time", running: "Toasting the frame", done: "Done: it is in Render", failed: "It didn't toast" } : null;
  if (op === "turnaround") return hasClay() && m ? { label: "Toast the turnaround", cost: m.router ? `≈ ${m.credits} cr` : "GPU time", running: "Toasting the four views", done: "Done: it is in Turnaround", failed: "It didn't toast" } : null;
  if (op === "model3d") return body()?.sheets.some((s) => s.status === "done") ? { label: "Make the 3D model", cost: gpu(priceNow()?.credits), running: "Making the 3D model", done: "Done: it is in 3D model", failed: "It didn't finish" } : null;
  return null;
}
const why = { toast: "Nothing to toast yet: build something first", turnaround: "Nothing to toast yet: build something first", model3d: "Toast a turnaround first: the model is made from it" };

/** The bar's words, on Toaster: Crumpet reads the draft (and the photo, when one is attached) and builds. */
export async function askToaster(text) {
  const words = text.trim();
  if (!words || chat.busy || !toaster.draft) return;
  const picture = chat.pictures[0] ?? null;
  chat.messages.push({ role: "user", text: words, ...(picture ? { picture } : {}) });
  chat.pictures = [];
  chat.busy = picture ? "Looking at the photo" : "Thinking";
  changed("assistant");
  if (!priceNow()) price3d();
  try {
    const out = await post({ model: writer("assistant"), messages: chat.messages.filter((m) => !m.error).slice(-8).map(({ role, text, did }) => ({ role, text, did })), toaster: summary(), ...(picture ? { picture: { file: picture.file } } : {}) });
    const actions = out.actions ?? [];
    const before = JSON.stringify(partsNow());
    chat.busy = "Building";
    changed("assistant");
    const parts = actions.filter((a) => ["clear", "add", "set", "remove"].includes(a.op));
    const { did, failed } = parts.length ? await build(parts) : { did: [], failed: [] };
    for (const a of actions.filter((x) => x.op === "camera" || x.op === "words")) did.push(...look(a));
    const message = { role: "assistant", text: out.reply || (did.length ? "Done." : "Nothing to change."), did, failed, toaster: true, ...(parts.length ? { undo: true, before } : {}) };
    // a render costs credits: it is only offered, with its price; the key under the answer is the user's yes
    const ask = actions.find((a) => ["toast", "turnaround", "model3d"].includes(a.op));
    if (ask) {
      const o = offer(ask.op);
      if (!o) failed.push(why[ask.op]);
      else {
        for (const m of chat.messages) if (m.confirm?.state === "asking") m.confirm.state = "stale";
        message.confirm = { state: "asking", op: ask.op, ...o };
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

/** The user's yes to what Crumpet offered: it runs now (a render, the turnaround, or the 3D model from the last turnaround). */
export async function confirmToaster(message) {
  const c = message.confirm;
  if (c?.state !== "asking") return;
  c.state = "running";
  changed("assistant");
  try {
    if (c.op === "toast") await renderFrame();
    else if (c.op === "turnaround") await renderSheet();
    else if (c.op === "model3d") await make3d(body().sheets.find((s) => s.status === "done")?.id);
    const b = body();
    const last = c.op === "toast" ? b.renders[0] : c.op === "turnaround" ? b.sheets[0] : b.models[0];
    c.state = last?.status === "failed" ? "failed" : "done";
  } catch (e) {
    c.state = "failed";
    toast(e.message, { tone: "crit" });
  }
  changed("assistant");
}
export function declineToaster(message) {
  if (message.confirm?.state !== "asking") return;
  message.confirm.state = "declined";
  changed("assistant");
}

/** His build taken back: the parts as they were before his answer (itself a step Undo can take back). */
export function undoToaster(message) {
  if (!message.before) return;
  const parts = JSON.parse(message.before);
  editParts(() => parts);
  message.undo = false;
  message.did = ["Undone"];
  changed("assistant");
}

export function clearToasterChat() {
  chat.messages = [];
  chat.pictures = [];
  changed("assistant");
}

// ---------------------------------------------------------------- the photo sent with the words

/** A photo from the computer (the first one: he looks at one at a time), kept in the Library and waiting on the bar. */
export async function addToasterPictures(files) {
  const file = [...files].find((f) => f.type?.startsWith("image/"));
  if (!file) return toast("Crumpet looks at a photo: a PNG, a JPEG or a WebP.", { tone: "warn" });
  chat.busy = "Bringing the photo";
  changed("assistant");
  try {
    const p = await api.upload(file, file.name);
    chat.pictures = [{ file: p.file, url: p.url, width: p.width, height: p.height, name: file.name }];
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    chat.busy = null;
    changed("assistant");
  }
}
/** A photo of the Library, waiting on the bar. */
export function addToasterPhoto(photo) {
  if (!photo?.file) return;
  chat.pictures = [{ file: photo.file, url: photo.url, width: photo.width, height: photo.height, name: photo.name ?? photo.file }];
  changed("assistant");
}
export function removeToasterPicture() {
  chat.pictures = [];
  changed("assistant");
}
