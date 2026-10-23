// A small viewer for a 3D file the app made (.glb, .gltf or .obj): the model centred and fitted, lit like the studio, turning on
// its own until the user takes hold of it.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";

/** Mounts the viewer in `el`. `ready` resolves when the model is in view (and rejects with a readable error). */
export function mountModel(el, url) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  el.append(renderer.domElement);
  Object.assign(renderer.domElement.style, { display: "block", width: "100%", height: "100%" });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#141416");
  const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.8;
  const key = new THREE.DirectionalLight("#ffffff", 1.6);
  key.position.set(3, 5, 4);
  scene.add(key, new THREE.HemisphereLight("#dcdad6", "#202024", 0.4));

  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.autoRotate = true;
  orbit.autoRotateSpeed = 1.2;
  // it turns by itself only until the user takes hold; the loop runs only while something moves
  let loop = false;
  const spin = (on) => {
    if (on === loop) return;
    loop = on;
    renderer.setAnimationLoop(on ? () => (orbit.update(), renderer.render(scene, camera)) : null);
  };
  orbit.addEventListener("start", () => ((orbit.autoRotate = false), spin(true)));
  orbit.addEventListener("end", () => spin(false));
  const draw = () => (orbit.update(), renderer.render(scene, camera));

  let model = null;
  const resize = () => {
    const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!loop) draw();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(el);
  resize();

  // the kind is read from the file's first bytes (a blob link has no name): "glTF" is a .glb, "{" a .gltf, "v " lines an .obj
  const load = async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`the file is not there (${res.status})`);
    const buf = await res.arrayBuffer();
    const head = new TextDecoder().decode(buf.slice(0, 64)).trimStart();
    if (head.startsWith("glTF") || head.startsWith("{")) return (await new GLTFLoader().parseAsync(buf, url.slice(0, url.lastIndexOf("/") + 1))).scene;
    if (/^(#|v |o |g |mtllib)/m.test(head)) {
      const g = new OBJLoader().parse(new TextDecoder().decode(buf));
      g.traverse((o) => o.isMesh && (o.material = new THREE.MeshStandardMaterial({ color: "#c9c4bb", roughness: 0.6 })));
      return g;
    }
    return null;
  };

  const ready = load().then((m) => {
    if (!m || disposed) return;
    model = m;
    // centred on the origin and fitted: the camera stands back by the model's bounding sphere
    const box = new THREE.Box3().setFromObject(m);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    m.position.sub(sphere.center);
    scene.add(m);
    const dist = (sphere.radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.1;
    camera.position.set(0.6, 0.35, 1).normalize().multiplyScalar(dist);
    camera.near = dist / 100;
    camera.far = dist * 10;
    camera.updateProjectionMatrix();
    orbit.update();
    spin(true);
  }).catch((e) => {
    throw new Error(`The 3D model could not be shown: ${e?.message ?? e}`);
  });

  let disposed = false;
  return {
    ready,
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      orbit.dispose();
      model?.traverse((o) => {
        o.geometry?.dispose();
        for (const mat of [].concat(o.material ?? [])) mat.dispose();
      });
      env.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
