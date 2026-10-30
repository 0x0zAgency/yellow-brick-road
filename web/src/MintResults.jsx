import {getIpCategory} from './ip-catalog.js';
import {FileRoleChips,rememberMintBuilding} from './ReleaseBuildingCard.jsx';
import {useEffect,useRef,useState} from 'react';
import {exportBuildingGraph} from './release-buildings.js';
import {ArtworkTile,StatusPill,useLocalCover} from './BrickPresentation.jsx';
import {mintOverview,shortId} from './brick-presentation.js';
import CopyField from './CopyField.jsx';
import CopyAllButton from './CopyAllButton.jsx';
import {formatMintReceiptForCopy} from './mint-receipt-copy.js';
import NftCoverPublisher from './NftCoverPublisher.jsx';
import PlayerReleasePublisher from './PlayerReleasePublisher.jsx';
import LicensingContactEditor from './LicensingContactEditor.jsx';

/** Human summary first. Every receipt and recovery action remains available. */
export default function MintResults({packet,mint,vault,preparedCover,delivery,onRetry,busy,onCoverVerified,onExportPacket,onExportRecovery,onReset,onDownload,downloadSlots=[]}){
 const playerEnabled=packet.bricks?.find(b=>b.localId==='master')?.metadata?.ipCategory?getIpCategory(packet.bricks.find(b=>b.localId==='master').metadata.ipCategory).group==='Music & audio':packet.building?.type==='music-release';
 const newReceipts=(mint?.receipts||[]).filter(r=>!r.reused),existingReceipts=(mint?.receipts||[]).filter(r=>r.reused);
 const newMint={...mint,receipts:newReceipts};
 const overview=mintOverview(mint,packet.bricks?.length||0),coverPanel=useRef(null);
 const localUrl=useLocalCover(packet,vault,preparedCover);
 const imageURI=mint?.nftCover?.status==='verified'?mint.nftCover.imageURI:null;
 const [buildingNotice,setBuildingNotice]=useState('');
 useEffect(()=>{
  let active=true;setBuildingNotice('');
  if(overview.complete)void rememberMintBuilding(packet,mint).catch(()=>{if(active)setBuildingNotice('Local Building grouping was not saved. Keep the JSON mint packet to restore it.');});
  return()=>{active=false;};
 },[packet,mint,overview.complete]);
 const downloadBuilding=()=>{
  try{const manifest=exportBuildingGraph(packet,mint);if(!manifest)throw Error('No Building membership in this packet.');
   const url=URL.createObjectURL(new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='ybr-building-manifest.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){setBuildingNotice(e.message);}
 };
 const title=packet.bricks?.[0]?.metadata?.title||mint?.receipts?.[0]?.title||'Your registered work';
 const openCover=()=>{if(coverPanel.current){coverPanel.current.open=true;coverPanel.current.querySelector('summary')?.focus();coverPanel.current.scrollIntoView({block:'start',behavior:'smooth'});}};
 return <div className="br-result" aria-label="Mint results">
  <h2>05. Mint results.</h2>
  <div className="br-hero">
   <ArtworkTile imageURI={imageURI} localUrl={localUrl} title={title} caption={imageURI?'NFT cover':'Local preview'}/>
   <div className="br-hero-copy"><span className="br-kicker">YOUR WORK / YOUR ROAD</span><h3>{title}</h3>
    <div className="br-badges"><StatusPill tone={overview.tone}>{overview.label}</StatusPill><StatusPill>{newReceipts.length} new Brick receipts · {existingReceipts.length} existing references</StatusPill>{mint?.atomic&&<StatusPill>1 mint transaction</StatusPill>}{mint?.receipts?.some(r=>r.reused)&&<StatusPill>{mint.receipts.filter(r=>r.reused).length} reused Bricks</StatusPill>}{!overview.simulated&&<StatusPill>{mint?.network||'Chain'} {mint?.chainId}</StatusPill>}</div>
    <p>{overview.simulated?'Preview only. No NFTs or blockchain transactions were created.':overview.complete?(mint?.reusedOnly?'Existing Bricks verified and associated with this Building. No new NFTs were minted.':mint?.nftCover?.atMint?'Your Bricks and their NFT images are confirmed together. Changing the artwork below is optional.':'Your registrations are confirmed. Customize their appearance below.'):'Keep these receipts. Check outstanding transactions before attempting any new mint.'}</p>
   </div>
  </div>
  {!overview.simulated&&!overview.complete&&<p className="br-warning" role="alert"><strong>Incomplete registration.</strong> {overview.verified} verified; {overview.outstanding} still need review. Pending or unverified transactions may still be mined. Do not mint duplicates.</p>}
  {mint?.nftCover?.error&&<p className="br-warning" role="alert">NFT artwork needs attention: {mint.nftCover.error} Your mint receipts are retained.</p>}
  <div className="br-actions">
   {overview.complete&&newReceipts.length>0&&<button type="button" className="ms-primary" onClick={openCover}>Customize NFT appearance</button>}
   <button type="button" className="ms-outline" onClick={onExportPacket}>Download JSON packet ↓</button>
   {packet.building&&<button type="button" className="ms-outline" onClick={downloadBuilding}>Download Building manifest ↓</button>}
   {vault?.secret&&<button type="button" className="ms-outline" onClick={onExportRecovery}>Download private recovery keys ↓</button>}
  </div>
  {vault?.secret&&<p className="br-heading-count">Save your private recovery backup before closing this page. Keys remain in this browser session.</p>}
  {overview.complete&&newReceipts.length>0&&<details ref={coverPanel} className="br-surface br-customize" id="mint-nft-customization">
   <summary><span>Customize NFT appearance / tokenURI</span><StatusPill tone={imageURI?'success':'warning'}>{imageURI?'Cover verified':'Cover not yet verified'}</StatusPill></summary>
   <NftCoverPublisher packet={packet} mint={newMint} vault={vault} preparedCover={preparedCover} onCoverVerified={onCoverVerified}/>
  </details>}
  {playerEnabled&&(overview.simulated||overview.complete)&&<PlayerReleasePublisher includeCover={false} packet={packet} mint={mint} vault={vault} delivery={delivery} onRetry={onRetry} busy={busy}/>}
  {buildingNotice&&<p className="br-warning" role="status">{buildingNotice}</p>}
  <details className="br-surface br-release-rollup" open={overview.outstanding>0&&!overview.simulated}>
   <summary><span>{packet.building?.type==='music-release'?'Music release Building':'Work Building'} · associated parts</span><StatusPill>{packet.bricks?.length||0} Bricks</StatusPill></summary>
   <div className="br-surface-body"><p className="br-building-note">One release, independent parts. Expand a Brick for its receipts and files. Membership does not transfer ownership or grant permissions. This is a contextual Building; no Building contract has been deployed.</p>
  <div className="br-grid br-grid--receipts">
   {(mint?.receipts||[]).map((r,i)=><article className="br-record" key={r.id||r.transactionHash||i}>
    <div className="br-record-header"><ArtworkTile imageURI={imageURI} localUrl={localUrl} title={r.title||title} caption={imageURI?'NFT cover':'Release preview'}/>
     <div className="br-record-copy"><span className="br-kicker">{r.role||'IP registration'}{r.reused?' · existing reference':''}</span><h4>{r.title||title}</h4><StatusPill tone={overview.simulated?'neutral':r.status==='verified'?'success':'warning'}>{overview.simulated?'Simulated':r.status==='verified'?'Verified on chain':r.status||'Unverified'}</StatusPill></div>
    </div>
    <FileRoleChips roles={(packet.bricks?.find(b=>b.localId===r.sourceId)?.metadata?.media||[]).map(f=>f.role)}/>
    {!overview.simulated&&r.status==='verified'&&<details><summary>Licensor contact</summary><LicensingContactEditor wallet={packet.account?.address} chainId={r.chainId} factoryAddress={mint.factoryAddress} brickAddress={r.contractAddress}/></details>}
    <div className="br-record-footer"><small title={r.contractAddress||r.id}>{shortId(r.contractAddress||r.id)}</small><CopyAllButton label={r.role||r.title||'Brick'} text={formatMintReceiptForCopy(r,mint)}/></div>
    <details><summary>Receipt details &amp; wallet import</summary><div className="br-details"><dl>
     {r.nftContractAddress&&r.tokenId?<><div><dt>NFT contract address (import this)</dt><dd><CopyField label="NFT contract address" value={r.nftContractAddress}/></dd></div><div><dt>Token ID (decimal, import this)</dt><dd><CopyField label="NFT token ID" value={r.tokenId}/></dd></div></>:<div><dt>NFT import</dt><dd>{overview.simulated?'Not available in simulation.':'No verified ERC-721 receipt. This may be a legacy or incomplete registration.'}</dd></div>}
     {[[r.contractAddress,'Underlying Brick contract','Brick contract address'],[r.id,'Brick IP ID','Brick IP ID'],[r.transactionHash,'Transaction hash','transaction hash'],[r.blockNumber,'Block','block number'],[r.gasUsed,r.gasScope==='batch'?'Gas used (shared batch)':'Gas used','gas used']].filter(([v])=>v!==null&&v!==undefined&&v!=='').map(([value,label,copy])=><div key={label}><dt>{label}</dt><dd><CopyField label={copy} value={value}/></dd></div>)}</dl><p>The ERC-721 is a registration receipt, not proof of IP ownership.</p>
    {r.chainId===11155111&&r.transactionHash&&<a target="_blank" rel="noreferrer" href={'https://sepolia.etherscan.io/tx/'+r.transactionHash}>View on Sepolia Etherscan ↗</a>}
    </div></details>
   </article>)}
  </div>
   </div></details>
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
