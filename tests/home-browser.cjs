const {chromium}=require('/Users/ninepiggy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),stage='/private/tmp/c4-home-check';fs.mkdirSync(stage,{recursive:true});
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html',candidate=path.join(stage,name),file=fs.existsSync(candidate)&&fs.statSync(candidate).isFile()?candidate:path.join(root,name);try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});try{
 const page=await browser.newPage({viewport:{width:1194,height:834},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(800);
 assert.equal(await page.locator('#appRoot').evaluate(e=>e.inert),true);
 await page.screenshot({path:stage+'/home-ipad.png'});
 await page.click('#home-continue');assert.match(await page.locator('#toast').textContent(),/No saved/);
 for(const size of [{width:390,height:844},{width:834,height:1194}]){await page.setViewportSize(size);await page.waitForTimeout(300);for(const id of ['home-new','home-continue','home-recent']){const b=await page.locator('#'+id).boundingBox();assert(b.x>=0&&b.x+b.width<=size.width&&b.y>=0&&b.y+b.height<=size.height);}await page.screenshot({path:stage+`/home-${size.width}.png`});}
 await page.setViewportSize({width:1194,height:834});await page.click('#home-new');await page.waitForTimeout(900);
 assert.equal(await page.locator('#homeScreen').isVisible(),false);assert.equal(await page.locator('#appRoot').evaluate(e=>e.inert),false);assert.equal(await page.locator('#bottomModule').getAttribute('data-module'),'picker');assert.equal(await page.locator('#stepNow').textContent(),'0');
 let b=await page.locator('#hitLayer').boundingBox();await page.mouse.click(b.x+b.width*.5,b.y+b.height*.8);await page.waitForTimeout(650);assert.equal(await page.locator('#stepNow').textContent(),'1');
 await page.click('#btnEdit');assert.equal(await page.locator('#appRoot').getAttribute('data-editing'),'true');await page.mouse.move(b.x+50,b.y+50);await page.mouse.down();await page.mouse.move(b.x+130,b.y+85,{steps:8});await page.mouse.up();await page.click('#btnEdit');await page.click('#btnNew');assert.equal(await page.locator('#stepNow').textContent(),'0');
 await page.screenshot({path:stage+'/game.png'});
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.appBg__img').evaluate(e=>getComputedStyle(e).animationName),'none');
 assert.deepEqual(errors,[]);console.log('PASS: home dimensions on iPad/phone, placeholders, New Game transition, defaults, legal move, drawing, reset, reduced motion and no JS errors.');
 }finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
