// Where the rest of the app reaches the Stage. The Stage mounts once (three.js and all),
// in the background soon after the app loads, so the assistant and outside agents can
// stage a scene from any section; until then, `stageReady` waits for it.

let resolve;
export const stageReady = new Promise((r) => (resolve = r));
export const setStage = (api) => resolve(api);
