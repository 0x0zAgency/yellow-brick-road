import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadSectionBefore} from '../src/mint-file-sections.js';
import {availableAssetSlots} from '../src/mint-model.js';
import {getIpCategory} from '../src/ip-catalog.js';

test('audio master step clearly separates recording, cover art, lyrics, and supporting files',()=>{
 const category=getIpCategory('sound-recording');
 const slots=availableAssetSlots('sound-recording');
 assert.deepEqual(slots.map(s=>s.id),['master','preview','artwork','lyrics','project','metadata']);
 const headings=slots.map(s=>uploadSectionBefore(s.id,category)?.title).filter(Boolean);
 assert.deepEqual(headings,['Primary work','Cover artwork','Lyrics & songwriting','Project files & metadata']);
 assert.equal(uploadSectionBefore('preview',category),null,'Preview stays grouped with master');
 assert.equal(uploadSectionBefore('metadata',category),null,'Metadata stays grouped with project');
 assert.equal(slots.find(s=>s.id==='lyrics').required,false);
 assert.equal(slots.find(s=>s.id==='artwork').required,false);
});

test('non-music uploads show only applicable headings, not cover or lyrics',()=>{
 const category=getIpCategory('photograph');
 const slots=availableAssetSlots('photograph');
 assert.deepEqual(slots.map(s=>s.id),['master','project','metadata']);
 assert.deepEqual(slots.map(s=>uploadSectionBefore(s.id,category)?.title).filter(Boolean),['Primary work','Project files & metadata']);
 assert.equal(uploadSectionBefore('artwork',category),null);
 assert.equal(uploadSectionBefore('lyrics',category),null);
});

test('songwriting upload retains an optional lyrics heading and its distinct evidence slot',()=>{
 for(const type of ['song-lyrics','musical-work']){
  const category=getIpCategory(type);
  const slots=availableAssetSlots(type);
  assert.ok(slots.some(s=>s.id==='lyrics'));
  assert.equal(uploadSectionBefore('lyrics',category).title,'Lyrics & songwriting');
  assert.match(uploadSectionBefore('lyrics',category).description,/separate composition Brick/i);
 }
});
