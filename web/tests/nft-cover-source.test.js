import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {attachedCover,readAttachedCover,isRasterCoverFile} from '../src/nft-cover-source.js';
import {encryptDemoBatch} from '../src/demo-vault.js';
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAIUlEQVR4nGP8f9kpxjeSgYGBgYGBMVphNgMMMDEgARQOAMDRBDMbPbpyAAAAAElFTkSuQmCC','base64');
const digest='0x'+createHash('sha256').update(bytes).digest('hex');
test('explicit covers take precedence; only raster visual primaries can become NFT images',()=>{
 const photo={role:'master',mediaType:'image/jpeg',name:'photo.jpg'},cover={role:'artwork',mediaType:'image/png',name:'cover.png'};
 const packet=media=>({bricks:[{metadata:{media}}]});
 assert.equal(attachedCover(packet([photo])),photo);assert.equal(attachedCover(packet([photo,cover])),cover);
 assert.equal(attachedCover(packet([{role:'master',mediaType:'audio/mpeg',name:'master.mp3'}])),null);
 assert.equal(attachedCover(packet([{role:'project',mediaType:'image/png',name:'private.png'}])),null);
 assert.equal(isRasterCoverFile({type:'image/svg+xml',name:'private.svg'}),false);
});
test('the selected visual source is decrypted locally and hash checked; the vault key never leaves this function',async()=>{
 for(const role of ['master','artwork']){
  const vault=await encryptDemoBatch({items:[{id:role,file:new File([bytes],'photo.png',{type:'image/png'}),originalSha256:digest.slice(2)}]});
  const file={role,mediaType:'image/png',name:'photo.png',byteLength:bytes.length,integrity:{digest}};
  const packet={bricks:[{metadata:{media:[file]}}]};
  assert.deepEqual(Buffer.from(await readAttachedCover({packet,vault})),bytes);
  file.integrity.digest='0x'+'0'.repeat(64);await assert.rejects(readAttachedCover({packet,vault}),/no longer matches/);
 }
});
