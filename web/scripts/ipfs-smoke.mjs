import {writeFile,mkdir} from 'node:fs/promises';
/** Real integration smoke against a running YBR upload bridge + local Kubo.
 * Never sends plaintext to IPFS, and never prints the decryption secret.
 */
import {webcrypto} from 'node:crypto';
import assert from 'node:assert/strict';
import {encryptAsset} from '../src/road-encryption.js';
import {validateUploadReceipt} from '../src/ipfs-upload.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const origin='http://127.0.0.1:5173';
const base='http://127.0.0.1:8791';
const health=await fetch(base+'/api/road-ipfs/health',{headers:{Origin:origin}});
assert.equal(health.status,200,'Kubo must be running and bridge must be started');
const node=await health.json();assert.equal(node.ok,true);
const enc=await encryptAsset(new TextEncoder().encode('Private YBR integration sample. Not an original publication.'),
 'local integration test passphrase - do not reuse',{name:'encrypted-work',mime:'application/octet-stream'});
const result=await fetch(base+'/api/road-ipfs/upload',{method:'POST',headers:{
 Origin:origin,'Content-Type':'application/octet-stream','X-Road-Encryption':'roadenc-v1'
},body:enc.bytes});
if(!result.ok)throw Error('IPFS smoke upload failed: '+result.status+' '+await result.text());
const uploaded=validateUploadReceipt(await result.json(),enc.sha256,enc.bytes.length);
assert.equal(uploaded.pinned,true);assert.equal(uploaded.verified,true);
await mkdir('.road-local',{recursive:true});
await writeFile('.road-local/ipfs-smoke-receipt.json',JSON.stringify({cid:uploaded.cid,sha256:uploaded.sha256,size:uploaded.size},null,2)+'\n');
process.stdout.write(JSON.stringify({status:'verified-and-pinned',cid:uploaded.cid,encryptedBytes:uploaded.size,kuboPeerId:node.peerId})+'\n');
