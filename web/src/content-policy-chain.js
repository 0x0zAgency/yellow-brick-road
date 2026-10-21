import {createPublicClient,createWalletClient,custom,defineChain,parseAbi,encodeFunctionData} from 'viem';
import {policyAbi} from './chain-mint.js';
const stateAbi=parseAbi(['function controller() view returns (address)','function isBrick(address) view returns (bool)']);
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
function clients(provider,chainId){
 if(!provider?.request||![1337,11155111].includes(Number(chainId)))throw Error('Select the supported Ganache or Sepolia network in your wallet.');
 const chain=defineChain({id:Number(chainId),name:'YBR test chain',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[]}}});
 return {client:createPublicClient({chain,transport:custom(provider)}),wallet:createWalletClient({chain,transport:custom(provider)})};
}
export async function readBrickPolicy({provider,chainId,factoryAddress,brickAddress}){
 const {client}=clients(provider,chainId);
 if(await client.getChainId()!==Number(chainId))throw Error('Wallet network changed. Read the Brick again.');
 if(!await client.readContract({address:factoryAddress,abi:stateAbi,functionName:'isBrick',args:[brickAddress]}))throw Error('Brick is not registered in this factory.');
 const head=await client.getBlock();
 const read=(functionName,abi=policyAbi)=>client.readContract({address:brickAddress,abi,functionName,blockNumber:head.number});
 let enabled;
 try{enabled=await read('contentPolicyEnabled');}catch{throw Error('Policy unavailable. This may be a legacy Brick; no permission or lock is inferred.');}
 if(!enabled)throw Error('Legacy registration: this Brick was not initialized with a content policy.');
 const [controller,revision,permissionVersion,permissions,locked,currentContentHash,files]=await Promise.all([
  read('controller',stateAbi),read('contentRevision'),read('playerPermissionVersion'),read('effectivePlayerPermissions'),
  read('contentLocked'),read('currentContentHash'),read('fileCommitments')]);
 if(await client.getChainId()!==Number(chainId)||!same((await client.getBlock({blockNumber:head.number})).hash,head.hash))throw Error('Chain history changed while reading policy.');
 return {controller,revision:String(revision),permissionVersion:String(permissionVersion),permissions:Number(permissions),locked,currentContentHash,files:[...files]};
}
export async function updateBrickPolicy(options){
 const {provider,chainId,brickAddress,walletAddress,review,action,permissions}=options;
 const {client,wallet}=clients(provider,chainId);
 const check=async()=>{
  if(await client.getChainId()!==Number(chainId))throw Error('Wallet network changed.');
  const accounts=await provider.request({method:'eth_accounts'});
  if(!accounts.some(account=>same(account,walletAddress)))throw Error('Wallet account changed.');
  const current=await readBrickPolicy(options);
  if(!same(current.controller,walletAddress))throw Error('Only the current Brick controller can change this policy.');
  if(current.revision!==review.revision||current.permissionVersion!==review.permissionVersion||current.locked!==review.locked)throw Error('Policy changed since review. Reload it before signing.');
 };
 await check();
 if(!['permissions','lock'].includes(action))throw Error('Unsupported policy action.');
 if(action==='permissions'&&(!Number.isInteger(permissions)||permissions<0||permissions>7))throw Error('Invalid permission selection.');
 const functionName=action==='lock'?'lockContent':'setPlayerPermissions';
 const args=action==='lock'?[BigInt(review.revision)]:[permissions,BigInt(review.revision),BigInt(review.permissionVersion)];
 const call={address:brickAddress,abi:policyAbi,functionName,args,account:walletAddress};
 const {request}=await client.simulateContract(call);
 const estimate=await client.estimateContractGas(call);request.gas=estimate+estimate/5n;
 await check();
 const hash=await wallet.writeContract(request);
 const receipt=await client.waitForTransactionReceipt({hash,confirmations:1,timeout:120000});
 if(receipt.status!=='success')throw Error('Policy transaction reverted: '+receipt.transactionHash);
 const tx=await client.getTransaction({hash:receipt.transactionHash});
 if(!same(tx.from,walletAddress)||!same(tx.to,brickAddress)||tx.input!==encodeFunctionData({abi:policyAbi,functionName,args}))throw Error('Wallet transaction was replaced with a different operation.');
 return {transactionHash:receipt.transactionHash,policy:await readBrickPolicy(options)};
}
