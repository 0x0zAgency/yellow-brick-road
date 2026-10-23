import {validCoverCid} from './nft-cover-format.js';
import {decodeReceiptMetadata} from './nft-cover-chain.js';
import {initialPolicyFor} from './content-policy.js';
import {verifyLocalChainHistory} from './chain-history.js';
import {sepolia} from 'viem/chains';
import {createPublicClient, createWalletClient, custom, http, parseAbi, parseEventLogs, isAddress, sha256, stringToHex, getAddress, encodeFunctionData} from 'viem';
export const factoryAbi=parseAbi([
 'function mintBatchVersion() view returns (uint8)',
 'function deployBricksWithPolicy((bytes32 contentHash,string uri,bytes32 metadataDigest,bytes32 nonce,bool withPolicy,((bytes32 manifestDigest,bytes32 previewHash,bytes32 artworkHash,bytes32 lyricsHash) files,uint8 permissions,bool locked) policy)[] registrations,string imageURI) returns (address[])',
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
export async function connectChain({provider,rpcUrl,chainId,account,network='ganache'}){
 if(!provider?.request)throw Error('Install and connect an EVM browser wallet.');
 if(!['ganache','sepolia'].includes(network))throw Error('Choose Ganache or Sepolia.');
 const chain=network==='sepolia'?sepolia:localConfig(rpcUrl,chainId);
 const client=createPublicClient({chain,transport:network==='sepolia'?custom(provider):http(rpcUrl)});
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
export async function verifyFactory(client,address){
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
export const MAX_MINT_BATCH=32;
export async function requireBatchFactory(client,factoryAddress){
 let version;
 try{version=await client.readContract({address:factoryAddress,abi:factoryAbi,functionName:'mintBatchVersion'});}catch{}
 if(Number(version)!==1)throw Error('This factory predates single-transaction minting with artwork. Deploy the updated factory once for future mints, then select it. Existing NFTs cannot be changed for free; do not reset or remint them.');
}
export async function preflightPolicyMint(options){
 if(!Array.isArray(options.packet?.bricks)||!options.packet.bricks.length||options.packet.bricks.length>MAX_MINT_BATCH)throw Error('One transaction supports 1 to 32 Bricks. Split larger collections before minting.');
 const {client,check}=await connectChain({...options,account:options.packet.account.address});
 await verifyFactory(client,options.factoryAddress);
 await requireBatchFactory(client,options.factoryAddress);
 if(options.packet.bricks.some(b=>b.metadata.extensions?.contentPolicy))await requirePolicyFactory(client,options.factoryAddress);
 await check();
}
const zero='0x'+'0'.repeat(64);
const emptyPolicy=()=>({files:{manifestDigest:zero,previewHash:zero,artworkHash:zero,lyricsHash:zero},permissions:0,locked:false});

/** One atomic factory call. No sequential fallback and no second artwork transaction. */
export async function mintOnChain({packet,provider,rpcUrl,chainId,factoryAddress,network='ganache',imageURI='',receiptTimeoutMs=120000,onUpdate=()=>{},result={simulated:false,status:'pending',receipts:[]}}){
 const account=packet?.account?.address;
 if(result.receipts.length||result.batch?.transactionHash)throw Error('Review all prior transaction hashes. Do not remint a pending or confirmed batch.');
 if(packet?.packetType!=='LOCAL_PREVIEW_NOT_MINTED'||!Array.isArray(packet.bricks)||!packet.bricks.length||packet.bricks.length>MAX_MINT_BATCH)throw Error('Invalid registration packet: one transaction supports 1 to 32 Bricks.');
 if(typeof imageURI!=='string'||imageURI&&(!imageURI.startsWith('ipfs://')||!validCoverCid(imageURI.slice(7))))throw Error('Use a verified public thumbnail IPFS URI, or explicitly choose default artwork.');
 const {client,wallet,chain,check}=await connectChain({provider,rpcUrl,chainId,account,network});
 const receiptTokenAddress=await verifyFactory(client,factoryAddress);
 await requireBatchFactory(client,factoryAddress);
 if(packet.bricks.some(b=>b.metadata.extensions?.contentPolicy))await requirePolicyFactory(client,factoryAddress);
 const genesis=await client.getBlock({blockNumber:0n});
 result.genesisHash=genesis.hash;
 result.chainId=chain.id;result.factoryAddress=getAddress(factoryAddress);
 const prepared=[];
 for(const b of packet.bricks){
  const metadataJson=JSON.stringify(b.metadata),metadataDigest=sha256(stringToHex(metadataJson));
  const contentHash=b.metadata.media?.find(m=>m.role==='master'||m.role==='artwork')?.integrity.digest||metadataDigest;
  const nonce='0x'+Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
  const uri=b.metadataCipherCid?'ipfs://'+b.metadataCipherCid:'road-local://sha256/'+metadataDigest.slice(2);
  const policy=await initialPolicyFor(b.metadata);
  const predicted=await client.readContract({address:factoryAddress,abi:factoryAbi,functionName:'predictBrickAddress',args:[account,contentHash,nonce]});
  prepared.push({b,metadataJson,metadataDigest,contentHash,nonce,uri,policy,predicted});
 }
 const registrations=prepared.map(({contentHash,uri,metadataDigest,nonce,policy})=>({contentHash,uri,metadataDigest,nonce,withPolicy:!!policy,policy:policy||emptyPolicy()}));
 const functionName='deployBricksWithPolicy',args=[registrations,imageURI];
 const parameters={account,address:factoryAddress,abi:factoryAbi,functionName,args};
 await check();
 const {request}=await client.simulateContract(parameters);
 const estimatedGas=await client.estimateContractGas(parameters);
 const latest=await client.getBlock();
 if(estimatedGas>=latest.gasLimit)throw Error('This batch exceeds the block gas limit. Reduce its size; no transactions have been submitted.');
 request.gas=estimatedGas+estimatedGas/5n;
 if(request.gas>latest.gasLimit)request.gas=latest.gasLimit;
 await check();
 onUpdate('Confirm one transaction for '+prepared.length+' Brick(s)'+(imageURI?' with NFT artwork':'')+'.');
 const hash=await wallet.writeContract(request);
 result.batch={transactionHash:hash,status:'pending',brickCount:prepared.length,imageURI,estimatedGas:estimatedGas.toString()};
 for(const {b,metadataJson,metadataDigest,contentHash,nonce,uri,policy} of prepared){
  result.receipts.push({sourceId:b.localId,role:b.role,title:b.metadata.title,transactionHash:hash,status:'pending',chainId:chain.id,contentHash,metadataDigest,metadataJson,nonce,uri,gasScope:'batch',
   ...(policy?{contentPolicy:{...policy,version:1,revision:'1',permissionVersion:'1',controller:account}}:{})});
 }
 if(result.nftCover)Object.assign(result.nftCover,{status:'pending',transactionHash:hash});
 onUpdate('Waiting for atomic batch confirmation: '+hash);
 const receipt=await client.waitForTransactionReceipt({hash,confirmations:1,timeout:receiptTimeoutMs,onReplaced:({transaction})=>{
  result.batch.transactionHash=transaction.hash;
  for(const entry of result.receipts)entry.transactionHash=transaction.hash;
  if(result.nftCover)result.nftCover.transactionHash=transaction.hash;
 }});
 const transaction=await client.getTransaction({hash:receipt.transactionHash});
 if(!same(transaction.from,account)||!same(transaction.to,factoryAddress)||transaction.input!==encodeFunctionData({abi:factoryAbi,functionName,args})||(transaction.value??0n)!==0n){
  result.status='incomplete';result.batch.status='replaced';
  throw Error('Batch transaction was replaced with a different operation. Inspect its hash; do not remint: '+receipt.transactionHash);
 }
 if(receipt.status!=='success'){
  result.status='reverted';result.batch.status='reverted';
  for(const entry of result.receipts)entry.status='reverted';
  if(result.nftCover)result.nftCover.status='not-applied';
  throw Error('Entire mint batch reverted. No Bricks were created by it: '+receipt.transactionHash);
 }
 result.batch.status='unverified';
 result.batch.gasUsed=receipt.gasUsed.toString();
 result.batch.blockNumber=receipt.blockNumber.toString();
 for(const entry of result.receipts)entry.status='unverified';
 await check();
 const pinnedBlock=await client.getBlock({blockNumber:receipt.blockNumber});
 if(!same(pinnedBlock.hash,receipt.blockHash))throw Error('Mint block changed before verification. Inspect the batch transaction before retrying.');
 const read=p=>client.readContract({...p,blockNumber:receipt.blockNumber});
 const events=parseEventLogs({abi:factoryAbi,eventName:'BrickDeployed',logs:receipt.logs.filter(l=>same(l.address,factoryAddress))});
 if(events.length!==prepared.length)throw Error('Batch deployment event count differs from the reviewed request.');
 const nftMetadata=[];
 for(let i=0;i<prepared.length;i++){
  const {b,metadataDigest,contentHash,uri,policy,predicted}=prepared[i],entry=result.receipts[i];
  const matches=events.filter(e=>same(e.args.brick,predicted)&&same(e.args.originator,account)&&same(e.args.contentHash,contentHash));
  if(matches.length!==1)throw Error('Confirmed batch lacks a unique expected factory deployment event: '+hash);
  const event=matches[0],address=event.args.brick;
  if(!await client.getBytecode({address,blockNumber:receipt.blockNumber}))throw Error('Deployed Brick has no bytecode.');
  for(const [name,expected] of [['controller',account],['contentHash',contentHash],['metadataDigest',metadataDigest],['metadataURI',uri]]){
   if(!same(await read({address,abi:brickAbi,functionName:name}),expected))throw Error('Brick verification failed: '+name);
  }
  if(policy){
   for(const [key,expected] of [['contentPolicyEnabled',true],['contentRevision',1],['currentContentHash',contentHash],['contentLocked',policy.locked],['effectivePlayerPermissions',policy.permissions],['playerPermissionVersion',1]]){
    if(String(await read({address,abi:policyAbi,functionName:key})).toLowerCase()!==String(expected).toLowerCase())throw Error('On-chain content policy verification failed: '+key);
   }
   const committed=await read({address,abi:policyAbi,functionName:'fileCommitments'});
   if(committed.some((hash,j)=>!same(hash,Object.values(policy.files)[j])))throw Error('On-chain file commitments differ from the reviewed policy.');
  }
  if(!await read({address:factoryAddress,abi:factoryAbi,functionName:'isBrick',args:[address]})||!same(await read({address:factoryAddress,abi:factoryAbi,functionName:'brickById',args:[event.args.ipId]}),address))throw Error('Factory registry verification failed.');
  const tokenId=BigInt(event.args.ipId);
  const [owner,registeredBrick,tokenURI]=await Promise.all([
   read({address:receiptTokenAddress,abi:receiptAbi,functionName:'ownerOf',args:[tokenId]}),
   read({address:receiptTokenAddress,abi:receiptAbi,functionName:'brickForToken',args:[tokenId]}),
   read({address:receiptTokenAddress,abi:receiptAbi,functionName:'tokenURI',args:[tokenId]})
  ]);
  if(!same(owner,account)||!same(registeredBrick,address))throw Error('ERC721 receipt does not match creator and Brick contract.');
  const data=decodeReceiptMetadata(tokenURI);
  const attributes=data.attributes;
  const attribute=(name,value)=>Array.isArray(attributes)&&attributes.filter(a=>a?.trait_type===name).length===1&&attributes.some(a=>a?.trait_type===name&&same(a.value,value));
  if(!attribute('Brick Contract',address)||!attribute('Registration IP ID',event.args.ipId))throw Error('NFT metadata does not identify the minted Brick.');
  if(imageURI?data.image!==imageURI:!String(data.image).startsWith('data:image/svg+xml;base64,'))throw Error('Initial NFT image differs from the reviewed artwork.');
  nftMetadata.push(data);
  Object.assign(entry,{status:'verified',id:event.args.ipId,contractAddress:address,nftContractAddress:receiptTokenAddress,tokenId:tokenId.toString(),blockNumber:receipt.blockNumber.toString(),gasUsed:receipt.gasUsed.toString(),imageURI});
  onUpdate('Verified '+b.role+' in the batch.');
 }
 const finalBlock=await client.getBlock({blockNumber:receipt.blockNumber});
 if(!same(finalBlock.hash,receipt.blockHash))throw Error('Mint block changed during verification. Inspect the batch before retrying.');
 await check();
 result.batch.status='verified';
 if(imageURI)result.nftCover={...result.nftCover,status:'verified',imageURI,transactionHash:receipt.transactionHash,collection:receiptTokenAddress,tokenIds:result.receipts.map(r=>r.tokenId),metadata:nftMetadata,includedInMint:true};
 result.status='confirmed';
 return result;
}
