// Judge mode (COMFYTURE_JUDGE=1): the app as a hosted copy for the challenge's judges (docs/competition/HOSTING.md). Everything a visitor
// can open, read, try and make stays open; what would break the copy for the next judge does not: the Comfy key and where the renders go
// are the host's (set in .env, not from the page), nothing can be deleted, a visitor sending too much too fast waits a moment, and what
// costs credits is counted at the doors it leaves by (the engine's jobs, the template runner, the partners' pictures, clips and words) and
// capped per visitor and per day. Behind it all, the host's key holds a small budget.

import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

// ---------------------------------------------------------------- the spend gate


/** What a judges' copy counts: a render (a ComfyUI job, a template, a partner's picture or clip) or words (a writer's or a pet's answer). */
export type Spend = "render" | "words";

const visitors = new AsyncLocalStorage<string>();
/** Runs `fn` as one visitor's: what it spends, even later in a job it started, is counted as theirs. */
export const asVisitor = <T>(visitor: string, fn: () => T): T => visitors.run(visitor, fn);

/** The caps, from the environment: renders per visitor a day, renders for every visitor a day, words per visitor a day. */
export function capsOf(env: NodeJS.ProcessEnv = process.env) {
  const n = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) >= 0 && v?.trim() ? Math.floor(Number(v)) : d);
  return { renders: n(env.COMFYTURE_JUDGE_RUNS, 12), day: n(env.COMFYTURE_JUDGE_RUNS_DAY, 80), words: n(env.COMFYTURE_JUDGE_WORDS, 80) };
}

interface Ledger {
  day: string;
  render: Record<string, number>;
  words: Record<string, number>;
  all: { render: number; words: number };
}
let file: string | null = null;
let book: Ledger | null = null;
const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const fresh = (day: string): Ledger => ({ day, render: {}, words: {}, all: { render: 0, words: 0 } });

/** Where the day's counts are kept (data/judge.json), so a restart does not give them back. */
export function keepLedger(data: string) {
  file = join(data, "judge.json");
  try {
    book = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    book = null;
  }
}
function ledger(now = Date.now()): Ledger {
  const day = today(now);
  if (!book || book.day !== day) book = fresh(day);
  return book;
}
function save() {
  if (!file || !book) return;
  try {
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, JSON.stringify(book));
  } catch {}
}

/**
 * Counts one paid step against the visitor who started it, and refuses it (429) past the caps: a visitor's renders and words a day, and
 * every visitor's renders a day. Free when the copy is not a judges' one.
 */
export function spend(kind: Spend, env: NodeJS.ProcessEnv = process.env, now = Date.now()) {
  if (!judging(env)) return;
  const caps = capsOf(env);
  const b = ledger(now);
  const who = visitors.getStore() ?? "server";
  const mine = b[kind][who] ?? 0;
  const cap = kind === "render" ? caps.renders : caps.words;
  if (mine >= cap) {
    throw Object.assign(new Error(kind === "render"
      ? `That is today's ${cap} renders for this visitor on the judges' copy: the examples and the tours stay free, and it opens again tomorrow.`
      : `That is today's ${cap} answers for this visitor on the judges' copy: the examples and the tours stay free.`), { status: 429 });
  }
  if (kind === "render" && b.all.render >= caps.day) {
    throw Object.assign(new Error(`The judges' copy has made today's ${caps.day} renders: the examples and the tours stay free, and it opens again tomorrow.`), { status: 429 });
  }
  b[kind][who] = mine + 1;
  b.all[kind] += 1;
  save();
}

/** What a visitor has left today, for the account window. */
export function leftFor(visitor: string, env: NodeJS.ProcessEnv = process.env, now = Date.now()) {
  const caps = capsOf(env);
  const b = ledger(now);
  return { renders: Math.max(0, Math.min(caps.renders - (b.render[visitor] ?? 0), caps.day - b.all.render)), words: Math.max(0, caps.words - (b.words[visitor] ?? 0)) };
}
