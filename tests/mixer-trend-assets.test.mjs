import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { AUTUMN_TRENDS } from '../web/js/mixer-trends-autumn.js';
import { CREW, TRENDS } from '../web/js/mixer-trends.js';
import { validateRecipe } from '../web/js/mixer-trend-state.js';

test('all eleven cast presets ship usable recipes, matching covers, video and original sound', async () => {
  assert.equal(AUTUMN_TRENDS.length, 11);
  assert.equal(new Set(TRENDS.map(t => t.id)).size, TRENDS.length);
  for (const t of AUTUMN_TRENDS) {
    assert.equal(t.home, 'mixer');
    assert.equal(t.soon, false);
    assert.ok(t.cast.every(r => CREW.some(c => c.id === r.crew)));
    const recipe = JSON.parse(await readFile('web/' + t.recipe, 'utf8'));
    validateRecipe(recipe, {});
    assert.equal(recipe.seconds, t.seconds);
    assert.equal(recipe.sound.native, true);
    assert.equal(recipe.render.actualCostCredits, null);
    assert.ok(recipe.render.executionSeconds > 0);
    assert.ok(recipe.render.media.streams.some(s => s.codec_type === 'audio'));
    for (const path of [t.preview, t.poster, t.recipe.replace('recipe.json', recipe.look), `brand/mixer/trends/${t.id}.webp`]) {
      assert.ok((await stat('web/' + path)).size > 100, `${t.id}: ${path}`);
    }
    const declared = new Set(recipe.roles.map(r => r.role));
    for (const s of recipe.shots) for (const [, role] of s.prompt.matchAll(/\{(\w+)\}/g)) assert.ok(declared.has(role), `${t.id}: undeclared role ${role}`);
  }
});

test('We Listen is an original script with no source footage or borrowed soundtrack', async () => {
  const r = JSON.parse(await readFile('web/brand/mixer/trends/we-listen/recipe.json', 'utf8'));
  assert.equal(r.source.url, null);
  assert.equal(r.template, 'api_ltx2_5_i2v');
  assert.equal(r.model, 'LTX-2.5 Pro');
  assert.equal(r.seconds, 20);
  assert.match(r.shots[0].prompt, /face cream/);
  assert.match(r.shots[1].prompt, /costume shop/);
  assert.ok(r.shots.every(s => /No judgment/.test(s.prompt)));
  assert.match(r.voiceProfiles.earl, /Texas drawl/);
  assert.match(r.voiceProfiles.josie, /mischievous/);
  assert.ok(r.shots.every(s => !s.pose && !s.guide));
  assert.ok(!r.sound.mix && !r.sound.vocals);
});


test('the plant reveal uses non-Pro LTX with native speech and accurate generation metadata', async () => {
  const t = AUTUMN_TRENDS.find(t => t.id === 'my-reaction');
  assert.equal(t.name, 'Tell Me Without Telling Me');
  const r = JSON.parse(await readFile('web/' + t.recipe, 'utf8'));
  assert.equal(r.revision, 5);
  assert.equal(r.seconds, 10);
  assert.equal(r.template, 'video_ltx2_5_flf2v');
  assert.equal(r.customization.kind, 'problem-reveal');
  assert.ok((await stat('web/brand/mixer/trends/my-reaction/' + r.lastLook)).size > 1000);
  assert.equal(r.voiceConversion, undefined);
  assert.equal(t.voiceConversion, null);
  assert.match(r.render.voiceMethod, /native generated/);
  assert.equal(r.render.postProduction, undefined);
  assert.ok(r.render.estimatedCredits > 0);
  assert.match(r.render.estimateNote, /actual provider bill unavailable/);
  assert.equal(r.render.estimatedImageCredits, 6);
  assert.equal(r.render.takes[0].settings.width, 768);
  assert.equal(r.render.takes[0].settings.height, 1344);
});
