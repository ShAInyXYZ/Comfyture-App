// The whole film from one prompt: a variant written and drawn, its story written, its sheets and
// storyboard drawn, every shot rolled, the edit cut and rendered. Each step is one the pages offer
// by hand; this runs them in order, on the story it started, and a card over every page shows
// where it is. Stop ends it after the step under way (takes already rolling finish).
import { h, icon, sprite } from "./dom.js";
import { toast, changed } from "./store.js";
import { story, openStory, scenesOf, shotsOf, takeOf, write, drawMissingRefs, drawMissingShots, rollMissingShots, sendToCut, commit } from "./story.js";

const STEPS = [
  ["variant", "The idea and its moodboard"],
  ["story", "The script and the cast"],
  ["sheets", "The cast's and the places' sheets"],
  ["board", "The storyboard's shots"],
  ["frames", "Their frames"],
  ["roll", "Every shot rolled"],
  ["cut", "The edit, in story order"],
  ["render", "The film rendered"],
];
export const film = { running: false, step: null, done: new Set(), note: "", stopping: false, failed: null, story: null };
const stopped = () => Object.assign(new Error("Stopped."), { stopped: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Makes the film: variant() writes one variant and draws its moodboard (answering what start
 * needs), start(picked) makes it the story and writes its script and cast (answering the story's id).
 */
export async function makeFilm({ variant, start }) {
  if (film.running) return toast("A film is being made already: its card says where it is.");
  Object.assign(film, { running: true, step: null, done: new Set(), note: "", stopping: false, failed: null, story: null });
  draw();
  const step = async (key, run) => {
    if (film.stopping) throw stopped();
    film.step = key;
    film.note = "";
    draw();
    // the story the run began, whatever else was opened meanwhile
    if (film.story && story.project?.id !== film.story) await openStory(film.story);
    await run();
    film.done.add(key);
    draw();
  };
  try {
    let picked = null;
    await step("variant", async () => {
      picked = await variant();
      if (!picked) throw new Error("No variant came back.");
    });
    await step("story", async () => {
      film.story = await start(picked);
      if (!film.story || !scenesOf().some((s) => s.scene)) throw new Error("The script came back empty.");
    });
    await step("sheets", async () => {
      // frames drawn as film stills: a take starts from them as they are
      story.project.body.style = "film";
      commit({ history: false });
      await drawMissingRefs();
    });
    await step("board", async () => {
      await write("board");
      if (!shotsOf().length) throw new Error("The storyboard came back without shots.");
    });
    await step("frames", async () => {
      await drawMissingShots();
      if (!shotsOf().some((s) => s.block.photo)) throw new Error("No frame could be drawn.");
    });
    await step("roll", async () => {
      await rollMissingShots();
      await rolled();
      // a take that failed (ComfyUI erring now and then) is rolled once more before the edit holds its frame
      if (shotsOf().some((s) => ["failed", "canceled"].includes(takeOf(s.block)?.status ?? "failed"))) {
        film.note = "Rolling the ones that failed again";
        draw();
        await rollMissingShots();
        await rolled();
      }
    });
    await step("cut", () => sendToCut());
    await step("render", async () => {
      const { renderFilm } = await import("./cut.js");
      if (!(await renderFilm())) throw new Error("The film didn't render: Cut says why.");
    });
    film.step = null;
    film.note = "The film is in the Library, and its edit in Cut.";
  } catch (e) {
    film.failed = e.stopped ? null : e.message;
    film.note = e.stopped ? "Stopped. What was made stays where it is." : e.message;
  } finally {
    film.running = false;
    draw();
  }
}

/** Until every shot's take has finished (or failed): how many are in, as it goes. */
async function rolled() {
  for (;;) {
    const shots = shotsOf();
    // a shot whose roll could not even start has no take to wait for
    const takes = shots.map((s) => takeOf(s.block));
    const done = takes.filter((t) => t?.status === "done").length;
    const out = takes.filter((t) => !t || ["failed", "canceled"].includes(t.status)).length;
    film.note = `${done} of ${shots.length} rolled${out ? ` · ${out} not` : ""}`;
    draw();
    if (done + out >= shots.length) {
      if (!done) throw new Error("No shot could be rolled.");
      return;
    }
    if (film.stopping) throw stopped();
    await wait(3000);
  }
}

// ---------------------------------------------------------------- its card, over every page

let card = null;
function draw() {
  // Home's key says whether a film is being made
  changed("home");
  card ??= document.body.appendChild(h("aside.film-run", { "aria-live": "polite", "aria-label": "Making the film" }));
  const shown = film.running || film.note;
  card.hidden = !shown;
  if (!shown) return;
  const at = STEPS.findIndex(([k]) => k === film.step);
  card.replaceChildren(...[
    h("div.film-run-head", {},
      sprite("film-make"),
      h("b", {}, film.running ? "Making the film" : film.failed ? "The film stopped" : "The film"),
      film.running
        ? h("button.film-run-stop", { type: "button", disabled: film.stopping, title: "Stop after this step\nTakes already rolling finish", on: { click: () => ((film.stopping = true), draw()) } }, film.stopping ? "Stopping…" : "Stop")
        : h("button.film-run-x", { type: "button", title: "Put it away", "aria-label": "Put it away", on: { click: () => ((film.note = ""), draw()) } }, icon("close"))),
    h("ol.film-run-steps", {}, ...STEPS.map(([k, label], i) =>
      h("li", { className: film.done.has(k) ? "is-done" : k === film.step ? (film.failed ? "is-failed" : "is-now") : i > at && at >= 0 ? "" : "" },
        h("i"), h("span", {}, label), k === film.step && film.running && film.note ? h("em", {}, film.note) : null))),
    !film.running && film.note ? h("p.film-run-note", {}, film.note) : null,
  ].filter(Boolean));
}
