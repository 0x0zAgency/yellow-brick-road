import {useEffect,useRef,useState} from 'react';
import {readBrickLicensingContact,updateBrickLicensingContact} from './licensing-contact-chain.js';
import {licensingMailto} from './licensing-contact.js';
import './content-policy.css';

export default function LicensingContactEditor({wallet,chainId,factoryAddress,brickAddress,client}){
 const [contact,setContact]=useState(null),[email,setEmail]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
 const generation=useRef(0),mutex=useRef(false);
 useEffect(()=>{generation.current++;setContact(null);setEmail('');setBusy(false);setError('');setStatus('');return()=>{generation.current++;};},[wallet,chainId,factoryAddress,brickAddress]);
 const perform=async save=>{
  if(mutex.current)return;
  mutex.current=true;setBusy(true);setError('');setStatus('');const id=++generation.current;
  try{
   const options={provider:window.ethereum,walletAddress:wallet,chainId:Number(chainId),factoryAddress,brickAddress,review:contact,email};
   const result=save?await updateBrickLicensingContact(options):{contact:await readBrickLicensingContact({...options,client})};
   if(id!==generation.current)return;
   setContact(result.contact);setEmail(result.contact.email);setStatus(result.transactionHash?'Contact confirmed on chain: '+result.transactionHash:'Current licensing contact read from the Brick.');
  }catch(e){if(id===generation.current){setContact(null);setError(e.shortMessage||e.message);}}
  finally{mutex.current=false;if(id===generation.current)setBusy(false);}
 };
 const owner=contact?.authority?.toLowerCase()===wallet?.toLowerCase();
 return <section className="cp-review" aria-label="Brick licensing contact">
  <h3>Licensor contact</h3><p>Use this contact for approval requests and licensing agreements.</p>
  <button type="button" className="outline-btn" disabled={busy} onClick={()=>void perform(false)}>Read licensing contact</button>
  {contact&&<><p>{contact.email?<a href={licensingMailto(contact.email)}>{contact.email}</a>:'No licensing email supplied.'} · Version {contact.version}</p>
   {owner&&<form onSubmit={e=>{e.preventDefault();void perform(true);}}><div className="ms-fields"><label>Licensor email<input type="email" maxLength={254} autoComplete="email" disabled={busy} value={email} onChange={e=>setEmail(e.target.value)} placeholder="licensing@example.com"/></label></div>
    <p className="cp-note">Public on this Brick. Leave blank to remove the current contact; previous values remain in chain history. Contact changes are allowed while files are locked.</p>
    <button type="submit" className="gold-btn" disabled={busy||email===contact.email}>Save licensor contact on chain</button>
   </form>}
  </>}
  {status&&<p role="status">{status}</p>}{error&&<p role="alert" className="cp-warning">{error}</p>}
 </section>;
}
