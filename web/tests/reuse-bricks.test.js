import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256,stringToHex} from 'viem';
import {makeRegistrationPacket} from '../src/mint-model.js';
import {initialPolicyFor,DEFAULT_CONTENT_POLICY} from '../src/content-policy.js';
import {matchesReusableFiles,reuseMedia,newUploadRoles,applyBrickReuse,retainMatchingReuse} from '../src/reuse-bricks.js';
import {pinEncryptedBrickMetadata} from '../src/ipfs-upload.js';
import {buildingFromPacket,exportBuildingGraph} from '../src/release-buildings.js';
const address=n=>'0x'+String(n).repeat(40),hash=n=>'0x'+String(n).repeat(64);
const input={metadata:{title:'Track one',artist:'Creator',songwriters:'Creator'},identity:{mode:'external',address:address(1)},composition:true,royalties:{creatorBps:10000},training:'not-authorized',storage:'local',contentPolicy:DEFAULT_CONTENT_POLICY,
 assets:{master:{name:'one.wav',hash:hash(1).slice(2),size:4},preview:{name:'one.mp3',hash:hash(2).slice(2),size:5},artwork:{name:'cover.png',hash:hash(3).slice(2),size:6}}};
async function fixture(){
 const packet=makeRegistrationPacket(input),art=packet.bricks.find(b=>b.localId==='artwork');
 const contentPolicy={...await initialPolicyFor(art.metadata),revision:'1',permissionVersion:'1',controller:address(1)};
 const candidate={format:'ybr-reusable-brick/1',chainId:1337,factoryAddress:address(2),genesisHash:hash(4),address:address(3),ipId:hash(5),transactionHash:hash(6),metadataDigest:hash(7),contentHash:hash(3),controller:address(1),contentPolicy};
 return {packet,candidate};
}
test('exact original bytes and full role manifest match; filenames and album tags never establish reuse',async()=>{
 const {candidate}=await fixture();
 assert.equal(matchesReusableFiles(candidate,'artwork',reuseMedia(input.assets,'artwork')),true);
 assert.equal(matchesReusableFiles(candidate,'artwork',reuseMedia({...input.assets,artwork:{...input.assets.artwork,name:'renamed.jpg'}},'artwork')),true);
 for(const patch of [{hash:hash(9).slice(2)},{size:7}])assert.equal(matchesReusableFiles(candidate,'artwork',reuseMedia({...input.assets,artwork:{...input.assets.artwork,...patch}},'artwork')),false);
 assert.equal(matchesReusableFiles(candidate,'master',reuseMedia(input.assets,'master')),false);
 assert.equal(matchesReusableFiles(candidate,'artwork',[]),false);
});
test('same artwork is an explicit existing member; new recording commits its identity and skips reused uploads',async()=>{
 const {candidate}=await fixture();
 const packet=makeRegistrationPacket({...input,reusedBricks:{artwork:candidate}});
 assert.equal(packet.bricks.length,3);assert.equal(packet.bricks.filter(b=>!b.reuse).length,2);
 assert.deepEqual([...newUploadRoles(packet)],['master','preview']);
 const master=packet.bricks.find(b=>b.localId==='master');
 assert.equal(master.metadata.relationships.find(r=>r.type==='cover-art').targetBrick,candidate.address);
 assert.equal(master.metadata.extensions.building.members.find(m=>m.ref==='artwork').metadataDigest,candidate.metadataDigest);
 const art=packet.bricks.find(b=>b.localId==='artwork');assert.equal(art.reuse,candidate);
 assert.equal(art.metadata.rights.player.status,'existing-onchain-policy');
 assert.throws(()=>makeRegistrationPacket({...input,assets:{...input.assets,artwork:{...input.assets.artwork,hash:hash(8).slice(2)}},reusedBricks:{artwork:candidate}}),/same files/);
});
test('changing the composition option preserves the selected cover reference, but changed bytes invalidate it',async()=>{
 const {candidate}=await fixture(),selections={artwork:candidate,composition:candidate};
 assert.deepEqual(retainMatchingReuse(selections,input.assets,{composition:false}),{artwork:candidate});
 assert.deepEqual(retainMatchingReuse({artwork:candidate},input.assets,{composition:true}),{artwork:candidate});
 assert.deepEqual(retainMatchingReuse(selections,{...input.assets,artwork:{...input.assets.artwork,hash:hash(9).slice(2)}},{composition:false}),{});
 assert.deepEqual(Object.keys(selections),['artwork','composition']);
});
test('an existing Brick retains its policy and is never repinned as new encrypted metadata',async()=>{
 const {packet,candidate}=await fixture();candidate.contentPolicy.permissions=0;candidate.contentPolicy.locked=true;
 const bricks=applyBrickReuse(packet.bricks,{artwork:candidate}),art=bricks.find(b=>b.reuse);
 assert.equal(art.metadata.rights.player.permissions.artwork,false);assert.equal(art.metadata.extensions.contentPolicy.locked,true);
 const result=await pinEncryptedBrickMetadata({packet:{bricks:[art],storage:{},notices:[]},secret:new Uint8Array(32),fetchImpl:()=>assert.fail('Do not pin an existing Brick')});
 assert.equal(result.bricks[0],art);assert.deepEqual(result.storage.metadataCids,[]);
});
test('Building packet resolves reused receipt identities without pretending their display labels were committed again',async()=>{
 const {candidate}=await fixture();const packet=makeRegistrationPacket({...input,reusedBricks:{artwork:candidate}});
 const mint={simulated:false,status:'confirmed',chainId:1337,factoryAddress:address(2),genesisHash:hash(4),receipts:packet.bricks.map((b,i)=>b.reuse?{sourceId:b.localId,reused:true,status:'verified',chainId:1337,contractAddress:candidate.address,id:candidate.ipId,transactionHash:candidate.transactionHash,metadataDigest:candidate.metadataDigest}:{sourceId:b.localId,status:'verified',chainId:1337,contractAddress:address(i+5),id:hash(i+1),transactionHash:hash(9),metadataJson:JSON.stringify(b.metadata),metadataDigest:sha256(stringToHex(JSON.stringify(b.metadata)))})};
 const record=await buildingFromPacket(packet,mint);assert.equal(record.members.find(m=>m.part==='artwork').address,candidate.address);
 const graph=exportBuildingGraph(packet,mint);assert.ok(graph.members.some(m=>m.role==='artwork'&&m.ref.endsWith(candidate.address)));
 const wrong=structuredClone(mint);wrong.receipts.find(r=>r.reused).contractAddress=address(9);await assert.rejects(buildingFromPacket(packet,wrong),/reference does not match/);
 const forged=structuredClone(packet);forged.bricks.find(b=>b.reuse).reuse.address=address(9);
 await assert.rejects(buildingFromPacket(forged,wrong),/committed Building reference/);
});
