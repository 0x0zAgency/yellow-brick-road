import test from 'node:test';
import assert from 'node:assert/strict';
import {availableAssetSlots,makeRegistrationPacket,validateMintInput} from '../src/mint-model.js';

const ids=category=>availableAssetSlots(category).map(s=>s.id);
const base={
 metadata:{title:'Evidence of a dance',artist:'Dancer',ipCategory:'dance-move'},
 assets:{master:{name:'dance.bvh',hash:'a'.repeat(64),size:4242,type:'application/octet-stream'}},
 identity:{mode:'assisted',connected:false,address:''},
 royalties:{creatorBps:10000},training:'separate-license',composition:true,storage:'demo-encrypted-in-browser'
};

test('Music recordings have optional preview and cover art; only master is required',()=>{
 for(const category of ['sound-recording','sound-design','musical-performance','musical-work','song-lyrics'])assert.deepEqual(ids(category),['master','preview','artwork','lyrics','project','metadata']);
 assert.ok(availableAssetSlots('sound-recording').filter(s=>s.required).every(s=>s.id==='master'));
 assert.deepEqual(validateMintInput({...base,metadata:{...base.metadata,ipCategory:'sound-recording'}}),[]);
});

test('Non-music categories do not expose audio preview or cover artwork',()=>{
 for(const category of ['dance-move','choreography','motion-capture','photograph','literary-work','software-code','three-d-model']){
  assert.deepEqual(ids(category),['master','project','metadata'],category);
  assert.deepEqual(availableAssetSlots(category).filter(s=>s.required).map(s=>s.id),['master']);
 }
});

test('Hidden music assets never leak into a non-music packet or create an extra artwork Brick',()=>{
 const extras={
  preview:{name:'old-music-preview.mp3',hash:'b'.repeat(64),size:100,type:'audio/mpeg'},
  artwork:{name:'old-cover.png',hash:'c'.repeat(64),size:80,type:'image/png',demoUpload:{receiptId:'DEMO-ART'}},
  project:{name:'source.bvh',hash:'d'.repeat(64),size:20,type:'application/octet-stream'}
 };
 const input={...base,assets:{...base.assets,...extras}};
 const packet=makeRegistrationPacket(input);
 assert.equal(packet.bricks.length,1);
 assert.deepEqual(packet.bricks[0].metadata.media.map(m=>m.role),['master','project']);
 assert.equal(packet.bricks[0].metadata.relationships.some(r=>r.type==='cover-art'),false);
 assert.deepEqual(packet.storage.demoUploadReceipts,[]);
});

test('Generic required file language and no music-only validation for non-music',()=>{
 assert.deepEqual(validateMintInput(base),[]);
 const missing={...base,assets:{}};
 assert.match(validateMintInput(missing).join(' '),/primary work file/);
 assert.doesNotMatch(validateMintInput(missing).join(' '),/audio file|track title/i);
});
