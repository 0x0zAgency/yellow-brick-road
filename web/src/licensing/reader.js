import {isAddress,zeroAddress} from 'viem';
import {licensingAbi,factoryAbi,tokenAbi,sameAddress} from './protocol.js';

export async function verifyNetwork(client,profile){
 const [chain,genesis]=await Promise.all([client.getChainId(),client.getBlock({blockNumber:0n})]);
 if(chain!==profile.chainId||!sameAddress(genesis.hash,profile.genesisHash))throw Error('The licensing network history changed. Restart with the correct deployment.');
}
export async function readLicensingState(client,profile,brick){
 if(!isAddress(brick))throw Error('Enter a Brick contract address.');
 await verifyNetwork(client,profile);
 const head=await client.getBlock();
 const read=(functionName,args=[])=>client.readContract({address:brick,abi:licensingAbi,functionName,args,blockNumber:head.number});
 if(!await client.readContract({address:profile.factoryAddress,abi:factoryAbi,functionName:'isBrick',args:[brick],blockNumber:head.number}))throw Error('This Brick is not registered in the active factory.');
 try{if(await read('projectLicensingVersion')!==1)throw Error();}catch{throw Error('This immutable Brick predates project licensing. Use a Brick minted by the updated factory.');}
 const [controller,epoch,salt,payoutVersion,ingestion,publishing]=await Promise.all([read('controller'),read('licensingEpoch'),read('licensingDomainSalt'),read('licensePayoutVersion'),read('autoLicensePolicy',[1]),read('autoLicensePolicy',[2])]);
 const [email,contactVersion]=await read('licensingContact');
 const shares=await read('licensePayout',[payoutVersion]);
 if(!sameAddress((await client.getBlock({blockNumber:head.number})).hash,head.hash))throw Error('The chain changed while reading this Brick. Refresh.');
 return {brick,controller,epoch,salt,email,contactVersion,payoutVersion,shares,policies:{1:ingestion,2:publishing},blockNumber:head.number,blockHash:head.hash};
}
export async function readAsset(client,asset){
 if(sameAddress(asset,zeroAddress))return {address:zeroAddress,symbol:'ETH',decimals:18};
 if(!isAddress(asset))throw Error('Enter a valid payment token address.');
 const [decimals,symbol]=await Promise.all(['decimals','symbol'].map(functionName=>client.readContract({address:asset,abi:tokenAbi,functionName})));
 if(decimals>36||typeof symbol!=='string'||symbol.length>40)throw Error('Unsupported payment token.');
 return {address:asset,symbol,decimals};
}
