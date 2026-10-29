'use strict';
/** Disposable offline Kubo only. Never reads the user's repo or running node. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn,execFileSync}=require('node:child_process');
const {setTimeout:sleep}=require('node:timers/promises');
const {createIpfsCleanup}=require('./dev-ipfs-cleanup.cjs');
const binary=process.env.YBR_IPFS_TEST_BINARY;
test('real offline Kubo: cache preserves pins/MFS, full cleanup removes their blocks and preserves identity',
 {skip:!binary,timeout:60000},async t=>{
 assert.ok(path.isAbsolute(binary),'Pass an absolute path to a Kubo binary.');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-clean-kubo-')),repo=path.join(root,'ipfs');
 const env={...process.env,IPFS_PATH:repo};delete env.IPFS_API;
 const cli=args=>execFileSync(binary,args,{env,encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe']});
 let daemon;
 t.after(async()=>{
  if(daemon&&daemon.exitCode===null){const exited=new Promise(resolve=>daemon.once('exit',resolve));daemon.kill('SIGTERM');await Promise.race([exited,sleep(5000,undefined,{ref:false})]);if(daemon.exitCode===null){daemon.kill('SIGKILL');await exited;}}
  fs.rmSync(root,{recursive:true,force:true});
 });
 cli(['init','--empty-repo','--profile=test']);
 cli(['config','Addresses.API','/ip4/127.0.0.1/tcp/0']);
 cli(['config','Addresses.Gateway','/ip4/127.0.0.1/tcp/0']);
 const configBefore=fs.readFileSync(path.join(repo,'config'),'utf8');
 daemon=spawn(binary,['daemon','--offline'],{env,stdio:['ignore','pipe','pipe']});
 let logs='';daemon.stdout.on('data',b=>logs+=b);daemon.stderr.on('data',b=>logs+=b);
 let rpc;
 for(let i=0;i<100;i++){
  if(daemon.exitCode!==null)throw Error('Disposable Kubo failed: '+logs);
  try{const match=/^\/ip4\/127\.0\.0\.1\/tcp\/(\d+)$/.exec(fs.readFileSync(path.join(repo,'api'),'utf8').trim());if(match){rpc='http://127.0.0.1:'+match[1];const r=await fetch(rpc+'/api/v0/id',{method:'POST'});if(r.ok)break;}}catch{}
  await sleep(100);
 }
 assert.ok(rpc,'Disposable API did not start');
 async function api(command,args={}){return fetch(rpc+'/api/v0/'+command+'?'+new URLSearchParams(args),{method:'POST',signal:AbortSignal.timeout(10000)});}
 async function json(command,args){const response=await api(command,args);assert.equal(response.ok,true,await response.clone().text());return response.json();}
 async function add(name,pin){
  const form=new FormData();form.append('file',new Blob(['Synthetic cleanup fixture: '+name+'\n']),'fixture.txt');
  const response=await fetch(rpc+'/api/v0/add?pin='+pin,{method:'POST',body:form});assert.equal(response.ok,true);return (await response.json()).Hash;
 }
 const recursive=await add('recursive',true),direct=await add('direct',false),desktop=await add('desktop-only',false),cache=await add('cache-only',false);
 await json('pin/add',{arg:direct,recursive:'false'});
 assert.equal((await api('files/mkdir',{arg:'/Desktop fixture'})).ok,true);
 const copy=await fetch(rpc+'/api/v0/files/cp?'+new URLSearchParams([['arg','/ipfs/'+desktop],['arg','/Desktop fixture/nested file']]),{method:'POST'});assert.equal(copy.ok,true,await copy.text());
 const cleaner=createIpfsCleanup({root,rpc}),preview=await cleaner.scan();
 // Kubo may also pin its initialized empty directory, even with --empty-repo.
 assert.ok(preview.pins.some(p=>p.cid===recursive&&p.type==='recursive'));
 assert.ok(preview.pins.some(p=>p.cid===direct&&p.type==='direct'));assert.equal(preview.files.length,1);
 const cached=await cleaner.scan('cache'),cacheResult=await cleaner.apply(cached,cached.confirmation);
 assert.equal(cacheResult.status,'complete');assert.ok(cacheResult.removedBlocks>=1);
 for(const id of [recursive,direct,desktop])assert.equal((await api('block/stat',{arg:id})).ok,true);
 assert.equal((await api('block/stat',{arg:cache})).ok,false);
 const full=await cleaner.scan(),result=await cleaner.apply(full,full.confirmation);
 assert.equal(result.status,'complete');assert.equal(result.unpinned,full.pins.length);assert.equal(result.removedFiles,1);assert.ok(result.removedBlocks>=3);
 for(const id of [recursive,direct,desktop])assert.equal((await api('block/stat',{arg:id})).ok,false);
 const after=await cleaner.scan();assert.equal(after.pins.length,0);assert.equal(after.files.length,0);assert.equal(after.peerId,preview.peerId);
 assert.equal(fs.readFileSync(path.join(repo,'config'),'utf8'),configBefore);
 assert.equal(JSON.parse(fs.readFileSync(result.reportFile)).result.status,'complete');
});
