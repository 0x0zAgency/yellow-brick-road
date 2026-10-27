import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ganache from 'ganache';
import {createWalletClient, http, createPublicClient} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {connectChain,mintLegacyOnChain as mintOnChain,localConfig} from '../src/chain-mint.js';
import {makeRegistrationPacket} from '../src/mint-model.js';

for(const network of ['ganache','sepolia'])test(`explicit legacy wallet-signed ${network} compatibility path against a disposable local chain`,async t=>{
 const testChainId=network==='sepolia'?11155111:1337;
 const testChainHex='0x'+testChainId.toString(16);
 const server=ganache.server({logging:{quiet:true},chain:{chainId:testChainId,networkId:5777},wallet:{deterministic:true}});
 await server.listen(0,'127.0.0.1');t.after(()=>server.close());
 const rpcUrl='http://127.0.0.1:'+server.address().port,chain=localConfig(rpcUrl,testChainId);
 const key=Object.values(server.provider.getInitialAccounts())[0].secretKey;
 const account=privateKeyToAccount(key),wallet=createWalletClient({account,chain,transport:http(rpcUrl)}),client=createPublicClient({chain,transport:http(rpcUrl)});
 const artifact=JSON.parse(fs.readFileSync(new URL('../../artifacts/contracts/YellowBrickFactory.sol/YellowBrickFactory.json',import.meta.url)));
 const deployHash=await wallet.deployContract({abi:artifact.abi,bytecode:artifact.bytecode});
 const factoryAddress=(await client.waitForTransactionReceipt({hash:deployHash})).contractAddress;
 let sends=0,reject=false,walletChain=testChainHex,otherHistory=false,disconnect=false;
 const provider={async request({method,params}){
  if(method==='eth_chainId')return walletChain;
  if(method==='eth_accounts')return disconnect?[]:[account.address];
  if(method==='eth_getBlockByNumber'&&otherHistory)return {hash:'0x'+'00'.repeat(32)};
  if(method==='eth_sendTransaction'){
   if(reject)throw Object.assign(Error('User rejected request'),{code:4001});
   sends++;
   const tx=params[0];
   assert.ok(BigInt(tx.gas)>90000n,'Factory mint must include an estimated gas limit, not the wallet default');
   return wallet.sendTransaction({to:tx.to,data:tx.data,gas:tx.gas?BigInt(tx.gas):undefined,value:0n});
  }
  return server.provider.request({method,params});
 }};
 const config={provider,rpcUrl,chainId:testChainId,network,account:account.address};
 walletChain='0x1691';await assert.rejects(connectChain(config),/Switch your wallet|RPC chain ID/);walletChain=testChainHex;
 if(network==='ganache'){
  await assert.rejects(connectChain({...config,chainId:5777}),/RPC chain ID/);
  otherHistory=true;await assert.rejects(connectChain(config),/different blockchain histories/);otherHistory=false;
 }
 disconnect=true;await assert.rejects(connectChain(config),/account changed/);disconnect=false;
 const packet=makeRegistrationPacket({metadata:{artist:'Creator',title:'Test recording',songwriters:'Writer'},assets:{master:{name:'work.bin',hash:'ab'.repeat(32),size:4},artwork:{name:'art.png',hash:'cd'.repeat(32),size:4}},identity:{mode:'external',connected:true,address:account.address},royalties:{creatorBps:10000},training:'separate-license',composition:true,storage:'demo-encrypted-in-browser'});
 const options={...config,packet,factoryAddress};
 await assert.rejects(mintOnChain({...options,factoryAddress:account.address}),/no contract/);
 reject=true;await assert.rejects(mintOnChain(options),/rejected/i);assert.equal(sends,0);reject=false;
 const result=await mintOnChain(options);
 assert.equal(result.simulated,false);assert.equal(result.status,'confirmed');assert.equal(result.receipts.length,3);assert.equal(sends,3);
 for(const receipt of result.receipts){
  assert.equal(receipt.status,'verified');assert.match(receipt.transactionHash,/^0x[0-9a-f]{64}$/);
  assert.ok(await client.getBytecode({address:receipt.contractAddress}));
  assert.match(receipt.nftContractAddress,/^0x[0-9a-f]{40}$/i);
  assert.ok(BigInt(receipt.tokenId)>0n);
  assert.equal(await client.readContract({address:receipt.nftContractAddress,abi:[{type:'function',name:'ownerOf',stateMutability:'view',inputs:[{type:'uint256'}],outputs:[{type:'address'}]}],functionName:'ownerOf',args:[BigInt(receipt.tokenId)]}),account.address);
 }
 const partial={simulated:false,status:'pending',receipts:[]};let updates=0;
 await assert.rejects(mintOnChain({...options,result:partial,onUpdate:message=>{if(message.startsWith('Verified')&&++updates===1)reject=true}}),/rejected/i);
 assert.equal(partial.receipts.length,1);assert.equal(partial.receipts[0].status,'verified');
 await assert.rejects(mintOnChain({...options,result:partial}),/prior transaction/);
 reject=false;
 await server.provider.request({method:'evm_setAccountBalance',params:[account.address,'0x0']});
 await assert.rejects(mintOnChain(options),/funds|balance/i);
 await server.provider.request({method:'evm_setAccountBalance',params:[account.address,'0x3635c9adc5dea00000']});
 await server.provider.request({method:'miner_stop',params:[]});
 const pending={simulated:false,status:'pending',receipts:[]};
 await assert.rejects(mintOnChain({...options,result:pending,receiptTimeoutMs:100}),/timed out/i);
 assert.equal(pending.receipts.length,1);assert.equal(pending.receipts[0].status,'pending');
 assert.match(pending.receipts[0].transactionHash,/^0x[0-9a-f]{64}$/);
});
