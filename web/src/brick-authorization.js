/** Client-side, cross-wallet authorizations for references to existing Bricks.
 * EIP-712 signatures are evidence of consent for a narrowly scoped relationship.
 * They do NOT create an on-chain link or grant blanket distribution rights.
 */
import {isAddress,isHex,parseAbi,verifyTypedData,keccak256,stringToHex} from 'viem';
export const LINK_RELATIONS=[
 {value:'cover-art',label:'Cover artwork for release'},
 {value:'embodies-composition',label:'Composition used by recording'},
 {value:'lyrics',label:'Lyrics referenced by recording'},
 {value:'references',label:'Other referenced IP work'}
];
const RELATIONS=new Set(LINK_RELATIONS.map(r=>r.value));
export const LINK_BRICK_ABI=parseAbi(['function controller() view returns (address)','function ipId() view returns (bytes32)']);
export const LINK_FACTORY_ABI=parseAbi(['function isBrick(address) view returns (bool)']);
export const LINK_TYPES={LinkApproval:[
 {name:'requester',type:'address'},
 {name:'sourceCommitment',type:'bytes32'},
 {name:'targetBrick',type:'address'},
 {name:'targetIpId',type:'bytes32'},
 {name:'factory',type:'address'},
 {name:'relation',type:'string'},
 {name:'scope',type:'string'},
 {name:'nonce',type:'bytes32'},
 {name:'deadline',type:'uint256'}
]};
const safeHash=v=>typeof v==='string'&&isHex(v,{strict:true})&&/^0x[\da-fA-F]{64}$/.test(v);
const compactText=(v,max=250)=>typeof v==='string'?v.trim().slice(0,max):'';
export const LINK_STANDARD='road-link-approval-v1';
export function normalizeLinkRequest(raw){
 const req=raw?.request||raw;
 if(!req||req.standard!==LINK_STANDARD)throw Error('Unsupported link request version.');
 if(!Number.isSafeInteger(req.chainId)||req.chainId<=0)throw Error('Invalid link request chain.');
 for(const k of ['requester','targetBrick','factory'])if(!isAddress(req[k]||''))throw Error('Invalid link request '+k+'.');
 for(const k of ['sourceCommitment','targetIpId','nonce'])if(!safeHash(req[k]))throw Error('Invalid link request '+k+'.');
 if(!RELATIONS.has(req.relation))throw Error('Unknown link relationship.');
 if(!compactText(req.scope)||req.scope.length>250)throw Error('A short, explicit usage scope is required.');
 if(!Number.isSafeInteger(req.deadline)||req.deadline<=0)throw Error('Invalid expiration.');
 return {standard:LINK_STANDARD,chainId:req.chainId,requester:req.requester,sourceCommitment:req.sourceCommitment,
 targetBrick:req.targetBrick,targetIpId:req.targetIpId,factory:req.factory,relation:req.relation,
 scope:req.scope,nonce:req.nonce,deadline:req.deadline};
}
export function newLinkRequest({chainId,requester,sourceCommitment,targetBrick,targetIpId,factory,relation,scope,deadline}){
 const nonce='0x'+[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
 return normalizeLinkRequest({standard:LINK_STANDARD,chainId,requester,sourceCommitment,targetBrick,targetIpId,factory,relation,scope,nonce,deadline});
}
export function typedLinkData(request){
 const req=normalizeLinkRequest(request);
 return {domain:{name:'Yellow Brick Road Link',version:'1',chainId:req.chainId,verifyingContract:req.targetBrick},
 types:LINK_TYPES,primaryType:'LinkApproval',message:{
 requester:req.requester,sourceCommitment:req.sourceCommitment,targetBrick:req.targetBrick,targetIpId:req.targetIpId,
 factory:req.factory,relation:req.relation,scope:req.scope,nonce:req.nonce,deadline:BigInt(req.deadline)}};
}
export function linkRequestDigest(request){
 const req=normalizeLinkRequest(request);
 return keccak256(stringToHex(JSON.stringify(req)));
}
export function decodeLinkPackage(input){
 if(typeof input!=='string'||input.length>20000)throw Error('Link approval JSON must be shorter than 20 KB.');
 try{return JSON.parse(input)}catch{throw Error('Invalid link approval JSON.');}
}
export async function checkLinkedBrick(client,request){
 const req=normalizeLinkRequest(request);
 const currentChain=await client.getChainId();
 if(currentChain!==req.chainId)throw Error('Switch wallet/RPC to chain '+req.chainId+' before validating.');
 if(req.deadline<=Math.floor(Date.now()/1000))throw Error('Link authorization expired.');
 if(req.deadline>Math.floor(Date.now()/1000)+90*86400)throw Error('Link authorization cannot exceed 90 days.');
 const targetCode=await client.getBytecode({address:req.targetBrick});
 const factoryCode=await client.getBytecode({address:req.factory});
 if(!targetCode||targetCode==='0x')throw Error('Referenced Brick contract is not deployed.');
 if(!factoryCode||factoryCode==='0x')throw Error('Referenced factory is not deployed.');
 const [registered,owner,ipId]=await Promise.all([
 client.readContract({address:req.factory,abi:LINK_FACTORY_ABI,functionName:'isBrick',args:[req.targetBrick]}),
 client.readContract({address:req.targetBrick,abi:LINK_BRICK_ABI,functionName:'controller'}),
 client.readContract({address:req.targetBrick,abi:LINK_BRICK_ABI,functionName:'ipId'})]);
 if(!registered)throw Error('Referenced address is not registered by this YellowBrickFactory.');
 if(ipId.toLowerCase()!==req.targetIpId.toLowerCase())throw Error('Referenced IP identity changed or does not match.');
 if(!isAddress(owner))throw Error('Referenced Brick has no valid controller.');
 return {controller:owner,ipId};
}
export function buildLinkResponse(request,signature,controller){
 const req=normalizeLinkRequest(request);
 if(!isHex(signature)||signature.length<132)throw Error('Invalid wallet signature.');
 if(!isAddress(controller))throw Error('Invalid controller.');
 return {standard:'road-link-signature-v1',request:req,signature,controller,requestDigest:linkRequestDigest(req)};
}
export async function verifyLinkResponse(client,request,response){
 const req=normalizeLinkRequest(request);
 if(response?.standard!=='road-link-signature-v1'||linkRequestDigest(response.request)!==linkRequestDigest(req))
  throw Error('Approval belongs to a different request.');
 if(response.requestDigest!==linkRequestDigest(req))throw Error('Approval request digest mismatch.');
 if(!isHex(response.signature)||!isAddress(response.controller))throw Error('Invalid signature format.');
 const {controller}=await checkLinkedBrick(client,req);
 if(controller.toLowerCase()!==response.controller.toLowerCase())throw Error('Referenced Brick controller has changed; request fresh consent.');
 const data=typedLinkData(req);
 const valid=await client.verifyTypedData({address:controller,...data,signature:response.signature});
 if(!valid)throw Error('Referenced Brick controller signature does not validate.');
 return {status:'verified-current-controller',controller,request:req,signature:response.signature};
}

/** Reverify consent immediately before any wallet-signed mint. */
export async function preflightLinkedBricks({client,account,chainId,sourceHash,links}){
 if(!links?.length)return [];
 const results=[];
 for(const link of links){
  if(!link.request||!link.response)throw Error('Owner approval missing for '+link.relation+' ('+link.targetBrick+').');
  const request=normalizeLinkRequest(link.request);
  if(request.chainId!==chainId||request.requester.toLowerCase()!==account.toLowerCase())
   throw Error('Link request belongs to another chain or requester.');
  if(request.sourceCommitment.toLowerCase()!==('0x'+sourceHash).toLowerCase())
   throw Error('Source file changed since the Brick link was authorized.');
  if(request.targetBrick.toLowerCase()!==link.targetBrick.toLowerCase()||
   request.factory.toLowerCase()!==link.factory.toLowerCase()||
   request.relation!==link.relation||request.scope!==link.scope)
   throw Error('Linked Brick changed after the owner signed. Request new approval.');
  results.push(await verifyLinkResponse(client,request,link.response));
 }
 return results;
}
