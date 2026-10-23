import {useEffect,useRef,useState} from 'react';
import {attachedCover,readAttachedCover,prepareNftCover} from './nft-cover-source.js';
import {uploadNftCover} from './nft-cover-storage.js';
import {nftCoverSession} from './nft-cover-chain.js';
import './nft-cover.css';

/** Public thumbnail publication is independent of private originals and Player playback. */
export default function NftCoverPublisher(props){
 if(!props.mint||props.mint.simulated===true||props.mint.status!=='confirmed')return null;
 return <CoverEditor {...props}/>;
}
function CoverEditor({packet,mint,vault,wallet,preparedCover,onCoverVerified=()=>{}}){
 const [file,setFile]=useState(null),[prepared,setPrepared]=useState(preparedCover?.bytes||null),[preview,setPreview]=useState('');
 const [consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(mint.nftCover?.error||''),[status,setStatus]=useState('');
 const [saved,setSaved]=useState(mint.nftCover?.status==='verified'?mint.nftCover:null),[txHash,setTxHash]=useState(mint.nftCover?.transactionHash||''),[pinned,setPinned]=useState(mint.nftCover?.upload||null);
 const [inspection,setInspection]=useState(null);
 const [pendingTransaction,setPendingTransaction]=useState(!!mint.nftCover?.transactionHash&&mint.nftCover?.status!=='verified');
 const notify=verified=>{window.dispatchEvent(new Event('ybr:nft-cover-updated'));onCoverVerified(verified);};
 const revision=useRef(0),work=useRef(null),lock=useRef(false);
 const existing=attachedCover(packet),canUseAttached=!!(existing&&vault?.secret&&vault.encrypted?.get);
 useEffect(()=>()=>{revision.current++;work.current?.abort();},[]);
 useEffect(()=>{
  if(!prepared){setPreview('');return;}
  const url=URL.createObjectURL(new Blob([prepared],{type:'image/png'}));setPreview(url);
  return()=>URL.revokeObjectURL(url);
 },[prepared]);
 const prepare=async()=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setStatus('Checking the NFT collection…');
  const id=++revision.current;work.current?.abort();work.current=new AbortController();
  try{
   // Fail before decrypting or publishing anything when the collection is legacy.
   await nftCoverSession({mint,provider:window.ethereum,expectedAccount:wallet||packet?.account?.address});
   const signal=work.current.signal;
   if(file&&file.size>8*1024*1024)throw Error('Choose a cover no larger than 8 MiB.');
   const bytes=file?new Uint8Array(await file.arrayBuffer()):await readAttachedCover({packet,vault,signal});
   const thumbnail=await prepareNftCover(bytes,{signal});
   if(id===revision.current){setPrepared(thumbnail);setConsent(false);setSaved(null);setStatus('Display copy ready. Nothing has been uploaded yet.');}
  }catch(e){if(id===revision.current){setError(e.shortMessage||e.message);setStatus('');}}
  finally{if(id===revision.current){lock.current=false;setBusy(false);}}
 };
 const publish=async()=>{
  if(lock.current||!prepared||!consent||pendingTransaction)return;
  lock.current=true;setBusy(true);setError('');
  const id=++revision.current;work.current?.abort();work.current=new AbortController();
  try{
   const session=await nftCoverSession({mint,provider:window.ethereum,expectedAccount:wallet||packet?.account?.address});
   setStatus('Pinning the public display copy to IPFS…');
   const image=pinned||await uploadNftCover(prepared,{consent:true,signal:work.current.signal});
   if(id!==revision.current)return;setPinned(image);
   setStatus('Confirm the NFT artwork update in your wallet. This is a separate gas-paid transaction.');
   const result=await session.update(image.imageURI,{onTransaction:hash=>{if(id===revision.current){setTxHash(hash);setPendingTransaction(true);setStatus('Artwork transaction submitted. Waiting for confirmation…');}}});
   if(id===revision.current){setSaved(result);setPendingTransaction(false);notify(result);setStatus('Verified: the NFT tokenURI now contains your cover image.');}
  }catch(e){if(id===revision.current){setError(e.shortMessage||e.message);setStatus('');}}
  finally{if(id===revision.current){lock.current=false;setBusy(false);}}
 };
 const inspect=async()=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  const id=++revision.current;setInspection(null);
  try{
   const session=await nftCoverSession({mint,provider:window.ethereum,expectedAccount:wallet||packet?.account?.address});
   const data=await session.inspect();
   if(id!==revision.current)return;
   setInspection(data);
   if(pinned&&data.every(item=>item.image===pinned.imageURI)){
    setSaved({imageURI:pinned.imageURI});notify({imageURI:pinned.imageURI});setStatus('Verified: every selected NFT currently points to this public cover.');
   }else {setSaved(null);setStatus(data.every(item=>item.hasCover)?'Public cover set on-chain. If the wallet shows a square, check its image retrieval and metadata cache.':'The actual NFT metadata still contains fallback artwork. Publish a cover below; do not remint.');}
  }catch(e){if(id===revision.current){setError(e.shortMessage||e.message);setStatus('');}}
  finally{if(id===revision.current){lock.current=false;setBusy(false);}}
 };
 return <section className="nft-cover" aria-label="NFT cover artwork">
  <span className="eyebrow">ACTUAL NFT / ERC-721 ARTWORK</span>
  <h3>Put your cover on the registration NFTs.</h3>
  <button type="button" className="ms-outline" disabled={busy} onClick={()=>void inspect()}>Inspect actual NFT metadata</button>
  {inspection&&<div className="nft-cover-inspection">{inspection.map(item=><div key={item.tokenId}><strong>{item.hasCover?'PUBLIC COVER SET':'DEFAULT ARTWORK'}</strong><p>Token {item.tokenId}</p><p>Name: {item.name}</p><p>Image: <code>{item.hasCover?item.image:'Embedded fallback image (not a public cover)'}</code></p></div>)}<p>The metadata name may still be “Yellow Brick Registration”. The image field determines the artwork.</p></div>}
  <p>This updates the actual NFT <code>tokenURI</code>, not just the Player image. The same cover can be applied to this batch’s {mint.receipts?.length||0} registration receipt(s), without minting new Bricks.</p>
  <p>{file?'Selected: '+file.name:canUseAttached?'Attached cover: '+existing.name:'Choose a cover image to prepare a public display copy.'}</p>
  <label>Use another cover (PNG, JPEG or WebP; up to 8 MiB)<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy||pendingTransaction} onChange={e=>{if(!e.target.files?.[0])return;setFile(e.target.files[0]);setTxHash('');setPendingTransaction(false);setInspection(null);setStatus('');setPrepared(null);setConsent(false);setPinned(null);setSaved(null);setError('');}}/></label>
  {!prepared&&<button type="button" className="ms-outline" disabled={busy||(!file&&!canUseAttached)||pendingTransaction} onClick={()=>void prepare()}>{busy?'Preparing…':'Prepare NFT cover'}</button>}
  {preview&&<img src={preview} className="nft-cover-preview" alt="Public NFT display copy to publish"/>}
  {prepared&&!saved&&<>
   <label className="nft-cover-consent"><input type="checkbox" checked={consent} disabled={busy||pendingTransaction} onChange={e=>setConsent(e.target.checked)}/> I have permission to publish this display copy as public NFT artwork. Anyone may retrieve or retain it from IPFS.</label>
   <button type="button" className="ms-primary" disabled={!consent||busy||pendingTransaction} onClick={()=>void publish()}>{busy?'Applying cover…':'Publish cover to NFTs'}</button>
  </>}
  <p className="nft-cover-note">Only a resized PNG display copy is published. Masters, project files, source metadata and recovery keys stay private. Original signatures are not represented as signatures of this derived thumbnail. A local IPFS pin does not guarantee worldwide availability.</p>
  <p className="nft-cover-note">Publishing artwork does not authorize publication or streaming of the underlying work. Player playback permissions remain separate.</p>
  {status&&<p role="status">{status}</p>}
  {pinned&&<p>Public image: <code>{pinned.imageURI}</code>{!saved?' · May already be public even if the wallet transaction is canceled.':''}</p>}
  {txHash&&<p>Artwork transaction: <code>{txHash}</code>{pendingTransaction?' · Review this transaction in your wallet before attempting another update.':''}</p>}
  {saved&&<div className="nft-cover-success"><strong>Cover verified on the actual NFTs.</strong><p>Wallets may cache metadata. Refresh the NFT’s metadata where supported. Its collection address and token ID have not changed.</p></div>}
  {error&&<p className="ms-error" role="alert">{error}</p>}
 </section>;
}
