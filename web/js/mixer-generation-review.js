import { h, icon } from './dom.js';
import { state, toast } from './store.js';
import { mixer } from './mixer.js';
import { crewById, crewFace, trendById } from './mixer-trends.js';
import { pick, castOf, castArtist, trendInputs, generationIdentity, reviewFrames, makeTrend, generateTrendVideo, making, estimate } from './mixer-trend.js';
import { isProblemReveal, cleanProblem, problemBeats, problemFramePrompt, problemVideoPrompt } from './mixer-problem-reveal.js';
import { canResumeTrend } from './mixer-trend-state.js';
import { castVoiceDirection } from './mixer-voices.js';

let dialog;
/** No generation or uploads happen until the explicit confirmation button is pressed. */
export async function reviewGeneration({ freshFrames = false } = {}) {
  if (dialog || making()) return;
  const t = trendById(pick.trend);
  const cast = structuredClone(castOf(t));
  const reveal = isProblemReveal(t);
  let problem;
  try { if (reveal) problem = cleanProblem(trendInputs(t).problem); }
  catch (e) { toast(e.message, { tone: 'crit' }); return; }
  const frames = freshFrames ? null : reviewFrames(t);
  const video = !!frames;
  const identity = generationIdentity();
  const action = reveal ? video ? 'Generate video' : freshFrames ? 'Regenerate frames' : 'Generate frames' : 'Generate trend';
  const d = dialog = h('dialog.nk-dialog.mx-generation-review', { 'aria-labelledby': 'mx-review-title', 'aria-describedby': 'mx-review-desc' });
  const close = () => d.close();
  const opener = document.activeElement;
  const body = h('div.nk-dialog-body', {}, h('p', { role: 'status' }, 'Loading generation details…'));
  const confirm = h('button.key.mx-review-confirm', { type: 'button', disabled: true, on: { click: () => {
    if (identity !== generationIdentity() || making()) {
      close(); toast('Your selection changed. Open the generation summary again.', { tone: 'crit' }); return;
    }
    confirm.disabled = true;
    close();
    if (video) void generateTrendVideo(identity);
    else void makeTrend({ freshFrames });
  } } }, action);
  const cancel = h('button.key', { type: 'button', on: { click: close } }, 'Cancel');
  d.append(h('div.nk-dialog-head', {}, h('div', {}, h('span.label', {}, reveal ? video ? 'Step 2 of 2 · Animate' : 'Step 1 of 2 · Reference frames' : 'Generation review'),
    h('h2.nk-dialog-title', { id: 'mx-review-title' }, action),
    h('p.nk-dialog-desc', { id: 'mx-review-desc' }, t.name)),
    h('button.nk-dialog-close.key.is-icon', { type: 'button', 'aria-label': 'Close generation summary', on: { click: close } }, icon('close'))), body,
    h('div.nk-dialog-actions', {}, cancel, confirm));
  d.addEventListener('close', () => { d.remove(); if (dialog === d) dialog = null; requestAnimationFrame(() => (opener?.isConnected ? opener : document.querySelector('#page-mixer .mx-recipe .mx-go'))?.focus()); }, { once: true });
  document.body.append(d); d.showModal(); cancel.focus();
  try {
    const recipe = t.recipe ? await fetch(t.recipe).then(r => { if (!r.ok) throw new Error('Could not load the generation recipe. Close and try again.'); return r.json(); }) : null;
    if (!d.open) return;
    const settings = recipe?.settings ?? {};
    const sameDraft = !freshFrames && canResumeTrend(mixer.mix, t.id, pick.cast.roles, t.revision ?? 1, trendInputs(t));
    const saved = sameDraft ? mixer.mix.body : null;
    const existingVideo = video && saved?.shots?.some(s => s.native?.id && !['failed', 'canceled'].includes(s.native.status));
    const existingImage = !video && saved?.revealFrames?.wide?.job;
    const imagePrice = state.image.catalogue?.models?.find(m => m.id === 'gpt-image-2.5-flare')?.credits ?? t.render?.estimatedImageCredits;
    const amount = reveal ? video ? existingVideo ? 0 : t.render?.estimatedVideoCredits : existingImage ? 0 : imagePrice : estimate(t);
    const row = (label, value) => h('div.mx-review-row', {}, h('dt', {}, label), h('dd', {}, value));
    const beats = reveal ? problemBeats(problem) : t.beats;
    const resolution = settings.width && settings.height ? `${settings.width} × ${settings.height}` : settings.resolution ?? 'Recipe default';
    const fps = settings.fram_rate ?? settings.frame_rate;
    body.replaceChildren(...[
      h('div.mx-review-cast', {}, ...cast.map(c => h('div', {}, h('img', { src: c.who.crew ? crewFace(c.who.crew) : c.who.star.url, alt: '' }),
        h('span', {}, h('b', {}, c.who.crew ? crewById(c.who.crew).name : c.who.star.name ?? 'Your photo'), h('small', {}, c.role))))),
      h('dl.mx-review-facts', {},
        problem ? row('Collection', problem) : null,
        row('This step', reveal ? video ? 'Animate your reviewed start and end frames' : 'One generated room + a matching opening crop' : 'Reference images, video and sound'),
        row('Model', reveal && !video ? 'GPT Image 2.5 Flare' : recipe?.model ?? t.model ?? 'LTX 2.5'),
        row(reveal && !video ? 'Images' : 'Output', reveal && !video ? '9:16 · 1 MP room · opening cropped from the same image' : `${recipe?.seconds ?? t.seconds} seconds · ${resolution}${fps ? ` · ${fps} fps` : ''}`),
        !reveal ? row('Reference model', castArtist()) : null,
        row('Sound', reveal ? 'Native LTX dialogue with character voice direction (video step)' : recipe?.sound?.note ?? 'Generated dialogue, music and effects')),
      video ? h('div.mx-review-frames', {}, ...[['close', 'Start · hidden collection'], ['wide', 'End · full reveal']].map(([key, label]) =>
        h('figure', {}, h('a', { href: frames[key].photo.url, target: '_blank', rel: 'noopener', title: 'Open full-size frame' }, h('img', { src: frames[key].photo.url, alt: label })), h('figcaption', {}, label)))) : null,
      h('div.mx-review-script', {}, h('span.label', {}, 'Script'), ...beats.map(b => h('p', {}, h('b', {}, `${b.from}–${b.to}s `), b.text))),
      reveal ? h('details.mx-review-prompt', {}, h('summary', {}, 'Full generation direction'), h('pre', {}, video ? problemVideoPrompt(problem) + '\n' + castVoiceDirection(cast) : problemFramePrompt(problem))) : null,
      h('div.mx-review-price', {}, h('div', {}, h('span', {}, 'Estimated additional cost'), h('strong', {}, amount == null ? 'Unavailable' : `≈ ${Number(amount).toFixed(1).replace(/\.0$/, '')} cr`)),
        h('p', {}, existingVideo || existingImage ? 'Resumes your saved job without submitting it again. Its original generation remains billable.' : reveal && !video ? 'One paid image; the opening crop is free. Video is billed separately after you review both frames.' : amount == null ? 'The provider has not supplied a reliable estimate. Confirming will start a paid generation.' : 'An estimate, not a fixed quote. GPU cost varies with execution time; actual billing is reported by Comfy Cloud.'),
        reveal && !existingVideo && !existingImage ? h('p', {}, `Previous example: ≈ ${t.render?.estimatedImageCredits ?? '—'} cr for frames + ≈ ${t.render?.estimatedVideoCredits ?? '—'} cr for video. This is an estimate based on the saved preview, not a live quote.`) : null),
      h('p.mx-review-next', {}, reveal ? video ? 'Confirm only when both frames look right. The video uses this exact pair.' : 'Generation stops at the frames. Inspect them, regenerate if needed, then confirm the video separately.' : 'Your finished video will appear in My mixes.')
    ].filter(Boolean));
    confirm.disabled = false;
  } catch (e) { if (d.open) body.replaceChildren(h('p.mx-error', { role: 'alert' }, e.message)); }
}
