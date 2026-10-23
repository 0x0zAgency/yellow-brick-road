import {useEffect,useRef,useState} from 'react';
import {readAttachedCover,prepareNftCover} from './nft-cover-source.js';
import './nft-cover.css';

/** Automatic local preparation only. No publication or signing without explicit review. */
export default function NftCoverReview({getPacket,vault,sourceDigest,value,onChange,simulated=false}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState('');
 const task=useRef(null),lock=useRef(false);
 useEffect(()=>{
  if(!value?.bytes){setPreview('');return;}
  const url=URL.createObjectURL(new Blob([value.bytes],{type:'image/png'}));setPreview(url);
  return()=>URL.revokeObjectURL(url);
 },[value?.bytes]);
 const prepare=async()=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  const controller=new AbortController();task.current=controller;
  try{
   const bytes=await readAttachedCover({packet:getPacket(),vault,signal:controller.signal});
   const thumbnail=await prepareNftCover(bytes,{signal:controller.signal});
   if(!controller.signal.aborted)onChange({bytes:thumbnail,sourceDigest,consent:false});
  }catch(e){if(!controller.signal.aborted)setError(e.message);}
  finally{if(!controller.signal.aborted){lock.current=false;setBusy(false);}}
 };
 useEffect(()=>{
  if(!simulated&&sourceDigest&&!value?.bytes&&!value?.skip)void prepare();
  return()=>{task.current?.abort();lock.current=false;};
 },[sourceDigest,simulated]);
 const skip=()=>{
  task.current?.abort();lock.current=false;setBusy(false);setError('');
  onChange({sourceDigest,skip:true,consent:false});
 };
 if(simulated)return null;
 return <section className="nft-cover" aria-label="Review actual NFT artwork">
  <span className="eyebrow">ONE TRANSACTION / INITIAL NFT ARTWORK</span><h3>Your image, from the first mint.</h3>
  <p>Your uploaded cover, photograph or artwork supplies the public NFT display thumbnail. The original stays encrypted. All release Bricks, permissions and NFT images are registered in one transaction.</p>
  {!sourceDigest?<p>No supported cover or primary image attached. These NFTs will use the default artwork.</p>:<>
   {busy&&<p role="status">Preparing your uploaded image locally…</p>}
   {preview&&!value?.skip&&<img src={preview} className="nft-cover-preview" alt="NFT image included in the mint"/>}
   {value?.bytes&&!value?.skip&&<label className="nft-cover-consent"><input type="checkbox" checked={value.consent===true} onChange={e=>onChange({...value,consent:e.target.checked})}/> Publish this reviewed thumbnail publicly on IPFS and include it in my NFT mint transaction.</label>}
   <p role="status">{value?.skip?'Default artwork explicitly selected. No public thumbnail will be uploaded.':value?.consent?'NFT image approved. One mint transaction, with no separate initial artwork transaction.':'Review and approve the public thumbnail, or explicitly choose default artwork before minting.'}</p>
   {value?.skip?<button type="button" className="ms-outline" disabled={busy} onClick={()=>void prepare()}>Use uploaded image instead</button>:<button type="button" className="ms-outline" onClick={skip}>Use default artwork instead</button>}
   {error&&<button type="button" className="ms-outline" disabled={busy} onClick={()=>void prepare()}>Retry image preparation</button>}
  </>}
  <p className="nft-cover-note">Anyone may retrieve or retain the public thumbnail. Only a resized display copy is published, without source metadata or recovery keys. Canceling the mint can leave an already-pinned thumbnail. Replacing artwork later remains an optional on-chain update with gas.</p>
  {error&&<p role="alert" className="ms-error">{error}</p>}
 </section>;
}
