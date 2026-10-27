'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),fs=require('node:fs');
const {createApp}=require('../server');
test('artwork assets use the static allowlist and existing per-Brick session authorization',async t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-artwork-'));
 const roadGateway={config:{chainId:1337},list:async()=>({status:{ready:false,reason:'Isolated test'},tracks:[]})};
 const {server}=createApp({accounts:{listener:'test',artist:'test'},roadGateway,eventFile:path.join(tmp,'events.ndjson'),interactionFile:path.join(tmp,'interactions.ndjson')});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections?.();}));
 const base='http://127.0.0.1:'+server.address().port;
 for(const file of ['artwork.css','artwork-model.js','artwork-engine.js','artwork-ui.js']){
  const res=await fetch(base+'/'+file);assert.equal(res.status,200);assert.match(res.headers.get('content-security-policy'),/media-src 'self'/);assert.ok((await res.text()).length>100);
 }
 assert.equal((await fetch(base+'/artwork-private.json')).status,404);
 const post=(url,body={},cookie)=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
 assert.equal((await post('/api/bricks/BRK-AUD-001/authorize')).status,401);
 const login=await post('/api/session',{username:'listener',password:'test'}),cookie=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await post('/api/bricks/BRK-AUD-002/authorize',{},cookie)).status,403);
 const grant=await post('/api/bricks/BRK-AUD-001/authorize',{},cookie);assert.equal(grant.status,200);
 const {mediaUrl}=await grant.json();const media=await fetch(base+mediaUrl,{headers:{Cookie:cookie,Range:'bytes=0-15'}});assert.equal(media.status,206);assert.equal((await media.arrayBuffer()).byteLength,16);
 await post('/api/logout',{},cookie);assert.equal((await fetch(base+mediaUrl,{headers:{Cookie:cookie}})).status,401);
});
