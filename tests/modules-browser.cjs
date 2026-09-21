const {chromium}=require('playwright');const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out='/private/tmp/c4-module-v31-shots';fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://localhost'),p=path.join(root,url.pathname==='/'?'index.html':url.pathname);const data=fs.readFileSync(p);res.writeHead(200,{'Content-Type':{'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.ttf':'font/ttf'}[path.extname(p)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});try{
const page=await browser.newPage({viewport:{width:1194,height:834},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForSelector('#bootScreen',{state:'hidden'});await page.click('#home-new');await page.waitForSelector('#cloudTransition',{state:'hidden'});await page.clock.install();
await page.evaluate(()=>{const orig=OrbitGame.prototype.start;OrbitGame.prototype.start=function(){window.testOrbit=this;this.random=()=>.5;return orig.call(this);};const move=GameState.prototype.applyMove;GameState.prototype.applyMove=function(c){window.testBoard=this;return move.call(this,c);};});
const shot=async name=>{await page.clock.runFor(450);await page.waitForTimeout(500);await page.screenshot({path:path.join(out,name+'.png')});};
const drop=async col=>{const b=await page.locator('#boardCanvas').boundingBox();await page.mouse.click(b.x+(col+.5)*b.width/7,b.y+b.height*.8);await page.clock.runFor(400);};
const mode=()=>page.locator('#bottomModule').getAttribute('data-module');
assert.equal(await mode(),'picker');assert.equal(await page.locator('[data-enter-mode="clock"]').isVisible(),true);await shot('01-clock-cover');
// Untimed play and variations still work outside Game Clock.
await drop(0);await page.click('#btnPrev');await page.clock.runFor(200);await drop(1);
assert.equal(await page.evaluate(()=>testBoard.root.children.length),2);
await page.click('[data-enter-mode="clock"]');assert.equal(await page.locator('.clock__new-board').isVisible(),true);assert.equal(await page.locator('[data-clock-preset="5+5"]').isDisabled(),true);
await page.click('.clock__new-board button');assert.equal(await mode(),'clock');assert.equal(await page.locator('#stepNow').textContent(),'0');
await shot('02-clock-settings');await drop(0);assert.equal(await page.locator('#stepNow').textContent(),'0');
await page.click('[data-clock-preset="5+5"]');await drop(0);assert.equal(await page.locator('#gameClock').getAttribute('data-state'),'yellow-active');
await page.click('.module__back');await page.click('[data-select-mode="1"]');await page.clock.runFor(450);await shot('03-orbit-cover');
// Swipe back and forth must not accidentally enter the logo beneath the gesture.
let b=await page.locator('.module__cover').boundingBox();
await page.mouse.move(b.x+b.width*.3,b.y+b.height*.5);await page.mouse.down();await page.mouse.move(b.x+b.width*.7,b.y+b.height*.5,{steps:8});await page.mouse.up();await page.clock.runFor(500);assert.equal(await mode(),'picker');
assert.equal(await page.locator('.module__slide--clock').getAttribute('aria-hidden'),'false');
await page.mouse.move(b.x+b.width*.7,b.y+b.height*.5);await page.mouse.down();await page.mouse.move(b.x+b.width*.3,b.y+b.height*.5,{steps:8});await page.mouse.up();await page.clock.runFor(500);assert.equal(await mode(),'picker');
await page.click('[data-enter-mode="orbit"]');await shot('04-orbit-ready');
await page.click('#btnPrev');await page.clock.runFor(200);await drop(4);assert.equal(await page.locator('#stepNow').textContent(),'0');
await page.click('.orbit__action');assert.equal(await page.locator('.orbit').getAttribute('data-status'),'running');
// Click the panel and controller against real hit detection, at the centre of a target.
// Aim is time-sensitive: do not wait for the decorative controller bounce to settle.
const aim=()=>page.evaluate(()=>{const t=testOrbit.target;if(!t)return; t.travel=t.distance+t.width/2;testOrbit.angle=t.angle;});
await aim();b=await page.locator('.orbit').boundingBox();await page.mouse.click(b.x+b.width*.65,b.y+b.height*.5);assert.equal(await page.evaluate(()=>testOrbit.hits),1);
for(let i=0;i<4;i++){await page.clock.runFor(200);await aim();await page.locator('.decoGamepad').click({force:true});}
assert.equal(await page.evaluate(()=>testOrbit.hits),5);assert.equal(await page.evaluate(()=>testOrbit.lives[0].state),'active');
await shot('05-orbit-playing');await page.click('.module__back');assert.equal(await page.evaluate(()=>testOrbit.status),'paused');
const elapsed=await page.evaluate(()=>testOrbit.elapsed);await page.clock.fastForward(1500);assert.equal(await page.evaluate(()=>testOrbit.elapsed),elapsed);
await page.click('[data-enter-mode="orbit"]');assert.equal(await page.locator('.orbit__action').textContent(),'Resume');await page.click('.orbit__action');
await page.clock.runFor(200);await page.evaluate(()=>{testOrbit.target.travel=0;});await page.locator('.decoGamepad').click({force:true});assert.equal(await page.evaluate(()=>testOrbit.lives[0].state),'spent');
await page.clock.runFor(250);await page.evaluate(()=>{testOrbit.target.travel=0;});await page.locator('.decoGamepad').click({force:true});assert.equal(await page.evaluate(()=>testOrbit.status),'over');await shot('06-orbit-game-over');
assert.equal(await page.locator('.orbit__action').textContent(),'Play again');await page.click('.orbit__action');assert.equal(await page.evaluate(()=>testOrbit.hits),0);assert.ok(await page.evaluate(()=>testOrbit.lives.every(l=>l.state==='ghost')));
// Background safety pauses only Orbit, not the real chess clock.
await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));assert.equal(await page.evaluate(()=>testOrbit.status),'paused');
await page.clock.fastForward(301000);assert.equal(await page.locator('#gameClock').getAttribute('data-state'),'full-red');
await page.click('.module__timed');assert.equal(await mode(),'clock');assert.equal(await page.locator('.clock__reason').textContent(),'WIN ON TIME');
await page.click('#btnNew');assert.equal(await mode(),'picker');assert.equal(await page.locator('.module__slide--clock').getAttribute('aria-hidden'),'false');
for(const viewport of [{width:834,height:1194},{width:390,height:844}]){
 await page.setViewportSize(viewport);await shot(viewport.width+'-cover');
 await page.click('[data-enter-mode="clock"]');await shot(viewport.width+'-settings');
 assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.clock__preset')].every(e=>e.scrollWidth<=e.clientWidth+1)),true);
 await page.click('.module__back');await page.click('[data-select-mode="1"]');await page.clock.runFor(450);await page.click('[data-enter-mode="orbit"]');await shot(viewport.width+'-orbit');
 await page.click('#btnNew');
}
assert.deepEqual(errors,[]);console.log('PASS: default, arrows/swipes, untimed variations, midgame clock guard, timed history lock across modes, panel/controller hits, life/spent states, pause/restart, timeout during Orbit, New reset, responsive views.');
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
