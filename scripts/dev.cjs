'use strict';
/** Dependency-free entrypoint: select Node 24 before loading project packages. */
const path=require('node:path');
const {spawn}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');

function runtimeEnv(env=process.env,execPath=process.execPath){
 return {...env,PATH:path.dirname(execPath)+path.delimiter+(env.PATH||''),
  npm_node_execpath:execPath,NODE:execPath};
}
function runChild(executable,args,{env=process.env,cwd=ROOT}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{cwd,env,stdio:'inherit'});
  const interrupt=()=>child.kill('SIGINT');
  const terminate=()=>child.kill('SIGTERM');
  process.on('SIGINT',interrupt);process.on('SIGTERM',terminate);
  const cleanup=()=>{process.off('SIGINT',interrupt);process.off('SIGTERM',terminate);};
  child.once('error',error=>{cleanup();reject(error);});
  child.once('exit',(code,signal)=>{cleanup();resolve(code===null?(signal==='SIGINT'?130:143):code);});
 });
}
async function main(args=process.argv.slice(2)){
 try{
  if(Number(process.versions.node.split('.')[0])!==24){
   if(process.platform==='win32')throw Error('YBR development requires Node 24. Run nvm install 24 and nvm use 24 in your Windows terminal, then retry.');
   console.log('[YBR] Selecting Node 24 through nvm before starting services...');
   const env={...process.env};
   // npm exports the old runtime's prefix. Do not let it block nvm selection.
   delete env.npm_config_prefix;delete env.NPM_CONFIG_PREFIX;
   process.exitCode=await runChild('bash',[path.join(__dirname,'use-node24.sh'),__filename,...args],{env});
   return;
  }
  Object.assign(process.env,runtimeEnv());
  if(args.includes('--check-node')){
   console.log('[YBR] Runtime ready: '+process.version+' ('+process.execPath+')');return;
  }
  const setup=args[0]==='--setup';
  await require('./dev-install-scripts.cjs').prepareInstallScripts({root:ROOT,run:runChild,setup});
  if(setup)return;
  await require('./dev-stack.cjs').main();
 }catch(error){
  console.error('[YBR] '+error.message);process.exitCode=Number.isInteger(error.exitCode)&&error.exitCode>0?error.exitCode:1;
 }
}
if(require.main===module)void main();
module.exports={main,runtimeEnv,runChild};
