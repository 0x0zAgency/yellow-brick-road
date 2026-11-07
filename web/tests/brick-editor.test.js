import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256,toHex} from 'viem';
import {brickDetails,applyBrickDetails,openBrickMetadata,prepareBrickMetadata,refreshEditedBuilding} from '../src/brick-editor.js';
import {encryptAsset} from '../src/road-encryption.js';
import {parseRecoveryFile,RECOVERY_V2} from '../src/ipfs-recovery.js';
import {makeRegistrationPacket} from '../src/mint-model.js';
import {buildingFromPacket,saveBuildingRecord,loadBuildingIndex,rollupBuildings} from '../src/release-buildings.js';
const address=n=>'0x'+n.toString(16).padStart(40,'0'),hash=n=>'0x'+n.toString(16).padStart(64,'0');
const metadata=()=>({standard:'0x0z-road-ip',schemaVersion:'1.0.0',objectType:'visual-artwork',title:'First title',description:'Old description',creators:[{name:'Artist',role:'visual-artist',wallet:address(1),shareBps:10000,custom:'keep'}],media:[{role:'master',cid:'bafy'+'a'.repeat(55),byteLength:4,integrity:{algorithm:'sha2-256',digest:hash(1)}}],rights:{aiTraining:{mode:'not-authorized'}},relationships:[{type:'cover-art',target:address(7)}],payout:{shares:[{party:'Artist',bps:10000}]},extensions:{c2pa:{manifest:'preserve'},building:{id:'original'}},provenance:{recordedAt:'2026-01-01T00:00:00Z',sourceApplication:'Illustrator'}});
test('descriptive edits preserve files, licensing, identities, shares, references and extensions',()=>{
 const original=metadata(),draft=brickDetails(original);draft.title='Corrected title';draft.description='New description';draft.creators[0].name='Corrected credit';draft.identifiers.isni='external-id';
 const result=applyBrickDetails(original,{...draft,media:[],rights:{aiTraining:{mode:'licensed-with-terms'}}});
 for(const key of ['media','rights','relationships','payout','extensions','provenance'])assert.deepEqual(result.metadata[key],original[key]);
 assert.equal(result.metadata.creators[0].wallet,address(1));assert.equal(result.metadata.creators[0].shareBps,10000);assert.equal(result.metadata.creators[0].custom,'keep');
 assert.equal(original.title,'First title');assert.equal(result.metadata.title,'Corrected title');assert.equal(result.changes.length,4);
 assert.deepEqual(applyBrickDetails(original,brickDetails(original)).metadata,original,'A no-op does not create empty optional fields');
 assert.equal(brickDetails(original).music,null,'Visual art does not acquire music controls');
 assert.throws(()=>applyBrickDetails(original,{...draft,title:' '}),/Title is required/);
 assert.throws(()=>applyBrickDetails(original,{...draft,creators:[]}),/identities must be preserved/);
 assert.throws(()=>applyBrickDetails(original,{...draft,description:'x'.repeat(8001)}),/too long/);
});
test('music details preserve technical metadata and accept blank/decimal BPM',()=>{
 const original={...metadata(),music:{release:'EP',bpm:123,codec:'wav',genre:'House'}};
 const draft=brickDetails(original);draft.music.bpm='128.5';draft.music.release='Album';
 assert.equal(applyBrickDetails(original,draft).metadata.music.bpm,128.5);assert.equal(applyBrickDetails(original,draft).metadata.music.codec,'wav');
 draft.music.bpm='Infinity';assert.throws(()=>applyBrickDetails(original,draft),/BPM/);
 draft.music.bpm='';assert.equal(applyBrickDetails(original,draft).metadata.music.bpm,null);
});
test('recovery verifies exact on-chain bytes; saves ciphertext only and exports a reusable key backup',async()=>{
 const original=metadata(),secret='test-only-editor-secret',bytes=new TextEncoder().encode(JSON.stringify(original));
 const encrypted=await encryptAsset(bytes,secret),cid='bafy'+'c'.repeat(55),store=new Map([[cid,encrypted.bytes]]),uploads=[];
 const fetchImpl=async(url,options={})=>{
  if(options.method==='POST'){
   const body=options.body;uploads.push(body);assert.ok(!new TextDecoder().decode(body).includes(secret));assert.ok(!new TextDecoder().decode(body).includes('Corrected title'));
   const digest=sha256(toHex(body)).slice(2),nextCid='bafy'+digest;store.set(nextCid,body);
   return Response.json({cid:nextCid,sha256:digest,size:body.length,pinned:true,verified:true});
  }
  return new Response(store.get(url.split('/').at(-1)),{headers:{'Content-Type':'application/octet-stream'}});
 };
 const kit=parseRecoveryFile(JSON.stringify({format:RECOVERY_V2,key:secret,assets:[],metadata:[]})),review={metadataURI:'ipfs://'+cid,metadataDigest:sha256(toHex(bytes)),metadataVersion:'1'};
 assert.deepEqual(await openBrickMetadata({review,kit,fetchImpl}),original);
 await assert.rejects(openBrickMetadata({review,kit:{...kit,key:'incorrect-editor-secret'},fetchImpl}),/key is incorrect/);
 await assert.rejects(openBrickMetadata({review:{...review,metadataDigest:hash(9)},kit,fetchImpl}),/on-chain commitment/);
 const draft=brickDetails(original);draft.title='Corrected title';
 const prepared=await prepareBrickMetadata({metadata:original,draft,review,kit,fetchImpl,now:'2026-11-07T00:00:00Z'});
 assert.equal(uploads.length,1);assert.equal(prepared.metadata.provenance.recordedAt,original.provenance.recordedAt);
 assert.deepEqual(prepared.metadata.provenance.revisions[0]['prov:wasRevisionOf'],{'@id':review.metadataURI});
 assert.deepEqual(prepared.metadata.provenance.revisions[0]['prov:generatedAtTime'],{'@value':'2026-11-07T00:00:00Z','@type':'http://www.w3.org/2001/XMLSchema#dateTime'});
 const newKit=parseRecoveryFile(JSON.stringify(prepared.backup));
 assert.deepEqual(await openBrickMetadata({review:{metadataURI:prepared.uri,metadataDigest:prepared.digest},kit:newKit,fetchImpl}),prepared.metadata);
 assert.deepEqual(await openBrickMetadata({review:{metadataURI:prepared.uri,metadataDigest:prepared.digest},kit,fetchImpl}),prepared.metadata,'The original recovery key remains usable');
 await assert.rejects(prepareBrickMetadata({metadata:original,draft:brickDetails(original),review,kit,fetchImpl}),/no changes/);
});
test('confirmed metadata updates keep shared Building references grouped and store no private work details',async()=>{
 const packet=makeRegistrationPacket({metadata:{title:'Private title',artist:'Artist'},assets:{master:{name:'master.wav',hash:'ab'.repeat(32),size:4}},identity:{mode:'external',address:address(1)},royalties:{creatorBps:10000},training:'not-authorized',composition:false});
 const mint={simulated:false,status:'confirmed',chainId:1337,factoryAddress:address(2),genesisHash:hash(3),receipts:[{sourceId:'master',status:'verified',chainId:1337,contractAddress:address(4),id:hash(5),transactionHash:hash(6),metadataJson:JSON.stringify(packet.bricks[0].metadata),metadataDigest:sha256(toHex(JSON.stringify(packet.bricks[0].metadata)))}]};
 const memory=new Map(),storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},record=await buildingFromPacket(packet,mint);saveBuildingRecord(storage,record);
 const review={...mint,brickAddress:address(4),ipId:hash(5),contentHash:hash(7),metadataDigest:mint.receipts[0].metadataDigest},current={...review,metadataDigest:hash(8)};
 assert.equal(refreshEditedBuilding(storage,review,current),1);
 const row={address:address(4),ipId:hash(5),transactionHash:hash(6),metadataDigest:hash(8)};
 assert.equal(rollupBuildings([row],loadBuildingIndex(storage),mint)[0].kind,'building');
 assert.ok(![...memory.values()].join('').includes('Private title'));
 assert.throws(()=>refreshEditedBuilding(storage,review,{...current,genesisHash:hash(9)}),/identity changed/);
});
