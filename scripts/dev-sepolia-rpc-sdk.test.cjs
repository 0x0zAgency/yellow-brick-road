'use strict';
/** Installed SDK contract check only. Resolves URLs; no public RPC calls or funds. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {ethers}=require('ethers');
const {resolveSepoliaRpc}=require('./dev-sepolia-rpc.cjs');
test('installed ethers supplies a complete Sepolia Infura endpoint without user input',()=>{
 const url=new URL(resolveSepoliaRpc({env:{},ethersImpl:ethers}));
 assert.equal(url.origin,'https://sepolia.infura.io');assert.match(url.pathname,/^\/v3\/[a-f0-9]{32}$/i);
 assert.equal(url.search,'');assert.equal(url.username,'');
 const key='f'.repeat(32);assert.equal(resolveSepoliaRpc({env:{INFURA_API_KEY:key},ethersImpl:ethers}),'https://sepolia.infura.io/v3/'+key);
});
