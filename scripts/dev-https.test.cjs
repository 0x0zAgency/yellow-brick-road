'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),https=require('node:https');
const {createTestTls}=require('./dev-https-fixture.cjs');
const {loadHttps,localUrls,prepareHttpsEnvironment,setupHttps}=require('./dev-https.cjs');
const {handleReadRpc}=require('../apps/ybr-player/road-rpc');
const {verifyReadRpc}=require('./dev-rpc-health.cjs');
const temp=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-https-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
test('HTTPS is opt-in via certificates; partial or unsafe configuration never silently downgrades',t=>{
 const root=temp(t);assert.equal(loadHttps(root,{}),null);assert.equal(prepareHttpsEnvironment(root,{}).YBR_LOCAL_HTTPS,'0');
 assert.throws(()=>loadHttps(root,{YBR_LOCAL_HTTPS:'1'}),/not configured/);
 fs.mkdirSync(path.join(root,'.road-local'),{mode:0o755});assert.equal(loadHttps(root,{}),null);fs.chmodSync(path.join(root,'.road-local'),0o700);fs.mkdirSync(path.join(root,'.road-local/tls'),{mode:0o700});assert.throws(()=>loadHttps(root,{}),/incomplete/);
 assert.equal(loadHttps(root,{YBR_DEV_HTTP:'1'}),null);
 assert.equal(localUrls({YBR_LOCAL_HTTPS:'1'}).web,'https://127.0.0.1:5173');assert.equal(localUrls({}).player,'http://127.0.0.1:4173');
 let calls=0;assert.throws(()=>setupHttps(root,{run:()=>{calls++;return {status:1};}}),/Install mkcert/);assert.equal(calls,1);
});
test('valid certificates produce bounded private trust bundle; symlinks and mismatched keys are refused',t=>{
 const root=temp(t),dir=createTestTls(root),tls=loadHttps(root,{});assert.ok(tls.key);assert.ok(tls.ca);
 const env=prepareHttpsEnvironment(root,{});assert.equal(env.YBR_LOCAL_HTTPS,'1');assert.equal(fs.statSync(env.NODE_EXTRA_CA_CERTS).mode&0o777,0o600);assert.ok(fs.readFileSync(env.NODE_EXTRA_CA_CERTS).includes(tls.ca));
 assert.deepEqual(prepareHttpsEnvironment(root,env),env);
 const key=path.join(dir,'key.pem');fs.chmodSync(key,0o644);assert.throws(()=>loadHttps(root,{}),/unsafe/);fs.chmodSync(key,0o600);
 fs.renameSync(key,key+'.saved');fs.symlinkSync(key+'.saved',key);assert.throws(()=>loadHttps(root,{}),/unsafe/);
});
test('real verified HTTPS serves browser-shaped RPC reads; untrusted certificates and foreign origins fail',async t=>{
 const root=temp(t),dir=createTestTls(root),tls=loadHttps(root,{}),calls=[];
 const server=https.createServer(tls,(req,res)=>void handleReadRpc(req,res,{rpc:async(m,p)=>{calls.push([m,p]);return '0x539';}}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());const url='https://127.0.0.1:'+server.address().port;
 const post=(ca,origin=url)=>new Promise((resolve,reject)=>{const req=https.request(url+'/road/rpc',{method:'POST',ca,headers:{'Content-Type':'application/json',Origin:origin}},res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>resolve({status:res.statusCode,json:JSON.parse(body)}));});req.on('error',reject);req.end(JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId'}));});
 await assert.rejects(()=>post(undefined),/certificate|issuer|self.signed/i);
 const result=await post(tls.ca);assert.equal(result.status,200);assert.equal(result.json.result,'0x539');assert.deepEqual(calls,[['eth_chainId',[]]]);
 assert.equal((await post(tls.ca,'https://attacker.example')).status,403);assert.equal(calls.length,1);
 assert.ok(!fs.existsSync(path.join(dir,'rootCA-key.pem')));
});
test('startup readiness goes through browser proxy and omits params; errors never leak provider data',async()=>{
 let sent;assert.equal(await verifyReadRpc('https://127.0.0.1:5173',1337,{fetchImpl:async(url,opts)=>{sent=JSON.parse(opts.body);assert.equal(opts.headers.Origin,'https://127.0.0.1:5173');return {ok:true,json:async()=>({id:'ybr-readiness',result:'0x539'})};}}),true);
 assert.equal(Object.hasOwn(sent,'params'),false);
 await assert.rejects(()=>verifyReadRpc('https://127.0.0.1:5173',1337,{fetchImpl:async()=>({ok:false,status:400})}),/HTTP 400/);
 await assert.rejects(()=>verifyReadRpc('https://127.0.0.1:5173',1337,{fetchImpl:async()=>{throw Error('PRIVATE_RPC_KEY');}}),e=>!e.message.includes('PRIVATE_RPC_KEY'));
});
