/** Device-local recovery JSON. No network transport, wallet signatures or server backup. */
import {sha256,toHex} from 'viem';
import {parseRecoveryFile,recoveryDownloadName} from './ipfs-recovery.js';
export const RECOVERY_COLLECTION='ybr-local-recovery-collection/1';
export const RECOVERY_VAULT_EVENT='ybr:local-recovery-changed';
export const MAX_COLLECTION_BYTES=32*1024*1024;
export const MAX_VAULT_FILES=512;
const DB='ybr-private-recovery-v1',STORE='files';
const address=value=>/^0x[0-9a-f]{40}$/i.test(value||'');
const hash=value=>/^0x[0-9a-f]{64}$/i.test(value||'');
export function recoveryWallet(wallet){if(!address(wallet))throw Error('Connect a wallet to use its local recovery files.');return wallet.toLowerCase();}
export function recoveryBinding(value){
 if(!value||!Number.isSafeInteger(Number(value.chainId))||Number(value.chainId)<=0||!address(value.factoryAddress)||!address(value.brickAddress)||!hash(value.genesisHash)||!hash(value.ipId)||!hash(value.metadataDigest))throw Error('Invalid Brick recovery association.');
 return {chainId:Number(value.chainId),factoryAddress:value.factoryAddress.toLowerCase(),brickAddress:value.brickAddress.toLowerCase(),genesisHash:value.genesisHash.toLowerCase(),ipId:value.ipId.toLowerCase(),metadataDigest:value.metadataDigest.toLowerCase(),title:typeof value.title==='string'?value.title.slice(0,1024):''};
}
export const bindingKey=b=>[b.chainId,b.genesisHash,b.factoryAddress,b.brickAddress,b.ipId].join(':').toLowerCase();
export function makeRecoveryRecord({wallet,kit,name='private-recovery.json',title='',bindings=[]}){
 wallet=recoveryWallet(wallet);kit=parseRecoveryFile(JSON.stringify(kit));
 if(!Array.isArray(bindings)||bindings.length>128)throw Error('Too many Brick associations in this recovery file.');
 const normalizedBindings=[...new Map(bindings.map(recoveryBinding).map(b=>[bindingKey(b),b])).values()];
 return {id:wallet+':'+sha256(toHex(JSON.stringify(kit))),wallet,kit,name:recoveryDownloadName(name,'private-recovery.json'),
  title:typeof title==='string'?title.slice(0,1024):'',bindings:normalizedBindings};
}
export function parseRecoveryImport(text,wallet,name){
 wallet=recoveryWallet(wallet);
 if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_COLLECTION_BYTES)throw Error('Choose recovery JSON up to 32 MiB.');
 let value;try{value=JSON.parse(text);}catch{throw Error('This is not valid recovery JSON.');}
 if(value?.format!==RECOVERY_COLLECTION)return [makeRecoveryRecord({wallet,kit:parseRecoveryFile(text),name})];
 if(recoveryWallet(value.wallet)!==wallet)throw Error('This collection belongs to another wallet. Connect that wallet to import it.');
 if(!Array.isArray(value.files)||!value.files.length||value.files.length>MAX_VAULT_FILES)throw Error('The recovery collection must contain 1–512 files.');
 return value.files.map(file=>makeRecoveryRecord({...file,wallet}));
}
export function exportRecoveryCollection(wallet,records){
 wallet=recoveryWallet(wallet);
 if(!Array.isArray(records)||records.length>MAX_VAULT_FILES||records.some(r=>r.wallet!==wallet))throw Error('Recovery files must belong to this wallet.');
 const files=records.map(r=>{const {name,title,kit,bindings}=makeRecoveryRecord({...r,wallet});return {name,title,kit,bindings};});
 const text=JSON.stringify({format:RECOVERY_COLLECTION,wallet,exportedAt:new Date().toISOString(),files},null,2);
 if(new TextEncoder().encode(text).length>MAX_COLLECTION_BYTES)throw Error('Collection is too large for one export. Download individual recovery files.');
 return text;
}
const storageError=()=>Error('Local recovery storage is unavailable or full. Download your recovery JSON to keep a copy.');
function openDb(indexedDB=globalThis.indexedDB){
 return new Promise((resolve,reject)=>{
  if(!indexedDB?.open){reject(storageError());return;}
  let request,settled=false;const timer=setTimeout(()=>{settled=true;reject(storageError());},5000);
  const fail=()=>{clearTimeout(timer);settled=true;reject(storageError());};
  try{request=indexedDB.open(DB,1);}catch{fail();return;}
  request.onupgradeneeded=()=>{const db=request.result;const store=db.createObjectStore(STORE,{keyPath:'id'});store.createIndex('wallet','wallet');};
  request.onerror=fail;request.onblocked=fail;
  request.onsuccess=()=>{clearTimeout(timer);if(settled){request.result.close();return;}resolve(request.result);};
 });
}
async function transaction(wallet,mode,operation,indexedDB){
 wallet=recoveryWallet(wallet);const db=await openDb(indexedDB);
 return new Promise((resolve,reject)=>{
  let result,error,tx;
  try{tx=db.transaction(STORE,mode);const store=tx.objectStore(STORE),request=store.index('wallet').getAll(wallet);
   request.onsuccess=()=>{try{result=operation(store,request.result);}catch(e){error=e;tx.abort();}};
  }catch{db.close();reject(storageError());return;}
  tx.oncomplete=()=>{db.close();resolve(result);};tx.onabort=()=>{db.close();reject(error||storageError());};tx.onerror=()=>{};
 });
}
export async function listRecoveryFiles(wallet,options={}){
 return transaction(wallet,'readonly',(_,rows)=>rows.map(row=>({...row,...makeRecoveryRecord(row)})).sort((a,b)=>b.updatedAt-a.updatedAt),options.indexedDB);
}
// Card labels do not need recovery keys or file entries outside the vault.
export async function listRecoveryTitles(wallet,options={}){
 return transaction(wallet,'readonly',(_,rows)=>rows.flatMap(row=>row.bindings.map(binding=>({...recoveryBinding(binding),wallet:row.wallet,updatedAt:row.updatedAt}))),options.indexedDB);
}
export async function saveRecoveryRecords(wallet,records,options={}){
 wallet=recoveryWallet(wallet);
 if(!Array.isArray(records)||records.length>MAX_VAULT_FILES)throw Error('Too many recovery files.');
 const incoming=records.map(r=>{if(r.wallet&&recoveryWallet(r.wallet)!==wallet)throw Error('Recovery wallet mismatch.');return makeRecoveryRecord({...r,wallet});});
 const saved=await transaction(wallet,'readwrite',(store,rows)=>{
  const all=new Map(rows.map(r=>[r.id,r])),now=Date.now(),updates=new Map();
  for(const record of incoming){const old=all.get(record.id),bindings=[...new Map([...(old?.bindings||[]),...record.bindings].map(b=>[bindingKey(b),b])).values()];
   if(bindings.length>128)throw Error('Too many associations for this recovery file.');
   const next={...record,title:record.title||old?.title||'',bindings,createdAt:old?.createdAt||now,updatedAt:now};all.set(next.id,next);updates.set(next.id,next);
  }
  if(all.size>MAX_VAULT_FILES||new TextEncoder().encode(JSON.stringify([...all.values()])).length>MAX_COLLECTION_BYTES)throw storageError();
  for(const record of updates.values())store.put(record);
  return [...updates.values()];
 },options.indexedDB);
 globalThis.dispatchEvent?.(new Event(RECOVERY_VAULT_EVENT));return saved;
}
export async function saveRecoveryFile(input,options={}){return (await saveRecoveryRecords(input.wallet,[input],options))[0];}
export async function removeRecoveryFile(wallet,id,options={}){
 await transaction(wallet,'readwrite',(store,rows)=>{if(rows.some(r=>r.id===id))store.delete(id);},options.indexedDB);
 globalThis.dispatchEvent?.(new Event(RECOVERY_VAULT_EVENT));
}
export function downloadRecoveryJson(text,name){
 const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=recoveryDownloadName(name);link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
