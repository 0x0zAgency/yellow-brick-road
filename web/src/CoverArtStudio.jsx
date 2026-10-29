import {useEffect,useRef,useState} from 'react';
import {Layers3,Music2,Move,Plus,Play,Square,Image as ImageIcon} from 'lucide-react';
import '../../apps/ybr-player/public/artwork-model.js';
import '../../apps/ybr-player/public/artwork-engine.js';
import './cover-art-studio.css';
const M=globalThis.YBRArtworkModel;
const EMPTY={uploads:[],buildings:[],covers:[]};
async function json(path,options={}){
 const res=await fetch('/api/player-publish/'+path,{credentials:'same-origin',cache:'no-store',redirect:'error',...options});
 const data=await res.json().catch(()=>{throw Error('Start the updated local Player to open Cover Art Studio.');});
 if(!res.ok)throw Error(res.status===404&&path==='cover-studio'?'Restart YBR Player after updating the app, then refresh.':data.error||'The Player could not complete this request.');return data;
}
const playerLink=id=>`${location.protocol}//127.0.0.1:4173/#release=${encodeURIComponent(id)}`;
function newDraft(building,uploads){
 const members=building.members.filter(id=>uploads.some(b=>b.id===id)).slice(0,8);
 return {title:building.title,artworkBrickId:uploads.find(b=>members.includes(b.id)&&b.artwork)?.id||uploads.find(b=>b.artwork)?.id||'',
  regions:members.map((id,i)=>M.region({brickId:id,x:.1+(i%3)*.3,y:.1+Math.floor(i/3)*.3,width:.2,height:.2})),sensitivity:.25};
}
export default function CoverArtStudio({active=true,view='studio',onOpen=()=>{},onMint=()=>{}}){
 const [catalog,setCatalog]=useState(EMPTY),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [buildingId,setBuildingId]=useState(''),[drafts,setDrafts]=useState({}),[newTitle,setNewTitle]=useState(''),[members,setMembers]=useState([]),[creating,setCreating]=useState(false);
 const [selectedPin,setSelectedPin]=useState(0),[sound,setSound]=useState(''),[coverUrl,setCoverUrl]=useState(''),[cursor,setCursor]=useState({x:.5,y:.5}),[engineState,setEngineState]=useState(0),[committed,setCommitted]=useState(null);
 const wasActive=useRef(active),token=useRef(''),stage=useRef(null),drag=useRef(null),engine=useRef(null),previewAbort=useRef(null),urls=useRef(new Set()),loadId=useRef(0);
 const building=catalog.buildings.find(b=>b.id===buildingId),draft=building?(drafts[buildingId]||newDraft(building,catalog.uploads)):null;
 const playing=engine.current?.active===true;
 function stop(){previewAbort.current?.abort();engine.current?.stop();for(const url of urls.current)URL.revokeObjectURL(url);urls.current.clear();}
 function update(patch){stop();setCommitted(null);setDrafts(old=>({...old,[buildingId]:{...draft,...patch}}));}
 async function refresh(){
  const revision=++loadId.current;setLoading(true);setError('');
  try{
   const config=await json('config');if(revision!==loadId.current)return;token.current=config.token;
   const data=await json('cover-studio',{headers:{'X-YBR-Publish-Token':config.token}});if(revision!==loadId.current)return;
   stop();setCatalog(data);setBuildingId(id=>data.buildings.some(b=>b.id===id)?id:data.buildings[0]?.id||'');
  }catch(e){if(revision===loadId.current){stop();setCatalog(EMPTY);setError(e.message);}}finally{if(revision===loadId.current)setLoading(false);}
 }
 async function mutate(path,body,method='POST'){
  return json(path,{method,headers:{'Content-Type':'application/json','X-YBR-Publish-Token':token.current},...(body?{body:JSON.stringify(body)}:{})});
 }
 useEffect(()=>{
  const value=new globalThis.YBRArtworkEngine({makeAudio:()=>new Audio(),changed:()=>setEngineState(n=>n+1),authorize:async id=>{
   const signal=previewAbort.current?.signal;
   const res=await fetch('/api/player-publish/assets/'+id+'/audio',{credentials:'same-origin',cache:'no-store',headers:{'X-YBR-Publish-Token':token.current},signal});
   if(!res.ok)throw Error('An audio preview is no longer available. Refresh your uploads.');
   const blob=await res.blob();if(signal?.aborted)throw new DOMException('Canceled','AbortError');
   const url=URL.createObjectURL(blob);urls.current.add(url);return {authorized:true,mediaUrl:url};
  }});value.notifyError=setError;engine.current=value;
  void refresh();const open=()=>setCreating(true);window.addEventListener('ybr:new-audio-building',open);
  return()=>{loadId.current++;value.changed=()=>{};value.notifyError=()=>{};stop();window.removeEventListener('ybr:new-audio-building',open);};
 },[]);
 useEffect(()=>{if(!active)stop();else if(!wasActive.current)void refresh();wasActive.current=active;},[active]);
 const coverId=draft?.artworkBrickId||'';
 useEffect(()=>{
  setCoverUrl('');if(!coverId||!token.current)return;
  const abort=new AbortController();let url;
  void (async()=>{
   const res=await fetch('/api/player-publish/assets/'+coverId+'/artwork',{credentials:'same-origin',cache:'no-store',headers:{'X-YBR-Publish-Token':token.current},signal:abort.signal});
   if(!res.ok)throw Error('This artwork is unavailable. Choose a shared cover or refresh your uploads.');
   const blob=await res.blob();if(abort.signal.aborted)return;url=URL.createObjectURL(blob);setCoverUrl(url);
  })().catch(e=>{if(e.name!=='AbortError')setError(e.message);});
  return()=>{abort.abort();if(url)URL.revokeObjectURL(url);};
 },[coverId,catalog]);
 useEffect(()=>{if(draft)engine.current?.setLevels(M.gains(draft.regions,cursor,new Map(),draft.sensitivity),.75);},[draft,cursor,engineState]);
 async function create(e){
  e.preventDefault();setBusy(true);setError('');
  try{const result=await mutate('audio-buildings',{title:newTitle,members});await refresh();setBuildingId(result.record.id);setCreating(false);setNewTitle('');setMembers([]);setMessage('Audio Building created. Cover Art Studio is unlocked.');onOpen();}
  catch(e){setError(e.message);}finally{setBusy(false);}
 }
 async function commit(){
  setBusy(true);setError('');stop();
  try{
   const result=await mutate('playable-covers',{title:draft.title,buildingId,consent:'commit-playable-cover',sensitivity:draft.sensitivity,
    layout:{format:'ybr-player-artwork-layout/1',artworkBrickId:draft.artworkBrickId,regions:draft.regions}});
   await refresh();setCommitted(result.record);setMessage('Committed. Your Playable Cover is now a separate item in YBR Player.');
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 async function preview(){
  if(playing){stop();return;}setError('');previewAbort.current=new AbortController();
  try{await engine.current.start(draft.regions.map(r=>catalog.uploads.find(b=>b.id===r.brickId)));}
  catch(e){stop();if(e.name!=='AbortError')setError(e.message);}
 }
 function selectBuilding(id){stop();setSound('');setBuildingId(id);setSelectedPin(0);setCommitted(null);setMessage('');}
 function movePin(index,x,y){update({regions:draft.regions.map((r,i)=>i===index?M.moveRegion(r,x,y):r)});}
 function point(e){const r=stage.current.getBoundingClientRect();return {x:M.clamp((e.clientX-r.left)/r.width),y:M.clamp((e.clientY-r.top)/r.height)};}
 function movePointer(e){
  if(!drag.current)return;const p=point(e);
  if(drag.current.kind==='listen'){setCursor(p);return;}
  const {index,dx,dy}=drag.current;movePin(index,p.x-dx,p.y-dy);
 }
 const pin=draft?.regions[selectedPin],available=catalog.uploads.filter(b=>!draft?.regions.some(r=>r.brickId===b.id));
 return <section className="cover-studio" aria-label="Creator Cover Art Studio" hidden={!active}>
  <div className="cas-heading"><div><span className="eyebrow"><Layers3 size={15}/> AUDIO BUILDINGS</span><h2>{view==='buildings'?'Build with your uploaded audio.':'Turn your cover into an instrument.'}</h2><p>Create an audio Building, arrange its sounds on artwork, then commit a Playable Cover.</p></div><button className="quiet" type="button" onClick={()=>void refresh()} disabled={busy||loading}>Refresh uploads</button></div>
  {error&&<p className="cas-error" role="alert">{error}</p>}{message&&<p className="cas-success" role="status">{message}</p>}
  {loading&&<p role="status">Loading your audio Buildings…</p>}
  {!loading&&!catalog.uploads.length&&<div className="cas-empty"><Music2 size={30}/><h3>Your audio starts here.</h3><p>Add an Audio Preview in Mint Studio and share it with the Player. Your uploaded previews will be available here.</p><button className="gold-btn" onClick={onMint}>Open Mint Studio</button></div>}
  {!!catalog.uploads.length&&<>
   <div className="cas-buildings">{catalog.buildings.map(b=><button type="button" className={'cas-building'+(buildingId===b.id?' selected':'')} key={b.id} disabled={busy||loading} aria-pressed={buildingId===b.id} onClick={()=>{selectBuilding(b.id);if(view==='buildings')onOpen();}}><Layers3 size={21}/><strong>{b.title}</strong><small>{b.members.length} audio {b.members.length===1?'Brick':'Bricks'} · {b.source==='mint-studio'?'Release Building':'Audio Building'}</small><span>Open Cover Art Studio →</span></button>)}<button type="button" className="cas-building cas-new" disabled={busy||loading} onClick={()=>setCreating(v=>!v)} aria-expanded={creating}><Plus size={24}/><strong>New audio Building</strong><small>Group audio you have already uploaded.</small></button></div>
   {(creating||!catalog.buildings.length)&&<form className="cas-create" onSubmit={create}><h3>Create an audio Building</h3><label>Building title<input required maxLength={200} value={newTitle} onChange={e=>setNewTitle(e.target.value)} placeholder="An album, a soundscape, a new experiment…"/></label><fieldset><legend>Add your uploaded audio</legend><div className="cas-upload-list">{catalog.uploads.map(b=><label key={b.id}><input type="checkbox" checked={members.includes(b.id)} onChange={e=>setMembers(v=>e.target.checked?[...v,b.id]:v.filter(id=>id!==b.id))}/><span><strong>{b.title}</strong><small>{b.creator}</small></span></label>)}</div></fieldset><button className="gold-btn" disabled={busy||!members.length||!newTitle.trim()}>{busy?'Creating…':'Create Building & unlock Cover Art Studio'}</button></form>}
  </>}
  {view==='studio'&&!building&&!loading&&<p className="cas-locked">Cover Art Studio unlocks when you create an audio Building. Existing Mint Studio release Buildings also unlock it.</p>}
  {view==='studio'&&draft&&<div className="cas-composer"><div className="cas-heading"><div><span className="eyebrow">COVER ART STUDIO · {building.title}</span><h3>Place your audio pins.</h3><p>Drag a numbered pin to move its sound region. Use arrow keys for fine adjustments.</p></div><span className="pill">{committed?'Committed':'Draft · not in the Player yet'}</span></div>
   <fieldset disabled={busy||loading} className="cas-fields"><label>Playable Cover title<input maxLength={200} value={draft.title} onChange={e=>update({title:e.target.value})}/></label><label>Cover artwork<select value={draft.artworkBrickId} onChange={e=>update({artworkBrickId:e.target.value})}><option value="">Choose shared cover artwork</option>{catalog.uploads.filter(b=>b.artwork).map(b=><option key={b.id} value={b.id}>{b.title}</option>)}</select></label></fieldset>
   {!catalog.uploads.some(b=>b.artwork)&&<p>Share a cover image with one of your releases in Mint Studio to add artwork.</p>}
   <div className="cas-editor"><div><div ref={stage} className={'cas-stage'+(playing?' listening':'')} aria-label={playing?'Preview listening point':'Cover art with movable audio pins'}
    onPointerDown={e=>{if(!playing||e.button!==0)return;drag.current={kind:'listen'};e.currentTarget.setPointerCapture(e.pointerId);setCursor(point(e));}}
    onPointerMove={movePointer} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}>
    {coverUrl?<img src={coverUrl} alt="Playable Cover artwork" draggable="false"/>:<span className="cas-placeholder"><ImageIcon size={38}/>Choose your cover artwork</span>}
    {draft.regions.map((r,i)=><button type="button" key={r.brickId} className={'cas-pin'+(selectedPin===i?' selected':'')} disabled={busy||loading} aria-label={'Move audio pin '+(i+1)+': '+(catalog.uploads.find(b=>b.id===r.brickId)?.title||'Unavailable audio')} aria-pressed={selectedPin===i}
     style={{left:r.x*100+'%',top:r.y*100+'%',width:r.width*100+'%',height:r.height*100+'%'}}
     onPointerDown={e=>{if(playing||e.button!==0)return;e.stopPropagation();e.preventDefault();e.currentTarget.focus();setSelectedPin(i);const p=point(e);drag.current={kind:'pin',index:i,dx:p.x-r.x,dy:p.y-r.y};e.currentTarget.setPointerCapture(e.pointerId);}}
     onClick={()=>setSelectedPin(i)} onKeyDown={e=>{if(playing)return;const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!d)return;e.preventDefault();const step=e.shiftKey ? .05 : .01;movePin(i,r.x+d[0]*step,r.y+d[1]*step);}}><span>{i+1}</span><Move size={15}/></button>)}
    {playing&&<span className="cas-cursor" style={{left:cursor.x*100+'%',top:cursor.y*100+'%'}}/>}
   </div><div className="cas-actions"><button type="button" className="quiet" onClick={()=>void preview()} disabled={busy||loading||!draft.regions.length}>{playing?<Square size={16}/>:<Play size={16}/>} {playing?'Stop preview & edit pins':'Preview cover'}</button><small>{playing?'Drag across the artwork to blend the sounds.':'Pins keep their positions when committed.'}</small></div></div>
   <fieldset className="cas-sounds" disabled={busy||loading||playing}><legend>{draft.regions.length} / 8 audio pins</legend><label>Add from your uploads<select aria-label="Audio to add" value={sound} onChange={e=>setSound(e.target.value)}><option value="">Choose an uploaded sound</option>{available.map(b=><option key={b.id} value={b.id}>{b.title} — {b.creator}</option>)}</select></label><button type="button" className="quiet" disabled={!sound||draft.regions.length>=8} onClick={()=>{update({regions:[...draft.regions,M.region({brickId:sound,x:.4,y:.4,width:.2,height:.2})]});setSelectedPin(draft.regions.length);setSound('');}}>Add audio pin <Plus size={15}/></button>
    <ol className="cas-pin-list">{draft.regions.map((r,i)=><li key={r.brickId}><button type="button" aria-pressed={i===selectedPin} onClick={()=>setSelectedPin(i)}>{i+1}. {catalog.uploads.find(b=>b.id===r.brickId)?.title||'Unavailable sound'}</button><button type="button" aria-label={'Remove pin '+(i+1)} onClick={()=>{update({regions:draft.regions.filter((_,n)=>i!==n)});setSelectedPin(0);}}>×</button></li>)}</ol>
    {pin&&<div className="cas-geometry" aria-label={'Position and size for pin '+(selectedPin+1)}>{['x','y','width','height'].map(key=><label key={key}>{key.toUpperCase()} %<input type="number" aria-label={'Pin '+(selectedPin+1)+' '+key+' percent'} min={key==='x'||key==='y'?0:2} max="100" step="1" value={Math.round(pin[key]*100)} onChange={e=>{const value=Number(e.target.value)/100;update({regions:draft.regions.map((r,i)=>i===selectedPin?(key==='x'||key==='y'?M.moveRegion(r,key==='x'?value:r.x,key==='y'?value:r.y):M.region({...r,[key]:value})):r)});}}/></label>)}</div>}
    <label>Blend reach · {Math.round(draft.sensitivity*100)}%<input type="range" min="2" max="70" value={draft.sensitivity*100} onChange={e=>update({sensitivity:Number(e.target.value)/100})}/></label>
   </fieldset></div>
   <div className="cas-commit"><p>Commit this cover to add it to YBR Player as a separate <strong>Playable Cover</strong>. Each source keeps its own permissions.</p><button className="gold-btn" type="button" onClick={()=>void commit()} disabled={busy||loading||!draft.title.trim()||!draft.artworkBrickId||!coverUrl||!draft.regions.length}>{busy?'Committing…':'Commit Playable Cover'}</button>{committed&&<a href={playerLink(committed.id)} target="_blank" rel="noreferrer">Open Playable Cover in Player ↗</a>}</div>
  </div>}
  {!!catalog.covers.length&&<div className="cas-published"><h3>Committed Playable Covers</h3>{catalog.covers.map(c=><div key={c.id}><div><strong>{c.title}</strong><small>{c.buildingTitle} · {c.layout.regions.length} sounds · Playable Cover</small></div><button type="button" className="quiet" disabled={busy} onClick={()=>{stop();setBuildingId(c.buildingId);setDrafts(old=>({...old,[c.buildingId]:{title:c.title,artworkBrickId:c.layout.artworkBrickId,regions:c.layout.regions.map(M.region),sensitivity:c.sensitivity}}));setSelectedPin(0);setCommitted(null);onOpen();}}>Edit copy</button><a href={playerLink(c.id)} target="_blank" rel="noreferrer">Open in Player ↗</a><button type="button" className="quiet" disabled={busy} onClick={async()=>{setBusy(true);try{await mutate('playable-covers/'+c.id,null,'DELETE');if(committed?.id===c.id)setCommitted(null);await refresh();setMessage('Playable Cover withdrawn. Source audio is still available.');}catch(e){setError(e.message);}finally{setBusy(false);}}}>Withdraw</button></div>)}</div>}
  <p className="cas-footnote">Local creator workspace · Audio Buildings organize references. Sources are the Audio Previews you shared with this Player; private master recordings stay private.</p>
 </section>;
}
