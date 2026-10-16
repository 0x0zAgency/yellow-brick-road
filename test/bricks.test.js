const assert = require("node:assert/strict");
const { ethers } = require("hardhat");
const id = ethers.utils.id;

async function rejects(promise) {
  let failure;
  try { await promise; } catch (e) { failure = e; }
  assert.ok(failure, "Transaction should revert");
}

describe("Yellow Brick Road", function () {
  let factory, creator, artist, stranger;

  beforeEach(async function () {
    [, creator, artist, stranger] = await ethers.getSigners();
    const F = await ethers.getContractFactory("YellowBrickFactory");
    factory = await F.deploy();
    await factory.deployed();
  });

  async function brick(signer, name) {
    const contentHash = id(name);
    const nonce = id("original");
    const predicted = await factory.predictBrickAddress(signer.address, contentHash, nonce);
    const tx = await factory.connect(signer).deployBrick(contentHash, "ipfs://example", nonce);
    assert.equal(tx.value.toString(), "0");
    const receipt = await tx.wait();
    assert.ok(receipt.events.find(e => e.event === "BrickDeployed"));
    const deployed = await ethers.getContractAt("YellowBrick", predicted);
    assert.equal(await deployed.controller(), signer.address);
    return { deployed, contentHash, nonce };
  }

  it("deploys autonomous contracts with deterministic address and no Road fee", async function () {
    const one = await brick(creator, "song");
    const two = await brick(artist, "cover");
    assert.notEqual(one.deployed.address, two.deployed.address);
    assert.equal(await factory.isBrick(one.deployed.address), true);
    assert.equal(await factory.brickById(await one.deployed.ipId()), one.deployed.address);
    assert.equal((await ethers.provider.getBalance(factory.address)).toString(), "0");
    await rejects(factory.connect(creator).deployBrick(one.contentHash, "ipfs://new", one.nonce));
  });

  it("restricts metadata and uses two-step contract administration", async function () {
    const one = (await brick(creator, "photo")).deployed;
    await rejects(one.connect(stranger).updateMetadata("ipfs://tamper"));
    await (await one.connect(creator).updateMetadata("ipfs://v2")).wait();
    assert.equal((await one.metadataVersion()).toNumber(), 2);
    await (await one.connect(creator).proposeController(artist.address)).wait();
    await rejects(one.connect(stranger).acceptController());
    await (await one.connect(artist).acceptController()).wait();
    assert.equal(await one.controller(), artist.address);
    assert.equal(await one.originator(), creator.address);
  });

  it("reuses bricks in an album and regeneration building without taking ownership", async function () {
    const track = (await brick(creator, "track")).deployed;
    const cover = (await brick(artist, "cover")).deployed;
    const B = await ethers.getContractFactory("YellowBrickBuilding");
    const album = await B.connect(creator).deploy(factory.address, id("ALBUM"), "ipfs://album");
    const regeneration = await B.connect(stranger).deploy(factory.address, id("REGENERATION"), "ipfs://dataset");
    await album.deployed(); await regeneration.deployed();
    await (await album.connect(creator).linkMember(track.address, id("CONTAINS"), id("album-evidence"))).wait();
    await (await album.connect(creator).linkMember(cover.address, id("CONTAINS"), id("cover-evidence"))).wait();
    await (await regeneration.connect(stranger).linkMember(track.address, id("REFERENCES"), id("usage-evidence"))).wait();
    assert.equal(await album.isMember(track.address), true);
    assert.equal(await regeneration.isMember(track.address), true);
    assert.equal(await track.controller(), creator.address);
    assert.equal(await cover.controller(), artist.address);
    await rejects(album.connect(stranger).linkMember(track.address, id("CONTAINS"), id("x")));
  });
});
