// Toaster's viewport: the clay parts in a small studio, a gizmo to move, turn and scale them, a camera that frames the object, and the
// two pictures sent to the image models (the frame as the camera sees it, and the four-view turnaround sheet).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { geometryOf } from "./toaster-shapes.js";
import { assetByType } from "./control/assets.js";
import { openSurface, rigById } from "./control/models.js";
import { assetPiece, characterPiece, libraryNow, loadLibrary, onLibrary, preciseBox } from "./toaster-assets.js";
import { RATIOS, SHEET, VIEWS, sheetScale } from "./toaster-model.js";

// the lens: its focal length on a 24 mm high film gives the frame's vertical field of view (50 mm unless the camera says otherwise)
const fovOf = (mm) => THREE.MathUtils.radToDeg(2 * Math.atan(12 / mm));
const BASE_FOV = fovOf(50);
const DEG = Math.PI / 180;
const DIRS = { front: [0, 0, 1], right: [1, 0, 0], back: [0, 0, -1], left: [-1, 0, 0], top: [0, 1, 0.001], persp: [0.62, 0.45, 0.85] };
const MODES = { move: "translate", rotate: "rotate", scale: "scale" };
const rnd = (v, step) => Math.round(v / step) * step;
const fix = (v, d) => Number(v.toFixed(d));
// what the geometry depends on: when it changes, the mesh is rebuilt
// (a piece also depends on whether the library has it yet: until then it is a box)
const grouped = (p) => p.shape === "asset" || p.shape === "character";
const hasPiece = (p) => Boolean(libraryNow() && (p.shape === "character" ? !p.rig || rigById(p.rig) : assetByType(p.asset)));
const keyOf = (p) => (p.shape === "asset" ? ["asset", p.asset, hasPiece(p) ? 1 : 0, ...p.size] : p.shape === "character" ? ["character", p.body, p.rig ?? "", p.pose, hasPiece(p) ? 1 : 0, ...p.size] : [p.shape, ...p.size, p.round ?? "", p.sides ?? ""]).join("|");

// the control maps' own shader: a flat colour, or the disparity (1/z) between the nearest and the farthest point; skinned meshes too
const PASS_VERTEX = /* glsl */ `
  #include <common>
  #include <skinning_pars_vertex>
  varying float vDepth;
  void main() {
    #include <skinbase_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const PASS_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uDepth;
  uniform float uNear;
  uniform float uFar;
  varying float vDepth;
  void main() {
    float d = clamp((1.0 / max(vDepth, 1e-4) - 1.0 / uFar) / (1.0 / uNear - 1.0 / uFar), 0.0, 1.0);
    gl_FragColor = vec4(uDepth > 0.5 ? vec3(d) : uColor, 1.0);
  }`;

export class ToasterView {
  constructor(container, frameEl, { onPick = () => {}, onChange = () => {}, onDrag = () => {}, onCamera = () => {} } = {}) {
    Object.assign(this, { container, frameEl, onPick, onChange, onDrag, onCamera });
    this.ratio = "1:1";
    this.meshes = new Map();
    this.selected = [];
    this.tool = "select";
    this.snap = true;
    this.rect = { x: 0, y: 0, w: 1, h: 1 };
    this.drag = null;

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
    this.envMain = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = this.envMain;
    scene.environmentIntensity = 0.6;

    // the lights sit in a group, so a capture can turn them with the view
    this.rig = new THREE.Group();
    scene.add(this.rig);
    this.rig.add(new THREE.HemisphereLight("#dcdad6", "#202024", 0.5));
    const key = new THREE.DirectionalLight("#ffffff", 1.9);
    key.position.set(3.5, 6, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 34 });
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.02;
    this.key = key;
    const fill = new THREE.DirectionalLight("#ffe9d8", 0.6);
    fill.position.set(-5, 3, 4.5);
    const rim = new THREE.DirectionalLight("#a9bcff", 0.9);
    rim.position.set(-4, 3.5, -5);
    this.rig.add(key, fill, rim);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: "#202024", roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    const grid = new THREE.GridHelper(20, 40, "#34343a", "#26262b");
    grid.position.y = 0.001;
    scene.add(ground, grid);
    this.ground = ground;
    this.grid = grid;

    this.focal = 50;
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 200);
    this.camera.position.set(4.6, 3.4, 6.2);
    const orbit = new OrbitControls(this.camera, renderer.domElement);
    orbit.target.set(0, 0.8, 0);
    orbit.enableDamping = false;
    orbit.screenSpacePanning = true;
    orbit.addEventListener("change", () => this.render());
    orbit.addEventListener("end", () => this.onCamera());
    this.orbit = orbit;

    const gizmo = new TransformControls(this.camera, renderer.domElement);
    gizmo.setSize(0.8);
    gizmo.addEventListener("dragging-changed", (e) => this.dragging(e.value));
    gizmo.addEventListener("objectChange", () => this.moved());
    gizmo.addEventListener("change", () => this.render());
    scene.add(gizmo.getHelper());
    this.gizmo = gizmo;
    this.pivot = new THREE.Object3D();
    scene.add(this.pivot);
    this.setSnap(true);

    // a click picks; a press that moved, or that began on the gizmo, does not
    this.raycaster = new THREE.Raycaster();
    const el = renderer.domElement;
    let down = null;
    this.onDown = (e) => (down = { x: e.clientX, y: e.clientY, gizmo: gizmo.dragging });
    this.onUp = (e) => {
      if (!down || down.gizmo || this.moving) return (down = null);
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved < 5) this.pick(e);
    };
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointerup", this.onUp);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
  }

  // ------------------------------------------------------------ frame and render

  /** Sizes the canvas to the panel and the frame (the output ratio) inside it. */
  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    Object.assign(this.renderer.domElement.style, { width: `${w}px`, height: `${h}px` });
    const r = RATIOS[this.ratio] ?? 1;
    const pad = 28;
    let fw = w - pad * 2;
    let fh = fw / r;
    if (fh > h - pad * 2) (fh = h - pad * 2), (fw = fh * r);
    fw = Math.max(1, fw);
    fh = Math.max(1, fh);
    this.rect = { x: (w - fw) / 2, y: (h - fh) / 2, w: fw, h: fh };
    Object.assign(this.frameEl.style, { left: `${this.rect.x}px`, top: `${this.rect.y}px`, width: `${fw}px`, height: `${fh}px` });
    // the frame has the base field of view; the viewport shows a little more around it
    this.camera.aspect = w / h;
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan((fovOf(this.focal) * DEG) / 2) * (h / fh)));
    this.camera.updateProjectionMatrix();
    this.render();
  }

  setRatio(ratio) {
    this.ratio = ratio;
    this.resize();
  }

  /** One redraw per animation frame, however often it is asked. */
  render() {
    if (this.pending || this.disposed) return;
    this.pending = requestAnimationFrame(() => {
      this.pending = 0;
      this.renderer.render(this.scene, this.camera);
    });
  }

  // ------------------------------------------------------------ parts

  /** Makes the scene match the parts: one object each (a mesh, or a group for a piece of the library), rebuilt only when its shape changes. */
  setParts(parts) {
    this.parts = parts;
    const seen = new Set();
    for (const p of parts) {
      seen.add(p.id);
      const asset = grouped(p);
      let m = this.meshes.get(p.id);
      if (m && m.userData.asset !== asset) (this.drop(p.id), (m = null));
      if (!m) {
        m = asset ? new THREE.Group() : new THREE.Mesh(undefined, new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0 }));
        if (!asset) m.castShadow = m.receiveShadow = true;
        m.userData.id = p.id;
        m.userData.asset = asset;
        this.meshes.set(p.id, m);
        this.scene.add(m);
      }
      if (m.userData.key !== keyOf(p)) this.rebuild(m, p);
      for (const mat of asset ? m.userData.mats : [m.material]) mat.color.set(p.color);
      m.position.fromArray(p.pos);
      m.rotation.set(p.rot[0] * DEG, p.rot[1] * DEG, p.rot[2] * DEG, "XYZ");
      m.scale.set(1, 1, 1);
      m.visible = !p.hidden;
      m.userData.color = p.color;
      if (asset && !hasPiece(p)) this.waitForLibrary();
    }
    for (const id of [...this.meshes.keys()]) if (!seen.has(id)) this.drop(id);
    this.setSelection(this.selected);
  }

  /** Takes a part's object out of the scene and frees what it made (never a piece's shared geometry). */
  drop(id) {
    const m = this.meshes.get(id);
    this.scene.remove(m);
    this.clear(m);
    m.userData.wire.geometry.dispose();
    m.userData.wire.material.dispose();
    (m.userData.mats ?? [m.material]).forEach((mat) => mat.dispose());
    this.meshes.delete(id);
  }

  /** Empties what a part's object holds, keeping its wire and materials. */
  clear(m) {
    if (m.userData.asset) {
      m.userData.fit?.traverse((o) => !o.userData.shared && o.geometry?.dispose());
      m.userData.fit?.removeFromParent();
      m.userData.fit = null;
    } else m.geometry?.dispose();
  }

  rebuild(m, p) {
    this.clear(m);
    m.userData.key = keyOf(p);
    m.userData.size = [...p.size];
    if (m.userData.asset) {
      m.userData.part = { shape: p.shape, asset: p.asset, body: p.body, rig: p.rig, pose: p.pose };
      this.fillAsset(m, p);
    } else {
      m.geometry = geometryOf(p);
      m.userData.part = { shape: p.shape, round: p.round, sides: p.sides };
    }
    // the selection wire: the part's own box, a hair larger so it clears the surface
    const old = m.userData.wire;
    if (old) (m.remove(old), old.geometry.dispose());
    const box = new THREE.BoxGeometry(...p.size);
    const wire = new THREE.LineSegments(new THREE.EdgesGeometry(box), old?.material ?? new THREE.LineBasicMaterial({ color: "#f2ff59", depthTest: false, transparent: true, toneMapped: false }));
    box.dispose();
    wire.scale.setScalar(1.01);
    wire.renderOrder = 999;
    wire.raycast = () => {};
    wire.visible = this.selected.includes(m.userData.id);
    m.add(wire);
    m.userData.wire = wire;
  }

  /** A piece of the library, scaled and moved so its box is exactly the part's size around the part's origin; a faint box until it is known. */
  fillAsset(m, p) {
    const fit = new THREE.Group();
    // the part's own materials: solid, two-sided for open sheets, and the faint one of the box before the piece is known
    m.userData.mats ??= [0, 1, 2].map((i) => new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.62, metalness: 0, side: i === 1 ? THREE.DoubleSide : THREE.FrontSide, transparent: i === 2, opacity: i === 2 ? 0.35 : 1 }));
    const [solid, sheet, ghost] = m.userData.mats;
    m.userData.fit = fit;
    // (measured before it joins the part, so the part's own place does not count)
    if (!hasPiece(p)) return void (fit.add(new THREE.Mesh(new THREE.BoxGeometry(...p.size), ghost)), m.add(fit));
    const figure = p.shape === "character";
    const piece = figure ? characterPiece(p) : assetPiece(p.asset);
    fit.add(piece);
    piece.traverse((o) => {
      if (!o.isMesh) return;
      o.material = !figure && openSurface(o.geometry) ? sheet : solid;
      o.castShadow = o.receiveShadow = true;
      if (o.isSkinnedMesh || figure) o.frustumCulled = false;
    });
    const box = preciseBox(fit);
    const ext = box.getSize(new THREE.Vector3());
    const k = p.size.map((v, i) => (ext.getComponent(i) > 1e-6 ? v / ext.getComponent(i) : 1));
    fit.scale.set(...k);
    fit.position.copy(box.getCenter(new THREE.Vector3())).multiply(fit.scale).negate();
    m.add(fit);
  }

  /** The library has arrived (or grown): pieces that were boxes become themselves. */
  refreshAssets() {
    if (this.parts && !this.disposed) this.setParts(this.parts);
  }

  waitForLibrary() {
    if (this.waiting) return;
    this.waiting = true;
    loadLibrary().then(() => this.refreshAssets(), () => {});
    this.offLibrary = onLibrary(() => this.refreshAssets());
  }

  // ------------------------------------------------------------ selection and tools

  setSelection(ids) {
    this.selected = ids.filter((id) => this.meshes.has(id));
    for (const [id, m] of this.meshes) m.userData.wire.visible = this.selected.includes(id);
    this.attach();
    this.render();
  }

  setTool(tool) {
    this.tool = tool;
    this.attach();
    this.render();
  }

  setSnap(on) {
    this.snap = !!on;
    this.gizmo.setTranslationSnap(on ? 0.05 : null);
    this.gizmo.setRotationSnap(on ? 15 * DEG : null);
    this.gizmo.setScaleSnap(on ? 0.05 : null);
  }

  /** The gizmo goes on the one selected part, or on a pivot at the middle of several. */
  attach() {
    const g = this.gizmo;
    const ms = this.selected.map((id) => this.meshes.get(id)).filter((m) => m.visible);
    if (this.tool === "select" || !ms.length || !(this.tool in MODES)) return void g.detach();
    g.setMode(MODES[this.tool]);
    g.setSpace(this.tool === "scale" && ms.length === 1 ? "local" : "world");
    if (ms.length === 1) return void g.attach(ms[0]);
    const b = this.bounds(ms.map((m) => m.userData.id));
    this.pivot.position.set(...b.min.map((v, i) => (v + b.max[i]) / 2));
    this.pivot.quaternion.identity();
    this.pivot.scale.set(1, 1, 1);
    this.pivot.updateMatrix();
    g.attach(this.pivot);
  }

  dragging(on) {
    this.orbit.enabled = !on;
    if (on) {
      this.moving = true;
      const ms = this.selected.map((id) => this.meshes.get(id)).filter((m) => m.visible);
      this.drag = { ms, start: ms.map((m) => (m.updateMatrix(), m.matrix.clone())), pivot: this.pivot.matrix.clone().invert() };
    } else if (this.drag) {
      this.finish();
      // the click that ends a drag is not a pick
      setTimeout(() => (this.moving = false));
    }
  }

  /** The gizmo moved: with a pivot, its change is passed on to every selected part. */
  moved() {
    const d = this.drag;
    if (!d) return;
    if (d.ms.length > 1) {
      this.pivot.updateMatrix();
      const delta = this.pivot.matrix.clone().multiply(d.pivot);
      d.ms.forEach((m, i) => {
        new THREE.Matrix4().multiplyMatrices(delta, d.start[i]).decompose(m.position, m.quaternion, m.scale);
      });
    }
    if (this.dragFrame) return;
    this.dragFrame = requestAnimationFrame(() => {
      this.dragFrame = 0;
      if (this.drag) this.onDrag(this.drag.ms.map((m) => this.read(m)));
    });
  }

  /** A mesh's values as the page keeps them, with any scale counted into the size. */
  read(m, snap = false) {
    const size = m.userData.size.map((v, i) => {
      const k = Math.abs(m.scale.getComponent(i));
      // a size the drag did not touch stays as it was
      const s = Math.abs(k - 1) < 1e-6 ? v : Math.max(0.01, fix(rnd(v * k, 0.01), 2));
      // snapping rounds only the sizes the drag changed
      return snap && this.snap && Math.abs(k - 1) > 1e-6 ? Math.max(0.01, fix(rnd(s, 0.05), 2)) : s;
    });
    const rot = ["x", "y", "z"].map((a) => fix(rnd(m.rotation[a] / DEG, 0.1), 1));
    return { id: m.userData.id, pos: m.position.toArray().map((v) => fix(rnd(v, 0.001), 3)), rot, size };
  }

  /** The drag ended: scale becomes size, values are rounded, and the page is told once. */
  finish() {
    const ms = this.drag.ms;
    this.drag = null;
    const changes = ms.map((m) => {
      const c = this.read(m, true);
      m.scale.set(1, 1, 1);
      m.position.fromArray(c.pos);
      m.rotation.set(c.rot[0] * DEG, c.rot[1] * DEG, c.rot[2] * DEG, "XYZ");
      const was = m.userData.size;
      if (c.size.some((v, i) => v !== was[i])) this.rebuild(m, { ...m.userData.part, size: c.size });
      return c;
    });
    this.attach();
    this.render();
    if (this.dragFrame) (cancelAnimationFrame(this.dragFrame), (this.dragFrame = 0));
    this.onChange(changes);
  }

  pick(e) {
    const box = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((e.clientX - box.left) / box.width) * 2 - 1, -((e.clientY - box.top) / box.height) * 2 + 1), this.camera);
    const hit = this.raycaster.intersectObjects([...this.meshes.values()].filter((m) => m.visible), true)[0];
    // a leg of a chair is a part of the chair: walk up to the part's own object
    let o = hit?.object;
    while (o?.parent && o.parent !== this.scene) o = o.parent;
    this.onPick(o?.userData.id ?? null, { shift: e.shiftKey || e.ctrlKey || e.metaKey });
  }

  // ------------------------------------------------------------ camera and bounds

  /** The world box of the given parts (all when none are given), as { min, max }, or null. */
  bounds(ids) {
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (const id of ids ?? this.meshes.keys()) {
      const m = this.meshes.get(id);
      if (!m?.visible) continue;
      if (m.userData.asset) {
        m.updateWorldMatrix(true, true);
        box.union(preciseBox(m.userData.fit));
        continue;
      }
      m.updateWorldMatrix(true, false);
      const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld));
    }
    return box.isEmpty() ? null : { min: box.min.toArray(), max: box.max.toArray() };
  }

  minY(ids) {
    return this.bounds(ids)?.min[1] ?? null;
  }

  /** Where the camera is, what it looks at and its lens (mm): all it takes to come back to this very picture. */
  cameraState() {
    const r = (v) => v.toArray().map((x) => fix(x, 3));
    return { position: r(this.camera.position), target: r(this.orbit.target), focal: this.focal };
  }

  setCameraState(s) {
    if (Number.isFinite(s.focal)) this.setFocal(s.focal, { quiet: true });
    this.camera.position.fromArray(s.position);
    this.orbit.target.fromArray(s.target);
    this.orbit.update();
    this.render();
    this.onCamera();
  }

  /** The lens, in mm (14 wide to 200 long): the frame keeps its place, the field of view changes. */
  setFocal(mm, { quiet = false } = {}) {
    const f = Math.round(THREE.MathUtils.clamp(Number(mm) || 50, 14, 200));
    if (f === this.focal) return;
    this.focal = f;
    this.resize();
    if (!quiet) this.onCamera();
  }

  /** Puts the camera on a side of the object, far enough for it to fit the frame with a margin. */
  view(name) {
    this.fit(new THREE.Vector3(...(DIRS[name] ?? DIRS.persp)).normalize());
  }

  /** Fits the given parts (or all) in the frame, from where the camera stands. */
  frame(ids) {
    this.fit(this.camera.position.clone().sub(this.orbit.target).normalize(), ids);
  }

  fit(dir, ids) {
    const b = this.bounds(ids) ?? { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] };
    const min = new THREE.Vector3(...b.min), max = new THREE.Vector3(...b.max);
    const centre = min.clone().add(max).multiplyScalar(0.5);
    // the camera's own axes, then how far back each corner of the box needs it to fit the frame, with 15% to spare
    const right = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
    const up = dir.clone().cross(right);
    const tanY = Math.tan((fovOf(this.focal) * DEG) / 2), tanX = tanY * (RATIOS[this.ratio] ?? 1);
    let dist = 0.1;
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Vector3(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).sub(centre);
      dist = Math.max(dist, c.dot(dir) + (Math.abs(c.dot(right)) * 1.15) / tanX, c.dot(dir) + (Math.abs(c.dot(up)) * 1.15) / tanY);
    }
    this.camera.position.copy(centre).addScaledVector(dir, dist);
    this.orbit.target.copy(centre);
    this.orbit.update();
    this.render();
    this.onCamera();
  }

  // ------------------------------------------------------------ pictures

  /** A second renderer, so a capture never disturbs the viewport, with its own studio room. */
  ensureShot() {
    if (this.shot) return this.shot;
    const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    r.setPixelRatio(1);
    for (const k of ["outputColorSpace", "toneMapping", "toneMappingExposure"]) r[k] = this.renderer[k];
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.envShot = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
    return (this.shot = r);
  }

  /** Runs a capture with the gizmo, the selection and (optionally) the studio hidden, then puts everything back. */
  capture(plain, fn) {
    const r = this.ensureShot();
    const s = this.scene;
    const helper = this.gizmo.getHelper();
    const keep = { env: s.environment, bg: s.background, fog: s.fog, cast: this.key.castShadow, turn: this.rig.rotation.y, helper: helper.visible };
    const wires = [...this.meshes.values()].map((m) => m.userData.wire);
    const was = wires.map((w) => w.visible);
    helper.visible = this.grid.visible = false;
    wires.forEach((w) => (w.visible = false));
    s.environment = this.envShot;
    if (plain) Object.assign(s, { background: null, fog: null });
    if (plain) (this.ground.visible = false), (this.key.castShadow = false);
    try {
      return fn(r);
    } finally {
      Object.assign(s, { environment: keep.env, background: keep.bg, fog: keep.fog });
      this.ground.visible = true;
      this.key.castShadow = keep.cast;
      this.rig.rotation.y = keep.turn;
      // (the gizmo comes back only if it was there: a capture with nothing selected leaves it away)
      helper.visible = keep.helper;
      this.grid.visible = true;
      wires.forEach((w, i) => (w.visible = was[i]));
      this.render();
    }
  }

  /**
   * What the frame shows, as a data URL of the frame's ratio: no grid, no gizmo, no wires. The "clay" channel keeps the ground and
   * shadows; the others are control maps of the same frame (pixel for pixel): "id" (each part flat in its own colour), "depth" (near is
   * white) and "silhouette" (white on black), on black, with no ground.
   */
  frameStill({ long = 1024, type = "image/png", quality, channel = "clay" } = {}) {
    const ratio = RATIOS[this.ratio] ?? 1;
    const [w, h] = ratio >= 1 ? [long, Math.round(long / ratio)] : [Math.round(long * ratio), long];
    const width = w - (w % 2), height = h - (h % 2);
    const lens = () => {
      const cam = new THREE.PerspectiveCamera(fovOf(this.focal), width / height, 0.05, 200);
      cam.position.copy(this.camera.position);
      cam.lookAt(this.orbit.target);
      cam.updateMatrixWorld();
      return cam;
    };
    if (channel !== "clay") return this.capture(true, (r) => this.passStill(r, lens(), width, height, channel, type, quality));
    return this.capture(false, (r) => {
      r.setSize(width, height, false);
      r.render(this.scene, lens());
      return r.domElement.toDataURL(type, quality);
    });
  }

  /** A control map: every visible part drawn with a flat material of its own, into a target without smoothing, so each colour is exact. */
  passStill(r, cam, width, height, channel, type, quality) {
    const parts = [...this.meshes.values()].filter((m) => m.visible);
    // the depth runs from the nearest to the farthest point of the parts, seen from the camera
    let near = 1e9, far = 0;
    if (channel === "depth") {
      const fwd = cam.getWorldDirection(new THREE.Vector3());
      const v = new THREE.Vector3();
      for (const m of parts) {
        m.updateWorldMatrix(true, true);
        m.traverse((o) => {
          if (!o.isMesh) return;
          o.isSkinnedMesh && o.skeleton.update();
          for (let i = 0; i < o.geometry.attributes.position.count; i++) {
            const d = o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld).sub(cam.position).dot(fwd);
            near = Math.min(near, d);
            far = Math.max(far, d);
          }
        });
      }
      near = Math.max(0.05, near - 0.01);
      far = Math.max(near + 0.01, far + 0.01);
    }
    const make = (color, depth) => new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Vector3(...color) }, uDepth: { value: depth ? 1 : 0 }, uNear: { value: near }, uFar: { value: far } },
      vertexShader: PASS_VERTEX,
      fragmentShader: PASS_FRAGMENT,
    });
    const shared = channel === "id" ? null : make(channel === "silhouette" ? [1, 1, 1] : [0, 0, 0], channel === "depth");
    const mats = [];
    const swapped = [];
    for (const m of parts) {
      const mat = shared ?? make([1, 3, 5].map((i) => parseInt(String(m.userData.color).slice(i, i + 2), 16) / 255), false);
      mats.push(mat);
      m.traverse((o) => o.isMesh && (swapped.push([o, o.material]), (o.material = mat)));
    }
    const target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: true, samples: 0 });
    const clear = { color: r.getClearColor(new THREE.Color()).getHex(), alpha: r.getClearAlpha() };
    try {
      r.setRenderTarget(target);
      r.setClearColor(0x000000, 1);
      r.clear();
      r.render(this.scene, cam);
      const px = new Uint8Array(width * height * 4);
      r.readRenderTargetPixels(target, 0, 0, width, height, px);
      const canvas = document.createElement("canvas");
      Object.assign(canvas, { width, height });
      const ctx = canvas.getContext("2d");
      const img = ctx.createImageData(width, height);
      // the target is bottom-up
      for (let y = 0; y < height; y++) img.data.set(px.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4);
      ctx.putImageData(img, 0, 0);
      return canvas.toDataURL(type, quality);
    } finally {
      r.setRenderTarget(null);
      r.setClearColor(clear.color, clear.alpha);
      target.dispose();
      for (const [o, mat] of swapped) o.material = mat;
      for (const mat of new Set(mats)) mat.dispose();
    }
  }

  /** The turnaround: four orthographic views at one scale, each in its window of the sheet, lit alike, on a plain background. */
  sheetStill({ scale = 1 / 3, type = "image/png", quality, background = "#d6d6d2" } = {}) {
    const b = this.bounds() ?? { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] };
    const centre = new THREE.Vector3(...b.min.map((v, i) => (v + b.max[i]) / 2));
    const s = sheetScale(b.max.map((v, i) => v - b.min[i])) * scale;
    const width = Math.round(SHEET.width * scale), height = Math.round(SHEET.height * scale);
    const canvas = document.createElement("canvas");
    Object.assign(canvas, { width, height });
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    const url = this.capture(true, (r) => {
      for (const win of SHEET.windows) {
        const v = VIEWS[win.view];
        const pw = Math.round(win.w * scale);
        const hw = (pw / s) / 2, hh = (height / s) / 2;
        const cam = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.05, 200);
        cam.position.copy(centre).addScaledVector(new THREE.Vector3(...v.dir), 60);
        cam.lookAt(centre);
        this.rig.rotation.y = v.turn;
        r.setSize(pw, height, false);
        r.render(this.scene, cam);
        const x = Math.round(win.x * scale);
        ctx.fillStyle = background;
        ctx.fillRect(x, 0, pw, height);
        ctx.drawImage(r.domElement, x, 0);
      }
      return canvas.toDataURL(type, quality);
    });
    return { url, width, height };
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.pending);
    cancelAnimationFrame(this.dragFrame);
    this.observer.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointerup", this.onUp);
    this.gizmo.dispose();
    this.orbit.dispose();
    this.offLibrary?.();
    for (const id of [...this.meshes.keys()]) this.drop(id);
    this.ground.geometry.dispose();
    this.ground.material.dispose();
    this.grid.geometry.dispose();
    this.envMain.dispose();
    this.envShot?.dispose();
    for (const r of [this.renderer, this.shot]) r && (r.dispose(), r.forceContextLoss(), r.domElement.remove());
  }
}
