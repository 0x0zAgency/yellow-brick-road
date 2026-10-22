'use strict';
/** Validate the live permission for each selected byte-identical preview asset.
 * A named application profile is not client authentication, DRM or legal-title proof.
 */
const HASH=/^0x[a-f0-9]{64}$/i,ADDRESS=/^0x[a-f0-9]{40}$/i;
const ZERO='0x'+'0'.repeat(40);
const SPEC={audio:{bit:1,index:1},artwork:{bit:2,index:2},lyrics:{bit:4,index:3}};
const lower=value=>String(value).toLowerCase();
function normalizeAuthorization(value){
 if(value==null)return null;
 if(value.format!=='ybr-player-onchain/v1'||value.chainId!==1337||!ADDRESS.test(value.factoryAddress||'')||
  !HASH.test(value.genesisHash||'')||!value.sources||typeof value.sources!=='object'||Array.isArray(value.sources))
  throw Error('Player permission proof must identify the configured Ganache factory and chain history.');
 const sources={};
 for(const [role,source] of Object.entries(value.sources)){
  if(!SPEC[role]||!ADDRESS.test(source?.brickAddress||'')||lower(source.brickAddress)===ZERO||
   !ADDRESS.test(source.controller||'')||lower(source.controller)===ZERO||!/^\d{1,20}$/.test(source.revision||'')||
   BigInt(source.revision)<1n||BigInt(source.revision)>18446744073709551615n)throw Error('Invalid per-file Player permission source.');
  sources[role]={brickAddress:source.brickAddress,controller:source.controller,revision:source.revision};
 }
 if(!sources.audio)throw Error('The Audio Preview requires its own on-chain permission.');
 return {format:value.format,chainId:1337,factoryAddress:value.factoryAddress,genesisHash:value.genesisHash,sources};
}
function validateGrant({source,role,sha256,state}){
 const spec=SPEC[role];
 return !!(spec&&source&&state?.enabled===true&&state.registered===true&&state.code&&state.code!=='0x'&&
  lower(state.controller)===lower(source.controller)&&String(state.revision)===source.revision&&
  (Number(state.permissions)&spec.bit)!==0&&lower(state.files?.[spec.index])==='0x'+lower(sha256));
}
function createPlayerPolicyReader({provider,factoryAddress,ethers}){
 const abi=['function contentPolicyEnabled() view returns (bool)','function controller() view returns (address)',
  'function contentRevision() view returns (uint64)','function effectivePlayerPermissions() view returns (uint8)',
  'function contentLocked() view returns (bool)',
  'function fileCommitments() view returns (bytes32,bytes32,bytes32,bytes32)'];
 async function check(record,role='audio'){
  if(!record?.authorization){
   // Legacy locally stored records carrying chain references are not silently promoted.
   const claimed=(record?.references||record?.bricks||[]).some(item=>item.address);
   return {allowed:!claimed,onChain:false,reason:claimed?'legacy-permission':'local-preview'};
  }
  try{
   const auth=normalizeAuthorization(record.authorization),source=auth.sources[role];
   if(!source)return {allowed:false,onChain:true,reason:'asset-not-authorized'};
   if(!factoryAddress)return {allowed:false,onChain:true,reason:'chain-unavailable'};
   if((await provider.getNetwork()).chainId!==1337)return {allowed:false,onChain:true,reason:'different-chain'};
   const genesis=await provider.getBlock(0),head=await provider.getBlock('latest');
   if(!genesis||!head)return {allowed:false,onChain:true,reason:'chain-unavailable'};
   if(lower(genesis.hash)!==lower(auth.genesisHash))return {allowed:false,onChain:true,reason:'different-chain'};
   if(lower(auth.factoryAddress)!==lower(factoryAddress))return {allowed:false,onChain:true,reason:'different-factory'};
   const factory=new ethers.Contract(factoryAddress,['function isBrick(address) view returns (bool)'],provider);
   const brick=new ethers.Contract(source.brickAddress,abi,provider),at={blockTag:head.number};
   const [code,registered,enabled,controller,revision,permissions,locked,files]=await Promise.all([
    provider.getCode(source.brickAddress,head.number),factory.isBrick(source.brickAddress,at),brick.contentPolicyEnabled(at),
    brick.controller(at),brick.contentRevision(at),brick.effectivePlayerPermissions(at),brick.contentLocked(at),brick.fileCommitments(at)
   ]);
   const asset=record.assets?.[role]||(role==='audio'?record.media:null);
   const allowed=validateGrant({source,role,sha256:asset?.sha256,state:{code,registered,enabled,controller,revision,permissions,files}});
   if(lower((await provider.getBlock(head.number)).hash)!==lower(head.hash)||lower((await provider.getBlock(0)).hash)!==lower(auth.genesisHash))return {allowed:false,onChain:true,reason:'chain-changed'};
   return {allowed,reason:allowed?'authorized':'permission-changed',onChain:true,contentLocked:locked,revision:String(revision),permissions:Number(permissions),brickAddress:source.brickAddress};
  }catch{return {allowed:false,onChain:true,reason:'verification-unavailable'};}
 }
 return {check};
}
module.exports={normalizeAuthorization,validateGrant,createPlayerPolicyReader};
