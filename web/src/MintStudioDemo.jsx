import ExistingFileBricks from './ExistingFileBricks.jsx';
import SongwriterSplits from './SongwriterSplits.jsx';
import {songwriterNames,validateSongwriterSplits} from './songwriter-splits.js';
import {newUploadRoles,retainMatchingReuse} from './reuse-bricks.js';
import {ACTIVE_NETWORK} from './active-network.js';
import MintResults from './MintResults.jsx';
import NftCoverReview from './NftCoverReview.jsx';
import AlbumCoverSuggestion from './AlbumCoverSuggestion.jsx';
import {previewAlbum,rememberAlbumCover} from './album-covers.js';
import {uploadFilter,validatePreviewSelection} from './upload-filters.js';
import {loadCreatorDefaults,applyCreatorDefaults,initialContentPolicy,defaultDeliveryApproved} from './creator-defaults.js';
import {isRasterCoverFile} from './nft-cover-source.js';
import {mintWithReviewedCover,preflightMintCover} from './nft-cover-mint.js';
import ContentPolicyReview from './ContentPolicyReview.jsx';
import {startupGanacheFactory,selectedMintFactory} from './mint-factory.js';
import MusicGenreSelect from './MusicGenreSelect.jsx';
import {reviewPlayerDelivery,deliverPlayerAfterMint} from './player-delivery.js';
import {LinkAuthorizationCreator,walletClientForLinks} from './BrickLinkApprovals.jsx';
import {preflightLinkedBricks} from './brick-authorization.js';
import {loadMintForm,loadMintNetwork,saveMintForm,saveMintNetwork,clearMintForm,defaultMintForm} from './mint-persistence.js';
import {mintMode,preflightPolicyMint} from './chain-mint.js';
import {factoryStorageKey} from './brick-viewer-model.js';
import {Fragment,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createMintStepNavigator} from './mint-step-navigation.js';
import {uploadSectionBefore} from './mint-file-sections.js';
import {aliasFor,availableAssetSlots,makeRegistrationPacket,trainingModes,validateMintInput} from './mint-model.js';
import useUploadMetadata from './useUploadMetadata.js';
import {encryptDemoBatch,openDemoDownload} from './demo-vault.js';
import {simulateMintReceipts} from './demo-mint.js';
import {uploadEncryptedAsset,checkLocalIpfs,pinEncryptedBrickMetadata} from './ipfs-upload.js';
import {buildRecoveryFile} from './ipfs-recovery.js';
import {MAX_ASSET_BYTES,ASSET_LIMIT_LABEL} from './asset-limits.js';
import {IP_CATEGORIES,SPATIAL_FIELDS,getIpCategory,groupedIpCategories} from './ip-catalog.js';
import './mint-studio.css';
import './mint-demo.css';
const stages=['Identity','Files','Rights','Review','Receipts'];
const fields=[['title','Track title'],['artist','Recording artist / claimant'],['songwriters','Songwriters / composers (comma-separated)'],['daw','DAW / software'],['release','Album / release'],['genre','Genre'],['bpm','BPM'],['key','Musical key'],['isrc','Recording ISRC'],['iswc','Composition ISWC'],['description','Notes']];
const initial={title:'',artist:'',songwriters:'',daw:'FL Studio',release:'',genre:'',bpm:'',key:'',isrc:'',iswc:'',description:''};
const labels={master:'Master recording',preview:'Audio preview',artwork:'Cover artwork',lyrics:'Lyrics manuscript / writing evidence',project:'Project File',metadata:'Metadata sidecar'};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function UploadSectionHeading({slotId,category}){
 const section=uploadSectionBefore(slotId,category);
 return section?<div className="ms-file-heading"><h3>{section.title}</h3><p>{section.description}</p></div>:null;
}
export default function MintStudioDemo({wallet,displayName,onConnect,ganacheFactory=import.meta.env.VITE_ROAD_GANACHE_FACTORY||''}){
 const [saved]=useState(()=>{
  const store=typeof window==='undefined'?null:window.localStorage;
  const settings=loadMintNetwork(store);
  if(ACTIVE_NETWORK){settings.network=ACTIVE_NETWORK.network;settings.useStartupFactory=true;if(ACTIVE_NETWORK.network==='ganache'){settings.rpcUrl='http://127.0.0.1:8545';settings.ganacheChainId='1337';}}
  const defaults=loadCreatorDefaults(store);
  return {form:applyCreatorDefaults(loadMintForm(store)||defaultMintForm(),defaults),settings,defaults};
 });
 const [step,setStep]=useState(0),[assets,setAssets]=useState({});
 const autofill=useUploadMetadata(saved.form.meta);
 const {meta}=autofill;
 const [ipCategoryId,setIpCategoryId]=useState(saved.form.ipCategoryId),[spatial,setSpatial]=useState(saved.form.spatial);
 const category=getIpCategory(ipCategoryId),isMusic=!!category.musical,playerEnabled=category.group==='Music & audio';
 const visibleSlots=availableAssetSlots(ipCategoryId);
 const slotLabel=id=>id==='master'?category.primary:id==='project'&&category.spatial?'Spatial / skeletal tracking data':labels[id];
 const refs=useRef({}),vault=useRef({secret:null,encrypted:new Map()}),fileGeneration=useRef(0);
 const deliveryWork=useRef(null),reviewedDelivery=useRef(null),deliveryJob=useRef(null);
 useEffect(()=>()=>{fileGeneration.current++;refs.current={};deliveryWork.current?.abort();},[]);
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
 const [ipfsEnabled,setIpfsEnabled]=useState(false),[ipfsHealth,setIpfsHealth]=useState('');
 const [creatorDefaults,setCreatorDefaults]=useState(saved.defaults);
 const [contentPolicy,setContentPolicy]=useState(()=>initialContentPolicy(saved.defaults));
 const [deliveryChoice,setDeliveryChoice]=useState('default');
 const [nftCover,setNftCover]=useState(null);
 const [deliveryConsent,setDeliveryConsent]=useState(null),[playerDelivery,setPlayerDelivery]=useState({status:'not-requested'});
 const [composition,setComposition]=useState(saved.form.composition),[training,setTraining]=useState(saved.form.training),[share,setShare]=useState(saved.form.share);
 const [currency,setCurrency]=useState(saved.form.currency),[unit,setUnit]=useState(saved.form.unit);
 const [fees,setFees]=useState(saved.form.fees);
 const [licensingEmail,setLicensingEmail]=useState(saved.form.licensingEmail||'');
 const [cover,setCover]=useState(saved.form.cover||{useMainArtist:true,artist:'',title:'',description:'',wallet:'',ipCategory:'illustration'});
 // Signed responses and local cross-wallet requests remain in volatile React state, not localStorage.
 const [linkedBricks,setLinkedBricks]=useState([]);
 const [reusedBricks,setReusedBricks]=useState({}),[songwriterSplits,setSongwriterSplits]=useState(null),[showSplits,setShowSplits]=useState(false);
 const writers=songwriterNames(meta.songwriters);
 const needsSplits=isMusic&&composition&&!reusedBricks.composition&&!linkedBricks.some(l=>l.relation==='embodies-composition')&&writers.length>1;
 const [packet,setPacket]=useState(null),[mint,setMint]=useState(null),[dialog,setDialog]=useState(''),[stage,setStage]=useState(0);
 const stepPanel=useRef(null),stepNavigation=useRef(null);
 if(stepNavigation.current===null)stepNavigation.current=createMintStepNavigator(step);
 useLayoutEffect(()=>{
  stepNavigation.current({step,blocked:!!dialog,panel:stepPanel.current});
 },[step,dialog]);
 const [network,setNetwork]=useState(saved.settings.network),[rpcUrl,setRpcUrl]=useState(saved.settings.rpcUrl),[ganacheChainId,setChainId]=useState(saved.settings.ganacheChainId),[factories,setFactories]=useState(()=>{
  const existing=saved.settings.factories;
  return {...existing,
   'sepolia:11155111':existing['sepolia:11155111']||import.meta.env.VITE_ROAD_SEPOLIA_FACTORY||''};
 });
 const [rememberForm,setRememberForm]=useState(saved.settings.rememberForm);
 const [useStartupFactory,setUseStartupFactory]=useState(saved.settings.useStartupFactory);
 useEffect(()=>{
  const store=typeof window==='undefined'?null:window.localStorage;
  if(rememberForm)saveMintForm(store,{meta,ipCategoryId,spatial,composition,training,share,currency,unit,fees,cover,licensingEmail});
  else clearMintForm(store);
 },[rememberForm,meta,ipCategoryId,spatial,composition,training,share,currency,unit,fees,cover,licensingEmail]);
 useEffect(()=>{
  const store=typeof window==='undefined'?null:window.localStorage;
  saveMintNetwork(store,{network,rpcUrl,ganacheChainId,factories,rememberForm,useStartupFactory});
 },[network,rpcUrl,ganacheChainId,factories,rememberForm,useStartupFactory]);
 const chainId=network==='sepolia'?'11155111':ganacheChainId;
 const factoryKey=network+':'+chainId+(network==='ganache'?':'+rpcUrl:'');
 const startupFactory=ACTIVE_NETWORK?.factoryAddress||startupGanacheFactory({network,chainId,rpcUrl,configuredFactory:ganacheFactory});
 const automaticFactory=!!ACTIVE_NETWORK||useStartupFactory&&!!startupFactory;
 const factoryAddress=ACTIVE_NETWORK?.factoryAddress||selectedMintFactory({storedFactory:factories[factoryKey]||'',startupFactory,automatic:useStartupFactory});
 const setFactoryAddress=value=>setFactories(old=>({...old,[factoryKey]:value}));
 const execution=mintMode(wallet,network);
 const reuseScope=JSON.stringify([wallet,chainId,factoryAddress,rpcUrl,network,ipCategoryId]);
 useEffect(()=>{setReusedBricks({});},[reuseScope]);
 useEffect(()=>{setReusedBricks(previous=>retainMatchingReuse(previous,assets,{composition:composition&&isMusic}));},[composition,isMusic]);
 const plannedParts=[{id:'master',label:category.label},...(visibleSlots.some(s=>s.id==='artwork')&&assets.artwork?.hash?[{id:'artwork',label:'Cover artwork'}]:[]),...(isMusic&&composition&&!linkedBricks.some(l=>l.relation==='embodies-composition')?[{id:'composition',label:'Songwriting'}]:[])];
 const newParts=plannedParts.filter(part=>!reusedBricks[part.id]),referenceParts=plannedParts.filter(part=>reusedBricks[part.id]);
 useEffect(()=>{setSongwriterSplits(value=>value?{...value,confirmed:false}:null);},[wallet]);
 const album=previewAlbum(assets);
 const albumScope=JSON.stringify([album,assets.preview?.hash,wallet,chainId,factoryAddress,rpcUrl,network]);
 useEffect(()=>{setNftCover(current=>current?.kind==='album'?null:current);},[albumScope]);
 useEffect(()=>{
  if(album&&packet&&mint)void rememberAlbumCover(window.localStorage,{album,packet,mint}).catch(()=>{});
 },[album,packet,mint]);
 const reviewContext=useRef(null);
 const deliveryScope=JSON.stringify([wallet,ipCategoryId,composition,meta,cover,contentPolicy,
  Object.entries(assets).sort(([a],[b])=>a.localeCompare(b)).map(([role,file])=>[role,file.name,file.size,file.hash])]);
 const deliveryApproved=playerEnabled&&defaultDeliveryApproved({defaults:creatorDefaults,choice:deliveryChoice,consent:deliveryConsent,scope:deliveryScope,assets,policy:contentPolicy});
 const context=JSON.stringify([wallet,execution,rpcUrl,chainId,factoryAddress,licensingEmail,nftCover?.sourceDigest,nftCover?.consent,nftCover?.candidate?.imageURI,reusedBricks,songwriterSplits,linkedBricks,deliveryScope,deliveryApproved]);
 useEffect(()=>{
  const provider=window.ethereum;if(!wallet||!provider?.request)return;
  let active=true,revision=0;
  const update=id=>{if(active&&!ACTIVE_NETWORK)setNetwork(Number(id)===11155111?'sepolia':'ganache')};
  const changed=id=>{revision++;update(id)};
  provider.request({method:'eth_chainId'}).then(id=>{if(!revision)update(id)}).catch(()=>{});
  provider.on?.('chainChanged',changed);
  return()=>{active=false;provider.removeListener?.('chainChanged',changed)};
 },[wallet]);
 useEffect(()=>{if(dialog==='confirm'&&reviewContext.current!==context){setDialog('');setError('Wallet, network, files or Player approval changed. Review the mint again.')}},[context,dialog]);
 const identity={mode:wallet?'external':'assisted',connected:!!wallet,address:wallet||''};
 const payload={metadata:{...meta,ipCategory:ipCategoryId,spatial:category.spatial?spatial:{}},assets,identity,royalties:{creatorBps:share},training,composition:composition&&isMusic,storage:ipfsEnabled?'ipfs-encrypted-pilot':'demo-encrypted-in-browser',licensing:{currency,useUnit:unit,...fees,email:licensingEmail},cover,linkedBricks,contentPolicy,reusedBricks,songwriterSplits};
 const chooseCategory=id=>{
  if(id===ipCategoryId)return;
  setContentPolicy(initialContentPolicy(creatorDefaults));setDeliveryChoice('default');setNftCover(null);setDeliveryConsent(null);setPlayerDelivery({status:'not-requested'});deliveryJob.current=null;
  // Files from another category must not become this category's registered work.
  fileGeneration.current+=1;autofill.clearFiles();
  refs.current={};vault.current={secret:null,encrypted:new Map()};
  setAssets({});setStatus('');setError('');setSpatial({});setLinkedBricks([]);setCover({useMainArtist:true,artist:'',title:'',description:'',wallet:'',ipCategory:'illustration'});setIpCategoryId(id);
 };
 const attach=async(id,file)=>{
  const generation=fileGeneration.current;
  if(id==='artwork'||id==='master'||id==='preview')setNftCover(null);
  setError('');setReusedBricks(previous=>{const next={...previous};delete next[id==='artwork'?'artwork':id==='lyrics'&&composition?'composition':'master'];return next;});refs.current[id]=file;vault.current.encrypted.delete(id);
  const record={name:file.name,type:file.type,size:file.size,status:'hashing'};
  setAssets(old=>({...old,[id]:record}));
  try{if(id==='preview')validatePreviewSelection(file);}catch(e){setAssets(old=>({...old,[id]:{...record,error:e.message,status:'failed'}}));return;}
  const extraction=autofill.inspect(id,file);
  if(file.size>MAX_ASSET_BYTES){setAssets(old=>({...old,[id]:{...record,error:'File limit: '+ASSET_LIMIT_LABEL+' per original',status:'failed'}}));return}
  const current=()=>generation===fileGeneration.current&&refs.current[id]===file;
  // Start the filename fallback immediately; worker tags and SHA-256 run locally.
  try{
   const raw=await file.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),b=>b.toString(16).padStart(2,'0')).join('');
   const extracted=await extraction;
   if(!current())return;
   setAssets(old=>({...old,[id]:{...record,hash,status:'ready',extracted}}));
  }catch{
   if(current())setAssets(old=>({...old,[id]:{...record,error:'File read failed',status:'failed'}}));
  }
 };
 const encryptAndAdvance=async()=>{
  if(busy)return;
  if(!assets.master?.hash){setError('Attach a primary work file before continuing.');return}
  if(Object.values(assets).some(a=>a.status==='hashing'||a.error)){setError('Wait for files to finish hashing, or replace failed files.');return}
  const slots=visibleSlots.filter(x=>assets[x.id]?.hash);
  const fresh=slots.filter(x=>!vault.current.encrypted.has(x.id));
  setBusy(true);setError('');
  try{
   if(fresh.length){
    setStatus('Encrypting source files locally. No upload occurs until final review…');
    const out=await encryptDemoBatch({
     items:fresh.map(x=>({id:x.id,file:refs.current[x.id],originalSha256:assets[x.id].hash})),
     secret:vault.current.secret,existing:vault.current.encrypted,privacyMode:ipfsEnabled,
     onProgress:id=>setStatus('Encrypting '+slotLabel(id)+' locally…')
    });
    vault.current={secret:out.secret,encrypted:out.encrypted};
    setAssets(old=>Object.fromEntries(Object.entries(old).map(([id,a])=>[id,out.updates[id]?
     {...a,...out.updates[id],...(ipfsEnabled?{demoUpload:null}:{})}:a])));
    refs.current={};
   }
   setStatus(ipfsEnabled?'All files encrypted locally. Upload will begin only after you confirm the reviewed registration.':'All files encrypted locally; upload is simulated.');
   setStep(2);
  }catch(e){setError('Browser encryption failed: '+(e.message||'Unknown error'))}
  finally{setBusy(false)}
 };
 const next=()=>{
  if(step===1){void encryptAndAdvance();return}
  if(step===2){if(needsSplits&&validateSongwriterSplits(songwriterSplits,writers,{walletRequired:!!wallet}).length){setShowSplits(true);return;}const errors=validateMintInput(payload);if(errors.length){setError(errors.join(' '));return}}
  if(step===3){
   const errors=validateMintInput(payload);if(errors.length){setError(errors.join(' '));return}
   try{
    const prepared=makeRegistrationPacket(payload,new Date().toISOString());
    reviewedDelivery.current=reviewPlayerDelivery({packet:prepared,consent:deliveryApproved,execution,chainId});
    reviewContext.current=context;setPacket(prepared);setDialog('confirm');
   }catch(e){setError(e.message)}
   return;
  }
  setError('');setStep(step+1);
 };
 const mintLock=useRef(false),activeExecution=useRef('simulated');
 const mintDemo=async()=>{
  if(mintLock.current)return;
  if(reviewContext.current!==context){setDialog('');setError('Wallet, network, files or Player approval changed. Review the mint again.');return}
  mintLock.current=true;activeExecution.current=execution;
  setDialog('waiting');setBusy(true);setError('');setStatus('Validating rights declarations…');
  const result={simulated:false,status:'pending',receipts:[]};
  try{
   let receipt;
   let uploadedPacket=packet;
   if(execution!=='simulated'){
    await preflightPolicyMint({packet,provider:window.ethereum,rpcUrl,chainId,network,factoryAddress});
    await preflightMintCover({packet,nftCover,provider:window.ethereum,rpcUrl,chainId,network,factoryAddress});
   }
   const uploadRoles=newUploadRoles(packet);
   if(ipfsEnabled&&packet.bricks.some(b=>!b.reuse)){
    if(!vault.current.secret)throw Error('Local encryption key is unavailable. Return to file upload and re-encrypt.');
    setStatus('Checking YBR IPFS service before accepting the sealed package…');
    await checkLocalIpfs();
    let pinnedAssets={...assets};
    for(const [i,slot] of visibleSlots.filter(x=>assets[x.id]?.hash&&uploadRoles.has(x.id)).entries()){
     const entry=vault.current.encrypted.get(slot.id);
     if(!entry)throw Error('Encrypted source missing for '+slotLabel(slot.id)+'. Reattach and retry.');
     setStatus('Pinning encrypted '+slotLabel(slot.id)+' to IPFS ('+(i+1)+')…');
     const receipt=await uploadEncryptedAsset({entry});
     pinnedAssets={...pinnedAssets,[slot.id]:{...pinnedAssets[slot.id],demoUpload:null,ipfsUpload:receipt}};
     setAssets(pinnedAssets);
    }
    // Rights declarations have been validated. Build the actual packet only
    // after verified ciphertext CIDs exist, then encrypt metadata per Brick.
    uploadedPacket=makeRegistrationPacket({...payload,assets:pinnedAssets},packet.createdAt);
    setStatus('Pinning encrypted metadata for each Brick…');
    uploadedPacket=await pinEncryptedBrickMetadata({packet:uploadedPacket,secret:vault.current.secret,onProgress:setStatus});
    setPacket(uploadedPacket);
   }
   if(execution!=='simulated'){
    // Client-side validation against the live controller, not a claimed owner name.
    if(linkedBricks.length){
     const {reader}=walletClientForLinks(window.ethereum,Number(chainId));
     await preflightLinkedBricks({client:reader,account:wallet,chainId:Number(chainId),sourceHash:assets.master.hash,links:linkedBricks});
    }
    receipt=await mintWithReviewedCover({packet:uploadedPacket,nftCover,provider:window.ethereum,rpcUrl,chainId,network,factoryAddress,onUpdate:setStatus,result});
   }
   else {for(let i=0;i<4;i++){setStage(i);setStatus(['Validating rights declarations','Preparing separate IP Bricks','Preparing contextual Building','Simulating confirmation'][i]);await wait(750)}receipt=simulateMintReceipts(uploadedPacket);}
   if(!receipt.simulated){try{localStorage.setItem(factoryStorageKey(Number(chainId)),factoryAddress)}catch{}}
   setMint(receipt);setPacket(p=>({...uploadedPacket,[receipt.simulated?'demoMint':'onChainMint']:receipt,...(!receipt.simulated?{notices:uploadedPacket.notices.filter(n=>!n.startsWith('No wallets created')).concat('Brick contracts registered on the selected blockchain. '+(uploadedPacket.storage.uploaded?'Encrypted files and metadata are pinned to the local IPFS node. ':'No originals are hosted. ')+(playerEnabled?'The reviewed Player permissions and file-lock policy':'The file-lock policy')+' were committed with the mint. No paid licenses or automated royalties are installed. The Building remains an off-chain proposal.')}:{})}));setStep(4);
   deliveryJob.current=reviewedDelivery.current?{packet:uploadedPacket,mint:receipt,vault:vault.current,approval:reviewedDelivery.current}:null;
   if(deliveryJob.current){
    setStatus('Delivering the Player copies approved in Step 3…');setPlayerDelivery({status:'sending'});
    deliveryWork.current=new AbortController();
    const delivery=await deliverPlayerAfterMint(deliveryJob.current,{signal:deliveryWork.current.signal});
    if(!deliveryWork.current.signal.aborted)setPlayerDelivery(delivery);
   }else setPlayerDelivery({status:'not-requested'});
   setDialog('complete');
  }catch(e){setError('Mint failed: '+(e.shortMessage||e.message)+(result.nftCover?.imageURI?' The approved public cover was already pinned at '+result.nftCover.imageURI+'. Inspect any submitted transactions before retrying.':''));if(result.receipts.length||result.submissionAttempted){if(!['reverted','submission-unknown'].includes(result.status))result.status='incomplete';setMint(result);setPacket(p=>({...p,onChainMint:result}));setStep(4)}setDialog('')}finally{mintLock.current=false;setBusy(false)}
 };
 const retryPlayerDelivery=async()=>{
  if(mintLock.current||busy||!deliveryJob.current||playerDelivery.status!=='needs-attention')return;
  mintLock.current=true;setBusy(true);setPlayerDelivery({status:'sending'});deliveryWork.current=new AbortController();
  try{
   const delivery=await deliverPlayerAfterMint(deliveryJob.current,{signal:deliveryWork.current.signal});
   if(!deliveryWork.current.signal.aborted)setPlayerDelivery(delivery);
  }finally{mintLock.current=false;setBusy(false)}
 };
 const recordNftCover=verified=>{
  const update=previous=>previous?{...previous,nftCover:{...previous.nftCover,...verified,status:'verified'}}:previous;
  setMint(update);setPacket(previous=>previous?{...previous,onChainMint:update(previous.onChainMint)}:previous);
 };
 const download=async(id)=>{
  try{
   const entry=vault.current.encrypted.get(id);
   const result=await openDemoDownload({entry,secret:vault.current.secret,authorized:true});
   const url=URL.createObjectURL(new Blob([result.bytes],{type:result.mime}));
   const a=document.createElement('a');a.href=url;a.download=assets[id]?.name||result.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
  }catch(e){setError(e.message)}
 };
 const exportRecovery=()=>{
  if(!vault.current.secret){setError('Recovery key unavailable. Reattach the originals and encrypt again.');return}
  try{
   const kit=buildRecoveryFile({secret:vault.current.secret,assets,packet});
   const url=URL.createObjectURL(new Blob([JSON.stringify(kit,null,2)],{type:'application/json'}));
   const a=document.createElement('a');a.href=url;a.download='ybr-private-recovery-keys.json';a.click();
   setTimeout(()=>URL.revokeObjectURL(url),5000);
  }catch(e){setError(e.message||'Unable to export the private recovery file.');}
 };
 const exportPacket=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(packet,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='road-demo-mint.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)};
 const reset=()=>{const defaults=loadCreatorDefaults(window.localStorage),form=applyCreatorDefaults(defaultMintForm(),defaults);setCreatorDefaults(defaults);setLicensingEmail(form.licensingEmail);setDeliveryChoice('default');setContentPolicy(initialContentPolicy(defaults));if(defaults.enabled){setComposition(form.composition);setTraining(form.training);setShare(form.share);setCurrency(form.currency);setUnit(form.unit);setFees(form.fees);}deliveryWork.current?.abort();deliveryJob.current=null;reviewedDelivery.current=null;setDeliveryConsent(null);setPlayerDelivery({status:'not-requested'});setNftCover(null);fileGeneration.current+=1;vault.current={secret:null,encrypted:new Map()};refs.current={};autofill.reset(initial);setAssets({});setReusedBricks({});setSongwriterSplits(null);setShowSplits(false);setPacket(null);setMint(null);setDialog('');setStatus('');setError('');setStep(0);setIpCategoryId('sound-recording');setSpatial({});setLinkedBricks([]);setCover({useMainArtist:true,artist:'',title:'',description:'',wallet:'',ipCategory:'illustration'});setIpfsEnabled(false);setIpfsHealth('')};
 return <div className="ms-wrap"><section className="ms-hero"><span>0x🟨 ROAD / CREATOR STUDIO</span><h2>Your studio → Yellow Bricks.</h2><p>Register original works while keeping originals and encryption keys private in your browser. Optionally pin encrypted files to YBR IPFS, then use a simulated or wallet-signed test mint.</p><b>{execution==='simulated'?'SIMULATED · NO ON-CHAIN MINT':network==='sepolia'?'SEPOLIA · WALLET-SIGNED TRANSACTIONS':'GANACHE · REAL LOCAL TRANSACTIONS'}</b></section>
 <div className="ms-progress">{stages.map((s,i)=><div key={s} className={step===i?'active':step>i?'done':''}><span>{i+1}</span>{s}</div>)}</div>
 <div className={'ms-grid'+(step===4?' ms-grid--results':'')} inert={dialog?true:undefined}><section className="ms-panel" ref={stepPanel} style={{scrollMarginBlockStart:16}}>
 {step===0&&<><h2>01. Identify the creator.</h2><p>{wallet?`Connected: ${displayName||wallet}. You’ll configure the mint network in Step 4.`:'Continue with the simulation, or connect a wallet for real minting. Network setup comes in Step 4.'}</p><div className="ms-ip-choice"><label htmlFor="road-ip-category">Select a type of intellectual property</label><select id="road-ip-category" value={ipCategoryId} onChange={e=>chooseCategory(e.target.value)}>{groupedIpCategories().map(([group,entries])=><optgroup key={group} label={group}>{entries.map(entry=><option key={entry.id} value={entry.id}>{entry.label}</option>)}</optgroup>)}</select><small>{category.examples} · {IP_CATEGORIES.length} available categories</small><small>Switching IP categories clears attached demo files to prevent accidental reuse under the wrong rights category.</small>{category.notice&&<p className="ms-ip-warning">{category.notice}</p>}</div>{!wallet&&<button className="ms-primary" onClick={onConnect}>Connect wallet</button>}<div className="ms-local-pref"><label><input type="checkbox" checked={rememberForm} onChange={e=>setRememberForm(e.target.checked)}/> Remember form fields on this device</label><small>Local browser storage, not encrypted. Original files, wallet secrets, signing data and encryption keys are never saved. Ganache network and factory settings remain saved separately.</small><button type="button" onClick={()=>{setRememberForm(false);clearMintForm(window.localStorage)}}>Clear saved form</button></div><div className="ms-highlight"><strong>Creator alias</strong><code>{aliasFor(meta.artist||'artist')}</code><p>Separate from ENS and Ethereum addresses.</p></div></>}
 {step===1&&<><h2>02. Attach files.</h2><p>{playerEnabled?'Choose files for each role. Master recordings support WAV and other audio formats; Audio Preview uses MP3 with ID3 tags.':'Attach your original '+category.label.toLowerCase()+' and any supporting source files.'} Filenames supply title defaults. Supported embedded metadata fills descriptive fields locally without replacing your edits. Files are encrypted in your browser; optional IPFS upload requires your final confirmation.</p><div className="ms-files">{visibleSlots.map(slot=><Fragment key={slot.id}><UploadSectionHeading slotId={slot.id} category={category}/><label><div><strong>{slotLabel(slot.id)}{slot.required?' *':''}</strong><small>{assets[slot.id]?.name||uploadFilter(slot.id,category).hint}</small>{assets[slot.id]&&<small>{assets[slot.id]?.error|| (assets[slot.id]?.status==='hashing'?'Hashing…':assets[slot.id]?.ipfsUpload?.verified?'🔒 Pinned to IPFS · '+assets[slot.id].ipfsUpload.cid:assets[slot.id]?.demoUpload?'🔒 Encrypted / DEMO receipt '+assets[slot.id].demoUpload.receiptId:assets[slot.id]?.hash?'✓ Ready':'')}</small>}{assets[slot.id]?.extracted&&<small>Title: {assets[slot.id].extracted.fields.title} · {assets[slot.id].extracted.parser}{assets[slot.id].extracted.fields.release?' · Album: '+assets[slot.id].extracted.fields.release:''}{assets[slot.id].extracted.fields.songwriters?' · Songwriters: '+assets[slot.id].extracted.fields.songwriters:''}{assets[slot.id].extracted.notice?' · '+assets[slot.id].extracted.notice:''}</small>}</div><span>Browse</span><input type="file" accept={uploadFilter(slot.id,category).accept||undefined} aria-label={'Choose '+slotLabel(slot.id)} onChange={e=>{if(e.target.files[0])void attach(slot.id,e.target.files[0]);e.target.value=''}}/></label></Fragment>)}</div><ExistingFileBricks key={reuseScope} assets={assets} composition={composition&&isMusic} wallet={wallet} chainId={chainId} factoryAddress={factoryAddress} rpcUrl={rpcUrl} network={network} value={reusedBricks} onChange={setReusedBricks}/><section className="ms-encrypt"><h3>🔒 Browser encryption &amp; IPFS</h3>
 <p>All originals are encrypted locally with AES-256-GCM. Choose whether to pin the encrypted files to your own YBR IPFS node, or use the offline demonstration.</p>
 <label className="ms-ipfs-option"><input type="checkbox" checked={ipfsEnabled} onChange={e=>{setIpfsEnabled(e.target.checked);setIpfsHealth('')}}/>
  Upload encrypted files to my local YBR IPFS node (experimental)</label>
 {ipfsEnabled&&<><p className="ms-ipfs-warning">File limit: {ASSET_LIMIT_LABEL} per original; encryption overhead is included automatically. IPFS is a publicly retrievable, content-addressed network. Only encrypted containers are sent, but ciphertext, approximate file sizes and CIDs can be copied indefinitely. Keep the recovery key private. This local pilot does not guarantee global availability or backup.</p>
  <button type="button" className="ms-outline" disabled={busy} onClick={()=>void checkLocalIpfs().then(x=>setIpfsHealth('Connected YBR IPFS node: '+x.peerId)).catch(e=>setIpfsHealth(e.message))}>Test IPFS connection</button>
  {ipfsHealth&&<p role="status">{ipfsHealth}</p>}
 </>}
 <p>Without IPFS, uploads remain simulated. Encryption keys stay in browser memory and are not uploaded.</p>
 {status&&<p role="status">{status}</p>}
 </section>
 </>}
 {step===2&&<><h2>03. IP and licensing.</h2>{ipfsEnabled&&<div className="ms-ipfs-confirm"><strong>Files encrypted locally, pending creator approval</strong>
 <p>Nothing has been sent to IPFS yet. You can download an early private key backup now, then download it again after confirmed upload to include final CIDs. Keep the backup private; losing it makes pinned ciphertext inaccessible.</p>
 <button type="button" className="ms-outline" onClick={exportRecovery}>Download private key backup ↓</button>
 </div>}<p>{isMusic?'Recording and songwriting become separate Bricks by default. Writers are credited separately from the recording artist.':'Register a work and supporting evidence. Creator claims are not independently verified by this demo.'}</p><p className="ms-ip-hint">IP category: <strong>{category.label}</strong></p><p className="ms-ip-hint">Autofilled descriptions and credits are unverified suggestions. Review them before minting. Artist tags do not establish ownership. {Object.keys(autofill.sources).length>0?'Autofilled fields: '+Object.keys(autofill.sources).join(', ')+'.':''}</p>{isMusic&&autofill.suggestions.release&&meta.release!==autofill.suggestions.release&&<div className="ms-ip-hint" role="status"><strong>Extracted album: {autofill.suggestions.release}</strong><p>Your saved or edited Album / release value has been kept. Apply the extracted album explicitly to replace it.</p><button type="button" className="ms-outline" onClick={()=>autofill.edit('release',autofill.suggestions.release)}>Use extracted album</button></div>}<div className="ms-fields">{fields.filter(([id])=>isMusic||(id==='genre'&&category.group==='Music & audio')||(id==='songwriters'&&category.writers)||!['songwriters','daw','release','genre','bpm','key','isrc','iswc'].includes(id)).map(([id,label])=><label key={id}><span>{id==='title'&&!isMusic?'Work title':id==='artist'&&!isMusic?'Creator / claimant':label}</span>{id==='genre'?<MusicGenreSelect value={meta.genre} onChange={genre=>autofill.edit('genre',genre)}/>:id==='description'?<textarea value={meta[id]} onChange={e=>autofill.edit(id,e.target.value)}/>:<input value={meta[id]} onChange={e=>autofill.edit(id,e.target.value)}/>}</label>)}</div>{needsSplits&&<section className="ms-link-panel"><h3>Songwriter splits</h3><p>{songwriterSplits&&validateSongwriterSplits(songwriterSplits,writers,{walletRequired:!!wallet}).length===0?songwriterSplits.shares.map(row=>row.name+': '+row.bps/100+'%').join(' · '):writers.length+' songwriters are credited. Review their composition shares before continuing.'}</p><button type="button" className="ms-outline" onClick={()=>setShowSplits(true)}>Set songwriter splits</button></section>}{category.spatial&&<section className="ms-spatial-fields"><h3>Spatial capture &amp; provenance</h3><p>Dates and credits below are creator-declared; attaching spatial video or motion capture does not establish first performance or exclusive rights. SHA-256 of the original file is recorded.</p><div className="ms-fields">{SPATIAL_FIELDS.map(field=><label key={field.id}><span>{field.label}</span><input placeholder={field.placeholder} value={spatial[field.id]||''} onChange={e=>setSpatial(p=>({...p,[field.id]:e.target.value}))}/></label>)}</div><small>Optional C2PA and PROV-O references link to external evidence, not automatically verified attestations.</small></section>}{category.group==='Music & audio'&&<section className="ms-link-panel">
 <h3>Cover artwork · independent visual IP Brick</h3>
 <p>The recording artist is also credited as cover artist by default. You can explicitly select another cover creator, or reference an existing visual Brick with controller approval.</p>
 {reusedBricks.artwork?<p>Using existing artwork Brick <code>{reusedBricks.artwork.address}</code>. Its credits and rights are unchanged.</p>:assets.artwork?.hash?<div className="ms-fields">
  <label>Cover artwork title<input value={cover.title} onChange={e=>setCover(p=>({...p,title:e.target.value}))} placeholder={meta.title?meta.title+' — cover art':'Cover artwork title'}/></label>
  <label className="ms-check"><input type="checkbox" checked={cover.useMainArtist!==false} onChange={e=>setCover(p=>({...p,useMainArtist:e.target.checked}))}/> Recording artist created the cover (default)</label>
  {cover.useMainArtist!==false?<p className="ms-ip-hint">Cover creator: <strong>{meta.artist||'Recording artist (enter above)'}</strong>{wallet?' · Connected wallet controls both new Bricks.':''}</p>:<>
   <label>Other cover artist / creator (required)<input value={cover.artist} onChange={e=>setCover(p=>({...p,artist:e.target.value}))} placeholder="Cover artist name"/></label>
   <label>Other cover artist wallet (required for wallet-signed minting)<input value={cover.wallet} onChange={e=>setCover(p=>({...p,wallet:e.target.value.trim()}))} placeholder="0x..."/></label>
   <small>If the collaborator uses a different wallet, they should mint the artwork using their wallet, then approve a linked Brick reference. You cannot mint their artwork as yours.</small>
  </>}
  <label>Visual artwork category<select value={cover.ipCategory} onChange={e=>setCover(p=>({...p,ipCategory:e.target.value}))}>
   {['illustration','photograph','digital-art','painting'].map(id=><option key={id} value={id}>{getIpCategory(id).label}</option>)}
  </select></label>
  <label>Description / creative provenance<textarea value={cover.description} rows={3} onChange={e=>setCover(p=>({...p,description:e.target.value}))}/></label>
 </div>:<p>No cover artwork attached. Upload your own cover or reference an existing cover-art Brick below.</p>}
 </section>}
 {Object.keys(reusedBricks).length>0&&<section className="ms-link-panel"><h3>Existing Bricks in this Building</h3>{Object.entries(reusedBricks).map(([part,brick])=><p key={part}>{part}: <code>{brick.address}</code> · no new upload or mint</p>)}</section>}<LinkAuthorizationCreator wallet={wallet} assets={assets} links={linkedBricks} onChange={setLinkedBricks} onConnect={onConnect}/>{isMusic&&<label className="ms-check"><input type="checkbox" checked={composition} onChange={e=>setComposition(e.target.checked)}/> Independent Songwriting / Composition Brick (default)</label>}<label className="ms-select">AI training policy<select aria-label="AI training policy" value={training} onChange={e=>setTraining(e.target.value)}>{trainingModes.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label><label className="ms-select">{isMusic?'Master':'Work'} creator payout share ({share/100}%)<input type="range" min="0" max="10000" step="100" value={share} onChange={e=>setShare(Number(e.target.value))}/></label><div className="ms-demo-fees"><h3>AI dataset licensing proposals · {category.label}</h3><label>Denomination <select value={currency} onChange={e=>setCurrency(e.target.value)}><option>USDC</option><option>USD</option></select></label><label>Use fee unit <select value={unit} onChange={e=>setUnit(e.target.value)}><option value="per-1000-outputs">Per 1,000 outputs</option><option value="per-output">Per output</option><option value="per-model-deployment">Per model deployment</option></select></label>{[['masterIngestionCents',isMusic?'Recording ingestion':'Work ingestion',100000,500],['masterUseCents',isMusic?'Recording use':'Work use',25000,25],...(isMusic?[['writingIngestionCents','Songwriting ingestion',100000,500],['writingUseCents','Songwriting use',25000,25]]:[])].map(([id,label,max,step])=><label key={id}>{label}: <strong>{(fees[id]/100).toFixed(2)} {currency}</strong><input type="range" min="0" max={max} step="1" value={fees[id]} onChange={e=>setFees(p=>({...p,[id]:Number(e.target.value)}))}/></label>)}<small>Draft quotes, not licenses or payments.</small></div>
 <section className="ms-link-panel"><h3>Licensor contact</h3><div className="ms-fields"><label>Licensor email<input type="email" maxLength={254} autoComplete="email" value={licensingEmail} onChange={e=>setLicensingEmail(e.target.value)} placeholder="licensing@example.com"/></label></div><p>Systems can use this address to request approvals or agreements. It is public on every new Brick in this registration, including when the files are encrypted or locked. The current controller can update it later. Linked Bricks keep their own contacts.</p></section>
 {newParts.length>0&&<ContentPolicyReview playerEnabled={playerEnabled} value={contentPolicy} onChange={setContentPolicy} assets={assets} simulated={execution==='simulated'} delivery={deliveryApproved} usingDefaults={creatorDefaults.enabled&&deliveryChoice==='default'} onDeliveryChange={value=>{setDeliveryChoice('manual');setDeliveryConsent(value?deliveryScope:null);}}/>}
 </>}
 {step===3&&<><h2>04. Review mint.</h2>{execution!=='simulated'&&newParts.length>0&&<p className="ms-ip-hint"><strong>One mint transaction.</strong> Only new Bricks, their file policies and approved NFT images are registered. Existing Bricks are referenced without another mint.</p>}{newParts.length>0&&<ContentPolicyReview playerEnabled={playerEnabled} value={contentPolicy} assets={assets} simulated={execution==='simulated'} readOnly delivery={deliveryApproved} onEdit={()=>{setError('');setStep(2);}}/>}
 {newParts.length>0&&execution!=='simulated'&&album&&<AlbumCoverSuggestion key={albumScope} album={album} previewDigest={'0x'+assets.preview.hash} wallet={wallet} chainId={chainId} factoryAddress={factoryAddress} rpcUrl={rpcUrl} network={network} value={nftCover} onChange={setNftCover}/>}
 {newParts.length>0&&nftCover?.kind!=='album'&&<NftCoverReview key={assets.artwork?.hash||(isRasterCoverFile(assets.master)?assets.master?.hash:'none')} getPacket={()=>makeRegistrationPacket(payload)} vault={vault.current} sourceDigest={(assets.artwork?.hash||(isRasterCoverFile(assets.master)?assets.master?.hash:null))?'0x'+(assets.artwork?.hash||assets.master.hash):null} value={nftCover} onChange={setNftCover} simulated={execution==='simulated'}/>}
 {execution==='ganache'&&startupFactory&&!automaticFactory&&factoryAddress.toLowerCase()!==startupFactory.toLowerCase()&&<aside className="ms-ipfs-warning"><strong>Manual factory differs from the running dashboard.</strong><p>You selected a manual override. Use the running factory for the current local profile, or keep the override to test another deployment.</p><button type="button" className="ms-outline" onClick={()=>setUseStartupFactory(true)}>Use startup factory</button></aside>}<div className="ms-review">{[['Work',meta.title],['Category',category.label],[isMusic?'Artist':'Creator',meta.artist],...(isMusic&&composition||category.writers?[['Writers',meta.songwriters||'Attribution pending']]:[]),['New Bricks',newParts.length+' · '+(newParts.map(p=>p.label).join(', ')||'None')],['Existing Brick references',referenceParts.length+' · '+(referenceParts.map(p=>p.label).join(', ')||'None')],...(playerEnabled?[['Cover artist',reusedBricks.artwork?'Existing Brick credits retained':assets.artwork?.hash?(cover.useMainArtist!==false?(meta.artist||'Pending creator'):(cover.artist||'Pending collaborator')):'Not attached']]:[]),['Licensor email (public)',licensingEmail.trim()||'Not supplied'],['External Brick references',linkedBricks.length],['Storage',ipfsEnabled?'YBR IPFS encrypted upload pending your confirmation':'Local demo, simulated upload'],['Encrypted assets',Object.values(assets).filter(a=>a.ipfsUpload?.verified||a.demoUpload).length],['Currency',currency],[isMusic?'Recording ingestion':'Work ingestion',(fees.masterIngestionCents/100).toFixed(2)],...(isMusic&&composition?[['Writing ingestion',(fees.writingIngestionCents/100).toFixed(2)]]:[])].map(([k,v])=><div key={k}><span>{k}</span><strong>{v}</strong></div>)}</div>{linkedBricks.length>0&&<section className="ms-link-panel"><h3>External Brick approvals</h3>
 {linkedBricks.map(link=><p key={link.id}>{link.relation} → {link.targetBrick} · {link.response?'Signed response supplied; reverified before on-chain mint':'Awaiting current-controller signature'}</p>)}
 <p>Signed EIP-712 requests are off-chain consent evidence. No on-chain Building link or DSP license is created here.</p>
 </section>}<section className="ms-chain-mode"><h3>Test mint setup</h3>{wallet?<div className="ms-fields"><p>Connected: {displayName||wallet}. Minting will request wallet signatures.</p><label>{ACTIVE_NETWORK?'Active Dev Control network':'Mint network'}<select disabled={!!ACTIVE_NETWORK} value={network} onChange={e=>setNetwork(e.target.value)}><option value="ganache">Local Ganache</option><option value="sepolia">Sepolia testnet</option></select></label>{network==='ganache'&&!ACTIVE_NETWORK&&<><label>Local RPC URL<input value={rpcUrl} onChange={e=>setRpcUrl(e.target.value)}/></label><label>Chain ID (decimal)<input value={ganacheChainId} onChange={e=>setChainId(e.target.value)}/></label></>}{startupFactory&&!ACTIVE_NETWORK&&<label className="ms-check"><input type="checkbox" checked={useStartupFactory} onChange={e=>{if(!e.target.checked&&!factories[factoryKey])setFactoryAddress(startupFactory);setUseStartupFactory(e.target.checked);}}/> Use running Ganache factory (automatic)</label>}
 <label>{network==='sepolia'?'Sepolia':'Ganache'} factory address<input value={factoryAddress} readOnly={automaticFactory} onChange={e=>setFactoryAddress(e.target.value)} spellCheck="false"/></label>
 {ACTIVE_NETWORK&&<p>All application components use {ACTIVE_NETWORK.label} (chain {ACTIVE_NETWORK.chainId}). Change networks in Dev Control. Your wallet must be on this same network before signing.</p>}<p>{network==='sepolia'?'Switch your wallet to Sepolia (11155111) and enter a deployed YellowBrickFactory address. Each confirmed mint spends Sepolia test ETH for gas.':automaticFactory?'Factory supplied by the running development stack. No copy/paste needed. Turn off automatic selection to enter another factory. Wallet and RPC must still match; the contract is verified before signing.':startupFactory?'Manual override is active. Enable automatic selection to follow the current development stack. Saved manual addresses are retained.':'No startup factory is available for this RPC and chain. Start npm run dev for automatic local setup, or enter a deployed factory for this network.'}</p></div>:<p>No wallet connected — the original simulation will run. Connect a wallet for real minting.</p>}{!wallet&&<button type="button" className="ms-outline" onClick={onConnect}>Connect wallet for real minting</button>}</section><aside>{execution==='simulated'?'No blockchain transaction or wallet signature occurs.':'Real transactions require wallet approval and gas on the selected network. IPFS is optional: when enabled, encrypted metadata CIDs are committed, not readable plaintext. No paid licenses or payout rules are installed.'}</aside></>}
 {step===4&&packet&&<MintResults packet={packet} mint={mint} vault={vault.current} preparedCover={nftCover} delivery={playerDelivery} onRetry={()=>void retryPlayerDelivery()} busy={busy} onCoverVerified={recordNftCover} onExportPacket={exportPacket} onExportRecovery={exportRecovery} onReset={reset} onDownload={download} downloadSlots={visibleSlots.filter(x=>vault.current.encrypted.has(x.id)).map(x=>({...x,label:slotLabel(x.id)}))}/>}
 {error&&<p className="ms-error" role="alert">{error}</p>}
 {step<4&&<div className="ms-actions">{step>0&&<button className="ms-outline" disabled={busy} onClick={()=>{setStep(i=>i-1);setError('')}}>← Back</button>}<button className="ms-primary" disabled={busy} onClick={next}>{busy?'Encrypting…':step===1?'Encrypt & Continue →':step===3?(execution==='simulated'?'Simulate mint →':'Review wallet mint →'):'Continue →'}</button></div>}
 </section><aside className="ms-side"><strong>THE CREATOR'S ROAD</strong><ol><li>Connect a wallet or continue with simulation</li><li>Attach all source files</li><li>Automatic client-side encryption</li><li>Separate Bricks for applicable creative rights</li><li>Draft dataset ingestion and use fees</li><li>Confirm simulation or one wallet mint transaction</li><li>Decrypt after simulated authorization</li></ol><p>PILOT ONLY. Decryption keys stay in the browser. {playerEnabled?'Originals remain private unless you explicitly share selected preview copies with the local Player.':'Originals remain private. Public NFT thumbnails require separate approval.'} Optional ciphertext pinning uses your local YBR IPFS node. Authorized remote delivery, managed key recovery and royalty payouts are not implemented. Wallets deploy test Bricks on Ganache or Sepolia.</p></aside></div>
 {showSplits&&<SongwriterSplits key={JSON.stringify(writers)} names={writers} value={songwriterSplits} wallet={wallet} onClose={()=>setShowSplits(false)} onSave={value=>{setSongwriterSplits(value);setShowSplits(false);setError('');}}/>}
 {dialog&&<div className="ms-demo-overlay"><div role="dialog" aria-modal="true" className="ms-demo-dialog"><b>0x🟨 ROAD · DEMO</b>{dialog==='confirm'?<><h2>Confirm your Yellow Bricks?</h2>{execution!=='simulated'&&newParts.length>0&&<p><strong>NFT artwork:</strong> {nftCover?.consent?(nftCover.kind==='album'?'Reuse the selected album artwork URI in the single registration transaction.':'Publish the reviewed public thumbnail and include it in the single registration transaction. No second artwork transaction.'):'Yellow-square fallback. No public cover has been approved.'}</p>}{newParts.length>0&&<p>{playerEnabled&&<>Player permissions: {['preview','artwork','lyrics'].filter(role=>contentPolicy[role]&&assets[role]?.hash).join(', ')||'none'}. </>}Content: {contentPolicy.locked?'PERMANENTLY LOCKED after mint':'versioned edits allowed'}. {execution==='simulated'?'No on-chain grants in simulation.':'These choices are committed on each applicable new Brick in the one batch transaction.'}</p>}{licensingEmail.trim()&&<p><strong>Public licensor email:</strong> {licensingEmail.trim()}. {execution==='simulated'?'Included in this simulation packet.':'Stored directly on each new Brick; historical values remain visible on chain.'}</p>}{playerEnabled&&<p>Player delivery: {deliveryApproved?'Automatically send the approved preview copies and release labels to this local Player after confirmation.':'Not requested. No Player copies will be sent.'}</p>}<p>{execution==='simulated'?(ipfsEnabled?'You authorize a real upload of encrypted files and metadata to your local IPFS node. The mint receipts are simulated; no blockchain transaction occurs. Save your private recovery key.':'This is a simulation. No transaction will occur.'):`Mint ${packet?.bricks.filter(b=>!b.reuse).length} new Bricks and reuse ${packet?.bricks.filter(b=>b.reuse).length} existing Bricks on chain ${chainId} through factory ${factoryAddress}. ${packet?.bricks.every(b=>b.reuse)?'No mint transaction is needed.':'Confirm one transaction for the new Bricks in your wallet.'} ${ipfsEnabled?'You also authorize the permanent publication of encrypted files and metadata to local IPFS before minting. Keep the private recovery key.':'No files are hosted; only local demo metadata URIs are committed.'}`}</p><button className="ms-outline" onClick={()=>setDialog('')}>Cancel</button><button className="ms-primary" onClick={()=>void mintDemo()}>{execution==='simulated'?'Confirm simulation':packet?.bricks.every(b=>b.reuse)?'Confirm Brick reuse':'Request mint transaction'}</button></>:dialog==='waiting'?<><span className="ms-demo-spinner"/><h2>Preparing your Bricks…</h2><p role="status">{status||['Validating rights declarations','Preparing separate IP Bricks','Preparing contextual Building','Simulating confirmation'][stage]}</p><small>{activeExecution.current==='simulated'?'No blockchain transaction is being sent.':'Do not close this page while the batch transaction is pending.'}</small></>:<><h2>{mint?.reusedOnly?'Building references ready':'Registration complete'}</h2><p>{mint?.receipts.filter(r=>!r.reused).length||0} new Brick receipt(s) · {mint?.receipts.filter(r=>r.reused).length||0} existing Brick reference(s).</p>{!mint?.simulated&&!mint?.reusedOnly&&<p>{mint?.nftCover?.status==='verified'?'NFT cover verified on-chain.':mint?.nftCover?'NFT artwork is not yet verified. View receipts to finish or inspect the update. Do not remint.':'NFTs still use the default artwork until a public cover is applied.'}</p>}{playerEnabled&&<p>{playerDelivery.status==='delivered'?'Ready in YBR Player.':playerDelivery.status==='needs-attention'?'Registration is complete; Player delivery needs attention. View receipts to retry delivery only.':'No Player delivery was requested.'}</p>}<button className="ms-primary" onClick={()=>setDialog('')}>View receipts →</button></>}</div></div>}
 </div>;
}
