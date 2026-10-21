const assert=require('node:assert/strict');
const {ethers}=require('hardhat');
const h=n=>'0x'+n.repeat(64),zero=ethers.constants.HashZero;
describe('Atomic Player permission and file-integrity policy',function(){
 let factory,owner,other;
 const files={manifestDigest:h('1'),previewHash:h('2'),artworkHash:h('3'),lyricsHash:h('4')};
 async function mint({locked=false,permissions=7,commitments=files}={}){
  const tx=await (await factory.deployBrickWithPolicy(h('a'),'ipfs://encrypted-metadata',h('b'),ethers.utils.randomBytes(32),{files:commitments,permissions,locked})).wait();
  const event=tx.events.find(e=>e.event==='BrickDeployed');
  return {brick:await ethers.getContractAt('YellowBrick',event.args.brick),id:event.args.ipId,tx};
 }
 beforeEach(async()=>{[owner,other]=await ethers.getSigners();factory=await(await ethers.getContractFactory('YellowBrickFactory')).deploy();await factory.deployed();});
 it('initializes exactly reviewed permissions, revision and lock atomically with identity',async()=>{
  const {brick,id}=await mint({locked:true});
  assert.equal(await brick.contentPolicyEnabled(),true);
  assert.equal((await brick.contentRevision()).toString(),'1');
  assert.equal(await brick.contentHash(),h('a'));assert.equal(await brick.currentContentHash(),h('a'));
  assert.equal(await brick.ipId(),id);assert.equal(await brick.effectivePlayerPermissions(),7);
  assert.equal(await brick.contentLocked(),true);assert.equal((await brick.fileCommitments()).manifestDigest,files.manifestDigest);
 });
 it('cannot grant master/project/unknown permissions or permit missing assets',async()=>{
  await assert.rejects(mint({permissions:8}),/unsupported permission/);
  await assert.rejects(mint({commitments:{...files,previewHash:zero}}),/missing preview/);
  await assert.rejects(mint({commitments:{...files,artworkHash:zero}}),/missing artwork/);
  await assert.rejects(mint({commitments:{...files,lyricsHash:zero}}),/missing lyrics/);
  const {brick}=await mint({permissions:0,commitments:{manifestDigest:h('1'),previewHash:zero,artworkHash:zero,lyricsHash:zero}});
  assert.equal(await brick.effectivePlayerPermissions(),0);
 });
 it('only the current controller may change permissions or lock content',async()=>{
  const {brick}=await mint();
  await assert.rejects(brick.connect(other).setPlayerPermissions(0,1,1),/not controller/);
  await assert.rejects(brick.connect(other).lockContent(1),/not controller/);
  await assert.rejects(brick.connect(other).reviseFiles(h('c'),files,'ipfs://new',h('d'),1,1),/not controller/);
 });
 it('rejects stale permission, lock and metadata reviews',async()=>{
  const {brick}=await mint();
  await assert.rejects(brick.setPlayerPermissions(1,2,1),/stale review/);
  await(await brick.setPlayerPermissions(1,1,1)).wait();
  await assert.rejects(brick.setPlayerPermissions(3,1,1),/stale review/);
  await assert.rejects(brick.lockContent(2),/stale review/);
  await(await brick.updateMetadataWithDigest('ipfs://description-fix',h('c'))).wait();
  await assert.rejects(brick.reviseFiles(h('c'),files,'ipfs://new',h('d'),1,1),/stale review/);
 });
 it('allows explicit file revisions, preserves the initial identity, and revokes old approvals',async()=>{
  const {brick,id}=await mint();
  const changed={...files,manifestDigest:h('5'),previewHash:h('6')};
  const tx=await(await brick.reviseFiles(h('c'),changed,'ipfs://revision-2',h('d'),1,1)).wait();
  assert.equal(await brick.ipId(),id);assert.equal(await brick.contentHash(),h('a'));
  assert.equal(await brick.currentContentHash(),h('c'));assert.equal((await brick.contentRevision()).toString(),'2');
  assert.equal((await brick.metadataVersion()).toString(),'2');assert.equal(await brick.effectivePlayerPermissions(),0);
  assert.ok(tx.events.find(e=>e.event==='ContentRevisionCommitted'));
  await(await brick.setPlayerPermissions(1,2,2)).wait();assert.equal(await brick.effectivePlayerPermissions(),1);
 });
 it('permanent file lock cannot be undone, but descriptive updates and revocation remain possible',async()=>{
  const {brick}=await mint();await(await brick.lockContent(1)).wait();
  await assert.rejects(brick.reviseFiles(h('c'),files,'ipfs://changed',h('d'),1,1),/content locked/);
  await assert.rejects(brick.lockContent(1),/already locked/);
  await(await brick.setPlayerPermissions(0,1,1)).wait();assert.equal(await brick.effectivePlayerPermissions(),0);
  await(await brick.updateMetadataWithDigest('ipfs://new-description',h('f'))).wait();
  assert.equal(await brick.currentContentHash(),h('a'));assert.equal((await brick.fileCommitments()).previewHash,h('2'));
  assert.equal(await brick.contentLocked(),true);
 });
 it('controller transfer invalidates the previous controller grant even without a permission edit',async()=>{
  const {brick}=await mint({locked:true});
  await(await brick.proposeController(other.address)).wait();await(await brick.connect(other).acceptController()).wait();
  assert.equal(await brick.effectivePlayerPermissions(),0);assert.equal(await brick.contentLocked(),true);
  await(await brick.connect(other).setPlayerPermissions(1,1,2)).wait();assert.equal(await brick.effectivePlayerPermissions(),1);
  await(await brick.connect(other).proposeController(owner.address)).wait();await(await brick.acceptController()).wait();
  assert.equal(await brick.effectivePlayerPermissions(),0,'Returning control must not revive historical permissions.');
 });
 it('legacy entry points do not silently grant policies; implementation cannot be initialized',async()=>{
  const tx=await(await factory.deployBrick(h('a'),'road-demo://old',h('1'))).wait();
  const brick=await ethers.getContractAt('YellowBrick',tx.events.find(e=>e.event==='BrickDeployed').args.brick);
  assert.equal(await brick.contentPolicyEnabled(),false);assert.equal(await brick.effectivePlayerPermissions(),0);
  await assert.rejects(brick.setPlayerPermissions(1,0,0),/legacy Brick/);
  const implementation=await ethers.getContractAt('YellowBrick',await factory.implementation());
  await assert.rejects(implementation.initializeWithPolicy(h('1'),h('2'),owner.address,'ipfs://x',h('3'),{files,permissions:7,locked:false}),/initialized/);
 });
});
