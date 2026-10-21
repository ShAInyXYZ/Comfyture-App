// Jam's track: a song's sections found from how loud it is along its length, and named.

import { test } from "node:test";
import assert from "node:assert/strict";
import { detectSections, lyricTags, kindOf, sectionAt, HOP } from "../web/js/jam-sections.js";

// a made-up song: an intro, a verse, a chorus, a verse, a chorus, an outro (seconds from, to, loudness)
const SHAPE: [number, number, number][] = [[0, 12, 0.2], [12, 40, 0.5], [40, 66, 0.9], [66, 92, 0.5], [92, 120, 0.95], [120, 136, 0.25]];
const song = (jitter = 0.03) => {
  const total = 136;
  const energy = Array.from({ length: Math.round(total / HOP) }, (_, i) => {
    const t = i * HOP;
    const level = SHAPE.find(([a, b]) => t >= a && t < b)?.[2] ?? 0.2;
    return level * (1 + jitter * Math.sin(i * 7.3));
  });
  return { energy, total };
};

test("the sections of a song are found where its loudness changes, and named by how loud and where", () => {
  const { energy, total } = song();
  const { sections, source } = detectSections(energy, total);
  assert.equal(source, "energy");
  assert.deepEqual(sections.map((s: any) => s.name), ["Intro", "Verse 1", "Chorus", "Verse 2", "Chorus", "Outro"]);
  for (const [k, [from]] of SHAPE.entries()) assert.ok(Math.abs(sections[k].from - from) <= 2, `section ${k} starts near ${from} (${sections[k].from})`);
  // they cover the song, end to end
  assert.equal(sections[0].from, 0);
  assert.equal(sections.at(-1).to, total);
  sections.slice(1).forEach((s: any, k: number) => assert.equal(s.from, sections[k].to));
});

test("a bar is the grain of a boundary when the tempo is known", () => {
  const { energy, total } = song();
  const bpm = 120; // a bar is 2 s
  for (const s of detectSections(energy, total, { bpm }).sections.slice(1)) assert.ok(Math.abs(s.from / 2 - Math.round(s.from / 2)) < 1e-6, `${s.from} is on a bar`);
});

test("the lyrics' own tags name the sections when there are as many as found", () => {
  const { energy, total } = song();
  const names = ["Intro", "Verse 1", "Chorus", "Verse 2", "Final Chorus", "Outro"];
  const got = detectSections(energy, total, { names });
  assert.equal(got.source, "lyrics");
  assert.deepEqual(got.sections.map((s: any) => s.name), names);
  assert.equal(got.sections[4].kind, "chorus");
  // a different number of tags: named by the energy instead
  assert.equal(detectSections(energy, total, { names: ["Verse", "Chorus"] }).source, "energy");
});

test("a flat song is one section; a short one is not cut", () => {
  assert.equal(detectSections(new Array(200).fill(0.5), 100).sections.length, 1);
  assert.equal(detectSections([0.1, 0.9], 1).sections.length, 1);
});

test("tags are read from lyrics, and a time finds its section", () => {
  assert.deepEqual(lyricTags("[Verse 1]\nSnow falls\n[Chorus]\nLa la\n  [Bridge]  \nx\n[ ]\n[Outro]"), ["Verse 1", "Chorus", "Bridge", "Outro"]);
  assert.equal(kindOf("Final Chorus"), "chorus");
  assert.equal(kindOf("Pre-Chorus"), "verse");
  assert.equal(kindOf("Rap 2"), "verse");
  const { sections } = detectSections(...(Object.values(song()) as [number[], number]));
  assert.equal(sectionAt(sections, 50).name, "Chorus");
  assert.equal(sectionAt(sections, 999).name, "Outro");
});
