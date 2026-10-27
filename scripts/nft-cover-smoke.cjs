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
 const {readRegistrationCover}=await import('../web/src/brick-presentation.js');
 const publicReadClient={getChainId:async()=>(await rpc.getNetwork()).chainId,
  getBlock:async options=>rpc.getBlock(options.blockNumber===undefined?'latest':Number(options.blockNumber)),
  readContract:async p=>new ethers.Contract(p.address,p.abi,rpc)[p.functionName](...(p.args||[]),{blockTag:Number(p.blockNumber)})};
 const displayImage=await readRegistrationCover({client:publicReadClient,chainId:1337,factoryAddress:factory.address,brickAddress:event.args.brick,ipId:id,collection,tokenId,originator:await signer.getAddress()});
 assert.equal(displayImage,image.imageURI);
 const thumbnail=await fetch('http://127.0.0.1:5173/api/road-ipfs/nft-cover/'+image.cid);
 assert.equal(thumbnail.status,200);assert.equal(thumbnail.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await thumbnail.arrayBuffer()),bytes);
 console.log('PUBLIC THUMBNAIL PASS: identity-checked NFT cover read and narrow PNG route through real Ganache, Vite and Kubo.');
 const brick=new ethers.Contract(event.args.brick,['function contentHash() view returns (bytes32)','function metadataDigest() view returns (bytes32)','function metadataURI() view returns (string)'],rpc);
 assert.equal(await brick.contentHash(),content);assert.equal(await brick.metadataDigest(),digest);assert.equal(await brick.metadataURI(),privateURI);
 // Exercise the exact new mint orchestration, not only an isolated cover setter.
 const {mintWithReviewedCover}=await import('../web/src/nft-cover-mint.js');
 const {makeRegistrationPacket}=await import('../web/src/mint-model.js');
 const {DEFAULT_CONTENT_POLICY}=await import('../web/src/content-policy.js');
 const hash=crypto.createHash('sha256').update(bytes).digest('hex');
 const packet=makeRegistrationPacket({metadata:{title:'Original cover workflow fixture',artist:'YBR test'},
  assets:{master:{name:'work.bin',hash:'ab'.repeat(32),size:4},artwork:{name:'cover.png',hash,size:bytes.length,type:'image/png'}},
  identity:{mode:'external',connected:true,address:await signer.getAddress()},royalties:{creatorBps:10000},training:'not-authorized',composition:false,storage:'demo-encrypted-in-browser',contentPolicy:DEFAULT_CONTENT_POLICY});
 let mintWrites=0;const countedProvider={request:args=>{if(args.method==='eth_sendTransaction')mintWrites++;return provider.request(args);}};
 const covered=await mintWithReviewedCover({packet,provider:countedProvider,rpcUrl:'http://127.0.0.1:8545',chainId:1337,factoryAddress:factory.address,
  nftCover:{bytes:new Uint8Array(bytes),sourceDigest:'0x'+hash,consent:true}},
  {upload:(data,options)=>uploadNftCover(data,{...options,fetchImpl:(url,request)=>fetch('http://127.0.0.1:5173'+url,request)})});
 assert.equal(covered.status,'confirmed');assert.equal(covered.nftCover.status,'verified');assert.equal(covered.receipts.length,2);assert.equal(mintWrites,1);assert.equal(covered.atomic,true);assert.equal(new Set(covered.receipts.map(r=>r.transactionHash)).size,1);assert.equal(covered.nftCover.transactionHash,covered.transactionHash);
 for(const entry of covered.receipts)assert.equal(decodeReceiptMetadata(await nft.tokenURI(entry.tokenId)).image,image.imageURI);
 console.log('MINT COVER WORKFLOW PASS: reviewed cover pinned, both real registration NFTs and initial images minted in ONE wallet transaction; no post-mint cover call.');
 console.log('NFT COVER PASS: exact public PNG pinned/retrieved through Vite and Kubo; real wallet-backed setCovers; tokenURI image verified; ERC-4906 emitted; private Brick commitments unchanged.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
