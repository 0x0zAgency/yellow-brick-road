'use strict';
/** Actual local tag reader/editor, synthetic tags only; no uploads or wallet writes. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.YBR_BROWSER_DEPS||'/tmp/ybr-browser']}));
const out=path.resolve(__dirname,'../.road-local/player-browser-results');
function fixture(){
 const frame=(id,s)=>{const data=Buffer.concat([Buffer.from([3]),Buffer.from(s)]),h=Buffer.alloc(10);h.write(id);h.writeUInt32BE(data.length,4);return Buffer.concat([h,data]);};
 const payload=Buffer.concat([frame('TIT2','Midnight Geometry'),frame('TPE1','Test Artist'),frame('TALB','Night Studies'),frame('TCOM','Test Composer'),frame('TEXT','Test Lyricist'),frame('TXXX','SONGWRITER\0Test Writer'),frame('TXXX','CATALOG\0Keep catalog')]);
 const h=Buffer.from([73,68,51,3,0,0,0,0,0,0]);let n=payload.length;for(let i=9;i>=6;i--){h[i]=n&127;n>>=7;}
 const audio=Buffer.alloc(417*8);for(let i=0;i<8;i++)Buffer.from([255,251,144,100]).copy(audio,i*417);
 return Buffer.concat([h,payload,audio]);
}
async function main(){
 if(!process.env.CI)throw Error('Run the browser fixture only in isolated CI.');
 const browser=await chromium.launch({headless:true});let page;
 try{
  page=await browser.newPage({viewport:{width:1480,height:1050}});const errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(['POST','PUT','PATCH','DELETE'].includes(r.method()))writes.push(r.url());});
  await page.addInitScript(()=>{window.walletWrites=0;window.ethereum={request:async({method})=>{if(method==='eth_accounts')return [];if(method==='eth_chainId')return '0x539';window.walletWrites++;throw Error('Tools must not sign.');}};});
  await page.goto('http://127.0.0.1:5173/');await page.getByRole('button',{name:'Tools',exact:true}).click();
  const nav=page.getByRole('navigation',{name:'Main navigation'});
  assert.equal(await nav.locator(':scope > button').filter({hasText:/^Settings$|^Recover files$/}).count(),0);
  await nav.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('region',{name:'Workspace settings'}).waitFor();
  await nav.getByRole('button',{name:'Recover files',exact:true}).click();await page.getByRole('heading',{name:'Recover your originals.',exact:true}).waitFor();
  await nav.getByRole('button',{name:'MP3 tags',exact:true}).click();await page.getByRole('region',{name:'MP3 tag reader and editor'}).waitFor();
  await page.evaluate(()=>{localStorage.setItem('road:tools-keep-sentinel','PRIVATE-KEEP');});const before=await page.evaluate(()=>JSON.stringify(localStorage));writes.length=0;
  const source=fixture();await page.getByLabel('Choose MP3 file',{exact:true}).setInputFiles({name:'night-studies.mp3',mimeType:'audio/mpeg',buffer:source});
  await page.waitForFunction(()=>document.querySelector('[aria-label="MP3 Album"]')?.value==='Night Studies');
  assert.equal(await page.getByLabel('MP3 Songwriters',{exact:true}).inputValue(),'Test Writer');
  await page.getByLabel('MP3 Album',{exact:true}).fill('Night Studies / Vol. 2');await page.getByLabel('MP3 Songwriters',{exact:true}).fill('Test Writer & Co.');
  assert.equal(await page.getByRole('button',{name:'Prepare tagged copy',exact:true}).isDisabled(),true);
  fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'mp3-tools-desktop.png'),fullPage:true});
  await page.getByLabel('Approve tag changes',{exact:true}).check();await page.getByRole('button',{name:'Prepare tagged copy',exact:true}).click();
  const link=page.getByRole('link',{name:'Download tagged MP3',exact:true});await link.waitFor();
  const waiting=page.waitForEvent('download');await link.click();const download=await waiting,copy=fs.readFileSync(await download.path());assert.equal(download.suggestedFilename(),'night-studies-tagged.mp3');
  const core=await import('../web/src/mp3-tool-core.js'),model=await import('../web/src/mp3-tool-model.js');
  const edited=await core.readMp3(new File([copy],'copy.mp3',{type:'audio/mpeg'}));assert.equal(edited.view.fields.album,'Night Studies / Vol. 2');assert.equal(edited.view.fields.songwriters,'Test Writer & Co.');assert.deepEqual(model.inspectEnvelope(new Uint8Array(source)).audio,model.inspectEnvelope(new Uint8Array(copy)).audio);
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),before,'Files/tags never enter persistent browser storage');assert.equal(await page.evaluate(()=>window.walletWrites),0);assert.deepEqual(writes,[],'Editor makes no network writes');
  await page.getByLabel('MP3 Album',{exact:true}).fill('Further edit');assert.equal(await link.count(),0,'Stale exports are removed after edits');
  await page.getByRole('button',{name:'Reset edits',exact:true}).click();assert.equal(await page.getByLabel('MP3 Album',{exact:true}).inputValue(),'Night Studies');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'mp3-tools-mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();await nav.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('region',{name:'Workspace settings'}).waitFor();
  await page.goto('http://127.0.0.1:5173/?tool=mp3-tags');await page.getByRole('region',{name:'MP3 tag reader and editor'}).waitFor();
  await page.getByLabel('Choose MP3 file',{exact:true}).setInputFiles({name:'bad.mp3',mimeType:'audio/mpeg',buffer:Buffer.from('not a real mp3')});await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('link',{name:'Download tagged MP3'}).count(),0);
  await page.getByLabel('Choose MP3 file',{exact:true}).setInputFiles({name:'again.mp3',mimeType:'audio/mpeg',buffer:source});await page.waitForFunction(()=>document.querySelector('[aria-label="MP3 Album"]')?.value==='Night Studies');await page.getByRole('button',{name:'Clear file',exact:true}).click();assert.equal(await page.getByLabel('MP3 Album',{exact:true}).count(),0);
  assert.deepEqual(errors,[]);console.log('TOOLS PASS: nested navigation, actual MP3 read/edit/roundtrip/download, byte-identical audio, no network writes, no storage writes, desktop/mobile.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
