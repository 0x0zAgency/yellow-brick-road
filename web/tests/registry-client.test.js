import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRegistry,fetchRegistry} from '../src/registry-client.js';
const address='0x'+'1'.repeat(40),hash='0x'+'2'.repeat(64);
function fixture(){return {format:'ybr-chain-registry/1',network:{ready:true,chainId:1337,factoryAddress:address},head:{number:'10',hash},bricks:[{
 id:hash,title:'Registered Brick',source:'road-registry',streamAllowed:false,
 registration:{ipId:hash,brickAddress:address,originator:address,controller:address,chainId:1337,factoryAddress:address,
 contentHash:hash,metadataDigest:hash,transactionHash:hash,blockNumber:'9',metadataURI:'ipfs://ciphertext'}
}]};}
test('real registrations are accepted while simulated and malformed entries are rejected',()=>{
 const data=fixture();assert.equal(validateRegistry(data),data);
 for(const patch of [{source:'studio-demo'},{source:'demo'},{id:'simulated-1'},{streamAllowed:true},{registration:null}]){
  const bad=fixture();Object.assign(bad.bricks[0],patch);assert.throws(()=>validateRegistry(bad),/Invalid registration/);
 }
});
test('network/factory mismatch and duplicate identities cannot be displayed as the live registry',()=>{
 for(const change of [d=>d.network.chainId=1,d=>d.network.ready=false,d=>d.bricks.push(d.bricks[0]),d=>d.bricks[0].registration.factoryAddress='0x'+'3'.repeat(40)]){
  const data=fixture();change(data);assert.throws(()=>validateRegistry(data));
 }
});
test('registry fetch uses only the proxied read endpoint with no credentials or upload',async()=>{
 const controller=new AbortController();let calls=0;
 const data=await fetchRegistry({signal:controller.signal,fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,'/road/api/registry');assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');
  assert.equal(options.signal,controller.signal);assert.equal(options.body,undefined);return new Response(JSON.stringify(fixture()));
 }});
 assert.equal(calls,1);assert.equal(data.bricks.length,1);
});
test('old servers, offline chains and invalid JSON produce errors rather than fake empty success',async()=>{
 for(const response of [new Response('<html/>'),new Response('{}'),new Response(JSON.stringify({error:'Ganache offline'}),{status:503})])
  await assert.rejects(fetchRegistry({fetchImpl:async()=>response}));
});
