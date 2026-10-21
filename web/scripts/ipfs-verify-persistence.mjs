/** Persistence check: recover a prior smoke fixture after Kubo restarts.
 * Exercises the same bounded ciphertext endpoint and decryption used by the UI.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseRecoveryFile,recoverIpfsEntry,assetsFromRecoveredMetadata} from '../src/ipfs-recovery.js';
import {SAMPLE_KEY,SAMPLE_BYTES,bridgeFetch} from './ipfs-smoke-fixture.mjs';
const receipt=JSON.parse(await readFile('.road-local/ipfs-smoke-receipt.json','utf8'));
assert.equal(receipt.syntheticFixture,true,'Run the current synthetic IPFS smoke fixture first.');
const kit=parseRecoveryFile(JSON.stringify({...receipt,key:SAMPLE_KEY}));
const metadata=await recoverIpfsEntry({entry:kit.metadata[0],key:kit.key,fetchImpl:bridgeFetch});
const entries=assetsFromRecoveredMetadata(JSON.parse(new TextDecoder().decode(metadata.bytes)));
const recovered=await recoverIpfsEntry({entry:entries[0],key:kit.key,fetchImpl:bridgeFetch});
assert.deepEqual(recovered.bytes,SAMPLE_BYTES,'The original must recover exactly after the node restart');
assert.equal(recovered.verification.ciphertext,true);assert.equal(recovered.verification.plaintext,true);
console.log(JSON.stringify({status:'pinned-and-recovered-after-restart',cid:receipt.cid,originalBytes:recovered.bytes.length,metadataCid:kit.metadata[0].cid}));
