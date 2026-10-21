'use strict';
// Release art and lyrics are display data, never HTML supplied by a publisher.
(() => {
 const audio=document.getElementById('audio');
 const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
 const panel=make('section','release-details');panel.setAttribute('aria-label','Release artwork, lyrics and associated files');
 const heading=make('h3',null,'Inside this release');
 const credits=make('p','release-credits');
 const lyricsHeading=make('h4',null,'Lyrics');
 const lyricsBody=make('div','release-lyrics','Choose a release to see its lyrics.');lyricsBody.id='releaseLyrics';
 const filesHeading=make('h4',null,'Associated release files');
 const filesBody=make('div','release-files');filesBody.id='releaseFiles';
 panel.append(heading,credits,lyricsHeading,lyricsBody,filesHeading,filesBody);
 document.querySelector('.under-note').before(panel);
 const refresh=make('button','text-button','Refresh library');refresh.id='refreshLibrary';refresh.type='button';
 refresh.addEventListener('click',()=>window.dispatchEvent(new Event('ybr:refresh-request')));
 document.querySelector('.top-actions').prepend(refresh);
 const status=make('span','release-library-status');status.id='librarySyncStatus';status.setAttribute('role','status');
 document.querySelector('.heading-row').after(status);
 let selectionKey=null,currentId=null,request=null,track=null,revision=0,linked=false;
 function assetUrl(raw){
  if(typeof raw!=='string')return null;
  try{const url=new URL(raw,location.origin);return url.origin===location.origin&&/^\/api\/studio-releases\/STUDIO-[a-f0-9]{64}\/(artwork|lyrics)$/.test(url.pathname)?url.href:null;}catch{return null;}
 }
 function paintCover(target,brick){
  if(!target)return;
  const src=assetUrl(brick?.artwork?.url);
  const previous=target.querySelector(':scope > .release-cover-image');
  if(previous?.src===src)return;
  previous?.remove();target.classList.remove('release-has-cover');
  if(!src)return;
  const image=make('img','release-cover-image');image.alt=(brick.title||'Release')+' cover artwork';image.src=src;image.loading='lazy';
  image.addEventListener('error',()=>{image.remove();target.classList.remove('release-has-cover');});
  target.append(image);target.classList.add('release-has-cover');
 }
 function stopLyrics(){
  revision++;request?.abort();request=null;
  if(track){track.track.mode='disabled';track.remove();track=null;}
  lyricsBody.replaceChildren();
 }
 function renderFiles(brick){
  filesBody.replaceChildren();
  for(const file of brick?.files||[]){
   const row=make('article','release-file');
   const thumb=make('span','release-file-thumb','🟨');paintCover(thumb,brick);
   const info=make('div','release-file-info');
   info.append(make('strong',null,file.name),make('span',null,file.role+' · '+(file.shared?'Shared '+file.shared+' copy':'Associated record only; file not shared')));
   row.append(thumb,info);filesBody.append(row);
  }
  if(!filesBody.children.length)filesBody.textContent='No additional files attached to this release.';
 }
 async function select(brick){
  paintCover(document.getElementById('miniCover'),brick);paintCover(document.getElementById('inspectorCover'),brick);
  const key=JSON.stringify([brick?.id,brick?.lyrics?.sha256,brick?.artwork?.sha256]);
  if(key===selectionKey)return;
  selectionKey=key;currentId=brick?.id||null;stopLyrics();renderFiles(brick);
  heading.textContent=brick?brick.title+' / release files':'Inside this release';
  credits.textContent=(brick?.credits||[]).length?'Creator-declared credits: '+brick.credits.map(person=>person.name+' ('+person.role+')').join(' · '):'';
  const url=assetUrl(brick?.lyrics?.url),id=revision;
  if(!url){lyricsBody.textContent='No lyrics attached to this release.';return;}
  if(brick.lyrics.kind==='webvtt'){
   lyricsBody.textContent='Timed lyrics will load with playback. Select a line to seek.';
   const element=document.createElement('track');track=element;element.kind='metadata';element.label='Release lyrics';element.src=url;
   element.addEventListener('load',()=>{
    if(id!==revision)return;
    lyricsBody.replaceChildren();
    const lines=[...element.track.cues||[]].map(cue=>{
     const line=make('button','release-cue',typeof cue.getCueAsHTML==='function'?cue.getCueAsHTML().textContent:cue.text);
     line.type='button';line.addEventListener('click',()=>{if(Number.isFinite(audio.duration))audio.currentTime=Math.min(cue.startTime,audio.duration);});
     lyricsBody.append(line);return {cue,line};
    });
    if(!lines.length)lyricsBody.textContent='No timed lyric cues were found.';
    const update=()=>{
     if(id!==revision)return;
     const active=new Set([...element.track.activeCues||[]]);
     for(const {cue,line} of lines){const on=active.has(cue);line.classList.toggle('is-active',on);if(on)line.setAttribute('aria-current','true');else line.removeAttribute('aria-current');}
    };
    element.track.addEventListener('cuechange',update);update();
   });
   element.addEventListener('error',()=>{if(id===revision)lyricsBody.textContent='Timed lyrics could not be loaded. Refresh your session and try again.';});
   audio.append(element);element.track.mode='hidden';return;
  }
  lyricsBody.textContent='Loading lyrics…';request=new AbortController();
  try{
   const res=await fetch(url,{credentials:'same-origin',cache:'no-store',signal:request.signal});
   if(!res.ok)throw Error('Lyrics are unavailable for this session.');
   if(Number(res.headers.get('content-length'))>512*1024)throw Error('Lyrics exceed the preview limit.');
   const value=await res.text();
   if(new TextEncoder().encode(value).length>512*1024)throw Error('Lyrics exceed the preview limit.');
   if(id===revision)lyricsBody.textContent=value;
  }catch(e){if(id===revision&&e.name!=='AbortError')lyricsBody.textContent=e.message;}
 }
 window.addEventListener('ybr:selection',event=>{void select(event.detail.brick);});
 window.addEventListener('ybr:library',event=>{
  const bricks=event.detail.bricks;
  const lookup=new Map(bricks.map(brick=>[brick.id,brick]));
  for(const row of document.querySelectorAll('.track-row'))paintCover(row.querySelector('.track-thumbnail'),lookup.get(row.dataset.brickId));
  status.textContent=bricks.filter(brick=>brick.source==='studio-demo').length+' uploaded demo release(s) · library refreshes automatically';
  if(!linked&&location.hash.startsWith('#release=')){
   const id=location.hash.slice(9);if(lookup.has(id)){linked=true;window.dispatchEvent(new CustomEvent('ybr:select-release',{detail:{id}}));}
  }
 });
 window.addEventListener('ybr:library-error',()=>{status.textContent='Library refresh failed. Existing playback has not been restarted.';});
 window.addEventListener('pagehide',stopLyrics);
})();
