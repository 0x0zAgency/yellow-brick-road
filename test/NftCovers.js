const assert=require('node:assert/strict');
const {ethers}=require('hardhat');
const image='ipfs://bafy'+'a'.repeat(55);
const otherImage='ipfs://bafy'+'b'.repeat(55);
const decode=uri=>JSON.parse(Buffer.from(uri.split(',')[1],'base64').toString('utf8'));
describe('Registration NFT cover artwork',function(){
 let receipt,holder,other;
 beforeEach(async function(){
  [holder,other]=await ethers.getSigners();
  receipt=await (await ethers.getContractFactory('YellowBrickReceipt')).deploy(holder.address);await receipt.deployed();
  await (await receipt.mint(holder.address,1,holder.address)).wait();
  await (await receipt.mint(holder.address,2,other.address)).wait();
  await (await receipt.mint(other.address,3,other.address)).wait();
 });
 it('serves standard ERC721 metadata and uses a published cover instead of the placeholder',async function(){
  assert.equal(await receipt.supportsInterface('0x49064906'),true);
  assert.equal(await receipt.supportsInterface('0x80ac58cd'),true);
  assert.equal(await receipt.supportsInterface('0x5b5e139f'),true);
  assert.equal((await receipt.artworkVersion()).toString(),'1');
  assert.ok(decode(await receipt.tokenURI(1)).image.startsWith('data:image/svg+xml;base64,'));
  const tx=await (await receipt.setCovers([1,2],image)).wait();
  assert.equal(tx.events.filter(e=>e.event==='MetadataUpdate').length,2);
  for(const id of [1,2]){const data=decode(await receipt.tokenURI(id));assert.equal(data.image,image);assert.equal(data.name,'Yellow Brick Registration');assert.equal(await receipt.ownerOf(id),holder.address);}
  assert.equal(await receipt.brickForToken(1),holder.address);
 });
 it('supports replacement and clearing, and emits no false update for unchanged images',async function(){
  await (await receipt.setCovers([1],image)).wait();
  const unchanged=await (await receipt.setCovers([1],image)).wait();assert.equal(unchanged.events.filter(e=>e.event==='MetadataUpdate').length,0);
  await (await receipt.setCovers([1],otherImage)).wait();assert.equal(decode(await receipt.tokenURI(1)).image,otherImage);
  await (await receipt.setCovers([1],'')).wait();assert.equal(decode(await receipt.tokenURI(1)).image,await receipt.defaultImage());
 });
 it('rejects nonholders including approved operators and atomic mixed-owner batches',async function(){
  await assert.rejects(receipt.connect(other).setCovers([1],image),/only holder/);
  await (await receipt.approve(other.address,1)).wait();
  await assert.rejects(receipt.connect(other).setCovers([1],image),/only holder/);
  await assert.rejects(receipt.setCovers([1,3],image),/only holder/);
  assert.equal(await receipt.coverURI(1),'');
  await assert.rejects(receipt.setCovers([999],image));
 });
 it('rejects mutable or injected URIs and overlarge batches without changing art',async function(){
  for(const bad of ['https://server/cover.png','data:image/svg+xml;base64,eA==','ipfs://short',image+'/path',image+'?key=x',image+'#fragment',image+'"',image+'\n','ipfs://'+'a'.repeat(200)])await assert.rejects(receipt.setCovers([1],bad),/invalid cover URI/);
  await assert.rejects(receipt.setCovers([],image),/batch limit/);
  await assert.rejects(receipt.setCovers(Array(33).fill(1),image),/batch limit/);
 });
 it('keeps the registration NFT nontransferable after assigning artwork',async function(){
  await (await receipt.setCovers([1],image)).wait();
  await assert.rejects(receipt.transferFrom(holder.address,other.address,1),/not transferable/);
 });
 it('does not alter Brick content, encrypted metadata, controller or registration identity',async function(){
  const factory=await (await ethers.getContractFactory('YellowBrickFactory')).deploy();await factory.deployed();
  const content='0x'+'a'.repeat(64),digest='0x'+'b'.repeat(64),nonce='0x'+'c'.repeat(64),uri='ipfs://bafy-private-encrypted-original';
  const tx=await (await factory.deployBrickWithMetadataDigest(content,uri,digest,nonce)).wait();
  const event=tx.events.find(e=>e.event==='BrickDeployed');
  const brick=await ethers.getContractAt('YellowBrick',event.args.brick);
  const collection=await ethers.getContractAt('YellowBrickReceipt',await factory.receiptToken());
  await (await collection.setCovers([event.args.ipId],image)).wait();
  assert.equal(decode(await collection.tokenURI(event.args.ipId)).image,image);
  assert.equal(await brick.contentHash(),content);assert.equal(await brick.metadataDigest(),digest);assert.equal(await brick.metadataURI(),uri);assert.equal(await brick.controller(),holder.address);assert.equal(await brick.ipId(),event.args.ipId);
 });
});
