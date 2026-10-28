// Praline, the cat who runs Mixer's trend shelf. She is told the shelf, the crew, your stars, the trend open
// and who plays its roles, and your saved mixes, and answers with picks: a trend opened, a role given or
// swapped, a mix opened, and "Make it". The picks cost nothing, so they are made at once. Make it costs
// credits: it waits in her answer for one yes from you, with its price, and nothing is made until you give it.
import { changed, toast, writer } from "./store.js";
import { registerSurface } from "./surfaces.js";
import { TRENDS, CREW, trendById, crewById } from "./mixer-trends.js";
import { mixer, loadMixes, openMix } from "./mixer.js";
import { pick, stars, loadStars, castOf, selectTrend, setRole, swapRole, makeTrend, making, estimate } from "./mixer-trend.js";

/** Praline's conversation: Mixer's own, never mixed with another product's. */
export const chat = { messages: [], busy: null };

// Mixer's own trends: those at home on its shelf, and the few shown there as well as on Jam's
const shelf = () => TRENDS.filter((t) => t.home === "mixer" || t.also?.includes("mixer"));
// an edit dropped in to be remixed takes the place of the trend on screen
const remixing = () => !!mixer.mix?.body?.edit || mixer.splitting;
const whoName = (who) => (who?.crew ? crewById(who.crew)?.name ?? who.crew : `star ${who?.star?.name ?? "?"}`);
const costOf = (t) => {
  if (t.engine === "official-template") return t.billing === "partner" ? "Comfy Cloud · partner credits (estimate unavailable)" : "Comfy Cloud · GPU time";
  const credits = estimate(t);
  return typeof credits === "number" ? `≈ ${credits} cr` : "your GPU";
};
// what Make it would make: the trend and who plays each of its roles
const signature = (t) => `${t.id}|${castOf(t).map((c) => `${c.role}:${c.who.crew ?? c.who.star?.file}`).join(",")}`;

/** What she is told: the shelf, the crew, your stars, the trend open and its cast, and your saved mixes. */
export function summary() {
  const t = trendById(pick.trend);
  const out = remixing();
  return {
    shelf: shelf().map((x) => ({ id: x.id, name: x.name, kind: x.kind, seconds: x.seconds, heat: x.heat, roles: x.cast.map((c) => ({ role: c.role, crew: c.crew })) })),
    crew: CREW.map(({ id, name, role, kind }) => ({ id, name, role, kind })),
    stars: stars.list.map((s) => s.name),
    open: t && !out ? { trend: t.id, cast: castOf(t).map((c) => ({ role: c.role, who: whoName(c.who) })), role: pick.role, cost: estimate(t) } : null,
    making: making(),
    remixing: out,
    mixes: mixer.list.slice(0, 20).map(({ id, name }) => ({ id, name })),
  };
}

async function post(body) {
  const res = await fetch("api/mixer/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `Request failed (${res.status})`);
  return out;
}

/** One pick, made. Answers what to tell the user: what was done, or why it could not be. */
async function run(a) {
  switch (a.op) {
    case "pick_trend": {
      const t = shelf().find((x) => x.id === a.trend);
      if (!t) return { failed: "No such trend" };
      selectTrend(t.id);
      return { did: `Opened ${t.name}` };
    }
    case "give_role":
    case "swap_role": {
      if (remixing()) return { failed: "A remix is open: pick a trend first" };
      const slot = castOf().find((c) => c.role === a.role);
      if (!slot) return { failed: `No ${a.role} in this trend` };
      if (a.op === "swap_role") {
        swapRole(slot.role);
        return { did: `${slot.role}: ${whoName(castOf().find((c) => c.role === slot.role)?.who)}` };
      }
      const star = a.star ? stars.list.find((s) => s.name.toLowerCase() === a.star.toLowerCase()) : null;
      const who = a.crew && crewById(a.crew) ? { crew: a.crew } : star ? { star } : null;
      if (!who) return { failed: `Nobody called ${a.crew ?? a.star}` };
      setRole(slot.role, who);
      return { did: `${slot.role}: ${whoName(who)}` };
    }
    case "open_mix": {
      const row = mixer.list.find((x) => x.id === a.mix);
      if (!row) return { failed: "No such mix" };
      await openMix(row.id);
      // a trend's mix brings its trend and who played in it back, as the screen's own list does
      const t = mixer.mix?.body?.trend;
      if (mixer.mix?.body?.kind === "trend" && t) {
        pick.trend = t.id;
        pick.cast = { trend: t.id, roles: structuredClone(t.cast) };
      }
      changed("mixer");
      return { did: `Opened ${row.name}` };
    }
  }
  return {};
}

/** The bar's words, in Mixer: Praline reads the shelf and makes the picks. */
export async function askMixer(text) {
  const words = text.trim();
  if (!words || chat.busy) return;
  chat.messages.push({ role: "user", text: words });
  chat.busy = "Thinking";
  changed("assistant");
  try {
    // the screen loads the lists as it opens: she is told them once they are in
    await Promise.all([loadMixes(), loadStars()]);
    const out = await post({ model: writer("assistant"), messages: chat.messages.filter((m) => !m.error).slice(-8).map(({ role, text, did }) => ({ role, text, did })), mixer: summary() });
    const did = [];
    const failed = [];
    let make = false;
    for (const a of out.actions ?? []) {
      if (a.op === "make_it") make = true;
      else {
        const said = await run(a);
        if (said.did) did.push(said.did);
        if (said.failed) failed.push(said.failed);
      }
    }
    const message = { role: "assistant", text: out.reply || (make ? "Ready when you are." : did.length ? "Done." : "Nothing to change."), did, failed };
    // Make it costs credits: it is only offered, with its price; the key under the answer is the user's yes
    if (make) {
      const t = trendById(pick.trend);
      if (!t || remixing()) failed.push("Pick a trend first");
      else if (making()) failed.push("Already making one");
      else {
        for (const m of chat.messages) if (m.confirm?.state === "asking") m.confirm.state = "stale";
        message.confirm = { state: "asking", label: "Make it", cost: costOf(t), sig: signature(t), running: "Making it", done: "Made: it is in Mixer", failed: "It didn't finish: the mix is kept in My mixes" };
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

/** The user's yes to Make it: made now, if it is still the trend and the cast that were offered. */
export async function confirmMixer(message) {
  const c = message.confirm;
  if (c?.state !== "asking") return;
  const t = trendById(pick.trend);
  if (!t || remixing() || making() || signature(t) !== c.sig) {
    c.state = "stale";
    toast("The trend or its cast changed since. Ask me again.");
    return changed("assistant");
  }
  c.state = "running";
  changed("assistant");
  try {
    await makeTrend();
    const m = mixer.mix?.body;
    c.state = m?.kind === "trend" && m.trend?.id === t.id && m.film ? "done" : "failed";
  } catch (e) {
    c.state = "failed";
    toast(e.message, { tone: "crit" });
  }
  changed("assistant");
}
export function declineMixer(message) {
  if (message.confirm?.state !== "asking") return;
  message.confirm.state = "declined";
  changed("assistant");
}

export function clearMixerChat() {
  chat.messages = [];
  changed("assistant");
}

// Praline's bar: the bar (panels/assistant.js) takes it from here once this module has come with the page
registerSurface("mixer", () => ({ product: "mixer", chat, ask: askMixer, clear: clearMixerChat, confirm: confirmMixer, decline: declineMixer, role: "assistant" }));
