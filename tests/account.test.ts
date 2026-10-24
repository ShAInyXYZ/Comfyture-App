import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseBalance, last4, createAccount } from "../server/account.ts";

const BALANCE = { amount_cents: 973.98, prepaid_balance_cents: 973.98, cloud_credit_balance_cents: 0, pending_charges_cents: 0, effective_balance_cents: 973.98, currency: "usd" };
const target = () => ({ kind: "comfy-cloud", url: "https://cloud.comfy.org" });
const answer = (status: number, body: unknown = {}) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test("a balance answer becomes credits and dollars", () => {
  const b = parseBalance(BALANCE)!;
  assert.equal(b.credits, 2055);
  assert.equal(b.usd, 9.74);
  assert.equal(b.prepaidCents, 973.98);
  assert.equal(parseBalance({ nope: 1 }), null);
  assert.equal(parseBalance(null), null);
});

test("a key is shown as its last four characters", () => {
  assert.equal(last4("comfyui-abcdef1234"), "1234");
});

test("the status never carries the key, and the balance is read once a minute", async () => {
  let calls = 0;
  const f = (async () => (calls++, new Response(JSON.stringify(BALANCE)))) as unknown as typeof fetch;
  const env: any = { COMFY_API_KEY: "secret-key-wxyz" };
  const acc = createAccount({ data: await mkdtemp(join(tmpdir(), "acc-")), target, fetch: f, env });
  const s = await acc.status();
  assert.equal(s.balance.credits, 2055);
  assert.deepEqual(s.key, { set: true, last4: "wxyz", source: "env" });
  assert.ok(!JSON.stringify(s).includes("secret-key"));
  await acc.status();
  assert.equal(calls, 1);
  await acc.status(true);
  assert.equal(calls, 2);
});

test("no key, or open weights only, means no balance and a reason", async () => {
  const dir = await mkdtemp(join(tmpdir(), "acc-"));
  const none = await createAccount({ data: dir, target, fetch: answer(200, BALANCE), env: {} as any }).status();
  assert.equal(none.balance, null);
  assert.match(none.error, /No API key/);
  const open = await createAccount({ data: dir, target, fetch: answer(200, BALANCE), env: { COMFY_API_KEY: "k", COMFYTURE_OPEN_WEIGHTS: "1" } as any }).status();
  assert.equal(open.balance, null);
  assert.equal(open.openWeights, true);
});

test("a failed read says whether Comfy refused the key or could not be reached", async () => {
  const env: any = { COMFY_API_KEY: "k" };
  const dir = await mkdtemp(join(tmpdir(), "acc-"));
  assert.equal((await createAccount({ data: dir, target, fetch: answer(401), env }).status()).error, "The key was refused");
  assert.equal((await createAccount({ data: dir, target, fetch: answer(500), env }).status()).error, "Comfy could not be reached");
  const down = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
  assert.equal((await createAccount({ data: dir, target, fetch: down, env }).status()).error, "Comfy could not be reached");
});

test("a saved key outranks .env's, and clearing it goes back", async () => {
  const dir = await mkdtemp(join(tmpdir(), "acc-"));
  await writeFile(join(dir, "account.json"), JSON.stringify({ key: "saved-key-9999" }));
  const env: any = { COMFY_API_KEY: "env-key-1111" };
  const followed: string[] = [];
  const acc = createAccount({ data: dir, target, fetch: answer(200, BALANCE), env, onKey: (k) => followed.push(k) });
  await acc.init();
  assert.equal(env.COMFY_API_KEY, "saved-key-9999");
  let s = await acc.status();
  assert.deepEqual(s.key, { set: true, last4: "9999", source: "settings" });
  s = await acc.clearKey();
  assert.equal(env.COMFY_API_KEY, "env-key-1111");
  assert.deepEqual(s.key, { set: true, last4: "1111", source: "env" });
  assert.deepEqual(followed, ["env-key-1111"]);
});

test("a key Comfy refuses is not saved; one it takes is saved and used", async () => {
  const dir = await mkdtemp(join(tmpdir(), "acc-"));
  const env: any = { COMFY_API_KEY: "old-key-0000" };
  const refused = createAccount({ data: dir, target, fetch: answer(403), env });
  await assert.rejects(refused.saveKey("  bad-key  "), /refused by Comfy/);
  assert.equal(env.COMFY_API_KEY, "old-key-0000");
  const takes = createAccount({ data: dir, target, fetch: answer(200, BALANCE), env });
  const s = await takes.saveKey("  new-key-4321 \n");
  assert.equal(env.COMFY_API_KEY, "new-key-4321");
  assert.equal(s.key.source, "settings");
  assert.equal(s.key.last4, "4321");
  await assert.rejects(takes.saveKey("  "), /Paste the key/);
});
