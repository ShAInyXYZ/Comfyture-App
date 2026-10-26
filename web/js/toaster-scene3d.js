// The new scene of Toaster's 3D page: the objects of the clay scene, each replaced by the 3D model made for it, where its clay stood, as big
// as its clay was (a model is fitted inside its part's box, standing on the box's floor). What has no model yet (the room, an object not
// made, one still in the queue) stays as clay: a box of its size and colour, a little see-through, so what is real stands out. The viewer
// turns on a drag, is drawn only when something changes, and can save the whole scene as one GLB.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { isRoom } from "./toaster-model.js";
import { geometryOf } from "./toaster-shapes.js";

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

  // what is not made yet stands as clay: the shapes as they are, a library piece or a character as a box of its size. In the blockout view
  // everything is clay, solid; with the assets in, what is not made yet is a little see-through and the room very faint.
  const stand = (part, solid) => {
    const room = isRoom(part);
    const geometry = part.shape === "asset" || part.shape === "character" ? new THREE.BoxGeometry(...part.size) : geometryOf(part);
    const opacity = solid ? (room ? 0.35 : 1) : room ? 0.1 : 0.5;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: part.color, roughness: 0.62, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }));
    mesh.castShadow = mesh.receiveShadow = solid && !room;
    mesh.userData.clay = true;
    mesh.userData.room = room;
    return mesh;
  };
  // How well a model's width, height and depth (as proportions of its longest side) say what its clay's did: the sum of the gaps of their logs, a
  // thin side counting no less than a tenth (a plank's clay is two centimetres thin, its model is not)
  const unlike = (have, want) => {
    const norm = (v) => v.map((x) => Math.max(0.1, x / Math.max(...v)));
    const a = norm(have);
    const b = norm(want);
    return a.reduce((n, x, i) => n + Math.abs(Math.log(x / b[i])), 0);
  };
  /**
   * A model fitted to its part: stood up the way its clay stands (a generator may lay a long thing on its side: a plank came out along x where its
   * clay is tall; it is rolled a quarter turn only when that is clearly the better match), as tall as its clay was (the height says the clay best:
   * a tail sticks out, a plank is thicker than its clay), centred on the clay in x and z and standing on its floor.
   */
  const fit = (model, size, upright = true) => {
    const m = model.clone(true);
    m.position.set(0, 0, 0);
    const v = new THREE.Vector3();
    const dims = (rx, rz) => (m.rotation.set(rx, 0, rz), m.updateMatrixWorld(true), new THREE.Box3().setFromObject(m).getSize(v).toArray());
    if (upright) {
      const turns = [[0, 0], [0, Math.PI / 2], [Math.PI / 2, 0]];
      const marks = turns.map(([rx, rz]) => unlike(dims(rx, rz), size));
      const best = marks.indexOf(Math.min(...marks));
      // (only a clear gain moves a model: a stool a little wider than its clay stays as it came)
      const [rx, rz] = marks[0] - marks[best] > 0.6 ? turns[best] : turns[0];
      m.rotation.set(rx, 0, rz);
    } else m.rotation.set(0, 0, 0);
    m.updateMatrixWorld(true);
    const have = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
    m.scale.multiplyScalar(size[1] / Math.max(have.y, 1e-6));
    m.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(m);
    const c = b2.getCenter(new THREE.Vector3());
    m.position.set(-c.x, -size[1] / 2 - b2.min.y, -c.z);
    m.traverse((o) => o.isMesh && ((o.castShadow = true), (o.receiveShadow = true)));
    const g = new THREE.Group();
    g.add(m);
    return g;
  };

  /** The scene's box: the objects only (a made model or an object's clay), so the room around them does not push the camera away. */
  const objectsBox = () => {
    const box = new THREE.Box3();
    for (const { group } of placed.values()) {
      const first = group.children[0];
      if (first && !first.userData.room) box.union(new THREE.Box3().setFromObject(group));
    }
    return box.isEmpty() ? new THREE.Box3().setFromObject(scene) : box;
  };
  const SIDES = { persp: [0.55, 0.4, 1], front: [0, 0.12, 1], right: [1, 0.12, 0], back: [0, 0.12, -1], left: [-1, 0.12, 0], top: [0, 1, 0.001] };
  const frame = (side = "persp") => {
    const box = objectsBox();
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dist = (sphere.radius / Math.sin((camera.fov * DEG) / 2)) * 0.95;
    orbit.target.copy(sphere.center);
    camera.position.copy(sphere.center).add(new THREE.Vector3(...(SIDES[side] ?? SIDES.persp)).normalize().multiplyScalar(dist));
    camera.near = dist / 100;
    camera.far = dist * 20;
    camera.updateProjectionMatrix();
    orbit.update();
  };

  return {
    /** `parts` (visible ones are drawn), `modelOf(id)` (the url of a done model, or falsy; loaded as first needed) and `view`: "assets" or "blockout" (all clay). */
    async update(parts, modelOf, view = "assets") {
      const seen = new Set();
      await Promise.all(parts.filter((p) => !p.hidden).map(async (p) => {
        seen.add(p.id);
        const url = view === "assets" ? modelOf(p.id) || null : null;
        const key = `${url}|${p.size}|${p.shape}|${p.color}|${view}`;
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
            entry.group.add(url ? fit(await load(url), p.size, p.shape !== "character") : stand(p, view === "blockout"));
          } catch {
            entry.group.add(stand(p, view === "blockout"));
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
    /** The camera brought close to one object (by its part's id), in the three-quarter view. */
    focus(id) {
      const e = placed.get(id);
      if (!e) return;
      const sphere = new THREE.Box3().setFromObject(e.group).getBoundingSphere(new THREE.Sphere());
      const dist = (Math.max(sphere.radius, 0.05) / Math.sin((camera.fov * DEG) / 2)) * 1.25;
      orbit.target.copy(sphere.center);
      camera.position.copy(sphere.center).add(new THREE.Vector3(0.55, 0.4, 1).normalize().multiplyScalar(dist));
      camera.near = dist / 100;
      camera.updateProjectionMatrix();
      orbit.update();
      soon();
    },
    /** The camera put in front of, beside, behind or over the objects ("persp" the three-quarter view), to see how each one stands. */
    view: (side) => (frame(side), soon()),
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
