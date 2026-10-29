import test from 'node:test';
import assert from 'node:assert/strict';
import {CREATOR_DEFAULTS_KEY,defaultCreatorDefaults,loadCreatorDefaults,saveCreatorDefaults,applyCreatorDefaults,initialContentPolicy,defaultDeliveryApproved} from '../src/creator-defaults.js';
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};};
test('pre-check defaults are opt-in and do not change existing settings until saved',()=>{
 const defaults=loadCreatorDefaults(storage());assert.equal(defaults.enabled,false);assert.equal(defaults.delivery,true);assert.equal(defaults.contentPolicy.locked,true);
 assert.equal(initialContentPolicy(defaults).locked,false);
 const form={meta:{title:'My work'},fees:{masterIngestionCents:7}};assert.equal(applyCreatorDefaults(form,defaults),form);
});
test('saved defaults survive reload and override only new-work licensing fields',()=>{
 const store=storage(),defaults=defaultCreatorDefaults();defaults.enabled=true;defaults.fees.masterIngestionCents=12550;defaults.training='not-authorized';defaults.currency='USD';defaults.share=7500;
 saveCreatorDefaults(store,{...defaults,secret:'do-not-store',wallet:'do-not-store'});const loaded=loadCreatorDefaults(store);
 assert.deepEqual(loaded,defaults);assert.doesNotMatch(store.getItem(CREATOR_DEFAULTS_KEY),/secret|wallet|do-not-store/);
 const form=applyCreatorDefaults({meta:{title:'My work'},cover:{artist:'Artist'}},loaded);
 assert.equal(form.meta.title,'My work');assert.equal(form.cover.artist,'Artist');assert.equal(form.fees.masterIngestionCents,12550);assert.equal(form.training,'not-authorized');assert.equal(form.currency,'USD');assert.equal(form.share,7500);assert.equal(initialContentPolicy(loaded).locked,true);
 form.fees.masterIngestionCents=1;assert.equal(loaded.fees.masterIngestionCents,12550,'Per-work overrides do not mutate saved defaults');
});
test('malformed storage, invalid numeric values and unavailable saves fail safely',()=>{
 for(const raw of ['broken','null','{"version":2,"data":{"enabled":true}}'])assert.equal(loadCreatorDefaults({getItem:()=>raw}).enabled,false);
 const store=storage();const saved=saveCreatorDefaults(store,{enabled:'true',share:-10,fees:{masterIngestionCents:Infinity,writingUseCents:-1},contentPolicy:{locked:'true'}});
 assert.equal(saved.enabled,false);assert.equal(saved.share,10000);assert.equal(saved.fees.writingUseCents,250);
 assert.throws(()=>saveCreatorDefaults(null,{}),/unavailable/);assert.throws(()=>saveCreatorDefaults({setItem:()=>{throw Error('Quota');}},{}),/Quota/);
});
test('default delivery requires a permitted preview and respects manual opt-out and changed explicit consent',()=>{
 const defaults={...defaultCreatorDefaults(),enabled:true};const base={defaults,choice:'default',consent:null,scope:'a',assets:{preview:{hash:'file'}},policy:{preview:true}};
 assert.equal(defaultDeliveryApproved(base),true);
 assert.equal(defaultDeliveryApproved({...base,scope:'updated files'}),true);
 for(const patch of [{assets:{}},{policy:{preview:false}},{choice:'manual'},{defaults:{...defaults,delivery:false}},{defaults:{...defaults,enabled:false}}])assert.equal(defaultDeliveryApproved({...base,...patch}),false);
 assert.equal(defaultDeliveryApproved({...base,choice:'manual',consent:'a'}),true);
 assert.equal(defaultDeliveryApproved({...base,choice:'manual',consent:'a',scope:'changed'}),false);
});
