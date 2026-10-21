import {useEffect,useRef,useState} from 'react';
import {parseRecoveryFile,recoverIpfsEntry,assetsFromRecoveredMetadata,MAX_RECOVERY_FILE_BYTES} from './ipfs-recovery.js';
import {validCid} from './ipfs-upload.js';
import './ipfs-recovery.css';

const entryId=entry=>entry.kind+':'+entry.cid;
const short=value=>value.length>30?value.slice(0,17)+'…'+value.slice(-10):value;
const metadataCid=brick=>{
 const uri=brick?.metadataURI;
 if(typeof uri!=='string'||!uri.startsWith('ipfs://'))return null;
 const cid=uri.slice(7);
 return validCid(cid)?cid:null;
};
function verificationMessage(verification){
 if(verification.onChain)return 'Metadata matches the on-chain commitment.';
 if(verification.ciphertext&&verification.plaintext)return 'Encrypted file and original checksums match the recovery record.';
 if(verification.ciphertext)return 'Encrypted file checksum matches. This older backup has no original checksum.';
 return 'Decryption authenticated. This older backup has no separately saved checksum.';
}

/** Private creator recovery. No key or decrypted content leaves this component. */
export default function IpfsRecovery({brick=null,onClose}){
 const [kit,setKit]=useState(null),[backupName,setBackupName]=useState('');
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[status,setStatus]=useState('');
 const [completed,setCompleted]=useState({}),[chainAssets,setChainAssets]=useState(null),[workTitle,setWorkTitle]=useState('');
 const operation=useRef(0),controller=useRef(null),downloads=useRef(new Set()),fileInput=useRef(null);
 const cid=metadataCid(brick);
 const cancelWork=()=>{operation.current++;controller.current?.abort();controller.current=null;};
 const releaseDownloads=()=>{for(const url of downloads.current)URL.revokeObjectURL(url);downloads.current.clear();};
 useEffect(()=>()=>{cancelWork();releaseDownloads();},[]);
 const clear=()=>{
  cancelWork();releaseDownloads();setKit(null);setBackupName('');setBusy('');setError('');setStatus('');
  setCompleted({});setChainAssets(null);setWorkTitle('');if(fileInput.current)fileInput.current.value='';
 };
 const importBackup=async file=>{
  clear();if(!file)return;
  const id=operation.current;setBusy('import');
  try{
   if(file.size>MAX_RECOVERY_FILE_BYTES)throw Error('Choose a recovery JSON file no larger than 1 MiB.');
   const parsed=parseRecoveryFile(await file.text());
   if(id!==operation.current)return;
   setKit(parsed);setBackupName(file.name);setStatus('Recovery key loaded in this browser session.');
  }catch(e){if(id===operation.current)setError(e.message||'Unable to read the recovery file.');}
  finally{if(id===operation.current)setBusy('');}
 };
 const saveBytes=(bytes,name)=>{
  // Download as an attachment; never render recovered HTML/SVG on the app origin.
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));downloads.current.add(url);
  const anchor=document.createElement('a');anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>{URL.revokeObjectURL(url);downloads.current.delete(url);},30000);
 };
 const begin=label=>{
  cancelWork();const abort=new AbortController();controller.current=abort;setBusy(label);setError('');setStatus('Retrieving encrypted bytes and checking integrity…');
  return {id:operation.current,signal:abort.signal};
 };
 const recover=async entry=>{
  if(!kit||busy)return;
  const {id,signal}=begin(entryId(entry));
  try{
   const result=await recoverIpfsEntry({entry,key:kit.key,signal});
   if(id!==operation.current)return;
   saveBytes(result.bytes,result.name);
   const message=verificationMessage(result.verification);
   setCompleted(old=>({...old,[entryId(entry)]:message}));setStatus('Download ready. '+message);
  }catch(e){if(id===operation.current){setStatus('');setError(e.name==='AbortError'?'Recovery canceled.':e.message||'Recovery failed.');}}
  finally{if(id===operation.current){setBusy('');controller.current=null;}}
 };
 const openRegisteredMetadata=async()=>{
  if(!kit||busy||!cid)return;
  const {id,signal}=begin('registered-metadata');
  setChainAssets(null);setWorkTitle('');
  try{
   const entry=kit.metadata.find(item=>item.cid===cid)||{kind:'metadata',role:'metadata',name:'brick-metadata.json',mime:'application/json',cid};
   const result=await recoverIpfsEntry({entry,key:kit.key,signal,expectedPlaintextSha256:brick.metadataDigest});
   if(id!==operation.current)return;
   let metadata;try{metadata=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(result.bytes));}catch{throw Error('The registered metadata could not be read as JSON.');}
   const entries=assetsFromRecoveredMetadata(metadata);
   if(id!==operation.current)return;
   setChainAssets(entries);setWorkTitle(typeof metadata.title==='string'?metadata.title.slice(0,200):'');
   setStatus('Metadata matches the on-chain commitment. '+entries.length+' pinned file reference'+(entries.length===1?'':'s')+' found.');
  }catch(e){if(id===operation.current){setStatus('');setError(e.name==='AbortError'?'Recovery canceled.':e.message||'Unable to recover registered metadata.');}}
  finally{if(id===operation.current){setBusy('');controller.current=null;}}
 };
 const rows=(entries,label)=>entries.length>0&&<section className="ir-section"><h3>{label}</h3><div className="ir-files">{entries.map(entry=><article className="ir-file" key={entryId(entry)}>
  <div><strong>{entry.name}</strong><span>{entry.role}</span><code title={entry.cid}>{short(entry.cid)}</code>
   {completed[entryId(entry)]&&<small className="ir-verified">{completed[entryId(entry)]}</small>}</div>
  <button type="button" className="outline-btn" disabled={!!busy} onClick={()=>void recover(entry)}>{busy===entryId(entry)?'Recovering…':'Recover & download'}</button>
 </article>)}</div></section>;
 return <section className="ir" aria-label={brick?'Recover registered Brick files':'Recover IPFS files'}>
  <div className="ir-heading"><div><span className="eyebrow">PRIVATE FILE RECOVERY</span><h2>{brick?'Recover this Brick’s files':'Recover your files from IPFS'}</h2></div>{onClose&&<button type="button" className="quiet" onClick={onClose}>Close recovery</button>}</div>
  <p>Choose the private recovery JSON saved in Mint Studio. Encrypted files are retrieved from your local YBR IPFS node and decrypted here. Your recovery key stays in this browser session.</p>
  {brick&&<p className="ir-context">Selected Brick: <code>{brick.address}</code><br/>Recovered metadata must match this registration’s on-chain commitment before its file references are used.</p>}
  <div className="ir-import"><label htmlFor={brick?'brick-recovery-file':'ipfs-recovery-file'}>Private recovery file</label>
   <input ref={fileInput} id={brick?'brick-recovery-file':'ipfs-recovery-file'} type="file" accept="application/json,.json" onChange={e=>{const file=e.target.files?.[0];if(file)void importBackup(file);}}/>
   <small>The file is read locally. Keep it private: it contains the key needed to open your encrypted work.</small>
  </div>
  {kit&&<>
   <div className="ir-session"><div><strong>{backupName}</strong><span>{kit.assets.length} file reference{kit.assets.length===1?'':'s'} · {kit.metadata.length} metadata reference{kit.metadata.length===1?'':'s'}</span></div><button type="button" className="quiet" onClick={clear}>Clear recovery session</button></div>
   {brick?<>
    {!cid?<p className="ir-warning">This registration has no supported encrypted IPFS metadata reference.</p>:<button type="button" className="gold-btn" disabled={!!busy} onClick={()=>void openRegisteredMetadata()}>{busy==='registered-metadata'?'Checking registered metadata…':'Retrieve & verify registered metadata'}</button>}
    {chainAssets!==null&&<><div className="ir-confirmed"><strong>{workTitle||'Registered metadata recovered'}</strong><span>Matches the on-chain metadata commitment. File checksums below come from that verified metadata.</span></div>{rows(chainAssets,'Files referenced by this Brick')}{!chainAssets.length&&<p>No pinned source files are referenced by this metadata.</p>}</>}
   </>:<>
    {!kit.assets.length&&!kit.metadata.length&&<p className="ir-warning">This is an early key backup with no file addresses. Use it from an IPFS registration in My Bricks, or import the recovery file downloaded after upload.</p>}
    {rows(kit.assets,'Original files')}{rows(kit.metadata,'Brick metadata')}
    {(kit.assets.length>0||kit.metadata.length>0)&&<p className="ir-note">Checks here compare files with this backup. To compare metadata with a blockchain registration, open recovery from that Brick in My Bricks.</p>}
   </>}
  </>}
  {busy&&busy!=='import'&&<button type="button" className="quiet ir-cancel" onClick={()=>{cancelWork();setBusy('');setStatus('Recovery canceled.');}}>Cancel retrieval</button>}
  {status&&<p className="ir-status" role="status">{status}</p>}{error&&<p className="ir-error" role="alert">{error}</p>}
  <p className="ir-note">Your local IPFS node and YBR bridge must be running with the original pins available. Clearing this session releases the imported key and pending downloads. File recovery does not grant a license or transfer rights.</p>
 </section>;
}
