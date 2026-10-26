// Paprika, the baby chameleon who runs Spice. She is told the scenario and its shots, the shot open with its chain of passes, the tool
// picked and its words, what a run would cost, and answers with what to set up: a shot opened, a pass looked at, a tool picked and set,
// a new shot set up from words, and "run it". Setting up costs nothing, so it is done at once. Running costs credits: it waits in her
// answer for one yes from you, with its price, and nothing runs until you give it.
import { changed, toast, writer } from "./store.js";
import { registerSurface } from "./surfaces.js";
import { spice, body, shot, openShot, lookAt, setTool, creditsTodayAll, workingOn } from "./spice.js";
import { lookingAt, inputFor } from "./spice-model.js";
import { toolsSummary, plan, run } from "./spice-tools.js";
import { addSuggestion, guideSummary } from "./spice-guide.js";

/** Paprika's conversation: Spice's own, never mixed with another product's. */
export const chat = { messages: [], busy: null };

/** The room of the bar on Spice: the suite, always. */
export const roomOfSpice = () => "suite";

/** What she is told: the scenario, the shots, the shot open and its chain, the tools, the one picked, the key's price. */
export function summary() {
  const b = body();
  const s = shot();
  if (!b) return {};
  return {
    scenario: spice.scenario?.name,
    logline: b.logline,
    shots: b.shots.map((x) => ({ id: x.id, name: x.name, passes: x.passes.length, plate: !!x.plate })),
    shot: s ? { id: s.id, name: s.name, about: s.about, plate: s.plate ? { width: s.plate.width, height: s.plate.height, seconds: s.plate.seconds } : null, passes: s.passes.map((p) => ({ id: p.id, tool: p.tool, name: p.name, words: p.words, credits: p.credits })), looking: lookingAt(s)?.id ?? "plate", bin: s.bin.length } : null,
    ...toolsSummary(),
    ...guideSummary(),
    today: creditsTodayAll(),
    busy: b.shots.filter((x) => workingOn(x.id)).map((x) => x.name),
  };
}

async function post(payload) {
  const res = await fetch("api/spice/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `Request failed (${res.status})`);
  return out;
}

/** One action, made. Answers what to tell the user: what was done, and what could not be. */
export function apply(a) {
  const did = [];
  const failed = [];
  const b = body();
  if (!b) return { did, failed: ["No scenario is open"] };
  if (a.op === "open") {
    const s = b.shots.find((x) => x.id === a.shot);
    if (!s) failed.push("No such shot");
    else {
      openShot(a.shot);
      did.push(`Opened ${s.name}`);
    }
  } else if (a.op === "look") {
    const s = shot();
    if (!s) failed.push("No shot is open");
    else if (a.pass !== "plate" && !s.passes.some((p) => p.id === a.pass)) failed.push("No such pass");
    else {
      lookAt(a.pass);
      did.push(a.pass === "plate" ? "Looking at the plate" : `Looking at ${s.passes.find((p) => p.id === a.pass).name}`);
    }
  } else if (a.op === "tool") {
    const t = spice.tools?.tools.find((x) => x.id === a.tool);
    if (!t) failed.push("That tool is not in the suite");
    else {
      setTool({ tool: t.id, words: a.words ?? "", scene: a.scene ?? spice.set.scene, strength: a.strength ?? null, ...(a.size ? { size: a.size } : {}), seconds: a.seconds ?? null, ...(a.aspect ? { aspect: a.aspect } : {}), ...(a.height ? { height: a.height } : {}) });
      did.push(`${t.name}${a.words ? ` · ${a.words.length > 30 ? `${a.words.slice(0, 29)}…` : a.words}` : ""}`);
    }
  } else if (a.op === "chain") {
    // a chain she proposes: kept with the shot, shown in her bento with its price, run with one yes there
    if (!shot()?.plate) failed.push("No plate to run a chain on");
    else if (addSuggestion({ title: a.title, why: "", steps: a.steps })) did.push(`A chain, ${a.steps.length} passes: ${a.title} (on the right)`);
  } else if (a.op === "shot") {
    spice.roll = { ...spice.roll, ...(a.words ? { words: a.words } : {}), ...(a.seconds ? { seconds: a.seconds } : {}) };
    spice.win = "shot";
    changed("spice");
    did.push("A new shot set up: pick its first frame and roll it");
  }
  return { did, failed };
}

/** The key as it stands: what a yes would run. */
const signature = () => JSON.stringify([spice.set, shot()?.id, lookingAt(shot())?.id ?? "plate", inputFor(shot())?.url]);

/** The bar's words, on Spice: Paprika reads the scenario and sets the suite up. */
export async function askSpice(text) {
  const words = text.trim();
  if (!words || chat.busy || !spice.scenario) return;
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
      const p = plan();
      if (!p.tool) failed.push("Nothing to run: pick a tool");
      else if (p.why) failed.push(p.why);
      else {
        for (const m of chat.messages) if (m.confirm?.state === "asking") m.confirm.state = "stale";
        message.confirm = { state: "asking", label: p.tool.name, cost: typeof p.cost === "number" ? `≈ ${p.cost} cr` : "price at the run", sig: signature(), running: "Working", done: "Done: it is on the chain", failed: "It didn't finish" };
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

/** The user's yes to running the key: it runs now, if it is still the tool and the shot that were offered. */
export async function confirmSpice(message) {
  const c = message.confirm;
  if (c?.state !== "asking") return;
  const p = plan();
  if (p.why || signature() !== c.sig) {
    c.state = "stale";
    toast("The shot changed since. Ask me again.");
    return changed("assistant");
  }
  c.state = "running";
  changed("assistant");
  try {
    const made = await run();
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

// Paprika's bar: the bar (panels/assistant.js) takes it from here once this module has come with the page
registerSurface("spice", () => ({ product: "spice", room: roomOfSpice(), chat, ask: askSpice, clear: clearSpiceChat, confirm: confirmSpice, decline: declineSpice, role: "assistant" }));
