import {useEffect,useRef,useState} from 'react';
import {equalSongwriterShares,percentToBps,validateSongwriterSplits} from './songwriter-splits.js';
export default function SongwriterSplits({names,value,wallet,onSave,onClose}){
 const [rows,setRows]=useState(()=>{
  const prior=value?.shares||[];
  return equalSongwriterShares(names).map(row=>{const saved=prior.find(p=>p.name===row.name);return {...(saved||row),percent:String((saved||row).bps/100)};});
 });
 const [confirmed,setConfirmed]=useState(false),[error,setError]=useState('');
 const ref=useRef(null);
 useEffect(()=>{const dialog=ref.current;dialog.showModal();return()=>dialog.close();},[]);
 const save=()=>{
  const next={confirmed,shares:rows.map(r=>({name:r.name,wallet:r.wallet.trim(),bps:percentToBps(r.percent)}))};
  const errors=validateSongwriterSplits(next,names,{walletRequired:!!wallet});
  if(errors.length){setError(errors.join(' '));return;}onSave(next);
 };
 const edit=(index,patch)=>{setConfirmed(false);setRows(rows.map((row,i)=>i===index?{...row,...patch}:row));};
 const total=rows.reduce((sum,r)=>sum+(percentToBps(r.percent)||0),0);
 return <dialog ref={ref} className="ms-demo-dialog ms-splits-dialog" aria-labelledby="songwriter-splits-title" onCancel={event=>{event.preventDefault();onClose();}}>
  <h2 id="songwriter-splits-title">Songwriter splits</h2><p>Set each writer’s share of the composition. Recording payouts are separate.</p>
  <p>These proposed shares are saved with the composition Brick. Activate payment splits through <strong>Licenses → Acceptance &amp; collaborators</strong> after minting.</p>
  <div className="ms-split-rows">{rows.map((row,i)=><div className="ms-fields" key={row.name}><strong>{row.name}</strong><label>{row.name} share (%)<input inputMode="decimal" value={row.percent} onChange={e=>edit(i,{percent:e.target.value})}/></label><label>{row.name} wallet{wallet?'':' (optional in simulation)'}<input value={row.wallet} placeholder="0x…" onChange={e=>edit(i,{wallet:e.target.value})}/></label></div>)}</div>
  <p role="status">Total: {(total/100).toFixed(2)}%</p><button type="button" className="ms-outline" onClick={()=>{setRows(rows.map((r,i)=>({...r,percent:String(equalSongwriterShares(names)[i].bps/100)})));setConfirmed(false);}}>Split equally</button>
  <label className="ms-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I am authorized to register this composition and declare these songwriter splits.</label>
  {error&&<p className="ms-error" role="alert">{error}</p>}
  <div className="ms-actions"><button type="button" className="ms-outline" onClick={onClose}>Cancel</button><button type="button" className="ms-primary" onClick={save}>Save songwriter splits</button></div>
 </dialog>;
}
