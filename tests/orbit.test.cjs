const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/orbit.js'),'utf8')+'\nthis.OrbitGame=OrbitGame;',ctx);
const make=()=>new ctx.OrbitGame(()=>.5);
function hit(g,color='white'){if(!g.target)g.advance(g.transition);g.target.color=color;g.advance((g.target.distance+g.target.width/2-g.target.travel)/g.speed);g.tap();}
test('zero lives: empty tap or skipped target ends the run exactly once',()=>{
 for(const pass of [false,true]){const g=make();g.start();assert.equal(g.lives.filter(l=>l.state==='active').length,0);if(pass)g.advance(60);else g.tap();assert.equal(g.status,'over');assert.equal(g.events.filter(e=>e.type==='miss').length,1);g.advance(60);g.tap();assert.equal(g.events.filter(e=>e.type==='miss').length,1);}
});
test('hit transition ignores extra input; new targets leave a minimum reaction window in both directions',()=>{
 for(const rng of [()=>0,()=>.5,()=>.999]){const g=new ctx.OrbitGame(rng);g.start();for(let i=0;i<150;i++){
  const t=g.target;assert.ok(t.distance/g.speed>=t.reaction);assert.ok(t.distance+t.width<360);
  const dir=g.direction;hit(g,t.color);assert.equal(g.hits,i+1);assert.equal(g.target,null);g.tap();assert.equal(g.hits,i+1);
  g.advance(.08);assert.equal(g.target,null);g.advance(.08);assert.ok(g.target);assert.ok(Math.abs(g.direction)===1);
 }}
});
test('5/3/1 hits progressively earn 3/2/1 lives, consumed white then gold then red, never earned twice',()=>{
 const g=make();g.start();hit(g);assert.equal(g.lives[0].progress,.2);assert.equal(g.lives[0].state,'ghost');
 for(let i=1;i<15;i++)hit(g);for(let i=0;i<6;i++)hit(g,'gold');hit(g,'red');
 assert.equal(g.lives.filter(l=>l.state==='active').length,6);
 for(let i=0;i<6;i++){g.advance(g.transition);g.tap();assert.equal(g.status,'running');assert.equal(g.lives[i].state,'spent');}
 for(let i=0;i<20;i++)hit(g,['white','gold','red'][i%3]);assert.equal(g.lives.filter(l=>l.state==='active').length,0);
 g.advance(g.transition);g.tap();assert.equal(g.status,'over');
});
test('pause freezes time and geometry; start completely resets run',()=>{
 const g=make();g.start();g.advance(.2);g.pause();const before=JSON.stringify(g);g.advance(999);g.tap();assert.equal(JSON.stringify(g),before);
 g.resume();g.advance(.2);assert.ok(g.elapsed>.2);g.start();assert.equal(g.elapsed,0);assert.equal(g.hits,0);assert.ok(g.lives.every(l=>l.state==='ghost'&&l.progress===0));
});
test('long frames cost at most one life and do not silently consume newly spawned targets',()=>{
 const g=make();g.start();for(let i=0;i<15;i++)hit(g);g.advance(g.transition);g.advance(600);
 assert.equal(g.lives.filter(l=>l.state==='spent').length,1);assert.equal(g.status,'running');assert.equal(g.target,null);
});
test('reward unlocks at 60, rolls at 10%, and safe misses cost nothing',()=>{
 for(const pass of [false,true]){const g=new ctx.OrbitGame(()=>0);g.start();g.hits=59;g.spawn();assert.notEqual(g.target.color,'bonus');g.hits=60;g.spawn();assert.equal(g.target.color,'bonus');if(pass)g.advance(30);else g.tap();assert.equal(g.status,'running');assert.equal(g.lives.filter(l=>l.state==='active').length,0);assert.equal(g.events.filter(e=>e.type==='miss').length,0);g.advance(g.transition);assert.equal(g.target.color,'bonus');}
 const g=make();g.start();g.hits=60;let calls=0;g.random=()=>++calls===3?.1:.5;g.spawn();assert.notEqual(g.target.color,'bonus');
});
test('reward restores first empty slot, stays locked until consumed; ordinary hits cannot restore spent life',()=>{
 for(const n of [0,3,5]){const g=new ctx.OrbitGame(()=>0);g.start();g.hits=60;g.lives.forEach((l,i)=>l.state=i<n?'active':'spent');g.spawn();hit(g,'bonus');assert.equal(g.rewardSlot,n);assert.equal(g.lives[n].state,'active');g.advance(g.transition);assert.notEqual(g.target.color,'bonus');for(let i=0;i<=n;i++){g.tap();if(i<n){g.advance(g.transition);assert.notEqual(g.target.color,'bonus');}}assert.equal(g.rewardSlot,null);g.advance(g.transition);assert.equal(g.target.color,'bonus');}
});
test('full rack reward lights seventh shield, spent before the six lives; reset clears reward',()=>{
 const g=new ctx.OrbitGame(()=>0);g.start();g.hits=60;g.lives.forEach(l=>l.state='active');g.spawn();hit(g,'bonus');assert.equal(g.bonusLife,true);g.advance(g.transition);assert.notEqual(g.target.color,'bonus');g.tap();assert.equal(g.bonusLife,false);assert.equal(g.lives.filter(l=>l.state==='active').length,6);g.advance(g.transition);assert.equal(g.target.color,'bonus');hit(g,'bonus');g.start();assert.equal(g.bonusLife,false);assert.equal(g.rewardSlot,null);
});
test('60+ reversal is exactly 50%, including very late game',()=>{
 for(const hits of [60,61,500,10000])for(const roll of [.499999,.5]){const g=make();g.start();g.hits=hits;g.direction=1;let calls=0;g.random=()=>++calls===2?roll:.5;g.spawn();assert.equal(g.reverseProbability,.5);assert.equal(g.direction,roll<.5?-1:1);}
});
test('far targets approach a full lap; occasional slow near rounds recover next round',()=>{
 const g=make();g.start();g.hits=80;
 let seq=[.5,.5,.5,.5,.5,0,.999];g.random=()=>seq.shift()??.5;g.spawn();assert.equal(g.target.far,true);assert.ok(g.target.distance>300);assert.ok(g.target.distance+g.target.width<360);assert.ok(g.target.distance/g.speed>=g.target.reaction);
 seq=[.5,.5,.5,.5,0,0,0];g.spawn();assert.equal(g.target.slow,true);const slowSpeed=g.speed;assert.ok(g.target.distance<80);assert.ok(g.target.distance/g.speed>=g.target.reaction);
 g.random=()=>.5;g.spawn();assert.equal(g.target.slow,false);assert.ok(g.speed>slowSpeed*2);
});
