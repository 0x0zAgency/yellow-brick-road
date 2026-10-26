import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createPublicClient,http} from 'viem';
import gateway from '../../apps/ybr-player/road-rpc.js';
test('installed viem parameterless reads work through the actual read-only HTTP gateway',async t=>{
 const calls=[];
 const result={eth_chainId:'0x539',eth_blockNumber:'0x5',eth_gasPrice:'0x3b9aca00'};
 const server=createServer((req,res)=>void gateway.handleReadRpc(req,res,{rpc:async(method,params)=>{calls.push({method,params});assert.ok(Object.hasOwn(result,method));return result[method];}}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>{server.closeAllConnections();server.close();});
 const client=createPublicClient({transport:http('http://127.0.0.1:'+server.address().port+'/road/rpc',{retryCount:0})});
 assert.equal(await client.getChainId(),1337);assert.equal(await client.getBlockNumber(),5n);assert.equal(await client.getGasPrice(),1000000000n);
 assert.deepEqual(calls,[{method:'eth_chainId',params:[]},{method:'eth_blockNumber',params:[]},{method:'eth_gasPrice',params:[]}]);
});
