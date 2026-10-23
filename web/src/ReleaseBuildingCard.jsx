import {useEffect,useMemo,useRef,useState} from 'react';
import {Layers,FolderOpen} from 'lucide-react';
import {RegistrationThumbnail,StatusPill} from './BrickPresentation.jsx';
import {shortId} from './brick-presentation.js';
import {FILE_LABELS,PART_LABELS,loadBuildingIndex,rollupBuildings,saveBuildingRecord,scopeKey,buildingFromPacket} from './release-buildings.js';

export const BUILDING_EVENT='ybr:release-buildings-changed';
export async function rememberMintBuilding(packet,mint){
 const record=await buildingFromPacket(packet,mint);
 saveBuildingRecord(window.localStorage,record);
 window.dispatchEvent(new Event(BUILDING_EVENT));
 return record;
}
/** Local display associations are usable only against the current verified scan.
 * They never become proof of copyright, a license, or a deployed Building.
 */
export function useBuildingRollup({rows,client,chainId,factoryAddress,anchor}){
 const [index,setIndex]=useState(()=>{try{return loadBuildingIndex(globalThis.localStorage);}catch{return [];}}),[history,setHistory]=useState(null);
 useEffect(()=>{
  const refresh=()=>{try{setIndex(loadBuildingIndex(globalThis.localStorage));}catch{setIndex([]);}};
  window.addEventListener(BUILDING_EVENT,refresh);window.addEventListener('storage',refresh);
  return()=>{window.removeEventListener(BUILDING_EVENT,refresh);window.removeEventListener('storage',refresh);};
 },[]);
 const context=JSON.stringify([chainId,factoryAddress,anchor?.hash,rows.map(r=>[r.registration?.transactionHash||r.transactionHash,r.registration?.metadataDigest||r.metadataDigest])]);
 useEffect(()=>{
  let alive=true;setHistory(null);
  if(client&&rows.length&&index.length)void (async()=>{
   const [actual,genesis]=await Promise.all([client.getChainId(),client.getBlock({blockNumber:0n})]);
   if(Number(actual)!==Number(chainId))return;
   if(anchor?.hash){const block=await client.getBlock({blockNumber:BigInt(anchor.number)});if(block.hash?.toLowerCase()!==anchor.hash.toLowerCase())return;}
   if(alive)setHistory({context,scope:{chainId:Number(actual),factoryAddress,genesisHash:genesis.hash}});
  })().catch(()=>{/* Missing history disables grouping, never hides registrations. */});
  return()=>{alive=false;};
 },[client,context,index.length]);
 const scope=history?.context===context?history.scope:null;
 const items=useMemo(()=>rollupBuildings(rows,index,scope),[rows,index,scope]);
 return {items,scope,index};
}
export function FileRoleChips({roles=[]}){
 if(!roles.length)return null;
 return <div className="br-file-chips" aria-label="Files associated with this Brick">{roles.map(role=><span key={role}>{FILE_LABELS[role]||role}</span>)}</div>;
}
export function ReleaseBuildingCard({group,client,chainId,factoryAddress,anchor,renderPart}){
 const {record,parts,missing}=group;
 const root=parts.find(p=>p.member.part==='master')||parts[0];
 const r=root.row.registration||root.row;
 const title=root.row.source!=='road-registry'&&root.row.title&&root.member.part==='master'?root.row.title:
  (record.type==='music-release'?'Music release ':'Work bundle ')+shortId(record.root);
 return <article className="br-building" aria-label={title} data-building-id={record.id}>
  <div className="br-building-header"><RegistrationThumbnail client={client} anchor={anchor} title={title}
   identity={{chainId,factoryAddress,brickAddress:r.brickAddress||r.address,ipId:r.ipId,originator:r.originator,collection:r.nftContractAddress,tokenId:r.tokenId}}/>
   <div className="br-record-copy"><span className="br-kicker"><Layers size={12}/> {record.type==='music-release'?'RELEASE BUILDING':'WORK BUILDING'}</span><h3>{title}</h3>
    <div className="br-badges"><StatusPill>{record.members.length} associated Bricks</StatusPill><StatusPill>{record.members.reduce((n,m)=>n+m.files.length,0)} file roles</StatusPill></div>
   </div></div>
  <p className="br-building-map">{record.members.map(m=>PART_LABELS[m.part]).join(' · ')}</p>
  <p className="br-building-note">Packet association · member identities checked against this chain. Not a deployed Building or shared rights grant.</p>
  {missing>0&&<p className="br-warning">{parts.length} of {record.members.length} members match this scan. Others may be outside its range or have updated metadata.</p>}
  <details className="br-building-parts"><summary><FolderOpen size={16}/><span>Explore release parts</span><small>{parts.length} in this view</small></summary>
   <div className="br-building-children">{parts.map(({member,row})=><div className="br-building-part" key={member.address}><FileRoleChips roles={member.files}/>{renderPart(row)}</div>)}</div>
  </details>
 </article>;
}
/** The selected JSON is parsed locally; only minimal association identifiers are
 * retained. It is not sent to the Player, IPFS, an identity service or a wallet.
 */
export function ImportBuildingPacket({rows,client,chainId,factoryAddress}){
 const input=useRef(null),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),revision=useRef(0);
 const context=JSON.stringify([chainId,factoryAddress,rows.map(r=>r.registration?.transactionHash||r.transactionHash)]);
 useEffect(()=>{revision.current++;setBusy(false);setStatus('');},[context]);
 useEffect(()=>()=>{revision.current++;},[]);
 const read=async event=>{
  const file=event.target.files?.[0];event.target.value='';if(!file||busy||!client)return;
  const id=++revision.current;setBusy(true);setStatus('Checking the local packet…');
  try{
   if(file.size>5*1024*1024)throw Error('Use a complete JSON mint packet under 5 MiB, not a private recovery backup.');
   const packet=JSON.parse(await file.text()),record=await buildingFromPacket(packet);
   const [actual,genesis]=await Promise.all([client.getChainId(),client.getBlock({blockNumber:0n})]);
   const scope={chainId:actual,factoryAddress,genesisHash:genesis.hash};
   if(Number(actual)!==Number(chainId)||scopeKey(scope)!==scopeKey(record))throw Error('This packet belongs to another chain history or factory. Switch to its original profile first.');
   if(!rollupBuildings(rows,[record],scope).some(g=>g.kind==='building'))throw Error('No packet member matches the verified registrations in this scan. Refresh or select the original factory.');
   if(id!==revision.current)return;
   saveBuildingRecord(window.localStorage,record);window.dispatchEvent(new Event(BUILDING_EVENT));setStatus('Release grouping restored locally. No files uploaded and no rights changed.');
  }catch(error){if(id===revision.current)setStatus(error instanceof SyntaxError?'That file is not a valid JSON mint packet.':error.message);}
  finally{if(id===revision.current)setBusy(false);}
 };
 return <div className="br-building-import"><button type="button" className="text-action" disabled={busy||!client||!rows.length} onClick={()=>input.current?.click()}>{busy?'Checking packet…':'Restore grouping from JSON packet'}</button>
  <input ref={input} type="file" accept="application/json,.json" aria-label="Import release grouping packet" hidden onChange={event=>void read(event)}/>
  <small>Earlier mints stay separate until their explicit packet association is available. No title or cover matching.</small>
  {status&&<p role="status">{status}</p>}
 </div>;
}
