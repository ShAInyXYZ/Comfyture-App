// The Stage tab: a blocking table for references. The scene and the libraries of
// poses and assets on the left, the framed viewport with its channels, tools and
// timeline in the middle (the app's assistant docks under it), and the camera,
// the frame, the selection's controls and the channel previews on the right.
// Everything the panels show comes from the stage; everything they change goes
// through it, so undo covers all.

import { h, icon, sprite } from "../dom.js";
import { Stage, SNAPS, RATIOS, MOVES } from "./stage.js";
import { POSES, POSE_CATEGORIES, SAVED, setSaved, allPoses, poseById } from "./poses.js";
import { ASSETS, assetCategories, assetByType } from "./assets.js";
import { JOINT_NAMES, JOINT_LABELS, BODY_TYPES, BODY_SLIDERS, PARAMS, PALETTE, colorName } from "./skeleton.js";
import { CHANNELS, PASSES } from "./channels.js";
import { controlOps, connectRemote, wordsFor } from "./remote.js";
import { MODELS, USER, rigById, holdables, importModel, forgetModel, loadNewUserModels } from "./models.js";

const TOOLS = [
  ["select", "web-cursor", "Select", "Q"],
  ["rotate", "transform-rotate", "Rotate — turn the selected joint", "E"],
  ["move", "transform-move", "Move — the body, a prop, or a hand or foot by IK", "W"],
  ["scale", "transform-scale", "Scale — props", "R"],
];
const CHANNEL_ICON = { clay: "view-material", id: "channel-id", depth: "channel-depth", normal: "view-normals", pose: "channel-pose", lines: "view-wireframe", mask: "material-mask" };
// the camera moves on the panel, with their icons (a flipped icon for the way back)
const MOVE_KEYS = [
  ["locked", "camera-locked"], ["push-in", "camera-push-in"], ["pull-out", "camera-pull-out"], ["orbit-left", "camera-orbit-left"], ["orbit-right", "camera-orbit"], ["crane-up", "camera-crane-up"],
  ["crane-down", "camera-crane-down"], ["truck-left", "camera-truck-left"], ["truck-right", "camera-truck-right"], ["zoom-in", "camera-zoom-in"], ["zoom-out", "camera-zoom-out"], ["handheld", "camera-shake"],
];
const BODY_MAIN = ["height", "build", "shoulders", "hips", "head"];
const POSE_MAIN = ["look", "nod", "lean", "twist", "arms", "stance", "crouch"];

const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(1).padStart(4, "0")}`;
const assetIcon = (type) => assetByType(type)?.icon ?? "prop-box";

/** Builds the Stage into `root` and returns the stage and its commands. */
// what an animal's clips are called on the Stage
const ANIMAL_POSES = { stand: "Stand", sit: "Sit", lie: "Lie down", walk: "Walk", hop: "Hop" };

export function mountStage(root, { toast = () => {}, go = () => {}, useVideo = () => {} } = {}) {
  // like h(), and a first child may come where the props would (an element, text or a list)
  const el = (tag, props, ...children) =>
    props instanceof Node || typeof props === "string" || Array.isArray(props) ? h(tag, {}, props, ...children) : h(tag, props ?? {}, ...children);
  const stageEl = el("div.ctl-stage");
  const frameEl = el("div.ctl-frame", { "aria-hidden": "true" }, ...["tl", "tr", "bl", "br"].map((c) => el(`i.c.${c}`)), ...["v1", "v2", "h1", "h2"].map((c) => el(`i.third.${c}`)), el("i.safe"));
  const channelsPill = el("div.ctl-channels", { role: "toolbar", "aria-label": "Channel" });
  const toolsEl = el("div.ctl-tools", { role: "toolbar", "aria-label": "Tools" });
  const hintEl = el("p.ctl-hint");
  const view = el("section.ctl-view", { "aria-label": "Viewport" }, stageEl, frameEl, channelsPill, toolsEl, hintEl);
  const timelineEl = el("section.ctl-timeline", { "aria-label": "Timeline" });
  const chatSlot = el("div.ctl-chat", { id: "stage-chat" });

  const outlinerEl = el("div.ctl-outliner", { role: "tree", "aria-label": "Scene" });
  const addEl = el("div.ctl-add");
  const linkLamp = el("span.lamp.ctl-link", { tabindex: "0", role: "status", "data-tooltip": "Agent link — waiting for the server" });
  const libraryEl = el("section.ctl-panel.ctl-grow.ctl-library");
  const left = el("aside.ctl-col.ctl-left",
    el("section.ctl-panel", el("div.ctl-row", el("h2.ctl-label", {}, "Scene"), linkLamp), outlinerEl, addEl),
    libraryEl);
  // the stages open as tabs on a bar over the desk, as shots do, with the stage's keys at its end
  const tabsEl = el("nav.tabs.ctl-stage-tabs", { role: "tablist", "aria-label": "Stages" });
  const actionsEl = el("div.subbar-actions.ctl-stage-actions", { role: "toolbar", "aria-label": "Stage" });
  const subbar = el("div.subbar.ctl-subbar", el("div.subbar-in", tabsEl, actionsEl));

  const snapsEl = el("div.ctl-snaps");
  const focal = el("input", { type: "range", min: 14, max: 200, step: 1, "aria-label": "Focal length" });
  const focalOut = el("output.ctl-readout");
  const movesEl = el("div.ctl-moves", { role: "group", "aria-label": "Camera move" });
  const ratiosEl = el("div.ctl-ratios", { role: "group", "aria-label": "Frame" });
  const guidesEl = el("div.ctl-toggles");
  const selectedEl = el("div.ctl-selected");
  const previewsEl = el("div.ctl-previews");
  const renderEl = el("div.ctl-render-keys");
  const right = el("aside.ctl-col.ctl-right",
    el("section.ctl-panel", el("h2.ctl-label", {}, "Camera"), snapsEl,
      el("div.ctl-focal", el("div.ctl-row", el("span.ctl-label.is-sub", {}, "Focal length"), focalOut), focal),
      el("span.ctl-label.is-sub", {}, "Move"), movesEl),
    el("section.ctl-panel", el("h2.ctl-label", {}, "Frame"), el("div.ctl-frame-row", ratiosEl, guidesEl)),
    el("section.ctl-panel", el("h2.ctl-label", {}, "Selected"), selectedEl),
    el("section.ctl-panel", el("h2.ctl-label", {}, "Channels"), previewsEl, renderEl));

  root.replaceChildren(subbar, el("div.ctl-desk", left, el("div.ctl-mid", view, timelineEl, chatSlot), right));

  const stage = new Stage(stageEl, frameEl);
  const { ops, describe } = controlOps(stage);
  window.controlStage = stage;

  // ---------------------------------------------------------------- scene outliner

  const expanded = new Set();
  let renaming = null;
  function nameField(target, current) {
    const input = el("input.ctl-rename", { value: current, "aria-label": "Name", maxLength: 40 });
    const done = (keep) => {
      if (renaming !== target) return;
      renaming = null;
      if (keep && input.value.trim() && input.value.trim() !== current) stage.rename(target, input.value);
      else outliner();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") done(true);
      if (e.key === "Escape") done(false);
      e.stopPropagation();
    });
    input.addEventListener("blur", () => done(true));
    requestAnimationFrame(() => (input.focus(), input.select()));
    return input;
  }
  const isRenaming = (t) => renaming && (renaming.character ?? renaming.prop) === (t.character ?? t.prop);

  function outliner() {
    const sel = stage.selection;
    const row = (props, ...children) => el("div.ctl-node", { role: "treeitem", ...props }, ...children);
    const eye = (visible, set) =>
      el("button.ctl-mini", { type: "button", "aria-pressed": String(!visible), title: visible ? "Hide" : "Show", "aria-label": visible ? "Hide" : "Show", on: { click: (e) => (e.stopPropagation(), set(!visible)) } }, sprite("eye"));
    const items = [];
    for (const c of stage.characters) {
      const open = expanded.has(c.id);
      const target = { character: c };
      items.push(row({
        className: `is-character${sel.character === c && !sel.joint ? " is-selected" : ""}${sel.character === c ? " is-within" : ""}`,
        on: { click: () => stage.select({ character: c }), dblclick: () => ((renaming = target), outliner()) },
      },
        el("button.ctl-mini.ctl-fold", { type: "button", "aria-expanded": String(open), "aria-label": open ? "Fold" : "Show the joints", on: { click: (e) => (e.stopPropagation(), open ? expanded.delete(c.id) : expanded.add(c.id), outliner()) } }, icon("chevron")),
        el("span.ctl-chip", { style: { background: `#${c.color.getHexString()}` }, title: colorName(`#${c.color.getHexString()}`) }),
        el("span.ctl-mini.ctl-glyph", { title: BODY_TYPES.find((b) => b.id === c.body)?.name }, sprite(`body-${c.body}`)),
        isRenaming(target) ? nameField(target, c.name) : el("span.ctl-name", { title: "Double-click to rename" }, c.name),
        eye(c.root.visible, (v) => (c.setVisible(v), stage.commit(), stage.render(), outliner())),
        el("button.ctl-mini", { type: "button", title: "Remove", "aria-label": `Remove ${c.name}`, on: { click: (e) => (e.stopPropagation(), stage.remove(target)) } }, icon("trash")),
      ));
      if (open) {
        for (const j of JOINT_NAMES) {
          items.push(row({ className: `is-joint${sel.character === c && sel.joint === j ? " is-selected" : ""}`, style: { "--depth": String(depth(j)) }, on: { click: () => stage.select({ character: c, joint: j }) } },
            el("span.ctl-name", {}, JOINT_LABELS[j])));
        }
      }
    }
    for (const p of stage.props) {
      const target = { prop: p };
      items.push(row({ className: sel.prop === p ? "is-selected" : "", on: { click: () => stage.select({ prop: p }), dblclick: () => ((renaming = target), outliner()) } },
        el("span.ctl-mini.ctl-glyph", {}, sprite(assetIcon(p.userData.type))),
        isRenaming(target) ? nameField(target, p.userData.label) : el("span.ctl-name", { title: "Double-click to rename" }, p.userData.label),
        eye(p.visible, (v) => ((p.visible = v), stage.commit(), stage.render(), outliner())),
        el("button.ctl-mini", { type: "button", title: "Remove", "aria-label": `Remove ${p.userData.label}`, on: { click: (e) => (e.stopPropagation(), stage.remove(target)) } }, icon("trash")),
      ));
    }
    if (!items.length) items.push(el("p.ctl-empty", {}, "Add a character, or ask the assistant for a scene."));
    outlinerEl.replaceChildren(...items);
  }

  function depth(joint) {
    const PARENT = { Spine: "Hips", Chest: "Spine", Neck: "Chest", Head: "Neck", LeftShoulder: "Chest", RightShoulder: "Chest", LeftArm: "LeftShoulder", RightArm: "RightShoulder", LeftForeArm: "LeftArm", RightForeArm: "RightArm", LeftHand: "LeftForeArm", RightHand: "RightForeArm", LeftUpLeg: "Hips", RightUpLeg: "Hips", LeftLeg: "LeftUpLeg", RightLeg: "RightUpLeg", LeftFoot: "LeftLeg", RightFoot: "RightLeg", LeftToe: "LeftFoot", RightToe: "RightFoot" };
    let d = 0;
    for (let j = PARENT[joint]; j; j = PARENT[j]) d++;
    return Math.min(d, 5);
  }

  /** Somewhere free in front of the camera's target, for a new character or asset. */
  function freeSpot() {
    const t = stage.orbit.target;
    const taken = [...stage.characters.map((c) => c.root.position), ...stage.props.map((p) => p.position)];
    for (let ring = 0; ring < 6; ring++) {
      for (let i = 0; i < Math.max(1, ring * 6); i++) {
        const a = (i / Math.max(1, ring * 6)) * Math.PI * 2;
        const x = t.x + Math.cos(a) * ring * 0.9;
        const z = t.z + Math.sin(a) * ring * 0.9;
        if (taken.every((p) => Math.hypot(p.x - x, p.z - z) > 0.8)) return [x, 0, z];
      }
    }
    return [t.x, 0, t.z];
  }

  let tab = "cast";
  let poseQuery = "";
  let assetQuery = "";
  addEl.replaceChildren(
    el("button.ctl-tile", { type: "button", title: "Add a character", "aria-label": "Add a character", on: { click: () => stage.addCharacter({ at: freeSpot() }) } }, sprite("character-add")),
    el("button.ctl-tile.is-wide", { type: "button", title: "Blockout assets", "aria-pressed": "false", on: { click: () => ((tab = "assets"), library()) } }, sprite("asset-library"), el("span", {}, "Assets")),
  );

  // ---------------------------------------------------------------- poses and assets

  // a thumbnail is drawn when its tile scrolls into view, so a long library opens at once
  const drawn = new IntersectionObserver((seen) => {
    for (const e of seen) {
      if (!e.isIntersecting) continue;
      const img = e.target;
      drawn.unobserve(img);
      img.src = img._draw();
    }
  }, { rootMargin: "240px" });
  const lazyImg = (draw) => {
    const img = el("img", { alt: "", draggable: false });
    img._draw = draw;
    drawn.observe(img);
    return img;
  };

  /** Every word of the query is somewhere in what the thing is called or about. */
  const finds = (query, words) => {
    const hay = words.filter(Boolean).join(" ").toLowerCase().replace(/[-_]+/g, " ");
    return query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
  };
  /** A search field that keeps its value and its caret through the panel's redraws. */
  const searchField = (value, label, onInput) => {
    const input = el("input.field.ctl-search", { type: "search", value, placeholder: label, "aria-label": label, autocomplete: "off", spellcheck: false,
      on: { input: (e) => onInput(e.target.value), keydown: (e) => (e.stopPropagation(), e.key === "Escape" && ((e.target.value = ""), onInput(""))) } });
    return el("label.ctl-search-row", {}, icon("search"), input);
  };
  const keepFocus = (selector, render) => {
    const had = document.activeElement?.matches?.(selector) ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
    render();
    if (had) {
      const input = libraryEl.querySelector(selector);
      input?.focus();
      input?.setSelectionRange(...had);
    }
  };
  const fileInput = el("input", { type: "file", hidden: true });
  libraryEl.after(fileInput);
  /** Brings a model in: a rigged character (GLB, glTF, VRM, FBX) or a prop (also OBJ). */
  function bring(kind) {
    fileInput.accept = kind === "character" ? ".glb,.gltf,.vrm,.fbx" : ".glb,.gltf,.fbx,.obj";
    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (!file) return;
      toast(`Bringing in ${file.name}…`);
      try {
        const model = await importModel(file, kind);
        if (kind === "character") stage.addCharacter({ at: freeSpot(), rig: model.id });
        else stage.addProp(model.id, freeSpot());
        toast(`${model.name} is on the stage${kind === "character" ? ": its rig follows every pose" : ""}.`);
      } catch (e) {
        toast(e.message, { tone: "crit" });
      }
      library();
    };
    fileInput.click();
  }
  const forget = (id, name) => el("button.ctl-mini.ctl-pose-x", { type: "button", title: `Forget ${name}`, "aria-label": `Forget ${name}`, on: { click: async (e) => (e.stopPropagation(), await forgetModel(id), library()) } }, icon("close"));

  let saving = false;
  function library() {
    addEl.lastChild.setAttribute("aria-pressed", String(tab === "assets"));
    const tabs = el("div.ctl-tabs", { role: "tablist" },
      ...[["cast", "Characters"], ["poses", "Poses"], ["assets", "Assets"]].map(([id, label]) =>
        el("button", { type: "button", role: "tab", "aria-selected": String(tab === id), on: { click: () => ((tab = id), library()) } }, label)));
    if (tab === "cast") {
      // the body types, the library's animals and the user's own characters, each drawn standing;
      // a click puts one on the stage
      const rigTile = (r) => el("button.ctl-pose.ctl-body", { type: "button", title: `Add ${r.name.toLowerCase()} — ${r.height.toFixed(2)} m`, "aria-label": `Add ${r.name.toLowerCase()}`, on: { click: () => stage.addCharacter({ at: freeSpot(), rig: r.id }) } },
        lazyImg(() => stage.poseThumbnail(poseById("stand"), { rig: r.id })));
      // the baby animals: pieces of the set that hold a pose, added like a character
      const animals = ASSETS.filter((a) => a.animal).map((a) =>
        el("button.ctl-pose.ctl-body", { type: "button", title: `Add a ${a.name.toLowerCase()}`, "aria-label": `Add a ${a.name.toLowerCase()}`, on: { click: () => stage.select({ prop: stage.addProp(a.type, freeSpot()) }) } },
          lazyImg(() => stage.propThumbnail(a.type))));
      const people = el("div.ctl-poses.ctl-cast", {},
        ...BODY_TYPES.map((b) =>
          el("button.ctl-pose.ctl-body", { type: "button", title: `Add ${b.name.toLowerCase()} — ${b.profile.height.toFixed(2)} m`, "aria-label": `Add ${b.name.toLowerCase()}`, on: { click: () => stage.addCharacter({ at: freeSpot(), body: b.id }) } },
            lazyImg(() => stage.poseThumbnail(poseById("stand"), { body: b.id })))));
      const yours = el("div.ctl-poses.ctl-cast", {},
        ...[...USER.rigs.values()].map((r) => el("div.ctl-pose-wrap", {}, rigTile(r), forget(r.id, r.name))),
        el("button.ctl-pose.ctl-import", { type: "button", title: "Import a rigged character — GLB, glTF, VRM or FBX; Mixamo, Unreal, VRoid and similar rigs", "aria-label": "Import a rigged character", on: { click: () => bring("character") } }, sprite("character-import")));
      libraryEl.replaceChildren(tabs, el("div.ctl-results", {},
        el("span.ctl-label.is-sub", {}, "People"), people,
        ...(animals.length ? [el("span.ctl-label.is-sub", {}, "Animals"), el("div.ctl-poses.ctl-cast", {}, ...animals)] : []),
        el("span.ctl-label.is-sub", {}, "Yours"), yours));
    } else if (tab === "poses") {
      const target = stage.selection.character;
      const results = el("div.ctl-results");
      const fill = () => {
        const all = allPoses().filter((p) => !poseQuery || finds(poseQuery, [p.name, p.id, p.category, ...wordsFor("pose", p.id), ...(p.hold ? Object.values(p.hold) : [])]));
        const groups = POSE_CATEGORIES.map((c) => [c, all.filter((p) => p.category === c)]).filter(([, list]) => list.length);
        results.replaceChildren(...groups.flatMap(([c, list]) => [
          el("span.ctl-label.is-sub", {}, c),
          el("div.ctl-poses", {}, ...list.map((p) =>
            el("div.ctl-pose-wrap", {},
              el("button.ctl-pose", { type: "button", title: target ? p.name : `${p.name} — select a character first`, "aria-label": p.name, disabled: !target, on: { click: () => stage.applyPose(p.id) } },
                lazyImg(() => stage.poseThumbnail(p))),
              p.category === "Mine" ? el("button.ctl-mini.ctl-pose-x", { type: "button", title: "Forget this pose", "aria-label": `Forget ${p.name}`, on: { click: () => forgetPose(p.id) } }, icon("close")) : null))),
        ]));
        if (!groups.length) results.append(el("p.ctl-empty", {}, poseQuery ? `No pose for "${poseQuery}".` : "No poses."));
      };
      const head = el("div.ctl-search-head", {},
        searchField(poseQuery, "Search poses: sit, phone, fight…", (v) => ((poseQuery = v), fill())),
        el("button.ctl-mini.ctl-save", { type: "button", title: target ? "Save this pose" : "Save the pose — select a character first", "aria-label": "Save the pose", disabled: !target, on: { click: () => ((saving = !saving), library()) } }, sprite("pose-save")));
      const form = saving && target ? savePoseForm(target) : null;
      fill();
      keepFocus(".ctl-search", () => libraryEl.replaceChildren(tabs, head, ...(form ? [form] : []), results));
    } else {
      const results = el("div.ctl-results");
      const fill = () => {
        // what a piece is called and about, and what a body can do with it (sit on it, set things on it, hold it)
        const about = (a) => [a.name, a.type, a.category, ...(a.themes ?? []), ...(a.tags ?? []), ...wordsFor("prop", a.type), a.seat ? "seat sit" : "", a.top ? "surface top" : "", a.holdable ? "hold hand" : ""];
        // the animals are in Characters
        const all = ASSETS.filter((a) => !a.animal && (!assetQuery || finds(assetQuery, about(a))));
        const groups = assetCategories().map((c) => [c, all.filter((a) => a.category === c)]).filter(([, list]) => list.length);
        results.replaceChildren(...groups.flatMap(([c, list]) => [
          el("span.ctl-label.is-sub", {}, c === "Mine" ? "Yours" : c),
          el("div.ctl-assets", {}, ...list.map((a) =>
            el("div.ctl-pose-wrap", {},
              el("button.ctl-asset", { type: "button", title: a.themes?.length ? `${a.name} — ${a.themes.join(", ")}` : a.name, "aria-label": `Add ${a.name.toLowerCase()}`, on: { click: () => stage.addProp(a.type, freeSpot()) } },
                lazyImg(() => stage.propThumbnail(a.type))),
              a.user ? forget(a.type, a.name) : null))),
        ]));
        if (!groups.length) results.append(el("p.ctl-empty", {}, `Nothing for "${assetQuery}". Try a theme: kitchen, food, office, street, studio, product…`));
      };
      const head = el("div.ctl-search-head", {},
        searchField(assetQuery, "Search by name or theme: chair, kitchen, drinks…", (v) => ((assetQuery = v), fill())),
        el("button.ctl-mini", { type: "button", title: "Import a model — GLB, glTF, FBX or OBJ", "aria-label": "Import a model", on: { click: () => bring("prop") } }, sprite("model-import")));
      fill();
      keepFocus(".ctl-search", () => libraryEl.replaceChildren(tabs, head, results));
    }
  }

  function savePoseForm(character) {
    const input = el("input.field.ctl-pose-name", { placeholder: "Name the pose", maxLength: 40, value: character.posed && character.posed !== "custom" ? "" : "" });
    const save = async () => {
      const name = input.value.trim() || `Pose ${SAVED.length + 1}`;
      const res = await fetch("api/control/poses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, quaternions: character.getFinalPose() }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return toast(body.error ?? "The pose was not saved.", { tone: "crit" });
      setSaved(body.poses);
      saving = false;
      poseQuery = "";
      library();
      toast(`Saved "${name}" to your poses.`);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") save();
      if (e.key === "Escape") ((saving = false), library());
      e.stopPropagation();
    });
    requestAnimationFrame(() => input.focus());
    return el("div.ctl-pose-form", {}, input, el("button.key.is-sm.is-primary", { type: "button", on: { click: save } }, "Save"));
  }

  async function forgetPose(id) {
    const res = await fetch(`api/control/poses/${encodeURIComponent(id)}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (res.ok) setSaved(body.poses);
    library();
  }

  fetch("api/control/poses").then((r) => r.json()).then((b) => (setSaved(b.poses), library())).catch(() => {});

  // ---------------------------------------------------------------- viewport: channels, tools, hint

  function channelPill() {
    channelsPill.replaceChildren(...CHANNELS.map(([id, label], i) =>
      el("button.ctl-channel", { type: "button", "aria-pressed": String(stage.channel === id), title: label, "data-tooltip-key": String(i + 1), "aria-label": label, on: { click: () => stage.setChannel(id) } },
        sprite(CHANNEL_ICON[id]), el("span", {}, label))));
  }

  function tools() {
    const sel = stage.selection;
    const key = (ic, label, extra = {}) => el("button.ctl-tool", { type: "button", "aria-label": label, title: label, ...extra }, sprite(ic));
    toolsEl.replaceChildren(
      ...TOOLS.map(([id, ic, label, k]) => key(ic, label, { "aria-pressed": String(stage.tool === id), "data-tooltip-key": k, on: { click: () => stage.setTool(id) } })),
      el("span.ctl-sep"),
      key("flip-h", "Mirror the pose", { "data-tooltip-key": "M", disabled: !sel.character, on: { click: () => stage.mirror() } }),
      key("pose-rest", "Back to standing", { disabled: !sel.character, on: { click: () => stage.resetPose() } }),
      key("copy", "Duplicate", { "data-tooltip-key": "Ctrl D", disabled: !sel.character && !sel.prop, on: { click: () => stage.duplicate() } }),
      el("span.ctl-sep"),
      key("edit-undo", "Undo", { "data-tooltip-key": "Ctrl Z", disabled: stage.history.length < 2, on: { click: () => stage.undo() } }),
      key("edit-redo", "Redo", { "data-tooltip-key": "Ctrl Shift Z", disabled: !stage.future.length, on: { click: () => stage.redo() } }),
    );
    const hint = !stage.characters.length && !stage.props.length ? "Add a character, or ask the assistant for a scene"
      : !sel.character && !sel.prop ? "Click a body or a prop"
      : stage.tool === "rotate" && sel.character && !sel.joint ? "Click a body part to turn its joint"
      : stage.tool === "move" && sel.character ? "Drag the yellow handles to place a hand or foot"
      : "";
    hintEl.textContent = hint;
    hintEl.hidden = !hint;
  }

  // ---------------------------------------------------------------- timeline

  let pickedKey = null;
  function timeline() {
    const D = stage.duration;
    const sel = stage.selection;
    const selTarget = sel.character ? { character: sel.character } : sel.prop ? { prop: sel.prop } : null;
    const tracks = stage.tracks();
    if (selTarget && !tracks.some((t) => (t.target.character ?? t.target.prop) === (selTarget.character ?? selTarget.prop))) {
      tracks.push({ target: selTarget, id: "sel", name: sel.character?.name ?? sel.prop.userData.label, color: sel.character ? `#${sel.character.color.getHexString()}` : undefined, keys: [] });
    }
    const keyTarget = selTarget ?? { camera: true };
    const duration = el("input.ctl-duration", { type: "number", min: 1, max: 20, step: 0.5, value: D, "aria-label": "Length in seconds", on: { change: (e) => stage.setDuration(Number(e.target.value) || 5) } });
    const transport = el("div.ctl-transport", {},
      el("button.ctl-tool", { type: "button", "aria-label": stage.playing ? "Pause" : "Play", title: stage.playing ? "Pause" : "Play", "data-tooltip-key": "Space", on: { click: () => stage.play() } }, icon(stage.playing ? "pause" : "play")),
      el("span.ctl-time", { "data-time": "" }, `${fmt(stage.time)} / ${fmt(D)}`),
      el("span.spacer"),
      el("button.ctl-tool", { type: "button", "aria-pressed": String(stage.autoKey), title: "Auto-key — edits to anything with keys are recorded at the playhead", "aria-label": "Auto-key", on: { click: () => ((stage.autoKey = !stage.autoKey), timeline()) } }, sprite("keyframe-auto")),
      el("button.ctl-tool", { type: "button", title: `Key ${keyTarget.camera ? "the camera" : sel.character?.name ?? sel.prop?.userData.label} at the playhead`, "data-tooltip-key": "K", "aria-label": "Key", on: { click: () => stage.key(keyTarget) } }, sprite("keyframe")),
      el("button.ctl-tool", { type: "button", title: "Remove the picked key", "aria-label": "Remove the key", disabled: !pickedKey, on: { click: () => pickedKey && (stage.removeKey(pickedKey.target, pickedKey.t), (pickedKey = null)) } }, icon("trash")),
      el("label.ctl-length", { title: "Length of the shot" }, duration, el("span", {}, "s")));
    // the ruler: ticks every half second, numbered every second (or every two on a long shot)
    const ruler = el("div.ctl-ruler", { "aria-hidden": "true" });
    const step = D > 10 ? 2 : 1;
    for (let t = 0; t <= D + 1e-6; t += 0.5) {
      const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
      ruler.append(el(`i${major ? ".is-major" : ""}`, { style: { left: `${(t / D) * 100}%` } }, major ? el("b", {}, t.toFixed(1)) : null));
    }
    const lane = (t) => {
      const keys = t.keys.map((k) => el("button.ctl-key", {
        type: "button",
        className: pickedKey && pickedKey.id === t.id && Math.abs(pickedKey.t - k.t) < 1e-3 ? "is-picked" : "",
        style: { left: `${(k.t / D) * 100}%`, ...(t.color ? { "--key": t.color } : {}) },
        title: `${t.name} · ${k.t.toFixed(2)} s`,
        "aria-label": `${t.name} key at ${k.t.toFixed(2)} seconds`,
        on: { click: (e) => (e.stopPropagation(), (pickedKey = { id: t.id, target: t.target, t: k.t }), stage.setTime(k.t), timeline()) },
      }));
      return el("div.ctl-track", { className: t.target.camera ? "is-camera" : "" },
        el("span.ctl-track-name", {}, t.color ? el("span.ctl-chip", { style: { background: t.color } }) : sprite("scene-camera"), el("span", {}, t.name)),
        el("div.ctl-lane", { style: t.color ? { "--key": t.color } : {} }, ...keys));
    };
    const head = el("div.ctl-playhead", { style: { "--t": String(stage.time / D) } });
    const scrub = el("div.ctl-scrub", {}, ruler, ...tracks.map(lane), head);
    // scrubbing: press and drag anywhere on the ruler or the lanes
    scrub.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".ctl-key")) return;
      const area = scrub.querySelector(".ctl-ruler").getBoundingClientRect();
      const seek = (x) => stage.setTime(((x - area.left) / area.width) * D);
      seek(e.clientX);
      scrub.setPointerCapture(e.pointerId);
      const move = (m) => seek(m.clientX);
      scrub.addEventListener("pointermove", move);
      scrub.addEventListener("pointerup", () => scrub.removeEventListener("pointermove", move), { once: true });
    });
    timelineEl.replaceChildren(transport, scrub);
  }
  /** Just the playhead and the readout, when only the time moved. */
  function playhead() {
    const head = timelineEl.querySelector(".ctl-playhead");
    if (head) head.style.setProperty("--t", String(stage.time / stage.duration));
    const readout = timelineEl.querySelector("[data-time]");
    if (readout) readout.textContent = `${fmt(stage.time)} / ${fmt(stage.duration)}`;
  }

  // ---------------------------------------------------------------- camera and frame

  let snapTimer = 0;
  function snaps() {
    clearTimeout(snapTimer);
    // the tiles show the scene from each angle; they follow the pose, a moment after it settles
    snapTimer = setTimeout(() => {
      if (stage.playing) return;
      const c = stage.selection.character ?? stage.characters[0];
      snapsEl.replaceChildren(...SNAPS.map(([id, label]) => {
        const pose = c ? stage.snapPose(id, c) : null;
        return el("button.ctl-snap", { type: "button", title: label, "aria-pressed": String(stage.lastSnap === id), disabled: !c, on: { click: () => stage.snap(id) } },
          el("span.ctl-snap-pic", {}, pose ? el("img", { src: stage.thumbnail(pose, { width: 128, height: 72 }), alt: "", draggable: false }) : sprite("scene-render")),
          el("span.ctl-snap-name", {}, label));
      }));
    }, 140);
  }

  focal.addEventListener("input", () => stage.setFocal(Number(focal.value)));
  focal.addEventListener("change", () => stage.commit());

  function frame() {
    focal.value = String(stage.focal);
    focalOut.textContent = `${stage.focal} mm`;
    const active = stage.cameraKeys.length ? (stage.handheld ? "handheld" : stage.lastMove) : "locked";
    movesEl.replaceChildren(...MOVE_KEYS.map(([id, ic]) => {
      const label = MOVES.find(([m]) => m === id)?.[1] ?? id;
      return el("button.ctl-move", { type: "button", "aria-pressed": String(active === id), title: `${label} — from the camera now to the end of the shot`, "aria-label": label, on: { click: () => stage.cameraMove(id) } }, sprite(ic));
    }));
    ratiosEl.replaceChildren(...Object.keys(RATIOS).map((r) =>
      el("button.ctl-ratio", { type: "button", "aria-pressed": String(stage.ratio === r), title: r, "aria-label": r, on: { click: () => (stage.setRatio(r), stage.commit()) } },
        sprite(`ratio-${r.replace(":", "-")}`), el("span", {}, r))));
    guidesEl.replaceChildren(
      toggle("Thirds", stage.guides.thirds, (v) => stage.setGuides({ thirds: v })),
      toggle("Safe frame", stage.guides.safe, (v) => stage.setGuides({ safe: v })));
  }

  function toggle(label, on, set) {
    return el("button.ctl-toggle", { type: "button", "aria-pressed": String(on), on: { click: () => set(!on) } }, el("span.ctl-box"), label);
  }

  // ---------------------------------------------------------------- the selection

  let advanced = false;
  /** A slider with its readout: it shows the change live and commits once let go. */
  function slider([key, label, min, max, step = 1, unit = ""], value, set) {
    const out = el("output", {}, format(value, step, unit));
    const input = el("input", { type: "range", min, max, step, value, "aria-label": label });
    input.addEventListener("input", () => ((out.textContent = format(Number(input.value), step, unit)), set(Number(input.value), false)));
    input.addEventListener("change", () => set(Number(input.value), true));
    input.addEventListener("dblclick", () => set(key === "height" ? 1.78 : key in { build: 1, head: 1, shoulders: 1, hips: 1, waist: 1, chest: 1, belly: 1, legs: 1, arms: 1, size: 1 } ? 1 : 0, true));
    return el("label.ctl-slider", { title: `${label} — double-click to reset` }, el("span", {}, label), input, out);
  }
  const format = (v, step, unit) => (unit === "m" ? `${v.toFixed(2)} m` : unit === "°" ? `${Math.round(v)}°` : step < 1 ? v.toFixed(2) : String(Math.round(v)));

  let holdHand = "right";
  let holdQuery = "";
  /** Redraws the Selected panel, keeping the caret in a search field that had it. */
  const keepSelected = (selector) => {
    const had = document.activeElement?.matches?.(selector) ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
    selected();
    if (had) {
      const input = selectedEl.querySelector(selector);
      input?.focus();
      input?.setSelectionRange(...had);
    }
  };
  function selected() {
    const { character, joint, prop } = stage.selection;
    if (!character && !prop) return selectedEl.replaceChildren(el("p.ctl-empty", {}, "Nothing selected. Click a body or a prop."));
    const target = character ? { character } : { prop };
    const name = el("input.ctl-name-field", {
      value: character?.name ?? prop.userData.label, maxLength: 40, "aria-label": "Name",
      on: { change: (e) => stage.rename(target, e.target.value), keydown: (e) => (e.stopPropagation(), e.key === "Enter" && e.target.blur()) },
    });
    const head = el("div.ctl-sel-head", {}, name, el("span.ctl-mini.ctl-glyph", { title: "Rename" }, icon("pencil")));
    if (prop) {
      const def = assetByType(prop.userData.type);
      if (def?.animal) {
        // an animal: its poses, each drawn, and one size for all of it
        const poses = el("div.ctl-animal-poses", { role: "group", "aria-label": "Pose" }, ...def.poses.map((p) =>
          el("button.ctl-pose.ctl-animal-pose", { type: "button", "aria-pressed": String((prop.userData.pose ?? "stand") === p), title: ANIMAL_POSES[p] ?? p, "aria-label": ANIMAL_POSES[p] ?? p, on: { click: () => (stage.setAnimalPose(prop, p), selected()) } },
            lazyImg(() => stage.propThumbnail(def.type, { pose: p, width: 96, height: 84 })))));
        const size = slider(["size", "Size", 0.3, 3, 0.01, "×"], prop.scale.y, (v, commit) => stage.setPropScale(prop, v, { commit }));
        return selectedEl.replaceChildren(head, el("p.ctl-sub", {}, def.name), el("span.ctl-label.is-sub", {}, "Pose"), poses, el("div.ctl-sliders", {}, size));
      }
      const sliders = (def?.params ?? []).map((p) => slider([p[0], p[1], p[2], p[3], p[4], p[0] === "open" ? "°" : p[0] === "steps" ? "" : "m"],
        prop.userData.params[p[0]], (v, commit) => stage.setPropParams(prop, { [p[0]]: v }, { commit })));
      return selectedEl.replaceChildren(head, el("p.ctl-sub", {}, def?.name ?? "Prop"), el("div.ctl-sliders", {}, ...sliders));
    }
    if (joint) {
      const euler = stage.jointEuler();
      return selectedEl.replaceChildren(head,
        el("p.ctl-sub", {}, JOINT_LABELS[joint]),
        el("div.ctl-xyz", {}, ...["x", "y", "z"].map((a, i) =>
          el("label.ctl-num", {}, el("span", {}, a.toUpperCase()),
            el("input", { type: "number", step: 1, value: euler[i], "aria-label": `${JOINT_LABELS[joint]} ${a}`, on: { change: (e) => stage.setJointEuler(a, Number(e.target.value) || 0), keydown: (e) => e.stopPropagation() } }),
            el("i", {}, "°")))),
        el("button.key.is-sm.is-quiet", { type: "button", on: { click: () => stage.select({ character }) } }, "Whole body"));
    }
    const hex = `#${character.color.getHexString()}`;
    const swatches = el("div.ctl-swatches", { role: "group", "aria-label": "Colour" }, ...PALETTE.map(([c, cname]) =>
      el("button.ctl-swatch", { type: "button", "aria-pressed": String(hex === c), title: cname, "aria-label": cname, style: { "--swatch": c }, on: { click: () => stage.setColor(character, c) } })));
    const bodies = el("div.ctl-bodies", { role: "group", "aria-label": "Body type" }, ...BODY_TYPES.map((b) =>
      el("button.ctl-body", { type: "button", "aria-pressed": String(!character.rigId && character.body === b.id), title: b.name, on: { click: () => stage.setBody(character, b.id) } }, sprite(`body-${b.id}`), el("span", {}, b.name))));
    // what the hands hold: a hand at a time, the props drawn; a search when there are many
    const can = holdables(assetByType);
    const holdList = [...can.values()].filter((h) => !holdQuery || finds(holdQuery, [h.name, h.type, ...h.themes, ...h.tags, ...wordsFor("hand", h.type)]))
      .sort((a, b) => (a.piece ? 1 : 0) - (b.piece ? 1 : 0)).slice(0, holdQuery ? 40 : 15);
    const holds = can.size ? el("div.ctl-holds", {},
      el("div.segment.is-sm.ctl-hand", { role: "group", "aria-label": "Hand" }, ...[["right", "R", "Right hand"], ["left", "L", "Left hand"]].map(([h, short, label]) =>
        el("button", { type: "button", "aria-pressed": String(holdHand === h), title: label, on: { click: () => ((holdHand = h), selected()) } }, short))),
      el("div.ctl-hold-list", {},
        can.size > 15 ? searchField(holdQuery, "Find something to hold…", (v) => ((holdQuery = v), keepSelected(".ctl-holds .ctl-search"))) : null,
        el("div.ctl-hold-row", {},
          el("button.ctl-hold", { type: "button", "aria-pressed": String(!character.hold[holdHand]), title: "Empty hand", "aria-label": "Empty hand", on: { click: () => (stage.setHold(character, holdHand, null), selected()) } }, icon("close")),
          ...holdList.map((h) =>
            el("button.ctl-hold", { type: "button", "aria-pressed": String(character.hold[holdHand] === h.type), title: h.name, "aria-label": h.name, on: { click: () => (stage.setHold(character, holdHand, h.type), selected()) } },
              lazyImg(() => stage.handThumbnail(h.type))))))) : null;
    const bodyKeys = character.rigId ? ["height"] : advanced ? BODY_SLIDERS.map(([k]) => k) : BODY_MAIN;
    const poseKeys = advanced ? PARAMS.map(([k]) => k) : POSE_MAIN;
    const bodyCol = el("div.ctl-sliders", {}, el("span.ctl-label.is-sub", {}, "Body"), ...bodyKeys.map((k) => {
      const def = BODY_SLIDERS.find(([key]) => key === k);
      return slider(def, character.profile[k] ?? 1, (v, commit) => stage.setProfile(character, { [k]: v }, { commit }));
    }));
    const poseCol = el("div.ctl-sliders", {}, el("span.ctl-label.is-sub", {}, "Pose"), ...poseKeys.map((k) => {
      const [key, label, min, max] = PARAMS.find(([p]) => p === k);
      return slider([key, label, min, max, key === "crouch" ? 0.01 : 1, key === "crouch" ? "" : "°"], character.params[k] ?? 0, (v, commit) => stage.setParams({ [k]: v }, character, { commit }));
    }));
    const rig = character.rigId ? rigById(character.rigId) : null;
    const about = !rig ? "This rigged character is loading…" : rig.builtIn ? `${rig.name}: rigged, so it takes every pose. A body type turns it into a mannequin.` : `${rig.name}, your rigged character: its rig follows every pose. A body type turns it back into a mannequin.`;
    selectedEl.replaceChildren(head, swatches,
      el("span.ctl-label.is-sub", {}, "Body type"), bodies,
      ...(character.rigId ? [el("p.ctl-sub", {}, about)] : []),
      ...(holds ? [el("span.ctl-label.is-sub", {}, "In hand"), holds] : []),
      el("div.ctl-columns", {}, bodyCol, poseCol),
      el("div.ctl-row", {},
        el("button.key.is-sm.is-quiet", { type: "button", "aria-pressed": String(advanced), on: { click: () => ((advanced = !advanced), selected()) } }, advanced ? "Fewer" : "Advanced"),
        el("button.key.is-sm.is-quiet", { type: "button", title: "Pose sliders back to zero", on: { click: () => ((character.params = {}), stage.setParams({}, character)) } }, icon("remix"), "Reset")));
  }

  function readouts() {
    const euler = stage.jointEuler();
    if (!euler) return;
    selectedEl.querySelectorAll(".ctl-num input").forEach((input, i) => {
      if (document.activeElement !== input) input.value = String(euler[i]);
    });
  }

  // ---------------------------------------------------------------- channels: previews and renders

  let previewTimer = 0;
  function previews() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      if (stage.playing || root.closest("[hidden]")) return;
      previewsEl.replaceChildren(...PASSES.map((id) => {
        const label = CHANNELS.find(([c]) => c === id)[1];
        return el("button.ctl-preview", { type: "button", "aria-pressed": String(stage.channel === id), title: `${label} — show it in the viewport`, on: { click: () => stage.setChannel(stage.channel === id ? "clay" : id) } },
          el("img", { src: stage.frameStill(id, { long: 240 }), alt: "", draggable: false }), el("span", {}, label));
      }));
    }, 260);
  }

  let videoChannel = "depth";
  let rendering = false;
  function renderKeys() {
    renderEl.replaceChildren(
      el("button.key.is-primary.ctl-render-refs", { type: "button", disabled: rendering || !stage.characters.length && !stage.props.length, on: { click: renderReferences } }, sprite("scene-render"), "Render references"),
      el("div.ctl-video-row", {},
        el("div.segment.is-sm", { role: "group", "aria-label": "Video channel" }, ...["depth", "pose", "lines", "clay"].map((c) =>
          el("button", { type: "button", "aria-pressed": String(videoChannel === c), on: { click: () => ((videoChannel = c), renderKeys()) } }, CHANNELS.find(([id]) => id === c)[1]))),
        el("button.key.ctl-render-video", { type: "button", disabled: rendering || !stage.characters.length && !stage.props.length, on: { click: renderVideo } }, icon("video"), "Render video")));
  }

  async function upload(dataUrl, name) {
    const blob = await (await fetch(dataUrl)).blob();
    const res = await fetch(`api/photos?name=${encodeURIComponent(name)}`, { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Upload failed.");
    return res.json();
  }

  /** Every channel of the frame as it is now, full size, into the Library. */
  async function renderReferences() {
    rendering = true;
    renderKeys();
    try {
      const shot = (stage.characters[0]?.name ?? "stage").toLowerCase();
      const passes = ["clay", ...PASSES];
      for (const id of passes) await upload(stage.frameStill(id, { long: 1536 }), `stage ${shot} ${id}`);
      toast(`${passes.length} references are in the Library: clay, ${PASSES.join(", ")}.`, { action: { label: "Open Library", run: () => go("library") } });
    } catch (error) {
      toast(error.message, { tone: "crit" });
    } finally {
      rendering = false;
      renderKeys();
    }
  }

  /** The timeline, frame by frame, in one channel, as a video for motion control. */
  async function renderVideo() {
    rendering = true;
    renderKeys();
    const was = stage.time;
    try {
      const frames = [];
      const count = Math.round(stage.duration * stage.fps) + 1;
      for (let f = 0; f < count; f++) {
        stage.time = f / stage.fps;
        stage.evaluate();
        frames.push(stage.frameStill(videoChannel, { long: 768, type: "image/jpeg", quality: 0.92 }));
        if (f % 12 === 0) toast(`Rendering ${videoChannel}… ${Math.round((f / count) * 100)}%`);
      }
      const label = CHANNELS.find(([id]) => id === videoChannel)[1];
      const res = await fetch("api/control/video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ frames, fps: stage.fps, name: `Stage ${label.toLowerCase()}` }) });
      const video = await res.json();
      if (!res.ok) throw new Error(video.error ?? "The video was not made.");
      toast(`A ${stage.duration} s ${label.toLowerCase()} video is ready.`, { action: { label: "Use in Shot", run: () => useVideo(video, `Stage ${label.toLowerCase()}`, videoChannel) } });
    } catch (error) {
      toast(error.message, { tone: "crit" });
    } finally {
      stage.setTime(was);
      rendering = false;
      renderKeys();
    }
  }

  // ---------------------------------------------------------------- keys

  document.addEventListener("keydown", (e) => {
    // only while the Stage is on screen, and never while typing or over a window
    if (root.closest("[hidden]") || document.body.classList.contains("has-window")) return;
    if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "z") return e.preventDefault(), e.shiftKey ? stage.redo() : stage.undo();
    if ((e.ctrlKey || e.metaKey) && k === "y") return e.preventDefault(), stage.redo();
    if ((e.ctrlKey || e.metaKey) && k === "d") return e.preventDefault(), stage.duplicate();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tool = { q: "select", e: "rotate", w: "move", r: "scale" }[k];
    if (tool) return stage.setTool(tool);
    if (k === " ") return e.preventDefault(), stage.play();
    if (k === "k") return stage.key(stage.selection.character ? { character: stage.selection.character } : stage.selection.prop ? { prop: stage.selection.prop } : { camera: true });
    if (k === "m") return stage.mirror();
    if (k === "f") return stage.snap("front");
    if (/^[1-7]$/.test(k)) return stage.setChannel(CHANNELS[Number(k) - 1][0]);
    if (k === "delete" || k === "backspace") return pickedKey ? (stage.removeKey(pickedKey.target, pickedKey.t), (pickedKey = null)) : stage.remove();
    if (k === "escape") return stage.select({});
  });

  // ---------------------------------------------------------------- wiring

  stage.on((kind) => {
    if (kind === "selection") (outliner(), tools(), selected(), snaps(), library(), timeline());
    else if (kind === "pose") (readouts(), snaps(), previews());
    else if (kind === "scene") (outliner(), tools(), selected(), snaps(), library(), frame(), timeline(), previews(), renderKeys());
    else if (kind === "history") (tools(), outliner(), timeline(), previews(), renderKeys(), frame());
    else if (kind === "tool") (tools(), outliner());
    else if (kind === "frame") (frame(), snaps(), previews());
    else if (kind === "camera") (previews(), frame());
    else if (kind === "channel") (channelPill(), previews());
    else if (kind === "timeline") (timeline(), frame());
    else if (kind === "time") (playhead(), stage.playing ? null : previews());
  });

  // an agent can stage the scene through the server; the lamp says whether the link is up and what it is doing
  connectRemote(stage, {
    onActivity({ connected, op }) {
      if (connected) linkLamp.dataset.tone = op ? "busy" : "ok";
      else delete linkLamp.dataset.tone;
      linkLamp.dataset.tooltip = !connected ? "Agent link — waiting for the server" : op ? `Agent link — ${op.replace(/_/g, " ")}` : "Agent link — ready for commands";
    },
  });

  // every stage is a project, kept as it changes; the last one opens again
  const projects = projectsOf(stage, { el, toast, tabsEl, actionsEl });
  channelPill();
  frame();
  outliner();
  tools();
  selected();
  library();
  timeline();
  snaps();
  previews();
  renderKeys();
  projects.openLast();
  return { stage, ops, describe, chatSlot, root, projects };
}

/**
 * The Stage's projects: each stage kept on the server under its name, saved a moment after
 * every change, with a picture of its frame. The stages you work on are tabs on the bar over
 * the desk, as shots are; its keys open your stages, duplicate, share and delete one, and a
 * shared file carries the user's own models with it.
 */
function projectsOf(stage, { el, toast, tabsEl, actionsEl }) {
  const json = { "Content-Type": "application/json" };
  const call = async (url, opts) => {
    const res = await fetch(url, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `The stage could not be reached (${res.status}).`);
    return body;
  };
  const LAST = "comfyture.stage";
  const TABS = "comfyture.stage.tabs";
  const read = (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  };
  const thumb = () => stage.frameStill("clay", { long: 360, type: "image/jpeg", quality: 0.72 });
  const ago = (t) => {
    const m = Math.round((Date.now() - new Date(t).getTime()) / 60000);
    return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString();
  };
  let project = null;
  let timer = 0;
  let pending = null;
  // the open stages, in their order, and what the server says of each (name, picture, when)
  let tabs = [];
  const known = new Map();
  let renaming = false;

  const lamp = el("span.lamp.ctl-saved", { role: "status", "data-tooltip": "Not saved yet" });
  const key = (glyph, label, run) => el("button.key.is-icon.ctl-stage-key", { type: "button", title: label, "aria-label": label, on: { click: run } }, glyph);
  let arming = 0;
  const del = key(icon("trash"), "Delete this stage — click twice", () => {
    if (Date.now() - arming > 2500) {
      arming = Date.now();
      del.setAttribute("aria-pressed", "true");
      setTimeout(() => del.setAttribute("aria-pressed", "false"), 2500);
      return toast("Click once more to delete this stage.");
    }
    arming = 0;
    remove();
  });
  actionsEl.replaceChildren(
    key(icon("grid"), "Your stages", browse),
    key(sprite("copy"), "Duplicate this stage", duplicate),
    key(sprite("export"), "Export to share — one file, with your own models in it", exportFile),
    key(sprite("import"), "Import a stage someone shared", importFile),
    del);

  // ---------------------------------------------------------------- the tabs

  let preview = null;
  const hidePreview = () => (preview?.remove(), (preview = null));
  function showPreview(p, tab) {
    hidePreview();
    if (!p.thumb) return;
    const box = tab.getBoundingClientRect();
    preview = el("div.tab-preview.is-stage", { style: { left: `${Math.min(innerWidth - 256, box.left)}px`, top: `${box.bottom + 8}px` } },
      el("img", { src: p.thumb, alt: "" }), el("b", {}, p.name, el("span", {}, ago(p.updatedAt))));
    document.body.append(preview);
  }

  function renameField(p) {
    const input = el("input.tab-rename", { value: p.name, maxLength: 60, "aria-label": "Stage name" });
    const done = (keep) => {
      if (!renaming) return;
      renaming = false;
      if (keep) rename(input.value);
      else render();
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") done(true);
      if (e.key === "Escape") done(false);
    });
    input.addEventListener("blur", () => done(true));
    input.addEventListener("click", (e) => e.stopPropagation());
    requestAnimationFrame(() => (input.focus(), input.select()));
    return input;
  }

  function tabEl(id) {
    const p = known.get(id) ?? { id, name: "…" };
    const active = id === project?.id;
    const tab = el("div.tab.ctl-stage-tab", {
      role: "tab",
      tabindex: "0",
      "aria-selected": String(active),
      title: active ? "Double-click to rename" : undefined,
      on: {
        click: () => !active && open(id).catch((e) => toast(e.message, { tone: "crit" })),
        dblclick: () => active && !renaming && ((renaming = true), hidePreview(), render()),
        keydown: (e) => (e.key === "Enter" || e.key === " ") && e.target === tab && (e.preventDefault(), tab.click()),
      },
    },
      p.thumb ? el("img.tab-thumb", { src: p.thumb, alt: "", draggable: false }) : el("span.tab-thumb.is-icon", {}, icon("film")),
      active && renaming ? renameField(p) : el("span.tab-name", {}, p.name),
      active ? lamp : null,
      tabs.length > 1 ? el("span.tab-close", { role: "button", "aria-label": `Close ${p.name}`, title: "Close the tab — the stage is kept", on: { click: (e) => (e.stopPropagation(), closeTab(id)) } }, icon("close")) : null);
    tab.addEventListener("pointerenter", () => !renaming && showPreview(p, tab));
    tab.addEventListener("pointerleave", hidePreview);
    return tab;
  }

  function render() {
    hidePreview();
    tabsEl.replaceChildren(...tabs.map(tabEl),
      el("button.tab-add", { type: "button", title: "A new, empty stage in its own tab", on: { click: () => create().catch((e) => toast(e.message, { tone: "crit" })) } }, icon("plus"), "New stage"));
    tabsEl.classList.toggle("is-overflowing", tabsEl.scrollWidth > tabsEl.clientWidth + 1);
    tabsEl.querySelector('.tab[aria-selected="true"]')?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }
  tabsEl.onwheel = (e) => {
    if (tabsEl.scrollWidth <= tabsEl.clientWidth || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
    tabsEl.scrollLeft += e.deltaY;
    e.preventDefault();
  };

  /** A stage gets a tab of its own, next to the one open. */
  function addTab(id) {
    if (tabs.includes(id)) return;
    const at = tabs.indexOf(project?.id);
    tabs.splice(at < 0 ? tabs.length : at + 1, 0, id);
  }
  function show(p) {
    const { scene: _scene, ...meta } = p;
    known.set(p.id, { ...known.get(p.id), ...meta });
    addTab(p.id);
    project = p;
    write(LAST, p.id);
    write(TABS, JSON.stringify(tabs));
    render();
  }
  function saved(when) {
    lamp.dataset.tone = "ok";
    lamp.dataset.tooltip = `Saved ${new Date(when).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }

  // ---------------------------------------------------------------- keeping, opening, making

  async function list() {
    const { stages } = await call("api/control/stages");
    known.clear();
    for (const p of stages) known.set(p.id, p);
    tabs = tabs.filter((id) => known.has(id));
    return stages;
  }
  async function save() {
    if (!project) return;
    clearTimeout(timer);
    timer = 0;
    lamp.dataset.tone = "busy";
    lamp.dataset.tooltip = "Saving…";
    const id = project.id;
    pending = call(`api/control/stages/${id}`, { method: "PUT", headers: json, body: JSON.stringify({ scene: stage.toJSON(), thumb: thumb() }) })
      .then((b) => {
        known.set(id, { ...known.get(id), ...b.stage });
        if (project?.id === id) saved(b.stage.updatedAt);
        // the tab's picture follows the frame, unless its name is being typed
        if (!renaming) render();
      })
      .catch((e) => ((lamp.dataset.tone = "crit"), (lamp.dataset.tooltip = e.message)));
    return pending;
  }
  // a moment after any change, the stage is kept
  stage.on((kind) => {
    if (kind !== "history" || !project) return;
    clearTimeout(timer);
    lamp.dataset.tone = "busy";
    lamp.dataset.tooltip = "Changed — saving in a moment";
    timer = setTimeout(save, 1200);
  });

  async function open(id) {
    if (project && timer) await save();
    const { stage: p } = await call(`api/control/stages/${id}`);
    stage.load(p.scene ?? { version: 2 });
    stage.select({});
    show(p);
    saved(p.updatedAt);
  }
  async function create(name, scene) {
    if (project && timer) await save();
    const count = (await list()).length;
    if (!scene) stage.load({ version: 2 });
    const { stage: p } = await call("api/control/stages", { method: "POST", headers: json, body: JSON.stringify({ name: name ?? `Stage ${count + 1}`, scene: scene ?? stage.toJSON(), thumb: thumb() }) });
    show(p);
    saved(p.updatedAt);
    return p;
  }
  async function duplicate() {
    if (!project) return;
    await save();
    await create(`${project.name} copy`, stage.toJSON());
    toast(`"${project.name}" is a copy you can change freely.`);
  }
  async function rename(name) {
    if (!project || !name.trim() || name.trim() === project.name) return render();
    const { stage: p } = await call(`api/control/stages/${project.id}`, { method: "PUT", headers: json, body: JSON.stringify({ name: name.trim() }) });
    project.name = p.name;
    known.set(p.id, { ...known.get(p.id), ...p });
    render();
  }
  /** The tab goes, the stage stays (in Your stages); the one beside it opens. */
  async function closeTab(id) {
    if (tabs.length < 2) return;
    const at = tabs.indexOf(id);
    if (id === project?.id) {
      if (timer) await save();
      const next = tabs[at + 1] ?? tabs[at - 1];
      tabs.splice(at, 1);
      project = null;
      await open(next);
    } else {
      tabs.splice(at, 1);
      write(TABS, JSON.stringify(tabs));
      render();
    }
  }
  async function remove() {
    if (!project) return;
    const gone = project;
    clearTimeout(timer);
    timer = 0;
    const at = tabs.indexOf(gone.id);
    const { stages } = await call(`api/control/stages/${gone.id}`, { method: "DELETE" });
    known.delete(gone.id);
    tabs = tabs.filter((id) => id !== gone.id);
    project = null;
    const next = tabs[at] ?? tabs[at - 1] ?? stages[0]?.id;
    if (next) await open(next);
    else await create("Stage 1");
    toast(`"${gone.name}" is deleted.`);
  }
  async function exportFile() {
    if (!project) return;
    await save();
    const a = el("a", { href: `api/control/stages/${project.id}/export`, download: "" });
    document.body.append(a);
    a.click();
    a.remove();
  }
  function importFile() {
    const input = el("input", { type: "file", accept: ".json,application/json", hidden: true });
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      try {
        toast(`Bringing in ${file.name}…`);
        const { stage: p } = await call("api/control/stages/import", { method: "POST", headers: json, body: await file.text() });
        await loadNewUserModels();
        await open(p.id);
        toast(`"${p.name}" is open, with its models.`);
      } catch (e) {
        toast(e.message, { tone: "crit" });
      }
    });
    document.body.append(input);
    input.click();
  }

  /** Your stages, each with its frame, in a window over the app: one opens in a tab. */
  async function browse() {
    if (project && timer) await save();
    const stages = await list();
    const d = el("dialog.dialog.ctl-projects-window", {});
    const card = (p) => el("button.ctl-project-card", { type: "button", "aria-pressed": String(p.id === project?.id), title: `Open "${p.name}"`, on: { click: async () => (d.close(), await open(p.id)) } },
      p.thumb ? el("img", { src: p.thumb, alt: "", draggable: false }) : el("span.ctl-project-blank", {}, icon("film")),
      el("span.ctl-project-name-line", {}, p.name), el("span.ctl-project-when", {}, ago(p.updatedAt)));
    d.append(
      el("div.ctl-projects-head", {}, el("h2", {}, "Your stages"),
        el("div.ctl-project-keys", {},
          key(icon("plus"), "New stage", async () => (d.close(), await create())),
          key(sprite("import"), "Import a stage someone shared", () => (d.close(), importFile())),
          key(icon("close"), "Close", () => d.close()))),
      el("div.ctl-projects-grid", {}, ...stages.map(card)));
    d.addEventListener("close", () => d.remove());
    d.addEventListener("click", (e) => e.target === d && d.close());
    document.body.append(d);
    d.showModal();
    render();
  }

  return {
    current: () => project,
    open,
    newProject: (name) => create(name),
    /** The stages open last open again; the very first time, every stage (the examples) has a tab. */
    async openLast() {
      try {
        const stages = await list();
        let kept = null;
        try {
          kept = JSON.parse(read(TABS) ?? "null");
        } catch {}
        tabs = Array.isArray(kept) ? kept.filter((id) => known.has(id)) : [];
        if (!tabs.length) tabs = stages.slice(0, 8).map((p) => p.id);
        const last = read(LAST);
        const id = tabs.includes(last) ? last : tabs[0];
        if (id) return await open(id);
        await create("Stage 1");
      } catch (e) {
        toast(e.message, { tone: "crit" });
      }
    },
  };
}
