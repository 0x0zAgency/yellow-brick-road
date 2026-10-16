/** Browser-only encrypted asset demonstration; no storage, entitlement checks or on-chain actions. */
import {encryptAsset,decryptAsset} from './road-encryption.js';
function demoSecret(){const c=globalThis.crypto;if(!c?.getRandomValues)throw Error('Secure browser context required.');return [...c.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');}
function validateItems(items){if(!Array.isArray(items)||!items.length)throw Error('Attach at least one file.');const ids=new Set();for(const item of items){if(!item?.id||!item.file||typeof item.file.arrayBuffer!=='function')throw Error('Missing attached file.');if(ids.has(item.id))throw Error('Duplicate file role.');ids.add(item.id);}}
export async function encryptDemoBatch({items,secret=null,existing=null,onProgress=()=>{}}){
 validateItems(items);if(existing?.size&&!secret)throw Error('Cannot recover previous demo session key.');
 const key=secret||demoSecret(),encrypted=new Map(existing||[]),updates={};
 for(const {id,file,originalSha256} of items){
  onProgress(id,'encrypting');
  const output=await encryptAsset(await file.arrayBuffer(),key,{name:file.name,mime:file.type||'application/octet-stream'});
  const receiptId='DEMO-'+output.sha256.slice(0,16).toUpperCase();
  encrypted.set(id,{bytes:output.bytes,receiptId,ciphertextSha256:output.sha256,sourceSha256:originalSha256||null});
  updates[id]={encryption:{sha256:output.sha256,algorithm:'AES-256-GCM',containerVersion:1},demoUpload:{receiptId,status:'simulated-not-uploaded',cid:null,provider:null}};
  onProgress(id,'simulated');
 }
 return {secret:key,encrypted,updates};
}
export async function openDemoDownload({entry,secret,authorized=false}){
 if(!authorized)throw Error('DEMO authorization required before decrypting.');
 if(!entry?.bytes||!secret)throw Error('Encrypted file or session key unavailable. Reattach the original to retry.');
 const source=await decryptAsset(entry.bytes,secret);
 return {bytes:source.bytes,name:source.header.name,mime:source.header.mime};
}