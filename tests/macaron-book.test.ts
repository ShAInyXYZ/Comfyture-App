// The brand book: its nine pages and how whole each is, the colour maths the colour page prints, the PDF writer (a file the
// readers open: header, objects, a cross-reference table that points at them, one page per picture), and Brioche's place in
// the book (the tool she answers through, her brief, what she is told, and her answer read and kept to what is hers). No model
// is called and nothing is drawn: the pages' drawing is the browser's, checked by looking.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PAGES, PAGE_IDS, TEXT_PAGES, pageStatus, cmykOf, rgbOf, gradeOf, themeOf, bookSig, pageSig, bookText, FIXES } from "../web/js/macaron-book-model.js";
import { kitOf } from "../web/js/design.js";
import { buildPdf, jpegSize, base64Of } from "../web/js/macaron-pdf.js";
import * as macaron from "../server/macaron.ts";
import * as bookServer from "../server/macaron-book.ts";

const seed = JSON.parse(readFileSync(join(import.meta.dirname, "..", "brands", "comfyture.brand.json"), "utf8")).body;
const TINY = Uint8Array.from(Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAA5ACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDzKiiivrSgooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/2Q==", "base64"));

// ---------------------------------------------------------------- the pages

test("the book has nine pages in the order of a brand's work, each with a fix and a label", () => {
  assert.deepEqual(PAGE_IDS, ["cover", "story", "logo", "colour", "type", "voice", "imagery", "rules", "examples"]);
  assert.deepEqual(TEXT_PAGES, ["story", "imagery"], "only the story and the imagery take words of their own");
  assert.deepEqual(Object.keys(FIXES), PAGE_IDS);
  assert.deepEqual([...bookServer.PAGES], PAGE_IDS, "the server lists the same pages");
  assert.deepEqual([...bookServer.TEXT_PAGES], TEXT_PAGES);
  for (const p of PAGES) assert.ok(p.label.length > 0 && p.name.length > 0);
});

test("the example brand's pages are whole but the rules, which have two nevers; a blank brand is thin everywhere and says why", () => {
  const status = pageStatus(seed);
  assert.equal(status.length, 9);
  assert.deepEqual(status.map((p) => p.n), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const thin = status.filter((p) => !p.ok);
  assert.deepEqual(thin.map((p) => p.id), ["rules"]);
  assert.match(thin[0].reason, /2 never/);
  const blank = pageStatus({});
  assert.ok(blank.filter((p) => !p.ok).length >= 7, "an empty brand has almost nothing to show");
  for (const p of blank.filter((x) => !x.ok)) assert.ok(p.reason.length > 0 && p.reason.length <= 40, `${p.id}: a short reason`);
  assert.equal(blank.find((p) => p.id === "type")!.ok, true, "the type always has its default roles");
});

test("a page is thin for a reason the kit can fix, and whole once it is fixed", () => {
  const body = structuredClone(seed);
  body.kit.logos = body.kit.logos.filter((l: any) => l.kind !== "icon");
  assert.match(pageStatus(body).find((p) => p.id === "logo")!.reason, /app icon/);
  body.kit.tagline = "";
  assert.match(pageStatus(body).find((p) => p.id === "cover")!.reason, /tagline/i);
  body.brief.pitch = "";
  assert.match(pageStatus(body).find((p) => p.id === "story")!.reason, /idea/);
  body.designs = body.designs.map((d: any) => ({ ...d, status: "draft" }));
  assert.match(pageStatus(body).find((p) => p.id === "examples")!.reason, /approved/);
  body.kit.tagline = "One line.";
  assert.equal(pageStatus(body).find((p) => p.id === "cover")!.ok, true);
});

test("the book's words are read from body.book.pages, and the pages are redrawn only when what they are built from changes", () => {
  const body = structuredClone(seed);
  assert.equal(bookText(body, "story"), "");
  const a = bookSig(body);
  assert.equal(bookSig(structuredClone(body)), a, "the same body, the same fingerprint");
  body.book = { pages: { story: "  It started with a jar.  " } };
  assert.equal(bookText(body, "story"), "It started with a jar.");
  assert.notEqual(bookSig(body), a);
});

test("a page is drawn again only when what it is built from changes: a word in the story redraws the story and nothing else", () => {
  const body = structuredClone(seed);
  const before = Object.fromEntries(PAGE_IDS.map((id) => [id, pageSig(body, id)]));
  body.book = { pages: { story: "A new line." } };
  const after = Object.fromEntries(PAGE_IDS.map((id) => [id, pageSig(body, id)]));
  assert.deepEqual(PAGE_IDS.filter((id) => before[id] !== after[id]), ["story"]);
  body.kit.palette[0].hex = "#FF0000";
  assert.deepEqual(PAGE_IDS.filter((id) => pageSig(body, id) !== after[id]), PAGE_IDS, "a colour of the palette is in every page");
  const posts = structuredClone(seed);
  posts.designs[0].status = "draft";
  assert.deepEqual(PAGE_IDS.filter((id) => pageSig(posts, id) !== before[id]), ["examples"]);
});

test("the colour page prints what a print shop reads: RGB, CMYK and how the contrast grades", () => {
  assert.deepEqual(rgbOf("#F2FF59"), [242, 255, 89]);
  assert.deepEqual(cmykOf("#000000"), [0, 0, 0, 100]);
  assert.deepEqual(cmykOf("#FFFFFF"), [0, 0, 0, 0]);
  assert.deepEqual(cmykOf("#F2FF59"), [5, 0, 65, 0]);
  assert.equal(gradeOf(15.6), "AAA");
  assert.equal(gradeOf(4.6), "AA");
  assert.equal(gradeOf(3.1), "AA large");
  assert.equal(gradeOf(1.4), "fails");
});

test("the pages are set in the palette whatever it holds: a warm white paper, the ink, the deep ground, the yellow signal", () => {
  const t = themeOf(kitOf(seed));
  assert.equal(t.paper.toLowerCase(), "#f0efed", "the paper is the warm white, not the yellow that is lighter");
  assert.equal(t.ink.toLowerCase(), "#211927");
  assert.equal(t.deep.toLowerCase(), "#49378b");
  assert.equal(t.signal.toLowerCase(), "#f2ff59");
  const bare = themeOf(kitOf({}));
  assert.ok(bare.paper && bare.ink && bare.deep, "a brand without a palette still has colours to set its pages in");
});

// ---------------------------------------------------------------- the PDF

test("the PDF writer makes a file with a page for each picture, a cross-reference table that points at the objects and the pictures untouched", () => {
  assert.deepEqual(jpegSize(TINY), { width: 40, height: 57 });
  const pdf = buildPdf([{ jpeg: TINY }, { jpeg: TINY }, { jpeg: TINY }], { title: "Comfyture · Brand guidelines é", author: "Comfyture" });
  const text = Buffer.from(pdf).toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4\n"));
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  assert.equal((text.match(/\/Type \/Page /g) ?? []).length, 3, "three pages");
  assert.match(text, /\/Type \/Pages \/Count 3/);
  // the page is as wide as A4 turned on its side and as tall as the picture asks
  const box = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(text)!;
  assert.equal(Number(box[1]), 841.89);
  assert.ok(Math.abs(Number(box[2]) / Number(box[1]) - 57 / 40) < 0.001, "the page keeps the picture's shape");
  // the table: every entry points at its own "n 0 obj"
  const start = Number(/startxref\n(\d+)\n%%EOF/.exec(text)![1]);
  assert.ok(text.slice(start).startsWith("xref\n0 13\n0000000000 65535 f \n"), "13 objects: the free one, three of the document, three for each page");
  const entries = text.slice(start).split("\n").slice(3, 15).map((l) => Number(l.slice(0, 10)));
  entries.forEach((offset, i) => assert.ok(text.slice(offset).startsWith(`${i + 1} 0 obj`), `object ${i + 1} is where the table says`));
  assert.match(text, /\/Size 13 \/Root 1 0 R \/Info 3 0 R/);
  // each picture goes in whole: its bytes are inside, and its length is what the object says
  const needle = Buffer.from(TINY);
  let found = 0;
  for (let at = Buffer.from(pdf).indexOf(needle); at >= 0; at = Buffer.from(pdf).indexOf(needle, at + 1)) found += 1;
  assert.equal(found, 3);
  assert.equal((text.match(new RegExp(`/Length ${TINY.length} >>`, "g")) ?? []).length, 3);
  assert.throws(() => buildPdf([]), /at least one page/);
  assert.throws(() => jpegSize(Uint8Array.of(1, 2, 3, 4)), /Not a JPEG/);
  assert.equal(base64Of(TINY), "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAA5ACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDzKiiivrSgooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/2Q==");
});

test("a PDF reader opens the file (pdfinfo, when the machine has it)", (t) => {
  const probe = spawnSync("pdfinfo", ["-v"]);
  if (probe.error) return t.skip("pdfinfo is not installed");
  const dir = mkdtempSync(join(tmpdir(), "book-"));
  try {
    const file = join(dir, "book.pdf");
    writeFileSync(file, buildPdf([{ jpeg: TINY }, { jpeg: TINY }], { title: "Test", author: "Test" }));
    const out = spawnSync("pdfinfo", [file], { encoding: "utf8" });
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /Pages:\s+2/);
    assert.match(out.stdout, /Title:\s+Test/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- Brioche in the book

test("Brioche answers in the book through a tool with its three ops and the fields they carry, and nothing of the posts", () => {
  assert.deepEqual(macaron.SPACES, ["idea", "kit", "studio", "create", "book"]);
  const tool = macaron.macaronTool("book");
  const item = (tool.input_schema.properties.actions as any).items;
  assert.deepEqual(item.properties.op.enum.sort(), ["open_fix", "open_space", "set_tagline", "write_page"]);
  assert.deepEqual(Object.keys(item.properties).sort(), ["op", "page", "space", "text"]);
  assert.deepEqual(item.properties.page.enum, PAGE_IDS);
  assert.ok(!JSON.stringify(tool).includes("edit_text"), "no layer ops here");
  const brief = macaron.macaronBrief("book");
  assert.match(brief, /five workspaces/);
  assert.match(brief, /BUILT FROM THE KIT/);
  assert.match(brief, /write_page/);
  assert.ok(!brief.includes("edit_text") && !brief.includes("adapt_format"), "her brief names no action of the posts");
  assert.ok(brief.length < 4200, "short enough to be read every time");
});

test("what she is told is the book: each page whole or thin, the words written, the audit, the brief; no layers, no palette ids of the posts", () => {
  const summary = {
    name: "Comfyture",
    kit: { about: "A jar of shots.", tagline: "Shots worth keeping.", palette: [{ id: "ink", hex: "#211927", name: "Ink", role: "Ground" }], logos: [{ id: "wordmark-yellow", kind: "wordmark", tone: "yellow", ground: "ink" }], voice: { summary: "Warm.", dos: ["Short."], donts: ["Hype."] } },
    pages: pageStatus(seed).map(({ id, name, ok, reason }) => ({ id, name, ok, reason })),
    written: { story: "It started with a jar.", imagery: "" },
    audit: [{ design: "Launch · Direct a shot", text: "The logo is outside the safe zone", level: "warn" }],
    brief: { pitch: "A warm home for making films.", goals: ["Feel welcoming"], message: "Direct a shot.", tone: "Warm" },
    direction: { name: "Warm and bold", note: "Confident." },
    voiceWords: ["warm", "plain"],
    type: { display: "Manrope 800" },
    designs: [{ id: "d1", name: "layers should never show" }],
  };
  const prompt = macaron.macaronPrompt({ ...summary, space: "book" }, [{ role: "user", text: "What is missing?" }]);
  assert.match(prompt, /WORKSPACE OPEN: Brand book/);
  assert.match(prompt, /rules THIN, Only 7 keep and 2 never/);
  assert.match(prompt, /cover whole/);
  assert.match(prompt, /It started with a jar\./);
  assert.match(prompt, /The logo is outside the safe zone/);
  assert.match(prompt, /A warm home for making films\./);
  assert.match(prompt, /Warm and bold/);
  assert.match(prompt, /User: What is missing\?/);
  assert.ok(!/Layers, bottom to top|THE DESIGN OPEN|layers should never show|MOTION PIECES/.test(prompt), "nothing of the posts' layers");
  assert.ok(prompt.length < 3500, `a tight summary (${prompt.length} characters)`);
});

test("her answer is read and kept to what is hers: the story and imagery words, the tagline, a page to fix; the rest is dropped", () => {
  const read = (actions: unknown[]) => macaron.readMacaronAnswer(JSON.stringify({ reply: "Done.", actions }), "book").actions;
  const kept = read([
    { op: "write_page", page: "story", text: "  A jar that keeps  a shot\nuntil you are ready.  " },
    { op: "write_page", page: "imagery", text: "Real, warm, lived in." },
    { op: "write_page", page: "logo", text: "never written" },
    { op: "write_page", page: "story", text: "   " },
    { op: "set_tagline", text: "\"Shots worth keeping.\"" },
    { op: "set_tagline", text: "" },
    { op: "open_fix", page: "colour" },
    { op: "open_fix", page: "the moon" },
    { op: "open_space", space: "create" },
    { op: "edit_text", layer: "l1", text: "a post's op" },
    { op: "write_page", page: "story", text: "x".repeat(2000) },
  ]);
  assert.deepEqual(kept.map((a: any) => a.op), ["write_page", "write_page", "set_tagline", "open_fix", "open_space", "write_page"]);
  assert.equal(kept[0].page, "story");
  assert.equal(kept[0].text, "A jar that keeps a shot until you are ready.", "one line, tidy");
  assert.equal(kept[2].text, "Shots worth keeping.", "the quote marks are not part of the line");
  assert.equal(kept[3].page, "colour");
  assert.equal(kept[5].text.length, 900, "words are kept to the length a page can hold");
  // an unparsable answer is read as a plain reply with nothing to do
  const odd = macaron.readMacaronAnswer("I would write the story page.", "book");
  assert.deepEqual(odd.actions, []);
  assert.match(odd.reply, /story page/);
});
