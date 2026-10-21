// Utensils' mini apps (server/comfy-templates.ts: appsOf, splitSlots, the apps view and routes) and how Truffle reads them
// (server/utensils-assist.ts). The catalog and schemas are the fixtures of tests/fixtures/comfy-templates (real answers of Cloud) plus a few
// made here; nothing reaches Comfy Cloud and nothing is run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  flatten, appsOf, splitSlots, buildForm, buildRunRequest, createTemplates, CURATED_APPS, OFFICIAL_APPS, type Slot, type Form, type Cloud,
} from "../server/comfy-templates.ts";
import { utensilsPrompt, readUtensilsAnswer } from "../server/utensils-assist.ts";

const fx = (name: string) => readFile(join(import.meta.dirname, "fixtures", "comfy-templates", name), "utf8").then(JSON.parse);

/** The fixture catalog and a few apps of ComfyUI's own, as the index lists them. */
async function catalog() {
  const index = await fx("index.json");
  const app = (name: string, extra: Record<string, unknown> = {}) => ({ name, title: `Long technical title of ${name}`, mediaType: "image", mediaSubtype: "webp", description: "A very long marketing sentence about what this does, which goes on. And a second sentence that is cut.", tags: ["Image"], models: ["M"], isApp: true, io: { inputs: [{ nodeId: 1, nodeType: "LoadImage", mediaType: "image" }], outputs: [{ nodeId: 2, mediaType: "image" }] }, ...extra });
  index.push({ moduleName: "default", category: "Product & Ads", title: "Product & Ads", type: "image", templates: [
    app("template_sferro21_product_ad.app", { thumbnailVariant: "compareSlider" }),
    app("templates_liveportrait.app"),
    app("template_contact_sheet-step_2.app"),
    app("a_brand_new_thing.app"),
  ] });
  return flatten(index);
}

const slot = (id: string, kind: Slot["kind"], extra: Partial<Slot> = {}): Slot => ({ id, label: id, kind, required: false, advanced: false, target: { via: "slot", address: `9.${id}` }, ...extra });
const form = (...slots: Slot[]): Form => ({ slots, models: [], notes: [] });

test("the apps: the hand-picked ones the catalog has, then ComfyUI's own, then any new one; the rest of the catalog is not an app", async () => {
  const items = await catalog();
  const apps = appsOf(items);
  const names = apps.map((a) => a.name);
  // the hand-picked ones present in the fixture come first, in their own order; the missing ones are skipped
  assert.deepEqual(names.slice(0, 5), ["utility_birefnet_remove_background", "image_z_image_turbo", "image_qwen_image_edit_2509", "api_nano_banana_2_1_image_edit", "video_ltx2_3_i2v"]);
  assert.ok(names.includes("audio_ace_step1_5_xl_turbo") && names.includes("3d_hunyuan3d-v2.1"));
  assert.ok(!names.includes("image_flux2"), "a hand-picked app the catalog lacks is skipped");
  assert.ok(!names.includes("llm_chat") && !names.includes("old_one"), "what the catalog leaves out is not an app");
  assert.ok(!names.includes("audio-chatterbox_tts") || CURATED_APPS.some((d) => d.name === "audio-chatterbox_tts"));
  // ComfyUI's own: named for the cards, a step of a chain left out
  const ad = apps.find((a) => a.name === "template_sferro21_product_ad.app")!;
  assert.equal(ad.title, "Product ad");
  assert.equal(ad.after, "api/utensils/templates/thumb/template_sferro21_product_ad.app?n=2", "its before/after picture, when it has one");
  assert.ok(!names.includes("template_contact_sheet-step_2.app"), "a step of a chain is hidden");
  // an app the catalog gained since: named and promised from its own words
  const fresh = apps.find((a) => a.name === "a_brand_new_thing.app")!;
  assert.equal(fresh.id, "a-brand-new-thing");
  assert.match(fresh.promise, /^A very long marketing sentence about what this does, which goes on\.$/);
  assert.deepEqual(fresh.needs, ["image"]);
  assert.equal(fresh.isApp, true);
  // the id is short and unique, and the hand-picked ones are not the catalog's own
  assert.equal(new Set(apps.map((a) => a.id)).size, apps.length);
  for (const a of apps) assert.ok(a.id.length <= 24, a.id);
  assert.equal(apps.find((a) => a.name === "image_qwen_image_edit_2509")!.curated, true);
  assert.equal(apps.find((a) => a.name === "a_brand_new_thing.app")!.curated, false);
  // the promise is one plain line, not the catalog's
  for (const d of [...CURATED_APPS, ...OFFICIAL_APPS]) assert.ok(d.promise.length > 10 && d.promise.length <= 90 && !d.promise.includes("\n"), d.name);
});

test("an app's own inputs, with no short form of its author's: the files it needs, its main prompt, and nothing else", async () => {
  const edit = splitSlots(buildForm(await fx("schema-image_qwen_image_edit_2509.json"), await fx("wf-image_qwen_image_edit_2509.json")));
  assert.deepEqual(edit.primary, ["image", "prompt"]);
  assert.deepEqual(edit.needs, ["image", "words"]);
  assert.equal(edit.partial, false);
  assert.ok(edit.advanced.includes("seed") && edit.advanced.includes("negative"), "the seed and the negative prompt are under More settings");
  // the slots come back in that order, flagged: the page draws the primary ones and folds the others away
  assert.deepEqual(edit.slots.slice(0, 2).map((s) => [s.id, s.primary, s.advanced]), [["image", true, false], ["prompt", true, false]]);
  assert.ok(edit.slots.slice(2).every((s) => s.primary === false && s.advanced === true));

  const words = splitSlots(buildForm(await fx("schema-image_z_image_turbo.json"), await fx("wf-image_z_image_turbo.json")));
  assert.deepEqual(words.needs, ["words"]);
  assert.equal(words.primary.length, 1);

  const video = splitSlots(buildForm(await fx("schema-video_ltx2_3_i2v.json"), await fx("wf-video_ltx2_3_i2v.json")));
  assert.deepEqual(video.primary, ["first_frame", "prompt"]);

  // a picture and a sound that must both be given are both its own; a second picture that is only there is not
  const sing = splitSlots(form(slot("first_frame", "image", { required: true }), slot("second", "image", { required: true }), slot("audio", "audio", { required: true }), slot("prompt", "text")));
  assert.deepEqual(sing.primary, ["first_frame", "audio", "prompt"]);
  // nothing to give: it just runs
  assert.deepEqual(splitSlots(form(slot("seed", "seed"), slot("steps", "number"))).primary, []);
});

test("an app with its author's short form: the widgets it lists say what matters, found by the name they write to", () => {
  // the product ad: two pictures, the words, an aspect: three at most, so the aspect is under More settings
  const ad = splitSlots(
    form(slot("image", "image", { required: true }), slot("image2", "image", { required: true }), slot("prompt", "text"), slot("aspect_ratio", "combo", { options: ["1:1", "9:16"] }), slot("seed", "seed")),
    { inputs: [["1", "image"], ["2", "image"], ["4", "prompt"], ["4", "aspect_ratio"]] },
  );
  assert.deepEqual(ad.primary, ["image", "image2", "prompt"]);
  assert.equal(ad.partial, false);

  // one picture and an aspect: the choice has room
  const one = splitSlots(form(slot("image", "image", { required: true }), slot("aspect_ratio", "combo", { options: ["1:1"] })), { inputs: [["1", "image"], ["4", "aspect_ratio"]] });
  assert.deepEqual(one.primary, ["image", "aspect_ratio"]);

  // the prompt is a slot whose widget has another name (string_a): it is found by the address it writes to
  const gummy = splitSlots(
    form(slot("prompt", "text", { target: { via: "slot", address: "76.string_a" } }), slot("width", "number"), slot("height", "number"), slot("strength_model", "number")),
    { inputs: [["80", "string_a"], ["58", "width"], ["58", "height"], ["78", "strength_model"]] },
  );
  assert.deepEqual(gummy.primary, ["prompt"], "numbers are never its own: they are More settings");
  assert.deepEqual(gummy.advanced, ["width", "height", "strength_model"]);

  // a prompt the subgraph calls "value" is just a prompt to the person
  const named = splitSlots(form(slot("value", "text", { label: "Value" })), { inputs: [["1", "value"]] });
  assert.equal(named.slots[0].label, "Prompt");
});

test("an app the form cannot drive is not shown: it would run on its own sample", () => {
  // the author's form asks for a picture and a clip, the form can take only the picture (the clip's loader is a custom node's)
  const portrait = splitSlots(form(slot("image", "image", { required: true })), { inputs: [["3", "image"], ["44", "choose video to upload"], ["44", "videopreview"]] });
  assert.equal(portrait.files, 2, "the preview is not a file the person gives");
  assert.equal(portrait.partial, true);
  // nothing in the form is any of what the author listed
  assert.equal(splitSlots(form(slot("seed", "seed")), { inputs: [["51", "value"]] }).partial, true);
  // enough pictures
  assert.equal(splitSlots(form(slot("a", "image"), slot("b", "image")), { inputs: [["1", "image"], ["2", "image"]] }).partial, false);
  // asking for seven files is a pipeline, not a mini app
  const many = splitSlots(form(...Array.from({ length: 7 }, (_, i) => slot(`image${i}`, "image"))), { inputs: Array.from({ length: 7 }, (_, i) => [String(i), "image"]) });
  assert.equal(many.files, 7);
  assert.equal(many.primary.length, 3);
});

test("the widgets a subgraph promotes onto its face are in the form, and are written by the instance's id", () => {
  const schema = {
    slots: [
      { address: "54.video", node_id: "54", input_name: "video", type: "VIDEO", source: "subgraph_input", wired_to: { node_id: "39", class_type: "LoadVideo", inputs: { file: "x.mp4" } } },
      { address: "54.text", node_id: "54", input_name: "text", type: "STRING", default: "Remove the crystal glass from the foreground.", source: "promoted_widget", route: "input_overrides", flat_key: "54:9" },
      { address: "54.seed", node_id: "54", input_name: "seed", type: "INT", default: 5, source: "promoted_widget", route: "input_overrides" },
      { address: "54.direction", node_id: "54", input_name: "direction", type: "COMBO", default: "down", source: "promoted_widget", route: "input_overrides" },
      { address: "54.unet_name", node_id: "54", input_name: "unet_name", type: "COMBO", default: "ltx.safetensors", source: "promoted_widget", route: "input_overrides" },
      { address: "54.resize_type.width", node_id: "54", input_name: "resize_type.width", type: "*", default: 1280, source: "promoted_widget", route: "input_overrides" },
    ],
  };
  const wf = { nodes: [{ id: 54, type: "sg", inputs: [{ name: "video", link: 5 }] }, { id: 39, type: "LoadVideo" }], links: [[5, 39, 0, 54, 0, "VIDEO"]], definitions: { subgraphs: [{ id: "sg", inputs: [{ name: "video", type: "VIDEO" }], nodes: [], links: [] }] } };
  const f = buildForm(schema, wf);
  const by = Object.fromEntries(f.slots.map((s) => [s.id, s]));
  assert.deepEqual(Object.keys(by).sort(), ["prompt", "seed", "video"]);
  assert.deepEqual(by.prompt.target, { via: "input", node: "54", input: "text" }, "the prompt of the instance, by its id");
  assert.equal(by.prompt.default, "Remove the crystal glass from the foreground.");
  assert.equal(by.seed.kind, "seed");
  assert.deepEqual(f.models, ["ltx.safetensors"], "a model picker is listed as a model; a choice that is not a model is not");
  const split = splitSlots(f);
  assert.deepEqual(split.primary, ["video", "prompt"], "the clip and the words: what an object removal asks for");
  const req = buildRunRequest("t", f, { prompt: "Remove the red car", seed: 3 }, { video: { name: "up-1.mp4" } });
  assert.deepEqual(req.input_overrides, { "39": { file: "up-1.mp4" }, "54": { text: "Remove the red car", seed: 3 } });
  assert.deepEqual(req.slot_overrides, {});
});

// ---------------------------------------------------------------- the routes

/** A service over the fixture catalog (and a made-up app), with Cloud's schemas stood in for. */
async function service(dir: string) {
  const index = await fx("index.json");
  index.push({ moduleName: "default", category: "Product & Ads", title: "Product & Ads", type: "image", templates: [{ name: "templates_liveportrait.app", title: "Live Portrait", mediaType: "image", mediaSubtype: "webp", description: "x.", tags: [], models: [], isApp: true, io: { inputs: [{ mediaType: "image" }, { mediaType: "video" }] } }] });
  const schemas = new Map<string, any>();
  for (const n of ["image_qwen_image_edit_2509", "image_z_image_turbo", "video_ltx2_3_i2v", "audio_ace_step1_5_xl_turbo", "api_nano_banana_2_1_image_edit", "utility_birefnet_remove_background"]) schemas.set(n, await fx(`schema-${n}.json`));
  // the portrait's schema: one picture, no loader for its clip
  schemas.set("templates_liveportrait.app", { id: "x", slots: [{ address: "3.image", node_id: "3", input_name: "image", type: "IMAGE", source: "subgraph_input", wired_to: { node_id: "3", class_type: "LoadImage", inputs: { image: "p.png" } } }] });
  const reads: string[] = [];
  const cloud: Cloud = {
    mcp: async (tool, args) => {
      reads.push(`${tool}:${args.template_id ?? args.template_name}`);
      if (tool === "get_template_schema") {
        const s = schemas.get(String(args.template_id));
        if (!s) throw new Error("unknown template");
        return JSON.stringify(s);
      }
      return "0 credits - no paid API nodes found in this workflow.";
    },
    mcpRun: async () => "never",
    rest: async () => ({}),
    view: async () => ({ bytes: Buffer.alloc(0), type: "" }),
    upload: async () => "x",
  };
  const live = { nodes: [{ id: 3, type: "LoadImage" }], extra: { linearData: { inputs: [["3", "image"], ["44", "choose video to upload"]], outputs: ["15"] } } };
  const fetchStub = (async (url: string) => {
    if (String(url).endsWith("/templates/index.json")) return new Response(JSON.stringify(index), { status: 200 });
    if (String(url).endsWith("/templates/templates_liveportrait.app.json")) return new Response(JSON.stringify(live), { status: 200 });
    const m = String(url).match(/templates\/([\w.-]+)\.json$/);
    if (m) {
      try {
        return new Response(JSON.stringify(await fx(`wf-${m[1]}.json`)), { status: 200 });
      } catch {
        return new Response("{}", { status: 404 });
      }
    }
    return new Response("nope", { status: 404 });
  }) as unknown as typeof fetch;
  const svc = createTemplates({ data: dir, root: join(import.meta.dirname, ".."), cloud, fetch: fetchStub, warm: false });
  return { svc, reads };
}

test("the apps view: the apps with their promise and what they ask for, searched and filtered, the undrivable ones dropped once read", async () => {
  const dir = await mkdtemp(join(tmpdir(), "apps-"));
  const { svc } = await service(dir);

  const all: any = (await svc.handle("GET", "/apps", new URLSearchParams(), {})).body;
  assert.ok(all.count >= 7);
  const edit = all.items.find((a: any) => a.name === "image_qwen_image_edit_2509");
  assert.equal(edit.id, "edit-words");
  assert.equal(edit.title, "Edit with words");
  assert.deepEqual(edit.needs, ["image", "words"]);
  assert.equal(edit.primary, null, "not read yet: the form comes in the background");
  assert.ok(all.items.some((a: any) => a.name === "templates_liveportrait.app"), "shown until its form says it cannot be driven");

  // the same listing by the route the catalog uses, and a search
  const same: any = (await svc.handle("GET", "", new URLSearchParams("apps=1"), {})).body;
  assert.equal(same.count, all.count);
  const found: any = (await svc.handle("GET", "/apps", new URLSearchParams("q=background"), {})).body;
  assert.deepEqual(found.items.map((a: any) => a.name), ["utility_birefnet_remove_background"]);
  const audio: any = (await svc.handle("GET", "/apps", new URLSearchParams("group=audio"), {})).body;
  assert.ok(audio.items.length >= 1 && audio.items.every((a: any) => a.medium === "audio"));

  // read the forms (the background does this after the server starts): each app knows its own slots, and the portrait drops out
  await svc.warmApps();
  const read: any = (await svc.handle("GET", "/apps", new URLSearchParams(), {})).body;
  const e2 = read.items.find((a: any) => a.name === "image_qwen_image_edit_2509");
  assert.deepEqual(e2.primary, ["image", "prompt"]);
  assert.ok(e2.advanced.includes("seed"));
  assert.deepEqual(e2.needs, ["image", "words"]);
  assert.equal(e2.credits, 0, "the price is read with the form");
  assert.ok(!read.items.some((a: any) => a.name === "templates_liveportrait.app"), "an app whose form cannot take what it asks for is not shown");
  assert.equal(read.count, all.count - 1);
});

test("an app's detail: its slots with their own first, and what it needs said plainly", async () => {
  const dir = await mkdtemp(join(tmpdir(), "apps-"));
  const { svc } = await service(dir);
  const d: any = (await svc.handle("GET", "/image_qwen_image_edit_2509", new URLSearchParams(), {})).body;
  assert.equal(d.app.id, "edit-words");
  assert.equal(d.app.promise, "Say what to change in a picture; everything else stays.");
  assert.equal(d.app.usable, true);
  assert.deepEqual(d.schema.slots.filter((s: any) => s.primary).map((s: any) => s.id), ["image", "prompt"]);
  assert.ok(d.schema.slots.filter((s: any) => !s.primary).every((s: any) => s.advanced === true));
  assert.ok(!("target" in d.schema.slots[0]), "the page is still not told where a value is written");
  // a hand-picked one is an app too, and one that is no app comes as it always did: no app, no primary flags
  const music: any = (await svc.handle("GET", "/audio_ace_step1_5_xl_turbo", new URLSearchParams(), {})).body;
  assert.equal(music.app.id, "music");
  assert.ok(music.schema.slots.some((s: any) => s.primary));
  const plain: any = (await svc.handle("GET", "/audio-chatterbox_tts", new URLSearchParams(), {}).catch(() => ({ body: { app: { id: "voice" } } }))).body;
  assert.equal(plain.app?.id, "voice");
  // the undrivable one says so
  const portrait: any = (await svc.handle("GET", "/templates_liveportrait.app", new URLSearchParams(), {})).body;
  assert.equal(portrait.app.usable, false);
  assert.equal(portrait.app.partial, true);
});

// ---------------------------------------------------------------- Truffle

test("Truffle is told the mini apps apart and may open one by its id, and set up what it takes", () => {
  const apps = [
    { id: "app-bg-remove", name: "Remove background", takes: ["image"] },
    { id: "app-edit-words", name: "Edit with words", takes: ["image"], words: "needed" },
  ];
  const summary = {
    workspace: "templates",
    tools: [{ id: "template", workspace: "templates", name: "Template", takes: [] }],
    others: [{ id: "upscale", workspace: "picture", name: "Upscale", takes: ["image"] }],
    apps,
    open: { tool: "template", has: {}, ready: false },
    library: { images: [{ id: "img1", name: "cat", size: "1×1" }] },
  };
  const prompt = utensilsPrompt(summary, [{ role: "user", text: "open the background remover" }]);
  assert.match(prompt, /THE MINI APPS/);
  assert.match(prompt, /app-bg-remove · Remove background · a picture · none/);
  assert.match(prompt, /app-edit-words · Edit with words · a picture · needed/);
  // the reader keeps her pick of an app, and the picture and words for it; an app that is not listed is dropped
  const answer = readUtensilsAnswer(JSON.stringify({ reply: "Opened it.", actions: [{ op: "pick_tool", tool: "app-edit-words" }, { op: "set_input", image: "img1", words: "make it night" }, { op: "pick_tool", tool: "app-made-up" }] }), summary);
  assert.deepEqual(answer.actions.map((a: any) => a.op), ["pick_tool", "set_input"]);
  assert.equal(answer.actions[0].tool, "app-edit-words");
  assert.equal(answer.actions[1].image, "img1");
  assert.equal(answer.actions[1].words, "make it night");
});
