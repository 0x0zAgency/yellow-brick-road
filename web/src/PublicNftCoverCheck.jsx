import './nft-image-delivery.css';
import {useEffect,useState} from 'react';
import {readPublicNftCover,publicCoverPath} from './nft-cover-read.js';
import CopyField from './CopyField.jsx';
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
    <strong role="status">Verified public PNG through this YBR node · {state.info.width} × {state.info.height} · {state.info.size.toLocaleString()} bytes</strong>
    <img src={path} width={state.info.width} height={state.info.height} alt="Verified public NFT thumbnail" className="nft-cover-preview" referrerPolicy="no-referrer"/>
    <p>Thumbnail SHA-256: <code>{state.info.sha256}</code></p>
    <a href={path} target="_blank" rel="noreferrer">Open public thumbnail ↗</a>
   </>}
   <button type="button" className="ms-outline" onClick={()=>setRetry(n=>n+1)}>Check image again</button>
  </>}
  {path&&<details><summary>Artwork works here but is blank in MetaMask?</summary>
   <p>Wallets use their own IPFS gateway. A successful image check here does not test that gateway. A gateway returning an error or an HTML page cannot display your NFT.</p>
   <p>With local HTTPS configured, <code>npm run dev</code> restores missing wallet-gateway certificates after a clean reinstall and starts the gateway. If startup reports that wallet artwork needs setup, run <code>npm run setup:wallet</code>, then <code>npm run wallet:gateway</code>.</p>
   <p>In MetaMask, open <strong>Settings → Privacy → IPFS gateway</strong> and paste the complete URL:</p>
   <CopyField label="Local wallet IPFS gateway" value="https://localhost:8792"/>
   <a href={'https://localhost:8792/ipfs/'+imageURI.slice(7)} target="_blank" rel="noreferrer">Test this cover through the wallet gateway ↗</a>
   <p>Return to NFTs and choose <strong>Refresh list</strong>. If MetaMask itself was reinstalled, check this setting again and make sure NFT media is enabled. If the local chain was replaced, compare the card’s NFT contract and token ID with <strong>My Bricks → On-chain details &amp; wallet import</strong>; an old wallet card may refer to the previous chain.</p>
   <p>The gateway must remain running. This wallet-wide setting serves YBR public PNG thumbnails only; use an appropriate general gateway again for other IPFS assets. Other computers need their own gateway or a reachable public provider.</p>
  </details>}
  <p className="nft-cover-note">An image verified here may still be unreachable to an external wallet’s gateway. Its IPFS provider must stay reachable. A localhost Ganache chain is not visible to an external NFT indexer. Do not remint to repair image delivery.</p>
 </section>;
}
