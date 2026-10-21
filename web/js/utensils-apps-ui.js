// The parts of a mini app that the Shelf's carousel and the Templates workspace share: what an app asks for as small icons, its price,
// its picture (with a calm placeholder when the picture does not come), and a viewer for the 3D file an app can make.
import { h, icon, sprite } from "./dom.js";

const NEED = {
  image: { glyph: () => icon("image"), title: "Takes a picture" },
  video: { glyph: () => icon("video"), title: "Takes a clip" },
  audio: { glyph: () => icon("sound"), title: "Takes a sound" },
  words: { glyph: () => h("b", {}, "Aa"), title: "Takes a few words" },
};
const MEDIUM_ICON = { image: "image-library", video: "film-make", audio: "audio-music", "3d": "tool-templates" };

/** What an app asks for, as small pills with their words in a tooltip. */
export const needPills = (a) => a.needs.map((k) => h("span.ut-pill.is-kind", { title: NEED[k]?.title ?? k }, NEED[k]?.glyph() ?? k));

/** The price an app shows on its card: partner credits, "GPU time" when it bills none, nothing when it is not known yet. */
export function priceOf(a) {
  if (a.credits === null || a.credits === undefined) return "";
  return a.credits > 0 ? `≈ ${a.credits} cr` : "GPU time";
}

/** A calm stand-in for a picture that does not come: the icon of what the app makes on a tinted ground. */
export const placeholder = (a) => h("span.ut-app-ph", {}, sprite(MEDIUM_ICON[a.medium] ?? "tool-templates"));

/** The app's picture, filling its frame; the placeholder takes its place if it fails; `after` is the picture it dissolves to on hover. */
export function appPicture(a, { after = true } = {}) {
  const frame = h("span.ut-app-pic", {});
  const img = h("img", { src: a.thumb, alt: "", draggable: false, loading: "lazy", decoding: "async" });
  img.addEventListener("error", () => frame.replaceChildren(placeholder(a)), { once: true });
  frame.append(img);
  if (after && a.after) {
    frame.addEventListener("pointerenter", () => {
      if (frame.querySelector(".is-after") || !frame.contains(img)) return;
      frame.append(h("img.is-after", { src: a.after, alt: "", draggable: false, on: { error: (e) => e.target.remove() } }));
    }, { once: true });
  }
  return frame;
}

/**
 * A 3D file an app made, turned by hand in a small view (a .glb or .gltf, with three.js from the app's own vendor folder); any other
 * kind of file (a splat, a mesh) is a download. The renderer is let go when the view is no longer on the page.
 */
export function modelViewer(url, name = "model") {
  const box = h("div.ut-app-model", { role: "img", "aria-label": "The 3D model: drag to turn it" }, h("span.ut-hint", {}, "Loading the model…"));
  const fallback = () => box.replaceChildren(h("div.ut-app-file", {}, sprite("tool-templates"), h("b", {}, "3D file"), h("a.ut-ghost", { href: url, download: name }, icon("download"), "Download")));
  if (!/\.(glb|gltf)(\?|$)/i.test(url)) {
    fallback();
    return box;
  }
  (async () => {
    try {
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
      const gltf = await new GLTFLoader().loadAsync(url);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x303040, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 2.2);
      sun.position.set(2, 3, 4);
      scene.add(sun);
      scene.add(gltf.scene);
      // the model fills the view: centred, and the camera as far as its size asks
      const bounds = new THREE.Box3().setFromObject(gltf.scene);
      const size = bounds.getSize(new THREE.Vector3());
      const centre = bounds.getCenter(new THREE.Vector3());
      gltf.scene.position.sub(centre);
      const radius = Math.max(size.x, size.y, size.z) || 1;
      const camera = new THREE.PerspectiveCamera(35, 1, radius / 100, radius * 100);
      camera.position.set(radius * 1.4, radius * 0.9, radius * 1.9);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.autoRotate = true;
      controls.autoRotateSpeed = 1.6;
      controls.enableDamping = true;
      box.replaceChildren(renderer.domElement);
      const fit = () => {
        const w = box.clientWidth || 320;
        const hh = box.clientHeight || 240;
        renderer.setSize(w, hh, false);
        renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
        camera.aspect = w / hh;
        camera.updateProjectionMatrix();
      };
      new ResizeObserver(fit).observe(box);
      fit();
      const tick = () => {
        if (!box.isConnected) {
          renderer.dispose();
          return;
        }
        controls.update();
        renderer.render(scene, camera);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch {
      fallback();
    }
  })();
  return box;
}
