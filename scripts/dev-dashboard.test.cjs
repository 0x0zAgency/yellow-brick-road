'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {PassThrough}=require('node:stream');
const {stripVTControlCharacters}=require('node:util');
const {DevDashboard,renderDashboard,playerCredentials,redact,clean}=require('./dev-dashboard.cjs');
const mnemonic='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const privateKey='0x'+'a'.repeat(64);
const state=()=>({startedAt:0,now:90000,phase:'READY',services:{web:'UP',player:'UP',ipfs:'UP',ganache:'UP'},
 ganache:{source:'owned',account:'0x'+'1'.repeat(40),balance:'999.999',block:7,mnemonic,privateKey},
 access:{source:'owned',listener:'listener-fixture',artist:'artist-fixture'},factory:'0x'+'2'.repeat(40),
 peerId:'fixture-peer',logs:['12:00:01 launcher | Ready for minting.']});
function harness({tty=false,env={},args=[]}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-dashboard-test-'));
 const output=new PassThrough();let captured='';
 output.on('data',data=>{captured+=data.toString();});
 Object.assign(output,{isTTY:tty,columns:80,rows:24});
 const input=new PassThrough();input.isTTY=tty;input.isRaw=false;
 input.setRawMode=value=>{input.isRaw=value;};
 let quits=0;
 const dashboard=new DevDashboard({root,output,input,env,args,onQuit:()=>quits++});
 return {dashboard,input,output,root,captured:()=>captured,quits:()=>quits,
  close:()=>{dashboard.close();fs.rmSync(root,{recursive:true,force:true});}};
}
test('core reference fits 80x24 with full accounts, login and wrapped mnemonic',()=>{
 const s=state();const lines=renderDashboard(s,{columns:80,rows:24,showSecrets:true});
 assert.ok(lines.length<=23);
 for(const line of lines)assert.ok(stripVTControlCharacters(line).length<=79,line);
 const result=lines.join('\n');
 for(const value of ['SERVICES','GANACHE',s.ganache.account,s.factory,s.access.listener,s.access.artist,'Chain 1337'])assert.ok(result.includes(value));
 assert.ok(result.includes('Mnemonic:'));
 assert.ok(result.includes('about'));
});
test('wide layout has aligned side-by-side panels and stays within terminal width',()=>{
 for(const columns of [80,100,113,120,180]){
  const lines=renderDashboard(state(),{columns,rows:32,color:true,showSecrets:true});
  for(const line of lines)assert.ok(stripVTControlCharacters(line).length<columns);
  if(columns>=113)assert.ok(lines.some(line=>line.includes('SERVICES')&&line.includes('GANACHE')));
 }
});
test('tiny terminal fallback is bounded and does not expose credentials',()=>{
 for(const columns of [10,30,59]){
  const lines=renderDashboard(state(),{columns,rows:12,showSecrets:true});
  assert.ok(lines.length<=11);
  assert.ok(lines.every(line=>line.length<columns));
  assert.ok(!lines.join('\n').includes('listener-fixture'));
 }
});
test('hidden mode and details do not expose any credentials',()=>{
 for(const view of ['home','details']){
  const output=renderDashboard(state(),{view,columns:100,rows:50,showSecrets:false}).join('\n');
  for(const value of [mnemonic,privateKey,'listener-fixture','artist-fixture'])assert.ok(!output.includes(value));
  assert.match(output,/\[hidden\]/);
 }
});
test('details includes the complete account-0 key and RPC reference',()=>{
 const output=renderDashboard(state(),{view:'details',columns:100,rows:50,showSecrets:true}).join('\n');
 assert.ok(output.includes(privateKey));
 assert.match(output,/m\/44'/);
 assert.match(output,/ipfs:down/);
 assert.match(output,/fixture-peer/);
});
test('reused services never invent or recover credentials from RPC',()=>{
 const s=state();s.access={source:'reused'};s.ganache={source:'reused'};
 const output=renderDashboard(s,{columns:100,rows:40,showSecrets:true}).join('\n');
 assert.match(output,/reused player; see original terminal/);
 assert.match(output,/reused node; see original terminal/);
 assert.ok(!output.includes('listener-fixture'));
});
test('local account passwords respect overrides or get fresh independent randomness',()=>{
 const a=playerCredentials({}),b=playerCredentials({});
 for(const value of Object.values(a))assert.match(value,/^[A-Za-z0-9_-]{16}$/);
 assert.notEqual(a.listener,a.artist);assert.notDeepEqual(a,b);
 assert.deepEqual(playerCredentials({YBR_LISTENER_PASSWORD:'L',YBR_ARTIST_PASSWORD:'A'}),{listener:'L',artist:'A'});
});
test('redaction strips seed lines, Ganache keys and player credentials',()=>{
 const secrets=['a-password'];
 for(const line of ['Mnemonic: '+mnemonic,'(0) '+privateKey,'listener / a-password (demo)', 'artist / another-password (demo)','error a-password']){
  const output=redact(line,secrets);
  for(const value of [mnemonic,privateKey,'a-password','another-password'])assert.ok(!output.includes(value));
 }
 assert.equal(clean('\x1b[2Jbad\nline\x1b]52;c;ZXZpbA==\x07'),'bad line');
});
test('pipe and CI output are plain, redacted, and never enter alternate screen',()=>{
 const h=harness();
 try{
  h.dashboard.start();h.dashboard.update(state());
  h.dashboard.addSecrets('listener-fixture','artist-fixture',mnemonic,privateKey);
  h.dashboard.log('test','listener-fixture');h.dashboard.ready();
  const output=h.captured();
  assert.ok(!output.includes('\x1b'));
  for(const value of ['listener-fixture','artist-fixture',mnemonic,privateKey])assert.ok(!output.includes(value));
  assert.match(output,/INTEGRATED ROAD READY/);
  const file=fs.readFileSync(h.dashboard.logFile,'utf8');
  assert.ok(!file.includes('listener-fixture'));
  if(process.platform!=='win32')assert.equal(fs.statSync(h.dashboard.logFile).mode&0o777,0o600);
 }finally{h.close();}
});
test('TTY enables gold dashboard, secret toggle, views, pause and cleanup',()=>{
 const h=harness({tty:true});
 try{
  h.dashboard.start();h.dashboard.update(state());
  assert.equal(h.input.isRaw,true);assert.ok(h.captured().includes('\x1b[?1049h'));
  assert.ok(h.captured().includes('\x1b[38;5;220m'));
  assert.equal(h.dashboard.showSecrets,true);
  h.input.emit('keypress','s',{name:'s'});assert.equal(h.dashboard.showSecrets,false);
  h.input.emit('keypress','d',{name:'d'});assert.equal(h.dashboard.view,'details');
  h.input.emit('keypress','l',{name:'l'});assert.equal(h.dashboard.view,'logs');
  h.input.emit('keypress','p',{name:'p'});assert.equal(h.dashboard.paused,true);
  const before=h.captured();h.dashboard.draw();assert.equal(h.captured(),before);
  h.input.emit('keypress','q',{name:'q'});assert.equal(h.quits(),1);
  h.dashboard.close('finished');
  assert.equal(h.input.isRaw,false);assert.equal(h.input.isPaused(),true);
  assert.equal(h.input.listenerCount('keypress'),0);assert.equal(h.output.listenerCount('resize'),0);
  assert.ok(h.captured().includes('\x1b[?25h\x1b[?1049l'));
 }finally{h.close();}
});
test('NO_COLOR keeps layout without color; plain/dumb/CI disables interactive UI',()=>{
 const h=harness({tty:true,env:{NO_COLOR:'1',YBR_DEV_HIDE_SECRETS:'1'}});
 try{h.dashboard.start();assert.equal(h.dashboard.color,false);assert.equal(h.dashboard.showSecrets,false);}
 finally{h.close();}
 for(const config of [{env:{TERM:'dumb'}},{env:{CI:'true'}},{env:{YBR_DEV_PLAIN:'1'}},{args:['--plain']}]){
  const h=harness({tty:true,...config});
  try{h.dashboard.start();assert.equal(h.dashboard.interactive,false);assert.equal(h.dashboard.showSecrets,false);}
  finally{h.close();}
 }
});
test('child output is drained, split lines are reassembled and secrets never reach disk',async()=>{
 const h=harness();
 try{
  const stdout=new PassThrough(),stderr=new PassThrough();
  h.dashboard.attach('ganache',{stdout,stderr});
  stdout.write('Mnem');stdout.write('onic: '+mnemonic.slice(0,20));stdout.write(mnemonic.slice(20)+'\n');
  stdout.end('(0) '+privateKey+'\n');stderr.end('eth_chainId\n');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.dashboard.candidateMnemonic,mnemonic);
  const content=fs.readFileSync(h.dashboard.logFile,'utf8');
  assert.ok(!content.includes(mnemonic));assert.ok(!content.includes(privateKey));
  assert.match(content,/redacted/);assert.match(content,/eth_chainId/);
  assert.ok(!h.dashboard.state.logs.some(line=>line.includes('eth_chainId')));
 }finally{h.close();}
});
test('oversized child lines are omitted rather than partially leaking secrets',async()=>{
 const h=harness();
 try{
  const stdout=new PassThrough();h.dashboard.attach('test',{stdout});
  stdout.write('x'.repeat(9000));stdout.end('listener-fixture\nnormal\n');
  await new Promise(resolve=>setImmediate(resolve));
  const content=fs.readFileSync(h.dashboard.logFile,'utf8');
  assert.match(content,/oversized output line omitted/);assert.match(content,/normal/);
  assert.ok(!content.includes('listener-fixture'));
 }finally{h.close();}
});
test('activity ring buffer is bounded and saved logs rotate without credentials',()=>{
 const h=harness();
 try{
  for(let i=0;i<240;i++)h.dashboard.log('test','line '+i);
  assert.equal(h.dashboard.state.logs.length,200);
  fs.appendFileSync(h.dashboard.logFile,'x'.repeat(1024*1024));h.dashboard.logBytes=1024*1024+1;
  h.dashboard.log('test','rotated');
  assert.ok(fs.existsSync(h.dashboard.logFile+'.1'));
  assert.ok(fs.statSync(h.dashboard.logFile).size<1024);
  const lines=renderDashboard(h.dashboard.state,{view:'logs',columns:80,rows:24});
  assert.ok(lines.length<=23);
 }finally{h.close();}
});
