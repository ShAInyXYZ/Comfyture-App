// The pets in a real browser, on a server of its own and a folder of its own: every product's page shows its pet
// in the chat bar (its face, its name in the placeholder, its quick actions where the product has no left panel
// of its own, the model picker); each product keeps its own conversation; Praline's and Truffle's answers are
// applied, and what costs credits is only ever offered: it waits for a yes, and nothing is made or run before it.
// No model is called (the writers' answers are stood in for), and every call to Comfy's hosts is refused, by the
// server and by the browser, so no credit can be spent. Not part of `node --test` (it needs a browser). From the
// repo root:
//   NODE_PATH=<a node_modules that has playwright> CHROME=<chrome or chromium binary> node tests/harnesses.browser.mjs
// OUT=<folder> keeps a screenshot of each product's bar, to be looked at.
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { HARNESSES, barOf } from "../web/js/harnesses.js";
import { TRENDS, CREW } from "../web/js/mixer-trends.js";

const { chromium } = createRequire(import.meta.url)("playwright");
const root = resolve(import.meta.dirname, "..");
const out = process.env.OUT ? resolve(process.env.OUT) : null;
if (out) await mkdir(out, { recursive: true });
const dataDir = await mkdtemp(join(tmpdir(), "harness-data-"));
let failures = 0;
const ok = (cond, msg, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}${extra ? `  ${extra}` : ""}`);
  if (!cond) failures++;
};

// a free port, and the server on it: a key that opens nothing (so the model picker is offered), no Comfy behind
// it, and a guard preloaded that refuses every call to Comfy's hosts
const port = await new Promise((done) => {
  const s = createServer().listen(0, () => {
    const { port } = s.address();
    s.close(() => done(port));
  });
});
const guard = `data:text/javascript,${encodeURIComponent('const real = globalThis.fetch; globalThis.fetch = (input, init) => { const url = typeof input === "string" ? input : input?.url ?? String(input); if (/comfy\\.org/.test(url)) throw new Error("blocked outbound call: " + url); return real(input, init); };')}`;
const server = spawn(process.execPath, ["server/main.ts"], { cwd: root, env: { ...process.env, PORT: String(port), COMFYTURE_DATA: dataDir, COMFY_API_KEY: "test-key", COMFY_BASE_URL: "http://127.0.0.1:9", NODE_OPTIONS: `--import=${guard}` }, stdio: "ignore" });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 100; i++) {
  if (await fetch(`${base}/api/jams`).then((r) => r.ok, () => false)) break;
  await new Promise((r) => setTimeout(r, 200));
}
// a picture in the Library for Truffle to work on
const photo = await (await fetch(`${base}/api/photos?sample=chef.jpg`, { method: "POST" })).json();

// everything that would spend credits: a request for it is refused by the browser and counted
const PAID = /\/api\/(image|shots|reels|generate|paint|director|cutout|audio\/(music|sound)|utensils\/(upscale|cutout|upscale-video|sound)|cuts\/[\w-]+\/render|macaron\/(image|motion)|jam\/(listen|slice))(\?|$)/;

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--no-sandbox"] });
try {
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const page = await context.newPage();
  const errors = [];
  const paid = [];
  const outbound = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/GL Driver|favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await context.route((url) => !["127.0.0.1", "localhost"].includes(url.hostname), (route) => (outbound.push(route.request().url()), route.abort()));
  await context.route(PAID, (route) => (route.request().method() === "POST" ? (paid.push(new URL(route.request().url()).pathname), route.abort()) : route.continue()));

  // the writers' answers, stood in for: each route answers from its queue and keeps what it was asked
  const asked = { mixer: [], utensils: [], spice: [], cut: [], shot: [], story: [], stage: [] };
  const queue = { mixer: [], utensils: [], spice: [], toaster: [], cut: [], shot: [], story: [], stage: [] };
  for (const [name, path] of [["mixer", "mixer/assist"], ["utensils", "utensils/assist"], ["spice", "spice/assist"], ["toaster", "toaster/assist"], ["cut", "cut/assist"], ["shot", "assistant"], ["story", "story/assist"], ["stage", "control/assist"]]) {
    await page.route(`**/api/${path}`, (route) => {
      asked[name].push(route.request().postDataJSON());
      route.fulfill({ json: queue[name].shift() ?? { reply: "Fine.", actions: [] } });
    });
  }

  const visit = async (p) => {
    await page.goto(`${base}/#/${p}`);
    await page.waitForFunction(() => {
      const a = document.getElementById("assistant");
      const img = a?.querySelector(".pet-face img");
      return a && !a.hidden && a.getBoundingClientRect().height > 0 && img?.complete && img.naturalWidth > 0;
    }, null, { timeout: 30000 });
    await page.waitForTimeout(300);
  };
  const say = async (text) => {
    await page.locator("#assistant .chat-input").click();
    await page.keyboard.type(text);
    await page.keyboard.press("Enter");
  };
  const answers = (n) => page.waitForFunction((n) => document.querySelectorAll("#assistant .chat-thread .msg.is-ai:not(.is-busy)").length >= n, n, { timeout: 20000 });
  const js = (fn, arg) => page.evaluate(fn, arg);

  // ---- every product's page: its pet in the bar
  await page.goto(`${base}/#/shot`, { waitUntil: "networkidle" });
  const PAGES = [["shot", "kitchen", "shot"], ["stage", "kitchen", "stage"], ["story", "kitchen", "story"], ["cut", "kitchen", "cut"], ["jam", "jam"], ["macaron", "macaron"], ["spice", "spice"], ["toaster", "toaster"], ["mixer", "mixer"], ["utensils", "utensils"]];
  for (const [p, product, room] of PAGES) {
    await visit(p);
    if (p === "stage") await page.waitForFunction(() => document.querySelector("#stage-chat #assistant"), null, { timeout: 30000 });
    const h = HARNESSES[product];
    const look = barOf(product, room);
    const info = await js(() => {
      const a = document.getElementById("assistant");
      return {
        pet: a.dataset.pet, src: a.querySelector(".pet-face img").getAttribute("src"), tip: a.querySelector(".pet-face").dataset.tooltip,
        placeholder: a.querySelector(".chat-input").dataset.placeholder, chips: [...a.querySelectorAll(".pet-chip")].map((c) => c.textContent),
        chipsShown: !a.querySelector(".pet-chips").hidden, picker: !!a.querySelector(".composer-model .sel-trigger"), clip: getComputedStyle(a.querySelector(".clip-key")).display !== "none",
        bar: a.querySelector(".chat-bar").getBoundingClientRect().height, composer: a.querySelector(".composer").getBoundingClientRect().height,
        chatH: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--chat-h")),
      };
    });
    ok(info.pet === h.pet && info.src === h.face, `${p}: ${h.name}'s face is in the bar`, `${info.pet} ${info.src}`);
    ok(info.tip === `${h.name} · ${h.tag}`, `${p}: the face says who it is`, info.tip);
    // a product with workspaces asks what fits the one its own panel has open
    const asks = room || h.tools === "bar" ? [look.placeholder] : Object.values(h.placeholders);
    ok(asks.includes(info.placeholder) && info.placeholder.startsWith(`Ask ${h.name} — `), `${p}: the bar asks ${h.name} by name`, info.placeholder);
    if (h.tools === "bar") ok(info.chipsShown && JSON.stringify(info.chips) === JSON.stringify(look.presets.map((x) => x.label)), `${p}: ${h.name}'s presets are chips above the bar`, info.chips.join(" | "));
    else ok(!info.chipsShown && !info.chips.length, `${p}: ${h.name}'s presets are left to the product's own panel`);
    ok(info.picker, `${p}: the model picker is still there`);
    ok(info.clip === (p === "shot" || p === "stage" || p === "toaster"), `${p}: the attach key is only where the bar takes files (Toaster: a photo for Crumpet)`);
    // a product with a left panel has its bar on one row (the face, the words, the model, the send key); the others keep the card
    if (h.tools === "panel") ok(info.bar >= 56 && info.bar <= 72, `${p}: ${h.name}'s bar is one row`, `${Math.round(info.bar)}px`);
    else ok(info.bar > 100, `${p}: ${h.name}'s bar is the card`, `${Math.round(info.bar)}px`);
    ok(Math.abs(info.chatH - info.composer) <= 1, `${p}: the page keeps room for the bar as tall as it is`, `--chat-h ${info.chatH}px, bar and chips ${Math.round(info.composer)}px`);
    if (out) await page.screenshot({ path: join(out, `${p}.png`) });
  }

  // ---- Mixer's dashboard and Utensils' workbench end above the bar, on a desktop at either size
  const spaceAbove = (name) => page.evaluate((name) => {
    const top = document.querySelector("#assistant .composer").getBoundingClientRect().top;
    const bottom = (sel) => document.querySelector(sel)?.getBoundingClientRect().bottom;
    return { top, page: bottom(`#page-${name}`), go: bottom(name === "mixer" ? ".mx-go" : ".ut-go"), doc: [document.documentElement.scrollHeight, innerHeight], chatH: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--chat-h")), composer: document.querySelector("#assistant .composer").getBoundingClientRect().height };
  }, name);
  for (const [width, height] of [[1920, 1080], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await visit("mixer");
    await page.waitForFunction(() => Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--chat-h")) - document.querySelector("#assistant .composer").getBoundingClientRect().height) <= 1);
    let r = await spaceAbove("mixer");
    ok(r.page <= r.top && r.doc[0] <= r.doc[1], `${width}x${height}: Mixer's dashboard ends above the bar and the page itself does not scroll`, `dashboard ${Math.round(r.page)} px, bar ${Math.round(r.top)} px`);
    // scrolled to the recipe's last key, and to the very end: still nothing under the bar
    await page.locator(".mx-go").scrollIntoViewIfNeeded();
    r = await spaceAbove("mixer");
    ok(r.go > 0 && r.go <= r.page && r.page <= r.top, `${width}x${height}: Make it can be scrolled into view above the bar`, `key ends ${Math.round(r.go)} px`);
    await page.evaluate(() => { const p = document.getElementById("page-mixer"); p.scrollTop = p.scrollHeight; });
    r = await spaceAbove("mixer");
    ok(r.page <= r.top, `${width}x${height}: and at the end of the dashboard`);
    // Utensils: the Picture workbench's run key is above the bar, and the page itself does not scroll
    await visit("utensils");
    await js(async () => (await import("/js/utensils.js")).setWorkspace("picture"));
    await page.waitForSelector(".ut-go");
    await page.waitForFunction(() => Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--chat-h")) - document.querySelector("#assistant .composer").getBoundingClientRect().height) <= 1);
    r = await spaceAbove("utensils");
    ok(r.go <= r.top && r.doc[0] <= r.doc[1], `${width}x${height}: Utensils' run key ends above the bar and the page itself does not scroll`, `key ends ${Math.round(r.go)} px, bar ${Math.round(r.top)} px`);
    await js(async () => (await import("/js/utensils.js")).setWorkspace("home"));
  }
  // writing hides the quick actions but not their room: the page above the bar does not move as you type (on Mixer, which has them)
  await visit("mixer");
  const before = (await spaceAbove("mixer")).chatH;
  await page.locator("#assistant .chat-input").click();
  await page.keyboard.type("x");
  await page.waitForTimeout(300);
  ok((await spaceAbove("mixer")).chatH === before && (await page.locator("#assistant .pet-chips").evaluate((e) => getComputedStyle(e).visibility)) === "hidden", "the quick actions give way while you type, and the page above the bar stays where it is");
  await page.keyboard.press("Backspace");
  await page.setViewportSize({ width: 1500, height: 950 });

  // ---- Praline: the picks are made at once; Make it is only offered, with its price, until the user says yes
  await visit("mixer");
  const trend = TRENDS.find((t) => (t.home === "mixer" || t.also?.includes("mixer")) && t.cast.length >= 2);
  const role = trend.cast[0].role;
  const who = CREW.find((c) => !c.kind && !trend.cast.some((x) => x.crew === c.id));
  queue.mixer.push({ reply: `${trend.name} is open with ${who.name} as the ${role}. Ready to make it.`, actions: [{ op: "pick_trend", trend: trend.id }, { op: "give_role", role, crew: who.id }, { op: "make_it" }] });
  await say(`the ${trend.name} trend with ${who.name} as ${role}, then make it`);
  await answers(1);
  let cast = await js(async () => {
    const t = await import("/js/mixer-trend.js");
    return { trend: t.pick.trend, cast: t.castOf().map((c) => [c.role, c.who.crew ?? c.who.star?.name]) };
  });
  ok(cast.trend === trend.id && cast.cast[0][0] === role && cast.cast[0][1] === who.id, "Praline's picks are made: the trend is open and the role is given", JSON.stringify(cast));
  ok((await page.locator(".mx-recipe-title h2").textContent()) === trend.name && (await page.locator(".mx-role b").first().textContent()) === who.name, "the Mixer screen shows what she did");
  const first = asked.mixer[0];
  ok(first.messages.at(-1).text.includes("then make it") && first.model && first.mixer.shelf.length >= 3 && first.mixer.crew.length === CREW.length && first.mixer.open.trend, "she was told the shelf, the crew and the trend open", `${first.mixer.shelf.length} trends`);
  ok(!JSON.stringify(first).match(/Utensils|Truffle|Macaron|Brioche|Ketkout/), "and nothing of another product");
  const msg = page.locator("#assistant .chat-thread .msg.is-ai").last();
  ok((await msg.locator(".msg-face").getAttribute("src")) === HARNESSES.mixer.face, "her reply has her face");
  ok((await msg.locator(".msg-chips .chip").allTextContents()).length === 2, "what she did is listed as chips");
  const make = msg.locator(".msg-confirm .key.is-primary");
  ok(/Make it/.test(await make.textContent()) && /your GPU/.test(await make.textContent()), "Make it waits under her answer, with its price", await make.textContent());
  ok(paid.length === 0, "nothing was made by her answer", paid.join(" "));
  await msg.locator(".msg-confirm .key.is-quiet").click();
  ok((await msg.locator(".msg-confirm.is-settled").textContent()).includes("Not now") && paid.length === 0, "not now leaves it unmade");

  // on Comfy Cloud the price is in credits
  await js(async () => ((await import("/js/store.js")).state.info.target = "comfy-cloud"));
  queue.mixer.push({ reply: "Say the word.", actions: [{ op: "make_it" }] });
  await say("make it");
  await answers(2);
  const again = page.locator("#assistant .chat-thread .msg.is-ai").last().locator(".msg-confirm .key.is-primary");
  ok(/≈ \d+ cr/.test(await again.textContent()), "the price is in credits on Comfy Cloud", await again.textContent());
  ok(paid.length === 0, "still nothing made");
  await again.click();
  // making starts with local work (the mix, the recipe's files); the first thing that costs is refused here
  for (let i = 0; i < 60 && !paid.length; i++) await page.waitForTimeout(500);
  await page.waitForFunction(async () => !(await import("/js/mixer-trend.js")).making(), null, { timeout: 30000 });
  ok(paid.length >= 1 && paid.every((u) => PAID.test(u)), "only the yes makes it: the first paid request is its own (refused here)", paid.slice(0, 2).join(" "));
  const settled = await page.locator("#assistant .chat-thread .msg.is-ai").last().locator(".msg-confirm").textContent();
  ok(/didn't finish|Made|Making/.test(settled), "the answer says how it went", settled.trim());
  const spent = paid.length;

  // a preset chip says its words to the pet of the page
  queue.mixer.push({ reply: "Hotel Lobby is the hottest.", actions: [] });
  await page.locator("#assistant .pet-chip", { hasText: "Hottest trend" }).click();
  await answers(3);
  ok(asked.mixer.at(-1).messages.at(-1).text === "Pick the hottest trend on the shelf", "a preset chip is said as it is written");

  // ---- Truffle: the tool is set up from the library at once; running it waits for a yes
  await visit("utensils");
  ok((await page.locator("#assistant .chat-thread .msg").count()) === 0 || !(await page.locator("#assistant .chat-panel").isVisible()), "Utensils has a conversation of its own: Mixer's is not in it");
  queue.utensils.push({ reply: "Remove background is open with your latest picture. Ready to run.", actions: [{ op: "pick_tool", tool: "cutout" }, { op: "set_input", image: "img1" }, { op: "run_tool" }] });
  await say("cut out my latest picture");
  await answers(1);
  const tool = await js(async () => {
    const u = await import("/js/utensils.js");
    return { tool: u.utensils.tool, image: u.inputOf().image?.file };
  });
  ok(tool.tool === "cutout" && tool.image === photo.file, "Truffle's setup is made: the tool is open on the Library's latest picture", JSON.stringify(tool));
  const sent = asked.utensils[0];
  // Utensils opens on Home: nothing is open there and no tool is described; the tools are named by id so she can open one when the job is named
  ok(sent.utensils.workspace === "home" && sent.utensils.workspaces.length === 8 && sent.utensils.workspaces[0].id === "home" && sent.utensils.tools.length === 0 && sent.utensils.open === null && sent.utensils.others.length >= 10 && sent.utensils.library.images[0].id === "img1" && !JSON.stringify(sent).match(/Mixer|Praline|Macaron|Brioche|Pickle|Ketkout/), "she was told Utensils is on Home (the eight workspaces, no tool described, none open), the tools by id and the library, and nothing of another product", JSON.stringify([sent.utensils.workspace, sent.utensils.workspaces.length, sent.utensils.tools.length, sent.utensils.others.length, sent.utensils.library.images[0]?.id, sent.utensils.open?.tool]));
  const umsg = page.locator("#assistant .chat-thread .msg.is-ai").last();
  ok((await umsg.locator(".msg-face").getAttribute("src")) === HARNESSES.utensils.face, "her reply has her face");
  const run = umsg.locator(".msg-confirm .key.is-primary");
  ok(/Cut out/.test(await run.textContent()) && /(≈ \d+ cr|your GPU)/.test(await run.textContent()), "running waits under her answer, with its price", await run.textContent());
  ok(paid.length === spent, "nothing ran by her answer");
  await umsg.locator(".msg-confirm .key.is-quiet").click();
  queue.utensils.push({ reply: "Ready.", actions: [{ op: "run_tool" }] });
  await say("run it");
  await answers(2);
  ok(paid.length === spent, "not now, and a second ask, ran nothing");
  await page.locator("#assistant .chat-thread .msg.is-ai").last().locator(".msg-confirm .key.is-primary").click();
  for (let i = 0; i < 20 && paid.length === spent; i++) await page.waitForTimeout(250);
  ok(paid.length === spent + 1 && /\/api\/utensils\/cutout$/.test(paid.at(-1)), "only the yes runs the tool: its own request, refused here", paid.at(-1));
  queue.utensils.push({ reply: "Done.", actions: [] });
  await say("upscale my latest picture");
  await answers(3);
  ok(asked.utensils.at(-1).messages.at(-1).text === "upscale my latest picture", "what is typed is said as it is written (she has no chips)");
  // her room follows the workspace open: the video one, with its words and no chips
  await js(async () => (await import("/js/utensils.js")).setWorkspace("video"));
  await page.waitForTimeout(400);
  const room = await js(() => ({ chips: [...document.querySelectorAll("#assistant .pet-chip")].map((c) => c.textContent), ask: document.querySelector("#assistant .chat-input").dataset.placeholder }));
  ok(room.chips.length === 0 && room.ask === HARNESSES.utensils.placeholders.video, "the bar follows the workspace open: the video one's words, and no canned chips", room.ask);
  await js(async () => (await import("/js/utensils.js")).setWorkspace("home"));

  // ---- each product keeps its own conversation
  const kept = () => js(async () => ({
    mixer: (await import("/js/mixer-assist.js")).chat.messages.length,
    utensils: (await import("/js/utensils-assist.js")).chat.messages.length,
    shot: (await import("/js/store.js")).state.chat.messages.length,
    stage: (await import("/js/store.js")).state.stageChat.messages.length,
  }));
  let n = await kept();
  ok(n.mixer === 6 && n.utensils === 6 && n.shot === 0 && n.stage === 0, "Mixer's and Utensils' talk is theirs, and Kitchen's has none of it", JSON.stringify(n));
  const thread = async (p) => {
    await visit(p);
    return page.locator("#assistant .chat-thread .msg").count();
  };
  ok((await thread("mixer")) === 6, "back on Mixer, its own conversation is there");
  ok((await thread("utensils")) === 6, "back on Utensils, its own");
  ok((await thread("shot")) === 0 && (await page.locator("#assistant .thread-key").isHidden()), "the Shot has none of them");
  ok((await thread("macaron")) === 0, "nor has Macaron");

  // ---- Jam's editor is Cut's, with a conversation of its own
  await visit("jam");
  await page.waitForFunction(async () => (await import("/js/cut.js")).cut.project, null, { timeout: 30000 });
  queue.cut.push({ reply: "A zoom on every bar.", actions: [] });
  await say("a zoom on every bar");
  await answers(1);
  const cutChat = () => js(async () => (await import("/js/cut.js")).cut.chat.messages.length);
  ok((await page.locator("#assistant .chat-thread .msg").count()) === 2 && (await cutChat()) === 0, "Pickle's talk is in Jam, and Kitchen's Cut has none of it");
  ok((await page.locator("#assistant .chat-thread .msg.is-ai .msg-face").getAttribute("src")) === HARNESSES.jam.face, "Pickle's reply has his face");
  ok(asked.cut.length === 1 && asked.cut[0].messages.length === 1, "and the editor was only told what was said to Pickle");
  await visit("cut");
  await page.waitForFunction(async () => (await import("/js/cut.js")).cut.project, null, { timeout: 30000 });
  ok((await page.locator("#assistant .chat-thread .msg").count()) === 0, "on Cut, Ketkout's own conversation is empty");
  queue.cut.push({ reply: "Trimmed.", actions: [] });
  await say("trim the first shot to 3 s");
  await answers(1);
  ok((await page.locator("#assistant .chat-thread .msg").count()) === 2 && asked.cut.at(-1).messages.length === 1, "and what is said there is Kitchen's alone");
  ok((await thread("jam")) === 2, "back on Jam, Pickle's is as it was");

  // ---- Kitchen's rooms keep the assistants they had, with Ketkout in front of them
  const talk = { shot: ["Slow push-in", { reply: "Camera set.", actions: [{ do: "name", name: "Slow push" }] }], story: ["Add a scene", { reply: "Added.", ops: [] }], stage: ["Low angle", { reply: "Camera low.", actions: [] }] };
  for (const [room, [label, answer]] of Object.entries(talk)) {
    await visit(room);
    if (room === "story") await page.waitForFunction(async () => (await import("/js/story.js")).story.project, null, { timeout: 30000 });
    queue[room].push(answer);
    const text = HARNESSES.kitchen.presets[room].find((x) => x.label === label).text;
    await page.locator("#assistant .pet-chip", { hasText: label }).click();
    await answers(1);
    ok(asked[room].length === 1 && asked[room][0].messages.at(-1).text === text, `${room}: Ketkout's chip goes to the ${room}'s own assistant, in its own words`, text);
    ok((await page.locator("#assistant .chat-thread .msg").count()) === 2 && (await page.locator("#assistant .chat-thread .msg.is-ai .msg-face").getAttribute("src")) === HARNESSES.kitchen.face, `${room}: and the answer has Ketkout's face`);
  }
  ok((await js(async () => (await import("/js/store.js")).state.draft.script && (await import("/js/store.js")).state.draft.name)) === "Slow push", "the Shot's answer still sets the shot up");
  await visit("shot");
  ok((await page.locator("#assistant .msg .undo").count()) === 1, "and still has its Undo");

  // ---- the @ picker is for the Shot and the Stage, where files go
  await page.locator("#assistant .chat-input").click();
  await page.keyboard.type("@");
  ok(await page.locator("#assistant .mention-picker").isVisible(), "@ lists the Library on the Shot");
  await page.keyboard.press("Backspace");
  await visit("mixer");
  await page.locator("#assistant .chat-input").click();
  await page.keyboard.type("@");
  ok(!(await page.locator("#assistant .mention-picker").isVisible()), "and nothing on Mixer, whose bar takes no files");
  await page.keyboard.press("Backspace");

  ok(outbound.length === 0, "the browser asked nothing of any outside host", outbound.slice(0, 2).join(" "));
  ok(errors.length === 0, "no errors on any page", errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  server.kill();
  // the folder was this run's own: it goes once the server has let go of it
  await new Promise((done) => (server.exitCode !== null || server.signalCode !== null ? done() : server.once("exit", done)));
  await rm(dataDir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
