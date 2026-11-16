'use strict';
/** Two disposable Kubo repos, real DNS-SD, HTTP and libp2p. No user node access. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const {spawn,execFileSync}=require('node:child_process');
const {setTimeout:sleep}=require('node:timers/promises');
const {LanNode,kuboClient,interfaces,PATH}=require('./lan-node.cjs');
const binary=process.env.YBR_IPFS_TEST_BINARY;
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'0.0.0.0',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function until(check,label){for(let i=0;i<100;i++){if(await check())return;await sleep(150);}throw Error('Timed out: '+label);}
test('two YBR nodes discover, connect, transfer a CID, detect loss, and disconnect', {skip:!binary,timeout:90000},async t=>{
 assert.ok(path.isAbsolute(binary));const lan=interfaces()[0];assert.ok(lan,'This integration test requires a private IPv4 LAN interface.');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-lan-integration-')),nodes=[],daemons=[];
 t.after(async()=>{
  for(const node of nodes)await node.disable();
  for(const daemon of daemons)if(daemon.exitCode===null){
   const exited=new Promise(r=>daemon.once('exit',r));daemon.kill('SIGTERM');await Promise.race([exited,sleep(3000,undefined,{ref:false})]);
   if(daemon.exitCode===null){daemon.kill('SIGKILL');await exited;}
  }
  fs.rmSync(root,{recursive:true,force:true});
 });
 async function create(index){
  const repo=path.join(root,String(index)),env={...process.env,IPFS_PATH:repo};delete env.IPFS_API;
  const cli=args=>execFileSync(binary,args,{env,encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']});
  cli(['init','--empty-repo','--profile=test']);cli(['config','profile','apply','server']);
  const swarmPort=await freePort();cli(['config','--json','Addresses.Swarm',JSON.stringify(['/ip4/0.0.0.0/tcp/'+swarmPort])]);
  const daemon=spawn(binary,['daemon','--routing=none'],{env,stdio:['ignore','pipe','pipe']});daemons.push(daemon);
  let logs='';daemon.stdout.on('data',v=>logs+=v);daemon.stderr.on('data',v=>logs+=v);let rpc,kubo,identity;
  await until(async()=>{
   if(daemon.exitCode!==null)throw Error('Disposable Kubo failed: '+logs);
   try{const api=fs.readFileSync(path.join(repo,'api'),'utf8').trim();const match=/^\/ip4\/127\.0\.0\.1\/tcp\/(\d+)$/.exec(api);if(!match)return false;
    rpc='http://127.0.0.1:'+match[1];kubo=kuboClient(rpc);identity=(await kubo('id')).ID;return true;
   }catch{return false;}
  },'Kubo readiness');
  const profile={network:'ganache',chainId:1337,factoryAddress:'0x'+'1'.repeat(40),genesisHash:'0x'+String(index+2).repeat(64)};
  const node=new LanNode({profile,peer:identity,env:{YBR_LAN_PORT:String(await freePort()),YBR_LAN_SWARM_PORT:String(swarmPort),YBR_NODE_NAME:'CI studio '+index,YBR_KUBO_RPC:rpc}});nodes.push(node);
  await node.enable();return {node,kubo,rpc,repo};
 }
 const a=await create(0),b=await create(1);
 await until(async()=>{
  await a.node.refresh();await b.node.refresh();
  return [...a.node.peers.values()].some(p=>p.peerId===b.node.info.peerId)&&[...b.node.peers.values()].some(p=>p.peerId===a.node.info.peerId);
 },'bidirectional mDNS discovery');
 const key=lan.address+':'+b.node.port;
 const review=await a.node.review(key);assert.equal(review.sameDeployment,false);assert.equal(review.peerId,b.node.info.peerId);
 await a.node.connect(review);assert.equal(a.node.peers.get(key).status,'Connected');
 const response=await fetch('http://'+key+PATH);assert.deepEqual(await response.json(),b.node.info);
 for(const [method,route] of [['POST',PATH],['GET','/api/v0/config'],['GET','/road/rpc']])assert.equal((await fetch('http://'+key+route,{method})).status,404);
 const payload='First-party YBR LAN prototype transfer fixture '+Date.now();const form=new FormData();form.append('file',new Blob([payload]),'fixture.txt');
 const added=await fetch(b.rpc+'/api/v0/add?pin=true',{method:'POST',body:form});assert.ok(added.ok);const cid=(await added.json()).Hash;
 const transferred=await fetch(a.rpc+'/api/v0/cat?arg='+cid,{method:'POST',signal:AbortSignal.timeout(15000)});assert.ok(transferred.ok);assert.equal(await transferred.text(),payload);
 await b.kubo('swarm/disconnect',['/p2p/'+a.node.info.peerId]);await a.node.refresh();assert.equal(a.node.peers.get(key).status,'Connection lost');
 await a.node.connect(review);await a.node.disconnect(key);assert.equal(a.node.peers.get(key).status,'Disconnected');
 assert.ok(!(await a.kubo('swarm/peers')).Peers?.some(p=>p.Peer===b.node.info.peerId));
 const config=JSON.parse(fs.readFileSync(path.join(a.repo,'config'),'utf8'));
 assert.equal(config.Addresses.API,'/ip4/127.0.0.1/tcp/0');assert.equal(config.Discovery.MDNS.Enabled,false);assert.equal(config.Swarm.DisableNatPortMap,true);
 console.log('Verified DNS-SD, public manifest, real IPFS connection, byte-identical CID transfer, lost status and disconnect.');
});
