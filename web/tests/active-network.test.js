import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseActiveNetwork} from '../src/active-network.js';
const env={VITE_ROAD_ACTIVE_NETWORK:'sepolia',VITE_ROAD_ACTIVE_CHAIN_ID:'11155111',VITE_ROAD_ACTIVE_FACTORY:'0x'+'a'.repeat(40),VITE_ROAD_ACTIVE_GENESIS_HASH:'0x'+'b'.repeat(64),VITE_ROAD_ACTIVE_DEPLOYMENT_BLOCK:'123'};
test('active network identity is explicit and contains no provider or wallet secrets',()=>{
 assert.equal(parseActiveNetwork({}),null);const active=parseActiveNetwork({...env,SEPOLIA_PRIVATE_KEY:'never-export',SEPOLIA_RPC_URL:'https://secret.invalid'});assert.equal(active.chainId,11155111);assert.equal(active.deploymentBlock,123);assert.equal(Object.isFrozen(active),true);assert.ok(!JSON.stringify(active).includes('secret'));assert.equal(active.rpcUrl,undefined);
 for(const changed of [{VITE_ROAD_ACTIVE_CHAIN_ID:'1337'},{VITE_ROAD_ACTIVE_FACTORY:''},{VITE_ROAD_ACTIVE_GENESIS_HASH:''},{VITE_ROAD_ACTIVE_DEPLOYMENT_BLOCK:'-1'},{VITE_ROAD_ACTIVE_NETWORK:'mainnet'}])assert.throws(()=>parseActiveNetwork({...env,...changed}));
});
