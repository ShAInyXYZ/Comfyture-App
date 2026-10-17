// An MCP server (stdio) that lets an agent stage scenes on the Stage: characters
// (body types, colours, poses and pose sliders), blockout assets, the camera, the
// frame and a timeline for video (camera moves, walking), a picture of the shot
// in any control channel, and the round trip to Blender. It talks to a running
// Comfyture server, which relays each command to the app (the Stage loads in it).
//
//   node scripts/control-mcp.ts            COMFYTURE_URL defaults to http://127.0.0.1:5177

import { createInterface } from "node:readline";

const BASE = (process.env.COMFYTURE_URL ?? "http://127.0.0.1:5177").replace(/\/$/, "");

const COORDS = "Metres, Y up, ground at y = 0. X is screen right and +Z points at the default camera. Facing is degrees about Y: 0 looks at the camera (+Z), 90 looks right (+X), 180 looks away.";
const xz = { x: { type: "number" }, z: { type: "number" } };
const toward = { description: "An id or name to turn toward, or an [x, z] point.", anyOf: [{ type: "string" }, { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 }] };
// where something is relative to others; the page works out the numbers, and a relation wins over x and z
const relations = {
  against: { type: "string", description: "Back against this (a wall, a pillar): turned away from it, touching it." },
  sit_on: { type: "string", description: "Seated on this: a chair, sofa, bench, stool, bed edge, step or crate takes the body at a free place; a plain box becomes the seat. A seat that is not there is made." },
  on: { type: "string", description: "Standing on this, or (a prop) resting on top of it." },
  between: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 2, description: "Halfway between two names." },
  next_to: { type: "string", description: "Beside this, on side (left, right, front, behind), distance metres from its edge (default 0.3)." },
  side: { type: "string" },
  distance: { type: "number" },
};
const params = { type: "object", description: "Pose sliders, degrees (crouch 0 to 1): look, nod, tilt, lean, twist, side, arms, reach, elbows, stance, step, crouch.", additionalProperties: { type: "number" } };
const hold = { description: "What the hands hold: a hand prop (phone, cup, book, camera, sword, pistol, umbrella, bag, guitar, steering-wheel) for the right hand, { right, left }, or null for empty hands. Poses that hold something bring it.", anyOf: [{ type: "string" }, { type: "null" }, { type: "object", properties: { right: { type: ["string", "null"] }, left: { type: ["string", "null"] } } }] };
const character = {
  type: "object",
  properties: {
    name: { type: "string" }, pose: { type: "string", description: "A pose id from control_scene (stand, talk, walk, sit, lean-back, hands-in-pockets, point, ...)." },
    body: { type: "string", description: "man, woman, teen, child, toddler, elder, heavy or athletic." },
    color: { type: "string", description: "coral, teal, amber, violet, green, pink, blue or tan: one per character, for the colour ID pass." },
    rig: { type: "string", description: "One of the user's own rigged characters (control_scene lists them under user_characters), by id or name, in place of a body type." },
    ...xz, facing: { type: "number" }, face_toward: toward, height: { type: "number", description: "Metres; the body type sets it." }, params, hold, ...relations,
  },
};
const prop = {
  type: "object",
  properties: {
    type: { type: "string", description: "An asset from control_scene: chair, armchair, sofa, stool, bench, table, desk, counter, bed, shelf, lamp, tv, fridge, stove, kitchen-island, office-chair, wardrobe, bathtub, piano, plane (a wall), doorway, window, door, pillar, arch, stairs, ramp, platform, floor, fence, car, tree, pine-tree, palm-tree, bush, rock, streetlamp, bus-stop, trash-bin, mailbox, phone-booth, tent, campfire, rowing-boat, crate, barrel, traffic-cone, box, cylinder, sphere, cone." }, label: { type: "string" },
    ...xz, y: { type: "number", description: "Lift above the ground, e.g. to stack on another prop." },
    facing: { type: "number" }, face_toward: toward,
    size: { type: "array", items: { type: "number" }, minItems: 1, maxItems: 3, description: "[width, height, depth] in metres; the asset is rebuilt to it (a table keeps its legs)." },
    params: { type: "object", description: "The asset's own sizes by name (steps, seat, open...), as control_scene lists them.", additionalProperties: { type: "number" } },
    scale: { description: "One number or [x, y, z].", anyOf: [{ type: "number" }, { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 }] },
    ...relations,
  },
  required: ["type"],
};
const camera = {
  type: "object",
  properties: {
    snap: { type: "string", description: "front, three-quarter-left, three-quarter-right, side, back, top, low, high, over-shoulder, close-up." },
    of: { type: "string", description: "The character the snap frames, or \"all\" for the whole scene." },
    focal: { type: "number", description: "Full-frame focal length in mm, 14 to 200." },
    ratio: { type: "string", description: "16:9, 9:16, 1:1, 3:2, 2:3, 4:3, 3:4 or 21:9." },
    position: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 },
    target: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 },
    move: { type: "string", description: "A camera move over the shot, from the camera as it is (after the snap): see control_camera_move." },
  },
};
const id = { type: "string", description: "A character or prop id, or its name." };

type Tool = { name: string; description: string; inputSchema: object; run: (a: any) => Promise<Content[]> };
type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

async function call(path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new Error(`Comfyture is not running at ${BASE}. Start it with npm start.`);
  });
  const answer = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(answer.error ?? `${res.status} ${res.statusText}`);
  return answer.result ?? answer;
}
const say = (value: unknown): Content[] => [{ type: "text", text: JSON.stringify(value, null, 1) }];
const op = (name: string) => async (args: any) => say(await call("/api/control/command", { op: name, args }));

const TOOLS: Tool[] = [
  {
    name: "control_scene",
    description: `Reads the Stage: characters (body, colour, pose, sliders, keys), props (with their sizes), the camera and the timeline, plus the poses, assets, body types, colours, sliders, snaps, moves, frames, joints and channels it knows. Read it first. ${COORDS}`,
    inputSchema: { type: "object", properties: {} },
    run: op("scene"),
  },
  {
    name: "control_layout",
    description: `Stages a whole scene in one step (one undo): optionally clears the stage, adds props and characters, then sets the camera (a three-quarter view of everything if none is given). Use it to block a basic scene layout. ${COORDS}`,
    inputSchema: {
      type: "object",
      properties: { clear: { type: "boolean" }, characters: { type: "array", items: character }, props: { type: "array", items: prop }, camera },
    },
    run: op("layout"),
  },
  {
    name: "control_add_character",
    description: `Adds a mannequin in a pose. ${COORDS}`,
    inputSchema: character,
    run: op("add_character"),
  },
  {
    name: "control_add_prop",
    description: `Adds a prop (box, cylinder, sphere, wall, stairs) standing on the ground. ${COORDS}`,
    inputSchema: prop,
    run: op("add_prop"),
  },
  {
    name: "control_place",
    description: `Moves, turns, resizes, renames or recolours a character or prop, by numbers or by relation (against, sit_on, on, between, next_to). A character also takes a body type, a height and pose sliders; a prop takes a size or its own params. ${COORDS}`,
    inputSchema: { type: "object", properties: { id, name: { type: "string", description: "A new name." }, ...xz, y: { type: "number" }, facing: { type: "number" }, face_toward: toward, size: prop.properties.size, params: { type: "object", description: "Pose sliders for a character, sizes for a prop.", additionalProperties: { type: "number" } }, scale: prop.properties.scale, height: { type: "number" }, body: character.properties.body, color: character.properties.color, hold, ...relations }, required: ["id"] },
    run: op("place"),
  },
  {
    name: "control_pose",
    description: "Puts a character in a pose from the library (or one saved on the Stage, by its name), optionally mirrored, with pose sliders laid over it. With params alone, only the sliders change.",
    inputSchema: { type: "object", properties: { id, pose: { type: "string" }, mirror: { type: "boolean" }, params }, required: ["id"] },
    run: op("pose"),
  },
  {
    name: "control_set_joint",
    description: "Sets one joint's local rotation as XYZ Euler degrees (the joint limits still apply), e.g. turn the Head or raise the RightArm. Joint names come from control_scene.",
    inputSchema: { type: "object", properties: { id, joint: { type: "string" }, rotation: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 } }, required: ["id", "joint", "rotation"] },
    run: op("joint"),
  },
  {
    name: "control_reach",
    description: "Moves a hand or foot (LeftHand, RightHand, LeftFoot, RightFoot) to a point by IK, e.g. a hand on a table or a foot on a stair. The target is [x, y, z] or the id of something to reach for.",
    inputSchema: { type: "object", properties: { id, effector: { type: "string" }, target: { anyOf: [{ type: "string" }, { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 }] } }, required: ["id", "effector", "target"] },
    run: op("reach"),
  },
  {
    name: "control_remove",
    description: "Removes a character or prop.",
    inputSchema: { type: "object", properties: { id }, required: ["id"] },
    run: op("remove"),
  },
  {
    name: "control_clear",
    description: "Empties the stage.",
    inputSchema: { type: "object", properties: {} },
    run: op("clear"),
  },
  {
    name: "control_camera",
    description: `Frames the shot: a snap of a character or the whole scene, the lens, the output frame, or an exact position and target. ${COORDS}`,
    inputSchema: camera,
    run: op("camera"),
  },
  {
    name: "control_look",
    description: "A picture of what the camera frame shows, to check the layout: clay, or a control channel (id, depth, normal, pose, lines, mask), at the playhead or at time t.",
    inputSchema: { type: "object", properties: { width: { type: "number", description: "Pixels on the long side, default 768." }, channel: { type: "string", description: "clay, id, depth, normal, pose, lines or mask." }, t: { type: "number", description: "Seconds into the shot." } } },
    run: async (args) => {
      const url: string = await call("/api/control/command", { op: "look", args });
      return [{ type: "image", data: url.slice(url.indexOf(",") + 1), mimeType: "image/png" }];
    },
  },
  {
    name: "control_camera_move",
    description: "A camera move over the shot (the timeline): the camera as it is now is the start, the move sets the end. Moves: locked, push-in, pull-out, orbit-left, orbit-right, crane-up, crane-down, truck-left, truck-right, tilt-up, tilt-down, zoom-in, zoom-out, handheld.",
    inputSchema: { type: "object", properties: { move: { type: "string" }, amount: { type: "number", description: "Scales the move, 0.1 to 3 (default 1)." }, duration: { type: "number", description: "The shot's length in seconds." } }, required: ["move"] },
    run: op("camera_move"),
  },
  {
    name: "control_move_to",
    description: "A character walks (or runs) over the shot: keys where they are at start and where they arrive at end (seconds), facing the way they go; the timeline lays a walk cycle over their pose. to is a name (they stop short of it) or an [x, z] point.",
    inputSchema: { type: "object", properties: { id, to: toward, side: { type: "string" }, distance: { type: "number" }, start: { type: "number" }, end: { type: "number" }, gait: { type: "string", description: "walk, run or none." }, pose: { type: "string", description: "The pose they arrive in." }, face_toward: toward }, required: ["id", "to"] },
    run: op("move_to"),
  },
  {
    name: "control_key",
    description: "Records a key for a character, a prop or \"camera\" at time t (default the playhead): the timeline blends between keys. Edits to something that has keys are recorded at the playhead too.",
    inputSchema: { type: "object", properties: { id: { type: "string", description: "A name, or \"camera\"." }, t: { type: "number" } } },
    run: op("key"),
  },
  {
    name: "control_duration",
    description: "Sets how long the shot is, in seconds (1 to 20).",
    inputSchema: { type: "object", properties: { seconds: { type: "number" } }, required: ["seconds"] },
    run: op("duration"),
  },
  {
    name: "control_undo",
    description: "Undoes the last change on the stage.",
    inputSchema: { type: "object", properties: {} },
    run: op("undo"),
  },
  {
    name: "control_blender_status",
    description: "Whether Blender is reachable (its MCP add-on listening on localhost:9876), its version, and how much of the stage is in it.",
    inputSchema: { type: "object", properties: {} },
    run: async () => say(await call("/api/control/blender/status", {})),
  },
  {
    name: "control_to_blender",
    description: "Sends the stage to Blender: replaces the \"Comfyture Control\" collection with the mannequins and props, and sets the scene camera, lens and resolution to the shot. Refine it there (for example with Blender's own MCP tools), then bring it back with control_from_blender.",
    inputSchema: { type: "object", properties: {} },
    run: async () => say(await call("/api/control/blender/push", {})),
  },
  {
    name: "control_from_blender",
    description: "Brings the \"Comfyture Control\" collection back from Blender: positions, turns, joint rotations, prop sizes and the scene camera. Objects added in Blender are listed but not brought back.",
    inputSchema: { type: "object", properties: {} },
    run: async () => say(await call("/api/control/blender/pull", {})),
  },
];

// ------------------------------------------------------------------ JSON-RPC over stdio

const send = (message: object) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");

async function handle(msg: { id?: number | string; method: string; params?: any }) {
  switch (msg.method) {
    case "initialize":
      return {
        protocolVersion: msg.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "comfyture-control", version: "0.1.0" },
        instructions: "Stages reference scenes on Comfyture's Stage (the app must be open in a browser). Read control_scene, block the scene with control_layout, check it with control_look (clay or a channel), then refine; for a video, add control_camera_move and control_move_to.",
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) };
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === msg.params?.name);
      if (!tool) throw Object.assign(new Error(`Unknown tool ${msg.params?.name}`), { code: -32602 });
      try {
        return { content: await tool.run(msg.params?.arguments ?? {}) };
      } catch (error) {
        return { content: [{ type: "text", text: (error as Error).message }], isError: true };
      }
    }
    default:
      throw Object.assign(new Error(`Method not found: ${msg.method}`), { code: -32601 });
  }
}

createInterface({ input: process.stdin }).on("line", async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return send({ id: null, error: { code: -32700, message: "Parse error" } });
  }
  if (msg.id === undefined) return; // a notification: nothing to answer
  try {
    send({ id: msg.id, result: await handle(msg) });
  } catch (error) {
    send({ id: msg.id, error: { code: (error as { code?: number }).code ?? -32603, message: (error as Error).message } });
  }
});
