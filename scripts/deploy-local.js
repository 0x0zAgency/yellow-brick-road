const {ethers,network}=require('hardhat');
const fs=require('node:fs');
const path=require('node:path');
const {readSelection,prepareProfile}=require('./dev-ganache-profile.cjs');
async function main(){
 const url=new URL(network.config.url||'http://invalid');
 if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Local RPC required');
 const chainId=(await ethers.provider.getNetwork()).chainId;
 if(chainId!==1337)throw Error('Expected Ganache chain 1337');
 const selection=readSelection(process.cwd());
 const accounts=await ethers.provider.listAccounts();
 if(accounts[0]?.toLowerCase()!==selection.account.toLowerCase())throw Error('Running Ganache does not match the selected wallet profile. No factory deployed.');
 const profile=prepareProfile(process.cwd(),selection);
 const current=profile.factory;
 // Save the old deployment reference before explicitly selecting a new factory.
 // Its contracts, registrations and chain database are never deleted or reminted.
 if(fs.existsSync(current)){
  const stat=fs.lstatSync(current);
  if(!stat.isFile()||stat.isSymbolicLink()||process.getuid&&stat.uid!==process.getuid())throw Error('Unsafe current factory file.');
  let previous;
  try{previous=JSON.parse(fs.readFileSync(current,'utf8'));}catch{throw Error('Invalid existing factory receipt. Back it up and inspect it before deployment.');}
  if(!/^0x[a-fA-F0-9]{40}$/.test(previous.factoryAddress||'')||!Number.isSafeInteger(previous.chainId))throw Error('Invalid existing factory receipt.');
  const dir=profile.history;fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const ds=fs.lstatSync(dir);if(!ds.isDirectory()||ds.isSymbolicLink()||process.getuid&&ds.uid!==process.getuid())throw Error('Unsafe factory history directory.');
  const backup=path.join(dir,previous.chainId+'-'+previous.factoryAddress.toLowerCase()+'.json');
  try{fs.writeFileSync(backup,JSON.stringify(previous,null,2)+'\n',{flag:'wx',mode:0o600});}
  catch(error){if(error.code!=='EEXIST')throw error;const st=fs.lstatSync(backup);if(!st.isFile()||st.isSymbolicLink())throw Error('Unsafe factory history file.');}
 }
 const factory=await (await ethers.getContractFactory('YellowBrickFactory')).deploy();
 const receipt=await factory.deployTransaction.wait(1);
 if(receipt.status!==1)throw Error('Deployment failed');
 const nftContractAddress=await factory.receiptToken();
 const nft=await ethers.getContractAt('YellowBrickReceipt',nftContractAddress);
 const result={mintBatchVersion:Number(await factory.mintBatchVersion()),contentPolicyVersion:Number(await factory.contentPolicyVersion()),chainId,rpcUrl:url.href,factoryAddress:factory.address,nftContractAddress,receiptArtworkVersion:(await nft.artworkVersion()).toNumber(),transactionHash:receipt.transactionHash,blockNumber:receipt.blockNumber};
 fs.writeFileSync(current,JSON.stringify(result,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(result,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
