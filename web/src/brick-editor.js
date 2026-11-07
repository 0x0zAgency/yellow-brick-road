import {sha256,toHex} from 'viem';
import {parseRecoveryFile,recoverIpfsEntry} from './ipfs-recovery.js';
import {encryptAsset} from './road-encryption.js';
import {uploadEncryptedAsset,validCid} from './ipfs-upload.js';
import {loadBuildingIndex,saveBuildingRecord,scopeKey} from './release-buildings.js';

export const DETAIL_FIELDS=[['title','Title',1024],['description','Description',8000],['language','Language',128]];
export const MUSIC_FIELDS=[['release','Album / release'],['genre','Genre'],['bpm','BPM'],['key','Musical key'],['daw','Creation software']];
export const IDENTIFIER_FIELDS=['isrc','iswc','upc','isni','ipi'];
const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
const string=value=>value===null||value===undefined?'':String(value);
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
export function validateEditableMetadata(metadata){
 if(!record(metadata)||metadata.standard!=='0x0z-road-ip'||metadata.schemaVersion!=='1.0.0'||typeof metadata.title!=='string'||!Array.isArray(metadata.creators)||metadata.creators.length>64||!Array.isArray(metadata.media)||!record(metadata.provenance))throw Error('This metadata format is not supported by the Brick editor.');
 if(metadata.creators.some(c=>!record(c)||typeof c.name!=='string'||typeof c.role!=='string'))throw Error('This Brick has unsupported creator credits.');
 if(new TextEncoder().encode(JSON.stringify(metadata)).length>1024*1024)throw Error('This metadata document exceeds the 1 MiB editor limit.');
 return metadata;
}
export function brickDetails(metadata){
 validateEditableMetadata(metadata);
 return {title:metadata.title,description:string(metadata.description),language:string(metadata.language),
  creators:metadata.creators.map(c=>({name:c.name,role:c.role})),
  music:record(metadata.music)?Object.fromEntries(MUSIC_FIELDS.map(([key])=>[key,string(metadata.music[key])])):null,
  identifiers:Object.fromEntries(IDENTIFIER_FIELDS.map(key=>[key,string(metadata.identifiers?.[key])]))};
}
function checked(value,label,max=1024,required=false){
 if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw Error(label+' is invalid or too long.');
 if(required&&!value.trim())throw Error(label+' is required.');
 return value;
}
/** Only descriptive fields may change. Files, rights, splits, references and unknown extensions survive exactly. */
export function applyBrickDetails(metadata,draft){
 const before=brickDetails(metadata),next=structuredClone(metadata),changes=[];
 const put=(target,key,value,old,label)=>{if(value!==old){target[key]=value;changes.push({label,before:string(old),after:string(value)});}};
 for(const [key,label,max] of DETAIL_FIELDS)put(next,key,checked(draft[key],label,max,key==='title'),before[key],label);
 if(!Array.isArray(draft.creators)||draft.creators.length!==metadata.creators.length)throw Error('Existing creator identities must be preserved.');
 draft.creators.forEach((credit,i)=>{for(const key of ['name','role'])put(next.creators[i],key,checked(credit?.[key],'Credit '+(i+1)+' '+key,1024,true),before.creators[i][key],'Credit '+(i+1)+' '+key);});
 for(const key of IDENTIFIER_FIELDS){const value=checked(draft.identifiers?.[key],key.toUpperCase());if(value!==before.identifiers[key]){next.identifiers||={};put(next.identifiers,key,value,before.identifiers[key],key.toUpperCase());}}
 if(before.music){
  for(const [key,label] of MUSIC_FIELDS){
   const value=checked(draft.music?.[key],label);
   if(value===before.music[key])continue;
   if(key==='bpm'&&value!==''&&(!/^\d+(?:\.\d+)?$/.test(value)||Number(value)>1000))throw Error('BPM must be between 0 and 1000, or blank.');
   next.music[key]=key==='bpm'?(value===''?null:Number(value)):value||null;
   changes.push({label,before:before.music[key],after:value});
  }
 }
 return {metadata:next,changes};
}
export async function openBrickMetadata({review,kit,fetchImpl=fetch,signal}){
 const cid=review.metadataURI?.startsWith('ipfs://')?review.metadataURI.slice(7):'';
 if(!validCid(cid)||!/^0x[0-9a-f]{64}$/i.test(review.metadataDigest)||/^0x0+$/.test(review.metadataDigest))throw Error('This Brick needs encrypted IPFS metadata with a nonzero on-chain commitment to use the details editor.');
 const entry=kit.metadata.find(item=>item.cid===cid)||{kind:'metadata',role:'metadata',name:'brick-metadata.json',mime:'application/json',cid};
 const recovered=await recoverIpfsEntry({entry,key:kit.key,expectedPlaintextSha256:review.metadataDigest,fetchImpl,signal});
 if(recovered.bytes.byteLength>1024*1024)throw Error('This metadata document exceeds the 1 MiB editor limit.');
 let metadata;try{metadata=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(recovered.bytes));}catch{throw Error('The registered metadata is not valid JSON.');}
 return validateEditableMetadata(metadata);
}
export async function prepareBrickMetadata({metadata,draft,review,kit,fetchImpl=fetch,now=new Date().toISOString()}){
 const edited=applyBrickDetails(metadata,draft);
 if(!edited.changes.length)throw Error('There are no changes to save.');
 // Describe the revision using PROV-O; preserve existing provenance and original recording time.
 const prior=edited.metadata.provenance.revisions||[];
 if(!Array.isArray(prior)||prior.length>=1000)throw Error('This Brick has an unsupported revision history.');
 edited.metadata.provenance.revisions=[...prior,{'@context':{prov:'http://www.w3.org/ns/prov#'},'@type':'prov:Entity',
  'prov:wasRevisionOf':{'@id':review.metadataURI},'prov:generatedAtTime':{'@value':now,'@type':'http://www.w3.org/2001/XMLSchema#dateTime'},previousDigest:review.metadataDigest,previousVersion:review.metadataVersion,changedFields:edited.changes.map(c=>c.label)}];
 const bytes=new TextEncoder().encode(JSON.stringify(edited.metadata));
 if(bytes.byteLength>1024*1024)throw Error('Edited metadata exceeds the 1 MiB editor limit.');
 const digest=sha256(toHex(bytes)),encrypted=await encryptAsset(bytes,kit.key,{name:'brick-metadata',mime:'application/octet-stream'});
 const pinned=await uploadEncryptedAsset({entry:{bytes:encrypted.bytes,ciphertextSha256:encrypted.sha256},fetchImpl});
 const entry={kind:'metadata',role:'metadata',name:'brick-metadata.json',mime:'application/json',cid:pinned.cid,
  encryptedSha256:pinned.sha256,encryptedSize:pinned.size,originalSha256:digest.slice(2),originalSize:bytes.byteLength};
 const oldCid=review.metadataURI.slice(7),entries=kit.metadata.filter(item=>item.cid!==oldCid);
 const backup=parseRecoveryFile(JSON.stringify({...kit,metadata:[...entries,entry]}));
 return {metadata:edited.metadata,changes:edited.changes,uri:pinned.uri,digest,backup};
}
/** Only a confirmed descriptive update may advance a locally remembered Building member. */
export function refreshEditedBuilding(storage,review,current){
 if(scopeKey(review)!==scopeKey(current)||!same(review.brickAddress,current.brickAddress)||!same(review.ipId,current.ipId)||!same(review.contentHash,current.contentHash))throw Error('Edited Brick identity changed.');
 let count=0;
 for(const record of loadBuildingIndex(storage)){
  if(scopeKey(record)!==scopeKey(current))continue;
  let changed=false;
  const members=record.members.map(member=>{
   if(!same(member.address,review.brickAddress)||!same(member.ipId,review.ipId)||!same(member.metadataDigest,review.metadataDigest))return member;
   changed=true;return {...member,metadataDigest:current.metadataDigest};
  });
  if(changed){saveBuildingRecord(storage,{...record,members});count++;}
 }
 return count;
}
