import test from 'node:test';
import assert from 'node:assert/strict';
import {IP_CATEGORIES,SPATIAL_FIELDS,getIpCategory,groupedIpCategories,spatialEvidence} from '../src/ip-catalog.js';
import {makeRegistrationPacket} from '../src/mint-model.js';
import {initialPolicyFor} from '../src/content-policy.js';
const base={metadata:{artist:'Original claimant',title:'My work'},assets:{master:{name:'original.spatial',hash:'a'.repeat(64),size:10,type:'application/octet-stream'}},identity:{mode:'assisted',connected:false,address:''},royalties:{creatorBps:10000},training:'separate-license',composition:true,storage:'demo-encrypted-in-browser'};
test('category IDs are unique and extend far beyond music',()=>{
 assert.equal(IP_CATEGORIES.length,35);
 assert.equal(new Set(IP_CATEGORIES.map(x=>x.id)).size,IP_CATEGORIES.length);
 assert.ok(groupedIpCategories().length>=8);
 for(const id of ['sound-recording','musical-work','literary-work','choreography','dance-move','gesture','motion-capture','photograph','software-code','three-d-model','game-content'])assert.equal(getIpCategory(id).id,id);
});
test('movement captures retain claimed dates, never claim verification',()=>{
 assert.match(getIpCategory('dance-move').notice,/not automatically protected/);
 assert.ok(SPATIAL_FIELDS.find(x=>x.id==='claimedCaptureAt'));
 const packet=makeRegistrationPacket({...base,metadata:{...base.metadata,ipCategory:'dance-move',spatial:{claimedCaptureAt:'2026-10-12T12:00:00-05:00',captureFormat:'BVH',attestationUri:'https://example.org/attestation'}}});
 assert.equal(packet.bricks.length,1);
 assert.equal(packet.bricks[0].metadata.objectType,'movement-evidence');
 assert.equal(packet.bricks[0].metadata.evidence.claimsNotVerified,true);
 assert.equal(packet.bricks[0].metadata.evidence.claimedCaptureAt,'2026-10-12T12:00:00-05:00');
 assert.equal(packet.bricks[0].metadata.evidence.sourceMedia[0].digest,'0x'+'a'.repeat(64));
 assert.equal(packet.bricks[0].metadata.music,undefined);
});
test('songwriting is separate by default for recordings but not standalone writing',()=>{
 const song=makeRegistrationPacket({...base,metadata:{...base.metadata,ipCategory:'sound-recording'}});
 assert.ok(song.bricks.find(x=>x.localId==='composition'));
 const writing=makeRegistrationPacket({...base,metadata:{...base.metadata,ipCategory:'literary-work'}});
 assert.equal(writing.bricks.length,1);
 assert.equal(writing.bricks[0].metadata.objectType,'literary-work');
 const score=makeRegistrationPacket({...base,metadata:{...base.metadata,ipCategory:'musical-work',songwriters:'Writer 1, Writer 2'}});
 assert.equal(score.bricks.length,1);
 assert.deepEqual(score.bricks[0].metadata.creators.map(x=>x.name),['Writer 1','Writer 2']);
});
test('unknown categories fall back to the default instead of inventing a legal taxonomy',()=>{
 assert.equal(getIpCategory('unknown').id,'sound-recording');
 const result=spatialEvidence({frameRate:'60',claimedFirstPerformedAt:'2026-01-01',secretField:'not accepted'},'2026-10-16T12:00:00Z');
 assert.equal(result.claimsNotVerified,true);
 assert.equal(result.secretField,undefined);
 assert.equal(result.frameRate,'60');
});
test('image and graphic registrations retain file locking without inheriting music Player grants',async()=>{
 for(const ipCategory of ['photograph','illustration','painting','digital-art','brand-identity','interface-design']){
  const packet=makeRegistrationPacket({...base,metadata:{...base.metadata,ipCategory},assets:{master:{name:'original.png',hash:'b'.repeat(64),size:10,type:'image/png'}},contentPolicy:{locked:true,preview:true,artwork:true,lyrics:true}});
  assert.equal(packet.bricks.length,1,ipCategory);
  const metadata=packet.bricks[0].metadata,policy=await initialPolicyFor(metadata);
  assert.equal(metadata.music,undefined,ipCategory);
  assert.equal(policy.permissions,0,ipCategory);
  assert.equal(policy.locked,true,ipCategory);
  assert.equal(metadata.media.length,1,ipCategory);
 }
});
