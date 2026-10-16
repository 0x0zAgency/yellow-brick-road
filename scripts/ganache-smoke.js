/** Run against the disposable loopback-only Ganache chain. Never a public deployment. */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {ethers,network}=require('hardhat');
const examples=[
 {category:'sound-recording',title:'Demo recording',payload:'Demo recording bytes'},
 {category:'choreography',title:'Demo choreographic sequence',payload:'Demo spatial video bytes'},
 {category:'literary-work',title:'Demo poem',payload:'Demo writing bytes'},
];
async function main(){
 const chainId=(await ethers.provider.getNetwork()).chainId;
 assert.equal(chainId,1337,'This command accepts Ganache chain 1337 only');
 const rpc=String(network.config.url||'');
 assert.match(rpc,/^https?:\/\/(127\.0\.0\.1|localhost):\d+\/?$/i,'Refusing non-local RPC');
 const [creator]=await ethers.getSigners();
 const Factory=await ethers.getContractFactory('YellowBrickFactory',creator);
 const factory=await Factory.deploy();
 await factory.deployed();
 const result={network:'ganache-local',simulated:false,publicNetwork:false,chainId,factoryAddress:factory.address,originator:creator.address,bricks:[]};
 for(const item of examples){
  const contentHash=ethers.utils.sha256(ethers.utils.toUtf8Bytes(item.payload));
  const metadata={title:item.title,category:item.category,claimStatus:'DEMO unverified'};
  const digest=ethers.utils.sha256(ethers.utils.toUtf8Bytes(JSON.stringify(metadata)));
  const nonce=ethers.utils.hexlify(ethers.utils.randomBytes(32));
  const uri='road-demo://sha256/'+digest.slice(2);
  const address=await factory.predictBrickAddress(creator.address,contentHash,nonce);
  const tx=await factory.deployBrickWithMetadataDigest(contentHash,uri,digest,nonce);
  const receipt=await tx.wait(1);
  assert.equal(receipt.status,1);
  const event=receipt.events.find(e=>e.event==='BrickDeployed');
  assert.ok(event,'Missing BrickDeployed event');
  assert.equal(event.args.brick.toLowerCase(),address.toLowerCase());
  const brick=await ethers.getContractAt('YellowBrick',address);
  assert.equal(await brick.controller(),creator.address);
  assert.equal(await brick.contentHash(),contentHash);
  assert.equal(await brick.metadataDigest(),digest);
  assert.equal(await brick.metadataURI(),uri);
  result.bricks.push({category:item.category,title:item.title,contractAddress:address,transactionHash:receipt.transactionHash,blockNumber:receipt.blockNumber,gasUsed:receipt.gasUsed.toString(),contentHash,metadataDigest:digest});
 }
 const directory=path.resolve(__dirname,'../.road-local');
 fs.mkdirSync(directory,{recursive:true});
 const dest=path.join(directory,'ganache-mint-receipts.json');
 fs.writeFileSync(dest,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({chainId,factory:factory.address,bricks:result.bricks,receiptFile:dest},null,2));
 console.log('Local transactions only. Resetting Ganache invalidates this chain history.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
