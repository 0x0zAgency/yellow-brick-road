'use strict';
/** Real EVM integration on an isolated LOCAL node with Sepolia's chain ID.
 * Never connects to public Sepolia or reads a user's deployer key.
 */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const ganache=require('ganache'),{ethers}=require('ethers');
const {prepareSepolia,applySepolia}=require('./dev-sepolia.cjs');
const {readRecord,activeEnvironment}=require('./dev-network-profile.cjs');
const {makeGateway}=require('../apps/ybr-player/road-music');
const {createApp}=require('../apps/ybr-player/server');
const {createStudioLibrary}=require('../apps/ybr-player/studio-releases');
const ROOT=path.resolve(__dirname,'..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('approved capped deployment, reuse, selected-network registry/playback/analytics and no local fallback',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-remote-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const signer=ethers.Wallet.createRandom();
 const chain=ganache.server({logging:{quiet:true},chain:{chainId:11155111},wallet:{accounts:[{secretKey:signer.privateKey,balance:ethers.utils.parseEther('100').toHexString()}]}});
 await chain.listen(0,'127.0.0.1');t.after(()=>chain.close());
 const rpcUrl='http://127.0.0.1:'+chain.address().port;
 const provider=new ethers.providers.JsonRpcProvider(rpcUrl),wallet=signer.connect(provider);
 const artifactFile='artifacts/contracts/YellowBrickFactory.sol/YellowBrickFactory.json';fs.mkdirSync(path.join(root,path.dirname(artifactFile)),{recursive:true});fs.copyFileSync(path.join(ROOT,artifactFile),path.join(root,artifactFile));
 const input={rpcUrl,privateKey:signer.privateKey,maxEth:'0.05'};
 const plan=await prepareSepolia({root,input,env:{}});assert.equal(plan.kind,'deploy');assert.equal(await provider.getTransactionCount(signer.address),0);
 await assert.rejects(applySepolia(plan,{root,approval:''}),/approval/);assert.equal(await provider.getTransactionCount(signer.address),0);
 await assert.rejects(applySepolia({...plan,expiresAt:0},{root,approval:'DEPLOY SEPOLIA'}),/expired/);assert.equal(await provider.getTransactionCount(signer.address),0);
 const profile=await applySepolia(plan,{root,approval:'DEPLOY SEPOLIA'});
 assert.equal(await provider.getTransactionCount(signer.address),1);assert.equal(profile.chainId,11155111);assert.equal(readRecord(root,'sepolia-pending').status,'confirmed');
 const tx=await provider.getTransaction(profile.transactionHash);assert.equal(tx.gasLimit.toString(),plan.budget.gasLimit);assert.equal(tx.maxFeePerGas.toString(),plan.budget.maxFeePerGas);
 assert.ok(BigInt((await provider.getTransactionReceipt(profile.transactionHash)).gasUsed.toString())*BigInt((await provider.getTransactionReceipt(profile.transactionHash)).effectiveGasPrice.toString())<=BigInt(plan.budget.maximumWei));
 const reuse=await prepareSepolia({root,input:{rpcUrl},env:{}});assert.equal(reuse.kind,'reuse');await applySepolia(reuse,{root});assert.equal(await provider.getTransactionCount(signer.address),1,'Network reuse must spend nothing');
 assert.ok(!fs.readFileSync(path.join(root,'.road-local/networks/sepolia.json'),'utf8').includes(signer.privateKey));
 const abi=JSON.parse(fs.readFileSync(path.join(root,artifactFile))).abi,factory=new ethers.Contract(profile.factoryAddress,abi,wallet);
 const audio=Buffer.alloc(48);audio.write('RIFF');audio.writeUInt32LE(40,4);audio.write('WAVEfmt ',8);audio.writeUInt32LE(16,16);audio.writeUInt16LE(1,20);audio.writeUInt16LE(1,22);audio.writeUInt32LE(8000,24);audio.writeUInt32LE(16000,28);audio.writeUInt16LE(2,32);audio.writeUInt16LE(16,34);audio.write('data',36);audio.writeUInt32LE(4,40);
 const digest=sha(audio),zero=ethers.constants.HashZero;
 const minted=await(await factory.deployBrickWithPolicy('0x'+'1'.repeat(64),'road-local://sepolia-fixture','0x'+'2'.repeat(64),'0x'+'3'.repeat(64),[['0x'+'4'.repeat(64),'0x'+digest,zero,zero],1,false])).wait();
 const brickAddress=minted.events.find(e=>e.event==='BrickDeployed').args.brick;
 const road=makeGateway({repoRoot:root,rpcUrl,chainId:11155111,network:'sepolia',factoryAddress:profile.factoryAddress,genesisHash:profile.genesisHash,deploymentBlock:profile.deploymentBlock});
 assert.equal((await road.ready()).chainId,11155111);const registry=await road.registry();assert.equal(registry.bricks.length,1);assert.equal(registry.bricks[0].registration.chainId,11155111);assert.equal(registry.network.rpcUrl,'/road/rpc');
 const {validateRegistry}=await import('../web/src/registry-client.js');validateRegistry(registry);
 const {createPublicClient,http}=require(require.resolve('viem',{paths:[path.join(ROOT,'web')]}));
 const {discoverWalletBricks}=await import('../web/src/brick-viewer-model.js');
 const discovered=await discoverWalletBricks({client:createPublicClient({transport:http(rpcUrl)}),factoryAddress:profile.factoryAddress,wallet:signer.address,startBlock:String(profile.deploymentBlock)});
 assert.equal(discovered.bricks.length,1);
 const studio=createStudioLibrary({directory:path.join(root,'previews')}),interactionFile=path.join(root,'observations/events.ndjson');
 const {server}=createApp({accounts:{artist:'integration-only'},roadGateway:road,studioLibrary:studio,interactionFile});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const base='http://127.0.0.1:'+server.address().port;
 const authorization={format:'ybr-player-onchain/v1',chainId:11155111,genesisHash:profile.genesisHash,factoryAddress:profile.factoryAddress,sources:{audio:{brickAddress,controller:signer.address,revision:'1'}}};
 const payload={format:'ybr-studio-preview/1',audioSourceRole:'preview',consent:'share-selected-copies-with-local-player',title:'Remote-chain fixture',creator:'Test creator',assets:{audio:{name:'preview.wav',mime:'audio/wav',sha256:digest,base64:audio.toString('base64')}},files:[{role:'preview',name:'preview.wav',sharedAs:'audio'}],bricks:[{role:'Sound recording',title:'Remote-chain fixture',address:brickAddress}],authorization};
 const {token}=await(await fetch(base+'/api/player-publish/config')).json();
 const publish=body=>fetch(base+'/api/player-publish/releases',{method:'POST',headers:{'Content-Type':'application/json','X-YBR-Publish-Token':token},body:JSON.stringify(body)});
 assert.equal((await publish({...payload,authorization:{...authorization,chainId:1337}})).status,403);
 const published=await publish(payload);assert.equal(published.status,201,await published.clone().text());const id=(await published.json()).brick.id;
 const login=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'artist',password:'integration-only'})});const headers={Cookie:login.headers.get('set-cookie').split(';')[0]};
 const catalog=await(await fetch(base+'/api/bricks',{headers})).json();assert.equal(catalog.network.chainId,11155111);assert.ok(catalog.bricks.some(b=>b.id===id));assert.ok(!catalog.bricks.some(b=>b.id.startsWith('BRK-AUD-')),'No Ganache/static demo fallback in the remote catalog');
 assert.equal((await fetch(base+'/api/bricks/'+id+'/authorize',{method:'POST',headers})).status,200);const media=await fetch(base+'/api/bricks/'+id+'/media',{headers});assert.equal(media.status,200);assert.equal(sha(Buffer.from(await media.arrayBuffer())),digest);
 const event={brickId:id,sha256:digest,event:'play',eventId:crypto.randomUUID(),playbackId:crypto.randomUUID(),positionSeconds:0};assert.equal((await fetch(base+'/api/interactions',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(event)})).status,202);
 assert.equal(JSON.parse(fs.readFileSync(interactionFile,'utf8').trim()).subject.chainId,11155111);
 const chainReply=await fetch(base+'/road/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]})});assert.equal((await chainReply.json()).result,'0xaa36a7');
 const brick=new ethers.Contract(brickAddress,['function setPlayerPermissions(uint8,uint64,uint64)'],wallet);await(await brick.setPlayerPermissions(0,1,1)).wait();assert.equal((await fetch(base+'/api/bricks/'+id+'/media',{headers})).status,404,'Revoked preview remains blocked');
 console.log('ACTIVE NETWORK PASS: local Sepolia-ID EVM, exact approved fee envelope, zero-cost reuse, Registry/My Bricks discovery, selected-chain playback and analytics, revoked/wrong-chain refusal. No public network funds used.');
 if(process.env.YBR_TEST_FULL_REMOTE_STACK==='1'){
  if(!process.env.CI)throw Error('Full launcher exercise is CI-only.');
  // Use the saved profile identity but never forward the disposable signing key.
  const {spawn}=require('node:child_process');const child=spawn(process.execPath,[path.join(ROOT,'scripts/dev.cjs'),'--plain','--restart-player'],{cwd:ROOT,env:{...activeEnvironment(profile,'',process.env),CI:'1'},stdio:['ignore','pipe','pipe']});
  let log='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{log=(log+chunk.toString()).slice(-40000);});
  t.after(()=>{if(child.exitCode===null)child.kill('SIGTERM');});
  try{
   let ready=false;for(let i=0;i<90;i++){if(child.exitCode!==null)throw Error('Remote launcher exited: '+log);if(log.includes('INTEGRATED ROAD READY')){ready=true;break;}await wait(500);}assert.ok(ready,log);
   const status=await(await fetch('http://127.0.0.1:4173/road/api/status')).json();assert.equal(status.chainId,11155111);assert.equal(status.factoryAddress.toLowerCase(),profile.factoryAddress.toLowerCase());
   const webRegistry=await(await fetch('http://127.0.0.1:5173/road/api/registry')).json();assert.equal(webRegistry.network.chainId,11155111);assert.equal(webRegistry.bricks.length,1);
   const module=await(await fetch('http://127.0.0.1:5173/src/active-network.js')).text();assert.ok(module.includes('11155111'));assert.ok(module.includes(profile.factoryAddress));assert.ok(!module.includes(signer.privateKey));
   assert.ok(log.includes('ACTIVE SEPOLIA'));assert.ok(!log.includes('Starting local Ganache'));assert.ok(!log.includes('Publishing our generated Golden Hour'));
   assert.equal(await provider.getTransactionCount(signer.address),3,'Launcher must not spend additional remote ETH');
   await assert.rejects(fetch('http://127.0.0.1:8545',{signal:AbortSignal.timeout(1000)}),'No managed Ganache is listening');
   child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));assert.equal(await provider.getBlockNumber(),3,'Launcher does not stop the externally managed RPC');
   console.log('REMOTE STACK PASS: Dev Control, Vite, Registry and Player share one Sepolia-ID backend; no Ganache process, demo mint or extra spending. Kubo remains local.');
  }catch(e){console.error(log);throw e;}
 }
 // Deliberately selecting a blank factory prepares a new quoted deployment even
 // when a legacy/current profile already exists. No automatic replacement.
 const upgrade=await prepareSepolia({root,input:{...input,factoryAddress:''},env:{}});
 const beforeUpgrade=await provider.getTransactionCount(signer.address);assert.equal(upgrade.kind,'deploy');
 await assert.rejects(applySepolia(upgrade,{root,approval:''}),/approval/);
 assert.equal(await provider.getTransactionCount(signer.address),beforeUpgrade);
 const replacement=await applySepolia(upgrade,{root,approval:'DEPLOY SEPOLIA'});
 assert.notEqual(replacement.factoryAddress,profile.factoryAddress);
 assert.equal(await provider.getTransactionCount(signer.address),beforeUpgrade+1);
 const archived=readRecord(root,'sepolia-history-'+profile.factoryAddress.slice(2).toLowerCase()+'-'+profile.genesisHash.slice(2).toLowerCase());
 assert.equal(archived.factoryAddress,profile.factoryAddress);
 assert.notEqual(await provider.getCode(brickAddress),'0x','Original registrations survive an explicit factory replacement');
 assert.equal(await new ethers.Contract(replacement.factoryAddress,['function mintBatchVersion() view returns (uint8)'],provider).mintBatchVersion(),1);
 console.log('FACTORY REPLACEMENT PASS: fresh quote/approval, one capped deployment, old reference archived and old Brick retained.');

});
