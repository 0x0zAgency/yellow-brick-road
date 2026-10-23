import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {validateNftCoverPng,MAX_NFT_COVER_BYTES,PUBLIC_COVER_CONSENT,validCoverCid} from '../src/nft-cover-format.js';
import {uploadNftCover} from '../src/nft-cover-storage.js';
import {storeNftCover,handleUploadRequest,sha256} from '../scripts/ipfs-bridge.mjs';
const cid='bafy'+'a'.repeat(55);
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;}return (c^0xffffffff)>>>0;}
function chunk(type,bytes){const out=Buffer.alloc(bytes.length+12);out.writeUInt32BE(bytes.length);out.write(type,4);bytes.copy(out,8);out.writeUInt32BE(crc(out.subarray(4,-4)),out.length-4);return out;}
function png({width=1,height=1,extra=[]}={}){
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),...extra,chunk('IDAT',deflateSync(Buffer.from([0,12,80,200,255]))),chunk('IEND',Buffer.alloc(0))]);
}
const receipt=bytes=>({cid,sha256:sha256(bytes),size:bytes.length,mime:'image/png',pinned:true,verified:true});

test('normalized PNG size, dimensions and checksum are validated',()=>{
 assert.deepEqual(validateNftCoverPng(png()),{mime:'image/png',width:1,height:1,size:png().length});
 for(const bytes of [Buffer.from('<svg>secret</svg>'),Buffer.from('0ZROAD01'),png().subarray(0,40),Buffer.concat([png(),Buffer.from('private')]),Buffer.alloc(MAX_NFT_COVER_BYTES+1)])assert.throws(()=>validateNftCoverPng(bytes));
 const changed=png();changed[changed.length-1]^=1;assert.throws(()=>validateNftCoverPng(changed),/checksum/);
 for(const width of [0,513,100000])assert.throws(()=>validateNftCoverPng(png({width})),/512/);
});
test('source metadata, EXIF and animation chunks cannot reach public thumbnails',()=>{
 for(const name of ['tEXt','iTXt','eXIf','acTL','fdAT','IDXX'])assert.throws(()=>validateNftCoverPng(png({extra:[chunk(name,Buffer.from('private metadata'))]})),/unsupported/);
});
test('cover CIDs disallow paths, queries, credentials, encrypted URLs and control text',()=>{
 assert.equal(validCoverCid(cid),true);
 for(const bad of ['ipfs://'+cid,cid+'/key',cid+'?key=secret',cid+'#private','https://host/secret',cid+'"',cid+'\n','bafyshort'])assert.equal(validCoverCid(bad),false,bad);
});
test('upload refuses absent consent and invalid images before any HTTP call',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;};
 await assert.rejects(uploadNftCover(png(),{fetchImpl}),/Approve/);
 await assert.rejects(uploadNftCover(Buffer.from('secret'),{fetchImpl,consent:true}),/PNG/);
 assert.equal(calls,0);
});
test('upload sends only reviewed image bytes and verifies the returned pin',async()=>{
 const bytes=png();
 const result=await uploadNftCover(bytes,{consent:true,fetchImpl:async(url,options)=>{
  assert.equal(url,'/api/road-ipfs/nft-cover');assert.equal(options.headers['X-Road-Public-Cover'],PUBLIC_COVER_CONSENT);
  assert.equal(options.headers['Content-Type'],'image/png');assert.equal(options.redirect,'error');assert.deepEqual(options.body,bytes);
  return Response.json(receipt(bytes));
 }});
 assert.equal(result.imageURI,'ipfs://'+cid);
});
test('unverified pins, wrong bytes and error responses are refused',async()=>{
 const bytes=png();
 for(const patch of [{verified:false},{pinned:false},{size:1},{sha256:'0'.repeat(64)},{cid:cid+'?key=x'},{mime:'text/plain'}])await assert.rejects(uploadNftCover(bytes,{consent:true,fetchImpl:async()=>Response.json({...receipt(bytes),...patch})}),/verified/);
 await assert.rejects(uploadNftCover(bytes,{consent:true,fetchImpl:async()=>new Response('not JSON',{status:502})}),/bridge/);
});
test('Kubo add uses a generic PNG name, retrieves exact bytes and checks the pin',async()=>{
 const bytes=png(),calls=[];
 const stored=await storeNftCover(bytes,{fetchImpl:async(url,options)=>{
  calls.push(url);assert.equal(options.method,'POST');assert.equal(options.redirect,'error');
  if(url.includes('/add?')){const file=options.body.get('file');assert.equal(file.name,'nft-cover.png');assert.equal(file.type,'image/png');assert.deepEqual(Buffer.from(await file.arrayBuffer()),bytes);return Response.json({Hash:cid});}
  if(url.includes('/cat?'))return new Response(bytes);
  if(url.includes('/pin/ls?'))return Response.json({Keys:{[cid]:{Type:'recursive'}}});
  throw Error('Unexpected RPC');
 }});
 assert.equal(stored.mime,'image/png');assert.equal(stored.verified,true);assert.equal(calls.length,3);
});
test('Kubo mismatched bytes or a missing pin cannot report successful publication',async()=>{
 const bytes=png();
 for(const fail of ['bytes','pin'])await assert.rejects(storeNftCover(bytes,{fetchImpl:async url=>url.includes('/add?')?Response.json({Hash:cid}):url.includes('/cat?')?new Response(fail==='bytes'?Buffer.from('changed'):bytes):Response.json({Keys:{}})}),/differs|pinned/);
});
test('public cover HTTP endpoint enforces consent, loopback origin, size and PNG validation',async t=>{
 let stored=0;
 const server=createServer((req,res)=>void handleUploadRequest(req,res,{storeCover:async bytes=>{stored++;return receipt(bytes);}}));
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const endpoint='http://127.0.0.1:'+server.address().port;
 const headers={'Content-Type':'image/png','X-Road-Public-Cover':PUBLIC_COVER_CONSENT,Origin:'http://127.0.0.1:5173'};
 assert.equal((await fetch(endpoint+'/api/road-ipfs/nft-cover',{method:'POST',headers,body:png()})).status,200);
 for(const [path,changes,body,expected] of [
  ['/api/road-ipfs/nft-cover',{'X-Road-Public-Cover':''},png(),415],
  ['/api/road-ipfs/nft-cover',{Origin:'https://evil.example'},png(),403],
  ['/api/road-ipfs/nft-cover',{'Sec-Fetch-Site':'cross-site'},png(),403],
  ['/api/road-ipfs/nft-cover',{},Buffer.from('<svg/>'),400],
  ['/api/road-ipfs/nft-cover?key=secret',{},png(),400],
  ['/api/road-ipfs/nft-cover',{},Buffer.alloc(MAX_NFT_COVER_BYTES+1),413],
  ['/api/road-ipfs/upload',{},png(),415]
 ])assert.equal((await fetch(endpoint+path,{method:'POST',headers:{...headers,...changes},body})).status,expected,path);
 assert.equal(stored,1);
});

test('thumbnail retrieval reads only a locally pinned, bounded normalized PNG',async()=>{
 const {retrieveNftCover}=await import('../scripts/ipfs-bridge.mjs');
 const bytes=png();let calls=0;
 const fetchImpl=async url=>{calls++;if(url.includes('/pin/ls?'))return Response.json({Keys:{[cid]:{Type:'recursive'}}});assert.ok(url.includes('length=524289'));return new Response(bytes);};
 const result=await retrieveNftCover(cid,{fetchImpl});assert.deepEqual(result.bytes,bytes);assert.equal(calls,2);
 await assert.rejects(retrieveNftCover(cid+'/private',{fetchImpl}));assert.equal(calls,2);
 for(const invalid of [Buffer.from('0ZROAD01encrypted-work'),Buffer.from('<svg/>'),Buffer.alloc(MAX_NFT_COVER_BYTES+1)]){
  await assert.rejects(retrieveNftCover(cid,{fetchImpl:async url=>url.includes('/pin/ls?')?Response.json({Keys:{[cid]:{Type:'recursive'}}}):new Response(invalid)}));
 }
 await assert.rejects(retrieveNftCover(cid,{fetchImpl:async()=>Response.json({Keys:{}})}),/pinned/);
});
test('thumbnail HTTP route returns PNG only and retains origin, Host and exact-path checks',async t=>{
 let calls=0;
 const server=createServer((req,res)=>void handleUploadRequest(req,res,{retrieveCover:async()=>{calls++;return {bytes:png()};}}));
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const base='http://127.0.0.1:'+server.address().port;
 const response=await fetch(base+'/api/road-ipfs/nft-cover/'+cid);
 assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await response.arrayBuffer()),png());
 for(const [suffix,headers,status] of [[cid,{Origin:'https://other.invalid'},403],[cid,{'Sec-Fetch-Site':'cross-site'},403],[cid+'?key=x',{},400],[cid+'/private',{},400],['%2f'+cid,{},400]])assert.equal((await fetch(base+'/api/road-ipfs/nft-cover/'+suffix,{headers})).status,status);
 const {request}=await import('node:http');
 const hostStatus=await new Promise((resolve,reject)=>{const req=request(base+'/api/road-ipfs/nft-cover/'+cid,{headers:{Host:'other.invalid'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});
 assert.equal(hostStatus,403);
 assert.equal(calls,1);
});
