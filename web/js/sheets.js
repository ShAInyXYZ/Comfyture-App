// The styles of the products, loaded the first time a page needs them. index.html keeps the app's own and the ones used all over
// (material, app, control, story, home, welcome and tour); the rest come with their page. Each one goes where it was in the page's
// head (the order below is index.html's), so what a product's styles say still outranks what an earlier one's said, whichever page
// was opened first.

const ORDER = [
  "material", "app", "control", "story", "cut", "home", "welcome", "mixer",
  "ut-shell", "ut-shelf", "ut-picture", "ut-video", "ut-audio", "ut-vfx", "ut-edit", "ut-templates", "ut-library", "ut-home", "ut-guide", "ut-library-frame", "ut-makers",
  "macaron", "macaron-win", "macaron-win-idea", "macaron-win-kit", "macaron-win-content", "macaron-win-make", "macaron-win-studio", "mc-studio", "mc-create", "mc-book",
  "sp-shell", "sp-viewer", "sp-depts", "sp-fx", "sp-roto", "sp-paint", "sp-light", "sp-comp", "sp-win",
  "toaster", "toaster-projects", "jam", "jm-shell", "jm-song", "jm-track", "jm-words", "jm-band", "jm-edit", "tour",
];

const linkOf = (name) => document.head.querySelector(`link[href="css/${name}.css"]`);
const loading = new Map();

/**
 * What each product's page draws with, besides the app's own and Kitchen's shell (control, story and home are in index.html: the
 * bar, the Stage's small keys and Story's subbar are used all over). Found by turning each sheet off on each page: where a page
 * looks different without a sheet of another product, that sheet is listed here too.
 */
export const STYLES = {
  // (Cut's track heads wear the `.is-audio` rule of Utensils' sound sheet: the class is the same)
  cut: ["cut", "ut-audio"],
  mixer: ["mixer"],
  jam: ["cut", "ut-audio", "jam", "jm-shell", "jm-song", "jm-track", "jm-words", "jm-band", "jm-edit"],
  macaron: ["macaron", "macaron-win", "macaron-win-idea", "macaron-win-kit", "macaron-win-content", "macaron-win-make", "macaron-win-studio", "mc-studio", "mc-create", "mc-book"],
  // (Spice's controls are Utensils': its labels, pills, steppers, wells and sliders)
  // (Spice is the AI edit bay, bay.css; the first Spice, the VFX house, stays on #/spice?classic until it is retired)
  spice: ["bay"],
  spice1: ["ut-shell", "ut-picture", "ut-vfx", "sp-shell", "sp-viewer", "sp-depts", "sp-fx", "sp-roto", "sp-paint", "sp-light", "sp-comp", "sp-win"],
  toaster: ["toaster", "toaster-projects"],
  utensils: ["ut-shell", "ut-shelf", "ut-picture", "ut-video", "ut-audio", "ut-vfx", "ut-edit", "ut-templates", "ut-library", "ut-home", "ut-guide", "ut-library-frame", "ut-makers"],
};

function load(name) {
  if (!loading.has(name)) {
    loading.set(name, new Promise((done) => {
      const link = linkOf(name);
      if (link) return done(); // (in the page already)
      const sheet = document.createElement("link");
      sheet.rel = "stylesheet";
      sheet.setAttribute("href", `css/${name}.css`);
      // a sheet that does not come is not waited for: the page draws without it
      sheet.onload = sheet.onerror = () => done();
      const next = ORDER.slice(ORDER.indexOf(name) + 1).map(linkOf).find(Boolean);
      if (next) next.before(sheet);
      else document.head.append(sheet);
    }));
  }
  return loading.get(name);
}

/** The styles of these pages (see STYLES), once every one has loaded: draw after it, so nothing shows unstyled. */
export const styled = (...pages) => Promise.all([...new Set(pages.flatMap((p) => STYLES[p] ?? []))].map(load));
