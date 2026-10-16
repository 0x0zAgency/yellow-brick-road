import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {encryptDemoBatch,openDemoDownload} from '../src/demo-vault.js';
import {simulateMintReceipts} from '../src/demo-mint.js';
import {makeRegistrationPacket} from '../src/mint-model.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const file={name:'project.custom',type:'',async arrayBuffer(){return new TextEncoder().encode('private project data').buffer}};
test('batch encrypts each file, then decrypts only after demo authorization',async()=>{
 const batch=await encryptDemoBatch({items:[{id:'master',file},{id:'project',file}]});
 assert.equal(batch.encrypted.size,2);
 assert.notEqual(batch.encrypted.get('master').ciphertextSha256,batch.encrypted.get('project').ciphertextSha256);
 assert.ok(batch.updates.master.demoUpload.receiptId.startsWith('DEMO-'));
 await assert.rejects(openDemoDownload({entry:batch.encrypted.get('master'),secret:batch.secret}));
 const original=await openDemoDownload({entry:batch.encrypted.get('master'),secret:batch.secret,authorized:true});
 assert.equal(new TextDecoder().decode(original.bytes),'private project data');
 assert.equal(original.name,'project.custom');
});
test('mint receipts have no on-chain claims',()=>{
 const result=simulateMintReceipts({packetType:'LOCAL_PREVIEW_NOT_MINTED',bricks:[{localId:'master',role:'Recording',metadata:{title:'Song'}},{localId:'composition',role:'Songwriting',metadata:{title:'Song'}}]});
 assert.equal(result.simulated,true);assert.equal(result.receipts.length,2);
 assert.ok(result.receipts.every(r=>r.transactionHash===null&&r.contractAddress===null));
});
test('writing has separate authorship and separate ingestion and usage proposals',()=>{
 const p=makeRegistrationPacket({metadata:{artist:'Performer',title:'Song',songwriters:'Writer A, Writer B'},assets:{master:{name:'track.any',hash:'a'.repeat(64),size:4}},identity:{mode:'assisted',connected:false,address:''},royalties:{creatorBps:10000},training:'separate-license',composition:true,storage:'demo-encrypted-in-browser',licensing:{currency:'USDC',useUnit:'per-1000-outputs',masterIngestionCents:10000,masterUseCents:500,writingIngestionCents:5000,writingUseCents:250}});
 const writing=p.bricks.find(x=>x.localId==='composition');
 assert.ok(writing);assert.deepEqual(writing.metadata.creators.map(x=>x.name),['Writer A','Writer B']);
 assert.equal(p.bricks[0].metadata.proposedAiLicense.ingestion.amountCents,10000);
 assert.equal(writing.metadata.proposedAiLicense.ingestion.amountCents,5000);
 assert.equal(writing.metadata.proposedAiLicense.use.amountCents,250);
});
