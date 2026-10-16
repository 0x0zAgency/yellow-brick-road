import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {encryptAsset,decryptAsset} from '../src/road-encryption.js';
import {assetSlots,makeRegistrationPacket} from '../src/mint-model.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
test('authenticated encryption round-trip and distinct random ciphertext',async()=>{
 const source=new TextEncoder().encode('An unpublished project');
 const one=await encryptAsset(source,'correct horse yellow brick',{name:'session.flp'});
 const two=await encryptAsset(source,'correct horse yellow brick',{name:'session.flp'});
 assert.notEqual(one.sha256,two.sha256);
 assert.equal(one.header.alg,'AES-256-GCM');
 assert.deepEqual([...((await decryptAsset(one.bytes,'correct horse yellow brick')).bytes)],[...source]);
 await assert.rejects(decryptAsset(one.bytes,'incorrect-password-123'));
 const corrupted=one.bytes.slice();corrupted[corrupted.length-1]^=1;
 await assert.rejects(decryptAsset(corrupted,'correct horse yellow brick'));
});
test('native project slot does not bundle stems or claim wav as DAW project',()=>{
 const p=assetSlots.find(x=>x.id==='project');
 assert.match(p.label,/Project File/);assert.doesNotMatch(p.label,/stems/i);assert.equal(p.accept,'*/*');
});
test('ciphertext digest recorded, but not presented as uploaded or tokenized',()=>{
 const input={metadata:{title:'Song',artist:'Artist'},assets:{master:{name:'master.wav',size:4,hash:'a'.repeat(64),encryption:{sha256:'b'.repeat(64)}}},identity:{mode:'assisted',connected:false,address:''},royalties:{creatorBps:10000},training:'not-authorized',composition:false,storage:'ipfs-encrypted'};
 const p=makeRegistrationPacket(input);assert.equal(p.bricks[0].metadata.media[0].access.encryption,'AES-256-GCM / local-exported');assert.equal(p.storage.uploaded,false);assert.equal(p.storage.encrypted,false);assert.equal(p.storage.clientSideEncryptedAssets.length,1);
});
