// The stage: one three.js scene with mannequins, props, a ground and a camera
// framed to the output ratio. It owns selection, the gizmo, IK handles, camera
// snaps and the undo history; the page draws its panels from what it reports.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { Mannequin } from "./mannequin.js";
import { CHAINS } from "./skeleton.js";
import { poseById } from "./poses.js";
import { makeProp, propFromJSON } from "./props.js";

/** Vertical field of view (degrees) of a lens on a full-frame (36 × 24 mm) sensor. */
export const fovOf = (mm) => THREE.MathUtils.radToDeg(2 * Math.atan(12 / mm));

export const RATIOS = { "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1, "3:2": 3 / 2, "2:3": 2 / 3, "4:3": 4 / 3, "3:4": 3 / 4, "21:9": 21 / 9 };

export const SNAPS = [
  ["front", "Front"], ["three-quarter-left", "Three-quarter left"], ["three-quarter-right", "Three-quarter right"], ["side", "Side"],
  ["back", "Back"], ["top", "Top"], ["low", "Low angle"], ["high", "High angle"], ["over-shoulder", "Over the shoulder"], ["close-up", "Close-up"],
];

const PALETTE = ["#e8584f", "#3fc6c0", "#f0a63a", "#8d7cf2", "#5fbf6a", "#e86fb3"];
const EFFECTORS = Object.keys(CHAINS);

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

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.append(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#141416");
    scene.fog = new THREE.Fog("#141416", 14, 34);
    this.scene = scene;

    scene.add(new THREE.HemisphereLight("#dcdad6", "#202024", 1.1));
    const key = new THREE.DirectionalLight("#ffffff", 2.2);
    key.position.set(3.5, 6, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 30 });
    key.shadow.bias = -0.0004;
    scene.add(key);
    const rim = new THREE.DirectionalLight("#9fb4ff", 0.5);
    rim.position.set(-4, 3, -5);
    scene.add(rim);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: "#1b1b1e", roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.userData.ground = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(40, 80, "#34343a", "#26262b");
    grid.position.y = 0.001;
    scene.add(grid);
    this.ground = ground;

    const camera = new THREE.PerspectiveCamera(fovOf(this.focal), 16 / 9, 0.05, 200);
    camera.position.set(0.6, 1.35, 4.4);
    this.camera = camera;
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(0, 0.95, 0);
    orbit.enableDamping = false;
    orbit.screenSpacePanning = true;
    orbit.addEventListener("change", () => this.render());
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
    // the lens sets the frame's vertical field of view; the viewport shows a little more around it
    this.camera.aspect = w / h;
    const frameTan = Math.tan(THREE.MathUtils.degToRad(fovOf(this.focal)) / 2);
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(frameTan * (h / fh)));
    this.camera.updateProjectionMatrix();
    this.render();
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

  render() {
    if (this.pending) return;
    this.pending = requestAnimationFrame(() => {
      this.pending = 0;
      this.updateHandles();
      this.renderer.render(this.scene, this.camera);
    });
  }

  // ------------------------------------------------------------ scene contents

  addCharacter({ pose = "stand", at, name, facing = 0, profile } = {}) {
    const n = this.characters.length;
    const c = new Mannequin({ name: name ?? `Character ${n + 1}`, color: PALETTE[n % PALETTE.length], profile });
    c.setEulerPose(poseById(pose)?.joints ?? {});
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

  addProp(type, at) {
    const prop = makeProp(type);
    const n = this.props.length;
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
      g.attach(prop);
      return;
    }
    if (!character) return;
    if (this.tool === "move" && joint && EFFECTORS.includes(joint)) {
      character.joints[joint].getWorldPosition(this.ikTarget.position);
      this.ikTarget.userData = { character, effector: joint };
      g.setMode("translate");
      g.setSpace("world");
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
    const hit = this.raycaster.intersectObjects(targets, true)[0];
    if (!hit) return this.select({});
    let o = hit.object;
    while (o && !o.userData.prop && !o.userData.character) o = o.parent;
    if (o?.userData.prop) return this.select({ prop: o });
    if (o?.userData.character) {
      const c = o.userData.character;
      // the first click on another body selects the body; a click on a selected body picks the joint
      if (this.selection.character !== c) return this.select({ character: c, joint: null });
      return this.select({ character: c, joint: hit.object.userData.joint });
    }
  }

  /** Small spheres on the selected body's hands and feet: drag them to reach (IK). */
  updateHandles() {
    const c = this.selection.character;
    this.handles.clear();
    if (!c || !c.root.visible) return;
    for (const e of EFFECTORS) {
      const handle = new THREE.Mesh(
        handleGeometry,
        this.selection.joint === e && this.tool === "move" ? handleOn : handleOff,
      );
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
    character.setEulerPose(preset.joints);
    character.posed = id;
    character.ground();
    this.attachGizmo();
    this.commit();
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

  /** Frames the selected body (or everything) from a named angle, relative to the way it faces. */
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

  // ------------------------------------------------------------ thumbnails

  /**
   * A picture of the scene from a camera pose, for the snap tiles and an agent's look. A second
   * renderer draws it to its own canvas, so it gets the viewport's tone mapping and colour (a
   * render target would stay linear and come out dark).
   */
  thumbnail(pose, { width = 192, height = 108, only } = {}) {
    if (!this.shotRenderer) {
      const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      for (const k of ["outputColorSpace", "toneMapping", "toneMappingExposure"]) r[k] = this.renderer[k];
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      this.shotRenderer = r;
      this.shotCamera = new THREE.PerspectiveCamera(fovOf(this.focal), width / height, 0.05, 200);
    }
    const r = this.shotRenderer;
    r.setSize(width, height, false);
    const cam = this.shotCamera;
    cam.fov = fovOf(this.focal);
    cam.aspect = width / height;
    cam.position.copy(pose.position);
    cam.lookAt(pose.target);
    cam.updateProjectionMatrix();
    const hidden = [];
    const helper = this.gizmo.getHelper();
    helper.visible = false;
    this.handles.visible = false;
    if (only) for (const c of this.characters) if (c !== only && c.root.visible) (c.root.visible = false), hidden.push(c);
    r.render(this.scene, cam);
    for (const c of hidden) c.root.visible = true;
    helper.visible = true;
    this.handles.visible = true;
    return r.domElement.toDataURL("image/png");
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

  /** A preset on a lone mannequin, three-quarter front, on a clear background. Cached per pose. */
  poseThumbnail(joints, { width = 132, height = 156 } = {}) {
    const key = JSON.stringify(joints);
    this.poseThumbs ??= new Map();
    if (this.poseThumbs.has(key)) return this.poseThumbs.get(key);
    if (!this.poseScene) {
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight("#e4e2de", "#2a2a2e", 1.4));
      const key = new THREE.DirectionalLight("#ffffff", 2.4);
      key.position.set(2, 4, 3);
      scene.add(key);
      this.poseScene = scene;
      this.poseModel = new Mannequin({ name: "thumb" });
      scene.add(this.poseModel.root);
      this.poseTarget = new THREE.WebGLRenderTarget(width, height, { samples: 4 });
      this.poseCamera = new THREE.PerspectiveCamera(30, width / height, 0.05, 50);
    }
    const m = this.poseModel;
    m.root.position.set(0, 0, 0);
    m.setEulerPose(joints);
    m.ground();
    const box = m.bounds();
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const cam = this.poseCamera;
    const span = Math.max(size.y, size.x * (height / width), size.z * (height / width));
    const dist = (span / 2) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.12;
    cam.position.copy(center).add(new THREE.Vector3(0.45, 0.12, 1).normalize().multiplyScalar(dist + size.z / 2));
    cam.lookAt(center);
    const clear = this.renderer.getClearAlpha();
    this.renderer.setClearAlpha(0);
    this.renderer.setRenderTarget(this.poseTarget);
    this.renderer.clear();
    this.renderer.render(this.poseScene, cam);
    const pixels = new Uint8Array(width * height * 4);
    this.renderer.readRenderTargetPixels(this.poseTarget, 0, 0, width, height, pixels);
    this.renderer.setRenderTarget(null);
    this.renderer.setClearAlpha(clear);
    const url = this.readCanvas(pixels, width, height);
    this.poseThumbs.set(key, url);
    return url;
  }

  // ------------------------------------------------------------ the scene as data, and history

  toJSON() {
    return {
      version: 1,
      characters: this.characters.map((c) => c.toJSON()),
      props: this.props.map((p) => p.userData.toJSON()),
      camera: { position: this.camera.position.toArray(), target: this.orbit.target.toArray(), focal: this.focal, ratio: this.ratio },
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

  /** Saves the scene as it is now as one step of history. */
  commit() {
    if (this.batching) return;
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
