'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createPlayableCovers}=require('../playable-covers'),{createStudioLibrary,sha256}=require('../studio-releases'),{createApp}=require('../server');
const {playableNewest}=require('../public/library-model'),M=require('../public/artwork-model');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKxkAAAAASUVORK5CYII=','base64');
const encode=(bytes,name,mime)=>({name,mime,sha256:sha256(bytes),base64:bytes.toString('base64')});
function publication(title){return {format:'ybr-studio-preview/1',audioSourceRole:'preview',consent:'share-selected-copies-with-local-player',title,creator:'Fixture artist',assets:{audio:encode(Buffer.from('RIFF'+title),'preview.wav','audio/wav'),artwork:encode(png,'cover.png','image/png')},files:[{role:'preview',name:'preview.wav',sharedAs:'audio'}],bricks:[]};}
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-covers-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const studio=createStudioLibrary({directory:path.join(root,'uploads')}),blocked=new Set();
 const checkPermission=async(b,role)=>({allowed:!blocked.has(b.id+':'+role)});
 const directory=path.join(root,'covers'),covers=createPlayableCovers({directory,studio,checkPermission,now:()=>1700000000000});
 const a=studio.publish(publication('First sound')).brick,b=studio.publish(publication('Second sound')).brick;
 const payload=buildingId=>({buildingId,title:'Two worlds',consent:'commit-playable-cover',sensitivity:.3,layout:{format:'ybr-player-artwork-layout/1',artworkBrickId:a.id,regions:[{brickId:a.id,x:.1,y:.2,width:.2,height:.3},{brickId:b.id,x:.6,y:.4,width:.3,height:.2}]}});
 return {root,studio,blocked,checkPermission,directory,covers,a,b,payload};
}
test('audio Building unlock, any uploaded sound, immutable commit, restart and withdrawal',async t=>{
 const f=fixture(t),{covers,studio,a,b,payload}=f;
 assert.equal((await covers.catalog()).buildings.length,0);assert.deepEqual(await covers.playable(),[]);
 await assert.rejects(covers.commit(payload('BUILDING-'+'0'.repeat(64))),/Create an audio Building/);
 const {record:building}=await covers.createBuilding({title:'My audio Building',members:[a.id]});
 const body=payload(building.id);body.recoveryKey='NEVER-SERIALIZE';body.layout.mediaUrl='https://example.invalid/private';
 const first=await covers.commit(body),again=await covers.commit(body);
 assert.equal(first.created,true);assert.equal(again.created,false);assert.equal(again.record.id,first.record.id);
 assert.ok(first.record.sources.some(s=>s.id===b.id),'Can add another upload beyond the initial Building');
 assert.equal(first.record.layout.regions[1].x,.6);assert.doesNotMatch(JSON.stringify(first.record),/NEVER-SERIALIZE|https:|base64/);
 const reopened=createPlayableCovers({directory:f.directory,studio,checkPermission:f.checkPermission});
 const [cover]=await reopened.playable();assert.equal(cover.id,first.record.id);assert.equal(cover.type,'PlayableCover');assert.equal(cover.artwork.sourceBrickId,a.id);
 const tracks=studio.list();assert.equal(playableNewest([...tracks,cover],{canPlayType:()=> 'probably'}).length,3);
 assert.equal(playableNewest([...tracks,cover],{canPlayType:()=> 'probably',unavailable:new Set([b.id])}).length,1,'An undecodable source hides the whole mix');
 assert.equal(playableNewest([tracks[0],cover],{}).length,1,'No cover can bypass a missing source');
 const changed=structuredClone(body);changed.layout.regions[0].x=.4;assert.notEqual((await reopened.commit(changed)).record.id,cover.id,'Editing makes a separate committed object');
 assert.equal(reopened.remove(cover.id),true);assert.equal(reopened.remove(cover.id),false);assert.equal(studio.list().length,2);
});
test('all source and artwork permissions are rechecked on commit, listing and reopening',async t=>{
 const {covers,studio,blocked,a,b,payload}=fixture(t),{record:building}=await covers.createBuilding({title:'Audio Building',members:[a.id]});
 const body=payload(building.id);await covers.commit(body);
 for(const key of [b.id+':audio',a.id+':audio',a.id+':artwork']){
  blocked.add(key);assert.equal((await covers.playable()).length,0);await assert.rejects(covers.commit(body),/permission changed/);blocked.delete(key);assert.equal((await covers.playable()).length,1);
 }
 studio.remove(b.id);assert.equal((await covers.playable()).length,0);await assert.rejects(covers.commit(body),/unavailable/);
});
test('invalid sources, duplicate pins, untrusted URLs, invalid geometry, missing artwork and consent cannot publish',async t=>{
 const {covers,studio,a,b,payload}=fixture(t);
 await assert.rejects(covers.createBuilding({title:'Fake',members:['BRK-AUD-001']}),/uploaded audio/);
 await assert.rejects(covers.createBuilding({title:'Fake',members:[a.id,a.id]}),/distinct/);
 const {record}=await covers.createBuilding({title:'Real',members:[a.id]});
 const body=payload(record.id),change=fn=>{const v=structuredClone(body);fn(v);return v;};
 await assert.rejects(covers.commit(change(v=>delete v.consent)),/Confirm/);
 await assert.rejects(covers.commit(change(v=>v.layout.regions[1].brickId=a.id)),/distinct/);
 await assert.rejects(covers.commit(change(v=>v.layout.regions[0].x=NaN)),/geometry/);
 await assert.rejects(covers.commit(change(v=>v.sensitivity=Infinity)),/reach/);
 await assert.rejects(covers.commit(change(v=>v.layout.regions[0].brickId='https://example.invalid/audio')),/uploaded/);
 const noArt=publication('No art');delete noArt.assets.artwork;const noCover=studio.publish(noArt).brick;
 await assert.rejects(covers.commit(change(v=>v.layout.artworkBrickId=noCover.id)),/shared cover/);
 assert.equal((await covers.playable()).length,0);
});
test('existing Mint Studio release Buildings unlock the composer without changing receipts',async t=>{
 const {covers,studio}=fixture(t),input=publication('Minted release');input.bricks=[{role:'Sound recording',title:'Minted release'}];
 const release=studio.publish(input).brick,catalog=await covers.catalog();assert.equal(catalog.buildings.length,1);assert.deepEqual(catalog.buildings[0].members,[release.id]);assert.equal(catalog.buildings[0].source,'mint-studio');
});
test('moving pins preserves their sizes and clamps the whole sound region inside the cover',()=>{
 const original={brickId:'source',x:.2,y:.3,width:.25,height:.4};
 assert.deepEqual(M.moveRegion(original,.6,.1),{...original,x:.6,y:.1});
 assert.deepEqual(M.moveRegion(original,5,-1),{...original,x:.75,y:0});
 assert.deepEqual(original,{brickId:'source',x:.2,y:.3,width:.25,height:.4});
});
test('creator HTTP gate, separate Player item, authenticated sources and revocation',async t=>{
 const {root,studio,a,b,blocked,checkPermission,directory,payload}=fixture(t);
 const roadGateway={list:async()=>({status:{ready:false},tracks:[]}),track:async()=>null,playerPolicy:{check:checkPermission}};
 const {server}=createApp({accounts:{artist:'fixture-only'},studioLibrary:studio,coverDirectory:directory,roadGateway,interactionFile:path.join(root,'events')});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const base='http://127.0.0.1:'+server.address().port,config=await (await fetch(base+'/api/player-publish/config')).json();
 const headers={'Content-Type':'application/json','X-YBR-Publish-Token':config.token};
 const post=(route,body,extra={})=>fetch(base+route,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body)});
 assert.equal((await fetch(base+'/api/player-publish/cover-studio')).status,403);
 assert.equal((await fetch(base+'/api/player-publish/cover-studio',{headers:{...headers,Origin:'https://attacker.invalid'}})).status,403);
 assert.equal((await fetch(base+'/api/player-publish/assets/'+a.id+'/audio')).status,403);
 const creating=await post('/api/player-publish/audio-buildings',{title:'HTTP Building',members:[a.id]});assert.equal(creating.status,201);const building=(await creating.json()).record;
 assert.equal((await post('/api/player-publish/playable-covers',payload(building.id),{'X-YBR-Publish-Token':'0'.repeat(64)})).status,403);
 const published=await post('/api/player-publish/playable-covers',payload(building.id));assert.equal(published.status,201);const cover=(await published.json()).record;
 assert.equal((await fetch(base+'/api/bricks')).status,401);
 const login=await post('/api/session',{username:'artist',password:'fixture-only'}),auth={Cookie:login.headers.get('set-cookie').split(';')[0]};
 let catalog=await (await fetch(base+'/api/bricks',{headers:auth})).json();assert.equal(catalog.bricks.filter(b=>b.source==='playable-cover').length,1);assert.ok(catalog.bricks.some(b=>b.id===a.id));
 assert.equal((await post('/api/bricks/'+cover.id+'/authorize',{},auth)).status,404,'Cover is not a fabricated audio file');
 assert.equal((await post('/api/bricks/'+b.id+'/authorize',{},auth)).status,200);
 blocked.add(b.id+':audio');
 assert.equal((await post('/api/bricks/'+b.id+'/authorize',{},auth)).status,404);
 assert.equal((await fetch(base+'/api/player-publish/assets/'+b.id+'/audio',{headers})).status,403);
 catalog=await (await fetch(base+'/api/bricks',{headers:auth})).json();assert.ok(!catalog.bricks.some(b=>b.id===cover.id));
 assert.equal((await fetch(base+'/api/player-publish/assets/'+a.id+'/master',{headers})).status,404);
 assert.equal((await post('/api/player-publish/audio-buildings',{title:'x'.repeat(40000),members:[a.id]})).status,413);
});
