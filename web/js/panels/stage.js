import { toast, useStageVideo, useStageRender } from "../store.js";
import { go } from "../router.js";
import { setStage } from "../control/link.js";

// the Stage mounts once: on its first visit, or in the background soon after the app loads
let mounting = null;

export function mountStage() {
  if (!mounting) {
    const el = document.getElementById("page-stage");
    mounting = import("../control/stage-page.js").then(({ mountStage: mount }) => {
      const api = mount(el, { toast, go, useVideo: useStageVideo, usePhoto: useStageRender });
      setStage(api);
      document.dispatchEvent(new CustomEvent("stage:ready"));
      return api;
    });
  }
  return mounting;
}

export function renderStage() {
  mountStage();
}
