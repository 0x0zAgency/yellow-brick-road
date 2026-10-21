'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {isPlayable,playableNewest,selectionFor}=require('../public/library-model');
const track=(id,publishedAt,extra={})=>({id,publishedAt,streamAllowed:true,media:{mimeType:'audio/wav'},...extra});
const canPlayType=mime=>mime==='audio/wav'?'probably':'';

test('list hides registry-only, denied, missing-audio and unsupported tracks',()=>{
 const valid=track('valid');
 const input=[null,{},track('denied',null,{streamAllowed:false}),track('registered',null,{source:'road-registry'}),
  track('no-media',null,{media:null}),track('image',null,{media:{mimeType:'image/png'}}),
  track('unknown-format',null,{media:{mimeType:'audio/x-unsupported'}}),valid];
 assert.deepEqual(playableNewest(input,{canPlayType}),[valid]);
 assert.equal(isPlayable({...valid,streamAllowed:'true'},canPlayType),false);
 assert.equal(isPlayable(valid,()=>{throw Error('not supported');}),false);
});
test('actual publication dates sort newest first across sources, not input order or file hashes',()=>{
 const older=track('zz-studio','2026-01-01T00:00:00.000Z',{source:'studio-demo'});
 const newest=track('aa-studio','2026-03-01T00:00:00.000Z',{source:'studio-demo'});
 const road=track('road','2026-02-01T00:00:00.000Z',{source:'road'});
 const undated=track('built-in');const invalidDate=track('invalid-date','not-a-date');
 const input=[undated,older,road,invalidDate,newest],snapshot=[...input];
 assert.deepEqual(playableNewest(input,{canPlayType}).map(b=>b.id),['aa-studio','road','zz-studio','built-in','invalid-date']);
 assert.deepEqual(input,snapshot,'Sort never mutates the API response');
});
test('ties and missing dates are deterministic; same-block Road uses log order',()=>{
 const tie='2026-03-01T00:00:00.000Z';
 const first=track('a',tie,{source:'road',road:{factoryAddress:'same',blockNumber:4,logIndex:0}});
 const second=track('b',tie,{source:'road',road:{factoryAddress:'same',blockNumber:4,logIndex:1}});
 assert.deepEqual(playableNewest([first,second],{canPlayType}).map(b=>b.id),['b','a']);
 assert.deepEqual(playableNewest([track('z'),track('a')],{canPlayType}).map(b=>b.id),['a','z']);
});
test('newest is default, but playing, paused, or explicitly chosen tracks remain selected',()=>{
 const newest=track('newest'),older=track('older'),items=[newest,older];
 assert.equal(selectionFor(items,null,false),newest);
 assert.equal(selectionFor(items,'older',false),newest);
 assert.equal(selectionFor(items,'older',true),older);
 assert.equal(selectionFor(items,'removed',true),newest);
 assert.equal(selectionFor([], 'removed',true),null);
});
test('unavailable entries and duplicates are excluded from next/previous navigation',()=>{
 const input=[track('first'),track('broken'),track('first'),track('third')];
 assert.deepEqual(playableNewest(input,{canPlayType,unavailable:new Set(['broken'])}).map(b=>b.id),['first','third']);
 assert.deepEqual(playableNewest(null),[]);
});
