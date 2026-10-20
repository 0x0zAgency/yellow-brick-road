const {ethers,network}=require('hardhat');
const fs=require('node:fs');
async function main(){
 const url=new URL(network.config.url||'http://invalid');
 if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Local RPC required');
 const chainId=(await ethers.provider.getNetwork()).chainId;
 if(chainId!==1337)throw Error('Expected Ganache chain 1337');
 const factory=await (await ethers.getContractFactory('YellowBrickFactory')).deploy();
 const receipt=await factory.deployTransaction.wait(1);
 if(receipt.status!==1)throw Error('Deployment failed');
 const result={chainId,rpcUrl:url.href,factoryAddress:factory.address,nftContractAddress:await factory.receiptToken(),transactionHash:receipt.transactionHash,blockNumber:receipt.blockNumber};
 fs.mkdirSync('.road-local',{recursive:true});fs.writeFileSync('.road-local/factory.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
