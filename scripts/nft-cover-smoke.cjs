'use strict';
/** CI only: actual public IPFS cover + actual ERC-721 tokenURI update on disposable Ganache. */
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const crypto=require('node:crypto');
async function main(){
 if(!process.env.CI)throw Error('Run this minting integration on disposable CI Ganache, not a creator chain.');
 const {uploadNftCover}=await import('../web/src/nft-cover-storage.js');
 const {nftCoverSession,decodeReceiptMetadata}=await import('../web/src/nft-cover-chain.js');
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAIUlEQVR4nGP8f9kpxjeSgYGBgYGBMVphNgMMMDEgARQOAMDRBDMbPbpyAAAAAElFTkSuQmCC','base64');
 const image=await uploadNftCover(bytes,{consent:true,fetchImpl:(url,options)=>fetch('http://127.0.0.1:5173'+url,options)});
 const gateway=await fetch('http://127.0.0.1:8080/ipfs/'+image.cid);
 assert.equal(gateway.status,200);assert.deepEqual(Buffer.from(await gateway.arrayBuffer()),bytes);
 const status=await (await fetch('http://127.0.0.1:4173/road/api/status')).json();assert.equal(status.chainId,1337);
 const rpc=new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545'),signer=rpc.getSigner(0);
 const factory=new ethers.Contract(status.factoryAddress,['function deployBrickWithMetadataDigest(bytes32,string,bytes32,bytes32) returns (address)','function receiptToken() view returns (address)','event BrickDeployed(bytes32 indexed ipId,address indexed brick,address indexed originator,bytes32 contentHash)'],signer);
 const content='0x'+crypto.randomBytes(32).toString('hex'),digest='0x'+crypto.randomBytes(32).toString('hex'),nonce='0x'+crypto.randomBytes(32).toString('hex'),privateURI='road-local://sha256/'+digest.slice(2);
 const tx=await (await factory.deployBrickWithMetadataDigest(content,privateURI,digest,nonce)).wait();
 const event=tx.events.find(e=>e.event==='BrickDeployed'),collection=await factory.receiptToken();
 const nft=new ethers.Contract(collection,['function tokenURI(uint256) view returns (string)','function supportsInterface(bytes4) view returns (bool)','event MetadataUpdate(uint256 _tokenId)'],rpc);
 const id=event.args.ipId,tokenId=BigInt(id).toString();
 assert.match(decodeReceiptMetadata(await nft.tokenURI(tokenId)).image,/^data:image\/svg/);
 const mint={simulated:false,status:'confirmed',chainId:1337,factoryAddress:factory.address,receipts:[{status:'verified',chainId:1337,nftContractAddress:collection,tokenId,contractAddress:event.args.brick}]};
 const provider={request:({method,params=[]})=>rpc.send(method,params)};
 const session=await nftCoverSession({mint,provider,expectedAccount:await signer.getAddress()});
 const updated=await session.update(image.imageURI);
 assert.equal(updated.metadata[0].image,'ipfs://'+image.cid);assert.equal(await nft.supportsInterface('0x49064906'),true);
 const chainReceipt=await rpc.getTransactionReceipt(updated.transactionHash);
 assert.ok(chainReceipt.logs.some(log=>{try{return nft.interface.parseLog(log).name==='MetadataUpdate';}catch{return false;}}));
 const brick=new ethers.Contract(event.args.brick,['function contentHash() view returns (bytes32)','function metadataDigest() view returns (bytes32)','function metadataURI() view returns (string)'],rpc);
 assert.equal(await brick.contentHash(),content);assert.equal(await brick.metadataDigest(),digest);assert.equal(await brick.metadataURI(),privateURI);
 console.log('NFT COVER PASS: exact public PNG pinned/retrieved through Vite and Kubo; real wallet-backed setCovers; tokenURI image verified; ERC-4906 emitted; private Brick commitments unchanged.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
