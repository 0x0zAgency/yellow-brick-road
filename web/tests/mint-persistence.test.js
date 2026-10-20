import test from 'node:test';
import assert from 'node:assert/strict';
import {MINT_FORM_KEY,MINT_SETTINGS_KEY,loadMintForm,loadMintNetwork,saveMintForm,saveMintNetwork,clearMintForm,clearMintNetwork,defaultMintForm} from '../src/mint-persistence.js';

function storage(){
 const map=new Map();
 return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key),map};
}
test('form state is restored locally and never serializes private file or keys',()=>{
 const store=storage();
 const form={...defaultMintForm(),meta:{title:'Test Work',artist:'Local Author',genre:'Jazz'},ipCategoryId:'dance-move',spatial:{captureFormat:'BVH'},
  assets:{master:{name:'secret.mp3',hash:'secret-digest'}},secret:'PRIVATE_KEY_DO_NOT_WRITE',
  fees:{masterIngestionCents:1234,masterUseCents:56,writingIngestionCents:789,writingUseCents:10}};
 assert.equal(saveMintForm(store,form),true);
 const data=store.getItem(MINT_FORM_KEY);
 assert.ok(!data.includes('PRIVATE_KEY_DO_NOT_WRITE'));
 assert.ok(!data.includes('secret.mp3'));
 assert.equal(loadMintForm(store).meta.title,'Test Work');
 assert.equal(loadMintForm(store).ipCategoryId,'dance-move');
 assert.equal(loadMintForm(store).fees.masterIngestionCents,1234);
});
test('Ganache and Sepolia factory addresses persist independently by network profile',()=>{
 const store=storage();
 const network={network:'ganache',rpcUrl:'http://localhost:8545',ganacheChainId:'1337',rememberForm:true,
  factories:{'ganache:1337:http://localhost:8545':'0x'+'a'.repeat(40),'sepolia:11155111':'0x'+'b'.repeat(40)}};
 assert.equal(saveMintNetwork(store,network),true);
 const loaded=loadMintNetwork(store);
 assert.equal(loaded.factories['ganache:1337:http://localhost:8545'],'0x'+'a'.repeat(40));
 assert.equal(loaded.factories['sepolia:11155111'],'0x'+'b'.repeat(40));
 assert.equal(loaded.rpcUrl,'http://localhost:8545');
 assert.equal(loaded.rememberForm,true);
 assert.ok(!store.getItem(MINT_SETTINGS_KEY).includes('privateKey'));
});
test('invalid or corrupted local state falls back to safe defaults',()=>{
 const store=storage();
 store.setItem(MINT_FORM_KEY,'not-json');
 assert.equal(loadMintForm(store),null);
 store.setItem(MINT_SETTINGS_KEY,JSON.stringify({version:1,data:{network:'mainnet',rpcUrl:'https://evil.example/',ganacheChainId:'wrong',rememberForm:false,factories:{'unsupported:1':'0x123'}}}));
 const result=loadMintNetwork(store);
 assert.equal(result.network,'ganache');
 assert.equal(result.rpcUrl,'http://127.0.0.1:8545');
 assert.equal(result.ganacheChainId,'1337');
 assert.equal(result.rememberForm,false);
 assert.equal(result.factories['unsupported:1'],undefined);
 clearMintNetwork(store);clearMintForm(store);
 assert.equal(store.map.size,0);
});
