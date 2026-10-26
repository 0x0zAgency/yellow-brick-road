import {rpcConnectionError} from './rpc-diagnostics.js';
import {ACTIVE_NETWORK,activeRpcUrl,requireActiveNetwork} from './active-network.js';
import {initialPolicyFor} from './content-policy.js';
import {verifyLocalChainHistory} from './chain-history.js';
import {sepolia} from 'viem/chains';
import {createPublicClient, createWalletClient, custom, http, parseAbi, parseEventLogs, isAddress, sha256, stringToHex, getAddress, encodeFunctionData} from 'viem';
export const factoryAbi=parseAbi([
 'function implementation() view returns (address)',
 'function receiptToken() view returns (address)',
 'function contentPolicyVersion() view returns (uint8)',
 'function deployBrickWithPolicy(bytes32,string,bytes32,bytes32,((bytes32 manifestDigest,bytes32 previewHash,bytes32 artworkHash,bytes32 lyricsHash) files,uint8 permissions,bool locked) policy) returns (address)',
 'function isBrick(address) view returns (bool)',
 'function brickById(bytes32) view returns (address)',
 'function predictBrickAddress(address,bytes32,bytes32) view returns (address)',
 'function deployBrickWithMetadataDigest(bytes32,string,bytes32,bytes32) returns (address)',
 'event BrickDeployed(bytes32 indexed ipId,address indexed brick,address indexed originator,bytes32 contentHash)'
]);
const receiptAbi=parseAbi(['function ownerOf(uint256) view returns (address)','function brickForToken(uint256) view returns (address)','function tokenURI(uint256) view returns (string)']);
export const policyAbi=parseAbi([
 'function contentPolicyEnabled() view returns (bool)',
 'function contentPolicyVersion() view returns (uint8)',
 'function contentRevision() view returns (uint64)',
 'function currentContentHash() view returns (bytes32)',
 'function fileCommitments() view returns (bytes32 manifestDigest,bytes32 previewHash,bytes32 artworkHash,bytes32 lyricsHash)',
 'function contentLocked() view returns (bool)',
 'function effectivePlayerPermissions() view returns (uint8)',
 'function playerPermissionVersion() view returns (uint64)',
 'function setPlayerPermissions(uint8,uint64,uint64)',
 'function lockContent(uint64)'
]);
const brickAbi=parseAbi(['function controller() view returns (address)','function contentHash() view returns (bytes32)','function metadataDigest() view returns (bytes32)','function metadataURI() view returns (string)']);
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
export function localConfig(rpcUrl, chainId){
 const url=new URL(rpcUrl);
 if(!['http:','https:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password)throw Error('Use a loopback Ganache RPC URL.');
 const id=Number(chainId);if(!Number.isSafeInteger(id)||id<=0)throw Error('Enter the actual Ganache chain ID (not its network ID).');
 return {id,name:'Local Ganache',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[url.href]}}};
}
export function mintMode(wallet,network){
 if(!wallet)return 'simulated';
 if(!['ganache','sepolia'].includes(network))throw Error('Choose Ganache or Sepolia.');
 return network;
}
async function connectChainInternal({provider,rpcUrl,chainId,account,network='ganache'}){
 if(!provider?.request)throw Error('Install and connect an EVM browser wallet.');
 if(!['ganache','sepolia'].includes(network))throw Error('Choose Ganache or Sepolia.');
 const chain=network==='sepolia'?sepolia:localConfig(rpcUrl,chainId);
 requireActiveNetwork(chain.id);
 const client=createPublicClient({chain,transport:ACTIVE_NETWORK?http(activeRpcUrl(),{retryCount:0,timeout:15000}):network==='sepolia'?custom(provider):http(rpcUrl)});
 if(ACTIVE_NETWORK&&(await client.getBlock({blockNumber:0n})).hash.toLowerCase()!==ACTIVE_NETWORK.genesisHash.toLowerCase())throw Error('The active RPC history changed. No transaction will be requested.');
 if(await client.getChainId()!==chain.id)throw Error('RPC chain ID differs from the configured chain ID.');
 async function check(){
  if(Number(await provider.request({method:'eth_chainId'}))!==chain.id)throw Error('Switch your wallet to the selected mint network.');
  if(await client.getChainId()!==chain.id)throw Error('RPC chain changed.');
  if(network==='ganache'){
   await verifyLocalChainHistory({client,provider,rpcUrl,chainId:chain.id});
  }else{
   const block=await client.getBlock();
   const walletBlock=await provider.request({method:'eth_getBlockByNumber',params:['0x'+block.number.toString(16),false]});
   if(!walletBlock||!same(walletBlock.hash,block.hash))throw Error('Wallet and RPC point to different blockchain histories.');
  }
  // The user may switch networks while the read-only history check is pending.
  if(Number(await provider.request({method:'eth_chainId'}))!==chain.id)throw Error('Switch your wallet to the selected mint network.');
  const accounts=await provider.request({method:'eth_accounts'});
  if(!account||!accounts.some(a=>same(a,account)))throw Error('Wallet account changed or disconnected. Reconnect and review.');
 }
 await check();return {chain,client,wallet:createWalletClient({chain,transport:custom(provider)}),check};
}
export async function connectChain(options){
 try{return await connectChainInternal(options);}catch(error){throw rpcConnectionError(error);}
}
export async function verifyFactory(client,address){
 if(ACTIVE_NETWORK)requireActiveNetwork(await client.getChainId(),address);
 if(!isAddress(address)||!await client.getBytecode({address}))throw Error('Factory address has no contract on this chain. Deploy or enter a current factory.');
 const implementation=await client.readContract({address,abi:factoryAbi,functionName:'implementation'});
 if(!await client.getBytecode({address:implementation}))throw Error('Factory implementation is missing.');
 let receiptAddress;
 try{receiptAddress=await client.readContract({address,abi:factoryAbi,functionName:'receiptToken'});}
 catch{throw Error('This is a legacy YellowBrickFactory without ERC721 registration receipts. Deploy the updated factory before minting wallet-importable NFTs.');}
 if(!isAddress(receiptAddress)||!await client.getBytecode({address:receiptAddress}))throw Error('The factory registration NFT collection is missing.');
 return receiptAddress;
}
export async function requirePolicyFactory(client,factoryAddress){
 let version;
 try{version=await client.readContract({address:factoryAddress,abi:factoryAbi,functionName:'contentPolicyVersion'});}catch{}
 if(Number(version)!==1)throw Error('This factory cannot record Player permissions or content locks. Explicitly deploy the updated factory; existing Bricks are not upgraded or replaced.');
}
export async function preflightPolicyMint(options){
 if(!options.packet?.bricks?.some(b=>b.metadata.extensions?.contentPolicy))return;
 const {client}=await connectChain({...options,account:options.packet.account.address});
 await verifyFactory(client,options.factoryAddress);
 await requirePolicyFactory(client,options.factoryAddress);
}
export async function mintOnChain({packet,provider,rpcUrl,chainId,factoryAddress,network='ganache',receiptTimeoutMs=120000,onUpdate=()=>{},result={simulated:false,status:'pending',receipts:[]}}){
 const account=packet?.account?.address;
 if(result.receipts.length)throw Error('Use a fresh batch only after reviewing all prior transaction hashes.');
 if(packet?.packetType!=='LOCAL_PREVIEW_NOT_MINTED'||!packet.bricks?.length)throw Error('Invalid registration packet.');
 const {client,wallet,chain,check}=await connectChain({provider,rpcUrl,chainId,account,network});
 const receiptTokenAddress=await verifyFactory(client,factoryAddress);
 if(packet.bricks.some(b=>b.metadata.extensions?.contentPolicy))await requirePolicyFactory(client,factoryAddress);
 const genesis=await client.getBlock({blockNumber:0n});
 result.genesisHash=genesis.hash;
 result.chainId=chain.id;result.factoryAddress=getAddress(factoryAddress);
 for(const b of packet.bricks){
  await check();
  const metadataJson=JSON.stringify(b.metadata),metadataDigest=sha256(stringToHex(metadataJson));
  // Works without a separate source file (e.g. composition) commit their metadata as content.
  const contentHash=b.metadata.media?.find(m=>m.role==='master'||m.role==='artwork')?.integrity.digest||metadataDigest;
  const nonce='0x'+Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
  // For YBR IPFS pilots this URI resolves to encrypted .roadenc metadata.
  // It is deliberately not public-readable JSON and never contains a key.
  const uri=b.metadataCipherCid?'ipfs://'+b.metadataCipherCid:'road-local://sha256/'+metadataDigest.slice(2);
  const policy=await initialPolicyFor(b.metadata);
  const functionName=policy?'deployBrickWithPolicy':'deployBrickWithMetadataDigest';
  const args=policy?[contentHash,uri,metadataDigest,nonce,policy]:[contentHash,uri,metadataDigest,nonce];
  const predicted=await client.readContract({address:factoryAddress,abi:factoryAbi,functionName:'predictBrickAddress',args:[account,contentHash,nonce]});
  const {request}=await client.simulateContract({account,address:factoryAddress,abi:factoryAbi,functionName,args});
  // Preserve explicit gas estimation for wallets that otherwise default to 90k.
  const estimatedGas=await client.estimateContractGas({account,address:factoryAddress,abi:factoryAbi,functionName,args});
  request.gas=estimatedGas+estimatedGas/5n;
  await check();onUpdate('Confirm '+b.role+' in your wallet.');
  const hash=await wallet.writeContract(request);
  const entry={sourceId:b.localId,role:b.role,title:b.metadata.title,transactionHash:hash,status:'pending',chainId:chain.id,contentHash,metadataDigest,metadataJson,nonce,uri,...(policy?{contentPolicy:{...policy,version:1,revision:'1',permissionVersion:'1',controller:account}}:{})};
  result.receipts.push(entry);onUpdate('Waiting for confirmation: '+hash);
  const receipt=await client.waitForTransactionReceipt({hash,confirmations:1,timeout:receiptTimeoutMs,onReplaced:({transaction})=>{entry.transactionHash=transaction.hash}});
  const transaction=await client.getTransaction({hash:receipt.transactionHash});
  if(!same(transaction.from,account)||!same(transaction.to,factoryAddress)||transaction.input!==encodeFunctionData({abi:factoryAbi,functionName,args}))throw Error('Transaction was replaced with a different operation: '+receipt.transactionHash);
  if(receipt.status!=='success'){entry.status='reverted';throw Error('Mint transaction reverted: '+receipt.transactionHash);}
  const events=parseEventLogs({abi:factoryAbi,eventName:'BrickDeployed',logs:receipt.logs.filter(l=>same(l.address,factoryAddress))});
  const event=events.find(e=>same(e.args.brick,predicted)&&same(e.args.originator,account)&&e.args.contentHash===contentHash);
  if(!event)throw Error('Confirmed transaction lacks the expected factory deployment event: '+hash);
  const address=event.args.brick;
  if(!await client.getBytecode({address}))throw Error('Deployed Brick has no bytecode.');
  for(const [functionName,expected] of [['controller',account],['contentHash',contentHash],['metadataDigest',metadataDigest],['metadataURI',uri]]){
   if(!same(await client.readContract({address,abi:brickAbi,functionName}),expected))throw Error('Brick verification failed: '+functionName);
  }
  if(policy){
   for(const [key,expected] of [['contentPolicyEnabled',true],['contentRevision',1],['currentContentHash',contentHash],['contentLocked',policy.locked],['effectivePlayerPermissions',policy.permissions],['playerPermissionVersion',1]]){
    if(String(await client.readContract({address,abi:policyAbi,functionName:key})).toLowerCase()!==String(expected).toLowerCase())throw Error('On-chain content policy verification failed: '+key);
   }
   const committed=await client.readContract({address,abi:policyAbi,functionName:'fileCommitments'});
   if(committed.some((hash,i)=>!same(hash,Object.values(policy.files)[i])))throw Error('On-chain file commitments differ from the reviewed policy.');
  }
  if(!await client.readContract({address:factoryAddress,abi:factoryAbi,functionName:'isBrick',args:[address]})||!same(await client.readContract({address:factoryAddress,abi:factoryAbi,functionName:'brickById',args:[event.args.ipId]}),address))throw Error('Factory registry verification failed.');
  const tokenId=BigInt(event.args.ipId);
  const [owner,registeredBrick] = await Promise.all([
   client.readContract({address:receiptTokenAddress,abi:receiptAbi,functionName:'ownerOf',args:[tokenId]}),
   client.readContract({address:receiptTokenAddress,abi:receiptAbi,functionName:'brickForToken',args:[tokenId]})
  ]);
  if(!same(owner,account)||!same(registeredBrick,address))throw Error('ERC721 receipt does not match creator and Brick contract.');
  Object.assign(entry,{status:'verified',id:event.args.ipId,contractAddress:address,nftContractAddress:receiptTokenAddress,tokenId:tokenId.toString(),blockNumber:receipt.blockNumber.toString(),gasUsed:receipt.gasUsed.toString()});onUpdate('Verified '+b.role);
 }
 result.status='confirmed';return result;
}
