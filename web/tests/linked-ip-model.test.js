import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRegistrationPacket,validateMintInput,availableAssetSlots} from '../src/mint-model.js';
const wallet='0x'+'1'.repeat(40),artistWallet='0x'+'2'.repeat(40),factory='0x'+'3'.repeat(40);
const core={
 metadata:{ipCategory:'sound-recording',artist:'Recording Artist',title:'My Track',songwriters:'Recording Artist'},
 assets:{master:{name:'master.wav',hash:'a'.repeat(64),size:1234,type:'audio/wav'}},
 identity:{mode:'external',connected:true,address:wallet},royalties:{creatorBps:10000},
 training:'separate-license',composition:true,storage:'demo-encrypted-in-browser'
};
test('cover artwork is its own separately attributed visual Brick',()=>{
 const input={...core,assets:{...core.assets,artwork:{name:'cover.png',hash:'b'.repeat(64),size:2222,type:'image/png'}},
 cover:{artist:'Visual Artist',wallet,ipCategory:'illustration',title:'Galaxy in Purple',description:'Original painting'}};
 assert.deepEqual(validateMintInput(input),[]);
 const packet=makeRegistrationPacket(input),visual=packet.bricks.find(b=>b.localId==='artwork');
 assert.equal(visual.metadata.title,'Galaxy in Purple');
 assert.equal(visual.metadata.creators[0].name,'Visual Artist');
 assert.equal(visual.metadata.creators[0].wallet,wallet);
 assert.equal(visual.metadata.description,'Original painting');
 assert.equal(visual.metadata.ipCategory,'illustration');
 assert.equal(visual.metadata.payout.type,'rights-holder-split-pending');
 assert.equal(packet.bricks[0].metadata.media.some(m=>m.role==='artwork'),false);
});
test('recording artist is also the cover artist by default without extra fields',()=>{
 const input={...core,assets:{...core.assets,artwork:{name:'my-own-cover.png',hash:'b'.repeat(64),size:321,type:'image/png'}},
  cover:{useMainArtist:true,artist:'',wallet:'',title:'',description:'',ipCategory:'illustration'}};
 assert.deepEqual(validateMintInput(input),[]);
 const artwork=makeRegistrationPacket(input).bricks.find(b=>b.localId==='artwork');
 assert.equal(artwork.metadata.creators[0].name,'Recording Artist');
 assert.equal(artwork.metadata.creators[0].wallet,wallet);
 assert.equal(artwork.metadata.title,'My Track — cover art');
});
test('cover-artist collaborator fields are checked only when explicitly selected',()=>{
 const selected={...core,assets:{...core.assets,artwork:{name:'cover.png',hash:'b'.repeat(64),size:42}},
  cover:{useMainArtist:false,artist:'Outside Artist',wallet:artistWallet,ipCategory:'illustration'}};
 assert.match(validateMintInput(selected).join(' '),/its artist wallet/);
 const own={...selected,cover:{...selected.cover,useMainArtist:true}};
 assert.deepEqual(validateMintInput(own),[]);
 const artwork=makeRegistrationPacket(own).bricks.find(b=>b.localId==='artwork');
 assert.equal(artwork.metadata.creators[0].name,'Recording Artist');
 assert.equal(artwork.metadata.creators[0].wallet,wallet);
});
test('cannot mint someone else’s uploaded cover from the recording artist wallet',()=>{
 const inData={...core,assets:{...core.assets,artwork:{name:'cover.jpg',hash:'b'.repeat(64),size:123}},
 cover:{artist:'Other creator',wallet:artistWallet,title:'External art'}};
 assert.match(validateMintInput(inData).join(' '),/its artist wallet/);
});
test('existing owner-controlled cover and composition are references, not duplicated Bricks',()=>{
 const links=[{id:'cover',relation:'cover-art',targetBrick:artistWallet,factory,scope:'Release cover only'},
 {id:'composer',relation:'embodies-composition',targetBrick:wallet,factory,scope:'One recording only'}];
 const input={...core,linkedBricks:links};
 assert.deepEqual(validateMintInput(input),[]);
 const packet=makeRegistrationPacket(input);
 assert.equal(packet.bricks.length,1);
 assert.deepEqual(packet.bricks[0].metadata.relationships.map(l=>l.type),['cover-art','embodies-composition']);
 assert.equal(packet.bricks[0].metadata.relationships[0].authorization,'pending-current-controller-signature');
 assert.equal(packet.linkAuthorizations[0].response,null);
});
test('lyrics evidence is attached through a separate songwriting/lyrics Brick, not the recording upload flow',()=>{
 const input={...core,metadata:{...core.metadata,ipCategory:'musical-work'},assets:{...core.assets,lyrics:{name:'lyrics.txt',hash:'c'.repeat(64),size:300,type:'text/plain'}}};
 const packet=makeRegistrationPacket(input);
 assert.equal(packet.bricks[0].metadata.objectType,'musical-work');
 assert.equal(packet.bricks[0].metadata.media.find(m=>m.role==='lyrics').name,'lyrics.txt');
 assert.equal(packet.bricks.find(b=>b.localId==='composition'),undefined);
 assert.ok(availableAssetSlots('musical-work').some(slot=>slot.id==='lyrics'));
 assert.ok(!availableAssetSlots('sound-recording').some(slot=>slot.id==='lyrics'));
});
test('a hidden stale lyrics attachment does not prevent linking an existing composition Brick',()=>{
 const link={id:'writer',relation:'embodies-composition',targetBrick:artistWallet,factory,scope:'Recording use'};
 const input={...core,assets:{...core.assets,lyrics:{name:'lyrics.txt',hash:'c'.repeat(64),size:300}},linkedBricks:[link]};
 assert.deepEqual(validateMintInput(input),[]);
 assert.equal(makeRegistrationPacket(input).bricks[0].metadata.media.some(m=>m.role==='lyrics'),false);
});
test('different credited writers must link their composition rather than having their work minted by recording wallet',()=>{
 const errors=validateMintInput({...core,metadata:{...core.metadata,songwriters:'Another Writer'}});
 assert.match(errors.join(' '),/Link their composition Brick/);
});
