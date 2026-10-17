// The stage: one three.js scene with mannequins, props, a ground and a camera
// framed to the output ratio. It owns selection, the gizmo, IK handles, camera
// snaps and moves, the timeline and the undo history; the page draws its panels
// from what it reports. The viewport can show any control channel live.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Mannequin } from "./mannequin.js";
import { CHAINS, JOINT_NAMES, PALETTE, bodyById } from "./skeleton.js";
import { poseById, holdArm } from "./poses.js";
import { makeProp, propFromJSON, setPropParams, refillProp, registerUserProp, forgetUserProp, registerModelAssets } from "./assets.js";
import { loadModels, loadUserModels, onUserModels, MODELS, USER, rigById } from "./models.js";
import { Channels } from "./channels.js";

/** Vertical field of view (degrees) of a lens on a full-frame (36 × 24 mm) sensor. */
export const fovOf = (mm) => THREE.MathUtils.radToDeg(2 * Math.atan(12 / mm));

export const RATIOS = { "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1, "3:2": 3 / 2, "2:3": 2 / 3, "4:3": 4 / 3, "3:4": 3 / 4, "21:9": 21 / 9 };

export const SNAPS = [
  ["front", "Front"], ["three-quarter-left", "Three-quarter left"], ["three-quarter-right", "Three-quarter right"], ["side", "Side"],
  ["back", "Back"], ["top", "Top"], ["low", "Low angle"], ["high", "High angle"], ["over-shoulder", "Over the shoulder"], ["close-up", "Close-up"],
];

/** Camera moves for a video reference: the camera as it is now is the start, the move sets the end. */
export const MOVES = [
  ["locked", "Locked off"], ["push-in", "Push in"], ["pull-out", "Pull out"], ["orbit-left", "Orbit left"], ["orbit-right", "Orbit right"],
  ["crane-up", "Crane up"], ["crane-down", "Crane down"], ["truck-left", "Truck left"], ["truck-right", "Truck right"],
  ["tilt-up", "Tilt up"], ["tilt-down", "Tilt down"], ["zoom-in", "Zoom in"], ["zoom-out", "Zoom out"], ["handheld", "Handheld"],
];

const EFFECTORS = Object.keys(CHAINS);
const lerp = THREE.MathUtils.lerp;
const lerpArr = (a, b, u) => a.map((v, i) => lerp(v, b[i], u));
const ease = (u) => u * u * (3 - 2 * u);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The key before and after time t, and how far between them (eased). */
function bracket(keys, t) {
  if (!keys.length) return null;
  if (t <= keys[0].t) return [keys[0], keys[0], 0];
  const last = keys.at(-1);
  if (t >= last.t) return [last, last, 0];
  const i = keys.findIndex((k) => k.t > t) - 1;
  const [a, b] = [keys[i], keys[i + 1]];
  return [a, b, ease((t - a.t) / Math.max(1e-6, b.t - a.t))];
}

/** Puts a key in a track at its time, replacing one already at (about) the same time. */
function upsert(keys, key) {
  const i = keys.findIndex((k) => Math.abs(k.t - key.t) < 1 / 48);
  if (i >= 0) keys[i] = key;
  else keys.push(key);
  keys.sort((a, b) => a.t - b.t);
}

/** The joint of a body nearest a point (a click on a skinned model). */
function nearestJoint(c, point) {
  let best = "Hips";
  let near = Infinity;
  for (const [name, joint] of Object.entries(c.joints)) {
    const d = joint.getWorldPosition(new THREE.Vector3()).distanceTo(point);
    if (d < near) (near = d), (best = name);
  }
  return best;
}

export class Stage {
  constructor(container, overlay) {
    this.container = container;
    this.overlay = overlay;
    this.listeners = new Set();
    this.characters = [];
    this.props = [];
    this.selection = { character: null, joint: null, prop: null };
    this.tool = "rotate";
    this.ratio = "16:9";
    this.focal = 35;
    this.guides = { thirds: true, safe: false };
    this.history = [];
    this.future = [];
    this.channel = "clay";
    // the timeline: a length, a playhead, the camera's keys (objects keep their own)
    this.duration = 5;
    this.time = 0;
    this.fps = 24;
    this.cameraKeys = [];
    this.handheld = 0;
    this.autoKey = true;
    this.playing = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.append(renderer.domElement);
    this.renderer = renderer;
    // the pose channel is drawn in 2D, over the viewport
    this.poseLayer = document.createElement("canvas");
    this.poseLayer.className = "ctl-pose-layer";
    this.poseLayer.hidden = true;
    container.append(this.poseLayer);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#141416");
    scene.fog = new THREE.Fog("#141416", 14, 34);
    this.scene = scene;

    // a studio: a soft room all round (the clay's shading), a key with its shadows, a warm fill
    // from the other side and a cool rim behind
    this.envMain = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = this.envMain;
    scene.environmentIntensity = 0.6;
    scene.add(new THREE.HemisphereLight("#dcdad6", "#202024", 0.5));
    const key = new THREE.DirectionalLight("#ffffff", 1.9);
    key.position.set(3.5, 6, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(4096, 4096);
    Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 34 });
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.02;
    scene.add(key);
    const fill = new THREE.DirectionalLight("#ffe9d8", 0.6);
    fill.position.set(-5, 3, 4.5);
    scene.add(fill);
    const rim = new THREE.DirectionalLight("#a9bcff", 0.9);
    rim.position.set(-4, 3.5, -5);
    scene.add(rim);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: "#202024", roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.userData.ground = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(40, 80, "#34343a", "#26262b");
    grid.position.y = 0.001;
    scene.add(grid);
    this.ground = ground;
    this.grid = grid;

    const camera = new THREE.PerspectiveCamera(fovOf(this.focal), 16 / 9, 0.05, 200);
    camera.position.set(0.6, 1.35, 4.4);
    this.camera = camera;
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(0, 0.95, 0);
    orbit.enableDamping = false;
    orbit.screenSpacePanning = true;
    orbit.addEventListener("change", () => this.render());
    // a camera that has keys records where you leave it, at the playhead
    orbit.addEventListener("end", () => this.cameraKeys.length && this.autoKey && this.commit());
    this.orbit = orbit;

    const gizmo = new TransformControls(camera, renderer.domElement);
    gizmo.setSize(0.8);
    gizmo.addEventListener("dragging-changed", (e) => {
      orbit.enabled = !e.value;
      if (!e.value) this.commit();
    });
    gizmo.addEventListener("objectChange", () => this.onGizmoMove());
    gizmo.addEventListener("change", () => this.render());
    scene.add(gizmo.getHelper());
    this.gizmo = gizmo;

    // the IK target a hand or foot follows, and the small handles that show where they are
    this.ikTarget = new THREE.Object3D();
    scene.add(this.ikTarget);
    this.handles = new THREE.Group();
    scene.add(this.handles);
    this.channels = new Channels(this);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    let down = null;
    renderer.domElement.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY }));
    renderer.domElement.addEventListener("pointerup", (e) => {
      if (!down || gizmo.dragging) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved < 5) this.pick(e);
    });

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    // the modelled bodies and pieces load behind the first frames and replace the built ones,
    // then the user's own: rigged characters and props
    loadModels().then((m) => {
      if (m.manifest) registerModelAssets(m.manifest.assets ?? []);
      this.refreshModels();
      loadUserModels();
    });
    onUserModels((entry) => this.refreshUserModel(entry));
  }

  // ------------------------------------------------------------ events

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(kind) {
    for (const fn of this.listeners) fn(kind);
  }

  // ------------------------------------------------------------ frame and render

  /** Sizes the canvas to the panel and the frame (the output ratio) inside it. */
  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    const r = RATIOS[this.ratio];
    const pad = 28;
    let fw = w - pad * 2;
    let fh = fw / r;
    if (fh > h - pad * 2) {
      fh = h - pad * 2;
      fw = fh * r;
    }
    this.frame = { x: (w - fw) / 2, y: (h - fh) / 2, w: fw, h: fh };
    Object.assign(this.overlay.style, { left: `${this.frame.x}px`, top: `${this.frame.y}px`, width: `${fw}px`, height: `${fh}px` });
    this.overlay.classList.toggle("has-thirds", this.guides.thirds);
    this.overlay.classList.toggle("has-safe", this.guides.safe);
    this.lens();
    this.render();
  }

  /** The lens sets the frame's vertical field of view; the viewport shows a little more around it. */
  lens() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    const frameTan = Math.tan(THREE.MathUtils.degToRad(fovOf(this.focal)) / 2);
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(frameTan * (h / Math.max(1, this.frame?.h ?? h))));
    this.camera.updateProjectionMatrix();
  }

  setRatio(ratio) {
    this.ratio = ratio;
    this.resize();
    this.emit("frame");
  }

  setFocal(mm) {
    this.focal = THREE.MathUtils.clamp(Math.round(mm), 14, 200);
    this.resize();
    this.emit("frame");
  }

  setGuides(patch) {
    Object.assign(this.guides, patch);
    this.resize();
    this.emit("frame");
  }

  /** Which channel the viewport shows: clay, or a control pass (depth, pose, colour ID...). */
  setChannel(channel) {
    this.channel = channel;
    this.emit("channel");
    this.render();
  }

  render() {
    if (this.pending) return;
    this.pending = requestAnimationFrame(() => {
      this.pending = 0;
      // rigged characters follow their joints, however those were turned
      for (const c of this.characters) c.driveRig();
      this.updateHandles();
      const r = this.renderer;
      const layer = this.poseLayer;
      layer.hidden = this.channel !== "pose";
      if (this.channel === "clay") return r.render(this.scene, this.camera);
      const size = r.getDrawingBufferSize(new THREE.Vector2());
      this.channels.render(r, this.camera, this.channel, { width: size.x, height: size.y });
      if (this.channel === "pose") {
        if (layer.width !== size.x || layer.height !== size.y) Object.assign(layer, { width: size.x, height: size.y });
        this.channels.drawPose(layer.getContext("2d"), this.camera, size.x, size.y);
      }
      // the gizmo and the handles stay on top, so a pass can still be edited
      r.autoClear = false;
      r.clearDepth();
      r.render(this.gizmo.getHelper(), this.camera);
      r.render(this.handles, this.camera);
      r.autoClear = true;
    });
  }

  // ------------------------------------------------------------ scene contents

  /** A colour no one on the stage wears yet, in palette order. */
  freeColor() {
    const used = new Set(this.characters.map((c) => `#${c.color.getHexString()}`));
    return (PALETTE.find(([hex]) => !used.has(hex)) ?? PALETTE[this.characters.length % PALETTE.length])[0];
  }

  /** A name from the body type ("Woman", "Woman 2"...) that no one has yet. */
  freeName(base) {
    const taken = new Set(this.characters.map((c) => c.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
  }

  addCharacter({ pose = "stand", at, name, facing = 0, profile, body = "man", color, rig } = {}) {
    const n = this.characters.length;
    const type = bodyById(body) ?? bodyById("man");
    const own = rig ? rigById(rig) : null;
    const c = new Mannequin({ name: name ?? this.freeName(own?.name ?? type.name), color: color ?? this.freeColor(), body: type.id, profile, rig: own ? rig : undefined });
    c.setPreset(poseById(pose) ?? poseById("stand"));
    c.posed = pose;
    c.root.position.set(at?.[0] ?? (n === 0 ? 0 : n % 2 ? 0.9 * Math.ceil(n / 2) : -0.9 * Math.ceil(n / 2)), 0, at?.[2] ?? 0);
    c.root.rotation.y = facing;
    c.ground();
    this.scene.add(c.root);
    this.characters.push(c);
    this.select({ character: c });
    this.commit();
    return c;
  }

  addProp(type, at, params) {
    const prop = makeProp(type, undefined, params);
    const n = this.props.length;
    // a label no other prop has ("Chair", "Chair 2"...)
    const taken = new Set(this.props.map((p) => p.userData.label.toLowerCase()));
    let label = prop.userData.label;
    for (let i = 2; taken.has(label.toLowerCase()); i++) label = `${prop.userData.label} ${i}`;
    prop.userData.label = prop.name = label;
    prop.position.set(at?.[0] ?? 1.4 + (n % 3) * 0.7, 0, at?.[2] ?? 0.4 + Math.floor(n / 3) * 0.7);
    this.placeOnGround(prop);
    this.scene.add(prop);
    this.props.push(prop);
    this.select({ prop });
    this.commit();
    return prop;
  }

  remove(target = this.selection) {
    if (target.prop) {
      this.scene.remove(target.prop);
      this.props = this.props.filter((p) => p !== target.prop);
    } else if (target.character) {
      this.scene.remove(target.character.root);
      this.characters = this.characters.filter((c) => c !== target.character);
    } else return;
    this.select({});
    this.commit();
  }

  /** A copy of a character or prop, a little to the side. */
  duplicate(target = this.selection) {
    const data = target.character ? target.character.toJSON() : target.prop ? target.prop.userData.toJSON() : null;
    if (!data) return null;
    const copy = structuredClone(data);
    copy.id = undefined;
    copy.position = [copy.position[0] + 0.8, copy.position[1], copy.position[2]];
    copy.keys = [];
    if (target.character) {
      copy.name = this.freeName(target.character.name.replace(/ \d+$/, ""));
      copy.color = this.freeColor();
      const c = Mannequin.fromJSON(copy);
      this.scene.add(c.root);
      this.characters.push(c);
      this.select({ character: c });
      this.commit();
      return c;
    }
    const p = propFromJSON(copy);
    const taken = new Set(this.props.map((x) => x.userData.label.toLowerCase()));
    const base = p.userData.label.replace(/ \d+$/, "");
    let label = base;
    for (let i = 2; taken.has(label.toLowerCase()); i++) label = `${base} ${i}`;
    p.userData.label = p.name = label;
    this.scene.add(p);
    this.props.push(p);
    this.select({ prop: p });
    this.commit();
    return p;
  }

  /** A new name for a character or a prop. */
  rename(target, name) {
    const clean = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!clean) return;
    if (target.character) target.character.name = clean;
    else if (target.prop) target.prop.userData.label = target.prop.name = clean;
    else return;
    this.commit();
    this.emit("scene");
  }

  setColor(character, hex) {
    character.setColor(hex);
    this.commit();
    this.emit("scene");
    this.render();
  }

  /** One of the body types; the body keeps its pose, its place and its feet on the ground. */
  setBody(character, id) {
    character.setBody(id);
    character.ground();
    this.attachGizmo();
    this.commit();
    this.emit("pose");
    this.render();
  }

  /** Some proportions (height, build, shoulders...); commit once the slider is let go. */
  setProfile(character, patch, { commit = true } = {}) {
    character.setProfile(patch);
    character.ground();
    this.attachGizmo();
    if (commit) this.commit();
    this.emit("pose");
    this.render();
  }

  /** A prop's sizes (width, steps, seat height...); it is rebuilt and stays on the ground. */
  setPropParams(prop, patch, { commit = true } = {}) {
    setPropParams(prop, patch);
    this.placeOnGround(prop);
    this.attachGizmo();
    if (commit) this.commit();
    this.emit("pose");
    this.render();
  }

  placeOnGround(object) {
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    object.position.y -= box.min.y;
    object.updateMatrixWorld(true);
  }

  // ------------------------------------------------------------ selection and tools

  select({ character = null, joint = null, prop = null } = {}) {
    this.selection = { character, joint, prop };
    this.attachGizmo();
    this.emit("selection");
    this.render();
  }

  setTool(tool) {
    this.tool = tool;
    this.attachGizmo();
    this.emit("tool");
    this.render();
  }

  /** Puts the gizmo on what the tool works on: a joint, a hand or foot's IK target, a prop, a body. */
  attachGizmo() {
    const { character, joint, prop } = this.selection;
    const g = this.gizmo;
    g.detach();
    if (this.tool === "select") return;
    if (prop) {
      g.setMode(this.tool === "move" ? "translate" : this.tool === "scale" ? "scale" : "rotate");
      g.setSpace(this.tool === "move" ? "world" : "local");
      g.showY = true;
      g.attach(prop);
      return;
    }
    if (!character) return;
    if (this.tool === "move" && joint && EFFECTORS.includes(joint)) {
      character.joints[joint].getWorldPosition(this.ikTarget.position);
      this.ikTarget.userData = { character, effector: joint };
      g.setMode("translate");
      g.setSpace("world");
      g.showY = true;
      g.attach(this.ikTarget);
      return;
    }
    if (this.tool === "move" || (!joint && this.tool === "rotate")) {
      g.setMode(this.tool === "move" ? "translate" : "rotate");
      g.setSpace("world");
      g.showY = this.tool !== "move";
      g.attach(character.root);
      return;
    }
    if (this.tool === "rotate" && joint) {
      g.setMode("rotate");
      g.setSpace("local");
      g.showY = true;
      g.attach(character.joints[joint]);
    }
  }

  onGizmoMove() {
    const { character, joint } = this.selection;
    const object = this.gizmo.object;
    if (object === this.ikTarget && this.ikTarget.userData.character) {
      this.ikTarget.userData.character.reach(this.ikTarget.userData.effector, this.ikTarget.position);
      this.ikTarget.userData.character.posed = "custom";
    } else if (character && joint && object === character.joints[joint]) {
      character.constrain(joint);
      character.posed = "custom";
    }
    this.emit("pose");
  }

  /** A click: a body part selects its joint, a handle its hand or foot, a prop itself, empty space nothing. */
  pick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const handles = this.raycaster.intersectObjects(this.handles.children, false);
    if (handles.length) {
      const { character, effector } = handles[0].object.userData;
      this.select({ character, joint: effector });
      if (this.tool !== "move") this.setTool("move");
      return;
    }
    const targets = [...this.characters.flatMap((c) => c.parts), ...this.props];
    for (const m of targets) if (m.isSkinnedMesh) m.computeBoundingSphere();
    const hit = this.raycaster.intersectObjects(targets, true)[0];
    if (!hit) return this.select({});
    let o = hit.object;
    while (o && !o.userData.prop && !o.userData.character) o = o.userData.propRoot ?? o.parent;
    if (o?.userData.prop) return this.select({ prop: o });
    if (o?.userData.character) {
      const c = o.userData.character;
      // the first click on another body selects the body; a click on a selected body picks the joint
      if (this.selection.character !== c) return this.select({ character: c, joint: null });
      // a skinned model is one mesh: the joint is the one nearest the click
      const joint = hit.object.userData.rigged ? nearestJoint(c, hit.point) : hit.object.userData.joint;
      return this.select({ character: c, joint });
    }
  }

  /** Small spheres on the selected body's hands and feet: drag them to reach (IK). */
  updateHandles() {
    const c = this.selection.character;
    this.handles.clear();
    if (!c || !c.root.visible) return;
    for (const e of EFFECTORS) {
      const handle = new THREE.Mesh(handleGeometry, this.selection.joint === e && this.tool === "move" ? handleOn : handleOff);
      c.joints[e].getWorldPosition(handle.position);
      handle.userData = { character: c, effector: e };
      handle.renderOrder = 10;
      this.handles.add(handle);
    }
  }

  // ------------------------------------------------------------ poses

  applyPose(id, character = this.selection.character) {
    const preset = poseById(id);
    if (!character || !preset) return;
    // a pose from the library starts clean: the sliders go back to zero
    character.params = {};
    character.setPreset(preset);
    character.posed = id;
    // getting up from a seat steps forward off it, rather than standing inside it
    if (character.seatedOn && !preset.seat && !/^(kneel|lie)/.test(id)) {
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(character.root.quaternion).setY(0).normalize();
      character.root.position.addScaledVector(forward, 0.45);
      character.seatedOn = null;
    }
    character.ground();
    this.attachGizmo();
    this.commit();
    this.emit("pose");
  }

  /** Sets pose sliders on a character (look, lean, crouch...), keeping it on the ground. */
  setParams(patch, character = this.selection.character, { commit = true } = {}) {
    if (!character) return;
    character.setParams(patch);
    character.ground();
    this.attachGizmo();
    if (commit) this.commit();
    this.emit("pose");
  }

  mirror(character = this.selection.character) {
    if (!character) return;
    character.mirror();
    this.attachGizmo();
    this.commit();
    this.emit("pose");
  }

  resetPose(character = this.selection.character) {
    this.applyPose("stand", character);
  }

  setJointEuler(axis, degrees) {
    const { character, joint } = this.selection;
    if (!character || !joint) return;
    const j = character.joints[joint];
    const e = new THREE.Euler().setFromQuaternion(j.quaternion, "XYZ");
    e[axis] = THREE.MathUtils.degToRad(degrees);
    j.quaternion.setFromEuler(e);
    character.constrain(joint);
    character.posed = "custom";
    this.commit();
    this.emit("pose");
  }

  /** The selected joint's rotation as XYZ degrees. */
  jointEuler() {
    const { character, joint } = this.selection;
    if (!character || !joint) return null;
    const e = new THREE.Euler().setFromQuaternion(character.joints[joint].quaternion, "XYZ");
    return [e.x, e.y, e.z].map((v) => Math.round(THREE.MathUtils.radToDeg(v)));
  }

  // ------------------------------------------------------------ camera

  /** Frames the selected body (or everyone) from a named angle, relative to the way it faces. */
  snap(name, character = this.selection.character ?? this.characters[0]) {
    const pose = this.snapPose(name, character);
    if (!pose) return;
    this.lastSnap = name;
    this.camera.position.copy(pose.position);
    this.orbit.target.copy(pose.target);
    this.camera.up.set(0, 1, 0);
    this.orbit.update();
    this.emit("camera");
    this.render();
  }

  snapPose(name, character) {
    // the whole scene is framed by its people; the set only counts when there is nobody
    const people = this.characters.filter((c) => c.root.visible);
    const box = character ? character.bounds() : people.length ? people.reduce((b, c) => b.union(c.bounds()), new THREE.Box3()) : this.sceneBounds();
    if (box.isEmpty()) return null;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const forward = new THREE.Vector3(0, 0, 1);
    if (character) forward.applyQuaternion(character.root.quaternion).setY(0).normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize().negate();
    const vfov = THREE.MathUtils.degToRad(fovOf(this.focal));
    const aspect = RATIOS[this.ratio];
    const fit = (height, width) => Math.max(height / 2 / Math.tan(vfov / 2), width / 2 / (Math.tan(vfov / 2) * aspect)) * 1.18;
    const tall = Math.max(size.y, 0.3);
    const wide = Math.max(size.x, size.z, 0.3);
    const dist = fit(tall, wide) + wide / 2;
    const at = (dir, height = center.y) => ({ position: center.clone().addScaledVector(dir.normalize(), dist).setY(height), target: center.clone() });
    switch (name) {
      case "front": return at(forward.clone());
      case "three-quarter-left": return at(forward.clone().add(right.clone().negate()));
      case "three-quarter-right": return at(forward.clone().add(right));
      case "side": return at(right.clone().negate());
      case "back": return at(forward.clone().negate());
      case "top": return { position: center.clone().add(new THREE.Vector3(0, fit(wide * 1.6, wide * 1.6) + tall, 0)).addScaledVector(forward, 0.01), target: center.clone() };
      // from below, the near feet loom larger: stand further back so the head stays in frame
      case "low": return { position: center.clone().addScaledVector(forward, dist * 1.22).setY(0.28), target: center.clone().setY(center.y + tall * 0.08) };
      case "high": return { position: center.clone().addScaledVector(forward, dist * 0.8).setY(box.max.y + tall * 1.1), target: center.clone().setY(center.y - tall * 0.1) };
      case "over-shoulder": {
        if (!character) return at(forward.clone());
        const chest = character.joints.Chest.getWorldPosition(new THREE.Vector3());
        const other = this.characters.find((c) => c !== character);
        const look = other ? other.joints.Chest.getWorldPosition(new THREE.Vector3()) : chest.clone().addScaledVector(forward, 3);
        const toward = look.clone().sub(chest).setY(0).normalize();
        const side = new THREE.Vector3().crossVectors(toward, new THREE.Vector3(0, 1, 0)).normalize();
        return { position: chest.clone().addScaledVector(toward, -0.85).addScaledVector(side, 0.38).add(new THREE.Vector3(0, 0.22, 0)), target: look };
      }
      case "close-up": {
        if (!character) return at(forward.clone());
        const head = character.headBounds();
        const hc = head.getCenter(new THREE.Vector3());
        const hs = head.getSize(new THREE.Vector3());
        const d = fit(hs.y * 2.4, hs.x * 2.4);
        return { position: hc.clone().addScaledVector(forward, d), target: hc.clone().add(new THREE.Vector3(0, -hs.y * 0.15, 0)) };
      }
      default: return null;
    }
  }

  sceneBounds() {
    const box = new THREE.Box3();
    for (const c of this.characters) box.union(c.bounds());
    for (const p of this.props) box.union(new THREE.Box3().setFromObject(p));
    return box;
  }

  /** The camera as data: where it is, what it looks at, its lens. */
  cameraState() {
    return { position: this.camera.position.toArray(), target: this.orbit.target.toArray(), focal: this.focal };
  }

  /**
   * A camera move for the video: the camera as it is now is the start (at 0), the move
   * sets where it ends (at the end of the timeline). amount scales the move.
   */
  cameraMove(name, { amount = 1 } = {}) {
    const start = { t: 0, ...this.cameraState() };
    const end = { ...structuredClone(start), t: this.duration };
    const P = new THREE.Vector3(...start.position);
    const T = new THREE.Vector3(...start.target);
    const toward = T.clone().sub(P);
    const side = new THREE.Vector3().crossVectors(toward, new THREE.Vector3(0, 1, 0)).normalize();
    const set = (p, t) => {
      if (p) end.position = p.toArray();
      if (t) end.target = t.toArray();
    };
    this.handheld = 0;
    switch (name) {
      case "locked":
        this.cameraKeys = [];
        this.commit();
        this.emit("timeline");
        return;
      case "push-in": set(P.clone().addScaledVector(toward, 0.35 * amount)); break;
      case "pull-out": set(P.clone().addScaledVector(toward, -0.45 * amount)); break;
      case "orbit-left":
      case "orbit-right": {
        const a = THREE.MathUtils.degToRad(32 * amount) * (name === "orbit-left" ? 1 : -1);
        set(P.clone().sub(T).applyAxisAngle(new THREE.Vector3(0, 1, 0), a).add(T));
        break;
      }
      case "crane-up": set(P.clone().add(new THREE.Vector3(0, 1.2 * amount, 0)), T.clone().add(new THREE.Vector3(0, 0.25 * amount, 0))); break;
      case "crane-down": set(new THREE.Vector3(P.x, Math.max(0.25, P.y - 1 * amount), P.z), T.clone().add(new THREE.Vector3(0, -0.15 * amount, 0))); break;
      case "truck-left":
      case "truck-right": {
        const d = side.clone().multiplyScalar((name === "truck-left" ? -1.2 : 1.2) * amount);
        set(P.clone().add(d), T.clone().add(d));
        break;
      }
      case "tilt-up": set(null, T.clone().add(new THREE.Vector3(0, 0.9 * amount, 0))); break;
      case "tilt-down": set(null, T.clone().add(new THREE.Vector3(0, -0.9 * amount, 0))); break;
      case "zoom-in": end.focal = THREE.MathUtils.clamp(Math.round(start.focal * (1 + 0.8 * amount)), 14, 200); break;
      case "zoom-out": end.focal = THREE.MathUtils.clamp(Math.round(start.focal / (1 + 0.8 * amount)), 14, 200); break;
      case "handheld": this.handheld = THREE.MathUtils.clamp(amount, 0.1, 3); break;
      default: return;
    }
    this.cameraKeys = [start, end];
    this.lastMove = name;
    this.commit();
    this.emit("timeline");
  }

  // ------------------------------------------------------------ timeline

  setDuration(seconds) {
    const d = THREE.MathUtils.clamp(Math.round(seconds * 10) / 10, 1, 20);
    // keys at the old end move to the new end, so a camera move still spans the shot
    const old = this.duration;
    const stretch = (keys) => keys.forEach((k) => (k.t = Math.abs(k.t - old) < 1e-3 ? d : Math.min(k.t, d)));
    stretch(this.cameraKeys);
    this.characters.forEach((c) => stretch(c.keys));
    this.props.forEach((p) => stretch(p.userData.keys));
    this.duration = d;
    this.time = Math.min(this.time, d);
    this.commit();
    this.emit("timeline");
  }

  /** Moves the playhead and shows the scene as it is then. */
  setTime(t) {
    this.time = THREE.MathUtils.clamp(t, 0, this.duration);
    this.evaluate();
    this.emit("time");
    this.render();
  }

  play(on = !this.playing) {
    this.playing = on;
    this.emit("timeline");
    if (!on) return;
    let last = performance.now();
    if (this.time >= this.duration - 1e-3) this.setTime(0);
    const tick = (now) => {
      if (!this.playing) return;
      const t = this.time + (now - last) / 1000;
      last = now;
      if (t >= this.duration) {
        this.setTime(this.duration);
        this.playing = false;
        this.emit("timeline");
        return;
      }
      this.setTime(t);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** The keys of a target ({ camera: true }, { character }, { prop }). */
  keysOf(target) {
    if (target.camera) return this.cameraKeys;
    if (target.character) return target.character.keys;
    if (target.prop) return target.prop.userData.keys;
    return null;
  }

  /** A target's state as a key at time t. */
  keyFor(target, t = this.time) {
    if (target.camera) return { t, ...this.cameraState() };
    if (target.character) {
      const c = target.character;
      // while the timeline walks a body, its sliders and its heading carry the stride: keep what the keys said
      const shown = c.keyed?.shown;
      const params = shown && shown.params === JSON.stringify(c.params) ? c.keyed.params : { ...c.params };
      const quaternion = shown && shown.quaternion === JSON.stringify(c.root.quaternion.toArray()) ? c.keyed.quaternion : c.root.quaternion.toArray();
      return { t, position: c.root.position.toArray(), quaternion, pose: c.getPose(), params, posed: c.posed };
    }
    const p = target.prop;
    return { t, position: p.position.toArray(), quaternion: p.quaternion.toArray(), scale: p.scale.toArray() };
  }

  /** Records a key for the camera, a character or a prop at the playhead. */
  key(target = this.selection.character || this.selection.prop ? this.selection : { camera: true }, t = this.time) {
    const keys = this.keysOf(target);
    if (!keys) return;
    upsert(keys, this.keyFor(target, t));
    this.commit();
    this.emit("timeline");
  }

  removeKey(target, t) {
    const keys = this.keysOf(target);
    if (!keys) return;
    const i = keys.findIndex((k) => Math.abs(k.t - t) < 1 / 48);
    if (i < 0) return;
    keys.splice(i, 1);
    if (target.camera && !keys.length) this.handheld = 0;
    this.commit();
    this.emit("timeline");
  }

  clearKeys(target) {
    const keys = this.keysOf(target);
    if (!keys?.length) return;
    keys.length = 0;
    if (target.camera) this.handheld = 0;
    this.commit();
    this.emit("timeline");
  }

  /** The tracks the timeline shows: the camera, then everything that has keys. */
  tracks() {
    return [
      { target: { camera: true }, id: "camera", name: "Camera", keys: this.cameraKeys },
      ...this.characters.filter((c) => c.keys.length).map((c) => ({ target: { character: c }, id: c.id, name: c.name, color: `#${c.color.getHexString()}`, keys: c.keys })),
      ...this.props.filter((p) => p.userData.keys.length).map((p) => ({ target: { prop: p }, id: p.userData.id, name: p.userData.label, keys: p.userData.keys })),
    ];
  }

  /** The camera, the bodies and the props as their keys have them at the playhead. */
  evaluate() {
    const t = this.time;
    const cam = bracket(this.cameraKeys, t);
    if (cam) {
      const [a, b, u] = cam;
      this.camera.position.fromArray(lerpArr(a.position, b.position, u));
      this.orbit.target.fromArray(lerpArr(a.target, b.target, u));
      const focal = Math.round(lerp(a.focal, b.focal, u));
      if (focal !== this.focal) (this.focal = focal), this.lens();
      if (this.handheld) {
        // a slow, deterministic wobble, the same every time the shot plays
        const n = (f, s) => Math.sin(t * f + s) * 0.6 + Math.sin(t * f * 2.3 + s * 1.7) * 0.4;
        const k = this.handheld;
        this.camera.position.add(new THREE.Vector3(n(1.3, 1) * 0.02 * k, n(1.7, 2) * 0.015 * k, n(1.1, 3) * 0.02 * k));
        this.orbit.target.add(new THREE.Vector3(n(0.9, 4) * 0.035 * k, n(1.2, 5) * 0.025 * k, 0));
      }
      this.orbit.update();
    }
    for (const c of this.characters) {
      const k = bracket(c.keys, t);
      if (!k) continue;
      const [a, b, u] = k;
      const from = new THREE.Vector3(...a.position);
      const to = new THREE.Vector3(...b.position);
      const position = from.clone().lerp(to, u);
      c.root.position.copy(position);
      const qa = new THREE.Quaternion(...a.quaternion);
      const qb = new THREE.Quaternion(...b.quaternion);
      c.root.quaternion.slerpQuaternions(qa, qb, u);
      const params = {};
      for (const key of new Set([...Object.keys(a.params ?? {}), ...Object.keys(b.params ?? {})])) params[key] = lerp(a.params?.[key] ?? 0, b.params?.[key] ?? 0, u);
      // what the keys say, before the walk is laid over it: an auto-key records this, not the stride
      c.keyed = { params: { ...params }, quaternion: c.root.quaternion.toArray() };
      // a body that travels between two keys walks (or runs) there, facing the way it goes
      const travel = to.clone().sub(from).setY(0);
      const speed = travel.length() / Math.max(1e-3, b.t - a.t);
      if (c.gait !== "none" && a !== b && speed > 0.25) {
        const run = c.gait === "run" || (c.gait !== "walk" && speed > 2.4);
        const stride = (run ? 2.6 : 1.45) * (c.profile.height / 1.78);
        const phase = (position.clone().sub(from).setY(0).length() / stride) * Math.PI * 2;
        params.step = (params.step ?? 0) + Math.sin(phase) * (run ? 40 : 24);
        params.swing = (params.swing ?? 0) + Math.sin(phase) * (run ? 42 : 20);
        params.elbows = (params.elbows ?? 0) + (run ? 75 : 12);
        if (run) params.lean = (params.lean ?? 0) + 10;
        if (qa.angleTo(qb) < 1e-3) c.root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(travel.x, travel.z));
      }
      const pose = {};
      for (const n of JOINT_NAMES) {
        const pa = a.pose?.[n] ?? [0, 0, 0, 1];
        const pb = b.pose?.[n] ?? [0, 0, 0, 1];
        pose[n] = new THREE.Quaternion(...pa).slerp(new THREE.Quaternion(...pb), u).toArray();
      }
      c.params = params;
      c.setPose(pose);
      c.posed = u < 0.5 ? a.posed : b.posed;
      c.keyed.shown = { params: JSON.stringify(c.params), quaternion: JSON.stringify(c.root.quaternion.toArray()) };
    }
    for (const p of this.props) {
      const k = bracket(p.userData.keys, t);
      if (!k) continue;
      const [a, b, u] = k;
      p.position.fromArray(lerpArr(a.position, b.position, u));
      p.quaternion.slerpQuaternions(new THREE.Quaternion(...a.quaternion), new THREE.Quaternion(...b.quaternion), u);
      p.scale.fromArray(lerpArr(a.scale ?? [1, 1, 1], b.scale ?? [1, 1, 1], u));
    }
    this.attachGizmo();
  }

  /**
   * With auto-key on, an edit to something that has keys is recorded at the playhead: what
   * the scene shows now and what its keys would show differ, so the keys take the change.
   */
  autoKeyChanges() {
    if (!this.autoKey) return;
    const t = this.time;
    const targets = [{ camera: true }, ...this.characters.map((character) => ({ character })), ...this.props.map((prop) => ({ prop }))];
    for (const target of targets) {
      const keys = this.keysOf(target);
      if (!keys?.length) continue;
      const now = this.keyFor(target, t);
      const at = bracket(keys, t);
      const [a, b, u] = at;
      const sampled = target.camera
        ? { position: lerpArr(a.position, b.position, u), target: lerpArr(a.target, b.target, u), focal: Math.round(lerp(a.focal, b.focal, u)) }
        : { position: lerpArr(a.position, b.position, u) };
      const close = (x, y) => x.every((v, i) => Math.abs(v - y[i]) < 1e-3);
      const moved = !close(now.position, sampled.position) || (target.camera && (!close(now.target, sampled.target) || now.focal !== sampled.focal));
      // a body's pose and sliders, a prop's turn and size, compared with the key it sits on (if any)
      const onKey = keys.find((k) => Math.abs(k.t - t) < 1 / 48);
      let changed = moved || (onKey && !target.camera && (!same(onKey.quaternion, now.quaternion) || (target.character && (!same(onKey.pose, now.pose) || !same(onKey.params ?? {}, now.params))) || (target.prop && !same(onKey.scale, now.scale))));
      // between keys, a body's pose or sliders that differ from what the keys blend to are an edit too
      if (!changed && !onKey && target.character && a !== b) {
        const near = (x, y) => Math.abs(x - y) < 1e-3;
        changed = JOINT_NAMES.some((n) => {
          const q = new THREE.Quaternion(...(a.pose?.[n] ?? [0, 0, 0, 1])).slerp(new THREE.Quaternion(...(b.pose?.[n] ?? [0, 0, 0, 1])), u);
          return new THREE.Quaternion(...now.pose[n]).angleTo(q) > 1e-3;
        }) || [...new Set([...Object.keys(a.params ?? {}), ...Object.keys(b.params ?? {}), ...Object.keys(now.params)])].some((k) => !near(now.params[k] ?? 0, lerp(a.params?.[k] ?? 0, b.params?.[k] ?? 0, u)));
      }
      if (changed && !(target.camera && this.handheld)) upsert(keys, now);
    }
  }

  // ------------------------------------------------------------ pictures

  /**
   * A picture of the scene from a camera pose, in any channel: the snap tiles, the channel
   * previews, an agent's look and the references. A second renderer draws it to its own
   * canvas, so it gets the viewport's tone mapping and colour (a render target would stay
   * linear and come out dark).
   */
  thumbnail(pose, { width = 192, height = 108, only, channel = "clay", type = "image/png", quality } = {}) {
    for (const c of this.characters) c.driveRig();
    this.ensureShotRenderer();
    const r = this.shotRenderer;
    r.setSize(width, height, false);
    const cam = this.shotCamera;
    cam.fov = fovOf(pose.focal ?? this.focal);
    cam.aspect = width / height;
    cam.position.copy(pose.position);
    cam.up.set(0, 1, 0);
    cam.lookAt(pose.target);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    const hidden = [];
    const helper = this.gizmo.getHelper();
    helper.visible = false;
    this.handles.visible = false;
    if (only) for (const c of this.characters) if (c !== only && c.root.visible) (c.root.visible = false), hidden.push(c);
    this.scene.environment = this.envShot;
    try {
      if (channel === "pose") {
        const canvas = this.poseCanvas;
        Object.assign(canvas, { width, height });
        this.channels.drawPose(canvas.getContext("2d"), cam, width, height);
        return canvas.toDataURL(type, quality);
      }
      if (channel === "clay") r.render(this.scene, cam);
      else this.channels.render(r, cam, channel, { width, height });
      return r.domElement.toDataURL(type, quality);
    } finally {
      this.scene.environment = this.envMain;
      for (const c of hidden) c.root.visible = true;
      helper.visible = true;
      this.handles.visible = true;
    }
  }

  /** The second renderer, drawing to its own canvas (transparent where nothing is drawn). */
  ensureShotRenderer() {
    if (this.shotRenderer) return;
    const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    for (const k of ["outputColorSpace", "toneMapping", "toneMappingExposure"]) r[k] = this.renderer[k];
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.shotRenderer = r;
    // its own studio room: a texture one renderer made cannot be drawn by another
    this.envShot = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
    this.shotCamera = new THREE.PerspectiveCamera(fovOf(this.focal), 16 / 9, 0.05, 200);
    this.poseCanvas = document.createElement("canvas");
  }

  /** What the frame shows now (the camera at the playhead), in a channel, at an output size. */
  frameStill(channel = "clay", { long = 1024, type = "image/png", quality } = {}) {
    const r = RATIOS[this.ratio];
    const [width, height] = r >= 1 ? [long, Math.round(long / r)] : [Math.round(long * r), long];
    return this.thumbnail({ position: this.camera.position, target: this.orbit.target, focal: this.focal }, { width: width - (width % 2), height: height - (height % 2), channel, type, quality });
  }

  /** RGBA pixels from a render target (bottom-up) as a PNG data URL. */
  readCanvas(pixels, width, height) {
    const canvas = document.createElement("canvas");
    Object.assign(canvas, { width, height });
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(width, height);
    // the target is bottom-up: flip the rows while copying
    for (let y = 0; y < height; y++) image.data.set(pixels.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4);
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png");
  }

  /**
   * The modelled bodies and pieces have loaded: everything on the stage takes them. A body in a
   * library pose solves its contacts again on its new shape.
   */
  refreshModels() {
    for (const c of this.characters) {
      c.build();
      const preset = poseById(c.posed);
      if (preset && !preset.quaternions) c.setPreset(preset);
      if (!c.seatedOn) c.ground();
    }
    for (const p of this.props) refillProp(p);
    this.poseModel?.build();
    this.poseThumbs?.clear();
    this.attachGizmo();
    this.emit("scene");
  }

  /** Puts a hand prop in a character's hand (or empties it), by hand, as the user chose it. */
  setHold(character, hand, type) {
    if (!character) return;
    character.setHold(hand, type);
    character.autoHold[hand] = false;
    // the arm takes the thing the way it is held: an umbrella up over the head, a bag at the side
    const arm = type && holdArm(type, hand);
    if (arm) character.shapePose(arm);
    character.ground();
    this.commit();
    this.emit("pose");
  }

  /** A hand prop alone, on a clear background. Cached per type. */
  handThumbnail(type, { width = 64, height = 64 } = {}) {
    const key = `hand:${type}`;
    this.poseThumbs ??= new Map();
    if (this.poseThumbs.has(key)) return this.poseThumbs.get(key);
    const model = MODELS.hand.get(type) ?? MODELS.props.get(type);
    if (!model) return "";
    this.poseThumbnail(poseById("stand"));
    const object = model.scene.clone(true);
    const clay = new THREE.MeshStandardMaterial({ color: "#c9c5be", roughness: 0.8, side: THREE.DoubleSide });
    object.traverse((o) => o.isMesh && (o.material = clay));
    this.poseModel.root.visible = false;
    this.poseScene.add(object);
    const url = this.stillOf(object, width, height, new THREE.Vector3(0.6, 0.5, 1));
    this.poseScene.remove(object);
    this.poseModel.root.visible = true;
    this.poseThumbs.set(key, url);
    return url;
  }

  /** Frames an object in the thumbnail scene from a direction and renders it. */
  stillOf(object, width, height, from) {
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const cam = this.poseCamera;
    cam.aspect = width / height;
    cam.updateProjectionMatrix();
    const span = Math.max(size.y, size.x * (height / width), size.z * (height / width), 0.05);
    const dist = (span / 2) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.25;
    cam.position.copy(center).add(from.clone().normalize().multiplyScalar(dist + Math.max(size.x, size.z) / 2));
    cam.lookAt(center);
    this.ensureShotRenderer();
    const r = this.shotRenderer;
    r.setSize(width, height, false);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.poseScene, cam);
    return r.domElement.toDataURL("image/png");
  }

  /** One of the user's models has loaded (or gone): the bodies and props made of it take it. */
  refreshUserModel(entry) {
    if (entry.kind === "prop" || USER.props.has(entry.id) || entry.gone && !USER.rigs.has(entry.id)) {
      if (entry.gone) forgetUserProp(entry.id);
      else if (USER.props.has(entry.id)) registerUserProp(USER.props.get(entry.id));
      for (const p of this.props) if (p.userData.type === entry.id) refillProp(p);
    }
    for (const c of this.characters) {
      if (c.rigId !== entry.id) continue;
      if (entry.gone) c.setBody(c.body);
      else c.setRig(entry.id);
      const preset = poseById(c.posed);
      if (preset && !preset.quaternions) c.setPreset(preset);
      if (!c.seatedOn) c.ground();
    }
    this.poseThumbs?.clear();
    this.attachGizmo();
    this.emit("scene");
  }

  /** A piece of the set alone, three-quarter front, on a clear background. Cached per type. */
  propThumbnail(type, { width = 132, height = 104 } = {}) {
    const key = `prop:${type}`;
    this.poseThumbs ??= new Map();
    if (this.poseThumbs.has(key)) return this.poseThumbs.get(key);
    this.poseThumbnail(poseById("stand"));
    const object = makeProp(type, "thumb");
    this.poseModel.root.visible = false;
    this.poseScene.add(object);
    const url = this.stillOf(object, width, height, new THREE.Vector3(0.55, 0.42, 1));
    this.poseScene.remove(object);
    object.traverse((o) => !o.userData.shared && o.geometry?.dispose());
    this.poseModel.root.visible = true;
    this.poseThumbs.set(key, url);
    return url;
  }

  /** A preset on a lone mannequin, three-quarter front, on a clear background. Cached per pose. */
  poseThumbnail(preset, { width = 132, height = 156, body = "man", rig = null } = {}) {
    const key = JSON.stringify([rig ?? body, preset.quaternions ?? [preset.joints, preset.aim, preset.reach]]);
    this.poseThumbs ??= new Map();
    if (this.poseThumbs.has(key)) return this.poseThumbs.get(key);
    if (!this.poseScene) {
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight("#e4e2de", "#2a2a2e", 0.9));
      const light = new THREE.DirectionalLight("#ffffff", 2.2);
      light.position.set(2, 4, 3);
      scene.add(light);
      this.poseScene = scene;
      this.ensureShotRenderer();
      scene.environment = this.envShot;
      scene.environmentIntensity = 0.6;
      this.poseModel = new Mannequin({ name: "thumb", color: "#b9b5ae" });
      scene.add(this.poseModel.root);
      this.poseCamera = new THREE.PerspectiveCamera(30, width / height, 0.05, 50);
    }
    const m = this.poseModel;
    if (rig && m.rigId !== rig) m.setRig(rig);
    else if (!rig && (m.body !== body || m.rigId)) m.setBody(body);
    m.root.position.set(0, 0, 0);
    m.params = {};
    m.setPreset(preset);
    m.ground();
    const box = m.bounds();
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const cam = this.poseCamera;
    cam.aspect = width / height;
    cam.updateProjectionMatrix();
    const span = Math.max(size.y, size.x * (height / width), size.z * (height / width));
    const dist = (span / 2) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.12;
    cam.position.copy(center).add(new THREE.Vector3(0.45, 0.12, 1).normalize().multiplyScalar(dist + size.z / 2));
    cam.lookAt(center);
    this.ensureShotRenderer();
    const r = this.shotRenderer;
    r.setSize(width, height, false);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.poseScene, cam);
    const url = r.domElement.toDataURL("image/png");
    this.poseThumbs.set(key, url);
    return url;
  }

  // ------------------------------------------------------------ the scene as data, and history

  toJSON() {
    return {
      version: 2,
      characters: this.characters.map((c) => c.toJSON()),
      props: this.props.map((p) => p.userData.toJSON()),
      camera: { ...this.cameraState(), ratio: this.ratio },
      timeline: { duration: this.duration, time: this.time, cameraKeys: this.cameraKeys, handheld: this.handheld },
    };
  }

  load(data, { keepHistory = false } = {}) {
    for (const c of this.characters) this.scene.remove(c.root);
    for (const p of this.props) this.scene.remove(p);
    const sel = this.selection;
    this.characters = (data.characters ?? []).map((c) => Mannequin.fromJSON(c));
    this.props = (data.props ?? []).map((p) => propFromJSON(p));
    for (const c of this.characters) this.scene.add(c.root);
    for (const p of this.props) this.scene.add(p);
    if (data.camera) {
      this.camera.position.fromArray(data.camera.position);
      this.orbit.target.fromArray(data.camera.target);
      this.focal = data.camera.focal ?? this.focal;
      this.ratio = data.camera.ratio ?? this.ratio;
      this.orbit.update();
    }
    const tl = data.timeline ?? {};
    this.duration = tl.duration ?? 5;
    this.time = Math.min(tl.time ?? 0, this.duration);
    this.cameraKeys = structuredClone(tl.cameraKeys ?? []);
    this.handheld = tl.handheld ?? 0;
    // keep the selection on the same things when they still exist
    const character = this.characters.find((c) => c.id === sel.character?.id) ?? null;
    const prop = this.props.find((p) => p.userData.id === sel.prop?.userData.id) ?? null;
    this.selection = { character, joint: character ? sel.joint : null, prop };
    if (!keepHistory) (this.history = []), (this.future = []);
    this.resize();
    this.attachGizmo();
    this.emit("scene");
  }

  /** Runs fn as one step of history, however many changes it makes. */
  batch(fn) {
    this.batching = true;
    try {
      return fn();
    } finally {
      this.batching = false;
      this.commit();
    }
  }

  /** Saves the scene as it is now as one step of history (recording edits into keys first). */
  commit() {
    if (this.batching) return;
    this.autoKeyChanges();
    const snap = JSON.stringify(this.toJSON());
    if (this.history.at(-1) === snap) return;
    this.history.push(snap);
    if (this.history.length > 120) this.history.shift();
    this.future = [];
    this.emit("history");
  }

  undo() {
    if (this.history.length < 2) return;
    this.future.push(this.history.pop());
    this.load(JSON.parse(this.history.at(-1)), { keepHistory: true });
    this.emit("history");
  }

  redo() {
    const next = this.future.pop();
    if (!next) return;
    this.history.push(next);
    this.load(JSON.parse(next), { keepHistory: true });
    this.emit("history");
  }
}

const handleGeometry = new THREE.SphereGeometry(0.035, 16, 12);
const handleOff = new THREE.MeshBasicMaterial({ color: "#f2ff59", transparent: true, opacity: 0.55, depthTest: false });
const handleOn = new THREE.MeshBasicMaterial({ color: "#f2ff59", depthTest: false });
