/** Exact original-file matches. Reuse is explicit, scoped to a live controller,
 * factory and chain history, and never copies or changes an existing Brick. */
import {parseEventLogs,sha256,stringToHex} from 'viem';
import {connectChain,verifyFactory,factoryAbi,policyAbi} from './chain-mint.js';
import {discoverWalletBricks,BRICK_READ_ABI,RECEIPT_READ_ABI} from './brick-viewer-model.js';
import {policyFileManifest,PLAYER_APPLICATION} from './content-policy.js';
const same=(a,b)=>String(a||'').toLowerCase()===String(b||'').toLowerCase();
const digest=media=>sha256(stringToHex(JSON.stringify(policyFileManifest(media))));
const stop=signal=>{if(signal?.aborted)throw new DOMException('Lookup canceled','AbortError');};
export function reuseMedia(assets,part,{composition=true}={}){
 const roles=part==='artwork'?['artwork']:part==='composition'?['lyrics']:['master','preview','project','metadata',...(!composition?['lyrics']:[])];
 return roles.filter(role=>assets[role]?.hash).map(role=>({role,byteLength:assets[role].size,integrity:{algorithm:'sha2-256',digest:'0x'+assets[role].hash}}));
}
export function matchesReusableFiles(candidate,part,media){
 if(!media.length||!candidate?.contentPolicy)return false;
 const file=media.find(f=>f.role===(part==='composition'?'lyrics':part));
 const anchor=part==='master'?candidate.contentHash:part==='artwork'?candidate.contentPolicy.files.artworkHash:candidate.contentPolicy.files.lyricsHash;
 return !!file&&same(anchor,file.integrity.digest)&&(part!=='artwork'||same(candidate.contentHash,file.integrity.digest))&&same(digest(media),candidate.contentPolicy.files.manifestDigest);
}
/** Changing a composition option does not turn an existing cover into a new
 * registration. Retain every selection whose owning file set still matches. */
export function retainMatchingReuse(selections,assets,{composition=true}={}){
 return Object.fromEntries(Object.entries(selections).filter(([part,candidate])=>
  (part!=='composition'||composition)&&matchesReusableFiles(candidate,part,reuseMedia(assets,part,{composition}))));
}
async function readPolicy(client,address){
 const read=name=>client.readContract({address,abi:policyAbi,functionName:name});
 const [enabled,revision,current,locked,permissions,permissionVersion,files]=await Promise.all(['contentPolicyEnabled','contentRevision','currentContentHash','contentLocked','effectivePlayerPermissions','playerPermissionVersion','fileCommitments'].map(read));
 if(!enabled)throw Error('This Brick has no verifiable file policy.');
 return {version:1,revision:String(revision),currentContentHash:current,locked,permissions:Number(permissions),permissionVersion:String(permissionVersion),files:Object.fromEntries(['manifestDigest','previewHash','artworkHash','lyricsHash'].map((key,i)=>[key,files[i]]))};
}
export async function findReusableBricks(options,dependencies={}){
 const {client,check}=await (dependencies.connect||connectChain)({...options,account:options.wallet});
 const genesisHash=(await client.getBlock({blockNumber:0n})).hash;
 const discovered=await (dependencies.discover||discoverWalletBricks)({client,factoryAddress:options.factoryAddress,wallet:options.wallet});
 const candidates=[];
 for(const brick of discovered.bricks){
  stop(options.signal);if(!brick.creatorIsController)continue;
  try{
   const contentPolicy=await readPolicy(client,brick.address);
   if(!same(contentPolicy.currentContentHash,brick.contentHash))continue;
   candidates.push({format:'ybr-reusable-brick/1',...brick,chainId:Number(options.chainId),factoryAddress:options.factoryAddress,genesisHash,contentPolicy:{...contentPolicy,controller:brick.controller}});
  }catch{/* Legacy or unavailable policies cannot authorize reuse. */}
 }
 await check();stop(options.signal);
 return {candidates,limited:discovered.limited||discovered.limitReached};
}
export async function verifyReusableBrick(candidate,options,{client}={}){
 if(candidate?.format!=='ybr-reusable-brick/1'||candidate.chainId!==Number(options.chainId)||!same(candidate.factoryAddress,options.factoryAddress)||!same(candidate.controller,options.wallet))throw Error('The selected Brick belongs to another wallet or network. Select it again.');
 if(!client)({client}=await connectChain({...options,account:options.wallet}));
 if(!same((await client.getBlock({blockNumber:0n})).hash,candidate.genesisHash))throw Error('The selected Brick belongs to a previous chain history.');
 const collection=await verifyFactory(client,options.factoryAddress),address=candidate.address;
 if(!await client.getBytecode({address}))throw Error('The selected Brick is no longer deployed.');
 const read=name=>client.readContract({address,abi:BRICK_READ_ABI,functionName:name});
 for(const [name,expected] of [['controller',options.wallet],['ipId',candidate.ipId],['contentHash',candidate.contentHash],['metadataDigest',candidate.metadataDigest],['metadataURI',candidate.metadataURI]]){
  const actual=await read(name);
  if(name==='metadataURI'?actual!==expected:!same(actual,expected))throw Error('The selected Brick changed. Review its files and rights again.');
 }
 const registered=await client.readContract({address:options.factoryAddress,abi:factoryAbi,functionName:'brickById',args:[candidate.ipId]});
 if(!same(registered,address)||!await client.readContract({address:options.factoryAddress,abi:factoryAbi,functionName:'isBrick',args:[address]}))throw Error('The selected Brick is not registered by this factory.');
 for(const [name,expected] of [['ownerOf',options.wallet],['brickForToken',address]])if(!same(await client.readContract({address:collection,abi:RECEIPT_READ_ABI,functionName:name,args:[BigInt(candidate.ipId)]}),expected))throw Error('The selected NFT receipt no longer belongs to this wallet.');
 const policy=await readPolicy(client,address);
 for(const key of ['revision','currentContentHash','locked','permissions','permissionVersion'])if(!same(policy[key],candidate.contentPolicy[key]))throw Error('The selected Brick permissions or files changed. Select it again.');
 if(JSON.stringify(policy.files)!==JSON.stringify(candidate.contentPolicy.files))throw Error('The selected Brick file commitments changed.');
 const receipt=await client.getTransactionReceipt({hash:candidate.transactionHash});
 const event=parseEventLogs({abi:factoryAbi,eventName:'BrickDeployed',logs:receipt.logs.filter(l=>same(l.address,options.factoryAddress))}).find(e=>same(e.args.brick,address)&&same(e.args.ipId,candidate.ipId)&&same(e.args.contentHash,candidate.contentHash));
 if(receipt.status!=='success'||!event)throw Error('The original Brick registration could not be verified.');
 return {candidate,collection,policy};
}
export async function verifyPacketReuse(packet,options,dependencies={}){
 const reused=[];
 for(const brick of packet.bricks.filter(b=>b.reuse)){
  if(!matchesReusableFiles(brick.reuse,brick.localId,brick.metadata.media))throw Error('Files changed after choosing an existing Brick. Select it again.');
  const {collection}=await verifyReusableBrick(brick.reuse,{...options,wallet:packet.account.address},dependencies),c=brick.reuse;
  reused.push({sourceId:brick.localId,role:brick.role,title:brick.metadata.title,reused:true,status:'verified',chainId:c.chainId,contractAddress:c.address,id:c.ipId,transactionHash:c.transactionHash,blockNumber:c.blockNumber,metadataDigest:c.metadataDigest,contentHash:c.contentHash,uri:c.metadataURI,nftContractAddress:collection,tokenId:BigInt(c.ipId).toString(),contentPolicy:c.contentPolicy});
 }
 return reused;
}
export function applyBrickReuse(bricks,selections={}){
 return bricks.map(brick=>{
  const candidate=selections[brick.localId];if(!candidate)return {...brick,metadata:{...brick.metadata,
   relationships:brick.metadata.relationships.map(relation=>selections[relation.target]?{...relation,targetBrick:selections[relation.target].address,factory:selections[relation.target].factoryAddress,metadataDigest:selections[relation.target].metadataDigest,authorization:'same-controller-reuse-reverified-at-mint'}:relation),
   extensions:{...brick.metadata.extensions,building:{...brick.metadata.extensions.building,members:brick.metadata.extensions.building.members.map(member=>selections[member.ref]?{...member,brickAddress:selections[member.ref].address,ipId:selections[member.ref].ipId,metadataDigest:selections[member.ref].metadataDigest}:member)}}}};
  if(!matchesReusableFiles(candidate,brick.localId,brick.metadata.media))throw Error('Attach the same files as the existing '+brick.role+' Brick, or clear its reuse selection.');
  const permissions=Object.fromEntries([['preview',1],['artwork',2],['lyrics',4]].map(([role,bit])=>[role,!!(candidate.contentPolicy.permissions&bit)]));
  return {...brick,reuse:candidate,metadata:{...brick.metadata,rights:{...brick.metadata.rights,player:{application:PLAYER_APPLICATION,permissions,status:'existing-onchain-policy'}},extensions:{...brick.metadata.extensions,contentPolicy:{...brick.metadata.extensions.contentPolicy,locked:candidate.contentPolicy.locked},reuse:{meaning:'Display labels only; existing metadata, credits, payouts and rights are unchanged.',brickAddress:candidate.address,metadataDigest:candidate.metadataDigest}}}};
 });
}
export const newUploadRoles=packet=>new Set(packet.bricks.filter(b=>!b.reuse).flatMap(b=>b.metadata.media.map(f=>f.role)));
