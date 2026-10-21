// The Utensils HOME: where the product opens. Not a workspace among the others but a page of its own: the shell (panels/utensils.js)
// takes the left panel away while Home is open and lets the page scroll, and Truffle's bar floats at the foot of it. It reads top to
// bottom: a header band (who Truffle is, the question "What shall we make or fix?" with a search over every tool and mini app, the way
// into each workspace and what is running), then one section for each of Picture, Video, Audio, VFX, Edit and the Mini apps, and the
// Shelf's index as the foot. Each section is a component of its own (utensils-home-<name>.js), with its own markup and its own look
// (css/ut-home.css): they share only the typography of a section's head and the Open key (utensils-home-ui.js).
// Mockups: docs/brand/products/utensils-v4/utensils-v4-1.png to -3.png.
// A workspace is { el, update, sig, count }: the shell draws it again when sig() changes. The parts are made once and kept (a slider
// that was dragged, a clip that plays), and each is updated only when what it reads has changed.
import { h } from "./dom.js";
import { headBand } from "./utensils-home-head.js";
import { pictureSection } from "./utensils-home-picture.js";
import { videoSection } from "./utensils-home-video.js";
import { audioSection } from "./utensils-home-audio.js";
import { vfxSection } from "./utensils-home-vfx.js";
import { editSection } from "./utensils-home-edit.js";
import { appsSection } from "./utensils-home-apps.js";
import { shelfSection } from "./utensils-home-shelf.js";

export function homeSpace() {
  const parts = [headBand(), pictureSection(), videoSection(), audioSection(), vfxSection(), editSection(), appsSection(), shelfSection()];
  const el = h("div.hp", {}, ...parts.map((p) => p.el));
  const last = parts.map(() => null);

  function update() {
    parts.forEach((p, i) => {
      const s = p.sig();
      if (s === last[i]) return;
      last[i] = s;
      p.update();
    });
  }
  const sig = () => parts.map((p) => p.sig()).join("|");
  return { el, update, sig, count: () => null };
}
