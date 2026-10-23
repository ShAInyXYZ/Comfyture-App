// The pets: the registry has all seven, each with a face on disk, a placeholder that names it and a few presets for
// every room; a pet's brief knows its own product only; and each assist route's answer reader keeps its own actions
// and drops everything else (Praline's and Truffle's against what the page told them). No model is called.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PAGES, PRODUCTS } from "../web/js/router.js";
import { HARNESSES, harnessOf, barOf, roomOf, setRoom, onRoom, tell, setTeller } from "../web/js/harnesses.js";
import { MIXER_BRIEF, MIXER_OPS, MIXER_TOOL, mixerPrompt, readMixerAnswer } from "../server/mixer-assist.ts";
import { UTENSILS_BRIEF, UTENSILS_OPS, UTENSILS_TOOL, utensilsPrompt, readUtensilsAnswer } from "../server/utensils-assist.ts";
import { SPICE_BRIEF, SPICE_OPS, SPICE_TOOL, spicePrompt, readSpiceAnswer } from "../server/spice-assist.ts";
import { TOASTER_BRIEF, TOASTER_OPS } from "../server/toaster-assist.ts";
import { readAnswer } from "../server/assistant.ts";
import { readControlAnswer } from "../server/control.ts";
import { readStoryAssist } from "../server/story.ts";
import { readCutAnswer, cutBrief, jamBrief, JAM_WORKSPACES } from "../server/cut.ts";
import { manual } from "../server/manual.ts";
import * as macaron from "../server/macaron.ts";

const web = join(import.meta.dirname, "..", "web");
const PETS = { kitchen: "Ketkout", mixer: "Praline", jam: "Pickle", macaron: "Brioche", spice: "Paprika", toaster: "Crumpet", utensils: "Truffle" } as const;
const TAGS = { kitchen: "head chef", mixer: "trend boss", jam: "band leader", macaron: "brand room", spice: "VFX house", toaster: "model maker", utensils: "shelf keeper" } as const;

// ---------------------------------------------------------------- the registry

test("every product has its pet, with a name, a tag and a face that is on disk", () => {
  assert.deepEqual(Object.keys(HARNESSES).sort(), Object.keys(PRODUCTS).sort(), "one harness for each of the app's products");
  for (const [product, name] of Object.entries(PETS)) {
    const h = harnessOf(product)!;
    assert.equal(h.name, name);
    assert.equal(h.pet, name.toLowerCase());
    assert.equal(h.tag, TAGS[product as keyof typeof TAGS]);
    assert.ok(/\.webp$/.test(h.face) && existsSync(join(web, h.face)), `${name}'s face is a picture under web/: ${h.face}`);
    assert.ok(h.tools === "bar" || h.tools === "panel");
  }
  assert.equal(new Set(Object.values(HARNESSES).map((h) => h.pet)).size, 7, "seven different pets");
  assert.equal(new Set(Object.values(HARNESSES).map((h) => h.face)).size, 7, "seven different faces");
  assert.equal(harnessOf("library"), null);
});

test("Kitchen's pet fronts every room that has an assistant; the products without a left panel show their presets in the bar", () => {
  const rooms = Object.keys(PAGES).filter((p) => p !== "library");
  assert.deepEqual(Object.keys(HARNESSES.kitchen.placeholders).sort(), rooms.sort());
  assert.equal(HARNESSES.kitchen.tools, "bar");
  assert.equal(HARNESSES.mixer.tools, "bar");
  assert.equal(HARNESSES.jam.tools, "panel");
  assert.equal(HARNESSES.macaron.tools, "panel");
  assert.equal(HARNESSES.spice.tools, "panel");
  assert.equal(HARNESSES.utensils.tools, "panel");
});

// Brioche, Pickle, Paprika and Truffle have no canned tools: Brioche's panel shows the brand's health, Pickle's the video's pipeline,
// Paprika's the comp stack of the shot, Truffle's the queue and the recent results (the four registry entries keep an empty list per room)
const NO_PRESETS = new Set(["macaron", "jam", "spice", "toaster", "utensils"]);

test("each room's placeholder names its pet, and each room has a few short presets (but for the four that have none)", () => {
  for (const [product, h] of Object.entries(HARNESSES)) {
    assert.deepEqual(Object.keys(h.presets).sort(), Object.keys(h.placeholders).sort(), `${product}: a placeholder and presets for every room`);
    for (const [room, ask] of Object.entries(h.placeholders)) {
      assert.ok(ask.startsWith(`Ask ${h.name} — `), `${product}/${room}: "${ask}" asks its pet by name`);
      const list = h.presets[room as keyof typeof h.presets] as { label: string; text: string }[];
      if (NO_PRESETS.has(product)) assert.equal(list.length, 0, `${product}/${room}: no canned presets`);
      else assert.ok(list.length >= 1 && list.length <= 4, `${product}/${room}: one to four presets`);
      assert.equal(new Set(list.map((p) => p.label)).size, list.length, `${product}/${room}: no label twice`);
      for (const p of list) {
        assert.ok(p.label.length > 0 && p.label.length <= 24, `${product}/${room}: "${p.label}" is a short label`);
        assert.ok(p.text.length > 0 && p.text.length <= 120, `${product}/${room}: "${p.text}" is a short sentence`);
      }
    }
  }
});

test("a pet's presets stay inside its product: no other pet or product is named in them", () => {
  for (const [product, h] of Object.entries(HARNESSES)) {
    const others = [...Object.values(PETS), ...Object.values(PRODUCTS).map(([name]) => name)].filter((n) => n !== PETS[product as keyof typeof PETS] && n !== PRODUCTS[product as keyof typeof PRODUCTS][0]);
    const words = JSON.stringify([h.placeholders, h.presets]).replace(/Ask \w+ —/g, "");
    for (const n of others) assert.ok(!words.includes(n), `${product} names ${n}`);
  }
});

test("the bar asks and offers what fits the room that is open", () => {
  assert.equal(barOf("kitchen", "stage").placeholder, HARNESSES.kitchen.placeholders.stage);
  assert.deepEqual(barOf("kitchen", "cut").presets, HARNESSES.kitchen.presets.cut);
  // a product with workspaces: the one its panel said is open, else its first (or its own home)
  assert.equal(roomOf("jam"), Object.keys(HARNESSES.jam.placeholders)[0], "Jam opens on its first workspace");
  assert.equal(roomOf("macaron"), "create");
  assert.deepEqual(Object.keys(HARNESSES.macaron.placeholders), ["kit", "idea", "studio", "create", "book"], "Macaron's five workspaces, the Brand kit first");
  assert.equal(roomOf("spice"), "plate", "Spice opens on its Plate");
  assert.deepEqual(Object.keys(HARNESSES.spice.placeholders), ["plate", "roto", "paint", "light", "fx", "comp"], "Spice's six departments, in the order a shot goes through them");
  assert.equal(roomOf("utensils"), "home", "Utensils opens on its Home");
  assert.deepEqual(Object.keys(HARNESSES.utensils.placeholders), ["home", "shelf", "picture", "video", "audio", "vfx", "edit", "templates"], "Utensils' eight workspaces, Home first");
  assert.equal(HARNESSES.utensils.placeholders.home, "Ask Truffle — what do you want to make or fix?");
  const heard: string[] = [];
  onRoom((product, room) => heard.push(`${product}:${room}`));
  setRoom("jam", "words");
  setRoom("jam", "words");
  setRoom("jam", "nowhere");
  setRoom("nobody", "words");
  assert.deepEqual(heard, ["jam:words"], "told once, and only for a workspace that exists");
  assert.equal(roomOf("jam"), "words");
  assert.equal(barOf("jam").placeholder, HARNESSES.jam.placeholders.words);
  assert.equal(barOf("jam", "nowhere").placeholder, HARNESSES.jam.placeholders.words, "an unknown room falls back to the open one");
  setRoom("jam", "track");
  assert.equal(roomOf("jam"), "track");
  setRoom("jam", Object.keys(HARNESSES.jam.placeholders)[0]);
});

test("a preset is said to the pet through the bar that is on screen", () => {
  const said: string[] = [];
  tell("nobody is listening yet");
  setTeller((text: string) => said.push(text));
  tell(HARNESSES.mixer.presets.trends[0].text);
  assert.deepEqual(said, ["Pick the hottest trend on the shelf"]);
});

// ---------------------------------------------------------------- the briefs

const PRODUCT_NAMES = Object.values(PRODUCTS).map(([name]) => name);
const PET_NAMES = Object.values(PETS);
/** The names of everything else in the app, to look for in a brief that must not know them. */
const foreign = (product: keyof typeof PETS) => [...PET_NAMES.filter((n) => n !== PETS[product]), ...PRODUCT_NAMES.filter((n) => n !== PRODUCTS[product][0])];

test("Praline's, Paprika's, Crumpet's and Truffle's briefs are their own product's: their pet, their product, their actions and nothing of the others", () => {
  for (const [product, brief, ops] of [["mixer", MIXER_BRIEF, MIXER_OPS], ["spice", SPICE_BRIEF, SPICE_OPS], ["toaster", TOASTER_BRIEF, TOASTER_OPS], ["utensils", UTENSILS_BRIEF, UTENSILS_OPS]] as const) {
    assert.ok(brief.includes(PETS[product]) && brief.includes(PRODUCTS[product][0]));
    for (const n of foreign(product)) assert.ok(!brief.includes(n), `the ${product} brief names ${n}`);
    for (const op of ops) assert.ok(brief.includes(op), `${op} is in the brief`);
    assert.ok(brief.length < 3000, `a short brief (${brief.length} characters)`);
  }
  assert.ok([MIXER_BRIEF, SPICE_BRIEF, TOASTER_BRIEF, UTENSILS_BRIEF].every((b) => /never that it has started/.test(b)), "what costs credits is only asked for");
});

test("their tools are forced answers: a reply and actions, each action one of the pet's own ops", () => {
  for (const [tool, ops] of [[MIXER_TOOL, MIXER_OPS], [SPICE_TOOL, SPICE_OPS], [UTENSILS_TOOL, UTENSILS_OPS]] as const) {
    assert.deepEqual(tool.input_schema.required, ["reply", "actions"]);
    assert.deepEqual(tool.input_schema.properties.actions.items.properties.op.enum, [...ops]);
  }
});

test("the Shot assistant's manual is the Shot's part only: no editor, no brand room, no other product", () => {
  const text = manual([]);
  assert.ok(/how a shot works/i.test(text) && /WHICH WORKFLOW RUNS/.test(text), "it still says how a shot is made");
  for (const n of [...PET_NAMES.filter((x) => x !== "Ketkout"), "Macaron", "Mixer", "Utensils", "Jam"]) assert.ok(!text.includes(n), `the Shot's manual names ${n}`);
  for (const w of ["THE EDIT", "lyric", "sticker", "Beat effects", "colourway"]) assert.ok(!text.includes(w), `the Shot's manual teaches ${w}`);
});

// ---------------------------------------------------------------- what Praline and Truffle are told

const SHELF = [
  { id: "hotel-lobby", name: "Hotel Lobby", kind: "duo", seconds: 15, heat: 5, roles: [{ role: "Lead", crew: "praline" }, { role: "Partner", crew: "sesame" }] },
  { id: "face-dance", name: "Face Dance", kind: "dance", seconds: 8, heat: 4, roles: [{ role: "Lead", crew: "meringue" }] },
];
const CREW = [{ id: "praline", name: "Praline", role: "Ringleader" }, { id: "sesame", name: "Sesame", role: "Reactor" }, { id: "mochi", name: "Mochi", role: "Scene-stealer" }, { id: "earl", name: "Earl", role: "Mochi's owner", kind: "person" }];
const MIXER = {
  shelf: SHELF, crew: CREW, stars: ["Luna"], open: { trend: "hotel-lobby", cast: [{ role: "Lead", who: "Praline" }, { role: "Partner", who: "Sesame" }], role: null, cost: 64 },
  making: false, remixing: false, mixes: [{ id: "mixes-hotel-lobby-1", name: "Hotel Lobby · 18 Oct" }],
};
const say = (actions: unknown[], reply = "Done.") => JSON.stringify({ reply, actions });

test("Praline is told the shelf, the crew, the stars, the trend open and the mixes, and the talk so far", () => {
  const text = mixerPrompt(MIXER, [{ role: "user", text: "the hottest trend" }, { role: "assistant", text: "Opened it.", did: ["Opened Hotel Lobby"] }, { role: "user", text: "make it" }]);
  for (const piece of ["hotel-lobby · Hotel Lobby · duo · 15 s · heat 5 · Lead (praline), Partner (sesame)", "praline · Praline · Ringleader", "earl · Earl · Mochi's owner (a person)", "Luna", "THE TREND OPEN: hotel-lobby", "Lead = Praline", "about 64 credits", "mixes-hotel-lobby-1 · Hotel Lobby · 18 Oct", "Praline: Opened it. [the app did: Opened Hotel Lobby]", "User: make it"]) assert.ok(text.includes(piece), piece);
  assert.ok(mixerPrompt({ ...MIXER, open: null, remixing: true }, []).includes("A REMIX IS OPEN"));
  assert.ok(mixerPrompt({ ...MIXER, open: { ...MIXER.open, cost: null } }, []).includes("own machine"));
  assert.ok(mixerPrompt({}, []).includes("NO TREND IS OPEN"), "an empty summary is read as nothing open");
});

test("Praline's answer: her five actions, only with what exists, make_it once and last", () => {
  const out = readMixerAnswer(say([
    { op: "make_it" },
    { op: "pick_trend", trend: "face-dance" },
    { op: "pick_trend", trend: "no-such-trend" },
    { op: "give_role", role: "lead", crew: "mochi" },
    { op: "give_role", role: "Partner", crew: "mochi" },
    { op: "give_role", role: "Lead", star: "luna" },
    { op: "give_role", role: "Lead", crew: "nobody" },
    { op: "give_role", role: "Lead", star: "Rex" },
    { op: "swap_role", role: "LEAD" },
    { op: "swap_role", role: "Villain" },
    { op: "open_mix", mix: "mixes-hotel-lobby-1" },
    { op: "open_mix", mix: "someone-elses" },
    { op: "make_it" },
  ], "Face Dance is yours."), MIXER);
  assert.equal(out.reply, "Face Dance is yours.");
  assert.deepEqual(out.actions, [
    { op: "pick_trend", trend: "face-dance" },
    { op: "give_role", role: "Lead", crew: "mochi" },
    // Partner is a role of Hotel Lobby, not of Face Dance, which was picked before it
    { op: "give_role", role: "Lead", star: "Luna" },
    { op: "swap_role", role: "Lead" },
    { op: "open_mix", mix: "mixes-hotel-lobby-1" },
    { op: "make_it" },
  ]);
});

test("Praline cannot make what is not open, nor give a role in a trend that is not", () => {
  const nothing = { ...MIXER, open: null };
  assert.deepEqual(readMixerAnswer(say([{ op: "make_it" }, { op: "give_role", role: "Lead", crew: "mochi" }]), nothing).actions, []);
  assert.deepEqual(readMixerAnswer(say([{ op: "make_it" }]), { ...MIXER, remixing: true }).actions, [], "a remix has its own key");
  assert.deepEqual(readMixerAnswer(say([{ op: "pick_trend", trend: "hotel-lobby" }, { op: "make_it" }]), nothing).actions.map((a: any) => a.op), ["pick_trend", "make_it"]);
  assert.equal(readMixerAnswer(say(Array.from({ length: 20 }, () => ({ op: "swap_role", role: "Lead" }))), MIXER).actions.length, 8, "a few actions at most");
});

test("Praline's reader accepts only her own actions", () => {
  const foreignActions = [{ do: "roll" }, { op: "run_tool" }, { op: "pick_tool", tool: "upscale" }, { op: "edit_text", layer: "headline", text: "x" }, { op: "trim", clip: 1, seconds: 3 }, { op: "camera_move", args: { move: "push-in" } }, { op: "bible", kind: "cast", name: "Mara" }, { op: "render" }, "pick_trend", null, 7];
  assert.deepEqual(readMixerAnswer(say(foreignActions), MIXER).actions, []);
  assert.deepEqual(readMixerAnswer(say([...foreignActions, { op: "pick_trend", trend: "hotel-lobby" }]), MIXER).actions, [{ op: "pick_trend", trend: "hotel-lobby" }]);
});

test("Praline's words are a reply even when the answer is not JSON; the JSON is found inside a sentence or a fence", () => {
  assert.deepEqual(readMixerAnswer("Hotel Lobby is the hottest.", MIXER), { reply: "Hotel Lobby is the hottest.", actions: [] });
  assert.deepEqual(readMixerAnswer("", MIXER).actions, []);
  assert.deepEqual(readMixerAnswer(`Sure!\n\`\`\`json\n${say([{ op: "pick_trend", trend: "face-dance" }], "Opened.")}\n\`\`\``, MIXER), { reply: "Opened.", actions: [{ op: "pick_trend", trend: "face-dance" }] });
  assert.equal(readMixerAnswer(say([], "x".repeat(900)), MIXER).reply.length, 500);
});

const TOOLS = [
  { id: "upscale", group: "Picture", name: "Upscale", hint: "More detail, up to 4× larger", takes: ["image"] },
  { id: "cutout", group: "Picture", name: "Remove background", hint: "The subject alone", takes: ["image"] },
  { id: "variations", group: "Picture", name: "Variations", hint: "Four new takes", takes: ["image"], words: "optional" },
  { id: "edit", group: "Picture", name: "Edit with words", hint: "Say what to change", takes: ["image"], words: "needed" },
  { id: "extend", group: "Video", name: "Extend", hint: "A clip goes on", takes: ["video"], words: "optional" },
  { id: "lipsync", group: "Video", name: "Lip-sync", hint: "A photo says a voice track", takes: ["image", "audio"], words: "optional" },
  { id: "sound", group: "Video", name: "Add sound", hint: "Sound for a clip", takes: ["video"], words: "needed" },
  { id: "upscale-video", group: "Video", name: "Upscale video", hint: "A clip restored larger", takes: ["video"] },
  { id: "music", group: "Sound", name: "Music", hint: "A track from a few words", takes: [], words: "needed" },
  { id: "sfx", group: "Sound", name: "Sound effect", hint: "A sound from a few words", takes: [], words: "needed" },
];
const UTENSILS = {
  tools: TOOLS,
  open: { tool: "upscale", has: { image: null, video: null, audio: null }, words: "", options: { scale: 4 }, ready: false, cost: 2 },
  library: {
    images: [{ id: "img1", name: "moon", size: "1536×1024" }, { id: "img2", name: "chef", size: "1024×1024" }],
    clips: [{ id: "take1", name: "Moon walk", seconds: 5, kind: "take" }, { id: "film1", name: "My film", seconds: 42, kind: "film" }],
    sounds: [{ id: "snd1", name: "Warm waltz", seconds: 32 }],
  },
  busy: false,
};

test("Truffle is told the tools, the one open and what it holds, and the library's newest files", () => {
  const text = utensilsPrompt(UTENSILS, [{ role: "user", text: "upscale my latest picture" }]);
  for (const piece of ["upscale · Picture · More detail, up to 4× larger · a picture · none", "lipsync · Video · A photo says a voice track · a picture and a sound · optional", "music · Sound · A track from a few words · words only · needed", "THE TOOL OPEN: upscale", "scale 4", "missing something", "about 2 credits", "img1 · moon · 1536×1024", "take1 · Moon walk · 5 s · a take", "film1 · My film · 42 s · a film", "snd1 · Warm waltz · 32 s", "User: upscale my latest picture"]) assert.ok(text.includes(piece), piece);
  assert.ok(utensilsPrompt({ ...UTENSILS, open: null, busy: true }, []).includes("NO TOOL IS OPEN"));
  assert.ok(utensilsPrompt({ ...UTENSILS, open: { ...UTENSILS.open, ready: true, cost: null }, busy: true }, []).includes("own machine"));
});

test("Truffle knows the eight workspaces: she opens one, opens another's tool by id, and sets what a tool declares", () => {
  const summary: any = {
    ...UTENSILS,
    workspace: "picture",
    workspaces: [{ id: "shelf", tools: 12 }, { id: "picture", tools: 4 }, { id: "vfx", tools: 3 }],
    tools: TOOLS.slice(0, 4),
    others: [{ id: "remove-object", workspace: "vfx", name: "Remove an object", takes: ["video"], words: "needed" }, { id: "trim", workspace: "edit", name: "Trim", takes: ["video"] }],
    queue: [{ tool: "upscale", status: "running", progress: 0.4 }],
    results: [{ tool: "cutout", kind: "image", note: "PNG · clear", ago: "2m" }],
  };
  const text = utensilsPrompt(summary, []);
  for (const piece of ["WORKSPACE OPEN: picture.", "picture (4)", "THE TOOLS OF PICTURE", "remove-object · vfx · Remove an object · a clip · needed", "THE QUEUE: upscale running 40%", "NEWEST RESULTS: cutout (image, PNG · clear, 2m)"]) assert.ok(text.includes(piece), `she is told: ${piece}`);
  assert.ok(!text.includes("THE TOOLS OF VFX"), "the other workspaces' tools are by id only");
  const out = readUtensilsAnswer(say([
    { op: "pick_workspace", workspace: "vfx" },
    { op: "pick_workspace", workspace: "kitchen" },
    { op: "pick_tool", tool: "remove-object" },
    { op: "set_input", video: "take1", words: "the passer-by in the yellow coat", seconds: 7 },
    { op: "run_tool" },
  ]), summary);
  assert.deepEqual(out.actions, [
    { op: "pick_workspace", workspace: "vfx" },
    { op: "pick_tool", tool: "remove-object" },
    { op: "set_input", video: "take1", words: "the passer-by in the yellow coat" },
    { op: "run_tool" },
  ]);
  // a tool that declares settings: each kept to its values, in options (the older ones stay flat)
  const declared = { ...summary, open: null, tools: [{ id: "grade", workspace: "edit", name: "Grade", takes: ["video"], options: [{ key: "warmth", type: "range", min: -10, max: 10 }, { key: "look", type: "choice", values: ["noir", "warm"] }, { key: "keep_audio", type: "flag" }, { key: "seconds", type: "range", min: 1, max: 5 }] }] };
  const set = readUtensilsAnswer(say([{ op: "pick_tool", tool: "grade" }, { op: "set_input", video: "take1", options: { warmth: 99, look: "sepia", keep_audio: true, nonsense: 1 }, seconds: 9 }]), declared);
  assert.deepEqual(set.actions[1], { op: "set_input", video: "take1", seconds: 5, options: { warmth: 10, keep_audio: true } });
});

test("on Home Truffle is told the workspaces with their counts, the queue and the newest results, and no tool is described", () => {
  const summary: any = {
    workspace: "home",
    workspaces: [{ id: "home", name: "Home" }, { id: "shelf", tools: 41 }, { id: "picture", tools: 4 }, { id: "video", tools: 4 }, { id: "audio", tools: 9 }, { id: "vfx", tools: 11 }, { id: "edit", tools: 12 }, { id: "templates", tools: 674 }],
    tools: [],
    // the tools are named by id and name only, to open when the job is named
    others: [{ id: "upscale", workspace: "picture", name: "Upscale", takes: ["image"] }, { id: "ed-trim", workspace: "edit", name: "Trim", takes: ["video"] }],
    apps: [{ id: "app-bg-remove", name: "Remove background", takes: ["image"] }],
    open: null,
    queue: [{ tool: "upscale-video", status: "running", progress: 0.72 }],
    results: [{ tool: "cutout", kind: "image", ago: "2m" }],
    library: UTENSILS.library,
  };
  const text = utensilsPrompt(summary, [{ role: "user", text: "trim my latest clip to 3 seconds" }]);
  for (const piece of ["WORKSPACE OPEN: home.", "THE WORKSPACES: home, shelf (41), picture (4), video (4), audio (9), vfx (11), edit (12), templates (674).", "HOME shows every workspace's tools as pictures. Nothing is open.", "THE QUEUE: upscale-video running 72%", "NEWEST RESULTS: cutout (image, 2m)", "NO TOOL IS OPEN", "ed-trim · edit · Trim · a clip"]) assert.ok(text.includes(piece), piece);
  assert.ok(!text.includes("THE TOOLS OF HOME"), "no tool is described on Home");
  assert.ok(!text.includes("(id · workspace · what it does · what it takes · words · settings)"), "Home has no list of tools in full");
  assert.ok(!text.includes("home (0)"), "Home has no count");
  // she can go home, and open a tool by its id from there
  const out = readUtensilsAnswer(say([{ op: "pick_workspace", workspace: "home" }, { op: "pick_tool", tool: "ed-trim" }, { op: "set_input", video: "take1" }]), summary);
  assert.deepEqual(out.actions, [{ op: "pick_workspace", workspace: "home" }, { op: "pick_tool", tool: "ed-trim" }, { op: "set_input", video: "take1" }]);
  assert.ok(UTENSILS_BRIEF.includes("home (where it opens"), "her brief names Home");
  assert.ok(UTENSILS_TOOL.input_schema.properties.actions.items.properties.workspace.enum.includes("home"), "pick_workspace accepts home");
});

test("Truffle's answer: a tool opened, its input from the library, its words and settings, run_tool once and last", () => {
  const out = readUtensilsAnswer(say([
    { op: "run_tool" },
    { op: "pick_tool", tool: "extend" },
    { op: "pick_tool", tool: "forks" },
    { op: "set_input", video: "take1", words: "  the rain  starts ", seconds: 99, scale: 2, image: "img1", audio: "snd1" },
    { op: "set_input", video: "film9" },
    { op: "pick_tool", tool: "music" },
    { op: "set_input", words: "warm folk", seconds: 5, bpm: 200, lyrics: "la\nla", real: true },
    { op: "pick_tool", tool: "upscale-video" },
    { op: "set_input", height: 1080, video: "film1" },
    { op: "set_input", height: 4320 },
    { op: "run_tool" },
  ], "Ready."), UTENSILS);
  assert.deepEqual(out.actions, [
    { op: "pick_tool", tool: "extend" },
    // extend takes a clip and words and 2 to 10 seconds: no picture, no sound, no scale
    { op: "set_input", video: "take1", words: "the rain starts", seconds: 10 },
    { op: "pick_tool", tool: "music" },
    // music takes words, 10 to 240 seconds, 60 to 180 bpm and lyrics: nothing of a Foley switch
    { op: "set_input", words: "warm folk", seconds: 10, bpm: 180, lyrics: "la\nla" },
    { op: "pick_tool", tool: "upscale-video" },
    { op: "set_input", video: "film1", height: 1080 },
    { op: "run_tool" },
  ]);
});

test("Truffle's settings are the tool's own: a choice is one of its choices, Foley is Add sound's, words only where a tool takes them", () => {
  const one = (open: string, action: Record<string, unknown>) => readUtensilsAnswer(say([action]), { ...UTENSILS, open: { ...UTENSILS.open, tool: open } }).actions;
  assert.deepEqual(one("upscale", { op: "set_input", scale: 2, words: "sharper", seconds: 5 }), [{ op: "set_input", scale: 2 }], "no words for an upscaler");
  assert.deepEqual(one("upscale", { op: "set_input", scale: 3 }), [], "2 or 4, nothing between");
  assert.deepEqual(one("sound", { op: "set_input", real: true, words: "steps", video: "take1" }), [{ op: "set_input", video: "take1", words: "steps", real: true }]);
  assert.deepEqual(one("sfx", { op: "set_input", words: "a lid", seconds: 0 }), [{ op: "set_input", words: "a lid", seconds: 1 }]);
  assert.deepEqual(one("lipsync", { op: "set_input", image: "img2", audio: "snd1", video: "take1" }), [{ op: "set_input", image: "img2", audio: "snd1" }], "a picture and a voice, no clip");
  assert.deepEqual(one("edit", { op: "set_input", image: "img-nine" }), [], "a picture that is not in the library");
});

test("Truffle cannot run what she has not opened", () => {
  assert.deepEqual(readUtensilsAnswer(say([{ op: "run_tool" }]), { ...UTENSILS, open: null }).actions, []);
  assert.deepEqual(readUtensilsAnswer(say([{ op: "set_input", words: "x" }, { op: "run_tool" }]), { ...UTENSILS, open: null }).actions, []);
  assert.deepEqual(readUtensilsAnswer(say([{ op: "run_tool" }]), UTENSILS).actions, [{ op: "run_tool" }], "the tool that is open is the one to run");
  assert.equal(readUtensilsAnswer(say(Array.from({ length: 20 }, () => ({ op: "pick_tool", tool: "sfx" }))), UTENSILS).actions.length, 8);
  assert.deepEqual(readUtensilsAnswer("Truffle is thinking.", UTENSILS), { reply: "Truffle is thinking.", actions: [] });
});

test("Truffle's reader accepts only her own actions", () => {
  const foreignActions = [{ do: "roll" }, { op: "make_it" }, { op: "pick_trend", trend: "hotel-lobby" }, { op: "give_role", role: "Lead", crew: "mochi" }, { op: "edit_text", layer: "headline", text: "x" }, { op: "trim", clip: 1, seconds: 3 }, { op: "camera_move", args: { move: "push-in" } }, { op: "render" }, { op: "rename", name: "x" }];
  assert.deepEqual(readUtensilsAnswer(say(foreignActions), UTENSILS).actions, []);
  assert.deepEqual(readUtensilsAnswer(say([...foreignActions, { op: "pick_tool", tool: "cutout" }]), UTENSILS).actions, [{ op: "pick_tool", tool: "cutout" }]);
});

// Paprika's own reader tests are in tests/spice-assist.test.ts; here only what she shares with the others: her op, kept by her reader alone
const SPICE = { department: "fx", footage: { first: 1001, last: 1120 } };

test("a summary with junk in its lists is read as far as it makes sense, and never thrown at", () => {
  const mixer: any = { shelf: [null, 7, "x", ...SHELF], crew: [null, ...CREW], stars: [null, 4, "Luna"], mixes: [null, ...MIXER.mixes], open: { trend: "hotel-lobby", cast: [null, { role: "Lead", who: "Praline" }] } };
  assert.ok(mixerPrompt(mixer, [{ role: "user", text: "hi" }]).includes("hotel-lobby · Hotel Lobby"));
  assert.deepEqual(readMixerAnswer(say([{ op: "pick_trend", trend: "hotel-lobby" }, { op: "give_role", role: "partner", crew: "mochi" }]), mixer).actions, [{ op: "pick_trend", trend: "hotel-lobby" }, { op: "give_role", role: "Partner", crew: "mochi" }]);
  const utensils: any = { tools: [null, ...TOOLS], library: { images: [null, { id: "img1", name: "moon" }], clips: "none", sounds: [3] }, open: { tool: "upscale", has: null, options: null } };
  assert.ok(utensilsPrompt(utensils, []).includes("img1 · moon"));
  assert.deepEqual(readUtensilsAnswer(say([{ op: "set_input", image: "img1" }]), utensils).actions, [{ op: "set_input", image: "img1" }]);
  for (const nothing of [{}, { shelf: 5, crew: {}, open: [], mixes: null }]) {
    assert.deepEqual(readMixerAnswer(say([{ op: "pick_trend", trend: "hotel-lobby" }, { op: "make_it" }]), nothing as any).actions, []);
    assert.ok(mixerPrompt(nothing as any, []).includes("NO TREND IS OPEN"));
  }
  assert.deepEqual(readUtensilsAnswer(say([{ op: "pick_tool", tool: "upscale" }, { op: "run_tool" }]), {} as any).actions, []);
  assert.ok(utensilsPrompt({} as any, []).includes("NO TOOL IS OPEN"));
});

// ---------------------------------------------------------------- every route's reader keeps to its own product

// one action of each assistant, each with a name no other has (Kitchen's editor makes sound, which Pickle never does; Pickle works the music video)
const OWN = {
  shot: { do: "settings", seconds: 6 },
  stage: { op: "camera_move", args: { move: "push-in" } },
  story: { op: "bible", kind: "cast", name: "Mara", set: { words: "a girl with a red coat" } },
  cut: { op: "music", prompt: "gentle piano and strings", at: 0, seconds: 30 },
  jam: { op: "part", seconds: 15 },
  macaron: { op: "edit_text", layer: "headline", text: "Say it." },
  mixer: { op: "pick_trend", trend: "hotel-lobby" },
  spice: { op: "layer", element: "flame" },
  utensils: { op: "pick_tool", tool: "cutout" },
};
const EVERYONE = Object.values(OWN);
const kinds = (actions: any[]) => actions.map((a) => a.do ?? a.op);

test("each assist route's answer reader keeps only its own assistant's actions", () => {
  const answer = JSON.stringify({ reply: "Done.", actions: EVERYONE, ops: EVERYONE });
  const readers: Record<string, (reply: string) => any[]> = {
    shot: (reply) => readAnswer(reply, new Set()).actions,
    stage: (reply) => readControlAnswer(reply, {}).actions,
    story: (reply) => readStoryAssist(reply).ops,
    cut: (reply) => readCutAnswer(reply).actions,
    jam: (reply) => readCutAnswer(reply, "jam").actions,
    macaron: (reply) => macaron.readMacaronAnswer(reply).actions,
    mixer: (reply) => readMixerAnswer(reply, MIXER).actions,
    spice: (reply) => readSpiceAnswer(reply, SPICE).actions,
    utensils: (reply) => readUtensilsAnswer(reply, UTENSILS).actions,
  };
  for (const [who, read] of Object.entries(readers)) {
    const own = kinds([OWN[who as keyof typeof OWN]])[0];
    const got = kinds(read(answer));
    assert.ok(got.includes(own), `${who}'s reader keeps ${own} (got ${got.join(", ") || "nothing"})`);
    const others = new Set(Object.entries(OWN).filter(([k]) => k !== who).map(([, a]) => kinds([a])[0]));
    assert.deepEqual(got.filter((k) => others.has(k)), [], `${who}'s reader lets another assistant's action through`);
  }
});

test("Kitchen's editor and Pickle share the clip actions and keep the rest apart: only the editor makes sound, only Pickle works the beat", () => {
  const answer = say([{ op: "trim", clip: 1, seconds: 3 }, { op: "music", prompt: "gentle piano" }, { op: "sound", prompt: "rain" }, { op: "voice", who: "a girl", line: "Hi", at: 1 }, { op: "beats", action: "detect" }, { op: "effect", kind: "zoom", every: 4 }, { op: "lyrics", style: "karaoke" }, { op: "part", seconds: 15 }]);
  assert.deepEqual(kinds(readCutAnswer(answer).actions), ["trim", "music", "sound", "voice"]);
  assert.deepEqual(kinds(readCutAnswer(answer, "jam").actions), ["trim", "beats", "effect", "lyrics", "part"]);
  const editor = cutBrief();
  const pickle = jamBrief([]);
  for (const op of ["beats", "effect", "sticker", "lyrics", "snap", "draft", "part"]) assert.ok(!editor.includes(`"op": "${op}"`), `the Cut brief teaches ${op}`);
  for (const op of ["music", "sound", "voice"]) assert.ok(!pickle.includes(`"op": "${op}"`), `Pickle's brief teaches ${op}, which costs credits`);
  assert.ok(editor.includes("Cut room") && pickle.includes("Pickle"));
  for (const n of ["Jam", "Pickle", "Mixer", "Macaron", "Utensils"]) assert.ok(!editor.includes(n), `the Cut brief names ${n}`);
});

test("the bar's Jam entry is Jam's own: Pickle, his workspaces, their placeholders and the labels of their tools", async () => {
  const jam = await import("../web/js/jam-harness.js");
  const h = harnessOf("jam")!;
  assert.deepEqual([h.pet, h.name, h.tag, h.face], [jam.PICKLE.id, jam.PICKLE.name, jam.PICKLE.tag, jam.PICKLE.face]);
  assert.deepEqual(Object.keys(h.placeholders), jam.WORKSPACES.map((w: { id: string }) => w.id));
  assert.deepEqual(h.placeholders, jam.PLACEHOLDER, "the bar says what Jam's data says");
  for (const [room, tools] of Object.entries(jam.PRESETS) as [string, { label: string; ask: string }[]][]) {
    assert.deepEqual((h.presets as Record<string, { label: string; text: string }[]>)[room], tools.map((t) => ({ label: t.label, text: t.ask })), `${room}: his tools are the chips`);
  }
});

test("Jam has five workspaces in the order a video is made, the page and the server agree on them, and Pickle has no canned tools", async () => {
  const jam = await import("../web/js/jam-harness.js");
  const ids = jam.WORKSPACES.map((w: { id: string }) => w.id);
  assert.deepEqual(ids, ["song", "track", "words", "band", "edit"]);
  assert.deepEqual([...JAM_WORKSPACES], ids, "Pickle's server list is the page's");
  for (const w of jam.WORKSPACES as { title: string; tag: string[] }[]) {
    assert.ok(w.title.length > 0 && Array.isArray(w.tag) && w.tag.length >= 3 && w.tag.length <= 4, `${w.title}: a title and three or four short lines under it`);
    for (const line of w.tag) assert.ok(line.length <= 28, `"${line}" is short`);
  }
  assert.deepEqual(Object.keys(jam.PRESETS), ids, "a list per workspace (the registry wants one)");
  assert.deepEqual(Object.values(jam.PRESETS).flat(), [], "none of them has a canned key");
  for (const room of ids) assert.ok(jam.PLACEHOLDER[room].startsWith("Ask Pickle — "), `${room}: the bar asks him by name`);
});
