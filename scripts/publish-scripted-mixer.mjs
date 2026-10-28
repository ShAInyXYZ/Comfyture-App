// Package reviewed takes only. Does not submit generation jobs.
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AUTUMN_TRENDS } from '../web/js/mixer-trends-autumn.js';
import { CHARACTER_VOICES } from '../web/js/mixer-voices.js';
import { validateRecipe } from '../web/js/mixer-trend-state.js';
const exec = promisify(execFile);
const [source, out] = process.argv.slice(2);
if (!source || !out) throw Error('Usage: node scripts/publish-scripted-mixer.mjs recipe.json reviewed-output-directory');
const recipe = JSON.parse(await readFile(source, 'utf8'));
validateRecipe(recipe, {});
const receipts = await Promise.all(recipe.shots.map((_, i) => readFile(`${out}/take-${i + 1}.json`, 'utf8').then(JSON.parse)));
if (receipts.some(r => r.status !== 'done')) throw Error('Every take must be complete.');
const args = [], filters = [], joins = [];
for (const [i, shot] of recipe.shots.entries()) {
  const file = `${out}/take-${i + 1}.mp4`, duration = shot.to - shot.from;
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', file]);
  const probe = JSON.parse(stdout);
  if (!probe.streams.some(s => s.codec_type === 'audio') || +probe.format.duration < duration - .2) throw Error(`Take ${i + 1}: audio missing or truncated`);
  args.push('-i', file);
  filters.push(`[${i}:v]trim=duration=${duration},setpts=PTS-STARTPTS[v${i}]`, `[${i}:a]apad,atrim=duration=${duration},asetpts=PTS-STARTPTS[a${i}]`);
  joins.push(`[v${i}][a${i}]`);
}
filters.push(`${joins.join('')}concat=n=${recipe.shots.length}:v=1:a=1[v][a]`);
const dir = `web/brand/mixer/trends/${recipe.id}`;
await exec('ffmpeg', ['-v', 'error', '-y', ...args, '-filter_complex', filters.join(';'), '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '21', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', `${out}/preview.mp4`]);
const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', `${out}/preview.mp4`]);
recipe.voiceProfiles = Object.fromEntries(recipe.roles.map(r => [r.crew, CHARACTER_VOICES[r.crew]]));
recipe.render = { model: recipe.model, imageModel: 'Codex imagegen (existing scene reference)', template: recipe.template,
  startedAt: receipts[0].startedAt, finishedAt: receipts.at(-1).finishedAt,
  executionSeconds: receipts.every(r => r.executionSeconds != null) ? receipts.reduce((n, r) => n + r.executionSeconds, 0) : null,
  elapsedSeconds: (Date.parse(receipts.at(-1).finishedAt) - Date.parse(receipts[0].startedAt)) / 1000,
  actualCostCredits: null, imageCostCredits: null, billing: 'partner',
  costNote: 'Paid LTX-2.5 Pro partner generation. Actual per-job credits were not supplied; no new image generation was charged for this revision.',
  voiceMethod: 'Text-directed native generated voices, not cloned audio or post-production conversion.',
  takes: receipts.map((r, i) => ({ seed: recipe.shots[i].seed, cloudPromptId: r.cloudPromptId, executionSeconds: r.executionSeconds, elapsedSeconds: r.elapsedSeconds, settings: r.request.overrides, prompt: r.request.inputs.prompt })), media: JSON.parse(stdout) };
await copyFile(`${out}/preview.mp4`, `${dir}/preview.mp4`);
await exec('ffmpeg', ['-v', 'error', '-y', '-ss', '9', '-i', `${out}/preview.mp4`, '-frames:v', '1', '-vf', 'scale=768:1344:force_original_aspect_ratio=increase,crop=768:1344', '-quality', '90', `${dir}/poster.webp`]);
await copyFile(`${dir}/poster.webp`, `web/brand/mixer/trends/${recipe.id}.webp`);
await writeFile(`${dir}/recipe.json`, JSON.stringify(recipe, null, 2) + '\n');
const entries = AUTUMN_TRENDS.map(t => t.id !== recipe.id ? t : { ...t, revision: recipe.revision, model: recipe.model, billing: recipe.billing, seconds: recipe.seconds, beats: recipe.beats, render: recipe.render });
await writeFile('web/js/mixer-trends-autumn.js', '// Generated from reviewed previews; preserve per-scene productionRecipe overrides.\nexport const AUTUMN_TRENDS = ' + JSON.stringify(entries, null, 2) + ';\n');
console.log('Published', recipe.id, recipe.model, recipe.seconds, 'seconds');
