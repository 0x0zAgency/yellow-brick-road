import {displayWorkTitle} from './work-titles.js';
import RoadProgress from './RoadProgress.jsx';
import {Search,SlidersHorizontal,Bookmark,LayoutGrid,List,ArrowUpRight,X} from 'lucide-react';
import {useEffect,useRef,useState} from 'react';
import {SEARCH_DEFAULTS,SEARCH_PURPOSES,WORK_TYPES,publicWorkType,publicWorkTypeLabel,validateSearch,licenseScope} from './registry-search.js';
import {readBrickLicensingContact} from './licensing-contact-chain.js';
import {licensingMailto} from './licensing-contact.js';
import {RegistrationThumbnail,StatusPill} from './BrickPresentation.jsx';
import CopyField from './CopyField.jsx';
import './registry-search.css';

export function RegistrySearch({filters,onChange,purpose,onPurpose,rows=[],shortlistCount,wallet,view,onView}){
 const [advanced,setAdvanced]=useState(false);
 const change=(key,value)=>onChange({...filters,[key]:value});
 const error=validateSearch(filters),count=rows.length;
 return <section className="rs-search" aria-label="Search the IP Registry">
  <div className="rs-purpose" role="group" aria-label="Your intended use">{SEARCH_PURPOSES.map(([id,label])=><button type="button" key={id} aria-pressed={purpose===id} onClick={()=>onPurpose(id)}>{label}</button>)}</div>
  <div className="rs-query"><label><Search size={21}/><input aria-label="Search on-chain registrations" type="search" maxLength={300} placeholder="Search a work, creator, wallet, contract or IP identity" value={filters.query} onChange={e=>change('query',e.target.value)}/></label><button type="button" className="quiet" aria-expanded={advanced} aria-controls="registry-search-filters" onClick={()=>setAdvanced(!advanced)}><SlidersHorizontal size={16}/> Filters</button></div>
  <p className="rs-hint">{purpose==='purchase'?'Explore works and ask the licensor about a purchase. Sale availability and prices are not published in this index.':purpose==='explore'?'Search public labels and verified registrations. Private titles and work types remain undisclosed.':'Choose a work to propose a license. Available scopes and acceptance terms are checked in the offer workspace.'}</p>
  {advanced&&<div className="rs-filters" id="registry-search-filters">
   <label>Work type<select aria-label="Work type" value={filters.category} onChange={e=>change('category',e.target.value)}>{WORK_TYPES.map(([id,label])=><option key={id} value={id}>{label} ({id==='all'?count:rows.filter(row=>publicWorkType(row)===id).length})</option>)}</select></label>
   <label>Public preview<select aria-label="Public preview" value={filters.preview} onChange={e=>change('preview',e.target.value)}><option value="all">Any availability</option><option value="available">Preview available</option><option value="unavailable">No public preview</option></select></label>
   <label>Wallet role<select aria-label="Wallet role" value={filters.walletRole} onChange={e=>change('walletRole',e.target.value)}><option value="either">Creator or current controller</option><option value="originator">Original creator</option><option value="controller">Current controller</option></select></label>
   <label className="rs-wallet">Wallet address<input autoComplete="off" spellCheck="false" maxLength={42} placeholder="0x…" value={filters.wallet} onChange={e=>change('wallet',e.target.value)}/></label>
   <label>Registered from block<input inputMode="numeric" maxLength={78} placeholder="Any" value={filters.fromBlock} onChange={e=>change('fromBlock',e.target.value)}/></label>
   <label>Registered through block<input inputMode="numeric" maxLength={78} placeholder="Any" value={filters.toBlock} onChange={e=>change('toBlock',e.target.value)}/></label>
   <p className="rs-hint rs-filter-note">Work types require a public label. Preview access does not grant reuse rights. Price, territory and exclusivity filters will require published licensing listings.</p>
  </div>}
  {error&&<p role="alert" className="rs-error">{error}</p>}
  <div className="rs-toolbar">
   <button type="button" className="quiet" aria-pressed={filters.shortlisted} onClick={()=>change('shortlisted',!filters.shortlisted)}><Bookmark size={15}/> Shortlist ({shortlistCount})</button>
   {wallet&&<label className="rs-mine"><input type="checkbox" checked={filters.mine} onChange={e=>change('mine',e.target.checked)}/> Created by me</label>}
   <button type="button" className="text-action" onClick={()=>onChange({...SEARCH_DEFAULTS})}>Clear filters</button>
   <label className="rs-sort">Sort by<select aria-label="Sort by" value={filters.sort} onChange={e=>change('sort',e.target.value)}><option value="newest">Newest registered</option><option value="oldest">Oldest registered</option><option value="title">Title A–Z</option></select></label>
   <div className="rs-views" role="group" aria-label="Result layout"><button type="button" aria-label="Grid view" aria-pressed={view==='grid'} onClick={()=>onView('grid')}><LayoutGrid size={17}/></button><button type="button" aria-label="List view" aria-pressed={view==='list'} onClick={()=>onView('list')}><List size={17}/></button></div>
  </div>
 </section>;
}

export function openRegistryLicense(brick,purpose){
 window.dispatchEvent(new CustomEvent('ybr:license-brick',{detail:{brickAddress:brick.registration.brickAddress,scope:licenseScope(purpose)}}));
}

/** Native modal handles focus containment, Escape and focus return without wallet prompts. */
export function RegistryWorkDetails({brick,network,client,anchor,purpose,saved,saveError,onSave,onClose}){
 const dialog=useRef(null),[contact,setContact]=useState(null),[contactError,setContactError]=useState(''),[reading,setReading]=useState(true),[retry,setRetry]=useState(0);
 const r=brick.registration;
 useEffect(()=>{const node=dialog.current,previous=document.activeElement;node?.showModal();return()=>{node?.close();if(previous?.isConnected)previous.focus();};},[]);
 useEffect(()=>{
  let alive=true;setContact(null);setContactError('');setReading(true);
  if(!client){setReading(false);setContactError('The chain reader is unavailable. Refresh the registry to retry.');return;}
  readBrickLicensingContact({client,chainId:r.chainId,factoryAddress:r.factoryAddress,brickAddress:r.brickAddress}).then(value=>{
   if(network.genesisHash&&value.genesisHash.toLowerCase()!==network.genesisHash.toLowerCase())throw Error('The chain history changed. Refresh the registry.');
   if(alive)setContact(value);
  }).catch(e=>{if(alive)setContactError(e.shortMessage||e.message);}).finally(()=>{if(alive)setReading(false);});
  return()=>{alive=false;};
 },[client,r.chainId,r.factoryAddress,r.brickAddress,r.controller,network.genesisHash,retry]);
 const purchase=purpose==='purchase';
 return <dialog className="rs-dialog" ref={dialog} aria-labelledby="registry-work-title" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
  <div className="rs-dialog-body">
   <div className="rs-dialog-top"><span className="br-kicker">IP REGISTRY / WORK DETAILS</span><button type="button" className="quiet" aria-label="Close work details" onClick={onClose} autoFocus><X size={18}/></button></div>
   <div className="br-record-header"><RegistrationThumbnail client={client} anchor={anchor} title={displayWorkTitle(brick)} identity={{chainId:r.chainId,factoryAddress:r.factoryAddress,brickAddress:r.brickAddress,ipId:r.ipId,originator:r.originator}}/><div className="br-record-copy"><h2 id="registry-work-title">{displayWorkTitle(brick)}</h2><p>{brick.workTitleSource==='local'?'Work title from this device':brick.source==='road'?brick.creator:'Public title not disclosed'}</p><StatusPill>{publicWorkTypeLabel(brick)}</StatusPill></div></div>
   <p>{brick.source==='road'?brick.description:'This work is registered. Its private metadata is not opened by search.'}</p>
   <div className="rs-facts"><div><span>Registration</span><strong>Block {r.blockNumber}</strong></div><div><span>Network</span><strong>{network.label||'Chain '+r.chainId}</strong></div><div><span>Public preview</span><strong>{brick.streamAllowed?'Available in YBR Player':'Not published'}</strong></div><div><span>Licensing / sale terms</span><strong>Confirm with licensor</strong></div></div>
   <section className="rs-next"><h3>{purchase?'Discuss acquiring this IP':'Propose a license for this IP'}</h3><p>{purchase?'Contact the licensor about the rights you want to acquire. This is an inquiry; the registry does not provide purchase checkout.':'Bring this work into an ingestion or publishing project. Review its supported scopes, creator terms and approval requirements in the offer workspace.'}</p>
    <div className="rs-actions">{!purchase&&<button type="button" className="gold-btn" onClick={()=>openRegistryLicense(brick,purpose)}>Propose {purpose==='publishing'?'publishing':purpose==='ingestion'?'ingestion':'a'} license <ArrowUpRight size={16}/></button>}<button type="button" className="quiet" aria-pressed={saved} onClick={onSave}><Bookmark size={15}/>{saved?'Saved to shortlist':'Save to shortlist'}</button>{brick.streamAllowed&&<a className="text-action" href="//127.0.0.1:4173/" target="_blank" rel="noreferrer">Open YBR Player ↗</a>}</div>
    {saveError&&<p role="alert" className="rs-error">{saveError}</p>}<div className="rs-contact"><strong>Licensor contact</strong>{reading?<RoadProgress size="compact" label="Reading the public contact from this Brick…"/>:contactError?<><p role="alert">{contactError}</p><button type="button" className="text-action" onClick={()=>setRetry(n=>n+1)}>Retry contact</button></>:contact?.email?<><a href={licensingMailto(contact.email)}>{contact.email}</a><small>Opens your email app. No message is sent automatically.</small></>:<p>No public licensing email has been supplied.</p>}</div>
   </section>
   <details className="rs-chain"><summary>Registration &amp; provenance</summary><p>A registration records a claim. Licensing and any transfer of IP rights require agreed terms.</p>{[[r.brickAddress,'Brick contract'],[r.ipId,'IP identity'],[r.originator,'Original creator wallet'],[r.controller,'Current controller'],[r.factoryAddress,'Registry factory'],[r.transactionHash,'Registration transaction'],[r.contentHash,'Content commitment'],[r.metadataDigest,'Metadata commitment']].map(([value,label])=><CopyField key={label} value={value} label={label}/>)}</details>
  </div>
 </dialog>;
}
