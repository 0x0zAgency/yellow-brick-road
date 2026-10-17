/** CI integration: EIP-1193-like RPC client, actual Ganache-funded test account and factory.
 * This DOES NOT exercise a human's MetaMask confirmation dialog. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {mintPacketOnChain} from '../src/road-chain.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const deployed=JSON.parse(await readFile(new URL('../../.road-local/ganache-mint-receipts.json',import.meta.url),'utf8'));
const endpoint='http://127.0.0.1:8545';
let requests=0,sendRequests=0;
const provider={async request({method,params=[]}){
 requests++;if(method==='eth_sendTransaction')sendRequests++;
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requests,method,params})});
 if(!response.ok)throw Error('RPC status '+response.status);
 const data=await response.json();
 if(data.error)throw Error(data.error.message);
 return data.result;
}};
const account=(await provider.request({method:'eth_accounts'}))[0];
assert.ok(account,'Ganache must supply an unlocked account');
const packet={packetType:'LOCAL_PREVIEW_NOT_MINTED',bricks:[
 {localId:'master',role:'Audio recording',metadata:{title:'On-chain EIP-1193 recording',media:[{role:'master',integrity:{digest:'0x'+'7'.repeat(64)}}]}},
 {localId:'writing',role:'Songwriting',metadata:{title:'On-chain EIP-1193 composition',media:[]}},
]};
const progress=[];
const result=await mintPacketOnChain({packet,provider,account,mode:'ganache',factoryAddress:deployed.factoryAddress,onProgress:v=>progress.push(v.phase)});
assert.equal(result.simulated,false);
assert.equal(result.receipts.length,2);
assert.equal(sendRequests,2,'Each Brick must actually send an Ethereum transaction');
assert.deepEqual(progress,['signing','confirming','confirmed','signing','confirming','confirmed']);
for(const item of result.receipts){
 assert.match(item.transactionHash,/^0x[0-9a-f]{64}$/i);
 const code=await provider.request({method:'eth_getCode',params:[item.contractAddress,'latest']});
 assert.ok(code&&code!=='0x','Actual Brick contract bytecode required');
}
console.log(JSON.stringify({test:'wallet EIP-1193 → Ganache → real on-chain factory',chainId:result.chainId,contracts:result.receipts.map(r=>r.contractAddress),transactions:result.receipts.map(r=>r.transactionHash),sendRequests},null,2));
