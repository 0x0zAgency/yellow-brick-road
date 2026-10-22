'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {createServer}=require('node:http');
const {once}=require('node:events');
const {runtimeEnv}=require('./dev.cjs');
const {accessFile,readPlayerAccess,selectPlayerAccess,savePlayerAccess,verifyPlayerAccess,isCheckoutPlayer,restartCheckoutPlayer}=require('./dev-player-access.cjs');
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'ybr-access-test-'));
const credentials={listener:'test-only-listener',artist:'test-only-artist'};
function using(fn){const root=temp();try{return fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}
test('Node runtime environment puts the selected executable first for all children',()=>{
 const env=runtimeEnv({PATH:'/old/bin',EXAMPLE:'retained'},'/node24/bin/node');assert.equal(env.PATH,'/node24/bin'+path.delimiter+'/old/bin');assert.equal(env.npm_node_execpath,'/node24/bin/node');assert.equal(env.NODE,'/node24/bin/node');assert.equal(env.EXAMPLE,'retained');
});
function fakeNvm(root,{installed=true,version='24',fail=false}={}){
 const dir=path.join(root,'nvm with spaces'),bin=path.join(dir,'bin');fs.mkdirSync(bin,{recursive:true});
 fs.writeFileSync(path.join(bin,'node'),'#!/bin/sh\nif [ "$1" = "-p" ]; then echo '+version+'; else printf "<%s>\\n" "$@"; fi\n',{mode:0o755});
 const source=`installed=${installed?1:0}\nnvm(){\n if [ "$1" = install ]; then ${fail?'return 1':'installed=1; return 0'}; fi\n if [ "$1" = use ] && [ "$installed" = 1 ]; then export PATH="$NVM_DIR/bin:$PATH"; return 0; fi\n return 1\n}\n`;
 fs.writeFileSync(path.join(dir,'nvm.sh'),source);return dir;
}
test('nvm loader selects 24 with paths containing spaces and preserves arguments literally',()=>using(root=>{
 const dir=fakeNvm(root),payload='--flag=$(touch NOT_EXECUTED)';const out=execFileSync('bash',[path.join(__dirname,'use-node24.sh'),'entry with spaces.cjs',payload],{env:{...process.env,NVM_DIR:dir,HOME:root},encoding:'utf8'});
 assert.match(out,/<entry with spaces.cjs>/);assert.ok(out.includes('<'+payload+'>'));assert.ok(!fs.existsSync(path.join(root,'NOT_EXECUTED')));
}));
test('nvm loader installs missing 24 then selects it, without starting project code early',()=>using(root=>{
 const dir=fakeNvm(root,{installed:false});const out=execFileSync('bash',[path.join(__dirname,'use-node24.sh'),'entry'],{env:{...process.env,NVM_DIR:dir,HOME:root},encoding:'utf8'});assert.match(out,/Installing it with nvm/);assert.match(out,/<entry>/);
}));
test('nvm loader refuses wrong runtime and failed installation before services start',()=>{
 for(const opts of [{version:'22'},{installed:false,fail:true}])using(root=>{
  const dir=fakeNvm(root,opts);assert.throws(()=>execFileSync('bash',[path.join(__dirname,'use-node24.sh'),'entry'],{env:{...process.env,NVM_DIR:dir,HOME:root},stdio:'pipe'}),error=>error.status===1&&!error.stdout.toString().includes('<entry>'));
 });
});
test('missing nvm gives an actionable error without downloading a script',()=>using(root=>{
 if(['/opt/homebrew/opt/nvm/nvm.sh','/usr/local/opt/nvm/nvm.sh'].some(p=>fs.existsSync(p)))return;
 assert.throws(()=>execFileSync('bash',[path.join(__dirname,'use-node24.sh'),'entry'],{env:{PATH:process.env.PATH,HOME:root,NVM_DIR:path.join(root,'missing')},stdio:'pipe'}),error=>error.status===1&&/Cannot find nvm/.test(error.stderr));
}));
test('Player credentials persist privately and are reusable rather than regenerated',()=>using(root=>{
 const a=selectPlayerAccess(root,{});assert.notEqual(a.listener,a.artist);assert.equal(readPlayerAccess(root),null);savePlayerAccess(root,a);assert.deepEqual(selectPlayerAccess(root,{}),a);assert.deepEqual(readPlayerAccess(root),a);
 if(process.platform!=='win32'){assert.equal(fs.statSync(accessFile(root)).mode&0o777,0o600);assert.equal(fs.statSync(path.dirname(accessFile(root))).mode&0o777,0o700);}
 assert.ok(!fs.readFileSync(accessFile(root),'utf8').includes('mnemonic'));
}));
test('credential overrides are honored and unknown reused processes never get guessed passwords',()=>using(root=>{
 assert.equal(selectPlayerAccess(root,{}, {generate:false}),null);savePlayerAccess(root,credentials);
 assert.deepEqual(selectPlayerAccess(root,{YBR_LISTENER_PASSWORD:'override'}),{listener:'override',artist:credentials.artist});
}));
test('credential files reject symlinks, malformed data and public permissions',()=>using(root=>{
 selectPlayerAccess(root,{});const file=accessFile(root),elsewhere=path.join(root,'outside.json');fs.writeFileSync(elsewhere,'do not touch');fs.symlinkSync(elsewhere,file);assert.throws(()=>readPlayerAccess(root),/private file/);assert.throws(()=>savePlayerAccess(root,credentials),/private file/);assert.equal(fs.readFileSync(elsewhere,'utf8'),'do not touch');fs.unlinkSync(file);
 fs.writeFileSync(file,'{}',{mode:0o600});assert.throws(()=>readPlayerAccess(root),/Invalid/);fs.unlinkSync(file);savePlayerAccess(root,credentials);if(process.platform!=='win32'){fs.chmodSync(file,0o644);assert.throws(()=>readPlayerAccess(root),/600 permissions/);}
}));
test('existing legacy .road-local folder is tightened before credentials are saved',()=>using(root=>{
 fs.mkdirSync(path.join(root,'.road-local'),{mode:0o755});const a=selectPlayerAccess(root,{});savePlayerAccess(root,a);assert.deepEqual(readPlayerAccess(root),a);
}));
test('credentials are verified against both live login endpoints and sessions are logged out',async()=>{
 const calls=[];const server=createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  calls.push(req.url);if(req.url==='/api/logout'){res.writeHead(200);res.end('{}');return;}
  const {username,password}=JSON.parse(body);const ok=credentials[username]===password;res.writeHead(ok?200:401,{'Content-Type':'application/json',...(ok?{'Set-Cookie':'ybr_session=test; HttpOnly'}:{})});res.end(JSON.stringify({authenticated:ok,user:ok?username:null}));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const fetchImpl=(url,options)=>{assert.ok(url.startsWith('http://127.0.0.1:4173/'));assert.equal(options.redirect,'error');return fetch('http://127.0.0.1:'+server.address().port+new URL(url).pathname,options);};
  assert.equal(await verifyPlayerAccess(credentials,{fetchImpl}),true);assert.deepEqual(calls,['/api/session','/api/logout','/api/session','/api/logout']);assert.equal(await verifyPlayerAccess({...credentials,artist:'wrong'},{fetchImpl}),false);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('verification refuses redirects, malformed sessions and unavailable services',async()=>{
 for(const fetchImpl of [async()=>new Response('{}',{status:302}),async()=>new Response(JSON.stringify({authenticated:true,user:'someone-else'})),async()=>{throw Error('offline');}])assert.equal(await verifyPlayerAccess(credentials,{fetchImpl}),false);
});
test('restart accepts only the same user, checkout, working directory and exact Node script',()=>{
 const root='/example/ybr',valid={cwd:root+'/apps/ybr-player',command:'/node24/bin/node server.js',uid:process.getuid?.()||0};assert.equal(isCheckoutPlayer(valid,root),true);assert.equal(isCheckoutPlayer({...valid,command:'node ../../scripts/dev-player.cjs'},root),true);
 for(const bad of [{cwd:'/another/checkout/apps/ybr-player'},{command:'node unrelated.js'},{command:'sh -c node server.js'},{command:'node --eval server.js'},{uid:999999}])assert.equal(isCheckoutPlayer({...valid,...bad},root),false);
});
test('explicit legacy restart checks identity twice, sends only SIGTERM and waits for port release',async()=>{
 const root='/example/ybr';let alive=true,kills=0,inspections=0;
 const run=async(cmd,args)=>{
  if(cmd==='lsof'&&args.includes('-t'))return {stdout:alive?'42\n':''};
  if(cmd==='lsof')return {stdout:'p42\nn'+root+'/apps/ybr-player\n'};
  if(args.includes('args=')){inspections++;return {stdout:'node server.js\n'};}
  return {stdout:String(process.getuid?.()||0)};
 };
 await restartCheckoutPlayer(root,{run,kill:(pid,signal)=>{assert.equal(pid,42);assert.equal(signal,'SIGTERM');kills++;alive=false;},sleep:async()=>{}});assert.equal(kills,1);assert.equal(inspections,2);
});
test('explicit restart refuses a foreign service without sending a signal',async()=>{
 let kills=0;const run=async(cmd,args)=>({stdout:args.includes('-t')?'42\n':cmd==='lsof'?'p42\nn/another/checkout\n':args.includes('args=')?'node server.js':String(process.getuid?.()||0)});
 await assert.rejects(restartCheckoutPlayer('/example/ybr',{run,kill:()=>kills++,sleep:async()=>{}}),/not a Player/);assert.equal(kills,0);
});

test('ordinary dependency commands drain quiet output, show warnings, and retain failure context',async()=>{
 const {runChild}=require('./dev.cjs');let text='';const output={write:value=>{text+=value;}};
 const run=source=>runChild(process.execPath,['-e',source],{quiet:true,output,env:{...process.env,YBR_LISTENER_PASSWORD:'test-secret'}});
 assert.equal(await run("console.log('Routine package output')"),0);assert.equal(text,'');
 assert.equal(await run("console.log('noise');console.error('npm warn test-secret')"),0);assert.match(text,/Dependency warnings/);assert.match(text,/\[redacted\]/);assert.doesNotMatch(text,/noise|test-secret/);
 text='';assert.equal(await run("for(let i=0;i<80;i++)console.log('line '+i);console.error('Error: test-secret');process.exitCode=7;"),7);
 assert.match(text,/failure \(last 30 lines\)/);assert.doesNotMatch(text,/line 0\n|test-secret/);assert.match(text,/line 79/);assert.match(text,/Error: \[redacted\]/);
 text='';assert.equal(await run("process.stdout.write('x'.repeat(12000)+'test-secret\\n');process.exitCode=2;"),2);
 assert.match(text,/oversized dependency output omitted/);assert.doesNotMatch(text,/test-secret|xxx/);
});
