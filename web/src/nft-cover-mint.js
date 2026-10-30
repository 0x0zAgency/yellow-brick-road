/** Reviewed public images are registered in the same transaction as their NFTs. */
import {attachedCover} from './nft-cover-source.js';
import {validateNftCoverPng} from './nft-cover-format.js';
import {uploadNftCover} from './nft-cover-storage.js';
import {verifyAlbumCover} from './album-covers.js';
import {readPublicNftCover} from './nft-cover-read.js';
export function reviewedMintCover(packet, selection){
 if(selection?.consent!==true)return null;
 if(selection.kind==='album'){
  const preview=packet?.bricks?.find(b=>b.localId==='master')?.metadata?.media?.find(f=>f.role==='preview');
  if(!preview||selection.sourceDigest!==preview.integrity?.digest||!/^([a-f0-9]{64})$/.test(selection.sha256||''))throw Error('The Audio Preview changed after album artwork review. Select the artwork again.');
  validateNftCoverPng(selection.bytes);return selection;
 }
 const source=attachedCover(packet);
 if(!source||selection.sourceDigest!==source.integrity?.digest)throw Error('The NFT image changed after review. Prepare and approve it again.');
 validateNftCoverPng(selection.bytes);
 return selection;
}
export async function preflightMintCover(options){
 if(options.packet.bricks.every(b=>b.reuse))return;
 const selection=reviewedMintCover(options.packet,options.nftCover);if(!selection)return;
 const {connectChain,verifyFactory,requireBatchFactory}=await import('./chain-mint.js');
 const {client,check}=await connectChain({...options,account:options.packet.account.address});
 await verifyFactory(client,options.factoryAddress);
 await requireBatchFactory(client,options.factoryAddress);
 if(selection.kind==='album')await verifyAlbumCover(selection.candidate,{...options,wallet:options.packet.account.address},{client});
 await check();
}
export async function mintWithReviewedCover(options,dependencies={}){
 const selection=options.packet.bricks.every(b=>b.reuse)?null:reviewedMintCover(options.packet,options.nftCover);
 const mint=dependencies.mint||((...args)=>import('./chain-mint.js').then(module=>module.mintOnChain(...args)));
 const result=options.result||{simulated:false,status:'pending',receipts:[]};
 if(result.receipts.length||result.transactionHash||result.submissionAttempted)throw Error('Review the existing registration transaction before retrying. Do not remint to repair artwork.');
 if(!selection)return mint({...options,result});
 await (dependencies.preflight||preflightMintCover)(options);
 const onUpdate=options.onUpdate||(()=>{});
 if(selection.kind==='album'){
  onUpdate('Verifying the selected album’s existing public NFT image…');
  await (dependencies.readPublicCover||readPublicNftCover)(selection.candidate.imageURI,{expectedSha256:selection.sha256});
  result.nftCover={status:'selected',imageURI:selection.candidate.imageURI,sourceDigest:selection.sourceDigest,reusedFrom:selection.candidate.brickAddress,atMint:true};
  return mint({...options,result,initialImageURI:selection.candidate.imageURI});
 }
 onUpdate('Pinning the reviewed public NFT image before minting…');
 const image=await (dependencies.upload||uploadNftCover)(selection.bytes,{consent:true});
 result.nftCover={status:'pinned',imageURI:image.imageURI,upload:image,sourceDigest:selection.sourceDigest,atMint:true};
 // mintBatchOnChain verifies every tokenURI.image before returning confirmed.
 // No post-mint setCovers, second wallet prompt, or automatic retry.
 return mint({...options,result,initialImageURI:image.imageURI});
}
