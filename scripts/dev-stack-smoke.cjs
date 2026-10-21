'use strict';
/** CI smoke: run against the integrated local stack after npm run dev. */
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {ethers}=require('ethers');
const {setTimeout:sleep}=require('node:timers/promises');
const {fixtureDigest,ensurePlayer}=require('./dev-stack.cjs');
const {readPlayerAccess,accessFile,verifyPlayerAccess}=require('./dev-player-access.cjs');
async function get(url,options){
 const res=await fetch(url,{signal:AbortSignal.timeout(5000),...options});assert.ok(res.ok,url+' returned HTTP '+res.status);return res;
}
async function untilReady(){
 for(let i=0;i<200;i++){
  try{const status=await (await get('http://127.0.0.1:4173/road/api/status')).json();const web=await fetch('http://127.0.0.1:5173',{signal:AbortSignal.timeout(2000)});if(status.ready===true&&web.ok)return status;}catch{}
  await sleep(600);
 }
 throw Error('Timed out waiting for integrated Road web and player');
}
async function main(){
 assert.equal(Number(process.versions.node.split('.')[0]),24,'Integrated stack must use Node 24');
 const status=await untilReady();
 const ipfs=await (await get('http://127.0.0.1:8791/api/road-ipfs/health')).json();
 const proxiedIpfs=await (await get('http://127.0.0.1:5173/api/road-ipfs/health')).json();
 for(const health of [ipfs,proxiedIpfs]){assert.equal(health.ok,true);assert.equal(health.provider,'ybr-local-kubo');assert.ok(typeof health.peerId==='string'&&health.peerId.length>0);}
 assert.equal(proxiedIpfs.peerId,ipfs.peerId,'Mint Studio must reach the same Kubo node');assert.equal(status.chainId,1337);assert.match(status.factoryAddress,/^0x[a-f0-9]{40}$/i);
 const rpc=new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545');assert.equal((await rpc.getNetwork()).chainId,1337);assert.notEqual(await rpc.getCode(status.factoryAddress),'0x');
 const playerCatalog=await (await get('http://127.0.0.1:4173/road/api/music')).json();const webCatalog=await (await get('http://127.0.0.1:5173/road/api/music')).json();
 assert.equal(webCatalog.network.factoryAddress.toLowerCase(),status.factoryAddress.toLowerCase());assert.deepEqual(webCatalog.tracks.map(t=>t.id),playerCatalog.tracks.map(t=>t.id));
 const demo=playerCatalog.tracks.find(t=>t.title==='Golden Hour — Road Release'&&t.source==='road');assert.ok(demo);assert.equal(demo.media.sha256,fixtureDigest());assert.equal(demo.road.licenseMode,'public-stream');
 const remote=await get('http://127.0.0.1:5173/road/media/'+demo.id,{headers:{Origin:'http://creator.example',Range:'bytes=0-63'}});assert.equal(remote.status,206);assert.equal(remote.headers.get('access-control-allow-origin'),'*');assert.equal((await remote.arrayBuffer()).byteLength,64);
 const whole=Buffer.from(await (await get('http://127.0.0.1:4173/road/media/'+demo.id)).arrayBuffer());assert.equal('0x'+crypto.createHash('sha256').update(whole).digest('hex'),demo.road.contentHash);
 const metadata=Buffer.from(await (await get('http://127.0.0.1:4173/road/metadata/'+demo.id)).arrayBuffer());assert.equal('0x'+crypto.createHash('sha256').update(metadata).digest('hex'),demo.road.metadataDigest);
 assert.match(await (await get('http://127.0.0.1:5173')).text(),/<div id="root"><\/div>/);
 assert.equal((await fetch('http://127.0.0.1:4173/api/bricks')).status,401,'Private Player library remains authenticated');
 const root=path.resolve(__dirname,'..'),saved=readPlayerAccess(root);assert.ok(saved);
 assert.equal(await verifyPlayerAccess(saved),true,'Saved local credentials must authenticate both real accounts');
 if(process.platform!=='win32')assert.equal(fs.statSync(accessFile(root)).mode&0o777,0o600);
 // Exercise the same reuse branch as a second launcher, without binding a second Vite.
 assert.deepEqual(await ensurePlayer(status.factoryAddress,{}),{source:'reused',verified:true});
 const log=fs.readFileSync(path.join(root,'.road-local/dev-stack.log'),'utf8');
 for(const [username,key] of [['listener','YBR_LISTENER_PASSWORD'],['artist','YBR_ARTIST_PASSWORD']]){
  const password=process.env[key];if(password)assert.equal(saved[username],password);
  assert.ok(!log.includes(saved[username]),'Saved dashboard logs must not contain Player passwords');
 }
 assert.doesNotMatch(log,/Mnemonic:\s+(?!\[redacted\])[a-z]+ [a-z]+/);assert.doesNotMatch(log,/\(\d+\)\s+0x[a-f\d]{64}\b/i);
 console.log('INTEGRATED STACK PASS: Node 24 + Ganache + verified factory + Vite + IPFS proxy + public playback/integrity + private credentials + verified Player reuse + log redaction.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
