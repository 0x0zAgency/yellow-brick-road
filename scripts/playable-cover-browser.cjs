'use strict';
/** Isolated end-to-end creator -> persisted object -> listener. No wallet or chain writes. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.YBR_BROWSER_DEPS||'/tmp/ybr-browser']}));
const {createApp}=require('../apps/ybr-player/server'),{createStudioLibrary,sha256}=require('../apps/ybr-player/studio-releases');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.road-local/player-browser-results');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAIUlEQVR4nGP8f9kpxjeSgYGBgYGBMVphNgMMMDEgARQOAMDRBDMbPbpyAAAAAElFTkSuQmCC','base64');
function wav(hz){const rate=8000,frames=rate*3,bytes=Buffer.alloc(44+frames*2);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(frames*2,40);for(let i=0;i<frames;i++)bytes.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*hz/rate)*500),44+i*2);return bytes;}
const encode=(bytes,name,mime)=>({name,mime,sha256:sha256(bytes),base64:bytes.toString('base64')});
async function main(){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-cover-browser-'));let browser,player,web,page;const errors=[];let denied=false;
 try{
  const studio=createStudioLibrary({directory:path.join(tmp,'uploads')});
  const upload=(title,hz,album='')=>studio.publish({format:'ybr-studio-preview/1',audioSourceRole:'preview',consent:'share-selected-copies-with-local-player',title,album,creator:'Test musician',assets:{audio:encode(wav(hz),'preview.wav','audio/wav'),artwork:encode(png,'cover.png','image/png')},files:[{role:'preview',name:'preview.wav',sharedAs:'audio'}],bricks:[]}).brick;
  const first=upload('First sound',220,'Grouped album'),second=upload('Second sound',440,'Grouped album');
  upload('Track without an album',330);upload('Track without an album',660);
  ({server:player}=createApp({accounts:{artist:'cover-fixture'},demoAutoLogin:'artist',studioLibrary:studio,coverDirectory:path.join(tmp,'covers'),interactionFile:path.join(tmp,'interactions'),roadGateway:{list:async()=>({status:{ready:false},tracks:[]}),track:async()=>null,playerPolicy:{check:async b=>({allowed:!(denied&&b.id===second.id)})}}}));
  await new Promise(r=>player.listen(0,'127.0.0.1',r));const playerBase='http://127.0.0.1:'+player.address().port;
  // Exercise the production React bundle with the same-origin publishing proxy.
  const dist=path.join(root,'web/dist');
  web=http.createServer((req,res)=>{
   if(req.url.startsWith('/api/player-publish/')){const proxied=http.request({hostname:'127.0.0.1',port:player.address().port,path:req.url,method:req.method,headers:req.headers},up=>{res.writeHead(up.statusCode,up.headers);up.pipe(res);});proxied.on('error',()=>res.writeHead(502).end());req.pipe(proxied);return;}
   const file=path.resolve(dist,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
   if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
   res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
  });await new Promise(r=>web.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({headless:true,...(process.env.YBR_BROWSER_EXECUTABLE?{executablePath:process.env.YBR_BROWSER_EXECUTABLE}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1050}});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.walletWrites=0;window.ethereum={request:async({method})=>{if(method==='eth_accounts')return [];window.walletWrites++;throw Error('No wallet writes in this test');}};});
  await page.goto('http://127.0.0.1:'+web.address().port);
  const nav=page.getByRole('navigation',{name:'Main navigation'});
  await nav.getByRole('button',{name:'Buildings',exact:true}).click();
  await page.getByRole('heading',{name:'Your Buildings',exact:true}).waitFor();
  const uploaded=page.locator('.cas-upload-buildings');
  assert.equal(await uploaded.evaluate(el=>el.open),false,'Upload-created Buildings start collapsed');
  assert.equal(await page.locator('.cas-created [data-building-id]').count(),0,'Only manually created Buildings belong in the main list');
  assert.equal(await page.getByText('Reference Building examples',{exact:true}).count(),0);
  await uploaded.locator('summary').click();assert.equal(await uploaded.locator('[data-building-id]').count(),2,'Album grouping and fallback track grouping each combine two uploads');
  assert.match(await uploaded.textContent(),/Grouped album.*Album title group · 2 audio Bricks/s);
  assert.match(await uploaded.textContent(),/Track without an album.*Track title group · 2 audio Bricks/s);
  await uploaded.locator('summary').click();
  await page.getByRole('button',{name:'New audio Building',exact:false}).click();
  await page.getByRole('heading',{name:'Create an audio Building',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Commit Playable Cover',exact:true}).count(),0,'Locked before an audio Building exists');
  await page.getByLabel('Building title',{exact:true}).fill('Immersive album');await page.getByRole('checkbox',{name:'First sound Test musician · Grouped album',exact:true}).check();
  assert.equal(await page.getByRole('button',{name:'Create Building & unlock Cover Art Studio',exact:true}).isDisabled(),true,'A release type must be chosen');
  assert.deepEqual(await page.getByLabel('What kind of audio Building?',{exact:true}).locator('option').allTextContents(),['Choose a release type','Single','EP','Album','Compilation']);
  await page.getByLabel('What kind of audio Building?',{exact:true}).selectOption('Album');
  await page.getByRole('button',{name:'Create Building & unlock Cover Art Studio',exact:true}).click();
  await page.getByRole('heading',{name:'Place your audio pins.',exact:true}).waitFor();
  assert.match(await page.locator('.cas-created').textContent(),/Immersive album.*Album · 1 audio Brick/s);
  await nav.getByRole('button',{name:'Buildings',exact:true}).click();
  fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'buildings-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=1);await page.screenshot({path:path.join(out,'buildings-mobile.png'),fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Buildings fit a mobile viewport');
  await page.setViewportSize({width:1440,height:1050});await page.locator('.cas-created [data-building-id]').click();
  await page.getByRole('heading',{name:'Place your audio pins.',exact:true}).waitFor();
  await page.getByLabel('Playable Cover title',{exact:true}).fill('Album you can touch');
  await page.getByLabel('Audio to add',{exact:true}).selectOption(second.id);await page.getByRole('button',{name:'Add audio pin',exact:false}).click();
  assert.equal(await page.locator('.cas-pin').count(),2,'Can add any uploaded audio beyond the Building’s first member');
  const stage=page.locator('.cas-stage');await stage.scrollIntoViewIfNeeded();const box=await stage.boundingBox(),pin=page.getByRole('button',{name:'Move audio pin 1: First sound',exact:true});
  const original=await pin.boundingBox();await page.mouse.move(original.x+original.width/2,original.y+original.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width*.45,box.y+box.height*.60,{steps:12});await page.mouse.up();
  let x=Number(await page.getByLabel('Pin 1 x percent',{exact:true}).inputValue()),y=Number(await page.getByLabel('Pin 1 y percent',{exact:true}).inputValue());assert.ok(x>=32&&x<=38&&y>=47&&y<=53,`Drag moved pin to ${x}, ${y}`);
  await pin.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Shift+ArrowDown');
  assert.equal(Number(await page.getByLabel('Pin 1 x percent',{exact:true}).inputValue()),x+1);assert.equal(Number(await page.getByLabel('Pin 1 y percent',{exact:true}).inputValue()),y+5);
  await page.getByLabel('Pin 1 width percent',{exact:true}).fill('30');await page.getByLabel('Pin 1 height percent',{exact:true}).fill('25');
  await page.getByRole('button',{name:'Preview cover',exact:true}).click();await page.getByRole('button',{name:'Stop preview & edit pins',exact:true}).waitFor();await page.getByRole('button',{name:'Stop preview & edit pins',exact:true}).click();
  await nav.getByRole('button',{name:'Settings',exact:true}).click();await nav.getByRole('button',{name:'Cover Art Studio',exact:true}).click();
  await page.getByRole('button',{name:'Commit Playable Cover',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.cas-commit button')?.disabled);
  assert.equal(await page.getByLabel('Playable Cover title',{exact:true}).inputValue(),'Album you can touch','Navigation preserves the draft');
  fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'playable-cover-creator-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'Commit Playable Cover',exact:true}).click();await page.getByRole('link',{name:'Open Playable Cover in Player',exact:false}).waitFor();
  const saved=JSON.parse(fs.readFileSync(path.join(tmp,'covers',fs.readdirSync(path.join(tmp,'covers')).find(n=>n.startsWith('COVER-'))),'utf8'));
  assert.ok(saved.layout.regions[0].x>.3);assert.equal(saved.layout.regions[0].width,.3);assert.equal(saved.layout.regions[0].height,.25);
  const listener=await context.newPage();listener.on('pageerror',e=>errors.push(e.message));await listener.goto(playerBase+'/#release='+saved.id);
  const row=listener.locator('[data-brick-id="'+saved.id+'"]');await row.waitFor();assert.equal(await row.locator('.track-tag').textContent(),'Playable Cover');
  assert.equal(await listener.getByRole('button',{name:'Edit regions',exact:true}).count(),0);assert.equal(await listener.getByRole('button',{name:'Add sound',exact:true}).count(),0);
  await row.locator('.track-action').click();await listener.waitForFunction(()=>window.YBRAudiocover?.playing===true);
  const marker=listener.locator('.artwork-region').first();assert.ok(Math.abs(parseFloat(await marker.evaluate(e=>e.style.left))/100-saved.layout.regions[0].x)<.001);
  assert.equal(await listener.locator('#audio').evaluate(a=>a.paused&&!a.src),true,'Cover uses independent authorized streams, not a fake merged file');
  await listener.locator('#playPause').click();await listener.waitForFunction(()=>window.YBRAudiocover?.playing===false);
  await listener.locator('#playPause').click();await listener.waitForFunction(()=>window.YBRAudiocover?.playing===true);
  assert.equal(await listener.getByRole('button',{name:'Request interaction snapshot',exact:true}).isDisabled(),true,'Cover interactions belong to the source tracks');
  await listener.screenshot({path:path.join(out,'playable-cover-listener-desktop.png'),fullPage:true});
  await listener.locator('[data-brick-id="'+first.id+'"] .track-action').click();
  await listener.waitForFunction(()=>!document.getElementById('audio').paused&&!window.YBRAudiocover.active);
  assert.equal(await listener.locator('#artworkPlayer').isVisible(),false,'Normal tracks do not open a cover editor');
  await row.locator('.track-action').click();await listener.waitForFunction(()=>window.YBRAudiocover.playing);
  await page.reload();await nav.getByRole('button',{name:'Tools',exact:true}).click();await nav.getByRole('button',{name:'Cover Art Studio',exact:true}).click();
  assert.equal(await page.locator('.cas-upload-buildings').evaluate(el=>el.open),false,'Automatic groups stay collapsed after reload');
  assert.match(await page.locator('.cas-created').textContent(),/Immersive album.*Album · 1 audio Brick/s,'The chosen type survives reload');
  await page.getByRole('button',{name:'Edit copy',exact:true}).click();assert.equal(await page.getByLabel('Pin 1 width percent',{exact:true}).inputValue(),'30','Saved geometry can be reopened for editing');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'playable-cover-creator-mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No mobile horizontal overflow');
  denied=true;await listener.locator('#refreshLibrary').click();await row.waitFor({state:'detached'});assert.equal(await listener.evaluate(()=>window.YBRAudiocover.active),false,'Permission change stops the whole cover');
  assert.equal(await page.evaluate(()=>window.walletWrites),0);assert.deepEqual(errors,[]);
  console.log('PLAYABLE COVER PASS: creator-only Building list, collapsed upload groups, album/track grouping, required persistent release type, Building unlock, any uploaded sound, drag and keyboard movement, resizing, preview, draft retention, commit, saved layout reload, separate Player item, independent playback, permission revocation and mobile layout.');
 }catch(e){if(page){fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'playable-cover-failure.png'),fullPage:true}).catch(()=>{});}console.error('Browser errors:',errors);throw e;}
 finally{await browser?.close();for(const server of [web,player])if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}fs.rmSync(tmp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
