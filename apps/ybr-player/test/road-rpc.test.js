'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {handleReadRpc}=require('../road-rpc');
test('selected-chain read proxy rejects signing, foreign origins and mixed unsafe batches without forwarding',async t=>{
 const calls=[];const server=http.createServer((req,res)=>void handleReadRpc(req,res,{rpc:async(method,params)=>{calls.push([method,params]);return '0xaa36a7';}}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());const url='http://127.0.0.1:'+server.address().port+'/road/rpc';
 const body=method=>({jsonrpc:'2.0',id:1,method,params:[]});
 const post=(data,headers={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
 assert.equal((await post(body('eth_sendRawTransaction'))).status,400);assert.equal(calls.length,0);
 assert.equal((await post([body('eth_chainId'),body('personal_unlockAccount')])).status,400);assert.equal(calls.length,0);
 assert.equal((await post(body('eth_chainId'),{Origin:'https://foreign.invalid'})).status,403);
 const ok=await post(body('eth_chainId'),{Origin:'http://127.0.0.1:5173'});assert.equal((await ok.json()).result,'0xaa36a7');assert.equal(ok.headers.get('access-control-allow-origin'),null);assert.equal(calls.length,1);
});
test('real HTTP accepts omitted params without widening the RPC allowlist',async t=>{
 const calls=[];const server=http.createServer((req,res)=>void handleReadRpc(req,res,{rpc:async(method,params)=>{calls.push([method,params]);return '0x539';}}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());const url='http://127.0.0.1:'+server.address().port+'/road/rpc';
 const post=data=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 for(const method of ['eth_chainId','eth_blockNumber','eth_gasPrice','eth_maxPriorityFeePerGas','net_version']){
  const response=await post({jsonrpc:'2.0',id:method,method});assert.equal(response.status,200);assert.equal((await response.json()).result,'0x539');assert.deepEqual(calls.at(-1),[method,[]]);
 }
 const before=calls.length;
 for(const params of [null,{},'bad',1,Array(9).fill(0)])assert.equal((await post({jsonrpc:'2.0',id:1,method:'eth_chainId',params})).status,400);
 for(const method of ['eth_sendTransaction','eth_sendRawTransaction','eth_sign','personal_sign','wallet_switchEthereumChain','debug_traceTransaction'])assert.equal((await post({jsonrpc:'2.0',id:1,method})).status,400);
 assert.equal(calls.length,before);
 assert.equal((await post([{jsonrpc:'2.0',id:1,method:'eth_chainId'},{jsonrpc:'2.0',id:2,method:'eth_getCode',params:['0x'+'1'.repeat(40),'latest']}])).status,200);
 assert.deepEqual(calls.at(-1)[1],['0x'+'1'.repeat(40),'latest']);
});
