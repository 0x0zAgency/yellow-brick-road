/** Prepare and pin a consented public image BEFORE the single atomic registration call. */
import {attachedCover} from './nft-cover-source.js';
import {validateNftCoverPng} from './nft-cover-format.js';
import {uploadNftCover} from './nft-cover-storage.js';

export function reviewedMintCover(packet, selection){
 const source=attachedCover(packet);
 if(!source){
  if(selection?.consent===true)throw Error('The NFT image source is no longer attached. Review it again.');
  return null;
 }
 if(selection?.sourceDigest!==source.integrity?.digest)throw Error('Review your uploaded image for NFT display before minting, or explicitly choose default artwork.');
 if(selection?.skip===true&&selection.consent!==true)return null;
 if(selection?.consent!==true)throw Error('Approve the public NFT thumbnail before minting, or explicitly choose default artwork.');
 validateNftCoverPng(selection.bytes);
 return selection;
}
export async function preflightMintCover(options){
 reviewedMintCover(options.packet,options.nftCover);
 const {preflightPolicyMint}=await import('./chain-mint.js');
 await preflightPolicyMint(options);
}
export async function mintWithReviewedCover(options,dependencies={}){
 const result=options.result||{simulated:false,status:'pending',receipts:[]};
 if(result.receipts.length||result.batch?.transactionHash)throw Error('Review the existing batch transaction. Do not remint to repair artwork.');
 const selection=reviewedMintCover(options.packet,options.nftCover);
 await (dependencies.preflight||preflightMintCover)(options);
 const mint=dependencies.mint||((...args)=>import('./chain-mint.js').then(module=>module.mintOnChain(...args)));
 let imageURI='';
 if(selection){
  options.onUpdate?.('Pinning the reviewed public NFT image before minting…');
  const image=await (dependencies.upload||uploadNftCover)(selection.bytes,{consent:true});
  imageURI=image.imageURI;
  result.nftCover={status:'pinned',imageURI,upload:image,sourceDigest:selection.sourceDigest,includedInMint:true};
 }
 // No setCovers/session.update call here. Initial display is part of the signed batch.
 // A submitted hash remains in result on timeout; a rejected mint may leave a public pin.
 return mint({...options,result,imageURI});
}
