// Toaster's 3D models, one object at a time, on a ComfyUI of the person's own (the GPU they already run). An object arrives as four
// views of itself (front, back, left, right: the four cells of its multi-view sheet, cut by the page) and leaves as a textured GLB,
// through the three Trellis2 workflows in workflows/3d/, one after the other, each one's mesh the next one's input:
//   shape.api.json    Trellis2-MVShapegen-v2   the four views → a shape (sparse structure, 512, then a cascade)
//   refine.api.json   Trellis2-ShapeRefiner-v2.2   the shape refined against the front view, its surface closed and repaired
//   texture.api.json  Trellis2-MVTexturing-v2  the refined shape textured from the four views, its colours matched to them
// They are the graphs of the ComfyUI UI converted to its API format, kept readable (see workflows/3d/README.md). Nothing here is paid:
// it is the person's own GPU, and the models are open weights (Microsoft's TRELLIS.2). A server with no ComfyUI of its own (a judges'
// copy) answers `local.ok: false` from /target, and the page makes the model on Comfy Cloud instead (Pixal3D's template).
//
// A job is kept in memory while it runs and for an hour after; the GLB it made is kept in the library's models folder
// (/media/models/<hash>.glb), and the path of each stage's file, as ComfyUI saw it, is in the job for anyone who wants to open it.

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** How hard a model is made: "web" is light enough to place several in a scene and open in a page; "fine" is the workflows as saved. */
export type Quality = "web" | "fine";

const STAGES = [
  { id: "shape", title: "Shape from the four views", weight: 0.4 },
  { id: "refine", title: "Refining the shape", weight: 0.25 },
  { id: "texture", title: "Texturing", weight: 0.35 },
] as const;
type Stage = (typeof STAGES)[number]["id"];

const NEEDS = ["Trellis2LoadModel", "OtiaTrellis2ShapeMultiView", "OtiaTrellis2MeshRefiner", "OtiaTrellis2MeshTexturingMultiView", "KAISaveMesh", "RMBG"];
const VIEWS = ["front", "back", "left", "right"] as const;
type View = (typeof VIEWS)[number];

export interface Job {
  id: string;
  name: string;
  quality: Quality;
  status: "running" | "done" | "failed";
  progress: number;
  stage: Stage | null;
  stages: { id: Stage; title: string; status: "waiting" | "running" | "done" | "failed"; path?: string }[];
  outputs: { kind: "model"; url: string; file: string; path?: string }[];
  error?: string;
  at: number;
}

type Graph = Record<string, { class_type: string; inputs: Record<string, any>; _meta?: unknown }>;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** The numbers each quality changes in the saved graphs (a node id → its inputs). "fine" changes none: the graphs as saved. */
export function tune(stage: Stage, graph: Graph, quality: Quality, seed: number): Graph {
  const g = clone(graph);
  const set = (node: string, inputs: Record<string, unknown>) => g[node] && Object.assign(g[node].inputs, inputs);
  if (stage === "shape") {
    // (each sampler has a seed of its own, one apart, as the workflow saved them)
    set("11", { seed });
    set("12", { seed: seed + 1 });
    set("13", { seed: seed + 2 });
    set("18", { seed: seed + 3 });
    if (quality === "web") {
      // the 1024 cascade is the delivery (the 1536 one, its decode and the two sampler branches after them are left out), fewer steps
      delete g["18"];
      delete g["19"];
      set("23", { mesh: ["14", 0], target_face_num: 150000 });
      set("11", { sparse_structure_steps: 16 });
      set("12", { shape_steps: 16 });
      set("13", { shape_steps: 16 });
    }
  }
  if (stage === "refine") {
    set("15", { seed });
    if (quality === "web") {
      set("15", { resolution: 1024, shape_steps: 16 });
      set("19", { target_face_num: 150000 });
      set("36", { resolution: 1024, target_faces: 100000 });
    }
  }
  if (stage === "texture") {
    set("13", { seed });
    if (quality === "web") {
      set("11", { target_face_num: 100000 });
      set("13", { texture_steps: 20, resolution: 1024, texture_size: 2048 });
    }
  }
  return g;
}

export function createToaster3d({ data, root, photoPath }: { data: string; root: string; photoPath: (file: string) => string }) {
  const jobs = new Map<string, Job>();
  const base = () => (process.env.COMFYUI_URL?.trim() || "http://127.0.0.1:8188").replace(/\/$/, "");
  const graphs: Partial<Record<Stage, Graph>> = {};
  const graphOf = async (stage: Stage): Promise<Graph> => (graphs[stage] ??= JSON.parse(await readFile(join(root, "workflows", "3d", `${stage}.api.json`), "utf8")));

  // ---------------------------------------------------------------- is there a ComfyUI to make it on?
  let seen: { at: number; answer: any } | null = null;
  async function target() {
    if (seen && Date.now() - seen.at < 15_000) return seen.answer;
    const url = base();
    let answer: any;
    try {
      const miss: string[] = [];
      for (const node of NEEDS) {
        const r = await fetch(`${url}/object_info/${node}`, { signal: AbortSignal.timeout(4000) });
        if (!r.ok || !(await r.json())?.[node]) miss.push(node);
      }
      answer = miss.length
        ? { local: { ok: false, url, why: `That ComfyUI has no ${miss.join(", ")}: the Trellis2 workflows need ComfyUI-Trellis2 (and its Otia nodes) and ComfyUI-RMBG.` } }
        : { local: { ok: true, url } };
    } catch {
      answer = { local: { ok: false, url, why: `No ComfyUI answers at ${url}. Start yours (or set COMFYUI_URL), or make the model on Comfy Cloud.` } };
    }
    seen = { at: Date.now(), answer };
    return answer;
  }

  // ---------------------------------------------------------------- one prompt, to its end
  async function upload(name: string, bytes: Buffer) {
    const form = new FormData();
    form.append("image", new Blob([new Uint8Array(bytes)], { type: "image/png" }), name);
    form.append("overwrite", "true");
    const r = await fetch(`${base()}/upload/image`, { method: "POST", body: form });
    if (!r.ok) throw new Error(`ComfyUI refused a view (${r.status}).`);
    return String((await r.json()).name);
  }

  /** Runs one graph on ComfyUI and answers its outputs. `onFraction` hears how far along it is (0 to 1), from ComfyUI's own events. */
  async function runGraph(graph: Graph, onFraction: (f: number) => void): Promise<Record<string, any>> {
    const client = randomUUID();
    const total = Object.keys(graph).length;
    let done = 0;
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(`${base().replace(/^http/, "ws")}/ws?clientId=${client}`);
      ws.onmessage = (ev) => {
        if (typeof ev.data !== "string") return;
        try {
          const m = JSON.parse(ev.data);
          if (m.type === "execution_cached") done += (m.data?.nodes ?? []).length;
          else if (m.type === "executing" && m.data?.node) onFraction(Math.min(0.99, done++ / total));
          else if (m.type === "progress" && m.data?.max) onFraction(Math.min(0.99, (done + m.data.value / m.data.max) / total));
        } catch {}
      };
    } catch {
      ws = null;
    }
    try {
      const r = await fetch(`${base()}/prompt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: graph, client_id: client }) });
      const text = await r.text();
      if (!r.ok) {
        let why = text.slice(0, 300);
        try {
          const j = JSON.parse(text);
          why = [j.error?.message, ...Object.values(j.node_errors ?? {}).map((n: any) => `${n.class_type}: ${n.errors?.[0]?.message}`)].filter(Boolean).join("; ") || why;
        } catch {}
        throw new Error(`ComfyUI refused the workflow: ${why}`);
      }
      const id = JSON.parse(text).prompt_id as string;
      for (;;) {
        await new Promise((ok) => setTimeout(ok, 2500));
        const h = await fetch(`${base()}/history/${id}`).then((x) => x.json()).catch(() => null);
        const entry = h?.[id];
        if (!entry) continue;
        if (entry.status?.status_str === "error") {
          const e = (entry.status.messages ?? []).find((m: any) => m[0] === "execution_error")?.[1];
          throw new Error(e ? `${e.node_type ?? "A node"} failed: ${String(e.exception_message ?? "").trim().slice(0, 300)}` : "ComfyUI could not finish it.");
        }
        if (entry.status?.completed || entry.outputs) return entry.outputs ?? {};
      }
    } finally {
      try {
        ws?.close();
      } catch {}
    }
  }

  const keepGlb = async (file: { filename: string; subfolder?: string; type?: string }) => {
    const q = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder ?? "", type: file.type ?? "output" });
    const r = await fetch(`${base()}/view?${q}`);
    if (!r.ok) throw new Error(`The model is saved by ComfyUI but could not be read back (${r.status}).`);
    const bytes = Buffer.from(await r.arrayBuffer());
    const name = `${createHash("sha1").update(bytes).digest("hex").slice(0, 16)}.glb`;
    await mkdir(join(data, "models"), { recursive: true });
    await writeFile(join(data, "models", name), bytes);
    return name;
  };

  // ---------------------------------------------------------------- a job: the three workflows, one after the other
  async function make(body: any): Promise<Job> {
    const views = body?.views ?? {};
    const files = VIEWS.map((v) => [v, String(views[v] ?? "")] as [View, string]);
    if (files.some(([, f]) => !/^[\w.-]+$/.test(f))) throw Object.assign(new Error("Send the four views: front, back, left and right."), { status: 400 });
    const t = (await target()).local;
    if (!t.ok) throw Object.assign(new Error(t.why), { status: 501 });
    const quality: Quality = body.quality === "fine" ? "fine" : "web";
    const seed = Number.isFinite(Number(body.seed)) ? Math.abs(Math.floor(Number(body.seed))) % 2 ** 31 : 12345;
    const job: Job = {
      id: randomUUID().slice(0, 12),
      name: String(body.name ?? "object").slice(0, 60),
      quality,
      status: "running",
      progress: 0.01,
      stage: "shape",
      stages: STAGES.map((s) => ({ id: s.id, title: s.title, status: "waiting" })),
      outputs: [],
      at: Date.now(),
    };
    jobs.set(job.id, job);
    for (const [k, j] of jobs) if (Date.now() - j.at > 3600_000) jobs.delete(k);
    void (async () => {
      try {
        const names = {} as Record<View, string>;
        for (const [v, file] of files) names[v] = await upload(`comfyture-${job.id}-${v}.png`, await readFile(photoPath(file)));
        const loaders: Record<Stage, Record<string, View>> = {
          shape: { "1": "front", "3": "back", "5": "left", "7": "right" },
          refine: { "1": "front" },
          texture: { "1": "front", "3": "back", "5": "left", "7": "right" },
        };
        let mesh = "";
        let last: { filename: string; subfolder?: string; type?: string } | null = null;
        let before = 0;
        for (const s of STAGES) {
          const stage = job.stages.find((x) => x.id === s.id)!;
          stage.status = "running";
          job.stage = s.id;
          const g = tune(s.id, await graphOf(s.id), quality, seed);
          for (const [node, view] of Object.entries(loaders[s.id])) g[node].inputs.image = names[view];
          // the mesh of the stage before is this stage's input (refine's loader is node 25, texture's is node 10)
          if (s.id === "refine") g["25"].inputs.glb_path = mesh;
          if (s.id === "texture") g["10"].inputs.glb_path = mesh;
          const saver = Object.keys(g).find((k) => g[k].class_type === "KAISaveMesh" && !Object.values(g).some((n) => Object.values(n.inputs).some((v) => Array.isArray(v) && v[0] === k)))!;
          g[saver].inputs.filename_prefix = `3D/Comfyture/${job.id}-${s.id}`;
          const out = await runGraph(g, (f) => (job.progress = Math.max(job.progress, Math.min(0.99, before + f * s.weight))));
          const o = out[saver];
          mesh = o?.text?.[0];
          last = o?.model_file?.[0] ?? null;
          if (!mesh || !last) throw new Error(`${s.title} made no mesh.`);
          stage.status = "done";
          stage.path = mesh;
          before += s.weight;
          job.progress = Math.min(0.99, before);
        }
        const file = await keepGlb(last!);
        job.outputs = [{ kind: "model", url: `/media/models/${file}`, file, path: mesh }];
        job.status = "done";
        job.progress = 1;
        job.stage = null;
      } catch (e: any) {
        job.status = "failed";
        job.error = String(e?.message ?? e).slice(0, 400);
        const open = job.stages.find((x) => x.status === "running");
        if (open) open.status = "failed";
      }
    })();
    return job;
  }

  /** The routes under /api/toaster/3d/: GET target, POST make, GET job/<id>. */
  async function handle(method: string, rest: string, body: any): Promise<{ status: number; body: unknown }> {
    try {
      if (method === "GET" && rest === "target") return { status: 200, body: await target() };
      if (method === "POST" && rest === "make") return { status: 202, body: await make(body) };
      const m = rest.match(/^job\/([\w-]+)$/);
      if (method === "GET" && m) {
        const job = jobs.get(m[1]);
        return job ? { status: 200, body: job } : { status: 404, body: { error: "That job is gone: the server was restarted, or it is over an hour old." } };
      }
      return { status: 404, body: { error: "Not found." } };
    } catch (e: any) {
      return { status: e.status ?? 500, body: { error: String(e?.message ?? e) } };
    }
  }
  return { handle, target, make, jobs };
}
