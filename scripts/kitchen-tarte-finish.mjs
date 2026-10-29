// Free local finishing and packaging for the commissioned Kitchen tutorial. No model submissions.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'output/kitchen-tarte'),folder=resolve(root,'examples/kitchen/tarte-for-friends');
const checkpoint=resolve(out,'production.json');
const state=JSON.parse(await readFile(checkpoint,'utf8'));
const plan=JSON.parse(await readFile(resolve(folder,'plan.json'),'utf8'));
const base=process.env.COMFYTURE_TUTORIAL_URL||'http://127.0.0.1:5177/';
const save=()=>writeFile(checkpoint,JSON.stringify(state,null,2));
const api=async(path,body,method='POST')=>{const r=await fetch(new URL(path,base),body?{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)}:undefined);const j=await r.json();if(!r.ok)throw new Error(j.error);return j;};
const ff=(args)=>execFileSync('ffmpeg',['-y','-v','error',...args],{stdio:'inherit'});
async function upload(file,kind,name){const r=await fetch(new URL(`api/${kind}?name=${encodeURIComponent(name)}`,base),{method:'POST',headers:{'content-type':kind==='videos'?'video/mp4':kind==='audio'?'audio/mpeg':'image/jpeg'},body:await readFile(file)});const j=await r.json();if(!r.ok)throw new Error(j.error);return j;}
async function reveal(){
  if(state.finishing?.reveal)return console.log('Controlled reveal already saved.');
  state.finishing??={};state.alternates??={};
  for(const k of ['s11','s11-end','s11-video','s12','s12-end','s12-video'])state.alternates[k]=state.assets[k];
  const master=resolve(root,'data/photos',state.assets['s12-end'].file);
  // One optical pullback, split at five seconds without restarting the move. The last second holds.
  const p='(0.5-0.5*cos(PI*min(on/215,1)))';
  ff(['-i',master,'-vf',`scale=4080:-2,zoompan=z='1.85-0.85*${p}':x='iw*0.059*(1-${p})':y='ih*0.205*(1-${p})':d=240:s=1344x756:fps=24,setsar=1`,'-an','-c:v','libx264','-preset','medium','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',resolve(out,'tabletop-reveal.mp4')]);
  for(let i=0;i<2;i++){
    const key=`s${11+i}`,file=resolve(out,`${key}-finished.mp4`);
    ff(['-ss',String(i*5),'-i',resolve(out,'tabletop-reveal.mp4'),'-t','5','-an','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',file]);
    const video=await upload(file,'videos',`${plan.title} · ${key} controlled reveal`);state.assets[key+'-video']={...video,duration:video.duration??video.seconds};
    for(const [suffix,t] of [['',0],['-end',119/24]]){
      const frame=resolve(out,`${key}${suffix}-finished.jpg`);ff(['-ss',String(t),'-i',file,'-frames:v','1','-q:v','2',frame]);state.assets[key+suffix]=await upload(frame,'photos',`${key} ${suffix?'end':'start'} · controlled reveal`);
    }
  }
  const ambience=resolve(out,'cottage-room-tone.mp3');
  ff(['-f','lavfi','-i','anoisesrc=color=brown:amplitude=0.012:sample_rate=48000:duration=60','-af','highpass=f=90,lowpass=f=1200,afade=t=in:d=0.4,afade=t=out:st=59:d=1','-c:a','libmp3lame','-b:a','128k',ambience]);
  state.ambience=await upload(ambience,'audio','Quiet cottage room tone');
  state.finishing.reveal={method:'Deterministic optical pullback',source:state.alternates['s12-end'],seconds:10,fps:24,holdLastSeconds:1,reason:'The generated jar reveal introduced a human hand. A static photographic composition needs only a controlled camera move.'};
  await save();console.log('Saved both halves of the continuous reveal and quiet room tone.');
}
async function conform(){
  if(state.finishing?.conformed)return console.log('Shots already conformed.');
  state.alternates??={};
  for(let i=1;i<=10;i++){
    const key=`s${String(i).padStart(2,'0')}-video`,source=state.assets[key],file=resolve(out,`${key}-conformed.mp4`);
    state.alternates[key]??=source;
    ff(['-i',resolve(root,'data/videos',source.file),'-t','5','-vf','crop=iw:trunc(iw*9/16/2)*2,scale=1280:720,fps=24,setsar=1','-af','afade=t=in:d=0.025,afade=t=out:st=4.975:d=0.025','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',file]);
    const v=await upload(file,'videos',`${plan.title} · ${key}`);state.assets[key]={...v,duration:v.duration??v.seconds};await save();
  }
  state.finishing.conformed={width:1280,height:720,fps:24,secondsPerShot:5};await save();
}
async function packageTutorial(){
  if(!state.film?.url)throw new Error('Render the completed cut before packaging.');
  const {project}=await api(`api/stories/${state.project}`);
  const {project:cut}=await api(`api/cuts/${state.cut}`);
  const time=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
  for(const [i,s] of plan.shots.entries()){
    const b=project.body.blocks.find(b=>b.id===s.id);
    b.frame=s.frame;b.endPrompt=s.end??'';b.lesson=s.lesson;b.sourceRefs=s.refs;
    if(i>=10){b.postprocess=state.finishing.reveal;b.history=Object.entries(state.alternates).filter(([k])=>k.startsWith(s.id)).map(([k,media])=>({kind:k.endsWith('video')?'video':k.endsWith('end')?'endPhoto':'photo',media}));}
    const note=project.body.blocks.find(b=>b.id===`note-${s.id}`);
    note.text=`${String(i+1).padStart(2,'0')} · ${time(i*5)}–${time((i+1)*5)} · ${s.title} — ${i>=10?'Finish the printed-photo reveal with one controlled camera move. The faces, label and objects stay unchanged; the two five-second clips share a continuous motion.':s.lesson}`;
  }
  project.body.tutorial={...project.body.tutorial,cut:state.cut,film:state.film,steps:plan.shots.map((s,i)=>({shot:s.id,from:i*5,to:(i+1)*5,title:s.title,lesson:s.lesson})),finishing:state.finishing.reveal};
  await api(`api/stories/${state.project}`,{name:plan.title,body:project.body,thumb:state.assets.s01.url},'PUT');
  const shipped=structuredClone(project.body),shippedCut=structuredClone(cut.body),media=new Map();
  async function place(asset,name,kind='photos'){
    if(!asset?.file)return asset;
    const own=`${name}${extname(asset.file)}`;
    if(!media.has(asset.file)){await copyFile(resolve(root,'data',kind,asset.file),resolve(folder,own));media.set(asset.file,own);}
    const file=media.get(asset.file);return {...asset,file:`example:${file}`,url:`example:${file}`};
  }
  for(const [key,asset] of Object.entries(state.refs)){
    const dest=await place(asset,`identity-${key}`);for(const group of ['cast','props'])for(const x of shipped[group]??[])x.refs=x.refs.map(r=>r.file===asset.file?dest:r);
  }
  for(const s of plan.shots){
    const b=shipped.blocks.find(b=>b.id===s.id);
    b.photo=await place(state.assets[s.id],s.id);b.endPhoto=await place(state.assets[s.id+'-end'],s.id+'-end');b.video=await place(state.assets[s.id+'-video'],s.id+'-video','videos');
    b.history=[];b.jobs={};b.run=null;b.tab=null;b.still=null;
    // Requests retain model settings in the production plan; expired provider jobs must not be resumable in a shipped tutorial.
    if(b.postprocess)b.postprocess={...b.postprocess,source:await place(state.finishing.reveal.source,'tabletop-master')};
  }
  shipped.places[0].refs=[shipped.blocks.find(b=>b.id==='s01').photo];shipped.look.refs=shipped.places[0].refs;
  shipped.tutorial.finishing.source=await place(state.finishing.reveal.source,'tabletop-master');
  const finalName='a-little-jar-a-full-table.mp4';
  await copyFile(resolve(root,'data',state.film.url.replace('/media/','')),resolve(folder,finalName));
  await copyFile(resolve(folder,finalName),resolve(out,finalName));
  shipped.tutorial.film={...state.film,url:`example:${finalName}`};
  if(state.ambience)await place(state.ambience,'cottage-room-tone','audio');
  for(const track of shippedCut.tracks)for(const item of track.items){if(media.has(item.src?.id)){item.src.id=`${state.project}-${media.get(item.src.id)}`;if(item.src.url)delete item.src.url;}}
  // Include every source once through explicit media records so Cut's filename ids are portable too.
  shipped.tutorial.audio=state.ambience?{...state.ambience,file:`example:${media.get(state.ambience.file)}`,url:`example:${media.get(state.ambience.file)}`}:null;
  const spec={id:state.project,rev:1,name:plan.title,thumb:'example:s01.jpg',story:{body:shipped},cut:{id:state.cut,name:plan.title,body:shippedCut}};
  await writeFile(resolve(folder,'example.json'),JSON.stringify(spec,null,2));
  await writeFile(resolve(folder,'production-notes.json'),JSON.stringify({models:{image:plan.imageModel,video:'LTX 2.5 Distilled',insert:'Fast H3'},canvas:'16:9',fps:24,seconds:60,shots:plan.shots.map(s=>({id:s.id,model:s.model,template:state.jobs[s.id+'-video']?.template,inputs:state.jobs[s.id+'-video']?.request.inputs,postprocess:Number(s.id.slice(1))>=11?'Controlled optical pullback from the Flare tabletop master':null})),qualityControl:{cloudFailure:state.failedSubmissions?.map(j=>({shot:j.key,reason:j.error,resolution:j.resolution})),reveal:state.finishing.reveal.reason}},null,2));
  console.log(`Packaged ${folder}`);
}
if(process.argv[2]==='reveal')await reveal();else if(process.argv[2]==='conform')await conform();else if(process.argv[2]==='package')await packageTutorial();else throw new Error('Use reveal | conform | package');
