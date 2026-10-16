/** Read-only Sepolia connection check. This script never creates transactions. */
const {ethers}=require('hardhat');
async function main(){
 const network=await ethers.provider.getNetwork();
 if(network.chainId!==11155111)throw Error('Not Sepolia. Refusing incorrect chain ID.');
 const block=await ethers.provider.getBlockNumber();
 console.log(JSON.stringify({network:'Ethereum Sepolia',chainId:network.chainId,blockNumber:block,transactionSent:false},null,2));
}
main().catch(e=>{console.error(e.message||e);process.exitCode=1;});
