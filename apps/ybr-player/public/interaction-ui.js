'use strict';
/** Local aggregate reader. Never requests a wallet signature or edits an NFT. */
(()=>{
 const make=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
 const panel=make('section');panel.className='interaction-panel';panel.setAttribute('aria-label','File interactions');
 const title=make('h4','File interactions'),note=make('p','Local, client-reported observations. Not unique listeners, verified completions or royalty accounting.');
 const role=make('select');role.setAttribute('aria-label','Interaction file');
 for(const [value,label] of [['audio','Audio Preview / stream'],['artwork','Cover artwork'],['lyrics','Lyrics']]){const option=make('option',label);option.value=value;role.append(option);}
 const stats=make('p','Select a track to inspect its interaction data.');stats.id='interactionStats';stats.setAttribute('role','status');
 const capture=make('p');capture.id='interactionCaptureStatus';capture.setAttribute('role','status');
 const refresh=make('button','Request interaction snapshot');refresh.type='button';refresh.className='text-button';
 const download=make('button','Export metadata snapshot');download.type='button';download.className='text-button';download.disabled=true;
 panel.append(title,note,role,stats,capture,refresh,download);document.getElementById('inspector').append(panel);
 let selected=null,snapshot=null,revision=0,busy=false;
 function clear(){capture.textContent='';revision++;snapshot=null;download.disabled=true;busy=false;refresh.disabled=!selected||selected.source==='playable-cover';role.disabled=selected?.source==='playable-cover';stats.textContent=selected?.source==='playable-cover'?'Interactions stay with each source track. Select a source track to inspect its data.':selected?'Request a snapshot for this file.':'Select a track to inspect its interaction data.';}
 window.addEventListener('ybr:selection',event=>{const next=event.detail.brick;if(JSON.stringify([next?.id,next?.media?.sha256,next?.artwork?.sha256,next?.lyrics?.sha256])!==JSON.stringify([selected?.id,selected?.media?.sha256,selected?.artwork?.sha256,selected?.lyrics?.sha256])){selected=next;clear();}});
 role.addEventListener('change',clear);
 window.addEventListener('ybr:interaction-error',()=>{capture.textContent='Interaction capture is unavailable or limited. Playback continues.';});
 window.addEventListener('ybr:interaction-recorded',()=>{capture.textContent='Interaction capture active · stored locally';});
 refresh.addEventListener('click',async()=>{
  if(!selected||selected.source==='playable-cover'||busy)return;busy=true;refresh.disabled=true;download.disabled=true;snapshot=null;const id=++revision;
  try{
   const response=await fetch('/api/bricks/'+encodeURIComponent(selected.id)+'/interactions?role='+role.value,{credentials:'same-origin',cache:'no-store'});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Interaction data unavailable.');
   if(id!==revision)return;
   snapshot=data;const c=data.counters;
   stats.textContent=role.value==='audio'?`${c.reportedStarts} reported starts · ${c.endedReports} end reports · ${c.pauseEvents} pauses · ${c.seekEvents} seeks · ${c.skipEvents} skips`:`${c.displayReports} display reports for this file`;
   download.disabled=false;
  }catch(error){if(id===revision)stats.textContent=error.message;}
  finally{if(id===revision){busy=false;refresh.disabled=false;}}
 });
 download.addEventListener('click',()=>{
  if(!snapshot)return;const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}));
  const a=make('a');a.href=url;a.download='ybr-interaction-snapshot.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
 refresh.disabled=true;
})();
