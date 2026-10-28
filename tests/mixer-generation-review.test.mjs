import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as problem from '../web/js/mixer-problem-reveal.js';
import * as helpers from '../web/js/mixer-trend-state.js';

// Exercise the dialog's approval boundary without a browser or paid provider.
async function harness({ frames = null, failRecipe = false, generatedFrames = null } = {}) {
  const calls = { images: 0, videos: 0, errors: [] };
  let identity = 'selected-draft';
  class Element {
    constructor(tag, props = {}, children = []) { this.tag = tag; this.props = props; this.children = children; this.disabled = props.disabled ?? false; this.events = {}; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(name, fn) { this.events[name] = fn; }
    showModal() { this.open = true; }
    close() { this.open = false; this.events.close?.(); }
    remove() {}
    focus() {}
    click() { if (!this.disabled) return this.props.on?.click?.(); }
    find(test) { if (test(this)) return this; for (const c of this.children) { const found = c instanceof Element && c.find(test); if (found) return found; } }
    text() { return this.children.map(c => c instanceof Element ? c.text() : String(c)).join(' '); }
  }
  const h = (tag, props, ...children) => new Element(tag, props, children.flat().filter(c => c != null && c !== false));
  const document = { body: new Element('body'), activeElement: null, querySelector: () => null };
  const trend = { id: 'reveal', name: 'Tell Me Without Telling Me', seconds: 10, recipe: '/recipe.json', customization: {kind:'problem-reveal'}, render: {estimatedImageCredits:3,estimatedVideoCredits:17,referenceFrames:{close:{image:'example-start.png'},wide:{image:'example-end.jpg'}}} };
  const deps = {
    './dom.js': {h,icon:()=>h('svg',{})},
    './store.js': {state:{image:{catalogue:{models:[]}}},toast:msg=>calls.errors.push(msg)},
    './mixer.js':{mixer:{mix:null}},
    './mixer-trends.js':{trendById:()=>trend,crewById:()=>({name:'Shiny'}),crewFace:()=>'/shiny.webp'},
    './mixer-trend.js':{pick:{trend:'reveal',cast:{roles:{Lead:{crew:'shiny'}}}},castOf:()=>[{role:'Lead',who:{crew:'shiny'}}],castArtist:()=> 'GPT',trendInputs:()=>({problem:'guitar'}),generationIdentity:()=>identity,reviewFrames:()=>frames,making:()=>false,estimate:()=>null,makeTrend:()=>{calls.images++; if (generatedFrames) frames=generatedFrames;},generateTrendVideo:()=>calls.videos++},
    './mixer-problem-reveal.js':problem,
    './mixer-trend-state.js':helpers,
    './mixer-voices.js':{castVoiceDirection:()=> 'Natural voice direction'},
    './router.js':{currentPage:()=> 'mixer'},
  };
  const context = vm.createContext({ document, structuredClone, requestAnimationFrame: fn => fn(), fetch:async()=>({ok:!failRecipe,json:async()=>({model:'LTX 2.5 Distilled',seconds:10,settings:{width:768,height:1344,fram_rate:24}})}) });
  const module = new vm.SourceTextModule(await readFile('web/js/mixer-generation-review.js','utf8'),{context});
  await module.link(name => new vm.SyntheticModule(Object.keys(deps[name]),function(){for(const [k,v] of Object.entries(deps[name]))this.setExport(k,v);},{context}));
  await module.evaluate();
  await module.namespace.reviewGeneration();
  const dialog = document.body.children[0];
  const confirm = dialog.find(el=>el.tag.includes('mx-review-confirm'));
  return {calls,dialog,confirm,document,change:()=>identity='different-draft'};
}

test('opening and canceling the overview submits nothing; it shows the selected cast, script and estimate',async()=>{
  const {calls,dialog}=await harness();
  assert.match(dialog.text(),/Shiny/); assert.match(dialog.text(),/small guitar problem/); assert.match(dialog.text(),/≈ 3 cr/); assert.match(dialog.text(),/Full sequence ≈ 20 cr/); assert.match(dialog.text(),/Confirm frames only ≈ 3 cr/);
  assert.ok(dialog.find(el=>el.props.src==='/example-start.png'));assert.ok(dialog.find(el=>el.props.src==='/example-end.jpg'));
  assert.match(dialog.text(),/Example · not your generated result/);
  assert.doesNotMatch(dialog.text(),/\bnull\b/);
  dialog.find(el=>el.tag==='button.key'&&el.text()==='Cancel').click();
  assert.equal(dialog.open,false); assert.equal(calls.images,0);assert.equal(calls.videos,0);
});
test('confirming frames submits only the image stage',async()=>{
  const {calls,confirm}=await harness(); confirm.click(); confirm.click();
  assert.equal(calls.images,1);assert.equal(calls.videos,0);
});
test('video approval shows the exact pair and settings, then submits only video',async()=>{
  const {calls,dialog,confirm}=await harness({frames:{close:{photo:{file:'start.png',url:'/start.png'}},wide:{photo:{file:'end.png',url:'/end.png'}}}});
  assert.match(dialog.text(),/768 × 1344 · 24 fps/);assert.match(dialog.text(),/≈ 17 cr/);assert.match(dialog.text(),/Confirm video only ≈ 17 cr/);assert.match(dialog.text(),/Your generated frames/);
  assert.ok(!dialog.find(el=>el.props.src==='/example-start.png'));
  assert.ok(dialog.find(el=>el.props.src==='/start.png'));assert.ok(dialog.find(el=>el.props.src==='/end.png'));
  confirm.click();assert.equal(calls.images,0);assert.equal(calls.videos,1);
});
test('stale selection and failed recipe loading block confirmation',async()=>{
  const stale=await harness();stale.change();stale.confirm.click();
  assert.equal(stale.calls.images,0);assert.match(stale.calls.errors[0],/selection changed/);
  const failed=await harness({failRecipe:true});failed.confirm.click();
  assert.equal(failed.confirm.disabled,true);assert.equal(failed.calls.images,0);
});

test('completing image generation opens the actual pair for review without starting video', async () => {
  const pair = {close:{photo:{url:'/new-start.png'}},wide:{photo:{url:'/new-end.png'}}};
  const {calls,confirm,document} = await harness({generatedFrames:pair});
  await confirm.click();
  const review = document.body.children.at(-1);
  assert.match(review.text(), /Review your sequence/);
  assert.ok(review.find(el=>el.props.src==='/new-start.png'));
  assert.ok(review.find(el=>el.props.src==='/new-end.png'));
  assert.equal(calls.images, 1);
  assert.equal(calls.videos, 0);
});
