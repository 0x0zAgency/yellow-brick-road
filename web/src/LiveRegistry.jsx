import {useEffect,useRef,useState} from 'react';
import CopyField from './CopyField.jsx';
import {fetchRegistry} from './registry-client.js';
import './live-registry.css';

export default function LiveRegistry({wallet,onMint,onWallet,children}){
 const [examples,setExamples]=useState(false),[data,setData]=useState(null),[error,setError]=useState('');
 const [busy,setBusy]=useState(false),[query,setQuery]=useState(''),[mine,setMine]=useState(false),[checked,setChecked]=useState('');
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
 const shown=(data?.bricks||[]).filter(b=>{
  const r=b.registration;
  return (!mine||!wallet||r.originator.toLowerCase()===wallet.toLowerCase())&&
   (!q||[b.title,b.id,r.brickAddress,r.originator,r.controller,r.transactionHash].some(v=>v.toLowerCase().includes(q)));
 });
 return <section className="lr" aria-label="IP Registry">
  <div className="registry-bar"><div className="tabs">
   <button type="button" className={!examples?'active':''} onClick={()=>setExamples(false)}>On-chain registrations</button>
   <button type="button" className={examples?'active':''} onClick={()=>setExamples(true)}>Local drafts &amp; examples</button>
  </div>{!examples&&<button type="button" className="quiet" disabled={busy} onClick={()=>void refresh.current()}>{busy?'Reading chain…':'Refresh registry'}</button>}</div>
  {examples?children:<>
   <div className="notice"><p><strong>Real registrations, not sample data.</strong> This view reads the local Player’s Ganache factory. Registered works appear whether or not their files are playable. No private metadata or recovery key is uploaded to populate this list.</p></div>
   <div className="lr-network"><strong>Local Ganache · chain 1337</strong>
    {data&&<><CopyField label="Registry factory" value={data.network.factoryAddress}/><small>RPC: {data.network.rpcUrl||'Configured local Ganache RPC'}</small><small>Blocks {data.fromBlock}–{data.head.number} · checked {checked} · refreshes every 5 seconds</small></>}
    <p>Minted on Sepolia or through a different factory? <button type="button" className="text-action" onClick={onWallet}>Open My Bricks to select that network and factory</button>.</p>
   </div>
   {error&&<p className="wb-error" role="alert">{error} The registry is unavailable, not empty.</p>}
   {!data&&!error&&<p role="status">Reading confirmed factory events and Brick contracts…</p>}
   {data&&<>
    {(data.limited||data.limitReached)&&<p className="wb-warning">Partial scan: {data.matchingEvents} matching events in the scanned range; up to 200 newest registrations are shown. This is not a complete historical index.</p>}
    <div className="registry-bar"><label className="searchbox"><input aria-label="Search on-chain registrations" placeholder="Search title, Brick ID, contract or wallet" value={query} onChange={e=>setQuery(e.target.value)}/></label>
     {wallet&&<label><input type="checkbox" checked={mine} onChange={e=>setMine(e.target.checked)}/> Created by my connected wallet</label>}</div>
    <p className="result-caption" role="status">{shown.length} on-chain registration{shown.length===1?'':'s'} in view · no simulated receipts</p>
    <div className="lr-grid">{shown.map(brick=>{const r=brick.registration;return <article className="panel lr-card" key={r.chainId+':'+r.factoryAddress+':'+r.brickAddress}>
     <span className="eyebrow">ON-CHAIN BRICK · BLOCK {r.blockNumber}</span><h3>{brick.title}</h3>
     <span className="status">{brick.streamAllowed?'Registered · public playback available':'Registered · playback not published'}</span>
     <p>{brick.source==='road-registry'?'A title and work type cannot be inferred from a commitment or encrypted metadata. The contract below is the authoritative identity.':brick.description}</p>
     <dl><dt>Brick contract</dt><dd><CopyField label="Registered Brick contract" value={r.brickAddress}/></dd>
      <dt>IP identity</dt><dd><CopyField label="Registered IP identity" value={brick.id}/></dd>
      <dt>Originator</dt><dd><CopyField label="Registered originator" value={r.originator}/></dd>
      <dt>Current controller</dt><dd><CopyField label="Registered controller" value={r.controller}/></dd></dl>
     <details><summary>Commitments and mint transaction</summary><dl>
      <dt>Metadata reference (not automatically opened)</dt><dd>{r.metadataURI}</dd>
      <dt>Metadata commitment</dt><dd>{r.metadataDigest}</dd><dt>Content commitment</dt><dd>{r.contentHash}</dd>
      <dt>Transaction</dt><dd><CopyField label="Registered mint transaction" value={r.transactionHash}/></dd></dl></details>
     <a className="text-action" href="http://127.0.0.1:4173/" target="_blank" rel="noreferrer">Open YBR Player ↗</a>
    </article>})}</div>
    {!shown.length&&<div className="empty"><strong>{data.bricks.length?'No registrations match these filters.':'No confirmed registrations in this factory’s scanned range.'}</strong>
     <p>Check the chain and factory shown above against your mint receipt. A simulated receipt is not an on-chain registration.</p><button type="button" className="gold-btn" onClick={onMint}>Open Mint Studio</button></div>}
   </>}
   <p className="lr-boundary">Registration is not proof of legal ownership or permission to stream. To hear a protected recording, use <strong>Add release to Player</strong> on its Mint Studio receipts page and approve sharing the selected preview copies. Minting alone never publishes your originals.</p>
  </>}
 </section>;
}
