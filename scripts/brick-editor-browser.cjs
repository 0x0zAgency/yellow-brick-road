'use strict';
// Real disposable chain + React editor; IPFS transport is a ciphertext fixture.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto'),{pathToFileURL}=require('node:url');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.YBR_BROWSER_DEPS||'/tmp/ybr-browser']}));
const root=path.resolve(__dirname,'..'),web=path.join(root,'web'),stem='brick-editor-browser-'+process.pid;
const html=path.join(web,stem+'.html'),jsx=path.join(web,'src',stem+'.jsx'),out=path.join(root,'.road-local/player-browser-results');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex'),load=file=>import(pathToFileURL(path.join(web,'src',file)));
async function main(){
 if(!process.env.CI)throw Error('Run this browser test only in disposable CI.');
 const server=require('ganache').server({logging:{quiet:true},chain:{chainId:1337},wallet:{deterministic:true}});
 let vite,browser,page;const errors=[],store=new Map();let uploads=0;
 try{
  await server.listen(0,'127.0.0.1');const rpcUrl='http://127.0.0.1:'+server.address().port;
  const {createPublicClient,createWalletClient,http}=await import(require.resolve('viem',{paths:[web]}));
  const {mintOnChain,localConfig}=await load('chain-mint.js'),{makeRegistrationPacket}=await load('mint-model.js'),{pinEncryptedBrickMetadata}=await load('ipfs-upload.js');
  const [account,other]=await server.provider.request({method:'eth_accounts'}),chain=localConfig(rpcUrl,1337),client=createPublicClient({chain,transport:http(rpcUrl)}),wallet=createWalletClient({account,chain,transport:http(rpcUrl)});
  const artifact=JSON.parse(fs.readFileSync(path.join(root,'artifacts/contracts/YellowBrickFactory.sol/YellowBrickFactory.json')));
  const gas=await client.estimateGas({account,data:artifact.bytecode});
  const factoryAddress=(await client.waitForTransactionReceipt({hash:await wallet.deployContract({abi:artifact.abi,bytecode:artifact.bytecode,gas:gas+gas/5n})})).contractAddress;
  const secret='disposable-brick-editor-test-key',pin=bytes=>{const sha256=digest(bytes),cid='bafy'+sha256;store.set(cid,Buffer.from(bytes));return {cid,sha256,size:bytes.length,pinned:true,verified:true};};
  let packet=makeRegistrationPacket({metadata:{title:'Original artwork title',artist:'Artist',ipCategory:'illustration'},assets:{master:{name:'art.png',type:'image/png',hash:'ab'.repeat(32),size:4}},identity:{mode:'external',address:account,connected:true},royalties:{creatorBps:10000},training:'not-authorized',composition:false,contentPolicy:{locked:true,preview:false,artwork:false,lyrics:false}});
  packet=await pinEncryptedBrickMetadata({packet,secret,fetchImpl:async(url,options)=>Response.json(pin(options.body))});
  const mint=await mintOnChain({packet,provider:server.provider,rpcUrl,chainId:1337,factoryAddress});assert.equal(mint.status,'confirmed');
  const backup={format:'0x-road-ipfs-recovery-v2',key:secret,assets:[],metadata:[]},recoveryFile={name:'private-recovery.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))};
  fs.writeFileSync(html,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/src/'+stem+'.jsx"></script></body></html>',{flag:'wx'});
  fs.writeFileSync(jsx,`import React from 'react';import {createRoot} from 'react-dom/client';import WalletBricks from './WalletBricks.jsx';import RecoveryVault from './RecoveryVault.jsx';import MintStudioDemo from './MintStudioDemo.jsx';import 'bootstrap/dist/css/bootstrap.min.css';import './styles.css';import './mint-studio.css';import './mint-demo.css';
const listeners={};window.walletWrites=0;window.testAccount='${account}';window.rejectNext=false;
window.ethereum={on:(key,fn)=>{(listeners[key]||=new Set()).add(fn);},removeListener:(key,fn)=>listeners[key]?.delete(fn),request:async({method,params=[]})=>{
 if(method==='eth_accounts')return [window.testAccount];
 if(/send|sign/i.test(method)){window.walletWrites++;if(window.checkMintRecovery){const {listRecoveryFiles}=await import('./recovery-vault.js');window.mintRecoveryBeforeWrite=(await listRecoveryFiles(window.testAccount)).some(r=>r.title==='Auto saved mint'&&r.kit.metadata.length===1&&r.kit.assets.length===1);}if(window.rejectNext){window.rejectNext=false;throw Object.assign(Error('Test wallet rejected'),{code:4001});}}
 const response=await fetch('${rpcUrl}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});const data=await response.json();if(data.error)throw Error(data.error.message);return data.result;
}};window.testWalletChange=()=>{window.testAccount='${other}';for(const fn of listeners.accountsChanged||[])fn(['${other}']);};
localStorage.setItem('road:factory:1337','${factoryAddress}');
const root=createRoot(document.getElementById('root'));window.showRecovery=wallet=>root.render(<RecoveryVault key={wallet} wallet={wallet}/>);window.showMint=()=>{window.testAccount='${account}';root.render(<MintStudioDemo wallet="${account}"/>);};root.render(<main style={{maxWidth:1100,margin:'0 auto',padding:20}}><WalletBricks wallet="${account}" onConnect={()=>{}}/></main>);`,{flag:'wx'});
  const {createServer}=await import(require.resolve('vite',{paths:[web]})),{default:react}=await import(require.resolve('@vitejs/plugin-react',{paths:[web]}));
  vite=await createServer({root:web,cacheDir:path.join(root,'.road-local/editor-browser-cache'),configFile:false,envFile:false,plugins:[react()],server:{host:'127.0.0.1',port:0,fs:{deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/.road-local/**']}},logLevel:'error'});await vite.listen();
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1280,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/road-ipfs/content/*',route=>{const bytes=store.get(new URL(route.request().url()).pathname.split('/').at(-1));return route.fulfill({status:bytes?200:404,contentType:'application/octet-stream',body:bytes||Buffer.alloc(0)});});
  await page.route('**/api/road-ipfs/upload',route=>{uploads++;const bytes=route.request().postDataBuffer();assert.equal(bytes.subarray(0,8).toString(),'0ZROAD01');assert.ok(!bytes.includes(Buffer.from(secret)));return route.fulfill({contentType:'application/json',body:JSON.stringify(pin(bytes))});});
  await page.route('**/api/road-ipfs/health',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,peerId:'test-node'})}));
  await page.addInitScript(({rpcUrl,factoryAddress})=>localStorage.setItem('road:mint:network:v1',JSON.stringify({version:1,data:{network:'ganache',rpcUrl,ganacheChainId:'1337',useStartupFactory:false,factories:{['ganache:1337:'+rpcUrl]:factoryAddress}}})),{rpcUrl,factoryAddress});
  await page.goto('http://127.0.0.1:'+vite.httpServer.address().port+'/'+stem+'.html');
  await page.getByRole('button',{name:'Find my on-chain Bricks',exact:true}).click();await page.getByRole('button',{name:'Edit Brick',exact:true}).click();
  const editor=page.getByRole('region',{name:'Brick editor',exact:true});await editor.waitFor();await page.waitForFunction(()=>document.querySelector('[aria-label="Edit work details"]')?.getAttribute('aria-busy')==='false');assert.equal(await page.evaluate(()=>window.walletWrites),0);
  await editor.getByLabel('Private recovery file',{exact:true}).setInputFiles({name:'wrong.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...backup,key:'wrong-test-recovery-secret'}))});await editor.getByRole('alert').filter({hasText:'key is incorrect'}).waitFor();assert.equal(await editor.getByLabel('Title',{exact:true}).count(),0);
  await editor.getByLabel('Private recovery file',{exact:true}).setInputFiles(recoveryFile);await editor.getByLabel('Title',{exact:true}).waitFor();
  assert.equal(await editor.getByLabel('Title',{exact:true}).inputValue(),'Original artwork title');assert.equal(await editor.getByLabel('Album / release',{exact:true}).count(),0);
  await editor.getByRole('tab',{name:'Content controls',exact:true}).click();await editor.getByRole('button',{name:'Read current policy',exact:true}).click();await editor.getByText(/Files permanently locked/).waitFor();assert.equal(await editor.getByLabel('Play Audio Preview',{exact:true}).count(),0);
  await editor.getByRole('tab',{name:'Work details',exact:true}).click();await editor.getByLabel('Title',{exact:true}).fill('Edited artwork title');await editor.getByLabel('Description',{exact:true}).fill('A corrected artwork description.');
  page.once('dialog',dialog=>dialog.dismiss());await editor.getByRole('button',{name:'Back to My Bricks',exact:true}).click();assert.equal(await editor.isVisible(),true);
  await editor.getByRole('button',{name:'Review changes',exact:true}).click();await editor.getByRole('region',{name:'Review Brick changes',exact:true}).waitFor();
  fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'brick-editor-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({path:path.join(out,'brick-editor-mobile.png'),fullPage:true});
  await page.evaluate(()=>{window.rejectNext=true;});await editor.getByRole('button',{name:'Save changes to Brick',exact:true}).click();await editor.getByRole('alert').waitFor();assert.equal(uploads,1);assert.equal(await editor.getByLabel('Title',{exact:true}).inputValue(),'Edited artwork title');
  await editor.getByRole('button',{name:'Save changes to Brick',exact:true}).click();await editor.getByRole('status').filter({hasText:'Saved to this Brick as metadata version 2'}).waitFor();assert.equal(uploads,1,'Wallet rejection retry reuses the verified encrypted pin');
  const downloadEvent=page.waitForEvent('download');await editor.getByRole('button',{name:'Download updated recovery file',exact:true}).click();const download=await downloadEvent;const downloaded=JSON.parse(fs.readFileSync(await download.path()));assert.equal(downloaded.key,secret);assert.equal(downloaded.metadata.length,1);
  const stored=await page.evaluate(()=>JSON.stringify({...localStorage}));assert.ok(!stored.includes(secret));assert.ok(!stored.includes('Edited artwork title'));
  await editor.getByRole('button',{name:'Back to My Bricks',exact:true}).click();await page.getByRole('button',{name:'Edit Brick',exact:true}).click();await editor.getByRole('status').filter({hasText:'Loaded saved recovery file · verified metadata version 2'}).waitFor();assert.equal(await editor.getByLabel('Title',{exact:true}).inputValue(),'Edited artwork title');
  await page.reload();await page.getByRole('button',{name:'Find my on-chain Bricks',exact:true}).click();await page.getByRole('button',{name:'Edit Brick',exact:true}).click();await editor.getByRole('status').filter({hasText:'Loaded saved recovery file · verified metadata version 2'}).waitFor();assert.equal(await editor.getByLabel('Title',{exact:true}).inputValue(),'Edited artwork title');
  await page.evaluate(()=>window.testWalletChange());await editor.getByRole('alert').filter({hasText:'wallet or network changed'}).waitFor();assert.equal(await editor.getByLabel('Title',{exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>window.walletWrites),0,'Reload and automatic recovery require no wallet write');assert.deepEqual(errors,[]);
  // Local collection: atomic imports, durable IndexedDB, wallet isolation and downloads.
  const vaultUploads=uploads,requests=[];const watch=r=>requests.push({method:r.method(),url:r.url()});page.on('request',watch);
  await page.evaluate(wallet=>window.showRecovery(wallet),account);
  const collection=page.getByRole('region',{name:'Local recovery files'}),fileInput=collection.getByLabel('Import private recovery files',{exact:true});
  await collection.getByText(/2 saved files/).waitFor();
  await fileInput.setInputFiles(recoveryFile);await collection.getByRole('status').filter({hasText:'saved on this browser'}).waitFor();assert.equal(await collection.locator('.rv-file').count(),2,'Reimport deduplicates');
  const extra=n=>({name:'extra-'+n+'.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...backup,key:'test-extra-recovery-secret-'+n}))});
  await fileInput.setInputFiles([extra(1),{name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{}')}]);await collection.getByRole('alert').waitFor();assert.equal(await collection.locator('.rv-file').count(),2,'Invalid batch is atomic');
  await fileInput.setInputFiles([extra(1),extra(2)]);await collection.getByRole('status').filter({hasText:'2 recovery file(s) saved'}).waitFor();assert.equal(await collection.locator('.rv-file').count(),4);
  const allEvent=page.waitForEvent('download');await collection.getByRole('button',{name:'Download all',exact:true}).click();const allDownload=await allEvent,allBytes=fs.readFileSync(await allDownload.path()),all=JSON.parse(allBytes);assert.equal(all.wallet,account.toLowerCase());assert.equal(all.files.length,4);assert.ok(all.files.some(f=>f.kit.key===secret));
  const bundle={name:'collection.json',mimeType:'application/json',buffer:allBytes};
  await page.evaluate(wallet=>window.showRecovery(wallet),other);await collection.getByText(/0 saved files/).waitFor();await fileInput.setInputFiles(bundle);await collection.getByRole('alert').filter({hasText:'another wallet'}).waitFor();assert.equal(await collection.locator('.rv-file').count(),0);
  await page.evaluate(async({account,other,backup})=>{const v=await import('/src/recovery-vault.js');await v.saveRecoveryFile({wallet:other,kit:backup});const record=(await v.listRecoveryFiles(account))[0];await v.removeRecoveryFile(other,record.id);await Promise.all([1,2,3].map(n=>v.saveRecoveryFile({wallet:other,kit:{...backup,key:'concurrent-test-secret-'+n}})));if((await v.listRecoveryFiles(other)).length!==4||(await v.listRecoveryFiles(account)).length!==4)throw Error('Wallet isolation or concurrent writes failed');},{account,other,backup});
  await page.evaluate(wallet=>window.showRecovery(wallet),account);await collection.getByText(/4 saved files/).waitFor();
  const oneEvent=page.waitForEvent('download');await collection.getByRole('button',{name:'Download file',exact:true}).first().click();const one=JSON.parse(fs.readFileSync(await (await oneEvent).path()));assert.ok(one.key);assert.equal(one.format,'0x-road-ipfs-recovery-v2');
  page.once('dialog',d=>d.accept());await collection.getByRole('button',{name:'Remove',exact:true}).first().click();await collection.getByRole('status').filter({hasText:'removed from this browser'}).waitFor();assert.equal(await collection.locator('.rv-file').count(),3);
  await fileInput.setInputFiles(bundle);await collection.getByRole('status').filter({hasText:'4 recovery file(s) saved'}).waitFor();
  assert.equal(uploads,vaultUploads);assert.deepEqual(requests.filter(r=>r.method==='POST'),[],'Collecting/exporting keys never sends them to a server');page.off('request',watch);
  await page.reload();await page.evaluate(wallet=>window.showRecovery(wallet),account);await collection.getByText(/4 saved files/).waitFor();
  await page.setViewportSize({width:1280,height:1000});await page.screenshot({path:path.join(out,'recovery-files-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({path:path.join(out,'recovery-files-mobile.png'),fullPage:true});
  // The actual IPFS mint saves recovery before the wallet write and binds it after confirmation.
  await page.evaluate(()=>{window.checkMintRecovery=true;window.showMint();});
  await page.getByLabel('Select a type of intellectual property',{exact:true}).selectOption('illustration');await page.getByRole('button',{name:'Continue →',exact:true}).click();
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAIUlEQVR4nGP8f9kpxjeSgYGBMVphNgMMMDEgARQOAMDRBDMbPbpyAAAAAElFTkSuQmCC','base64');
  await page.getByLabel('Choose Artwork or illustration',{exact:true}).setInputFiles({name:'new-art.png',mimeType:'image/png',buffer:png});await page.getByText('✓ Ready',{exact:true}).waitFor();
  await page.getByRole('checkbox',{name:'Upload encrypted files to my local YBR IPFS node (experimental)',exact:true}).check();await page.getByRole('button',{name:'Encrypt & Continue →',exact:true}).click();
  await page.getByLabel('Work title',{exact:true}).fill('Auto saved mint');await page.getByLabel('Creator / claimant',{exact:true}).fill('Test artist');await page.getByRole('button',{name:'Continue →',exact:true}).click();
  await page.getByRole('button',{name:'Review wallet mint →',exact:true}).click();await page.getByRole('button',{name:'Mint Bricks',exact:true}).click();await page.getByRole('heading',{name:'Registration complete',exact:true}).waitFor({timeout:30000});
  assert.equal(await page.evaluate(()=>window.mintRecoveryBeforeWrite),true);
  const minted=await page.evaluate(async wallet=>{const {listRecoveryFiles}=await import('/src/recovery-vault.js');return (await listRecoveryFiles(wallet)).filter(r=>r.title==='Auto saved mint');},account);
  assert.equal(minted.length,1,'Binding enrichment must not duplicate the saved file');assert.equal(minted[0].bindings.length,1);assert.equal(minted[0].kit.assets.length,1);assert.equal(minted[0].kit.metadata.length,1);
  assert.equal(minted[0].bindings[0].factoryAddress,factoryAddress.toLowerCase());assert.deepEqual(errors,[]);
  console.log('BRICK EDITOR PASS: My Bricks entry, live commitment + private recovery verification, locked visual-work edits, no Player controls, review, rejected-wallet retry, exact chain save, recovery export, automatic reopen/reload, account invalidation, wallet-scoped bulk collection, atomic import, concurrent storage, downloads/removal, IPFS mint auto-save and mobile layouts.');
 }catch(error){if(page){fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'brick-editor-failure.png'),fullPage:true}).catch(()=>{});}throw Error([error.shortMessage||error.message,error.details].filter(Boolean).join('\n'));}
 finally{await browser?.close();await vite?.close();await server.close();for(const file of [html,jsx])fs.rmSync(file,{force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
