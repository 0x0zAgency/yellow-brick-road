'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const {waitUntil,fixtureDigest,factoryFromFile}=require('./dev-stack.cjs');
const ROOT=path.resolve(__dirname,'..');

test('integrated startup waits for a passing readiness check',async()=>{
 let attempts=0;
 const value=await waitUntil('test',async()=>{attempts++;return attempts>=3&&'ready';},{timeoutMs:1500,intervalMs:10});
 assert.equal(value,'ready');
 assert.equal(attempts,3);
});
test('integrated startup fails on service readiness timeout',async()=>{
 await assert.rejects(waitUntil('not available',async()=>false,{timeoutMs:35,intervalMs:10}),/Timed out/);
});
test('integrated fixture stays byte-identical to the checked YBR demo recording',()=>{
 execFileSync(process.execPath,[path.join(ROOT,'apps/ybr-player/scripts/generate-demo-audio.js')]);
 assert.match(fixtureDigest(),/^[a-f0-9]{64}$/);
 assert.equal(fixtureDigest(),'ee8f1462c64040727cf3863a53a9c73743771045fd17e4c930481d45568e512f');
});
test('factory receipt reader does not invent a deployment',()=>{
 const address=factoryFromFile();
 assert.ok(address===null||/^0x[a-f0-9]{40}$/i.test(address));
});

// Include IPFS lifecycle regressions in npm run test:dev-stack.
require('./dev-ipfs.test.cjs');
require('./dev-dashboard.test.cjs');
require('./dev-player-ready.test.cjs');

require('./dev-title.test.cjs');
