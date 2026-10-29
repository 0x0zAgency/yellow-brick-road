import {useRef} from 'react';
import {RegistrationThumbnail,StatusPill} from './BrickPresentation.jsx';
import {shortId} from './brick-presentation.js';
import CopyField from './CopyField.jsx';
import NftCoverPublisher from './NftCoverPublisher.jsx';
import BrickPolicyEditor from './BrickPolicyEditor.jsx';
import LicensingContactEditor from './LicensingContactEditor.jsx';
import IpfsRecovery from './IpfsRecovery.jsx';
import {validCid} from './ipfs-upload.js';

export default function WalletBrickCard({brick,chainId,factoryAddress,wallet,client,recovering,onRecover,onCloseRecovery}){
 const cover=useRef(null);
 const nft=!!(brick.nftContractAddress&&brick.tokenId);
 const customize=()=>{if(cover.current){cover.current.open=true;cover.current.querySelector('summary')?.focus();}};
 return <article className="br-record" aria-label={'Brick '+shortId(brick.address)}>
  <div className="br-record-header">
   <RegistrationThumbnail client={nft?client:null} title={'Brick '+shortId(brick.address)} identity={{chainId,factoryAddress,brickAddress:brick.address,ipId:brick.ipId,collection:brick.nftContractAddress,tokenId:brick.tokenId,originator:brick.originator}}/>
   <div className="br-record-copy"><span className="br-kicker">REGISTERED WORK · BLOCK {brick.blockNumber}</span><h3>{shortId(brick.address)}</h3>
    <StatusPill tone={brick.creatorIsController?'success':'warning'}>{brick.creatorIsController?'Creator controls':'Controller changed'}</StatusPill>
    <p>Private work labels stay private.</p>
   </div>
  </div>
  <div className="br-record-footer">{nft?<button className="text-action" type="button" onClick={customize}>Customize NFT ↗</button>:<small>Legacy registration · no NFT receipt</small>}
   {brick.metadataURI?.startsWith('ipfs://')&&validCid(brick.metadataURI.slice(7))&&<button type="button" className="text-action" onClick={onRecover}>Recover encrypted files</button>}
  </div>
  {nft&&<details ref={cover} className="wb-nft-cover"><summary>Set or update NFT cover</summary><NftCoverPublisher wallet={wallet} mint={{simulated:false,status:'confirmed',chainId,factoryAddress,receipts:[{status:'verified',chainId,nftContractAddress:brick.nftContractAddress,tokenId:brick.tokenId,contractAddress:brick.address}]}}/></details>}
  <details><summary>Player permissions and content lock</summary><div className="br-details"><BrickPolicyEditor wallet={wallet} chainId={chainId} factoryAddress={factoryAddress} brickAddress={brick.address}/></div></details>
  <details><summary>Licensor contact</summary><div className="br-details"><LicensingContactEditor wallet={wallet} client={client} chainId={chainId} factoryAddress={factoryAddress} brickAddress={brick.address}/></div></details>
  <details><summary>On-chain details &amp; wallet import</summary><div className="br-details"><dl>
   {nft&&<><div><dt>NFT contract address (wallet import)</dt><dd><CopyField label="NFT contract address" value={brick.nftContractAddress}/></dd></div><div><dt>Token ID (decimal, wallet import)</dt><dd><CopyField label="NFT token ID" value={brick.tokenId}/></dd></div></>}
   {[[brick.address,'Brick contract','Brick contract address'],[brick.ipId,'IP identity','IP identity'],[brick.originator,'Originator','originator'],[brick.controller,'Current controller','current controller'],[brick.contentHash,'Content commitment','content commitment'],[brick.metadataDigest,'Metadata commitment','metadata commitment'],[brick.metadataVersion,'Metadata version','metadata version'],[brick.metadataURI,'Metadata reference','metadata reference'],[brick.transactionHash,'Mint transaction','mint transaction'],[brick.blockNumber,'Block','block number']].map(([value,label,copy])=><div key={label}><dt>{label}</dt><dd><CopyField label={copy} value={value}/></dd></div>)}
  </dl>{chainId===11155111&&<div className="wb-brick-links"><a href={'https://sepolia.etherscan.io/address/'+brick.address} rel="noreferrer" target="_blank">View contract on Sepolia ↗</a><a href={'https://sepolia.etherscan.io/tx/'+brick.transactionHash} rel="noreferrer" target="_blank">View mint transaction ↗</a></div>}</div></details>
  {recovering&&<div className="br-details"><IpfsRecovery key={chainId+':'+brick.address+':'+brick.metadataDigest} brick={brick} onClose={onCloseRecovery}/></div>}
 </article>;
}
