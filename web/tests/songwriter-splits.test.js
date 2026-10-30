import test from 'node:test';
import assert from 'node:assert/strict';
import {songwriterNames,equalSongwriterShares,percentToBps,validateSongwriterSplits} from '../src/songwriter-splits.js';
import {makeRegistrationPacket,validateMintInput} from '../src/mint-model.js';
const addr=n=>'0x'+String(n).repeat(40);
const names=['Writer A','Writer B'];
const shares=names.map((name,i)=>({name,wallet:addr(i+1),bps:i===0?6000:4000})),value={confirmed:true,shares};
const input={metadata:{title:'Joint composition',artist:'Performer',ipCategory:'sound-recording',songwriters:names.join(', ')},assets:{master:{name:'song.wav',hash:'a'.repeat(64),size:10}},identity:{mode:'external',connected:true,address:addr(1)},royalties:{creatorBps:10000},composition:true,training:'not-authorized',storage:'local'};
test('writer credits deduplicate case/whitespace and equal splits allocate whole basis points',()=>{
 assert.deepEqual(songwriterNames(' Writer A; Writer B\nwriter a '),names);
 assert.deepEqual(equalSongwriterShares(['A','B','C']).map(r=>r.bps),[3334,3333,3333]);
 assert.equal(percentToBps('33.33'),3333);for(const invalid of ['33.333','1e2','',NaN])assert.ok(Number.isNaN(percentToBps(invalid)));
});
test('splits reject stale writer names, totals, invalid/duplicate wallets, missing consent and excessive recipients',()=>{
 assert.deepEqual(validateSongwriterSplits(value,names,{walletRequired:true}),[]);
 for(const next of [null,{...value,confirmed:false},{...value,shares:[{...shares[0],bps:7000},shares[1]]},{...value,shares:[shares[0],{...shares[1],wallet:shares[0].wallet}]},{...value,shares:[shares[0],{...shares[1],wallet:addr(0)}]},{...value,shares:[shares[0],{...shares[1],bps:0}]}])assert.ok(validateSongwriterSplits(next,names,{walletRequired:true}).length);
 assert.ok(validateSongwriterSplits(value,['Writer A','Changed']).length);
 assert.ok(validateSongwriterSplits(value,Array.from({length:17},(_,i)=>String(i))).length);
});
test('multiple writers require reviewed composition splits; one writer and referenced compositions do not',()=>{
 assert.match(validateMintInput(input).join(' '),/songwriter splits/);
 assert.deepEqual(validateMintInput({...input,songwriterSplits:value}),[]);
 assert.deepEqual(validateMintInput({...input,metadata:{...input.metadata,artist:'Writer A',songwriters:'Writer A'}}),[]);
 assert.deepEqual(validateMintInput({...input,composition:false}),[]);
});
test('composition records declared splits separately from master share and never claims payment activation',()=>{
 const packet=makeRegistrationPacket({...input,songwriterSplits:value});
 const payout=packet.bricks.find(b=>b.localId==='composition').metadata.payout;
 assert.deepEqual(payout.shares.map(r=>r.bps),[6000,4000]);assert.equal(payout.status,'controller-configuration-required');assert.equal(payout.shares[1].wallet,addr(2));
 assert.equal(packet.bricks.find(b=>b.localId==='master').metadata.payout.shares[0].bps,10000);
});
