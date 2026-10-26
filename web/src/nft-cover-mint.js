/** Reviewed public images are registered in the same transaction as their NFTs. */
import {attachedCover} from './nft-cover-source.js';
import {validateNftCoverPng} from './nft-cover-format.js';
import {uploadNftCover} from './nft-cover-storage.js';
export function reviewedMintCover(packet, selection){
 if(selection?.consent!==true)return null;
 const source=attachedCover(packet);
 if(!source||selection.sourceDigest!==source.integrity?.digest)throw Error('The NFT image changed after review. Prepare and approve it again.');
 validateNftCoverPng(selection.bytes);
 return selection;
}
export async function preflightMintCover(options){
 if(!reviewedMintCover(options.packet,options.nftCover))return;
 const {connectChain,verifyFactory,requireBatchFactory}=await import('./chain-mint.js');
 const {client,check}=await connectChain({...options,account:options.packet.account.address});
 await verifyFactory(client,options.factoryAddress);
 await requireBatchFactory(client,options.factoryAddress);
 await check();
}
export async function mintWithReviewedCover(options,dependencies={}){
 const selection=reviewedMintCover(options.packet,options.nftCover);
 const mint=dependencies.mint||((...args)=>import('./chain-mint.js').then(module=>module.mintOnChain(...args)));
 const result=options.result||{simulated:false,status:'pending',receipts:[]};
 if(result.receipts.length||result.transactionHash||result.submissionAttempted)throw Error('Review the existing registration transaction before retrying. Do not remint to repair artwork.');
 if(!selection)return mint({...options,result});
 await (dependencies.preflight||preflightMintCover)(options);
 const onUpdate=options.onUpdate||(()=>{});
 onUpdate('Pinning the reviewed public NFT image before minting…');
 const image=await (dependencies.upload||uploadNftCover)(selection.bytes,{consent:true});
 result.nftCover={status:'pinned',imageURI:image.imageURI,upload:image,sourceDigest:selection.sourceDigest,atMint:true};
 // mintBatchOnChain verifies every tokenURI.image before returning confirmed.
 // No post-mint setCovers, second wallet prompt, or automatic retry.
 return mint({...options,result,initialImageURI:image.imageURI});
}
