const assert = require("node:assert/strict");
const { ethers } = require("hardhat");
const hash = ethers.utils.id;
const PRICE = 1_000_000; // one mock-dollar, 6 decimals
async function reverts(p, pattern) {
  try { await p; assert.fail("Expected revert"); }
  catch(e) { if(e.message === "Expected revert") throw e; assert.match(e.message, pattern || /revert/i); }
}
describe("Road license and royalties", function() {
  let creator, coauthor, buyer, stranger, factory, brick, usd, licenses, settlement, licenseId;
  beforeEach(async function() {
    [, creator, coauthor, buyer, stranger] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("YellowBrickFactory");
    factory = await Factory.deploy(); await factory.deployed();
    const content = hash("song"); const salt = hash("first");
    await (await factory.connect(creator).deployBrick(content, "ipfs://song", salt)).wait();
    const address = await factory.predictBrickAddress(creator.address, content, salt);
    brick = await ethers.getContractAt("YellowBrick", address);
    const Token = await ethers.getContractFactory("MockUSD");
    usd = await Token.deploy(); await usd.deployed();
    const License = await ethers.getContractFactory("YellowBrickLicense");
    licenses = await License.deploy(factory.address); await licenses.deployed();
    const Settlement = await ethers.getContractFactory("RoadRoyaltySettlement");
    settlement = await Settlement.deploy(usd.address, licenses.address, factory.address);
    await settlement.deployed();
    await (await settlement.connect(creator).configurePayout(brick.address,
      [creator.address, coauthor.address], [8000, 2000])).wait();
    await (await usd.mint(buyer.address, 10 * PRICE)).wait();
    await (await usd.connect(buyer).approve(settlement.address, 10 * PRICE)).wait();
    const issue = licenses.connect(creator).issueLicense(brick.address, buyer.address,
      usd.address, PRICE, hash("allowed-use-terms"), 1, 0, hash("license-1"));
    licenseId = await issue.callStatic();
    await (await issue).wait();
  });
  it("routes one mock-dollar as exact 80/20 royalties, no Road fee", async function() {
    await (await settlement.connect(buyer).settle(licenseId, hash("use-1"), hash("attestation-1"))).wait();
    assert.equal((await settlement.claimable(creator.address)).toNumber(), 800000);
    assert.equal((await settlement.claimable(coauthor.address)).toNumber(), 200000);
    assert.equal((await settlement.totalClaimable()).toNumber(), PRICE);
    await (await settlement.connect(creator).claim()).wait();
    await (await settlement.connect(coauthor).claim()).wait();
    assert.equal((await usd.balanceOf(creator.address)).toNumber(), 800000);
    assert.equal((await usd.balanceOf(coauthor.address)).toNumber(), 200000);
    assert.equal((await usd.balanceOf(settlement.address)).toNumber(), 0);
  });
  it("rejects duplicates, wrong payer, and revoked license", async function() {
    await reverts(settlement.connect(stranger).settle(licenseId, hash("use-1"), hash("proof")), /wrong payer/);
    await (await settlement.connect(buyer).settle(licenseId, hash("use-1"), hash("proof"))).wait();
    await reverts(settlement.connect(buyer).settle(licenseId, hash("use-1"), hash("proof")), /duplicate usage/);
    await reverts(licenses.connect(stranger).revokeLicense(licenseId), /not controller/);
    await (await licenses.connect(creator).revokeLicense(licenseId)).wait();
    await reverts(settlement.connect(buyer).settle(licenseId, hash("use-2"), hash("proof")), /inactive license/);
    assert.equal((await settlement.claimable(coauthor.address)).toNumber(), 200000);
  });
  it("rejects improper split totals, duplicate recipients, and unauthorized actors", async function() {
    await reverts(settlement.connect(stranger).configurePayout(brick.address, [stranger.address], [10000]), /not controller/);
    await reverts(settlement.connect(creator).configurePayout(brick.address,
      [creator.address, coauthor.address], [7000, 2000]), /total 10000/);
    await reverts(settlement.connect(creator).configurePayout(brick.address,
      [creator.address, creator.address], [8000, 2000]), /duplicate recipient/);
    await reverts(licenses.connect(stranger).issueLicense(brick.address, buyer.address,
      usd.address, PRICE, hash("terms"), 1, 0, hash("other")), /not controller/);
  });
  it("pins old licenses to immutable royalty split versions", async function() {
    await (await settlement.connect(creator).configurePayout(brick.address,
      [creator.address, coauthor.address], [5000, 5000])).wait();
    await (await settlement.connect(buyer).settle(licenseId, hash("use-old"), hash("proof"))).wait();
    assert.equal((await settlement.claimable(creator.address)).toNumber(), 800000);
    assert.equal((await settlement.claimable(coauthor.address)).toNumber(), 200000);
  });
  it("requires evidence and approved funds", async function() {
    await reverts(settlement.connect(buyer).settle(licenseId, ethers.constants.HashZero, hash("proof")), /missing evidence/);
    await (await usd.connect(buyer).approve(settlement.address, 0)).wait();
    await reverts(settlement.connect(buyer).settle(licenseId, hash("use"), hash("proof")), /allowance/);
    assert.equal((await settlement.totalClaimable()).toNumber(), 0);
  });
});
