// The open project, kept in step with the section on screen: Story opens its story, Shot one of
// its tabs (a new one if it has none), Cut its edit (a new one if it has none), the Stage one of its
// stages (a new one if it has none). Nothing of another project stays open in its place.
import { state, inProject, switchTab, newTab, openTake, loadProjects, projectNow } from "./store.js";
import { currentPage } from "./router.js";
import { story, loadStories, openStory } from "./story.js";
import { cut, loadCuts, openCut, newCut } from "./cut.js";
import { stageReady } from "./control/link.js";

// one at a time, each after the one before (a section opened while another settles is still seen to)
let queue = Promise.resolve();
export function align() {
  queue = queue.then(() => alignNow());
  return queue;
}
async function alignNow() {
  {
    try {
      const pid = state.project;
      if (!pid) return;
      const page = currentPage();
      const name = projectNow()?.name ?? story.list.find((s) => s.id === pid)?.name ?? "";
      if (page === "story") {
        await (story.ready ?? loadStories());
        if (story.project?.id !== pid && story.list.some((s) => s.id === pid)) await openStory(pid);
      } else if (page === "shot") {
        const now = state.tabs.find((t) => t.id === state.tab);
        if (!inProject("tab", now)) {
          const mine = state.tabs.find((t) => inProject("tab", t));
          // a film with takes and no tab here opens on its latest take; one with none, on a new shot
          const take = !mine && state.runs.find((r) => r.status === "done" && inProject("take", { id: r.id, project: r.request?.project }));
          mine ? switchTab(mine.id) : take ? openTake(take.id) : newTab();
        }
      } else if (page === "cut") {
        await (cut.ready ?? loadCuts());
        const meta = (id) => cut.list.find((c) => c.id === id) ?? { id };
        if (!cut.project || !inProject("cut", meta(cut.project.id))) {
          const mine = cut.list.find((c) => inProject("cut", c));
          mine ? await openCut(mine.id) : await newCut(name || "New edit");
        }
      } else if (page === "stage") {
        const { projects } = await stageReady;
        if (!projects) return;
        // the stages it opened first, on its own, are in place
        await projects.settled?.();
        const now = projects.current();
        if (!now || !inProject("stage", now)) {
          const mine = (await projects.list()).find((s) => inProject("stage", s));
          mine ? await projects.open(mine.id) : await projects.newProject(name ? `${name} — stage` : undefined);
        }
      }
    } catch (e) {
      console.warn("project:", e.message);
    }
  }
}

window.addEventListener("hashchange", () => align());
window.addEventListener("comfyture:project", () => align());
// what each project holds, then the section on screen in step with the project left open last time
loadProjects().then(() => align());
