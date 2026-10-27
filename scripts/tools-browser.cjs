'use strict';
/** Actual browser worker, real tag library, synthetic local MPEG fixture. No upload or wallet writes. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.YBR_BROWSER_DEPS||'/tmp/ybr-browser']}));
const root=path.resolve(__dirname,'..'),out=path.join(root,'.road-local/player-browser-results');
const MP3Tag=require(require.resolve('mp3tag.js',{paths:[path.join(root,'web')]}));
function fixture(){const bytes=Buffer.alloc(417*8);for(let i=0;i<8;i++)bytes.set([255,251,144,100],i*417);return MP3Tag.writeBuffer(bytes,{v2:{TIT2:'Synthetic tag fixture',TPE1:'Test performer',TALB:'Original album',TCOM:'Original composer',TEXT:'Original lyricist',TXXX:[{description:'SONGWRITER',text:'Original songwriter'},{description:'PRIVATE NOTE',text:'Keep this note'}],USLT:[{language:'eng',descriptor:'',text:'Synthetic lyrics'}]}},{id3v2:{version:3,encoding:'utf-16',padding:0}});}
async function main(){
 if(!process.env.CI)throw Error('This isolated browser regression is CI only.');
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1480,height:1050},acceptDownloads:true});const errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')writes.push(r.url());});page.on('dialog',d=>d.accept());
  await page.addInitScript(()=>{window.toolsWalletWrites=0;window.ethereum={request:async({method})=>{if(method==='eth_accounts')return [];window.toolsWalletWrites++;throw Error('No wallet writes in Tools.');}};localStorage.setItem('tools-recovery-sentinel','KEEP-PRIVATE');});
  await page.goto('http://127.0.0.1:5173/');
  const nav=page.getByRole('navigation',{name:'Main navigation'}),tools=nav.getByRole('button',{name:'Tools',exact:true});
  assert.equal(await tools.getAttribute('aria-expanded'),'false');assert.equal(await nav.getByRole('button',{name:'Settings',exact:true}).count(),0);
  await tools.click();assert.equal(await tools.getAttribute('aria-expanded'),'true');
  assert.ok(await page.evaluate(()=>{const nav=document.querySelector('.sidebar nav'),player=nav.nextElementSibling;return nav.getBoundingClientRect().bottom<=player.getBoundingClientRect().top+1;}),'Expanded Tools must not overlap the Player shortcut');await nav.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('region',{name:'Workspace settings'}).waitFor();
  await nav.getByRole('button',{name:'Recover files',exact:true}).click();await page.getByRole('heading',{name:'Recover your originals.',exact:true}).waitFor();
  await nav.getByRole('button',{name:'MP3 Tags',exact:true}).click();await page.getByRole('region',{name:'MP3 tag reader and updater'}).waitFor();
  await page.getByLabel('MP3 file',{exact:true}).setInputFiles({name:'synthetic-tags.mp3',mimeType:'audio/mpeg',buffer:fixture()});
  await page.waitForFunction(()=>document.querySelector('[aria-label="Album / release"]')?.value==='Original album');
  assert.equal(await page.getByLabel('Songwriter',{exact:true}).inputValue(),'Original songwriter');
  await page.getByLabel('Album / release',{exact:true}).fill('Mañana — Road tests');await page.getByLabel('Songwriter',{exact:true}).fill('New writer');
  assert.equal(await page.getByRole('button',{name:'Prepare verified copy',exact:true}).isDisabled(),true);
  await nav.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('tab',{name:'Colors & themes'}).click();await page.getByRole('button',{name:'Paper Studio',exact:true}).click();
  await nav.getByRole('button',{name:'MP3 Tags',exact:true}).click();assert.equal(await page.getByLabel('Album / release',{exact:true}).inputValue(),'Mañana — Road tests','Navigation retains the draft');
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=32;const x=c.getContext('2d');x.fillStyle='#f5c542';x.fillRect(0,0,32,32);return c.toDataURL().split(',')[1];});
  await page.getByLabel('MP3 front cover',{exact:true}).setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.getByAltText('Embedded MP3 artwork preview',{exact:true}).waitFor();
  await page.getByLabel('Approve MP3 copy export',{exact:true}).check();await page.getByRole('button',{name:'Prepare verified copy',exact:true}).click();
  const link=page.getByRole('link',{name:'Download updated MP3',exact:true});await link.waitFor({timeout:35000});
  const download=page.waitForEvent('download');await link.click();const copy=await download;assert.equal(copy.suggestedFilename(),'synthetic-tags-tagged.mp3');
  const bytes=fs.readFileSync(await copy.path()),tags=MP3Tag.readBuffer(bytes);assert.equal(tags.album,'Mañana — Road tests');assert.equal(tags.v2.TXXX.find(t=>t.description==='SONGWRITER').text,'New writer');assert.equal(tags.v2.TXXX.find(t=>t.description==='PRIVATE NOTE').text,'Keep this note');assert.equal(tags.v2.APIC[0].type,3);
  const imported=await page.evaluate(async base64=>{const {extractUploadMetadata}=await import('/src/upload-metadata.js');return extractUploadMetadata(new File([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],'updated.mp3',{type:'audio/mpeg'}));},bytes.toString('base64'));
  assert.equal(imported.fields.release,'Mañana — Road tests');assert.match(imported.fields.songwriters,/New writer/);
  fs.mkdirSync(out,{recursive:true});await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:path.join(out,'tools-mp3-desktop.png'),fullPage:true});
  await page.getByLabel('Title',{exact:true}).fill('Another edit');assert.equal(await link.count(),0,'Any edit invalidates the prepared download');assert.equal(await page.getByLabel('Approve MP3 copy export',{exact:true}).isChecked(),false);
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Open navigation',exact:true}).click();await nav.getByRole('button',{name:'Recover files',exact:true}).click();await page.getByRole('heading',{name:'Recover your originals.',exact:true}).waitFor();
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();await nav.getByRole('button',{name:'MP3 Tags',exact:true}).click();assert.equal(await page.getByLabel('Title',{exact:true}).inputValue(),'Another edit');
  await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=0);
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:path.join(out,'tools-mp3-mobile.png'),fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No mobile horizontal overflow');
  await page.getByRole('button',{name:'Discard edits',exact:true}).click();assert.equal(await page.getByLabel('Album / release',{exact:true}).inputValue(),'Original album');
  await page.getByRole('button',{name:'Clear file',exact:true}).click();await page.getByLabel('MP3 file',{exact:true}).setInputFiles({name:'not-audio.mp3',mimeType:'audio/mpeg',buffer:Buffer.from('Not valid audio')});await page.getByRole('alert').waitFor();
  assert.equal(await page.evaluate(()=>window.toolsWalletWrites),0);assert.equal(await page.evaluate(()=>localStorage.getItem('tools-recovery-sentinel')),'KEEP-PRIVATE');assert.deepEqual(writes,[],'No file uploads, RPC writes or application POSTs');assert.deepEqual(errors,[]);
  console.log('TOOLS PASS: menu, preserved drafts, actual worker tag round-trip, album/songwriter import, audio integrity, consent, artwork, desktop/mobile, zero uploads or wallet writes.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
