'use strict';
/** Dependency-free entrypoint: select Node 24 before loading project packages. */
const path=require('node:path');
const {spawn}=require('node:child_process');
const {StringDecoder}=require('node:string_decoder');
const {redact,essentialLog}=require('./dev-dashboard.cjs');
const ROOT=path.resolve(__dirname,'..');

function runtimeEnv(env=process.env,execPath=process.execPath){
 return {...env,PATH:path.dirname(execPath)+path.delimiter+(env.PATH||''),
  npm_node_execpath:execPath,NODE:execPath};
}
function runChild(executable,args,{env=process.env,cwd=ROOT,quiet=false,output=process.stdout}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{cwd,env,stdio:quiet?['ignore','pipe','pipe']:'inherit'});
  const tail=[],warnings=[],secrets=[env.YBR_LISTENER_PASSWORD,env.YBR_ARTIST_PASSWORD];
  if(quiet)for(const [stream,stderr] of [[child.stdout,false],[child.stderr,true]]){
   const decoder=new StringDecoder('utf8');let pending='',dropping=false;
   const remember=text=>{
    const line=redact(text,secrets).trim();if(!line)return;
    tail.push(line);if(tail.length>30)tail.shift();
    if(essentialLog('npm',line,{stderr})){warnings.push(line);if(warnings.length>6)warnings.shift();}
   };
   const consume=text=>{
    for(const fragment of text.split(/(?<=[\r\n])/)){
     if(!dropping)pending+=fragment;
     if(pending.length>8192){pending='';dropping=true;}
     if(/[\r\n]$/.test(fragment)){
      remember(dropping?'Warning: oversized dependency output omitted':pending);pending='';dropping=false;
     }
    }
   };
   stream.on('data',chunk=>consume(decoder.write(chunk)));
   stream.on('end',()=>{consume(decoder.end());if(pending&&!dropping)remember(pending);});
  }
  const interrupt=()=>child.kill('SIGINT');
  const terminate=()=>child.kill('SIGTERM');
  process.on('SIGINT',interrupt);process.on('SIGTERM',terminate);
  const cleanup=()=>{process.off('SIGINT',interrupt);process.off('SIGTERM',terminate);};
  child.once('error',error=>{cleanup();reject(error);});
  child.once('close',(code,signal)=>{
   cleanup();
   if(quiet){
    const lines=code===0?warnings:tail;
    if(lines.length)output.write('[YBR] Dependency '+(code===0?'warnings':'failure (last 30 lines)')+':\n'+lines.join('\n')+'\n');
   }
   resolve(code===null?(signal==='SIGINT'?130:143):code);
  });
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
  const quiet=!setup&&!args.includes('--verbose')&&process.env.YBR_DEV_VERBOSE!=='1';
  if(quiet)console.log('[YBR] Checking dependency script approvals...');
  await require('./dev-install-scripts.cjs').prepareInstallScripts({root:ROOT,setup,
   run:(cmd,argv,options)=>runChild(cmd,argv,{...options,quiet}),log:quiet?()=>{}:console.log});
  if(setup)return;
  Object.assign(process.env,require('./dev-network.cjs').startupNetworkEnv(ROOT));
  await require('./dev-stack.cjs').main();
 }catch(error){
  console.error('[YBR] '+error.message);process.exitCode=Number.isInteger(error.exitCode)&&error.exitCode>0?error.exitCode:1;
 }
}
if(require.main===module)void main();
module.exports={main,runtimeEnv,runChild};
