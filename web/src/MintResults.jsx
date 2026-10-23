import {useRef} from 'react';
import {ArtworkTile,StatusPill,useLocalCover} from './BrickPresentation.jsx';
import {mintOverview,shortId} from './brick-presentation.js';
import CopyField from './CopyField.jsx';
import CopyAllButton from './CopyAllButton.jsx';
import {formatMintReceiptForCopy} from './mint-receipt-copy.js';
import NftCoverPublisher from './NftCoverPublisher.jsx';
import PlayerReleasePublisher from './PlayerReleasePublisher.jsx';

/** Human summary first. Every receipt and recovery action remains available. */
export default function MintResults({packet,mint,vault,preparedCover,delivery,onRetry,busy,onCoverVerified,onExportPacket,onExportRecovery,onReset,onDownload,downloadSlots=[]}){
 const overview=mintOverview(mint,packet.bricks?.length||0),coverPanel=useRef(null);
 const localUrl=useLocalCover(packet,vault,preparedCover);
 const imageURI=mint?.nftCover?.status==='verified'?mint.nftCover.imageURI:null;
 const title=packet.bricks?.[0]?.metadata?.title||mint?.receipts?.[0]?.title||'Your registered work';
 const openCover=()=>{if(coverPanel.current){coverPanel.current.open=true;coverPanel.current.querySelector('summary')?.focus();coverPanel.current.scrollIntoView({block:'start',behavior:'smooth'});}};
 return <div className="br-result" aria-label="Mint results">
  <h2>05. Mint results.</h2>
  <div className="br-hero">
   <ArtworkTile imageURI={imageURI} localUrl={localUrl} title={title} caption={imageURI?'NFT cover':'Local preview'}/>
   <div className="br-hero-copy"><span className="br-kicker">YOUR WORK / YOUR ROAD</span><h3>{title}</h3>
    <div className="br-badges"><StatusPill tone={overview.tone}>{overview.label}</StatusPill><StatusPill>{overview.total} of {overview.expected} Brick receipts</StatusPill>{!overview.simulated&&<StatusPill>{mint?.network||'Chain'} {mint?.chainId}</StatusPill>}</div>
    <p>{overview.simulated?'Preview only. No NFTs or blockchain transactions were created.':overview.complete?'Your registrations are confirmed. Customize their appearance below.':'Keep these receipts. Check outstanding transactions before attempting any new mint.'}</p>
   </div>
  </div>
  {!overview.simulated&&!overview.complete&&<p className="br-warning" role="alert"><strong>Incomplete registration.</strong> {overview.verified} verified; {overview.outstanding} still need review. Pending or unverified transactions may still be mined. Do not mint duplicates.</p>}
  {mint?.nftCover?.error&&<p className="br-warning" role="alert">NFT artwork needs attention: {mint.nftCover.error} Your mint receipts are retained.</p>}
  <div className="br-actions">
   {overview.complete&&<button type="button" className="ms-primary" onClick={openCover}>Customize NFT appearance</button>}
   <button type="button" className="ms-outline" onClick={onExportPacket}>Download JSON packet ↓</button>
   {vault?.secret&&<button type="button" className="ms-outline" onClick={onExportRecovery}>Download private recovery keys ↓</button>}
  </div>
  {vault?.secret&&<p className="br-heading-count">Save your private recovery backup before closing this page. Keys remain in this browser session.</p>}
  {overview.complete&&<details ref={coverPanel} className="br-surface br-customize" id="mint-nft-customization">
   <summary><span>Customize NFT appearance / tokenURI</span><StatusPill tone={imageURI?'success':'warning'}>{imageURI?'Cover verified':'Cover not yet verified'}</StatusPill></summary>
   <NftCoverPublisher packet={packet} mint={mint} vault={vault} preparedCover={preparedCover} onCoverVerified={onCoverVerified}/>
  </details>}
  {(overview.simulated||overview.complete)&&<PlayerReleasePublisher includeCover={false} packet={packet} mint={mint} vault={vault} delivery={delivery} onRetry={onRetry} busy={busy}/>}
  <div className="br-section-heading"><h3>Your Brick receipts</h3><small>Expand only what you need</small></div>
  <div className="br-grid br-grid--receipts">
   {(mint?.receipts||[]).map((r,i)=><article className="br-record" key={r.id||r.transactionHash||i}>
    <div className="br-record-header"><ArtworkTile imageURI={imageURI} localUrl={localUrl} title={r.title||title} caption={imageURI?'NFT cover':'Release preview'}/>
     <div className="br-record-copy"><span className="br-kicker">{r.role||'IP registration'}</span><h4>{r.title||title}</h4><StatusPill tone={overview.simulated?'neutral':r.status==='verified'?'success':'warning'}>{overview.simulated?'Simulated':r.status==='verified'?'Verified on chain':r.status||'Unverified'}</StatusPill></div>
    </div>
    <div className="br-record-footer"><small title={r.contractAddress||r.id}>{shortId(r.contractAddress||r.id)}</small><CopyAllButton label={r.role||r.title||'Brick'} text={formatMintReceiptForCopy(r,mint)}/></div>
    <details><summary>Receipt details &amp; wallet import</summary><div className="br-details"><dl>
     {r.nftContractAddress&&r.tokenId?<><div><dt>NFT contract address (import this)</dt><dd><CopyField label="NFT contract address" value={r.nftContractAddress}/></dd></div><div><dt>Token ID (decimal, import this)</dt><dd><CopyField label="NFT token ID" value={r.tokenId}/></dd></div></>:<div><dt>NFT import</dt><dd>{overview.simulated?'Not available in simulation.':'No verified ERC-721 receipt. This may be a legacy or incomplete registration.'}</dd></div>}
     {[[r.contractAddress,'Underlying Brick contract','Brick contract address'],[r.id,'Brick IP ID','Brick IP ID'],[r.transactionHash,'Transaction hash','transaction hash'],[r.blockNumber,'Block','block number'],[r.gasUsed,'Gas used','gas used']].filter(([v])=>v!==null&&v!==undefined&&v!=='').map(([value,label,copy])=><div key={label}><dt>{label}</dt><dd><CopyField label={copy} value={value}/></dd></div>)}
    </dl><p>The ERC-721 is a registration receipt, not proof of IP ownership.</p>
    {r.chainId===11155111&&r.transactionHash&&<a target="_blank" rel="noreferrer" href={'https://sepolia.etherscan.io/tx/'+r.transactionHash}>View on Sepolia Etherscan ↗</a>}
    </div></details>
   </article>)}
  </div>
  <details className="br-surface"><summary><span>Files, encrypted storage &amp; local downloads</span><small>{downloadSlots.length} session files</small></summary><div className="br-surface-body">
   <h3>Simulated authorized downloads</h3><p>Local demo authorization decrypts the original in this browser. It is not a remote access grant.</p>
   {downloadSlots.map(slot=><button key={slot.id} type="button" className="ms-outline" onClick={()=>onDownload(slot.id)}>DEMO authorize &amp; download {slot.label}</button>)}
   {packet.storage?.uploaded&&<><h3>Encrypted IPFS metadata</h3><p>These CIDs contain encrypted metadata, not public image files. Local pinning does not promise worldwide availability.</p>
    {packet.bricks.filter(b=>b.metadataCipherCid).map(b=><p key={b.localId}>{b.role}: <CopyField label={b.role+' metadata CID'} value={b.metadataCipherCid}/></p>)}
   </>}
  </div></details>
  <div className="br-actions"><button type="button" className="ms-outline" disabled={busy} onClick={onReset}>Start another work</button></div>
 </div>;
}
