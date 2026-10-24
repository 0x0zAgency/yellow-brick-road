'use strict';
/** EIP-1559 quote arithmetic. Native ETH only; no fiat-price assumption. */
const TX_GAS_CAP=16777216n; // EIP-7825, independent of the block gas limit.
const integer=(value,label)=>{try{const n=BigInt(String(value));if(n<0n)throw Error();return n;}catch{throw Error('Invalid '+label+'.');}};
function formatEther(value){const n=integer(value,'wei'),whole=n/10n**18n,fraction=(n%10n**18n).toString().padStart(18,'0').replace(/0+$/,'');return whole+(fraction?'.'+fraction:'');}
function parseEther(value){if(!/^\d+(?:\.\d{1,18})?$/.test(String(value)))throw Error('The deployment ceiling must be a decimal ETH amount.');const [a,b='']=String(value).split('.');return BigInt(a)*10n**18n+BigInt(b.padEnd(18,'0'));}
function deploymentBudget({estimatedGas,blockGasLimit,baseFeePerGas,maxFeePerGas,maxPriorityFeePerGas,balance,budgetWei}){
 const estimate=integer(estimatedGas,'gas estimate'),blockLimit=integer(blockGasLimit,'block gas limit');
 const gasLimit=(estimate*120n+99n)/100n;
 const base=integer(baseFeePerGas,'base fee'),max=integer(maxFeePerGas,'maximum fee'),tip=integer(maxPriorityFeePerGas,'priority fee');
 if(!estimate||gasLimit>blockLimit||gasLimit>TX_GAS_CAP)throw Error('Deployment exceeds the block or EIP-7825 transaction gas limit. It will not be sent or split automatically.');
 if(!max||tip>max||base+tip>max)throw Error('Fee quote is not currently usable. Refresh the estimate.');
 const maximumWei=gasLimit*max,estimatedWei=estimate*(base+tip),available=integer(balance,'balance'),ceiling=integer(budgetWei,'deployment ceiling');
 if(maximumWei>ceiling)throw Error('Deployment maximum '+formatEther(maximumWei)+' ETH exceeds your '+formatEther(ceiling)+' ETH ceiling. No transaction was sent.');
 if(available<maximumWei)throw Error('The selected Sepolia wallet cannot cover the approved maximum. Add test ETH to that wallet.');
 return {estimatedGas:estimate.toString(),gasLimit:gasLimit.toString(),maxFeePerGas:max.toString(),maxPriorityFeePerGas:tip.toString(),estimatedWei:estimatedWei.toString(),maximumWei:maximumWei.toString(),balanceWei:available.toString(),remainingWei:(available-maximumWei).toString()};
}
module.exports={TX_GAS_CAP,formatEther,parseEther,deploymentBudget};
