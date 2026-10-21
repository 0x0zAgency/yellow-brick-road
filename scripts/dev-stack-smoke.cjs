'use strict';
/** CI smoke: must run against the integrated local stack after npm run dev. */
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {ethers}=require('ethers');
const {setTimeout:sleep}=require('node:timers/promises');
const {fixtureDigest}=require('./dev-stack.cjs');

async function get(url,options){
 const res=await fetch(url,{signal:AbortSignal.timeout(5000),...options});
 assert.ok(res.ok, url+' returned HTTP '+res.status);
 return res;
}
async function untilReady(){
 for(let i=0;i<200;i++){
  try{
   const status=await (await get('http://127.0.0.1:4173/road/api/status')).json();
   const web=await fetch('http://127.0.0.1:5173',{signal:AbortSignal.timeout(2000)});
   if(status.ready===true&&web.ok)return status;
  }catch{}
  await sleep(600);
 }
 throw Error('Timed out waiting for integrated Road web and player');
}
async function main(){
 const status=await untilReady();
 const ipfs=await (await get('http://127.0.0.1:8791/api/road-ipfs/health')).json();
 const proxiedIpfs=await (await get('http://127.0.0.1:5173/api/road-ipfs/health')).json();
 for(const health of [ipfs,proxiedIpfs]){
  assert.equal(health.ok,true,'IPFS must be ready before the application is ready');
  assert.equal(health.provider,'ybr-local-kubo');
  assert.ok(typeof health.peerId==='string'&&health.peerId.length>0);
 }
 assert.equal(proxiedIpfs.peerId,ipfs.peerId,'Mint Studio must reach the same Kubo node');
 assert.equal(status.chainId,1337);
 assert.match(status.factoryAddress,/^0x[a-f0-9]{40}$/i);
 const rpc=new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545');
 assert.equal((await rpc.getNetwork()).chainId,1337);
 assert.notEqual(await rpc.getCode(status.factoryAddress),'0x');
 const playerCatalog=await (await get('http://127.0.0.1:4173/road/api/music')).json();
 const webCatalog=await (await get('http://127.0.0.1:5173/road/api/music')).json();
 assert.equal(webCatalog.network.factoryAddress.toLowerCase(),status.factoryAddress.toLowerCase());
 assert.deepEqual(webCatalog.tracks.map(t=>t.id),playerCatalog.tracks.map(t=>t.id));
 const demo=playerCatalog.tracks.find(t=>t.title==='Golden Hour — Road Release'&&t.source==='road');
 assert.ok(demo,'Startup must publish an authorized, first-party synthetic music Brick');
 assert.equal(demo.media.sha256,fixtureDigest());
 assert.equal(demo.road.licenseMode,'public-stream');
 const remote=await get('http://127.0.0.1:5173/road/media/'+demo.id,{
  headers:{Origin:'http://creator.example',Range:'bytes=0-63'}
 });
 assert.equal(remote.status,206);
 assert.equal(remote.headers.get('access-control-allow-origin'),'*');
 assert.equal((await remote.arrayBuffer()).byteLength,64);
 const whole=Buffer.from(await (await get('http://127.0.0.1:4173/road/media/'+demo.id)).arrayBuffer());
 assert.equal('0x'+crypto.createHash('sha256').update(whole).digest('hex'),demo.road.contentHash);
 const metadata=Buffer.from(await (await get('http://127.0.0.1:4173/road/metadata/'+demo.id)).arrayBuffer());
 assert.equal('0x'+crypto.createHash('sha256').update(metadata).digest('hex'),demo.road.metadataDigest);
 const ui=await (await get('http://127.0.0.1:5173')).text();
 assert.match(ui,/<div id="root"><\/div>/);
 const blocked=await fetch('http://127.0.0.1:4173/api/bricks');
 assert.equal(blocked.status,401,'Private Player library remains authenticated');
 console.log('INTEGRATED STACK PASS: Ganache 1337 + verified factory + web UI + player + published Brick + cross-player streaming + integrity + healthy Kubo/bridge through the web proxy.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
