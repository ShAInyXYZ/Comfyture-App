// The assistant on the Control page: the same chat bar as the app's. What you
// ask goes to the assistant (Gemma 4, in ComfyUI) with the stage as it is and
// a picture of the frame; it answers with Control commands, which run here as
// one undo step.

import { h, icon, sprite } from "../dom.js";

const LABEL = {
  layout: (a, r) => {
    const [c, p] = [r.characters?.length ?? 0, r.props?.length ?? 0];
    return c + p ? `Staged ${[c && `${c} ${c === 1 ? "character" : "characters"}`, p && `${p} ${p === 1 ? "prop" : "props"}`].filter(Boolean).join(", ")}` : null;
  },
  add_character: (a) => `Added ${a.name ?? "a character"}`,
  add_prop: (a) => `Added ${a.label ?? a.type ?? "a prop"}`,
  place: (a) => `Moved ${a.id}`,
  pose: (a) => `${a.id}: ${a.pose}${a.mirror ? ", mirrored" : ""}`,
  joint: (a) => `${a.id}: ${a.joint}`,
  reach: (a) => `${a.id}: ${a.effector} to ${Array.isArray(a.target) ? "a point" : a.target}`,
  remove: (a) => `Removed ${a.id}`,
  camera: (a) => `Camera${a.snap ? `: ${a.snap.replace(/-/g, " ")}` : ""}${a.focal ? `, ${a.focal} mm` : ""}${a.ratio ? `, ${a.ratio}` : ""}`,
  to_blender: () => "Sent to Blender",
  from_blender: () => "Back from Blender",
};

export function mountChat(el, stage, { ops, look }) {
  const messages = [];
  let busy = "";
  // the conversation: folded, the last exchange only (after an answer, so the frame stays in view), or all of it
  let open = "closed";

  const input = h("textarea.chat-input", { rows: 1, placeholder: "Stage a scene — two people arguing by a wall, low angle", "aria-label": "Ask the assistant" });
  const grow = () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
  };
  const key = h("button.send", { type: "button", title: "Send — Enter", "aria-label": "Send", on: { click: () => send() } }, sprite("send"));
  const status = h("span.bar-status");
  const toggle = h("button.composer-key.thread-key", { type: "button", "aria-label": "Conversation", hidden: true, on: { click: () => ((open = open === "all" ? "closed" : "all"), render()) } });
  const bar = h("div.chat-bar", {}, h("div.bar-row.ctl-bar-row", {}, input, status, toggle, key));
  input.addEventListener("input", grow);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
    if (e.key === "Escape" && open !== "closed") (open = "closed"), render();
  });

  /** Runs the answer's commands: the stage ones as one undo step, then the trip to Blender. */
  async function apply(actions) {
    const did = [];
    const failed = [];
    const local = actions.filter((a) => ops[a.op]);
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
      const cast = stage.characters.length;
      if (cast > castBefore && !local.some((a) => a.op === "camera" || (a.op === "layout" && a.args?.camera))) stage.snap(stage.lastSnap ?? "three-quarter-left", null);
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
    return { did, failed, undo: stage.history.length > before };
  }

  async function send() {
    const text = input.value.trim();
    if (!text || busy) return;
    input.value = "";
    grow();
    messages.push({ role: "user", text });
    busy = "Staging";
    open = "last";
    render();
    const assist = async (extra = []) => {
      const res = await fetch("api/control/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, ...extra].map(({ role, text, did, failed }) => ({ role, text, did, failed })),
          scene: ops.scene(),
          look: look({ width: 640 }),
        }),
      });
      const answer = await res.json();
      if (!res.ok) throw new Error(answer.error ?? "The assistant did not answer.");
      return answer;
    };
    try {
      let answer = await assist();
      let done = await apply(answer.actions ?? []);
      // what failed goes back once, so the assistant can mend its own answer
      if (done.failed.length) {
        busy = "Fixing";
        render();
        const told = [{ role: "assistant", text: answer.reply, did: done.did, failed: done.failed }, { role: "user", text: "Some of that failed (see above). Answer again with only the actions that fix it, using only the listed poses, props, snaps and frames." }];
        const fix = await assist(told);
        const again = await apply(fix.actions ?? []);
        answer = { reply: again.failed.length ? answer.reply : fix.reply || answer.reply };
        done = { did: [...done.did, ...again.did], failed: again.failed, undo: done.undo || again.undo, steps: (done.undo ? 1 : 0) + (again.undo ? 1 : 0) };
      }
      messages.push({ role: "assistant", text: answer.reply, ...done });
    } catch (error) {
      messages.push({ role: "assistant", text: error.message, error: true });
    } finally {
      busy = "";
      render();
    }
  }

  function message(m, last) {
    if (m.role === "user") return h("div.msg.is-user", {}, h("p", {}, m.text));
    return h("div.msg.is-ai", { className: m.error ? "is-error" : "" },
      h("p", {}, m.text),
      m.did?.length || m.failed?.length
        ? h("div.msg-chips", {},
          ...m.did.map((d) => h("span.chip", {}, icon(d === "Undone" ? "remix" : "check"), d)),
          ...m.failed.map((f) => h("span.chip.is-failed", { title: f }, icon("close"), f.split(":")[0].replace(/_/g, " "))))
        : null,
      last && m.undo ? h("button.key.is-sm.is-quiet.undo", { type: "button", title: "Put the stage back as it was", on: { click: () => {
        for (let i = 0; i < (m.steps ?? 1); i++) stage.undo();
        m.undo = false;
        m.did.push("Undone");
        render();
      } } }, icon("remix"), "Undo") : null,
    );
  }

  let thread;
  function render() {
    key.disabled = !!busy;
    status.replaceChildren(...(busy ? [h("span.typing", {}, h("i"), h("i"), h("i"))] : []));
    toggle.hidden = !messages.length;
    toggle.replaceChildren(sprite("message"), h("span.thread-count", {}, String(messages.length)));
    toggle.dataset.tooltip = open === "all" ? "Fold the conversation" : "Show the conversation";
    toggle.setAttribute("aria-pressed", String(open === "all"));
    const lastAi = messages.findLastIndex((m) => m.role === "assistant");
    const from = open === "all" ? 0 : Math.max(0, messages.findLastIndex((m) => m.role === "user"));
    thread = h("div.chat-thread", {},
      messages.slice(from).map((m, i) => message(m, i + from === lastAi)),
      busy ? h("div.msg.is-ai.is-busy", {}, h("span.typing", {}, h("i"), h("i"), h("i")), busy) : null);
    const panel = h("div.chat-panel", { className: open === "last" ? "is-last" : "", hidden: open === "closed" || !messages.length },
      h("div.panel-keys", {},
        h("button.key.is-sm.is-icon.is-quiet", { type: "button", disabled: !!busy, title: "Clear the conversation", "aria-label": "Clear the conversation", on: { click: () => ((messages.length = 0), (open = "closed"), render()) } }, icon("trash")),
        h("button.key.is-sm.is-icon.is-quiet", { type: "button", title: "Fold — Esc", "aria-label": "Fold the conversation", on: { click: () => ((open = "closed"), render()) } }, icon("chevron"))),
      thread);
    const typing = document.activeElement === input;
    el.replaceChildren(panel, bar);
    if (typing) input.focus({ preventScroll: true });
    requestAnimationFrame(() => (thread.scrollTop = thread.scrollHeight));
  }
  render();
}
