import test from 'node:test';
import assert from 'node:assert/strict';
import {addContentPolicy,initialPolicyFor,policyFileManifest,DEFAULT_CONTENT_POLICY,ZERO_HASH} from '../src/content-policy.js';
const file=(role,letter)=>({role,byteLength:9,integrity:{algorithm:'sha2-256',digest:'0x'+letter.repeat(64)}});
const bricks=[{localId:'master',metadata:{media:[file('master','a'),file('preview','b'),file('project','c')]}},{localId:'artwork',metadata:{media:[file('artwork','d')]}},{localId:'composition',metadata:{media:[file('lyrics','e')]}}];
test('default permissions are split by the actual owning Brick, never master/project access',async()=>{
 const result=addContentPolicy(bricks,DEFAULT_CONTENT_POLICY);
 const policies=await Promise.all(result.map(b=>initialPolicyFor(b.metadata)));
 assert.deepEqual(policies.map(p=>p.permissions),[1,2,4]);
 assert.equal(policies[0].files.previewHash,'0x'+'b'.repeat(64));
 assert.equal(policies[1].files.previewHash,ZERO_HASH);assert.equal(policies[0].locked,false);
 assert.deepEqual(bricks[0].metadata.rights,undefined,'No mutation of reviewed model objects.');
});
test('explicit opt-out and content lock persist in the committed mint proposal',async()=>{
 const policy=await initialPolicyFor(addContentPolicy(bricks,{preview:false,artwork:false,lyrics:false,locked:true})[0].metadata);
 assert.equal(policy.permissions,0);assert.equal(policy.locked,true);
});
test('manifest is storage-location/name independent but binds every role, byte count and content hash',async()=>{
 const one=addContentPolicy(bricks,DEFAULT_CONTENT_POLICY)[0].metadata;
 const renamed=structuredClone(one);renamed.media[0].name='renamed';renamed.media[0].cid='new-location';
 assert.deepEqual(await initialPolicyFor(one),await initialPolicyFor(renamed));
 const changed=structuredClone(one);changed.media[1].byteLength++;
 await assert.rejects(initialPolicyFor(changed),/changed after policy review/);
});
test('rejects duplicate roles, invalid hashes, unreviewed booleans, and nonexistent grants',async()=>{
 assert.throws(()=>policyFileManifest([file('preview','a'),file('preview','b')]),/unique/);
 assert.throws(()=>policyFileManifest([{...file('preview','a'),integrity:{algorithm:'sha1',digest:'0x'+'a'.repeat(64)}}]),/SHA-256/);
 assert.throws(()=>addContentPolicy(bricks,{...DEFAULT_CONTENT_POLICY,locked:'yes'}),/Review all/);
 const metadata=addContentPolicy(bricks,DEFAULT_CONTENT_POLICY)[1].metadata;metadata.rights.player.permissions.preview=true;
 await assert.rejects(initialPolicyFor(metadata),/matching uploaded file/);
});
