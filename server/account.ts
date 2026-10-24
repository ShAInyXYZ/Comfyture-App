import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

/** Comfy's own price: 211 credits to the dollar. */
export const CREDITS_PER_USD = 211;
const BALANCE_URL = "https://api.comfy.org/customers/balance";
const CACHE_MS = 60_000;

export interface Balance {
  credits: number;
  usd: number;
  cents: number;
  prepaidCents: number;
  cloudCents: number;
  pendingCents: number;
  at: string;
}

const cents = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Comfy's balance answer (amounts in US cents) as credits and dollars; null when it is not a balance. */
export function parseBalance(body: any, at = new Date()): Balance | null {
  if (!body || typeof body !== "object") return null;
  const spendable = body.effective_balance_cents ?? body.amount_cents;
  if (typeof spendable !== "number" || !Number.isFinite(spendable)) return null;
  return {
    credits: Math.round((spendable / 100) * CREDITS_PER_USD),
    usd: Math.round(spendable) / 100,
    cents: spendable,
    prepaidCents: cents(body.prepaid_balance_cents),
    cloudCents: cents(body.cloud_credit_balance_cents),
    pendingCents: cents(body.pending_charges_cents),
    at: at.toISOString(),
  };
}

/** A key shown as its last four characters only. */
export const last4 = (key: string) => key.slice(-4);

type Read = { balance: Balance } | { error: string; refused?: boolean };

/**
 * The Comfy account behind the header: which key is in use (the .env one, or one saved here), what it can still spend,
 * and where it renders. The key itself never leaves this module.
 */
export function createAccount(deps: {
  data: string;
  /** where renders go (known only once the server has chosen) */
  target: () => { kind: string; url: string };
  fetch?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  /** told when the key in use changes, so the parts that keep a client of their own can follow */
  onKey?: (key: string) => void;
}) {
  const f = deps.fetch ?? fetch;
  const env = deps.env ?? process.env;
  const file = join(deps.data, "account.json");
  /** what .env gave, kept to go back to */
  const original = env.COMFY_API_KEY?.trim() ?? "";
  let saved = "";
  let cache: { key: string; at: number; balance: Balance } | null = null;

  const current = () => env.COMFY_API_KEY?.trim() ?? "";
  const apply = (key: string) => {
    if (key) env.COMFY_API_KEY = key;
    else delete env.COMFY_API_KEY;
    cache = null;
    deps.onKey?.(key);
  };

  /** One free read of the balance with a key. */
  async function read(key: string): Promise<Read> {
    try {
      const res = await f(BALANCE_URL, { headers: { "X-API-Key": key }, signal: AbortSignal.timeout(10_000) });
      if (res.status === 401 || res.status === 403) return { error: "The key was refused", refused: true };
      if (!res.ok) return { error: "Comfy could not be reached" };
      const balance = parseBalance(await res.json().catch(() => null));
      return balance ? { balance } : { error: "Comfy could not be reached" };
    } catch {
      return { error: "Comfy could not be reached" };
    }
  }

  /** Takes a key saved in an earlier session; it outranks .env's. Call once, before anything reads the key. */
  async function init() {
    try {
      const key = String(JSON.parse(await readFile(file, "utf8")).key ?? "").trim();
      if (key) {
        saved = key;
        env.COMFY_API_KEY = key;
      }
    } catch {
      // nothing saved
    }
  }

  async function status(refresh = false) {
    const key = current();
    const open = !!env.COMFYTURE_OPEN_WEIGHTS?.trim();
    const out: any = {
      target: deps.target(),
      key: { set: !!key, last4: key ? last4(key) : "", source: saved && key === saved ? "settings" : "env" },
      openWeights: open,
      balance: null,
    };
    if (open) return Object.assign(out, { error: "Open weights only is on, so no Comfy credits are spent" });
    if (!key) return Object.assign(out, { error: "No API key is set" });
    if (!refresh && cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return Object.assign(out, { balance: cache.balance });
    const got = await read(key);
    if ("balance" in got) {
      cache = { key, at: Date.now(), balance: got.balance };
      return Object.assign(out, { balance: got.balance });
    }
    return Object.assign(out, { error: got.error });
  }

  /** Checks a key with Comfy and, if Comfy takes it, saves it and starts using it. */
  async function saveKey(raw: unknown) {
    const key = typeof raw === "string" ? raw.trim() : "";
    if (!key || /\s/.test(key) || key.length > 300) throw Object.assign(new Error("Paste the key as Comfy shows it."), { status: 400 });
    const got = await read(key);
    if ("error" in got) {
      if (got.refused) throw Object.assign(new Error("That key was refused by Comfy"), { status: 400 });
      throw Object.assign(new Error("Comfy could not be reached to check the key"), { status: 502 });
    }
    await mkdir(deps.data, { recursive: true });
    await writeFile(file, JSON.stringify({ key }), { mode: 0o600 });
    saved = key;
    apply(key);
    cache = { key, at: Date.now(), balance: got.balance };
    return status();
  }

  /** Forgets the saved key and goes back to .env's. */
  async function clearKey() {
    await rm(file, { force: true });
    saved = "";
    apply(original);
    return status(true);
  }

  return { init, status, saveKey, clearKey };
}
