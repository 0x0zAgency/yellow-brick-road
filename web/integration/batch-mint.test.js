/** Actual disposable Ganache + browser-style EIP-1193 signing, no wallet mocks for reads. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ganache from 'ganache';
import {createPublicClient,createWalletClient,http} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {mintOnChain,preflightPolicyMint,localConfig,requireBatchFactory} from '../src/chain-mint.js';
import {findReusableBricks,matchesReusableFiles} from '../src/reuse-bricks.js';
import {buildingFromPacket} from '../src/release-buildings.js';
import {policyAbi} from '../src/chain-mint.js';
import {DEFAULT_CONTENT_POLICY} from '../src/content-policy.js';
import {makeRegistrationPacket} from '../src/mint-model.js';
import {readBrickLicensingContact,updateBrickLicensingContact} from '../src/licensing-contact-chain.js';
import {coverAbi,decodeReceiptMetadata} from '../src/nft-cover-chain.js';
const imageURI='ipfs://bafy'+'a'.repeat(55);
for(const network of ['ganache','sepolia'])test(`atomic artwork mint on ${network}: one write, full receipts, rejection and uncertainty`,{timeout:90000},async t=>{
 const chainId=network==='sepolia'?11155111:1337;
 const server=ganache.server({logging:{quiet:true},chain:{chainId},wallet:{deterministic:true}});
 await server.listen(0,'127.0.0.1');t.after(()=>server.close());
 const rpcUrl='http://127.0.0.1:'+server.address().port,chain=localConfig(rpcUrl,chainId);
 const account=privateKeyToAccount(Object.values(server.provider.getInitialAccounts())[0].secretKey);
 const wallet=createWalletClient({account,chain,transport:http(rpcUrl)}),client=createPublicClient({chain,transport:http(rpcUrl)});
 const artifact=JSON.parse(fs.readFileSync(new URL('../../artifacts/contracts/YellowBrickFactory.sol/YellowBrickFactory.json',import.meta.url)));
 const hash=await wallet.deployContract({abi:artifact.abi,bytecode:artifact.bytecode});
 const factoryAddress=(await client.waitForTransactionReceipt({hash})).contractAddress;
 let sends=0,reject=false,replace=false,uncertain=false;
 const provider={async request({method,params=[]}){
  if(method==='eth_accounts')return [account.address];
  if(method==='eth_sendTransaction'){
   sends++;if(reject)throw Object.assign(Error('User rejected request'),{code:4001});
   if(replace)return wallet.sendTransaction({to:account.address,value:0n,gas:21000n});
   const tx=params[0];const sent=await wallet.sendTransaction({to:tx.to,data:tx.data,gas:BigInt(tx.gas),value:0n});
   if(uncertain)throw Error('Transport interrupted after broadcast');
   return sent;
  }
  return server.provider.request({method,params});
 }};
 const input={metadata:{title:'Atomic release test',artist:'Creator',songwriters:'Creator'},
  assets:{master:{name:'master.wav',type:'audio/wav',size:4,hash:'ab'.repeat(32)},preview:{name:'preview.wav',type:'audio/wav',size:4,hash:'bc'.repeat(32)},artwork:{name:'cover.png',type:'image/png',size:4,hash:'cd'.repeat(32)}},
  identity:{mode:'external',connected:true,address:account.address},composition:true,licensing:{email:'licensing@example.com'},royalties:{creatorBps:10000},training:'not-authorized',storage:'demo-encrypted-in-browser',contentPolicy:DEFAULT_CONTENT_POLICY};
 const packet=makeRegistrationPacket(input);
 const options={packet,provider,rpcUrl,chainId,network,factoryAddress,initialImageURI:imageURI};
 await preflightPolicyMint(options);assert.equal(sends,0);
 await assert.rejects(requireBatchFactory({readContract:async()=>{throw Error('method absent');}},factoryAddress),/predates one-transaction/);
 reject=true;await assert.rejects(mintOnChain(options),/rejected/i);assert.equal(sends,1);reject=false;sends=0;
 const result=await mintOnChain(options);
 assert.equal(sends,1);assert.equal(result.atomic,true);assert.equal(result.receipts.length,3);assert.equal(result.status,'confirmed');
 assert.equal(new Set(result.receipts.map(r=>r.transactionHash)).size,1);
 assert.equal(result.transactionHash,result.receipts[0].transactionHash);
 for(const receipt of result.receipts){
  assert.equal(receipt.licensingContact.email,'licensing@example.com');assert.equal(receipt.licensingContact.version,'1');
  assert.equal(receipt.status,'verified');assert.equal(receipt.gasScope,'batch');assert.equal(receipt.gasUsed,result.gasUsed);
  const metadata=decodeReceiptMetadata(await client.readContract({address:receipt.nftContractAddress,abi:coverAbi,functionName:'tokenURI',args:[BigInt(receipt.tokenId)]}));assert.equal(metadata.image,imageURI);
 }
 await assert.rejects(mintOnChain({...options,result}),/Do not remint/);assert.equal(sends,1);
 // The same reader/editor used by My Bricks works against the real contract.
 const contactOptions={provider,chainId,factoryAddress,brickAddress:result.receipts[0].contractAddress,walletAddress:account.address};
 const review=await readBrickLicensingContact(contactOptions);assert.equal(review.email,'licensing@example.com');
 const updated=await updateBrickLicensingContact({...contactOptions,review,email:'agreements+sync@example.com'});
 assert.equal(updated.contact.email,'agreements+sync@example.com');assert.equal(updated.contact.version,'2');
 const writesBeforeStale=sends;
 await assert.rejects(updateBrickLicensingContact({...contactOptions,review,email:'stale@example.com'}),/changed since review/);assert.equal(sends,writesBeforeStale);
 assert.equal((await readBrickLicensingContact({...contactOptions,brickAddress:result.receipts[1].contractAddress})).email,'licensing@example.com');
 // A wallet that returns another transaction must not cause false success.
 replace=true;const replaced={simulated:false,status:'pending',receipts:[]};
 await assert.rejects(mintOnChain({...options,result:replaced}),/replaced with a different operation/);
 assert.ok(replaced.receipts.every(r=>r.status==='pending'));replace=false;
 // A lost wallet reply is ambiguous, not a safe reason to mint again.
 uncertain=true;const unknown={simulated:false,status:'pending',receipts:[]},beforeUnknown=sends;
 await assert.rejects(mintOnChain({...options,result:unknown}),/Submission is uncertain/);
 assert.equal(sends,beforeUnknown+1);assert.equal(unknown.status,'submission-unknown');assert.equal(unknown.submissionAttempted,true);
 assert.equal(unknown.receipts.length,3);assert.ok(unknown.receipts.every(r=>r.predictedAddress&&r.nonce&&r.status==='submission-unknown'));
 await assert.rejects(mintOnChain({...options,result:unknown}),/Do not remint/);assert.equal(sends,beforeUnknown+1);uncertain=false;
 // After submitting one pending batch, all parts retain the SAME hash on timeout.
 await server.provider.request({method:'miner_stop',params:[]});const before=sends;
 const pending={simulated:false,status:'pending',receipts:[]};
 await assert.rejects(mintOnChain({...options,result:pending,receiptTimeoutMs:100}),/timed out/i);
 assert.equal(sends,before+1);assert.equal(pending.receipts.length,3);assert.ok(pending.receipts.every(r=>r.status==='pending'));
 assert.equal(new Set(pending.receipts.map(r=>r.transactionHash)).size,1);
 await assert.rejects(mintOnChain({...options,result:pending}),/Do not remint/);assert.equal(sends,before+1);
 // Reusing album artwork registers only the other parts and preserves the original NFT.
 await server.provider.request({method:'miner_start',params:[1]});
 const found=await findReusableBricks({...options,wallet:account.address});
 const art=found.candidates.find(c=>c.address.toLowerCase()===result.receipts.find(r=>r.sourceId==='artwork').contractAddress.toLowerCase());
 assert.ok(art);assert.ok(matchesReusableFiles(art,'artwork',packet.bricks.find(b=>b.localId==='artwork').metadata.media));
 const second=makeRegistrationPacket({...input,metadata:{...input.metadata,title:'Second album track'},assets:{...input.assets,master:{...input.assets.master,hash:'de'.repeat(32)}},reusedBricks:{artwork:art}});
 const beforeReuse=sends,nextImage='ipfs://bafy'+'b'.repeat(55);
 const reused=await mintOnChain({...options,packet:second,initialImageURI:nextImage});
 assert.equal(sends,beforeReuse+1);assert.equal(reused.receipts.length,3);assert.equal(reused.receipts.filter(r=>!r.reused).length,2);
 const retained=reused.receipts.find(r=>r.reused);assert.equal(retained.contractAddress.toLowerCase(),art.address.toLowerCase());assert.equal(retained.transactionHash,art.transactionHash);
 const oldMetadata=decodeReceiptMetadata(await client.readContract({address:art.nftContractAddress,abi:coverAbi,functionName:'tokenURI',args:[BigInt(art.tokenId)]}));assert.equal(oldMetadata.image,imageURI);
 const grouping=await buildingFromPacket(second,reused);assert.equal(grouping.members.find(m=>m.part==='artwork').address,art.address.toLowerCase());
 // Entirely reused file-backed parts need no mint transaction.
 const master=found.candidates.find(c=>c.address.toLowerCase()===result.receipts.find(r=>r.sourceId==='master').contractAddress.toLowerCase());
 const reuseOnly=makeRegistrationPacket({...input,composition:false,reusedBricks:{master,artwork:art}});
 const beforeOnly=sends,only=await mintOnChain({...options,packet:reuseOnly});assert.equal(sends,beforeOnly);assert.equal(only.transactionCount,0);assert.equal(only.receipts.length,2);assert.ok(only.receipts.every(r=>r.reused));
 const originalGrouping=await buildingFromPacket(packet,result),reusedGrouping=await buildingFromPacket(reuseOnly,only);assert.notEqual(reusedGrouping.id,originalGrouping.id,'A reused primary work must not overwrite the earlier Building');
 // A stale chain history, changed file set or revoked policy cannot authorize reuse.
 await assert.rejects(preflightPolicyMint({...options,packet:makeRegistrationPacket({...input,reusedBricks:{artwork:{...art,genesisHash:'0x'+'f'.repeat(64)}}})}),/previous chain history/);
 const changed=structuredClone(second);changed.bricks.find(b=>b.reuse).metadata.media[0].integrity.digest='0x'+'ef'.repeat(32);
 await assert.rejects(preflightPolicyMint({...options,packet:changed}),/Files changed/);
 const revoked=await wallet.writeContract({address:art.address,abi:policyAbi,functionName:'setPlayerPermissions',args:[0,1n,1n]});await client.waitForTransactionReceipt({hash:revoked});
 await assert.rejects(preflightPolicyMint({...options,packet:second}),/permissions or files changed/);
 assert.equal(sends,beforeOnly,'No signing on failed reuse checks');

});
