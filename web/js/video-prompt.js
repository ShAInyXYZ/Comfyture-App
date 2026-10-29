// Native Fast H3 keyframe syntax; LTX accepts the concise shot paragraph directly.
export function finishVideoPrompt(model, hasEnd, duration, answer) {
  const shot = String(answer ?? '').trim().replace(/^```(?:text)?\s*|\s*```$/gi, '').trim();
  if (!shot || shot.length > 5000) throw new Error('The writer did not return a usable shot description. Try again.');
  if (model === 'ltx-2.5') return shot;
  if (model !== 'fast-h3' || !Number.isFinite(duration) || duration <= 0) throw new Error('The video model or duration is invalid.');
  const rawFrames = Math.max(5, Math.round(duration * 24));
  const effectiveDuration = (rawFrames + (5 - rawFrames % 17 + 17) % 17) / 24;
  const alignment = hasEnd
    ? `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the ${effectiveDuration.toFixed(2)}-second mark of the target video.`
    : 'For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.';
  return `${alignment}\n\nintegrated_multimodal_description: [Shot 1] ${shot}\n\noverall_soundscape: N/A\n\nnon_diegetic_music: N/A`;
}
