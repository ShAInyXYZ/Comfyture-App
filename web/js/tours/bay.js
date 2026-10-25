// The bay's tour: Paprika shows a newcomer around Spice's AI edit bay on the example it ships (examples/bay/, "The yard at dusk"), stage by
// stage. Nothing is spent: where a stage would run a model on Comfy Cloud, the tour shows the result the example already holds (simulate()
// plays the wait), and says so. The first Spice, the VFX house, stays one key away.
import { bay, loadBays, openShot, setStage } from "../bay.js";
import { simulate } from "../tour.js";

/** The example the tour runs on: the newest of the bay's own (their ids begin "bay-example"), else the shot open. */
async function onExample() {
  await loadBays();
  const examples = bay.list.filter((s) => s.id.startsWith("bay-example")).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  if (examples[0] && bay.shot?.id !== examples[0].id && !bay.shot?.id.startsWith("bay-example")) await openShot(examples[0].id);
}
const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const open = (stage) => async () => {
  await onExample();
  setStage(stage);
  await settle();
};
const takes = (stage) => bay.shot?.body.stages[stage]?.takes.length ?? 0;

/** The viewer's wipe swept to one side, to the other and back, so the footage and the take are both seen (a look: nothing changes). */
async function sweep() {
  const stage = document.querySelector(".bay-v-stage");
  if (!stage || stage.classList.contains("is-single")) return;
  const put = (v) => stage.style.setProperty("--wipe", `${v.toFixed(2)}%`);
  const from = parseFloat(stage.style.getPropertyValue("--wipe")) || 50;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  for (const [a, b] of [[from, 8], [8, 92], [92, from]]) {
    if (still) {
      put(b);
      await wait(700);
      continue;
    }
    await new Promise((done) => {
      const t0 = performance.now();
      const tick = (now) => {
        const u = Math.min(1, (now - t0) / 850);
        put(a + (b - a) * (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2));
        if (u < 1) requestAnimationFrame(tick);
        else done();
      };
      requestAnimationFrame(tick);
    });
    await wait(300);
  }
}

export default {
  title: "Spice",
  steps: [
    {
      go: open("conform"),
      title: "An AI edit bay",
      text: "Hi, I'm **Paprika**. Spice is where AI models edit a clip, the way a finishing editor works: seven stages, each run by the Comfy Cloud model that is best at its job. We'll look at one of my examples, **The yard at dusk**: nothing is spent.",
    },
    {
      go: open("conform"),
      target: ".bay-rail",
      place: "right",
      title: "Seven stages",
      text: "**Conform**, **Select**, **Clean**, **Direct**, **Control**, **Extend**, **Finish**, in the order an editor works. A green lamp is a stage with a pass; each stage keeps every run as a take, and the one you mark is what the next stage works from.",
    },
    {
      go: open("conform"),
      target: ".bay-stage",
      place: "left",
      title: "Conform: ready for the editors",
      text: "Most editors take ten seconds at about 24 frames. Conform says what to change and does it **on this machine, free**. Its result is the clip the stages after it work from.",
    },
    {
      go: open("clean"),
      target: ".bay-engines",
      place: "left",
      title: "Clean: take something out",
      text: "Each stage lists the models that can do its job, **read live from Comfy Cloud's catalog**, with what each is for, its limit, and whether it is open or a partner's. Here VOID takes the white van out together with its shadow. I pick for you; you can pick another.",
    },
    {
      go: open("clean"),
      target: ".bay-viewer",
      place: "bottom",
      title: "Before and after",
      text: "The footage is left of the wipe and the stage's take on its right: drag to compare. **Run** asks for the price first and only a second press sends it. This example's take is a **stand-in** drawn to show the result, and the take says so.",
      show: {
        label: "Run it, for free",
        run: async () => {
          await simulate(document.querySelector(".bay-v-stage"), { label: "Taking the van out", seconds: 2.6 });
          await sweep();
        },
      },
    },
    {
      go: open("direct"),
      target: ".bay-engines",
      place: "left",
      title: "Direct: change it by words",
      text: "Describe the change: **Gemini Omni**, **Seedance**, **Runway Aleph**, **Luma**, **Kling** and **Wan** edit by words; **Beeble** and **Bernini** relight; **Genjutsu** recasts a person. Here the sign is repainted by hand and the yard is a rainy blue hour.",
    },
    {
      go: open("direct"),
      target: ".bay-run",
      place: "top",
      title: "A price before a yes",
      get text() {
        return `The key shows what the run would cost. A clip over a model's limit, a picture it needs and you have not given, or no Comfy key: each is said **before** you press, not after you paid. ${takes("direct") ? "Every run, kept or failed, stays under the stage as a take." : ""}`;
      },
    },
    {
      go: open("control"),
      target: ".bay-engines",
      place: "left",
      title: "Control: LTX IC-LoRAs",
      text: "The bay's LTX corner: **union control** redraws the look and keeps the motion, **Ingredients** holds a character from a reference sheet, **outpaint** widens the frame, and **FastH3** and **H3 reference** redo a clip from pictures. Models that arrive in the catalog appear here by themselves.",
    },
    {
      go: open("extend"),
      target: ".bay-engines",
      place: "left",
      title: "Extend: longer, or joined",
      text: "Continue a clip by up to ten seconds a step with **Gemini Omni**, or bridge two takes between their last and first frames with **LTX 2.5** or **H3**.",
    },
    {
      go: open("finish"),
      target: ".bay-stage",
      place: "left",
      title: "Finish: and keep the ledger",
      text: "Upscale, smoother motion, sound that fits the picture. **Export** writes the clip as an MP4, a WebM or a MOV, free; **Ledger** saves every run, its model and its price as a text file.",
    },
    {
      go: open("finish"),
      target: ".bay-planlist",
      place: "right",
      title: "My plan",
      text: "Tell me what the shot is for and I write the **plan**: which model in which stage, in order, with a line on why. A step is ticked once its stage has a pass by that model. Press a step to set its stage up.",
    },
    {
      go: open("finish"),
      target: ".bay-classic",
      place: "right",
      title: "And the VFX house",
      text: "The first Spice is still here: the **compositor** with its free effects and bake, Roto, Light and Paint. Press this key for it.",
    },
  ],
};
