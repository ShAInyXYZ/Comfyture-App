import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const folder=new URL('../examples/kitchen/tarte-for-friends/',import.meta.url);
const spec=JSON.parse(await readFile(new URL('example.json',folder),'utf8'));
test('Kitchen tutorial contains twelve complete timed shots and a portable matching edit',async()=>{
  const body=spec.story.body,shots=body.blocks.filter(b=>b.kind==='shot');
  assert.equal(shots.length,12);assert.equal(shots.reduce((n,s)=>n+s.seconds,0),60);
  assert.equal(body.imageModel,'gpt-image-2.5-flare');assert.equal(body.tutorial.cut,spec.cut.id);
  assert.equal(shots.filter(s=>s.model==='fast-h3').length,1);
  for(const s of shots){assert.ok(s.photo.file.startsWith('example:'));assert.ok(s.video.file.startsWith('example:'));assert.ok(s.videoPrompt);assert.deepEqual(s.jobs,{});}
  const clips=spec.cut.body.tracks.find(t=>t.main).items;
  assert.equal(clips.length,12);assert.equal(clips.reduce((n,c)=>n+(c.to-c.from)/(c.speed||1),0),60);
  const files=new Set();
  function walk(v){if(typeof v==='string'&&v.startsWith('example:'))files.add(v.slice(8));else if(v&&typeof v==='object')Object.values(v).forEach(walk);}
  walk(spec);for(const f of files){assert.match(f,/^[\w.-]+$/);await access(new URL(f,folder));}
  for(const t of spec.cut.body.tracks)for(const c of t.items){if(c.src){assert.ok(c.src.id.startsWith(spec.id+'-'));assert.ok(files.has(c.src.id.slice(spec.id.length+1)),`portable source ${c.src.id}`);}}
  assert.equal(body.tutorial.finishing.holdLastSeconds,1);
});
test('The tutorial movie is an exact one-minute 16:9 24 fps file',()=>{
  const p=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,width,height,r_frame_rate,nb_frames','-of','json',fileURLToPath(new URL('a-little-jar-a-full-table.mp4',folder))],{encoding:'utf8'}));
  const v=p.streams.find(s=>s.codec_type==='video');
  assert.equal(Number(p.format.duration),60);assert.equal(v.r_frame_rate,'24/1');assert.equal(Number(v.nb_frames),1440);assert.equal(v.width/v.height,16/9);
  assert.ok(p.streams.some(s=>s.codec_type==='audio'));
});
