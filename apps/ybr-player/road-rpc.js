'use strict';
/** Loopback-only read transport. Never forwards wallet/signing/admin methods. */
const METHODS=new Set(['eth_chainId','net_version','eth_blockNumber','eth_getBlockByNumber','eth_getBlockByHash','eth_getCode','eth_getBalance','eth_getTransactionCount','eth_getTransactionReceipt','eth_getTransactionByHash','eth_call','eth_estimateGas','eth_gasPrice','eth_maxPriorityFeePerGas','eth_feeHistory','eth_getLogs']);
const HOSTS=new Set(['localhost','127.0.0.1','[::1]']);
function localOrigin(value){try{const u=new URL(value);return u.protocol==='http:'&&HOSTS.has(u.hostname)&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash;}catch{return false;}}
function validRequest(item){return item?.jsonrpc==='2.0'&&METHODS.has(item.method)&&Array.isArray(item.params)&&item.params.length<=8&&((typeof item.id==='string'&&item.id.length<=80)||Number.isSafeInteger(item.id));}
async function handleReadRpc(req,res,road){
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 if(!localOrigin('http://'+req.headers.host)||(req.headers.origin&&!localOrigin(req.headers.origin))||req.headers['sec-fetch-site']==='cross-site')return send(403,{error:'Only local application origins may read the configured RPC.'});
 if(req.method!=='POST'||!req.headers['content-type']?.startsWith('application/json'))return send(405,{error:'Use a JSON POST for read-only RPC.'});
 if(typeof road.rpc!=='function')return send(503,{error:'The selected network RPC is unavailable.'});
 let bytes=0,chunks=[];
 for await(const chunk of req){bytes+=chunk.length;if(bytes>131072)return send(413,{error:'RPC request too large.'});chunks.push(chunk);}
 let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return send(400,{error:'Invalid RPC JSON.'});}
 const batch=Array.isArray(body)?body:[body];
 if(!batch.length||batch.length>20||batch.some(item=>!validRequest(item)))return send(400,{error:'Only bounded read/simulation RPC methods are supported. Signing and submission must use your wallet.'});
 const result=[];
 for(const item of batch){
  try{result.push({jsonrpc:'2.0',id:item.id,result:await road.rpc(item.method,item.params)});}
  catch{result.push({jsonrpc:'2.0',id:item.id,error:{code:-32000,message:'Selected-network RPC read failed. No alternate network was used.'}});}
 }
 const response=Array.isArray(body)?result:result[0];
 if(Buffer.byteLength(JSON.stringify(response))>4*1024*1024)return send(502,{error:'RPC response exceeded the local read limit.'});
 return send(200,response);
}
module.exports={handleReadRpc,validRequest,localOrigin};
