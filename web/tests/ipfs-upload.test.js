import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {encryptAsset} from '../src/road-encryption.js';
import {uploadEncryptedAsset,validateUploadReceipt,pinEncryptedBrickMetadata,checkLocalIpfs} from '../src/ipfs-upload.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const CID='bafybei'+'a'.repeat(52);
const hex='b'.repeat(64);
const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
test('rejects wrong CIDs, unverified pins, size and digest mismatches',()=>{
 const base={cid:CID,sha256:hex,size:123,pinned:true,verified:true};
 assert.equal(validateUploadReceipt(base,hex,123).cid,CID);
 for(const val of [{...base,cid:'javascript:alert(1)'},{...base,sha256:'c'.repeat(64)},{...base,pinned:false},{...base,verified:false},{...base,size:3}]){
  assert.throws(()=>validateUploadReceipt(val,hex,123));
 }
});
test('browser sends only ciphertext bytes via explicit local bridge path',async()=>{
 const encrypted=await encryptAsset(new TextEncoder().encode('SECRET-CREATOR-ORIGINAL'), 'a private testing passphrase for upload',
  {name:'encrypted-work',mime:'application/octet-stream'});
 const calls=[];
 const fetchImpl=async(path,options)=>{
  calls.push({path,method:options.method,body:options.body,header:options.headers});
  return respond({cid:CID,sha256:encrypted.sha256,size:encrypted.bytes.length,pinned:true,verified:true});
 };
 const out=await uploadEncryptedAsset({entry:{bytes:encrypted.bytes,ciphertextSha256:encrypted.sha256},fetchImpl});
 assert.equal(out.cid,CID);assert.equal(calls.length,1);assert.equal(calls[0].path,'/api/road-ipfs/upload');
 assert.equal(calls[0].method,'POST');
 assert.equal(calls[0].header['X-Road-Encryption'],'roadenc-v1');
 assert.equal(new TextDecoder().decode(calls[0].body).includes('SECRET-CREATOR-ORIGINAL'),false);
});
test('IPFS metadata is itself encrypted, can be recovered with secret, and is referenced per Brick',async()=>{
 const original={title:'UNRELEASED SECRET TITLE',media:[],rights:{ownershipStatus:'self-declared'}};
 const packet={packetType:'LOCAL_PREVIEW_NOT_MINTED',storage:{uploaded:false},bricks:[{localId:'master',role:'Music',metadata:original}],notices:[]};
 const key='a very long private metadata encryption test passphrase';
 const seen=[];
 const fetchImpl=async(path,options)=>{
  seen.push(options.body);
  const digest=await globalThis.crypto.subtle.digest('SHA-256',options.body);
  const sha256=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  return respond({cid:CID,sha256,size:options.body.byteLength,pinned:true,verified:true});
 };
 const result=await pinEncryptedBrickMetadata({packet,secret:key,fetchImpl});
 assert.equal(result.bricks[0].metadataCipherCid,CID);
 assert.match(result.bricks[0].metadataCipherSha256,/^[a-f0-9]{64}$/);
 assert.equal(result.bricks[0].metadataCipherSize,seen[0].byteLength);
 const expectedMetadata=new TextEncoder().encode(JSON.stringify(original));
 const expectedDigest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',expectedMetadata))].map(b=>b.toString(16).padStart(2,'0')).join('');
 assert.equal(result.bricks[0].metadataPlaintextSha256,expectedDigest);
 assert.equal(result.bricks[0].metadataPlaintextSize,expectedMetadata.byteLength);
 assert.equal(result.storage.uploaded,true);assert.equal(result.storage.encrypted,true);
 assert.equal(result.storage.provider,'ybr-local-kubo');
 assert.equal(result.storage.approvedProvider,false);
 assert.equal(seen.length,1);
 assert.ok(!new TextDecoder().decode(seen[0]).includes('UNRELEASED SECRET TITLE'));
 assert.equal(packet.storage.uploaded,false,'Do not mutate an unsubmitted packet');
});
test('offline bridge fails without false success, health must identify node',async()=>{
 await assert.rejects(checkLocalIpfs(async()=>respond({ok:false},503)),/unavailable/);
 await assert.rejects(checkLocalIpfs(async()=>respond({ok:false})),/health/);
 await assert.rejects(uploadEncryptedAsset({entry:{bytes:new Uint8Array([1]),ciphertextSha256:hex},fetchImpl:async()=>respond({error:'Node offline'},503)}),/Node offline/);
});
