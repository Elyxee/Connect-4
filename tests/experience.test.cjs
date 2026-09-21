const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function fixture() {
  const pending = [], events = {};
  const element = () => ({hidden:false,inert:false,children:[],classList:{add(){},remove(){}},querySelectorAll:()=>[],
    animate(){let finish; const finished=new Promise(r=>finish=r);const animation={finished,cancel(){this.cancelled=true;}};pending.push({finish,animation});return animation;}});
  const home=element(), game=element(), boot=element(), curtain=element();curtain.hidden=true;
  curtain.children=[element(),element(),element()];
  const nodes={homeScreen:home,appRoot:game,bootScreen:boot,cloudTransition:curtain};
  const body={dataset:{screen:'home'},classList:{add(){},remove(){}}};
  const window={addEventListener(){}};
  const document={body,images:[],fonts:{ready:Promise.resolve()},getElementById:id=>nodes[id],addEventListener:(type,fn)=>{(events[type]||=[]).push(fn);}};
  const context=vm.createContext({window,document,performance:{now:()=>1000},matchMedia:()=>({matches:false}),
    Image:class{decode(){return Promise.resolve();}},setTimeout:fn=>{queueMicrotask(fn);return 1;},requestAnimationFrame:fn=>queueMicrotask(fn)});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/experience.js'),'utf8'),context);
  return {api:window.AppExperience,pending,home,game,boot,curtain,body,events};
}
const flush=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
async function ready(f){const p=f.api.ready();await flush();f.pending.shift().finish();await p;}

test('startup gates input until resources and opening animation finish',async()=>{
  const f=fixture();assert.equal(f.home.inert,true);
  let blocked=false;f.events.click[0]({target:{closest:()=>null},preventDefault(){blocked=true;},stopImmediatePropagation(){}});
  assert.equal(blocked,true);await ready(f);assert.equal(f.boot.hidden,true);assert.equal(f.home.inert,false);assert.equal(f.game.inert,true);
});

test('cloud transition swaps only under full cover, ignores double taps, then unlocks the destination',async()=>{
  const f=fixture();await ready(f);let swaps=0;
  const transition=f.api.transition(()=>{swaps++;f.body.dataset.screen='game';});
  assert.equal(f.home.inert,true);assert.equal(f.game.inert,true);assert.equal(swaps,0);
  assert.equal(await f.api.transition(()=>swaps++),false);
  f.pending.splice(0).forEach(p=>p.finish());await flush();assert.equal(swaps,1);
  assert.equal(f.curtain.hidden,false);assert.equal(f.game.inert,true);
  f.pending.splice(0).forEach(p=>p.finish());assert.equal(await transition,true);
  assert.equal(f.curtain.hidden,true);assert.equal(f.game.inert,false);assert.equal(f.home.inert,true);
});

test('failed screen swap cannot strand an opaque curtain or lock all input',async()=>{
  const f=fixture();await ready(f);
  const transition=f.api.transition(()=>{throw new Error('swap failed');});
  const rejection=assert.rejects(transition,/swap failed/);
  f.pending.splice(0).forEach(p=>p.finish());await rejection;
  assert.equal(f.curtain.hidden,true);assert.equal(f.home.inert,false);
});
