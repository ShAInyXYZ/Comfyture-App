// Spice's tour: Paprika shows a newcomer around, on one of the example shots Spice ships (examples/spice/), up the comp stack from the
// footage to the finish. Roto's cut-out, which costs credits on Comfy Cloud, is played for free: the example's own matte is what it shows.
import { spice, loadShots, openShot, setDept } from "../spice.js";
import { simulate } from "../tour.js";

/**
 * The example the tour runs on: the newest of Spice's own (their ids begin "spice-example") whose footage is a clip, so the timeline has
 * frames to show; else the newest of them; else the shot open. Chosen once a page, then opened whenever a step needs it.
 */
let chosen = null;
async function onExample() {
  await loadShots();
  const examples = spice.list.filter((s) => s.id.startsWith("spice-example")).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  if (!examples.length) return;
  if (!examples.some((s) => s.id === chosen)) {
    chosen = examples[0].id;
    for (const s of examples) {
      const kind = await fetch(`api/spice-shots/${s.id}`).then((r) => r.json()).then((j) => j.project?.body?.passes?.plate?.media?.kind, () => null);
      if (kind === "video") {
        chosen = s.id;
        break;
      }
    }
  }
  if (spice.shot?.id !== chosen) await openShot(chosen);
}
/** The page drawn again after a change (the stack on the left is made anew when the shot or the department changes). */
const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const open = (dept) => async () => {
  await onExample();
  setDept(dept);
  await settle();
};
const body = () => spice.shot?.body ?? null;
const isClip = () => body()?.passes.plate?.media.kind === "video";
// (said mid-sentence: an article that starts the name is not capitalized, "the chick and her jar"; a name, "Pickle", stays as it is)
const subject = () => (body()?.set.roto.subjects.find((s) => s.media)?.name ?? "the subject").replace(/^(The|A|An) /, (a) => a.toLowerCase());
const layers = () => body()?.set.fx.layers.length ?? 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** The viewer's wipe swept to one side, to the other and back, so its before and its after are both seen (a look: the shot is not changed). */
async function sweep() {
  const stage = document.querySelector(".sp-viewer .sp-stage");
  const wipe = stage?.querySelector(".sp-wipe");
  if (!stage || !wipe || wipe.hidden) return;
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

/** The viewer's own play key: the clip plays once through, free (it was made already). */
async function play() {
  const key = document.querySelector(".sp-viewer .sp-iconkey.is-play");
  if (!key || !isClip()) return;
  if (!spice.playing) key.click();
  const t0 = Date.now();
  await wait(400);
  while (spice.playing && Date.now() - t0 < 8000) await wait(200);
}

export default {
  title: "Spice",
  steps: [
    {
      go: open("plate"),
      title: "One shot, six departments",
      text: "Hi, I'm **Paprika**. Spice is my VFX house: a shot goes through six departments, and each one lays its pass on top of the last, so nothing is ever overwritten. We'll look at one of my examples: nothing is spent.",
    },
    {
      go: open("plate"),
      target: ".sp-stack",
      place: "right",
      title: "The comp stack",
      text: "The six departments, stacked like the layers of a comp: the footage at the foot, the finish on top. A green lamp is a pass made; the **eye** shows it in the viewer or hides it. Click a row to open its department.",
    },
    {
      go: open("plate"),
      target: ".sp-dept.is-plate .sp-b-footage",
      place: "left",
      title: "Plate: the footage",
      text: "Drop a clip or a picture anywhere on Spice, or start from one of your takes. **Trim** sets the frames every department works on, and **Read the depth** maps how far away everything is.",
    },
    {
      go: open("roto"),
      target: ".sp-dept.is-roto .sp-b-subjects",
      place: "left",
      title: "Roto: who is in it",
      get text() {
        return `Roto cuts out who is in the shot: **Click a subject**, then click them on the viewer (Shift or Alt for what is not them). Each subject gets a matte, so an effect can go behind them. Here, ${subject()} is ${isClip() ? "tracked" : "cut out"} already.`;
      },
    },
    {
      go: open("roto"),
      target: ".sp-viewer",
      place: "bottom",
      title: "Before and after",
      get text() {
        return `In every department the footage is left of the wipe and the department's work is on its right: drag the wipe to compare. **${isClip() ? "Track" : "Cut out"}** makes Roto's matte on Comfy Cloud, for credits; this example's is made, so I'll play it for free.`;
      },
      show: {
        get label() {
          return isClip() ? "Track it, for free" : "Cut it out, for free";
        },
        run: async () => {
          await simulate(document.querySelector(".sp-viewer .sp-stage-host") ?? document.querySelector(".sp-viewer"), { label: `${isClip() ? "Tracking" : "Cutting out"} ${subject()}`, seconds: 2.6 });
          await sweep();
        },
      },
    },
    {
      go: open("paint"),
      target: ".sp-dept.is-paint .sp-b-target",
      place: "left",
      title: "Paint: what is in the way",
      text: "Paint takes out what should not be there: an **Object** you name, a **Spot** you brush over on the viewer (free, on this machine), a **Logo** or the **Subtitles**. What is removed shows on the right of the wipe.",
    },
    {
      go: open("light"),
      target: ".sp-dept.is-light .sp-b-relight",
      place: "left",
      title: "Light: another mood",
      text: "Say the light you want and **Relight** makes it; **Replace the sky** puts another one behind them. Both run on Comfy Cloud. Under the viewer, **Add the weather** and **Grade it** are free, on this machine.",
    },
    {
      go: open("fx"),
      target: ".sp-dept.is-fx .sp-b-library",
      place: "left",
      title: "FX: lay effects on",
      get text() {
        const baked = body()?.passes.fx?.media && !body().set.fx.dirty;
        return `Drag an effect onto the picture: fire, light, magic, weather, particles. Each is a layer you move, scale and turn on the picture itself. **Bake** makes them part of the shot, free, on this machine${baked ? ": this example's are baked already" : ""}.`;
      },
    },
    {
      go: open("fx"),
      target: ".sp-dept.is-fx .sp-b-layers",
      place: "top",
      title: "The layers",
      get text() {
        const n = layers();
        return `${n ? `This example has ${n} ${n === 1 ? "layer" : "layers"}, the top first.` : "The layers, the top first."} Pick one to change its **Look** and its **Place**; the person key puts it behind the people, held there by Roto's matte.`;
      },
    },
    {
      go: open("comp"),
      target: ".sp-viewer",
      place: "bottom",
      title: "Comp: the whole stack",
      text: "Comp shows the footage against everything on the stack, and **Passes** lists what each department made and what it cost. Drag the wipe to see the before and the after.",
      show: { label: "Move the wipe", run: sweep },
    },
    {
      go: open("comp"),
      // (on a short screen the timeline runs past the foot of the viewer, which hides what does not fit: the light is the whole viewer then)
      target: () => {
        const viewer = document.querySelector(".sp-viewer");
        const time = viewer?.querySelector(".sp-time:not([hidden])");
        if (!time) return viewer?.querySelector(".sp-picbar:not([hidden])") ?? viewer;
        return time.getBoundingClientRect().bottom <= viewer.getBoundingClientRect().bottom ? time : viewer;
      },
      get title() {
        return isClip() ? "The timeline" : "One frame";
      },
      get text() {
        return isClip()
          ? "Frames count from 1001, as a slate counts them. **Space** plays, the arrows step a frame, and each department has a bar for the frames its pass covers. Drag along the strip to scrub."
          : "A picture is one frame, so there is no timeline here. A clip gets one: its frames counted from 1001, and a bar for each department's pass.";
      },
      get show() {
        return isClip() ? { label: "Play it", run: play } : undefined;
      },
    },
    {
      go: open("comp"),
      target: ".sp-dept.is-comp .sp-lower",
      place: "top",
      title: "The finish",
      get text() {
        return isClip()
          ? "**Upscale** restores the shot larger on Comfy Cloud. **Slow it** makes the frames between the frames, free here or with FILM on the Cloud. **Export** gives you the top of the stack as an MP4, a WebM, a MOV or a GIF, free."
          : "**Upscale** makes the picture larger on Comfy Cloud. A picture has no motion to slow. **Export** gives you the top of the stack as a PNG, a JPG or a WebP, free.";
      },
    },
    {
      go: open("comp"),
      target: "#assistant .chat-bar",
      place: "top",
      title: "Ask me",
      text: "Tell me what you want in words: \"a portal behind her\", \"make it snow\", \"export it as a webm\". I set the department up for you; anything that costs credits waits for your yes, with its price.",
    },
    {
      go: open("plate"),
      target: ".sp-shotchip",
      place: "right",
      title: "Your turn",
      text: "Change this example, it is yours now, or start your own: **A new shot** is in this chip, and a clip dropped anywhere on Spice becomes its footage. I'm in my bar whenever you need me.",
    },
  ],
};
