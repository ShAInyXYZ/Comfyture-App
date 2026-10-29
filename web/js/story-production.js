// Kitchen's production contract: the reviewed frames and words travel together into
// the same native video templates used by Jam. Pure functions also serve tutorial scripts.
import { finishVideoPrompt } from './video-prompt.js';

export const STORY_VIDEO_MODELS = [['ltx-2.5', 'LTX 2.5 Distilled'], ['fast-h3', 'Fast H3']];
export function storyVideoRequest(body, shot, seed = Math.floor(Math.random() * 2147483647)) {
  const start = shot.still ?? shot.photo;
  if (!start?.file) throw new Error('Draw or upload the start frame first.');
  const seconds = Number(shot.seconds);
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 30) throw new Error('Choose a duration between 1 and 30 seconds.');
  const model = shot.model ?? body.videoModel ?? 'ltx-2.5';
  if (!STORY_VIDEO_MODELS.some(([id]) => id === model)) throw new Error('Choose LTX 2.5 or Fast H3.');
  const end = shot.endPhoto;
  const direction = [shot.action, shot.camera ? `Camera: ${shot.camera}.` : '', shot.sound ? `Sound: ${shot.sound}` : '', shot.line?.text ? `${shot.line.who || 'The character'} says: ${shot.line.text}` : ''].filter(Boolean).join('\n');
  const words = String(shot.videoPrompt || direction).trim();
  if (!words) throw new Error('Write the video prompt before rolling.');
  const template = model === 'fast-h3' ? 'video_fastvideo_fasth3_i2v' : end?.file ? 'video_ltx2_5_flf2v' : 'video_ltx2_5_i2v';
  const [width, height] = body.idea?.aspect === '9:16' ? [768,1344] : body.idea?.aspect === '1:1' ? [1024,1024] : [1344,768];
  // A saved full H3 prompt is already model-ready. A user can also type a plain shot description.
  const prompt = model === 'fast-h3' && words.includes('integrated_multimodal_description:') ? words : finishVideoPrompt(model, !!end?.file, Math.ceil(seconds), words.replace(/@([\w-]+)/g, '$1'));
  return { path:`api/utensils/templates/${template}/run`, template, model:STORY_VIDEO_MODELS.find(([id])=>id===model)[1], body:{ confirm:true, inputs:{ first_frame:{file:start.file}, ...(end?.file?{last_frame:{file:end.file}}:{}), prompt, duration:Math.ceil(seconds), width, height, seed, ...(model==='ltx-2.5'?{prompt_enhance:false,[end?.file?'fram_rate':'frame_rate']:24}:{}) } } };
}

/** Keep shot timings and the chosen aspect, even when the provider adds padding frames. */
export function storyClip(shot, take, name) {
  const seconds = Number(shot.seconds);
  if (!(seconds > 0)) throw new Error('Give each shot a duration before editing.');
  if (shot.video?.file) {
    const duration = Number(shot.video.duration ?? shot.video.seconds);
    if (!(duration >= seconds - 0.05)) throw new Error(`${name} is shorter than its planned duration.`);
    return { src:{kind:'video',id:shot.video.file,duration,name},name,from:0,to:Math.min(seconds,duration),speed:duration<seconds?duration/seconds:1,sound:true,join:'cut' };
  }
  if (take?.status === 'done') {
    const duration = Number(take.length ?? take.request?.seconds);
    if (!(duration >= seconds - 0.05)) throw new Error(`${name} is shorter than its planned duration.`);
    return {src:{kind:'take',id:take.id,duration,name},name,from:0,to:Math.min(seconds,duration),speed:duration<seconds?duration/seconds:1,sound:true,join:'cut'};
  }
  const pic=shot.still??shot.photo;
  return pic?{src:{kind:'photo',id:pic.file,url:pic.url,width:pic.width,height:pic.height,name},length:seconds,name,join:'cut'}:null;
}
