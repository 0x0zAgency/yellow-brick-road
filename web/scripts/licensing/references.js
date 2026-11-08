import {normalizeLinkRequest,checkLinkedBrick,linkRequestDigest,verifyLinkResponse,buildLinkResponse} from '../../src/brick-authorization.js';
import {sameAddress} from '../../src/licensing/protocol.js';

const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const title=value=>typeof value==='string'?value.trim().slice(0,200):'';
/** Reference requests contain public identities/scope only, never source files or recovery keys. */
export function createReferenceInbox({client,store,profile,now=()=>Date.now()}){
 async function check(request){
  const req=normalizeLinkRequest(request);
  if(req.chainId!==profile.chainId||!sameAddress(req.factory,profile.factoryAddress))fail('Reference belongs to another deployment.');
  return checkLinkedBrick(client,req);
 }
 async function decorate(record){
  if(record.request.deadline<=Math.floor(now()/1000))return {...record,status:'expired'};
  const {controller}=await check(record.request);
  return {...record,status:sameAddress(controller,record.controller)?record.status:'stale'};
 }
 return {
  async list(address){
   const records=(store.snapshot().references||[]).filter(r=>sameAddress(r.controller,address)||sameAddress(r.request.requester,address));
   const result=[];for(const record of records)result.push(await decorate(record));return result.reverse();
  },
  async submit(address,body){
   const request=normalizeLinkRequest(body.request);
   if(!sameAddress(request.requester,address))fail('Only the requesting wallet can send this request.',403);
   const {controller}=await check(request),id=linkRequestDigest(request);
   return store.mutate(data=>{
    data.references ||= [];
    const existing=data.references.find(r=>r.id===id);if(existing)return existing;
    if(data.references.length>=1000||data.references.filter(r=>sameAddress(r.request.requester,address)).length>=100)fail('This inbox has reached its reference request limit.',429);
    const record={id,request,controller,workTitle:title(body.workTitle),brickTitle:title(body.brickTitle),status:'pending',createdAt:now()};
    data.references.push(record);return record;
   });
  },
  async decide(address,id,body){
   return store.mutate(async data=>{
    const record=(data.references||[]).find(r=>r.id===id);if(!record)fail('Reference request not found.',404);
    const current=await decorate(record);
    if(current.status!=='pending')fail('This reference request is no longer pending.',409);
    if(body.action==='withdraw'){
     if(!sameAddress(record.request.requester,address))fail('Only the requester can withdraw this request.',403);
     record.status='withdrawn';
    }else{
     if(!sameAddress(record.controller,address))fail('Only the current controller can decide this request.',403);
     if(body.action==='approve'){
      await verifyLinkResponse(client,record.request,body.response);
      record.response=buildLinkResponse(record.request,body.response.signature,address);record.status='approved';
     }else if(body.action==='decline')record.status='declined';
     else fail('Choose approve, decline or withdraw.');
    }
    record.updatedAt=now();return record;
   });
  }
 };
}
