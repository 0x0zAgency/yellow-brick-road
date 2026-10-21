'use strict';
/** Local IPFS startup for dev-stack.cjs. Never removes pins or Docker volumes. */
const path=require('node:path');
const IPFS_URL='http://127.0.0.1:8791';
const IPFS_HEALTH=IPFS_URL+'/api/road-ipfs/health';
const fatal=message=>Object.assign(Error(message),{fatal:true});

async function probeIpfs({fetchImpl=fetch}={}){
 let response;
 try{
  response=await fetchImpl(IPFS_HEALTH,{
   cache:'no-store',redirect:'error',signal:AbortSignal.timeout(6500)
  });
 }catch{return {online:false,ready:false};}
 let info;
 try{info=await response.json();}
 catch{throw fatal('Port 8791 did not return a YBR IPFS health response. Stop the conflicting service and retry.');}
 if(response.status===503&&info?.ok===false&&
    typeof info.error==='string'&&info.error.startsWith('Kubo node unavailable:')){
  return {online:true,ready:false};
 }
 if(!response.ok||info?.ok!==true||info.provider!=='ybr-local-kubo'||
    typeof info.peerId!=='string'||!info.peerId.trim()){
  throw fatal('Port 8791 is not a healthy YBR IPFS bridge (HTTP '+response.status+'). Check the bridge terminal or stop the conflicting service.');
 }
 return {online:true,ready:true,peerId:info.peerId};
}

/** Use the launcher's process ownership and shutdown handling. A detached Kubo
 * container deliberately stays running on Ctrl+C; stop it with ipfs:down.
 * Existing bridge processes are never adopted or stopped by this launcher.
 */
async function ensureIpfs({run,spawnOwned,command,waitUntil,
 probe=probeIpfs,log=console.log,env=process.env,isStopping=()=>false}){
 let child=null,startupError=null;
 async function checkedProbe(){
  const checkChild=()=>{
   if(isStopping())throw fatal('IPFS startup cancelled.');
   if(startupError)throw fatal('IPFS bridge could not start: '+startupError.message);
   if(child&&(child.exitCode!==null||child.signalCode!==null))
    throw fatal('IPFS bridge exited before readiness. Check its terminal output and whether port 8791 is already occupied.');
  };
  checkChild();
  const status=await probe();
  checkChild();
  return status;
 }
 let status=await checkedProbe();
 if(!status.online){
  log('[YBR] Starting local IPFS bridge on '+IPFS_URL);
  child=spawnOwned('YBR IPFS bridge',process.execPath,[path.join(__dirname,'..','web','scripts','ipfs-bridge.mjs')]);
  child.once('error',error=>{startupError=error;});
  status=await waitUntil('YBR IPFS bridge',async()=>{
   const next=await checkedProbe();
   return next.online&&next;
  },{timeoutMs:20000});
 }else{
  log('[YBR] Reusing running YBR IPFS bridge on '+IPFS_URL);
 }
 if(!status.ready){
  // A custom local node may have its own storage. Do not silently substitute
  // the default Compose node if that explicitly configured node is down.
  if(env.YBR_KUBO_RPC){
   throw Error('The configured YBR_KUBO_RPC node is unavailable. Start that node, or unset YBR_KUBO_RPC to use the default Docker Compose node.');
  }
  log('[YBR] Starting persistent Kubo with npm run ipfs:up (existing volumes are retained)...');
  try{await run('YBR IPFS node',command(),['run','ipfs:up']);}
  catch(error){
   throw Error('Could not start the local IPFS node. Install Docker with Compose and start Docker Desktop/the Docker daemon, then retry npm run dev. '+error.message);
  }
  status=await waitUntil('Kubo through the YBR IPFS bridge (check Docker and npm run ipfs:status)',async()=>{
   const next=await checkedProbe();
   return next.ready&&next;
  },{timeoutMs:60000});
 }
 log('[YBR] IPFS storage ready on '+IPFS_URL);
 return status;
}
module.exports={IPFS_URL,IPFS_HEALTH,probeIpfs,ensureIpfs};
