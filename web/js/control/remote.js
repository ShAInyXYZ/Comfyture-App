// The stage, driven by words: the commands the assistant and outside agents send.
// Each one runs as one step of history and answers with what it did. Units are
// metres and degrees; Y is up, X is screen right and Z points at the default
// camera. Facing 0 looks at the camera, 90 looks right (+X). Where things are can
// be said as relations (against, sit_on, on, between, next_to) and the stage works
// out the numbers.

import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { RATIOS, SNAPS, MOVES, fovOf } from "./stage.js";
import { allPoses } from "./poses.js";
import { ASSETS, assetByType, seatOf, topOf, setPropParams } from "./assets.js";
import { CHAINS, JOINT_NAMES, BODY_TYPES, PALETTE, PARAMS, colorName } from "./skeleton.js";
import { PASSES } from "./channels.js";

const rad = THREE.MathUtils.degToRad;
const deg = (v) => Math.round(THREE.MathUtils.radToDeg(v) * 10) / 10;
const round = (v) => Math.round(v * 1000) / 1000;
/** Which way an object looks, in degrees about Y: 0 is +Z (the camera), 90 is +X. */
const facingOf = (o) => {
  const ahead = new THREE.Vector3(0, 0, 1).applyQuaternion(o.quaternion);
  return deg(Math.atan2(ahead.x, ahead.z));
};
const num = (v, name) => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${name} must be a number.`);
  return v;
};

// the words people (and models) use for what Control calls otherwise
const ALIASES = {
  pose: {
    standing: "stand", idle: "stand", wait: "stand", waiting: "stand", talking: "talk", explain: "talk", explaining: "talk", chat: "talk",
    walking: "walk", running: "run", sitting: "sit", seated: "sit", kneeling: "kneel", crouching: "crouch", squat: "crouch",
    lying: "lie", "lie down": "lie", "lying down": "lie", sleeping: "lie", pointing: "point", argue: "point", arguing: "point",
    waving: "wave", greet: "wave", "crossed arms": "arms-crossed", "arms crossed": "arms-crossed",
    fighting: "fight", boxing: "fight", landing: "hero-landing", "hero landing": "hero-landing", punching: "punch",
    reaching: "reach", tpose: "t-pose", "t pose": "t-pose",
    lean: "lean-back", leaning: "lean-back", "leaning back": "lean-back", "lean on wall": "lean-back", "lean against wall": "lean-back",
    pockets: "hands-in-pockets", "hands in pocket": "hands-in-pockets", "hand in pocket": "hands-in-pockets",
    "hands on hips": "hands-on-hips", "hand on hip": "hands-on-hips", think: "thinking", pondering: "thinking",
    phone: "phone-call", "on the phone": "phone-call", calling: "phone-call", call: "phone-call", shrugging: "shrug",
    celebrate: "cheer", celebrating: "cheer", cheering: "cheer", victory: "cheer", surrender: "hands-up", "hands raised": "hands-up",
    bowing: "bow", sneaking: "sneak", tiptoe: "sneak", jumping: "jump", leap: "jump",
    "sit on the floor": "sit-floor", "cross legged": "sit-floor", "cross-legged": "sit-floor", "sitting on the floor": "sit-floor",
    "sit back": "sit-relaxed", relaxed: "sit-relaxed", lounging: "sit-relaxed", kicking: "kick", aiming: "aim", shoot: "aim", shooting: "aim",
    carrying: "carry", holding: "carry", pushing: "push",
  },
  prop: {
    cube: "box", ball: "sphere", wall: "plane", partition: "plane", column: "pillar", post: "cylinder", pole: "cylinder",
    couch: "sofa", settee: "sofa", "arm chair": "armchair", seat: "chair", "office chair": "chair", "bar stool": "stool",
    "dining table": "table", "coffee table": "table", workbench: "desk", "kitchen counter": "counter", bar: "counter",
    bookcase: "shelf", bookshelf: "shelf", cabinet: "shelf", "floor lamp": "lamp", "standing lamp": "lamp",
    screen: "tv", television: "tv", monitor: "tv", gate: "doorway", entrance: "doorway", archway: "arch",
    stage: "platform", podium: "platform", riser: "platform", rug: "floor", carpet: "floor", mat: "floor",
    hedge: "bush", shrub: "bush", boulder: "rock", stone: "rock", streetlight: "streetlamp", "street lamp": "streetlamp", lamppost: "streetlamp",
    drum: "barrel", cone: "traffic-cone", "traffic cone": "traffic-cone", steps: "stairs", stair: "stairs", staircase: "stairs",
    vehicle: "car", truck: "car", van: "car", taxi: "car",
  },
  body: {
    male: "man", guy: "man", adult: "man", gentleman: "man", female: "woman", lady: "woman", girl: "teen", boy: "teen",
    teenager: "teen", kid: "child", baby: "toddler", infant: "toddler", old: "elder", elderly: "elder", grandpa: "elder", grandma: "elder",
    "old man": "elder", "old woman": "elder", fat: "heavy", big: "heavy", large: "heavy", chubby: "heavy",
    muscular: "athletic", strong: "athletic", athlete: "athletic", fit: "athletic",
  },
  color: { red: "#e8584f", coral: "#e8584f", cyan: "#3fc6c0", teal: "#3fc6c0", turquoise: "#3fc6c0", orange: "#f0a63a", amber: "#f0a63a", yellow: "#f0a63a",
    purple: "#8d7cf2", violet: "#8d7cf2", green: "#5fbf6a", pink: "#e86fb3", magenta: "#e86fb3", blue: "#4f8de8", brown: "#c28a5a", tan: "#c28a5a" },
  snap: { "low angle": "low", "high angle": "high", "close up": "close-up", closeup: "close-up", "over the shoulder": "over-shoulder", "over shoulder": "over-shoulder", profile: "side", "three quarter": "three-quarter-left", "three-quarter": "three-quarter-left", "bird's eye": "top", overhead: "top", wide: "front" },
  ratio: { vertical: "9:16", portrait: "9:16", reel: "9:16", story: "9:16", square: "1:1", landscape: "16:9", horizontal: "16:9", widescreen: "16:9", cinema: "21:9", cinemascope: "21:9", scope: "21:9" },
  move: { static: "locked", still: "locked", "locked off": "locked", "dolly in": "push-in", "push in": "push-in", "dolly out": "pull-out", "pull back": "pull-out",
    orbit: "orbit-left", "arc left": "orbit-left", "arc right": "orbit-right", "crane up": "crane-up", "boom up": "crane-up", "crane down": "crane-down", "boom down": "crane-down",
    "track left": "truck-left", "track right": "truck-right", "slide left": "truck-left", "slide right": "truck-right", pan: "truck-right",
    "tilt up": "tilt-up", "tilt down": "tilt-down", "zoom in": "zoom-in", "zoom out": "zoom-out", shaky: "handheld", "hand held": "handheld", shake: "handheld" },
};

/** A name as Control knows it: itself, or what a common word for it means. */
function known(kind, value, names) {
  const key = String(value ?? "").trim().toLowerCase();
  if (names.includes(key)) return key;
  const loose = key.replace(/[-_]+/g, " ");
  return ALIASES[kind][loose] ?? ALIASES[kind][key] ?? names.find((n) => n.replace(/-/g, " ") === loose) ?? null;
}

/** A size in metres ([width, height, depth], any left out) as an asset's own sizes. */
function sizeParams(type, size) {
  const [w, h, d] = (Array.isArray(size) ? size : [size]).map(Number);
  const def = assetByType(type);
  const has = (k) => def?.params.some(([p]) => p === k);
  const out = {};
  if (type === "car") Object.assign(out, Number.isFinite(w) && { l: w }, Number.isFinite(h) && { h }, Number.isFinite(d) && { w: d });
  else {
    if (Number.isFinite(w)) has("w") ? (out.w = w) : has("r") ? (out.r = w / 2) : has("s") ? (out.s = w) : null;
    if (Number.isFinite(h)) has("h") ? (out.h = h) : has("seat") ? (out.seat = h) : has("s") && !Number.isFinite(w) ? (out.s = h) : null;
    if (Number.isFinite(d) && has("d")) out.d = d;
  }
  return out;
}

/** The commands Control takes, from an agent over the server or from the assistant on the page. */
export function controlOps(stage) {
  const poseIds = () => allPoses().map((p) => p.id);
  const pose = (v) => {
    // a pose you saved goes by its name too
    const mine = allPoses().find((p) => p.name?.toLowerCase() === String(v).trim().toLowerCase());
    return mine?.id ?? known("pose", v, poseIds()) ?? (() => { throw new Error(`No pose "${v}". Poses: ${poseIds().join(", ")}.`); })();
  };
  const BODY_IDS = BODY_TYPES.map((b) => b.id);
  const body = (v) => known("body", v, BODY_IDS) ?? (() => { throw new Error(`No body type "${v}". Body types: ${BODY_IDS.join(", ")}.`); })();
  const color = (v) => {
    const s = String(v ?? "").trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(s)) return s;
    const named = PALETTE.find(([, n]) => n.toLowerCase() === s)?.[0] ?? ALIASES.color[s];
    if (!named) throw new Error(`No colour "${v}". Colours: ${PALETTE.map(([, n]) => n.toLowerCase()).join(", ")}.`);
    return named;
  };
  const find = (id) => {
    const character = stage.characters.find((c) => c.id === id || c.name.toLowerCase() === String(id).toLowerCase());
    if (character) return { character };
    const prop = stage.props.find((p) => p.userData.id === id || p.userData.label.toLowerCase() === String(id).toLowerCase());
    if (prop) return { prop };
    throw new Error(`Nothing on the stage is called "${id}". Read the scene for names.`);
  };
  const target = (id) => (String(id).toLowerCase() === "camera" ? { camera: true } : find(id));
  const objectOf = (t) => t.character?.root ?? t.prop;
  const groundXZ = (o) => [o.position.x, o.position.z];
  const where = (v) => {
    if (Array.isArray(v)) return [num(v[0], "x"), num(v.at(-1), "z")];
    return groundXZ(objectOf(find(v)));
  };

  /** Turns an object about Y so it looks at another object or a point on the ground. */
  const face = (object, toward) => {
    const [x, z] = where(toward);
    object.rotation.set(0, Math.atan2(x - object.position.x, z - object.position.z), 0);
  };

  /** A box around an object in its own frame (turned and scaled with it), from its meshes. */
  const ownBox = (o) => {
    o.updateMatrixWorld(true);
    const inv = o.matrixWorld.clone().invert();
    const box = new THREE.Box3();
    o.traverse((m) => {
      if (!m.isMesh) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      box.union(m.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)));
    });
    return box;
  };

  /** How far a body reaches behind its root, the way it faces: the gap between its root and a wall at its back. */
  const backDepth = (o) => {
    const [q, p] = [o.quaternion.clone(), o.position.clone()];
    o.quaternion.identity();
    o.position.set(0, p.y, 0);
    o.updateMatrixWorld(true);
    const depth = -new THREE.Box3().setFromObject(o).min.z;
    o.quaternion.copy(q);
    o.position.copy(p);
    o.updateMatrixWorld(true);
    return depth;
  };

  /** Back against something: on the face of it nearest to where the body is, facing away, touching it. */
  const lean = (o, against) => {
    const w = objectOf(against);
    const box = ownBox(w);
    const local = w.worldToLocal(o.position.clone());
    const mid = box.getCenter(new THREE.Vector3());
    const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const rel = local.clone().sub(mid);
    const onZ = Math.abs(rel.z) / Math.max(half.z, 1e-3) >= Math.abs(rel.x) / Math.max(half.x, 1e-3);
    const sign = Math.sign(onZ ? rel.z : rel.x) || 1;
    const clamp = THREE.MathUtils.clamp;
    const surface = onZ
      ? new THREE.Vector3(clamp(local.x, box.min.x, box.max.x), 0, sign > 0 ? box.max.z : box.min.z)
      : new THREE.Vector3(sign > 0 ? box.max.x : box.min.x, 0, clamp(local.z, box.min.z, box.max.z));
    const n = (onZ ? new THREE.Vector3(0, 0, sign) : new THREE.Vector3(sign, 0, 0)).transformDirection(w.matrixWorld).setY(0).normalize();
    w.localToWorld(surface);
    o.rotation.set(0, Math.atan2(n.x, n.z), 0);
    const depth = backDepth(o) + 0.005;
    o.position.x = surface.x + n.x * depth;
    o.position.z = surface.z + n.z * depth;
  };

  const SEATED = new Set(["sit", "sit-relaxed", "sit-floor"]);
  /**
   * Seated on something. Furniture with a seat (a chair, a sofa, a bench, a bed's edge, a step)
   * takes the body: it goes to a free place on the seat, facing the way the seat does. A plain
   * box or cylinder becomes the seat instead, sized and put under the hips. Anything else is sat on top of.
   */
  const sitOn = (c, on) => {
    if (!SEATED.has(c.posed)) {
      c.params = {};
      c.setEulerPose(allPoses().find((p) => p.id === "sit").joints);
      c.posed = "sit";
    }
    const prop = on.prop;
    const seat = prop ? seatOf(prop) : null;
    const pelvis = 0.06 * (c.profile.height / 1.78);
    if (seat) {
      c.root.rotation.set(0, 0, 0);
      c.root.quaternion.copy(prop.getWorldQuaternion(new THREE.Quaternion()));
      c.root.updateMatrixWorld(true);
      // the place on the seat nobody else is sitting in, nearest to where the body was
      const others = stage.characters.filter((x) => x !== c && x.seatedOn === prop.userData.id).map((x) => x.seatPlace);
      const free = seat.x.map((x, i) => [x, i]).filter(([, i]) => !others.includes(i));
      const local = prop.worldToLocal(c.root.position.clone());
      const [x, place] = (free.length ? free : seat.x.map((v, i) => [v, i])).sort((a, b) => Math.abs(a[0] - local.x) - Math.abs(b[0] - local.x))[0];
      const want = prop.localToWorld(new THREE.Vector3(x, seat.y + pelvis, seat.z));
      const hips = c.joints.Hips.getWorldPosition(new THREE.Vector3());
      c.root.position.add(want.sub(hips));
      c.root.updateMatrixWorld(true);
      c.seatedOn = prop.userData.id;
      c.seatPlace = place;
      return;
    }
    c.ground();
    const hips = c.joints.Hips.getWorldPosition(new THREE.Vector3());
    const top = hips.y - pelvis;
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(c.root.quaternion).setY(0).normalize();
    if (prop && (prop.userData.type === "box" || prop.userData.type === "cylinder")) {
      prop.rotation.set(0, c.root.rotation.y, 0);
      prop.scale.set(1, 1, 1);
      setPropParams(prop, prop.userData.type === "box" ? { w: 0.45, d: 0.45, h: Math.max(0.1, top) } : { r: 0.22, h: Math.max(0.1, top) });
      prop.position.set(hips.x + forward.x * 0.12, 0, hips.z + forward.z * 0.12);
      stage.placeOnGround(prop);
      return;
    }
    const box = new THREE.Box3().setFromObject(objectOf(on));
    const centre = box.getCenter(new THREE.Vector3());
    c.root.position.x += centre.x - hips.x;
    c.root.position.z += centre.z - hips.z;
    c.root.position.y += box.max.y - top;
    c.root.updateMatrixWorld(true);
  };

  /** On top of something: a body stands (or lies) on it, a prop rests on it, at its top. */
  const standOn = (o, on) => {
    const thing = objectOf(on);
    const box = new THREE.Box3().setFromObject(thing);
    const own = on.prop ? topOf(on.prop) : null;
    const top = own !== null ? thing.localToWorld(new THREE.Vector3(0, own, 0)).y : box.max.y;
    const centre = box.getCenter(new THREE.Vector3());
    o.position.x = centre.x;
    o.position.z = centre.z;
    if (on.prop && o !== thing) o.quaternion.copy(thing.getWorldQuaternion(new THREE.Quaternion()));
    o.updateMatrixWorld(true);
    o.position.y += top - new THREE.Box3().setFromObject(o).min.y;
  };

  const SIDES = { left: [-1, 0], right: [1, 0], front: [0, 1], "in front": [0, 1], "in front of": [0, 1], behind: [0, -1], back: [0, -1] };

  /**
   * Where a relation would put something on the ground, without moving it (for walking there).
   * Distances are from the edge of what it is next to, so beside a car is beside its side, and
   * walking to it stops short of it.
   */
  const spot = (a, from, self) => {
    if (a.x !== undefined || a.z !== undefined) return [a.x ?? from[0], a.z ?? from[1]];
    if (a.between !== undefined) {
      const [p, q] = (Array.isArray(a.between) ? a.between : String(a.between).split(/\s*(?:,|\band\b)\s*/)).map(where);
      return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    }
    const near = a.next_to ?? a.to;
    if (near === undefined) return from;
    if (Array.isArray(near)) return where(near);
    const thing = objectOf(find(near));
    const box = new THREE.Box3().setFromObject(thing);
    // half the mover's own width, so it stands clear of the edge rather than on it
    const own = self ? new THREE.Box3().setFromObject(self).getSize(new THREE.Vector3()) : new THREE.Vector3(0.5, 0, 0.5);
    const clear = Math.max(own.x, own.z) / 2;
    const side = a.side ? SIDES[String(a.side).toLowerCase().trim()] : null;
    const centre = box.getCenter(new THREE.Vector3());
    if (side) {
      const d = (a.distance !== undefined ? num(a.distance, "distance") : 0.3) + clear;
      return [side[0] ? (side[0] < 0 ? box.min.x - d : box.max.x + d) : centre.x, side[1] ? (side[1] < 0 ? box.min.z - d : box.max.z + d) : centre.z];
    }
    // the nearest point of its edge, then out toward where the mover comes from
    const edge = new THREE.Vector3(THREE.MathUtils.clamp(from[0], box.min.x, box.max.x), 0, THREE.MathUtils.clamp(from[1], box.min.z, box.max.z));
    const out = new THREE.Vector2(from[0] - edge.x, from[1] - edge.z);
    if (out.lengthSq() < 1e-6) out.set(from[0] - centre.x, from[1] - centre.z);
    if (out.lengthSq() < 1e-6) out.set(0, 1);
    out.normalize().multiplyScalar((a.distance !== undefined ? num(a.distance, "distance") : 0.25) + clear);
    return [edge.x + out.x, edge.z + out.y];
  };

  /**
   * Moves, turns and sets up a character or prop: x, y, z, facing (degrees), face_toward, or a
   * relation (against, sit_on, on, between, next_to with side and distance), which wins over x
   * and z. A character also takes name, body, color, height and params (the pose sliders);
   * a prop takes name, size in metres or params (its own sizes).
   */
  const place = (t, a) => {
    const o = objectOf(t);
    if (typeof a.name === "string" && a.name.trim() && a.id !== undefined) stage.rename(t, a.name);
    if (t.character) {
      const c = t.character;
      if (a.body !== undefined) c.setBody(body(a.body));
      if (a.height !== undefined) c.setProfile({ height: THREE.MathUtils.clamp(num(a.height, "height"), 0.5, 2.6) });
      if (a.color !== undefined) c.setColor(color(a.color));
      if (a.params && typeof a.params === "object") c.setParams(Object.fromEntries(Object.entries(a.params).filter(([k, v]) => PARAMS.some(([p]) => p === k) && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)])));
      if (a.sit_on === undefined) c.seatedOn = null;
    }
    const related = [a.against, a.sit_on, a.on, a.between, a.next_to].some((v) => v !== undefined);
    if (!related) {
      if (a.x !== undefined) o.position.x = num(a.x, "x");
      if (a.z !== undefined) o.position.z = num(a.z, "z");
    } else if (a.between !== undefined || a.next_to !== undefined) {
      const [x, z] = spot(a, groundXZ(o), o);
      o.position.x = x;
      o.position.z = z;
    }
    // leaning sets its own direction: away from what the back rests on
    if (a.against === undefined) {
      if (a.facing !== undefined) o.rotation.set(0, rad(num(a.facing, "facing")), 0);
      if (a.face_toward !== undefined) face(o, a.face_toward);
    }
    if (t.prop) {
      if (a.params && typeof a.params === "object") setPropParams(o, a.params);
      if (a.size !== undefined) {
        o.scale.set(1, 1, 1);
        setPropParams(o, sizeParams(o.userData.type, a.size));
      }
      if (a.scale !== undefined) {
        const s = Array.isArray(a.scale) ? a.scale : [a.scale, a.scale, a.scale];
        o.scale.set(...s.map((v, i) => Math.max(0.01, num(v, `scale[${i}]`))));
      }
    }
    if (t.character) t.character.ground();
    else {
      stage.placeOnGround(o);
      if (a.y !== undefined && a.on === undefined) o.position.y += num(a.y, "y");
    }
    if (a.on !== undefined) standOn(o, find(a.on));
    else if (a.sit_on === undefined && a.against === undefined) {
      // set down over a platform or a rug, it stands on it rather than inside it
      const under = stage.props.find((p) => p !== o && (p.userData.type === "platform" || p.userData.type === "floor") && p.visible && (() => {
        const local = p.worldToLocal(o.position.clone());
        const box = ownBox(p);
        return local.x > box.min.x && local.x < box.max.x && local.z > box.min.z && local.z < box.max.z;
      })());
      if (under) {
        const keep = o.quaternion.clone();
        const [x, z] = [o.position.x, o.position.z];
        standOn(o, { prop: under });
        o.quaternion.copy(keep);
        o.position.x = x;
        o.position.z = z;
      }
    }
    if (a.sit_on !== undefined && t.character) {
      // a seat named but not there is made: the furniture its name says, else a chair
      const named = known("prop", a.sit_on, ASSETS.map((x) => x.type));
      const seat = findOr(a.sit_on, () => ({ prop: addProp({ type: named && assetByType(named)?.seat ? named : "chair", label: String(a.sit_on), x: o.position.x, z: o.position.z }) }));
      // a chair for one is turned to whoever the sitter should face; a sofa stays put
      if (a.face_toward !== undefined && seat.prop && seatOf(seat.prop)?.x.length === 1) face(seat.prop, a.face_toward);
      sitOn(t.character, seat);
    }
    if (a.against !== undefined) lean(o, findOr(a.against, () => wallBehind(o, String(a.against))));
  };

  /** A seat or a wall named but not on the stage is made, rather than failing the whole command. */
  const findOr = (name, make) => {
    try {
      return find(name);
    } catch {
      return make();
    }
  };
  const wallBehind = (o, label) => {
    const wall = addProp({ type: "plane", label });
    const back = new THREE.Vector3(0, 0, -0.6).applyQuaternion(o.quaternion);
    wall.position.set(o.position.x + back.x, wall.position.y, o.position.z + back.z);
    wall.rotation.set(0, o.rotation.y, 0);
    return { prop: wall };
  };

  // what places a thing relative to others, done once everything in a layout exists
  const RELATIONS = ["face_toward", "against", "sit_on", "on", "between", "next_to", "side", "distance"];
  const relations = (a) => Object.fromEntries(RELATIONS.filter((k) => a[k] !== undefined).map((k) => [k, a[k]]));
  const plain = (a) => Object.fromEntries(Object.entries(a).filter(([k]) => !RELATIONS.includes(k)));

  const describe = () => ({
    characters: stage.characters.map((c) => ({
      id: c.id, name: c.name, body: c.body, color: colorName(`#${c.color.getHexString()}`).toLowerCase(), pose: c.posed ?? "custom", height: round(c.profile.height),
      position: c.root.position.toArray().map(round), facing: facingOf(c.root), visible: c.root.visible,
      ...(Object.keys(c.params).length ? { params: Object.fromEntries(Object.entries(c.params).filter(([k]) => k !== "swing").map(([k, v]) => [k, round(v)])) } : {}),
      ...(c.seatedOn ? { seated_on: stage.props.find((p) => p.userData.id === c.seatedOn)?.userData.label } : {}),
      ...(c.keys.length ? { keys: c.keys.map((k) => round(k.t)) } : {}),
    })),
    props: stage.props.map((p) => ({
      id: p.userData.id, type: p.userData.type, label: p.userData.label,
      position: p.position.toArray().map(round), facing: facingOf(p),
      size: new THREE.Box3().setFromObject(p).getSize(new THREE.Vector3()).toArray().map(round),
      ...(p.userData.keys.length ? { keys: p.userData.keys.map((k) => round(k.t)) } : {}),
    })),
    camera: { position: stage.camera.position.toArray().map(round), target: stage.orbit.target.toArray().map(round), focal: stage.focal, ratio: stage.ratio },
    timeline: { duration: stage.duration, time: round(stage.time), camera_move: stage.cameraKeys.length ? (stage.handheld ? "handheld" : stage.lastMove ?? "keyed") : "locked", camera_keys: stage.cameraKeys.map((k) => round(k.t)) },
  });

  const addCharacter = (a = {}) => {
    const c = stage.addCharacter({
      pose: a.pose ? pose(a.pose) : "stand",
      name: typeof a.name === "string" && a.name.trim() ? a.name.trim().slice(0, 40) : undefined,
      // no place given: the stage spreads newcomers out
      at: a.x === undefined && a.z === undefined ? undefined : [a.x ?? 0, 0, a.z ?? 0],
      body: a.body !== undefined ? body(a.body) : undefined,
      color: a.color !== undefined ? color(a.color) : undefined,
      profile: a.height ? { height: THREE.MathUtils.clamp(num(a.height, "height"), 0.5, 2.6) } : undefined,
    });
    if (a.params) c.setParams(a.params);
    place({ character: c }, { facing: a.facing, ...relations(a) });
    return c;
  };

  const addProp = (a = {}) => {
    const types = ASSETS.map((x) => x.type);
    const type = known("prop", a.type, types);
    if (!type) throw new Error(`No prop type "${a.type}". Types: ${types.join(", ")}.`);
    const p = stage.addProp(type, a.x === undefined && a.z === undefined ? undefined : [a.x ?? 0, 0, a.z ?? 0]);
    // a word that maps to a type ("couch" for a sofa) becomes the label
    const label = typeof a.label === "string" && a.label.trim() ? a.label.trim() : type !== String(a.type).trim().toLowerCase() ? String(a.type).trim().replace(/^\w/, (c) => c.toUpperCase()) : null;
    if (label) p.userData.label = p.name = label.slice(0, 40);
    place({ prop: p }, plain({ ...a, name: undefined }));
    return p;
  };

  const camera = (a = {}) => {
    if (a.ratio !== undefined) {
      const ratio = known("ratio", a.ratio, Object.keys(RATIOS));
      if (!ratio) throw new Error(`No frame "${a.ratio}". Frames: ${Object.keys(RATIOS).join(", ")}.`);
      stage.setRatio(ratio);
    }
    if (a.focal !== undefined) stage.setFocal(num(a.focal, "focal"));
    if (a.snap !== undefined) {
      const snap = known("snap", a.snap, SNAPS.map(([s]) => s));
      if (!snap) throw new Error(`No snap "${a.snap}". Snaps: ${SNAPS.map(([s]) => s).join(", ")}.`);
      stage.snap(snap, a.of && a.of !== "all" ? find(a.of).character ?? null : a.of === "all" ? null : undefined);
    }
    if (a.position || a.target) {
      if (a.position) stage.camera.position.fromArray(a.position.map((v, i) => num(v, `position[${i}]`)));
      if (a.target) stage.orbit.target.fromArray(a.target.map((v, i) => num(v, `target[${i}]`)));
      stage.orbit.update();
      stage.emit("camera");
      stage.render();
    }
    if (a.move !== undefined) cameraMove({ move: a.move, amount: a.amount });
  };

  /** A camera move over the shot: from the camera as it is (after any snap) to where the move ends. */
  const cameraMove = (a = {}) => {
    if (a.duration !== undefined) stage.setDuration(num(a.duration, "duration"));
    const move = known("move", a.move, MOVES.map(([m]) => m));
    if (!move) throw new Error(`No camera move "${a.move}". Moves: ${MOVES.map(([m]) => m).join(", ")}.`);
    stage.cameraMove(move, { amount: a.amount !== undefined ? THREE.MathUtils.clamp(num(a.amount, "amount"), 0.1, 3) : 1 });
    return move;
  };

  /**
   * Someone walks (or runs) somewhere over the shot: a key where they are at `start` and one
   * where they arrive at `end` (seconds, default the whole shot), facing the way they go. The
   * timeline lays a walk over whatever pose they hold; gait "run" runs, "none" glides.
   */
  const moveTo = (a = {}) => {
    const { character } = find(a.id);
    if (!character) throw new Error("Only characters walk.");
    if (a.duration !== undefined) stage.setDuration(num(a.duration, "duration"));
    const t0 = THREE.MathUtils.clamp(a.start !== undefined ? num(a.start, "start") : 0, 0, stage.duration);
    const t1 = THREE.MathUtils.clamp(a.end !== undefined ? num(a.end, "end") : stage.duration, t0 + 0.2, stage.duration);
    const from = groundXZ(character.root);
    const [x, z] = spot(a, from, character.root);
    if (a.gait !== undefined) character.gait = ["walk", "run", "none"].includes(a.gait) ? a.gait : "auto";
    stage.time = t0;
    const startKey = stage.keyFor({ character }, t0);
    const heading = Math.atan2(x - from[0], z - from[1]);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading).toArray();
    startKey.quaternion = q;
    const endKey = { ...structuredClone(startKey), t: t1, position: [x, character.root.position.y, z] };
    if (a.face_toward !== undefined) {
      const [fx, fz] = where(a.face_toward);
      endKey.quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(fx - x, fz - z)).toArray();
    }
    if (a.pose !== undefined) {
      const preset = allPoses().find((p) => p.id === pose(a.pose));
      const probe = new character.constructor({ profile: character.profile });
      if (preset.quaternions) probe.setPose(preset.quaternions);
      else probe.setEulerPose(preset.joints);
      endKey.pose = probe.getPose();
      endKey.posed = preset.id;
    }
    character.keys = character.keys.filter((k) => k.t < t0 - 1e-3 || k.t > t1 + 1e-3);
    character.keys.push(startKey, endKey);
    character.keys.sort((p, n) => p.t - n.t);
    stage.setTime(t0);
    stage.emit("timeline");
    return { id: character.id, from: from.map(round), to: [round(x), round(z)], start: t0, end: t1 };
  };

  /**
   * A whole layout in one step. With clear it replaces the stage; without, it works by name:
   * a character or prop already on the stage is moved (and posed), anything new is added.
   */
  const layout = (a = {}) => {
    if (a.clear) clear();
    const made = { characters: [], props: [] };
    const same = (x, y) => typeof x === "string" && x.trim().toLowerCase() === String(y).toLowerCase();
    // placing relative to something made later in the same layout waits until everything exists
    const later = [];
    for (const p of a.props ?? []) {
      let prop = stage.props.find((x) => same(p.label, x.userData.label));
      if (prop) place({ prop }, plain(p));
      else prop = addProp(plain(p));
      made.props.push(prop.userData.id);
      if (Object.keys(relations(p)).length) later.push([{ prop }, relations(p)]);
    }
    for (const c of a.characters ?? []) {
      let character = stage.characters.find((x) => same(c.name, x.name));
      if (character) {
        place({ character }, plain({ ...c, name: undefined }));
        if (c.pose && pose(c.pose) !== character.posed) stage.applyPose(pose(c.pose), character);
      } else character = addCharacter(plain(c));
      made.characters.push(character.id);
      if (Object.keys(relations(c)).length) later.push([{ character }, relations(c)]);
    }
    for (const [t, r] of later) place(t, r);
    if (a.camera) camera(a.camera);
    else if (a.clear && (made.characters.length || made.props.length)) stage.snap("three-quarter-left", null);
    if (a.duration !== undefined) stage.setDuration(num(a.duration, "duration"));
    return made;
  };

  const clear = () => {
    for (const c of [...stage.characters]) stage.remove({ character: c });
    for (const p of [...stage.props]) stage.remove({ prop: p });
    stage.cameraKeys = [];
    stage.handheld = 0;
  };

  /** What the frame shows, as a PNG data URL, in any channel (clay by default). */
  const look = (a = {}) => {
    const long = Math.round(THREE.MathUtils.clamp(a.width ?? 768, 128, 1600));
    const channel = a.channel && ["clay", ...PASSES].includes(a.channel) ? a.channel : "clay";
    if (a.t !== undefined) stage.setTime(num(a.t, "t"));
    return stage.frameStill(channel, { long });
  };

  /** The stage as one GLB, with ids and joint names in each node's extras, for Blender. */
  const exportGlb = async () => {
    // Blender shows node names, so a body goes by its name; ids ride along in the extras
    const saved = new Map();
    const tag = (o, extras, name = o.name) => {
      saved.set(o, [o.userData, o.name]);
      o.userData = extras;
      o.name = name;
    };
    for (const c of stage.characters) {
      tag(c.root, { comfyture_kind: "character", comfyture_id: c.id, comfyture_name: c.name }, c.name);
      c.root.traverse((o) => o !== c.root && tag(o, o.userData.joint && !o.isMesh ? { comfyture_joint: o.userData.joint } : {}));
    }
    for (const p of stage.props) {
      tag(p, { comfyture_kind: "prop", comfyture_id: p.userData.id, comfyture_type: p.userData.type });
      p.traverse((o) => o !== p && tag(o, {}));
    }
    try {
      const roots = [...stage.characters.map((c) => c.root), ...stage.props];
      if (!roots.length) throw new Error("The stage is empty.");
      const buffer = await new GLTFExporter().parseAsync(roots, { binary: true, onlyVisible: true });
      return btoa(Array.from(new Uint8Array(buffer), (b) => String.fromCharCode(b)).join(""));
    } finally {
      for (const [o, [data, name]] of saved) (o.userData = data), (o.name = name);
    }
  };

  /** Applies transforms read back from Blender: bodies, joints, props and the camera. */
  const applyBlender = (a) => {
    const done = { characters: 0, joints: 0, props: 0, camera: false, missing: [] };
    for (const c of a.characters ?? []) {
      const m = stage.characters.find((x) => x.id === c.id);
      if (!m) {
        done.missing.push(c.id);
        continue;
      }
      m.root.position.fromArray(c.position);
      m.root.quaternion.fromArray(c.quaternion);
      for (const [name, q] of Object.entries(c.joints ?? {})) {
        if (!JOINT_NAMES.includes(name)) continue;
        m.joints[name].quaternion.fromArray(q);
        done.joints++;
      }
      // what Blender shows is taken as the pose, the sliders still laid over it
      m.absorb();
      m.root.updateMatrixWorld(true);
      done.characters++;
    }
    for (const p of a.props ?? []) {
      const prop = stage.props.find((x) => x.userData.id === p.id);
      if (!prop) {
        done.missing.push(p.id);
        continue;
      }
      prop.position.fromArray(p.position);
      prop.quaternion.fromArray(p.quaternion);
      prop.scale.fromArray(p.scale);
      done.props++;
    }
    if (a.camera) {
      const ratio = Object.entries(RATIOS).sort((x, y) => Math.abs(x[1] - a.camera.aspect) - Math.abs(y[1] - a.camera.aspect))[0][0];
      stage.setRatio(ratio);
      stage.setFocal(a.camera.focal);
      stage.camera.position.fromArray(a.camera.position);
      stage.orbit.target.fromArray(a.camera.target);
      stage.orbit.update();
      done.camera = true;
    }
    stage.load(stage.toJSON(), { keepHistory: true });
    return done;
  };

  const OPS = {
    scene: () => ({
      ...describe(),
      poses: poseIds(),
      assets: ASSETS.map((x) => ({ type: x.type, name: x.name, category: x.category, ...(x.seat ? { seat: true } : {}), ...(x.top ? { top: true } : {}) })),
      body_types: BODY_TYPES.map((b) => b.id), colors: PALETTE.map(([, n]) => n.toLowerCase()), params: PARAMS.map(([k, , min, max]) => ({ name: k, min, max })),
      snaps: SNAPS.map(([s]) => s), moves: MOVES.map(([m]) => m), frames: Object.keys(RATIOS), effectors: Object.keys(CHAINS), joints: JOINT_NAMES,
      channels: ["clay", ...PASSES], lens: { focal: stage.focal, vertical_fov: Math.round(fovOf(stage.focal) * 10) / 10 },
    }),
    clear: () => (clear(), describe()),
    layout: (a) => ({ ...layout(a), scene: describe() }),
    add_character: (a) => ({ id: addCharacter(a).id, scene: describe() }),
    add_prop: (a) => ({ id: addProp(a).userData.id, scene: describe() }),
    place: (a) => (place(find(a.id), a), describe()),
    rename: (a) => {
      const t = find(a.id);
      stage.rename(t, a.name);
      return { id: a.id, name: t.character?.name ?? t.prop.userData.label };
    },
    remove: (a) => {
      stage.remove(find(a.id));
      return describe();
    },
    pose: (a) => {
      const { character } = find(a.id);
      if (!character) throw new Error("Only characters take poses.");
      // only sliders: the pose stays, the sliders change
      if (a.pose === undefined && a.params) {
        character.setParams(a.params);
        character.ground();
        return { id: character.id, pose: character.posed, params: character.params };
      }
      const id = pose(a.pose);
      stage.applyPose(id, character);
      if (a.mirror) stage.mirror(character);
      if (a.params) character.setParams(a.params), character.ground();
      return { id: character.id, pose: id };
    },
    joint: (a) => {
      const { character } = find(a.id);
      if (!character || !JOINT_NAMES.includes(a.joint)) throw new Error(`Name a character and a joint: ${JOINT_NAMES.join(", ")}.`);
      const [x, y, z] = (a.rotation ?? []).map((v, i) => rad(num(v, `rotation[${i}]`)));
      character.joints[a.joint].quaternion.setFromEuler(new THREE.Euler(x ?? 0, y ?? 0, z ?? 0, "XYZ"));
      character.constrain(a.joint);
      character.ground();
      character.posed = "custom";
      const e = new THREE.Euler().setFromQuaternion(character.joints[a.joint].quaternion, "XYZ");
      return { id: character.id, joint: a.joint, rotation: [deg(e.x), deg(e.y), deg(e.z)] };
    },
    reach: (a) => {
      const { character } = find(a.id);
      if (!character || !CHAINS[a.effector]) throw new Error(`Name a character and one of ${Object.keys(CHAINS).join(", ")}.`);
      // something named is reached at the middle of its top, where a hand or foot would rest
      const on = Array.isArray(a.target) ? null : find(a.target);
      const box = on ? new THREE.Box3().setFromObject(objectOf(on)) : null;
      const own = on?.prop ? topOf(on.prop) : null;
      const target = box ? box.getCenter(new THREE.Vector3()).setY(own !== null ? objectOf(on).localToWorld(new THREE.Vector3(0, own, 0)).y : box.max.y) : new THREE.Vector3(...a.target.map((v, i) => num(v, `target[${i}]`)));
      character.reach(a.effector, target);
      character.posed = "custom";
      const at = character.joints[a.effector].getWorldPosition(new THREE.Vector3());
      return { id: character.id, effector: a.effector, reached: at.toArray().map(round), off_by: round(at.distanceTo(target)) };
    },
    camera: (a) => (camera(a), describe().camera),
    camera_move: (a) => ({ move: cameraMove(a), timeline: describe().timeline }),
    move_to: moveTo,
    key: (a) => {
      const t = target(a.id ?? "camera");
      stage.key(t, a.t !== undefined ? THREE.MathUtils.clamp(num(a.t, "t"), 0, stage.duration) : stage.time);
      return describe().timeline;
    },
    clear_keys: (a) => {
      if (String(a.id ?? "all").toLowerCase() === "all") {
        stage.cameraKeys = [];
        stage.handheld = 0;
        stage.characters.forEach((c) => (c.keys = []));
        stage.props.forEach((p) => (p.userData.keys = []));
        stage.emit("timeline");
      } else stage.clearKeys(target(a.id));
      return describe().timeline;
    },
    duration: (a) => (stage.setDuration(num(a.seconds ?? a.duration, "seconds")), describe().timeline),
    time: (a) => (stage.setTime(num(a.t, "t")), describe()),
    look,
    undo: () => (stage.undo(), describe()),
    export_glb: async () => ({ glb: await exportGlb(), camera: describe().camera }),
    apply_blender: applyBlender,
  };
  // these read or replace the scene without a step of their own
  const QUIET = new Set(["scene", "look", "export_glb", "undo", "time"]);
  // the others happen whole or not at all: one that fails puts the stage back as it was
  for (const [name, run] of Object.entries(OPS)) {
    if (QUIET.has(name)) continue;
    OPS[name] = (args) => {
      const before = stage.toJSON();
      try {
        return run(args);
      } catch (error) {
        stage.load(before, { keepHistory: true });
        throw error;
      }
    };
  }
  return { ops: OPS, quiet: QUIET, describe, look };
}

/** Carries out commands the server relays, and answers each one. */
export function connectRemote(stage, { onActivity } = {}) {
  const { ops: OPS, quiet: QUIET } = controlOps(stage);

  const answer = (body) => fetch("api/control/reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const events = new EventSource("api/control/events");
  events.addEventListener("hello", () => onActivity?.({ connected: true }));
  events.addEventListener("error", () => onActivity?.({ connected: false }));
  events.addEventListener("command", async (e) => {
    const { id, op, args } = JSON.parse(e.data);
    onActivity?.({ connected: true, op });
    try {
      const run = OPS[op];
      if (!run) throw new Error(`Unknown command "${op}". Commands: ${Object.keys(OPS).join(", ")}.`);
      const result = QUIET.has(op) ? await run(args ?? {}) : stage.batch(() => run(args ?? {}));
      stage.render();
      await answer({ id, ok: true, result });
    } catch (error) {
      await answer({ id, ok: false, error: error.message });
    } finally {
      onActivity?.({ connected: true, op: null });
    }
  });
  return events;
}
