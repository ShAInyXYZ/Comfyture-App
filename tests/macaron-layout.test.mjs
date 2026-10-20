// Macaron's layout sense: layers in another format, layout presets, the brand kit applied, the guard.
//   node --test tests/macaron-layout.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { kitOf, layoutOf, contrast, colorOf, newLayer, textRuns, layoutText, FORMATS } from "../web/js/design.js";
import { reflow, layoutPreset, applyKit, guard, cloneDesign, safeRect, estimate, onScreen, firstTiming, soundPops, patchLayerIn } from "../web/js/macaron-layout.js";
import { readMacaronAnswer, macaronPrompt, macaronTool, macaronBrief, spaceOf, SPACES, topUpBrand, keepFrame, encodeFrames, ledgerLine } from "../server/macaron.ts";
import { BRIOCHE, WORKSPACES, PRESETS, PLACEHOLDER } from "../web/js/macaron-harness.js";

const project = JSON.parse(readFileSync(new URL("../brands/comfyture.brand.json", import.meta.url), "utf8"));
const kit = kitOf(project.body);
const launch = project.body.designs.find((d) => d.id === "launch");

test("contrast is the brand page's: yellow on ink 15.6 : 1, yellow on warm white 1.1 : 1", () => {
  assert.ok(Math.abs(contrast(colorOf(kit, "yellow"), colorOf(kit, "ink")) - 15.6) < 0.2);
  assert.ok(contrast(colorOf(kit, "yellow"), colorOf(kit, "white")) < 1.2);
});

test("a layer's accent words are read between asterisks", () => {
  assert.deepEqual(textRuns("Or a *whole film.*")[0].map((r) => [r.t, r.a]), [["Or a ", false], ["whole film.", true]]);
});

test("a format with its own layout uses it, the others are reflowed", () => {
  const own = layoutOf(launch, "1:1", {});
  assert.equal(own.layers.find((l) => l.id === "headline").size, 0.088);
  const fake = layoutOf({ ...launch, formats: {} }, "9:16", { reflow: () => ({ headline: { y: 0.5 } }) });
  assert.equal(fake.layers.find((l) => l.id === "headline").y, 0.5);
});

for (const to of ["1:1", "9:16"]) {
  test(`reflow of the launch design to ${to} keeps type inside the safe zone and in order`, () => {
    const bare = { ...launch, formats: {} };
    const over = reflow(bare, to);
    const S = safeRect(to);
    const F = FORMATS[to];
    const lay = layoutOf(bare, to, { reflow: () => over }).layers.filter((l) => !l.hidden);
    for (const l of lay.filter((x) => x.type === "text" || x.type === "logo")) {
      const h = estimate(l, F.w, F.h).h / F.h;
      assert.ok(l.x >= S.x - 0.011 && l.x + l.w <= S.x + S.w + 0.011, `${l.id} x ${l.x}+${l.w} inside ${S.x}..${S.x + S.w}`);
      assert.ok(l.y >= S.y - 0.011 && l.y + h <= S.y + S.h + 0.011, `${l.id} y ${l.y}+${h} inside ${S.y}..${S.y + S.h}`);
    }
    const y = (id) => lay.find((l) => l.id === id).y;
    assert.ok(y("wordmark") < y("headline") && y("headline") < y("sub"), "reading order kept");
  });
}

test("a layout preset places roles without leaving the safe zone", () => {
  for (const preset of ["stack", "left", "poster", "split"]) {
    for (const format of Object.keys(FORMATS)) {
      const over = layoutPreset(launch, format, preset);
      const S = safeRect(format);
      const F = FORMATS[format];
      const head = over.headline;
      assert.ok(head, `${preset} ${format} places the headline`);
      assert.ok(head.y >= S.y - 0.001, `${preset} ${format} headline y ${head.y} below ${S.y}`);
      const h = estimate({ ...launch.layers.find((l) => l.id === "headline"), ...head }, F.w, F.h).h / F.h;
      assert.ok(head.y + h <= S.y + S.h + 0.02, `${preset} ${format} headline ends ${head.y + h}`);
    }
  }
});

test("applying the kit makes type legible on its ground and picks the logo that reads", () => {
  const d = structuredClone(launch);
  d.bg.color = "yellow";
  const did = applyKit(d, kit);
  assert.equal(d.layers.find((l) => l.id === "headline").colorRole, "ink");
  assert.equal(d.layers.find((l) => l.id === "wordmark").logo, "wordmark-ink");
  assert.ok(did.length >= 2);
  assert.equal(guard(d, "4:5", kit).filter((i) => i.level === "bad").length, 0);
});

test("the guard flags yellow type on warm white, and a missing logo", () => {
  const d = structuredClone(launch);
  d.bg.color = "white";
  const bad = guard(d, "4:5", kit).filter((i) => i.level === "bad").map((i) => i.rule);
  assert.ok(bad.includes("contrast") && bad.includes("logo-ground"));
  d.layers = d.layers.filter((l) => l.type !== "logo");
  assert.ok(guard(d, "4:5", kit).some((i) => i.rule === "logo"));
});

test("a wrapped paragraph keeps its lines but leaves no word alone on the last one", () => {
  // a context where every character is 10 px wide
  const ctx = { font: "", letterSpacing: "", measureText: (t) => ({ width: String(t).length * 10, actualBoundingBoxAscent: 7 }) };
  const text = "One photo in, a cinematic shot with sound out. One sentence in, a short film out.";
  const layer = { type: "text", text, size: 0.04, w: 0.25, fontRole: "text" };
  const words = (L) => L.lines.map((l) => l.runs.map((r) => r.t).join(""));
  const plain = layoutText(ctx, { ...layer, balance: false }, kit, 1000, 1000);
  const even = layoutText(ctx, layer, kit, 1000, 1000);
  assert.equal(words(plain).at(-1), "out.", "greedy wrapping leaves a widow here");
  assert.equal(even.lines.length, plain.lines.length, "the same number of lines");
  assert.ok(words(even).at(-1).split(" ").length > 1, `last line ${words(even).at(-1)}`);
  assert.equal(words(even).join(" "), text, "no word lost or moved out of order");
  assert.ok(Math.max(...even.lines.map((l) => l.w)) <= 250, "inside the box");
  // lines the author broke by hand stay as written
  assert.deepEqual(words(layoutText(ctx, { ...layer, text: "Direct a shot.\nOr a whole film." }, kit, 1000, 1000)), ["Direct a shot.", "Or a whole film."]);
});

test("applying the kit keeps a shape visible on its ground and gives colours the kit does not have a palette role", () => {
  const d = {
    id: "t", name: "t", format: "4:5", bg: { color: "ink" }, formats: {},
    layers: [
      newLayer("shape", { id: "card", shape: "round", role: "deco", colorRole: "ink", x: 0.1, y: 0.3, w: 0.8, h: 0.3 }),
      newLayer("text", { id: "headline", role: "headline", text: "Hello", size: 0.08, colorRole: "#ff00ff", x: 0.12, y: 0.35, w: 0.7 }),
      newLayer("logo", { id: "logo", logo: "wordmark-yellow", x: 0.07, y: 0.07, w: 0.3 }),
    ],
  };
  const did = applyKit(d, kit);
  const card = d.layers.find((l) => l.id === "card");
  assert.notEqual(card.colorRole, "ink", "an ink card on an ink ground is changed");
  assert.ok(contrast(colorOf(kit, card.colorRole), colorOf(kit, "ink")) >= 1.6);
  const head = d.layers.find((l) => l.id === "headline");
  assert.ok(kit.palette.some((p) => p.id === head.colorRole), `headline colour ${head.colorRole} is a palette role`);
  assert.ok(contrast(colorOf(kit, head.colorRole), colorOf(kit, card.colorRole)) >= 3, "the headline reads on the card it sits on");
  assert.ok(did.length >= 2);
});

test("a motion design is read at the moments that matter, with what is on screen then", () => {
  const intro = project.body.designs.find((d) => d.id === "intro");
  assert.ok(intro?.motion && intro.checkAt?.length, "the flagship's intro says when it is checked");
  const early = onScreen(intro, 0.5).layers.map((l) => l.id);
  const poster = onScreen(intro, intro.poster).layers.map((l) => l.id);
  const end = onScreen(intro, 6.9).layers.map((l) => l.id);
  assert.ok(early.includes("wordmark") && !early.includes("headline"), "the headline is not in yet at 0.5 s");
  assert.ok(poster.includes("headline") && poster.includes("window"), "the poster has the launch layout");
  assert.ok(end.includes("end-wordmark") && !end.includes("headline"), "the end card covers what was under it");
  assert.ok(onScreen(intro, 6.9).layers.every((l) => !l.anim), "what is on screen is shown whole");
  for (const f of ["9:16", "1:1", "4:5"]) assert.equal(guard(intro, f, kit).filter((i) => i.level === "bad").length, 0, `${f} has nothing bad`);
});

test("a motion layer's timing is shared by every format, where it settles is each format's own", () => {
  const intro = structuredClone(project.body.designs.find((d) => d.id === "intro"));
  const wm = (format) => layoutOf(intro, format, {}).layers.find((l) => l.id === "wordmark").anim;
  assert.notDeepEqual(wm("1:1").settle, wm("9:16").settle, "each format settles somewhere else");
  intro.layers.find((l) => l.id === "wordmark").anim.t0 = 0.6;
  for (const f of ["9:16", "1:1", "4:5"]) assert.equal(wm(f).t0, 0.6, `${f} follows the edited start`);
  assert.deepEqual(wm("1:1").lid, wm("9:16").lid, "the lid's timing is the base's too");
});

test("a design that does not move gets a first timing: the logo and its lid, then the rest from the top down", () => {
  const anims = firstTiming(launch, 6, kit);
  const at = (id) => anims[id].t0;
  assert.equal(anims.wordmark.in.fx, "wipe-r");
  assert.ok(anims.wordmark.lid && anims.wordmark.lid.t0 > anims.wordmark.t0, "the lid lifts after the wipe starts");
  assert.ok(at("headline") > at("wordmark") + 1, "the headline comes after the logo has landed");
  assert.ok(at("headline") < at("sub") && at("sub") < at("window"), "from the top down");
  assert.ok(at("badge-text") > at("badge") && at("badge-text") - at("badge") < 0.2, "a text arrives with the shape it sits on");
  assert.equal(anims.window.in.fx, "rise", "a wide picture rises");
  assert.equal(anims.brioche.in.fx, "pop", "a small picture pops");
  for (const [id, a] of Object.entries(anims)) {
    assert.ok(a.t0 + (a.in?.dur ?? 0) <= 6 - 0.5, `${id} is in with room to spare before 6 s`);
    assert.equal(a.t1, undefined, `${id} does not leave`);
  }
  const moving = { ...launch, layers: launch.layers.map((l) => ({ ...l, anim: anims[l.id] })) };
  assert.equal(soundPops(moving).length, 1, "one pop, where the lid lands");
  assert.equal(firstTiming({ ...launch, layers: launch.layers.filter((l) => l.type !== "logo") }, 6, kit).headline.t0 < 1, true, "without a logo it starts at once");
});

test("a variation is a whole copy that says what it comes from", () => {
  const v = cloneDesign(launch, { kind: "colour", note: "Yellow" });
  assert.notEqual(v.id, launch.id);
  assert.deepEqual([v.variant.of, v.variant.from, v.variant.kind], ["launch", "launch", "colour"]);
  assert.equal(v.layers.length, launch.layers.length);
  v.layers[0].x = 0.5;
  assert.notEqual(launch.layers[0].x, 0.5);
});

test("Brioche's answer is checked: unknown actions and fields are dropped", () => {
  const out = readMacaronAnswer(JSON.stringify({ reply: "Done.", actions: [{ op: "edit_text", layer: "headline", text: "Hi", evil: 1 }, { op: "format_disk" }, { op: "set_layer", layer: "sub", props: { size: 0.04, onclick: "x", text: "a" } }, { op: "make_variation", kind: "colour", actions: [{ op: "make_variation" }, { op: "apply_kit" }] }] }));
  assert.deepEqual(out.actions.map((a) => a.op), ["edit_text", "set_layer", "make_variation"]);
  assert.equal(out.actions[0].evil, undefined);
  assert.deepEqual(out.actions[1].props, { size: 0.04, text: "a" });
  assert.deepEqual(out.actions[2].actions.map((a) => a.op), ["apply_kit"]);
  assert.equal(readMacaronAnswer("not json").actions.length, 0);
  // a writer that answers as text can escape a break twice: it is read as the break it meant
  const twice = readMacaronAnswer('{"reply":"ok","actions":[{"op":"edit_text","layer":"headline","text":"Make shots\\\\nwith sound."},{"op":"set_layer","layer":"sub","props":{"text":"One\\\\ntwo"}}]}');
  assert.equal(twice.actions[0].text, "Make shots\nwith sound.");
  assert.equal(twice.actions[1].props.text, "One\ntwo");
});

test("what Brioche is told names the layers and the palette ids", () => {
  const text = macaronPrompt({ name: "Comfyture", kit: { palette: kit.palette, logos: kit.logos, type: kit.type, voice: kit.voice }, design: { id: "launch", name: "Launch", purpose: "Launch", status: "draft", format: "4:5", openFormat: "1:1", layers: launch.layers }, designs: [], assets: [] }, [{ role: "user", text: "Make it yellow" }]);
  assert.match(text, /- headline · text · headline/);
  assert.match(text, /yellow #F2FF59/);
  assert.match(text, /User: Make it yellow/);
});

test("whether a layer shows is each format's own: hiding it in one leaves the others alone", () => {
  const design = structuredClone(launch);
  const shows = (d, format) => !layoutOf(d, format, { reflow: (x, f) => reflow(x, f) }).layers.find((l) => l.id === "sub").hidden;
  patchLayerIn(design, "sub", { hidden: true }, "4:5", reflow);
  assert.deepEqual(["4:5", "1:1", "9:16"].map((f) => shows(design, f)), [false, true, true], "hidden in the first format only");
  assert.equal(design.layers.find((l) => l.id === "sub").hidden, undefined, "the layer itself is not marked: the other layouts would inherit it");
  patchLayerIn(design, "sub", { hidden: false }, "4:5", reflow);
  assert.deepEqual(["4:5", "1:1", "9:16"].map((f) => shows(design, f)), [true, true, true], "shown again");
  assert.equal(design.formats["4:5"], undefined, "and nothing is left behind for the first format");
  patchLayerIn(design, "sub", { hidden: true }, "1:1", reflow);
  assert.deepEqual(["4:5", "1:1", "9:16"].map((f) => shows(design, f)), [true, false, true], "a layout of its own keeps its own");
  // a format with no layout of its own is laid out first, then the layer is hidden there
  const bare = { ...structuredClone(launch), formats: {} };
  patchLayerIn(bare, "sub", { hidden: true }, "9:16", reflow);
  assert.deepEqual(["4:5", "1:1", "9:16"].map((f) => shows(bare, f)), [true, true, false]);
  assert.ok(bare.formats["9:16"].layers.headline, "what it was reflowed to is kept");
  // what is not a layout's (the colour) belongs to the layer, in whatever format it is changed
  patchLayerIn(bare, "headline", { colorRole: "yellow", y: 0.3 }, "9:16", reflow);
  assert.equal(bare.layers.find((l) => l.id === "headline").colorRole, "yellow");
  assert.equal(bare.formats["9:16"].layers.headline.y, 0.3);
  assert.notEqual(bare.layers.find((l) => l.id === "headline").y, 0.3);
});

// a few frames drawn by ffmpeg, to stand in for the ones the browser sends
async function frames(dir, n, size = "64x64") {
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `testsrc=s=${size}:r=10`, "-frames:v", String(n), "-start_number", "0", join(dir, "%05d.png")]);
  return Promise.all((await readdir(dir)).filter((f) => f.endsWith(".png")).sort().map((f) => readFile(join(dir, f))));
}
const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

test("a video is only made from frames that are all there, and what comes out is checked", { skip: !hasFfmpeg && "needs ffmpeg" }, async () => {
  const data = await mkdtemp(join(tmpdir(), "macaron-frames-"));
  const src = await mkdtemp(join(tmpdir(), "macaron-src-"));
  try {
    const pics = await frames(src, 12);
    const send = async (job, which, list = pics) => { for (const n of which) await keepFrame(data, job, n, list[n % list.length]); };
    const all = [...Array(12).keys()];
    const refused = (job, re) => assert.rejects(encodeFrames(data, job, { fps: 10, name: "t" }), (e) => e.status === 400 && re.test(e.message));
    // whole: made, and it says what it holds, as measured on the file
    await send("aaaaaa01", all);
    const made = await encodeFrames(data, "aaaaaa01", { fps: 10, name: "whole", sound: { pad: true, pops: [0.4] } });
    assert.deepEqual([made.frames, made.duration, made.width, made.height, made.sound], [12, 1.2, 64, 64, true]);
    // the same frames as WebM (VP9 with Opus): a file of its own kind, measured the same way
    await send("aaaaaa07", all);
    const web = await encodeFrames(data, "aaaaaa07", { fps: 10, name: "whole-webm", sound: { pad: true, pops: [0.4] }, container: "webm" });
    assert.deepEqual([web.frames, web.width, web.height, web.sound], [12, 64, 64, true]);
    assert.ok(Math.abs(web.duration - 1.2) < 0.06, `its length is the frames' (${web.duration} s)`);
    assert.match(web.file, /\.webm$/);
    assert.match(web.url, /\.webm$/);
    const head = readFileSync(join(data, "macaron", "exports", web.file)).subarray(0, 4);
    assert.deepEqual([...head], [0x1a, 0x45, 0xdf, 0xa3], "an EBML header: it is a WebM file");
    // one in the middle missing: ffmpeg would stop there and call the rest done
    await send("aaaaaa02", all.filter((n) => n !== 8));
    await refused("aaaaaa02", /frame 8/i);
    // the first missing
    await send("aaaaaa03", all.filter((n) => n !== 0));
    await refused("aaaaaa03", /frame 0/i);
    // one that is not a picture, one of another size, too few
    await send("aaaaaa04", all);
    await keepFrame(data, "aaaaaa04", 5, Buffer.from("not a picture at all, not even close to one"));
    await refused("aaaaaa04", /frame 5/i);
    await send("aaaaaa05", all);
    await mkdir(join(src, "small"));
    await keepFrame(data, "aaaaaa05", 6, (await frames(join(src, "small"), 1, "32x32"))[0]);
    await refused("aaaaaa05", /frame 6.*size|size.*frame 6/i);
    await send("aaaaaa06", [0, 1, 2, 3, 4, 5]);
    await refused("aaaaaa06", /at least 8 frames/i);
  } finally {
    await rm(data, { recursive: true, force: true });
    await rm(src, { recursive: true, force: true });
  }
});

test("a new picture's ledger line names its job and what it cost", () => {
  const line = JSON.parse(ledgerLine({ job: "ab12cd34", model: "gpt-image-2.5-flare", aspect: "4:5", refs: 1, credits: 5.84, prompt: "x".repeat(300) }));
  assert.deepEqual([line.job, line.model, line.aspect, line.refs, line.credits], ["ab12cd34", "gpt-image-2.5-flare", "4:5", 1, 5.84]);
  assert.equal(line.prompt.length, 120);
  assert.ok(Date.parse(line.at) > 0);
});

// ---------------------------------------------------------------- Brioche works in the workspace that is open

const opsOf = (space) => macaronTool(space).input_schema.properties.actions.items.properties.op.enum;

test("each workspace gives Brioche its own tool: only its actions, and a way to open another", () => {
  assert.deepEqual([...SPACES], ["idea", "kit", "content"]);
  assert.equal(spaceOf("nonsense"), "content", "a workspace she does not know is Content, where she always worked");
  const [idea, kit, content] = SPACES.map(opsOf);
  assert.deepEqual(idea.filter((o) => !["write_brief", "add_direction", "pick_direction", "add_note", "open_space"].includes(o)), []);
  assert.deepEqual(kit.filter((o) => !["set_colour", "add_colour", "add_colourway", "set_voice", "add_rule", "set_type", "open_space"].includes(o)), []);
  for (const o of ["edit_text", "set_layer", "make_variation", "generate_background", "add_design", "add_motion", "plan_design", "open_space"]) assert.ok(content.includes(o), `Content has ${o}`);
  for (const [name, ops] of [["idea", idea], ["kit", kit], ["content", content]]) assert.ok(ops.includes("open_space"), `${name} can open another workspace`);
  assert.ok(!content.includes("write_brief") && !content.includes("set_colour") && !idea.includes("set_layer") && !kit.includes("edit_text"), "nothing of another workspace is in a tool");
});

test("her brief is the open workspace's: its things and its actions, nothing of the others'", () => {
  const [idea, kit, content] = SPACES.map(macaronBrief);
  assert.match(idea, /write_brief/); assert.doesNotMatch(idea, /edit_text|set_layer|set_colour/);
  assert.match(kit, /add_colourway/); assert.doesNotMatch(kit, /edit_text|write_brief|make_variation/);
  assert.match(content, /edit_text/); assert.doesNotMatch(content, /write_brief|add_colourway|add_direction/);
  for (const text of [idea, kit, content]) assert.match(text, /macaron_answer/);
  assert.ok(content.length > kit.length && kit.length > 0 && idea.length > 0, "the content brief is the big one: the others stay small");
});

test("what her answer may do is checked against the workspace it was asked in", () => {
  const answer = (space, actions) => readMacaronAnswer(JSON.stringify({ reply: "Done.", actions }), space).actions;
  // Brand kit: colours are #RRGGBB, words and lists are cut, a content action is dropped
  const k = answer("kit", [{ op: "set_colour", id: "yellow", hex: "#f4ff70", name: "x".repeat(300) }, { op: "set_colour", id: "yellow", hex: "red" }, { op: "set_layer", layer: "sub", props: { size: 0.04 } }, { op: "set_voice", words: ["a", "b", "c", "d", "e", "f", "g", "h", "i"], dos: ["one"] }, { op: "add_rule", kind: "dont", text: "No glows" }, { op: "add_rule", kind: "evil", text: "x" }]);
  assert.deepEqual(k.map((a) => a.op), ["set_colour", "set_colour", "set_voice", "add_rule", "add_rule"]);
  assert.equal(k[0].hex, "#F4FF70"); assert.equal(k[0].name.length, 120); assert.equal(k[1].hex, undefined, "a colour that is not #RRGGBB is not a colour");
  assert.equal(k[2].words.length, 8);
  // Design idea: the brief's fields are the brief's, the rest is dropped
  const i = answer("idea", [{ op: "write_brief", fields: { pitch: "A warm home.", tone: "Plain", evil: "x", goal: 3 }, goals: ["Feel welcoming", "Make it simple"] }, { op: "add_direction", name: "Quiet craft", note: "Honest.", logo: "wordmark-plum" }, { op: "edit_text", layer: "headline", text: "x" }, { op: "pick_direction", id: "dir-warm" }]);
  assert.deepEqual(i.map((a) => a.op), ["write_brief", "add_direction", "pick_direction"]);
  assert.deepEqual(i[0].fields, { pitch: "A warm home.", tone: "Plain" }); assert.deepEqual(i[0].goals, ["Feel welcoming", "Make it simple"]);
  // Content: the planning and the new posts are its own, and a day is one of seven
  const c = answer("content", [{ op: "plan_design", design: "launch", day: "mon" }, { op: "add_design", name: "A post", purpose: "Launch", format: "1:1" }, { op: "add_motion", design: "launch" }, { op: "write_brief", fields: { pitch: "x" } }]);
  assert.deepEqual(c.map((a) => a.op), ["plan_design", "add_design", "add_motion"]);
  assert.equal(answer("content", [{ op: "plan_design", design: "launch", day: "mon" }])[0].day, "mon");
  // open_space is every workspace's
  for (const space of SPACES) assert.equal(answer(space, [{ op: "open_space", space: "kit" }])[0].space, "kit");
});

test("what she is told is the open workspace's things, and the tool picked", () => {
  const base = { name: "Comfyture", kit: { about: "A creation desk.", palette: kit.palette, logos: kit.logos, type: kit.type, voice: kit.voice } };
  const idea = macaronPrompt({ ...base, space: "idea", brief: { pitch: "A warm home.", goals: ["Feel welcoming"] }, directions: [{ id: "dir-warm", name: "Warm and bold", note: "Confident.", picked: true }], refs: [{ title: "Jam", kind: "inspiration" }], story: [{ title: "The mark", kind: "decision" }] }, []);
  assert.match(idea, /WORKSPACE OPEN: Design idea/); assert.match(idea, /dir-warm "Warm and bold" \(picked\)/); assert.match(idea, /A warm home\./); assert.match(idea, /The mark/);
  assert.doesNotMatch(idea, /THE DESIGN OPEN|Palette \(ids\)|Layers, bottom to top/);
  const kitText = macaronPrompt({ ...base, space: "kit", rules: [{ id: "r1", kind: "do", text: "Keep the lid on" }], colourways: [{ name: "Ink on yellow", ground: "yellow", logo: "wordmark-ink" }], lowContrast: [{ a: "yellow", b: "white", ratio: 1.1 }], products: [{ name: "The jar", features: ["Real plums"] }], design: { id: "launch", name: "Launch", layers: launch.layers } }, []);
  assert.match(kitText, /WORKSPACE OPEN: Brand kit/); assert.match(kitText, /Palette \(ids\).*yellow #F2FF59/); assert.match(kitText, /yellow on white 1\.1/); assert.match(kitText, /Keep the lid on/);
  assert.doesNotMatch(kitText, /THE DESIGN OPEN|Layers, bottom to top|THE BRIEF/, "the kit does not carry the design that is open");
  const content = macaronPrompt({ ...base, space: "content", design: { id: "launch", name: "Launch", purpose: "Launch", status: "approved", day: "mon", format: "4:5", openFormat: "4:5", layers: launch.layers }, designs: [{ id: "launch", name: "Launch", purpose: "Launch", format: "4:5", status: "approved", day: "mon" }], assets: [], brief: { pitch: "A warm home.", audience: "Makers" }, directions: [{ id: "dir-warm", name: "Warm and bold" }] }, []);
  assert.match(content, /WORKSPACE OPEN: Content/); assert.match(content, /planned mon/); assert.match(content, /- headline · text · headline/);
  assert.doesNotMatch(content, /DIRECTIONS \(ids\)|Colourways saved|Rules:/);
  // a tool picked adds what it asks; a tool of another workspace asks nothing
  assert.match(macaronPrompt({ ...base, space: "kit", preset: "colourway" }, []), /picked the tool Make a colourway/);
  assert.match(macaronPrompt({ ...base, space: "idea", preset: "direction" }, []), /picked the tool New direction/);
  assert.match(macaronPrompt({ ...base, space: "content", preset: "animate", design: { id: "launch", name: "L", layers: [] } }, []), /picked the tool Animate it/);
  assert.doesNotMatch(macaronPrompt({ ...base, space: "kit", preset: "direction" }, []), /picked the tool/);
  assert.doesNotMatch(macaronPrompt({ ...base, space: "content", preset: "nonsense" }, []), /picked the tool/);
});

test("a copy of a post is not on the plan: the day belongs to the post it was made from", () => {
  const planned = { ...structuredClone(launch), plan: { day: "mon" } };
  assert.equal(cloneDesign(planned, { kind: "copy" }).plan, undefined);
  assert.deepEqual(planned.plan, { day: "mon" });
});

test("the flagship's brief, directions and week are the workspaces' own", () => {
  const body = project.body;
  assert.ok(body.brief.pitch && body.brief.goals.length === 3 && body.brief.image, "a pitch, three goals and a picture");
  assert.equal(body.directions.length, 3);
  assert.equal(body.directions.filter((d) => d.picked).length, 1, "one direction is picked");
  for (const d of body.directions) assert.ok(body.kit.logos.some((l) => l.id === d.logo), `${d.name} shows a logo file of the kit`);
  const week = body.designs.filter((d) => d.plan?.day);
  assert.equal(week.length, 4);
  assert.deepEqual(week.map((d) => d.plan.day).sort(), ["fri", "mon", "sun", "wed"]);
  assert.ok(body.designs.filter((d) => d.variant && d.plan).length <= 1, "only one variation is on the plan");
  assert.ok(body.history.filter((h) => h.beat).length === 4, "the story names four chapters");
  assert.ok(body.refs.filter((r) => r.kind === "inspiration").length === 6, "a moodboard of six");
  assert.equal(body.kit.sizes.mark, 24);
});

test("Brioche's harness data and the server say the same: the workspaces, and what each tool asks of her", () => {
  assert.deepEqual(WORKSPACES.map((w) => w.id), [...SPACES], "the panel and the server have the same workspaces in the same order");
  assert.equal(BRIOCHE.name, "Brioche");
  for (const w of WORKSPACES) {
    assert.equal(PRESETS[w.id].length, 3, `${w.name} has three tools`);
    assert.match(PLACEHOLDER[w.id], /^Ask Brioche/, `the bar speaks for her in ${w.name}`);
    for (const t of PRESETS[w.id]) {
      assert.ok(t.id && t.icon && t.label, `${t.label ?? t.id} names itself`);
      assert.ok(Boolean(t.ask) !== Boolean(t.page), `${t.label} is words for her or something the page does, not both`);
      // words for her come with instructions of the server's, under the tool's id, in the workspace it belongs to
      if (t.ask) assert.match(macaronPrompt({ name: "x", space: w.id, preset: t.id, kit: {} }, []), /picked the tool/, `the server knows the tool ${t.id} of ${w.name}`);
    }
  }
  const asks = WORKSPACES.flatMap((w) => PRESETS[w.id].filter((t) => t.ask).map((t) => t.ask));
  assert.equal(new Set(asks).size, asks.length, "no two tools send the same words: the bar tells one from the other by them");
});

test("a flagship that version 1 put in gains the new example once, and nothing a person made is touched", () => {
  const seed = project.body;
  // what version 1 shipped: no idea, no directions, no moodboard, no chapters, no plan, no scene, no sizes, white files on ink
  const v1 = structuredClone(seed);
  delete v1.seedRev;
  v1.brief = { ...v1.brief, pitch: "", goals: [], image: "" };
  v1.directions = [];
  v1.refs = v1.refs.filter((r) => r.kind !== "inspiration");
  v1.history = v1.history.filter((h) => h.id !== "h-palette").map(({ beat, ...h }) => h);
  for (const d of v1.designs) delete d.plan;
  for (const p of v1.products) delete p.scene;
  delete v1.kit.sizes;
  for (const l of v1.kit.logos) if (/^(wordmark|mark)-white$/.test(l.id)) l.ground = "ink, plum";
  const up = topUpBrand(v1, seed);
  assert.equal(up.brief.pitch, seed.brief.pitch);
  assert.deepEqual(up.brief.goals, seed.brief.goals);
  assert.equal(up.directions.length, 3);
  assert.deepEqual(up.refs.slice(0, 6).map((r) => r.kind), Array(6).fill("inspiration"), "the moodboard's pictures come first");
  assert.equal(up.refs.length, seed.refs.length);
  assert.deepEqual(up.history.filter((h) => h.beat).map((h) => h.beat).sort(), ["The mark", "The palette", "The room", "The spark"]);
  assert.deepEqual(up.designs.filter((d) => d.plan).map((d) => d.plan.day).sort(), ["fri", "mon", "sun", "wed"]);
  assert.ok(up.products[0].scene && up.kit.sizes.mark === 24);
  assert.equal(up.kit.logos.find((l) => l.id === "wordmark-white").ground, "plum, ink");
  assert.equal(up.seedRev, 2);
  assert.equal(v1.brief.pitch, "", "the body it was given is not changed");
  // once: a second time there is nothing to do
  assert.equal(topUpBrand(up, seed), null);
  // what a person wrote stays: their idea, their directions, their week, their own picture of the jar
  const mine = structuredClone(v1);
  mine.brief.pitch = "My own words.";
  mine.directions = [{ id: "d1", name: "Mine", note: "", bg: "", logo: "", picked: true }];
  mine.designs.find((d) => d.id === "board").plan = { day: "thu" };
  mine.products[0].scene = "mine.webp";
  const kept = topUpBrand(mine, seed);
  assert.equal(kept.brief.pitch, "My own words.");
  assert.deepEqual(kept.directions.map((d) => d.name), ["Mine"]);
  assert.deepEqual(kept.designs.filter((d) => d.plan).map((d) => d.id), ["board"], "a week they planned is not planned again for them");
  assert.equal(kept.products[0].scene, "mine.webp");
  // a seed with no revision tops nothing up
  assert.equal(topUpBrand(v1, { ...seed, seedRev: undefined }), null);
});
