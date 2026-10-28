import './nft-image-delivery.css';
import {useEffect,useState} from 'react';
import {readPublicNftCover,publicCoverPath} from './nft-cover-read.js';
/** Read-only diagnosis of tokenURI.image; never reads Brick.metadataURI. */
export default function PublicNftCoverCheck({imageURI}){
 const [retry,setRetry]=useState(0),[state,setState]=useState(null);
 useEffect(()=>{
  const controller=new AbortController();setState(null);
  if(publicCoverPath(imageURI))void readPublicNftCover(imageURI,{signal:controller.signal})
   .then(info=>{if(!controller.signal.aborted)setState({info});})
   .catch(error=>{if(!controller.signal.aborted)setState({error:error.message});});
  return()=>controller.abort();
 },[imageURI,retry]);
 const path=publicCoverPath(imageURI);
 return <section className="nft-public-check" aria-label="Public NFT thumbnail check">
  <h4>Public NFT thumbnail</h4>
  <p>This checks the NFT metadata’s <code>image</code>, not the Brick’s encrypted metadata or original file.</p>
  {!path?<p role="status">No supported public image URI is available from this NFT read. Retry the NFT lookup first.</p>:<>
   <p>On-chain image: <code>{imageURI}</code></p>
   {!state&&<p role="status">Checking public PNG bytes and image decoding…</p>}
   {state?.error&&<p role="alert">{state.error}</p>}
   {state?.info&&<>
    <strong role="status">Verified public PNG · {state.info.width} × {state.info.height} · {state.info.size.toLocaleString()} bytes</strong>
    <img src={path} width={state.info.width} height={state.info.height} alt="Verified public NFT thumbnail" className="nft-cover-preview" referrerPolicy="no-referrer"/>
    <p>Thumbnail SHA-256: <code>{state.info.sha256}</code></p>
    <a href={path} target="_blank" rel="noreferrer">Open public thumbnail ↗</a>
   </>}
   <button type="button" className="ms-outline" onClick={()=>setRetry(n=>n+1)}>Check image again</button>
  </>}
  <p className="nft-cover-note">An image verified here may still be unreachable to an external wallet’s gateway. Its IPFS provider must stay reachable. A localhost Ganache chain is not visible to an external NFT indexer. Do not remint to repair image delivery.</p>
 </section>;
}
