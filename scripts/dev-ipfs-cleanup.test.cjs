'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {createIpfsCleanup,checkedRpc}=require('./dev-ipfs-cleanup.cjs');
const {IpfsCleanupMenu,renderIpfsCleanupMenu,reviewFits}=require('./dev-ipfs-cleanup-menu.cjs');
const PEER='12D3KooW'+'a'.repeat(36)+'deadbeef',cid=n=>'bafy'+'a'.repeat(40)+n;
function fixture(t,options={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-clean-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const node={peer:PEER,pins:new Map([[cid(1),'recursive'],[cid(2),'direct']]),files:[{Name:'uploaded art',Hash:cid(3),Type:1}],calls:[],mutations:[],bytes:4096};
 const mfs=()=>crypto.createHash('sha256').update(JSON.stringify(node.files)).digest('hex');
 const fetchImpl=async(url,init)=>{
  assert.equal(init.method,'POST');assert.equal(init.redirect,'error');
  const u=new URL(url),cmd=u.pathname.slice('/api/v0/'.length),q=u.searchParams;
  node.calls.push(cmd);if(['pin/rm','files/rm','repo/gc'].includes(cmd))node.mutations.push(cmd);
  const overridden=await node.intercept?.(cmd,q);if(overridden)return overridden;
  let value;
  if(cmd==='id')value={ID:node.peer};
  else if(cmd==='pin/ls')value={Keys:Object.fromEntries([...node.pins].filter(([,type])=>type===q.get('type')).map(([id,Type])=>[id,{Type}]))};
  else if(cmd==='files/ls')value={Entries:node.files.length?node.files:null};
  else if(cmd==='repo/stat')value={SizeStat:{RepoSize:node.bytes},NumObjects:4};
  else if(cmd==='files/stat')value={Hash:q.get('arg')==='/'?mfs():node.files.find(f=>'/'+f.Name===q.get('arg'))?.Hash};
  else if(cmd==='files/rm'){assert.equal(q.get('recursive'),'true');node.files=node.files.filter(f=>'/'+f.Name!==q.get('arg'));return new Response(null);}
  else if(cmd==='pin/rm'){
   const id=q.get('arg');assert.equal(q.get('recursive'),String(node.pins.get(id)==='recursive'));
   node.pins.delete(id);value={Pins:[id]};
  }else if(cmd==='repo/gc'){
   assert.equal(q.get('stream-errors'),'true');node.bytes=1024;
   return new Response(JSON.stringify({Key:{'/':cid(9)}})+'\n'+JSON.stringify({Key:{'/':cid(8)}})+'\n');
  }else throw Error('Unexpected API call: '+cmd);
  return Response.json(value);
 };
 const cleaner=createIpfsCleanup({root,fetchImpl,...options});return {root,node,cleaner,fetchImpl};
}
const approve=(cleaner,plan,options)=>cleaner.apply(plan,plan.confirmation,options);
test('IPFS preview is read-only and its inventory cannot be edited or forged',async t=>{
 const {root,node,cleaner}=fixture(t),p=await cleaner.scan();
 assert.equal(p.pins.length,2);assert.equal(p.files.length,1);assert.equal(p.peerId,PEER);assert.deepEqual(node.mutations,[]);
 assert.equal(fs.existsSync(path.join(root,'.road-local')),false);
 assert.throws(()=>p.pins.pop(),TypeError);assert.throws(()=>p.files[0].name='elsewhere',TypeError);
 await assert.rejects(approve(cleaner,{...p}),/Review this node/);
 await assert.rejects(cleaner.apply(p,'DELETE IPFS'),/exact cleanup confirmation/);assert.deepEqual(node.mutations,[]);
});
test('full IPFS cleanup removes MFS, recursive/direct pins, then GC; saves private report',async t=>{
 const {root,node,cleaner}=fixture(t),p=await cleaner.scan();
 fs.writeFileSync(path.join(root,'original.wav'),'original');
 let reportDuringCleanup;
 const r=await approve(cleaner,p,{onProgress:progress=>{
  if(progress.stage==='files'){
   const dir=path.join(root,'.road-local/ipfs-cleanup'),file=fs.readdirSync(dir).find(name=>name.endsWith('.json'));
   reportDuringCleanup=JSON.parse(fs.readFileSync(path.join(dir,file))).result.status;
  }
 }});
 assert.equal(reportDuringCleanup,'incomplete');
 assert.deepEqual(node.mutations,['files/rm','pin/rm','pin/rm','repo/gc']);
 assert.equal(r.status,'complete');assert.equal(r.unpinned,2);assert.equal(r.removedFiles,1);assert.equal(r.removedBlocks,2);assert.equal(r.reclaimedBytes,3072);
 assert.equal(r.remainingPins,0);assert.equal(r.remainingFiles,0);
 const report=JSON.parse(fs.readFileSync(r.reportFile));assert.equal(report.review.files[0].name,'uploaded art');assert.equal(report.result.status,'complete');
 assert.equal(fs.readFileSync(path.join(root,'original.wav'),'utf8'),'original');
 assert.equal(fs.existsSync(path.join(path.dirname(r.reportFile),'active.lock')),false);
 if(process.platform!=='win32'){assert.equal(fs.statSync(r.reportFile).mode&0o777,0o600);assert.equal(fs.statSync(path.dirname(r.reportFile)).mode&0o777,0o700);}
 await assert.rejects(approve(cleaner,p),/Review this node/);
});
test('cache-only cleanup retains every pin and Desktop entry',async t=>{
 const {node,cleaner}=fixture(t),p=await cleaner.scan('cache'),r=await approve(cleaner,p);
 assert.deepEqual(node.mutations,['repo/gc']);assert.equal(r.unpinned,0);assert.equal(r.remainingPins,2);assert.equal(r.remainingFiles,1);
});
test('cleanup is restricted to the selected local node, without redirects or credentials',async t=>{
 for(const url of ['https://127.0.0.1:5001','http://example.com','http://127.0.0.1/api/v0','http://user:password@localhost:5001','http://localhost:5001?x=1','http://localhost:5001#x'])assert.throws(()=>checkedRpc(url));
 assert.equal(checkedRpc('http://[::1]:5001'),'http://[::1]:5001');
 const {cleaner,node}=fixture(t,{expectedPeer:'12D3KooW'+'b'.repeat(44)});
 await assert.rejects(cleaner.scan(),/does not match/);assert.deepEqual(node.mutations,[]);
});
test('expired reviews and changed pins, MFS contents or peer stop before any deletion',async t=>{
 for(const change of ['expired','pins','mfs','peer']){
  let clock=0;const {node,cleaner}=fixture(t,{now:()=>clock}),p=await cleaner.scan();
  if(change==='expired')clock=600001;if(change==='pins')node.pins.set(cid(4),'recursive');
  if(change==='mfs')node.files[0].Hash=cid(5);if(change==='peer')node.peer='12D3KooW'+'b'.repeat(44);
  await assert.rejects(approve(cleaner,p),/expired|changed since review/);assert.deepEqual(node.mutations,[],change);
 }
});
test('node identity changing after initial recheck stops subsequent destructive calls',async t=>{
 const {node,cleaner}=fixture(t),p=await cleaner.scan();
 let changed=false;await assert.rejects(approve(cleaner,p,{onProgress:progress=>{
  if(progress.stage==='files'){changed=true;node.peer='12D3KooW'+'b'.repeat(44);}
 }}),/identity changed/);assert.equal(changed,true);assert.deepEqual(node.mutations,['files/rm']);
});
test('new pins during removal stop GC and persist partial progress',async t=>{
 const {node,cleaner}=fixture(t),p=await cleaner.scan();let error;
 try{await approve(cleaner,p,{onProgress:progress=>{if(progress.stage==='pins')node.pins.set(cid(7),'recursive');}});}catch(e){error=e;}
 assert.match(error.message,/New or remaining files/);assert.ok(!node.mutations.includes('repo/gc'));
 const report=JSON.parse(fs.readFileSync(error.result.reportFile));assert.equal(report.result.status,'partial-failure');assert.equal(report.result.unpinned,2);
});
test('a Desktop entry changed immediately before its removal is preserved',async t=>{
 const {node,cleaner}=fixture(t),p=await cleaner.scan();
 node.intercept=(cmd,q)=>cmd==='files/stat'&&q.get('arg')!=='/'?Response.json({Hash:cid(6)}):undefined;
 await assert.rejects(approve(cleaner,p),/file changed after review/);assert.deepEqual(node.mutations,[]);
});
test('lock and unsafe report directory block all mutations',async t=>{
 for(const kind of ['lock','symlink']){
  const {root,node,cleaner}=fixture(t),p=await cleaner.scan();fs.mkdirSync(path.join(root,'.road-local'));
  const dir=path.join(root,'.road-local/ipfs-cleanup');
  if(kind==='lock'){fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'active.lock'),'busy');}
  else{const outside=path.join(root,'untouched');fs.mkdirSync(outside);fs.symlinkSync(outside,dir);}
  await assert.rejects(approve(cleaner,p),/Another cleanup|Unsafe cleanup/);assert.deepEqual(node.mutations,[]);
 }
});
test('GC errors in an HTTP 200 stream never claim success, and count already removed blocks',async t=>{
 for(const end of [JSON.stringify({Error:'storage error'}),'not-json',JSON.stringify({Message:'unknown record'})]){
  const {node,cleaner}=fixture(t),p=await cleaner.scan('cache');
  node.intercept=cmd=>cmd==='repo/gc'?new Response(JSON.stringify({Key:{'/':cid(9)}})+'\n'+end+'\n'):undefined;
  let error;try{await approve(cleaner,p);}catch(e){error=e;}
  assert.ok(error);assert.equal(error.result.status,'partial-failure');assert.equal(error.result.removedBlocks,1);
  assert.equal(JSON.parse(fs.readFileSync(error.result.reportFile)).result.status,'partial-failure');
 }
});
test('incomplete inventories fail closed rather than using an empty default',async t=>{
 for(const command of ['pin/ls','files/ls','repo/stat']){
  const {node,cleaner}=fixture(t);node.intercept=cmd=>cmd===command?Response.json({Message:'unexpected response'}):undefined;
  await assert.rejects(cleaner.scan());assert.deepEqual(node.mutations,[]);
 }
});
test('empty pin lists support Kubo omitted, null and empty Keys representations',async t=>{
 for(const empty of [{},{Keys:null},{Keys:{}}]){
  const {node,cleaner}=fixture(t);node.intercept=cmd=>cmd==='pin/ls'?Response.json(empty):undefined;
  assert.equal((await cleaner.scan()).pins.length,0);assert.deepEqual(node.mutations,[]);
 }
});
test('Dev Control requires typed confirmation, blocks paste/resize and prevents quit while applying',async t=>{
 const {cleaner}=fixture(t),calls=[];let finish,columns=80;
 const menu=new IpfsCleanupMenu({cleaner:{scan:cleaner.scan,apply:(...args)=>{calls.push(args);return new Promise(resolve=>finish=resolve);}},size:()=>({columns,rows:24})});
 menu.handle('a',{name:'a'});await menu.pending;assert.equal(menu.state.stage,'review');assert.equal(reviewFits(menu.state),true);
 const phrase=menu.state.plan.confirmation;
 menu.handle('',{sequence:'\x1b[200~'});for(const c of phrase)menu.handle(c,{name:c});menu.handle('',{name:'return'});menu.handle('',{sequence:'\x1b[201~'});
 assert.equal(menu.state.confirmation,'');assert.equal(calls.length,0);
 for(const c of phrase)menu.handle(c,{name:c});columns=79;menu.handle('',{name:'return'});assert.equal(calls.length,0);
 columns=80;menu.handle('',{name:'return'});await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,1);
 menu.handle('',{name:'escape'});menu.handle('c',{name:'c',ctrl:true});assert.equal(menu.active,true);assert.equal(menu.state.stage,'applying');
 finish({status:'complete'});await menu.pending;assert.equal(menu.state.stage,'result');menu.handle('',{name:'escape'});assert.equal(menu.active,false);
});
test('cancel during a scan cannot reopen a late review',async()=>{
 let resolve,last;const menu=new IpfsCleanupMenu({cleaner:{scan:()=>new Promise(r=>resolve=r)},onChange:value=>last=value});
 menu.handle('a',{name:'a'});await new Promise(r=>setImmediate(r));menu.handle('',{name:'escape'});resolve({});await menu.pending;assert.equal(last,null);
});
test('cleanup screens keep target, consequences, confirmation and footer visible at 80x24',async t=>{
 const {cleaner}=fixture(t),plan=await cleaner.scan(),menu={stage:'review',plan,confirmation:''};
 const rendered=renderIpfsCleanupMenu({cleanupMenu:menu},{columns:80,rows:24}).join('\n');
 for(const text of [plan.rpc,plan.peerId,plan.confirmation,'ALL pins','other apps','Cannot undo','Playable Covers','Esc / Ctrl+C'])assert.ok(rendered.includes(text),text);
 for(const columns of [10,40,79,80,120])for(const rows of [10,24,40]){
  const lines=renderIpfsCleanupMenu({cleanupMenu:menu},{columns,rows});assert.ok(lines.length<rows);assert.ok(lines.every(line=>line.length<columns));
  if(columns<80||rows<24)assert.ok(!lines.join('\n').includes('DELETE IPFS'));
 }
});
test('standalone apply refuses piped input and CLI preview makes only read calls',async t=>{
 const {fetchImpl,node}=fixture(t),http=require('node:http');
 const server=http.createServer(async(req,res)=>{try{const r=await fetchImpl('http://127.0.0.1'+req.url,{method:req.method,redirect:'error'});res.writeHead(r.status,{'content-type':'application/json'});res.end(Buffer.from(await r.arrayBuffer()));}catch{res.writeHead(500);res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
 const run=args=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[path.join(__dirname,'dev-ipfs-cleanup.cjs'),...args],{env:{...process.env,YBR_KUBO_RPC:'http://127.0.0.1:'+server.address().port},stdio:['pipe','pipe','pipe']});
  let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',reject);child.on('exit',code=>resolve({code,output}));child.stdin.end('DELETE IPFS deadbeef\n');
 });
 const apply=await run(['--apply']);assert.equal(apply.code,1);assert.match(apply.output,/interactive terminal/);assert.deepEqual(node.calls,[]);
 const preview=await run([]);assert.equal(preview.code,0);assert.match(preview.output,/PREVIEW ONLY/);assert.deepEqual(node.mutations,[]);
});
