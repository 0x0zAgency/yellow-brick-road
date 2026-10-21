'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {createStudioLibrary,normalizePublication,sha256}=require('../studio-releases');
const {createApp}=require('../server');
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKxkAAAAASUVORK5CYII=','base64');
const encode=(bytes,name,mime)=>({name,mime,sha256:sha256(bytes),base64:bytes.toString('base64')});
const audio=Buffer.from('RIFF-original-preview-fixture');
const lyrics=Buffer.from('This is a lyric.\n<script>notExecutable()</script>\n');
function publication(){return {format:'ybr-studio-preview/1',audioSourceRole:'preview',consent:'share-selected-copies-with-local-player',title:'My uploaded release',creator:'Creator',album:'Demo album',description:'Preview',
 assets:{audio:encode(audio,'demo.wav','audio/wav'),artwork:encode(image,'cover.png','image/png'),lyrics:encode(lyrics,'lyrics.txt','text/plain')},
 files:[{role:'preview',name:'demo.wav',sharedAs:'audio'},{role:'artwork',name:'cover.png',sharedAs:'artwork'},{role:'lyrics',name:'lyrics.txt',sharedAs:'lyrics'},{role:'project',name:'private.flp'}],
 bricks:[{role:'Sound recording',title:'My uploaded release',address:null}],key:'DO-NOT-STORE-THIS-SECRET'};}
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-studio-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {dir,library:createStudioLibrary({directory:dir})};}

test('release stores only consented copies, preserves shared cover identity and deduplicates retries',t=>{
 const {dir,library}=fixture(t),payload=publication();
 const first=library.publish(payload),again=library.publish(payload);
 assert.equal(first.created,true);assert.equal(again.created,false);assert.equal(first.brick.id,again.brick.id);
 assert.equal(library.list().length,1);assert.equal(first.brick.source,'studio-demo');
 assert.equal(first.brick.verification,'local-creator-preview-not-chain-verified');
 assert.ok(first.brick.files.every(file=>file.artworkUrl===first.brick.artwork.url));
 assert.equal(first.brick.files.find(file=>file.role==='project').shared,null);
 assert.deepEqual(library.asset(first.brick.id,'artwork').bytes,image);
 assert.deepEqual(library.asset(first.brick.id,'lyrics').bytes,lyrics);
 const stored=fs.readFileSync(path.join(dir,first.brick.id,'release.json'),'utf8');
 assert.ok(!stored.includes(payload.key));assert.ok(!stored.includes('base64'));assert.ok(!stored.includes('encrypted'));
 const reopened=createStudioLibrary({directory:dir});assert.equal(reopened.list()[0].id,first.brick.id);
 assert.equal(reopened.remove(first.brick.id),true);assert.equal(reopened.list().length,0);assert.equal(reopened.remove(first.brick.id),false);
});

test('consent, integrity, roles, raster cover type, UTF-8 lyrics and WebVTT validation fail closed',()=>{
 const change=fn=>{const value=publication();fn(value);return value;};
 assert.throws(()=>normalizePublication(change(p=>delete p.consent)),/consent/);
 assert.throws(()=>normalizePublication(change(p=>p.assets.audio.sha256='f'.repeat(64))),/checksum/);
 assert.throws(()=>normalizePublication(change(p=>p.assets.project=p.assets.audio)),/Only audio/);
 assert.throws(()=>normalizePublication(change(p=>p.assets.artwork=encode(Buffer.from('<svg onload="bad()"/>'),'cover.png','image/png'))),/PNG, JPEG or WebP/);
 assert.throws(()=>normalizePublication(change(p=>p.assets.lyrics=encode(Buffer.from([255,254,0]),'bad.txt','text/plain'))),/UTF-8/);
 assert.throws(()=>normalizePublication(change(p=>p.assets.lyrics=encode(Buffer.from('not vtt'),'lyrics.vtt','text/vtt'))),/WEBVTT/);
 const vtt=normalizePublication(change(p=>p.assets.lyrics=encode(Buffer.from('WEBVTT\n\n00:00.000 --> 00:01.000\nA line\n'),'lyrics.vtt','text/vtt')));
 assert.equal(vtt.metadata.assets.lyrics.kind,'webvtt');
});

test('tampered bytes are not served; publication retry cannot silently endorse tampering',t=>{
 const {dir,library}=fixture(t),payload=publication(),{brick}=library.publish(payload);
 fs.writeFileSync(path.join(dir,brick.id,'audio.bin'),'tampered');
 assert.throws(()=>library.asset(brick.id,'audio'),/integrity/);
 assert.throws(()=>library.publish(payload),/integrity/);
 assert.equal(library.get('../../outside'),null);assert.equal(library.asset(brick.id,'project'),null);
});

test('local publish API, authenticated artwork/lyrics/audio, byte ranges and withdrawal',async t=>{
 const {library}=fixture(t);
 const roadGateway={ready:async()=>({ready:false,reason:'No chain for this unit test'}),list:async()=>({status:{ready:false},tracks:[]}),track:async()=>null};
 const {server}=createApp({accounts:{listener:'demo-password'},roadGateway,studioLibrary:library});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const base='http://127.0.0.1:'+server.address().port;
 const fetchAt=(route,opts)=>fetch(base+route,opts);
 let response=await fetchAt('/api/player-publish/config',{headers:{Origin:'https://untrusted.example'}});assert.equal(response.status,403);
 const rebindingStatus=await new Promise((resolve,reject)=>http.get(base+'/api/player-publish/config',{headers:{Host:'rebind.attacker.invalid'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject));assert.equal(rebindingStatus,403);
 response=await fetchAt('/api/player-publish/config',{headers:{'Sec-Fetch-Site':'cross-site'}});assert.equal(response.status,403);
 response=await fetchAt('/api/player-publish/config');assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),null);
 const {token}=await response.json();
 const publish=extra=>fetchAt('/api/player-publish/releases',{method:'POST',headers:{'Content-Type':'application/json',...extra},body:JSON.stringify(publication())});
 response=await publish({});assert.equal(response.status,403);
 response=await publish({'X-YBR-Publish-Token':token});assert.equal(response.status,201);
 const {brick}=await response.json();
 for(const uri of [brick.artwork.url,brick.lyrics.url,'/api/bricks/'+brick.id+'/media'])assert.equal((await fetchAt(uri)).status,401);
 response=await fetchAt('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'listener',password:'demo-password'})});
 const cookie=response.headers.get('set-cookie').split(';')[0],headers={Cookie:cookie};
 const catalog=await (await fetchAt('/api/bricks',{headers})).json();assert.equal(catalog.bricks.filter(item=>item.source==='studio-demo').length,1);
 assert.equal((await (await fetchAt('/road/api/music')).json()).tracks.length,0,'Private demo previews must not enter the public on-chain catalog');
 response=await fetchAt('/api/bricks/'+brick.id+'/media',{headers});assert.equal(response.status,403);
 response=await fetchAt('/api/bricks/'+brick.id+'/authorize',{method:'POST',headers});assert.equal(response.status,200);
 response=await fetchAt('/api/bricks/'+brick.id+'/media',{headers:{...headers,Range:'bytes=0-3'}});assert.equal(response.status,206);assert.equal(await response.text(),'RIFF');
 response=await fetchAt(brick.artwork.url,{headers});assert.equal(response.headers.get('content-type'),'image/png');assert.equal(sha256(Buffer.from(await response.arrayBuffer())),sha256(image));
 response=await fetchAt(brick.lyrics.url,{headers});assert.equal(response.headers.get('content-type'),'text/plain; charset=utf-8');assert.equal(await response.text(),lyrics.toString());
 assert.equal(response.headers.get('access-control-allow-origin'),null);
 response=await fetchAt('/api/player-publish/releases/'+brick.id,{method:'DELETE',headers:{'X-YBR-Publish-Token':token}});assert.equal(response.status,200);
 response=await fetchAt('/api/bricks/'+brick.id+'/media',{headers});assert.equal(response.status,404);
});

test('server rejects master/ambiguous sources independently of the browser',()=>{
 const payload=publication();
 delete payload.audioSourceRole;
 assert.throws(()=>normalizePublication(payload),/Audio Preview/);
 payload.audioSourceRole='preview';payload.files[0].role='master';
 assert.throws(()=>normalizePublication(payload),/Audio Preview/);
 payload.files[0].role='preview';payload.files.push({...payload.files[0]});
 assert.throws(()=>normalizePublication(payload),/Audio Preview/);
});
test('stored legacy master copies remain on disk but cannot be listed or served',t=>{
 const {dir,library}=fixture(t),{brick}=library.publish(publication());
 const file=path.join(dir,brick.id,'release.json'),record=JSON.parse(fs.readFileSync(file,'utf8'));
 record.files[0].role='master';delete record.audioSourceRole;fs.writeFileSync(file,JSON.stringify(record));
 assert.equal(library.list().length,0);assert.equal(library.get(brick.id),null);assert.equal(library.asset(brick.id,'audio'),null);
 assert.equal(fs.existsSync(path.join(dir,brick.id,'audio.bin')),true,'Do not delete user files implicitly');
 assert.equal(library.remove(brick.id),true,'Explicit removal still works');
});
