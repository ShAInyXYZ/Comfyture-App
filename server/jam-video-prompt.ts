// Guidance distilled from MiniMax's H3 keyframe guide and LTX's image-to-video guidance.
// https://github.com/MiniMax-AI/MiniMax-H3/blob/main/skills/h3-prompt-writing/references/base-en.txt
// https://docs.ltx.video/
export function videoWriterBrief(model: string, hasEnd: boolean) {
  if (!['fast-h3', 'ltx-2.5'].includes(model)) throw new Error('Choose Fast H3 or LTX 2.5.');
  return `You write one concise English image-to-video shot for ${model === 'fast-h3' ? 'Fast H3' : 'LTX 2.5'}. The first attached image is the opening frame${hasEnd ? '; the second is the ending frame' : ''}. Inspect the images and the user's direction. Describe visible subject action and camera movement in chronological order${hasEnd ? ', moving naturally from the first frame to the last' : ', starting from the first frame'}. Preserve the scene, identity, style, and lighting unless the user asks otherwise. Prioritize the actual frames over stale image direction if they conflict. Do not invent dialogue, major objects, or new shots. Do not claim a detail you cannot see. Return only the shot description, no headings, quotes, timestamps or markdown. The song is added separately.`;
}

export function finishVideoPrompt(model: string, hasEnd: boolean, duration: number, answer: string) {
  const shot = String(answer ?? '').trim().replace(/^```(?:text)?\s*|\s*```$/gi, '').trim();
  if (!shot || shot.length > 5000) throw new Error('The writer did not return a usable shot description. Try again.');
  if (model === 'ltx-2.5') return shot;
  if (model !== 'fast-h3' || !Number.isFinite(duration) || duration <= 0) throw new Error('The video model or duration is invalid.');
  // The Fast H3 template rounds to 24 fps then snaps up to the 17k+5 frame grid.
  const rawFrames = Math.max(5, Math.round(duration * 24));
  const effectiveDuration = (rawFrames + (5 - rawFrames % 17 + 17) % 17) / 24;
  const alignment = hasEnd
    ? `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the ${effectiveDuration.toFixed(2)}-second mark of the target video.`
    : 'For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.';
  return `${alignment}\n\nintegrated_multimodal_description: [Shot 1] ${shot}\n\noverall_soundscape: N/A\n\nnon_diegetic_music: N/A`;
}
