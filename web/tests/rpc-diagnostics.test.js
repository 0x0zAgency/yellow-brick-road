import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rpcConnectionError} from '../src/rpc-diagnostics.js';
test('connection diagnostics explain HTTP failures without revealing URL, payload or secrets',()=>{
 for(const status of [400,401,403,429,502,503]){
  const error=rpcConnectionError({cause:{name:'HttpRequestError',status,message:'https://sepolia.infura.io/v3/PRIVATE_KEY request PRIVATE_PAYLOAD'}});
  assert.match(error.shortMessage,new RegExp('HTTP '+status));assert.doesNotMatch(error.message,/PRIVATE|infura\.io/);assert.match(error.message,/earlier transaction receipts/);
 }
 const offline=rpcConnectionError({name:'HttpRequestError'});assert.match(offline.message,/exact HTTP or HTTPS/);
 const revert=new Error('Contract validation failed');assert.equal(rpcConnectionError(revert),revert);
 const cycle={name:'HttpRequestError'};cycle.cause=cycle;assert.match(rpcConnectionError(cycle).message,/gateway/);
});
