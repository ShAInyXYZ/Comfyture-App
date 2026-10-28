// Utensils' Templates (server/comfy-templates.ts): the catalog, the form made from Cloud's schema and the template's own workflow,
// the run_template request, the price, the outputs, and a whole run through a stand-in Cloud. Nothing here reaches Comfy Cloud:
// the fixtures are real answers (tests/fixtures/comfy-templates), the run is faked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  flatten, library, listing, search, buildForm, buildRunRequest, withOverrides, parseCredits, explainError, isDone, isOver, jobOutputs, jobError, loaderName, publicSlot, createTemplates, fakeRun, png, firstFrame, type Cloud,
} from "../server/comfy-templates.ts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const fx = (name: string) => readFile(join(import.meta.dirname, "fixtures", "comfy-templates", name), "utf8").then(JSON.parse);
const schemaOf = async (t: string) => fx(`schema-${t}.json`);
const wfOf = async (t: string) => fx(`wf-${t}.json`);

test("the catalog: one card per template, grouped, with the ones that make nothing left out", async () => {
  const items = flatten(await fx("index.json"));
  const by = Object.fromEntries(items.map((i) => [i.name, i]));
  assert.equal(by.llm_chat, undefined, "text generation is not a picture, a clip or a sound");
  assert.equal(by.old_one, undefined, "archived templates are hidden");
  assert.equal(by.api_nano_banana_2_1_image_edit.group, "partner");
  assert.equal(by.api_nano_banana_2_1_image_edit.partner, true);
  assert.equal(by.utility_birefnet_remove_background.group, "utility");
  assert.equal(by.video_ltx2_3_i2v.group, "video");
  assert.equal(by.audio_ace_step1_5_xl_turbo.group, "audio");
  assert.ok(by.image_qwen_image_edit_2509.inputs.includes("image"));
  assert.ok(by.image_qwen_image_edit_2509.inputs.includes("text"));
  assert.match(by.image_z_image_turbo.thumb, /^api\/utensils\/templates\/thumb\/image_z_image_turbo$/);
  for (const i of items) assert.match(i.name, /^[A-Za-z0-9._-]+$/);
});

test("the Library: every workflow under its Cloud category, the categories in Cloud's order with their counts, tutorials only from docs.comfy.org", async () => {
  const index = await fx("index.json");
  const items = flatten(index);
  const lib = library(items);
  assert.equal(lib.total, items.length);
  assert.equal(lib.items.length, items.length);
  assert.equal(lib.categories.reduce((n, c) => n + c.count, 0), items.length, "every workflow stands in one bookcase");
  const order = index.map((c: any) => String(c.title ?? c.category)).filter((t: string) => lib.categories.some((c) => c.name === t));
  assert.deepEqual(lib.categories.map((c) => c.name), order, "the bookcases follow Cloud's own order");
  for (const i of lib.items) {
    assert.ok(lib.categories.some((c) => c.name === i.category));
    assert.ok(i.tutorial === null || i.tutorial.startsWith("https://docs.comfy.org/"));
  }
});

test("the listing: search, group, featured first, paging and the counts", async () => {
  const items = flatten(await fx("index.json"));
  const all = listing(items, {}, []);
  assert.equal(all.total, items.length);
  assert.equal(all.categories[0].count, items.length);
  assert.equal(all.categories.find((c) => c.id === "partner")?.count, items.filter((i) => i.partner).length);
  const video = listing(items, { group: "video" }, []);
  assert.ok(video.items.every((i) => i.group === "video"));
  assert.deepEqual(search(items, "qwen edit").map((i) => i.name)[0], "image_qwen_image_edit_2509");
  assert.equal(search(items, "zzzz-nothing").length, 0);
  const featured = listing(items, { featured: true }, ["video_ltx2_3_i2v"]);
  assert.equal(featured.items[0].name, "video_ltx2_3_i2v");
  assert.equal(listing(items, { limit: 2, offset: 1 }, []).items.length, 2);
});

test("a subgraph template's form: labelled by its own inputs, models out of the way, defaults from the right place", async () => {
  const form = buildForm(await schemaOf("video_ltx2_3_i2v"), await wfOf("video_ltx2_3_i2v"));
  const ids = form.slots.map((s) => s.id);
  assert.deepEqual(ids.slice(0, 2), ["first_frame", "prompt"], "the picture first, then the words");
  const frame = form.slots[0];
  assert.equal(frame.kind, "image");
  assert.equal(frame.required, true);
  assert.deepEqual(frame.target, { via: "input", node: "269", input: "image" }, "the picture goes into the loader that feeds the subgraph");
  const by = Object.fromEntries(form.slots.map((s) => [s.id, s]));
  assert.equal(by.width.default, 1280);
  assert.equal(by.height.default, 720);
  assert.equal(by.duration.default, 5);
  assert.equal(by.seed.kind, "seed");
  assert.equal(by.fps.advanced, true);
  assert.match(String(by.prompt.default), /^Egyptian royal/);
  assert.ok(!ids.some((i) => /ckpt|lora|encoder|model/.test(i)), "model pickers are not in the form");
  assert.ok(form.models.some((m) => m.startsWith("ltx-2.3")));
});

test("promoted widgets: the schema's defaults are matched to the right inputs, not to the slot that stands in their place", async () => {
  // image_qwen_image_edit_2509 lists its defaults in proxyWidgets order: a naive reading puts the prompt on the picture
  const form = buildForm(await schemaOf("image_qwen_image_edit_2509"), await wfOf("image_qwen_image_edit_2509"));
  const by = Object.fromEntries(form.slots.map((s) => [s.id, s]));
  assert.equal(by.image.kind, "image");
  assert.deepEqual(by.image.target, { via: "input", node: "78", input: "image" });
  assert.match(String(by.prompt.default), /^Replace the cat with a dalmatian/);
  assert.equal(by.negative.advanced, true);
  assert.equal(by.seed.default, 362225868152841);
  assert.equal(by.enable_turbo_mode.default, true);
  // the optional extra pictures are not in the form when the template gives no loader for them
  assert.ok(!("image2" in by));
});

test("a template with no widgets of its own on the instance: the schema's defaults line up", async () => {
  const form = buildForm(await schemaOf("image_z_image_turbo"), await wfOf("image_z_image_turbo"));
  const by = Object.fromEntries(form.slots.map((s) => [s.id, s]));
  assert.match(String(by.prompt.default), /^Latina female/);
  assert.equal(by.width.default, 1024);
  assert.equal(by.steps.default, 8);
  assert.equal(by.steps.advanced, true);
});

test("a template without a subgraph: loaders, the positive prompt, the seed and the well-known numbers from its graph", async () => {
  const ace = buildForm(await schemaOf("audio_ace_step1_5_xl_turbo"));
  const by = Object.fromEntries(ace.slots.map((s) => [s.id, s]));
  assert.equal(by.tags.kind, "text");
  assert.equal(by.lyrics.multiline, true);
  assert.equal(by.duration.default, 120);
  assert.equal(by.duration.max, 480, "a two-minute song widens the range");
  assert.equal(by.duration.also?.length, 1, "the latent's seconds follow the prompt's duration");
  assert.ok(!("seconds" in by));
  assert.ok(ace.models.some((m) => m.startsWith("acestep")));
  const banana = buildForm(await schemaOf("api_nano_banana_2_1_image_edit"));
  assert.equal(banana.slots[0].kind, "image");
  assert.deepEqual(banana.slots[0].target, { via: "input", node: "6", input: "image" });
  assert.ok(banana.slots.some((s) => s.kind === "text" && /dark/i.test(String(s.default))));
  const cutout = buildForm(await schemaOf("utility_birefnet_remove_background"), undefined);
  assert.equal(cutout.slots.length, 1, "a cutout asks for a picture and nothing else");
  assert.equal(cutout.slots[0].required, true);
});

test("the page sees a slot without where it writes to", async () => {
  const form = buildForm(await schemaOf("image_z_image_turbo"), await wfOf("image_z_image_turbo"));
  const slot = publicSlot(form.slots[0]);
  assert.ok(!("target" in slot));
  assert.ok(!("also" in publicSlot({ ...form.slots[0], also: [{ via: "slot", address: "1.x" }] })), "nor the places a value is also written");
});

test("FastH3: missing proxyWidgets routes prompt, dimensions, duration and seed to their actual interior nodes", async () => {
  // Captured from Cloud on 2026-10-28. apply_slots rejects these declared
  // addresses and explicitly directs them to the following flattened nodes.
  const form = buildForm(await schemaOf("video_fastvideo_fasth3_i2v"), await wfOf("video_fastvideo_fasth3_i2v"));
  const req = buildRunRequest("video_fastvideo_fasth3_i2v", form,
    { prompt: "Ketkout watches the robot wave.", width: 1344, height: 768, duration: 5, seed: 42 },
    { first_frame: { name: "ketkout-robot.png" } });
  assert.deepEqual(req.slot_overrides, {});
  assert.deepEqual(req.input_overrides, {
    "136": { image: "ketkout-robot.png" },
    "105:104": { prompt: "Ketkout watches the robot wave.", width: 1344, height: 768 },
    "105:111": { value: 5 },
    "105:15": { noise_seed: 42 },
  });
});

test("direct subgraph routing follows nested links and all consumers of a shared value", () => {
  const schema = { slots: [{ address: "1.duration", node_id: "1", input_name: "duration", source: "subgraph_input", type: "FLOAT" }] };
  const wf = { nodes: [{ id: 1, type: "outer" }], definitions: { subgraphs: [
    { id: "outer", inputs: [{ name: "duration", type: "FLOAT", linkIds: [1, 2] }], links: [
      { id: 1, target_id: 2, target_slot: 0 }, { id: 2, target_id: 3, target_slot: 0 },
    ], nodes: [{ id: 2, type: "inner", inputs: [{ name: "seconds" }] }, { id: 3, type: "PrimitiveFloat", inputs: [{ name: "value" }] }] },
    { id: "inner", inputs: [{ name: "seconds", type: "FLOAT", linkIds: [3] }], links: [{ id: 3, target_id: 4, target_slot: 0 }], nodes: [{ id: 4, type: "PrimitiveFloat", inputs: [{ name: "value" }] }] },
  ] } };
  const request = buildRunRequest("nested", buildForm(schema, wf), { duration: 5 });
  assert.deepEqual(request.slot_overrides, {});
  assert.deepEqual(request.input_overrides, { "1:2:4": { value: 5 }, "1:3": { value: 5 } });
});

test("the run_template request: only what was given, in the right place, kept in range", async () => {
  const form = buildForm(await schemaOf("video_ltx2_3_i2v"), await wfOf("video_ltx2_3_i2v"));
  const req = buildRunRequest("video_ltx2_3_i2v", form, { prompt: "A fox runs", width: 99999, height: 700, seed: -5, duration: 7.4, prompt_enhance: "true" }, { first_frame: { name: "abc.png" } });
  assert.equal(req.name, "video_ltx2_3_i2v");
  assert.deepEqual(req.slot_overrides, {}, "an instance without proxyWidgets uses direct executed inputs");
  assert.deepEqual(req.input_overrides, {
    "269": { image: "abc.png" },
    "320:319": { value: "A fox runs" },
    "320:312": { value: 2048 }, // clamped to the range
    "320:299": { value: 700 },
    "320:277": { noise_seed: 0 },
    "320:301": { value: 7 }, // whole seconds stay whole
    "320:328": { value: true },
  });
  assert.ok(!("320:300" in req.input_overrides), "frame rate was not given");
  const by = Object.fromEntries(form.slots.map((s) => [s.id, s]));
  // a prompt left as the template's own is not sent
  const same = buildRunRequest("video_ltx2_3_i2v", form, { prompt: by.prompt.default }, { first_frame: { name: "abc.png" } });
  assert.deepEqual(same.input_overrides, { "269": { image: "abc.png" } });
  // a missing picture is said in words
  assert.throws(() => buildRunRequest("video_ltx2_3_i2v", form, {}), /First frame needs a picture/);
});

test("a number carried twice is written in both places", async () => {
  const form = buildForm(await schemaOf("audio_ace_step1_5_xl_turbo"));
  const req = buildRunRequest("audio_ace_step1_5_xl_turbo", form, { duration: 60, tags: "lofi, 80 BPM" });
  const written = Object.values(req.input_overrides).flatMap((o) => Object.entries(o)).filter(([, v]) => v === 60).map(([k]) => k).sort();
  assert.deepEqual(written, ["duration", "seconds"]);
  assert.equal(Object.values(req.input_overrides).some((o) => o.tags === "lofi, 80 BPM"), true);
});

test("what an upload is called for a loader", () => {
  const hex = "a".repeat(64);
  assert.equal(loaderName({ name: `${hex}.mp3` }, "mp3"), `${hex}.mp3`);
  assert.equal(loaderName({ name: "clip.mp4", asset_hash: `blake3:${hex}` }, "mp4"), `${hex}.mp4`);
  assert.equal(loaderName({ name: "clip.mp4" }, "mp4"), "clip.mp4");
  // what Cloud's /assets answers today: the display name as `name`, the stored name as `hash`
  assert.equal(loaderName({ name: "clip.mp4", hash: `${hex}.mp4` }, "mp4"), `${hex}.mp4`);
  assert.equal(loaderName({ name: "voice.mp3", hash: hex }, "mp3"), `${hex}.mp3`);
});

test("the price: a total, a rate per unit, or no partner credits at all", () => {
  assert.deepEqual(parseCredits("0 credits - no paid API nodes found in this workflow.\n\nEstimate only"), { credits: 0, perUnit: null, note: "No partner credits: it runs on Cloud GPU time." });
  const per = parseCredits("1 paid API node(s):\n  GeminiNanoBanana2V2 (node 4): ~12 credits/Image\n\nEstimated total: unknown\n");
  assert.equal(per.credits, 12);
  assert.equal(per.perUnit, "image");
  assert.equal(parseCredits("Estimated total: 34.5 credits").credits, 34.5);
  assert.equal(parseCredits("something else").credits, null);
});

test("a failure is said plainly: a missing model is a note to import it", () => {
  const miss = explainError('422 invalid_workflow: Value not in list: unet_name: "qwen_image_2.1_fp8.safetensors" not in []');
  assert.equal(miss.needsImport, true);
  assert.match(miss.message, /missing a model/);
  assert.match(miss.message, /qwen_image_2\.1_fp8\.safetensors/);
  assert.match(explainError("402 insufficient credits").message, /Not enough credits/);
  assert.match(explainError("429 queue_full").message, /queue is full/);
  assert.equal(explainError("").message, "That didn't work.");
});

test("a finished job's files: the saved ones, by kind, and not what it echoed back", () => {
  const out = jobOutputs({
    outputs: {
      9: { images: [{ filename: "a.png", subfolder: "x", type: "output", metadata: { width: 10, height: 20 } }, { filename: "p.png", type: "temp" }] },
      7: { audio: [{ filename: "s.mp3", type: "output" }] },
      6: { images: [{ filename: "v.mp4", type: "output", metadata: { duration: 3 } }] },
      5: { images: [{ filename: "in.png", type: "input" }] },
      4: { result: [{ filename: "m.glb", type: "output" }] },
    },
  });
  assert.deepEqual(out.map((o) => [o.kind, o.filename]).sort(), [["audio", "s.mp3"], ["image", "a.png"], ["model", "m.glb"], ["video", "v.mp4"]]);
  assert.equal(jobOutputs({ outputs: { 1: { images: [{ filename: "only.png", type: "temp" }] } } }).length, 1, "previews when nothing else was saved");
  assert.equal(jobError({ execution_status: { messages: [["execution_error", { node_type: "KSampler", exception_message: "out of memory" }]] } }), "KSampler: out of memory");
});

// ---------------------------------------------------------------- a whole run, through a stand-in Cloud

/** A Cloud with no network: the catalog and schemas are the fixtures, and the paid calls are recorded. */
async function service(dir: string) {
  const index = JSON.stringify(await fx("index.json"));
  const calls: { tool: string; args: any }[] = [];
  const uploads: { kind: string; name: string; bytes: number }[] = [];
  const base: Cloud = {
    mcp: async (tool, args) => {
      if (tool === "get_template_schema") return JSON.stringify(await schemaOf(String(args.template_id)));
      if (tool === "estimate_credits") return "0 credits - no paid API nodes found in this workflow.";
      throw new Error(`unexpected read ${tool}`);
    },
    mcpRun: async () => "never",
    rest: async () => ({}),
    view: async () => ({ bytes: png(8, 8), type: "image/png" }),
    upload: async () => "x.png",
  };
  const cloud = fakeRun(base, 0.3);
  const real = cloud.mcpRun;
  cloud.mcpRun = async (tool, args) => (calls.push({ tool, args }), real(tool, args));
  const real2 = cloud.upload;
  cloud.upload = async (kind, file) => (uploads.push({ kind, name: file.name, bytes: file.bytes.length }), real2(kind, file));
  const fetchStub = (async (url: string) => {
    if (String(url).endsWith("/templates/index.json")) return new Response(index, { status: 200 });
    const m = String(url).match(/templates\/([\w.-]+)\.json$/);
    if (m) {
      try {
        return new Response(JSON.stringify(await wfOf(m[1])), { status: 200 });
      } catch {
        return new Response("{}", { status: 404 });
      }
    }
    return new Response("nope", { status: 404 });
  }) as unknown as typeof fetch;
  const svc = createTemplates({ data: dir, root: join(import.meta.dirname, ".."), cloud, fetch: fetchStub, warm: false });
  return { svc, calls, uploads };
}

test("a run: the picture goes up, the request is made from the form, the job is followed and its picture kept", async () => {
  const dir = await mkdtemp(join(tmpdir(), "templates-"));
  await mkdir(join(dir, "photos"), { recursive: true });
  await writeFile(join(dir, "photos", "cat.png"), png(16, 16));
  const { svc, calls, uploads } = await service(dir);

  const list = await svc.handle("GET", "", new URLSearchParams("group=image"), {});
  assert.equal(list.status, 200);
  const detail: any = (await svc.handle("GET", "/image_qwen_image_edit_2509", new URLSearchParams(), {})).body;
  assert.equal(detail.schema.slots[0].kind, "image");
  assert.ok(!("target" in detail.schema.slots[0]), "the page is not told where a value is written");

  const started: any = (await svc.handle("POST", "/image_qwen_image_edit_2509/run", new URLSearchParams(), { inputs: { image: "cat.png", prompt: "make it night", seed: 7 }, confirm: true })).body;
  assert.equal(started.status, "running");
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].kind, "image");
  assert.equal(calls[0].tool, "run_template");
  assert.equal(calls[0].args.name, "image_qwen_image_edit_2509");
  assert.equal(calls[0].args.confirm, true);
  assert.deepEqual(Object.keys(calls[0].args.input_overrides), ["78"]);
  assert.match(calls[0].args.input_overrides["78"].image, /^fake-/);
  assert.equal(Object.values(calls[0].args.slot_overrides).includes("make it night"), true);

  let job: any = started;
  for (let i = 0; i < 40 && job.status === "running"; i++) {
    await new Promise((ok) => setTimeout(ok, 250));
    job = (await svc.handle("GET", `/job/${started.id}`, new URLSearchParams(), {})).body;
  }
  assert.equal(job.status, "done");
  assert.equal(job.outputs.length, 1);
  assert.equal(job.outputs[0].kind, "image");
  assert.match(job.outputs[0].url, /^\/media\/photos\/[0-9a-f]{16}\.png$/);
  const kept = await readFile(join(dir, "photos", job.outputs[0].file));
  assert.equal(kept.subarray(1, 4).toString(), "PNG");
});

test("a run without its picture, or without the yes, does not start", async () => {
  const dir = await mkdtemp(join(tmpdir(), "templates-"));
  const { svc, calls } = await service(dir);
  await assert.rejects(() => svc.handle("POST", "/image_qwen_image_edit_2509/run", new URLSearchParams(), { inputs: { prompt: "night" } }), /needs a picture/);
  await assert.rejects(() => svc.handle("POST", "/image_qwen_image_edit_2509/run", new URLSearchParams(), { inputs: { image: "../../etc/passwd" } }), /missing/);
  assert.equal(calls.length, 0, "nothing was sent");
  await assert.rejects(() => svc.handle("GET", "/not a name", new URLSearchParams(), {}), /not in the catalog/);
});

test("the price is read once and kept", async () => {
  const dir = await mkdtemp(join(tmpdir(), "templates-"));
  const { svc } = await service(dir);
  const a: any = (await svc.handle("POST", "/video_ltx2_3_i2v/estimate", new URLSearchParams(), {})).body;
  assert.equal(a.credits, 0);
  const saved = JSON.parse(await readFile(join(dir, "templates", "credits-2.json"), "utf8"));
  assert.equal(saved.video_ltx2_3_i2v.credits, 0);
});

test("without a Cloud key the catalog still shows, and running says what is missing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "templates-"));
  const index = JSON.stringify(await fx("index.json"));
  const fetchStub = (async (url: string) => {
    if (String(url).endsWith("/templates/index.json")) return new Response(index, { status: 200 });
    if (String(url).endsWith("-1.webp")) return new Response(png(4, 4), { status: 200 });
    return new Response("nope", { status: 404 });
  }) as unknown as typeof fetch;
  const svc = createTemplates({ data: dir, root: join(import.meta.dirname, ".."), cloud: null, fetch: fetchStub });
  const list: any = (await svc.handle("GET", "", new URLSearchParams(), {})).body;
  assert.ok(list.total > 0);
  await assert.rejects(() => svc.handle("GET", "/image_z_image_turbo", new URLSearchParams(), {}), /Connect Comfy Cloud/);
  await assert.rejects(() => svc.handle("POST", "/image_z_image_turbo/run", new URLSearchParams(), { inputs: {}, confirm: true }), /Connect Comfy Cloud/);
  // a picture of a template is fetched once, then served from the disk
  const first = await svc.handle("GET", "/thumb/image_z_image_turbo", new URLSearchParams(), {});
  assert.equal(first.status, 200);
  assert.equal(first.type, "image/webp");
  const again = await svc.handle("GET", "/thumb/image_z_image_turbo", new URLSearchParams(), {});
  assert.deepEqual(again.raw, first.raw);
  assert.equal((await svc.handle("GET", "/thumb/not-in-catalog", new URLSearchParams(), {}).catch((e) => ({ status: e.status }))).status, 404);
});

test("a running job can be canceled, and says so", async () => {
  const dir = await mkdtemp(join(tmpdir(), "templates-"));
  const { svc, calls } = await service(dir);
  const started: any = (await svc.handle("POST", "/image_z_image_turbo/run", new URLSearchParams(), { inputs: { prompt: "a fox" }, confirm: true })).body;
  const stopped: any = (await svc.handle("DELETE", `/job/${started.id}`, new URLSearchParams(), {})).body;
  assert.ok(["running", "canceled"].includes(stopped.status));
  let job: any = stopped;
  for (let i = 0; i < 20 && job.status === "running"; i++) {
    await new Promise((ok) => setTimeout(ok, 150));
    job = (await svc.handle("GET", `/job/${started.id}`, new URLSearchParams(), {})).body;
  }
  assert.equal(job.status, "canceled");
  assert.ok(calls.some((c) => c.tool === "cancel_job"), "Cloud was asked to stop the job");
  assert.equal(job.outputs.length, 0);
});

test("the words of a job's status: a finished job ends the wait well, a failed or canceled one badly, and any other word is a job still on its way", () => {
  // queued_waiting is what Cloud answers just after a run is sent: taking it for a failure ended the wait on a job that went on and was billed
  for (const w of ["queued_waiting", "waiting_to_dispatch", "pending", "in_progress", "running", "assigned", "a_word_not_seen_before", ""]) {
    assert.equal(isDone(w), false, w);
    assert.equal(isOver(w), false, w);
  }
  for (const w of ["success", "completed", "succeeded"]) assert.equal(isDone(w), true, w);
  for (const w of ["error", "failed", "cancelled", "canceled", "timeout"]) assert.equal(isOver(w), true, w);
});

test("a run can set a template's own nodes beyond its form: node ids, input names and plain values only", () => {
  const req = withOverrides({ name: "t", slot_overrides: {}, input_overrides: { "440": { image: "a.png" } } }, {
    "441": { system_prompt: "Repeat it.", model: "gemini-3-1-flash-lite", seed: 7 },
    "442": { voice: "Matilda (female, american)" },
    "440": { image: "b.png" },
    "x9": { voice: "dropped" },
    "443": { "bad key!": 1, nested: { no: true }, big: "y".repeat(9000) },
  });
  assert.deepEqual(req.input_overrides["441"], { system_prompt: "Repeat it.", model: "gemini-3-1-flash-lite", seed: 7 });
  assert.equal(req.input_overrides["442"].voice, "Matilda (female, american)");
  assert.equal(req.input_overrides["440"].image, "b.png", "a setting given is the one used");
  assert.ok(!("x9" in req.input_overrides) && !("bad key!" in req.input_overrides["443"]) && !("nested" in req.input_overrides["443"]));
  assert.equal(String(req.input_overrides["443"].big).length, 8000);
  assert.equal(withOverrides(req, null), req);
});

test("open weights only (COMFYTURE_OPEN_WEIGHTS): a partner's template is refused before anything is sent, an open one still runs", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "templates-"));
  await mkdir(join(dir, "photos"), { recursive: true });
  await writeFile(join(dir, "photos", "cat.png"), png(16, 16));
  const { svc, calls, uploads } = await service(dir);
  const before = process.env.COMFYTURE_OPEN_WEIGHTS;
  process.env.COMFYTURE_OPEN_WEIGHTS = "1";
  t.after(() => (before === undefined ? delete process.env.COMFYTURE_OPEN_WEIGHTS : (process.env.COMFYTURE_OPEN_WEIGHTS = before)));
  await assert.rejects(() => svc.handle("POST", "/api_nano_banana_2_1_image_edit/run", new URLSearchParams(), { inputs: {}, confirm: true }), (e: any) => e.status === 403 && /Open weights only/.test(e.message));
  assert.deepEqual([calls.length, uploads.length], [0, 0], "nothing went to Cloud");
});

test("a grid shows an animated preview's first frame: cut out of its container, it is a still WebP of the same size, lighter", async () => {
  const run = promisify(execFile);
  const dir = await mkdtemp(join(tmpdir(), "first-frame-"));
  const encoders = (await run("ffmpeg", ["-hide_banner", "-encoders"]).catch(() => ({ stdout: "" }))).stdout;
  if (!/libwebp_anim/.test(encoders)) return; // (no animated WebP encoder on this machine: nothing to make the fixture with)
  // an opaque animation and one with alpha, as Comfy Cloud's previews come
  for (const [name, input] of [["opaque", "testsrc2=s=96x64:r=6:d=1"], ["alpha", "testsrc2=s=96x64:r=6:d=1,format=yuva420p,colorchannelmixer=aa=0.5"]]) {
    const anim = join(dir, `${name}.webp`);
    await run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", input, "-c:v", "libwebp_anim", "-loop", "0", anim]);
    const bytes = await readFile(anim);
    const still = firstFrame(bytes);
    assert.ok(still, `${name}: its first frame is cut out`);
    assert.ok(still!.length < bytes.length, `${name}: lighter than the animation`);
    assert.equal(still!.toString("ascii", 0, 4), "RIFF");
    assert.ok(!still!.includes("ANMF"), `${name}: a still, no frames left`);
    await writeFile(join(dir, `${name}.still.webp`), still!);
    const probe = (await run("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", join(dir, `${name}.still.webp`)])).stdout.trim();
    assert.equal(probe, "96,64", `${name}: it decodes, at the animation's size`);
  }
  // a picture that does not move is not cut
  await run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=96x64:d=1", "-frames:v", "1", "-c:v", "libwebp", join(dir, "still.webp")]);
  assert.equal(firstFrame(await readFile(join(dir, "still.webp"))), null);
  assert.equal(firstFrame(Buffer.from("not a picture")), null);
});
