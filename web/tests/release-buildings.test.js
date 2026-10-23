import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeRegistrationPacket} from '../src/mint-model.js';
import {createBuilding,validateBuildingGraph,buildingFromPacket,saveBuildingRecord,loadBuildingIndex,rollupBuildings,exportBuildingGraph,BUILDING_STORAGE_KEY} from '../src/release-buildings.js';
const addr=n=>'0x'+n.toString(16).padStart(40,'0'),hash=n=>'0x'+n.toString(16).padStart(64,'0');
const digest=x=>'0x'+createHash('sha256').update(x).digest('hex');
const make=()=>makeRegistrationPacket({metadata:{title:'A private title',artist:'Creator',songwriters:'Creator',release:'Identical album tags are not membership'},
 assets:Object.fromEntries(['master','preview','artwork','lyrics','project','metadata'].map((role,i)=>[role,{name:'private-'+role,type:'application/octet-stream',size:10,hash:hash(i+1).slice(2)}])),
 identity:{mode:'external',address:addr(1)},royalties:{creatorBps:10000},training:'not-authorized',composition:true,storage:'local'});
function minted(packet,offset=0){return {simulated:false,status:'confirmed',chainId:1337,factoryAddress:addr(2),genesisHash:hash(100),receipts:packet.bricks.map((b,i)=>({sourceId:b.localId,role:b.role,status:'verified',chainId:1337,contractAddress:addr(10+i+offset),id:hash(20+i+offset),transactionHash:hash(30+i+offset),metadataJson:JSON.stringify(b.metadata),metadataDigest:digest(JSON.stringify(b.metadata))}))};}
const rowsOf=mint=>mint.receipts.map(r=>({address:r.contractAddress,ipId:r.id,transactionHash:r.transactionHash,metadataDigest:r.metadataDigest}));
const memory=()=>{const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};};
test('release Building commits explicit association on every part while keeping files with their owning Brick',()=>{
 const p=make();assert.equal(p.building.type,'music-release');assert.equal(p.building.standard,'0x0z-road-building');
 assert.equal(p.building.provenance['@type'],'prov:Collection');
 for(const b of p.bricks){assert.equal(b.metadata.extensions.building.id,p.building.id);assert.equal(b.metadata.extensions.building.part,b.localId);assert.deepEqual(b.metadata.extensions.building.members.map(m=>m.ref),p.bricks.map(b=>b.localId));}
 assert.deepEqual(p.bricks.find(b=>b.localId==='master').metadata.media.map(f=>f.role),['master','preview','project','metadata']);
 assert.deepEqual(p.bricks.find(b=>b.localId==='composition').metadata.media.map(f=>f.role),['lyrics']);
 assert.deepEqual(p.bricks.find(b=>b.localId==='artwork').metadata.media.map(f=>f.role),['artwork']);
 assert.ok(p.building.members.every(m=>m.permission==='not-granted-by-membership'));
});
test('albums and compilations reuse Building references with order, PROV membership and no implicit rights',()=>{
 const release=createBuilding({id:'urn:test:release',type:'music-release',name:'Release',members:[{kind:'brick',ref:'urn:test:recording',role:'recording'}]});
 const album=createBuilding({id:'urn:test:album',type:'album',name:'Album',members:[{kind:'building',ref:release.id,role:'track'}]});
 const compilation=createBuilding({id:'urn:test:compilation',type:'compilation',name:'Compilation',members:[{kind:'building',ref:release.id,role:'track'},{kind:'building',ref:album.id,role:'album'}]});
 assert.equal(validateBuildingGraph([release,album,compilation]).length,3);
 assert.deepEqual(compilation.members.map(m=>m.position),[0,1]);assert.equal(album.provenance['prov:hadMember'][0]['@type'],'prov:Collection');
 assert.throws(()=>createBuilding({...album,members:[...album.members,...album.members]}),/Duplicate/);
 assert.throws(()=>validateBuildingGraph([{...album,members:[{kind:'building',ref:compilation.id,role:'part'}]},compilation]),/Cyclic/);
 assert.throws(()=>createBuilding({...album,members:[{kind:'building',ref:album.id,role:'part'}]}),/Invalid/);
 assert.throws(()=>validateBuildingGraph([album,album]),/Duplicate/);
});
test('real receipt association roundtrip groups live identities and survives reopening without private labels or keys',async()=>{
 const p=make(),mint=minted(p),record=await buildingFromPacket(p,mint),storage=memory();
 saveBuildingRecord(storage,{...record,privateKey:'secret',title:'private-title',rawPacket:p});
 assert.deepEqual(loadBuildingIndex(storage),[record]);const saved=storage.getItem(BUILDING_STORAGE_KEY);
 for(const forbidden of ['private-title','private-','secret','A private title','recovery','plaintext'])assert.ok(!saved.includes(forbidden));
 const groups=rollupBuildings(rowsOf(mint),loadBuildingIndex(storage),mint);
 assert.equal(groups.length,1);assert.equal(groups[0].kind,'building');assert.equal(groups[0].parts.length,3);assert.equal(groups[0].missing,0);
 const graph=exportBuildingGraph(p,mint);assert.match(graph.id,/urn:ybr:building:/);assert.equal(graph.files.length,6);assert.equal(graph.members.length,3);assert.equal(graph.status,'context-proposal-not-deployed');
});
test('no heuristic grouping: same title, cover or album stays separate; different histories/factories stay separate',async()=>{
 const p=make(),mint=minted(p),record=await buildingFromPacket(p,mint),rows=rowsOf(mint).map(r=>({...r,title:'same',cover:'same'}));
 assert.equal(rollupBuildings(rows,[],mint).length,3);
 assert.equal(rollupBuildings(rows,[record],{...mint,genesisHash:hash(999)}).length,3);
 assert.equal(rollupBuildings(rows,[record],{...mint,factoryAddress:addr(999)}).length,3);
 assert.equal(rollupBuildings(rows,[record],null).length,3);
 const changed=rows.map((r,i)=>i===1?{...r,metadataDigest:hash(999)}:r),result=rollupBuildings(changed,[record],mint);
 assert.equal(result.length,2);assert.equal(result.find(g=>g.kind==='building').missing,1);assert.equal(result.find(g=>g.kind==='brick').row,changed[1]);
});
test('shared members remain references in separate parents rather than merging Buildings',async()=>{
 const p=make(),m1=minted(p),m2=minted(p,50);m2.receipts[1]=m1.receipts[1];
 const one=await buildingFromPacket(p,m1),two=await buildingFromPacket(p,m2);
 const unique=[...new Map([...rowsOf(m1),...rowsOf(m2)].map(r=>[r.address,r])).values()];
 const groups=rollupBuildings(unique,[one,two],m1);assert.equal(groups.length,2);assert.ok(groups.every(g=>g.parts.length===3));assert.notEqual(groups[0].id,groups[1].id);
});
test('packet imports reject fabricated metadata, missing/duplicate receipts, simulation and incomplete transactions',async()=>{
 const p=make(),mint=minted(p);
 await assert.rejects(buildingFromPacket(p,{...mint,simulated:true}),/confirmed/);
 await assert.rejects(buildingFromPacket(p,{...mint,status:'pending'}),/confirmed/);
 await assert.rejects(buildingFromPacket(p,{...mint,receipts:mint.receipts.slice(1)}),/Incomplete/);
 await assert.rejects(buildingFromPacket(p,{...mint,receipts:[mint.receipts[0],mint.receipts[0],mint.receipts[2]]}),/Invalid member receipt/);
 const altered=structuredClone(p);altered.bricks[0].metadata.title='forged';await assert.rejects(buildingFromPacket(altered,mint),/differ/);
 const receipt=structuredClone(mint);receipt.receipts[0].metadataJson+=' ';await assert.rejects(buildingFromPacket(p,receipt),/commitment/);
 const conflict=structuredClone(p);conflict.bricks[0].metadata.extensions.building.id='another';await assert.rejects(buildingFromPacket(conflict,minted(conflict)),/Conflicting/);
});
test('legacy explicit session packet relationships remain importable, but cannot imply a deployed Building',async()=>{
 const p=make();p.building={type:'recording-session',name:'Old session',members:p.bricks.map(b=>({ref:b.localId,role:b.role}))};
 for(const b of p.bricks)delete b.metadata.extensions.building;
 const mint=minted(p);assert.equal((await buildingFromPacket(p,mint)).type,'music-release');
 p.bricks[0].metadata.relationships=[];await assert.rejects(buildingFromPacket(p,minted(p)),/does not reference/);
});
test('malformed/full/unavailable local index fails safely and does not include unverified rows',async()=>{
 const storage=memory();storage.setItem(BUILDING_STORAGE_KEY,'{');assert.deepEqual(loadBuildingIndex(storage),[]);
 const p=make(),mint=minted(p),record=await buildingFromPacket(p,mint);
 assert.throws(()=>saveBuildingRecord(null,record),/unavailable/);
 const rows=rowsOf(mint).map(r=>({...r,transactionHash:hash(999)}));assert.equal(rollupBuildings(rows,[record],mint).length,3);
 const serialized=JSON.parse(JSON.stringify(record));serialized.members[0].files=['master','secret'];assert.throws(()=>saveBuildingRecord(storage,serialized),/Invalid/);
});
