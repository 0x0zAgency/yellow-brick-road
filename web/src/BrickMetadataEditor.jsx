import RoadProgress from './RoadProgress.jsx';
import {useEffect,useRef,useState} from 'react';
import {parseRecoveryFile,MAX_RECOVERY_FILE_BYTES} from './ipfs-recovery.js';
import {DETAIL_FIELDS,MUSIC_FIELDS,IDENTIFIER_FIELDS,brickDetails,applyBrickDetails,openBrickMetadata,prepareBrickMetadata,refreshEditedBuilding} from './brick-editor.js';
import {readBrickForEditing,assertBrickEditReview,updateBrickMetadata,confirmBrickMetadataUpdate} from './brick-editor-chain.js';
import {BUILDING_EVENT} from './ReleaseBuildingCard.jsx';
import {listRecoveryFiles,saveRecoveryFile} from './recovery-vault.js';
import {findLocalBrickRecovery} from './local-brick-recovery.js';

export default function BrickMetadataEditor({wallet,chainId,factoryAddress,brick,client,onSaved,onLoaded,onStateChange}){
 const [session,setSession]=useState(null),[draft,setDraft]=useState(null),[reviewing,setReviewing]=useState(false),[prepared,setPrepared]=useState(null),[txHash,setTxHash]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState(''),[backup,setBackup]=useState(null);
 const [localNotice,setLocalNotice]=useState('');
 const generation=useRef(0),mutex=useRef(false),abort=useRef(null),input=useRef(null);
 const dirty=!!session&&JSON.stringify(draft)!==JSON.stringify(brickDetails(session.metadata));
 useEffect(()=>{onStateChange({dirty,busy,pending:!!txHash});},[dirty,busy,txHash,onStateChange]);
 useEffect(()=>{const warn=e=>{if(dirty||txHash||busy){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty,txHash,busy]);
 useEffect(()=>{void loadLocal();return()=>{generation.current++;abort.current?.abort();mutex.current=false;};},[wallet,chainId,factoryAddress,brick.address]);
 const options=()=>({provider:window.ethereum,walletAddress:wallet,chainId:Number(chainId),factoryAddress,brickAddress:brick.address});
 const begin=()=>{mutex.current=true;setBusy(true);setError('');const id=++generation.current;return {id,assertActive:()=>{if(id!==generation.current)throw Error('Editor session changed. Reopen the Brick.');}};};
 const finish=id=>{if(id===generation.current){mutex.current=false;setBusy(false);}};
 const remember=async(kit,review,title,name,id)=>{
  try{await saveRecoveryFile({wallet,kit,title,name:name||'brick-'+brick.address.slice(2,10)+'-recovery.json',bindings:[{...review,title}]});if(id===generation.current)setLocalNotice('Recovery file saved in this browser. Manage copies in Tools → Recovery files.');}
  catch{if(id===generation.current)setLocalNotice('Local recovery storage is unavailable or full. Download your recovery file to keep a copy.');}
 };
 async function loadLocal(){
  if(mutex.current)return;
  const {id,assertActive}=begin();abort.current=new AbortController();setStatus('Looking for a saved recovery file…');
  try{
   const records=await listRecoveryFiles(wallet);assertActive();
   if(!records.length){setStatus('No saved recovery file yet. Import it below to open this Brick.');return;}
   const review=await readBrickForEditing({...options(),client});assertActive();
   if(review.controller.toLowerCase()!==wallet?.toLowerCase())throw Error('Only the current Brick controller can edit its work details.');
   const match=await findLocalBrickRecovery({wallet,review,records,signal:abort.current.signal});assertActive();
   if(!match){setStatus('No saved recovery file matches this Brick. Import its recovery JSON below.');return;}
   setSession({kit:match.record.kit,review,metadata:match.metadata});setDraft(brickDetails(match.metadata));onLoaded(match.metadata);
   setStatus('Loaded saved recovery file · verified metadata version '+review.metadataVersion+'.');
   await remember(match.record.kit,review,match.metadata.title,match.record.name,id);
  }catch(e){if(id===generation.current){setStatus('');setLocalNotice(e.shortMessage||e.message);}}
  finally{finish(id);}
 }
 const load=async file=>{
  if(!file||mutex.current)return;
  const {id,assertActive}=begin();setSession(null);setDraft(null);setPrepared(null);setTxHash('');setBackup(null);setReviewing(false);onLoaded(null);setStatus('Reading the Brick and verifying its encrypted metadata…');
  abort.current=new AbortController();
  try{
   if(file.size>MAX_RECOVERY_FILE_BYTES)throw Error('Choose a private recovery JSON file no larger than 1 MiB.');
   const kit=parseRecoveryFile(await file.text()),review=await readBrickForEditing({...options(),client});assertActive();
   if(review.controller.toLowerCase()!==wallet?.toLowerCase())throw Error('Only the current Brick controller can edit its work details.');
   const metadata=await openBrickMetadata({review,kit,signal:abort.current.signal});assertActive();
   setSession({kit,review,metadata});setDraft(brickDetails(metadata));onLoaded(metadata);
   setStatus('Work details verified against metadata version '+review.metadataVersion+'.');
   await remember(kit,review,metadata.title,file.name,id);
  }catch(e){if(id===generation.current){setStatus('');setError(e.shortMessage||e.message);}}
  finally{finish(id);if(input.current)input.current.value='';}
 };
 const edit=change=>{setDraft(old=>({...old,...change}));setReviewing(false);setPrepared(null);setError('');setStatus('');};
 const reviewChanges=()=>{try{const result=applyBrickDetails(session.metadata,draft);if(!result.changes.length)throw Error('There are no changes to save.');setReviewing(true);setError('');}catch(e){setError(e.message);}};
 const save=async()=>{
  if(mutex.current||!session)return;
  const {id,assertActive}=begin();
  try{
   const base={...options(),review:session.review,assertActive};
   let pin=prepared;
   if(!txHash){
    await assertBrickEditReview(base);assertActive();
    setStatus('Encrypting and pinning the updated work details…');
    pin=pin||await prepareBrickMetadata({metadata:session.metadata,draft,review:session.review,kit:session.kit});assertActive();
    setPrepared(pin);setBackup(pin.backup);
    await remember(pin.backup,session.review,pin.metadata.title,null,id);assertActive();
    setStatus('Confirm the metadata update in your wallet.');
   }else setStatus('Checking the submitted transaction…');
   const result=txHash?await confirmBrickMetadataUpdate({...base,prepared:pin,transactionHash:txHash}):await updateBrickMetadata({...base,prepared:pin,onSubmitted:hash=>{if(id===generation.current){setTxHash(hash);setStatus('Transaction submitted. Waiting for confirmation…');}}});
   assertActive();
   let groupingNotice='';
   try{refreshEditedBuilding(window.localStorage,session.review,result.current,pin.metadata.title);window.dispatchEvent(new Event(BUILDING_EVENT));}catch{groupingNotice=' Local Building grouping could not be refreshed.';}
   setSession({kit:pin.backup,review:result.current,metadata:pin.metadata});setDraft(brickDetails(pin.metadata));setReviewing(false);setPrepared(null);setTxHash('');onLoaded(pin.metadata);
   onSaved(result.current);setStatus('Saved to this Brick as metadata version '+result.current.metadataVersion+'.'+groupingNotice);
   await remember(pin.backup,result.current,pin.metadata.title,null,id);
  }catch(e){if(id===generation.current){setStatus('');setError(e.shortMessage||e.message);}}
  finally{finish(id);}
 };
 const download=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='brick-'+brick.address.slice(2,10)+'-recovery.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const clear=()=>{if(busy)return;if((dirty||txHash)&&!window.confirm(txHash?'A transaction has already been submitted. Keep your recovery backup and check the Brick before retrying. Clear this session?':'Discard unsaved work details?'))return;generation.current++;abort.current?.abort();setSession(null);setDraft(null);setPrepared(null);setTxHash('');setBackup(null);setReviewing(false);setError('');setStatus('Private editing session cleared.');onLoaded(null);};
 let changes=[];try{if(session&&draft)changes=applyBrickDetails(session.metadata,draft).changes;}catch{/* Validation is shown when Review is selected. */}
 return <section aria-label="Edit work details" className="be-details" aria-busy={busy}>
  <h3>Work details</h3><p>A matching recovery file loads automatically from this browser. Work details are decrypted locally and verified against this Brick.</p>
  <details open={!session}><summary>{session?'Use another recovery file':'Import a recovery file'}</summary><label className="be-import">Private recovery file<input ref={input} type="file" accept="application/json,.json" disabled={busy||!!txHash||dirty} onChange={e=>void load(e.target.files?.[0])}/></label></details>
  {session&&<><div className="be-status"><span>Verified version {session.review.metadataVersion}</span><span>{session.metadata.categoryLabel||session.metadata.objectType}</span><span>{dirty?'Unsaved changes':'Up to date'}</span></div>
   <fieldset disabled={busy||!!txHash}><legend className="visually-hidden">Descriptive metadata</legend><div className="be-fields">
    {DETAIL_FIELDS.map(([key,label,max])=><label key={key} className={key==='description'?'be-wide':''}>{label}{key==='description'?<textarea rows={4} maxLength={max} value={draft[key]} onChange={e=>edit({[key]:e.target.value})}/>:<input maxLength={max} value={draft[key]} onChange={e=>edit({[key]:e.target.value})}/>}</label>)}
   </div><h4>Creator credits</h4><p className="be-note">Credit corrections describe the work. Collaborator wallets and payment shares are managed under Licensing &amp; funds.</p>
   {draft.creators.map((credit,i)=><div className="be-fields be-credit" key={i}>{['name','role'].map(key=><label key={key}>{'Credit '+(i+1)+' '+key}<input maxLength={1024} value={credit[key]} onChange={e=>edit({creators:draft.creators.map((c,j)=>i===j?{...c,[key]:e.target.value}:c)})}/></label>)}{session.metadata.creators[i].wallet&&<small className="be-wide">Wallet: <code>{session.metadata.creators[i].wallet}</code></small>}</div>)}
   {!draft.creators.length&&<p>No creator credits were recorded.</p>}
   {draft.music&&<><h4>Music details</h4><div className="be-fields">{MUSIC_FIELDS.map(([key,label])=><label key={key}>{label}<input maxLength={1024} inputMode={key==='bpm'?'decimal':undefined} value={draft.music[key]} onChange={e=>edit({music:{...draft.music,[key]:e.target.value}})}/></label>)}</div></>}
   <details className="be-identifiers"><summary>Industry identifiers</summary><div className="be-fields">{IDENTIFIER_FIELDS.map(key=><label key={key}>{key.toUpperCase()}<input maxLength={1024} value={draft.identifiers[key]} onChange={e=>edit({identifiers:{...draft.identifiers,[key]:e.target.value}})}/></label>)}</div></details>
   <div className="be-actions"><button type="button" className="gold-btn" disabled={!dirty} onClick={reviewChanges}>Review changes</button><button type="button" className="quiet" disabled={!dirty} onClick={()=>{setDraft(brickDetails(session.metadata));setReviewing(false);setPrepared(null);setError('');}}>Reset changes</button></div>
   </fieldset>
   {reviewing&&session.metadata.music&&<p className="wb-warning">Previously delivered Player copies may become unavailable until redelivered with these updated details.</p>}
   {reviewing&&<section className="be-review" aria-label="Review Brick changes"><h4>Review changes</h4><dl>{changes.map(change=><div key={change.label}><dt>{change.label}</dt><dd><span>{change.before||'(empty)'}</span><strong>{change.after||'(empty)'}</strong></dd></div>)}</dl><p>This saves a new encrypted metadata version to the same Brick. Its source files, NFT identity, licensing terms, permissions and payment shares are preserved.</p><button type="button" className="gold-btn" disabled={busy||!!txHash} onClick={()=>void save()}>Save changes to Brick</button></section>}
  </>}
  {txHash&&<div className="be-review"><p>Submitted transaction: <code>{txHash}</code></p><button type="button" className="outline-btn" disabled={busy} onClick={()=>void save()}>Check confirmation</button></div>}
  {backup&&<button type="button" className="outline-btn" onClick={download}>Download updated recovery file</button>}
  {(session||backup||txHash)&&<button type="button" className="quiet" disabled={busy} onClick={clear}>Clear private session</button>}
  {!session&&<button type="button" className="quiet" disabled={busy} onClick={()=>void loadLocal()}>Load saved recovery file</button>}
  {localNotice&&<p className="be-note">{localNotice}</p>}
  {busy?<RoadProgress label={status||'Working on this Brick…'}/>:status&&<p role="status" className="be-notice">{status}</p>}{error&&<p role="alert" className="wb-error">{error}</p>}
 </section>;
}
