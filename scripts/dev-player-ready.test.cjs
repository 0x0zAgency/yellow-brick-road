'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {createServer}=require('node:http');
const {once}=require('node:events');
const {stripVTControlCharacters:strip}=require('node:util');
const {ensurePlayerSession,ensureDemoPublished,verifyDemoPlayback,DEMO_TITLE,DEMO_ARTIST}=require('./dev-player-ready.cjs');
const {renderDashboard}=require('./dev-screen.cjs');
const factoryAddress='0x'+'1'.repeat(40),id='0x'+'2'.repeat(64);
const credentials={listener:'listener-fixture',artist:'artist-fixture'};
const audio=Buffer.from('first-party synthetic test fixture');
const sha256=createHash('sha256').update(audio).digest('hex');
const status={ready:true,chainId:1337,factoryAddress};
const track={id,source:'road',title:DEMO_TITLE,creator:DEMO_ARTIST,media:{sha256},road:{factoryAddress,chainId:1337,licenseMode:'public-stream'}};
function sessionHarness(previous=null,known=null){
 const calls=[],states=[],logs=[];
 const deps={
  status:async()=>previous,
  access:({generate})=>{calls.push(generate?'generate':'read');return generate?credentials:known;},
  verify:async()=>{calls.push('verify');return true;},
  restartLocal:async()=>calls.push('restart'),start:async c=>{assert.deepEqual(c,credentials);calls.push('start');},
  onAccess:s=>states.push(s),onSecrets:c=>{assert.deepEqual(c,credentials);calls.push('redact');},log:s=>logs.push(s)
 };
 return {deps,calls,states,logs};
}
test('cold startup launches Player and reveals only authenticated credentials',async()=>{
 const h=sessionHarness();assert.deepEqual(await ensurePlayerSession({factoryAddress},h.deps),{source:'owned',verified:true});
 assert.deepEqual(h.calls,['generate','redact','start','verify']);
 assert.ok(h.states.slice(0,-1).every(s=>!s.listener&&!s.artist));
 assert.deepEqual(h.states.at(-1),{...credentials,source:'owned',verified:true});
 for(const password of Object.values(credentials))assert.ok(!h.logs.join('\n').includes(password));
});
test('healthy known Player is reused without a restart or password rotation',async()=>{
 const h=sessionHarness(status,credentials);assert.deepEqual(await ensurePlayerSession({factoryAddress},h.deps),{source:'reused',verified:true});
 assert.deepEqual(h.calls,['read','redact','verify']);assert.equal(h.states.at(-1).listener,credentials.listener);
});
test('legacy unknown-password Player is automatically replaced without a flag',async()=>{
 const h=sessionHarness(status);await ensurePlayerSession({factoryAddress},h.deps);
 assert.deepEqual(h.calls,['read','restart','generate','redact','start','verify']);assert.equal(h.states.at(-1).verified,true);
});
test('incorrect saved passwords cause guarded repair, never unverified READY',async()=>{
 const h=sessionHarness(status,credentials);let attempts=0;h.deps.verify=async()=>++attempts>1;
 await ensurePlayerSession({factoryAddress},h.deps);assert.ok(h.calls.includes('restart'));assert.equal(attempts,2);
 assert.ok(h.states.filter(s=>s.listener).every(s=>s.verified===true));
});
test('unhealthy or stale-factory Player is repaired without trying its passwords',async()=>{
 for(const previous of [{...status,ready:false},{...status,chainId:1},{...status,factoryAddress:'0x'+'f'.repeat(40)}]){
  const h=sessionHarness(previous,credentials);await ensurePlayerSession({factoryAddress},h.deps);
  assert.equal(h.calls[0],'restart');assert.equal(h.states.at(-1).source,'owned');
 }
});
test('foreign process refusal aborts startup without launching or displaying logins',async()=>{
 const h=sessionHarness(status);h.deps.restartLocal=async()=>{throw Error('Different checkout; not stopped.');};
 await assert.rejects(ensurePlayerSession({factoryAddress},h.deps),/Different checkout/);
 assert.ok(!h.calls.includes('start'));assert.ok(!h.states.some(s=>s.listener));
});
test('failed new Player authentication fails closed',async()=>{
 const h=sessionHarness();h.deps.verify=async()=>false;
 await assert.rejects(ensurePlayerSession({factoryAddress},h.deps),/logins could not be verified/);
 assert.ok(!h.states.some(s=>s.verified||s.listener||s.artist));
});
test('explicit restart remains available and respects the same guard',async()=>{
 const h=sessionHarness(status,credentials);await ensurePlayerSession({factoryAddress,restart:true},h.deps);
 assert.equal(h.calls[0],'restart');assert.equal(h.states.at(-1).verified,true);
});
function musicHarness(existing=false){
 const calls=[];let published=existing;
 const deps={generate:async()=>calls.push('generate'),digest:()=>sha256,
  list:async()=>{calls.push('list');return {tracks:published?[track]:[]};},
  publish:async()=>{calls.push('publish');published=true;}};
 return {deps,calls};
}
test('default startup publishes a missing synthetic Brick then verifies its registration',async()=>{
 const h=musicHarness();const result=await ensureDemoPublished({},h.deps);
 assert.equal(result.state,'REGISTERED');assert.equal(result.id,id);assert.equal(result.disposition,'published');
 assert.deepEqual(h.calls,['generate','list','publish','list']);
});
test('subsequent startup does not mint a duplicate test track',async()=>{
 const h=musicHarness(true);const result=await ensureDemoPublished({},h.deps);
 assert.equal(result.disposition,'reused');assert.deepEqual(h.calls,['generate','list']);
});
test('successful publish command without discoverable registered music is an error',async()=>{
 const h=musicHarness();h.deps.publish=async()=>{};
 await assert.rejects(ensureDemoPublished({},h.deps),/discoverable Ganache Brick/);
});
test('explicit demo opt-out is visible and performs no publication or playback',async()=>{
 const h=musicHarness();const result=await ensureDemoPublished({skip:true},h.deps);
 assert.deepEqual(result,{state:'SKIPPED'});assert.deepEqual(h.calls,[]);
 assert.deepEqual(await verifyDemoPlayback(result),result);
});
const demo={state:'REGISTERED',id,sha256,title:DEMO_TITLE,factoryAddress,disposition:'published'};
const playbackFetch=({tracks=[track],bytes=audio,status=200}={})=>async(url,options)=>{
 assert.ok(url.startsWith('http://127.0.0.1:4173/road/'));assert.equal(options.redirect,'error');assert.ok(options.signal);
 return url.endsWith('/road/api/music')?Response.json({tracks}):new Response(bytes,{status});
};
test('playback is verified only after matching catalog identity and the returned audio hash',async()=>{
 const result=await verifyDemoPlayback(demo,{fetchImpl:playbackFetch()});
 assert.equal(result.state,'VERIFIED');assert.equal(result.mediaUrl,'http://127.0.0.1:4173/road/media/'+id);
});
test('missing, wrong-factory or unauthorized catalog entries block playback verification',async()=>{
 for(const tracks of [[],[{...track,road:{...track.road,factoryAddress:'0x'+'a'.repeat(40)}}],[{...track,road:{...track.road,licenseMode:'none'}}]]){
  await assert.rejects(verifyDemoPlayback(demo,{fetchImpl:playbackFetch({tracks})}),/does not expose/);
 }
});
test('changed audio, unavailable media, and oversized streams cannot claim playback verified',async()=>{
 await assert.rejects(verifyDemoPlayback(demo,{fetchImpl:playbackFetch({bytes:Buffer.from('wrong')})}),/do not match/);
 await assert.rejects(verifyDemoPlayback(demo,{fetchImpl:playbackFetch({status:503})}),/HTTP 503/);
 await assert.rejects(verifyDemoPlayback(demo,{fetchImpl:playbackFetch(),maxBytes:1}),/verification limit/);
});
test('playback verification works against a real loopback HTTP server',async()=>{
 const server=createServer((req,res)=>{
  if(req.url==='/road/api/music'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({tracks:[track]}));}
  else if(req.url==='/road/media/'+id)res.end(audio);
  else{res.statusCode=404;res.end();}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const result=await verifyDemoPlayback(demo,{fetchImpl:(url,options)=>fetch('http://127.0.0.1:'+server.address().port+new URL(url).pathname,options)});
  assert.equal(result.state,'VERIFIED');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
const screenState=()=>({phase:'READY',startedAt:0,now:1000,nodeVersion:'v24.0.0',
 services:{web:'UP',player:'UP',ganache:'UP',ipfs:'UP'},factory:factoryAddress,
 access:{...credentials,source:'owned',verified:true},
 ganache:{source:'owned',account:'0x'+'3'.repeat(40),balance:'999.9',block:2,
 mnemonic:'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'},
 music:{...demo,state:'VERIFIED'},logs:[]});
test('80x24 shows exact tagline, separate explicit login rows, whole seed and playable demo',()=>{
 const lines=renderDashboard(screenState(),{columns:80,rows:24,showSecrets:true,color:true});
 const text=lines.map(strip).join('\n');assert.ok(lines.length<24);assert.ok(lines.every(l=>strip(l).length<80));
 assert.match(text,/FOLLOW THE YELLOW BRICK ROAD/);assert.ok(!text.includes('FOLLOW THE BRICKS'));
 assert.match(text,/Username: listener   Password: listener-fixture/);assert.match(text,/Username: artist     Password: artist-fixture/);
 assert.match(text,/PLAYBACK VERIFIED/);assert.match(text,/about/);assert.ok(text.includes(factoryAddress));
 assert.ok(text.indexOf('YBR PLAYER LOGIN')<text.indexOf('SERVICES'));
});
test('short terminals keep credentials instead of requiring another terminal',()=>{
 for(const [columns,rows] of [[80,20],[64,16]]){
  const lines=renderDashboard(screenState(),{columns,rows,showSecrets:true});const text=lines.join('\n');
  assert.ok(lines.length<rows);assert.ok(lines.every(l=>l.length<columns));
  for(const value of Object.values(credentials))assert.ok(text.includes(value));
 }
});
test('all sizes and hidden modes stay bounded and never expose hidden passwords',()=>{
 for(const columns of [10,30,59,64,70,80,100,113,144,180])for(const rows of [12,16,20,24,40]){
  const lines=renderDashboard(screenState(),{columns,rows,color:true,showSecrets:false});
  assert.ok(lines.length<rows);assert.ok(lines.every(l=>strip(l).length<columns));
  for(const value of Object.values(credentials))assert.ok(!lines.join('\n').includes(value));
 }
});
test('tagline remains exact with animation disabled',()=>{
 const text=renderDashboard(screenState(),{columns:80,rows:24,motion:false}).join('\n');
 assert.match(text,/FOLLOW THE YELLOW BRICK ROAD/);
});
