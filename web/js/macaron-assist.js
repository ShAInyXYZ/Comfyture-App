// Brioche, the baby bunny who runs Macaron. She works in the workspace that is open, and is told only what is
// in it: in Design idea the brief, the directions and the story; in Brand kit the palette, the logos, the type,
// the voice and the rules; in the Studio the product and the pictures; in Create the design open, the others, the week and
// the motion; in the Brand book the designs it gathers. She answers with
// actions of that workspace, made here as one step back; what takes time (a new picture) follows once they are done.
// What each workspace is, its actions and what she is told of it are defined once, in brioche/space-*.js (read by the
// server too); the page's side of each workspace is brioche/run-*.js (what she is told of it, and how each action is made).
// This file is what they share: the base she is told, the asking, the step back, and the dispatch of an action to its workspace.
import { changed, writer } from "./store.js";
import { registerSurface } from "./surfaces.js";
import { macaron, kitNow, postJson, batch, undo, setSpace, SPACES } from "./macaron.js";
import { WORKSPACES } from "./macaron-harness.js";
import { SPACES as ROOMS, opsOf } from "./brioche/harness.js";
import * as kitRun from "./brioche/run-kit.js";
import * as ideaRun from "./brioche/run-idea.js";
import * as studioRun from "./brioche/run-studio.js";
import * as createRun from "./brioche/run-create.js";
import * as bookRun from "./brioche/run-book.js";

/** The page's side of each workspace: what she is told of it beyond the base, and how each of its actions is made. */
const ROOM_RUN = { kit: kitRun, idea: ideaRun, studio: studioRun, create: createRun, book: bookRun };

/** What she is told: the workspace open and what is in it, nothing of the others. */
export function summary(space = macaron.space) {
  const b = macaron.brand;
  const kit = kitNow();
  const base = {
    name: b.name,
    space,
    kit: { about: b.body.kit.about, tagline: kit.tagline, palette: kit.palette.map(({ id, name, hex, role, share }) => ({ id, name, hex, role, share })), type: kit.type, logos: kit.logos.map(({ id, kind, tone, ground }) => ({ id, kind, tone, ground })), voice: kit.voice },
  };
  return { ...base, ...(ROOM_RUN[space] ?? createRun).summary() };
}

/** The harness and the page must list the same actions: a workspace's spec without a handler here, or a handler without a spec, is an error. */
function checkParity() {
  for (const space of ROOMS) {
    const ops = opsOf(space).filter((op) => op !== "open_space");
    const handlers = Object.keys(ROOM_RUN[space]?.RUN ?? {});
    for (const op of ops) if (!handlers.includes(op)) console.error(`Brioche: ${space} has the action ${op} in its spec but no handler in run-${space}.js`);
    for (const op of handlers) if (!ops.includes(op)) console.error(`Brioche: ${space} has a handler for ${op} in run-${space}.js but no action in its spec`);
  }
}
// (after the modules are all loaded: they import each other)
setTimeout(checkParity, 0);

/** One action, made. Answers what to tell the user; pushes what takes time onto later. */
export function run(a, later) {
  if (a.op === "open_space") {
    if (!SPACES.includes(a.space)) return null;
    setSpace(a.space);
    return `Opened ${WORKSPACES.find((w) => w.id === a.space).name}`;
  }
  // the action must belong to the workspace that is open (the server keeps to this too; the page does not trust it)
  const space = macaron.space;
  if (!opsOf(space).includes(a.op)) return null;
  return ROOM_RUN[space]?.RUN[a.op]?.(a, later) ?? null;
}

// the tool a key of her panel asked through: its id rides with the words it sent, once (the bar sends them as typed)
let armed = null;
export function armPreset(id, text) {
  armed = { id, text: text.trim() };
  setTimeout(() => armed?.text === text.trim() && (armed = null), 2000);
}

/** The bar's words, in Macaron: Brioche reads the project and makes the changes. */
export async function askMacaron(text, { preset } = {}) {
  const words = text.trim();
  const chat = macaron.chat;
  const brand = macaron.brand;
  if (armed && armed.text === words) preset ??= armed.id;
  armed = null;
  if (!words || chat.busy || !brand) return;
  chat.messages.push({ role: "user", text: words });
  chat.busy = "Thinking";
  changed("assistant");
  try {
    const space = macaron.space;
    const out = await postJson("api/macaron/assist", "POST", { model: writer(), messages: chat.messages.slice(-8), brand: summary(space), space, ...(preset ? { preset } : {}) });
    // her answer is for the brand it was asked in: if another is open now, it is not made there
    if (macaron.brand !== brand) return;
    const later = [];
    const did = [];
    await batch(() => {
      for (const a of out.actions ?? []) {
        const said = run(a, later);
        if (said) did.push(said);
      }
    }, "Brioche");
    chat.messages.push({ role: "assistant", text: out.reply || (did.length ? "Done." : "Nothing to change."), did, undo: did.length > 0, macaron: true });
    chat.busy = later.length ? "Making a picture" : null;
    changed("assistant", "macaron");
    for (const job of later) {
      try {
        await job();
      } catch (e) {
        chat.messages.push({ role: "assistant", text: e.message, error: true, macaron: true });
      }
    }
  } catch (e) {
    // (a call that did not get through is not told as "fetch failed": a plain sentence, the original in its tooltip)
    const lost = /fetch failed|failed to fetch|networkerror|network request|econn|socket hang up|other side closed|terminated|timed? ?out/i.test(String(e?.message ?? e));
    chat.messages.push({ role: "assistant", text: lost ? "I could not reach my writer. Try again." : e.message, ...(lost ? { detail: String(e?.message ?? e) } : {}), error: true, macaron: true });
  } finally {
    chat.busy = null;
    changed("assistant", "macaron");
  }
}

/** Takes back what a message of hers did: the one step it was. */
export function undoMacaron(message) {
  undo();
  message.did = ["Undone"];
  message.undo = false;
  changed("assistant", "macaron");
}
export function clearMacaronChat() {
  macaron.chat.messages = [];
  changed("assistant");
}

// Brioche's bar: the bar (panels/assistant.js) takes it from here once this module has come with the page
registerSurface("macaron", () => ({ product: "macaron", chat: macaron.chat, ask: askMacaron, clear: clearMacaronChat, role: "writer" }), { undo: undoMacaron });
