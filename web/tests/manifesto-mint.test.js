import test from 'node:test';import assert from 'node:assert/strict';import {assetSlots,makeRegistrationPacket} from '../src/mint-model.js';
test('all six demo upload slots are unrestricted',()=>{assert.equal(assetSlots.length,6);assert.ok(assetSlots.every(s=>s.accept==='*/*'));});
test('ENS is an optional display identity, not the signing address',()=>{
 const packet=makeRegistrationPacket({metadata:{title:'Test',artist:'Artist'},assets:{master:{name:'odd.custom',hash:'a'.repeat(64),size:10}},identity:{mode:'external',connected:true,address:'0x'+'1'.repeat(40),ensName:'artist.eth'},royalties:{creatorBps:10000},training:'not-authorized',composition:false,storage:'ipfs-encrypted'});
 assert.equal(packet.account.address,'0x'+'1'.repeat(40));assert.equal(packet.account.ensName,'artist.eth');assert.equal(packet.bricks[0].metadata.media[0].name,'odd.custom');
});