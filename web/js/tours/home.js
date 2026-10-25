// The home's tour: Ketkout, head chef, shows a newcomer around the app's home (#/home): the banner of the seven products, each with its
// pet and what it starts from, the product menu, the storefront of Comfy Cloud's workflows, the account, and the compass that starts
// every tour. Nothing is made on the home, so nothing is spent; the last key leads into Kitchen, whose own tour takes over.
import { currentPage } from "../router.js";
import { letTourLeave, startTour, onTour } from "../tour.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The app's home on screen, scrolled to its top (or to where a step wants it). */
async function home() {
  if (currentPage() !== "home") location.hash = "#/home";
  for (let i = 0; i < 40 && !document.querySelector(".welcome-hero .welcome-tile")?.getClientRects().length; i++) await sleep(100);
  scrollTo({ top: 0, behavior: "instant" });
}

/**
 * The banner on one product, held there while I talk about it: its tile is clicked when it is not the lit one (a click on the lit one
 * would open the product), and its fill, the banner's clock, waits. Once the tour is over, the banner turns on by itself.
 */
function hold(id) {
  const tile = document.querySelector(`.welcome-tile[data-product="${id}"]`);
  if (!tile) return;
  if (tile.getAttribute("aria-current") !== "true") tile.click();
  for (const fill of document.querySelectorAll(".welcome-tile-fill")) fill.style.animationPlayState = fill.closest(".welcome-tile") === tile ? "paused" : "";
}
const release = () => document.querySelectorAll(".welcome-tile-fill").forEach((fill) => (fill.style.animationPlayState = ""));
onTour((product) => product !== "home" && release());

const on = (id) => async () => (await home(), hold(id));
/** One product on the banner: the light on its name, my card on its picture's side. */
const product = (id, title, text) => ({ go: on(id), target: () => document.querySelector(".welcome-slide.is-on h1"), place: "right", title, text });

/** The storefront under the banner, once its catalogue is read, at the top of the screen. */
async function storefront() {
  await on("utensils")();
  for (let i = 0; i < 30 && !document.querySelector(".wp-featured"); i++) await sleep(100);
  const head = document.querySelector(".welcome-section.wp");
  if (head) scrollTo({ top: scrollY + head.getBoundingClientRect().top - 16, behavior: "instant" });
}

export default {
  title: "Comfyture",
  steps: [
    {
      go: on("kitchen"),
      title: "Welcome to Comfyture",
      text: "Hi, I'm **Ketkout**, head chef. Comfyture is seven products for making pictures, videos and 3D with AI, each run by a pet who knows it inside out. Let me show you who does what: nothing is spent.",
    },
    {
      go: on("kitchen"),
      target: ".welcome-strip",
      place: "top",
      title: "Seven products",
      text: "The banner shows one at a time: who it's for, what it makes, and its **Open** key to go in. The tiles along its foot are all seven: click one to bring it up, then again to go in.",
    },
    product("kitchen", "Kitchen, with me", "The full studio for a film, and my own kitchen. You start from one sentence, **What's your film about?**, then take it room by room: **Story**, **Stage**, **Shot**, **Cut**, and the **Library** for all you've made."),
    product("mixer", "Mixer, with Praline", "A trend that's going round, made yours. Pick one off her shelf, cast the crew, your pet or yourself in it, and **Make it**. Or drop in an edit you like: she remakes it shot by shot."),
    product("jam", "Jam, with Pickle", "A song becomes a music video. Make the song with him or bring your own, then take it through his workspaces: the track, the words as captions, the band performing it, and the edit, cut on the beat."),
    product("macaron", "Macaron, with Brioche", "A brand's room. It starts with the brand itself, its idea and its kit; from those come shoots of the product, posts and ads in every format, and the brand book, all on brand."),
    product("spice", "Spice, with Paprika", "Her VFX house. Drop in one shot, a clip or a picture, and it goes through six departments, from the plate to the comp: each lays its pass on top of the last, so nothing is overwritten."),
    product("toaster", "Toaster, with Crumpet", "Clay in, toast out. Block out an object or a whole set in clay shapes, then **Toast it**: a finished picture, four views that agree, and a real 3D model."),
    product("utensils", "Utensils, with Truffle", "Her shelf of small tools, one job each: upscale, cut out, vary, lip-sync and more. Say the job and she finds the tool; her **Library** holds every official ComfyUI workflow."),
    {
      go: on("utensils"),
      target: "#products",
      place: "bottom",
      title: "Always up here",
      text: "The same seven, on every page: point at one to read what it's for, click it to go in. The one you're in is lit, and the wordmark on the left brings you back here.",
    },
    {
      go: storefront,
      target: () => document.querySelector(".wp-featured") ?? document.querySelector(".welcome-section.wp"),
      place: "bottom",
      title: "Popular on Comfy Cloud",
      text: "The official ComfyUI workflows, ranked by how often they're run; the chips above show one kind at a time. **Try it** opens one in Utensils as a little app, and nothing runs until you press its key.",
    },
    {
      go: on("utensils"),
      target: "#cloud",
      place: "bottom",
      title: "Where it's made",
      text: "Your Comfy account: where things are made. **Comfy Cloud** runs on credits, with your API key; **Your ComfyUI** is your own machine. Click it to choose, or to paste your key; whatever costs credits says so first.",
    },
    {
      go: on("utensils"),
      target: "#tour-key",
      place: "bottom",
      title: "Your turn",
      text: "Every pet shows you around its product like this, on its own example: press **Show me around** on its bar, or this compass on any page. Or come and see my kitchen first.",
      show: {
        label: "Show me Kitchen",
        // this tour ends (done) and Kitchen's begins, on its own page
        run: () => {
          letTourLeave();
          location.hash = "#/kitchen";
          setTimeout(() => startTour("kitchen"));
        },
        then: "next",
      },
    },
  ],
};
