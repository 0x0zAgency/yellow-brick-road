/** Only server-verified on-chain records belong in the live registry view. */
import {ACTIVE_NETWORK} from './active-network.js';
const address=value=>/^0x[\da-f]{40}$/i.test(value||'');
const hash=value=>/^0x[\da-f]{64}$/i.test(value||'');
export function validateRegistry(data){
 if(data?.format!=='ybr-chain-registry/1'||data.network?.ready!==true||![1337,11155111].includes(data.network.chainId)||
  !address(data.network.factoryAddress)||!Array.isArray(data.bricks)||data.bricks.length>200||
  !hash(data.head?.hash)||!/^\d+$/.test(data.head?.number||''))throw Error('The Player did not return a verified local registry. Restart the updated development stack.');
 if(ACTIVE_NETWORK&&(data.network.chainId!==ACTIVE_NETWORK.chainId||data.network.factoryAddress.toLowerCase()!==ACTIVE_NETWORK.factoryAddress.toLowerCase()||data.network.genesisHash?.toLowerCase()!==ACTIVE_NETWORK.genesisHash.toLowerCase()))throw Error('Registry belongs to another network session. Reload the application; no local fallback is allowed.');
 const ids=new Set();
 for(const brick of data.bricks){
  const r=brick.registration;
  if(!['road','road-registry'].includes(brick.source)||!hash(brick.id)||!r||r.ipId!==brick.id||
   !address(r.brickAddress)||!address(r.originator)||!address(r.controller)||r.chainId!==data.network.chainId||
   r.factoryAddress?.toLowerCase()!==data.network.factoryAddress.toLowerCase()||
   !hash(r.contentHash)||!hash(r.metadataDigest)||!hash(r.transactionHash)||
   !/^\d+$/.test(r.blockNumber)||typeof brick.title!=='string'||typeof r.metadataURI!=='string'||
   typeof brick.streamAllowed!=='boolean'||brick.source==='road-registry'&&brick.streamAllowed||ids.has(brick.id.toLowerCase()))
   throw Error('Invalid registration data received. No demo records were substituted.');
  ids.add(brick.id.toLowerCase());
 }
 return data;
}
export async function fetchRegistry({fetchImpl=fetch,signal}={}){
 const response=await fetchImpl('/road/api/registry',{cache:'no-store',redirect:'error',signal});
 let data;
 try{data=await response.json();}catch{throw Error('Registry endpoint unavailable. Restart npm run dev after updating the Player.');}
 if(!response.ok)throw Error(typeof data?.error==='string'?data.error.slice(0,240):'Cannot read the local registry (HTTP '+response.status+').');
 return validateRegistry(data);
}
