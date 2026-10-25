'use strict';
/** Server-side Sepolia endpoint selection. The UI never asks for an RPC URL.
 * Reuse ethers' documented development access instead of hard-coding a key.
 * Explicit operator overrides and previously saved endpoints remain supported.
 */
const {checkedRpc}=require('./dev-network-profile.cjs');
function resolveSepoliaRpc({input={},env=process.env,saved=null,ethersImpl}={}){
 const override=input.rpcUrl||env.SEPOLIA_RPC_URL;
 if(override)return checkedRpc(override);
 const apiKey=env.YBR_INFURA_API_KEY||env.INFURA_API_KEY;
 if(!apiKey&&saved?.rpcUrl)return checkedRpc(saved.rpcUrl);
 if(apiKey&&(typeof apiKey!=='string'||!/^[a-zA-Z0-9_-]{1,256}$/.test(apiKey)))
  throw Error('Invalid Infura API key configuration. Use INFURA_API_KEY, not a URL.');
 const ethers=ethersImpl||require('ethers').ethers;
 let endpoint;
 try{
  const Infura=ethers.providers.InfuraProvider;
  endpoint=Infura.getUrl({name:'sepolia',chainId:11155111},Infura.getApiKey(apiKey||null)).url;
 }catch{throw Error('Unable to prepare the Infura Sepolia default. Check the installed ethers package and optional INFURA_API_KEY.');}
 // Fail closed if a dependency ever returns a different network or an incomplete URL.
 let url;try{url=new URL(endpoint);}catch{throw Error('The Infura Sepolia default is invalid.');}
 if(url.origin!=='https://sepolia.infura.io'||!/^\/v3\/[a-zA-Z0-9_-]{1,256}$/.test(url.pathname)||url.search||url.hash||url.username||url.password)
  throw Error('The Infura Sepolia default is invalid.');
 return checkedRpc(url.href);
}
module.exports={resolveSepoliaRpc};
