const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");
const H = ethers.utils.id;
async function revert(p, hint) {
  try { await p; assert.fail("expected revert"); }
  catch (e) { if (e.message === "expected revert") throw e; assert.match(e.message, hint); }
}
async function advance(seconds) {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
}
describe("Road utility governance, node eligibility, and fee caps", function() {
  let owner, citizenA, citizenB, operator, outsider, governor, registry, usd, treasury;
  async function approveProposal(signer, target, data) {
    const id = (await governor.proposalCount()).add(1);
    await (await governor.connect(signer).propose(target, data)).wait();
    await (await governor.connect(citizenA).vote(id, true)).wait();
    await (await governor.connect(citizenB).vote(id, true)).wait();
    await advance(3*24*60*60 + 2);
    await (await governor.connect(outsider).execute(id, data)).wait();
  }
  beforeEach(async function() {
    [owner,citizenA,citizenB,operator,outsider] = await ethers.getSigners();
    const Gov = await ethers.getContractFactory("RoadGovernance");
    governor = await Gov.deploy(owner.address); await governor.deployed();
    const Registry = await ethers.getContractFactory("RoadNodeRegistry");
    registry = await Registry.deploy(governor.address); await registry.deployed();
    const Token = await ethers.getContractFactory("MockUSD");
    usd = await Token.deploy(); await usd.deployed();
    const Treasury = await ethers.getContractFactory("RoadTreasury");
    treasury = await Treasury.deploy(governor.address,registry.address,usd.address); await treasury.deployed();
    await (await governor.configureTargets(treasury.address,registry.address)).wait();
    await (await governor.enroll(citizenA.address,H("unique-person-a"),2)).wait();
    await (await governor.enroll(citizenB.address,H("unique-person-b"),1)).wait();
    await (await usd.mint(outsider.address, 10_000_000)).wait();
    await (await usd.connect(outsider).approve(treasury.address,10_000_000)).wait();
  });
  it("accepts all attested users with bounded weight, denies duplicate identity and arbitrary contracts",async function(){
    await revert(governor.connect(outsider).enroll(outsider.address,H("faked"),5),/not attester/);
    await revert(governor.enroll(outsider.address,H("unique-person-a"),1),/duplicate identity/);
    await revert(governor.enroll(outsider.address,H("other-person"),6),/invalid weight/);
    await revert(governor.connect(citizenA).propose(usd.address,"0xabcdef00"),/target forbidden/);
  });
  it("voters approve a timelocked budget and fee collection stops at exact cap",async function(){
    const data=treasury.interface.encodeFunctionData("openBudget",[1500,100]);
    const id=(await governor.proposalCount()).add(1);
    await (await governor.connect(citizenA).propose(treasury.address,data)).wait();
    await revert(governor.connect(outsider).execute(id,data),/timelocked/);
    await (await governor.connect(citizenA).vote(id,true)).wait();
    await revert(governor.connect(citizenA).vote(id,true),/already voted/);
    await (await governor.connect(citizenB).vote(id,true)).wait();
    await advance(3*24*60*60 + 2);
    await (await governor.execute(id,data)).wait();
    assert.equal((await treasury.quote(100000)).toNumber(),1000);
    await (await treasury.connect(outsider).collect(100000,1000)).wait();
    assert.equal((await treasury.quote(100000)).toNumber(),500);
    await (await treasury.connect(outsider).collect(100000,500)).wait();
    assert.equal((await treasury.quote(100000)).toNumber(),0);
    await (await treasury.connect(outsider).collect(100000,0)).wait();
    assert.equal((await treasury.collected()).toNumber(),1500);
    assert.equal((await usd.balanceOf(treasury.address)).toNumber(),1500);
  });
  it("only enrolled operator service payments pass voted eligibility and replay protection",async function(){
    await approveProposal(citizenA,treasury.address,treasury.interface.encodeFunctionData("openBudget",[1000,100]));
    await (await treasury.connect(outsider).collect(100000,1000)).wait();
    await revert(treasury.connect(operator).payService(operator.address,H("work"),100),/governance only/);
    const approve=treasury.interface.encodeFunctionData("payService",[operator.address,H("work"),100]);
    const prop=(await governor.proposalCount()).add(1);
    await (await governor.connect(citizenA).propose(treasury.address,approve)).wait();
    await (await governor.connect(citizenA).vote(prop,true)).wait();
    await (await governor.connect(citizenB).vote(prop,true)).wait();
    await advance(3*24*60*60+2);
    await revert(governor.execute(prop,approve),/ineligible node/);
    const attestation=registry.interface.encodeFunctionData("attest",
      [operator.address,H("externally-reviewed-node"),H("externally-reviewed-service"),true]);
    await approveProposal(citizenA,registry.address,attestation);
    await (await governor.execute(prop,approve)).wait();
    assert.equal((await usd.balanceOf(operator.address)).toNumber(),100);
    await revert(governor.execute(prop,approve),/timelocked/);
    const replay=treasury.interface.encodeFunctionData("payService",[operator.address,H("work"),100]);
    const second=(await governor.proposalCount()).add(1);
    await (await governor.connect(citizenA).propose(treasury.address,replay)).wait();
    await (await governor.connect(citizenA).vote(second,true)).wait();
    await (await governor.connect(citizenB).vote(second,true)).wait();
    await advance(3*24*60*60+2);
    await revert(governor.execute(second,replay),/duplicate work/);
  });
});
