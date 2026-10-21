'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const {stripVTControlCharacters}=require('node:util');
const {MnemonicEditor,renderMnemonicMenu}=require('./dev-mnemonic-menu.cjs');
const {DevDashboard}=require('./dev-dashboard.cjs');
const {renderDashboard}=require('./dev-screen.cjs');
const {DEFAULT,changeAllowed,switchSelection}=require('./dev-ganache-profile.cjs');
const candidate={kind:'custom',id:'1'.repeat(40),account:'0x'+'1'.repeat(40),mnemonic:'test-only-secret-phrase'};
const context={phase:'READY',ganacheSource:'owned',playerSource:'owned'};
function editor(overrides={}){
 const states=[],calls=[],secrets=[];
 const instance=new MnemonicEditor({current:DEFAULT,generate:()=>candidate,validate:()=>candidate,
  onApply:async(...args)=>calls.push(args),onChange:state=>states.push(state),onSecret:value=>secrets.push(value),...overrides});
 return {instance,states,calls,secrets};
}
const key=(e,name,text='',extras={})=>e.handle(text,{name,...extras});
const tick=()=>new Promise(r=>setImmediate(r));
test('generate previews the new address but does not save until SWITCH is typed',async()=>{
 const {instance:e,calls,states,secrets}=editor();key(e,'g');
 assert.equal(e.state.account,candidate.account);assert.equal(calls.length,0);
 key(e,'return');await tick();assert.equal(calls.length,0);
 e.handle('SWITCH',{});key(e,'return');await tick();
 assert.equal(calls.length,1);assert.equal(calls[0][1],'default');assert.equal(states.at(-1),null);
 assert.deepEqual(secrets,[candidate.mnemonic]);assert.ok(!JSON.stringify(states).includes(candidate.mnemonic));
});
test('mnemonic input is hidden and dashboard shortcut letters are ordinary text',()=>{
 const {instance:e,states,calls}=editor();key(e,'i');
 for(const c of 'quit source private'){key(e,c,c);}
 assert.equal(e.value,'quit source private');assert.equal(e.state.stage,'input');assert.equal(calls.length,0);
 assert.ok(!JSON.stringify(states).includes('quit source private'));
 key(e,'backspace');assert.equal(e.value,'quit source privat');key(e,'u','',{ctrl:true});assert.equal(e.value,'');
});
test('bracketed multiline paste cannot submit or confirm',()=>{
 const {instance:e,calls}=editor();key(e,'i');
 e.handle('',{sequence:'\x1b[200~'});e.handle('first\nsecond\rthird',{});key(e,'return','\r');
 assert.equal(e.state.stage,'input');assert.equal(e.value,'first second third ');
 e.handle('',{sequence:'\x1b[201~'});key(e,'return');assert.equal(e.state.stage,'review');
 e.handle('',{sequence:'\x1b[200~'});e.handle('SWITCH',{});key(e,'return');e.handle('',{sequence:'\x1b[201~'});
 assert.equal(calls.length,0);assert.equal(e.confirm,'');
});
test('invalid phrases produce generic errors without reflecting input',()=>{
 const {instance:e,states}=editor({validate:()=>{throw Error('test-only-secret-phrase');}});key(e,'i');
 e.handle('unknown mnemonic words',{});key(e,'return');
 assert.equal(e.state.stage,'input');assert.match(e.state.error,/BIP-39/);
 assert.ok(!JSON.stringify(states).includes('unknown mnemonic words'));assert.ok(!JSON.stringify(states).includes(candidate.mnemonic));
});
test('escape and Ctrl+C cancel without applying and clear private input',()=>{
 for(const cancel of [{name:'escape'},{name:'c',ctrl:true}]){
  const {instance:e,calls,states}=editor();key(e,'i');e.handle('secret words',{});e.handle('',cancel);
  assert.equal(e.value,'');assert.equal(e.candidate,null);assert.equal(states.at(-1),null);assert.equal(calls.length,0);
 }
});
test('default selection is reversible and selecting current wallet is a no-op',()=>{
 const {instance:e,calls,states}=editor();key(e,'d');assert.equal(e.state.same,true);key(e,'return');
 assert.equal(states.at(-1),null);assert.equal(calls.length,0);
});
test('all menu layouts stay bounded and expose no raw mnemonic, even with secrets shown',()=>{
 for(const stage of ['menu','input','review','applying'])for(const [columns,rows] of [[80,24],[140,40],[60,16],[20,5]]){
  const state={mnemonicMenu:{stage,words:12,characters:120,account:candidate.account,profile:candidate.id,confirmation:'SWITCH'},ganache:{mnemonic:candidate.mnemonic}};
  const lines=renderDashboard(state,{columns,rows,color:true,showSecrets:true});
  assert.ok(lines.length<=rows-1);assert.ok(lines.every(line=>stripVTControlCharacters(line).length<=columns-1));
  assert.ok(!lines.join('\n').includes(candidate.mnemonic));
 }
 assert.match(renderMnemonicMenu({mnemonicMenu:{stage:'menu'}}).join('\n'),/FOLLOW THE YELLOW BRICK ROAD/);
});
test('guards refuse busy, externally managed and overridden stacks before any side effect',async()=>{
 for(const bad of [{phase:'STARTING'},{ganacheSource:'reused'},{playerSource:'reused'},{overrides:true}]){
  let stops=0,saves=0;
  assert.throws(()=>changeAllowed({...context,...bad}));
  await assert.rejects(switchSelection({root:'unused',candidate,expectedId:'default',context:{...context,...bad}},{stop:async()=>stops++,verifyStopped:async()=>true,save:()=>saves++}));
  assert.equal(stops,0);assert.equal(saves,0);
 }
});
test('a confirmed change stops and verifies before committing the selection',async()=>{
 const order=[];
 await switchSelection({root:'unused',candidate,expectedId:'default',context},{stop:async()=>order.push('stop'),verifyStopped:async()=>{order.push('verify');return true;},save:()=>order.push('save')});
 assert.deepEqual(order,['stop','verify','save']);
});
test('failed shutdown or an occupied port never saves the new mnemonic',async()=>{
 for(const stopFails of [true,false]){
  let saves=0;
  await assert.rejects(switchSelection({root:'unused',candidate,expectedId:'default',context},{stop:async()=>{if(stopFails)throw Error('stop failure');},verifyStopped:async()=>false,save:()=>saves++}));
  assert.equal(saves,0);
 }
});
test('same profile selection performs no shutdown or write',async()=>{
 const result=await switchSelection({root:'unused',candidate:DEFAULT,expectedId:'default',context},{stop:()=>assert.fail(),save:()=>assert.fail()});assert.equal(result.changed,false);
});
test('real terminal key parsing masks paste, preserves shortcuts outside the editor, and restores the terminal',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-menu-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const input=new PassThrough();input.isTTY=true;input.setRawMode=v=>{input.isRaw=v;};
 const output=new EventEmitter();output.isTTY=true;output.columns=80;output.rows=24;let screen='';output.write=text=>{screen+=text;return true;};
 let quits=0,applies=0;
 const dashboard=new DevDashboard({root,input,output,env:{TERM:'xterm'},onQuit:()=>quits++,mnemonicControl:{check:()=>{},current:()=>DEFAULT,generate:()=>candidate,validate:()=>candidate,onApply:async()=>applies++}});
 t.after(()=>{dashboard.close();input.destroy();});dashboard.start();
 const oldRows=dashboard.lastFrame.length,start=screen.length;
 input.write('m');
 assert.ok(dashboard.lastFrame.length<oldRows);
 assert.ok(screen.slice(start).includes('\x1b['+oldRows+';1H\x1b[2K'),'Clear trailing home rows when opening a shorter secret-input menu');
 input.write('i');input.write('\x1b[200~quit source private\nwords\x1b[201~');
 assert.equal(dashboard.state.mnemonicMenu.stage,'input');assert.equal(quits,0);assert.equal(applies,0);
 assert.ok(!screen.includes('quit source private'));assert.ok(!fs.readFileSync(dashboard.logFile,'utf8').includes('quit source private'));
 dashboard.keyHandler('',{name:'escape'});assert.equal(dashboard.state.mnemonicMenu,null);
 dashboard.keyHandler('',{name:'p'});assert.equal(dashboard.paused,true);
 dashboard.close();assert.equal(input.isRaw,false);assert.ok(screen.includes('\x1b[?2004l'));
});
