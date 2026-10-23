import test from 'node:test';import assert from 'node:assert/strict';
import {loadMintNetwork,saveMintNetwork,defaultMintNetwork} from '../src/mint-persistence.js';
const store=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};};
test('explicit terminal choice overrides old browser target once while retaining user factories and form preference',()=>{
 const s=store(),old={...defaultMintNetwork(),rememberForm:false,factories:{'sepolia:11155111':'0x'+'a'.repeat(40)}};saveMintNetwork(s,old);
 const selection={network:'sepolia',revision:'a'.repeat(24)};
 const next=loadMintNetwork(s,selection);assert.equal(next.network,'sepolia');assert.equal(next.rememberForm,false);assert.equal(next.factories['sepolia:11155111'],old.factories['sepolia:11155111']);
 saveMintNetwork(s,{...next,network:'ganache'});assert.equal(loadMintNetwork(s,selection).network,'ganache','Manual browser choice remains until terminal selection changes');
 assert.equal(loadMintNetwork(s,{...selection,revision:'b'.repeat(24)}).network,'sepolia');
});
test('returning to Ganache restores the managed RPC/default factory mode, never a public network',()=>{
 const s=store();saveMintNetwork(s,{...defaultMintNetwork(),network:'sepolia',rpcUrl:'http://127.0.0.1:9999',useStartupFactory:false});
 const next=loadMintNetwork(s,{network:'ganache',revision:'c'.repeat(24)});assert.equal(next.rpcUrl,'http://127.0.0.1:8545');assert.equal(next.useStartupFactory,true);
 assert.equal(loadMintNetwork(s,{network:'mainnet',revision:'d'.repeat(24)}).network,'ganache');
});
