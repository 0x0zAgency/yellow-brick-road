import {sepolia} from 'viem/chains';
import {createPublicClient, createWalletClient, custom, http, parseAbi, parseEventLogs, isAddress, sha256, stringToHex, getAddress, encodeFunctionData} from 'viem';
export const factoryAbi=parseAbi([
 'function implementation() view returns (address)',
 'function receiptToken() view returns (address)',
 'function isBrick(address) view returns (bool)',
 'function brickById(bytes32) view returns (address)',
 'function predictBrickAddress(address,bytes32,bytes32) view returns (address)',
 'function deployBrickWithMetadataDigest(bytes32,string,bytes32,bytes32) returns (address)',
 'event BrickDeployed(bytes32 indexed ipId,address indexed brick,address indexed originator,bytes32 contentHash)'
]);
const receiptAbi=parseAbi(['function ownerOf(uint256) view returns (address)','function brickForToken(uint256) view returns (address)','function tokenURI(uint256) view returns (string)']);
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
  const block=await client.getBlock();
  const walletBlock=await provider.request({method:'eth_getBlockByNumber',params:['0x'+block.number.toString(16),false]});
  if(!walletBlock||!same(walletBlock.hash,block.hash))throw Error('Wallet and RPC point to different blockchain histories.');
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
export async function mintOnChain({packet,provider,rpcUrl,chainId,factoryAddress,network='ganache',receiptTimeoutMs=120000,onUpdate=()=>{},result={simulated:false,status:'pending',receipts:[]}}){
 const account=packet?.account?.address;
 if(result.receipts.length)throw Error('Use a fresh batch only after reviewing all prior transaction hashes.');
 if(packet?.packetType!=='LOCAL_PREVIEW_NOT_MINTED'||!packet.bricks?.length)throw Error('Invalid registration packet.');
 const {client,wallet,chain,check}=await connectChain({provider,rpcUrl,chainId,account,network});
 const receiptTokenAddress=await verifyFactory(client,factoryAddress);
 result.chainId=chain.id;result.factoryAddress=getAddress(factoryAddress);
 for(const b of packet.bricks){
  await check();
  const metadataJson=JSON.stringify(b.metadata),metadataDigest=sha256(stringToHex(metadataJson));
  // Works without a separate source file (e.g. composition) commit their metadata as content.
  const contentHash=b.metadata.media?.find(m=>m.role==='master'||m.role==='artwork')?.integrity.digest||metadataDigest;
  const nonce='0x'+Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
  const uri='road-local://sha256/'+metadataDigest.slice(2);
  const args=[contentHash,uri,metadataDigest,nonce];
  const predicted=await client.readContract({address:factoryAddress,abi:factoryAbi,functionName:'predictBrickAddress',args:[account,contentHash,nonce]});
  const {request}=await client.simulateContract({account,address:factoryAddress,abi:factoryAbi,functionName:'deployBrickWithMetadataDigest',args});
  // Preserve explicit gas estimation for wallets that otherwise default to 90k.
  const estimatedGas=await client.estimateContractGas({account,address:factoryAddress,abi:factoryAbi,functionName:'deployBrickWithMetadataDigest',args});
  request.gas=estimatedGas+estimatedGas/5n;
  await check();onUpdate('Confirm '+b.role+' in your wallet.');
  const hash=await wallet.writeContract(request);
  const entry={sourceId:b.localId,role:b.role,title:b.metadata.title,transactionHash:hash,status:'pending',chainId:chain.id,contentHash,metadataDigest,metadataJson,nonce,uri};
  result.receipts.push(entry);onUpdate('Waiting for confirmation: '+hash);
  const receipt=await client.waitForTransactionReceipt({hash,confirmations:1,timeout:receiptTimeoutMs,onReplaced:({transaction})=>{entry.transactionHash=transaction.hash}});
  const transaction=await client.getTransaction({hash:receipt.transactionHash});
  if(!same(transaction.from,account)||!same(transaction.to,factoryAddress)||transaction.input!==encodeFunctionData({abi:factoryAbi,functionName:'deployBrickWithMetadataDigest',args}))throw Error('Transaction was replaced with a different operation: '+receipt.transactionHash);
  if(receipt.status!=='success'){entry.status='reverted';throw Error('Mint transaction reverted: '+receipt.transactionHash);}
  const events=parseEventLogs({abi:factoryAbi,eventName:'BrickDeployed',logs:receipt.logs.filter(l=>same(l.address,factoryAddress))});
  const event=events.find(e=>same(e.args.brick,predicted)&&same(e.args.originator,account)&&e.args.contentHash===contentHash);
  if(!event)throw Error('Confirmed transaction lacks the expected factory deployment event: '+hash);
  const address=event.args.brick;
  if(!await client.getBytecode({address}))throw Error('Deployed Brick has no bytecode.');
  for(const [functionName,expected] of [['controller',account],['contentHash',contentHash],['metadataDigest',metadataDigest],['metadataURI',uri]]){
   if(!same(await client.readContract({address,abi:brickAbi,functionName}),expected))throw Error('Brick verification failed: '+functionName);
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
