/** Public NFT display is an explicitly reviewed step of a real mint, not Player publication.
 * Existing artworkVersion=1 collections work; no contract redeployment is introduced here.
 */
import {attachedCover} from './nft-cover-source.js';
import {validateNftCoverPng} from './nft-cover-format.js';
import {uploadNftCover} from './nft-cover-storage.js';

export function reviewedMintCover(packet, selection){
 if(selection?.consent!==true)return null;
 const source=attachedCover(packet);
 if(!source||selection.sourceDigest!==source.integrity?.digest)throw Error('The NFT cover changed after review. Prepare and approve it again.');
 validateNftCoverPng(selection.bytes);
 return selection;
}
export async function preflightMintCover(options){
 if(!reviewedMintCover(options.packet,options.nftCover))return;
 const {connectChain,verifyFactory}=await import('./chain-mint.js');
 const {coverAbi}=await import('./nft-cover-chain.js');
 const {client,check}=await connectChain({...options,account:options.packet.account.address});
 const collection=await verifyFactory(client,options.factoryAddress);
 let version;
 try{version=await client.readContract({address:collection,abi:coverAbi,functionName:'artworkVersion'});}catch{}
 if(version!==1n)throw Error('The selected factory still creates fixed yellow-square NFTs. Select an artwork-capable factory before publishing this cover. Existing old NFTs cannot be upgraded in place.');
 await check();
}
export async function mintWithReviewedCover(options,dependencies={}){
 const selection=reviewedMintCover(options.packet,options.nftCover);
 const mint=dependencies.mint||((...args)=>import('./chain-mint.js').then(module=>module.mintOnChain(...args)));
 if(!selection)return mint(options);
 // Fail before any public upload or registration on an incompatible collection.
 await (dependencies.preflight||preflightMintCover)(options);
 const result=options.result||{simulated:false,status:'pending',receipts:[]};
 if(result.receipts.length)throw Error('Review the existing registration transactions before retrying. Do not remint to repair artwork.');
 const onUpdate=options.onUpdate||(()=>{});
 onUpdate('Pinning the reviewed public NFT cover…');
 const image=await (dependencies.upload||uploadNftCover)(selection.bytes,{consent:true});
 result.nftCover={status:'pinned',imageURI:image.imageURI,upload:image,sourceDigest:selection.sourceDigest};
 const receipt=await mint({...options,result});
 // Preserve confirmed registrations even when the separate artwork signature is declined.
 receipt.nftCover=result.nftCover;
 try{
  const session=await (dependencies.session||((args)=>import('./nft-cover-chain.js').then(module=>module.nftCoverSession(args))))({mint:receipt,provider:options.provider,expectedAccount:options.packet.account.address});
  receipt.nftCover.status='awaiting-wallet';
  onUpdate('Bricks confirmed. Approve the NFT cover transaction in your wallet.');
  const applied=await session.update(image.imageURI,{onTransaction:hash=>{
   receipt.nftCover.transactionHash=hash;receipt.nftCover.status='pending';
   onUpdate('NFT cover submitted. Verifying the actual tokenURI image…');
  }});
  Object.assign(receipt.nftCover,applied,{status:'verified'});
  onUpdate('Mint and NFT cover verified on-chain.');
 }catch(error){
  receipt.nftCover.status=receipt.nftCover.transactionHash?'pending':'action-required';
  receipt.nftCover.error=error.shortMessage||error.message||'NFT cover could not be verified.';
  onUpdate('Bricks are minted. The NFT cover still needs attention; do not mint again.');
 }
 return receipt;
}
