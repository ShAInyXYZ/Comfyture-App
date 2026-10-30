// Authorized cast-preview production. Recorded submissions are never automatically repeated.
import { readFile, writeFile, copyFile, stat, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createTemplates, realCloud, jobOutputs, isDone, isOver } from '../server/comfy-templates.ts';
import { CREW } from '../web/js/mixer-trends.js';
import { castVoiceDirection } from '../web/js/mixer-voices.js';
const root=process.cwd(), dir=join(root,'output/mixer/new-trends-2026-10-28');
const plan=JSON.parse(await readFile(join(root,'docs/research/trends-2026-10-28/production.json'),'utf8'));
const cloud=realCloud(process.env.COMFY_API_KEY!);
const service=createTemplates({root,data:join(root,'data'),cloud,warm:false});
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const exec=promisify(execFile);
const save=async(id:string,value:any)=>{const path=join(dir,id+'.json');await writeFile(path,JSON.stringify(value,null,2)+'\n');};
let next=0;
async function lane(){
 while(next<plan.scenes.length){
  const scene=plan.scenes[next++];
  if(scene.productionRecipe){console.log(scene.id,'uses scripted production:',scene.productionRecipe);continue;}
  const old=await readFile(join(dir,scene.id+'.json'),'utf8').then(JSON.parse,()=>null);
  if(old){
   if(old.cloudPromptId && ['running','needs-review'].includes(old.status)) {
    console.log(scene.id,'recovering existing job',old.cloudPromptId);
    try {
     let detail;
     for(;;){detail=await cloud.rest('/jobs/'+old.cloudPromptId);if(isDone(detail.status)||isOver(detail.status))break;await pause(4000);}
     old.status=isDone(detail.status)?'done':'failed';
     const output=jobOutputs(detail).find(o=>o.kind==='video');
     if(output){const {bytes}=await cloud.view(output);await writeFile(join(dir,scene.id+'.mp4'),bytes);const file=scene.id+'-preview.mp4';await writeFile(join(root,'data/videos',file),bytes);old.outputs=[{kind:'video',file,url:'/media/videos/'+file}];}
     old.cloud={status:detail.status,createdAt:detail.create_time,executionStartedAt:detail.execution_start_time,executionEndedAt:detail.execution_end_time};
     if(detail.execution_end_time&&detail.execution_start_time)old.executionSeconds=(detail.execution_end_time-detail.execution_start_time)/1000;
     old.elapsedSeconds=(Date.now()-Date.parse(old.startedAt))/1000;old.finishedAt=new Date().toISOString();
     await save(scene.id,old);console.log(scene.id,old.status);
    }catch(e:any){console.error(scene.id,'recovery needs review',e.message);}
   }else console.log(scene.id,'already recorded:',old.status);
   continue;
  }
  const image=join(dir,scene.id+'.png');
  console.log(scene.id,'waiting for first frame');
  while(!await stat(image).then(()=>true,()=>false))await pause(2000);
  const started=Date.now();
  const meta:any={id:scene.id,name:scene.name,template:scene.template,settings:{...scene.settings,seed:scene.seed},cast:scene.cast,status:'uploading',startedAt:new Date().toISOString(),actualCostCredits:null,imageCostCredits:null,costNote:'Provider has not supplied an actual per-job bill. Unknown is not zero.'};
  await save(scene.id,meta);
  try{
   const up=await fetch('http://127.0.0.1:5177/api/photos?name='+encodeURIComponent(scene.name+' reference'),{method:'POST',headers:{'Content-Type':'image/png'},body:await readFile(image)});
   if(!up.ok)throw Error(await up.text());
   meta.firstFrame=await up.json();
   const words=Object.fromEntries(scene.cast.map((r:any)=>{const c=CREW.find(c=>c.id===r.crew)!;return[r.role,c.name+', '+c.look];}));
   meta.prompt=scene.prompt.replace(/\{(\w+)\}/g,(all:string,k:string)=>words[k]??all)+'\n'+castVoiceDirection(scene.cast.map((r:any)=>({role:r.role,who:{crew:r.crew}})));
   meta.inputs={first_frame:{file:meta.firstFrame.file},prompt:meta.prompt,...meta.settings};
   meta.estimate=await service.estimate(scene.template);
   meta.status='submitting';await save(scene.id,meta);
   const job=await service.run(scene.template,{inputs:meta.inputs,confirm:true});
   meta.jobId=job.id;meta.cloudPromptId=job.promptId;meta.status='running';meta.submittedAt=new Date().toISOString();await save(scene.id,meta);
   console.log(scene.id,'submitted',job.promptId);
   while(job.status==='running'){await pause(3000);meta.elapsedSeconds=(Date.now()-started)/1000;meta.phase=job.phase;await save(scene.id,meta);}
   meta.status=job.status;meta.error=job.error;meta.outputs=job.outputs;meta.finishedAt=new Date().toISOString();meta.elapsedSeconds=(Date.now()-started)/1000;
   const detail=await cloud.rest('/jobs/'+job.promptId);
   meta.cloud={status:detail.status,createdAt:detail.create_time,executionStartedAt:detail.execution_start_time,executionEndedAt:detail.execution_end_time};
   if(detail.execution_end_time&&detail.execution_start_time)meta.executionSeconds=(detail.execution_end_time-detail.execution_start_time)/1000;
   if(detail.execution_start_time&&detail.create_time)meta.queueSeconds=(detail.execution_start_time-detail.create_time)/1000;
   const video=job.outputs.find(o=>o.kind==='video');
   if(video){
    await copyFile(join(root,'data/videos',video.file),join(dir,scene.id+'.mp4'));
    const {stdout}=await exec('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',join(dir,scene.id+'.mp4')]);
    meta.media=JSON.parse(stdout);
   }
   await save(scene.id,meta);console.log(scene.id,job.status,meta.executionSeconds,'GPU seconds');
  }catch(e:any){meta.status=meta.cloudPromptId?'needs-review':'failed';meta.error=e.message;meta.elapsedSeconds=(Date.now()-started)/1000;await save(scene.id,meta);console.error(scene.id,e.message);}
 }
}
await mkdir(dir,{recursive:true});
await Promise.all([lane(),lane()]);
console.log('Batch settled. Inspect every video before publishing.');
