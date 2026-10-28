import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readPublicNftCover} from '../src/nft-cover-read.js';
import {uploadNftCover} from '../src/nft-cover-storage.js';
import {handleUploadRequest,sha256} from '../scripts/ipfs-bridge.mjs';
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAIUlEQVR4nGP8f9kpxjeSgYGBgYGBMVphNgMMMDEgARQOAMDRBDMbPbpyAAAAAElFTkSuQmCC','base64');
const cid='bafy'+'a'.repeat(55),uri='ipfs://'+cid;
const png=()=>new Response(bytes,{headers:{'content-type':'image/png','x-road-image-sha256':sha256(bytes)}});
test('browser cover reads are bounded same-origin GETs to the public rendition, never metadata recovery',async()=>{
 const result=await readPublicNftCover(uri,{expectedSha256:sha256(bytes),fetchImpl:async(path,options)=>{
  assert.equal(path,'/api/road-ipfs/nft-cover/'+cid);assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.body,undefined);return png();
 }});
 assert.equal(result.width,4);assert.equal(result.height,4);assert.equal(result.sha256,sha256(bytes));assert.deepEqual(result.bytes,new Uint8Array(bytes));
 for(const bad of ['https://example.invalid/key',uri+'?secret=x',uri+'/original.roadenc','road-local://sha256/abc'])await assert.rejects(readPublicNftCover(bad,{fetchImpl:()=>assert.fail('No remote or private request allowed')}));
});
test('a successful pin cannot permit a mint when the actual public image route is broken',async()=>{
 for(const answer of [()=>new Response('missing',{status:404}),()=>new Response('0ZROAD01encrypted-data',{headers:{'content-type':'image/png'}}),()=>new Response('<html>not PNG</html>',{headers:{'content-type':'text/html'}})]){
  let calls=0;
  await assert.rejects(uploadNftCover(bytes,{consent:true,fetchImpl:async(path,options)=>{calls++;if(options.method==='POST')return Response.json({cid,sha256:sha256(bytes),size:bytes.length,mime:'image/png',pinned:true,verified:true});return answer();}}));
  assert.equal(calls,2);
 }
});
test('wrong checksums, malformed PNG and streamed oversize data fail before a display is verified',async()=>{
 await assert.rejects(readPublicNftCover(uri,{expectedSha256:'0'.repeat(64),fetchImpl:async()=>png()}),/differ/);
 await assert.rejects(readPublicNftCover(uri,{fetchImpl:async()=>new Response(Buffer.alloc(524289),{headers:{'content-type':'image/png'}})}),/limit/);
 await assert.rejects(readPublicNftCover(uri,{fetchImpl:async()=>new Response(bytes,{headers:{'content-type':'image/png','content-length':'10000000'}})}));
 await assert.rejects(readPublicNftCover(uri,{fetchImpl:async()=>new Response('0ZROAD01private',{headers:{'content-type':'image/png'}})}),error=>error.code==='COVER_ENCRYPTED');
 await assert.rejects(readPublicNftCover(uri,{timeoutMs:10,fetchImpl:()=>new Promise(()=>{})}),error=>error.code==='COVER_TIMEOUT');
});
test('real HTTP serves cached/peer public PNG without local pin; encrypted bytes and upstream secrets never escape',async t=>{
 let mode='png';const methods=[];
 const server=createServer((req,res)=>void handleUploadRequest(req,res,{fetchImpl:async url=>{
  methods.push(new URL(url).pathname);assert.ok(url.includes('/cat?'));assert.ok(url.includes('length=524289'));
  if(mode==='offline')throw Error('SECRET provider token');
  return new Response(mode==='png'?bytes:mode==='cipher'?Buffer.from('0ZROAD01SECRET'):Buffer.from('<svg>SECRET</svg>'));
 }}));
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const base='http://127.0.0.1:'+server.address().port,path='/api/road-ipfs/nft-cover/'+cid;
 const image=await fetch(base+path);assert.equal(image.status,200);assert.equal(image.headers.get('x-road-image-sha256'),sha256(bytes));assert.match(image.headers.get('content-disposition'),/^inline/);assert.deepEqual(Buffer.from(await image.arrayBuffer()),bytes);
 for(const [next,status,code] of [['cipher',422,'COVER_ENCRYPTED'],['svg',422,'COVER_NOT_PNG'],['offline',503,'COVER_UNAVAILABLE']]){
  mode=next;const response=await fetch(base+path);assert.equal(response.status,status);assert.equal(response.headers.get('x-road-cover-error'),code);assert.equal(response.headers.get('cache-control'),'no-store');assert.doesNotMatch(await response.text(),/SECRET/);
 }
 assert.ok(methods.every(method=>method==='/api/v0/cat'));
});
