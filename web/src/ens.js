import {createPublicClient,http,isAddress} from 'viem';
import {mainnet} from 'viem/chains';
import {normalize} from 'viem/ens';
const mainnetClient=createPublicClient({chain:mainnet,transport:http(import.meta.env.VITE_ENS_RPC_URL || undefined,{timeout:7000,retryCount:1})});
export function formatAddress(address){return isAddress(address||'')?address.slice(0,6)+'…'+address.slice(-4):''}
export async function resolvePrimaryEns(address){
 if(!isAddress(address||''))return null;
 const reverse=await mainnetClient.getEnsName({address});
 if(!reverse)return null;
 const name=normalize(reverse);
 const forward=await mainnetClient.getEnsAddress({name});
 return forward?.toLowerCase()===address.toLowerCase()?name:null;
}