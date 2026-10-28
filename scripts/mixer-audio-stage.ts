// Durable official-template audio stages. Never resubmit an ambiguous paid job.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTemplates, realCloud, isDone, isOver, jobOutputs } from '../server/comfy-templates.ts';
const [specFile, out] = process.argv.slice(2);
if (!specFile || !out) throw Error('Usage: node --env-file-if-exists=.env scripts/mixer-audio-stage.ts stage.json output-directory');
const spec = JSON.parse(await readFile(specFile, 'utf8'));
await mkdir(out, { recursive: true });
const receipt = join(out, `${spec.id}.json`);
let meta = await readFile(receipt, 'utf8').then(JSON.parse, () => null);
if (meta?.status === 'done') { console.log('Already complete', spec.id); process.exit(0); }
if (meta && !meta.cloudPromptId) throw Error('Previous submission is ambiguous. Inspect the receipt before retrying.');
const cloud = realCloud(process.env.COMFY_API_KEY!);
const service = createTemplates({ root: process.cwd(), data: join(process.cwd(), 'data'), cloud, warm: false });
const sleep = () => new Promise(r => setTimeout(r, 3000));
if (!meta) {
  const request = { confirm: true, inputs: spec.inputs ?? {}, overrides: spec.overrides ?? {} };
  for (const [slot, path] of Object.entries(spec.files ?? {})) {
    const upload = await fetch('http://127.0.0.1:5177/api/audio?name=' + encodeURIComponent(`${spec.id} ${slot}`), { method: 'POST', headers: {'Content-Type': String(path).endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav'}, body: await readFile(String(path)) });
    if (!upload.ok) throw Error(await upload.text());
    request.inputs[slot] = { file: (await upload.json()).file };
  }
  meta = { id: spec.id, template: spec.template, status: 'submitting', startedAt: new Date().toISOString(), actualCostCredits: null, request };
  await writeFile(receipt, JSON.stringify(meta, null, 2));
  try {
    const job = await service.run(spec.template, request);
    meta.cloudPromptId = job.promptId; meta.status = job.status;
    await writeFile(receipt, JSON.stringify(meta, null, 2));
    console.log('Submitted', spec.id, job.promptId);
    while (job.status === 'running') await sleep();
    if (job.status !== 'done') throw Error(job.error ?? job.status);
  } catch (e: any) { meta.error = e.message; await writeFile(receipt, JSON.stringify(meta, null, 2)); throw e; }
}
let detail;
do { detail = await cloud.rest('/jobs/' + meta.cloudPromptId); if (!isDone(detail.status) && !isOver(detail.status)) await sleep(); } while (!isDone(detail.status) && !isOver(detail.status));
if (!isDone(detail.status)) throw Error(`Existing job ended ${detail.status}.`);
const outputs = jobOutputs(detail).filter(o => o.kind === 'audio');
if (!outputs.length) throw Error('No audio output');
meta.outputs = [];
for (const [i, output] of outputs.entries()) {
  const path = join(out, `${spec.id}-${i + 1}.${output.filename?.split('.').at(-1) ?? 'mp3'}`);
  const content = await cloud.view(output);
  await writeFile(path, content.bytes);
  meta.outputs.push({ ...output, path });
}
meta.status = 'done'; meta.finishedAt = new Date().toISOString();
meta.executionSeconds = detail.execution_end_time && detail.execution_start_time ? (detail.execution_end_time - detail.execution_start_time) / 1000 : null;
meta.elapsedSeconds = (Date.now() - Date.parse(meta.startedAt)) / 1000;
await writeFile(receipt, JSON.stringify(meta, null, 2));
console.log('Complete', spec.id, JSON.stringify(meta.outputs), meta.executionSeconds);
