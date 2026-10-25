// Toaster's tour: Crumpet shows a newcomer around, on one of the examples Toaster ships (examples/toaster/), from the clay to the render
// and the 3D page. Toast it is played for free: the example's own renders are what it shows.
import { toaster, loadDrafts, openDraft, setMode, showRender } from "../toaster.js";
import { simulate } from "../tour.js";

/** The example the tour runs on: the newest of Toaster's own (their ids begin "toast-example"), else the draft open. */
async function onExample() {
  await loadDrafts();
  const example = toaster.list.find((d) => d.id.startsWith("toast-example"));
  if (example && toaster.draft?.id !== example.id) await openDraft(example.id);
}
const scene = async () => (await onExample(), setMode("scene"));
const render = async () => (await onExample(), setMode("render"));
const renders = () => (toaster.draft?.body.renders ?? []).filter((r) => r.status === "done");

export default {
  title: "Toaster",
  steps: [
    {
      go: scene,
      title: "Clay in, toast out",
      text: "Hi, I'm **Crumpet**. In Toaster you block out an object or a whole set in clay, then **toast it**: an image model turns the clay into a finished picture, and the 3D page makes it a real 3D model. We'll look at one of my examples: nothing is spent.",
    },
    {
      go: scene,
      target: ".ts-parts-card",
      place: "right",
      title: "The parts",
      text: "Everything in the set: shapes, pieces of the library and characters. Click one to pick it, Shift to pick several, double-click to rename. Each has an **@tag** the words can name.",
    },
    {
      go: scene,
      target: ".ts-left .ts-card:nth-of-type(2)",
      place: "right",
      title: "Add",
      text: "Ten shapes, the **Library**'s 372 clay pieces (furniture, props, studio gear, food, vehicles…) and **Characters** you can pose. A part added while another is picked sits on top of it.",
    },
    {
      go: scene,
      target: ".ts-view",
      title: "The viewport",
      text: "Drag to look around; the gizmo moves, turns and sizes what you pick, with a snap. The frame shows what the camera sees, and the view keys look from the front, the side, the back or the top.",
    },
    {
      go: scene,
      target: ".ts-cams",
      place: "left",
      title: "Cameras",
      text: "Keep a view as a camera and go back to it in one click. The render is made from the view lit here, at its lens and frame.",
    },
    {
      go: scene,
      target: "#assistant .chat-bar",
      place: "top",
      title: "Ask me",
      text: "Tell me what to build (\"a cosy reading corner with a sofa, two shelves and a lamp, camera low\") or attach a photo and I rebuild its layout in clay and match its camera. My whole build is one step **Undo** takes back.",
    },
    {
      go: render,
      target: ".ts-studio",
      place: "bottom",
      title: "The Render page",
      text: "**T** switches to it. The picture is the last render, with its history under it: each one keeps the camera, the model and the strength it was made with.",
    },
    {
      go: render,
      target: ".ts-brief",
      place: "top",
      title: "What it is, and the look",
      text: "Plain words: what the set is, and the light and style you want. **@tags** name parts, so their sheets go along. **Write** turns it all into the prompt the model reads best.",
    },
    {
      go: render,
      target: ".ts-maps-card",
      place: "left",
      title: "What is sent",
      text: "The clay frame leads; colour ID, depth and silhouette maps can go with it, and every part's pictures by its tag. Click a map to send it or leave it out.",
    },
    {
      go: render,
      target: ".ts-recipe-model",
      place: "left",
      title: "Model and strength",
      text: "Pick the image model and how far it may go from the clay: low keeps the clay's colours, the middle gives everything its real materials, high keeps only the layout.",
    },
    {
      go: render,
      target: ".ts-recipe-toast",
      place: "left",
      title: "Toast it",
      text: "This renders the clay frame with your words, maps and pictures. It costs credits on Comfy Cloud, so here I play it for free with the example's own renders.",
      show: {
        label: "Toast it, for free",
        run: async () => {
          await simulate(document.querySelector(".ts-pic-box") ?? document.querySelector(".ts-studio"), { label: "Toasting the frame", seconds: 2.6 });
          const list = renders();
          const at = list.findIndex((r) => r.id === toaster.shown);
          if (list.length) showRender(list[(at + 1) % list.length].id);
        },
      },
    },
    {
      go: async () => (await onExample(), setMode("3d")),
      target: ".ts-mid",
      title: "The 3D page",
      text: "Objects are made real **one at a time**, in the order of the list. Each gets its own four-view sheet, drawn from its clay by an image model, cut into front, back, left and right, and turned into a textured **3D model** (Trellis2, on your own GPU). Then the next. The finished models stand in a **new scene**, each where its clay was.",
    },
    {
      go: scene,
      title: "Your turn",
      text: "Change this example (it is yours now), or start your own with **New project** on the bar above. I'm in my bar whenever you need me.",
    },
  ],
};
