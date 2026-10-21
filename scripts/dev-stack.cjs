'use strict';
/**
 * Single-command local YBR development stack.
 *
 * Reuses healthy services, deploys missing Ganache factory on chain 1337,
 * seeds ONLY the first-party generated audio fixture, and launches the
 * standalone Player alongside Vite, plus the local IPFS node and bridge.
 * Docker with Compose must be running unless IPFS is already healthy.
 * Never uploads Mint Studio files or keys automatically.
 *
 * Usage: npm run dev (repo root), or cd web && npm run dev.
 * Dashboard controls and plain-output mode: docs/DEV_DASHBOARD.md.
 */
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {setTimeout:sleep}=require('node:timers/promises');
const {ethers}=require('ethers');
const crypto=require('node:crypto');
const {ensureIpfs,IPFS_URL,probeIpfs}=require('./dev-ipfs.cjs');
const {DevDashboard,playerCredentials}=require('./dev-dashboard.cjs');

const ROOT=path.resolve(__dirname,'..');
const PLAYER=path.join(ROOT,'apps','ybr-player');
const WEB=path.join(ROOT,'web');
const FACTORY_FILE=path.join(ROOT,'.road-local','factory.json');
const RPC='http://127.0.0.1:8545';
const PLAYER_URL='http://127.0.0.1:4173';
const WEB_URL='http://127.0.0.1:5173';
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const ABI=['function implementation() view returns (address)'];
const OWNED=new Map();
let stopping=false,dashboard=null,healthTimer=null,healthBusy=false;
const log=message=>dashboard?dashboard.log('launcher',message):console.log(message);

function command(){return process.platform==='win32'?'npm.cmd':'npm';}
function spawnOwned(label,executable,args,{cwd=ROOT,env=process.env,stdio=dashboard?['ignore','pipe','pipe']:'inherit'}={}){
 if(stopping)throw Error('Startup cancelled.');
 const proc=spawn(executable,args,{cwd,env,stdio,detached:process.platform!=='win32'});
 dashboard?.attach(label,proc);
 OWNED.set(proc.pid, {label,proc});
 proc.once('exit',(code,signal)=>{
  OWNED.delete(proc.pid);
  if(!stopping&&['ganache','YBR Player','Road Explorer','YBR IPFS bridge'].includes(label))
   shutdown(label+' unexpectedly exited ('+(signal||code)+')',1);
 });
 proc.once('error',()=>OWNED.delete(proc.pid));
 return proc;
}
function stopOwned(){
 for(const {proc} of [...OWNED.values()].reverse()){
  if(proc.exitCode!==null)continue;
  try{
   if(process.platform!=='win32'&&proc.pid)process.kill(-proc.pid,'SIGTERM');
   else proc.kill('SIGTERM');
  }catch(e){if(e.code!=='ESRCH')log('Could not stop '+proc.pid+': '+e.message);}
 }
}
function shutdown(reason,code=0){
 if(stopping)return;
 stopping=true;
 clearInterval(healthTimer);
 log(reason+'. Stopping managed processes; persistent Kubo is left running.');
 dashboard?.close(reason+'. Persistent Kubo and its pins are left intact.');
 stopOwned();
 process.exitCode=code;
}
function run(label,cmd,args,opts={}){
 return new Promise((resolve,reject)=>{
  const proc=spawnOwned(label,cmd,args,opts);
  let settled=false;
  proc.once('error',e=>{if(!settled){settled=true;reject(Error(label+': '+e.message));}});
  proc.once('exit',(code,signal)=>{
   if(settled)return;
   settled=true;
   code===0?resolve():reject(Error(label+' exited with '+(signal||'code '+code)));
  });
 });
}
async function fetchJson(url,{timeout=1200,...options}={}){
 try{
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(timeout)});
  if(!response.ok)return null;
  return await response.json();
 }catch{return null;}
}
async function probeGanache(){
 const json=await fetchJson(RPC,{method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]})});
 if(!json)return {online:false};
 if(json.result!=='0x539')throw Error('Port 8545 is occupied by a non-YBR Ganache chain (expected ID 1337). Refusing deployment.');
 return {online:true,chainId:1337};
}
async function waitUntil(label,test,{timeoutMs=30000,intervalMs=350}={}){
 const deadline=Date.now()+timeoutMs;
 while(Date.now()<deadline&&!stopping){
  try{const result=await test();if(result)return result;}catch(e){if(e.fatal)throw e;}
  await sleep(intervalMs);
 }
 throw Error('Timed out waiting for '+label+' to become ready.');
}
function ensureDependencies(){
 const missing=[];
 if(!fs.existsSync(path.join(ROOT,'node_modules','hardhat')))missing.push('npm install (repository root)');
 if(!fs.existsSync(path.join(PLAYER,'node_modules','ethers')))missing.push('npm install (apps/ybr-player)');
 if(!fs.existsSync(path.join(WEB,'node_modules','vite')))missing.push('npm install (web)');
 if(missing.length)throw Error('Install dependencies first:\n  '+missing.join('\n  '));
}
function factoryFromFile(){
 try{
  const config=JSON.parse(fs.readFileSync(FACTORY_FILE,'utf8'));
  return config.chainId===1337&&ADDRESS.test(config.factoryAddress)?config.factoryAddress:null;
 }catch(e){if(e.code==='ENOENT')return null;throw e;}
}
async function validateFactory(provider,address){
 if(!ADDRESS.test(address||''))return false;
 try{
  if((await provider.getCode(address))==='0x')return false;
  const contract=new ethers.Contract(address,ABI,provider);
  const implementation=await contract.implementation();
  return ADDRESS.test(implementation)&&(await provider.getCode(implementation))!=='0x';
 }catch{return false;}
}
function fixtureDigest(){
 const bytes=fs.readFileSync(path.join(PLAYER,'media','golden-hour.wav'));
 return crypto.createHash('sha256').update(bytes).digest('hex');
}
async function ensureGanache(){
 const current=await probeGanache();
 if(current.online){
  log('Reusing running Ganache 1337 on '+RPC);
  return 'reused';
 }
 log('Starting local Ganache on '+RPC);
 const proc=spawnOwned('ganache',command(),['run','ganache'],{cwd:ROOT});
 proc.on('error',e=>shutdown('Ganache startup error: '+e.message,1));
 await waitUntil('Ganache 1337',async()=> (await probeGanache()).online,{timeoutMs:45000});
 return 'owned';
}
async function ensureFactory(){
 const provider=new ethers.providers.JsonRpcProvider(RPC,{name:'ganache-local',chainId:1337});
 const fromEnv=process.env.YBR_GANACHE_FACTORY||process.env.VITE_ROAD_GANACHE_FACTORY||'';
 const found=fromEnv||factoryFromFile();
 if(fromEnv && !(await validateFactory(provider,fromEnv))){
  throw Error('Configured factory '+fromEnv+' is not a compatible deployment on Ganache 1337. Fix YBR_GANACHE_FACTORY/VITE_ROAD_GANACHE_FACTORY.');
 }
 if(found && (await validateFactory(provider,found))){
  log('Reusing YellowBrickFactory '+found);
  return found;
 }
 if(found)log('Previous factory not present on this chain; deploying a fresh one.');
 log('Compiling the existing Yellow Brick contracts...');
 await run('Hardhat compile',command(),['run','compile']);
 log('Deploying the existing YellowBrickFactory to Ganache...');
 await run('Ganache factory deploy',command(),['run','ganache:deploy']);
 const deployed=factoryFromFile();
 if(!(await validateFactory(provider,deployed)))throw Error('Deployed factory could not be verified.');
 return deployed;
}
async function ensureDemoTrack(factoryAddress,env){
 if(process.env.YBR_STACK_NO_DEMO_MUSIC==='1'){
  log('Automatic synthetic fixture publication skipped (YBR_STACK_NO_DEMO_MUSIC=1).');
  return;
 }
 await run('Generate first-party synthetic demo audio',process.execPath,
  [path.join(PLAYER,'scripts','generate-demo-audio.js')],{cwd:PLAYER,env});
 const {makeGateway}=require('../apps/ybr-player/road-music');
 const gateway=makeGateway({factoryAddress});
 const catalog=await gateway.list();
 const hash=fixtureDigest();
 if(catalog.tracks.some(t=>t.creator==='The Amber Sessions' &&
  t.title==='Golden Hour — Road Release'&&t.media.sha256===hash)){
  log('Reusing already published synthetic Road audio Brick.');
  return;
 }
 log('Publishing our generated Golden Hour fixture to Ganache (not private user media)...');
 await run('Publish original demo music',process.execPath,
  [path.join(PLAYER,'scripts','publish-road-track.js'),'--publish',
   '--file',path.join(PLAYER,'media','golden-hour.wav'),'--title','Golden Hour — Road Release',
   '--artist','The Amber Sessions'],{cwd:PLAYER,env});
}
async function ensurePlayer(factoryAddress,env){
 const previous=await fetchJson(PLAYER_URL+'/road/api/status');
 if(previous){
  if(previous.ready!==true||previous.chainId!==1337||
   String(previous.factoryAddress).toLowerCase()!==factoryAddress.toLowerCase()){
   throw Error('Port 4173 has another Player instance using a different or unhealthy factory. Stop it before launching the integrated stack.');
  }
  log('Reusing existing YBR Player on '+PLAYER_URL);
  dashboard?.update({access:{source:'reused'}});
  return;
 }
 const credentials=playerCredentials(env);
 dashboard?.addSecrets(credentials.listener,credentials.artist);
 env={...env,YBR_LISTENER_PASSWORD:credentials.listener,YBR_ARTIST_PASSWORD:credentials.artist};
 dashboard?.update({access:{...credentials,source:'owned'}});
 log('Starting YBR Player on '+PLAYER_URL);
 const proc=spawnOwned('YBR Player',command(),['run','start'],{cwd:PLAYER,env});
 proc.on('error',e=>shutdown('Player startup error: '+e.message,1));
 await waitUntil('YBR Player',async()=>{
  const status=await fetchJson(PLAYER_URL+'/road/api/status');
  return status?.ready===true&&status?.factoryAddress?.toLowerCase()===factoryAddress.toLowerCase();
 },{timeoutMs:30000});
}
async function launchWeb(env){
 const existing=await fetch(WEB_URL,{signal:AbortSignal.timeout(900)}).then(r=>r.ok).catch(()=>false);
 if(existing)throw Error('Port 5173 already has a web server. Stop the old Vite process before starting the integrated stack.');
 log('Starting Road Explorer on '+WEB_URL);
 const proc=spawnOwned('Road Explorer',command(),['run','dev:web'],{cwd:WEB,env});
 proc.on('error',e=>shutdown('Vite startup error: '+e.message,1));
 await waitUntil('Road Explorer Vite',async()=>{
  const response=await fetch(WEB_URL,{signal:AbortSignal.timeout(1000)});
  return response.ok;
 },{timeoutMs:30000});
}
/** Read the live chain, never assume a reused node has our deterministic seed. */
async function refreshWallet(source){
 const provider=new ethers.providers.JsonRpcProvider({url:RPC,timeout:2500},{name:'ganache-local',chainId:1337});
 const [accounts,block]=await Promise.all([provider.listAccounts(),provider.getBlockNumber()]);
 const account=accounts[0];
 const balance=account?ethers.utils.formatEther(await provider.getBalance(account)):'--';
 const wallet={source,account,block,balance};
 const candidate=dashboard?.candidateMnemonic;
 if(source==='owned'&&candidate&&account){
  try{
   const derived=ethers.Wallet.fromMnemonic(candidate);
   if(derived.address.toLowerCase()===account.toLowerCase()){
    wallet.mnemonic=candidate;wallet.privateKey=derived.privateKey;
    dashboard.addSecrets(candidate,derived.privateKey);
   }else log('Ganache seed did not match account 0; refusing to display it.');
  }catch{log('Could not verify Ganache wallet seed; see the node configuration.');}
 }
 dashboard?.update({ganache:wallet});
}
async function refreshHealth(){
 if(stopping||healthBusy)return;
 healthBusy=true;
 try{
  const [ganache,player,ipfs,web]=await Promise.all([
   probeGanache().catch(()=>({online:false})),fetchJson(PLAYER_URL+'/road/api/status'),
   probeIpfs().catch(()=>({ready:false})),
   fetch(WEB_URL,{signal:AbortSignal.timeout(1500)}).then(r=>r.ok).catch(()=>false)]);
  if(stopping)return;
  dashboard.service('ganache',ganache.online?'UP':'DOWN');
  dashboard.service('player',player?.ready===true&&
   player?.factoryAddress?.toLowerCase()===dashboard.state.factory.toLowerCase()?'UP':'DOWN');
  dashboard.service('ipfs',ipfs.ready?'UP':'DOWN');
  dashboard.service('web',web?'UP':'DOWN');
  if(ganache.online)await refreshWallet(dashboard.state.ganache.source);
  if(stopping)return;
  dashboard.update({phase:Object.values(dashboard.state.services).every(s=>s==='UP')?'READY':'DEGRADED'});
 }catch(error){if(!stopping)log('Health refresh: '+error.message);}
 finally{healthBusy=false;}
}
async function main(){
 process.on('SIGINT',()=>shutdown('Received Ctrl+C'));
 process.on('SIGTERM',()=>shutdown('Received termination signal'));
 try{
  dashboard=new DevDashboard({root:ROOT,onQuit:()=>shutdown('Stopped from dashboard')});
  process.once('exit',()=>dashboard.close('Launcher exited'));
  dashboard.start();
  // Register env overrides before any child can echo them into captured output.
  dashboard.addSecrets(process.env.YBR_LISTENER_PASSWORD,process.env.YBR_ARTIST_PASSWORD);
  ensureDependencies();
  dashboard.update({phase:'STARTING IPFS',kuboRpc:process.env.YBR_KUBO_RPC});
  dashboard.service('ipfs','START');
  const ipfs=await ensureIpfs({run,spawnOwned,command,waitUntil,log,isStopping:()=>stopping});
  if(stopping)return;
  dashboard.service('ipfs','UP');dashboard.update({peerId:ipfs.peerId,phase:'STARTING GANACHE'});
  dashboard.service('ganache','START');
  const source=await ensureGanache();
  dashboard.service('ganache','UP');
  await refreshWallet(source);
  dashboard.update({phase:'VERIFYING FACTORY'});
  const factory=await ensureFactory();
  dashboard.update({factory,phase:'PREPARING DEMO MUSIC'});
  const env={...process.env,YBR_GANACHE_FACTORY:factory,VITE_ROAD_GANACHE_FACTORY:factory};
  await ensureDemoTrack(factory,env);
  dashboard.update({phase:'STARTING PLAYER'});dashboard.service('player','START');
  await ensurePlayer(factory,env);
  dashboard.service('player','UP');dashboard.update({phase:'STARTING EXPLORER'});
  dashboard.service('web','START');
  await launchWeb(env);
  if(stopping)return;
  dashboard.service('web','UP');
  // Verify storage through the exact proxy used by Mint Studio before READY.
  const proxied=await fetchJson(WEB_URL+'/api/road-ipfs/health',{timeout:6500});
  if(proxied?.ok!==true||proxied.peerId!==ipfs.peerId)throw Error('Mint Studio IPFS proxy did not reach the expected healthy Kubo node.');
  dashboard.ready();
  healthTimer=setInterval(()=>void refreshHealth(),4000);healthTimer.unref();
  await new Promise((resolve,reject)=>{
   for(const {label,proc} of OWNED.values()){
    if(proc.exitCode!==null||proc.signalCode!==null){reject(Error(label+' exited during startup'));break;}
    proc.on('exit',(code,signal)=>{
     if(stopping)return;
     reject(Error(label+' unexpectedly exited ('+(signal||code)+')'));
    });
   }
  });
 }catch(e){
  log(e.message);
  shutdown('Integrated launch failed: '+e.message,1);
 }
}
if(require.main===module){void main();}
module.exports={probeGanache,waitUntil,factoryFromFile,validateFactory,fixtureDigest};
