import {createPublicClient,createWalletClient,custom,http,defineChain,isAddress,encodeFunctionData,parseAbi} from 'viem';
import {ACTIVE_NETWORK,activeRpcUrl,requireActiveNetwork} from './active-network.js';
import {licensingContactAbi,normalizeLicensingEmail} from './licensing-contact.js';
const factoryAbi=parseAbi(['function isBrick(address) view returns (bool)']);
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
function clients({provider,chainId,factoryAddress,brickAddress}){
 if(!provider?.request||!Number.isSafeInteger(Number(chainId))||Number(chainId)<=0)throw Error('Connect a wallet on the Brick’s network.');
 if(!isAddress(factoryAddress)||!isAddress(brickAddress))throw Error('Select a registered Brick and its factory.');
 requireActiveNetwork(Number(chainId),factoryAddress);
 const chain=defineChain({id:Number(chainId),name:'Brick network',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[]}}});
 return {client:createPublicClient({chain,transport:ACTIVE_NETWORK?http(activeRpcUrl(),{retryCount:0}):custom(provider,{retryCount:0})}),wallet:createWalletClient({chain,transport:custom(provider,{retryCount:0})})};
}
/** Resolve from the Brick at a consistent block; no metadata decryption or email service. */
export async function readBrickLicensingContact(options){
 const {chainId,factoryAddress,brickAddress}=options;
 if(!isAddress(factoryAddress)||!isAddress(brickAddress))throw Error('Select a registered Brick and its factory.');
 requireActiveNetwork(Number(chainId),factoryAddress);
 const client=options.client||clients(options).client;
 if(await client.getChainId()!==Number(chainId))throw Error('Network changed. Read the licensing contact again.');
 const [head,genesis]=await Promise.all([client.getBlock(),client.getBlock({blockNumber:0n})]);
 if(ACTIVE_NETWORK&&!same(genesis.hash,ACTIVE_NETWORK.genesisHash))throw Error('The active chain history changed.');
 if(!await client.readContract({address:factoryAddress,abi:factoryAbi,functionName:'isBrick',args:[brickAddress],blockNumber:head.number}))throw Error('This Brick is not registered in the selected factory.');
 let value;
 try{value=await client.readContract({address:brickAddress,abi:licensingContactAbi,functionName:'licensingContact',blockNumber:head.number});}
 catch{throw Error('Could not read a licensing contact. Older immutable Bricks do not support this field; also check your RPC connection.');}
 const [email,version,authority]=value;normalizeLicensingEmail(email);
 if(await client.getChainId()!==Number(chainId)||!same((await client.getBlock({blockNumber:head.number})).hash,head.hash))throw Error('Chain history changed while reading the contact.');
 return {email,version:String(version),authority,chainId:Number(chainId),factoryAddress,brickAddress,genesisHash:genesis.hash};
}
export async function updateBrickLicensingContact(options){
 const {provider,chainId,brickAddress,walletAddress,review}=options,email=normalizeLicensingEmail(options.email);
 if(!review)throw Error('Read the current licensing contact before saving.');
 const {client,wallet}=clients(options);
 const check=async()=>{
  if(Number(await provider.request({method:'eth_chainId'}))!==Number(chainId))throw Error('Switch your wallet to the Brick’s network before signing.');
  const accounts=await provider.request({method:'eth_accounts'});
  if(!accounts.some(account=>same(account,walletAddress)))throw Error('Wallet account changed.');
  const current=await readBrickLicensingContact(options);
  if(!same(current.authority,walletAddress))throw Error('Only the current Brick controller can update the licensing contact.');
  for(const key of ['email','version','authority','chainId','factoryAddress','brickAddress','genesisHash']){
   if(current[key]!==review[key])throw Error('Licensing contact or chain changed since review. Read it again before signing.');
  }
  const head=await client.getBlock(),walletHead=await provider.request({method:'eth_getBlockByNumber',params:['0x'+head.number.toString(16),false]});
  if(!same(head.hash,walletHead?.hash))throw Error('Wallet and reader point to different chain histories.');
 };
 await check();
 const args=[email,BigInt(review.version)],functionName='setLicensingContact';
 const call={address:brickAddress,abi:licensingContactAbi,functionName,args,account:walletAddress};
 const {request}=await client.simulateContract(call),estimate=await client.estimateContractGas(call);request.gas=estimate+estimate/5n;
 await check();
 const hash=await wallet.writeContract(request);
 const receipt=await client.waitForTransactionReceipt({hash,confirmations:1,timeout:120000});
 if(receipt.status!=='success')throw Error('Contact update reverted: '+receipt.transactionHash);
 const tx=await client.getTransaction({hash:receipt.transactionHash});
 if(!same(tx.from,walletAddress)||!same(tx.to,brickAddress)||tx.value!==0n||tx.input!==encodeFunctionData({abi:licensingContactAbi,functionName,args}))throw Error('The wallet transaction was replaced with another operation.');
 const contact=await readBrickLicensingContact(options);
 if(contact.email!==email||BigInt(contact.version)!==BigInt(review.version)+1n||!same(contact.authority,walletAddress)||!same(contact.genesisHash,review.genesisHash))throw Error('The contact changed after submission. Read the Brick again before retrying.');
 return {transactionHash:receipt.transactionHash,contact};
}
