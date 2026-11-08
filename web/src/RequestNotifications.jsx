import {useEffect,useRef,useState} from 'react';
import {Bell,X,ArrowRight} from 'lucide-react';
import {sameAddress} from './licensing/protocol.js';
import {checkLinkedBrick,signLinkApproval} from './brick-authorization.js';
import {walletClientForLinks} from './BrickLinkApprovals.jsx';
import BrickApprovalModal from './BrickApprovalModal.jsx';
import {workspaceInbox,localReferences,subscribeReferences,updateReference,pendingNotifications,createArrivalTracker} from './request-inbox.js';
import './request-notifications.css';

export default function RequestNotifications({wallet,onConnect,onOffer}){
 const client=workspaceInbox(),[items,setItems]=useState([]),[open,setOpen]=useState(false),[arrival,setArrival]=useState(null),[review,setReview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[online,setOnline]=useState(false),[authenticated,setAuthenticated]=useState(false);
 const bell=useRef(null),panel=useRef(null),wrapper=useRef(null),revision=useRef(0),operation=useRef(0),poll=useRef(()=>{}),tracker=useRef(createArrivalTracker()),walletRef=useRef(wallet);walletRef.current=wallet;
 useEffect(()=>{
  let stopped=false,timer,running=false,rerun=false,chainId=0,lastAuth=null;
  const generation=++revision.current,active=()=>!stopped&&revision.current===generation;
  setItems([]);setOpen(false);setArrival(null);setReview(null);setError('');setBusy(false);setOnline(false);tracker.current.reset();
  if(client.account&&!sameAddress(client.account,wallet))client.disconnect();
  async function refresh(){
   if(!active()||!wallet)return;
   if(running){rerun=true;return;}running=true;clearTimeout(timer);
   try{
    chainId=Number(await window.ethereum.request({method:'eth_chainId'}));
    let remote={references:[],offers:[]};
    const signedIn=client.authenticated&&sameAddress(client.account,wallet)&&client.profile?.chainId===chainId;
    if(signedIn!==lastAuth){tracker.current.reset();lastAuth=signedIn;}
    if(active())setAuthenticated(signedIn);
    if(signedIn)remote=await client.api('/inbox');
    if(!active())return;
    // A delivered answer is picked up by the original mint form, while the artist reviews later mint steps.
    for(const record of remote.references)if(record.response&&localReferences().some(r=>r.id===record.id&&!r.response))updateReference(record.id,{response:record.response,status:record.status});
    const local=localReferences().filter(r=>!r.remote&&r.request.chainId===chainId&&sameAddress(r.controller,wallet));
    const {reader}=walletClientForLinks(window.ethereum,chainId);
    for(const record of local.filter(r=>r.status==='pending'&&r.request.deadline*1000>Date.now())){
     const checked=await checkLinkedBrick(reader,record.request);
     if(!active())return;
     if(!sameAddress(checked.controller,wallet)){record.status='stale';updateReference(record.id,{status:'stale'});}
    }
    if(!active())return;
    const next=pendingNotifications({references:[...local,...remote.references.map(r=>({...r,remote:true}))],offers:remote.offers},wallet,chainId);
    const arrivals=tracker.current.observe(next);setItems(next);setOnline(signedIn);setError('');
    if(arrivals.length)setArrival({id:Date.now(),count:arrivals.length,title:arrivals[0].title});
   }catch(e){if(active()){setOnline(false);setAuthenticated(client.authenticated&&sameAddress(client.account,wallet));if(e.status===401){setItems(current=>current.filter(item=>item.kind==='reference'&&!item.remote));setReview(current=>current?.remote?null:current);}setError(e.status===401?'Sign in again to receive requests.':'Unable to update requests. Your pending approvals will refresh when the connection returns.');}}
   finally{running=false;if(active()){if(rerun){rerun=false;void refresh();}else if(!document.hidden)timer=setTimeout(refresh,5000);}}
  }
  poll.current=refresh;
  const wake=()=>{if(!document.hidden)void refresh();else clearTimeout(timer);};
  const changed=()=>{operation.current++;client.disconnect();setReview(null);setItems([]);setArrival(null);setAuthenticated(false);setOnline(false);setBusy(false);tracker.current.reset();};
  const networkChanged=()=>{changed();stopped=true;clearTimeout(timer);};
  // The parent remounts this component on wallet changes; chain changes also invalidate in-flight work.
  const accountChanged=()=>{changed();stopped=true;clearTimeout(timer);};
  window.ethereum?.on?.('accountsChanged',accountChanged);window.ethereum?.on?.('disconnect',accountChanged);
  const chainChanged=()=>{networkChanged();window.dispatchEvent(new Event('ybr:notification-network-change'));};
  window.ethereum?.on?.('chainChanged',chainChanged);
  const unsub=client.subscribe(refresh),unsubLocal=subscribeReferences(refresh);
  document.addEventListener('visibilitychange',wake);window.addEventListener('focus',wake);void refresh();
  return()=>{stopped=true;revision.current++;operation.current++;clearTimeout(timer);unsub();unsubLocal();document.removeEventListener('visibilitychange',wake);window.removeEventListener('focus',wake);window.ethereum?.removeListener?.('accountsChanged',accountChanged);window.ethereum?.removeListener?.('disconnect',accountChanged);window.ethereum?.removeListener?.('chainChanged',chainChanged);};
 },[wallet,client]);
 useEffect(()=>{if(!arrival)return;const id=setTimeout(()=>setArrival(null),8000);return()=>clearTimeout(id);},[arrival]);
 useEffect(()=>{
  if(!open)return;panel.current?.querySelector('button')?.focus({preventScroll:true});
  const close=e=>{if(e.type==='keydown'&&e.key==='Escape'){setOpen(false);bell.current?.focus();}else if(e.type==='pointerdown'&&!wrapper.current?.contains(e.target))setOpen(false);};
  document.addEventListener('keydown',close);document.addEventListener('pointerdown',close);return()=>{document.removeEventListener('keydown',close);document.removeEventListener('pointerdown',close);};
 },[open]);
 async function login(){
  const id=++operation.current;setBusy(true);setError('');
  try{await client.initialize();await client.connect();await client.login();if(id===operation.current)await poll.current();}
  catch(e){if(id===operation.current)setError(e.shortMessage||e.message);}
  finally{if(id===operation.current)setBusy(false);}
 }
 async function choose(item){
  if(item.kind==='offer'){setOpen(false);setArrival(null);onOffer(item);return;}
  const id=++operation.current;setBusy(true);setError('');
  try{const {reader}=walletClientForLinks(window.ethereum,item.request.chainId),checked=await checkLinkedBrick(reader,item.request);
   if(!sameAddress(checked.controller,wallet))throw Error('This wallet no longer controls the referenced Brick.');
   if(id===operation.current){setReview(item);setOpen(false);setArrival(null);}
  }catch(e){if(id===operation.current)setError(e.shortMessage||e.message);}finally{if(id===operation.current)setBusy(false);}
 }
 const closeReview=()=>{operation.current++;setReview(null);setBusy(false);setError('');bell.current?.focus();};
 async function approve(){
  const item=review,id=++operation.current;setBusy(true);setError('');
  const check=()=>{if(id!==operation.current||!sameAddress(walletRef.current,wallet))throw Error('Wallet or request changed.');};
  try{
   const provider=window.ethereum,{reader,signer}=walletClientForLinks(provider,item.request.chainId);
   const response=await signLinkApproval({reader,signer,provider,account:wallet,request:item.request,check});check();
   if(item.remote){await client.api('/references/'+item.id+'/decision',{method:'POST',body:{action:'approve',response}});check();}
   updateReference(item.id,{status:'approved',response});setReview(null);await poll.current();bell.current?.focus();
  }catch(e){if(id===operation.current)setError(e.shortMessage||e.message);}finally{if(id===operation.current)setBusy(false);}
 }
 const count=items.length;
 return <div className="request-notifications" ref={wrapper}>
  <button ref={bell} type="button" className={'request-bell'+(arrival?' has-arrival':'')} aria-label={`Notifications${count?`, ${count} waiting request${count===1?'':'s'}`:''}`} aria-expanded={open} aria-controls="request-inbox-panel" aria-describedby={arrival&&!open?'request-arrival-tip':undefined} onClick={()=>{setOpen(value=>!value);setArrival(null);}}>
   <Bell key={arrival?.id||'quiet'} size={20}/>{count>0&&<span className="request-count" aria-hidden="true">{count>99?'99+':count}</span>}
  </button>
  <span className="request-sr" role="status" aria-live="polite" aria-atomic="true">{arrival?`${arrival.count===1?'New request':arrival.count+' new requests'}: ${arrival.title}. Review your notifications to take action.`:''}</span>
  {arrival&&!open&&<div className="request-arrival" id="request-arrival-tip" role="tooltip"><strong>{arrival.count===1?'Your approval is requested':`${arrival.count} new requests`}</strong><span>{arrival.title}</span><button onClick={()=>{setOpen(true);setArrival(null);}}>Review requests <ArrowRight size={14}/></button><button className="request-tip-close" aria-label="Dismiss notification tooltip" onClick={()=>setArrival(null)}><X size={14}/></button></div>}
  {open&&<section ref={panel} id="request-inbox-panel" className="request-inbox-panel" aria-label="Waiting requests"><div className="request-panel-heading"><div><h2>Requests</h2><span>{count} waiting{online?' · Live':''}</span></div><button className="icon-btn" aria-label="Close notifications" onClick={()=>{setOpen(false);bell.current?.focus();}}><X size={18}/></button></div>
   {!wallet?<><p>Connect your wallet to view its requests.</p><button className="gold-btn" onClick={onConnect}>Connect wallet</button></>:!authenticated&&<div className="request-signin"><p>Sign in with your wallet to receive incoming requests.</p><button className="gold-btn" disabled={busy} onClick={login}>{busy?'Signing in…':'Sign in to requests'}</button></div>}
   {error&&<p role="alert" className="request-error">{error}</p>}
   {count===0&&wallet&&authenticated&&!error&&<p className="request-empty">You’re all caught up.</p>}
   {count>0&&<ul>{items.map(item=><li key={item.key}><button disabled={busy} onClick={()=>void choose(item)}><span className="request-kind">{item.kind==='reference'?'Brick reference':'License request'}</span><strong>{item.title}</strong><span>{item.detail}</span><span className="request-review">Review request <ArrowRight size={14}/></span></button></li>)}</ul>}
   {wallet&&<button className="request-refresh" disabled={busy} onClick={()=>void poll.current()}>Refresh requests</button>}
  </section>}
  {review&&<BrickApprovalModal request={review.request} controller={review.controller} workTitle={review.workTitle} brickTitle={review.brickTitle} busy={busy} error={error} onClose={closeReview} onApprove={()=>void approve()}/>}
 </div>;
}
