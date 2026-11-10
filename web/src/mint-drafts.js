/** Device-local work in progress. Never sends originals or keys to a server.
 * Wallet scoping is an organizational boundary, not encryption/access control.
 * Source Blobs and encrypted containers live separately from the small draft record.
 */
import {linkRequestDigest} from './brick-authorization.js';
export const MINT_DRAFT_EVENT='ybr:mint-drafts-changed';
const DB='ybr-mint-drafts-v1',RECORDS='drafts',FILES='files';
const same=(a,b)=>!!a&&!!b&&String(a).toLowerCase()===String(b).toLowerCase();
const walletKey=wallet=>{if(!/^0x[0-9a-f]{40}$/i.test(wallet||''))throw Error('Connect a wallet to save work in progress.');return wallet.toLowerCase();};
const storageError=()=>Error('This browser could not save your work. Keep this tab open, free local storage, then try saving again.');
const requestId=link=>{try{return link.request?linkRequestDigest(link.request):null;}catch{return null;}};
export function approvalProgress(state,now=Date.now()){
 const links=state.linkedBricks||[];let waiting=0,attention=0,approved=0;
 for(const link of links){
  const request=link.request;
  if(!request||!same(request.requester,state.wallet)||request.chainId!==Number(state.chainId)||!same(request.sourceCommitment,'0x'+state.assets?.master?.hash)||request.deadline*1000<=now||['declined','withdrawn','stale','expired'].includes(link.requestStatus)){attention++;continue;}
  if(link.response)approved++;else waiting++;
 }
 return {waiting,attention,approved,total:links.length};
}
export function draftStatus(state,now=Date.now()){
 if(state.submissionPending||state.mint&&!['confirmed','complete'].includes(state.mint.status)&&!state.mint.simulated)return {kind:'attention',label:'Check mint transaction'};
 if(state.mint)return {kind:'complete',label:state.mint.simulated?'Simulation complete':'Mint confirmed'};
 const p=approvalProgress(state,now);
 if(p.attention)return {kind:'attention',label:'Needs attention'};
 if(p.waiting)return {kind:'waiting',label:'Waiting for approval'};
 return {kind:'ready',label:p.total?'Ready to resume':'In progress'};
}
export function hasDraftWork(state){return !!(state.form?.meta?.title?.trim()||Object.keys(state.assets||{}).length||state.linkedBricks?.length);}
export function draftFileRevision(state){return JSON.stringify(Object.entries(state.assets||{}).sort(([a],[b])=>a.localeCompare(b)).map(([id,a])=>[id,a.hash,a.name,a.size,a.status,a.encryption?.sha256]));}
export function applyReferenceUpdates(state,records){
 let changed=false;
 const incoming=new Map(records.filter(r=>r.request&&same(r.request.requester,state.wallet)&&r.request.chainId===Number(state.chainId)).map(r=>[r.id||linkRequestDigest(r.request),r]));
 const linkedBricks=(state.linkedBricks||[]).map(link=>{
  const record=incoming.get(requestId(link));if(!record)return link;
  const response=record.status==='approved'?record.response||link.response:null;
  if(link.requestStatus===record.status&&JSON.stringify(link.response||null)===JSON.stringify(response||null))return link;
  changed=true;return {...link,requestStatus:record.status,response,controller:record.controller||link.controller};
 });
 return changed?{...state,linkedBricks}:state;
}
// An in-flight form save must not overwrite a response delivered to its saved copy.
function keepDeliveredResponses(state,previous){
 const existing=new Map((previous?.linkedBricks||[]).map(link=>[requestId(link),link]));
 return {...state,linkedBricks:(state.linkedBricks||[]).map(link=>{
  const old=existing.get(requestId(link));
  if(!old||!link.request||link.response)return link;
  if(old.response||['declined','stale','expired','withdrawn'].includes(old.requestStatus))return {...link,response:old.response,requestStatus:old.requestStatus};
  return link;
 })};
}
function openDb(indexedDB=globalThis.indexedDB){
 return new Promise((resolve,reject)=>{
  if(!indexedDB?.open){reject(storageError());return;}
  let request,settled=false;
  const fail=()=>{settled=true;clearTimeout(timer);reject(storageError());},timer=setTimeout(fail,5000);
  try{request=indexedDB.open(DB,1);}catch{fail();return;}
  request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore(RECORDS,{keyPath:'id'}).createIndex('wallet','wallet');db.createObjectStore(FILES,{keyPath:'id'});};
  request.onerror=fail;request.onblocked=fail;
  request.onsuccess=()=>{clearTimeout(timer);if(settled){request.result.close();return;}resolve(request.result);};
 });
}
async function transact(mode,run,options={}){
 const db=await openDb(options.indexedDB);
 return new Promise((resolve,reject)=>{
  let result,error,tx;
  try{tx=db.transaction([RECORDS,FILES],mode);run(tx.objectStore(RECORDS),tx.objectStore(FILES),value=>{result=value;},e=>{error=e;tx.abort();});}
  catch(e){db.close();reject(e);return;}
  tx.oncomplete=()=>{db.close();resolve(result);};tx.onabort=()=>{db.close();reject(error||storageError());};tx.onerror=()=>{};
 });
}
function notify(){globalThis.dispatchEvent?.(new Event(MINT_DRAFT_EVENT));}
export async function saveMintDraft({id,wallet,state,files},options={}){
 wallet=walletKey(wallet);
 if(typeof id!=='string'||!id.startsWith(wallet+':'))throw Error('Draft wallet mismatch.');
 if(!same(state.wallet,wallet))throw Error('Draft wallet changed.');
 const fileRevision=draftFileRevision(state)+JSON.stringify([files?.nftCover?.sourceDigest,files?.nftCover?.sha256,files?.nftCover?.consent,files?.nftCover?.candidate?.imageURI,files?.nftCover?.bytes?.byteLength]);
 const saved=await transact('readwrite',(records,payloads,done,fail)=>{
  const request=records.get(id);
  request.onsuccess=()=>{try{
   const previous=request.result;if(previous&&previous.wallet!==wallet)throw Error('Draft wallet mismatch.');
   const merged=keepDeliveredResponses(state,previous?.state),now=Date.now();
   const record={id,wallet,version:1,state:merged,title:merged.form?.meta?.title?.trim()||merged.assets?.master?.name||'Untitled Brick',createdAt:previous?.createdAt||now,updatedAt:now,fileRevision};
   if(!previous||previous.fileRevision!==fileRevision){if(!files)throw storageError();payloads.put({id,...files});}
   records.put(record);done(record);
  }catch(e){fail(e);}};
 },options);notify();return saved;
}
export async function listMintDrafts(wallet,options={}){
 wallet=walletKey(wallet);
 return transact('readonly',(records,_,done)=>{const request=records.index('wallet').getAll(wallet);request.onsuccess=()=>done(request.result.sort((a,b)=>b.updatedAt-a.updatedAt));},options);
}
export async function loadMintDraft(wallet,id,options={}){
 wallet=walletKey(wallet);
 return transact('readonly',(records,payloads,done,fail)=>{
  const request=records.get(id);request.onsuccess=()=>{
   if(!request.result||request.result.wallet!==wallet){fail(Error('This draft is unavailable for the connected wallet.'));return;}
   const record=request.result,payload=payloads.get(id);payload.onsuccess=()=>{if(!payload.result){fail(storageError());return;}done({...record,files:payload.result});};
  };
 },options);
}
export async function removeMintDraft(wallet,id,options={}){
 wallet=walletKey(wallet);
 await transact('readwrite',(records,payloads,done,fail)=>{const request=records.get(id);request.onsuccess=()=>{if(request.result?.wallet!==wallet){fail(Error('Draft wallet mismatch.'));return;}records.delete(id);payloads.delete(id);done();};},options);notify();
}
export async function mergeDraftReferences({wallet,chainId,genesisHash,records:incoming},options={}){
 wallet=walletKey(wallet);if(!incoming?.length)return;
 const changed=await transact('readwrite',(records,_,done,fail)=>{
  const request=records.index('wallet').getAll(wallet);request.onsuccess=()=>{try{let count=0;
   for(const row of request.result){if(Number(row.state.chainId)!==Number(chainId)||!same(row.state.genesisHash,genesisHash))continue;
    const state=applyReferenceUpdates(row.state,incoming);if(state!==row.state){records.put({...row,state,updatedAt:Date.now()});count++;}}
   done(count);
  }catch(e){fail(e);}};
 },options);if(changed)notify();
}
