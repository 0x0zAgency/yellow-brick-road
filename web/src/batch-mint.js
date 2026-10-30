/** Native factory batching, not a wallet multicall shim. One transaction owns all
 * registrations, policies and initial images. Never retry an uncertain write.
 */
import {verifyPacketReuse} from './reuse-bricks.js';
import {encodeAbiParameters,encodeFunctionData,getAddress,keccak256,parseEventLogs,sha256,stringToHex} from 'viem';
import {connectChain,verifyFactory,requirePolicyFactory,requireBatchFactory,requireLicensingContactFactory,factoryAbi,policyAbi} from './chain-mint.js';
import {packetLicensingEmails,licensingContactAbi} from './licensing-contact.js';
import {initialPolicyFor} from './content-policy.js';
import {validCoverCid} from './nft-cover-format.js';
import {decodeReceiptMetadata,coverAbi} from './nft-cover-chain.js';
import {receiptCoverImage} from './brick-presentation.js';
import {batchGasLimit} from './batch-gas.js';
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const brickAbi=['controller','contentHash','metadataDigest','metadataURI'].map(name=>({type:'function',name,stateMutability:'view',inputs:[],outputs:[{type:name==='controller'?'address':name==='metadataURI'?'string':'bytes32'}]}));
const randomNonce=()=>'0x'+Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
export async function mintBatchOnChain({packet,provider,rpcUrl,chainId,factoryAddress,network='ganache',initialImageURI='',receiptTimeoutMs=120000,onUpdate=()=>{},result={simulated:false,status:'pending',receipts:[]}}){
 if(result.receipts?.length||result.transactionHash||result.submissionAttempted)throw Error('Inspect the existing batch transaction before retrying. Do not remint an uncertain batch.');
 if(packet?.packetType!=='LOCAL_PREVIEW_NOT_MINTED'||!Array.isArray(packet.bricks)||!packet.bricks.length||packet.bricks.length>32)throw Error('An atomic mint requires 1 to 32 reviewed Bricks.');
 if(typeof initialImageURI!=='string'||initialImageURI&&(!initialImageURI.startsWith('ipfs://')||!validCoverCid(initialImageURI.slice(7))))throw Error('Initial NFT image must be a reviewed public IPFS cover.');
 const sources=packet.bricks.map(b=>b?.localId);
 if(sources.some(id=>typeof id!=='string'||!id)||new Set(sources).size!==sources.length)throw Error('Every batch Brick needs a distinct source identity.');
 const account=packet.account?.address;
 const newBricks=packet.bricks.filter(b=>!b.reuse);
 const licensingEmails=packetLicensingEmails({...packet,bricks:newBricks}),withContact=licensingEmails.some(Boolean);
 const {client,wallet,chain,check}=await connectChain({provider,rpcUrl,chainId,account,network});
 const collection=await verifyFactory(client,factoryAddress);
 await requirePolicyFactory(client,factoryAddress);await requireBatchFactory(client,factoryAddress);
 if(withContact)await requireLicensingContactFactory(client,factoryAddress);
 const genesis=await client.getBlock({blockNumber:0n});
 const reused=await verifyPacketReuse(packet,{provider,rpcUrl,chainId,factoryAddress,network},{client});
 if(!newBricks.length){await check();return Object.assign(result,{simulated:false,status:'confirmed',chainId:chain.id,factoryAddress:getAddress(factoryAddress),genesisHash:genesis.hash,reusedOnly:true,transactionCount:0,receipts:reused});}
 const prepared=[];
 for(const b of newBricks){
  const policy=await initialPolicyFor(b.metadata);
  if(!policy)throw Error('Every Brick in an atomic batch must contain its reviewed file policy.');
  const metadataJson=JSON.stringify(b.metadata),metadataDigest=sha256(stringToHex(metadataJson));
  const contentHash=b.metadata.media?.find(m=>m.role==='master'||m.role==='artwork')?.integrity.digest||metadataDigest;
  const nonce=randomNonce(),uri=b.metadataCipherCid?'ipfs://'+b.metadataCipherCid:'road-local://sha256/'+metadataDigest.slice(2);
  const predicted=await client.readContract({address:factoryAddress,abi:factoryAbi,functionName:'predictBrickAddress',args:[account,contentHash,nonce]});
  const id=keccak256(encodeAbiParameters([{type:'string'},{type:'address'},{type:'bytes32'},{type:'bytes32'}],['yellow-brick-road:ip:v1',account,contentHash,nonce]));
  prepared.push({b,metadataJson,predicted,id,registration:{contentHash,uri,metadataDigest,nonce,withPolicy:true,policy}});
 }
 const args=[prepared.map(p=>p.registration),initialImageURI,...(withContact?[licensingEmails]:[])],functionName=withContact?'deployBricksWithLicensingContact':'deployBricksWithPolicy';
 const parameters={account,address:factoryAddress,abi:factoryAbi,functionName,args};
 await check();
 const {request}=await client.simulateContract(parameters);
 const estimate=await client.estimateContractGas(parameters),head=await client.getBlock();
 // Do not split silently: a split would change the one-transaction guarantee.
 const gas=batchGasLimit(estimate,head.gasLimit,chain.id);
 request.gas=gas;
 Object.assign(result,{simulated:false,status:'pending',chainId:chain.id,factoryAddress:getAddress(factoryAddress),genesisHash:genesis.hash,atomic:true,transactionCount:1,estimatedGas:estimate.toString()});
 onUpdate('Approve one transaction for '+prepared.length+' Brick(s), permissions'+(initialImageURI?' and NFT artwork':'')+'.');
 await check();
 await verifyPacketReuse(packet,{provider,rpcUrl,chainId,factoryAddress,network},{client});
 if(initialImageURI&&!result.nftCover)result.nftCover={imageURI:initialImageURI,status:'selected',atMint:true};
 // Keep all predicted identities before the write: a transport failure can occur
 // after a wallet broadcast. Only explicit user rejection permits a clean retry.
 result.receipts=prepared.map(({b,metadataJson,id,predicted,registration:r})=>({sourceId:b.localId,role:b.role,title:b.metadata.title,id,predictedAddress:predicted,status:'awaiting-wallet',chainId:chain.id,
  contentHash:r.contentHash,metadataDigest:r.metadataDigest,metadataJson,nonce:r.nonce,uri:r.uri,
  contentPolicy:{...r.policy,version:1,revision:'1',permissionVersion:'1',controller:account},gasScope:'batch'}));
 result.submissionAttempted=true;
 let hash;
 try{hash=await wallet.writeContract(request);}catch(error){
  let rejected=false,cause=error;
  for(let i=0;cause&&i<8;i++,cause=cause.cause)if(cause.code===4001||cause.name==='UserRejectedRequestError')rejected=true;
  if(rejected){result.submissionAttempted=false;result.receipts=[];result.status='rejected';throw error;}
  result.status='submission-unknown';for(const r of result.receipts)r.status='submission-unknown';
  throw Error('The wallet did not return a transaction hash. Submission is uncertain. Keep the mint packet and check wallet activity and the predicted Brick addresses before retrying. Do not mint this batch again blindly.');
 }
 const setHash=hash=>{result.transactionHash=hash;for(const r of result.receipts){r.transactionHash=hash;r.status='pending';}if(result.nftCover)Object.assign(result.nftCover,{transactionHash:hash,status:'pending'});};
 setHash(hash);onUpdate('Waiting for the atomic mint: '+hash);
 const receipt=await client.waitForTransactionReceipt({hash,confirmations:1,timeout:receiptTimeoutMs,onReplaced:({transaction})=>setHash(transaction.hash)});
 setHash(receipt.transactionHash);
 const transaction=await client.getTransaction({hash:receipt.transactionHash});
 if(!same(transaction.from,account)||!same(transaction.to,factoryAddress)||transaction.value!==0n||transaction.input!==encodeFunctionData({abi:factoryAbi,functionName,args}))throw Error('Batch transaction was replaced with a different operation. Inspect '+receipt.transactionHash+' before retrying.');
 if(receipt.status!=='success'){
  result.status='reverted';for(const r of result.receipts)r.status='reverted';if(result.nftCover)result.nftCover.status='mint-reverted';
  throw Error('Atomic mint reverted. No Bricks from this batch were created: '+receipt.transactionHash);
 }
 const events=parseEventLogs({abi:factoryAbi,eventName:'BrickDeployed',logs:receipt.logs.filter(l=>same(l.address,factoryAddress))});
 if(events.length!==prepared.length)throw Error('Batch receipt has an unexpected number of registration events.');
 const blockNumber=receipt.blockNumber;
 const read=(address,abi,functionName,args=[])=>client.readContract({address,abi,functionName,args,blockNumber});
 const verified=[],metadata=[];
 for(let i=0;i<prepared.length;i++){
  const {b,id,predicted,registration:r}=prepared[i],policy=r.policy;
  const matches=events.filter(e=>same(e.args.ipId,id)&&same(e.args.brick,predicted)&&same(e.args.originator,account)&&same(e.args.contentHash,r.contentHash));
  if(matches.length!==1)throw Error('Batch registration identity differs from the reviewed '+b.role+'.');
  const address=predicted;
  if(!await client.getBytecode({address,blockNumber}))throw Error('A registered Brick has no bytecode.');
  for(const [key,expected] of [['controller',account],['contentHash',r.contentHash],['metadataDigest',r.metadataDigest],['metadataURI',r.uri]]){
   const value=await read(address,brickAbi,key);
   if(key==='metadataURI'?value!==expected:!same(value,expected))throw Error('Batch Brick verification failed: '+key);
  }
  for(const [key,expected] of [['contentPolicyEnabled',true],['contentRevision',1],['currentContentHash',r.contentHash],['contentLocked',policy.locked],['effectivePlayerPermissions',policy.permissions],['playerPermissionVersion',1]]){
   if(!same(await read(address,policyAbi,key),expected))throw Error('Batch policy verification failed: '+key);
  }
  const committed=await read(address,policyAbi,'fileCommitments');
  if(committed.some((h,index)=>!same(h,Object.values(policy.files)[index])))throw Error('Batch file commitments differ from the reviewed files.');
  if(!await read(factoryAddress,factoryAbi,'isBrick',[address])||!same(await read(factoryAddress,factoryAbi,'brickById',[id]),address))throw Error('Batch registry verification failed.');
  const tokenId=BigInt(id);
  if(!same(await read(collection,coverAbi,'ownerOf',[tokenId]),account)||!same(await read(collection,coverAbi,'brickForToken',[tokenId]),address))throw Error('Batch NFT holder or Brick link is incorrect.');
  const tokenURI=await read(collection,coverAbi,'tokenURI',[tokenId]);
  let licensingContact;
  if(withContact){
   const [email,version,authority]=await read(address,licensingContactAbi,'licensingContact');
   if(email!==licensingEmails[i]||Number(version)!==1||!same(authority,account))throw Error('Batch licensing contact differs from the reviewed contact.');
   licensingContact={email,version:String(version),authority};
  }
  const actualImage=receiptCoverImage(tokenURI,{brickAddress:address,ipId:id}); // validates both identity attributes
  if(initialImageURI?actualImage!==initialImageURI:actualImage!==null)throw Error('Initial NFT image does not match the approved batch.');
  metadata.push(decodeReceiptMetadata(tokenURI));
  verified.push({status:'verified',contractAddress:address,nftContractAddress:collection,tokenId:tokenId.toString(),blockNumber:blockNumber.toString(),gasUsed:receipt.gasUsed.toString(),...(licensingContact?{licensingContact}:{})});
 }
 // Do not label a partially checked or replaced history as a verified batch.
 await check();
 if(!same((await client.getBlock({blockNumber})).hash,receipt.blockHash))throw Error('Mint block history changed during batch verification.');
 for(let i=0;i<verified.length;i++)Object.assign(result.receipts[i],verified[i]);
 Object.assign(result,{status:'confirmed',gasUsed:receipt.gasUsed.toString(),blockNumber:blockNumber.toString()});
 if(result.nftCover&&initialImageURI)Object.assign(result.nftCover,{status:'verified',transactionHash:receipt.transactionHash,collection,tokenIds:result.receipts.map(r=>r.tokenId),metadata,atMint:true});
 result.receipts.push(...await verifyPacketReuse(packet,{provider,rpcUrl,chainId,factoryAddress,network},{client}));
 onUpdate('Verified '+prepared.length+' Bricks'+(initialImageURI?' and their NFT artwork':'')+' in one transaction.');
 return result;
}
