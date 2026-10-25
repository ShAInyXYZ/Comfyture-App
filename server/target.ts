// Where the renders go: Comfy Cloud, or your own ComfyUI through comfy-api-proxy (the bridge: Comfy's small service that serves the
// Comfy API v2 in front of a ComfyUI, the same API Comfy Cloud speaks, so nothing else in the app changes). Chosen in the header's
// account window and kept in data/target.json, where it outranks .env's COMFY_BASE_URL (as a saved key outranks .env's key); it can be
// switched while the server runs. The choice is what the Comfy SDK reads: COMFY_BASE_URL names the deployment, none means Comfy Cloud.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const CLOUD_URL = "https://cloud.comfy.org";
/** comfy-api-proxy's own default address. */
export const LOCAL_URL = "http://127.0.0.1:8189";

export type TargetKind = "comfy-cloud" | "self-hosted";
export interface Target {
  kind: TargetKind;
  url: string;
}

/** What an address is: Comfy Cloud's, or someone's own deployment. */
export function targetOf(url: string): Target {
  return { kind: new URL(url).hostname === "cloud.comfy.org" ? "comfy-cloud" : "self-hosted", url };
}

/** An address a person typed, as the SDK takes it: http(s), no query or fragment, no trailing slash; null when it is not one. */
export function cleanUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 300) return null;
  let u: URL;
  try {
    u = new URL(raw.trim().includes("://") ? raw.trim() : `http://${raw.trim()}`);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  u.search = "";
  u.hash = "";
  return u.toString().replace(/\/+$/, "");
}

/** What answered at an address: the bridge (the v2 API), a ComfyUI with no bridge in front of it, or nothing. */
export interface Probe {
  ok: boolean;
  found: "bridge" | "comfyui" | "nothing";
  detail: string;
}

/**
 * Asks an address what it is, for free: the v2 API's job list (what comfy-api-proxy and Comfy Cloud serve) and, failing that, a
 * ComfyUI's own system stats (a ComfyUI reached directly, which the app cannot drive without the bridge).
 */
export async function probe(url: string, f: typeof fetch = fetch): Promise<Probe> {
  const get = (path: string) => f(`${url}${path}`, { signal: AbortSignal.timeout(5000) }).then((r) => r, () => null);
  const v2 = await get("/api/v2/jobs?limit=1");
  if (v2 && (v2.ok || v2.status === 401 || v2.status === 403)) {
    return { ok: true, found: "bridge", detail: v2.ok ? "The bridge answers: renders go to this ComfyUI." : "The bridge answers, and asks for a key." };
  }
  const stats = await get("/system_stats");
  if (stats?.ok) {
    const s: any = await stats.json().catch(() => null);
    const gpu = s?.devices?.[0]?.name ? ` on ${String(s.devices[0].name).replace(/^cuda:\d+\s*/, "").replace(/\s*:.*$/, "").slice(0, 60)}` : "";
    return { ok: false, found: "comfyui", detail: `A ComfyUI${gpu} answers here, but without the bridge: run comfy-api-proxy in front of it and use its address (by default ${LOCAL_URL}).` };
  }
  return { ok: false, found: "nothing", detail: v2 ? `Something answered with ${v2.status}, but not the Comfy API.` : "Nothing answers at this address." };
}

/** The target in use, the one saved, and how to switch: what the server keeps of it. */
export function createTarget(deps: { data: string; env?: NodeJS.ProcessEnv; fetch?: typeof fetch }) {
  const env = deps.env ?? process.env;
  const file = join(deps.data, "target.json");
  /** what .env gave, kept to go back to */
  const original = env.COMFY_BASE_URL?.trim() ?? "";
  let saved: Target | null = null;
  const current = (): Target => targetOf(env.COMFY_BASE_URL?.trim() || CLOUD_URL);
  const apply = (t: Target) => {
    if (t.kind === "comfy-cloud") delete env.COMFY_BASE_URL;
    else env.COMFY_BASE_URL = t.url;
  };

  /** Takes the choice saved in an earlier session; it outranks .env's. Call once, before anything makes a Comfy client. */
  async function init() {
    try {
      const t = JSON.parse(await readFile(file, "utf8"));
      const url = t.kind === "comfy-cloud" ? CLOUD_URL : cleanUrl(t.url);
      if (url) {
        saved = targetOf(url);
        apply(saved);
      }
    } catch {
      // nothing saved: .env, or the defaults, decide
    }
  }

  /** Switches where the renders go (a local address is checked first), keeps the choice, and returns the target now in use. */
  async function set(kind: unknown, rawUrl?: unknown): Promise<{ target: Target; probe?: Probe }> {
    if (kind !== "comfy-cloud" && kind !== "self-hosted") throw Object.assign(new Error("Comfy Cloud or your ComfyUI."), { status: 400 });
    if (kind === "comfy-cloud") {
      saved = targetOf(CLOUD_URL);
      apply(saved);
      await mkdir(deps.data, { recursive: true });
      await writeFile(file, JSON.stringify({ kind }));
      return { target: current() };
    }
    const url = cleanUrl(rawUrl ?? LOCAL_URL);
    if (!url) throw Object.assign(new Error("An address like http://127.0.0.1:8189."), { status: 400 });
    const p = await probe(url, deps.fetch);
    if (!p.ok) throw Object.assign(new Error(p.detail), { status: 400, probe: p });
    saved = targetOf(url);
    apply(saved);
    await mkdir(deps.data, { recursive: true });
    await writeFile(file, JSON.stringify({ kind, url }));
    return { target: current(), probe: p };
  }

  /** Forgets the saved choice and goes back to .env's (or Comfy Cloud). */
  async function reset() {
    await rm(file, { force: true });
    saved = null;
    if (original) env.COMFY_BASE_URL = original;
    else delete env.COMFY_BASE_URL;
    return current();
  }

  return { init, current, set, reset, saved: () => saved, probe: (url: string) => probe(url, deps.fetch) };
}
