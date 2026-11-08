import {useEffect,useState} from 'react';
import StatusArea from './StatusArea.jsx';
import {connectChain} from './chain-mint.js';
import {discoverWalletBricks} from './brick-viewer-model.js';
import {loadBuildingIndex} from './release-buildings.js';
import {listRecoveryTitles} from './recovery-vault.js';
import {applyWorkTitles,displayWorkTitle} from './work-titles.js';

export default function WalletBrickReferencePicker({wallet,chainId,factoryAddress,rpcUrl,network,onSelect,disabled}){
 const [state,setState]=useState({}),[selected,setSelected]=useState(''),[retry,setRetry]=useState(0);
 const scope=JSON.stringify([wallet,chainId,factoryAddress,rpcUrl,network]);
 useEffect(()=>{
  const abort=new AbortController();setState({scope,loading:true});setSelected('');
  void (async()=>{
   const {client,check}=await connectChain({provider:window.ethereum,account:wallet,chainId,rpcUrl,network});
   const result=await discoverWalletBricks({client,wallet,factoryAddress,signal:abort.signal});
   const genesis=await client.getBlock({blockNumber:0n});
   const bindings=await listRecoveryTitles(wallet).catch(()=>[]);
   let index=[];try{index=loadBuildingIndex(window.localStorage);}catch{/* Titles are optional. */}
   const rows=applyWorkTitles(result.bricks.filter(b=>b.creatorIsController),index,bindings,{chainId,factoryAddress,genesisHash:genesis.hash},wallet);
   await check();
   if(!abort.signal.aborted)setState({scope,rows,limited:result.limited||result.limitReached});
  })().catch(error=>{if(!abort.signal.aborted)setState({scope,error:error.shortMessage||error.message});});
  return()=>abort.abort();
 },[scope,retry]);
 const rows=state.scope===scope?state.rows||[]:[],choice=rows.find(row=>row.address===selected);
 return <section className="ms-link" aria-label="Choose a Brick from my wallet">
  <p>Select artwork you registered separately. Its original Brick stays in place; approval adds a reference to this work.</p>
  <label>Bricks in my wallet<select aria-label="Bricks in my wallet" value={selected} disabled={disabled||state.loading||!rows.length} onChange={e=>setSelected(e.target.value)}>
   <option value="">Select a registered work</option>
   {rows.map(row=><option key={row.address} value={row.address}>{displayWorkTitle(row)} · {row.address.slice(0,6)}…{row.address.slice(-4)}</option>)}
  </select></label>
  <button type="button" className="ms-outline" disabled={disabled||!choice} onClick={()=>onSelect({...choice,factory:factoryAddress,title:displayWorkTitle(choice)})}>Use selected Brick</button>
  <button type="button" className="ms-outline" disabled={disabled||state.loading} onClick={()=>setRetry(n=>n+1)}>Refresh my Bricks</button>
  <StatusArea busy={state.loading} label="Finding your Bricks…" error={state.error} message={state.rows&&!rows.length?'No Bricks controlled by this wallet were found in this deployment.':state.limited?'Showing recent Bricks. Use a contract address to reference an older Brick.':''} name="Wallet reference search status"/>
 </section>;
}
