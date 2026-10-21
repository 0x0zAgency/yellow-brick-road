import {useEffect,useRef,useState} from 'react';
import {readBrickPolicy,updateBrickPolicy} from './content-policy-chain.js';
import './content-policy.css';

export default function BrickPolicyEditor({wallet,chainId,factoryAddress,brickAddress}){
 const [policy,setPolicy]=useState(null),[mask,setMask]=useState(0),[seal,setSeal]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
 const generation=useRef(0),mutex=useRef(false);
 useEffect(()=>{generation.current++;setPolicy(null);setError('');setSeal(false);return()=>{generation.current++;};},[wallet,chainId,factoryAddress,brickAddress]);
 const perform=async(action)=>{
  if(mutex.current)return;
  mutex.current=true;setBusy(true);setError('');setStatus('');const id=++generation.current;
  try{
   const options={provider:window.ethereum,chainId:Number(chainId),factoryAddress,brickAddress,walletAddress:wallet,review:policy,action,permissions:mask};
   const result=action==='read'?{policy:await readBrickPolicy(options)}:await updateBrickPolicy(options);
   if(id!==generation.current)return;
   setPolicy(result.policy);setMask(result.policy.permissions);setSeal(false);
   setStatus(result.transactionHash?'Confirmed on chain: '+result.transactionHash:'Live on-chain policy loaded.');
  }catch(e){if(id===generation.current)setError(e.shortMessage||e.message);}
  finally{mutex.current=false;if(id===generation.current)setBusy(false);}
 };
 const owner=policy?.controller?.toLowerCase()===wallet?.toLowerCase();
 return <section className="cp-review" aria-label="On-chain Player permissions">
  <h3>Player permissions &amp; file integrity</h3>
  <button type="button" className="outline-btn" disabled={busy} onClick={()=>void perform('read')}>Read current policy</button>
  {policy&&<><p>Content revision {policy.revision} · {policy.locked?'Files permanently locked':'File revisions allowed'} · Permission version {policy.permissionVersion}</p>
   {[[1,'Play Audio Preview',1],[2,'Display cover artwork',2],[4,'Display lyrics',3]].map(([bit,label,index])=><label key={bit}>
    <input type="checkbox" checked={(mask&bit)!==0} disabled={!owner||busy||/^0x0+$/.test(policy.files[index])} onChange={e=>setMask(old=>e.target.checked?old|bit:old&~bit)}/>{label}</label>)}
   <button type="button" className="gold-btn" disabled={busy||!owner||mask===policy.permissions} onClick={()=>void perform('permissions')}>Save permissions on chain</button>
   {!policy.locked&&<><label className="cp-lock"><input type="checkbox" checked={seal} disabled={!owner||busy} onChange={e=>setSeal(e.target.checked)}/> I understand this permanently locks revision {policy.revision}; it cannot be unlocked.</label>
    <button type="button" className="outline-btn" disabled={busy||!owner||!seal} onClick={()=>void perform('lock')}>Permanently lock files</button></>}
   <p className="cp-note">The original registration hash never changes. File replacements use an explicit revision with new checksums and revoke existing Player approval. A locked file set needs a new linked Brick. The upload-revision editor is not yet exposed in this screen.</p>
  </>}
  {status&&<p role="status">{status}</p>}{error&&<p className="cp-warning" role="alert">{error}</p>}
 </section>;
}
