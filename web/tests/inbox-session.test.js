import test from 'node:test';
import assert from 'node:assert/strict';
import {createLicensingClient} from '../src/licensing/client.js';
const address='0x'+'1'.repeat(40),hash='0x'+'2'.repeat(64);
const profile={chainId:1337,factoryAddress:address,genesisHash:hash,walletAddress:address,csrf:'csrf'};
const reader={getChainId:async()=>1337,getBlock:async()=>({number:1n,hash})};
test('a delayed sign-in response cannot attach a session after wallet disconnect',async()=>{
 let release,sessionRequested;
 const started=new Promise(resolve=>{sessionRequested=resolve;});
 const provider={request:async({method})=>method==='eth_chainId'?'0x539':method==='eth_getBlockByNumber'?{hash}:method==='personal_sign'?'0x'+'1'.repeat(130):[address]};
 const fetcher=async url=>({ok:true,json:async()=>{
  if(url.endsWith('/config'))return profile;
  if(url.endsWith('/challenge'))return {nonce:'n',message:'Sign in'};
  if(url.endsWith('/session')){sessionRequested();return new Promise(resolve=>{release=()=>resolve({token:'must-not-survive',address});});}
 }});
 const client=createLicensingClient({provider,fetcher,client:reader});await client.initialize();await client.connect();
 const login=client.login();await started;client.disconnect();release();await assert.rejects(login,/Connect|Wallet changed/);assert.equal(client.authenticated,false);assert.equal(client.account,null);
});
test('expired authenticated requests clear the shared session immediately',async()=>{
 let expired=false;
 const provider={request:async({method})=>method==='eth_chainId'?'0x539':method==='eth_getBlockByNumber'?{hash}:method==='personal_sign'?'0x'+'1'.repeat(130):[address]};
 const fetcher=async url=>({ok:!expired,status:expired?401:200,json:async()=>expired?{error:'Sign in again'}:url.endsWith('/config')?profile:url.endsWith('/challenge')?{nonce:'n',message:'Sign in'}:{token:'session',address}});
 const client=createLicensingClient({provider,fetcher,client:reader});await client.initialize();await client.connect();await client.login();assert.equal(client.authenticated,true);
 let updates=0;const unsubscribe=client.subscribe(()=>updates++);expired=true;await assert.rejects(client.api('/inbox'),/Sign in/);assert.equal(client.authenticated,false);assert.equal(updates,1);unsubscribe();
});
