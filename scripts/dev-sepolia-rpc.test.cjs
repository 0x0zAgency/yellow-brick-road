'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {resolveSepoliaRpc}=require('./dev-sepolia-rpc.cjs');
const {rpcLabel,activeEnvironment}=require('./dev-network-profile.cjs');
const {prepareSepolia}=require('./dev-sepolia.cjs');
const shared='a'.repeat(32),custom='b'.repeat(32),factory='0x'+'1'.repeat(40),child='0x'+'2'.repeat(40),genesis='0x'+'3'.repeat(64);
function sdk(){
 const calls=[];
 return {calls,providers:{InfuraProvider:{
  getApiKey(key){calls.push(['key',key]);return {projectId:key||shared};},
  getUrl(network,key){calls.push(['network',network]);return {url:'https://sepolia.infura.io/v3/'+key.projectId};}
 }}};
}
test('fresh Sepolia setup resolves the SDK Infura default without RPC input or network calls',()=>{
 const ethers=sdk();assert.equal(resolveSepoliaRpc({env:{},ethersImpl:ethers}),'https://sepolia.infura.io/v3/'+shared);
 assert.deepEqual(ethers.calls,[['key',null],['network',{name:'sepolia',chainId:11155111}]]);
});
test('an optional operator key replaces shared access without asking for a URL',()=>{
 const ethers=sdk();
 assert.equal(resolveSepoliaRpc({env:{INFURA_API_KEY:custom},ethersImpl:ethers}),'https://sepolia.infura.io/v3/'+custom);
 assert.equal(resolveSepoliaRpc({env:{INFURA_API_KEY:shared,YBR_INFURA_API_KEY:custom},ethersImpl:ethers}),'https://sepolia.infura.io/v3/'+custom);
 assert.equal(resolveSepoliaRpc({env:{INFURA_API_KEY:custom},saved:{rpcUrl:'https://sepolia.infura.io/v3/'+shared},ethersImpl:ethers}),'https://sepolia.infura.io/v3/'+custom);
});
test('existing saved endpoints and explicit overrides survive the UI simplification',()=>{
 const ethers=sdk(),saved={rpcUrl:'https://saved.example.invalid/private'};
 assert.equal(resolveSepoliaRpc({env:{},saved,ethersImpl:ethers}),saved.rpcUrl);
 assert.equal(resolveSepoliaRpc({env:{SEPOLIA_RPC_URL:'https://operator.example.invalid/v3/key'},saved,ethersImpl:ethers}),'https://operator.example.invalid/v3/key');
 assert.equal(resolveSepoliaRpc({input:{rpcUrl:'http://127.0.0.1:9545'},env:{SEPOLIA_RPC_URL:'https://operator.example.invalid'},saved,ethersImpl:ethers}),'http://127.0.0.1:9545/');
 assert.equal(ethers.calls.length,0,'Explicit RPCs do not even resolve an Infura default');
});
test('invalid overrides, keys and SDK defaults fail closed without reflecting credentials',()=>{
 const ethers=sdk();
 for(const env of [{SEPOLIA_RPC_URL:'http://remote.example.invalid'},{INFURA_API_KEY:'private/bad?secret'},{INFURA_API_KEY:'bad key'}]){
  assert.throws(()=>resolveSepoliaRpc({env,ethersImpl:ethers}),error=>!error.message.includes('secret')&&!error.message.includes('bad key'));
 }
 for(const endpoint of ['https://mainnet.infura.io/v3/'+shared,'https://sepolia.infura.io','https://user:secret@sepolia.infura.io/v3/'+shared,'https://sepolia.infura.io/v3/'+shared+'?secret=x']){
  const bad=sdk();bad.providers.InfuraProvider.getUrl=()=>({url:endpoint});
  assert.throws(()=>resolveSepoliaRpc({env:{},ethersImpl:bad}),/default is invalid/);
 }
 const bad=sdk();bad.providers.InfuraProvider.getApiKey=()=>{throw Error('private SDK input');};
 assert.throws(()=>resolveSepoliaRpc({env:{},ethersImpl:bad}),error=>!error.message.includes('private SDK input'));
});
test('Infura URL paths and keys stay out of display labels and browser configuration',()=>{
 const rpcUrl=resolveSepoliaRpc({env:{INFURA_API_KEY:custom},ethersImpl:sdk()});
 assert.equal(rpcLabel(rpcUrl),'https://sepolia.infura.io / private endpoint');
 const environment=activeEnvironment({network:'sepolia',chainId:11155111,rpcUrl,factoryAddress:factory,genesisHash:genesis,deploymentBlock:1},'revision',{});
 const publicValues=Object.entries(environment).filter(([key])=>key.startsWith('VITE_'));
 assert.ok(publicValues.every(([,value])=>!String(value).includes(custom)&&!String(value).includes('/v3/')));
});
test('deployment preparation actually uses the default and cannot skip chain verification or send a transaction',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ybr-default-rpc-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const ethers=sdk();ethers.Contract=class {async implementation(){return child;}async receiptToken(){return child;}async contentPolicyVersion(){return 1;}async factory(){return factory;}};
 let chainId=11155111;const calls=[];
 const provider={async send(method){calls.push(method);assert.equal(method,'eth_chainId');return '0x'+chainId.toString(16);},async getBlock(n){assert.equal(n,0);return {hash:genesis};},async getCode(){return '0x1234';}};
 const plan=await prepareSepolia({root,input:{factoryAddress:factory,deploymentBlock:1},env:{},ethersImpl:ethers,provider});
 assert.equal(plan.kind,'reuse');assert.equal(plan.profile.rpcUrl,'https://sepolia.infura.io/v3/'+shared);
 assert.equal(plan.profile.chainId,11155111);assert.ok(plan.lines.every(line=>!line.includes(shared)));
 assert.equal(fs.existsSync(path.join(root,'.road-local')),false,'Review does not activate or persist a network');
 chainId=1;await assert.rejects(()=>prepareSepolia({root,input:{factoryAddress:factory},env:{},ethersImpl:ethers,provider}),/not Sepolia/);
 assert.deepEqual(calls,['eth_chainId','eth_chainId']);
});
