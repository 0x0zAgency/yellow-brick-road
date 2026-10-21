'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {normalizeAuthorization,validateGrant}=require('../player-policy');
const hash=n=>'0x'+n.repeat(64),address=n=>'0x'+n.repeat(40);
const source={brickAddress:address('a'),controller:address('b'),revision:'1'};
const state={enabled:true,registered:true,code:'0x6000',controller:address('b'),revision:1,permissions:7,files:[hash('1'),hash('2'),hash('3'),hash('4')]};
test('live grants are bound to controller, revision, role and exact selected bytes',()=>{
 const input={source,role:'audio',sha256:'2'.repeat(64),state};
 assert.equal(validateGrant(input),true);
 for(const change of [{permissions:0},{revision:2},{controller:address('c')},{registered:false},{enabled:false},{code:'0x'}])assert.equal(validateGrant({...input,state:{...state,...change}}),false);
 assert.equal(validateGrant({...input,sha256:'3'.repeat(64)}),false);
 assert.equal(validateGrant({...input,role:'master'}),false);
 assert.equal(validateGrant({...input,state:{...state,permissions:1},role:'artwork',sha256:'3'.repeat(64)}),false);
});
test('proof cannot request private roles, invalid revisions or an unbound chain',()=>{
 const proof={format:'ybr-player-onchain/v1',chainId:1337,factoryAddress:address('d'),genesisHash:hash('e'),sources:{audio:source}};
 assert.equal(normalizeAuthorization(proof).sources.audio.revision,'1');
 for(const bad of [{...proof,chainId:1},{...proof,genesisHash:''},{...proof,sources:{master:source}},{...proof,sources:{audio:{...source,revision:'0'}}},{...proof,sources:{audio:{...source,revision:'18446744073709551616'}}}])assert.throws(()=>normalizeAuthorization(bad));
});
