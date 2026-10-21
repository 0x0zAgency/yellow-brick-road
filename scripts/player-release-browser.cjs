'use strict';
/** Chromium end-to-end: real Mint Studio upload/encryption/simulated mint ->
 * local preview bridge -> authenticated Player artwork, lyrics and playback.
 * Test fixtures and credentials are synthetic and disposable.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.YBR_BROWSER_DEPS||'/tmp/ybr-browser']}));
const ROOT=path.resolve(__dirname,'..');
const OUT=path.join(ROOT,'.road-local/player-browser-results');
const key='browser-test-listener-only';
const digest=value=>createHash('sha256').update(value).digest('hex');
const encode=(bytes,name,mime)=>({name,mime,sha256:digest(bytes),base64:bytes.toString('base64')});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function ready(){
 for(let i=0;i<60;i++){
  try{if((await fetch('http://127.0.0.1:5173')).ok&&(await fetch('http://127.0.0.1:4173/api/session')).ok)return;}catch{}
  await wait(500);
 }
 throw Error('The web app and Player did not become ready.');
}
async function main(){
 await ready();fs.mkdirSync(OUT,{recursive:true});
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-browser-release-'));
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKxkAAAAASUVORK5CYII=','base64');
 fs.writeFileSync(path.join(tmp,'cover.png'),png);
 const lyric='These are the words from my uploaded release.\n<script>window.badLyric=true</script>\n';
 fs.writeFileSync(path.join(tmp,'lyrics.txt'),lyric);
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1080}});
 const errors=[];context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));
 let studio,player;
 try{
  studio=await context.newPage();await studio.goto('http://127.0.0.1:5173');
  await studio.getByRole('button',{name:'Mint Studio',exact:true}).click();
  await studio.getByRole('button',{name:'Continue →',exact:true}).click();
  await studio.locator('input[aria-label="Choose Master recording"]').setInputFiles(path.join(ROOT,'apps/ybr-player/media/golden-hour.wav'));
  await studio.getByLabel('Choose Audio preview',{exact:true}).setInputFiles(path.join(ROOT,'apps/ybr-player/media/after-the-rain.wav'));
  await studio.getByLabel('Choose Cover artwork',{exact:true}).setInputFiles(path.join(tmp,'cover.png'));
  await studio.getByLabel('Choose Lyrics manuscript / writing evidence',{exact:true}).setInputFiles(path.join(tmp,'lyrics.txt'));
  await studio.waitForFunction(()=>!document.body.innerText.includes('Hashing…'));
  await studio.getByRole('button',{name:'Encrypt & Continue →',exact:true}).click();
  await studio.getByLabel('Track title',{exact:true}).fill('Browser release test');
  await studio.getByLabel('Recording artist / claimant',{exact:true}).fill('Synthetic Artist');
  await studio.getByLabel('Songwriters / composers (comma-separated)',{exact:true}).fill('Synthetic Writer');
  await studio.getByRole('button',{name:'Continue →',exact:true}).click();
  await studio.getByRole('button',{name:'Simulate mint →',exact:true}).click();
  await studio.getByRole('button',{name:'Confirm simulation',exact:true}).click();
  await studio.getByRole('button',{name:'View receipts →',exact:true}).click({timeout:30000});
  const add=studio.getByRole('button',{name:'Add release to Player',exact:true});
  assert.equal(await add.isDisabled(),true,'Sharing must require explicit consent');
  await studio.getByLabel('I have permission to share these selected copies',{exact:false}).check();
  await add.click();
  const open=studio.getByRole('link',{name:'Open release in Player ↗',exact:true});
  await open.waitFor({timeout:30000});
  const popup=studio.waitForEvent('popup');await open.click();player=await popup;
  await player.waitForLoadState('domcontentloaded');
  await player.locator('#password').fill(key);
  await player.getByRole('button',{name:'Authorize session',exact:false}).click();
  await player.waitForFunction(()=>document.getElementById('nowTitle').textContent==='Browser release test');
  await player.waitForFunction(()=>document.getElementById('releaseLyrics').textContent.includes('These are the words'));
  assert.equal(await player.locator('#releaseLyrics').textContent(),lyric);
  assert.equal(await player.evaluate(()=>window.badLyric),undefined,'Lyrics must not execute markup');
  await player.waitForFunction(()=>document.querySelector('#inspectorCover img')?.naturalWidth>0);
  const covers=await player.locator('#releaseFiles img').evaluateAll(nodes=>nodes.map(node=>node.src));
  assert.ok(covers.length>=3);assert.equal(new Set(covers).size,1,'All associated file cards share the release cover');
  await player.locator('#playPause').click();
  await player.waitForFunction(()=>document.getElementById('audio').currentTime>0.2,{},{timeout:15000});
  const servedHash=await player.evaluate(async()=>{const response=await fetch(document.getElementById('audio').src);const bytes=await response.arrayBuffer();return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');});
  assert.equal(servedHash,digest(fs.readFileSync(path.join(ROOT,'apps/ybr-player/media/after-the-rain.wav'))),'Player must stream the selected Audio Preview, not the distinct Master Recording');
  assert.notEqual(servedHash,digest(fs.readFileSync(path.join(ROOT,'apps/ybr-player/media/golden-hour.wav'))));
  await player.screenshot({path:path.join(OUT,'uploaded-release.png'),fullPage:true});
  // Publish a WebVTT companion through the same local ingestion boundary.
  const audio=fs.readFileSync(path.join(ROOT,'apps/ybr-player/media/golden-hour.wav'));
  const vtt=Buffer.from('WEBVTT\n\n00:00.000 --> 00:02.000\nFirst timed line\n\n00:02.000 --> 00:23.500\nSecond timed line\n');
  const timed={format:'ybr-studio-preview/1',audioSourceRole:'preview',consent:'share-selected-copies-with-local-player',title:'Timed lyric test',creator:'Synthetic Artist',files:[{role:'preview',name:'audio.wav',sharedAs:'audio'}],assets:{audio:encode(audio,'audio.wav','audio/wav'),artwork:encode(png,'cover.png','image/png'),lyrics:encode(vtt,'lyrics.vtt','text/vtt')}};
  const published=await studio.evaluate(async payload=>{
   const {token}=await(await fetch('/api/player-publish/config')).json();
   const res=await fetch('/api/player-publish/releases',{method:'POST',headers:{'Content-Type':'application/json','X-YBR-Publish-Token':token},body:JSON.stringify(payload)});
   if(!res.ok)throw Error(await res.text());return res.json();
  },timed);
  await player.bringToFront();
  await player.locator('#refreshLibrary').click();
  await player.getByRole('button',{name:'Play Timed lyric test',exact:true}).click({timeout:15000});
  await player.getByRole('button',{name:'First timed line',exact:true}).waitFor({timeout:15000});
  await player.getByRole('button',{name:'Second timed line',exact:true}).click();
  await player.waitForFunction(()=>document.querySelector('.release-cue.is-active')?.textContent==='Second timed line');
  await player.screenshot({path:path.join(OUT,'timed-lyrics.png'),fullPage:true});
  await studio.evaluate(async id=>{
   const {token}=await(await fetch('/api/player-publish/config')).json();
   const res=await fetch('/api/player-publish/releases/'+id,{method:'DELETE',headers:{'X-YBR-Publish-Token':token}});if(!res.ok)throw Error('Removal failed');
  },published.brick.id);
  await player.locator('#refreshLibrary').click();
  await player.waitForFunction(()=>!document.body.innerText.includes('Timed lyric test'));
  assert.equal(await player.locator('#audio').evaluate(el=>el.paused),true);
  assert.deepEqual(errors,[],'Unexpected browser JavaScript errors');
  console.log('PASS: Mint Studio encryption + opt-in upload + persistent Player release + shared cover + safe plain lyrics + native WebVTT synchronization + preview withdrawal.');
 }catch(e){
  if(studio)await studio.screenshot({path:path.join(OUT,'studio-failure.png'),fullPage:true}).catch(()=>{});
  if(player)await player.screenshot({path:path.join(OUT,'player-failure.png'),fullPage:true}).catch(()=>{});
  console.error('Browser errors:',errors);throw e;
 }finally{await browser.close();fs.rmSync(tmp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
