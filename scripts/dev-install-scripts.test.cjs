'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {approvalArgs,projectDirs,readPolicy,prepareInstallScripts}=require('./dev-install-scripts.cjs');

function harness(t,{installed=true,policy={},help='All commands: install, install-scripts, rebuild',change=true}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-approve-test-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dirs=projectDirs(root),calls=[],logs=[];
 for(const cwd of dirs){
  fs.mkdirSync(cwd,{recursive:true});
  fs.writeFileSync(path.join(cwd,'package.json'),JSON.stringify({name:'test-only',private:true,allowScripts:policy}));
  if(installed)fs.mkdirSync(path.join(cwd,'node_modules'));
 }
 const env={PATH:'/selected-node24/bin',YBR_TEST:'fixture'};
 const options={root,env,npm:'npm',log:line=>logs.push(line),capture:async(executable,args,opts)=>{
  assert.equal(executable,'npm');assert.deepEqual(args,['--help']);assert.equal(opts.cwd,root);assert.equal(opts.env,env);return {stdout:help};
 },run:async(executable,args,opts)=>{
  calls.push({executable,args:[...args],cwd:opts.cwd,env:opts.env});
  if(args[0]==='install')fs.mkdirSync(path.join(opts.cwd,'node_modules'),{recursive:true});
  if(change&&(args.includes('approve')||args.includes('approve-scripts'))){
   const file=path.join(opts.cwd,'package.json'),pkg=JSON.parse(fs.readFileSync(file));
   pkg.allowScripts={...pkg.allowScripts,'test-native@1.0.0':true};fs.writeFileSync(file,JSON.stringify(pkg));
  }
  return 0;
 }};
 return {root,dirs,calls,logs,options};
}

test('uses namespaced approve --all, not a package named all',()=>{
 assert.deepEqual(approvalArgs('All commands:\n install, install-scripts, rebuild'),['install-scripts','approve','--all']);
});
test('supports the official standalone alias on older npm',()=>{
 assert.deepEqual(approvalArgs('All commands: install, approve-scripts, rebuild'),['approve-scripts','--all']);
});
test('unsupported npm fails clearly instead of silently skipping approvals',()=>{
 assert.throws(()=>approvalArgs('All commands: install, rebuild, not-install-scripts'),/Update npm for Node 24/);
});
test('ordinary startup approves all three independent roots before any service is loaded',async t=>{
 const h=harness(t);await prepareInstallScripts(h.options);
 assert.equal(h.calls.length,6);
 for(let i=0;i<3;i++){
  assert.deepEqual(h.calls[i*2].args,['install-scripts','approve','--all']);
  assert.deepEqual(h.calls[i*2+1].args,['rebuild']);
  for(const call of h.calls.slice(i*2,i*2+2)){
   assert.equal(call.cwd,h.dirs[i]);assert.equal(call.env,h.options.env);assert.equal(call.executable,'npm');
  }
 }
 assert.ok(h.logs.some(line=>line.includes('permits dependency code')));
});
test('repeated startup still approves but does not reinstall or rebuild unchanged policy',async t=>{
 const h=harness(t);await prepareInstallScripts(h.options);h.calls.length=0;
 await prepareInstallScripts(h.options);
 assert.equal(h.calls.length,3);assert.ok(h.calls.every(call=>call.args.join(' ')==='install-scripts approve --all'));
});
test('setup installs, approves and rebuilds each project even when policy was already present',async t=>{
 const h=harness(t,{installed:false,change:false});await prepareInstallScripts({...h.options,setup:true});
 assert.deepEqual(h.calls.map(c=>c.args),[0,1,2].flatMap(()=>[['install'],['install-scripts','approve','--all'],['rebuild']]));
 assert.deepEqual(h.calls.map(c=>c.cwd),h.dirs.flatMap(dir=>[dir,dir,dir]));
});
test('no approval or partial setup is performed when a dev dependency tree is missing',async t=>{
 const h=harness(t);fs.rmSync(path.join(h.dirs[2],'node_modules'),{recursive:true});
 await assert.rejects(prepareInstallScripts(h.options),/Run npm run setup:dev first/);assert.equal(h.calls.length,0);
});
test('approval preserves explicit denials, pins and unrelated package fields',async t=>{
 const h=harness(t,{policy:{'denied-package':false,'already-reviewed@1.2.3':true}});
 await prepareInstallScripts(h.options);
 for(const dir of h.dirs){
  const pkg=JSON.parse(fs.readFileSync(path.join(dir,'package.json')));
  assert.equal(pkg.allowScripts['denied-package'],false);assert.equal(pkg.allowScripts['already-reviewed@1.2.3'],true);assert.equal(pkg.private,true);
 }
});
test('refuses to rebuild if npm unexpectedly removes an explicit denial',async t=>{
 const h=harness(t,{policy:{denied:false}});
 h.options.run=async(_cmd,args,{cwd})=>{h.calls.push(args);fs.writeFileSync(path.join(cwd,'package.json'),'{"allowScripts":{}}');return 0;};
 await assert.rejects(prepareInstallScripts(h.options),/explicit install-script denial/);assert.equal(h.calls.length,1);
});
test('install, approval and rebuild failures stop the sequence with the actual exit code',async t=>{
 for(const failed of ['install','install-scripts','rebuild']){
  const h=harness(t),run=h.options.run;
  h.options.run=async(cmd,args,opts)=>{const code=await run(cmd,args,opts);return args[0]===failed?7:code;};
  await assert.rejects(prepareInstallScripts({...h.options,setup:true}),e=>e.exitCode===7&&/Startup stopped/.test(e.message));
  assert.equal(h.calls.at(-1).args[0],failed);assert.ok(h.calls.every(c=>c.cwd===h.root));
 }
});
test('capture and permission errors propagate without trying another write command',async t=>{
 const h=harness(t);h.options.capture=async()=>{throw Object.assign(Error('access denied'),{code:'EACCES'});};
 await assert.rejects(prepareInstallScripts(h.options),e=>e.code==='EACCES');assert.equal(h.calls.length,0);
});
test('legacy command uses exactly the official alias and same --all semantics',async t=>{
 const h=harness(t,{help:'All commands: install, approve-scripts, rebuild',change:false});await prepareInstallScripts(h.options);
 assert.equal(h.calls.length,3);assert.ok(h.calls.every(c=>c.args.join(' ')==='approve-scripts --all'));
});
test('malformed project metadata fails before npm runs without echoing its contents',async t=>{
 const h=harness(t);fs.writeFileSync(path.join(h.root,'package.json'),'{"private-token":"DO-NOT-ECHO"');
 await assert.rejects(prepareInstallScripts(h.options),e=>/Cannot read package.json/.test(e.message)&&!e.message.includes('DO-NOT-ECHO'));assert.equal(h.calls.length,0);
});
test('invalid policy is not silently replaced and normal absent policy is supported',async t=>{
 const h=harness(t);const file=path.join(h.root,'package.json');fs.writeFileSync(file,'{"allowScripts":[]}');assert.throws(()=>readPolicy(h.root),/Invalid allowScripts/);
 fs.writeFileSync(file,'{"name":"test"}');assert.deepEqual(readPolicy(h.root),{});
});
test('bootstrap keeps Node-only checks before approvals, and approvals before stack imports',()=>{
 const code=fs.readFileSync(path.join(__dirname,'dev.cjs'),'utf8');
 assert.ok(code.indexOf("args.includes('--check-node')")<code.indexOf('prepareInstallScripts'));
 assert.ok(code.indexOf('prepareInstallScripts')<code.indexOf("require('./dev-stack.cjs').main()"));
});
