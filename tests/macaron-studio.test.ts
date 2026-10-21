// Brioche in the Studio: her tool offers the Studio's actions and no others, her answer is read and kept to the ids the page knows, what
// she is told is the Studio's things only (the kit, the product, the setup, the shoots, the stories, the graphics), and the plain modules the
// Studio is built from (the setup's words, the UGC stories, the motion graphics) do what they say. No model is called.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as macaron from "../server/macaron.ts";
import * as studio from "../server/macaron-studio.ts";
import { LIGHTS, SURFACES, setupOf, studioWords, setupLine } from "../web/js/macaron-studio-setup.js";
import { PERSONAS, BEATS, newStory, beatPrompt, beatTake, cleanStory, applyStory, storyCost, beatCost, storyLength } from "../web/js/macaron-ugc-data.js";
import { GRAPHIC_KINDS, GRAPHIC_IDS, buildGraphic, defaultFields, cleanFields, rolesOf } from "../web/js/macaron-graphics-data.js";

const root = join(import.meta.dirname, "..");
const KIT = {
  palette: [{ id: "yellow", name: "Yellow", hex: "#F2FF59", role: "Signal" }, { id: "ink", name: "Ink", hex: "#211927", role: "Ground" }, { id: "plum", name: "Plum", hex: "#49378B", role: "Second ground" }, { id: "white", name: "Warm white", hex: "#F0EFED", role: "Text" }],
  logos: [{ id: "wordmark-yellow", kind: "wordmark", tone: "yellow" }],
  tagline: "Shots worth keeping.",
};

// ---------------------------------------------------------------- her tool and her brief

test("in the Studio her tool offers the Studio's actions and open_space, with the fields they carry", () => {
  const tool = macaron.macaronTool("studio");
  assert.equal(tool.name, "macaron_answer");
  const item = (tool.input_schema.properties.actions as any).items;
  assert.deepEqual(item.properties.op.enum, ["open_space", "propose_shoot", "set_studio", "write_ugc", "add_motion_graphic"]);
  for (const k of ["template", "light", "surface", "background", "persona", "hook", "beats", "kind", "copy", "seconds", "ease", "space"]) assert.ok(k in item.properties, `the tool carries ${k}`);
  assert.deepEqual(item.properties.light.enum, LIGHTS.map((l) => l.id));
  assert.deepEqual(item.properties.persona.enum, PERSONAS.map((p) => p.id));
  assert.deepEqual(item.properties.kind.enum, GRAPHIC_IDS);
  // nothing of Create's actions
  for (const op of ["edit_text", "set_layer", "make_variation", "write_brief", "set_colour"]) assert.ok(!item.properties.op.enum.includes(op), `${op} is not a Studio action`);
});

test("the server's list of Studio actions is the page's", () => {
  const page = readFileSync(join(root, "web/js/macaron-ops-studio.js"), "utf8");
  const listed = page.match(/export const OPS = \[([^\]]*)\]/)?.[1].split(",").map((x) => x.trim().replace(/"/g, "")).filter(Boolean);
  assert.deepEqual(["open_space", ...(listed ?? [])], [...studio.OPS]);
});

test("her brief in the Studio names the five workspaces, the four crafts and how to write, and says she proposes while the page asks", () => {
  const brief = macaron.macaronBrief("studio");
  for (const w of ["Design idea", "Brand kit", "Studio", "Create", "Brand book"]) assert.ok(brief.includes(w), `names ${w}`);
  for (const c of ["Photography", "UGC stories", "Motion graphics", "The product"]) assert.ok(brief.includes(c), `names ${c}`);
  assert.ok(/first two seconds/.test(brief) && /Never claim what the product cannot do/.test(brief), "how to write a UGC script");
  assert.ok(/Spends nothing/.test(brief) && /shows the price/.test(brief), "she proposes, the page asks");
  assert.ok(!/edit_text|set_layer|make_variation/.test(brief), "none of Create's actions");
});

// ---------------------------------------------------------------- what she is told

test("what she is told of the Studio is its things, and the kit's essentials, and nothing of the posts or the brief", () => {
  const prompt = macaron.macaronPrompt({
    space: "studio", name: "Comfyture", kit: { about: "A jar of shots.", voice: { summary: "Warm", words: ["warm"], dos: ["Be plain"], donts: ["No hype"] }, palette: KIT.palette, logos: KIT.logos },
    brief: { pitch: "SECRET PITCH" }, designs: [{ id: "d1", name: "SECRET POST" }],
    products: [{ name: "The jar", features: ["Real plums"], cutout: true }, { name: "The lid" }],
    studio: { light: "window", surface: "marble", background: "Plum" },
    templates: [{ id: "splash", name: "Splash", category: "Product shot", media: "image" }, { id: "orbit", name: "Slow orbit", category: "Motion", media: "video" }],
    shoots: [{ template: "splash", format: "4:5" }],
    ugc: [{ persona: "maya", hook: "Okay, I tried it", beats: [{ kind: "hook", line: "Okay, I tried it", made: true }, { kind: "cta", line: "Go try it" }] }],
    graphics: [{ kind: "sting", seconds: 3, fields: { line: "Shots worth keeping" } }],
  }, [{ role: "user", text: "a story please" }]);
  assert.ok(/WORKSPACE OPEN: Studio/.test(prompt));
  assert.ok(/Palette \(ids\): yellow #F2FF59/.test(prompt) && /Logos \(ids\): wordmark-yellow/.test(prompt) && /Do: Be plain/.test(prompt) && /Don't: No hype/.test(prompt), "the kit's essentials");
  assert.ok(/THE PRODUCT: The jar \(Real plums\) · has a cut-out · 1 more product/.test(prompt));
  assert.ok(/light window, surface marble, background Plum/.test(prompt));
  assert.ok(/splash "Splash" \(Product shot, image\); orbit "Slow orbit" \(Motion, video\)/.test(prompt));
  assert.ok(/SHOOTS MADE: splash 4:5/.test(prompt));
  assert.ok(/maya: hook "Okay, I tried it" · hook "Okay, I tried it" \(made\) · cta "Go try it"/.test(prompt));
  assert.ok(/sting 3 s "Shots worth keeping"/.test(prompt));
  assert.ok(!/SECRET/.test(prompt), "no post and no brief");
  assert.ok(prompt.length < 4000, "tight");
});

// ---------------------------------------------------------------- her answer, read

test("her answer in the Studio keeps the Studio's actions to the ids the page knows and drops the rest", () => {
  const out = macaron.readMacaronAnswer(JSON.stringify({
    reply: "Here you go.",
    actions: [
      { op: "write_ugc", persona: "leo", hook: "  Okay,   I finally tried it  ", fresh: true, beats: [{ kind: "hook", line: "Okay, I finally tried it", camera: "selfie", setting: "kitchen", seconds: 4 }, { kind: "nonsense", line: "x" }, { kind: "taste", line: "Look at that.", camera: "zeppelin", seconds: 99 }, { kind: "react", line: "so good", seconds: 0 }] },
      { op: "write_ugc", persona: "nobody", hook: "Hi", beats: [] },
      { op: "propose_shoot", template: "splash", light: "neon", surface: "marble", background: "plum" },
      { op: "set_studio", light: "flash" },
      { op: "add_motion_graphic", kind: "lower", copy: { name: "Mia", role: "Chef", bogus: "x", line: "not this kind's" }, seconds: 99, ease: "bouncy" },
      { op: "add_motion_graphic", kind: "confetti" },
      { op: "edit_text", layer: "headline", text: "Create's action" },
      { op: "set_status", status: "approved" },
      { op: "write_brief", fields: { pitch: "Idea's action" } },
    ],
  }), "studio");
  const [story, nobody, shoot, set, graphic, bad] = out.actions as any[];
  assert.equal(out.actions.length, 6, "Create's and the idea's actions are dropped");
  assert.deepEqual(out.actions.map((a: any) => a.op), ["write_ugc", "write_ugc", "propose_shoot", "set_studio", "add_motion_graphic", "add_motion_graphic"]);
  assert.equal(story.persona, "leo");
  assert.equal(story.hook, "Okay, I finally tried it", "spaces gathered");
  assert.equal(story.fresh, true);
  assert.deepEqual(story.beats.map((b: any) => b.kind), ["hook", "taste", "react"], "a beat of an unknown kind is dropped");
  assert.equal(story.beats[0].camera, "selfie");
  assert.equal(story.beats[1].camera, undefined, "a camera that is not ours is left out");
  assert.equal(story.beats[1].seconds, 10, "seconds kept between 2 and 10");
  assert.equal(story.beats[2].seconds, 2);
  assert.equal(nobody.persona, undefined, "a persona that is not ours is left out");
  assert.equal(shoot.template, "splash");
  assert.equal(shoot.light, undefined, "a light that is not ours is left out");
  assert.equal(shoot.surface, "marble");
  assert.equal(shoot.background, "plum");
  assert.equal(set.light, "flash");
  assert.deepEqual(graphic.copy, { name: "Mia", role: "Chef" }, "only the graphic's own fields, as text");
  assert.equal(graphic.seconds, 12);
  assert.equal(graphic.ease, undefined);
  assert.equal(bad.kind, undefined, "a graphic that is not ours has no kind");
});

test("what is not the Studio's is not read in the Studio, and the Studio's actions are not read elsewhere", () => {
  const raw = JSON.stringify({ reply: "x", actions: [{ op: "write_ugc", hook: "Hi" }, { op: "propose_shoot", template: "splash" }, { op: "rename", name: "x" }] });
  assert.deepEqual((macaron.readMacaronAnswer(raw, "create").actions as any[]).map((a) => a.op), ["rename"]);
  assert.deepEqual((macaron.readMacaronAnswer(raw, "kit").actions as any[]).map((a) => a.op), []);
  assert.equal(macaron.spaceOf("content"), "create", "what an older page sent as Content is Create");
  assert.equal(macaron.spaceOf("studio"), "studio");
});

// ---------------------------------------------------------------- the setup

test("the studio's setup says what a shoot adds to the template's words, and adds nothing for a brand that never set it", () => {
  assert.equal(studioWords({}, KIT), "");
  assert.deepEqual(setupOf({}), { light: "softbox", surface: "linen", background: "" });
  assert.deepEqual(setupOf({ studio: { light: "laser", surface: "wood", background: "plum" } }), { light: "softbox", surface: "wood", background: "plum" }, "a choice that is not ours is the default");
  const words = studioWords({ studio: { light: "flash", surface: "marble", background: "plum" } }, KIT);
  assert.ok(/hard direct flash/.test(words) && /polished white marble/.test(words) && /Plum #49378B/.test(words), words);
  assert.ok(!/background in/.test(studioWords({ studio: { light: "window", surface: "linen", background: "" } }, KIT)), "no background chosen: the template's own");
  assert.equal(setupLine({ studio: { light: "softbox", surface: "linen", background: "ink" } }, KIT), "Softbox · Linen · Ink");
  assert.equal(new Set(LIGHTS.map((l) => l.id)).size, 3);
  assert.equal(new Set(SURFACES.map((l) => l.id)).size, 4);
});

// ---------------------------------------------------------------- UGC stories

test("a new story has five beats in order, each with a line, a camera, a setting and its seconds, and the hook is the first line", () => {
  const s = newStory({ persona: "emma", productName: "The jar", features: ["Real plums"] });
  assert.deepEqual(s.beats.map((b: any) => b.kind), BEATS.map((b) => b.id));
  assert.equal(s.persona, "emma");
  assert.equal(s.hook, s.beats[0].line);
  assert.ok(s.beats.every((b: any) => b.line && b.camera && b.setting && b.seconds >= 3 && b.picture === null && b.take === null));
  assert.equal(new Set(s.beats.map((b: any) => b.id)).size, 5, "ids differ");
  assert.equal(storyLength(s), s.beats.reduce((t: number, b: any) => t + b.seconds, 0));
  assert.ok(newStory().persona === "maya", "Maya tells it unless another does");
});

test("a shot is asked of the picture model as the creator with the product, and of the video model as a move and a spoken line", () => {
  const s = newStory({ persona: "leo", productName: "The jar" });
  const hook = beatPrompt(s, s.beats[0], { productName: "The jar", brandName: "Comfyture", features: ["Real plums"] });
  assert.ok(/@creator/.test(hook) && /@product/.test(hook) && /curly dark hair/.test(hook) && /phone selfie/.test(hook) && /sunlit kitchen/.test(hook) && /Real plums/.test(hook), hook);
  assert.ok(/no added text/.test(hook), "no words in the picture");
  const take = beatTake(s, s.beats[2]);
  assert.equal(take.line, s.beats[2].line);
  assert.ok(take.action.length > 20 && take.camera === "handheld");
});

test("what making a story costs is a picture and a take for each beat, and a take alone costs less", () => {
  const s = newStory();
  const both = storyCost(s, { pic: 6, perSecond: 4 });
  assert.equal(both, 5 * 6 + s.beats.reduce((t: number, b: any) => t + b.seconds * 4, 0));
  assert.ok(beatCost(s.beats[0], { pic: 0, perSecond: 4 }) < beatCost(s.beats[0], { pic: 6, perSecond: 4 }));
});

test("a story written by Brioche is checked, and changes the open story without losing its pictures", () => {
  const list: any[] = [];
  const first = applyStory(list, { persona: "maya", hook: "Hi there", beats: [{ kind: "taste", line: "Mmm", seconds: 7 }] }, { productName: "The jar" });
  assert.equal(list.length, 1);
  assert.equal(first.hook, "Hi there");
  assert.equal(first.beats[0].line, "Hi there", "the hook is the first line");
  assert.equal(first.beats.find((b: any) => b.kind === "taste").seconds, 7);
  first.beats[1].picture = { url: "kept.png" };
  const again = applyStory(list, { hook: "A better hook", beats: [{ kind: "show", line: "This is it" }, { kind: "cta", line: "Go" }] }, { current: first });
  assert.equal(again, list[0], "the same story");
  assert.equal(list.length, 1);
  assert.equal(again.beats.length, 5, "no beat added twice");
  assert.equal(again.beats[1].picture.url, "kept.png", "a changed line is not a changed picture");
  assert.equal(again.beats[0].line, "A better hook");
  assert.deepEqual(cleanStory({ persona: "x", hook: 5, beats: "no" }), { persona: "maya", hook: "", beats: [] });
});

// ---------------------------------------------------------------- motion graphics

test("every motion graphic is a design with motion made from the kit: its layers have ids, its timing is known, its colours are the palette's", () => {
  assert.equal(GRAPHIC_KINDS.length, 6);
  const fxs = new Set(["none", "fade", "rise", "drop", "slide-l", "slide-r", "pop", "zoom", "wipe-r", "wipe-u", "ripple"]);
  const palette = new Set(KIT.palette.map((p) => p.id));
  for (const kind of GRAPHIC_IDS) {
    const { design, motion } = buildGraphic({ kind, kit: KIT, brandName: "Comfyture", format: "9:16" });
    assert.equal(design.graphic.kind, kind);
    assert.equal(design.motion, true);
    assert.equal(design.format, "9:16");
    assert.ok(design.layers.length >= 3, kind);
    assert.equal(new Set(design.layers.map((l: any) => l.id)).size, design.layers.length, `${kind}: ids differ`);
    assert.ok(palette.has(design.bg.color), `${kind}: the ground is a palette colour`);
    for (const l of design.layers) {
      if (l.type !== "logo" && l.colorRole) assert.ok(palette.has(l.colorRole), `${kind}: ${l.id} uses ${l.colorRole}`);
      if (l.anim?.in) assert.ok(fxs.has(l.anim.in.fx), `${kind}: ${l.id} comes in by ${l.anim.in.fx}`);
      if (l.anim) assert.ok(l.anim.t0 >= 0 && l.anim.t0 < motion.duration, `${kind}: ${l.id} comes in inside the piece`);
    }
    assert.ok(motion.duration >= 2 && motion.fps === 30 && motion.sound.pad === true);
  }
});

test("a shorter graphic is played faster, a different shape is drawn in that shape, and the words are the ones written", () => {
  const long = buildGraphic({ kind: "title", kit: KIT, brandName: "B", seconds: 4 });
  const short = buildGraphic({ kind: "title", kit: KIT, brandName: "B", seconds: 2 });
  assert.equal(short.motion.duration, 2);
  const t0 = (r: any) => r.design.layers.find((l: any) => l.id === "sub").anim.t0;
  assert.ok(t0(short) < t0(long), "the times are scaled");
  const wide = buildGraphic({ kind: "nudge", kit: KIT, brandName: "B", format: "1:1", fields: { line: "Hello there", cta: "Follow" } });
  assert.equal(wide.design.format, "1:1");
  assert.equal(wide.design.layers.find((l: any) => l.id === "line").text, "Hello there");
  assert.equal(wide.design.layers.find((l: any) => l.id === "cta").text, "Follow");
  assert.deepEqual(cleanFields("lower", { name: " Mia ", role: 5, line: "x" }), { name: "Mia" });
  assert.equal(defaultFields("sting", { tagline: "Shots." }).line, "Shots.");
  assert.deepEqual(rolesOf(KIT), { ground: "ink", light: "white", accent: "yellow", second: "plum" });
});
