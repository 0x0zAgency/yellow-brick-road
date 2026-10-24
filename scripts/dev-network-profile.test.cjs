'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {readRecord,writeRecord,checkedProfile,checkedRpc,rpcLabel,activeEnvironment,readActiveProfile}=require('./dev-network-profile.cjs');
const {saveNetwork,NetworkControl,readNetwork}=require('./dev-network.cjs');
const {renderDashboard}=require('./dev-screen.cjs');
const temp=t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-active-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;};
const profile={version:1,network:'sepolia',chainId:11155111,rpcUrl:'https://rpc.example.invalid/key/private-test-value',factoryAddress:'0x'+'a'.repeat(40),genesisHash:'0x'+'b'.repeat(64),deploymentBlock:123};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('remote selection never falls back to Ganache; completed profiles persist privately without signer keys',t=>{
 const root=temp(t);saveNetwork(root,'sepolia','');assert.throws(()=>readActiveProfile(root,{}),/incomplete/);
 writeRecord(root,'sepolia',profile);assert.equal(readActiveProfile(root,{}).chainId,11155111);assert.equal(fs.statSync(path.join(root,'.road-local/networks/sepolia.json')).mode&0o077,0);
 const env=activeEnvironment(checkedProfile(profile),'revision',{SEPOLIA_PRIVATE_KEY:'private-test-secret',ANOTHER_MNEMONIC:'private words',SEPOLIA_RPC_URL:profile.rpcUrl,VITE_ROAD_GANACHE_FACTORY:'old'});
 assert.equal(env.SEPOLIA_PRIVATE_KEY,undefined);assert.equal(env.ANOTHER_MNEMONIC,undefined);assert.equal(env.VITE_ROAD_GANACHE_FACTORY,undefined);assert.equal(env.YBR_CHAIN_ID,'11155111');assert.ok(!Object.keys(env).filter(k=>k.startsWith('VITE_')).some(k=>String(env[k]).includes('private-test')));
});
test('unsafe profiles, linked paths and insecure remote RPCs are refused',t=>{
 assert.throws(()=>checkedRpc('http://remote.example.invalid'));assert.throws(()=>checkedRpc('https://user:pass@rpc.example.invalid'));assert.throws(()=>checkedRpc('file:///tmp/key'));assert.throws(()=>checkedProfile({...profile,chainId:1}));
 assert.equal(rpcLabel(profile.rpcUrl),'https://rpc.example.invalid / private endpoint');
 const root=temp(t);writeRecord(root,'sepolia',profile);const file=path.join(root,'.road-local/networks/sepolia.json'),target=path.join(root,'retain');fs.writeFileSync(target,'keep',{mode:0o600});fs.unlinkSync(file);fs.symlinkSync(target,file);assert.throws(()=>readRecord(root,'sepolia'));assert.throws(()=>writeRecord(root,'sepolia',profile));assert.equal(fs.readFileSync(target,'utf8'),'keep');
});
test('preparation and canceled quotes never select a new chain or authorize a deployment',async t=>{
 const root=temp(t);let deployments=0;const c=new NetworkControl({root,onReview:async()=>({kind:'deploy',lines:['Cost preview']}),onApply:async()=>deployments++});
 c.open();c.handle('s',{name:'s'});c.handle('',{name:'return'});await flush();assert.equal(c.menu.mode,'review');assert.equal(deployments,0);assert.equal(readNetwork(root).network,'ganache');
 c.handle('',{name:'return'});c.handle('DEPLOY SEPOLIA\n',{name:'paste'});assert.equal(c.buffer,'');c.handle('',{name:'escape'});assert.equal(deployments,0);assert.equal(readNetwork(root).network,'ganache');
});
test('only literal spending approval commits a deployment; failures preserve the previous selection',async t=>{
 const root=temp(t);let approved='',activated=0;const c=new NetworkControl({root,onReview:async()=>({kind:'deploy',lines:[]}),onApply:async(_plan,value)=>{approved=value;},onActivated:()=>activated++});
 c.open();c.handle('s',{name:'s'});c.handle('',{name:'return'});await flush();c.handle('',{name:'return'});c.handle('DEPLOY SEPOLIA',{});c.handle('',{name:'return'});await flush();assert.equal(approved,'DEPLOY SEPOLIA');assert.equal(readNetwork(root).network,'sepolia');assert.equal(activated,1);
 const before=readNetwork(root).revision;const failure=new NetworkControl({root,onReview:async()=>({kind:'reuse',lines:[]}),onApply:async()=>{throw Error('RPC offline');}});failure.open();failure.handle('g',{name:'g'});failure.handle('',{name:'return'});await flush();failure.handle('',{name:'return'});await flush();assert.equal(readNetwork(root).revision,before);assert.match(failure.menu.error,/offline/);
});
test('remote dashboard never shows a Ganache mnemonic, balance label or endpoint',()=>{
 const output=renderDashboard({phase:'READY',activeNetwork:{network:'sepolia',label:'Sepolia',chainId:11155111,rpcLabel:'https://rpc.example.invalid'},ganache:{source:'remote',account:profile.factoryAddress,balance:'0.4',mnemonic:'NEVER DISPLAY',privateKey:'ALSO PRIVATE'},services:{ganache:'UP'},music:{state:'SKIPPED'}},{columns:120,rows:30,showSecrets:true}).join('\n');
 assert.match(output,/ACTIVE SEPOLIA/);assert.match(output,/11155111/);assert.doesNotMatch(output,/NEVER DISPLAY|ALSO PRIVATE|127\.0\.0\.1:8545|LOCAL 1337|MINT SEPOLIA/);
});

test('bracketed paste cannot submit a hidden field or approve spending',async t=>{
 const root=temp(t);let sends=0;const c=new NetworkControl({root,onReview:async()=>({kind:'deploy',lines:[]}),onApply:async()=>sends++});
 c.open();c.handle('s',{name:'s'});c.handle('k',{name:'k'});c.handle('',{sequence:'\x1b[200~'});c.handle('0x'+'a'.repeat(64),{});c.handle('',{name:'return'});assert.equal(c.menu.mode,'input');c.handle('',{sequence:'\x1b[201~'});c.handle('',{name:'return'});assert.equal(c.menu.mode,'select');
 c.handle('',{name:'return'});await flush();c.handle('',{name:'return'});c.handle('',{sequence:'\x1b[200~'});c.handle('DEPLOY SEPOLIA',{});c.handle('',{name:'return'});c.handle('',{sequence:'\x1b[201~'});assert.equal(c.buffer,'');assert.equal(sends,0);assert.equal(readNetwork(root).network,'ganache');
});
test('malformed saved profile is not repaired silently by environment overrides',t=>{
 const root=temp(t);saveNetwork(root,'sepolia','');writeRecord(root,'sepolia',{...profile,chainId:1});assert.throws(()=>readActiveProfile(root,{YBR_CHAIN_ID:'11155111'}),/incomplete/);
});
