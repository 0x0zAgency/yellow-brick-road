import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {encryptAsset} from '../src/road-encryption.js';
import {MAX_ASSET_BYTES} from '../src/asset-limits.js';
import {MAX_CIPHERTEXT_BYTES,parseAddOutput,checkedKuboUrl,storeEncryptedBytes,retrieveEncryptedBytes,readBoundedBytes,validateEncryptedContainer,handleUploadRequest,startBridge,sha256} from '../scripts/ipfs-bridge.mjs';
import {Readable} from 'node:stream';
import {createServer,request as httpRequest} from 'node:http';
import {once} from 'node:events';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const CID='bafybei'+'a'.repeat(52);
const good=async()=>encryptAsset(new TextEncoder().encode('CANARY PRIVATE DATA'), 'private bridge test passphrase 123',
 {name:'encrypted-work',mime:'application/octet-stream'});
const pinResponse=()=>new Response(JSON.stringify({Keys:{[CID]:{Type:'recursive'}}}));
function changeHeader(container,change){
 const bytes=Buffer.from(container),size=bytes.readUInt16BE(8);
 const header=JSON.parse(bytes.subarray(10,10+size).toString('utf8'));
 change(header);
 const modified=Buffer.from(JSON.stringify(header));
 const prefix=Buffer.alloc(10);prefix.write('0ZROAD01');prefix.writeUInt16BE(modified.length,8);
 return Buffer.concat([prefix,modified,bytes.subarray(10+size)]);
}
function callHandler({method='GET',url='/api/road-ipfs/content/'+CID,headers={},body=[]}={},deps={}){
 const req=Object.assign(Readable.from(body),{method,url,headers:{host:'127.0.0.1:8791',...headers}});
 const res={status:0,body:null,headers:{},writeHead(status,headers){this.status=status;this.headers=headers},end(body){this.body=body}};
 return handleUploadRequest(req,res,deps).then(()=>res);
}
test('bridge accepts only loopback Kubo and a real-looking CID',()=>{
 assert.equal(checkedKuboUrl('http://127.0.0.1:5001'),'http://127.0.0.1:5001');
 for(const bad of ['https://example.com','http://example.com:5001','http://user:pass@localhost:5001','http://localhost:5001/admin','http://localhost:5001/?arg=secret','http://localhost:5001/#fragment'])assert.throws(()=>checkedKuboUrl(bad));
 assert.equal(parseAddOutput('{"Name":"ciphertext.roadenc","Hash":"'+CID+'"}\n'),CID);
 assert.throws(()=>parseAddOutput('{"Hash":"bad"}\n'));
 assert.throws(()=>startBridge({host:'0.0.0.0'}),/loopback/);
});
test('bridge pins ciphertext then retrieves and verifies integrity',async()=>{
 const asset=await good(),calls=[];
 const fetchImpl=async(url,{body})=>{
  calls.push(url);
  if(url.includes('/add?')){assert.ok(body instanceof FormData);assert.equal(body.get('file').name,'ciphertext.roadenc');return new Response('{"Hash":"'+CID+'"}\n');}
  if(url.includes('/cat?'))return new Response(asset.bytes);
  if(url.includes('/pin/ls?'))return new Response(JSON.stringify({Keys:{[CID]:{Type:'recursive'}}}));
  throw Error('Unexpected Kubo API '+url);
 };
 const result=await storeEncryptedBytes(asset.bytes,{fetchImpl});
 assert.equal(result.cid,CID);assert.equal(result.sha256,sha256(asset.bytes));
 assert.equal(result.verified,true);assert.equal(result.pinned,true);assert.equal(calls.length,3);
});
test('reject plaintext, invalid containers, and mismatched Kubo bytes',async()=>{
 await assert.rejects(storeEncryptedBytes(Buffer.from('not encrypted')),/encrypted containers/);
 const asset=await good();
 await assert.rejects(storeEncryptedBytes(asset.bytes,{fetchImpl:async url=>{
  if(url.includes('/add?'))return new Response('{"Hash":"'+CID+'"}');
  if(url.includes('/cat?'))return new Response('corrupt');
  throw Error('unexpected');
 }}),/differs/);
 await assert.rejects(storeEncryptedBytes(Buffer.alloc(MAX_CIPHERTEXT_BYTES+1)),/256 MiB/);
});
test('a full 256 MiB original fits with its container header and authentication tag',()=>{
 const header=Buffer.from(JSON.stringify({v:1,alg:'AES-256-GCM',kdf:'PBKDF2-SHA-256',iterations:310000,
  salt:'a'.repeat(32),iv:'b'.repeat(24),name:'encrypted-work',mime:'application/octet-stream',bytes:MAX_ASSET_BYTES}));
 // Structural boundary fixture; authentication is exercised by real encryption/recovery tests.
 const container=Buffer.alloc(MAX_ASSET_BYTES+10+header.length+16);
 container.write('0ZROAD01');container.writeUInt16BE(header.length,8);header.copy(container,10);
 assert.ok(container.length>256*1024*1024);
 assert.equal(validateEncryptedContainer(container),container);
 const oversizeHeader=Buffer.from(header.toString().replace(String(MAX_ASSET_BYTES),String(MAX_ASSET_BYTES+1)));
 oversizeHeader.copy(container,10);
 assert.throws(()=>validateEncryptedContainer(container),/Unsupported/,'Header cannot claim an original beyond the encryption limit.');
});
test('upload handler bounds advertised and streamed bodies before calling storage',async()=>{
 const headers={'content-type':'application/octet-stream','x-road-encryption':'roadenc-v1'};
 const store=()=>assert.fail('An oversized body must not reach Kubo');
 const advertised=await callHandler({method:'POST',url:'/api/road-ipfs/upload',headers:{...headers,'content-length':String(MAX_CIPHERTEXT_BYTES+1)}},{store});
 assert.equal(advertised.status,413);
 // Reuse one chunk to exercise the real cap without allocating hundreds of MiB.
 const chunk=Buffer.alloc(1024*1024),body=Array(Math.ceil((MAX_CIPHERTEXT_BYTES+1)/chunk.length)).fill(chunk);
 for(const length of [undefined,'1']){
  const streamed=await callHandler({method:'POST',url:'/api/road-ipfs/upload',headers:{...headers,...(length?{'content-length':length}:{})},body},{store});
  assert.equal(streamed.status,413);assert.match(JSON.parse(streamed.body).error,/256 MiB/);
 }
});
test('HTTP handler rejects non-encrypted content and foreign browser origins',async()=>{
 const one=await callHandler({method:'POST',url:'/api/road-ipfs/upload',
  headers:{origin:'https://untrusted.example','content-type':'application/octet-stream','x-road-encryption':'roadenc-v1'}},
  {store:async()=>({})});
 assert.equal(one.status,403);
 const two=await callHandler({method:'POST',url:'/api/road-ipfs/upload',body:[Buffer.from('hello')],
  headers:{origin:'http://127.0.0.1:5173','content-type':'text/plain'}},{store:async()=>({})});
 assert.equal(two.status,415);
});

test('retrieval checks a local pin before bounded ciphertext cat and never accepts URL/path input',async()=>{
 const asset=await good(),calls=[];
 const fetchImpl=async(url,options)=>{
  calls.push(url);
  assert.equal(options.method,'POST');assert.equal(options.redirect,'error');
  assert.ok(options.signal instanceof AbortSignal);
  if(url.includes('/pin/ls?'))return pinResponse();
  assert.match(url,new RegExp('/cat\\?arg='+CID+'&length='+(MAX_CIPHERTEXT_BYTES+1)+'$'));
  return new Response(asset.bytes);
 };
 const result=await retrieveEncryptedBytes(CID,{fetchImpl});
 assert.deepEqual(result.bytes,Buffer.from(asset.bytes));
 assert.equal(result.sha256,asset.sha256);assert.equal(result.size,asset.bytes.length);
 assert.equal(result.cid,CID);assert.equal(result.pinned,true);
 assert.match(calls[0],/pin\/ls/);assert.match(calls[1],/cat/);
 for(const cid of [null,'bad','ipfs://'+CID,CID+'/file',CID+'?arg=other',CID+'\n','https://127.0.0.1:5001/api/v0/id','../id']){
  await assert.rejects(retrieveEncryptedBytes(cid,{fetchImpl:()=>assert.fail('invalid CID must not reach Kubo')}),
   error=>error.status===400);
 }
});

test('missing or indirect pins do not cause remote IPFS retrieval',async()=>{
 for(const response of [
  ()=>new Response(JSON.stringify({Keys:{}})),
  ()=>new Response(JSON.stringify({Keys:{[CID]:{Type:'indirect'}}})),
  ()=>new Response('not pinned',{status:500})
 ]){
  let requests=0;
  await assert.rejects(retrieveEncryptedBytes(CID,{fetchImpl:async url=>{
   requests++;assert.match(url,/pin\/ls/);return response();
  }}),error=>error.status===404&&/pin/.test(error.message));
  assert.equal(requests,1);
 }
 await assert.rejects(retrieveEncryptedBytes(CID,{fetchImpl:async()=>{throw Error('Node offline')}}),/Node offline/);
});

test('retrieval and upload reject malformed or plaintext-leaking containers',async()=>{
 const asset=await good();
 const badContainers=[
  Buffer.from('PLAINTEXT SOURCE'),
  Buffer.from('0ZROAD01'),
  asset.bytes.subarray(0,asset.bytes.length-1),
  changeHeader(asset.bytes,h=>{h.name='my-private-song.wav'}),
  changeHeader(asset.bytes,h=>{h.mime='audio/wav'}),
  changeHeader(asset.bytes,h=>{h.secret='should never be accepted'}),
  changeHeader(asset.bytes,h=>{h.bytes++}),
  changeHeader(asset.bytes,h=>{h.iterations=1})
 ];
 for(const bytes of badContainers){
  assert.throws(()=>validateEncryptedContainer(bytes));
  await assert.rejects(storeEncryptedBytes(bytes,{fetchImpl:()=>assert.fail('invalid upload must not reach Kubo')}));
  await assert.rejects(retrieveEncryptedBytes(CID,{fetchImpl:async url=>
   url.includes('/pin/ls?')?pinResponse():new Response(bytes)}));
 }
});

test('bounded reads cancel oversized streams with absent, honest, or dishonest content length',async()=>{
 for(const contentLength of [null,'1',String(MAX_CIPHERTEXT_BYTES+1)]){
  let cancelled=false,emitted=0;
  const chunk=new Uint8Array(64*1024);
  const body=new ReadableStream({
   pull(controller){controller.enqueue(chunk);emitted+=chunk.length;},
   cancel(){cancelled=true;}
  });
  const response=new Response(body,{headers:contentLength===null?{}:{'Content-Length':contentLength}});
  await assert.rejects(readBoundedBytes(response),error=>error.status===413);
  assert.equal(cancelled,true);
  assert.ok(emitted<=MAX_CIPHERTEXT_BYTES+2*chunk.length,'reader cancels close to the cap');
 }
 await assert.rejects(readBoundedBytes(new Response('short',{headers:{'Content-Length':'100'}})),
  error=>error.status===502&&/length/.test(error.message));
});

test('upload readback and recovery cannot bypass the production response size cap',async()=>{
 const asset=await good();
 const fetchImpl=async url=>{
  if(url.includes('/add?'))return new Response('{"Hash":"'+CID+'"}');
  if(url.includes('/pin/ls?'))return pinResponse();
  return new Response('oversized',{headers:{'Content-Length':String(MAX_CIPHERTEXT_BYTES+1)}});
 };
 await assert.rejects(storeEncryptedBytes(asset.bytes,{fetchImpl}),error=>error.status===413);
 await assert.rejects(retrieveEncryptedBytes(CID,{fetchImpl}),error=>error.status===413);
});

test('content endpoint rejects remote hosts, cross-site requests, and non-bare paths before retrieval',async()=>{
 const retrieve=()=>assert.fail('rejected request must not retrieve content');
 for(const headers of [
  {origin:'https://untrusted.example'},
  {origin:'null'},
  {host:'attacker.example:8791'},
  {host:'127.0.0.1:8791@attacker.example'},
  {host:''},
  {'sec-fetch-site':'cross-site'}
 ])assert.equal((await callHandler({headers},{retrieve})).status,403);
 for(const url of [
  '/api/road-ipfs/content/'+CID+'?download=1',
  '/api/road-ipfs/content/'+CID+'/secret',
  '/api/road-ipfs/content/%2Fapi%2Fv0%2Fid',
  '/api/road-ipfs/content/'+CID+'#fragment',
  'http://127.0.0.1:8791/api/road-ipfs/content/'+CID,
  '//127.0.0.1:8791/api/road-ipfs/content/'+CID,
  '/api/road-ipfs/content/../health'
 ])assert.equal((await callHandler({url},{retrieve})).status,400);
 assert.equal((await callHandler({url:'/api/v0/id'},{retrieve})).status,404);
});

test('real HTTP recovery response contains only pinned ciphertext and safe download headers',async(t)=>{
 const asset=await good();let kuboCalls=0;
 const fetchImpl=async url=>{
  kuboCalls++;
  if(url.includes('/pin/ls?'))return pinResponse();
  if(url.includes('/cat?'))return new Response(asset.bytes);
  throw Error('Unexpected Kubo route');
 };
 const server=createServer((req,res)=>{void handleUploadRequest(req,res,{fetchImpl});});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const port=server.address().port,base='http://127.0.0.1:'+port;
 const response=await fetch(base+'/api/road-ipfs/content/'+CID,{headers:{Origin:'http://127.0.0.1:5173'}});
 assert.equal(response.status,200);
 assert.equal(response.headers.get('content-type'),'application/octet-stream');
 assert.equal(response.headers.get('content-length'),String(asset.bytes.length));
 assert.equal(response.headers.get('x-road-ciphertext-size'),String(asset.bytes.length));
 assert.equal(response.headers.get('x-road-ciphertext-sha256'),asset.sha256);
 assert.equal(response.headers.get('x-road-cid'),CID);
 assert.equal(response.headers.get('x-road-encryption'),'roadenc-v1');
 assert.match(response.headers.get('content-disposition'),/^attachment;/);
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 const bytes=Buffer.from(await response.arrayBuffer());
 assert.deepEqual(bytes,Buffer.from(asset.bytes));
 assert.equal(bytes.includes(Buffer.from('CANARY PRIVATE DATA')),false);
 assert.equal(kuboCalls,2);
 const denied=await fetch(base+'/api/road-ipfs/content/'+CID,{headers:{Origin:'https://untrusted.example'}});
 assert.equal(denied.status,403);assert.equal(kuboCalls,2);
 const rebound=await new Promise((resolve,reject)=>{
  const req=httpRequest({host:'127.0.0.1',port,path:'/api/road-ipfs/content/'+CID,headers:{Host:'rebound.example'}},res=>{
   res.resume();res.on('end',()=>resolve(res.statusCode));
  });req.on('error',reject);req.end();
 });
 assert.equal(rebound,403);assert.equal(kuboCalls,2);
});

test('content endpoint maps unavailable pins and malformed content to explicit failures',async()=>{
 const unpinned=await callHandler({}, {fetchImpl:async()=>new Response(JSON.stringify({Keys:{}}))});
 assert.equal(unpinned.status,404);assert.match(JSON.parse(unpinned.body).error,/pinned/);
 const invalid=await callHandler({}, {fetchImpl:async url=>url.includes('/pin/ls?')?pinResponse():new Response('not encrypted')});
 assert.equal(invalid.status,502);assert.match(JSON.parse(invalid.body).error,/encrypted containers/);
 assert.equal(invalid.headers['Content-Type'],'application/json; charset=utf-8');
 assert.equal(invalid.headers['Cache-Control'],'no-store');
});
