'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {PassThrough}=require('node:stream');
const {stripVTControlCharacters:strip}=require('node:util');
const {DevDashboard,renderDashboard,playerCredentials,redact,clean}=require('./dev-dashboard.cjs');
const mnemonic='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const privateKey='0x'+'a'.repeat(64);
const state=()=>({startedAt:0,now:90000,phase:'READY',nodeVersion:'v24.0.0',services:{web:'UP',player:'UP',ipfs:'UP',ganache:'UP'},ganache:{source:'owned',account:'0x'+'1'.repeat(40),balance:'999.999',block:7,mnemonic,privateKey},access:{source:'owned',verified:true,listener:'listener-fixture',artist:'artist-fixture'},factory:'0x'+'2'.repeat(40),peerId:'fixture-peer',logs:['12:00:01 launcher | Ready for minting.']});
function harness({tty=false,env={},args=[],cleanupControl=null}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-dashboard-test-'));
 const output=new PassThrough();let captured='';output.on('data',b=>captured+=b.toString());Object.assign(output,{isTTY:tty,columns:80,rows:24});
 const input=new PassThrough();input.isTTY=tty;input.isRaw=false;input.setRawMode=v=>{input.isRaw=v;};let quits=0,restarts=0;
 const dashboard=new DevDashboard({root,output,input,env,args,cleanupControl,onQuit:()=>quits++,onRestartPlayer:async()=>restarts++});
 return {dashboard,input,output,root,captured:()=>captured,quits:()=>quits,restarts:()=>restarts,close:()=>{dashboard.close();fs.rmSync(root,{recursive:true,force:true});}};
}
test('80x24 keeps ASCII logo, full wallet addresses, both logins and whole mnemonic',()=>{
 const s=state(),lines=renderDashboard(s,{columns:80,rows:24,showSecrets:true});assert.ok(lines.length<=23);
 assert.ok(lines.every(l=>strip(l).length<=79));
 const out=lines.join('\n');
 for(const v of ['SERVICES','GANACHE',s.ganache.account,s.factory,s.access.listener,s.access.artist,'Chain 1337','Mnemonic:','about','YELLOW BRICK ROAD','######'])assert.ok(out.includes(v),v);
});
test('wide dashboard shows aligned side-by-side panels; all layouts stay in bounds',()=>{
 for(const columns of [70,80,100,113,120,180])for(const rows of [24,30,40]){
  const lines=renderDashboard(state(),{columns,rows,color:true,showSecrets:true});assert.ok(lines.length<rows);
  for(const line of lines)assert.ok(strip(line).length<columns,strip(line));
  if(columns>=113){
   const plain=lines.map(strip),artAt=plain.findIndex(l=>l.includes('YBR PLAYER LOGIN')&&l.indexOf('┌')===74);
   if(artAt>=0&&rows>=35)assert.ok(plain.some(l=>l.slice(74).includes('SERVICES'))&&plain.some(l=>l.slice(74).includes('GANACHE')));
   else assert.ok(lines.some(l=>l.includes('SERVICES')&&l.includes('GANACHE')));
  }
 }
});
test('tiny terminal fallback is bounded and does not expose credentials',()=>{
 for(const columns of [10,30,59]){const lines=renderDashboard(state(),{columns,rows:12,showSecrets:true});assert.ok(lines.length<12);assert.ok(lines.every(l=>l.length<columns));assert.ok(!lines.join('\n').includes('listener-fixture'));}
});
test('hidden mode and details do not expose credentials',()=>{
 for(const view of ['home','details','logs']){const out=renderDashboard(state(),{view,columns:100,rows:50,showSecrets:false}).join('\n');for(const v of [mnemonic,privateKey,'listener-fixture','artist-fixture'])assert.ok(!out.includes(v));}
});
test('details includes complete private key and reference endpoints',()=>{
 const out=renderDashboard(state(),{view:'details',columns:100,rows:50,showSecrets:true}).join('\n');
 for(const v of [privateKey,"m/44'",'ipfs:down','fixture-peer','--restart-player'])assert.ok(out.includes(v),v);
});
test('verified reused Player displays real credentials; unknown Player offers in-terminal restart',()=>{
 const s=state();s.access.source='reused';let out=renderDashboard(s,{columns:100,rows:40,showSecrets:true}).join('\n');
 assert.ok(out.includes('listener-fixture'));assert.ok(out.includes('artist-fixture'));assert.ok(!out.includes('original terminal'));
 s.access={source:'reused'};s.ganache={source:'reused'};out=renderDashboard(s,{columns:100,rows:40,showSecrets:true}).join('\n');
 assert.match(out,/\[r\] restart Player here/);assert.match(out,/reused node; see original terminal/);assert.ok(!out.includes('listener-fixture'));
});
test('fresh random passwords and overrides still work',()=>{
 const a=playerCredentials({}),b=playerCredentials({});for(const v of Object.values(a))assert.match(v,/^[A-Za-z0-9_-]{16}$/);
 assert.notEqual(a.listener,a.artist);assert.notDeepEqual(a,b);assert.deepEqual(playerCredentials({YBR_LISTENER_PASSWORD:'L',YBR_ARTIST_PASSWORD:'A'}),{listener:'L',artist:'A'});
});
test('redaction removes secret lines, known values and terminal-control injection',()=>{
 for(const line of ['Mnemonic: '+mnemonic,'(0) '+privateKey,'listener / a-password (demo)','artist / another-password (demo)','error a-password']){
  const out=redact(line,['a-password']);for(const v of [mnemonic,privateKey,'a-password','another-password'])assert.ok(!out.includes(v));
 }
 assert.equal(clean('\x1b[2Jbad\nline\x1b]52;c;ZXZpbA==\x07'),'bad line');
});
test('plain and CI output stay redacted and never enter alternate screen',()=>{
 const h=harness();try{h.dashboard.start();h.dashboard.update(state());h.dashboard.addSecrets('listener-fixture','artist-fixture',mnemonic,privateKey);h.dashboard.log('test','listener-fixture');h.dashboard.ready();
 const out=h.captured();assert.ok(!out.includes('\x1b'));for(const v of [mnemonic,privateKey,'listener-fixture','artist-fixture'])assert.ok(!out.includes(v));assert.match(out,/INTEGRATED ROAD READY/);
 assert.ok(!fs.readFileSync(h.dashboard.logFile,'utf8').includes('listener-fixture'));if(process.platform!=='win32')assert.equal(fs.statSync(h.dashboard.logFile).mode&0o777,0o600);
 }finally{h.close();}
});
test('TTY supports neon frame, keys, pause, reduced motion, and terminal restoration',()=>{
 const h=harness({tty:true});try{h.dashboard.start();h.dashboard.update(state());assert.equal(h.input.isRaw,true);assert.match(h.captured(),/\x1b\[38;5;220m/);assert.ok(h.captured().includes('\x1b[?1049h'));
 for(const [k,field,value] of [['s','showSecrets',false],['a','motion',false],['d','view','details'],['l','view','logs'],['p','paused',true]]){h.input.emit('keypress',k,{name:k});assert.equal(h.dashboard[field],value);}
 const before=h.captured();h.dashboard.draw();assert.equal(h.captured(),before);h.input.emit('keypress','q',{name:'q'});assert.equal(h.quits(),1);h.dashboard.close();assert.equal(h.input.isRaw,false);assert.equal(h.input.isPaused(),true);assert.equal(h.input.listenerCount('keypress'),0);assert.equal(h.output.listenerCount('resize'),0);assert.ok(h.captured().includes('\x1b[?25h\x1b[?1049l'));
 }finally{h.close();}
});
test('Dev Control cleanup key binds the observed peer and keeps cancel/quit routing separate',async()=>{
 const scans=[],peers=[];
 const h=harness({tty:true,cleanupControl:({peerId})=>{peers.push(peerId);return {scan:async mode=>{scans.push(mode);return {};}};}});
 try{
  h.dashboard.start();h.input.emit('keypress','c',{name:'c'});assert.equal(h.dashboard.cleanupMenu,undefined);
  h.dashboard.update(state());h.dashboard.paused=true;h.input.emit('keypress','c',{name:'c'});
  assert.deepEqual(peers,['fixture-peer']);assert.equal(h.dashboard.state.cleanupMenu.stage,'menu');
  assert.ok(h.dashboard.lastFrame.join('\n').includes('Remove ALL local IPFS files'));
  assert.ok(!h.dashboard.lastFrame.join('\n').includes('DISPLAY PAUSED'));
  h.input.emit('keypress','n',{name:'n'});assert.equal(h.dashboard.networkControl.menu,null);
  h.input.emit('keypress','q',{name:'q'});assert.equal(h.quits(),0);
  h.input.emit('keypress','c',{name:'c',ctrl:true});assert.equal(h.dashboard.cleanupMenu,null);assert.deepEqual(scans,[]);
  h.input.emit('keypress','c',{name:'c',ctrl:true});assert.equal(h.quits(),1);
 }finally{h.close();}
});
test('Player restart requires two r presses and Escape cancels',async()=>{
 const h=harness({tty:true});try{h.dashboard.start();h.input.emit('keypress','r',{name:'r'});assert.equal(h.dashboard.state.restartConfirm,true);assert.equal(h.restarts(),0);h.input.emit('keypress','',{name:'escape'});assert.equal(h.dashboard.state.restartConfirm,false);
 h.input.emit('keypress','r',{name:'r'});h.input.emit('keypress','r',{name:'r'});await new Promise(r=>setImmediate(r));assert.equal(h.restarts(),1);
 }finally{h.close();}
});
test('motion changes only decorations, not addresses, credentials or telemetry',()=>{
 const s=state(),options={columns:120,rows:36,showSecrets:true};const a=renderDashboard(s,options);s.now+=180;const b=renderDashboard(s,options);
 assert.notDeepEqual(a,b);const stable=lines=>lines.filter(line=>!/^ \[(?:[.#=-]{5})\]/.test(strip(line)));assert.deepEqual(stable(a),stable(b));
 const still=renderDashboard(s,{...options,motion:false});s.now+=180;assert.deepEqual(still,renderDashboard(s,{...options,motion:false}));
});
test('long passwords and non-printable configuration remain safe and accessible',()=>{
 const s=state();s.access.listener='L'.repeat(100);s.access.artist='secret\x1b[2J';const home=renderDashboard(s,{columns:80,rows:24,showSecrets:true});assert.ok(home.length<=23);assert.ok(home.every(l=>l.length<80));
 const details=renderDashboard(s,{columns:140,rows:50,view:'details',showSecrets:true}).join('\n');assert.ok(details.includes('L'.repeat(100)));assert.ok(!details.includes('\x1b[2J'));assert.match(details,/non-printable/);
});
test('NO_COLOR, reduced motion, plain, dumb, CI and hidden-secret switches work',()=>{
 const h=harness({tty:true,env:{NO_COLOR:'1',YBR_DEV_HIDE_SECRETS:'1',YBR_DEV_REDUCED_MOTION:'1'}});try{h.dashboard.start();assert.equal(h.dashboard.color,false);assert.equal(h.dashboard.motion,false);assert.equal(h.dashboard.showSecrets,false);}finally{h.close();}
 for(const config of [{env:{TERM:'dumb'}},{env:{CI:'true'}},{env:{YBR_DEV_PLAIN:'1'}},{args:['--plain']}]){const h=harness({tty:true,...config});try{h.dashboard.start();assert.equal(h.dashboard.interactive,false);assert.equal(h.dashboard.showSecrets,false);}finally{h.close();}}
});
test('split child output is drained and secrets never reach disk',async()=>{
 const h=harness();try{const stdout=new PassThrough(),stderr=new PassThrough();h.dashboard.addSecrets(privateKey);h.dashboard.attach('ganache',{stdout,stderr});stdout.write('Mnem');stdout.write('onic: '+mnemonic.slice(0,20));stdout.write(mnemonic.slice(20)+'\n');stdout.end('(0) '+privateKey+'\n');stderr.end('eth_chainId\nError: '+privateKey+'\n');await new Promise(r=>setImmediate(r));assert.equal(h.dashboard.candidateMnemonic,mnemonic);const file=fs.readFileSync(h.dashboard.logFile,'utf8');assert.ok(!file.includes(mnemonic));assert.ok(!file.includes(privateKey));assert.match(file,/redacted/);assert.doesNotMatch(file,/eth_chainId/);assert.ok(!h.dashboard.state.logs.some(l=>l.includes('eth_chainId')));}finally{h.close();}
});
test('oversized output is omitted instead of partially leaking',async()=>{
 const h=harness({args:['--verbose']});try{const stdout=new PassThrough();h.dashboard.attach('test',{stdout});stdout.write('x'.repeat(9000));stdout.end('listener-fixture\nnormal\n');await new Promise(r=>setImmediate(r));const file=fs.readFileSync(h.dashboard.logFile,'utf8');assert.match(file,/oversized output line omitted/);assert.match(file,/normal/);assert.ok(!file.includes('listener-fixture'));}finally{h.close();}
});
test('log ring and rotation stay bounded',()=>{
 const h=harness({args:['--verbose']});try{for(let i=0;i<240;i++)h.dashboard.log('test','line '+i);assert.equal(h.dashboard.state.logs.length,200);fs.appendFileSync(h.dashboard.logFile,'x'.repeat(1024*1024));h.dashboard.logBytes=1024*1024+1;h.dashboard.log('test','rotated');assert.ok(fs.existsSync(h.dashboard.logFile+'.1'));assert.ok(fs.statSync(h.dashboard.logFile).size<1024);assert.ok(renderDashboard(h.dashboard.state,{view:'logs',columns:80,rows:24}).length<=23);}finally{h.close();}
});

test('essential mode suppresses routine child output before disk, terminal and ring',async()=>{
 const h=harness();try{
  h.dashboard.start();const stdout=new PassThrough(),stderr=new PassThrough();h.dashboard.attach('ganache',{stdout,stderr});
  stdout.end('eth_chainId\nnet_version\nTransaction: 0xfixture\nGas usage: 30000\nBlock number: 2\n');
  stderr.end('eth_getCode\nError: RPC disconnected\n    at connect (rpc.js:8)\n');
  h.dashboard.log('launcher','Services ready');
  await new Promise(r=>setImmediate(r));
  for(const value of [h.captured(),fs.readFileSync(h.dashboard.logFile,'utf8'),h.dashboard.state.logs.join('\n')]){
   assert.doesNotMatch(value,/eth_chainId|eth_getCode|net_version|Gas usage|Transaction:|Block number/);
   assert.match(value,/RPC disconnected/);assert.match(value,/at connect/);assert.match(value,/Services ready/);
  }
  const count=h.dashboard.state.logs.length;for(let i=0;i<100;i++)h.dashboard.log('launcher','Services ready');assert.equal(h.dashboard.state.logs.length,count);
 }finally{h.close();}
});
test('home has no activity feed; l opens logs and v changes capture without altering services',()=>{
 const h=harness({tty:true});try{
  h.dashboard.start();h.dashboard.update(state());
  let screen=strip(h.dashboard.lastFrame.join('\n'));assert.doesNotMatch(screen,/Ready for minting|ACTIVITY/);assert.match(screen,/\[l\] logs/);
  const services={...h.dashboard.state.services};h.input.emit('keypress','l',{name:'l'});assert.equal(h.dashboard.view,'logs');assert.match(strip(h.dashboard.lastFrame.join('\n')),/SESSION LOG \/\/ ESSENTIAL/);
  h.input.emit('keypress','v',{name:'v'});assert.equal(h.dashboard.verbose,true);h.dashboard.log('ganache','eth_chainId');
  assert.match(fs.readFileSync(h.dashboard.logFile,'utf8'),/eth_chainId/);
  h.input.emit('keypress','v',{name:'v'});assert.equal(h.dashboard.verbose,false);h.dashboard.log('ganache','eth_getBalance');
  assert.doesNotMatch(fs.readFileSync(h.dashboard.logFile,'utf8'),/eth_getBalance/);
  h.input.emit('keypress','',{name:'escape'});assert.equal(h.dashboard.view,'home');h.input.emit('keypress','v',{name:'v'});assert.equal(h.dashboard.verbose,false);
  assert.deepEqual(h.dashboard.state.services,services);assert.equal(h.restarts(),0);assert.equal(h.quits(),0);
 }finally{h.close();}
});
test('fresh sessions discard ONLY dev-stack.log and its rotation, never creator data',()=>{
 const h=harness();let again;try{
  h.dashboard.log('launcher','OLD SESSION');h.dashboard.close();
  fs.writeFileSync(h.dashboard.logFile+'.1','OLD ROTATION');
  const dir=path.join(h.root,'.road-local');const retained=['ganache/LOG','ganache-profiles/abc/ganache/LOG','player-releases/release.json','player-access.json','ganache-wallet.json','recovery.json','other.log','dev-stack.log.backup'];
  for(const name of retained){const f=path.join(dir,name);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,'KEEP '+name);}
  again=new DevDashboard({root:h.root,output:h.output,input:h.input,env:{},args:[]});
  assert.equal(fs.readFileSync(again.logFile,'utf8'),'');assert.equal(fs.existsSync(again.logFile+'.1'),false);
  assert.deepEqual(again.state.logs,[]);assert.equal(again.state.logMode,'ESSENTIAL');again.log('launcher','NEW SESSION');assert.doesNotMatch(fs.readFileSync(again.logFile,'utf8'),/OLD/);
  for(const name of retained)assert.equal(fs.readFileSync(path.join(dir,name),'utf8'),'KEEP '+name);
 }finally{again?.close();h.close();}
});
test('cleanup refuses symlinks, hardlinks and directories before touching either old log',()=>{
 for(const kind of ['symlink','hardlink','directory']){
  const h=harness();try{
   h.dashboard.close();fs.writeFileSync(h.dashboard.logFile,'KEEP OLD LOG');const other=path.join(h.root,'outside');fs.writeFileSync(other,'KEEP OUTSIDE');
   if(kind==='symlink')fs.symlinkSync(other,h.dashboard.logFile+'.1');
   if(kind==='hardlink')fs.linkSync(other,h.dashboard.logFile+'.1');
   if(kind==='directory')fs.mkdirSync(h.dashboard.logFile+'.1');
   assert.throws(()=>new DevDashboard({root:h.root,output:h.output,input:h.input,env:{},args:[]}),/Unsafe dev log/);
   assert.equal(fs.readFileSync(other,'utf8'),'KEEP OUTSIDE');assert.equal(fs.readFileSync(h.dashboard.logFile,'utf8'),'KEEP OLD LOG');
  }finally{h.close();}
 }
});
test('replaced log paths cannot redirect captured output or rotation to another file',()=>{
 const h=harness({args:['--verbose']});try{
  const other=path.join(h.root,'outside');fs.writeFileSync(other,'KEEP OUTSIDE');
  fs.unlinkSync(h.dashboard.logFile);fs.symlinkSync(other,h.dashboard.logFile);
  h.dashboard.log('ganache','eth_chainId');assert.equal(fs.readFileSync(other,'utf8'),'KEEP OUTSIDE');
  h.dashboard.logBytes=1024*1024;h.dashboard.log('launcher','force rotation');assert.match(h.dashboard.state.error,/Cannot write/);
  assert.equal(fs.readFileSync(other,'utf8'),'KEEP OUTSIDE');assert.equal(h.dashboard.logFd,null);
 }finally{h.close();}
});
test('verbose startup and menu remain redacted, bounded and accessible on short terminals',()=>{
 for(const config of [{args:['--logs','--verbose']},{args:['--logs'],env:{YBR_DEV_VERBOSE:'1'}}]){
  const h=harness({tty:true,...config});try{
   h.dashboard.start();h.dashboard.addSecrets('private-password',mnemonic);h.dashboard.log('worker','trace private-password '+mnemonic);
   assert.equal(h.dashboard.verbose,true);assert.equal(h.dashboard.view,'logs');
   const file=fs.readFileSync(h.dashboard.logFile,'utf8');assert.doesNotMatch(file,/private-password|abandon/);assert.match(file,/redacted/);
   for(const [columns,rows] of [[80,24],[120,40],[61,15],[40,10]]){
    const lines=renderDashboard(h.dashboard.state,{columns,rows,view:'logs'});assert.ok(lines.length<rows);assert.ok(lines.every(l=>strip(l).length<columns));assert.match(lines.join('\n'),/SESSION LOG/);
   }
  }finally{h.close();}
 }
});
test('failure restores terminal and surfaces a redacted diagnostic without dumping history',()=>{
 const h=harness({tty:true});try{
  h.dashboard.start();h.dashboard.addSecrets('private-password');h.dashboard.log('worker','Error: refused private-password',{stderr:true});
  const before=h.captured().length;h.dashboard.close('Road Explorer unexpectedly exited (1)');
  const end=h.captured().slice(before);assert.match(end,/Last diagnostic:.*refused \[redacted\]/);assert.doesNotMatch(end,/private-password/);assert.equal(h.input.isRaw,false);assert.equal(h.dashboard.logFd,null);
 }finally{h.close();}
});
test('two separate launcher processes start fresh logs without persisting verbose mode',()=>{
 const {execFileSync}=require('node:child_process');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-log-restart-'));
 const script=`const {DevDashboard}=require(${JSON.stringify(path.join(__dirname,'dev-dashboard.cjs'))});
 const d=new DevDashboard({root:process.argv[1],args:process.argv[2]==='first'?['--verbose']:[],env:{}});
 d.start();d.log('ganache','eth_chainId');d.log('launcher',process.argv[2]);d.close();`;
 try{
  execFileSync(process.execPath,['-e',script,root,'first'],{stdio:'pipe'});
  const file=path.join(root,'.road-local/dev-stack.log');assert.match(fs.readFileSync(file,'utf8'),/eth_chainId/);
  fs.writeFileSync(file+'.1','old rotation');execFileSync(process.execPath,['-e',script,root,'second'],{stdio:'pipe'});
  const current=fs.readFileSync(file,'utf8');assert.match(current,/second/);assert.doesNotMatch(current,/first|eth_chainId/);assert.equal(fs.existsSync(file+'.1'),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('TTY resize swaps full artwork, framed-letter and compact layouts without losing controls',()=>{
 const h=harness({tty:true});try{
  h.dashboard.start();h.dashboard.update(state());
  for(const [columns,rows,kind] of [[150,40,'full'],[150,30,'framed'],[80,24,'compact'],[150,40,'full']]){
   Object.assign(h.output,{columns,rows});h.output.emit('resize');
   const lines=h.dashboard.lastFrame.map(strip),text=lines.join('\n');
   assert.ok(lines.length<rows);assert.ok(lines.every(line=>line.length<columns));
   if(kind==='full')assert.ok(lines[3].startsWith('         ███'));
   if(kind==='framed')assert.ok(lines[3].startsWith('     ██.----------------.'));
   if(kind==='compact')assert.ok(lines[0].startsWith('##'));
   for(const value of ['listener-fixture','artist-fixture','about',state().factory,'[q] quit'])assert.ok(text.includes(value),value);
  }
  h.input.emit('keypress','s',{name:'s'});
  const hidden=strip(h.dashboard.lastFrame.join('\n'));
  for(const value of ['listener-fixture','artist-fixture','abandon'])assert.ok(!hidden.includes(value));
  h.input.emit('keypress','p',{name:'p'});assert.match(strip(h.dashboard.lastFrame[1]),/DISPLAY PAUSED/);
  h.input.emit('keypress','p',{name:'p'});assert.match(strip(h.dashboard.lastFrame[1]),/CREATOR TOOLS/);
 }finally{h.close();}
});
