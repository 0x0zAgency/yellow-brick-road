import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import ganache from 'ganache';
import {createWalletClient,createPublicClient,http,parseAbi} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {mintOnChain,preflightPolicyMint,localConfig} from '../src/chain-mint.js';
import {makeRegistrationPacket} from '../src/mint-model.js';
import {encryptDemoBatch} from '../src/demo-vault.js';
import {buildPlayerRelease,publishPlayerRelease} from '../src/player-release.js';
import {reviewPlayerDelivery,deliverPlayerAfterMint} from '../src/player-delivery.js';
import {DEFAULT_CONTENT_POLICY} from '../src/content-policy.js';
import {readBrickPolicy,updateBrickPolicy} from '../src/content-policy-chain.js';
const require=createRequire(import.meta.url);
const {makeGateway}=require('../../apps/ybr-player/road-music');
const {createApp}=require('../../apps/ybr-player/server');
const {createStudioLibrary}=require('../../apps/ybr-player/studio-releases');
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

test('real signed mint initializes permissions and Player checks revocation, hashes and permanent locking',async t=>{
 const ganacheServer=ganache.server({logging:{quiet:true},chain:{chainId:1337},wallet:{deterministic:true}});
 await ganacheServer.listen(0,'127.0.0.1');t.after(()=>ganacheServer.close());
 const rpcUrl='http://127.0.0.1:'+ganacheServer.address().port,chain=localConfig(rpcUrl,1337);
 const account=privateKeyToAccount(Object.values(ganacheServer.provider.getInitialAccounts())[0].secretKey);
 const wallet=createWalletClient({account,chain,transport:http(rpcUrl)}),client=createPublicClient({chain,transport:http(rpcUrl)});
 const artifact=JSON.parse(fs.readFileSync(path.join(root,'artifacts/contracts/YellowBrickFactory.sol/YellowBrickFactory.json')));
 const factoryAddress=(await client.waitForTransactionReceipt({hash:await wallet.deployContract({abi:artifact.abi,bytecode:artifact.bytecode})})).contractAddress;
 let writes=0;
 const provider={async request({method,params}){
  if(method==='eth_accounts')return [account.address];
  if(method==='eth_sendTransaction'){
   writes++;const tx=params[0];return wallet.sendTransaction({to:tx.to,data:tx.data,gas:BigInt(tx.gas),value:0n});
  }
  return ganacheServer.provider.request({method,params});
 }};
 execFileSync(process.execPath,[path.join(root,'apps/ybr-player/scripts/generate-demo-audio.js')]);
 const data={master:fs.readFileSync(path.join(root,'apps/ybr-player/media/golden-hour.wav')),
  preview:fs.readFileSync(path.join(root,'apps/ybr-player/media/after-the-rain.wav')),
  artwork:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKxkAAAAASUVORK5CYII=','base64'),
  lyrics:Buffer.from('These are original policy test words.')};
 const extensions={master:'.wav',preview:'.wav',artwork:'.png',lyrics:'.txt'},mime={master:'audio/wav',preview:'audio/wav',artwork:'image/png',lyrics:'text/plain'};
 const assets=Object.fromEntries(Object.entries(data).map(([role,bytes])=>[role,{name:role+extensions[role],type:mime[role],size:bytes.length,hash:hash(bytes)}]));
 const packet=makeRegistrationPacket({metadata:{title:'Policy test release',artist:'Creator',songwriters:'Creator'},assets,
  identity:{mode:'external',connected:true,address:account.address},royalties:{creatorBps:10000},training:'not-authorized',composition:true,storage:'demo-encrypted-in-browser',contentPolicy:DEFAULT_CONTENT_POLICY});
 const options={packet,provider,rpcUrl,chainId:1337,network:'ganache',factoryAddress};
 await preflightPolicyMint(options);assert.equal(writes,0,'Pre-mint review is read-only.');
 const approval=reviewPlayerDelivery({packet,consent:true,execution:'ganache',chainId:1337});
 const mint=await mintOnChain(options);assert.equal(writes,3,'Each Brick and policy uses one atomic transaction.');
 assert.deepEqual(mint.receipts.map(r=>r.contentPolicy.permissions),[1,2,4]);
 const encrypted=await encryptDemoBatch({items:Object.entries(data).map(([id,bytes])=>({id,file:new File([bytes],assets[id].name,{type:mime[id]}),originalSha256:hash(bytes)}))});
 const payload=await buildPlayerRelease({packet,mint,vault:{secret:encrypted.secret,encrypted:encrypted.encrypted},consent:true});
 assert.ok(payload.authorization);assert.equal(payload.authorization.genesisHash,mint.genesisHash);
 assert.ok(!JSON.stringify(payload).includes(encrypted.secret));
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-policy-integration-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const road=makeGateway({rpcUrl,factoryAddress}),studio=createStudioLibrary({directory:temp});
 const {server}=createApp({accounts:{listener:'test-only-password'},roadGateway:road,studioLibrary:studio});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const base='http://127.0.0.1:'+server.address().port;
 const {token}=await(await fetch(base+'/api/player-publish/config')).json();
 const publish=body=>fetch(base+'/api/player-publish/releases',{method:'POST',headers:{'Content-Type':'application/json','X-YBR-Publish-Token':token},body:JSON.stringify(body)});
 let response=await publish({...payload,authorization:{...payload.authorization,genesisHash:'0x'+'f'.repeat(64)}});
 assert.equal(response.status,403,'Wrong history cannot authorize identical-looking addresses.');assert.equal(studio.list().length,0);
 const job={packet,mint,vault:{secret:encrypted.secret,encrypted:encrypted.encrypted},approval};
 const deliver=()=>deliverPlayerAfterMint(job,{publish:(options,request)=>publishPlayerRelease(options,{...request,fetchImpl:(url,init)=>fetch(base+url,init)})});
 const delivered=await deliver();assert.equal(delivered.status,'delivered',delivered.error);
 const id=delivered.brick.id;
 assert.equal((await deliver()).brick.id,id,'A retry reuses the saved release rather than minting again');
 assert.equal(writes,3,'Automatic delivery does not submit another blockchain transaction');
 assert.equal(studio.list().length,1);
 console.log('STEP 3 DELIVERY PASS: reviewed permissions committed on real Ganache, automatic delivery, duplicate-safe retry and no extra mint.');
 const login=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'listener',password:'test-only-password'})});
 const cookie=login.headers.get('set-cookie').split(';')[0];const auth={Cookie:cookie};
 response=await fetch(base+'/api/bricks/'+id+'/authorize',{method:'POST',headers:auth});assert.equal(response.status,200);
 const stream=()=>fetch(base+'/api/bricks/'+id+'/media',{headers:{...auth,Range:'bytes=0-63'}});
 response=await stream();assert.equal(response.status,206);assert.equal(response.headers.get('X-YBR-Content-SHA256'),hash(data.preview));
 // Reopen the exact saved preview library against another real Ganache wallet profile.
 const otherChain=ganache.server({logging:{quiet:true},chain:{chainId:1337,time:new Date('2020-01-01')},wallet:{mnemonic:'test test test test test test test test test test test junk'}});
 await otherChain.listen(0,'127.0.0.1');t.after(()=>otherChain.close());
 const otherRoad=makeGateway({rpcUrl:'http://127.0.0.1:'+otherChain.address().port,factoryAddress});
 const {server:otherPlayer}=createApp({accounts:{listener:'test-only-password'},roadGateway:otherRoad,studioLibrary:createStudioLibrary({directory:temp})});
 await new Promise(resolve=>otherPlayer.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{otherPlayer.closeAllConnections();otherPlayer.close(resolve);}));
 const otherBase='http://127.0.0.1:'+otherPlayer.address().port;
 const otherLogin=await fetch(otherBase+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'listener',password:'test-only-password'})});
 const otherAuth={Cookie:otherLogin.headers.get('set-cookie').split(';')[0]};
 const otherCatalog=await(await fetch(otherBase+'/api/bricks',{headers:otherAuth})).json();
 assert.ok(!otherCatalog.bricks.some(item=>item.id===id));
 const retained=otherCatalog.uploads.find(item=>item.id===id);
 assert.equal(retained.title,payload.title);assert.equal(retained.available,false);assert.equal(retained.reason,'different-chain');
 assert.equal(retained.chain.genesisHash,mint.genesisHash);assert.equal(retained.assets,undefined);
 for(const suffix of ['authorize','media']){
  const denied=await fetch(otherBase+'/api/bricks/'+id+'/'+suffix,{headers:otherAuth,method:suffix==='authorize'?'POST':'GET'});
  assert.ok([403,404].includes(denied.status));
 }
 assert.equal(studio.list().length,1,'Profile change retains the one uploaded preview, no duplicate or deletion.');
 assert.equal((await stream()).status,206,'The original chain still authorizes the exact saved preview.');
 console.log('PROFILE UPLOAD PASS: real alternate mnemonic keeps saved upload metadata, blocks playback on the wrong history, and the original chain restores playback.');
 const audioBrick=mint.receipts.find(r=>r.sourceId==='master').contractAddress,coverBrick=mint.receipts.find(r=>r.sourceId==='artwork').contractAddress;
 const editor={provider,chainId:1337,factoryAddress,brickAddress:audioBrick,walletAddress:account.address};
 let review=await readBrickPolicy(editor);
 await updateBrickPolicy({...editor,review,action:'permissions',permissions:0});
 response=await stream();assert.ok([403,404].includes(response.status));
 let library=await(await fetch(base+'/api/bricks',{headers:auth})).json();assert.ok(!library.bricks.some(b=>b.id===id));
 review=await readBrickPolicy(editor);await updateBrickPolicy({...editor,review,action:'permissions',permissions:1});
 response=await stream();assert.equal(response.status,206,'Reapproval restores the same committed preview.');
 const coverEditor={...editor,brickAddress:coverBrick};review=await readBrickPolicy(coverEditor);
 await updateBrickPolicy({...coverEditor,review,action:'permissions',permissions:0});
 response=await fetch(base+'/api/studio-releases/'+id+'/artwork',{headers:auth});assert.equal(response.status,403);
 library=await(await fetch(base+'/api/bricks',{headers:auth})).json();assert.equal(library.bricks.find(b=>b.id===id).artwork,null);
 review=await readBrickPolicy(editor);await updateBrickPolicy({...editor,review,action:'lock'});
 assert.equal((await readBrickPolicy(editor)).locked,true);
 const brickAbi=JSON.parse(fs.readFileSync(path.join(root,'artifacts/contracts/YellowBrick.sol/YellowBrick.json'))).abi;
 const initial=mint.receipts.find(r=>r.sourceId==='master').contentPolicy;
 await assert.rejects(wallet.writeContract({address:audioBrick,abi:brickAbi,functionName:'reviseFiles',args:['0x'+hash(data.master),initial.files,'ipfs://new','0x'+'e'.repeat(64),1n,1n]}),/content locked/);
 // Descriptive metadata cannot substitute different Player bytes under the lock.
 await client.waitForTransactionReceipt({hash:await wallet.writeContract({address:audioBrick,abi:brickAbi,functionName:'updateMetadataWithDigest',args:['ipfs://description-only','0x'+'d'.repeat(64)]})});
 response=await stream();assert.equal(response.status,206);assert.equal(response.headers.get('X-YBR-Content-SHA256'),hash(data.preview));
 review=await readBrickPolicy(editor);await updateBrickPolicy({...editor,review,action:'permissions',permissions:0});
 assert.ok([403,404].includes((await stream()).status),'Lock does not prevent revocation.');
});
