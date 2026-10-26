import test from 'node:test';
import assert from 'node:assert/strict';
import {publicCoverSource,localThumbnailRpc,mintOverview,receiptCoverImage,readRegistrationCover,shortId} from '../src/brick-presentation.js';
const addr=n=>'0x'+String(n).repeat(40),hash=n=>'0x'+String(n).repeat(64);
const factory=addr(1),brick=addr(2),collection=addr(3),owner=addr(4),ipId=hash(5),blockHash=hash(6),image='ipfs://bafy'+'a'.repeat(55);
const metadata=(patch={})=>'data:application/json;base64,'+Buffer.from(JSON.stringify({name:'Yellow Brick Registration',image,attributes:[{trait_type:'Brick Contract',value:brick},{trait_type:'Registration IP ID',value:ipId}],...patch})).toString('base64');
function setup(){
 const state={chainId:1337,hash:blockHash,collection,brick,owner,factory,uri:metadata(),reads:[],heads:0};
 const client={getChainId:async()=>state.chainId,getBlock:async()=>{state.heads++;return {number:9n,hash:state.heads>1&&state.reorg?hash(7):state.hash};},readContract:async p=>{
  state.reads.push(p);assert.equal(p.blockNumber,9n);
  return {receiptToken:state.collection,factory:state.factory,brickForToken:state.brick,ownerOf:state.owner,tokenURI:state.uri}[p.functionName];
 }};
 return {state,options:{client,chainId:1337,factoryAddress:factory,brickAddress:brick,collection,originator:owner,ipId,tokenId:BigInt(ipId).toString(),anchor:{number:'9',hash:blockHash}}};
}
test('thumbnail URLs allow only bare public cover CIDs through the narrow local route',()=>{
 assert.equal(publicCoverSource(image),'/api/road-ipfs/nft-cover/'+image.slice(7));
 for(const bad of [null,'ipfs://bafyshort',image+'/master',image+'?key=private','https://tracker.invalid/cover','data:image/svg+xml,<svg/>','javascript:alert(1)',image+'\n'])assert.equal(publicCoverSource(bad),null);
});
test('registry thumbnail transport does not accept external or credentialed RPC addresses',()=>{
 assert.equal(localThumbnailRpc('http://127.0.0.1:8545'),'http://127.0.0.1:8545/');
 assert.ok(localThumbnailRpc('http://[::1]:8545/'));
 assert.equal(localThumbnailRpc('https://127.0.0.1:8545'),'https://127.0.0.1:8545/');
 for(const bad of ['http://example.com','http://user:pass@localhost:8545','http://localhost:8545/private','http://127.0.0.1:8545/?key=secret','http://127.0.0.1:8545/#key'])assert.equal(localThumbnailRpc(bad),null);
});
test('mint rollup never promotes simulation, partial batches or unverified receipts to success',()=>{
 const confirmed={status:'confirmed',receipts:[{status:'verified'},{status:'verified'}]};
 assert.equal(mintOverview(confirmed,2).complete,true);
 assert.equal(mintOverview(confirmed,3).complete,false);
 assert.equal(mintOverview({...confirmed,simulated:true},2).verified,0);
 assert.equal(mintOverview({...confirmed,simulated:true},2).label,'Simulation only');
 assert.equal(mintOverview({status:'confirmed',receipts:[]}).complete,false);
 assert.equal(mintOverview({...confirmed,status:'incomplete'},2).complete,false);
 assert.equal(mintOverview({status:'confirmed',receipts:[{status:'pending'}]},2).outstanding,2);
 assert.equal(mintOverview(null,3).outstanding,3);
 assert.equal(shortId('0x1234'),'0x1234');assert.ok(shortId(hash(8)).length<hash(8).length);
});
test('inline NFT metadata must bind the thumbnail to the same Brick and IP identity',()=>{
 assert.equal(receiptCoverImage(metadata(),{brickAddress:brick,ipId}),image);
 assert.equal(receiptCoverImage(metadata({image:'data:image/svg+xml;base64,PHN2Zy8+'}),{brickAddress:brick,ipId}),null);
 assert.throws(()=>receiptCoverImage(metadata(),{brickAddress:owner,ipId}),/another Brick/);
 assert.throws(()=>receiptCoverImage(metadata({attributes:[{trait_type:'Brick Contract',value:brick},{trait_type:'Brick Contract',value:brick},{trait_type:'Registration IP ID',value:ipId}]}),{brickAddress:brick,ipId}),/another Brick/);
 for(const uri of ['ipfs://private','https://host/metadata','data:application/json;base64,!','data:application/json;base64,'+'a'.repeat(32000)])assert.throws(()=>receiptCoverImage(uri,{brickAddress:brick,ipId}));
});
test('cover discovery uses only read-only receipt calls at one verified snapshot',async()=>{
 const h=setup();assert.equal(await readRegistrationCover(h.options),image);
 assert.deepEqual(h.state.reads.map(r=>r.functionName).sort(),['brickForToken','factory','ownerOf','receiptToken','tokenURI']);
 assert.ok(h.state.reads.every(r=>r.abi.every(fn=>fn.stateMutability==='view')));
});
test('wrong networks, tokens, factories, holders, bindings and reorgs cannot supply thumbnails',async()=>{
 for(const change of [{chainId:1},{hash:hash(7)},{collection:owner},{brick:owner},{factory:owner},{owner:brick},{uri:metadata({attributes:[]})},{reorg:true}]){
  const h=setup();Object.assign(h.state,change);await assert.rejects(readRegistrationCover(h.options));
 }
 const h=setup();await assert.rejects(readRegistrationCover({...h.options,tokenId:'1'}),/Token/);assert.equal(h.state.reads.length,0);
});

 test('absolute HTTPS thumbnail gateway is same-origin only and never downgrades',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'location');
  Object.defineProperty(globalThis,'location',{value:{origin:'https://127.0.0.1:5173'},configurable:true});
  try{
   for(const value of ['/road/rpc','https://127.0.0.1:5173/road/rpc'])assert.equal(localThumbnailRpc(value),'https://127.0.0.1:5173/road/rpc');
   for(const bad of ['http://127.0.0.1:8545','http://127.0.0.1:5173/road/rpc','https://localhost:5173/road/rpc','https://127.0.0.1:4173/road/rpc','https://127.0.0.1:5173/road/rpc?key=secret'])assert.equal(localThumbnailRpc(bad),null);
  }finally{if(descriptor)Object.defineProperty(globalThis,'location',descriptor);else delete globalThis.location;}
 });
