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
