import test from 'node:test';
import assert from 'node:assert/strict';
import {TAG_FIELDS,checkedEdits,concatBytes,tagHeader,inspectEnvelope,buildEditedCopy,outputName} from '../src/mp3-tool-model.js';
import {runTagTask} from '../src/mp3-tool-task.js';
const frame=(id,body,version=3)=>{const header=new Uint8Array(10);header.set(new TextEncoder().encode(id));if(version===4)header.set(tagHeader(4,body.length).subarray(6),4);else new DataView(header.buffer).setUint32(4,body.length);return concatBytes([header,body]);};
const audio=new Uint8Array([255,251,144,100,0,3,8,17,23]);
const fixture=(version=3)=>{const a=frame('TALB',new Uint8Array([0,65]),version),b=frame('XABC',new Uint8Array([9,7,255,4]),version);return concatBytes([tagHeader(version,a.length+b.length),a,b,audio]);};
test('field edits are allowlisted, bounded and reject control/prototype values',()=>{
 assert.ok(TAG_FIELDS.some(f=>f.key==='album'));assert.ok(TAG_FIELDS.some(f=>f.key==='songwriters'));
 assert.deepEqual(checkedEdits({album:' Álbum ',songwriters:'Writer',isrc:'usabc2612345'}),{album:'Álbum',songwriters:'Writer',isrc:'USABC2612345'});
 for(const value of [null,[],{unknown:'x'},{album:9},{album:'x\0y'},{album:'x'.repeat(2049)},JSON.parse('{"__proto__":"bad"}'),{track:'0'},{track:'5/2'},{track:'2/0'},{year:'2026-09'},{isrc:'bad'}])assert.throws(()=>checkedEdits(value));
 assert.deepEqual(checkedEdits({album:'',year:'2026',disc:'1/2'}),{album:'',year:'2026',disc:'1/2'});
});
test('v2.3/v2.4 assembly retains unknown frames and exact audio payload, without mutating input',()=>{
 for(const v of [3,4]){const b=fixture(v),copy=b.slice(),env=inspectEnvelope(b),replacement=frame('TALB',new Uint8Array([0,66]),v);
 const out=buildEditedCopy(b,env,env.frames.filter(f=>f.id!=='TALB'),[{id:'TALB',bytes:replacement}]);
 assert.deepEqual(b,copy);const after=inspectEnvelope(out);assert.deepEqual(after.audio,audio);assert.deepEqual(after.frames[0].bytes,env.frames[1].bytes);assert.equal(after.frames[1].id,'TALB');assert.equal(after.version,v);}
});
test('unsafe layout or tags fail closed instead of stripping metadata',()=>{
 for(const mutate of [b=>{b[3]=2;},b=>{b[5]=0x80;},b=>{b[6]=0x80;},b=>{b[9]=127;},b=>{b[18]=1;},b=>{b[10]=63;}]){const b=fixture();mutate(b);assert.throws(()=>inspectEnvelope(b));}
 for(const id of ['CHAP','CTOC','SEEK','SIGN']){const f=frame(id,new Uint8Array([0,1]));assert.throws(()=>inspectEnvelope(concatBytes([tagHeader(3,f.length),f,audio])));}
 const ape=new Uint8Array(32);ape.set(new TextEncoder().encode('APETAGEX'));assert.throws(()=>inspectEnvelope(concatBytes([audio,ape])),/APE/);
});
test('tagless and legacy trailer boundaries keep audio bytes intact',()=>{
 const legacy=new Uint8Array(128);legacy.set([84,65,71]);const b=concatBytes([audio,legacy]),env=inspectEnvelope(b);assert.equal(env.legacy,true);assert.deepEqual(env.audio,audio);
 const out=buildEditedCopy(b,env,[],[]);assert.equal(inspectEnvelope(out).legacy,false);assert.deepEqual(inspectEnvelope(out).audio,audio);
 assert.equal(inspectEnvelope(audio).start,0);assert.equal(outputName('path/Álbum.mp3'),'Álbum-tagged.mp3');
});
test('worker jobs terminate on success, timeout, error and cancellation; no hanging reads',async()=>{
 for(const mode of ['success','timeout','error','cancel']){
 let worker,stops=0;const task=runTagTask({mode:'read'},{timeoutMs:10,createWorker:()=>worker={postMessage(){},terminate(){stops++;}}});
 if(mode==='success'){worker.onmessage({data:{ok:true,result:{album:'A'}}});assert.deepEqual(await task.promise,{album:'A'});}
 else if(mode==='error'){worker.onerror({preventDefault(){}});await assert.rejects(task.promise,/worker stopped/);}
 else if(mode==='cancel'){task.cancel();await assert.rejects(task.promise,{name:'AbortError'});}
 else await assert.rejects(task.promise,/timed out/);
 task.cancel();assert.equal(stops,1);
 }
});
