import {useEffect,useRef,useState} from 'react';
import {Download,FileAudio,Music2,RefreshCw,ShieldCheck,Upload,X} from 'lucide-react';
import {MAX_MP3_BYTES,TAG_FIELDS,updatedFilename,validateChanges} from './mp3-tag-editor.js';
import {startTagTask} from './mp3-tags-task.js';
import {prepareNftCover} from './raster-display.js';
import './tools.css';
const prettySize=n=>(n/1024/1024).toFixed(2)+' MiB';
const blobUrl=(bytes,mime)=>URL.createObjectURL(new Blob([bytes],{type:mime}));
export default function Mp3TagEditor(){
 const [file,setFile]=useState(null),[read,setRead]=useState(null),[fields,setFields]=useState({}),[busy,setBusy]=useState(''),[error,setError]=useState(''),[output,setOutput]=useState(null),[approved,setApproved]=useState(false);
 const [coverMode,setCoverMode]=useState('keep'),[coverBytes,setCoverBytes]=useState(null),[coverUrl,setCoverUrl]=useState('');
 const task=useRef(null),generation=useRef(0),coverJob=useRef(null),input=useRef(null),outputUrl=useRef(''),imageUrl=useRef('');
 const changes=Object.fromEntries(TAG_FIELDS.filter(([key])=>read&&fields[key]!==read.fields[key]).map(([key])=>[key,fields[key]]));
 const dirty=Object.keys(changes).length>0||coverMode!=='keep';
 function clearOutput(){if(outputUrl.current)URL.revokeObjectURL(outputUrl.current);outputUrl.current='';setOutput(null);setApproved(false);}
 function showCover(bytes,mime='image/png'){if(imageUrl.current)URL.revokeObjectURL(imageUrl.current);imageUrl.current=bytes?blobUrl(bytes,mime):'';setCoverUrl(imageUrl.current);}
 useEffect(()=>()=>{task.current?.cancel();coverJob.current?.abort();generation.current++;if(imageUrl.current)URL.revokeObjectURL(imageUrl.current);if(outputUrl.current)URL.revokeObjectURL(outputUrl.current);},[]);
 useEffect(()=>{const warn=e=>{if(dirty&&!output){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty,output]);
 async function choose(selected){
  if(!selected)return;
  if(dirty&&!window.confirm('Discard these unsaved tag edits and open another MP3?'))return;
  task.current?.cancel();coverJob.current?.abort();const rev=++generation.current;
  clearOutput();showCover(null);setRead(null);setFields({});setFile(null);setCoverMode('keep');setCoverBytes(null);setError('');
  if(!/\.mp3$/i.test(selected.name)||selected.size>MAX_MP3_BYTES||selected.size<4){setBusy('');setError('Choose an MP3 file no larger than 128 MiB.');return;}
  setFile(selected);setBusy('Reading tags locally…');
  const job=startTagTask({action:'read',file:selected});task.current=job;const result=await job.promise;
  if(generation.current!==rev||!result)return;
  setBusy('');task.current=null;
  if(!result.ok){setError(result.error);return;}
  setRead(result.result);setFields(result.result.fields);showCover(result.result.picture?.bytes,result.result.picture?.mime);
 }
 function edit(key,value){clearOutput();setFields(old=>({...old,[key]:value}));}
 function reset(){clearOutput();setFields({...read.fields});setCoverMode('keep');setCoverBytes(null);coverJob.current?.abort();showCover(read.picture?.bytes,read.picture?.mime);setError('');}
 function close(){if(dirty&&!window.confirm('Discard these tag edits and clear the selected file?'))return;task.current?.cancel();coverJob.current?.abort();generation.current++;clearOutput();showCover(null);setRead(null);setFields({});setFile(null);setError('');setBusy('');setCoverMode('keep');setCoverBytes(null);}
 async function artwork(selected){
  if(!selected)return;coverJob.current?.abort();const controller=new AbortController();coverJob.current=controller;clearOutput();setError('');setBusy('Preparing a local cover copy…');
  try{if(selected.size>8*1024*1024)throw Error('Choose cover artwork no larger than 8 MiB.');const bytes=await prepareNftCover(new Uint8Array(await selected.arrayBuffer()),{signal:controller.signal});if(controller.signal.aborted)return;setCoverBytes(bytes);setCoverMode('replace');showCover(bytes);}
  catch(e){if(!controller.signal.aborted)setError(e.message);}
  finally{if(!controller.signal.aborted){setBusy('');coverJob.current=null;}}
 }
 async function prepare(){
  if(!file||!read||read.readOnly||!approved||!dirty||busy)return;
  setError('');try{validateChanges(changes);}catch(e){setError(e.message);return;}
  const rev=++generation.current;setBusy('Writing and verifying your copy…');
  const job=startTagTask({action:'write',file,changes,options:{coverMode,coverBytes}});task.current=job;
  const result=await job.promise;if(rev!==generation.current||!result)return;setBusy('');task.current=null;
  if(!result.ok){setError(result.error);return;}
  if(outputUrl.current)URL.revokeObjectURL(outputUrl.current);
  outputUrl.current=blobUrl(result.result.bytes,'audio/mpeg');
  setOutput({url:outputUrl.current,name:updatedFilename(file.name),size:result.result.bytes.length,version:result.result.tagVersion});
 }
 return <section className="mp3-tool" aria-label="MP3 tag reader and updater">
  <div className="mp3-intro"><div><span className="settings-eyebrow">TOOLS / MP3 TAGS</span><h2>The details travel with the music.</h2><p>Read the tags. Fix the credits. Download a verified copy—without uploading your audio or changing a Brick.</p></div><FileAudio size={46} aria-hidden="true"/></div>
  <div className="mp3-local"><ShieldCheck size={17} aria-hidden="true"/><span>Browser-local · MP3 only · up to 128 MiB · original file untouched</span></div>
  <div className="mp3-picker"><label className="mp3-file"><Upload size={17} aria-hidden="true"/>{file?'Choose another MP3':'Choose an MP3'}<input ref={input} type="file" accept=".mp3,audio/mpeg" aria-label="MP3 file" onChange={e=>{const f=e.target.files?.[0];e.target.value='';void choose(f);}}/></label>{file&&<><span className="mp3-filename">{file.name}<small>{prettySize(file.size)}{read?' · '+read.tagVersion:''}</small></span><button type="button" className="quiet" onClick={close}><X size={15}/>Clear file</button></>}</div>
  {busy&&<p role="status" className="mp3-notice">{busy} <button type="button" onClick={()=>{task.current?.cancel();coverJob.current?.abort();generation.current++;setBusy('');}}>Cancel</button></p>}
  {error&&<p role="alert" className="mp3-error">{error}</p>}
  {!file&&!busy&&<div className="mp3-empty"><Music2 size={38} aria-hidden="true"/><h3>Check an album before you mint.</h3><p>Inspect album, songwriter, composer, lyricist, artwork and other embedded tags. Files and tag values are kept in memory, not saved to browser storage.</p></div>}
  {read&&<><div className="mp3-summary"><span>{read.format.codec}</span><span>{read.format.sampleRate?.toLocaleString()} Hz</span><span>{read.format.channels} channel(s)</span><span>{read.frames.length} ID3v2 frame types</span></div>
   {read.notice&&<p className="mp3-notice" role="status">{read.notice}</p>}
   {read.legacy&&<p className="mp3-notice">This file also has ID3v1 tags. On export, their descriptive fields are copied into ID3v2 where missing, then the limited ID3v1 trailer is removed.</p>}
   <div className="mp3-layout"><div className="mp3-card"><h3>Credits & release details</h3><p>Composer, lyricist and songwriter are separate credits. Metadata is descriptive—not proof of ownership or a rights grant.</p><fieldset disabled={!!busy||read.readOnly}><div className="mp3-fields">{TAG_FIELDS.map(([key,label,id])=><label key={key} className={['lyrics','comment'].includes(key)?'mp3-wide':''}><span>{label}<small>{key==='year'&&read.tagVersion==='ID3v2.4'?'TDRC':id}</small></span>{['lyrics','comment'].includes(key)?<textarea aria-label={label} rows={key==='lyrics'?7:3} maxLength={key==='lyrics'?64000:8000} value={fields[key]||''} onChange={e=>edit(key,e.target.value)}/>:<input aria-label={label} maxLength={1024} value={fields[key]||''} onChange={e=>edit(key,e.target.value)} autoComplete="off" spellCheck={!['isrc','bpm','track','disc'].includes(key)}/>}</label>)}</div></fieldset></div>
   <aside><div className="mp3-card"><h3>Embedded artwork</h3><div className="mp3-cover">{coverUrl?<img src={coverUrl} alt="Embedded MP3 artwork preview"/>:<><Music2 size={42}/><span>No supported embedded image</span></>}</div><p>{read.coverCount} embedded picture(s). Other picture types are preserved; artwork actions affect the front cover only.</p><fieldset disabled={!!busy||read.readOnly}><label className="mp3-file">Replace front cover<input type="file" accept="image/png,image/jpeg,image/webp" aria-label="MP3 front cover" onChange={e=>{const f=e.target.files?.[0];e.target.value='';void artwork(f);}}/></label><div className="mp3-actions"><button type="button" onClick={()=>{clearOutput();setCoverMode('remove');setCoverBytes(null);showCover(null);}}>Remove front cover</button><button type="button" onClick={()=>{clearOutput();setCoverMode('keep');setCoverBytes(null);showCover(read.picture?.bytes,read.picture?.mime);}}>Keep original artwork</button></div></fieldset><small>Replacements become local PNG display copies, at most 512 pixels. Nothing is pinned or published.</small></div>
   <div className="mp3-card"><h3>Review & export</h3><p>{Object.keys(changes).length} field(s) changed{coverMode!=='keep'?' · front cover '+coverMode:''}.</p>{dirty&&<ul className="mp3-change-list">{TAG_FIELDS.filter(([key])=>Object.hasOwn(changes,key)).map(([key,label])=><li key={key}>{label}: {changes[key]?'updated':'cleared'}</li>)}</ul>}
   <label className="mp3-approval"><input type="checkbox" aria-label="Approve MP3 copy export" checked={approved} disabled={!!busy||read.readOnly||!dirty} onChange={e=>setApproved(e.target.checked)}/><span>Create a new tagged copy. Its file checksum changes; existing Bricks, NFT images and Player files will not be updated.</span></label>
   <button type="button" className="gold-btn" disabled={!dirty||!approved||!!busy||read.readOnly} onClick={prepare}><ShieldCheck size={16}/>Prepare verified copy</button>
   <button type="button" className="quiet" disabled={!!busy||!dirty} onClick={reset}><RefreshCw size={15}/>Discard edits</button>
   {output&&<div className="mp3-export" role="status"><strong>Audio bytes verified unchanged.</strong><span>{output.version} · {prettySize(output.size)}</span><a className="gold-btn" href={output.url} download={output.name}><Download size={16}/>Download updated MP3</a><small>{output.name}</small></div>}
   <small>Only changed fields are edited. Remaining decoded frames must round-trip successfully, or export is blocked. Flagged/legacy ID3 and APEv2/Lyrics3 files can be read but need a specialist editor to update safely.</small></div></aside></div>
   <details className="mp3-card mp3-frames"><summary>Read original ID3v2 frames ({read.frames.length})</summary><p>Text is shown as text, never evaluated. Binary fields show counts, not their contents. Original values remain here while you edit.</p><dl>{read.frames.map(({id,summary},i)=><div key={id+'-'+i}><dt>{id}</dt><dd>{summary||'(empty)'}</dd></div>)}</dl></details></>}
 </section>;
}
