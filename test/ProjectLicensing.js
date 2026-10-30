const assert=require('node:assert/strict');
const {ethers,artifacts}=require('hardhat');
const h=ethers.utils.id,Z=ethers.constants.AddressZero;
const fields=[['controller','address'],['licensee','address'],['receiver','address'],['deployment','address'],['asset','address'],['scope','uint8'],['projectHash','bytes32'],['termsHash','bytes32'],['unitPrice','uint128'],['units','uint64'],['expiresAt','uint64'],['deadline','uint64'],['epoch','uint64'],['nonce','bytes32'],['revocable','bool']].map(([name,type])=>({name,type}));
describe('Direct Brick project licensing and IP funds',function(){
 let owner,buyer,collaborator,other,factory,brick,domain,offer;
 const signed=(o=offer,signer=owner)=>signer._signTypedData(domain,{LicenseOffer:fields},o);
 const id=(o=offer)=>ethers.utils._TypedDataEncoder.hash(domain,{LicenseOffer:fields},o);
 const accept=async(o=offer,signature)=>brick.connect(buyer).acceptProjectLicense(o,signature??await signed(o),{value:o.asset===Z?ethers.BigNumber.from(o.unitPrice).mul(o.units):0});
 beforeEach(async()=>{
  [owner,buyer,collaborator,other]=await ethers.getSigners();factory=await(await ethers.getContractFactory('YellowBrickFactory')).deploy();await factory.deployed();
  const receipt=await(await factory.deployBrick(h('work'),'ipfs://work',h('nonce'))).wait();
  brick=await ethers.getContractAt('YellowBrick',receipt.events.find(e=>e.event==='BrickDeployed').args.brick);
  const now=(await ethers.provider.getBlock('latest')).timestamp;
  domain={name:'Yellow Brick Project License',version:'1',chainId:31337,verifyingContract:brick.address,salt:await brick.licensingDomainSalt()};
  offer={controller:owner.address,licensee:buyer.address,receiver:brick.address,deployment:other.address,asset:Z,scope:1,projectHash:h('project'),termsHash:h('terms'),unitPrice:100,units:10,expiresAt:now+86400,deadline:now+3600,epoch:0,nonce:h('offer'),revocable:false};
 });
 it('fits deployed-code and init-code limits',async()=>{for(const name of ['YellowBrick','YellowBrickFactory']){const a=await artifacts.readArtifact(name);assert.ok((a.deployedBytecode.length-2)/2<=24576,name+' runtime');assert.ok((a.bytecode.length-2)/2<=49152,name+' init');}});
 it('matches EIP-712, retains payment in the individual Brick and claims only once',async()=>{
  assert.equal(await brick.licenseOfferDigest(offer),id());assert.equal(await brick.licenseReceiver(),brick.address);
  await(await accept()).wait();assert.equal((await ethers.provider.getBalance(brick.address)).toString(),'1000');
  assert.equal((await brick.licenseClaimable(Z,owner.address)).toString(),'1000');assert.equal((await brick.projectLicense(id())).paid.toString(),'1000');
  await assert.rejects(accept(),/LicenseSpentOrCancelled/);await assert.rejects(brick.connect(other).claimIPFunds(Z),/LicenseNothingToClaim/);
  await(await brick.claimIPFunds(Z)).wait();assert.equal((await ethers.provider.getBalance(brick.address)).toString(),'0');assert.equal((await brick.totalLicenseClaimable(Z)).toString(),'0');
  await assert.rejects(brick.claimIPFunds(Z),/LicenseNothingToClaim/);
 });
 it('credits native donations and preserves accrued 80/20 balances after payout changes',async()=>{
  await brick.configureLicensePayout([owner.address,collaborator.address],[8000,2000],0,0);
  await owner.sendTransaction({to:brick.address,value:1001});
  assert.equal((await brick.licenseClaimable(Z,owner.address)).toString(),'800');assert.equal((await brick.licenseClaimable(Z,collaborator.address)).toString(),'201');
  await brick.configureLicensePayout([other.address],[10000],1,1);await owner.sendTransaction({to:brick.address,value:200});
  assert.equal((await brick.licenseClaimable(Z,collaborator.address)).toString(),'201');assert.equal((await brick.licenseClaimable(Z,other.address)).toString(),'200');
  const before=await ethers.provider.getBalance(collaborator.address),tx=await(await brick.connect(collaborator).claimIPFunds(Z)).wait();
  assert.equal((await ethers.provider.getBalance(collaborator.address)).add(tx.gasUsed.mul(tx.effectiveGasPrice)).sub(before).toString(),'201');
  assert.equal((await ethers.provider.getBalance(brick.address)).toString(),'1000');
 });
 it('rejects unauthorized, malformed and stale payout edits',async()=>{
  await assert.rejects(brick.connect(buyer).configureLicensePayout([buyer.address],[10000],0,0),/LicenseNotController/);
  for(const [recipients,shares,reason] of [[[],[],'LicensePayoutCount'],[[owner.address],[9999],'LicenseSharesTotal10000'],[[owner.address,owner.address],[5000,5000],'LicenseDuplicatePayee'],[[brick.address],[10000],'LicenseInvalidPayee']])await assert.rejects(brick.configureLicensePayout(recipients,shares,0,0),new RegExp(reason));
  await brick.configureLicensePayout([owner.address],[10000],0,0);await assert.rejects(brick.configureLicensePayout([owner.address],[10000],0,0),/LicenseStalePayout/);
 });
 it('holds ERC20 payments and accounts direct token deposits exactly once',async()=>{
  const token=await(await ethers.getContractFactory('MockUSD')).deploy();await token.deployed();
  await token.mint(buyer.address,5000);await token.connect(buyer).approve(brick.address,1000);
  const o={...offer,asset:token.address};await(await accept(o)).wait();
  assert.equal((await token.balanceOf(brick.address)).toString(),'1000');assert.equal((await token.balanceOf(owner.address)).toString(),'0');
  await token.connect(buyer).transfer(brick.address,100);await brick.accountReceivedIPFunds(token.address);
  assert.equal((await brick.licenseClaimable(token.address,owner.address)).toString(),'1100');
  await assert.rejects(brick.accountReceivedIPFunds(token.address),/LicenseNoUnallocatedFunds/);
  await brick.claimIPFunds(token.address);assert.equal((await token.balanceOf(owner.address)).toString(),'1100');assert.equal((await token.balanceOf(brick.address)).toString(),'0');
 });
 it('rejects wrong parties, receivers, payments and unauthorized signatures atomically',async()=>{
  const signature=await signed();await assert.rejects(brick.acceptProjectLicense(offer,signature,{value:1000}),/LicenseWrongParty/);
  await assert.rejects(accept({...offer,receiver:other.address}),/LicenseStaleOffer/);
  await assert.rejects(accept(offer,await signed(offer,other)),/LicenseApprovalRequired/);
  await assert.rejects(brick.connect(buyer).acceptProjectLicense(offer,signature,{value:999}),/LicenseWrongPayment/);
  assert.equal((await brick.projectLicense(id())).licensee,Z);assert.equal((await ethers.provider.getBalance(brick.address)).toString(),'0');
 });
 it('invalidates unaccepted signatures when splits or owner change but preserves earned funds',async()=>{
  const signature=await signed();await owner.sendTransaction({to:brick.address,value:500});
  await brick.proposeController(other.address);await brick.connect(other).acceptController();
  assert.equal((await brick.licensePayout(0))[0].recipient,owner.address);
  await assert.rejects(accept(offer,signature),/LicenseWrongParty/);
  await other.sendTransaction({to:brick.address,value:200});assert.equal((await brick.licenseClaimable(Z,owner.address)).toString(),'500');assert.equal((await brick.licenseClaimable(Z,other.address)).toString(),'200');
  await brick.claimIPFunds(Z);assert.equal((await ethers.provider.getBalance(brick.address)).toString(),'200');
 });
 it('defaults to manual approval and enforces all automatic acceptance limits',async()=>{
  assert.equal((await brick.autoLicensePolicy(1)).enabled,false);
  const policy={enabled:true,asset:Z,termsHash:offer.termsHash,projectHash:offer.projectHash,minUnitPrice:100,maxUnits:10,maxDuration:86400,revocable:false,epoch:0,version:0};
  await brick.setAutoLicensePolicy(1,policy,0,0);
  assert.equal(await brick.qualifiesForAutomaticLicense(offer),true);
  for(const changes of [{scope:2},{asset:other.address},{termsHash:h('changed')},{projectHash:h('changed')},{unitPrice:99},{units:11},{expiresAt:offer.expiresAt+86400},{revocable:true}]){
   const o={...offer,...changes};assert.equal(await brick.qualifiesForAutomaticLicense(o),false);await assert.rejects(accept(o,'0x'),/LicenseApprovalRequired/);
  }
  await(await accept(offer,'0x')).wait();assert.equal((await brick.licenseClaimable(Z,owner.address)).toString(),'1000');
  await brick.configureLicensePayout([owner.address],[10000],0,0);assert.equal((await brick.autoLicensePolicy(1)).enabled,false);
 });
 it('checks policy ownership, revisions and complete terms',async()=>{
  const p={enabled:true,asset:Z,termsHash:h('terms'),projectHash:ethers.constants.HashZero,minUnitPrice:0,maxUnits:10,maxDuration:86400,revocable:false,epoch:0,version:0};
  await assert.rejects(brick.connect(buyer).setAutoLicensePolicy(1,p,0,0),/LicenseNotController/);
  await assert.rejects(brick.setAutoLicensePolicy(1,{...p,termsHash:ethers.constants.HashZero},0,0),/LicenseIncompletePolicy/);
  await brick.setAutoLicensePolicy(1,p,0,0);await assert.rejects(brick.setAutoLicensePolicy(1,p,0,0),/LicenseStalePolicy/);
 });
 it('cannot reuse cancelled, expired, cross-Brick or changed-term authorizations',async()=>{
  const signature=await signed();await assert.rejects(brick.connect(other).cancelLicenseOffer(offer),/LicenseWrongParty/);
  await assert.rejects(accept({...offer,termsHash:h('changed')},signature),/LicenseApprovalRequired/);
  await assert.rejects(accept({...offer,deadline:1}),/LicenseExpiredOffer/);
  const wrongDomain={...domain,verifyingContract:factory.address};await assert.rejects(accept(offer,await owner._signTypedData(wrongDomain,{LicenseOffer:fields},offer)),/LicenseApprovalRequired/);
  await brick.connect(buyer).cancelLicenseOffer(offer);await assert.rejects(accept(offer,signature),/LicenseSpentOrCancelled/);
 });
 it('records prepaid ingestion/publishing use without charging again or exceeding units',async()=>{
  await(await accept()).wait();await brick.connect(buyer).recordLicensedUse(id(),h('use1'),6,h('evidence1'));
  await assert.rejects(brick.recordLicensedUse(id(),h('use2'),1,h('evidence2')),/LicenseInactiveLicense/);
  await assert.rejects(brick.connect(buyer).recordLicensedUse(id(),h('use1'),1,h('evidence1')),/LicenseDuplicateOrExhausted/);
  await assert.rejects(brick.connect(buyer).recordLicensedUse(id(),h('use2'),5,h('evidence2')),/LicenseDuplicateOrExhausted/);
  await brick.connect(buyer).recordLicensedUse(id(),h('use2'),4,h('evidence2'));assert.equal((await brick.projectLicense(id())).consumed.toString(),'10');assert.equal((await ethers.provider.getBalance(brick.address)).toString(),'1000');
 });
 it('permits revocation only when agreed and never silently reassigns or refunds accrued funds',async()=>{
  await(await accept()).wait();await assert.rejects(brick.revokeProjectLicense(id()),/LicenseNotRevocable/);
  const o={...offer,revocable:true,scope:2,nonce:h('second')};await(await accept(o)).wait();
  await assert.rejects(brick.connect(other).revokeProjectLicense(id(o)),/LicenseNotController/);await brick.revokeProjectLicense(id(o));
  await assert.rejects(brick.connect(buyer).recordLicensedUse(id(o),h('use'),1,h('evidence')),/LicenseInactiveLicense/);assert.equal((await brick.licenseClaimable(Z,owner.address)).toString(),'2000');
 });
 it('restores balances after rejected withdrawals and prevents recursive extraction',async()=>{
  const recipient=await(await ethers.getContractFactory('LicensingClaimRecipient')).deploy();await recipient.deployed();
  await brick.configureLicensePayout([recipient.address],[10000],0,0);await owner.sendTransaction({to:brick.address,value:1000});
  await recipient.configure(true,false);await assert.rejects(recipient.claim(brick.address,Z),/LicenseClaimFailed/);
  assert.equal((await brick.licenseClaimable(Z,recipient.address)).toString(),'1000');assert.equal((await brick.totalLicenseClaimable(Z)).toString(),'1000');
  await recipient.configure(false,true);await recipient.claim(brick.address,Z);assert.equal(await recipient.reentrySucceeded(),false);
  assert.equal((await ethers.provider.getBalance(recipient.address)).toString(),'1000');assert.equal((await ethers.provider.getBalance(brick.address)).toString(),'0');
 });
 it('supports contract-wallet controller approvals through ERC1271',async()=>{
  const controller=await(await ethers.getContractFactory('LicensingContractController')).deploy(owner.address);await controller.deployed();
  await brick.proposeController(controller.address);await controller.execute(brick.address,brick.interface.encodeFunctionData('acceptController'));
  const o={...offer,controller:controller.address,epoch:1};await(await accept(o,await signed(o))).wait();
  assert.equal((await brick.licenseClaimable(Z,controller.address)).toString(),'1000');
 });
 it('rejects transfer-tax payment assets without recording a license or losing buyer funds',async()=>{
  const token=await(await ethers.getContractFactory('LicensingTaxToken')).deploy();await token.deployed();await token.mint(buyer.address,1000);await token.connect(buyer).approve(brick.address,1000);
  const o={...offer,asset:token.address};await assert.rejects(accept(o),/LicenseTransferFeeAsset/);
  assert.equal((await token.balanceOf(buyer.address)).toString(),'1000');assert.equal((await token.balanceOf(brick.address)).toString(),'0');assert.equal((await brick.projectLicense(id(o))).licensee,Z);
 });
});
