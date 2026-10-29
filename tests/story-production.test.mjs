import test from 'node:test';
import assert from 'node:assert/strict';
import {storyVideoRequest,storyClip} from '../web/js/story-production.js';
import {finishVideoPrompt} from '../web/js/video-prompt.js';

test('Kitchen routes both supplied frames into LTX FLF2V and preserves the reviewed words',()=>{
  const s=storyVideoRequest({idea:{aspect:'16:9'}},{photo:{file:'start.jpg'},endPhoto:{file:'end.jpg'},seconds:5,videoPrompt:'The chick opens the door.',model:'ltx-2.5'},12);
  assert.equal(s.template,'video_ltx2_5_flf2v');
  assert.deepEqual(s.body.inputs.first_frame,{file:'start.jpg'});
  assert.deepEqual(s.body.inputs.last_frame,{file:'end.jpg'});
  assert.equal(s.body.inputs.prompt,'The chick opens the door.');
  assert.equal(s.body.inputs.fram_rate,24);assert.equal(s.body.inputs.prompt_enhance,false);
});
test('Kitchen single-frame shots use I2V and the selected portrait canvas',()=>{
  const s=storyVideoRequest({idea:{aspect:'9:16'}},{photo:{file:'a.jpg'},seconds:5,action:'A gentle push in.'},1);
  assert.equal(s.template,'video_ltx2_5_i2v');assert.equal(s.body.inputs.frame_rate,24);
  assert.equal(s.body.inputs.width,768);assert.equal(s.body.inputs.height,1344);
  assert.equal(s.body.inputs.last_frame,undefined);
});
test('A direction without an explicit video prompt retains the camera, sound and dialogue',()=>{
  const s=storyVideoRequest({}, {photo:{file:'a.jpg'},seconds:5,action:'Open the door.',camera:'locked',sound:'A soft doorbell.',line:{who:'Ketkout',text:'Welcome!'}},1);
  assert.match(s.body.inputs.prompt,/Camera: locked/);
  assert.match(s.body.inputs.prompt,/soft doorbell/);
  assert.match(s.body.inputs.prompt,/Ketkout says: Welcome!/);
});
test('Fast H3 receives native syntax once, with both references when provided',()=>{
  const shot={photo:{file:'a.jpg'},endPhoto:{file:'b.jpg'},seconds:5,model:'fast-h3',videoPrompt:'A steady pullback.'};
  const a=storyVideoRequest({},shot,1);
  assert.equal(a.template,'video_fastvideo_fasth3_i2v');assert.match(a.body.inputs.prompt,/Picture 2/);
  assert.equal(storyVideoRequest({}, {...shot,videoPrompt:a.body.inputs.prompt},1).body.inputs.prompt,a.body.inputs.prompt);
});
test('Twelve video shots keep the planned minute instead of provider padding',()=>{
  const clips=Array.from({length:12},(_,i)=>storyClip({seconds:5,video:{file:`${i}.mp4`,seconds:5.04}},null,`Shot ${i}`));
  assert.equal(clips.reduce((t,c)=>t+(c.to-c.from)/c.speed,0),60);
  assert.equal(clips[0].src.kind,'video');assert.equal(clips[0].src.duration,5.04);
});
test('Existing takes and unrolled stills retain their Kitchen shot durations',()=>{
  assert.equal(storyClip({seconds:4},{id:'run',status:'done',request:{seconds:7}},'Shot').to,4);
  assert.equal(storyClip({seconds:4,photo:{file:'p.jpg'}},null,'Shot').length,4);
  assert.throws(()=>storyClip({seconds:5,video:{file:'v.mp4',duration:3}},null,'Shot'),/shorter/);
  assert.throws(()=>storyVideoRequest({},{seconds:5,action:'Walk'}),/start frame/);
});
