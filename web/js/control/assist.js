// The assistant on the Stage: what you ask goes to the server's Control assistant with
// the stage as it is and a picture of the frame; it answers with Control commands,
// which run here as one undo step. Whatever fails goes back to it once, to mend.

const LABEL = {
  layout: (a, r) => {
    const [c, p] = [r.characters?.length ?? 0, r.props?.length ?? 0];
    return c + p ? `Staged ${[c && `${c} ${c === 1 ? "character" : "characters"}`, p && `${p} ${p === 1 ? "prop" : "props"}`].filter(Boolean).join(", ")}` : null;
  },
  add_character: (a) => `Added ${a.name ?? "a character"}`,
  add_prop: (a) => `Added ${a.label ?? a.type ?? "a prop"}`,
  place: (a) => (a.name && Object.keys(a).length <= 2 ? `Renamed ${a.id}` : `Placed ${a.id}`),
  rename: (a) => `Renamed to ${a.name}`,
  pose: (a) => (a.pose ? `${a.id}: ${a.pose}${a.mirror ? ", mirrored" : ""}` : `${a.id}: ${Object.keys(a.params ?? {}).join(", ")}`),
  joint: (a) => `${a.id}: ${a.joint}`,
  reach: (a) => `${a.id}: ${a.effector} to ${Array.isArray(a.target) ? "a point" : a.target}`,
  remove: (a) => `Removed ${a.id}`,
  camera: (a) => `Camera${a.snap ? `: ${a.snap.replace(/-/g, " ")}` : ""}${a.focal ? `, ${a.focal} mm` : ""}${a.ratio ? `, ${a.ratio}` : ""}`,
  camera_move: (a, r) => `Camera move: ${String(r.move ?? a.move).replace(/-/g, " ")}`,
  move_to: (a) => `${a.id} ${a.gait === "run" ? "runs" : "walks"} to ${Array.isArray(a.to) ? "a point" : a.to ?? a.next_to ?? "a place"}`,
  key: (a) => `Key: ${a.id ?? "camera"}`,
  duration: (a) => `Shot length ${a.seconds ?? a.duration} s`,
  to_blender: () => "Sent to Blender",
  from_blender: () => "Back from Blender",
  render_image: (a, r) => (r.jobs?.length > 1 ? `Rendering ${r.jobs.length} images` : "Rendering an image"),
  tag: (a) => `${a.id}'s sheet`,
};
// what waits for the stage to be set first, and takes its time: a picture of the frame
const AFTER = new Set(["render_image"]);

/** Runs an answer's commands: the stage ones as one undo step, then the trip to Blender. */
async function apply({ stage, ops }, actions) {
  const did = [];
  const failed = [];
  const local = actions.filter((a) => ops[a.op] && !AFTER.has(a.op));
  const before = stage.history.length;
  const castBefore = stage.characters.length;
  if (local.length) {
    stage.batch(() => {
      for (const { op, args } of local) {
        try {
          const result = ops[op](args);
          const label = LABEL[op] ? LABEL[op](args, result ?? {}) : op;
          if (label && !did.includes(label)) did.push(label);
        } catch (error) {
          failed.push(`${op}: ${error.message}`);
        }
      }
    });
    // someone new with no word on the camera: the same angle, framing everyone
    if (stage.characters.length > castBefore && !local.some((a) => a.op === "camera" || a.op === "camera_move" || (a.op === "layout" && a.args?.camera))) stage.snap(stage.lastSnap ?? "three-quarter-left", null);
    // a fresh layout is looked at, not edited: no gizmo over the frame
    if (local.some((a) => a.op === "layout")) stage.select({});
    stage.render();
  }
  for (const { op } of actions.filter((a) => a.op === "to_blender" || a.op === "from_blender")) {
    const res = await fetch(`api/control/blender/${op === "to_blender" ? "push" : "pull"}`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (res.ok) did.push(LABEL[op]());
    else failed.push(body.error ?? `${op} failed`);
  }
  const renders = [];
  for (const { op, args } of actions.filter((a) => AFTER.has(a.op))) {
    try {
      const result = await ops[op](args ?? {});
      renders.push(result);
      did.push(LABEL[op](args, result));
    } catch (error) {
      failed.push(`${op}: ${error.message}`);
    }
  }
  return { did, failed, undo: stage.history.length > before, renders };
}

/**
 * Asks the assistant about the stage. `messages` is the conversation so far, ending with
 * what was just said; `onBusy` hears what it is doing. Returns the answer as a message.
 */
export async function stageAssist(api, messages, onBusy = () => {}, model) {
  const { stage, ops } = api;
  const ask = async (extra = []) => {
    const res = await fetch("api/control/assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [...messages, ...extra].filter((m) => !m.error).map(({ role, text, did, failed }) => ({ role, text, did, failed })),
        scene: ops.scene(),
        look: stage.frameStill("clay", { long: 640 }),
      }),
    });
    const answer = await res.json();
    if (!res.ok) throw new Error(answer.error ?? "The assistant did not answer.");
    return answer;
  };
  let answer = await ask();
  let done = await apply(api, answer.actions ?? []);
  // what failed goes back once, so the assistant can mend its own answer
  if (done.failed.length) {
    onBusy("Fixing");
    const told = [{ role: "assistant", text: answer.reply, did: done.did, failed: done.failed }, { role: "user", text: "Some of that failed (see above). Answer again with only the actions that fix it, using only the listed poses, assets, snaps and frames." }];
    const fix = await ask(told);
    const again = await apply(api, fix.actions ?? []);
    answer = { reply: again.failed.length ? answer.reply : fix.reply || answer.reply };
    done = { did: [...done.did, ...again.did], failed: again.failed, undo: done.undo || again.undo, steps: (done.undo ? 1 : 0) + (again.undo ? 1 : 0), renders: [...done.renders, ...again.renders] };
  }
  return { role: "assistant", stage: true, text: answer.reply, ...done };
}
