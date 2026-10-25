// The new scene of Toaster's 3D page: the objects of the clay scene, each replaced by the 3D model made for it, where its clay stood, as big
// as its clay was (a model is fitted inside its part's box, standing on the box's floor). What has no model yet (the room, an object not
// made, one still in the queue) stays as clay: a box of its size and colour, a little see-through, so what is real stands out. The viewer
// turns on a drag, is drawn only when something changes, and can save the whole scene as one GLB.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

const DEG = Math.PI / 180;

/** Mounts the viewer in `el`. `update(parts, modelOf)` puts the scene right (modelOf(partId) answers a done model's url, or null). */
export function mountScene(el) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.append(renderer.domElement);
  Object.assign(renderer.domElement.style, { display: "block", width: "100%", height: "100%" });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#141416");
  const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.75;
  const key = new THREE.DirectionalLight("#fff3e0", 2.2);
  key.position.set(3, 5, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 20 });
  key.shadow.bias = -0.0005;
  scene.add(key, new THREE.HemisphereLight("#dcdad6", "#202024", 0.35));
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
  camera.position.set(3.4, 2.4, 4.2);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 0.7, 0);
  orbit.enableDamping = false;

  let pending = 0;
  let disposed = false;
  const draw = () => {
    if (disposed) return;
    pending = 0;
    renderer.render(scene, camera);
  };
  const soon = () => pending || (pending = requestAnimationFrame(draw));
  orbit.addEventListener("change", soon);
  const resize = () => {
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    soon();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(el);
  resize();

  const loader = new GLTFLoader();
  const files = new Map(); // url → the loaded scene (kept: the same model is cloned for each use)
  const load = (url) => {
    if (!files.has(url)) files.set(url, loader.loadAsync(url).then((g) => g.scene));
    return files.get(url);
  };
  const placed = new Map(); // part id → { group, key }
  let framed = false;

  const stand = (part) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...part.size), new THREE.MeshStandardMaterial({ color: part.color, roughness: 0.7, transparent: true, opacity: 0.45, depthWrite: false }));
    mesh.userData.clay = true;
    return mesh;
  };
  /** A model fitted in its part's box: as large as fits, centred on the box and standing on its floor. */
  const fit = (model, size) => {
    const m = model.clone(true);
    const box = new THREE.Box3().setFromObject(m);
    const have = box.getSize(new THREE.Vector3());
    const k = Math.min(size[0] / Math.max(have.x, 1e-6), size[1] / Math.max(have.y, 1e-6), size[2] / Math.max(have.z, 1e-6));
    m.scale.multiplyScalar(k);
    const b2 = new THREE.Box3().setFromObject(m);
    const c = b2.getCenter(new THREE.Vector3());
    m.position.set(-c.x, -size[1] / 2 - b2.min.y, -c.z);
    m.traverse((o) => o.isMesh && ((o.castShadow = true), (o.receiveShadow = true)));
    const g = new THREE.Group();
    g.add(m);
    return g;
  };

  const frame = () => {
    const box = new THREE.Box3().setFromObject(scene);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dist = (sphere.radius / Math.sin((camera.fov * DEG) / 2)) * 0.8;
    orbit.target.copy(sphere.center);
    camera.position.copy(sphere.center).add(new THREE.Vector3(0.55, 0.4, 1).normalize().multiplyScalar(dist));
    camera.near = dist / 100;
    camera.far = dist * 20;
    camera.updateProjectionMatrix();
    orbit.update();
  };

  return {
    /** `parts` (visible ones are drawn) and `modelOf(id)`: the url of a done model, or falsy. Models are loaded as they are first needed. */
    async update(parts, modelOf) {
      const seen = new Set();
      await Promise.all(parts.filter((p) => !p.hidden).map(async (p) => {
        seen.add(p.id);
        const url = modelOf(p.id) || null;
        const key = `${url}|${p.size}`;
        let entry = placed.get(p.id);
        if (!entry) {
          entry = { group: new THREE.Group(), key: null };
          scene.add(entry.group);
          placed.set(p.id, entry);
        }
        entry.group.position.fromArray(p.pos);
        entry.group.rotation.set(p.rot[0] * DEG, p.rot[1] * DEG, p.rot[2] * DEG, "XYZ");
        if (entry.key !== key) {
          entry.key = key;
          entry.group.clear();
          try {
            entry.group.add(url ? fit(await load(url), p.size) : stand(p));
          } catch {
            entry.group.add(stand(p));
          }
        }
      }));
      for (const [id, e] of placed) if (!seen.has(id)) (scene.remove(e.group), placed.delete(id));
      if (disposed) return;
      if (!framed && placed.size) ((framed = true), frame());
      soon();
    },
    /** The scene as one GLB (the models and the clay left), as a blob. */
    async exportGlb() {
      const out = new THREE.Group();
      for (const { group } of placed.values()) out.add(group.clone(true));
      const buf = await new GLTFExporter().parseAsync(out, { binary: true });
      return new Blob([buf], { type: "model/gltf-binary" });
    },
    /** How many of the parts drawn are real models, and how many are still clay. */
    counts() {
      let real = 0;
      let clay = 0;
      for (const { group } of placed.values()) group.children.length && (group.children[0].userData.clay ? clay++ : real++);
      return { real, clay };
    },
    reframe: () => (frame(), soon()),
    dispose() {
      disposed = true;
      cancelAnimationFrame(pending);
      observer.disconnect();
      orbit.dispose();
      env.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
