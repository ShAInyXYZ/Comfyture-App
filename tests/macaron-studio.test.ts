// Brioche in the Studio: her tool offers the Studio's actions and no others, her answer is read and kept to the ids the page knows, what
// she is told is the Studio's things only (the kit, the product, the setup, the shoots, the stories, the graphics), and the plain modules the
// Studio is built from (the setup's words, the UGC stories, the motion graphics) do what they say. No model is called.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as macaron from "../server/macaron.ts";
import studio from "../web/js/brioche/space-studio.js";
import { LIGHTS, SURFACES, setupOf, studioWords, setupLine } from "../web/js/macaron-studio-setup.js";
import { PERSONAS, CHARACTER_ID, BEATS, BEAT_IDS, CAMERAS, showsProduct, newStory, beatPrompt, beatTake, cleanStory, applyStory, storyCost, beatCost, storyLength, whoOf, voiceMode, characterPictures, characterNameOf, defaultCharacter, cleanCharacter } from "../web/js/macaron-ugc-data.js";
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
  assert.deepEqual(item.properties.op.enum, ["propose_shoot", "set_studio", "write_ugc", "add_motion_graphic", "open_space"]);
  for (const k of ["template", "light", "surface", "background", "persona", "hook", "beats", "kind", "copy", "seconds", "ease", "space"]) assert.ok(k in item.properties, `the tool carries ${k}`);
  assert.deepEqual(item.properties.light.enum, LIGHTS.map((l) => l.id));
  assert.deepEqual(item.properties.persona.enum, [...PERSONAS.map((p) => p.id), CHARACTER_ID]);
  assert.deepEqual(item.properties.kind.enum, GRAPHIC_IDS);
  // nothing of Create's actions
  for (const op of ["edit_text", "set_layer", "make_variation", "write_brief", "set_colour"]) assert.ok(!item.properties.op.enum.includes(op), `${op} is not a Studio action`);
});

test("the Studio's actions are the page's: each action of the spec has a handler in run-studio.js, and no handler is without one", () => {
  const page = readFileSync(join(root, "web/js/brioche/run-studio.js"), "utf8");
  const handlers = [...page.slice(page.indexOf("export const RUN")).split("\n};")[0].matchAll(/^  (\w+)\(/gm)].map((m) => m[1]);
  assert.deepEqual(handlers, Object.keys(studio.actions));
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

test("a shot is the creator caught mid-routine: the product only in the shots that name it, the take a move that carries on and a spoken line", () => {
  const s = newStory({ persona: "leo", productName: "The jar" });
  assert.equal(s.activity, "walking through the city on his way somewhere");
  assert.ok(s.beats.every((b: any) => b.doing && b.setting === "street"), "Leo's routine fills every beat");
  // the hook: walking, no product in it, no product picture asked for
  const hook = beatPrompt(s, s.beats[0], { productName: "The jar", brandName: "Comfyture", features: ["Real plums"] });
  assert.ok(/@creator/.test(hook) && /curly dark hair/.test(hook) && /walk-and-talk/.test(hook) && /city street/.test(hook) && /mid-action/.test(hook), hook);
  assert.ok(!/@product/.test(hook) && !showsProduct(s.beats[0]), "a shot that does not name the product does not ask for it");
  assert.ok(/no added text/.test(hook), "no words in the picture");
  // the show: the product is named, so it is drawn true to its picture
  const show = beatPrompt(s, s.beats[1], { productName: "The jar", features: ["Real plums"] });
  assert.ok(showsProduct(s.beats[1]) && /@product/.test(show) && /Real plums/.test(show), show);
  // the take keeps the routine going, the camera moves as the beat's camera does
  const take = beatTake(s, s.beats[2]);
  assert.equal(take.line, s.beats[2].line);
  assert.ok(/keeps waiting at a crossing/.test(take.action) && !/@product/.test(take.action), take.action);
  assert.ok(/following/.test(take.camera), take.camera);
  // a beat with no doing is still the plain shot of the product in hand
  const plain = { ...s.beats[0], doing: "" };
  assert.ok(/holding @product up/.test(beatPrompt(s, plain, { productName: "The jar" })) && showsProduct(plain));
  assert.ok(/bring the product up/.test(beatTake(s, plain).action));
  // every creator has a routine on cameras and places that exist
  for (const p of PERSONAS) for (const b of BEAT_IDS) {
    const step = (p as any).routine.steps[b];
    assert.ok(step.doing && CAMERAS.some((c: any) => c.id === step.camera), `${p.id} ${b}`);
  }
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
  assert.deepEqual(cleanStory({ persona: "x", hook: 5, beats: "no" }), { persona: "maya", hook: "", activity: "", beats: [] });
  const told = applyStory(list, { activity: "doing her makeup", beats: [{ kind: "react", line: "Done", doing: "turning to the camera, the look finished" }] }, { current: again });
  assert.equal(told.activity, "doing her makeup");
  assert.equal(told.beats.find((b: any) => b.kind === "react").doing, "turning to the camera, the look finished", "what they do is kept with the line");
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

// ---------------------------------------------------------------- the brand's own character tells a story

const TARO_BODY = {
  assets: [{ id: "a1", name: "taro portrait", kind: "upload", url: "/media/photos/p1.png" }, { id: "a2", name: "taro sheet", kind: "upload", url: "/media/photos/s1.png" }, { id: "a3", name: "mood 1", kind: "upload", url: "/media/photos/m1.png" }, { id: "a4", name: "A clip", kind: "made", url: "/media/photos/c1.png", video: "/media/videos/c1.mp4" }],
  refs: [{ title: "Taro, the cast sheet", kind: "mascot", src: "/media/photos/r1.png" }, { title: "Flat-lay", kind: "product", src: "/media/photos/r2.png" }],
};

test("the brand's pictures of a character are listed the likeliest first: a portrait before a sheet, no clips, moodboard mascots included", () => {
  const pics = characterPictures(TARO_BODY);
  assert.equal(pics[0].name, "taro portrait", "a portrait draws the character better than a sheet of small views");
  assert.ok(pics.some((x) => x.name === "Taro, the cast sheet" && x.url === "/media/photos/r1.png"), "a mascot of the moodboard is a choice");
  assert.ok(!pics.some((x) => x.name === "A clip"), "a clip is no picture of a character");
  assert.ok(!pics.some((x) => x.url === "/media/photos/r2.png"), "a product picture of the moodboard is not a mascot");
  assert.equal(pics[0].file, "p1.png", "a picture of the library is given to the picture model by its file");
  assert.equal(characterNameOf("taro portrait"), "Taro");
  assert.deepEqual(defaultCharacter(TARO_BODY).pic?.url, "/media/photos/p1.png");
  assert.equal(defaultCharacter({}).pic, null, "a brand with no pictures has a character with none yet");
});

test("a story told by the character: its pictures are drawn from its picture in the person's own words, not as a young person", () => {
  const taro = cleanCharacter({ name: "Taro", look: "a baby sea otter, grey fur, a mint flower behind its ear", voice: "soft, curious, sings", kind: "creature", pic: { url: "/media/photos/p1.png", file: "p1.png", name: "taro portrait" } });
  const story = newStory({ persona: CHARACTER_ID, character: taro, productName: "Moonlit Oolong" });
  assert.equal(story.persona, CHARACTER_ID);
  assert.equal(story.name, "Taro's story");
  assert.equal(whoOf(story).portrait, "/media/photos/p1.png");
  const prompt = beatPrompt(story, story.beats[0], { productName: "Moonlit Oolong", brandName: "Little Otter Tea" });
  assert.ok(/same character as in @creator \(a baby sea otter, grey fur/.test(prompt), "the character is described by what the person wrote");
  assert.ok(/Taro is holding @product up next to its face/.test(prompt), "named, and a creature has its own face");
  assert.ok(/animal character/.test(prompt) && /paws/.test(prompt), "a creature stays one: paws, no human hands");
  assert.ok(!/real person|young|woman|\bman\b/.test(prompt), "never described as a person");
  assert.ok(/@product/.test(prompt) && /Moonlit Oolong/.test(prompt), "the product is still given and named");
  // a human creator keeps its own prompt
  const maya = newStory({ persona: "maya", productName: "Moonlit Oolong" });
  assert.ok(/same real person as in @creator \(a young East Asian woman/.test(beatPrompt(maya, maya.beats[0])));
  assert.ok(!/animal character/.test(beatPrompt(maya, maya.beats[0])));
  // a person the brand pictured is drawn as a person
  const ana = newStory({ persona: CHARACTER_ID, character: { ...taro, name: "Ana", look: "a woman in an apron", kind: "person" } });
  const pa = beatPrompt(ana, ana.beats[0]);
  assert.ok(/their face/.test(pa) && !/animal character/.test(pa));
});

test("a character that sings hums, one that only mimes is not given a spoken line, and one that talks talks", () => {
  assert.equal(voiceMode("soft, curious, sings"), "sing");
  assert.equal(voiceMode("only hums"), "sing");
  assert.equal(voiceMode("can't talk: it mimes"), "mime");
  assert.equal(voiceMode("sings softly, cannot talk"), "sing", "a character that sings but cannot talk sings");
  assert.equal(voiceMode("cannot talk"), "mime");
  assert.equal(voiceMode("silent"), "mime");
  assert.equal(voiceMode("a deep, slow voice"), "talk");
  assert.equal(voiceMode(""), "talk");
  const make = (voice: string) => newStory({ persona: CHARACTER_ID, character: { name: "Taro", voice, kind: "creature", pic: { url: "/media/photos/p1.png" } } });
  const hook = (st: any) => beatTake(st, st.beats[0]);
  assert.ok(/begins to sing softly/.test(hook(make("sings")).action) && hook(make("sings")).line.length > 0, "a singer keeps its line, sung");
  assert.ok(/mimes the words without a sound/.test(hook(make("mute, mimes")).action) && hook(make("mute, mimes")).line === "", "a mimed line is not given as speech");
  assert.ok(/begins to talk/.test(hook(make("warm")).action) && hook(make("warm")).line.length > 0);
  // a creature has paws
  const show = beatTake(make("warm"), make("warm").beats[1]);
  assert.ok(/its paws/.test(show.action));
});

test("the character tells an open story only when one has it: Brioche's draft cannot invent it, and a new story takes it from the open one", () => {
  const taro = { name: "Taro", look: "an otter", voice: "sings", kind: "creature", pic: { url: "/media/photos/p1.png", file: "p1.png" } };
  const open = newStory({ persona: CHARACTER_ID, character: taro });
  const list: any[] = [open];
  assert.equal(cleanStory({ persona: CHARACTER_ID, hook: "Hi" }, open).persona, CHARACTER_ID, "kept for the story that has it");
  assert.equal(cleanStory({ persona: CHARACTER_ID, hook: "Hi" }, null, null).persona, PERSONAS[0].id, "no story has one: a creator tells it");
  const changed = applyStory(list, { persona: CHARACTER_ID, hook: "A sung hello", beats: [{ kind: "hook", line: "Ooh, Moonlit Oolong" }] }, { current: open, like: open });
  assert.equal(changed.persona, CHARACTER_ID);
  assert.equal(changed.beats.find((b: any) => b.kind === "hook").line, "A sung hello", "the hook is the first beat's line");
  const fresh = applyStory(list, { persona: CHARACTER_ID, hook: "Another one" }, { current: null, like: open });
  assert.equal(fresh.persona, CHARACTER_ID);
  assert.equal(fresh.character.name, "Taro", "a new story takes the character of the open one");
  assert.notEqual(fresh.character, open.character, "a copy, not the same object");
  assert.equal(list[0], fresh);
  // a human story is not turned into a character story by a draft
  const maya = newStory({ persona: "maya" });
  assert.equal(applyStory([maya], { persona: CHARACTER_ID, hook: "x" }, { current: maya, like: maya }).persona, "maya");
});

test("Brioche in the Studio: told who tells the story, her answer may name the character, and her brief says how to write for one", () => {
  const prompt = macaron.macaronPrompt({
    space: "studio", name: "Little Otter Tea", kit: { palette: KIT.palette, logos: KIT.logos },
    ugc: [{ persona: CHARACTER_ID, character: { name: "Taro", look: "a baby sea otter", voice: "sings", kind: "creature", mode: "sing" }, hook: "Ooh", beats: [{ kind: "hook", line: "Ooh, Moonlit Oolong" }] }],
  }, [{ role: "user", text: "write the script" }]);
  assert.ok(/the brand's character Taro \(a creature, looks: a baby sea otter, sounds: sings, so it sings or hums\)/.test(prompt), "who tells it, how it looks and sounds");
  const answer = macaron.readMacaronAnswer(JSON.stringify({ reply: "Here.", actions: [{ op: "write_ugc", persona: CHARACTER_ID, hook: "Ooh", beats: [{ kind: "hook", line: "Ooh, Moonlit Oolong" }] }] }), "studio");
  assert.equal((answer.actions[0] as any).persona, CHARACTER_ID);
  const bad = macaron.readMacaronAnswer(JSON.stringify({ reply: "Here.", actions: [{ op: "write_ugc", persona: "someone-else", hook: "Hi", beats: [] }] }), "studio");
  assert.equal((bad.actions[0] as any).persona, undefined, "a creator that is not one is left out");
  const brief = macaron.macaronBrief("studio");
  assert.ok(/brand's own character/.test(brief) && /stays a creature/.test(brief) && /sings or hums/.test(brief) && /mimes/.test(brief), "how to write for a character that cannot talk");
  assert.ok(/never make the character/.test(brief), "she never makes the character or chooses its picture");
});

// ---------------------------------------------------------------- a graphic's words follow the brand, and only the person's own are kept

test("what a graphic says until it is written comes from the brand: its tagline, else the first words of how it talks, else nothing made up", () => {
  assert.equal(defaultFields("sting", { tagline: "One cup, then the moon." }).line, "One cup, then the moon.");
  assert.equal(defaultFields("sting", { voice: "Warm, plain, a little playful. We say it like a friend." }).line, "Warm, plain, a little playful", "the first words of the voice");
  assert.equal(defaultFields("sting", {}).line, "", "a brand with neither says nothing");
  assert.equal(defaultFields("end", { brandName: "Little Otter Tea" }).line, "Little Otter Tea", "an end card closes on the brand's name when it has no line");
  assert.equal(defaultFields("end", { brandName: "Little Otter Tea" }).url, "", "no address is made up");
  assert.equal(defaultFields("end", { brandName: "Little Otter Tea", url: "littleottertea.example" }).url, "littleottertea.example", "the brand's own when the kit has one");
  assert.deepEqual(defaultFields("title", { brandName: "B" }), { title: "B", sub: "" });
  for (const kind of GRAPHIC_IDS) for (const v of Object.values(defaultFields(kind, { brandName: "B" }))) assert.ok(!/yourbrand|Made with care/i.test(String(v)), `${kind}: no stand-in copy`);
});

test("a graphic keeps only the words the person wrote: a tagline written later shows in the next one, a blank line is no layer drawn", () => {
  const bare = { ...KIT, tagline: "" };
  const first = buildGraphic({ kind: "end", kit: bare, brandName: "Little Otter Tea" });
  assert.deepEqual(first.design.graphic.fields, {}, "nothing written, nothing kept");
  assert.equal(first.design.layers.find((l: any) => l.id === "line").text, "Little Otter Tea");
  assert.equal(first.design.layers.find((l: any) => l.id === "url").hidden, true, "a blank address is not drawn");
  // the brand gets a tagline: the same (unwritten) graphic follows it
  const later = buildGraphic({ kind: "end", kit: { ...KIT, tagline: "One cup, then the moon." }, brandName: "Little Otter Tea", fields: first.design.graphic.fields });
  assert.equal(later.design.layers.find((l: any) => l.id === "line").text, "One cup, then the moon.");
  // what is written wins, and is the only thing kept
  const own = buildGraphic({ kind: "end", kit: { ...KIT, tagline: "One cup, then the moon." }, brandName: "B", fields: { url: "tea.example" } });
  assert.deepEqual(own.design.graphic.fields, { url: "tea.example" });
  assert.equal(own.design.layers.find((l: any) => l.id === "url").text, "tea.example");
  assert.ok(!own.design.layers.find((l: any) => l.id === "url").hidden);
  // a line the person wrote blank is blank (it does not fall back to the brand's)
  const blank = buildGraphic({ kind: "sting", kit: { ...KIT, tagline: "Shots." }, brandName: "B", fields: { line: "" } });
  assert.equal(blank.design.layers.find((l: any) => l.id === "line").hidden, true);
});

test("Brioche is told the graphic that is open and asked to write for it, never to open another", () => {
  const prompt = macaron.macaronPrompt({ space: "studio", name: "B", kit: { palette: KIT.palette, logos: KIT.logos }, graphicOpen: { kind: "end", seconds: 3, fields: { line: "Little Otter Tea", url: "" } } }, [{ role: "user", text: "write it" }]);
  assert.ok(/THE GRAPHIC OPEN NOW: end 3 s, saying line "Little Otter Tea", url ""/.test(prompt));
  const brief = macaron.macaronBrief("studio");
  assert.ok(/When a graphic is open/.test(brief) && /Never open another kind/.test(brief));
  const none = macaron.macaronPrompt({ space: "studio", name: "B", kit: { palette: KIT.palette, logos: KIT.logos } }, [{ role: "user", text: "x" }]);
  assert.ok(!/THE GRAPHIC OPEN NOW/.test(none));
});
