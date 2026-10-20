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
test('optional lyrics file travels with songwriter Brick rather than master',()=>{
 const input={...core,assets:{...core.assets,lyrics:{name:'lyrics.txt',hash:'c'.repeat(64),size:300,type:'text/plain'}}};
 const packet=makeRegistrationPacket(input);
 assert.equal(packet.bricks[0].metadata.media.some(m=>m.role==='lyrics'),false);
 const composition=packet.bricks.find(b=>b.localId==='composition');
 assert.equal(composition.metadata.media[0].role,'lyrics');
 assert.ok(availableAssetSlots('sound-recording').some(s=>s.id==='lyrics'));
});
test('lyric attachment cannot be mixed with another creator’s signed composition reference',()=>{
 const link={id:'writer',relation:'embodies-composition',targetBrick:artistWallet,factory,scope:'Recording use'};
 const input={...core,assets:{...core.assets,lyrics:{name:'lyrics.txt',hash:'c'.repeat(64),size:300}},linkedBricks:[link]};
 assert.match(validateMintInput(input).join(' '),/Remove the local lyrics attachment/);
});
test('different credited writers must link their composition rather than having their work minted by recording wallet',()=>{
 const errors=validateMintInput({...core,metadata:{...core.metadata,songwriters:'Another Writer'}});
 assert.match(errors.join(' '),/Link their composition Brick/);
});
