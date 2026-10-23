'use strict';
/** Chromium exercises ordinary demo sessions on an isolated loopback test server. */
const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs');
const {createApp}=require('../apps/ybr-player/server');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.YBR_BROWSER_DEPS||'/tmp/ybr-browser']}));
async function main(){
 if(!process.env.CI)throw Error('Run this browser regression in disposable CI.');
 let clock=Date.now();
 const roadGateway={ready:async()=>({ready:false}),list:async()=>({status:{ready:false},tracks:[]}),track:async()=>null};
 const {server}=createApp({accounts:{artist:'fixture-artist',listener:'fixture-listener'},now:()=>clock,roadGateway,studioLibrary:{list:()=>[],get:()=>null},demoAutoLogin:'artist'});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],posts=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',req=>{if(req.method()==='POST'&&req.url().includes('/api/session'))posts.push({url:req.url(),body:req.postData()});});
  await page.goto('http://127.0.0.1:'+server.address().port);
  const artist=()=>page.waitForFunction(()=>document.getElementById('signedInAs').textContent==='Signed in as artist · local demo');
  await artist();
  await page.locator('.track-row[data-brick-id="BRK-AUD-002"]').waitFor();
  assert.equal(await page.locator('#loginOverlay').isVisible(),false);
  assert.ok(posts.some(p=>p.url.endsWith('/api/session/demo')));
  assert.ok(!JSON.stringify(posts).includes('fixture-artist'));
  assert.equal(await page.locator('#audio').evaluate(el=>el.paused&&!el.getAttribute('src')),true);
  const cookie=(await context.cookies()).find(c=>c.name==='ybr_session');assert.ok(cookie.httpOnly);assert.equal(cookie.sameSite,'Strict');
  clock+=3600001;await page.reload();await artist();
  const out=path.resolve(__dirname,'../.road-local/player-browser-results');fs.mkdirSync(out,{recursive:true});
  await page.screenshot({path:path.join(out,'artist-auto-login.png'),fullPage:true});
  await page.getByRole('button',{name:'Switch account',exact:false}).click();
  await page.locator('#loginOverlay').waitFor({state:'visible'});await page.reload();
  await page.locator('#demoArtistLogin').waitFor({state:'visible'});
  assert.equal(await page.locator('#signedInAs').textContent(),'Not connected');
  await page.locator('#demoArtistLogin').click();await artist();
  await page.locator('#logout').click();
  await page.locator('#username').fill('listener');await page.locator('#password').fill('fixture-listener');
  await page.getByRole('button',{name:'Authorize session',exact:false}).click();
  await page.waitForFunction(()=>document.getElementById('signedInAs').textContent.startsWith('Signed in as listener'));
  assert.equal(await page.locator('.track-row[data-brick-id="BRK-AUD-002"]').count(),0);
  await page.reload();await page.waitForFunction(()=>document.getElementById('signedInAs').textContent.startsWith('Signed in as listener'));
  clock+=3600001;await page.reload();await page.locator('#loginOverlay').waitFor({state:'visible'});
  assert.equal(await page.locator('#signedInAs').textContent(),'Not connected','Expired listener is not promoted to artist');
  assert.deepEqual(errors,[]);
  console.log('ARTIST AUTO-LOGIN BROWSER PASS: fresh artist session, no password exposure/autoplay, session renewal, explicit logout/resume, manual listener and expiry isolation. Isolated test server; launcher selection is checked separately.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
