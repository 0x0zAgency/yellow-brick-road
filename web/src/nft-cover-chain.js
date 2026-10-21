/** ERC-721 image updates, separate from Brick content/rights metadata. */
import {createPublicClient,createWalletClient,custom,defineChain,parseAbi,isAddress,encodeFunctionData} from 'viem';
import {validCoverCid} from './nft-cover-format.js';
export const coverAbi=parseAbi([
 'function artworkVersion() pure returns (uint256)',
 'function factory() view returns (address)',
 'function ownerOf(uint256) view returns (address)',
 'function brickForToken(uint256) view returns (address)',
 'function tokenURI(uint256) view returns (string)',
 'function setCovers(uint256[],string)',
 'event MetadataUpdate(uint256 _tokenId)'
]);
const factoryAbi=parseAbi(['function receiptToken() view returns (address)']);
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
export function nftCoverTargets(mint){
 if(!mint||mint.simulated===true||mint.status!=='confirmed'||!Number.isSafeInteger(mint.chainId)||mint.chainId<=0||!isAddress(mint.factoryAddress||''))throw Error('NFT artwork requires confirmed, real registration receipts.');
 const entries=mint.receipts;
 if(!Array.isArray(entries)||!entries.length||entries.length>32)throw Error('Select 1 to 32 confirmed registration NFTs.');
 const ids=new Set();let collection=null;
 for(const receipt of entries){
  if(receipt.status!=='verified'||!isAddress(receipt.nftContractAddress||'')||!isAddress(receipt.contractAddress||'')||!/^\d+$/.test(String(receipt.tokenId))||BigInt(receipt.tokenId)>((1n<<256n)-1n))throw Error('This receipt has no verified ERC-721 collection and token ID.');
  if(collection&&!same(collection,receipt.nftContractAddress))throw Error('Update only one NFT collection at a time.');
  if(receipt.chainId!==undefined&&receipt.chainId!==mint.chainId)throw Error('Receipt network differs from the mint network.');
  const id=BigInt(receipt.tokenId).toString();if(ids.has(id))throw Error('Duplicate NFT token ID.');ids.add(id);collection=receipt.nftContractAddress;
 }
 return {collection,tokenIds:[...ids].map(BigInt),entries};
}
export function decodeReceiptMetadata(uri){
 const prefix='data:application/json;base64,';
 if(typeof uri!=='string'||!uri.startsWith(prefix)||uri.length>32000)throw Error('Unexpected registration NFT metadata.');
 try{return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(uri.slice(prefix.length)),c=>c.charCodeAt(0))));}
 catch{throw Error('Invalid registration NFT metadata JSON.');}
}
export async function nftCoverSession({mint,provider,expectedAccount,clients}={}){
 const targets=nftCoverTargets(mint);
 if(!provider?.request)throw Error('Connect the wallet that holds these NFTs.');
 const chain=defineChain({id:mint.chainId,name:'Registration network '+mint.chainId,nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[]}}});
 const client=clients?.client||createPublicClient({chain,transport:custom(provider)});
 const wallet=clients?.wallet||createWalletClient({chain,transport:custom(provider)});
 const accounts=await provider.request({method:'eth_accounts'}),account=accounts?.[0];
 if(!isAddress(account||'')||(expectedAccount&&!same(account,expectedAccount)))throw Error('Select the wallet that holds the registration NFTs.');
 async function check(){
  if(Number(BigInt(await provider.request({method:'eth_chainId'})))!==mint.chainId)throw Error('Switch your wallet to the mint network ('+mint.chainId+').');
  const live=await provider.request({method:'eth_accounts'});
  if(!same(live?.[0],account))throw Error('Wallet account changed. Review the cover again.');
  let version;
  try{version=await client.readContract({address:targets.collection,abi:coverAbi,functionName:'artworkVersion'});}
  catch{throw Error('This deployed NFT collection has fixed yellow-square artwork. It cannot be upgraded in place. Deploy the updated factory for future mints; existing Bricks and NFTs remain unchanged. See docs/NFT_COVERS.md.');}
  if(version!==1n)throw Error('Unsupported NFT artwork contract version.');
  const linkedFactory=await client.readContract({address:targets.collection,abi:coverAbi,functionName:'factory'});
  const collection=await client.readContract({address:mint.factoryAddress,abi:factoryAbi,functionName:'receiptToken'});
  if(!same(linkedFactory,mint.factoryAddress)||!same(collection,targets.collection))throw Error('NFT collection does not belong to the mint factory.');
  for(const entry of targets.entries){
   const args=[BigInt(entry.tokenId)];
   const owner=await client.readContract({address:targets.collection,abi:coverAbi,functionName:'ownerOf',args});
   const brick=await client.readContract({address:targets.collection,abi:coverAbi,functionName:'brickForToken',args});
   if(!same(owner,account)||!same(brick,entry.contractAddress))throw Error('NFT holder or linked Brick does not match this receipt.');
  }
  // Check again after contract reads; no action is authorized by stale UI state.
  if(Number(BigInt(await provider.request({method:'eth_chainId'})))!==mint.chainId||!same((await provider.request({method:'eth_accounts'}))?.[0],account))throw Error('Wallet changed during NFT verification.');
 }
 await check();
 async function update(imageURI,{onTransaction=()=>{},timeout=120000}={}){
  if(typeof imageURI!=='string'||!imageURI.startsWith('ipfs://')||!validCoverCid(imageURI.slice(7)))throw Error('A verified public cover IPFS URI is required.');
  await check();
  const args=[targets.tokenIds,imageURI];
  const parameters={account,address:targets.collection,abi:coverAbi,functionName:'setCovers',args};
  const {request}=await client.simulateContract(parameters);
  const gas=await client.estimateContractGas(parameters);request.gas=gas+gas/5n;
  await check();
  const hash=await wallet.writeContract(request);onTransaction(hash);
  const receipt=await client.waitForTransactionReceipt({hash,timeout,onReplaced:({transaction})=>onTransaction(transaction.hash)});
  const tx=await client.getTransaction({hash:receipt.transactionHash});
  if(receipt.status!=='success'||!same(tx.from,account)||!same(tx.to,targets.collection)||tx.input!==encodeFunctionData({abi:coverAbi,functionName:'setCovers',args}))throw Error('NFT artwork transaction was reverted or replaced. Inspect its hash before retrying.');
  await check();
  const metadata=[];
  for(const tokenId of targets.tokenIds){
   const data=decodeReceiptMetadata(await client.readContract({address:targets.collection,abi:coverAbi,functionName:'tokenURI',args:[tokenId]}));
   if(data.image!==imageURI)throw Error('NFT tokenURI does not yet match the requested cover. Inspect the transaction before retrying.');
   const entry=targets.entries.find(entry=>BigInt(entry.tokenId)===tokenId);
   const attributes=data.attributes;
   const matches=(name,value)=>Array.isArray(attributes)&&attributes.filter(a=>a?.trait_type===name).length===1&&attributes.some(a=>a?.trait_type===name&&same(a.value,value));
   if(!matches('Brick Contract',entry.contractAddress)||!matches('Registration IP ID','0x'+tokenId.toString(16).padStart(64,'0')))throw Error('NFT metadata identifies a different Brick or registration. Inspect the transaction before retrying.');
   metadata.push(data);
  }
  return {transactionHash:receipt.transactionHash,imageURI,collection:targets.collection,tokenIds:targets.tokenIds.map(String),metadata};
 }
 return {check,update,targets};
}
