import {useEffect,useRef,useState} from 'react';
import {Download,FileAudio,Music2,ShieldCheck,Tag,Upload,X} from 'lucide-react';
import {TAG_FIELDS,MAX_MP3_BYTES,checkedEdits} from './mp3-tool-model.js';
import {runTagTask} from './mp3-tool-task.js';
import './tools.css';
const size=n=>(n/1024/1024).toFixed(2)+' MiB';
function Cover({picture}){
 const [url,setUrl]=useState('');
 useEffect(()=>{if(!picture){setUrl('');return;}const value=URL.createObjectURL(new Blob([picture.data],{type:picture.format}));setUrl(value);return()=>URL.revokeObjectURL(value);},[picture]);
 return url?<img src={url} alt="Embedded MP3 artwork"/>:<Music2 size={38} aria-hidden="true"/>;
}
export default function Mp3TagTool(){
 const [file,setFile]=useState(null),[read,setRead]=useState(null),[values,setValues]=useState({}),[busy,setBusy]=useState(''),[error,setError]=useState(''),[result,setResult]=useState(null),[downloadUrl,setDownloadUrl]=useState(''),[consent,setConsent]=useState(false),[legacy,setLegacy]=useState(false),[query,setQuery]=useState('');
 const task=useRef(null),generation=useRef(0),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;task.current?.cancel();};},[]);
 useEffect(()=>{if(!result){setDownloadUrl('');return;}const url=URL.createObjectURL(new Blob([result.buffer],{type:'audio/mpeg'}));setDownloadUrl(url);return()=>URL.revokeObjectURL(url);},[result]);
 const edits=Object.fromEntries(TAG_FIELDS.filter(f=>read&&values[f.key]!==read.fields[f.key]).map(f=>[f.key,values[f.key]||'']));
 const changed=Object.keys(edits).length;
 const clear=()=>{generation.current++;task.current?.cancel();task.current=null;setFile(null);setRead(null);setValues({});setBusy('');setResult(null);setError('');setConsent(false);setLegacy(false);setQuery('');};
 async function select(next){
  clear();if(!next)return;
  if(next.size>MAX_MP3_BYTES||next.size<4){setError('Choose an MP3 no larger than 64 MiB.');return;}
  const id=++generation.current;setFile(next);setBusy('Reading local MP3 tags…');task.current=runTagTask({mode:'read',file:next});
  try{const info=await task.current.promise;if(alive.current&&id===generation.current){setRead(info);setValues(info.fields);}}
  catch(e){if(alive.current&&id===generation.current&&e.name!=='AbortError')setError(e.message);}
  finally{if(alive.current&&id===generation.current){task.current=null;setBusy('');}}
 }
 function edit(key,value){setResult(null);setConsent(false);setError('');setValues(old=>({...old,[key]:value}));}
 async function prepare(){
  if(!file||!read||!changed||!consent||read.readOnly)return;
  let approved;try{approved=checkedEdits(edits);}catch(e){setError(e.message);return;}
  const id=++generation.current;task.current?.cancel();setBusy('Preparing and verifying your tagged copy…');setError('');setResult(null);
  task.current=runTagTask({mode:'update',file,edits:approved,migrateLegacy:legacy});
  try{const updated=await task.current.promise;if(alive.current&&id===generation.current)setResult(updated);}
  catch(e){if(alive.current&&id===generation.current&&e.name!=='AbortError')setError(e.message);}
  finally{if(alive.current&&id===generation.current){task.current=null;setBusy('');}}
 }
 const filtered=(read?.tags||[]).filter(t=>(t.id+' '+t.value).toLowerCase().includes(query.toLowerCase()));
 return <section className="mp3-tool settings-hub" aria-label="MP3 tag reader and editor">
  <div className="settings-intro mp3-intro"><div><span className="settings-eyebrow">TOOLS / AUDIO METADATA</span><h2>The details behind the sound.</h2><p>Read embedded tags. Update your credits. Keep the original.</p><small>Local files only. No upload, IPFS pin, wallet action or change to an existing Brick. Tags are descriptive claims, not verified rights.</small></div><Tag size={44} aria-hidden="true"/></div>
  <div className="mp3-filebar"><label className="mp3-file-input"><Upload size={20}/><span><b>{file?'Choose another MP3':'Choose an MP3'}</b><small>Up to 64 MiB · processed in this browser</small></span><input type="file" accept=".mp3,audio/mpeg" aria-label="Choose MP3 file" onChange={e=>{const selected=e.target.files[0];e.target.value='';void select(selected);}}/></label>{file&&<button type="button" onClick={clear}><X size={16}/>{busy?'Cancel & clear':'Clear file'}</button>}</div>
  {busy&&<p className="mp3-progress" role="status">{busy}</p>}{error&&<p className="settings-error" role="alert">{error}</p>}
  {!file&&<div className="settings-card mp3-empty"><FileAudio size={48} aria-hidden="true"/><h3>Bring the credits with you.</h3><p>Inspect album, artist, songwriter and composer tags before minting. Export an updated MP3 when something needs fixing.</p><small>Your file and draft edits are kept only in memory. Clearing this tool, navigating away or reloading discards them.</small></div>}
  {read&&<>
   <div className="mp3-summary"><div className="mp3-cover"><Cover picture={read.picture}/></div><div><span className="settings-eyebrow">{read.formats.join(' + ')||'NO EMBEDDED TAGS'}</span><h3>{read.fields.title||read.name}</h3><p>{read.fields.artist||'No artist tag'} · {read.fields.album||'No album tag'}</p><small>{read.name} · {size(read.size)} · {read.codec} · {read.sampleRate||'—'} Hz · {read.pictureCount} embedded image(s)</small></div><span className="mp3-local"><ShieldCheck size={16}/>On this device</span></div>
   {read.readOnly&&<p className="settings-error" role="status">Read-only: {read.readOnly} You can still inspect its tags. The original is unchanged.</p>}
   <div className="mp3-layout"><div className="settings-card"><h3>Credits & release tags</h3><p>Change only the fields you need. A blank edited field removes that tag. Embedded artwork and unedited ID3v2 frames are retained.</p><fieldset disabled={!!busy||!!read.readOnly} className="mp3-fields">{TAG_FIELDS.map(f=><label key={f.key}><span>{f.label}<small>{f.key==='songwriters'?'TXXX:SONGWRITER':f.key==='year'&&read.version===4?'TDRC':f.frame}</small></span><input aria-label={'MP3 '+f.label} value={values[f.key]||''} maxLength={2048} spellCheck={false} onChange={e=>edit(f.key,e.target.value)}/></label>)}</fieldset><small>Songwriters, composers and lyricists remain separate credits. Updating Year replaces any full recording-date tag with that year. Editing a file changes its whole-file hash; it does not revise previously minted commitments.</small></div>
    <aside className="settings-card mp3-review" aria-label="Review tag changes"><span className="settings-eyebrow">REVIEW BEFORE EXPORT</span><h3>{changed?changed+' tag'+(changed===1?'':'s')+' changed':'Your original stays intact.'}</h3><p>No audio re-encoding. The exported copy is checked before download.</p>{changed>0&&<dl>{TAG_FIELDS.filter(f=>Object.hasOwn(edits,f.key)).map(f=><div key={f.key}><dt>{f.label}</dt><dd><del>{read.fields[f.key]||'(empty)'}</del><strong>{edits[f.key]||'(remove tag)'}</strong></dd></div>)}</dl>}
    {read.legacy&&<label className="mp3-consent"><input type="checkbox" checked={legacy} disabled={!!busy} onChange={e=>{setLegacy(e.target.checked);setResult(null);setConsent(false);}}/><span>Convert legacy ID3v1 fields into ID3v2 and remove the old trailer from the new copy to avoid conflicting tags.</span></label>}
    <label className="mp3-consent"><input type="checkbox" aria-label="Approve tag changes" checked={consent} disabled={!changed||!!busy||!!read.readOnly} onChange={e=>setConsent(e.target.checked)}/><span>I reviewed these changes. Prepare a separate tagged MP3; do not change my original.</span></label>
    <button className="settings-primary" type="button" disabled={!changed||!consent||!!busy||!!read.readOnly||(read.legacy&&!legacy)} onClick={prepare}>Prepare tagged copy</button>
    {result&&downloadUrl&&<div className="mp3-verified" role="status"><strong>Verified. Audio bytes unchanged.</strong><p>{result.keptFrames} unedited ID3v2 frames retained.</p><a className="settings-primary" href={downloadUrl} download={result.name}><Download size={16}/>Download tagged MP3</a><small>{result.name}</small><details><summary>Audio payload SHA-256</summary><code>{result.audioHash}</code></details></div>}
    <button type="button" disabled={!changed||!!busy} onClick={()=>{setValues(read.fields);setResult(null);setConsent(false);setError('');}}>Reset edits</button></aside></div>
   <details className="settings-card mp3-inspector"><summary>Inspect embedded tags ({read.tagCount})</summary><p>Local inspection only. Binary contents are summarized rather than displayed. Showing at most 200 tags.</p><label>Filter tags<input aria-label="Filter MP3 tags" value={query} onChange={e=>setQuery(e.target.value)} placeholder="TALB, songwriter, album…"/></label><div className="mp3-tag-table">{filtered.map((t,i)=><div key={i}><code>{t.id}<small>{t.format}</small></code><span>{t.value||'(empty)'}</span></div>)}</div></details>
  </>}
 </section>;
}
