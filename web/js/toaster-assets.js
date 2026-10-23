// Toaster's library of pieces: the Stage's own (modelled and built furniture, objects, food, creatures, vehicles and the user's own
// props), listed once with their sizes, made as objects on demand, and drawn as small clay pictures for the Add grid.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { MODELS, USER, loadModels, loadUserModels, onUserModels } from "./control/models.js";
import { ASSETS, assetCategories, isAnimal, makeProp, poseAnimal, registerAnimals, registerModelAssets, registerUserProp } from "./control/assets.js";

let library = null;
let loading = null;
const listeners = new Set();
const sizes = new Map();

/** The last list of pieces, or null before the first. */
export const libraryNow = () => library;
/** `fn` is called when the list changes (the models arrived, a user prop came). Returns a function that stops it. */
export const onLibrary = (fn) => (listeners.add(fn), () => listeners.delete(fn));

/** The box of a piece as the Stage makes it: the modelled ones say so in their sliders, the built ones are measured once. */
function sizeOf(def) {
  if (sizes.has(def.type)) return sizes.get(def.type);
  const size = def.model && def.params?.length === 3 ? def.params.map((p) => p[5]) : preciseBox(assetPiece(def.type)).getSize(new THREE.Vector3()).toArray();
  sizes.set(def.type, size.map((v) => Math.max(0.01, Math.round(v * 1000) / 1000)));
  return sizes.get(def.type);
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
        type: def.type, name: def.name, category: def.category, icon: def.icon, themes: def.themes ?? [], tags: def.tags ?? [], size: sizeOf(def),
        ...(def.animal ? { animal: true } : {}), ...(def.user ? { user: true } : {}),
      })),
  };
}

function refresh() {
  library = list();
  listeners.forEach((fn) => fn(library));
}

/** Loads the models and lists every piece (once). */
export function loadLibrary() {
  loading ??= (async () => {
    await loadModels();
    if (MODELS.manifest) (registerModelAssets(MODELS.manifest.assets ?? []), registerAnimals(MODELS.manifest.animals ?? []));
    refresh();
    // the user's own props join Mine as they load
    onUserModels((entry) => {
      if (entry.gone || !USER.props.has(entry.id)) return;
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

/** A piece alone in clay grey, three-quarter front, on a clear background, as a data URL. Cached per type. */
export function assetThumb(type, { width = 112, height = 96 } = {}) {
  const key = `${type}:${width}x${height}`;
  if (thumbs.has(key)) return thumbs.get(key);
  const { renderer, scene, clay, camera } = ensureShot();
  const piece = assetPiece(type);
  piece.traverse((o) => o.isMesh && (o.material = clay, (o.frustumCulled = false)));
  scene.add(piece);
  const box = preciseBox(piece);
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  const span = Math.max(size.y, size.x * (height / width), size.z * (height / width), 0.05);
  const dist = (span / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.25 + Math.max(size.x, size.z) / 2;
  camera.position.copy(centre).addScaledVector(new THREE.Vector3(0.55, 0.42, 1).normalize(), dist);
  camera.lookAt(centre);
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  scene.remove(piece);
  piece.traverse((o) => !o.userData.shared && o.geometry?.dispose());
  thumbs.set(key, url);
  return url;
}
