// Judge mode (COMFYTURE_JUDGE=1): the app as a hosted copy for the challenge's judges (docs/competition/HOSTING.md). Everything a visitor
// can open, read, try and make stays open; what would break the copy for the next judge does not: the Comfy key and where the renders go
// are the host's (set in .env, not from the page), nothing can be deleted, and a visitor sending too much too fast waits a moment. The
// spending cap is the host's own: a separate Comfy key holding a small budget.

/** Whether this server runs as a judges' copy. */
export const judging = (env: NodeJS.ProcessEnv = process.env) => !!env.COMFYTURE_JUDGE?.trim();

// what a visitor may not delete: the projects, the takes, the reels, the Stage's stages, poses and models
const KEPT = [
  /^\/api\/(stories|cuts|mixes|brands|jams|spice-shots|toasts)\/[\w-]+$/,
  /^\/api\/runs\/[\w-]+$/,
  /^\/api\/reels\/[\w-]+$/,
  /^\/api\/control\/(stages|poses|models)\/[\w-]+$/,
];

/** Why a judges' copy refuses a request, or null when it goes through. */
export function refused(method: string, path: string, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!judging(env)) return null;
  // (testing an address is refused too: on a hosted copy it would let a visitor make the server fetch any address)
  if (/^\/api\/account\/(key|target)(\/|$)/.test(path) && method !== "GET") {
    return "This is a judges' copy: its Comfy key and where it renders are set by its host.";
  }
  if (method === "DELETE" && KEPT.some((re) => re.test(path))) return "This is a judges' copy: nothing can be deleted here, so the next judge finds it whole.";
  return null;
}

/**
 * A visitor's pace: at most `limit` writing requests (POST, PUT, PATCH, DELETE) in any `windowMs`; the next waits. Counted per visitor
 * (the address the request came from, or the first one a local reverse proxy names), in memory.
 */
export function createPace({ limit = 240, windowMs = 10 * 60_000, now = () => Date.now() } = {}) {
  const seen = new Map<string, number[]>();
  return {
    /** True when this visitor may go on; false when they have sent `limit` in the window. */
    take(visitor: string) {
      const t = now();
      const recent = (seen.get(visitor) ?? []).filter((at) => t - at < windowMs);
      if (recent.length >= limit) {
        seen.set(visitor, recent);
        return false;
      }
      recent.push(t);
      seen.set(visitor, recent);
      // (a visitor gone quiet is forgotten)
      if (seen.size > 5000) for (const [k, v] of seen) if (!v.some((at) => t - at < windowMs)) seen.delete(k);
      return true;
    },
  };
}

/** Who a request comes from: its address, or the first one named by a reverse proxy on this machine. */
export function visitorOf(remote: string | undefined, forwarded: string | string[] | undefined): string {
  const local = !remote || remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return local && first ? first : remote ?? "unknown";
}
