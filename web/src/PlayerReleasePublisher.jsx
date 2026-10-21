import {readBrickPolicy} from './content-policy-chain.js';
import {permissionForFile} from './content-policy.js';
import {useEffect,useRef,useState} from 'react';
import {playerReleaseFiles,publishPlayerRelease,removePlayerRelease} from './player-release.js';
import './player-release.css';
import NftCoverPublisher from './NftCoverPublisher.jsx';

/** Explicit publication of local demo copies, independent of the mint transaction. */
export default function PlayerReleasePublisher(props){
 return <><NftCoverPublisher {...props}/><PlayerPreviewPublisher {...props}/></>;
}
function PlayerPreviewPublisher({packet,mint,vault}){
 const [consent,setConsent]=useState(false),[artwork,setArtwork]=useState(()=>permissionForFile(packet,'artwork')),[lyrics,setLyrics]=useState(()=>permissionForFile(packet,'lyrics'));
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[published,setPublished]=useState(null);
 const work=useRef(null),revision=useRef(0),lock=useRef(false);
 const [livePacket,setLivePacket]=useState(null);
 const effectivePacket=livePacket||packet;
 const selected=playerReleaseFiles(effectivePacket);
 const can=role=>permissionForFile(effectivePacket,role);
 useEffect(()=>()=>{revision.current++;work.current?.abort();},[]);
 const refreshRights=async()=>{
  if(lock.current||mint.simulated)return;
  lock.current=true;setBusy(true);setError('');const id=++revision.current;
  try{
   const next=structuredClone(packet);
   for(const brick of next.bricks){
    const receipt=mint.receipts?.find(item=>item.sourceId===brick.localId);
    if(!receipt?.contentPolicy)throw Error('This mint has no policy-enabled receipt.');
    const current=await readBrickPolicy({provider:window.ethereum,chainId:mint.chainId,factoryAddress:mint.factoryAddress,brickAddress:receipt.contractAddress});
    if(current.revision!==receipt.contentPolicy.revision||current.controller.toLowerCase()!==receipt.contentPolicy.controller.toLowerCase())throw Error('Content revision or controller changed. This browser copy cannot be republished as the new version.');
    brick.metadata.rights.player.permissions={preview:!!(current.permissions&1),artwork:!!(current.permissions&2),lyrics:!!(current.permissions&4)};
   }
   if(id===revision.current){setLivePacket(next);setArtwork(permissionForFile(next,'artwork'));setLyrics(permissionForFile(next,'lyrics'));}
  }catch(e){if(id===revision.current)setError(e.shortMessage||e.message);}
  finally{if(id===revision.current){lock.current=false;setBusy(false);}}
 };
 const liveButton=!mint.simulated&&<button type="button" className="ms-outline" disabled={busy} onClick={()=>void refreshRights()}>Refresh on-chain permissions</button>;
 if(!can('preview'))return <section className="pr-publish"><h3>Player playback is disabled</h3><p>Your pre-mint selection did not authorize Audio Preview playback. The master remains private. Current on-chain permissions can be inspected and changed in My Bricks.</p>{liveButton}{error&&<p role="alert" className="ms-error">{error}</p>}</section>;
 if(!selected.audio)return <section className="pr-publish" aria-label="YBR Player preview required"><span className="eyebrow">YOUR RELEASE / YBR PLAYER</span><h3>Audio Preview required</h3><p>Attach a supported file in the Audio Preview slot to publish this release to the Player. The Master Recording stays private and is never used as a playback fallback.</p><button className="ms-primary" type="button" disabled>Add release to Player</button></section>;
 const share=async()=>{
  if(lock.current||!consent)return;
  lock.current=true;setBusy(true);setError('');
  const id=++revision.current;work.current?.abort();work.current=new AbortController();
  try{
   const result=await publishPlayerRelease({packet:effectivePacket,mint,vault,consent,includeArtwork:artwork,includeLyrics:lyrics},{signal:work.current.signal});
   if(id===revision.current)setPublished(result.brick);
  }catch(e){if(id===revision.current)setError(e.name==='AbortError'?'Sharing canceled.':e.message);}
  finally{if(id===revision.current){lock.current=false;setBusy(false);}}
 };
 const remove=async()=>{
  if(lock.current||!published)return;
  lock.current=true;setBusy(true);setError('');
  const id=++revision.current;work.current?.abort();work.current=new AbortController();
  try{await removePlayerRelease(published.id,{signal:work.current.signal});if(id===revision.current){setPublished(null);setConsent(false);}}
  catch(e){if(id===revision.current)setError(e.message);}
  finally{if(id===revision.current){lock.current=false;setBusy(false);}}
 };
 return <section className="pr-publish" aria-label="Share this demo release with YBR Player">
  <span className="eyebrow">YOUR RELEASE / YBR PLAYER</span><h3>Hear it. See the cover. Follow the lyrics.</h3>
  <p>Use the files already attached to this release. The Player will show them alongside the Ganache library, with this release’s cover on every associated file card.</p>
  {liveButton}<dl><dt>Audio</dt><dd>{selected.audio.name} (Audio Preview only)</dd></dl>
  <label><input type="checkbox" checked={artwork} disabled={busy||!!published||!selected.artwork||!can('artwork')} onChange={e=>setArtwork(e.target.checked)}/> Include cover artwork {selected.artwork?'· '+selected.artwork.name:'· not attached'}</label>
  <label><input type="checkbox" checked={lyrics} disabled={busy||!!published||!selected.lyrics||!can('lyrics')} onChange={e=>setLyrics(e.target.checked)}/> Include lyrics {selected.lyrics?'· '+selected.lyrics.name:'· not attached'}</label>
  <p className="pr-limits">Audio up to 32 MiB; PNG/JPEG/WebP cover up to 8 MiB; UTF-8 TXT or timed WebVTT lyrics up to 512 KiB. The Master Recording, project files and other originals are listed but never uploaded for playback.</p>
  {!published?<><label className="pr-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/> I have permission to share these selected copies and their release/file labels with everyone using this local demo Player.</label>
   <p className="pr-boundary">This saves unencrypted preview copies on your local YBR server. Recovery keys and private project files stay in the browser. This is not a public Road license or verified stream.</p>
   <button className="ms-primary" type="button" disabled={busy||!consent} onClick={()=>void share()}>{busy?'Adding release…':'Add release to Player'}</button></>:<div className="pr-success" role="status"><strong>Release is in your Player.</strong><p>The library refreshes automatically. Audio, cover and lyrics remain linked as one release.</p>
   <a className="ms-primary" href={'http://127.0.0.1:4173/#release='+published.id} target="_blank" rel="noreferrer">Open release in Player ↗</a>
   <button className="ms-outline" type="button" disabled={busy} onClick={()=>void remove()}>{busy?'Removing…':'Remove local preview copies'}</button></div>}
  {error&&<p className="ms-error" role="alert">{error} Your mint receipts and encrypted originals are unchanged.</p>}
 </section>;
}
