'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createApp}=require('../server');
const {discoverRegistry}=require('../road-registry');
const address='0x'+'1'.repeat(40),id='0x'+'2'.repeat(64),hash='0x'+'3'.repeat(64);
async function record(){
 return discoverRegistry({status:{ready:true,chainId:1337,factoryAddress:address},
  readHead:async()=>({number:1,hash}),readEvents:async()=>[{address,transactionHash:hash,blockNumber:1,
   args:{ipId:id,brick:address,originator:address,contentHash:hash}}],
  readBrick:async()=>({code:'0x6000',registered:true,ipId:id,originator:address,controller:address,contentHash:hash,
   metadataDigest:hash,metadataVersion:1,metadataURI:'ipfs://private-ciphertext'})});
}
test('registry and authenticated library discover protected Bricks without authorizing files',async t=>{
 const registration=await record();let records=[];
 const road={ready:async()=>registration.network,list:async()=>({status:registration.network,tracks:[]}),track:async()=>null,
  registry:async()=>({...registration,bricks:records})};
 const {server}=createApp({accounts:{listener:'test-password'},roadGateway:road});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const url='http://127.0.0.1:'+server.address().port;
 assert.equal((await (await fetch(url+'/road/api/registry')).json()).bricks.length,0);
 records=registration.bricks;
 const index=await fetch(url+'/road/api/registry');assert.equal(index.status,200);assert.equal(index.headers.get('cache-control'),'no-store');
 assert.equal((await index.json()).bricks[0].id,id);
 assert.equal((await fetch(url+'/api/bricks')).status,401);
 const session=await fetch(url+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'listener',password:'test-password'})});
 const headers={Cookie:session.headers.get('set-cookie').split(';')[0]};
 const library=await (await fetch(url+'/api/bricks',{headers})).json();
 const brick=library.bricks.find(b=>b.id===id);assert.ok(brick);assert.equal(brick.streamAllowed,false);assert.equal(brick.mediaPath,undefined);
 assert.equal((await (await fetch(url+'/api/bricks/'+id,{headers})).json()).registration.ipId,id);
 for(const [suffix,method] of [['authorize','POST'],['media','GET']])assert.equal((await fetch(url+'/api/bricks/'+id+'/'+suffix,{method,headers})).status,403);
 assert.equal((await fetch(url+'/road/media/'+id)).status,404);
 assert.equal((await fetch(url+'/road/metadata/'+id)).status,404);
 assert.deepEqual((await (await fetch(url+'/road/api/music')).json()).tracks,[]);
 road.registry=async()=>{throw Error('RPC offline');};
 assert.equal((await fetch(url+'/road/api/registry')).status,503);
 const offline=await (await fetch(url+'/api/bricks',{headers})).json();assert.equal(offline.network.ready,false);
 assert.equal(offline.bricks.some(b=>b.id===id),false,'Old chain entries must not masquerade as current verified data');
});
