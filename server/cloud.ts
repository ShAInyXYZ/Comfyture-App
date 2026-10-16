// Comfy Cloud model library. Files missing from Cloud's shared library are
// imported into the workspace once (Cloud fetches them from Hugging Face
// itself), and workflows that name them by file are pointed at the imported
// copies before they are submitted.

import type { Graph } from "./workflows.ts";

const API = "https://cloud.comfy.org/api";

/** Models the workflows load that Cloud's shared library does not carry. */
export const IMPORTS = [
  {
    file: "ltx-2.5-22b-ic-lora-pixel-spatial-upscaler-x2-1.0.safetensors",
    folder: "loras",
    url: "https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Pixel-Spatial-Upscaler/resolve/main/ltx-2.5-22b-ic-lora-pixel-spatial-upscaler-x2-1.0.safetensors",
  },
];

const MODEL_INPUTS = ["lora_name", "unet_name", "clip_name", "vae_name", "model_name", "ckpt_name"];

export class CloudLibrary {
  private key: string;
  /** Plain file name → the name Cloud's loaders know it by. */
  private names = new Map<string, string>();
  ready: Promise<void>;

  constructor(key: string) {
    this.key = key;
    this.ready = this.sync().catch((error) => console.warn(`Comfy Cloud models: ${(error as Error).message}`));
  }

  private async call(path: string, init?: RequestInit) {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { "X-API-Key": this.key, "Content-Type": "application/json", ...init?.headers },
    });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.json();
  }

  private async mine() {
    const list = await this.call(`/assets?include_tags=models&limit=500`);
    const assets = (list.assets ?? list) as { loader_path?: string; name?: string; metadata?: { filepath?: string } }[];
    for (const a of assets) {
      const file = a.metadata?.filepath?.split("/").pop();
      if (file && a.loader_path) this.names.set(file, a.loader_path);
    }
  }

  private async shared(folder: string) {
    const list = (await this.call(`/experiment/models/${folder}`)) as { name: string }[];
    return new Set(list.map((m) => m.name));
  }

  /** Imports what is missing, then learns the loader names of the workspace's own models. */
  private async sync() {
    await this.mine();
    for (const model of IMPORTS) {
      if (this.names.has(model.file) || (await this.shared(model.folder)).has(model.file)) continue;
      console.log(`Comfy Cloud: importing ${model.file} into your library…`);
      const task = await this.call(`/assets/download`, {
        method: "POST",
        body: JSON.stringify({ source_url: model.url, tags: ["models", model.folder] }),
      });
      for (let i = 0; task.task_id && i < 120; i++) {
        const state = await this.call(`/tasks/${task.task_id}`);
        if (state.status === "completed") break;
        if (state.status === "failed") throw new Error(`importing ${model.file} failed`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    await this.mine();
  }

  /** Points model widgets at the workspace's imported copies. */
  async resolve(graph: Graph) {
    await this.ready;
    for (const node of Object.values(graph)) {
      for (const input of MODEL_INPUTS) {
        const value = node.inputs[input];
        if (typeof value === "string" && this.names.has(value)) node.inputs[input] = this.names.get(value);
      }
    }
    return graph;
  }
}
