import {writeFile,mkdir} from 'node:fs/promises';
/** Real upload/export/import/recovery round trip through the browser model and
 * local Kubo bridge. Never sends plaintext or a decryption key to the bridge.
 */
import {webcrypto,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {encryptAsset} from '../src/road-encryption.js';
import {uploadEncryptedAsset,pinEncryptedBrickMetadata,checkLocalIpfs} from '../src/ipfs-upload.js';
import {buildRecoveryFile,parseRecoveryFile,recoverIpfsEntry,assetsFromRecoveredMetadata} from '../src/ipfs-recovery.js';
import {SAMPLE_KEY,SAMPLE_BYTES,bridgeFetch} from './ipfs-smoke-fixture.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const node=await checkLocalIpfs(bridgeFetch);
const originalSha256=createHash('sha256').update(SAMPLE_BYTES).digest('hex');
const enc=await encryptAsset(SAMPLE_BYTES,SAMPLE_KEY,{name:'encrypted-work',mime:'application/octet-stream'});
const uploaded=await uploadEncryptedAsset({entry:{bytes:enc.bytes,ciphertextSha256:enc.sha256},fetchImpl:bridgeFetch});
assert.equal(uploaded.pinned,true);assert.equal(uploaded.verified,true);
const metadata={title:'Synthetic IPFS recovery fixture',media:[{
 role:'master',name:'ybr-roundtrip.txt',mediaType:'text/plain',byteLength:SAMPLE_BYTES.length,
 integrity:{algorithm:'sha2-256',digest:'0x'+originalSha256},access:{ciphertextDigest:'0x'+uploaded.sha256},cid:uploaded.cid
}]};
const packet=await pinEncryptedBrickMetadata({packet:{bricks:[{localId:'master',role:'Test work',metadata}],storage:{},notices:[]},secret:SAMPLE_KEY,fetchImpl:bridgeFetch});
const exported=buildRecoveryFile({secret:SAMPLE_KEY,assets:{master:{
 name:'ybr-roundtrip.txt',type:'text/plain',size:SAMPLE_BYTES.length,hash:originalSha256,
 encryption:{sha256:uploaded.sha256},ipfsUpload:uploaded
}},packet});
// Discard the original in-memory vault. Recovery receives only the serialized
// private backup plus ciphertext fetched from the real local node.
const kit=parseRecoveryFile(JSON.stringify(exported));
const recovered=await recoverIpfsEntry({entry:kit.assets[0],key:kit.key,fetchImpl:bridgeFetch});
assert.deepEqual(recovered.bytes,SAMPLE_BYTES);
assert.deepEqual(recovered.verification,{ciphertext:true,plaintext:true,onChain:false,legacy:false});
const recoveredMetadata=await recoverIpfsEntry({entry:kit.metadata[0],key:kit.key,fetchImpl:bridgeFetch});
assert.deepEqual(JSON.parse(new TextDecoder().decode(recoveredMetadata.bytes)),metadata);
const referenced=assetsFromRecoveredMetadata(JSON.parse(new TextDecoder().decode(recoveredMetadata.bytes)));
assert.equal(referenced[0].cid,uploaded.cid);
const viaMetadata=await recoverIpfsEntry({entry:referenced[0],key:kit.key,fetchImpl:bridgeFetch});
assert.deepEqual(viaMetadata.bytes,SAMPLE_BYTES);
await assert.rejects(recoverIpfsEntry({entry:kit.assets[0],key:'a deliberately incorrect sample key',fetchImpl:bridgeFetch}),/Unable to decrypt/);
await assert.rejects(recoverIpfsEntry({entry:{...kit.assets[0],encryptedSha256:'0'.repeat(64)},key:kit.key,fetchImpl:bridgeFetch}),/integrity check failed/);
await mkdir('.road-local',{recursive:true});
// Only public test fixture references are persisted. No key is written here.
await writeFile('.road-local/ipfs-smoke-receipt.json',JSON.stringify({
 cid:uploaded.cid,sha256:uploaded.sha256,size:uploaded.size,format:kit.format,
 assets:kit.assets,metadata:kit.metadata,syntheticFixture:true
},null,2)+'\n');
process.stdout.write(JSON.stringify({status:'pinned-and-recovered',cid:uploaded.cid,encryptedBytes:uploaded.size,metadataCid:kit.metadata[0].cid,kuboPeerId:node.peerId})+'\n');
