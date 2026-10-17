import {useRef,useState} from 'react';
import {aliasFor,availableAssetSlots,makeRegistrationPacket,trainingModes,validateMintInput,parseMetadataText} from './mint-model.js';
import {extractId3} from './mp3-tags.js';
import {encryptDemoBatch,openDemoDownload} from './demo-vault.js';
import {simulateMintReceipts} from './demo-mint.js';
import {mintPacketOnChain,mintConfigFor} from './road-chain.js';
import {IP_CATEGORIES,SPATIAL_FIELDS,getIpCategory,groupedIpCategories} from './ip-catalog.js';
import './mint-studio.css';
import './mint-demo.css';
const stages=['Identity','Files','Rights','Review','Receipts'];
const fields=[['title','Track title'],['artist','Recording artist / claimant'],['songwriters','Songwriters / composers (comma-separated)'],['daw','DAW / software'],['release','Album / release'],['genre','Genre'],['bpm','BPM'],['key','Musical key'],['isrc','Recording ISRC'],['iswc','Composition ISWC'],['description','Notes']];
const initial={title:'',artist:'',songwriters:'',daw:'FL Studio',release:'',genre:'',bpm:'',key:'',isrc:'',iswc:'',description:''};
const labels={master:'Master recording',preview:'Audio preview',artwork:'Cover artwork',project:'Project File',metadata:'Metadata sidecar'};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export default function MintStudioDemo({wallet,displayName,onConnect}){
 const [step,setStep]=useState(0),[mode,setMode]=useState('assisted'),[meta,setMeta]=useState(initial),[assets,setAssets]=useState({});
 const [ipCategoryId,setIpCategoryId]=useState('sound-recording'),[spatial,setSpatial]=useState({});
 const category=getIpCategory(ipCategoryId),isMusic=!!category.musical;
 const visibleSlots=availableAssetSlots(ipCategoryId);
 const slotLabel=id=>id==='master'?category.primary:id==='project'&&category.spatial?'Spatial / skeletal tracking data':labels[id];
 const refs=useRef({}),vault=useRef({secret:null,encrypted:new Map()}),fileGeneration=useRef(0);
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
 const [composition,setComposition]=useState(true),[training,setTraining]=useState('separate-license'),[share,setShare]=useState(10000);
 const [currency,setCurrency]=useState('USDC'),[unit,setUnit]=useState('per-1000-outputs');
 const [fees,setFees]=useState({masterIngestionCents:10000,masterUseCents:500,writingIngestionCents:5000,writingUseCents:250});
 const [packet,setPacket]=useState(null),[mint,setMint]=useState(null),[dialog,setDialog]=useState(''),[stage,setStage]=useState(0);

 const [mintMode,setMintMode]=useState('ganache');
 const [factories,setFactories]=useState({ganache:import.meta.env.VITE_ROAD_GANACHE_FACTORY||'',sepolia:import.meta.env.VITE_ROAD_SEPOLIA_FACTORY||''});
 const [txProgress,setTxProgress]=useState(null);
 const identity={mode,connected:!!wallet,address:wallet||''};
 const payload={metadata:{...meta,ipCategory:ipCategoryId,spatial:category.spatial?spatial:{}},assets,identity,royalties:{creatorBps:share},training,composition:composition&&isMusic,storage:'demo-encrypted-in-browser',licensing:{currency,useUnit:unit,...fees}};
 const chooseCategory=id=>{
  if(id===ipCategoryId)return;
  // Files from another category must not become this category's registered work.
  fileGeneration.current+=1;
  refs.current={};vault.current={secret:null,encrypted:new Map()};
  setAssets({});setStatus('');setError('');setSpatial({});setIpCategoryId(id);
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
  const fresh=slots.filter(x=>!assets[x.id].demoUpload||!vault.current.encrypted.has(x.id));
  if(!fresh.length){setStep(2);return;}
  setBusy(true);setError('');setStatus('Encrypting files in your browser…');
  try{
   const out=await encryptDemoBatch({items:fresh.map(x=>({id:x.id,file:refs.current[x.id],originalSha256:assets[x.id].hash})),secret:vault.current.secret,existing:vault.current.encrypted,onProgress:(id,state)=>setStatus(state==='encrypting'?'Encrypting '+slotLabel(id)+'…':'Simulating upload of '+slotLabel(id)+'…')});
   vault.current={secret:out.secret,encrypted:out.encrypted};
   setAssets(old=>Object.fromEntries(Object.entries(old).map(([id,a])=>[id,out.updates[id]?{...a,...out.updates[id]}:a])));
   refs.current={};setStatus('All files encrypted; demo upload complete.');setStep(2);
  }catch(e){setError('Encryption failed: '+(e.message||'Unknown error'))}finally{setBusy(false)}
 };
 const next=()=>{
  if(step===0&&mode==='external'&&!wallet){setError('Connect your wallet or select assisted demo.');return}
  if(step===1){void encryptAndAdvance();return}
  if(step===2){const errors=validateMintInput(payload);if(errors.length){setError(errors.join(' '));return}}
  if(step===3){
   const mintInput=mintMode==='demo'?payload:{...payload,identity:{...payload.identity,mode:'external',connected:!!wallet}};
   const errors=validateMintInput(mintInput);
   if(errors.length){setError(errors.join(' '));return}
   if(mintMode!=='demo'&&!/^0x[0-9a-fA-F]{40}$/.test(factories[mintMode]||'')){
    setError('Enter the YellowBrickFactory address deployed on '+mintConfigFor(mintMode).name+'.');
    return;
   }
   setPacket(makeRegistrationPacket(mintInput,new Date().toISOString()));setDialog('confirm');setError('');return;
  }
  setError('');setStep(step+1);
 };
 const mintDemo=async()=>{
  setDialog('waiting');setBusy(true);
  try{
   for(let i=0;i<4;i++){setStage(i);await wait(750)}
   const receipt=simulateMintReceipts(packet);
   setMint(receipt);setPacket(p=>({...p,demoMint:receipt}));setStep(4);setDialog('complete');
  }catch(e){setError('Demo mint failed: '+e.message);setDialog('')}finally{setBusy(false)}
 };
 const mintReal=async()=>{
  if(!wallet){setDialog('');setError('Connect your test wallet first.');return;}
  setBusy(true);setError('');setTxProgress({phase:'connecting'});setDialog('waiting');
  try{
   const result=await mintPacketOnChain({packet,provider:window.ethereum,account:wallet,mode:mintMode,factoryAddress:factories[mintMode],onProgress:setTxProgress});
   setMint(result);setPacket(p=>({...p,onChainMint:result}));setStep(4);setDialog('complete');
  }catch(e){
   const confirmed=e.confirmedReceipts||[];
   if(confirmed.length){
    const config=mintConfigFor(mintMode);
    const partial={simulated:false,status:'PARTIAL_CONFIRMATION',chainId:config.id,network:config.name,factoryAddress:factories[mintMode],receipts:confirmed};
    setMint(partial);setPacket(p=>({...p,onChainMint:partial}));setStep(4);setDialog('partial');
   }else setDialog('');
   setError('On-chain mint stopped: '+(e.shortMessage||e.message||'Wallet error')+'. Check prior transactions before retrying.');
  }finally{setBusy(false);}
 };
 const download=async(id)=>{
  try{
   const entry=vault.current.encrypted.get(id);
   const result=await openDemoDownload({entry,secret:vault.current.secret,authorized:true});
   const url=URL.createObjectURL(new Blob([result.bytes],{type:result.mime}));
   const a=document.createElement('a');a.href=url;a.download=result.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
  }catch(e){setError(e.message)}
 };
 const exportPacket=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(packet,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='road-demo-mint.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)};
 const reset=()=>{fileGeneration.current+=1;vault.current={secret:null,encrypted:new Map()};refs.current={};setMeta(initial);setAssets({});setPacket(null);setMint(null);setDialog('');setStatus('');setError('');setStep(0);setIpCategoryId('sound-recording');setSpatial({});setMintMode('ganache');setTxProgress(null)};
 return <div className="ms-wrap"><section className="ms-hero"><span>0x🟨 ROAD / CREATOR STUDIO</span><h2>Your studio → Yellow Bricks.</h2><p>Register original works, encrypt the sources locally, then choose a simulated mint or a real wallet-signed test-chain transaction.</p><b>TEST ENVIRONMENT · FILE UPLOAD SIMULATED</b></section>
 <div className="ms-progress">{stages.map((s,i)=><div key={s} className={step===i?'active':step>i?'done':''}><span>{i+1}</span>{s}</div>)}</div>
 <div className="ms-grid"><section className="ms-panel">
 {step===0&&<><h2>01. Identify the creator.</h2><div className="ms-ip-choice"><label htmlFor="road-ip-category">Select a type of intellectual property</label><select id="road-ip-category" value={ipCategoryId} onChange={e=>chooseCategory(e.target.value)}>{groupedIpCategories().map(([group,entries])=><optgroup key={group} label={group}>{entries.map(entry=><option key={entry.id} value={entry.id}>{entry.label}</option>)}</optgroup>)}</select><small>{category.examples} · {IP_CATEGORIES.length} available categories</small><small>Switching IP categories clears attached demo files to prevent accidental reuse under the wrong rights category.</small>{category.notice&&<p className="ms-ip-warning">{category.notice}</p>}</div><div className="ms-cards"><button className={mode==='external'?'selected':''} onClick={()=>setMode('external')}><strong>Connect wallet</strong><small>Use existing EVM identity</small><em>{wallet?displayName:'Not connected'}</em></button><button className={mode==='assisted'?'selected':''} onClick={()=>setMode('assisted')}><strong>Assisted onboarding</strong><small>Demo only, no account creation</small></button></div>{mode==='external'&&<button className="ms-primary" onClick={onConnect}>Connect wallet</button>}<div className="ms-highlight"><strong>Creator alias</strong><code>{aliasFor(meta.artist||'artist')}</code><p>Separate from ENS and Ethereum addresses.</p></div></>}
 {step===1&&<><h2>02. Attach files.</h2><p>Any file format is accepted. Click Continue to encrypt every attached file together and simulate upload.</p><div className="ms-files">{visibleSlots.map(slot=><label key={slot.id}><div><strong>{slotLabel(slot.id)}{slot.required?' *':''}</strong><small>{assets[slot.id]?.name||'Any file extension'}</small><small>{assets[slot.id]?.error|| (assets[slot.id]?.status==='hashing'?'Hashing…':assets[slot.id]?.demoUpload?'🔒 Encrypted / DEMO receipt '+assets[slot.id].demoUpload.receiptId:assets[slot.id]?.hash?'✓ Ready':'Choose file')}</small></div><span>Browse</span><input type="file" aria-label={'Choose '+slotLabel(slot.id)} onChange={e=>{if(e.target.files[0])void attach(slot.id,e.target.files[0]);e.target.value=''}}/></label>)}</div><section className="ms-encrypt"><h3>🔒 Automatic browser encryption</h3><p>Real AES-256-GCM encryption, fake upload. Files and session key remain in memory. They will be lost when you refresh. No real backup or entitlement check.</p>{status&&<p role="status">{status}</p>}</section></>}
 {step===2&&<><h2>03. IP and licensing.</h2><p>{isMusic?'Recording and songwriting become separate Bricks by default. Writers are credited separately from the recording artist.':'Register a work and supporting evidence. Creator claims are not independently verified by this demo.'}</p><p className="ms-ip-hint">IP category: <strong>{category.label}</strong></p><div className="ms-fields">{fields.filter(([id])=>isMusic||(id==='songwriters'&&category.writers)||!['songwriters','daw','release','genre','bpm','key','isrc','iswc'].includes(id)).map(([id,label])=><label key={id}><span>{id==='title'&&!isMusic?'Work title':id==='artist'&&!isMusic?'Creator / claimant':label}</span>{id==='description'?<textarea value={meta[id]} onChange={e=>setMeta(p=>({...p,[id]:e.target.value}))}/>:<input value={meta[id]} onChange={e=>setMeta(p=>({...p,[id]:e.target.value}))}/>}</label>)}</div>{category.spatial&&<section className="ms-spatial-fields"><h3>Spatial capture &amp; provenance</h3><p>Dates and credits below are creator-declared; attaching spatial video or motion capture does not establish first performance or exclusive rights. SHA-256 of the original file is recorded.</p><div className="ms-fields">{SPATIAL_FIELDS.map(field=><label key={field.id}><span>{field.label}</span><input placeholder={field.placeholder} value={spatial[field.id]||''} onChange={e=>setSpatial(p=>({...p,[field.id]:e.target.value}))}/></label>)}</div><small>Optional C2PA and PROV-O references link to external evidence, not automatically verified attestations.</small></section>}{isMusic&&<label className="ms-check"><input type="checkbox" checked={composition} onChange={e=>setComposition(e.target.checked)}/> Independent Songwriting / Composition Brick (default)</label>}<label className="ms-select">AI training policy<select value={training} onChange={e=>setTraining(e.target.value)}>{trainingModes.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label><label className="ms-select">{isMusic?'Master':'Work'} creator payout share ({share/100}%)<input type="range" min="0" max="10000" step="500" value={share} onChange={e=>setShare(Number(e.target.value))}/></label><div className="ms-demo-fees"><h3>AI dataset licensing proposals · {category.label}</h3><label>Denomination <select value={currency} onChange={e=>setCurrency(e.target.value)}><option>USDC</option><option>USD</option></select></label><label>Use fee unit <select value={unit} onChange={e=>setUnit(e.target.value)}><option value="per-1000-outputs">Per 1,000 outputs</option><option value="per-output">Per output</option><option value="per-model-deployment">Per model deployment</option></select></label>{[['masterIngestionCents',isMusic?'Recording ingestion':'Work ingestion',100000,500],['masterUseCents',isMusic?'Recording use':'Work use',25000,25],...(isMusic?[['writingIngestionCents','Songwriting ingestion',100000,500],['writingUseCents','Songwriting use',25000,25]]:[])].map(([id,label,max,step])=><label key={id}>{label}: <strong>{(fees[id]/100).toFixed(2)} {currency}</strong><input type="range" min="0" max={max} step={step} value={fees[id]} onChange={e=>setFees(p=>({...p,[id]:Number(e.target.value)}))}/></label>)}<small>Draft quotes, not licenses or payments.</small></div></>}
 {step===3&&<><h2>04. Review your registration.</h2><div className="ms-review">{[['Work',meta.title],['Category',category.label],['Artist',meta.artist],['Writers',isMusic&&composition?(meta.songwriters||'Attribution pending'):category.writers?(meta.songwriters||'Attribution pending'):'Not applicable'],['Bricks',category.label+(isMusic&&composition?', songwriting':'')+(visibleSlots.some(slot=>slot.id==='artwork')&&assets.artwork?.hash?', artwork':'')],['Encrypted assets',Object.values(assets).filter(a=>a.demoUpload).length],['Currency',currency],['Recording ingestion',(fees.masterIngestionCents/100).toFixed(2)],['Writing ingestion',isMusic&&composition?(fees.writingIngestionCents/100).toFixed(2):'Not applicable']].map(([k,v])=><div key={k}><span>{k}</span><strong>{v}</strong></div>)}</div><section className="ms-chain-mode"><h3>Mint method</h3>
 <label><input type="radio" name="mint-mode" checked={mintMode==='ganache'} onChange={()=>setMintMode('ganache')}/> Ganache Local · wallet transaction · chain 1337</label>
 <label><input type="radio" name="mint-mode" checked={mintMode==='sepolia'} onChange={()=>setMintMode('sepolia')}/> Sepolia · wallet transaction · chain 11155111</label>
 <label><input type="radio" name="mint-mode" checked={mintMode==='demo'} onChange={()=>setMintMode('demo')}/> Simulation only · no wallet signature</label>
 {mintMode==='demo'?<p>Simulation creates fake receipt IDs and never communicates with the blockchain.</p>:<>
  <p>Every Brick requires a wallet transaction and test ETH for gas on <strong>{mintConfigFor(mintMode).name}</strong>. You must approve each one.</p>
  <label className="ms-chain-address">Deployed YellowBrickFactory address<input spellCheck="false" autoComplete="off" value={factories[mintMode]} placeholder="0x..." onChange={e=>setFactories(v=>({...v,[mintMode]:e.target.value.trim()}))}/></label>
  {!wallet&&<button type="button" className="ms-outline" onClick={onConnect}>Connect browser wallet</button>}
  <p><strong>Before minting:</strong> select chain {mintConfigFor(mintMode).id} in MetaMask, use a funded test account, and enter the factory contract deployed on that chain. The site checks contract bytecode before requesting a signature.</p>
 </>}
 <p>All source files remain only in this browser session. The contract stores content and metadata hashes with a non-resolving demonstration URI; it does not upload to IPFS or verify copyright ownership.</p>
 </section></>}
 {step===4&&packet&&<><h2>{mint?.simulated?'05. Simulated mint complete.':mint?.status==='PARTIAL_CONFIRMATION'?'05. Partially confirmed on-chain.':'05. Test-chain mint confirmed.'}</h2><div className="ms-alert"><strong>{mint?.simulated?'SIMULATED RECEIPTS ONLY':'TEST-CHAIN TRANSACTION RECEIPTS'}</strong><p>{mint?.simulated?'No contract addresses or transaction hashes were produced.':`Network: ${mint?.network} · Chain: ${mint?.chainId} · Factory: ${mint?.factoryAddress}. Files are still not uploaded; only commitments and demo metadata URIs are on-chain.`}</p></div><div className="ms-receipts">{mint?.receipts.map(r=><div key={r.id}><span>{r.role}</span><strong>{r.contractAddress||r.id}</strong>{!mint?.simulated&&<><small>Tx: {r.transactionHash}</small><small>Block {r.blockNumber} · Gas {r.gasUsed} · Chain {r.chainId}</small>{r.chainId===11155111&&<a target="_blank" rel="noreferrer" href={`https://sepolia.etherscan.io/tx/${r.transactionHash}`}>View on Sepolia Etherscan ↗</a>}</>}</div>)}</div><h3>Simulated authorized downloads</h3><p>The demo authorizes locally, retrieves the session key, decrypts in-browser, then downloads the original file.</p>{visibleSlots.filter(x=>vault.current.encrypted.has(x.id)).map(x=><button key={x.id} className="ms-outline" onClick={()=>download(x.id)}>DEMO authorize &amp; download {slotLabel(x.id)}</button>)}<button className="ms-primary" onClick={exportPacket}>Download JSON packet ↓</button><button className="ms-outline" onClick={reset}>Start another work</button></>}
 {error&&<p className="ms-error" role="alert">{error}</p>}
 {step<4&&<div className="ms-actions">{step>0&&<button className="ms-outline" disabled={busy} onClick={()=>{setStep(i=>i-1);setError('')}}>← Back</button>}<button className="ms-primary" disabled={busy} onClick={next}>{busy?'Working…':step===1?'Encrypt & Continue →':step===3?(mintMode==='demo'?'Simulate mint →':'Review wallet transactions →'):'Continue →'}</button></div>}
 </section><aside className="ms-side"><strong>THE CREATOR'S ROAD</strong><ol><li>Choose a wallet or assisted demo</li><li>Attach all source files</li><li>Automatic client-side encryption</li><li>Separate Bricks for applicable creative rights</li><li>Draft dataset ingestion and use fees</li><li>Wait for demo mint confirmation</li><li>Decrypt after simulated authorization</li></ol><p>DEMO ONLY. Files are not uploaded. Key recovery, authorized remote delivery, contracts and royalty payouts are future integrations.</p></aside></div>
 {dialog&&<div className="ms-demo-overlay"><div role="dialog" aria-modal="true" aria-label="Mint confirmation" className="ms-demo-dialog">
 <b>0x🟨 ROAD · {mintMode==='demo'?'SIMULATION':'TEST-CHAIN MINT'}</b>
 {dialog==='confirm'?<>
  <h2>{mintMode==='demo'?'Simulate these Bricks?':'Sign test-chain mint transactions?'}</h2>
  <p>{mintMode==='demo'?'This will only generate simulated receipt IDs. No wallet signature or transaction will occur.':`You will be asked to approve ${packet?.bricks.length||0} separate transaction(s) on ${mintConfigFor(mintMode).name} (chain ${mintConfigFor(mintMode).id}) using factory ${factories[mintMode]}. Test ETH gas will be spent. Source files will not be uploaded.`}</p>
  <button className="ms-outline" disabled={busy} onClick={()=>setDialog('')}>Back to review</button>
  <button className="ms-primary" disabled={busy} onClick={()=>void (mintMode==='demo'?mintDemo():mintReal())}>{mintMode==='demo'?'Confirm simulation':'Request wallet signatures'}</button>
 </>:dialog==='waiting'?<>
  <span className="ms-demo-spinner"/>
  <h2>{mintMode==='demo'?'Simulating mint…':'Waiting for wallet / confirmation…'}</h2>
  <p role="status">{mintMode==='demo'?['Preparing declarations','Preparing individual Bricks','Preparing the Building','Generating fake receipts'][stage]:
   txProgress?.phase==='signing'?`Approve Brick ${txProgress.index} of ${txProgress.total}: ${txProgress.role}`:
   txProgress?.phase==='confirming'?`Submitted transaction ${txProgress.hash}. Waiting for chain confirmation…`:
   txProgress?.phase==='confirmed'?`Confirmed ${txProgress.index} of ${txProgress.total} Bricks`:
   'Checking the selected wallet, network and factory…'}</p>
  <small>{mintMode==='demo'?'No transaction is sent.':'Do not close this page while a transaction is pending. Each Brick requires approval.'}</small>
 </>:<>
  <h2>{dialog==='partial'?'Partial on-chain confirmation':mint?.simulated?'Simulated mint complete':'On-chain mint confirmed'}</h2>
  <p>{mint?.receipts.length||0} receipt(s) {mint?.simulated?'simulated':'confirmed on the selected blockchain'}. {dialog==='partial'?'Review the error and previously submitted transactions before starting any new mint.':''}</p>
  <button className="ms-primary" onClick={()=>setDialog('')}>View receipts →</button>
 </>}
 </div></div>}
 </div>;
}