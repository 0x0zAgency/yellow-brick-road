'use strict';
(function(root){
 class ArtworkEngine{
  constructor({authorize,makeAudio,report=()=>{},changed=()=>{}}){Object.assign(this,{authorize,makeAudio,report,changed});this.entries=[];this.revision=0;this.active=false;this.playing=false;this.starting=false;this.volume=.75;this.levels=[];}
  notify(){this.changed();}
  async start(bricks){
   this.stop();const revision=this.revision;this.active=true;this.starting=true;this.notify();
   try{
    const grants=await Promise.all(bricks.map(brick=>this.authorize(brick.id)));
    if(revision!==this.revision)return;
    if(grants.some(grant=>!grant?.authorized))throw Error('Artwork sound authorization refused.');
    // Never create or start any sound until every Brick is authorized.
    this.entries=bricks.map((brick,i)=>{
     const audio=this.makeAudio();audio.volume=0;audio.loop=true;audio.preload='none';
     const entry={brick,audio,playbackId:globalThis.crypto.randomUUID()};
     for(const event of ['play','pause','seeked'])audio.addEventListener(event,()=>{
      if(this.active&&revision===this.revision)this.report(entry,event==='seeked'?'seek':event);
     });
     audio.addEventListener('error',()=>{
      if(revision!==this.revision)return;this.stop();this.notifyError?.('An artwork sound became unavailable. Play again to reauthorize.');
     });
     audio.src=grants[i].mediaUrl;return entry;
    });
    await Promise.all(this.entries.map(({audio})=>audio.play()));
    if(revision!==this.revision)return;
    this.starting=false;this.playing=true;this.applyLevels();this.notify();
   }catch(error){if(revision!==this.revision)return;this.stop();throw error;}
  }
  async toggle(){
   if(this.starting){this.stop();return;}
   if(!this.active)return;
   if(this.playing){this.entries.forEach(({audio})=>audio.pause());this.playing=false;this.notify();return;}
   const revision=this.revision;
   try{await Promise.all(this.entries.map(({audio})=>audio.play()));if(revision!==this.revision)return;this.playing=true;this.notify();}
   catch(error){if(revision!==this.revision)return;this.stop();throw error;}
  }
  stop(){
   // Report final pauses before invalidating the generation, including a pending play.
   for(const entry of this.entries)if(!entry.audio.paused)this.report(entry,'pause');
   this.revision++;this.active=false;this.playing=false;this.starting=false;
   for(const {audio} of this.entries){audio.pause();audio.removeAttribute('src');audio.load();}
   this.entries=[];this.notify();
  }
  setLevels(levels,volume=this.volume){this.levels=levels;this.volume=Math.max(0,Math.min(1,volume));this.applyLevels();}
  applyLevels(){this.entries.forEach(({audio},i)=>{audio.volume=this.volume*(this.levels[i]||0);});}
  seek(seconds){for(const {audio} of this.entries)if(Number.isFinite(audio.duration)&&audio.duration>0)audio.currentTime=Math.min(Math.max(0,seconds),Math.max(0,audio.duration-.01));}
  get duration(){const d=this.entries.map(e=>e.audio.duration).filter(d=>Number.isFinite(d)&&d>0);return d.length?Math.min(...d):0;}
  get currentTime(){return this.entries[0]?.audio.currentTime||0;}
 }
 if(typeof module==='object'&&module.exports)module.exports=ArtworkEngine;else root.YBRArtworkEngine=ArtworkEngine;
})(globalThis);
