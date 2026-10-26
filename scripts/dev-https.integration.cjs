'use strict';
/** CI-only real local stack. Temporary test CA; no OS trust change or public ETH.
 * Node clients verify the test CA. Chromium accepts the synthetic cert only in
 * its isolated test context; installing trust in macOS Keychain is not tested. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),WEB='https://127.0.0.1:5173',PLAYER='https://127.0.0.1:4173';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const rpc=async(method,params=[])=>{
 const r=await fetch('http://127.0.0.1:8545',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});const json=await r.json();if(json.error)throw Error(json.error.message);return json.result;
};
async function worker(){
 const status=await(await fetch(PLAYER+'/road/api/status')).json();assert.equal(status.chainId,1337);assert.equal(status.ready,true);
 const headers={'Content-Type':'application/json',Origin:WEB};
 const read=await fetch(WEB+'/road/rpc',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId'})});assert.equal(read.status,200);assert.equal((await read.json()).result,'0x539');
 const ipfs=await fetch(WEB+'/api/road-ipfs/health',{headers:{Origin:WEB}});assert.equal(ipfs.status,200);assert.equal((await ipfs.json()).ok,true);
 const forbidden=await fetch(WEB+'/road/rpc',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_sendTransaction'})});assert.equal(forbidden.status,400);
 const config=await fetch(WEB+'/api/player-publish/config',{headers:{Origin:WEB}});assert.equal(config.status,200);assert.ok((await config.json()).token);
 const cross=await fetch(PLAYER+'/api/session/demo',{method:'POST',headers:{...headers,Origin:'https://foreign.invalid'},body:'{}'});assert.equal(cross.status,403);
 const login=await fetch(PLAYER+'/api/session/demo',{method:'POST',headers:{...headers,Origin:PLAYER},body:'{}'});assert.equal(login.status,200);assert.equal((await login.json()).user,'artist');assert.match(login.headers.get('set-cookie'),/; Secure/);
 const blocked=await fetch(WEB+'/@fs'+path.join(ROOT,'.road-local/tls/key.pem'));assert.ok([403,404].includes(blocked.status));assert.doesNotMatch(await blocked.text(),/BEGIN .*PRIVATE KEY/);
 const {createPublicClient,http}=require(require.resolve('viem',{paths:[path.join(ROOT,'web')]}));
 const client=createPublicClient({transport:http(WEB+'/road/rpc',{retryCount:0,fetchOptions:{headers:{Origin:WEB}}})});
 assert.equal(await client.getChainId(),1337);assert.ok(await client.getBlockNumber()>=0n);
 const account=(await rpc('eth_accounts'))[0],nonce=await rpc('eth_getTransactionCount',[account,'latest']);
 // Browser code uses the real launcher-selected gateway. This explicit test
 // wallet bridge submits only to this CI's local Ganache, never to public RPCs.
 const {chromium}=require('/tmp/ybr-https-browser/node_modules/playwright');const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({ignoreHTTPSErrors:true});const page=await context.newPage();
  const httpRequests=[];page.on('request',request=>{if(request.url().startsWith('http:'))httpRequests.push(request.url());});
  let walletWrites=0;
  const allowed=new Set(['eth_requestAccounts','eth_call','eth_getCode','eth_getLogs','eth_getTransactionReceipt','eth_getTransactionByHash','eth_blockNumber','eth_chainId','eth_accounts','eth_getBlockByNumber','eth_getBlockByHash','eth_sendTransaction','eth_estimateGas','eth_getTransactionCount','eth_gasPrice','eth_maxPriorityFeePerGas']);
  await page.exposeFunction('testWalletRpc',async({method,params})=>{assert.ok(allowed.has(method),'unexpected wallet method '+method);if(method==='eth_sendTransaction')walletWrites++;return rpc(method==='eth_requestAccounts'?'eth_accounts':method,params||[]);});
  await page.addInitScript(()=>{window.ethereum={request:args=>window.testWalletRpc(args),on(){},removeListener(){}};});
  await page.goto(WEB);assert.equal(await page.evaluate(()=>isSecureContext),true);
  const result=await page.evaluate(async({account,factoryAddress})=>{
   const {mintWithReviewedCover}=await import('/src/nft-cover-mint.js');
   const {makeRegistrationPacket}=await import('/src/mint-model.js');
   const {DEFAULT_CONTENT_POLICY}=await import('/src/content-policy.js');
   const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAIUlEQVR4nGP8f9kpxjeSgYGBgYGBMVphNgMMMDEgARQOAMDRBDMbPbpyAAAAAElFTkSuQmCC'),c=>c.charCodeAt(0));
   const coverHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
   const packet=makeRegistrationPacket({metadata:{title:'HTTPS atomic release',artist:'Original test creator',songwriters:'Original test writer'},
    assets:{master:{name:'original.wav',type:'audio/wav',size:4,hash:'ab'.repeat(32)},artwork:{name:'cover.png',type:'image/png',size:bytes.length,hash:coverHash}},
    identity:{mode:'external',connected:true,address:account},composition:true,royalties:{creatorBps:10000},training:'not-authorized',storage:'demo-encrypted-in-browser',contentPolicy:DEFAULT_CONTENT_POLICY});
   return mintWithReviewedCover({provider:window.ethereum,network:'ganache',chainId:1337,rpcUrl:'http://127.0.0.1:8545',factoryAddress,packet,nftCover:{bytes,sourceDigest:'0x'+coverHash,consent:true}});
  },{account,factoryAddress:status.factoryAddress});
  assert.equal(result.status,'confirmed');assert.equal(result.atomic,true);assert.equal(result.receipts.length,3);assert.equal(walletWrites,1);
  assert.ok(result.receipts.every(r=>r.status==='verified'&&r.transactionHash===result.transactionHash));assert.equal(result.nftCover.status,'verified');
  assert.equal(BigInt(await rpc('eth_getTransactionCount',[account,'latest'])),BigInt(nonce)+1n);
  // These are the actual collection views against the just-mined contracts and
  // pinned PNG, not a mock thumbnail resolver or a local-preview substitute.
  await page.locator('button.wallet').click();
  const cid=result.nftCover.imageURI.slice(7);
  for(const view of ['My Bricks','IP Registry']){
   await page.getByRole('button',{name:view,exact:true}).click();
   if(view==='My Bricks')await page.getByRole('button',{name:'Find my on-chain Bricks'}).click();
   await page.waitForFunction(cid=>Array.from(document.querySelectorAll('.br-record img')).filter(img=>img.src.endsWith('/'+cid)&&img.naturalWidth>0).length>=3,cid,{timeout:45000});
  }
  assert.equal(walletWrites,1,'Viewing NFTs never asks for another artwork or mint transaction');
  assert.deepEqual(httpRequests,[],'Browser traffic must not downgrade to HTTP');
  const link=page.locator('a.aside-link').filter({hasText:'YBR Player'});assert.equal(await link.evaluate(el=>el.href),PLAYER+'/');
  await page.goto(PLAYER);await page.waitForFunction(()=>document.body.innerText.includes('artist'));
  assert.equal(await page.evaluate(()=>isSecureContext),true);
  await page.waitForFunction(()=>document.documentElement.dataset.playerSettings==='ready');
  await page.locator('#settingsShortcut').click();
  assert.equal(await page.locator('#settingsWorkspace').getAttribute('href'),WEB+'/');
  await page.getByRole('tab',{name:'Colors & themes'}).click();
  await page.getByRole('button',{name:'Neon Road',exact:true}).click();
  await page.getByRole('button',{name:'Save appearance',exact:true}).click();
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.playerSettings==='ready');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ybr:player:appearance:v1')).active.name),'Neon Road');
  assert.equal(await page.locator('#audio').evaluate(audio=>audio.paused&&!audio.src),true);
  assert.deepEqual(httpRequests,[],'Player settings and workspace links must not downgrade HTTPS');
  await context.close();
 }finally{await browser.close();}
 console.log('HTTPS ATOMIC MINT PASS: three Bricks and initial covers in one transaction; actual Registry/My Bricks PNGs; trusted Node CA, Secure artist session, same-origin preview/bridge, no mixed HTTP, blocked key files and signing proxy. Synthetic CA; not live MetaMask.');
}
async function main(){
 if(process.env.CI!=='true'&&process.env.CI!=='1')throw Error('This isolated stack test is CI-only.');
 if(process.argv.includes('--worker'))return worker();
 const {createTestTls}=require('./dev-https-fixture.cjs');const tlsDir=createTestTls(ROOT);
 const {prepareHttpsEnvironment}=require('./dev-https.cjs');const env=prepareHttpsEnvironment(ROOT,{...process.env,YBR_ACTIVE_NETWORK:'ganache',YBR_PLAYER_AUTO_LOGIN:'1'});
 // CI must never inherit a remote signing configuration.
 delete env.SEPOLIA_PRIVATE_KEY;delete env.YBR_DEV_HTTP;
 const child=spawn(process.execPath,['scripts/dev.cjs','--plain','--restart-player'],{cwd:ROOT,env,stdio:['ignore','pipe','pipe']});
 let log='';for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{log=(log+b.toString()).slice(-30000);});
 try{
  let ready=false;for(let n=0;n<120;n++){if(child.exitCode!==null)throw Error('HTTPS stack exited: '+log);if(log.includes('INTEGRATED ROAD READY')){ready=true;break;}await wait(500);}assert.ok(ready,log);
  const done=spawn(process.execPath,[__filename,'--worker'],{cwd:ROOT,env,stdio:'inherit'});
  const code=await new Promise((resolve,reject)=>{done.once('error',reject);done.once('exit',resolve);});assert.equal(code,0);
 }finally{
  if(child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},10000);child.once('exit',()=>{clearTimeout(timer);resolve();});});}
  fs.rmSync(tlsDir,{recursive:true,force:true});
 }
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
