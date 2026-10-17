// The stage, driven from outside. The server relays an agent's commands over
// an event stream; each one runs as one step of history and answers with what
// it did. Units are metres and degrees; Y is up, X is screen right and Z points
// at the default camera. Facing 0 looks at the camera, 90 looks right (+X).

import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { RATIOS, SNAPS, fovOf } from "./stage.js";
import { POSES } from "./poses.js";
import { PROP_TYPES } from "./props.js";
import { CHAINS, JOINT_NAMES } from "./skeleton.js";

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
    standing: "stand", idle: "stand", talk: "stand", talking: "stand", wait: "stand", waiting: "stand",
    walking: "walk", running: "run", sitting: "sit", seated: "sit", kneeling: "kneel", crouching: "crouch", squat: "crouch",
    lying: "lie", "lie down": "lie", "lying down": "lie", pointing: "point", argue: "point", arguing: "point",
    waving: "wave", greet: "wave", "crossed arms": "arms-crossed", "arms crossed": "arms-crossed",
    fighting: "fight", punch: "fight", boxing: "fight", landing: "hero-landing", "hero landing": "hero-landing",
    reaching: "reach", tpose: "t-pose", "t pose": "t-pose",
    lean: "lean-back", leaning: "lean-back", "leaning back": "lean-back", "lean on wall": "lean-back", "lean against wall": "lean-back",
    pockets: "hands-in-pockets", "hands in pocket": "hands-in-pockets", "hand in pocket": "hands-in-pockets",
  },
  prop: { table: "box", desk: "box", chair: "box", stool: "box", crate: "box", bench: "box", cube: "box", bed: "box", car: "box", wall: "plane", door: "plane", screen: "plane", pillar: "cylinder", column: "cylinder", barrel: "cylinder", post: "cylinder", ball: "sphere", rock: "sphere", steps: "stairs", stair: "stairs", staircase: "stairs" },
  snap: { "low angle": "low", "high angle": "high", "close up": "close-up", closeup: "close-up", "over the shoulder": "over-shoulder", "over shoulder": "over-shoulder", profile: "side", "three quarter": "three-quarter-left", "three-quarter": "three-quarter-left", "bird's eye": "top", overhead: "top", wide: "front" },
  ratio: { vertical: "9:16", portrait: "9:16", reel: "9:16", story: "9:16", square: "1:1", landscape: "16:9", horizontal: "16:9", widescreen: "16:9", cinema: "21:9", cinemascope: "21:9", scope: "21:9" },
};

/** A name as Control knows it: itself, or what a common word for it means. */
function known(kind, value, names) {
  const key = String(value ?? "").trim().toLowerCase();
  if (names.includes(key)) return key;
  const loose = key.replace(/[-_]+/g, " ");
  return ALIASES[kind][loose] ?? ALIASES[kind][key] ?? names.find((n) => n.replace(/-/g, " ") === loose) ?? null;
}

/** The commands Control takes, from an agent over the server or from the assistant on the page. */
export function controlOps(stage) {
  const POSE_IDS = POSES.map((p) => p.id);
  const pose = (v) => known("pose", v, POSE_IDS) ?? (() => { throw new Error(`No pose "${v}". Poses: ${POSE_IDS.join(", ")}.`); })();
  const find = (id) => {
    const character = stage.characters.find((c) => c.id === id || c.name.toLowerCase() === String(id).toLowerCase());
    if (character) return { character };
    const prop = stage.props.find((p) => p.userData.id === id || p.userData.label.toLowerCase() === String(id).toLowerCase());
    if (prop) return { prop };
    throw new Error(`Nothing on the stage is called "${id}". Read the scene for ids.`);
  };
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
  const lean = (o, target) => {
    const w = objectOf(target);
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

  /** Seated on something. A box or cylinder becomes the seat, sized and put under the hips; anything else is sat on top of. */
  const sitOn = (c, target) => {
    if (c.posed !== "sit") {
      c.setEulerPose(POSES.find((p) => p.id === "sit").joints);
      c.posed = "sit";
      c.ground();
    }
    const hips = c.joints.Hips.getWorldPosition(new THREE.Vector3());
    const seat = hips.y - 0.06 * (c.profile.height / 1.75);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(c.root.quaternion).setY(0).normalize();
    const prop = target.prop;
    if (prop && (prop.userData.type === "box" || prop.userData.type === "cylinder")) {
      const tall = prop.userData.type === "box" ? 0.6 : 0.8;
      prop.rotation.set(0, c.root.rotation.y, 0);
      prop.scale.set(0.75, Math.max(0.1, seat) / tall, 0.75);
      prop.position.set(hips.x + forward.x * 0.12, 0, hips.z + forward.z * 0.12);
      stage.placeOnGround(prop);
      return;
    }
    const box = new THREE.Box3().setFromObject(objectOf(target));
    const top = box.getCenter(new THREE.Vector3());
    c.root.position.x += top.x - hips.x;
    c.root.position.z += top.z - hips.z;
    c.root.position.y += box.max.y - seat;
    c.root.updateMatrixWorld(true);
  };

  /** On top of something: a body stands on it, a prop rests on it. */
  const standOn = (o, target) => {
    const box = new THREE.Box3().setFromObject(objectOf(target));
    const top = box.getCenter(new THREE.Vector3());
    o.position.x = top.x;
    o.position.z = top.z;
    o.updateMatrixWorld(true);
    o.position.y += box.max.y - new THREE.Box3().setFromObject(o).min.y;
  };

  // each prop type's size at scale 1, in metres
  const SIZES = { box: [0.6, 0.6, 0.6], cylinder: [0.6, 0.8, 0.6], sphere: [0.7, 0.7, 0.7], plane: [2.4, 2.2, 0.08], stairs: [1, 0.9, 1.5] };

  const SIDES = { left: [-1, 0], right: [1, 0], front: [0, 1], "in front": [0, 1], "in front of": [0, 1], behind: [0, -1], back: [0, -1] };

  /**
   * Moves and turns a character or prop: x, y, z, facing (degrees), face_toward, scale, height, or
   * where it is relative to others, worked out here: against (back to it), sit_on, on, between
   * [a, b], next_to with side (left, right, front, behind) and distance. A relation wins over x and z.
   */
  const place = (t, a) => {
    const o = objectOf(t);
    const related = [a.against, a.sit_on, a.on, a.between, a.next_to].some((v) => v !== undefined);
    if (!related) {
      if (a.x !== undefined) o.position.x = num(a.x, "x");
      if (a.z !== undefined) o.position.z = num(a.z, "z");
    }
    if (a.between !== undefined) {
      const two = Array.isArray(a.between) && a.between.length === 2 ? a.between : String(a.between).split(/\s*(?:,|\band\b)\s*/).filter(Boolean);
      if (two.length !== 2) throw new Error("between takes two names.");
      const [p, q] = two.map(where);
      o.position.x = (p[0] + q[0]) / 2;
      o.position.z = (p[1] + q[1]) / 2;
    }
    if (a.next_to !== undefined) {
      const [x, z] = where(a.next_to);
      const d = a.distance !== undefined ? num(a.distance, "distance") : 1;
      const [dx, dz] = SIDES[String(a.side ?? "right").toLowerCase().trim()] ?? SIDES.right;
      o.position.x = x + dx * d;
      o.position.z = z + dz * d;
    }
    // leaning sets its own direction: away from what the back rests on
    if (a.against === undefined) {
      if (a.facing !== undefined) o.rotation.set(0, rad(num(a.facing, "facing")), 0);
      if (a.face_toward !== undefined) face(o, a.face_toward);
    }
    if (t.prop && a.scale !== undefined) {
      const s = Array.isArray(a.scale) ? a.scale : [a.scale, a.scale, a.scale];
      o.scale.set(...s.map((v, i) => Math.max(0.01, num(v, `scale[${i}]`))));
    }
    // a size in metres: width, height, depth of the prop as it stands (any left out stay)
    if (t.prop && a.size !== undefined) {
      const want = Array.isArray(a.size) ? a.size : [a.size];
      const base = SIZES[o.userData.type] ?? SIZES.box;
      want.slice(0, 3).forEach((v, i) => (o.scale.setComponent(i, Math.max(0.02, num(v, `size[${i}]`)) / base[i])));
    }
    if (t.character && a.height !== undefined) {
      t.character.profile = { ...t.character.profile, height: THREE.MathUtils.clamp(num(a.height, "height"), 0.4, 2.6) };
      t.character.build();
    }
    if (t.character) t.character.ground();
    else {
      stage.placeOnGround(o);
      if (a.y !== undefined && a.on === undefined) o.position.y += num(a.y, "y");
    }
    if (a.on !== undefined) standOn(o, find(a.on));
    if (a.sit_on !== undefined && t.character) sitOn(t.character, findOr(a.sit_on, () => ({ prop: addProp({ type: "box", label: String(a.sit_on) }) })));
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
      id: c.id, name: c.name, pose: c.posed ?? "custom", height: c.profile.height,
      position: c.root.position.toArray().map(round), facing: facingOf(c.root), visible: c.root.visible,
    })),
    props: stage.props.map((p) => ({
      id: p.userData.id, type: p.userData.type, label: p.userData.label,
      position: p.position.toArray().map(round), facing: facingOf(p), scale: p.scale.toArray().map(round),
      size: new THREE.Box3().setFromObject(p).getSize(new THREE.Vector3()).toArray().map(round),
    })),
    camera: { position: stage.camera.position.toArray().map(round), target: stage.orbit.target.toArray().map(round), focal: stage.focal, ratio: stage.ratio },
  });

  const addCharacter = (a = {}) => {
    const c = stage.addCharacter({
      pose: a.pose ? pose(a.pose) : "stand",
      name: typeof a.name === "string" && a.name.trim() ? a.name.trim().slice(0, 40) : undefined,
      // no place given: the stage spreads newcomers out
      at: a.x === undefined && a.z === undefined ? undefined : [a.x ?? 0, 0, a.z ?? 0],
      profile: a.height ? { height: THREE.MathUtils.clamp(num(a.height, "height"), 0.4, 2.6) } : undefined,
    });
    place({ character: c }, { facing: a.facing, ...relations(a) });
    return c;
  };

  const addProp = (a = {}) => {
    const type = known("prop", a.type, PROP_TYPES.map(([t]) => t));
    if (!type) throw new Error(`No prop type "${a.type}". Types: ${PROP_TYPES.map(([t]) => t).join(", ")}.`);
    const p = stage.addProp(type, a.x === undefined && a.z === undefined ? undefined : [a.x ?? 0, 0, a.z ?? 0]);
    // a table, chair or bed named by its word gets a label and a likely size
    if (!a.label && type !== a.type) p.userData.label = p.name = String(a.type).trim().replace(/^\w/, (c) => c.toUpperCase()).slice(0, 40);
    if (typeof a.label === "string" && a.label.trim()) p.userData.label = p.name = a.label.trim().slice(0, 40);
    place({ prop: p }, a);
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
        place({ character }, plain(c));
        if (c.pose && pose(c.pose) !== character.posed) stage.applyPose(pose(c.pose), character);
      } else character = addCharacter(plain(c));
      made.characters.push(character.id);
      if (Object.keys(relations(c)).length) later.push([{ character }, relations(c)]);
    }
    for (const [t, r] of later) place(t, r);
    if (a.camera) camera(a.camera);
    else if (a.clear && (made.characters.length || made.props.length)) stage.snap("three-quarter-left", null);
    return made;
  };

  const clear = () => {
    for (const c of [...stage.characters]) stage.remove({ character: c });
    for (const p of [...stage.props]) stage.remove({ prop: p });
  };

  /** What the frame shows, as a PNG data URL. */
  const look = (a = {}) => {
    const width = Math.round(THREE.MathUtils.clamp(a.width ?? 768, 128, 1600));
    const r = RATIOS[stage.ratio];
    const size = r >= 1 ? [width, Math.round(width / r)] : [Math.round(width * r), width];
    return stage.thumbnail({ position: stage.camera.position, target: stage.orbit.target }, { width: size[0], height: size[1] });
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
      poses: POSES.map((p) => p.id), prop_types: PROP_TYPES.map(([t]) => t), snaps: SNAPS.map(([s]) => s),
      frames: Object.keys(RATIOS), effectors: Object.keys(CHAINS), joints: JOINT_NAMES,
      lens: { focal: stage.focal, vertical_fov: Math.round(fovOf(stage.focal) * 10) / 10 },
    }),
    clear: () => (clear(), describe()),
    layout: (a) => ({ ...layout(a), scene: describe() }),
    add_character: (a) => ({ id: addCharacter(a).id, scene: describe() }),
    add_prop: (a) => ({ id: addProp(a).userData.id, scene: describe() }),
    place: (a) => (place(find(a.id), a), describe()),
    remove: (a) => {
      stage.remove(find(a.id));
      return describe();
    },
    pose: (a) => {
      const { character } = find(a.id);
      if (!character) throw new Error("Only characters take poses.");
      const id = pose(a.pose);
      stage.applyPose(id, character);
      if (a.mirror) stage.mirror(character);
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
      const box = Array.isArray(a.target) ? null : new THREE.Box3().setFromObject(objectOf(find(a.target)));
      const target = box ? box.getCenter(new THREE.Vector3()).setY(box.max.y) : new THREE.Vector3(...a.target.map((v, i) => num(v, `target[${i}]`)));
      character.reach(a.effector, target);
      character.posed = "custom";
      const at = character.joints[a.effector].getWorldPosition(new THREE.Vector3());
      return { id: character.id, effector: a.effector, reached: at.toArray().map(round), off_by: round(at.distanceTo(target)) };
    },
    camera: (a) => (camera(a), describe().camera),
    look,
    undo: () => (stage.undo(), describe()),
    export_glb: async () => ({ glb: await exportGlb(), camera: describe().camera }),
    apply_blender: applyBlender,
  };
  // these read or replace the scene without a step of their own
  const QUIET = new Set(["scene", "look", "export_glb", "undo"]);
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
