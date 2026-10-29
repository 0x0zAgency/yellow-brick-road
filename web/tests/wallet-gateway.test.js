import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import {createWalletHandler,walletCoverRequest,startWalletGateway,loadWalletTls,setupWalletGateway,ensureWalletGateway} from '../scripts/wallet-gateway.mjs';
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
test('gateway TLS requires the wildcard, private files, and the existing CA; setup is explicit',async t=>{
 const absent=temporary(t);assert.equal(loadWalletTls(absent),null);
 await ensureWalletGateway({root:absent,spawnOwned:()=>assert.fail('Unconfigured gateway must not start')});
 const root=certificates(t),tls=loadWalletTls(root);assert.ok(tls.key);
 setupWalletGateway(root,{run:()=>assert.fail('Already configured; no trust or certificate changes'),log:()=>{}});
 assert.throws(()=>loadWalletTls(certificates(t,false)),/matching certificate/);
 const key=path.join(root,'.road-local/wallet-gateway/key.pem');fs.chmodSync(key,0o644);assert.throws(()=>loadWalletTls(root),/owner-only/);fs.chmodSync(key,0o600);
 fs.renameSync(key,key+'.saved');fs.symlinkSync(key+'.saved',key);assert.throws(()=>loadWalletTls(root));
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
