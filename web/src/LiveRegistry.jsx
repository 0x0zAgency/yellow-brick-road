import {ACTIVE_NETWORK} from './active-network.js';
import {useBuildingRollup,ReleaseBuildingCard,ImportBuildingPacket} from './ReleaseBuildingCard.jsx';
import {createPublicClient,http} from 'viem';
import {RegistrationThumbnail,StatusPill,CollectionPager} from './BrickPresentation.jsx';
import {localThumbnailRpc,shortId} from './brick-presentation.js';
import {useEffect,useMemo,useRef,useState} from 'react';
import CopyField from './CopyField.jsx';
import {fetchRegistry} from './registry-client.js';
import './live-registry.css';

export default function LiveRegistry({wallet,onMint,onWallet,children}){
 const [examples,setExamples]=useState(false),[data,setData]=useState(null),[error,setError]=useState('');
 const [busy,setBusy]=useState(false),[query,setQuery]=useState(''),[mine,setMine]=useState(false),[checked,setChecked]=useState('');
 const [page,setPage]=useState(0);
 const rpc=localThumbnailRpc(data?.network?.rpcUrl);
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
   }catch(e){if(alive){setData(null);setError(e.name==='AbortError'?'Registry scan timed out. Check the local services and retry.':e.message);}}
   finally{clearTimeout(timeout);inFlight=false;if(alive)setBusy(false);}
  };
  refresh.current=load;void load();
  const timer=setInterval(()=>void load(),5000);
  const focus=()=>{if(!document.hidden)void load();};
  document.addEventListener('visibilitychange',focus);window.addEventListener('focus',focus);
  return()=>{alive=false;clearInterval(timer);controller?.abort();document.removeEventListener('visibilitychange',focus);window.removeEventListener('focus',focus);refresh.current=()=>{};};
 },[]);
 const q=query.trim().toLowerCase();
 const {items}=useBuildingRollup({rows:data?.bricks||[],client,chainId:data?.network?.chainId,factoryAddress:data?.network?.factoryAddress,anchor:data?.head});
 const matches=b=>{const r=b.registration;return (!mine||!wallet||r.originator.toLowerCase()===wallet.toLowerCase())&&(!q||[b.title,b.id,r.brickAddress,r.originator,r.controller,r.transactionHash].some(v=>String(v||'').toLowerCase().includes(q)));};
 // Filter parents after grouping so a match in a child retains all associated parts.
 const shown=items.filter(item=>item.rows.some(matches));
 const pages=Math.max(1,Math.ceil(shown.length/12)),currentPage=Math.min(page,pages-1);
 const renderPart=brick=>{const r=brick.registration;return <article className="br-record" key={r.chainId+':'+r.factoryAddress+':'+r.brickAddress}>
     <div className="br-record-header"><RegistrationThumbnail client={client} anchor={data.head} title={brick.title} identity={{chainId:r.chainId,factoryAddress:r.factoryAddress,brickAddress:r.brickAddress,ipId:r.ipId,originator:r.originator}}/>
      <div className="br-record-copy"><span className="br-kicker">ON-CHAIN BRICK · BLOCK {r.blockNumber}</span><h3>{brick.title}</h3><StatusPill tone={brick.streamAllowed?'success':'neutral'}>{brick.streamAllowed?'Public playback available':'Registered · private media'}</StatusPill>
       <p>{brick.source==='road-registry'?'Private metadata · title not disclosed':brick.creator}</p>
      </div>
     </div>
     <div className="br-record-footer"><small title={r.brickAddress}>{shortId(r.brickAddress)}</small>{brick.streamAllowed?<a className="text-action" href="//127.0.0.1:4173/" target="_blank" rel="noreferrer">Open YBR Player ↗</a>:<span className="br-heading-count">Registration ≠ playback permission</span>}</div>
     <details><summary>On-chain details &amp; commitments</summary><div className="br-details">
      <p>{brick.source==='road-registry'?'A title and work type cannot be inferred from a commitment or encrypted metadata. The contract below is the authoritative identity.':brick.description}</p>
      <dl>{[[r.brickAddress,'Brick contract','Registered Brick contract'],[brick.id,'IP identity','Registered IP identity'],[r.originator,'Originator','Registered originator'],[r.controller,'Current controller','Registered controller'],[r.metadataURI,'Metadata reference (not automatically opened)','Registered metadata reference'],[r.metadataDigest,'Metadata commitment','Registered metadata commitment'],[r.contentHash,'Content commitment','Registered content commitment'],[r.transactionHash,'Mint transaction','Registered mint transaction']].map(([value,label,copy])=><div key={label}><dt>{label}</dt><dd><CopyField label={copy} value={value}/></dd></div>)}</dl>
     </div></details>
    </article>};
 return <section className="lr br-collection" aria-label="IP Registry">
  <div className="registry-bar"><div className="tabs">
   <button type="button" className={!examples?'active':''} onClick={()=>setExamples(false)}>On-chain registrations</button>
   <button type="button" className={examples?'active':''} onClick={()=>setExamples(true)}>Local drafts &amp; examples</button>
  </div>{!examples&&<button type="button" className="quiet" disabled={busy} onClick={()=>void refresh.current()}>{busy?'Reading chain…':'Refresh registry'}</button>}</div>
  {examples?children:<>
   <div className="notice"><p><strong>Real registrations, not sample data.</strong> This view reads the active network and factory selected in Dev Control. Registered works appear whether or not their files are playable. No private metadata or recovery key is uploaded to populate this list.</p></div>
   <details className="lr-network br-surface"><summary><span>{data?.network?.label||ACTIVE_NETWORK?.label||'Selected network'} · chain {data?.network?.chainId||ACTIVE_NETWORK?.chainId||'connecting'}</span><StatusPill tone={data?'success':'warning'}>{data?data.bricks.length+' registrations':'Connecting'}</StatusPill></summary><div className="br-surface-body">
    {data&&<><CopyField label="Registry factory" value={data.network.factoryAddress}/><small>RPC: {data.network.rpcUrl||'Active network through the local read-only proxy'}</small><small>Blocks {data.fromBlock}–{data.head.number} · checked {checked} · refreshes every 5 seconds</small></>}
    <p>Use Dev Control to change the active blockchain. <button type="button" className="text-action" onClick={onWallet}>Open My Bricks for the connected creator</button>.</p>
   </div></details>
   {error&&<p className="wb-error" role="alert">{error} The registry is unavailable, not empty.</p>}
   {!data&&!error&&<p role="status">Reading confirmed factory events and Brick contracts…</p>}
   {data&&<>
    {(data.limited||data.limitReached)&&<p className="wb-warning">Partial scan: {data.matchingEvents} matching events in the scanned range; up to 200 newest registrations are shown. This is not a complete historical index.</p>}
    <div className="registry-bar"><label className="searchbox"><input aria-label="Search on-chain registrations" placeholder="Search title, Brick ID, contract or wallet" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label>
     {wallet&&<label><input type="checkbox" checked={mine} onChange={e=>{setMine(e.target.checked);setPage(0);}}/> Created by my connected wallet</label>}</div>
    <p className="result-caption" role="status">{shown.length} release building{shown.length===1?'':'s'} / standalone Brick entries in view · no simulated receipts</p>
    <ImportBuildingPacket rows={data.bricks} client={client} chainId={data.network.chainId} factoryAddress={data.network.factoryAddress}/>
    <div className="br-grid">{shown.slice(currentPage*12,currentPage*12+12).map(item=>item.kind==='building'?<ReleaseBuildingCard key={item.id} group={item} client={client} chainId={data.network.chainId} factoryAddress={data.network.factoryAddress} anchor={data.head} renderPart={renderPart}/>:renderPart(item.row))}</div>
    <CollectionPager page={currentPage} pages={pages} total={shown.length} onPage={setPage}/>
    {!shown.length&&<div className="empty"><strong>{data.bricks.length?'No registrations match these filters.':'No confirmed registrations in this factory’s scanned range.'}</strong>
     <p>Check the chain and factory shown above against your mint receipt. A simulated receipt is not an on-chain registration.</p><button type="button" className="gold-btn" onClick={onMint}>Open Mint Studio</button></div>}
   </>}
   <p className="lr-boundary">Registration is not proof of legal ownership or permission to stream. Choose Player permissions and approve automatic delivery in <strong>Mint Studio Step 3: IP and licensing</strong>. The permitted copies are delivered after a confirmed mint; master recordings and project files stay private.</p>
  </>}
 </section>;
}
