import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionData} from 'viem';
import {coverAbi,nftCoverTargets,nftCoverSession,decodeReceiptMetadata} from '../src/nft-cover-chain.js';
const account='0x'+'1'.repeat(40),collection='0x'+'2'.repeat(40),factory='0x'+'3'.repeat(40),brick='0x'+'4'.repeat(40),other='0x'+'5'.repeat(40),hash='0x'+'6'.repeat(64);
const image='ipfs://bafy'+'a'.repeat(55);
const mint=()=>({simulated:false,status:'confirmed',chainId:1337,factoryAddress:factory,receipts:[{status:'verified',chainId:1337,nftContractAddress:collection,contractAddress:brick,tokenId:'17'}]});
const tokenURI=image=>'data:application/json;base64,'+Buffer.from(JSON.stringify({name:'Yellow Brick Registration',image})).toString('base64');
function harness(){
 const state={chainId:'0x539',accounts:[account],version:1n,owner:account,brick,collection,factory,image:'data:placeholder',sends:0,input:null,fail:false};
 const provider={request:async({method})=>method==='eth_chainId'?state.chainId:state.accounts};
 const client={
  readContract:async({functionName})=>{if(state.fail)throw Error('legacy');return {artworkVersion:state.version,ownerOf:state.owner,brickForToken:state.brick,factory:state.factory,receiptToken:state.collection,tokenURI:tokenURI(state.image)}[functionName];},
  simulateContract:async parameters=>({request:parameters}),estimateContractGas:async()=>100000n,
  waitForTransactionReceipt:async()=>({status:'success',transactionHash:hash}),
  getTransaction:async()=>({from:account,to:collection,input:state.input})
 };
 const wallet={writeContract:async request=>{state.sends++;state.image=request.args[1];state.input=encodeFunctionData({abi:coverAbi,functionName:'setCovers',args:request.args});assert.equal(request.gas,120000n);return hash;}};
 return {state,provider,clients:{client,wallet}};
}
test('accepts only real verified single-collection receipt batches',()=>{
 assert.deepEqual(nftCoverTargets(mint()).tokenIds,[17n]);
 for(const patch of [{simulated:true},{status:'pending'},{chainId:0},{factoryAddress:'no'},{receipts:[]}])assert.throws(()=>nftCoverTargets({...mint(),...patch}));
 for(const patch of [{status:'pending'},{tokenId:'-1'},{tokenId:(1n<<256n).toString()},{contractAddress:'invalid'},{chainId:1}])assert.throws(()=>nftCoverTargets({...mint(),receipts:[{...mint().receipts[0],...patch}]}));
 assert.throws(()=>nftCoverTargets({...mint(),receipts:[mint().receipts[0],mint().receipts[0]]}),/Duplicate/);
 assert.throws(()=>nftCoverTargets({...mint(),receipts:[mint().receipts[0],{...mint().receipts[0],tokenId:'18',nftContractAddress:other}]}),/one NFT collection/);
});
test('legacy collection, wrong network, wrong owner and wrong linkage fail before writing',async()=>{
 for(const patch of [{fail:true},{version:2n},{chainId:'0x1'},{owner:other},{brick:other},{factory:other},{collection:other}]){
  const h=harness();Object.assign(h.state,patch);await assert.rejects(nftCoverSession({mint:mint(),...h}));assert.equal(h.state.sends,0);
 }
});
test('writes the actual standard image field and verifies returned tokenURI metadata',async()=>{
 const h=harness(),session=await nftCoverSession({mint:mint(),expectedAccount:account,...h});
 let observed;
 const result=await session.update(image,{onTransaction:hash=>observed=hash});
 assert.equal(h.state.sends,1);assert.equal(observed,hash);assert.equal(result.metadata[0].image,image);assert.deepEqual(result.tokenIds,['17']);
});
test('changing wallet/network after preparing the cover prevents a transaction',async()=>{
 for(const patch of [{accounts:[other]},{chainId:'0x1'}]){
  const h=harness(),session=await nftCoverSession({mint:mint(),...h});Object.assign(h.state,patch);
  await assert.rejects(session.update(image));assert.equal(h.state.sends,0);
 }
});
test('invalid image URI cannot trigger wallet operations',async()=>{
 const h=harness(),session=await nftCoverSession({mint:mint(),...h});
 await assert.rejects(session.update('https://host/cover'));assert.equal(h.state.sends,0);
});
test('malformed or unexpected tokenURI responses are rejected',()=>{
 assert.equal(decodeReceiptMetadata(tokenURI(image)).image,image);
 for(const bad of ['https://host/metadata','data:application/json;base64,!',tokenURI(image)+'a'.repeat(32000)])assert.throws(()=>decodeReceiptMetadata(bad));
});
