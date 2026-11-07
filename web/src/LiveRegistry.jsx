import {displayWorkTitle} from './work-titles.js';
import RoadProgress from './RoadProgress.jsx';
import {ACTIVE_NETWORK,activeRpcUrl} from './active-network.js';
import {useBuildingRollup,ReleaseBuildingCard,ImportBuildingPacket} from './ReleaseBuildingCard.jsx';
import {createPublicClient,http} from 'viem';
import {RegistrationThumbnail,StatusPill,CollectionPager} from './BrickPresentation.jsx';
import {localThumbnailRpc,shortId} from './brick-presentation.js';
import {useEffect,useMemo,useRef,useState} from 'react';
import CopyField from './CopyField.jsx';
import LicensingContactEditor from './LicensingContactEditor.jsx';
import {fetchRegistry} from './registry-client.js';
import {Bookmark,CheckCircle2,AlertCircle} from 'lucide-react';
import {RegistrySearch,RegistryWorkDetails} from './RegistrySearch.jsx';
import {SEARCH_DEFAULTS,readShortlist,toggleShortlist,registrationKey,searchRegistryItems,matchesRegistrySearch,publicWorkTypeLabel,validateSearch,SHORTLIST_KEY} from './registry-search.js';
import './live-registry.css';

export default function LiveRegistry({wallet,onMint,onWallet,children}){
 const [examples,setExamples]=useState(false),[data,setData]=useState(null),[error,setError]=useState('');
 const [busy,setBusy]=useState(false),[checked,setChecked]=useState('');
 const [page,setPage]=useState(0),[filters,setFilters]=useState({...SEARCH_DEFAULTS}),[purpose,setPurpose]=useState('explore'),[view,setView]=useState('grid'),[selected,setSelected]=useState('');
 const loadSaved=()=>{try{return readShortlist(localStorage);}catch{return [];}};
 const [shortlist,setShortlist]=useState(loadSaved),[saveError,setSaveError]=useState('');
 useEffect(()=>{const sync=e=>{if(e.key===SHORTLIST_KEY||e.key===null)setShortlist(loadSaved());};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[]);
 const changeFilters=value=>{setFilters(value);setPage(0);};
 const save=brick=>{try{setShortlist(toggleShortlist(localStorage,registrationKey(brick,data.network)));setSaveError('');}catch(e){setSaveError(e.message.includes('shortlist is full')?e.message:'Could not save the shortlist on this device. Check browser storage permissions.');}};

 const rpc=localThumbnailRpc(ACTIVE_NETWORK?activeRpcUrl():data?.network?.rpcUrl);
 const client=useMemo(()=>rpc?createPublicClient({transport:http(rpc,{timeout:5000,retryCount:0})}):null,[rpc]);
 const refresh=useRef(()=>{});
 useEffect(()=>{
  let alive=true,inFlight=false,controller;
  const load=async()=>{
   if(!alive||inFlight||document.hidden)return;
   inFlight=true;controller=new AbortController();setBusy(true);
   const timeout=setTimeout(()=>controller.abort(),30000);
   try{
    const next=await fetchRegistry({signal:controller.signal});
    if(alive){setData(next);setError('');setChecked(new Date().toLocaleTimeString());}
   }catch(e){if(alive){setData(null);setSelected('');setError(e.name==='AbortError'?'Registry scan timed out. Check the local services and retry.':e.message);}}
   finally{clearTimeout(timeout);inFlight=false;if(alive)setBusy(false);}
  };
  refresh.current=load;void load();
  const timer=setInterval(()=>void load(),5000);
  const focus=()=>{if(!document.hidden)void load();};
  document.addEventListener('visibilitychange',focus);window.addEventListener('focus',focus);
  return()=>{alive=false;clearInterval(timer);controller?.abort();document.removeEventListener('visibilitychange',focus);window.removeEventListener('focus',focus);refresh.current=()=>{};};
 },[]);
 const {items,rows:titledRows}=useBuildingRollup({rows:data?.bricks||[],client,chainId:data?.network?.chainId,factoryAddress:data?.network?.factoryAddress,anchor:data?.head,wallet});
 const context={wallet,shortlist,network:data?.network};
 // Retain the Building's associated parts when one work matches the search.
 const shown=searchRegistryItems(items,filters,context);
 const matching=titledRows.filter(brick=>matchesRegistrySearch(brick,filters,context)).length;
 const savedCount=(data?.bricks||[]).filter(brick=>shortlist.includes(registrationKey(brick,data.network))).length;
 const selectedBrick=titledRows.find(brick=>registrationKey(brick,data.network)===selected);
 useEffect(()=>{if(data&&selected&&!selectedBrick)setSelected('');},[data,selected,selectedBrick]);
 const pages=Math.max(1,Math.ceil(shown.length/12)),currentPage=Math.min(page,pages-1);
 const waiting=busy||(!data&&!error);
 const statusLabel=waiting?(data?'Updating registry…':'Loading registry…'):error?'Registry unavailable':'Registry up to date';
 const renderPart=brick=>{const r=brick.registration,title=displayWorkTitle(brick);return <article className="br-record" key={r.chainId+':'+r.factoryAddress+':'+r.brickAddress}>
     <div className="br-record-header"><RegistrationThumbnail client={client} anchor={data.head} title={title} identity={{chainId:r.chainId,factoryAddress:r.factoryAddress,brickAddress:r.brickAddress,ipId:r.ipId,originator:r.originator}}/>
      <div className="br-record-copy"><span className="br-kicker">ON-CHAIN BRICK · BLOCK {r.blockNumber}</span><h3>{title}</h3><StatusPill tone={brick.streamAllowed?'success':'neutral'}>{brick.streamAllowed?'Public playback available':'Registered · private media'}</StatusPill>
       <p>{brick.workTitleSource==='local'?'Work title from this device':brick.source==='road-registry'?'Public title not disclosed':brick.creator}</p><span className="rs-card-type">{publicWorkTypeLabel(brick)}</span>
      </div>
     </div>
     <div className="br-record-footer"><small title={r.brickAddress}>{shortId(r.brickAddress)}</small>{brick.streamAllowed?<a className="text-action" href="//127.0.0.1:4173/" target="_blank" rel="noreferrer">Open YBR Player ↗</a>:<span className="br-heading-count">Registration ≠ playback permission</span>}</div>
     <div className="rs-result-actions"><button type="button" className="text-action" onClick={()=>setSelected(registrationKey(brick,data.network))}>Explore this IP →</button><button type="button" className="quiet" aria-label={'Shortlist '+title} aria-pressed={shortlist.includes(registrationKey(brick,data.network))} onClick={()=>save(brick)}><Bookmark size={16}/></button></div>
     <details><summary>Licensor contact</summary><div className="br-details"><LicensingContactEditor wallet={wallet} client={client} chainId={r.chainId} factoryAddress={r.factoryAddress} brickAddress={r.brickAddress}/></div></details>
     <details><summary>On-chain details &amp; commitments</summary><div className="br-details">
      <p>{brick.source==='road-registry'?'A title and work type cannot be inferred from a commitment or encrypted metadata. The contract below is the authoritative identity.':brick.description}</p>
      <dl>{[[r.brickAddress,'Brick contract','Registered Brick contract'],[brick.id,'IP identity','Registered IP identity'],[r.originator,'Originator','Registered originator'],[r.controller,'Current controller','Registered controller'],[r.metadataURI,'Metadata reference (not automatically opened)','Registered metadata reference'],[r.metadataDigest,'Metadata commitment','Registered metadata commitment'],[r.contentHash,'Content commitment','Registered content commitment'],[r.transactionHash,'Mint transaction','Registered mint transaction']].map(([value,label,copy])=><div key={label}><dt>{label}</dt><dd><CopyField label={copy} value={value}/></dd></div>)}</dl>
     </div></details>
    </article>};
 return <section className="lr br-collection" aria-label="IP Registry">
  <div className="registry-bar"><div className="tabs">
   <button type="button" className={!examples?'active':''} onClick={()=>setExamples(false)}>On-chain registrations</button>
   <button type="button" className={examples?'active':''} onClick={()=>setExamples(true)}>Local drafts &amp; examples</button>
  </div>{!examples&&<button type="button" className="quiet" disabled={busy} onClick={()=>void refresh.current()}>Refresh registry</button>}</div>
  {examples?children:<>
   <p className="lr-boundary">Discover registered works, review their public information and start a conversation with the licensor.</p>
   <details className="lr-network br-surface"><summary><span>{data?.network?.label||ACTIVE_NETWORK?.label||'Selected network'} · chain {data?.network?.chainId||ACTIVE_NETWORK?.chainId||'connecting'}</span><StatusPill tone={data?'success':'warning'}>{data?data.bricks.length+' registrations':'Connecting'}</StatusPill></summary><div className="br-surface-body">
    {data&&<><CopyField label="Registry factory" value={data.network.factoryAddress}/><small>RPC: {data.network.rpcUrl||'Active network through the local read-only proxy'}</small><small>Blocks {data.fromBlock}–{data.head.number} · checked {checked} · refreshes every 5 seconds</small></>}
    <p>Use Dev Control to change the active blockchain. <button type="button" className="text-action" onClick={onWallet}>Open My Bricks for the connected creator</button>.</p>
   </div></details>
   <div className="lr-status" role="group" data-state={waiting?(data?'refreshing':'loading'):error?'error':'ready'} aria-label="Registry status">
    <span className="lr-status-indicator">{waiting?<RoadProgress size="tiny" hideLabel label={statusLabel}/>:error?<AlertCircle size={20} aria-hidden="true"/>:<CheckCircle2 size={20} aria-hidden="true"/>}</span>
    <div className="lr-status-copy" role={error&&!waiting?'alert':undefined} tabIndex={error&&!waiting?0:undefined}>
     <strong>{statusLabel}</strong><span>{error&&!waiting?<>{error} The registry is unavailable, not empty.</>:checked?'Last updated '+checked+' · Refreshes automatically': 'Reading registered works…'}</span>
    </div>
   </div>
   {data&&<>
    {(data.limited||data.limitReached)&&<p className="wb-warning">Partial scan: {data.matchingEvents} matching events in the scanned range; up to 200 newest registrations are shown. This is not a complete historical index.</p>}
    <RegistrySearch filters={filters} onChange={changeFilters} purpose={purpose} onPurpose={setPurpose} rows={data.bricks} shortlistCount={savedCount} wallet={wallet} view={view} onView={setView}/>
    {saveError&&<p className="rs-error" role="alert">{saveError}</p>}
    <div className="rs-summary" role="status"><strong>{matching} matching work{matching===1?'':'s'} · {shown.length} result{shown.length===1?'':'s'}</strong><span>{data.bricks.length} registrations indexed · {data.bricks.filter(b=>b.streamAllowed).length} public previews</span></div>
    {shown.some(item=>item.kind==='building')&&<p className="rs-hint">Matching works keep their Building’s related parts together.</p>}
    <ImportBuildingPacket rows={data.bricks} client={client} chainId={data.network.chainId} factoryAddress={data.network.factoryAddress}/>
    <div className={"br-grid"+(view==='list'?' rs-list':'')}>{shown.slice(currentPage*12,currentPage*12+12).map(item=>item.kind==='building'?<ReleaseBuildingCard key={item.id} group={item} client={client} chainId={data.network.chainId} factoryAddress={data.network.factoryAddress} anchor={data.head} renderPart={renderPart}/>:renderPart(item.row))}</div>
    <CollectionPager page={currentPage} pages={pages} total={shown.length} onPage={setPage}/>
    {!shown.length&&!validateSearch(filters)&&<div className="empty"><strong>{data.bricks.length?'No works match these filters.':'No confirmed registrations in this factory’s scanned range.'}</strong>
     <p>{filters.shortlisted?'Save works to your shortlist using the bookmark button. Only works in the current scan appear here.':data.bricks.length?'Try a broader search or include works whose type is not disclosed.':'Check the active network and registry factory.'}</p>{data.bricks.length?<button type="button" className="quiet" onClick={()=>changeFilters({...SEARCH_DEFAULTS})}>Reset search</button>:<button type="button" className="gold-btn" onClick={onMint}>Open Mint Studio</button>}</div>}
    {selectedBrick&&<RegistryWorkDetails key={selected} brick={selectedBrick} network={data.network} client={client} anchor={data.head} purpose={purpose} saved={shortlist.includes(selected)} saveError={saveError} onSave={()=>save(selectedBrick)} onClose={()=>setSelected('')}/>}
   </>}
   <p className="lr-boundary">Search covers this factory’s scanned registrations. A public preview grants no reuse rights; licensing or purchase requires agreed terms. Shortlists stay in this browser.</p>
  </>}
 </section>;
}
