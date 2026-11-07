import {createPublicClient,createWalletClient,custom,http,defineChain,isAddress,parseAbi,encodeFunctionData} from 'viem';
import {ACTIVE_NETWORK,activeRpcUrl,requireActiveNetwork} from './active-network.js';
import {BRICK_READ_ABI} from './brick-viewer-model.js';
import {validCid} from './ipfs-upload.js';
export const brickEditorAbi=parseAbi(['function isBrick(address) view returns (bool)','function updateMetadataWithDigest(string uri, bytes32 digest)']);
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
function clients(options){
 const {provider,chainId,factoryAddress,brickAddress}=options;
 if(!provider?.request||!Number.isSafeInteger(Number(chainId))||Number(chainId)<=0||!isAddress(factoryAddress)||!isAddress(brickAddress))throw Error('Connect a wallet and select a registered Brick.');
 requireActiveNetwork(Number(chainId),factoryAddress);
 const chain=defineChain({id:Number(chainId),name:'Brick network',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[]}}});
 return {client:createPublicClient({chain,transport:ACTIVE_NETWORK?http(activeRpcUrl(),{retryCount:0}):custom(provider,{retryCount:0})}),wallet:createWalletClient({chain,transport:custom(provider,{retryCount:0})})};
}
export async function readBrickForEditing(options){
 const {chainId,factoryAddress,brickAddress}=options;
 requireActiveNetwork(Number(chainId),factoryAddress);
 if(!isAddress(factoryAddress)||!isAddress(brickAddress))throw Error('Select a registered Brick.');
 const client=options.client||clients(options).client;
 if(await client.getChainId()!==Number(chainId))throw Error('Network changed. Reload the Brick.');
 const [head,genesis]=await Promise.all([client.getBlock(),client.getBlock({blockNumber:0n})]);
 if(ACTIVE_NETWORK&&!same(genesis.hash,ACTIVE_NETWORK.genesisHash))throw Error('The active chain history changed.');
 if(!await client.readContract({address:factoryAddress,abi:brickEditorAbi,functionName:'isBrick',args:[brickAddress],blockNumber:head.number}))throw Error('Brick is not registered in this factory.');
 const fields=['ipId','originator','controller','contentHash','metadataDigest','metadataVersion','metadataURI'];
 const values=await Promise.all(fields.map(functionName=>client.readContract({address:brickAddress,abi:BRICK_READ_ABI,functionName,blockNumber:head.number})));
 if(await client.getChainId()!==Number(chainId)||!same((await client.getBlock({blockNumber:head.number})).hash,head.hash))throw Error('Chain history changed while loading this Brick.');
 return {...Object.fromEntries(fields.map((key,i)=>[key,String(values[i])])),chainId:Number(chainId),factoryAddress,brickAddress,genesisHash:genesis.hash};
}
export async function assertBrickEditReview(options){
 options.assertActive?.();
 const {provider,chainId,walletAddress,review}=options;
 if(!review)throw Error('Load and review the Brick before saving.');
 if(Number(await provider.request({method:'eth_chainId'}))!==Number(chainId))throw Error('Switch your wallet to the Brick’s network.');
 const accounts=await provider.request({method:'eth_accounts'});
 if(!accounts.some(account=>same(account,walletAddress)))throw Error('Wallet account changed. Reload the editor.');
 const current=await readBrickForEditing(options);
 if(!same(current.controller,walletAddress))throw Error('Only the current Brick controller can edit this Brick.');
 for(const key of Object.keys(current))if(current[key]!==review[key])throw Error('Brick or chain changed since review. Reload before saving.');
 const {client}=clients(options),head=await client.getBlock();
 const walletHead=await provider.request({method:'eth_getBlockByNumber',params:['0x'+head.number.toString(16),false]});
 if(!same(head.hash,walletHead?.hash))throw Error('Wallet and reader point to different chain histories.');
 options.assertActive?.();
 return current;
}
function updateCall({brickAddress,walletAddress,prepared}){
 if(!prepared?.uri?.startsWith('ipfs://')||!validCid(prepared.uri.slice(7))||!/^0x[0-9a-f]{64}$/i.test(prepared.digest)||/^0x0+$/.test(prepared.digest))throw Error('Verified encrypted metadata is required.');
 return {address:brickAddress,abi:brickEditorAbi,functionName:'updateMetadataWithDigest',args:[prepared.uri,prepared.digest],account:walletAddress};
}
export async function confirmBrickMetadataUpdate(options){
 const {transactionHash,review,walletAddress,brickAddress,prepared}=options,{client}=clients(options),call=updateCall(options);
 const receipt=await client.waitForTransactionReceipt({hash:transactionHash,confirmations:1,timeout:120000});
 if(receipt.status!=='success')throw Error('Metadata update reverted: '+receipt.transactionHash);
 const tx=await client.getTransaction({hash:receipt.transactionHash});
 if(!same(tx.from,walletAddress)||!same(tx.to,brickAddress)||tx.value!==0n||tx.input!==encodeFunctionData(call))throw Error('The wallet transaction was replaced with another operation.');
 const current=await readBrickForEditing(options);
 if(!same(current.genesisHash,review.genesisHash)||!same(current.ipId,review.ipId)||!same(current.controller,walletAddress)||current.metadataURI!==prepared.uri||!same(current.metadataDigest,prepared.digest)||BigInt(current.metadataVersion)!==BigInt(review.metadataVersion)+1n)throw Error('The Brick changed after submission. Reload its current state before editing again.');
 return {transactionHash:receipt.transactionHash,current};
}
export async function updateBrickMetadata(options){
 const {client,wallet}=clients(options),call=updateCall(options);
 await assertBrickEditReview({...options,client});
 const {request}=await client.simulateContract(call),estimate=await client.estimateContractGas(call);request.gas=estimate+estimate/5n;
 await assertBrickEditReview({...options,client});
 const hash=await wallet.writeContract(request);
 options.onSubmitted?.(hash);
 return confirmBrickMetadataUpdate({...options,transactionHash:hash});
}
