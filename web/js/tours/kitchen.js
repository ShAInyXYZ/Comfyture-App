// Kitchen's tour: Ketkout shows a newcomer around the studio, from its home (the film in a sentence, the projects) through its rooms in
// the order a film is made: Story, Stage, Shot, Cut and the Library. It runs on what Kitchen ships (examples/stage/: the example stages,
// each with its renders) and on the edits the Cut already holds, so nothing is spent: the Stage's render is played for free with the
// stage's own picture.
import { state, setProject } from "../store.js";
import { go } from "../router.js";
import { loadStories } from "../story.js";
import { cut, loadCuts, openCut } from "../cut.js";
import { align } from "../project.js";
import { mountStage } from "../panels/stage.js";
import { simulate } from "../tour.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (ok, ms = 4000) => {
  for (let t = 0; t < ms && !ok(); t += 100) await sleep(100);
};
const drawn = (sel) => !!document.querySelector(sel)?.getClientRects().length;
/** Once a page that draws itself anew (Kitchen's home, when its projects come) has stopped: a light on an element it replaced would go out. */
async function steady(sel, ms = 400, max = 2500) {
  let el = document.querySelector(sel);
  for (let since = Date.now(), start = since; Date.now() - since < ms && Date.now() - start < max; ) {
    await sleep(100);
    if (document.querySelector(sel) !== el) (el = document.querySelector(sel)), (since = Date.now());
  }
}
/** One of Kitchen's rooms (its home is "kitchen"), once it is on screen and the open project has put its own work in it. */
async function room(page, sel) {
  go(page);
  await until(() => document.body.dataset.page === page);
  await align();
  await until(() => drawn(sel));
}
/** The page scrolled so an element is where the step wants it ("center", "end"), or a little under the top of the screen ("top"). */
function into(sel, block = "center") {
  const el = document.querySelector(sel);
  if (block === "top") scrollTo({ top: Math.max(0, scrollY + (el?.getBoundingClientRect().top ?? 0) - 16) });
  else el?.scrollIntoView({ block, inline: "nearest" });
}

async function home() {
  const moved = document.body.dataset.page !== "kitchen";
  await room("kitchen", ".home-prompt");
  if (moved) await steady("#page-kitchen .home");
  scrollTo({ top: 0 });
}

/**
 * Story. A first visit makes an empty story and goes into it as a new project, where every other room would then make its own empty
 * stage, shot and edit: the tour keeps the project it started in, so the rooms after it show the examples. (The Stage is mounted first,
 * so it opens on its own the stage it would have.)
 */
async function story() {
  await mountStage().then((api) => api.projects.settled()).catch(() => {});
  const before = state.project;
  go("story");
  await loadStories();
  if (state.project !== before) setProject(before);
  await until(() => drawn(".story-desk3"));
}

/** The Stage, on an example: the stage open if a picture was made from it, else the newest stage that has one (the examples come with theirs). */
const done = (r) => r.status === "done" && r.photo;
async function stage() {
  const api = await mountStage();
  await api.projects.settled();
  await room("stage", ".ctl-view");
  if (!api.stage.runs.some(done)) {
    const example = (await api.projects.list()).find((s) => s.renders?.length);
    if (example) await api.projects.open(example.id);
  }
}
// the picture shown last, so a second play shows the next one
let shown = null;
async function render() {
  const api = await mountStage();
  await simulate(document.querySelector(".ctl-view"), { label: "Rendering the frame", seconds: 2.6 });
  const pics = api.stage.runs.filter(done);
  if (!pics.length) return;
  shown = pics[(pics.findIndex((r) => r.id === shown) + 1) % pics.length].id;
  api.viewRun(shown);
}

const shot = async (sel, block) => (await room("shot", "#presets .ptile"), block ? into(sel, block) : scrollTo({ top: 0 }));

/** The Cut, on an edit with clips: the one open, else the newest that has some (Kitchen's Cut holds every edit, Jam's music videos too). */
async function edit() {
  await room("cut", ".cut-page");
  await loadCuts();
  const clips = (id) => (cut.list.find((c) => c.id === id)?.info?.clips ?? 0) > 0;
  if (!clips(cut.project?.id)) {
    const example = cut.list.find((c) => clips(c.id));
    if (example) await openCut(example.id);
  }
}

/** The Library, on its pictures (the examples' renders and sheets are there from the start). */
async function library() {
  await room("library", "#page-library .lib-bar");
  const images = [...document.querySelectorAll("#page-library .lib-bar .segment button")].find((b) => b.textContent.startsWith("Images"));
  if (images?.getAttribute("aria-pressed") === "false") images.click();
  await until(() => drawn("#page-library .lib-grid"), 1500);
}

export default {
  title: "Kitchen",
  steps: [
    {
      go: async () => (mountStage(), home()),
      title: "Where we cook",
      text: "Hi, I'm **Ketkout**, head chef. Kitchen is the full studio for a film: the story and its cast, every shot blocked and rolled, then the cut. I'll show you its rooms on my examples: nothing is spent.",
    },
    {
      go: async () => (await home(), into(".home-ask", "top")),
      target: ".home-prompt",
      place: "bottom",
      title: "What's your film about?",
      text: "Say it in one sentence. **Imagine** writes it as one, two or four variants, each a brief with its moodboard; start the one you like and Story takes it from there. The key beside it makes the whole film without stopping.",
    },
    {
      go: async () => (await home(), await until(() => drawn(".home-results .film-card")), into(".home-results .film-card", "end")),
      target: ".home-results .film-card",
      place: "top",
      title: "Projects",
      text: "Every film is a project: its story, its stages, its takes and its edits on one card, with what each room has made. My example stages are here already; click one to go into it, or start empty with **New project**.",
    },
    {
      go: story,
      target: "#page-story",
      title: "Story",
      text: "The film on paper: the **story bible** (cast, places, props and the look, each with a picture), the script scene by scene with its shots, and the inspector for what you pick. **Write the story** writes it all from a sentence.",
    },
    {
      go: stage,
      target: ".ctl-view",
      place: "bottom",
      title: "The Stage",
      text: "Block a shot before anything is drawn: posable mannequins and props, placed by hand or by me, everyone listed on the left. Drag to look around; the frame shows what the camera sees, and the channels above it are what a render follows.",
    },
    {
      go: stage,
      target: ".ctl-right",
      place: "left",
      title: "Camera and frame",
      text: "Snap the camera to a classic angle, set the lens, give it a move for a video, and pick the frame. Further down, **Render references** puts every channel of the frame in the Library, ready for a shot.",
    },
    {
      go: stage,
      target: ".ctl-mid",
      title: "Render the frame",
      text: "Type the look in my bar and press its **picture key**: an image model paints the frame, everyone where you put them. It costs credits on Comfy Cloud, so here I play it with this stage's own picture.",
      show: { label: "Render it, for free", run: render },
    },
    {
      go: () => shot(),
      target: "#presets",
      place: "left",
      title: "Shot",
      text: "Shot makes one shot at a time. **Presets** are camera moves, effects and transformations, each a script ready to roll: point at one to see it play, click it to load it.",
    },
    {
      go: () => shot("#script", "top"),
      target: "#script",
      place: "bottom",
      title: "The script",
      text: "What the shot says, part by part: the action, the camera, who speaks and what we hear. It becomes the prompt the video model reads, with the inputs on the left: a start frame, an end frame, references, a sound.",
    },
    {
      go: () => shot("#settings", "center"),
      target: "#settings",
      place: "right",
      title: "Roll it",
      text: "Set the length, the frame, the quality and how many takes, then **ROLL** (on Comfy Cloud, that costs credits). Each take lands in the **Take log**, newest first, ready for the cut.",
    },
    {
      go: edit,
      target: "#page-cut .cut-page",
      title: "Cut",
      text: "The edit: clips on the timeline, titles and effects above them, sound under them, the monitor playing it all, and the **Media bin** to feed it. **Render the film** puts it in the Library. Every edit is here, Jam's music videos too.",
    },
    {
      go: library,
      target: "#page-library",
      title: "Library",
      text: "Everything you've made, in one place: **Takes**, **Films** and **Images**. My examples' renders and sheets are here already; any picture can start a shot with **Use as start**, or go to the Oven to be changed.",
    },
    {
      go: home,
      title: "Your turn",
      text: "Open one of my example stages and change it (it is yours now), or write what your film is about right here. I'm in the bar of every room whenever you need me.",
    },
  ],
};
