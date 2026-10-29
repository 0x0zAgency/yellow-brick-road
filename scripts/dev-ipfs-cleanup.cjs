'use strict';
/** Explicit local Kubo maintenance. Never deletes a repo, volume, key or chain DB. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),MAX_REPLY=4*1024*1024,MAX_ITEMS=10000;
const identifier=value=>typeof value==='string'&&/^[a-zA-Z0-9]{20,200}$/.test(value);
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function checkedRpc(value='http://127.0.0.1:5001'){
 const url=new URL(value);
 if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('IPFS cleanup requires an HTTP loopback Kubo API without credentials or a path.');
 return url.origin;
}
function count(value,label){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw Error('Invalid Kubo '+label+'.');return value;}
function stats(value){return {repoBytes:count(value?.RepoSize??value?.SizeStat?.RepoSize,'repository size'),objects:count(value?.NumObjects,'object count')};}
function pins(value,type){
 // Kubo 0.43 omits Keys entirely for an empty result; older releases use null/{}.
 if(value&&typeof value==='object'&&!Array.isArray(value)&&(Object.keys(value).length===0||value.Keys===null))return [];
 if(!value?.Keys||typeof value.Keys!=='object'||Array.isArray(value.Keys))throw Error('Kubo did not return a complete pin inventory.');
 const entries=Object.entries(value.Keys);if(entries.length>MAX_ITEMS)throw Error('Pin inventory exceeds the cleanup limit.');
 return entries.map(([cid,info])=>{if(!identifier(cid)||info?.Type!==type)throw Error('Unexpected pin in cleanup inventory.');return {cid,type};});
}
function entries(value){
 const items=value?.Entries===null?[]:value?.Entries;
 if(!Array.isArray(items)||items.length>MAX_ITEMS)throw Error('Kubo did not return a complete file inventory.');
 const result=items.map(item=>{
  if(typeof item?.Name!=='string'||!item.Name||Buffer.byteLength(item.Name)>1024||/[\/\x00-\x1f\x7f]/.test(item.Name)||['.','..'].includes(item.Name)||!identifier(item.Hash)||![0,1].includes(item.Type))throw Error('Unsafe or unsupported IPFS Desktop file entry.');
  return {name:item.Name,hash:item.Hash,type:item.Type};
 }).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
 if(new Set(result.map(e=>e.name)).size!==result.length)throw Error('Duplicate IPFS Desktop file entry.');return result;
}
async function bounded(response,max=MAX_REPLY){
 const chunks=[];let size=0;
 if(!response.body)return Buffer.alloc(0);
 const reader=response.body.getReader();
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw Error('Kubo response exceeds the cleanup limit.');chunks.push(value);}return Buffer.concat(chunks,size);}
 catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
}
function privateDirectory(dir){
 fs.mkdirSync(dir,{recursive:true,mode:0o700});const st=fs.lstatSync(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||process.getuid&&st.uid!==process.getuid())throw Error('Unsafe cleanup report directory.');
 fs.chmodSync(dir,0o700);
}
function createIpfsCleanup({root=ROOT,rpc=process.env.YBR_KUBO_RPC||'http://127.0.0.1:5001',fetchImpl=fetch,now=Date.now,expectedPeer=null}={}){
 rpc=checkedRpc(rpc);const prepared=new WeakSet();let running=false;
 async function request(command,args={},timeout=30000){
  const query=new URLSearchParams(args);
  let res;try{res=await fetchImpl(rpc+'/api/v0/'+command+(query.size?'?'+query:''),{method:'POST',redirect:'error',signal:AbortSignal.timeout(timeout),headers:{'Accept-Encoding':'identity'}});}
  catch{throw Error('Local Kubo '+command+' could not be reached or timed out. Inspect the node before retrying.');}
  if(!res.ok){await res.body?.cancel().catch(()=>{});throw Error('Local Kubo '+command+' failed (HTTP '+res.status+').');}return res;
 }
 async function json(command,args){const raw=await bounded(await request(command,args));try{return JSON.parse(raw);}catch{throw Error('Invalid Kubo '+command+' response.');}}
 async function peer(){const result=await json('id');if(!identifier(result?.ID))throw Error('Invalid Kubo peer identity.');if(expectedPeer&&result.ID!==expectedPeer)throw Error('Kubo does not match the node used by Dev Control. Cleanup is blocked.');return result.ID;}
 async function scan(mode='all'){
  if(!['all','cache'].includes(mode))throw Error('Choose all files or unpinned cache.');
  const peerId=await peer(),before=await json('files/stat',{arg:'/'});
  const [recursive,direct,files,usage]=await Promise.all([json('pin/ls',{type:'recursive'}),json('pin/ls',{type:'direct'}),json('files/ls',{arg:'/',long:'true'}),json('repo/stat')]);
  const after=await json('files/stat',{arg:'/'});
  if(!identifier(before.Hash)||before.Hash!==after.Hash||peerId!==await peer())throw Error('IPFS changed during review. Pause uploads and scan again.');
  const roots=[...pins(recursive,'recursive'),...pins(direct,'direct')].sort((a,b)=>a.cid<b.cid?-1:a.cid>b.cid?1:0);
  if(roots.length>MAX_ITEMS||new Set(roots.map(p=>p.cid)).size!==roots.length)throw Error('Ambiguous or oversized pin inventory.');
  const inventory={rpc,peerId,pins:roots,mfsRoot:after.Hash,files:entries(files)};
  const plan={format:'ybr-ipfs-cleanup-review/1',mode,...inventory,...stats(usage),reviewedAt:now(),fingerprint:digest(inventory)};
  plan.confirmation=mode==='all'?'DELETE IPFS '+peerId.slice(-8):'CLEAN CACHE '+peerId.slice(-8);
  for(const item of [...plan.pins,...plan.files])Object.freeze(item);
  Object.freeze(plan.pins);Object.freeze(plan.files);Object.freeze(plan);prepared.add(plan);return plan;
 }
 async function collect(onProgress){
  const res=await request('repo/gc',{'stream-errors':'true'},10*60*1000);
  if(!res.body)throw Error('Kubo garbage collection returned no stream.');
  const reader=res.body.getReader(),decoder=new TextDecoder();let pending='',removed=0;
  function line(value){
   if(!value.trim())return;let item;try{item=JSON.parse(value);}catch{throw Error('Invalid Kubo garbage-collection response.');}
   if(item.Error||item.Err)throw Error('Kubo reported a garbage-collection error. Some data may already be removed.');
   if(identifier(item.Key?.['/'])){removed++;onProgress({stage:'gc',removedBlocks:removed});}
   else throw Error('Unexpected Kubo garbage-collection record.');
  }
  try{for(;;){const {done,value}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});let index;while((index=pending.indexOf('\n'))!==-1){line(pending.slice(0,index));pending=pending.slice(index+1);}if(pending.length>8192)throw Error('Oversized Kubo garbage-collection record.');}pending+=decoder.decode();line(pending);return removed;}
  catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 }
 async function apply(plan,confirmation,{onProgress=()=>{}}={}){
  if(!prepared.has(plan)||confirmation!==plan.confirmation)throw Error('Review this node and type its exact cleanup confirmation first.');
  if(now()-plan.reviewedAt>10*60*1000)throw Error('Cleanup review expired. Scan again.');
  if(running)throw Error('IPFS cleanup is already running.');running=true;
  let lock,reportFile,failure,result={status:'not-started',mode:plan.mode,unpinned:0,removedFiles:0,removedBlocks:0};
  const notify=progress=>{try{onProgress(progress);}catch{/* UI failures cannot interrupt cleanup or report finalization. */}};
  const dir=path.join(root,'.road-local','ipfs-cleanup');
  try{
   // Write the report and acquire an exclusive lock before the first mutation.
   privateDirectory(path.join(root,'.road-local'));privateDirectory(dir);
   const lockPath=path.join(dir,'active.lock');
   try{const fd=fs.openSync(lockPath,'wx',0o600);lock=lockPath;try{fs.writeFileSync(fd,String(process.pid)+'\n');}finally{fs.closeSync(fd);}}catch{throw Error('Another cleanup is running, or an interrupted cleanup left active.lock. Inspect it before retrying.');}
   notify({stage:'checking'});
   const fresh=await scan(plan.mode);if(fresh.fingerprint!==plan.fingerprint)throw Error('Pins, files or node identity changed since review. Nothing was deleted. Scan again.');
   reportFile=path.join(dir,new Date(now()).toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(4).toString('hex')+'.json');
   // A killed process must never leave a report claiming nothing was started.
   const report={review:plan,result:{...result,status:'incomplete',warning:'Cleanup may be running or interrupted. Inspect the node before retrying.'}};
   fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
   result.status='running';
   if(plan.mode==='all'){
    for(const file of plan.files){
     if(await peer()!==plan.peerId)throw Error('Kubo identity changed. Cleanup stopped.');
     const current=await json('files/stat',{arg:'/'+file.name});if(current.Hash!==file.hash)throw Error('An IPFS Desktop file changed after review. Cleanup stopped.');
     await bounded(await request('files/rm',{arg:'/'+file.name,recursive:'true'}));result.removedFiles++;
     notify({stage:'files',removedFiles:result.removedFiles,totalFiles:plan.files.length});
    }
    for(const pin of plan.pins){
     if(await peer()!==plan.peerId)throw Error('Kubo identity changed. Cleanup stopped.');
     const removed=await json('pin/rm',{arg:pin.cid,recursive:pin.type==='recursive'?'true':'false'});
     if(!Array.isArray(removed.Pins)||!removed.Pins.includes(pin.cid))throw Error('Kubo did not confirm removing the reviewed pin. Cleanup stopped.');
     result.unpinned++;notify({stage:'pins',unpinned:result.unpinned,totalPins:plan.pins.length});
    }
    const remaining=await scan('all');if(remaining.peerId!==plan.peerId||remaining.pins.length||remaining.files.length)throw Error('New or remaining files were detected. Garbage collection was not started. Review again.');
   }
   if(await peer()!==plan.peerId)throw Error('Kubo identity changed. Cleanup stopped.');
   notify({stage:'gc',removedBlocks:0});result.removedBlocks=await collect(progress=>{result.removedBlocks=progress.removedBlocks;if(progress.removedBlocks%100===0)notify(progress);});
   const after=await scan(plan.mode);if(after.peerId!==plan.peerId)throw Error('Kubo identity changed before verification.');
   result={...result,status:plan.mode==='all'&&(after.pins.length||after.files.length)?'new-files-remain':'complete',
    beforeBytes:plan.repoBytes,afterBytes:after.repoBytes,reclaimedBytes:Math.max(0,plan.repoBytes-after.repoBytes),remainingPins:after.pins.length,remainingFiles:after.files.length};
  }catch(error){failure=error;result={...result,status:result.status==='running'?'partial-failure':'not-started',error:error.message};}
  finally{
   prepared.delete(plan);running=false;
   if(reportFile){try{const temp=reportFile+'.tmp';fs.writeFileSync(temp,JSON.stringify({review:plan,result},null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(temp,reportFile);}catch{result.warning='Could not finalize the cleanup report. Inspect the node before retrying.';}}
   if(lock){try{fs.unlinkSync(lock);}catch{result.warning=(result.warning||'')+' Could not release active.lock. Inspect it before retrying.';}}
  }
  if(failure)throw Object.assign(Error(failure.message+(reportFile?' Review the cleanup report before retrying.':'')),{result:{...result,reportFile}});
  return {...result,reportFile};
 }
 return {scan,apply,rpc};
}
const bytes=n=>(n/1024/1024).toFixed(1)+' MiB';
function summary(plan){return [
 'IPFS CLEANUP / '+(plan.mode==='all'?'ALL LOCAL FILES':'UNPINNED CACHE ONLY'),
 'Kubo: '+plan.rpc,'Peer: '+plan.peerId,
 'Pinned roots: '+plan.pins.length+' | IPFS Desktop top-level entries: '+plan.files.length,
 'Repository: '+bytes(plan.repoBytes)+' | Blocks: '+plan.objects,
 ...(plan.mode==='all'?['Removes ALL local pins and IPFS Desktop files, then runs garbage collection.','Includes files from other apps and every wallet/network profile on this node.','NFT images and encrypted recovery may stop working. This cannot be undone.']:['Runs garbage collection only. Pinned and IPFS Desktop files are retained.']),
 'Pause uploads and IPFS Desktop edits first. Close artwork views to avoid refetching.',
 'Keeps Ganache, wallet keys, local originals, Player copies and Playable Covers.',
 'Other peers and remote pinning services are not cleared. The report is not a backup.'
 ];}
async function main(args=process.argv.slice(2)){
 if(args.some(a=>!['--apply','--cache-only','--help'].includes(a)))throw Error('Use npm run ipfs:clean -- [--cache-only] [--apply].');
 if(args.includes('--help')){console.log('npm run ipfs:clean: read-only preview. Add --apply for an interactive confirmation; --cache-only retains pins and Desktop files.');return;}
 if(args.includes('--apply')&&(!process.stdin.isTTY||!process.stdout.isTTY))throw Error('Deletion requires an interactive terminal. Run without --apply for a read-only preview.');
 const cleaner=createIpfsCleanup(),plan=await cleaner.scan(args.includes('--cache-only')?'cache':'all');console.log(summary(plan).join('\n'));
 if(!args.includes('--apply')){console.log('\nPREVIEW ONLY. Nothing was removed. Add --apply to review and confirm deletion.');return;}
 const reader=require('node:readline/promises').createInterface({input:process.stdin,output:process.stdout});
 let answer;try{answer=await reader.question('\nType '+plan.confirmation+' to continue: ');}finally{reader.close();}
 if(answer!==plan.confirmation){console.log('Canceled. Nothing was removed.');return;}
 const result=await cleaner.apply(plan,answer,{onProgress:p=>{if(p.stage==='gc')process.stdout.write('Collecting unpinned blocks: '+p.removedBlocks+'\r');}});
 console.log('\n'+result.status+': '+result.unpinned+' pins removed; '+result.removedFiles+' Desktop entries removed; '+result.removedBlocks+' blocks collected; '+bytes(result.reclaimedBytes)+' reclaimed.\nReport: '+result.reportFile);
 if(result.warning)console.error(result.warning);
 if(result.status!=='complete'||result.warning)process.exitCode=1;
}
if(require.main===module)main().catch(error=>{console.error(error.message);if(error.result?.reportFile)console.error('Report: '+error.result.reportFile);if(error.result?.warning)console.error(error.result.warning);process.exitCode=1;});
module.exports={createIpfsCleanup,checkedRpc,summary,bytes,main};
