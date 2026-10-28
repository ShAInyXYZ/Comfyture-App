// Generate a wide reveal and derive its opening crop; retain accepted job IDs before waiting.
import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { prepareProblemFrames, cleanProblem } from '../web/js/mixer-problem-reveal.js';
const [source, out] = process.argv.slice(2);
if (!source || !out) throw Error('Usage: node scripts/mixer-problem-frames.mjs recipe.json output-directory');
const recipe = JSON.parse(await readFile(source, 'utf8'));
await mkdir(out, { recursive: true });
const receipt = `${out}/frames.json`;
const frames = await readFile(receipt, 'utf8').then(JSON.parse, () => ({}));
const base = 'http://127.0.0.1:5177/';
const call = async (url, init) => {
  const res = await fetch(base + url, init); const body = await res.json();
  if (!res.ok) throw Object.assign(Error(body.error ?? res.statusText), { status: res.status });
  return body;
};
const crew = recipe.roles[0].crew;
const lead = await call(`api/photos?name=${encodeURIComponent(crew + ' identity')}`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: await readFile(`web/brand/mixer/crew/${crew}.png`) });
const pair = await prepareProblemFrames(cleanProblem(recipe.customization.defaultProblem), lead, frames, {
  crop: photo => call('api/mixer/reveal-frame', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: photo.file }) }),
  submit: body => call('api/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  wait: async id => {
    let job;
    do {
      job = await call(`api/image/jobs/${id}`);
      if (job.status === 'running' || job.status === 'queued') await new Promise(r => setTimeout(r, 2000));
    } while (job.status === 'running' || job.status === 'queued');
    if (job.status !== 'done') throw Error(job.error ?? job.status);
    return job;
  },
  persist: () => writeFileSync(receipt, JSON.stringify(frames, null, 2)),
  progress: text => console.log(text),
});
for (const [key, name] of [['first', recipe.look], ['last', recipe.lastLook]]) {
  await copyFile(`data/photos/${pair[key].file}`, `${out}/${name}`);
  await copyFile(`data/photos/${pair[key].file}`, `web/brand/mixer/trends/${recipe.id}/${name}`);
}
console.log('Both frames saved; review them before rendering video.');
