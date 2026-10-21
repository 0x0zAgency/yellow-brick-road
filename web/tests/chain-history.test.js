import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyLocalChainHistory} from '../src/chain-history.js';
const H=c=>'0x'+c.repeat(64);
const block=(n,c,parent='0')=>({number:'0x'+n.toString(16),hash:H(c),parentHash:H(parent)});
const CURRENT=block(2,'a','1'),OLD=block(2,'b','2'),NEXT=block(3,'c','a');
function fixture({numbered=OLD,pending=CURRENT,byHash=CURRENT,rpcHook,walletHook}={}){
 const calls=[];
 const rpc=async args=>{
  calls.push(['rpc',args.method,args.params]);
  if(rpcHook){const result=await rpcHook(args,calls);if(result!==undefined)return result;}
  if(args.method==='eth_getBlockByNumber')return args.params[0]==='0x3'?NEXT:CURRENT;
  if(args.method==='eth_getBlockByHash')return CURRENT;
  throw Error('Unexpected RPC method');
 };
 const wallet=async args=>{
  calls.push(['wallet',args.method,args.params]);
  if(walletHook){const result=await walletHook(args,calls);if(result!==undefined)return result;}
  if(args.method==='eth_getBlockByNumber')return args.params[0]==='pending'?pending:numbered;
  if(args.method==='eth_getBlockByHash')return byHash;
  throw Error('Unexpected wallet method');
 };
 return {calls,options:{client:{request:rpc},provider:{request:wallet},rpcUrl:'http://127.0.0.1:8545',chainId:1337,retryDelayMs:0}};
}
async function rejected(config,reason){
 const f=fixture(config);
 await assert.rejects(verifyLocalChainHistory(f.options),e=>{
  assert.match(e.message,/blockchain histories/);assert.match(e.message,/127\.0\.0\.1:8545/);
  assert.equal(e.code,'YBR_CHAIN_HISTORY_MISMATCH');
  if(reason)assert.equal(e.details.reason,reason);
  return true;
 });
 assert.ok(f.calls.every(([,method])=>method.startsWith('eth_getBlock')));
}
test('matching numbered blocks preserve the normal fast path',async()=>{
 const f=fixture({numbered:CURRENT});
 assert.equal((await verifyLocalChainHistory(f.options)).mode,'numbered');assert.equal(f.calls.length,2);
});
test('stale numbered wallet cache recovers only with hash and fresh pending-head agreement',async()=>{
 const f=fixture();assert.equal((await verifyLocalChainHistory(f.options)).mode,'fresh-head');
 assert.ok(f.calls.some(([who,m,p])=>who==='wallet'&&m==='eth_getBlockByNumber'&&p[0]==='pending'));
});
test('a missing numbered block can recover through fresh verified reads',async()=>{
 const f=fixture({numbered:null});assert.equal((await verifyLocalChainHistory(f.options)).mode,'fresh-head');
});
test('a real pending block uses its mined canonical parent, not its null hash',async()=>{
 const f=fixture({pending:{number:'0x3',hash:null,parentHash:CURRENT.hash}});
 assert.equal((await verifyLocalChainHistory(f.options)).mode,'fresh-head');
});
test('pending blocks with null number can be anchored by a canonical parent',async()=>{
 const f=fixture({pending:{number:null,hash:null,parentHash:CURRENT.hash}});
 assert.equal((await verifyLocalChainHistory(f.options)).mode,'fresh-head');
});
test('mining another block between reads is allowed when both tips remain canonical',async()=>{
 const f=fixture({pending:NEXT});assert.equal((await verifyLocalChainHistory(f.options)).mode,'fresh-head');
});
test('a wallet on a different chain cannot recover without the reference hash',async()=>{
 await rejected({byHash:null},'wallet-missing-rpc-block');
});
test('knowing an old reference block is not enough when the current wallet fork differs',async()=>{
 await rejected({pending:block(3,'d','a')},'wallet-fresh-head-not-canonical-on-rpc');
});
test('hash-only equality with an incorrect block number is rejected',async()=>{
 await rejected({byHash:{...CURRENT,number:'0x1'}},'wallet-missing-rpc-block');
});
test('a shared ancestor behind the RPC tip does not establish current agreement',async()=>{
 await rejected({pending:block(1,'1')},'wallet-fresh-head-unavailable-or-behind');
});
test('missing, malformed, or zero pending hashes never bypass the history guard',async()=>{
 for(const pending of [null,{},block(2,'0'),{number:'0x2',hash:'not-a-hash'}])
  await rejected({pending},'wallet-fresh-head-unavailable-or-behind');
});
test('a pending child with the wrong number cannot use a valid parent to pass',async()=>{
 await rejected({pending:{number:'0x9',hash:null,parentHash:CURRENT.hash}},'wallet-fresh-head-unavailable-or-behind');
});
test('a pending parent returned under the wrong hash is rejected',async()=>{
 await rejected({pending:{number:'0x3',hash:null,parentHash:H('f')}},'wallet-fresh-head-unavailable-or-behind');
});
test('reorg/reset during verification is rejected, even after valid fresh wallet reads',async()=>{
 await rejected({rpcHook:async({method,params})=>method==='eth_getBlockByNumber'&&params[0]!=='latest'?OLD:undefined});
});
test('one bounded retry tolerates a transient missing wallet head',async()=>{
 let reads=0;
 const f=fixture({walletHook:async({method})=>method==='eth_getBlockByHash'&&reads++===0?null:undefined});
 assert.equal((await verifyLocalChainHistory(f.options)).mode,'fresh-head');
 assert.equal(reads,2);
});
test('unsupported recovery reads fail closed without exposing raw provider errors',async()=>{
 const f=fixture({walletHook:async({method})=>{if(method==='eth_getBlockByHash')throw Error('private-server-token');}});
 await assert.rejects(verifyLocalChainHistory(f.options),e=>e.code==='YBR_CHAIN_HISTORY_UNAVAILABLE'&&!e.message.includes('private-server-token'));
});
test('unresponsive reads time out instead of hanging minting indefinitely',async()=>{
 const f=fixture({walletHook:()=>new Promise(()=>{})});
 await assert.rejects(verifyLocalChainHistory({...f.options,timeoutMs:10}),e=>e.code==='YBR_CHAIN_HISTORY_UNAVAILABLE');
});
test('diagnostics identify the expected RPC, chain, height and both observed hashes',async()=>{
 const f=fixture({byHash:null});
 await assert.rejects(verifyLocalChainHistory({...f.options,rpcUrl:'http://127.0.0.1:8545/?token=do-not-print'}),e=>{
  assert.equal(e.details.blockNumber,'2');assert.equal(e.details.rpcHash,CURRENT.hash);assert.equal(e.details.walletHash,OLD.hash);
  assert.match(e.message,/chain 1337/);assert.match(e.message,/Clearing nonce data/);assert.doesNotMatch(e.message,/do-not-print/);return true;
 });
});
test('all recovery operations are reads; no signing, network changes, or mining',async()=>{
 const f=fixture();await verifyLocalChainHistory(f.options);
 assert.ok(f.calls.every(([,m])=>['eth_getBlockByNumber','eth_getBlockByHash'].includes(m)));
});
