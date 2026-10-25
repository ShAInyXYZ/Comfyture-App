// Paprika, the baby chameleon who is the AI editor of Spice's bay. She is told the shot open (its brief and clip, what each of the seven stages
// has made), the stage open with the engines it offers, what is set up and what stands in the way, and what a run would cost; she answers with
// what to set up: a stage opened, an engine picked, words put, an input pointed, the PLAN of the whole edit, Conform run (free). Setting up costs
// nothing, so it is done at once. Running costs credits (or time): it waits in her answer for one yes from you, with its price.
import { changed, toast, writer } from "./store.js";
import { registerSurface } from "./surfaces.js";
import { bay, edit, setStage, pickEngine, setText, setSource, chosen, enginesOfStage, priceNow, pricing, problems, run, conform, workingOn } from "./bay.js";
import { STAGES, STAGE_IDS, passOf, ledger, creditsOnDay, withPlan, inputInfo, blocked, stageOf, engineOf } from "./spice2-model.js";

/** Paprika's conversation: Spice's own, never mixed with another product's. */
export const chat = { messages: [], busy: null };

/** The room of the bar on Spice: the stage that is open. */
export const roomOfBay = () => bay.stage;

/** What she is told: the shot, its clip, what each stage has made, the stage open with its engines, the form, the price. */
export function summary() {
  const s = bay.shot;
  if (!s) return {};
  const b = s.body;
  const info = inputInfo(b, bay.stage);
  const clip = b.clip?.media;
  const { engines } = enginesOfStage(bay.stage);
  const eng = chosen(bay.stage);
  const f = bay.form[bay.stage];
  const spent = ledger(b).byStage;
  return {
    stage: bay.stage,
    shot: s.name,
    shots: bay.list.length,
    brief: b.brief,
    clip: clip ? { seconds: info.seconds || clip.seconds, width: clip.width, height: clip.height, fps: b.clip.fps } : null,
    stages: STAGES.map((st) => ({ id: st.id, takes: b.stages[st.id].takes.length, pass: passOf(b, st.id)?.title ?? undefined, spent: spent[st.id] || undefined })),
    engines: engines.slice(0, 24).map((e) => ({ name: e.name, title: e.title, mode: e.mode, max: e.max, partner: !!e.partner, about: e.about, needs: e.needs })),
    chosen: eng?.name,
    words: f.text,
    refs: f.refs.length,
    problems: problems(bay.stage).map((p) => p.text),
    price: eng ? priceNow(bay.stage) : undefined,
    today: creditsOnDay([b, ...bay.list.filter((x) => x.id !== s.id).map((x) => ({ log: x.info?.log ?? [] }))]),
    busy: STAGE_IDS.filter((id) => workingOn(id)),
    plan: b.plan.map((p) => ({ stage: p.stage, engine: p.engine })),
  };
}

async function post(body) {
  const res = await fetch("api/bay/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `Request failed (${res.status})`);
  return out;
}

/** One action, made. Answers what to tell the user: what was done, and what could not be. */
export async function apply(a) {
  const did = [];
  const failed = [];
  const name = (id) => stageOf(id)?.name ?? id;
  if (a.op === "open") {
    setStage(a.stage);
    did.push(`Opened ${name(a.stage)}`);
  } else if (a.op === "engine") {
    setStage(a.stage);
    pickEngine(a.stage, a.engine);
    did.push(`${name(a.stage)}: ${engineOf(a.engine)?.title ?? a.engine}`);
  } else if (a.op === "words") {
    setStage(a.stage);
    setText(a.stage, a.text);
    changed("spice");
    did.push(`Words for ${name(a.stage)}`);
  } else if (a.op === "source") {
    setSource(a.stage, a.from);
    did.push(`${name(a.stage)} works from ${a.from === "clip" ? "the footage" : `${name(a.from)}'s pass`}`);
  } else if (a.op === "plan") {
    edit((b) => withPlan(b, a.steps));
    did.push(`Plan: ${a.steps.map((x) => name(x.stage)).join(" → ")}`);
  } else if (a.op === "conform") {
    if (!bay.shot.body.clip) failed.push("No clip to conform yet");
    else {
      setStage("conform");
      conform();
      did.push("Conforming the clip");
    }
  }
  return { did, failed };
}

const signature = () => JSON.stringify([bay.stage, chosen(bay.stage)?.name, bay.form[bay.stage].text, bay.form[bay.stage].refs.length, bay.shot?.body.clip?.media.url, priceNow(bay.stage)]);

/** The bar's words, on Spice: Paprika reads the shot and sets the stage up. */
export async function askBay(text) {
  const words = text.trim();
  if (!words || chat.busy || !bay.shot) return;
  chat.messages.push({ role: "user", text: words });
  chat.busy = "Thinking";
  changed("assistant");
  try {
    const out = await post({ model: writer("assistant"), messages: chat.messages.filter((m) => !m.error).slice(-8).map(({ role, text, did }) => ({ role, text, did })), bay: summary() });
    const did = [];
    const failed = [];
    let go = false;
    for (const a of out.actions ?? []) {
      if (a.op === "run") go = true;
      else {
        chat.busy = "Setting it up";
        changed("assistant");
        const said = await apply(a);
        did.push(...said.did);
        failed.push(...said.failed);
      }
    }
    const message = { role: "assistant", text: out.reply || (go ? "Ready when you are." : did.length ? "Done." : "Nothing to change."), did, failed };
    // running costs credits: it is only offered, with its price; the key under the answer is the user's yes
    if (go) {
      const eng = chosen(bay.stage);
      const ps = problems(bay.stage);
      if (!eng) failed.push("Nothing to run here: pick an engine");
      else if (blocked(ps)) failed.push(ps.find((p) => p.level === "stop").text);
      else {
        for (const m of chat.messages) if (m.confirm?.state === "asking") m.confirm.state = "stale";
        // (a partner's price is the runner's estimate: asked, and waited for, so the yes is to a price)
        await pricing(bay.stage);
        const price = priceNow(bay.stage);
        message.confirm = { state: "asking", label: `Run ${eng.title}`, cost: price === 0 ? "free" : typeof price === "number" ? `≈ ${price} cr` : "price at the run", sig: signature(), dept: bay.stage, running: "Working", done: "Done: it is a take", failed: "It didn't finish" };
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

/** The user's yes to running the key: it runs now, if it is still the stage and the settings that were offered. */
export async function confirmBay(message) {
  const c = message.confirm;
  if (c?.state !== "asking") return;
  if (bay.stage !== c.dept || signature() !== c.sig) {
    c.state = "stale";
    toast("The shot changed since. Ask me again.");
    return changed("assistant");
  }
  c.state = "running";
  changed("assistant");
  try {
    const made = await (bay.stage === "conform" ? conform() : run(bay.stage));
    c.state = made === null ? "failed" : "done";
  } catch (e) {
    c.state = "failed";
    toast(e.message, { tone: "crit" });
  }
  changed("assistant");
}
export function declineBay(message) {
  if (message.confirm?.state !== "asking") return;
  message.confirm.state = "declined";
  changed("assistant");
}

export function clearBayChat() {
  chat.messages = [];
  changed("assistant");
}

// Paprika's bar: the bar (panels/assistant.js) takes it from here once this module has come with the page
registerSurface("spice", () => ({ product: "spice", room: roomOfBay(), chat, ask: askBay, clear: clearBayChat, confirm: confirmBay, decline: declineBay, role: "assistant" }));
