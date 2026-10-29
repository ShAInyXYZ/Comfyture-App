// Guidance distilled from MiniMax's H3 keyframe guide and LTX's image-to-video guidance.
// https://github.com/MiniMax-AI/MiniMax-H3/blob/main/skills/h3-prompt-writing/references/base-en.txt
// https://docs.ltx.video/
export function videoWriterBrief(model: string, hasEnd: boolean) {
  if (!['fast-h3', 'ltx-2.5'].includes(model)) throw new Error('Choose Fast H3 or LTX 2.5.');
  return `You write one concise English image-to-video shot for ${model === 'fast-h3' ? 'Fast H3' : 'LTX 2.5'}. The first attached image is the opening frame${hasEnd ? '; the second is the ending frame' : ''}. Inspect the images and the user's direction. Describe visible subject action and camera movement in chronological order${hasEnd ? ', moving naturally from the first frame to the last' : ', starting from the first frame'}. Preserve the scene, identity, style, and lighting unless the user asks otherwise. Prioritize the actual frames over stale image direction if they conflict. Do not invent dialogue, major objects, or new shots. Do not claim a detail you cannot see. Return only the shot description, no headings, quotes, timestamps or markdown. The song is added separately.`;
}

export { finishVideoPrompt } from '../web/js/video-prompt.js';
