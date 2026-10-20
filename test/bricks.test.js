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

  it("mints wallet-importable ERC721 registration receipts distinct from Brick rights", async function () {
    const receiptAddress = await factory.receiptToken();
    const token = await ethers.getContractAt("YellowBrickReceipt", receiptAddress);
    const work = (await brick(creator, "receipt-work")).deployed;
    const ipId = await work.ipId();
    const tokenId = ethers.BigNumber.from(ipId);
    assert.equal(await token.name(), "Yellow Brick Registration");
    assert.equal(await token.symbol(), "YBRR");
    assert.equal(await token.supportsInterface("0x80ac58cd"), true);
    assert.equal(await token.supportsInterface("0x5b5e139f"), true);
    assert.equal(await token.ownerOf(tokenId), creator.address);
    assert.equal(await token.brickForToken(tokenId), work.address);
    const uri = await token.tokenURI(tokenId);
    assert.ok(uri.startsWith("data:application/json;base64,"));
    const metadata = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString("utf8"));
    assert.equal(metadata.name, "Yellow Brick Registration");
    assert.ok(metadata.description.includes("not evidence"));
    assert.equal(metadata.attributes.find(a => a.trait_type === "Default Artwork").value, "yellow-square-v1");
    assert.equal(metadata.attributes.find(a => a.trait_type === "Brick Contract").value.toLowerCase(), work.address.toLowerCase());
    assert.ok(metadata.image.startsWith("data:image/svg+xml;base64,"));
    assert.equal(metadata.image, await token.defaultImage());
    const svg = Buffer.from(metadata.image.split(",")[1], "base64").toString("utf8");
    assert.ok(svg.includes("🟨"), "Metadata image must explicitly identify the yellow-square emoji");
    assert.ok(svg.includes('fill="#FFD93D"'), "Emoji-colored yellow square is the image fallback");
    assert.ok(svg.includes('viewBox="0 0 512 512"'), "Wallet artwork should scale to a square icon");
    assert.ok(!/<(?:script|image|use|link)\b/i.test(svg) && !/\b(?:href|src)\s*=\s*["\x27]https?:\/\//i.test(svg), "Artwork must use only inline SVG shapes, not linked assets");
    await rejects(token.connect(creator).transferFrom(creator.address, artist.address, tokenId));
    await rejects(token.connect(stranger).mint(stranger.address, ethers.BigNumber.from("5"), work.address));
    assert.equal(await work.controller(), creator.address);
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

  it("commits exact metadata digests, versions changes and clears stale legacy commitments", async function () {
    const contentHash = id("finished-audio");
    const nonce = id("metadata-v1");
    const digest = id('{"title":"Master V1"}');
    const predicted = await factory.predictBrickAddress(creator.address, contentHash, nonce);
    await (await factory.connect(creator).deployBrickWithMetadataDigest(contentHash, "ipfs://metadata-v1", digest, nonce)).wait();
    const b = await ethers.getContractAt("YellowBrick", predicted);
    assert.equal(await b.metadataDigest(), digest);
    assert.equal((await b.metadataVersion()).toNumber(), 1);
    await rejects(b.connect(stranger).updateMetadataWithDigest("ipfs://tamper", id("tamper")));
    await rejects(b.connect(creator).updateMetadataWithDigest("ipfs://v2", ethers.constants.HashZero));
    const digest2 = id('{"title":"Master V2"}');
    await (await b.connect(creator).updateMetadataWithDigest("ipfs://metadata-v2", digest2)).wait();
    assert.equal(await b.metadataDigest(), digest2);
    assert.equal((await b.metadataVersion()).toNumber(), 2);
    await (await b.connect(creator).updateMetadata("ipfs://uncommitted-legacy")).wait();
    assert.equal(await b.metadataDigest(), ethers.constants.HashZero);
    assert.equal((await b.metadataVersion()).toNumber(), 3);
    await rejects(factory.connect(creator).deployBrick(contentHash, "ipfs://again", nonce));
    assert.equal(await b.originator(), creator.address);
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
