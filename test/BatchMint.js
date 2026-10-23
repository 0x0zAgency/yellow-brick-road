const assert=require('node:assert/strict');
const {ethers}=require('hardhat');
const z=ethers.constants.HashZero;
const H=text=>ethers.utils.keccak256(ethers.utils.toUtf8Bytes(text));
const image='ipfs://bafy'+'a'.repeat(55),image2='ipfs://bafy'+'b'.repeat(55);
const zeroPolicy={files:{manifestDigest:z,previewHash:z,artworkHash:z,lyricsHash:z},permissions:0,locked:false};
function item(i,permissions=1){
 return {contentHash:H('content'+i),uri:'road-local://sha256/'+H('metadata'+i).slice(2),metadataDigest:H('metadata'+i),nonce:H('nonce'+i),withPolicy:true,
  policy:{files:{manifestDigest:H('manifest'+i),previewHash:H('preview'+i),artworkHash:z,lyricsHash:z},permissions,locked:i===2}};
}
const json=uri=>JSON.parse(Buffer.from(uri.split(',')[1],'base64').toString());
describe('Atomic release registration with initial NFT images',function(){
 let factory,nft,creator,other;
 beforeEach(async()=>{
  [creator,other]=await ethers.getSigners();
  factory=await(await ethers.getContractFactory('YellowBrickFactory')).deploy();await factory.deployed();
  nft=await ethers.getContractAt('YellowBrickReceipt',await factory.receiptToken());
 });
 it('mints independent Bricks, exact policies and ERC721 images in one receipt',async()=>{
  const registrations=[item(0),item(1,0),item(2)];
  const receipt=await(await factory.deployBricksWithPolicy(registrations,image)).wait();
  const deployed=receipt.events.filter(e=>e.event==='BrickDeployed');assert.equal(deployed.length,3);
  const transfers=receipt.logs.filter(log=>log.address===nft.address&&log.topics[0]===nft.interface.getEventTopic('Transfer'));assert.equal(transfers.length,3);
  assert.equal(await factory.mintBatchVersion(),1);
  for(let i=0;i<3;i++){
   const {ipId,brick,originator}=deployed[i].args,r=registrations[i];
   assert.equal(originator,creator.address);assert.equal(await factory.predictBrickAddress(creator.address,r.contentHash,r.nonce),brick);
   assert.equal(await factory.brickById(ipId),brick);assert.equal(await factory.isBrick(brick),true);
   const instance=await ethers.getContractAt('YellowBrick',brick);
   assert.equal(await instance.controller(),creator.address);assert.equal(await instance.metadataDigest(),r.metadataDigest);
   assert.equal(await instance.effectivePlayerPermissions(),r.policy.permissions);assert.equal(await instance.contentLocked(),r.policy.locked);
   assert.equal((await instance.fileCommitments()).manifestDigest,r.policy.files.manifestDigest);
   assert.equal(await nft.ownerOf(ipId),creator.address);assert.equal(await nft.brickForToken(ipId),brick);
   assert.equal(await nft.coverURI(ipId),image);assert.equal(json(await nft.tokenURI(ipId)).image,image);
  }
 });
 it('rolls back every Brick and NFT for invalid later policy, duplicate nonce or invalid artwork',async()=>{
  const bad=item(1);bad.policy.permissions=128;
  for(const [items,uri] of [[[item(0),bad],image],[[item(0),item(0)],image],[[item(0),item(1)],'https://mutable.invalid/image.png']]){
   const block=await ethers.provider.getBlockNumber();
   await assert.rejects(factory.deployBricksWithPolicy(items,uri,{gasLimit:5000000}));
   for(const r of items){
    const id=await factory.ipIdentity(creator.address,r.contentHash,r.nonce);
    assert.equal(await factory.brickById(id),ethers.constants.AddressZero);
    assert.equal(await ethers.provider.getCode(await factory.predictBrickAddress(creator.address,r.contentHash,r.nonce)),'0x');
    await assert.rejects(nft.ownerOf(id));
   }
   assert.equal((await factory.queryFilter(factory.filters.BrickDeployed(),block+1)).length,0);
  }
 });
 it('bounds batch size and rejects non-factory receipt calls or unreviewed policy data',async()=>{
  await assert.rejects(factory.deployBricksWithPolicy([],image),/batch limit/);
  await assert.rejects(factory.deployBricksWithPolicy(Array.from({length:33},(_,i)=>item(i)),image),/batch limit/);
  await assert.rejects(nft.connect(other).mintBatch(creator.address,[1],[creator.address],image),/only factory/);
  const r=item(0);r.withPolicy=false;
  await assert.rejects(factory.deployBricksWithPolicy([r],image),/unexpected policy/);
 });
 it('supports explicit fallback and digest-only records without silently granting permissions',async()=>{
  const r={...item(0),withPolicy:false,policy:zeroPolicy};
  const receipt=await(await factory.deployBricksWithPolicy([r],'')).wait(),e=receipt.events.find(e=>e.event==='BrickDeployed');
  assert.match(json(await nft.tokenURI(e.args.ipId)).image,/^data:image\/svg\+xml;base64,/);
  assert.equal(await(await ethers.getContractAt('YellowBrick',e.args.brick)).contentPolicyEnabled(),false);
 });
 it('shares initial artwork storage but edits individual NFTs independently under holder control',async()=>{
  const tx=await(await factory.deployBricksWithPolicy([item(0),item(1)],image)).wait();
  const ids=tx.events.filter(e=>e.event==='BrickDeployed').map(e=>e.args.ipId);
  await assert.rejects(nft.connect(other).setCovers([ids[0]],image2),/only holder/);
  await(await nft.setCovers([ids[0]],image2)).wait();
  assert.equal(json(await nft.tokenURI(ids[0])).image,image2);assert.equal(json(await nft.tokenURI(ids[1])).image,image);
  await(await nft.setCovers([ids[0]],'')).wait();assert.match(json(await nft.tokenURI(ids[0])).image,/^data:image/);
  assert.equal(json(await nft.tokenURI(ids[1])).image,image);
 });
 it('uses less total gas than separate registrations plus the initial artwork transaction',async()=>{
  for(const count of [1,3]){
   const registrations=Array.from({length:count},(_,i)=>item(i));
   const snapshot=await ethers.provider.send('evm_snapshot',[]);
   let sequential=ethers.BigNumber.from(0);const ids=[];
   for(const r of registrations){
    const receipt=await(await factory.deployBrickWithPolicy(r.contentHash,r.uri,r.metadataDigest,r.nonce,r.policy)).wait();
    sequential=sequential.add(receipt.gasUsed);ids.push(receipt.events.find(e=>e.event==='BrickDeployed').args.ipId);
   }
   sequential=sequential.add((await(await nft.setCovers(ids,image)).wait()).gasUsed);
   await ethers.provider.send('evm_revert',[snapshot]);
   const batch=await(await factory.deployBricksWithPolicy(registrations,image)).wait();
   assert.ok(batch.gasUsed.lt(sequential),'Batch should use less gas for this identical workload');
   console.log('BATCH GAS '+JSON.stringify({bricks:count,separateTransactions:count+1,batchTransactions:1,separateGas:sequential.toString(),batchGas:batch.gasUsed.toString(),savedGas:sequential.sub(batch.gasUsed).toString()}));
   // Reset to a fresh collection for the next fair comparison.
   factory=await(await ethers.getContractFactory('YellowBrickFactory')).deploy();await factory.deployed();
   nft=await ethers.getContractAt('YellowBrickReceipt',await factory.receiptToken());
  }
 });
});
