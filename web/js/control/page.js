// The Control page: panels around the stage. Everything the panels show comes
// from the stage; everything they change goes through it, so undo covers all.

import { h, icon, sprite } from "../dom.js";
import { installTooltips } from "../tooltip.js";
import { Stage, SNAPS, RATIOS } from "./stage.js";
import { POSES } from "./poses.js";
import { PROP_TYPES } from "./props.js";
import { JOINT_NAMES, JOINT_LABELS } from "./skeleton.js";
import { connectRemote, controlOps } from "./remote.js";
import { mountChat } from "./chat.js";

const $ = (id) => document.getElementById(id);
const stage = new Stage($("stage"), $("frame"));
window.controlStage = stage;

const expanded = new Set();
const TOOLS = [
  ["select", "web-cursor", "Select", "Q"],
  ["rotate", "transform-rotate", "Rotate — turn the selected joint", "E"],
  ["move", "transform-move", "Move — the body, a prop, or a hand or foot by IK", "W"],
  ["scale", "transform-scale", "Scale — props", "R"],
];
const PROP_ICON = { box: "prop-box", cylinder: "prop-cylinder", sphere: "prop-sphere", plane: "prop-wall", stairs: "prop-stairs" };

// ---------------------------------------------------------------- header

$("render").replaceChildren(sprite("scene-render"), h("span", {}, "Render references"));

// ---------------------------------------------------------------- scene outliner

function outliner() {
  const sel = stage.selection;
  const row = (props, ...children) => h("div.ctl-node", { role: "treeitem", ...props }, ...children);
  const eye = (object, visible, set) =>
    h("button.ctl-mini", { type: "button", "aria-pressed": String(!visible), title: visible ? "Hide" : "Show", "aria-label": visible ? "Hide" : "Show", on: { click: (e) => (e.stopPropagation(), set(!visible)) } }, sprite("eye"));
  const items = [];
  for (const c of stage.characters) {
    const open = expanded.has(c.id);
    items.push(row({
      className: `is-character${sel.character === c && !sel.joint ? " is-selected" : ""}${sel.character === c ? " is-within" : ""}`,
      on: { click: () => stage.select({ character: c }) },
    },
      h("button.ctl-mini.ctl-fold", { type: "button", "aria-expanded": String(open), "aria-label": open ? "Fold" : "Show the joints", on: { click: (e) => (e.stopPropagation(), open ? expanded.delete(c.id) : expanded.add(c.id), outliner()) } }, icon("chevron")),
      h("span.ctl-chip", { style: { background: `#${c.color.getHexString()}` } }),
      h("span.ctl-name", {}, c.name),
      eye(c, c.root.visible, (v) => (c.setVisible(v), stage.commit(), stage.render(), outliner())),
      h("button.ctl-mini", { type: "button", title: "Remove", "aria-label": `Remove ${c.name}`, on: { click: (e) => (e.stopPropagation(), stage.remove({ character: c })) } }, icon("trash")),
    ));
    if (open) {
      for (const j of JOINT_NAMES) {
        items.push(row({
          className: `is-joint${sel.character === c && sel.joint === j ? " is-selected" : ""}`,
          style: { "--depth": String(depth(j)) },
          on: { click: () => stage.select({ character: c, joint: j }) },
        }, h("span.ctl-name", {}, JOINT_LABELS[j])));
      }
    }
  }
  for (const p of stage.props) {
    items.push(row({ className: sel.prop === p ? "is-selected" : "", on: { click: () => stage.select({ prop: p }) } },
      h("span.ctl-mini.ctl-glyph", {}, sprite(PROP_ICON[p.userData.type] ?? "prop-box")),
      h("span.ctl-name", {}, p.userData.label),
      eye(p, p.visible, (v) => ((p.visible = v), stage.commit(), stage.render(), outliner())),
      h("button.ctl-mini", { type: "button", title: "Remove", "aria-label": `Remove ${p.userData.label}`, on: { click: (e) => (e.stopPropagation(), stage.remove({ prop: p })) } }, icon("trash")),
    ));
  }
  if (!items.length) items.push(h("p.ctl-empty", {}, "Add a character to start."));
  $("outliner").replaceChildren(...items);
}

function depth(joint) {
  let d = 0;
  for (let j = joint; j; ) {
    const parent = { Spine: "Hips", Chest: "Spine", Neck: "Chest", Head: "Neck", LeftShoulder: "Chest", RightShoulder: "Chest", LeftArm: "LeftShoulder", RightArm: "RightShoulder", LeftForeArm: "LeftArm", RightForeArm: "RightArm", LeftHand: "LeftForeArm", RightHand: "RightForeArm", LeftUpLeg: "Hips", RightUpLeg: "Hips", LeftLeg: "LeftUpLeg", RightLeg: "RightUpLeg", LeftFoot: "LeftLeg", RightFoot: "RightLeg", LeftToe: "LeftFoot", RightToe: "RightFoot" }[j];
    if (!parent) break;
    d++;
    j = parent;
  }
  return Math.min(d, 5);
}

$("add").replaceChildren(
  h("button.ctl-tile.is-icon", { type: "button", title: "Add a character", "aria-label": "Add a character", on: { click: () => stage.addCharacter() } }, sprite("character-add")),
  ...PROP_TYPES.map(([type, label]) =>
    h("button.ctl-tile.is-icon", { type: "button", title: `Add a ${label.toLowerCase()}`, "aria-label": `Add a ${label.toLowerCase()}`, on: { click: () => stage.addProp(type) } }, sprite(PROP_ICON[type]))),
);

// ---------------------------------------------------------------- poses

function poses() {
  const target = stage.selection.character;
  $("poses").replaceChildren(...POSES.map((p) =>
    h("button.ctl-pose", { type: "button", title: target ? p.name : `${p.name} — select a character first`, "aria-label": p.name, disabled: !target, on: { click: () => stage.applyPose(p.id) } },
      h("img", { src: stage.poseThumbnail(p.joints), alt: "", draggable: false }))));
}

// ---------------------------------------------------------------- tools

function tools() {
  const sel = stage.selection;
  const key = (id, ic, label, extra = {}) => h("button.ctl-tool", { type: "button", "aria-label": label, title: label, ...extra }, sprite(ic));
  $("tools").replaceChildren(
    ...TOOLS.map(([id, ic, label, k]) => key(id, ic, label, { "aria-pressed": String(stage.tool === id), "data-tooltip-key": k, on: { click: () => stage.setTool(id) } })),
    h("span.ctl-sep"),
    key("mirror", "flip-h", "Mirror the pose", { "data-tooltip-key": "M", disabled: !sel.character, on: { click: () => stage.mirror() } }),
    key("reset", "pose-rest", "Back to standing", { disabled: !sel.character, on: { click: () => stage.resetPose() } }),
    h("span.ctl-sep"),
    key("undo", "edit-undo", "Undo", { "data-tooltip-key": "Ctrl Z", disabled: stage.history.length < 2, on: { click: () => stage.undo() } }),
    key("redo", "edit-redo", "Redo", { "data-tooltip-key": "Ctrl Shift Z", disabled: !stage.future.length, on: { click: () => stage.redo() } }),
  );
  const hint = !stage.characters.length ? "Add a character to start"
    : !sel.character && !sel.prop ? "Click a body or a prop"
    : stage.tool === "rotate" && sel.character && !sel.joint ? "Click a body part to turn its joint"
    : stage.tool === "move" && sel.character ? "Drag the yellow handles to place a hand or foot"
    : "";
  $("hint").textContent = hint;
  $("hint").hidden = !hint;
}

// ---------------------------------------------------------------- camera

let snapTimer = 0;
function snaps() {
  clearTimeout(snapTimer);
  // the tiles show the scene from each angle; they follow the pose, a moment after it settles
  snapTimer = setTimeout(() => {
    const c = stage.selection.character ?? stage.characters[0];
    $("snaps").replaceChildren(...SNAPS.map(([id, label]) => {
      const pose = c ? stage.snapPose(id, c) : null;
      return h("button.ctl-snap", { type: "button", title: label, "aria-label": label, disabled: !c, on: { click: () => stage.snap(id) } },
        pose ? h("img", { src: stage.thumbnail(pose), alt: "", draggable: false }) : h("span.ctl-snap-empty", {}, sprite("scene-render")));
    }));
  }, 120);
}

const focal = $("focal");
focal.addEventListener("input", () => stage.setFocal(Number(focal.value)));

function frame() {
  focal.value = String(stage.focal);
  $("focal-out").textContent = `${stage.focal} mm`;
  $("ratios").replaceChildren(...Object.keys(RATIOS).map((r) =>
    h("button.ctl-ratio", { type: "button", "aria-pressed": String(stage.ratio === r), title: r, "aria-label": r, on: { click: () => stage.setRatio(r) } },
      sprite(`ratio-${r.replace(":", "-")}`), h("span", {}, r))));
  $("guides").replaceChildren(
    toggle("Thirds", stage.guides.thirds, (v) => stage.setGuides({ thirds: v })),
    toggle("Safe frame", stage.guides.safe, (v) => stage.setGuides({ safe: v })),
  );
}

function toggle(label, on, set) {
  return h("button.ctl-toggle", { type: "button", "aria-pressed": String(on), on: { click: () => set(!on) } }, h("span.ctl-box"), label);
}

// ---------------------------------------------------------------- the selection

function selected() {
  const { character, joint, prop } = stage.selection;
  const el = $("selected");
  if (!character && !prop) return el.replaceChildren(h("p.ctl-empty", {}, "Nothing selected."));
  if (prop) {
    return el.replaceChildren(h("p.ctl-sel-name", {}, prop.userData.label),
      h("div.ctl-xyz", {}, ...["x", "y", "z"].map((a) => h("label.ctl-num", {}, h("span", {}, `${a.toUpperCase()}`), h("output", {}, prop.position[a].toFixed(2))))),
      h("p.ctl-sub", {}, "Position, metres"));
  }
  if (!joint) {
    return el.replaceChildren(h("p.ctl-sel-name", {}, h("span.ctl-chip", { style: { background: `#${character.color.getHexString()}` } }), character.name),
      h("p.ctl-sub", {}, `${character.profile.name} · ${character.profile.height.toFixed(2)} m`));
  }
  const euler = stage.jointEuler();
  el.replaceChildren(h("p.ctl-sel-name", {}, JOINT_LABELS[joint]),
    h("div.ctl-xyz", {}, ...["x", "y", "z"].map((a, i) =>
      h("label.ctl-num", {}, h("span", {}, a.toUpperCase()),
        h("input", { type: "number", step: 1, value: euler[i], "aria-label": `${JOINT_LABELS[joint]} ${a}`, on: { change: (e) => stage.setJointEuler(a, Number(e.target.value) || 0) } }),
        h("i", {}, "°")))),
    h("p.ctl-sub", {}, `${character.name}`));
}

function readouts() {
  const euler = stage.jointEuler();
  if (!euler) return;
  document.querySelectorAll("#selected .ctl-num input").forEach((input, i) => {
    if (document.activeElement !== input) input.value = String(euler[i]);
  });
}

// ---------------------------------------------------------------- keys

document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea")) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === "z") {
    e.preventDefault();
    return e.shiftKey ? stage.redo() : stage.undo();
  }
  if ((e.ctrlKey || e.metaKey) && k === "y") return e.preventDefault(), stage.redo();
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tool = { q: "select", e: "rotate", w: "move", r: "scale" }[k];
  if (tool) return stage.setTool(tool);
  if (k === "m") return stage.mirror();
  if (k === "f") return stage.snap("front");
  if (k === "delete" || k === "backspace") return stage.remove();
  if (k === "escape") return stage.select({});
});

// ---------------------------------------------------------------- wiring

stage.on((kind) => {
  if (kind === "selection") {
    outliner(), tools(), selected(), snaps(), poses();
  } else if (kind === "pose") {
    readouts(), snaps();
  } else if (kind === "scene") {
    outliner(), tools(), selected(), snaps(), poses(), frame();
  } else if (kind === "history" || kind === "tool") {
    tools(), outliner();
  } else if (kind === "frame") {
    frame(), snaps();
  }
});

installTooltips();
// the assistant stages the scene from what you ask, with the same commands an outside agent uses
mountChat($("chat"), stage, controlOps(stage));
// an agent can stage the scene through the server; the lamp says whether the link is up and what it is doing
connectRemote(stage, {
  onActivity({ connected, op }) {
    const lamp = $("link");
    if (connected) lamp.dataset.tone = op ? "busy" : "ok";
    else delete lamp.dataset.tone;
    lamp.dataset.tooltip = !connected ? "Agent link — waiting for the server" : op ? `Agent link — ${op.replace(/_/g, " ")}` : "Agent link — ready for commands";
  },
});
// a first scene to block: two characters and a box
const a = stage.addCharacter({ pose: "walk", at: [-0.55, 0, 0.2] });
const b = stage.addCharacter({ pose: "point", at: [0.8, 0, -0.45] });
a.root.rotation.y = 0.45;
b.root.rotation.y = -0.7;
const box = stage.addProp("box");
box.position.set(1.7, box.position.y, 0.55);
stage.select({ character: a });
stage.history = [];
stage.commit();
stage.snap("three-quarter-left", null);
frame();
outliner();
tools();
selected();
poses();
snaps();
