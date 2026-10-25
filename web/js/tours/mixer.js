// Mixer's tour: Praline shows a newcomer around, on one of the trends the crew has made (Mixer's own shelf, web/js/mixer-trends.js),
// from the shelf to the version made. Make it is played for free: the trend's own preview, our crew's version, is what it shows.
// Mixer draws its whole page again on every change, so a step whose key changes the page moves on to the next (then: "next").
import { TRENDS } from "../mixer-trends.js";
import { mixer, loadMixes } from "../mixer.js";
import { pick, castOf, selectTrend, setKind, swapRole } from "../mixer-trend.js";
import { simulate } from "../tour.js";

/** The example: the hottest trend on Mixer's shelf that the crew has made (its preview, its recipe, its beats), one Praline is in first. */
const shelf = TRENDS.filter((t) => (t.home === "mixer" || t.also?.includes("mixer")) && !t.soon && t.preview && t.recipe && t.beats?.length);
const hottest = (list) => [...list].sort((a, b) => b.heat - a.heat)[0];
const trend = hottest(shelf.filter((t) => t.cast.some((c) => c.crew === "praline"))) ?? hottest(shelf) ?? TRENDS[0];
const starring = trend.cast.some((c) => c.crew === "praline");
const leading = trend.cast[0]?.crew === "praline";
const lead = (trend.cast[0]?.role ?? "lead").toLowerCase();

const $ = (sel) => document.querySelector(sel);
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const frames = (n = 2) => new Promise((done) => {
  const tick = () => (--n <= 0 ? done() : requestAnimationFrame(tick));
  requestAnimationFrame(tick);
});

/** The trend open on the shelf (a remix put away, the shelf showing every kind), drawn before the step lights anything. */
async function onTrend() {
  await loadMixes();
  if (pick.kind !== "all" && pick.kind !== trend.kind) setKind("all");
  if (pick.trend !== trend.id || mixer.mix?.body?.edit) selectTrend(trend.id);
  await frames();
}
/** Mixer's page scrolls in its own frame: the part a step is about brought into view, once the scroll has settled. */
async function into(sel, block = "center") {
  const box = document.getElementById("page-mixer");
  const el = typeof sel === "function" ? sel() : $(sel);
  if (!box || !el) return;
  const behavior = reduced() ? "auto" : "smooth";
  if (block === "top") box.scrollTo({ top: 0, behavior });
  // at the top of the page's frame, a little under the header (the light stays clear of it)
  else if (block === "start") box.scrollTo({ top: box.scrollTop + el.getBoundingClientRect().top - box.getBoundingClientRect().top - 10, behavior });
  else el.scrollIntoView({ block, inline: "nearest", behavior });
  let last = -1;
  for (let i = 0, same = 0; i < 60 && same < 4; i++) {
    await frames(1);
    same = box.scrollTop === last ? same + 1 : 0;
    last = box.scrollTop;
  }
}
const open = (sel, block) => async () => (await onTrend(), sel && (await into(sel, block)));

// our crew's version, in the cover's frame: the trend's own preview (nothing is made); its cross puts the cover back
const playing = () => !!$(".mx-preview .mx-watch-x");
async function playOurs() {
  const key = $(".mx-screen.is-cover > .mx-watch") ?? [...document.querySelectorAll(".mx-versions button")].find((b) => b.textContent === "Ours" && b.getAttribute("aria-pressed") !== "true");
  key?.click();
  await frames();
}
async function backToCover() {
  const x = $(".mx-preview .mx-watch-x");
  if (x) (x.click(), await frames());
}

const crewPanel = () => $(".mx-crew")?.closest(".mx-panel");
const starsPanel = () => $(".mx-stars")?.closest(".mx-panel");

export default {
  title: "Mixer",
  // left before its end, the tour stops the preview it played
  end: () => document.querySelectorAll("#page-mixer video").forEach((v) => v.pause()),
  steps: [
    {
      go: open("#page-mixer", "top"),
      title: "Trends, made yours",
      text: `Hi, I'm **Praline**, the crew's ringleader. Mixer takes a trend that's going round and makes it yours: your cast in it, on the trend's own moves and timing. Let's open ${starring ? "one I star in" : "one of ours"}, **${trend.name}**: nothing is spent.`,
    },
    {
      go: open("#page-mixer", "top"),
      target: ".mx-feed",
      place: "bottom",
      pad: 6,
      title: "Trending now",
      text: "What's going round right now, each with its length and how hot it is. The crew stars in every one; the chips show one kind at a time, and a click opens a trend.",
    },
    {
      go: open(".mx-beats"),
      target: ".mx-beats",
      title: "The recipe",
      text: `**${trend.name}**, open. Its cover is the first frame your version starts from, and its **beats** say what happens when. Yours keeps them, on the trend's **Original sound**.`,
    },
    {
      go: open(".mx-cast-col"),
      target: ".mx-cast-col",
      title: "Cast",
      text: `Who plays each role: the crew, until you say otherwise. The arrows hand a role to the next of us, and **Pick** casts anyone else. ${leading ? "Fancy someone else in my place?" : `Fancy someone else as the ${lead}?`}`,
      // the page is drawn again with the new cast: the tour moves on (its light would be left on the old one)
      show: { label: `Swap the ${lead}`, run: () => swapRole(castOf()[0]?.role), then: "next" },
    },
    {
      go: open(crewPanel),
      target: crewPanel,
      title: "The crew",
      text: "Cats and owners alike. Click a role's face to pick it, then one of us: they take it. With no role picked, it goes to the first.",
    },
    {
      go: open(starsPanel),
      target: starsPanel,
      title: "You, or your pet",
      text: "A photo of you, your pet or a friend: **Add** it to **Your stars**, or drop it straight on a role's **Pick**. They play like any of us; the first frame is redrawn with them.",
    },
    {
      go: open(".mx-made"),
      target: ".mx-made",
      title: "Made with",
      text: "A **Picture** model redraws the first frame with your cast, and **LTX-2.5** rolls each take on our version's motion; **LoRAs** can add a style. Each says what it costs.",
    },
    {
      go: open(".mx-go"),
      target: ".mx-go",
      title: "Make it",
      text: "**Make it** draws the first frame, rolls every take and cuts them together on the trend's sound. It costs credits, so I'll play it for you for free.",
    },
    {
      go: async () => (await onTrend(), await backToCover(), await into(".mx-preview", "start")),
      target: ".mx-preview",
      title: "Your version plays here",
      text: "Right where the cover is. Press the key and I'll make it for free: our crew's own version stands in for yours.",
      show: {
        label: "Make it, for free",
        run: async () => {
          await simulate($(".mx-preview .mx-screen") ?? $(".mx-preview"), { label: "Making your version", seconds: 2.8 });
          await playOurs();
        },
        then: "next",
      },
    },
    {
      go: async () => (await onTrend(), playing() || (await playOurs()), await into(".mx-preview", "start")),
      target: ".mx-preview",
      title: "Ours, and yours",
      text: "This is ours, made by the crew. Yours plays in this frame too, with **Yours** and **Ours** to compare them, a download, and Kitchen's **Cut** to fine-tune it.",
    },
    {
      go: async () => (await onTrend(), await backToCover(), await into(".mx-remix-drop")),
      target: ".mx-remix-drop",
      title: "Remix any edit",
      text: "Drop in a video you like, up to 20 s: I find its cuts and remake it shot by shot with your cast. What you make waits in **My mixes**, just above.",
    },
    {
      go: async () => (await onTrend(), await backToCover()),
      target: "#assistant .composer",
      place: "top",
      title: "Ask me",
      text: "Or just tell me: \"the hottest trend with Mochi in the lead, then make it\", or press a chip. I set it all up; making costs credits, so I wait for your yes, with its price.",
    },
    {
      go: async () => (await onTrend(), await backToCover(), await into("#page-mixer", "top")),
      title: "Your turn",
      text: "Pick a trend and cast it your way, or drop in an edit to remix. I'm in my bar whenever you need me.",
    },
  ],
};
