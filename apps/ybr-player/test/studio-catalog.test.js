'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {describeSavedUpload,newestSavedUploads}=require('../studio-catalog');
const {createPlayerPolicyReader}=require('../player-policy');
const address='0x'+'1'.repeat(40),genesisHash='0x'+'2'.repeat(64);
const authorization={format:'ybr-player-onchain/v1',chainId:1337,factoryAddress:address,genesisHash,sources:{audio:{brickAddress:address,controller:address,revision:'1'}}};
const record={id:'STUDIO-'+'a'.repeat(64),title:'Newest work',creator:'Creator',publishedAt:'2026-01-02T00:00:00Z',authorization,
 assets:{audio:{url:'/media/private',base64:'DO_NOT_EXPOSE'}},mediaPath:'/private/path',key:'DO_NOT_EXPOSE'};
test('blocked saved uploads expose only descriptive metadata and original chain reference',()=>{
 const summary=describeSavedUpload(record,{allowed:false,reason:'different-chain'});
 assert.equal(summary.available,false);assert.equal(summary.reason,'different-chain');assert.match(summary.message,/original test mnemonic/);
 assert.deepEqual(summary.chain,{chainId:1337,factoryAddress:address,genesisHash});
 for(const text of ['DO_NOT_EXPOSE','/media/private','/private/path','sources'])assert.ok(!JSON.stringify(summary).includes(text));
});
test('saved inventory sorts by publication time and never promotes blocked metadata to streaming',()=>{
 const blocked=describeSavedUpload(record,{allowed:false,reason:'permission-changed'}),old={...blocked,id:'older',publishedAt:'2025-01-01'};
 assert.deepEqual(newestSavedUploads([old,blocked]).map(x=>x.id),[record.id,'older']);assert.equal(blocked.streamAllowed,undefined);
 assert.equal(describeSavedUpload(record,{allowed:true}).available,true);
 assert.equal(describeSavedUpload(record,{allowed:false,reason:'untrusted raw error'}).reason,'unavailable');
});
test('chain history wins over coincidentally equal factory addresses',async()=>{
 const provider={getNetwork:async()=>({chainId:1337}),getBlock:async n=>({number:0,hash:n===0?'0x'+'3'.repeat(64):genesisHash})};
 const reader=createPlayerPolicyReader({provider,factoryAddress:address,ethers:{Contract(){throw Error('Wrong chain must fail before contract reads');}}});
 assert.deepEqual(await reader.check(record),{allowed:false,onChain:true,reason:'different-chain'});
});
test('same-chain wrong factory, legacy uploads and RPC outages have distinct safe explanations',async()=>{
 const provider={getNetwork:async()=>({chainId:1337}),getBlock:async()=>({number:0,hash:genesisHash})};
 const reader=createPlayerPolicyReader({provider,factoryAddress:'0x'+'3'.repeat(40),ethers:{}});
 assert.equal((await reader.check(record)).reason,'different-factory');
 assert.equal((await reader.check({references:[{address}]})).reason,'legacy-permission');
 assert.equal((await reader.check({references:[]})).allowed,true);
 provider.getNetwork=async()=>{throw Error('private provider error');};
 assert.equal((await reader.check(record)).reason,'verification-unavailable');
});
