import {decodePublicCover} from './nft-cover-read.js';
import {useEffect,useRef,useState} from 'react';
import {readAttachedCover,prepareNftCover} from './nft-cover-source.js';
import './nft-cover.css';

/** Prepare in memory; publication consent is scoped to these exact reviewed image bytes. */
export default function NftCoverReview({getPacket,vault,sourceDigest,value,onChange,simulated=false}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState('');
 const task=useRef(null),lock=useRef(false);
 useEffect(()=>()=>task.current?.abort(),[]);
 useEffect(()=>{
  if(!value?.bytes){setPreview('');return;}
  const url=URL.createObjectURL(new Blob([value.bytes],{type:'image/png'}));setPreview(url);
  return()=>URL.revokeObjectURL(url);
 },[value?.bytes]);
 const prepare=async()=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  const controller=new AbortController();task.current=controller;
  try{
   const packet=getPacket(),bytes=await readAttachedCover({packet,vault,signal:controller.signal});
   const thumbnail=await prepareNftCover(bytes,{signal:controller.signal});
   await decodePublicCover(thumbnail,{signal:controller.signal});
   if(!controller.signal.aborted)onChange({bytes:thumbnail,sourceDigest,consent:false});
  }catch(e){if(!controller.signal.aborted)setError(e.message);}
  finally{if(!controller.signal.aborted){lock.current=false;setBusy(false);}}
 };
 if(simulated)return null;
 return <section className="nft-cover" aria-label="Review actual NFT artwork">
  <span className="eyebrow">ACTUAL NFT / PUBLIC DISPLAY COPY</span><h3>Choose what your NFTs display.</h3>
  <p>Your uploaded cover or photo can be the NFT image from its first mint. Review and approve the public display copy below. It is included in the same transaction as the Bricks, with no separate initial artwork transaction.</p>
  {!sourceDigest?<p>No supported cover or photo attached. The NFT will use the yellow-square fallback. Add an image in Files to change it.</p>:<>
   {!value?.bytes&&<button type="button" className="ms-outline" disabled={busy} onClick={()=>void prepare()}>{busy?'Preparing NFT preview…':'Preview cover for NFTs'}</button>}
   {preview&&<img src={preview} className="nft-cover-preview" alt="NFT image included at mint"/>}
   {value?.bytes&&<label className="nft-cover-consent"><input type="checkbox" checked={value.consent===true} onChange={e=>onChange({...value,consent:e.target.checked})}/> Publish this reviewed thumbnail publicly on IPFS and include it in my registration NFTs at mint.</label>}
   <p role="status">{value?.consent?'NFT cover selected. It will be included in the single mint transaction.':'NFT artwork is NOT selected. Minting now will leave the yellow-square fallback.'}</p>
  </>}
  <p className="nft-cover-note">Anyone may retrieve or retain the public thumbnail. Only the display copy is published, not your masters, source metadata or recovery key. Canceling the mint does not remove a thumbnail already pinned to public IPFS. Changing the image later is optional and requires a new transaction.</p>
  {error&&<p role="alert" className="ms-error">{error}</p>}
 </section>;
}
