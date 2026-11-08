import {createLicensingClient} from './licensing/client.js';
import {sameAddress} from './licensing/protocol.js';
import {linkRequestDigest} from './brick-authorization.js';

let client;
export const workspaceInbox=()=>client ||= createLicensingClient();
const local=new Map(),listeners=new Set();
const emit=()=>listeners.forEach(fn=>fn());
export const subscribeReferences=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
export const localReferences=()=>[...local.values()];
export function rememberReference(record){
 const id=linkRequestDigest(record.request),previous=local.get(id);
 local.set(id,{createdAt:Date.now(),status:'pending',...previous,...record,id});emit();return id;
}
export function forgetReference(request){if(request&&local.delete(linkRequestDigest(request)))emit();}
export const getReferenceResponse=request=>request?local.get(linkRequestDigest(request))?.response:null;
export function updateReference(id,changes){if(local.has(id)){local.set(id,{...local.get(id),...changes});emit();}}

/** Count actions, not unread messages. Viewing/dismissing never resolves a request. */
export function pendingNotifications({references=[],offers=[]},account,chainId,now=Date.now()){
 const unique=new Map();
 for(const record of references){
  if(record.status!=='pending'||record.request.chainId!==chainId||record.request.deadline*1000<=now||!sameAddress(record.controller,account))continue;
  unique.set('reference:'+record.id,{...record,kind:'reference',key:'reference:'+record.id,title:record.workTitle||'Brick reference request',detail:record.request.scope});
 }
 for(const record of offers){
  const offer=record.envelope.offer;
  if(record.envelope.chainId!==chainId||!['pending','approved'].includes(record.status)||Number(offer.deadline)*1000<=now||Number(offer.expiresAt)*1000<=now)continue;
  const approve=record.status==='pending'&&!record.ready&&sameAddress(offer.controller,account);
  const accept=record.ready&&sameAddress(offer.licensee,account);
  if(!approve&&!accept)continue;
  unique.set('offer:'+record.id,{...record,kind:'offer',key:'offer:'+record.id,title:record.envelope.project.title,detail:approve?'License offer awaiting your approval':record.parentId?'Counter-offer ready to review':'License ready to accept',action:approve?'approve':'accept'});
 }
 return [...unique.values()].sort((a,b)=>b.createdAt-a.createdAt);
}

/** Baseline loads are quiet; repeat polls and reloads of the same set never ring. */
export function createArrivalTracker(){
 let seen=null;
 return {reset(){seen=null;},observe(items){const incoming=seen?items.filter(item=>!seen.has(item.key)):[];seen ||= new Set();for(const item of items)seen.add(item.key);return incoming;}};
}
