// The disc reader: a record on a turntable in 3D (Three.js), lit like the rest of the app (warm black, one yellow).
// The disc turns and the arm comes down on it while a song plays. It draws only while something moves, and stops
// when the page is left, so it costs nothing at rest.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const YELLOW = "#F2FF59";
const INK = "#141414";
const TURN = (Math.PI * 2) / 1.8; // a turn every 1.8 s: a record's 33⅓ is slower, but it reads as turning at a glance
const ARM_OFF = 0; // the arm at rest, off the disc
const ARM_ON = 1; // the arm on the grooves

/** A square canvas drawn once and kept as a texture. */
function paint(size, draw, { srgb = true } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  draw(canvas.getContext("2d"), size);
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** The grooves: fine rings in a few tracks, with the plain bands between songs and the lead-out at the edge. */
const grooves = (g, s) => {
  const c = s / 2;
  g.fillStyle = "#0b0b0d";
  g.fillRect(0, 0, s, s);
  for (let r = 0.35 * c; r < 0.985 * c; r += 1.7) {
    const x = r / c;
    const band = [0.52, 0.7, 0.83].some((b) => Math.abs(x - b) < 0.009);
    const n = Math.sin(r * 12.9898) * 43758.5453;
    g.strokeStyle = band ? "rgba(255,255,255,.11)" : `rgba(255,255,255,${0.035 + (n - Math.floor(n)) * 0.07})`;
    g.lineWidth = band ? 2.4 : 1;
    g.beginPath();
    g.arc(c, c, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.strokeStyle = "rgba(255,255,255,.16)";
  g.lineWidth = 3;
  g.beginPath();
  g.arc(c, c, 0.99 * c, 0, Math.PI * 2);
  g.stroke();
};

/** The label: the yellow of the app, the jam jar, a note. */
const label = (g, s) => {
  const c = s / 2;
  g.fillStyle = YELLOW;
  g.fillRect(0, 0, s, s);
  g.strokeStyle = "rgba(20,20,20,.45)";
  g.lineWidth = s * 0.012;
  g.beginPath();
  g.arc(c, c, c * 0.9, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = INK;
  g.fillStyle = INK;
  g.lineWidth = s * 0.026;
  g.lineJoin = g.lineCap = "round";
  const jw = s * 0.27;
  const jh = s * 0.3;
  g.strokeRect(c - jw / 2, c - jh / 2 + s * 0.02, jw, jh);
  g.strokeRect(c - jw / 2 - s * 0.012, c - jh / 2 - s * 0.03, jw + s * 0.024, s * 0.055);
  g.font = `800 ${s * 0.085}px Manrope, system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("JAM", c, c + s * 0.075);
  for (const k of [-1, 1]) for (const a of [-0.5, 0.15]) {
    g.beginPath();
    g.moveTo(c + k * s * 0.2, c - s * 0.2 + a * s * 0.1);
    g.lineTo(c + k * s * 0.265, c - s * 0.235 + a * s * 0.1 + k * s * 0.0);
    g.stroke();
  }
};

/** A soft sheen: two bright wedges on the disc that stay where the light is while the disc turns under them. */
const sheen = (g, s) => {
  const c = s / 2;
  g.clearRect(0, 0, s, s);
  for (const a of [Math.PI * 0.25, Math.PI * 1.25]) {
    const grad = g.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.35, "rgba(255,255,255,.1)");
    grad.addColorStop(1, "rgba(255,255,255,.06)");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(c, c);
    g.arc(c, c, c, a - 0.2, a + 0.2);
    g.closePath();
    g.fill();
  }
};

/** A rounded rectangle slab (the plinth). */
function slab(w, d, h, r, material) {
  const shape = new THREE.Shape();
  const x = -w / 2;
  const y = -d / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + d - r);
  shape.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  shape.lineTo(x + r, y + d);
  shape.quadraticCurveTo(x, y + d, x, y + d - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 4, curveSegments: 16 });
  geometry.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geometry, material);
}

/** A disc reader in `parent`: returns { el, play(on), dispose() }. */
export function createDeck() {
  const el = document.createElement("div");
  el.className = "sg-deck-3d";
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  el.append(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.32;
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  camera.position.set(0.5, 13.4, 9.4);
  camera.lookAt(0.2, 0, 0.3);

  const key = new THREE.DirectionalLight(0xfff3e0, 1.9);
  key.position.set(-5, 9, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xb9a8ff, 1.1);
  rim.position.set(6, 4, -5);
  scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));

  const metal = new THREE.MeshStandardMaterial({ color: 0x0f0f12, roughness: 0.62, metalness: 0.3 });
  const plinth = slab(8.4, 6.6, 0.5, 0.5, metal);
  plinth.position.set(0, -0.58, 0);
  scene.add(plinth);

  const platter = new THREE.Mesh(new THREE.CylinderGeometry(3.05, 3.05, 0.14, 96), new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.4, metalness: 0.7 }));
  platter.position.y = -0.02;
  scene.add(platter);

  const disc = new THREE.Group();
  const grooveMap = paint(2048, grooves);
  const vinyl = new THREE.Mesh(
    new THREE.CylinderGeometry(2.9, 2.9, 0.05, 128),
    [
      new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.4, metalness: 0.1 }),
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: grooveMap, bumpMap: grooveMap, bumpScale: 0.35, roughness: 0.32, metalness: 0.25 }),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.5 }),
    ],
  );
  vinyl.position.y = 0.1;
  // (the label is the app's own yellow, unlit, so the light and the tone mapping leave it as it is)
  const labelMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 0.98, 0.058, 64), [
    new THREE.MeshBasicMaterial({ color: YELLOW, toneMapped: false }),
    new THREE.MeshBasicMaterial({ map: paint(512, label), toneMapped: false }),
    new THREE.MeshBasicMaterial({ color: YELLOW, toneMapped: false }),
  ]);
  labelMesh.position.y = 0.1;
  disc.add(vinyl, labelMesh);
  scene.add(disc);

  // the light on the grooves: it does not turn with the disc
  const glow = new THREE.Mesh(new THREE.RingGeometry(1.0, 2.88, 96, 1), new THREE.MeshBasicMaterial({ map: paint(1024, sheen), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.131;
  scene.add(glow);

  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 24), new THREE.MeshStandardMaterial({ color: 0xd8d6e0, roughness: 0.25, metalness: 1 }));
  spindle.position.y = 0.25;
  scene.add(spindle);

  // the arm: a base, a pivot that turns, the tube, the head with its yellow mark
  const arm = new THREE.Group();
  arm.position.set(3.35, 0.35, -2.1);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.42, 48), new THREE.MeshStandardMaterial({ color: 0x1a1a1d, roughness: 0.45, metalness: 0.5 }));
  base.position.set(0, -0.14, 0);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 48), new THREE.MeshStandardMaterial({ color: 0x3a3a42, roughness: 0.3, metalness: 0.8 }));
  cap.position.set(0, 0.12, 0);
  const metalTube = new THREE.MeshStandardMaterial({ color: 0xd9d6e2, roughness: 0.22, metalness: 1 });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 4.6, 24), metalTube);
  tube.rotation.z = Math.PI / 2;
  tube.rotation.y = 0;
  const pivot = new THREE.Group();
  pivot.add(tube);
  tube.position.set(-2.3, 0.2, 0);
  const head = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.34), new THREE.MeshStandardMaterial({ color: 0x26262b, roughness: 0.4, metalness: 0.4 }));
  const mark = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.17, 0.35), new THREE.MeshBasicMaterial({ color: YELLOW, toneMapped: false }));
  mark.position.x = -0.18;
  head.add(shell, mark);
  head.position.set(-4.7, 0.2, 0);
  pivot.add(head);
  arm.add(base, cap, pivot);
  scene.add(arm);

  let playing = false;
  let turned = 0;
  let reach = ARM_OFF;
  let frame = 0;
  let last = 0;
  let live = true;

  // the arm's pivot: the head rests just off the rim, and swings in and down onto the grooves while it plays
  const place = () => {
    pivot.rotation.y = -0.16 + reach * 0.4;
    pivot.position.y = 0.34 - reach * 0.14;
    head.rotation.y = 0.05;
  };

  const draw = (now) => {
    frame = 0;
    if (!live) return;
    if (!el.isConnected) {
      // (left on another page: it stops, and picks up when it is put back)
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    const goal = playing ? ARM_ON : ARM_OFF;
    reach += (goal - reach) * Math.min(1, dt * 2.6);
    if (playing) turned += dt * TURN;
    else if (Math.abs(goal - reach) < 0.002) reach = goal;
    disc.rotation.y = turned;
    place();
    renderer.render(scene, camera);
    if (playing || Math.abs(goal - reach) > 0.002) frame = requestAnimationFrame(draw);
  };
  const kick = () => {
    if (!frame) {
      last = performance.now();
      frame = requestAnimationFrame(draw);
    }
  };

  const fit = () => {
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // the whole plinth is always in frame: the field of view is set by the width it must hold (the camera is 17 away)
    camera.fov = Math.max(24, (2 * Math.atan(Math.tan((16.5 * Math.PI) / 180) / camera.aspect) * 180) / Math.PI);
    camera.updateProjectionMatrix();
    kick();
  };
  const watch = new ResizeObserver(fit);
  watch.observe(el);
  // (put back on the page: drawn again)
  const back = new IntersectionObserver((e) => e[0]?.isIntersecting && kick());
  back.observe(el);
  place();

  return {
    el,
    play(on) {
      playing = !!on;
      kick();
    },
    dispose() {
      live = false;
      watch.disconnect();
      back.disconnect();
      cancelAnimationFrame(frame);
      renderer.dispose();
      pmrem.dispose();
    },
  };
}
