import test from 'node:test';
import assert from 'node:assert/strict';
import {mintWithReviewedCover,reviewedMintCover} from '../src/nft-cover-mint.js';
const bytes=new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAIUlEQVR4nGP8f9kpxjeSgYGBgYGBMVphNgMMMDEgARQOAMDRBDMbPbpyAAAAAElFTkSuQmCC','base64'));
const sourceDigest='0x'+'a'.repeat(64),imageURI='ipfs://bafy'+'a'.repeat(55);
function harness(){
 const calls=[],result={simulated:false,status:'pending',receipts:[]};
 const options={packet:{account:{address:'creator'},bricks:[{metadata:{media:[{role:'artwork',integrity:{digest:sourceDigest}}]}}]},nftCover:{bytes,sourceDigest,consent:true},result};
 const dependencies={preflight:async()=>calls.push('preflight'),upload:async(data,{consent})=>{assert.equal(consent,true);assert.deepEqual(data,bytes);calls.push('upload');return {imageURI};},
  mint:async({result,initialImageURI})=>{calls.push('mint');assert.equal(initialImageURI,options.nftCover.consent?imageURI:undefined);Object.assign(result,{status:'confirmed',atomic:true,transactionHash:'one-mint',receipts:[{status:'verified',tokenId:'17',transactionHash:'one-mint'}]});if(initialImageURI)Object.assign(result.nftCover,{status:'verified',transactionHash:'one-mint'});return result;},
  session:async()=>{throw Error('A second artwork transaction must never be requested.');}};
 return {options,dependencies,calls};
}
test('reviewed cover is part of the same mint request, with no post-mint artwork call',async()=>{
 const h=harness(),out=await mintWithReviewedCover(h.options,h.dependencies);
 assert.deepEqual(h.calls,['preflight','upload','mint']);assert.equal(out.status,'confirmed');assert.equal(out.nftCover.status,'verified');assert.equal(out.nftCover.transactionHash,out.receipts[0].transactionHash);assert.equal(out.nftCover.atMint,true);
});
test('no public consent means no upload and no initial image',async()=>{
 const h=harness();h.options.nftCover.consent=false;await mintWithReviewedCover(h.options,h.dependencies);assert.deepEqual(h.calls,['mint']);assert.equal(h.options.result.nftCover,undefined);
});
test('changed source and invalid public PNG fail before every operation',async()=>{
 for(const patch of [{sourceDigest:'changed'},{bytes:new Uint8Array([1,2,3])}]){const h=harness();Object.assign(h.options.nftCover,patch);await assert.rejects(mintWithReviewedCover(h.options,h.dependencies));assert.deepEqual(h.calls,[]);}
 assert.equal(reviewedMintCover({},null),null);
});
test('legacy batch support or pin failures cannot create fallback NFTs',async()=>{
 for(const step of ['preflight','upload']){const h=harness();h.dependencies[step]=async()=>{throw Error(step+' failed');};await assert.rejects(mintWithReviewedCover(h.options,h.dependencies));assert.ok(!h.calls.includes('mint'));}
});
test('a rejected mint retains the public pin but does not attempt artwork or another mint',async()=>{
 const h=harness();h.dependencies.mint=async()=>{h.calls.push('rejected-mint');throw Error('Rejected');};
 await assert.rejects(mintWithReviewedCover(h.options,h.dependencies),/Rejected/);assert.equal(h.options.result.nftCover.imageURI,imageURI);assert.equal(h.options.result.nftCover.status,'pinned');assert.deepEqual(h.calls,['preflight','upload','rejected-mint']);
});
test('an uncertain batch retains its hash and is never automatically resubmitted',async()=>{
 const h=harness();h.dependencies.mint=async({result})=>{result.transactionHash='pending';result.receipts=[{status:'pending',transactionHash:'pending'}];throw Error('Timed out');};
 await assert.rejects(mintWithReviewedCover(h.options,h.dependencies),/Timed out/);await assert.rejects(mintWithReviewedCover(h.options,h.dependencies),/Do not remint/);
 assert.equal(h.calls.filter(c=>c==='upload').length,1);assert.equal(h.options.result.transactionHash,'pending');
});
test('an uploaded primary photograph can supply the initial NFT image',async()=>{
 const h=harness();h.options.packet.bricks[0].metadata.media[0]={role:'master',mediaType:'image/jpeg',name:'photo.jpg',integrity:{digest:sourceDigest}};
 const out=await mintWithReviewedCover(h.options,h.dependencies);assert.equal(out.nftCover.status,'verified');assert.deepEqual(h.calls,['preflight','upload','mint']);
});
