import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverWalletBricks,resolveScanStart,factoryStorageKey,MAX_SCAN_BLOCKS} from '../src/brick-viewer-model.js';

const creator='0x1111111111111111111111111111111111111111';
const other='0x2222222222222222222222222222222222222222';
const factory='0x3333333333333333333333333333333333333333';
const impl='0x4444444444444444444444444444444444444444';
const first='0x5555555555555555555555555555555555555555';
const second='0x6666666666666666666666666666666666666666';
const hash='0x'+'a'.repeat(64),id='0x'+'b'.repeat(64),digest='0x'+'c'.repeat(64);
const logs=[
 {address:factory,args:{originator:creator,brick:first,contentHash:hash},transactionHash:'0x'+'d'.repeat(64),blockNumber:2n,logIndex:0},
 {address:factory,args:{originator:creator,brick:second,contentHash:hash},transactionHash:'0x'+'e'.repeat(64),blockNumber:3n,logIndex:0}
];
function mockClient({deployed=true, controller=creator,wrongOriginator=false,latest=8n}={}){
 const calls=[];
 return {calls,
  async getBytecode(){return deployed?'0x6000':undefined},
  async getBlockNumber(){return latest},
  async getContractEvents(q){calls.push(q);return logs.filter(x=>x.blockNumber>=q.fromBlock&&x.blockNumber<=q.toBlock&&x.args.originator.toLowerCase()===q.args.originator.toLowerCase())},
  async readContract({address,functionName}){
   if(functionName==='implementation')return impl;
   if(functionName==='isBrick')return true;
   if(functionName==='originator')return wrongOriginator?other:creator;
   if(functionName==='controller')return address===second?other:controller;
   if(functionName==='ipId')return id;
   if(functionName==='contentHash')return hash;
   if(functionName==='metadataDigest')return digest;
   if(functionName==='metadataVersion')return 1n;
   if(functionName==='metadataURI')return 'road-local://sha256/example';
   throw Error('Unknown read '+functionName);
  }
 };
}

test('genesis and bounded block scans have honest completeness indicators',()=>{
 assert.deepEqual(resolveScanStart(10n,''),{start:0n,limited:false});
 assert.deepEqual(resolveScanStart(MAX_SCAN_BLOCKS+5n,''),{start:6n,limited:true});
 assert.deepEqual(resolveScanStart(15n,'0'),{start:0n,limited:false});
 assert.throws(()=>resolveScanStart(MAX_SCAN_BLOCKS,'0'),/exceeds 100,000/);
 assert.throws(()=>resolveScanStart(3n,'99'),/newer/);
 assert.throws(()=>resolveScanStart(3n,'-1'),/nonnegative/);
 assert.equal(factoryStorageKey(1337),'road:factory:1337');
});

test('wallet discovery validates factory, indexes originator and reads contract state',async()=>{
 const client=mockClient(),progress=[];
 const result=await discoverWalletBricks({client,factoryAddress:factory,wallet:creator,onProgress:x=>progress.push(x)});
 assert.equal(result.bricks.length,2);
 assert.equal(result.matchingEvents,2);
 assert.equal(result.limited,false);
 assert.equal(result.fromBlock,'0');
 assert.equal(result.toBlock,'8');
 assert.ok(client.calls.every(q=>q.eventName==='BrickDeployed'&&q.args.originator===creator));
 assert.equal(result.bricks[0].address,second);
 assert.equal(result.bricks[0].creatorIsController,false);
 assert.equal(result.bricks[1].creatorIsController,true);
 assert.equal(result.bricks[1].metadataDigest,digest);
 assert.equal(progress.length,1);
});

test('empty results do not imply that a wallet owns no IP',async()=>{
 const client=mockClient();
 const found=await discoverWalletBricks({client,factoryAddress:factory,wallet:other});
 assert.deepEqual(found.bricks,[]);
 assert.equal(found.matchingEvents,0);
});

test('rejects invalid factories and inconsistency between event and contract',async()=>{
 await assert.rejects(discoverWalletBricks({client:mockClient({deployed:false}),factoryAddress:factory,wallet:creator}),/No deployed contract/);
 await assert.rejects(discoverWalletBricks({client:mockClient({wrongOriginator:true}),factoryAddress:factory,wallet:creator}),/do not match/);
 await assert.rejects(discoverWalletBricks({client:mockClient(),factoryAddress:'not-an-address',wallet:creator}),/valid wallet/);
});
