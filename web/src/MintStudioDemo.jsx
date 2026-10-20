import MusicGenreSelect from './MusicGenreSelect.jsx';
import {LinkAuthorizationCreator,walletClientForLinks} from './BrickLinkApprovals.jsx';
import {preflightLinkedBricks} from './brick-authorization.js';
import CopyField from './CopyField.jsx';
import CopyAllButton from './CopyAllButton.jsx';
import {formatMintReceiptForCopy} from './mint-receipt-copy.js';
import {loadMintForm,loadMintNetwork,saveMintForm,saveMintNetwork,clearMintForm,defaultMintForm} from './mint-persistence.js';
import {mintOnChain,mintMode} from './chain-mint.js';
import {factoryStorageKey} from './brick-viewer-model.js';
import {Fragment,useEffect,useRef,useState} from 'react';
import {uploadSectionBefore} from './mint-file-sections.js';
import {aliasFor,availableAssetSlots,makeRegistrationPacket,trainingModes,validateMintInput,parseMetadataText} from './mint-model.js';
import {extractId3} from './mp3-tags.js';
import {encryptDemoBatch,openDemoDownload} from './demo-vault.js';
import {simulateMintReceipts} from './demo-mint.js';
import {uploadEncryptedAsset,checkLocalIpfs,pinEncryptedBrickMetadata} from './ipfs-upload.js';
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
export default function MintStudioDemo({wallet,displayName,onConnect}){
 const [saved]=useState(()=>{
  const store=typeof window==='undefined'?null:window.localStorage;
  return {form:loadMintForm(store)||defaultMintForm(),settings:loadMintNetwork(store)};
 });
 const [step,setStep]=useState(0),[meta,setMeta]=useState(saved.form.meta),[assets,setAssets]=useState({});
 const [ipCategoryId,setIpCategoryId]=useState(saved.form.ipCategoryId),[spatial,setSpatial]=useState(saved.form.spatial);
 const category=getIpCategory(ipCategoryId),isMusic=!!category.musical;
 const visibleSlots=availableAssetSlots(ipCategoryId);
 const slotLabel=id=>id==='master'?category.primary:id==='project'&&category.spatial?'Spatial / skeletal tracking data':labels[id];
 const refs=useRef({}),vault=useRef({secret:null,encrypted:new Map()}),fileGeneration=useRef(0);
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
 const [ipfsEnabled,setIpfsEnabled]=useState(false),[ipfsHealth,setIpfsHealth]=useState('');
 const [composition,setComposition]=useState(saved.form.composition),[training,setTraining]=useState(saved.form.training),[share,setShare]=useState(saved.form.share);
 const [currency,setCurrency]=useState(saved.form.currency),[unit,setUnit]=useState(saved.form.unit);
 const [fees,setFees]=useState(saved.form.fees);
 const [cover,setCover]=useState(saved.form.cover||{useMainArtist:true,artist:'',title:'',description:'',wallet:'',ipCategory:'illustration'});
 // Signed responses and local cross-wallet requests remain in volatile React state, not localStorage.
 const [linkedBricks,setLinkedBricks]=useState([]);
 const [packet,setPacket]=useState(null),[mint,setMint]=useState(null),[dialog,setDialog]=useState(''),[stage,setStage]=useState(0);
 const [network,setNetwork]=useState(saved.settings.network),[rpcUrl,setRpcUrl]=useState(saved.settings.rpcUrl),[ganacheChainId,setChainId]=useState(saved.settings.ganacheChainId),[factories,setFactories]=useState(()=>{
  const existing=saved.settings.factories;
  return {...existing,
   'ganache:1337:http://127.0.0.1:8545':existing['ganache:1337:http://127.0.0.1:8545']||import.meta.env.VITE_ROAD_GANACHE_FACTORY||'',
   'sepolia:11155111':existing['sepolia:11155111']||import.meta.env.VITE_ROAD_SEPOLIA_FACTORY||''};
 });
 const [rememberForm,setRememberForm]=useState(saved.settings.rememberForm);
 useEffect(()=>{
  const store=typeof window==='undefined'?null:window.localStorage;
  if(rememberForm)saveMintForm(store,{meta,ipCategoryId,spatial,composition,training,share,currency,unit,fees,cover});
  else clearMintForm(store);
 },[rememberForm,meta,ipCategoryId,spatial,composition,training,share,currency,unit,fees,cover]);
 useEffect(()=>{
  const store=typeof window==='undefined'?null:window.localStorage;
  saveMintNetwork(store,{network,rpcUrl,ganacheChainId,factories,rememberForm});
 },[network,rpcUrl,ganacheChainId,factories,rememberForm]);
 const chainId=network==='sepolia'?'11155111':ganacheChainId;
 const factoryKey=network+':'+chainId+(network==='ganache'?':'+rpcUrl:'');
 const factoryAddress=factories[factoryKey]||'';
 const setFactoryAddress=value=>setFactories(old=>({...old,[factoryKey]:value}));
 const execution=mintMode(wallet,network);
 const reviewContext=useRef(null);
 const context=JSON.stringify([wallet,execution,rpcUrl,chainId,factoryAddress]);
 useEffect(()=>{
  const provider=window.ethereum;if(!wallet||!provider?.request)return;
  let active=true,revision=0;
  const update=id=>{if(active)setNetwork(Number(id)===11155111?'sepolia':'ganache')};
  const changed=id=>{revision++;update(id)};
  provider.request({method:'eth_chainId'}).then(id=>{if(!revision)update(id)}).catch(()=>{});
  provider.on?.('chainChanged',changed);
  return()=>{active=false;provider.removeListener?.('chainChanged',changed)};
 },[wallet]);
 useEffect(()=>{if(dialog==='confirm'&&reviewContext.current!==context){setDialog('');setError('Wallet or network changed. Review the mint again.')}},[context,dialog]);
 const identity={mode:wallet?'external':'assisted',connected:!!wallet,address:wallet||''};
 const payload={metadata:{...meta,ipCategory:ipCategoryId,spatial:category.spatial?spatial:{}},assets,identity,royalties:{creatorBps:share},training,composition:composition&&isMusic,storage:ipfsEnabled?'ipfs-encrypted-pilot':'demo-encrypted-in-browser',licensing:{currency,useUnit:unit,...fees},cover,linkedBricks};
 const chooseCategory=id=>{
  if(id===ipCategoryId)return;
  // Files from another category must not become this category's registered work.
  fileGeneration.current+=1;
  refs.current={};vault.current={secret:null,encrypted:new Map()};
  setAssets({});setStatus('');setError('');setSpatial({});setLinkedBricks([]);setCover({useMainArtist:true,artist:'',title:'',description:'',wallet:'',ipCategory:'illustration'});setIpCategoryId(id);
 };
 const attach=async(id,file)=>{
  const generation=fileGeneration.current;
  setError('');refs.current[id]=file;vault.current.encrypted.delete(id);
  const record={name:file.name,type:file.type,size:file.size,status:'hashing'};
  setAssets(old=>({...old,[id]:record}));
  if(file.size>256*1048576){setAssets(old=>({...old,[id]:{...record,error:'Prototype limit 256 MB per file',status:'failed'}}));return}
  try{
   const raw=await file.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),b=>b.toString(16).padStart(2,'0')).join('');
   if(generation!==fileGeneration.current)return;
   setAssets(old=>old[id]?.name===file.name?{...old,[id]:{...record,hash,status:'ready'}}:old);
   if(id==='preview'){const t=extractId3(new Uint8Array(raw));setMeta(old=>{const n={...old};for(const [k,v] of Object.entries(t.fields))if(k in n&&!n[k])n[k]=String(v);return n;});}
   if(id==='metadata'&&file.size<262144){const entries=parseMetadataText(await file.text());if(generation!==fileGeneration.current)return;setMeta(old=>{const n={...old};for(const [k,v] of Object.entries(entries))if(k in n&&!n[k]&&typeof v!=='object')n[k]=String(v);return n;});}
  }catch(e){if(generation===fileGeneration.current)setAssets(old=>({...old,[id]:{...record,error:e.message||'File read failed',status:'failed'}}));}
 };
 const encryptAndAdvance=async()=>{
  if(busy)return;
  if(!assets.master?.hash){setError('Attach a primary work file before continuing.');return}
  if(Object.values(assets).some(a=>a.status==='hashing'||a.error)){setError('Wait for files to finish hashing, or replace failed files.');return}
  const slots=visibleSlots.filter(x=>assets[x.id]?.hash);
  // The encrypted container adds a small overhead; catch oversize WAV/project
  // files before the creator invests time validating the full registration.
  if(ipfsEnabled&&slots.some(slot=>assets[slot.id].size>32*1048576-4096)){
   setError('YBR IPFS pilot limit is 32 MiB per encrypted asset. Choose smaller test media or use local-only encryption.');
   return;
  }
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
  if(step===2){const errors=validateMintInput(payload);if(errors.length){setError(errors.join(' '));return}}
  if(step===3){const errors=validateMintInput(payload);if(errors.length){setError(errors.join(' '));return}reviewContext.current=context;setPacket(makeRegistrationPacket(payload,new Date().toISOString()));setDialog('confirm');return}
  setError('');setStep(step+1);
 };
 const mintLock=useRef(false),activeExecution=useRef('simulated');
 const mintDemo=async()=>{
  if(mintLock.current)return;
  if(reviewContext.current!==context){setDialog('');setError('Wallet or network changed. Review the mint again.');return}
  mintLock.current=true;activeExecution.current=execution;
  setDialog('waiting');setBusy(true);setError('');
  const result={simulated:false,status:'pending',receipts:[]};
  try{
   let receipt;
   let uploadedPacket=packet;
   if(ipfsEnabled){
    if(!vault.current.secret)throw Error('Local encryption key is unavailable. Return to file upload and re-encrypt.');
    setStatus('Checking YBR IPFS service before accepting the sealed package…');
    await checkLocalIpfs();
    let pinnedAssets={...assets};
    for(const [i,slot] of visibleSlots.filter(x=>assets[x.id]?.hash).entries()){
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
    receipt=await mintOnChain({packet:uploadedPacket,provider:window.ethereum,rpcUrl,chainId,network,factoryAddress,onUpdate:setStatus,result});
   }
   else {for(let i=0;i<4;i++){setStage(i);await wait(750)}receipt=simulateMintReceipts(uploadedPacket);}
   if(!receipt.simulated){try{localStorage.setItem(factoryStorageKey(Number(chainId)),factoryAddress)}catch{}}
   setMint(receipt);setPacket(p=>({...uploadedPacket,[receipt.simulated?'demoMint':'onChainMint']:receipt,...(!receipt.simulated?{notices:p.notices.filter(n=>!n.startsWith('No wallets created')).concat('Brick contracts registered on the selected blockchain. No hosted files, licenses or automated royalties. The Building remains an off-chain proposal.')}:{})}));setStep(4);setDialog('complete');
  }catch(e){setError('Mint failed: '+(e.shortMessage||e.message));if(result.receipts.length){result.status='incomplete';setMint(result);setPacket(p=>({...p,onChainMint:result}));setStep(4)}setDialog('')}finally{mintLock.current=false;setBusy(false)}
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
  const kit={format:'0x-road-ipfs-recovery-v1',warning:'PRIVATE DECRYPTION SECRET. Anyone with this file and the CIDs can access your protected work.',
   key:vault.current.secret,assets:visibleSlots.filter(slot=>assets[slot.id]?.ipfsUpload?.cid)
    .map(slot=>({role:slot.id,name:assets[slot.id].name,cid:assets[slot.id].ipfsUpload.cid,
      encryptedSha256:assets[slot.id].encryption?.sha256})),
   metadata:packet?.bricks?.filter(b=>b.metadataCipherCid).map(b=>({role:b.role,cid:b.metadataCipherCid}))||[]};
  const url=URL.createObjectURL(new Blob([JSON.stringify(kit,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='ybr-private-recovery-keys.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
 };
 const exportPacket=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(packet,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='road-demo-mint.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)};
 const reset=()=>{fileGeneration.current+=1;vault.current={secret:null,encrypted:new Map()};refs.current={};setMeta(initial);setAssets({});setPacket(null);setMint(null);setDialog('');setStatus('');setError('');setStep(0);setIpCategoryId('sound-recording');setSpatial({});setLinkedBricks([]);setCover({useMainArtist:true,artist:'',title:'',description:'',wallet:'',ipCategory:'illustration'});setIpfsEnabled(false);setIpfsHealth('')};
 return <div className="ms-wrap"><section className="ms-hero"><span>0x🟨 ROAD / CREATOR STUDIO</span><h2>Your studio → Yellow Bricks.</h2><p>Register original works while keeping originals and encryption keys private in your browser. Optionally pin encrypted files to YBR IPFS, then use a simulated or wallet-signed test mint.</p><b>{execution==='simulated'?'SIMULATED · NO ON-CHAIN MINT':network==='sepolia'?'SEPOLIA · WALLET-SIGNED TRANSACTIONS':'GANACHE · REAL LOCAL TRANSACTIONS'}</b></section>
 <div className="ms-progress">{stages.map((s,i)=><div key={s} className={step===i?'active':step>i?'done':''}><span>{i+1}</span>{s}</div>)}</div>
 <div className="ms-grid" inert={dialog?true:undefined}><section className="ms-panel">
 {step===0&&<><h2>01. Identify the creator.</h2><p>{wallet?`Connected: ${displayName||wallet}. You’ll configure the mint network in Step 4.`:'Continue with the simulation, or connect a wallet for real minting. Network setup comes in Step 4.'}</p><div className="ms-ip-choice"><label htmlFor="road-ip-category">Select a type of intellectual property</label><select id="road-ip-category" value={ipCategoryId} onChange={e=>chooseCategory(e.target.value)}>{groupedIpCategories().map(([group,entries])=><optgroup key={group} label={group}>{entries.map(entry=><option key={entry.id} value={entry.id}>{entry.label}</option>)}</optgroup>)}</select><small>{category.examples} · {IP_CATEGORIES.length} available categories</small><small>Switching IP categories clears attached demo files to prevent accidental reuse under the wrong rights category.</small>{category.notice&&<p className="ms-ip-warning">{category.notice}</p>}</div>{!wallet&&<button className="ms-primary" onClick={onConnect}>Connect wallet</button>}<div className="ms-local-pref"><label><input type="checkbox" checked={rememberForm} onChange={e=>setRememberForm(e.target.checked)}/> Remember form fields on this device</label><small>Local browser storage, not encrypted. Original files, wallet secrets, signing data and encryption keys are never saved. Ganache network and factory settings remain saved separately.</small><button type="button" onClick={()=>{setRememberForm(false);clearMintForm(window.localStorage)}}>Clear saved form</button></div><div className="ms-highlight"><strong>Creator alias</strong><code>{aliasFor(meta.artist||'artist')}</code><p>Separate from ENS and Ethereum addresses.</p></div></>}
 {step===1&&<><h2>02. Attach files.</h2><p>Any file format is accepted. Files are encrypted in your browser. Optional IPFS upload occurs only after rights validation and your final confirmation.</p><div className="ms-files">{visibleSlots.map(slot=><Fragment key={slot.id}><UploadSectionHeading slotId={slot.id} category={category}/><label><div><strong>{slotLabel(slot.id)}{slot.required?' *':''}</strong><small>{assets[slot.id]?.name||'Any file extension'}</small><small>{assets[slot.id]?.error|| (assets[slot.id]?.status==='hashing'?'Hashing…':assets[slot.id]?.ipfsUpload?.verified?'🔒 Pinned to IPFS · '+assets[slot.id].ipfsUpload.cid:assets[slot.id]?.demoUpload?'🔒 Encrypted / DEMO receipt '+assets[slot.id].demoUpload.receiptId:assets[slot.id]?.hash?'✓ Ready':'Choose file')}</small></div><span>Browse</span><input type="file" aria-label={'Choose '+slotLabel(slot.id)} onChange={e=>{if(e.target.files[0])void attach(slot.id,e.target.files[0]);e.target.value=''}}/></label></Fragment>)}</div><section className="ms-encrypt"><h3>🔒 Browser encryption &amp; IPFS</h3>
 <p>All originals are encrypted locally with AES-256-GCM. Choose whether to pin the encrypted files to your own YBR IPFS node, or use the offline demonstration.</p>
 <label className="ms-ipfs-option"><input type="checkbox" checked={ipfsEnabled} onChange={e=>{setIpfsEnabled(e.target.checked);setIpfsHealth('')}}/>
  Upload encrypted files to my local YBR IPFS node (experimental)</label>
 {ipfsEnabled&&<><p className="ms-ipfs-warning">Pilot limit: 32 MiB per encrypted file. IPFS is a publicly retrievable, content-addressed network. Only encrypted containers are sent, but ciphertext, approximate file sizes and CIDs can be copied indefinitely. Keep the recovery key private. This local pilot does not guarantee global availability or backup.</p>
  <button type="button" className="ms-outline" disabled={busy} onClick={()=>void checkLocalIpfs().then(x=>setIpfsHealth('Connected YBR IPFS node: '+x.peerId)).catch(e=>setIpfsHealth(e.message))}>Test IPFS connection</button>
  {ipfsHealth&&<p role="status">{ipfsHealth}</p>}
 </>}
 <p>Without IPFS, uploads remain simulated. Encryption keys stay in browser memory and are not uploaded.</p>
 {status&&<p role="status">{status}</p>}
 </section></>}
 {step===2&&<><h2>03. IP and licensing.</h2>{ipfsEnabled&&<div className="ms-ipfs-confirm"><strong>Files encrypted locally, pending creator approval</strong>
 <p>Nothing has been sent to IPFS yet. You can download an early private key backup now, then download it again after confirmed upload to include final CIDs. Keep the backup private; losing it makes pinned ciphertext inaccessible.</p>
 <button type="button" className="ms-outline" onClick={exportRecovery}>Download private key backup ↓</button>
 </div>}<p>{isMusic?'Recording and songwriting become separate Bricks by default. Writers are credited separately from the recording artist.':'Register a work and supporting evidence. Creator claims are not independently verified by this demo.'}</p><p className="ms-ip-hint">IP category: <strong>{category.label}</strong></p><div className="ms-fields">{fields.filter(([id])=>isMusic||(id==='genre'&&category.group==='Music & audio')||(id==='songwriters'&&category.writers)||!['songwriters','daw','release','genre','bpm','key','isrc','iswc'].includes(id)).map(([id,label])=><label key={id}><span>{id==='title'&&!isMusic?'Work title':id==='artist'&&!isMusic?'Creator / claimant':label}</span>{id==='genre'?<MusicGenreSelect value={meta.genre} onChange={genre=>setMeta(p=>({...p,genre}))}/>:id==='description'?<textarea value={meta[id]} onChange={e=>setMeta(p=>({...p,[id]:e.target.value}))}/>:<input value={meta[id]} onChange={e=>setMeta(p=>({...p,[id]:e.target.value}))}/>}</label>)}</div>{category.spatial&&<section className="ms-spatial-fields"><h3>Spatial capture &amp; provenance</h3><p>Dates and credits below are creator-declared; attaching spatial video or motion capture does not establish first performance or exclusive rights. SHA-256 of the original file is recorded.</p><div className="ms-fields">{SPATIAL_FIELDS.map(field=><label key={field.id}><span>{field.label}</span><input placeholder={field.placeholder} value={spatial[field.id]||''} onChange={e=>setSpatial(p=>({...p,[field.id]:e.target.value}))}/></label>)}</div><small>Optional C2PA and PROV-O references link to external evidence, not automatically verified attestations.</small></section>}{category.group==='Music & audio'&&<section className="ms-link-panel">
 <h3>Cover artwork · independent visual IP Brick</h3>
 <p>The recording artist is also credited as cover artist by default. You can explicitly select another cover creator, or reference an existing visual Brick with controller approval.</p>
 {assets.artwork?.hash?<div className="ms-fields">
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
 <LinkAuthorizationCreator wallet={wallet} assets={assets} links={linkedBricks} onChange={setLinkedBricks} onConnect={onConnect}/>{isMusic&&<label className="ms-check"><input type="checkbox" checked={composition} onChange={e=>setComposition(e.target.checked)}/> Independent Songwriting / Composition Brick (default)</label>}<label className="ms-select">AI training policy<select value={training} onChange={e=>setTraining(e.target.value)}>{trainingModes.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label><label className="ms-select">{isMusic?'Master':'Work'} creator payout share ({share/100}%)<input type="range" min="0" max="10000" step="500" value={share} onChange={e=>setShare(Number(e.target.value))}/></label><div className="ms-demo-fees"><h3>AI dataset licensing proposals · {category.label}</h3><label>Denomination <select value={currency} onChange={e=>setCurrency(e.target.value)}><option>USDC</option><option>USD</option></select></label><label>Use fee unit <select value={unit} onChange={e=>setUnit(e.target.value)}><option value="per-1000-outputs">Per 1,000 outputs</option><option value="per-output">Per output</option><option value="per-model-deployment">Per model deployment</option></select></label>{[['masterIngestionCents',isMusic?'Recording ingestion':'Work ingestion',100000,500],['masterUseCents',isMusic?'Recording use':'Work use',25000,25],...(isMusic?[['writingIngestionCents','Songwriting ingestion',100000,500],['writingUseCents','Songwriting use',25000,25]]:[])].map(([id,label,max,step])=><label key={id}>{label}: <strong>{(fees[id]/100).toFixed(2)} {currency}</strong><input type="range" min="0" max={max} step={step} value={fees[id]} onChange={e=>setFees(p=>({...p,[id]:Number(e.target.value)}))}/></label>)}<small>Draft quotes, not licenses or payments.</small></div></>}
 {step===3&&<><h2>04. Review mint.</h2><div className="ms-review">{[['Work',meta.title],['Category',category.label],['Artist',meta.artist],['Writers',isMusic&&composition?(meta.songwriters||'Attribution pending'):category.writers?(meta.songwriters||'Attribution pending'):'Not applicable'],['Bricks',category.label+(isMusic&&composition?', songwriting':'')+(visibleSlots.some(slot=>slot.id==='artwork')&&assets.artwork?.hash?', artwork':'')],['Cover artist',assets.artwork?.hash?(cover.useMainArtist!==false?(meta.artist||'Pending creator'):(cover.artist||'Pending collaborator')):'Not attached'],['External Brick references',linkedBricks.length],['Storage',ipfsEnabled?'YBR IPFS encrypted upload pending your confirmation':'Local demo, simulated upload'],['Encrypted assets',Object.values(assets).filter(a=>a.ipfsUpload?.verified||a.demoUpload).length],['Currency',currency],['Recording ingestion',(fees.masterIngestionCents/100).toFixed(2)],['Writing ingestion',isMusic&&composition?(fees.writingIngestionCents/100).toFixed(2):'Not applicable']].map(([k,v])=><div key={k}><span>{k}</span><strong>{v}</strong></div>)}</div>{linkedBricks.length>0&&<section className="ms-link-panel"><h3>External Brick approvals</h3>
 {linkedBricks.map(link=><p key={link.id}>{link.relation} → {link.targetBrick} · {link.response?'Signed response supplied; reverified before on-chain mint':'Awaiting current-controller signature'}</p>)}
 <p>Signed EIP-712 requests are off-chain consent evidence. No on-chain Building link or DSP license is created here.</p>
 </section>}<section className="ms-chain-mode"><h3>Test mint setup</h3>{wallet?<div className="ms-fields"><p>Connected: {displayName||wallet}. Minting will request wallet signatures.</p><label>Mint network<select value={network} onChange={e=>setNetwork(e.target.value)}><option value="ganache">Local Ganache</option><option value="sepolia">Sepolia testnet</option></select></label>{network==='ganache'&&<><label>Local RPC URL<input value={rpcUrl} onChange={e=>setRpcUrl(e.target.value)}/></label><label>Chain ID (decimal)<input value={ganacheChainId} onChange={e=>setChainId(e.target.value)}/></label></>}<label>{network==='sepolia'?'Sepolia':'Ganache'} factory address<input value={factoryAddress} onChange={e=>setFactoryAddress(e.target.value)}/></label><p>{network==='sepolia'?'Switch your wallet to Sepolia (11155111) and enter a deployed YellowBrickFactory address. Each confirmed mint spends Sepolia test ETH for gas.':'Run the local factory deployment command and paste its address. Wallet and RPC must use the same Ganache instance.'}</p></div>:<p>No wallet connected — the original simulation will run. Connect a wallet for real minting.</p>}{!wallet&&<button type="button" className="ms-outline" onClick={onConnect}>Connect wallet for real minting</button>}</section><aside>{execution==='simulated'?'No blockchain transaction or wallet signature occurs.':'Real transactions require wallet approval and gas on the selected network. IPFS is optional: when enabled, encrypted metadata CIDs are committed, not readable plaintext. No licenses or payout rules are installed.'}</aside></>}
 {step===4&&packet&&<><h2>05. Mint results.</h2><div className="ms-alert"><strong>{mint?.simulated?'SIMULATED RECEIPTS ONLY':mint?.status==='confirmed'?'VERIFIED ON CHAIN':'INCOMPLETE — REVIEW TRANSACTIONS BEFORE RETRYING'}</strong><p>{mint?.simulated?'No contract addresses or transaction hashes were produced.':'Save the packet. Pending or unverified transactions may still be mined; inspect them before starting again.'}</p></div><div className="ms-receipts">{mint?.receipts.map(r=><div className="ms-receipt" key={r.id||r.transactionHash}>
 <div className="ms-receipt-heading"><strong>{r.role}</strong><CopyAllButton label={r.role||r.title||"Brick"} text={formatMintReceiptForCopy(r,mint)}/></div>
 {r.status==='verified'&&<span className="ms-verified">Verified on chain</span>}
 {r.nftContractAddress&&r.tokenId?<>
  <div className="ms-receipt-primary"><span>NFT contract address (import this)</span><CopyField label="NFT contract address" value={r.nftContractAddress}/></div>
  <div className="ms-receipt-primary"><span>Token ID (decimal, import this)</span><CopyField label="NFT token ID" value={r.tokenId}/></div>
  <small>ERC-721 registration receipt. The NFT is not IP ownership. Wallet artwork depends on wallet metadata compatibility.</small>
 </>:!mint?.simulated&&<small>This Brick was minted through a legacy factory without an ERC-721 receipt; it cannot be imported as an NFT. Redeploy the updated factory for future mints.</small>}
 {r.contractAddress&&<div><span>Underlying Brick contract</span><CopyField label="Brick contract address" value={r.contractAddress}/></div>}
 {r.id&&<div><span>Brick IP ID</span><CopyField label="Brick IP ID" value={r.id}/></div>}
 {r.transactionHash&&<div><span>Transaction hash</span><CopyField label="transaction hash" value={r.transactionHash}/></div>}
 {r.blockNumber!==undefined&&<div><span>Block</span><CopyField label="block number" value={r.blockNumber}/></div>}
 {r.gasUsed&&<div><span>Gas used</span><CopyField label="gas used" value={r.gasUsed}/></div>}
 {r.chainId===11155111&&r.transactionHash&&<a target="_blank" rel="noreferrer" href={`https://sepolia.etherscan.io/tx/${r.transactionHash}`}>View on Sepolia Etherscan ↗</a>}
 {mint?.simulated&&<span>Simulation receipt: {r.id}</span>}
 </div>)}</div><h3>Simulated authorized downloads</h3><p>The demo authorizes locally, retrieves the session key, decrypts in-browser, then downloads the original file.</p>{visibleSlots.filter(x=>vault.current.encrypted.has(x.id)).map(x=><button key={x.id} className="ms-outline" onClick={()=>download(x.id)}>DEMO authorize &amp; download {slotLabel(x.id)}</button>)}{ipfsEnabled&&<div className="ms-ipfs-confirm"><strong>Real encrypted IPFS storage</strong>
 <p>The CID references below point to encrypted metadata, not public metadata JSON. This node has verified local pins, not multi-region replicas.</p>
 {packet.bricks.filter(b=>b.metadataCipherCid).map(b=><p key={b.localId}>{b.role}: <CopyField label={b.role+' metadata CID'} value={b.metadataCipherCid}/></p>)}
 <button type="button" className="ms-outline" onClick={exportRecovery}>Download private recovery keys ↓</button>
 </div>}
 <button className="ms-primary" onClick={exportPacket}>Download JSON packet ↓</button><button className="ms-outline" onClick={reset}>Start another work</button></>}
 {error&&<p className="ms-error" role="alert">{error}</p>}
 {step<4&&<div className="ms-actions">{step>0&&<button className="ms-outline" disabled={busy} onClick={()=>{setStep(i=>i-1);setError('')}}>← Back</button>}<button className="ms-primary" disabled={busy} onClick={next}>{busy?'Encrypting…':step===1?'Encrypt & Continue →':step===3?(execution==='simulated'?'Simulate mint →':'Review wallet mint →'):'Continue →'}</button></div>}
 </section><aside className="ms-side"><strong>THE CREATOR'S ROAD</strong><ol><li>Connect a wallet or continue with simulation</li><li>Attach all source files</li><li>Automatic client-side encryption</li><li>Separate Bricks for applicable creative rights</li><li>Draft dataset ingestion and use fees</li><li>Confirm simulated receipts or wallet transactions</li><li>Decrypt after simulated authorization</li></ol><p>PILOT ONLY. Original files and decryption keys never leave the browser. Optional ciphertext pinning uses your local YBR IPFS node. Authorized remote delivery, managed key recovery and royalty payouts are not implemented. Wallets deploy test Bricks on Ganache or Sepolia.</p></aside></div>
 {dialog&&<div className="ms-demo-overlay"><div role="dialog" aria-modal="true" className="ms-demo-dialog"><b>0x🟨 ROAD · DEMO</b>{dialog==='confirm'?<><h2>Confirm your Yellow Bricks?</h2><p>{execution==='simulated'?'This is a simulation. No transaction will occur.':`Mint ${packet?.bricks.length} Bricks on chain ${chainId} through factory ${factoryAddress}. Confirm each transaction in your wallet. ${ipfsEnabled?'You also authorize the permanent publication of encrypted files and metadata to local IPFS before minting. Keep the private recovery key.':'No files are hosted; only local demo metadata URIs are committed.'}`}</p><button className="ms-outline" onClick={()=>setDialog('')}>Cancel</button><button className="ms-primary" onClick={()=>void mintDemo()}>{execution==='simulated'?'Confirm simulation':'Request wallet signatures'}</button></>:dialog==='waiting'?<><span className="ms-demo-spinner"/><h2>Preparing your Bricks…</h2><p role="status">{activeExecution.current!=='simulated'?status:['Validating rights declarations','Preparing separate IP Bricks','Preparing contextual Building','Simulating confirmation'][stage]}</p><small>{activeExecution.current==='simulated'?'No blockchain transaction is being sent.':'Do not close this page while transactions are pending.'}</small></>:<><h2>Mint complete</h2><p>{mint?.receipts.length||0} Brick receipt(s) are ready.</p><button className="ms-primary" onClick={()=>setDialog('')}>View receipts →</button></>}</div></div>}
 </div>;
}