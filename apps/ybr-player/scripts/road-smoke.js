'use strict';
/** Real Ganache integration smoke test. Run after deploying factory and opt-in music. */
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const {makeGateway,readFactoryAddress}=require('../road-music');
const {createApp}=require('../server');
const path=require('node:path');
const fs=require('node:fs');
const crypto=require('node:crypto');

async function main(){
 const repoRoot=path.resolve(__dirname,'../../..');
 const factoryAddress=readFactoryAddress(repoRoot);
 assert.ok(factoryAddress,'Factory missing; run ganache:deploy');
 const gateway=makeGateway({repoRoot});
 const status=await gateway.ready();
 assert.equal(status.ready,true,JSON.stringify(status));
 const {tracks}=await gateway.list();
 assert.equal(tracks.length,1,'Opt-in public recording must be in catalog. Legacy/private Bricks must not appear.');
 const track=tracks[0];
 assert.equal(track.source,'road');
 assert.equal(track.road.factoryAddress.toLowerCase(),factoryAddress.toLowerCase());
 assert.equal(track.rights.license.includes('free preview'),true);
 const {server}=createApp({accounts:{listener:'ignored'},roadGateway:gateway});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const base=`http://127.0.0.1:${server.address().port}`;
  let response=await fetch(base+'/road/api/music',{headers:{Origin:'http://artist-made-app.local'}});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('access-control-allow-origin'),'*');
  let json=await response.json();
  assert.equal(json.tracks.length,1);
  assert.equal(json.tracks[0].id,track.id);
  assert.equal(json.tracks[0].mediaPath,undefined,'Private filesystem path never leaves server');
  response=await fetch(base+'/road/metadata/'+track.id);
  assert.equal(response.status,200);
  const metadataBytes=Buffer.from(await response.arrayBuffer());
  assert.equal('0x'+crypto.createHash('sha256').update(metadataBytes).digest('hex'),track.road.metadataDigest);
  response=await fetch(base+'/road/media/'+track.id,{headers:{Range:'bytes=0-127',Origin:'http://another-player.local'}});
  assert.equal(response.status,206);
  assert.equal(response.headers.get('access-control-allow-origin'),'*');
  assert.equal((await response.arrayBuffer()).byteLength,128);
  response=await fetch(base+'/road/media/'+track.id);
  assert.equal(response.status,200);
  const streamBytes=Buffer.from(await response.arrayBuffer());
  assert.equal('0x'+crypto.createHash('sha256').update(streamBytes).digest('hex'),track.road.contentHash);
  const sourceDir=path.resolve(__dirname,'../data/road-public');
  const file=path.join(sourceDir,track.id+'.json');
  const original=fs.readFileSync(file);
  fs.writeFileSync(file,Buffer.concat([original,Buffer.from(' ')]));
  try{
   response=await fetch(base+'/road/media/'+track.id);
   assert.equal(response.status,404,'Metadata tampering must immediately revoke eligibility');
  }finally{fs.writeFileSync(file,original);}
  const provider=new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545');
  const onchain=new ethers.Contract(track.road.brickAddress,['function updateMetadata(string uri)'],provider.getSigner(0));
  const receipt=await (await onchain.updateMetadata('road-demo://revoked')).wait(1);
  assert.equal(receipt.status,1);
  response=await fetch(base+'/road/media/'+track.id);
  assert.equal(response.status,404,'On-chain revocation must deny future media requests');
  response=await fetch(base+'/road/api/music');
  json=await response.json();
  assert.equal(json.tracks.length,0,'Revoked Brick must disappear from catalog');
  console.log('YBR Road Music integration smoke: passed publication, cross-player public retrieval, byte ranges, integrity checks, and on-chain revocation.');
 }finally{
  await new Promise(resolve=>server.close(resolve));
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
