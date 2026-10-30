// Where each render job runs. On Local ComfyUI, a job whose nodes or model files that ComfyUI does not have is stopped before it is
// sent, with what is missing. On Both (hybrid), it goes to Comfy Cloud instead; a job that ComfyUI can run stays there, with the Comfy
// key beside it so partner nodes inside it work too. What a ComfyUI has is read from its /object_info (free, kept a minute).
import type { Graph } from "./workflows.ts";

const MODEL = /\.(safetensors|ckpt|pt|pth|gguf|bin|sft|onnx)$/i;
const KEEP_MS = 60_000;

/** What a ComfyUI has: its node types, and the model files its loaders offer (by file name). */
export type Installed = { nodes: Set<string>; files: Set<string> };

/** Reads what a ComfyUI has from its /object_info. */
export function installedFrom(info: Record<string, any>): Installed {
  const files = new Set<string>();
  for (const node of Object.values(info)) {
    for (const part of ["required", "optional"]) {
      for (const spec of Object.values<any>(node?.input?.[part] ?? {})) {
        if (Array.isArray(spec) && Array.isArray(spec[0])) for (const x of spec[0]) if (typeof x === "string" && MODEL.test(x)) files.add(x.split("/").pop()!);
      }
    }
  }
  return { nodes: new Set(Object.keys(info)), files };
}

/** What a graph needs that a ComfyUI lacks: node types and model files (empty when it can run it). */
export function missing(graph: Graph, have: Installed): string[] {
  const out = new Set<string>();
  for (const node of Object.values(graph)) {
    if (!node?.class_type) continue;
    if (!have.nodes.has(node.class_type)) out.add(`the ${node.class_type} node`);
    for (const v of Object.values(node.inputs ?? {})) if (typeof v === "string" && MODEL.test(v) && !have.files.has(v.split("/").pop()!)) out.add(v.split("/").pop()!);
  }
  return [...out];
}

/**
 * The ComfyUI behind a bridge: the bridge names it (its health says `upstream`), else COMFYUI_URL, else the usual port on the bridge's
 * host. Read through `f`, so tests can stand in for it.
 */
export function createInstalled(f: typeof fetch = fetch) {
  let seen: { bridge: string; at: number; have: Installed | null } | null = null;
  async function comfyui(bridge: string) {
    const health: any = await f(`${bridge}/api/v2/health`, { signal: AbortSignal.timeout(2000) }).then((r) => (r.ok ? r.json() : null), () => null);
    const named = typeof health?.upstream === "string" ? health.upstream.replace(/\/+$/, "") : "";
    const host = new URL(bridge).hostname;
    // a bridge on another machine names its ComfyUI as it reaches it (often 127.0.0.1 there): take its port on the bridge's host
    const fromBridge = named ? (() => { const u = new URL(named); if (["127.0.0.1", "localhost", "0.0.0.0"].includes(u.hostname)) u.hostname = host; return u.origin; })() : "";
    return [fromBridge, process.env.COMFYUI_URL?.trim().replace(/\/+$/, ""), `http://${host}:8188`].filter(Boolean) as string[];
  }
  /** What the ComfyUI behind the bridge has; null when it cannot be read. */
  return async function installed(bridge: string): Promise<Installed | null> {
    if (seen?.bridge === bridge && Date.now() - seen.at < KEEP_MS) return seen.have;
    let have: Installed | null = null;
    for (const at of await comfyui(bridge)) {
      const info = await f(`${at}/object_info`, { signal: AbortSignal.timeout(20_000) }).then((r) => (r.ok ? r.json() : null), () => null);
      if (info && typeof info === "object") {
        have = installedFrom(info);
        break;
      }
    }
    seen = { bridge, at: Date.now(), have };
    return have;
  };
}

/** The sentence for a job the ComfyUI cannot run. */
export function lacking(what: string[], hybrid: boolean) {
  const list = what.length > 4 ? `${what.slice(0, 4).join(", ")} and ${what.length - 4} more` : what.join(", ");
  return hybrid
    ? `Your ComfyUI lacks ${list}, so this goes to Comfy Cloud, which needs a Comfy API key (the account window, top right).`
    : `Your ComfyUI lacks ${list}. Add it to ComfyUI (the README's Models table says where), or pick Both or Comfy Cloud in the account window (top right).`;
}
