import {useEffect,useRef,useState} from 'react';
import {findAlbumCovers} from './album-covers.js';
import {publicCoverPath,readPublicNftCover} from './nft-cover-read.js';
import './nft-cover.css';

export default function AlbumCoverSuggestion({album,previewDigest,wallet,chainId,factoryAddress,rpcUrl,network,value,onChange}){
 const [state,setState]=useState({covers:[],loading:true}),[retry,setRetry]=useState(0),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const scope=JSON.stringify([album,previewDigest,wallet,chainId,factoryAddress,rpcUrl,network]);
 useEffect(()=>{
  const controller=new AbortController();setState({covers:[],loading:true});setError('');setBusy('');
  void findAlbumCovers({album,wallet,chainId,factoryAddress,rpcUrl,network,provider:window.ethereum,storage:window.localStorage,signal:controller.signal})
   .then(result=>{if(!controller.signal.aborted)setState({...result,loading:false,scope});})
   .catch(()=>{if(!controller.signal.aborted)setState({covers:[],loading:false,scope,error:'Previous album artwork could not be checked. Check the selected wallet, network and Player, then retry.'});});
  return()=>controller.abort();
 },[scope,retry]);
 // A new upload/wallet/network remounts this component; late reads cannot select it.
 const lifetime=useRef(null);
 useEffect(()=>{const controller=new AbortController();lifetime.current=controller;return()=>controller.abort();},[]);
 const select=async candidate=>{
  const controller=lifetime.current;
  setBusy(candidate.brickAddress);setError('');
  try{
   const image=await readPublicNftCover(candidate.imageURI,{signal:controller.signal});
   if(!controller.signal.aborted)onChange({kind:'album',candidate,bytes:image.bytes,sha256:image.sha256,sourceDigest:previewDigest,consent:true});
  }catch(e){if(!controller.signal.aborted)setError(e.message);}
  finally{if(!controller.signal.aborted)setBusy('');}
 };
 const covers=state.scope===scope?state.covers:[];
 return <section className="nft-cover" aria-label="Previous album artwork">
  <span className="eyebrow">RELATED UPLOAD / TOKENURI IMAGE</span><h3>Album detected: {album}</h3>
  <p>Use artwork from an earlier upload in this album. Each new track keeps its own metadata and NFT identity.</p>
  {state.loading?<p role="status">Checking your previous album uploads…</p>:state.error?<p role="status">{state.error}</p>:covers.length===0?<p>No earlier NFT artwork found for this album on the selected wallet and network.</p>:covers.map(candidate=><div className="album-cover-option" key={candidate.brickAddress}>
   <img className="nft-cover-preview" src={publicCoverPath(candidate.imageURI)} alt={'Previous artwork for '+album}/>
   <code>{candidate.imageURI}</code>
   <button type="button" className="ms-outline" disabled={!!busy||value?.kind==='album'&&value.candidate.imageURI===candidate.imageURI} onClick={()=>void select(candidate)}>{busy===candidate.brickAddress?'Checking artwork…':value?.kind==='album'&&value.candidate.imageURI===candidate.imageURI?'Previous album artwork selected':'Use previous album artwork'}</button>
  </div>)}
  {value?.kind==='album'&&<><p role="status">Selected: the existing public image URI will be used at mint.</p><button type="button" className="ms-outline" onClick={()=>onChange(null)}>Clear album artwork selection</button></>}
  {(state.error||state.playerUnavailable)&&<><p className="nft-cover-note">The Player’s saved uploads are unavailable; local receipt matches are still checked.</p><button type="button" className="ms-outline" onClick={()=>setRetry(n=>n+1)}>Retry album lookup</button></>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
