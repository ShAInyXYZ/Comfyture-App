// Render a scripted native-audio recipe; durable per-take receipts prevent duplicate paid submissions.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTemplates, realCloud, isDone, isOver, jobOutputs } from '../server/comfy-templates.ts';
import { CREW } from '../web/js/mixer-trends.js';
import { castVoiceDirection, nativeRecipeRequest } from '../web/js/mixer-voices.js';
const [recipePath, out] = process.argv.slice(2);
if (!recipePath || !out) throw Error('Usage: node --env-file-if-exists=.env scripts/mixer-scripted-preview.ts recipe.json output-directory');
const recipe = JSON.parse(await readFile(recipePath, 'utf8'));
const cloud = realCloud(process.env.COMFY_API_KEY!);
const service = createTemplates({ root: process.cwd(), data: join(process.cwd(), 'data'), cloud, warm: false });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
await mkdir(out, { recursive: true });
const cast = recipe.roles.map((r: any) => ({ role: r.role, who: { crew: r.crew } }));
const words = Object.fromEntries(recipe.roles.map((r: any) => { const c = CREW.find(c => c.id === r.crew)!; return [r.role, `${c.name}, ${c.look}`]; }));
const first = await fetch('http://127.0.0.1:5177/api/photos?name=We%20Listen%20LTX%20reference', {
  method: 'POST', headers: { 'Content-Type': 'image/webp' }, body: await readFile(`web/brand/mixer/trends/${recipe.id}/${recipe.look}`),
});
if (!first.ok) throw Error(await first.text());
const photo = await first.json();
for (const [i, shot] of recipe.shots.entries()) {
  const receipt = join(out, `take-${i + 1}.json`);
  let meta = await readFile(receipt, 'utf8').then(JSON.parse, () => null);
  if (meta?.status === 'done') { console.log('Already done', i + 1); continue; }
  if (meta && !meta.cloudPromptId) throw Error(`Take ${i + 1} already attempted; inspect its receipt before submitting again.`);
  if (!meta) {
    const prompt = shot.prompt.replace(/\{(\w+)\}/g, (all: string, k: string) => words[k] ?? all) + '\n' + castVoiceDirection(cast);
    const request = nativeRecipeRequest(recipe, shot, photo.file, prompt, shot.seed);
    meta = { status: 'submitting', model: recipe.model, template: recipe.template, request, startedAt: new Date().toISOString(), actualCostCredits: null };
    await writeFile(receipt, JSON.stringify(meta, null, 2));
    try {
      const job = await service.run(recipe.template, request);
      meta.cloudPromptId = job.promptId; meta.status = 'running';
      await writeFile(receipt, JSON.stringify(meta, null, 2));
      console.log('Submitted take', i + 1, job.promptId);
      while (job.status === 'running') await sleep(3000);
      if (job.status !== 'done') throw Error(job.error ?? job.status);
      const video = job.outputs.find(o => o.kind === 'video');
      if (!video) throw Error('No video output');
      await copyFile(join('data/videos', video.file), join(out, `take-${i + 1}.mp4`));
    } catch (e: any) { meta.error = e.message; await writeFile(receipt, JSON.stringify(meta, null, 2)); throw e; }
  } else {
    console.log('Recovering existing take', i + 1, meta.cloudPromptId);
    let detail;
    do { detail = await cloud.rest('/jobs/' + meta.cloudPromptId); if (!isDone(detail.status) && !isOver(detail.status)) await sleep(3000); } while (!isDone(detail.status) && !isOver(detail.status));
    if (!isDone(detail.status)) throw Error(`Existing take ended ${detail.status}; no duplicate sent.`);
    const video = jobOutputs(detail).find(o => o.kind === 'video');
    if (!video) throw Error('No video output');
    await writeFile(join(out, `take-${i + 1}.mp4`), (await cloud.view(video)).bytes);
  }
  const detail = await cloud.rest('/jobs/' + meta.cloudPromptId);
  meta.status = 'done'; meta.finishedAt = new Date().toISOString();
  meta.elapsedSeconds = (Date.now() - Date.parse(meta.startedAt)) / 1000;
  meta.executionSeconds = detail.execution_end_time && detail.execution_start_time ? (detail.execution_end_time - detail.execution_start_time) / 1000 : null;
  meta.queueSeconds = detail.execution_start_time && detail.create_time ? (detail.execution_start_time - detail.create_time) / 1000 : null;
  await writeFile(receipt, JSON.stringify(meta, null, 2));
  console.log('Completed take', i + 1, meta.elapsedSeconds, 'seconds');
}
console.log('Review both takes before replacing the published preview.');
