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
function readPackage(cwd){
 try{return JSON.parse(fs.readFileSync(path.join(cwd,'package.json'),'utf8'));}
 catch{throw Error('Cannot read package.json for dependency checks in '+cwd);}
}
function readPolicy(cwd){
 const pkg=readPackage(cwd);
 const policy=pkg.allowScripts===undefined?{}:pkg.allowScripts;
 if(!policy||typeof policy!=='object'||Array.isArray(policy))throw Error('Invalid allowScripts policy in '+cwd);
 return policy;
}
const policyKey=policy=>JSON.stringify(Object.entries(policy).sort(([a],[b])=>a.localeCompare(b)));

// An existing node_modules directory may predate a pull that added dependencies.
// Read manifests directly: some packages deliberately do not export package.json.
function missingDependencies(cwd){
 const pkg=readPackage(cwd);
 return Object.keys({...pkg.dependencies,...pkg.devDependencies}).filter(name=>{
  if(Object.hasOwn(pkg.optionalDependencies||{},name))return false;
  try{
   const installed=JSON.parse(fs.readFileSync(path.join(cwd,'node_modules',name,'package.json'),'utf8'));
   return typeof installed.version!=='string'||!installed.version;
  }catch{return true;}
 });
}

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
  const before=readPolicy(cwd);
  const missing=missingDependencies(cwd),install=setup||missing.length>0;
  if(install){
   if(!setup)log('[YBR] '+label+': installing missing dependencies: '+missing.join(', '));
   await checked(['install'],cwd);
   const remaining=missingDependencies(cwd);
   if(remaining.length)throw Error('Dependencies are still missing in '+label+': '+remaining.join(', ')+'. Run npm run setup:dev. Startup stopped.');
  }
  log('[YBR] '+label+': npm '+approve.join(' '));
  await checked(approve,cwd);
  const after=readPolicy(cwd);
  for(const [key,value] of Object.entries(before)){
   if(value===false&&after[key]!==false)throw Error('npm changed an explicit install-script denial in '+label+'. Refusing to rebuild or start services.');
  }
  // Approval records policy; it does not build a previously blocked native addon.
  // Rebuild after an install or policy change so repaired native addons are ready.
  if(install||policyKey(before)!==policyKey(after)){
   log('[YBR] '+label+': rebuilding dependencies with the approved npm policy');
   await checked(['rebuild'],cwd);
  }
 }
}
module.exports={approvalArgs,npmHelp,readPolicy,missingDependencies,projectDirs,prepareInstallScripts};
