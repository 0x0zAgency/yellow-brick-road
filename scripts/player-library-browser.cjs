'use strict';
/** Real Player HTTP publication plus Chromium listening-view regression checks. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.YBR_BROWSER_DEPS||'/tmp/ybr-browser']}));
const ROOT=path.resolve(__dirname,'..'),base='http://127.0.0.1:4173';
const created=[];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const audio=fs.readFileSync(path.join(ROOT,'apps/ybr-player/media/after-the-rain.wav'));
async function publish(title,bytes=audio){
 const {token}=await(await fetch(base+'/api/player-publish/config')).json();
 const body={format:'ybr-studio-preview/1',audioSourceRole:'preview',consent:'share-selected-copies-with-local-player',title,creator:'Library regression artist',
  files:[{role:'preview',name:'preview.wav',sharedAs:'audio'}],
  assets:{audio:{name:'preview.wav',mime:'audio/wav',sha256:createHash('sha256').update(bytes).digest('hex'),base64:bytes.toString('base64')}}};
 const response=await fetch(base+'/api/player-publish/releases',{method:'POST',headers:{'Content-Type':'application/json','X-YBR-Publish-Token':token},body:JSON.stringify(body)});
 assert.ok(response.ok,await response.clone().text());
 const {brick}=await response.json();created.push(brick.id);return brick;
}
async function main(){
 const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:1080}});
 let page;
 try{
  const older=await publish('Library older preview');await delay(10);
  const newer=await publish('Library newest preview');
  assert.ok(Date.parse(newer.publishedAt)>Date.parse(older.publishedAt));
  assert.equal(newer.publishedAtSource,'local-publication');
  let empty=false,revokedId=null,otherProfile=false;
  page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/bricks',async route=>{
   const response=await route.fetch(),data=await response.json();
   const sample=data.bricks.find(brick=>brick.id===newer.id);
   const extra=[{...sample,id:'REGISTERED-ONLY',source:'road-registry',title:'Registered but unavailable',streamAllowed:false},
    {...sample,id:'UNSUPPORTED',title:'Unsupported codec',media:{mimeType:'audio/x-ybr-not-supported'}},
    {...sample,id:'NO-AUDIO',title:'No Audio Preview',media:null}];
   data.bricks=data.bricks.concat(extra).map(brick=>empty||brick.id===revokedId?{...brick,streamAllowed:false}:brick);
   if(otherProfile){
    data.bricks=data.bricks.filter(brick=>brick.id!==newer.id);
    data.uploads=(data.uploads||[]).map(item=>item.id===newer.id?{...item,available:false,reason:'different-chain',message:'Saved on a different Ganache chain history. Switch back to the original test mnemonic/profile; do not remint.',chain:{chainId:1337,factoryAddress:'0x'+'1'.repeat(40),genesisHash:'0x'+'2'.repeat(64)}}:item);
   }
   await route.fulfill({response,json:data});
  });
  await page.goto(base);
  await page.locator('#password').fill('browser-test-listener-only');
  await page.getByRole('button',{name:'Authorize session',exact:false}).click();
  await page.waitForFunction(()=>document.getElementById('nowTitle').textContent==='Library newest preview');
  assert.equal(await page.locator('.track-row').first().getAttribute('data-brick-id'),newer.id);
  for(const id of ['REGISTERED-ONLY','UNSUPPORTED','NO-AUDIO','BRK-AUD-002'])assert.equal(await page.locator(`.track-row[data-brick-id="${id}"]`).count(),0);
  assert.equal(await page.locator('#audio').evaluate(el=>el.paused&&!el.getAttribute('src')),true,'Default selection must not autoplay');
  await page.locator('#featurePlay').click();
  await page.waitForFunction(()=>document.getElementById('audio').currentTime>0.3);
  const position=await page.locator('#audio').evaluate(el=>el.currentTime);
  const latest=await publish('Library incoming preview');
  await page.locator('#refreshLibrary').click();
  await page.waitForFunction(id=>document.querySelector('.track-row')?.dataset.brickId===id,latest.id);
  assert.equal(await page.locator('#nowTitle').textContent(),newer.title,'Refresh cannot switch a playing track');
  assert.ok(await page.locator('#audio').evaluate((el,p)=>!el.paused&&el.currentTime>=p,position));
  await page.locator('#playPause').click();
  const paused=await page.locator('#audio').evaluate(el=>el.currentTime);
  await page.locator('#refreshLibrary').click();await delay(200);
  assert.equal(await page.locator('#nowTitle').textContent(),newer.title,'Paused selection survives refresh');
  assert.equal(await page.locator('#audio').evaluate(el=>el.currentTime),paused);
  await page.locator('#next').click();
  await page.waitForFunction(()=>document.getElementById('nowTitle').textContent==='Library older preview');
  // A permission change stops playback and removes the row, but never starts another track.
  revokedId=older.id;await page.locator('#refreshLibrary').click();
  await page.waitForFunction(id=>!document.querySelector(`.track-row[data-brick-id="${id}"]`),older.id);
  assert.equal(await page.locator('#audio').evaluate(el=>el.paused&&!el.getAttribute('src')),true);
  // Empty libraries clear stale details, art/lyrics selection and playback controls.
  empty=true;await page.locator('#refreshLibrary').click();
  await page.locator('#libraryEmpty').waitFor({state:'visible'});
  assert.equal(await page.locator('.track-row').count(),0);
  assert.equal(await page.locator('#nowTitle').textContent(),'Nothing playing');
  assert.equal(await page.locator('#brickId').textContent(),'—');
  for(const id of ['featurePlay','playPause','next','previous'])assert.equal(await page.locator('#'+id).isDisabled(),true);
  empty=false;revokedId=null;await page.locator('#refreshLibrary').click();
  await page.waitForFunction(()=>document.getElementById('nowTitle').textContent==='Library incoming preview');
  assert.equal(await page.locator('#audio').evaluate(el=>el.paused),true);
  // MIME support alone cannot guarantee decoding: hide a real failed decode, too.
  const corrupt=await publish('Library corrupt preview',Buffer.from('This is not a playable WAV file.'));
  await page.locator('#refreshLibrary').click();
  await page.getByRole('button',{name:'Play Library corrupt preview',exact:true}).click();
  await page.waitForFunction(id=>!document.querySelector(`.track-row[data-brick-id="${id}"]`),corrupt.id);
  await delay(5500); // Automatic refresh must not immediately resurrect a failed decode.
  assert.equal(await page.locator(`.track-row[data-brick-id="${corrupt.id}"]`).count(),0);
  // Account-specific visibility, not a hard-coded block of the artist-only demo.
  await page.locator('#logout').click();
  await page.locator('#username').fill('artist');await page.locator('#password').fill('browser-test-artist-only');
  await page.getByRole('button',{name:'Authorize session',exact:false}).click();
  await page.locator('.track-row[data-brick-id="BRK-AUD-002"]').waitFor();
  otherProfile=true;await page.locator('#refreshLibrary').click();
  await page.waitForFunction(id=>document.querySelector('[data-upload-id="'+id+'"] .saved-upload-badge')?.textContent==='OTHER CHAIN',newer.id);
  const retained=page.locator('[data-upload-id="'+newer.id+'"]');
  assert.ok((await retained.textContent()).includes('original test mnemonic/profile'));
  assert.equal(await retained.locator('button').count(),0,'Other-profile upload has no play/select action');
  assert.equal(await page.locator('.track-row[data-brick-id="'+newer.id+'"]').count(),0);
  otherProfile=false;await page.locator('#refreshLibrary').click();
  await page.waitForFunction(id=>document.querySelector('[data-upload-id="'+id+'"] .saved-upload-badge')?.textContent==='PLAYABLE',newer.id);
  assert.deepEqual(errors,[],'No unexpected browser exceptions');
  const out=path.join(ROOT,'.road-local/player-browser-results');fs.mkdirSync(out,{recursive:true});
  await page.screenshot({path:path.join(out,'playable-newest-library.png'),fullPage:true});
  console.log('PASS: playable-only collection, newest default, real publish dates, playing/paused refresh continuity, filtered navigation, revocation, empty state and failed-decode hiding.');
 }finally{
  await browser.close();
  const {token}=await(await fetch(base+'/api/player-publish/config')).json();
  for(const id of created)await fetch(base+'/api/player-publish/releases/'+id,{method:'DELETE',headers:{'X-YBR-Publish-Token':token}});
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
