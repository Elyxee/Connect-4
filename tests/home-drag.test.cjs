const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function fixture(){
  const handlers={};let sceneWidth=1000;
  const rect=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
  const piece=()=>{
    const classes=new Set();const element={style:{removeProperty(key){delete this[key==='z-index'?'zIndex':key];}},
      classList:{add(...names){names.forEach(n=>classes.add(n));},remove(...names){names.forEach(n=>classes.delete(n));}},
      closest:()=>element,setPointerCapture(){this.captured=true;},hasPointerCapture(){return !!this.captured;},releasePointerCapture(){this.captured=false;},
      getBoundingClientRect(){const [x,y]=(this.style.translate||'0 0').split(' ').map(parseFloat);return rect(30+x,30+y,100,80);}};return element;
  };
  const pieces=[piece(),piece()];
  const scene={getBoundingClientRect:()=>rect(0,0,sceneWidth,800)};
  const home={inert:false,hidden:false,querySelector:()=>scene,querySelectorAll:()=>pieces,getBoundingClientRect:()=>rect(0,0,sceneWidth,800),addEventListener:(name,fn)=>handlers[name]=fn};
  const context=vm.createContext({window:{addEventListener(){}},document:{getElementById:()=>home,addEventListener(){}},ResizeObserver:class{observe(){}},performance:{now:()=>0}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/home-drag.js'),'utf8'),context);
  const controller=context.window.homeStickers;
  const event=(x,y,target=pieces[0])=>({isPrimary:true,button:0,pointerId:1,clientX:x,clientY:y,target,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}});
  return {controller,pieces,event,handlers,resize:width=>{sceneWidth=width;controller.resize();}};
}
test('finger jitter stays a tap; a drag suppresses the release click but not the next intentional tap',()=>{
  const f=fixture(),c=f.controller;
  c.start(f.event(50,50));c.move(f.event(54,53));c.end(f.event(54,53));
  const tap=f.event(54,53);f.handlers.click(tap);assert.equal(tap.prevented,undefined);assert.equal(c.positions.size,0);
  c.start(f.event(50,50));c.move(f.event(150,110));c.end(f.event(150,110));
  assert.equal(f.pieces[0].style.translate,'100px 60px');
  const click=f.event(150,110);f.handlers.click(click);assert.equal(click.stopped,true);
  c.start(f.event(150,110));c.end(f.event(150,110));
  const next=f.event(150,110);f.handlers.click(next);assert.equal(next.stopped,undefined);
});
test('most recently grabbed sticker comes to front; cancelled drag restores its saved position',()=>{
  const f=fixture(),c=f.controller;
  c.start(f.event(50,50));c.move(f.event(150,50));c.end(f.event(150,50));
  c.start(f.event(50,50,f.pieces[1]));assert.ok(+f.pieces[1].style.zIndex>+f.pieces[0].style.zIndex);c.end(f.event(50,50,f.pieces[1]));
  c.start(f.event(150,50));c.move(f.event(350,50));c.cancel();
  assert.equal(f.pieces[0].style.translate,'100px 0px');assert.equal(f.pieces[0].captured,false);
});
test('resize preserves relative offsets; off-screen drops remain reachable; game entry clears positions and order',()=>{
  const f=fixture(),c=f.controller;
  c.start(f.event(50,50));c.move(f.event(450,50));c.end(f.event(450,50));
  f.resize(800);assert.equal(f.pieces[0].style.translate,'320px 0px');
  c.start(f.event(370,50));c.move(f.event(5000,50));c.end(f.event(5000,50));
  assert.ok(f.pieces[0].getBoundingClientRect().left<=760);
  c.reset();assert.equal(c.positions.size,0);assert.equal(f.pieces[0].style.translate,undefined);assert.equal(f.pieces[0].style.zIndex,undefined);
});
