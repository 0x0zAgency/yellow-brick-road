'use strict';
// Saved metadata remains visible across chain-profile switches. This UI never
// turns an unavailable upload into a playable track, nor fetches its media.
(() => {
 const make=(tag,cls,text)=>{const element=document.createElement(tag);if(cls)element.className=cls;if(text!==undefined)element.textContent=text;return element;};
 const panel=make('details','saved-uploads');panel.id='savedUploads';panel.hidden=true;
 const summary=make('summary'),note=make('p','saved-upload-note'),list=make('div','saved-upload-list');
 note.textContent='Uploads are saved on this computer, separately from Ganache. A new mnemonic starts a different chain profile. Earlier uploads are not deleted or automatically granted rights on that chain.';
 panel.append(summary,note,list);document.getElementById('trackList').before(panel);
 let wasBlocked=false;
 window.addEventListener('ybr:library',event=>{
  const uploads=event.detail.uploads||[],playable=new Set(event.detail.bricks.map(brick=>brick.id));
  const blocked=uploads.filter(item=>!playable.has(item.id)).length;
  panel.hidden=uploads.length===0;summary.textContent='Saved uploads · '+uploads.length+' total'+(blocked?' · '+blocked+' unavailable here':'')+' · newest first';
  if(blocked&&!wasBlocked)panel.open=true;
  wasBlocked=blocked>0;list.replaceChildren();
  for(const upload of uploads){
   const row=make('article','saved-upload');row.dataset.uploadId=upload.id;
   const head=make('div','saved-upload-heading');head.append(make('strong',null,upload.title));
   const available=playable.has(upload.id);
   head.append(make('span','saved-upload-badge',available?'PLAYABLE':upload.reason==='different-chain'?'OTHER CHAIN':upload.reason==='different-factory'?'OTHER FACTORY':'UNAVAILABLE'));
   row.append(head,make('p',null,upload.creator));
   const time=make('time');const date=new Date(upload.publishedAt);
   if(Number.isFinite(date.getTime())){time.dateTime=date.toISOString();time.textContent='Uploaded '+date.toLocaleString();row.append(time);}
   row.append(make('p',null,available?'Saved and available on this Player.':upload.available?'The browser cannot play this audio format, or the last playback attempt failed.':upload.message));
   if(upload.chain){
    const scope=make('details','saved-upload-scope');scope.append(make('summary',null,'Original chain reference'));
    scope.append(make('p',null,'Chain ID: '+upload.chain.chainId),make('p',null,'Factory: '+upload.chain.factoryAddress),make('p',null,'Genesis: '+upload.chain.genesisHash));row.append(scope);
   }
   if(available){const button=make('button','text-button','Select release');button.type='button';button.addEventListener('click',()=>window.dispatchEvent(new CustomEvent('ybr:select-release',{detail:{id:upload.id}})));row.append(button);}
   list.append(row);
  }
 });
})();
