import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {ingestInteractionSnapshot} from '../src/interaction-metadata.js';
const addr=n=>'0x'+String(n).repeat(40),hash=n=>'0x'+String(n).repeat(64);
const context={chainId:1337,genesisHash:hash(1),factoryAddress:addr(2),brickAddress:addr(3),revision:'1'};
const metadata={title:'Private title',rights:{ownershipStatus:'declared'},media:[{role:'preview',integrity:{digest:hash(4)}}],extensions:{building:{id:'original'}}};
function snapshot(events=1){const payload={format:'ybr-interaction-snapshot/1',subject:{kind:'on-chain',...context,role:'audio',sha256:hash(4).slice(2)},through:'2026-10-23T00:00:00Z',first:'2026-10-23T00:00:00Z',events,counters:{playEvents:events,reportedStarts:events,pauseEvents:0,endedReports:0,seekEvents:0,skipEvents:0,displayReports:0},proofLevel:'unverified-client-report',source:'local-ybr-player',meaning:'observations only'};return {...payload,digest:'0x'+createHash('sha256').update(JSON.stringify(payload)).digest('hex')};}
test('ingestion builds a separate metadata draft, preserves rights and replaces cumulative snapshots',async()=>{
 const draft=await ingestInteractionSnapshot(metadata,snapshot(),context);assert.equal(metadata.extensions.playerInteractions,undefined);
 assert.deepEqual(draft.rights,metadata.rights);assert.deepEqual(draft.extensions.building,metadata.extensions.building);
 const second=await ingestInteractionSnapshot(draft,snapshot(2),context);assert.equal(second.extensions.playerInteractions.length,1);assert.equal(second.extensions.playerInteractions[0].events,2);
 assert.deepEqual(await ingestInteractionSnapshot(second,snapshot(2),context),second);
});
test('ingestion refuses wrong file/revision/history/Brick, modified snapshot and simulated observations',async()=>{
 for(const changed of [{genesisHash:hash(9)},{brickAddress:addr(9)},{revision:'2'},{factoryAddress:addr(9)}])await assert.rejects(ingestInteractionSnapshot(metadata,snapshot(),{...context,...changed}));
 await assert.rejects(ingestInteractionSnapshot({...metadata,media:[]},snapshot(),context),/file/);
 await assert.rejects(ingestInteractionSnapshot(metadata,{...snapshot(),events:99},context),/Invalid/);
 const snap=snapshot();snap.subject.kind='local-demo';await assert.rejects(ingestInteractionSnapshot(metadata,snap,context));
});
