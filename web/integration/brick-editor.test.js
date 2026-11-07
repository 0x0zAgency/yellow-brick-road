import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ganache from 'ganache';
import {createWalletClient,createPublicClient,custom,sha256,toHex} from 'viem';
import {sepolia} from 'viem/chains';
import {makeRegistrationPacket} from '../src/mint-model.js';
import {mintOnChain} from '../src/chain-mint.js';
import {pinEncryptedBrickMetadata} from '../src/ipfs-upload.js';
import {brickDetails,openBrickMetadata,prepareBrickMetadata} from '../src/brick-editor.js';
import {readBrickForEditing,updateBrickMetadata,confirmBrickMetadataUpdate} from '../src/brick-editor-chain.js';
import {readBrickPolicy} from '../src/content-policy-chain.js';
import {RECOVERY_V2} from '../src/ipfs-recovery.js';

test('editing a locked real Brick changes only metadata, checks authority/staleness and confirms the exact transaction',{timeout:60000},async()=>{
 const node=ganache.provider({logging:{quiet:true},chain:{chainId:11155111},wallet:{deterministic:true}});
 try{
  const [account,other]=await node.request({method:'eth_accounts'});let writes=0;
  const provider={request:args=>{if(args.method==='eth_sendTransaction')writes++;return node.request(args);}};
  const wallet=createWalletClient({account,chain:sepolia,transport:custom(provider)}),client=createPublicClient({chain:sepolia,transport:custom(provider)});
  const artifact=JSON.parse(fs.readFileSync(new URL('../../artifacts/contracts/YellowBrickFactory.sol/YellowBrickFactory.json',import.meta.url)));
  const gas=await client.estimateGas({account,data:artifact.bytecode});
  const factoryAddress=(await client.waitForTransactionReceipt({hash:await wallet.deployContract({abi:artifact.abi,bytecode:artifact.bytecode,gas:gas+gas/5n})})).contractAddress;
  const secret='test-only-brick-editor-secret',store=new Map();
  const fetchImpl=async(url,options={})=>{
   if(options.method==='POST'){const bytes=options.body,digest=sha256(toHex(bytes)).slice(2),cid='bafy'+digest;store.set(cid,bytes);return Response.json({cid,sha256:digest,size:bytes.length,pinned:true,verified:true});}
   return new Response(store.get(url.split('/').at(-1)),{headers:{'Content-Type':'application/octet-stream'}});
  };
  let packet=makeRegistrationPacket({metadata:{title:'Visual work',artist:'Artist',ipCategory:'illustration'},assets:{master:{name:'art.png',hash:'ab'.repeat(32),size:4,type:'image/png'}},identity:{mode:'external',connected:true,address:account},royalties:{creatorBps:10000},training:'not-authorized',composition:false,contentPolicy:{locked:true,preview:false,artwork:false,lyrics:false}});
  packet=await pinEncryptedBrickMetadata({packet,secret,fetchImpl});
  const mint=await mintOnChain({packet,provider,chainId:11155111,network:'sepolia',factoryAddress});assert.equal(mint.status,'confirmed');
  const options={provider,chainId:11155111,factoryAddress,brickAddress:mint.receipts[0].contractAddress,walletAddress:account};
  const review=await readBrickForEditing(options),policy=await readBrickPolicy(options),kit={format:RECOVERY_V2,key:secret,assets:[],metadata:[]};
  assert.equal(policy.locked,true);
  const metadata=await openBrickMetadata({review,kit,fetchImpl}),draft=brickDetails(metadata);draft.title='Edited visual work';draft.description='A corrected description';
  const prepared=await prepareBrickMetadata({metadata,draft,review,kit,fetchImpl});
  const before=writes;
  await assert.rejects(updateBrickMetadata({...options,walletAddress:other,review,prepared}),/current Brick controller/);
  await assert.rejects(updateBrickMetadata({...options,review:{...review,genesisHash:'0x'+'ab'.repeat(32)},prepared}),/changed since review/);
  assert.equal(writes,before,'Failed checks never open a signing request');
  let submitted;
  const result=await updateBrickMetadata({...options,review,prepared,onSubmitted:hash=>{submitted=hash;}});
  assert.equal(writes,before+1);assert.equal(submitted,result.transactionHash);assert.equal(result.current.metadataVersion,'2');
  assert.equal(result.current.ipId,review.ipId);assert.equal(result.current.contentHash,review.contentHash);assert.equal(result.current.controller,review.controller);
  assert.deepEqual(await readBrickPolicy(options),policy,'Content lock, hashes and permissions stay intact');
  assert.equal((await openBrickMetadata({review:result.current,kit:prepared.backup,fetchImpl})).title,'Edited visual work');
  await assert.rejects(updateBrickMetadata({...options,review,prepared}),/changed since review/);assert.equal(writes,before+1);
  const resumed=await confirmBrickMetadataUpdate({...options,review,prepared,transactionHash:submitted});assert.equal(resumed.current.metadataVersion,'2');assert.equal(writes,before+1,'Checking confirmation does not resubmit');
  await assert.rejects(confirmBrickMetadataUpdate({...options,review,prepared:{...prepared,digest:'0x'+'cd'.repeat(32)},transactionHash:submitted}),/replaced with another operation/);
 }catch(e){throw Error([e.shortMessage||e.message,e.details].filter(Boolean).join('\n'));}
 finally{await node.disconnect();}
});
