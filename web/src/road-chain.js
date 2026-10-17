import {createPublicClient,createWalletClient,custom,defineChain,isAddress,sha256,stringToHex,bytesToHex,parseEventLogs} from 'viem';
import {sepolia} from 'viem/chains';
export const ganache=defineChain({id:1337,name:'Ganache Local',nativeCurrency:{name:'Local test Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:['http://127.0.0.1:8545']}}});
export const MINT_NETWORKS={ganache,sepolia};
export const FACTORY_ABI=[
 {type:'function',name:'implementation',stateMutability:'view',inputs:[],outputs:[{type:'address'}]},
 {type:'function',name:'predictBrickAddress',stateMutability:'view',inputs:[{name:'originator',type:'address'},{name:'contentHash',type:'bytes32'},{name:'nonce',type:'bytes32'}],outputs:[{type:'address'}]},
 {type:'function',name:'deployBrickWithMetadataDigest',stateMutability:'nonpayable',inputs:[{name:'contentHash',type:'bytes32'},{name:'uri',type:'string'},{name:'metadataDigest',type:'bytes32'},{name:'nonce',type:'bytes32'}],outputs:[{name:'brick',type:'address'}]},
 {type:'event',name:'BrickDeployed',anonymous:false,inputs:[{name:'ipId',type:'bytes32',indexed:true},{name:'brick',type:'address',indexed:true},{name:'originator',type:'address',indexed:true},{name:'contentHash',type:'bytes32',indexed:false}]}
];
export const digestMetadata=metadata=>sha256(stringToHex(JSON.stringify(metadata)));
export function contentHashForBrick(brick){
 const media=brick?.metadata?.media||[],preferred=media.find(f=>f.role==='master')||media[0],digest=preferred?.integrity?.digest;
 return /^0x[\da-f]{64}$/i.test(digest||'')?digest:digestMetadata(brick.metadata);
}
export function mintConfigFor(mode){const chain=MINT_NETWORKS[mode];if(!chain)throw Error('Choose Ganache Local or Sepolia.');return chain;}
export async function checkMintContext({provider,account,mode,factoryAddress,publicClient}){
 if(!provider?.request)throw Error('An injected Web3 wallet (such as MetaMask) is required.');
 const chain=mintConfigFor(mode);
 if(!isAddress(account||''))throw Error('Connect your wallet before requesting a real transaction.');
 if(!isAddress(factoryAddress||''))throw Error('Enter a deployed YellowBrickFactory contract address.');
 const actual=Number(BigInt(await provider.request({method:'eth_chainId'})));
 if(actual!==chain.id)throw Error(`Wrong wallet network: expected ${chain.name} (${chain.id}), got ${actual}. Switch networks in your wallet.`);
 const accounts=await provider.request({method:'eth_accounts'});
 if(!Array.isArray(accounts)||!accounts.some(a=>a?.toLowerCase()===account.toLowerCase()))throw Error('Connected wallet account changed. Reconnect the correct account.');
 if(publicClient){
  const code=await publicClient.getBytecode({address:factoryAddress});
  if(!code||code==='0x')throw Error('No smart contract is deployed at that factory address on the selected network.');
  try{
   const implementation=await publicClient.readContract({address:factoryAddress,abi:FACTORY_ABI,functionName:'implementation'});
   if(!isAddress(implementation)||implementation.toLowerCase()==='0x0000000000000000000000000000000000000000')throw Error('Factory has no valid implementation.');
   const implCode=await publicClient.getBytecode({address:implementation});
   if(!implCode||implCode==='0x')throw Error('Factory implementation bytecode not found.');
  }catch(e){throw Error('Factory address does not expose the expected YellowBrickFactory interface: '+(e.shortMessage||e.message));}
 }
 return chain;
}
export async function mintPacketOnChain({packet,provider,account,mode,factoryAddress,onProgress=()=>{},clients=null}){
 if(packet?.packetType!=='LOCAL_PREVIEW_NOT_MINTED'||!Array.isArray(packet.bricks)||!packet.bricks.length)throw Error('Invalid registration packet.');
 const chain=mintConfigFor(mode);
 const publicClient=clients?.publicClient||createPublicClient({chain,transport:custom(provider)});
 const walletClient=clients?.walletClient||createWalletClient({chain,transport:custom(provider),account});
 await checkMintContext({provider,account,mode,factoryAddress,publicClient});
 const receipts=[];
 try{
  for(const [i,brick] of packet.bricks.entries()){
   await checkMintContext({provider,account,mode,factoryAddress});
   const metadataDigest=digestMetadata(brick.metadata),contentHash=contentHashForBrick(brick);
   const nonce=bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(32)));
   const uri=`road-demo://sha256/${metadataDigest.slice(2)}`;
   const args=[contentHash,uri,metadataDigest,nonce];
   const predicted=await publicClient.readContract({address:factoryAddress,abi:FACTORY_ABI,functionName:'predictBrickAddress',args:[account,contentHash,nonce]});
   onProgress({phase:'signing',index:i+1,total:packet.bricks.length,role:brick.role,confirmed:receipts});
   const hash=await walletClient.writeContract({account,address:factoryAddress,abi:FACTORY_ABI,functionName:'deployBrickWithMetadataDigest',args,chain});
   onProgress({phase:'confirming',index:i+1,total:packet.bricks.length,role:brick.role,hash,confirmed:receipts});
   const mined=await publicClient.waitForTransactionReceipt({hash,confirmations:1});
   if(mined.status!=='success')throw Error(`Transaction ${hash} reverted.`);
   const events=parseEventLogs({abi:FACTORY_ABI,eventName:'BrickDeployed',logs:mined.logs,strict:true});
   const matching=events.find(e=>e.address?.toLowerCase()===factoryAddress.toLowerCase()&&e.args?.brick?.toLowerCase()===predicted.toLowerCase()&&e.args?.originator?.toLowerCase()===account.toLowerCase()&&e.args?.contentHash?.toLowerCase()===contentHash.toLowerCase());
   if(!matching)throw Error('Transaction mined, but expected BrickDeployed event was not found. Inspect the transaction before trying again.');
   const item={id:predicted,sourceId:brick.localId,role:brick.role,title:brick.metadata.title,contractAddress:predicted,transactionHash:hash,blockNumber:Number(mined.blockNumber),gasUsed:mined.gasUsed.toString(),contentHash,metadataDigest,metadataURI:uri,chainId:chain.id};
   receipts.push(item);
   onProgress({phase:'confirmed',index:i+1,total:packet.bricks.length,role:brick.role,hash,confirmed:[...receipts]});
  }
  return {simulated:false,status:'ON_CHAIN_CONFIRMED',chainId:chain.id,network:chain.name,factoryAddress,receipts};
 }catch(error){error.confirmedReceipts=[...receipts];throw error;}
}
