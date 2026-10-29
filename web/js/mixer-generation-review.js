import { h, icon } from './dom.js';
import { state, toast } from './store.js';
import { mixer } from './mixer.js';
import { crewById, crewFace, trendById } from './mixer-trends.js';
import { pick, castOf, castArtist, trendInputs, generationIdentity, reviewFrames, makeTrend, generateTrendVideo, making, estimate, setFrameIdeas } from './mixer-trend.js';
import { isProblemReveal, cleanProblem, cleanFrameIdeas, FRAME_IDEA_LIMIT, problemBeats, problemFramePrompt, problemOutpaintPrompt, problemVideoPrompt } from './mixer-problem-reveal.js';
import { canResumeTrend } from './mixer-trend-state.js';
import { castVoiceDirection } from './mixer-voices.js';
import { currentPage } from './router.js';

const credits = value => Number.isFinite(value) ? `≈ ${Number(value).toFixed(1).replace(/\.0$/, '')} cr` : 'Unavailable';
let dialog;

// An example is never labelled as the user's output. A recipe without an end anchor
// gets an explicit empty slot rather than a fabricated finish image.
function sequences(t, recipe, frames, saved, freshFrames, ideaField) {
  const dir = t.recipe?.replace(/recipe\.json$/, '') ?? '';
  const shots = recipe?.shots ?? [{ from: 0, to: t.seconds }];
  const refs = recipe?.render?.referenceFrames ?? t.render?.referenceFrames;
  return h('section.mx-review-sequences', {},
    h('div.mx-review-section-head', {}, h('h3', {}, 'Sequence frames'), h('span.label', {}, frames ? 'Your generated frames' : saved?.shots?.some(s => s.look) ? 'Saved frames & recipe guides' : 'Example · not your generated result')),
    ...shots.map((shot, i) => {
      const actual = frames ? { first: frames.close.photo, last: frames.wide.photo } : saved?.shots?.[i] ? { first: saved.shots[i].look, last: saved.shots[i].lastLook } : null;
      const firstPath = isProblemReveal(t) ? refs?.close?.image : shot.look ?? recipe?.look;
      const lastPath = isProblemReveal(t) ? refs?.wide?.image : shot.end ?? recipe?.lastLook;
      return h('div.mx-review-sequence', {},
        h('div.mx-review-sequence-label', {}, `Sequence ${i + 1}`, h('span', {}, `${shot.from}–${shot.to}s`)),
        h('div.mx-review-frames', {}, ...[['first', 'Start frame', firstPath], ['last', 'End frame', lastPath]].map(([key, label, path]) => {
          const url = actual?.[key]?.url ?? (path ? dir + path : null);
          return h('figure', {}, url ? h('a', { href: url, target: '_blank', rel: 'noopener', title: `Open ${label.toLowerCase()} full size` }, h('img', { src: url, alt: `${actual?.[key] ? 'Your' : 'Example'} ${label.toLowerCase()}` })) : h('div.mx-review-empty', {}, icon('image'), h('p', {}, key === 'last' ? 'No fixed end-frame guide in this recipe' : 'Created after you confirm')),
            h('figcaption', {}, h('b', {}, label), h('span', {}, isProblemReveal(t) ? key === 'first' ? 'Close-up · collection hidden' : 'Wide shot · full collection revealed' : actual?.[key] ? 'Your generated frame' : 'Recipe reference')), isProblemReveal(t) ? ideaField(key === 'first' ? 'opening' : 'ending') : null);
        })),
        isProblemReveal(t) ? h('p.mx-review-continuity', {}, icon('video'), 'One continuous zoom-out · same character, room and lighting') : null);
    }),
    !frames && isProblemReveal(t) ? h('p.mx-review-example-note', {}, freshFrames ? 'These example frames show the reveal structure. Regenerating creates a new performance with your selected character; your previous pair remains saved in My mixes.' : 'These example frames show the reveal structure. Your character and collection will be generated after confirmation, then both frames open here for review.') : null);
}

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
  const draftIdeas = cleanFrameIdeas(trendInputs(t).frameIdeas);
  const initialIdeas = JSON.stringify(draftIdeas);
  let direction, refreshEstimate = () => {};
  const ideasChanged = () => JSON.stringify(cleanFrameIdeas(draftIdeas)) !== initialIdeas;
  const fieldInfo = {
    scene: ['Scene direction', 'A cozy attic music room, slanted ceiling, warm afternoon light…'],
    opening: ['Start-frame idea', 'Leaning forward, shoulders hunched, a guilty smile, looking straight at the camera…'],
    ending: ['End-frame idea', 'Guitars covering the walls and floor, tiny amps stacked like furniture, one absurdly oversized guitar…'],
  };
  const ideaField = key => {
    const [label, placeholder] = fieldInfo[key];
    return h('div.mx-frame-idea', {}, h('label', { for: `mx-idea-${key}` }, label),
      h('textarea', { id: `mx-idea-${key}`, rows: 3, maxLength: FRAME_IDEA_LIMIT, value: draftIdeas[key], placeholder: video ? 'Preset improvisation' : placeholder, readOnly: video, 'aria-describedby': 'mx-ideas-help', on: { input: e => {
        draftIdeas[key] = e.target.value;
        if (direction) direction.textContent = problemFramePrompt(problem, draftIdeas) + '\n\n' + problemOutpaintPrompt(problem, draftIdeas);
        refreshEstimate();
      } } }));
  };
  const action = reveal ? video ? 'Generate video' : freshFrames ? 'Regenerate frames' : 'Generate frames' : 'Generate trend';
  const d = dialog = h('dialog.nk-dialog.mx-generation-review', { 'aria-labelledby': 'mx-review-title', 'aria-describedby': 'mx-review-desc' });
  const close = () => d.close();
  const opener = document.activeElement;
  const body = h('div.nk-dialog-body', {}, h('p', { role: 'status' }, 'Loading generation details…'));
  const stagePrice = h('div.mx-review-stage-price', {});
  const confirm = h('button.key.mx-review-confirm', { type: 'button', disabled: true, on: { click: async () => {
    if (identity !== generationIdentity() || making()) {
      close(); toast('Your selection changed. Open the generation summary again.', { tone: 'crit' }); return;
    }
    confirm.disabled = true;
    close();
    if (video) await generateTrendVideo(identity);
    else {
      if (reveal) setFrameIdeas(draftIdeas);
      await makeTrend({ freshFrames });
      // Bring the actual frames into view; never confirm or submit the video here.
      if (reveal && currentPage() === 'mixer' && pick.trend === t.id && reviewFrames(t)) await reviewGeneration();
    }
  } } }, action);
  const cancel = h('button.key', { type: 'button', on: { click: close } }, 'Cancel');
  d.append(h('div.nk-dialog-head', {}, h('div', {}, h('span.label', {}, reveal ? video ? 'Step 2 of 2 · Review frames & animate' : 'Step 1 of 2 · Create your scene' : 'Generation review'),
    h('h2.nk-dialog-title', { id: 'mx-review-title' }, video ? 'Review your sequence' : action),
    h('p.nk-dialog-desc', { id: 'mx-review-desc' }, t.name)),
    h('button.nk-dialog-close.key.is-icon', { type: 'button', 'aria-label': 'Close generation summary', on: { click: close } }, icon('close'))), body,
    h('div.nk-dialog-actions', {}, stagePrice, video && !mixer.mix?.body?.shots?.some(s => s.native?.id || s.submissionPending) ? h('button.key', { type: 'button', on: { click: () => { d.addEventListener('close', () => { void reviewGeneration({ freshFrames: true }); }, { once: true }); close(); } } }, 'Regenerate frames') : null, cancel, confirm));
  d.addEventListener('close', () => { d.remove(); if (dialog === d) dialog = null; requestAnimationFrame(() => (opener?.isConnected ? opener : document.querySelector('#page-mixer .mx-recipe .mx-go'))?.focus()); }, { once: true });
  document.body.append(d); d.showModal(); cancel.focus();
  try {
    const recipe = t.recipe ? await fetch(t.recipe).then(r => { if (!r.ok) throw new Error('Could not load the generation recipe. Close and try again.'); return r.json(); }) : null;
    if (!d.open) return;
    const settings = recipe?.settings ?? {};
    const sameDraft = !freshFrames && canResumeTrend(mixer.mix, t.id, pick.cast.roles, t.revision ?? 1, trendInputs(t));
    const saved = sameDraft ? mixer.mix.body : null;
    const existingVideo = video && saved?.shots?.some(s => s.native?.id && !['failed', 'canceled'].includes(s.native.status));
    const imageRecord = saved?.revealFrames;
    const legacy = imageRecord?.method === 'crop-v1' || (!imageRecord?.method && !!(imageRecord?.wide?.job || imageRecord?.wide?.photo || imageRecord?.wide?.pending));
    const imagePrice = state.image.catalogue?.models?.find(m => m.id === 'gpt-image-2.5-flare')?.credits ?? t.render?.estimatedImageCredits;
    const videoPrice = t.render?.estimatedVideoCredits;
    const pairPrice = Number.isFinite(imagePrice) ? imagePrice * (legacy ? 1 : 2) : null;
    const fullPrice = Number.isFinite(pairPrice) && Number.isFinite(videoPrice) ? pairPrice + videoPrice : null;
    const accepted = part => !!(part?.job || part?.photo || part?.pending);
    const pendingCount = legacy ? (accepted(imageRecord?.wide) ? 0 : 1) : (accepted(imageRecord?.close) ? 0 : 1) + (accepted(imageRecord?.wide) ? 0 : 1);
    const remainingFrames = Number.isFinite(imagePrice) ? pendingCount * imagePrice : null;
    const hasImageJob = accepted(imageRecord?.close) || accepted(imageRecord?.wide);
    let amount = reveal ? video ? existingVideo ? 0 : videoPrice : remainingFrames : estimate(t);
    const row = (label, value) => h('div.mx-review-row', {}, h('dt', {}, label), h('dd', {}, value));
    const beats = reveal ? problemBeats(problem) : t.beats;
    const resolution = settings.width && settings.height ? `${settings.width} × ${settings.height}` : settings.resolution ?? 'Recipe default';
    const fps = settings.fram_rate ?? settings.frame_rate;
    const priceValue = h('strong', {}, credits(amount));
    stagePrice.append(h('span', {}, reveal ? video ? 'Confirm video only' : 'Confirm frames only' : 'Confirm generation'), priceValue);
    const priceNote = h('p', {}, video ? existingVideo ? 'Resumes the saved video job without submitting it again; its original generation remains billable.' : 'Your frames are already prepared. This confirmation starts the video only.' : reveal ? legacy ? 'Resumes the previous frame job and its local crop. Video requires a separate confirmation.' : hasImageJob ? 'Saved image jobs are reused. The estimate covers any image still to be submitted; earlier jobs may still be billed.' : 'Two image generations: an opening frame and a wide scene extended from it. Video requires a separate confirmation.' : 'Confirming starts a paid generation.');
    const framesCost = h('dd', {}, credits(pairPrice));
    const totalCost = h('dd', {}, credits(fullPrice));
    refreshEstimate = () => {
      if (reveal && !video && hasImageJob) {
        const newPairPrice = Number.isFinite(imagePrice) ? imagePrice * 2 : null;
        priceValue.textContent = credits(ideasChanged() ? newPairPrice : remainingFrames);
        framesCost.textContent = credits(ideasChanged() ? newPairPrice : pairPrice);
        totalCost.textContent = credits(ideasChanged() && Number.isFinite(newPairPrice) && Number.isFinite(videoPrice) ? newPairPrice + videoPrice : fullPrice);
        priceNote.textContent = ideasChanged() ? 'Your ideas changed. This confirmation creates two new paid images; the previous draft stays saved.' : legacy ? 'Resumes the previous frame job and its local crop. Video requires a separate confirmation.' : 'Saved image jobs are reused. The estimate covers any image still to be submitted; earlier jobs may still be billed.';
      }
    };
    const price = h('section.mx-review-price', {}, h('h3', {}, 'Estimated cost'),
      reveal ? h('dl', {}, h('div.mx-review-row', {}, h('dt', {}, video ? 'Frames · prepared' : 'Frames'), framesCost), row(video ? 'Video · next' : 'Video · later', credits(videoPrice)), h('div.mx-review-total', {}, h('dt', {}, 'Full sequence'), totalCost)) : h('strong', {}, credits(amount)),
      priceNote,
      h('p', {}, reveal ? 'Per-sequence estimates, excluding retries. Image price: catalogue estimate. Video price: saved preview’s GPU execution time, not a live quote. Actual billing may differ.' : 'Estimated cost may vary. When unavailable, no reliable quote was supplied.'));
    direction = h('pre', {}, video ? problemVideoPrompt(problem, draftIdeas) + '\n' + castVoiceDirection(cast) : problemFramePrompt(problem, draftIdeas) + '\n\n' + problemOutpaintPrompt(problem, draftIdeas));
    body.replaceChildren(h('div.mx-review-layout', {},
      h('div.mx-review-story', {}, sequences(t, recipe, frames, saved, freshFrames, ideaField),
        h('div.mx-review-script', {}, h('h3', {}, 'Performance'), ...beats.map(b => h('p', {}, h('b', {}, `${b.from}–${b.to}s `), b.text))),
        reveal ? h('details.mx-review-prompt', {}, h('summary', {}, 'Full generation direction'), direction) : null),
      h('aside.mx-review-setup', {},
        h('div.mx-review-cast', {}, ...cast.map(c => h('div', {}, h('img', { src: c.who.crew ? crewFace(c.who.crew) : c.who.star.url, alt: '' }),
          h('span', {}, h('b', {}, c.who.crew ? crewById(c.who.crew).name : c.who.star.name ?? 'Your photo'), h('small', {}, `${c.role} · identity reference`))))),
        reveal ? h('section.mx-review-ideas', {}, ideaField('scene'), h('p', { id: 'mx-ideas-help' }, video ? 'These ideas belong to this frame pair. Choose Regenerate frames to edit them.' : 'Optional. Your ideas guide the preset: a fresh pose and setting, one shared room, the collection hidden at first and revealed at the end. Leave blank for an improvised take.')) : null,
        price,
        h('dl.mx-review-facts', {}, problem ? row('Collection', problem) : null,
          row('Frames', reveal ? legacy ? 'GPT Image 2.5 Flare · saved image + matching crop' : 'GPT Image 2.5 Flare · opening + extended scene' : castArtist()),
          row('Video', recipe?.model ?? t.model ?? 'LTX 2.5'),
          row('Output', `${recipe?.seconds ?? t.seconds} seconds · ${resolution}${fps ? ` · ${fps} fps` : ''}`),
          row('Sound', reveal ? 'Native dialogue · character-directed voice' : recipe?.sound?.note ?? 'Generated dialogue, music and effects')),
        h('p.mx-review-next', {}, reveal ? video ? 'Check both frames before confirming. Open either image to inspect it full size.' : 'We create a fresh scene using your character’s identity. Review both generated frames before approving video.' : 'Your finished video will appear in My mixes.'))));
    confirm.disabled = false;
  } catch (e) { if (d.open) body.replaceChildren(h('p.mx-error', { role: 'alert' }, e.message)); }
}
