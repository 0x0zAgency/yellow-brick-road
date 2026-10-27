import test from 'node:test';
import assert from 'node:assert/strict';
import {FORM_FIELDS,baselineMetadata,initialUploadForm,uploadFormReducer,resolveUploadFields,normalizeFields} from '../src/upload-metadata.js';
const tagged=fields=>({fields,fieldSources:Object.fromEntries(Object.keys(fields).map(k=>[k,'embedded audio tags']))});
const resolve=state=>resolveUploadFields(state.manual,state.touched,state.uploads);
const start=(state,role,id,result)=>uploadFormReducer(state,{type:'start',role,id,result});
const finish=(state,role,id,result)=>uploadFormReducer(state,{type:'finish',role,id,result});
const edit=(state,field,value)=>uploadFormReducer(state,{type:'edit',field,value});
test('restored descriptive values are defaults, not locked manual edits',()=>{
 const cached=Object.fromEntries(FORM_FIELDS.map(k=>[k,'Saved '+k])),fresh=Object.fromEntries(FORM_FIELDS.map(k=>[k,'Uploaded '+k]));
 let state=initialUploadForm(cached);assert.deepEqual(state.touched,[]);assert.deepEqual(resolve(state).values,cached);
 state=start(state,'master',1,tagged(fresh));assert.deepEqual(resolve(state).values,fresh);
 assert.equal(resolve(state).sources.title.source,'embedded audio tags');assert.deepEqual(state.manual,cached,'Restored defaults are not mutated');
});
test('new tagged title beats both remembered and filename defaults; absent tags keep remembered fields',()=>{
 let state=initialUploadForm({title:'Old title',release:'Old album',artist:'Old artist',songwriters:'Old writer',daw:'Saved DAW'});
 state=start(state,'master',1,baselineMetadata({name:'new-recording.mp3',size:100}));assert.equal(resolve(state).values.title,'new-recording');
 state=finish(state,'master',1,tagged({title:'New track',release:'New album',songwriters:'New writer'}));
 assert.deepEqual(resolve(state).values,{title:'New track',release:'New album',artist:'Old artist',songwriters:'New writer',daw:'Saved DAW'});
});
test('manual corrections and intentional clearing in the current session survive late reads and replacements',()=>{
 let state=initialUploadForm({title:'Remembered',release:'Old album'});
 state=start(state,'master',1,tagged({title:'Uploaded',release:'Uploaded album'}));state=edit(state,'title','My correction');state=edit(state,'release','');
 state=finish(state,'master',1,tagged({title:'Later parsed title',release:'Later parsed album'}));
 state=start(state,'preview',2,tagged({title:'Preview title',release:'Preview album'}));
 assert.equal(resolve(state).values.title,'My correction');assert.equal(resolve(state).values.release,'');
 // Once loaded from storage in a new session those are defaults again.
 state=initialUploadForm(resolve(state).values);state=start(state,'master',3,tagged({title:'Next release',release:'Next album'}));
 assert.equal(resolve(state).values.title,'Next release');assert.equal(resolve(state).values.release,'Next album');
});
test('stale same-role reads cannot beat a new file; role priority and cover isolation stay unchanged',()=>{
 let state=initialUploadForm({title:'Remembered'});state=start(state,'master',1,tagged({title:'First'}));state=start(state,'master',2,tagged({title:'Second'}));state=finish(state,'master',1,tagged({title:'Stale'}));assert.equal(resolve(state).values.title,'Second');
 state=start(state,'artwork',3,tagged({title:'Artwork',release:'Cover album'}));assert.equal(resolve(state).values.title,'Second');assert.equal(resolve(state).values.release,undefined);
 state=start(state,'preview',4,tagged({title:'Preview'}));assert.equal(resolve(state).values.title,'Preview');
 state=start(state,'metadata',5,tagged({title:'Sidecar'}));assert.equal(resolve(state).values.title,'Sidecar');
 state=uploadFormReducer(state,{type:'reset',values:{title:'Reset default'}});assert.deepEqual(state.uploads,{});state=start(state,'master',6,tagged({title:'Fresh'}));assert.equal(resolve(state).values.title,'Fresh');
});
test('metadata reconciliation does not import signing, permission or royalty fields',()=>{
 const fields=normalizeFields({title:'Track',artist:'Performer',songwriters:'Writer',permissions:255,controller:'0xbad',share:0,training:'allow-all',mnemonic:'private'});
 assert.deepEqual(fields,{title:'Track',artist:'Performer',songwriters:'Writer'});
});
