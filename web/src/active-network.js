/** Public launcher identity only. Provider API credentials never enter Vite. */
export function parseActiveNetwork(env={}){
 const network=env.VITE_ROAD_ACTIVE_NETWORK;if(!network)return null;
 const chainId=Number(env.VITE_ROAD_ACTIVE_CHAIN_ID),factoryAddress=env.VITE_ROAD_ACTIVE_FACTORY,genesisHash=env.VITE_ROAD_ACTIVE_GENESIS_HASH;
 if(!['ganache','sepolia'].includes(network)||chainId!==(network==='sepolia'?11155111:1337)||!/^0x[0-9a-f]{40}$/i.test(factoryAddress||'')||!/^0x[0-9a-f]{64}$/i.test(genesisHash||''))throw Error('The launcher network identity is incomplete. Restart Dev Control; no other network was selected.');
 const deploymentBlock=Number(env.VITE_ROAD_ACTIVE_DEPLOYMENT_BLOCK||0);
 if(!Number.isSafeInteger(deploymentBlock)||deploymentBlock<0)throw Error('Invalid active deployment block.');
 return Object.freeze({network,chainId,factoryAddress,genesisHash,deploymentBlock,label:network==='sepolia'?'Sepolia':'Local Ganache'});
}
export const ACTIVE_NETWORK=parseActiveNetwork(import.meta.env||{});
export function activeRpcUrl(){return (globalThis.location?.origin||'http://127.0.0.1:5173')+'/road/rpc';}
export function requireActiveNetwork(chainId,factoryAddress){
 if(ACTIVE_NETWORK&&(Number(chainId)!==ACTIVE_NETWORK.chainId||factoryAddress&&factoryAddress.toLowerCase()!==ACTIVE_NETWORK.factoryAddress.toLowerCase()))throw Error('This operation is not on the active Dev Control network/factory. Reload the app or change networks in Dev Control.');
}
