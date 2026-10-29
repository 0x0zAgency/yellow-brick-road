const assert=require('node:assert/strict');
const {ethers}=require('hardhat');
const h=s=>ethers.utils.keccak256(ethers.utils.toUtf8Bytes(s)),zero=ethers.constants.HashZero;
const registration=i=>({contentHash:h('contact-work-'+i),uri:'ipfs://encrypted-'+i,metadataDigest:h('metadata-'+i),nonce:h('nonce-'+i),withPolicy:true,
 policy:{files:{manifestDigest:h('manifest-'+i),previewHash:zero,artworkHash:zero,lyricsHash:zero},permissions:0,locked:true}});
describe('Brick licensing contacts',function(){
 let factory,owner,other;
 const mint=async(emails=['licensing@example.com'])=>{
  const tx=await(await factory.deployBricksWithLicensingContact(emails.map((_,i)=>registration(i)),'',emails)).wait();
  return Promise.all(tx.events.filter(e=>e.event==='BrickDeployed').map(e=>ethers.getContractAt('YellowBrick',e.args.brick)));
 };
 beforeEach(async()=>{[owner,other]=await ethers.getSigners();factory=await(await ethers.getContractFactory('YellowBrickFactory')).deploy();await factory.deployed();});
 it('publishes independent contacts atomically, readable without decrypting metadata',async()=>{
  assert.equal(await factory.licensingContactInterfaceVersion(),1);
  const emails=['recording@example.com','publishing@example.com',''],bricks=await mint(emails);
  for(let i=0;i<bricks.length;i++){
   const c=await bricks[i].licensingContact();assert.equal(c.email,emails[i]);assert.equal(c.version.toString(),'1');assert.equal(c.authority,owner.address);
   assert.equal(await bricks[i].effectivePlayerPermissions(),0);assert.equal(await bricks[i].contentLocked(),true);
  }
 });
 it('allows only controller updates with version checks, even when content is locked',async()=>{
  const [brick]=await mint(),before=await brick.metadataDigest();
  await assert.rejects(brick.connect(other).setLicensingContact('other@example.com',1),/not controller/);
  await assert.rejects(brick.setLicensingContact('other@example.com',0),/stale contact review/);
  const tx=await(await brick.setLicensingContact('new+requests@example.com',1)).wait();
  assert.ok(tx.events.some(e=>e.event==='LicensingContactUpdated'&&e.args.email==='new+requests@example.com'));
  await assert.rejects(brick.setLicensingContact('stale@example.com',1),/stale contact review/);
  assert.equal((await brick.licensingContact()).version.toString(),'2');assert.equal(await brick.metadataDigest(),before);assert.equal(await brick.contentLocked(),true);
  await(await brick.setLicensingContact('',2)).wait();assert.equal((await brick.licensingContact()).email,'');
 });
 it('clears contact on controller transfer and never revives a former contact',async()=>{
  const [brick]=await mint();await(await brick.proposeController(other.address)).wait();await(await brick.connect(other).acceptController()).wait();
  let c=await brick.licensingContact();assert.equal(c.email,'');assert.equal(c.authority,other.address);assert.equal(c.version.toString(),'2');
  await assert.rejects(brick.setLicensingContact('former@example.com',2),/not controller/);
  await(await brick.connect(other).setLicensingContact('next@example.com',2)).wait();
  await(await brick.connect(other).proposeController(owner.address)).wait();await(await brick.acceptController()).wait();
  c=await brick.licensingContact();assert.equal(c.email,'');assert.equal(c.version.toString(),'4');
  await assert.rejects(brick.setLicensingContact('stale@example.com',1),/stale contact review/);
 });
 it('rejects malformed addresses, headers and oversized contacts and rolls back the entire batch',async()=>{
  const invalid=['missing-at','a@localhost','a@@example.com','a@example.com\r\nBcc:x@example.com','mailto:a@example.com','Name <a@example.com>','a@example.com?subject=x','.a@example.com','a..b@example.com','a@-example.com','a@example-.com','a@example..com','x'.repeat(65)+'@example.com','a@'+'x'.repeat(64)+'.com','é@example.com','a@example.com\u0000'];
  for(const email of invalid){
   await assert.rejects(mint(['valid@example.com',email]),/invalid licensing email/);
   const r=registration(0),predicted=await factory.predictBrickAddress(owner.address,r.contentHash,r.nonce);
   assert.equal(await ethers.provider.getCode(predicted),'0x');assert.equal(await factory.isBrick(predicted),false);
  }
  await assert.rejects(factory.deployBricksWithLicensingContact([registration(0)],'',[]),/contact count/);
  await assert.rejects(factory.deployBricksWithLicensingContact([{...registration(0),withPolicy:false}],'',['a@example.com']),/contact requires policy/);
 });
 it('accepts bounded dot-atom addresses, including plus addressing and URI-reserved characters',async()=>{
  const longest='a'.repeat(64)+'@'+'b'.repeat(63)+'.'+'c'.repeat(63)+'.'+'d'.repeat(61);
  assert.equal(longest.length,254);
  const emails=[longest,"rights+sync/o'hare?team&more@example.com"];
  const bricks=await mint(emails);assert.deepEqual(await Promise.all(bricks.map(async b=>(await b.licensingContact()).email)),emails);
  await assert.rejects(bricks[0].setLicensingContact(longest+'x',1),/invalid licensing email/);
 });
 it('keeps existing entry points compatible and prevents implementation or clone reinitialization',async()=>{
  const r=registration(0),tx=await(await factory.deployBrick(r.contentHash,r.uri,r.nonce)).wait();
  const brick=await ethers.getContractAt('YellowBrick',tx.events.find(e=>e.event==='BrickDeployed').args.brick);
  assert.equal((await brick.licensingContact()).email,'');assert.equal((await brick.licensingContact()).version.toString(),'0');
  await(await brick.setLicensingContact('legacy-entry@example.com',0)).wait();
  for(const b of [brick,await ethers.getContractAt('YellowBrick',await factory.implementation())]){
   await assert.rejects(b.initializeWithPolicyAndLicensingContact(h('id'),r.contentHash,owner.address,r.uri,r.metadataDigest,r.policy,'a@example.com'),/initialized/);
  }
 });
});
