// Macaron's layout sense: layers in another format, layout presets, the brand kit applied, the guard.
//   node --test tests/macaron-layout.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kitOf, layoutOf, contrast, colorOf, newLayer, textRuns, layoutText, FORMATS } from "../web/js/design.js";
import { reflow, layoutPreset, withPreset, applyKit, guard, cloneDesign, safeRect, estimate, onScreen, firstTiming, soundPops } from "../web/js/macaron-layout.js";
import { readMacaronAnswer, macaronPrompt } from "../server/macaron.ts";

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
