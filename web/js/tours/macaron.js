// Macaron's tour: Brioche shows a newcomer around the brand room, on the brand Macaron ships (examples/macaron/: Comfyture's own), from
// its kit and its idea to a shoot, its posts and its brand book. A shoot costs credits, so it is played for free: what a shoot makes
// lands in Photography, where the brand's own pictures of the jar already are.
import { macaron, loadBrands, openBrand, setSpace } from "../macaron.js";
import { closeAll } from "../macaron-win.js";
import { openShoot } from "../macaron-shoot.js";
import { TEMPLATES } from "../macaron-templates.js";
import { simulate } from "../tour.js";

/** The brand the tour runs on: Comfyture's own, the example Macaron ships (examples/macaron/comfyture.brand.json), else the one open. */
async function onExample() {
  await loadBrands();
  const example = macaron.list.find((b) => b.id === "brand-comfyture") ?? macaron.list.find((b) => b.name === "Comfyture");
  if (example && macaron.brand?.id !== example.id) await openBrand(example.id);
}
const drawn = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

/** The page scrolled so an element is whole on screen, above Brioche's bar where the bar is under it (a short screen scrolls). */
function inView(sel) {
  const el = document.querySelector(sel);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const bar = document.querySelector("#assistant .composer")?.getBoundingClientRect();
  const under = bar?.height && bar.left < r.right && bar.right > r.left;
  const floor = (under ? bar.top : innerHeight) - 16;
  const by = r.bottom > floor ? Math.min(r.bottom - floor, r.top - 16) : r.top < 16 ? r.top - 16 : 0;
  if (by) scrollBy({ top: by, behavior: "instant" });
}

/** A workspace of the example open with no window over it, and once it is drawn, what the step is about in view. */
const at = (space, sel) => async () => {
  await onExample();
  closeAll();
  setSpace(space);
  await drawn();
  if (sel) inView(sel);
};

/** The template the shoot is shown with: the one made in the most formats (Hero ad: 4:5, 1:1 and 9:16). */
const TEMPLATE = TEMPLATES.find((t) => t.id === "hero-ad") ?? [...TEMPLATES].sort((a, b) => b.formats.length - a.formats.length)[0];

/**
 * The Studio's New shoot window on that template, its own page scrolled to its end: the picture beside the shot keeps its place as the
 * page scrolls, so its foot (the template, its formats and how many of each) is in view only there.
 */
async function shootOpen() {
  await at("studio")();
  openShoot({ template: TEMPLATE.id });
  await drawn();
  const body = document.querySelector(".mc-win .mc-win-body");
  if (body) body.scrollTop = body.scrollHeight;
}

export default {
  title: "Macaron",
  steps: [
    {
      go: at("kit"),
      title: "A brand's room",
      text: "Hi, I'm **Brioche**. Macaron is a brand's room: its idea and its kit, then pictures and posts in every format, ready to export. We'll look at Comfyture's own brand together: nothing is spent.",
    },
    {
      go: at("kit"),
      target: ".mcb-fan",
      place: "right",
      title: "Five workspaces",
      text: "My panel wears the brand open, its colours and its wordmark (click the wordmark to switch brands). The cards are the five workspaces, in the order the work goes; the number on each is what it holds.",
    },
    {
      go: at("kit", ".mcb-health"),
      target: ".mcb-health",
      place: "right",
      title: "The brand's health",
      text: "How ready the brand is to hand over, with me in the seal. Each line says what is missing or waiting, like a post to review: click it and I take you there.",
    },
    {
      go: at("kit", ".mc-bento.is-palette"),
      target: ".mc-bento.is-palette",
      place: "bottom",
      title: "Brand kit: the palette",
      text: "The kit is what everything else is made from. Each colour is as wide as its share of a page, ink the ground and yellow the signal; **Aa** is the colour that reads best on it, with its grade.",
    },
    {
      go: at("kit", ".mc-bento.is-logos"),
      target: ".mc-bento.is-logos",
      place: "right",
      title: "Logos",
      text: "Every logo file on the ground it is made for: yellow on ink, ink on yellow, white on plum. Always the supplied files, never redrawn. Click any card of the kit to open it in its own window.",
    },
    {
      go: at("idea", ".mc-bento.is-brief"),
      target: ".mc-bento.is-brief",
      place: "right",
      title: "Design idea: the brief",
      text: "What the brand is for, in two lines, and its three goals. Open it for the whole brief: who it is for, the message, the tone, what must be made and the rules every post keeps.",
    },
    {
      go: at("idea", ".mc-bento.is-dirs"),
      target: ".mc-bento.is-dirs",
      title: "Directions",
      text: "Three looks tried for the mark and the page, side by side: **Warm and bold** is the one picked. Ask me for another and it joins them; click one to pick it instead.",
    },
    {
      go: at("studio", ".mc-bento.is-photo"),
      target: ".mc-bento.is-photo .st-foot",
      place: "right",
      title: "Studio: a shoot",
      text: "**Studio** makes the raw material: product shots, UGC stories, motion graphics. A shoot puts the jar in a set: **Studio setup** is its light, surface and background, and **New shoot** picks the shot.",
    },
    {
      go: shootOpen,
      target: ".mc-win .shw-meta",
      place: "left",
      title: "A template, in every format",
      text: "A template is a shot of the jar in the formats it suits: **Hero ad** comes in 4:5, 1:1 and 9:16. Light the ones you want, and how many of each. **Shoot it** costs credits, so here I play it for free.",
      show: {
        label: "Shoot it, for free",
        then: "next",
        run: async () => {
          const sum = document.querySelector(".mc-win .shw-sum b")?.textContent;
          // (over the window's foot, where Shoot it is: the card beside the formats leaves it clear)
          await simulate(document.querySelector(".mc-win .mc-win-foot") ?? document.querySelector(".mc-win"), { label: `Shooting ${TEMPLATE.name}${sum ? `: ${sum}` : ""}`, seconds: 2.6 });
        },
      },
    },
    {
      go: at("studio", ".mc-bento.is-photo"),
      target: () => document.querySelector(".mc-bento.is-photo .st-shots") ?? document.querySelector(".mc-bento.is-photo"),
      place: "right",
      title: "What a shoot makes",
      text: "The pictures land first in **Photography**, ready for the posts; a video template also makes a take from each. Here, the brand's own pictures of the jar, and of me.",
    },
    {
      go: at("create", ".mc-bento.is-soc"),
      target: ".mc-bento.is-soc",
      place: "bottom",
      title: "Create",
      text: "**Create** makes everything from the kit, a family of formats at a time: social, ads, print, web, app, video. Comfyture's posts each have a layout of their own in 4:5, 1:1 and 9:16; click one to open it in the **Post editor**.",
    },
    {
      go: at("book", ".mc-bento.is-handoff"),
      target: ".mc-bento.is-handoff",
      place: "bottom",
      title: "The brand book",
      text: "The **Brand book** gathers it all into the guide a designer hands over: nine pages built from the kit, each checked by the brand guard. **Export the book** makes the PDF; the colours as CSS and the logo files are a click each.",
    },
    {
      go: at("kit"),
      title: "Your turn",
      text: "Change anything in this brand (it is yours now), or start your own with **A new brand** under the wordmark. I'm in my bar whenever you need me: a post, a shoot, a new direction.",
    },
  ],
};
