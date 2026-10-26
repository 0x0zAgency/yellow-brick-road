'use strict';
/** Probe the same-origin browser route, not merely the upstream node. No writes. */
async function verifyReadRpc(origin,chainId,{fetchImpl=fetch}={}){
 let response;
 try{
  response=await fetchImpl(origin+'/road/rpc',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',Origin:origin},
   // Deliberately omit params, as real browser RPC clients do for eth_chainId.
   body:JSON.stringify({jsonrpc:'2.0',id:'ybr-readiness',method:'eth_chainId'})});
  if(!response.ok)throw Error('HTTP '+response.status);
  const json=await response.json();
  if(json.id!=='ybr-readiness'||json.error||json.result!=='0x'+Number(chainId).toString(16))throw Error('Unexpected chain');
 }catch{
  throw Error('Mint RPC gateway is unavailable, rejected the browser request, or returned another chain'+(response&&!response.ok?' (HTTP '+response.status+')':'')+'. Restart the matching Player and Explorer; no network fallback or mint was performed.');
 }
 return true;
}
module.exports={verifyReadRpc};
