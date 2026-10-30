'use strict';
/** Disposable chain + isolated Vite + real Chromium; never touches the user's stack. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto'),{pathToFileURL}=require('node:url');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.YBR_BROWSER_DEPS||'/tmp/ybr-browser']}));
const root=path.resolve(__dirname,'..'),web=path.join(root,'web'),stem='reuse-bricks-browser-'+process.pid;
const html=path.join(web,stem+'.html'),jsx=path.join(web,'src',stem+'.jsx');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAIUlEQVR4nGP8f9kpxjeSgYGBMVphNgMMMDEgARQOAMDRBDMbPbpyAAAAAElFTkSuQmCC','base64');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const load=file=>import(pathToFileURL(path.join(web,'src',file)));
async function main(){
 const ganache=require('ganache'),server=ganache.server({logging:{quiet:true},chain:{chainId:1337},wallet:{deterministic:true}});
 let vite,browser,page;const errors=[];
 try{
  await server.listen(0,'127.0.0.1');const rpcUrl='http://127.0.0.1:'+server.address().port;
  const {createPublicClient,createWalletClient,http}=await import(require.resolve('viem',{paths:[web]}));
  const {privateKeyToAccount}=await import(require.resolve('viem/accounts',{paths:[web]}));
  const {mintOnChain,localConfig}=await load('chain-mint.js'),{makeRegistrationPacket}=await load('mint-model.js'),{DEFAULT_CONTENT_POLICY}=await load('content-policy.js');
  const accounts=Object.values(server.provider.getInitialAccounts()).slice(0,2).map(a=>privateKeyToAccount(a.secretKey));
  const account=accounts[0],chain=localConfig(rpcUrl,1337),client=createPublicClient({chain,transport:http(rpcUrl)}),wallet=createWalletClient({account,chain,transport:http(rpcUrl)});
  const artifact=JSON.parse(fs.readFileSync(path.join(root,'artifacts/contracts/YellowBrickFactory.sol/YellowBrickFactory.json')));
  const deployed=await wallet.deployContract({abi:artifact.abi,bytecode:artifact.bytecode}),factoryAddress=(await client.waitForTransactionReceipt({hash:deployed})).contractAddress;
  const provider={request:async({method,params=[]})=>method==='eth_accounts'?[account.address]:method==='eth_sendTransaction'?wallet.sendTransaction({to:params[0].to,data:params[0].data,gas:BigInt(params[0].gas)}):server.provider.request({method,params})};
  const packet=makeRegistrationPacket({metadata:{title:'First EP track',artist:'Writer A',songwriters:'Writer A'},assets:{master:{name:'first.wav',hash:digest(Buffer.from('first')),size:5},artwork:{name:'ep-cover.png',type:'image/png',hash:digest(png),size:png.length}},identity:{mode:'external',address:account.address,connected:true},composition:true,royalties:{creatorBps:10000},training:'not-authorized',storage:'local',contentPolicy:DEFAULT_CONTENT_POLICY});
  const mint=await mintOnChain({packet,provider,rpcUrl,chainId:1337,factoryAddress});
  const previousArt=mint.receipts.find(r=>r.sourceId==='artwork').contractAddress;
  fs.writeFileSync(html,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/src/'+stem+'.jsx"></script></body></html>',{flag:'wx'});
  fs.writeFileSync(jsx,`import React from 'react';import {createRoot} from 'react-dom/client';import MintStudioDemo from './MintStudioDemo.jsx';
window.walletWrites=0;window.ethereum={request:async({method,params=[]})=>{
 if(/send|sign/i.test(method)){window.walletWrites++;if(!window.allowTestMint)throw Error('No browser writes in this test');}
 if(method==='eth_accounts')return ['${account.address}'];
 const r=await fetch('${rpcUrl}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});const j=await r.json();if(j.error)throw Error(j.error.message);return j.result;
}};createRoot(document.getElementById('root')).render(<MintStudioDemo wallet="${account.address}"/>);`,{flag:'wx'});
  const {createServer}=await import(require.resolve('vite',{paths:[web]})),{default:react}=await import(require.resolve('@vitejs/plugin-react',{paths:[web]}));
  vite=await createServer({root:web,cacheDir:path.join(root,'.road-local/reuse-browser-vite-cache'),configFile:false,envFile:false,plugins:[react()],server:{host:'127.0.0.1',port:5297,strictPort:true,fs:{deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/.road-local/**']}},logLevel:'error'});await vite.listen();
  browser=await chromium.launch({headless:true,...(process.env.YBR_BROWSER_CHANNEL?{channel:process.env.YBR_BROWSER_CHANNEL}:{})});page=await browser.newPage({viewport:{width:1280,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  const uploads=[];page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/road-ipfs'))uploads.push(r.url());});
  await page.addInitScript(({rpcUrl,factoryAddress})=>localStorage.setItem('road:mint:network:v1',JSON.stringify({version:1,data:{network:'ganache',rpcUrl,ganacheChainId:'1337',useStartupFactory:false,factories:{['ganache:1337:'+rpcUrl]:factoryAddress}}})),{rpcUrl,factoryAddress});
  await page.goto('http://127.0.0.1:5297/'+stem+'.html');await page.getByRole('button',{name:'Continue →',exact:true}).click();
  const labels=page.locator('.ms-files>label');for(let i=0;i<await labels.count();i++)assert.equal(await labels.nth(i).locator('small').count(),1,'Each empty field has one description');
  await page.getByLabel('Choose Master recording',{exact:true}).setInputFiles({name:'second.wav',mimeType:'audio/wav',buffer:Buffer.from('different master')});
  await page.getByLabel('Choose Cover artwork',{exact:true}).setInputFiles({name:'renamed-cover.png',mimeType:'image/png',buffer:png});
  const matches=page.getByRole('region',{name:'Matching uploaded files'}),reuse=matches.getByRole('button',{name:'Use previous cover artwork Brick',exact:true});await reuse.click();
  await matches.getByRole('button',{name:'Previous Brick selected',exact:true}).waitFor();assert.ok((await matches.textContent()).toLowerCase().includes(previousArt.toLowerCase()));
  await page.getByRole('button',{name:'Encrypt & Continue →',exact:true}).click();await page.getByLabel('Track title',{exact:true}).waitFor();
  const compositionToggle=page.getByRole('checkbox',{name:'Independent Songwriting / Composition Brick (default)',exact:true});
  await compositionToggle.uncheck();assert.match(await page.locator('.ms-panel').textContent(),/Existing Bricks in this Building/);
  await compositionToggle.check();assert.ok((await page.locator('.ms-panel').textContent()).toLowerCase().includes(previousArt.toLowerCase()));
  assert.equal(await page.locator('details.ms-reference-tools').evaluate(el=>el.open),false);
  await page.locator('details.ms-reference-tools>summary').click();assert.equal(await page.getByRole('button',{name:'+ Add existing Brick reference',exact:true}).isVisible(),true);await page.locator('details.ms-reference-tools>summary').click();
  await page.getByLabel('Track title',{exact:true}).fill('Second EP track');await page.getByLabel('Recording artist / claimant',{exact:true}).fill('Writer A');await page.getByLabel('Songwriters / composers (comma-separated)',{exact:true}).fill('Writer A, Writer B');
  await page.getByRole('button',{name:'Continue →',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Songwriter splits'});await dialog.waitFor();
  await dialog.getByLabel('Writer A share (%)',{exact:true}).fill('60');await dialog.getByLabel('Writer B share (%)',{exact:true}).fill('60');
  await dialog.getByLabel('Writer A wallet',{exact:true}).fill(account.address);await dialog.getByLabel('Writer B wallet',{exact:true}).fill(accounts[1].address);
  const ack=dialog.getByRole('checkbox');await ack.check();await dialog.getByRole('button',{name:'Save songwriter splits',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'exactly 100%'}).waitFor();
  await dialog.getByLabel('Writer B share (%)',{exact:true}).fill('40');await ack.check();
  const out=path.join(root,'.road-local/player-browser-results');fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'songwriter-splits-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'songwriter-splits-mobile.png'),fullPage:true});assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Dialog has no horizontal overflow');
  await dialog.getByRole('button',{name:'Save songwriter splits',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Continue →',exact:true}).click();await page.getByRole('heading',{name:'04. Review mint.',exact:true}).waitFor();
  await page.getByRole('button',{name:'Review wallet mint →',exact:true}).click();const confirmation=page.getByRole('dialog');await confirmation.waitFor();assert.match(await confirmation.textContent(),/Mint 2 new Bricks and reuse 1 existing Bricks/);await confirmation.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'← Back',exact:true}).click();await page.getByLabel('Songwriters / composers (comma-separated)',{exact:true}).fill('Writer A, Writer C');await page.getByRole('button',{name:'Continue →',exact:true}).click();await dialog.waitFor();assert.equal(await dialog.getByLabel('Writer C share (%)',{exact:true}).count(),1);await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'← Back',exact:true}).click();await page.getByLabel('Choose Cover artwork',{exact:true}).setInputFiles({name:'different.png',mimeType:'image/png',buffer:Buffer.concat([png,Buffer.from('different')])});await page.waitForFunction(()=>!document.body.innerText.includes('Hashing…'));assert.equal(await page.getByRole('button',{name:'Previous Brick selected',exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>window.walletWrites),0);assert.deepEqual(uploads,[]);assert.deepEqual(errors,[]);
  // Saved music approvals must not appear in visual IP registration, including results.
  await page.evaluate(()=>{localStorage.removeItem('road:mint:form:v1');localStorage.setItem('road:creator-defaults:v1',JSON.stringify({version:1,data:{enabled:true,delivery:true,contentPolicy:{locked:true,preview:true,artwork:true,lyrics:true}}}));});
  const {getIpCategory}=await load('ip-catalog.js');
  for(const id of ['photograph','painting','digital-art','illustration']){
   await page.reload();await page.getByLabel('Select a type of intellectual property',{exact:true}).selectOption(id);
   await page.getByRole('button',{name:'Continue →',exact:true}).click();
   assert.equal(await page.getByLabel('Choose Audio preview',{exact:true}).count(),0);
   assert.doesNotMatch(await page.locator('.ms-panel').textContent(),/Audio Preview uses MP3/);
   await page.getByLabel('Choose '+getIpCategory(id).primary,{exact:true}).setInputFiles({name:id+'.png',mimeType:'image/png',buffer:png});
   await page.getByRole('button',{name:'Encrypt & Continue →',exact:true}).click();
   const protection=page.getByRole('region',{name:'Pre-mint content protection',exact:true});await protection.waitFor();
   assert.equal(await protection.getByRole('switch').isChecked(),true);assert.doesNotMatch(await page.locator('.ms-panel').textContent(),/Player/);
   await page.getByLabel('Work title',{exact:true}).fill('Visual '+id);await page.getByLabel('Creator / claimant',{exact:true}).fill('Visual creator');
   await page.getByRole('button',{name:'Continue →',exact:true}).click();
   await page.getByRole('region',{name:'Content protection summary',exact:true}).waitFor();assert.doesNotMatch(await page.locator('.ms-panel').textContent(),/Player/);
   assert.equal(await page.getByRole('button',{name:'Preview cover for NFTs',exact:true}).isVisible(),true);
   if(id==='illustration'){
    await page.getByRole('button',{name:'Preview cover for NFTs',exact:true}).click();await page.getByAltText('NFT image included at mint',{exact:true}).waitFor();
    await page.setViewportSize({width:1280,height:1000});await page.screenshot({path:path.join(out,'graphic-mint-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'graphic-mint-mobile.png'),fullPage:true});
   }
   await page.getByRole('button',{name:'Review wallet mint →',exact:true}).click();await confirmation.waitFor();
   assert.doesNotMatch(await confirmation.textContent(),/Player/);assert.match(await confirmation.textContent(),/Mint 1 new Bricks and reuse 0 existing Bricks/);
   if(id!=='illustration'){await confirmation.getByRole('button',{name:'Cancel',exact:true}).click();continue;}
   await page.evaluate(()=>{window.allowTestMint=true;});
   await confirmation.getByRole('button',{name:'Request mint transaction',exact:true}).click();
   await confirmation.getByRole('heading',{name:'Registration complete',exact:true}).waitFor();assert.doesNotMatch(await confirmation.textContent(),/Player/);
   await confirmation.getByRole('button',{name:'View receipts →',exact:true}).click();
  }
  const results=page.locator('.br-result');await results.waitFor();assert.doesNotMatch(await results.textContent(),/Player/);
  assert.match(await results.textContent(),/1 new Brick receipts · 0 existing references/);assert.equal(await page.evaluate(()=>window.walletWrites),1);
  const readPacket=async()=>{const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download JSON packet ↓',exact:true}).click();return JSON.parse(fs.readFileSync(await (await download).path(),'utf8'));};
  const visualPacket=await readPacket(),originalReceipt=visualPacket.onChainMint.receipts[0];
  const {readBrickPolicy}=await load('content-policy-chain.js');
  const visualPolicy=await readBrickPolicy({provider,chainId:1337,factoryAddress,brickAddress:originalReceipt.contractAddress});
  assert.equal(visualPolicy.permissions,0);assert.equal(visualPolicy.locked,true);
  // Reusing that original image produces a reference to the same NFT and no wallet write.
  await page.reload();await page.getByLabel('Select a type of intellectual property',{exact:true}).selectOption('illustration');await page.getByRole('button',{name:'Continue →',exact:true}).click();
  await page.getByLabel('Choose Artwork or illustration',{exact:true}).setInputFiles({name:'same-graphic-renamed.png',mimeType:'image/png',buffer:png});
  await page.getByRole('button',{name:'Use previous recording / primary work Brick',exact:true}).click();
  await page.getByRole('button',{name:'Encrypt & Continue →',exact:true}).click();await page.getByLabel('Creator / claimant',{exact:true}).fill('Visual creator');
  assert.equal(await page.getByRole('region',{name:'Pre-mint content protection',exact:true}).count(),0);
  await page.getByRole('button',{name:'Continue →',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Preview cover for NFTs',exact:true}).count(),0);
  await page.getByRole('button',{name:'Review wallet mint →',exact:true}).click();await confirmation.waitFor();
  assert.match(await confirmation.textContent(),/Mint 0 new Bricks and reuse 1 existing Bricks/);
  await confirmation.getByRole('button',{name:'Confirm Brick reuse',exact:true}).click();await confirmation.getByRole('heading',{name:'Building references ready',exact:true}).waitFor();
  await confirmation.getByRole('button',{name:'View receipts →',exact:true}).click();
  assert.match(await results.textContent(),/0 new Brick receipts · 1 existing references/);assert.equal(await page.getByRole('button',{name:'Customize NFT appearance',exact:true}).count(),0);
  const reusedPacket=await readPacket(),reusedReceipt=reusedPacket.onChainMint.receipts[0];
  for(const key of ['contractAddress','nftContractAddress','tokenId','transactionHash'])assert.equal(reusedReceipt[key],originalReceipt[key],key);
  assert.equal(reusedReceipt.reused,true);assert.equal(await page.evaluate(()=>window.walletWrites),0);assert.deepEqual(uploads,[]);assert.deepEqual(errors,[]);
  console.log('PASS: exact artwork reuse survives composition changes; songwriter splits; visual category controls, thumbnail preview, saved-default isolation, real graphic mint and original-NFT reuse without another transaction; desktop/mobile coverage.');
 }catch(error){if(page){fs.mkdirSync(path.join(root,'.road-local/player-browser-results'),{recursive:true});await page.screenshot({path:path.join(root,'.road-local/player-browser-results/reuse-bricks-failure.png'),fullPage:true}).catch(()=>{});}throw error;}
 finally{await browser?.close();await vite?.close();await server.close();fs.rmSync(html,{force:true});fs.rmSync(jsx,{force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
