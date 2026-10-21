'use strict';
/** Run only against the disposable integrated CI stack. Never deletes data. */
const assert=require('node:assert/strict');
const {ethers}=require('ethers');
const {readPlayerAccess}=require('./dev-player-access.cjs');
const root=require('node:path').resolve(__dirname,'..');
const PLAYER='http://127.0.0.1:4173',WEB='http://127.0.0.1:5173';
async function json(url,options={}){
 const res=await fetch(url,{signal:AbortSignal.timeout(30000),...options});
 assert.equal(res.status,200,url+' must succeed');return res.json();
}
async function main(){
 const status=await json(PLAYER+'/road/api/status');assert.equal(status.chainId,1337);
 const provider=new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545');
 const factory=new ethers.Contract(status.factoryAddress,[
  'function deployBrickWithMetadataDigest(bytes32,string,bytes32,bytes32) returns (address)',
  'event BrickDeployed(bytes32 indexed ipId,address indexed brick,address indexed originator,bytes32 contentHash)'
 ],provider.getSigner(0));
 const before=await json(WEB+'/road/api/registry');
 const nonce=ethers.utils.hexlify(ethers.utils.randomBytes(32));
 const tx=await factory.deployBrickWithMetadataDigest(ethers.utils.sha256(ethers.utils.toUtf8Bytes('registry smoke original')),
  'ipfs://bafy-registry-smoke-ciphertext-not-a-playback-file',ethers.utils.sha256(ethers.utils.toUtf8Bytes('private metadata')),nonce);
 const receipt=await tx.wait();const event=receipt.events.find(e=>e.event==='BrickDeployed');assert.ok(event);
 const id=event.args.ipId.toLowerCase();
 // Query the actual proxy, not just the backend helper, after a new real mint.
 const index=await json(WEB+'/road/api/registry');const found=index.bricks.find(b=>b.id===id);
 assert.ok(found,'New Mint Studio-style private registration must appear in the live IP Registry');
 assert.equal(found.streamAllowed,false);assert.equal(found.registration.brickAddress,event.args.brick);
 assert.equal(index.matchingEvents,before.matchingEvents+1);
 const saved=readPlayerAccess(root);assert.ok(saved);
 const session=await fetch(PLAYER+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'listener',password:saved.listener})});
 assert.equal(session.status,200);const headers={Cookie:session.headers.get('set-cookie').split(';')[0]};
 try{
  const library=await json(PLAYER+'/api/bricks',{headers});
  assert.equal(library.bricks.filter(b=>b.id===id).length,1,'Player discovers the same registration once');
  assert.equal(library.bricks.find(b=>b.id===id).streamAllowed,false);
  const again=await json(WEB+'/road/api/registry');assert.equal(again.bricks.filter(b=>b.id===id).length,1);
  const publicMusic=await json(PLAYER+'/road/api/music');assert.equal(publicMusic.tracks.some(b=>b.id===id),false);
  for(const [suffix,method] of [['authorize','POST'],['media','GET']]){
   assert.equal((await fetch(PLAYER+'/api/bricks/'+id+'/'+suffix,{method,headers})).status,403);
  }
  assert.equal((await fetch(PLAYER+'/road/media/'+id)).status,404);
 }finally{await fetch(PLAYER+'/api/logout',{method:'POST',headers});}
 console.log('REGISTRY PASS: new real mint visible through Vite registry + Player, no duplicate, private media still blocked.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
