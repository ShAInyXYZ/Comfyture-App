// Utensils' tour: Truffle shows a newcomer around her shelf: Home, the Shelf and its books, one tool's workbench (Remove background, run
// for free on the sample picture Home is made with), what is kept, and the Library of official ComfyUI workflows. Nothing runs: the one
// run is played by simulate(), and its result is the sample's own "after", shown over the stage by the tour (nothing of the person's
// changes) and gone as soon as the tour moves on or ends.
import { h } from "../dom.js";
import { setWorkspace, pickTool, openLibrary, closeLibrary } from "../utensils.js";
import { compare } from "../utensils-bench.js";
import { simulate, onTour } from "../tour.js";

/** The pair Home's light table shows for Remove background (web/brand/utensils/home): a scene, and its subject on a clear background. */
const SAMPLE = "brand/utensils/home/pic-cutout";
const STAGE = '.ut-bench[data-tool="cutout"] .ut-stage';

// ---------------------------------------------------------------- the sample result, over the stage

let sample = null;
/** The bench's own before and after, laid over the stage while the tour is on it: the line can be dragged as on a real result. */
function showSample() {
  clearSample();
  const stage = document.querySelector(STAGE);
  if (!stage) return;
  const el = h("div.ut-stage", { style: { position: "fixed", zIndex: "1190", minHeight: "0", margin: "0" } },
    compare({ url: `${SAMPLE}-before.webp`, width: 1536, height: 1024 }, { url: `${SAMPLE}-after.webp`, width: 1536, height: 1024 }, true));
  document.body.append(el);
  const mine = { el, frame: 0 };
  sample = mine;
  // it stays on the stage as the page moves, and goes with it
  const follow = () => {
    if (sample !== mine) return;
    if (!stage.isConnected || !stage.getClientRects().length) return clearSample();
    const r = stage.getBoundingClientRect();
    Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    mine.frame = requestAnimationFrame(follow);
  };
  follow();
}
function clearSample() {
  if (!sample) return;
  cancelAnimationFrame(sample.frame);
  sample.el.remove();
  sample = null;
}
// (the tour ended, or another began: the sample goes)
onTour((product) => product !== "utensils" && clearSample());

// ---------------------------------------------------------------- the Library's card of a book

/**
 * A book of the Library's hall pointed at, as the pointer does: its card opens beside it. The first workflow in sight, once the hall has
 * them (a plain one: a mini app's or a partner's card says other things of its key and its cost).
 */
async function pointAtBook() {
  for (let i = 0; i < 40; i++) {
    if (document.querySelector(".lbx .lb-card.is-on")) return;
    const hall = document.querySelector(".lbx .lb-hall")?.getBoundingClientRect();
    const inSight = (b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.left >= hall.left && r.right <= hall.right && r.top >= hall.top && r.bottom <= hall.bottom;
    };
    const all = hall ? [...document.querySelectorAll(".lbx .lb-book")].filter(inSight) : [];
    const book = all.find((b) => !b.dataset.foil) ?? all[0];
    // (the hall keeps still a moment after it is laid out: a book pointed at then is asked again)
    book?.dispatchEvent(new PointerEvent("pointerenter", { pointerType: "mouse" }));
    await new Promise((r) => setTimeout(r, 150));
  }
}
/** The pointer leaves the hall: the card of the book pointed at closes (a scroll of the hall closes it at once, under a resting pointer too). */
function leaveBook() {
  document.querySelector(".lb-book.is-out")?.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
  document.querySelector(".lbx .lb-hall")?.dispatchEvent(new Event("scroll"));
}

// ---------------------------------------------------------------- where each step stands

const home = () => {
  clearSample();
  leaveBook();
  closeLibrary();
  setWorkspace("home");
  window.scrollTo({ top: 0 });
};
const shelf = () => {
  clearSample();
  leaveBook();
  closeLibrary();
  setWorkspace("shelf");
};
const tool = (keep = false) => {
  if (!keep) clearSample();
  leaveBook();
  closeLibrary();
  pickTool("cutout");
};
const library = () => {
  clearSample();
  leaveBook();
  openLibrary();
};

export default {
  title: "Utensils",
  steps: [
    {
      go: home,
      title: "One tool, one job",
      text: "Hi, I'm **Truffle**, the shelf keeper. Utensils is a shelf of small tools, each with one job: sharpen a picture, cut out its subject, add sound to a clip, split a song's stems. I'll show you around on samples: nothing is spent.",
    },
    {
      go: home,
      target: ".hp-ask",
      place: "bottom",
      title: "Say the job",
      text: "This is Home, where Utensils opens. Type a tool's name, or the job itself (\"remove the wind noise\"), and I find the tool; words that match nothing come to me. The keys under it open each workspace.",
    },
    {
      go: shelf,
      target: ".ut-tabs",
      place: "bottom",
      title: "The ledge",
      text: "Every workspace but Home has this ledge: **Home** and the **Shelf**, then Picture, Video, Audio, VFX and Edit in their colours with how many tools each holds, and the **Library** apart: it opens in front of everything.",
    },
    {
      go: shelf,
      target: '.usb-group[data-ws="picture"]',
      // (its brass plate hangs under the shelf's edge)
      pad: 18,
      place: "right",
      title: "The Shelf",
      text: "Every tool is a book here, in its workspace's colour: these four are Picture's. Point at a book to see what it does, click it to open the tool; the brass plate opens the whole workspace.",
    },
    {
      go: shelf,
      target: ".sd",
      place: "top",
      title: "From the shelf",
      text: "Four tools to try, picked at random from four workspaces: drag a before and after, play a clip, trim a strip. **Shuffle** deals four more, and **Try it** opens the tool.",
    },
    {
      go: () => tool(),
      target: ".ut-strip",
      place: "bottom",
      title: "A tool",
      text: "A book opens its tool in its workspace: here **Remove background**, lit among Picture's four. Its workbench is under it: the stage on the left, what it works on and its key on the right.",
    },
    {
      go: () => tool(),
      target: () => document.querySelector('.ut-bench[data-tool="cutout"] .ut-well')?.closest(".ut-control"),
      place: "left",
      title: "What it works on",
      text: "Click the well to pick a picture from your library, or drop or paste one anywhere on the page. It is shared: give a picture once, then upscale it, cut it out or vary it.",
    },
    {
      go: () => tool(),
      target: '.ut-bench[data-tool="cutout"]',
      place: "top",
      title: "Cut it out",
      text: "**Cut out** runs it, and the key says what it costs: credits on Comfy Cloud, none on your own GPU. Here I play it for free on a sample picture: drag the line to compare.",
      show: {
        label: "Cut it out, for free",
        run: async () => {
          clearSample();
          await simulate(document.querySelector(STAGE), { label: "Cutting out the subject", seconds: 2.4 });
          showSample();
        },
      },
    },
    {
      go: () => tool(true),
      target: ".ut-status",
      place: "left",
      title: "Kept for you",
      text: "Everything a tool makes is kept, newest first: in its **History** under the stage, and up here with what is running and what today cost. Click it for the queue and the latest results.",
    },
    {
      go: library,
      target: ".lbx .lb-bar",
      place: "bottom",
      title: "The Library",
      text: "Every official ComfyUI workflow, a book each, in a bookcase per kind, a maker's books together. Search a job (\"make my photo move\"), a model or a maker, or narrow it by bookcase and maker.",
    },
    {
      go: async () => (library(), await pointAtBook()),
      target: () => document.querySelector(".lbx .lb-card.is-on"),
      title: "A workflow",
      text: "Point at a book and its card says what it does and how, what it takes and gives, its models and its cost. **Open it** shows its form; nothing runs on Comfy Cloud until you confirm the price.",
    },
    {
      go: shelf,
      target: "#utensils-chat .chat-bar",
      place: "top",
      title: "Ask me",
      text: "Tell me the job (\"upscale a video, then add sound\") and I answer with a recipe: its tools and workflows in order, lit on the shelves, each with why and its price. Open a step and I coach you through it.",
    },
    {
      go: home,
      title: "Your turn",
      text: "Pick a book on the **Shelf**, or tell me the job in my bar and I'll find the tool for it. Whatever you make stays on my shelf, newest first.",
    },
  ],
};
