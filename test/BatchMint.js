const assert=require('node:assert/strict');
const {ethers,network,artifacts}=require('hardhat');
const image='ipfs://bafy'+'a'.repeat(55),otherImage='ipfs://bafy'+'b'.repeat(55);
const h=value=>ethers.utils.keccak256(ethers.utils.toUtf8Bytes(value));
const zero=ethers.constants.HashZero;
const decode=uri=>JSON.parse(Buffer.from(uri.split(',')[1],'base64').toString());
const registration=i=>({contentHash:h('work-'+i),uri:'ipfs://encrypted-metadata-'+i,metadataDigest:h('metadata-'+i),nonce:h('nonce-'+i),withPolicy:true,
 policy:{files:{manifestDigest:h('manifest-'+i),previewHash:i%3===0?h('preview-'+i):zero,artworkHash:i%3===1?h('artwork-'+i):zero,lyricsHash:i%3===2?h('lyrics-'+i):zero},permissions:[1,2,4][i%3],locked:i===2}});
describe('Atomic batch registrations with initial NFT images',function(){
 let factory,nft,owner,other;
 beforeEach(async()=>{[owner,other]=await ethers.getSigners();factory=await(await ethers.getContractFactory('YellowBrickFactory')).deploy();await factory.deployed();nft=await ethers.getContractAt('YellowBrickReceipt',await factory.receiptToken());});
 it('registers independent policies and correct images in one transaction, from the first mint',async()=>{
  const items=[registration(0),registration(1),registration(2)];
  assert.equal(Number(await factory.mintBatchVersion()),1);
  const tx=await(await factory.deployBricksWithPolicy(items,image)).wait();
  const events=tx.events.filter(e=>e.event==='BrickDeployed');assert.equal(events.length,3);
  for(let i=0;i<items.length;i++){
   const r=items[i],event=events[i],id=await factory.ipIdentity(owner.address,r.contentHash,r.nonce),brick=await ethers.getContractAt('YellowBrick',event.args.brick);
   assert.equal(event.args.ipId,id);assert.equal(event.args.originator,owner.address);
   assert.equal(await factory.predictBrickAddress(owner.address,r.contentHash,r.nonce),brick.address);
   assert.equal(await factory.brickById(id),brick.address);assert.equal(await factory.isBrick(brick.address),true);
   assert.equal(await brick.controller(),owner.address);assert.equal(await brick.contentHash(),r.contentHash);
   assert.equal(await brick.metadataDigest(),r.metadataDigest);assert.equal(await brick.metadataURI(),r.uri);
   assert.equal(await brick.effectivePlayerPermissions(),r.policy.permissions);assert.equal(await brick.contentLocked(),r.policy.locked);
   assert.equal((await brick.fileCommitments()).manifestDigest,r.policy.files.manifestDigest);
   assert.equal(await nft.ownerOf(id),owner.address);assert.equal(await nft.brickForToken(id),brick.address);
   const data=decode(await nft.tokenURI(id));assert.equal(data.image,image);assert.equal(await nft.coverURI(id),image);
   assert.equal(data.attributes.find(a=>a.trait_type==='Registration IP ID').value,id);
   assert.equal(data.attributes.find(a=>a.trait_type==='Brick Contract').value,brick.address.toLowerCase());
  }
 });
 it('an absent public image keeps the intentional fallback without granting file access',async()=>{
  const r=registration(0);r.policy.permissions=0;
  const tx=await(await factory.deployBricksWithPolicy([r],'')).wait(),id=tx.events.find(e=>e.event==='BrickDeployed').args.ipId;
  assert.equal(decode(await nft.tokenURI(id)).image,await nft.defaultImage());assert.equal(await nft.coverURI(id),'');
 });
 it('rejects empty/oversized batches and rolls back every part on invalid later inputs',async()=>{
  await assert.rejects(factory.deployBricksWithPolicy([],image),/batch limit/);
  await assert.rejects(factory.deployBricksWithPolicy(Array.from({length:33},(_,i)=>registration(i)),image),/batch limit/);
  const bad=[{contentHash:zero},{metadataDigest:zero},{uri:''},{uri:'x'.repeat(8193)},
   {policy:{...registration(1).policy,permissions:8}},{policy:{...registration(1).policy,permissions:1}}];
  for(const change of bad){
   const a=registration(0),b={...registration(1),...change};
   await assert.rejects(factory.deployBricksWithPolicy([a,b],image));
   const id=await factory.ipIdentity(owner.address,a.contentHash,a.nonce),predicted=await factory.predictBrickAddress(owner.address,a.contentHash,a.nonce);
   assert.equal(await factory.brickById(id),ethers.constants.AddressZero);assert.equal(await ethers.provider.getCode(predicted),'0x');await assert.rejects(nft.ownerOf(id));
  }
 });
 it('a submitted transaction with a bad later image rolls back an earlier deployment',async()=>{
  const a=registration(0),b=registration(1);
  await assert.rejects(async()=>{const tx=await factory.deployBricksWithPolicy([a,b],'https://not-permitted.example/cover.png',{gasLimit:10000000});await tx.wait();});
  const id=await factory.ipIdentity(owner.address,a.contentHash,a.nonce),predicted=await factory.predictBrickAddress(owner.address,a.contentHash,a.nonce);
  assert.equal(await ethers.provider.getCode(predicted),'0x');assert.equal(await factory.isBrick(predicted),false);
  assert.equal(await factory.brickById(id),ethers.constants.AddressZero);await assert.rejects(nft.ownerOf(id));
 });
 it('duplicate registrations revert the entire batch and never change an existing receipt',async()=>{
  const a=registration(0),b=registration(1);
  await assert.rejects(factory.deployBricksWithPolicy([a,a],image),/duplicate or failed/);
  await(await factory.deployBricksWithPolicy([b],image)).wait();
  await assert.rejects(factory.deployBricksWithPolicy([a,b],image),/duplicate or failed/);
  assert.equal(await factory.brickById(await factory.ipIdentity(owner.address,a.contentHash,a.nonce)),ethers.constants.AddressZero);
  assert.equal(await nft.coverURI(await factory.ipIdentity(owner.address,b.contentHash,b.nonce)),image);
 });
 it('shared image references are independent, owner-controlled and still nontransferable',async()=>{
  await(await factory.deployBricksWithPolicy([registration(0),registration(1)],image)).wait();
  const ids=await Promise.all([0,1].map(i=>factory.ipIdentity(owner.address,registration(i).contentHash,registration(i).nonce)));
  await assert.rejects(nft.connect(other).mintBatch(other.address,[123],[other.address],image),/only factory/);
  await assert.rejects(nft.connect(other).setCovers([ids[0]],otherImage),/only holder/);
  await(await nft.setCovers([ids[0]],otherImage)).wait();assert.equal(await nft.coverURI(ids[1]),image);
  await(await nft.setCovers([ids[0]],'')).wait();assert.equal(await nft.coverURI(ids[1]),image);
  await assert.rejects(nft.transferFrom(owner.address,other.address,ids[1]),/not transferable/);
 });
 it('digest-only entries require an empty policy and cannot smuggle unreviewed permissions',async()=>{
  const r=registration(0);r.withPolicy=false;
  await assert.rejects(factory.deployBricksWithPolicy([r],image),/unexpected policy/);
  r.policy={files:{manifestDigest:zero,previewHash:zero,artworkHash:zero,lyricsHash:zero},permissions:0,locked:false};
  const tx=await(await factory.deployBricksWithPolicy([r],image)).wait();
  const event=tx.events.find(e=>e.event==='BrickDeployed'),brick=await ethers.getContractAt('YellowBrick',event.args.brick);
  assert.equal(await brick.controller(),owner.address);assert.equal(await brick.contentPolicyEnabled(),false);
  assert.equal(decode(await nft.tokenURI(event.args.ipId)).image,image);
 });
 it('measures batch gas against the equivalent separate mints plus artwork transaction',async()=>{
  const rows=[];
  for(const count of [1,3,10]){
   const snapshot=await network.provider.send('evm_snapshot'),items=Array.from({length:count},(_,i)=>registration(i));let separate=ethers.BigNumber.from(0);const ids=[];
   for(const r of items){const tx=await(await factory.deployBrickWithPolicy(r.contentHash,r.uri,r.metadataDigest,r.nonce,r.policy)).wait();separate=separate.add(tx.gasUsed);ids.push(tx.events.find(e=>e.event==='BrickDeployed').args.ipId);}
   separate=separate.add((await(await nft.setCovers(ids,image)).wait()).gasUsed);
   await network.provider.send('evm_revert',[snapshot]);
   const batchSnapshot=await network.provider.send('evm_snapshot');
   const batch=(await(await factory.deployBricksWithPolicy(items,image)).wait()).gasUsed;
   assert.ok(batch.lt(separate),'Batch must reduce gas, not just reduce prompts.');
   rows.push({bricks:count,separateTransactions:count+1,batchTransactions:1,separateGas:separate.toString(),batchGas:batch.toString(),savedGas:separate.sub(batch).toString(),savingPercent:(100*separate.sub(batch).toNumber()/separate.toNumber()).toFixed(2)});
   await network.provider.send('evm_revert',[batchSnapshot]);
  }
  console.log('ATOMIC_MINT_GAS_BENCHMARK '+JSON.stringify(rows));
 });
 it('keeps deployed factory bytecode within the EVM contract-size limit',async()=>{
  const artifact=await artifacts.readArtifact('YellowBrickFactory');assert.ok((artifact.deployedBytecode.length-2)/2<=24576);
 });
});
