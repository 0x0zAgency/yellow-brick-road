import NftCoverPublisher from './NftCoverPublisher.jsx';
import './player-release.css';

/** Receipts report delivery; Step 3 owns approval. No post-mint permission gate. */
export default function PlayerReleasePublisher({delivery={status:'not-requested'},onRetry,busy=false,includeCover=true,...props}){
 const ready=delivery.status==='delivered',failed=delivery.status==='needs-attention';
 return <>{includeCover&&<NftCoverPublisher {...props}/>}<section className="pr-publish" aria-label="YBR Player delivery status">
  <span className="eyebrow">YBR PLAYER / DELIVERY STATUS</span>
  <h3>{ready?'Ready in YBR Player':failed?(props.mint?.simulated?'Simulation complete. Player delivery needs attention.':'Mint confirmed. Player delivery needs attention.'):delivery.status==='sending'?'Delivering approved Player copies…':'Player delivery was not requested'}</h3>
  {ready?<div className="pr-success" role="status"><p>The copies approved in Step 3 were delivered automatically. The Player continues to check the Brick’s live permissions for real mints.</p>
   {delivery.simulated&&<p>Simulation preview only. No on-chain permission was created.</p>}
   <a className="ms-primary" href={'//127.0.0.1:4173/#release='+delivery.brick.id} target="_blank" rel="noreferrer">Open release in Player ↗</a></div>:
   failed?<><p className="ms-error" role="alert">{delivery.error}</p><p>Your mint receipts and encrypted originals are unchanged. Retry only the approved delivery, never mint a duplicate.</p>
    <button className="ms-outline" type="button" disabled={busy||!onRetry} onClick={onRetry}>{busy?'Retrying delivery…':'Retry Player delivery'}</button></>:
   <p>{delivery.status==='sending'?'Transferring only the selected preview, artwork and lyrics.':'Player approval belongs in Step 3: IP and licensing. No local preview copies were sent.'} Master recordings, project files and recovery keys remain private.</p>}
 </section></>;
}
