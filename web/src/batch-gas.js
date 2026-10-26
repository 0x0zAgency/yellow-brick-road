/** Estimate first; never silently split an approved one-transaction release. */
export const ETH_TRANSACTION_GAS_LIMIT=16777216n; // EIP-7825, Sepolia
export function batchGasLimit(estimate,blockGasLimit,chainId){
 if(typeof estimate!=='bigint'||estimate<=0n||typeof blockGasLimit!=='bigint'||blockGasLimit<=0n)throw Error('Unable to estimate a safe batch gas limit.');
 const limit=Number(chainId)===11155111&&blockGasLimit>ETH_TRANSACTION_GAS_LIMIT?ETH_TRANSACTION_GAS_LIMIT:blockGasLimit;
 const gas=estimate+(estimate+4n)/5n;
 if(gas>limit)throw Error('This batch exceeds the safe transaction gas budget. Reduce the number or size of Bricks before signing. Nothing has been submitted; the app will not silently split the batch.');
 return gas;
}
