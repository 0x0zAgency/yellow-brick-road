import {mintOnChain,mintMode} from './chain-mint.js';
import {useEffect,useRef,useState} from 'react';
import {aliasFor,availableAssetSlots,makeRegistrationPacket,trainingModes,validateMintInput,parseMetadataText} from './mint-model.js';
import {extractId3} from './mp3-tags.js';
import {encryptDemoBatch,openDemoDownload} from './demo-vault.js';
import {simulateMintReceipts} from './demo-mint.js';
import {IP_CATEGORIES,SPATIAL_FIELDS,getIpCategory,groupedIpCategories} from './ip-catalog.js';
import './mint-studio.css';
import './mint-demo.css';
const stages=['Identity','Files','Rights','Review','Receipts'];
const fields=[['title','Track title'],['artist','Recording artist / claimant'],['songwriters','Songwriters / composers (comma-separated)'],['daw','DAW / software'],['release','Album / release'],['genre','Genre'],['bpm','BPM'],['key','Musical key'],['isrc','Recording ISRC'],['iswc','Composition ISWC'],['description','Notes']];
const initial={title:'',artist:'',songwriters:'',daw:'FL Studio',release:'',genre:'',bpm:'',key:'',isrc:'',iswc:'',description:''};
const labels={master:'Master recording',preview:'Audio preview',artwork:'Cover artwork',project:'Project File',metadata:'Metadata sidecar'};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export default function MintStudioDemo({wallet,displayName,onConnect}){
 const [step,setStep]=useState(0),[meta,setMeta]=useState(initial),[assets,setAssets]=useState({});
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
 const [network,setNetwork]=useState('ganache'),[rpcUrl,setRpcUrl]=useState('http://127.0.0.1:8545'),[ganacheChainId,setChainId]=useState('1337'),[factories,setFactories]=useState({'ganache:1337:http://127.0.0.1:8545':import.meta.env.VITE_ROAD_GANACHE_FACTORY||'','sepolia:11155111':import.meta.env.VITE_ROAD_SEPOLIA_FACTORY||''});
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
   if(execution!=='simulated'){receipt=await mintOnChain({packet,provider:window.ethereum,rpcUrl,chainId,network,factoryAddress,onUpdate:setStatus,result});}
   else {for(let i=0;i<4;i++){setStage(i);await wait(750)}receipt=simulateMintReceipts(packet);}
   setMint(receipt);setPacket(p=>({...p,[receipt.simulated?'demoMint':'onChainMint']:receipt,...(!receipt.simulated?{notices:p.notices.filter(n=>!n.startsWith('No wallets created')).concat('Brick contracts registered on the selected blockchain. No hosted files, licenses or automated royalties. The Building remains an off-chain proposal.')}:{})}));setStep(4);setDialog('complete');
  }catch(e){setError('Mint failed: '+(e.shortMessage||e.message));if(result.receipts.length){result.status='incomplete';setMint(result);setPacket(p=>({...p,onChainMint:result}));setStep(4)}setDialog('')}finally{mintLock.current=false;setBusy(false)}
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
 const reset=()=>{fileGeneration.current+=1;vault.current={secret:null,encrypted:new Map()};refs.current={};setMeta(initial);setAssets({});setPacket(null);setMint(null);setDialog('');setStatus('');setError('');setStep(0);setIpCategoryId('sound-recording');setSpatial({})};
 return <div className="ms-wrap"><section className="ms-hero"><span>0x🟨 ROAD / CREATOR STUDIO</span><h2>Your studio → Yellow Bricks.</h2><p>Register original works with category-appropriate supporting files. Files stay in this browser. Without a wallet, minting is simulated. Connect a wallet to mint on Ganache or Sepolia.</p><b>{execution==='simulated'?'SIMULATED · NO ON-CHAIN MINT':network==='sepolia'?'SEPOLIA · WALLET-SIGNED TRANSACTIONS':'GANACHE · REAL LOCAL TRANSACTIONS'}</b></section>
 <div className="ms-progress">{stages.map((s,i)=><div key={s} className={step===i?'active':step>i?'done':''}><span>{i+1}</span>{s}</div>)}</div>
 <div className="ms-grid" inert={dialog?true:undefined}><section className="ms-panel">
 {step===0&&<><h2>01. Identify the creator.</h2>{wallet?<div className="ms-fields"><p>Connected: {displayName||wallet}. Minting will request wallet signatures.</p><label>Mint network<select value={network} onChange={e=>setNetwork(e.target.value)}><option value="ganache">Local Ganache</option><option value="sepolia">Sepolia testnet</option></select></label>{network==='ganache'&&<><label>Local RPC URL<input value={rpcUrl} onChange={e=>setRpcUrl(e.target.value)}/></label><label>Chain ID (decimal)<input value={ganacheChainId} onChange={e=>setChainId(e.target.value)}/></label></>}<label>{network==='sepolia'?'Sepolia':'Ganache'} factory address<input value={factoryAddress} onChange={e=>setFactoryAddress(e.target.value)}/></label><p>{network==='sepolia'?'Switch your wallet to Sepolia (11155111) and enter a deployed YellowBrickFactory address. Each confirmed mint spends Sepolia test ETH for gas.':'Run the local factory deployment command and paste its address. Wallet and RPC must use the same Ganache instance.'}</p></div>:<p>No wallet connected — the original simulation will run. Connect a wallet for real minting.</p>}<div className="ms-ip-choice"><label htmlFor="road-ip-category">Select a type of intellectual property</label><select id="road-ip-category" value={ipCategoryId} onChange={e=>chooseCategory(e.target.value)}>{groupedIpCategories().map(([group,entries])=><optgroup key={group} label={group}>{entries.map(entry=><option key={entry.id} value={entry.id}>{entry.label}</option>)}</optgroup>)}</select><small>{category.examples} · {IP_CATEGORIES.length} available categories</small><small>Switching IP categories clears attached demo files to prevent accidental reuse under the wrong rights category.</small>{category.notice&&<p className="ms-ip-warning">{category.notice}</p>}</div>{!wallet&&<button className="ms-primary" onClick={onConnect}>Connect wallet</button>}<div className="ms-highlight"><strong>Creator alias</strong><code>{aliasFor(meta.artist||'artist')}</code><p>Separate from ENS and Ethereum addresses.</p></div></>}
 {step===1&&<><h2>02. Attach files.</h2><p>Any file format is accepted. Click Continue to encrypt every attached file together and simulate upload.</p><div className="ms-files">{visibleSlots.map(slot=><label key={slot.id}><div><strong>{slotLabel(slot.id)}{slot.required?' *':''}</strong><small>{assets[slot.id]?.name||'Any file extension'}</small><small>{assets[slot.id]?.error|| (assets[slot.id]?.status==='hashing'?'Hashing…':assets[slot.id]?.demoUpload?'🔒 Encrypted / DEMO receipt '+assets[slot.id].demoUpload.receiptId:assets[slot.id]?.hash?'✓ Ready':'Choose file')}</small></div><span>Browse</span><input type="file" aria-label={'Choose '+slotLabel(slot.id)} onChange={e=>{if(e.target.files[0])void attach(slot.id,e.target.files[0]);e.target.value=''}}/></label>)}</div><section className="ms-encrypt"><h3>🔒 Automatic browser encryption</h3><p>Real AES-256-GCM encryption, fake upload. Files and session key remain in memory. They will be lost when you refresh. No real backup or entitlement check.</p>{status&&<p role="status">{status}</p>}</section></>}
 {step===2&&<><h2>03. IP and licensing.</h2><p>{isMusic?'Recording and songwriting become separate Bricks by default. Writers are credited separately from the recording artist.':'Register a work and supporting evidence. Creator claims are not independently verified by this demo.'}</p><p className="ms-ip-hint">IP category: <strong>{category.label}</strong></p><div className="ms-fields">{fields.filter(([id])=>isMusic||(id==='songwriters'&&category.writers)||!['songwriters','daw','release','genre','bpm','key','isrc','iswc'].includes(id)).map(([id,label])=><label key={id}><span>{id==='title'&&!isMusic?'Work title':id==='artist'&&!isMusic?'Creator / claimant':label}</span>{id==='description'?<textarea value={meta[id]} onChange={e=>setMeta(p=>({...p,[id]:e.target.value}))}/>:<input value={meta[id]} onChange={e=>setMeta(p=>({...p,[id]:e.target.value}))}/>}</label>)}</div>{category.spatial&&<section className="ms-spatial-fields"><h3>Spatial capture &amp; provenance</h3><p>Dates and credits below are creator-declared; attaching spatial video or motion capture does not establish first performance or exclusive rights. SHA-256 of the original file is recorded.</p><div className="ms-fields">{SPATIAL_FIELDS.map(field=><label key={field.id}><span>{field.label}</span><input placeholder={field.placeholder} value={spatial[field.id]||''} onChange={e=>setSpatial(p=>({...p,[field.id]:e.target.value}))}/></label>)}</div><small>Optional C2PA and PROV-O references link to external evidence, not automatically verified attestations.</small></section>}{isMusic&&<label className="ms-check"><input type="checkbox" checked={composition} onChange={e=>setComposition(e.target.checked)}/> Independent Songwriting / Composition Brick (default)</label>}<label className="ms-select">AI training policy<select value={training} onChange={e=>setTraining(e.target.value)}>{trainingModes.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label><label className="ms-select">{isMusic?'Master':'Work'} creator payout share ({share/100}%)<input type="range" min="0" max="10000" step="500" value={share} onChange={e=>setShare(Number(e.target.value))}/></label><div className="ms-demo-fees"><h3>AI dataset licensing proposals · {category.label}</h3><label>Denomination <select value={currency} onChange={e=>setCurrency(e.target.value)}><option>USDC</option><option>USD</option></select></label><label>Use fee unit <select value={unit} onChange={e=>setUnit(e.target.value)}><option value="per-1000-outputs">Per 1,000 outputs</option><option value="per-output">Per output</option><option value="per-model-deployment">Per model deployment</option></select></label>{[['masterIngestionCents',isMusic?'Recording ingestion':'Work ingestion',100000,500],['masterUseCents',isMusic?'Recording use':'Work use',25000,25],...(isMusic?[['writingIngestionCents','Songwriting ingestion',100000,500],['writingUseCents','Songwriting use',25000,25]]:[])].map(([id,label,max,step])=><label key={id}>{label}: <strong>{(fees[id]/100).toFixed(2)} {currency}</strong><input type="range" min="0" max={max} step={step} value={fees[id]} onChange={e=>setFees(p=>({...p,[id]:Number(e.target.value)}))}/></label>)}<small>Draft quotes, not licenses or payments.</small></div></>}
 {step===3&&<><h2>04. Review mint.</h2>{execution!=='simulated'&&<p>Chain ID: {chainId}<br/>RPC: {network==='sepolia'?'Connected wallet':rpcUrl}<br/>Signer: {wallet}<br/>Factory: {factoryAddress}</p>}<div className="ms-review">{[['Work',meta.title],['Category',category.label],['Artist',meta.artist],['Writers',isMusic&&composition?(meta.songwriters||'Attribution pending'):category.writers?(meta.songwriters||'Attribution pending'):'Not applicable'],['Bricks',category.label+(isMusic&&composition?', songwriting':'')+(visibleSlots.some(slot=>slot.id==='artwork')&&assets.artwork?.hash?', artwork':'')],['Encrypted assets',Object.values(assets).filter(a=>a.demoUpload).length],['Currency',currency],['Recording ingestion',(fees.masterIngestionCents/100).toFixed(2)],['Writing ingestion',isMusic&&composition?(fees.writingIngestionCents/100).toFixed(2):'Not applicable']].map(([k,v])=><div key={k}><span>{k}</span><strong>{v}</strong></div>)}</div><aside>{execution==='simulated'?'No blockchain transaction or wallet signature occurs.':'Real transactions require wallet approval and gas on the selected network. Files are not uploaded; metadata commitments use local-only URIs. No licenses or payout rules are installed.'}</aside></>}
 {step===4&&packet&&<><h2>05. Mint results.</h2><div className="ms-alert"><strong>{mint?.simulated?'SIMULATED RECEIPTS ONLY':mint?.status==='confirmed'?'VERIFIED ON CHAIN':'INCOMPLETE — REVIEW TRANSACTIONS BEFORE RETRYING'}</strong><p>{mint?.simulated?'No contract addresses or transaction hashes were produced.':'Save the packet. Pending or unverified transactions may still be mined; inspect them before starting again.'}</p></div><div className="ms-review">{mint?.receipts.map(r=><div key={r.id||r.transactionHash}><span>{r.role}</span><strong>{r.id||r.status}{r.transactionHash&&<><br/>Transaction: {r.transactionHash}<br/>Brick: {r.contractAddress||'Not yet verified'}<br/>Block: {r.blockNumber||'Pending'}<br/>Gas: {r.gasUsed||'Pending'}{r.chainId===11155111&&<><br/><a target="_blank" rel="noreferrer" href={`https://sepolia.etherscan.io/tx/${r.transactionHash}`}>View on Sepolia Etherscan ↗</a></>}</>}</strong></div>)}</div><h3>Simulated authorized downloads</h3><p>The demo authorizes locally, retrieves the session key, decrypts in-browser, then downloads the original file.</p>{visibleSlots.filter(x=>vault.current.encrypted.has(x.id)).map(x=><button key={x.id} className="ms-outline" onClick={()=>download(x.id)}>DEMO authorize &amp; download {slotLabel(x.id)}</button>)}<button className="ms-primary" onClick={exportPacket}>Download JSON packet ↓</button><button className="ms-outline" onClick={reset}>Start another work</button></>}
 {error&&<p className="ms-error" role="alert">{error}</p>}
 {step<4&&<div className="ms-actions">{step>0&&<button className="ms-outline" disabled={busy} onClick={()=>{setStep(i=>i-1);setError('')}}>← Back</button>}<button className="ms-primary" disabled={busy} onClick={next}>{busy?'Encrypting…':step===1?'Encrypt & Continue →':step===3?(execution==='simulated'?'Simulate mint →':'Review wallet mint →'):'Continue →'}</button></div>}
 </section><aside className="ms-side"><strong>THE CREATOR'S ROAD</strong><ol><li>Connect a wallet or continue with simulation</li><li>Attach all source files</li><li>Automatic client-side encryption</li><li>Separate Bricks for applicable creative rights</li><li>Draft dataset ingestion and use fees</li><li>Confirm simulated receipts or wallet transactions</li><li>Decrypt after simulated authorization</li></ol><p>DEMO ONLY. Files are not uploaded. Key recovery, authorized remote delivery, remote storage and royalty payouts are future integrations. Connected wallets deploy real Brick contracts on Ganache or Sepolia.</p></aside></div>
 {dialog&&<div className="ms-demo-overlay"><div role="dialog" aria-modal="true" className="ms-demo-dialog"><b>0x🟨 ROAD · DEMO</b>{dialog==='confirm'?<><h2>Mint your Yellow Bricks?</h2><p>{execution==='simulated'?'This is a simulation. No transaction will occur.':`Mint ${packet?.bricks.length} Bricks on chain ${chainId} through factory ${factoryAddress}. Confirm each transaction in your wallet. Metadata is committed, files are not hosted.`}</p><button className="ms-outline" onClick={()=>setDialog('')}>Cancel</button><button className="ms-primary" onClick={()=>void mintDemo()}>{execution==='simulated'?'Confirm simulation':'Request wallet signatures'}</button></>:dialog==='waiting'?<><span className="ms-demo-spinner"/><h2>Preparing your Bricks…</h2><p role="status">{activeExecution.current!=='simulated'?status:['Validating rights declarations','Preparing separate IP Bricks','Preparing contextual Building','Simulating confirmation'][stage]}</p><small>{activeExecution.current==='simulated'?'No blockchain transaction is being sent.':'Do not close this page while transactions are pending.'}</small></>:<><h2>Mint complete</h2><p>{mint?.receipts.length||0} Brick receipt(s) are ready.</p><button className="ms-primary" onClick={()=>setDialog('')}>View receipts →</button></>}</div></div>}
 </div>;
}