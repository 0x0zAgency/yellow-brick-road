'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {discoverRegistry,mergeRegisteredTracks,readPlayerCatalog}=require('../road-registry');
const addr=n=>'0x'+n.toString(16).padStart(40,'0');
const hash=n=>'0x'+n.toString(16).padStart(64,'0');
function fixture(){
 const status={ready:true,chainId:1337,factoryAddress:addr(1)};
 const event={address:addr(1),args:{ipId:hash(2),brick:addr(3),originator:addr(4),contentHash:hash(5)},
  transactionHash:hash(6),blockNumber:8,logIndex:0};
 const value={code:'0x6000',registered:true,ipId:hash(2),originator:addr(4),controller:addr(4),contentHash:hash(5),
  metadataDigest:hash(7),metadataURI:'ipfs://bafy-private-ciphertext',metadataVersion:'1'};
 const calls=[];
 const options={status,readHead:async tag=>{calls.push(['head',tag]);return {number:10,hash:hash(10)};},
  readEvents:async(from,to)=>{calls.push(['events',from,to]);return [event];},
  readBrick:async(address,block)=>{calls.push(['brick',address,block]);return value;}};
 return {options,event,value,calls,status};
}
test('private IPFS registrations appear without fetching files or granting playback',async()=>{
 const f=fixture(),r=await discoverRegistry(f.options),b=r.bricks[0];
 assert.equal(r.bricks.length,1);assert.equal(b.id,hash(2));assert.equal(b.streamAllowed,false);
 assert.equal(b.source,'road-registry');assert.equal(b.media.sha256,null);
 assert.equal(b.registration.metadataURI,f.value.metadataURI);
 assert.equal(b.registration.blockNumber,'8');assert.equal(r.head.number,'10');
 assert.deepEqual(f.calls,[['head','latest'],['events',0,10],['brick',addr(3),10],['head',10]]);
 assert.equal('mediaPath' in b,false);assert.equal('secret' in b,false);
});
test('unhosted, external, and encrypted metadata all remain visible without being dereferenced',async()=>{
 for(const uri of ['demo://a/metadata','ipfs://bafy-ciphertext','http://untrusted.invalid/private','file:///private/secret']){
  const f=fixture();f.value.metadataURI=uri;
  const r=await discoverRegistry(f.options);assert.equal(r.bricks[0].registration.metadataURI,uri);assert.equal(r.bricks[0].streamAllowed,false);
 }
});
test('no wallet/originator filter hides other creators in the factory',async()=>{
 const f=fixture();f.event.args.originator=addr(999);f.value.originator=addr(999);
 assert.equal((await discoverRegistry(f.options)).bricks[0].creator,addr(999));
});
test('current controller and metadata changes are read at the snapshot block',async()=>{
 const f=fixture();f.value.controller=addr(9);f.value.metadataVersion='2';
 const r=await discoverRegistry(f.options);assert.equal(r.bricks[0].registration.controller,addr(9));
 assert.equal(r.bricks[0].registration.metadataVersion,'2');
});
test('unavailable factory does not return fake records or call RPC',async()=>{
 const f=fixture();f.options.status={ready:false,reason:'offline'};
 const r=await discoverRegistry(f.options);assert.deepEqual(r.bricks,[]);assert.deepEqual(f.calls,[]);
});
test('event/state mismatches and missing code fail closed',async()=>{
 for(const change of [{registered:false},{code:'0x'},{ipId:hash(99)},{originator:addr(99)},{contentHash:hash(99)},{controller:addr(0)},{metadataDigest:'invalid'},{metadataVersion:'NaN'}]){
  const f=fixture();Object.assign(f.value,change);await assert.rejects(discoverRegistry(f.options),/disagree/);
 }
});
test('foreign factory, removed logs, invalid transactions and future events are refused',async()=>{
 for(const change of [{address:addr(99)},{removed:true},{transactionHash:'bad'},{blockNumber:11}]){
  const f=fixture();Object.assign(f.event,change);await assert.rejects(discoverRegistry(f.options),/Invalid factory/);
 }
});
test('chain reset/reorg mid-scan never returns an obsolete registry as verified',async()=>{
 const f=fixture();f.options.readHead=async tag=>({number:10,hash:hash(tag==='latest'?10:11)});
 await assert.rejects(discoverRegistry(f.options),/history changed/);
});
test('repeated reads deduplicate event identity, not independent works with identical content',async()=>{
 const f=fixture();f.options.readEvents=async()=>[f.event,f.event];
 assert.equal((await discoverRegistry(f.options)).bricks.length,1);
});
test('bounded result window reports matching count and truncation',async()=>{
 const f=fixture();f.options.readEvents=async()=>Array.from({length:201},(_,i)=>({...f.event,args:{...f.event.args,brick:addr(i+20),ipId:hash(i+20)},logIndex:i}));
 f.options.readBrick=async a=>({...f.value,ipId:hash(Number(BigInt(a)))});
 const r=await discoverRegistry(f.options);assert.equal(r.bricks.length,200);assert.equal(r.matchingEvents,201);assert.equal(r.limitReached,true);
});
test('oversized event sets and malformed heads are refused',async()=>{
 const f=fixture();f.options.readEvents=async()=>Array(1001).fill(f.event);
 await assert.rejects(discoverRegistry(f.options),/1,000 events/);
 f.options.readHead=async()=>null;await assert.rejects(discoverRegistry(f.options),/head/);
});
test('only a matching, already authorized music record supplies playable labels',async()=>{
 const f=fixture(),r=await discoverRegistry(f.options),b=r.bricks[0];
 const track={id:b.id,source:'road',title:'Verified public title',streamAllowed:true,road:{...b.road},mediaPath:'/private/server/path'};
 const merged=mergeRegisteredTracks(r.bricks,[track]);assert.equal(merged.length,1);assert.equal(merged[0].title,track.title);
 assert.equal(merged[0].mediaPath,undefined);assert.equal(merged[0].registration.ipId,b.id);
 for(const override of [{chainId:1},{factoryAddress:addr(99)},{brickAddress:addr(99)},{contentHash:hash(99)},{metadataDigest:hash(99)},{controller:addr(99)}]){
  assert.equal(mergeRegisteredTracks(r.bricks,[{...track,road:{...track.road,...override}}])[0].streamAllowed,false);
 }
});
test('new registry entries appear on a later catalog refresh without restarting the service',async()=>{
 const f=fixture();let events=[];f.options.readEvents=async()=>events;
 const road={registry:()=>discoverRegistry(f.options),list:async()=>({status:f.status,tracks:[]})};
 assert.equal((await readPlayerCatalog(road)).bricks.length,0);
 events=[f.event];assert.equal((await readPlayerCatalog(road)).bricks[0].id,hash(2));
});

test('a truncated registration window does not remove older authorized audio from the Player',async()=>{
 const f=fixture(),registry=await discoverRegistry(f.options);
 const old={id:hash(999),source:'road',streamAllowed:true,mediaPath:'/private/path'};
 const catalog=await readPlayerCatalog({registry:async()=>({...registry,limitReached:true}),list:async()=>({status:f.status,tracks:[old]})});
 assert.equal(catalog.bricks.length,2);assert.equal(catalog.registry.bricks.length,1);
 assert.equal(catalog.bricks[1].mediaPath,undefined);
});
