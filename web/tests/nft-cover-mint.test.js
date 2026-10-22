import test from 'node:test';
import assert from 'node:assert/strict';
import {mintWithReviewedCover,reviewedMintCover} from '../src/nft-cover-mint.js';
const bytes=new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAIUlEQVR4nGP8f9kpxjeSgYGBgYGBMVphNgMMMDEgARQOAMDRBDMbPbpyAAAAAElFTkSuQmCC','base64'));
const sourceDigest='0x'+'a'.repeat(64),imageURI='ipfs://bafy'+'a'.repeat(55);
function harness(){
 const calls=[],result={simulated:false,status:'pending',receipts:[]};
 const options={packet:{account:{address:'creator'},bricks:[{metadata:{media:[{role:'artwork',integrity:{digest:sourceDigest}}]}}]},nftCover:{bytes,sourceDigest,consent:true},result};
 const dependencies={preflight:async()=>calls.push('preflight'),upload:async(data,{consent})=>{assert.equal(consent,true);assert.deepEqual(data,bytes);calls.push('upload');return {imageURI};},
  mint:async({result})=>{calls.push('mint');Object.assign(result,{status:'confirmed',receipts:[{status:'verified',tokenId:'17'}]});return result;},
  session:async()=>({update:async(uri,{onTransaction})=>{assert.equal(uri,imageURI);calls.push('cover');onTransaction('transaction');return {imageURI,transactionHash:'transaction',metadata:[{image:imageURI}]};}})};
 return {options,dependencies,calls};
}
test('reviewed cover is applied and verified as part of a single mint workflow',async()=>{
 const h=harness(),out=await mintWithReviewedCover(h.options,h.dependencies);
 assert.deepEqual(h.calls,['preflight','upload','mint','cover']);assert.equal(out.status,'confirmed');assert.equal(out.nftCover.status,'verified');assert.equal(out.receipts.length,1);
});
test('no public consent means no upload or artwork transaction',async()=>{
 const h=harness();h.options.nftCover.consent=false;
 await mintWithReviewedCover(h.options,h.dependencies);assert.deepEqual(h.calls,['mint']);assert.equal(h.options.result.nftCover,undefined);
});
test('changed source and invalid public PNG fail before every operation',async()=>{
 for(const patch of [{sourceDigest:'changed'},{bytes:new Uint8Array([1,2,3])}]){
  const h=harness();Object.assign(h.options.nftCover,patch);await assert.rejects(mintWithReviewedCover(h.options,h.dependencies));assert.deepEqual(h.calls,[]);
 }
 assert.equal(reviewedMintCover({},null),null);
});
test('legacy collection and upload failures cannot leave newly minted fallback NFTs',async()=>{
 for(const step of ['preflight','upload']){
  const h=harness();h.dependencies[step]=async()=>{throw Error(step+' failed');};
  await assert.rejects(mintWithReviewedCover(h.options,h.dependencies));assert.ok(!h.calls.includes('mint'));
 }
});
test('declined artwork signature retains successful mints and public pin for repair, not remint',async()=>{
 const h=harness();h.dependencies.session=async()=>({update:async()=>{throw Error('Rejected');}});
 const out=await mintWithReviewedCover(h.options,h.dependencies);
 assert.equal(out.status,'confirmed');assert.equal(out.nftCover.status,'action-required');assert.equal(out.nftCover.imageURI,imageURI);assert.equal(out.receipts.length,1);
 await assert.rejects(mintWithReviewedCover(h.options,h.dependencies),/Do not remint/);
 assert.equal(h.calls.filter(x=>x==='mint').length,1);
});
test('uncertain cover confirmation keeps the submitted hash and never labels it verified',async()=>{
 const h=harness();h.dependencies.session=async()=>({update:async(_uri,{onTransaction})=>{onTransaction('pending-hash');throw Error('Timed out');}});
 const out=await mintWithReviewedCover(h.options,h.dependencies);assert.equal(out.status,'confirmed');assert.equal(out.nftCover.status,'pending');assert.equal(out.nftCover.transactionHash,'pending-hash');
});
test('a mint rejection still reports the already-public cover without a second mint',async()=>{
 const h=harness();h.dependencies.mint=async()=>{throw Error('mint rejected');};
 await assert.rejects(mintWithReviewedCover(h.options,h.dependencies));assert.equal(h.options.result.nftCover.imageURI,imageURI);assert.ok(!h.calls.includes('cover'));
});
