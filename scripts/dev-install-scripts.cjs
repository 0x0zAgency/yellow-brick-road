'use strict';
/** Project-local npm approval preflight. Never changes global npm policy. */
const fs=require('node:fs');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const projectDirs=root=>[root,path.join(root,'web'),path.join(root,'apps','ybr-player')];

function approvalArgs(help){
 const has=name=>new RegExp('(?:^|[\\s,])'+name+'(?=[\\s,]|$)').test(help);
 if(has('install-scripts'))return ['install-scripts','approve','--all'];
 // Earlier npm releases expose only the equivalent standalone command.
 if(has('approve-scripts'))return ['approve-scripts','--all'];
 throw Error('The selected npm does not support install-script approvals. Update npm for Node 24, then retry npm run setup:dev. No services were started.');
}
async function npmHelp(npm,options,capture=exec){
 try{return String((await capture(npm,['--help'],options)).stdout);}
 catch(error){
  // npm's general usage screen intentionally exits 1 even for --help.
  // Accept only that complete usage response, not config/spawn/timeout errors.
  const text=String(error.stdout||'');
  if(error.code===1&&!error.killed&&!error.signal&&/^\s*npm <command>/.test(text)&&
     /\bAll commands:/.test(text)&&!/npm (?:ERR!|error)/i.test(String(error.stderr||'')))return text;
  throw error;
 }
}
function readPolicy(cwd){
 let pkg;
 try{pkg=JSON.parse(fs.readFileSync(path.join(cwd,'package.json'),'utf8'));}
 catch{throw Error('Cannot read package.json for install-script approval in '+cwd);}
 const policy=pkg.allowScripts===undefined?{}:pkg.allowScripts;
 if(!policy||typeof policy!=='object'||Array.isArray(policy))throw Error('Invalid allowScripts policy in '+cwd);
 return policy;
}
const policyKey=policy=>JSON.stringify(Object.entries(policy).sort(([a],[b])=>a.localeCompare(b)));

async function prepareInstallScripts({root,run,setup=false,env=process.env,
 npm=process.platform==='win32'?'npm.cmd':'npm',capture=exec,log=console.log}){
 if(typeof run!=='function')throw TypeError('An npm process runner is required.');
 const dirs=projectDirs(root);
 // Fail before partial approval when a checkout has not been installed yet.
 for(const cwd of dirs){
  readPolicy(cwd);
  if(!setup&&!fs.existsSync(path.join(cwd,'node_modules')))
   throw Error('Dependencies are missing in '+cwd+'. Run npm run setup:dev first.');
 }
 const help=await npmHelp(npm,{cwd:root,env,timeout:10000,maxBuffer:1024*1024},capture);
 const approve=approvalArgs(help);
 log('[YBR] Approving installed dependency scripts for root, web and Player. This permits dependency code to run; existing denials stay in place.');
 async function checked(args,cwd){
  const code=await run(npm,args,{cwd,env});
  if(code!==0)throw Object.assign(Error('npm '+args.join(' ')+' failed in '+cwd+' (exit '+code+'). Startup stopped.'),{exitCode:code});
 }
 for(const cwd of dirs){
  const label=path.relative(root,cwd)||'root';
  if(setup)await checked(['install'],cwd);
  const before=readPolicy(cwd);
  log('[YBR] '+label+': npm '+approve.join(' '));
  await checked(approve,cwd);
  const after=readPolicy(cwd);
  for(const [key,value] of Object.entries(before)){
   if(value===false&&after[key]!==false)throw Error('npm changed an explicit install-script denial in '+label+'. Refusing to rebuild or start services.');
  }
  // Approval records policy; it does not build a previously blocked native addon.
  // Setup always rebuilds. Ordinary startup rebuilds only after policy changes.
  if(setup||policyKey(before)!==policyKey(after)){
   log('[YBR] '+label+': rebuilding dependencies with the approved npm policy');
   await checked(['rebuild'],cwd);
  }
 }
}
module.exports={approvalArgs,npmHelp,readPolicy,projectDirs,prepareInstallScripts};
