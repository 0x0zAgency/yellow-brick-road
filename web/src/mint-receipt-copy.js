/** Plain-text, per-Brick export for human review and wallet imports.
 * Explicit allowlist: never include creator-file contents, private metadata JSON,
 * encryption keys, nonces, rights packages, or internal state.
 */
const hasValue=value=>value!==undefined&&value!==null&&String(value)!=='';
export function formatMintReceiptForCopy(receipt={},mint={}){
 const lines=['0x🟨 ROAD · MINT RESULT'];
 const add=(label,value)=>{if(hasValue(value))lines.push(label+': '+String(value));};
 add('IP category / Brick',receipt.role);
 add('Title',receipt.title);
 add('Status',receipt.status||(mint.simulated?'simulated':mint.status));
 add('Network',mint.network);
 add('Chain ID',receipt.chainId??mint.chainId);
 add('YellowBrickFactory',mint.factoryAddress);
 if(hasValue(receipt.nftContractAddress)&&hasValue(receipt.tokenId)){
  add('NFT contract address (wallet import)',receipt.nftContractAddress);
  add('Token ID (decimal, wallet import)',receipt.tokenId);
 }else if(mint.simulated){
  lines.push('NFT import: Not available (simulated mint)');
 }else{
  lines.push('NFT import: Not available for this Brick');
 }
 add('Underlying Brick contract',receipt.contractAddress);
 add('Brick IP ID',receipt.id);
 add('Transaction hash',receipt.transactionHash);
 add('Block number',receipt.blockNumber);
 add('Gas used',receipt.gasUsed);
 if(Number(receipt.chainId??mint.chainId)===11155111&&/^0x[0-9a-fA-F]{64}$/.test(receipt.transactionHash||'')){
  add('Sepolia transaction', 'https://sepolia.etherscan.io/tx/'+receipt.transactionHash);
 }
 return lines.join('\n');
}
