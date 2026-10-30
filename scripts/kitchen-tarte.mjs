// Produce the explicitly commissioned Kitchen tutorial. Resumes known jobs; never retries a paid submission automatically.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { finishVideoPrompt } from '../server/jam-video-prompt.ts';
import { normalizeBody } from '../web/js/edit.js';

const root = resolve(import.meta.dirname, '..');
const dir = resolve(root, 'output/kitchen/tarte');
await mkdir(dir, { recursive: true });
const plan = JSON.parse(await readFile(resolve(root, 'examples/kitchen/tarte-for-friends/plan.json'), 'utf8'));
const checkpoint = resolve(dir, 'production.json');
let state = await readFile(checkpoint, 'utf8').then(JSON.parse).catch(() => ({ refs: {}, assets: {}, jobs: {} }));
const base = process.env.COMFYTURE_TUTORIAL_URL || 'http://127.0.0.1:5177/';
let saves=Promise.resolve(),syncs=Promise.resolve();
const save = () => saves=saves.then(()=>writeFile(checkpoint, JSON.stringify(state, null, 2)));
async function api(path, body, method = 'POST') {
  const res = await fetch(new URL(path, base), body === undefined ? undefined : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const out = await res.json();
  if (!res.ok) throw new Error(out.error || `${res.status} ${path}`);
  return out;
}
const photo = key => state.refs[key] || state.assets[key];
async function initialize() {
  for (const [name, path] of Object.entries(plan.references)) if (!state.refs[name]) {
    const bytes = await readFile(resolve(root, path));
    const res = await fetch(new URL(`api/photos?name=${encodeURIComponent(name + ' · Kitchen tutorial reference')}`, base), { method: 'POST', headers: { 'content-type': extname(path) === '.webp' ? 'image/webp' : 'image/png' }, body: bytes });
    if (!res.ok) throw new Error(await res.text());
    state.refs[name] = await res.json(); await save();
  }
  if (!state.project) {
    const body = {
      v: 2, style: 'film', imageModel: plan.imageModel, videoModel: 'ltx-2.5',
      idea: { title: plan.title, length: 60, aspect: plan.aspect, genre: 'Animated short', tone: 'Warm, playful, generous', brief: plan.logline, logline: plan.logline, synopsis: 'Ketkout rolls pastry, fills a tart with Comfyture strawberry jam, adds a lattice and bakes it. The doorbell announces Meringue, Praline and Mochi. He welcomes them in, they share the tart and pose for a photo. A match cut reveals the photograph on a table; an overhead pullback ends on the Comfyture jar.', refs: [] },
      look: { words: plan.style, palette: ['#eadcc4','#90a58b','#b27b42','#a91d39'], refs: [] },
      cast: ['ketkout','meringue','praline','mochi'].map((tag,i) => ({ id: tag, tag, name: tag[0].toUpperCase()+tag.slice(1), about: ({ ketkout: 'Round yellow chick, three head feathers, orange beak and feet, peach scarf, cream baking apron.', meringue: 'White kitten, blue eyes, pink bow.', praline: 'Ginger-and-white kitten, gold bell collar.', mochi: 'Grey-and-white kitten, purple bow tie.' })[tag], refs: [state.refs[tag]], color: ['#ffe98a','#fff0ed','#e5a357','#a89cae'][i] })),
      places: [{ id:'cottage',tag:'cottage',name:'The cottage',words:'Fresh sage-green and honey-oak cottage kitchen, arched oak door, round window left, low round dining table. Warm afternoon light.',refs:[]}],
      props: [{ id:'jar',tag:'jar',name:'Comfyture jar',words:'Glass strawberry jam jar, vivid yellow label with authentic black Comfyture script, dark lid.',refs:[state.refs.jar]}],
      blocks: [],
      tutorial: { version: 1, plan: 'examples/kitchen/tarte-for-friends/plan.json', fps: 24, duration: 60 }
    };
    let scene = 0;
    for (const s of plan.shots) {
      if (s.scene !== scene) {
        scene = s.scene;
        body.blocks.push({ id:`scene-${scene}`,kind:'scene',slug: ['','INT. COTTAGE KITCHEN — AFTERNOON','INT. COTTAGE ENTRANCE — LATE AFTERNOON','INT. DINING NOOK — LATE AFTERNOON','TABLETOP — A MEMORY'][scene],summary:['','Prepare and bake a strawberry tart.','Welcome the three friends.','Share the tart and take a photograph.','Reveal the photograph and the Comfyture jar.'][scene],place:'cottage'});
      }
      body.blocks.push({ ...s, kind:'shot', from:(Number(s.id.slice(1))-1)*5, frame:s.frame, action:s.action, endPrompt:s.end || '', videoPrompt:finishVideoPrompt(s.model,!!s.end,s.seconds,s.action), sound:plan.sound, line:null, photo:null, endPhoto:null, video:null, still:null, run:null, tab:null, drawnAs:'film', jobs:{}, history:[] });
      body.blocks.push({id:`note-${s.id}`,kind:'note',text:`Tutorial · ${s.lesson}`});
    }
    state.project = (await api('api/stories', {name:plan.title,body})).project.id;
    await save(); console.log(`Project ${state.project}`);
  }
}
function sync() { return syncs=syncs.then(syncNow); }
async function syncNow() {
  const {project} = await api(`api/stories/${state.project}`);
  for (const s of plan.shots) {
    const b=project.body.blocks.find(x=>x.id===s.id);
    if(state.assets[s.id]) b.photo=state.assets[s.id];
    if(state.assets[s.id+'-end']) b.endPhoto=state.assets[s.id+'-end'];
    if(state.assets[s.id+'-video']) b.video=state.assets[s.id+'-video'];
    for(const [suffix,kind] of [['','image'],['-end','endImage'],['-video','video']]) if(state.jobs[s.id+suffix]) b.jobs[kind]=state.jobs[s.id+suffix];
  }
  if(state.assets.s01) { project.body.places[0].refs=[state.assets.s01]; project.body.look.refs=[state.assets.s01]; }
  await api(`api/stories/${state.project}`, {name:project.name,body:project.body,thumb:state.assets.s01?.url},'PUT');
}
async function job(key, path, body, kind) {
  if(state.assets[key]) { console.log(`${key} already complete`); return state.assets[key]; }
  let j=state.jobs[key];
  if(j && !j.id) throw new Error(`${key}: prior submission has no known job ID. Inspect it before retrying.`);
  if(j?.status==='failed') throw new Error(`${key}: recorded failure: ${j.error}. No automatic paid retry.`);
  if(!j) {
    j=state.jobs[key]={status:'submitting',endpoint:path,request:body,startedAt:new Date().toISOString(),model:kind==='image'?plan.imageModel:body.model,template:kind==='video'?path.split('/').at(-2):null};
    await save(); await sync();
    const r=await api(path,body); const started=Array.isArray(r)?r[0]:r;
    if(!started.id) throw new Error('Submission returned no job ID');
    Object.assign(j,{id:started.id,status:'running'});await save();await sync();
    console.log(`${key} submitted ${j.id}`);
  }
  const poll=kind==='image'?`api/image/jobs/${j.id}`:`api/utensils/templates/job/${j.id}`;
  let previous='';
  for(let attempt=0;attempt<1200;attempt++) {
    const r=await api(poll);
    const label=`${r.status} ${r.phase||''} ${Math.round((r.progress||0)*100)}%`;
    if(label!==previous) {console.log(`${key}: ${label}`);previous=label;}
    if(['failed','canceled'].includes(r.status)) {Object.assign(j,{status:'failed',error:r.error});await save();await sync();throw new Error(`${key}: ${r.error}`);}
    if(r.status==='done') {
      const out=kind==='image'?r.photo:r.outputs.find(o=>o.kind==='video');
      if(!out?.file) throw new Error(`${key}: no output`);
      state.assets[key]={...out,...(kind==='video'?{duration:out.seconds}: {})};
      Object.assign(j,{status:'done',finishedAt:new Date().toISOString(),progress:1,credits:r.credits??null});
      await save();await sync();console.log(`${key} complete ${out.url}`);return state.assets[key];
    }
    Object.assign(j,{status:'running',progress:r.progress||0,phase:r.phase||'Generating'});await save();
    await new Promise(r=>setTimeout(r,3000));
  }
  throw new Error(`${key}: still running, rerun this command to resume the same job.`);
}
async function frame(id,end=false) {
  const s=plan.shots.find(s=>s.id===id);if(!s)throw new Error('Unknown shot');
  const names=end?[id,...s.refs.filter(k=>['ketkout','meringue','praline','mochi','jar'].includes(k))]:s.refs;
  const refs=names.map((key,i)=>{const p=photo(key);if(!p?.file)throw new Error(`Missing reference ${key}`);return {file:p.file,name:end&&i===0?'start-frame':key};});
  const prompt=`${plan.style}\n\n${end?'Generate a separate high-resolution END FRAME matching the supplied start frame. Keep identity, room geometry and lighting. ':'Generate a fresh cinematic START FRAME. References establish identity and continuity; follow the requested new composition. '}${end?s.end:s.frame}`;
  if(end&&!s.end)throw new Error('No end frame planned');
  return job(id+(end?'-end':''),'api/image',{model:plan.imageModel,template:'edit',aspect:'16:9',count:1,megapixels:1,name:`Tarte tutorial · ${id} ${end?'end':'start'} · ${s.title}`,prompt,refs},'image');
}
async function video(id) {
  const s=plan.shots.find(s=>s.id===id);if(!photo(id))throw new Error('Start frame required');
  if(s.end&&!photo(id+'-end'))throw new Error('Planned end frame required');
  const template=s.model==='fast-h3'?'video_fastvideo_fasth3_i2v':s.end?'video_ltx2_5_flf2v':'video_ltx2_5_i2v';
  const inputs={first_frame:{file:photo(id).file},...(s.end?{last_frame:{file:photo(id+'-end').file}}:{}),prompt:finishVideoPrompt(s.model,!!s.end,s.seconds,s.action),duration:s.seconds,width:1344,height:768,seed:482900+Number(id.slice(1)),...(s.model==='ltx-2.5'?{prompt_enhance:false,[s.end?'fram_rate':'frame_rate']:24}:{})};
  return job(id+'-video',`api/utensils/templates/${template}/run`,{confirm:true,inputs},'video');
}
async function makeCut() {
  if(plan.shots.some(s=>!state.assets[s.id+'-video']))throw new Error('Complete all videos first');
  const body=normalizeBody();body.aspect='16:9';body.fit='cover';body.duck=false;body.product='kitchen';
  body.tracks.find(t=>t.main).items=plan.shots.map((s,i)=>({id:s.id,src:{kind:'video',id:state.assets[s.id+'-video'].file,duration:state.assets[s.id+'-video'].duration,name:s.title},from:0,to:5,speed:1,volume:0.65,sound:true,join:'cut'}));
  body.markers=plan.shots.map((s,i)=>({t:i*5,label:`${String(i+1).padStart(2,'0')} · ${s.title}`}));
  if(state.ambience)body.tracks.find(t=>t.role==='effects').items=[{id:'cottage-room-tone',src:{kind:'audio',id:state.ambience.file,name:'Quiet cottage room tone',duration:60},start:0,from:0,to:60,volume:0.5,fadeIn:0.4,fadeOut:1}];
  if(!state.cut)state.cut=(await api('api/cuts',{name:plan.title,project:state.project,body})).project.id;
  else await api(`api/cuts/${state.cut}`,{body},'PUT');
  await save();console.log(`Cut ${state.cut}`);
}
const [command,id] = process.argv.slice(2);
await initialize();
if(command==='init')await sync();
else if(command==='frame')await frame(id);
else if(command==='end')await frame(id,true);
else if(command==='video')await video(id);
else if(command==='sync')await sync();
else if(command==='cut')await makeCut();
else if(command==='render') { if(!state.cut)throw new Error('Make the cut first');state.film=await api(`api/cuts/${state.cut}/render`,{});await save();console.log(JSON.stringify(state.film)); }
else if(command==='status')console.log(JSON.stringify({project:state.project,cut:state.cut,jobs:Object.fromEntries(Object.entries(state.jobs).map(([k,j])=>[k,{id:j.id,status:j.status,progress:j.progress,error:j.error}]))},null,2));
else if(command==='batch') {
  const tasks=id.split(',');
  const results=await Promise.allSettled(Array.from({length:2},async()=>{while(tasks.length){const [kind,key]=tasks.shift().split(':');if(kind==='frame')await frame(key);else if(kind==='end')await frame(key,true);else if(kind==='video')await video(key);else throw new Error('Unknown batch operation');}}));
  if(results.some(r=>r.status==='rejected'))throw new Error(results.filter(r=>r.status==='rejected').map(r=>r.reason.message).join('\n'));
}
else throw new Error('Use init | frame <s01> | end <s07> | video <s01> | sync | cut | render | status');
