import {encryptAsset} from './road-encryption.js';
import {MAX_ENCRYPTED_ASSET_BYTES,ENCRYPTED_ASSET_LIMIT_LABEL} from './asset-limits.js';
/** Browser-side encrypted-only IPFS uploader. Never receives a plaintext File. */
const CID_RE=/^(?:bafy|bafk|baga|Qm)[a-zA-Z0-9]{20,120}$/;
const SHA_RE=/^[0-9a-f]{64}$/i;
export const IPFS_UPLOAD_PATH='/api/road-ipfs/upload';
export const IPFS_HEALTH_PATH='/api/road-ipfs/health';
export function validCid(cid){return typeof cid==='string'&&cid===cid.trim()&&CID_RE.test(cid)}
export function validateUploadReceipt(receipt,expectedDigest,expectedLength){
 if(!receipt||!validCid(receipt.cid))throw Error('IPFS did not return a valid CID.');
 if(!SHA_RE.test(expectedDigest||''))throw Error('Encrypted file digest is missing.');
 if(receipt.sha256?.toLowerCase()!==expectedDigest.toLowerCase())throw Error('IPFS retrieval digest does not match encrypted bytes. Upload rejected.');
 if(receipt.size!==expectedLength)throw Error('IPFS retrieval size does not match encrypted bytes.');
 if(receipt.pinned!==true||receipt.verified!==true)throw Error('IPFS service did not verify a persistent pin.');
 return {cid:receipt.cid,sha256:receipt.sha256.toLowerCase(),size:receipt.size,pinned:true,verified:true,provider:'ybr-local-kubo',uri:'ipfs://'+receipt.cid};
}
export async function uploadEncryptedAsset({entry,fetchImpl=fetch}){
 if(!(entry?.bytes instanceof Uint8Array)||!entry.bytes.length)throw Error('Encrypted bytes must exist in memory for IPFS upload.');
 if(entry.bytes.length>MAX_ENCRYPTED_ASSET_BYTES)throw Error('Encrypted file exceeds the '+ENCRYPTED_ASSET_LIMIT_LABEL+' limit.');
 if(!SHA_RE.test(entry.ciphertextSha256||''))throw Error('Encrypted digest not available.');
 const response=await fetchImpl(IPFS_UPLOAD_PATH,{
  method:'POST',headers:{'Content-Type':'application/octet-stream','X-Road-Encryption':'roadenc-v1'},
  body:entry.bytes
 });
 if(!response.ok){let message='IPFS upload failed (HTTP '+response.status+').';try{message=(await response.json()).error||message}catch{}throw Error(message);}
 return validateUploadReceipt(await response.json(),entry.ciphertextSha256,entry.bytes.byteLength);
}
export async function checkLocalIpfs(fetchImpl=fetch){
 const res=await fetchImpl(IPFS_HEALTH_PATH,{cache:'no-store'});
 if(!res.ok)throw Error('YBR IPFS upload bridge is unavailable.');
 const info=await res.json();
 if(info.ok!==true||typeof info.peerId!=='string'||!info.peerId)throw Error('Local IPFS node has not passed its health check.');
 return info;
}

/** Encrypt metadata separately per Brick before pinning it. CID points to an
 * encrypted metadata document, NOT public wallet/NFT-readable JSON.
 */
export async function pinEncryptedBrickMetadata({packet,secret,onProgress=()=>{},fetchImpl=fetch}){
 if(!Array.isArray(packet?.bricks)||!packet.bricks.length||!secret)throw Error('Registration packet and ephemeral local encryption key are required.');
 const bricks=[];
 for(let i=0;i<packet.bricks.length;i++){
  const brick=packet.bricks[i];
  if(brick.reuse){bricks.push(brick);continue;}
  onProgress('Pinning encrypted Brick metadata '+(i+1)+' / '+packet.bricks.length+'…');
  // Preserve the exact bytes committed by chain-mint.js (JSON.stringify order).
  const plaintext=new TextEncoder().encode(JSON.stringify(brick.metadata));
  const metadataDigest=await globalThis.crypto.subtle.digest('SHA-256',plaintext);
  const plaintextSha256=[...new Uint8Array(metadataDigest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  const encrypted=await encryptAsset(plaintext,secret,
   {name:'brick-metadata',mime:'application/octet-stream'});
  const pinned=await uploadEncryptedAsset({entry:{bytes:encrypted.bytes,ciphertextSha256:encrypted.sha256},fetchImpl});
  bricks.push({...brick,metadataCipherCid:pinned.cid,metadataCipherSha256:pinned.sha256,
   metadataCipherSize:pinned.size,metadataPlaintextSha256:plaintextSha256,metadataPlaintextSize:plaintext.byteLength});
 }
 return {...packet,bricks,
  storage:{...packet.storage,mode:'ipfs-encrypted-pinned',uploaded:true,encrypted:true,
   metadataCids:bricks.filter(b=>!b.reuse).map(b=>({localId:b.localId,cid:b.metadataCipherCid})),
   provider:'ybr-local-kubo',approvedProvider:false},
  notices:[...(packet.notices||[]).filter(n=>!n.startsWith('All demo upload receipts')),
   'Ciphertext and encrypted metadata were pinned to a local IPFS node. This pilot does not guarantee remote replication or availability.',
   'Metadata CIDs resolve to encrypted containers; a trusted key holder is required to access contents.']
 };
}
