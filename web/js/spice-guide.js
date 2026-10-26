// Paprika's guide to a shot: she looks at one frame of it (api/spice/read), says what it is and what looks off, asks what you want, and
// proposes chains of passes, each a few tools in order with their words and a price. A chain runs with one yes: its passes are made one
// on the other, each kept on the shot's chain as any run is. A chain she answers in the bar with (spice-assist.js) comes here too.
import { h } from "./dom.js";
import { changed, toast, writer } from "./store.js";
import { spice, shot, edit, setTool, workingOn } from "./spice.js";
import { shotIn, priceOf, readOf, boxWords } from "./spice-model.js";
import { toolOf, run, plan } from "./spice-tools.js";
import { primary, ghost, spicon, fill } from "./spice-ui.js";

const reading = new Set();

/** Paprika reads the shot open: one frame goes to her, her read and her chains are kept with the shot. */
export async function readShot() {
  const s = shot();
  if (!s?.plate || s.plate.kind !== "video" || reading.has(s.id)) return;
  reading.add(s.id);
  changed("spice");
  try {
    const res = await fetch("api/spice/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ video: s.plate.file, name: s.name, about: s.about, words: s.made?.words ?? "", model: writer("assistant") }) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error ?? `Request failed (${res.status})`);
    const read = readOf(out);
    if (!read) throw new Error("Paprika had nothing to say of it.");
    edit((b) => {
      const x = shotIn(b, s.id);
      if (x) x.read = read;
    });
  } catch (e) {
    toast(e.message, { tone: "crit" });
  } finally {
    reading.delete(s.id);
    changed("spice");
  }
}

/** A chain of Paprika's added to the shot's suggestions (what she answered in the bar). */
export function addSuggestion(chain) {
  const s = shot();
  if (!s) return false;
  edit((b) => {
    const x = shotIn(b, s.id);
    if (!x) return;
    x.read ??= { at: new Date().toISOString(), text: "", off: "", question: "", suggestions: [] };
    x.read.suggestions = [chain, ...x.read.suggestions].slice(0, 6);
  });
  return true;
}

/** About what a chain costs: each step's tool at its size on the shot's seconds. */
export function chainCost(steps, s = shot()) {
  const seconds = Math.min(10, Math.max(1, Math.round(s?.plate?.seconds ?? 5)));
  let n = 0;
  for (const st of steps) {
    const c = priceOf(toolOf(st.tool), { seconds, size: st.size ?? "draft" });
    if (typeof c !== "number") return null;
    n += c;
  }
  return n;
}
/** The tool picked and set up as a step says. */
export const setUpStep = (st) => setTool({ tool: st.tool, words: st.words ?? "", strength: null, seconds: null, size: st.size ?? "draft", region: st.region ?? null, ...(st.aspect ? { aspect: st.aspect } : {}) });

/** The chain run with the person's one yes: each step on the pass the one before made; it stops at the first that fails, saying why. */
export async function runChain(steps) {
  for (const [i, st] of steps.entries()) {
    const t = toolOf(st.tool);
    if (!t) continue;
    setUpStep(st);
    const stopped = (why) => {
      toast(`The chain stopped at step ${i + 1}, ${t.name}: ${why.replace(/\.$/, "")}${i + 1 < steps.length ? "; the rest was not run" : ""}.`, { tone: "crit" });
      return null;
    };
    const why = plan().why;
    if (why) return stopped(why);
    try {
      if (!(await run({ rethrow: true }))) return stopped("nothing was made");
    } catch (e) {
      return stopped(e.message || "the run did not finish");
    }
  }
  return true;
}

const stepName = (st) => toolOf(st.tool)?.name ?? st.tool;

/** The body of the PAPRIKA bento: her read of the shot open, her question, her chains with their price and keys. */
export function guideBody() {
  const s = shot();
  if (!s) return h("p.sp-hint", {}, "Add a shot and I'll have a look at it.");
  if (!s.plate) return h("p.sp-hint", {}, "Roll the shot, or drop a clip, and I'll have a look at it.");
  const busy = reading.has(s.id);
  const working = !!workingOn(s.id);
  const r = s.read;
  const key = primary({ id: "spice:read", label: r ? "Read it again" : "Paprika, have a look", cost: "", working: busy, disabled: busy || s.plate.kind !== "video", title: "Paprika looks at a frame of the shot and proposes what to do with it (her words: no render, nothing spent)", run: readShot });
  if (!r) return h("div.sp-guide", {}, h("p.sp-hint", {}, "I look at a frame of the shot, say what I see and what looks off, and propose a few chains of passes. Then tell me what you want of it."), h("div.sp-tool-key", {}, key));
  const p = plan();
  const canRun = !!s.plate && s.plate.kind === "video" && !working;
  return h("div.sp-guide", {},
    h("p.sp-read", {}, r.text),
    r.off ? h("p.sp-read-off", {}, spicon("sparkle"), h("span", {}, r.off)) : null,
    ...r.suggestions.map((c, i) => {
      const cost = chainCost(c.steps, s);
      return h("div.sp-chain-card", {},
        h("div.sp-chain-head", {}, h("b", {}, c.title), c.why ? h("span", {}, c.why) : null),
        h("div.sp-chain-steps", {}, ...c.steps.map((st, j) => h("span.sp-step", { title: [stepName(st), st.words, st.region ? boxWords(st.region) : "", st.aspect ? `widened to ${st.aspect}` : ""].filter(Boolean).join(": ") }, h("i", {}, String(j + 1)), stepName(st)))),
        h("div.sp-chain-keys", {},
          primary({ id: `spice:chain:${i}`, label: "Run it", cost, working, disabled: !canRun || (!!p.why && /tools|shot|plate|clip/.test(p.why)), title: canRun ? `The ${c.steps.length} ${c.steps.length === 1 ? "pass" : "passes, one on the other, each"} kept on the chain, with one yes` : "Nothing to run on yet", run: () => runChain(c.steps) }),
          ghost("Step by step", () => setUpStep(c.steps[0]), { icon: spicon("chev"), title: "The first step set up on the tool card: run it yourself, then the next" })));
    }),
    r.question ? h("p.sp-read-q", {}, r.question, " ", h("button.sp-link-ask", { type: "button", on: { click: () => document.querySelector("#assistant .composer textarea, #assistant textarea")?.focus() } }, "Tell me in the bar.")) : null,
    h("div.sp-keys", {}, ghost(r ? "Read it again" : "Have a look", readShot, { icon: spicon("loop"), disabled: busy })));
}

/** What Paprika is told of her own read, for the bar: whether she read the shot, and the chains she proposed. */
export function guideSummary() {
  const s = shot();
  return { read: !!s?.read, chains: s?.read?.suggestions.map((c) => ({ title: c.title, steps: c.steps.map((st) => st.tool) })) ?? [] };
}

/** The PAPRIKA bento, drawn with the suite. */
export function guidePart() {
  const body = h("div.sp-b-body");
  return { body, update: () => fill(body, guideBody()), sig: () => JSON.stringify([shot()?.id, shot()?.read, [...reading]]) };
}
