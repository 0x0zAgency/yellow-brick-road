import {randomBytes} from 'node:crypto';
import {isAddress,zeroAddress} from 'viem';
import {createSiweMessage} from 'viem/siwe';
import {licensingAbi,normalizeEnvelope,offerId,offerArgs,typedOffer,sameAddress,validateOfferTime,textHash} from '../../src/licensing/protocol.js';
import {readLicensingState,readAsset,verifyNetwork} from '../../src/licensing/reader.js';
import {openStore} from './store.js';

const token=()=>randomBytes(32).toString('hex');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
/** One process owns a deployment ledger. No private key or transaction signer leaves the store. */
export async function createLicensingService({root,profile,client,store,now=()=>Date.now()}){
 if(![1337,11155111].includes(profile.chainId)||!isAddress(profile.factoryAddress)||!/^0x[0-9a-f]{64}$/i.test(profile.genesisHash||''))fail('Start Dev Control with a complete network deployment.');
 store ||= await openStore(root,profile);
 const publicProfile={chainId:profile.chainId,factoryAddress:profile.factoryAddress,genesisHash:profile.genesisHash,walletAddress:store.walletAddress};
 const challenges=new Map(),sessions=new Map(),csrf=token();
 const read=(brick,name,args=[])=>client.readContract({address:brick,abi:licensingAbi,functionName:name,args});
 const prune=map=>{for(const [key,value] of map)if(value.expires<=now())map.delete(key);};
 const session=key=>{prune(sessions);const s=sessions.get(key);if(!s)fail('Sign in to the licensing inbox again.',401);return s.address;};
 async function validate(raw){
  const e=normalizeEnvelope(raw);
  if(e.chainId!==profile.chainId||!sameAddress(e.factory,profile.factoryAddress)||!sameAddress(e.genesisHash,profile.genesisHash)||!sameAddress(e.offer.deployment,store.walletAddress))fail('Offer belongs to a different deployment.');
  const state=await readLicensingState(client,profile,e.brick);
  if(!sameAddress(e.salt,state.salt)||!sameAddress(e.offer.controller,state.controller)||BigInt(e.offer.epoch)!==state.epoch)fail('The Brick owner or payout policy changed. Create a fresh offer.');
  validateOfferTime(e,Math.floor(now()/1000));return e;
 }
 async function signed(e,address,signature){
  if(typeof signature!=='string'||signature.length>10000||!/^0x[0-9a-f]+$/i.test(signature)||!await client.verifyTypedData({...typedOffer(e),address,signature}))fail('Invalid wallet signature.');
 }
 async function decorate(record){
  const e=record.envelope;
  const [grant,cancelled,automatic,controller,epoch,salt]=await Promise.all([read(e.brick,'projectLicense',[record.id]),read(e.brick,'cancelledLicenseOffers',[record.id]),read(e.brick,'qualifiesForAutomaticLicense',[offerArgs(e)]),read(e.brick,'controller'),read(e.brick,'licensingEpoch'),read(e.brick,'licensingDomainSalt')]);
  const stale=!sameAddress(controller,e.offer.controller)||epoch!==BigInt(e.offer.epoch)||!sameAddress(salt,e.salt);
  const expired=BigInt(e.offer.deadline)<BigInt(Math.floor(now()/1000))||BigInt(e.offer.expiresAt)<=BigInt(Math.floor(now()/1000));
  const status=!sameAddress(grant.licensee,zeroAddress)?(grant.revoked?'revoked':'licensed'):cancelled?'cancelled':stale?'stale':expired?'expired':record.status;
  return {...record,status,automatic,grant,ready:!stale&&!expired&&!cancelled&&['pending','approved'].includes(status)&&(automatic||Boolean(record.controllerSignature))};
 }
 function add(data,record){if(data.offers.length>=1000)fail('This deployment inbox is full. Archive the ledger before accepting new offers.',409);if(data.offers.some(r=>r.id===record.id))fail('This signed offer already exists.',409);data.offers.push(record);return record;}
 return {profile:publicProfile,async dispatch({method,path,body={},authorization,origin,csrfToken}){
  await verifyNetwork(client,profile);
  const url=new URL(path,'http://local'),route=url.pathname;
  if(method!=='GET'&&csrfToken!==csrf)fail('Refresh the licensing workspace before continuing.',403);
  if(method==='GET'&&route==='/config')return {...publicProfile,csrf};
  if(method==='GET'&&route==='/state'){
   const state=await readLicensingState(client,profile,url.searchParams.get('brick'));
   const docs=store.snapshot().policies;
   return {...state,policyTerms:Object.fromEntries([1,2].map(scope=>{const doc=docs[state.brick.toLowerCase()+':'+scope];return [scope,doc&&doc.hash===state.policies[scope].termsHash?doc.terms:''];}))};
  }
  if(method==='GET'&&route==='/asset')return readAsset(client,url.searchParams.get('address'));
  if(method==='POST'&&route==='/challenge'){
   if(!isAddress(body.address))fail('Enter a wallet address.');prune(challenges);if(challenges.size>=256)fail('Too many sign-in attempts. Try again shortly.',429);
   const nonce=token(),expires=now()+300000;
   const message=createSiweMessage({address:body.address,chainId:profile.chainId,domain:new URL(origin).host,uri:origin,version:'1',nonce,issuedAt:new Date(now()),expirationTime:new Date(expires),statement:'Sign in to this Yellow Brick licensing inbox. This does not move funds or grant a license.',resources:['urn:ybr:factory:'+profile.factoryAddress.toLowerCase(),'urn:ybr:genesis:'+profile.genesisHash.toLowerCase(),'urn:ybr:deployment:'+store.walletAddress.toLowerCase()]});
   challenges.set(nonce,{message,address:body.address,origin,expires});return {nonce,message};
  }
  if(method==='POST'&&route==='/session'){
   prune(challenges);const c=challenges.get(body.nonce);challenges.delete(body.nonce);
   if(!c||c.origin!==origin||typeof body.signature!=='string'||body.signature.length>10000)fail('Sign-in challenge expired. Try again.',401);
   if(!await client.verifySiweMessage({message:c.message,signature:body.signature,address:c.address,domain:new URL(origin).host,nonce:body.nonce,time:new Date(now())}))fail('Invalid sign-in signature.',401);
   prune(sessions);if(sessions.size>=256)fail('Too many active sessions.',429);
   const key=token();sessions.set(key,{address:c.address,expires:now()+1800000});return {token:key,address:c.address};
  }
  const address=session(authorization);
  if(method==='GET'&&route==='/offers'){
   const brick=url.searchParams.get('brick'),state=await readLicensingState(client,profile,brick);
   const rows=store.snapshot().offers.filter(r=>sameAddress(r.envelope.brick,brick)&&(sameAddress(r.envelope.offer.licensee,address)||sameAddress(state.controller,address)));
   const result=[];for(const row of rows)result.push(await decorate(row));return {offers:result.reverse()};
  }
  if(method==='POST'&&route==='/offers'){
   const e=await validate(body.envelope);if(!sameAddress(e.offer.licensee,address))fail('Only the licensee can submit this offer.',403);
   await signed(e,address,body.signature);
   if(await read(e.brick,'cancelledLicenseOffers',[offerId(e)]))fail('This offer was cancelled on the Brick.');
   const record={id:offerId(e),envelope:e,licenseeSignature:body.signature,status:'pending',createdAt:now()};
   await store.mutate(data=>{if(data.offers.filter(r=>sameAddress(r.envelope.offer.licensee,address)).length>=100)fail('This wallet has reached its deployment offer limit.',429);return add(data,record);});return decorate(record);
  }
  if(method==='POST'&&route==='/policy-document'){
   const state=await readLicensingState(client,profile,body.brick),scope=Number(body.scope);
   if(!sameAddress(state.controller,address))fail('Only the controller may publish policy terms.',403);
   if(![1,2].includes(scope)||typeof body.terms!=='string'||body.terms.length>16000||textHash(body.terms)!==state.policies[scope].termsHash)fail('The document must match the policy saved on this Brick.');
   await store.mutate(data=>{data.policies[state.brick.toLowerCase()+':'+scope]={hash:textHash(body.terms),terms:body.terms};});return {saved:true};
  }
  const match=route.match(/^\/offers\/(0x[0-9a-f]{64})\/decision$/i);
  if(method==='POST'&&match)return store.mutate(async data=>{
   const record=data.offers.find(r=>r.id.toLowerCase()===match[1].toLowerCase());if(!record)fail('Offer not found.',404);
   const current=await decorate(record),e=record.envelope,controller=await read(e.brick,'controller');
   const creator=sameAddress(controller,address),licensee=sameAddress(e.offer.licensee,address);
   if(!creator&&!licensee)fail('This offer belongs to another wallet.',403);
   if(['licensed','revoked'].includes(current.status))fail('This offer already has an on-chain license.');
   if(body.action==='close'){
    if(current.ready&&current.status!=='cancelled')fail('Cancel the authorized offer on the Brick before closing it.');
    record.status=creator?'declined':'withdrawn';record.updatedAt=now();return record;
   }
   if(!creator)fail('Only the current Brick controller can approve or counter.',403);
   if(!['pending','approved'].includes(current.status)&&!(body.action==='counter'&&current.status==='cancelled'&&['pending','approved'].includes(record.status)))fail('This offer is no longer open.');
   if(body.action==='approve'){
    await validate(e);await signed(e,address,body.signature);record.controllerSignature=body.signature;record.status='approved';record.updatedAt=now();return record;
   }
   if(body.action==='counter'){
    if(current.ready)fail('Cancel this authorized offer on the Brick before countering it.');
    const next=await validate(body.envelope);
    if(!sameAddress(next.brick,e.brick)||!sameAddress(next.offer.licensee,e.offer.licensee)||next.offer.projectHash!==e.offer.projectHash)fail('A counter-offer must keep the same Brick, licensee and project.');
    await signed(next,address,body.signature);
    const counter=add(data,{id:offerId(next),envelope:next,controllerSignature:body.signature,status:'approved',parentId:record.id,createdAt:now()});record.status='countered';record.counterId=counter.id;return counter;
   }
   fail('Choose approve, counter or close.');
  });
  fail('Licensing endpoint not found.',404);
 }};
}
