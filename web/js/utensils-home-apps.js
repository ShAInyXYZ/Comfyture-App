// Home's MINI APPS: "the poster wall". Six tall posters, 3:4, hung at different heights, each a mini app from ComfyUI's own workflows
// with its picture, its name and its promise; a poster opens its app in the Templates workspace. The six are read from the live list
// (a mix of what they make: a picture, a clip, a sound, a model), so a new app can be on the wall without a change here. A mono counter
// says how many apps and templates there are, and "Browse all" opens them. Without Comfy Cloud the wall says so, quietly.
import { apps, loadApps, openApp } from "./utensils-templates-api.js";
import { appPicture, priceOf } from "./utensils-apps-ui.js";
import { templatesTotal, loadTemplatesTotal } from "./utensils-space-shelf.js";
import { h, sprite, icon, eyebrow, line, setWorkspace } from "./utensils-home-ui.js";

const MEDIUM = { image: ["image-library", "Picture"], video: ["film-make", "Video"], audio: ["audio-music", "Sound"], "3d": ["tool-templates", "3D"] };
/** How far each of the six hangs from the top, in rem: the wall is not a row. */
const HANG = [1.5, 4.25, 0, 3, 1, 4.75];

/** Six apps that make different things when the list has them, in the list's own order otherwise. */
function pick(list) {
  const withPic = list.filter((a) => a.thumb);
  const seen = new Set();
  const first = withPic.filter((a) => (seen.has(a.medium) ? false : (seen.add(a.medium), true)));
  const rest = withPic.filter((a) => !first.includes(a));
  const chosen = [...first, ...rest].slice(0, 6);
  return list.filter((a) => chosen.includes(a));
}

export function appsSection() {
  const wall = h("div.hm-wall");
  const counter = h("span.hm-count", {});
  const browse = h("button.hm-browse", { type: "button", title: "Open every mini app", dataset: { go: "apps" }, on: { click: () => (setWorkspace("templates"), document.dispatchEvent(new CustomEvent("utensils:apps"))) } }, "Browse all", icon("next"));

  function poster(a, i) {
    const [glyph, word] = MEDIUM[a.medium] ?? MEDIUM.image;
    const price = priceOf(a);
    return h("button.hm-poster", { type: "button", title: `${a.title}: ${a.promise}`, dataset: { app: a.id }, style: { "--hang": `${HANG[i % HANG.length]}rem` }, on: { click: () => openApp(a) } },
      appPicture(a, { after: false }),
      h("span.hm-poster-kind", {}, sprite(glyph), h("span", {}, word)),
      h("span.hm-poster-text", {}, h("b", {}, a.title), h("span", {}, a.promise), price ? h("em", {}, price) : null));
  }
  function build() {
    loadTemplatesTotal();
    loadApps();
    const list = pick(apps.list);
    const t = templatesTotal();
    counter.textContent = apps.total ? `${apps.total} apps${t ? ` · ${t} templates` : ""}` : "";
    wall.classList.toggle("is-empty", !list.length);
    wall.replaceChildren(...(list.length
      ? list.map(poster)
      : [h("p.hm-empty", {}, apps.state === "none" ? "Mini apps need Comfy Cloud: they hang here once it is connected." : "Hanging the posters…")]));
  }

  const el = h("section.hm", { "aria-label": "Mini apps", dataset: { section: "apps" } },
    h("header.hm-head", {},
      h("div.hm-heading", {}, eyebrow("Utensils · 06"), h("h2.hm-title", {}, "Mini apps", counter)),
      line("A ready-made workflow with one form: a picture in, a result out."),
      browse),
    wall);

  function update() {
    build();
  }
  const sig = () => JSON.stringify([apps.state, apps.total, templatesTotal(), pick(apps.list).map((a) => [a.id, a.credits])]);
  return { el, update, sig };
}
