import test from 'node:test';
import assert from 'node:assert/strict';
import {applyWorkTitles,cleanWorkTitle,displayWorkTitle} from '../src/work-titles.js';
const addr=n=>'0x'+n.toString(16).padStart(40,'0'),hash=n=>'0x'+n.toString(16).padStart(64,'0');
const wallet=addr(1),scope={chainId:1337,factoryAddress:addr(2),genesisHash:hash(3)};
const row={address:addr(4),ipId:hash(5),metadataDigest:hash(6),originator:wallet,controller:wallet};
const index=[{...scope,members:[{...row,title:'Night train'}]}];
const resolve=(r=row,s=scope,w=wallet,bindings=[])=>applyWorkTitles([r],index,bindings,s,w)[0];
test('work titles replace addresses only for matching wallet, chain history and current metadata',()=>{
 assert.equal(displayWorkTitle(resolve()),'Night train');
 for(const s of [null,{...scope,chainId:1},{...scope,genesisHash:hash(99)},{...scope,factoryAddress:addr(99)}])assert.equal(displayWorkTitle(resolve(row,s)),'Registered work');
 for(const r of [{...row,metadataDigest:hash(99)},{...row,ipId:hash(99)},{...row,address:addr(99)}])assert.equal(displayWorkTitle(resolve(r)),'Registered work');
 for(const w of [null,addr(99)])assert.equal(displayWorkTitle(resolve(row,scope,w)),'Registered work');
});
test('recovery titles work for legacy standalone Bricks and confirmed edits, without exposing recovery fields',()=>{
 const bindings=[{...scope,...row,brickAddress:row.address,wallet,title:'Renamed work',updatedAt:2},{...scope,...row,brickAddress:row.address,wallet,title:'Older label',updatedAt:1}];
 const resolved=resolve(row,scope,wallet,bindings);assert.equal(displayWorkTitle(resolved),'Renamed work');
 assert.equal(displayWorkTitle(applyWorkTitles([row],[],bindings,scope,wallet)[0]),'Renamed work');
 assert.equal(displayWorkTitle(resolve(row,scope,wallet,bindings.map(b=>({...b,wallet:addr(99)})))),'Night train');
 assert.equal(displayWorkTitle(resolve(row,scope,wallet,bindings.map(b=>({...b,metadataDigest:hash(99)})))),'Night train');
 assert.equal(resolved.workTitleSource,'local');assert.equal(resolved.bindings,undefined);
});
test('published titles stay visible, while generated contract titles have a plain fallback',()=>{
 const publicRow={source:'road',title:'Published work',registration:row};
 assert.equal(displayWorkTitle(applyWorkTitles([publicRow],[],[],null,null)[0]),'Published work');
 assert.equal(displayWorkTitle({source:'road-registry',title:'Registered Brick '+addr(4)}),'Registered work');
 assert.equal(displayWorkTitle({title:addr(4)}),'Registered work');
 assert.equal(cleanWorkTitle('  Lluvia 🟨\nOver Chicago  '),'Lluvia 🟨 Over Chicago');
 assert.equal(cleanWorkTitle({title:'Object'}),'');assert.equal(cleanWorkTitle('x'.repeat(2000)).length,1024);
});
