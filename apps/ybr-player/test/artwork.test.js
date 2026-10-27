'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
globalThis.crypto??=require('node:crypto').webcrypto;
const M=require('../public/artwork-model'),Engine=require('../public/artwork-engine');
const brick=id=>({id,media:{sha256:'a'.repeat(64)}});
class Sound extends EventTarget{
 constructor(){super();this.paused=true;this.duration=20;this.currentTime=0;this.volume=1;this.loads=0;}
 async play(){this.paused=false;this.dispatchEvent(new Event('play'));}
 pause(){if(!this.paused){this.paused=true;this.dispatchEvent(new Event('pause'));}}
 removeAttribute(key){delete this[key];}load(){this.loads++;}
}
test('region gain falls off outside artwork geometry; overlapping sounds stay within master gain',()=>{
 const r={brickId:'a',x:.4,y:.4,width:.2,height:.2};
 assert.equal(M.gain(r,{x:.5,y:.5}),1);assert.equal(M.gain(r,{x:0,y:0}),0);
 assert.ok(M.gain(r,{x:.7,y:.5})>0&&M.gain(r,{x:.7,y:.5})<1);
 assert.deepEqual(M.gains([r,r],{x:.5,y:.5}),[.5,.5]);
 assert.equal(M.gains([r],{x:0,y:0},new Map([[0,.6]]))[0],.6);
 const bounded=M.region({x:5,y:-1,width:5,height:-2});assert.equal(bounded.x,.98);assert.equal(bounded.y,0);assert.ok(bounded.x+bounded.width<=1);
});
test('layout import accepts only current distinct playable references and finite geometry',()=>{
 const value={format:'ybr-player-artwork-layout/1',artworkBrickId:'a',regions:[{brickId:'a',x:0,y:0,width:.5,height:.5}]},allowed=new Set(['a']);
 assert.equal(M.decode(value,allowed).regions.length,1);
 assert.throws(()=>M.decode(value,new Set()),/unavailable/);
 assert.throws(()=>M.decode({...value,regions:[...value.regions,...value.regions]},allowed),/distinct/);
 assert.throws(()=>M.decode({...value,regions:[{...value.regions[0],x:Infinity}]},allowed),/geometry/);
 assert.throws(()=>M.decode({...value,regions:Array(9).fill(value.regions[0])},allowed),/1–8/);
 assert.equal(JSON.stringify(M.decode({...value,url:'https://evil.test',token:'fake'},allowed)).includes('evil'),false);
});
test('automatic movement stays on the cover for all supported paths',()=>{
 for(const name of ['box','diagonal','random'])for(let i=0;i<50;i++){
  const p=M.waypoint(name,i);assert.ok(p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1);
 }
});
test('authorize every sound before playback; retain independent interaction identities; seek, pause and dispose',async()=>{
 const sounds=[],events=[],authorized=[];
 const engine=new Engine({authorize:async id=>{authorized.push(id);return {authorized:true,mediaUrl:'/api/bricks/'+id+'/media'};},makeAudio:()=>{assert.equal(authorized.length,2);const a=new Sound();sounds.push(a);return a;},report:(entry,event)=>events.push({id:entry.brick.id,run:entry.playbackId,event})});
 engine.setLevels([.25,.75],.8);await engine.start([brick('a'),brick('b')]);
 assert.equal(engine.active,true);assert.equal(engine.playing,true);assert.equal(sounds[0].volume,.2);assert.ok(Math.abs(sounds[1].volume-.6)<.00001);
 assert.equal(new Set(events.map(e=>e.run)).size,2);assert.deepEqual(events.map(e=>e.id),['a','b']);
 engine.seek(5);assert.equal(sounds[0].currentTime,5);assert.equal(sounds[1].currentTime,5);
 await engine.toggle();assert.equal(engine.playing,false);assert.ok(sounds.every(s=>s.paused));
 await engine.toggle();assert.equal(engine.playing,true);
 engine.stop();assert.ok(sounds.every(s=>s.paused&&!s.src&&s.loads));assert.equal(engine.active,false);
});
test('denial of one sound cannot start another; cancelled grants cannot resurrect playback',async()=>{
 let made=0;
 const denied=new Engine({authorize:async id=>{if(id==='b')throw Error('403 denied');return {authorized:true,mediaUrl:'/a'};},makeAudio:()=>{made++;return new Sound();}});
 await assert.rejects(denied.start([brick('a'),brick('b')]),/403/);assert.equal(made,0);assert.equal(denied.active,false);
 let resolve;const pending=new Engine({authorize:()=>new Promise(r=>{resolve=r;}),makeAudio:()=>{made++;return new Sound();}});
 const start=pending.start([brick('a')]);pending.stop();resolve({authorized:true,mediaUrl:'/a'});await start;
 assert.equal(made,0);assert.equal(pending.active,false);
});
test('failed play and media errors stop and unload every layer',async()=>{
 const sounds=[];let message='';
 const engine=new Engine({authorize:async()=>({authorized:true,mediaUrl:'/a'}),makeAudio:()=>{const a=new Sound();sounds.push(a);if(sounds.length===2)a.play=async()=>{throw Error('Playback blocked');};return a;}});
 await assert.rejects(engine.start([brick('a'),brick('b')]),/blocked/);assert.equal(engine.active,false);assert.ok(sounds.every(a=>a.paused&&!a.src));
 const other=new Engine({authorize:async()=>({authorized:true,mediaUrl:'/a'}),makeAudio:()=>new Sound()});other.notifyError=value=>{message=value;};
 await other.start([brick('a')]);const a=other.entries[0].audio;a.dispatchEvent(new Event('error'));
 assert.equal(other.active,false);assert.ok(a.paused&&!a.src);assert.match(message,/unavailable/);
});
