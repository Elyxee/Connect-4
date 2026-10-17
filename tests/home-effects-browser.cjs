// Home effects: WebGL water, drag tilt/landing, tap particles, intro on return,
// pause during a game, reduced motion.
const assert=require('node:assert/strict');const {createServer,launch}=require('./helpers/browser.cjs');
(async()=>{const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await launch();
try{
 const page=await browser.newPage({viewport:{width:1210,height:834},serviceWorkers:'block'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForSelector('#bootScreen',{state:'hidden'});
 // Let the opening pop-in finish before touching stickers.
 await page.waitForFunction(()=>!document.getAnimations().some(a=>a.playState==='running'&&a.effect?.getKeyframes().some(k=>'scale' in k||'translate' in k)));
 const flow=()=>page.locator('#homeFlow').getAttribute('data-motion');
 assert.equal(await flow(),'running');
 // Drag the controller: it tilts and lifts while moving, then lands upright where dropped.
 const h=await page.locator('.home__controller').boundingBox();
 await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();
 for(let i=1;i<=10;i++){await page.mouse.move(h.x+h.width/2-i*18,h.y+h.height/2+i*4);await page.waitForTimeout(16);}
 const during=await page.locator('.home__controller').evaluate(e=>({rotate:e.style.rotate,scale:getComputedStyle(e).scale,dragging:e.classList.contains('is-dragging')}));
 await page.mouse.up();await page.waitForTimeout(600);
 const after=await page.locator('.home__controller').evaluate(e=>({rotate:e.style.rotate,translate:e.style.translate}));
 assert.ok(during.dragging&&parseFloat(during.rotate)<0&&during.scale==='1.06',JSON.stringify(during));
 assert.equal(after.rotate,'');assert.ok(after.translate.startsWith('-180'),after.translate);
 // Taps on stickers, buttons and paper spawn particles; nothing throws.
 for(const sel of ['.home__chip-red','.home__bulb','.home__controller','.home__star-left','.home__burst','.home__bubble','.home__bolt','.home__logo','.home__swan','.home__new-rays-left']){
   const b=await page.locator(sel).boundingBox();await page.mouse.click(b.x+b.width/2,b.y+b.height/2);await page.waitForTimeout(60);}
 await page.mouse.click(620,80);await page.waitForTimeout(60);
 const lit=await page.locator('.home__fx').evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n;});
 assert.ok(lit>500,'particles drawn: '+lit);
 // Game: the water pauses; back home it resumes and the stickers pop in again.
 await page.click('#home-new');await page.waitForSelector('#cloudTransition',{state:'hidden'});
 assert.equal(await flow(),'paused');
 await page.evaluate(()=>{const original=homeFx.intro;window.__intro=[];homeFx.intro=(o)=>{original(o);window.__intro.push(document.getAnimations().filter(a=>a.effect?.target?.classList?.contains('home__piece')&&a.effect.getKeyframes().some(k=>'scale' in k||'translate' in k)).length);};});
 await page.click('#btnHome');await page.waitForTimeout(200);await page.waitForSelector('#cloudTransition',{state:'hidden'});
 const intro=(await page.evaluate(()=>window.__intro))[0];
 assert.equal(await flow(),'running');assert.ok(intro>10,'intro animations: '+intro);
 assert.equal(await page.locator('.home__controller').evaluate(e=>e.style.translate),'','drags reset after a game');
 // Reduced motion: still image, no intro, no particles.
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(200);
 assert.equal(await flow(),'paused');
 assert.deepEqual(errors,[]);
 console.log('PASS: drag tilt/lift and upright landing, particles on all stickers, buttons and paper, water pauses in game and resumes, return intro, drags reset, reduced motion, no errors.');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
