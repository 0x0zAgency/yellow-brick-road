import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {encodeEventTopics} from 'viem';
import {checkMintContext,contentHashForBrick,digestMetadata,FACTORY_ABI,mintPacketOnChain} from '../src/road-chain.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const account='0x1111111111111111111111111111111111111111';
const factory='0x2222222222222222222222222222222222222222';
const implementation='0x3333333333333333333333333333333333333333';
const brickAddress='0x4444444444444444444444444444444444444444';
const provider={async request({method}){
 if(method==='eth_chainId')return '0x539';
 if(method==='eth_accounts')return [account];
 throw Error('Unexpected RPC '+method);
}};
const source={title:'Test track',media:[{role:'master',integrity:{digest:'0x'+'a'.repeat(64)}}]};
const packet={packetType:'LOCAL_PREVIEW_NOT_MINTED',bricks:[{localId:'master',role:'Recording',metadata:source}]};
const logs=[{address:factory,topics:encodeEventTopics({abi:FACTORY_ABI,eventName:'BrickDeployed',args:{ipId:'0x'+'5'.repeat(64),brick:brickAddress,originator:account}}),data:'0x'+'a'.repeat(64)}];
const publicClient={
 getBytecode:async()=> '0x6000',
 estimateContractGas:async()=>345000n,
 readContract:async({functionName})=>functionName==='implementation'?implementation:brickAddress,
 waitForTransactionReceipt:async()=>({status:'success',blockNumber:42n,gasUsed:42424n,logs}),
};

test('uses work hash for primary asset, metadata digest when no media is attached',()=>{
 assert.equal(contentHashForBrick(packet.bricks[0]),'0x'+'a'.repeat(64));
 assert.equal(contentHashForBrick({metadata:{title:'Lyrics',media:[]}}),digestMetadata({title:'Lyrics',media:[]}));
});

test('rejects chain mismatch and wallet account changes before signing',async()=>{
 await assert.rejects(checkMintContext({provider:{request:async({method})=>method==='eth_chainId'?'0xaa36a7':[account]},account,mode:'ganache',factoryAddress:factory}),/Wrong wallet network/);
 await assert.rejects(checkMintContext({provider:{request:async({method})=>method==='eth_chainId'?'0x539':[]},account,mode:'ganache',factoryAddress:factory}),/Connected wallet account changed/);
});

test('rejects missing factory and non-factory contracts',async()=>{
 await assert.rejects(checkMintContext({provider,account,mode:'ganache',factoryAddress:factory,publicClient:{getBytecode:async()=>undefined}}),/No smart contract/);
 await assert.rejects(checkMintContext({provider,account,mode:'ganache',factoryAddress:factory,publicClient:{getBytecode:async()=> '0x6000',readContract:async()=>{throw Error('not a factory')}}}),/does not expose the expected/);
});

test('requests wallet-signed deployment and verifies real-looking on-chain event',async()=>{
 const progress=[];let calls=0;
 const walletClient={writeContract:async({address,functionName,chain,args,gas})=>{
  calls++;assert.equal(address,factory);assert.equal(functionName,'deployBrickWithMetadataDigest');
  assert.equal(chain.id,1337);assert.equal(args[0],'0x'+'a'.repeat(64));assert.equal(gas,414000n);
  return '0x'+'6'.repeat(64);
 }};
 const result=await mintPacketOnChain({packet,provider,account,mode:'ganache',factoryAddress:factory,clients:{publicClient,walletClient},onProgress:v=>progress.push(v.phase)});
 assert.equal(calls,1);assert.equal(result.simulated,false);assert.equal(result.status,'ON_CHAIN_CONFIRMED');
 assert.equal(result.receipts[0].contractAddress,brickAddress);
 assert.equal(result.receipts[0].blockNumber,42);
 assert.equal(result.receipts[0].transactionHash,'0x'+'6'.repeat(64));
 assert.deepEqual(progress,['signing','confirming','confirmed']);
});

test('stops after partial confirmation and exposes first confirmed receipt',async()=>{
 const multi={...packet,bricks:[packet.bricks[0],{localId:'composition',role:'Writing',metadata:{title:'Test track',media:[]}}]};
 let calls=0;
 const walletClient={writeContract:async()=>{calls++;if(calls===2)throw Error('User rejected transaction');return '0x'+'6'.repeat(64);}};
 await assert.rejects(
  mintPacketOnChain({packet:multi,provider,account,mode:'ganache',factoryAddress:factory,clients:{publicClient,walletClient}}),
  e=>e.confirmedReceipts?.length===1&&/User rejected transaction/.test(e.message)
 );
 assert.equal(calls,2);
});
