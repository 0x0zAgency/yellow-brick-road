'use strict';
/** Local development credentials only. No HTTP secret-discovery endpoint. */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const PLAYER_URL=require('./dev-https.cjs').localUrls().player;
const accessFile=root=>path.join(root,'.road-local','player-access.json');
const valid=c=>c&&['listener','artist'].every(k=>typeof c[k]==='string'&&c[k].length>0&&Buffer.byteLength(c[k])<=1024);
function privatePath(target,directory=false){
 const st=fs.lstatSync(target);
 if(st.isSymbolicLink()||!(directory?st.isDirectory():st.isFile()))throw Error('Player access storage must be a regular private '+(directory?'directory.':'file.'));
 if(process.getuid&&(st.uid!==process.getuid()||(st.mode&0o077)!==0))
  throw Error('Player access storage must belong to you with '+(directory?'700':'600')+' permissions: '+target);
 return st;
}
function readPlayerAccess(root){
 const file=accessFile(root);
 try{
  const st=privatePath(file);
  privatePath(path.dirname(file),true);
  if(st.size>8192)throw Error('Player access file is too large.');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  let payload;
  try{
   const text=fs.readFileSync(fd,'utf8');
   try{payload=JSON.parse(text);}catch{throw Error('Invalid local Player access file.');}
  }finally{fs.closeSync(fd);}
  if(payload?.version!==1||!valid(payload.accounts))throw Error('Invalid local Player access file.');
  return {listener:payload.accounts.listener,artist:payload.accounts.artist};
 }catch(error){if(error.code==='ENOENT')return null;throw error;}
}
function selectPlayerAccess(root,env=process.env,{generate=true}={}){
 ensureStorage(root);
 const saved=readPlayerAccess(root)||{};
 const accounts={};
 for(const name of ['listener','artist']){
  accounts[name]=env['YBR_'+name.toUpperCase()+'_PASSWORD']||saved[name]||
   (generate?crypto.randomBytes(12).toString('base64url'):null);
 }
 if(!valid(accounts)){if(!generate)return null;throw Error('Local Player passwords must be 1 to 1024 bytes.');}
 return accounts;
}
function ensureStorage(root){
 const dir=path.dirname(accessFile(root));
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const st=fs.lstatSync(dir);
 if(st.isSymbolicLink()||!st.isDirectory()||process.getuid&&st.uid!==process.getuid())throw Error('Unsafe local Player access directory.');
 fs.chmodSync(dir,0o700);
}
function savePlayerAccess(root,accounts){
 if(!valid(accounts))throw Error('Invalid local Player credentials.');
 const file=accessFile(root),dir=path.dirname(file);
 ensureStorage(root);
 privatePath(dir,true);
 try{privatePath(file);}catch(error){if(error.code!=='ENOENT')throw error;}
 const tmp=file+'.'+process.pid+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';
 let fd;
 try{
  fd=fs.openSync(tmp,'wx',0o600);
  fs.writeFileSync(fd,JSON.stringify({version:1,accounts:{listener:accounts.listener,artist:accounts.artist}})+'\n');
  fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
  fs.renameSync(tmp,file);
 }finally{
  if(fd!==undefined)fs.closeSync(fd);
  fs.rmSync(tmp,{force:true});
 }
}
async function verifyPlayerAccess(accounts,{fetchImpl=fetch}={}){
 if(!valid(accounts))return false;
 for(const username of ['listener','artist']){
  try{
   const res=await fetchImpl(PLAYER_URL+'/api/session',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(2500),
    headers:{'Content-Type':'application/json',Origin:PLAYER_URL},
    body:JSON.stringify({username,password:accounts[username]})
   });
   if(!res.ok){await res.body?.cancel();return false;}
   const session=await res.json();
   const cookie=res.headers.get('set-cookie')?.split(';')[0];
   if(cookie)await fetchImpl(PLAYER_URL+'/api/logout',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(2500),
    headers:{Cookie:cookie,Origin:PLAYER_URL}
   }).then(r=>r.body?.cancel()).catch(()=>{});
   if(session.authenticated!==true||session.user!==username)return false;
  }catch{return false;}
 }
 return true;
}
function isCheckoutPlayer({cwd,command,uid},root){
 if(process.getuid&&Number(uid)!==process.getuid())return false;
 const player=path.join(root,'apps','ybr-player');
 if(cwd!==player)return false;
 return ['server.js',path.join(player,'server.js'),'../../scripts/dev-player.cjs',path.join(root,'scripts','dev-player.cjs')]
  .some(script=>command.endsWith(' '+script)&&path.basename(command.slice(0,-script.length-1))==='node');
}
/** Explicit opt-in only: never kill an arbitrary listener or another checkout. */
async function restartCheckoutPlayer(root,{run=exec,kill=process.kill.bind(process),sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 if(process.platform==='win32')throw Error('Stop the old Player once, then start npm run dev. Automatic local Player restart requires macOS or Linux with lsof.');
 const pids=async()=>{
  try{
   const {stdout}=await run('lsof',['-nP','-iTCP:4173','-sTCP:LISTEN','-t'],{timeout:3000,maxBuffer:8192});
   return [...new Set(stdout.trim().split(/\s+/).filter(v=>/^\d+$/.test(v)).map(Number))];
  }catch(error){if(error.code===1&&!error.stdout?.trim())return [];throw Error('Cannot inspect the local Player. Install lsof or stop the old Player once.');}
 };
 const found=await pids();
 if(found.length===0)return;
 if(found.length!==1)throw Error('More than one process owns port 4173. Refusing automatic restart.');
 const pid=found[0];
 const inspect=async()=>{
  const [dir,cmd,owner]=await Promise.all([
   run('lsof',['-a','-p',String(pid),'-d','cwd','-Fn'],{timeout:3000,maxBuffer:8192}),
   run('ps',['-p',String(pid),'-o','args='],{timeout:3000,maxBuffer:8192}),
   run('ps',['-p',String(pid),'-o','uid='],{timeout:3000,maxBuffer:8192})]);
  return {cwd:dir.stdout.split('\n').find(l=>l.startsWith('n'))?.slice(1),command:cmd.stdout.trim(),uid:owner.stdout.trim()};
 };
 // Recheck immediately before SIGTERM to minimize PID-reuse races.
 if(!isCheckoutPlayer(await inspect(),root)||!isCheckoutPlayer(await inspect(),root))
  throw Error('Port 4173 is not a Player owned by your user in this exact checkout. It was not stopped.');
 try{kill(pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}
 for(let i=0;i<30;i++){if(!(await pids()).includes(pid))return;await sleep(200);}
 throw Error('The old Player did not stop after SIGTERM. No force-kill was attempted.');
}
module.exports={accessFile,readPlayerAccess,selectPlayerAccess,savePlayerAccess,verifyPlayerAccess,isCheckoutPlayer,restartCheckoutPlayer};
