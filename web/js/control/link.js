// Where the rest of the app reaches the Stage. The Stage (three.js and all) is not loaded with the app: it mounts
// once, when its room is opened, when something needs it, or when an outside agent's first command comes
// (panels/stage.js). `stageReady` waits for it without asking for it, for what only follows it once it is there;
// `needStage` asks for it, for what needs it now.

let resolve;
let up = null;
export const stageReady = new Promise((r) => (resolve = r));
export const setStage = (api) => ((up = api), resolve(api));

// the pictures a stage asked for that are still on their way (their ids, kept in the browser: a page loaded again hears of them)
const JOBS = "comfyture.stage.jobs";
const waitedOn = () => {
  try {
    return JSON.parse(localStorage.getItem(JOBS) ?? "[]");
  } catch {
    return [];
  }
};
/** A stage asked for this picture (on), or has it now (off). */
export function keepJob(id, on) {
  try {
    localStorage.setItem(JOBS, JSON.stringify([...waitedOn().filter((x) => x !== id), ...(on ? [id] : [])].slice(-40)));
  } catch {}
}
/** A picture's job moved on: the stage that asked for it hears of it. A page loaded again has no Stage up: it comes up for a picture it was waiting on. */
export function tellStage(job) {
  if (up) return up.stage.runDone(job);
  if (waitedOn().includes(job.id)) needStage().then(({ stage }) => stage.runDone(job));
}

/** The Stage, mounted if it is not yet, once the stage that was open last is open again. */
export const needStage = () =>
  import("../panels/stage.js")
    .then(({ mountStage }) => mountStage())
    .then(async (api) => (await api.projects.settled?.(), api));
