import test from 'node:test';
import assert from 'node:assert/strict';
import {batchGasLimit,ETH_TRANSACTION_GAS_LIMIT} from '../src/batch-gas.js';
test('one-transaction estimates retain a conservative margin within both block and Sepolia caps',()=>{
 assert.equal(batchGasLimit(1000000n,30000000n,1337),1200000n);
 assert.equal(batchGasLimit(11n,100n,1337),14n);
 assert.throws(()=>batchGasLimit(100n,110n,1337),/not silently split/);
 assert.throws(()=>batchGasLimit(15000000n,60000000n,11155111),/gas budget/);
 assert.ok(batchGasLimit(13000000n,60000000n,11155111)<ETH_TRANSACTION_GAS_LIMIT);
 for(const value of [0n,-1n,1,'10'])assert.throws(()=>batchGasLimit(value,30000000n,1337));
});
