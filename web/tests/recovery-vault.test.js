import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256,toHex} from 'viem';
import {makeRecoveryRecord,parseRecoveryImport,exportRecoveryCollection,RECOVERY_COLLECTION,listRecoveryFiles,saveRecoveryRecords,removeRecoveryFile} from '../src/recovery-vault.js';
import {rankRecoveryFiles,findLocalBrickRecovery} from '../src/local-brick-recovery.js';
import {encryptAsset} from '../src/road-encryption.js';
const wallet='0x'+'a'.repeat(40),other='0x'+'b'.repeat(40),hash=n=>'0x'+n.toString(16).padStart(64,'0');
const kit={format:'0x-road-ipfs-recovery-v2',key:'synthetic-recovery-key-only',assets:[],metadata:[]};
const binding={chainId:1337,factoryAddress:other,brickAddress:wallet,ipId:hash(1),genesisHash:hash(2),metadataDigest:hash(3),title:'Work'};
test('recovery collections round-trip original keys and scope records to a normalized wallet',()=>{
 const record=makeRecoveryRecord({wallet:wallet.toUpperCase().replace('0X','0x'),kit,name:'my-backup.json',bindings:[binding]});
 assert.equal(record.wallet,wallet);assert.equal(record.kit.key,kit.key);
 assert.equal(record.id,makeRecoveryRecord({wallet,kit,name:'renamed.json'}).id,'Same contents dedupe regardless of filename');
 assert.notEqual(record.id,makeRecoveryRecord({wallet:other,kit}).id);
 const restored=parseRecoveryImport(exportRecoveryCollection(wallet,[record]),wallet);
 assert.deepEqual(restored,[record]);assert.equal(parseRecoveryImport(JSON.stringify(kit),wallet,'original.json')[0].name,'original.json');
 assert.throws(()=>parseRecoveryImport(exportRecoveryCollection(wallet,[record]),other),/another wallet/);
 assert.throws(()=>exportRecoveryCollection(other,[record]),/belong to this wallet/);
 assert.notEqual(makeRecoveryRecord({wallet,kit:{...kit,key:'another-test-recovery-key'}}).id,record.id);
});
test('invalid collection items fail before any partial import or stored associations are trusted',()=>{
 const record=makeRecoveryRecord({wallet,kit});
 for(const files of [[record,{kit:{...kit,key:'bad'}}],new Array(513).fill(record),[]])assert.throws(()=>parseRecoveryImport(JSON.stringify({format:RECOVERY_COLLECTION,wallet,files}),wallet));
 assert.throws(()=>makeRecoveryRecord({wallet:'not-wallet',kit}),/Connect a wallet/);
 assert.throws(()=>makeRecoveryRecord({wallet,kit,bindings:[{...binding,chainId:-1}]}),/association/);
 assert.throws(()=>parseRecoveryImport('invalid '+kit.key,wallet),e=>!e.message.includes(kit.key));
});
test('candidate selection excludes other wallets and prioritizes full chain/factory/Brick identity',()=>{
 const wrong=makeRecoveryRecord({wallet,kit:{...kit,key:'wrong-key-for-testing'}}),right=makeRecoveryRecord({wallet,kit,bindings:[binding]});
 const records=[{...wrong,updatedAt:2},right,makeRecoveryRecord({wallet:other,kit}),{...right,updatedAt:1}];
 assert.deepEqual(rankRecoveryFiles(records,wallet,binding).map(r=>r.kit.key),[kit.key,wrong.kit.key]);
 assert.equal(rankRecoveryFiles(records,wallet,{...binding,genesisHash:hash(77)})[0].kit.key,wrong.kit.key,'A reset chain cannot reuse the old association priority');
});
test('automatic lookup tries local keys, fetches ciphertext once and requires the live commitment',async()=>{
 const metadata={standard:'0x0z-road-ip',schemaVersion:'1.0.0',title:'Recovered private artwork',objectType:'visual-artwork',creators:[],media:[],provenance:{}};
 const bytes=new TextEncoder().encode(JSON.stringify(metadata)),encrypted=await encryptAsset(bytes,kit.key),cid='bafy'+'c'.repeat(55),review={...binding,metadataURI:'ipfs://'+cid,metadataDigest:sha256(toHex(bytes))};
 const wrong=makeRecoveryRecord({wallet,kit:{...kit,key:'wrong-test-secret-key'},bindings:[review]}),correct=makeRecoveryRecord({wallet,kit});let requests=0;
 const fetchImpl=async(url,options)=>{requests++;assert.equal(url,'/api/road-ipfs/content/'+cid);assert.equal(options.method,'GET');assert.ok(!JSON.stringify(options).includes(kit.key));return new Response(encrypted.bytes,{headers:{'Content-Type':'application/octet-stream'}});};
 const match=await findLocalBrickRecovery({wallet,review,records:[wrong,correct],fetchImpl});assert.deepEqual(match.metadata,metadata);assert.equal(match.record.kit.key,kit.key);assert.equal(requests,1);
 assert.equal(await findLocalBrickRecovery({wallet,review:{...review,metadataDigest:hash(9)},records:[correct],fetchImpl}),null);
 assert.equal(await findLocalBrickRecovery({wallet:other,review,records:[correct],fetchImpl}),null);
 await assert.rejects(findLocalBrickRecovery({wallet,review,records:[correct],fetchImpl:async()=>new Response('',{status:404})}),/not pinned/);
 const controller=new AbortController();controller.abort();await assert.rejects(findLocalBrickRecovery({wallet,review,records:[correct],signal:controller.signal,fetchImpl}),{name:'AbortError'});
});
test('unavailable browser storage reports failure for reads, writes and removal',async()=>{
 const options={indexedDB:null};
 await assert.rejects(listRecoveryFiles(wallet,options),/storage is unavailable/);
 await assert.rejects(saveRecoveryRecords(wallet,[{wallet,kit}],options),/storage is unavailable/);
 await assert.rejects(removeRecoveryFile(wallet,'missing',options),/storage is unavailable/);
 await assert.rejects(saveRecoveryRecords(wallet,[{wallet:other,kit}],options),/wallet mismatch/);
});
