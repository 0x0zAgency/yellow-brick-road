import test from 'node:test';
import assert from 'node:assert/strict';
import {startupGanacheFactory,selectedMintFactory} from '../src/mint-factory.js';
import {loadMintNetwork,saveMintNetwork,MINT_SETTINGS_KEY} from '../src/mint-persistence.js';
const current='0x'+'1'.repeat(40),old='0x'+'2'.repeat(40),next='0x'+'3'.repeat(40);
const config={network:'ganache',chainId:'1337',rpcUrl:'http://127.0.0.1:8545',configuredFactory:current};
test('running Ganache factory is the default rather than a stale browser selection',()=>{
 const startupFactory=startupGanacheFactory(config);
 assert.equal(selectedMintFactory({startupFactory,storedFactory:old}),current);
 assert.equal(selectedMintFactory({startupFactory}),current);
 assert.equal(selectedMintFactory({startupFactory:startupGanacheFactory({...config,configuredFactory:next}),storedFactory:old}),next);
});
test('manual factory overrides remain available and are not silently replaced',()=>{
 assert.equal(selectedMintFactory({storedFactory:old,startupFactory:current,automatic:false}),old);
 assert.equal(selectedMintFactory({storedFactory:'',startupFactory:current,automatic:false}),'');
});
test('startup default applies only to the launcher loopback endpoint and chain',()=>{
 for(const rpcUrl of ['http://127.0.0.1:8545/','http://localhost:8545'])assert.equal(startupGanacheFactory({...config,rpcUrl}),current);
 for(const rpcUrl of ['http://127.0.0.1:9545','https://127.0.0.1:8545','http://127.0.0.1:8545/path','http://127.0.0.1:8545/?q=1','http://127.0.0.1:8545/#x','http://user@127.0.0.1:8545','https://remote.example','invalid'])assert.equal(startupGanacheFactory({...config,rpcUrl}),'');
 for(const chainId of [1,1338,11155111])assert.equal(startupGanacheFactory({...config,chainId}),'');
 assert.equal(startupGanacheFactory({...config,network:'sepolia'}),'');
});
test('missing or malformed startup configuration does not invent a factory',()=>{
 for(const configuredFactory of [undefined,null,'','not-an-address','0x'+'0'.repeat(40),current+' '])assert.equal(startupGanacheFactory({...config,configuredFactory}),'');
 assert.equal(selectedMintFactory({storedFactory:old,startupFactory:''}),old);
 assert.equal(selectedMintFactory(),'');
});
test('legacy saved settings adopt automatic mode while retaining all manual addresses',()=>{
 const map=new Map(),store={getItem:key=>map.get(key),setItem:(key,value)=>map.set(key,value)};
 const factories={'ganache:1337:http://127.0.0.1:8545':old,'sepolia:11155111':next};
 store.setItem(MINT_SETTINGS_KEY,JSON.stringify({version:1,data:{factories}}));
 const loaded=loadMintNetwork(store);assert.equal(loaded.useStartupFactory,true);assert.deepEqual(loaded.factories,factories);
 saveMintNetwork(store,{...loaded,useStartupFactory:false});
 assert.equal(loadMintNetwork(store).useStartupFactory,false);assert.deepEqual(loadMintNetwork(store).factories,factories);
 saveMintNetwork(store,{...loaded,useStartupFactory:true});assert.equal(loadMintNetwork(store).useStartupFactory,true);
 saveMintNetwork(store,{...loaded,useStartupFactory:'false'});assert.equal(loadMintNetwork(store).useStartupFactory,true,'Only boolean choices are persisted');
});
