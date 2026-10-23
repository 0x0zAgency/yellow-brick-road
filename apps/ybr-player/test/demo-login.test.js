'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createApp}=require('../server');
const {demoArtistAccount}=require('../demo-login');
const accounts={artist:'fixture-artist',listener:'fixture-listener'};
async function fixture(t,enabled){
 const roadGateway={ready:async()=>({ready:false}),list:async()=>({status:{ready:false},tracks:[]}),track:async()=>null};
 const studioLibrary={list:()=>[],get:()=>null};
 const app=createApp({accounts,roadGateway,studioLibrary,demoAutoLogin:enabled?'artist':null});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>app.server.close(resolve)));
 const origin='http://127.0.0.1:'+app.server.address().port,jar=new Map();
 async function request(route,body){
  const res=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')},body:body===undefined?undefined:JSON.stringify(body)});
  for(const value of res.headers.getSetCookie()){
   const pair=value.split(';')[0],i=pair.indexOf('='),key=pair.slice(0,i),val=pair.slice(i+1);
   if(val)jar.set(key,val);else jar.delete(key);
  }
  return res;
 }
 return {...app,request};
}
test('demo mode is limited to the standard local launcher and has a manual opt-out',()=>{
 assert.equal(demoArtistAccount({host:'127.0.0.1',port:4173,env:{}}),'artist');
 assert.equal(demoArtistAccount({host:'0.0.0.0',port:4173,env:{}}),null);
 assert.equal(demoArtistAccount({host:'127.0.0.1',port:4174,env:{}}),null);
 assert.equal(demoArtistAccount({host:'127.0.0.1',port:4173,env:{NODE_ENV:'production'}}),null);
 assert.equal(demoArtistAccount({host:'127.0.0.1',port:4173,env:{YBR_PLAYER_AUTO_LOGIN:'0'}}),null);
});
test('disabled mode requires ordinary sign-in',async t=>{
 const f=await fixture(t,false);
 assert.equal((await(await f.request('/api/session')).json()).authenticated,false);
 assert.equal((await f.request('/api/session/demo',{})).status,403);
 assert.equal((await f.request('/api/bricks')).status,401);
});
test('demo artist uses a normal session; logout and manual listener remain respected',async t=>{
 const f=await fixture(t,true);
 const initial=await f.request('/api/session');assert.equal(initial.headers.get('set-cookie'),null);
 assert.equal((await initial.json()).demoAutoLogin,'artist');
 const response=await f.request('/api/session/demo',{});
 assert.equal((await response.json()).user,'artist');
 assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
 assert.equal([...f.sessions.values()][0].grants.size,0);
 assert.equal((await f.request('/api/bricks/BRK-AUD-002/media')).status,403);
 await f.request('/api/logout',{});
 assert.equal((await(await f.request('/api/session')).json()).demoAutoLoginPaused,true);
 assert.equal((await f.request('/api/session/demo',{})).status,401);
 assert.equal((await f.request('/api/session/demo',{resume:true})).status,200);
 await f.request('/api/logout',{});
 await f.request('/api/session',{username:'listener',password:accounts.listener});
 assert.equal((await(await f.request('/api/session/demo',{resume:true})).json()).user,'listener');
 assert.equal((await f.request('/api/bricks/BRK-AUD-002/authorize',{})).status,403);
});
