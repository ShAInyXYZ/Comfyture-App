// Props and set pieces: simple shapes in the same clay as the mannequins,
// so a reference reads as one staged scene.

import * as THREE from "three";

export const PROP_TYPES = [
  ["box", "Box"], ["cylinder", "Cylinder"], ["sphere", "Sphere"], ["plane", "Wall"], ["stairs", "Stairs"],
];

const clay = () => new THREE.MeshStandardMaterial({ color: "#a9a59e", roughness: 0.85 });

function stairs() {
  const group = new THREE.Group();
  const steps = 5;
  for (let i = 0; i < steps; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(1, 0.18 * (i + 1), 0.3), clay());
    step.position.set(0, (0.18 * (i + 1)) / 2, -i * 0.3);
    step.castShadow = step.receiveShadow = true;
    group.add(step);
  }
  return group;
}

const SHAPES = {
  box: () => new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), clay()),
  cylinder: () => new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 32), clay()),
  sphere: () => new THREE.Mesh(new THREE.SphereGeometry(0.35, 32, 20), clay()),
  plane: () => new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 0.08), clay()),
  stairs,
};

let count = 0;

export function makeProp(type, id) {
  const object = (SHAPES[type] ?? SHAPES.box)();
  object.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });
  const name = PROP_TYPES.find(([t]) => t === type)?.[1] ?? "Prop";
  object.name = name;
  object.userData = {
    prop: true,
    id: id ?? `prop-${Date.now().toString(36)}-${count++}`,
    type,
    label: name,
    toJSON: () => ({
      id: object.userData.id,
      type,
      label: object.userData.label,
      position: object.position.toArray(),
      quaternion: object.quaternion.toArray(),
      scale: object.scale.toArray(),
      visible: object.visible,
    }),
  };
  // child meshes point back at their prop, so a click on a stair picks the stairs
  object.traverse((o) => {
    if (o !== object) o.userData.propRoot = object;
  });
  return object;
}

export function propFromJSON(data) {
  const object = makeProp(data.type, data.id);
  object.userData.label = data.label ?? object.userData.label;
  object.position.fromArray(data.position ?? [0, 0, 0]);
  object.quaternion.fromArray(data.quaternion ?? [0, 0, 0, 1]);
  object.scale.fromArray(data.scale ?? [1, 1, 1]);
  object.visible = data.visible !== false;
  return object;
}
