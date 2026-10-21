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
 */
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {setTimeout:sleep}=require('node:timers/promises');
const {ethers}=require('ethers');
const crypto=require('node:crypto');
const {ensureIpfs,IPFS_URL}=require('./dev-ipfs.cjs');

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
let stopping=false;

function command(){return process.platform==='win32'?'npm.cmd':'npm';}
function spawnOwned(label,executable,args,{cwd=ROOT,env=process.env,stdio='inherit'}={}){
 const proc=spawn(executable,args,{cwd,env,stdio,detached:process.platform!=='win32'});
 OWNED.set(proc.pid, {label,proc});
 proc.once('exit',()=>OWNED.delete(proc.pid));
 proc.once('error',()=>OWNED.delete(proc.pid));
 return proc;
}
function stopOwned(){
 for(const {proc} of [...OWNED.values()].reverse()){
  if(proc.exitCode!==null)continue;
  try{
   if(process.platform!=='win32'&&proc.pid)process.kill(-proc.pid,'SIGTERM');
   else proc.kill('SIGTERM');
  }catch(e){if(e.code!=='ESRCH')console.error('Could not stop '+proc.pid+': '+e.message);}
 }
}
function shutdown(reason,code=0){
 if(stopping)return;
 stopping=true;
 console.log('\n[YBR] '+reason+'. Stopping managed processes; persistent Kubo is left running.');
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
  console.log('[YBR] Reusing running Ganache 1337 on '+RPC);
  return;
 }
 console.log('[YBR] Starting local Ganache on '+RPC);
 const proc=spawnOwned('ganache',command(),['run','ganache'],{cwd:ROOT});
 proc.on('error',e=>shutdown('Ganache startup error: '+e.message,1));
 await waitUntil('Ganache 1337',async()=> (await probeGanache()).online,{timeoutMs:45000});
}
async function ensureFactory(){
 const provider=new ethers.providers.JsonRpcProvider(RPC,{name:'ganache-local',chainId:1337});
 const fromEnv=process.env.YBR_GANACHE_FACTORY||process.env.VITE_ROAD_GANACHE_FACTORY||'';
 const found=fromEnv||factoryFromFile();
 if(fromEnv && !(await validateFactory(provider,fromEnv))){
  throw Error('Configured factory '+fromEnv+' is not a compatible deployment on Ganache 1337. Fix YBR_GANACHE_FACTORY/VITE_ROAD_GANACHE_FACTORY.');
 }
 if(found && (await validateFactory(provider,found))){
  console.log('[YBR] Reusing YellowBrickFactory '+found);
  return found;
 }
 if(found)console.log('[YBR] Previous factory not present on this chain; deploying a fresh one.');
 console.log('[YBR] Compiling the existing Yellow Brick contracts...');
 await run('Hardhat compile',command(),['run','compile']);
 console.log('[YBR] Deploying the existing YellowBrickFactory to Ganache...');
 await run('Ganache factory deploy',command(),['run','ganache:deploy']);
 const deployed=factoryFromFile();
 if(!(await validateFactory(provider,deployed)))throw Error('Deployed factory could not be verified.');
 return deployed;
}
async function ensureDemoTrack(factoryAddress,env){
 if(process.env.YBR_STACK_NO_DEMO_MUSIC==='1'){
  console.log('[YBR] Automatic synthetic fixture publication skipped (YBR_STACK_NO_DEMO_MUSIC=1).');
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
  console.log('[YBR] Reusing already published synthetic Road audio Brick.');
  return;
 }
 console.log('[YBR] Publishing our generated Golden Hour fixture to Ganache (not private user media)...');
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
  console.log('[YBR] Reusing existing YBR Player on '+PLAYER_URL);
  return;
 }
 console.log('[YBR] Starting YBR Player on '+PLAYER_URL);
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
 console.log('[YBR] Starting Road Explorer on '+WEB_URL);
 const proc=spawnOwned('Road Explorer',command(),['run','dev:web'],{cwd:WEB,env});
 proc.on('error',e=>shutdown('Vite startup error: '+e.message,1));
 await waitUntil('Road Explorer Vite',async()=>{
  const response=await fetch(WEB_URL,{signal:AbortSignal.timeout(1000)});
  return response.ok;
 },{timeoutMs:30000});
}
async function main(){
 ensureDependencies();
 process.on('SIGINT',()=>shutdown('Received Ctrl+C'));
 process.on('SIGTERM',()=>shutdown('Received termination signal'));
 try{
  await ensureIpfs({run,spawnOwned,command,waitUntil,isStopping:()=>stopping});
  if(stopping)return;
  await ensureGanache();
  const factory=await ensureFactory();
  const env={...process.env,YBR_GANACHE_FACTORY:factory,VITE_ROAD_GANACHE_FACTORY:factory};
  await ensureDemoTrack(factory,env);
  await ensurePlayer(factory,env);
  await launchWeb(env);
  console.log('\n[YBR] INTEGRATED ROAD READY');
  console.log('[YBR] Road Explorer  '+WEB_URL);
  console.log('[YBR] YBR Player     '+PLAYER_URL);
  console.log('[YBR] IPFS storage   '+IPFS_URL+' (healthy, encrypted-content bridge)');
  console.log('[YBR] Public Music   '+WEB_URL+'/road/api/music');
  console.log('[YBR] Factory        '+factory+' (local Ganache 1337)');
  console.log('[YBR] Synthetic-fixture access is local only. No user media or private IPFS content is published.');
  console.log('[YBR] Ctrl+C stops managed processes, including a bridge started here. Existing services and persistent Kubo are left running.');
  console.log('[YBR] To stop Kubo separately without deleting pins: npm run ipfs:down.\n');
  // Keep parent alive to manage child processes and their exit status.
  await new Promise((resolve,reject)=>{
   for(const {label,proc} of OWNED.values()){
    proc.on('exit',(code,signal)=>{
     if(stopping)return;
     reject(Error(label+' unexpectedly exited ('+(signal||code)+')'));
    });
   }
  });
 }catch(e){
  console.error('[YBR] '+e.message);
  shutdown('Integrated launch failed',1);
 }
}
if(require.main===module){void main();}
module.exports={probeGanache,waitUntil,factoryFromFile,validateFactory,fixtureDigest};
