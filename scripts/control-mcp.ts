// An MCP server (stdio) that lets an agent stage scenes in Control: characters
// in poses, props, the camera and the frame, a picture of the shot, and the
// round trip to Blender. It talks to a running Comfyture server, which relays
// each command to the open Control page.
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
  sit_on: { type: "string", description: "Seated on this. A box or cylinder becomes the seat, sized and moved under the hips." },
  on: { type: "string", description: "Standing on this, or (a prop) resting on top of it." },
  between: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 2, description: "Halfway between two names." },
  next_to: { type: "string", description: "Beside this, on side (left, right, front, behind) at distance metres (default 1)." },
  side: { type: "string" },
  distance: { type: "number" },
};
const character = {
  type: "object",
  properties: {
    name: { type: "string" }, pose: { type: "string", description: "A pose id from control_scene (stand, walk, run, sit, point, ...)." },
    ...xz, facing: { type: "number" }, face_toward: toward, height: { type: "number", description: "Metres, default 1.75." }, ...relations,
  },
};
const prop = {
  type: "object",
  properties: {
    type: { type: "string", description: "box, cylinder, sphere, plane (a wall) or stairs." }, label: { type: "string" },
    ...xz, y: { type: "number", description: "Lift above the ground, e.g. to stack on another prop." },
    facing: { type: "number" }, face_toward: toward,
    size: { type: "array", items: { type: "number" }, minItems: 1, maxItems: 3, description: "[width, height, depth] in metres. A box is 0.6 m, a wall 2.4 × 2.2 m." },
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
    description: `Reads the Control stage: characters, props (with their sizes) and the camera, plus the poses, prop types, camera snaps, frames, joints and IK effectors it knows. Read it first. ${COORDS}`,
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
    description: `Moves, turns or resizes a character or prop, by numbers or by relation (against, sit_on, on, between, next_to). Characters stay on the ground; props can be lifted with y and sized; characters take a new height. ${COORDS}`,
    inputSchema: { type: "object", properties: { id, ...xz, y: { type: "number" }, facing: { type: "number" }, face_toward: toward, size: prop.properties.size, scale: prop.properties.scale, height: { type: "number" }, ...relations }, required: ["id"] },
    run: op("place"),
  },
  {
    name: "control_pose",
    description: "Puts a character in a preset pose, optionally mirrored left to right.",
    inputSchema: { type: "object", properties: { id, pose: { type: "string" }, mirror: { type: "boolean" } }, required: ["id", "pose"] },
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
    description: "A picture of what the camera frame shows now, to check the layout.",
    inputSchema: { type: "object", properties: { width: { type: "number", description: "Pixels on the long side, default 768." } } },
    run: async (args) => {
      const url: string = await call("/api/control/command", { op: "look", args });
      return [{ type: "image", data: url.slice(url.indexOf(",") + 1), mimeType: "image/png" }];
    },
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
        instructions: "Stages reference scenes in Comfyture's Control page (it must be open in a browser). Read control_scene, block the scene with control_layout, check it with control_look, then refine.",
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
