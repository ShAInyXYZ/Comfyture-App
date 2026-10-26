// Spice's tour: Paprika shows a newcomer around, on the example scenario Spice ships (examples/spice/), from the shots to the chain of
// passes, the tools and their key. Every pass of the example is a real run; the tour spends nothing and keeps nothing (a look).
import { spice, loadScenarios, openScenario, openShot, look, lookAt, setTool, body, shot } from "../spice.js";
import { lookingAt } from "../spice-model.js";

/**
 * The scenario the tour runs on: the newest of Spice's own (their ids begin "spice-example") that has a shot with passes; else the newest
 * of them; else the one open. Chosen once a page, then opened whenever a step needs it.
 */
let chosen = null;
async function onExample() {
  await loadScenarios();
  const examples = spice.list.filter((s) => s.id.startsWith("spice-example")).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  if (!examples.length) return;
  if (!examples.some((s) => s.id === chosen)) chosen = (examples.find((s) => (s.info?.passes ?? 0) > 0) ?? examples[0]).id;
  if (spice.scenario?.id !== chosen) await openScenario(chosen);
}
/** The page drawn again after a change. */
const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const open = async () => {
  await onExample();
  await settle();
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** The shot of the example with the most passes, opened: the one the chain is best seen on. */
const onBestShot = async () => {
  await open();
  const b = body();
  const best = b?.shots.slice().sort((a, c) => c.passes.length - a.passes.length)[0];
  if (best && b.open !== best.id) {
    openShot(best.id);
    await settle();
  }
};
const viewer = () => document.querySelector(".sp-viewer");

export default {
  title: "Spice",
  steps: [
    {
      go: open,
      title: "The AI VFX suite",
      text: "Hi, I'm **Paprika**. Spice is my VFX house: a scenario of a few shots, and on each one a chain of passes made by tools that are all workflows on **Comfy Cloud**. We'll look at my example, *Truffle's Jam Heist*: every pass in it is a real run, and nothing is spent here.",
    },
    {
      go: open,
      target: ".sp-shots",
      place: "right",
      title: "The shots",
      text: "The scenario's shots, each with the picture of what it is now and how many passes it has. Click one to open it. **Add a shot** rolls a new one with **LTX-2.5** from a first frame and a few words, or takes a clip as it is.",
    },
    {
      go: onBestShot,
      target: ".sp-viewer .sp-stage-host",
      place: "bottom",
      title: "Before and after",
      text: "The viewer wipes the clip a pass ran on against the clip it made: drag the line, or press play. The footage stays on the left, so you see exactly what the tool did.",
      show: {
        label: "Sweep the wipe",
        run: async () => {
          const v = viewer();
          const wipe = v?.querySelector(".sp-wipe");
          if (!wipe || wipe.hidden) return;
          const stage = v.querySelector(".sp-stage");
          const put = (x) => stage.style.setProperty("--wipe", `${(x * 100).toFixed(2)}%`);
          const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
          for (const [a, b] of [[0.5, 0.08], [0.08, 0.92], [0.92, 0.5]]) {
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
        },
      },
    },
    {
      go: onBestShot,
      target: ".sp-chain",
      place: "top",
      title: "The chain",
      text: "The plate, then every pass in the order it was made, each on the one before: the van taken out, the day turned to night, the frame widened. Click one to look at it; the **×** takes it off (it waits in the bin with what was made on top of it). A new run goes on the pass you are looking at.",
      show: {
        label: "Walk the chain",
        // (a look: each pass in turn, then the chain as it was; nothing is saved)
        run: () =>
          look(async () => {
            const s = shot();
            if (!s) return;
            const was = lookingAt(s)?.id ?? "plate";
            for (const id of ["plate", ...s.passes.map((p) => p.id)]) {
              lookAt(id);
              await settle();
              await wait(900);
            }
            lookAt(was);
            await settle();
          }),
      },
    },
    {
      go: open,
      target: ".sp-browse",
      place: "left",
      title: "The tools",
      text: "**Browse the tools** opens the library: every tool is a card with a real run of it on our own footage, what it was given on the left and what it made on the right. The IC-LoRAs of LTX-2.3 (restore, upscale, grade and light, clean, frame, camera, control, effects), SAM3's **cut-out**, SeedVR2's **upscale**, LTX-2.5's **sound**, and the catalog's templates. The dot says what the run showed: green did what its card says, red did not, grey needs more than a clip. A card picks its tool.",
    },
    {
      go: onBestShot,
      target: ".sp-b-next",
      place: "left",
      title: "Paprika's read",
      text: "I look at a frame of the shot and say what I see and what looks off, then propose a few **chains** of passes, each with its tools, its words and its price. **Run it** runs the whole chain with one yes; **Step by step** sets the first tool up for you. Tell me in the bar what you want instead, and I answer with a chain.",
    },
    {
      go: open,
      target: ".sp-b-next",
      place: "left",
      title: "The tool picked",
      text: "Pick a tool, from my chains or the library, and its card takes my place: what it is told, its strength and seconds, draft or standard, and the yellow key with its **price**. The key asks first and spends on the second press. Nothing runs by itself. **Her chains** brings my read back.",
      show: {
        label: "Pick Deblur",
        run: () =>
          look(async () => {
            const t = spice.tools?.tools.find((x) => x.id === "deblur");
            if (t) setTool({ tool: t.id, words: "", strength: null, seconds: null });
            await settle();
            await wait(1600);
          }),
      },
    },
    {
      go: onBestShot,
      target: ".sp-chain",
      place: "top",
      title: "The bin",
      text: "The × on a pass takes it off the chain: it waits in the **bin**, a chip at the end of the chain, with what was made on top of it. Put it back and the chain is rebuilt to where it was made; forget it and its clip still stays in your library.",
    },
    {
      go: open,
      target: ".sp-add",
      place: "right",
      title: "A new shot",
      text: "**Add a shot**: pick a first frame from your pictures (or bring one in), say what happens, and LTX-2.5 rolls five seconds of it with its sound. Or drop a clip anywhere on Spice and it is a shot as it is.",
    },
    {
      go: open,
      target: "#spice-chat",
      place: "top",
      title: "Ask me",
      text: "Tell me the job and I set it up: *take the van out*, *turn the day to night*, *widen it to scope*, *give it its sound*. I pick the tool and its words; you press the key, and only then is anything spent.",
    },
    {
      go: open,
      title: "That's the suite",
      text: "A scenario, a few shots, and every pass a real run on Comfy Cloud, kept on its chain with the clip it ran on. Roll a shot of your own, or drop a clip, I'll have a look, and we start.",
    },
  ],
};
