const path=require('node:path'),assert=require('node:assert/strict');
const {createServer,launch,shotDir}=require('./helpers/browser.cjs');
const out=shotDir('workspace-ink'),server=createServer();
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await launch();try{
const page=await browser.newPage({viewport:{width:1194,height:834},hasTouch:true,serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForSelector('#bootScreen',{state:'hidden'});await page.click('#home-new');await page.waitForSelector('#cloudTransition',{state:'hidden'});await page.clock.install();

const ink=async id=>page.locator(id).evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n;});
const bitmap=id=>page.locator(id).evaluate(c=>c.toDataURL());
const draw=async(x,y,dx,dy=0)=>{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:14});await page.mouse.up();};
const cd=await page.context().newCDPSession(page);
const touchSwipe=async(selector,right)=>{const b=await page.locator(selector).boundingBox();const x=right?b.x+b.width*.2:b.x+b.width*.8,y=b.y+b.height*.5,dx=(right?1:-1)*b.width*.6;
 await cd.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
 for(let i=1;i<=10;i++)await cd.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/10,y,id:1}]});
 await cd.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.clock.runFor(400);await page.waitForTimeout(320);
};
let b=await page.locator('#boardCanvas').boundingBox();for(const col of [0,1,2]){await page.mouse.click(b.x+(col+.5)*b.width/7,b.y+b.height*.8);await page.clock.runFor(500);}
assert.equal(await page.locator('#stepNow').textContent(),'3');await page.click('#btnEdit');
// Touching/drawing directly over historical move tokens never navigates.
await page.locator('.timelinePly').first().hover();assert.equal(await page.locator('.timelinePly').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
await page.locator('.timelinePly').first().click();assert.equal(await page.locator('#stepNow').textContent(),'3');
b=await page.locator('#timeline').boundingBox();await draw(b.x+b.width*.25,b.y+25,b.width*.5,30);
assert.equal(await page.locator('.analysis').getAttribute('data-page'),'moves');assert.equal(await page.locator('#stepNow').textContent(),'3');assert.ok(await ink('#noteCanvas')>200);
// All lower-right entry buttons, arrows and controller are inert in Edit.
for(const selector of ['[data-enter-mode="clock"]','[data-select-mode="1"]','.decoGamepad']){
 const rect=await page.locator(selector).boundingBox();await page.mouse.click(rect.x+rect.width/2,rect.y+rect.height/2);
}
assert.equal(await page.locator('#bottomModule').getAttribute('data-module'),'picker');
assert.equal(await page.locator('.module__slide--orbit').getAttribute('aria-hidden'),'true');
await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('#stepNow').textContent(),'3');
const movesInk=await bitmap('#noteCanvas');assert.equal(await page.locator('#btnPrev').isDisabled(),true);await page.click('#btnEdit');await page.click('#btnPrev');await page.waitForTimeout(80);assert.equal(await ink('#noteCanvas'),0);await page.click('#btnNext');await page.waitForTimeout(80);assert.equal(await bitmap('#noteCanvas'),movesInk);await page.click('#btnEdit');
// A real touch swipe on the header enters Notes despite edit mode.
await touchSwipe('.analysis__header',false);assert.equal(await page.locator('.analysis').getAttribute('data-page'),'notes');assert.equal(await page.locator('.analysis').getAttribute('data-editing'),'true');
assert.equal(await ink('#paperCanvas'),0);
// One continuous stroke crosses the board, gap and Analysis region.
b=await page.locator('#appRoot').boundingBox();await draw(b.x+b.width*.12,b.y+b.height*.4,b.width*.76,30);assert.ok(await ink('#paperCanvas')>500);assert.equal(await page.locator('#stepNow').textContent(),'3');
const fullInk=await bitmap('#paperCanvas');await page.click('#btnNoteUndo');await page.waitForTimeout(80);assert.equal(await ink('#paperCanvas'),0);await page.click('#btnNoteRedo');await page.waitForTimeout(80);assert.equal(await bitmap('#paperCanvas'),fullInk);
// Body ink in the module does not switch a mode or place a chip.
b=await page.locator('#bottomModule').boundingBox();await draw(b.x+b.width*.12,b.y+b.height*.75,b.width*.55,0);assert.equal(await page.locator('#bottomModule').getAttribute('data-module'),'picker');assert.equal(await page.locator('#stepNow').textContent(),'3');
await page.screenshot({path:path.join(out,'full-workspace-ink.png')});
// Controls work during editing and leaving edit restores history clicks.
await page.click('#btnEdit');assert.equal(await page.locator('.analysis').getAttribute('data-editing'),'false');await touchSwipe('.analysis__header',true);assert.equal(await page.locator('.analysis').getAttribute('data-page'),'moves');
await page.locator('.timelinePly').first().click();await page.waitForTimeout(80);assert.equal(await page.locator('#stepNow').textContent(),'1');
// Actual finger swipe anywhere in the move page enters Notes; header swipe returns.
await touchSwipe('#timeline',false);assert.equal(await page.locator('.analysis').getAttribute('data-page'),'notes');assert.ok(await ink('#paperCanvas')>500);await touchSwipe('.analysis__header',true);assert.equal(await page.locator('.analysis').getAttribute('data-page'),'moves');assert.equal(await page.locator('.analysis').getAttribute('data-editing'),'false');
// Restore regular module actions on leaving edit; presets cannot be activated
// even with a programmatic click while editing, but work afterwards.
await page.click('#btnNew');await page.click('[data-enter-mode="clock"]');await page.click('#btnEdit');
await page.evaluate(()=>document.querySelector('[data-clock-preset="5+5"]').click());
assert.equal(await page.locator('#gameClock').getAttribute('data-status'),'setup');
await page.click('#btnEdit');await page.click('[data-clock-preset="5+5"]');
assert.equal(await page.locator('#gameClock').getAttribute('data-status'),'running');
assert.deepEqual(errors,[]);console.log('PASS: edit-mode move tokens never navigate, annotations follow node, full-workspace continuous ink, undo/redo, module input isolation, real touch swipes in both directions, controls and restored history clicks.');
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
