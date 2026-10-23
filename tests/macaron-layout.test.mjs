// Macaron's layout sense: layers in another format, layout presets, the brand kit applied, the guard.
//   node --test tests/macaron-layout.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { kitOf, layoutOf, contrast, colorOf, newLayer, textRuns, layoutText, FORMATS, ALL_FORMATS, FORMAT_KEYS, FAMILIES, FAMILY_KEYS, familyOf, familyFormats, shapeOf, nativeSize, ownFormats } from "../web/js/design.js";
import { reflow, layoutPreset, applyKit, guard, cloneDesign, safeRect, estimate, onScreen, firstTiming, soundPops, patchLayerIn, presetFor, withPreset, LAYOUTS } from "../web/js/macaron-layout.js";
import { SCENES, SCENE_IDS, sceneById, mockupPrompt } from "../web/js/macaron-mockup-scenes.js";
import { STARTERS, starterById, starterOf } from "../web/js/macaron-families.js";
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
  assert.deepEqual([...SPACES], ["kit", "idea", "studio", "create", "book"]);
  assert.equal(spaceOf("nonsense"), "create", "a workspace she does not know is Create, where she always worked");
  assert.equal(spaceOf("content"), "create", "what an older page called Content is Create");
  const [kit, idea, studio, create, book] = SPACES.map(opsOf);
  assert.deepEqual(idea.filter((o) => !["write_brief", "add_direction", "pick_direction", "add_note", "open_space"].includes(o)), []);
  assert.deepEqual(kit.filter((o) => !["set_colour", "add_colour", "add_colourway", "set_voice", "add_rule", "set_type", "add_pattern", "open_space"].includes(o)), []);
  for (const o of ["edit_text", "set_layer", "make_variation", "generate_background", "add_design", "add_motion", "plan_design", "propose_mockup", "open_space"]) assert.ok(create.includes(o), `Create has ${o}`);
  for (const [name, ops] of [["idea", idea], ["kit", kit], ["studio", studio], ["create", create], ["book", book]]) assert.ok(ops.includes("open_space"), `${name} can open another workspace`);
  assert.ok(!create.includes("write_brief") && !create.includes("set_colour") && !idea.includes("set_layer") && !kit.includes("edit_text") && !studio.includes("edit_text") && !book.includes("set_layer"), "nothing of another workspace is in a tool");
  assert.ok(!idea.includes("propose_mockup") && !kit.includes("propose_mockup"), "a mockup is proposed from Create only");
});

test("a pattern she draws for the kit is kept to its size: a tile of 40 to 480 units, its drawing, the logo files placed on it", () => {
  const out = readMacaronAnswer(JSON.stringify({ reply: "Moons.", actions: [
    { op: "add_pattern", name: "Moons", ground: "teal", w: 9000, h: 3, svg: "<circle cx='5' cy='5' r='3' fill='#FF8A3D'/>", marks: [{ logo: "mark-1", x: 3, y: -1, size: 2, rotate: 900, ink: "cream" }, { x: 0.5 }] },
    { op: "add_pattern", name: "Empty", svg: "  " },
  ] }), "kit");
  assert.equal(out.actions.length, 1, "a pattern with no drawing is dropped");
  const [a] = out.actions;
  assert.equal(a.w, 480); assert.equal(a.h, 40); assert.equal(a.ground, "teal"); assert.match(a.svg, /circle/);
  assert.deepEqual(a.marks, [{ logo: "mark-1", x: 1, y: 0, size: 6, rotate: 360, ink: "cream" }], "a mark without a logo is dropped, the others kept inside the tile");
  assert.deepEqual(readMacaronAnswer(JSON.stringify({ reply: "", actions: [{ op: "add_pattern", svg: "<rect/>" }] }), "create").actions, [], "only the Brand kit makes patterns");
});

test("her brief is the open workspace's: its things and its actions, nothing of the others'", () => {
  const [kit, idea, studio, create, book] = SPACES.map(macaronBrief);
  assert.match(idea, /write_brief/); assert.doesNotMatch(idea, /edit_text|set_layer|set_colour/);
  assert.match(kit, /add_colourway/); assert.doesNotMatch(kit, /edit_text|write_brief|make_variation/);
  assert.match(kit, /add_pattern/); assert.match(kit, /Brand kit \(palette, logos, type, patterns/, "every workspace's brief says a pattern is the Brand kit's");
  assert.match(create, /a brand pattern[^.]*is made here and only here/, "so she does not send a pattern to Create");
  assert.match(create, /edit_text/); assert.doesNotMatch(create, /write_brief|add_colourway|add_direction/);
  assert.match(studio, /THE OPEN WORKSPACE: Studio/); assert.match(book, /THE OPEN WORKSPACE: Brand book/);
  for (const text of [idea, kit, studio, create, book]) assert.match(text, /macaron_answer/);
  assert.ok(create.length > kit.length && kit.length > 0 && idea.length > 0, "the Create brief is the big one: the others stay small");
  // Create's brief names the families and their formats, and says when a mockup is proposed
  for (const f of ALL_FORMATS) assert.ok(create.includes(f), `the brief names the format ${f}`);
  for (const f of FAMILY_KEYS) assert.match(create, new RegExp(`${f}: `));
  assert.match(create, /propose_mockup \{scene, design\}/); assert.match(create, /spends nothing/);
  for (const id of SCENE_IDS) assert.ok(create.includes(id), `the brief lists the scene ${id}`);
});

test("what her answer may do is checked against the workspace it was asked in", () => {
  const answer = (space, actions) => readMacaronAnswer(JSON.stringify({ reply: "Done.", actions }), space).actions;
  // Brand kit: colours are #RRGGBB, words and lists are cut, a content action is dropped
  const k = answer("kit", [{ op: "set_colour", id: "yellow", hex: "#f4ff70", name: "x".repeat(300) }, { op: "set_colour", id: "yellow", hex: "red" }, { op: "set_layer", layer: "sub", props: { size: 0.04 } }, { op: "set_voice", words: Array.from({ length: 12 }, (_, i) => `w${i}`) }, { op: "add_rule", kind: "do", text: "Keep the lid on" }, { op: "add_rule", kind: "dont", text: "Stretch it" }]);
  assert.deepEqual(k.map((a) => a.op), ["set_colour", "set_colour", "set_voice", "add_rule", "add_rule"]);
  assert.equal(k[0].hex, "#F4FF70"); assert.equal(k[0].name.length, 120); assert.equal(k[1].hex, undefined, "a colour that is not #RRGGBB is not a colour");
  assert.equal(k[2].words.length, 8);
  // Design idea: the brief's fields are the brief's, the rest is dropped
  const i = answer("idea", [{ op: "write_brief", fields: { pitch: "A warm home.", tone: "Plain", evil: "x", goal: 3 }, goals: ["Feel welcoming", "Make it simple"] }, { op: "add_direction", name: "Quiet craft", note: "Hon" }, { op: "pick_direction", id: "dir-warm" }, { op: "set_layer", layer: "sub" }]);
  assert.deepEqual(i.map((a) => a.op), ["write_brief", "add_direction", "pick_direction"]);
  assert.deepEqual(i[0].fields, { pitch: "A warm home.", tone: "Plain" }); assert.deepEqual(i[0].goals, ["Feel welcoming", "Make it simple"]);
  // Create: the planning and the new designs are its own, and a day is one of seven
  const c = answer("create", [{ op: "plan_design", design: "launch", day: "mon" }, { op: "add_design", name: "A post", purpose: "Launch", format: "1:1" }, { op: "add_motion", design: "launch" }, { op: "write_brief", fields: { pitch: "x" } }]);
  assert.deepEqual(c.map((a) => a.op), ["plan_design", "add_design", "add_motion"]);
  assert.equal(answer("create", [{ op: "plan_design", design: "launch", day: "mon" }])[0].day, "mon");
  // open_space is every workspace's
  for (const space of SPACES) assert.equal(answer(space, [{ op: "open_space", space: "kit" }])[0].space, "kit");
});

test("Create's new fields are the app's own ids: a format, a family, a scene, anything else is dropped", () => {
  const answer = (actions) => readMacaronAnswer(JSON.stringify({ reply: "Done.", actions }), "create").actions;
  const [banner, flyer, nonsense, family, adapt] = answer([
    { op: "add_design", name: "Spring banner", purpose: "Offer", format: "ad-728x90", layout: "strip" },
    { op: "add_design", name: "Flyer", family: "print" },
    { op: "add_design", name: "Odd", format: "17:3", family: "nope" },
    { op: "add_design", family: "web", format: "og" },
    { op: "adapt_format", format: "a4" },
  ]);
  assert.equal(banner.format, "ad-728x90"); assert.equal(banner.layout, "strip");
  assert.equal(flyer.family, "print"); assert.equal(flyer.format, undefined);
  assert.equal(nonsense.format, undefined, "a format that is not one of the app's is dropped"); assert.equal(nonsense.family, undefined);
  assert.deepEqual([family.family, family.format], ["web", "og"]);
  assert.equal(adapt.format, "a4", "an adapt_format reads every family's formats");
  // a mockup is proposed for a scene the app has; with another it is not an action at all
  const m = answer([{ op: "propose_mockup", scene: "poster-wall", design: "launch" }, { op: "propose_mockup", scene: "the moon" }, { op: "propose_mockup" }, { op: "propose_mockup", scene: "billboard", design: "x".repeat(300), evil: 1 }]);
  assert.deepEqual(m.map((a) => a.scene), ["poster-wall", "billboard"]);
  assert.equal(m[0].design, "launch"); assert.equal(m[1].design.length, 120); assert.equal(m[1].evil, undefined);
  // none of it is Studio's or the Brand book's
  for (const space of ["idea", "kit", "studio", "book"]) assert.deepEqual(readMacaronAnswer(JSON.stringify({ reply: "x", actions: [{ op: "propose_mockup", scene: "box" }, { op: "add_design", format: "a4" }] }), space).actions, [], `${space} makes no designs and proposes no mockups`);
  // the tool's schema carries the same ids
  const props = macaronTool("create").input_schema.properties.actions.items.properties;
  assert.deepEqual(props.format.enum, ALL_FORMATS); assert.deepEqual(props.family.enum, FAMILY_KEYS); assert.deepEqual(props.scene.enum, SCENE_IDS);
});

test("what she is told is the open workspace's things, and nothing a tool of the panel used to add", () => {
  const base = { name: "Comfyture", kit: { about: "A creation desk.", palette: kit.palette, logos: kit.logos, type: kit.type, voice: kit.voice } };
  const idea = macaronPrompt({ ...base, space: "idea", brief: { pitch: "A warm home.", goals: ["Feel welcoming"] }, directions: [{ id: "dir-warm", name: "Warm and bold", note: "Confident.", picked: true }], refs: [{ title: "Jam", kind: "inspiration" }], story: [{ title: "The mark", kind: "decision" }] }, []);
  assert.match(idea, /WORKSPACE OPEN: Design idea/); assert.match(idea, /dir-warm "Warm and bold" \(picked\)/); assert.match(idea, /A warm home\./); assert.match(idea, /The mark/);
  assert.doesNotMatch(idea, /THE DESIGN OPEN|Palette \(ids\)|Layers, bottom to top/);
  const kitText = macaronPrompt({ ...base, space: "kit", rules: [{ id: "r1", kind: "do", text: "Keep the lid on" }], colourways: [{ name: "Ink on yellow", ground: "yellow", logo: "wordmark-ink" }], lowContrast: [{ a: "yellow", b: "white", ratio: 1.1 }], design: { id: "launch", name: "Launch", layers: launch.layers } }, []);
  assert.match(kitText, /WORKSPACE OPEN: Brand kit/); assert.match(kitText, /Palette \(ids\).*yellow #F2FF59/); assert.match(kitText, /yellow on white 1\.1/); assert.match(kitText, /Keep the lid on/);
  assert.doesNotMatch(kitText, /THE DESIGN OPEN|Layers, bottom to top|THE BRIEF|Products:/, "the kit does not carry the design that is open, nor the product");
  const designs = Array.from({ length: 40 }, (_, n) => ({ id: `d${n}`, name: `Design ${n}`, purpose: "Launch", format: n % 2 ? "ad-728x90" : "4:5", family: n % 2 ? "ads" : "social", status: "draft" }));
  const assets = Array.from({ length: 25 }, (_, n) => ({ id: `a${n}`, name: `Asset ${n}`, kind: "render", width: 1080, height: 1080 }));
  const create = macaronPrompt({ ...base, space: "create", design: { id: "launch", name: "Launch", purpose: "Launch", status: "approved", day: "mon", format: "4:5", family: "social", openFormat: "4:5", safe: safeRect("4:5"), siblings: familyFormats("4:5").map((f) => ({ id: f, name: FORMATS[f].name, ...nativeSize(f), own: f === "4:5", safe: safeRect(f) })), layers: launch.layers }, designs: [{ id: "launch", name: "Launch", purpose: "Launch", format: "4:5", family: "social", status: "approved", day: "mon" }, ...designs], assets, mockups: [{ scene: "poster-wall", design: "launch" }], brief: { pitch: "A warm home.", audience: "Makers" }, directions: [{ id: "dir-warm", name: "Warm and bold" }] }, []);
  assert.match(create, /WORKSPACE OPEN: Create/); assert.match(create, /planned mon/); assert.match(create, /- headline · text · headline/);
  assert.match(create, /FORMATS OF ITS FAMILY \(social\): 4:5 Portrait 1080x1350px \(has its layout\) safe x 0\.07-0\.93/);
  assert.match(create, /safe x 0\.07-0\.93 y 0\.06-0\.94\)/, "the open format's safe zone is told");
  assert.match(create, /MOCKUPS MADE: poster-wall of launch/);
  assert.equal((create.match(/ \(Launch, (social|ads) /g) ?? []).length, 30, "other designs: thirty at most, each with its family");
  assert.equal((create.match(/ \(render, 1080x1080\)/g) ?? []).length, 10, "the ten most recent assets");
  assert.doesNotMatch(create, /DIRECTIONS \(ids\)|Colourways saved|Rules:/);
  // the panel has no tools any more: a preset id asks nothing of her, in any workspace
  for (const space of SPACES) assert.doesNotMatch(macaronPrompt({ ...base, space, preset: "colourway" }, []), /picked the tool/);
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

test("Brioche's harness data and the server say the same: the workspaces, and no canned tools", () => {
  assert.deepEqual(WORKSPACES.map((w) => w.id), [...SPACES], "the panel and the server have the same workspaces in the same order");
  assert.equal(BRIOCHE.name, "Brioche");
  for (const w of WORKSPACES) {
    assert.deepEqual(PRESETS[w.id], [], `${w.name} has no row of canned tools: the panel shows the brand's health`);
    assert.match(PLACEHOLDER[w.id], /^Ask Brioche/, `the bar speaks for her in ${w.name}`);
  }
  assert.match(PLACEHOLDER.create, /story version/, "Create's bar says what she can do there");
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
  delete v1.ugc;
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
  assert.deepEqual(up.ugc.map((u) => u.persona), ["emma", "leo", "maya"], "the example's UGC stories come in when the brand has none");
  assert.equal(up.seedRev, seed.seedRev);
  // a brand that already has a story of its own keeps it, and gains none of the example's
  const own = topUpBrand({ ...structuredClone(v1), ugc: [{ id: "u-mine", persona: "leo", hook: "Mine", beats: [] }] }, seed);
  assert.deepEqual(own.ugc.map((u) => u.id), ["u-mine"]);
  // an example story put in before stories named their product is told the one it shows (the app), nothing else of it touched
  const told = topUpBrand({ ...structuredClone(seed), seedRev: 3, ugc: seed.ugc.map(({ product, ...u }) => ({ ...u, hook: "Edited" })) }, seed);
  assert.ok(told.ugc.every((u) => u.product === "desk" && u.hook === "Edited"));
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

// ---------------------------------------------------------------- the formats of every family

/** What is wrong with a layout in a format, by the estimate: type outside the safe zone, type too small, type on type. */
function troubles(design, format, over) {
  const F = FORMATS[format];
  const S = safeRect(format);
  const lay = layoutOf({ ...design, formats: { [format]: { layers: over } } }, format, {}).layers.filter((l) => !l.hidden);
  const boxes = lay.filter((l) => l.type === "text" || l.type === "logo").map((l) => ({ id: l.id, size: l.size, type: l.type, x: l.x * F.w, y: l.y * F.h, ...estimate(l, F.w, F.h) }));
  const out = [];
  for (const b of boxes) {
    if (b.x < (S.x - 0.011) * F.w || b.x + b.w > (S.x + S.w + 0.011) * F.w) out.push(`${b.id} is outside the safe zone across`);
    if (b.y < (S.y - 0.011) * F.h || b.y + b.h > (S.y + S.h + 0.011) * F.h) out.push(`${b.id} is outside the safe zone down (${(b.y / F.h).toFixed(2)} + ${(b.h / F.h).toFixed(2)} in ${S.y.toFixed(2)} to ${(S.y + S.h).toFixed(2)})`);
    if (b.type === "text" && b.size < 0.0225) out.push(`${b.id} is too small (${b.size})`);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let k = i + 1; k < boxes.length; k++) {
      const [a, b] = [boxes[i], boxes[k]];
      if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 8 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 4) out.push(`${a.id} and ${b.id} overlap`);
    }
  }
  return out;
}

test("the families hold every format once, and the three of social posts are as they always were", () => {
  assert.deepEqual(FAMILY_KEYS, ["social", "ads", "print", "web", "app", "video"]);
  assert.deepEqual(FAMILY_KEYS.flatMap((f) => FAMILIES[f].formats).sort(), [...ALL_FORMATS].sort(), "each format is in one family");
  for (const f of ALL_FORMATS) {
    const F = FORMATS[f];
    assert.ok(F.name && F.use && F.label && F.family && F.safe && F.px, `${f} is described`);
    assert.equal(F.w, 1080, `${f}: every frame is 1080 wide, so a text size reads the same in all of them`);
    assert.equal(familyOf(f), F.family); assert.ok(FAMILIES[F.family].formats.includes(f));
    assert.ok(F.safe.l + F.safe.r < 0.5 && F.safe.t + F.safe.b < 0.5, `${f} keeps a room to work in`);
    assert.ok(Math.abs(F.h / F.w - F.px[1] / F.px[0]) < 0.002, `${f}: the frame has the shape of the real thing`);
  }
  assert.deepEqual(FORMAT_KEYS, ["4:5", "1:1", "9:16"]);
  assert.deepEqual(["4:5", "1:1", "9:16"].map((f) => [FORMATS[f].w, FORMATS[f].h, nativeSize(f).w, nativeSize(f).h]), [[1080, 1350, 1080, 1350], [1080, 1080, 1080, 1080], [1080, 1920, 1080, 1920]]);
  assert.deepEqual(FORMATS["9:16"].safe, { l: 0.06, r: 0.1, t: 0.13, b: 0.18 }, "the story's zones are unchanged");
  assert.deepEqual(familyFormats("728x90" in FORMATS ? "728x90" : "ad-728x90"), ["ad-300x250", "ad-728x90", "ad-160x600"]);
});

test("a format leaves as the pixels the real thing is made of", () => {
  const px = Object.fromEntries(ALL_FORMATS.map((f) => [f, [nativeSize(f).w, nativeSize(f).h]]));
  assert.deepEqual(px.a4, [2480, 3508], "an A4 is 2480 x 3508 at 300 dpi");
  assert.deepEqual(px.a5, [1748, 2480]); assert.deepEqual(px.a5l, [2480, 1748]);
  assert.deepEqual(px["ad-300x250"], [300, 250]); assert.deepEqual(px["ad-728x90"], [728, 90]); assert.deepEqual(px["ad-160x600"], [160, 600]);
  assert.deepEqual(px.og, [1200, 630]); assert.deepEqual(px.hero, [1440, 900]); assert.deepEqual(px.email, [600, 200]);
  assert.deepEqual(px["16:9"], [1920, 1080]); assert.deepEqual(px.phone, [1170, 2532]); assert.deepEqual(px.store, [1290, 2796]);
});

test("a frame is wide, tall, square, portrait or a strip by its shape", () => {
  const shapes = Object.fromEntries(ALL_FORMATS.map((f) => [f, shapeOf(f)]));
  assert.deepEqual([shapes["4:5"], shapes["1:1"], shapes["9:16"]], ["portrait", "square", "tall"]);
  assert.deepEqual([shapes["16:9"], shapes.hero, shapes.og, shapes["ad-300x250"], shapes.a5l], ["wide", "wide", "wide", "wide", "wide"]);
  assert.deepEqual([shapes["ad-728x90"], shapes.email], ["strip", "strip"]);
  assert.deepEqual([shapes["ad-160x600"], shapes.phone, shapes.store], ["tall", "tall", "tall"]);
  assert.deepEqual([shapes.a4, shapes.a5, shapes.a2], ["portrait", "portrait", "portrait"]);
});

test("a design may have a layout in a format of any family", () => {
  const d = { ...structuredClone(launch), formats: { "ad-728x90": { layers: {} }, a4: { layers: {} } } };
  assert.deepEqual(ownFormats(d).filter((f) => !["4:5", "1:1", "9:16"].includes(f)), ["ad-728x90", "a4"]);
  assert.equal(ownFormats(launch).includes(launch.format), true);
});

test("every preset places the launch design inside every format's safe zone, readable and without type on type", () => {
  for (const format of ALL_FORMATS) {
    for (const preset of Object.keys(LAYOUTS)) {
      const bad = troubles(launch, format, layoutPreset(launch, format, preset));
      assert.deepEqual(bad, [], `${preset} in ${format}`);
    }
  }
});

test("the launch design reflowed into every format keeps type in the safe zone, readable and apart", () => {
  const bare = { ...launch, formats: {} };
  for (const format of ALL_FORMATS.filter((f) => f !== launch.format && f !== "1:1")) assert.deepEqual(troubles(bare, format, reflow(bare, format)), [], `reflow to ${format}`);
});

test("a banner is one line: the logo, the headline, a call to action, and nothing else", () => {
  const withCta = { ...structuredClone(launch), layers: [...launch.layers, newLayer("text", { id: "cta", name: "Call to action", role: "cta", text: "Shop now", size: 0.028, colorRole: "yellow" })] };
  for (const format of ["ad-728x90", "email"]) {
    const over = layoutPreset(withCta, format, "stack");
    assert.equal(over.badge.hidden, true, `${format}: the badge has no room`); assert.equal(over["badge-text"].hidden, true); assert.equal(over.brioche.hidden, true, `${format}: nor has the mascot`);
    assert.ok(over.wordmark.x + over.wordmark.w <= over.headline.x + 0.001, `${format}: the logo is before the words`);
    assert.ok(over.cta.x >= over.headline.x + over.headline.w - 0.001, `${format}: the call to action is after them`);
    assert.deepEqual(troubles(withCta, format, over), [], format);
    // the logo and the words share the middle of the strip
    const F = FORMATS[format];
    const mid = (id) => (over[id].y * F.h + estimate({ ...withCta.layers.find((x) => x.id === id), ...over[id] }, F.w, F.h).h / 2) / F.h;
    assert.ok(Math.abs(mid("wordmark") - mid("headline")) < 0.06 && Math.abs(mid("cta") - mid("headline")) < 0.06, `${format}: centred on one line`);
  }
  // the short strip says the headline only, the email header has room for the subhead
  assert.equal(layoutPreset(launch, "ad-728x90", "strip").sub.hidden, true);
  const short = { ...structuredClone(launch), layers: launch.layers.map((l) => (l.id === "sub" ? { ...l, text: "Open source." } : l)) };
  assert.equal(layoutPreset(short, "email", "strip").sub.hidden, undefined);
  assert.equal(layoutPreset(launch, "email", "strip").sub.hidden, true, "a subhead too long for the strip is left out, not squeezed");
});

test("a frame of another kind is laid out afresh by what its layers are for, not squeezed", () => {
  const bare = { ...structuredClone(launch), formats: {} };
  assert.deepEqual(reflow(bare, "ad-728x90").headline, layoutPreset(bare, "ad-728x90", "strip").headline, "a post becomes a banner by the strip layout");
  assert.deepEqual(reflow(bare, "16:9").headline, layoutPreset(bare, "16:9", presetFor("16:9", bare)).headline, "a post becomes a cover by the split layout");
  assert.equal(presetFor("ad-728x90", bare), "strip"); assert.equal(presetFor("16:9", bare), "split"); assert.equal(presetFor("phone", { layers: [] }), "stack");
  // a frame of the same kind keeps the reflow it always had
  assert.notDeepEqual(reflow(bare, "9:16").headline, layoutPreset(bare, "9:16", "left").headline);
  // a layout in a banner is the design's own from then on
  const made = withPreset(bare, "ad-300x250", "split");
  assert.ok(made.formats["ad-300x250"].layers.headline, "the layout is kept in the design");
  assert.equal(made.layers.find((l) => l.id === "headline").x, bare.layers.find((l) => l.id === "headline").x, "the first format's own layout is untouched");
});

test("applying the kit to a banner keeps what is in its family inside the safe zone and makes no layouts of other families", () => {
  const d = structuredClone(launch);
  d.formats = {};
  applyKit(d, kit);
  assert.deepEqual(Object.keys(d.formats).filter((f) => !FAMILIES.social.formats.includes(f)), [], "a post gains no banner layout by applying the kit");
  const banner = { ...structuredClone(launch), format: "ad-300x250", formats: {} };
  banner.layers = launch.layers.map((l) => ({ ...l, ...layoutPreset(launch, "ad-300x250", "split")[l.id] }));
  applyKit(banner, kit);
  assert.deepEqual(Object.keys(banner.formats).filter((f) => FAMILIES.social.formats.includes(f)), [], "nor does a banner gain post layouts");
});

test("the guard reads a design in any format against that format's safe zone", () => {
  const over = layoutPreset(launch, "ad-728x90", "strip");
  const banner = { ...structuredClone(launch), format: "ad-728x90", formats: {}, layers: launch.layers.map((l) => ({ ...l, ...(over[l.id] ?? {}) })) };
  assert.deepEqual(guard(banner, "ad-728x90", kit).filter((i) => i.level === "bad" || i.rule === "safe" || i.rule === "overlap"), []);
  const spilled = structuredClone(banner);
  spilled.layers.find((l) => l.id === "headline").y = 0.95;
  assert.ok(guard(spilled, "ad-728x90", kit).some((i) => i.rule === "safe"), "type outside the strip's zone is flagged");
});

test("the starters are a design from the kit in a format of their family, with a layout that places it", () => {
  assert.equal(STARTERS.length, 13);
  assert.equal(new Set(STARTERS.map((s) => s.id)).size, STARTERS.length);
  for (const s of STARTERS) {
    assert.ok(FORMATS[s.format], `${s.id}: its format exists`);
    assert.equal(familyOf(s.format), s.family, `${s.id}: its format is in its family`);
    assert.ok(LAYOUTS[s.layout], `${s.id}: its layout exists`);
    assert.ok(s.name && s.purpose && s.texts, `${s.id} is described`);
    const d = structuredClone(launch);
    const cta = s.cta ? [newLayer("text", { id: "cta", role: "cta", text: s.cta, size: 0.028, colorRole: "yellow" })] : [];
    const start = { ...d, format: s.format, formats: {}, layers: [...d.layers, ...cta] };
    assert.deepEqual(troubles(start, s.format, layoutPreset(start, s.format, s.layout)), [], `${s.id} in ${s.format} as ${s.layout}`);
  }
  for (const f of ["post", "story", "flyer", "poster", "banner", "hero", "share", "email", "store", "screen", "cover"]) assert.ok(starterById(f).id === f, `a starter for ${f}`);
  assert.equal(starterOf("ads").family, "ads"); assert.equal(starterOf("nonsense").id, "post");
  assert.deepEqual(FAMILY_KEYS.filter((f) => !STARTERS.some((s) => s.family === f)), [], "every family can be started");
});

test("a mockup scene is known by the page and by Brioche, and its words keep the design as it is", () => {
  assert.equal(SCENES.length, 12); assert.equal(new Set(SCENE_IDS).size, 12);
  for (const s of SCENES) {
    assert.ok(["print", "packaging", "digital"].includes(s.group) && ["4:5", "1:1", "9:16", "16:9"].includes(s.aspect) && s.name && s.on, `${s.id} is described`);
    assert.match(mockupPrompt(s), /@design/); assert.match(mockupPrompt(s), /@scene/); assert.match(mockupPrompt(s), /exactly as it is/);
    assert.match(mockupPrompt(s), new RegExp(s.on.slice(0, 20)));
  }
  assert.match(mockupPrompt(SCENES[0], { light: "evening", angle: "close" }), /golden-hour evening light.*close-up/);
  assert.equal(sceneById("nope"), null);
});

test("the guard says when type sits over the product cut-out, and says nothing of type over a full-bleed picture or clear of the product", () => {
  const make = (headY, hero = {}) => ({
    id: "t", name: "t", purpose: "Launch", status: "draft", format: "4:5", formats: {}, bg: { color: "ink" },
    layers: [
      newLayer("image", { id: "hero", role: "hero", src: "bottle.png", fit: "contain", clear: true, x: 0.3, y: 0.5, w: 0.4, h: 0.4, ...hero }),
      newLayer("text", { id: "headline", role: "headline", text: "Taro says goodnight", size: 0.07, x: 0.08, y: headY, w: 0.84, align: "center", colorRole: "white", fontRole: "display" }),
    ],
  });
  const rules = (d, sizes = {}) => guard(d, "4:5", kit, estimate, sizes).map((i) => i.rule);
  assert.ok(rules(make(0.6)).includes("product"), "type across the cut-out is flagged");
  assert.deepEqual(guard(make(0.6), "4:5", kit, estimate).filter((i) => i.rule === "product").map((i) => i.layer), ["headline"], "and names the type");
  assert.ok(!rules(make(0.12)).includes("product"), "type above the product is clear of it");
  // a full-bleed picture is a ground: type over it is how a poster is made
  assert.ok(!rules(make(0.6, { x: 0, y: 0, w: 1, h: 1, clear: false, role: "background", fit: "cover" })).includes("product"));
  // a picture set to fit its box is the product at its own shape: a wide box round a tall bottle is not the bottle
  const beside = (shape) => { const d = make(0.6, { x: 0.05, w: 0.9 }); Object.assign(d.layers[1], { text: "Hi", x: 0.05, w: 0.25, align: "left" }); return rules(d, { "bottle.png": shape }); };
  assert.ok(!beside({ w: 100, h: 400 }).includes("product"), "type beside a tall bottle in a wide box is not over it");
  assert.ok(beside({ w: 400, h: 100 }).includes("product"), "but over a wide product that fills the box it is");
});

test("in a strip the subhead has room to breathe under the headline, a share of its own type and not a sliver of the strip's height", () => {
  const strip = (head, sub, format) => {
    const d = structuredClone(launch);
    d.format = format; d.formats = {};
    d.layers.find((l) => l.id === "headline").text = head;
    d.layers.find((l) => l.id === "sub").text = sub;
    const over = layoutPreset(d, format, "strip");
    const [W, H] = [FORMATS[format].w, FORMATS[format].h];
    const at = (id) => { const l = { ...d.layers.find((x) => x.id === id), ...over[id] }; return { l, m: estimate(l, W, H) }; };
    return { h: at("headline"), s: at("sub"), H, W };
  };
  for (const [head, sub] of [["Taro's moonlit note.", "A short line for the people who read to the end."], ["One cup, then the moon, then a long night of tea.", "Cold-brew oolong in a glass bottle."]]) {
    const { h, s, H, W } = strip(head, sub, "email");
    assert.ok(!s.l.hidden, "the email header has room for its subhead");
    const gap = s.l.y * H - (h.l.y * H + h.m.h);
    assert.ok(gap >= (s.l.size * W) * 0.3, `the lines are ${gap.toFixed(1)} px apart (the subhead's type is ${(s.l.size * W).toFixed(0)} px)`);
    assert.ok(s.l.y * H + s.m.h <= H, "and both sit inside the strip");
  }
  // a short strip still says the headline only
  assert.ok(strip("Taro's moonlit note.", "Cold-brew oolong.", "ad-728x90").s.l.hidden);
});
