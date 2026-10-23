// Toaster's projects in a real browser, on a server and a folder of its own: the bar's tabs, a new project, a rename, the saved lamp,
// Ctrl+S, a copy, an export and an import of it, Your projects and a delete with two clicks. Nothing is rendered, so no call can spend.
// Not part of `node --test` (it needs a browser). From the repo root:
//   PLAYWRIGHT_MODULE=<playwright's folder> node tests/toaster-projects.browser.mjs        (OUT=<folder> keeps a screenshot)
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
const dataDir = await mkdtemp(join(tmpdir(), "toaster-projects-data-"));
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
const server = spawn(process.execPath, ["server/main.ts"], { cwd: root, env: { ...process.env, PORT: String(port), COMFYTURE_DATA: dataDir, COMFY_API_KEY: "test-key", COMFY_BASE_URL: "http://127.0.0.1:9" }, stdio: "ignore" });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 100; i++) {
  if (await fetch(`${base}/api/toasts`).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 200));
}

const browser = await chromium.launch({ args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/GL Driver|favicon|Failed to load resource|WebGL/.test(m.text()) && errors.push(m.text()));
  await context.route((url) => !["127.0.0.1", "localhost"].includes(url.hostname), (route) => route.abort());

  const js = (fn, arg) => page.evaluate(fn, arg);
  const server$ = (path) => fetch(`${base}/api/${path}`).then((r) => r.json());
  const parts = () => js(() => window.__toaster.draft.body.parts.length);
  const tone = () => page.locator(".ts-saved").getAttribute("data-tone");
  const toastText = () => js(() => document.getElementById("toast").textContent);

  await page.goto(`${base}/#/toaster`);
  await page.waitForSelector(".ts-stage canvas", { timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector(".ts-boot"));
  await js(async () => (window.__toaster = (await import("/js/toaster.js")).toaster));
  // the page mounts the bar itself once the other agent's rewrite is in; until then it is mounted from here
  const mounted = await page.locator(".ts-subbar").count();
  if (!mounted) {
    console.log("NOTE panels/toaster.js does not mount the bar yet: mounted from the test");
    await js(async () => {
      const m = await import("/js/panels/toaster-projects.js");
      document.getElementById("page-toaster").prepend(m.projectBar());
      m.drawProjectBar();
      const { onChange } = await import("/js/store.js");
      onChange((s) => s.has("toaster") && m.drawProjectBar());
    });
  }
  const tabs = page.locator(".ts-tabs .tab");

  ok((await tabs.count()) === 1, "the bar shows one tab");
  ok((await page.locator(".ts-tabs .tab-close").count()) === 0, "with no close key while it is alone");
  ok((await page.locator(".ts-tabs .tab-name").textContent()) === "Project 1", "named Project 1");
  const first = await js(() => window.__toaster.draft.id);

  await page.locator(".tab-add", { hasText: "New project" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".ts-tabs .tab").length === 2);
  ok((await tabs.nth(1).textContent()).includes("Project 2") && (await tabs.nth(1).getAttribute("aria-selected")) === "true", "New project opens a second tab, Project 2");
  ok((await page.locator(".ts-tabs .tab-close").count()) === 2, "each tab can be closed now");

  // rename by double-click
  await tabs.nth(1).dblclick();
  await page.locator(".tab-rename").fill("Mantel clock");
  await page.locator(".tab-rename").press("Enter");
  await page.waitForFunction(() => document.querySelector('.ts-tabs .tab[aria-selected="true"] .tab-name')?.textContent === "Mantel clock");
  ok(true, "a double-click renames the open tab");

  // a change: the lamp goes busy, then ok, and the server has it
  const second = await js(() => window.__toaster.draft.id);
  await js(async () => (await import("/js/toaster.js")).addPart("cylinder"));
  ok((await tone()) === "busy", "a change lights the lamp busy");
  await page.waitForFunction(() => document.querySelector(".ts-saved")?.dataset.tone === "ok", null, { timeout: 5000 });
  ok(/^Saved \d/.test((await page.locator(".ts-saved").getAttribute("data-tooltip")) ?? ""), "then ok, saying when");
  const n = await parts();
  ok(n === 2 && (await server$(`toasts/${second}`)).project.body.parts.length === 2 && (await server$(`toasts/${second}`)).project.name === "Mantel clock", "the server has the change and the name");

  // Ctrl+S, even in a field
  await js(async () => (await import("/js/toaster.js")).addPart("sphere"));
  await page.locator(".tab-name").first().focus();
  await page.keyboard.press("Control+s");
  await page.waitForFunction(() => document.getElementById("toast").textContent === "Saved", null, { timeout: 5000 });
  ok((await tone()) === "ok" && (await server$(`toasts/${second}`)).project.body.parts.length === 3, "Ctrl+S saves now and toasts Saved");

  // Save a copy
  await page.locator('.ts-project-key[aria-label^="Save a copy"]').click();
  await page.waitForFunction(() => document.querySelectorAll(".ts-tabs .tab").length === 3);
  const copy = await js(() => window.__toaster.draft);
  ok(copy.name === "Mantel clock copy" && copy.id !== second && copy.body.parts.length === 3, "Save a copy opens a third project with the same parts");
  ok((await tabs.nth(2).getAttribute("aria-selected")) === "true", "in a tab next to the one it came from");
  ok((await server$("toasts")).toasts.length === 3, "and the server has three");

  // Export
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator('.ts-project-key[aria-label^="Export"]').click()]);
  const file = join(dataDir, download.suggestedFilename());
  await download.saveAs(file);
  const exported = JSON.parse(await readFile(file, "utf8"));
  ok(download.suggestedFilename() === "Mantel clock copy.toaster.json" && exported.kind === "comfyture-toaster" && exported.version === 1 && exported.body.parts.length === 3, "Export downloads a .toaster.json with its kind and parts", download.suggestedFilename());

  // Import
  await page.locator('input[type=file]').count();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator('.ts-project-key[aria-label^="Import"]').click()]);
  await chooser.setFiles(file);
  await page.waitForFunction(() => document.querySelectorAll(".ts-tabs .tab").length === 4);
  ok((await parts()) === 3 && (await tabs.nth(3).getAttribute("aria-selected")) === "true", "Import opens a new tab with the same parts");
  // a bad file
  const [bad] = await Promise.all([page.waitForEvent("filechooser"), page.locator('.ts-project-key[aria-label^="Import"]').click()]);
  await bad.setFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from('{"kind":"other"}') });
  await page.waitForFunction(() => /not a Toaster project/.test(document.getElementById("toast").textContent));
  ok((await tabs.count()) === 4, "a file that is not a project is refused with a toast");

  // close a tab: the project is kept
  await tabs.nth(3).locator(".tab-close").click();
  await page.waitForFunction(() => document.querySelectorAll(".ts-tabs .tab").length === 3);
  ok((await server$("toasts")).toasts.length === 4, "closing a tab keeps its project");

  // Your projects
  await page.locator('.ts-project-key[aria-label="Your projects"]').click();
  await page.waitForSelector(".ts-projects-window[open]");
  ok((await page.locator(".ts-projects-window .ctl-project-card").count()) === 4, "Your projects lists a card for each");
  await page.locator(".ts-projects-window .ctl-project-card", { hasText: "Project 1" }).click();
  await page.waitForFunction((id) => window.__toaster.draft.id === id, first);
  ok((await tabs.count()) === 3, "a card opens its project (it already has a tab)");
  if (out) {
    await page.waitForTimeout(500);
    await page.mouse.move(800, 600);
    await page.screenshot({ path: join(out, "projects-bar.png") });
  }

  // delete with two clicks
  const del = page.locator('.ts-project-key[aria-label^="Delete"]');
  await del.click();
  ok((await server$("toasts")).toasts.length === 4, "one click on Delete only asks");
  await del.click();
  await page.waitForFunction(() => document.querySelectorAll(".ts-tabs .tab").length === 2);
  ok((await server$("toasts")).toasts.length === 3 && !(await server$("toasts")).toasts.some((t) => t.id === first), "the second click deletes the project and its tab");
  // a delete from a card
  await page.locator('.ts-project-key[aria-label="Your projects"]').click();
  const card = page.locator(".ts-projects-window .ts-project-card").first();
  await card.hover();
  await card.locator(".ts-card-delete").click();
  await card.locator(".ts-card-delete").click();
  await page.waitForFunction(() => document.querySelectorAll(".ts-projects-window .ctl-project-card").length === 2);
  ok((await server$("toasts")).toasts.length === 2, "a card's delete key, twice, deletes it too");
  await page.keyboard.press("Escape");

  ok(errors.length === 0, "no error on the page", errors.join(" | "));
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `${failures} failed` : "all passed");
process.exit(failures ? 1 : 0);
