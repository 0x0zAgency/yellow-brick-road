/** Creator-controlled recovery. Secrets and decrypted bytes never leave the browser.
 * This local recovery file is a private backup, not a license or provenance standard.
 */
import {decryptAsset} from './road-encryption.js';
import {validCid} from './ipfs-upload.js';

export const RECOVERY_V1='0x-road-ipfs-recovery-v1';
export const RECOVERY_V2='0x-road-ipfs-recovery-v2';
export const MAX_RECOVERY_FILE_BYTES=1024*1024;
export const MAX_RECOVERY_CIPHERTEXT_BYTES=32*1024*1024;
export const IPFS_RECOVERY_TIMEOUT_MS=30000;
const MAX_ENTRIES=64;
const textEncoder=new TextEncoder();
const SHA=/^(?:0x)?[0-9a-f]{64}$/i;
const MIME=/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;
const PRIVATE_WARNING='PRIVATE DECRYPTION SECRET. Anyone with this file and the CIDs can access your protected work.';
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

function checkedKey(key){
 if(typeof key!=='string'||key.length<12||key.length>256)throw Error('Recovery key must contain between 12 and 256 characters.');
 return key;
}
function checkedHash(value,{required=false}={}){
 if(value===undefined||value===null||value===''){
  if(required)throw Error('Recovery entry is missing an integrity digest.');
  return null;
 }
 if(typeof value!=='string'||value!==value.trim()||!SHA.test(value))throw Error('Recovery entry has an invalid integrity digest.');
 return value.replace(/^0x/i,'').toLowerCase();
}
function checkedSize(value,{required=false,ciphertext=false}={}){
 if(value===undefined||value===null){
  if(required)throw Error('Recovery entry is missing its file size.');
  return null;
 }
 if(!Number.isSafeInteger(value)||value<(ciphertext?1:0)||value>MAX_RECOVERY_CIPHERTEXT_BYTES)
  throw Error('Recovery entry exceeds the 32 MiB pilot limit or has an invalid file size.');
 return value;
}
function checkedLabel(value,fallback){
 if(value===undefined||value===null)return fallback;
 if(typeof value!=='string'||!value.trim()||value.length>160||/[\u0000-\u001f\u007f]/.test(value))throw Error('Recovery entry has an invalid role.');
 return value.trim();
}
export function recoveryDownloadName(value,fallback='recovered-file'){
 if(value===undefined||value===null||value==='')return fallback;
 if(typeof value!=='string'||value.length>512)throw Error('Recovery entry has an invalid filename.');
 const name=value.split(/[\\/]/).at(-1)
  .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>:"|?*]/g,'_')
  .replace(/^[.\s]+|[.\s]+$/g,'').slice(0,200);
 if(!name)return fallback;
 return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)?'recovered-'+name:name;
}
function checkedMime(value,fallback){
 if(value===undefined||value===null||value==='')return fallback;
 if(typeof value!=='string'||value.length>127||!MIME.test(value))throw Error('Recovery entry has an invalid media type.');
 return value.toLowerCase();
}
function normalizeEntry(value,kind,{strict=false,legacy=false,chainMetadata=false}={}){
 if(!record(value)||!validCid(value.cid))throw Error('Recovery entry must identify a bare IPFS CID.');
 const role=checkedLabel(value.role,kind==='metadata'?'metadata':'asset');
 const localId=value.localId===undefined||value.localId===null?null:checkedLabel(value.localId,null);
 if(localId&&!/^[a-zA-Z0-9_-]{1,64}$/.test(localId))throw Error('Recovery entry has an invalid local identity.');
 const encryptedSha256=checkedHash(value.encryptedSha256,{required:strict||(kind==='asset')});
 const originalSha256=checkedHash(value.originalSha256,{required:strict});
 const encryptedSize=checkedSize(value.encryptedSize,{required:strict,ciphertext:true});
 const originalSize=checkedSize(value.originalSize,{required:strict});
 if(kind==='metadata'&&!legacy&&!chainMetadata&&!encryptedSha256)throw Error('Metadata recovery requires an integrity digest or a selected on-chain commitment.');
 return {
  kind,role,localId,
  name:recoveryDownloadName(value.name||recoveryDownloadName(kind==='metadata'?(localId||'brick')+'-metadata.json':role+'-recovered')),
  mime:checkedMime(value.mime,kind==='metadata'?'application/json':'application/octet-stream'),
  cid:value.cid,encryptedSha256,encryptedSize,originalSha256,originalSize,legacy
 };
}

/** Parse locally, before any fetch. Parser errors never echo private JSON fragments. */
export function parseRecoveryFile(text){
 if(typeof text!=='string'||text.length>MAX_RECOVERY_FILE_BYTES||textEncoder.encode(text).length>MAX_RECOVERY_FILE_BYTES)
  throw Error('Choose a recovery JSON file no larger than 1 MiB.');
 let value;
 try{value=JSON.parse(text)}catch{throw Error('This is not a valid recovery JSON file.');}
 if(!record(value)||![RECOVERY_V1,RECOVERY_V2].includes(value.format))throw Error('Unsupported YBR recovery-file format.');
 const key=checkedKey(value.key),legacy=value.format===RECOVERY_V1;
 if(!Array.isArray(value.assets)||!Array.isArray(value.metadata)||value.assets.length>MAX_ENTRIES||value.metadata.length>MAX_ENTRIES)
  throw Error('Recovery file must contain bounded asset and metadata lists.');
 const seen=new Set();
 const entries=(items,kind)=>items.map(item=>{
  const entry=normalizeEntry(item,kind,{strict:!legacy,legacy});
  // A source and its encrypted metadata are distinct pinned containers.
  if(seen.has(entry.cid))throw Error('Recovery file contains a duplicate content identifier.');
  seen.add(entry.cid);
  return entry;
 });
 const assets=entries(value.assets,'asset'),metadata=entries(value.metadata,'metadata');
 const roles=new Set();
 for(const asset of assets){if(roles.has(asset.role))throw Error('Recovery file contains a duplicate asset role.');roles.add(asset.role);}
 return {format:value.format,key,assets,metadata};
}

/** Build from verified upload receipts and source hashes already held by Mint Studio. */
export function buildRecoveryFile({secret,assets={},packet=null}){
 checkedKey(secret);
 if(!record(assets))throw Error('Recovery source assets are unavailable.');
 const value={format:RECOVERY_V2,warning:PRIVATE_WARNING,key:secret,
  assets:Object.entries(assets).filter(([,asset])=>asset?.ipfsUpload?.verified&&asset.ipfsUpload.cid).map(([role,asset])=>({
   role,name:asset.name,mime:asset.type||'application/octet-stream',cid:asset.ipfsUpload.cid,
   encryptedSha256:asset.ipfsUpload.sha256,encryptedSize:asset.ipfsUpload.size,
   originalSha256:asset.hash,originalSize:asset.size
  })),
  metadata:(packet?.bricks||[]).filter(brick=>brick.metadataCipherCid).map(brick=>({
   localId:brick.localId,role:brick.role,name:(brick.localId||'brick')+'-metadata.json',mime:'application/json',
   cid:brick.metadataCipherCid,encryptedSha256:brick.metadataCipherSha256,encryptedSize:brick.metadataCipherSize,
   originalSha256:brick.metadataPlaintextSha256,originalSize:brick.metadataPlaintextSize
  }))
 };
 // Validate exports with exactly the same constraints used on a later import.
 const normalized=parseRecoveryFile(JSON.stringify(value));
 return {...normalized,warning:PRIVATE_WARNING};
}

/** Extract hash-bound pinned media after the caller has verified its parent metadata.
 * This structural validation does not itself establish on-chain provenance.
 */
export function assetsFromRecoveredMetadata(metadata){
 if(!record(metadata)||!Array.isArray(metadata.media)||metadata.media.length>MAX_ENTRIES)
  throw Error('Recovered Brick metadata has no valid media list.');
 if(metadata.media.some(media=>!record(media)))throw Error('Recovered Brick metadata contains an invalid media reference.');
 const roles=new Set(),cids=new Set();
 return metadata.media.filter(media=>media?.cid!==undefined&&media?.cid!==null).map(media=>{
  if(!record(media)||media.integrity?.algorithm!=='sha2-256')throw Error('Recovered metadata is missing a supported source integrity commitment.');
  const entry=normalizeEntry({role:media.role,name:media.name,mime:media.mediaType,cid:media.cid,
   encryptedSha256:media.access?.ciphertextDigest,originalSha256:media.integrity.digest,originalSize:media.byteLength},'asset');
  if(!entry.originalSha256||entry.originalSize===null)throw Error('Recovered metadata is missing a source digest or length.');
  if(roles.has(entry.role)||cids.has(entry.cid))throw Error('Recovered metadata contains duplicate source references.');
  roles.add(entry.role);cids.add(entry.cid);
  return entry;
 });
}

function abortError(){return new DOMException('Recovery canceled.','AbortError');}
function checkAbort(signal){if(signal?.aborted)throw abortError();}
function abortable(promise,signal){
 return new Promise((resolve,reject)=>{
  const abort=()=>{cleanup();reject(abortError());};
  const cleanup=()=>signal.removeEventListener('abort',abort);
  signal.addEventListener('abort',abort,{once:true});
  Promise.resolve(promise).then(value=>{cleanup();resolve(value)},error=>{cleanup();reject(error)});
  if(signal.aborted)abort();
 });
}
async function readBounded(response,{expectedSize,signal}){
 const lengthHeader=response.headers.get('content-length');
 if(lengthHeader!==null&&(!/^(?:0|[1-9][0-9]*)$/.test(lengthHeader)||Number(lengthHeader)>MAX_RECOVERY_CIPHERTEXT_BYTES)){
  await response.body?.cancel();
  throw Error('Encrypted IPFS response exceeds the 32 MiB pilot limit or has an invalid length.');
 }
 if(!response.body?.getReader)throw Error('IPFS did not return a readable encrypted file.');
 const reader=response.body.getReader(),parts=[];
 let size=0,done=false;
 try{
  for(;;){
   checkAbort(signal);
   const next=await abortable(reader.read(),signal);
   if(next.done){done=true;break;}
   if(!(next.value instanceof Uint8Array))throw Error('IPFS returned an invalid encrypted body.');
   size+=next.value.byteLength;
   if(size>MAX_RECOVERY_CIPHERTEXT_BYTES||(expectedSize!==null&&size>expectedSize))throw Error('Encrypted IPFS file exceeds its expected size or the 32 MiB pilot limit.');
   parts.push(next.value);
  }
  if(!size||(expectedSize!==null&&size!==expectedSize))throw Error('Encrypted IPFS file size does not match the recovery file.');
  if(lengthHeader!==null&&size!==Number(lengthHeader))throw Error('Encrypted IPFS response length is inconsistent.');
  const bytes=new Uint8Array(size);
  let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
  return bytes;
 }finally{
  if(!done)await reader.cancel().catch(()=>{});
  reader.releaseLock();
 }
}
async function digest(bytes){
 if(!globalThis.crypto?.subtle)throw Error('Secure browser context required for recovery.');
 return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

/** Recover only after an explicit user action. A decryption key is never sent. */
export async function recoverIpfsEntry({entry,key,fetchImpl=fetch,signal,expectedPlaintextSha256}={}){
 checkedKey(key);
 const expectedCommitment=checkedHash(expectedPlaintextSha256);
 const kind=entry?.kind==='metadata'||entry?.role==='metadata'?'metadata':'asset';
 const normalized=normalizeEntry(entry,kind,{legacy:entry?.legacy===true,chainMetadata:kind==='metadata'&&!!expectedCommitment});
 if(expectedCommitment&&normalized.originalSha256&&expectedCommitment!==normalized.originalSha256)
  throw Error('Recovery file does not match the selected metadata commitment.');
 checkAbort(signal);
 const controller=new AbortController();
 let timedOut=false;
 const abort=()=>controller.abort();
 signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},IPFS_RECOVERY_TIMEOUT_MS);
 try{
  let response;
  try{response=await abortable(fetchImpl('/api/road-ipfs/content/'+normalized.cid,{
   method:'GET',headers:{Accept:'application/octet-stream'},cache:'no-store',credentials:'same-origin',redirect:'error',signal:controller.signal
  }),controller.signal)}catch{
   checkAbort(controller.signal);
   throw Error('Could not reach the local YBR IPFS recovery service.');
  }
  if(!response.ok){await response.body?.cancel();throw Error(response.status===404?'Encrypted content is not pinned on this local IPFS node.':'The local IPFS service could not retrieve this encrypted file.');}
  if(response.redirected||response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/octet-stream'){
   await response.body?.cancel();throw Error('IPFS recovery requires an encrypted binary response from the local bridge.');
  }
  const bytes=await readBounded(response,{expectedSize:normalized.encryptedSize,signal:controller.signal});
  checkAbort(controller.signal);
  const ciphertextHash=await digest(bytes);
  if(normalized.encryptedSha256&&ciphertextHash!==normalized.encryptedSha256)throw Error('Encrypted file integrity check failed. No file was decrypted.');
  checkAbort(controller.signal);
  let plain;
  try{plain=await decryptAsset(bytes,key)}catch{checkAbort(controller.signal);throw Error('Unable to decrypt this file. The recovery key is incorrect or the encrypted file was changed.');}
  checkAbort(controller.signal);
  const plaintextHash=await digest(plain.bytes);
  if(normalized.originalSize!==null&&plain.bytes.byteLength!==normalized.originalSize)throw Error('Recovered file length does not match the recorded original.');
  if(normalized.originalSha256&&plaintextHash!==normalized.originalSha256)throw Error('Recovered original integrity check failed.');
  if(expectedCommitment&&plaintextHash!==expectedCommitment)throw Error('Recovered metadata does not match the selected on-chain commitment.');
  checkAbort(controller.signal);
  return {bytes:plain.bytes,name:normalized.name,mime:normalized.mime,sha256:plaintextHash,
   verification:{ciphertext:!!normalized.encryptedSha256,plaintext:!!(normalized.originalSha256||expectedCommitment),onChain:!!expectedCommitment,legacy:normalized.legacy}
  };
 }catch(error){
  if(timedOut)throw Error('IPFS recovery timed out. Check the local node and retry.');
  if(controller.signal.aborted)throw abortError();
  throw error;
 }finally{
  clearTimeout(timer);signal?.removeEventListener('abort',abort);
 }
}
