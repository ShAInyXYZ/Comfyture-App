// The stage, driven from outside. The server relays an agent's commands over
// an event stream; each one runs as one step of history and answers with what
// it did. Units are metres and degrees; Y is up, X is screen right and Z points
// at the default camera. Facing 0 looks at the camera, 90 looks right (+X).

import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { RATIOS, SNAPS, fovOf } from "./stage.js";
import { POSES, poseById } from "./poses.js";
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

export function connectRemote(stage, { onActivity } = {}) {
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

  /** Moves and turns a character or prop: x, y, z, facing (degrees), face_toward, scale. */
  const place = (t, a) => {
    const o = objectOf(t);
    if (a.x !== undefined) o.position.x = num(a.x, "x");
    if (a.z !== undefined) o.position.z = num(a.z, "z");
    if (a.facing !== undefined) o.rotation.set(0, rad(num(a.facing, "facing")), 0);
    if (a.face_toward !== undefined) face(o, a.face_toward);
    if (t.prop && a.scale !== undefined) {
      const s = Array.isArray(a.scale) ? a.scale : [a.scale, a.scale, a.scale];
      o.scale.set(...s.map((v, i) => Math.max(0.01, num(v, `scale[${i}]`))));
    }
    if (t.character && a.height !== undefined) {
      t.character.profile = { ...t.character.profile, height: THREE.MathUtils.clamp(num(a.height, "height"), 0.4, 2.6) };
      t.character.build();
    }
    if (t.character) t.character.ground();
    else {
      stage.placeOnGround(o);
      if (a.y !== undefined) o.position.y += num(a.y, "y");
    }
  };

  const describe = () => ({
    characters: stage.characters.map((c) => ({
      id: c.id, name: c.name, height: c.profile.height,
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
    if (a.pose && !poseById(a.pose)) throw new Error(`No pose "${a.pose}". Poses: ${POSES.map((p) => p.id).join(", ")}.`);
    const c = stage.addCharacter({
      pose: a.pose ?? "stand",
      name: typeof a.name === "string" && a.name.trim() ? a.name.trim().slice(0, 40) : undefined,
      at: [a.x ?? 0, 0, a.z ?? 0],
      profile: a.height ? { height: THREE.MathUtils.clamp(num(a.height, "height"), 0.4, 2.6) } : undefined,
    });
    place({ character: c }, { facing: a.facing, face_toward: a.face_toward });
    return c;
  };

  const addProp = (a = {}) => {
    if (!PROP_TYPES.some(([t]) => t === a.type)) throw new Error(`No prop type "${a.type}". Types: ${PROP_TYPES.map(([t]) => t).join(", ")}.`);
    const p = stage.addProp(a.type, [a.x ?? 0, 0, a.z ?? 0]);
    if (typeof a.label === "string" && a.label.trim()) p.userData.label = p.name = a.label.trim().slice(0, 40);
    place({ prop: p }, a);
    return p;
  };

  const camera = (a = {}) => {
    if (a.ratio !== undefined) {
      if (!RATIOS[a.ratio]) throw new Error(`No frame "${a.ratio}". Frames: ${Object.keys(RATIOS).join(", ")}.`);
      stage.setRatio(a.ratio);
    }
    if (a.focal !== undefined) stage.setFocal(num(a.focal, "focal"));
    if (a.snap !== undefined) {
      if (!SNAPS.some(([s]) => s === a.snap)) throw new Error(`No snap "${a.snap}". Snaps: ${SNAPS.map(([s]) => s).join(", ")}.`);
      stage.snap(a.snap, a.of && a.of !== "all" ? find(a.of).character ?? null : a.of === "all" ? null : undefined);
    }
    if (a.position || a.target) {
      if (a.position) stage.camera.position.fromArray(a.position.map((v, i) => num(v, `position[${i}]`)));
      if (a.target) stage.orbit.target.fromArray(a.target.map((v, i) => num(v, `target[${i}]`)));
      stage.orbit.update();
      stage.emit("camera");
      stage.render();
    }
  };

  /** A whole layout in one step: optionally clear, then characters, props and the camera. */
  const layout = (a = {}) => {
    if (a.clear) clear();
    const made = { characters: [], props: [] };
    // turning toward something placed later in the same layout waits until everything exists
    const later = [];
    for (const p of a.props ?? []) {
      const prop = addProp({ ...p, face_toward: undefined });
      made.props.push(prop.userData.id);
      if (p.face_toward !== undefined) later.push([{ prop }, p.face_toward]);
    }
    for (const c of a.characters ?? []) {
      const character = addCharacter({ ...c, face_toward: undefined });
      made.characters.push(character.id);
      if (c.face_toward !== undefined) later.push([{ character }, c.face_toward]);
    }
    for (const [t, toward] of later) place(t, { face_toward: toward });
    if (a.camera) camera(a.camera);
    else if (made.characters.length || made.props.length) stage.snap("three-quarter-left", null);
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
      if (!poseById(a.pose)) throw new Error(`No pose "${a.pose}". Poses: ${POSES.map((p) => p.id).join(", ")}.`);
      stage.applyPose(a.pose, character);
      if (a.mirror) stage.mirror(character);
      return { id: character.id, pose: a.pose };
    },
    joint: (a) => {
      const { character } = find(a.id);
      if (!character || !JOINT_NAMES.includes(a.joint)) throw new Error(`Name a character and a joint: ${JOINT_NAMES.join(", ")}.`);
      const [x, y, z] = (a.rotation ?? []).map((v, i) => rad(num(v, `rotation[${i}]`)));
      character.joints[a.joint].quaternion.setFromEuler(new THREE.Euler(x ?? 0, y ?? 0, z ?? 0, "XYZ"));
      character.constrain(a.joint);
      character.ground();
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
