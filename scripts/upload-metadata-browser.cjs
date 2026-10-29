'use strict';
/** Real Chromium worker + form integration, using synthetic tagged files. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.YBR_BROWSER_DEPS||'/tmp/ybr-browser']}));
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'.road-local/player-browser-results');
function mp3(title,artist,album='Imported album',writer='Tag Writer'){
 const frame=(id,text)=>{const body=Buffer.concat([Buffer.from([3]),Buffer.from(text)]),head=Buffer.alloc(10);head.write(id);head.writeUInt32BE(body.length,4);return Buffer.concat([head,body]);};
 const tags=Buffer.concat([frame('TIT2',title),frame('TPE1',artist),frame('TALB',album),frame('TCOM',writer),frame('TEXT','Lyric Writer'),frame('TXXX','SONGWRITER\0Custom Writer'),frame('TCON','Electronic'),frame('TBPM','123')]);
 const head=Buffer.from([73,68,51,3,0,0,0,0,0,0]);let n=tags.length;for(let i=9;i>=6;i--){head[i]=n&127;n>>=7;}
 const frames=Buffer.alloc(417*8);for(let i=0;i<8;i++)Buffer.from([255,251,144,0]).copy(frames,i*417);
 return Buffer.concat([head,tags,frames]);
}
async function main(){
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1080}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const attach=(label,name,buffer,mimeType='audio/mpeg')=>page.getByLabel(label,{exact:true}).setInputFiles({name,buffer,mimeType});
 const advance=async()=>{await page.waitForFunction(()=>!document.body.innerText.includes('Hashing…'));await page.getByRole('button',{name:'Encrypt & Continue →',exact:true}).click();await page.getByLabel('Track title',{exact:true}).waitFor();};
 try{
  await page.goto('http://127.0.0.1:5173');await page.getByRole('button',{name:'Mint Studio',exact:true}).click();
  await page.getByRole('button',{name:'Continue →',exact:true}).click();
  await attach('Choose Master recording','My_New_Work.flp',Buffer.from('synthetic native project'),'application/octet-stream');
  await advance();assert.equal(await page.getByLabel('Track title',{exact:true}).inputValue(),'My New Work');
  await page.getByRole('button',{name:'← Back',exact:true}).click();
  await attach('Choose Master recording','same-name.mp3',mp3('Master tagged title','Master tagged artist'));
  await advance();assert.equal(await page.getByLabel('Track title',{exact:true}).inputValue(),'Master tagged title');
  assert.equal(await page.getByLabel('Recording artist / claimant',{exact:true}).inputValue(),'Master tagged artist');
  assert.equal(await page.getByLabel('Songwriters / composers (comma-separated)',{exact:true}).inputValue(),'Tag Writer, Lyric Writer, Custom Writer');
  assert.equal(await page.getByLabel('Album / release',{exact:true}).inputValue(),'Imported album');
  await page.getByLabel('Album / release',{exact:true}).fill('My deliberate album');
  await page.getByLabel('Songwriters / composers (comma-separated)',{exact:true}).fill('My credited songwriter');
  await page.getByLabel('Track title',{exact:true}).fill('My deliberate title');
  await page.getByRole('button',{name:'← Back',exact:true}).click();
  await attach('Choose Master recording','same-name.mp3',mp3('Replacement master','Replacement artist'));
  await attach('Choose Audio preview','listener-preview.mp3',mp3('Preview title','Preview artist','Different preview album','Different preview writer'));
  await advance();assert.equal(await page.getByLabel('Track title',{exact:true}).inputValue(),'My deliberate title');
  assert.equal(await page.getByLabel('Recording artist / claimant',{exact:true}).inputValue(),'Preview artist');
  assert.equal(await page.getByLabel('Album / release',{exact:true}).inputValue(),'My deliberate album');
  assert.equal(await page.getByLabel('Songwriters / composers (comma-separated)',{exact:true}).inputValue(),'My credited songwriter');
  // Explicit clearing must not be undone by asynchronous imported fields.
  await page.getByLabel('Track title',{exact:true}).fill('');
  await page.getByLabel('Album / release',{exact:true}).fill('');
  await page.getByLabel('Songwriters / composers (comma-separated)',{exact:true}).fill('');
  await page.getByRole('button',{name:'← Back',exact:true}).click();
  await attach('Choose Audio preview','listener-preview.mp3',mp3('A later title','Later preview artist'));
  await advance();assert.equal(await page.getByLabel('Track title',{exact:true}).inputValue(),'');
  assert.equal(await page.getByLabel('Recording artist / claimant',{exact:true}).inputValue(),'Later preview artist');
  assert.equal(await page.getByLabel('Album / release',{exact:true}).inputValue(),'');
  assert.equal(await page.getByLabel('Songwriters / composers (comma-separated)',{exact:true}).inputValue(),'');
  await page.getByRole('button',{name:'Use extracted album',exact:true}).click();
  assert.equal(await page.getByLabel('Album / release',{exact:true}).inputValue(),'Imported album');
  assert.equal(await page.getByLabel('Track title',{exact:true}).inputValue(),'','Applying an album must not overwrite other edits');
  assert.deepEqual(errors,[]);
  fs.mkdirSync(OUT,{recursive:true});await page.screenshot({path:path.join(OUT,'metadata-autofill.png'),fullPage:true});
  // A file above the old IPFS limit must advance through real browser encryption.
  await page.reload();await page.getByRole('button',{name:'Mint Studio',exact:true}).click();
  await page.getByRole('button',{name:'Continue →',exact:true}).click();
  await attach('Choose Master recording','large-project.flp',Buffer.alloc(40*1024*1024,73),'application/octet-stream');
  await page.getByLabel('Upload encrypted files to my local YBR IPFS node (experimental)',{exact:true}).check();
  assert.match(await page.locator('.ms-ipfs-warning').innerText(),/256 MiB per original/);
  const posts=[];page.on('request',request=>{if(request.method()==='POST')posts.push(request.url());});
  await advance();
  assert.match(await page.locator('.ms-ipfs-confirm').innerText(),/Files encrypted locally, pending creator approval/);
  assert.deepEqual(posts,[],'Larger-file encryption must still wait for final approval before upload');
  assert.deepEqual(errors,[]);
  console.log('PASS: worker MP3 extraction from master and preview, filename fallback for unknown formats, manual edits/clearing, replacement and preview metadata precedence.');
  console.log('PASS: 40 MiB source advances through real browser encryption with IPFS selected.');
 }catch(e){fs.mkdirSync(OUT,{recursive:true});await page.screenshot({path:path.join(OUT,'metadata-failure.png'),fullPage:true}).catch(()=>{});throw e;}
 finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
