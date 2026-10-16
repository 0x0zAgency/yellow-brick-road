import test from 'node:test';
import assert from 'node:assert/strict';
import {filterBricks,members,feeCap,split,makeDraft} from '../src/model.js';
import {seedBricks,seedBuildings} from '../src/data.js';
test('search and type filters combine',()=>{assert.equal(filterBricks(seedBricks,'daybreak','Music').length,1);assert.equal(filterBricks(seedBricks,'daybreak','Visual').length,0)});
test('references never replace source works',()=>{assert.equal(members(seedBuildings[0],seedBricks).length,3);assert.equal(members(seedBuildings[2],seedBricks).length,2)});
test('cap stops collection exactly',()=>{assert.equal(feeCap(100000,50,500),500);assert.equal(feeCap(100000,50,0),0)});
test('royalties distribute all units',()=>{assert.deepEqual(split(1000000,8000),[800000,200000]);assert.deepEqual(split(13,3333),[4,9])});
test('draft not deployed',()=>{const d=makeDraft({title:' Test ',creator:'Me',category:'Music',detail:''},'d1');assert.equal(d.ref,'Not deployed');assert.equal(d.draft,true)});
