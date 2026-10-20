import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {encryptAsset} from '../src/road-encryption.js';
import {MAX_CIPHERTEXT_BYTES,parseAddOutput,checkedKuboUrl,storeEncryptedBytes,handleUploadRequest,sha256} from '../scripts/ipfs-bridge.mjs';
import {Readable} from 'node:stream';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const CID='bafybei'+'a'.repeat(52);
const good=async()=>encryptAsset(new TextEncoder().encode('CANARY PRIVATE DATA'), 'private bridge test passphrase 123',
 {name:'encrypted-work',mime:'application/octet-stream'});
test('bridge accepts only loopback Kubo and a real-looking CID',()=>{
 assert.equal(checkedKuboUrl('http://127.0.0.1:5001'),'http://127.0.0.1:5001');
 for(const bad of ['https://example.com','http://example.com:5001','http://user:pass@localhost:5001','http://localhost:5001/admin'])assert.throws(()=>checkedKuboUrl(bad));
 assert.equal(parseAddOutput('{"Name":"ciphertext.roadenc","Hash":"'+CID+'"}\n'),CID);
 assert.throws(()=>parseAddOutput('{"Hash":"bad"}\n'));
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
 await assert.rejects(storeEncryptedBytes(Buffer.alloc(MAX_CIPHERTEXT_BYTES+1)),/32 MiB/);
});
test('HTTP handler rejects non-encrypted content and foreign browser origins',async()=>{
 const response=()=>({status:0,body:'',
  writeHead(code){this.status=code},end(value){this.body=value}});
 const foreign=Object.assign(Readable.from([]),{method:'POST',url:'/api/road-ipfs/upload',
  headers:{origin:'https://untrusted.example','content-type':'application/octet-stream','x-road-encryption':'roadenc-v1'}});
 const one=response();await handleUploadRequest(foreign,one,{store:async()=>({})});
 assert.equal(one.status,403);
 const plaintext=Object.assign(Readable.from([Buffer.from('hello')]),{method:'POST',url:'/api/road-ipfs/upload',
  headers:{origin:'http://127.0.0.1:5173','content-type':'text/plain'}});
 const two=response();await handleUploadRequest(plaintext,two,{store:async()=>({})});
 assert.equal(two.status,415);
});
