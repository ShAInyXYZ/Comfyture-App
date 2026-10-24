// The Comfy account in the header, in a real browser, on a server and a folder of its own. Comfy's balance answers from a stand-in
// inside the server (any other call to a comfy.org host is refused, so nothing is spent): the button shows the credits, the settings open
// with their sections, a key Comfy refuses says so, a key it takes is saved, and the key itself never shows in the page or in /api/account.
// Not part of `node --test` (it needs a browser). From the repo root:
//   PLAYWRIGHT_MODULE=<playwright's folder> node tests/account.browser.mjs        (OUT=<folder> keeps screenshots)
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const root = resolve(import.meta.dirname, "..");
const out = process.env.OUT ? resolve(process.env.OUT) : null;
if (out) await mkdir(out, { recursive: true });
const dataDir = await mkdtemp(join(tmpdir(), "account-data-"));
let failures = 0;
const ok = (cond, msg, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}${extra ? `  ${extra}` : ""}`);
  if (!cond) failures++;
};

const port = await new Promise((done) => {
  const s = createServer().listen(0, () => {
    const { port } = s.address();
    s.close(() => done(port));
  });
});
// inside the server: the balance answers 973.98 cents to a good key and 403 to a key that says "refused"; every other Comfy host call is refused
const stub = `
const real = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input?.url ?? String(input);
  if (url === "https://api.comfy.org/customers/balance") {
    const key = new Headers(init?.headers).get("x-api-key") ?? "";
    if (key.includes("refused")) return Promise.resolve(new Response("{}", { status: 403 }));
    const cents = key.includes("second") ? 211 : 973.98;
    return Promise.resolve(new Response(JSON.stringify({ amount_cents: cents, prepaid_balance_cents: cents, cloud_credit_balance_cents: 0, pending_charges_cents: 0, effective_balance_cents: cents, currency: "usd" })));
  }
  if (/comfy\\.org/.test(url)) throw new Error("blocked outbound call: " + url);
  return real(input, init);
};`;
const guard = `data:text/javascript,${encodeURIComponent(stub)}`;
const env = { ...process.env, PORT: String(port), COMFYTURE_DATA: dataDir, COMFY_API_KEY: "env-key-ENV1", NODE_OPTIONS: `--import=${guard}` };
delete env.COMFY_BASE_URL;
delete env.COMFYTURE_OPEN_WEIGHTS;
const server = spawn(process.execPath, ["server/main.ts"], { cwd: root, env, stdio: "ignore" });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 100; i++) {
  if (await fetch(`${base}/api/info`).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 200));
}

const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  const button = page.locator("button#cloud");
  await button.waitFor();
  await page.waitForFunction(() => /cr/.test(document.getElementById("cloud").textContent), null, { timeout: 15000 });
  ok(/2,055 cr/.test(await button.textContent()), "the header button shows the credits", await button.textContent());
  ok(((await button.getAttribute("data-tooltip")) ?? (await button.getAttribute("title"))) === "Comfy account: $9.74 · 2,055 credits", "its tooltip names dollars and credits");

  await button.click();
  const pop = page.locator(".account-pop");
  await pop.waitFor();
  const text = await pop.textContent();
  for (const part of ["2,055", "$9.74 prepaid", "Buy credits", "Renders on", "Comfy Cloud", "API key", "•••• ENV1", "from .env", "Get a key", "Open weights only", "Off"]) ok(text.includes(part), `the settings show "${part}"`);
  ok(!text.includes("pending") && !text.includes("cloud credits"), "pending charges and cloud credits stay out when zero");
  ok((await pop.locator('a[href="https://cloud.comfy.org"]').getAttribute("target")) === "_blank", "Buy credits opens Comfy Cloud in a new tab");
  const box = await pop.boundingBox();
  ok(box.x + box.width <= 1600 && box.y >= 0, "the settings stay in the window");
  if (out) await page.screenshot({ path: join(out, "popover.png") });

  await page.keyboard.press("Escape");
  ok((await page.locator(".account-pop").count()) === 0, "Escape closes the settings");
  await button.click();
  await pop.waitFor();
  await page.mouse.click(300, 600);
  ok((await page.locator(".account-pop").count()) === 0, "a click outside closes them");

  // a key Comfy refuses
  await button.click();
  await pop.waitFor();
  await pop.getByRole("button", { name: "Change" }).click();
  await pop.locator("input[type=password]").fill("this-key-is-refused");
  await pop.getByRole("button", { name: "Save" }).click();
  await pop.getByText("That key was refused by Comfy").waitFor();
  ok(true, "a refused key says so");
  ok((await page.locator("button#cloud").textContent()).includes("2,055"), "the credits are unchanged by a refused key");

  // a key Comfy takes
  await pop.locator("input[type=password]").fill("second-key-SEC2");
  await pop.getByRole("button", { name: "Save" }).click();
  await pop.getByText("•••• SEC2").waitFor();
  ok((await pop.textContent()).includes("saved here"), "the new key is marked as saved here");
  await page.waitForFunction(() => /445 cr/.test(document.getElementById("cloud").textContent));
  ok(true, "the button follows the new key's credits");
  ok((await pop.getByRole("button", { name: "Use the .env key again" }).count()) === 1, "going back to .env is offered");
  const saved = JSON.parse(await readFile(join(dataDir, "account.json"), "utf8"));
  ok(saved.key === "second-key-SEC2", "the key is saved in the app's own data folder");

  // the key is never in the page or the answer
  const answer = await (await fetch(`${base}/api/account`)).text();
  const html = await page.content();
  for (const secret of ["second-key-SEC2", "env-key-ENV1", "this-key-is-refused"]) ok(!answer.includes(secret) && !html.includes(secret), `"${secret}" is nowhere in the page or the answer`);

  await pop.getByRole("button", { name: "Use the .env key again" }).click();
  await pop.getByText("•••• ENV1").waitFor();
  ok(true, "the .env key comes back");
  ok(errors.length === 0, "no page errors", errors.join(" | "));
  if (out) {
    await page.keyboard.press("Escape");
    await page.screenshot({ path: join(out, "header.png"), clip: { x: 0, y: 0, width: 1600, height: 140 } });
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.screenshot({ path: join(out, "header-1366.png"), clip: { x: 0, y: 0, width: 1366, height: 140 } });
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `${failures} FAILED` : "all passed");
process.exit(failures ? 1 : 0);
