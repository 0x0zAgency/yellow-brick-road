import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import {createWalletHandler,walletCoverRequest,startWalletGateway,loadWalletTls,setupWalletGateway,prepareWalletGateway,ensureWalletGateway} from '../scripts/wallet-gateway.mjs';
import {retrieveNftCover,handleUploadRequest} from '../scripts/ipfs-bridge.mjs';
import fixture from '../../scripts/dev-https-fixture.cjs';
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAIUlEQVR4nGP8f9kpxjeSgYGBgYGBMVphNgMMMDEgARQOAMDRBDMbPbpyAAAAAElFTkSuQmCC','base64');
const cid='bafkreic34rmqzxw5kz75coonncdqciexlmeg5nlimgucjhfg5c7iuuqiki';
function temporary(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-wallet-gateway-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function certificates(t,wallet=true){const root=temporary(t),dir=fixture.createTestTls(root,{wallet});fs.renameSync(dir,path.join(root,'.road-local/wallet-gateway'));return root;}

test('wallet IPFS URLs accept exact path/subdomain forms, not arbitrary hosts or private routes',()=>{
 assert.deepEqual(walletCoverRequest('localhost:8792','/ipfs/'+cid),{cid});
 assert.deepEqual(walletCoverRequest(cid+'.ipfs.localhost:8792','/'),{cid});
 for(const [host,url] of [['evil.example','/ipfs/'+cid],['localhost.evil.example','/ipfs/'+cid],['localhost:8792@evil.example','/ipfs/'+cid],['localhost:8792/path','/ipfs/'+cid],['localhost:8792','//ipfs/'+cid],['localhost:8792','/ipfs/'+cid+'/private'],['localhost:8792','/ipfs/'+cid+'?secret=x'],['localhost:8792','/ipfs/%2e%2e'],['localhost:8792','/api/v0/config'],['localhost:8792','/api/road-ipfs/content/'+cid],[cid+'.ipfs.localhost:8792','/ipfs/'+cid]])assert.equal(walletCoverRequest(host,url),null,host+url);
});
test('gateway TLS requires the wildcard, private files, and prior HTTPS consent',async t=>{
 const absent=temporary(t);assert.equal(loadWalletTls(absent),null);
 const messages=[];
 await ensureWalletGateway({root:absent,run:()=>assert.fail('No HTTPS consent: do not run mkcert'),spawnOwned:()=>assert.fail('Unconfigured gateway must not start'),log:line=>messages.push(line)});
 assert.ok(messages.some(line=>line.includes('setup:https')));
 const root=certificates(t),tls=loadWalletTls(root);assert.ok(tls.key);
 setupWalletGateway(root,{run:()=>assert.fail('Already configured; no trust or certificate changes'),log:()=>{}});
 assert.throws(()=>loadWalletTls(certificates(t,false)),/matching certificate/);
 const key=path.join(root,'.road-local/wallet-gateway/key.pem');fs.chmodSync(key,0o644);assert.throws(()=>loadWalletTls(root),/owner-only/);fs.chmodSync(key,0o600);
 fs.renameSync(key,key+'.saved');fs.symlinkSync(key+'.saved',key);assert.throws(()=>loadWalletTls(root));
});
function fakeMkcert(t,appDirectory,{differentCa=false}={}){
 const caroot=temporary(t),source=differentCa?fixture.createTestTls(temporary(t),{wallet:true}):appDirectory,calls=[];
 fs.copyFileSync(path.join(source,'ca.pem'),path.join(caroot,'rootCA.pem'));
 const run=(command,args)=>{
  assert.equal(command,'mkcert');calls.push([...args]);
  assert.ok(!args.includes('-install')&&!args.includes('-uninstall'),'Startup never changes OS trust');
  if(args[0]==='-version')return {status:0,stdout:'test fixture'};
  if(args[0]==='-CAROOT')return {status:0,stdout:caroot};
  assert.deepEqual(args.slice(4),['localhost','127.0.0.1','::1','*.ipfs.localhost']);
  fs.copyFileSync(path.join(source,'cert.pem'),args[1]);fs.copyFileSync(path.join(source,'key.pem'),args[3]);return {status:0};
 };
 return {run,calls};
}
test('clean reinstall restores missing wallet TLS with the same CA and reuses a healthy gateway',async t=>{
 const root=temporary(t),appDirectory=fixture.createTestTls(root,{wallet:true}),mkcert=fakeMkcert(t,appDirectory),messages=[];
 const original=Object.fromEntries(['cert.pem','ca.pem','key.pem'].map(name=>[name,fs.readFileSync(path.join(appDirectory,name))]));
 const options={root,run:mkcert.run,log:line=>messages.push(line),probe:async tls=>{assert.deepEqual(tls.ca,original['ca.pem']);return true;},spawnOwned:()=>assert.fail('A healthy existing gateway must be reused')};
 await ensureWalletGateway(options);assert.ok(loadWalletTls(root));assert.equal(mkcert.calls.filter(args=>args[0]==='-cert-file').length,1);
 assert.ok(messages.some(line=>line.includes('Restoring missing')));assert.ok(messages.some(line=>line.includes('https://localhost:8792')));
 await ensureWalletGateway(options);assert.equal(mkcert.calls.filter(args=>args[0]==='-cert-file').length,1,'Ordinary restarts do not regenerate certificates');
 // Model reinstall losing only this optional leaf, without deleting a chain or IPFS data.
 fs.rmSync(path.join(root,'.road-local/wallet-gateway'),{recursive:true});
 await ensureWalletGateway(options);assert.equal(mkcert.calls.filter(args=>args[0]==='-cert-file').length,2);
 for(const name of Object.keys(original))assert.deepEqual(fs.readFileSync(path.join(appDirectory,name)),original[name],'App HTTPS must stay unchanged');
 for(const name of Object.keys(original))assert.equal(fs.statSync(path.join(root,'.road-local/wallet-gateway',name)).mode&0o777,0o600);
 assert.ok(!fs.existsSync(path.join(root,'.road-local/wallet-gateway/rootCA-key.pem')));
});
test('missing mkcert or a changed CA produces actionable guidance without installing trust or blocking startup',async t=>{
 const root=temporary(t),appDirectory=fixture.createTestTls(root,{wallet:true}),messages=[];
 assert.equal(prepareWalletGateway(root,{run:()=>({status:1}),log:line=>messages.push(line)}),null);
 assert.ok(messages.some(line=>line.includes('setup:wallet')));assert.equal(loadWalletTls(root),null);
 const mismatch=fakeMkcert(t,appDirectory,{differentCa:true});
 await ensureWalletGateway({root,run:mismatch.run,log:line=>messages.push(line),probe:()=>assert.fail('Never probe with a substituted CA'),spawnOwned:()=>assert.fail('Never start an unverified gateway')});
 assert.ok(messages.some(line=>line.includes('differs from this checkout')));assert.ok(!mismatch.calls.some(args=>args[0]==='-cert-file'));assert.equal(loadWalletTls(root),null);
});
test('actual trusted HTTPS serves wallet cross-origin PNGs and rejects ciphertext, writes and admin routes',async t=>{
 const root=certificates(t),tls=loadWalletTls(root);let mode='png',reads=0;
 const handler=createWalletHandler({retrieve:cid=>retrieveNftCover(cid,{fetchImpl:async url=>{
  reads++;assert.equal(new URL(url).pathname,'/api/v0/cat');assert.ok(url.includes('length=524289'));
  if(mode==='offline')throw Error('SECRET provider value');
  return new Response(mode==='png'?bytes:mode==='cipher'?Buffer.from('0ZROAD01SECRET'):Buffer.from('<html>gateway migration page</html>'));
 }})});
 const server=await startWalletGateway({root,tls,port:0,handler});t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const port=server.address().port;
 const request=({host=cid+'.ipfs.localhost',url='/',method='GET',ca=tls.ca}={})=>new Promise((resolve,reject)=>{
  const req=https.request({hostname:'127.0.0.1',port,servername:host,ca,path:url,method,headers:{Host:host+':'+port,Origin:'chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn','Sec-Fetch-Site':'cross-site'}},res=>{
   const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,bytes:Buffer.concat(chunks)}));res.on('error',reject);
  });req.on('error',reject);req.end();
 });
 await assert.rejects(request({ca:null}),/certificate|issuer|self.signed/i);
 const cover=await request();assert.equal(cover.status,200);assert.deepEqual(cover.bytes,bytes);
 assert.equal(cover.headers['cross-origin-resource-policy'],'cross-origin');assert.equal(cover.headers['access-control-allow-origin'],'*');assert.equal(cover.headers['content-type'],'image/png');
 assert.deepEqual((await request({host:'localhost',url:'/ipfs/'+cid})).bytes,bytes);
 const head=await request({method:'HEAD'});assert.equal(head.bytes.length,0);assert.equal(Number(head.headers['content-length']),bytes.length);
 const before=reads;
 for(const [method,url,status] of [['POST','/ipfs/'+cid,405],['GET','/api/v0/config',404],['GET','/api/road-ipfs/content/'+cid,404],['GET','/ipfs/'+cid+'?key=SECRET',404]])assert.equal((await request({host:'localhost',method,url})).status,status);
 assert.equal(reads,before);
 for(const value of ['cipher','html','offline']){mode=value;const bad=await request();assert.ok(bad.status>=400);assert.doesNotMatch(bad.bytes.toString(),/SECRET|migration page/);assert.equal(bad.headers['cache-control'],'no-store');}
 // The existing private bridge has not gained extension/cross-site access.
 let responseStatus;
 await handleUploadRequest({headers:{host:'127.0.0.1:8791',origin:'chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn'},method:'GET',url:'/api/road-ipfs/content/'+cid},{writeHead:status=>{responseStatus=status;},end:()=>{}},{retrieve:()=>assert.fail('Private recovery must stay blocked')});
 assert.equal(responseStatus,403);
});
