'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {PassThrough}=require('node:stream');
const {connections,readNetwork,saveNetwork,startupNetworkEnv,NetworkControl,renderNetworkMenu}=require('./dev-network.cjs');
const {DevDashboard}=require('./dev-dashboard.cjs');
const {renderDashboard}=require('./dev-screen.cjs');
const temp=t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-net-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const interfaces=()=>({lo:[{address:'127.0.0.1',internal:true,family:'IPv4'}],en0:[{address:'192.168.2.5',internal:false,family:'IPv4'},{address:'fe80::1',internal:false,family:'IPv6'}],bad:[{address:'not-an-address'},{address:'0.0.0.0'}]});
test('assigned connections include loopback, IPv4 and IPv6; not guessed SSIDs or listening URLs',()=>{
 const list=connections(interfaces);assert.equal(list.length,3);assert.equal(list[0].internal,true);
 assert.ok(list.some(x=>x.family==='IPv6'));assert.equal(connections(()=>{throw Error();}).length,0);
 assert.ok(list.every(x=>!x.url&&!x.mac));
});
test('private persistent active selection is isolated and uses optimistic concurrency',t=>{
 const root=temp(t);assert.equal(readNetwork(root).network,'ganache');assert.deepEqual(startupNetworkEnv(root),{});
 const s=saveNetwork(root,'sepolia','');assert.equal(readNetwork(root).network,'sepolia');
 assert.equal(fs.statSync(path.join(root,'.road-local/dev-network.json')).mode&0o077,0);
 assert.deepEqual(startupNetworkEnv(root),{VITE_ROAD_DEFAULT_NETWORK:'sepolia',VITE_ROAD_NETWORK_SELECTION:s.revision});
 assert.throws(()=>saveNetwork(root,'mainnet'),/Choose/);assert.throws(()=>saveNetwork(root,'ganache',''),/elsewhere/);
 const retained=path.join(root,'.road-local/player-interactions');fs.mkdirSync(retained);fs.writeFileSync(path.join(retained,'events.ndjson'),'keep');
 saveNetwork(root,'ganache',s.revision);assert.equal(fs.readFileSync(path.join(retained,'events.ndjson'),'utf8'),'keep');
});
test('unsafe settings paths are refused without following links or changing their contents',t=>{
 const root=temp(t);fs.mkdirSync(path.join(root,'.road-local'));const target=path.join(root,'keep');fs.writeFileSync(target,'private',{mode:0o600});
 fs.symlinkSync(target,path.join(root,'.road-local/dev-network.json'));
 assert.throws(()=>readNetwork(root));assert.throws(()=>saveNetwork(root,'sepolia'));assert.equal(fs.readFileSync(target,'utf8'),'private');
});
test('retained interface helper does not change network; cancel and explicit confirmation are separate',async t=>{
 const root=temp(t);let applied=0;const c=new NetworkControl({root,getInterfaces:interfaces,onReview:async()=>({kind:'reuse',lines:['Verified test factory']}),onApply:async()=>applied++});
 c.cycle();assert.equal(c.connection.name,'lo');c.cycle();assert.equal(c.connection.name,'en0');
 assert.equal(readNetwork(root).revision,'');c.open();c.handle('s',{name:'s'});c.handle('',{name:'escape'});assert.equal(applied,0);
 c.open();c.handle('s',{name:'s'});c.handle('',{name:'return'});await flush();assert.equal(readNetwork(root).revision,'');
 c.handle('',{name:'return'});await flush();assert.equal(readNetwork(root).network,'sepolia');assert.equal(applied,1);
});
test('network screen stays bounded and hides interface and RPC-entry controls',()=>{
 for(const columns of [30,60,80,140])for(const rows of [8,18,24,50]){
  const lines=renderNetworkMenu({networkMenu:{network:'sepolia',connection:{name:'en0\x1b\x07',family:'IPv4',address:'192.168.1.2'}}},{columns,rows});
  assert.ok(lines.length<rows);assert.ok(lines.every(x=>x.length<columns&&!/[\x00-\x1f]/.test(x)));assert.match(lines.at(-1),/Esc/);assert.doesNotMatch(lines.join('\n'),/\[i\]|\[u\]|192\.168\.1\.2|en0/);
 }
 assert.match(renderNetworkMenu({networkMenu:{network:'sepolia'}},{}).join('\n'),/Switches Mint Studio, Player, Registry/);
});
test('actual dashboard retains network control but i/u cannot cycle interfaces or open RPC input',async t=>{
 const root=temp(t),output=new PassThrough(),input=new PassThrough();output.on('data',()=>{});Object.assign(output,{isTTY:true,columns:80,rows:24});Object.assign(input,{isTTY:true,setRawMode(){}});let quits=0;
 const d=new DevDashboard({root,output,input,env:{},onQuit:()=>quits++,networkActions:{onReview:async()=>({kind:'reuse',lines:['Verified test deployment']}),onApply:async()=>{}}});t.after(()=>d.close());d.start();
 let scans=0;d.networkControl.getInterfaces=()=>{scans++;return interfaces();};
 input.emit('keypress','i',{name:'i'});assert.equal(d.networkControl.connection,null);assert.equal(scans,0);
 input.emit('keypress','n',{name:'n'});assert.equal(d.state.networkMenu,undefined);
 d.update({phase:'READY'});input.emit('keypress','n',{name:'n'});assert.ok(d.state.networkMenu);
 input.emit('keypress','s',{name:'s'});input.emit('keypress','i',{name:'i'});input.emit('keypress','u',{name:'u'});assert.equal(d.state.networkMenu.mode,'select');assert.equal(d.networkControl.connection,null);assert.equal(scans,0);input.emit('keypress','',{name:'escape'});assert.equal(d.state.networkMenu,null);assert.equal(quits,0);
 input.emit('keypress','n',{name:'n'});input.emit('keypress','s',{name:'s'});input.emit('keypress','',{name:'return'});await flush();input.emit('keypress','',{name:'return'});await flush();
 assert.equal(readNetwork(root).network,'sepolia');assert.equal(quits,1);
});


test('home, details and logs never display the hidden interface feature, even with stale state',()=>{
 for(const view of ['home','details','logs'])for(const columns of [60,80,120,180]){
  const output=renderDashboard({phase:'READY',connectionReference:'en0 / 192.168.99.5',services:{},logs:[]},{view,columns,rows:40}).join('\n');
  assert.doesNotMatch(output,/\[i\]|\[u\]|192\.168\.99\.5|cycle machine|No assigned network interfaces/);
 }
 const menu=renderNetworkMenu({networkMenu:{network:'sepolia',mode:'select'}},{}).join('\n');
 assert.match(menu,/Infura default/);assert.match(menu,/test signer/);assert.match(menu,/ETH ceiling/);
});
test('hidden i/u shortcuts do not affect quotes but are still ordinary text in private input',async t=>{
 const c=new NetworkControl({root:temp(t),getInterfaces:()=>{throw Error('No interface discovery allowed');},onReview:async()=>({kind:'deploy',lines:['Cost preview']})});
 c.open();c.handle('s',{name:'s'});c.handle('i',{name:'i'});c.handle('u',{name:'u'});assert.equal(c.menu.mode,'select');assert.deepEqual(c.options,{});
 c.handle('',{name:'return'});await flush();const plan=c.plan;c.handle('i',{name:'i'});c.handle('u',{name:'u'});assert.equal(c.plan,plan);assert.equal(c.menu.mode,'review');
 c.handle('k',{name:'k'});c.handle('i',{name:'i'});c.handle('u',{name:'u'});assert.equal(c.buffer,'iu');assert.equal(c.menu.mode,'input');
 c.handle('',{name:'escape'});assert.equal(c.menu,null);assert.equal(c.buffer,'');
});


test('optional Infura keys are redacted from saved dashboard logs',t=>{
 const root=temp(t),output=new PassThrough(),input=new PassThrough();output.on('data',()=>{});
 const first='test-infura-key-one',second='test-infura-key-two';
 const d=new DevDashboard({root,output,input,env:{INFURA_API_KEY:first,YBR_INFURA_API_KEY:second}});t.after(()=>d.close());
 d.log('launcher','Warning: '+first+' / '+second);
 const log=fs.readFileSync(path.join(root,'.road-local/dev-stack.log'),'utf8');assert.doesNotMatch(log,/test-infura-key/);assert.match(log,/redacted/);
});
