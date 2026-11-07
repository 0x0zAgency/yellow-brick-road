import {openBrickMetadata} from './brick-editor.js';
import {bindingKey,listRecoveryFiles,recoveryWallet,saveRecoveryFile} from './recovery-vault.js';
import {buildRecoveryFile} from './ipfs-recovery.js';
export function rankRecoveryFiles(records,wallet,review){
 wallet=recoveryWallet(wallet);const cid=review.metadataURI?.slice(7),identity=bindingKey(review);
 const rank=r=>r.bindings?.some(b=>bindingKey(b)===identity)?3:r.kit.metadata.some(m=>m.cid===cid)?2:1;
 const sorted=records.filter(r=>r.wallet===wallet).sort((a,b)=>rank(b)-rank(a)||(b.updatedAt||0)-(a.updatedAt||0));
 // A batch may have several snapshots using the same key. Try its best match once.
 const seen=new Set();return sorted.filter(r=>{if(seen.has(r.kit.key))return false;seen.add(r.kit.key);return true;});
}
export async function findLocalBrickRecovery({wallet,review,signal,fetchImpl=fetch,onProgress=()=>{},records}){
 const files=rankRecoveryFiles(records||await listRecoveryFiles(wallet),wallet,review),cache=new Map();
 // Buffer only bounded encrypted metadata. Reusing Response.clone() would leave an
 // unread stream branch and can stall cancellation of a rejected response.
 const fetchOnce=async(url,options)=>{
  if(cache.has(url)){const cached=cache.get(url);return new Response(cached.bytes,{headers:cached.headers});}
  const response=await fetchImpl(url,options);
  if(!response.ok||response.redirected||response.headers.get('content-type')?.split(';')[0].trim()!=='application/octet-stream')return response;
  const reader=response.body?.getReader();if(!reader)throw Error('IPFS did not return readable encrypted metadata.');
  const chunks=[];let size=0;
  try{while(true){signal?.throwIfAborted();const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>2*1024*1024)throw Error('Encrypted metadata exceeds the editor limit.');chunks.push(next.value);}}
  catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  cache.set(url,{bytes,headers:response.headers});return new Response(bytes,{headers:response.headers});
 };
 for(let i=0;i<files.length;i++){
  signal?.throwIfAborted();onProgress(i+1,files.length);
  // Stored associations are discovery hints. The live Brick's current commitment
  // is authoritative, including when an imported backup lists an older revision.
  try{const metadata=await openBrickMetadata({review,kit:{...files[i].kit,metadata:[]},fetchImpl:fetchOnce,signal});return {record:files[i],metadata};}
  catch(e){if(signal?.aborted)throw e;if(!/key is incorrect|does not match the selected|integrity check failed/i.test(e.message))throw e;}
 }
 return null;
}
export async function rememberMintRecovery({wallet,secret,assets,packet,mint}){
 if(!wallet||!secret)return null;
 const ownPacket=packet?{...packet,bricks:packet.bricks.filter(b=>!b.reuse)}:null;
 const kit=buildRecoveryFile({secret,assets,packet:ownPacket}),bindings=[];
 if(mint&&!mint.simulated&&mint.genesisHash){
  for(const receipt of mint.receipts||[]){if(receipt.status!=='verified'||receipt.reused)continue;
   const source=ownPacket?.bricks.find(b=>b.localId===receipt.sourceId);
   if(!source?.metadataCipherCid||!kit.metadata.some(m=>m.cid===source.metadataCipherCid))continue;
   bindings.push({chainId:Number(mint.chainId),factoryAddress:mint.factoryAddress,genesisHash:mint.genesisHash,brickAddress:receipt.contractAddress,ipId:receipt.id,metadataDigest:receipt.metadataDigest,title:source.metadata.title});
  }
 }
 return saveRecoveryFile({wallet,kit,bindings,title:ownPacket?.bricks[0]?.metadata.title||'',name:'ybr-private-recovery.json'});
}
