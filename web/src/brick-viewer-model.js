/** Read-only wallet discovery over YellowBrickFactory deployment events.
 * Never downloads private files or treats creator claims as verified ownership.
 */
import {isAddress} from 'viem';
import {factoryAbi} from './chain-mint.js';

export const BRICK_READ_ABI=[
 {type:'function',name:'ipId',stateMutability:'view',inputs:[],outputs:[{type:'bytes32'}]},
 {type:'function',name:'originator',stateMutability:'view',inputs:[],outputs:[{type:'address'}]},
 {type:'function',name:'controller',stateMutability:'view',inputs:[],outputs:[{type:'address'}]},
 {type:'function',name:'contentHash',stateMutability:'view',inputs:[],outputs:[{type:'bytes32'}]},
 {type:'function',name:'metadataDigest',stateMutability:'view',inputs:[],outputs:[{type:'bytes32'}]},
 {type:'function',name:'metadataVersion',stateMutability:'view',inputs:[],outputs:[{type:'uint64'}]},
 {type:'function',name:'metadataURI',stateMutability:'view',inputs:[],outputs:[{type:'string'}]}
];
export const MAX_SCAN_BLOCKS=100000n;
export const BLOCK_CHUNK=5000n;
export const MAX_RESULTS=200;
export const factoryStorageKey=chainId=>'road:factory:'+String(chainId);

export function resolveScanStart(latest,requested){
 if(requested!==''&&requested!==null&&requested!==undefined){
  if(!/^\d+$/.test(String(requested)))throw Error('Start block must be a nonnegative integer.');
  const start=BigInt(requested);
  if(start>latest)throw Error('Start block is newer than the current chain.');
  if(latest-start+1n>MAX_SCAN_BLOCKS)throw Error('Block range exceeds 100,000. Use a more recent start block or an indexer for full history.');
  return {start,limited:false};
 }
 const start=latest>=MAX_SCAN_BLOCKS?latest-MAX_SCAN_BLOCKS+1n:0n;
 return {start,limited:start>0n};
}

export async function discoverWalletBricks({client,factoryAddress,wallet,startBlock='',onProgress=()=>{}}){
 if(!isAddress(factoryAddress||'')||!isAddress(wallet||''))throw Error('A valid wallet and factory address are required.');
 const factoryCode=await client.getBytecode({address:factoryAddress});
 if(!factoryCode||factoryCode==='0x')throw Error('No deployed contract at that factory address on this network.');
 let implementation;
 try{
  implementation=await client.readContract({address:factoryAddress,abi:factoryAbi,functionName:'implementation'});
 }catch{throw Error('Contract is not a compatible YellowBrickFactory.');}
 if(!isAddress(implementation)||implementation.toLowerCase()==='0x0000000000000000000000000000000000000000')
  throw Error('Factory implementation is invalid.');
 const implementationCode=await client.getBytecode({address:implementation});
 if(!implementationCode||implementationCode==='0x')throw Error('Factory implementation is not deployed.');

 const latest=await client.getBlockNumber();
 const {start,limited}=resolveScanStart(latest,startBlock);
 const events=[];
 for(let from=start;from<=latest;from+=BLOCK_CHUNK){
  const to=from+BLOCK_CHUNK-1n<latest?from+BLOCK_CHUNK-1n:latest;
  const page=await client.getContractEvents({address:factoryAddress,abi:factoryAbi,eventName:'BrickDeployed',args:{originator:wallet},fromBlock:from,toBlock:to});
  events.push(...page);
  onProgress({from,to,latest,found:events.length});
 }
 const unique=new Map();
 for(const event of events){
  const address=event.args?.brick;
  if(!isAddress(address||'')||event.args?.originator?.toLowerCase()!==wallet.toLowerCase())continue;
  unique.set(address.toLowerCase(),event);
 }
 const found=[...unique.values()].sort((a,b)=>a.blockNumber===b.blockNumber?(BigInt(b.logIndex||0)>BigInt(a.logIndex||0)?1:BigInt(b.logIndex||0)<BigInt(a.logIndex||0)?-1:0):a.blockNumber>b.blockNumber?-1:1);
 const selected=found.slice(0,MAX_RESULTS);
 const bricks=[];
 // Bounded, serial reads to avoid overwhelming browser wallet RPC endpoints.
 for(const event of selected){
  const address=event.args.brick;
  const get=functionName=>client.readContract({address,abi:BRICK_READ_ABI,functionName});
  const [originator,controller,ipId,contentHash,metadataDigest,metadataVersion,metadataURI,registered]=await Promise.all([
   get('originator'),get('controller'),get('ipId'),get('contentHash'),get('metadataDigest'),get('metadataVersion'),get('metadataURI'),
   client.readContract({address:factoryAddress,abi:factoryAbi,functionName:'isBrick',args:[address]})
  ]);
  if(originator.toLowerCase()!==wallet.toLowerCase()||!registered||contentHash.toLowerCase()!==event.args.contentHash.toLowerCase()){
   throw Error('On-chain factory event and Brick contract do not match at '+address);
  }
  bricks.push({address,originator,controller,ipId,contentHash,metadataDigest,metadataVersion:metadataVersion.toString(),metadataURI,
   transactionHash:event.transactionHash,blockNumber:event.blockNumber.toString(),creatorIsController:controller.toLowerCase()===wallet.toLowerCase()});
 }
 return {bricks,matchingEvents:found.length,limitReached:found.length>MAX_RESULTS,fromBlock:start.toString(),toBlock:latest.toString(),limited,verifiedFactory:factoryAddress};
}
