'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {createApp,loadBricks}=require('../apps/ybr-player/server');
const {createInteractionStore,subjectFor}=require('../apps/ybr-player/interactions');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.YBR_BROWSER_DEPS||'/tmp/ybr-browser']}));
async function main(){
 if(!process.env.CI)throw Error('Run this regression in disposable CI.');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-continuous-')),file=path.join(dir,'interactions.ndjson');
 const roadGateway={ready:async()=>({ready:false}),list:async()=>({status:{ready:false},tracks:[]}),track:async()=>null};
 const {server}=createApp({accounts:{artist:'fixture-artist'},interactionFile:file,roadGateway,studioLibrary:{list:()=>[],get:()=>null},demoAutoLogin:'artist'});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});let page;
 try{
  page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>document.getElementById('signedInAs').textContent.startsWith('Signed in as artist'));
  assert.equal(await page.locator('#audio').evaluate(a=>a.paused&&!a.src),true,'Login does not autoplay');
  const playing=id=>page.waitForFunction(id=>document.querySelector('.track-row.active')?.dataset.brickId===id&&!document.getElementById('audio').paused,id);
  const finish=()=>page.locator('#audio').evaluate(a=>{a.currentTime=a.duration-.12;});
  await page.locator('[data-brick-id="BRK-AUD-001"] .track-action').click();await playing('BRK-AUD-001');
  await page.waitForFunction(()=>Number.isFinite(document.getElementById('audio').duration));await finish();await playing('BRK-AUD-002');
  await page.locator('#continuousPlay').click();assert.equal(await page.locator('#continuousPlay').getAttribute('aria-pressed'),'false');
  await finish();await page.waitForFunction(()=>document.getElementById('audio').ended);
  assert.equal(await page.locator('.track-row.active').getAttribute('data-brick-id'),'BRK-AUD-002');
  await page.locator('#continuousPlay').click();await page.locator('#playPause').click();await playing('BRK-AUD-002');await finish();await playing('BRK-AUD-001');
  await page.locator('#playPause').click();
  await page.locator('#interactionCaptureStatus').filter({hasText:'capture active'}).waitFor();
  await page.getByRole('button',{name:'Request interaction snapshot',exact:true}).click();
  await page.locator('#interactionStats').filter({hasText:'reported starts'}).waitFor();
  const snap=await page.evaluate(async()=>await(await fetch('/api/bricks/BRK-AUD-001/interactions')).json());
  assert.ok(snap.counters.reportedStarts>=2);assert.ok(snap.counters.endedReports>=1);
  const store=createInteractionStore({file});assert.deepEqual(store.snapshot(subjectFor(loadBricks().get('BRK-AUD-001'))),snap);
  // Cancel an in-flight end-to-next transition using the continuous-play control.
  let pending,release;const held=new Promise(r=>release=r);const notified=new Promise(r=>pending=r);
  await page.route('**/api/bricks/BRK-AUD-002/authorize',async route=>{pending();await held;await route.continue();});
  await page.locator('#playPause').click();await playing('BRK-AUD-001');await finish();await notified;
  await page.locator('#continuousPlay').click();release();await page.waitForTimeout(350);
  assert.equal(await page.locator('#audio').evaluate(a=>a.paused),true,'Disabling continuation cancels its pending grant');
  await page.reload();await page.waitForFunction(()=>document.getElementById('signedInAs').textContent.startsWith('Signed in as artist'));
  assert.equal(await page.locator('#continuousPlay').getAttribute('aria-pressed'),'false','Preference survives reload');
  assert.equal(await page.locator('#audio').evaluate(a=>a.paused&&!a.src),true);
  const out=path.resolve(__dirname,'../.road-local/player-browser-results');fs.mkdirSync(out,{recursive:true});
  await page.screenshot({path:path.join(out,'player-continuous-interactions.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('CONTINUOUS / INTERACTIONS PASS: actual authorized audio end-to-next/wrap, off switch, pending-grant cancellation, no login autoplay, persistent aggregate collection and role-gated API.');
 }finally{await browser.close();await new Promise(r=>{server.closeAllConnections();server.close(r);});fs.rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
