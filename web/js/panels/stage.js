import { toast, useStageVideo, useStageRender, editStageRun, makeStageRef } from "../store.js";
import { go } from "../router.js";
import { setStage } from "../control/link.js";

// The Stage (three.js, its code and its models) is not loaded with the app. It mounts once: when its room is
// first opened, when something needs it (needStage in control/link.js), or when an outside agent sends its first command.
let mounting = null;

// The stream an outside agent's commands come on (the control MCP, through the server), listened to from the start so
// the server knows a page is open, and the commands that came before the Stage was up: it answers them once it is.
let agents = null;
const early = [];
const hold = (e) => {
  early.push(e.data);
  // a Stage that cannot start (no WebGL) tells the agent so, rather than leaving it to wait
  mountStage().catch((error) => {
    for (const data of early.splice(0)) {
      fetch("api/control/reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: JSON.parse(data).id, ok: false, error: `The Stage could not start: ${error.message}` }) }).catch(() => {});
    }
  });
};

/** Listens for an outside agent; its first command mounts the Stage and is handed to it. */
export function listenForAgents() {
  if (agents || mounting) return;
  agents = new EventSource("api/control/events");
  agents.addEventListener("command", hold);
}

export function mountStage() {
  if (!mounting) {
    const el = document.getElementById("page-stage");
    mounting = Promise.all([import("../control/stage-page.js"), import("../control/assets.js")]).then(async ([{ mountStage: mount }, { loadCatalogue }]) => {
      // which pieces the library holds is read before the first scene is built; the models come as the scene asks
      await loadCatalogue();
      const api = mount(el, { toast, go, useVideo: useStageVideo, usePhoto: useStageRender, editRunWith: editStageRun, makeRef: makeStageRef, agents, early });
      // the Stage has taken over the stream and the commands that waited
      agents?.removeEventListener("command", hold);
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
