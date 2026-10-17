// Control channels: the stage drawn the ways image and video models take control
// from. Depth (near is white, as depth models print it), Colour ID (each body in its
// colour, each prop in its own, flat), Normal (view-space, the usual blue map), Pose
// (an OpenPose skeleton, keypoints and colours as the ControlNet tools draw them),
// Lines (white line art on black) and Mask (the bodies, white). The same code draws
// the live viewport preview, the small previews and the full-size references.

import * as THREE from "three";
import { headFrame } from "./body.js";

export const CHANNELS = [
  ["clay", "Clay", "channel-clay"],
  ["id", "Colour ID", "channel-id"],
  ["depth", "Depth", "channel-depth"],
  ["normal", "Normal", "channel-normal"],
  ["pose", "Pose", "channel-pose"],
  ["lines", "Lines", "channel-lines"],
  ["mask", "Mask", "channel-mask"],
];
/** The channels a reference is rendered in (clay is the viewport's own look). */
export const PASSES = CHANNELS.filter(([id]) => id !== "clay").map(([id]) => id);

// OpenPose's 18 body keypoints, its limbs (by keypoint, 1-based as the tools write them)
// and its colours, as ControlNet's draw_bodypose has them
const LIMBS = [[2, 3], [2, 6], [3, 4], [4, 5], [6, 7], [7, 8], [2, 9], [9, 10], [10, 11], [2, 12], [12, 13], [13, 14], [2, 1], [1, 15], [15, 17], [1, 16], [16, 18]];
const COLORS = [[255, 0, 0], [255, 85, 0], [255, 170, 0], [255, 255, 0], [170, 255, 0], [85, 255, 0], [0, 255, 0], [0, 255, 85], [0, 255, 170], [0, 255, 255], [0, 170, 255], [0, 85, 255], [0, 0, 255], [85, 0, 255], [170, 0, 255], [255, 0, 255], [255, 0, 170], [255, 0, 85]];

const depthVertex = /* glsl */ `
  varying float vDepth;
  varying vec3 vNormal;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }`;
// disparity (1/z) between the nearest and farthest thing on the stage, as depth models print it
const depthFragment = /* glsl */ `
  uniform float uNear;
  uniform float uFar;
  uniform bool uPack;
  varying float vDepth;
  varying vec3 vNormal;
  void main() {
    float d = clamp((1.0 / max(vDepth, 1e-4) - 1.0 / uFar) / (1.0 / uNear - 1.0 / uFar), 0.0, 1.0);
    gl_FragColor = uPack ? vec4(normalize(vNormal) * 0.5 + 0.5, d) : vec4(vec3(d), 1.0);
  }`;
const edgeFragment = /* glsl */ `
  uniform sampler2D tGeo;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tGeo, vUv);
    float e = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 o = i == 0 ? vec2(1.0, 0.0) : i == 1 ? vec2(-1.0, 0.0) : i == 2 ? vec2(0.0, 1.0) : vec2(0.0, -1.0);
      vec4 n = texture2D(tGeo, vUv + o * uTexel);
      float crease = (c.a > 0.0 && n.a > 0.0) ? length(n.rgb - c.rgb) * 1.4 : 0.0;
      e = max(e, max(crease, abs(n.a - c.a) * 9.0));
    }
    gl_FragColor = vec4(vec3(smoothstep(0.32, 0.5, e)), 1.0);
  }`;

const BLACK = new THREE.Color(0x000000);

export class Channels {
  constructor(stage) {
    this.stage = stage;
    this.depth = new THREE.ShaderMaterial({ vertexShader: depthVertex, fragmentShader: depthFragment, uniforms: { uNear: { value: 1 }, uFar: { value: 20 }, uPack: { value: false } } });
    this.geo = this.depth.clone();
    this.geo.uniforms = { uNear: this.depth.uniforms.uNear, uFar: this.depth.uniforms.uFar, uPack: { value: true } };
    this.normal = new THREE.MeshNormalMaterial();
    this.white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.ground = new THREE.MeshBasicMaterial({ color: 0x2a2a2a });
    this.flat = new Map();
    this.edges = new THREE.ShaderMaterial({
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: edgeFragment,
      uniforms: { tGeo: { value: null }, uTexel: { value: new THREE.Vector2() } },
      depthTest: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.edges);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.targets = new WeakMap();
  }

  /** A flat material per colour, made once. */
  flatColor(hex) {
    if (!this.flat.has(hex)) this.flat.set(hex, new THREE.MeshBasicMaterial({ color: hex }));
    return this.flat.get(hex);
  }

  /** The Colour ID colour of a prop: its own, muted, apart from the bodies' colours. */
  propColor(prop, index) {
    return prop.userData.idColor ?? `#${new THREE.Color().setHSL(((index * 137.508 + 200) % 360) / 360, 0.32, 0.5).getHexString()}`;
  }

  /** Nearest and farthest the bodies and props are from the camera, for the depth range. */
  range(camera) {
    camera.updateMatrixWorld();
    const view = camera.matrixWorldInverse;
    let near = Infinity;
    let far = 0;
    const corner = new THREE.Vector3();
    const things = [...this.stage.characters.filter((c) => c.root.visible).map((c) => c.root), ...this.stage.props.filter((p) => p.visible)];
    for (const o of things) {
      const box = new THREE.Box3().setFromObject(o);
      if (box.isEmpty()) continue;
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(view);
        near = Math.min(near, -corner.z);
        far = Math.max(far, -corner.z);
      }
    }
    if (!Number.isFinite(near)) return { near: 1, far: 12 };
    return { near: Math.max(camera.near, near - 0.4), far: far + 3 };
  }

  /**
   * Draws the scene through `camera` as `channel` with `renderer`, into its current target
   * (or the canvas). `size` is the drawing size in pixels, for the line pass.
   */
  render(renderer, camera, channel, size) {
    const s = this.stage;
    if (channel === "pose") {
      // the skeleton is drawn in 2D over black: the 3D pass only clears
      renderer.setClearColor(BLACK, 1);
      renderer.clear();
      return;
    }
    const { near, far } = this.range(camera);
    this.depth.uniforms.uNear.value = near;
    this.depth.uniforms.uFar.value = far;
    const saved = [];
    const swap = (mesh, material) => {
      saved.push([mesh, mesh.material]);
      mesh.material = material;
    };
    const hidden = [];
    const hide = (o) => {
      if (o?.visible) (o.visible = false), hidden.push(o);
    };
    hide(s.grid);
    hide(s.gizmo.getHelper());
    hide(s.handles);
    if (channel === "lines") hide(s.ground);
    const pass = channel === "lines" ? this.geo : null;
    s.characters.forEach((c) => c.root.traverse((m) => m.isMesh && swap(m, pass ?? (channel === "depth" ? this.depth : channel === "normal" ? this.normal : channel === "mask" ? this.white : this.flatColor(`#${c.color.getHexString()}`)))));
    s.props.forEach((p, i) => p.traverse((m) => m.isMesh && swap(m, pass ?? (channel === "depth" ? this.depth : channel === "normal" ? this.normal : channel === "mask" ? this.black : this.flatColor(this.propColor(p, i))))));
    swap(s.ground, channel === "depth" ? this.depth : channel === "normal" ? this.normal : channel === "id" ? this.ground : this.black);
    const scene = s.scene;
    const [background, fog] = [scene.background, scene.fog];
    const [toneMapping, colorSpace, clearAlpha] = [renderer.toneMapping, renderer.outputColorSpace, renderer.getClearAlpha()];
    const clearColor = renderer.getClearColor(new THREE.Color());
    scene.background = BLACK;
    scene.fog = null;
    renderer.toneMapping = THREE.NoToneMapping;
    // depth, normals and lines are data: no sRGB curve on them; flat colours keep their exact hex
    renderer.outputColorSpace = channel === "id" || channel === "mask" ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
    try {
      if (channel === "lines") this.lines(renderer, camera, size);
      else renderer.render(scene, camera);
    } finally {
      for (const [mesh, material] of saved) mesh.material = material;
      for (const o of hidden) o.visible = true;
      scene.background = background;
      scene.fog = fog;
      renderer.toneMapping = toneMapping;
      renderer.outputColorSpace = colorSpace;
      renderer.setClearColor(clearColor, clearAlpha);
    }
  }

  /** Line art: normals and depth into a target, then edges where either jumps. */
  lines(renderer, camera, size) {
    const w = Math.max(1, Math.round(size.width));
    const h = Math.max(1, Math.round(size.height));
    let target = this.targets.get(renderer);
    if (!target || target.width !== w || target.height !== h) {
      target?.dispose();
      target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: true });
      this.targets.set(renderer, target);
    }
    const out = renderer.getRenderTarget();
    const scene = this.stage.scene;
    scene.background = null;
    renderer.setRenderTarget(target);
    renderer.setClearColor(BLACK, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(out);
    this.edges.uniforms.tGeo.value = target.texture;
    // lines about two pixels wide at 1024, finer in small previews
    const thick = Math.max(1, Math.min(w, h) / 512);
    this.edges.uniforms.uTexel.value.set(thick / w, thick / h);
    renderer.setClearColor(BLACK, 1);
    renderer.clear();
    renderer.render(this.quadScene, this.quadCamera);
  }

  /** OpenPose keypoints of a body, in pixels for a `width` × `height` picture through `camera`; null where unseen. */
  keypoints(character, camera, width, height) {
    const j = character.joints;
    const world = (o, local) => (local ? o.localToWorld(local.clone()) : o.getWorldPosition(new THREE.Vector3()));
    const { centre: c, radius: r } = headFrame(character.profile);
    const head = j.Head;
    const headCentre = world(head, c);
    // the face: nose, eyes and ears on the head's surface (its right is −x); the eyes sit halfway down the head
    const at = (x, y, z) => world(head, new THREE.Vector3(c.x + x * r, c.y + y * r, c.z + z * r));
    const face = {
      nose: at(0, -0.2, 1.0),
      rEye: at(-0.32, 0.02, 0.8),
      lEye: at(0.32, 0.02, 0.8),
      rEar: at(-0.82, -0.05, -0.05),
      lEar: at(0.82, -0.05, -0.05),
    };
    const eye = camera.getWorldPosition(new THREE.Vector3());
    // a face point is seen when it faces the camera, so a back view has no nose or eyes
    const seen = (p) => p.clone().sub(headCentre).normalize().dot(eye.clone().sub(p).normalize()) > -0.05;
    const points = [
      seen(face.nose) ? face.nose : null,
      world(j.Neck),
      world(j.RightArm), world(j.RightForeArm), world(j.RightHand),
      world(j.LeftArm), world(j.LeftForeArm), world(j.LeftHand),
      world(j.RightUpLeg), world(j.RightLeg), world(j.RightFoot),
      world(j.LeftUpLeg), world(j.LeftLeg), world(j.LeftFoot),
      seen(face.rEye) ? face.rEye : null, seen(face.lEye) ? face.lEye : null,
      seen(face.rEar) ? face.rEar : null, seen(face.lEar) ? face.lEar : null,
    ];
    camera.updateMatrixWorld();
    return points.map((p) => {
      if (!p) return null;
      const v = p.clone().project(camera);
      if (v.z < -1 || v.z > 1) return null;
      return [(v.x * 0.5 + 0.5) * width, (-v.y * 0.5 + 0.5) * height];
    });
  }

  /** Draws every visible body's skeleton into a 2D context, the way ControlNet's OpenPose does. */
  drawPose(ctx, camera, width, height, { clear = true } = {}) {
    if (clear) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
    }
    const scale = Math.min(width, height) / 512;
    const stick = 4 * scale;
    for (const c of this.stage.characters) {
      if (!c.root.visible) continue;
      const k = this.keypoints(c, camera, width, height);
      ctx.save();
      ctx.globalAlpha = 0.6;
      LIMBS.forEach(([a, b], i) => {
        const p = k[a - 1];
        const q = k[b - 1];
        if (!p || !q) return;
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        ctx.beginPath();
        ctx.ellipse((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, len / 2, stick, Math.atan2(q[1] - p[1], q[0] - p[0]), 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${COLORS[i].join(",")})`;
        ctx.fill();
      });
      ctx.restore();
      k.forEach((p, i) => {
        if (!p) return;
        ctx.beginPath();
        ctx.arc(p[0], p[1], 4 * scale, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${COLORS[i].join(",")})`;
        ctx.fill();
      });
    }
  }
}
