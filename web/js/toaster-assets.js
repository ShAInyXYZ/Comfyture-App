// Toaster's library of pieces: the Stage's own (modelled and built furniture, objects, food, creatures, vehicles and the user's own
// props), listed once with their sizes, made as objects on demand, and drawn as small clay pictures for the Add grid. Listing them
// reads the Stage's model manifest only; a piece's model is fetched when it is drawn or put in the view.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { USER, loadUserModels, onUserModels, rigById, made, watching } from "./control/models.js";
import { BODY_TYPES } from "./control/skeleton.js";
import { Mannequin } from "./control/mannequin.js";
import { allPoses, poseById } from "./control/poses.js";
import { ASSETS, assetCategories, isAnimal, loadCatalogue, makeProp, paramsOf, poseAnimal, registerUserProp } from "./control/assets.js";

let library = null;
let loading = null;
// what each piece is, in words (models/descriptions.json: its kind and its form, as the model shows it), keyed by type
let descriptions = {};
const listeners = new Set();
const sizes = new Map();

/** The last list of pieces, or null before the first. */
export const libraryNow = () => library;
/** `fn` is called when the list changes (the models arrived, a user prop came). Returns a function that stops it. */
export const onLibrary = (fn) => (listeners.add(fn), () => listeners.delete(fn));

/** The box of a piece as the Stage makes it: the modelled ones say so in their sliders, the built ones are measured once (their model, when they have one, is scaled to the same box). */
function sizeOf(def) {
  if (sizes.has(def.type)) return sizes.get(def.type);
  const size = def.model && def.params?.length === 3 ? def.params.map((p) => p[5]) : builtBox(def).getSize(new THREE.Vector3()).toArray();
  sizes.set(def.type, size.map((v) => Math.max(0.01, Math.round(v * 1000) / 1000)));
  return sizes.get(def.type);
}

/** The box of a piece built from its shapes, at its default sizes. */
function builtBox(def) {
  const group = new THREE.Group();
  for (const piece of def.build(paramsOf(def.type))) group.add(piece);
  const box = preciseBox(group);
  group.traverse((o) => o.geometry?.dispose());
  return box;
}

/** The world box of an object, vertex by vertex (a skinned animal is measured in its pose). */
export function preciseBox(object) {
  object.updateMatrixWorld(true);
  object.traverse((o) => o.isSkinnedMesh && o.skeleton.update());
  return new THREE.Box3().setFromObject(object, true);
}

function list() {
  const order = [...assetCategories(), "Animals"];
  const rank = (c) => (order.includes(c) ? order.indexOf(c) : order.length);
  return {
    pieces: ASSETS.map((def, i) => ({ def, i }))
      .sort((a, b) => rank(a.def.category) - rank(b.def.category) || a.i - b.i)
      .map(({ def }) => ({
        type: def.type, name: def.name, category: def.category, icon: def.icon, themes: def.themes ?? [], tags: def.tags ?? [], size: sizeOf(def), description: descriptions[def.type] ?? "",
        ...(def.animal ? { animal: true } : {}), ...(def.user ? { user: true } : {}),
      })),
  };
}

function refresh() {
  library = list();
  listeners.forEach((fn) => fn(library));
}

/** Reads what the Stage holds and lists every piece (once). No model is fetched: each comes when its piece is drawn. */
export function loadLibrary() {
  loading ??= (async () => {
    // (a library without its descriptions still lists every piece, each then called by its name)
    [descriptions] = await Promise.all([fetch("models/descriptions.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})), loadCatalogue()]);
    refresh();
    // the user's own props join Mine as they load
    onUserModels((entry) => {
      if (USER.rigs.has(entry.id) || entry.gone) {
        for (const k of [...sizes.keys()]) if (k.startsWith(`figure:${entry.id}|`)) sizes.delete(k);
        return refresh();
      }
      if (!USER.props.has(entry.id)) return;
      registerUserProp(USER.props.get(entry.id));
      sizes.delete(entry.id);
      refresh();
    });
    loadUserModels();
    return library;
  })();
  return loading;
}

/** A fresh object of a piece at its own size, standing on y = 0, front toward +Z (an animal stands). Its geometries may be shared. */
export function assetPiece(type) {
  const object = makeProp(type, "toaster");
  if (isAnimal(object)) poseAnimal(object, { time: 0 });
  return object;
}

// ------------------------------------------------------------ pictures

const thumbs = new Map();
let shot = null;

function ensureShot() {
  if (shot) return shot;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  scene.add(new THREE.HemisphereLight("#e4e2de", "#2a2a2e", 0.9));
  const key = new THREE.DirectionalLight("#ffffff", 2.2);
  key.position.set(2, 4, 3);
  scene.add(key);
  const clay = new THREE.MeshStandardMaterial({ color: "#c9c4bb", roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
  return (shot = { renderer, scene, clay, camera: new THREE.PerspectiveCamera(30, 1, 0.01, 200) });
}

/** An object alone in clay grey, from a direction, on a clear background, as a data URL. */
function still(object, width, height, from, margin) {
  const { renderer, scene, clay, camera } = ensureShot();
  object.traverse((o) => o.isMesh && ((o.material = clay), (o.frustumCulled = false)));
  scene.add(object);
  const box = preciseBox(object);
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  const span = Math.max(size.y, size.x * (height / width), size.z * (height / width), 0.05);
  const dist = (span / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * margin + Math.max(size.x, size.z) / 2;
  camera.position.copy(centre).addScaledVector(from.normalize(), dist);
  camera.lookAt(centre);
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  scene.remove(object);
  object.traverse((o) => !o.userData.shared && o.geometry?.dispose());
  return url;
}

/** A thumbnail, cached by key: a promise, for the models it shows are fetched first (one that fails is tried again). */
function thumbOf(key, draw) {
  if (!thumbs.has(key)) {
    const job = draw();
    thumbs.set(key, job);
    job.catch(() => thumbs.delete(key));
  }
  return thumbs.get(key);
}

/** A piece alone in clay grey, three-quarter front, on a clear background, as a data URL. Cached per type; drawn once its model is in. */
export function assetThumb(type, { width = 112, height = 96 } = {}) {
  return thumbOf(`${type}:${width}x${height}`, () => made(() => assetPiece(type), (piece) => still(piece, width, height, new THREE.Vector3(0.55, 0.42, 1), 1.25)));
}

/** Once the model of a piece is in (a piece without one is ready as it is). */
export const pieceReady = (type) => made(() => assetPiece(type), () => {});

// ------------------------------------------------------------ people

/** A figure of the Stage: a body type (or one of the user's rigged characters) in a pose, on the ground, front toward +Z. Call after loadLibrary. */
export function characterPiece({ body = "man", rig, pose = "stand", params, joints } = {}) {
  const c = new Mannequin({ name: "toaster", color: "#b9b5ae", body, rig: rig && rigById(rig) ? rig : undefined });
  // the preset first (its holds and aims), then the joints edited by hand in place of its base, then the sliders over both
  c.setPreset(poseById(pose) ?? poseById("stand"));
  if (joints) c.setPose(joints);
  c.setParams(params ?? {});
  c.ground();
  c.driveRig();
  return c.root;
}

/**
 * The precise box of a figure in a pose (with its sliders and edited joints), [w, h, d]. Cached once it is measured on the
 * real body and what the pose puts in its hands (see figureReady): measured before they are in, it is only a stand-in's.
 */
export function characterSize({ body = "man", rig, pose = "stand", params, joints } = {}) {
  const key = `figure:${rig ?? body}|${pose}${params || joints ? `|${JSON.stringify([params ?? {}, joints ?? null])}` : ""}`;
  if (sizes.has(key)) return sizes.get(key);
  const { result: root, asked } = watching(() => characterPiece({ body, rig, pose, params, joints }));
  const size = preciseBox(root).getSize(new THREE.Vector3()).toArray().map((v) => Math.max(0.01, Math.round(v * 1000) / 1000));
  root.traverse((o) => o.geometry?.dispose());
  if (!asked.length) sizes.set(key, size);
  return size;
}

/** Once every model a figure in this pose is made of is in: its body, and what the pose puts in its hands. */
export const figureReady = (spec = {}) => made(() => characterPiece(spec), () => {});

/** The people to add, once the eight bodies are in (a size is the figure standing). */
export async function loadPeople() {
  await Promise.all(BODY_TYPES.map((b) => figureReady({ body: b.id })));
  return characterList();
}

/** The poses a figure can take, by kind (no model is needed to list them). */
export const poseList = () => allPoses().map((p) => ({ id: p.id, name: p.name, category: p.category }));

/** The people to add: the body types, the user's rigged characters, and the poses (a size is the figure standing). Call after loadPeople. */
export function characterList() {
  return {
    people: BODY_TYPES.map((b) => ({ body: b.id, name: b.name, size: characterSize({ body: b.id }) })),
    rigs: [...USER.rigs.values()].map((r) => ({ rig: r.id, name: r.name, size: characterSize({ rig: r.id }) })),
    poses: poseList(),
  };
}

/** A figure alone in clay grey, three-quarter front, on a clear background, as a data URL. Cached; drawn once its body is in. */
export function characterThumb({ body = "man", rig, pose = "stand" } = {}, { width = 112, height = 132 } = {}) {
  return thumbOf(`figure:${rig ?? body}|${pose}:${width}x${height}`, () => made(() => characterPiece({ body, rig, pose }), (root) => still(root, width, height, new THREE.Vector3(0.45, 0.12, 1), 1.12)));
}
