import {useCallback,useEffect,useRef,useState} from 'react';
import BrickMetadataEditor from './BrickMetadataEditor.jsx';
import NftCoverPublisher from './NftCoverPublisher.jsx';
import BrickPolicyEditor from './BrickPolicyEditor.jsx';
import LicensingContactEditor from './LicensingContactEditor.jsx';
import LicensingWorkspace from './licensing/LicensingWorkspace.jsx';
import {shortId} from './brick-presentation.js';
import './brick-editor.css';

const TABS=[['details','Work details'],['artwork','NFT artwork'],['contact','Licensor contact'],['content','Content controls'],['licensing','Licensing & funds']];
export default function BrickEditor({brick,chainId,factoryAddress,wallet,client,onSaved,onClose}){
 const [tab,setTab]=useState('details'),[visited,setVisited]=useState(['details']),[metadata,setMetadata]=useState(null),[edit,setEdit]=useState({dirty:false,busy:false,pending:false}),[invalid,setInvalid]=useState(false);
 const heading=useRef(null),onStateChange=useCallback(value=>setEdit(value),[]);
 useEffect(()=>{heading.current?.focus();heading.current?.scrollIntoView({block:'start'});const reset=()=>{setInvalid(true);setMetadata(null);setEdit({dirty:false,busy:false,pending:false});};window.ethereum?.on?.('accountsChanged',reset);window.ethereum?.on?.('chainChanged',reset);return()=>{window.ethereum?.removeListener?.('accountsChanged',reset);window.ethereum?.removeListener?.('chainChanged',reset);};},[]);
 const close=()=>{if(edit.busy)return;if((edit.dirty||edit.pending)&&!window.confirm(edit.pending?'A wallet transaction has been submitted. Keep the recovery backup and check confirmation before submitting again. Leave the editor?':'Discard unsaved work details and close the editor?'))return;onClose();};
 const nft=!!(brick.nftContractAddress&&brick.tokenId),common={wallet,chainId,factoryAddress,brickAddress:brick.address,client};
 return <section className="be" aria-label="Brick editor">
  <div className="be-header"><div><span className="br-kicker">MY BRICKS / EDIT</span><h2 ref={heading} tabIndex={-1}>{metadata?.title||'Edit Brick'}</h2><p><code>{shortId(brick.address)}</code> · Network {chainId}</p></div><button type="button" className="outline-btn" disabled={edit.busy} onClick={close}>Back to My Bricks</button></div>
  {invalid?<p role="alert" className="wb-warning">The wallet or network changed. Return to My Bricks and reopen the editor.</p>:<>
   <div className="be-tabs" role="tablist" aria-label="Brick settings">{TABS.filter(([key])=>key!=='artwork'||nft).map(([key,label],i)=><button key={key} type="button" role="tab" id={'be-tab-'+key} aria-controls={'be-panel-'+key} aria-selected={tab===key} tabIndex={tab===key?0:-1} onClick={()=>{setTab(key);setVisited(old=>old.includes(key)?old:[...old,key]);}} onKeyDown={e=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();const tabs=[...e.currentTarget.parentElement.querySelectorAll('[role=tab]')];const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next].focus();tabs[next].click();}}}>{label}</button>)}</div>
   {TABS.map(([key])=><div key={key} id={'be-panel-'+key} role="tabpanel" aria-labelledby={'be-tab-'+key} hidden={tab!==key} className="be-panel">{visited.includes(key)&&<>
    {key==='details'&&<BrickMetadataEditor {...common} brick={brick} onSaved={onSaved} onLoaded={setMetadata} onStateChange={onStateChange}/>}
    {key==='artwork'&&nft&&<NftCoverPublisher wallet={wallet} mint={{simulated:false,status:'confirmed',chainId,factoryAddress,receipts:[{status:'verified',chainId,nftContractAddress:brick.nftContractAddress,tokenId:brick.tokenId,contractAddress:brick.address}]}}/>}
    {key==='contact'&&<LicensingContactEditor {...common}/>}
    {key==='content'&&<BrickPolicyEditor {...common} showPlayerPermissions={metadata?!!metadata.music||['sound-recording','musical-work','audio'].includes(metadata.objectType):null}/>}
    {key==='licensing'&&<LicensingWorkspace initialBrick={brick.address} initialTab="rules"/>}
   </>}</div>)}
  </>}
 </section>;
}
