// Paid submission lifecycle kept separate from the UI for deterministic, no-credit tests.
/** A new framing anchor invalidates dependent renders, while keeping every old asset in history. */
export function replaceAssetMedia(item, kind, media) {
  item.history ??= []; item.jobs ??= {};
  const previous = item[kind];
  if (previous && previous.file !== media?.file) item.history.push({ kind, media: previous });
  if (previous?.file !== media?.file) {
    for (const dependent of kind === 'image' ? ['endImage', 'video'] : kind === 'endImage' ? ['video'] : []) {
      if (item[dependent]) item.history.push({ kind: dependent, media: item[dependent], job: item.jobs[dependent] ?? null });
      item[dependent] = null;
      delete item.jobs[dependent];
    }
  }
  item[kind] = media;
  return media;
}
export async function runAssetJob(item, kind, specification, deps, { resume = false } = {}) {
  const { save, post, get, sleep, importVideo, now = () => Date.now() } = deps;
  item.jobs ??= {};
  let record = item.jobs[kind];
  if (resume) {
    if (!record?.id) throw new Error('No known job to resume. Check Comfy Cloud before submitting again.');
    if (record.status === 'done') return item[kind];
  } else {
    if (Object.values(item.jobs).some(j => ['running', 'submitting', 'unknown'].includes(j.status))) throw new Error('This asset already has a pending generation. Resume it or check Comfy Cloud first.');
    item.history ??= [];
    if (record) item.history.push({ kind, job: record, media: item[kind] ?? null });
    record = item.jobs[kind] = { status: 'submitting', progress: 0, phase: 'Submitting', startedAt: new Date(now()).toISOString(), model: specification.model, template: specification.template, request: specification.body, endpoint: specification.path, estimatedCredits: specification.estimatedCredits ?? null };
    item.error = null;
    await save(); // Persist the intent before sending a paid request.
    let started;
    try { started = await post(specification.path, specification.body); }
    catch (error) {
      // An HTTP rejection is definite; a dropped response may still have started a paid run.
      record.status = error.status >= 400 && error.status < 500 ? 'failed' : 'unknown';
      record.error = item.error = record.status === 'unknown' ? 'The submission response was lost. Check Comfy Cloud before starting another generation.' : error.message;
      await save();
      throw new Error(record.error);
    }
    const job = Array.isArray(started) ? started[0] : started;
    if (!job?.id) {
      record.status = 'unknown';
      record.error = item.error = 'The provider accepted the request without a job ID. Check Comfy Cloud before retrying.';
      await save(); throw new Error(record.error);
    }
    record.id = job.id;
    record.status = 'running';
    await save();
  }
  try {
    for (let i = 0; i < 1800; i++) {
      const job = await get(record.template ? `api/utensils/templates/job/${record.id}` : `api/image/jobs/${record.id}`);
      record.progress = Math.min(1, Math.max(0, Number(job.progress) || 0));
      record.phase = job.phase ?? (job.status === 'done' ? 'Complete' : 'Generating');
      if (job.status === 'failed' || job.status === 'canceled') {
        record.status = 'failed';
        throw new Error(job.error || 'Generation did not finish.');
      }
      if (job.status === 'done') {
        let media;
        if (kind === 'video') {
          const output = job.outputs?.find(o => o.kind === 'video');
          if (!output?.url) throw new Error('The completed job has no video output.');
          media = await importVideo(output);
        } else {
          media = job.photo;
          if (!media?.file) throw new Error('The completed job has no image output.');
        }
        replaceAssetMedia(item, kind, media);
        record.status = 'done'; record.progress = 1; record.finishedAt = new Date(now()).toISOString();
        const executionSeconds = Number(job.executionSeconds ?? job.timing?.executionSeconds);
        record.metadata = { elapsedSeconds: (now() - Date.parse(record.startedAt)) / 1000,
          executionSeconds: Number.isFinite(executionSeconds) ? executionSeconds : null,
          estimatedCredits: record.template ? null : (typeof job.credits === 'number' ? job.credits : record.estimatedCredits ?? null),
          partnerCredits: record.template && typeof job.credits === 'number' ? job.credits : null,
          actualCostCredits: null, costNote: 'Actual per-job billing was not supplied. Elapsed time includes queueing and is not GPU billing time.' };
        item.error = null; delete record.error;
        await save(); return media;
      }
      record.status = 'running';
      await save();
      await sleep(2000);
    }
    throw new Error('This job is still being tracked. Resume it later to check the result; no new generation is needed.');
  } catch (error) {
    // Polling and local download failures keep the accepted job, so Resume never pays twice.
    record.error = item.error = error.message;
    await save();
    throw error;
  }
}
