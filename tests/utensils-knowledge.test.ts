// Utensils' knowledge: the files are whole and well formed (a tool's entry for every tool on the shelf and none other, a workflow's
// entry for every workflow of the catalogue, every id they point at exists, the hand-written ones are there), their words read as
// sentences, the search puts the right tools first for real jobs, and Truffle's guide is told the candidates and may name only
// them. No model is called and nothing is run.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadKnowledge, searchKnowledge, knowledgeById, words, type Entry } from "../server/utensils-knowledge.ts";
import { UTENSILS_BRIEF, UTENSILS_OPS, UTENSILS_TOOL, utensilsPrompt, readUtensilsAnswer, utensilsCandidates } from "../server/utensils-assist.ts";
import { CURATED_APPS, OFFICIAL_APPS } from "../server/comfy-templates.ts";
import { knowledgeIdOf, knowledgeOf } from "../web/js/utensils-knowledge.js";

const root = join(import.meta.dirname, "..");
const read = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));
const tools: Entry[] = read("knowledge/utensils/tools.json");
const workflows: Entry[] = read("knowledge/utensils/workflows.json");
const all = [...tools, ...workflows];
const byId = new Map(all.map((e) => [e.id, e]));
const catalogue: any[] = read("data/templates/index.json").flatMap((c: any) => c.templates ?? []);

const KINDS = new Set(["image", "video", "audio", "words", "3d", "mask", "none"]);
const SECTIONS = new Set(["picture", "video", "audio", "vfx", "edit"]);
const FIELDS = ["id", "kind", "name", "section", "category", "what", "how", "takes", "gives", "goodFor", "limits", "use", "models", "cost", "credits", "before", "after", "tutorial", "open", "keywords", "curated"];

/** The tools on the shelf, read from the page's code: TOOLS, the workspaces' own lists and every registerTool({ id: "..." }). Mini apps (app-*) are workflows. */
function registry() {
  const ids = new Set<string>();
  // a list's entries, by their id (or, for the Edit tools, their key: their id is ed-<key>)
  const block = (file: string, name: string, field = "id", prefix = "") => {
    const src = readFileSync(join(root, "web/js", file), "utf8");
    const from = src.indexOf(`export const ${name} = [`);
    assert.ok(from >= 0, `${file} has ${name}`);
    const body = src.slice(from, src.indexOf("\n]", from));
    for (const m of body.matchAll(new RegExp(`^\\s*\\{ ${field}: "([^"]+)"`, "gm"))) ids.add(`${prefix}${m[1]}`);
  };
  block("utensils.js", "TOOLS");
  block("utensils-audio-tools.js", "AUDIO");
  block("utensils-vfx-tools.js", "VFX");
  block("utensils-edit-tools.js", "EDIT_TOOLS", "key", "ed-");
  for (const f of readdirSync(join(root, "web/js")).filter((f) => f.endsWith(".js"))) {
    for (const m of readFileSync(join(root, "web/js", f), "utf8").matchAll(/registerTool\(\{ id: "([^"]+)"/g)) ids.add(m[1]);
  }
  return ids;
}

test("the files load whole: every entry has every field, of the right shape, and no id twice", () => {
  assert.ok(tools.length >= 40, `${tools.length} tools`);
  assert.equal(workflows.length, catalogue.length);
  assert.equal(byId.size, all.length, "no id twice");
  for (const e of all) {
    for (const f of FIELDS) assert.ok(f in e, `${e.id} has ${f}`);
    assert.ok(e.kind === (e.id.startsWith("wf:") ? "workflow" : "tool"), `${e.id}: its kind`);
    assert.ok(e.kind === "workflow" ? e.section === "library" : SECTIONS.has(e.section) || e.id === "template", `${e.id}: section ${e.section}`);
    for (const k of [...e.takes, ...e.gives]) assert.ok(KINDS.has(k), `${e.id}: ${k}`);
    assert.ok(e.takes.length && e.gives.length, `${e.id} takes and gives something`);
    assert.ok(["free", "gpu", "partner"].includes(e.cost), `${e.id}: cost ${e.cost}`);
    assert.ok(e.credits === null || (typeof e.credits === "number" && e.credits >= 0), `${e.id}: credits`);
    for (const f of ["goodFor", "limits", "use", "models", "before", "after", "keywords", "curated"] as const) assert.ok(Array.isArray(e[f]), `${e.id}: ${f} is a list`);
    assert.ok(e.before.length <= 4 && e.after.length <= 4, `${e.id}: four before and after at most`);
    assert.ok(e.goodFor.length >= 1 && e.use.length >= 1, `${e.id}: what it is good for and how to use it`);
    assert.ok(typeof e.open?.workspace === "string" && (e.open.tool || e.open.workflow), `${e.id}: where it opens`);
  }
  assert.ok(tools.every((t) => t.curated.length >= 10), "every tool is written by hand");
});

test("every tool on the shelf has an entry, and every tool entry is a tool on the shelf", () => {
  const shelf = registry();
  const known = new Set(tools.map((t) => t.id));
  assert.deepEqual([...shelf].filter((id) => !known.has(id)), [], "tools with no entry");
  assert.deepEqual([...known].filter((id) => !shelf.has(id)), [], "entries with no tool");
  for (const t of tools) assert.equal(t.open.tool, t.id);
});

test("every workflow of the catalogue has an entry that opens it, and the other way round", () => {
  const names = new Set(catalogue.map((t) => t.name));
  for (const t of catalogue) {
    const e = byId.get(`wf:${t.name}`);
    assert.ok(e, `wf:${t.name} has an entry`);
    assert.equal(e!.open.workflow, t.name);
    assert.equal(e!.tutorial ?? null, t.tutorialUrl ?? null);
  }
  for (const e of workflows) assert.ok(names.has(e.open.workflow!), `${e.id} is in the catalogue`);
});

test("every id an entry points at (before, after) exists, and never itself", () => {
  for (const e of all) {
    for (const id of [...e.before, ...e.after]) assert.ok(byId.has(id), `${e.id} points at ${id}`);
    assert.ok(!e.before.includes(e.id) && !e.after.includes(e.id), `${e.id} points at itself`);
  }
});

test("the most used workflows, the mini apps and every workflow with a tutorial are written by hand", () => {
  const hand = (name: string) => ["what", "how", "goodFor", "limits"].every((f) => byId.get(`wf:${name}`)?.curated.includes(f));
  const top = [...catalogue].sort((a, b) => (b.usage ?? 0) - (a.usage ?? 0)).slice(0, 120);
  assert.deepEqual(top.filter((t) => !hand(t.name)).map((t) => t.name), [], "the 120 most used");
  assert.deepEqual([...CURATED_APPS, ...OFFICIAL_APPS].filter((a) => !hand(a.name)).map((a) => a.name), [], "the mini apps");
  assert.deepEqual(catalogue.filter((t) => t.tutorialUrl && !hand(t.name)).map((t) => t.name), [], "the ones with a tutorial");
  // a partner workflow says so, and an open one does not claim to be one
  for (const e of workflows.filter((x) => x.curated.length)) assert.equal(e.cost === "partner", /partner/i.test(`${e.how} ${e.limits.join(" ")}`), `${e.id}: ${e.cost}`);
});

test("their words read as sentences", () => {
  for (const e of all) {
    for (const f of ["what", "how"] as const) {
      const s = e[f];
      assert.ok(s.length >= 20 && /^([A-Z0-9"']|xAI\b)/.test(s) && /[.!?)"]$/.test(s), `${e.id}.${f}: ${s}`);
      assert.ok(!/\bundefined\b|\bnull\b|\bNaN\b|\s{2}|\(\s*\)|\b[Aa] LoRAs\b|\band and\b/.test(s), `${e.id}.${f}: ${s}`);
    }
    for (const g of e.goodFor) assert.ok(g.trim().length >= 3, `${e.id}: good for "${g}"`);
  }
});

test("the search puts the right tools and workflows first for real jobs", () => {
  const top = (q: string, n = 3) => searchKnowledge(q, { k: n }).map((h) => h.entry);
  const has = (q: string, id: string) => assert.ok(top(q).some((e) => e.id === id), `${q}: ${top(q).map((e) => e.id).join(", ")}`);
  const some = (q: string, ok: (e: Entry) => boolean, what: string) => assert.ok(top(q).some(ok), `${q} should give ${what}: ${top(q).map((e) => e.id).join(", ")}`);
  has("remove the background of my product photo", "cutout");
  has("make my photo talk", "lipsync");
  has("rain sound", "sfx");
  has("upscale a video", "upscale-video");
  some("turn a picture into a 3d model", (e) => e.gives.includes("3d") && e.takes.includes("image"), "a 3D workflow from a picture");
  has("trim the first seconds", "ed-trim");
  some("make a song about my brand", (e) => e.gives.includes("audio"), "music");
  has("a voice over for my ad", "au-voice");
  has("make my clip vertical for tiktok", "ed-reframe");
  has("remove a person from my video", "vfx-remove");
  has("add subtitles to my video", "ed-captions");
  has("slow motion", "vfx-slowmo");
  has("sharpen my old blurry photo", "upscale");
  has("extend my clip by a few seconds", "extend");
  some("put my character in a dance video", (e) => e.takes.includes("video") && e.takes.includes("image") && e.gives.includes("video"), "a character replacement workflow");
  some("animate my product photo", (e) => e.takes.includes("image") && e.gives.includes("video"), "an image-to-video");
  // the filters, and a question with no words in it
  assert.ok(searchKnowledge("upscale", { k: 20, kinds: ["workflow"] }).every((h) => h.entry.kind === "workflow"));
  assert.ok(searchKnowledge("trim", { k: 20, sections: ["edit"] }).every((h) => h.entry.section === "edit"));
  assert.equal(searchKnowledge("", { k: 5 })[0].entry.kind, "tool");
  assert.equal(searchKnowledge("the of my", { k: 5 }).length, 5, "only small words: the entries in order");
  assert.deepEqual(words("Photos of my Stories, colour"), ["photo", "story", "color"]);
});

test("the knowledge is read once and again when a file changes; an entry is found by its id", () => {
  assert.equal(knowledgeById("cutout")?.name, tools.find((t) => t.id === "cutout")!.name);
  assert.equal(knowledgeById("wf:video_ltx2_3_i2v")?.kind, "workflow");
  assert.equal(knowledgeById("nope"), null);
  assert.equal(loadKnowledge(), loadKnowledge(), "kept, not read again");
  const dir = mkdtempSync(join(tmpdir(), "utensils-knowledge-"));
  try {
    mkdirSync(join(dir, "knowledge/utensils"), { recursive: true });
    const one = { ...tools[0], id: "only", name: "Only one" };
    writeFileSync(join(dir, "knowledge/utensils/tools.json"), JSON.stringify([one]));
    assert.equal(loadKnowledge(dir).length, 1, "a missing workflows.json is no workflows");
    writeFileSync(join(dir, "knowledge/utensils/tools.json"), JSON.stringify([one, { ...one, id: "two", name: "Second tool" }]));
    assert.equal(loadKnowledge(dir).length, 2, "read again once changed");
    assert.equal(searchKnowledge("second", { root: dir })[0].entry.id, "two");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    loadKnowledge();
  }
});

// ---------------------------------------------------------------- Truffle's guide

const SUMMARY = { workspace: "home", tools: [], others: [{ id: "cutout", workspace: "picture", name: "Remove background", takes: ["image"] }], library: { images: [{ id: "img1", name: "jar" }] } };
const say = (actions: unknown[], reply = "Here is the way.") => JSON.stringify({ reply, actions });

test("her guide op is in her brief and her tool, and she is told the candidates for the job", () => {
  assert.ok(UTENSILS_OPS.includes("guide") && UTENSILS_BRIEF.includes("guide {title, steps}") && UTENSILS_BRIEF.includes("CANDIDATES FOR THIS JOB"));
  const op = UTENSILS_TOOL.input_schema.properties.actions.items.properties as any;
  assert.ok(op.op.enum.includes("guide") && op.steps.items.required.includes("id") && op.title);
  const turns = [{ role: "user", text: "remove the background of my product photo and put it on a beach" }];
  const candidates = utensilsCandidates(turns);
  // the twelve best matches, then the tools that join pieces (a sound under a clip, sounds mixed, words on a clip) when the search missed them
  assert.ok(candidates.length >= 12 && candidates.length <= 15 && candidates.slice(0, 12).some((e) => e.id === "cutout"));
  assert.ok(["ed-audio", "au-mix", "ed-captions"].every((id) => candidates.some((e) => e.id === id)), "the joiners are offered");
  const text = utensilsPrompt(SUMMARY, turns, candidates);
  assert.ok(text.includes("CANDIDATES FOR THIS JOB"));
  const line = text.slice(text.indexOf("CANDIDATES")).split("\n").find((l) => l.startsWith("- cutout · "));
  assert.ok(line && line.includes("picture · image->image · GPU ≈1 cr · Cuts the subject out"), line);
  assert.ok(text.indexOf("CANDIDATES") < text.indexOf("THE CONVERSATION"));
  // a short answer is searched with what came before it
  assert.ok(utensilsCandidates([...turns, { role: "assistant", text: "Which one?" }, { role: "user", text: "yes please" }]).some((e) => e.id === "cutout"));
  assert.deepEqual(utensilsCandidates([]), []);
  // the guide on show is told to her
  assert.ok(utensilsPrompt({ ...SUMMARY, guide: { title: "Jar on a beach", steps: ["cutout", "edit"], current: 0 } }, turns, candidates).includes("THE GUIDE ON SHOW: Jar on a beach: cutout → edit. The person is on step 1."));
});

test("her guide names only what the knowledge base knows: an invented step is dropped, a mini app is its Library workflow, a guide with none left is dropped, and a guide comes alone", () => {
  const candidates = searchKnowledge("remove the background of my product photo", { k: 12 }).map((h) => h.entry);
  const step = (id: string) => ({ id, why: "Cut the jar out", how: "Give it the photo" });
  const read = (actions: unknown[]) => readUtensilsAnswer(say(actions), SUMMARY, candidates).actions;
  // an invented id is dropped; a real tool outside the candidates is kept (she also sees the open workspace's tools and the apps)
  assert.deepEqual(read([{ op: "guide", title: "Jar cut out", steps: [step("cutout"), step("wf:made_up"), step("upscale-video")] }]), [
    { op: "guide", title: "Jar cut out", steps: [{ id: "cutout", why: "Cut the jar out", how: "Give it the photo" }, { id: "upscale-video", why: "Cut the jar out", how: "Give it the photo" }] },
  ]);
  // a mini app named by its tool id is its Library workflow
  const app = read([{ op: "guide", title: "Real", steps: [step("app-make-real")] }]);
  assert.equal(app[0]?.steps[0]?.id, "wf:templates_rob_image_to_real.app");
  assert.deepEqual(read([{ op: "guide", title: "Nothing", steps: [step("wf:made_up")] }]), [], "no step left: no guide");
  assert.deepEqual(readUtensilsAnswer(say([{ op: "guide", steps: [step("wf:made_up")] }]), SUMMARY).actions, [], "nothing known: no guide");
  // five steps at most, a title when none is given, and nothing else with it (no tool opened, no run)
  const many = read([{ op: "pick_tool", tool: "cutout" }, { op: "guide", steps: Array.from({ length: 8 }, () => step("cutout")) }, { op: "run_tool" }]);
  assert.equal(many.length, 1);
  assert.equal(many[0].op, "guide");
  assert.equal(many[0].steps.length, 5);
  assert.equal(many[0].title, "Your recipe");
  // the other actions are read as before when there is no guide
  assert.deepEqual(read([{ op: "pick_tool", tool: "cutout" }, { op: "set_input", image: "img1" }]), [{ op: "pick_tool", tool: "cutout" }, { op: "set_input", image: "img1" }]);
});

test("the page's helper: the id a tool or template is known by, and an entry fetched once", async () => {
  assert.equal(knowledgeIdOf({ id: "cutout", name: "Remove background" }), "cutout");
  assert.equal(knowledgeIdOf({ id: "app-make-real", app: true, appName: "templates_rob_image_to_real.app" }), "wf:templates_rob_image_to_real.app");
  assert.equal(knowledgeIdOf({ name: "video_ltx2_3_i2v", title: "LTX-2.3" }), "wf:video_ltx2_3_i2v");
  assert.equal(knowledgeIdOf("app-make-real"), null);
  const real = globalThis.fetch;
  let asked = 0;
  globalThis.fetch = (async (url: string) => {
    asked++;
    const id = decodeURIComponent(String(url).split("/").pop()!);
    const e = byId.get(id);
    return { ok: !!e, json: async () => e } as Response;
  }) as typeof fetch;
  try {
    assert.equal((await knowledgeOf("wf:video_ltx2_3_i2v"))?.kind, "workflow");
    await knowledgeOf("wf:video_ltx2_3_i2v");
    assert.equal(asked, 1, "fetched once");
    assert.equal(await knowledgeOf("nope"), null);
  } finally {
    globalThis.fetch = real;
  }
});
