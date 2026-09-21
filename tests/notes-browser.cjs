const {chromium}=require('playwright');const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out='/private/tmp/c4-notes-v32-shots';fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://localhost'),p=path.join(root,url.pathname==='/'?'index.html':url.pathname);const data=fs.readFileSync(p);res.writeHead(200,{'Content-Type':{'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.ttf':'font/ttf'}[path.extname(p)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});try{
const page=await browser.newPage({viewport:{width:1194,height:834},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForSelector('#bootScreen',{state:'hidden'});await page.click('#home-new');await page.waitForSelector('#cloudTransition',{state:'hidden'});await page.clock.install();
const analysis=page.locator('.analysis');const sheet=()=>analysis.getAttribute('data-page');const editing=()=>analysis.getAttribute('data-editing');
const ink=async id=>page.locator(id).evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n;});
const bitmap=id=>page.locator(id).evaluate(c=>c.toDataURL());
const stroke=async(id,y=.4)=>{const b=await page.locator(id).boundingBox();await page.mouse.move(b.x+b.width*.2,b.y+b.height*y);await page.mouse.down();await page.mouse.move(b.x+b.width*.45,b.y+b.height*(y+.05),{steps:8});await page.mouse.move(b.x+b.width*.8,b.y+b.height*y,{steps:8});await page.mouse.up();};
const swipe=async(right,header=false)=>{header=header || await editing()==='true';const b=await page.locator(header?'.analysis__header':'.analysis__pages').boundingBox();const x=right?b.x+b.width*.2:b.x+b.width-8;const end=right?b.x+b.width*.8:b.x+b.width*.2;await page.mouse.move(x,b.y+b.height*.45);await page.mouse.down();await page.mouse.move(end,b.y+b.height*.45,{steps:10});await page.mouse.up();await page.clock.runFor(500);await page.waitForTimeout(300);};
const shot=async name=>{await page.waitForTimeout(350);const r=await analysis.boundingBox();await page.screenshot({path:path.join(out,name+'.png'),clip:{x:Math.max(0,r.x-6),y:r.y,width:r.width+12,height:r.height+65}});};
assert.equal(await sheet(),'moves');assert.equal(await editing(),'false');assert.equal(await page.locator('#assistive,#assistivePanel,#toolFinger,#sizeSlider,.swatch').count(),0);
await page.click('#btnEdit');assert.equal(await editing(),'true');assert.equal(await page.locator('#btnNew').isVisible(),false);assert.equal(await page.locator('#btnEraser').isVisible(),true);
assert.equal(await page.locator('#btnEdit').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 210, 30)');
await stroke('#noteCanvas');assert.ok(await ink('#noteCanvas')>100);const boardNote=await bitmap('#noteCanvas');assert.equal(await page.locator('#stepNow').textContent(),'0');
await page.click('#btnNoteUndo');await page.waitForTimeout(50);assert.equal(await ink('#noteCanvas'),0);await page.click('#btnNoteRedo');await page.waitForTimeout(50);assert.equal(await bitmap('#noteCanvas'),boardNote);
await page.click('#btnEraser');assert.equal(await page.locator('#btnEraser').getAttribute('aria-pressed'),'true');await stroke('#noteCanvas');assert.ok(await ink('#noteCanvas')<100);await page.click('#btnNoteUndo');await page.waitForTimeout(50);assert.equal(await bitmap('#noteCanvas'),boardNote);
await swipe(false);assert.equal(await sheet(),'notes');assert.equal(await editing(),'true');assert.equal(await page.locator('.analysis__moves').getAttribute('inert'),'');assert.equal(await ink('#paperCanvas'),0);
await stroke('#paperCanvas');assert.equal(await sheet(),'notes');assert.ok(await ink('#paperCanvas')>100);const paperNote=await bitmap('#paperCanvas');assert.equal(await bitmap('#noteCanvas'),boardNote);await shot('notes-page');
// Short hold displays progress, then cancels without clearing.
let b=await page.locator('#btnEraser').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.clock.runFor(1400);
const progress=await page.locator('#btnEraser').evaluate(e=>parseFloat(e.style.getPropertyValue('--hold')));assert.ok(progress>.4&&progress<.6);await shot('clear-progress');await page.mouse.up();assert.equal(await bitmap('#paperCanvas'),paperNote);
// Full 3s hold only clears paper and is undoable. The post-hold click must not toggle tool.
const tool=await page.locator('#btnEraser').getAttribute('aria-pressed');await page.mouse.down();await page.clock.runFor(2900);assert.equal(await bitmap('#paperCanvas'),paperNote);await page.clock.runFor(200);assert.equal(await ink('#paperCanvas'),0);await page.mouse.up();assert.equal(await page.locator('#btnEraser').getAttribute('aria-pressed'),tool);assert.equal(await bitmap('#noteCanvas'),boardNote);
await page.click('#btnNoteUndo');await page.waitForTimeout(50);assert.equal(await bitmap('#paperCanvas'),paperNote);await page.click('#btnNoteRedo');await page.waitForTimeout(50);assert.equal(await ink('#paperCanvas'),0);await page.click('#btnNoteUndo');await page.waitForTimeout(50);
// Edit is a manual override, leaving the selected page alone.
await page.click('#btnEdit');assert.equal(await sheet(),'notes');assert.equal(await editing(),'false');assert.equal(await page.locator('#btnNew').isVisible(),true);
await swipe(true);assert.equal(await sheet(),'moves');assert.equal(await editing(),'false');await shot('moves-page');
// Existing node-bound annotations survive history, while the notebook stays per-game.
b=await page.locator('#boardCanvas').boundingBox();await page.mouse.click(b.x+b.width*.35,b.y+b.height*.8);await page.clock.runFor(500);assert.equal(await page.locator('#stepNow').textContent(),'1');assert.equal(await ink('#noteCanvas'),0);
await page.click('#btnPrev');await page.waitForTimeout(100);assert.equal(await bitmap('#noteCanvas'),boardNote);
await swipe(false);assert.equal(await bitmap('#paperCanvas'),paperNote);assert.equal(await editing(),'true');
// Resize preserves page content and its own undo stack.
await page.setViewportSize({width:390,height:844});await page.clock.runFor(400);await page.waitForTimeout(350);assert.ok(await ink('#paperCanvas')>100);assert.equal(await page.locator('#btnNoteUndo').isEnabled(),true);await page.locator('.dock').screenshot({path:path.join(out,'phone-dock.png')});
await page.click('#btnNoteUndo');await page.waitForTimeout(80);assert.equal(await ink('#paperCanvas'),0);await page.click('#btnNoteRedo');await page.waitForTimeout(80);assert.ok(await ink('#paperCanvas')>100);
// Header navigation is available without drawing on the paper.
await page.click('.analysis__page-toggle');assert.equal(await sheet(),'moves');assert.equal(await editing(),'false');await page.click('#btnNew');await page.waitForTimeout(100);await page.click('.analysis__page-toggle');assert.equal(await ink('#paperCanvas'),0);
assert.deepEqual(errors,[]);console.log('PASS: dock toggle, black ink, draw/erase/undo/redo, swipe auto modes and manual override, handwriting vs swipe, 3s fill/cancel/clear/undo, page isolation, node history, resize and New reset.');
}finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
