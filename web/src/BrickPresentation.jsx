import {WorkspaceIcon,WorkspaceGraphic} from './AppearanceContext.jsx';
import {useEffect,useRef,useState} from 'react';
import {Image,Layers,ChevronLeft,ChevronRight} from 'lucide-react';
import {publicCoverSource,readRegistrationCover} from './brick-presentation.js';
import {prepareNftCover,readAttachedCover} from './nft-cover-source.js';
import './brick-presentation.css';

export function StatusPill({tone='neutral',children}){return <span className={'br-status br-status--'+tone}>{children}</span>;}
export function ArtworkTile({imageURI,localUrl,title='Registered work',caption,status='ready',onRetry,retryKey=0}){
 const src=publicCoverSource(imageURI)||localUrl||null;
 const [failed,setFailed]=useState(null),loadKey=JSON.stringify([src,retryKey]);
 const available=src&&failed!==loadKey;
 const label=status==='loading'?'Reading NFT cover…':status==='error'?'NFT read unavailable':available?(caption||'NFT cover'):src?'Cover unavailable':'No public cover';
 return <figure className="br-artwork" title={label}>
  {available?<img key={loadKey} src={src} alt={title+' cover'} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(loadKey)}/>:<div className="br-artwork-fallback" aria-label="Cover unavailable"><WorkspaceGraphic slot="placeholder" alt="App placeholder, not NFT artwork" fallback={<WorkspaceIcon slot="placeholder" size={28}/>}/></div>}
  <figcaption>{label}</figcaption>
  {onRetry&&(status==='error'||failed===loadKey)&&<button type="button" className="text-action br-cover-retry" onClick={onRetry} aria-label={'Retry cover for '+title}>Retry cover</button>}
 </figure>;
}
// One local-only display copy for a completed mint. Never uploaded by this hook.
export function useLocalCover(packet,vault,prepared){
 const [state,setState]=useState(null);
 const key=packet?.createdAt;
 useEffect(()=>{
  const abort=new AbortController();let url;
  setState(null);
  const read=async()=>{
   try{
    const bytes=prepared?.bytes||await prepareNftCover(await readAttachedCover({packet,vault,signal:abort.signal}),{signal:abort.signal});
    if(abort.signal.aborted)return;
    url=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));setState({key,url});
   }catch{/* A private or unsupported source is never fetched from a metadata URI. */}
  };
  if(prepared?.bytes||vault?.secret)void read();
  return()=>{abort.abort();if(url)URL.revokeObjectURL(url);};
 },[key,vault,prepared?.bytes]);
 return state?.key===key?state.url:null;
}
const pending=[];let active=0;
function pump(){while(active<3&&pending.length){const run=pending.shift();active++;run().finally(()=>{active--;pump();});}}
function queued(task){return new Promise((resolve,reject)=>{pending.push(async()=>{try{resolve(await task());}catch(e){reject(e);}});pump();});}
/** Lazy, bounded, read-only NFT inspection. Visible cards never fetch private metadata. */
export function RegistrationThumbnail({client,identity,anchor,title}){
 const node=useRef(null),[visible,setVisible]=useState(false),[revision,setRevision]=useState(0),[state,setState]=useState(null);
 const key=JSON.stringify(identity),latest=useRef({identity,anchor}),attempt=useRef(null);
 latest.current={identity,anchor};
 useEffect(()=>{
  if(!globalThis.IntersectionObserver){setVisible(true);return;}
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'120px'});
  if(node.current)observer.observe(node.current);
  return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  const update=()=>setRevision(x=>x+1);
  window.addEventListener('ybr:nft-cover-updated',update);
  return()=>window.removeEventListener('ybr:nft-cover-updated',update);
 },[]);
 useEffect(()=>{
  let alive=true,inFlight=false,timer;
  const run=()=>{
   if(!alive||!visible||!client||inFlight)return;
   inFlight=true;
   void queued(async()=>{
    if(!alive)return;
    const selected=latest.current;
    return Promise.race([readRegistrationCover({client,...selected.identity,anchor:selected.anchor}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Thumbnail read timed out.')),12000);})]);
   }).then(image=>{if(alive)setState({key,image,status:'ready'});})
    .catch(()=>{if(alive)setState({key,image:null,status:'error'});})
    .finally(()=>{clearTimeout(timer);inFlight=false;});
  };
  attempt.current=run;run();
  return()=>{alive=false;if(attempt.current===run)attempt.current=null;};
 },[client,key,visible]);
 // Registry polling must not cancel a still-running valid read or blank a cover
 // every five seconds. Requests are serialized per tile and snapshot-verified.
 useEffect(()=>{attempt.current?.();},[anchor?.number,anchor?.hash,revision]);
 const current=state?.key===key?state:null;
 return <div ref={node}><ArtworkTile imageURI={current?.image} status={!client?'error':current?.status||'loading'} title={title} retryKey={revision} onRetry={()=>setRevision(x=>x+1)}/></div>;
}
export function CollectionPager({page,pages,total,onPage}){
 if(pages<=1)return null;
 return <nav className="br-pager" aria-label="Collection pages"><span>{total} records · Page {page+1} of {pages}</span><div>
  <button type="button" disabled={page===0} onClick={()=>onPage(page-1)} aria-label="Previous page"><ChevronLeft size={16}/> Previous</button>
  <button type="button" disabled={page+1===pages} onClick={()=>onPage(page+1)} aria-label="Next page">Next <ChevronRight size={16}/></button>
 </div></nav>;
}
export function CollectionEmpty({children}){return <div className="br-empty"><WorkspaceIcon slot="visual" size={28}/>{children}</div>;}
