import {useEffect,useState} from 'react';
import {Plus,ArrowRight,Clock3,CheckCircle2} from 'lucide-react';
import {MINT_DRAFT_EVENT,listMintDrafts,removeMintDraft,draftStatus,approvalProgress} from './mint-drafts.js';
import StatusArea from './StatusArea.jsx';
import './mint-drafts.css';
export const openMintDraft=id=>window.dispatchEvent(new CustomEvent('ybr:open-mint',{detail:{id}}));
export const startNewMint=()=>window.dispatchEvent(new CustomEvent('ybr:open-mint',{detail:{newMint:true}}));
export default function BricksInProgress({wallet,onResume=openMintDraft,onNew=startNewMint,onConnect}){
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[removing,setRemoving]=useState(null),[confirm,setConfirm]=useState(null),[clock,setClock]=useState(Date.now());
 useEffect(()=>{
  let active=true,revision=0;setRows([]);setConfirm(null);
  const refresh=async()=>{const id=++revision;if(!wallet){setLoading(false);return;}try{const records=await listMintDrafts(wallet);if(active&&id===revision){setRows(records);setError('');}}catch(e){if(active&&id===revision)setError(e.message);}finally{if(active&&id===revision)setLoading(false);}};
  void refresh();window.addEventListener(MINT_DRAFT_EVENT,refresh);const tick=setInterval(()=>setClock(Date.now()),30000);
  return()=>{active=false;revision++;clearInterval(tick);window.removeEventListener(MINT_DRAFT_EVENT,refresh);};
 },[wallet]);
 const pending=rows.filter(row=>draftStatus(row.state,clock).kind!=='complete'),completed=rows.filter(row=>draftStatus(row.state,clock).kind==='complete');
 async function remove(id){setRemoving(id);setError('');try{await removeMintDraft(wallet,id);setConfirm(null);}catch(e){setError(e.message);}finally{setRemoving(null);}}
 const card=row=>{const status=draftStatus(row.state,clock),p=approvalProgress(row.state,clock);return <article className="mint-draft-card" key={row.id} aria-label={row.title}>
  <div className="mint-draft-copy"><span className={'mint-draft-status '+status.kind}>{status.kind==='waiting'?<Clock3 size={15}/>:status.kind==='ready'?<CheckCircle2 size={15}/>:null}{status.label}</span><h3>{row.title}</h3><p>{p.waiting?`${p.waiting} reference approval${p.waiting===1?'':'s'} pending`:p.attention?'Review the references before continuing.':p.total?'Approvals received. Review again before minting.':'Your files and choices are saved on this device.'}</p>
  {p.total>0&&<ul className="mint-draft-references">{row.state.linkedBricks.map(link=><li key={link.id}>{link.title||link.relation||'Brick reference'} <span>{!link.request?'Request needed':link.request.deadline*1000<=clock?'Expired':link.requestStatus&&link.requestStatus!=='approved'&&link.requestStatus!=='pending'?link.requestStatus:link.response?'Approval received':link.sent?'Request sent':'Awaiting approval'}</span></li>)}</ul>}
  <small>Saved {new Date(row.updatedAt).toLocaleString()} · {row.state.network==='sepolia'?'Sepolia':'Local network'} · {row.state.chainId}</small></div>
  <div className="mint-draft-actions"><button type="button" className="gold-btn" disabled={!!removing} onClick={()=>onResume(row.id)}>{status.kind==='complete'?'View saved result':'Resume Brick'} <ArrowRight size={16}/></button>
  {confirm===row.id?<div className="mint-draft-remove"><p>Remove this local draft and its saved files? Sent approval requests stay in the inbox.</p><button type="button" disabled={!!removing} onClick={()=>void remove(row.id)}>Remove draft</button><button type="button" onClick={()=>setConfirm(null)}>Keep draft</button></div>:<button type="button" className="text-action" disabled={!!removing} onClick={()=>setConfirm(row.id)}>Remove local draft</button>}</div>
 </article>;};
 return <section className="mint-drafts" aria-label="Bricks in progress"><div className="mint-drafts-heading"><div><span className="eyebrow">YOUR WORKBENCH</span><h2>Bricks in progress {pending.length>0&&<span className="mint-draft-count">{pending.length}</span>}</h2><p>Pause here while approvals come in. Pick up where you left off.</p></div><button type="button" className="mint-start-button" onClick={onNew}><Plus size={22}/><span>Start a new mint<small>Build your next Brick</small></span><ArrowRight size={20}/></button></div>
  {!wallet?<p>Connect your wallet to find its saved work. <button className="text-action" type="button" onClick={onConnect}>Connect wallet</button></p>:<>{pending.map(card)}{!loading&&!error&&!pending.length&&<p className="mint-drafts-empty">No unfinished Bricks for this wallet on this device.</p>}{completed.length>0&&<details><summary>Completed on this device ({completed.length})</summary>{completed.map(card)}</details>}</>}
  <StatusArea busy={loading&&!!wallet} label="Loading saved Bricks…" error={error} name="Saved Bricks status"/>
  <p className="mint-drafts-local">Saved only in this browser, including source files and recovery keys. Clearing browser data removes these drafts.</p>
 </section>;
}
