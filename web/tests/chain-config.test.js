import test from 'node:test';
import assert from 'node:assert/strict';
import {localConfig,connectChain,mintMode} from '../src/chain-mint.js';
test('chain IDs are explicit, positive integers; only loopback RPC is accepted',()=>{
 assert.equal(localConfig('http://127.0.0.1:8545',1337).id,1337);
 assert.equal(localConfig('http://localhost:7545',5777).id,5777);
 for(const url of ['https://sepolia.example','file:///tmp/rpc','http://user:pass@localhost:8545'])assert.throws(()=>localConfig(url,1337));
 for(const id of [0,-1,'abc',1.5])assert.throws(()=>localConfig('http://localhost:8545',id));
});
test('missing wallet fails before connecting or sending',async()=>{
 await assert.rejects(connectChain({rpcUrl:'http://localhost:8545',chainId:1337}),/wallet/);
});

test('wallet connection determines simulation versus real minting',()=>{
 assert.equal(mintMode(null,'ganache'),'simulated');
 assert.equal(mintMode(null,'sepolia'),'simulated');
 assert.equal(mintMode('0x'+'12'.repeat(20),'ganache'),'ganache');
 assert.equal(mintMode('0x'+'12'.repeat(20),'sepolia'),'sepolia');
 assert.throws(()=>mintMode('0x'+'12'.repeat(20),'mainnet'));
});
test('Sepolia rejects other wallet chains before any signature request',async()=>{
 let sends=0;
 const provider={request:async({method})=>{if(method==='eth_chainId')return '0x1';sends++;throw Error(method)}};
 await assert.rejects(connectChain({provider,network:'sepolia',account:'0x'+'12'.repeat(20)}),/chain ID/);
 assert.equal(sends,0);
});
