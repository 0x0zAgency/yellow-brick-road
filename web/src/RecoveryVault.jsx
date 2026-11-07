import {useEffect,useRef,useState} from 'react';
import {RECOVERY_VAULT_EVENT,MAX_COLLECTION_BYTES,MAX_VAULT_FILES,listRecoveryFiles,parseRecoveryImport,saveRecoveryRecords,removeRecoveryFile,exportRecoveryCollection,downloadRecoveryJson,recoveryWallet} from './recovery-vault.js';
import './recovery-vault.css';
export default function RecoveryVault({wallet,onConnect}){
 const [rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState(''),[query,setQuery]=useState('');
 const generation=useRef(0),mutex=useRef(false),input=useRef(null);
 const valid=(()=>{try{return recoveryWallet(wallet);}catch{return null;}})();
 useEffect(()=>{const id=++generation.current;setRows([]);setError('');setStatus('');setQuery('');setBusy(false);
  const refresh=()=>{if(valid)listRecoveryFiles(valid).then(data=>{if(id===generation.current)setRows(data);}).catch(e=>{if(id===generation.current)setError(e.message);});};
  refresh();window.addEventListener(RECOVERY_VAULT_EVENT,refresh);return()=>{generation.current++;window.removeEventListener(RECOVERY_VAULT_EVENT,refresh);};
 },[valid]);
 const run=async task=>{if(mutex.current)return;mutex.current=true;setBusy(true);setError('');setStatus('');const id=generation.current;
  try{const message=await task(()=>{if(id!==generation.current)throw Error('Wallet changed.');});if(id===generation.current){const current=await listRecoveryFiles(valid);if(id===generation.current){setRows(current);setStatus(message);}}}
  catch(e){if(id===generation.current)setError(e.message);}finally{mutex.current=false;if(id===generation.current)setBusy(false);}
 };
 const importFiles=files=>run(async active=>{
  if(files.length>MAX_VAULT_FILES||files.reduce((n,f)=>n+f.size,0)>MAX_COLLECTION_BYTES)throw Error('Import up to 512 recovery files and 32 MiB at a time.');
  const records=[];for(const file of files){records.push(...parseRecoveryImport(await file.text(),valid,file.name));active();}
  const saved=await saveRecoveryRecords(valid,records);active();return saved.length+' recovery file(s) saved on this browser.';
 });
 const visible=rows.filter(r=>(r.name+' '+r.title+' '+r.bindings.map(b=>b.title+' '+b.brickAddress).join(' ')).toLowerCase().includes(query.toLowerCase()));
 return <section className="rv" aria-label="Local recovery files" aria-busy={busy}>
  <div className="rv-heading"><span className="br-kicker">THIS BROWSER / THIS WALLET</span><h2>Recovery files</h2><p>Your private recovery files, collected locally. Edit Brick loads a matching file automatically.</p></div>
  {!valid?<div className="rv-empty"><p>Connect the wallet whose recovery files you want to collect.</p><button type="button" className="gold-btn" onClick={onConnect}>Connect wallet</button></div>:<>
   <p className="rv-wallet">Wallet <code>{valid}</code> · {rows.length} saved file{rows.length===1?'':'s'}</p>
   <div className="rv-actions"><button className="gold-btn" type="button" disabled={busy} onClick={()=>input.current?.click()}>Import recovery files</button><button className="outline-btn" type="button" disabled={busy||!rows.length} onClick={()=>void run(async active=>{const current=await listRecoveryFiles(valid);active();downloadRecoveryJson(exportRecoveryCollection(valid,current),'ybr-recovery-'+valid.slice(2,10)+'.json');return 'Your wallet’s recovery collection is ready to download.';})}>Download all</button></div>
   <input ref={input} type="file" accept="application/json,.json" multiple hidden aria-label="Import private recovery files" onChange={e=>{const files=[...e.target.files];e.target.value='';if(files.length)void importFiles(files);}}/>
   <label className="rv-search">Find a recovery file<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Work, filename, or Brick address"/></label>
   {!rows.length&&<p className="rv-empty">No saved recovery files for this wallet yet. Import existing files together, or mint a work with IPFS storage to save its recovery file automatically.</p>}
   {!!rows.length&&!visible.length&&<p>No matching recovery files.</p>}
   <div className="rv-list">{visible.map(row=><article key={row.id} className="rv-file"><div><h3>{row.title||row.name}</h3><p>{row.name}</p><small>{row.kit.metadata.length} metadata references · {row.kit.assets.length} file references</small>{row.bindings.length>0?<details><summary>{row.bindings.length} linked Brick{row.bindings.length===1?'':'s'}</summary>{row.bindings.map(b=><p key={[b.chainId,b.genesisHash,b.factoryAddress,b.brickAddress].join(':')}>{b.title||'Registered Brick'}<br/><code>{b.brickAddress}</code> · Network {b.chainId}</p>)}</details>:<small>Matched and linked when you open a Brick for editing.</small>}</div><div className="rv-actions"><button type="button" className="outline-btn" disabled={busy} onClick={()=>downloadRecoveryJson(JSON.stringify(row.kit,null,2),row.name)}>Download file</button><button type="button" className="quiet" disabled={busy} onClick={()=>{if(window.confirm('Remove this recovery file from this browser? Downloaded copies and the Brick are unchanged.'))void run(async()=>{await removeRecoveryFile(valid,row.id);return 'Recovery file removed from this browser.';});}}>Remove</button></div></article>)}</div>
  </>}
  <p className="rv-note">Stored only in this browser profile at this site address. Clearing site data removes these copies. Downloads contain private recovery keys; no recovery files are backed up to YBR, IPFS, or a server.</p>
  {status&&<p role="status" className="rv-notice">{status}</p>}{error&&<p role="alert" className="wb-error">{error}</p>}
 </section>;
}
