const path=require('node:path'),assert=require('node:assert/strict');
const {createServer,launch,shotDir}=require('./helpers/browser.cjs');
const stage=shotDir('home'),server=createServer();
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await launch();try{
 const page=await browser.newPage({viewport:{width:1194,height:834},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForSelector('#bootScreen',{state:'hidden'});await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('#appRoot').evaluate(e=>e.inert),true);
 await page.screenshot({path:stage+'/home-ipad.png'});
 await page.click('#home-continue');assert.match(await page.locator('#toast').textContent(),/Start a New Game first/);
 for(const size of [{width:390,height:844},{width:834,height:1194}]){await page.setViewportSize(size);await page.waitForTimeout(300);for(const id of ['home-new','home-continue','home-recent']){const b=await page.locator('#'+id).boundingBox();assert(b.x>=0&&b.x+b.width<=size.width&&b.y>=0&&b.y+b.height<=size.height);}await page.screenshot({path:stage+`/home-${size.width}.png`});}
 await page.setViewportSize({width:1194,height:834});await page.click('#home-new');await page.waitForSelector('#cloudTransition',{state:'hidden'});
 assert.equal(await page.locator('#homeScreen').isVisible(),false);assert.equal(await page.locator('#appRoot').evaluate(e=>e.inert),false);assert.equal(await page.locator('#bottomModule').getAttribute('data-module'),'picker');assert.equal(await page.locator('#stepNow').textContent(),'0');
 let b=await page.locator('#hitLayer').boundingBox();await page.mouse.click(b.x+b.width*.5,b.y+b.height*.8);await page.waitForTimeout(650);assert.equal(await page.locator('#stepNow').textContent(),'1');
 await page.click('#btnEdit');assert.equal(await page.locator('#appRoot').getAttribute('data-editing'),'true');await page.mouse.move(b.x+50,b.y+50);await page.mouse.down();await page.mouse.move(b.x+130,b.y+85,{steps:8});await page.mouse.up();await page.click('#btnEdit');await page.click('#btnNew');assert.equal(await page.locator('#stepNow').textContent(),'0');
 await page.screenshot({path:stage+'/game.png'});
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.home__chip-red').evaluate(e=>getComputedStyle(e).animationName),'none');const settled=await page.waitForFunction(()=>{const c=document.getElementById('backgroundFlow');return c.dataset.renderer!=='webgl'||c.dataset.motion==='paused';},null,{polling:50,timeout:5000}).then(()=>true,()=>false);assert.ok(settled,'background keeps animating under reduced motion');
 assert.deepEqual(errors,[]);console.log('PASS: home dimensions on iPad/phone, placeholders, New Game transition, defaults, legal move, drawing, reset, reduced motion and no JS errors.');
 }finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
