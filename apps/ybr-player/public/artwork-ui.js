'use strict';
// Audiocover interaction adapted for YBR's existing rights-aware streams.
// Original Audiocover concept/player: Llydia Cross, 2020–2021 (Audiocover-Live).
(()=>{
 const M=window.YBRArtworkModel;
 const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
 const button=text=>{const e=make('button','text-button',text);e.type='button';return e;};
 const panel=make('section','artwork-player');panel.id='artworkPlayer';panel.setAttribute('aria-label','Interactive artwork player');
 panel.hidden=true;
 const heading=make('h3',null,'Playable Cover');
 const help=make('p','artwork-help','Drag across the cover to blend its sounds. Hold a sound to keep its level while you explore.');
 const controls=make('div','artwork-controls'),play=button('Play artwork'),stop=button('Stop');
 const motion=make('select');motion.setAttribute('aria-label','Artwork cursor movement');
 for(const [value,text] of [['manual','Manual movement'],['random','Wander'],['box','Box path'],['diagonal','Diagonal path']]){const o=make('option',null,text);o.value=value;motion.append(o);}
 controls.append(play,stop,motion);
 const body=make('div','artwork-body'),stage=make('div','artwork-stage');stage.tabIndex=0;stage.setAttribute('role','group');stage.setAttribute('aria-label','Artwork sound map. Use arrow keys to move the listening point.');
 const placeholder=make('span','artwork-placeholder','Select a release to explore its artwork');
 const cursor=make('span','artwork-cursor');cursor.setAttribute('aria-hidden','true');stage.append(placeholder,cursor);
 const sidebar=make('div','artwork-sidebar');
 const regionsList=make('div','artwork-regions');
 const sensitivity=make('input');sensitivity.type='range';sensitivity.min='2';sensitivity.max='70';sensitivity.value='25';sensitivity.setAttribute('aria-label','Sound region blend reach');
 const status=make('p','artwork-status');status.setAttribute('role','status');
 sidebar.append(regionsList,status);body.append(stage,sidebar);
 const note=make('p','artwork-help','A creator-committed Playable Cover. Each sound keeps its own playback permission. Sounds loop independently.');
 panel.append(heading,help,controls,body,note);document.querySelector('.release-details').before(panel);
 let library=[],selected=null,artworkBrickId=null,regions=[],pins=new Map(),cursorPoint={x:.5,y:.5},markers=[],pinButtons=[],mixBricks=[],frame=0,lastTime=0,step=0,target=null,dragging=false;
 const host=()=>window.YBRAudiocoverHost;
 function fail(error){status.textContent=error.message||String(error);}
 const engine=new window.YBRArtworkEngine({
  authorize:id=>host().authorize(id),makeAudio:()=>new Audio(),report:(entry,event)=>host().report(entry,event),
  changed:()=>{paintState();host()?.changed();}
 });
 engine.notifyError=message=>fail(message);
 function paintState(){
  play.textContent=engine.starting?'Cancel loading':engine.playing?'Pause artwork':engine.active?'Resume artwork':'Play artwork';
  play.disabled=!regions.length;stop.disabled=!engine.active;

  panel.classList.toggle('artwork-playing',engine.playing);
 }
 function update(){
  const levels=M.gains(regions,cursorPoint,pins,Number(sensitivity.value)/100);
  engine.setLevels(levels,Number(document.getElementById('volume').value)/100);
  cursor.style.left=cursorPoint.x*100+'%';cursor.style.top=cursorPoint.y*100+'%';
  markers.forEach((marker,i)=>{marker.style.opacity=String(.22+(levels[i]||0)*.78);marker.classList.toggle('is-pinned',pins.has(i));});
  pinButtons.forEach((p,i)=>{p.textContent=(pins.has(i)?'Release':'Hold')+' · '+Math.round((levels[i]||0)*100)+'%';p.setAttribute('aria-pressed',String(pins.has(i)));});
 }
 function animate(time){
  const dt=lastTime?Math.min(50,time-lastTime):0;lastTime=time;
  if(engine.playing&&motion.value!=='manual'&&!dragging){
   if(!target)target=M.waypoint(motion.value,step++);
   const dx=target.x-cursorPoint.x,dy=target.y-cursorPoint.y,distance=Math.hypot(dx,dy),travel=dt*.00012;
   if(distance<=travel){cursorPoint={...target};target=null;}else{cursorPoint.x+=dx/distance*travel;cursorPoint.y+=dy/distance*travel;}
   update();
  }
  if(engine.active)host()?.changed();
  frame=requestAnimationFrame(animate);
 }
 function rebuild(){
  regionsList.replaceChildren();stage.querySelectorAll('.artwork-region').forEach(e=>e.remove());markers=[];pinButtons=[];
  regions.forEach((r,i)=>{
   const brick=library.find(b=>b.id===r.brickId),marker=make('span','artwork-region');
   Object.assign(marker.style,{left:r.x*100+'%',top:r.y*100+'%',width:r.width*100+'%',height:r.height*100+'%'});marker.textContent=String(i+1);stage.append(marker);markers.push(marker);
   const row=make('article','artwork-region-row'),title=make('strong',null,(i+1)+'. '+(brick?.title||'Unavailable sound'));
   const pin=button('Hold');pinButtons.push(pin);
   pin.addEventListener('click',()=>{if(pins.has(i))pins.delete(i);else pins.set(i,M.gain(r,cursorPoint,Number(sensitivity.value)/100));update();});
   row.append(title,pin);
   regionsList.append(row);
  });
  stage.append(cursor);paintState();update();
 }
 function cover(){
  stage.querySelector('img')?.remove();placeholder.hidden=false;
  const brick=library.find(b=>b.id===artworkBrickId);heading.textContent=selected?'Playable Cover · '+selected.title:'Playable Cover';
  placeholder.textContent=brick?'No shared cover for this release · sound map preview':'Select a release to explore its artwork';
  const raw=brick?.artwork?.url;if(typeof raw!=='string')return;
  const url=new URL(raw,location.origin);
  if(url.origin!==location.origin||!/^\/api\/studio-releases\/STUDIO-[a-f0-9]{64}\/artwork$/.test(url.pathname))return;
  const img=make('img');img.alt=brick.title+' interactive cover artwork';
  img.addEventListener('load',()=>{if(!img.isConnected)return;placeholder.hidden=true;window.dispatchEvent(new CustomEvent('ybr:file-display',{detail:{brickId:brick.id,role:'artwork',sha256:brick.artwork.sha256}}));});
  img.addEventListener('error',()=>{img.remove();placeholder.hidden=false;});img.src=url.href;stage.prepend(img);
 }
 async function toggle(){
  try{
   if(engine.active){await engine.toggle();return;}
   const lookup=new Map(library.map(b=>[b.id,b]));mixBricks=regions.map(r=>lookup.get(r.brickId));
   if(!mixBricks.length||mixBricks.some(b=>!b?.streamAllowed))throw Error('Refresh the library and choose currently playable sounds.');
   host().takeOver();rebuild();status.textContent='Authorizing each sound…';
   await engine.start(mixBricks);rebuild();if(engine.active)status.textContent='Drag the listening point, use arrow keys, or choose an automatic path.';
  }catch(error){rebuild();fail(error);}
 }
 play.addEventListener('click',toggle);stop.addEventListener('click',()=>{engine.stop();rebuild();status.textContent='Artwork playback stopped.';});
 sensitivity.addEventListener('input',update);document.getElementById('volume').addEventListener('input',update);
 motion.addEventListener('change',()=>{target=null;step=0;});
 const move=e=>{const b=stage.getBoundingClientRect();cursorPoint={x:M.clamp((e.clientX-b.left)/b.width),y:M.clamp((e.clientY-b.top)/b.height)};update();};
 stage.addEventListener('pointerdown',e=>{if(e.button!==0)return;dragging=true;motion.value='manual';stage.setPointerCapture(e.pointerId);move(e);});
 stage.addEventListener('pointermove',e=>{if(dragging)move(e);});
 for(const name of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(name,()=>{dragging=false;});
 stage.addEventListener('keydown',e=>{const delta={ArrowLeft:[-.02,0],ArrowRight:[.02,0],ArrowUp:[0,-.02],ArrowDown:[0,.02]}[e.key];if(!delta)return;e.preventDefault();motion.value='manual';cursorPoint={x:M.clamp(cursorPoint.x+delta[0]),y:M.clamp(cursorPoint.y+delta[1])};update();});
 window.addEventListener('ybr:selection',e=>{
  const brick=e.detail?.brick;if(brick?.id===selected?.id)return;
  engine.stop();selected=brick;panel.hidden=brick?.source!=='playable-cover';artworkBrickId=brick?.layout?.artworkBrickId||null;pins.clear();regions=brick?.source==='playable-cover'?brick.layout.regions.map(M.region):[];sensitivity.value=String((brick?.sensitivity??.25)*100);cursorPoint={x:.5,y:.5};status.textContent='';cover();rebuild();
 });
 window.addEventListener('ybr:library',e=>{
  library=e.detail.bricks||[];const lookup=new Map(library.map(b=>[b.id,b]));
  if(engine.active&&mixBricks.some(b=>!lookup.get(b.id)?.streamAllowed||JSON.stringify(lookup.get(b.id)?.media)!==JSON.stringify(b.media))){engine.stop();status.textContent='A sound changed or became unavailable. Review the layout and play again.';}
  if(selected?.source==='playable-cover'&&(!lookup.has(selected.id)||regions.some(r=>!lookup.get(r.brickId)?.streamAllowed))){engine.stop();regions=[];pins.clear();panel.hidden=true;}cover();rebuild();
 });
 window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);engine.stop();});
 window.addEventListener('pageshow',()=>{cancelAnimationFrame(frame);lastTime=0;frame=requestAnimationFrame(animate);});
 window.YBRAudiocover={get active(){return engine.active;},get playing(){return engine.playing;},get duration(){return engine.duration;},get currentTime(){return engine.currentTime;},focus:()=>panel.scrollIntoView({behavior:'smooth',block:'center'}),toggle,stop:()=>{engine.stop();rebuild();},seek:seconds=>engine.seek(seconds)};
 rebuild();frame=requestAnimationFrame(animate);
})();
