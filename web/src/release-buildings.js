/** Contextual composition, not ownership or a license. References are reusable.
 * PROV-O is the export vocabulary; Road fields supply application roles/order.
 * A proposal is not a deployed YellowBrickBuilding contract.
 */
import {sha256,stringToHex} from 'viem';
export const BUILDING_TYPES=Object.freeze(['music-release','work-bundle','album','compilation']);
export const PART_LABELS=Object.freeze({master:'Recording / primary work',artwork:'Cover artwork',composition:'Songwriting / composition'});
export const FILE_LABELS=Object.freeze({master:'Master recording',preview:'Audio Preview',artwork:'Artwork file',lyrics:'Lyrics',project:'Project file',metadata:'Metadata sidecar'});
const hash=x=>/^0x[\da-f]{64}$/i.test(x||'');
const address=x=>/^0x[\da-f]{40}$/i.test(x||'')&&!/^0x0{40}$/i.test(x);
const lower=x=>String(x||'').toLowerCase();
const text=(x,max=512)=>typeof x==='string'&&x.length>0&&x.length<=max&&!/[\u0000-\u001f\u007f]/.test(x);
const need=(ok,message)=>{if(!ok)throw Error(message);};
export function createBuilding({id,type,name='',members=[]}){
 need(text(id)&&BUILDING_TYPES.includes(type)&&typeof name==='string'&&name.length<=1024,'Invalid building identity.');
 need(Array.isArray(members)&&members.length>0&&members.length<=256,'A building requires 1–256 explicit members.');
 const seen=new Set();
 const links=members.map((m,position)=>{
  need(m&&['brick','building'].includes(m.kind)&&text(m.ref)&&text(m.role,100)&&m.ref!==id,'Invalid building member.');
  need(!seen.has(m.kind+':'+m.ref),'Duplicate building member.');seen.add(m.kind+':'+m.ref);
  return {kind:m.kind,ref:m.ref,role:m.role,position,permission:'not-granted-by-membership'};
 });
 return {standard:'0x0z-road-building',schemaVersion:'1.1.0',id,type,name,members:links,context:{rights:'not-granted-by-membership'},
  status:'context-proposal-not-deployed',
  provenance:{'@context':{prov:'http://www.w3.org/ns/prov#'},'@id':id,'@type':'prov:Collection',
   'prov:hadMember':links.map(m=>({'@id':m.ref,'@type':m.kind==='building'?'prov:Collection':'prov:Entity'}))}};
}
/** References allow the same release in several albums without copying its Bricks. */
export function validateBuildingGraph(buildings){
 need(Array.isArray(buildings)&&buildings.length<=256,'Building graph exceeds its limit.');
 const nodes=new Map();
 for(const node of buildings){const checked=createBuilding(node);need(!nodes.has(checked.id),'Duplicate building identity.');nodes.set(checked.id,checked);}
 const visiting=new Set(),done=new Set();
 const visit=(id,depth=0)=>{
  need(depth<=32&&!visiting.has(id),'Cyclic or excessively deep building.');
  if(done.has(id)||!nodes.has(id))return;
  visiting.add(id);
  for(const member of nodes.get(id).members)if(member.kind==='building')visit(member.ref,depth+1);
  visiting.delete(id);done.add(id);
 };
 for(const id of nodes.keys())visit(id);
 return [...nodes.values()];
}
export function releaseProposal(bricks,{music=false,name='',createdAt='',account=''}={}){
 // Proposal scope is deliberately not a minted identity. Resolution uses the
 // actual root receipt, factory and genesis, never a title, album tag or image.
 const digest=bricks[0]?.metadata?.media?.[0]?.integrity?.digest||'no-source';
 const id='urn:ybr:building-proposal:'+encodeURIComponent(createdAt)+':'+lower(account)+':'+digest;
 return {...createBuilding({id,type:music?'music-release':'work-bundle',name,
  members:bricks.map(b=>({kind:'brick',ref:id+'#'+b.localId,role:b.localId}))}),
  root:'master',members:bricks.map((b,position)=>({kind:'brick',ref:b.localId,role:b.role,position,permission:'not-granted-by-membership'}))};
}
export function bindBuildingToBricks(bricks,building){
 return bricks.map(b=>({...b,metadata:{...b.metadata,extensions:{...b.metadata.extensions,
  building:{id:building.id,type:building.type,root:building.root,part:b.localId,
   members:building.members.map(m=>({ref:m.ref,kind:m.kind,position:m.position})),
   meaning:'context-only-no-rights-transfer'}}}}));
}
export const BUILDING_STORAGE_KEY='road:release-buildings:v1';
export const MAX_SAVED_BUILDINGS=200;
const MAX_STORED_BYTES=2*1024*1024;
export function scopeKey(scope){
 if(!Number.isSafeInteger(Number(scope?.chainId))||Number(scope.chainId)<=0||!address(scope?.factoryAddress)||!hash(scope?.genesisHash))return null;
 return `${Number(scope.chainId)}:${lower(scope.genesisHash)}:${lower(scope.factoryAddress)}`;
}
function recordId(scope,root){return 'urn:ybr:building:'+scopeKey(scope)+':'+lower(root);}
function packetRecordId(packet,mint,root){const id=recordId(mint,root);return packet.bricks.some(b=>b.localId==='master'&&b.reuse)?id+':'+sha256(stringToHex(packet.building.id)):id;}
function cleanRecord(record){
 if(!record||record.format!=='ybr-release-group/1'||!scopeKey(record)||!address(record.root)||
  !['music-release','work-bundle'].includes(record.type)||!(record.id===recordId(record,record.root)||record.id?.startsWith(recordId(record,record.root)+':')&&hash(record.id.slice(recordId(record,record.root).length+1)))||
  !Array.isArray(record.members)||record.members.length<1||record.members.length>16)return null;
 const seen=new Set(),roles=new Set(),members=[];
 for(const m of record.members){
  if(!m||!address(m.address)||!hash(m.ipId)||!hash(m.transactionHash)||!hash(m.metadataDigest)||
   !Object.hasOwn(PART_LABELS,m.part)||seen.has(lower(m.address))||roles.has(m.part)||
   !Array.isArray(m.files)||m.files.some(f=>!Object.hasOwn(FILE_LABELS,f))||new Set(m.files).size!==m.files.length)return null;
  seen.add(lower(m.address));roles.add(m.part);
  members.push({address:lower(m.address),ipId:lower(m.ipId),transactionHash:lower(m.transactionHash),metadataDigest:lower(m.metadataDigest),part:m.part,files:[...m.files]});
 }
 if(!members.some(m=>m.part==='master'&&m.address===lower(record.root)))return null;
 // Whitelist only identifiers and file ROLES. Never persist names, file names,
 // raw metadata, URI payloads, keys, credentials or approved media copies here.
 return {format:'ybr-release-group/1',id:record.id,type:record.type,chainId:Number(record.chainId),
  factoryAddress:lower(record.factoryAddress),genesisHash:lower(record.genesisHash),root:lower(record.root),
  evidence:'local-packet-association',members};
}
export function loadBuildingIndex(storage){
 try{
  const raw=storage?.getItem(BUILDING_STORAGE_KEY);if(!raw||raw.length>MAX_STORED_BYTES)return [];
  const values=JSON.parse(raw);if(!Array.isArray(values)||values.length>MAX_SAVED_BUILDINGS)return [];
  return [...new Map(values.map(cleanRecord).filter(Boolean).map(r=>[r.id,r])).values()];
 }catch{return [];}
}
export function saveBuildingRecord(storage,record){
 const checked=cleanRecord(record);need(checked,'Invalid release grouping.');
 const values=[checked,...loadBuildingIndex(storage).filter(r=>r.id!==checked.id)].slice(0,MAX_SAVED_BUILDINGS);
 const json=JSON.stringify(values);need(json.length<=MAX_STORED_BYTES,'Local building index is full. Export your packet to retain this grouping.');
 need(storage&&typeof storage.setItem==='function','Local storage is unavailable. Keep the exported JSON packet.');
 storage.setItem(BUILDING_STORAGE_KEY,json);return checked;
}
const digest=async value=>'0x'+[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
/** Resolve a real, confirmed packet only. Imported metadata is untrusted input.
 * A matching digest proves the submitted metadata bytes, NOT legal ownership or
 * an on-chain Building deployment. Live view matching is a separate requirement.
 */
export async function buildingFromPacket(packet,mint=packet?.onChainMint){
 need(packet&&mint?.simulated===false&&mint.status==='confirmed'&&scopeKey(mint),'A confirmed test-chain JSON packet with chain history is required.');
 need(['music-release','work-bundle','recording-session','creative-work-session'].includes(packet.building?.type),'Unsupported Building type in this mint packet.');
 need(Array.isArray(packet.bricks)&&packet.bricks.length>=1&&packet.bricks.length<=16&&Array.isArray(packet.building?.members),'No explicit release membership in this packet.');
 need(Array.isArray(mint.receipts)&&mint.receipts.length===packet.bricks.length,'Incomplete mint receipts cannot define a release grouping.');
 const members=[],roles=new Set();
 for(const b of packet.bricks){
  need(Object.hasOwn(PART_LABELS,b.localId)&&!roles.has(b.localId),'Invalid or duplicate release part.');roles.add(b.localId);
  need(packet.building.members.filter(m=>m.ref===b.localId).length===1,'Release membership does not match its parts.');
  const receipts=mint.receipts.filter(r=>r.sourceId===b.localId),r=receipts[0];
  need(receipts.length===1&&r.status==='verified'&&Number(r.chainId)===Number(mint.chainId)&&address(r.contractAddress)&&hash(r.id)&&hash(r.transactionHash)&&hash(r.metadataDigest),'Invalid member receipt.');
  if(b.reuse){
   const c=b.reuse;
   need(r.reused===true&&scopeKey(c)===scopeKey(mint)&&lower(c.address)===lower(r.contractAddress)&&lower(c.ipId)===lower(r.id)&&lower(c.metadataDigest)===lower(r.metadataDigest)&&lower(c.transactionHash)===lower(r.transactionHash),'Existing Brick reference does not match its verified receipt.');
   members.push({address:r.contractAddress,ipId:r.id,transactionHash:r.transactionHash,metadataDigest:r.metadataDigest,part:b.localId,files:[...new Set((b.metadata.media||[]).map(f=>f.role).filter(role=>Object.hasOwn(FILE_LABELS,role)))]});
   continue;
  }
  need(typeof r.metadataJson==='string'&&r.metadataJson.length<=1024*1024,'Original committed metadata is missing. Use the complete JSON packet.');
  need(lower(await digest(r.metadataJson))===lower(r.metadataDigest),'Packet metadata does not match its receipt commitment.');
  let metadata;try{metadata=JSON.parse(r.metadataJson);}catch{throw Error('Invalid committed metadata.');}
  need(JSON.stringify(metadata)===JSON.stringify(b.metadata),'Packet parts differ from the original committed metadata.');
  const building=metadata.extensions?.building;
  if(building){need(building.id===packet.building.id&&building.type===packet.building.type&&building.part===b.localId&&building.root==='master'&&
   JSON.stringify(building.members?.map(m=>m.ref))===JSON.stringify(packet.bricks.map(p=>p.localId)),'Conflicting committed building membership.');}
  members.push({address:r.contractAddress,ipId:r.id,transactionHash:r.transactionHash,metadataDigest:r.metadataDigest,part:b.localId,
   files:[...new Set((metadata.media||[]).map(f=>f.role).filter(role=>Object.hasOwn(FILE_LABELS,role)))]});
 }
 need(packet.building.members.length===members.length&&roles.has('master'),'Release membership must include the primary work exactly once.');
 // Legacy packets have an explicit session Building and local relationships.
 const primary=packet.bricks.find(b=>b.localId==='master');
 for(const part of ['artwork','composition'])if(roles.has(part))need(primary.metadata.relationships?.some(r=>r.target===part),'The primary work does not reference this release part.');
 const root=members.find(m=>m.part==='master').address;
 const type=packet.building.type==='music-release'||packet.building.type==='recording-session'?'music-release':'work-bundle';
 const record=cleanRecord({...mint,format:'ybr-release-group/1',id:packetRecordId(packet,mint,root),type,root,members});
 need(record,'Invalid release identity.');return record;
}
export function rowIdentity(row){
 const r=row.registration||row;
 return {address:lower(r.brickAddress||r.address||r.contractAddress),ipId:lower(r.ipId||r.id),
  transactionHash:lower(r.transactionHash),metadataDigest:lower(r.metadataDigest)};
}
function matches(row,member){const r=rowIdentity(row);return r.address===member.address&&r.ipId===member.ipId&&r.transactionHash===member.transactionHash&&r.metadataDigest===member.metadataDigest;}
/** Match against already-discovered on-chain records. No fetching or signing.
 * Shared membership produces references in each parent, never a transitive merge.
 * Unknown, stale, cross-history or unassociated Bricks remain standalone.
 */
export function rollupBuildings(rows,index,scope){
 const key=scopeKey(scope),groups=[],used=new Set(),locations=new Map();
 if(key)for(const raw of index){
  const record=cleanRecord(raw);if(!record||scopeKey(record)!==key)continue;
  const parts=record.members.map(member=>({member,row:rows.find(row=>matches(row,member))})).filter(p=>p.row);
  if(!parts.length)continue;
  const group={kind:'building',id:record.id,record,parts,rows:parts.map(p=>p.row),missing:record.members.length-parts.length};
  groups.push(group);
  for(const {row} of parts){const id=rowIdentity(row).address;used.add(id);if(!locations.has(id))locations.set(id,[]);locations.get(id).push(group);}
 }
 // Preserve newest-first input ordering while keeping complete buildings on a
 // page. The same artwork can appear under two releases; it doesn't fuse them.
 const output=[],emitted=new Set();
 for(const row of rows){const id=rowIdentity(row).address;
  if(!used.has(id)){output.push({kind:'brick',id,rows:[row],row});continue;}
  for(const group of locations.get(id))if(!emitted.has(group.id)){output.push(group);emitted.add(group.id);}
 }
 return output;
}
export function exportBuildingGraph(packet,mint){
 const building=packet.building;if(!building)return null;
 const known=new Map((mint?.receipts||[]).map(r=>[r.sourceId,r]));
 const scope=scopeKey(mint),root=known.get('master')?.contractAddress;
 const id=scope&&address(root)?packetRecordId(packet,mint,root):building.id||'urn:ybr:unregistered-release';
 const members=packet.bricks.map(b=>({kind:'brick',ref:scope&&address(known.get(b.localId)?.contractAddress)?
  'urn:ybr:brick:'+scope+':'+lower(known.get(b.localId).contractAddress):id+'#'+b.localId,role:b.localId}));
 return {...createBuilding({id,type:building.type==='music-release'||building.type==='recording-session'?'music-release':'work-bundle',name:building.name,members}),
  status:'context-proposal-not-deployed',files:packet.bricks.flatMap(b=>(b.metadata.media||[]).map(f=>({owner:members.find(m=>m.role===b.localId)?.ref,role:f.role,digest:f.integrity?.digest}))),
  externalReferences:packet.bricks.flatMap(b=>(b.metadata.relationships||[]).filter(r=>r.targetBrick).map(r=>({relation:r.type,brick:r.targetBrick,factory:r.factory,authorization:'separate-controller-evidence-required'})))};
}
