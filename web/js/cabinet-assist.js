// Canelle, the baby squirrel who is Cabinet's stylist. She is told the shoot (who is in it, how each is dressed and posed, the style,
// the frame and backdrop, what a press would cost) and our cast, and answers with how to set it up: the cast, each one's outfits and
// poses, the style, the frame, the notes, and "shoot". Setting up costs nothing, so it is done at once. Shooting costs credits: it waits
// in her answer for one yes from you, with its price, and nothing is pictured until you give it.
import { changed, toast, writer } from "./store.js";
import { registerSurface } from "./surfaces.js";
import { CHARACTERS } from "./characters.js";
import { cabinet, whoOf, priceNow, modelNow, setCast, setLook, set, shootNow } from "./cabinet.js";
import { wardrobeItem, poseItem, styleItem, FORMATS, BACKDROPS } from "./cabinet-shelf.js";

/** Canelle's conversation: Cabinet's own, never mixed with another product's. */
export const chat = { messages: [], busy: null };

/** A place of the shoot as she names it: one of our characters by id, or "picture-n" for someone brought in from a picture. */
const idOf = (m, i) => (m.who?.kind === "character" ? m.who.id : m.who ? `picture-${i + 1}` : "");
const shelfIds = (keys) => keys.filter((k) => k.startsWith("shelf:")).map((k) => k.slice(6));

/** What she is told: the shoot, our cast (and whoever was brought in from a picture), the price of a press. */
export function summary() {
  const b = cabinet.shoot?.body;
  if (!b) return {};
  const m = modelNow();
  const pictures = b.cast.flatMap((x, i) => (x.who?.kind === "photo" ? [{ id: `picture-${i + 1}`, name: x.who.name || "Them", role: "brought in from a picture", look: "" }] : []));
  return {
    current: { shootId: cabinet.shoot.id, shoot: cabinet.shoot.name, active: b.active + 1 },
    characters: [...pictures, ...CHARACTERS.map((c) => ({ id: c.id, name: c.name, role: c.role, look: c.look }))],
    cast: b.cast.map((x, i) => ({ who: x.who ? `${idOf(x, i)} (${whoOf(x)?.name})` : "", outfits: shelfIds(x.outfits), poses: shelfIds(x.poses) })),
    active: b.active,
    format: b.format,
    backdrop: b.backdrop,
    style: b.style,
    notes: b.notes,
    model: m?.short ?? m?.name,
    price: priceNow(),
    pictures: b.pictures.length,
  };
}

async function post(payload) {
  const res = await fetch("api/cabinet/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `Request failed (${res.status})`);
  return out;
}

/** One action, made. Answers what to tell the user: what was done, and what could not be. */
export function apply(a) {
  const did = [];
  const failed = [];
  const b = cabinet.shoot?.body;
  if (!b) return { did, failed: ["No shoot is open"] };
  if (a.op === "cast") {
    setCast(a.characters);
    did.push(`Cast: ${b.cast.map((x) => whoOf(x)?.name ?? "?").join(", ")}`);
  } else if (a.op === "dress") {
    const m = b.cast[a.character - 1];
    if (!m) failed.push(`No character ${a.character}`);
    else {
      setLook(a.character - 1, a.outfits, a.poses);
      const said = [...shelfIds(m.outfits).map((id) => wardrobeItem(id)?.name), ...shelfIds(m.poses).map((id) => poseItem(id)?.name)].filter(Boolean);
      did.push(`${whoOf(m)?.name ?? `Character ${a.character}`}: ${said.join(" · ") || "their own look"}`);
    }
  } else if (a.op === "style") {
    set("style", a.style ?? null);
    did.push(`Style: ${styleItem(a.style)?.name ?? "as they are"}`);
  } else if (a.op === "frame") {
    if (a.format) set("format", a.format);
    if (a.backdrop) set("backdrop", a.backdrop);
    did.push([a.format && FORMATS[a.format]?.name, a.backdrop && BACKDROPS[a.backdrop]?.name].filter(Boolean).join(" · "));
  } else if (a.op === "notes") {
    set("notes", a.notes);
    changed("cabinet");
    did.push("Notes written");
  }
  return { did, failed };
}

/** The shoot as it stands: what a yes would picture. */
const signature = () => {
  const b = cabinet.shoot?.body;
  return JSON.stringify([cabinet.shoot?.id, b?.cast, b?.format, b?.backdrop, b?.style, b?.notes, modelNow()?.id]);
};

/** The bar's words, on Cabinet: Canelle reads the shoot and sets it up. */
export async function askCabinet(text) {
  const words = text.trim();
  if (!words || chat.busy || !cabinet.shoot) return;
  chat.messages.push({ role: "user", text: words });
  chat.busy = "Thinking";
  changed("assistant");
  try {
    const out = await post({ model: writer("assistant"), messages: chat.messages.filter((m) => !m.error).slice(-8).map(({ role, text, did }) => ({ role, text, did })), cabinet: summary() });
    const did = [];
    const failed = [];
    let go = false;
    for (const a of out.actions ?? []) {
      if (a.op === "shoot") go = true;
      else {
        chat.busy = "Dressing them";
        changed("assistant");
        const said = apply(a);
        did.push(...said.did);
        failed.push(...said.failed);
      }
    }
    const message = { role: "assistant", text: out.reply || (go ? "Ready when you are." : did.length ? "Done." : "Nothing to change."), did, failed };
    // shooting costs credits: it is only offered, with its price; the key under the answer is the user's yes
    if (go) {
      const p = priceNow();
      if (p.blocked) failed.push(p.blocked);
      else if (!p.pictures) failed.push("Nothing to shoot yet");
      else {
        for (const m of chat.messages) if (m.confirm?.state === "asking") m.confirm.state = "stale";
        message.confirm = { state: "asking", label: p.pictures === 1 ? "Shoot" : `Shoot ${p.pictures}`, cost: typeof p.credits === "number" ? `≈ ${p.credits} cr` : "GPU time", sig: signature(), running: "Shooting", done: "Done: in the mirror", failed: "It didn't start" };
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

/** The user's yes to shooting: it shoots now, if the shoot is still the one that was offered. */
export async function confirmCabinet(message) {
  const c = message.confirm;
  if (c?.state !== "asking") return;
  if (signature() !== c.sig) {
    c.state = "stale";
    toast("The shoot changed since. Ask me again.");
    return changed("assistant");
  }
  c.state = "running";
  changed("assistant");
  try {
    await shootNow();
    c.state = "done";
  } catch (e) {
    c.state = "failed";
    toast(e.message, { tone: "crit" });
  }
  changed("assistant");
}
export function declineCabinet(message) {
  if (message.confirm?.state !== "asking") return;
  message.confirm.state = "declined";
  changed("assistant");
}

export function clearCabinetChat() {
  chat.messages = [];
  changed("assistant");
}

// Canelle's bar: the bar (panels/assistant.js) takes it from here once this module has come with the page
registerSurface("cabinet", () => ({ product: "cabinet", room: "cabinet", chat, ask: askCabinet, clear: clearCabinetChat, confirm: confirmCabinet, decline: declineCabinet, role: "assistant" }));
