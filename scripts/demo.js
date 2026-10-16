const { ethers } = require("hardhat");
const hash = ethers.utils.id;
async function main() {
  const [, creator, collaborator, buyer] = await ethers.getSigners();
  const F = await ethers.getContractFactory("YellowBrickFactory");
  const factory = await F.deploy(); await factory.deployed();
  const content = hash("demonstration recording"); const nonce = hash("demo");
  const address = await factory.predictBrickAddress(creator.address, content, nonce);
  await (await factory.connect(creator).deployBrick(content, "ipfs://example", nonce)).wait();
  const brick = await ethers.getContractAt("YellowBrick", address);
  const B = await ethers.getContractFactory("YellowBrickBuilding");
  const album = await B.connect(creator).deploy(factory.address, hash("ALBUM"), "ipfs://album");
  await album.deployed();
  await (await album.connect(creator).linkMember(brick.address, hash("CONTAINS"), hash("evidence"))).wait();
  const T = await ethers.getContractFactory("MockUSD");
  const usd = await T.deploy(); await usd.deployed();
  const L = await ethers.getContractFactory("YellowBrickLicense");
  const licenses = await L.deploy(factory.address); await licenses.deployed();
  const S = await ethers.getContractFactory("RoadRoyaltySettlement");
  const settlement = await S.deploy(usd.address, licenses.address, factory.address);
  await settlement.deployed();
  await (await settlement.connect(creator).configurePayout(brick.address,
    [creator.address, collaborator.address], [8000, 2000])).wait();
  const price = 1000000;
  const licenseId = await licenses.connect(creator).callStatic.issueLicense(brick.address, buyer.address,
    usd.address, price, hash("license terms"), 1, 0, hash("first license"));
  await (await licenses.connect(creator).issueLicense(brick.address, buyer.address,
    usd.address, price, hash("license terms"), 1, 0, hash("first license"))).wait();
  await (await usd.mint(buyer.address, price)).wait();
  await (await usd.connect(buyer).approve(settlement.address, price)).wait();
  await (await settlement.connect(buyer).settle(licenseId, hash("use-1"), hash("attestation"))).wait();
  console.log("0x Yellow Brick Road local demo");
  console.log("Brick:", brick.address, "IP ID:", await brick.ipId());
  console.log("Album:", album.address, "members:", (await album.memberCount()).toString());
  console.log("License:", licenseId);
  console.log("Creator royalties:", ethers.utils.formatUnits(await settlement.claimable(creator.address), 6));
  console.log("Collaborator royalties:", ethers.utils.formatUnits(await settlement.claimable(collaborator.address), 6));
  console.log("Road utility fee: 0 (future capped, governed infrastructure)");
  console.log("No actual dollar or live network involved.");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
