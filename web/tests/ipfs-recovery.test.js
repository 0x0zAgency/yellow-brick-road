import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {encryptAsset} from '../src/road-encryption.js';
import {MAX_ASSET_BYTES,MAX_ENCRYPTED_ASSET_BYTES} from '../src/asset-limits.js';
import {pinEncryptedBrickMetadata,uploadEncryptedAsset} from '../src/ipfs-upload.js';
import {
 RECOVERY_V1,RECOVERY_V2,MAX_RECOVERY_FILE_BYTES,MAX_RECOVERY_CIPHERTEXT_BYTES,IPFS_RECOVERY_TIMEOUT_MS,
 parseRecoveryFile,buildRecoveryFile,recoverIpfsEntry,assetsFromRecoveredMetadata,recoveryDownloadName
} from '../src/ipfs-recovery.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const CID='bafybei'+'a'.repeat(52),META_CID='bafybei'+'b'.repeat(52);
const key='private creator recovery key with enough entropy for this test only';
const source=new TextEncoder().encode('Unpublished creator original. Preserve exact bytes.');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const response=bytes=>new Response(bytes,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(bytes.byteLength)}});
const json=object=>new Response(JSON.stringify(object),{headers:{'Content-Type':'application/json'}});
const encrypted=await encryptAsset(source,key,{name:'encrypted-work',mime:'application/octet-stream'});
const asset={kind:'asset',role:'master',name:'original.wav',mime:'audio/wav',cid:CID,encryptedSha256:encrypted.sha256,encryptedSize:encrypted.bytes.length,originalSha256:hash(source),originalSize:source.length};
const kit=(assets=[asset],metadata=[])=>({format:RECOVERY_V2,key,assets,metadata});

test('v2 recovery round trip uses captured upload bytes and never sends key or plaintext',async()=>{
 const stored=new Map(),calls=[];
 const fetchImpl=async(path,options)=>{
  calls.push({path,method:options.method,headers:options.headers,body:options.body,redirect:options.redirect});
  if(path==='/api/road-ipfs/upload'){
   stored.set(CID,options.body.slice());
   return json({cid:CID,sha256:hash(options.body),size:options.body.length,pinned:true,verified:true});
  }
  assert.equal(path,'/api/road-ipfs/content/'+CID);
  return response(stored.get(CID));
 };
 const receipt=await uploadEncryptedAsset({entry:{bytes:encrypted.bytes,ciphertextSha256:encrypted.sha256},fetchImpl});
 const exported=buildRecoveryFile({secret:key,assets:{master:{name:'original.wav',type:'audio/wav',hash:hash(source),size:source.length,ipfsUpload:receipt}}});
 const imported=parseRecoveryFile(JSON.stringify(exported));
 const recovered=await recoverIpfsEntry({entry:imported.assets[0],key:imported.key,fetchImpl});
 assert.deepEqual(recovered.bytes,source);
 assert.equal(recovered.name,'original.wav');assert.equal(recovered.mime,'audio/wav');
 assert.deepEqual(recovered.verification,{ciphertext:true,plaintext:true,onChain:false,legacy:false});
 assert.equal(calls.length,2);
 assert.equal(calls[1].method,'GET');assert.equal(calls[1].body,undefined);assert.equal(calls[1].redirect,'error');
 const requests=JSON.stringify(calls);
 assert.ok(!requests.includes(key));assert.ok(!requests.includes(new TextDecoder().decode(source)));
});

test('metadata receipts preserve exact plaintext commitment and recover linked asset references',async()=>{
 const metadata={title:'Unpublished title',media:[{role:'master',name:'source.wav',mediaType:'audio/wav',byteLength:source.length,
  integrity:{algorithm:'sha2-256',digest:'0x'+hash(source)},access:{ciphertextDigest:'0x'+encrypted.sha256},cid:CID}]};
 const stored=new Map([[CID,encrypted.bytes]]);
 const packet=await pinEncryptedBrickMetadata({packet:{bricks:[{localId:'master',role:'Sound recording',metadata}],storage:{},notices:[]},secret:key,
  fetchImpl:async(path,options)=>{stored.set(META_CID,options.body);return json({cid:META_CID,sha256:hash(options.body),size:options.body.length,pinned:true,verified:true});}});
 const exported=buildRecoveryFile({secret:key,assets:{},packet});
 const imported=parseRecoveryFile(JSON.stringify(exported));
 assert.equal(imported.metadata[0].originalSha256,hash(JSON.stringify(metadata)));
 const fetchImpl=async path=>response(stored.get(path.split('/').at(-1)));
 const recovered=await recoverIpfsEntry({entry:imported.metadata[0],key,fetchImpl,expectedPlaintextSha256:'0x'+hash(JSON.stringify(metadata))});
 assert.deepEqual(JSON.parse(new TextDecoder().decode(recovered.bytes)),metadata);
 assert.deepEqual(recovered.verification,{ciphertext:true,plaintext:true,onChain:true,legacy:false});
 const references=assetsFromRecoveredMetadata(metadata);
 assert.equal(references.length,1);assert.equal(references[0].encryptedSize,null);
 const work=await recoverIpfsEntry({entry:references[0],key,fetchImpl});
 assert.deepEqual(work.bytes,source);assert.equal(work.verification.onChain,false,'Caller tracks the independently verified parent metadata relationship.');
});

test('legacy v1 source backups recover with their precise evidence limits',async()=>{
 const imported=parseRecoveryFile(JSON.stringify({format:RECOVERY_V1,key,assets:[{role:'master',name:'old.wav',cid:CID,encryptedSha256:encrypted.sha256}],metadata:[]}));
 const result=await recoverIpfsEntry({entry:imported.assets[0],key,fetchImpl:async()=>response(encrypted.bytes)});
 assert.deepEqual(result.bytes,source);
 assert.deepEqual(result.verification,{ciphertext:true,plaintext:false,onChain:false,legacy:true});
 const legacyMeta=parseRecoveryFile(JSON.stringify({format:RECOVERY_V1,key,assets:[],metadata:[{role:'Sound recording',cid:META_CID}]}));
 const legacy=await recoverIpfsEntry({entry:legacyMeta.metadata[0],key,fetchImpl:async()=>response(encrypted.bytes)});
 assert.deepEqual(legacy.verification,{ciphertext:false,plaintext:false,onChain:false,legacy:true});
});

test('early key-only backups can recover metadata anchored to a selected live commitment',async()=>{
 const early=buildRecoveryFile({secret:key});
 assert.deepEqual(early.assets,[]);assert.deepEqual(early.metadata,[]);
 const imported=parseRecoveryFile(JSON.stringify(early));
 let requests=0;
 const fetchImpl=async()=>{requests++;return response(encrypted.bytes)};
 const metadataEntry={cid:CID,role:'metadata',name:'brick-metadata.json',mime:'application/json'};
 await assert.rejects(recoverIpfsEntry({entry:metadataEntry,key:imported.key,fetchImpl}),/commitment/);
 assert.equal(requests,0,'Key-only metadata requires a live commitment before fetching.');
 const result=await recoverIpfsEntry({entry:metadataEntry,key:imported.key,fetchImpl,expectedPlaintextSha256:'0x'+hash(source)});
 assert.deepEqual(result.bytes,source);
 assert.deepEqual(result.verification,{ciphertext:false,plaintext:true,onChain:true,legacy:false});
 await assert.rejects(recoverIpfsEntry({entry:metadataEntry,key,fetchImpl,expectedPlaintextSha256:'f'.repeat(64)}),/on-chain commitment/);
});

test('corrupted ciphertext, wrong recovery keys, source digest and original-size mismatches fail closed',async()=>{
 const corrupted=encrypted.bytes.slice();corrupted[corrupted.length-1]^=1;
 await assert.rejects(recoverIpfsEntry({entry:asset,key,fetchImpl:async()=>response(corrupted)}),/Encrypted file integrity/);
 await assert.rejects(recoverIpfsEntry({entry:asset,key:'a different private recovery key',fetchImpl:async()=>response(encrypted.bytes)}),/Unable to decrypt/);
 await assert.rejects(recoverIpfsEntry({entry:{...asset,originalSha256:'f'.repeat(64)},key,fetchImpl:async()=>response(encrypted.bytes)}),/original integrity/);
 await assert.rejects(recoverIpfsEntry({entry:{...asset,originalSize:source.length+1},key,fetchImpl:async()=>response(encrypted.bytes)}),/original/);
 const unauthenticated={kind:'metadata',role:'metadata',cid:CID,legacy:true};
 await assert.rejects(recoverIpfsEntry({entry:unauthenticated,key,fetchImpl:async()=>response(corrupted)}),/Unable to decrypt/,'AES-GCM still authenticates legacy metadata without a stored digest.');
});

test('selected on-chain commitment cannot be overridden by a recovery-file digest',async()=>{
 let requested=false;
 await assert.rejects(recoverIpfsEntry({entry:{...asset,kind:'metadata'},key,
  expectedPlaintextSha256:'f'.repeat(64),fetchImpl:async()=>{requested=true;return response(encrypted.bytes)}}),/selected metadata commitment/);
 assert.equal(requested,false);
});

test('imports reject malformed, oversized, duplicate or incomplete records without echoing secrets',()=>{
 let error;
 try{parseRecoveryFile('{"key":"'+key)}catch(caught){error=caught}
 assert.ok(error);assert.ok(!error.message.includes(key));
 assert.throws(()=>parseRecoveryFile(' '.repeat(MAX_RECOVERY_FILE_BYTES+1)),/1 MiB/);
 assert.throws(()=>parseRecoveryFile(JSON.stringify({...kit(),format:'future-unknown'})),/format/);
 assert.throws(()=>parseRecoveryFile(JSON.stringify({...kit(),key:'short'})),/key/);
 assert.throws(()=>parseRecoveryFile(JSON.stringify({...kit(),key:'a'.repeat(257)})),/key/);
 assert.throws(()=>parseRecoveryFile(JSON.stringify(kit([asset,asset]))),/duplicate/);
 assert.throws(()=>parseRecoveryFile(JSON.stringify(kit([{...asset,cid:'https://attacker.invalid/path'}]))),/bare IPFS CID/);
 assert.throws(()=>parseRecoveryFile(JSON.stringify(kit([{...asset,cid:CID+'/secret'}]))),/bare IPFS CID/);
 assert.throws(()=>parseRecoveryFile(JSON.stringify(kit([{...asset,originalSha256:undefined}]))),/digest/);
 assert.throws(()=>parseRecoveryFile(JSON.stringify(kit([{...asset,encryptedSize:undefined}]))),/size/);
 assert.throws(()=>parseRecoveryFile(JSON.stringify(kit([{...asset,mime:'text/html; boundary=bad'}]))),/media type/);
 assert.throws(()=>parseRecoveryFile(JSON.stringify(kit([{...asset,originalSize:-1}]))),/size/);
});
test('recovery backups accept full-size originals plus encryption overhead and reject larger entries',()=>{
 const full={...asset,originalSize:256*1024*1024,encryptedSize:256*1024*1024+300};
 const exported=buildRecoveryFile({secret:key,assets:{master:{name:full.name,type:full.mime,hash:full.originalSha256,size:full.originalSize,
  ipfsUpload:{cid:CID,sha256:full.encryptedSha256,size:full.encryptedSize,verified:true}}}});
 const imported=parseRecoveryFile(JSON.stringify(exported));
 assert.equal(imported.assets[0].originalSize,full.originalSize);
 assert.equal(imported.assets[0].encryptedSize,full.encryptedSize);
 assert.equal(MAX_RECOVERY_CIPHERTEXT_BYTES,MAX_ENCRYPTED_ASSET_BYTES);
 for(const entry of [{...full,originalSize:MAX_ASSET_BYTES+1},{...full,encryptedSize:MAX_RECOVERY_CIPHERTEXT_BYTES+1}])
  assert.throws(()=>parseRecoveryFile(JSON.stringify(kit([entry]))),/256 MiB/);
});

test('download names are safe basenames and do not treat imported media as executable markup',()=>{
 const entry=parseRecoveryFile(JSON.stringify(kit([{...asset,name:'../../<script>bad</script>.html'}]))).assets[0];
 assert.equal(entry.name,'script_.html');
 assert.equal(recoveryDownloadName('..\\..\\CON.txt'),'recovered-CON.txt');
 assert.equal(recoveryDownloadName('..'),'recovered-file');
 assert.ok(!recoveryDownloadName('image\u202eexe.png').includes('\u202e'));
 const fallback=parseRecoveryFile(JSON.stringify(kit([{...asset,name:undefined,role:'../../unsafe'}]))).assets[0];
 assert.equal(fallback.name,'unsafe-recovered');
});

test('metadata media extraction rejects missing or duplicated integrity evidence',()=>{
 const media={role:'master',name:'source.wav',mediaType:'audio/wav',byteLength:source.length,integrity:{algorithm:'sha2-256',digest:hash(source)},access:{ciphertextDigest:encrypted.sha256},cid:CID};
 assert.deepEqual(assetsFromRecoveredMetadata({media:[{...media,cid:null}]}),[]);
 assert.throws(()=>assetsFromRecoveredMetadata({media:[media,media]}),/duplicate/);
 assert.throws(()=>assetsFromRecoveredMetadata({media:[{...media,integrity:{algorithm:'sha1',digest:hash(source)}}]}),/supported/);
 assert.throws(()=>assetsFromRecoveredMetadata({media:[{...media,access:{}}]}),/digest/);
 assert.throws(()=>assetsFromRecoveredMetadata({media:[{...media,byteLength:undefined}]}),/length/);
 assert.throws(()=>assetsFromRecoveredMetadata({media:[null]}),/invalid media/);
});

test('untrusted bridge responses cannot override local integrity checks or redirect recovery',async()=>{
 const bad=encrypted.bytes.slice();bad[bad.length-1]^=1;
 await assert.rejects(recoverIpfsEntry({entry:asset,key,fetchImpl:async()=>new Response(bad,{headers:{'Content-Type':'application/octet-stream','X-Road-Ciphertext-SHA256':asset.encryptedSha256}})}),/integrity/);
 await assert.rejects(recoverIpfsEntry({entry:asset,key,fetchImpl:async()=>new Response('<html>no</html>',{headers:{'Content-Type':'text/html'}})}),/encrypted binary/);
 await assert.rejects(recoverIpfsEntry({entry:asset,key,fetchImpl:async()=>new Response('secret response '+key,{status:404})}),/not pinned/);
 const redirect=response(encrypted.bytes);Object.defineProperty(redirect,'redirected',{value:true});
 await assert.rejects(recoverIpfsEntry({entry:asset,key,fetchImpl:async()=>redirect}),/local bridge/);
});

test('download limits bound advertised and streamed sizes, including dishonest headers',async()=>{
 const legacy={kind:'metadata',role:'metadata',cid:CID,legacy:true};
 await assert.rejects(recoverIpfsEntry({entry:legacy,key,fetchImpl:async()=>new Response('x',{headers:{'Content-Type':'application/octet-stream','Content-Length':String(MAX_RECOVERY_CIPHERTEXT_BYTES+1)}})}),/256 MiB/);
 let canceled=false;
 const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(MAX_RECOVERY_CIPHERTEXT_BYTES+1));},cancel(){canceled=true}});
 await assert.rejects(recoverIpfsEntry({entry:legacy,key,fetchImpl:async()=>new Response(stream,{headers:{'Content-Type':'application/octet-stream','Content-Length':'1'}})}),/256 MiB/);
 assert.equal(canceled,true);
 await assert.rejects(recoverIpfsEntry({entry:asset,key,fetchImpl:async()=>new Response(encrypted.bytes,{headers:{'Content-Type':'application/octet-stream','Content-Length':'1'}})}),/length/);
});

test('canceling before or during recovery stops network/body work and returns no plaintext',async()=>{
 let requested=false;
 const canceled=new AbortController();canceled.abort();
 await assert.rejects(recoverIpfsEntry({entry:asset,key,signal:canceled.signal,fetchImpl:async()=>{requested=true;return response(encrypted.bytes)}}),{name:'AbortError'});
 assert.equal(requested,false);
 const pending=new AbortController();let bodyCanceled=false;
 const recovery=recoverIpfsEntry({entry:asset,key,signal:pending.signal,fetchImpl:async()=>new Response(new ReadableStream({cancel(){bodyCanceled=true}}),{headers:{'Content-Type':'application/octet-stream'}})});
 setTimeout(()=>pending.abort(),10);
 await assert.rejects(recovery,{name:'AbortError'});
 assert.equal(bodyCanceled,true);
});

test('recovery has a finite timeout even if the fetch adapter never resolves',async()=>{
 const originalTimer=globalThis.setTimeout;
 globalThis.setTimeout=(callback,delay,...args)=>{
  if(delay===IPFS_RECOVERY_TIMEOUT_MS){queueMicrotask(callback);return 0;}
  return originalTimer(callback,delay,...args);
 };
 try{
  await assert.rejects(recoverIpfsEntry({entry:asset,key,fetchImpl:()=>new Promise(()=>{})}),/timed out/);
 }finally{globalThis.setTimeout=originalTimer;}
});
